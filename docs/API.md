# NETRA REST API v1 — Panduan Penggunaan

Dokumentasi lengkap API JSON untuk sistem monitoring **NETRA** (Diskominfo Pringsewu).
API ini mengekspos seluruh data project: interface Diskominfo, traffic, laporan,
notifikasi, router OPD multi-tenant, dan monitoring rumah.

- **Base URL:** `http://<host>:3000`
- **Prefix:** semua endpoint baru berada di bawah `/api/v1`
- **Format:** JSON (request & response)
- **Versi app:** 1.1.6

> API lama di `/api/*` (dipakai oleh frontend bawaan) tetap berjalan. Untuk
> integrasi/aplikasi baru, **gunakan `/api/v1`** karena formatnya konsisten,
> terdokumentasi, mendukung filter & paginasi.

---

## 1. Format Respons

Semua respons memakai *envelope* yang seragam.

**Sukses:**
```json
{
  "ok": true,
  "data": { ... },
  "meta": { "total": 193, "limit": 100, "offset": 0, "count": 100 }
}
```
`meta` hanya muncul bila relevan (mis. paginasi atau konteks query).

**Gagal:**
```json
{
  "ok": false,
  "error": { "code": "not_found", "message": "Interface tidak ditemukan" }
}
```

**Kode HTTP yang dipakai:**

| Status | Arti |
|--------|------|
| 200 | OK |
| 400 | Parameter tidak valid (`bad_request`) |
| 401 | API key salah/absen (`unauthorized`) |
| 404 | Resource/endpoint tidak ada (`not_found`) |
| 502 | Router MikroTik tidak terjangkau (`router_unreachable`) |
| 503 | Snapshot monitor belum siap (`no_snapshot`) |
| 500 | Error internal (`internal_error`) |

---

## 2. Autentikasi (opsional)

Secara default API **terbuka** (mode LAN, tanpa autentikasi). Untuk
mengaktifkan proteksi, set variabel di file `.env`:

```env
API_KEY=rahasia-panjang-anda
```

Lalu restart server (`pm2 restart netra --update-env`). Setelah itu setiap
request ke `/api/v1` wajib menyertakan key, lewat salah satu header:

```
X-API-Key: rahasia-panjang-anda
```
atau
```
Authorization: Bearer rahasia-panjang-anda
```

Tanpa key yang benar → `401 unauthorized`.

> Proteksi ini hanya berlaku untuk `/api/v1`. Endpoint `/api/*` lama tetap
> terbuka agar UI bawaan tetap berfungsi.

---

## 3. Paginasi & Filter Umum

Endpoint berbentuk daftar mendukung query berikut:

| Query | Default | Keterangan |
|-------|---------|------------|
| `limit` | 100 | Jumlah baris (maks **1000**) |
| `offset` | 0 | Lewati N baris pertama |

`meta.total` = jumlah total baris (sebelum limit), berguna untuk menghitung
jumlah halaman.

---

## 4. Daftar Endpoint

### 4.1 Sistem

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| GET | `/api/v1` | Indeks API — daftar seluruh endpoint (self-documenting) |
| GET | `/api/v1/health` | Health check + ping database |
| GET | `/api/v1/monitors` | Status kedua monitor (diskominfo & rumah) |
| GET | `/api/v1/ws` | Info channel WebSocket realtime |

**Contoh — `GET /api/v1/health`:**
```json
{
  "ok": true,
  "data": {
    "status": "healthy",
    "db": "ok",
    "app_version": "1.1.6",
    "time": "2026-06-10T02:21:17.182Z",
    "uptime_sec": 23
  }
}
```

---

### 4.2 Interface Diskominfo

Sumber data: tabel `master_opd` (di-update tiap polling oleh monitor).

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| GET | `/api/v1/interfaces` | List interface (mendukung filter di bawah) |
| GET | `/api/v1/interfaces/summary` | Ringkasan total/up/down/disabled |
| GET | `/api/v1/interfaces/snapshot` | Snapshot live terbaru dari monitor |
| GET | `/api/v1/interfaces/:id` | Detail satu interface (by `id_opd`) |
| GET | `/api/v1/interfaces/:id/traffic` | Time-series traffic interface |

**Filter untuk `/api/v1/interfaces`:**

