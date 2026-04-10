import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const claudeSettingsPath = path.join(repoRoot, ".claude", "settings.json");

function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  if (!fs.existsSync(claudeSettingsPath)) {
    console.error(`Missing Claude settings: ${claudeSettingsPath}`);
    process.exit(1);
  }

  const settings = readJson(claudeSettingsPath);
  const availableModels = Array.isArray(settings.availableModels) ? settings.availableModels : [];

  if (command === "list") {
    printModels(settings.model, availableModels);
    process.exit(0);
  }

  if (command === "set") {
    const requestedModel = rest.join(" ").trim();
    if (!requestedModel) {
      console.error("Specify a model. Example: npm run model:set -- glm-5");
      process.exit(1);
    }

    if (!availableModels.includes(requestedModel)) {
      console.error(`Model not found in availableModels: ${requestedModel}`);
      console.error("Run `npm run models:list` to see valid choices.");
      process.exit(1);
    }

    settings.model = requestedModel;
    writeJson(claudeSettingsPath, settings);
    console.log(`Claude model set to: ${requestedModel}`);
    console.log("Reopen Claude Code or start a new conversation to use it.");
    process.exit(0);
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function printModels(currentModel, availableModels) {
  if (availableModels.length === 0) {
    console.log("No availableModels found.");
    return;
  }

  console.log(`Current model: ${currentModel || "(unset)"}`);
  console.log("");

  for (const model of availableModels) {
    const marker = model === currentModel ? "*" : " ";
    console.log(`${marker} ${model}`);
  }
}

function printHelp() {
  console.log("Usage:");
  console.log("  npm run models:list");
  console.log("  npm run model:set -- <model>");
  console.log("");
  console.log("Examples:");
  console.log("  npm run model:set -- glm-5");
  console.log("  npm run model:set -- gemma4:31b");
  console.log("  npm run model:set -- ollama-free-tools");
}

main();
