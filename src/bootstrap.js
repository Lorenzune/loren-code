import fs from "node:fs";
import path from "node:path";
import { getEnvFilePath, getLegacyEnvFilePath, getLorenHome, getRuntimeDir } from "./paths.js";

export function ensureRuntimeDir() {
  fs.mkdirSync(getLorenHome(), { recursive: true });
  fs.mkdirSync(getRuntimeDir(), { recursive: true });
  return getRuntimeDir();
}

export function ensureEnvLocal(projectRoot, options = {}) {
  const envLocalPath = getEnvFilePath();
  const legacyEnvPath = getLegacyEnvFilePath(projectRoot);
  const envExamplePath = path.join(projectRoot, ".env.example");
  const logger = options.logger ?? console;
  fs.mkdirSync(getLorenHome(), { recursive: true });

  if (fs.existsSync(envLocalPath)) {
    return { created: false, path: envLocalPath };
  }

  if (fs.existsSync(legacyEnvPath) && legacyEnvPath !== envLocalPath) {
    fs.copyFileSync(legacyEnvPath, envLocalPath);
    logger.warn?.(`Migrated existing config from ${legacyEnvPath} to ${envLocalPath}.`);
    return { created: true, migrated: true, path: envLocalPath };
  }

  if (!fs.existsSync(envExamplePath)) {
    fs.writeFileSync(envLocalPath, "OLLAMA_API_KEYS=\nBRIDGE_HOST=127.0.0.1\nBRIDGE_PORT=8788\n", "utf8");
    logger.warn?.(`Created ${envLocalPath}. Add your Ollama API key(s) before starting the bridge.`);
    return { created: true, path: envLocalPath };
  }

  fs.copyFileSync(envExamplePath, envLocalPath);
  logger.warn?.(`Created ${envLocalPath} from .env.example. Add your real Ollama API key(s) before starting the bridge.`);
  return { created: true, path: envLocalPath };
}

export function getBridgeBaseUrl(config) {
  return `http://${config.host}:${config.port}`;
}
