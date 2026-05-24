'use strict';

const { sendFonnte } = require('./fonnte');
const { sendTelegram } = require('./telegram');
const config = require('../config');
const logger = require('../logger');

/**
 * Notifier multi-channel dengan cooldown in-memory.
 *
 * Cegah spam saat interface flap. Cooldown dikunci oleh `key`
 * (mis. "diskominfo:ether2:disabled", "rumah:wlan1:down").
 *
 * Penting:
 * - `canSend(key)` CEK cooldown saja, tanpa side-effect.
 * - `markSent(key)` set timestamp SETELAH actual send sukses.
 *   Pemisahan ini cegah bug: bila Fonnte gagal, cooldown TIDAK ter-set,
 *   sehingga tick berikutnya boleh retry.
 */
const lastSentAt = new Map();

function canSend(key) {
  const last = lastSentAt.get(key) || 0;
  return Date.now() - last >= config.notif.cooldownMs;
}

function markSent(key) {
  lastSentAt.set(key, Date.now());
}

function resetKey(key) {
  lastSentAt.delete(key);
}

/**
 * Kirim ke semua channel aktif (WA + Telegram).
 * Returns ringkasan setiap channel.
 *
 * Return shape:
 *   - { skipped: true, reason, key } bila cooldown atau key duplikat
 *   - { fonnte: {ok,error,...}, telegram: {...}, anyOk: bool } bila dikirim
 */
async function notifyAll(subject, message, { key, force = false } = {}) {
  if (key && !force && !canSend(key)) {
    logger.debug({ key }, 'notif skipped: cooldown');
    return { skipped: true, reason: 'cooldown', key };
  }

  const fullMessage = subject ? `${subject}\n\n${message}` : message;
  const tasks = [];
  if (config.fonnte.enabled) tasks.push(['fonnte', sendFonnte(fullMessage, { subject })]);
  if (config.telegram.enabled) tasks.push(['telegram', sendTelegram(fullMessage, { subject })]);

  if (tasks.length === 0) {
    return { skipped: true, reason: 'no-channel', key };
  }

  const out = {};
  let anyOk = false;
  const results = await Promise.allSettled(tasks.map(([, p]) => p));
  results.forEach((settled, idx) => {
    const [name] = tasks[idx];
    if (settled.status === 'fulfilled') {
      out[name] = settled.value;
      if (settled.value && settled.value.ok) anyOk = true;
    } else {
      out[name] = { ok: false, error: settled.reason && settled.reason.message };
    }
  });

  // Hanya mark cooldown bila SETIDAKNYA satu channel sukses kirim.
  // Bila semua channel gagal (mis. Fonnte timeout), tick berikutnya
  // boleh retry tanpa terblokir cooldown.
  if (key && anyOk) markSent(key);

  out.anyOk = anyOk;
  logger.info(
    { subject, key, anyOk, channels: Object.fromEntries(Object.entries(out).filter(([k]) => k !== 'anyOk').map(([k, v]) => [k, { ok: v.ok, error: v.error }])) },
    'notify dispatched'
  );
  return out;
}

module.exports = { notifyAll, canSend, markSent, resetKey };
