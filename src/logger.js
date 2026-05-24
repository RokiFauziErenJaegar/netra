'use strict';

const pino = require('pino');
const config = require('./config');

const transport = config.log.pretty
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname'
      }
    }
  : undefined;

const logger = pino({
  level: config.log.level,
  transport,
  base: { app: 'netra' }
});

module.exports = logger;
