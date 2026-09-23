# ZenCrevia — revisi v16 diterapkan (non-AI-Hub)

Semua perubahan ada di `src/`. Jalankan `node build.js` untuk regenerasi
`dist/creative-os-standalone.html` dan `public/index.html`.

## P0 (§505 queue)

**P0-1 — Dependency picker tab bar (§374-382)** · `src/drawer.js`, `refinements.css`
Penyebab: class `on` di-hardcode ke "Same project" dan tidak pernah dipindah;
`#dep_options` tanpa tinggi tetap, sehingga jumlah hasil mengubah tinggi modal
dan modal yang di-center melompat vertikal.
- state `DEPENDENCY_PICKER.mode` = `same_project` / `my_tasks` / `all_tasks`
- `setDependencyMode()` hanya menukar class aktif + isi hasil, tanpa rebuild modal
- struktur `.dependency-picker` → tabs `flex:0 0 auto`, hasil `flex:1 1 auto;min-height:0`
  dengan tinggi tetap 320px, footer terpisah

**P0-2 — Urutan default Task Fields (§415)** · `src/core.js`
Labels dipindah dari posisi 3 ke posisi 9. Urutan final: Status, Priority, Team,
Project, Assignees, Reviewers, Start, Due, Labels, Estimate, Assets produced, Tags.
`taskFields()` tetap merge di atas config tersimpan, jadi workspace existing tidak
ditimpa (§418).

**P0-3 — Task form mengikuti order & visibility** · sudah benar sebelumnya
(`drawer.js` melakukan iterasi `taskFields()`), otomatis ikut urutan baru.

**P0-4 — Calendar "See more" overlap (§481-504)** · `src/tasks.js`, `refinements.css`
Penyebab: `.agenda .row` memakai template 4 kolom, tapi `taskRow()` hanya punya
3 anak — blok judul dapat lebar `auto` (max-content) dan menabrak metadata kanan.
- default `.agenda .row` dikembalikan ke 3 kolom; hanya baris "Next 14 days"
  (yang benar-benar punya kolom tanggal) memakai `.row.dated` 4 kolom
- `.cal-more-list` dedicated: grid `minmax(0,1fr) auto`, `min-height:68px`,
  metadata kanan wrap, badge truncate, list scroll sendiri, stack di ≤640px
- lebar modal `min(760px,100%)` (§491)

Efek samping positif: `attachAssetModal` dan tab Assets juga ikut sembuh —
keduanya kena bug grid yang sama.

## Shell & konsistensi

**§628-657 Application shell** · `src/body.html`, `src/core.js`, `refinements.css`
- markup: `.app-shell` (grid `--topbar-h` / `1fr`) → header di luar `.app-scroll`
- `body{overflow:hidden}`, `.app-scroll{overflow-y:auto;scrollbar-gutter:stable}`
- scrollbar utama mulai tepat di bawah header; ganti tab tidak lagi menggeser
  lebar header/nav/search/profile
- helper `appScrollEl()` / `appScrollTop()`; `go()` dan AI Hub tidak lagi memakai
  `window.scrollTo`
- `rememberScroll()` / `restoreScroll()` — posisi scroll per screen (§647)
- sticky `.ai-setup` / `.ai-props` / `.snav` di-rebase ke container, bukan viewport
- fallback `@media print` supaya cetak tetap mengalir penuh

**§527-533 Ikon expand/minimize** · `src/dashboard.js`, `src/core.js`
Pasangan `chevd` / `chevu` (dulu chevron-down dipasangkan arrow-up), plus
`aria-label` dan `aria-expanded`.

**§534-546 Demo user card** · `src/auth.js`, `refinements.css`
Penyebab: `<button>` mewarisi `text-align:center` dari UA stylesheet.
Struktur `.demo-user-card` grid `auto / minmax(0,1fr) / auto`, identitas
left-aligned, Continue tetap kanan, truncate aman, stack di ≤520px.

**§547-567 Export report checklist** · `src/export.js`, `refinements.css`
`.report-slide-chip`: `min-height:40px`, padding `8px 14px`, gap 8px,
checkbox anchor kiri sebagai anak pertama, seluruh kapsul clickable via `<label>`,
container `.report-slide-options` gap 10px, Select all / Clear all rata kiri.

**§470-480 Workflow stage color picker** · `src/settings.js`, `refinements.css`
Komponen `colorSelect()` reusable: swatch live + nama Title Case (Gray, Blue, …).
Swatch ikut berubah saat pilihan diganti.

**§431-469 Drag-and-drop reordering** · `src/core.js`, `src/settings.js`
Engine generik: `registerReorderList(key, commit)`, `reorderHandle()`,
drag handle grip, feedback `drop-before` / `drop-after`, nomor urut live,
fallback keyboard (Space grab → ↑/↓ → Escape), commit tervalidasi permission.
Terpasang di Workflow stages dan Task fields (tombol ↑/↓ diganti).

**§383-413 Task panel position** · `src/core.js`, `src/settings.js`, `refinements.css`
Setting per-user di Settings → Layout dengan visual selector (Left / Center / Right),
default Right. Satu komponen drawer, tiga mode via `[data-task-panel]`:
slide kanan / slide kiri / fade+scale di tengah. Respect `prefers-reduced-motion`.
Di ≤980px selalu fallback ke panel full-width (§395).

## Verifikasi
29 assertion perilaku + 38 regression check (semua screen, semua settings tab,
5 task view, 3 mode task panel, 3 export modal) dijalankan lewat jsdom terhadap
HTML hasil build. Semua lolos, tanpa error runtime.

