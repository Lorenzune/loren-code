import NodeCache from 'node-cache';
import logger from './logger.js';

// Cache for models (5 minute TTL)
export const modelCache = new NodeCache({
  stdTTL: 300, // 5 minutes
  checkperiod: 60, // Check for expired entries every minute
  useClones: false // Better performance when values are not cloned
});

// Cache for API responses (30 seconds)
export const apiCache = new NodeCache({
  stdTTL: 30,
  checkperiod: 10,
  useClones: false
});

// Helper for cache access with error handling
export function getFromCache(cache, key) {
  try {
    const value = cache.get(key);
    if (value !== undefined) {
      logger.debug(`Cache hit for key: ${key}`);
    }
    return value;
  } catch (error) {
    logger.error(`Error reading from cache: ${error.message}`);
    return undefined;
  }
}

export function setInCache(cache, key, value, ttl) {
  try {
    if (ttl) {
      cache.set(key, value, ttl);
    } else {
      cache.set(key, value);
    }
    logger.debug(`Cached value for key: ${key}`);
  } catch (error) {
    logger.error(`Error writing to cache: ${error.message}`);
  }
}

export function deleteFromCache(cache, key) {
  try {
    cache.del(key);
    logger.debug(`Deleted cache for key: ${key}`);
  } catch (error) {
    logger.error(`Error deleting from cache: ${error.message}`);
  }
}

// Monitoring stats
export function getCacheStats(cache, name) {
  const stats = cache.getStats();
  return {
    name,
    hits: stats.hits,
    misses: stats.misses,
    keys: cache.keys().length,
    hitRate: stats.hits > 0 ? (stats.hits / (stats.hits + stats.misses) * 100).toFixed(2) : 0
  };
}
