'use strict';

const { sendFonnte } = require('./fonnte');
const { sendTelegram } = require('./telegram');
const config = require('../config');
const logger = require('../logger');

/**
 * Notifier dengan cooldown in-memory.
 * Cegah spam saat interface flap. Cooldown dikunci oleh `key`
 * (mis. "diskominfo:ether2:disabled", "rumah:wlan1:down").
 */
const lastSentAt = new Map();

function shouldSend(key) {
  const now = Date.now();
  const last = lastSentAt.get(key) || 0;
  if (now - last < config.notif.cooldownMs) return false;
  lastSentAt.set(key, now);
  return true;
}

function resetKey(key) {
  lastSentAt.delete(key);
}

/**
 * Kirim ke semua channel aktif (WA + Telegram).
 * Returns ringkasan setiap channel.
 */
async function notifyAll(subject, message, { key, force = false } = {}) {
  if (key && !force && !shouldSend(key)) {
    return { skipped: true, reason: 'cooldown', key };
  }

  const fullMessage = subject ? `${subject}\n\n${message}` : message;
  const tasks = [];
  if (config.fonnte.enabled) tasks.push(sendFonnte(fullMessage, { subject }));
  if (config.telegram.enabled) tasks.push(sendTelegram(fullMessage, { subject }));

  const results = await Promise.allSettled(tasks);
  const out = {};
  let i = 0;
  if (config.fonnte.enabled) out.fonnte = unwrap(results[i++]);
  if (config.telegram.enabled) out.telegram = unwrap(results[i++]);

  logger.info({ subject, key, channels: out }, 'notify dispatched');
  return out;
}

function unwrap(settled) {
  if (settled.status === 'fulfilled') return settled.value;
  return { ok: false, error: settled.reason && settled.reason.message };
}

module.exports = { notifyAll, shouldSend, resetKey };
