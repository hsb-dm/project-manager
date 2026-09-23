# Pembaruan 1.6.0 — Styling

Panduan outer glow, shape tambahan, serta gradient linear dan melingkar tersedia di AI-GALLERY-GUIDE.md.

# Pembaruan 1.5.1 — Garis bantu

Tarik guide dari ruler, snap layer, posisi presisi, dan cara menghapusnya dijelaskan pada AI-GALLERY-GUIDE.md.

# Pembaruan 1.5.0 — 10 September 2026

AI Gallery, catatan desain, salin/edit sesuai role, clipboard layer, ruler, navigasi mouse, dan unduhan PNG/JPEG/PDF dijelaskan pada **AI-GALLERY-GUIDE.md**. Checkbox pemilihan layer dan angka jumlah layer di header sudah dihapus. Gunakan Shift/Ctrl/Cmd+klik untuk pilihan beberapa layer.

# AI Hub ZenCrevia 1.1.0

## Mengatur prompt brand

1. Masuk sebagai admin workspace.
2. Buka **Pengaturan → Kunci API & integrasi → AI image generation**.
3. Isi **Prompt brand bawaan / Brand default prompt** dengan aturan visual, warna, gaya bahasa, dan larangan brand.
4. Klik **Simpan** pada panel tersebut.
5. Buka AI Hub dan gunakan templat atau prompt khusus. Aturan brand tetap disertakan pada setiap generasi gambar.

Contoh yang dapat disesuaikan:

> Gunakan arah visual minimal dan modern, dengan biru kobalt sebagai warna utama dan hijau limau sebagai aksen. Pertahankan ruang kosong yang cukup untuk headline. Hindari dekorasi berlebihan, warna neon tambahan, dan visual yang terlalu ramai. Jangan mengubah bentuk atau proporsi logo. Buat latar visual tanpa teks, karena teks dan logo akan dipasang sebagai layer di editor.

Prompt ini mengarahkan pembuatan gambar. Tulisan yang kamu masukkan sendiri pada layer tidak diubah otomatis. Aturan logo yang benar tetap perlu diterapkan pada file logo dan desain final. Kolom instruksi Asisten AI tetap terpisah dari prompt gambar.

## Menyusun desain

1. Pilih templat atau kanvas kosong, lalu tentukan ukuran.
2. Klik **Text**, **PNG / image**, atau **Shape** untuk menambahkan elemen.
3. Pilih layer di daftar atau klik elemennya pada kanvas.
4. Seret untuk memindahkan. Gunakan pegangan sudut untuk mengubah skala, atau kolom ukuran untuk angka yang tepat.
5. Gunakan **Majukan layer / Mundurkan layer** untuk mengubah urutan. Layer teratas pada daftar tampil paling depan.
6. Atur rotasi, transparansi, dan perataan pada panel properti.
7. Gunakan ikon mata untuk menyembunyikan layer tanpa menghapusnya. Gunakan ikon kunci untuk mencegah perubahan saat menyunting elemen lain.

Teks tambahan dapat memiliki beberapa baris, font berbeda, ketebalan, miring, garis bawah, jarak baris, latar, gradien, outline, dan bayangan. Gambar tambahan dapat diatur kecerahan, kontras, dan saturasinya. Bentuk tersedia sebagai persegi panjang, elips, atau segitiga.

## Menyimpan dan mengekspor

- **Save preset** menyimpan pengaturan dan struktur layer untuk dipakai kembali. Membuka preset mempertahankan layer yang dapat diedit.
- **Download PNG** mengekspor hasil gabungan sebagai gambar.
- **Save to assets** menyimpan hasil gabungan ke pustaka aset.
- **Undo / Redo** membatalkan atau mengulangi perubahan editor.

PNG hasil ekspor merupakan gambar gabungan. Simpan preset jika desain masih perlu diedit. Pada mode standalone, unduh cadangan JSON workspace untuk mempertahankan pengaturan demo; pada versi server, preset mengikuti penyimpanan workspace.

Gambar yang dihasilkan AI tetap satu latar raster. Orang, produk, atau objek yang sudah menyatu di gambar tersebut belum dapat dipilih sebagai layer terpisah.

## 1.2.0 — Layer inspector dan perlindungan teks (9 September 2026)

- Layer dapat diurutkan dengan menyeret pegangan di kiri, tombol Bring forward / Send backward, atau tombol panah keyboard saat pegangan terfokus. Urutan teratas tampil paling depan.
- Ikon hapus tersedia pada setiap baris dan tombol Delete layer pada properti layer terpilih. Undo dapat mengembalikan perubahan. Layer terkunci tidak dapat dipindah atau dihapus melalui kontrol ini.
- Properties memakai bagian Position, Layout (sesuai jenis layer), Content, Appearance, dan Effects yang dapat dilipat. Kontrol warna, outline, bayangan, dan styling sebelumnya tetap tersedia.
- Canvas > Text protection aktif secara bawaan. Bagian latar AI di belakang teks ditutup menggunakan warna kanvas dengan padding 24 px yang dapat diubah. Area mengikuti posisi, ukuran, dan rotasi teks, termasuk saat ekspor PNG dan simpan ke Assets.
- Perlindungan diterapkan pada komposisi aplikasi, bukan jaminan bahwa provider AI akan menghasilkan komposisi sempurna. Gambar AI asli tetap raster; layer gambar/bentuk yang ditambahkan sendiri tetap mengikuti urutan yang dipilih pengguna. Perlindungan dapat dinonaktifkan di Canvas.
- Validasi: 31 tes otomatis lulus; urutan drag dan tampilan Properties diperiksa melalui browser lokal. Tidak mengirim permintaan berbayar ke provider AI.


