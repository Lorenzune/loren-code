# Contributing

Thanks for helping with Loren Code.

## Best Ways To Help

- report bugs with steps to reproduce
- suggest UX improvements for the terminal UI and setup flow
- improve documentation
- fix bugs or rough edges in the bridge, CLI, or Windows integration

## Development Setup

```bash
git clone https://github.com/lorenzune/loren-code.git
cd loren-code
npm install
node scripts/loren.js
```

Useful commands:

```bash
npm test
node scripts/loren.js help
node scripts/loren.js config:show
node scripts/loren.js model:list
```

## Before Opening A Pull Request

- keep changes focused
- test the relevant flow locally
- update docs if behavior changed
- avoid committing secrets, keys, logs, or user-local config

## Pull Request Notes

- explain what changed
- mention any user-facing behavior changes
- include screenshots or terminal output when useful
- call out anything that still needs testing on a real machine

## Style

- prefer simple, readable changes
- keep terminal output clean and intentional
- preserve the project's existing UX direction unless the change is meant to improve it
