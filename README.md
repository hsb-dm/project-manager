# ZenCrevia 1.17.0 (v39)

**Developer baru? Mulai dari [docs/HANDOVER.md](docs/HANDOVER.md).** Mau go-live? [deploy/GO-LIVE.md](deploy/GO-LIVE.md). Ringkasan perubahan: [IMPLEMENTATION-NOTES-v39.md](IMPLEMENTATION-NOTES-v39.md) (gambar di disk, nomor task dari server), [IMPLEMENTATION-NOTES-v38.md](IMPLEMENTATION-NOTES-v38.md) (perbaikan deploy live), [IMPLEMENTATION-NOTES-v37.md](IMPLEMENTATION-NOTES-v37.md) (audit serah terima), [IMPLEMENTATION-NOTES-v36.md](IMPLEMENTATION-NOTES-v36.md) (audit pra-live), [IMPLEMENTATION-NOTES-v35.md](IMPLEMENTATION-NOTES-v35.md) (chat), [IMPLEMENTATION-NOTES-v34.md](IMPLEMENTATION-NOTES-v34.md) (kerja bersamaan), [IMPLEMENTATION-NOTES-v33.md](IMPLEMENTATION-NOTES-v33.md) (aturan perpindahan tahap), [IMPLEMENTATION-NOTES-v32.md](IMPLEMENTATION-NOTES-v32.md) (audit keempat — integritas data), [IMPLEMENTATION-NOTES-v31.md](IMPLEMENTATION-NOTES-v31.md), [IMPLEMENTATION-NOTES-v30.md](IMPLEMENTATION-NOTES-v30.md) (lupa password, skala data, keamanan sesi) dan [IMPLEMENTATION-NOTES-v29.md](IMPLEMENTATION-NOTES-v29.md) (instalasi bersih, kompresi, backup, hardening).

**Lupa password** memakai email. Atur SMTP di Settings → Notifications & email sebelum go-live; tanpa SMTP, tautan reset hanya ditulis ke `data/outbox` dan Home admin menampilkan peringatan.

Paket lengkap hasil audit, diperbarui 10 September 2026. Rincian perubahan: AUDIT.md. Panduan galeri dan ekspor: AI-GALLERY-GUIDE.md.

## Dokumentasi

Folder `docs/` berisi dokumentasi lengkap dalam tiga bagian:

- [docs/USER-MANUAL.md](docs/USER-MANUAL.md) — panduan pemakaian harian untuk anggota tim
- [docs/ADMIN-OPS.md](docs/ADMIN-OPS.md) — Settings, role & permission, AI, SMTP, backup, deployment, environment variable, failure modes
- [docs/DEVELOPER.md](docs/DEVELOPER.md) — arsitektur, build system, referensi API, skema database, konvensi kode, known issues

Versi yang bisa dibaca tanpa editor Markdown: `docs/zencrevia-docs.html` (satu file, ada navigasi samping) dan `docs/zencrevia-docs.pdf`.

## Dokumen legal

Folder `LEGAL` berisi draf EULA, Kebijakan Privasi, Ketentuan Layanan, dan Penjelasan Pemrosesan Data AI dalam bahasa Indonesia. Seluruh placeholder dalam tanda kurung siku wajib diisi dan ditinjau penasihat hukum sebelum dipublikasikan.

## Menjalankan server

Ekstrak ZIP ke folder baru. Gunakan Node.js 22.13 atau lebih baru, jalankan npm start, lalu buka http://localhost:3000. Tidak ada dependensi npm tambahan.

Database dibuat di `data/creative-os.db` pada penggunaan pertama. Nama file lama dipertahankan agar pembaruan tidak memutus data yang sudah ada. Untuk memperbarui instalasi lama, buat backup terenkripsi dan salin folder `data` serta pengaturan environment sebelum mengganti berkas aplikasi.

### Docker

Salin `.env.example` menjadi `.env` dan isi secret produksi, lalu jalankan:

```bash
docker compose up -d --build
```

Aplikasi tersedia di http://localhost:6969. Data SQLite, unggahan, dan backup disimpan di volume Docker `zencrevia-data`; volume ini tidak dihapus oleh `docker compose down` biasa.

Salin `.env.example` menjadi `.env`, lalu atur `COS_ADMIN_EMAIL`, `COS_ADMIN_NAME`, `COS_ADMIN_PASSWORD`, `COS_SECRET_KEY`, dan `COS_BACKUP_KEY` sebelum produksi.

