#!/bin/sh
set -eu

REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
USER_HOME=${HOME:-}
if [ -z "$USER_HOME" ]; then
  echo "HOME is not set." >&2
  exit 1
fi

XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-"$USER_HOME/.config"}
XDG_BIN_HOME=${XDG_BIN_HOME:-"$USER_HOME/.local/bin"}
LOREN_HOME_DIR=${LOREN_HOME:-"$USER_HOME/.lorencode"}
WORKSPACE_SETTINGS_DIR="$XDG_CONFIG_HOME/Code/User"
WORKSPACE_SETTINGS_PATH="$WORKSPACE_SETTINGS_DIR/settings.json"
CLAUDE_DIR="$USER_HOME/.claude"
CLAUDE_SETTINGS_PATH="$CLAUDE_DIR/settings.json"
LAUNCHER_PATH="$REPO_ROOT/scripts/ClaudeWrapperLauncher.sh"
ENV_TEMPLATE_PATH="$REPO_ROOT/.env.example"
LEGACY_ENV_PATH="$REPO_ROOT/.env.local"
ENV_PATH="$LOREN_HOME_DIR/.env.local"
CLAUDE_PATH="$XDG_BIN_HOME/claude"
CLAUDE_BACKUP_PATH="$XDG_BIN_HOME/claude.loren-backup"

mkdir -p "$WORKSPACE_SETTINGS_DIR" "$CLAUDE_DIR" "$LOREN_HOME_DIR" "$XDG_BIN_HOME"

if [ ! -f "$ENV_PATH" ]; then
  if [ -f "$LEGACY_ENV_PATH" ]; then
    cp "$LEGACY_ENV_PATH" "$ENV_PATH"
  elif [ -f "$ENV_TEMPLATE_PATH" ]; then
    cp "$ENV_TEMPLATE_PATH" "$ENV_PATH"
  else
    printf 'OLLAMA_API_KEYS=\nBRIDGE_HOST=127.0.0.1\nBRIDGE_PORT=8788\n' > "$ENV_PATH"
  fi
fi

chmod +x "$LAUNCHER_PATH"

export WORKSPACE_SETTINGS_PATH
export CLAUDE_SETTINGS_PATH
export ENV_PATH
export LOREN_HOME_DIR

node <<'NODE'
const fs = require("node:fs");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function parseEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) {
    return env;
  }

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
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

    env[key] = value;
  }

  return env;
}

const envPath = process.env.ENV_PATH;
const workspaceSettingsPath = process.env.WORKSPACE_SETTINGS_PATH;
const claudeSettingsPath = process.env.CLAUDE_SETTINGS_PATH;
const lorenHome = process.env.LOREN_HOME_DIR;
const env = parseEnv(envPath);
const host = env.BRIDGE_HOST || "127.0.0.1";
const port = env.BRIDGE_PORT || "8788";
const bridgeBaseUrl = `http://${host}:${port}`;

const workspaceSettings = readJson(workspaceSettingsPath);
workspaceSettings["claudeCode.claudeProcessWrapper"] = process.env.LAUNCHER_PATH || "";
workspaceSettings["claudeCode.disableLoginPrompt"] = true;
workspaceSettings["claudeCode.environmentVariables"] = [
  { name: "LOREN_HOME", value: lorenHome },
  { name: "ANTHROPIC_BASE_URL", value: bridgeBaseUrl },
  { name: "ANTHROPIC_API_KEY", value: "bridge-local" },
  { name: "ANTHROPIC_AUTH_TOKEN", value: "" },
  { name: "CLAUDE_CODE_SKIP_AUTH_LOGIN", value: "1" },
];
writeJson(workspaceSettingsPath, workspaceSettings);

let aliases = {};
if (env.OLLAMA_MODEL_ALIASES) {
  try {
    aliases = JSON.parse(env.OLLAMA_MODEL_ALIASES);
  } catch {
    aliases = {};
  }
}

const availableModels = Array.from(
  new Set(
    Object.keys(aliases)
      .concat(Object.values(aliases))
      .filter((value) => typeof value === "string" && value.trim().length > 0),
  ),
);

if (availableModels.length === 0) {
  throw new Error("OLLAMA_MODEL_ALIASES does not contain any models");
}

const configuredDefaultModel = env.DEFAULT_MODEL_ALIAS;
const defaultModel =
  configuredDefaultModel && availableModels.includes(configuredDefaultModel)
    ? configuredDefaultModel
    : Object.prototype.hasOwnProperty.call(aliases, "ollama-free-auto")
      ? "ollama-free-auto"
      : availableModels[0];

const claudeSettings = readJson(claudeSettingsPath);
claudeSettings.model = defaultModel;
claudeSettings.availableModels = availableModels;
writeJson(claudeSettingsPath, claudeSettings);
NODE

if [ -f "$CLAUDE_PATH" ] && [ ! -f "$CLAUDE_BACKUP_PATH" ]; then
  mv "$CLAUDE_PATH" "$CLAUDE_BACKUP_PATH"
fi

cat > "$CLAUDE_PATH" <<EOF
#!/bin/sh
export LOREN_HOME="\${LOREN_HOME:-$LOREN_HOME_DIR}"
if [ -x "$CLAUDE_BACKUP_PATH" ]; then
  export CLAUDE_REAL_EXECUTABLE="$CLAUDE_BACKUP_PATH"
fi
exec "$LAUNCHER_PATH" "\$@"
EOF

chmod +x "$CLAUDE_PATH"

echo "Installation completed."
echo ""
echo "Claude Code is now wired to Loren on Linux."
echo "Restart VS Code and open a fresh chat."
echo "The global 'claude' command in $XDG_BIN_HOME now goes through Loren."
