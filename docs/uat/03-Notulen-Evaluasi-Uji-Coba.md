# NOTULEN EVALUASI UJI COBA APLIKASI

**Kegiatan:** Evaluasi & Penyempurnaan Hasil Uji Coba Aplikasi NETRA
**Fitur yang Dievaluasi:** (1) Deteksi OPD Tidak Terhubung · (2) Pengiriman Notifikasi WhatsApp
**Nomor Dokumen:** UAT/NETRA/2026/03
**Acuan:** Laporan Hasil UAT No. UAT/NETRA/2026/02

---

## 1. Identitas Rapat

| Item | Keterangan |
|------|------------|
| Hari/Tanggal | _____________, 14 Juni 2026 |
| Waktu | _______ s.d. _______ WIB |
| Tempat | Ruang ________ / Daring (______) |
| Pemimpin Rapat | _________________ |
| Notulis | _________________ |

## 2. Daftar Hadir

| No | Nama | Jabatan / Peran | Unit | Tanda Tangan |
|----|------|-----------------|------|--------------|
| 1 | _____________ | Peserta Latsar (Penyaji) | Diskominfo Pringsewu | _________ |
| 2 | _____________ | Mentor | Diskominfo Pringsewu | _________ |
| 3 | _____________ | Tim Teknis / Pranata Komputer | Diskominfo Pringsewu | _________ |
| 4 | _____________ | _____________ | _____________ | _________ |

## 3. Agenda Rapat

1. Pemaparan hasil uji coba (UAT) fitur deteksi OPD terputus & notifikasi WhatsApp.
2. Pemutaran video simulasi pemutusan koneksi dummy.
3. Evaluasi hasil pengujian dan masukan mentor serta tim teknis.
4. Penetapan rencana penyempurnaan dan tindak lanjut.

## 4. Jalannya Evaluasi (Pokok Pembahasan)

### 4.1 Pemaparan Hasil Uji Coba
Penyaji memaparkan bahwa pengujian dilakukan dengan metode **simulasi pemutusan koneksi dummy** menggunakan OPD tiruan, agar tidak mengganggu router dan data produksi. Hasil pengujian menunjukkan **5 dari 5 test case LULUS (100%)**:
- Deteksi pemutusan koneksi (Up → Down) — notifikasi "TIDAK TERHUBUNG" terkirim.
- Deteksi pemulihan (Down → Up) — notifikasi "PULIH" terkirim.
- Deteksi interface di-_disable_ — notifikasi "TERDISABLE" terkirim.
- Mekanisme cooldown menahan notifikasi ganda.
- Seluruh notifikasi WhatsApp diterima pada nomor tujuan dan tercatat di log.

### 4.2 Tanggapan Mentor
> _(diisi saat rapat)_ Contoh poin yang umumnya muncul:
- Mengapresiasi metode pengujian yang aman (memakai OPD dummy, membersihkan data uji).
- Menyarankan agar pesan notifikasi juga mencantumkan **nama OPD** (bukan hanya nama interface) agar petugas lebih cepat mengenali lokasi gangguan.
- Menanyakan kesiapan sistem bila **gateway WhatsApp sedang tidak aktif**.

### 4.3 Tanggapan Tim Teknis
> _(diisi saat rapat)_ Contoh poin:
- Mengusulkan **kanal cadangan** (Telegram) sebagai _fallback_ otomatis bila WA gagal.
- Mengusulkan **tujuan notifikasi lebih dari satu nomor** (grup petugas piket).
- Menyoroti pentingnya urutan _startup_ layanan (MySQL & gateway WA) saat server dinyalakan ulang.

## 5. Hasil Evaluasi & Catatan Perbaikan

| No | Catatan / Masukan | Disepakati? | Keterangan |
|----|-------------------|:-----------:|------------|
| 1 | Notifikasi diterima dengan benar & tepat kategori | ✔ | Sesuai harapan, dipertahankan |
| 2 | Tambahkan nama OPD pada isi pesan notifikasi | ☐ | Penyempurnaan, prioritas sedang |
| 3 | Sediakan kanal cadangan (Telegram) sebagai _fallback_ | ☐ | Penyempurnaan, prioritas sedang |
| 4 | Dukung beberapa nomor tujuan (grup piket) | ☐ | Penyempurnaan, prioritas sedang |
| 5 | Pastikan auto-start layanan saat komputer menyala | ☐ | Operasional, prioritas tinggi |

## 6. Keputusan & Rencana Tindak Lanjut (Action Items)

| No | Tindak Lanjut | Penanggung Jawab | Target Selesai | Status |
|----|---------------|------------------|----------------|--------|
| 1 | Hasil UAT **DITERIMA**; fitur inti dinyatakan layak operasional | Mentor & Penyaji | 14 Juni 2026 | ✔ Selesai |
| 2 | Menambahkan nama OPD pada pesan notifikasi | _________ | _________ | ☐ |
| 3 | Mengaktifkan _fallback_ Telegram | _________ | _________ | ☐ |
| 4 | Menambah dukungan multi-nomor tujuan | _________ | _________ | ☐ |
| 5 | Konfigurasi auto-start (MySQL + NETRA + gateway WA) | _________ | _________ | ☐ |

## 7. Kesimpulan

Evaluasi menyimpulkan bahwa fitur **deteksi OPD tidak terhubung** dan **notifikasi WhatsApp** telah **berfungsi dengan baik dan memenuhi kebutuhan** pemantauan jaringan. Hasil uji coba **diterima**. Beberapa masukan penyempurnaan disepakati untuk ditindaklanjuti sebagai peningkatan keandalan, tanpa menghambat penggunaan fitur saat ini.

## 8. Penutup

Rapat ditutup pada pukul _______ WIB. Notulen ini dibuat untuk menjadi dasar pelaksanaan tindak lanjut.

| Notulis | Mengetahui, Mentor |
|---------|--------------------|
| | |
| _________________ | _________________ |
| _________________ | _________________ |

---
*Notulen ini disusun sebagai bagian dari kegiatan aktualisasi Latihan Dasar (Latsar) CPNS — Diskominfo Pringsewu.*
