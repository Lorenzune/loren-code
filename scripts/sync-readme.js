#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const sources = {
  github: path.join(projectRoot, "docs", "README.github.md"),
  npm: path.join(projectRoot, "docs", "README.npm.md"),
};

const target = path.join(projectRoot, "README.md");
const mode = process.argv[2];

if (!mode || !sources[mode]) {
  console.error("Usage: node scripts/sync-readme.js <github|npm>");
  process.exit(1);
}

fs.copyFileSync(sources[mode], target);
console.log(`README.md synced from ${path.relative(projectRoot, sources[mode])}`);
