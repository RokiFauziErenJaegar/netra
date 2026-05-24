# Changelog

Catatan rilis untuk Netra. Mengikuti format [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/)
dan [Semantic Versioning](https://semver.org/lang/id/).

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

[1.1.1]: https://github.com/RokiFauziErenJaegar/netra/releases/tag/v1.1.1
[1.1.0]: https://github.com/RokiFauziErenJaegar/netra/releases/tag/v1.1
[1.0.0]: https://github.com/RokiFauziErenJaegar/netra/releases/tag/v1.0
