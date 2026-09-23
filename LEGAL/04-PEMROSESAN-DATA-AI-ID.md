# Penjelasan Pemrosesan Data AI ZenCrevia

**Status:** Draf untuk ditinjau penasihat hukum dan disesuaikan dengan provider yang digunakan. Ganti seluruh teks dalam tanda `[KURUNG SIKU]` sebelum diterbitkan.

**Tanggal berlaku:** [TANGGAL BERLAKU]

Dokumen ini menjelaskan kapan AI ZenCrevia memakai pemrosesan lokal, kapan data dikirim ke penyedia AI, data yang dikirim, penyimpanan, dan kewajiban pengguna. Dokumen ini melengkapi Kebijakan Privasi dan Ketentuan Layanan.

## 1. Ringkasan

ZenCrevia tidak melatih model AI milik sendiri. Fitur bekerja dalam dua cara:

1. **Mode lokal:** jika kunci provider chat tidak tersedia, AI Intelligence memberi jawaban deterministik dari data di browser. Pertanyaan dan konteks tidak dikirim ke model eksternal.
2. **Provider eksternal:** jika administrator mengonfigurasi provider dan secara terpisah mengaktifkan pemrosesan eksternal, ZenCrevia dapat mengirim prompt ke endpoint tersebut. Konteks workspace hanya ikut dikirim jika pengaturan konteks juga diaktifkan.

Pengguna akan diberi penanda yang membedakan mode lokal dan provider eksternal sebelum mengirim data.

## 2. Data untuk AI Intelligence

Pada konfigurasi aplikasi saat dokumen ini dibuat, permintaan chat dapat memuat:

- pertanyaan dan sampai dengan 12 pesan terbaru;
- nama workspace dan tanggal;
- nama serta jabatan pengguna;
- nama dan urutan tahap workflow;
- jumlah task terbuka, terlambat, menunggu review, terblokir, dan jatuh tempo tujuh hari;
- nama proyek, status, progres, pemilik, tenggat, jumlah task, dan aset;
- sampai dengan 60 task terbuka, termasuk ID, judul, proyek, tahap, prioritas, penanggung jawab, estimasi, tenggat, aset, dan dependensi;
- nama, jabatan, kapasitas, beban kerja, dan utilisasi anggota; serta
- ringkasan jumlah aset.

ZenCrevia tidak dengan sengaja memasukkan password, hash password, kunci API, isi file, isi komentar, atau isi lengkap brief ke konteks chat standar. Namun judul task, nama orang, nama proyek, dan metadata pekerjaan tetap dapat bersifat rahasia atau merupakan data pribadi.

## 3. Data untuk pembuatan gambar

Permintaan gambar dapat memuat prompt visual, negative prompt, ukuran, model, gaya, dan parameter lain. Gambar referensi atau logo hanya dikirim jika fitur dan provider mendukungnya serta pengguna memilihnya.

Keluaran provider dapat berupa URL atau data gambar. Pengguna bertanggung jawab memeriksa hak penggunaan, merek, kemiripan dengan orang, akurasi teks, dan kepatuhan sebelum memublikasikan.

## 4. Provider dan lokasi pemrosesan

Administrator dapat memilih endpoint dan provider. Isi tabel ini sebelum AI eksternal diaktifkan untuk pelanggan:

| Fungsi | Provider | Lokasi/region | Retensi/training | Ketentuan dan privasi |
|---|---|---|---|---|
| Chat | [NAMA PROVIDER] | [REGION] | [RINGKASAN] | [URL] |
| Gambar | [NAMA PROVIDER] | [REGION] | [RINGKASAN] | [URL] |

Provider dapat memproses data di luar Indonesia. Pelanggan harus menilai transfer lintas negara, Data Processing Agreement, retensi, penggunaan untuk training, lokasi, dan mekanisme penghapusan sebelum mengaktifkannya.

Kami tidak menyatakan provider tidak memakai data untuk training kecuali konfigurasi akun dan kontraknya benar-benar menjamin hal tersebut.

## 5. Kunci API

