'use strict';

const express = require('express');
const { pool } = require('../db');
const config = require('../config');
const diskominfoMonitor = require('../services/monitorDiskominfo');
const rumahMonitor = require('../services/monitorRumah');
const { MikroTikClient } = require('../services/mikrotik');
const { formatMbps, formatBytes } = require('../services/helpers');

const router = express.Router();

// Helpers tersedia di semua view
router.use((req, res, next) => {
  res.locals.fmtMbps = formatMbps;
  res.locals.fmtBytes = formatBytes;
  res.locals.cfg = config;
  next();
});

// --- Dashboard utama (Diskominfo) ---
router.get('/', async (req, res) => {
  const snap = diskominfoMonitor.getLastSnapshot();
  res.render('dashboard', {
    page: 'dashboard',
    title: 'Dashboard Monitoring',
    snapshot: snap,
    monitorStatus: diskominfoMonitor.status(),
    routerHost: config.mikrotik.diskominfo.host
  });
});

// --- Dashboard Rumah ---
router.get('/rumah', async (req, res) => {
  const periode = ['harian', 'mingguan', 'bulanan'].includes(req.query.periode)
    ? req.query.periode
    : 'harian';
  const snap = rumahMonitor.getLastSnapshot();
  const trafik = await ringkasanTrafikRumah(periode);
  res.render('dashboard_rumah', {
    page: 'rumah',
    title: 'Dashboard Monitoring Rumah Ku',
    snapshot: snap,
    monitorStatus: rumahMonitor.status(),
    routerHost: config.mikrotik.rumah.host,
    periode,
    trafik
  });
});

// --- Detail traffic per OPD ---
router.get('/detail/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).send('id tidak valid');
  const [rows] = await pool.query('SELECT * FROM master_opd WHERE id_opd = ?', [id]);
  const opd = rows[0];
  if (!opd) return res.status(404).render('error', { page: 'error', code: 404, message: 'OPD tidak ditemukan' });
  res.render('detail', {
    page: 'dashboard',
    title: `Detail Traffic — ${opd.nama_opd}`,
    opd
  });
});

// --- List User OPD ---
router.get('/opd', async (req, res) => {
  res.render('opd_list', {
    page: 'opd',
    title: 'List OPD Active User',
    routers: config.opd.routers
  });
});

// --- Detail user OPD ---
router.get('/opd/:name', async (req, res) => {
  const opd = config.opd.routers.find((r) => r.name === req.params.name);
  if (!opd) return res.status(404).render('error', { page: 'error', code: 404, message: 'Router OPD tidak ditemukan' });
  res.render('opd_detail', {
    page: 'opd',
    title: `Detail User — ${opd.name}`,
    opd
  });
});

// --- Laporan Interface Diskominfo (custom range, up/down events) ---
router.get('/laporan-interface', async (req, res) => {
  const { start, end } = normalizeRange(req.query);
  const data = await getInterfaceEvents(start, end);
  res.render('laporan_interface', {
    page: 'laporan-interface',
    title: 'Laporan Interface',
    start,
    end,
    events: data.events,
    summary: data.summary,
    routerHost: config.mikrotik.diskominfo.host
  });
});

