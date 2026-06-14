# DOKUMEN SKENARIO UJI COBA (TEST CASE)

**Aplikasi:** NETRA — Sistem Monitoring Jaringan Diskominfo Pringsewu
**Versi Aplikasi:** 1.1.8
**Fitur yang Diuji:** (1) Deteksi OPD Tidak Terhubung · (2) Pengiriman Notifikasi WhatsApp
**Tanggal Penyusunan:** 14 Juni 2026
**Nomor Dokumen:** UAT/NETRA/2026/01

| Peran | Nama | Jabatan / Unit | Tanda Tangan |
|-------|------|----------------|--------------|
| Penyusun (Peserta Latsar) | _________________ | _________________ | _________ |
| Mentor | _________________ | _________________ | _________ |
| Tim Teknis | _________________ | _________________ | _________ |

---

## 1. Latar Belakang

NETRA adalah sistem pemantauan jaringan yang melakukan _polling_ berkala ke router MikroTik untuk memantau status koneksi tiap Organisasi Perangkat Daerah (OPD). Ketika sebuah interface OPD terputus (tidak terhubung) atau di-_disable_, sistem harus **mendeteksi perubahan status secara otomatis** dan **mengirimkan peringatan melalui WhatsApp** kepada petugas, sehingga gangguan dapat ditangani lebih cepat.

Dokumen ini memuat skenario uji coba (test case) untuk memverifikasi bahwa kedua fungsi inti tersebut berjalan sesuai rancangan.

## 2. Tujuan Pengujian

1. Memastikan sistem **mendeteksi dengan benar** perubahan status interface OPD: dari terhubung (Up) menjadi tidak terhubung (Down), termasuk kondisi interface di-_disable_.
2. Memastikan sistem **mengirimkan notifikasi WhatsApp** secara otomatis dan tepat (isi pesan, kategori peringatan, dan tujuan) ketika terjadi pemutusan koneksi.
3. Memastikan sistem **mendeteksi pemulihan** (Down → Up) dan mengirim notifikasi pemulihan.
4. Memastikan mekanisme **anti-spam (cooldown)** mencegah notifikasi ganda untuk gangguan yang sama.

## 3. Ruang Lingkup

### 3.1 Termasuk dalam pengujian (IN SCOPE)
- **Fitur Deteksi OPD Tidak Terhubung** — perhitungan status interface (Up/Down/Terdisable) dan deteksi transisi status.
- **Fitur Pengiriman Notifikasi WhatsApp** — pemicuan dan pengiriman pesan melalui provider WA aktif (Fonnte atau Roki WA Server), termasuk pencatatan ke log notifikasi dan mekanisme cooldown.

### 3.2 Tidak termasuk dalam pengujian (OUT OF SCOPE)
Fitur-fitur berikut **tidak diuji** dalam kegiatan ini karena bersifat **fitur tambahan/pendukung**, bukan fungsi inti yang dievaluasi:
- Dashboard monitoring real-time (tampilan & WebSocket)
- Monitoring Rumah
- List User OPD (hotspot/PPP)
- Laporan Interface & ekspor CSV
- REST API v1
- Notifikasi Telegram

## 4. Lingkungan & Prasyarat Uji

| Komponen | Keterangan |
|----------|------------|
| Aplikasi | NETRA v1.1.8 (Node.js, berjalan di `localhost:3000` via PM2) |
| Basis data | MySQL `db_monitoring_pringsewu` (XAMPP) |
| Sumber data interface | Router MikroTik Diskominfo (`10.100.100.1`) |
| Provider WA aktif | **Roki WA Server** (self-hosted, `http://localhost:5001`) — alternatif Fonnte |
| Nomor tujuan WA | 082282439298 |
| Interval polling | 2.000 ms (2 detik) |
| Cooldown notifikasi | 300.000 ms (5 menit) |
| Perangkat penerima | Handphone dengan WhatsApp aktif pada nomor tujuan |

### 4.1 Metode Pengujian — "Pemutusan Koneksi Dummy"
Agar pengujian **aman** (tidak mengganggu router & data produksi) namun **representatif**, digunakan sebuah **OPD dummy** yang tidak terdaftar di router. Sebuah _harness_ simulasi ([`scripts/uat-deteksi-opd.js`](../../scripts/uat-deteksi-opd.js)) menjalankan urutan kondisi interface layaknya _poller_ asli dan memicu **jalur kode notifikasi yang sebenarnya** (`services/notifier.notifyAll` → provider WA aktif).

**Data OPD dummy:**
| Atribut | Nilai |
|---------|-------|
| Nama OPD | Dinas Pendidikan (DUMMY UAT) |
| Interface | `ether-UAT-DISDIK` |
| RouterOS ID | `UAT-DUMMY-DISDIK` |
| Tipe | ether |
| MAC | `DE:AD:BE:EF:00:09` |

## 5. Definisi Status (Acuan Deteksi)

Status interface dihitung dari dua atribut RouterOS, `running` dan `disabled`:

| running | disabled | Status terhitung | Makna |
|:-------:|:--------:|:----------------:|-------|
| 1 | 0 | **Up** | Terhubung normal |
| 0 | 0 | **Down** | Tidak terhubung (kabel putus / perangkat mati) |
| (apa pun) | 1 | **Down** | Di-_disable_ oleh admin (TERDISABLE) |

