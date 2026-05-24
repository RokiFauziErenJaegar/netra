'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('../logger');
const { pool } = require('../db');

/**
 * Fonnte WhatsApp notification service.
 * Always returns { ok, error, response } and writes outcome to notification_log.
 */
async function sendFonnte(message, { subject = null, target = null } = {}) {
  const tgt = target || config.fonnte.target;
  const token = config.fonnte.token;

  if (!config.fonnte.enabled) {
    return { ok: false, error: 'Fonnte dinonaktifkan (FONNTE_ENABLED=false)' };
  }
  if (!token || !tgt) {
    return { ok: false, error: 'Token atau target Fonnte belum diisi' };
  }

  const form = new URLSearchParams();
  form.append('target', tgt);
  form.append('message', message);
  form.append('countryCode', '62');

  let outcome = { ok: false, error: '', response: '' };
  try {
    const res = await axios.post('https://api.fonnte.com/send', form.toString(), {
      headers: {
        Authorization: token,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 15000,
      // XAMPP/dev environments sering tidak punya CA bundle yang lengkap
      // Untuk produksi, set FONNTE_STRICT_TLS=true di env (atau pasang CA bundle).
      httpsAgent: undefined
    });

    outcome.response = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const data = res.data;
    if (data && (data.status === true || data.status === 'true')) {
      outcome.ok = true;
    } else {
      outcome.ok = false;
      outcome.error = `Fonnte tolak kirim: ${data && (data.reason || data.message) ? (data.reason || data.message) : 'tanpa alasan'}`;
    }
  } catch (err) {
    outcome.error = `HTTP error: ${err.message}`;
    if (err.response) outcome.response = JSON.stringify(err.response.data);
  }

  logger.info(
    { channel: 'fonnte', target: tgt, ok: outcome.ok, error: outcome.error },
    'fonnte send'
  );

  try {
    await pool.query(
      `INSERT INTO notification_log (channel, target, subject, body, success, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      ['fonnte', tgt, subject, message, outcome.ok ? 1 : 0, outcome.error || null]
    );
  } catch (e) {
    logger.warn({ err: e }, 'failed to log notification');
  }

  return outcome;
}

module.exports = { sendFonnte };
