# LOREN CODE

Loren Code is a local bridge and terminal UI for Ollama Cloud and Claude Code.

If you just want to use Loren, install it from npm. It is much more convenient.

This repository is best treated as the development version:

- source code
- scripts
- release prep
- local development and debugging

The published npm package has its own README focused on installation and first use.

## Recommended Install

For normal usage:

```bash
npm install -g loren-code
loren
```

For development only:

```bash
git clone https://github.com/lorenzune/loren-code.git
cd loren-code
npm install
node scripts/loren.js
```

## What Loren Does

- runs a local bridge on port `8788`
- provides a terminal UI through `loren`
- manages Ollama Cloud model aliases
- stores config and runtime state under `%USERPROFILE%\.lorencode`
- includes helper scripts for Claude Code integration on Windows

## API Keys And Rotation

Loren is designed for setups with multiple Ollama Cloud API keys.

If you configure more than one key, requests are rotated in round-robin order across the configured keys. Loren also supports manual key rotation and basic failover behavior.

That includes the common setup where users add multiple free-tier keys to reduce interruptions and keep the bridge usable for longer sessions.

Loren does not bypass Ollama Cloud limits or service terms.

## Local Setup

On first run Loren creates user config under:

```text
C:\Users\<you>\.lorencode\
```

Main files:

```text
C:\Users\<you>\.lorencode\.env.local
C:\Users\<you>\.lorencode\runtime\
```

Example `.env.local`:

```bash
BRIDGE_HOST=127.0.0.1
BRIDGE_PORT=8788
OLLAMA_API_KEYS=sk-key1,sk-key2
OLLAMA_UPSTREAM_BASE_URL=https://ollama.com
DEFAULT_MODEL_ALIAS=gpt-oss:20b
OLLAMA_MODEL_ALIASES={"ollama-free-auto":"gpt-oss:20b","ollama-free-fast":"gemma3:12b"}
```

## Common Development Commands

```bash
node scripts/loren.js
node scripts/loren.js help
node scripts/loren.js config:show
node scripts/loren.js model:list
npm test
```

If you installed the npm package globally, use `loren` instead of `node scripts/loren.js`.

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
