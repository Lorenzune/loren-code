#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`Publish check failed: ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureFileExists(relativePath) {
  const filePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    fail(`Missing required file: ${relativePath}`);
  }
}

function main() {
  const pkg = readJson(path.join(projectRoot, "package.json"));

  if (!pkg.name || !pkg.version) {
    fail("package.json must include name and version");
  }

  if (!pkg.repository?.url || !pkg.homepage || !pkg.bugs?.url) {
    fail("package.json should include repository, homepage, and bugs.url");
  }

  if (!pkg.bin?.loren) {
    fail("package.json must expose the loren binary");
  }

  ensureFileExists(pkg.bin.loren.replace(/^\.\//, ""));
  ensureFileExists("src/server.js");
  ensureFileExists("src/bootstrap.js");
  ensureFileExists(".env.example");
  ensureFileExists("README.md");

  const readme = fs.readFileSync(path.join(projectRoot, "README.md"), "utf8");
  if (!readme.includes("npm install -g loren-code")) {
    fail("README.md should document global installation");
  }

  const gitignorePath = path.join(projectRoot, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, "utf8");
    for (const entry of [".env.local", ".runtime", ".lorencode/"]) {
      if (!gitignore.includes(entry)) {
        fail(`.gitignore should exclude ${entry}`);
      }
    }
  }

  console.log("Publish check passed.");
}

main();
