# ZenCrevia 1.17.0 (v39) — gambar keluar dari database, nomor task dari server

23 September 2026. Tindak lanjut `docs/ARCHITECTURE-REVIEW-v38.md` P1. Test: 162 server + 9 browser, semua hijau.

## Yang berubah

**Gambar disimpan di disk** (`server/uploads.js`).
- Pratinjau versi, pratinjau file, gambar komentar dan pratinjau aset disimpan sekali di
  `COS_DATA_DIR/uploads/ab/<sha256>.<ext>`. Database hanya menyimpan `/files/<sha256>.<ext>`.
- File bersifat content-addressed dan immutable, jadi gambar yang sama cukup disimpan sekali.
- `GET /files/…` wajib sesi login dan di-cache browser selamanya.
- Browser tetap boleh mengirim data URL; server mengubahnya menjadi file saat menulis. Client lama tidak perlu diubah.
- **Migrasi otomatis saat start pertama v39:** semua gambar base64 lama dipindahkan, lalu `VACUUM` sekali.
  Log: `[uploads] moved images out of the database: {…}`.
- Ukuran yang diukur pada task uji: `GET /api/tasks/T-101` **127 KB → 2 KB**, bootstrap **144 KB → 19 KB**.
  Edit judul/status tidak lagi mengirim ulang gambar.

**Backup tetap lengkap.**
- Database tetap satu file terenkripsi seperti sebelumnya.
- Gambar dicerminkan secara **incremental dan terenkripsi** ke `BACKUP_DIR/uploads/<nama>.enc`. Hanya file baru yang disalin.
- File yang hilang dari disk (misalnya setelah pindah server) dipulihkan otomatis dari cermin itu pada permintaan pertama.
- Karena file tidak pernah dihapus oleh pemakaian biasa, restore database lama selalu menemukan gambarnya.
- **Salinan offsite harus mencakup `backups/` beserta sub-folder `uploads/`.**

**Nomor task dibuat server.**
- Browser tetap mengusulkan `T-<n>`. Bila dua orang membuat task bersamaan, yang kedua mendapat nomor berikutnya (sebelumnya 409 dan task gagal dibuat).
- Task yang sudah ada tetap tidak pernah tertimpa.
- Test v31 disesuaikan: tetap memastikan task orang lain tidak berubah.

**Staging** ikut menyalin `uploads/`.

## Deploy
Tidak ada langkah tambahan. `deploy/update.sh` membuat backup lebih dulu. Start pertama v39 memindahkan gambar
(beberapa detik untuk ratusan gambar) lalu menjalankan `VACUUM`. Setelah itu database jauh lebih kecil.

## Belum (P1 lanjutan)
- **Endpoint granular** (`PATCH` field, `POST` komentar/versi): prioritasnya turun, karena beban terbesar (gambar)
  sudah hilang. Setiap edit masih menulis ulang baris anak task di server (cepat pada ukuran sekarang).
- **Migrasi database berversi** dan **backup offsite otomatis**.
