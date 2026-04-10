import logger from './logger.js';
import { loadConfig } from './config.js';

const usageData = new Map();
const rateLimitData = new Map();

const SESSION_RESET_HOURS = 3;
const WEEKLY_RESET_DAY = 1; // Monday
const WEEKLY_RESET_HOUR = 14; // 2pm
const WEEKLY_RESET_MINUTE = 0;

function createObservedUsage() {
  return {
    observed: {
      requests: 0,
      tokens: 0,
      firstSeenAt: Date.now(),
    },
    probe: {
      tested: false,
      status: 'untested',
      lastProbeAt: null,
      lastError: null,
    },
    lastUpdated: Date.now(),
  };
}

function getNextSessionReset(now = new Date()) {
  const next = new Date(now.getTime());
  next.setMinutes(0, 0, 0);

  const currentHour = next.getHours();
  const nextBoundaryHour = Math.floor(currentHour / SESSION_RESET_HOURS) * SESSION_RESET_HOURS + SESSION_RESET_HOURS;

  if (nextBoundaryHour >= 24) {
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    return next.getTime();
  }

  next.setHours(nextBoundaryHour, 0, 0, 0);
  return next.getTime();
}

function getNextWeeklyReset(now = new Date()) {
  const next = new Date(now.getTime());
  next.setSeconds(0, 0);
  next.setHours(WEEKLY_RESET_HOUR, WEEKLY_RESET_MINUTE, 0, 0);

  const currentDay = next.getDay();
  let daysUntilReset = (WEEKLY_RESET_DAY - currentDay + 7) % 7;

  if (daysUntilReset === 0 && next.getTime() <= now.getTime()) {
    daysUntilReset = 7;
  }

  next.setDate(next.getDate() + daysUntilReset);
  return next.getTime();
}

export class UsageTracker {
  constructor() {
    this.syncKeysFromConfig();
  }

  syncKeysFromConfig() {
    try {
      const config = loadConfig();
      const activeKeys = new Set(config.apiKeys);

      for (const key of usageData.keys()) {
        if (!activeKeys.has(key)) {
          usageData.delete(key);
          rateLimitData.delete(key);
        }
      }

      config.apiKeys.forEach((key) => {
        if (!usageData.has(key)) {
          usageData.set(key, createObservedUsage());
          logger.info(`Initialized usage tracking for key ${key.substring(0, 20)}...`);
        }
      });
    } catch (error) {
      logger.error(`Failed to sync keys from config: ${error.message}`);
    }
  }

  recordUsage(apiKey, tokens = 0) {
    if (!apiKey) {
      return;
    }

    let data = usageData.get(apiKey);
    if (!data) {
      data = createObservedUsage();
      usageData.set(apiKey, data);
    }

    data.observed.requests++;
    data.observed.tokens += tokens;
    data.lastUpdated = Date.now();

    logger.debug(`Usage recorded for key ${apiKey.substring(0, 20)}...: +1 request, +${tokens} tokens`);
  }

  isRateLimited(apiKey) {
    const rateLimit = rateLimitData.get(apiKey);
    if (!rateLimit) {
      return false;
    }

    if (typeof rateLimit.resetTime === 'number' && Date.now() > rateLimit.resetTime) {
      rateLimitData.delete(apiKey);
      logger.info(`Rate limit expired for key ${apiKey.substring(0, 20)}...`);
      return false;
    }

    return rateLimit.rateLimited;
  }

  markRateLimited(apiKey, resetTime = null, reason = 'Rate limit reached') {
    const data = usageData.get(apiKey) || createObservedUsage();
    data.probe.tested = true;
    data.probe.status = 'rate_limited';
    data.probe.lastProbeAt = Date.now();
    data.probe.lastError = reason;
    data.lastUpdated = Date.now();
    usageData.set(apiKey, data);

    rateLimitData.set(apiKey, {
      rateLimited: true,
      resetTime: typeof resetTime === 'number' ? resetTime : null,
      reason,
      markedAt: Date.now(),
    });

    if (typeof resetTime === 'number') {
      logger.warn(`Key ${apiKey.substring(0, 20)}... marked as rate limited. Reset in ${Math.ceil((resetTime - Date.now()) / 60000)} minutes`);
    } else {
      logger.warn(`Key ${apiKey.substring(0, 20)}... marked as rate limited. Reset time unknown.`);
    }
  }

  markHealthy(apiKey) {
    const data = usageData.get(apiKey) || createObservedUsage();
    data.probe.tested = true;
    data.probe.status = 'available';
    data.probe.lastProbeAt = Date.now();
    data.probe.lastError = null;
    data.lastUpdated = Date.now();
    usageData.set(apiKey, data);

    if (!rateLimitData.has(apiKey)) {
      return;
    }

    rateLimitData.delete(apiKey);
    logger.info(`Cleared rate limit state for key ${apiKey.substring(0, 20)}...`);
  }

  markUnhealthy(apiKey, reason = 'Request failed') {
    const data = usageData.get(apiKey) || createObservedUsage();
    data.probe.tested = true;
    data.probe.status = 'unhealthy';
    data.probe.lastProbeAt = Date.now();
    data.probe.lastError = reason;
    data.lastUpdated = Date.now();
    usageData.set(apiKey, data);
  }

