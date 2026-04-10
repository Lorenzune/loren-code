#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config.js";
import { ensureEnvLocal, ensureRuntimeDir, getBridgeBaseUrl } from "../src/bootstrap.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

async function waitForServer(url, timeoutMs = 10000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server may still be starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

async function isServerReady(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  ensureRuntimeDir(projectRoot);
  ensureEnvLocal(projectRoot);
  const config = loadConfig();
  const baseUrl = getBridgeBaseUrl(config);
  const healthUrl = `${baseUrl}/health`;
  let child = null;
  let startedHere = false;

  if (!(await isServerReady(healthUrl))) {
    child = spawn(process.execPath, [path.join(projectRoot, "src", "server.js")], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    startedHere = true;
    await waitForServer(healthUrl);
  }

  try {
    const healthResponse = await fetch(healthUrl);
    assert.equal(healthResponse.status, 200, "health endpoint should return 200");

    const healthJson = await healthResponse.json();
    assert.equal(healthJson.ok, true, "health payload should report ok");

    const metricsResponse = await fetch(`${baseUrl}/metrics`);
    assert.equal(metricsResponse.status, 200, "metrics endpoint should return 200");

    const metricsJson = await metricsResponse.json();
    assert.ok(metricsJson.uptime, "metrics should include uptime");
    assert.ok(metricsJson.requests, "metrics should include requests");

    const configOutput = spawn(process.execPath, [path.join(projectRoot, "scripts", "loren.js"), "config:show"], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    for await (const chunk of configOutput.stdout) {
      stdout += chunk.toString();
    }

    const exitCode = await new Promise((resolve) => {
      configOutput.on("close", resolve);
    });

    assert.equal(exitCode, 0, "loren config:show should exit successfully");
    assert.match(stdout, /Current Configuration:/, "config command should print configuration");

    console.log("Smoke test passed.");
  } finally {
    if (startedHere && child) {
      child.kill();
      await new Promise((resolve) => child.on("close", resolve));
    }
  }
}

main().catch((error) => {
  console.error(`Smoke test failed: ${error.message}`);
  process.exit(1);
});
