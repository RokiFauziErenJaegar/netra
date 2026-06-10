'use strict';

/**
 * Penyimpanan setting aplikasi berbasis DB (tabel app_settings), dengan
 * cache in-memory. Dipakai untuk konfigurasi yang dapat diubah saat runtime
 * lewat UI tanpa perlu edit .env / restart — mis. pemilihan provider WA OTP.
 *
 * Nilai default diambil dari .env (config) saat key belum pernah diset.
 */

const { pool } = require('../db');
const config = require('../config');
const logger = require('../logger');
const { nowMysql } = require('./helpers');

// Default setting WA. roki_token & base_url di-seed dari nilai yang diberikan
// operator; bisa diubah lewat halaman "Server WA OTP".
// Default WA. Nilai sensitif (token/url) di-seed dari .env, JANGAN hardcode
// rahasia di source. Operator dapat menimpa lewat halaman "Server WA OTP"
// (tersimpan di DB app_settings).
const DEFAULTS = {
  wa_provider: 'fonnte', // 'fonnte' | 'roki'
  roki_base_url: process.env.ROKI_BASE_URL || 'http://localhost:5001',
  roki_token: process.env.ROKI_TOKEN || '',
  roki_target: process.env.ROKI_TARGET || config.fonnte.target || '',
  roki_enabled: '1'
};

let cache = null; // Map<string,string> | null (null = belum di-load)

async function ensureLoaded() {
  if (cache) return;
  cache = new Map();
  try {
    const [rows] = await pool.query('SELECT skey, svalue FROM app_settings');
    for (const r of rows) cache.set(r.skey, r.svalue);
  } catch (e) {
    logger.warn({ err: e.message }, 'gagal load app_settings (pakai default)');
  }
}

async function getRaw(key) {
  await ensureLoaded();
  if (cache.has(key)) return cache.get(key);
  return DEFAULTS[key] !== undefined ? DEFAULTS[key] : null;
}

async function set(key, value) {
  await ensureLoaded();
  const v = value == null ? '' : String(value);
  await pool.query(
    `INSERT INTO app_settings (skey, svalue, updated_at) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE svalue = VALUES(svalue), updated_at = VALUES(updated_at)`,
    [key, v, nowMysql()]
  );
  cache.set(key, v);
}

async function setMany(obj) {
  for (const [k, v] of Object.entries(obj)) await set(k, v);
}

/**
 * Konfigurasi WA terpadu yang sudah ter-resolve (default + override DB).
 * Berisi info kedua provider plus mana yang aktif.
 */
async function getWaConfig() {
  await ensureLoaded();
  const get = (k) => (cache.has(k) ? cache.get(k) : DEFAULTS[k]);
  const provider = get('wa_provider') === 'roki' ? 'roki' : 'fonnte';

  const fonnte = {
    enabled: config.fonnte.enabled,
    token: config.fonnte.token,
    target: config.fonnte.target,
    configured: !!(config.fonnte.token && config.fonnte.target)
  };
  const roki = {
    enabled: /^(1|true|yes|on)$/i.test(String(get('roki_enabled'))),
    baseUrl: String(get('roki_base_url') || '').replace(/\/+$/, ''),
    token: get('roki_token') || '',
    target: get('roki_target') || ''
  };
  roki.configured = !!(roki.baseUrl && roki.token && roki.target);

  return { provider, fonnte, roki };
}

/** Apakah channel WA aktif (provider terpilih enabled & terkonfigurasi). */
async function isWaEnabled() {
  const wa = await getWaConfig();
  if (wa.provider === 'roki') return wa.roki.enabled && wa.roki.configured;
  return wa.fonnte.enabled && wa.fonnte.configured;
}

module.exports = { getRaw, set, setMany, getWaConfig, isWaEnabled, DEFAULTS };
