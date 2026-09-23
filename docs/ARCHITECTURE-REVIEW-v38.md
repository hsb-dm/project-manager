# Review arsitektur ZenCrevia (v38.1)

23 September 2026. Dasar: membaca kode server dan front end, menjalankan aplikasi dalam mode production
dengan browser sungguhan, dan mengukur ukuran payload. Target yang dipakai: tim kreatif HSB ±30 orang,
satu VPS, dan tetap bisa dirawat oleh satu developer.

## Status pengerjaan (per 23 September 2026)

| Butir | Status |
|---|---|
| P1 pipeline rilis (CI, Playwright 9 alur, staging) | **Selesai** — v38.2 |
| P1 gambar ke disk + backup incremental | **Selesai** — v39 (127 KB → 2 KB per task) |
| P1 nomor task dari server | **Selesai** — v39 |
| P1 endpoint granular | Ditunda — manfaat utamanya sudah didapat dari gambar ke disk |
| P2 migrasi berversi, backup offsite otomatis | Berikutnya |
| P2 front end modular, keluarkan demo dari build | Berikutnya (bertahap) |
| P2 bootstrap bertahap | Setelah front end |

## Ringkasan

Fondasi server **sehat**. Auth, izin, audit log, backup terenkripsi, dan hardening production dikerjakan
dengan serius, dan tanpa dependency npm. Yang bermasalah adalah **cara data mengalir**:

1. Gambar disimpan sebagai base64 di dalam SQLite.
2. Setiap edit task mengirim ulang seluruh task, termasuk semua gambarnya.
3. Front end berupa satu file 1,9 MB yang sudah ditambal 10 lapis.

Tidak ada yang perlu dibangun ulang dari nol. Urutan di bawah disusun supaya perubahan yang paling
berdampak dan paling murah dikerjakan dulu.

## Yang sudah baik (pertahankan)

- Server adalah sumber kebenaran izin (`can.*`). Client hanya menyembunyikan tombol.
- Sesi disimpan sebagai hash, scrypt, cek origin (CSRF), SSRF guard pada link preview, kunci provider
  dienkripsi, dan preflight menolak konfigurasi yang tidak aman.
- Backup AES-GCM dengan verifikasi checksum dan rollback saat restore.
- Test integrasi yang menjalankan server sungguhan (159 test, sekitar 17 detik).
- Tanpa dependency npm, sehingga risiko supply-chain dan pekerjaan upgrade kecil.

## Temuan, urut prioritas

### P1 — Gambar di dalam database dan edit task yang "kirim semuanya"

**Fakta yang diukur.**
- Satu task berisi 2 versi dan 2 lampiran komentar (gambar polos yang sangat mudah dikompres)
  menghasilkan `GET /api/tasks/T-101` sebesar 127 KB.
- Foto 1600 px sungguhan berukuran 300–600 KB dalam base64. Task dengan 10 versi berarti **3–6 MB**.

**Mengapa berat.**
- Setiap `PUT /api/tasks/:id`, termasuk hanya mengganti judul, mengirim seluruh task beserta gambarnya.
- `writeTask()` kemudian menghapus lalu menulis ulang semua baris anak: files, versions, dan comments.
- Semua gambar task yang masih "hot" juga ikut terkirim di `/api/bootstrap` saat login.
- Database dan setiap backup ikut membengkak.
- Selain itu, ada dua sumber race condition yang ditambal di v34 dengan logika merge:
  - pola write satu dokumen utuh;
  - ID task yang dibuat di client (`nextId`, T-101…).

**Perubahan.**
1. Simpan file di disk: `COS_DATA_DIR/uploads/<sha256>.<ext>`.
   - Endpoint `POST /api/uploads` mengembalikan `{id, url}`.
   - `GET /files/:id` dengan cek izin dan cache.
   - Database hanya menyimpan referensi file.
   - Migrasi otomatis memindahkan `preview_data` yang lama ke disk.
2. Endpoint granular:
   - `PATCH /api/tasks/:id` untuk field;
   - `POST /api/tasks/:id/comments`;
   - `POST /api/tasks/:id/versions`;
   - `DELETE /api/tasks/:id/files/:fid`.

   `PUT` penuh tetap ada untuk kompatibilitas, tapi UI berhenti memakainya.
3. ID task dibuat oleh server. Client memakai ID sementara sampai server menjawab.

**Efek.** Edit task turun dari ukuran MB ke ukuran byte. Bootstrap dan backup menjadi kecil.
Kebanyakan konflik edit bersamaan hilang dengan sendirinya.

**Usaha.** 1–2 minggu. Ini investasi dengan hasil terbesar.

### P1 — Tidak ada pipeline rilis

**Kondisi sekarang.** Kode berpindah tangan sebagai zip. Laporan live v38 (demo Laura, reviewer
hardcode, izin AI mati sendiri) semuanya lolos karena tidak ada langkah "jalankan di mode production
dan klik alurnya" sebelum rilis.

**Perubahan.**
- Repo git privat dan GitHub Actions: `npm test`, build, dan **Playwright** untuk 8 alur utama:
  1. login
  2. buat task
  3. pindah tahap
  4. upload versi
  5. approval
  6. chat
  7. reset password
  8. register
