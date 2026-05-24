'use strict';

const express = require('express');
const { pool } = require('../db');
const config = require('../config');
const diskominfoMonitor = require('../services/monitorDiskominfo');
const rumahMonitor = require('../services/monitorRumah');
const { MikroTikClient } = require('../services/mikrotik');
const { sendFonnte } = require('../services/fonnte');
const { sendTelegram } = require('../services/telegram');

const router = express.Router();

// Snapshot terkini untuk masing-masing dashboard.
// Berguna sebagai initial state sebelum WS push pertama tiba.
router.get('/dashboard/snapshot', (req, res) => {
  res.json({ snapshot: diskominfoMonitor.getLastSnapshot(), status: diskominfoMonitor.status() });
});

router.get('/rumah/snapshot', (req, res) => {
  res.json({ snapshot: rumahMonitor.getLastSnapshot(), status: rumahMonitor.status() });
});

// Chart data traffic per OPD (untuk halaman /detail/:id)
router.get('/opd/:id/chart', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'id tidak valid' });
  const [rows] = await pool.query(
    `SELECT waktu_cek, rx_bytes, tx_bytes FROM log_traffic
      WHERE id_opd = ? AND DATE(waktu_cek) = CURDATE()
      ORDER BY waktu_cek ASC`,
    [id]
  );
  res.json(
    rows.map((r) => ({
      waktu_cek: r.waktu_cek,
      rx_bytes: Number(r.rx_bytes || 0),
      tx_bytes: Number(r.tx_bytes || 0),
      rx_mbps: Number(r.rx_bytes || 0) / 1_000_000,
      tx_mbps: Number(r.tx_bytes || 0) / 1_000_000
    }))
  );
});

// Chart traffic rumah (untuk halaman /rumah, dipakai sebagai data input chart)
router.get('/rumah/traffic', async (req, res) => {
  const periode = ['harian', 'mingguan', 'bulanan'].includes(req.query.periode)
    ? req.query.periode
    : 'harian';
  let filterSql = "DATE(waktu_cek) = CURDATE()";
  if (periode === 'mingguan') filterSql = "waktu_cek >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
  else if (periode === 'bulanan') filterSql = "waktu_cek >= DATE_SUB(NOW(), INTERVAL 30 DAY)";

  const [rows] = await pool.query(
    `SELECT interface_name,
            AVG(rx_bps) AS avg_rx,
            AVG(tx_bps) AS avg_tx,
            MAX(rx_bps) AS max_rx,
            MAX(tx_bps) AS max_tx,
            SUM(rx_bps + tx_bps) * 5 / 8 AS estimasi_bytes,
            COUNT(*) AS total_sample
       FROM monitoring_rumah_traffic
      WHERE ${filterSql}
      GROUP BY routeros_id, interface_name
      ORDER BY estimasi_bytes DESC, interface_name ASC`
  );
  res.json({ periode, rows });
});

// List User OPD: live hit ke router OPD
router.get('/opd-users/summary', async (req, res) => {
  const tasks = config.opd.routers.map(async (r) => {
    const client = new MikroTikClient({
      host: r.host,
      user: r.user,
      password: r.password,
      timeoutMs: config.opd.timeoutMs,
      label: r.name
    });
    try {
      const [hot, ppp] = await Promise.all([client.countHotspot(), client.countPpp()]);
      return { name: r.name, host: r.host, online: true, hotspot: hot, ppp };
    } catch (e) {
      return { name: r.name, host: r.host, online: false, hotspot: 0, ppp: 0, error: e.message };
    }
  });
  const data = await Promise.all(tasks);
  res.json(data);
});

router.get('/opd-users/:name', async (req, res) => {
  const r = config.opd.routers.find((x) => x.name === req.params.name);
  if (!r) return res.status(404).json({ error: 'router opd tidak terdaftar' });
  const client = new MikroTikClient({
    host: r.host,
    user: r.user,
    password: r.password,
    timeoutMs: config.opd.timeoutMs,
    label: r.name
  });
  try {
    const [hotspot, ppp] = await Promise.all([client.listHotspot(), client.listPpp()]);
    res.json({ ok: true, hotspot: hotspot || [], ppp: ppp || [] });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// Test endpoint kirim WA / Telegram (untuk verifikasi setup)
router.post('/test/fonnte', async (req, res) => {
  const msg = (req.body && req.body.message) || `TES NETRA — ${new Date().toISOString()}`;
  const out = await sendFonnte(msg, { subject: 'Tes Manual' });
  res.json(out);
});

router.post('/test/telegram', async (req, res) => {
  const msg = (req.body && req.body.message) || `TES NETRA — ${new Date().toISOString()}`;
  const out = await sendTelegram(msg, { subject: 'Tes Manual' });
  res.json(out);
});

// Status monitor
router.get('/monitor/status', (req, res) => {
  res.json({
    diskominfo: diskominfoMonitor.status(),
    rumah: rumahMonitor.status()
  });
});

module.exports = router;
