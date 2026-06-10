'use strict';

/**
 * Lapisan WhatsApp terpadu. Memilih provider aktif (Fonnte atau Roki WA Server)
 * berdasarkan setting runtime (app_settings), lalu meneruskan ke sender yang sesuai.
 *
 * Dipakai oleh notifier agar pemanggil tidak perlu tahu provider mana yang aktif.
 */

const { sendFonnte } = require('./fonnte');
const { sendRoki } = require('./roki');
const settings = require('./settings');

/**
 * Kirim pesan WhatsApp via provider yang sedang aktif.
 * @returns {Promise<{ok:boolean, error?:string, response?:string, provider:string}>}
 */
async function sendWhatsapp(message, opts = {}) {
  const wa = await settings.getWaConfig();
  const provider = opts.provider || wa.provider;

  let out;
  if (provider === 'roki') {
    out = await sendRoki(message, opts);
  } else {
    out = await sendFonnte(message, opts);
  }
  return { ...out, provider };
}

module.exports = { sendWhatsapp, isWaEnabled: settings.isWaEnabled, getWaConfig: settings.getWaConfig };
