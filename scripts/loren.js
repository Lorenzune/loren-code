#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadConfig, loadEnvFile, saveEnvFile } from "../src/config.js";
import { ensureEnvLocal, ensureRuntimeDir, getBridgeBaseUrl } from "../src/bootstrap.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const envFilePath = path.join(projectRoot, ".env.local");
const runtimeDir = path.join(projectRoot, ".runtime");
const pidFilePath = path.join(runtimeDir, "loren.pid");
const logFilePath = path.join(runtimeDir, "bridge.log");
const errorLogFilePath = path.join(runtimeDir, "bridge.err.log");

// Force working directory to project root for config loading
process.chdir(projectRoot);
ensureRuntimeDir(projectRoot);
ensureEnvLocal(projectRoot);

const ASCII_LOGO = `
██╗      ██████╗ ██████╗ ███████╗███╗   ██╗     ██████╗ ██████╗ ██████╗ ███████╗
██║     ██╔═══██╗██╔══██╗██╔════╝████╗  ██║    ██╔════╝██╔═══██╗██╔══██╗██╔════╝
██║     ██║   ██║██████╔╝█████╗  ██╔██╗ ██║    ██║     ██║   ██║██║  ██║█████╗
██║     ██║   ██║██╔══██╗██╔══╝  ██║╚██╗██║    ██║     ██║   ██║██║  ██║██╔══╝
███████╗╚██████╔╝██║  ██║███████╗██║ ╚████║    ╚██████╗╚██████╔╝██████╔╝███████╗
╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝     ╚═════╝ ╚═════╝ ╚═════╝ ╚══════
`;

const COMMANDS = {
  model: {
    list: listModels,
    set: setModel,
    current: showCurrentModel,
    refresh: refreshModels,
  },
  keys: {
    list: listKeys,
    add: addKey,
    remove: removeKey,
    rotate: rotateKeys,
  },
  config: {
    show: showConfig,
  },
  server: {
    start: startServer,
    stop: stopServer,
    status: showServerStatus,
  },
};

