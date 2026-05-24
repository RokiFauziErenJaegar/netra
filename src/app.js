'use strict';

const path = require('path');
const express = require('express');
const config = require('./config');
const logger = require('./logger');

const pagesRouter = require('./routes/pages');
const apiRouter = require('./routes/api');

function createApp() {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.disable('x-powered-by');
  if (config.http.trustProxy) app.set('trust proxy', true);

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json({ limit: '256kb' }));

  // request logging (lightweight)
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.debug(
        { method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - start },
        'http'
      );
    });
    next();
  });

  app.use(
    '/static',
    express.static(path.join(__dirname, '..', 'public'), { maxAge: '7d', index: false })
  );

  // health check (untuk PM2 / load-balancer / monitoring eksternal)
  app.get('/healthz', (req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.use('/api', apiRouter);
  app.use('/', pagesRouter);

  // 404
  app.use((req, res) => {
    res.status(404).render('error', {
      page: 'error',
      code: 404,
      message: 'Halaman tidak ditemukan'
    });
  });

  // error handler
  app.use((err, req, res, next) => {
    logger.error({ err: err.message, stack: err.stack, url: req.url }, 'unhandled');
    res.status(500).render('error', {
      page: 'error',
      code: 500,
      message: 'Terjadi kesalahan di server'
    });
  });

  return app;
}

module.exports = { createApp };
