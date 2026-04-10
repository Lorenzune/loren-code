import fs from 'node:fs';
import path from 'node:path';
import logger from './logger.js';

export class ConfigWatcher {
  constructor(configFile, onChange) {
    this.configFile = configFile;
    this.onChange = onChange;
    this.watcher = null;
    this.debounceTimeout = 1000; // 1 second
    this.debounceTimer = null;
  }

  start() {
    if (this.watcher) {
      logger.warn('Config watcher already started');
      return;
    }

    try {
      this.watcher = fs.watch(this.configFile, (eventType, filename) => {
        if (eventType === 'change') {
          logger.debug(`Config file changed: ${filename}`);
          this.handleChange();
        }
      });

      logger.info(`Started watching config file: ${this.configFile}`);
    } catch (error) {
      logger.error(`Failed to start config watcher: ${error.message}`);
    }
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      logger.info('Config watcher stopped');
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  handleChange() {
    // Debounce to avoid multiple rapid reloads
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      try {
        logger.info('Reloading configuration...');
        await this.onChange();
        logger.info('Configuration reloaded successfully');
      } catch (error) {
        logger.error(`Failed to reload configuration: ${error.message}`);
      }
    }, this.debounceTimeout);
  }
}

// Helper to create a config watcher with automatic reload
export function createConfigWatcher(configFile, loadConfigFunction) {
  const watcher = new ConfigWatcher(configFile, async () => {
    const newConfig = loadConfigFunction();
    return newConfig;
  });

  return watcher;
}
