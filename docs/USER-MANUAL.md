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

Ikon lonceng menampilkan jumlah notifikasi yang belum dibaca (di atas 99 tampil **99+**); angkanya
berdenyut sekali saat ada notifikasi baru. Popover-nya punya **Mark all read**;
mengklik satu baris menandainya terbaca dan langsung membuka task terkait.

Notifikasi baru juga muncul sebagai pop-up di bawah layar selama 10 detik — tetap tampil selama
kursor berada di atasnya, bisa ditutup dengan tombol ×, dan diklik untuk membuka task atau
percakapannya. Kalau notifikasi browser aktif, notifikasi browser yang dipakai (tampil 20 detik).
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

*Kolom bisa digeser dan diubah lebarnya:*
- **Pindah kolom** — seret judul kolom ke kiri/kanan; garis biru menunjukkan tempat jatuhnya.
  **Esc** membatalkan. Kolom Task ikut bisa dipindah; kotak centang dan pegangan seret baris
  tetap di depan. Klik biasa (tanpa digeser) tetap mengurutkan.
- **Ubah lebar** — seret tepi kanan judul kolom (garis tipis saat kursor di atasnya). Lebar
  minimum: Task 160 px, Est. 44 px, lainnya 60 px. **Klik dua kali** tepinya untuk lebar semula.
  Setelah kamu mengubah lebar, kolom Task mengisi sisa ruang.
- **Keyboard** — fokuskan judul kolom dengan Tab: **Alt+←/→** memindahkan, **Alt+Shift+←/→**
  mengubah lebar 16 px, **Enter** mengurutkan, **Shift+F10** (atau tombol menu) membuka menunya.
- Di layar sentuh (tablet), **tahan** judul kolom sebentar lalu geser; usapan biasa tetap
  menggulir tabel ke samping. Di ponsel List tampil sebagai kartu, jadi kolom tidak digeser di sana.

*Pilih kolom yang tampil:*
- Tombol **Columns** (*Kolom*) di sebelah **Group** membuka daftar semua kolom menurut urutannya.
  Centang untuk menampilkan, hapus centang untuk menyembunyikan; tombol panah **naik / turun** di
  tiap baris memindahkan kolom (urutan yang sama dengan menyeret judulnya). Tabel langsung
  berubah dan daftarnya tetap terbuka. Bila ada yang disembunyikan, tombolnya menunjukkan jumlahnya
  dalam lingkaran kecil (arahkan kursor ke tombol: *Kolom · 3 disembunyikan*); di tablet dan ponsel
  tombolnya ikon mata dengan angka itu.
- Kolom **Task** selalu tampil (*selalu tampil*).
- **Show all** (*Tampilkan semua*) menampilkan semua kolom lagi; **Reset columns** di bawah daftar
  sama dengan tombol di toolbar.
- **Klik kanan** judul kolom (atau **Shift+F10** pada judul yang terfokus) memberi **Hide column**
  (*Sembunyikan kolom*, tidak ada untuk Task) dan **Columns…** (*Kolom…*), yang membuka daftar tadi.
- Di daftar: **↑/↓** pindah baris, **Spasi** mencentang, **Alt+↑/↓** memindahkan kolom, **Esc** atau
  klik di luar menutupnya.
- Kolom yang disembunyikan tidak digambar sama sekali (juga tidak di kartu ponsel), tetapi tetap di
  tempatnya dalam urutan dan kembali ke sana saat ditampilkan lagi. Mengurutkan atau mengelompokkan
  menurut kolom yang disembunyikan tetap bisa.

- Urutan, lebar, dan kolom yang disembunyikan disimpan **per orang** (ikut ke perangkat lain) dan
  berlaku juga di tab List sebuah project. Tombol **Reset columns** (*Atur ulang kolom*) di sebelah
  **Group** (muncul bila ada yang berubah) mengembalikan urutan dan lebar bawaan dan menampilkan
  semua kolom.

**Grid** — seperti spreadsheet. Setiap sel menulis langsung ke task: judul, status, tim,
assignee, reviewer, project, prioritas, tanggal mulai & jatuh tempo, estimasi, tag, dan
setiap custom field. Tombol **Fields** memilih kolom mana yang tampil.