- **Mode server:** kunci dienkripsi dalam database menggunakan `COS_SECRET_KEY` dan tidak dikirim kembali dalam respons normal. Produksi menolak kunci baru bila secret enkripsi belum dikonfigurasi. Administrator tetap bertanggung jawab membatasi akses database, backup, dan lingkungan server.
- **HTML standalone:** kunci hanya disimpan dalam memori tab dan hilang ketika halaman dimuat ulang atau ditutup. Kunci tetap dapat terlihat oleh pihak yang memiliki akses ke perangkat, ekstensi, atau alat developer selama tab aktif. Mode ini hanya cocok untuk demo atau kunci terbatas.

Kunci harus memiliki kuota, pembatasan endpoint, monitoring biaya, dan rotasi sesuai kemampuan provider.

## 6. Penyimpanan dan retensi

Server ZenCrevia bertindak sebagai proxy dan saat ini tidak dirancang menyimpan permanen isi prompt dan jawaban chat. Riwayat percakapan dan generasi dapat disimpan di `localStorage` sampai pengguna menghapusnya atau menghapus data situs.

Provider dapat menyimpan request, respons, atau metadata sesuai paket dan kebijakannya. Masa retensi aktual harus dicantumkan pada tabel provider.

Log tidak boleh merekam kunci API atau isi lengkap prompt kecuali diperlukan, memiliki dasar hukum, dibatasi akses, dan memiliki masa retensi jelas.

## 7. Kontrol pengguna dan administrator

Administrator bertanggung jawab memilih provider; menentukan data yang boleh dikirim; memberi tahu anggota; mengatur akses dan kuota; menonaktifkan AI eksternal untuk workspace sensitif; serta memastikan kontrak provider sesuai kebutuhan.

Pengguna harus tidak memasukkan password, token, data sensitif, rahasia yang tidak diperlukan, atau materi tanpa hak; memeriksa keluaran; tidak menggunakan AI sebagai satu-satunya pengambil keputusan berdampak signifikan; dan melaporkan keluaran berbahaya atau pengungkapan data.

## 8. Akurasi dan pengawasan manusia

Keluaran AI dapat salah, tidak lengkap, bias, usang, atau mirip dengan karya pihak lain. ZenCrevia tidak menjamin keunikan atau kebenaran keluaran. Pengguna harus melakukan review manusia atas fakta, bahasa, hak cipta, merek, privasi, regulasi, dan brand.

Konten harus diberi label AI bila diwajibkan hukum, kebijakan organisasi, kontrak klien, atau konteks. Aktivitas AI tidak boleh menyamar sebagai persetujuan manusia.

## 9. Data pribadi dan hak individu

AI tetap tunduk pada Kebijakan Privasi dan hukum pelindungan data. Pelanggan harus memiliki dasar pemrosesan, membatasi data sesuai tujuan, dan menyediakan akses, koreksi, penghapusan, keberatan, dan hak lain yang berlaku.

Permintaan terkait data AI dikirim ke [EMAIL PRIVASI]. Data yang telah dikirim ke provider mungkin memerlukan koordinasi dengan provider.

## 10. Kekayaan intelektual

Hak atas input dan output mengikuti hukum, kontrak pelanggan, EULA, dan ketentuan provider. Pengguna tidak boleh meminta atau memakai keluaran untuk meniru identitas, logo, karakter, suara, atau karya pihak lain secara melanggar hukum. Keluaran harus diperiksa sebelum penggunaan komersial.

## 11. Insiden dan perubahan provider

Dugaan kebocoran prompt, penyalahgunaan kunci, pengeluaran tidak wajar, atau keluaran berbahaya harus dilaporkan ke [EMAIL KEAMANAN]. Integrasi dapat dinonaktifkan sementara untuk mitigasi.

Perubahan material pada provider, kategori data, tujuan, atau retensi akan dicatat dan diberitahukan sebelum berlaku bila diwajibkan.

## 12. Kontak

**[NAMA BADAN USAHA]**  
[ALAMAT]  
Email privasi: [EMAIL PRIVASI]  
Email keamanan: [EMAIL KEAMANAN]  
Daftar provider/subprosesor: [URL DAFTAR SUBPROSESOR]