| Query | Contoh | Keterangan |
|-------|--------|------------|
| `status` | `Up` / `Down` | Filter status terakhir |
| `disabled` | `0` / `1` | Filter interface yang di-disable |
| `q` | `ether1` | Cari di nama interface / nama OPD / MAC |
| `sort` | `rx`, `tx`, `status`, `update`, `interface_name` | Kolom urut |
| `dir` | `asc` / `desc` | Arah urut (default `desc`) |

**Contoh — `GET /api/v1/interfaces?status=Up&sort=rx&dir=desc&limit=2`:**
```json
{
  "ok": true,
  "data": [
    {
      "id_opd": 110,
      "nama_opd": "ether1-INTERNET",
      "interface_name": "ether1-INTERNET",
      "routeros_id": "*1",
      "type": "ether",
      "mac_address": "AA:BB:CC:DD:EE:01",
      "status_terakhir": "Up",
      "disabled": 0,
      "running": 1,
      "last_rx_bps": 154200000,
      "last_tx_bps": 88300000,
      "last_update": "2026-06-10 09:21:14"
    }
  ],
  "meta": { "total": 180, "limit": 2, "offset": 0, "count": 1 }
}
```

**Time-series traffic — `GET /api/v1/interfaces/:id/traffic`:**

| Query | Contoh | Keterangan |
|-------|--------|------------|
| `date` | `2026-06-10` | Ambil 1 hari penuh |
| `start` & `end` | `2026-06-01` & `2026-06-10` | Rentang tanggal (pakai keduanya) |
| `limit` | `500` | Batas titik data |

Tanpa query → default **hari ini**. Nilai `rx_bps`/`tx_bps` dalam bit/detik,
plus `rx_mbps`/`tx_mbps` siap pakai untuk chart.

---

### 4.3 Laporan & Notifikasi

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| GET | `/api/v1/reports/interface-events` | Laporan event mati/hidup/disable |
| GET | `/api/v1/notifications` | Riwayat notifikasi WA/Telegram |

**`GET /api/v1/reports/interface-events?start=2026-06-01&end=2026-06-10`**
mengembalikan daftar event + ringkasan:
```json
{
  "ok": true,
  "data": {
    "events": [
      { "id": 30, "waktu": "2026-06-10 10:09:06", "interface_name": "ether9",
        "tipe": "ether", "mac": "04:F4:1C:7A:A7:F7",
        "status": "TERDISABLE", "kategori": "DISABLE" }
    ],
    "summary": { "total": 12, "mati": 5, "hidup": 4, "disable": 3 }
  },
  "meta": { "start": "2026-06-01", "end": "2026-06-10" }
}
```
Tanpa `start`/`end` → default 7 hari terakhir.

**Filter `/api/v1/notifications`:** `channel` (`fonnte`/`telegram`),
`success` (`0`/`1`), `q` (cari subject/body), `start`, `end`, `limit`, `offset`.

---

### 4.4 Router OPD Multi-tenant (live)

Membaca langsung dari router OPD yang dikonfigurasi di `.env` (`OPD_ROUTERS`).

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| GET | `/api/v1/opd-routers` | Daftar router (tanpa password) |
| GET | `/api/v1/opd-routers/summary` | Hitung user hotspot+ppp live tiap router |
| GET | `/api/v1/opd-routers/:name/users` | List user hotspot & ppp satu router |

`:name` = nama router persis seperti di config (mis. `Inspektorat`, `BKD`, `Kominfo`).

**Contoh — `GET /api/v1/opd-routers/summary`:**
```json
{
  "ok": true,
  "data": [
    { "name": "Inspektorat", "host": "172.16.1.10", "online": true,
      "hotspot": 24, "ppp": 3, "total": 27 }
  ]
}
```

---

### 4.5 Monitoring Rumah

> Menu UI rumah disembunyikan, namun **data & API tetap tersedia**.

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| GET | `/api/v1/rumah/snapshot` | Snapshot live monitor rumah |
| GET | `/api/v1/rumah/interfaces` | List interface rumah |
| GET | `/api/v1/rumah/leases` | List DHCP lease |
| GET | `/api/v1/rumah/traffic?periode=harian` | Agregasi traffic (`harian`/`mingguan`/`bulanan`) |

