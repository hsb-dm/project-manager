# Panduan Google Drive untuk ZenCrevia

Panduan ini untuk pemula. Setelah selesai, file dari Assets, Files pada task, dan Versions dapat dikirim ke satu folder Google Drive. ZenCrevia menyimpan tautan dan menampilkan preview bila izin file mengizinkannya.

## Yang perlu disiapkan

- Akun Google yang memiliki akses ke folder kerja tim.
- Alamat dashboard ZenCrevia yang akan dipakai tim, misalnya `https://creative.example.com`.
- Akses untuk membuat project di Google Cloud Console.

> Untuk mencoba secara lokal, alamat dashboard biasanya `http://localhost:3000`. Alamat ini berbeda dengan alamat server produksi, sehingga keduanya perlu ditambahkan jika kamu memakai keduanya.

## 1. Buat project Google Cloud

1. Buka [Google Cloud Console](https://console.cloud.google.com/).
2. Di bagian pemilih project, pilih **New project**.
3. Beri nama yang mudah dikenali, misalnya `ZenCrevia Drive`.
4. Pilih project tersebut setelah selesai dibuat.

## 2. Aktifkan Google Drive API

1. Buka **APIs & Services → Library**.
2. Cari **Google Drive API**.
3. Tekan **Enable**.

Tanpa langkah ini, aplikasi dapat meminta login tetapi tidak dapat mengunggah atau membaca file Drive.

## 3. Atur layar persetujuan Google

1. Buka **APIs & Services → OAuth consent screen**.
2. Pilih tipe audience yang sesuai dengan organisasi kamu.
3. Isi nama aplikasi, email dukungan, dan email developer.
4. Tambahkan akun tim sebagai **Test users** bila aplikasi masih dalam mode pengujian.
5. Simpan pengaturan.

Google akan meminta pengguna memberikan izin hanya saat mereka memilih **Save & sign in** di ZenCrevia.

## 4. Buat OAuth Client ID

1. Buka **APIs & Services → Credentials**.
2. Pilih **Create credentials → OAuth client ID**.
3. Pilih tipe aplikasi **Web application**.
4. Pada **Authorized JavaScript origins**, masukkan alamat dashboard secara persis, tanpa path tambahan. Contoh:

   ```text
   https://creative.example.com
   http://localhost:3000
   ```

5. Tekan **Create**, lalu salin nilai **Client ID** yang berakhir dengan `.apps.googleusercontent.com`.

Jika muncul error `origin_mismatch`, hampir selalu berarti alamat yang dibuka di browser tidak sama persis dengan alamat di daftar ini.

## 5. Siapkan folder tujuan di Drive

1. Buat folder baru di Google Drive, misalnya `ZenCrevia Uploads`.
2. Buka folder tersebut dan salin bagian setelah `/folders/` dari URL-nya. Itu adalah **Folder ID**.
3. Bagikan folder kepada setiap akun Google anggota yang perlu melihat file, atau gunakan satu Google Group perusahaan. Beri **Editor** kepada pengunggah dan **Viewer** kepada peninjau.
4. Folder ID secara teknis opsional, tetapi sangat disarankan untuk kerja tim. Bila dikosongkan, file masuk ke My Drive akun yang login dan anggota lain tidak otomatis mendapat akses.

Shared Drive juga didukung. Pastikan akun yang login sudah menjadi anggota Shared Drive dan memiliki izin untuk menambahkan file.

## 6. Hubungkan dari ZenCrevia

1. Masuk ke **Settings → Cloud storage**.
2. Tekan **Configure Google Drive**.
3. Tempelkan Client ID dan, bila ada, Folder ID.
4. Masukkan label akun agar mudah dikenali tim.
5. Aktifkan **Upload new files to Drive**.
6. Tekan **Save & sign in**, lalu pilih akun Google yang memiliki akses ke folder tadi dan tekan **Allow**.

Status akan berubah menjadi **Connected** setelah izin diberikan.

## 7. Uji unggahan dan preview

1. Buka sebuah task uji dan unggah file yang tidak sensitif melalui bagian **Files**.
2. Pastikan file muncul di folder Drive yang dipilih.
3. Buka file dari ZenCrevia dan pastikan preview atau halaman Drive dapat dibuka.
4. Jika file masuk ke **My Drive**, periksa kembali Folder ID pada konfigurasi ZenCrevia.

## 8. Uji akses dengan akun anggota lain

1. Minta satu anggota tim masuk ke ZenCrevia dan Google memakai akun mereka sendiri.
2. Minta mereka membuka task dan file uji yang sama.
3. Jika task dapat dibuka tetapi file tidak, tambahkan akun atau Google Group mereka ke folder Drive.
4. Ulangi pengujian untuk satu akun **Viewer** dan satu akun **Editor** agar pembagian izin sesuai kebutuhan.

Keanggotaan ZenCrevia dan izin Google Drive adalah dua hal terpisah. Pengguna perlu memiliki keduanya untuk melihat task sekaligus membuka file privat.

## 9. Tentukan aturan akses eksternal

Preview di dashboard mengikuti izin file di Google Drive.

- Untuk kamu sendiri atau rekan dengan akun Google yang sama-sama memiliki akses, cukup bagikan file atau folder kepada mereka di Drive.
- Untuk stakeholder luar, pilihan yang lebih aman adalah menambahkan akun Google mereka pada folder atau file tertentu.
- Opsi **Anyone with the link** di ZenCrevia membuat setiap unggahan baru dapat dibuka tanpa login. Opsi ini mati secara bawaan dan menampilkan konfirmasi saat diaktifkan. Gunakan hanya jika seluruh unggahan baru memang sudah disetujui untuk akses publik.
- Jangan gunakan akses publik untuk file sensitif, materi berlisensi, atau dokumen internal.

Setelah itu kamu dapat memakai **Link from Google Drive** pada Assets, Files task, atau Versions. Tautan Drive akan dapat dibuka dan file yang mendukung embed akan dipreview langsung dari dashboard.

| Pengguna | Syarat | Hasil |
|---|---|---|
| Anggota workspace | Memiliki izin ke folder Drive | Dapat membuka task dan file |
| Anggota workspace | Tidak memiliki izin Drive | Dapat membuka task, tetapi tidak dapat membuka file |
| Peninjau eksternal | Akunnya ditambahkan pada file atau folder | Dapat membuka file yang dibagikan |
| Pengguna lain | Tidak diberi izin dan tautan publik nonaktif | Tidak dapat membuka file |

## Jika ada masalah

| Masalah | Periksa ini |
|---|---|
| Login Google gagal | Client ID benar dan alamat dashboard ada di Authorized JavaScript origins. |
| Upload tidak masuk folder | Google Drive API aktif, akun login memiliki akses Editor, dan Folder ID benar. |
| Preview kosong | File tidak dibagikan ke akun yang sedang login atau file tidak mengizinkan preview/embed. |
| Pengguna lain tidak bisa preview | Bagikan file/folder kepada mereka, atau gunakan Anyone with the link untuk file yang aman. |
