# Changelog

Catatan rilis untuk Netra. Mengikuti format [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/)
dan [Semantic Versioning](https://semver.org/lang/id/).

## [1.1.5] — 2026-05-25

**Critical bugfix**: notifikasi WhatsApp tidak fire untuk interface yang sudah
di-disable/disconnect saat pemulihan cooldown — bug warisan migrasi dari PHP
yang baru terdeteksi setelah investigasi mendalam.

### 🐛 Tiga Bug Ditemukan

**Bug 1: Cooldown trap (kritis)**

Skenario:
1. User disable interface → notif fire → cooldown set 5 menit
2. User enable interface (`disabled=0`) → `last_notified_disabled = null` di DB
3. User re-disable **dalam 5 menit** → kondisi `disabled === 1 && old.disabled !== 1`
   TRUE → notifyAll → **cooldown skip** → `last_notified_disabled` tetap null
4. Tick berikutnya → state sama → kondisi state-transition FALSE → notif
   **TIDAK PERNAH FIRE LAGI** meski cooldown sudah lewat

**Bug 2: Mark cooldown sebelum send**

`shouldSend()` set timestamp cooldown SEBELUM kepastian send sukses. Jadi
bila Fonnte API timeout/error, cooldown sudah ter-set; tick berikutnya gagal
retry dalam 5 menit.

**Bug 3: PHP fallback hilang**

Saat migrasi PHP → Node.js, fallback `$belum_notif_disabled` tidak ter-port.
Inilah yang membuat kasus #1 di atas tidak ter-handle.

### ✅ Fix

**`notifier.js`** — pisah `canSend(key)` (cek-only, tanpa side-effect) dari
`markSent(key)` (set timestamp). `notifyAll` hanya panggil `markSent` jika
SETIDAKNYA satu channel berhasil kirim (`anyOk === true`).

**`monitorRumah.js` & `monitorDiskominfo.js`** — kondisi trigger sekarang:
```js
const belumNotifDisabled = !old || !old.last_notified_disabled;
const baruTerdisable = disabled === 1 &&
  (!old || old.disabled !== 1 || belumNotifDisabled);
```
Fire bila:
- State transition (enable → disable), **atau**
- Belum pernah notif (`last_notified_disabled` NULL — bisa karena reset enable
  atau cooldown-skipped sebelumnya)

Logika identik untuk `down` (status Tidak Terhubung).

### 🧪 Verifikasi

Unit-test simulasi 9 skenario edge case: **9/9 PASS**.
- Transition normal: fire ✓
- Cooldown-trapped (last_notified NULL): fire ✓
- State sudah dinotif: silent ✓
- Interface baru di DB: fire jika down/disabled ✓

### ⚙️ Upgrade dari v1.1.4
```powershell
git pull origin main
pm2 restart netra
```

### 📋 Yang Tidak Berubah
- Cooldown duration (`NOTIF_COOLDOWN_MS=300000`)
- Cooldown reset saat enable (`disabled=0 → last_notified_disabled=NULL`)
- PULIH (recovery) notif tetap fire pada transition `Tidak Terhubung → Terhubung`

---

## [1.1.4] — 2026-05-25

**Critical fix**: WebSocket badge stuck "Connecting" kuning (tidak pernah hijau)
karena script execution order yang salah. Backend WS sebenarnya sudah jalan
sempurna — bug murni di client-side script loading.

### 🐛 Diperbaiki

**WebSocket tidak pernah connect dari browser**:
- `common.js` di `<head>` pakai `defer` → run setelah DOM parse selesai
- `dashboard.js` (dan page scripts lain) di akhir `<body>` **tanpa** `defer`
  → run langsung saat parser sampai ke tag-nya
- Akibatnya: `dashboard.js` jalan DULUAN saat `NETRA` namespace belum
  didefinisikan (common.js masih ditunda) → `TypeError: NETRA.connectWs is
  not a function` → JS execution stop → WS tidak pernah connect.

**Fix**: tambah `defer` di SEMUA script tag (`dashboard.js`,
`dashboard_rumah.js`, `detail.js`, `opd_list.js`, `opd_detail.js`).
Dengan semua deferred, browser menjaga **source order**: common.js (head)
jalan dulu, lalu page script (body).

### Verifikasi
Setelah upgrade, badge sidebar pojok kiri bawah akan jadi:
- 🟡 "Connecting" sebentar (< 1 detik)
- 🟢 **"Live"** hijau saat WS handshake sukses

Bila masih kuning > 2 detik:
1. F12 → Console — cek apakah ada error JS
2. F12 → Network → filter WS — lihat status `ws?topic=dashboard`

### ⚙️ Upgrade dari v1.1.3
```powershell
git pull origin main
pm2 restart netra
```
`Ctrl+Shift+R` di browser untuk muat HTML+JS terbaru.

---

## [1.1.3] — 2026-05-25

Bugfix table layout + DHCP bandwidth tracking yang sebelumnya tidak akurat.

### 🐛 Diperbaiki

**DHCP Bandwidth (BUG SERIUS — sebelumnya semua 0):**
- **Connection data sekarang di-fetch setiap tick** (sebelumnya hanya
  tiap 5 tick). Saat tidak di-fetch, UPSERT menulis `total_usage_bytes=0`
  yang menimpa nilai sebelumnya.
- **LAN-IP detection** dari daftar DHCP lease — koneksi hanya
  di-credit ke IP yang benar-benar terdaftar sebagai device LAN.
- **Hitung orig + repl bytes lengkap** (sebelumnya hanya orig untuk src,
  repl untuk dst — yang menyebabkan setengah traffic hilang).
- Hasil verifikasi: 0/9 device dengan data → **9/9 device** dengan data
  bandwidth aktual setelah fix.

**Header tabel tidak align dengan kolom angka:**
- `text-right`, `text-center`, `text-left` sekarang pakai `!important`
  agar override CSS specificity dari `.table thead th` (yang punya
  text-align: left default).

### ✨ Ditambahkan
- **Kolom Disabled** di tabel Status Interface (Diskominfo + Rumah).
  Badge warning kuning saat interface ter-disable di MikroTik.
- Kolom MAC Address sekarang text-nowrap (tidak terpotong).
- Kolom Bandwidth/Download/Upload text-nowrap (Mbps unit tidak pindah baris).

### 🔄 Diubah
- Header DHCP **"Total Bandwidth" → "Bandwidth Aktif"** untuk merefleksikan
  semantik sebenarnya: bytes pada koneksi yang sedang aktif (instantaneous
  snapshot), bukan akumulasi seumur hidup device.
- Width kolom # diset eksplisit 48px agar tidak terlalu lebar.
- Width kolom Aksi 60px.

### ⚙️ Upgrade dari v1.1.2
```powershell
git pull origin main
pm2 restart netra
```
Cache `?v=1.1.3` otomatis bust browser cache.

---

## [1.1.2] — 2026-05-24

UX patch: dashboard sekarang **terasa benar-benar live**, bukan hanya
"realtime di belakang layar". Tidak ada perubahan backend logic — hanya
penambahan visual cue dan penurunan default interval.

### ✨ Ditambahkan
- **Live ticker** "X detik lalu" di topbar, update tiap 500ms client-side.
  Selalu terlihat berjalan walaupun belum ada broadcast baru.
- **Heartbeat ring** pada dot live di topbar — pulsing hijau 2 detik
  terus-menerus, sinyal visual bahwa UI hidup.
- **Flash highlight** saat angka di stat-card berubah:
  background biru muda 900ms + soft glow ring, mata user otomatis
  tertarik ke kolom yang baru update.
- `NETRA.setText(el, val)` & `NETRA.markUpdate()` helper di common.js.
- [docs/REALTIME.md](docs/REALTIME.md) — panduan lengkap arsitektur
  realtime, verifikasi via DevTools, troubleshoot Cloudflare Tunnel.

### 🔄 Diubah
- **Default poll interval**: 5000ms → **2000ms** (sweet spot responsif vs
  beban router). `.env.example` & `.env` lokal sudah ter-update.
- README highlight bagian frontend menambahkan fitur live ticker.

### 🐛 Diperbaiki
- Persepsi "tidak realtime" — sebelumnya angka diam 5 detik tanpa visual
  feedback antar update. Sekarang minimal heartbeat + ticker selalu
  bergerak, dan setiap angka yang berubah disorot.

### ⚙️ Upgrade dari v1.1.1
```powershell
git pull origin main
pm2 restart netra
```
`Ctrl + Shift + R` di browser pertama kali (atau `?v=1.1.2` otomatis
membatalkan cache).

---

## [1.1.1] — 2026-05-24

Patch release: **cache-busting asset** + Cache-Control headers yang benar.
Mengatasi masalah CSS lama nyangkut di browser/CDN setelah update versi
(termasuk di belakang Cloudflare Tunnel/Proxy).

### ✨ Ditambahkan
- **Asset version query string** otomatis di semua CSS & JS:
  `/static/css/netra.css?v=1.1.1`. Saat versi naik di `package.json`, URL
  asset ikut berubah → browser & CDN auto-fetch ulang. Tidak perlu hard
  refresh manual setelah deploy.
- Helper view `asset(path)` yang menambahkan `?v=` otomatis.
- `assetV` ter-expose ke semua template (dipakai di sidebar untuk label
  versi yang selalu sinkron dengan `package.json`).

### 🔄 Diubah
- **Cache-Control headers**:
  - HTML responses → `no-cache, no-store, must-revalidate` (selalu fresh,
    agar URL asset terbaru ke-fetch).
  - Static assets (`/static/*`) → `public, max-age=31536000, immutable`
    (cache 1 tahun, aman karena URL berubah saat versi naik).
- Asset URL di semua view: `/static/...` → `asset('...')` helper.

### 🐛 Diperbaiki
- **Cache CSS basi di Cloudflare/browser** setelah upgrade dari v1.0 → v1.1.
  Sebelum v1.1.1, browser/CDN cache static asset 7 hari tanpa cache-busting,
  jadi setelah deploy versi baru user melihat campuran asset lama + HTML
  baru → layout berantakan. Sekarang teratasi secara permanen.

### ⚙️ Upgrade dari v1.1.0
```powershell
git pull origin main
pm2 restart netra
```
**Hanya satu kali** Anda perlu `Ctrl + Shift + R` di browser setelah deploy
v1.1.1 ini. Setelah itu update versi berikutnya tidak akan butuh manual
refresh lagi.

---

## [1.1.0] — 2026-05-24

Versi ini berfokus pada **redesign frontend total**: minimal, modern, dan responsif
penuh. Tidak ada perubahan API maupun skema database — upgrade aman dari v1.0.0.

### ✨ Ditambahkan
- **Design system baru** (`public/css/netra.css`, ~750 baris) custom-built tanpa
  Bootstrap. Lebih ringan, lebih konsisten, full kontrol.
- **Mobile-first responsif** — sidebar berubah jadi drawer di layar <1024px
  dengan animasi slide + scrim overlay.
- **Dark mode** — toggle di topbar, persisten via `localStorage`, no FOUC
  (theme di-apply sebelum body render).
- **Inter font** + **JetBrains Mono** via Google Fonts.
- **Stat cards baru** dengan tone semantik (primary/success/danger/warning/info)
  + hover-lift micro-interaction.
- **Status pulse indicator** (dot animasi pada kartu "Terhubung").
- **WS badge live** di sidebar footer dengan state visual (connected/connecting/offline).
- **Skeleton loaders** & **flash-update** animasi untuk row yang baru diperbarui.
- **Chart.js v4.4.1** (upgrade dari latest CDN), warna chart selaras dengan
  theme aktif (auto-update saat toggle dark mode).
- **Better empty states** dengan ikon kontekstual.

### 🔄 Diubah
- Dependencies frontend: Bootstrap CSS+JS dihapus → CSS custom-built.
- Markup BEM-style (`.sidebar__brand`, `.stat-card__icon`, dll) untuk
  maintainability.
- Topbar baru dengan judul terpusat, chip waktu, tombol theme.
- Tabel: border minimal, header uppercase tracking lebar, sticky header,
  hover row highlight halus.
- Badge: pill rounded, ikon font-awesome inline, semantic colors.
- Version di sidebar: `v1.0.0` → `v1.1.0`.
- `package.json` version bump 1.0.0 → 1.1.0.

### 🐛 Diperbaiki
- **Responsivitas mobile** — sebelumnya sidebar selalu visible memakan ruang,
  kini drawer pattern proper.
- Tabel di mobile tidak lagi memecah layout; pakai `overflow-x: auto` wrapper.
- Skrol horizontal di tabel sticky-header.

### 📐 Spesifikasi desain
| Properti | Nilai |
|---|---|
| Breakpoint mobile | < 768px |
| Breakpoint tablet | 768 — 1023px |
| Breakpoint desktop | ≥ 1024px |
| Sidebar lebar | 260px |
| Topbar tinggi | 64px |
| Radius default | 10px (card 14px) |
| Transisi durasi | 150ms `cubic-bezier(0.4,0,0.2,1)` |
| Font sans | Inter 400/500/600/700 |
| Font mono | JetBrains Mono 400/500 |

### 🔧 Internal
- Tidak ada perubahan pada layanan backend (monitor, notifier, db).
- Tidak ada migrasi DB.

### ⚙️ Upgrade dari v1.0.0
```powershell
cd c:\xampp\htdocs\netra-node
git pull origin main
git checkout v1.1.0          # atau biarkan di main
pm2 restart netra
```
Tidak perlu `npm install` ulang (no new deps di server).

---

## [1.0.0] — 2026-05-24

Rilis awal. Migrasi penuh dari Netra PHP native ke Node.js dengan arsitektur
modern.

### ✨ Ditambahkan
- **Single-poller per router** — satu proses background polling MikroTik
  untuk semua client. Default interval 5s, dapat diturunkan hingga 500ms.
- **WebSocket push** (lib `ws`, topic-based broadcasting) — update real-time
  ke semua browser tanpa polling client-side.
- **Dual monitor service**:
  - Diskominfo (router utama)
  - Rumah (router rumah + DHCP + traffic per IP)
- **Notifikasi multi-channel**:
  - WhatsApp via Fonnte API
  - Telegram bot (opsional)
  - Cooldown anti-spam per event key
  - Audit lengkap di `notification_log`
- **Auto-migration** schema MySQL (6 tabel) saat startup.
- **Halaman**:
  - `/` — Dashboard Monitoring Diskominfo (interface + status)
  - `/rumah` — Dashboard Monitoring Rumah Ku (interface + DHCP + traffic chart + laporan)
  - `/rumah/laporan` — Laporan PDF-ready printable
  - `/detail/:id` — Chart traffic per OPD
  - `/opd` — List user OPD multi-router
  - `/opd/:name` — Detail user (Hotspot + PPP + Top 5)
- **REST API**: `/api/dashboard/snapshot`, `/api/rumah/snapshot`,
  `/api/opd/:id/chart`, `/api/rumah/traffic`, `/api/opd-users/*`,
  `/api/test/{fonnte,telegram}`, `/api/monitor/status`.
- **Health endpoint** `/healthz` untuk PM2 / load-balancer.
- **Graceful shutdown** (SIGINT/SIGTERM): monitor stop, DB close, http close.
- **Structured logging** via `pino` (pretty mode untuk dev, JSON untuk prod).
- **PM2 ecosystem.config.js** + Windows auto-start via pm2-windows-startup.
- **Dokumentasi**: README, ARCHITECTURE, MIGRATION_FROM_PHP, GETTING_STARTED.

### 🏗️ Stack
- Node.js 18+ · Express 4 · EJS · mysql2/promise · ws · node-routeros
- axios · pino · dotenv · Bootstrap 5 (DIHAPUS di v1.1)

### 📊 Resource footprint (target)
- RAM: ~80-90 MB idle
- CPU: ~1-3% idle, ~5-10% saat tick poll
- Disk: ~140 KB source + 30 MB node_modules

### Migrasi dari PHP
Lihat [docs/MIGRATION_FROM_PHP.md](docs/MIGRATION_FROM_PHP.md).
DB compatible — kolom baru ditambah lewat auto-migration tanpa data loss.

---

[1.1.5]: https://github.com/RokiFauziErenJaegar/netra/releases/tag/v1.1.5
[1.1.4]: https://github.com/RokiFauziErenJaegar/netra/releases/tag/v1.1.4
[1.1.3]: https://github.com/RokiFauziErenJaegar/netra/releases/tag/v1.1.3
[1.1.2]: https://github.com/RokiFauziErenJaegar/netra/releases/tag/v1.1.2
[1.1.1]: https://github.com/RokiFauziErenJaegar/netra/releases/tag/v1.1.1
[1.1.0]: https://github.com/RokiFauziErenJaegar/netra/releases/tag/v1.1
[1.0.0]: https://github.com/RokiFauziErenJaegar/netra/releases/tag/v1.0
