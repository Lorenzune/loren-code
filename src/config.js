import fs from "node:fs";
import path from "node:path";

const DEFAULT_PORT = 8788;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_UPSTREAM = "https://ollama.com";

export function loadEnvFile(filePath = path.join(process.cwd(), ".env.local")) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const result = {};
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function parseKeyList(value) {
  if (!value) {
    return [];
  }

  return value
    .split(/[,\r?\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseAliasMap(value) {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error("OLLAMA_MODEL_ALIASES must be valid JSON.");
  }
}

export function saveEnvFile(filePath, envVars) {
  const lines = Object.entries(envVars)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  fs.writeFileSync(filePath, `${lines}\n`, "utf8");
}

export function loadConfig() {
  const fileEnv = loadEnvFile();
  const getValue = (name, fallback = undefined) => {
    if (Object.prototype.hasOwnProperty.call(fileEnv, name)) {
      return fileEnv[name];
    }

    if (Object.prototype.hasOwnProperty.call(process.env, name)) {
      return process.env[name];
    }

    return fallback;
  };

  const apiKeys = parseKeyList(getValue("OLLAMA_API_KEYS") || getValue("OLLAMA_API_KEY"));
  const aliases = parseAliasMap(getValue("OLLAMA_MODEL_ALIASES"));

  return {
    host: getValue("BRIDGE_HOST", DEFAULT_HOST),
    port: Number.parseInt(getValue("BRIDGE_PORT", `${DEFAULT_PORT}`), 10),
    upstreamBaseUrl: (getValue("OLLAMA_UPSTREAM_BASE_URL", DEFAULT_UPSTREAM)).replace(/\/+$/, ""),
    apiKeys,
    aliases,
    defaultModel:
      getValue("DEFAULT_MODEL_ALIAS") ||
      "ollama-free-auto",
  };
}
