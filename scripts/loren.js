#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync, spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { loadConfig, loadEnvFile, saveEnvFile } from "../src/config.js";
import { ensureEnvLocal, ensureRuntimeDir, getBridgeBaseUrl } from "../src/bootstrap.js";
import { getEnvFilePath, getLorenHome, getRuntimeDir } from "../src/paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const lorenHome = getLorenHome();
const envFilePath = getEnvFilePath();
const runtimeDir = getRuntimeDir();
const pidFilePath = path.join(runtimeDir, "loren.pid");
const logFilePath = path.join(runtimeDir, "bridge.log");
const errorLogFilePath = path.join(runtimeDir, "bridge.err.log");
const userHome = process.env.USERPROFILE || process.env.HOME || projectRoot;
const claudeSettingsPath = path.join(userHome, ".claude", "settings.json");
const displayName = getDisplayName();

process.chdir(projectRoot);
ensureRuntimeDir();
const envStatus = ensureEnvLocal(projectRoot, { logger: { warn() {} } });

const ASCII_BANNER_LINES = [
  "██╗      ██████╗ ██████╗ ███████╗███╗   ██╗     ██████╗ ██████╗ ██████╗ ███████╗",
  "██║     ██╔═══██╗██╔══██╗██╔════╝████╗  ██║    ██╔════╝██╔═══██╗██╔══██╗██╔════╝",
  "██║     ██║   ██║██████╔╝█████╗  ██╔██╗ ██║    ██║     ██║   ██║██║  ██║█████╗",
  "██║     ██║   ██║██╔══██╗██╔══╝  ██║╚██╗██║    ██║     ██║   ██║██║  ██║██╔══╝",
  "███████╗╚██████╔╝██║  ██║███████╗██║ ╚████║    ╚██████╗╚██████╔╝██████╔╝███████╗",
  "╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝     ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝",
];
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";
const RESET = "\x1b[0m";
const BANNER_COLORS = [
  "\x1b[38;2;198;218;255m",
  "\x1b[38;2;190;212;255m",
  "\x1b[38;2;181;206;255m",
  "\x1b[38;2;188;201;255m",
  "\x1b[38;2;196;197;255m",
  "\x1b[38;2;205;193;255m",
];

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
    paths: showPaths,
  },
  server: {
    start: startServer,
    stop: stopServer,
    status: showServerStatus,
  },
};

async function main() {
  const args = process.argv.slice(2);
  const [command] = args;
  const config = loadConfig();

  if (!command) {
    await runSetupWizard(config);
    return;
  }

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "setup") {
    await runSetupWizard(config);
    return;
  }

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

  const [category, action] = command.split(":");
  if (category && action && COMMANDS[category] && COMMANDS[category][action]) {
    await COMMANDS[category][action](args.slice(1));
    return;
  }

  console.error(`Unknown command: ${command}`);
  console.log("");
  console.log("Run `loren help` if the command goblin struck again.");
  process.exit(1);
}

