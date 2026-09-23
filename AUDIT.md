## 1.6.0 — Outer glow, shape, dan gradient (10 September 2026)

- Outer glow/Cahaya luar tersedia per layer melalui Efek, dengan warna, opasitas 0–100%, dan blur 0–200 px. Glow dirender pada komposisi akhir bersama layer dan mengikuti visibilitas/opasitas layer. Drop shadow tetap tersedia. Glow yang melewati tepi kanvas terpotong oleh ukuran desain.
- Shape tambahan: belah ketupat, segi lima, segi enam, bintang, panah, chevron, dan jajar genjang. Semua memakai mekanisme resize, rotate, urutan, duplikat, serta snap yang sudah ada. Kontrol radius disembunyikan untuk bentuk yang tidak memakainya.
- Gradasi melingkar/radial tersedia pada latar kanvas, isi shape, warna teks, dan latar teks. Pusat berada di tengah bidang; warna pertama di tengah dan warna kedua di luar. Kontrol sudut hanya tampil pada mode linear.
- Shape linear memiliki kontrol sudut 0–360°. Bug angka 0 yang sebelumnya jatuh ke 135° diperbaiki. Gradient shape, teks, dan kotak latarnya memakai batas objek, bukan seluruh kanvas atau koordinat asal yang keliru; desain lama dengan gradient dapat terlihat berbeda akibat koreksi ini.
- Efek dan gradient ikut preset, clipboard, snapshot galeri, serta hasil ekspor. Tidak ada panggilan AI berbayar selama pengujian.
- Validasi: 64 tes lulus, termasuk geometri shape, gradient lokal/0°, radial, glow dengan opasitas nol, dan independensi snapshot. Browser: kontrol glow, shape bintang, gradient radial/linear, sudut 0°, radial kanvas tanpa kontrol sudut; PNG siap unduh diperiksa secara visual dan menampilkan glow serta gradasi melingkar.

## 1.5.3 — Posisi favorit galeri (10 September 2026)

- Favorit dipindah ke kanan judul kartu agar mudah ditemukan. Salin & edit, Edit, dan Kelola tetap di footer dengan divider. Footer kosong untuk viewer disembunyikan.

## 1.5.2 — Tata letak kartu AI Gallery (10 September 2026)

- Semua tombol aksi, termasuk favorit, dipindahkan ke footer dengan divider dan tinggi kontrol konsisten. Footer sejajar antar kartu pada baris yang sama, meski jumlah tombol atau catatan berbeda.
- Pemilik memakai avatar foto/inisial yang sama dengan kalender, disertai nama dan tanggal pembaruan. Akun yang sudah tidak tersedia memakai label Mantan anggota. Judul dibatasi dua baris dengan nama lengkap pada tooltip/detail.
- Tampilan pemilik pada detail desain memakai komponen yang sama. Hak akses dan isi desain tidak berubah.
- Validasi: build dan 60 tes lulus. Uji browser memeriksa footer sejajar, avatar, aksi favorit, dan lebar mobile 390 px tanpa overflow horizontal pada halaman maupun footer.

## 1.5.1 — Garis bantu dan snap dari ruler (10 September 2026)

- Penggaris atas/kiri dapat ditarik untuk membuat guide horizontal/vertikal. Garis dapat diseret, diisi koordinatnya lewat klik dua kali, dihapus dengan Delete/Backspace atau ditarik keluar area kanvas. Esc membatalkan drag; Undo/Redo mencakup perubahan guide.
- Layer menempel pada guide melalui sisi atau titik tengah dengan toleransi 6 piksel layar. Pilihan beberapa layer memakai batas gabungan layer yang dapat digeser; layer terkunci tidak bergerak. Alt melewati snap sementara.
- Tombol Garis bantu menyediakan opsi tampil, snap, tambah garis di tengah untuk layar sentuh, dan hapus semua. Guide tersembunyi/di luar kanvas tidak dipakai untuk snap. Maksimal 100 guide.
- Metadata guide tersimpan bersama preset, desain galeri, dan salinan independen; server memvalidasi axis, ID, jumlah, serta koordinat. Guide berupa overlay editor sehingga tidak masuk ekspor atau thumbnail.
- Validasi: 60 tes lulus. Uji browser mencakup drag dari kedua ruler, posisi presisi, snap tepi layer dengan selisih 0 piksel, Delete/Undo, dan label Indonesia–Inggris. Tes juga mencakup snap grup, perlindungan layer terkunci, toleransi pada berbagai zoom, koordinat pan, serta validasi/pemisahan snapshot galeri. Snap berlaku pada perpindahan layer; resize/rotate belum memakai guide.

## 1.5.0 — AI Gallery, clipboard, ekspor, dan navigasi kanvas (10 September 2026)

- Halaman AI Gallery dapat dibuka dari AI Hub, menu akun, dan menu Lainnya pada mobile. Ikon galeri disamakan di semua titik masuk.
- Simpan snapshot desain dengan nama, pemilik, tag, catatan, thumbnail, gambar, prompt dan layer yang dapat diedit kembali. Kredensial provider dan referensi unggahan tidak ikut snapshot.
- Anggota dengan izin unggah/kelola aset dapat menyimpan dan membuat salinan atas nama sendiri. Viewer dapat melihat dan memberi favorit. Pemilik mengelola file sendiri; admin mengelola metadata dan arsip workspace. API memeriksa kepemilikan dan membatasi setiap query pada workspace aktif.
- Salinan menyimpan asal desain. Perubahan pada salinan tidak menimpa file sumber. Revisi yang sudah berubah ditolak untuk mencegah penimpaan pekerjaan di tab lain.
- Tambahan pencarian nama/tag/catatan, favorit pribadi, filter milik sendiri, arsip/pulihkan, dan pagination 24 kartu. Kondisi filter kosong menyediakan dua tombol: buka AI Hub atau lihat semua desain galeri.
- Catatan 2.000 karakter bisa ditulis saat simpan, salin, atau kelola; dapat dibuka di kartu dan detail. Catatan salinan berdiri sendiri.
- Checkbox layer dan angka hitungan header dihapus. Area nama/baris mendukung drag, dengan ambang gerak agar klik dan Shift+klik tetap berfungsi. Kontrol mata/gembok/hapus tidak berubah menjadi area drag.
- Ikon duplikat pada judul pilihan, Ctrl/Cmd+D, dan clipboard layer Ctrl/Cmd+C/V. Layer tambahan mempertahankan gaya, skala, urutan dan posisi; layer bawaan dapat disalin menjadi layer tambahan mandiri. Shortcut tidak mengganggu input teks atau modal.
- Unduh membuka pilihan PNG/JPEG/PDF, nama file, dan skala 0,25–4×. File disiapkan sebelum tautan unduh aktif. Batas 8192 piksel per sisi/32 megapiksel. PDF berisi satu halaman gambar dengan rasio desain, bukan layer vektor. Pembesaran bukan AI upscaling.
- Ruler horizontal/vertikal, Alt+scroll untuk zoom di kursor, tombol tengah mouse atau Space+drag untuk pan, serta Shift+R untuk toggle ruler. Zoom/pan mengubah tampilan saja. Ruler dan selection handles tidak masuk ekspor.
- Bar zoom menyisakan − / persentase rata tengah / + / Fit. Tombol bantuan dipindah ke samping safe zone; tinggi dan lengkungan kontrol diseragamkan.

Validasi: 53 tes otomatis lulus, termasuk API produksi untuk galeri, isolasi workspace, kepemilikan, viewer, arsip, catatan, salinan independen, konflik revisi, payload tidak aman, clipboard lintas unit, drag, input shortcut, koordinat zoom/ruler, pan, dimensi ekspor, dan struktur PDF. Uji UI mencakup simpan/salin anggota, viewer, favorit, persistensi setelah dibuka ulang, catatan kartu, keadaan filter kosong, EN/ID, serta tata letak kontrol desktop/mobile. Satu PDF hasil unduhan dibuka dan dirender untuk pemeriksaan visual. PNG 2880×1080 dan JPEG 960×360 dari tautan siap unduh telah diperiksa format, dimensi, dan tampilan gambarnya; ruler serta seleksi tidak masuk hasil ekspor. Browser uji tidak memberikan event/file unduhan PNG/JPEG pada percobaan otomatis; alur akhirnya memakai tautan file siap unduh yang terlihat, bukan memicu unduhan di belakang proses encoding. Pengunduhan PNG/JPEG ke filesystem pada browser pengguna masih perlu diverifikasi di lingkungan pemakaian.

