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
   - [5b. Smart Scoring](#5b-smart-scoring-oktober-2026)
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

### Izin tambahan per orang (Oktober 2026)

Untuk memberi seseorang izin di luar role-nya **tanpa mengganti role** (misalnya seorang Member
yang sementara mengurus template AI Hub): **Settings → Members** → chip **Izin tambahan** di bawah
role orang itu. Centang izin yang ditambahkan; izin yang sudah dimiliki role-nya tampil terkunci
dengan tanda *dari role*. **Berlaku sampai** opsional — setelah tanggal itu lewat, semua izin
tambahan orang itu berhenti sendiri; kosong berarti berlaku sampai dicabut (**Hapus semua**).

- Hanya pemegang **Create and edit roles** yang bisa memberi, tidak untuk diri sendiri, tidak untuk
  Admin (sudah punya semua), dan tidak untuk orang dengan role ber-rank lebih tinggi.
- **Roles & permissions** menampilkan daftar *Izin tambahan*: siapa, izin apa, sampai kapan.
- Server menggabungkan izin tambahan dengan izin role setiap kali menilai izin; tercatat di
  activity dan security log.

### Permission template AI Hub (Oktober 2026)

Dua izin terpisah di grup **AI Hub & gallery**:

- **Save AI Hub canvases as templates for everyone** — template untuk semua orang (juga mencakup
  template pribadi).
- **Save AI Hub canvases as templates for themselves** — template yang hanya terlihat pembuatnya.
  Diberikan sekali ke semua role yang punya *Open AI Hub*; setelah itu diatur per role.

Pembuat template mengubah atau menghapus miliknya sesuai izin di atas; admin bisa semua template,
termasuk template bawaan.

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

**Aset dihasilkan, per orang** (Oktober 2026) — di bawah daftar tim. *Team lead ikut terhitung dari
aset timnya* (default) memberi lead angka **Tim** di samping angkanya sendiri dan kolom **Team assets
(as lead)** di sheet Workload; *Per anggota saja* mematikannya. Team lead juga memvalidasi angka per
orang di task (**Setujui jumlah**); server yang mencatat siapa dan kapan, dan hanya lead tim terkait
atau admin yang bisa.

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

### Chat models — model chat tanpa coding (Oktober 2026)

Di halaman **Models** yang sama, di bawah model gambar dan Generative Expand, ada bagian **Chat models**:
daftar model chat yang dipakai fitur AI teks. Memasang model baru — GPT-6 Luna, Claude, Gemini, model
OpenRouter, dan lain-lain — **tidak perlu coding**: pilih preset provider, ketik model ID, simpan, klik
**Test**.

**Entri pertama: Workspace connection.** Koneksi chat di **Providers** (kartu *AI Intelligence — chat model*)
otomatis menjadi entri pertama dan dipakai untuk semua fitur. Provider, endpoint, model, dan kuncinya tetap
diubah di **Providers** (entri ini membacanya, tidak menyalin); nama, saklar, catatan, dan pengaturan
**Advanced**-nya diubah di sini. Migrasinya berjalan sekali saat server start (penanda `ai_chat_models` di
`app_meta`, dalam satu transaksi) dan **tidak mengubah apa pun yang dikirim ke provider**. Workspace yang
belum dimigrasi (misalnya hasil restore backup lama) tetap bekerja persis seperti dulu lewat koneksi Providers.

**Menambah model** — klik **Add chat model**:

1. **Provider** dulu — presetnya mengisi endpoint dan format: OpenAI, OpenAI — Responses API, Anthropic
   (Claude), Google Gemini, OpenRouter, Groq, DeepSeek, Mistral, xAI (Grok), Together AI, Azure OpenAI,
   SumoPod, Custom.
2. **Display name** — nama yang dilihat admin (kosong = model ID).
3. **Model ID** — persis seperti di daftar model provider (huruf, angka, `. _ : / @ + -`, tanpa spasi).
4. **Endpoint** — terisi dari preset; hanya `https://`. Alamat tidak boleh membawa kunci (`?key=…`) atau
   `user:pass@` — kunci selalu di field API key.
5. **API key** — *write-only*, disimpan terenkripsi (`COS_SECRET_KEY`), tidak pernah dikirim balik ke browser.
   Kosong = kunci yang sudah tersimpan dipertahankan; bila belum ada, dipakai kunci yang tersimpan **untuk host
   yang sama** (koneksi Providers, atau model chat lain di host itu). Kunci tidak pernah dikirim ke host lain.
   Ketik `clear` untuk menghapus kunci tersimpan.

Contoh pengisian:

| Model | Preset | Model ID | Endpoint (dari preset) | API key |
|---|---|---|---|---|
| GPT-6 Luna | OpenAI | `gpt-6-luna` | `https://api.openai.com/v1/chat/completions` | kosongkan bila koneksi Providers sudah memakai kunci OpenAI |
| Claude | Anthropic (Claude) | `claude-sonnet-4-6` | `https://api.anthropic.com/v1/messages` | kunci Anthropic (`sk-ant-…`) |
| Gemini | Google Gemini | `gemini-3.5-flash` | `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` (`{model}` diganti otomatis) | kunci Google AI (`AIza…`) |
| Model OpenRouter | OpenRouter | `anthropic/claude-sonnet-4.6`, `openai/gpt-6-luna`, … | `https://openrouter.ai/api/v1/chat/completions` | kunci OpenRouter, sekali saja — model OpenRouter berikutnya boleh dikosongkan |

Untuk GPT-6 Luna cukup: **Add chat model** → Provider **OpenAI** → Model ID `gpt-6-luna` → **Save** →
**Test** → di **Used for**, pilih *GPT-6 Luna* untuk fitur yang diinginkan. Field token-nya otomatis
`max_completion_tokens`.

**Advanced** — biarkan *Auto* kecuali hasil **Test** menyarankan lain. Semua yang *Auto*/kosong mengirim
persis seperti sebelum fitur ini ada.

| Field | Artinya |
|---|---|
| **Format** | Bentuk request: *Chat Completions*, *Responses (OpenAI)*, *Anthropic Messages*, *Gemini generateContent*. Auto = dibaca dari endpoint. Format yang dipilih juga melengkapi alamat dasar (mis. `…/v1` → `…/v1/responses`). |
| **Token field** | `max_tokens`, `max_completion_tokens` (model reasoning: seri o, GPT-5, GPT-6, dan sesudahnya), `max_output_tokens` (Responses API). Auto = dari nama model. Berlaku untuk format gaya OpenAI; Anthropic selalu `max_tokens`, Gemini `maxOutputTokens`. |
| **Max output tokens** | 64–128 000. Kosong = 1500, atau 4000 untuk model reasoning. |
| **Reasoning effort** | none / minimal / low / medium / high. Hanya dikirim bila bukan Auto: `reasoning_effort` (Chat Completions) atau `reasoning.effort` (Responses API). Untuk Anthropic/Gemini pakai Extra parameters. |
| **Temperature** | 0–2. Kosong = tidak dikirim (default provider) — model reasoning menolak temperature. |
| **Extra parameters (JSON)** | Satu objek JSON yang digabung **terakhir** ke setiap request, mis. `{"top_p": 0.9}`, atau untuk Gemini `{"generationConfig": {"thinkingConfig": {"thinkingBudget": 0}}}`. Nilai `null` menghilangkan field dari request (mis. `{"max_tokens": null}`). Key yang membentuk request — `model`, `messages`, `input`, `instructions`, `stream`, `tools`, `system`, `contents`, dan sejenisnya — ditolak. Maksimal 4000 karakter, 6 tingkat, 60 key; divalidasi saat diketik. |

**Test** — tombol di tiap baris mengirim prompt kecil ("Reply with the single word: ready") dengan pengaturan
entri itu sendiri, lalu menampilkan di bawah baris: berhasil/gagal, waktu (ms), model, token in → out,
cuplikan jawaban (≤ 120 karakter), dan field yang dikirim. Bila gagal, error provider diterjemahkan menjadi
petunjuk, dan bila bisa ada **perbaikan satu klik** (disimpan ke entri lalu dites ulang):

| Error dari provider | Petunjuk / tombol |
|---|---|
| `Unsupported parameter: 'max_tokens' … Use 'max_completion_tokens'` | **Use max_completion_tokens** |
| kebalikannya | **Use max_tokens** |
| `temperature … not supported`, `Only the default (1) value is supported` | **Clear the temperature** |
| `reasoning_effort` tidak dikenal | **Set the reasoning effort to Auto** |
| `Unsupported parameter: 'messages'` (endpoint Responses API) | **Set the format to Responses** |
| `… 200000 > 64000, which is the maximum` / `supports at most N` | **Set max output tokens to N** |
| sebuah extra parameter ditolak | **Remove …** |
| model not found / does not exist | **Check the model ID** (membuka field-nya) |
| 401 / API key tidak valid | **Change the key** |
| host tidak ada di allowlist | penjelasan `COS_AI_ALLOWED_HOSTS` (lihat bawah) |
| 429, 5xx, timeout, halaman HTML, host tak terjangkau | apa yang perlu dicek |

Maksimal 10 tes per menit per admin. Hasil tes terakhir tersimpan di entri (*Last test passed / failed*).
Tes untuk Workspace connection sama dengan **Save & test connection** di Providers, dan hasilnya tampil di
kedua tempat. Kunci yang terulang di pesan error provider disamarkan (`[key]`).

**Allowlist host.** Server hanya mengirim kunci AI ke provider yang dikenal (OpenAI, Anthropic, Gemini,
OpenRouter, Groq, DeepSeek, Mistral, xAI, Together, SumoPod, Perplexity, Fireworks, Cerebras, Moonshot,
Cohere) dan resource Azure OpenAI. Host lain — misalnya LLM internal — harus ditambahkan admin server ke
`COS_AI_ALLOWED_HOSTS` (dipisah koma) lalu **restart server**. Ini **tidak bisa** diizinkan dari browser;
baris model dengan host yang belum diizinkan diberi tanda *Host not allowed on this server*.

**Used for** — di bawah daftar, model mana yang menjawab tiap fitur:

| Fitur | purpose |
|---|---|
| AI Intelligence chat | `intelligence` |
| Smart Scoring AI suggestions | `scoring` |
| Effort estimate on Create | `estimate` |
| Brief refine (AI Hub) | `brief` |
| Report summary | `report` |

Selain AI Intelligence, defaultnya **Same as AI Intelligence** (ikut model AI Intelligence). Browser hanya
mengirim *purpose* ke `/api/ai/chat` — tidak pernah model ID atau endpoint; server yang memilih modelnya.
Purpose yang tidak dikenal dijawab model AI Intelligence.

**Rambu pengaman.** Model aktif terakhir tidak bisa dimatikan atau dihapus. Mematikan atau menghapus model
yang sedang dipakai membuat fiturnya kembali ke model AI Intelligence, dan layar menyebutnya
("Now using … / Sekarang memakai …"). Bila model AI Intelligence sendiri yang dihapus, model aktif pertama yang
tersisa mengambil alih. Workspace connection boleh dikeluarkan dari daftar (kuncinya tetap menjadi kunci
bersama untuk host yang sama) dan dikembalikan lewat **Add the Providers connection**. Maksimal 30 model.

**Siapa.** Yang memegang `manage_workspace` (sama dengan tab AI). Anggota lain hanya menerima nama model dan
apakah model itu siap — tanpa endpoint, model ID, catatan, atau pengaturan.

**Di server.** Disimpan di `workspaces.ai_settings` sebagai `chatModels` dan `chatUse`; ditulis hanya lewat
`GET/POST /api/ai/chat-models`, `PUT/DELETE /api/ai/chat-models/:id`, `POST /api/ai/chat-models/:id/test`, dan
`PUT /api/ai/chat-use` (simpan Settings biasa tidak bisa mengubahnya). Setiap request tetap melewati pemeriksaan
yang sama: pemrosesan AI eksternal menyala, ada kunci, `https`, dan host di allowlist.

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

Kartu **AI Intelligence — chat model** adalah *Workspace connection* di **Models → Chat models**: model chat
lain ditambahkan di sana, dan di sana pula dipilih model mana yang dipakai tiap fitur (lihat
[Chat models](#chat-models--model-chat-tanpa-coding-oktober-2026)). **Save & test connection** di sini selalu
menguji koneksi ini sendiri, model mana pun yang sedang dipakai AI Intelligence.

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

## 5b. Smart Scoring (Oktober 2026)

Smart Scoring menilai pekerjaan dengan angka yang bisa dijelaskan: estimasi jam, Story Points, Weighted Points,
poin aset, KPI/OKR, dan bonus efisiensi kecil untuk task yang selesai lebih cepat dari estimasi yang sudah dikunci.
Semuanya **OFF** sampai admin menyalakannya. Selama OFF, aplikasi berjalan persis seperti sebelumnya. Kalau
dimatikan lagi, semua angka, riwayat, dan audit tetap tersimpan.

### Menyalakan

**Settings → Smart Scoring** (tepat setelah Automation). Tab ini dibagi menjadi tujuh kelompok, berupa deretan tab di
atas isinya seperti di AI & integrations (di tablet dan HP menjadi deretan chip yang bisa digeser), dan hanya satu
kelompok yang tampil sekaligus:

| Kelompok | Isinya |
|---|---|
| **Ringkasan** | switch utama dan statusnya, "Cara kerja Smart Scoring" (Estimasi → Setujui & kunci → Catat waktu → Review & poin), kartu tiap modul (switch, mode, apa fungsinya, apa yang dilihat orang, tombol **Atur →** ke kelompoknya), metrik kapasitas utama |
| **Estimasi** | Jenis pekerjaan (kata di judul, jam, poin aset per jenis), Effort Hours, Story Points, Weighted Points |
| **Output & target** | poin aset (hitung sebelum divalidasi, poin bila jenis tidak dikenali), KPI dan OKR |
| **AI** | kapan AI memberi saran, kuota, batas keyakinan, task serupa sebagai contoh; model yang menjawab dipilih di Settings → AI & integrations → Models → Chat models |
| **Review & bonus** | kebijakan perubahan manual, bonus efisiensi |
| **Akses & visibilitas** | siapa yang melihat bar di layar Teams, siapa memegang izin Smart Scoring, tombol delegasi ke lead |
| **Riwayat** | 20 penyimpanan terakhir: siapa, kapan, dan tiap kolom dari → ke |

Kelompok yang dipilih ada di alamat halaman (misalnya `/settings/scoring/estimating`), jadi link langsung membuka
kelompok itu dan tombol Back/Forward browser berpindah antarkelompok; kelompok terakhir diingat per orang di perangkat
itu. Angka teknis (pengali, batas, bobot, ambang, skala) ada di lipatan **Lanjutan** yang tertutup secara default;
lipatan yang dibuka juga diingat per orang. Setiap bagian punya satu kalimat penjelasan dan satu **Contoh**. Kalau
modulnya mati, bagiannya tetap bisa diisi (tampil redup) dengan tombol **Nyalakan**.

Tidak ada lagi tombol Save per panel: begitu ada perubahan, muncul **satu bar di bawah layar** ("N perubahan belum
disimpan · Buang · Simpan"). Perubahan tetap tersimpan sementara saat berpindah kelompok atau tab Settings; **Buang**
mengembalikan nilai yang tersimpan; keluar dari Settings dengan perubahan yang belum disimpan memunculkan pertanyaan
"Keluar tanpa menyimpan?". Pemegang `scoring_view_analytics` saja melihat semuanya dalam mode baca (tanpa bar Simpan).

1. Di **Ringkasan**, nyalakan **switch utama**.
2. Pilih modul yang dipakai. Masing-masing punya switch sendiri:

| Modul | Isinya | Default |
|---|---|---|
| Effort Hours | estimasi jam dari jenis pekerjaan × jumlah deliverable (Assets produced) × kompleksitas × dependency; jam aktual dari **log waktu** | ON (di dalam switch utama) |
| Story Points | rating 1–5 untuk kompleksitas, scope, ketidakpastian, dependency → 1, 2, 3, 5, 8, 13 (13 = saran dipecah) | OFF |
| Weighted Points | rating yang sama, dibobot 40/30/20/10% → skala 1–10 | OFF |
| Assets produced | poin output per orang dari jumlah asetnya, per jenis pekerjaan (1 post feed = 1 poin, resize 0,25, reels 3, logo 5) | OFF |
| KPI / OKR | dua switch terpisah: KPI, serta Objective dengan Key Result | OFF |

3. Untuk tiap modul, pilih mode: **Math only**, **AI-assisted**, atau **Hybrid**. Hitungan matematis selalu ada
   sebagai cadangan.
4. Atur angka-angkanya lewat **Atur →** di kartu modul atau menu kiri: jenis pekerjaan (di bawah) dengan jam dan poin
   asetnya, pengali kompleksitas dan dependency, ambang Story Points, bobot faktor (harus total 100% — kalau tidak,
   Simpan membawamu ke bobot yang salah), dan kebijakan AI serta perubahan manual. Lalu **Simpan** di bar bawah.

Setiap simpan diberi nomor versi. Kalau orang lain menyimpan lebih dulu, simpananmu ditolak, versi mereka dimuat,
dan kamu diminta mengulang perubahan. Riwayat 20 perubahan terakhir ada di kelompok **Riwayat**.

### Jenis pekerjaan (Oktober 2026)

Bagian **Kinds of work / Jenis pekerjaan** di tab Smart Scoring (kelompok **Estimasi**) berisi daftar jenis pekerjaan workspace. Jenis
pekerjaan sebuah task menentukan jam estimasinya saat task dibuat (**juga saat Smart Scoring OFF**), hitungan Effort
Hours, dan poin aset.

Tiap jenis tampil sebagai **satu baris ringkas**: nama (dengan nama Indonesianya kecil di samping), beberapa kata kunci
(+N kalau lebih), jam pertama, poin per aset, tanda Built-in, switch, dan tombol **Edit**. Klik **Edit** (atau baris
itu) untuk membuka isiannya di tempat. Low, High, dan Each next ada di lipatan **More**. Beberapa baris boleh terbuka
sekaligus. Di atas daftar ada **Try a title** (ketik judul → jenis yang terdeteksi) dan **Find a kind**, yang muncul
kalau jenisnya lebih dari 8 dan menyaring baris menurut nama atau kata kunci. Jenis yang dimatikan tetap di tempatnya
dengan warna redup, karena urutan menentukan deteksi. Pemegang izin analytics melihat tombol **View** dengan semua
isian terkunci. Isian yang ada di dalam satu baris:

| Kolom | Isinya |
|---|---|
| Name / Name in Indonesian | nama jenis dalam bahasa Inggris dan Indonesia |
| Words in the title | kata kunci, dipisah koma, misalnya `podcast, siniar` |
| First (h), Low (h), High (h) | jam untuk deliverable pertama dan rentang lazimnya |
| Each next (× first) | porsi tiap deliverable berikutnya (resize 0,25; kebanyakan pekerjaan 0,5; 1 = dihitung penuh) |
| Points per asset | poin per aset yang dihasilkan (0–20) |
| switch | ON/OFF; jenis yang OFF tidak pernah dikenali dan tidak bisa dipilih |

Cara jenis pekerjaan dikenali:
- Daftar diperiksa **dari atas ke bawah**; jenis pertama yang kata kuncinya ada di judul yang dipakai. Urutan diubah
  dengan tombol ↑ ↓ (yang lebih spesifik di atas, misalnya karosel sebelum post feed).
- Kata kunci dicocokkan sebagai **kata utuh**, huruf besar atau kecil tidak berpengaruh, bahasa Inggris atau
  Indonesia. `copy` tidak cocok dengan "copywriter". Akhiri kata dengan `*` agar bentuk yang lebih panjang ikut
  cocok: `video*` cocok dengan "videos" dan "videografi" (minimal 3 huruf sebelum `*`).
- Kata kunci adalah teks biasa, bukan regex. Maksimal 50 jenis, 40 kata kunci per jenis, 40 karakter per kata kunci.
- Orang yang bisa mengedit task bisa **memilih jenisnya sendiri** di baris Effort task (dan di baris jam Scoring &
  Intelligence). Pilihan itu selalu menang atas kata kunci.
- Kotak **Try a title / Coba sebuah judul** di bawah daftar langsung menunjukkan jenis yang dikenali, misalnya
  "Detected: Podcast (keyword "podcast")", memakai daftar yang sedang diedit (belum disimpan).

14 jenis bawaan (carousel, story, reels, video, KV, resize, feed, poster, banner, copy, deck, logo, web, email) bisa
diubah nama, kata kunci, dan angkanya, dan bisa dimatikan, tetapi **tidak bisa dihapus**. Jenis buatan sendiri
(**Add kind of work**) bisa diubah dan dihapus. Jenis baru belum punya jam sampai **First (h)** diisi (Low/High
otomatis ½× dan 1½× bila dikosongkan); poin asetnya mulai dari poin "jenis tidak dikenali". Menghapus jenis buatan
sendiri juga menghapus jam dan poinnya; task yang memilihnya secara manual kembali dikenali dari judulnya, dan hal itu
tercatat di riwayat skor task tersebut.

Contoh: jenis "Podcast" dengan kata kunci `podcast, siniar`, First 3 jam, 2 poin per aset → task baru "Siniar HSB eps
4" langsung mendapat estimasi 3 jam.

### Siapa boleh apa

Ada delapan izin di **Roles & permissions → Smart Scoring**, dan juga di izin tambahan per orang:

| Izin | Untuk |
|---|---|
| `scoring_manage_workspace` | mengatur Settings → Smart Scoring |
| `scoring_manage_project` | (disiapkan; pengaturan per project menyusul) |
| `scoring_approve_estimate` | approve & kunci estimasi, re-baseline |
| `scoring_edit_task` | mengubah angka yang sudah dikunci, membetulkan log waktu orang lain (wajib alasan) |
| `scoring_request_ai` | meminta saran AI |
| `scoring_approve_completion` | approve/reject bonus efisiensi |
| `scoring_manage_outcomes` | membuat KPI/OKR dan mengisi nilai manual (wajib alasan) |
| `scoring_view_analytics` | melihat angka seluruh tim di Analytics |

Default-nya hanya Admin. Tombol **Beri izin ini ke Team Lead dan Creative Lead** di tab Smart Scoring (kelompok
**Akses & visibilitas**) menambahkan tiga izin itu
(approve estimasi, approve bonus, analytics) ke kedua role tersebut dalam satu klik.

Pemisahan tugas berlaku untuk semua orang, admin juga:
- yang ditugaskan di task tidak bisa meng-approve estimasinya sendiri;
- yang ikut mengerjakan tidak bisa meng-approve bonusnya sendiri;
- tidak ada approval saat sedang *acting as* orang lain.

Role yang bisa mengubah sekaligus meng-approve skor diberi peringatan di editor role.

### Estimasi, kunci, dan log waktu

- Sebelum dikunci, estimasi boleh diubah oleh siapa pun yang bisa mengedit task (tercatat "manual").
- Setelah di-**Approve & lock**, hanya pemegang `scoring_edit_task` yang bisa mengubahnya, lewat semua jalur:
  drawer, grid, restore riwayat. Kalau scope berubah (jumlah deliverable, brief, dependency), statusnya menjadi
  "Re-baseline needed".
- Kalau pekerjaan sudah mulai sebelum di-approve, angkanya dibekukan sebagai baseline yang belum di-approve. Baseline
  seperti ini tidak bisa mendapat bonus.
- Selama Effort Hours ON, **Actual** dihitung dari log waktu: kerja + revisi, dibulatkan ke 15 menit. Waktu
  terblokir tidak dihitung. Angka Actual lama disimpan sebagai entri lama yang belum terverifikasi.

### Bonus efisiensi

Bonus dinyalakan di bagian **Efficiency bonus** pada tab yang sama. Contoh hitungannya ikut berubah langsung saat
angkanya diketik. Rumus bawaan dari spec:

- hemat waktu di bawah 10% tidak mendapat bonus;
- di atasnya, bonus = 0,5 × penghematan, maksimal 20% dari base point;
- tidak pernah negatif;
- kalau aktual kurang dari 40% estimasi, task ditandai untuk ditinjau.

Contohnya: estimasi 8 jam, aktual 5 jam, base 8 poin → bonus +1,10 → total 9,10.

Syarat sebuah task mendapat bonus:
- estimasinya dikunci dan di-approve oleh orang lain setelah bonus dinyalakan;
- jam tercatat lewat log waktu, bukan angka lama;
- task selesai, dan versi terakhirnya di-approve oleh orang yang tidak ikut mengerjakan;
- scope-nya tidak berubah.

Pemegang `scoring_approve_completion` yang tidak ikut mengerjakan mendapat notifikasi saat ada bonus yang menunggu
review. Bonus dibagi menurut jam masing-masing orang di log waktu, dan approver boleh mengubah pembagiannya dengan
alasan. Bonus tidak berlaku mundur.

Bonus ini **angka operasional, bukan kompensasi atau ranking**.

### KPI dan OKR

Didefinisikan di bagian **KPIs and OKRs** pada tab yang sama. Progress hanya naik dari bukti:
- jumlah aset yang sudah **divalidasi lead** pada task yang selesai;
- jumlah task yang selesai;
- nilai manual, yang wajib disertai alasan.

Task yang dibuka ulang atau validasi yang dicabut membatalkan hitungannya. AI tidak pernah mengisi progress.

### Saran AI

Saran AI memakai koneksi chat AI yang sama dengan AI Intelligence, dan mengikuti switch **external processing**
serta **workspace context** di Settings → AI. Kuota harian per orang dan per workspace diatur di tab Smart Scoring,
kelompok **AI**, begitu juga AI saat task dibuat dan AI saat brief direvisi besar.

Saran yang jauh dari hitungan diberi peringatan dan butuh alasan untuk dipakai. AI tidak pernah mengunci,
meng-approve, atau memberi bonus.

**Konteks tim untuk AI.** Di panel Scoring & Intelligence, tim bisa menandai asumsi AI sebagai benar atau salah
(dengan koreksinya) dan menulis catatan sampai 1.000 karakter. **Send & ask again** menyimpannya lalu bertanya ulang
(memakai satu jatah Ask AI).

- Konteks disimpan **per task** di tabel `scoring_ai_context`, bukan di data task. Akibatnya, menduplikasi task tidak
  menyalinnya. Menghapus task secara permanen ikut menghapusnya, sedangkan trash/restore tetap menyimpannya.
- Catatan dari task serupa (paling banyak 3) ikut dikirim. Ini mengikuti pengaturan **task serupa sebagai contoh** di
  kelompok **AI** dan switch **workspace context** di Settings → AI: catatan tidak dikirim kalau switch itu OFF atau
  pilihannya "none"; dengan "team", hanya dari tim task itu. Catatan dari draft tidak pernah dikirim.
- Biayanya kecil: biasanya sekitar **+300 token** per Ask AI, paling banyak sekitar 1.500 token.
- Yang boleh mengubah: siapa pun yang boleh mengedit task, kecuali stakeholder. Yang bisa melihat skor task bisa
  membacanya.

**Dokumen di brief.** Di kelompok **AI**, bagian **AI suggestions**, switch **Let the AI read documents in the brief**
(Izinkan AI membaca dokumen di brief) — **OFF secara default**. Kalau ON, saat AI ditanya ia juga membaca dokumen yang
ditautkan di brief atau dilampirkan ke task, untuk menilai cakupan pekerjaan. Contoh: brief yang menautkan deck Google
Slides yang dibagikan ke "Anyone with the link" — AI membaca slide-nya.

- Yang dibaca: Google Docs, Slides, Sheets, dan file Drive yang dibagikan ke **"Anyone with the link"**, serta file
  PDF, Word, PowerPoint, dan teks yang dilampirkan ke task dan tersimpan di server ini.
- **Dokumen Google yang privat tidak dibaca** — ZenCrevia tidak masuk ke akun Google siapa pun. Di panel task, chip
  dokumen itu bertuliskan "not shared publicly". Jalan keluarnya: ubah aksesnya di Google ke **Anyone with the link**
  (Viewer), atau unduh filenya dan lampirkan ke task.
- Di bawahnya, **Document text per Ask AI** (Teks dokumen per Ask AI): 5.000, 15.000 (default), atau 30.000 karakter
  — kira-kira 1,5, 5, atau 10 halaman. Teks lebih banyak bisa membuat saran lebih akurat, tapi memakai lebih banyak
  kredit AI per Ask AI; beberapa dokumen berbagi jatah ini sama rata. Pilihan ini nonaktif selama switch-nya OFF.
  Paling banyak 5 dokumen dibaca per Ask AI; satu dokumen paling besar 5 MB (file di server 15 MB).
- Keduanya disimpan lewat bar **Save** seperti pengaturan lain dan tercatat di **History**.
- Selama **external processing** di Settings → AI → Permissions OFF, keduanya nonaktif dengan penjelasan dan tombol
  **Open AI permissions**: tidak ada dokumen yang bisa dikirim ke AI.
- Tiap task bisa dikecualikan dari panel Scoring & Intelligence-nya (sakelar **Use this task's documents**), oleh
  siapa pun yang boleh mengedit task itu.

### Bar di layar Teams

Selama Smart Scoring ON, layar Teams menampilkan bar kecil di bawah bar utilisasi (4 minggu terakhir): poin selesai
dibanding poin yang direncanakan untuk tiap modul poin yang ON, dan akurasi estimasi. Bar tim terlihat oleh semua
anggota (bukan stakeholder). Siapa yang melihat **bar per orang** diatur di bagian **Teams screen** pada tab yang
sama, kelompok **Akses & visibilitas**: **Dirinya sendiri, lead timnya, dan pemegang analitik** (default, `teams.memberBars: "self_and_leads"`) atau
**Semua orang di workspace** (`"everyone"`) — lebih terbuka, tapi orang bisa saling membandingkan. Bisa diubah kapan
saja; tercatat di riwayat seperti perubahan lain, dan tab yang sedang terbuka ikut menyesuaikan.

### Di server

- `COS_SCORING=0` di `.env` mematikan seluruh fitur di server itu: route menjawab 409 dan tampilannya hilang, tapi
  datanya tetap ada. Kalau tidak diisi, fitur ini aktif dan admin tinggal menyalakannya per workspace.
- Tabel Smart Scoring dibuat otomatis saat server start. Setelah `git pull` yang membawa perubahan server, **restart**
  server.
- Estimasi lama otomatis dicatat sekali sebagai "unverified", dan Actual lama sebagai entri log waktu lama. Tidak ada
  angka task yang ditimpa.
- Detail teknis: `docs/SMART-SCORING.md`.


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

Ringkasan langkah (panduan sangat lengkap beserta contoh nilai ada di `GOOGLE_DRIVE_SETUP.md`):

1. Buat Google Cloud project.
2. Catat **Project number** yang berupa angka dari Welcome → Project info atau IAM & Admin → Settings.
   Jangan gunakan Project ID atau nama project.
3. Aktifkan **Google Drive API** dan **Google Picker API**.
4. Konfigurasi OAuth consent screen, tambahkan scope `drive.file`, dan tambahkan tim sebagai
   **Test users** selama masih testing.
5. Buat OAuth client ID tipe **Web application**. Masukkan alamat dashboard **persis**,
   tanpa path, di **Authorized JavaScript origins**.
   Error `origin_mismatch` hampir selalu berarti alamat di browser tidak sama persis dengan daftar ini.
6. Buat Picker API key. Batasi application restriction ke HTTP referrer domain production dan
   API restriction ke **Google Picker API**.
7. Siapkan folder tujuan. **Folder ID** adalah segmen URL setelah `/folders/`.
   Bagikan ke akun anggota atau ke Google Group perusahaan — **Editor** untuk yang mengunggah,
   **Viewer** untuk yang mereview.
8. Di ZenCrevia: **Settings → Cloud storage → Configure Google Drive**, isi OAuth Client ID,
   Folder ID, Picker API key, dan Project number numerik dari project yang sama.
9. Klik **Choose folder in Google Drive** dan pilih folder tim. Langkah ini wajib untuk scope
   `drive.file`; menempelkan Folder ID saja dapat menghasilkan `404 File not found`.
10. Pilih **Save & sign in** menggunakan akun yang boleh mengunggah, lalu jalankan
    **Test Google Drive**.
11. Uji unggah dan preview dari bagian **Files** sebuah task, lalu uji akses dengan akun anggota lain.
12. Putuskan aturan akses eksternal.

> **Akses ZenCrevia dan akses Google Drive terpisah.** Seseorang bisa membuka task tapi tidak
> bisa membuka file-nya kalau folder Drive belum dibagikan kepadanya.
>
> Folder ID secara teknis opsional, tapi mengosongkannya menaruh file di My Drive akun yang
> sedang login — tempat yang tidak bisa diakses siapa pun selain dia.
>
> **Anyone with the link** mati secara default. Menyalakannya membuat setiap unggahan **baru**
> bisa dibuka tanpa login. Jangan pakai untuk materi sensitif atau berlisensi.
> Lebih baik bagikan folder ke Google Group yang dikelola, lalu tambah/kurangi orang lewat grup itu.

### Penyimpanan & Penghapusan (Oktober 2026)

Settings → Integrations → **Storage & Deletion**, untuk yang punya izin *manage cloud storage*
(spesifikasi: `ZenCrevia_Google_Drive_Deletion_Sync_Spec.md`; kode: `server/drive-trash.js`).

- **Sync deleted files** — mati secara default, dan hanya bisa dinyalakan saat akun Google Drive
  bersama terhubung. Perilakunya hanya satu: **pindahkan ke Sampah Google Drive**
  (`files.update {trashed:true}`); file tidak pernah dihapus permanen dan masih bisa dipulihkan dari
  Sampah Drive selama Google menyimpannya.
- Yang memenuhi syarat hanya **file yang diunggah ZenCrevia** lewat akun bersama: setiap unggahan
  dicatat di tabel `drive_uploads` sejak Oktober 2026. Tautan ke file Drive milik orang, unggahan
  lewat alur lama per-browser, dan unggahan di akun Google lain **tidak pernah** dipindah ke Sampah.
- Daftar **Files ZenCrevia put in Google Drive** menunjukkan di mana tiap file dipakai (file task,
  versi, komentar, deskripsi, catatan progres, diskusi project, pustaka aset, chat, request,
  knowledge). File yang masih dipakai **tidak bisa dihapus**; hapus dulu dari tempatnya (menghapus file
  dari task/pesan tidak pernah menghapus filenya).
- **Delete file** meminta konfirmasi lalu menghapus file dari ZenCrevia. Status: *Pending Drive sync* →
  *Moved to Drive Trash*, atau *Deleted in ZenCrevia only* (sync mati), *Drive sync failed* (dengan
  **Try again** / sambungkan ulang Drive), *Not in Google Drive*. **Undo** tersedia sebelum Drive
  memindahkannya ke Sampah.
- Job berjalan di server tiap 30 detik: 429/5xx/timeout dicoba lagi dengan jeda yang makin panjang
  (maks. 8 kali); 403, akses dicabut, atau Drive terputus menjadi *Drive sync failed*. Sebelum
  memanggil Drive, job memeriksa lagi apakah file dipakai lagi atau di-Undo — kalau ya, file tetap.
- Semuanya tercatat di riwayat workspace dan `security.log` (`drive_file_delete_requested`,
  `drive_trash_trashed`, `drive_trash_failed`, …). Mengubah setelan hanya berlaku untuk penghapusan
  baru; file lama tidak pernah dibersihkan otomatis.

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

Tab yang sudah terbuka tetap menjalankan halaman lama sampai dimuat ulang. Sejak Oktober 2026 setiap
balasan API menyebut versi halaman yang dilayani server (`X-ZC-Build`, dicap oleh `node build.js`),
jadi tab lama memunculkan bar **"Versi baru ZenCrevia sudah siap — Muat ulang"** — tidak pernah
memuat ulang sendiri. Halaman baru langsung dilayani setelah `git pull`; perubahan kode server tetap
butuh **restart**. Pengguna yang error setelah update: minta **Ctrl+Shift+R** (Mac: Cmd+Shift+R) atau
tutup-buka aplikasi terpasang; tidak perlu menghapus akun.

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
| `COS_SESSION_HOURS` | `1440` | umur sesi sejak terakhir dipakai (1440 jam = 60 hari) |
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
| `COS_SCORING` | `0` mematikan Smart Scoring di server ini (route 409, tampilan hilang, data tetap ada); kosong = aktif, admin menyalakan per workspace (§5b) |
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
