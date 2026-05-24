# Cara Kerja Real-Time Netra

Dokumen ini menjelaskan bagaimana Netra mendorong data real-time ke browser
dan cara verifikasi kalau fitur ini bekerja.

## Arsitektur Real-Time

```
┌──────────────────┐                 ┌─────────────────┐
│   MikroTik       │  RouterOS API   │  Netra Server   │
│   RouterOS       │ ◄─── poll ───── │   (Node.js)     │
│   (router)       │   tiap N ms     │                 │
└──────────────────┘                 │   ┌─────────┐   │
                                     │   │  WsHub  │   │
                                     │   └────┬────┘   │
                                     └────────┼────────┘
                                              │
                                  WebSocket push
                                  (event-driven)
                                              │
                                              ▼
                                     ┌─────────────────┐
                                     │     Browser     │
                                     │   (live UI)     │
                                     └─────────────────┘
```

**Yang benar-benar realtime**: ketika monitor service membaca data baru
dari MikroTik, snapshot di-broadcast ke **semua browser yang aktif** via
WebSocket. Browser menerima dalam <50ms (LAN) atau ~100-300ms (lewat
internet/Cloudflare).

**Bukan polling client-side**: browser tidak periodically fetch. Server
"dorong" data hanya ketika ada update.

## Komponen UI yang Membuat "Rasanya" Live

Sejak v1.1.2, dashboard punya beberapa cue visual agar tampak benar-benar
hidup walaupun update setiap 2 detik:

| Komponen | Fungsi |
|---|---|
| **Heartbeat dot** di topbar | Ring hijau pulsing 2 detik (selalu jalan) |
| **Live ticker** "X detik lalu" | Update setiap 500ms client-side; selalu terlihat berjalan |
| **Flash highlight** saat angka berubah | Background biru muda 900ms saat stat-card update |
| **WS badge** | "Live"/"Connecting"/"Offline" di sidebar bawah |

## Interval Polling

Diatur via env:
```env
POLL_INTERVAL_DISKOMINFO_MS=2000
POLL_INTERVAL_RUMAH_MS=2000
```

| Interval | Karakter | Beban CPU MikroTik (RB low-end) |
|---|---|---|
| 5000ms (lama) | Hemat, "kalem" | ~5% |
| **2000ms (default v1.1.2+)** | Responsif, sweet spot | ~12% |
| 1000ms | Sangat responsif | ~25% |
| 500ms | Hyper-realtime | ~50%+ |

**Minimum 500ms** di-enforce oleh kode untuk mencegah crash. Tidak ada
batas atas — bila ingin 60 detik, set `60000`.

Untuk apply perubahan: edit `.env` lalu `pm2 restart netra`.

## Verifikasi WebSocket Bekerja

### Cara 1: Lihat WS badge di sidebar
Pojok kiri bawah ada chip dengan ikon plug. Status:
- 🟢 **"Live"** (hijau) — WS connected, real-time aktif
- 🟡 **"Connecting"** (kuning, spinner) — sedang reconnect
- 🔴 **"Offline"** (merah) — WS gagal connect; UI tidak update otomatis

### Cara 2: Browser DevTools (paling deterministik)
1. Buka dashboard di browser
2. Tekan **F12**
3. Tab **Network** → klik filter **WS**
4. Refresh halaman
5. Harus muncul 1 row: `ws?topic=dashboard` (atau `topic=rumah`)
   - Status: **101 Switching Protocols** ✓
   - Kolom waktu: **Pending** (artinya connection masih open — benar)
6. Klik row itu → tab **Messages** → akan terlihat pesan masuk tiap interval

### Cara 3: Live ticker harus jalan
Di topbar kanan ada ticker **"X detik lalu"** yang bertambah tiap detik.
- Bila terus jalan dari 1, 2, 3, 4… → WS masih connect, tinggal nunggu broadcast
- Bila reset ke "baru saja" tiap N detik → broadcast masuk sukses
- Bila stuck di angka besar tanpa reset → WS terputus

## Troubleshooting

### WS badge "Offline" terus
1. Cek server jalan: `pm2 list` → status `online`
2. Cek port 3000 listen: `Test-NetConnection localhost -Port 3000`
3. Cek konsol browser (F12 → Console) untuk error WebSocket
4. Reload halaman dengan **Ctrl + Shift + R**

### WS connect tapi tidak ada update masuk
- Berarti **monitor service-nya yang gagal** mendapat data dari MikroTik
- Cek log: `pm2 logs netra --lines 30`
- Bila ada "Timed out after Xms" → router tidak reachable, periksa
  `MIKROTIK_*_HOST` di `.env` dan firewall

### Lewat Cloudflare Tunnel — WS tidak nyambung
Cloudflare Tunnel **mendukung WebSocket secara default**, tapi pastikan:
1. **No proxy bypass**: WS otomatis pakai protocol `wss://` saat parent
   HTTPS — sudah ditangani client code.
2. **Tunnel ingress harus berupa `http://`** (bukan `tcp://`):
   ```yaml
   # ~/.cloudflared/config.yml
   ingress:
     - hostname: netra.rokifauzi.biz.id
       service: http://localhost:3000
     - service: http_status:404
   ```
3. Bila ada **Cloudflare Access** yang memerlukan auth — WS handshake
   akan ditolak. Allow WS atau bypass auth untuk path `/ws`.

### Test WS langsung dari command line
Saat troubleshoot, jalankan dari terminal server:
```powershell
node -e "const ws = new (require('ws'))('ws://localhost:3000/ws?topic=rumah'); ws.on('open', ()=>console.log('OPEN')); ws.on('message', m=>console.log('MSG:', m.toString().substring(0,80)));"
```
Tunggu 5-10 detik, harus muncul `OPEN` lalu `MSG: ...` tiap interval poll.