---

### 4.6 MikroTik Live

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| GET | `/api/v1/mikrotik/:target/interfaces` | Baca interface langsung dari router |

`:target` = `diskominfo` atau `rumah`. Mengembalikan data mentah RouterOS.
Bila router tak terjangkau → `502 router_unreachable`.

---

### 4.7 Aksi

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| POST | `/api/v1/notify/test` | Kirim notifikasi uji |

**Body (JSON):**
```json
{ "channel": "all", "message": "Tes dari API" }
```
`channel` = `fonnte`, `telegram`, atau `all` (default). `message` opsional.

---

## 5. Realtime via WebSocket

Selain REST, NETRA mendorong update realtime lewat WebSocket — cara paling
efisien untuk dashboard live (tanpa polling berulang).

- **URL:** `ws://<host>:3000/ws?topic=<topic>`
- **Topic:** `dashboard` (Diskominfo) atau `rumah`
- **Pesan masuk:**
  - `{ "type": "welcome", "topic": "dashboard", "time": "..." }` saat connect
  - `{ "type": "update", "topic": "dashboard", "time": "...", "data": <snapshot> }`
    setiap kali monitor menghasilkan snapshot baru. Isi `data` sama persis
    dengan respons `GET /api/v1/interfaces/snapshot`.

**Pola pakai yang disarankan:** ambil state awal sekali via REST snapshot,
lalu dengarkan WebSocket untuk update berikutnya.

```js
// Initial state
const init = await fetch('/api/v1/interfaces/snapshot').then(r => r.json());
render(init.data);

// Realtime
const ws = new WebSocket(`ws://${location.host}/ws?topic=dashboard`);
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.type === 'update') render(msg.data);
};
```

---

## 6. Contoh Pemakaian

### cURL
```bash
# Ringkasan interface
curl http://localhost:3000/api/v1/interfaces/summary

# Cari interface "ether1" yang Up, urut bandwidth RX terbesar
curl "http://localhost:3000/api/v1/interfaces?q=ether1&status=Up&sort=rx&dir=desc"

# Dengan API key (bila diaktifkan)
curl -H "X-API-Key: rahasia-panjang-anda" \
     http://localhost:3000/api/v1/interfaces

# Kirim notifikasi uji
curl -X POST http://localhost:3000/api/v1/notify/test \
     -H "Content-Type: application/json" \
     -d '{"channel":"telegram","message":"Halo dari API"}'
```

### JavaScript (fetch)
```js
const base = 'http://localhost:3000/api/v1';
const headers = { 'X-API-Key': 'rahasia-panjang-anda' }; // hilangkan bila open

async function getInterfaces(status = 'Down') {
  const res = await fetch(`${base}/interfaces?status=${status}`, { headers });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error.message);
  return json.data;
}
```

### Python (requests)
```python
import requests

BASE = "http://localhost:3000/api/v1"
H = {"X-API-Key": "rahasia-panjang-anda"}  # hapus bila open

r = requests.get(f"{BASE}/interfaces/summary", headers=H)
r.raise_for_status()
print(r.json()["data"])
```

### PHP (cocok untuk integrasi XAMPP/Laravel)
```php
<?php
$base = "http://localhost:3000/api/v1";
$ch = curl_init("$base/interfaces/summary");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ["X-API-Key: rahasia-panjang-anda"]);
$resp = json_decode(curl_exec($ch), true);
curl_close($ch);
print_r($resp["data"]);
```

---

## 7. Tips & Batasan

- Endpoint **live** (`/opd-routers/*`, `/mikrotik/*`) menghubungi router secara
  langsung tiap request → responsnya tergantung jaringan & bisa lambat/timeout.
  Untuk data cepat & historis, pakai endpoint berbasis DB (`/interfaces`, dll).
- Data `master_opd` adalah mirror router yang ditulis ulang tiap polling
  (interval di `.env`: `POLL_INTERVAL_DISKOMINFO_MS`).
- Maksimum `limit` = 1000. Untuk data besar, gunakan `offset` untuk paginasi.
- Semua waktu DB dalam zona waktu server (string `YYYY-MM-DD HH:mm:ss`).

---

*Dihasilkan untuk NETRA v1.1.6 — Diskominfo Pringsewu.*
</content>