Mode standalone menyimpan galeri di IndexedDB browser yang sama; berbagi lintas perangkat memerlukan versi server dan akun workspace yang sama. Snapshot server ikut backup SQLite. Gambar disertakan agar tidak tergantung URL AI sementara. Arsip tetap memakan ruang disk karena dapat dipulihkan. Tidak ada layanan publik baru, perubahan izin Google Drive, atau panggilan AI berbayar selama pengujian.

## 1.4.0 — Pilihan beberapa layer dan audit bahasa AI Hub (9 September 2026)

- Shift+klik (atau Ctrl/Cmd+klik) pada daftar maupun kanvas menambah/melepas pilihan layer. Kotak centang tersedia untuk layar sentuh; Ctrl/Cmd+A atau Pilih semua memilih layer yang terlihat dan tidak terkunci.
- Panel beberapa layer menampilkan jumlah pilihan dan enam arah alignment. Batas pilihan menjadi acuan bawaan; pengguna dapat memilih Kanvas sebagai acuan. Layer terkunci dapat menjadi acuan tetapi tetap pada posisinya.
- Pilihan dapat digeser bersama, digeser dengan panah (Shift = 10 px), dihapus, dikunci/buka kunci, dan dinaikkan/diturunkan sambil mempertahankan urutan relatif. Ctrl/Cmd+D menggandakan layer tambahan yang terpilih. Satu operasi bersama memakai satu langkah Undo.
- Pintasan alignment: Alt+Shift+L/C/R untuk kiri/tengah horizontal/kanan dan Alt+Shift+T/M/B untuk atas/tengah vertikal/bawah. Esc membatalkan pilihan. Shortcut pengetikan di kolom tetap dipertahankan.
- Klik sekali memilih layer; klik dua kali teks untuk mengedit. Cara ini mencegah editor teks terbuka saat memilih beberapa layer.
- Audit EN–ID: melengkapi Position, Opacity, Follow layout, pilihan font workspace, warna, latar, garis tepi, bayangan, logo, ukuran, dan tooltip. Prompt generasi spesifik diganti Prompt khusus untuk gambar ini; Visual brief menjadi Arahan visual. Nama model, isi desain, prompt, serta nama layer buatan pengguna tetap sebagai konten pengguna.
- Validasi: 37 tes otomatis lulus. Browser: Shift+klik dua layer, alignment, Ctrl+A, shortcut alignment, serta pergantian Indonesia–English diperiksa. Tidak ada permintaan ke provider AI.

## 1.3.0 — Kontrol kanvas dan shortcut (9 September 2026)

- Ikon mata tersembunyi diganti eye-off, dan enam tombol alignment menggunakan SVG yang konsisten serta tooltip. Lebar minimum tombol tidak lagi membuat deretan alignment meluber.
- Shape baru: persegi membulat dan pill untuk desain tombol. Rectangle, ellipse, dan triangle lama tetap kompatibel.
- Shape dapat diubah lebar/tingginya dari delapan pegangan kanvas. Menggeser satu sisi mempertahankan sisi lawannya. Semua jenis layer memiliki pegangan rotasi; Shift saat memutar menggunakan kelipatan 15 derajat. Layer terkunci tidak dapat ditransformasi.
- Skala headline dan subheadline diterapkan pada layer masing-masing, setelah tata letak dasar dihitung, sehingga tidak mengubah ukuran maupun posisi layer lainnya. Desain lama dengan headlineScale bukan 100 dapat terlihat berbeda pada layer pendamping yang sebelumnya ikut membesar akibat bug.
- Zoom tampilan 10–400%, input persentase, tombol +/- dan Fit/Pas layar. Zoom 100% berarti satu piksel desain per piksel CSS. Kanvas dapat digulir saat diperbesar; ukuran PNG tetap sesuai ukuran desain.
- Shortcut saat editor aktif: Delete/Backspace hapus layer; panah geser 1 px, Shift+panah 10 px; Ctrl/Cmd+Z undo; Ctrl/Cmd+Shift+Z atau Ctrl+Y redo; Ctrl/Cmd+D duplikat layer tambahan; Ctrl/Cmd+[ atau ] ubah urutan; Ctrl/Cmd+Shift+L kunci/buka kunci; T tambah teks; R tambah persegi membulat; +/- zoom; 0 pas layar; Esc batalkan pilihan.
- Shortcut layer tidak berjalan saat mengetik di kolom input, textarea, dropdown atau teks kanvas, dan tidak menghapus layer terkunci. Daftar shortcut tersedia lewat tombol ? pada toolbar kanvas.
- Validasi: 34 tes otomatis lulus termasuk isolasi skala headline, resize shape dengan rotasi, serta perlindungan shortcut saat mengetik/terkunci. Browser lokal: drag lebar mempertahankan tinggi, pegangan rotasi, Delete/Undo, ikon eye-off, pilihan pill, zoom 100% berukuran 1920 px untuk desain 1920 px. Tidak ada pemanggilan provider AI.

## 1.2.1 — Navigasi Properties (9 September 2026)

- Ikon status layer memakai gembok terbuka/tertutup dengan label aksesibel. Layer terkunci menawarkan tombol Buka kunci untuk mengedit.
- Daftar layer dapat dilipat; layer terpilih memakai aksen tema workspace. Tombol ikon lebih ringkas tanpa lingkaran yang mendominasi.
- Tombol naik/turun memakai panah dan label singkat. Hapus tersedia di baris layer dan di sebelah nama layer terpilih.
- Bagian properti memakai jarak yang konsisten dan mengingat kondisi terbuka/tertutup selama sesi editor. Effects tertutup secara bawaan.
- Input, warna, garis, dan tombol mengikuti token tema aplikasi, termasuk mode gelap. Label Image/Gambar menggantikan PNG / image.
- Validasi: 31 tes otomatis lulus. Pemilihan layer, kunci/buka kunci, serta lipat daftar diuji di browser. Pemeriksaan layar sempit 390 px tidak menemukan overflow horizontal.

## 1.2.0 — Layer inspector dan perlindungan teks (9 September 2026)

- Layer dapat diurutkan dengan menyeret pegangan di kiri, tombol Bring forward / Send backward, atau tombol panah keyboard saat pegangan terfokus. Urutan teratas tampil paling depan.
- Ikon hapus tersedia pada setiap baris dan tombol Delete layer pada properti layer terpilih. Undo dapat mengembalikan perubahan. Layer terkunci tidak dapat dipindah atau dihapus melalui kontrol ini.
- Properties memakai bagian Position, Layout (sesuai jenis layer), Content, Appearance, dan Effects yang dapat dilipat. Kontrol warna, outline, bayangan, dan styling sebelumnya tetap tersedia.
- Canvas > Text protection aktif secara bawaan. Bagian latar AI di belakang teks ditutup menggunakan warna kanvas dengan padding 24 px yang dapat diubah. Area mengikuti posisi, ukuran, dan rotasi teks, termasuk saat ekspor PNG dan simpan ke Assets.
- Perlindungan diterapkan pada komposisi aplikasi, bukan jaminan bahwa provider AI akan menghasilkan komposisi sempurna. Gambar AI asli tetap raster; layer gambar/bentuk yang ditambahkan sendiri tetap mengikuti urutan yang dipilih pengguna. Perlindungan dapat dinonaktifkan di Canvas.
- Validasi: 31 tes otomatis lulus; urutan drag dan tampilan Properties diperiksa melalui browser lokal. Tidak mengirim permintaan berbayar ke provider AI.

# Audit ZenCrevia 1.1.0

## AI Hub: editor layer dan prompt brand — 8 September 2026

Permintaan: memperluas penyuntingan desain di AI Hub dan menyediakan prompt bawaan untuk konsistensi brand.

- Layer bawaan maupun layer tambahan dapat diurutkan dengan Majukan/Mundurkan layer, disembunyikan, dikunci, diputar, dan diberi transparansi. Daftar layer menampilkan urutan teratas terlebih dahulu. Tombol perataan menempatkan layer ke tepi atau tengah kanvas.
- Layer tambahan mendukung duplikasi dan penggantian nama. Teks mendukung beberapa baris, font, ketebalan, miring, garis bawah, perataan, lebar kotak teks, jarak baris, gradien, outline, latar, dan bayangan.
- Bentuk persegi panjang, elips, dan segitiga mendukung warna, gradien, ukuran, outline, sudut membulat, dan bayangan. Layer gambar memiliki pengaturan kecerahan, kontras, saturasi, dan sudut membulat.
- Urutan pemuatan gambar dibuat berurutan agar penumpukan layer stabil. Preview, unduhan PNG, dan simpan ke aset memakai komposisi yang sama.
- Pergerakan layer mengikuti ukuran kanvas yang terlihat, termasuk ketika kanvas diperkecil di ponsel. Bingkai seleksi portrait mengikuti ukuran kanvas, tanpa ruang kosong yang menggeser posisi kontrol. Klik/seret pada kanvas memperbarui panel properti.
- Preset menyimpan struktur layer dan styling, sehingga dapat dibuka kembali untuk diedit. Mengedit metadata preset di Pengaturan mempertahankan layer tambahannya.
- Pengaturan AI memiliki kolom **Brand default prompt / Prompt brand bawaan** hingga 4.000 karakter. Nilai lama House style tetap digunakan. Prompt khusus dan templat tetap menyertakan aturan brand. Versi server menambahkan aturan yang tersimpan sebelum meneruskan permintaan ke provider, termasuk saat browser tidak menyertakannya.