  getKeyUsage(apiKey) {
    const data = usageData.get(apiKey) || createObservedUsage();
    const rateLimit = rateLimitData.get(apiKey);
    const sessionResetTime = getNextSessionReset();
    const weeklyResetTime = getNextWeeklyReset();

    return {
      observed: {
        requests: data.observed.requests,
        tokens: data.observed.tokens,
        firstSeenAt: data.observed.firstSeenAt,
      },
      probe: {
        tested: data.probe?.tested || false,
        status: data.probe?.status || 'untested',
        lastProbeAt: data.probe?.lastProbeAt || null,
        lastError: data.probe?.lastError || null,
      },
      limits: {
        session: {
          used: null,
          limit: null,
          percentage: null,
          resetTime: sessionResetTime,
        },
        weekly: {
          used: null,
          limit: null,
          percentage: null,
          resetTime: weeklyResetTime,
        },
      },
      rateLimit: {
        active: rateLimit?.rateLimited || false,
        reason: rateLimit?.reason || null,
        resetTime: rateLimit?.resetTime || null,
        resetInMs: typeof rateLimit?.resetTime === 'number' ? Math.max(0, rateLimit.resetTime - Date.now()) : null,
      },
    };
  }

  getAllKeysUsage() {
    const result = [];

    for (const [key, data] of usageData) {
      const usage = this.getKeyUsage(key);
      result.push({
        key,
        usage,
        isRateLimited: usage.rateLimit.active,
        isTested: usage.probe.tested,
        availabilityStatus: usage.probe.status,
        rateLimitResetTime: usage.rateLimit.resetTime,
        rateLimitReason: usage.rateLimit.reason,
        lastUpdated: data.lastUpdated,
      });
    }

    return result;
  }

  getRateLimitResetTime(apiKey) {
    const rateLimit = rateLimitData.get(apiKey);
    if (!rateLimit || !rateLimit.rateLimited || typeof rateLimit.resetTime !== 'number') {
      return null;
    }

    const now = Date.now();
    if (now > rateLimit.resetTime) {
      return 0;
    }

    return rateLimit.resetTime - now;
  }

  suggestNextKey(availableKeys) {
    const healthyKeys = availableKeys.filter((key) => !this.isRateLimited(key));

    if (healthyKeys.length === 0) {
      logger.warn('All API keys are rate limited!');
      return null;
    }

    let suggestedKey = healthyKeys[0];
    let minRequests = Infinity;

    for (const key of healthyKeys) {
      const usage = this.getKeyUsage(key);
      if (usage.observed.requests < minRequests) {
        minRequests = usage.observed.requests;
        suggestedKey = key;
      }
    }

    logger.debug(`Suggested key: ${suggestedKey.substring(0, 20)}... (observed requests: ${minRequests})`);
    return suggestedKey;
  }

  resetAll() {
    try {
      const config = loadConfig();

      usageData.clear();
      rateLimitData.clear();

      config.apiKeys.forEach((key) => {
        usageData.set(key, createObservedUsage());
      });

      logger.info('Usage data reset to zero for all keys');
      return true;
    } catch (error) {
      logger.error(`Failed to reset usage data: ${error.message}`);
      return false;
    }
  }

  getDashboardData() {
    const keysUsage = this.getAllKeysUsage();
    const totalUsage = keysUsage.reduce((acc, key) => {
      acc.requests += key.usage.observed.requests;
      acc.tokens += key.usage.observed.tokens;
      return acc;
    }, { requests: 0, tokens: 0 });

    const rateLimitedKeys = keysUsage.filter((key) => key.isRateLimited).length;
    const availableKeys = keysUsage.filter((key) => key.availabilityStatus === 'available').length;
    const untestedKeys = keysUsage.filter((key) => !key.isTested).length;
    const unhealthyKeys = keysUsage.filter((key) => key.availabilityStatus === 'unhealthy').length;
    const knownResets = keysUsage
      .map((key) => key.rateLimitResetTime)
      .filter((value) => typeof value === 'number' && value > Date.now());
    const sessionResetTime = getNextSessionReset();
    const weeklyResetTime = getNextWeeklyReset();

    return {
      summary: {
        totalKeys: keysUsage.length,
        healthyKeys: availableKeys,
        availableKeys,
        untestedKeys,
        unhealthyKeys,
        rateLimitedKeys,
        observed: {
          requests: totalUsage.requests,
          tokens: totalUsage.tokens,
        },
        limits: {
          session: {
            used: null,
            limit: null,
            percentage: null,
            resetsIn: sessionResetTime - Date.now(),
            resetTime: sessionResetTime,
          },
          weekly: {
            used: null,
            limit: null,
            percentage: null,
            resetsIn: weeklyResetTime - Date.now(),
            resetTime: weeklyResetTime,
          },
        },
        rateLimit: {
          active: rateLimitedKeys,
          nextResetIn: knownResets.length ? Math.min(...knownResets) - Date.now() : null,
        },
      },
      keys: keysUsage,
    };
  }
}

export default new UsageTracker();
