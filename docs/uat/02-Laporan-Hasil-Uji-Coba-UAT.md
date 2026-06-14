# LAPORAN HASIL UJI COBA APLIKASI (USER ACCEPTANCE TEST / UAT)

**Aplikasi:** NETRA — Sistem Monitoring Jaringan Diskominfo Pringsewu
**Versi Aplikasi:** 1.1.8
**Fitur yang Diuji:** (1) Deteksi OPD Tidak Terhubung · (2) Pengiriman Notifikasi WhatsApp
**Tanggal Pelaksanaan:** 14 Juni 2026
**Nomor Dokumen:** UAT/NETRA/2026/02
**Acuan:** Dokumen Skenario Uji Coba (Test Case) No. UAT/NETRA/2026/01

| Peran | Nama | Jabatan / Unit | Tanda Tangan |
|-------|------|----------------|--------------|
| Penguji (Peserta Latsar) | _________________ | _________________ | _________ |
| Mentor | _________________ | _________________ | _________ |
| Tim Teknis | _________________ | _________________ | _________ |

---

## 1. Ringkasan Eksekutif

Telah dilaksanakan pengujian penerimaan (UAT) terhadap dua fitur inti NETRA: **deteksi OPD tidak terhubung** dan **pengiriman notifikasi WhatsApp**. Pengujian dilakukan melalui **simulasi pemutusan koneksi dummy** pada sebuah OPD tiruan, dengan memicu jalur kode notifikasi yang sebenarnya hingga pesan benar-benar terkirim.

> **Hasil: 5 dari 5 test case LULUS (100%). Status UAT: DITERIMA.**

Seluruh notifikasi WhatsApp (TIDAK TERHUBUNG, PULIH, dan TERDISABLE) berhasil terkirim dan diterima pada nomor tujuan, serta mekanisme anti-spam (cooldown) berfungsi sebagaimana mestinya.

## 2. Lingkungan Pengujian Aktual

| Komponen | Nilai saat uji |
|----------|----------------|
| Tanggal & waktu mulai | 14 Juni 2026, 14:05:03 WIB |
| Aplikasi | NETRA v1.1.8 (PM2, `localhost:3000`) |
| Basis data | MySQL `db_monitoring_pringsewu` |
| Provider WA aktif | **Roki WA Server** (`http://localhost:5001`) — status `aktif` |
| Nomor tujuan | 082282439298 |
| Cooldown | 300.000 ms (5 menit) |
| Metode | Harness simulasi [`scripts/uat-deteksi-opd.js --live`](../../scripts/uat-deteksi-opd.js) |
| OPD dummy | Dinas Pendidikan (DUMMY UAT) / `ether-UAT-DISDIK` |

## 3. Hasil Pengujian per Test Case

| ID | Skenario | Hasil Diharapkan | Hasil Aktual | Status |
|----|----------|------------------|--------------|:------:|
| TC-01 | Baseline interface normal (Up) | Status Up, tanpa notifikasi | `status=Up`, tidak ada notifikasi | ✅ **LULUS** |
| TC-02 | Pemutusan koneksi (Up → Down) | Status Down, notif "TIDAK TERHUBUNG" terkirim | `status=Down`, **dikirim via roki → BERHASIL** (`anyOk=true`) | ✅ **LULUS** |
| TC-03 | Down berlanjut (cooldown) | Notif ulang ditahan cooldown | Tidak ada notifikasi baru (ditahan) | ✅ **LULUS** |
| TC-04 | Pemulihan (Down → Up) | Status Up, notif "PULIH (UP)" terkirim | `status=Up`, **dikirim via roki → BERHASIL** (`anyOk=true`) | ✅ **LULUS** |
| TC-05 | Interface di-disable | Status Down, notif "TERDISABLE" terkirim | `status=Down`, **dikirim via roki → BERHASIL** (`anyOk=true`) | ✅ **LULUS** |

**Rekapitulasi:** Lulus **5** · Gagal **0** · Total **5** → **Tingkat keberhasilan 100%**.

## 4. Bukti Pengujian

### 4.1 Log Pengiriman Notifikasi (output aplikasi)
Cuplikan log aplikasi saat TC-02 (pemutusan koneksi) memicu notifikasi:
```
[2026-06-14 14:05:05] INFO: roki send
    channel: "roki"   target: "082282439298"   ok: true   error: ""
[2026-06-14 14:05:05] INFO: notify dispatched
    subject: "PERINGATAN INTERFACE DISKOMINFO"
    key: "diskominfo:UAT-DUMMY-DISDIK:down"
    anyOk: true
    channels: { "wa": { "ok": true, "error": "" } }
```

