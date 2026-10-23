# AI Gallery dan ekspor desain — ZenCrevia 1.6.0

## Menyimpan desain pilihan

1. Buka AI Hub melalui menu akun.
2. Buat visual atau susun desain dengan teks, gambar, dan bentuk.
3. Klik **Simpan ke AI Gallery** di bawah kanvas.
4. Isi nama file. Tambahkan tag dipisahkan koma dan catatan desain jika diperlukan.
5. Simpan. Desain beserta layer, posisi, warna, prompt, dan gambar menjadi tersedia di galeri tim.
6. Buka **AI Gallery** di bagian atas AI Hub atau melalui menu akun. Di mobile, tersedia melalui menu Lainnya.

Nama dan tag tidak diterjemahkan otomatis. Label dan tombol tersedia dalam bahasa Indonesia dan Inggris. Prompt serta isi desain akan terlihat oleh anggota workspace yang membuka detail atau membuat salinan; periksa isinya sebelum menyimpan.

## Memakai desain anggota lain

Klik **Salin & edit**, beri nama file milikmu, lalu lanjutkan di AI Hub. Salinan disimpan atas nama akun yang membuatnya. File asli tidak berubah. Detail salinan menampilkan nama desain asal selama desain tersebut masih dapat diakses.

Untuk meneruskan pekerjaan sendiri, klik **Edit** pada kartu milikmu. AI Hub menampilkan nama desain galeri yang sedang diedit. Saat menyimpan, pilih **Simpan perubahan**, atau centang **Simpan sebagai desain baru**. Memilih templat baru atau membersihkan kanvas melepaskan hubungan dengan file galeri sebelumnya. Penyimpanan dilakukan saat menekan Simpan, bukan otomatis pada setiap perubahan.

Jika seseorang sudah memperbarui file yang sedang kamu edit, aplikasi menolak penimpaan versi lama. Muat ulang galeri sebelum mencoba lagi; kamu juga dapat menyimpan perubahanmu sebagai desain baru.

## Hak akses

| Tindakan | Viewer | Anggota dengan izin unggah/kelola aset | Pemilik desain dengan izin tersebut | Admin workspace |
|---|---|---|---|---|
| Melihat desain aktif dan detailnya | Ya | Ya | Ya | Ya |
| Menambahkan favorit pribadi | Ya | Ya | Ya | Ya |
| Membuat salinan atas nama sendiri | Tidak | Ya | Ya | Ya |
| Menyimpan desain dari AI Hub | Tidak | Ya | Ya | Ya |
| Mengedit file asli melalui AI Hub | Tidak | File sendiri | Ya | File sendiri; salin file orang lain |
| Mengganti nama/tag, mengarsipkan, memulihkan | Tidak | File sendiri | Ya | Semua desain workspace |

Izin mengikuti kemampuan role, termasuk role kustom: `upload_file`, `manage_assets`, atau `manage_workspace`. Server memeriksa kembali izin; menyembunyikan tombol bukan satu-satunya pembatas. Pemilik dan admin dapat melihat arsip, sementara anggota lain melihat desain aktif. Pengarsipan dapat dibatalkan. Favorit berlaku per akun.

## Pencarian dan pengelolaan

- Cari berdasarkan nama, tag, atau catatan.
- Gunakan Semua desain, Desain saya, Favorit, atau Diarsipkan.
- Kartu menunjukkan nama desain, avatar dan nama pemilik, tanggal pembaruan, tag, dan penanda salinan. Favorit berada di kanan judul. Tombol Salin & edit, Edit, dan Kelola berada di footer dengan divider; ketersediaan tombol mengikuti role.
- Pratinjau menyimpan thumbnail; membuka atau menyalin mengambil data desain lengkap.
- Galeri memuat 24 desain per halaman, diurutkan berdasarkan pembaruan terbaru.

## Server dan standalone

**Versi server:** anggota harus masuk ke workspace yang sama. Galeri disimpan di SQLite server dan dapat diakses lintas perangkat. Tidak perlu membuat folder Google Drive atau file menjadi publik. Gambar latar dan gambar layer disertakan dalam snapshot galeri; sumber eksternal harus mengizinkan pembacaan gambar oleh browser. Jika tidak, unduh sumber tersebut dan tambahkan kembali sebagai layer gambar.

**HTML standalone:** galeri disimpan melalui IndexedDB pada browser/perangkat tersebut. Akun demo pada browser yang sama dapat mencoba alur berbagi. File HTML tidak berisi desain pribadi yang pernah disimpan dan tidak menyinkronkan data ke perangkat lain. Browser, alamat file/origin, atau profil browser yang berbeda dapat memiliki penyimpanan terpisah. Menghapus data browser dapat menghapus galeri lokal. Standalone bukan layanan kolaborasi atau pengamanan akun sungguhan.

