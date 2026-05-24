'use strict';

const { MikroTikClient } = require('./mikrotik');
const { pool } = require('../db');
const logger = require('../logger');
const config = require('../config');
const wsHub = require('./wsHub');
const { notifyAll } = require('./notifier');
const { nowMysql, boolMt } = require('./helpers');

/**
 * Single-process poller untuk MikroTik utama (Diskominfo).
 * - Polling interval dapat dikonfigurasi (sub-detik bila perlu).
 * - Sekali baca, sekali tulis DB, sekali broadcast WS, satu kali notif (cooldown).
 * - Aman dari overlap: bila tick berikutnya tiba sementara yang lama masih berjalan,
 *   tick baru di-skip (back-pressure sederhana).
 */
class DiskominfoMonitor {
  constructor() {
    this.client = new MikroTikClient({
      host: config.mikrotik.diskominfo.host,
      user: config.mikrotik.diskominfo.user,
      password: config.mikrotik.diskominfo.password,
      port: config.mikrotik.diskominfo.port,
      tls: config.mikrotik.diskominfo.tls,
      timeoutMs: config.mikrotik.diskominfo.timeoutMs,
      label: 'diskominfo'
    });
    this.timer = null;
    this.running = false;
    this.lastSnapshot = null;
    this.lastError = null;
    this.tickCount = 0;
  }

