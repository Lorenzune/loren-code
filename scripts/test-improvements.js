#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { getBridgeBaseUrl } from '../src/bootstrap.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const baseUrl = getBridgeBaseUrl(loadConfig());

// Colori per output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function runTest(name, testFn) {
  log(`\n🧪 Testing: ${name}`, 'blue');
  try {
    await testFn();
    log(`✅ ${name} - PASSED`, 'green');
    return true;
  } catch (error) {
    log(`❌ ${name} - FAILED: ${error.message}`, 'red');
    return false;
  }
}

async function checkHttp(url, expectedStatus = 200) {
  const response = await fetch(url);
  if (response.status !== expectedStatus) {
    throw new Error(`Expected ${expectedStatus}, got ${response.status}`);
  }
  return response.json();
}

async function checkFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
}

// Test suite
const tests = [
  // 1. Config validation
  runTest('Configuration loading', async () => {
    const config = await import('../src/config.js');
    const cfg = config.loadConfig();
    if (!cfg.apiKeys || cfg.apiKeys.length === 0) {
      throw new Error('No API keys found in config');
    }
  }),

  // 2. Logging system
  runTest('Logging system (Winston)', async () => {
    await checkFileExists(path.join(rootDir, 'src/logger.js'));

    // Avvia server brevemente per generare log
    const server = spawn('node', ['src/server.js'], {
      cwd: rootDir,
      detached: true,
      stdio: 'ignore'
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      process.kill(-server.pid);
    } catch (error) {
      // Process might already be dead, ignore
    }

    // Check log files
    await checkFileExists(path.join(rootDir, '.runtime/combined.log'));
  }),

  // 3. API Key Health Check
  runTest('API Key Manager', async () => {
    const { KeyManager } = await import('../src/key-manager.js');
    const manager = new KeyManager(['test-key-1', 'test-key-2']);

    const key1 = await manager.getHealthyKey();
    const key2 = await manager.getHealthyKey();

    if (key1 === key2) {
      throw new Error('Round-robin not working');
    }

    const stats = manager.getStats();
    if (stats.total !== 2) {
      throw new Error('Stats not correct');
    }
  }),

  // 4. Input Validation
  runTest('Input Validation (Zod)', async () => {
    const { validateInput, MessageSchema } = await import('../src/schemas.js');

    // Test valid input
    const valid = {
      model: 'test-model',
      messages: [{ role: 'user', content: 'hello' }]
    };

    try {
      const result = validateInput(MessageSchema, valid);
      if (!result || !result.model) {
        throw new Error('Valid input validation failed');
      }
    } catch (error) {
      throw new Error('Valid input threw error: ' + error.message);
    }

    // Test invalid input
    const invalid = { model: '', messages: 'not-an-array' };
    try {
      validateInput(MessageSchema, invalid);
      throw new Error('Should have thrown validation error');
    } catch (error) {
      console.log('Validation error:', error.message);
      if (!error.message || !error.message.includes('Validation')) {
        throw new Error('Wrong error type: ' + error.message);
      }
    }
  }),

  // 5. Caching System
  runTest('Caching System (NodeCache)', async () => {
    const { modelCache, setInCache, getFromCache } = await import('../src/cache.js');

    const testKey = 'test_cache_key';
    const testValue = { data: 'test' };

    setInCache(modelCache, testKey, testValue);
    const retrieved = getFromCache(modelCache, testKey);

    if (JSON.stringify(retrieved) !== JSON.stringify(testValue)) {
      throw new Error('Cache get/set not working');
    }
  }),

  // 6. Connection Pooling
  runTest('Connection Pooling (HTTP Agents)', async () => {
    const { getAgent, getAgentStats } = await import('../src/http-agents.js');

    const httpAgent = getAgent('http://example.com');
    const httpsAgent = getAgent('https://example.com');

    if (!httpAgent || !httpsAgent) {
      throw new Error('Agents not created');
    }

    const stats = getAgentStats();
    if (!stats.http || !stats.https) {
      throw new Error('Agent stats not available');
    }
  }),

  // 7. Metrics System
  runTest('Metrics Collection', async () => {
    const data = await checkHttp(`${baseUrl}/metrics`);

    if (!data.uptime || !data.requests || !data.process) {
      throw new Error('Missing metrics data');
    }

    if (typeof data.uptime.seconds !== 'number') {
      throw new Error('Uptime metric not a number');
    }
  }),

  // 8. Config Hot Reload
  runTest('Config Watcher', async () => {
    await checkFileExists(path.join(rootDir, 'src/config-watcher.js'));

    const { ConfigWatcher } = await import('../src/config-watcher.js');
    const watcher = new ConfigWatcher('.env.local', () => {});

    watcher.start();
    watcher.stop();
  }),

  // 9. End-to-end API Test
  runTest('API Endpoints', async () => {
    // Health endpoint
    await checkHttp(`${baseUrl}/health`);

    // Models endpoint
    const models = await checkHttp(`${baseUrl}/v1/models`);
    if (!models.data || !Array.isArray(models.data)) {
      throw new Error('Invalid models response');
    }

    // Validation test
    try {
      await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
    } catch (error) {
      // Expected to fail validation
    }
  }),

  // 10. Docker files
  runTest('Docker Configuration', async () => {
    await checkFileExists(path.join(rootDir, 'Dockerfile'));
    await checkFileExists(path.join(rootDir, 'docker-compose.yml'));
    await checkFileExists(path.join(rootDir, '.dockerignore'));
  }),

  // 11. PM2 Configuration
  runTest('PM2 Configuration', async () => {
    await checkFileExists(path.join(rootDir, 'ecosystem.config.js'));
  })
];

// Main test runner
async function runAllTests() {
  log('\n🚀 Starting Claude Ollama Bridge Improvement Tests\n', 'yellow');

  const results = await Promise.all(tests);
  const passed = results.filter(r => r).length;
  const failed = results.length - passed;

  log('\n' + '='.repeat(50), 'blue');
  log(`📊 Test Results:`, 'blue');
  log(`✅ Passed: ${passed}`, 'green');
  log(`❌ Failed: ${failed}`, failed > 0 ? 'red' : 'green');
  log(`📈 Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`, 'blue');

  if (failed > 0) {
    process.exit(1);
  } else {
    log('\n🎉 All tests passed! Your improvements are working correctly.', 'green');
    process.exit(0);
  }
}

// Check if server is running before tests
async function checkServer() {
  try {
    await checkHttp(`${baseUrl}/health`);
    return true;
  } catch {
    log(`⚠️  Server not running on ${baseUrl}`, 'yellow');
    log('Please start it first: node src/server.js', 'yellow');
    return false;
  }
}

// Run tests
(async () => {
  const serverRunning = await checkServer();
  if (serverRunning) {
    await runAllTests();
  } else {
    process.exit(1);
  }
})().catch(error => {
  log(`\n💥 Test runner error: ${error.message}`, 'red');
  process.exit(1);
});