Penyimpanan galeri ikut dalam backup database server yang sudah tersedia. Snapshot menyimpan salinan gambar, sehingga penggunaan ruang disk dan ukuran backup bertambah. Batas saat ini: 100 layer tambahan, sekitar 6 MB per gambar, serta batas total permintaan server bawaan 12 MB. Browser membatasi snapshot sebelum mengunggah. Arsip tetap memakai ruang penyimpanan karena dapat dipulihkan. Referensi unggahan untuk generasi dan kredensial provider tidak ikut snapshot. Font kustom tetap memerlukan konfigurasi font workspace.

## Pilihan layer, drag, dan clipboard

- Klik layer untuk memilihnya. Highlight menunjukkan pilihan; checkbox dihapus.
- Shift+klik atau Ctrl/Cmd+klik menambah/melepas pilihan.
- **Pilih semua** atau Ctrl/Cmd+A memilih layer terlihat yang tidak terkunci. Tombol tidak lagi menampilkan angka jumlah layer.
- Seret nama/area baris layer untuk mengubah urutan. Tombol mata, gembok, dan hapus tetap menjalankan fungsinya. Layer terkunci tidak dapat dipindah.
- Ikon duplikat tersedia di sebelah judul layer terpilih. Ctrl/Cmd+D menggandakan pilihan.
- **Salin layer / Tempel layer** atau Ctrl/Cmd+C / V menyalin beberapa layer sekaligus. Clipboard ini milik sesi editor, tidak membaca clipboard sistem, dan tidak berpindah antar akun/workspace. Shortcut tidak mengambil alih saat sedang mengetik atau ketika modal terbuka.
- Layer bawaan seperti judul, tombol, dan logo dapat disalin menjadi layer tambahan yang dapat diedit secara mandiri. Salinan mempertahankan gaya, posisi dengan sedikit offset, skala, serta urutan relatif. Layer terkunci dapat disalin; salinannya tidak terkunci.
- Undo/redo tetap tersedia. Salinan layer dibatasi sampai 100 layer tambahan per desain.

## Mengunduh PNG, JPEG, dan PDF

1. Klik **Unduh** di bawah kanvas.
2. Isi nama file dan pilih PNG, JPEG, atau PDF.
3. Pilih skala 0,25×, 0,5×, 0,75×, 1×, 1,5×, 2×, 3×, atau 4×.
4. Periksa ukuran piksel yang ditampilkan, kemudian klik Unduh.

PNG mempertahankan transparansi yang ada pada komposisi. JPEG memakai latar putih untuk area transparan dan kualitas 95%. PDF berisi satu halaman berupa gambar komposisi, tanpa layer atau teks yang dapat diedit; rasio halaman mengikuti desain. Halaman PDF memakai konversi 96 piksel per inci, dengan gambar JPEG berkualitas 96%.

Skala mengubah dimensi piksel dan ukuran halaman PDF. Contoh kanvas 1920×720 menjadi 960×360 pada 0,5× atau 3840×1440 pada 2×. Ini bukan peningkatan detail menggunakan AI. Batas ekspor adalah 8192 piksel per sisi dan 32 megapiksel untuk mengurangi risiko tab kehabisan memori. Jika skala terlalu besar, tombol unduh dinonaktifkan dan alasan ditampilkan.

Highlight seleksi, pegangan resize, dan penanda area aman tidak disertakan dalam hasil unduhan. Perlindungan area teks tetap mengikuti pengaturan desain. Untuk mengedit kembali layer di aplikasi, gunakan file desain di AI Gallery; PNG/JPEG/PDF merupakan hasil ekspor final.
## Navigasi kanvas dan ruler

Penggaris horizontal dan vertikal menampilkan koordinat piksel desain. Tanda ukur menyesuaikan zoom dan posisi kanvas. Gunakan ikon penggaris atau **Shift+R** untuk menampilkan/menyembunyikannya.

- **Alt + roda mouse:** zoom mengikuti posisi kursor.
- **Tahan tombol tengah mouse lalu seret:** geser tampilan kanvas, termasuk saat seluruh desain sedang muat di layar.
- **Space + seret:** alternatif geser kanvas dengan tombol kiri mouse.
- **Pas layar / Fit** atau **0:** kembalikan desain ke tengah dan muatkan ke area kanvas.
- **− / persentase / +:** mengubah zoom tampilan. Angka persentase rata tengah.
- **?** berada di samping tombol area aman dan membuka ringkasan shortcut.