  start() {
    if (this.timer) return;
    const interval = Math.max(500, config.poll.diskominfoMs);
    logger.info({ host: this.client.host, intervalMs: interval }, 'Diskominfo monitor started');
    const tick = () => {
      if (this.running) return; // skip overlap
      this.running = true;
      this.runOnce()
        .catch((err) => {
          this.lastError = err.message;
          logger.warn({ err: err.message }, 'diskominfo tick failed');
        })
        .finally(() => {
          this.running = false;
        });
    };
    tick();
    this.timer = setInterval(tick, interval);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce() {
    this.tickCount++;
    const waktu = nowMysql();
    let snapshot;
    try {
      snapshot = await this.client.snapshot({ withTraffic: true });
    } catch (err) {
      this.lastError = err.message;
      logger.warn({ err: err.message }, 'mikrotik diskominfo unreachable');
      // Broadcast offline state so UI knows
      wsHub.broadcast('dashboard', {
        ok: false,
        error: err.message,
        time: waktu
      });
      return;
    }
    this.lastError = null;

    const seenIds = [];
    const conn = await pool.getConnection();
    try {
      for (const iface of snapshot.interfaces) {
        const routerosId = iface['.id'] || iface.name;
        seenIds.push(routerosId);
        const name = iface.name || '-';
        const type = iface.type || '';
        const mac = iface['mac-address'] || '';
        const disabled = boolMt(iface.disabled);
        const running = boolMt(iface.running);
        const status = running === 1 && disabled === 0 ? 'Up' : 'Down';
        const traffic = snapshot.traffic[name] || { rxBps: 0, txBps: 0 };

        // baca state lama untuk dedup notif
        const [oldRows] = await conn.query(
          `SELECT id_opd, status_terakhir, disabled, last_notified_down, last_notified_disabled
             FROM master_opd WHERE routeros_id = ? LIMIT 1`,
          [routerosId]
        );
        const old = oldRows[0];

        const notifKeyDisabled = `diskominfo:${routerosId}:disabled`;
        const notifKeyDown = `diskominfo:${routerosId}:down`;

        let newNotifDisabled = old ? old.last_notified_disabled : null;
        let newNotifDown = old ? old.last_notified_down : null;

        // INTERFACE BARU DI-DISABLE
        if (disabled === 1 && (!old || old.disabled !== 1)) {
          const msg = buildAlert('TERDISABLE', name, type, mac, this.client.host, waktu);
          const res = await notifyAll('PERINGATAN INTERFACE DISKOMINFO', msg, { key: notifKeyDisabled });
          if (res && !res.skipped) newNotifDisabled = waktu;
        }
        if (disabled === 0) newNotifDisabled = null;

        // INTERFACE BARU DOWN (running=0 tapi tidak di-disable)
        if (status === 'Down' && disabled === 0 && (!old || old.status_terakhir !== 'Down')) {
          const msg = buildAlert('TIDAK TERHUBUNG', name, type, mac, this.client.host, waktu);
          const res = await notifyAll('PERINGATAN INTERFACE DISKOMINFO', msg, { key: notifKeyDown });
          if (res && !res.skipped) newNotifDown = waktu;
        }
        // RECOVERY: jika sebelumnya Down lalu sekarang Up
        if (status === 'Up' && old && old.status_terakhir === 'Down') {
          const msg = buildAlert('PULIH (UP)', name, type, mac, this.client.host, waktu);
          await notifyAll('PEMULIHAN INTERFACE DISKOMINFO', msg, { key: `${notifKeyDown}:recover` });
          newNotifDown = null;
        }

        await conn.query(
          `INSERT INTO master_opd
            (nama_opd, ip_address, interface_name, routeros_id, type, mac_address,
             status_terakhir, disabled, running, last_rx_bps, last_tx_bps, last_update,
             last_notified_down, last_notified_disabled)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             nama_opd = VALUES(nama_opd),
             interface_name = VALUES(interface_name),
             type = VALUES(type),
             mac_address = VALUES(mac_address),
             status_terakhir = VALUES(status_terakhir),
             disabled = VALUES(disabled),
             running = VALUES(running),
             last_rx_bps = VALUES(last_rx_bps),
             last_tx_bps = VALUES(last_tx_bps),
             last_update = VALUES(last_update),
             last_notified_down = VALUES(last_notified_down),
             last_notified_disabled = VALUES(last_notified_disabled)`,
          [
            name,
            this.client.host,
            name,
            routerosId,
            type,
            mac,
            status,
            disabled,
            running,
            traffic.rxBps,
            traffic.txBps,
            waktu,
            newNotifDown,
            newNotifDisabled
          ]
        );

        // ambil id_opd untuk insert log
        const [idRows] = await conn.query(
          `SELECT id_opd FROM master_opd WHERE routeros_id = ? LIMIT 1`,
          [routerosId]
        );
        if (idRows[0]) {
          await conn.query(
            `INSERT INTO log_traffic (id_opd, rx_bytes, tx_bytes, waktu_cek) VALUES (?, ?, ?, ?)`,
            [idRows[0].id_opd, traffic.rxBps, traffic.txBps, waktu]
          );
        }
      }

      // hapus row yang sudah tidak ada di router
      if (seenIds.length) {
        await conn.query(
          `DELETE FROM master_opd WHERE routeros_id NOT IN (${seenIds.map(() => '?').join(',')})`,
          seenIds
        );
      }
    } finally {
      conn.release();
    }

    // Ringkasan + broadcast ke WS
    const [statRows] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(status_terakhir='Up') AS up_count,
         SUM(status_terakhir='Down') AS down_count
       FROM master_opd`
    );
    const [listRows] = await pool.query(
      `SELECT id_opd, nama_opd, ip_address, interface_name, routeros_id, type, mac_address,
              status_terakhir, disabled, running, last_rx_bps, last_tx_bps, last_update
         FROM master_opd ORDER BY status_terakhir DESC, interface_name ASC`
    );

    this.lastSnapshot = {
      ok: true,
      time: waktu,
      summary: {
        total: Number(statRows[0].total || 0),
        up: Number(statRows[0].up_count || 0),
        down: Number(statRows[0].down_count || 0)
      },
      interfaces: listRows
    };

    wsHub.broadcast('dashboard', this.lastSnapshot);

    // Bersihkan log lama (>90 hari) sesekali untuk hemat disk
    if (this.tickCount % 720 === 0) {
      await pool.query(`DELETE FROM log_traffic WHERE waktu_cek < DATE_SUB(NOW(), INTERVAL 90 DAY)`);
    }
  }

  status() {
    return {
      running: !!this.timer,
      tickCount: this.tickCount,
      lastError: this.lastError,
      lastSnapshotTime: this.lastSnapshot && this.lastSnapshot.time
    };
  }

  getLastSnapshot() {
    return this.lastSnapshot;
  }
}

function buildAlert(state, name, type, mac, host, waktu) {
  return (
    `Interface: ${name}\n` +
    `Tipe: ${type || '-'}\n` +
    `MAC: ${mac || '-'}\n` +
    `Status: ${state}\n` +
    `Router: ${host}\n` +
    `Waktu: ${waktu}`
  );
}

module.exports = new DiskominfoMonitor();