router.get('/laporan-interface/export.csv', async (req, res) => {
  const { start, end } = normalizeRange(req.query);
  const { events } = await getInterfaceEvents(start, end);
  const filename = `laporan-interface_${start}_sd_${end}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.write('﻿'); // BOM agar Excel kenali UTF-8
  res.write('No,Waktu,Interface,Tipe,MAC,Status,Kategori\r\n');
  events.forEach((ev, i) => {
    const row = [
      i + 1,
      csvCell(ev.waktu),
      csvCell(ev.interface_name),
      csvCell(ev.tipe),
      csvCell(ev.mac),
      csvCell(ev.status),
      csvCell(ev.kategori)
    ];
    res.write(row.join(',') + '\r\n');
  });
  res.end();
});

// --- Laporan Rumah (printable) ---
router.get('/rumah/laporan', async (req, res) => {
  const periode = ['harian', 'mingguan', 'bulanan'].includes(req.query.periode)
    ? req.query.periode
    : 'harian';
  const trafik = await ringkasanTrafikRumah(periode);
  res.render('laporan_rumah', {
    page: 'rumah',
    title: 'Laporan Monitoring Rumah Ku',
    periode,
    trafik,
    routerHost: config.mikrotik.rumah.host
  });
});

// --- helpers ---
async function ringkasanTrafikRumah(periode) {
  let filterSql = "DATE(waktu_cek) = CURDATE()";
  let label = 'Harian';
  if (periode === 'mingguan') {
    filterSql = "waktu_cek >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
    label = 'Mingguan';
  } else if (periode === 'bulanan') {
    filterSql = "waktu_cek >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
    label = 'Bulanan';
  }
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

  let totalBytes = 0,
    sumRx = 0,
    sumTx = 0,
    peak = 0;
  rows.forEach((r) => {
    totalBytes += Number(r.estimasi_bytes || 0);
    sumRx += Number(r.avg_rx || 0);
    sumTx += Number(r.avg_tx || 0);
    peak = Math.max(peak, Number(r.max_rx || 0), Number(r.max_tx || 0));
  });
  const n = rows.length;
  return {
    periode,
    label,
    rows,
    ringkasan: {
      total_pemakaian: formatBytes(totalBytes),
      avg_rx: formatMbps(n ? sumRx / n : 0),
      avg_tx: formatMbps(n ? sumTx / n : 0),
      peak: formatMbps(peak)
    }
  };
}

function normalizeRange(query) {
  const today = new Date();
  const def = (d) => d.toISOString().slice(0, 10);
  const sevenAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  let start = isDate(query.start) ? query.start : def(sevenAgo);
  let end = isDate(query.end) ? query.end : def(today);
  if (start > end) [start, end] = [end, start];
  return { start, end };
}

async function getInterfaceEvents(start, end) {
  // Dedup per detik agar fonnte+telegram untuk event yang sama tidak dobel.
  const [rows] = await pool.query(
    `SELECT MIN(id) AS id, MIN(created_at) AS waktu, subject, body
       FROM notification_log
      WHERE subject LIKE '%DISKOMINFO%'
        AND created_at >= ?
        AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
      GROUP BY subject, body, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s')
      ORDER BY waktu ASC`,
    [start, end]
  );

  const events = rows.map((r) => {
    const f = parseEventBody(r.body || '');
    const isRecovery = /PEMULIHAN/i.test(r.subject || '');
    let kategori;
    if (isRecovery) kategori = 'HIDUP';
    else if (/TERDISABLE/i.test(f.status)) kategori = 'DISABLE';
    else kategori = 'MATI';
    return {
      id: r.id,
      waktu: formatWaktu(r.waktu),
      interface_name: f.interface_name,
      tipe: f.tipe,
      mac: f.mac,
      status: f.status,
      kategori
    };
  });

  const summary = events.reduce(
    (acc, e) => {
      acc.total++;
      if (e.kategori === 'MATI') acc.mati++;
      else if (e.kategori === 'HIDUP') acc.hidup++;
      else if (e.kategori === 'DISABLE') acc.disable++;
      return acc;
    },
    { total: 0, mati: 0, hidup: 0, disable: 0 }
  );

  return { events, summary };
}

function parseEventBody(body) {
  const get = (label) => {
    const m = body.match(new RegExp('^' + label + ':\\s*(.*)$', 'm'));
    return m ? m[1].trim() : '';
  };
  return {
    interface_name: get('Interface'),
    tipe: get('Tipe'),
    mac: get('MAC'),
    status: get('Status')
  };
}

function formatWaktu(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ` +
    `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`
  );
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

module.exports = router;