**Calendar** — lihat [bagian 5](#5-calendar).

**Timeline** — jendela 42 hari mulai 14 hari ke belakang, dengan garis "hari ini",
arsiran akhir pekan, bar grup project, bar milestone (◆), dan satu bar per task.
Seret bar untuk menggeser kedua tanggal; seret ujung kiri/kanannya untuk mengubah durasi.

**Saat task-nya banyak** — List dan Grid tampil per halaman: 100 baris per halaman, atau saat
dikelompokkan 25 baris per grup, dan tiap grup punya halamannya sendiri. Di bawah baris (di bawah
tiap grup) ada pager: **‹ Prev** (*Sebelumnya*), nomor halaman dengan **…** untuk halaman yang
dilewati (1 2 3 4 5 … 16; klik **…** untuk ke halaman di tengah-tengahnya), **Next ›**
(*Berikutnya*), dan rentangnya (*1–100 of 1,526* / *1–100 dari 1.526*). Pindah halaman hanya
menggambar ulang baris tabel atau grup itu, bukan seluruh layar; fokus keyboard tetap di pager, dan
bagian atas grup atau tabel digulir ke layar bila sedang tak terlihat. Di ponsel pager-nya ringkas:
rentang di barisnya sendiri, lalu **‹** dan **›** di kedua ujung dengan nomor di antaranya.
Kanban tetap menggambar 30 kartu pertama di tiap kolom dan Timeline 30 task pertama di tiap project,
dengan tulisan berapa yang tampil (*30 dari 205 tampil*) dan tombol **Show 30 more**
(*Tampilkan 30 lagi*) yang menambahkan berikutnya di tempat.
- Halaman yang sedang dibuka (List, Grid) atau berapa yang sudah ditampilkan (Kanban, Timeline)
  diingat untuk view, urutan, filter, dan grup itu: setelah task disimpan, setelah pindah ke view
  atau layar lain lalu kembali, dan setelah refresh.
- Mengganti filter, urutan, grup, atau Mine/All di List atau Grid kembali ke halaman 1. Bila task-nya
  berkurang sampai halaman itu tak ada lagi, yang tampil halaman terakhir.
- Jumlah task di judul halaman, angka di header grup, dan angka di header kolom selalu jumlah penuh.
- **Select all** di mode pilih memilih semua task di view itu, di semua halaman.
- Baris bisa diseret ke baris lain di halaman itu atau ke header grup lain, dari halaman mana pun;
  posisinya dihitung dari urutan seluruh daftar, bukan hanya yang tampil.
- Kartu yang diseret ke ruang kosong kolom yang panjang jatuh setelah kartu terakhir yang tampil
  (Sort Manual), jadi tetap terlihat.
- Task yang dibuka dari pencarian, tautan, atau notifikasi tetap terbuka di panelnya walau barisnya
  ada di halaman lain; List tetap di halamannya.
- **Print** dari browser mencetak semua baris dari semua halaman, tanpa pager.

### Toolbar

- **Mine / All** — cakupan
- **Filters** — membuka modal filter; setiap filter aktif juga jadi chip yang bisa dilepas
- **Sort** — Manual, Due date, Priority, Created, A → Z, Status, Team, Assignee, plus tombol balik urutan
- **Group** — None, Status, Team, Assignee, Project, Priority, Due date (List & Grid)
- **Columns** — pilih kolom List yang tampil dan urutannya (List)
- **Reset columns** — urutan dan lebar kolom List kembali ke bawaan, semua kolom tampil lagi (List, hanya bila sudah diubah)
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

**Project** — satu task bisa masuk sampai 5 project. Picker-nya menaruh project task ini paling atas, di bawah
**Selected (N)** / **Dipilih (N)**: project utamanya dulu, lalu yang lain sesuai urutan ditambahkan; project itu
tidak muncul lagi di **Recent** / **Terbaru** atau **Active projects** / **Project aktif**. Klik untuk menambah atau
melepas: project yang dicentang langsung naik ke **Dipilih** (paling bawah di bagian itu) dan yang dilepas langsung
turun lagi ke tempatnya (Terbaru kalau tadi ada di sana, kalau tidak Project aktif); barisnya meluncur singkat ke
tempat barunya dan menyala sebentar, angka N ikut berubah. Pindahan pertama selalu diikuti daftarnya sampai
terlihat; sesudah itu, kalau Anda sedang mencentang beberapa project di tengah daftar, daftarnya tetap di tempat Anda
(project berikutnya naik ke bawah pointer). Dengan keyboard sorotannya ikut pindah bersama barisnya, fokus tetap di
kotak pencarian, dan panah lanjut dari situ. Saat mencari, project terpilih yang cocok tetap di atas, dan yang
dicentang langsung naik ke situ. Kalau perangkat diatur untuk mengurangi gerakan, barisnya langsung pindah tanpa
animasi. **Select project later** / **Pilih proyek nanti** mengeluarkan task dari semua project untuk sementara.

**Estimate otomatis** (bertanda *auto*) diambil dari task serupa yang sudah selesai. Kalau belum ada, dari jam
yang lazim untuk jenis pekerjaannya, dengan **Assets produced** sebagai jumlah deliverable. Deliverable pertama
dihitung penuh, berikutnya lebih cepat sesuai jenisnya: resize 25%; post feed, story, banner, carousel, KV, web,
dan email 50%; poster, reels, dan video 60%; copy, deck, dan konsep logo 40%. Contoh: 12 resize ≈ 5 jam, 3 reels
≈ 13 jam. Ketik angka sendiri kapan saja; angka yang kamu ketik tidak ditimpa.

**Jenis pekerjaan (Kind of work).** Jenis pekerjaan dikenali dari kata di judul task, memakai daftar yang diatur admin
di Settings → Smart Scoring → Estimasi → Kinds of work (misalnya "Siniar HSB eps 4" dikenali sebagai Podcast kalau admin
menambahkan jenis itu dengan kata kunci "siniar"). Kalau judulnya tidak menyebut jenis yang tepat, pilih sendiri di
baris **Effort** pada tab Brief: **Kind of work** dengan tanda kecil **otomatis** dan *post feed* berarti dikenali dari
judul. Klik untuk membuka daftarnya: **Otomatis — dari judul: post feed** paling atas, lalu tiap jenis dengan jam
biasanya untuk satu deliverable (misalnya video 4–16 j), ✓ pada yang dipilih, dan kotak **Cari jenis** bila jenisnya
lebih dari 8 (cari nama atau kata di judul). Pilih jenis lain, atau kembali ke **Otomatis**; keyboard juga bisa (↑ ↓,
Enter memilih, Esc menutup). Pilihanmu selalu menang atas judul dan dipakai untuk estimasi jam, hitungan Smart
Scoring, dan poin aset. Setelah memilih, Estimate dihitung ulang seperti saat judul diubah — kecuali angka yang kamu
ketik sendiri, estimasi yang sudah dikunci, atau task yang sudah selesai. Pilihan ini bisa dibuat oleh siapa pun yang
bisa mengedit task, juga saat Smart Scoring OFF. Kalau admin menghapus jenis yang kamu pilih, task kembali dikenali
dari judulnya.

**Beberapa jenis dalam satu task (Several kinds…).** Satu task bisa berisi beberapa jenis pekerjaan, misalnya
"Youtube Podcast (Full Video, Clippers Socmed & Cover)" = 1 video + 4 reels + 1 cover. Pilih **Beberapa jenis…**
(Several kinds…), opsi terakhir di daftar **Kind of work**. Di bawah baris itu langsung terbuka daftar jenisnya (bukan
jendela baru):

- Tiap baris berisi satu jenis (daftar yang sama, tanpa Otomatis dan tanpa jenis yang sudah dipakai di baris lain),
  jumlahnya (1–500; ketik angkanya, klik **−**/**+**, atau pakai ↑ ↓, PageUp/PageDown untuk ±10, Home/End), dan tombol
  **×** untuk menghapus baris itu. **Tambah jenis** (Add kind) menambah baris, paling banyak 8 jenis.
- Di bawahnya ada total jam yang langsung ikut berubah, misalnya **≈ 31 j · reels 4× 17 j + video 8 j + key visual
  6 j**. Jam tiap jenis dihitung dari template workspace (deliverable pertama penuh, berikutnya sesuai jenisnya), lalu
  kompleksitas dan dependency yang belum selesai dihitung sekali untuk seluruh task.
- Perubahan tersimpan sendiri seperti field task lain (angka yang diketik disimpan setelah berhenti mengetik; Enter
  langsung menyimpan). Estimate dihitung ulang seperti saat memilih jenis. **Selesai** (Done) atau Esc menutup daftar.
- Campuran butuh paling sedikit 2 jenis. Kalau tinggal satu, belum ada yang disimpan; klik **Pakai satu jenis: …**
  (Use one kind) untuk kembali ke satu jenis itu.
- Setelah tersimpan, daftar Kind of work menampilkan **campuran · 3 jenis** (Mixed · 3 kinds); arahkan kursor ke sana
  untuk melihat isinya. Memilih satu jenis atau **Otomatis** di daftar itu mengakhiri campurannya.
- Kalau judul task menyebut beberapa jenis, di bawah baris Effort muncul catatan kecil **Sepertinya beberapa jenis:
  video, reels, … — bagi?** (Looks like several kinds… — split?). **Bagi** (Split) memasang jenis-jenis itu
  masing-masing 1 lalu membuka daftarnya untuk mengatur jumlahnya; **×** menyembunyikan catatan itu untuk task ini di
  perangkat ini. Catatan ini tidak pernah dipasang otomatis.
- Yang tidak bisa mengedit task hanya melihat daftar jenis dan jumlahnya di bawah baris Effort.
- Campuran ikut tersalin saat task diduplikasi. Untuk analytics per jenis, task campuran dihitung sebagai jenis yang
  jamnya paling banyak.

### Empat tab

**Brief** — kolom **Description** bebas, bagian **Dependencies**, lalu **Creative brief**.
Brief terstruktur bersifat **opsional** — brief boleh ditulis langsung di Description, lengkap
dengan gambarnya. Kalau belum ada brief, bagian ini bertanda **Optional** dan bisa dilipat dengan
**Hide** (tetap terlipat untuk kamu di semua task tanpa brief, sampai dibuka lagi dengan **Show**).
Teks yang **diketik** di Description dan Progress note tampil persis seperti diketik — emoji,
huruf non-Latin, simbol, `5 * 3`, `# tag`, `- item`, `<b>`, `<u>`. Format datang dari toolbar (bold,
italic, heading, list, quote, link), dari **Ctrl+U** untuk garis bawah (underline), atau dari teks
yang **di-paste**: format aslinya ikut — bold, italic, coret, garis bawah, heading, list (juga list
dari Word), quote, link, kode, serta x² dan H₂O — dari Google Docs, Word, dan halaman web; font,
ukuran, dan warna dari sumbernya tidak ikut. Teks polos yang membawa tanda format juga menjadi format
saat di-paste: **Markdown** (tombol Copy di ChatGPT atau Claude, file .md — `**tebal**`, `*miring*`,
`~~coret~~`, `` `kode` ``, `# Judul`, `- item`, `1. item`, `> kutipan`, `[teks](https://…)`) dan
**WhatsApp** (`*tebal*`, `_miring_`, `~coret~`, ```` ```mono``` ````). Karena itu `*x*` dibaca tebal di
teks WhatsApp dan miring di Markdown. Tanda hanya dibaca kalau membuka dan menutup kata, jadi
`5 * 3 * 2` dan `file_name_v2` tetap apa adanya, dan teks polos tanpa tanda format di-paste seperti
biasa. Emoji yang di-paste sebagai gambar (Gmail, WhatsApp Web, X, Slack) menjadi emoji biasa.
Untuk memakainya, pilih salah satu template (Social Media, Banner, Presentation,
Branding, Video, Print, General Creative Request). Header brief menunjukkan **Complete**
atau **n required fields missing**.

**Assets & versions** — dibaca dari atas ke bawah:

1. **Versi** — satu kotak, selalu versi terbaru. Versi bisa berupa gambar yang diunggah,
   file/folder Google Drive, atau tautan apa pun (**Upload new version**, **Link from Google Drive**,
   **Attach link**). Preview tampil langsung di task lewat embed resmi layanannya: folder Drive
   menampilkan daftar isinya, Docs/Sheets/Slides, PDF, Figma, Canva, YouTube, Vimeo, Loom, dan Miro.
   Tautan dari situs lain tampil sebagai kartu dengan tombol untuk membukanya.
   - **Catatan** — di bawah preview, tulis apa yang perlu diubah (Enter untuk menyimpan). Tempel
     atau lampirkan screenshot untuk menunjukkannya. Catatan dicentang saat sudah dikerjakan.
   - **Minta revisi** (reviewer, saat task di stage review) — sekali tekan, versi langsung
     dikembalikan dan task pindah ke stage **Revision**. Catatan yang belum selesai ikut terkirim ke
     assignee dan diposting ke Comments sebagai satu pesan. Kalau belum ada catatan, kotak catatan
     langsung terbuka untuk menulisnya.
   - **Versi yang sudah disetujui** masih bisa dikembalikan lewat **Minta revisi** kalau ada
     perubahan mendadak — task dibuka lagi dan pindah ke stage revisi.
   - Semua perilaku ini bisa diatur di **Settings → Automation → Review & revision** (lihat di bawah).
   - **Sudah direvisi → V2** (assignee) — kotak yang sama berubah menjadi versi berikutnya dengan
     tautan yang sama (atau tautan baru). Simpan file versi lama di subfolder tautan itu. Versi
     baru belum masuk review: klik **Kirim untuk review** saat sudah siap, baru reviewer bisa
     menyetujui atau meminta revisi lagi.
   - **Posisi versi** — baris di bawah catatan menunjukkan tahapnya: *Versi siap* → *Dikirim untuk
     review* → *Keputusan reviewer* (disetujui atau perlu revisi). Badge di samping nomor versi
     ikut berubah: **Belum dikirim**, **Dalam review**, **Disetujui**, **Perlu revisi**.
   - Jumlah putaran tidak dibatasi (V2, V3, … V12). Catatan versi sebelumnya dibuka lewat
     **Lihat catatan V1**; setelah lebih dari tiga versi, tombol **Semua versi** membuka daftar
     lengkapnya.
2. **File final** — hasil kerja yang diserahkan: **Upload images**, **Upload file**,
   **Link Google Drive**, **Attach link**, **Attach from library**. Versi yang dibuat dari tautan
   (**Attach link**, atau **Sudah direvisi** dengan tautan baru) ikut tercatat di sini, dengan badge
   **Versi N · Belum final** / **Final**; tautan yang sama dipakai lagi di versi berikutnya tidak
   dicatat dua kali, dan mengubah tautan versi ikut mengubah barisnya. Tautan versi yang dibuat
   sebelum Oktober 2026 dicatat sekali saat server dinyalakan ulang.
3. **Dari komentar** — screenshot dan tautan yang dibagikan di komentar. Bukan hasil kerja sampai
   ditandai **Tandai final**. Tombol **Jadikan versi baru** menjadikan tautan atau screenshot itu
   versi berikutnya apa adanya, tanpa mengunggah ulang; barisnya lalu bertanda **Versi N**.

**Comments** — pilih audiens: **Internal** (hanya tim kreatif) atau **Stakeholder-visible**
(bisa dilihat requester seperti Marketing). Ketik `@nama` untuk mention.
Tautan Google (Drive, Docs, Sheets, Slides) yang di-**paste** langsung berubah menjadi nama file atau
foldernya — di kotak komentar, di chat, dan di editor deskripsi (sebagai chip dengan logo Drive).
Tautan yang diketik manual berubah dengan menekan **Tab**. Arahkan kursor ke chip untuk kartu kecil
**Buka pratinjau**, **Buka tautan**, dan **Salin tautan**.
**⌘/Ctrl + Enter** mengirim. Bisa membalas komentar dan melampirkan file.
**Balas** membuka kotak balasan tepat di bawah komentar itu — di utasnya, setelah balasan yang sudah ada,
tempat balasannya nanti muncul — dengan @mention, lampiran, gambar yang di-paste, dan Enter untuk mengirim;
**Esc** atau **Batal** menutupnya. Kotak di paling bawah tetap untuk komentar baru. Satu kotak balasan terbuka
sekaligus; balasan yang belum dikirim tersimpan per komentar (tombolnya menjadi **Balas (draf)**). Sama di
**Diskusi** project.

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

### Scoring & Intelligence (Smart Scoring)

Kalau admin menyalakan **Smart Scoring**, tab Brief punya panel **Scoring & Intelligence** di bawah baris Effort.
Panel ini terlipat secara default, dan posisi buka/tutupnya diingat per orang. Satu baris untuk tiap modul yang
dipakai workspace (jam, Story Points, Weighted Points). Tiap baris menampilkan:

- **Math**: hitungan otomatis. Untuk jam, dasarnya jenis pekerjaan (yang dipilih di task, kalau tidak dari judul —
  bisa dipilih juga di baris jam ini, **Kind of work**), jumlah **Assets produced** sebagai jumlah deliverable,
  rating kompleksitas, dan dependency yang belum selesai. Klik **Explanation** untuk melihat langkah hitungannya.
  Task dengan beberapa jenis (lihat **Beberapa jenis dalam satu task** di atas) menampilkan **Deliverable per jenis**
  (Deliverables by kind), misalnya "video 1 (8 j), reels 4 (17 j)", sebagai pengganti Assets produced. Daftar jenisnya
  juga bisa dibuka dari baris jam ini, dan muncul di bawahnya. Di form **Calculate**, campurannya ditampilkan apa
  adanya: tidak ada pilihan satu jenis di sana, jadi campurannya tidak tergantikan; **Ubah campuran** (Change the mix)
  membuka daftarnya.
- **AI**: saran AI (kalau kamu boleh memintanya) beserta tingkat keyakinan, asumsi, dan data yang kurang. Saran yang
  jauh dari hitungan diberi peringatan. Kalau AI membaca task sebagai beberapa jenis yang berbeda dari campuran task,
  tertulis misalnya **Saran AI: video 1 · reels 4 · key visual 1** (The AI suggests: …) dengan tombol **Pakai
  pembagian ini** (Use this split) untuk yang boleh mengedit task.
- **Final**: angka yang dipakai, lengkap dengan asalnya (Math / AI / Manual / Legacy) dan statusnya (Draft, Proposed,
  Approved, Locked, Re-baseline needed).

Yang bisa kamu lakukan:
- **Calculate**: menghitung ulang.
- **Change value**: kalau tidak punya izin mengubah, perubahanmu menjadi usulan, dengan alasan.
- **Approve & lock**: hanya untuk yang berhak, dan tidak bisa untuk task yang ditugaskan kepadamu sendiri.

Setelah estimasi dikunci, kolom Estimate di task dan di grid menjadi abu-abu, dengan keterangan siapa yang
menguncinya.

**Konteks tim untuk AI.** Setelah AI memberi saran, kamu bisa memberi tahu AI hal-hal yang tidak tertulis di brief.
Konteks ini disimpan di task dan ikut dikirim setiap kali AI ditanya untuk task ini, termasuk saat AI ditanya ulang
otomatis setelah brief direvisi.

- Di daftar **It assumes** (Asumsinya), tiap asumsi punya dua tombol: **✓ Right** (Benar) dan **✗ Wrong** (Salah).
  Kalau kamu memilih Salah, muncul kolom **What is true instead…** (Yang sebenarnya…), maksimal 200 karakter.
  Contoh: "1 revision round" → Salah → "klien ini biasanya minta 3x revisi". Klik tombol yang sama sekali lagi
  untuk membatalkan tandanya. Paling banyak 8 asumsi bisa ditandai.
- Di bawah baris skor ada kotak **Add context for the AI** (Tambah konteks untuk AI), maksimal 1.000 karakter,
  dengan penghitung karakter. Contoh: "klien ini biasanya minta 3x revisi; foto produk dari klien baru masuk H-2."
- **Send & ask again** (Kirim & tanya ulang) menyimpan konteks lalu langsung bertanya ulang ke AI. Ini memakai satu
  jatah Ask AI. Tombol ini aktif kalau ada yang berubah, atau kalau sarannya sudah tidak sesuai dengan task. Kalau
  jatah hari ini sudah habis, konteksnya tetap tersimpan.
- Setelah ditanya ulang, tiap baris menampilkan apa yang berubah, misalnya **Before 6 h → now 9 h** (Sebelumnya
  6 h → sekarang 9 h), dan alasannya: **Because of the team's context: …** (Karena konteks tim: …). Keterangan
  ini tetap ada setelah halaman dimuat ulang.
- Tanda pada asumsi yang tidak lagi disebut AI di saran terbaru muncul di **Saved corrections** (Koreksi
  tersimpan), dan bisa dihapus satu per satu dengan tombol ×.
- Di bawah kotak tertulis siapa yang terakhir menyimpan dan kapan: **Context from Ayu · …** (Konteks dari …).
  Kalau ada task serupa di workspace yang punya catatan, tertulis misalnya "+ 2 notes from similar tasks will be
  used" (+ 2 catatan dari task serupa ikut dipakai), dengan tautan ke task-task itu. Jadi AI belajar kebiasaan tim.
- **Clear context** (Hapus konteks) menghapus konteks task ini tanpa bertanya ke AI.
- Konteks bisa diubah oleh siapa pun yang boleh mengedit task (kecuali stakeholder). Yang lain hanya bisa
  melihatnya. Kalau external AI processing dimatikan, atau semua skor diatur **Math only**, bagian ini tidak tampil.
- Teks yang sedang kamu ketik tidak hilang selama AI ditanya atau saat panel diperbarui. Konteks tidak ikut tersalin
  saat task diduplikasi.

**Rating** untuk Story/Weighted Points: empat faktor dinilai 1–5. Nilai **Scope** disarankan dari jumlah aset
(1 → 1, 2–3 → 2, 4–6 → 3, 7–12 → 4, 13+ → 5) dan bisa diubah.

**Dokumen untuk AI.** Kalau admin mengizinkan AI membaca dokumen di brief, dan task punya dokumen, panel menampilkan
baris **Documents for the AI** (Dokumen untuk AI) di bawah baris skor. Tiap dokumen tampil sebagai chip dengan ikon
jenisnya (Google Docs, Slides, Sheets, file Drive, atau file yang dilampirkan) dan judulnya. Setelah **Ask AI**, tiap
chip menyebut apa yang terjadi: **read · 4,200 characters** (dibaca, berapa karakter), **cut to fit** (dipotong agar
muat dalam jatah teks per Ask AI), **not shared publicly** (tidak dibagikan publik), **too large** (terlalu besar),
atau **not supported** (jenis file tidak didukung), dengan alasannya bila ada (misalnya "too large · over 15 MB").
Paling banyak 5 dokumen dibaca per Ask AI; sisanya bertuliskan "not read: only the first 5 are read per ask". Di
sebelah judul baris tampil berapa karakter yang dibaca dari jatahnya, misalnya "read 14,200 of 15,000 characters".

- Yang dibaca: Google Docs, Slides, Sheets, dan file Drive yang dibagikan ke **"Anyone with the link"**, serta file
  PDF, Word, PowerPoint, dan teks yang dilampirkan ke task (disimpan di server ZenCrevia).
- **Dokumen Google yang privat tidak dibaca.** Supaya terbaca: di Google, buka **Share** → **General access** →
  **Anyone with the link** (Viewer), atau unduh filenya lalu lampirkan ke task.
- Sakelar **Use this task's documents** (Pakai dokumen task ini) mematikan pembacaan dokumen untuk task ini saja;
  chip lalu bertuliskan **will not be sent** (tidak akan dikirim). Sakelar ini bisa diubah oleh siapa pun yang boleh
  mengedit task, dan tersimpan bersama task.
- Kalau link menunjuk slide/halaman tertentu (misalnya `#slide=…` dari Google Slides, atau "slide 5" / "hal. 3" di
  samping link), AI menghitung bagian itu saja — ditambah slide lanjutannya, judul bagiannya, dan slide umum seperti
  Brand Guidelines — tidak pernah brief lain di deck yang sama. Chip menulis bagiannya ("· slide 12") dan apa yang
  dikirim; kalau bagian itu tidak bisa dibaca tersendiri, dokumen itu tidak dikirim sama sekali. Isi **Slides/pages**
  (Slide/halaman) di chip, misalnya `12–13`, untuk menentukan slide-nya sendiri; tersimpan bersama task.
- Kalau fitur ini dimatikan untuk workspace, tidak ada yang tampil tentang dokumen (admin melihat satu baris kecil
  dengan tautan ke pengaturannya).

**Log waktu.** Selama Effort Hours aktif, kolom **Actual** diganti total jam yang dicatat, dengan tombol
**Log time**. Catat jam kerjamu per tanggal sebagai Kerja, Revisi, atau Terblokir. Actual = kerja + revisi,
dibulatkan ke 15 menit. Waktu terblokir dicatat tapi tidak dihitung. Kamu hanya mencatat jam milikmu sendiri.
Pembetulan jam orang lain hanya bisa oleh yang berhak, dan wajib disertai alasan.

**Poin aset.** Kalau modulnya aktif, panel juga menampilkan poin output tiap orang dari jumlah asetnya. Poin ini
dihitung per jenis pekerjaan: 1 post feed = 1 poin, resize 0,25, reels 3, logo 5.

**Bonus efisiensi.** Kalau aktif, baris bonus tampil hanya untuk yang mendapat kredit, approver, dan pemegang izin
analytics. Contohnya: "Estimated 8h · Actual 5h · Saved 3h · Base 8 pts · Efficiency Bonus +1,10 pts · Earned 9,10 pts
· Pending/Approved". Bonus di-approve oleh orang yang tidak ikut mengerjakan task. Ini angka operasional, bukan gaji
atau ranking.


## 5. Calendar

Cakupan **Mine / Team**, ditambah seluruh filter task.

Tiga mode: **Month** (maksimum 3 chip per hari), **Week** (maksimum 12), dan **Day**
(daftar vertikal). Navigasi dengan `‹` `›` dan tombol **Today**.

Pilihan **Month / Week / Day** (**Bulan / Minggu / Hari**) selalu berada di satu bar abu-abu panjang, di mana pun
kalender muncul (layar Calendar, tampilan Calendar di Tasks, tab Calendar sebuah project, halaman tim), dengan
mode yang dipilih sebagai pil di dalamnya. Cakupan (**Mine / Team**, di Tasks **Mine / All**) adalah kontrol
tersendiri dengan bar-nya sendiri; di ponsel cakupan berupa satu tombol putih berikon orang ("Tim", "Saya",
"Semua") di kiri bar, terpisah darinya, yang sekali ketuk berganti. Dengan keyboard, Tab masuk ke mode yang
dipilih dan tombol panah (atau Home / End) memindahkannya.

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

Panel **Workload by person** dan **Stakeholders** ada di bawahnya. Di samping jam tiap orang
ada jumlah **aset yang dihasilkan** (total; arahkan kursor untuk yang sudah terkirim dan bulan ini). Aset
dikreditkan ke orang yang mengunggah versinya; kalau sebuah task tidak punya versi, aset
diperkirakan dari assignee dan angkanya diberi tanda \*.

**Bar Smart Scoring.** Kalau admin menyalakan Smart Scoring, di bawah bar utilisasi (jam) setiap kartu tim, di bawah
bar beban kerja tiap orang, dan di halaman tim (di bawah kotak-kotak KPI) ada bar kecil untuk **4 minggu terakhir**:
- **Story Points / Weighted Points / Poin aset** (hanya modul yang ON) — poin task yang jatuh tempo dalam 4 minggu
  terakhir (kecuali Declined) dibanding yang sudah selesai, misalnya `34 / 40 poin · 85%`. Task tanpa skor tidak
  dihitung dan disebut di keterangannya. Task yang dikerjakan beberapa orang dibagi rata per orang; poin aset
  mengikuti kredit aset masing-masing. Kalau tidak ada yang direncanakan, tertulis *tidak ada yang direncanakan dalam
  4 minggu terakhir*.
- **Akurasi estimasi** (kalau Effort Hours ON) — dari task yang selesai dalam 4 minggu terakhir dengan estimasi
  terkunci dan waktu tercatat di log waktu, berapa yang selesai dalam selisih ±20%, misalnya `7 dari 9 task dalam
  ±20% · 78%`. Tanpa task seperti itu: *belum ada data* (bukan 0%).

Arahkan kursor ke sebuah bar untuk melihat apa yang dihitung, atau ketuk bar / tombol **?** untuk membukanya. Bar tim
terlihat oleh semua anggota. Bar per orang terlihat oleh orang itu sendiri, lead timnya, dan pemegang izin analitik —
atau oleh semua orang kalau admin memilih **Semua orang di workspace** di Settings → Smart Scoring → **Akses &
visibilitas** → **Teams screen**.
Stakeholder tidak melihat bar ini. Urutan orang tidak pernah diubah menurut angka ini: ini angka operasional untuk
belajar, bukan peringkat.

### Halaman tim

KPI Utilization / Open tasks / In review / Overdue, lalu panel **Members** (dengan badge
`primary`, `secondary`, `lead`), **Workload**, dan **Team tasks**.

### Halaman anggota

Foto (klik untuk mengganti), nama, jabatan, badge role dan tim, angka **Capacity** (jam/minggu),
serta KPI Utilization / Open tasks / To review / Overdue / **Assets produced** (total, dengan jumlah
yang sudah terkirim dan bulan ini di bawahnya). Lead sebuah tim juga punya KPI **Aset tim**.

### Aset dihasilkan, per orang

- Task dengan **satu orang**: satu angka **Aset dihasilkan**, seperti biasa.
- Task dengan **lebih dari satu orang**: di bawah **Aset & versi**, setiap orang punya angkanya
  sendiri — berapa aset yang *dia* hasilkan, bukan total yang dibagi rata. **Total** task adalah
  penjumlahannya. Selama belum diisi, angka yang tampil adalah perkiraan laporan (dari siapa yang
  mengunggah versi, atau dibagi rata) dan ditandai begitu. Total tidak bisa diketik di tempat lain
  selama ada angka per orang.
- Bagian ini terlipat jadi satu baris (siapa, berapa, total); klik untuk membukanya. Terbuka atau
  terlipat diingat per orang.
- **Validasi oleh team lead** — lead tim task itu, atau lead tim salah satu orang yang dihitung (dan
  admin), melihat badge **Belum divalidasi** / **Divalidasi** / **Berubah sejak divalidasi** dan tombol
  **Setujui jumlah**. Member tidak melihatnya. Angka tetap dihitung normal walau belum divalidasi;
  angka yang diubah setelah divalidasi tampil sebagai *berubah sejak divalidasi* untuk disetujui lagi.
  Berlaku juga untuk task dengan **satu orang**: badge dan tombol ada di baris angkanya.
- Tanpa angka per orang, laporan memberi kredit ke yang mengunggah versi; kalau tidak ada unggahan,
  dibagi rata ke assignee dan ditandai `*` (perkiraan).
- **Settings → Teams → Aset dihasilkan, per orang** (yang mengelola workspace):
  - **Team lead ikut terhitung dari aset timnya** (default) — setiap orang tetap punya angkanya
    sendiri; lead tim (yang dipilih sebagai *Lead* di tim itu) juga mendapat angka **Tim**: yang
    dihasilkan anggota tim yang dipimpinnya, termasuk dirinya. Tampil di samping angkanya sendiri,
    di halaman anggota, dan di kolom **Team assets (as lead)** sheet Workload. Angka orang-orang
    tidak dijumlah dua kali.
  - **Per anggota saja** — setiap orang hanya menghitung asetnya sendiri; tidak ada angka tim.

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

- **Template**: mengikuti keluarga poster workspace — Thumbnail video (objek 3D / orang),
  Feed edukasi, Feed ajak komen & DM, Kompetisi & promo, Market highlight mingguan,
  Story peluncuran produk, Story webinar — atau Blank. Template membawa adegan, ukuran,
  layout, teks contoh, warna judul/subjudul, gaya tombol, perataan, dan disclaimer-nya
  sendiri. Semuanya bisa diubah admin di **Pengaturan → AI → Providers → AI Hub — prompt templates**.
- **Layout Poster** — judul di atas, visual di tengah, subjudul dan tombol di bawah,
  disclaimer rata tengah di baris-barisnya sendiri.
- **Canvas size**: Website hero 1920×720, Thumbnail 16:9 1280×720, Social square 1080×1080,
  Feed portrait 4:5, Feed potret 3:4 1080×1440, Story/Reels 9:16, Display 300×250 / 728×90 / 300×600,
  Email header 1200×400, Poster A2, atau **Custom size…** (64–4096)
- **Karakter brand** — muncul bila admin sudah menambahkan orang acuan di
  **Pengaturan → AI → Providers → Brand characters**. Pilih maksimal dua; template yang berisi
  orang memilihnya otomatis. Foto hanya dikirim ke model yang menerima gambar referensi
  (mis. GPT Image, Nano Banana); Magnific Mystic tidak bisa mempertahankan wajah.
- **Font brand** — font yang di-upload admin (Pengaturan → AI → Providers → Brand fonts)
  muncul di semua pilihan font AI Hub dan di editor template.
- **Font lalu Gaya** — pilih keluarga font dulu (mis. Stolzl, atau font Google seperti Poppins), lalu
  gayanya (Thin, Light, Regular, Medium, Bold …). File font brand dikelompokkan otomatis dari namanya.
- **Simpan sebagai template** (ikon bintang, untuk role yang diizinkan) — kanvas menjadi template
  untuk semua orang. Template yang dibuka bisa diubah di kanvas lalu di-**Update**, disimpan
  sebagai template baru, atau dihapus (pembuatnya dan admin).
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

**Smart Scoring** (kalau admin menyalakannya) menambah satu bagian di bawahnya. Isinya:
- estimasi vs aktual dan akurasinya: estimasi yang dikunci dan jam dari log waktu dihitung terpisah dari angka lama;
- velocity menurut ukuran kapasitas workspace;
- asal angka (math / AI / manual);
- first-pass approval dan siklus review;
- base point dan bonus efisiensi (dipisah);
- poin aset;
- progress KPI/OKR.

Jam dan poin tidak pernah digabung jadi satu skor, dan orang tidak pernah diurutkan sebagai ranking. Pemegang izin
analytics Smart Scoring melihat seluruh tim. Yang lain melihat angkanya sendiri, termasuk di halaman profilnya.

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
  Sheet **Workload** memuat **Assets produced**, **Assets delivered** (task selesai), dan
  **Asset credit** (diisi per orang, dari unggahan versi, atau perkiraan dari assignee) untuk tiap
  orang, plus **Team assets (as lead)** untuk lead tim bila pengaturannya aktif. Slide
  **Workload by person** menulis jumlah aset di bawah nama, dan **Performance by person**
  menampilkannya sebagai salah satu angka.
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

> **Automation** (auto-hide task selesai, auto-archive project, dan alur review) **bukan**
> preferensi pribadi. Itu pengaturan workspace yang hanya bisa diubah admin.

**Settings → Automation → Review & revision** mengatur:

| Pengaturan | Pilihan (default dicetak tebal) |
|---|---|
| Minta revisi memindahkan task ke | **Tahap revisi**, stage lain yang belum selesai, atau Jangan pindahkan task |
| Sebelum dikembalikan | **Langsung kirim — catatan bisa menyusul**, atau Minta catatan dulu |
| Prioritas saat dikembalikan | **Tetap seperti prioritas task**, Jadikan Tinggi, Jadikan Mendesak |
| Versi yang sudah disetujui | **Masih bisa dikembalikan untuk revisi**, atau Tetap disetujui |
| Versi baru (Sudah direvisi, atau dari komentar) | **Menunggu Kirim untuk review**, atau Langsung masuk review (kalau task punya reviewer) |

Task yang sudah selesai dan dikembalikan selalu keluar dari stage selesai, walaupun pilihannya
"Jangan pindahkan task".

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