Notifikasi dipicu **hanya saat terjadi transisi status** (bukan tiap polling), dengan kategori: `TIDAK TERHUBUNG`, `TERDISABLE`, dan `PULIH (UP)`.

## 6. Daftar Skenario Uji Coba (Test Case)

### TC-01 — Baseline: Interface Normal (Up)
| Item | Keterangan |
|------|------------|
| **Tujuan** | Memastikan kondisi normal tidak memicu notifikasi |
| **Prasyarat** | Status sebelumnya = Up |
| **Data uji** | running=1, disabled=0 |
| **Langkah** | Jalankan satu siklus deteksi pada interface normal |
| **Hasil diharapkan** | Status terhitung = **Up**; **tidak ada** notifikasi terkirim |
| **Kriteria lulus** | Status = Up dan tidak ada pemicuan notifikasi |

### TC-02 — Deteksi Pemutusan Koneksi (Up → Down)
| Item | Keterangan |
|------|------------|
| **Tujuan** | Memastikan pemutusan koneksi terdeteksi & notifikasi terkirim |
| **Prasyarat** | Status sebelumnya = Up |
| **Data uji** | running=0, disabled=0 |
| **Langkah** | Simulasikan interface OPD terputus (koneksi dummy diputus) |
| **Hasil diharapkan** | Status = **Down**; notifikasi **"TIDAK TERHUBUNG"** terkirim ke WhatsApp tujuan; tercatat di log notifikasi (sukses) |
| **Kriteria lulus** | Status = Down, notifikasi terkirim (provider mengembalikan sukses), isi pesan memuat nama interface, status, router & waktu |

### TC-03 — Anti-Spam: Down Berlanjut (Cooldown)
| Item | Keterangan |
|------|------------|
| **Tujuan** | Memastikan tidak ada notifikasi ganda saat gangguan berlanjut |
| **Prasyarat** | Status sebelumnya = Down (sudah dinotifikasi pada TC-02) |
| **Data uji** | running=0, disabled=0 |
| **Langkah** | Jalankan siklus deteksi berikutnya tanpa perubahan status |
| **Hasil diharapkan** | Tidak ada transisi baru; notifikasi ulang **ditahan** oleh cooldown (5 menit) |
| **Kriteria lulus** | Tidak ada notifikasi baru terkirim selama periode cooldown |

### TC-04 — Deteksi Pemulihan (Down → Up)
| Item | Keterangan |
|------|------------|
| **Tujuan** | Memastikan pemulihan koneksi terdeteksi & dinotifikasi |
| **Prasyarat** | Status sebelumnya = Down |
| **Data uji** | running=1, disabled=0 |
| **Langkah** | Simulasikan koneksi OPD pulih kembali |
| **Hasil diharapkan** | Status = **Up**; notifikasi **"PULIH (UP)"** terkirim ke WhatsApp tujuan |
| **Kriteria lulus** | Status = Up dan notifikasi pemulihan terkirim (sukses) |

### TC-05 — Deteksi Interface Di-Disable (Admin Down)
| Item | Keterangan |
|------|------------|
| **Tujuan** | Memastikan interface yang di-_disable_ terdeteksi sebagai gangguan |
| **Prasyarat** | Status sebelumnya = Up |
| **Data uji** | running=0, disabled=1 |
| **Langkah** | Simulasikan admin men-_disable_ interface OPD |
| **Hasil diharapkan** | Status = **Down**; notifikasi **"TERDISABLE"** terkirim ke WhatsApp tujuan |
| **Kriteria lulus** | Status = Down dan notifikasi TERDISABLE terkirim (sukses) |

## 7. Kriteria Penerimaan (Acceptance Criteria)

Pengujian dinyatakan **DITERIMA** apabila:
- Seluruh test case TC-01 s.d. TC-05 berstatus **LULUS**, dan
- Notifikasi WhatsApp untuk TC-02, TC-04, dan TC-05 **benar-benar diterima** pada perangkat tujuan, dan
- Tidak terjadi notifikasi ganda pada TC-03 (cooldown berfungsi).

## 8. Referensi Teknis

| Berkas | Peran |
|--------|-------|
| [`src/services/monitorDiskominfo.js`](../../src/services/monitorDiskominfo.js) | Logika polling & deteksi status interface Diskominfo |
| [`src/services/notifier.js`](../../src/services/notifier.js) | Dispatch notifikasi multi-channel + cooldown |
| [`src/services/whatsapp.js`](../../src/services/whatsapp.js) | Pemilih provider WA aktif |
| [`src/services/roki.js`](../../src/services/roki.js) / [`fonnte.js`](../../src/services/fonnte.js) | Pengirim WhatsApp |
| [`scripts/uat-deteksi-opd.js`](../../scripts/uat-deteksi-opd.js) | Harness simulasi pengujian (UAT) |

---
*Dokumen ini disusun sebagai bagian dari kegiatan aktualisasi Latihan Dasar (Latsar) CPNS — Diskominfo Pringsewu.*
