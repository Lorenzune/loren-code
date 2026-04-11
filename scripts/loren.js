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
const packageJsonPath = path.join(projectRoot, "package.json");
const userHome = process.env.USERPROFILE || process.env.HOME || projectRoot;
const claudeSettingsPath = path.join(userHome, ".claude", "settings.json");
const displayName = getDisplayName();
const packageVersion = getPackageVersion();

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

const CODE_BANNER_LINES = [
  "  ██████╗ ██████╗ ██████╗ ███████╗  ",
  " ██╔════╝██╔═══██╗██╔══██╗██╔════╝  ",
  " ██║     ██║   ██║██║  ██║█████╗    ",
  " ██║     ██║   ██║██║  ██║██╔══╝    ",
  " ╚██████╗╚██████╔╝██████╔╝███████╗  ",
  "  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝  ",
];

const PANEL_LOREN_LINES = [
  "   ██╗      ██████╗ ██████╗ ███████╗███╗   ██╗   ",
  "   ██║     ██╔═══██╗██╔══██╗██╔════╝████╗  ██║   ",
  "   ██║     ██║   ██║██████╔╝█████╗  ██╔██╗ ██║   ",
  "   ██║     ██║   ██║██╔══██╗██╔══╝  ██║╚██╗██║   ",
  "   ███████╗╚██████╔╝██║  ██║███████╗██║ ╚████║   ",
  "   ╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝   ",
];

const PANEL_GRADIENT_COLORS = [
  "\x1b[38;2;224;230;255m",
  "\x1b[38;2;212;220;255m",
  "\x1b[38;2;198;212;255m",
  "\x1b[38;2;190;208;255m",
  "\x1b[38;2;180;198;255m",
  "\x1b[38;2;170;188;255m",
];

