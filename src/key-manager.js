import logger from './logger.js';

export class KeyManager {
  constructor(keys) {
    this.keys = keys.map(key => ({
      key,
      healthy: true,
      lastUsed: null,
      failureCount: 0,
      lastFailure: null
    }));
    this.index = 0;
    this.maxFailures = 3;
    this.failureWindowMs = 5 * 60 * 1000; // 5 minuti
  }

  async getHealthyKey() {
    const startIndex = this.index;
    const now = Date.now();

    do {
      const keyInfo = this.keys[this.index];

      // Resetta lo stato se è passato abbastanza tempo dall'ultimo fallimento
      if (keyInfo.lastFailure && (now - keyInfo.lastFailure) > this.failureWindowMs) {
        keyInfo.failureCount = 0;
        keyInfo.healthy = true;
      }

      if (keyInfo.healthy && keyInfo.failureCount < this.maxFailures) {
        this.index = (this.index + 1) % this.keys.length;
        keyInfo.lastUsed = now;
        logger.debug(`Using API key at index ${this.index}, failures: ${keyInfo.failureCount}`);
        return keyInfo.key;
      }

      this.index = (this.index + 1) % this.keys.length;
    } while (this.index !== startIndex);

    logger.error('No healthy API keys available');
    throw new Error('No healthy API keys available');
  }

  markKeyFailed(key, error) {
    const keyInfo = this.keys.find(k => k.key === key);
    if (keyInfo) {
      keyInfo.failureCount++;
      keyInfo.lastFailure = Date.now();
      if (keyInfo.failureCount >= this.maxFailures) {
        keyInfo.healthy = false;
        logger.warn(`API key marked as unhealthy after ${this.maxFailures} failures`);
      }
      logger.error(`API key failed (count: ${keyInfo.failureCount}): ${error.message}`);
    }
  }

  getStats() {
    return {
      total: this.keys.length,
      healthy: this.keys.filter(k => k.healthy).length,
      unhealthy: this.keys.filter(k => !k.healthy).length,
      keys: this.keys.map(k => ({
        healthy: k.healthy,
        failureCount: k.failureCount,
        lastUsed: k.lastUsed
      }))
    };
  }
}