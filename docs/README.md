- **`docs/HANDOVER.md` — serah terima developer: mulai dari sini.**
# Dokumentasi ZenCrevia

Tiga dokumen, satu untuk tiap audiens.

| Dokumen | Untuk siapa | Isinya |
|---|---|---|
| **[USER-MANUAL.md](USER-MANUAL.md)** | anggota tim | cara memakai tiap layar: Home, Tasks, Calendar, Projects, Teams, Assets, Knowledge, AI Hub, AI Gallery, Analytics, export, onboarding, preferensi pribadi, pintasan keyboard |
| **[ADMIN-OPS.md](ADMIN-OPS.md)** | admin workspace & operator server | 17 tab Settings, role & permission, administrasi AI, SMTP, backup & restore, Google Drive, deployment, environment variables, checklist produksi, failure modes |
| **[DEVELOPER.md](DEVELOPER.md)** | developer | arsitektur, build system, state & render pipeline, sync layer, i18n, onboarding engine, AI studio, export subsystem, referensi API, skema database, testing, konvensi kode, known issues |

Versi yang bisa dibaca tanpa editor Markdown:

- `docs/zencrevia-docs.html` — satu file, ada navigasi samping, buka langsung di browser
- `docs/zencrevia-docs.pdf` — versi cetak

Keduanya dibangun dari tiga file Markdown dengan `npm run docs` (`docs/build-docs.py`).
Edit Markdown-nya, jangan HTML/PDF-nya.

---

## Mulai dari mana

**Baru bergabung sebagai anggota tim** → USER-MANUAL bagian 1–4, lalu jalankan Workspace Quest
di dalam aplikasi.

**Baru mengambil alih sebagai admin** → ADMIN-OPS bagian 1, 2, dan 11 (checklist produksi),
lalu bagian 13 (failure modes).

**Baru mengambil alih kodenya** → DEVELOPER bagian 1–7, lalu 20 (konvensi) dan 22 (known issues).
Dua hal yang paling sering menjatuhkan orang baru: **urutan `parts` di `build.js`** dan
**jebakan CSS specificity**.

---

## Dokumen lain di repo ini

| File | Isi |
|---|---|
| `../README.md` | ringkasan singkat dan cara menjalankan |
| `../SECURITY-SETUP.md` | checklist keamanan versi ringkas |
| `../GOOGLE_DRIVE_SETUP.md` | langkah OAuth Google Drive versi panjang |
| `../AI-HUB-GUIDE.md`, `../AI-GALLERY-GUIDE.md` | panduan fitur AI versi lama |
| `../AUDIT.md` | catatan audit lengkap |
| `../CHANGELOG-v16.md`, `../CHANGELOG-v17.md` | riwayat perubahan |
| `../LEGAL/` | draf EULA, kebijakan privasi, ketentuan layanan, pemrosesan data AI |
