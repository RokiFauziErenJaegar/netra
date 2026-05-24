'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('../logger');
const { pool } = require('../db');

async function sendTelegram(message, { subject = null } = {}) {
  if (!config.telegram.enabled) {
    return { ok: false, error: 'Telegram dinonaktifkan' };
  }
  if (!config.telegram.token || !config.telegram.chatId) {
    return { ok: false, error: 'Token atau chat_id Telegram belum diisi' };
  }

  const url = `https://api.telegram.org/bot${config.telegram.token}/sendMessage`;
  let outcome = { ok: false, error: '', response: '' };

  try {
    const res = await axios.post(
      url,
      {
        chat_id: config.telegram.chatId,
        text: message,
        parse_mode: 'HTML'
      },
      { timeout: 10000 }
    );
    outcome.response = JSON.stringify(res.data);
    outcome.ok = !!(res.data && res.data.ok);
    if (!outcome.ok) outcome.error = `Telegram tolak: ${res.data && res.data.description}`;
  } catch (err) {
    outcome.error = `HTTP error: ${err.message}`;
  }

  logger.info({ channel: 'telegram', ok: outcome.ok, error: outcome.error }, 'telegram send');

  try {
    await pool.query(
      `INSERT INTO notification_log (channel, target, subject, body, success, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      ['telegram', config.telegram.chatId, subject, message, outcome.ok ? 1 : 0, outcome.error || null]
    );
  } catch (e) {
    logger.warn({ err: e }, 'failed to log notification');
  }

  return outcome;
}

module.exports = { sendTelegram };
