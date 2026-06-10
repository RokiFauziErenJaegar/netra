'use strict';

/**
 * NETRA REST API v1
 * --------------------------------------------------------------------------
 * API JSON lengkap untuk seluruh resource project: interface Diskominfo,
 * traffic, laporan, notifikasi, router OPD multi-tenant, dan monitoring rumah.
 *
 * Konvensi:
 *   - Semua respons memakai envelope konsisten:
 *       sukses  -> { ok: true,  data: <payload>, meta?: {...} }
 *       gagal   -> { ok: false, error: { code, message } }
 *   - Paginasi via ?limit= & ?offset= (default limit 100, maks 1000).
 *   - Optional API key: bila env API_KEY di-set, setiap request /api/v1
 *     wajib menyertakan header `X-API-Key` atau `Authorization: Bearer <key>`.
 *     Bila API_KEY kosong, API terbuka (mode LAN).
 *
 * Catatan: router ini TIDAK menggantikan /api lama (dipakai frontend),
 * melainkan menambah permukaan API yang rapi & terdokumentasi.
 */

const express = require('express');
const { pool } = require('../db');
const config = require('../config');
const pkg = require('../../package.json');
const diskominfoMonitor = require('../services/monitorDiskominfo');
const rumahMonitor = require('../services/monitorRumah');
const { MikroTikClient } = require('../services/mikrotik');
const { sendFonnte } = require('../services/fonnte');
const { sendTelegram } = require('../services/telegram');
const { formatBytes, formatMbps } = require('../services/helpers');

const router = express.Router();

// ---------------------------------------------------------------------------
// Util: envelope + async wrapper
// ---------------------------------------------------------------------------
function ok(res, data, meta) {
  const body = { ok: true, data };
  if (meta) body.meta = meta;
  return res.json(body);
}

function fail(res, status, code, message) {
  return res.status(status).json({ ok: false, error: { code, message } });
}

// Bungkus handler async agar error otomatis diteruskan ke error handler Express.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function paging(req) {
  let limit = parseInt(req.query.limit, 10);
  let offset = parseInt(req.query.offset, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = 100;
  if (limit > 1000) limit = 1000;
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  return { limit, offset };
}

function isDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// ---------------------------------------------------------------------------
// Middleware: optional API key
// ---------------------------------------------------------------------------
router.use((req, res, next) => {
  const required = process.env.API_KEY || '';
  if (!required) return next(); // mode terbuka
  const headerKey = req.get('X-API-Key') || '';
  const auth = req.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (headerKey === required || bearer === required) return next();
  return fail(res, 401, 'unauthorized', 'API key tidak valid atau tidak disertakan');
});

// ===========================================================================
// META / SISTEM
// ===========================================================================

// Indeks API — daftar seluruh endpoint (self-documenting).
router.get('/', (req, res) => {
  ok(res, {
    name: 'NETRA REST API',
    version: 'v1',
    app_version: pkg.version,
    auth: process.env.API_KEY ? 'API key required (X-API-Key / Bearer)' : 'open (no auth)',
    endpoints: [
      { method: 'GET', path: '/api/v1', desc: 'Indeks API ini' },
      { method: 'GET', path: '/api/v1/health', desc: 'Health check + ping DB' },
      { method: 'GET', path: '/api/v1/monitors', desc: 'Status kedua monitor (diskominfo & rumah)' },
      { method: 'GET', path: '/api/v1/ws', desc: 'Info channel WebSocket realtime' },

      { method: 'GET', path: '/api/v1/interfaces', desc: 'List interface Diskominfo (filter: status, disabled, q, sort, limit, offset)' },
      { method: 'GET', path: '/api/v1/interfaces/summary', desc: 'Ringkasan total/up/down' },
      { method: 'GET', path: '/api/v1/interfaces/snapshot', desc: 'Snapshot live dari monitor Diskominfo' },
      { method: 'GET', path: '/api/v1/interfaces/:id', desc: 'Detail satu interface (by id_opd)' },
      { method: 'GET', path: '/api/v1/interfaces/:id/traffic', desc: 'Time-series traffic (query: date | start & end, limit)' },

      { method: 'GET', path: '/api/v1/reports/interface-events', desc: 'Laporan event up/down/disable (query: start, end)' },
      { method: 'GET', path: '/api/v1/notifications', desc: 'Riwayat notifikasi (filter: channel, success, q, start, end, limit, offset)' },

      { method: 'GET', path: '/api/v1/opd-routers', desc: 'Daftar router OPD terkonfigurasi (tanpa password)' },
      { method: 'GET', path: '/api/v1/opd-routers/summary', desc: 'Hitung user hotspot+ppp live per router OPD' },
      { method: 'GET', path: '/api/v1/opd-routers/:name/users', desc: 'List user hotspot & ppp live satu router OPD' },

      { method: 'GET', path: '/api/v1/rumah/snapshot', desc: 'Snapshot live monitor rumah' },
      { method: 'GET', path: '/api/v1/rumah/interfaces', desc: 'List interface rumah (dari DB)' },
      { method: 'GET', path: '/api/v1/rumah/leases', desc: 'List DHCP lease rumah (dari DB)' },
      { method: 'GET', path: '/api/v1/rumah/traffic', desc: 'Agregasi traffic rumah (query: periode=harian|mingguan|bulanan)' },

      { method: 'GET', path: '/api/v1/mikrotik/:target/interfaces', desc: 'Baca interface live (target: diskominfo|rumah)' },

      { method: 'POST', path: '/api/v1/notify/test', desc: 'Kirim notif uji (body: { channel: fonnte|telegram|all, message })' }
    ]
  });
});