## 1.2.1 — Navigasi Properties (9 September 2026)

- Ikon status layer memakai gembok terbuka/tertutup dengan label aksesibel. Layer terkunci menawarkan tombol Buka kunci untuk mengedit.
- Daftar layer dapat dilipat; layer terpilih memakai aksen tema workspace. Tombol ikon lebih ringkas tanpa lingkaran yang mendominasi.
- Tombol naik/turun memakai panah dan label singkat. Hapus tersedia di baris layer dan di sebelah nama layer terpilih.
- Bagian properti memakai jarak yang konsisten dan mengingat kondisi terbuka/tertutup selama sesi editor. Effects tertutup secara bawaan.
- Input, warna, garis, dan tombol mengikuti token tema aplikasi, termasuk mode gelap. Label Image/Gambar menggantikan PNG / image.
- Validasi: 31 tes otomatis lulus. Pemilihan layer, kunci/buka kunci, serta lipat daftar diuji di browser. Pemeriksaan layar sempit 390 px tidak menemukan overflow horizontal.


## 1.3.0 — Kontrol kanvas dan shortcut (9 September 2026)

- Ikon mata tersembunyi diganti eye-off, dan enam tombol alignment menggunakan SVG yang konsisten serta tooltip. Lebar minimum tombol tidak lagi membuat deretan alignment meluber.
- Shape baru: persegi membulat dan pill untuk desain tombol. Rectangle, ellipse, dan triangle lama tetap kompatibel.
- Shape dapat diubah lebar/tingginya dari delapan pegangan kanvas. Menggeser satu sisi mempertahankan sisi lawannya. Semua jenis layer memiliki pegangan rotasi; Shift saat memutar menggunakan kelipatan 15 derajat. Layer terkunci tidak dapat ditransformasi.
- Skala headline dan subheadline diterapkan pada layer masing-masing, setelah tata letak dasar dihitung, sehingga tidak mengubah ukuran maupun posisi layer lainnya. Desain lama dengan headlineScale bukan 100 dapat terlihat berbeda pada layer pendamping yang sebelumnya ikut membesar akibat bug.
- Zoom tampilan 10–400%, input persentase, tombol +/- dan Fit/Pas layar. Zoom 100% berarti satu piksel desain per piksel CSS. Kanvas dapat digulir saat diperbesar; ukuran PNG tetap sesuai ukuran desain.
- Shortcut saat editor aktif: Delete/Backspace hapus layer; panah geser 1 px, Shift+panah 10 px; Ctrl/Cmd+Z undo; Ctrl/Cmd+Shift+Z atau Ctrl+Y redo; Ctrl/Cmd+D duplikat layer tambahan; Ctrl/Cmd+[ atau ] ubah urutan; Ctrl/Cmd+Shift+L kunci/buka kunci; T tambah teks; R tambah persegi membulat; +/- zoom; 0 pas layar; Esc batalkan pilihan.
- Shortcut layer tidak berjalan saat mengetik di kolom input, textarea, dropdown atau teks kanvas, dan tidak menghapus layer terkunci. Daftar shortcut tersedia lewat tombol ? pada toolbar kanvas.
- Validasi: 34 tes otomatis lulus termasuk isolasi skala headline, resize shape dengan rotasi, serta perlindungan shortcut saat mengetik/terkunci. Browser lokal: drag lebar mempertahankan tinggi, pegangan rotasi, Delete/Undo, ikon eye-off, pilihan pill, zoom 100% berukuran 1920 px untuk desain 1920 px. Tidak ada pemanggilan provider AI.


## 1.4.0 — Pilihan beberapa layer dan audit bahasa AI Hub (9 September 2026)

- Shift+klik (atau Ctrl/Cmd+klik) pada daftar maupun kanvas menambah/melepas pilihan layer. Kotak centang tersedia untuk layar sentuh; Ctrl/Cmd+A atau Pilih semua memilih layer yang terlihat dan tidak terkunci.
- Panel beberapa layer menampilkan jumlah pilihan dan enam arah alignment. Batas pilihan menjadi acuan bawaan; pengguna dapat memilih Kanvas sebagai acuan. Layer terkunci dapat menjadi acuan tetapi tetap pada posisinya.
- Pilihan dapat digeser bersama, digeser dengan panah (Shift = 10 px), dihapus, dikunci/buka kunci, dan dinaikkan/diturunkan sambil mempertahankan urutan relatif. Ctrl/Cmd+D menggandakan layer tambahan yang terpilih. Satu operasi bersama memakai satu langkah Undo.
- Pintasan alignment: Alt+Shift+L/C/R untuk kiri/tengah horizontal/kanan dan Alt+Shift+T/M/B untuk atas/tengah vertikal/bawah. Esc membatalkan pilihan. Shortcut pengetikan di kolom tetap dipertahankan.
- Klik sekali memilih layer; klik dua kali teks untuk mengedit. Cara ini mencegah editor teks terbuka saat memilih beberapa layer.
- Audit EN–ID: melengkapi Position, Opacity, Follow layout, pilihan font workspace, warna, latar, garis tepi, bayangan, logo, ukuran, dan tooltip. Prompt generasi spesifik diganti Prompt khusus untuk gambar ini; Visual brief menjadi Arahan visual. Nama model, isi desain, prompt, serta nama layer buatan pengguna tetap sebagai konten pengguna.
- Validasi: 37 tes otomatis lulus. Browser: Shift+klik dua layer, alignment, Ctrl+A, shortcut alignment, serta pergantian Indonesia–English diperiksa. Tidak ada permintaan ke provider AI.

