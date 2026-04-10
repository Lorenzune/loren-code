import http from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { ensureEnvLocal, ensureRuntimeDir } from "./bootstrap.js";
import { getEnvFilePath } from "./paths.js";
import logger from "./logger.js";
import { KeyManager } from "./key-manager.js";
import { validateInput, MessageSchema, CountTokensSchema } from "./schemas.js";
import { modelCache, getFromCache, setInCache, getCacheStats } from "./cache.js";
import { getAgent } from "./http-agents.js";
import { getMetrics, incrementError, recordTokenUsage, metricsMiddleware } from "./metrics.js";
import { createConfigWatcher } from "./config-watcher.js";
import usageTracker from "./usage-tracker.js";

// Global runtime state
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

ensureRuntimeDir();
ensureEnvLocal(projectRoot, { logger });

let config = loadConfig();
let keyManager = new KeyManager(config.apiKeys);
const envFilePath = getEnvFilePath();

function reloadRuntimeConfig() {
  config = loadConfig();
  keyManager = new KeyManager(config.apiKeys);
  usageTracker.syncKeysFromConfig();
  logger.info('Configuration reloaded');
}

// Config watcher
const configWatcher = createConfigWatcher(envFilePath, () => {
  reloadRuntimeConfig();
  void probeAllApiKeys();
});

// Start the watcher
configWatcher.start();

// Cleanup on shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down gracefully...');
  configWatcher.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  configWatcher.stop();
  process.exit(0);
});

