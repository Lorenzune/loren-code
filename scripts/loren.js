#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { execFileSync, spawn } from "node:child_process";
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

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";
const WHITE = "\x1b[97m";
const CLEAR = "\x1b[2J\x1b[H";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";

const ASCII_BANNER_LINES = [
  "██╗      ██████╗ ██████╗ ███████╗███╗   ██╗     ██████╗ ██████╗ ██████╗ ███████╗",
  "██║     ██╔═══██╗██╔══██╗██╔════╝████╗  ██║    ██╔════╝██╔═══██╗██╔══██╗██╔════╝",
  "██║     ██║   ██║██████╔╝█████╗  ██╔██╗ ██║    ██║     ██║   ██║██║  ██║█████╗",
  "██║     ██║   ██║██╔══██╗██╔══╝  ██║╚██╗██║    ██║     ██║   ██║██║  ██║██╔══╝",
  "███████╗╚██████╔╝██║  ██║███████╗██║ ╚████║    ╚██████╗╚██████╔╝██████╔╝███████╗",
  "╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝     ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝",
];

const BANNER_COLORS = [
  "\x1b[38;2;198;218;255m",
  "\x1b[38;2;190;212;255m",
  "\x1b[38;2;181;206;255m",
  "\x1b[38;2;188;201;255m",
  "\x1b[38;2;196;197;255m",
  "\x1b[38;2;205;193;255m",
];

const SUPPORTED_INSTALL_TARGETS = ["windows", "linux"];

