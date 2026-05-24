'use strict';

require('dotenv').config();

function int(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function parseOpdRouters(raw) {
  if (!raw) return [];
  return raw
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, host, user, password] = part.split('|').map((v) => (v || '').trim());
      if (!name || !host) return null;
      return { name, host, user: user || 'admin', password: password || '' };
    })
    .filter(Boolean);
}

const config = {
  env: process.env.NODE_ENV || 'development',
  http: {
    port: int(process.env.PORT, 3000),
    host: process.env.HOST || '0.0.0.0',
    trustProxy: bool(process.env.TRUST_PROXY, false)
  },
  log: {
    level: process.env.LOG_LEVEL || 'info',
    pretty: bool(process.env.LOG_PRETTY, true)
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: int(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'db_monitoring_pringsewu',
    poolLimit: int(process.env.DB_POOL_LIMIT, 10)
  },
  mikrotik: {
    diskominfo: {
      host: process.env.MIKROTIK_DISKOMINFO_HOST || '10.100.100.1',
      user: process.env.MIKROTIK_DISKOMINFO_USER || 'admin',
      password: process.env.MIKROTIK_DISKOMINFO_PASSWORD || '',
      port: int(process.env.MIKROTIK_DISKOMINFO_PORT, 8728),
      tls: bool(process.env.MIKROTIK_DISKOMINFO_TLS, false),
      timeoutMs: int(process.env.MIKROTIK_DISKOMINFO_TIMEOUT_MS, 5000)
    },
    rumah: {
      host: process.env.MIKROTIK_RUMAH_HOST || '192.168.1.11',
      user: process.env.MIKROTIK_RUMAH_USER || 'admin',
      password: process.env.MIKROTIK_RUMAH_PASSWORD || '',
      port: int(process.env.MIKROTIK_RUMAH_PORT, 8728),
      tls: bool(process.env.MIKROTIK_RUMAH_TLS, false),
      timeoutMs: int(process.env.MIKROTIK_RUMAH_TIMEOUT_MS, 5000)
    }
  },
  poll: {
    diskominfoMs: int(process.env.POLL_INTERVAL_DISKOMINFO_MS, 5000),
    rumahMs: int(process.env.POLL_INTERVAL_RUMAH_MS, 5000)
  },
  opd: {
    routers: parseOpdRouters(process.env.OPD_ROUTERS || ''),
    timeoutMs: int(process.env.OPD_ROUTER_TIMEOUT_MS, 3000)
  },
  fonnte: {
    token: process.env.FONNTE_TOKEN || '',
    target: process.env.FONNTE_TARGET || '',
    enabled: bool(process.env.FONNTE_ENABLED, true)
  },
  telegram: {
    token: process.env.TELEGRAM_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    enabled: bool(process.env.TELEGRAM_ENABLED, false)
  },
  notif: {
    cooldownMs: int(process.env.NOTIF_COOLDOWN_MS, 5 * 60 * 1000)
  }
};

module.exports = config;
