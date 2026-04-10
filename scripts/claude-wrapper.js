import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ensureEnvLocal, ensureRuntimeDir, getBridgeBaseUrl } from "../src/bootstrap.js";
import { loadConfig } from "../src/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const stateDir = path.join(repoRoot, ".runtime");
const bridgePidPath = path.join(stateDir, "bridge.pid");
const bridgeLogPath = path.join(stateDir, "bridge.log");
const envFilePath = path.join(repoRoot, ".env.local");

async function main() {
  process.chdir(repoRoot);
  ensureRuntimeDir(repoRoot);
  ensureEnvLocal(repoRoot);
  const bridgeConfig = loadConfig();
  const bridgeBaseUrl = getBridgeBaseUrl(bridgeConfig);

  const env = {
    ...process.env,
    ...loadEnvFile(envFilePath),
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || bridgeBaseUrl,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "bridge-local",
    ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN || "",
    CLAUDE_CODE_SKIP_AUTH_LOGIN: process.env.CLAUDE_CODE_SKIP_AUTH_LOGIN || "1",
    CLAUDE_CODE_ENTRYPOINT: process.env.CLAUDE_CODE_ENTRYPOINT || "claude-vscode",
  };

  await ensureBridgeRunning(env, bridgeBaseUrl);

  const claudeExecutable = resolveClaudeExecutable();
  if (process.env.CLAUDE_WRAPPER_TEST === "1") {
    console.log(
      JSON.stringify(
        {
          bridgeUrl: env.ANTHROPIC_BASE_URL,
          executable: claudeExecutable.command,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const child = spawn(claudeExecutable.command, [...claudeExecutable.args, ...process.argv.slice(2)], {
    stdio: "inherit",
    env,
    cwd: process.cwd(),
    windowsHide: false,
  });

  child.on("error", (error) => {
    console.error(`Failed to start Claude executable: ${error.message}`);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

function resolveClaudeExecutable() {
  const override = process.env.CLAUDE_REAL_EXECUTABLE;
  if (override && fs.existsSync(override)) {
    return { command: override, args: [] };
  }

  const candidates = findClaudeExtensionExecutables();
  if (candidates.length > 0) {
    return { command: candidates[0], args: [] };
  }

  return { command: "claude", args: [] };
}

function findClaudeExtensionExecutables() {
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) {
    return [];
  }

  const extensionRoot = path.join(home, ".vscode", "extensions");
  if (!fs.existsSync(extensionRoot)) {
    return [];
  }

  const matches = [];
  for (const entry of fs.readdirSync(extensionRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("anthropic.claude-code-")) {
      continue;
    }

    const candidates = [
      path.join(extensionRoot, entry.name, "resources", "native-binary", "claude.exe"),
      path.join(extensionRoot, entry.name, "resources", "native-binaries", "win32-x64", "claude.exe"),
      path.join(extensionRoot, entry.name, "resources", "native-binaries", "win32-arm64", "claude.exe"),
    ];

    for (const executable of candidates) {
      if (fs.existsSync(executable)) {
        matches.push(executable);
      }
    }
  }

  return matches.sort().reverse();
}

async function ensureBridgeRunning(env, bridgeBaseUrl) {
  if (await isBridgeHealthy(bridgeBaseUrl)) {
    return;
  }

  if (fs.existsSync(bridgePidPath)) {
    try {
      const pid = Number.parseInt(fs.readFileSync(bridgePidPath, "utf8").trim(), 10);
      if (Number.isInteger(pid)) {
        process.kill(pid, 0);
      }
    } catch {
      safeUnlink(bridgePidPath);
    }
  }

  const bridge = spawn(process.execPath, [path.join(repoRoot, "src", "server.js")], {
    cwd: repoRoot,
    env,
    detached: true,
    stdio: ["ignore", fs.openSync(bridgeLogPath, "a"), fs.openSync(bridgeLogPath, "a")],
    windowsHide: true,
  });

  fs.writeFileSync(bridgePidPath, `${bridge.pid}\n`);
  bridge.unref();

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await isBridgeHealthy(bridgeBaseUrl)) {
      return;
    }

    await sleep(400);
  }

  throw new Error(`Bridge did not become healthy. Check ${bridgeLogPath}`);
}

async function isBridgeHealthy(bridgeBaseUrl) {
  try {
    const response = await fetch(`${bridgeBaseUrl}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

function loadEnvFile(filePath) {
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

function safeUnlink(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
