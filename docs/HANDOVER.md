# ZenCrevia — Dokumen Serah Terima Developer

Versi aplikasi **1.17.0 (v39)** · 23 September 2026
Untuk developer yang mengambil alih pengembangan dan operasional ZenCrevia.

Dokumen ini adalah titik masuk. Detail per area ada di:
`docs/DEVELOPER.md` (handbook lengkap), `docs/ADMIN-OPS.md` (operasional), `docs/USER-MANUAL.md`
(pengguna), `deploy/GO-LIVE.md` (checklist go-live), dan `IMPLEMENTATION-NOTES-v29…v37.md`
(apa yang berubah dan kenapa, per rilis).

---

## 1. Ringkasan

ZenCrevia adalah workspace operasional tim kreatif HSB: task dan Kanban dengan alur review/approval,
proyek, kalender, tim, aset, knowledge base, chat tim, AI Hub/Gallery, analytics, dan backup terenkripsi.

| Aspek | Keadaan |
|---|---|
| Stack | Node.js ≥ 22.13, `node:sqlite` (SQLite, WAL), **tanpa dependency npm** |
| Front end | ~45 file JS/CSS/HTML di `src/` digabung `build.js` jadi satu `public/index.html` (1,9 MB, ~460 KB terkompresi) |
| Proses | Satu proses Node, satu thread; state rate limiter dan stream live ada di memori |
| API | 107 route di bawah `/api`, 41 tabel |
| Test | 152 test, ±17 detik, stabil 3× berturut-turut (`npm test`) |
| Target beban | 30 orang: login serentak p95 2,1 s; operasi biasa p95 < 30 ms (3.000 task) |
| Status | Siap go-live mengikuti `deploy/GO-LIVE.md` |

---

## 2. Mulai cepat

```bash
node -v                        # harus ≥ 22.13
npm test                       # 152 test, pakai database sementara
npm run build                  # src/ → public/index.html dan dist/creative-os-standalone.html
npm run dev                    # build + jalankan (default http://localhost:3000)
npm run docs                   # bangun ulang docs/zencrevia-docs.html dan .pdf (butuh pandoc/wkhtmltopdf)
```

**Development:** tanpa `.env`, `NODE_ENV` bukan production → database kosong diisi workspace demo
(admin `admin@zencrevia.demo`, password acak dicetak sekali di terminal, atau set `COS_ADMIN_PASSWORD`).

**Production:** salin `.env.example` → `.env`, ganti **semua** nilai. Server menolak start (exit 78)
selama ada placeholder, dan menyebutkan yang mana (`server/preflight.js`).

**Jangan pernah commit** `.env` atau `data/` — sudah ada di `.gitignore`.

---

## 3. Peta repositori

```
server/           API + static server (satu proses)
  server.js       entry: preflight, migrasi ringan, route table, dispatch, SSE, shutdown
  serialize.js    baca/tulis entitas ↔ tabel (readTask, readTasksBatch, writeTask, stageRules…)
  permissions.js  role bawaan, CAPS, helper can.*
  auth.js         scrypt, sesi (id = sha256 token), cookie
  security.js     header, origin check, login limiter, security.log + rotasi
  preflight.js    penolakan konfigurasi production yang tidak aman
  messages.js     chat: conversation, message, pin, reaction, SSE stream, link preview (SSRF guard)
  mailer.js       email: log / smtp (net+tls sendiri) / resend
  backup.js       backup AES-GCM, verify checksum, safeRestore dengan rollback
  gallery.js      AI Gallery   decisions.js  decision log   analytics.js  agregasi
  secrets.js      enkripsi kunci SMTP/AI di database (COS_SECRET_KEY)
  seed.js         workspace bersih / demo; CLI reset (diblokir di production)
  db.js           buka DB, pragma, schema.sql, migrasi ALTER TABLE
db/schema.sql     skema SQLite (dijalankan tiap start; idempotent)
db/schema.postgres.sql  skema Postgres — BELUM dipakai kode (lihat §10)
src/              front end (lihat §5)
shared/           demo-data.js, gallery-model.js (dipakai server dan client)
public/           hasil build (index.html) + aset statis; hanya folder ini dan shared/ yang disajikan
dist/             creative-os-standalone.html — demo offline, identik dengan public/index.html
tests/            node:test (lihat §8)
deploy/           GO-LIVE.md, Caddyfile, zencrevia.service
docs/             handbook, admin, user manual, generator HTML/PDF
LEGAL/            draf kebijakan; PLACEHOLDERS.md berisi 48 isian yang wajib diisi
```

