#!/usr/bin/env node
import { getEnvFilePath, getLorenHome } from "../src/paths.js";

console.log("");
console.log("Loren Code installed.");
console.log(`Loren home: ${getLorenHome()}`);
console.log(`Config file: ${getEnvFilePath()}`);
console.log("");
console.log("Next steps:");
console.log("  1. Run: loren");
console.log("  2. Add your OLLAMA_API_KEYS");
console.log("  3. Start the bridge with: loren start");
console.log("");
console.log("Optional Windows Claude integration:");
console.log("  powershell -ExecutionPolicy Bypass -File \"$(npm prefix -g)\\node_modules\\loren-code\\scripts\\install-claude-ollama.ps1\"");
console.log("");