### 4.2 Bukti Pencatatan ke Basis Data (`notification_log`)
Tiga notifikasi uji tercatat di tabel `notification_log`:
```
#99  [2026-06-14 14:05:05] roki -> PERINGATAN INTERFACE DISKOMINFO | OK
#100 [2026-06-14 14:05:05] roki -> PEMULIHAN INTERFACE DISKOMINFO  | OK
#101 [2026-06-14 14:05:07] roki -> PERINGATAN INTERFACE DISKOMINFO | OK
```
> Catatan kebersihan data: ketiga entri uji tersebut **dihapus otomatis** setelah bukti diambil agar Laporan Interface produksi tidak tercemar data dummy.

### 4.3 Contoh Isi Pesan WhatsApp yang Diterima
```
PERINGATAN INTERFACE DISKOMINFO

Interface: ether-UAT-DISDIK
Tipe: ether
MAC: DE:AD:BE:EF:00:09
Status: TIDAK TERHUBUNG
Router: 10.100.100.1
Waktu: 2026-06-14 14:05:05
```

### 4.4 Tangkapan Layar & Video (dilampirkan)
- [ ] **Lampiran A** — Tangkapan layar pesan WhatsApp pada perangkat penerima (TIDAK TERHUBUNG, PULIH, TERDISABLE).
- [ ] **Lampiran B** — Berkas hasil uji mesin: [`docs/uat/hasil-simulasi-live.json`](hasil-simulasi-live.json).
- [ ] **Lampiran C** — Video simulasi (lihat Dokumen *Storyboard Video Simulasi*, No. UAT/NETRA/2026/04).

> _Tempelkan tangkapan layar WhatsApp pada bagian ini saat finalisasi dokumen._

## 5. Analisis Hasil

1. **Deteksi status akurat.** Perhitungan status (Up bila `running=1` & `disabled=0`; selain itu Down) bekerja benar pada seluruh kombinasi (TC-01, TC-02, TC-05).
2. **Notifikasi tepat & terkirim.** Setiap transisi status memicu notifikasi dengan kategori yang sesuai dan terkirim sukses melalui Roki WA Server.
3. **Anti-spam efektif.** Cooldown 5 menit menahan notifikasi ulang untuk gangguan yang sama (TC-03), mencegah _spam_ saat interface _flapping_.
4. **Desain retry aman.** Cooldown hanya dikunci bila pengiriman berhasil; bila provider gagal, sistem dirancang mencoba ulang pada siklus berikutnya — sehingga peringatan tidak hilang akibat gangguan sesaat pada gateway WA.
5. **Pencatatan audit.** Seluruh pengiriman tercatat di `notification_log` (channel, tujuan, status, waktu) sebagai jejak audit.

## 6. Temuan & Rekomendasi

| No | Temuan | Tingkat | Rekomendasi |
|----|--------|:-------:|-------------|
| 1 | Notifikasi bergantung pada satu nomor tujuan tunggal | Sedang | Pertimbangkan daftar tujuan (grup petugas) agar peringatan tidak terlewat saat 1 nomor nonaktif |
| 2 | Pengiriman WA bergantung pada ketersediaan gateway (Roki/Fonnte) | Sedang | Aktifkan kanal cadangan (mis. Telegram) sebagai _fallback_ otomatis |
| 3 | Ketergantungan pada layanan MySQL & gateway WA saat boot | Rendah | Pastikan urutan _startup_ layanan (MySQL → NETRA → gateway WA) saat komputer dinyalakan |

> Temuan di atas **tidak menghalangi penerimaan** fitur; bersifat penyempurnaan untuk keandalan operasional.

## 7. Kesimpulan

Berdasarkan hasil pengujian, fitur **Deteksi OPD Tidak Terhubung** dan **Pengiriman Notifikasi WhatsApp** pada aplikasi NETRA v1.1.8 **berfungsi sesuai rancangan dan memenuhi seluruh kriteria penerimaan**.

**Status akhir UAT: DITERIMA (LULUS 5/5).**

Penyempurnaan pada rekomendasi Bagian 6 diusulkan untuk ditindaklanjuti sebagai peningkatan keandalan, dan dibahas dalam notulen evaluasi (No. UAT/NETRA/2026/03).

---
*Laporan ini disusun sebagai bagian dari kegiatan aktualisasi Latihan Dasar (Latsar) CPNS — Diskominfo Pringsewu.*