Verifikasi: 29 pengujian otomatis lulus. Pengujian baru mencakup penumpukan layer, urutan hit-test, transparansi nol, rotasi, perataan px/persen, penguncian, urutan pemuatan gambar, retensi layer pada preset, dan penyertaan aturan brand di browser/server. Pemeriksaan browser mencakup teks beberapa baris, duplikasi, penguncian, preset, ekspor PNG, pengaturan prompt, serta ukuran layar 390×844 dan 768×1024. Tidak ada panggilan ke provider AI berbayar dalam pengujian ini.

Batas kemampuan: gambar hasil generasi tetap berupa satu latar raster; objek di dalam gambar tidak otomatis dipecah menjadi layer. Teks, gambar unggahan, bentuk, dan elemen desain yang ditambahkan melalui editor tetap bisa diedit. Prompt brand membantu mengarahkan hasil AI, tetapi hasilnya tetap perlu ditinjau. Pengaturan dan preset pada demo standalone mengikuti sifat demo: tidak menjadi penyimpanan server permanen.

Petunjuk penggunaan: `AI-HUB-GUIDE.md`.

## Keamanan tahap 1 dan 2 — 6 September 2026

Perubahan ini menerapkan pengamanan yang sebelumnya direkomendasikan dan mengganti identitas demo bawaan menjadi **ZenCrevia**. Struktur utama dashboard, data contoh pekerjaan, dan alur pengguna tetap dipertahankan.

| Area | Sebelum | Setelah |
|---|---|---|
| Akun awal | Password dan kode undangan contoh tetap serta mudah ditebak | Admin memakai password dari environment atau password acak sekali tampil; anggota demo belum memiliki password; kode undangan acak |
| Pendaftaran | Dapat terbuka pada instalasi baru | Tertutup secara bawaan dan harus diaktifkan admin |
| Password dan sesi | Password pendek diterima; sesi 30 hari; token sesi tersimpan langsung | Minimal 12 karakter dengan kombinasi karakter; sesi 12 jam; token sesi di-hash; cookie produksi aman |
| Serangan login | Percobaan login tidak dibatasi | Maksimal lima kegagalan per IP dan email dalam 15 menit secara bawaan |
| Permintaan browser | Perubahan data tidak memeriksa origin | Request yang mengubah data harus berasal dari aplikasi atau origin yang diizinkan |
| Perlindungan browser | Header keamanan belum lengkap | CSP, anti-framing, anti-sniffing, kebijakan referrer/permission, dan HSTS produksi aktif |
| AI | Kunci tersimpan sebagai teks biasa; konteks dapat dikirim setelah provider disetel | Kunci dienkripsi; provider eksternal serta konteks workspace mati secara bawaan dan perlu persetujuan terpisah; endpoint dibatasi ke HTTPS dan hostname yang diizinkan |
| Google Drive | Unggahan demo dapat dibuat publik otomatis | `Anyone with the link` mati secara bawaan; folder tim privat dan izin Google dijelaskan; Shared Drive didukung |
| Berkas dan input | Request hingga 25 MB dan validasi tautan/pratinjau terbatas | Batas bawaan 12 MB; data gambar hanya PNG/JPEG/WebP; tautan file wajib HTTPS; nama file dibatasi |
| Backup | Hanya snapshot JSON dari browser | Backup SQLite terenkripsi AES-256-GCM, pemeriksaan integritas, retensi, jadwal produksi, tombol admin, dan proses restore dengan pengaman |
| Fitur berisiko | Reset demo serta pergantian identitas admin dapat tersedia pada server | Keduanya dinonaktifkan pada produksi kecuali impersonation diaktifkan secara eksplisit |
| Audit | Tidak ada log kejadian keamanan khusus | Login, penolakan request, perubahan pengaturan keamanan, permintaan AI, impersonation, reset, dan backup dicatat tanpa secret atau isi prompt |

### Model akses Google Drive

Akses ZenCrevia dan Google Drive adalah dua izin yang berbeda. Saat file tidak dibuat publik, semua anggota yang perlu melihatnya harus menerima izin pada folder Drive, Shared Drive, atau file tersebut dan masuk dengan akun Google yang benar. Cara paling mudah adalah membagikan satu folder kepada Google Group tim: Editor untuk pengunggah dan Viewer untuk peninjau. Anggota tanpa izin Drive tetap dapat melihat data tugas yang diizinkan di ZenCrevia, tetapi tidak dapat membuka pratinjau atau file. Pihak luar dapat ditambahkan secara khusus; tautan publik digunakan hanya untuk berkas aman yang sudah disetujui.

### Verifikasi 1.0.13

- Widget **Resume Workspace Quest** di ponsel dan tablet dipindahkan ke area aman di sebelah kiri tombol AI dan di atas navigasi bawah. Lebar teks menyesuaikan layar sehingga kedua kontrol tetap dapat disentuh.
- Menu **Cloud storage** kini memuat delapan langkah konfigurasi dari Google Cloud hingga uji akses memakai akun anggota lain, beserta ringkasan siapa yang dapat membuka file privat.
- Panduan Google Drive terpisah diperluas dengan uji unggahan, uji izin Viewer/Editor, aturan akses eksternal, dan tabel hasil akses.

- 21 pengujian otomatis lulus, termasuk regresi dashboard, ekspor, menu pengaturan, lokalisasi, password, cookie, token sesi, throttling login, enkripsi kunci provider, backup terenkripsi, header/origin, default privat Google Drive, dan pengujian server produksi dari login hingga backup.
- Build server dan standalone berasal dari sumber yang sama dan seluruh blok JavaScript dapat diparse.
- Paket final tidak memuat database, sesi, log keamanan, file `.env`, kunci provider, atau backup pengguna.
- Google OAuth, email nyata, dan provider AI berbayar tetap memerlukan kredensial milik pengguna dan tidak dipanggil dalam audit.

## Dokumen legal 1.0.11

Menambahkan draf EULA, Kebijakan Privasi, Ketentuan Layanan, dan Penjelasan Pemrosesan Data AI ke folder `LEGAL`. Dokumen membedakan standalone, self-hosted, dan hosted; menjelaskan data yang dikirim oleh AI Intelligence; serta menandai identitas perusahaan, retensi, subprosesor, harga, dan forum sengketa yang masih harus diisi sebelum publikasi. Tidak ada fitur aplikasi atau pengaturan keamanan yang diubah pada versi dokumentasi ini.

4 September 2026. Sumber: ZIP dan HTML standalone yang diberikan. Berkas asli tidak ditimpa. Struktur aplikasi, desain utama, dan model penyimpanan awal dipertahankan.

## Perbaikan fungsi dan sinkronisasi

