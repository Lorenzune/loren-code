# LOREN CODE

Loren Code is a local bridge and CLI for Ollama Cloud and Claude Code.

It is aimed at two different use cases:

- running Loren as a local bridge from the repository
- installing the published npm package and using the `loren` CLI globally

This repository README focuses on the project itself.
The npm package uses a separate README tailored to package installation and first use.

## What It Does

- runs a local bridge on port `8788`
- manages Ollama Cloud model aliases
- rotates API keys across multiple Ollama Cloud keys
- stores config and runtime state under `%USERPROFILE%\.lorencode`
- includes helper scripts for Claude Code integration on Windows

## Intended Usage

Loren is designed to work well when you have multiple Ollama Cloud API keys configured.

That includes the common setup where users add multiple free-tier keys to reduce interruptions and keep the Claude Code bridge usable for longer sessions.

Loren handles key rotation and failover, but it does not bypass Ollama Cloud limits or terms.

## Install Modes

### 1. Repository / Development Install

Use this if you want the full project, scripts, and source code.

```bash
git clone https://github.com/lorenzune/loren-code.git
cd loren-code
npm install
node scripts/loren.js help
```

### 2. npm Package Install

Use this if you only want the CLI.

```bash
npm install -g loren-code
loren help
```

The published package has a dedicated npm-focused README.

## Local Setup

If `%USERPROFILE%\.lorencode\.env.local` does not exist, Loren creates it automatically from `.env.example`.

You still need to add real `OLLAMA_API_KEYS`.
If you use multiple keys, Loren rotates them automatically.

Main user paths on Windows:

```text
C:\Users\<you>\.lorencode\.env.local
C:\Users\<you>\.lorencode\runtime\
```

Example:

```bash
BRIDGE_HOST=127.0.0.1
BRIDGE_PORT=8788
OLLAMA_API_KEYS=sk-key1,sk-key2
OLLAMA_UPSTREAM_BASE_URL=https://ollama.com
DEFAULT_MODEL_ALIAS=gpt-oss:20b
OLLAMA_MODEL_ALIASES={"ollama-free-auto":"gpt-oss:20b","ollama-free-fast":"gemma3:12b"}
```

## Common Commands

```bash
node scripts/loren.js help
node scripts/loren.js config:show
node scripts/loren.js model:list
node scripts/loren.js model:set gpt-oss:20b
npm start
```

If you installed the npm package globally, the same commands work through `loren`.

## Claude Code Integration

Loren includes Windows-oriented helper scripts for wiring Claude Code to the local bridge:

- `scripts/install-claude-ollama.ps1`
- `scripts/uninstall-claude-ollama.ps1`
- `scripts/claude-wrapper.js`

These scripts can also take over the global `claude` command on Windows by backing up the existing `claude` shims and replacing them with Loren-backed wrappers.

## Project Structure

```text
loren-code/
|- scripts/
|  |- loren.js
|  |- claude-wrapper.js
|  `- install-claude-ollama.ps1
|- src/
|  |- bootstrap.js
|  |- server.js
|  |- config.js
|  |- key-manager.js
|  `- ...
|- docs/
|  |- README.github.md
|  `- README.npm.md
|- .env.example
|- package.json
`- README.md
```

## License

MIT
