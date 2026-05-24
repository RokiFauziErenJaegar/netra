'use strict';

const path = require('path');
const express = require('express');
const config = require('./config');
const logger = require('./logger');
const pkg = require('../package.json');

const pagesRouter = require('./routes/pages');
const apiRouter = require('./routes/api');

// Asset version untuk cache-busting (?v=1.1.1).
// Berubah tiap rilis -> browser & CDN otomatis ambil ulang asset.
const ASSET_VERSION = pkg.version;

function createApp() {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.disable('x-powered-by');
  if (config.http.trustProxy) app.set('trust proxy', true);

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json({ limit: '256kb' }));

  // Expose asset version & helper ke semua view
  app.use((req, res, next) => {
    res.locals.assetV = ASSET_VERSION;
    res.locals.asset = (p) => `/static/${p}?v=${ASSET_VERSION}`;
    next();
  });

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

  // HTML responses: jangan di-cache (selalu fresh agar version query terbaru terambil).
  // Static asset: long cache + immutable (boleh, karena URL berubah saat versi naik).
  app.use((req, res, next) => {
    if (!req.path.startsWith('/static/') && req.method === 'GET') {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    }
    next();
  });

  app.use(
    '/static',
    express.static(path.join(__dirname, '..', 'public'), {
      maxAge: '365d',
      immutable: true,
      index: false,
      setHeaders: (res) => {
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
    })
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
