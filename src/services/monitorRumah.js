'use strict';

const { MikroTikClient } = require('./mikrotik');
const { pool } = require('../db');
const logger = require('../logger');
const config = require('../config');
const wsHub = require('./wsHub');
const { notifyAll } = require('./notifier');
const { nowMysql, boolMt, stripPort } = require('./helpers');

class RumahMonitor {
  constructor() {
    this.client = new MikroTikClient({
      host: config.mikrotik.rumah.host,
      user: config.mikrotik.rumah.user,
      password: config.mikrotik.rumah.password,
      port: config.mikrotik.rumah.port,
      tls: config.mikrotik.rumah.tls,
      timeoutMs: config.mikrotik.rumah.timeoutMs,
      label: 'rumah'
    });
    this.timer = null;
    this.running = false;
    this.lastSnapshot = null;
    this.lastError = null;
    this.tickCount = 0;
  }

  start() {
    if (this.timer) return;
    const interval = Math.max(500, config.poll.rumahMs);
    logger.info({ host: this.client.host, intervalMs: interval }, 'Rumah monitor started');
    const tick = () => {
      if (this.running) return;
      this.running = true;
      this.runOnce()
        .catch((err) => {
          this.lastError = err.message;
          logger.warn({ err: err.message }, 'rumah tick failed');
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
    let snap;
    try {
      snap = await this.client.snapshot({
        withTraffic: true,
        withDhcp: true,
        withConnections: true // selalu fetch agar bandwidth tidak ke-reset ke 0 antar tick
      });
    } catch (err) {
      this.lastError = err.message;
      logger.warn({ err: err.message }, 'mikrotik rumah unreachable');
      wsHub.broadcast('rumah', { ok: false, error: err.message, time: waktu });
      return;
    }
    this.lastError = null;

    // Daftar IP LAN yang dikenal dari DHCP leases -> dipakai untuk filter
    // koneksi mana yang punya IP lokal (sisi LAN), agar bandwidth-nya
    // ke-credit ke device yang benar.
    const knownLanIps = new Set();
    for (const l of snap.dhcp || []) {
      const ip = l['active-address'] || l.address;
      if (ip) knownLanIps.add(ip);
    }
    const usagePerIp = computeUsagePerIp(snap.connections || [], knownLanIps);

    const conn = await pool.getConnection();
    const seenIface = [];
    const seenLease = [];
    try {
      // ---- Interfaces ----
      for (const iface of snap.interfaces) {
        const id = iface['.id'] || iface.name;
        seenIface.push(id);
        const name = iface.name || '-';
        const type = iface.type || '';
        const mac = iface['mac-address'] || '';
        const disabled = boolMt(iface.disabled);
        const running = boolMt(iface.running);
        const status = running === 1 && disabled === 0 ? 'Terhubung' : 'Tidak Terhubung';
        const tr = snap.traffic[name] || { rxBps: 0, txBps: 0 };

        const [oldRows] = await conn.query(
          `SELECT status_terakhir, disabled, last_notified_disabled, last_notified_down
             FROM monitoring_rumah_interface WHERE routeros_id = ? LIMIT 1`,
          [id]
        );
        const old = oldRows[0];

        let newNotifDisabled = old ? old.last_notified_disabled : null;
        let newNotifDown = old ? old.last_notified_down : null;

        if (disabled === 1 && (!old || old.disabled !== 1)) {
          const msg = buildRumahMsg('TERDISABLE', name, type, mac, this.client.host, waktu);
          const r = await notifyAll('PERINGATAN INTERFACE RUMAH', msg, {
            key: `rumah:${id}:disabled`
          });
          if (r && !r.skipped) newNotifDisabled = waktu;
        }
        if (disabled === 0) newNotifDisabled = null;

        if (status === 'Tidak Terhubung' && disabled === 0 &&
            (!old || old.status_terakhir !== 'Tidak Terhubung')) {
          const msg = buildRumahMsg('TIDAK TERHUBUNG', name, type, mac, this.client.host, waktu);
          const r = await notifyAll('PERINGATAN INTERFACE RUMAH', msg, { key: `rumah:${id}:down` });
          if (r && !r.skipped) newNotifDown = waktu;
        }
        if (status === 'Terhubung' && old && old.status_terakhir === 'Tidak Terhubung') {
          const msg = buildRumahMsg('PULIH (TERHUBUNG)', name, type, mac, this.client.host, waktu);
          await notifyAll('PEMULIHAN INTERFACE RUMAH', msg, { key: `rumah:${id}:down:recover` });
          newNotifDown = null;
        }

        await conn.query(
          `INSERT INTO monitoring_rumah_interface
            (routeros_id, interface_name, type, mac_address, status_terakhir,
             disabled, running, last_rx_bps, last_tx_bps, last_update,
             last_notified_disabled, last_notified_down)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             interface_name = VALUES(interface_name),
             type = VALUES(type),
             mac_address = VALUES(mac_address),
             status_terakhir = VALUES(status_terakhir),
             disabled = VALUES(disabled),
             running = VALUES(running),
             last_rx_bps = VALUES(last_rx_bps),
             last_tx_bps = VALUES(last_tx_bps),
             last_update = VALUES(last_update),
             last_notified_disabled = VALUES(last_notified_disabled),
             last_notified_down = VALUES(last_notified_down)`,
          [id, name, type, mac, status, disabled, running, tr.rxBps, tr.txBps, waktu,
           newNotifDisabled, newNotifDown]
        );

        await conn.query(
          `INSERT INTO monitoring_rumah_traffic (routeros_id, interface_name, rx_bps, tx_bps, waktu_cek)
           VALUES (?, ?, ?, ?, ?)`,
          [id, name, tr.rxBps, tr.txBps, waktu]
        );
      }
      if (seenIface.length) {
        await conn.query(
          `DELETE FROM monitoring_rumah_interface WHERE routeros_id NOT IN (${seenIface.map(() => '?').join(',')})`,
          seenIface
        );
      }

      // ---- DHCP Leases ----
      for (const lease of snap.dhcp || []) {
        const id = lease['.id'] || `${lease['mac-address']}-${lease.address}`;
        seenLease.push(id);
        const ip = lease['active-address'] || lease.address || '';
        const mac = lease['active-mac-address'] || lease['mac-address'] || '';
        const host = lease['active-host-name'] || lease['host-name'] || '';
        const server = lease.server || '';
        const status = lease.status || 'unknown';
        const dynamic = boolMt(lease.dynamic);
        const dis = boolMt(lease.disabled);
        const lastSeen = lease['last-seen'] || '';
        const expires = lease['expires-after'] || '';
        const usage = usagePerIp[ip] || 0;

        await conn.query(
          `INSERT INTO monitoring_rumah_dhcp_lease
            (routeros_id, ip_address, mac_address, host_name, server_name,
             lease_status, dynamic, disabled, last_seen, expires_after,
             total_usage_bytes, last_update)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             ip_address = VALUES(ip_address),
             mac_address = VALUES(mac_address),
             host_name = VALUES(host_name),
             server_name = VALUES(server_name),
             lease_status = VALUES(lease_status),
             dynamic = VALUES(dynamic),
             disabled = VALUES(disabled),
             last_seen = VALUES(last_seen),
             expires_after = VALUES(expires_after),
             total_usage_bytes = VALUES(total_usage_bytes),
             last_update = VALUES(last_update)`,
          [id, ip, mac, host, server, status, dynamic, dis, lastSeen, expires, usage, waktu]
        );
      }
      if (seenLease.length) {
        await conn.query(
          `DELETE FROM monitoring_rumah_dhcp_lease WHERE routeros_id NOT IN (${seenLease.map(() => '?').join(',')})`,
          seenLease
        );
      }
    } finally {
      conn.release();
    }

    // Snapshot ringkasan utk broadcast WS
    const [[stat]] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(status_terakhir='Terhubung') AS terhubung,
         SUM(status_terakhir='Tidak Terhubung') AS tidak_terhubung
       FROM monitoring_rumah_interface`
    );
    const [[dhcpStat]] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(lease_status='bound') AS aktif,
         SUM(lease_status<>'bound' OR lease_status IS NULL) AS tidak_aktif
       FROM monitoring_rumah_dhcp_lease`
    );
    const [ifaceRows] = await pool.query(
      `SELECT * FROM monitoring_rumah_interface ORDER BY status_terakhir DESC, interface_name ASC`
    );
    const [dhcpRows] = await pool.query(
      `SELECT * FROM monitoring_rumah_dhcp_lease
        ORDER BY lease_status ASC, INET_ATON(ip_address) ASC, host_name ASC`
    );

    this.lastSnapshot = {
      ok: true,
      time: waktu,
      router: this.client.host,
      summary: {
        total: Number(stat.total || 0),
        terhubung: Number(stat.terhubung || 0),
        tidak_terhubung: Number(stat.tidak_terhubung || 0)
      },
      dhcpSummary: {
        total: Number(dhcpStat.total || 0),
        aktif: Number(dhcpStat.aktif || 0),
        tidak_aktif: Number(dhcpStat.tidak_aktif || 0)
      },
      interfaces: ifaceRows,
      leases: dhcpRows
    };

    wsHub.broadcast('rumah', this.lastSnapshot);

    if (this.tickCount % 720 === 0) {
      await pool.query(`DELETE FROM monitoring_rumah_traffic WHERE waktu_cek < DATE_SUB(NOW(), INTERVAL 90 DAY)`);
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

/**
 * Hitung bandwidth aktif per IP LAN dari conntrack snapshot.
 *
 * Untuk setiap koneksi, kita identifikasi sisi LAN-nya:
 * - Jika src ∈ LAN: ini koneksi keluar (LAN→Internet) — credit src dengan
 *   orig (upload) + repl (download).
 * - Jika dst ∈ LAN: ini koneksi masuk (Internet→LAN) — credit dst dengan
 *   orig (download) + repl (upload).
 *
 * Total bandwidth yang ditampilkan = jumlah bytes pada semua koneksi
 * AKTIF sekarang yang melibatkan IP tersebut. Saat koneksi tutup, angka
 * turun. Ini adalah "instantaneous snapshot", bukan akumulasi seumur hidup.
 */
function computeUsagePerIp(connections, lanIps) {
  const usage = {};
  const isLan = (ip) => ip && lanIps && lanIps.has(ip);
  for (const c of connections) {
    const src = stripPort(c['src-address']);
    const dst = stripPort(c['dst-address']);
    const orig = parseInt(c['orig-bytes'] || 0, 10);
    const repl = parseInt(c['repl-bytes'] || 0, 10);
    const total = orig + repl;
    if (isLan(src)) usage[src] = (usage[src] || 0) + total;
    if (isLan(dst) && dst !== src) usage[dst] = (usage[dst] || 0) + total;
  }
  return usage;
}

function buildRumahMsg(state, name, type, mac, host, waktu) {
  return (
    `Interface: ${name}\n` +
    `Tipe: ${type || '-'}\n` +
    `MAC: ${mac || '-'}\n` +
    `Status: ${state}\n` +
    `Router: ${host}\n` +
    `Waktu: ${waktu}`
  );
}

module.exports = new RumahMonitor();