---

## 4. Arsitektur server

### 4.1 Alur satu request (`server.js`, fungsi dalam `http.createServer`)

1. Non-`/api` → file statis dari `public/` atau `shared/` (brotli/gzip, ETag, 304).
2. Cek origin untuk method yang mengubah data (CSRF): header `Origin` wajib cocok `COS_ALLOWED_ORIGINS`/`APP_URL`.
3. Sesi dari cookie `cos_session` → `userContext()` (role + caps dibaca ulang tiap request).
   Route di set `OPEN` (login, forgot/reset, health…) tidak butuh sesi.
4. Body dibaca (maks `COS_MAX_BODY_BYTES`, 12 MB) → **`checkTextLimits()`** (batas panjang per field).
5. Handler route dijalankan (`route(method, pattern, handler)`; `forbid()` untuk izin, `HttpError` untuk status).
6. Setelah sukses: `DATA_VERSION++` (untuk cache task), **`announceTaskChange()`** (event live), lalu kirim JSON (gzip > 2 KB).
7. Error: 5xx di production selalu menjadi "Server error" di respons; detail ada di log.

### 4.2 Data dan sign-in
- `GET /api/bootstrap` mengirim workspace lengkap untuk user. Task yang **selesai > 45 hari**
  (`COS_TASK_HOT_DAYS`) dikirim **ringkas** (`_slim: true`, tanpa komentar/versi/aktivitas) dan dimuat
  penuh saat dibuka lewat `GET /api/tasks/:id`.
- Daftar task di-cache (`TASK_CACHE`) sampai ada write yang bisa mengubah task atau jam berganti.
  Route `/api/auth|messages|notifications|views|ai` tidak membatalkan cache. **Kalau Anda membuat
  proses latar yang mengubah task tanpa lewat HTTP, naikkan `DATA_VERSION` secara manual.**
- `readTasksBatch()` membaca banyak task dengan 9 query total; ada test yang menjamin hasilnya
  identik dengan `readTask()`.

### 4.3 Integritas penulisan task (invariant penting)
`writeTask()` mengganti semua koleksi anak dari body. Karena itu:
- `POST` create **menolak ID yang sudah ada** (409) — berlaku juga untuk projects, knowledge, assets, folders, requests.
- `PUT /api/tasks/:id` menjalankan `sanitizeTaskWrite()`: komentar tetap milik penulis aslinya,
  aktivitas diambil dari data tersimpan, keputusan approval versi hanya ditulis jika `approveTask` lolos
  dan selalu atas nama pemanggil, ganti reviewer butuh `assignTask`.
- Salinan ringkas (`_slim`) digabung dengan `mergeSlimTask()` — tidak pernah menghapus riwayat.
- **Edit bersamaan:** client mengirim `_rev` (updatedAt saat dimuat) dan `_changed` (field yang diubah).
  Jika ada yang menyimpan di antaranya, server menerapkan hanya field itu di atas versi terbaru
  (`_merged` di respons). Tanpa `_changed` → 409. Merge terjadi **sebelum** semua cek izin.

### 4.4 Aturan tahap workflow
`gateStatusChange()` dipanggil di **setiap** jalur yang mengubah status (POST, PUT, `/move`).
Per tahap (`task_statuses.reviewer_only`, `require_reviewer`; NULL = default dari `stageRules()`):
reviewer wajib sebelum masuk review; tahap reviewer-only hanya untuk reviewer, requester, lead tim,
admin — **masuk maupun keluar** (supaya assignee tidak bisa membuka ulang task yang sudah di-Done-kan).
Default "Fleksibel": assignee boleh sampai Delivered; Done/Declined reviewer-only.
Requester boleh mengubah status task request-nya meski rolenya Viewer.
**Jalur baru yang mengubah status wajib memanggil `gateStatusChange()`.**

