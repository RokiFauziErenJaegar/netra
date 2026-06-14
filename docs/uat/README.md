# Paket Dokumen Uji Coba (UAT) — NETRA

Kumpulan dokumen kegiatan aktualisasi Latsar: pengujian fitur **Deteksi OPD Tidak Terhubung** dan **Pengiriman Notifikasi WhatsApp** pada aplikasi NETRA v1.1.8.

## Daftar Output

| No | Output | Berkas |
|----|--------|--------|
| 1 | **Dokumen Skenario Uji Coba (Test Case)** | [01-Dokumen-Skenario-Uji-Coba-Test-Case.md](01-Dokumen-Skenario-Uji-Coba-Test-Case.md) |
| 2 | **Laporan Hasil Uji Coba (UAT)** | [02-Laporan-Hasil-Uji-Coba-UAT.md](02-Laporan-Hasil-Uji-Coba-UAT.md) |
| 2 | **Video Simulasi** (panduan & naskah produksi) | [04-Storyboard-Video-Simulasi.md](04-Storyboard-Video-Simulasi.md) |
| 3 | **Notulen Evaluasi Uji Coba** | [03-Notulen-Evaluasi-Uji-Coba.md](03-Notulen-Evaluasi-Uji-Coba.md) |
| — | Bukti hasil uji (mesin) | [hasil-simulasi-live.json](hasil-simulasi-live.json), [hasil-simulasi-dryrun.json](hasil-simulasi-dryrun.json) |
| — | Harness simulasi | [`../../scripts/uat-deteksi-opd.js`](../../scripts/uat-deteksi-opd.js) |

## Cara Menjalankan Ulang Pengujian

```powershell
# Cek logika saja, tanpa kirim WA (aman)
node scripts/uat-deteksi-opd.js

# Pengujian penuh: benar-benar kirim WA via provider aktif
node scripts/uat-deteksi-opd.js --live

# Sama seperti di atas, tapi pertahankan bukti di notification_log
node scripts/uat-deteksi-opd.js --live --keep
```

## Yang Perlu Dilengkapi Manual

- Isi identitas (nama penyusun, mentor, tim teknis, tanggal/jam rapat) pada tiap dokumen.
- Lampirkan **tangkapan layar WhatsApp** ke Laporan UAT (Bagian 4.4).
- Rekam **video** mengikuti storyboard, lalu lampirkan berkasnya.
- Konversi ke PDF/DOCX bila diperlukan untuk pengumpulan (mis. via Pandoc, atau salin-tempel ke Word).

## Catatan

- Pengujian sengaja dibatasi pada **dua fitur inti** sesuai arahan; fitur lain (dashboard, monitoring rumah, list user OPD, laporan, REST API, Telegram) bersifat tambahan dan **tidak diuji**.
- Metode memakai **OPD dummy** sehingga aman terhadap router & data produksi; jejak data uji dibersihkan otomatis.