| Temuan | Perbaikan |
|---|---|
| Instalasi baru gagal karena referensi ke tugas yang belum dimasukkan | Dependensi dimasukkan sesudah semua tugas tersedia. |
| Tanggal data awal mundur sehari di Asia/Jakarta | Tanggal kalender lokal tidak lagi dipotong dari waktu UTC. |
| Edit tugas menghapus riwayat approval/revision | Versi yang masih digunakan diperbarui dengan ID tetap. |
| Estimasi pecahan jam dibulatkan saat dibaca | Pecahan jam dipertahankan. |
| Beban kerja server hanya menghitung assignee utama | Jam dibagi ke semua assignee, sesuai antarmuka. Proyek arsip dikeluarkan dari beban aktif. |
| Proyek arsip masuk daftar risiko aktif | Analitik hanya menampilkan proyek aktif. |
| Grafik standalone memakai angka contoh tetap | Dihitung dari tugas dan riwayat versi yang tersedia saat ini. |
| Kegagalan analitik server ditutupi angka demo | Ditampilkan pesan gagal dan tombol coba lagi. |
| Cache analitik tertinggal dari data | Cache dibersihkan setelah perubahan data. |
| Open in Tasks tidak membawa filter tahap | Filter status diteruskan dengan benar. |
| Pipeline, penghitung tahap, dan hasil memakai cakupan berbeda | Menggunakan tugas yang tampil, tanpa tugas tersembunyi atau proyek arsip. |
| Ringkasan ekspor mengabaikan filter daftar tugas | Ringkasan, beban kerja, proyek, dan analitik laporan mengikuti cakupan ekspor. |
| CSV hanya memuat assignee/reviewer pertama | Semua assignee dan reviewer dicantumkan. |
| Backup membuang gambar aset lokal | Pratinjau gambar ikut disimpan. |
| Tenggat bergeser pada restore di hari berbeda | Backup baru mencatat tanggal acuan; offset disesuaikan saat restore. |
| Knowledge Indonesia menimpa tampilan konten yang sudah diedit | Terjemahan contoh hanya dipakai jika konten masih sama dengan contoh. |
| Pencarian Knowledge kehilangan fokus | Fokus dan kursor dipulihkan setelah hasil berubah. |
| Penghitung pencarian aset tidak berubah | Penghitung diperbarui bersama hasil. |
| Aset dapat disimpan tanpa berkas atau sebelum unggahan selesai | Diperlukan hasil unggahan yang valid. |
| Data unggahan lama terbawa ke aset/versi baru | Status direset dan respons dari pilihan lama diabaikan. |
| Font, PDF, dan video lokal hanya tersimpan sebagai metadata tetapi disebut sukses | Diberi petunjuk menggunakan Drive; unggahan gagal tidak dicatat sebagai sukses. |
| New version aset hanya menambah angka | Meminta berkas dan mengganti berkas/tautan setelah unggah. |
| Popup Google ditutup tetapi proses menggantung | Pembatalan ditangani; token dibersihkan saat disconnect atau Client ID berubah. |
| Fungsi cloud lama menyebut sinkronisasi berhasil tanpa memeriksa koneksi | Aksi diarahkan ke konfigurasi Google Drive. |
| Gambar rusak membuat proses menggantung | Ditambahkan penanganan kegagalan baca/dekode; transparansi dipertahankan dan ukuran pratinjau dibatasi. |
| Clipboard menyebut berhasil sebelum proses selesai | Pesan sukses menunggu clipboard; kegagalan menampilkan nilai untuk disalin. |
| Respons provider gambar berupa array diteruskan sebagai URL | Respons dinormalisasi dan diperiksa sebagai URL gambar. |
| Reviewer tambahan tidak mendapat aksi review | Pemeriksaan menggunakan semua reviewer, sesuai server. |
| Progres milestone hanya meningkat | Dihitung ulang setelah perubahan milestone, termasuk saat dibuka kembali. |
| Beberapa callback sukses tetap berjalan setelah save gagal | Hasil gagal diteruskan; edit tugas dikembalikan ke keadaan sebelumnya. |
| Ganti password tersedia di demo tanpa server | Tombol profil hanya tampil pada mode server. |

## Teks antarmuka

Menghapus slogan login tentang database dan permission, keterangan KPI seperti “act now” dan “need to ship”, kalimat motivasi pada keadaan kosong, daftar menu berulang pada Settings, dan petunjuk panjang di bawah dashboard. Petunjuk unggah, warna, logo, AI canvas, dan preset diringkas. Peringatan kehilangan perubahan pada demo dan batas penyimpanan berkas tetap ditampilkan. Padanan Indonesia ditambahkan untuk teks baru.

## Validasi

- Empat pengujian backend/build: instalasi baru, tanggal/dependensi, riwayat review dan pecahan jam, beban bersama/proyek arsip, serta HTML identik dan sintaks valid.
- 62 pemeriksaan browser: halaman utama, 17 tab Settings, lima tampilan Tasks, pipeline, pencarian, validasi unggahan, Knowledge, laporan, mobile, standalone, milestone, reviewer tambahan, serta rollback save gagal.
- Tidak ada exception JavaScript yang tertangkap selama pemeriksaan browser terakhir.
- Excel dan PowerPoint berhasil dibuat. Paket ZIP dan XML diperiksa: 16 entri XML/rels pada Excel, 27 pada PowerPoint.
- HTML server, HTML di dist, dan HTML terpisah dibangun dari sumber yang sama.

Pengujian mobile memeriksa render dan meninjau tampilan, bukan seluruh gesture. Pemeriksaan ekspor memvalidasi paket dan XML, bukan pembukaan visual di Microsoft Office.

## Batas dan perubahan lanjutan

1. **Penyimpanan permanen standalone belum ditambahkan**, karena merupakan perubahan besar dan belum dikonfirmasi. Perubahan tugas tetap hanya berlaku selama sesi halaman.
2. Google Drive/OAuth, provider AI, dan email nyata belum diuji dengan akun/kredensial aktif. Perbaikan penanganan datanya tidak menjamin semua provider kompatibel.
3. Server dan standalone tidak saling menyinkronkan data. Kolaborasi realtime, penyelesaian konflik edit bersamaan, penyimpanan berkas asli selain Drive, dan restore database server lewat UI membutuhkan perubahan lanjutan.
4. Riwayat review yang sudah hilang dari database lama tidak dapat direkonstruksi dari aplikasi. Perbaikan mencegah penghapusan berikutnya.
5. Konten Knowledge yang sudah diedit ditampilkan sesuai tulisan pengguna; audit tidak menerjemahkan konten tersebut secara otomatis.

ZIP tidak memuat database, sesi login, atau berkas hasil uji.

## Koreksi 1.0.2: tab Pengaturan tidak bisa diklik

Laporan pengguna dapat direproduksi pada HTML 1.0.1: klik Theme tetap membuka Workspace. Fungsi geser menu langsung memakai pointer capture ketika tombol mouse ditekan, sehingga browser mengirim klik ke wadah menu, bukan tombol tab.

Pointer capture sekarang hanya digunakan setelah gerakan horizontal melewati ambang drag dan menu memang dapat digeser. Klik biasa tetap mencapai tombol. Klik pelepasan drag dibatalkan, tetapi klik berikutnya dan aktivasi keyboard tetap bekerja. Gestur sentuh menggunakan perilaku scroll bawaan browser.

Keterbatasan audit sebelumnya: pemeriksaan tab hanya membuka halaman lewat fungsi aplikasi; itu membuktikan halaman dapat dirender, tetapi tidak membuktikan tombol tab dapat diklik. Pengujian koreksi ini menggunakan klik mouse sungguhan di browser.

Validasi: kegagalan klik direproduksi sebelum patch; setelah patch, 35 klik berhasil (17 tab pada lebar 1440 dan 390 piksel, ditambah klik awal Workspace ke Theme). Drag, klik setelah drag, dan Enter pada tombol juga berhasil. Tidak ada exception JavaScript. Dua pengujian regresi pointer ditambahkan ke npm test. Source, HTML server, standalone, dan ZIP diperbarui bersama.

## Audit tambahan 1.0.3: bahasa Inggris dan Indonesia

Bagian ini melengkapi audit 1.0.1 dan koreksi 1.0.2 di atas. Pemeriksaan berfokus pada nama menu, keterangan pengaturan, label formulir, petunjuk singkat, tooltip, dan teks yang berubah setelah suatu jendela dibuka. Desain utama dan cara penyimpanan data tetap sama.

### Temuan dan perbaikan