### 4.5 Live update
Satu stream SSE per tab (`/api/messages/stream`) membawa event chat dan `task_changed`
(`{id, updatedAt, by, deleted}`). Client mengambil task itu saja (`src/v34.js`).
`chat.publishToUsers(userIds, event)` adalah API untuk event baru.

### 4.6 Auth dan akun
- scrypt N=16384; sesi disimpan sebagai `sha256:` hash token; hanya hash yang diterima.
- Login selalu menjalankan satu scrypt (waktu tidak membocorkan email terdaftar).
- Lupa password: token 256-bit, disimpan hash, 60 menit, sekali pakai, membatalkan token lama,
  mengakhiri semua sesi; batas 5/email dan 30/IP per 15 menit.
- Admin terakhir tidak bisa menurunkan perannya sendiri.

### 4.7 Lainnya
- **Chat:** maks 4.000 karakter (ditolak, tidak dipotong), 30 pesan/30 detik/orang (`COS_MSG_RATE_MAX`).
- **Email:** transport `log` menulis `.eml` ke `data/outbox` (dipangkas 14 hari/1.000 file);
  SMTP menolak mengirim password tanpa TLS kecuali relay localhost.
- **Backup:** AES-256-GCM dengan `COS_BACKUP_KEY`; restore memverifikasi checksum, membuat backup
  pengaman terenkripsi, rollback jika gagal, dan menghapus salinan plaintext lama.
- **Link preview chat:** SSRF guard dengan validasi IP saat koneksi (anti DNS rebinding).
- **AI proxy:** host provider di-allowlist (`COS_AI_ALLOWED_HOSTS` untuk tambahan).
- **File di disk:** umask 077; data dir 0700; DB 0600.
- **Shutdown:** SIGTERM/SIGINT → selesaikan request, checkpoint WAL, tutup DB (≤ 8 s).

---

## 5. Arsitektur front end

### 5.1 Cara kerja
- `build.js` menggabungkan file-file di `parts` (urutan penting!) jadi satu HTML.
  Setiap file JS adalah `<script>` klasik → **semua fungsi berbagi satu global scope**.
- Status global utama: `S` (state UI), `WS` (workspace), `TASKS`, `PEOPLE`, `PROJECTS`, `TEAMS`,
  `MESSAGES`, `ME`, `API` (`API.on` = mode server), `SESSION`.
- Render: `go(screen, sub)` → `renderScreen()`; `refresh()` merender ulang layar aktif.
- Data ke server: `apiFetch(method, path, body)`; task: `persistTask(tk, snapshot)` dan
  `moveTask(tk, op, applyLocal)` (op seperti `MOVE_TASK_STATUS`). Konversi bentuk data: `hTask` (server→client), `dTask` (client→server).
- Teks: `esc()` untuk isi, `attr()` untuk atribut — **wajib** untuk semua data user (XSS).
- i18n: `tr("English text")` + kamus `UI_ID` (Indonesia); `localizeVisibleText()` menerjemahkan node teks.
- Mode demo: file standalone (`file:`) atau server tanpa API (404) → data demo di browser, tidak tersimpan.
  Aplikasi yang disajikan server **tidak pernah** jatuh ke demo karena jaringan lambat (layar "tidak dapat dihubungi").

### 5.2 Lapisan patch v29–v35 (penting dibaca sebelum mengubah fungsi inti)
Perbaikan rilis terakhir ditulis sebagai file terpisah yang **membungkus** fungsi yang sudah ada,
supaya kode lama tidak dibongkar. Urutan build: `… enhance.js, clipboard.js, v29.js, v33.js, v34.js, v35.js, v38.js, boot.js`.