router.get('/health', wrap(async (req, res) => {
  let db = 'ok';
  try {
    const conn = await pool.getConnection();
    try { await conn.ping(); } finally { conn.release(); }
  } catch (e) {
    db = 'error: ' + e.message;
  }
  ok(res, {
    status: db === 'ok' ? 'healthy' : 'degraded',
    db,
    app_version: pkg.version,
    time: new Date().toISOString(),
    uptime_sec: Math.round(process.uptime())
  });
}));

router.get('/monitors', (req, res) => {
  ok(res, {
    diskominfo: diskominfoMonitor.status(),
    rumah: rumahMonitor.status()
  });
});

router.get('/ws', (req, res) => {
  ok(res, {
    url: '/ws',
    protocol: 'ws (atau wss bila di belakang TLS)',
    query_param: 'topic',
    topics: ['dashboard', 'rumah'],
    contoh: 'ws://<host>:' + config.http.port + '/ws?topic=dashboard',
    pesan: {
      welcome: '{ type: "welcome", topic, time }',
      update: '{ type: "update", topic, time, data: <snapshot sama seperti REST snapshot> }'
    }
  });
});

// ===========================================================================
// INTERFACE DISKOMINFO (tabel master_opd)
// ===========================================================================

router.get('/interfaces', wrap(async (req, res) => {
  const { limit, offset } = paging(req);
  const where = [];
  const params = [];

  if (req.query.status) {
    where.push('status_terakhir = ?');
    params.push(String(req.query.status));
  }
  if (req.query.disabled === '0' || req.query.disabled === '1') {
    where.push('disabled = ?');
    params.push(Number(req.query.disabled));
  }
  if (req.query.q) {
    where.push('(interface_name LIKE ? OR nama_opd LIKE ? OR mac_address LIKE ?)');
    const like = '%' + req.query.q + '%';
    params.push(like, like, like);
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  // Whitelist kolom sort untuk cegah SQL injection.
  const sortable = {
    interface_name: 'interface_name',
    status: 'status_terakhir',
    rx: 'last_rx_bps',
    tx: 'last_tx_bps',
    update: 'last_update'
  };
  const sortCol = sortable[req.query.sort] || 'status_terakhir';
  const dir = String(req.query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const [[cnt]] = await pool.query(`SELECT COUNT(*) AS total FROM master_opd ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT id_opd, nama_opd, ip_address, interface_name, routeros_id, type, mac_address,
            status_terakhir, disabled, running, last_rx_bps, last_tx_bps, last_update
       FROM master_opd ${whereSql}
      ORDER BY ${sortCol} ${dir}, interface_name ASC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  ok(res, rows, { total: Number(cnt.total || 0), limit, offset, count: rows.length });
}));

router.get('/interfaces/summary', wrap(async (req, res) => {
  const [[s]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(status_terakhir='Up') AS up,
            SUM(status_terakhir='Down') AS down,
            SUM(disabled=1) AS disabled
       FROM master_opd`
  );
  ok(res, {
    total: Number(s.total || 0),
    up: Number(s.up || 0),
    down: Number(s.down || 0),
    disabled: Number(s.disabled || 0),
    router: config.mikrotik.diskominfo.host
  });
}));

// Snapshot live dari monitor (initial state sebelum WS push).
router.get('/interfaces/snapshot', (req, res) => {
  const snap = diskominfoMonitor.getLastSnapshot();
  if (!snap) return fail(res, 503, 'no_snapshot', 'Monitor belum menghasilkan snapshot pertama');
  ok(res, snap, { status: diskominfoMonitor.status() });
});

router.get('/interfaces/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return fail(res, 400, 'bad_request', 'id tidak valid');
  const [rows] = await pool.query('SELECT * FROM master_opd WHERE id_opd = ? LIMIT 1', [id]);
  if (!rows[0]) return fail(res, 404, 'not_found', 'Interface tidak ditemukan');
  ok(res, rows[0]);
}));

