# Arsitektur NETRA

Dokumen ini menjelaskan keputusan desain di balik NETRA dan trade-off yang
diambil. Audiens: pengembang yang akan memelihara atau memperluas aplikasi.

## Prinsip Desain

1. **Satu poller, banyak konsumen.** Untuk N browser yang membuka dashboard,
   tetap hanya ada 1 request poll ke MikroTik per interval. Setiap browser
   menerima update via WebSocket push, tidak via polling AJAX masing-masing.
2. **Stateless di sisi UI.** State authoritative ada di database + memori
   poller. UI hanya menggambar ulang dari snapshot yang diterima.
3. **Hemat resource.** Target footprint ~80 MB RAM, CPU ~1-3% idle. Tidak
   ada framework berat (no socket.io, no react, no orm).
4. **Failure-isolated.** Polling gagal (router down) tidak mematikan HTTP
   server. Notifikasi gagal tidak menghentikan polling. Setiap layer
   melindungi diri dengan try/catch.
5. **Background-first.** Polling, notif, dan housekeeping berjalan
   independen dari traffic HTTP. Tidak ada user yang perlu "memicu" sync.

## Komponen

### `src/server.js`
Entry point. Tanggung jawab:
- Pastikan schema DB ada (`ensureSchema`).
- Buat HTTP server + attach WS hub ke server yang sama (share port).
- Mulai monitor services.
- Register signal handler untuk graceful shutdown.

### `src/app.js`
Setup Express:
- Body parser, view engine, static.
- Logging request ringan.
- Mount routes (`/`, `/api`).
- Error handler global.

### `src/services/mikrotik.js`
Wrapper ringan untuk `node-routeros`. Kunci desain:
- **Session pendek**: connect → eksekusi 1-N command → disconnect.
- Tidak menahan koneksi terbuka antar tick. Lebih tahan terhadap MikroTik
  yang restart, timeout, atau drop koneksi.
- Setiap command dibungkus `Promise.race` dengan timeout, mencegah polling
  thread macet.
- `snapshot()` adalah optimasi: ambil interface + traffic + dhcp + connection
  dalam satu sesi. Membatasi overhead handshake API.

### `src/services/wsHub.js`
WebSocket berbasis **topic-fan**:
- Satu `WebSocketServer` di `/ws`.
- Client connect dengan `?topic=<name>`; server menyimpan referensi di
  `Map<topic, Set<WebSocket>>`.
- `broadcast(topic, data)` iterasi set, send paralel.
- Cleanup otomatis pada `close`/`error`.
- Implementasi pakai `ws` library (~30 KB) — tidak pakai socket.io (~600 KB
  + protokol overhead) karena kita tidak butuh fallback transport.

### `src/services/monitorDiskominfo.js` & `monitorRumah.js`
Inti monitoring. Pola:
```
setInterval(tick):
    if running: skip      // back-pressure: cegah overlap
    running = true
    try snapshot(MikroTik)
    for each interface:
        diff dengan state lama (DB)
        if status berubah → trigger notifikasi
        UPSERT ke DB
    INSERT log_traffic
    cleanup row yang hilang
    broadcast snapshot via WsHub
    sesekali: cleanup data > 90 hari
    running = false
```

**Mengapa back-pressure?** Bila interval 1 detik tapi snapshot memakan 1.5
detik (router lambat), tanpa back-pressure, tick kedua akan tumpang tindih
dan menumpuk → resource leak. Dengan skip, kita degrade gracefully: poll
sebenarnya jadi 1.5s alih-alih 1s, tapi tidak crash.

### `src/services/notifier.js`
Notifier dengan cooldown:
- `Map<key, timestamp>` in-memory.
- Key adalah string seperti `"diskominfo:*5:disabled"` — granular per
  interface per jenis event.
- Sebelum kirim, cek apakah key ini terakhir dikirim < `NOTIF_COOLDOWN_MS`.
  Kalau iya, skip.
- Dispatch paralel ke semua channel aktif (`Promise.allSettled`).
- Hasil setiap channel dicatat ke `notification_log` untuk audit.

