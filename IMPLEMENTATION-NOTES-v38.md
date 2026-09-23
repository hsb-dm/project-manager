# ZenCrevia 1.16.1 (v38.1) — perbaikan dari deploy live pertama + URL bersih

23 September 2026. 20 laporan dari VPS produksi (`pm.automationhsb.pro`). Test: 159/159.
File baru: `src/v38.js`, `src/v38.css`, `server/demo-purge.js`, `server/purge-demo-cli.js`,
`deploy/migrate-data-dir.sh`, `deploy/update.sh`, `tests/v38-live-fixes.test.js`.

## Langkah di VPS (urutkan persis begini)

```bash
# 1. backup dulu
cd /opt/zencrevia && sudo -u zencrevia npm run backup

# 2. pisahkan data dari kode (sekali saja): DB → /var/lib/zencrevia, .env → /etc/zencrevia/zencrevia.env
#    Ekstrak zip v38 ke folder sementara (mis. /tmp/v38), lalu dari folder itu:
sudo bash /tmp/v38/deploy/migrate-data-dir.sh      # masih memakai kode lama; hanya memindahkan data

# 3. pasang kode v38 (backup → test → ganti kode → health check → rollback otomatis bila gagal)
sudo bash /tmp/v38/deploy/update.sh /path/ke/zencrevia-v38.zip

# 4. hapus akun & konten demo (Laura dkk.) — lihat dulu, lalu jalankan
cd /opt/zencrevia && sudo -u zencrevia env COS_DATA_DIR=/var/lib/zencrevia node --env-file=/etc/zencrevia/zencrevia.env server/purge-demo-cli.js --keep <id-admin-kamu>
#    tambahkan --yes untuk benar-benar menghapus (server boleh tetap jalan; muat ulang browser sesudahnya)
#    Alternatif: Settings → Backup & data → "Demo accounts and sample content".
```

5. **Settings → AI & integrations → Providers**: pilih *Image provider* sesuai key (OpenAI / Gemini / Magnific),
   isi key, klik **Save & test connection**. Badge **Verified** hanya muncul bila provider benar-benar menjawab.
   Periksa sekali **Permissions** (bug v37 mungkin sudah mematikannya).
6. **Settings → Cloud storage**: klik **Test Google Drive**.
7. Jika ingin anggota mendaftar sendiri: **Settings → Workspace → Access → Allow self-registration** + join code,
   lalu bagikan `https://pm.automationhsb.pro/register` dan kodenya.

## Apa yang berubah (nomor = laporan)

