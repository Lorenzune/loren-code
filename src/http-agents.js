import http from 'node:http';
import https from 'node:https';
import logger from './logger.js';

// Agent per connessioni HTTP (keep-alive abilitato)
export const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50, // Massimo 50 connessioni contemporanee
  maxFreeSockets: 10, // Mantieni fino a 10 connessioni aperte in idle
  timeout: 60000, // Timeout di 60 secondi
  freeSocketTimeout: 30000, // Chiudi socket idle dopo 30 secondi
  scheduling: 'lifo' // Last In, First Out per miglior performance
});

// Agent per connessioni HTTPS
export const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
  freeSocketTimeout: 30000,
  scheduling: 'lifo'
});

// Funzione helper per ottenere l'agent corretto
export function getAgent(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? httpsAgent : httpAgent;
  } catch (error) {
    logger.error(`Invalid URL for agent selection: ${error.message}`);
    return httpAgent;
  }
}

// Stats per monitoraggio
export function getAgentStats() {
  return {
    http: {
      totalSocketCount: httpAgent.totalSocketCount,
      createSocketCount: httpAgent.createSocketCount,
      timeoutSocketCount: httpAgent.timeoutSocketCount,
      requestCount: httpAgent.requestCount,
      freeSockets: Object.keys(httpAgent.freeSockets).length,
      sockets: Object.keys(httpAgent.sockets).length
    },
    https: {
      totalSocketCount: httpsAgent.totalSocketCount,
      createSocketCount: httpsAgent.createSocketCount,
      timeoutSocketCount: httpsAgent.timeoutSocketCount,
      requestCount: httpsAgent.requestCount,
      freeSockets: Object.keys(httpsAgent.freeSockets).length,
      sockets: Object.keys(httpsAgent.sockets).length
    }
  };
}

// Cleanup function per chiudere tutti gli agent
export function closeAgents() {
  return new Promise((resolve) => {
    let pending = 2;

    const done = () => {
      if (--pending === 0) {
        logger.info('All HTTP agents closed');
        resolve();
      }
    };

    httpAgent.destroy(() => {
      logger.debug('HTTP agent destroyed');
      done();
    });

    httpsAgent.destroy(() => {
      logger.debug('HTTPS agent destroyed');
      done();
    });
  });
}