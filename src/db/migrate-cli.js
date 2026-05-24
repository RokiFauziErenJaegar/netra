'use strict';

const { ensureSchema } = require('./migrations');
const { close } = require('./index');
const logger = require('../logger');

(async () => {
  try {
    await ensureSchema();
    logger.info('migration complete');
  } catch (err) {
    logger.error({ err }, 'migration failed');
    process.exitCode = 1;
  } finally {
    await close();
  }
})();