if (!config.apiKeys.length) {
  logger.error(`No Ollama API keys found. Set OLLAMA_API_KEYS or OLLAMA_API_KEY in the environment or ${envFilePath}.`);
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  // Apply metrics middleware
  metricsMiddleware(req, res, () => {});

  try {
    await routeRequest(req, res);
  } catch (error) {
    logger.error(`Request handling error: ${error.message}`, { stack: error.stack });
    incrementError('other');
    if (!res.headersSent && !res.writableEnded) {
      sendJson(res, 500, {
        type: "error",
        error: {
          type: "api_error",
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return;
    }

    if (!res.writableEnded) {
      try {
        res.end();
      } catch (endError) {
        logger.error(`Failed to close response after request error: ${endError.message}`);
      }
    }
  }
});

server.listen(config.port, config.host, () => {
  logger.info(`Claude <-> Ollama Cloud bridge listening on http://${config.host}:${config.port}`);
  logger.info(`Upstream: ${config.upstreamBaseUrl}`);
  logger.info(`API Keys loaded: ${config.apiKeys.length}`);
  void probeAllApiKeys();
});

async function routeRequest(req, res) {
  if (!req.url) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  // Request logging
  logger.info(`${req.method} ${url.pathname}`, {
    ip: req.socket.remoteAddress,
    userAgent: req.headers['user-agent']
  });

  // Health check
  if (req.method === "GET" && url.pathname === "/health") {
    await handleHealth(req, res);
    return;
  }

  // Metrics endpoint
  if (req.method === "GET" && url.pathname === "/metrics") {
    await handleMetrics(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/events") {
    await handleEvents(req, res);
    return;
  }

  if (url.pathname === "/api/keys" && (req.method === "POST" || req.method === "DELETE")) {
    await handleKeys(req, res);
    return;
  }

  // Usage API endpoint (GET for data, POST for reset)
  if (url.pathname === "/api/usage" && (req.method === "GET" || req.method === "POST")) {
    await handleUsage(req, res);
    return;
  }

  // Dashboard endpoint
  if (req.method === "GET" && url.pathname === "/dashboard") {
    await handleDashboard(req, res);
    return;
  }

  // Models endpoint
  if (req.method === "GET" && url.pathname === "/v1/models") {
    await handleModels(req, res);
    return;
  }

  // Refresh endpoint - forces fresh fetch from Ollama Cloud
  if (req.method === "POST" && url.pathname === "/v1/refresh") {
    await handleRefresh(req, res);
    return;
  }

  // Messages endpoint
  if (req.method === "POST" && url.pathname === "/v1/messages") {
    await handleMessages(req, res);
    return;
  }

  // Count tokens endpoint
  if (req.method === "POST" && url.pathname === "/v1/messages/count_tokens") {
    await handleCountTokens(req, res);
    return;
  }

  sendJson(res, 404, {
    type: "error",
    error: {
      type: "not_found_error",
      message: `Unsupported route: ${req.method} ${url.pathname}`,
    },
  });
}

async function handleHealth(_req, res) {
  const stats = keyManager.getStats();
  sendJson(res, 200, {
    ok: true,
    uptime: process.uptime(),
    upstream: config.upstreamBaseUrl,
    keysLoaded: config.apiKeys.length,
    keysHealthy: stats.healthy,
    version: process.env.npm_package_version || '0.1.0'
  });
}

async function handleMetrics(_req, res) {
  // Refresh cache stats
  const cacheStats = {
    models: getCacheStats(modelCache, 'models')
  };

  sendJson(res, 200, getMetrics());
}

async function handleRefresh(_req, res) {
  // Invalidate models cache and fetch fresh data
  const cacheKey = 'models_list';
  modelCache.del(cacheKey);

  try {
    const { response: upstream } = await fetchUpstream("/api/tags", {
      method: "GET",
    });

    if (!upstream.ok) {
      await proxyError(upstream, res);
      return;
    }

    const payload = await upstream.json();
    let models = Array.isArray(payload.models) ? payload.models : [];

    // Sort by modified date (most recent first)
    models = models.sort((a, b) => {
      const dateA = a.modified_at ? new Date(a.modified_at).getTime() : 0;
      const dateB = b.modified_at ? new Date(b.modified_at).getTime() : 0;
      return dateB - dateA;
    });

    const data = models.flatMap((model) => {
      const baseId = model.model || model.name;
      if (!baseId) {
        return [];
      }

      const alias = findAliasForModel(baseId);
      const baseRecord = {
        id: baseId,
        type: "model",
        display_name: baseId,
        created_at: model.modified_at || new Date().toISOString(),
      };

      if (!alias) {
        return [baseRecord];
      }

      return [
        {
          ...baseRecord,
          id: alias,
          display_name: `${alias} -> ${baseId}`,
        },
        baseRecord,
      ];
    });

    const response = { data, refreshed: true };

    setInCache(modelCache, cacheKey, response);

    logger.info('Models cache refreshed');
    sendJson(res, 200, response);
  } catch (error) {
    logger.error(`Error refreshing models: ${error.message}`);
    incrementError('upstream');
    sendJson(res, 500, {
      type: "error",
      error: {
        type: "upstream_error",
        message: "Failed to refresh models"
      }
    });
  }
}
function getDashboardState() {
  return {
    usage: usageTracker.getDashboardData(),
    metrics: getMetrics(),
    health: {
      ok: true,
      uptime: process.uptime(),
      upstream: config.upstreamBaseUrl,
      keysLoaded: config.apiKeys.length,
      keysHealthy: keyManager.getStats().healthy,
      version: process.env.npm_package_version || '0.1.0'
    }
  };
}

async function handleEvents(req, res) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });

  const sendState = () => {
    if (res.writableEnded) {
      return;
    }

    res.write(`event: state\n`);
    res.write(`data: ${JSON.stringify(getDashboardState())}\n\n`);
  };

  sendState();
  const interval = setInterval(sendState, 2000);

  req.on("close", () => {
    clearInterval(interval);
    if (!res.writableEnded) {
      res.end();
    }
  });
}

async function handleDashboard(_req, res) {
  try {
    // Resolve the dashboard.html path relative to this module
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const dashboardPath = path.join(__dirname, 'dashboard.html');
    const dashboardHtml = await fs.promises.readFile(dashboardPath, 'utf8');

    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-cache'
    });
    res.end(dashboardHtml);
  } catch (error) {
    logger.error(`Error serving dashboard: ${error.message}`);
    sendJson(res, 500, {
      type: "error",
      error: {
        type: "internal_error",
        message: "Failed to load dashboard"
      }
    });
  }
}