### `src/services/fonnte.js` & `telegram.js`
Wrapper HTTP sederhana via axios:
- Timeout 15s (Fonnte) / 10s (Telegram).
- Log setiap call ke `notification_log` apapun hasilnya.
- Selalu return shape `{ ok, error, response }` — caller tidak perlu
  try/catch.

### `src/db/index.js`
`mysql2/promise` connection pool. Dipakai oleh service apapun yang butuh DB
via `pool.query()` (auto acquire/release) atau `pool.getConnection()` untuk
transaksi/multi-statement.

## Aliran Data: Saat Interface Di-Disable

```
1. Admin disable interface di MikroTik
                ↓
2. monitorDiskominfo tick berikutnya:
                ↓
3. MikroTik /interface/print → disabled=true untuk interface itu
                ↓
4. Service baca state lama dari master_opd (WHERE routeros_id=...)
                ↓
5. Bandingkan: old.disabled === 0, new.disabled === 1 → state change
                ↓
6. notifier.notifyAll('PERINGATAN INTERFACE DISKOMINFO', msg, { key: 'diskominfo:*5:disabled' })
                ↓
7. cooldown check → boleh kirim → Fonnte + Telegram (paralel)
                ↓
8. notification_log INSERT
                ↓
9. master_opd UPSERT (last_notified_disabled = NOW())
                ↓
10. wsHub.broadcast('dashboard', snapshot)
                ↓
11. Semua browser dashboard terbuka menerima update instant via WebSocket
                ↓
12. UI render row interface dengan badge merah "TIDAK TERHUBUNG"
```

## Trade-offs Penting

### Mengapa EJS, bukan SPA (React/Vue)?
- Tim Diskominfo lebih familiar dengan template engine ala PHP.
- SSR awal lebih cepat first-paint untuk dashboard sederhana.
- Update real-time tetap via WS push, jadi tidak perlu SPA.
- Lebih sedikit build step → lebih mudah deploy.

### Mengapa tidak pakai socket.io?
- Modern browser sudah universal support WebSocket native.
- `ws` library: ~30 KB, langsung pakai protokol RFC 6455.
- socket.io: ~600 KB client + room/namespace abstraction yang tidak kita
  butuhkan.

### Mengapa polling, bukan webhook MikroTik?
- MikroTik tidak punya webhook native. Pilihan: polling atau Streaming API
  (jarang dipakai, dukungan terbatas).
- Polling sederhana, deterministik, mudah dikontrol.

### Mengapa session pendek (bukan persistent connection ke RouterOS)?
- Persistent connection: low overhead per request, tapi rapuh — bila router
  reboot atau koneksi drop, kita harus reconnect logic yang kompleks.
- Session pendek: handshake setiap tick (~50ms overhead), tapi self-healing
  — setiap tick adalah "fresh attempt".
- Trade-off worth it untuk reliability.

## Batasan Saat Ini

1. **Single MySQL instance.** Tidak ada read replica / sharding. Cukup
   untuk skala 100-500 OPD.
2. **In-memory cooldown.** Restart aplikasi reset cooldown — bila restart
   tepat di tengah notif storm, bisa dapat duplikat. Mitigasi: kombinasi
   dengan `last_notified_*` di DB (sudah diimplementasi).
3. **No multi-instance.** Bila ingin HA (failover), butuh sticky session WS
   atau eksternal message broker (Redis pub/sub).
4. **Tidak ada auth.** Saat ini terbuka untuk siapapun di jaringan. Untuk
   produksi publik, tambahkan auth middleware (mis. session-based atau JWT)
   dan letakkan di belakang reverse proxy dengan IP allow-list.

## Roadmap Pengembangan

- [ ] Authentication (login admin)
- [ ] Notifikasi via email (nodemailer)
- [ ] SNMP polling sebagai alternatif RouterOS API
- [ ] Multi-tenant (multiple Diskominfo / region)
- [ ] Export Excel laporan
- [ ] Dark mode UI
- [ ] Mobile app companion (PWA)