| # | Akar masalah | Perbaikan |
|---|---|---|
| 1, 18 | Posisi halaman tidak pernah ditulis ke URL; refresh selalu ke Home. Hanya task yang live. | Router hash `#/<layar>/<sub>?task=<id>` (refresh, back/forward, link). Event `ws_changed` + `GET /api/live/:kind` untuk project, tim, member, aset, knowledge, workspace, role. Update ditunda selama pengguna sedang mengetik. |
| 2 | Hapus member hanya menghapus keanggotaan; email, password, sesi tetap. Tambah ulang dengan nama sama menghidupkan akun lama. | `releaseAccount()`: email & password dikosongkan, sesi dihapus, nonaktif. Migrasi otomatis saat start untuk akun yang dihapus versi lama. `POST /api/members` tidak memakai ulang id lama. |
| 3 | Form daftar tersembunyi selama `allow_registration=0`, tanpa toggle di UI; daftar tim diambil dari data demo. | Toggle di Settings → Access, halaman `#/register`, tim dari server, tombol lihat/sembunyikan di semua field password. |
| 4, 5 | `newTaskModal` memakai reviewer tetap `"laura"` (data demo). Di workspace bersih: FOREIGN KEY → HTTP 500, task tidak pernah dibuat. | Reviewer default = lead tim assignee. `cleanTaskRefs()` di server membuang referensi ke user/project/tim/task yang tidak ada. Setelah Create panel menutup (toast + "Open"); jika gagal, draf dikembalikan. Pembersih data demo: UI + `npm run purge-demo`. Akun/konten dianggap demo hanya jika id **dan** nama/judul masih sama dengan seed — task nyata `T-101` aman. |
| 6 | Link task/project di chat tampil sebagai teks + kartu. | Saat kirim, URL internal dihapus dari teks dan diganti referensi task/project. |
| 7 | Riwayat hanya diambil jika `MESSAGES[id]` kosong; setelah reload daftar percakapan sudah berisi pesan terakhir. | Riwayat diambil sekali per percakapan; scroll ke pesan terakhir (juga setelah gambar termuat). |
| 8 | Input di modal status tidak ikut tema gelap. | Semua input/textarea/select mengikuti token tema gelap. |
| 9 | Mode terang/gelap disimpan di level workspace. | Disimpan per akun (`prefs.appearance`); pengaturan workspace tidak berubah. |
| 10 | Komentar di-escape tanpa linkify. | Aturan link yang sama dengan chat (`richLinkText`). |
| 11 | (Empty state sudah ada di v37.) | Link ke project yang tidak ada → daftar project + pesan, tidak error. |
| 12 | Kanvas anotasi 230px + `background-size:cover`. | Gambar utuh, zoom **100%** (default) atau **Fit**; pin tetap di posisinya. |
| 13 | Upload versi hanya satu file. | Pilih banyak file → satu versi per file (maks 10). |
| 15 | Hapus file tidak menghapus versi yang dibuat dari file itu; nomor versi bisa bentrok. | Hapus file ikut menghapus versinya (konfirmasi; versi approved dilindungi). Nomor versi = maks + 1. |
| 16 | Tombol Attach hanya menyimpan nama file; komentar "visible to stakeholder" disimpan sebagai `team`. | Gambar dikecilkan & disimpan sebagai pratinjau, file lain lewat Drive; thumbnail bisa dibuka. Visibilitas `client` dipertahankan. |
| 17 | Textarea polos. | Toolbar (B, I, S, judul, daftar, kutipan, link, code), Write/Preview. Disimpan sebagai Markdown; teks ber-format yang ditempel dari Docs/Word dikonversi. |
| 19 | `saveAI()` membaca switch izin yang ada di sub-tab lain → menyimpan dari *Providers* mematikan AI. Tes chat mengirim context → 403. "Connected" = hanya ada key. Gambar selalu dikirim dalam format Magnific. | Switch yang tidak tampil = tidak berubah; izin default *allow*. `POST /api/ai/test` memanggil provider sungguhan dan menyimpan `lastCheck` (dihapus bila provider/endpoint/model/key berubah). Adapter gambar OpenAI (`gpt-image-1`, `dall-e-3`), Gemini (`gemini-2.5-flash-image`, `imagen-*`), Magnific/Freepik. Drive: tes login + akses folder, status *Verified* hanya setelah lolos. |
| 20 | Error provider dikirim sebagai HTTP 502; Cloudflare mengganti isi 502 dari origin dengan halaman HTML-nya, dan UI menampilkannya mentah. | Error provider = **424** dengan pesan asli. UI tidak pernah menampilkan HTML; status 502/503/504/524 diberi pesan yang bisa dipahami. |
| 14 | `data/` dan `.env` berada di dalam folder aplikasi; mengganti folder saat update menghapusnya. Pratinjau gambar lokal ada di dalam DB. | Kode `/opt/zencrevia`, data `/var/lib/zencrevia` (`StateDirectory`), konfigurasi `/etc/zencrevia/zencrevia.env`. `migrate-data-dir.sh`, `update.sh` (backup → test → ganti kode → health → rollback). Preflight memperingatkan bila data masih di folder aplikasi. |

## Catatan untuk developer
- Semua override front-end di `src/v38.js` memakai pola wrapper (§5.2 HANDOVER); test code-health lolos.
- `saveAI` dan `aiTest` di v38 **menggantikan** versi `settings.js` (bukan membungkus), karena bug ada di tengah fungsi.
- Deskripsi lama (teks polos) tetap tampil benar: Markdown tanpa penanda = paragraf biasa.
- Komentar lama yang dilampiri lewat tombol Attach di v37 hanya punya nama file (berkasnya memang tidak pernah tersimpan) — ditampilkan redup.
- Belum diuji dengan kunci asli: generate gambar OpenAI/Gemini dan upload Google Drive. Tombol tes menampilkan pesan provider apa adanya.
- `/api/activity` kini menerima `project_created` dan `member_team` (sebelumnya 400 di console).