| Temuan | Perbaikan |
|---|---|
| Banyak petunjuk tetap berbahasa Inggris ketika ID dipilih | Menambahkan atau merapikan 396 entri padanan antarmuka, ditambah aturan untuk penghitung dinamis. Angka ini adalah jumlah entri kamus tambahan, bukan jumlah bug. |
| Istilah workspace, review, template, dan brand bercampur | Menggunakan ruang kerja, peninjauan/peninjau, templat, dan merek sesuai konteks. Istilah produk, model AI, serta nama layanan tetap digunakan. |
| Keterangan Workflow, Brief, AI, Otomatisasi, Tata Letak, Peran, Drive, dan Backup terlalu panjang | Kalimat Inggris diringkas; versi Indonesia disesuaikan dengan arti dan tindakan yang tersedia. Petunjuk yang menjelaskan batas fitur tetap ditampilkan. |
| Otomatisasi menyiratkan semua ekspor selalu menyertakan tugas tersembunyi | Menjelaskan bahwa hasil ekspor mengikuti filter laporan; dialog ekspor membedakan tugas yang disembunyikan manual dari tugas yang disembunyikan otomatis. |
| Jam kerja disebut menentukan akhir pekan dan kapasitas harian | Keterangan dikoreksi: pengaturan disimpan sebagai acuan; kapasitas mingguan diatur pada profil. Kalender saat ini masih memakai Sabtu–Minggu. |
| Jenis tahap Review/Revision tertinggal dalam bahasa Inggris | Pilihan jenis tahap diterjemahkan, termasuk pada dialog Tambah tahap. Nilai internal tetap sama. |
| Posisi `left` pada ringkasan templat AI diterjemahkan sebagai “tersisa” | Ringkasan memakai nama tata letak, misalnya Left aligned → Rata kiri. Ukuran juga memakai nama yang terbaca, bukan kode seperti `web_hero`. |
| Ringkasan jumlah anggota memakai “1 people” atau “1 members” | Bentuk tunggal/jamak Inggris diperbaiki pada ringkasan tersebut; Indonesia memakai “1 anggota”. |
| Pilihan preset, jumlah kartu, serta penghitung ekspor kembali muncul dalam bahasa Inggris | Teks yang diperbarui setelah modal dibuka ikut diterjemahkan, termasuk saat pilihan berubah. |
| Menu mobile More dan beberapa isi menu tambahan belum mengikuti bahasa | Menu bawah dan menu tambahan diterjemahkan setiap kali navigasi diperbarui. |
| Teks menu statis yang sudah diterjemahkan tidak pulih saat kembali ke EN | Teks sumber antarmuka disimpan per elemen dan dipulihkan saat bahasa berubah. Tooltip, placeholder, dan label aksesibilitas juga mengikuti bahasa. |
| Tombol bahasa bergantung pada pointerdown | Menggunakan klik bawaan sehingga mouse, sentuhan, Enter, dan Space dapat mengaktifkannya. |
| Penerjemahan DOM berpotensi menyentuh isi textarea dan konten pengguna | Area isi, judul tugas, isi Knowledge, nama/pilihan data terkait, serta bagian yang ditandai sebagai konten dikecualikan. Deskripsi peran bawaan hanya diterjemahkan jika masih sama dengan bawaan. |
| Petunjuk kunci API, notifikasi, dan Drive belum konsisten | Kalimat dirapikan. Perintah literal `clear`, ID model, alamat API, ID izin, dan nama menu resmi Google tetap dipertahankan agar petunjuk dapat diikuti. |

Contoh perubahan:

| Konteks | Inggris | Indonesia |
|---|---|---|
| Kolom tugas | Rename, reorder, or hide task fields. Hiding a field keeps its data. | Ganti nama, urutkan, atau sembunyikan kolom tugas. Data tetap tersimpan saat kolom disembunyikan. |
| Tata letak | Choose which menu items you see. This only affects your account. | Pilih menu yang ingin ditampilkan. Pengaturan ini hanya berlaku untuk akunmu. |
| Backup demo | Demo changes last until you reload or close the page. Download a JSON backup to keep them. | Perubahan demo hanya berlaku sampai halaman dimuat ulang atau ditutup. Unduh cadangan JSON untuk menyimpannya. |

### Validasi tambahan

- 44 halaman/jendela diperiksa dalam EN dan ID: 10 halaman utama, 17 tab Pengaturan, serta 17 dialog/menu, total 88 render.
- 51 klik tab Pengaturan: seluruh 17 tab pada desktop dalam EN dan ID, serta 17 tab pada lebar 390 piksel dalam ID.
- Pengujian bug klik 1.0.2 dijalankan kembali: 35 klik, drag horizontal, klik sesudah drag, serta Enter tetap berhasil.
- Perpindahan EN → ID → EN memulihkan teks menu statis dan atribut petunjuk. Pemilih bahasa diuji menggunakan mouse dan Enter.
- Penghitung kustomisasi dan ekspor, jenis tahap, ringkasan tata letak AI, serta perlindungan isi formulir diperiksa. Kata literal `clear` tetap utuh.
- Tampilan Indonesia ditinjau melalui tangkapan layar Workflow, AI, Peran, dan Backup mobile.
- Sembilan pengujian otomatis lulus: enam regresi sebelumnya dan tiga regresi lokalisasi. Tidak ada exception JavaScript yang tertangkap dalam pemeriksaan browser tambahan.
- HTML server, HTML di ZIP, serta standalone terpisah dibangun dari sumber yang sama dan diverifikasi identik.

### Batas cakupan yang tetap berlaku

Nama dan isi data pengguna tidak diterjemahkan massal. Nama tim, proyek, label, berkas, nilai formulir, serta isi prompt kreatif dapat tetap berbahasa Inggris. Konten contoh yang berfungsi sebagai bahan kerja juga tidak diganti menjadi terjemahan baru. Pengujian bahasa ini berfokus pada antarmuka; tidak mengklaim semua kalimat bebas dalam konten atau dokumen hasil ekspor sudah diterjemahkan.

Penyelarasan kalender dengan hari kerja/zona waktu ruang kerja belum diimplementasikan; mengubahnya dapat memengaruhi jadwal dan perhitungan. Temuan dicatat dan petunjuk dikoreksi tanpa mengubah jadwal. Penyimpanan permanen standalone, sinkronisasi server–standalone, dan pengujian integrasi dengan akun nyata tetap mengikuti batas audit sebelumnya. Tidak ada perubahan besar yang diterapkan pada pembaruan ini.

## Audit tambahan 1.0.4: padding, tampilan responsif, dan optimasi

Pemeriksaan ini melengkapi seluruh temuan sebelumnya. Perbaikan dilakukan pada sumber yang sama untuk ZIP lengkap dan HTML standalone. Tidak ada perubahan pada model data, alur persetujuan, atau desain utama.

### Temuan tampilan yang diperbaiki

| Temuan | Perbaikan |
|---|---|
| Label formulir berikutnya hampir menempel ke input sebelumnya, terutama di Workspace dan AI | Jarak antarkelompok formulir 16 px; 12 px pada mode ringkas. Label mendapat jarak 7 px dari input dan tinggi baris yang lebih terbaca. |
| Konten Pengaturan memaksa kolom melebar di mobile/tablet | Kolom konten dapat menyusut mengikuti ruang tersedia. Formulir memakai kolom fleksibel; pada layar kecil, formulir Pengaturan dan modal disusun satu kolom. |
| AI keluar dari lebar layar hingga 616 px pada pengujian 390 px | Formulir, petunjuk API, baris templat, dan pengaturan logo dapat membungkus ke baris berikutnya. Tombol Simpan kembali berada di dalam panel. |
| Workflow terlalu sempit hingga kolom nama nyaris tidak terlihat | Setiap tahap pada mobile disusun sebagai nama, pilihan jenis/warna, lalu urutan dan jumlah tugas. Kontrol tetap menggunakan fungsi yang sama. |
| Kolom tugas kustom dan templat brief terlalu padat | Baris disusun ulang pada mobile. Input nama/deskripsi mendapat ruang penuh. Kode internal seperti `status` dan `prio` yang mengulang label tidak lagi ditampilkan di bawah input. |
| Tabel Anggota melebarkan seluruh halaman | Scroll horizontal dibatasi pada wadah tabel. Lebar minimum kolom nama dan jabatan dipertahankan agar isinya tidak diperas menjadi potongan pendek. |
| Tombol navigasi kalender keluar layar | Judul bulan, panah, Hari ini, dan Tampilkan label membungkus dalam susunan yang muat pada mobile. |
| Keterangan peran/pengaturan terlalu dekat dengan judul dan tombol | Padding baris, tinggi baris, serta jarak judul–keterangan dirapikan. Tombol tidak menyusut saat keterangan panjang. |
| Panel detail tugas berpotensi menghabiskan tinggi layar hanya untuk metadata | Padding detail ditambah; tinggi area metadata dibatasi dan dapat digulir. Tab tetap terlihat, sementara isi tugas dan tombol tindakan memiliki ruang tersendiri. |
| Checkbox detail tugas terpotong di sisi kiri | Margin negatif yang tidak cocok untuk checkbox dihilangkan. |
| Jendela panjang dan tombol footer terlalu rapat | Jarak formulir modal ditambah, tombol footer dapat membungkus, dan tinggi modal mengikuti tinggi viewport dinamis. |
| Toast menutupi navigasi bawah | Pada mobile, toast diposisikan di atas bilah navigasi dan teks panjang dapat membungkus. |
| Fokus keyboard kurang jelas | Tombol, pilihan, dan input Pengaturan mendapat penanda fokus yang terlihat. |
| Ctrl/Cmd+K tidak membuka pencarian yang tersembunyi di mobile | Pintasan membuka kolom pencarian sebelum memindahkan fokus. |

