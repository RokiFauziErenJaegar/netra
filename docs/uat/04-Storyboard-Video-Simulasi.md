# STORYBOARD & NASKAH VIDEO SIMULASI UJI COBA

**Aplikasi:** NETRA v1.1.8 — Diskominfo Pringsewu
**Topik Video:** Simulasi Deteksi OPD Tidak Terhubung & Notifikasi WhatsApp
**Nomor Dokumen:** UAT/NETRA/2026/04
**Durasi target:** 3–5 menit
**Format:** MP4 1080p (rekaman layar + tangkapan layar WhatsApp)

> Dokumen ini adalah **panduan produksi**: ikuti urutan adegan, baca narasi, dan rekam. Hasil akhir berupa berkas video dilampirkan pada Laporan UAT (Lampiran C).

---

## 1. Persiapan Sebelum Merekam (Checklist)

- [ ] Aplikasi NETRA berjalan (`pm2 status` → `netra` online di `localhost:3000`).
- [ ] MySQL (XAMPP) aktif.
- [ ] Roki WA Server aktif (`http://localhost:5001/health` → `status: true`) **atau** Fonnte aktif.
- [ ] Handphone penerima (nomor 082282439298) siap dengan WhatsApp terbuka.
- [ ] Aplikasi perekam layar siap (mis. **OBS Studio** / Game Bar `Win+G` / ScreenRec).
- [ ] Terminal/PowerShell terbuka di folder `C:\xampp\htdocs\netra-node`.
- [ ] Atur tata letak layar: terminal di kiri, browser dashboard di kanan, HP direkam terpisah / kamera.

---

## 2. Storyboard (Adegan per Adegan)

| # | Durasi | Visual di Layar | Aksi | Narasi (Voice-over) |
|---|--------|-----------------|------|----------------------|
| 1 | 0:00–0:20 | Judul + logo NETRA | Tampilkan slide judul | "Assalamualaikum. Pada video ini saya akan mendemonstrasikan uji coba dua fitur inti aplikasi NETRA: deteksi OPD yang tidak terhubung, dan pengiriman notifikasi melalui WhatsApp." |
| 2 | 0:20–0:45 | Dashboard NETRA (`localhost:3000`) | Sorot menu Dashboard Monitoring & jumlah interface Up/Down | "NETRA memantau status koneksi seluruh OPD secara berkala. Bila sebuah OPD terputus, sistem akan otomatis mendeteksi dan mengirim peringatan." |
| 3 | 0:45–1:05 | Halaman "Server WA OTP" | Tampilkan provider aktif (Roki) & status | "Notifikasi dikirim melalui gateway WhatsApp. Saat ini provider aktif adalah Roki WA Server yang kita hosting sendiri." |
| 4 | 1:05–1:25 | Terminal | Ketik perintah (jangan Enter dulu): `node scripts/uat-deteksi-opd.js --live` | "Untuk menguji dengan aman tanpa mengganggu router produksi, saya gunakan simulasi pemutusan koneksi dummy pada OPD tiruan bernama 'Dinas Pendidikan DUMMY UAT'." |
| 5 | 1:25–2:30 | Terminal (jalan) + HP | Tekan **Enter**. Sorot tiap test case muncul. Arahkan kamera ke HP saat WA masuk | "Skenario pertama, interface normal — tidak ada notifikasi. Skenario kedua, koneksi diputus: status berubah menjadi Down dan… (tunjukkan HP) notifikasi 'TIDAK TERHUBUNG' masuk ke WhatsApp." |
| 6 | 2:30–3:00 | Terminal + HP | Sorot TC-03, TC-04, TC-05 | "Skenario ketiga membuktikan sistem tidak mengirim notifikasi ganda berkat cooldown. Lalu saat koneksi pulih, masuk notifikasi 'PULIH'. Dan saat interface di-disable admin, masuk notifikasi 'TERDISABLE'." |
| 7 | 3:00–3:20 | Terminal (ringkasan) | Sorot "RINGKASAN: 5/5 test case LULUS" | "Seluruh lima skenario uji LULUS. Deteksi akurat dan seluruh notifikasi berhasil terkirim." |
| 8 | 3:20–3:50 | Tangkapan layar WhatsApp | Tampilkan 3 pesan WA yang diterima | "Inilah ketiga notifikasi yang diterima petugas: tidak terhubung, pulih, dan terdisable — lengkap dengan nama interface, status, router, dan waktu kejadian." |
| 9 | 3:50–4:10 | Slide penutup | Tampilkan kesimpulan | "Dengan demikian, fitur deteksi OPD terputus dan notifikasi WhatsApp pada NETRA berfungsi sesuai rancangan. Terima kasih. Wassalamualaikum." |