## v38.1 — URL bersih

| Sebelum | Sesudah |
|---|---|
| `/#/tasks/kanban?task=T-101` | `/tasks/kanban?task=T-101` |
| `/#/projects/p1` | `/projects/p1` |
| `/#/register` | `/register` |
| `/` (Home) | `/` |

- **Server** (`server.js`, penangan file statis): GET/HEAD untuk path tanpa ekstensi file yang bukan `/api` atau
  `/shared` dijawab dengan `index.html`; router di halaman yang menentukan isinya. `/logo.png` yang tidak ada tetap 404,
  `/api/…` yang tidak dikenal tetap 404 JSON. Tidak perlu mengubah Caddy atau Cloudflare.
- **Standalone** (`file://`) tetap memakai hash (`#/tasks?task=…`) karena tidak ada server.
- **Link lama tetap jalan:** `#/…` (v38) dipindah ke path, `#task=` / `#conv=` / `#project=` (≤ v37) tetap dibuka.
- **Email notifikasi** kini menautkan `/tasks?task=<id>`. Link v37 (`/#/task/<id>`) tidak pernah membuka apa pun.
- **Preferensi pribadi** (tema, layout, saved) disimpan dengan `?prefsOnly=1`: tidak disiarkan ke pengguna lain dan
  tidak membatalkan cache task.
- Link knowledge/aset/percakapan yang disalin tetap format lama (`/#knowledge=…`), tetap berfungsi.

## v38.2 — pipeline rilis (review arsitektur P1) dan bug yang ditemukannya

**Test browser.** `npm run e2e` menjalankan Playwright (Chromium) terhadap server production dengan workspace bersih
(`e2e/serve.js`, data di folder temp OS). Sembilan alur: sign in, project + task, pindah tahap, multi-versi + hapus,
review/approve oleh reviewer lain, chat, lupa password lewat email, register, tema per akun. Sekali install lokal:
`npm ci && npx playwright install chromium`. Halaman memberi tanda `window.ZC_READY` setelah workspace termuat.

**CI.** `.github/workflows/ci.yml`: `npm test` → build harus identik dan sudah di-commit → `npm run e2e`.
Tag `v*` membuat zip rilis. Playwright adalah satu-satunya dev-dependency; server tetap tanpa dependency.

**Staging.** `deploy/staging/`: service di port 3001 (`/opt/zencrevia-staging`, data `/var/lib/zencrevia-staging`),
Caddy dengan basic auth, dan `deploy-staging.sh rilis.zip` yang memasang kode dan menyalin DB live dengan
`VACUUM INTO` (tanpa downtime), lalu menghapus sesi. `COS_MAIL_FORCE_LOG=1` membuat staging tidak pernah
mengirim email, termasuk bila salinan DB membawa pengaturan SMTP live. Alur rilis:
`deploy-staging.sh` → klik-uji di staging → `update.sh` dengan zip yang sama.

**Bug yang ditemukan oleh test browser (sudah diperbaiki):**
- **#11 sebenarnya belum beres di v38.** Dengan 0 project, `renderProjects()` mengembalikan HTML alih-alih
  menampilkannya — layar tetap Home dan tombol *New project* tidak pernah muncul.
- **Satu email per pesan DM**, berjudul ID percakapan ("Admin updated “cv_…”"). Kini: tidak ada email selama
  penerima sedang membuka ZenCrevia, maksimal satu per percakapan per 30 menit, isi pesan dikutip, link ke `/messages/<id>`.
- **Tur onboarding menutupi task** yang dibuka lewat link pada login pertama. Tur kini menunggu sampai Home.
- Data demo ada di memori selama halaman memuat (sebelum bootstrap). Tidak terlihat oleh pengguna, tapi dicatat
  untuk P2 (keluarkan demo dari build server).
