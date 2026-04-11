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
WORKSPACE_SETTINGS_PATH="$XDG_CONFIG_HOME/Code/User/settings.json"
CLAUDE_SETTINGS_PATH="$USER_HOME/.claude/settings.json"
CLAUDE_PATH="$XDG_BIN_HOME/claude"
CLAUDE_BACKUP_PATH="$XDG_BIN_HOME/claude.loren-backup"

export WORKSPACE_SETTINGS_PATH
export CLAUDE_SETTINGS_PATH

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

const workspaceSettingsPath = process.env.WORKSPACE_SETTINGS_PATH;
const claudeSettingsPath = process.env.CLAUDE_SETTINGS_PATH;

if (fs.existsSync(workspaceSettingsPath)) {
  const workspaceSettings = readJson(workspaceSettingsPath);
  delete workspaceSettings["claudeCode.claudeProcessWrapper"];
  delete workspaceSettings["claudeCode.disableLoginPrompt"];
  delete workspaceSettings["claudeCode.environmentVariables"];
  writeJson(workspaceSettingsPath, workspaceSettings);
}

if (fs.existsSync(claudeSettingsPath)) {
  const claudeSettings = readJson(claudeSettingsPath);
  delete claudeSettings.model;
  delete claudeSettings.availableModels;
  writeJson(claudeSettingsPath, claudeSettings);
}
NODE

if [ -f "$CLAUDE_BACKUP_PATH" ]; then
  rm -f "$CLAUDE_PATH"
  mv "$CLAUDE_BACKUP_PATH" "$CLAUDE_PATH"
else
  rm -f "$CLAUDE_PATH"
fi

echo "Linux Claude integration removed."
