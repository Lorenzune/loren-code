# loren-code

`loren-code` installs the `loren` CLI for working with a local Ollama Cloud bridge.

It is built to rotate multiple Ollama Cloud API keys, including the common setup where users configure more than one free-tier key for longer uninterrupted bridge usage.

Loren manages rotation and failover, but it does not bypass upstream limits or service terms.

## Install

```bash
npm install -g loren-code
```

Verify:

```bash
loren help
```

## First Run

Loren stores user config in `%USERPROFILE%\.lorencode`.

On first run it creates:

```text
C:\Users\<you>\.lorencode\.env.local
```

You must add valid `OLLAMA_API_KEYS` before the bridge can make upstream requests.
If you configure multiple keys, Loren rotates them automatically.

Example `.env.local`:

```bash
BRIDGE_HOST=127.0.0.1
BRIDGE_PORT=8788
OLLAMA_API_KEYS=sk-key1,sk-key2
OLLAMA_UPSTREAM_BASE_URL=https://ollama.com
DEFAULT_MODEL_ALIAS=gpt-oss:20b
OLLAMA_MODEL_ALIASES={"ollama-free-auto":"gpt-oss:20b","ollama-free-fast":"gemma3:12b"}
```

## Main Commands

```bash
loren help
loren config:show
loren status
loren start
loren stop
loren model:list
loren model:set gpt-oss:20b
loren model:current
loren model:refresh
loren keys:list
loren keys:add sk-your-new-key
loren keys:remove 0
loren keys:rotate
```

## Start The Bridge

```bash
loren start
```

The local bridge runs on:

```text
http://127.0.0.1:8788
```

## Claude Code On Windows

If you want the installed `claude` command to route through Loren instead of the official Claude CLI, run:

```powershell
powershell -ExecutionPolicy Bypass -File "$(npm prefix -g)\node_modules\loren-code\scripts\install-claude-ollama.ps1"
```

That installer:

- configures VS Code to use the local bridge
- updates your user `.claude` settings
- backs up existing global `claude` shims
- installs Loren-backed `claude`, `claude.cmd`, and `claude.ps1` wrappers

To restore the original `claude` command:

```powershell
powershell -ExecutionPolicy Bypass -File "$(npm prefix -g)\node_modules\loren-code\scripts\uninstall-claude-ollama.ps1"
```

## Troubleshooting

### `loren` not found

Make sure the package was installed globally:

```bash
npm install -g loren-code
```

### `npm` blocked in PowerShell

Use:

```powershell
npm.cmd install -g loren-code
```

### Missing API keys

Populate `OLLAMA_API_KEYS` in `%USERPROFILE%\.lorencode\.env.local`.

### Port already in use

Change `BRIDGE_PORT` in `%USERPROFILE%\.lorencode\.env.local`.

## Repository

Source code and project documentation:

https://github.com/lorenzune/loren-code