| Fungsi inti | Dibungkus di | Tujuan |
|---|---|---|
| `renderScreen` | v29 (2×) | atribut layar untuk CSS mobile, banner peringatan email |
| `setConn`, `fail`, `EventSource` | v29 | status offline, pesan error jaringan yang manusiawi |
| `openTask` | v29 | ambil task ringkas secara penuh sebelum dibuka |
| `loadBootstrap` | v29 | simpan transport email untuk banner |
| `setThemeTab` | v29 | read-only untuk non-admin |
| `moveTask` | v33 | tolak perpindahan tahap sebelum kartu bergerak |
| `setWorkflow` | v33 | tambah panel "Siapa yang boleh memindahkan…" |
| `hTask`, `apiFetch` | v34 | `_rev`/`_changed` untuk edit bersamaan |
| `EventSource` | v34 | event `task_changed` → board live |
| `bulkStatus` | v34 | aksi massal mengikuti aturan tahap |
| `msgIncoming` | v35 | pengumuman pesan baru untuk pembaca layar |

**Aturan:**
- Jangan mendeklarasikan `function x()` dengan nama yang sudah ada di file lain — yang belakangan
  diam-diam menggantikan yang lama. Dua tabrakan seperti ini sempat merusak fitur (§9 v37).
  `tests/v37-code-health.test.js` sekarang gagal jika ada tabrakan baru. Tiga override yang disengaja
  (`aiGradient`, `localizeVisibleText`, `notifRows`) tercatat di test itu.
- Kalau membungkus fungsi, simpan referensi lama (`var base = fn; fn = function(){…base.apply(this, arguments)…}`)
  dan letakkan di file yang dimuat **setelah** file aslinya.
- Refactor yang disarankan (§10): lebur lapisan v29–v35 ke file aslinya dan pindah ke ES modules.

### 5.3 CSS
`head.html` (dasar) → `refinements.css` → `v18.css` → `responsive.css`. **Urutan menentukan pemenang**
untuk selector dengan spesifisitas sama; `refinements.css` dimuat sebelum `v18.css`, jadi override di
sana sering butuh selector lebih spesifik (mis. `#msgTimeline .msg`). Token warna di `:root`
(`--color-*`), tema gelap di `[data-theme="dark"]`.

---

## 6. Izin (permissions)

Role bawaan di `server/permissions.js` (`DEFAULT_ROLES`): admin, creative_lead, team_lead, member, viewer.
Setiap role = daftar caps (`create_task`, `edit_own_task`, `review_any`, `manage_knowledge`, …).
Helper `can.*` di server (sumber kebenaran) dan `canI.*`/`has()` di client (hanya untuk UI).
Catatan kebijakan: role **member** punya `manage_knowledge` dan `manage_assets` (boleh mengubah/menghapus
halaman Knowledge dan aset siapa pun) — putuskan dengan tim apakah ini diinginkan.

---

## 7. Konfigurasi (`.env`)

| Variabel | Wajib | Keterangan |
|---|---|---|
| `NODE_ENV=production` | ya | mengaktifkan preflight, cookie Secure, HSTS |
| `PORT` | ya | port lokal di belakang Caddy (mis. 3000) |
| `APP_URL`, `COS_ALLOWED_ORIGINS` | ya | alamat https asli; dipakai link email dan cek origin |
| `COS_TRUST_PROXY=1` | di belakang proxy | IP klien dari `X-Forwarded-For` (rate limit per IP) |
| `COS_SECRET_KEY` | ya | ≥ 32 karakter; enkripsi kunci SMTP/AI di DB |
| `COS_BACKUP_KEY` | ya | ≥ 32, berbeda dari secret; **tanpa ini backup tidak bisa dibuka** |
| `COS_ADMIN_EMAIL/NAME/PASSWORD` | start pertama | admin awal (password ≥ 12) |
| `TZ=Asia/Jakarta` | disarankan | batas hari untuk arsip otomatis dan jadwal |
| `COS_MAIL_TRANSPORT`, `SMTP_*`, `MAIL_FROM` | untuk email | atau atur SMTP dari Settings |
| `COS_SEED_DEMO` | tidak | `1` = isi data demo pada DB kosong |
| `COS_TASK_HOT_DAYS` | tidak | 45 |
| `COS_RESET_MINUTES` | tidak | 60 |
| `COS_MSG_RATE_MAX` | tidak | 30 pesan / 30 detik |
| `COS_BACKUP_INTERVAL_HOURS` | tidak | override jadwal backup dashboard |
| `COS_SECURITY_LOG_MAX_MB/KEEP`, `COS_OUTBOX_DAYS/MAX` | tidak | rotasi log dan outbox |
| `COS_AI_ALLOWED_HOSTS` | tidak | host AI tambahan |
| `COS_SKIP_PREFLIGHT=1` | **jangan** | darurat saja |

