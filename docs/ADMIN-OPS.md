# ZenCrevia — Panduan Admin & Operasional

> Untuk administrator workspace dan operator server.
> Narasi Bahasa Indonesia, label UI dan istilah teknis tetap English.
> Versi 1.6.0 · Node **>= 22.13** · nol dependensi npm.

---

## Daftar isi

1. [Peta layar Settings](#1-peta-layar-settings)
2. [Roles & permissions](#2-roles--permissions)
3. [Identitas dan struktur workspace](#3-identitas-dan-struktur-workspace)
4. [Mengelola anggota](#4-mengelola-anggota)
5. [Administrasi AI](#5-administrasi-ai)
6. [Email / SMTP](#6-email--smtp)
7. [Backup & Data](#7-backup--data)
8. [Google Drive](#8-google-drive)
9. [Deployment](#9-deployment)
10. [Environment variables](#10-environment-variables)
11. [Checklist produksi](#11-checklist-produksi)
12. [Pemeriksaan rutin](#12-pemeriksaan-rutin)
13. [Failure modes: kenali gejalanya](#13-failure-modes-kenali-gejalanya)
14. [Batasan yang perlu diketahui](#14-batasan-yang-perlu-diketahui)

---

## 1. Peta layar Settings

Tujuh belas tab, dalam urutan tampil. Header menampilkan badge **read-only for your role**
kalau kamu tidak punya `manage_workspace`.

| # | Tab | Yang diatur | Izin |
|---|---|---|---|
| 1 | **My profile** | foto, nama, jabatan, email, kapasitas, ganti password, tampilan pintasan keyboard | tidak ada (catatan sendiri); kolom kapasitas terkunci tanpa `manage_members` |
| 2 | **Menu & home layout** | posisi panel task, layout presets, menu atas, kartu Home | tidak ada — per akun |
| 3 | **Workspace** | identitas (nama, tagline, inisial logo, gambar logo, favicon), zona waktu & jam kerja, join code, role default | `manage_workspace` |
| 4 | **Theme & appearance** | accent, secondary, mode, density, radius, tipografi, warna kartu task | `manage_workspace` **di server** — lihat catatan di bawah |
| 5 | **Workflow stages** | nama, kind, warna, urutan, tambah/hapus stage | `manage_workspace` |
| 6 | **Automation** | auto-hide task selesai, auto-archive project selesai | `manage_workspace` |
| 7 | **Brief templates** | field per template + tanda wajib (★) | `manage_workspace` |
| 8 | **Custom fields** | visibilitas field bawaan + custom task field | `manage_workspace` |
| 9 | **Labels** | nama, warna (palet tetap), tambah/hapus, reset | `manage_workspace` |
| 10 | **Tags** | buat, ganti nama, urutkan, arsip, hapus | `manage_workspace` |
| 11 | **Members** | tabel anggota, tambah anggota, reset password, hapus | `manage_members` |
| 12 | **Roles & permissions** | daftar role, edit capability, role baru | `manage_roles` |
| 13 | **Teams** | nama, warna, ikon, lead, urutan, arsip | `manage_teams` |
| 14 | **AI & integrations** | enam sub-halaman — lihat bagian 5 | `manage_workspace` |
| 15 | **Notifications & email** | saklar notifikasi per kejadian, SMTP, delivery log | `manage_workspace` |
| 16 | **Cloud storage** | checklist Google Drive + konfigurasi | `manage_workspace` |
| 17 | **Backup & data** | enam sub-halaman — lihat bagian 7 | `manage_workspace` |

> **Catatan tab Theme.** Tab ini tidak punya gate di sisi client. Anggota non-admin akan
> melihat kontrol yang tampak berfungsi, tapi server menolak simpanannya dan yang muncul
> adalah toast gagal. Perubahannya berlaku untuk sesi itu saja.

Tidak ada tab **Security**, **Audit log**, **Billing**, maupun **Priorities**.
Prioritas (Low / Medium / High / Urgent) bersifat tetap dan tidak bisa diubah.

---

## 2. Roles & permissions

### Lima role bawaan

| id | Nama | Rank | Untuk siapa |
|---|---|---|---|
| `admin` | Admin | 100 | akses penuh workspace |
| `creative_lead` | Creative Lead | 80 | membuat project & task, assign, review, approve, analytics |
| `team_lead` | Team Lead | 60 | mengelola beban kerja tim, assign dan review task timnya |
| `member` | Member | 40 | mengerjakan task yang ditugaskan, unggah, komentar, submit review |
| `viewer` | Viewer | 10 | baca saja; boleh mengirim request dan berkomentar |

Kelima role ini ditandai `is_system` sehingga **tidak bisa dihapus** lewat API.

### Matriks capability (28)

| Capability | Admin | Creative Lead | Team Lead | Member | Viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| `manage_workspace` | ✔ | | | | |
| `manage_members` | ✔ | | | | |
| `manage_teams` | ✔ | | | | |
| `manage_roles` | ✔ | | | | |
| `create_project` | ✔ | ✔ | | | |
| `edit_any_project` | ✔ | ✔ | | | |
| `delete_project` | ✔ | ✔ | | | |
| `create_task` | ✔ | ✔ | ✔ | | |
| `create_own_task` | ✔ | ✔ | ✔ | ✔ | |
| `edit_any_task` | ✔ | ✔ | | | |
| `edit_team_tasks` | ✔ | | ✔ | | |
| `edit_own_task` | ✔ | | ✔ | ✔ | |
| `assign_task` | ✔ | ✔ | | | |
| `review_any` | ✔ | ✔ | | | |
| `delete_task` | ✔ | ✔ | | | |
| `upload_file` | ✔ | ✔ | ✔ | ✔ | |
| `decide_request` | ✔ | ✔ | ✔ | | |
| `manage_assets` | ✔ | ✔ | ✔ | ✔ | |
| `manage_knowledge` | ✔ | ✔ | ✔ | ✔ | |
| `view_analytics` | ✔ | ✔ | ✔ | | |
| `view_all` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `submit_request` | ✔ | | ✔ | ✔ | ✔ |
| `use_ai_hub` | ✔ | ✔ | ✔ | ✔ | |
| `view_ai_gallery` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `publish_ai_gallery` | ✔ | ✔ | ✔ | ✔ | |
| `duplicate_ai_gallery` | ✔ | ✔ | ✔ | ✔ | |
| `manage_own_ai_gallery` | ✔ | ✔ | ✔ | ✔ | |
| `manage_all_ai_gallery` | ✔ | | | | |

Catatan: Admin mendapat semuanya lewat short-circuit, bukan lewat daftar —
menambah capability baru otomatis dimiliki Admin. Creative Lead tidak memiliki
`submit_request` secara eksplisit karena sudah tercakup oleh `create_task`.

### Membuat dan mengedit role

**Settings → Roles & permissions → New role** atau **Edit** pada barisnya.
Isi **Name** dan **Description**, lalu nyalakan capability satu per satu.
Untuk role `admin` semua saklar tampil menyala dan terkunci.

Menghapus role menurunkan anggotanya menjadi **Member**.

### Memberi role ke orang

**Settings → Members** → kolom **Permission role**.

Efek samping yang perlu diketahui: memilih **Viewer** membuat orang itu ditandai stakeholder
dan kapasitasnya dipaksa `0`. Menaikkan viewer ke role lain mengembalikan kapasitasnya ke 40
kalau sebelumnya kosong.

### Permission AI Gallery

Dievaluasi terpisah, dengan **fallback lama** yang sengaja dipertahankan supaya definisi role
sebelum v16 tetap bekerja: siapa pun yang punya `upload_file` **atau** `manage_assets` tetap
bisa melihat, menerbitkan, dan menduplikasi desain — meskipun capability AI Gallery-nya
belum dicentang.

Kalau kamu ingin membatasi AI Gallery secara ketat, kedua capability lama itu juga harus dicabut.

---

## 3. Identitas dan struktur workspace

### Identitas

**Workspace name**, **Tagline**, **Logo initials** (maks 3 karakter), **Logo image**, **Favicon**.
Gambar dibaca sebagai data URL dan dibatasi **400 KB**.

**Time & working hours** — zona waktu, hari kerja, jam mulai/selesai (default 09:00–18:00).
Ini tersimpan sebagai referensi workspace; kapasitas mingguan diatur per anggota.
Kalender selalu memperlakukan Sabtu dan Minggu sebagai akhir pekan.

**Access** (mode server + admin) — **Workspace join code** dan **Default role for new accounts**.

### Workflow stages

Lima *kind*: **Queue**, **Work**, **Review**, **Revision**, **Closed**.
Kind menentukan perilaku, bukan namanya — misalnya tombol Approve hanya muncul di stage
ber-kind `review`, dan auto-hide hanya melihat stage ber-kind `closed`.

Ganti nama langsung di tempat, urutkan dengan seret, tambah lewat **Add stage** (Name, Kind,
Insert after). **Stage tidak bisa dihapus selama masih ada task di dalamnya** — pindahkan
task-nya dulu.

### Teams

Nama, deskripsi, warna (swatch atau warna kustom), ikon (set bawaan atau unggah SVG < 50 KB),
dan **Team lead**. Tim **diarsipkan**, bukan dihapus: task kehilangan timnya, anggota tetap
di tim lain. Warna tim hanya indikator — mewarnai kartu secara tipis, tidak pernah seluruh UI.

### Tags vs Labels

|  | Tags | Labels |
|---|---|---|
| Warna | **tidak ada** (disengaja) | ada, dari palet tetap |
| Cakupan | task, project, aset | task |
| Urutan | manual, bisa diseret | mengikuti daftar |
| Arsip | ada | tidak |

Mengganti nama tag memperbaruinya di seluruh task, project, dan aset sekaligus.
Menghapus tag melepasnya dari semua item — item-nya sendiri tetap ada.
Baris tag punya menu aksesibel: Move to top / up / down / bottom, Archive, Delete.

### Custom fields & brief templates

**Custom fields** bertipe Text, Number, Select, atau Checkbox. Field ini muncul di panel task,
di view Grid, dan di export Excel.

**Brief templates** memilih subset dari daftar brief field workspace dan menandai mana yang wajib.

---

## 3b. Aturan perpindahan tahap (v33)

**Settings → Workflow stages → Siapa yang boleh memindahkan task ke setiap tahap.** Per tahap ada dua aturan:

- **Reviewer wajib diisi** — task tidak bisa masuk tahap ini sebelum ada reviewer.
- **Siapa yang boleh memindahkan ke sini** — *Siapa pun yang bisa mengedit task*, atau *Reviewer, requester, lead tim, atau admin*. Pada pilihan kedua, assignee tidak bisa menutup pekerjaannya sendiri.

Default (**Fleksibel**): reviewer wajib sejak tahap review pertama; assignee boleh memindahkan task-nya sendiri sampai **Delivered**; **Done** dan **Declined** hanya reviewer, requester, lead tim, atau admin. Preset lain: **Review ketat** (semua tahap keputusan setelah review pertama hanya untuk reviewer) dan **Tanpa batasan**. Setiap tahap bisa diubah satu per satu.

Keluar dari tahap yang reviewer-only (mis. membuka lagi task yang sudah Done) butuh hak yang sama dengan masuk ke tahap itu (v34).

Aturan ditegakkan di server untuk drag di board, perubahan di drawer, aksi massal, dan API. Di board, kolom yang tidak boleh dituju tampil terkunci saat kartu diseret. Requester (pengaju request) boleh menerima pekerjaan (memindahkan ke Done) meski rolenya Viewer.

## 4. Mengelola anggota

### Lupa password (v29)

Anggota bisa mengatur ulang password sendiri lewat **Forgot password?** di layar masuk.
Tautan dikirim ke email akun, berlaku sekali, kedaluwarsa setelah `COS_RESET_MINUTES`
(default 60 menit), dan meminta tautan baru membatalkan yang lama. Setelah reset, semua
sesi orang itu diakhiri. Respons layar selalu sama, jadi tidak membocorkan email mana
yang terdaftar. Permintaan dibatasi per alamat dan per IP.

Tanpa SMTP, email reset hanya ditulis ke `data/outbox/*.eml`. Admin tetap bisa mereset
password dari **Members → ikon gembok**.

### Nonaktifkan vs hapus (v29)

**Deactivate** memblokir login dan mengakhiri sesi, tapi tugas, komentar, dan riwayat
tetap atas nama orang itu. **Reactivate** memulihkannya. Pakai ini untuk karyawan cuti
atau keluar; **Remove** memindahkan tugasnya ke kamu dan tidak bisa dibatalkan.

### Menambah orang

**Settings → Members → Add member**: **Full name**, **Email (used to sign in)**, **Role title**,
**Permission role**, **Capacity (h/wk)**, **Primary team**, dan — di mode server —
**Temporary password (min 12)** yang sudah terisi saran.

Setelah tersimpan, bagikan password sementara itu ke orangnya.

> **Tidak ada alur undangan email.** Dua cara onboarding: tambah manual seperti di atas,
> atau nyalakan self-registration dan bagikan **join code** dari
> **Settings → Workspace → Access**. Registrasi tertutup secara default.

### Kapasitas

Kolom **Capacity** (jam per minggu) yang menggerakkan angka utilisasi di layar Teams.
Viewer selalu `0`.

### Reset password

Baris anggota → reset. Password baru minimal 8 karakter.
**Seluruh sesi orang itu langsung dihapus.**

### Menghapus anggota

Task dan project-nya dialihkan ke admin yang melakukan penghapusan, keanggotaan tim dan
project dihapus, dan akunnya tidak bisa masuk lagi. Kamu tidak bisa menghapus dirimu sendiri.

> **Deaktivasi vs hapus.** Route deaktivasi berfungsi dan badge `deactivated` sudah dirender,
> tapi **belum ada tombolnya di UI Members** — satu-satunya aksi yang tersedia adalah hapus.
> Untuk menonaktifkan tanpa menghapus, panggil `POST /api/members/:id/active` langsung.

### Acting as / impersonation

Tersedia di menu akun, bagian **Switch user**, hanya untuk sesi admin.
Setiap request kemudian membawa header `x-act-as` dan **server tetap memeriksa izin** —
impersonation tidak melewati permission check.

Setiap request yang di-impersonate dicatat ke security log sebagai `admin_impersonation`
lengkap dengan id admin, id target, dan IP.

Di production fitur ini **mati** kecuali `COS_ALLOW_IMPERSONATION=1`.
Di luar production fitur ini menyala secara default.

---

## 5. Administrasi AI

**Settings → AI & integrations** punya enam sub-halaman:
**Overview**, **Models**, **Usage & Limits**, **Providers**, **Permissions**, **Data & Privacy**.

### Overview

Ringkasan satu layar: status Image generation, AI Intelligence, jumlah model aktif,
batas layer, batas history, dan batas gallery — masing-masing dengan tombol **Open**
ke halaman yang tepat. Di bawahnya ada panel **Resource usage**.

### Models — registry model

Ini adalah daftar model yang boleh dipakai anggota. **Anggota memilih berdasarkan nama tampilan
dan tidak pernah bisa mengetik model ID.** Server menolak ID mana pun yang tidak terdaftar di sini.

Registry bawaan:

| Nama tampilan | Model ID | Provider | Aktif | Default |
|---|---|---|---|---|
| GPT Image 2 | `gpt-image-2` | OpenAI | ya | **ya** |
| Nano Banana Pro | `gemini-3-pro-image` | Google Gemini | ya | |
| Fast Image | `gemini-2.5-flash-image` | Google Gemini | tidak | |

Field satu entri model: **Display name**, **Provider** (OpenAI / Google Gemini /
Magnific–Mystic / Anthropic / Custom endpoint), **Model ID** (wajib), saklar **Active**,
saklar **Default model**, dan daftar kemampuan:

| Kemampuan | Artinya bagi anggota |
|---|---|
| **Accepts a reference image** | boleh melampirkan gambar referensi |
| **Supports transparent background** | ada opsi latar transparan saat export |
| **Supports upscaling** | boleh menghasilkan di atas ukuran kanvas |

Rambu pengaman: entri terakhir tidak bisa dihapus, dan model aktif terakhir tidak bisa
dimatikan. Menonaktifkan sebuah model **tidak merusak pilihan yang sudah tersimpan** —
pilihan itu jatuh diam-diam ke model default.

### Usage & Limits

Nilai bawaan yang direkomendasikan:

| Batas | Default | Plafon sistem |
|---|---:|---:|
| Layer per desain | 40 | 150 |
| Layer gambar per desain | 10 | 50 |
| History generasi per anggota | 24 | 200 |
| Lebar / tinggi kanvas | 4096 | 4096 |
| Desain gallery per anggota | 30 | 500 |
| Desain baru per hari | 5 | 100 |
| Duplikasi per hari | 10 | 200 |
| Ukuran satu desain | 15 MB | 50 MB |
| Guide per desain | — | 100 |

Kolom plafon adalah batas keras: **admin boleh menurunkan sebuah batas sebebasnya,
tapi tidak pernah bisa menaikkannya melewati angka itu.**

Tombol **Reset to recommended** mengembalikan seluruh nilai ke default.

### Apa yang terjadi saat batas terlampaui

| Batas | Perilaku |
|---|---|
| Layer / layer gambar | penambahan ditolak dengan pesan yang menyebut angkanya; isi yang ada tidak tersentuh |
| Desain yang dibuat sebelum batas diturunkan | tetap bisa dibuka, diedit, dihapus layernya, diekspor, dan disimpan — **hanya penambahan yang dijeda** |
| History | dipangkas diam-diam ke N terbaru; **AI Gallery dan Assets tidak tersentuh** |
| Kuota total gallery | membuat baru / simpan-sebagai-baru / duplikasi diblokir; melihat, mengedit, mengunduh, memfavoritkan, mengarsipkan, dan menghapus tetap boleh |
| Kuota harian | diblokir sampai pergantian hari |
| Ukuran desain | ditolak server dengan HTTP 413 |

### Providers

Kunci API bersifat **write-only**: *"Leave blank to keep the existing key. To remove it, type: clear"*.
Kunci dienkripsi di server dan **tidak pernah dikirim balik ke browser**.

Ada juga **Brand default prompt** — teks yang disertakan pada setiap generasi AI Hub dan
hanya bisa diubah administrator.

### Permissions

Tiga saklar, dan urutannya penting:

1. **Allow external AI providers** — mati secara default. Selama mati, seluruh fitur AI
   yang memanggil provider luar tidak berjalan.
2. **Allow workspace context** — tidak bisa dinyalakan sebelum yang pertama menyala.
   Ini yang menentukan apakah data workspace boleh ikut dikirim bersama pertanyaan.
3. **Use external AI for report recommendations**.

Mematikan saklar pertama otomatis mematikan yang kedua.

### Data & Privacy

Catatan read-only tentang apa yang dikirim saat generasi gambar, apa yang dikirim saat
bertanya ke AI, apa yang tidak pernah dikirim, serta cap waktu dan nama orang yang
menyetujuinya. Cap ini ditulis server saat salah satu saklar di atas pertama kali dinyalakan.

### Batasan penegakan yang harus diketahui

Kuota AI Gallery (`maxDesignsPerUser`, `maxNewDesignsPerDay`, `maxDuplicatesPerDay`)
ditegakkan **di sisi browser saja** dan tersimpan di `localStorage`.
Hitungan harian berganti pada tengah malam **UTC**, bukan zona waktu anggota,
meskipun teks bantuan menyebut sebaliknya.

Batas yang benar-benar ditegakkan server: gambar tertanam harus PNG/JPEG/WebP dan
di bawah ~6 MB, satu desain di bawah ~9,5 juta karakter (HTTP 413), nama 1–120 karakter,
maksimum 8 tag, catatan ≤ 2000 karakter, maksimum 100 guide, plafon keras 500 layer,
dan setiap key field yang menyerupai kredensial (`api key`, `token`, `password`, `secret`)
ditolak dengan *"Credentials cannot be saved in AI Gallery."*

---

## 6. Email / SMTP

**Settings → Notifications & email**.

### Tujuh langkah

Saklar induk lebih dulu: **Send email through SMTP**.
Saat mati, ZenCrevia memakai transport yang dikonfigurasi di server.

1. **Choose a provider** — preset mengisi host, port, dan TLS, lalu menampilkan catatan khusus provider
2. **Server details** — Host, Port (default 587), dan **Use implicit TLS (port 465)**
3. **Credentials** — Username dan Password. Password dienkripsi di server dan tidak pernah
   dikirim balik; untuk menghapusnya, ketik `clear`
4. **Sender** — From name, From email, Reply-to
5. **Test the connection** — menyentuh server, menegosiasi TLS, dan login. **Tidak mengirim apa pun**
6. **Send a test email** — mengirim pesan uji sungguhan
7. Simpan lewat **Save SMTP settings**

### Preset provider

| Provider | Host | Port | Catatan |
|---|---|---:|---|
| Google Workspace / Gmail | `smtp.gmail.com` | 587 | Buat App Password — password akun biasa akan ditolak |
| Microsoft 365 | `smtp.office365.com` | 587 | Mailbox harus punya SMTP AUTH yang diaktifkan admin tenant |
| Amazon SES | `email-smtp.us-east-1.amazonaws.com` | 587 | Pakai kredensial SMTP SES, bukan AWS access key; samakan region dengan host |
| SendGrid | `smtp.sendgrid.net` | 587 | Username-nya harfiah `apikey`; passwordnya API key itu sendiri |
| Mailgun | `smtp.mailgun.org` | 587 | Pakai kredensial SMTP dari sending domain |
| Zoho | `smtp.zoho.com` | 587 | Aktifkan akses IMAP/SMTP di konsol admin Zoho dulu |
| Custom SMTP | — | 587 | |

Memilih preset **tidak menimpa** kredensial atau sender yang sudah kamu ketik.

### Test koneksi vs test kirim

**Test connection** hanya membuktikan bahwa host bisa dijangkau, TLS bisa dinegosiasi,
dan kredensial diterima. **Itu belum membuktikan email bisa terkirim.**
Kegagalan pengiriman yang paling umum adalah alamat pengirim yang domainnya belum
diverifikasi di provider — dan itu hanya terlihat lewat **Send test email**.

### Penyimpanan kredensial

Password SMTP dienkripsi AES-256-GCM dengan `COS_SECRET_KEY` dan disimpan dalam kolom
`workspaces.smtp_settings`. UI hanya menerima informasi bahwa password *ada* (`passSet`),
bukan isinya.

Kalau `COS_SECRET_KEY` belum diatur, muncul badge peringatan
*"Set COS_SECRET_KEY on the server to encrypt it at rest"*.

### Fallback environment

Kalau konfigurasi dashboard mati atau host-nya kosong, server memakai variabel environment:
`COS_MAIL_TRANSPORT` (`log` / `smtp` / `resend`), `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS`, `SMTP_SECURE`, `RESEND_API_KEY`, `MAIL_FROM`, `APP_URL`.

Transport `log` menulis file `.eml` ke `<COS_DATA_DIR>/outbox` — berguna untuk pengujian.

### Delivery log

Panel di bawah SMTP menampilkan email notifikasi terakhir dan apa yang terjadi padanya:
`N sent · M failed`, error terakhir, dan hingga 12 baris dengan badge **Sent** / **Failed**.

---

## 7. Backup & Data

**Settings → Backup & data**, enam sub-halaman: **Overview**, **Backup History**,
**Import / Export**, **Automatic Backups**, **Retention**, **Storage**.

Semua kecuali Import/Export membutuhkan server **dan** `COS_BACKUP_KEY` (minimal 32 karakter).
Tanpa itu muncul banner *Setup required*.

### Cara backup dibuat

1. `VACUUM INTO` sebuah file sementara — snapshot yang konsisten **tanpa menghentikan server**
2. Verifikasi: `PRAGMA integrity_check` harus `ok` dan minimal ada satu tabel
3. Enkripsi AES-256-GCM (kunci diturunkan dengan scrypt + salt acak per backup)
4. Tulis sidecar berisi metadata dan **SHA-256** dari file terenkripsi
5. Pangkas backup lama sesuai retention

Nama file: `zencrevia-[kind-]<timestamp>.db.enc`, mode `0o600`.
Jenis: `manual`, `scheduled`, `pre-restore`, `pre-import`.

### Backup History

Setiap baris menampilkan nama file, jenis, status integritas, waktu, ukuran, jumlah tabel,
pembuat, dan alasan — dengan tombol **Verify**, **Details**, dan **Restore**.

Badge integritas:

| Badge | Artinya |
|---|---|
| **Verified** | checksum cocok dengan yang dicatat saat backup dibuat |
| **Unverified** | backup dibuat sebelum pencatatan checksum ada |
| **Checksum mismatch** | file berubah setelah ditulis |
| **File missing** | file sudah tidak ada di disk |

### Restore lewat UI — jalur yang aman

Kamu harus mengetik nama file backup untuk mengonfirmasi. Urutannya:

1. Checksum diperiksa lebih dulu. **Backup yang rusak tidak pernah diterapkan.**
2. **Safety backup** dari database yang sedang berjalan dibuat. Kalau langkah ini gagal,
   seluruh operasi dibatalkan dan tidak ada yang tersentuh.
3. Backup didekripsi ke file sementara dan divalidasi — database live masih utuh di titik ini.
4. Handle SQLite aktif di-checkpoint lalu ditutup. Ini memungkinkan Windows menukar file tanpa
   error `EBUSY` dan dilakukan hanya setelah dua pengaman di atas berhasil.
5. File ditukar, diperiksa sekali lagi, lalu server membuka database hasil restore secara
   otomatis. Kalau langkah mana pun gagal, database sebelumnya dikembalikan dan dibuka lagi.

Restart manual tidak lagi diperlukan. Setelah operasi berhasil, gunakan **Muat ulang workspace**
agar layar membaca data hasil restore. Sesi login dapat meminta masuk ulang jika sesi tersebut
belum ada pada backup yang dipilih.

Safety copy (`pre-restore`, `pre-import`) **kebal terhadap retention pruning**.

### Restore lewat CLI

```bash
# hentikan server dulu
export COS_CONFIRM_RESTORE=YES
npm run restore -- /path/ke/zencrevia-....db.enc
```

Jalur CLI **berbeda** dari jalur UI dan lebih mentah:
tidak mengambil safety backup, tidak memeriksa checksum lebih dulu, dan tidak menulis
audit trail. Ia hanya memindahkan file live ke samping dan mengembalikannya kalau rename akhir gagal.
Karena itu ia mewajibkan `COS_CONFIRM_RESTORE=YES`.

**Untuk operasi normal, gunakan jalur UI.**

### Audit trail

`<COS_BACKUP_DIR>/restore-audit.json`, terbaru di atas, maksimum 200 entri, mode `0o600`.
Berisi waktu, hasil (`ok` / `failed`), nama backup, nama safety backup, user, pesan error,
dan flag `rolledBack`. UI menampilkan 8 terbaru; API mengembalikan 25.

Restore juga tercatat di security log sebagai `backup_restored` / `backup_restore_failed`.

### Retention

Berapa backup yang disimpan. Default 14, rentang 3–365.
Yang tertua dihapus setelah batas terlampaui — **kecuali** safety copy.

### Jadwal otomatis

Sejak v29 pilihan **Off / Daily / Weekly** di halaman Automatic Backups **menggerakkan
scheduler** (default Daily di production bila belum pernah disimpan). Scheduler memeriksa
tiap 10 menit dan menghitung jatuh tempo dari **Last automatic backup**, jadi restart tidak
mereset jadwal. Backup terjadwal tercatat `kind: scheduled` dan memakai retensi dashboard.

`COS_BACKUP_INTERVAL_HOURS` hanya dipakai sebagai override operator. Bila diisi, dashboard
menampilkan "diatur server" dan selector dikunci. Tanpa `COS_BACKUP_KEY` tidak ada backup sama sekali.

Jadwal juga hanya berjalan selama proses server hidup. Perlakukan sebagai kemudahan,
bukan jaminan — pasangkan dengan pemantauan di luar aplikasi.

### Storage

Menampilkan direktori backup, total ukuran, catatan tentang gambar AI Gallery, dan kolom
**Off-server copy**.

> Kolom **Off-server copy** hanyalah catatan teks. Tidak ada yang menyalin apa pun ke luar.
> Isi kolom itu supaya orang berikutnya tahu ke mana salinan kedua sebenarnya pergi.

### Import / Export JSON

Satu-satunya halaman yang bekerja tanpa server.
**Download JSON snapshot** selalu tersedia. **Load snapshot** hanya di mode standalone —
di mode server, database adalah sumber kebenaran dan restore JSON diblokir.

> Snapshot JSON **tidak pernah** memuat API key provider, kredensial SMTP, atau password anggota.

---

## 8. Google Drive

Gambar lokal disimpan sebagai preview berukuran terbatas. File asli, PDF, video, font, dan
dokumen lain memakai Google Drive.

Sembilan langkah:

1. Buat Google Cloud project.
2. Aktifkan **Google Drive API**. Tanpa ini sign-in berhasil tapi unggah dan baca tidak.
3. Konfigurasi OAuth consent screen; tambahkan tim sebagai **Test users** selama masih testing.
4. Buat OAuth client ID tipe **Web application**. Masukkan alamat dashboard **persis**,
   tanpa path, di **Authorized JavaScript origins**.
   Error `origin_mismatch` hampir selalu berarti alamat di browser tidak sama persis dengan daftar ini.
5. Siapkan folder tujuan. **Folder ID** adalah segmen URL setelah `/folders/`.
   Bagikan ke akun anggota atau ke Google Group perusahaan — **Editor** untuk yang mengunggah,
   **Viewer** untuk yang mereview.
6. Di ZenCrevia: **Settings → Cloud storage → Configure Google Drive**, tempel Client ID dan
   Folder ID, isi label akun, aktifkan unggah ke Drive, lalu **Save & sign in**.
7. Uji unggah dan preview dari bagian **Files** sebuah task.
8. Uji akses dengan akun Google anggota lain.
9. Putuskan aturan akses eksternal.

> **Akses ZenCrevia dan akses Google Drive terpisah.** Seseorang bisa membuka task tapi tidak
> bisa membuka file-nya kalau folder Drive belum dibagikan kepadanya.
>
> Folder ID secara teknis opsional, tapi mengosongkannya menaruh file di My Drive akun yang
> sedang login — tempat yang tidak bisa diakses siapa pun selain dia.
>
> **Anyone with the link** mati secara default. Menyalakannya membuat setiap unggahan **baru**
> bisa dibuka tanpa login. Jangan pakai untuk materi sensitif atau berlisensi.
> Lebih baik bagikan folder ke Google Group yang dikelola, lalu tambah/kurangi orang lewat grup itu.

---

## 9. Deployment

### Prasyarat

- **Node.js >= 22.13** — wajib, karena aplikasi memakai `node:sqlite` bawaan
- Tidak ada dependensi npm sama sekali
- Reverse proxy untuk terminasi HTTPS

### Menjalankan

```bash
cp .env.example .env      # lalu isi nilainya
npm start                 # http://localhost:3000
```

`npm start` membaca `.env` kalau ada. Kalau memakai secret manager atau process manager,
masukkan variabel yang sama tanpa file `.env`.

### Perilaku pertama kali

Database dibuat di `data/creative-os.db` saat pertama dipakai.
Nama file lama dipertahankan supaya pembaruan tidak memutus data yang sudah ada.

Kalau `COS_ADMIN_PASSWORD` belum diatur saat database baru dibuat, server menghasilkan
password acak dan **menampilkannya satu kali di console**:

```
Seeded ZenCrevia demo workspace → <DB_PATH>
Admin: admin@zencrevia.demo / <password>
Save this one-time generated admin password now; it is not written to a file.
```

Simpan saat itu juga. Password itu tidak pernah ditulis ke file dalam bentuk terbaca.

Anggota demo lain belum punya password sampai admin mengaturnya.

### Di mana file berada

| Apa | Lokasi |
|---|---|
| Database | `COS_DB_PATH`, default `<COS_DATA_DIR>/creative-os.db` |
| Backup + audit | `COS_BACKUP_DIR`, default `<COS_DATA_DIR>/backups` |
| Security log | `COS_SECURITY_LOG`, default `<COS_DATA_DIR>/security.log` |
| Outbox email (transport `log`) | `<COS_DATA_DIR>/outbox/*.eml` |
| Static | `public/`, plus `/shared/*` dari root repo |

### Memperbarui instalasi lama

1. Buat dan **verifikasi** backup terenkripsi (`npm run backup`)
2. Salin folder `data` dan konfigurasi environment ke tempat aman
3. Ganti file aplikasi
4. Start — migrasi menambahkan kolom baru secara otomatis
5. **Jangan** menjalankan `npm run seed` / `npm run reset` terhadap database yang sudah berisi data

### HTML standalone

`dist/creative-os-standalone.html` bisa dibuka langsung di browser dan memilih pengguna.
Ini tetap **mode demo**: perubahan task tidak tersimpan setelah reload.
Standalone tidak sinkron dengan server, dan angka analitiknya tidak harus sama dengan server
karena server punya riwayat contoh tambahan.

---

## 10. Environment variables

### Wajib diatur sebelum produksi

| Variabel | Fungsi | Nilai yang disarankan |
|---|---|---|
| `NODE_ENV` | menyalakan HSTS, memblokir demo reset, mematikan impersonation, mewajibkan Origin, menyembunyikan teks error internal | `production` |
| `COS_ADMIN_PASSWORD` | password admin saat seed; kalau kosong, dibuat acak dan ditampilkan sekali | nilai kuat dan unik, diatur **sebelum** start pertama |
| `COS_ADMIN_EMAIL` | email admin pertama (v29) | email kerja admin; default `admin@zencrevia.local` |
| `COS_ADMIN_NAME` | nama admin pertama (v29) | nama orangnya; default `Admin` |
| `COS_SECRET_KEY` | kunci enkripsi API key AI dan password SMTP. **Minimal 32 karakter** | 32+ karakter acak |
| `COS_BACKUP_KEY` | kunci enkripsi backup, sekaligus saklar on/off backup dan scheduler. **Minimal 32 karakter** | 32+ karakter acak, **berbeda** dari `COS_SECRET_KEY` |
| `APP_URL` | basis URL untuk tautan di email | URL HTTPS produksi |
| `COS_ALLOWED_ORIGINS` | allowlist Origin untuk request yang mengubah data | origin produksi yang persis |

### Akun dan sesi

| Variabel | Default | Fungsi |
|---|---|---|
| `COS_ALLOW_REGISTRATION` | `0` | `1` membuka self-registration |
| `COS_INVITE_CODE` | acak | join code awal |
| `COS_SESSION_HOURS` | `12` | umur sesi |
| `COS_SECURE_COOKIE` | — | `1` memaksa flag `Secure` |
| `COS_TRUST_PROXY` | — | `1` mempercayai `X-Forwarded-For` |
| `COS_ALLOW_IMPERSONATION` | `0` di production | `1` menyalakan act-as di production |
| `COS_LOGIN_WINDOW_MS` | `900000` | jendela rate limit login (minimal 60.000) |
| `COS_LOGIN_MAX_ATTEMPTS` | `5` | kegagalan sebelum terkunci (minimal 3) |
| `COS_LOGIN_MAX_KEYS` | `10000` | kapasitas peta rate limiter |
| `COS_RESET_MINUTES` | `60` | umur tautan lupa password (10–1440 menit, v29) |
| `COS_SEED_DEMO` | `0` di production, `1` di luar | `1` mengisi database kosong dengan workspace demo (v29) |

### Data, backup, log

| Variabel | Default | Fungsi |
|---|---|---|
| `PORT` | `3000` | port |
| `COS_DATA_DIR` | `./data` | akar untuk DB, backup, outbox, security log |
| `COS_DB_PATH` | `<DATA_DIR>/creative-os.db` | path file database |
| `COS_MAX_BODY_BYTES` | `12000000` | batas body request (minimal 1.000.000) |
| `COS_BACKUP_DIR` | `<DATA_DIR>/backups` | direktori backup |
| `COS_BACKUP_KEEP` | `14` | retention default (di-clamp 3–365) |
| `COS_BACKUP_INTERVAL_HOURS` | — | override jadwal backup; kosongkan agar mengikuti dashboard (v29) |
| `COS_SECURITY_LOG` | `<DATA_DIR>/security.log` | path security log |
| `COS_SECURITY_LOG_MAX_MB` | `10` | ukuran sebelum `security.log` dirotasi ke `.1` (v29) |
| `COS_SECURITY_LOG_KEEP` | `5` | jumlah file rotasi yang disimpan (v29) |
| `COS_OUTBOX_DAYS` | `14` | umur file `.eml` di outbox transport `log` (v29) |
| `COS_OUTBOX_MAX` | `1000` | jumlah maksimum file di outbox (v29) |
| `COS_TASK_HOT_DAYS` | `45` | task selesai lebih lama dari ini dikirim ringkas saat login dan dimuat lengkap saat dibuka (v29) |

### Email

| Variabel | Default | Fungsi |
|---|---|---|
| `COS_MAIL_TRANSPORT` | `log` | `log` / `smtp` / `resend` — hanya **fallback** kalau dashboard tidak dikonfigurasi |
| `MAIL_FROM` | — | pengirim fallback |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_SECURE` | — | SMTP fallback. **`SMTP_PASS` plaintext di environment** — lebih aman lewat dashboard |
| `RESEND_API_KEY` | — | hanya bila transport `resend` |

### AI

| Variabel | Fungsi |
|---|---|
| `COS_AI_ALLOWED_HOSTS` | hostname tambahan untuk allowlist endpoint AI. Isi **hanya setelah** meninjau provider dan ketentuan datanya |

Allowlist bawaan: `api.anthropic.com`, `generativelanguage.googleapis.com`,
`api.openai.com`, `api.magnific.ai`. Endpoint wajib `https:`.

### Darurat dan pengembangan — biarkan kosong di produksi

| Variabel | Fungsi |
|---|---|
| `COS_CONFIRM_RESET` | `YES` membuka seed/reset di production |
| `COS_CONFIRM_RESTORE` | `YES` diwajibkan oleh jalur restore **CLI** saja |
| `COS_DEMO_PASSWORD` | password bersama untuk anggota demo saat seed |
| `COS_ALLOW_MISSING_ORIGIN` | `1` mengizinkan request tanpa header Origin di production |
| `COS_DEV_HEADER_AUTH` / `COS_ALLOW_HEADER_AUTH` | `1` menyalakan auth lewat header `x-user-id`. Non-production saja |

---

## 11. Checklist produksi

> **v36:** langkah lengkap ada di `deploy/GO-LIVE.md`, dengan template `deploy/Caddyfile` dan `deploy/zencrevia.service`.
> Di production server **menolak start** (exit 78) selama `.env` masih berisi nilai placeholder dari `.env.example`
> (kunci enkripsi, password/email admin, `APP_URL`, `COS_ALLOWED_ORIGINS`), dan mencetak peringatan `[preflight]`
> untuk konfigurasi yang jalan tapi berisiko (email masih `log`, `COS_TRUST_PROXY` belum 1, `TZ` kosong).

- [ ] (v29) `COS_ADMIN_EMAIL` dan `COS_ADMIN_NAME` diisi sebelum start pertama; database kosong jadi workspace bersih
- [ ] (v29) SMTP dikonfigurasi. Tanpa SMTP, notifikasi **dan tautan lupa password** hanya ditulis ke `data/outbox`; Home menampilkan peringatan ke admin
- [ ] (v29) Pilih jadwal di **Settings → Backup & Data → Automatic Backups** dan pastikan **Last automatic backup** terisi setelah satu siklus

Sebelum server dijalankan pertama kali:

- [ ] Salin `.env.example` menjadi `.env`, atau siapkan variabel yang sama lewat secret manager
- [ ] Buat nilai acak **berbeda** untuk `COS_ADMIN_PASSWORD`, `COS_SECRET_KEY`, `COS_BACKUP_KEY` — masing-masing minimal 32 karakter
- [ ] `NODE_ENV=production`
- [ ] Terminasi HTTPS di reverse proxy; set `APP_URL` dan `COS_ALLOWED_ORIGINS` ke alamat produksi yang sebenarnya
- [ ] `COS_TRUST_PROXY=1` kalau memang di belakang proxy
- [ ] Biarkan `COS_ALLOW_REGISTRATION=0` dan `COS_ALLOW_IMPERSONATION=0` kecuali ada alasan operasional yang sudah ditinjau
- [ ] Simpan secret di secret manager atau environment server — **tidak pernah** di source, ZIP, database, atau chat tim
- [ ] Simpan password admin yang dihasilkan saat boot pertama, lalu ganti dengan yang permanen
- [ ] Verifikasi `COS_BACKUP_INTERVAL_HOURS` dan jalankan satu backup manual
- [ ] **Uji restore ke environment test** — bukan sekadar memverifikasi checksum
- [ ] Tinjau daftar model AI dan matikan yang tidak dipakai
- [ ] Biarkan **Allow external AI providers** mati sampai ketentuan data provider disetujui
- [ ] Konfigurasi SMTP, jalankan **Test connection** **dan** **Send test email**
- [ ] Bagikan folder Google Drive ke Google Group, pastikan **Anyone with the link** mati

Yang sudah aktif secara bawaan: password minimal 8 karakter dari tiga kelas karakter;
sesi 12 jam dengan token yang di-hash, `HttpOnly`, `SameSite=Lax`, `Secure` di production;
rate limit login dan registrasi; registrasi publik tertutup dengan join code acak;
request yang mengubah data harus datang dari origin aplikasi; security header dan security log;
provider AI eksternal dan pengiriman konteks workspace keduanya mati dan dinyalakan terpisah;
endpoint AI dibatasi HTTPS dan hostname yang di-allowlist; tautan publik Drive mati;
batas ukuran request; preview dibatasi PNG/JPEG/WebP; demo reset dan user switching mati di production.

---

## 12. Pemeriksaan rutin

**Mingguan**

- Tinjau `data/security.log` — perhatikan `login_failed` yang berulang dan `registration_rejected`
- Periksa panel **Delivery log** untuk kegagalan email
- Pastikan backup terakhir ada dan berstatus terverifikasi

**Bulanan**

- **Uji restore sungguhan di environment test.** Checksum yang lolos bukan bukti backup bisa didekripsi
- Nonaktifkan atau hapus anggota yang sudah keluar — sesinya langsung terhapus
- Tinjau daftar model AI dan pemakaian gallery

**Kuartalan**

- Rotasi password admin dan kunci provider sesuai kebijakan
- Audit izin folder Drive dan keanggotaan Google Group
- Tinjau definisi role terhadap struktur tim sekarang

---

## 13. Failure modes: kenali gejalanya

### `COS_SECRET_KEY` berubah atau hilang

Kunci enkripsi diturunkan langsung dari `COS_SECRET_KEY`. Semua nilai yang tersimpan
disegel dengan kunci lama, jadi dekripsi dengan kunci baru gagal pada auth tag.

**Gejala:** panggilan AI gagal; pengiriman SMTP gagal; tapi UI **tampak sehat** —
kolom password tetap menampilkan `•••• stored — leave blank to keep it` karena
sistem hanya tahu bahwa password *ada*, bukan bahwa ia bisa dibaca.

**Pemulihan:** masukkan ulang API key AI dan password SMTP.
Mengosongkan kolom **tidak** memperbaikinya — kolom kosong berarti "pertahankan yang tersimpan",
dan yang tersimpan itulah yang tidak bisa didekripsi.

Kalau kuncinya sekadar **hilang** (bukan berubah), pesan errornya eksplisit menyebut
`COS_SECRET_KEY`. Di luar production, kunci yang hilang membuat secret disimpan **plaintext**.

### `COS_BACKUP_KEY` hilang atau berubah

Kunci yang hilang atau terlalu pendek menghasilkan pesan yang sama:
*"COS_BACKUP_KEY must contain at least 32 characters"*.
Seluruh halaman Backup kecuali Import/Export menampilkan banner *Setup required*,
dan **scheduler tidak pernah start — tanpa baris log apa pun**.

Kalau kunci **diganti** setelah ada backup: file lama tetap terdaftar dan checksum-nya
tetap **verified**, karena checksum dihitung atas ciphertext. Tapi dekripsi akan gagal saat restore.

> **Ini hal terpenting yang harus dipahami operator: verifikasi yang lolos bukan bukti
> bahwa backup bisa didekripsi.** Hanya restore sungguhan yang membuktikannya.

### Restore gagal

Tiga kemungkinan, semuanya tercatat di audit trail:

1. **Ditolak sebelum apa pun terjadi** — pemeriksaan checksum awal gagal.
   Tidak ada yang tersentuh.
2. **Gagal sebelum penukaran** (dekripsi atau validasi gagal) — pesannya berakhir
   *"nothing was replaced; the safety backup is `<name>`."* Database live utuh.
3. **Gagal saat penukaran** — file sebelumnya dikembalikan, pesannya berakhir
   *"the previous database was rolled back."*

Dalam ketiga kasus, safety copy `pre-restore` tetap ada dan kebal terhadap pruning.

Kalau kamu melihat pesan *"Set COS_CONFIRM_RESTORE=YES before restoring a backup"*,
kamu sedang di jalur **CLI**, bukan UI.

### Test SMTP gagal

| Pesan | Kemungkinan penyebab |
|---|---|
| *"The server did not respond within 15 seconds…"* | host/port salah, atau egress diblokir firewall |
| balasan server dengan kode ≥ 400 | biasanya autentikasi — Gmail tanpa App Password, Microsoft 365 dengan SMTP AUTH mati, SendGrid dengan username selain `apikey` |
| error TLS | **Use implicit TLS (port 465)** dicentang untuk port 587 yang hanya STARTTLS, atau sebaliknya |
| **Send failed** meski Test connection lolos | alamat From bukan di domain yang sudah diverifikasi provider |

Ingat: `authenticated: true` hanya berarti username disediakan dan perintah AUTH tidak ditolak.
Verifikasi **tidak mengirim pesan** — hanya **Send test email** yang membuktikan deliverability.

### Host provider AI tidak di-allowlist

Pesan: *"The AI provider endpoint is not on the server allowlist"* (HTTP 400).
URL yang tidak valid memberi pesan berbeda: *"The AI provider endpoint is invalid"*.

Kegagalan lain pada jalur yang sama, berurutan:

1. *"External AI processing is disabled. An admin must enable it in Settings → AI."* (403)
2. *"No `<kind>` API key configured. Add one in Settings → AI."* (400)
3. *"No AI model is active. An admin must enable one in Settings → AI & Integrations → Models."*
4. *"That AI model is not available in this workspace."*

Perbaikannya: `COS_AI_ALLOWED_HOSTS=<hostname>` **plus restart server** —
`.env` hanya dimuat saat start.

### Role kehilangan capability sementara orangnya sedang login

**Tidak ada invalidasi sesi.** Orang itu tetap login dan masih memegang salinan definisi role
yang lama di browsernya sampai dia memuat ulang.

**Gejala:** tombol yang seharusnya sudah hilang masih tampak, tapi menghasilkan toast error
saat diklik — karena server sudah menolak.

**Solusi:** minta orang itu sign out lalu masuk lagi, atau sekadar refresh halaman.
Menghapus sebuah role menurunkan anggotanya ke Member di server, tapi pengguna lain
yang sedang login tetap memakai data lama sampai mereka reload.

---

## 14. Batasan yang perlu diketahui

Hal-hal berikut adalah kondisi aplikasi apa adanya. Didaftarkan agar tidak jadi kejutan
saat kamu menjelaskannya ke tim.

| Hal | Kondisi |
|---|---|
| Kuota harian AI Gallery | ditegakkan di browser (`localStorage`); sejak v29 berganti hari pada tengah malam **waktu lokal**. Kuota total per role ditegakkan server |
| Daftar AI Gallery (`GET`) | tidak memeriksa `view_ai_gallery` — setiap pengguna yang login bisa melihat daftarnya |
| Route saved-view | tanpa pemeriksaan capability |
| **Off-server copy** | hanya catatan teks; tidak menyalin apa pun |
| Prioritas task | tetap (Low / Medium / High / Urgent), tidak bisa dikonfigurasi |
| Warna tag | tidak ada, disengaja. Label punya warna, tag tidak |
| Undangan email | tidak ada. Tambah manual + password sementara, atau self-registration dengan join code |
| Layar Requests terpisah | tidak ada. Request adalah task biasa bertag `request` |
| Rate limit | login, registrasi, lupa password, reset password, dan notifikasi (v29). Belum ada rate limit untuk endpoint AI |
| Rate limiter | disimpan di memori proses: reset saat restart dan tidak dibagi antar-instance |
| Batas panjang teks (v31) | judul task 240, deskripsi 20.000, komentar 10.000, halaman Knowledge 200.000, nama proyek 160, nama tim 80 karakter; pesan chat dipotong di 4.000. Melewati batas → HTTP 413 |
| Integritas data task (v32) | Komentar, aktivitas, dan keputusan approval milik server: editor tidak bisa menulis ulang/menghapus komentar orang lain, memalsukan aktivitas, mengangkat diri jadi reviewer, atau menyetujui versi tanpa izin. POST create menolak ID yang sudah ada (409). |
| Edit bersamaan (v34) | Dua orang yang mengedit field berbeda pada task yang sama sama-sama tersimpan; perubahan dari salinan lama tanpa daftar field ditolak (409), tidak menimpa |
| Board live (v34) | Setiap perubahan task dikirim ke semua user yang sedang online; board, kalender, dan drawer ikut diperbarui tanpa reload |
| Admin terakhir (v34) | Admin terakhir tidak bisa menurunkan perannya sendiri; angkat admin lain dulu |
| Chat (v35) | Pesan maksimal 4.000 karakter (lebih dari itu ditolak, bukan dipotong); maksimal 30 pesan per 30 detik per orang (`COS_MSG_RATE_MAX`). Pesan yang gagal terkirim ditandai "Belum terkirim" dengan Coba lagi / Buang |
| 2FA / SSO | belum ada. Login memakai email + password; lupa password lewat email (v29) |

---

## Dokumen terkait

| File | Isi |
|---|---|
| `docs/DEVELOPER.md` | arsitektur, build, referensi API, skema database, konvensi kode |
| `docs/USER-MANUAL.md` | panduan pemakaian harian per layar |
| `SECURITY-SETUP.md` | checklist keamanan versi ringkas |
| `GOOGLE_DRIVE_SETUP.md` | langkah OAuth Google Drive versi panjang |
| `AUDIT.md` | catatan audit lengkap |
| `CHANGELOG-v16.md`, `CHANGELOG-v17.md` | riwayat perubahan |
| `LEGAL/` | draf EULA, kebijakan privasi, ketentuan layanan, pemrosesan data AI |

> Seluruh placeholder dalam tanda kurung siku di folder `LEGAL` wajib diisi dan ditinjau
> penasihat hukum sebelum dipublikasikan.