const WELCOME_GRADIENT_COLORS = [
  "\x1b[38;2;255;236;163m",
  "\x1b[38;2;255;226;130m",
  "\x1b[38;2;255;215;97m",
  "\x1b[38;2;245;202;82m",
];
const SUCCESS_GRADIENT_COLORS = [
  "\x1b[38;2;185;255;207m",
  "\x1b[38;2;139;243;179m",
  "\x1b[38;2;92;227;149m",
  "\x1b[38;2;58;199;121m",
];
const ERROR_GRADIENT_COLORS = [
  "\x1b[38;2;255;186;186m",
  "\x1b[38;2;255;145;145m",
  "\x1b[38;2;244;104;104m",
  "\x1b[38;2;225;74;74m",
];
const INFO_GRADIENT_COLORS = [
  "\x1b[38;2;198;218;255m",
  "\x1b[38;2;177;207;255m",
  "\x1b[38;2;156;195;255m",
  "\x1b[38;2;136;184;255m",
];
const WARN_GRADIENT_COLORS = [
  "\x1b[38;2;255;232;173m",
  "\x1b[38;2;255;214;120m",
  "\x1b[38;2;248;195;86m",
  "\x1b[38;2;227;174;63m",
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
    this.modelScrollOffset = 0;
    this.selectedInstallTargetIndex = 0;
    this.selectedConfirmIndex = 0;
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
    let footerItems = null;

    if (this.screen.startsWith("setup_")) {
      sections.push(renderSetupHero(this.screen));
      sections.push(renderSetupHeader(this.statusMessage, this.statusColor));
      sections.push(this.renderSetupBody());
      footerItems = this.screen === "setup_platform"
        ? ["[Up/Down] Select", "[Enter] Confirm", "[Esc] Quit"]
        : this.screen === "setup_keys"
          ? ["[Tab] Next key", "[Enter] Confirm", "[Esc] Quit"]
          : this.screen === "setup_models"
            ? ["[Up/Down] Select", "[Enter] Confirm", "[R] Refresh", "[Esc] Quit"]
            : ["[Enter] Confirm", "[Esc] Quit"];
    } else if (this.screen === "keys") {
      sections.push(renderDashboardHeader(this.config, this.running, this.statusMessage, this.statusColor));
      sections.push(this.renderKeysBody());
      footerItems = ["[Up/Down] Select", "[A] Add", "[D] Remove", "[T] Rotate", "[Esc] Back"];
    } else if (this.screen === "keys_add") {
      sections.push(renderDashboardHeader(this.config, this.running, this.statusMessage, this.statusColor));
      sections.push(this.renderAddKeyBody());
      footerItems = ["[Enter] Save", "[Esc] Back"];
    } else if (this.screen === "models") {
      sections.push(renderDashboardHeader(this.config, this.running, this.statusMessage, this.statusColor));
      sections.push(this.renderModelsBody());
      footerItems = ["[Up/Down] Select", "[Enter] Set model", "[R] Refresh", "[Esc] Back"];
    } else {
      sections.push(renderDashboardHeader(this.config, this.running, this.statusMessage, this.statusColor));
      sections.push(this.renderDashboardBody());
    }

    const body = sections.join("\n");
    const footer = footerItems ? renderFooter(footerItems) : "";
    process.stdout.write(renderScreen(body, footer));
  }

  renderDashboardBody() {
    return [
      gradientBox("Actions", [
        renderActionLine("S", "start or stop the bridge", 48),
        renderActionLine("M", "browse models and change the default", 48),
        renderActionLine("K", "manage API keys", 48),
        renderActionLine("W", "reopen setup", 48),
        renderActionLine("C", "install Claude Code integration", 48),
        renderActionLine("R", "refresh Loren status", 48),
        renderActionLine("Q", "quit Loren", 48),
      ]),
    ].join("\n");
  }

  renderKeysBody() {
    const lines = [];
    lines.push(gradientBox("Keys", [
      "Manage the API keys Loren rotates through.",
      "Keep the active pool clean and ready.",
    ]));
    lines.push("");

    if (!this.config.apiKeys.length) {
      lines.push(gradientBox("Configured Keys", [
        "No keys configured yet.",
        "Press A to add your first key.",
      ]));
      return lines.join("\n");
    }

    const keyLines = [];
    keyLines.push(`  ${pad("KEY", 44)}POSITION`);
    keyLines.push(" ".repeat(74).replace(/ /g, "─"));

    for (let index = 0; index < this.config.apiKeys.length; index += 1) {
      const key = this.config.apiKeys[index];
      const selected = index === this.selectedKeyIndex;
      const prefix = selected ? color(">", CYAN) : " ";
      const marker = index === 0 ? color("*", GREEN) : "o";
      const masked = `${key.slice(0, 8)}...${key.slice(-6)}`;
      const position = index === 0 ? "active first key" : `slot ${index + 1}`;
      keyLines.push(`${prefix} ${marker} ${pad(masked, 40)}${position}`);
    }

    lines.push(gradientBox("Configured Keys", keyLines, 74));

    return lines.join("\n");
  }

  renderAddKeyBody() {
    return [
      gradientBox("Add API Key", [
        "Paste a new Ollama API key and press Enter.",
        color("Empty input is not allowed here either.", DIM),
        color("Press Enter to save, or Esc to go back.", DIM),
      ]),
      "",
      `${CYAN}> ${fitInlineInput(this.prompt, 72)}${RESET}`,
    ].join("\n");
  }

  renderModelsBody() {
    const lines = [];
    lines.push(gradientBox("Models", [
      "Pick a model with the arrow keys and press Enter.",
      "This updates Loren immediately.",
    ]));
    lines.push("");

    if (!this.models.length) {
      lines.push(gradientBox("Available Models", [
        "No models loaded yet.",
        "Press R to refresh.",
      ], 74));
      return lines.join("\n");
    }

    const modelLines = [];
    modelLines.push(`  ${pad("MODEL", 34)}${pad("SIZE", 12)}MODIFIED`);
    modelLines.push(" ".repeat(74).replace(/ /g, "─"));

    const { start, end } = this.getVisibleModelRange();
    for (let index = start; index < end; index += 1) {
      const model = this.models[index];
      const modelId = model.model || model.name;
      const selected = index === this.selectedModelIndex;
      const active = modelId === this.config.defaultModel;
      const prefix = selected ? color(">", CYAN) : " ";
      const marker = active ? color("*", GREEN) : "o";
      const size = formatSize(model.size);
      const modified = model.modified_at ? new Date(model.modified_at).toLocaleDateString() : "unknown";
      modelLines.push(`${prefix} ${marker} ${pad(modelId, 30)}${pad(size, 12)}${modified}`);
    }

    if (start > 0 || end < this.models.length) {
      modelLines.push("");
      modelLines.push(
        color(
          `Showing ${start + 1}-${end} of ${this.models.length} models`,
          DIM,
        ),
      );
    }

    lines.push(gradientBox("Available Models", modelLines, 74));

    return lines.join("\n");
  }

  renderSetupBody() {
    if (this.screen === "setup_platform") {
      return [
        gradientBox("Step 1 of 5 - Operating System", [
          "Choose the machine where Claude Code should be wired.",
          color("Choose your system and continue.", DIM),
        ]),
        "",
        this.renderInstallTargetBody(),
      ].join("\n");
    }

    if (this.screen === "setup_keys") {
      return [
        gradientBox("Step 2 of 5 - API Keys", [
          "Paste your Ollama API keys one by one.",
          color("Add at least one key to continue.", DIM),
        ]),
        "",
        this.renderSetupKeysInput(),
      ].join("\n");
    }

    if (this.screen === "setup_claude") {
      return [
        gradientBox("Step 3 of 5 - Claude Code", [
          "Do you want Loren to wire Claude Code automatically?",
          color(`Recommended for ${this.installTarget}.`, DIM),
        ]),
        "",
        this.renderConfirmChoiceBody(),
      ].join("\n");
    }

    if (this.screen === "setup_models") {
      return [
        gradientBox("Step 4 of 5 - Default Model", [
          "Choose the default model Loren should use.",
          color("Pick one model to continue.", DIM),
        ]),
        "",
        this.renderModelsBody(),
      ].join("\n");
    }

    if (this.screen === "setup_start") {
      return [
        gradientBox("Step 5 of 5 - Start Bridge", [
          "Everything is ready.",
          color("Start the bridge now?", DIM),
        ]),
        "",
        this.renderConfirmChoiceBody(),
      ].join("\n");
    }

    return "";
  }

  renderSetupKeysInput() {
    const rawLines = String(this.prompt || "").split("\n");
    const visibleLines = rawLines.length ? rawLines : [""];
    if (visibleLines.length === 1 && visibleLines[0] === "") {
      return `${CYAN}> ${BOLD}${fitInlineInput("", 72)}${RESET}`;
    }

    return visibleLines
      .map((line, index) => {
        const isActiveLine = index === visibleLines.length - 1;
        const prefix = isActiveLine ? `${CYAN}>${RESET}` : `${DIM}-${RESET}`;
        const content = fitInlineInput(line, 72);
        if (isActiveLine) {
          return `${prefix} ${CYAN}${BOLD}${content || " "}${RESET}`;
        }
        return `${prefix} ${DIM}${content || " "}${RESET}`;
      })
      .join("\n");
  }

  renderConfirmChoiceBody() {
    const options = ["Yes", "No"];
    return options
      .map((option, index) => {
        const selected = index === this.selectedConfirmIndex;
        const prefix = selected ? color(">", CYAN) : " ";
        const marker = selected ? color("*", GREEN) : "o";
        return `${prefix} ${marker} ${option}`;
      })
      .join("\n");
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

    if (isPrintableInputSequence(key.sequence) && !key.ctrl && !key.meta) {
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
          this.ensureModelSelectionVisible();
        }
        return;
      case "down":
        if (this.models.length) {
          this.selectedModelIndex = (this.selectedModelIndex + 1) % this.models.length;
          this.ensureModelSelectionVisible();
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
      if (name === "up" || name === "down") {
        const direction = name === "up" ? -1 : 1;
        const options = SUPPORTED_INSTALL_TARGETS;
        this.selectedInstallTargetIndex =
          (this.selectedInstallTargetIndex + direction + options.length) % options.length;
        return;
      }
      if (name === "return") {
        const selectedTarget = SUPPORTED_INSTALL_TARGETS[this.selectedInstallTargetIndex] || getDefaultInstallTarget();
        saveInstallTarget(selectedTarget);
        this.installTarget = selectedTarget;
        this.setStatus(`Target system set to ${selectedTarget}.`, GREEN);
        this.enterSetupKeys();
        return;
      }
      return;
    }

    if (this.screen === "setup_models") {
      await this.handleSetupModelsKeypress(key);
      return;
    }

    if (this.screen === "setup_claude" || this.screen === "setup_start") {
      await this.handleSetupConfirmKeypress(key);
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

    if (this.screen === "setup_keys" && (key.name || "").toLowerCase() === "tab") {
      const trimmed = this.prompt.trimEnd();
      if (trimmed.length > 0 && !trimmed.endsWith(",") && !trimmed.endsWith("\n")) {
        this.prompt = `${trimmed}\n`;
      }
      return;
    }

    if ((key.name || "").toLowerCase() === "return") {
      await this.commitSetupPrompt();
      return;
    }

    if (isPrintableInputSequence(key.sequence) && !key.ctrl && !key.meta) {
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
          this.ensureModelSelectionVisible();
        }
        return;
      case "down":
        if (this.models.length) {
          this.selectedModelIndex = (this.selectedModelIndex + 1) % this.models.length;
          this.ensureModelSelectionVisible();
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

  async handleSetupConfirmKeypress(key) {
    switch ((key.name || "").toLowerCase()) {
      case "escape":
        this.shouldExit = true;
        return;
      case "up":
      case "down":
        this.selectedConfirmIndex = this.selectedConfirmIndex === 0 ? 1 : 0;
        return;
      case "return":
        await this.commitSetupPrompt();
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
      const answerYes = this.selectedConfirmIndex === 0;
      if (answerYes) {
        installClaudeIntegration({ quiet: true, targetPlatform: this.installTarget });
        this.setStatus(`Claude Code integration installed for ${this.installTarget}.`, GREEN);
      } else {
        this.setStatus("Skipping Claude Code integration for now.", YELLOW);
      }
      await this.enterSetupModels();
      return;
    }

    if (this.screen === "setup_start") {
      const answerYes = this.selectedConfirmIndex === 0;
      if (answerYes) {
        startServer({ quiet: true });
        this.running = waitForServerStart();
        this.setStatus(
          this.running ? "Bridge started. Setup complete." : "Loren could not start the bridge.",
          this.running ? GREEN : RED,
        );
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
    this.selectedInstallTargetIndex = Math.max(0, SUPPORTED_INSTALL_TARGETS.indexOf(this.installTarget));
    this.setStatus("Welcome. Let's choose your target system first.", CYAN);
  }

  enterSetupKeys() {
    this.screen = "setup_keys";
    this.prompt = "";
  }

  enterSetupClaude() {
    this.screen = "setup_claude";
    this.selectedConfirmIndex = 0;
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
    this.selectedConfirmIndex = 0;
  }

  async loadModels() {
    const { config, models } = await fetchAvailableModels();
    this.models = buildSelectableModels(config, models);
    const activeIndex = this.models.findIndex((model) => (model.model || model.name) === this.config.defaultModel);
    this.selectedModelIndex = activeIndex >= 0 ? activeIndex : 0;
    this.modelScrollOffset = 0;
    this.ensureModelSelectionVisible();
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
    this.selectedInstallTargetIndex = Math.max(0, SUPPORTED_INSTALL_TARGETS.indexOf(this.installTarget));
    this.running = isServerRunning();
  }

  setStatus(message, color = WHITE) {
    this.statusMessage = message;
    this.statusColor = color;
  }

  getVisibleModelRange() {
    const visibleCount = this.getVisibleModelCount();
    const maxStart = Math.max(0, this.models.length - visibleCount);
    const start = Math.min(this.modelScrollOffset, maxStart);
    const end = Math.min(this.models.length, start + visibleCount);
    return { start, end };
  }

  getVisibleModelCount() {
    return 10;
  }

  ensureModelSelectionVisible() {
    const visibleCount = this.getVisibleModelCount();
    if (this.selectedModelIndex < this.modelScrollOffset) {
      this.modelScrollOffset = this.selectedModelIndex;
      return;
    }

    if (this.selectedModelIndex >= this.modelScrollOffset + visibleCount) {
      this.modelScrollOffset = this.selectedModelIndex - visibleCount + 1;
    }
  }
}

LorenTui.prototype.renderInstallTargetBody = function renderInstallTargetBody() {
  return SUPPORTED_INSTALL_TARGETS
    .map((target, index) => {
      const selected = index === this.selectedInstallTargetIndex;
      const prefix = selected ? color(">", CYAN) : " ";
      const marker = selected ? color("*", GREEN) : "o";
      return `${prefix} ${marker} ${formatInstallTargetLabel(target)}`;
    })
    .join("\n");
};

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

function buildSelectableModels(config, upstreamModels) {
  const modelMap = new Map();

  for (const model of upstreamModels) {
    const modelId = model.model || model.name;
    if (!modelId) {
      continue;
    }
    modelMap.set(modelId, { ...model, model: modelId });
  }

  for (const [alias, target] of Object.entries(config.aliases || {})) {
    if (!modelMap.has(alias)) {
      modelMap.set(alias, {
        model: alias,
        name: alias,
        size: null,
        modified_at: null,
        aliasTarget: target || null,
      });
    }
  }

  if (config.defaultModel && !modelMap.has(config.defaultModel)) {
    modelMap.set(config.defaultModel, {
      model: config.defaultModel,
      name: config.defaultModel,
      size: null,
      modified_at: null,
      aliasTarget: (config.aliases || {})[config.defaultModel] || null,
    });
  }

  const selectableModels = Array.from(modelMap.values());
  selectableModels.sort((a, b) => {
    const dateA = a.modified_at ? new Date(a.modified_at).getTime() : 0;
    const dateB = b.modified_at ? new Date(b.modified_at).getTime() : 0;
    if (dateA !== dateB) {
      return dateB - dateA;
    }
    return String(a.model || a.name).localeCompare(String(b.model || b.name));
  });

  return selectableModels;
}

async function listModels() {
  const { config, models } = await fetchAvailableModels();
  const selectableModels = buildSelectableModels(config, models);

  console.log("\nAvailable models from Ollama Cloud:");
  console.log("-".repeat(74));
  console.log(`  ${pad("MODEL", 34)}${pad("SIZE", 12)}MODIFIED`);
  console.log("-".repeat(74));

  if (!selectableModels.length) {
    console.log("  No models available right now.");
  } else {
    selectableModels.forEach((model) => {
      const modelId = model.model || model.name;
      const marker = modelId === config.defaultModel ? "*" : "o";
      const size = formatSize(model.size);
      const modified = model.modified_at ? new Date(model.modified_at).toLocaleDateString() : "unknown";
      console.log(`  ${marker} ${pad(modelId, 30)}${pad(size, 12)}${modified}`);
    });
  }

  console.log("");
  console.log(`Total: ${selectableModels.length} model(s)`);
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

function waitForServerStart(timeoutMs = 3000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (isServerRunning()) {
      return true;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  return isServerRunning();
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
  return `${banner}\n${DIM}${centerText(linkLine, 88)}${RESET}\n\n${CYAN}${BOLD}${centerText("LOREN", 88)}${RESET}\n${CYAN}${BOLD}${centerText("CODE", 88)}${RESET}\n${DIM}${centerText("Smarter bridge, fewer rituals.", 88)}${RESET}\n`;
}

function printBanner() {
  console.log(renderBanner());
}

function renderDashboardHero(config, running) {
  const leftWidth = 51;
  const rightWidth = 38;
  const bannerBlock = PANEL_LOREN_LINES.map((line, index) => `${PANEL_GRADIENT_COLORS[index] || ""}${line}${RESET}`);
  const codeBlock = CODE_BANNER_LINES.map((line, index) => `${PANEL_GRADIENT_COLORS[index] || ""}${centerText(line, leftWidth)}${RESET}`);
  const welcomeLine = centerText(`WELCOME BACK ${displayName.toUpperCase()} :)`, leftWidth);
  const leftLines = [
    "",
    ...bannerBlock,
    ...codeBlock,
    "",
    renderGradientText(welcomeLine, WELCOME_GRADIENT_COLORS),
    "",
  ];

  const claudeInstalled = isClaudeIntegrationInstalled();
  const claudeStatus = claudeInstalled
    ? `${PANEL_GRADIENT_COLORS[3]}installed${RESET}`
    : `${ERROR_GRADIENT_COLORS[2]}not installed${RESET}`;

  const rightLines = [
    "",
    heroLine(
      "Bridge Status",
      running ? `${PANEL_GRADIENT_COLORS[3]}Running${RESET}` : `${ERROR_GRADIENT_COLORS[2]}Stopped${RESET}`,
    ),
    heroLine("URL", `${PANEL_GRADIENT_COLORS[2]}${shortenPath(getBridgeBaseUrl(config), rightWidth - 16)}${RESET}`),
    heroLine("Home", `${WHITE}${lorenHome}${RESET}`),
    heroLine("Claude", claudeStatus),
    "",
    heroLine("Model", `${PANEL_GRADIENT_COLORS[2]}${shortenPath(config.defaultModel, rightWidth - 0)}${RESET}`),
    heroLine("Keys Loaded", `${PANEL_GRADIENT_COLORS[2]}${String(config.apiKeys.length)}${RESET}`),
    "",
    heroLine("LOREN V.", `${PANEL_GRADIENT_COLORS[2]}${packageVersion}${RESET}`),
    "",
  ];

  const linkLine = "github.com/lorenzune/loren-code - npmjs.com/package/loren-code";
  return splitGradientBox(leftLines, rightLines, leftWidth, rightWidth, `${DIM}${centerText(linkLine, leftWidth + rightWidth + 3)}${RESET}`);
}

function renderDashboardHeader(config, running, statusMessage, statusColor) {
  const lines = [renderDashboardHero(config, running)];
  if (statusMessage) {
    lines.push(formatStatusBanner(statusMessage, statusColor, 106));
  }
  lines.push("");
  return lines.join("\n");
}

function describeClaudeTarget(target) {
  return `${target} installer ready`;
}

function isClaudeIntegrationInstalled() {
  return fs.existsSync(claudeSettingsPath);
}

function renderSetupHeader(statusMessage, statusColor) {
  const lines = [];
  if (envStatus.migrated) {
    lines.push(formatStatusBanner("Previous Loren settings were imported automatically.", MAGENTA, 88));
  } else if (envStatus.created) {
    lines.push(formatStatusBanner("A fresh config is ready.", GREEN, 88));
  }
  lines.push(formatStatusBanner("Let's get Loren ready in one smooth pass.", GREEN, 88));
  if (statusMessage) {
    lines.push(formatStatusBanner(statusMessage, statusColor, 88));
  }
  lines.push("");
  return lines.join("\n");
}

function renderSetupHero(screen) {
  const leftWidth = 51;
  const rightWidth = 38;
  const bannerBlock = PANEL_LOREN_LINES.map((line, index) => `${PANEL_GRADIENT_COLORS[index] || ""}${line}${RESET}`);
  const codeBlock = CODE_BANNER_LINES.map((line, index) => `${PANEL_GRADIENT_COLORS[index] || ""}${centerText(line, leftWidth)}${RESET}`);
  const welcomeLine = centerText(`WELCOME ${displayName.toUpperCase()} :)`, leftWidth);
  const stepMap = {
    setup_platform: "Setup 1/5",
    setup_keys: "Setup 2/5",
    setup_claude: "Setup 3/5",
    setup_models: "Setup 4/5",
    setup_start: "Setup 5/5",
  };

  const leftLines = [
    "",
    ...bannerBlock,
    ...codeBlock,
    "",
    renderGradientText(welcomeLine, WELCOME_GRADIENT_COLORS),
    "",
  ];

  const rightLines = [
    "",
    heroLine("Mode", `${PANEL_GRADIENT_COLORS[2]}Setup${RESET}`),
    heroLine("Progress", `${PANEL_GRADIENT_COLORS[3]}${stepMap[screen] || "Setup"}${RESET}`),
    heroLine("Target", `${PANEL_GRADIENT_COLORS[2]}${getConfiguredInstallTarget()}${RESET}`),
    heroLine("Keys", `${PANEL_GRADIENT_COLORS[2]}${String(loadConfig().apiKeys.length)}${RESET}`),
    "",
    heroLine("LOREN V.", color(packageVersion, GREEN)),
    "",
  ];

  const linkLine = "github.com/lorenzune/loren-code - npmjs.com/package/loren-code";
  return splitGradientBox(leftLines, rightLines, leftWidth, rightWidth, `${DIM}${centerText(linkLine, leftWidth + rightWidth + 3)}${RESET}`);
}

function renderScreen(body, footer = "") {
  const rows = Number.isInteger(process.stdout.rows) ? process.stdout.rows : 40;
  const bodyLines = countRenderedLines(body);
  const footerLines = footer ? countRenderedLines(footer) + 1 : 0;
  const paddingLines = Math.min(1, Math.max(0, rows - bodyLines - footerLines));
  const padding = paddingLines > 0 ? `${"\n".repeat(paddingLines)}` : "";
  return footer ? `${CLEAR}${body}${padding}\n${footer}` : `${CLEAR}${body}${padding}`;
}

function box(title, lines) {
  const width = 74;
  const top = `╭─ ${title}${"─".repeat(Math.max(0, width - title.length - 3))}╮`;
  const body = lines.map((line) => `│ ${pad(stripAnsi(line), width - 2)}│`).join("\n");
  const bottom = `╰${"─".repeat(width)}╯`;
  return `${top}\n${body}\n${bottom}`;
}

function gradientBox(title, lines, width = 50) {
  const titleText = ` ${title} `;
  const titlePad = Math.max(0, width - titleText.length);
  const top = `${PANEL_GRADIENT_COLORS[0]}╭${"─".repeat(2)}${BOLD}${WHITE}${titleText}${RESET}${PANEL_GRADIENT_COLORS[0]}${"─".repeat(titlePad)}╮${RESET}`;
  const body = lines
    .map((line, index) => {
      const borderColor = PANEL_GRADIENT_COLORS[Math.min(index + 1, PANEL_GRADIENT_COLORS.length - 1)] || PANEL_GRADIENT_COLORS[0];
      return `${borderColor}│${RESET} ${padAnsi(line, width)} ${borderColor}│${RESET}`;
    })
    .join("\n");
  const bottom = `${PANEL_GRADIENT_COLORS[PANEL_GRADIENT_COLORS.length - 1]}╰${"─".repeat(width + 2)}╯${RESET}`;
  return `${top}\n${body}\n${bottom}`;
}

function splitBox(leftLines, rightLines, leftWidth = 36, rightWidth = 64) {
  const totalWidth = leftWidth + rightWidth + 3;
  const top = `┌${"─".repeat(leftWidth + 2)}┬${"─".repeat(rightWidth + 2)}┐`;
  const bottom = `└${"─".repeat(totalWidth + 2)}┘`;
  const rowCount = Math.max(leftLines.length, rightLines.length);
  const rows = [];

  for (let index = 0; index < rowCount; index += 1) {
    const left = padAnsi(leftLines[index] || "", leftWidth);
    const right = padAnsi(rightLines[index] || "", rightWidth);
    rows.push(`│ ${left} │ ${right} │`);
  }

  return `${top}\n${rows.join("\n")}\n${bottom}`;
}

function pad(value, width) {
  const text = String(value ?? "");
  return text.length >= width ? `${text.slice(0, width - 3)}...` : text.padEnd(width);
}

function splitGradientBox(leftLines, rightLines, leftWidth = 36, rightWidth = 64, footerText = "") {
  const totalWidth = leftWidth + rightWidth + 3;
  const top = `${PANEL_GRADIENT_COLORS[0]}╭${"─".repeat(leftWidth + 2)}┬${"─".repeat(rightWidth + 2)}╮${RESET}`;
  const bottom = `${PANEL_GRADIENT_COLORS[PANEL_GRADIENT_COLORS.length - 1]}╰${"─".repeat(totalWidth + 2)}╯${RESET}`;
  const rowCount = Math.max(leftLines.length, rightLines.length);
  const rows = [];

  for (let index = 0; index < rowCount; index += 1) {
    const left = padAnsi(leftLines[index] || "", leftWidth);
    const right = padAnsi(rightLines[index] || "", rightWidth);
    const borderColor = PANEL_GRADIENT_COLORS[Math.min(index, PANEL_GRADIENT_COLORS.length - 1)] || PANEL_GRADIENT_COLORS[0];
    rows.push(`${borderColor}│${RESET} ${left} ${borderColor}│${RESET} ${right} ${borderColor}│${RESET}`);
  }

  if (footerText) {
    const borderColor = PANEL_GRADIENT_COLORS[PANEL_GRADIENT_COLORS.length - 1];
    rows.push(`${borderColor}├${"─".repeat(totalWidth + 2)}┤${RESET}`);
    rows.push(`${borderColor}│${RESET} ${padAnsi(footerText, totalWidth)} ${borderColor}│${RESET}`);
  }

  return `${top}\n${rows.join("\n")}\n${bottom}`;
}

function padAnsi(value, width) {
  const text = String(value ?? "");
  const visible = stripAnsi(text);
  if (visible.length >= width) {
    return `${visible.slice(0, width - 3)}...`;
  }
  return `${text}${" ".repeat(width - visible.length)}`;
}

function renderActionLine(command, description, width) {
  const commandText = `${CYAN}${BOLD}${command}${RESET}`;
  const line = `${WHITE}Press ${commandText}${WHITE} to ${description}${RESET}`;
  return padAnsi(line, width);
}

function heroLine(label, value) {
  return `${BOLD}${PANEL_GRADIENT_COLORS[1]}${label}:${RESET} ${value}`;
}

function renderGradientText(text, colors) {
  const value = String(text ?? "");
  let result = "";
  let visibleIndex = 0;

  for (const character of value) {
    if (character === " ") {
      result += character;
      continue;
    }

    const colorIndex = Math.min(
      colors.length - 1,
      Math.floor((visibleIndex / Math.max(1, value.replace(/\s/g, "").length - 1)) * (colors.length - 1)),
    );
    result += `${colors[colorIndex]}${character}${RESET}`;
    visibleIndex += 1;
  }

  return result;
}

function renderFooter(items) {
  return roundedFooterBox(formatFooterItems(items), 78);
}

function getStatusGradient(statusColor) {
  switch (statusColor) {
    case GREEN:
      return SUCCESS_GRADIENT_COLORS;
    case RED:
      return ERROR_GRADIENT_COLORS;
    case YELLOW:
      return WARN_GRADIENT_COLORS;
    case CYAN:
    case MAGENTA:
      return INFO_GRADIENT_COLORS;
    default:
      return null;
  }
}

function formatStatusBanner(message, statusColor, width) {
  const centered = centerText(message, width);
  const gradient = getStatusGradient(statusColor);
  if (gradient) {
    return renderGradientText(centered, gradient);
  }
  return `${statusColor}${centered}${RESET}`;
}

function formatFooterItems(items) {
  return items
    .map((item) => item.replace(/\[([^\]]+)\]/g, `${CYAN}[${BOLD}$1${RESET}${CYAN}]${RESET}`))
    .join(`${DIM}  *  ${RESET}`);
}

function roundedFooterBox(content, width) {
  const visibleContent = stripAnsi(content);
  const innerWidth = Math.max(width - 2, visibleContent.length);
  const top = `${DIM}╭${"─".repeat(innerWidth + 2)}╮${RESET}`;
  const body = `${DIM}│${RESET} ${padAnsi(content, innerWidth)} ${DIM}│${RESET}`;
  const bottom = `${DIM}╰${"─".repeat(innerWidth + 2)}╯${RESET}`;
  return `${top}\n${body}\n${bottom}`;
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
  const columns = getTerminalColumns();
  return stripAnsi(text)
    .split("\n")
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / columns)), 0);
}

function getTerminalColumns() {
  return Number.isInteger(process.stdout.columns) && process.stdout.columns > 0
    ? process.stdout.columns
    : 80;
}

function fitInlineInput(value, maxWidth) {
  const text = String(value ?? "");
  if (text.length <= maxWidth) {
    return text;
  }
  return `...${text.slice(-(maxWidth - 3))}`;
}

function isPrintableInputSequence(sequence) {
  if (typeof sequence !== "string" || sequence.length === 0) {
    return false;
  }

  return !/[\x00-\x1F\x7F]/.test(sequence);
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

function shortenPath(value, maxWidth) {
  const text = String(value ?? "");
  if (text.length <= maxWidth) {
    return text;
  }
  return `...${text.slice(-(maxWidth - 3))}`;
}

function getPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    return pkg.version || "dev";
  } catch {
    return process.env.npm_package_version || "dev";
  }
}

function formatInstallTargetChoice(target) {
  return target === "linux" ? "[L] Linux" : "[W] Windows";
}

function formatInstallTargetLabel(target) {
  return target === "linux" ? "Linux" : "Windows";
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