Ukuran panel dan formulir sekarang mengikuti isi; perubahan ini bukan pembesaran padding secara merata. Tabel, menu tab, papan, dan timeline tetap boleh memiliki scroll horizontal di dalam wadahnya jika diperlukan.

### Optimasi yang sudah diterapkan

| Bagian | Perubahan | Hasil pemeriksaan lokal |
|---|---|---|
| Pencarian global | Ketikan cepat digabung dengan jeda 140 ms. Mengosongkan pencarian langsung memulihkan halaman; navigasi membatalkan pencarian tertunda. | Simulasi mengetik `HSB Pro 2.0` secara beruntun: 11 render hasil menjadi 1, dengan kueri akhir dan hasil yang sama. |
| Font kustom | Alamat stylesheet hanya ditetapkan ketika daftar font berubah. | Tiga pemanggilan ulang pengaturan tema dengan font yang sama: 3 penulisan ulang URL menjadi 0. Ini pengukuran perubahan DOM, bukan klaim jumlah request jaringan aktual. |
| Pratinjau AI | Tidak memulai komposisi jika elemen kanvas sudah tidak ada. Render langsung membatalkan render tertunda yang duplikat. | Pemanggilan pratinjau setelah meninggalkan halaman AI: 1 komposisi menjadi 0. |
| Pemeliharaan tampilan | Aturan perbaikan disimpan di `src/refinements.css`, lalu dimasukkan ke HTML saat build. | Server dan standalone tetap memakai aturan yang identik; tidak menambah dependensi atau request CSS terpisah. |

Angka di atas berasal dari skenario lokal yang terkontrol. Tidak dinyatakan sebagai peningkatan kecepatan menyeluruh atau hasil benchmark produksi.

### Kandidat optimasi lanjutan

Bagian berikut adalah hasil audit kode, bukan perubahan yang sudah diterapkan. Prioritas akhirnya perlu disesuaikan dengan jumlah data dan keluhan penggunaan nyata. Perubahan yang menyentuh alur pemuatan data atau hasil kanvas perlu konfirmasi sebelum dikerjakan.

| Prioritas | Kandidat | Dasar temuan dan kebutuhan sebelum implementasi |
|---|---|---|
| Tinggi bila jumlah tugas besar | Pemuatan daftar secara bertahap dan query bootstrap yang lebih efisien | `/api/bootstrap` memuat semua tugas dan membaca detail per tugas. Perlu mengukur jumlah query dan waktu respons pada salinan data yang mewakili penggunaan, lalu merancang pagination tanpa mengubah cakupan pencarian, filter, atau laporan. |
| Tinggi bila daftar panjang | Render hanya baris/kartu yang terlihat | Pencarian dan sejumlah daftar membangun semua hasil menjadi HTML. Virtualisasi dapat mengurangi beban DOM, tetapi harus mempertahankan drag, pemilihan, akses keyboard, dan ekspor. |
| Sedang | Indeks pencarian lokal | Pencarian masih memindai tugas, brief, orang, aset, dan Knowledge. Jeda ketik mengurangi frekuensinya, bukan biaya satu pencarian. Indeks harus diperbarui ketika data diedit, dihapus, atau dipulihkan. |
| Sedang untuk kanvas besar | Resolusi pratinjau terpisah dari resolusi ekspor | Komposisi pratinjau masih mengikuti ukuran aset. Kanvas RGBA 4096 × 4096 sendiri membutuhkan sekitar 64 MiB sebelum buffer tambahan. Perubahan harus diuji terhadap posisi layer, teks, hit area, dan hasil unduhan. |
| Sedang | Pengelolaan komposisi gambar asinkron dan cache gambar | Komposisi memuat gambar/logo secara asinkron. Pembatalan pekerjaan lama dan cache terbatas dapat dievaluasi; jangan mengorbankan pembaruan gambar, batas memori, atau ketepatan hasil. |
| Rendah, pekerjaan pemeliharaan | Konsolidasi fungsi lama dan aturan CSS yang bertumpuk | Terdapat definisi lama yang ditimpa implementasi berikutnya, contohnya `setIntegrations`. Pembersihan bertahap perlu membandingkan perilaku sebelum/sesudah; tidak menghapus massal hanya untuk mengecilkan berkas. |

Penyimpanan permanen standalone, sinkronisasi dengan server, serta kalender yang mengikuti jam/zona kerja tetap tercatat pada batas audit sebelumnya. Hal-hal tersebut merupakan pengembangan fungsi, bukan sekadar optimasi tampilan.

### Validasi 1.0.4

- Sebelum perbaikan, terdeteksi 7 kombinasi halaman/lebar dengan overflow seluruh halaman: Pengaturan Anggota dan AI pada 768 px; Kalender, Workflow, Brief, Anggota, dan AI pada 390 px.
- Sesudah perbaikan, 75 skenario utama lolos tanpa overflow seluruh halaman atau exception JavaScript: 25 halaman/dialog/panel pada lebar 1440, 768, dan 390 px dalam bahasa Indonesia.
- Pemeriksaan tambahan mencakup 9 tab Pengaturan pada lebar 320 px, mode gelap dan ringkas, tabel Anggota yang benar-benar dapat digeser, serta urutan Workflow yang benar-benar berubah ketika tombol diklik.
- Pada layar 390 × 844, isi detail tugas memiliki tinggi sekitar 215 px dan footer tetap berada dalam layar; tab Brief tetap dapat diklik.
- Regresi bahasa dijalankan kembali: 88 render EN/ID dan 51 klik tab Pengaturan berhasil. Regresi bug tab lama: 35 klik, drag, klik setelah drag, dan Enter berhasil.
- Dua belas tes otomatis lulus, termasuk tiga tes baru untuk pencarian tertunda, pratinjau AI, dan font kustom.
- Tangkapan layar ditinjau untuk formulir Workspace, AI, Workflow, kolom tugas, Anggota, Brief, detail tugas, serta mode gelap/ringkas.
- ZIP diperiksa, tanpa database/sesi uji; HTML di server, di ZIP, dan standalone terpisah identik.

Pemeriksaan browser menggunakan Chrome headless dengan akses jaringan eksternal diblokir, sehingga juga memeriksa keadaan tanpa font eksternal. Ini belum merupakan pengujian seluruh perangkat fisik, seluruh kombinasi isi pengguna, atau benchmark dataset besar. Integrasi Google/AI/email tidak dipanggil dengan akun nyata pada audit ini.

## Audit tambahan 1.0.5: hasil ekspor PowerPoint dan Excel

Diselesaikan 5 September 2026.

Pembaruan ini memperbaiki generator ekspor pada sumber aplikasi, lalu membangun ulang HTML server dan standalone. Semua rincian audit sebelumnya tetap berlaku. Penataan Excel menjadi dashboard mengikuti permintaan terbaru pengguna; desain utama PPT dipertahankan.

### PowerPoint

| Temuan | Perbaikan |
|---|---|
| Slide metrik memiliki 12 kartu, tetapi tinggi kartu dan jarak baris masih untuk susunan 8 kartu. Baris ketiga berakhir pada 9,15 inci, melewati tinggi slide 7,5 inci. | Susunan 4 kolom × 3 baris memakai kartu setinggi 1,6 inci dan jarak baris 1,78 inci. Baris terakhir berakhir pada 6,64 inci, sehingga ada ruang untuk footer. |
| Empat kartu aset tidak memiliki ikon karena daftar ikon hanya berisi 8 entri. | Seluruh 12 kartu memiliki ikon. |
| Periode diulang di setiap kartu dan menambah teks kecil. | Periode ditampilkan sekali pada subjudul. Angka dan label mendapat ruang lebih besar. |
| Sampul menggunakan tanggal awal minggu terakhir sebagai akhir rentang laporan. | Sampul dan ringkasan memakai tanggal mulai–akhir yang benar-benar dipilih. Label grafik mingguan tetap menunjukkan awal minggu. |
| Daftar proyek memanjang ke bawah; baris anggota/tim semakin berimpitan ketika jumlahnya bertambah. | Maksimum 7 proyek, anggota, atau tim per slide. Halaman lanjutan diberi nomor dan tetap mempertahankan semua entri. |
| Tahap workflow dan minggu yang banyak membuat grafik semakin sempit. | Maksimum 12 tahap atau 10 minggu per slide, dengan skala yang sama antarslide pada bagian tersebut. |
| Bagian tindak lanjut hanya mengambil 9 tugas pertama per kategori. | Setiap panel memuat 4 tugas dengan jarak judul–penanggung jawab yang jelas. Panel lanjutan mengisi slide berikutnya; nomor urut menunjukkan bagian daftar yang sedang dibaca. Tidak ada pemotongan diam-diam pada daftar ini. |
| Judul halaman, label metrik, subjudul, dan beberapa satuan belum mengikuti bahasa pilihan. | Teks antarmuka ekspor diselaraskan untuk Inggris/Indonesia, termasuk satuan hari/jam pada kartu metrik. Nama orang, proyek, dan isi tugas tetap sesuai data pengguna. |