router.get('/interfaces/:id/traffic', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return fail(res, 400, 'bad_request', 'id tidak valid');
  const { limit } = paging(req);

  let filterSql = 'DATE(waktu_cek) = CURDATE()';
  const params = [id];
  if (isDate(req.query.start) && isDate(req.query.end)) {
    filterSql = 'waktu_cek >= ? AND waktu_cek < DATE_ADD(?, INTERVAL 1 DAY)';
    params.push(req.query.start, req.query.end);
  } else if (isDate(req.query.date)) {
    filterSql = 'DATE(waktu_cek) = ?';
    params.push(req.query.date);
  }

  const [rows] = await pool.query(
    `SELECT waktu_cek, rx_bytes, tx_bytes FROM log_traffic
      WHERE id_opd = ? AND ${filterSql}
      ORDER BY waktu_cek ASC
      LIMIT ?`,
    [...params, limit]
  );
  ok(res, rows.map((r) => ({
    waktu_cek: r.waktu_cek,
    rx_bps: Number(r.rx_bytes || 0),
    tx_bps: Number(r.tx_bytes || 0),
    rx_mbps: Number(r.rx_bytes || 0) / 1_000_000,
    tx_mbps: Number(r.tx_bytes || 0) / 1_000_000
  })), { count: rows.length });
}));

// ===========================================================================
// LAPORAN & NOTIFIKASI
// ===========================================================================

