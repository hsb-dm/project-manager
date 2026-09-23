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

Keduanya **byte-identical**. Yang membedakan perilaku adalah runtime, bukan build:
`API.on === true` ketika `GET /api/auth/session` berhasil, `false` kalau gagal.

Stack:

- **Frontend** — vanilla JS, tanpa framework, tanpa bundler, tanpa ESM. Semua file di `src/`
  adalah *fragment* `<script>…</script>` yang digabung jadi satu file besar dengan satu global scope.
- **Backend** — Node.js murni (`node:http`, `node:sqlite`, `node:crypto`, `node:net`, `node:tls`).
  Tidak ada Express, tidak ada ORM, tidak ada nodemailer. SMTP ditulis tangan.
- **Database** — SQLite lewat `node:sqlite` `DatabaseSync`, WAL mode, foreign keys ON.

### Peta direktori

```
build.js                  concatenator: src/* -> public/index.html + dist/*.html
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
| `tasks.js` | 5 view task, filter bar, kanban, table, grid, calendar, timeline |
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
  `appScrollEl()` / `appScrollTop()`.

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

### Cara menambah string

1. Bungkus literal English dengan `tr("…")` di titik pakai (`esc(tr(...))` untuk teks,
   `attr(tr(...))` untuk atribut).
2. Tambahkan `"English": "Indonesia"` ke salah satu blok `Object.assign(UI_ID, {…})` di `src/i18n.js`.
3. Kalau string itu konten user yang **tidak boleh** diterjemahkan, beri `data-no-translate`.
4. `node build.js`.

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
Ada guard path traversal. **Static tidak butuh autentikasi.**

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

Policy: ≥ 12 karakter, ≤ 256, dan minimal **tiga** dari empat kelas
`[a-z]`, `[A-Z]`, `\d`, `[^A-Za-z0-9]`.

### Session

Token = `randomBytes(32).toString("hex")` dikirim ke browser; **id yang disimpan** adalah
`"sha256:" + sha256(token)`. `readSession` menerima bentuk hashed **atau** raw
(jalur kompatibilitas untuk row lama).

Cookie `cos_session`: `Path=/; HttpOnly; SameSite=Lax`, plus `Secure` bila
`COS_SECURE_COOKIE=1` atau `NODE_ENV=production`. TTL `COS_SESSION_HOURS` (default 12, minimal 1).

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
```

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

| File | Cakupan |
|---|---|
| `admin-ops.test.js` | konfigurasi SMTP dan alur `safeRestore`, terhadap `server/backup.js` asli di temp dir |
| `audit.test.js` | integritas data end-to-end: db + seed + serialize + analytics |
| `gallery.test.js` | `server/gallery` + `shared/gallery-model` di SQLite `:memory:`; ownership, permission, pagination, penolakan gambar tak aman, prototype key |
| `i18n.test.js` | round-trip EN→ID→EN dan protected content |
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

- **Breakpoints:** ≤ 380/480 px small phones · ≤ 760 px phones · 761–980 px tablets (phone tab bar on) · ≥ 981 px desktop · ≥ 1181/1281 px wide desktop.
- **Utilities:** `.mobile-only` (shown ≤ 760 px), `.desktop-only` (hidden ≤ 760 px), `.m-head` + `.m-primary` + `.m-icon` for the shared phone page header (title left, round primary action top-right).
- **Rule of thumb:** edit the existing rule for a selector instead of appending a new override block at the end — that stacking is what this file replaced (v29–v36). If an override is genuinely needed, add it next to the rule it overrides.
- **Verifying a CSS refactor:** capture computed styles for every element on every screen before and after (Playwright, 390/820/1440 px + dark) and diff them; the v37 consolidation was accepted only with zero differences outside live timestamps.

## Indonesian terminology & colour accessibility (v39)

- **"Task", not "tugas".** Indonesian UI text is normalised by `idTerms()` (core.js) at every exit point — `tr()`, `localizeVisibleText()` (via `_idt()` in i18n.js), dynamic count text, the tutorial (`wqL`) and AI replies (`L()` in ai.js). Dictionary entries may still say "tugas"; they render as "Task/task". User-authored content is never touched.
- **Dark theme accent.** `applyTheme()` lightens a dark accent in dark mode (`mixHex`, ~42 % towards white) and picks the text-on-accent colour by real WCAG contrast (`inkByContrast`). Text on the accent must use `var(--color-primary-ink)`, never a hard-coded `#fff`.
- **Status colours as text** use text-safe shades defined in the *Accessibility* section at the end of `src/responsive.css`; the `--color-success/warning/danger` tokens remain for fills, bars and charts.
- Verified: 0 text styles below WCAG AA in light and dark on Home, Tasks (Kanban/List), Calendar, Project, Teams, Analytics, Messages, Notifications and the task drawer.