---

# Batch 2 — sisa revisi di luar AI Hub

## Perbaikan bug dari batch 1

**Demo user card tampil satu baris** · `refinements.css`
Saya mengubah `<div>` jadi `<span>` di batch 1 tapi tidak set `display`, jadi nama
dan job title merender inline dan menyatu. `.demo-user-info` sekarang
`display:flex;flex-direction:column`, anaknya `display:block` — tepat dua baris:
nama, lalu job title · role. Di ≤520px Continue tetap di baris yang sama, tidak
pernah jatuh ke baris ketiga.

## §506-526 Project Files — akses task selalu ada

Penyebab: baris **version** di tab Files berakhir dengan `verBadge()` saja,
sementara baris **file** biasa punya tombol "Open task". Jadi begitu sebuah versi
punya review status, navigasi ke task-nya hilang.
- `fileTaskActions()`: status badge dan aksi task berbagi kolom kanan yang stabil
- "Open task" muncul selama `linkedTaskId` valid — tidak peduli Approved /
  Pending review / Revision requested (§510)
- task ID ditampilkan sebagai navigasi sekunder (§517)
- task terhapus → "Task unavailable"; tanpa izin → "No access" (§522, §523)
- `openProjectFileTask()` mempertahankan konteks project di belakang panel (§513)

## §329-373 Global Tag Picker

File baru `src/tag-picker.js`, terdaftar di `build.js`.
- `tagRegistry()` menormalkan `WS.tags` — entri lama berupa string dan entri baru
  `{id,name,color}` dibaca lewat jalur yang sama (§347)
- dropdown: search (§332), multi-select tetap terbuka (§337), colour dot (§349),
  usage count per tag (§364), create inline dari query (§333)
- keyboard penuh: ↑/↓, Enter pilih-atau-buat, Escape, Backspace hapus chip terakhir (§351)
- duplikat dicegah case- dan whitespace-insensitive (§336)
- permission `manage_tags`: tanpa izin tombol create diganti penjelasan, bukan
  disembunyikan diam-diam (§334)
- limit 12 tag per entity dengan indikator `n / 12` (§357)
- Settings → Tags tetap source of truth (§345): rename menyebar ke semua entity
  dan mereset filter yang menunjuk nama lama (§346), delete meminta konfirmasi
  bila tag sedang dipakai lalu membersihkannya dari semua item (§359)

Catatan: dropdown sengaja **tidak** memakai class `.pop`. Global click handler
memanggil `closePops()` yang menutup semua `.pop`, sehingga dropdown akan tertutup
di setiap klik opsi dan melanggar §337.

**Sengaja ditunda — §348 (simpan tagIds, bukan nama).** Migrasi ke ID menyentuh
`server/serialize.js`, demo-data, semua export dan setiap filter. Storage tetap
berbasis nama, tapi rename/delete sudah dibuat konsisten lewat `retagEverything()`
sehingga perilakunya setara. Migrasi ID sebaiknya jadi pekerjaan tersendiri
bersama sisi server (§366-367).

## §568-627 PPT — Per-Person Performance & AI Recommendations

Dua slide baru di checklist export (§569, §612).

**Per-person (§570-591)** — metrik dihitung di `reportData()`, dataset kanonik
yang sama dipakai PPT dan Excel, jadi angkanya tidak bisa berbeda antar output (§591).
- assigned / completed / completion rate, assets produced, projects involved,
  approval rate, revision rate, first-pass approval rate, estimate total & rata-rata
- aset dan estimate dibagi rata antar assignee, tidak digandakan (§575)
- metrik tanpa denominator dirender `n/a`, **bukan** 0 palsu (§570, §603)
- review metric berbasis state versi, bukan parsing activity log (§617)
- 2 orang per slide, paginasi otomatis "1/2, 2/2" (§585)
- footer peringatan agar deck tidak terbaca sebagai leaderboard (§587, §588)

**AI recommendations (§592-611)** — `reportRecommendations()`.
- prioritas provider: external bila configured + allowed + connected, selain itu
  engine internal (§593). Di standalone `externalAiEligible()` selalu false, dan
  slide menyebutkan sumbernya secara eksplisit (§605)
- engine internal memakai metrik yang persis sama dengan slide lain (§611)
- kategori: delivery, quality, load, risk, process (§597)
- confidence dinyatakan dari ukuran sampel; data tipis → "Low confidence" (§603)
- tanpa data cukup → pesan jujur, bukan rekomendasi karangan (§604)

## §398-402 Task panel — live preview & onboarding

- memilih Left/Center/Right langsung merepaint picker di tempat (§398)
- satu langkah onboarding "Choose your task panel" sebelum Workspace Quest,
  hanya sekali, tidak muncul di ≤980px, dan Skip tidak memblokir apa pun (§399-401)

## Verifikasi batch 2
- 29 assertion shell/P0 · 38 regression · 21 tag picker · 17 PPT — semua lolos
- deck hasil generate dibongkar dan diperiksa: 11 slide, slide 8-9 per-person
  (terpaginasi), slide 10 AI recommendations
- test suite bawaan proyek: 64/64 lolos

## Masih belum dikerjakan
AI Hub V2 (sesuai instruksi), plus yang butuh sisi server dan tidak bisa
dibuktikan di standalone: resource policy & quota (§7-10, §163-208), admin model
registry (§6, §45-47, §179-203), gallery governance (§48-64), backup & recovery
(§209-275), SMTP & email (§276-328), dan migrasi tag ke ID (§348, §366-367).
