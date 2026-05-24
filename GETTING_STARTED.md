# Getting Started — Netra Node.js

Panduan singkat agar Netra siap jalan dan dipush ke GitHub.

## 1. Install Prasyarat (sekali saja)

### Node.js
1. Unduh dari https://nodejs.org/en/download (pilih **LTS**, Windows Installer .msi)
2. Jalankan installer, centang **"Add to PATH"**.
3. Tutup-buka PowerShell, verifikasi:
   ```powershell
   node -v        # contoh: v20.18.0
   npm -v         # contoh: 10.8.0
   ```

### Git
1. Unduh dari https://git-scm.com/download/win
2. Install dengan default options.
3. Tutup-buka PowerShell:
   ```powershell
   git --version  # contoh: git version 2.46.0.windows.1
   ```

## 2. Konfigurasi Aplikasi

```powershell
cd c:\xampp\htdocs\netra-node
copy .env.example .env
notepad .env
```

Isi minimal:
- `DB_USER`, `DB_PASSWORD`, `DB_NAME` (database MySQL Anda)
- `MIKROTIK_DISKOMINFO_HOST` + user/pass
- `MIKROTIK_RUMAH_HOST` + user/pass
- `FONNTE_TOKEN` + `FONNTE_TARGET`

## 3. Install Dependencies & Jalankan

```powershell
cd c:\xampp\htdocs\netra-node
npm install
npm start
```

Buka http://localhost:3000

## 4. Push ke GitHub

### 4a. Buat repository di GitHub
1. Login https://github.com
2. Klik **+ → New repository**
3. Nama: `netra`
4. Visibility: **Public**
5. **JANGAN** centang "Initialize with README" (kita sudah punya)
6. Klik **Create repository**
7. Salin URL HTTPS yang muncul (contoh: `https://github.com/USERNAME/netra.git`)

### 4b. Init repo lokal & push

```powershell
cd c:\xampp\htdocs\netra-node

# Set identitas (sekali saja per mesin)
git config --global user.name  "Nama Anda"
git config --global user.email "email@anda.com"

# Init & commit awal
git init
git add .
git commit -m "Initial commit: Netra Node.js — real-time MikroTik monitoring"

# Set remote dan push
git branch -M main
git remote add origin https://github.com/USERNAME/netra.git
git push -u origin main
```

> Saat push, Git akan minta autentikasi. Gunakan **Personal Access Token**
> sebagai password (Settings → Developer settings → Personal access tokens →
> Generate new token → centang scope `repo`).

### 4c. Verifikasi
Refresh halaman repo di GitHub — semua file (kecuali `.env` dan
`node_modules/`) harus muncul.

## 5. (Opsional) Deploy 24/7 sebagai Service

Lihat bagian **Deployment Produksi** di [README.md](README.md).
Rekomendasi: PM2 + `pm2-installer` agar auto-start saat boot Windows.

## Pertanyaan Umum

**Q: Apakah ini menggantikan PHP lama?**
A: Bisa berdampingan untuk transisi. Setelah verifikasi stabil, matikan
   `engine_monitor.php` (cron) di PHP. Lihat [docs/MIGRATION_FROM_PHP.md](docs/MIGRATION_FROM_PHP.md).

**Q: Notifikasi WA jalan tanpa browser?**
A: Ya. Selama proses `node src/server.js` (atau via PM2/Windows Service)
   jalan, polling + notifikasi terus aktif.

**Q: Polling sub-detik aman?**
A: Aman secara aplikasi. Tapi pertimbangkan beban CPU MikroTik. Mulai dari
   2000ms, turunkan bertahap sambil pantau CPU router.

**Q: Bisakah ditampilkan ke publik (internet)?**
A: **Belum**, karena belum ada autentikasi. Tambahkan login + reverse proxy
   HTTPS dulu. Lihat roadmap di [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