### Excel

| Temuan | Perbaikan |
|---|---|
| Ringkasan hanya berupa tabel tiga kolom. | Halaman Ringkasan memuat 8 kartu metrik, grafik tugas dibuat–selesai, grafik pemakaian kapasitas tim, rincian kinerja, serta tautan ke lembar detail yang dipilih. |
| Ringkasan sulit dinavigasi. | Tautan pada Ringkasan membuka lembar tujuan; setiap tabel detail memiliki tautan kembali. Tautan tidak dibuat untuk lembar yang dikecualikan. |
| Kolom dan judul tabel sempit, terutama pada bahasa Indonesia. | Lebar kolom menyesuaikan kata terpanjang pada header. Header, teks panjang, dan baris detail dapat membungkus; jarak kiri/kanan, tinggi baris, dan warna selang-seling dirapikan. |
| Header hilang ketika tabel digulir dan tidak ada filter. | Empat baris teratas dibekukan; filter tersedia pada header tabel. Header juga diulang pada hasil cetak tabel. |
| Tanggal disimpan sebagai teks; persentase disimpan sebagai angka 50 tanpa format persen. | Kolom tanggal bawaan dan kolom tanggal kustom memakai nilai tanggal Excel. Persentase disimpan sebagai 0,5 dengan tampilan 50%, sehingga dapat dihitung dan diurutkan secara benar. |
| Jam kerja pecahan dapat terlihat sebagai bilangan bulat. | Format angka mempertahankan hingga dua tempat desimal. Agregasi beban anggota tidak lagi dibulatkan langsung ke jam penuh. |
| Progres dan pemakaian kapasitas sulit dibandingkan. | Batang di dalam sel membantu membandingkan persentase, dengan nilai angka tetap terlihat. |
| Grafik berisiko kehilangan referensi jika pengguna mengekspor Ringkasan saja. | Sumber metrik dan grafik tersimpan pada Ringkasan mulai baris 46. Grafik tidak bergantung pada lembar opsional. Kartu memakai formula dengan nilai tersimpan yang cocok dengan sumbernya. |
| Kolom kustom di akhir tabel tugas tidak memiliki aturan lebar. | Setiap kolom tambahan mendapat lebar dan format dasar yang memadai. |
| Cakupan pustaka aset kurang jelas. | Lembar Pustaka aset diberi label bahwa isinya seluruh pustaka, sedangkan laporan tugas/proyek mengikuti filter ekspor. |

Ringkasan merupakan snapshot saat ekspor. Formula kartu membaca tabel metrik sumber; mengedit tugas di lembar detail tidak menghitung ulang semua analitik. Ekspor ulang dari aplikasi untuk memperbarui laporan. Jika ada lebih dari 8 tim, grafik ringkasan menampilkan 8 tim dengan pemakaian kapasitas tertinggi dan memberi keterangan; data semua tim tetap disertakan. Ringkasan memiliki area cetak satu halaman. Grafik Excel adalah objek grafik yang dapat diedit, bukan gambar.

### Validasi 1.0.5

- PowerPoint lokal membuka dan merender hasil ekspor Inggris dan Indonesia. Slide metrik, grafik, proyek, beban kerja, dan halaman tindak lanjut diperiksa secara visual. Contoh periode 1–30 September menghasilkan 9 slide; jumlah slide dapat bertambah sesuai isi laporan.
- Excel lokal membuka hasil ekspor Inggris dan Indonesia, mengenali 9 lembar dan 2 grafik, serta menghitung formula kartu dengan nilai yang sesuai. Hasil cetak Ringkasan diperiksa pada satu halaman.
- Seluruh 8 lembar detail dirender untuk memeriksa header, jarak, pembungkusan teks, dan format data.
- Dua tombol unduh yang sebenarnya pada dialog ekspor berhasil menghasilkan XLSX dan PPTX melalui browser, dengan jaringan eksternal diblokir.
- Dua belas berkas uji mencakup ekspor biasa, bahasa Indonesia, satu proyek, data kosong, Ringkasan saja, dan Tugas saja. ZIP/XML, batas slide, jumlah tugas, jumlah lembar, nilai metrik, dan formula diperiksa.
- Lima belas tes otomatis lulus. Skenario data panjang mencakup 30 tahap, 22 proyek, 23 anggota, 18 tim, 26 minggu, dan 21 tugas tindak lanjut; seluruh entri dipertahankan dan bentuk berada di dalam slide.
- Regresi Pengaturan: 35 klik tab, drag, klik setelah drag, dan navigasi Enter berhasil tanpa exception JavaScript.
- Sumber, HTML server, dan HTML standalone dikemas dalam ZIP lengkap. Salinan HTML di ZIP dan berkas standalone terpisah diverifikasi identik; database serta sesi uji tidak disertakan.

Contoh PPTX/XLSX yang disertakan terpisah memakai data demo untuk memudahkan peninjauan tampilan. Pemeriksaan aplikasi Office dilakukan pada instalasi lokal; kompatibilitas dengan setiap versi Office, Google Sheets/Slides, atau semua kombinasi isi pengguna belum diverifikasi. Tidak ada perubahan pada penyimpanan data, integrasi akun, atau alur kerja utama dalam pembaruan ini.


## Koreksi 1.0.6: legenda PPT dan tabel sumber metrik Excel

5 September 2026. Koreksi berdasarkan dua tangkapan layar pengguna setelah pembaruan 1.0.5.

- **PPT Pergerakan tugas:** penanda warna sebelumnya menempel pada tepi panel, sementara teks legenda tidak sejajar dengan pusat penanda. Legenda sekarang mendapat baris tersendiri, margin kiri/atas, ukuran penanda lebih kecil, dan perataan vertikal yang sama. Area batang dan garis dasar memiliki margin di dalam panel. Angka Dibuat dan Selesai ditampilkan di atas batang masing-masing, menggantikan pasangan angka dengan garis miring.
- **Excel baris 46 dan seterusnya:** tabel sumber sebelumnya menggunakan kolom sempit dari kisi kartu dashboard dan tinggi baris 22 pt. Nama metrik terpotong dan bertumpuk. Label sekarang memakai gabungan A:E, nilai F:G, tinggi baris minimal 36 pt, serta warna selang-seling. Tabel tim memakai I:L dan M:O. Tabel mingguan dipindahkan ke baris 65 dan mendapat kolom gabungan yang cukup lebar.
- **Format nilai sumber:** persentase ditampilkan sebagai persen, jumlah tugas/aset sebagai bilangan bulat, dan waktu/rasio aset memakai desimal. Contoh pemakaian kapasitas 0,49 ditampilkan sebagai 49%.
- **Referensi:** formula kartu dan seri grafik diperbarui ke lokasi sumber baru. Dashboard utama tetap memakai susunan sebelumnya.

Validasi: PowerPoint lokal merender ulang slide Pergerakan tugas; Excel lokal membuka workbook, menampilkan tabel sumber tanpa teks bertumpuk, membaca nilai sumber 49%, serta mengenali formula kartu `=F50` dan seri Dibuat pada `A66:A70`/`D66:D70`. Lima belas tes otomatis lulus, termasuk pemeriksaan lebar gabungan label sumber, format persentase, dan referensi grafik setelah pemindahan tabel. Dialog unduh XLSX/PPTX, ekspor Inggris/Indonesia, cakupan satu proyek, data kosong, Ringkasan saja, dan Tugas saja diperiksa ulang. ZIP dan HTML standalone dibangun dari sumber yang sama; contoh ekspor diperbarui.

## Koreksi 1.0.7: akurasi highlight Misi Workspace

5 September 2026. Audit ini mencakup seluruh 22 langkah onboarding pada desktop, tablet, dan mobile.

