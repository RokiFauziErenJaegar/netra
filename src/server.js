'use strict';

const http = require('http');
const config = require('./config');
const logger = require('./logger');
const { createApp } = require('./app');
const { ensureSchema } = require('./db/migrations');
const { close: closeDb } = require('./db');
const wsHub = require('./services/wsHub');
const diskominfoMonitor = require('./services/monitorDiskominfo');
const rumahMonitor = require('./services/monitorRumah');

async function main() {
  logger.info({ env: config.env }, 'Netra starting…');

  await ensureSchema();

  const app = createApp();
  const server = http.createServer(app);

  wsHub.attach(server);

  // Mulai poller (background) — tidak bergantung pada client browser
  diskominfoMonitor.start();
  rumahMonitor.start();

  server.listen(config.http.port, config.http.host, () => {
    logger.info(
      { host: config.http.host, port: config.http.port },
      `HTTP siap di http://${config.http.host}:${config.http.port}`
    );
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, 'shutting down');
    diskominfoMonitor.stop();
    rumahMonitor.stop();
    server.close(() => logger.info('http server closed'));
    try {
      await closeDb();
    } catch (e) {
      logger.warn({ err: e.message }, 'db close failed');
    }
    setTimeout(() => process.exit(0), 800);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err: err.message, stack: err.stack }, 'uncaughtException');
  });
}

main().catch((err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'startup failed');
  process.exit(1);
});