Navigasi tampilan tidak mengubah posisi layer, ukuran desain, atau hasil ekspor. Penggaris juga tidak muncul pada PNG, JPEG, PDF, maupun thumbnail galeri. Tombol zoom, area aman, bantuan, dan penggaris memakai tinggi dan lengkungan kapsul yang konsisten. Pada mobile, kontrol membungkus ke baris berikutnya.

## Catatan desain

Catatan dapat diisi saat menyimpan, membuat salinan, atau membuka **Kelola**. Maksimal 2.000 karakter. Gunakan untuk prompt, alasan perubahan, petunjuk penggunaan, atau versi kampanye. Catatan pada salinan dapat diubah tanpa memengaruhi file asal. Pemilik dan admin mengikuti hak kelola yang sama dengan nama/tag.

Buka **Catatan desain** pada kartu atau klik pratinjau untuk membaca catatan lengkap. Catatan juga termasuk pencarian. Jika filter menghasilkan daftar kosong, tersedia **Buka AI Hub** dan **Lihat semua desain galeri**; pilihan kedua membersihkan pencarian dan mengembalikan filter Semua desain.

Saat membuka dialog Unduh atau mengganti format/skala, aplikasi menyiapkan file terlebih dahulu. Tombol Unduh aktif setelah file siap, agar klik terakhir langsung menuju file yang dipilih. Nama file tetap dapat diedit sebelum mengunduh.

## Garis bantu dari ruler — 1.5.1

1. Pastikan mode **Edit** aktif dan penggaris terlihat (ikon ruler atau Shift+R).
2. Tarik dari penggaris **atas** ke desain untuk membuat garis horizontal. Tarik dari penggaris **kiri** untuk garis vertikal.
3. Geser layer mendekati garis. Sisi atau tengah layer akan menempel saat jaraknya maksimal sekitar 6 piksel layar. Beberapa layer mengikuti batas gabungan pilihan; layer terkunci tetap di tempat.
4. Tahan **Alt** saat menggeser layer untuk melewati snap sementara.
5. Seret garis untuk memindahkannya. Klik dua kali untuk memasukkan koordinat piksel yang tepat.
6. Pilih garis lalu tekan **Delete/Backspace**, atau seret keluar area kanvas untuk menghapusnya. **Esc** membatalkan penarikan yang sedang berlangsung. Undo/Redo juga berlaku untuk penambahan, pemindahan, dan penghapusan garis.

Tombol **Garis bantu** menyediakan opsi tampil/sembunyi, snap aktif/nonaktif, tambah garis horizontal/vertikal di tengah (alternatif untuk layar sentuh), dan hapus semua garis. Garis tersembunyi tidak menarik layer. Maksimal 100 garis per desain.

Garis disimpan bersama desain AI Gallery, salinan, serta preset. Posisi memakai piksel desain dan tetap mengikuti zoom/pan. Garis yang berada di luar ukuran kanvas setelah ukuran desain diganti tidak ditampilkan atau dipakai untuk snap. Guide tidak menjadi layer dan tidak muncul dalam gambar, PDF, atau thumbnail. Snap pada versi ini membantu saat menggeser layer, bukan saat resize/rotate.
## Styling — 1.6.0

**Cahaya luar / Outer glow:** pilih satu layer, buka Efek, lalu aktifkan Cahaya luar. Pilih warna, opasitas, dan ukuran cahaya. Cocok untuk teks, shape, logo, atau gambar. Pada gambar tanpa transparansi, glow mengikuti tepi bidang gambar. Bagian glow di luar kanvas tidak ikut ekspor.

**Shape tambahan:** klik Bentuk, lalu pilih jenisnya di Konten → Bentuk. Tersedia bintang, panah, chevron, belah ketupat, segi lima, segi enam, dan jajar genjang, selain pilihan sebelumnya. Gunakan Lebar/Tinggi atau pegangan kanvas untuk mengatur proporsi.

**Gradient shape:** aktifkan Gradasi pada Tampilan. Pilih warna isi dan warna kedua, kemudian jenis Linear atau Melingkar. Untuk Linear, isi Sudut gradasi 0–360°. Gradasi melingkar memakai warna pertama di tengah dan warna kedua di luar.

**Gradient kanvas:** pilih Kanvas → Latar kanvas → Jenis latar, lalu pilih Gradasi linear atau Gradasi melingkar. Mode linear memiliki kontrol arah, sedangkan mode melingkar tidak memerlukan sudut. Warna, batas gradasi, dan opasitas tetap dapat diatur.

Untuk teks, aktifkan gradient pada warna teks atau latar teks. Jenis gradasinya tersedia pada Tampilan. Efek dan gradient disimpan bersama desain galeri/preset dan disertakan pada ekspor PNG, JPEG, serta PDF.