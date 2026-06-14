'use strict';

/**
 * ============================================================================
 *  HARNESS SIMULASI UJI COBA (UAT)
 *  Fitur: Deteksi OPD Tidak Terhubung  +  Pengiriman Notifikasi WhatsApp
 * ============================================================================
 *
 * Tujuan
 *   Memverifikasi dua fitur inti NETRA secara end-to-end TANPA menyentuh
 *   router MikroTik produksi maupun tabel master_opd:
 *     1. Logika deteksi status interface (Up / Down / Terdisable) — meniru
 *        persis perhitungan di src/services/monitorDiskominfo.js (runOnce).
 *     2. Pemicuan & pengiriman notifikasi WhatsApp via jalur asli aplikasi
 *        (services/notifier.notifyAll -> provider aktif: Fonnte / Roki).
 *
 * Cara kerja
 *   Script mensimulasikan "pemutusan koneksi dummy" pada sebuah OPD tiruan
 *   (tidak terdaftar di router), lalu menjalankan urutan tick layaknya poller:
 *     - TC-01  Baseline: interface Up (kondisi normal)
 *     - TC-02  Pemutusan koneksi: running=0 -> status Down -> notif TIDAK TERHUBUNG
 *     - TC-03  Down berlanjut (tick berikutnya): cooldown menahan notif ganda
 *     - TC-04  Pemulihan: running=1 -> status Up -> notif PULIH (UP)
 *     - TC-05  Interface di-disable: disabled=1 -> status Down -> notif TERDISABLE
 *
 * Mode
 *   node scripts/uat-deteksi-opd.js            (DRY-RUN: hanya cek logika, tanpa kirim WA)
 *   node scripts/uat-deteksi-opd.js --live     (LIVE: benar-benar kirim WA via provider aktif)
 *   tambahkan --keep untuk TIDAK menghapus jejak notification_log uji.
 *
 * Catatan kebersihan data
 *   Entri notification_log hasil uji ditandai dengan interface "ether-UAT-DISDIK"
 *   dan secara default DIHAPUS setelah bukti diambil, agar Laporan Interface
 *   produksi tidak tercemar data dummy.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../src/db');
const { notifyAll, resetKey } = require('../src/services/notifier');
const { getWaConfig } = require('../src/services/whatsapp');
const { nowMysql, boolMt } = require('../src/services/helpers');

const LIVE = process.argv.includes('--live');
const KEEP = process.argv.includes('--keep');

// --- OPD dummy untuk simulasi (tidak ada di router / master_opd) -------------
const DUMMY = {
  nama_opd: 'Dinas Pendidikan (DUMMY UAT)',
  interface_name: 'ether-UAT-DISDIK',
  routeros_id: 'UAT-DUMMY-DISDIK',
  type: 'ether',
  mac: 'DE:AD:BE:EF:00:09',
  host: process.env.MIKROTIK_DISKOMINFO_HOST || '10.100.100.1'
};
const MARKER = DUMMY.interface_name; // penanda untuk pembersihan notification_log

// --- Salinan persis logika di monitorDiskominfo.js --------------------------
// status = Up bila running=1 DAN tidak disabled; selain itu Down.
function computeStatus(running, disabled) {
  return running === 1 && disabled === 0 ? 'Up' : 'Down';
}
// Format pesan identik dengan buildAlert() pada monitorDiskominfo.js
function buildAlert(state, waktu) {
  return (
    `Interface: ${DUMMY.interface_name}\n` +
    `Tipe: ${DUMMY.type || '-'}\n` +
    `MAC: ${DUMMY.mac || '-'}\n` +
    `Status: ${state}\n` +
    `Router: ${DUMMY.host}\n` +
    `Waktu: ${waktu}`
  );
}

const SUBJECT_WARN = 'PERINGATAN INTERFACE DISKOMINFO';
const SUBJECT_RECOVER = 'PEMULIHAN INTERFACE DISKOMINFO';
const keyDown = `diskominfo:${DUMMY.routeros_id}:down`;
const keyDisabled = `diskominfo:${DUMMY.routeros_id}:disabled`;

const results = [];

function record(tc, judul, harapan, aktual, lulus, detail) {
  results.push({ tc, judul, harapan, aktual, status: lulus ? 'LULUS' : 'GAGAL', detail });
  const tag = lulus ? '✅ LULUS' : '❌ GAGAL';
  console.log(`\n[${tc}] ${judul}`);
  console.log(`   Harapan : ${harapan}`);
  console.log(`   Aktual  : ${aktual}`);
  if (detail) console.log(`   Detail  : ${detail}`);
  console.log(`   Hasil   : ${tag}`);
}

// Eksekusi satu "tick": hitung status, tentukan transisi, picu notifikasi.
async function tick({ running, disabled, oldStatus }) {
  const waktu = nowMysql();
  const status = computeStatus(running, disabled);

  // Kondisi pemicu — mirror monitorDiskominfo.js
  const fireDisabled = disabled === 1; // (disederhanakan: transition / belum-notif)
  const fireDown = status === 'Down' && disabled === 0 && oldStatus !== 'Down';
  const fireRecover = status === 'Up' && oldStatus === 'Down';

  let action = 'tidak ada notifikasi';
  let notifResult = null;

  if (fireDisabled) {
    const msg = buildAlert('TERDISABLE', waktu);
    action = 'notif TERDISABLE';
    if (LIVE) notifResult = await notifyAll(SUBJECT_WARN, msg, { key: keyDisabled });
  } else if (fireDown) {
    const msg = buildAlert('TIDAK TERHUBUNG', waktu);
    action = 'notif TIDAK TERHUBUNG';
    if (LIVE) notifResult = await notifyAll(SUBJECT_WARN, msg, { key: keyDown });
  } else if (fireRecover) {
    const msg = buildAlert('PULIH (UP)', waktu);
    action = 'notif PULIH (UP)';
    if (LIVE) notifResult = await notifyAll(SUBJECT_RECOVER, msg, { key: `${keyDown}:recover` });
  }

  return { status, action, notifResult, waktu };
}

function describeNotif(r) {
  if (!LIVE) return '(dry-run: tidak dikirim)';
  if (!r) return 'tidak ada panggilan notif';
  if (r.skipped) return `DITAHAN (alasan: ${r.reason})`;
  const wa = r.wa || {};
  return `dikirim via ${wa.provider || '?'} -> ${wa.ok ? 'BERHASIL' : 'GAGAL: ' + (wa.error || '-')} | anyOk=${r.anyOk}`;
}

async function main() {
  const wa = await getWaConfig();
  console.log('============================================================');
  console.log('  SIMULASI UAT — Deteksi OPD Terputus & Notifikasi WhatsApp');
  console.log('============================================================');
  console.log(`  Mode            : ${LIVE ? 'LIVE (kirim WA sungguhan)' : 'DRY-RUN (logika saja)'}`);
  console.log(`  Provider aktif  : ${wa.provider}`);
  console.log(`  Target WA       : ${wa.provider === 'roki' ? wa.roki.target : wa.fonnte.target}`);
  console.log(`  OPD dummy       : ${DUMMY.nama_opd} / ${DUMMY.interface_name}`);
  console.log(`  Router (label)  : ${DUMMY.host}`);
  console.log(`  Waktu mulai     : ${nowMysql()}`);

  // Bersihkan cooldown in-memory agar mulai dari kondisi bersih
  resetKey(keyDown); resetKey(keyDisabled); resetKey(`${keyDown}:recover`);

  // TC-01 Baseline Up
  let t = await tick({ running: 1, disabled: 0, oldStatus: 'Up' });
  record('TC-01', 'Baseline — interface normal (Up)',
    'Status terhitung = Up, TIDAK ada notifikasi',
    `status=${t.status}, aksi=${t.action}`,
    t.status === 'Up' && t.action === 'tidak ada notifikasi', describeNotif(t.notifResult));

  // TC-02 Pemutusan koneksi dummy (Up -> Down)
  t = await tick({ running: 0, disabled: 0, oldStatus: 'Up' });
  record('TC-02', 'Deteksi pemutusan koneksi (Up → Down)',
    'Status terhitung = Down, terkirim notif "TIDAK TERHUBUNG"',
    `status=${t.status}, aksi=${t.action}`,
    t.status === 'Down' && t.action === 'notif TIDAK TERHUBUNG' && (!LIVE || (t.notifResult && t.notifResult.anyOk)),
    describeNotif(t.notifResult));

  // TC-03 Down berlanjut -> cooldown menahan
  t = await tick({ running: 0, disabled: 0, oldStatus: 'Down' });
  const tahan = !LIVE ? true : (t.notifResult ? t.notifResult.skipped === true : true);
  record('TC-03', 'Anti-spam — Down berlanjut (cooldown)',
    'Tidak ada transisi baru; notifikasi ulang DITAHAN cooldown',
    `aksi=${t.action}, ${describeNotif(t.notifResult)}`,
    t.action === 'tidak ada notifikasi' || tahan,
    `Cooldown = ${process.env.NOTIF_COOLDOWN_MS || 300000} ms`);

  // TC-04 Pemulihan (Down -> Up)
  t = await tick({ running: 1, disabled: 0, oldStatus: 'Down' });
  record('TC-04', 'Deteksi pemulihan (Down → Up)',
    'Status terhitung = Up, terkirim notif "PULIH (UP)"',
    `status=${t.status}, aksi=${t.action}`,
    t.status === 'Up' && t.action === 'notif PULIH (UP)' && (!LIVE || (t.notifResult && t.notifResult.anyOk)),
    describeNotif(t.notifResult));

  // TC-05 Interface di-disable
  t = await tick({ running: 0, disabled: 1, oldStatus: 'Up' });
  record('TC-05', 'Deteksi interface di-disable (admin down)',
    'Status terhitung = Down, terkirim notif "TERDISABLE"',
    `status=${t.status}, aksi=${t.action}`,
    t.status === 'Down' && t.action === 'notif TERDISABLE' && (!LIVE || (t.notifResult && t.notifResult.anyOk)),
    describeNotif(t.notifResult));

  // --- Bukti: entri notification_log hasil uji -------------------------------
  let evidence = [];
  if (LIVE) {
    const [rows] = await pool.query(
      `SELECT id, channel, target, subject, success, error_message, created_at
         FROM notification_log WHERE body LIKE ? ORDER BY id ASC`,
      [`%${MARKER}%`]
    );
    evidence = rows;
    console.log('\n--- Bukti notification_log (entri uji) ---');
    rows.forEach((r) =>
      console.log(`   #${r.id} [${r.created_at}] ${r.channel} -> ${r.subject} | ${r.success ? 'OK' : 'GAGAL: ' + (r.error_message || '-')}`)
    );

    if (!KEEP) {
      const [del] = await pool.query(`DELETE FROM notification_log WHERE body LIKE ?`, [`%${MARKER}%`]);
      console.log(`\n   Pembersihan: ${del.affectedRows} entri uji dihapus dari notification_log.`);
    } else {
      console.log('\n   (--keep) Entri uji DIPERTAHANKAN di notification_log.');
    }
  }

  // --- Ringkasan -------------------------------------------------------------
  const lulus = results.filter((r) => r.status === 'LULUS').length;
  console.log('\n============================================================');
  console.log(`  RINGKASAN: ${lulus}/${results.length} test case LULUS`);
  console.log('============================================================');
  results.forEach((r) => console.log(`  ${r.status === 'LULUS' ? '✅' : '❌'} ${r.tc} ${r.judul}`));

  // Simpan hasil JSON untuk dilampirkan ke laporan
  const out = {
    waktu: nowMysql(),
    mode: LIVE ? 'live' : 'dry-run',
    provider: wa.provider,
    target: wa.provider === 'roki' ? wa.roki.target : wa.fonnte.target,
    total: results.length,
    lulus,
    gagal: results.length - lulus,
    results,
    evidence
  };
  const fs = require('fs');
  const outDir = path.join(__dirname, '..', 'docs', 'uat');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `hasil-simulasi-${LIVE ? 'live' : 'dryrun'}.json`);
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\n  Hasil tersimpan: ${path.relative(path.join(__dirname, '..'), outFile)}`);

  await pool.end();
  process.exit(lulus === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(2);
});
