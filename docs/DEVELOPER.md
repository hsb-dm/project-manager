> **v37:** ringkasan arsitektur terkini, invariant keamanan, lapisan patch v29–v35 dan utang teknis ada di [`HANDOVER.md`](HANDOVER.md). Bagian di bawah ditulis untuk 1.6.0 dan diperbarui sebagian; bila berbeda, HANDOVER.md dan kodenya yang benar.

# ZenCrevia — Developer Handbook

> Dokumen serah-terima teknis. Narasi Bahasa Indonesia, istilah teknis tetap English.
> Versi aplikasi: **1.6.0** · Node **>= 22.13** · **nol dependensi npm**.
> Path relatif terhadap root repo.

---

## Daftar isi

1. [Gambaran umum](#1-gambaran-umum)
2. [Menjalankan dan mem-build](#2-menjalankan-dan-mem-build)
3. [Build system](#3-build-system)
4. [Arsitektur frontend](#4-arsitektur-frontend)
5. [Global state](#5-global-state)
6. [Render pipeline](#6-render-pipeline)
7. [Sync layer ke server](#7-sync-layer-ke-server)
8. [i18n](#8-i18n)
9. [Workspace Quest (onboarding)](#9-workspace-quest-onboarding)
10. [Task drawer & task panel position](#10-task-drawer--task-panel-position)
11. [AI Studio / canvas](#11-ai-studio--canvas)
12. [Export subsystem](#12-export-subsystem)
13. [Personal "checked" tick](#13-personal-checked-tick)
14. [Server: arsitektur](#14-server-arsitektur)
15. [Server: referensi API](#15-server-referensi-api)
16. [Database](#16-database)
17. [Auth, session, permission](#17-auth-session-permission)
18. [Security](#18-security)
19. [Testing](#19-testing)
20. [Konvensi kode](#20-konvensi-kode)
21. [Resep: cara menambah sesuatu](#21-resep-cara-menambah-sesuatu)
22. [Known issues & jebakan](#22-known-issues--jebakan)

---

## 1. Gambaran umum

ZenCrevia adalah creative operations dashboard: task management, workflow approval,
project & team, asset library, knowledge base, analytics, AI image studio, dan AI gallery.

Dua artefak yang dihasilkan dari source yang sama:

| Artefak | Dipakai untuk |
|---|---|
| `public/index.html` | disajikan oleh API server (`npm start`) |
| `dist/creative-os-standalone.html` | dibuka langsung dari disk, mode demo offline |

Keduanya halaman yang sama (sejak Oktober 2026 tidak lagi byte-identical): `dist/` adalah `public/index.html`
dengan file yang diambil halaman server dimasukkan ke dalamnya (`standaloneFrom` di `build.js`) — logo Google
Drive, bendera EN dan suara notifikasi (di server: `public/assets/`, nama file mengikuti isinya, disimpan browser
setahun), data demo lengkap (halaman server hanya membawa pengaturan awalnya; datanya `public/assets/demo-data.*.js`,
dibaca hanya oleh halaman tanpa API, misalnya host statis) dan font Poppins (di server: `public/fonts/`, lisensi
`public/fonts/OFL.txt`; di `dist/`: tautan Google Fonts). Komentar di `src/` dibuang saat build (`build-strip.js`);
`shared/*` masuk apa adanya. Sejak performance stage 3 (Oktober 2026) `public/index.html` hanya ~14 KB HTML: semua
script-nya satu file `public/assets/app.<hash>.js`, semua CSS-nya `public/assets/app.<hash>.css`, dan kamus Indonesia
`public/assets/i18n-id.<hash>.json` yang hanya diambil saat bahasa Indonesia dibutuhkan (lihat §3 dan §8); `dist/`
membawa ketiganya di dalam dirinya. Yang membedakan perilaku adalah runtime, bukan build:
`API.on === true` ketika `GET /api/auth/session` berhasil, `false` kalau gagal.

Stack:

- **Frontend** — vanilla JS, tanpa framework, tanpa bundler, tanpa ESM. Semua file di `src/`
  adalah *fragment* `<script>…</script>` yang digabung jadi satu file besar dengan satu global scope.
- **Backend** — Node.js murni (`node:http`, `node:sqlite`, `node:crypto`, `node:net`, `node:tls`).
  Tidak ada Express, tidak ada ORM, tidak ada nodemailer. SMTP ditulis tangan.
- **Database** — SQLite lewat `node:sqlite` `DatabaseSync`, WAL mode, foreign keys ON.

### Peta direktori

```
build.js                  concatenator: src/* -> public/index.html + dist/*.html (+ public/assets/)
build-strip.js            membuang komentar JS/CSS dari src/ saat build (tests/build-strip.test.js)
build-i18n.js             mengeluarkan kamus UI_ID dari kode ke i18n-id.<hash>.json (tests/build-split.test.js); build berhenti bila satu English punya dua kata Indonesia (tests/i18n-conflicts.test.js)
package.json              scripts, engines (node >= 22.13), zero deps
.env.example              seluruh environment variable
db/schema.sql             seluruh CREATE TABLE (dieksekusi tiap boot, idempotent)
db/schema.postgres.sql    varian Postgres — TIDAK dipakai kode ini
src/                      34 fragment yang membentuk aplikasi browser
shared/                   dipakai browser DAN server (demo-data.js, gallery-model.js)
server/                   HTTP server, db, auth, permissions, security, backup, mailer
tests/                    node:test, tanpa dependency
docs/                     dokumen ini
LEGAL/                    draf EULA, privacy policy, ToS, AI data processing
```

---

## 2. Menjalankan dan mem-build

```bash
node --version          # harus >= 22.13
npm start               # server di http://localhost:3000
npm run dev             # build dulu, baru start
npm run build           # regenerate public/index.html + dist/creative-os-standalone.html
npm test                # 125 test, pakai database sementara
npm run seed            # isi demo workspace (JANGAN di database produksi)
# Database kosong di production = workspace bersih; COS_SEED_DEMO=1 untuk demo (v29)
npm run backup          # backup terenkripsi (butuh COS_BACKUP_KEY)
npm run restore -- <f>  # restore lewat CLI (butuh COS_CONFIRM_RESTORE=YES)
```

`npm start` membaca `.env` kalau ada (`--env-file-if-exists=.env`). Kode di `server/`
sendiri **tidak** memuat dotenv — variabel harus datang dari environment proses.

**Setiap kali mengubah apa pun di `src/`, wajib `node build.js`.** Tidak ada watcher.
Mengedit `public/index.html` atau `dist/creative-os-standalone.html` langsung adalah kesalahan —
file itu di-generate ulang dan perubahan hilang.

---

## 3. Build system

`build.js` (15 baris) melakukan tiga hal:

**a. Concatenation.** Array `parts` menentukan urutan:

```
head.html, body.html, core.js, auth.js, gdrive.js, dashboard.js, tasks.js, drawer.js,
projects.js, teams.js, assets.js, knowledge.js, ai.js, analytics.js, ai-policy.js,
tag-picker.js, settings.js, ai-admin.js, admin-ops.js, report-template.js,
report-layout.js, export.js, i18n.js, studio-editor.js, canvas-controls.js,
multi-selection.js, ai-gallery.js, studio-actions.js, canvas-navigation.js,
canvas-guides.js, style-effects.js, onboarding-refinements.js, ai-properties.js, boot.js
```

**b. Inlining.**

| Apa | Ke mana |
|---|---|
| `src/refinements.css` | disisipkan sebelum `</style>` di `head.html` — **ini satu-satunya CSS build** |
| `shared/demo-data.js` | dibungkus `<script>` dan ditempel setelah `body.html` |
| `shared/gallery-model.js` | idem |
| `src/google-drive-logo.webp` | menggantikan `__GOOGLE_DRIVE_LOGO_DATA__` sebagai data URL |
| `src/flag-en.webp` / `flag-id.webp` | menggantikan `__FLAG_EN_DATA__` / `__FLAG_ID_DATA__` |

Karena `refinements.css` berada **paling akhir** di dalam satu `<style>`, dia menang
seri specificity terhadap `head.html` semata-mata karena urutan sumber.

**c. Output.** Menulis kedua file, mencetak ukuran.

### Halaman yang dipecah (Oktober 2026, performance stage 3)

Dulu `public/index.html` membawa ~120 `<script>` inline dan semua CSS (3,3 MB). Script inline tidak pernah
masuk code cache V8, jadi setiap kunjungan — juga yang hangat — mem-parse dan meng-compile ~3 MB JS lagi di main
thread. Sekarang `build.js` menulis:

| File | Isi |
|---|---|
| `public/index.html` (~14 KB) | `<head>` dengan script awal kecil (session, workspace, kamus), font Poppins, `<link rel="stylesheet" href="/assets/app.<hash>.css">`; markup `body.html`; satu `<script src="/assets/app.<hash>.js">` di tempat script pertama dulu (akhir `<body>`) |
| `public/assets/app.<hash>.js` | semua script, **urutan sama**: pengaturan demo, `shared/*` (apa adanya), lalu `src/*.js` menurut `parts`; tiap script didahului `;/* <file> */` |
| `public/assets/app.<hash>.css` | CSS `head.html`, lalu `refinements.css`, `v18.css`, `responsive.css`, `v38.css` (`HEAD_CSS`), lalu `<style>` tiap file JS menurut urutan halaman |
| `public/assets/i18n-id.<hash>.json` | kamus `UI_ID` (§8) |

Nama file = SHA-1 isinya; server mengirimnya `Cache-Control: public, max-age=31536000, immutable` dengan ETag kuat,
sehingga browser menyimpan file *dan* hasil compile-nya: Chrome membuat code cache pada kunjungan ketiga dan
memakainya mulai kunjungan keempat; sejak kunjungan pertama pun compile-nya di-stream di thread lain (bukan main
thread). `<script src>` itu script biasa (bukan `defer`/`async`), jadi tetap jalan sebelum `DOMContentLoaded`, dengan
`document.readyState === "loading"`, dan `boot()` tetap yang terakhir. `pageSources()` menolak HTML di antara script
(tidak bisa dipindah), dan `public/assets/` hanya berisi file build terakhir — file build sebelumnya disimpan server
(lihat "Deploy" di bawah).

**Apa yang berubah karena satu script, bukan ~120** (dicek: `tests/v37-code-health.test.js`, `tests/build-split.test.js`):
fungsi yang dideklarasikan di level atas sebuah file sudah ada sejak awal seluruh script (tiga fungsi yang sengaja
dideklarasikan dua kali — `localizeVisibleText`, `notifRows`, `aiGradient` — adalah versi file belakangan sejak awal;
tidak ada yang memanggilnya selama load); `then` sebuah promise jalan setelah seluruh script, bukan setelah filenya;
error di level atas sebuah file menghentikan sisanya. Tidak ada file yang memakai `let`/`const`/`class` di level atas
(dua akan bentrok dalam satu script) atau `"use strict"`. Karakter NUL yang ditulis mentah (`src/v38.js`, di regex)
ditulis `\x00` di bundle supaya Git tidak menganggap filenya biner. `.gitattributes` menandai output build `-text`:
tidak ada konversi line ending di checkout mana pun.

**`dist/creative-os-standalone.html`** = halaman server dengan `standaloneFrom(page)`: CSS jadi `<style>`, script jadi
satu `<script>` (dengan data demo lengkap), kamus jadi `<script>var ZC_I18N_INLINE={…}</script>`, aset jadi `data:`.
`tests/audit.test.js` mengecek `standaloneFrom(public/index.html)` (membaca file-nya dari `public/assets/`) === `dist/`.

**Test yang membaca halaman** memakai `tests/built-page.js` (`builtPage()`: HTML, kode, CSS, kamus;
`scriptOf(code, "shared/scoring-engine.js")`: satu script di dalam bundle, byte demi byte). Batas ukuran di
`tests/v29-readiness.test.js` (3,6 MB / 860 KB) berlaku untuk total yang diunduh: halaman + ketiga file.

**Deploy.** Tab yang terbuka sebelum update tetap menjalankan halaman lamanya dan masih bisa meminta file-nya
(kamus saat seseorang memilih Indonesia, script bila browser sudah membuangnya, halaman yang kembali lewat Back).
Server mencatat setiap halaman yang disajikannya (`server/delivery.js createAssetKeeper`): file yang disebut halaman
dan script/CSS-nya disalin ke `<data>/asset-history/` (tidak tersentuh deploy, zip maupun Docker), untuk 5 build
terakhir (`builds.json`); `/assets/<nama>` yang tidak ada lagi di `public/assets/` dikirim dari sana, juga immutable.
Salinan terkompresi (`page-cache/`) file yang sudah tidak disimpan ikut dihapus. `index.html` tetap `no-cache` (selalu
divalidasi ulang, 304 kalau sama), jadi tab baru selalu memuat build baru; bar "versi baru" (`src/new-version.js`)
tetap menawarkan reload ke tab lama. Service worker (`public/sw.js`) tidak menyentuh `/assets/` (hanya navigasi, saat
offline), jadi tidak pernah menyajikan `index.html` basi yang menunjuk bundle yang sudah hilang.

### Kenapa urutan `parts` penting

Satu global scope berarti file yang datang belakangan bisa menimpa nama yang sudah ada.
Ini **dipakai sengaja** sebagai extension mechanism. Dua pola:

**Redefinition penuh** (hanya dua di seluruh tree):

| Fungsi | Asal | Ditimpa oleh |
|---|---|---|
| `localizeVisibleText` | `core.js:385` (naif) | `i18n.js:507` (memoised, punya protected-node guard) |
| `aiGradient` | `ai.js:309` | `style-effects.js:3` |

**Save-base-then-wrap** (`var base = f; f = function(){ base(...); … }`). Rantai terpanjang
adalah `aiPolishInspector`, lima mata rantai persis mengikuti urutan build:

| # | File | Disimpan sebagai |
|---|---|---|
| 1 | `studio-editor.js:97` | *(asal)* |
| 2 | `multi-selection.js:12` | `aiSelectionProperties` |
| 3 | `studio-actions.js:12` | `aiActionsInspector` |
| 4 | `style-effects.js:10` | `aiStyleInspector` |
| 5 | `ai-properties.js:633` | `aiPolishInspectorPrev` |

Mata rantai ke-5 bukan additive: dia memanggil rantai sebelumnya untuk membangun panel Layers,
lalu **mengganti `.ai-prop-body` sepenuhnya**. Komentar di file itu menyatakannya eksplisit:
*"This is a replacement, not another layer of patching."*

Wrapper lain yang perlu diketahui: `aiStudioProperties`, `aiCanvasEditAt`, `aiTextDragEnd`,
`aiPreview`, `aiShowSelectionHandle`, `aiTextDragStart`, `aiShortcutHelp` (empat mata rantai),
`aiMultiKeydown`, `aiViewZoom`, `aiCanvasZoomUI`, `aiRulerDraw`, `aiChooseLayer`, `aiSetSelection`,
`aiDuplicateLayer`, `aiDownload`, `aiResizeStart`, `wqPosition`, `wqRenderCoach`, `wqPrepare`,
`wqAnchor`, `wqTagCompactNav`, `wqVisibleAnchor`.

`onboarding-refinements.js` juga **memutasi data `WQ_STEPS` di tempat** saat load — menulis ulang
field `[4]` (CSS anchor selector) untuk 7 step.

> **Aturan praktis:** mengubah urutan `parts` akan merusak aplikasi secara diam-diam.
> Apa pun yang membungkus harus muncul **setelah** basisnya. Panggilan "ke depan"
> selalu dijaga dengan `typeof X === "function"`.

---

## 4. Arsitektur frontend

Tidak ada component model. Setiap view adalah **fungsi yang mengembalikan string HTML**,
dirakit dengan `+` dan `.map().join("")`, lalu ditugaskan ke sebuah `innerHTML`.
Event handler adalah atribut `onclick="…"` inline yang memanggil fungsi global.

Builder bersama yang harus dipakai ulang (semua di `core.js`):
`panel()`, `emptyBox()`, `skeleton()`, `taskRow()`, `statusBadge()`, `teamBadge()`,
`av()`, `avStack()`, `fieldHtml()`, `selectHtml()`, `pillSel()`, `segHtml()`.

### Tanggung jawab tiap file `src/`

| File | Isi |
|---|---|
| `head.html` | seluruh `<style>` dasar + design tokens (`--color-*`, `[data-theme]`, `[data-density]`) |
| `body.html` | markup shell: topbar, `#nav`, `#content`, `#drawer`, `#overlay`, `#modalWrap`, `#ctxMenu`, `#toasts` |
| `core.js` | state `S`, ikon `I`, helper, router `go()`, `renderScreen`, nav, popover, modal, toast, Workspace Quest, task panel position, personal tick, sync layer |
| `auth.js` | layar login/register, `demoLogin` |
| `gdrive.js` | Google Drive OAuth + upload |
| `dashboard.js` | layar Home, kartu, preset layout |
| `tasks.js` | 5 view task, filter bar, kanban, table, grid, calendar, timeline; List/Grid tampil per halaman — 100 baris, atau 25 per grup saat dikelompokkan (`VPAGE_SIZE`, `VPAGE_GROUP`), tiap grup halamannya sendiri — dengan pager di bawahnya (`vpagePagerHtml`: Prev, nomor dengan "…" lewat `vpageItems`, Next, rentang `vpageRangeText` berformat `toLocaleString` id-ID/en-US); `vpageGo` → `vpageShow` mengganti hanya baris grup/tabel itu, fokus tetap di pager, `vpageReveal` menggulir atas grup/tabel ke layar; Kanban/Timeline menggambar 30 pertama lalu "Show 30 more" menambah di tempat (`vpageMore`); halaman (List/Grid: `S.vpage["p"+hash] = {grup: halaman}`) atau jumlah yang tampil (Kanban/Timeline) disimpan per view, sort, filter, grup, dan kembali ke halaman 1 bila filter, sort, grup atau scope List/Grid berubah (`VPAGE.last` per `vpageSlot`), halaman lewat batas jadi halaman terakhir; `vpageAllIds()` = semua task view itu (Select all), `vpageOrder(el)` = urutan penuh untuk drop; Print menggambar semua halaman (`beforeprint`/`afterprint`); grid hari Timeline digambar sekali (`.tl-days`); diuji `tests/view-paging.test.js` dan `e2e/view-paging.spec.js` |
| `drawer.js` | task drawer: header, meta, tab, versions, comments, activity, dependencies, gear menu |
| `projects.js`, `teams.js`, `assets.js`, `knowledge.js` | layar masing-masing |
| `ai.js` | AI Hub, generation, canvas compositor dasar, AI Intelligence chat |
| `ai-policy.js` | limit & quota (`DEFAULT_AI_POLICY`, `SYSTEM_AI_LIMITS`) |
| `ai-admin.js` | model registry, halaman Settings → AI |
| `ai-gallery.js` | AI Gallery |
| `ai-properties.js` | Properties panel AI Hub (rewrite penuh) |
| `studio-editor.js`, `canvas-*.js`, `multi-selection.js`, `studio-actions.js`, `style-effects.js` | editor canvas |
| `analytics.js` | layar Analytics |
| `settings.js` | 17 tab Settings |
| `admin-ops.js` | SMTP guided setup + Backup & Data |
| `tag-picker.js` | tag registry & picker |
| `report-template.js`, `report-layout.js`, `export.js` | XLSX/PPTX/CSV/JSON |
| `i18n.js` | kamus `UI_ID` + `localizeVisibleText` versi hidup |
| `onboarding-refinements.js` | perbaikan targeting Workspace Quest |
| `boot.js` | blok kamus terakhir + `boot()` |
| `refinements.css` | seluruh CSS tambahan (disisipkan ke `head.html`) |

---

## 5. Global state

### `S` — `core.js:11`

Satu kantong state UI yang mutable.

- **Routing** — `screen`, `sub`, `railFilter`
- **Task board** — `taskView`, `taskScope`, `sort`, `sortDir`, `group`, `filters`, `activeView`, `gridFields`, `actScope`
- **Calendar** — `calMode`, `calMonth`, `calYear`, `calDay`, `calScope`, `calLabelsOpen`
- **Drawer** — `drawerTask`, `drawerTab`, `drawerVer`, `commentVis`, `replyTo`, `revOpen`, `briefEdit`
- **Per layar** — `projectId`, `projectTab`, `teamId`, `memberId`, `assetTab`, `assetFolder`, `assetQuery`, `assetView`, `kbPage`, `kbEdit`, `kbQuery`, `requestId`, `settingsTab`, `settingsGroup`, `aiSettingsSection`, `backupSection`, `tagQuery`
- **Global** — `search`, `range`

`S.drawerTask` yang truthy adalah yang membuat `refresh()` ikut mengecat ulang drawer.

Key runtime tambahan (dibuat oleh `go()`): `S._temporaryTaskFilter`, `S._manualTaskFilters`,
`S._manualTaskScope`, `S._manualActiveView`, `S._lastManual*` — dipakai untuk "lensa sementara"
saat KPI di Home diklik.

### Global lain

| Global | Keterangan |
|---|---|
| `TASKS`, `PROJECTS`, `TEAMS`, `REQUESTS`, `ASSETS`, `ASSET_FOLDERS`, `KNOWLEDGE`, `NOTIFS`, `ACTIVITY`, `VIEWS`, `ROLES` | koleksi utama; `TASKS` **dimutasi in-place** (`push`/`splice`) supaya referensi hidup tetap valid |
| `PEOPLE` | **object keyed by user id**, bukan array |
| `WS` | workspace: `workflow`, `theme`, `brand`, `customFields`, `briefTemplates`, `labels`, `tags`, `cloud`, `ai`, `people` |
| `ME` | id user yang sedang "dilihat" — **berbeda** dari `SESSION.user.id` saat impersonation |
| `SESSION` | `{user, ws, canRegister}` — identitas terautentikasi |
| `API` | `{on, base, features}`; `API.on` adalah saklar demo vs server |
| `UI_LANG` | `"en"` / `"id"` |
| `I` | tabel ikon — object berisi **string** inline SVG, dikonkat langsung ke HTML |
| `AI_CHAT` | `{open, busy, msgs, loaded}` untuk panel AI Intelligence |
| `AN` | hasil analytics yang di-memoise; **di-invalidate dengan `AN=null`** (dilakukan `refresh()`) |
| `TODAY` | tengah malam hari ini. **Semua tanggal di aplikasi adalah integer offset hari dari `TODAY`, bukan objek `Date`.** |

---

## 6. Render pipeline

```
go(screen, sub)
  └─ rememberScroll()  →  set S.*  →  closePops()
     └─ renderNav()
     └─ renderScreen(false)
        └─ dispatch ke renderX()  →  #content.innerHTML = html
        └─ localizeVisibleText(#content)
     └─ restoreScroll(screen)
```

- **`go(screen, sub)`** (`core.js:529`) — router. Memetakan `sub` ke key `S` yang tepat per layar
  (`settingsTab`, `projectId`, `teamId`, `memberId`, `taskView`, `kbPage`, `requestId`, `calMode`).
- **`renderScreen(withLoading)`** (`core.js:537`) — kalau `S.search` tidak kosong, langsung
  `renderSearch()`. Selain itu dispatch lewat map literal ke `renderDashboard`, `renderTasks`,
  `renderProjects`, `renderCalendarScreen`, `renderTeams`, `renderMember`, `renderAssets`,
  `renderKnowledge`, `renderAIHub`, `renderAIGallery`, `renderAnalytics`, `renderNotifScreen`,
  `renderSettings`. Seluruh dispatch dibungkus `try/catch` — layar yang melempar error
  menampilkan `.errbox` dengan tombol "Go home", bukan halaman kosong.
- **`renderNav()`** (`core.js:514`) — mengecat **tiga** permukaan: `#nav` (desktop rail),
  `#tabbar` (4 item pertama + "More" di mobile), `#sheet` (overflow sheet).
- **`renderDrawer()`** (`drawer.js:90`) — menulis `#drHead` / `#drBody` / `#drFoot`.
- **`refresh()`** (`core.js:542`) — pemicu re-render normal setelah mutasi data:
  ```js
  function refresh(){ AN=null; renderNav(); renderScreen(false); if (S.drawerTask) renderDrawer(); }
  ```
- **`applyShell()`** (`core.js:506`) — hanya chrome non-konten (logo, nama workspace, avatar,
  nav, notif dot, shortcut hints, task panel position). Dipanggil setelah perubahan tema,
  bahasa, atau identitas workspace — **tidak** untuk edit data biasa.
- **`rememberScroll` / `restoreScroll`** (`core.js:693`) — aplikasi scroll di dalam
  `<main class="app-scroll">`, **bukan** window. Semua yang menyentuh scroll harus lewat
  `appScrollEl()` / `appScrollTop()`. Tiap layar mengingat posisinya sendiri; project, team
  atau orang (`navDetailKey`) yang dibuka dari tempat lain selalu mulai di atas, dan tidak
  menimpa posisi daftar di layar yang sama. Back (`navBack` → `navRestore`) mengembalikan
  posisi halaman dari snapshot seperti sebelumnya.
- **Scroll di dalam layar** (`src/live-redraw.js`) — `renderScreen` memotret scroller yang
  dikenal (`REDRAW_SCROLLERS` + `data-keep-scroll`) dan memasangnya lagi sesudah render,
  **hanya kalau view-nya sama**: `REDRAW_DRAWN` mencatat apa yang sedang tampil (layar +
  project/team/orang/halaman Knowledge atau hasil search, tab project / tipe view Tasks /
  Active-Archived / tab Settings, dan saved view), dibandingkan dengan `S` yang sudah berubah
  sebelum render. Live update, save, filter, sort, group, Mine/All → posisi tetap; project lain,
  tab lain, Kanban → List, saved view lain → mulai di atas. Filter yang diubah di atas saved
  view (saved view lepas, list tetap sama) juga tetap.

### State yang harus dijaga manual

Re-render adalah penggantian `innerHTML` penuh, jadi apa pun yang hidup di DOM akan hilang.
Ada tiga pola yang dipakai di codebase — pilih salah satu:

1. **Simpan di `S`**, derive ulang saat render (scroll, tab aktif, versi drawer).
2. **Save-and-restore di sekitar render** — contoh `taskGearSetPosition()` yang memotret
   `S.drawerTask/drawerTab/drawerVer/briefEdit/replyTo` sebelum memanggil setter dan
   menulisnya kembali sesudahnya.
3. **Surgical repaint, bukan re-render** — untuk hal kecil. Dua contoh yang terdokumentasi:
   - `paintTaskCheck()` — *"Re-rendering the board would cost the scroll position, any open menu and any in-flight drag — for a marker."*
   - `setTaskPanelPosition()` — `renderScreen()` penuh di sini pernah menyebabkan double paint
     (flicker) dan memindahkan fokus ke `<body>`.

---

## 7. Sync layer ke server

`API.on === false` berarti mode demo/standalone: tidak ada yang dipersist ke server.

**`boot()`** (`core.js:240`) selalu memuat demo dataset dulu supaya standalone langsung tampil,
lalu meng-race timeout 4 detik terhadap `GET /api/auth/session`. Sukses → `API.on = true`.
Gagal (termasuk abort) → mode demo.

**`apiFetch(method, path, body)`** (`core.js:222`) adalah satu-satunya pintu HTTP.
Selalu `credentials:"same-origin"`. Menambahkan header `x-act-as: <ME>` saat impersonation
(diklaim client, **ditegakkan server**). `401` di path non-auth memicu `showLogin()`.

**Pola persistence** (`core.js:253-306`) — optimistic UI → server mutation → reconcile/rollback:

```js
function moveTask(tk, op, applyLocal){
  var snap = clone(tk);
  applyLocal(tk); refresh();                 // 1. optimistic
  if (!API.on) { log(...); return Promise.resolve(); }
  return apiFetch("POST","/api/tasks/"+tk.id+"/move",{op:op})
    .then(function(d){ replaceInto(tk, hTask(d)); })      // 2. reconcile
    .catch(function(e){ replaceInto(tk, snap); refresh(); fail(e); }); // 3. rollback
}
```

Fungsi dengan bentuk sama: `persistTask`, `createTask`, `deleteTaskById`, `persistProject`,
`deleteProjectById`, `persistTeam`, `persistTeamOrder`, `persistPerson`, `persistMemberTeam`,
`removeMemberTeam`, `persistWS`, `persistView`, `saveMyPrefs`.

Konvensi: fungsi persistence mengembalikan `false` (bukan throw) sebagai sentinel
"gagal tapi sudah ditangani" — itu sebabnya ada `if (saved===false) return false;` di mana-mana.

`saveMyPrefs()` selalu menulis `localStorage["cos.prefs."+ME]` **dan** — kalau `API.on` —
`PUT /api/members/:id` (dengan id dirimu sendiri) dengan `.catch(function(){})`. Itu sebabnya preferensi personal
(bahasa, `navHidden`, `taskPanelPosition`, progres quest) bekerja identik di standalone.

### Perbedaan mode demo vs server

| Aspek | `API.on = true` | `API.on = false` |
|---|---|---|
| Sumber data | `GET /api/bootstrap` | `CREATIVE_OS_DEMO` |
| Write | HTTP + reconcile/rollback | in-memory saja |
| Quest state | `myPrefs().workspaceQuest` | `localStorage["cos.workspaceQuest.v2."+ME]` |
| `actAs` | butuh `API.features.impersonation` + sesi admin | bebas |
| Restore JSON | **diblokir** | diizinkan |
| Practice task quest | pakai task asli pertama | mensintesis `T-ONB-100` / `T-ONB-101` |

---

## 8. i18n

```js
function tr(s){ return UI_LANG==="id" ? (UI_ID[s]||s) : s; }   // core.js:368
```

Itu seluruh fungsinya. **String English adalah key.** Key yang hilang jatuh kembali ke English.
Tidak ada interpolasi dan tidak ada pluralisasi (kecuali `uiCount(n, one, many)`).

Kamus `UI_ID` dideklarasikan sekali di `core.js:316`, lalu **di-extend** dengan
`Object.assign(UI_ID, {…})` dari banyak file. Yang terbesar `src/i18n.js`; blok terakhir
ada di `src/boot.js` dan harus mendarat paling akhir.

**`localizeVisibleText(root)`** versi hidup ada di `i18n.js:507` (menimpa versi naif di `core.js:385`).
Yang penting untuk diketahui:

- `UI_TEXT_SOURCE` / `UI_ATTR_SOURCE` (`WeakMap`) mengingat English asli tiap node, sehingga
  EN→ID→EN pulih persis dan pass kedua tidak menerjemahkan dua kali.
- `uiContentNode(el)` adalah **protected-node guard**. Apa pun di dalam
  `textarea, script, style, pre, code, [contenteditable], [data-no-translate], .md, .t, .kt,
  .at, .tn, .td, .lbl, .me-name, #wsName, #wsLogo, .tbadge, .av, .kb-tree button span`
  **tidak pernah** diterjemahkan. Ini yang menjaga konten buatan user (judul task, komentar,
  nama workspace) tetap dalam bahasa aslinya.
- `uiDynamicText()` menangani string tersusun yang tidak bisa jadi key kamus
  (`"3 of 12 shown"`, `"12.5h assigned of 40h capacity"`).
- `uiUserNames()` (Oktober 2026): teks, atribut, atau bagian `" · "` yang persis sama dengan nama sebuah tim atau
  project dibiarkan seperti yang diketik, di mana pun digambar. Tim bernama "Design" dulu tetap "Design" di Daftar
  (`.tbadge`) tetapi menjadi "Desain" di panel task, halaman tim, chip kalender, Analitik, dan Pengaturan, karena
  teksnya sama dengan kunci kamus `"Design"` milik label bawaan. Label bawaan yang memakai `tr()` tetap diterjemahkan.

### Cara menambah string

1. Bungkus literal English dengan `tr("…")` di titik pakai (`esc(tr(...))` untuk teks,
   `attr(tr(...))` untuk atribut).
2. Tambahkan `"English": "Indonesia"` ke salah satu blok `Object.assign(UI_ID, {…})` di `src/i18n.js`, dengan istilah
   dari **`docs/GLOSSARY-ID.md`** (task, project, workspace, brand, template, file, password, review, tenggat, kamu, …).
   Kalau English yang sama sudah ada di blok lain, pakai kata yang persis sama.
3. Kalau string itu konten user yang **tidak boleh** diterjemahkan, beri `data-no-translate`.
4. `node build.js`.

`tests/i18n-sweep.test.js` gagal bila ada `tr("…")` di `src/` yang tidak punya kata Indonesia di blok mana pun (sweep
Oktober 2026 menemukan sekitar 200). Teks yang sama dalam bahasa Indonesia tetap diberi, ke dirinya sendiri
(`"internal":"internal"`). `e2e/indonesian-strings.spec.js` memeriksa layar yang diperbaiki sweep itu dalam bahasa
Indonesia, pada elemen tertentu saja.

### Kamus yang dimuat saat dibutuhkan (Oktober 2026, performance stage 3)

Blok `UI_ID` tetap ditulis di file yang memakainya, seperti biasa (test yang memuat file `src/` apa adanya punya
kamusnya). Tapi halaman server tidak membawanya: `build-i18n.js` menjalankan setiap blok — `var UI_ID={…}`,
`Object.assign(UI_ID,{…})` (yang belakangan menang), fungsi kecil yang langsung dipanggil dengan objek kata dan menulis
`UI_ID` (`(function(d){ … if(!(k in UI_ID)) … })({…})`: yang pertama menang; kalimat engine Smart Scoring lewat
kuncinya; `var SC_T=(function(t){…})({…})` yang nilainya tetap dipakai, menjadi `var SC_T={…}`) — di sandbox, dalam
urutan halaman, lalu menulis hasilnya ke `i18n-id.<hash>.json` dan mengganti blok di bundle dengan `void 0`.
Aturannya: blok harus jalan saat load — di level atas file, atau di level fungsi modul `(function(){ … })()` —
dan selain itu tidak boleh ada yang menulis `UI_ID`; kalau tidak, build berhenti dengan pesan yang menunjuk tempatnya.
**Satu English, satu Indonesia (Oktober 2026).** Kunci yang diberi kata berbeda oleh dua blok, atau dua kali dalam satu
objek, dulu diselesaikan diam-diam (halaman memakai salah satunya); 224 kunci seperti itu sudah diseragamkan ke
`docs/GLOSSARY-ID.md`, dan sekarang `node build.js` **berhenti** tanpa menulis apa pun bila ada yang baru, dengan pesan
yang menyebut kuncinya, tiap file dengan katanya, dan cara memperbaikinya (`build.js checkI18n`,
`build-i18n.js conflicts`/`conflictMessage`). `node build.js --i18n-conflicts` mendaftar semuanya.
`tests/i18n-conflicts.test.js` menjaga ini, dan juga gagal bila kata yang diganti glosarium (*proyek*, *tugas*,
*ruang kerja*, *merek*, *templat*, *berkas*, *kata sandi*, *tinjau*, *jatuh tempo*, *Anda*, …) muncul lagi di kamus.
Blok boleh mengulang kunci file lain (dengan kata yang sama) bila modulnya dimuat sendiri oleh test; dalam satu file
cukup sekali.

Di runtime (`src/core.js ZC_I18N`, `src/i18n.js zcI18n…`): halaman berbahasa Inggris tidak pernah memintanya. Script
awal di `<head>` memintanya bersamaan dengan session dan workspace bila browser ini menampilkan Indonesia
(`cos.language`, atau `cos.signedInLang` = bahasa orang yang login di sini); `boot()` menunggunya sebelum menggambar
apa pun, `afterLogin()` bila preferensi orang itu Indonesia, `setLanguage("id")` dari klik mengganti bahasa setelah
katanya ada (sudah diminta saat pointer/fokus sampai di pilihan Indonesia; menu tetap terbuka; pilihan yang datang
belakangan menang; gagal = tetap Inggris + pesan), ekspor berbahasa Indonesia menunggunya, dan placeholder nama
Indonesia di Settings diisi di tempat. Kode yang memanggil `setLanguage("id")` atau mengeset `UI_LANG="id"` sendiri
tanpa menunggu (seperti test browser) tetap benar: kalau belum ada yang memintanya, kamus diambil sekali secara
sinkron (`zcI18nNow`, juga dari `tr()` dan `localizeVisibleText()`) — jalan terakhir yang tidak dipakai klik pengguna.

---

## 9. Workspace Quest (onboarding)

Ada di `core.js:391-490` plus override di `onboarding-refinements.js`.

**`WQ_CHAPTERS`** — tuple `[id, chapterXP, glyph, [titleEN, titleID]]`. Sepuluh chapter,
total XP tepat **100**:
`welcome 5 · home 10 · tasks 15 · workflow 20 · dependencies 10 · projects 8 · calendar 7 ·
resources 10 · ai 10 · personal 5`.

**`WQ_STEPS`** — 23 step, tiap step 9 field:

| Idx | Nama | Arti |
|---|---|---|
| `[0]` | step id | `"chapter.name"` |
| `[1]` | chapter id | join ke `WQ_CHAPTERS[0]` |
| `[2]` | XP | integer |
| `[3]` | prep screen | `S.screen` yang dituju sebelum kartu tampil |
| `[4]` | anchor selector | CSS selector target spotlight — **dimutasi in-place untuk 7 step oleh `onboarding-refinements.js`** |
| `[5]` | action kind | `next`, `target`, `practice`, `filter`, `task-panel-position`, `dependencyDown`, `dependencyUp`, `review`, `aihub` |
| `[6]` | title | `[EN, ID]` |
| `[7]` | body | `[EN, ID]` |
| `[8]` | "DO THIS" | `[EN, ID]` |

> Step dengan 8 field akan membuat `wqRenderCoach` melempar `Cannot read properties of undefined`
> saat membaca `step[8]`. Kalau menambah step, hitung field-nya, dan **hitung ulang total XP**
> supaya tetap 100 (`wqComplete` memang meng-clamp, tapi progress bar akan mencapai 100%
> sebelum step terakhir kalau totalnya lebih).

Fungsi kunci:

- `wqPrepare(step)` — navigasi & persiapkan layar. Di-override di `onboarding-refinements.js:26`
  untuk menutup drawer/popover pada step nav, dan untuk `ai.close` menutup drawer **lebih dulu**
  (bug lama: panel AI terbuka di belakang overlay drawer sehingga tombol close tak bisa diklik).
- `wqRevealTarget(step)` — hanya ada di `onboarding-refinements.js`. Secara aktif membuat target
  terlihat: membuka `#sheet` mobile, membuka search bar, `scrollIntoView`.
- `wqAnchor(step)` — mengembalikan match **yang terlihat** saja.
- `wqRenderCoach()` — membangun overlay coach (mask SVG evenodd, ring, kartu).
- `WorkspaceQuest.emit(name)` — dipicu oleh capture-phase click listener pada `[data-tour]`,
  `#searchInput`, `#meBtn`.

Penyimpanan: `myPrefs().workspaceQuest` (server) atau
`localStorage["cos.workspaceQuest.v2.<me>"]` (standalone), `version === 2`.
Hanya untuk **non-admin** (`wqEligible()`).

---

## 10. Task drawer & task panel position

### Drawer

- `openTask(id)` — set `S.drawerTask`, pilih tab awal, `markRead`, tambahkan `.open` ke
  `#overlay` dan `#drawer`.
- `renderDrawer()` — menulis `#drHead` / `#drBody` / `#drFoot`.
- Tab: `brief` · `files` (Assets & versions) · `comments` · `activity`.
  Ada normalisasi legacy: `if (S.drawerTab==="versions") S.drawerTab="files";`
- Komentar (`src/comment-mention.js`): tiap kotak komentar punya key — id task, `project:<id>`, atau kotak
  balasan `<key panel>#r:<id komentar>` (`cmtReplyKey`). Draf kotak yang sedang ditulis ada di
  `window._cmtDraft/_cmtAtt/_cmtLinks/_cmtMentions` (`CMT_DRAFT_FOR`), draf kotak lain di `CMT_DRAFTS[key]`.
  **Balas** (`cmtReplyOpen`) membuka kotak balasan di bawah utas komentar itu; `CMT_REPLY_OPEN[key panel]`
  = komentar yang kotaknya terbuka (satu per panel). `S.replyTo` mengikuti key kotak yang sedang ditulis;
  kotak paling bawah tidak membalas apa pun. Orang yang boleh berkomentar tapi tidak mengedit task mengirim
  lewat `POST /api/tasks/:id/comments`, yang menjaga `parent` (`replyParent` di `server/server.js`).

### Menu klik kanan task (Oktober 2026)

- Klik kanan baris task membuka menu task-nya (`taskContextMenu` di `src/enhance.js`): Open, Open in new tab, Edit,
  Assign…, Change status…, Copy link, Watch, Save, Remind me…, Archive. Edit, Assign…, Change status… dan Archive
  hanya untuk yang boleh mengedit task itu. Pojok menu ada di pointer; Assign…, Change status… dan Remind me…
  terbuka di tempat yang sama (`taskCtxAt()`).
- `taskCtxId(el)` naik dari elemen yang diklik ke elemen terdekat yang `data-id`-nya task (`task(id)` ada), atau
  yang `onclick`-nya menyebut `openTask('<id>')` / `openTask("<id>")`. Sejak perbaikan XSS baris task membuka
  task-nya dengan `openTask(taskIdFrom(this))` dan menyimpan id di `data-id`; menu dulu hanya membaca onclick, jadi
  tidak terbuka di List, Kanban, hasil pencarian dan baris lain. Baris task baru cukup diberi `data-id`.
- Menu browser tetap muncul di input, textarea, select, tautan, teks yang bisa diedit dan teks terpilih di bawah
  pointer. Klik kanan yang sudah di-`preventDefault()` (judul kolom List, menunya sendiri) dibiarkan.
- Shift+F10 atau tombol menu pada kontrol yang terfokus di baris (kotak centang, tombol Open di Grid) membuka menu di
  bawah kontrol itu dengan fokus di item pertama. Esc menutup menu saja, dan fokus kembali.
- Baris di dialog (sheet "+ more" Kalender): Open dan Edit menutup dialognya dulu.
- Lebar ≤ 980 px: tidak ada menu ini. Tidak ada long-press khusus.
- Test: `e2e/task-context-menu.spec.js`.

### Esc: yang paling dalam saja (Oktober 2026)

Satu tekan Esc menutup satu hal, yang paling dalam: picker, popover, menu, dropdown, daftar @mention atau panel
emoji, dan fokus kembali ke kolom yang membukanya. Tekan berikutnya menutup modal (atau AI chat), lalu panel task.
Dulu handler global di `src/core.js` tetap jalan apa pun yang sudah dilakukan picker, jadi Esc di picker ikut
menutup panel.

- Komponen yang punya Esc sendiri menandai tekannya terpakai: `e.preventDefault()` (atau `stopPropagation()`).
  Handler global tidak melakukan apa-apa untuk tekan yang `defaultPrevented`.
- `escLayerOpen()` mengembalikan layer terbuka yang terakhir dari `ESC_LAYERS` dan kelihatan: `.pop.open`,
  `.menu.open` (kecuali picker inline di dalam modal, yang ikut modalnya), `.pillsel-custom.open`,
  `#tagPickPop.open`, `#scrKdd`, `#palette`, `.link-card.open`. Ini dicek di capture `window` sebelum handler mana
  pun (`e._escLayer`), karena picker yang menutup dirinya sudah hilang saat tekannya sampai ke `document`. Tekan
  yang menemukan layer terbuka hanya menutup layer itu.
- `escCloseLayer(el)` memanggil `el._escClose()` kalau ada (entity picker, tag picker, kind dropdown, pill-select
  toolbar, command palette, kartu link). Selain itu ia memanggil `closePops()` dan memfokus `el._anchor`.
- `escFocusBack(el, layer)` memfokus `el` hanya kalau fokus ada di dalam layer itu atau sudah jatuh ke `body`.
- Menambah layer baru: beri elemennya `_escClose`, tambahkan selektornya ke `ESC_LAYERS`, dan di Esc-nya sendiri
  cukup `preventDefault()`.
- Modal di atas panel (`src/v29.js`): saat ditutup, fokus kembali ke kontrol panel yang terakhir difokus sebelum
  modal terbuka. Untuk modal dari menu panel, itu tombol menunya.
- `openMenu("ctxMenu")` mengosongkan `onkeydown` menu. Menu gear memasangnya, dan dulu ikut terbawa ke setiap menu
  sesudahnya: Esc di panel emoji memfokus tombol gear di panel yang sudah tertutup.
- Test: `e2e/escape-layers.spec.js`.

### Gear menu

Satu tombol header (`data-tour="task-settings"`) menggabungkan panel position dan task actions.

- `taskGearMenuHtml()` — header "Panel position", tiga icon radio (left/center/right),
  separator, shortcut ke Settings → Layout; lalu divider dan aksi task
  (Duplicate / Export CSV / Hide / Delete) yang di-gate per capability.
- `refreshTaskGearMenu()` — mengecat ulang menu yang terbuka **di tempat**
  (`m.innerHTML = taskGearMenuHtml()`). **Tidak boleh memakai `ctxMenu()`** — itu akan
  menutup menunya.
- `taskGearSetPosition(pos)` — memotret state drawer, panggil setter, kembalikan state,
  **biarkan menu terbuka**, dan pindahkan fokus ke ikon yang baru dicat.

### Task panel position

```js
var TASK_PANEL_POSITIONS = ["right","center","left"];   // default "right"
function applyTaskPanelPosition(){
  document.documentElement.setAttribute("data-task-panel", taskPanelPosition());
}
```

Ketiga layout adalah **CSS murni** yang bergantung pada atribut `data-task-panel` di `<html>`.
Karena itu mengganti posisi tidak pernah mengganggu task yang terbuka: DOM drawer tidak dibangun ulang.

**`movePanelWithAnimation(apply)`** menangani dua masalah nyata:

- **Panel tertutup.** Tiga posisi memarkir panel di tiga tempat berbeda (kanan layar, kiri layar,
  tengah yang pudar) dan CSS dengan senang hati men-transisi antar tempat parkir itu — sehingga
  panel kosong besar menyapu melintasi halaman setiap kali setting diubah dari layar Settings.
  Solusi: tambahkan class `.panel-move` (mematikan transition), `apply()`, `void d.offsetWidth`
  untuk commit, hapus class-nya di frame berikutnya.
- **Panel terbuka.** `right:10px` tidak bisa di-tween ke `right:auto`. Men-tween kotaknya sendiri
  membuat isi panel reflow tiap frame (terlihat gemetar). Solusi: **cross-fade** —
  redup ke 0 (`PANEL_FADE_OUT = 120ms`), `apply()` selagi tak terlihat, muncul kembali
  (`PANEL_FADE_IN = 170ms`). Dilewati untuk `prefers-reduced-motion`, `innerWidth <= 980`,
  atau browser tanpa `Element.animate`. Menu yang ter-anchor di dalam `#drawer` ikut fade.
  Re-entrancy ditangani lewat `d._panelMove` + `onfinish`/`oncancel`.

`trackPanelFollowers()` menempelkan ulang `#ctxMenu` yang anchor-nya di dalam `#drawer`
supaya menu ikut bergerak, bukan tertinggal.

---

## 11. AI Studio / canvas

Delapan file, masing-masing satu tanggung jawab. Semuanya membungkus (bukan mengganti)
fungsi dari file sebelumnya, kecuali `ai-properties.js`.

| File | Tanggung jawab | Entry point utama |
|---|---|---|
| `studio-editor.js` | compositor + identitas & stacking layer | `aiLayerMeta`, `aiLayerIds`, `aiMoveLayer`, `aiCompositeLayers`, `aiRefreshProperties` |
| `canvas-controls.js` | zoom, toolbar canvas, selection handle & resize | `AI_VIEW`, `aiViewZoom`, `aiCanvasZoomUI`, `aiShowSelectionHandle`, `aiTransformShape` |
| `canvas-navigation.js` | infinite canvas: pan, pointer-anchored zoom, ruler | `aiCaptureView`, `aiPlaceView`, `aiZoomAround`, `aiRulerDraw`, `aiPanStart` |
| `canvas-guides.js` | guide dari ruler + snapping | `aiGuides`, `aiSnapToGuides`, `aiGuideDragStart`, `aiAddGuide` |
| `multi-selection.js` | model seleksi yang dibaca semua file lain | `aiSelectedIds`, `aiSetSelection`, `aiChooseLayer`, `aiSelectionBounds`, `aiAlignSelected` |
| `studio-actions.js` | clipboard, duplicate, drag baris layer, download | `AI_LAYER_CLIPBOARD`, `aiCopySelection`, `aiPasteLayers`, `aiRowDragStart`, `aiRasterPDF`, `aiDownload` |
| `style-effects.js` | primitive paint bersama + section Effects | `aiGradient`, `aiGlowOn`, `aiShadowRgba`, `aiShapePath`, `aiEffectSet` |
| `ai-properties.js` | **rewrite penuh** Properties panel | `aipInspector`, `aipMulti`, `aipEmpty`, `aipLayerCounter`, `aipToggleSection` |

Kontrak yang dipegang ketiga file canvas: **view transform bersifat view-only.**
Zoom, pan, dan ruler tidak pernah mengubah koordinat desain atau dimensi export.
Guide adalah metadata desain — hanya overlay DOM yang merender, tidak pernah compositor.

`ai-properties.js` dibuat karena panel lama adalah satu string builder yang output-nya
di-parse ulang oleh tiga file lain dengan regex terhadap label English —
*"which is why it drifted: a renamed label silently moved a control to the wrong section."*
Panel baru punya primitive kontrol sendiri, urutan section per tipe layer, state collapse
yang persist di `localStorage["cos.ai.props.open"]`, dan unit switch px ↔ %.

---

## 12. Export subsystem

`src/export.js` — *"client-side ZIP writer → .xlsx / .pptx, plus CSV & JSON backup.
No libraries: both Office formats are plain XML inside a ZIP."*

### ZIP writer

`CRC_T` (tabel CRC-32 precomputed) → `crc32(u8)` → `zipBytes(entries)` yang menulis entry
**stored (tanpa kompresi)**: local header `0x04034b50`, central directory `0x02014b50`,
EOCD `0x06054b50`, flag UTF-8 `0x0800`.

### PPTX

- **Satuan**: `EMU = 914400` per inch; `pxE(inch)` konversi di batas. Semua argumen geometri
  di file ini dalam **inch**.
- **Ukuran slide**: `SW = 12192000`, `SH = 6858000` EMU = 13.333″ × 7.5″ (16:9).
- `ppRun(text, o)` — satu `<a:r>`; `sz` adalah point × 100; typeface `Poppins`.
- `ppPara(runs, o)` — satu `<a:p>` dengan alignment dan bullet.
- `ppShape(id, x, y, w, h, o)` — pekerja utama; memancarkan `<p:sp>` lengkap.
  Geometry: `ellipse` kalau diminta, `roundRect` kalau ada fill/stroke dan `o.sharp !== true`,
  selain itu `rect`.
- `slideXml(shapes, bg)` — membungkus array shape jadi `<p:sld>`.
- `iconPng(name, color)` — mengambil inline SVG dari tabel `I`, membungkus ulang di 96×96,
  meraster ke PNG data URL, di-memoise di `PPT_ICONS`. `preparePptIcons()` merender
  15 nama ikon × 2 warna sebelum build slide yang sinkron.
- `buildPPTX()` merakit seluruh paket OPC dengan tangan: `[Content_Types].xml`, `_rels/.rels`,
  `docProps/*`, `ppt/presentation.xml`, satu slideMaster, satu slideLayout, `theme1.xml`,
  `ppt/media/icon<n>.png`, dan per slide `slideN.xml` + `_rels/slideN.xml.rels`.

### XLSX

`buildXLSX()` + dua file presentasi:

- `report-template.js` — **data saja**: `REPORT_TEMPLATE.styleSheet` (XML style yang sudah
  ditulis sebelumnya, number format 200–203, 9 font) dan template chart, plus
  `REPORT_TEMPLATE.ids` (peta nama style → index).
- `report-layout.js` — layer presentasi: `xlCell`, `xlStart` (freeze header di baris 5),
  `xlPage` (A4 landscape fit-to-width), `xlDate` (serial Excel = `ms/86400000 + 25569`),
  `reportDetailXml`, `reportDashboardXml`, `reportChartXml`, `reportDrawingXml`.

### CSV

`csvRows()` — quoting RFC-4180, line ending `\r\n`. `taskRows(list)` — 21 kolom header
(diterjemahkan lewat `tr`) plus satu kolom per custom field. `exportCSV()` dan `exportTaskCSV(id)`
keduanya memberi prefix BOM `"﻿"` supaya Excel membuka UTF-8 dengan benar.

### PDF / print — dua jalur terpisah

1. **Print seluruh aplikasi** → `window.print()`. Tidak ada library PDF. Output sepenuhnya
   dibentuk CSS: blok kecil di `head.html` plus print stylesheet lengkap di `refinements.css`
   yang membuka kunci scroll (`overflow:visible; height:auto`), menyembunyikan seluruh chrome
   (`#tabbar`, `#sheet`, `#aiFab`, `#aiChat`, `#drawer`, `.topbar`, `.pop`, `.menu`,
   `#modalWrap`, `#workspaceQuestRoot`, dst.), menyembunyikan kontrol interaktif, dan
   mengempiskan kolom kanban kosong.
2. **PDF satu desain** → `aiRasterPDF(jpeg, w, h)` di `studio-actions.js`: PDF 1.4 yang
   ditulis tangan, 5 object, JPEG ditanam sebagai image XObject `/DCTDecode`,
   `MediaBox` = `w*0.75 × h*0.75` (px → pt pada 96 dpi), xref table dibangun manual.

### JSON backup

`exportJSON()` menulis snapshot `version:3` dengan `baseDate`. `importJSON()` me-rebase
setiap offset hari saat masuk dan **menolak berjalan ketika `API.on`** —
*"snapshot restore is for demo mode — the server database is the source of truth."*

---

## 13. Personal "checked" tick

Penanda personal "sudah saya lihat". **Bukan** task state: tidak dikirim ke server,
tidak menggerakkan workflow, tidak muncul di export/laporan/activity/board orang lain.

| Fungsi | Perilaku |
|---|---|
| `taskCheckKey()` | `"cos.taskChecked." + (ME \|\| "anon")` |
| `taskCheckSet()` | cache modul + key yang memilikinya, sehingga `actAs` otomatis meng-invalidate |
| `taskChecked(id)` / `taskCheckCount()` | query |
| `taskCheckBtn(id, extra)` | tombol `role="checkbox"`; `extra` = `"xs"` untuk chip kalender |
| `toggleTaskChecked(id, ev)` | `stopPropagation` + `preventDefault` (tick duduk di atas kartu yang seluruh permukaannya membuka task) |
| `paintTaskCheck(id)` | repaint bedah `.tcheck[data-check="…"]`, toggle `.checked` pada `.kcard, tr, .chip, .row` terdekat |
| `taskCheckChip()` / `syncTaskCheckBar()` | chip "n checked" + tombol clear di toolbar |
| `clearTaskChecks()` | kosongkan semua |

Permukaan render: kanban card (`tasks.js` `kcard`), baris tabel (`taskTable`), chip kalender
(`chipHtml`), agenda "Next 14 days", sheet hari kalender (`calAgenda` lewat
`taskRow(t,{fixedMeta:true, check:true})`), dan chip di `filterBar`.
Disembunyikan saat print.

> Grid `.agenda .row.dated` dan `.cal-more-list .row` memakai CSS grid dengan jumlah kolom
> tetap. Menambah anak baru tanpa menambah kolom akan menggeser seluruh isi baris —
> template-nya (termasuk override mobile) harus ikut ditambah satu kolom.

---

## 14. Server: arsitektur

Satu file utama `server/server.js` (62 KB) plus modul pendukung. Tidak ada framework.

```
route(method, pattern, handler)     // :param -> named regex group, anchored ^…$
```

Dispatch: `routes.find(x => x.method === req.method && x.re.test(url.pathname))` —
**registrasi pertama menang**. Route gallery didaftarkan lebih dulu.

Signature handler: `(user, params, query, body, ctx)`.
Body hanya di-parse untuk method selain GET dan DELETE — **handler DELETE selalu menerima `{}`**.

Setiap request `/api/` menjalankan `security.requireSameOrigin(req)` sebelum routing.
Set `OPEN` (boleh tanpa autentikasi): `/api/auth/session`, `/api/auth/status`, `/api/auth/login`,
`/api/auth/register`, `/api/auth/logout`, `/api/health`. Selain itu → `401 "Please sign in"`.

`forbid(ok, what)` melempar `403 "You don't have permission to <what>."`

Modul:

| File | Isi |
|---|---|
| `server/db.js` | buka SQLite, jalankan `db/schema.sql`, jalankan daftar migrasi `ALTER TABLE` |
| `server/serialize.js` | hidrasi/dehidrasi antara bentuk DB dan bentuk client; masking AI key & SMTP password; `sweepArchive` |
| `server/permissions.js` | `CAPS`, `DEFAULT_ROLES`, `has()`, predikat komposit `can.*` |
| `server/auth.js` | hashing password, session, cookie |
| `server/security.js` | rate limit, same-origin, security headers, security log, `clientIp` |
| `server/secrets.js` | AES-256-GCM untuk AI key & SMTP password |
| `server/backup.js` | backup terenkripsi, checksum, retention, restore, audit |
| `server/mailer.js` | transport log/smtp/resend, SMTP ditulis tangan, `verifySmtp` |
| `server/gallery.js` | route AI Gallery + DDL runtime tabelnya |
| `server/analytics.js` | agregasi mingguan |
| `server/seed.js` | seed demo workspace |
| `shared/gallery-model.js` | validasi & permission gallery, **dipakai server dan browser** |

Static file: `/` → `public/index.html`; `/shared/*` dari root repo; sisanya dari `public/`.
Ada guard path traversal. **Static tidak butuh autentikasi.** `public/assets/` dan `public/fonts/` immutable setahun;
`/assets/<nama>` dari build sebelumnya dikirim dari `<data>/asset-history/` (§3, "Deploy").

---

## 15. Server: referensi API

### auth / session

| Route | Perilaku | Butuh |
|---|---|---|
| `GET /api/health` | `{ok:true, service:"zencrevia"}` | open |
| `GET /api/auth/session` | user saat ini + info workspace + `canRegister` | open |
| `GET /api/auth/status` | nama workspace, logo, `allowRegistration`, `joinCodeRequired` | open |
| `POST /api/auth/login` | login ber-rate-limit, set cookie `cos_session` | open |
| `POST /api/auth/register` | self-registration, digerbangi `allow_registration` + join code | open |
| `POST /api/auth/logout` | hapus row session, kosongkan cookie | open |
| `POST /api/auth/password` | ganti password sendiri; **menghapus semua session lain** | signed in |
| `GET /api/me`, `GET /api/auth/me` | object `userContext` | signed in |
| `GET /api/bootstrap` | payload penuh aplikasi | signed in |

### members / roles / teams

| Route | Butuh |
|---|---|
| `POST /api/members` | `manage_members` |
| `PUT /api/members/:id` | `manage_members` **atau** diri sendiri (field sensitif dipaksa kembali) |
| `DELETE /api/members/:id` | `manage_members`, tidak bisa diri sendiri |
| `POST /api/members/:id/password` | `manage_members`; hapus semua session target |
| `POST /api/members/:id/active` | `manage_members`; deaktivasi menghapus session |
| `POST /api/members/:id/team`, `DELETE /api/members/:id/team/:teamId` | `manage_teams` |
| `GET /api/roles` | signed in (**tanpa cek capability**) |
| `POST/PUT/DELETE /api/roles[/:id]` | `manage_roles`; role `is_system` tidak bisa dihapus |
| `POST/PUT/DELETE /api/teams[/:id]`, `POST /api/teams/reorder` | `manage_teams` |

### projects / tasks / requests

| Route | Butuh |
|---|---|
| `POST /api/projects` | `create_project` |
| `PUT /api/projects/:id` | `can.editProject` |
| `DELETE /api/projects/:id` | `delete_project` |
| `POST /api/projects/:id/archive` | `can.editProject` |
| `POST /api/projects/reorder` | `create_project` |
| `POST /api/tasks` | `can.createTask`, **atau** jalur request (`submit_request` + stage pertama + tanpa assignee) |
| `PUT /api/tasks/:id` | `can.editTask`; ganti assignee butuh `can.assignTask`; approve/revision butuh `can.approveTask`; tambah version/file butuh `can.uploadFile` |
| `DELETE /api/tasks/:id` | `delete_task` |
| `POST /api/tasks/:id/move` | `can.editTask`; op: `MOVE_TASK_STATUS`, `REORDER_TASK`, `MOVE_TASK_DATE`, `MOVE_TASK_TIMELINE`, `MOVE_TASK_PROJECT`, `MOVE_TASK_TEAM`, `MOVE_TASK_ASSIGNEE`, `MOVE_TASK_PRIORITY` |
| `POST /api/tasks/:id/hidden` | `can.editTask` |
| `POST/PUT/DELETE /api/requests[/:id]` | `submit_request` / `decide_request` |

Validasi: gambar tertanam harus `data:image/(png|jpeg|webp);base64,` ≤ 3.000.000 karakter;
link harus `https:` atau `s3:`; nama file ≤ 240; judul task ≤ 240;
dependency dicek tanpa self-dep, tanpa duplikat, dan **deteksi siklus**.

### assets / knowledge / views / notifications / activity

`POST/PUT/DELETE /api/assets[/:id]`, `POST/DELETE /api/folders[/:id]` → `manage_assets`.
`POST/PUT/DELETE /api/knowledge[/:id]` → `manage_knowledge`.
`POST/PUT/DELETE /api/views[/:id]` → **tanpa cek capability**; owner dipaksa ke pemanggil.
`POST /api/notifications`, `POST /api/notifications/read`, `POST /api/activity` → tanpa cek capability,
tapi `activity.k` dibatasi allow-list dan penerima notifikasi difilter ke anggota workspace.

### workspace / analytics

`PUT /api/workspace` → `manage_workspace`. Memaksa default `ai.processing`
`{externalEnabled:false, workspaceContextEnabled:false}`, mencap `acceptedAt`/`acceptedBy`
saat salah satu flag dinyalakan, dan mencatat `workspace_security_settings_changed`.

`GET /api/analytics?weeks=&to=` → `view_analytics`. `weeks` di-clamp 1–52 (default 8).

### AI

| Route | Catatan |
|---|---|
| `POST /api/ai/image` | butuh `ai.processing.externalEnabled`; resolve model lewat registry; timeout 120 s |
| `POST /api/ai/chat` | butuh `externalEnabled`; mengirim `b.context` juga butuh `workspaceContextEnabled`; timeout 60 s |

`aiResolveRegistryModel(registryId)` — **server, bukan browser, yang memutuskan model mana
yang boleh jalan.** Kalau registry kosong, jatuh ke `b.model || c.model`. Kalau registry ada
tapi tidak ada yang aktif → `400 "No AI model is active…"`. Kalau `registryId` yang dikirim
tidak ada di set aktif → `400 "That AI model is not available in this workspace."`

Allowlist host AI: `api.anthropic.com`, `generativelanguage.googleapis.com`, `api.openai.com`,
`api.magnific.ai`, plus `COS_AI_ALLOWED_HOSTS`. Endpoint wajib `https:`.

**API key provider tidak pernah sampai ke browser** — `maskAI` mengosongkannya di setiap
pembacaan workspace; nilai mentah hanya dibaca server lewat `readAIRaw`.

### gallery

| Route | Butuh |
|---|---|
| `GET /api/ai/gallery` | signed in; mode `all\|mine\|archived\|favorites`, page size tetap **24** |
| `GET /api/ai/gallery/:id` | signed in; item archived 404 kecuali `canManage` |
| `POST /api/ai/gallery` | `canCreate` |
| `POST /api/ai/gallery/:id/duplicate` | `canDuplicate` |
| `PATCH /api/ai/gallery/:id` | `canManage`; optimistic locking pada `revision` → 409 |
| `POST /api/ai/gallery/:id/favorite` | signed in |

### mail / backup / ops

| Route | Butuh |
|---|---|
| `GET /api/mail/status`, `GET /api/mail/smtp`, `PUT /api/mail/smtp`, `POST /api/mail/smtp/test`, `POST /api/mail/smtp/send-test`, `GET /api/mail/log` | `manage_workspace` |
| `POST /api/mail/test` | signed in (mengirim ke diri sendiri) |
| `GET /api/backups`, `GET /api/backups/:name`, `PUT /api/backups/settings`, `POST /api/backups/:name/verify`, `DELETE /api/backups/:name` | `manage_workspace` |
| `POST /api/backups` | `manage_workspace` + `COS_BACKUP_KEY` |
| `POST /api/backups/:name/restore` | `manage_workspace` + `COS_BACKUP_KEY` + `body.confirm === :name` |
| `POST /api/reset` | `manage_workspace`; **403 keras di production** |

---

## 16. Database

`server/db.js`: `DatabaseSync`, `PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON`,
lalu **seluruh `db/schema.sql` dieksekusi setiap `open()`** — semua statement `IF NOT EXISTS`
sehingga idempotent.

### Tabel

`workspaces`, `users`, `sessions`, `roles`, `workspace_members`, `teams`, `team_memberships`,
`projects`, `project_members`, `milestones`, `task_statuses`, `brief_templates`, `tasks`,
`task_dependencies`, `briefs`, `tags`, `task_tags`, `custom_fields`, `custom_field_values`,
`files`, `file_versions`, `approvals`, `revision_requests`, `comments`, `creative_requests`,
`asset_folders`, `assets`, `cloud_connections`, `knowledge_pages`, `saved_views`,
`notifications`, `activity_logs`.

Dua tabel **tidak** ada di `schema.sql` — dibuat runtime oleh `server/gallery.js`:
`ai_gallery` dan `ai_gallery_favorites`.

Catatan bentuk data yang mudah salah:

- `tasks.sort_order` bertipe **REAL** (untuk rank-between saat reorder).
- `tags` **tidak punya kolom warna** — ini disengaja. Label punya warna, tag tidak.
- `notifications` memakai `recipient_id` dan `type` (bukan `user_id` / `kind`).
- `task_dependencies` punya `CHECK(task_id <> depends_on_task_id)`.

### Mekanisme migrasi

**Tidak ada tabel versi skema dan tidak ada nomor versi di mana pun.** Yang ada:

1. `schema.sql` dijalankan ulang setiap boot (idempotent).
2. Sebuah array `ALTER TABLE` hard-coded dijalankan dalam loop `try { } catch { }` —
   kegagalan (kolom sudah ada) ditelan diam-diam. Ini yang menambahkan kolom baru,
   karena `CREATE TABLE IF NOT EXISTS` tidak pernah menambah kolom ke tabel yang sudah ada.
3. `gallery.js` membuat tabelnya sendiri plus cek `PRAGMA table_info` untuk kolom `notes`.
4. Migrasi **data** di `server.js`: `migrateRequests()` mengubah setiap `creative_requests`
   yang belum dikonversi menjadi task.
5. `sweepArchive` (auto-archive) jalan saat boot, tiap 6 jam, dan pada setiap `GET /api/bootstrap`.

> **Menambah kolom:** tambahkan ke `db/schema.sql` (untuk instalasi baru) **dan** ke daftar
> `ALTER TABLE` di `server/db.js` (untuk instalasi lama). Melewatkan salah satunya berarti
> instalasi baru atau lama akan rusak.

---

## 17. Auth, session, permission

### Password

`crypto.scryptSync(pw, salt, 64, { N: 16384 })`, hex. Salt = `randomBytes(16).toString("hex")`.
Verifikasi memakai `crypto.timingSafeEqual`.

Policy: ≥ 8 karakter, ≤ 256, dan minimal **tiga** dari empat kelas
`[a-z]`, `[A-Z]`, `\d`, `[^A-Za-z0-9]`.

### Session

Token = `randomBytes(32).toString("hex")` dikirim ke browser; **id yang disimpan** adalah
`"sha256:" + sha256(token)`. `readSession` menerima bentuk hashed **atau** raw
(jalur kompatibilitas untuk row lama).

Cookie `cos_session`: `Path=/; HttpOnly; SameSite=Lax`, plus `Secure` bila
`COS_SECURE_COOKIE=1` atau `NODE_ENV=production`. TTL `COS_SESSION_HOURS` (default 1440 = 60 hari, minimal 1), dihitung dari terakhir kali sesi dipakai; diperpanjang paling sering sekali per `COS_SESSION_RENEW_HOURS` (default 24).

Session dihapus saat: ganti password sendiri (semua session lain), reset password oleh admin
(semua session target), deaktivasi (semua session target).

### Capabilities (28)

`manage_workspace`, `manage_members`, `manage_teams`, `manage_roles`, `create_project`,
`edit_any_project`, `delete_project`, `create_task`, `create_own_task`, `edit_any_task`,
`edit_team_tasks`, `edit_own_task`, `assign_task`, `review_any`, `delete_task`, `upload_file`,
`decide_request`, `manage_assets`, `manage_knowledge`, `view_analytics`, `view_all`,
`submit_request`, `use_ai_hub`, `view_ai_gallery`, `publish_ai_gallery`, `duplicate_ai_gallery`,
`manage_own_ai_gallery`, `manage_all_ai_gallery`.

`has(u, cap)`: **`u.role === "admin"` short-circuit ke `true`**, selain itu lookup di `u.caps`.

Predikat komposit di `permissions.js`:

```
teamTask   = edit_team_tasks && (leadsTeam || inTeam)
ownTask    = edit_own_task && (isAssignee || isReviewer)
editTask   = edit_any_task || teamTask || ownTask
assignTask = assign_task || (edit_team_tasks && leadsTeam) || (create_own_task && !t.assignee)
approveTask= review_any || isReviewer || (edit_team_tasks && leadsTeam)
uploadFile = upload_file && (edit_any_task || teamTask || isAssignee || isReviewer)
```

**Mirror di client (`canI.*`) hanya menyembunyikan tombol.** Server yang menegakkan.

### Permission AI Gallery

Ada di `shared/gallery-model.js`, dipakai server **dan** browser:

```js
const legacyProxy = u => cap(u,'upload_file') || cap(u,'manage_assets');
const canView     = u => cap(u,'view_ai_gallery')      || cap(u,'manage_workspace') || legacyProxy(u);
const canCreate   = u => cap(u,'publish_ai_gallery')   || cap(u,'manage_workspace') || legacyProxy(u);
const canDuplicate= u => cap(u,'duplicate_ai_gallery') || canCreate(u);
const canManage   = (u,item) => cap(u,'manage_all_ai_gallery') || cap(u,'manage_workspace')
                    || ((cap(u,'manage_own_ai_gallery') || canCreate(u)) && item.ownerId === u.id);
```

`legacyProxy` sengaja dipertahankan supaya definisi role pra-v16 tetap bekerja.

---

## 18. Security

**Rate limiting** — `Map` in-memory berkunci `"<ip>|<email>"`, hanya untuk login dan registrasi.
Window `COS_LOGIN_WINDOW_MS` (default 15 menit, minimal 60.000 ms), maksimum
`COS_LOGIN_MAX_ATTEMPTS` (default 5, minimal 3), kapasitas map `COS_LOGIN_MAX_KEYS`.
Window **tidak** sliding. Tidak ada rate limit global untuk API lain.

**Body cap** — `COS_MAX_BODY_BYTES`, default 12 MB, minimal 1 MB. Dicek dua kali
(`Content-Length` dan akumulasi streaming) → `413 "Body too large"`.

**CSRF / origin** — tidak ada CORS layer dan tidak ada CSRF token. Pertahanannya adalah
`SameSite=Lax` plus same-origin enforcement pada method yang mengubah state:
`GET`/`HEAD`/`OPTIONS` dikecualikan; `Origin` yang hilang ditolak di production
(kecuali `COS_ALLOW_MISSING_ORIGIN=1`); `Origin` harus ada di `COS_ALLOWED_ORIGINS`
atau host-nya sama dengan `req.headers.host`.

**Security headers** (semua response, termasuk static dan error):
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
`Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`,
`Cross-Origin-Opener-Policy: same-origin-allow-popups`, `Cache-Control: no-store`,
`Strict-Transport-Security` (production saja), dan CSP:

```
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self';
script-src 'self' 'unsafe-inline' https://accounts.google.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: blob: https:;
connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com;
frame-src https://drive.google.com https://docs.google.com https://accounts.google.com
          https://content.googleapis.com https://apis.google.com https://www.figma.com
          https://embed.figma.com https://www.canva.com https://www.youtube-nocookie.com
          https://player.vimeo.com https://www.loom.com https://miro.com
```

`frame-src` hanya berisi host embed resmi (daftar `FRAME_SOURCES` di `server/security.js`), sama
dengan yang dipakai preview versi (`embedFor` di `src/version-preview.js`). Jangan tambahkan
`https:` atau situs sembarang: halaman dari mana pun yang dibingkai di dalam aplikasi bisa meniru
halaman login. Iframe embed memakai `sandbox` tanpa `allow-top-navigation`.

**Pratinjau Figma** (Oktober 2026, `server/link-preview.js`) — file Figma tampil sebagai thumbnail dulu, dan embed
Figma (alamat, `sandbox` dan `frame-src` yang sama) baru dimuat setelah **Open interactive / Buka interaktif**
(`figmaBoxHtml` di `src/version-preview.js`; di dalam task tetap interaktif untuk tautan itu sampai task ditutup).
`GET /api/link-preview?url=…[&refresh=1]` hanya untuk anggota yang login: 60 permintaan per menit per orang; Figma
ditanya paling banyak 30 kali per menit untuk workspace dan 12 per orang, satu fetch per file sekaligus. Yang di-fetch
hanya oEmbed Figma yang dibangun dari jenis dan key tautan figma.com yang sudah dicek (bukan tautan apa adanya), lalu
`thumbnail_url` dari jawabannya bila https di figma.com atau subdomainnya: tanpa nama user dan port, redirect diikuti
manual paling banyak 3 kali ke host yang sama aturannya, 5 MB (oEmbed 256 KB) dihitung saat diterima, 10 detik, dan
harus PNG/JPEG/WebP/GIF menurut byte-nya. Jaringannya `guardedFetch` dari `server/messages.js` (alamat dicek saat
connect). Gambar disimpan lewat `uploads.putGenerated` → `/files/<sha256>.webp` di belakang session, jadi `img-src`
tidak berubah. Cache per file key (tabel `link_previews`): 6 jam; file privat 1 jam; gagal 10 menit dengan gambar lama
tetap dipakai. Lewat 6 jam gambar lama langsung dikirim dan yang baru di-fetch di belakang; **Muat ulang pratinjau**
memaksa fetch, paling sering sekali per menit per file.

**Nama tautan lewat oEmbed** (`GET /api/links/title`, `server/messages.js`) — nama file Figma, video YouTube/Vimeo,
rekaman Loom dan board Miro dibaca dari oEmbed layanannya. Tautan tidak dikirim apa adanya bila layanannya menolak
bentuk itu: `server/oembed-links.js` (dipakai juga oleh `server/link-preview.js`, jadi keduanya tidak bisa berbeda)
membangunnya ulang dan mengecek key/id-nya. Dicek dengan curl ke tautan publik asli (23 Okt 2026): Figma menolak
`figma.com` tanpa www (400 "expected the url host to be a figma host") dan http, jadi selalu
`https://www.figma.com/<jenis>/<key><path setelah key>` plus `node-id` bila valid (query lain dan fragment dibuang;
judulnya tetap judul file); tautan komunitas (`/community/file/<id>`) ditolak Figma dalam bentuk apa pun ("Not a Figma
URL"), jadi tidak ditanyakan dan tetap memakai kata-kata dari tautannya. Loom menolak fragment atau garis miring tepat
setelah id → `https://www.loom.com/share/<id 32 hex>`. Miro menolak `www.miro.com` → `https://miro.com/app/board/<id>/`.
YouTube dan Vimeo menerima semua bentuk yang biasa ditempel (m., youtu.be `?si=`, `#t=`, dst.), jadi dikirim apa
adanya. Key/id yang bentuknya salah ditolak 400 sebelum ada fetch. Guard SSRF, cache dan rate limit tidak berubah.

**Pratinjau video** (Oktober 2026, route yang sama) — video YouTube, Vimeo dan Loom juga tampil sebagai thumbnail dulu,
dalam bentuk dan ukuran player-nya (`width`/`height` oEmbed: 16:9, Shorts 9:16, rekaman Loom sering 4:3), dengan
**Play / Putar** di tengah dan **Open in YouTube / Buka di YouTube** (Vimeo, Loom) di sebelahnya (`videoBoxHtml` di
`src/version-preview.js`). Play memuat iframe yang sama (`embedFor`, `sandbox` dan `frame-src` tidak berubah) ditambah
`autoplay=1`, di tempat dan ukuran yang sama; di dalam task tetap jadi player sampai task ditutup. Video privat,
unlisted tanpa hash, atau yang tidak ada tampil sebagai kartu dengan logo provider, nama dari tautannya, dan "Private
video: no preview / Video privat: pratinjau tidak tersedia", plus Play yang memuat iframe seperti biasa. Cek tautan
dan key/id-nya ada di satu tempat, `shared/link-providers.js`: dipakai halaman (tautan mana yang tampil sebagai gambar)
dan oleh `server/oembed-links.js`, yang dipakai nama tautan dan pratinjau gambar. YouTube 11 karakter dari `watch?v=`,
`youtu.be/`, `/shorts/`, `/embed/`, `/live/`; Vimeo angka plus hash unlisted, `/<id>/<hash>` atau `?h=`; Loom 32 hex
dari `/share/` atau `/embed/`, boleh dengan judul di depannya; Figma seperti sebelumnya. `oembed-links.js` membangun
alamat oEmbed gambar dari id saja (`pictureOembedUrl`: Shorts sebagai `/shorts/<id>`, Vimeo dengan `width=1280`); untuk
nama, YouTube dan Vimeo tetap dikirim apa adanya, tapi hanya bila id-nya lolos cek yang sama (tautan `/embed/` YouTube
tidak ditanyakan namanya). Tabel `PROVIDERS` di `server/link-preview.js` memegang yang khusus route gambar: host yang
boleh (`i.ytimg.com`/`i1`–`i9.ytimg.com`, `i.vimeocdn.com`, `cdn.loom.com`), lama cache (video 7 hari, privat 1 jam,
gagal 10 menit), status "privat", dan bentuk gambar. Provider yang tidak terjangkau (mis. `vimeo.com` tidak resolve di
DNS mesin pengembangan, 23 Okt 2026) jadi `unavailable`: kartu "No preview right now / Pratinjau belum tersedia" dengan
Play; server bertanya lagi setelah 10 menit, halaman bertanya lagi bila kotaknya digambar 10 menit kemudian, dan panel
tidak pernah menunggu jawabannya. Jawaban asli yang dicek 23 Okt 2026 ada di komentar `server/link-preview.js`:
YouTube privat 403, embed dimatikan 401, id tidak ada 400; Vimeo privat atau unlisted tanpa hash 404, unlisted yang dibatasi domain 200 tanpa
judul dan thumbnail (`domain_status_code` 403); Loom tidak ada atau privat 404; CDN Loom mengirim JPEG sebagai
`application/octet-stream`, jadi untuk Loom byte-nya yang menentukan. Balasan route: `{provider, key, title, thumb,
width, height, private, unavailable, fetchedAt}` plus `duration` (detik, Vimeo dan Loom) bila ada; untuk Figma juga
`nodeId`. Batas fetch 30 per menit dan 12 per orang berlaku per provider. Tabel `link_previews` mendapat kolom
`duration` (ditambahkan otomatis pada database lama).

**Security log** — JSON-lines, mode `0o600`, di `COS_SECURITY_LOG` atau `<DATA_DIR>/security.log`.
`clean()` memotong string ke 500 karakter, membuang CR/LF, membatasi array 20 elemen dan
object 30 key, kedalaman 3, dan **mengganti key yang cocok
`/password|secret|token|key|cookie|authorization/i` dengan `"[redacted]"`.**

**Enkripsi** — dua kunci terpisah:

| Kunci | Melindungi | Algoritma |
|---|---|---|
| `COS_SECRET_KEY` | AI provider key + password SMTP tersimpan | AES-256-GCM, key = `sha256(COS_SECRET_KEY)` (**tanpa KDF**), format `enc:v1:base64(iv‖tag‖ciphertext)` |
| `COS_BACKUP_KEY` | seluruh file database di backup | AES-256-GCM, KDF `scryptSync(key, salt, 32)` dengan salt acak per backup |

Keduanya minimal 32 karakter. Tanpa `COS_SECRET_KEY`, di luar production nilai disimpan
**plaintext**; di production `encrypt` melempar error.

---

## 19. Testing

```bash
npm test    # node --no-warnings --test tests/*.test.js
```

`node:test` + `node:assert/strict`, tanpa dependency.

Browser test: `npm run e2e` (Playwright, `e2e/*.spec.js`; `E2E_PORT` memilih port server sementaranya). Proyek
`chromium` menjalankan semua spec kecuali `e2e/touch-dropdowns.spec.js`, yang jalan sendiri di proyek `webkit-touch`
(iPhone, iPad) dan `chromium-touch` (Android): dropdown disentuh jari di HP dan tablet. Pasang WebKit sekali dengan
`npx playwright install webkit`. Server sementara itu tidak punya jaringan: oEmbed dan thumbnail Figma, YouTube, Vimeo
dan Loom (untuk pratinjau dan untuk nama tautan) dijawab oleh `e2e/fixtures/link-stub.js`: Figma dari `figma-stub.js`,
yang seperti Figma menolak tautan tanpa www, video dari `video-stub.js` (`COS_LINK_FETCH_STUB` di `e2e/serve.js`; path
di luar `e2e/` diabaikan).

| File | Cakupan |
|---|---|
| `admin-ops.test.js` | konfigurasi SMTP dan alur `safeRestore`, terhadap `server/backup.js` asli di temp dir |
| `audit.test.js` | integritas data end-to-end: db + seed + serialize + analytics |
| `gallery.test.js` | `server/gallery` + `shared/gallery-model` di SQLite `:memory:`; ownership, permission, pagination, penolakan gambar tak aman, prototype key |
| `i18n.test.js` | round-trip EN→ID→EN dan protected content |
| `i18n-conflicts.test.js` | satu English satu Indonesia: build berhenti pada konflik baru; istilah `docs/GLOSSARY-ID.md` |
| `i18n-sweep.test.js` | setiap `tr("…")` di `src/` punya kata Indonesia; kata centang task pribadi dan chip audiens komentar |
| `figma-preview.test.js` | pratinjau Figma tanpa jaringan (fetch di-stub): hanya oEmbed dan thumbnail Figma (host, https, redirect, 5 MB, 10 detik, gambar menurut byte), cache 6 jam / 1 jam / 10 menit, Muat ulang, rate limit, stub e2e hanya dari `e2e/` |
| `link-title.test.js` | nama tautan Google (dari cache) dan oEmbed (fetch di-stub): alamat oEmbed yang benar-benar dikirim untuk Figma tanpa www / http / node-id, Loom, Miro, YouTube, Vimeo; key/id yang salah dan tautan komunitas ditolak sebelum fetch |
| `video-preview.test.js` | pratinjau YouTube, Vimeo, Loom tanpa jaringan: id dari setiap bentuk tautan dan yang ditolak, oEmbed dari id saja, host thumbnail per provider, redirect, octet-stream hanya Loom, privat (403/401/400, 404, Vimeo tanpa thumbnail), cache 7 hari / 1 jam / 10 menit, batas per provider, kolom `duration` untuk tabel lama |
| `report-export.test.js` | PPT card overflow + paginasi; **membuka ZIP hasil dengan local-header reader tulisan tangan** |
| `security.test.js` | postur production (`NODE_ENV=production`, secret di-set) |
| `server-security-integration.test.js` | **spawn server sungguhan** dan cek startup aman, auth, backup |
| `settings-menu.test.js` | `enableHorizontalDrag` tidak menculik klik menu biasa |
| `studio-editor.test.js` | layer meta, stacking, compositor |
| `ui-performance.test.js` | debounce search dan `aiPreviewSoon` |

### Teknik vm-sandbox

File `src/*.js` bukan module — mereka fragment `<script>` di satu global scope.
Test membangun scope itu dengan tangan:

```js
const c = { AIF:{…}, AI_LAYER_HITS:{}, UI_ID:{},
            aiCanvasEditAt(){}, aiTextDragEnd(){}, aiStudioProperties(){}, /* … */ };
vm.createContext(c);
vm.runInContext(effects.slice(effects.indexOf('function aiShapePath'),
                              effects.indexOf('function aiEffectTarget')), c);
vm.runInContext(read('studio-editor.js').replace(/<\/?script>/g,''), c);
// setiap function/var top-level sekarang jadi properti c
```

Stub untuk `aiCanvasEditAt` / `aiTextDragEnd` / `aiStudioProperties` ada semata-mata supaya
assignment wrapper di file yang diuji punya sesuatu untuk disimpan sebagai base.

> **Kerapuhan yang harus diketahui:** slice-nya di-anchor ke teks sumber literal
> (`indexOf('function aiBuildPrompt()')`, `indexOf('const aiResolveRegistryModel')`).
> Mengganti nama atau memindahkan fungsi itu akan diam-diam mengubah apa yang dieksekusi test.

---

## 20. Konvensi kode

**1. String-template HTML builder.** Tidak ada templating library, virtual DOM, atau component model.
Pakai ulang builder bersama daripada menulis markup dari nol.

**2. `esc()` untuk teks, `attr()` untuk nilai atribut.**

```js
function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
                        .replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function attr(s){ return esc(s).replace(/'/g,"&#39;"); }
```

Aturannya mekanis dan tidak bisa ditawar, karena setiap string berakhir dikonkat ke HTML.
Bedanya penting: codebase memakai atribut ber-quote tunggal di dalam string JS ber-quote ganda,
sehingga escape `'` tambahan pada `attr()` adalah yang mencegah attribute breakout.
`xml()` di `export.js` khusus OOXML dan **tidak boleh** dipakai untuk HTML.
Ikon dari `I` dan markup dari builder lain **sudah** HTML dan tidak boleh di-escape lagi.

**3. Jebakan CSS specificity — ini kelas bug yang paling sering muncul di repo ini.**
Empat kejadian didokumentasikan dengan nama di `refinements.css`:

| Selector yang menang | Bobot | Yang kalah | Gejala |
|---|---|---|---|
| `.pref .pl span` | (0,2,1) | `.badge.approved` (0,2,0) | pill status abu-abu di atas warna, tak terbaca |
| `.field label` | (0,1,1) | `.chipx` (0,1,0) | checkbox naik ke atas label ALL-CAPS |
| `.field label` | (0,1,1) | `.report-slide-chip` (0,1,0) | idem |
| `.menu button` | (0,1,1) | `.gear-pos` (0,1,0) | ikon 375px di menu 407px |

> **Pola yang harus ditiru: jangan pernah menambah `!important` untuk menang.**
> Nyatakan ulang selector pada specificity yang setara atau lebih tinggi, dan tinggalkan
> komentar yang menyebut kedua bobot dan gejala visualnya.

**4. Penanda section (`§398`).** 208 kemunculan di 19 file. Bentuknya polos (`§398`),
rentang (`§649-650`), atau ber-subnomor (`§18.3`, `§P1-2`). Mereka merujuk silang ke
`AUDIT.md`, `CHANGELOG-v16.md`, `CHANGELOG-v17.md`.
**`§` di komentar berarti "baris ini ada karena keputusan tercatat tertentu — baca entri itu
sebelum mengubahnya."** Beberapa di antaranya secara eksplisit melarang perubahan.

**5. Tidak ada build step untuk CSS.** `refinements.css` adalah CSS mentah, tanpa preprocessor,
tanpa autoprefixer, tanpa minifier. Konsekuensinya: dia berada paling akhir sehingga menang
seri specificity karena urutan; tidak ada nesting atau variable selain custom property native;
CSS modern (`:has()`, `color-mix()`, `dvh`) dipakai langsung.
**Tetap harus `node build.js` setelah mengedit CSS.**

**5a. CSS yang murah di-restyle (Okt 2026, performance stage 3).** Tiga aturan, dijaga
`tests/css-consolidation.test.js`:
- Keadaan yang bisa ditandai kelas jangan dibaca lewat `:has()`. `:has()` di depan subject
  universal (`> *`), posisi (`:nth-child(2)`) atau tag membuat setiap perubahan DOM di halaman
  (mis. ganti tab di panel tugas di samping List) me-restyle seluruh layar. Yang dipakai sekarang,
  dengan specificity yang sama persis: `.bulk-selected` (dipasang `bulkMark` di `enhance.js` bersama
  centangnya), `table.tbl.lcol-tbl` dan `div.tbl-wrap.lcol-wrap` (dulu `:has(td.tcheck-col)`),
  `.row.task-row.task-row-cells` (dulu `:not(:has(>.meta-grid))`), `div.stage-edit.label-edit`.
- Jangan menulis ulang deklarasi pada selector yang sama di blok belakangan (file yang sama atau
  file berikutnya): ubah yang sudah ada. Deklarasi yang selalu kalah ditolak test.
- Jangan simpan aturan untuk kelas yang tidak lagi digambar kode mana pun.
Setiap perubahan CSS semacam ini diperiksa dengan snapshot computed style (semua elemen, 54 adegan,
1366/390 px, terang/gelap) sebelum dan sesudah: harus identik.

**6. Gaya bahasa.** Rasa ES5 di `src/`: `var` di mana-mana, `function(){}` callback,
tanpa class, tanpa `async`/`await` di client (rantai `.then`/`.catch`).
`const`/`let` dan arrow function hanya di `shared/`, `server/`, dan `tests/`.

**7. Panggilan lintas-file yang defensif.** Kalau kode di file lebih awal butuh sesuatu
yang didefinisikan file belakangan, selalu dijaga:
`if (typeof WorkspaceQuest !== "undefined" && WorkspaceQuest.emit)`.

---

## 21. Resep: cara menambah sesuatu

### Menambah layar baru

1. Tulis `renderMyScreen()` di file `src/` yang sesuai; akhiri dengan
   `document.getElementById("content").innerHTML = h;`
2. Daftarkan di map dispatch `renderScreen()` (`core.js:539`).
3. Kalau layarnya ada di sidebar, tambahkan ke `NAV_ALL` (`core.js:509`) dan beri ikon di `I`.
4. Kalau menerima parameter, tangani `sub` di `go()`.
5. `node build.js`.

### Menambah field pada task

1. Tambahkan kolom ke `db/schema.sql` **dan** ke daftar `ALTER TABLE` di `server/db.js`.
2. Tambahkan ke hidrasi/dehidrasi di `server/serialize.js` dan ke `hTask`/`dTask` di `core.js`.
3. Tambahkan cell renderer di `drawer.js` (object `cell`) dan daftarkan di `taskFields()`.
4. Kalau harus muncul di Grid, tambahkan ke `GRID_FIELDS` dan `cell()` di `tasks.js`.
5. Kalau harus ikut export, tambahkan ke `taskRows()` di `export.js`.
6. Tambahkan validasi di handler `PUT /api/tasks/:id`.

### Menambah capability

1. Tambahkan ke `CAPS` di `server/permissions.js` (`[key, deskripsi]`).
2. Tambahkan ke role default yang relevan di `DEFAULT_ROLES`.
3. Mirror ke `DEMO_CAP_LIST` dan `DEMO_CAPS` di `core.js` supaya standalone konsisten.
4. Tegakkan di handler dengan `forbid(has(u,'my_cap'), "…")`.
5. Kalau perlu menyembunyikan tombol, tambahkan helper `canI.*`.

### Menambah endpoint

```js
route("POST", "/api/things/:id", (u, p, q, b) => {
  forbid(can.something(u), "do the thing");
  // ... validasi b ...
  return { ok: true };
});
```

Ingat: handler `DELETE` selalu menerima body `{}`; registrasi pertama yang cocok menang.

### Menambah step Workspace Quest

1. Sisipkan tuple **9 field** ke `WQ_STEPS` pada posisi yang tepat.
2. Pastikan target punya atribut `data-tour`.
3. **Hitung ulang XP** supaya total tetap 100.
4. Render kartu step itu sungguhan untuk memastikan tidak melempar error —
   memeriksa metadata saja tidak cukup.

---

## 22. Known issues & jebakan

Temuan berikut berasal dari pembacaan kode langsung. Didaftarkan supaya tidak jadi kejutan.

### Perbedaan antara UI dan perilaku sebenarnya

| Hal | Kenyataan |
|---|---|
| Halaman **Automatic Backups** | **Diperbaiki v29.** Scheduler membaca pilihan dashboard; `COS_BACKUP_INTERVAL_HOURS` menjadi override yang ditampilkan di UI. |
| Kuota harian AI Gallery | Teks bantuan mengatakan "Resets at midnight in the member's own time zone", tapi `agToday()` memakai `toISOString()` = **UTC**. |
| Kuota AI Gallery secara umum | Ditegakkan **client-side saja** (`localStorage`). `server/gallery.js` memanggil `model.normalise(b)` tanpa argumen policy, jadi di server hanya berlaku plafon keras 500 layer. |
| Backup terjadwal | **Diperbaiki v29.** Tercatat `kind:"scheduled"`, memakai retensi dashboard, dan mengisi `lastAutoAt`. |
| Tab **Theme & appearance** | Tidak ada gate `canI.*` di client. Non-admin melihat kontrol yang berfungsi, lalu mendapat toast gagal karena server menolak. |
| Tombol deaktivasi anggota | **Diperbaiki v29.** Tombol Deactivate/Reactivate ada di Settings → Members. |

### Capability yang tidak ditegakkan

- ~~`use_ai_hub` tidak dicek di server~~ — sudah dicek (`forbid(can.useAIHub(u))`) sejak v18+.
- `GET /api/ai/gallery` (list) tidak memanggil `model.canView` — setiap user yang login bisa melihat daftar.
- Route saved-view: v29 menambahkan validasi dan cek kepemilikan (view hanya bisa ditulis pemiliknya).
- ~~`POST /api/mail/test` tidak punya `forbid`~~ — diperbaiki v29 (admin saja).

### Dead code

- `aiIsLegacyOverLimit()` dan flag `legacy:true` dari `aiCanAddLayers()` tidak punya pemanggil.
- Layar `requests`: `go()` menerima `screen==="requests"`, tapi map `renderScreen()` tidak punya
  entri itu sehingga jatuh ke dashboard. Request adalah task biasa bertag `request`.

### Yang memang tidak ada

- Tidak ada tab Settings untuk **priorities** — `PRIOS` hard-coded di `core.js:16`.
- Tidak ada **warna tag** — sengaja dihapus. Label punya warna, tag tidak.
- Tidak ada alur **undangan email**. Onboarding lewat `Add member` + password sementara,
  atau self-registration dengan join code.
- Field `Off-server copy` di halaman Storage hanya catatan teks — tidak menyalin apa pun.

### Jebakan operasional yang paling penting

> Checksum backup dihitung atas **ciphertext**. Kalau `COS_BACKUP_KEY` diganti setelah ada backup,
> file lama tetap terdaftar dan checksum-nya tetap **verified** — tapi `decryptFile` akan gagal
> pada auth tag saat restore. **Verifikasi yang lolos bukan bukti bahwa backup bisa didekripsi.**
> Karena itu restore harus benar-benar diuji secara berkala di environment test.

---

*Dokumen ini dihasilkan dari pembacaan kode pada versi 1.6.0 dan diperbarui untuk 1.7.0 (v29–v30). Kalau ada yang berbeda dengan kode, kodenya yang benar — perbarui dokumen ini lalu jalankan `python3 docs/build-docs.py`.*

## Responsive layer (`src/responsive.css`)

All phone, tablet and wide-desktop layout rules live in **one file**, `src/responsive.css`, which `build.js` appends **after** `v18.css`, so it wins ties on specificity.

- **Breakpoints:** ≤ 380/480 px small phones · ≤ 760 px phones · 761–980 px tablets (phone tab bar on) · ≥ 981 px desktop · ≥ 1181/1281 px wide desktop. The topbar's nav shows its words from 1,200 px and the account's name and the wide search from 1,340 px (`head.html`): below those they pushed the page sideways in English.
- **Tasks page header (Oct 2026):** the phone header (title with a round New task, then the views and a round Select, then the toolbar) is for **≤ 599 px** only; the task toolbars (`.toolbar[data-tour="task-filters"]`, `.task-filter-toolbar`) keep their phone sizes up to 599 px too. From 600 px the Tasks page is **two rows at every width**: row 1 is `.task-pagehead .actions` (Select, the views, Excel, New task), row 2 the toolbar, and neither wraps. 600–980 px (`responsive.css` "Tasks page header", `v38.css` "From 600 px"): the views' switcher shrinks and would scroll in its own track; below 828 px the views other than the chosen one show only their icon (`.view-label`; every view has `aria-label` and `title`) and the pills show an icon for their name; the toolbar's sort group takes `flex:1 1 0; max-width:max-content`, so it gives up width (its pills truncate) instead of wrapping; controls are 36 px (also from 981 px on a touch screen, `pointer:coarse`). A project's and the Calendar's own header stay phone-style up to 760 px. Checked by `e2e/task-toolbar-rows.spec.js` (13 widths × EN/ID × light/dark × 5 views).
- **Calendar controls (Oct 2026):** the month's row (`.cal-row`, `calendar()` in `tasks.js`: the Tasks page's Calendar view, the Calendar page, a project) is one line wherever it is shown — on the Tasks page it is row 2 from 600 px (the phone's two-line `.calendar-mobile-controls` is for ≤ 599 px there), elsewhere from 761 px. Previous / title / next / Today take `flex:1 1 0`, so they never push the period onto a new line; short of room things give way one at a time (`responsive.css` "Calendar controls", each still named by `aria-label`/`title`): Show labels and the "N checked" chip's word below 1366 px, the legend moves under the calendar (`.cal-legend-foot`) below 1281 px, the short title (`.cal-t-short`: "Okt 2026", "Okt 19–25", "Jum, Okt 23") below 1100 px on the Tasks page and 828 px elsewhere, 36 px controls up to 980 px, whose tasks' icons below 828 px (`segRadio` options with an icon), Show labels left out ≤ 760 px, the period's letters (`segRadio(…, short)`, `data-short`) below 700 px, and with the "N checked" chip the letters up to 980 px. Active filters' chips are a line of their own under it. A team's calendar on a phone has its own bar (`calendarMobileControls({noFilter})`: month, previous/next, Today, period; no filters, saved views or whose tasks). Checked by `e2e/task-toolbar-rows.spec.js` and `e2e/calendar-mode-track.spec.js`.
- **Utilities:** `.mobile-only` (shown ≤ 760 px), `.desktop-only` (hidden ≤ 760 px), `.m-head` + `.m-primary` + `.m-icon` for the shared phone page header (title left, round primary action top-right).
- **Rule of thumb:** edit the existing rule for a selector instead of appending a new override block at the end — that stacking is what this file replaced (v29–v36). If an override is genuinely needed, add it next to the rule it overrides.
- **Verifying a CSS refactor:** capture computed styles for every element on every screen before and after (Playwright, 390/820/1440 px + dark) and diff them; the v37 consolidation was accepted only with zero differences outside live timestamps.
- **A menu that hangs below its control** (Sort and Group, `pillSel` in `tasks.js`; a project's status) is drawn inside the toolbar, so no box between it and `#content` may scroll or clip (`overflow` other than `visible`): from 561 to 760 px the task toolbar used to scroll sideways and cut both menus off at its 44 px height, so on an iPhone on its side, a small tablet or a foldable a tap opened nothing visible (fixed Oct 2026: up to 599 px the row wraps, from 600 px it is the tablet's one row, which shrinks its pills and never scrolls; a toolbar that must not wrap gives up width, it never becomes a scroll box). `pillSelPlace` opens the menu down, or up when there is more room above, never under the tab bar (`#tabbar`) or past the screen, as tall as the room (it scrolls inside); a redraw of the same screen (a colleague's change arriving live) keeps an open menu open (the `renderScreen` wrapper after the pill code). `e2e/touch-dropdowns.spec.js` taps every choice on eight phones and tablets in WebKit and Chromium (projects `webkit-touch` and `chromium-touch` in `playwright.config.js`, only that spec; `npx playwright install webkit` once).

## Indonesian terminology & colour accessibility (v39)

- **"Task", not "tugas".** Indonesian UI text is normalised by `idTerms()` (core.js) at every exit point — `tr()`, `localizeVisibleText()` (via `_idt()` in i18n.js), dynamic count text, the tutorial (`wqL`) and AI replies (`L()` in ai.js). User-authored content is never touched. Since October 2026 the dictionary itself says "task" and "project" (and follows `docs/GLOSSARY-ID.md` throughout), so `idTerms()` is only a safety net; `tests/i18n-conflicts.test.js` fails if "tugas" or "proyek" come back.
- **Dark theme accent.** `applyTheme()` lightens a dark accent in dark mode (`mixHex`, ~42 % towards white) and picks the text-on-accent colour by real WCAG contrast (`inkByContrast`). Text on the accent must use `var(--color-primary-ink)`, never a hard-coded `#fff`.
- **The accent as text where something is chosen** (Oct 2026) uses `var(--color-primary-text)`, not `var(--color-primary)`: a picker's chosen names and their ✓ (`.ep-row.chosen`, `.ep-check`: projects, assignees, reviewers), the kind of work dropdown's chosen row and its Auto/Mixed mark, the pill-selects' menu (chosen and hovered option), the availability menu's current state. The token is the primary itself in light (computed styles identical) and `color-mix(in srgb, primary 60%, #fff)` in dark, where the dark primary on its soft highlight was only 4.6–4.8:1 (3.1:1 with the Ink accent); now 7.2–10:1 with the workspace accent and at least 6.3:1 with every preset accent. Icons alone (the gear menu's panel position, the tag picker's ✓, checkboxes) keep the primary: they need 3:1 and have at least 3.2:1. `e2e/dark-selected-contrast.spec.js` measures it.
- **Status colours as text** use text-safe shades defined in the *Accessibility* section at the end of `src/responsive.css`; the `--color-success/warning/danger` tokens remain for fills, bars and charts.
- Verified: 0 text styles below WCAG AA in light and dark on Home, Tasks (Kanban/List), Calendar, Project, Teams, Analytics, Messages, Notifications and the task drawer.