- Deploy lewat `deploy/update.sh` yang sudah ada.
- Satu staging kecil (VPS yang sama, port lain, DB salinan).

**Usaha.** 2–3 hari.

### P2 — Front end: satu file global 1,9 MB dengan 10 lapis tambalan

**Fakta.**
- 44 file digabung menjadi satu `<script>` global.
- 566 `onclick` inline.
- Lapisan v29 sampai v38 membungkus fungsi inti (`renderScreen` dibungkus 3×, `openTask` 3×).
- Nama fungsi yang sama diam-diam saling menimpa. `mdToHtml` hampir terjadi lagi di v38 dan hanya
  tertangkap oleh test code-health.

**Dampak.** Setiap perbaikan makin mahal dan makin mudah merusak hal lain. CSP harus `unsafe-inline`,
sehingga perlindungan XSS bergantung sepenuhnya pada disiplin `esc()`.

**Perubahan bertahap, jangan rewrite.**
1. Lebur lapisan v29–v38 kembali ke file asalnya, supaya satu fungsi punya satu definisi.
2. Pindah ke ES modules dengan satu bundler (esbuild, satu dev-dependency, output tetap satu file).
3. Ganti `onclick` inline dengan event delegation per layar, lalu CSP bisa diperketat.
4. Keluarkan `demo-data.js` dari build server. Kode demo (`msgPresence`, `wqTraining`, `availabilityDemoSeed`)
   pernah bocor ke live lewat reviewer "laura".

**Usaha.** 3–5 minggu, bisa dicicil per layar.

**Framework (React/Vue).** Hanya layak dipertimbangkan kalau ada developer front-end tetap.
Untuk tim sekecil ini modul + bundler sudah cukup.

### P2 — Bootstrap mengirim seluruh workspace

**Kondisi sekarang.** Login mengambil semua task hot, semua aset, knowledge, people, dan activity 200.
Dengan 3.000 task masih cepat (target handover), tapi pertumbuhannya linier tanpa batas, dan
diperparah oleh gambar di P1.

**Perubahan.**
- Bootstrap cukup berisi konfigurasi, people, project, dan task yang relevan untuk user
  (miliknya + tim + 60 hari).
- Sisanya dimuat per layar dengan paginasi (aset, knowledge, arsip).
- Live update v38 sudah memakai `/api/live/:kind`. Langkah berikutnya adalah delta (item yang berubah saja).

**Usaha.** 1 minggu, sebaiknya setelah P1.

### P2 — Migrasi database tanpa versi

**Kondisi sekarang.** Migrasi berupa daftar `ALTER TABLE` yang dicoba setiap start, dengan error ditelan.
Ditambah blok migrasi ad hoc di `server.js`. Tidak ada catatan migrasi mana yang sudah jalan, dan
migrasi yang gagal karena alasan lain juga ikut tertelan.

**Perubahan.** Tabel `schema_migrations` dan folder `db/migrations/NNN-nama.sql|js`. Tiap migrasi
berjalan sekali di dalam transaksi, dan gagal berarti server tidak start.

**Usaha.** 1–2 hari.

`db/schema.postgres.sql` tidak dipakai dan sudah tertinggal. Hapus sampai benar-benar pindah ke Postgres.

### P3 — Skala dan infrastruktur (belum perlu, catat saja)

- **Satu proses Node + SQLite + SSE di memori.** Aman untuk 30 orang, perkiraan batas 100–200.
  Jangan pindah ke Postgres/Redis sebelum ada tanda nyata, karena kompleksitas operasinya naik tajam.
- **`node:sqlite` masih experimental di Node 22.** Pin versi Node di server dan uji sebelum upgrade mayor.
- **Backup offsite masih manual.** Tambahkan upload otomatis harian ke R2/S3/Drive, cukup satu cron.
- **Observability.** Log masih teks. Tambahkan log JSON per request (durasi, status, user) dan uptime
  check `/api/health` (sudah ada di checklist go-live). Pelacak error front end (misalnya Sentry
  self-host) opsional.
- **Keamanan akun.** Belum ada 2FA/SSO. Untuk fintech, *Sign in with Google Workspace* adalah langkah
  berikutnya yang paling berharga, dan sekaligus menghilangkan urusan password dan registrasi.

## Yang tidak saya sarankan

- **Rewrite total atau ganti stack.** Server sudah benar di bagian yang sulit (izin, audit, backup).
  Masalahnya ada di format data dan struktur front end, dan keduanya bisa diperbaiki di tempat.
- **Pindah ke Postgres atau microservices sekarang.** Belum ada beban yang membutuhkannya.
- **Menambah fitur besar sebelum P1 selesai.** Setiap fitur yang menyentuh task menambah beban
  pada pola "kirim semuanya".

## Urutan kerja yang disarankan

| Minggu | Pekerjaan |
|---|---|
| 1 | Pipeline: repo, CI, Playwright 8 alur, staging |
| 2–3 | P1: file ke disk + endpoint granular + ID dari server |
| 4 | Migrasi berversi; backup offsite otomatis |
| 5+ | P2 front end dicicil per layar; bootstrap bertahap |
