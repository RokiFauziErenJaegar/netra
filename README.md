# NETRA — Network Monitoring System

> **N**etwork **E**ngagement **T**racking & **R**esponse **A**pplication
>
> Dinas Komunikasi dan Informatika Kabupaten Pringsewu

![version](https://img.shields.io/badge/version-1.1.0-blue)
![node](https://img.shields.io/badge/node-%E2%89%A518-43853d)
![license](https://img.shields.io/badge/license-MIT-green)
![status](https://img.shields.io/badge/status-production-success)

NETRA adalah aplikasi monitoring jaringan real-time untuk perangkat MikroTik
RouterOS. Dibangun ulang dari aplikasi PHP native ke arsitektur Node.js modern
dengan polling sub-detik, push notifikasi via WebSocket, dan alerting via
WhatsApp (Fonnte) & Telegram tanpa bergantung pada browser yang terbuka.

> 🎨 **v1.1.0** — Frontend di-redesign total: minimal, modern, full-responsif,
> dengan dark mode. Lihat [CHANGELOG.md](CHANGELOG.md) atau
> [docs/UI_REDESIGN.md](docs/UI_REDESIGN.md) untuk detail.

---

## Daftar Isi
1. [Fitur Utama](#fitur-utama)
2. [Arsitektur](#arsitektur)
3. [Prasyarat](#prasyarat)
4. [Instalasi Cepat](#instalasi-cepat)
5. [Konfigurasi](#konfigurasi)
6. [Menjalankan](#menjalankan)
7. [Deployment Produksi](#deployment-produksi-windows-service--pm2)
8. [Struktur Folder](#struktur-folder)
9. [Endpoint API & WebSocket](#endpoint-api--websocket)
10. [Skema Database](#skema-database)
11. [Tuning Performa](#tuning-performa)
12. [Troubleshooting](#troubleshooting)
13. [Kontribusi](#kontribusi)

---

## Fitur Utama

### Frontend (v1.1.0)
- **Custom design system** tanpa Bootstrap, ~21 KB CSS vs 220 KB Bootstrap
  (saving 90%). Lihat [docs/UI_REDESIGN.md](docs/UI_REDESIGN.md).
- **Mobile-first responsif** dengan drawer sidebar di layar kecil.
- **Dark mode** dengan toggle persisten (`localStorage`), no flicker.
- **Inter font** + tabular-numerals untuk angka real-time tanpa "jumping".
- **Micro-interactions**: hover-lift cards, status pulse, smooth transitions.
- **WCAG AA contrast**, focus rings, ARIA labels.

### Monitoring Real-Time (sub-detik)
- **Single poller per router** — hanya satu proses background yang query
  MikroTik. Tidak peduli ada 1 atau 1000 dashboard terbuka, beban router
  tetap sama.
- **WebSocket push** — server mendorong update ke browser saat data berubah.
  Tidak ada lagi polling AJAX setiap 5 detik dari sisi client.
- **Konfigurable interval** — default 5000ms, dapat diturunkan hingga 500ms
  untuk pemantauan kritis (lihat `POLL_INTERVAL_*_MS` di [.env.example](.env.example)).

### Dashboard
- **Dashboard Diskominfo** — status semua interface router utama, traffic
  RX/TX live per interface, badge UP/DOWN, deteksi otomatis interface
  baru/hilang.
- **Dashboard Monitoring Rumah Ku** — interface, DHCP lease, top usage per
  perangkat, chart penggunaan harian/mingguan/bulanan, export laporan PDF.
- **Detail per OPD** — chart traffic harian per OPD (RX/TX dalam Mbps).
- **List User OPD** — agregasi user Hotspot + PPP/VPN dari multi router OPD,
  per-OPD detail (Top-5 konsumsi data, distribusi tipe user).

### Notifikasi
- **WhatsApp via Fonnte** — alert otomatis saat interface ter-disable atau
  tidak terhubung; juga alert *pemulihan* saat interface kembali UP.
- **Telegram bot** (opsional) — channel notifikasi alternatif.
- **Cooldown anti-spam** — notifikasi yang sama tidak dikirim ulang dalam
  rentang `NOTIF_COOLDOWN_MS` (default 5 menit), mencegah banjir pesan saat
  interface flap.
- **Audit trail** — setiap notifikasi tercatat di tabel `notification_log`.

### Operasional
- **Tidak butuh browser terbuka** — proses Node.js jalan terus sebagai
  daemon. Notifikasi tetap terkirim 24/7.
- **Auto-migration** — saat startup, schema database dibuat otomatis bila
  belum ada.
- **Graceful shutdown** — pada SIGINT/SIGTERM, monitor stop, koneksi DB
  ditutup rapi.
- **Health check endpoint** — `GET /healthz` untuk load-balancer/pm2 monitor.
- **Structured logging** — output JSON via [pino](https://getpino.io)
  (atau pretty mode untuk dev).

---

## Arsitektur

```
                    ┌─────────────────── Node.js Process (Netra) ───────────────────┐
                    │                                                                │
                    │  ┌─────────────┐    ┌─────────────────────────────────────┐    │
   ┌──────────┐     │  │  Express    │    │       Monitor Services (poller)     │    │
   │ Browser  │◄────┼──┤  HTTP/SSR   │    │                                     │    │
   │ (clients)│     │  │  + REST API │    │  ┌──────────────────┐  ┌─────────┐  │    │
   └──────────┘     │  └─────────────┘    │  │ Diskominfo poll  │  │  Rumah  │  │    │
        ▲           │         │           │  │ (interval N ms)  │  │  poll   │  │    │
        │   WS push │  ┌─────────────┐    │  └────────┬─────────┘  └────┬────┘  │    │
        └───────────┼──┤  WsHub      │◄───┤           │                  │       │    │
                    │  │ (topic-fan) │    │           ▼                  ▼       │    │
                    │  └─────────────┘    │  ┌──────────────────────────────┐    │    │
                    │         ▲           │  │  MySQL Pool (mysql2)         │    │    │
                    │         └───────────┤  └──────────────────────────────┘    │    │
                    │                     │           │                          │    │
                    │                     │           ▼                          │    │
                    │                     │  ┌──────────────────────────────┐    │    │
                    │                     │  │  Notifier (cooldown)         │    │    │
                    │                     │  │   ├─ Fonnte (WA)             │    │    │
                    │                     │  │   └─ Telegram                │    │    │
                    │                     │  └──────────────────────────────┘    │    │
                    │                     └──────────────────────────────────────┘    │
                    └────────────────────────────────────────────────────────────────┘
                              │              │            │             │
                              ▼              ▼            ▼             ▼
                       ┌──────────┐   ┌──────────┐  ┌─────────┐  ┌────────────┐
                       │  MySQL   │   │ MikroTik │  │ Fonnte  │  │  Telegram  │
                       │          │   │  RouterOS│  │ WA API  │  │  Bot API   │
                       └──────────┘   └──────────┘  └─────────┘  └────────────┘
```

**Keuntungan vs. PHP native:**

| Aspek                  | PHP Native (lama)              | Node.js (Netra)                  |
|------------------------|--------------------------------|----------------------------------|
| Interval polling       | bergantung refresh browser     | 500ms – konfigurable             |
| Notifikasi WA          | hanya jika browser terbuka     | 24/7 tanpa browser               |
| Beban MikroTik         | N viewer × interval            | 1 poll per router (tetap)        |
| Latensi update UI      | maksimal interval JS (5 detik) | < 50 ms (push WS)                |
| Koneksi DB             | open/close per request         | connection pool (reusable)       |
| Resource RAM           | per-request fork (PHP-FPM)     | satu proses, ~80 MB              |

---

## Prasyarat

| Komponen     | Versi minimum | Catatan                                   |
|--------------|---------------|-------------------------------------------|
| Node.js      | 18 LTS        | direkomendasikan 20 LTS                   |
| npm          | 9             | terbawa Node.js                           |
| MySQL/MariaDB| 5.7 / 10.3    | utf8mb4                                   |
| MikroTik     | RouterOS 6+   | API service harus enable (port 8728)      |
| Fonnte token | -             | daftar gratis di fonnte.com               |
| Telegram bot | -             | opsional, via @BotFather                  |

**Install Node.js di Windows:**

1. Unduh installer LTS dari https://nodejs.org/en/download/
2. Jalankan installer, centang "Add to PATH"
3. Verifikasi: buka PowerShell baru → `node -v` dan `npm -v`

---

## Instalasi Cepat

```powershell
# 1. Clone repository
git clone https://github.com/<username>/netra.git
cd netra

# 2. Install dependencies
npm install

# 3. Salin konfigurasi
copy .env.example .env

# 4. Edit .env — isi kredensial DB, MikroTik, Fonnte
notepad .env

# 5. Pastikan database sudah ada (skema akan otomatis dibuat)
#    Buat via phpMyAdmin atau:
#    mysql -u root -e "CREATE DATABASE db_monitoring_pringsewu CHARSET utf8mb4"

# 6. Jalankan
npm start
```

Buka `http://localhost:3000` di browser.

---

## Konfigurasi

Semua konfigurasi lewat file `.env`. Salin dari `.env.example` lalu sesuaikan.

### Bagian penting

| Variable                          | Deskripsi                                            |
|-----------------------------------|------------------------------------------------------|
| `PORT`                            | Port HTTP server (default 3000)                      |
| `DB_HOST` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Konfigurasi MySQL              |
| `MIKROTIK_DISKOMINFO_HOST`        | IP router utama Diskominfo                           |
| `MIKROTIK_RUMAH_HOST`             | IP router rumah                                      |
| `POLL_INTERVAL_DISKOMINFO_MS`     | Interval poll (default 5000, minimum 500)            |
| `POLL_INTERVAL_RUMAH_MS`          | Interval poll rumah                                  |
| `FONNTE_TOKEN`                    | Token API Fonnte                                     |
| `FONNTE_TARGET`                   | Nomor WA tujuan (format 628xxxx atau 08xxx)          |
| `TELEGRAM_TOKEN` / `TELEGRAM_CHAT_ID` | Bot Telegram (opsional)                          |
| `NOTIF_COOLDOWN_MS`               | Cooldown antar notifikasi sama (default 5 menit)     |
| `OPD_ROUTERS`                     | Daftar router OPD dipisah `;` — format: `Nama\|IP\|user\|pass` |

### Tip keamanan
- **JANGAN** commit file `.env` ke git (`.gitignore` sudah mencegahnya).
- Untuk produksi, set `LOG_PRETTY=false` agar log berformat JSON (mudah
  di-parse oleh agregator log).
- Gunakan `TRUST_PROXY=true` bila aplikasi di belakang Nginx/IIS reverse
  proxy agar IP client tepat.

---

## Menjalankan

### Development (auto-reload)
```bash
npm run dev
```
Menggunakan flag `--watch` Node.js — server restart otomatis setiap kali
file source berubah.

### Production
```bash
npm start
```
Atau via PM2 (lihat bagian Deployment Produksi).

### Migrasi manual
Auto-migrate berjalan saat startup. Untuk eksekusi terpisah:
```bash
npm run migrate
```

---

## Deployment Produksi (Windows Service / PM2)

### Opsi A: PM2 (lintas-platform)
```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```
Pada Windows, gunakan `pm2-installer` atau `pm2-windows-service` agar PM2
otomatis start saat boot.

### Opsi B: Windows Service via NSSM
1. Unduh [NSSM](https://nssm.cc/download)
2. `nssm install Netra "C:\Program Files\nodejs\node.exe" "C:\path\to\netra\src\server.js"`
3. Set startup folder = direktori netra
4. Set startup type = Automatic
5. `nssm start Netra`

### Opsi C: Reverse proxy via Apache/Nginx
NETRA mendengarkan di port 3000. Letakkan di belakang reverse proxy untuk
mendapatkan HTTPS via Let's Encrypt dan domain custom.

Contoh Nginx:
```nginx
location /netra/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```
(Ingat: set `TRUST_PROXY=true` di `.env` bila di-proxy)

---

## Struktur Folder

```
netra/
├── src/
│   ├── server.js                # entry point — startup, graceful shutdown
│   ├── app.js                   # Express app (middleware, routes, error)
│   ├── config.js                # load .env → object
│   ├── logger.js                # pino logger
│   ├── db/
│   │   ├── index.js             # MySQL connection pool
│   │   ├── migrations.js        # auto-create schema
│   │   └── migrate-cli.js       # manual migrate command
│   ├── services/
│   │   ├── mikrotik.js          # node-routeros wrapper (timeout, session)
│   │   ├── fonnte.js            # Fonnte WA send + log
│   │   ├── telegram.js          # Telegram bot send + log
│   │   ├── notifier.js          # multi-channel + cooldown
│   │   ├── wsHub.js             # WebSocket broadcaster (topic-based)
│   │   ├── monitorDiskominfo.js # single poller router utama
│   │   ├── monitorRumah.js      # single poller router rumah
│   │   └── helpers.js           # util: format Mbps/Bytes, dll
│   └── routes/
│       ├── pages.js             # SSR pages (EJS)
│       └── api.js               # JSON REST endpoints
├── views/                       # EJS templates
│   ├── partials/                # head, sidebar, navbar
│   ├── dashboard.ejs            # main dashboard (Diskominfo)
│   ├── dashboard_rumah.ejs      # dashboard rumah
│   ├── detail.ejs               # detail traffic per OPD
│   ├── opd_list.ejs             # list user OPD
│   ├── opd_detail.ejs           # detail user OPD
│   ├── laporan_rumah.ejs        # laporan printable
│   └── error.ejs                # 404/500 page
├── public/                      # static assets
│   ├── css/netra.css
│   └── js/                      # client-side JS per page
├── docs/                        # dokumentasi tambahan
├── .env.example
├── .gitignore
├── ecosystem.config.js          # PM2 config
├── package.json
└── README.md
```

---

## Endpoint API & WebSocket

### REST API
| Method | Path                              | Deskripsi                                   |
|--------|-----------------------------------|---------------------------------------------|
| GET    | `/healthz`                        | Liveness probe                              |
| GET    | `/api/dashboard/snapshot`         | Snapshot terbaru router Diskominfo          |
| GET    | `/api/rumah/snapshot`             | Snapshot terbaru router rumah               |
| GET    | `/api/opd/:id/chart`              | Data chart traffic harian per OPD           |
| GET    | `/api/rumah/traffic?periode=...`  | Agregasi traffic rumah (harian/mingguan/bulanan) |
| GET    | `/api/opd-users/summary`          | Hitung user aktif tiap router OPD           |
| GET    | `/api/opd-users/:name`            | Detail user hotspot + PPP per OPD           |
| POST   | `/api/test/fonnte`                | Tes kirim WhatsApp                          |
| POST   | `/api/test/telegram`              | Tes kirim Telegram                          |
| GET    | `/api/monitor/status`             | Status monitor (running/lastError)          |

### WebSocket
Endpoint tunggal: `ws://host:port/ws?topic=<TOPIC>`

| Topic       | Payload                                                          |
|-------------|------------------------------------------------------------------|
| `dashboard` | Snapshot interface Diskominfo (broadcast tiap tick poller)       |
| `rumah`     | Snapshot interface + DHCP rumah (broadcast tiap tick poller)     |

Format pesan:
```json
{
  "type": "update",
  "topic": "dashboard",
  "time": "2026-05-23T08:15:22.456Z",
  "data": { /* snapshot lengkap */ }
}
```

---

## Skema Database

Lihat file [src/db/migrations.js](src/db/migrations.js) untuk DDL lengkap.

| Tabel                          | Fungsi                                            |
|--------------------------------|---------------------------------------------------|
| `master_opd`                   | Status interface MikroTik Diskominfo per OPD      |
| `log_traffic`                  | Time-series traffic per OPD (untuk chart detail)  |
| `monitoring_rumah_interface`   | Status interface router rumah                     |
| `monitoring_rumah_traffic`     | Time-series traffic router rumah                  |
| `monitoring_rumah_dhcp_lease`  | DHCP lease + total bandwidth per perangkat        |
| `notification_log`             | Audit semua kiriman WA/Telegram                   |

Migrasi otomatis dijalankan saat startup; tabel akan dibuat bila belum ada.
Tidak destructive — data lama dipertahankan.

---

## Tuning Performa

### Interval polling sub-detik
Default 5 detik aman untuk router level menengah. Untuk pemantauan kritis:

```env
POLL_INTERVAL_DISKOMINFO_MS=1000
POLL_INTERVAL_RUMAH_MS=1000
```

**Pertimbangan:**
- CPU MikroTik akan naik. Pada RouterBoard low-end (hAP lite), <2 detik bisa
  membuat CPU ~30-50%.
- Volume log_traffic juga naik proporsional. Default cleanup adalah data
  > 90 hari (lihat `monitorDiskominfo.js`).
- 500 ms adalah batas minimum yang di-enforce kode untuk mencegah crash.

### Connection pool size
```env
DB_POOL_LIMIT=20
```
Naikkan bila banyak request concurrent (mis. saat banyak browser dashboard
terbuka bersamaan).

### Log volume
Set `LOG_LEVEL=warn` di produksi untuk mengurangi disk I/O log.

---

## Troubleshooting

### "ECONNREFUSED" saat startup
- Cek MySQL jalan: `services.msc` → MySQL running
- Cek `DB_HOST` dan `DB_PORT` di `.env`
- Verifikasi user/password dapat login: `mysql -u <USER> -p`

### "MikroTik timeout"
- Pastikan MikroTik API service aktif:
  `/ip service enable api` di terminal MikroTik
- Cek firewall MikroTik tidak memblokir port 8728
- Verifikasi user MikroTik punya policy `api`

### Notifikasi WA tidak terkirim
1. Tes via `curl -X POST http://localhost:3000/api/test/fonnte`
2. Lihat respons — bila error SSL, set `NODE_TLS_REJECT_UNAUTHORIZED=0`
   sementara (hanya untuk dev)
3. Cek dashboard Fonnte: device terkoneksi? saldo cukup?
4. Lihat audit di tabel `notification_log`

### Dashboard tidak update real-time
- Cek WS connection di console browser: ada `WebSocket connection failed`?
- Pastikan reverse proxy meneruskan header `Upgrade: websocket`
- Cek log server: ada error di topic `dashboard` / `rumah`?

### Port 3000 sudah dipakai
Ubah `PORT=3001` (atau angka lain) di `.env`.

---

## Kontribusi

1. Fork repo
2. Buat branch: `git checkout -b fitur/nama-fitur`
3. Commit perubahan: `git commit -m 'Tambah X'`
4. Push: `git push origin fitur/nama-fitur`
5. Buka Pull Request

### Coding style
- 2 spasi indent
- Single quotes untuk string
- Semicolon required
- Komentar dalam Bahasa Indonesia (sesuai konteks instansi)

---

## Riwayat Versi

| Versi | Tanggal | Highlight |
|---|---|---|
| [v1.1.0](CHANGELOG.md#110--2026-05-24) | 2026-05-24 | 🎨 Frontend redesign total (custom design system, dark mode, responsif penuh) |
| [v1.0.0](CHANGELOG.md#100--2026-05-24) | 2026-05-24 | 🚀 Rilis awal — migrasi dari PHP native ke Node.js |

Lihat semua rilis di [GitHub Releases](https://github.com/RokiFauziErenJaegar/netra/releases).

## Lisensi

MIT — lihat [LICENSE](LICENSE).

---

## Penutup

NETRA dibangun sebagai sistem pemantauan jaringan modern untuk **Dinas
Komunikasi dan Informatika Kabupaten Pringsewu**. Aplikasi ini menggantikan
versi PHP native dengan arsitektur yang lebih efisien, real-time, dan dapat
beroperasi 24/7 tanpa intervensi manual.

Untuk pertanyaan teknis atau kerja sama, silakan buka issue di repository
GitHub.

> *"Pelayanan publik yang andal dimulai dari infrastruktur yang terpantau."*