function main() {
  const args = process.argv.slice(2);
  const [command, subcommand, ...rest] = args;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  const [category, action] = command.split(":");

  if (command === "start") {
    startServer();
    return;
  }

  if (command === "stop") {
    stopServer();
    return;
  }

  if (command === "status") {
    showServerStatus();
    return;
  }

  if (category && action && COMMANDS[category] && COMMANDS[category][action]) {
    COMMANDS[category][action](rest);
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

// ============== MODEL COMMANDS ==============

async function listModels() {
  const config = loadConfig();

  try {
    const response = await fetch(`${config.upstreamBaseUrl}/api/tags`, {
      headers: { "accept": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    let models = Array.isArray(data.models) ? data.models : [];

    // Sort by modified date (most recent first)
    models = models.sort((a, b) => {
      const dateA = a.modified_at ? new Date(a.modified_at).getTime() : 0;
      const dateB = b.modified_at ? new Date(b.modified_at).getTime() : 0;
      return dateB - dateA;
    });

    console.log("\nAvailable models from Ollama Cloud:");
    console.log("─".repeat(70));
    console.log("MODEL".padEnd(30) + "SIZE".padStart(12) + "MODIFIED".padStart(12));
    console.log("─".repeat(70));

    for (const model of models) {
      const modelId = model.model || model.name;
      const size = formatSize(model.size);
      const modified = model.modified_at ? new Date(model.modified_at).toLocaleDateString() : "unknown";
      const marker = modelId === config.defaultModel ? "●" : "○";
      console.log(
        `${marker} ${modelId.padEnd(28)}${size.padStart(12)}${modified.padStart(12)}`
      );
    }

    console.log("");
    console.log(`Total: ${models.length} model(s)`);
    console.log(`Current default: ${config.defaultModel}`);
    console.log("");
  } catch (error) {
    console.error(`Error fetching models: ${error.message}`);
    process.exit(1);
  }
}

function formatSize(bytes) {
  if (!bytes) return "unknown";
  const gb = bytes / (1024 ** 3);
  return `${gb.toFixed(1)} GB`;
}

async function refreshModels() {
  const config = loadConfig();
  const url = `http://${config.host}:${config.port}/v1/refresh`;

  console.log(`Sending refresh request to ${url}...`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "accept": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const models = Array.isArray(data.data) ? data.data : [];

    console.log("\n✓ Models refreshed successfully!");
    console.log(`  Fetched ${models.length} model(s) from Ollama Cloud.`);
    console.log("");
  } catch (error) {
    console.error(`Error refreshing models: ${error.message}`);
    console.error("Make sure the server is running: loren start");
    process.exit(1);
  }
}

function setModel(args) {
  const requestedModel = args.join(" ").trim();

  if (!requestedModel) {
    console.error("Error: Specify a model name.");
    console.error("Example: loren model:set qwen3.5:397b");
    process.exit(1);
  }

  const config = loadConfig();

  // Check if it's a valid alias or add it as a new direct model
  const isValidAlias = Object.keys(config.aliases).includes(requestedModel);

  if (!isValidAlias) {
    console.warn(`Warning: '${requestedModel}' is not a configured alias.`);
    console.warn("It will be used as a direct model name.");
  }

  // Update .env.local with new DEFAULT_MODEL_ALIAS
  const envVars = loadEnvFile(envFilePath);
  envVars.DEFAULT_MODEL_ALIAS = requestedModel;
  saveEnvFile(envFilePath, envVars);

  console.log(`\n✓ Default model set to: ${requestedModel}`);
  console.log("  New requests will use this model immediately.");
  console.log("");
}

function showCurrentModel() {
  const config = loadConfig();
  console.log(`\nCurrent default model: ${config.defaultModel}`);
  console.log("");
}

// ============== API KEY COMMANDS ==============

function listKeys() {
  const config = loadConfig();

  console.log("\nConfigured API Keys:");
  console.log("─".repeat(40));

  if (config.apiKeys.length === 0) {
    console.log("  (none configured)");
  } else {
    for (let i = 0; i < config.apiKeys.length; i++) {
      const key = config.apiKeys[i];
      const masked = `${key.slice(0, 4)}...${key.slice(-4)}`;
      const marker = i === 0 ? "●" : "○";
      console.log(`  ${marker} [${i}] ${masked}`);
    }
  }

  console.log("");
  console.log(`Total: ${config.apiKeys.length} key(s)`);
  console.log("");
}

function addKey(args) {
  const newKey = args.join(" ").trim();

  if (!newKey) {
    console.error("Error: Specify an API key.");
    console.error("Example: loren keys:add sk-your-key-here");
    process.exit(1);
  }

  const envVars = loadEnvFile(envFilePath);
  const existingKeys = (envVars.OLLAMA_API_KEYS || "")
    .split(/[,\r?\n]+/)
    .map((k) => k.trim())
    .filter(Boolean);

  if (existingKeys.includes(newKey)) {
    console.log("  Key already exists, skipping.");
    return;
  }

  existingKeys.push(newKey);
  envVars.OLLAMA_API_KEYS = existingKeys.join(",");
  saveEnvFile(envFilePath, envVars);

  console.log(`\n✓ API key added.`);
  console.log(`  Total keys: ${existingKeys.length}`);
  console.log("  New key will be used for subsequent requests.");
  console.log("");
}

function removeKey(args) {
  const indexOrKey = args.join(" ").trim();

  if (!indexOrKey) {
    console.error("Error: Specify key index or the key itself.");
    console.error("Example: loren keys:remove 0");
    console.error("         loren keys:remove sk-xxx...");
    process.exit(1);
  }

  const envVars = loadEnvFile(envFilePath);
  let existingKeys = (envVars.OLLAMA_API_KEYS || "")
    .split(/[,\r?\n]+/)
    .map((k) => k.trim())
    .filter(Boolean);

  let keyToRemove;
  const index = parseInt(indexOrKey, 10);

  if (!isNaN(index) && index >= 0 && index < existingKeys.length) {
    keyToRemove = existingKeys[index];
  } else {
    keyToRemove = existingKeys.find((k) => k === indexOrKey);
  }

  if (!keyToRemove) {
    console.error("Error: Key not found.");
    process.exit(1);
  }

  existingKeys = existingKeys.filter((k) => k !== keyToRemove);
  envVars.OLLAMA_API_KEYS = existingKeys.join(",");
  saveEnvFile(envFilePath, envVars);

  console.log(`\n✓ API key removed.`);
  console.log(`  Remaining keys: ${existingKeys.length}`);
  console.log("");
}

function rotateKeys(args) {
  const envVars = loadEnvFile(envFilePath);
  let existingKeys = (envVars.OLLAMA_API_KEYS || "")
    .split(/[,\r?\n]+/)
    .map((k) => k.trim())
    .filter(Boolean);

  if (existingKeys.length < 2) {
    console.log("Need at least 2 keys to rotate.");
    return;
  }

  // Move first key to the end
  const [first, ...rest] = existingKeys;
  existingKeys = [...rest, first];

  envVars.OLLAMA_API_KEYS = existingKeys.join(",");
  saveEnvFile(envFilePath, envVars);

  console.log("\n✓ API keys rotated.");
  console.log("  First key moved to end of list.");
  console.log("");
}

// ============== CONFIG COMMANDS ==============

function showConfig() {
  const config = loadConfig();

  console.log("\nCurrent Configuration:");
  console.log("─".repeat(40));
  console.log(`  Host:        ${config.host}`);
  console.log(`  Port:        ${config.port}`);
  console.log(`  Upstream:    ${config.upstreamBaseUrl}`);
  console.log(`  API Keys:    ${config.apiKeys.length}`);
  console.log(`  Aliases:     ${Object.keys(config.aliases).length}`);
  console.log(`  Default:     ${config.defaultModel}`);
  console.log("");
}

// ============== SERVER COMMANDS ==============

function startServer() {
  const existingPid = readPidFile();
  if (existingPid && isProcessRunning(existingPid)) {
    const config = loadConfig();
    console.log(`\nLoren server is already running (PID ${existingPid}).`);
    console.log(`  URL: ${getBridgeBaseUrl(config)}`);
    console.log("");
    return;
  }

  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }

  const child = spawn(process.execPath, [path.join(projectRoot, "src", "server.js")], {
    cwd: projectRoot,
    detached: true,
    stdio: [
      "ignore",
      fs.openSync(logFilePath, "a"),
      fs.openSync(errorLogFilePath, "a"),
    ],
    windowsHide: true,
  });

  child.unref();
  const pid = child.pid;

  fs.writeFileSync(pidFilePath, `${pid}\n`, "utf8");

  const config = loadConfig();
  console.log(`\n✓ Loren server started (PID ${pid}).`);
  console.log(`  URL: ${getBridgeBaseUrl(config)}`);
  console.log("");
}

function stopServer() {
  const pid = readPidFile();
  if (!pid) {
    console.log("\nLoren server is not running.");
    console.log("");
    return;
  }

  if (!isProcessRunning(pid)) {
    safeUnlink(pidFilePath);
    console.log(`\nRemoved stale PID file for process ${pid}.`);
    console.log("");
    return;
  }

  try {
    if (process.platform === "win32") {
      execFileSync("taskkill.exe", ["/PID", `${pid}`, "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      process.kill(pid, "SIGINT");
    }

    safeUnlink(pidFilePath);
    console.log(`\n✓ Loren server stopped (PID ${pid}).`);
    console.log("");
  } catch (error) {
    console.error(`Error stopping server: ${error.message}`);
    process.exit(1);
  }
}

function showServerStatus() {
  const config = loadConfig();
  const pid = readPidFile();
  const running = pid ? isProcessRunning(pid) : false;

  console.log("\nServer Status:");
  console.log("─".repeat(40));
  console.log(`  Running:     ${running ? "yes" : "no"}`);
  console.log(`  Host:        ${config.host}`);
  console.log(`  Port:        ${config.port}`);
  console.log(`  URL:         ${getBridgeBaseUrl(config)}`);
  if (pid) {
    console.log(`  PID:         ${pid}${running ? "" : " (stale)"}`);
  }
  console.log("");
}

function readPidFile() {
  if (!fs.existsSync(pidFilePath)) {
    return null;
  }

  const raw = fs.readFileSync(pidFilePath, "utf8").trim();
  const pid = Number.parseInt(raw, 10);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function isProcessRunning(pid) {
  if (process.platform === "win32") {
    try {
      const output = execFileSync("powershell.exe", [
        "-NoProfile",
        "-Command",
        `Get-Process -Id ${pid} -ErrorAction Stop | Select-Object -ExpandProperty Id`,
      ], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();

      return output === `${pid}`;
    } catch {
      return false;
    }
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function safeUnlink(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// ============== HELP ==============

function printHelp() {
  console.log(ASCII_LOGO);
  console.log(`
LOREN CODE - Ollama Cloud Model Manager
────────────────────────────────────────────────────

MODEL COMMANDS:
  loren model:list              Fetch & list models from Ollama Cloud
  loren model:set <name>        Set default model (immediate effect)
  loren model:current           Show current default model
  loren model:refresh           Force refresh models cache

KEY COMMANDS:
  loren keys:list               List configured API keys
  loren keys:add <key>          Add a new API key
  loren keys:remove <idx|key>   Remove a key by index or value
  loren keys:rotate             Rotate keys (move first to end)

CONFIG COMMANDS:
  loren config:show             Show current configuration

SERVER COMMANDS:
  loren start                   Start bridge server (port 8788)
  loren stop                    Stop bridge server
  loren status                  Show bridge server status

EXAMPLES:
  loren model:list
  loren model:set gpt-oss:20b
  loren model:refresh
  loren keys:add sk-ollama-abc123...
  loren keys:remove 0
  loren config:show

TIPS:
  - Model changes take effect immediately for new requests
  - Use model:refresh after changing model to update Claude Code's list
  - Models are sorted by modification date (most recent first)
`);
}

main();