const COMMANDS = {
  model: {
    list: listModels,
    set: setModelCommand,
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
    if (process.stdin.isTTY && process.stdout.isTTY) {
      await launchTui({ forceSetup: false });
      return;
    }

    printHelp();
    printQuickSetup(config);
    return;
  }

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "setup") {
    if (process.stdin.isTTY && process.stdout.isTTY) {
      await launchTui({ forceSetup: true });
      return;
    }

    printHelp();
    printQuickSetup(config);
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

async function launchTui(options = {}) {
  const ui = new LorenTui({
    forceSetup: options.forceSetup === true,
  });
  await ui.run();
}

class LorenTui {
  constructor({ forceSetup }) {
    this.forceSetup = forceSetup;
    this.screen = "dashboard";
    this.prompt = "";
    this.models = [];
    this.selectedModelIndex = 0;
    this.selectedKeyIndex = 0;
    this.statusMessage = "";
    this.statusColor = WHITE;
    this.config = loadConfig();
    this.installTarget = getConfiguredInstallTarget();
    this.running = isServerRunning();
    this.shouldExit = false;
    this.setupRequired = forceSetup || this.config.apiKeys.length === 0;
  }

  async run() {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write(HIDE_CURSOR);

    const cleanup = () => {
      process.stdout.write(`${SHOW_CURSOR}${RESET}`);
      try {
        if (process.stdin.isRaw) {
          process.stdin.setRawMode(false);
        }
      } catch {}
      process.stdin.removeAllListeners("keypress");
    };

    const failAndExit = (error) => {
      cleanup();
      process.stdout.write("\n");
      console.error(error instanceof Error ? error.message : String(error));
      this.shouldExit = true;
    };

    process.stdin.on("keypress", async (_str, key) => {
      try {
        await this.handleKeypress(key);
        if (this.shouldExit) {
          cleanup();
          process.stdout.write("\n");
          return;
        }
        this.render();
      } catch (error) {
        failAndExit(error);
      }
    });

    this.enterInitialScreen();
    this.render();

    await new Promise((resolve) => {
      const interval = setInterval(() => {
        if (this.shouldExit) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });
  }

  enterInitialScreen() {
    if (this.setupRequired) {
      this.enterSetupPlatform();
      return;
    }

    this.screen = "dashboard";
    this.setStatus("", WHITE);
  }

  render() {
    const sections = [];
    sections.push(renderBanner());

    let footerItems = ["[S] Start/Stop", "[M] Models", "[K] Keys", "[W] Setup", "[C] Claude", "[R] Refresh", "[Q] Quit"];
    if (this.screen.startsWith("setup_")) {
      sections.push(renderSetupHeader(this.statusMessage, this.statusColor));
      sections.push(this.renderSetupBody());
      footerItems = this.screen === "setup_platform"
        ? ["[W] Windows", "[L] Linux", "[Esc] Quit"]
        : ["[Enter] Confirm", "[Esc] Quit"];
    } else if (this.screen === "keys") {
      sections.push(renderDashboardHeader(this.config, this.running, this.statusMessage, this.statusColor));
      sections.push(this.renderKeysBody());
      footerItems = ["[Up/Down] Select", "[A] Add", "[D] Remove", "[T] Rotate", "[Esc] Back", "[Q] Quit"];
    } else if (this.screen === "keys_add") {
      sections.push(renderDashboardHeader(this.config, this.running, this.statusMessage, this.statusColor));
      sections.push(this.renderAddKeyBody());
      footerItems = ["[Enter] Save key", "[Esc] Back"];
    } else if (this.screen === "models") {
      sections.push(renderDashboardHeader(this.config, this.running, this.statusMessage, this.statusColor));
      sections.push(this.renderModelsBody());
      footerItems = ["[Up/Down] Select", "[Enter] Set model", "[Esc] Back", "[R] Refresh", "[Q] Quit"];
    } else {
      sections.push(renderDashboardHeader(this.config, this.running, this.statusMessage, this.statusColor));
      sections.push(this.renderDashboardBody());
    }

    const body = sections.join("\n");
    const footer = renderFooter(footerItems);
    process.stdout.write(renderScreen(body, footer));
  }

  renderDashboardBody() {
    return [
      box("Bridge", [
        `Status   ${this.running ? color("Running", GREEN) : color("Stopped", YELLOW)}`,
        `URL      ${getBridgeBaseUrl(this.config)}`,
        `Model    ${this.config.defaultModel}`,
      ]),
      "",
      box("Keys", [
        `Loaded   ${this.config.apiKeys.length}`,
        `Home     ${lorenHome}`,
        `Claude   ${describeClaudeTarget(this.installTarget)}`,
      ]),
      "",
      box("Actions", [
        "Press S to start or stop the bridge",
        "Press M to browse models and change the default",
        "Press K to manage API keys",
        "Press W to reopen setup",
        "Press C to install Claude Code integration",
      ]),
    ].join("\n");
  }

  renderKeysBody() {
    const lines = [];
    lines.push(box("API Keys", [
      "Manage the keys Loren rotates through.",
      "Add, remove, or rotate without leaving the terminal UI.",
    ]));
    lines.push("");

    if (!this.config.apiKeys.length) {
      lines.push("No keys configured yet. Press A to add your first key.");
      return lines.join("\n");
    }

    lines.push("Configured keys:");
    lines.push("-".repeat(74));
    lines.push(`  ${pad("KEY", 44)}POSITION`);
    lines.push("-".repeat(74));

    for (let index = 0; index < this.config.apiKeys.length; index += 1) {
      const key = this.config.apiKeys[index];
      const selected = index === this.selectedKeyIndex;
      const prefix = selected ? color(">", CYAN) : " ";
      const marker = index === 0 ? color("*", GREEN) : "o";
      const masked = `${key.slice(0, 8)}...${key.slice(-6)}`;
      const position = index === 0 ? "active first key" : `slot ${index + 1}`;
      lines.push(`${prefix} ${marker} ${pad(masked, 40)}${position}`);
    }

    return lines.join("\n");
  }

  renderAddKeyBody() {
    return [
      box("Add API Key", [
        "Paste a new Ollama API key and press Enter.",
        color("Empty input is not allowed here either.", DIM),
      ]),
      "",
      `${CYAN}> ${this.prompt}${RESET}`,
    ].join("\n");
  }

  renderModelsBody() {
    const lines = [];
    lines.push(box("Model Picker", [
      "Pick a model with the arrow keys and press Enter.",
      "This updates Loren immediately.",
    ]));
    lines.push("");

    if (!this.models.length) {
      lines.push("No models loaded yet. Press R to refresh.");
      return lines.join("\n");
    }

    lines.push("Available models:");
    lines.push("-".repeat(74));
    lines.push(`  ${pad("MODEL", 34)}${pad("SIZE", 12)}MODIFIED`);
    lines.push("-".repeat(74));

    for (let index = 0; index < this.models.length; index += 1) {
      const model = this.models[index];
      const modelId = model.model || model.name;
      const selected = index === this.selectedModelIndex;
      const active = modelId === this.config.defaultModel;
      const prefix = selected ? color(">", CYAN) : " ";
      const marker = active ? color("*", GREEN) : "o";
      const size = formatSize(model.size);
      const modified = model.modified_at ? new Date(model.modified_at).toLocaleDateString() : "unknown";
      lines.push(`${prefix} ${marker} ${pad(modelId, 30)}${pad(size, 12)}${modified}`);
    }

    return lines.join("\n");
  }

  renderSetupBody() {
    if (this.screen === "setup_platform") {
      return [
        box("Step 1 of 5 - Operating System", [
          "Choose the machine where Claude Code should be wired.",
          color("Press W for Windows or L for Linux.", DIM),
        ]),
        "",
        `${CYAN}> ${formatInstallTargetChoice(this.installTarget)}${RESET}`,
      ].join("\n");
    }

    if (this.screen === "setup_keys") {
      return [
        box("Step 2 of 5 - API Keys", [
          "Paste one or more Ollama API keys, separated by commas.",
          color("Keys are required before Loren can continue.", DIM),
        ]),
        "",
        `${CYAN}> ${this.prompt}${RESET}`,
      ].join("\n");
    }

    if (this.screen === "setup_claude") {
      return [
        box("Step 3 of 5 - Claude Code", [
          "Do you want Loren to wire Claude Code automatically?",
          color(`Recommended for ${this.installTarget}.`, DIM),
        ]),
        "",
        `${CYAN}> ${this.prompt || "Y"}${RESET}`,
      ].join("\n");
    }

    if (this.screen === "setup_models") {
      return [
        box("Step 4 of 5 - Default Model", [
          "Choose the default model Loren should use.",
          color("Use Up/Down and press Enter.", DIM),
        ]),
        "",
        this.renderModelsBody(),
      ].join("\n");
    }

    if (this.screen === "setup_start") {
      return [
        box("Step 5 of 5 - Start Bridge", [
          "Everything is ready.",
          color("Start the bridge now?", DIM),
        ]),
        "",
        `${CYAN}> ${this.prompt || "Y"}${RESET}`,
      ].join("\n");
    }

    return "";
  }

  async handleKeypress(key) {
    if (!key) {
      return;
    }

    if (key.ctrl && key.name === "c") {
      this.shouldExit = true;
      return;
    }

    if (this.screen.startsWith("setup_")) {
      await this.handleSetupKeypress(key);
      return;
    }

    if (this.screen === "keys") {
      await this.handleKeysKeypress(key);
      return;
    }

    if (this.screen === "keys_add") {
      await this.handleAddKeyKeypress(key);
      return;
    }

    if (this.screen === "models") {
      await this.handleModelsKeypress(key);
      return;
    }

    await this.handleDashboardKeypress(key);
  }

  async handleDashboardKeypress(key) {
    switch ((key.name || "").toLowerCase()) {
      case "q":
      case "escape":
        this.shouldExit = true;
        return;
      case "s":
        if (this.running) {
          stopServer();
          this.running = false;
          this.setStatus("Bridge stopped.", GREEN);
        } else {
          startServer({ quiet: true });
          this.running = true;
          this.setStatus("Bridge started.", GREEN);
        }
        this.config = loadConfig();
        return;
      case "m":
        await this.loadModels();
        this.screen = "models";
        return;
      case "k":
        this.enterKeysScreen();
        return;
      case "w":
        this.enterSetupPlatform();
        return;
      case "c":
        installClaudeIntegration({ quiet: true, targetPlatform: this.installTarget });
        this.setStatus(`Claude Code integration installed for ${this.installTarget}.`, GREEN);
        return;
      case "r":
        this.refreshRuntime();
        this.setStatus("Dashboard refreshed.", CYAN);
        return;
      default:
        return;
    }
  }

  async handleKeysKeypress(key) {
    switch ((key.name || "").toLowerCase()) {
      case "escape":
      case "q":
        this.screen = "dashboard";
        return;
      case "up":
        if (this.config.apiKeys.length) {
          this.selectedKeyIndex = (this.selectedKeyIndex - 1 + this.config.apiKeys.length) % this.config.apiKeys.length;
        }
        return;
      case "down":
        if (this.config.apiKeys.length) {
          this.selectedKeyIndex = (this.selectedKeyIndex + 1) % this.config.apiKeys.length;
        }
        return;
      case "a":
        this.screen = "keys_add";
        this.prompt = "";
        this.setStatus("Paste the key and press Enter.", CYAN);
        return;
      case "d":
        if (!this.config.apiKeys.length) {
          this.setStatus("No keys to remove yet.", YELLOW);
          return;
        }
        {
          const removed = removeConfiguredKeyByIndex(this.selectedKeyIndex);
          this.refreshRuntime();
          this.selectedKeyIndex = Math.min(this.selectedKeyIndex, Math.max(0, this.config.apiKeys.length - 1));
          this.setStatus(`Removed key ${removed}.`, GREEN);
        }
        return;
      case "t":
        if (this.config.apiKeys.length < 2) {
          this.setStatus("You need at least two keys to rotate.", YELLOW);
          return;
        }
        rotateConfiguredKeys();
        this.refreshRuntime();
        this.selectedKeyIndex = 0;
        this.setStatus("Keys rotated. The lead key took a coffee break.", GREEN);
        return;
      default:
        return;
    }
  }

  async handleAddKeyKeypress(key) {
    if ((key.name || "").toLowerCase() === "escape") {
      this.enterKeysScreen();
      return;
    }

    if ((key.name || "").toLowerCase() === "backspace") {
      this.prompt = this.prompt.slice(0, -1);
      return;
    }

    if ((key.name || "").toLowerCase() === "return") {
      const newKey = this.prompt.trim();
      if (!newKey) {
        this.setStatus("A real key is required here.", RED);
        return;
      }

      const added = addConfiguredKey(newKey);
      this.refreshRuntime();
      this.selectedKeyIndex = Math.max(0, this.config.apiKeys.indexOf(newKey));
      this.enterKeysScreen();
      this.setStatus(added ? "New key saved." : "That key was already in the list.", GREEN);
      return;
    }

    if (key.sequence && !key.ctrl && !key.meta) {
      this.prompt += key.sequence;
    }
  }

  async handleModelsKeypress(key) {
    switch ((key.name || "").toLowerCase()) {
      case "escape":
      case "q":
        this.screen = "dashboard";
        return;
      case "up":
        if (this.models.length) {
          this.selectedModelIndex = (this.selectedModelIndex - 1 + this.models.length) % this.models.length;
        }
        return;
      case "down":
        if (this.models.length) {
          this.selectedModelIndex = (this.selectedModelIndex + 1) % this.models.length;
        }
        return;
      case "return":
        if (this.models.length) {
          this.applySelectedModel();
        }
        return;
      case "r":
        await this.loadModels();
        return;
      default:
        return;
    }
  }

  async handleSetupKeypress(key) {
    if (this.screen === "setup_platform") {
      const name = (key.name || "").toLowerCase();
      if (name === "escape") {
        this.shouldExit = true;
        return;
      }
      if (name === "w") {
        saveInstallTarget("windows");
        this.installTarget = "windows";
        this.setStatus("Target system set to windows.", GREEN);
        this.enterSetupKeys();
        return;
      }
      if (name === "l") {
        saveInstallTarget("linux");
        this.installTarget = "linux";
        this.setStatus("Target system set to linux.", GREEN);
        this.enterSetupKeys();
        return;
      }
      return;
    }

    if (this.screen === "setup_models") {
      await this.handleSetupModelsKeypress(key);
      return;
    }

    if ((key.name || "").toLowerCase() === "escape") {
      this.shouldExit = true;
      return;
    }

    if ((key.name || "").toLowerCase() === "backspace") {
      this.prompt = this.prompt.slice(0, -1);
      return;
    }

    if ((key.name || "").toLowerCase() === "return") {
      await this.commitSetupPrompt();
      return;
    }

    if (key.sequence && !key.ctrl && !key.meta) {
      this.prompt += key.sequence;
    }
  }

  async handleSetupModelsKeypress(key) {
    switch ((key.name || "").toLowerCase()) {
      case "escape":
        this.shouldExit = true;
        return;
      case "up":
        if (this.models.length) {
          this.selectedModelIndex = (this.selectedModelIndex - 1 + this.models.length) % this.models.length;
        }
        return;
      case "down":
        if (this.models.length) {
          this.selectedModelIndex = (this.selectedModelIndex + 1) % this.models.length;
        }
        return;
      case "return":
        if (this.models.length) {
          this.applySelectedModel();
          this.enterSetupStart();
        }
        return;
      default:
        return;
    }
  }

  async commitSetupPrompt() {
    if (this.screen === "setup_keys") {
      const keys = splitKeyList(this.prompt);
      if (!keys.length) {
        this.setStatus("At least one API key is required to continue.", RED);
        return;
      }

      const envVars = loadEnvFile(envFilePath);
      envVars.OLLAMA_API_KEYS = keys.join(",");
      saveEnvFile(envFilePath, envVars);
      this.refreshRuntime();
      this.setStatus(`Saved ${keys.length} API key(s).`, GREEN);
      this.enterSetupClaude();
      return;
    }

    if (this.screen === "setup_claude") {
      const answer = (this.prompt || "y").trim().toLowerCase();
      if (answer === "" || answer === "y" || answer === "yes") {
        installClaudeIntegration({ quiet: true, targetPlatform: this.installTarget });
        this.setStatus(`Claude Code integration installed for ${this.installTarget}.`, GREEN);
      } else {
        this.setStatus("Skipping Claude Code integration for now.", YELLOW);
      }
      await this.enterSetupModels();
      return;
    }

    if (this.screen === "setup_start") {
      const answer = (this.prompt || "y").trim().toLowerCase();
      if (answer === "" || answer === "y" || answer === "yes") {
        startServer({ quiet: true });
        this.running = true;
        this.setStatus("Bridge started. Setup complete.", GREEN);
      } else {
        this.running = isServerRunning();
        this.setStatus("Setup complete. Start the bridge any time with S.", GREEN);
      }
      this.refreshRuntime();
      this.setupRequired = false;
      this.screen = "dashboard";
    }
  }

  enterSetupPlatform() {
    this.screen = "setup_platform";
    this.prompt = this.installTarget;
    this.setStatus("Welcome. Let's choose your target system first.", CYAN);
  }

  enterSetupKeys() {
    this.screen = "setup_keys";
    this.prompt = "";
  }

  enterSetupClaude() {
    this.screen = "setup_claude";
    this.prompt = "Y";
  }

  enterKeysScreen() {
    this.refreshRuntime();
    this.screen = "keys";
    if (this.config.apiKeys.length === 0) {
      this.selectedKeyIndex = 0;
    } else {
      this.selectedKeyIndex = Math.min(this.selectedKeyIndex, this.config.apiKeys.length - 1);
    }
  }

  async enterSetupModels() {
    await this.loadModels();
    this.screen = "setup_models";
  }

  enterSetupStart() {
    this.screen = "setup_start";
    this.prompt = "Y";
  }

  async loadModels() {
    const { models } = await fetchAvailableModels();
    this.models = models;
    const activeIndex = this.models.findIndex((model) => (model.model || model.name) === this.config.defaultModel);
    this.selectedModelIndex = activeIndex >= 0 ? activeIndex : 0;
  }

  applySelectedModel() {
    const modelId = this.models[this.selectedModelIndex].model || this.models[this.selectedModelIndex].name;
    setDefaultModel(modelId);
    this.refreshRuntime();
    this.setStatus(`Default model set to ${modelId}.`, GREEN);
  }

  refreshRuntime() {
    this.config = loadConfig();
    this.installTarget = getConfiguredInstallTarget();
    this.running = isServerRunning();
  }

  setStatus(message, color = WHITE) {
    this.statusMessage = message;
    this.statusColor = color;
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
  const models = Array.isArray(data.models) ? data.models : [];
  models.sort((a, b) => {
    const dateA = a.modified_at ? new Date(a.modified_at).getTime() : 0;
    const dateB = b.modified_at ? new Date(b.modified_at).getTime() : 0;
    return dateB - dateA;
  });

  return { config, models };
}

async function listModels() {
  const { config, models } = await fetchAvailableModels();

  console.log("\nAvailable models from Ollama Cloud:");
  console.log("-".repeat(74));
  console.log(`  ${pad("MODEL", 34)}${pad("SIZE", 12)}MODIFIED`);
  console.log("-".repeat(74));

  if (!models.length) {
    console.log("  No models available right now.");
  } else {
    models.forEach((model) => {
      const modelId = model.model || model.name;
      const marker = modelId === config.defaultModel ? "*" : "o";
      const size = formatSize(model.size);
      const modified = model.modified_at ? new Date(model.modified_at).toLocaleDateString() : "unknown";
      console.log(`  ${marker} ${pad(modelId, 30)}${pad(size, 12)}${modified}`);
    });
  }

  console.log("");
  console.log(`Total: ${models.length} model(s)`);
  console.log(`Current default: ${config.defaultModel}`);
  console.log("");
}

async function refreshModels() {
  await listModels();
  console.log("Model list refreshed.");
  console.log("");
}

function setModelCommand(args) {
  const requestedModel = args.join(" ").trim();
  if (!requestedModel) {
    console.error("Please specify a model name.");
    console.error("Example: loren model:set qwen3.5:397b");
    process.exit(1);
  }

  const model = setDefaultModel(requestedModel);
  console.log(`\nDefault model set to ${model}.`);
  console.log("Fresh requests will use it right away.");
  if (fs.existsSync(claudeSettingsPath)) {
    console.log("Claude Code settings were updated too.");
  }
  console.log("");
}

function setDefaultModel(requestedModel) {
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

function showConfig() {
  const config = loadConfig();
  console.log("\nCurrent configuration:");
  console.log("-".repeat(40));
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
  console.log("-".repeat(40));
  console.log(`  Home:        ${lorenHome}`);
  console.log(`  Config:      ${envFilePath}`);
  console.log(`  Runtime:     ${runtimeDir}`);
  console.log("");
}

function listKeys() {
  const keys = getConfiguredKeys();
  console.log("\nConfigured API keys:");
  console.log("-".repeat(40));
  if (!keys.length) {
    console.log("  none yet");
  } else {
    keys.forEach((key, index) => {
      const masked = `${key.slice(0, 4)}...${key.slice(-4)}`;
      const marker = index === 0 ? "*" : "o";
      console.log(`  ${marker} [${index}] ${masked}`);
    });
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

  addConfiguredKey(newKey);
  const existingKeys = getConfiguredKeys();

  console.log(`\nKey added. Total keys: ${existingKeys.length}`);
  console.log("");
}

function removeKey(args) {
  const indexOrKey = args.join(" ").trim();
  if (!indexOrKey) {
    console.error("Please specify a key index or the full key.");
    process.exit(1);
  }

  removeConfiguredKey(indexOrKey);
  const existingKeys = getConfiguredKeys();
  console.log(`\nKey removed. Remaining keys: ${existingKeys.length}`);
  console.log("");
}

function rotateKeys() {
  const existingKeys = getConfiguredKeys();
  if (existingKeys.length < 2) {
    console.log("You need at least two keys to rotate.");
    return;
  }

  rotateConfiguredKeys();
  console.log("\nKeys rotated. The first one took a well-earned break.");
  console.log("");
}

function startServer(options = {}) {
  const quiet = options.quiet === true;
  const existingPid = readPidFile();
  if (existingPid && isProcessRunning(existingPid)) {
    if (!quiet) {
      console.log("\nLoren is already running.");
      console.log(`URL: ${getBridgeBaseUrl(loadConfig())}`);
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
    console.log("\nLoren is up and listening.");
    console.log(`URL: ${getBridgeBaseUrl(loadConfig())}`);
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
  const running = isServerRunning();
  console.log("\nServer status:");
  console.log("-".repeat(40));
  console.log(`  Running:     ${running ? "yes" : "no"}`);
  console.log(`  Host:        ${config.host}`);
  console.log(`  Port:        ${config.port}`);
  console.log(`  URL:         ${getBridgeBaseUrl(config)}`);
  console.log("");
}

function isServerRunning() {
  const pid = readPidFile();
  return pid ? isProcessRunning(pid) : false;
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

function installClaudeIntegration(options = {}) {
  const quiet = options.quiet === true;
  const targetPlatform = normalizeInstallTarget(options.targetPlatform) || getConfiguredInstallTarget();

  try {
    if (targetPlatform === "windows") {
      if (process.platform !== "win32") {
        throw new Error("Windows integration was selected, but this machine is not running Windows.");
      }

      const scriptPath = path.join(projectRoot, "scripts", "install-claude-ollama.ps1");
      execFileSync("powershell.exe", ["-ExecutionPolicy", "Bypass", "-File", scriptPath], {
        stdio: quiet ? "ignore" : "inherit",
      });
      return;
    }

    if (targetPlatform === "linux") {
      if (process.platform === "win32") {
        throw new Error("Linux integration was selected. Run Loren on the Linux machine you want to configure.");
      }

      const scriptPath = path.join(projectRoot, "scripts", "install-claude-ollama.sh");
      execFileSync("sh", [scriptPath], {
        stdio: quiet ? "ignore" : "inherit",
      });
      return;
    }

    throw new Error(`Unsupported install target: ${targetPlatform}`);
  } catch (error) {
    throw new Error(`Couldn't install Claude integration automatically: ${error.message}`);
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

function splitKeyList(raw = "") {
  return raw
    .split(/[,\r?\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getConfiguredKeys() {
  const envVars = loadEnvFile(envFilePath);
  return splitKeyList(envVars.OLLAMA_API_KEYS);
}

function getConfiguredInstallTarget() {
  const envVars = loadEnvFile(envFilePath);
  return normalizeInstallTarget(envVars.CLAUDE_INSTALL_TARGET) || getDefaultInstallTarget();
}

function getDefaultInstallTarget() {
  return process.platform === "win32" ? "windows" : "linux";
}

function normalizeInstallTarget(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return SUPPORTED_INSTALL_TARGETS.includes(normalized) ? normalized : null;
}

function saveInstallTarget(target) {
  const envVars = loadEnvFile(envFilePath);
  envVars.CLAUDE_INSTALL_TARGET = target;
  saveEnvFile(envFilePath, envVars);
}

function saveConfiguredKeys(keys) {
  const envVars = loadEnvFile(envFilePath);
  envVars.OLLAMA_API_KEYS = keys.join(",");
  saveEnvFile(envFilePath, envVars);
}

function addConfiguredKey(newKey) {
  const keys = getConfiguredKeys();
  if (keys.includes(newKey)) {
    return false;
  }
  keys.push(newKey);
  saveConfiguredKeys(keys);
  return true;
}

function removeConfiguredKey(indexOrKey) {
  const keys = getConfiguredKeys();
  let keyToRemove = null;
  const index = Number.parseInt(indexOrKey, 10);
  if (!Number.isNaN(index) && index >= 0 && index < keys.length) {
    keyToRemove = keys[index];
  } else {
    keyToRemove = keys.find((key) => key === indexOrKey) || null;
  }

  if (!keyToRemove) {
    throw new Error("Key not found.");
  }

  const nextKeys = keys.filter((key) => key !== keyToRemove);
  saveConfiguredKeys(nextKeys);
  return `${keyToRemove.slice(0, 4)}...${keyToRemove.slice(-4)}`;
}

function removeConfiguredKeyByIndex(index) {
  return removeConfiguredKey(String(index));
}

function rotateConfiguredKeys() {
  const keys = getConfiguredKeys();
  if (keys.length < 2) {
    return false;
  }

  const [first, ...rest] = keys;
  saveConfiguredKeys([...rest, first]);
  return true;
}

function safeUnlink(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function printHelp() {
  printBanner();
  printCommandSummary();
}

function printQuickSetup(config) {
  printBanner();
  if (config.apiKeys.length > 0) {
    console.log(`Welcome back, ${displayName}.`);
    console.log(`${config.apiKeys.length} key(s) loaded.`);
    console.log(`${GREEN}Run \`loren\` to open the full terminal UI.${RESET}`);
  } else {
    console.log(`Welcome, ${displayName}.`);
    console.log(`${YELLOW}Run \`loren\` in an interactive terminal to finish setup.${RESET}`);
  }
  console.log("");
}

function printCommandSummary() {
  console.log("Commands:");
  console.log("  loren                      Open the full terminal UI");
  console.log("  loren setup                Reopen guided setup");
  console.log("  loren start                Start the bridge");
  console.log("  loren stop                 Stop the bridge");
  console.log("  loren status               Show bridge status");
  console.log("  loren model:list           List models");
  console.log("  loren model:set <name>     Set the default model");
  console.log("  loren keys:add <key>       Add an API key");
  console.log("  loren keys:remove <value>  Remove an API key");
  console.log("  loren keys:rotate          Rotate configured keys");
  console.log("  loren keys:list            List API keys");
  console.log("  loren config:show          Show current config");
  console.log("");
}

function renderBanner() {
  const banner = ASCII_BANNER_LINES
    .map((line, index) => `${BANNER_COLORS[index] || ""}${line}${RESET}`)
    .join("\n");
  const linkLine = "github.com/lorenzune/loren-code - npmjs.com/package/loren-code";
  return `${banner}\n${DIM}${centerText(linkLine, 88)}${RESET}\n\n${CYAN}${BOLD}LOREN CODE${RESET}\n${DIM}Smarter bridge, fewer rituals.${RESET}\n`;
}

function printBanner() {
  console.log(renderBanner());
}

function renderDashboardHeader(config, running, statusMessage, statusColor) {
  const lines = [];
  lines.push(`${CYAN}${centerText(`Welcome back, ${displayName} :)`, 88)}${RESET}`);
  if (statusMessage) {
    lines.push(`${statusColor}${statusMessage}${RESET}`);
  }
  lines.push("");
  return lines.join("\n");
}

function describeClaudeTarget(target) {
  return `${target} installer ready`;
}

function renderSetupHeader(statusMessage, statusColor) {
  const lines = [];
  if (envStatus.migrated) {
    lines.push(`${MAGENTA}Previous Loren settings were imported automatically.${RESET}`);
  } else if (envStatus.created) {
    lines.push(`${GREEN}A fresh config is ready.${RESET}`);
  }
  lines.push(`${CYAN}Welcome, ${displayName}.${RESET}`);
  lines.push(`${GREEN}Let's get Loren ready in one smooth pass.${RESET}`);
  if (statusMessage) {
    lines.push(`${statusColor}${statusMessage}${RESET}`);
  }
  lines.push("");
  return lines.join("\n");
}

function renderFooter(items) {
  return `${DIM}${"-".repeat(78)}${RESET}\n${items.join(`${DIM}  *  ${RESET}`)}\n`;
}

function renderScreen(body, footer) {
  const rows = Number.isInteger(process.stdout.rows) ? process.stdout.rows : 40;
  const bodyLines = countRenderedLines(body);
  const footerLines = countRenderedLines(footer);
  const paddingLines = Math.max(0, rows - bodyLines - footerLines);
  const padding = paddingLines > 0 ? `${"\n".repeat(paddingLines)}` : "";
  return `${CLEAR}${body}${padding}\n${footer}`;
}

function box(title, lines) {
  const width = 74;
  const top = `+- ${title}${"-".repeat(Math.max(0, width - title.length - 3))}+`;
  const body = lines.map((line) => `| ${pad(stripAnsi(line), width - 2)}|`).join("\n");
  const bottom = `+${"-".repeat(width)}+`;
  return `${top}\n${body}\n${bottom}`;
}

function pad(value, width) {
  const text = String(value ?? "");
  return text.length >= width ? `${text.slice(0, width - 3)}...` : text.padEnd(width);
}

function formatSize(bytes) {
  if (!bytes) {
    return "unknown";
  }
  const gb = bytes / (1024 ** 3);
  return `${gb.toFixed(1)} GB`;
}

function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-9;]*m/g, "");
}

function countRenderedLines(text) {
  return stripAnsi(text).split("\n").length;
}

function color(text, ansi) {
  return `${ansi}${text}${RESET}`;
}

function centerText(text, width) {
  const value = String(text ?? "");
  if (value.length >= width) {
    return value;
  }
  const leftPadding = Math.floor((width - value.length) / 2);
  return `${" ".repeat(leftPadding)}${value}`;
}

function formatInstallTargetChoice(target) {
  return target === "linux" ? "[L] Linux" : "[W] Windows";
}

function getDisplayName() {
  const explicit = process.env.USERNAME || process.env.USER;
  if (explicit && explicit.trim()) {
    return explicit.trim();
  }
  const baseName = path.basename(userHome || "").trim();
  return baseName || "there";
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