| Temuan | Perbaikan |
|---|---|
| Beberapa langkah menyorot area besar, seperti seluruh toolbar filter, seluruh daftar task, atau seluruh bagian dependensi. | Target diarahkan ke kontrol atau konteks yang benar: filter dependensi Terhambat, kartu task latihan, header kartu Beranda, serta panel DIHAMBAT OLEH dan MENGHAMBAT. |
| Pada mobile, menu yang berada di Lainnya hanya menghasilkan highlight pada tombol Lainnya atau target tidak ditemukan. | Misi sementara menampilkan item navigasi yang dibutuhkan, membuka lembar Lainnya, lalu menyorot item tujuan yang sebenarnya. Preferensi menu pengguna tidak diubah. |
| Kartu panduan dapat menutup target di bagian bawah layar. | Posisi kartu menyesuaikan letak target. Untuk target bawah di mobile, kartu berpindah ke atas dan tetap dapat digulir bila isinya panjang. |
| Highlight dapat tertinggal saat drawer task masih bergerak. | Posisi highlight diselaraskan selama animasi pembukaan drawer, sehingga tetap mengikuti tombol tab dan bagian dependensi. |
| Misi yang dilanjutkan dari tengah dapat berada di halaman, tampilan task, drawer, panel AI, atau pencarian yang salah. | Setiap langkah memulihkan konteksnya sendiri: halaman asal, tampilan Kanban, task latihan, tab drawer, panel AI, dan kolom pencarian. |
| Tombol tutup Asisten AI melewati tepi layar 390 px karena isi header terlalu lebar. | Badge tambahan disembunyikan pada layar sempit dan padding header disesuaikan agar tombol tutup sepenuhnya terlihat. |
| Menu Beranda atau navigasi yang disembunyikan pengguna membuat target onboarding hilang. | Target yang sedang diperlukan ditampilkan sementara selama misi, tanpa menulis ulang pilihan tata letak pengguna. |

Validasi posisi menjalankan 66 skenario: 22 langkah pada lebar 1440, 768, dan 390 px. Setiap target terlihat, berada dalam viewport, tercakup oleh highlight, tidak tertutup kartu panduan, dan preferensi menu tetap sama. Validasi interaksi menyelesaikan seluruh 22 langkah melalui kontrol sebenarnya pada desktop dan mobile, total 44 interaksi, tanpa melewati langkah; task latihan dihapus setelah misi selesai. Regresi tambahan mencakup 15 tes otomatis, 35 interaksi Pengaturan, 88 render bahasa Inggris/Indonesia, 51 klik tab Pengaturan, 62 pemeriksaan UI server, lima cakupan ekspor, serta kedua tombol unduh XLSX/PPTX. Tidak ada exception JavaScript pada pemeriksaan tersebut.

## Koreksi 1.0.8: pintasan keyboard Windows dan macOS

5 September 2026. Audit menemukan dua petunjuk pintasan yang tampil di antarmuka: pencarian global dan pengiriman komentar.

| Temuan | Perbaikan |
|---|---|
| Petunjuk komentar selalu menampilkan `⌘↵`, termasuk pada Windows. | Sistem mendeteksi platform. Windows dan Linux menampilkan `Ctrl + Enter`; macOS menampilkan `⌘ Enter`. |
| Petunjuk pencarian selalu menampilkan `Ctrl K`, sehingga tidak sesuai pada Mac. | Label pencarian memakai sumber preferensi yang sama: `Ctrl K` pada Windows/Linux dan `⌘ K` pada macOS. |
| Simbol `↵` kurang jelas bagi sebagian pengguna. | Nama tombol ditulis sebagai `Enter`. Petunjuk komentar dipadatkan menjadi format seperti `Internal · Ctrl + Enter`, sehingga tetap muat bersama tombol Lampirkan dan Kirim pada layar 390 px. |
| Deteksi otomatis tidak selalu cocok untuk remote desktop atau keyboard lintas platform. | Pengaturan **Profil saya → Pintasan keyboard** menyediakan pilihan Otomatis, Windows/Linux, dan macOS. Pilihan disimpan per akun. |

Tampilan preferensi tidak membatasi input: `Ctrl + Enter` dan `⌘ Enter` tetap diterima untuk mengirim komentar, sehingga keyboard eksternal dan sesi remote tetap dapat digunakan. Validasi mencakup deteksi otomatis Windows dan macOS, kedua pilihan override, penyimpanan setelah reload, bahasa Inggris dan Indonesia, tampilan mobile, fungsi pengiriman komentar dengan kedua kombinasi, serta pembaruan label pencarian. Regresi 15 tes otomatis, 35 interaksi Pengaturan, 88 render bahasa, 51 klik tab Pengaturan, dan 44 langkah onboarding desktop/mobile tetap lulus.

## Koreksi 1.0.9: aksi pembuatan dan indikator mobile

5 September 2026. Audit dilakukan setelah pengguna mempertanyakan perbedaan New task dan New request serta melaporkan titik tanpa label di kanan atas layar tablet/mobile.

### New task dan Request work

Kedua fungsi dipertahankan karena hasilnya berbeda:

- **New task** membuat pekerjaan yang siap dijalankan. Pada bawaan demo, task ditugaskan kepada pembuatnya, memiliki reviewer, estimasi 4 jam, dan tenggat 5 hari.
- **Request work** mengirim kebutuhan ke Inbox untuk triage. Request belum memiliki penanggung jawab atau reviewer, memakai estimasi awal 0, tenggat 7 hari, brief umum, serta tag request. Lead menerima notifikasi untuk meninjau dan menetapkannya.

Dua tombol sejajar sebelumnya terlihat sebagai tindakan yang sama. Dashboard sekarang menampilkan satu tombol **Create/Buat** bagi pengguna yang memiliki kedua izin. Menu di bawahnya menampilkan New task dan Request work beserta satu kalimat yang menjelaskan hasilnya. Pengguna requester yang tidak dapat membuat task langsung melihat tombol Request work, tanpa menu satu pilihan. Halaman Task, Proyek, Tim, dan Kalender tetap menyediakan New task pada konteks yang memang khusus membuat task.

### Titik kanan atas

Titik tersebut berasal dari indikator koneksi. Pada layar kecil, teks `Connected` atau `Demo · changes are not saved` disembunyikan oleh CSS sementara wadah dan titik statusnya tetap tampil. Karena titik tanpa label tidak memberi informasi yang dapat ditindaklanjuti dan menutupi area header, seluruh indikator disembunyikan pada lebar sampai 980 px. Indikator lengkap tetap tampil di desktop.

Validasi mencakup lebar 1440, 768, dan 390 px; menu Create tetap berada di dalam viewport; draft task dan request mempertahankan nilai, izin, dan alur yang berbeda; requester hanya melihat tindakan yang tersedia; terjemahan Indonesia tampil benar; indikator koneksi hilang pada tablet/mobile dan tetap lengkap di desktop. Regresi 15 tes otomatis, 35 interaksi Pengaturan, 88 render bahasa, 51 klik tab Pengaturan, serta 66 pemeriksaan posisi onboarding tetap lulus.

## Koreksi 1.0.10: menu template Asisten AI dan audit klik

5 September 2026. Masalah direproduksi pada menu Template prompt di header Asisten AI.

| Temuan | Penyebab | Perbaikan |
|---|---|---|
| Tombol Template prompt menerima klik dan menu berstatus terbuka, tetapi pengguna tidak melihat apa pun. | Panel Asisten AI memakai lapisan 170, sedangkan menu konteks memakai lapisan 150. Menu dirender di belakang panel putih. | Menu dan popover memakai lapisan 190, tetap di bawah modal pada lapisan 200. Menu template sekarang terlihat dan dapat dipilih pada desktop, tablet, dan mobile. |
| Tombol Pengaturan AI mengubah halaman di belakang panel AI yang masih menutup layar. | Navigasi tidak menutup panel terlebih dahulu. | Tombol Pengaturan AI dan Edit templates menutup panel, lalu membuka tab Pengaturan AI yang terlihat. |
| Menu konteks dinamis kadang membutuhkan klik kedua setelah menu lain memakai wadah yang sama. | Fungsi menu hanya memeriksa apakah wadah sedang terbuka, bukan tombol pembukanya. | Menu menyimpan tombol pembuka. Klik tombol berbeda langsung mengganti isi dan posisi; klik tombol yang sama tetap menutup menu. |

Audit clickability mencakup 4.452 pemeriksaan hit area pada 114 kombinasi halaman, tampilan task, tab Pengaturan, tab drawer, modal, serta lebar 1440, 768, dan 390 px. Elemen di dalam bagian tertutup tidak dihitung sampai bagiannya dibuka. Lima belas pemeriksaan fungsi tambahan memastikan menu template terlihat di atas panel, template menjalankan pertanyaan, tombol Pengaturan membuka halaman yang terlihat, dan menu konteks dapat berpindah target dengan satu klik.

Regresi tambahan: 15 tes otomatis, 35 interaksi Pengaturan, 88 render bahasa Inggris/Indonesia, 51 klik tab Pengaturan, 44 langkah onboarding desktop/mobile, serta alur Create/Request pada tiga ukuran layar tetap lulus. Tidak ada exception JavaScript pada pemeriksaan tersebut.