---

## 3. Naskah Narasi Lengkap (untuk dibacakan)

> **Pembuka.** "Assalamualaikum warahmatullahi wabarakatuh. Nama saya [Nama], peserta Latsar CPNS di Dinas Komunikasi dan Informatika Kabupaten Pringsewu. Pada kesempatan ini saya akan menyajikan uji coba aplikasi NETRA, khususnya fitur deteksi OPD yang tidak terhubung dan pengiriman notifikasi WhatsApp."

> **Konteks.** "NETRA melakukan pemantauan otomatis ke router setiap dua detik. Apabila koneksi sebuah OPD terputus, sistem mendeteksi perubahan status dan langsung mengirim peringatan ke petugas melalui WhatsApp, sehingga penanganan gangguan menjadi lebih cepat."

> **Metode uji.** "Agar pengujian aman dan tidak mengganggu jaringan yang sedang berjalan, saya menggunakan simulasi pemutusan koneksi dummy. Sebuah OPD tiruan saya jadikan objek uji, lalu kondisinya saya ubah-ubah seolah koneksinya diputus, dipulihkan, dan dinonaktifkan."

> **Eksekusi.** "Saya jalankan skrip simulasi. Perhatikan: pada skenario pemutusan koneksi, status berubah menjadi Down, dan notifikasi langsung masuk ke WhatsApp. Pada skenario gangguan berlanjut, sistem menahan notifikasi ganda. Saat koneksi pulih, masuk notifikasi pemulihan. Dan saat interface dinonaktifkan, masuk notifikasi terdisable."

> **Hasil.** "Hasil akhir menunjukkan lima dari lima skenario uji berhasil. Deteksi berjalan akurat dan seluruh notifikasi terkirim dan diterima dengan baik."

> **Penutup.** "Demikian demonstrasi uji coba fitur inti aplikasi NETRA. Terima kasih atas perhatiannya. Wassalamualaikum warahmatullahi wabarakatuh."

---

## 4. Perintah yang Direkam (Cheat-Sheet)

```powershell
# 1. Pastikan layanan aktif
pm2 status
curl http://localhost:5001/health

# 2. (Sorot) jalankan simulasi LIVE — mengirim WA sungguhan
node scripts/uat-deteksi-opd.js --live

# 3. (Opsional) jalankan ulang sambil menyimpan bukti di notification_log
node scripts/uat-deteksi-opd.js --live --keep
```

> **Tips:** Jika ingin mengulang demo beberapa kali dalam waktu < 5 menit, notifikasi TC mungkin tertahan cooldown. Untuk demo berulang, beri jeda > 5 menit, atau jalankan dengan proses baru (cooldown bersifat per-proses sehingga setiap eksekusi `node` baru sudah segar).

## 5. Saran Pengeditan

- Tambahkan teks _caption_ di tiap adegan (nama test case).
- Beri _zoom_ / sorotan pada baris terminal "✅ LULUS" dan layar WhatsApp.
- Sisipkan _lower-third_ identitas penyaji di awal.
- Pastikan nomor/identitas sensitif yang tidak perlu dapat di-_blur_.

---
*Panduan ini disusun sebagai bagian dari kegiatan aktualisasi Latihan Dasar (Latsar) CPNS — Diskominfo Pringsewu.*
