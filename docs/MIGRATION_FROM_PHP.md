# Panduan Migrasi dari Netra PHP Native

Aplikasi PHP lama dan Netra Node.js menggunakan **database yang sama**
(`db_monitoring_pringsewu`). Tidak ada data loss saat migrasi.

## Perubahan Skema

Netra Node.js menambahkan beberapa kolom/tabel yang tidak ada di versi PHP:

| Tabel                          | Perubahan                                      |
|--------------------------------|------------------------------------------------|
| `master_opd`                   | + `routeros_id`, `disabled`, `running`, `mac_address`, `type`, `last_rx_bps`, `last_tx_bps`, `last_notified_down`, `last_notified_disabled` |
| `notification_log` (baru)      | Audit kiriman WA / Telegram                    |

Auto-migration di `src/db/migrations.js` menjalankan `CREATE TABLE IF NOT
EXISTS` — kolom baru ditambah pada tabel yang sudah ada hanya bila tabelnya
belum ada. **Untuk merge tabel `master_opd` yang sudah ada datanya**,
jalankan ALTER manual:

```sql
ALTER TABLE master_opd
  ADD COLUMN IF NOT EXISTS routeros_id VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mac_address VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS disabled TINYINT(1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS running TINYINT(1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_rx_bps BIGINT(20) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_tx_bps BIGINT(20) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_notified_down DATETIME DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_notified_disabled DATETIME DEFAULT NULL,
  ADD UNIQUE INDEX IF NOT EXISTS uq_routeros_id (routeros_id);
```
(Catatan: sintaks `IF NOT EXISTS` di ALTER tersedia MariaDB 10.0+ /
MySQL 8.0.29+. Pada versi lebih lama, cek manual lalu skip yang sudah ada.)

## Mapping URL PHP → Node

| PHP (lama)                                  | Node (baru)                       |
|---------------------------------------------|-----------------------------------|
| `/index.php`                                | `/`                               |
| `/dashboard_monitoring_rumah.php`           | `/rumah`                          |
| `/dashboard_monitoring_rumah_laporan.php`   | `/rumah/laporan`                  |
| `/list_user_opd.php`                        | `/opd`                            |
| `/lihat_user.php?opd=X`                     | `/opd/X`                          |
| `/detail.php?id=X`                          | `/detail/X`                       |
| `/get_chart_data.php?id=X`                  | `/api/opd/X/chart`                |
| `/sync_mikrotik.php`                        | tidak diperlukan (auto polling)   |
| `/engine_monitor.php`                       | tidak diperlukan (background loop)|

## Konfigurasi: `koneksi.php` → `.env`

| `koneksi.php`              | `.env`                              |
|----------------------------|-------------------------------------|
| `$host`, `$user`, `$pass`, `$db` | `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` |
| `$mikrotik_ip` dst.        | `MIKROTIK_DISKOMINFO_HOST` dst.     |
| `$mikrotik_rumah_ip` dst.  | `MIKROTIK_RUMAH_HOST` dst.          |
| `$telegram_token`, `$telegram_chat_id` | `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID` |
| `$fonnte_token`, `$fonnte_target` | `FONNTE_TOKEN`, `FONNTE_TARGET` |

## Co-existence
Versi PHP dan Node.js dapat berjalan bersamaan (port berbeda). Pertimbangkan
untuk:
- Menjalankan Node.js di port 3000.
- PHP tetap di port 80 (Apache/XAMPP) selama masa transisi.
- Bila kedua-duanya menulis ke DB, monitor service Node.js akan mengambil
  alih kontrol kolom `last_notified_*` — alert PHP akan tetap berfungsi tapi
  cooldown tidak terkoordinasi.

**Rekomendasi**: setelah verifikasi Node.js stabil, matikan `engine_monitor.php`
(cron) dan hentikan akses PHP untuk monitoring. Versi PHP dapat dipertahankan
sebagai read-only fallback bila diperlukan.

## Rollback Plan
Bila ada masalah:
1. `pm2 stop netra` (atau `Ctrl+C` di console)
2. Kembali ke PHP — semua data masih utuh.
3. Issue tracker: lampirkan log dari `logs/err.log` PM2.