async function handleKeys(req, res) {
  try {
    const body = await readJson(req);
    const key = String(body?.key || "").trim();

    if (!key) {
      sendJson(res, 400, {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "API key is required",
        },
      });
      return;
    }

    if (req.method === "POST") {
      const updatedKeys = Array.from(new Set([...config.apiKeys, key]));
      writeApiKeysToEnvFile(updatedKeys);
      reloadRuntimeConfig();
      await probeSingleApiKey(key);
      sendJson(res, 200, {
        ok: true,
        added: key,
        keysLoaded: config.apiKeys.length,
      });
      return;
    }

    const updatedKeys = config.apiKeys.filter((existingKey) => existingKey !== key);
    writeApiKeysToEnvFile(updatedKeys);
    reloadRuntimeConfig();
    sendJson(res, 200, {
      ok: true,
      removed: key,
      keysLoaded: config.apiKeys.length,
    });
  } catch (error) {
    logger.error(`Error updating API keys: ${error.message}`);
    sendJson(res, 500, {
      type: "error",
      error: {
        type: "internal_error",
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

async function handleUsage(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    // Support reset via query parameter: /api/usage?reset=true
    if (url.searchParams.get('reset') === 'true') {
      usageTracker.resetAll();
      sendJson(res, 200, { ok: true, message: 'Usage data reset successfully' });
      return;
    }

    const usageData = usageTracker.getDashboardData();

    // Add active rate limit details
    const rateLimitedKeys = usageData.keys.filter(k => k.isRateLimited);

    sendJson(res, 200, {
      summary: usageData.summary,
      keys: usageData.keys,
      rateLimits: {
        active: rateLimitedKeys.length,
        keys: rateLimitedKeys.map(k => ({
          key: k.key.substring(0, 20) + '...',
          reason: k.rateLimitReason || 'Rate limit reached',
          resetIn: typeof k.rateLimitResetTime === 'number'
            ? Math.max(0, Math.floor((k.rateLimitResetTime - Date.now()) / 1000))
            : null
        }))
      }
    });
  } catch (error) {
    logger.error(`Error fetching usage data: ${error.message}`);
    incrementError('other');
    sendJson(res, 500, {
      type: "error",
      error: {
        type: "internal_error",
        message: "Failed to fetch usage data"
      }
    });
  }
}

async function handleModels(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  // Force refresh if requested
  const forceRefresh = url.searchParams.get('refresh') === 'true';
  const cacheKey = 'models_list';

  if (!forceRefresh) {
    const cached = getFromCache(modelCache, cacheKey);
    if (cached) {
      sendJson(res, 200, cached);
      return;
    }
  }

  try {
    const { response: upstream } = await fetchUpstream("/api/tags", {
      method: "GET",
    });

    if (!upstream.ok) {
      await proxyError(upstream, res);
      return;
    }

    const payload = await upstream.json();
    let models = Array.isArray(payload.models) ? payload.models : [];

    // Sort by modified date (most recent first)
    models = models.sort((a, b) => {
      const dateA = a.modified_at ? new Date(a.modified_at).getTime() : 0;
      const dateB = b.modified_at ? new Date(b.modified_at).getTime() : 0;
      return dateB - dateA;
    });

    const data = models.flatMap((model) => {
      const baseId = model.model || model.name;
      if (!baseId) {
        return [];
      }

      const alias = findAliasForModel(baseId);
      const baseRecord = {
        id: baseId,
        type: "model",
        display_name: baseId,
        created_at: model.modified_at || new Date().toISOString(),
      };

      if (!alias) {
        return [baseRecord];
      }

      return [
        {
          ...baseRecord,
          id: alias,
          display_name: `${alias} -> ${baseId}`,
        },
        baseRecord,
      ];
    });

    const response = { data };

    // Invalidate cache or save fresh data
    modelCache.del(cacheKey);
    setInCache(modelCache, cacheKey, response);

    sendJson(res, 200, response);
  } catch (error) {
    logger.error(`Error fetching models: ${error.message}`);
    incrementError('upstream');
    sendJson(res, 500, {
      type: "error",
      error: {
        type: "upstream_error",
        message: "Failed to fetch models from upstream"
      }
    });
  }
}

async function handleMessages(req, res) {
  try {
    const body = await readJson(req);

    // Validate input
    const validatedBody = validateInput(MessageSchema, body);

    const anthropicRequest = normalizeAnthropicRequest(validatedBody);
    logger.info(`[bridge] /v1/messages requested_model=${anthropicRequest.requestedModel} resolved_model=${anthropicRequest.model} stream=${anthropicRequest.stream}`);

    const ollamaRequest = anthropicToOllamaRequest(anthropicRequest);

    const { response: upstream, apiKey } = await fetchUpstream("/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(ollamaRequest),
    });

    if (!upstream.ok) {
      await proxyError(upstream, res);
      return;
    }

    if (anthropicRequest.stream) {
      await pipeStreamingResponse(upstream, anthropicRequest, res, apiKey);
      return;
    }

    const payload = await upstream.json();
    const message = ollamaToAnthropicMessage(payload, anthropicRequest.model);

    // Record token usage for the specific API key
    usageTracker.recordUsage(apiKey, message.usage?.output_tokens || 0);
    recordTokenUsage(
      anthropicRequest.model,
      message.usage?.input_tokens || 0,
      message.usage?.output_tokens || 0
    );

    sendJson(res, 200, message);
  } catch (error) {
    if (error.message.includes('Validation failed')) {
      incrementError('validation');
      sendJson(res, 400, {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: error.message
        }
      });
    } else {
      throw error;
    }
  }
}

async function handleCountTokens(req, res) {
  try {
    const body = await readJson(req);
    const validatedBody = validateInput(CountTokensSchema, body);

    const requestedModel = validatedBody.model || config.defaultModel;
    const resolvedModel = resolveModelAlias(requestedModel);
    logger.info(`[bridge] /v1/messages/count_tokens requested_model=${requestedModel} resolved_model=${resolvedModel}`);

    const inputText = JSON.stringify(validatedBody.messages || []);
    const systemText = typeof validatedBody.system === "string" ? validatedBody.system : JSON.stringify(validatedBody.system || "");
    const tokenCount = estimateTokens(`${systemText}\n${inputText}`);

    sendJson(res, 200, { input_tokens: tokenCount });
  } catch (error) {
    if (error.message.includes('Validation failed')) {
      incrementError('validation');
      sendJson(res, 400, {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: error.message
        }
      });
    } else {
      throw error;
    }
  }
}

