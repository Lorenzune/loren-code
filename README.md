# LOREN CODE

Ollama Cloud model manager and local bridge for Claude Code, with dynamic model switching, API key rotation, and first-run bootstrap.

## Features

- Dynamic model switching without restarting the server
- Live model list fetched from Ollama Cloud
- API key add/remove/rotate commands
- First-run setup for `.env.local` and `.runtime`
- Local bridge on port `8788`
- Claude Code wrapper support

## Quick Start

### Prerequisites

- Node.js 18+
- Ollama Cloud API key(s)

### Clone And Run Locally

```bash
git clone https://github.com/lorenzune/loren-code.git
cd loren-code
npm install
node scripts/loren.js help
```

If `.env.local` is missing, Loren creates it automatically from `.env.example`.
You still need to add real `OLLAMA_API_KEYS`.

### Install From npm

```bash
npm install -g loren-code
loren help
```

The published package exposes `loren` via the `bin` field automatically.

## Configuration

Example `.env.local`:

```bash
BRIDGE_HOST=127.0.0.1
BRIDGE_PORT=8788
OLLAMA_API_KEYS=sk-key1,sk-key2
OLLAMA_UPSTREAM_BASE_URL=https://ollama.com
DEFAULT_MODEL_ALIAS=gpt-oss:20b
OLLAMA_MODEL_ALIASES={"ollama-free-auto":"gpt-oss:20b","ollama-free-fast":"gemma3:12b"}
```

## Usage

### CLI

```bash
loren help
loren config:show
loren status
loren model:list
loren model:set gpt-oss:20b
loren model:refresh
loren keys:list
loren keys:add sk-your-new-key
loren keys:remove 0
loren keys:rotate
```

### Server

```bash
npm start
```

or:

```bash
loren start
loren stop
loren status
```

## Bridge Endpoints

- `GET /health`
- `GET /v1/models`
- `GET /v1/models?refresh=true`
- `POST /v1/refresh`
- `POST /v1/messages`
- `POST /v1/messages/count_tokens`
- `GET /metrics`
- `GET /dashboard`

## Claude Code Integration

1. Start the bridge.
2. Point Claude Code to `http://127.0.0.1:8788`.
3. Use `loren model:set` to switch model aliases.
4. Use `loren model:refresh` to refresh the model list.

## Troubleshooting

### `Command not found: loren`

Install the package globally:

```bash
npm install -g loren-code
```

If you are working from a local clone, use `node scripts/loren.js ...`.

### `npm` blocked in PowerShell

Use `npm.cmd` instead:

```powershell
npm.cmd run help
```

### Missing API keys

Populate `OLLAMA_API_KEYS` in `.env.local`.

### Port already in use

Change `BRIDGE_PORT` in `.env.local`.

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
|- .env.example
|- package.json
`- README.md
```

## License

MIT
