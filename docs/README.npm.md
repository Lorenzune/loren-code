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

Loren creates `.env.local` automatically if it does not exist.

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

Populate `OLLAMA_API_KEYS` in `.env.local`.

### Port already in use

Change `BRIDGE_PORT` in `.env.local`.

## Repository

Source code and project documentation:

https://github.com/lorenzune/loren-code