// Remaining helper functions
function normalizeAnthropicRequest(body) {
  const requestedModel = body.model || config.defaultModel;
  return {
    requestedModel,
    model: resolveModelAlias(requestedModel),
    max_tokens: body.max_tokens || 4096,
    messages: Array.isArray(body.messages) ? body.messages : [],
    system: body.system,
    stream: Boolean(body.stream),
    tools: Array.isArray(body.tools) ? body.tools : [],
    thinking: body.thinking,
  };
}

function anthropicToOllamaRequest(request) {
  return {
    model: request.model,
    stream: request.stream,
    think: request.thinking ? true : undefined,
    tools: request.tools.map((tool) => {
      if (tool.type === "custom") {
        return tool;
      }

      return {
        type: "function",
        function: {
          name: tool.name,
          description: tool.description || "",
          parameters: tool.input_schema || {
            type: "object",
            properties: {},
          },
        },
      };
    }),
    messages: anthropicMessagesToOllamaMessages(request.messages, request.system),
    options: {
      num_predict: request.max_tokens,
    },
  };
}

function anthropicMessagesToOllamaMessages(messages, system) {
  const result = [];

  if (system) {
    if (typeof system === "string") {
      result.push({ role: "system", content: system });
    } else if (Array.isArray(system)) {
      const content = system
        .filter((item) => item?.type === "text")
        .map((item) => item.text)
        .join("\n");

      if (content) {
        result.push({ role: "system", content });
      }
    }
  }

  for (const message of messages) {
    const content = Array.isArray(message.content)
      ? message.content
      : [{ type: "text", text: String(message.content || "") }];

    const textParts = [];
    const toolCalls = [];

    for (const block of content) {
      switch (block.type) {
        case "text":
          textParts.push(block.text || "");
          break;
        case "tool_use":
          toolCalls.push({
            type: "function",
            function: {
              name: block.name,
              arguments: block.input || {},
            },
          });
          break;
        case "tool_result":
          result.push({
            role: "tool",
            tool_name: block.tool_use_id || block.name || "tool",
            content: flattenToolResultContent(block.content),
          });
          break;
        default:
          break;
      }
    }

    const normalized = {
      role: message.role,
      content: textParts.join("\n"),
    };

    if (toolCalls.length) {
      normalized.tool_calls = toolCalls;
    }

    if (normalized.role === "assistant" || normalized.role === "user") {
      result.push(normalized);
    }
  }

  return result;
}

function flattenToolResultContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item?.type === "text") {
          return item.text || "";
        }

        return JSON.stringify(item);
      })
      .join("\n");
  }

  if (content == null) {
    return "";
  }

  return JSON.stringify(content);
}

function ollamaToAnthropicMessage(payload, requestedModel) {
  const toolCalls = Array.isArray(payload.message?.tool_calls) ? payload.message.tool_calls : [];
  const text = payload.message?.content || "";
  const content = [];

  if (text) {
    content.push({
      type: "text",
      text,
    });
  }

  for (const toolCall of toolCalls) {
    const id = `toolu_${randomUUID().replace(/-/g, "")}`;
    content.push({
      type: "tool_use",
      id,
      name: toolCall.function?.name || "tool",
      input: toolCall.function?.arguments || {},
    });
  }

  // Track usage with actual token counts
  const inputTokens = payload.prompt_eval_count || 0;
  const outputTokens = payload.eval_count || 0;

  // The API key is tracked at a higher level for now

  return {
    id: `msg_${randomUUID().replace(/-/g, "")}`,
    type: "message",
    role: "assistant",
    model: requestedModel,
    content,
    stop_reason: toolCalls.length ? "tool_use" : mapDoneReason(payload.done_reason),
    stop_sequence: null,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  };
}

