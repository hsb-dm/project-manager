# Pengaturan keamanan ZenCrevia

Dokumen ini adalah panduan operasional untuk instalasi server. HTML standalone tetap merupakan demo lokal dan tidak boleh dipakai sebagai penyimpanan produksi.

## Sebelum server pertama kali dijalankan

1. Salin `.env.example` menjadi `.env`, atau masukkan variabel yang sama melalui secret manager/process manager. `npm start` membaca `.env` jika tersedia.
2. Buat nilai acak yang berbeda untuk `COS_ADMIN_PASSWORD`, `COS_SECRET_KEY`, dan `COS_BACKUP_KEY`. Masing-masing secret sedikitnya 32 karakter, kecuali password admin yang mengikuti kebijakan password aplikasi.
3. Pasang HTTPS melalui reverse proxy dan isi `APP_URL` serta `COS_ALLOWED_ORIGINS` dengan alamat produksi yang tepat.
4. Biarkan `COS_ALLOW_REGISTRATION=0` dan `COS_ALLOW_IMPERSONATION=0` kecuali ada alasan operasional yang sudah ditinjau.
5. Simpan secret di secret manager atau environment server, bukan di source code, ZIP, database, atau percakapan tim.

Pada database baru, server membuat akun `admin@zencrevia.demo`. Bila `COS_ADMIN_PASSWORD` tidak tersedia, password acak hanya ditampilkan sekali di console saat seed awal. Anggota demo lain tidak memiliki password sampai admin membuatkannya.

## Yang aktif pada tahap keamanan 1 dan 2

- Password minimal 12 karakter dan harus menggabungkan sedikitnya tiga kelompok karakter.
- Sesi berlaku 12 jam secara default. Token sesi yang tersimpan di database sudah di-hash; cookie memakai `HttpOnly`, `SameSite=Lax`, dan `Secure` pada produksi.
- Login serta pendaftaran dibatasi setelah percobaan gagal berulang.
- Pendaftaran publik tertutup secara default. Kode undangan awal dibuat acak.
- Permintaan yang mengubah data harus berasal dari origin aplikasi yang sama atau origin yang diizinkan.
- Header keamanan browser dan log kejadian keamanan aktif.
- Provider AI eksternal dan pengiriman konteks workspace mati secara default. Admin harus mengaktifkan keduanya secara terpisah.
- Kunci provider AI dienkripsi dalam database bila `COS_SECRET_KEY` tersedia. Produksi menolak penyimpanan kunci baru tanpa secret tersebut.
- Endpoint AI hanya dapat memakai HTTPS dan hostname yang diizinkan.
- Tautan Google Drive publik mati secara default.
- Ukuran request dibatasi, pratinjau data hanya menerima PNG, JPEG, atau WebP, dan tautan file harus memakai HTTPS.
- Reset database demo dan pergantian identitas pengguna dinonaktifkan pada produksi.

## Google Drive privat untuk tim

Keanggotaan ZenCrevia tidak otomatis memberi izin Google Drive. Gunakan satu folder tim atau Shared Drive, lalu bagikan folder tersebut kepada akun Google anggota atau Google Group perusahaan. Berikan Editor kepada pengunggah dan Viewer kepada orang yang hanya perlu melihat.

Dengan `Anyone with the link` dimatikan, anggota yang sudah mendapat izin folder dan masuk dengan akun Google yang benar tetap dapat membuka file. Anggota tanpa izin Drive dapat melihat metadata tugas di ZenCrevia, tetapi pratinjau atau tautan filenya akan gagal dibuka. Untuk pihak luar, tambahkan akun mereka pada file atau folder. Gunakan tautan publik hanya pada file non-sensitif yang memang disetujui untuk dibuka tanpa login.

## Backup dan pemulihan

Jika `COS_BACKUP_KEY` diatur, produksi membuat backup terenkripsi setiap 24 jam secara default dan mempertahankan 14 backup terakhir. Admin juga dapat membuat backup dari **Settings → Data & backup** atau menjalankan:

```text
node server/backup.js backup
```

Simpan salinan backup di lokasi terpisah dengan akses terbatas. Uji pemulihan secara berkala pada lingkungan uji. Untuk memulihkan, hentikan server, set `COS_CONFIRM_RESTORE=YES`, lalu jalankan perintah berikut dengan path backup yang berada di `COS_BACKUP_DIR`:

```text
npm run restore -- C:\path\to\data\backups\zencrevia-date.db.enc
```

Proses pemulihan memeriksa integritas SQLite dan menyimpan salinan database lama sebelum menggantinya.

## Pemeriksaan rutin

- Tinjau `data/security.log`, percobaan login gagal, serta error email.
- Nonaktifkan anggota yang sudah keluar; sesi mereka langsung dihapus.
- Rotasi password admin, kunci provider, dan secret sesuai kebijakan organisasi.
- Periksa izin folder Drive dan anggota Google Group setidaknya setiap tiga bulan.
- Pastikan backup terbaru ada, terenkripsi, dan dapat dipulihkan.