**Instalasi bersih (v29).** Pada `NODE_ENV=production`, database kosong dibuat sebagai workspace bersih: satu akun admin sesuai `COS_ADMIN_EMAIL`, role bawaan, tahapan workflow, template brief, dan folder Knowledge `General`. Tidak ada akun, proyek, atau tugas contoh. Untuk demo atau pelatihan, jalankan dengan `COS_SEED_DEMO=1` (admin demo: `admin@zencrevia.demo`). Di mode development demo tetap default; `COS_SEED_DEMO=0` mematikannya. `npm start` membaca `.env` jika file itu tersedia. Jika password admin belum diatur saat database baru dibuat, server menghasilkan password acak dan menampilkannya satu kali di console. Pendaftaran tertutup secara default dan akun anggota demo belum memiliki password. Ikuti [SECURITY-SETUP.md](SECURITY-SETUP.md).

## HTML standalone

Buka dist/creative-os-standalone.html langsung di browser dan pilih pengguna. Ini tetap mode demo: perubahan tugas tidak disimpan setelah reload. Preferensi tampilan yang sudah memakai penyimpanan browser tetap berfungsi.

Standalone tidak tersinkron otomatis dengan server. Analitik standalone dihitung dari tugas demo yang tersedia. Server memiliki riwayat contoh tambahan, sehingga jumlah awal keduanya tidak harus sama.

## Build dan pemeriksaan

- `npm run build` menghasilkan `public/index.html` dan `dist/creative-os-standalone.html` dengan isi identik.
- npm test menjalankan pengujian regresi menggunakan database sementara.
- `npm run docs` membangun ulang `docs/zencrevia-docs.html` dan `.pdf` dari Markdown (butuh pandoc; PDF butuh wkhtmltopdf).
- `npm run backup` membuat backup SQLite terenkripsi jika `COS_BACKUP_KEY` tersedia.
- `npm run reset` hanya untuk lingkungan pengembangan; endpoint reset dinonaktifkan pada produksi.

Variabel lingkungan dan nilai aman yang disarankan tersedia di `.env.example`. Produksi yang memakai secret manager atau process manager dapat memasukkan variabel yang sama tanpa file `.env`.

## Berkas dan integrasi

Gambar lokal disimpan sebagai pratinjau berukuran terbatas. Berkas asli, PDF, video, font, dan dokumen lain menggunakan Google Drive. Petunjuk OAuth: GOOGLE_DRIVE_SETUP.md.

Google Drive, provider AI, dan pengiriman email memerlukan konfigurasi dan akun sendiri. Akses ZenCrevia dan akses Google Drive bersifat terpisah: bagikan folder Drive kepada setiap anggota atau Google Group tim. Tautan publik mati secara default. Audit tidak menggunakan akun Google atau melakukan panggilan berbayar ke provider AI.

## Ekspor laporan

PPT mempertahankan desain kartu dan membagi daftar panjang ke slide lanjutan. Excel dibuka pada ringkasan dengan kartu metrik, dua grafik, dan tautan ke tabel detail. Header tabel tetap terlihat saat digulir; filter, tanggal, serta format angka tersedia langsung di Excel.

Isi laporan mengikuti periode dan filter ekspor. Pustaka aset memuat seluruh pustaka, sesuai label lembar tersebut. Ringkasan adalah snapshot saat ekspor; mengedit tugas pada lembar detail tidak menghitung ulang seluruh analitik. Ekspor ulang dari aplikasi untuk memperoleh angka terbaru. Tabel sumber metrik dan tim dimulai pada baris 46 di Ringkasan; tabel mingguan dimulai pada baris 65. Jika ada lebih dari 8 tim, grafik ringkasan menampilkan 8 tim dengan pemakaian kapasitas tertinggi; seluruh tim tetap tersedia pada data sumber dan lembar Tim.

## Email (SMTP)

SMTP can be configured from **Settings → Notifications & Email → SMTP** — provider presets,
a real connection test, and a test send. Credentials are encrypted with `COS_SECRET_KEY` and
are never returned to the browser after saving. The `COS_MAIL_TRANSPORT` / `SMTP_*`
environment variables still work and are used as the fallback when nothing is configured in
the dashboard.

## Backups

Jadwal backup otomatis mengikuti **Settings → Backup & Data → Automatic Backups** (Off / Daily / Weekly; default Daily di production). `COS_BACKUP_INTERVAL_HOURS` hanya dipakai sebagai override operator, dan dashboard menandainya sebagai "diatur server".

**Settings → Backup & Data** provides Backup History with per-file checksums, restore with a
pre-restore safety backup and rollback on failure, retention, and a restore audit trail.
Set `COS_BACKUP_KEY` (32+ characters) to enable encrypted backups. The restore flow closes the
active SQLite handle only after staging and validation, swaps the file, then reconnects the
server automatically. A manual restart is no longer required.


## v18
Messages (team chat), AI Gallery role quotas & filters, Task-as-AI-brief. See `CHANGELOG-v18.md`. The only notification sound is `src/sounds/zen-chime.mp3` (v29: 6.9 KB audio-only MP3, mono 64 kbps), inlined by `node build.js`.


## after change

git add .
git commit -m "message"
git push origin master

## kalo ada code dari orang

git pull --ff origin master