async function listModels() {
  try {
    const { config, models } = await fetchAvailableModels();

    console.log("\nAvailable models from Ollama Cloud:");
    console.log("─".repeat(70));
    console.log("MODEL".padEnd(30) + "SIZE".padStart(12) + "MODIFIED".padStart(12));
    console.log("─".repeat(70));

    for (const model of models) {
      const modelId = model.model || model.name;
      const size = formatSize(model.size);
      const modified = model.modified_at ? new Date(model.modified_at).toLocaleDateString() : "unknown";
      const marker = modelId === config.defaultModel ? "●" : "○";
      console.log(`${marker} ${modelId.padEnd(28)}${size.padStart(12)}${modified.padStart(12)}`);
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
  if (!bytes) {
    return "unknown";
  }

  const gb = bytes / (1024 ** 3);
  return `${gb.toFixed(1)} GB`;
}

async function refreshModels() {
  const config = loadConfig();
  const url = `${getBridgeBaseUrl(config)}/v1/refresh`;

  console.log("Refreshing the model list...");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const models = Array.isArray(data.data) ? data.data : [];

    console.log(`\nDone. Fetched ${models.length} model(s).`);
    console.log("");
  } catch (error) {
    console.error(`Error refreshing models: ${error.message}`);
    console.error("Tip: start the bridge first with `loren start`.");
    process.exit(1);
  }
}

function setModel(args) {
  const requestedModel = args.join(" ").trim();

  if (!requestedModel) {
    console.error("Please specify a model name.");
    console.error("Example: loren model:set qwen3.5:397b");
    process.exit(1);
  }

  const config = loadConfig();
  const isValidAlias = Object.keys(config.aliases).includes(requestedModel);

  if (!isValidAlias) {
    console.warn(`Using '${requestedModel}' as a direct model name.`);
  }

  const envVars = loadEnvFile(envFilePath);
  envVars.DEFAULT_MODEL_ALIAS = requestedModel;
  saveEnvFile(envFilePath, envVars);
  syncClaudeSelectedModel(requestedModel);

  return requestedModel;
}

function showCurrentModel() {
  const config = loadConfig();
  console.log(`\nCurrent default model: ${config.defaultModel}`);
  console.log("");
}

function listKeys() {
  const config = loadConfig();

  console.log("\nConfigured API keys:");
  console.log("─".repeat(40));

  if (config.apiKeys.length === 0) {
    console.log("  none yet");
  } else {
    for (let i = 0; i < config.apiKeys.length; i += 1) {
      const key = config.apiKeys[i];
      const masked = `${key.slice(0, 4)}...${key.slice(-4)}`;
      const marker = i === 0 ? "●" : "○";
      console.log(`  ${marker} [${i}] ${masked}`);
    }
  }

  console.log("");
}

function addKey(args) {
  const newKey = args.join(" ").trim();

  if (!newKey) {
    console.error("Please specify an API key.");
    console.error("Example: loren keys:add sk-your-key-here");
    process.exit(1);
  }

  const envVars = loadEnvFile(envFilePath);
  const existingKeys = splitKeyList(envVars.OLLAMA_API_KEYS);

  if (existingKeys.includes(newKey)) {
    console.log("That key is already there. Loren noticed before I did.");
    return;
  }

  existingKeys.push(newKey);
  envVars.OLLAMA_API_KEYS = existingKeys.join(",");
  saveEnvFile(envFilePath, envVars);

  console.log(`\nKey added. Total keys: ${existingKeys.length}`);
  console.log("");
}

function removeKey(args) {
  const indexOrKey = args.join(" ").trim();

  if (!indexOrKey) {
    console.error("Please specify a key index or the full key.");
    console.error("Example: loren keys:remove 0");
    process.exit(1);
  }

  const envVars = loadEnvFile(envFilePath);
  let existingKeys = splitKeyList(envVars.OLLAMA_API_KEYS);

  let keyToRemove;
  const index = Number.parseInt(indexOrKey, 10);
  if (!Number.isNaN(index) && index >= 0 && index < existingKeys.length) {
    keyToRemove = existingKeys[index];
  } else {
    keyToRemove = existingKeys.find((key) => key === indexOrKey);
  }

  if (!keyToRemove) {
    console.error("Key not found.");
    process.exit(1);
  }

  existingKeys = existingKeys.filter((key) => key !== keyToRemove);
  envVars.OLLAMA_API_KEYS = existingKeys.join(",");
  saveEnvFile(envFilePath, envVars);

  console.log(`\nKey removed. Remaining keys: ${existingKeys.length}`);
  console.log("");
}

function rotateKeys() {
  const envVars = loadEnvFile(envFilePath);
  let existingKeys = splitKeyList(envVars.OLLAMA_API_KEYS);

  if (existingKeys.length < 2) {
    console.log("You need at least two keys to rotate.");
    return;
  }

  const [first, ...rest] = existingKeys;
  existingKeys = [...rest, first];
  envVars.OLLAMA_API_KEYS = existingKeys.join(",");
  saveEnvFile(envFilePath, envVars);

  console.log("\nKeys rotated. The first one took a well-earned break.");
  console.log("");
}

function splitKeyList(raw = "") {
  return raw
    .split(/[,\r?\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function showConfig() {
  const config = loadConfig();

  console.log("\nCurrent configuration:");
  console.log("─".repeat(40));
  console.log(`  Host:        ${config.host}`);
  console.log(`  Port:        ${config.port}`);
  console.log(`  Upstream:    ${config.upstreamBaseUrl}`);
  console.log(`  API Keys:    ${config.apiKeys.length}`);
  console.log(`  Aliases:     ${Object.keys(config.aliases).length}`);
  console.log(`  Default:     ${config.defaultModel}`);
  console.log("");
}

function showPaths() {
  console.log("\nLoren paths:");
  console.log("─".repeat(40));
  console.log(`  Home:        ${lorenHome}`);
  console.log(`  Config:      ${envFilePath}`);
  console.log(`  Runtime:     ${runtimeDir}`);
  console.log("");
}

function startServer(options = {}) {
  const quiet = options.quiet === true;
  const existingPid = readPidFile();
  if (existingPid && isProcessRunning(existingPid)) {
    const config = loadConfig();
    if (!quiet) {
      console.log("\nLoren is already running.");
      console.log(`URL: ${getBridgeBaseUrl(config)}`);
      console.log("");
    }
    return;
  }

  fs.mkdirSync(runtimeDir, { recursive: true });

  const child = spawn(process.execPath, [path.join(projectRoot, "src", "server.js")], {
    cwd: projectRoot,
    detached: true,
    stdio: ["ignore", fs.openSync(logFilePath, "a"), fs.openSync(errorLogFilePath, "a")],
    windowsHide: true,
  });

  child.unref();
  fs.writeFileSync(pidFilePath, `${child.pid}\n`, "utf8");

  if (!quiet) {
    const config = loadConfig();
    console.log("\nLoren is up and listening.");
    console.log(`URL: ${getBridgeBaseUrl(config)}`);
    console.log("");
  }
}

function stopServer() {
  const pid = readPidFile();
  if (!pid) {
    console.log("\nLoren is not running.");
    console.log("");
    return;
  }

  if (!isProcessRunning(pid)) {
    safeUnlink(pidFilePath);
    console.log("\nCleaned up a stale PID file.");
    console.log("");
    return;
  }

  try {
    if (process.platform === "win32") {
      execFileSync("taskkill.exe", ["/PID", `${pid}`, "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(pid, "SIGINT");
    }

    safeUnlink(pidFilePath);
    console.log("\nLoren stopped cleanly.");
    console.log("");
  } catch (error) {
    console.error(`Error stopping Loren: ${error.message}`);
    process.exit(1);
  }
}

function showServerStatus() {
  const config = loadConfig();
  const pid = readPidFile();
  const running = pid ? isProcessRunning(pid) : false;

  console.log("\nServer status:");
  console.log("─".repeat(40));
  console.log(`  Running:     ${running ? "yes" : "no"}`);
  console.log(`  Host:        ${config.host}`);
  console.log(`  Port:        ${config.port}`);
  console.log(`  URL:         ${getBridgeBaseUrl(config)}`);
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
      const output = execFileSync(
        "powershell.exe",
        ["-NoProfile", "-Command", `Get-Process -Id ${pid} -ErrorAction Stop | Select-Object -ExpandProperty Id`],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim();
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

function syncClaudeSelectedModel(model) {
  const settingsDir = path.dirname(claudeSettingsPath);
  fs.mkdirSync(settingsDir, { recursive: true });

  let settings = {};
  if (fs.existsSync(claudeSettingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(claudeSettingsPath, "utf8").replace(/^\uFEFF/, ""));
    } catch {
      settings = {};
    }
  }

  const availableModels = Array.isArray(settings.availableModels) ? settings.availableModels : [];
  if (!availableModels.includes(model)) {
    settings.availableModels = [model, ...availableModels];
  }

  settings.model = model;
  fs.writeFileSync(claudeSettingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

async function runSetupWizard(config) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    printHelp();
    printQuickSetup(config);
    return;
  }

  if (config.apiKeys.length > 0) {
    printWelcomeBack(config);
    return;
  }

  printWizardIntro();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const keys = await promptForApiKeys(rl);
    const envVars = loadEnvFile(envFilePath);
    envVars.OLLAMA_API_KEYS = keys.join(",");
    saveEnvFile(envFilePath, envVars);
    console.log(`${GREEN}✓ Saved ${keys.length} API key(s).${RESET}`);
    console.log("");

    if (process.platform === "win32") {
      const installClaude = (await askQuestion(rl, "Install Claude Code integration too? [Y/n] ")).trim().toLowerCase();
      if (installClaude === "" || installClaude === "y" || installClaude === "yes") {
        installClaudeIntegration();
        console.log(`${GREEN}✓ Claude Code integration installed.${RESET}`);
        console.log("");
      } else {
        console.log("\nNo problem. You can wire Claude in later.");
      }
    }

    await promptForModelSelection(rl);

    const startNow = (await askQuestion(rl, "Start the bridge now? [Y/n] ")).trim().toLowerCase();
    if (startNow === "" || startNow === "y" || startNow === "yes") {
      startServer({ quiet: true });
      console.log(`${GREEN}✓ Bridge started.${RESET}`);
      console.log("");
    }

    console.log(`${GREEN}Setup complete. Fewer steps, fewer goblins.${RESET}`);
    console.log("");
  } finally {
    rl.close();
  }
}

function printWizardIntro() {
  printBanner();
  if (envStatus.migrated) {
    console.log(`${MAGENTA}Your previous settings were imported automatically.${RESET}`);
  } else if (envStatus.created) {
    console.log(`${GREEN}A fresh config is ready.${RESET}`);
  }
  console.log(`${CYAN}Welcome${displayName ? `, ${displayName}` : ""}.${RESET}`);
  console.log(`${YELLOW}Run \`loren\` in an interactive terminal to finish setup.${RESET}`);
  console.log(`${GREEN}Let's get Loren ready in one quick pass.${RESET}`);
  console.log("");
}

function printWelcomeBack(config) {
  printBanner();
  console.log(`Welcome back${displayName ? `, ${displayName}` : ""}.`);
  console.log(`${config.apiKeys.length} key(s) loaded.`);
  console.log(`Current default model: ${config.defaultModel}`);
  console.log(`${GREEN}Run \`loren start\` to launch the bridge.${RESET}`);
  console.log("");
  printCommandSummary();
}

function printQuickSetup(config) {
  if (config.apiKeys.length > 0) {
    printWelcomeBack(config);
    return;
  }

  printBanner();
  console.log(`Welcome${displayName ? `, ${displayName}` : ""}.`);
  console.log(`${YELLOW}Run \`loren\` in an interactive terminal to finish setup.${RESET}`);
  console.log("");
  printCommandSummary();
  console.log("Quick start:");
  console.log("  1. Run `loren` in an interactive terminal");
  console.log("  2. Add your Ollama API key(s)");
  console.log("  3. Start the bridge");
  console.log("");
}

function installClaudeIntegration() {
  const scriptPath = path.join(projectRoot, "scripts", "install-claude-ollama.ps1");

  try {
    execFileSync("powershell.exe", ["-ExecutionPolicy", "Bypass", "-File", scriptPath], {
      stdio: "inherit",
    });
  } catch (error) {
    console.error(`Couldn't install Claude integration automatically: ${error.message}`);
  }
}

async function promptForApiKeys(rl) {
  while (true) {
    const rawKeys = (await askQuestion(rl, "Paste your Ollama API key(s), separated by commas: ")).trim();
    const keys = splitKeyList(rawKeys);

    if (keys.length > 0) {
      return keys;
    }

    console.log(`${RED}At least one API key is required to continue.${RESET}`);
    console.log("");
  }
}

async function promptForModelSelection(rl) {
  try {
    const { models } = await fetchAvailableModels();

    console.log("Available models:");
    console.log("─".repeat(70));
    for (const model of models) {
      const modelId = model.model || model.name;
      const size = formatSize(model.size);
      const modified = model.modified_at ? new Date(model.modified_at).toLocaleDateString() : "unknown";
      console.log(`${modelId.padEnd(30)}${size.padStart(12)}${modified.padStart(12)}`);
    }
    console.log("");

    while (true) {
      const requestedModel = (await askQuestion(rl, "Choose the default model: ")).trim();
      const match = models.find((model) => (model.model || model.name) === requestedModel);

      if (!requestedModel) {
        console.log(`${RED}Please choose a model from the list above.${RESET}`);
        console.log("");
        continue;
      }

      if (!match) {
        console.log(`${RED}That model is not in the current list.${RESET}`);
        console.log("");
        continue;
      }

      const model = setModel([requestedModel]);
      console.log(`${GREEN}✓ Default model set to ${model}.${RESET}`);
      console.log("");
      return;
    }
  } catch (error) {
    console.log(`${RED}Couldn't load models right now: ${error.message}${RESET}`);
    console.log(`${RED}Please fix your keys and run \`loren model:list\` after setup.${RESET}`);
    console.log("");
    throw error;
  }
}

async function fetchAvailableModels() {
  const config = loadConfig();
  const response = await fetch(`${config.upstreamBaseUrl}/api/tags`, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  let models = Array.isArray(data.models) ? data.models : [];
  models = models.sort((a, b) => {
    const dateA = a.modified_at ? new Date(a.modified_at).getTime() : 0;
    const dateB = b.modified_at ? new Date(b.modified_at).getTime() : 0;
    return dateB - dateA;
  });

  return { config, models };
}

function askQuestion(rl, prompt) {
  return rl.question(`${CYAN}${prompt}${RESET}`);
}

function printHelp() {
  printBanner();
  printCommandSummary();
}

function printCommandSummary() {
  console.log("Commands:");
  console.log("  loren setup                 Run the setup wizard");
  console.log("  loren start                 Start the bridge");
  console.log("  loren stop                  Stop the bridge");
  console.log("  loren status                Show bridge status");
  console.log("  loren model:list            List models");
  console.log("  loren model:set <name>      Set the default model");
  console.log("  loren model:current         Show the current model");
  console.log("  loren model:refresh         Refresh cached models");
  console.log("  loren keys:list             List API keys");
  console.log("  loren keys:add <key>        Add an API key");
  console.log("  loren keys:remove <value>   Remove an API key");
  console.log("  loren keys:rotate           Rotate configured keys");
  console.log("  loren config:show           Show current config");
  console.log("  loren config:paths          Show Loren paths");
  console.log("");
  console.log("Examples:");
  console.log("  loren");
  console.log("  loren start");
  console.log("  loren model:set gpt-oss:20b");
  console.log("");
}

function getDisplayName() {
  const explicit = process.env.USERNAME || process.env.USER;
  if (explicit && explicit.trim()) {
    return explicit.trim();
  }

  const baseName = path.basename(userHome || "").trim();
  return baseName || "";
}

function printBanner() {
  const coloredBanner = ASCII_BANNER_LINES
    .map((line, index) => `${BANNER_COLORS[index] || ""}${line}${RESET}`)
    .join("\n");

  console.log(coloredBanner);
  console.log("");
  console.log(`${CYAN}LOREN CODE${RESET}`);
  console.log("Smarter bridge, fewer rituals.");
  console.log("");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
