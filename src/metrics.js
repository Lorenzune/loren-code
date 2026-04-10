import logger from './logger.js';

// Collected metrics
const metrics = {
  // Counters
  requests: {
    total: 0,
    byEndpoint: {
      '/api/usage': 0,
      '/dashboard': 0,
      '/v1/models': 0,
      '/v1/messages': 0,
      '/v1/messages/count_tokens': 0,
      '/health': 0,
      '/metrics': 0
    },
    byStatus: {
      '2xx': 0,
      '4xx': 0,
      '5xx': 0
    }
  },
  errors: {
    total: 0,
    byType: {
      validation: 0,
      upstream: 0,
      network: 0,
      other: 0
    }
  },
  // Response times
  responseTimes: [],
  // Token usage
  tokens: {
    input: 0,
    output: 0,
    byModel: {}
  },
  // Uptime
  startTime: Date.now(),
  // Active connections
  activeConnections: 0,
  // Cache stats
  cacheStats: {}
};

// Metric update helpers
export function incrementRequest(endpoint, statusCode) {
  metrics.requests.total++;
  if (metrics.requests.byEndpoint[endpoint] === undefined) {
    metrics.requests.byEndpoint[endpoint] = 0;
  }
  metrics.requests.byEndpoint[endpoint]++;

  const statusRange = Math.floor(statusCode / 100) + 'xx';
  if (metrics.requests.byStatus[statusRange]) {
    metrics.requests.byStatus[statusRange]++;
  }
}

export function incrementError(type = 'other') {
  metrics.errors.total++;
  if (metrics.errors.byType[type] !== undefined) {
    metrics.errors.byType[type]++;
  }
}

export function recordResponseTime(duration) {
  metrics.responseTimes.push(duration);
  // Keep only the latest 1000 samples
  if (metrics.responseTimes.length > 1000) {
    metrics.responseTimes.shift();
  }
}

export function recordTokenUsage(model, inputTokens, outputTokens) {
  metrics.tokens.input += inputTokens || 0;
  metrics.tokens.output += outputTokens || 0;

  if (!metrics.tokens.byModel[model]) {
    metrics.tokens.byModel[model] = { input: 0, output: 0 };
  }
  metrics.tokens.byModel[model].input += inputTokens || 0;
  metrics.tokens.byModel[model].output += outputTokens || 0;
}

export function setActiveConnections(count) {
  metrics.activeConnections = count;
}

export function setCacheStats(stats) {
  metrics.cacheStats = stats;
}

// Calculate response time stats
function getResponseTimeStats() {
  if (metrics.responseTimes.length === 0) {
    return { avg: 0, min: 0, max: 0, p95: 0 };
  }

  const sorted = [...metrics.responseTimes].sort((a, b) => a - b);
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const p95Index = Math.floor(sorted.length * 0.95);
  const p95 = sorted[p95Index];

  return { avg: avg.toFixed(2), min, max, p95 };
}

// Return all collected metrics
export function getMetrics() {
  const uptime = Date.now() - metrics.startTime;
  const memoryUsage = process.memoryUsage();
  const modelRequests =
    (metrics.requests.byEndpoint['/v1/messages'] || 0) +
    (metrics.requests.byEndpoint['/v1/messages/count_tokens'] || 0) +
    (metrics.requests.byEndpoint['/v1/models'] || 0);
  const internalRequests =
    (metrics.requests.byEndpoint['/health'] || 0) +
    (metrics.requests.byEndpoint['/metrics'] || 0) +
    (metrics.requests.byEndpoint['/api/usage'] || 0) +
    (metrics.requests.byEndpoint['/dashboard'] || 0);

  return {
    uptime: {
      seconds: Math.floor(uptime / 1000),
      human: formatUptime(uptime)
    },
    process: {
      pid: process.pid,
      version: process.version,
      memory: {
        rss: formatBytes(memoryUsage.rss),
        heapTotal: formatBytes(memoryUsage.heapTotal),
        heapUsed: formatBytes(memoryUsage.heapUsed),
        external: formatBytes(memoryUsage.external)
      }
    },
    requests: {
      ...metrics.requests,
      modelTotal: modelRequests,
      internalTotal: internalRequests,
      rate: {
        perSecond: (metrics.requests.total / (uptime / 1000)).toFixed(2),
        perMinute: ((metrics.requests.total / (uptime / 1000)) * 60).toFixed(2)
      }
    },
    errors: metrics.errors,
    responseTime: getResponseTimeStats(),
    tokens: metrics.tokens,
    activeConnections: metrics.activeConnections,
    cache: metrics.cacheStats
  };
}

// Utility functions
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Middleware for request tracking
export function metricsMiddleware(req, res, next) {
  const start = Date.now();
  const endpoint = (() => {
    try {
      return new URL(req.url || '/', 'http://localhost').pathname;
    } catch {
      return req.url || '/';
    }
  })();

  // Override res.end to capture the response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;

    // Record metrics
    incrementRequest(endpoint, res.statusCode);
    recordResponseTime(duration);

    if (res.statusCode >= 400) {
      const errorType = res.statusCode >= 500 ? 'network' : 'validation';
      incrementError(errorType);
    }

    // Restore the original method
    res.end = originalEnd;
    res.end(chunk, encoding);
  };

  next();
}
