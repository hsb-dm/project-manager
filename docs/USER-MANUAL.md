# ZenCrevia — Panduan Pengguna

> Panduan untuk anggota tim yang memakai ZenCrevia sehari-hari.
> Nama tombol ditulis dalam **English** persis seperti yang muncul di aplikasi saat bahasa
> di-set ke English. Kalau kamu memakai bahasa Indonesia, labelnya diterjemahkan otomatis —
> posisinya tetap sama.

---

## Daftar isi

1. [Masuk dan mengenal layar](#1-masuk-dan-mengenal-layar)
2. [Home](#2-home)
3. [Tasks](#3-tasks)
4. [Membuka sebuah task](#4-membuka-sebuah-task)
5. [Calendar](#5-calendar)
6. [Projects](#6-projects)
7. [Teams](#7-teams)
8. [Assets](#8-assets)
9. [Knowledge](#9-knowledge)
10. [Request pekerjaan](#10-request-pekerjaan)
11. [AI Hub](#11-ai-hub)
12. [AI Gallery](#12-ai-gallery)
13. [AI Intelligence](#13-ai-intelligence)
14. [Analytics](#14-analytics)
15. [Export dan cetak](#15-export-dan-cetak)
16. [Workspace Quest](#16-workspace-quest)
17. [Preferensi pribadi](#17-preferensi-pribadi)
18. [Pintasan keyboard](#18-pintasan-keyboard)

---

## 1. Masuk dan mengenal layar

### Lupa password

Di layar masuk, pilih **Forgot password?**, isi email kerjamu, lalu buka tautan di email
yang masuk (cek juga folder spam). Tautan berlaku 60 menit dan hanya sekali pakai. Setelah
password baru disimpan, kamu keluar dari semua perangkat lain dan perlu masuk lagi.
Kalau email tidak datang, minta admin mereset password dari Settings → Members.

### Sidebar

Delapan menu utama: **Home**, **My Tasks**, **Projects**, **Calendar**, **Teams**,
**Assets**, **Knowledge**, **Analytics**. **My Tasks** membawa badge berisi jumlah task
terbuka yang ditugaskan kepadamu.

Semua menu kecuali **Home** bisa disembunyikan lewat **Settings → Menu & home layout**
atau modal **Customize layout** di Home. Menu yang disembunyikan tetap muncul selama kamu
sedang berada di layar itu.

Di layar kecil, sidebar berubah jadi tab bar berisi 4 menu pertama plus tombol **More**.
Sheet **More** berisi sisa menu, lalu **Notifications**, **Settings**, **AI Hub**,
**AI Gallery**, **AI Intelligence**, **Export**, **Theme**, **Menu**, dan **Account**.

### Search

Kotak pencarian ada di topbar (**Search everything…**). Tekan **Ctrl K** (atau **⌘ K**)
untuk langsung ke sana. Hasilnya dikelompokkan jadi panel: **Tasks**, **Briefs**, **Projects**,
**Teams**, **People**, **Files**, **Assets**, **Knowledge**.

Kamu bisa mencari dengan task ID, tag, nama orang, nama tim, nama file, atau judul halaman.

### Menu akun (avatar kanan atas)

- **My profile** — halaman anggota kamu
- **Change password**
- **Language** — pilih EN atau ID
- **AI** — **AI Hub**, **AI Gallery**, **AI Intelligence**
- **Workspace** — entri Workspace Quest, **Menu & home layout**, **Settings**
- **Switch user** — hanya untuk sesi admin
- **Sign out**

### Notifications

Ikon lonceng dengan titik kalau ada yang belum dibaca. Popover-nya punya **Mark all read**;
mengklik satu baris menandainya terbaca dan langsung membuka task terkait.
Halaman penuh punya tombol **Preferences** yang mengarah ke pengaturan notifikasi.

Yang memicu notifikasi: penugasan, mention, approval, request, dan deadline.

### Theme cepat

Ikon tema di topbar membuka popover **Quick theme**: **Accent** (swatch warna + warna kustom),
**Appearance** (Light / Dark / System), dan **Density** (Comfortable / Compact).

> Tema bersifat **workspace-wide**. Kalau role kamu tidak boleh mengelola workspace,
> perubahan hanya berlaku untuk sesi ini dan tidak tersimpan.

---

## 2. Home

Header menyapa dengan nama depan dan merangkum: berapa yang menunggu review kamu,
berapa jatuh tempo hari ini, berapa terlambat, berapa selesai minggu ini.

### Sembilan kartu

| Kartu | Isinya |
|---|---|
| **KPI cards** | Dua baris berisi empat ubin: **My tasks**, **Due today**, **In review**, **Overdue**; lalu **Assets delivered**, **Assets in production**, **Asset links**, **Auto-hidden**. Setiap ubin bisa diklik dan langsung membuka Tasks/Calendar yang sudah difilter. |
| **Creative pipeline** | Satu kolom per stage workflow dengan jumlah dan bar. Mengklik sebuah stage memfilter seluruh dashboard. |
| **My priorities** | 8 task teratas milikmu |
| **Needs your review** | Hingga 6 task yang menunggu keputusanmu |
| **Team workload** | Beban kerja per tim |
| **Active projects** | Project yang belum selesai |
| **Upcoming deadlines** | Hingga 6 task jatuh tempo dalam 7 hari |
| **Inbox — new requests** | Hingga 6 request yang belum ditriase |
| **Recent activity** | 10 aktivitas terakhir, dengan toggle **Mine / All** |

### Mengatur tampilan Home

Setiap kartu punya tiga tombol kecil di pojoknya: **Full width / Half width**,
**Minimize / Expand**, dan **Hide from my dashboard**.
Kartu bisa **diseret** ke posisi lain — hasilnya tersimpan otomatis.

Tombol **Customize** di header membuka modal **Customize layout**:

- **Cards on my home** — centang kartu mana yang tampil
- **Top menu** — centang menu mana yang tampil (Home tidak bisa dimatikan)
- **Presets** — simpan kombinasi kartu + menu dengan nama, lalu **Load**, **Update**, atau hapus

> **Load** hanya menyiapkan preset. Kamu tetap harus menekan **Apply** agar berlaku.

Semua perubahan di sini **hanya untuk akunmu sendiri**.

---

## 3. Tasks

> **Aturan tahap.** Sebelum task dikirim ke review, isi reviewer-nya dulu. Kamu bisa memindahkan task-mu sendiri sampai *Delivered*; menutupnya ke *Done* dilakukan reviewer, requester, atau lead (admin bisa mengubah aturan ini). Kolom yang tidak boleh kamu tuju tampil terkunci 🔒 saat kartu diseret.

### Lima cara melihat pekerjaan

**Kanban** — satu kolom per stage. Kartu menampilkan thumbnail versi terakhir, chip label,
penanda centang pribadi, judul, badge (hidden / dependency / request / tim / project),
bar prioritas, chip jatuh tempo, jam estimasi, badge aset, dan tumpukan assignee.

- Seret **di dalam** kolom = mengurutkan ulang. Ini hanya bekerja saat **Sort** = **Manual**;
  kalau tidak, muncul pesan *"Switch sort to Manual to reorder cards"*.
- Seret **antar** kolom = mengubah status.
- Memindahkan task yang **blocked** ke stage kerja/review/selesai memunculkan konfirmasi
  **"Task still has unresolved dependencies"** yang menampilkan daftar blocker-nya,
  dengan pilihan **Cancel** atau **Move anyway**.

**List** — tabel dengan kolom Task, Status, Dependency, Team, Assignee, Project, Priority,
Start, Due, Est., Tags. Klik header untuk mengurutkan. Klik sel **Status** atau **Priority**
untuk mengubahnya langsung. Seret baris ke baris lain untuk mengurutkan, atau ke
**header grup** untuk mengubah status/tim/assignee/project/prioritas sekaligus.

**Grid** — seperti spreadsheet. Setiap sel menulis langsung ke task: judul, status, tim,
assignee, reviewer, project, prioritas, tanggal mulai & jatuh tempo, estimasi, tag, dan
setiap custom field. Tombol **Fields** memilih kolom mana yang tampil.

**Calendar** — lihat [bagian 5](#5-calendar).

**Timeline** — jendela 42 hari mulai 14 hari ke belakang, dengan garis "hari ini",
arsiran akhir pekan, bar grup project, bar milestone (◆), dan satu bar per task.
Seret bar untuk menggeser kedua tanggal; seret ujung kiri/kanannya untuk mengubah durasi.

### Toolbar

- **Mine / All** — cakupan
- **Filters** — membuka modal filter; setiap filter aktif juga jadi chip yang bisa dilepas
- **Sort** — Manual, Due date, Priority, Created, A → Z, Status, Team, Assignee, plus tombol balik urutan
- **Group** — None, Status, Team, Assignee, Project, Priority, Due date (List & Grid)
- **Fields** — kolom yang tampil (Grid)
- Chip **n checked** — lihat di bawah
- **Views** — view tersimpan

### Filter yang tersedia

Status · Team · Assignee · Reviewer · Project · Priority · Tag · Dependency
(Blocked / Ready / Blocking other tasks / Has dependencies / No dependencies) ·
Due date (Today / Tomorrow / This week / Next week / Overdue / Custom range…) ·
Archived projects · Hidden tasks (Hidden / Show all / Hidden only) · Label.

Filter digabung dengan **AND**.

### Saved Views

Tombol **Views** menyimpan seluruh konfigurasi tampilan sekarang: jenis view, filter,
sort, grouping, kolom Grid, cakupan, dan arah urutan. Setelah satu view aktif, kamu bisa
**Update**, **Rename**, **Delete**, atau **Exit view**.

### Penanda centang pribadi

Setiap kartu kanban, baris list, chip kalender, dan baris agenda punya tombol centang bulat kecil.

- Ini **murni penanda pribadi**. Tidak mengubah status task, tidak dikirim ke server,
  tidak muncul di export atau di layar orang lain, tidak tercatat di activity.
- Berguna untuk menandai "sudah saya cek" saat menyisir board.
- Tersimpan di browser ini untuk akunmu saja.
- Toolbar menampilkan chip **n checked** dengan tombol × untuk menghapus semuanya sekaligus.
  Chip ini hilang saat tidak ada yang tercentang.
- Tidak ikut tercetak saat print.

### Membuat task baru

Tombol **New task** membuka panel task berisi draft. Semua field diisi lewat panel biasa.
Footer-nya berbunyi *"Nothing is saved until you create it"* dengan tombol **Discard** dan
**Create task**. Tanpa judul, kamu akan diingatkan lebih dulu.

---

## 4. Membuka sebuah task

Klik task di mana pun untuk membuka **task panel**.

### Header

Task ID · badge project · status · prioritas · tim, lalu tombol **gear** (Task settings)
dan tombol tutup. Judul bisa diedit langsung kalau kamu punya izin.
Kalau tidak, muncul badge **read-only**.

### Field

Status · Priority · Team · Project (dengan **+ New project…**) · Assignees · Reviewers ·
Start · Due · Labels · Estimate · Assets produced · Tags, lalu setiap **custom field**
yang dibuat workspace.

Field mana yang tampil diatur admin di **Settings → Custom fields**.

### Empat tab

**Brief** — kolom **Description** bebas, bagian **Dependencies**, lalu **Creative brief**.
Kalau belum ada brief, pilih salah satu template (Social Media, Banner, Presentation,
Branding, Video, Print, General Creative Request). Header brief menunjukkan **Complete**
atau **n required fields missing**.

**Assets & versions** — tiga blok:

1. **Assets** — jumlah aset yang diproduksi, tautan aset, dan **Open final asset**.
2. **Versions & approval** — unggah versi baru atau tautkan dari Google Drive.
   Klik di mana saja pada preview untuk **menaruh pin anotasi**; klik pin untuk menandainya selesai.
   Status versi: **Approved**, **Revision requested**, **Pending review**.
   Kalau kamu reviewer dan task sedang di stage review, muncul tombol **Approve** dan
   **Request revision**. Form revisi meminta **Reason**, **Specific feedback**, dan
   **Revision priority** — mengirimnya juga memposting komentar dan memindahkan task ke stage revisi.
3. **Files & references** — **Upload images**, **Upload file**, **Link Google Drive**,
   **Attach from library**.

**Comments** — pilih audiens: **Internal** (hanya tim kreatif) atau **Stakeholder-visible**
(bisa dilihat requester seperti Marketing). Ketik `@nama` untuk mention.
**⌘/Ctrl + Enter** mengirim. Bisa membalas komentar dan melampirkan file.

**Activity** — linimasa kronologis semua kejadian pada task ini.

### Dependencies

Dua panel: **BLOCKED BY** (prasyarat) dan **BLOCKING** (yang menunggu task ini).

**Add dependency** membuka pencarian dengan tiga tab: **Same project**, **My tasks**,
**All tasks**. Aturannya *Finish → Start*: task ini siap ketika semua prasyaratnya berada
di stage tertutup. Sistem menolak dependensi ke diri sendiri, duplikat, dan rantai melingkar.

Prasyarat yang jatuh temponya **setelah** task ini diberi badge **Schedule risk**.

### Footer

Stepper workflow (satu tombol per stage) plus aksi utama yang menyesuaikan stage:

- stage antrian/kerja/revisi → **Upload version** + **Submit for review**
- stage review (dan kamu boleh review) → **Request revision** + **Approve**
- stage tertutup dengan stage tertutup berikutnya → **Mark `<stage berikutnya>`**

### Menu gear

Bagian **Panel position** — tiga ikon (Left / Center / Right) plus pintasan ke pengaturan layout.
Lalu pemisah, lalu aksi task: **Duplicate task**, **Export task (.csv)**,
**Hide task** / **Unhide task**, **Delete task**.

Menu tetap terbuka saat kamu memilih posisi, jadi kamu bisa mencoba ketiganya berturut-turut.
Panah kiri/kanan/atas/bawah berpindah antar ikon, Enter/Space memilih, Escape menutup.

### Posisi panel task

Pilihannya **Left**, **Center**, atau **Right** (default Right). Ini **preferensi pribadi**.

Mengubahnya tidak pernah mengganggu task yang sedang terbuka — tab, versi yang dilihat,
draf brief, dan balasan komentar yang belum dikirim semuanya tetap utuh.
Panel berpindah dengan cross-fade halus, bukan lompat.

Ada dua tempat mengaturnya, dan keduanya selalu sinkron: menu gear di panel, dan
**Settings → Menu & home layout → Task panel**.

Di layar sempit semua posisi tampil sama (panel selebar layar).

---

## 5. Calendar

Cakupan **Mine / Team**, ditambah seluruh filter task.

Tiga mode: **Month** (maksimum 3 chip per hari), **Week** (maksimum 12), dan **Day**
(daftar vertikal). Navigasi dengan `‹` `›` dan tombol **Today**.

- **Seret chip ke hari lain** untuk menjadwal ulang — durasinya dipertahankan.
- **Klik hari kosong** untuk membuat task pada tanggal itu.
- **+n more** membuka daftar semua task yang jatuh tempo pada hari itu.
- **Show labels / Hide labels** menampilkan atau menyembunyikan nama label pada chip.
- Chip milestone (◆) dan deadline project (⚑) juga muncul dan mengarah ke project-nya.

Di bawah kalender ada panel **Next 14 days** berisi setiap task terbuka yang jatuh tempo
dalam dua minggu ke depan.

Penanda centang pribadi tersedia di chip kalender, di sheet **+n more**, dan di agenda
**Next 14 days** — sama persis dengan yang di kanban dan list.

---

## 6. Projects

Daftar project punya segmen **Active / Archived / All**. Project yang selesai diarsipkan
otomatis pada bulan berikutnya, tapi tetap bisa dibuka sepenuhnya.
Baris bisa diseret untuk diurutkan.

### Halaman project

Judul bisa diedit langsung, ada pilihan status (**Active / At risk / Done / Archived**),
dan tombol **New task**.

Sepuluh tab:

| Tab | Isinya |
|---|---|
| **Overview** | KPI (Open tasks / In review / Overdue / Remaining effort), **Description & objective**, slider **Progress**, **Milestones**, aset final, task terbuka, dan tim |
| **Board / List / Grid / Calendar / Timeline** | lima view task yang sama, dibatasi ke project ini |
| **Assets** | panel **Final assets** dengan segmen **Done only / All tasks** |
| **Files** | semua file dan versi di seluruh task project ini |
| **Activity** | 30 aktivitas terakhir |
| **Settings** | Name, Owner, Status, Start, Deadline, Tags, Teams, Members, plus **Delete project** |

Menandai milestone selesai akan menghitung ulang progress project.

---

## 7. Teams

Header merangkum: berapa tim, berapa kreatif, berapa jam ditugaskan dari total kapasitas.

Satu kartu per tim dengan ikon, nama, deskripsi, statistik, bar utilisasi, dan chip anggota.

- **Seret chip anggota ke kartu tim lain** untuk memindahkannya.
- **Seret kartu** untuk mengurutkan.

Panel **Workload by person** dan **Stakeholders** ada di bawahnya.

### Halaman tim

KPI Utilization / Open tasks / In review / Overdue, lalu panel **Members** (dengan badge
`primary`, `secondary`, `lead`), **Workload**, dan **Team tasks**.

### Halaman anggota

Foto (klik untuk mengganti), nama, jabatan, badge role dan tim, angka **Capacity** (jam/minggu),
serta KPI Utilization / Open tasks / To review / Overdue.

---

## 8. Assets

Dua tab halaman: **Asset library** dan **Brand library**.

### Asset library

Rail folder di kiri: **All assets**, **Brand assets**, **Cloud-linked**, lalu setiap folder,
lalu **New folder**. Panel **Storage** menampilkan akun cloud yang terhubung.

Toolbar punya kotak filter (**Filter by name or tag…**), penghitung, dan segmen **Grid / List**.

Klik sebuah aset untuk membuka detailnya: preview besar, thumbnail yang bisa diganti,
lalu meta yang bisa diedit — **Type**, **Folder**, **Brand asset**, **Source**, **Version**,
**Description**, **Tags** — plus daftar *"Used in n tasks"*.

Tombol utama: **Upload asset**, **New folder**, **Link Google Drive**.

> Menghapus aset yang tertaut ke cloud hanya memutus tautannya. File di provider tidak dihapus.

### Brand library

Panel **Logo**, **Colors** (klik swatch untuk menyalin hex), **Typography** (font Headlines /
Body / CJK, plus unggah font), dan **Photography** — masing-masing diikuti aset brand
dengan tipe yang sesuai.

---

## 9. Knowledge

Basis SOP, spesifikasi, dan pedoman. Pohon di kiri punya pencarian, lalu bagian **Pinned**,
**Favorites**, dan satu bagian per folder.

Pembaca menampilkan meta (folder · penulis · waktu diperbarui) dengan tombol favorit (★),
pin, **Edit**, dan hapus. Isi ditulis dalam Markdown:
`# heading`, `**tebal**`, `- daftar`, `> kutipan`, `| tabel |`, `[tautan](url)`.

---

## 10. Request pekerjaan

Request **bukan layar terpisah** — ia adalah task biasa dengan ciri khusus.

Dari Home, tombol **Create ▾ → Request work** (*"Send unassigned work to the Inbox for triage."*)
membuat task tanpa assignee, di stage pertama workflow, dengan tag `request` dan
brief *General Creative Request*.

Request masuk ke kartu Home **Inbox — new requests** untuk ditriase.
Yang berhak memutuskan bisa menolaknya lewat tombol **Decline** di panel task, dengan
alasan yang terlihat oleh pengirim request.

---

## 11. AI Hub

Studio untuk membuat visual berlabel brand.

### Kolom kiri — Creative setup

- **Template**: Product hero, Educational post, Campaign, Event, Display banner, atau Blank
- **Canvas size**: Website hero 1920×720, Social square 1080×1080, Feed portrait 4:5,
  Story/Reels 9:16, Display 300×250 / 728×90 / 300×600, Email header 1200×400,
  Poster A2, atau **Custom size…** (64–4096)
- **Visual brief** — deskripsi visual yang kamu inginkan
- **Specific generation prompt** — opsional, prompt persis untuk generasi ini
- **Visual style** — Editorial photography, Product photography, Cinematic, Minimal, 3D,
  Illustration, Flat illustration, Collage, atau Custom
- **Advanced generation** — **Reference image**, **AI image generation model**
  (daftar yang disetujui admin), dan **Avoid** (negative prompt)

> Kamu memilih model berdasarkan **nama tampilannya**. Tidak ada kolom untuk mengetik
> model ID — administrator workspace yang menentukan daftarnya.

### Kolom tengah — Canvas

Segmen **Edit / Preview**, tombol **Show safe zones**, dan petunjuk
*"Drag to move layers. Double-click text to edit."*

Klik untuk memilih layer, seret untuk memindahkan, seret handle untuk menskala,
klik ganda pada teks untuk mengedit inline. Layer yang terkunci tidak terpengaruh.

Footer: **Save to AI Gallery**, **Save to assets**, **Download**.

### Kolom kanan — Properties

Panel **Layers** berisi Canvas, Logo, Badge, Headline, Subheadline, Button, Disclaimer,
plus setiap layer kustom. Tombol **Text** dan **PNG / image** menambah layer;
setiap baris punya pegangan seret dan tombol hapus. Ada penghitung `terpakai / maksimum`.

Inspector menyesuaikan tipe layer yang dipilih:

| Layer | Section |
|---|---|
| Canvas | Size · Background · Safe area · Guides & snap · Text protection |
| Image | Transform · Appearance · Stroke · Corner · Opacity · Effects · Advanced |
| Shape | Transform · Fill · Stroke · Corner · Opacity · Effects · Advanced |
| Text | Transform · Content · Typography · Fill · Background · Stroke · Opacity · Effects · Advanced |

Memilih beberapa layer sekaligus memberi **Align to** (Selection bounds / Canvas),
toolbar perataan, **Bring forward** / **Send backward**, serta **Duplicate layers** dan
**Delete layers**. Layer terkunci tetap di tempat.

Section yang kamu buka/tutup diingat untuk kunjungan berikutnya.

### Menghasilkan visual

1. Isi **Visual brief** atau **Specific generation prompt** — tanpa itu tombol menolak jalan.
2. Tekan **Generate visual**.
3. Gambar ditempatkan **di belakang** teks dan layer kamu.

Kalau tombolnya mati, banner di atas kanvas menjelaskan sebabnya —
belum ada model aktif, atau provider belum terhubung. Kamu tetap bisa menyusun dan
mengekspor template berlabel brand.

Panel **Generation history** menyimpan hingga 8 percobaan terakhir dengan tombol
**Preview** dan **Use settings**.

### Kalau kena batas

- **Batas layer / layer gambar** — penambahan ditolak dengan pesan yang menyebut angkanya.
  Isi yang sudah ada tidak tersentuh dan tetap bisa diedit. Desain lama yang dibuat sebelum
  batas diturunkan tetap bisa dibuka, diedit, dihapus layernya, diekspor, dan disimpan —
  hanya penambahan yang dijeda.
- **History** — dipangkas diam-diam ke N terbaru. **Ini tidak pernah menyentuh AI Gallery atau Assets.**
- **Kuota gallery** — lihat bagian berikutnya.

---

## 12. AI Gallery

Desain tim yang siap kamu jadikan milikmu sendiri.

Toolbar punya pencarian (nama, tag, atau catatan) dan segmen **All designs**, **My designs**
(dengan pil kuota), **Favorites**, **Archived**. Halaman berisi 24 desain.

Setiap kartu menampilkan sampul, judul, bintang favorit, pemilik dan tanggal, tag,
catatan desain yang bisa dibuka, dan tombol:

- **Duplicate & edit** — membuat salinanmu sendiri; aslinya tidak berubah
- **Edit** — hanya pada desain milikmu yang belum diarsipkan
- **Manage** — pemilik atau administrator workspace

Menyimpan dari AI Hub lewat **Save to AI Gallery**: isi **File name**, **Tags**, dan
**Design notes**. Modal ini juga menampilkan **Gallery usage**, **Published today**, dan
**Duplicates today**.

> Saat kuota penuh kamu **masih bisa** melihat, mengedit, mengunduh, memfavoritkan,
> mengarsipkan, dan menghapus permanen. Yang diblokir hanya membuat desain baru,
> menyimpan sebagai desain baru, dan menduplikasi.

Kalau ada orang lain menyunting desain yang sama, muncul pesan
*"This design changed. Refresh AI Gallery and try again."* — muat ulang dulu.

---

## 13. AI Intelligence

Panel tanya-jawab tentang workspace, dibuka dari tombol ✦ mengambang, menu akun,
atau sheet **More** di mobile.

Saran pertanyaan bawaan: **What needs my attention?**, **Team workload**,
**Project risk check**, **Standup summary**, **Asset output report**, **Draft a creative brief**.

Ia menjawab tentang task, project, orang, dan deadline; membalas dalam bahasa
pertanyaanmu; dan tetap memberi jawaban lokal kalau provider AI belum dikonfigurasi.
Riwayat percakapan tersimpan di perangkatmu (30 pesan terakhir).

Tombol header: **New conversation**, **Prompt templates**, **AI settings**, **Close**.
Enter mengirim, Shift+Enter membuat baris baru.

---

## 14. Analytics

Tersedia untuk lead dan admin.

Delapan KPI: **Tasks completed**, **Tasks created**, **Overdue now**, **Avg completion**
(hari, brief → approved), **Revision rate**, **Approval rate**, **Approval time** (jam,
review → keputusan), dan **Team utilization**.

Grafik dan panel:

| Panel | Bentuk |
|---|---|
| Throughput — created vs completed | bar berkelompok |
| Overdue tasks per week | bar |
| Average completion time (days) | garis area |
| Revision rate | garis area persentase |
| Time in status (days) | bar horizontal per stage |
| Teams — utilization | bar horizontal, bisa diklik |
| Top blockers | bar horizontal, bisa diklik ke task-nya |
| Project progress & remaining work | bar horizontal |
| Deadline risk | satu baris per project dengan badge risiko |
| Pipeline snapshot | jumlah task per stage |

Rentang waktu diatur lewat segmen **4 wks / 8 wks** atau angka **Timeline** (1–52 minggu).

---

## 15. Export dan cetak

### Dari mana

- Ikon export di topbar → menu berisi **PowerPoint deck (.pptx)**, **Excel workbook (.xlsx)**,
  **Tasks as CSV**, **Backup (.json)**, **Print / PDF**
- Header **Tasks**, **Projects**, **Teams** → tombol **Excel**
- Header **Analytics** → **Excel** dan **PowerPoint report**
- Menu gear di panel task → **Export task (.csv)** untuk satu task saja

### Modal export

**Period** — Last 4 weeks, Last 8 weeks, This month, Last month, This quarter, atau Custom
(dengan **From** / **To**).

**Scope** — chip untuk **Teams**, **Projects**, **Labels**, **People**
(tidak memilih apa pun berarti semuanya), plus **Task state**:
Everything in the period / Open tasks only / Completed tasks only.

**Contents** —

- PPT: Headline metrics, Creative pipeline, Throughput, Projects, Workload by team,
  Workload by person, Performance by person, Needs attention, AI recommendations.
  Slide sampul selalu ikut.
- XLSX: Summary, Tasks, Task assets, Projects, Teams, Workload, Weekly, Pipeline, Asset library.
- CSV: selalu satu tabel task dengan seluruh kolom.

Kotak jumlah baris memperbarui diri saat kamu mengubah scope.

> Laporan mengikuti periode dan filter export. Task yang disembunyikan manual dan project
> yang diarsipkan dikecualikan. Ringkasan adalah snapshot saat diekspor — mengedit task
> di sheet detail tidak menghitung ulang seluruh analitik.

### Print / PDF

**Print / PDF** mencetak layar yang sedang terbuka. Stylesheet khusus cetak menyembunyikan
seluruh chrome aplikasi — topbar, panel task, tab bar, tombol mengambang, kontrol interaktif,
dan penanda centang pribadi — lalu membuka kunci scroll supaya isi yang panjang tidak terpotong.

Untuk mendapat PDF, pilih "Save as PDF" di dialog cetak browser.

---

## 16. Workspace Quest

Tur berpemandu 23 langkah yang mengajarkan cara kerja workspace ini.
Tersedia untuk anggota non-admin.

Sepuluh chapter, total 100 XP:

| Chapter | XP | Isi |
|---|---|---|
| Welcome & orientation | 5 | melihat apa yang perlu perhatianmu lebih dulu |
| Home command center | 10 | prioritas dan review dari Home |
| Task navigator | 15 | membuka task, memilih view, menemukan yang blocked |
| Task workflow | 20 | task latihan, posisi panel, brief, versi, komentar, submit review |
| Dependency detective | 10 | memahami BLOCKED BY dan BLOCKING |
| Project context | 8 | melihat konteks project |
| Calendar & scheduling | 7 | merencanakan lewat kalender |
| Assets & knowledge | 10 | menemukan aset dan sumber kebenaran |
| AI tools | 10 | AI Hub dan AI Intelligence |
| Personal controls & finish | 5 | pencarian dan penyesuaian workspace |

Kartu pemandu punya **Back**, **Skip step**, menu `•••` (**Pause for now**,
**Restart chapter**, **Skip onboarding**), dan tombol aksi utama.

Saat dijeda, muncul tombol mengambang **Resume Workspace Quest**.
**Mission Center** menampilkan XP per chapter dan tombol **Replay from start**.

Untuk chapter workflow dan dependency, dibuat dua **task latihan** sementara.
Keduanya dihapus otomatis saat quest selesai atau dilewati, dan tidak pernah bercampur
dengan pekerjaan sungguhan.

> Progresmu privat dan hanya membantumu mengenal workspace. Tidak ada yang melihatnya.

---

## 17. Preferensi pribadi

| Preferensi | Di mana | Berlaku untuk |
|---|---|---|
| **Bahasa** (EN / ID) | menu akun → **Language**, atau layar login | hanya kamu |
| **Posisi panel task** | menu gear di panel, atau Settings → Menu & home layout | hanya kamu |
| **Menu mana yang tampil** | Customize layout → Top menu | hanya kamu |
| **Kartu Home, urutan, lebar, terlipat** | kontrol kartu + seret, atau Customize layout | hanya kamu |
| **Layout presets** | Customize layout → Presets | hanya kamu |
| **Tampilan pintasan keyboard** (Automatic / Ctrl / ⌘) | Settings → My profile | hanya kamu |
| **Foto, nama, jabatan, email** | Settings → My profile | catatan pribadimu |
| **Password** | menu akun → Change password | mode server saja |
| **Penanda centang task** | tombol centang di kartu/baris/chip | hanya kamu, hanya di browser ini |
| **Section Properties AI yang terbuka** | inspector AI Hub | hanya kamu |
| **Progres Workspace Quest** | UI quest | hanya kamu, privat |
| **Accent, Appearance, Density, Radius, Typography** | Quick theme atau Settings → Theme | **seluruh workspace** — hanya tersimpan kalau kamu boleh mengelola workspace |

> **Automation** (auto-hide task selesai dan auto-archive project) **bukan** preferensi pribadi.
> Itu pengaturan workspace yang hanya bisa diubah admin.

---

## 18. Pintasan keyboard

| Pintasan | Fungsi |
|---|---|
| **Ctrl K** / **⌘ K** | fokus ke pencarian (membuka search bar di layar sempit) |
| **Escape** | tutup — berurutan: modal, panel AI, popover/panel task |
| **⌘/Ctrl + Enter** | kirim komentar |
| **Enter** | kirim pesan AI Intelligence (Shift+Enter = baris baru) |
| **← → ↑ ↓** di menu gear | berpindah antar posisi panel |
| **Enter / Space** di menu gear | pilih posisi |

Di AI Hub:

| Pintasan | Fungsi |
|---|---|
| **⌘/Ctrl + C / V / D** | salin / tempel / duplikasi layer |
| **Delete / Backspace** | hapus layer atau guide yang terpilih |
| **Space + seret** | geser kanvas |
| **Alt + scroll** | zoom pada posisi kursor |
| **Shift + R** | tampilkan/sembunyikan ruler |

Daftar lengkap ada di tombol bantuan pintasan di dalam AI Hub.

---

*Kalau ada yang tidak sesuai dengan yang kamu lihat di layar, kemungkinan role kamu
tidak memiliki izin untuk fitur itu — tanyakan ke administrator workspace.*