router.get('/reports/interface-events', wrap(async (req, res) => {
  const today = new Date();
  const def = (d) => d.toISOString().slice(0, 10);
  const sevenAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
  let start = isDate(req.query.start) ? req.query.start : def(sevenAgo);
  let end = isDate(req.query.end) ? req.query.end : def(today);
  if (start > end) [start, end] = [end, start];

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

  const get = (body, label) => {
    const m = String(body || '').match(new RegExp('^' + label + ':\\s*(.*)$', 'm'));
    return m ? m[1].trim() : '';
  };
  const events = rows.map((r) => {
    const status = get(r.body, 'Status');
    const isRecovery = /PEMULIHAN/i.test(r.subject || '');
    let kategori = 'MATI';
    if (isRecovery) kategori = 'HIDUP';
    else if (/TERDISABLE/i.test(status)) kategori = 'DISABLE';
    return {
      id: r.id,
      waktu: r.waktu,
      interface_name: get(r.body, 'Interface'),
      tipe: get(r.body, 'Tipe'),
      mac: get(r.body, 'MAC'),
      status,
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

  ok(res, { events, summary }, { start, end });
}));

router.get('/notifications', wrap(async (req, res) => {
  const { limit, offset } = paging(req);
  const where = [];
  const params = [];
  if (req.query.channel) { where.push('channel = ?'); params.push(String(req.query.channel)); }
  if (req.query.success === '0' || req.query.success === '1') {
    where.push('success = ?'); params.push(Number(req.query.success));
  }
  if (req.query.q) { where.push('(subject LIKE ? OR body LIKE ?)'); params.push('%' + req.query.q + '%', '%' + req.query.q + '%'); }
  if (isDate(req.query.start)) { where.push('created_at >= ?'); params.push(req.query.start); }
  if (isDate(req.query.end)) { where.push('created_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(req.query.end); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const [[cnt]] = await pool.query(`SELECT COUNT(*) AS total FROM notification_log ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT id, channel, target, subject, body, success, error_message, created_at
       FROM notification_log ${whereSql}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  ok(res, rows, { total: Number(cnt.total || 0), limit, offset, count: rows.length });
}));

// ===========================================================================
// ROUTER OPD MULTI-TENANT (live)
// ===========================================================================

function opdClient(r) {
  return new MikroTikClient({
    host: r.host, user: r.user, password: r.password,
    timeoutMs: config.opd.timeoutMs, label: r.name
  });
}

router.get('/opd-routers', (req, res) => {
  // Jangan bocorkan password.
  ok(res, config.opd.routers.map((r) => ({ name: r.name, host: r.host, user: r.user })));
});

router.get('/opd-routers/summary', wrap(async (req, res) => {
  const data = await Promise.all(config.opd.routers.map(async (r) => {
    const client = opdClient(r);
    try {
      const [hotspot, ppp] = await Promise.all([client.countHotspot(), client.countPpp()]);
      return { name: r.name, host: r.host, online: true, hotspot, ppp, total: hotspot + ppp };
    } catch (e) {
      return { name: r.name, host: r.host, online: false, hotspot: 0, ppp: 0, total: 0, error: e.message };
    }
  }));
  ok(res, data);
}));

router.get('/opd-routers/:name/users', wrap(async (req, res) => {
  const r = config.opd.routers.find((x) => x.name === req.params.name);
  if (!r) return fail(res, 404, 'not_found', 'Router OPD tidak terdaftar');
  const client = opdClient(r);
  try {
    const [hotspot, ppp] = await Promise.all([client.listHotspot(), client.listPpp()]);
    ok(res, { hotspot: hotspot || [], ppp: ppp || [] }, { name: r.name, host: r.host });
  } catch (e) {
    fail(res, 502, 'router_unreachable', e.message);
  }
}));

// ===========================================================================
// MONITORING RUMAH (data tetap tersedia via API meski menu UI disembunyikan)
// ===========================================================================

router.get('/rumah/snapshot', (req, res) => {
  const snap = rumahMonitor.getLastSnapshot();
  if (!snap) return fail(res, 503, 'no_snapshot', 'Monitor rumah belum menghasilkan snapshot');
  ok(res, snap, { status: rumahMonitor.status() });
});

router.get('/rumah/interfaces', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT * FROM monitoring_rumah_interface ORDER BY status_terakhir DESC, interface_name ASC`
  );
  ok(res, rows, { count: rows.length });
}));

router.get('/rumah/leases', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT * FROM monitoring_rumah_dhcp_lease
      ORDER BY lease_status ASC, INET_ATON(ip_address) ASC, host_name ASC`
  );
  ok(res, rows, { count: rows.length });
}));

router.get('/rumah/traffic', wrap(async (req, res) => {
  const periode = ['harian', 'mingguan', 'bulanan'].includes(req.query.periode) ? req.query.periode : 'harian';
  let filterSql = 'DATE(waktu_cek) = CURDATE()';
  if (periode === 'mingguan') filterSql = 'waktu_cek >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
  else if (periode === 'bulanan') filterSql = 'waktu_cek >= DATE_SUB(NOW(), INTERVAL 30 DAY)';

  const [rows] = await pool.query(
    `SELECT interface_name,
            AVG(rx_bps) AS avg_rx, AVG(tx_bps) AS avg_tx,
            MAX(rx_bps) AS max_rx, MAX(tx_bps) AS max_tx,
            SUM(rx_bps + tx_bps) * 5 / 8 AS estimasi_bytes,
            COUNT(*) AS total_sample
       FROM monitoring_rumah_traffic
      WHERE ${filterSql}
      GROUP BY routeros_id, interface_name
      ORDER BY estimasi_bytes DESC, interface_name ASC`
  );
  ok(res, rows.map((r) => ({
    interface_name: r.interface_name,
    avg_rx_bps: Number(r.avg_rx || 0),
    avg_tx_bps: Number(r.avg_tx || 0),
    max_rx_bps: Number(r.max_rx || 0),
    max_tx_bps: Number(r.max_tx || 0),
    estimasi_bytes: Number(r.estimasi_bytes || 0),
    estimasi: formatBytes(r.estimasi_bytes),
    total_sample: Number(r.total_sample || 0)
  })), { periode });
}));

// ===========================================================================
// MIKROTIK LIVE (baca langsung dari router)
// ===========================================================================

router.get('/mikrotik/:target/interfaces', wrap(async (req, res) => {
  const target = req.params.target;
  const cfg = target === 'diskominfo' ? config.mikrotik.diskominfo
    : target === 'rumah' ? config.mikrotik.rumah
      : null;
  if (!cfg) return fail(res, 404, 'unknown_target', "target harus 'diskominfo' atau 'rumah'");
  const client = new MikroTikClient({ ...cfg, label: target });
  try {
    const rows = await client.listInterfaces();
    ok(res, Array.isArray(rows) ? rows : [], { target, router: cfg.host });
  } catch (e) {
    fail(res, 502, 'router_unreachable', e.message);
  }
}));

// ===========================================================================
// AKSI: kirim notifikasi uji
// ===========================================================================

router.post('/notify/test', wrap(async (req, res) => {
  const channel = (req.body && req.body.channel) || 'all';
  const message = (req.body && req.body.message) || `TES NETRA — ${new Date().toISOString()}`;
  const subject = 'Tes Manual API';
  const out = {};
  if (channel === 'fonnte' || channel === 'all') out.fonnte = await sendFonnte(message, { subject });
  if (channel === 'telegram' || channel === 'all') out.telegram = await sendTelegram(message, { subject });
  if (!Object.keys(out).length) return fail(res, 400, 'bad_request', "channel harus 'fonnte', 'telegram', atau 'all'");
  ok(res, out);
}));

// 404 khusus untuk namespace API (JSON, bukan halaman HTML).
router.use((req, res) => {
  fail(res, 404, 'not_found', `Endpoint ${req.method} ${req.baseUrl}${req.path} tidak ada`);
});

// Error handler khusus API -> selalu JSON.
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  const logger = require('../logger');
  logger.error({ err: err.message, url: req.originalUrl }, 'api v1 error');
  fail(res, 500, 'internal_error', err.message);
});

module.exports = router;
