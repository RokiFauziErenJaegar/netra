'use strict';

/**
 * Roki WA Server sender — gateway WhatsApp self-hosted (alternatif Fonnte).
 * API kompatibel Fonnte: POST <baseUrl>/send, header Authorization: <token>,
 * body target & message, respons { status, id, detail, reason }.
 *
 * Selalu mengembalikan { ok, error, response } dan mencatat hasil ke
 * notification_log (channel 'roki').
 */

const axios = require('axios');
const logger = require('../logger');
const { pool } = require('../db');
const settings = require('./settings');

async function sendRoki(message, { subject = null, target = null, baseUrl = null, token = null } = {}) {
  const wa = await settings.getWaConfig();
  const url = (baseUrl || wa.roki.baseUrl || '').replace(/\/+$/, '');
  const tk = token || wa.roki.token;
  const tgt = target || wa.roki.target;

  if (!url || !tk) {
    return { ok: false, error: 'Base URL atau token Roki WA Server belum diisi' };
  }
  if (!tgt) {
    return { ok: false, error: 'Target (nomor tujuan) Roki belum diisi' };
  }

  const form = new URLSearchParams();
  form.append('target', tgt);
  form.append('message', message);

  const outcome = { ok: false, error: '', response: '' };
  try {
    const res = await axios.post(`${url}/send`, form.toString(), {
      headers: {
        Authorization: tk,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 20000
    });
    outcome.response = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const data = res.data;
    if (data && (data.status === true || data.status === 'true')) {
      outcome.ok = true;
    } else {
      outcome.error = `Roki tolak kirim: ${data && (data.reason || data.detail || data.message) ? (data.reason || data.detail || data.message) : 'tanpa alasan'}`;
    }
  } catch (err) {
    outcome.error = `HTTP error: ${err.message}`;
    if (err.response) outcome.response = JSON.stringify(err.response.data);
  }

  logger.info({ channel: 'roki', target: tgt, ok: outcome.ok, error: outcome.error }, 'roki send');

  try {
    await pool.query(
      `INSERT INTO notification_log (channel, target, subject, body, success, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      ['roki', tgt, subject, message, outcome.ok ? 1 : 0, outcome.error || null]
    );
  } catch (e) {
    logger.warn({ err: e }, 'failed to log notification (roki)');
  }

  return outcome;
}

module.exports = { sendRoki };