async function pipeStreamingResponse(upstream, request, res, apiKey) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });

  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();

  let buffer = "";
  let started = false;
  let outputTokens = 0;
  let inputTokens = 0;
  let aggregatedText = "";
  let toolCalls = [];

  const messageId = `msg_${randomUUID().replace(/-/g, "")}`;

  emitAnthropicEvent(res, {
    type: "message_start",
    message: {
      id: messageId,
      type: "message",
      role: "assistant",
      model: request.model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
      },
    },
  });

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        try {
          const chunk = JSON.parse(trimmed);
          const message = chunk.message || {};
          inputTokens = chunk.prompt_eval_count || inputTokens;
          outputTokens = chunk.eval_count || outputTokens;

          if (message.content && !started) {
            started = true;
            emitAnthropicEvent(res, {
              type: "content_block_start",
              index: 0,
              content_block: {
                type: "text",
                text: "",
              },
            });
          }

          if (message.content) {
            aggregatedText += message.content;
            emitAnthropicEvent(res, {
              type: "content_block_delta",
              index: 0,
              delta: {
                type: "text_delta",
                text: message.content,
              },
            });
          }

          if (Array.isArray(message.tool_calls) && message.tool_calls.length) {
            toolCalls = message.tool_calls;
          }

          if (chunk.done) {
            if (started) {
              emitAnthropicEvent(res, {
                type: "content_block_stop",
                index: 0,
              });
            }

            let nextIndex = started ? 1 : 0;
            for (const toolCall of toolCalls) {
              const input = toolCall.function?.arguments || {};
              const toolId = `toolu_${randomUUID().replace(/-/g, "")}`;
              emitAnthropicEvent(res, {
                type: "content_block_start",
                index: nextIndex,
                content_block: {
                  type: "tool_use",
                  id: toolId,
                  name: toolCall.function?.name || "tool",
                  input: {},
                },
              });
              emitAnthropicEvent(res, {
                type: "content_block_delta",
                index: nextIndex,
                delta: {
                  type: "input_json_delta",
                  partial_json: JSON.stringify(input),
                },
              });
              emitAnthropicEvent(res, {
                type: "content_block_stop",
                index: nextIndex,
              });
              nextIndex += 1;
            }

            // Record token usage for the specific API key, including streaming responses
            usageTracker.recordUsage(apiKey, outputTokens || estimateTokens(aggregatedText));
            recordTokenUsage(
              request.model,
              inputTokens,
              outputTokens || estimateTokens(aggregatedText)
            );

            emitAnthropicEvent(res, {
              type: "message_delta",
              delta: {
                stop_reason: toolCalls.length ? "tool_use" : mapDoneReason(chunk.done_reason),
                stop_sequence: null,
              },
              usage: {
                output_tokens: outputTokens || estimateTokens(aggregatedText),
              },
            });

            emitAnthropicEvent(res, {
              type: "message_stop",
            });
          }
        } catch (parseError) {
          logger.error(`Error parsing streaming chunk: ${parseError.message}`);
        }
      }
    }
  } catch (error) {
    logger.error(`Streaming error: ${error.message}`);
    if (!res.writableEnded) {
      try {
        emitAnthropicEvent(res, {
          type: "message_delta",
          delta: {
            stop_reason: "end_turn",
            stop_sequence: null,
          },
          usage: {
            output_tokens: outputTokens || estimateTokens(aggregatedText),
          },
        });
        emitAnthropicEvent(res, {
          type: "message_stop",
        });
      } catch (emitError) {
        logger.error(`Failed to emit terminal streaming event: ${emitError.message}`);
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!res.writableEnded) {
    res.end();
  }
}

function emitAnthropicEvent(res, payload) {
  res.write(`event: ${payload.type}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function mapDoneReason(reason) {
  switch (reason) {
    case "stop":
    case "done":
      return "end_turn";
    case "length":
      return "max_tokens";
    default:
      return "end_turn";
  }
}

async function fetchUpstream(pathname, init) {
  // Check for rate-limited keys first and pick the best candidate
  const suggestedKey = usageTracker.suggestNextKey(config.apiKeys);
  if (!suggestedKey) {
    throw new Error('All API keys are rate limited');
  }

  const apiKey = suggestedKey;

  try {
    const response = await performUpstreamFetch(apiKey, pathname, init);

    // Track usage regardless of request success
    usageTracker.recordUsage(apiKey, 0); // Token counts are updated later

    // Handle upstream rate limit responses
    if (response.status === 429) {
      let detailsText = '';
      let reason = 'Rate limit reached';
      let resetTime = null;

      try {
        detailsText = await response.text();
        if (detailsText) {
          try {
            const errorData = JSON.parse(detailsText);
            reason = errorData.error || errorData.message || reason;
            if (typeof errorData.reset_after === 'number') {
              resetTime = Date.now() + (errorData.reset_after * 1000);
            }
          } catch {
            reason = detailsText;
          }
        }
      } catch (parseError) {
        logger.error(`Failed to read rate limit response: ${parseError.message}`);
      }

      usageTracker.markRateLimited(apiKey, resetTime, reason);

      if (typeof resetTime === 'number') {
        logger.warn(`Rate limit detected for key ${apiKey.substring(0, 20)}... Reset in ${Math.ceil((resetTime - Date.now()) / 60000)} minutes`);
      } else {
        logger.warn(`Rate limit detected for key ${apiKey.substring(0, 20)}... Reset time not provided by upstream`);
      }

      return fetchUpstream(pathname, init);
    } else if (!response.ok && response.status >= 500) {
      keyManager.markKeyFailed(apiKey, new Error(`HTTP ${response.status}: ${response.statusText}`));
    } else if (response.ok) {
      usageTracker.markHealthy(apiKey);
    }

    // Return both the response and the API key that was used
    return { response, apiKey };
  } catch (error) {
    keyManager.markKeyFailed(suggestedKey, error);
    usageTracker.markUnhealthy(suggestedKey, error.message);
    throw error;
  }
}

async function performUpstreamFetch(apiKey, pathname, init) {
  const url = `${config.upstreamBaseUrl}${pathname}`;
  const headers = new Headers(init?.headers || {});
  headers.set("accept", headers.get("accept") || "application/json");
  headers.set("authorization", `Bearer ${apiKey}`);

  const agent = getAgent(url);

  return fetch(url, {
    ...init,
    headers,
    agent,
  });
}

function writeApiKeysToEnvFile(keys) {
  const existing = fs.existsSync(envFilePath)
    ? fs.readFileSync(envFilePath, "utf8")
    : "";

  const normalizedKeys = keys.map((entry) => entry.trim()).filter(Boolean);
  const nextLine = `OLLAMA_API_KEYS=${normalizedKeys.join(",")}`;
  const lines = existing.split(/\r?\n/);
  let replaced = false;
  const output = lines.map((line) => {
    if (/^\s*OLLAMA_API_KEYS=/.test(line) || /^\s*OLLAMA_API_KEY=/.test(line)) {
      if (!replaced) {
        replaced = true;
        return nextLine;
      }
      return null;
    }
    return line;
  }).filter((line) => line !== null);

  if (!replaced) {
    output.push(nextLine);
  }

  const content = output.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  fs.writeFileSync(envFilePath, content, "utf8");
}

async function probeSingleApiKey(apiKey) {
  try {
    const response = await performUpstreamFetch(apiKey, "/api/tags", {
      method: "GET",
    });

    if (response.status === 429) {
      let reason = 'Rate limit reached';
      let resetTime = null;

      try {
        const detailsText = await response.text();
        if (detailsText) {
          try {
            const errorData = JSON.parse(detailsText);
            reason = errorData.error || errorData.message || reason;
            if (typeof errorData.reset_after === 'number') {
              resetTime = Date.now() + (errorData.reset_after * 1000);
            }
          } catch {
            reason = detailsText;
          }
        }
      } catch (error) {
        logger.error(`Failed reading probe 429 body: ${error.message}`);
      }

      usageTracker.markRateLimited(apiKey, resetTime, reason);
      return;
    }

    if (!response.ok) {
      const reason = `HTTP ${response.status}: ${response.statusText}`;
      keyManager.markKeyFailed(apiKey, new Error(reason));
      usageTracker.markUnhealthy(apiKey, reason);
      return;
    }

    usageTracker.markHealthy(apiKey);
  } catch (error) {
    keyManager.markKeyFailed(apiKey, error);
    usageTracker.markUnhealthy(apiKey, error.message);
  }
}

async function probeAllApiKeys() {
  logger.info(`Starting API key probe for ${config.apiKeys.length} keys`);

  for (const apiKey of config.apiKeys) {
    await probeSingleApiKey(apiKey);
  }

  logger.info('API key probe completed');
}

async function proxyError(upstream, res) {
  let details;
  try {
    details = await upstream.text();
  } catch {
    details = upstream.statusText;
  }

  logger.error(`Upstream error: ${upstream.status} ${details}`);
  incrementError('upstream');

  sendJson(res, upstream.status, {
    type: "error",
    error: {
      type: "upstream_error",
      message: details || upstream.statusText,
    },
  });
}

async function readJson(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, statusCode, payload) {
  if (res.writableEnded) {
    return;
  }

  if (res.headersSent) {
    try {
      res.end(JSON.stringify(payload));
    } catch {
      // Ignore late-write attempts on already-started responses.
    }
    return;
  }

  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

function resolveModelAlias(model) {
  if (config.aliases[model]) {
    return config.aliases[model];
  }

  const normalized = String(model || "").toLowerCase();

  if (
    normalized === "default" ||
    normalized === "sonnet" ||
    normalized === "opus" ||
    normalized.startsWith("claude-sonnet") ||
    normalized.startsWith("claude-opus")
  ) {
    return config.aliases["ollama-free-auto"] || config.defaultModel;
  }

  if (
    normalized === "haiku" ||
    normalized.startsWith("claude-haiku")
  ) {
    return (
      config.aliases["ollama-free-fast"] ||
      config.aliases["ollama-free-auto"] ||
      config.defaultModel
    );
  }

  return model;
}

function findAliasForModel(model) {
  return Object.entries(config.aliases).find(([, target]) => target === model)?.[0];
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil((text || "").length / 4));
}