Lengkapnya: `.env.example` dan tabel di `docs/ADMIN-OPS.md`.

---

## 8. Test

`npm test` menjalankan `node --test tests/*.test.js` (tanpa library).
`npm run e2e` (v38.2) menjalankan 9 alur utama di Chromium terhadap server production bersih — wajib hijau sebelum rilis; CI menjalankan keduanya (`.github/workflows/ci.yml`). Staging: `deploy/staging/`.

- **Test perilaku** (spawn server production sungguhan, HTTP nyata): `server-security-integration`,
  `v29-readiness`, `v29-link-preview-guard`, `v30-accounts-and-scale`, `v31-audit-fixes`, `v33-stage-rules`,
  `v34-collaboration`, `v36-preflight`, plus `messages.test.js` (in-process). Inilah jaring pengaman utama.
- **Test statis** (`v37-code-health`): tabrakan nama fungsi global, file `src/` yang tidak di-build.
- **Test UI lama** (`ux-batch-v28`, `task-detail-ux`, `settings-menu`, …): sebagian besar hanya
  mencocokkan regex pada source. Lolos ≠ UI benar; verifikasi UI dilakukan manual di Chromium
  (Playwright) selama audit — lihat catatan tiap rilis. Menambahkan test browser otomatis adalah
  investasi yang disarankan (§10).

Menulis test baru: salin pola `start()` dari `tests/v34-collaboration.test.js` (spawn server dengan
`COS_DATA_DIR` sementara, `PORT=0`, baca port dari stdout).

---

## 9. Riwayat rilis (ringkas)

| Rilis | Isi |
|---|---|
| v29 | Instalasi bersih, kompresi+cache (3,1 MB → 460 KB), backup mengikuti setting, CSP audio, hardening notifikasi/SSRF/validasi |
| v30 | Lupa password via email, bootstrap ringan (2,3 s → 0,1 s), sesi hanya hash, rotasi log, a11y |
| v31 | Tidak jatuh ke demo saat jaringan lambat, batas panjang teks, timing login, CSV injection |
| v32 | Integritas data: create tidak menimpa, komentar/approval/aktivitas tidak bisa dipalsukan |
| v33 | Aturan perpindahan tahap per tahap di Settings |
| v34 | Edit bersamaan (merge per field), board live, gate buka-ulang, admin terakhir, bulk mengikuti aturan |
| v35 | Satu style chat, pesan gagal terkirim ditandai, rate limit & batas chat, a11y chat |
| v36 | Preflight production, SMTP tanpa TLS ditolak, izin file, cache task, graceful shutdown, health DB, template deploy |
| v39 | Gambar di disk (`server/uploads.js`, `/files/<sha>`), mirror backup incremental, nomor task dari server |
| v38 | Perbaikan deploy live: router URL, akun terhapus dibebaskan, pembersih data demo, AI (izin, tes nyata, adapter OpenAI/Gemini, error 424), tema per akun, editor deskripsi, anotasi 100%, multi-versi, data dipisah dari kode (`/var/lib/zencrevia`) |
| v37 | Audit serah terima: dua tabrakan nama fungsi yang merusak fitur (link Google Drive selalu ditolak; status di list task membuka menu ketersediaan), test code-health, `.gitignore`, dokumen ini |

---

## 10. Keterbatasan dan utang teknis (urut prioritas)

1. **Skala: satu proses + SQLite.** Nyaman untuk 30 orang, perkiraan batas 100–200. Di atas itu:
   pindah ke Postgres (`db/schema.postgres.sql` sudah ada tapi belum dipakai; `db.js`/`serialize.js`
   perlu adapter), rate limiter dan SSE perlu Redis/pubsub untuk multi-instance.
2. **Front end global-scope 1,9 MB** tanpa modul/bundler, dengan lapisan patch v29–v35.
   Refactor bertahap ke ES modules; lebur wrapper ke file asal.
3. **CSP `script-src 'unsafe-inline'`** karena ratusan `onclick` inline. Keamanan XSS bergantung pada
   disiplin `esc()/attr()`. Hilangkan inline handler → CSP ketat.
4. **Test UI sebagian besar regex.** Tambahkan Playwright di CI untuk alur utama
   (login, buat/pindah task, approval, chat, reset password).
5. **Tidak ada 2FA/SSO.** Untuk perusahaan fintech, SSO Google Workspace disarankan.
6. **Rate limiter di memori** (reset saat restart, tidak dibagi antar instance).
7. **Hapus task permanen** (tanpa trash); pemulihan lewat backup.
8. `/api/activity` masih menerima entri kosmetik bertipe "approved" (tidak mengubah approval sungguhan).
9. Tombol mobile umumnya 28 px (lolos WCAG AA 24 px, di bawah anjuran Apple 44 px).
10. `node:sqlite` masih berlabel experimental di Node 22 — pin versi Node di server; uji sebelum upgrade mayor.
11. Data demo (`shared/demo-data.js`) ikut ter-bundle di build server (±50 KB), identitas demo disembunyikan saat loading.
12. Endpoint lupa password punya selisih waktu ±1 ms antara email terdaftar/tidak (risiko rendah).

---

## 11. Resep tugas umum

**Menambah route API** — di `server/server.js`: `route("POST", "/api/x/:id", (u, p, q, b, ctx) => { forbid(can.xxx(u), "do x"); … return data; });`
Jika mengubah task: pastikan melewati `gateStatusChange` (status), `sanitizeTaskWrite` (koleksi),
dan tidak masuk regex pengecualian `DATA_VERSION`. Tambahkan batas teks di `TEXT_LIMITS` bila ada field teks baru.

**Menambah kolom DB** — tambahkan di `db/schema.sql` (untuk DB baru) **dan** `ALTER TABLE` di daftar migrasi
`db.js` (untuk DB lama; dieksekusi tiap start, error "sudah ada" diabaikan). Perbarui `schema.postgres.sql`.

**Menambah teks UI** — tulis dalam bahasa Inggris dengan `tr("…")`, tambahkan terjemahan ke `UI_ID`
(`Object.assign(UI_ID, {...})` di file fitur).

**Menambah setting workspace** — field di `writeWorkspace/readWorkspace` (`serialize.js`), UI di fungsi `set…Tab` di `settings.js`, simpan dengan `saveWS()`.

**Menambah file front end** — daftarkan di `parts` di `build.js` (test code-health akan gagal jika lupa); jangan pakai nama fungsi yang sudah ada.

**Rilis** — `npm test` → `npm run build` → `npm run docs` → perbarui `IMPLEMENTATION-NOTES-vNN.md`,
`package.json` version, README → deploy dengan `sudo deploy/update.sh rilis.zip` (v38: data di `/var/lib/zencrevia`,
konfigurasi di `/etc/zencrevia/zencrevia.env`, kode di `/opt/zencrevia` — update hanya mengganti kode).

---

## 12. Kontak dan akses yang harus diserahkan (isi oleh pemilik)

| Item | Lokasi / pemegang |
|---|---|
| Server (SSH) | ______ |
| `.env` production (termasuk `COS_SECRET_KEY`, `COS_BACKUP_KEY`) | password manager: ______ |
| Lokasi salinan backup di luar server | ______ |
| Akun SMTP / provider email | ______ |
| DNS domain & Caddy | ______ |
| Google Cloud (OAuth Drive) | ______ |
| Kunci provider AI | ______ |
| Admin workspace | ______ |
