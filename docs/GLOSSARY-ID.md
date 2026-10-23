# Glosarium Bahasa Indonesia · Indonesian glossary

The standard Indonesian words for ZenCrevia's interface (October 2026). Every Indonesian string follows it: the
`UI_ID` blocks in `src/`, the Indonesian halves written in code (the Workspace Quest, AI Intelligence's local answers,
the notification texts in `src/core.js` and `server/server.js`), and `docs/USER-MANUAL.md`.

**The owner's decision:** *task* and *project* are the standard terms and stay English in Indonesian text, as the main
menu shows them ("Task saya", "Project"). The rest were picked from what the app used most, and where it was split,
from the main navigation and the Settings headings.

**The owner's review (23 October 2026):** the interface addresses the reader as **Anda**, never *kamu* or *-mu* (see
"Addressing the reader" below), and *reviewer* / *review* / *di-review* stay as they are.

`node build.js` stops when two blocks give one English text different Indonesian words (see "Adding a string" at the
end), `tests/i18n-conflicts.test.js` fails when a word this glossary replaced comes back, and
`tests/i18n-address.test.js` fails when *kamu* or a *-mu* form comes back, in the dictionary or in the Indonesian written
in code.

## Work

| English | Indonesian | Notes |
|---|---|---|
| task, tasks | **task** | Never *tugas*. "Task saya", "Task baru", "Buat task", "3 task". |
| project, projects | **project** | Never *proyek*. "Cari project…", "Pilih project nanti", "Belum masuk project mana pun". |
| subtask | subtask | |
| assign, assigned to | tugaskan, ditugaskan kepada | The verbs stay Indonesian; only the noun *tugas* went. |
| assignee | **penanggung jawab** | Never *assignee* in Indonesian text. |
| reviewer | **reviewer** | Never *peninjau*. Confirmed by the owner (23 October 2026). |
| review (noun) | **review** | "Review & bonus", "Menunggu review". Never *peninjauan / tinjauan*. |
| to review, reviewed | **me-review, di-review** | "Perlu di-review", "Sedang di-review". Never *meninjau / ditinjau / direview*. |
| in review | dalam review | The status and its cards ("Dalam review"), which a narrow card would break at a hyphen. |
| submit for review | kirim untuk review | The button and every sentence that names it. |
| requester | requester | |
| approve, approved, approver | setujui, disetujui, approver | |
| due, due date | **tenggat** | Never *jatuh tempo*. "Tenggat hari ini", "Tenggat sudah dekat", "task yang tenggatnya dalam 4 minggu". |
| overdue | terlambat | |
| start date | tanggal mulai | |
| open (a task, work) | **belum selesai** | "Task belum selesai", "3 belum selesai". An open dependency stays *dependensi terbuka*. |
| closed, done | selesai | |
| blocked, blocking | **terblokir, memblokir** | "Terblokir" is the filter; "TERBLOKIR OLEH" / "MEMBLOKIR" in the task panel. |
| milestone | **milestone** | Never *target tahapan*. |
| label, tag, brief | label, tag, brief | "Template brief", "Brief visual". |
| deliverable | deliverable | Never *hasil akhir*. |
| copy (the brief field), disclaimer | copy, disclaimer | Industry words, as the team writes them. |
| asset | aset | "Aset brand", "Aset task". |
| file | **file** | Never *berkas*. |
| link | **tautan** | Google's own option keeps Google's wording: "Siapa saja yang memiliki link". |
| version | versi | |
| upload, download | unggah, unduh | |
| preview | pratinjau | |
| comment | komentar | |
| mention (noun), to mention | mention, sebut / menyebut | "Mention belum dibaca", "Ketik @ untuk menyebut seseorang". |
| message, chat | pesan, chat | The top-bar button keeps its name, *Messages*. |
| estimate | estimasi | Never *perkiraan*. |
| kind of work | jenis pekerjaan | |
| scope | **cakupan** | Never *lingkup* (one word for the factor, the report and the estimate's baseline). |
| drag | **seret** | Never *tarik* (which stays for *ditarik kembali*, taken back). |
| generate, generation (AI) | generate, hasil generate | "Riwayat generate", "Generate lagi". Never *generasi*. |
| gallery | galeri | *AI Gallery* and *Gallery*, the feature, keep their name. |

## Workspace, people and settings

| English | Indonesian | Notes |
|---|---|---|
| workspace | **workspace** | Never *ruang kerja*. |
| team | tim | |
| member, members | anggota | The Settings tab is *Anggota*. |
| people, person | orang | |
| role, permission, access | **peran**, izin, akses | "Peran & izin", "Peran Anda…". Never *role* in Indonesian text. |
| Creative Lead, Team Lead | Creative Lead, Team Lead | The roles' names stay. Admin = Admin, Member = Anggota, Viewer = Pengamat. |
| lead, team lead (of a team) | lead, lead tim | "team lead" written small is a team's own lead: *lead tim*. |
| brand | **brand** | Never *merek*. "Pustaka brand", "Font brand", "Karakter brand". |
| template | **template** | Never *templat*. |
| settings | **pengaturan** | Never *setelan*. |
| custom | **kustom** | "Kolom kustom", "Gaya kustom". *Khusus* stays only for "dedicated" / "specific". |
| default | **bawaan** | "Bawaan workspace", "Fleksibel (bawaan)". |
| layout | tata letak | |
| backup | **cadangan** | As the Settings heading, *Cadangan & data*. `docs/ADMIN-OPS.md` quotes the English labels and the server's names (`npm run backup`, `COS_BACKUP_*`), so *backup* stays there. |
| password | **password** | Never *kata sandi*. |
| email | email | Never *e-mail*. |
| draft | draft | Never *draf*. |
| Home | Beranda | |
| dashboard | dashboard | Never *dasbor*. |
| Board, List, Grid, Calendar, Timeline, Kanban | Papan, Daftar, Tabel, Kalender, Linimasa, Kanban | The task views, and every sentence that names them. |
| My space | Ruang saya | |
| you, your | **Anda** | Always with a capital A. Never *kamu*, *-mu* or *dirimu* (see "Addressing the reader"). Menus that speak for the reader keep *saya*: "Task saya", "Profil saya". |

## Names that stay as they are

ZenCrevia, **AI Hub**, **AI Gallery**, **Smart Scoring** and its modules **Effort Hours**, **Story Points** and
**Weighted Points** (after a number, their units: "5 story point", "3 weighted point"), **Knowledge**, **Messages**,
KPI, OKR. *AI Intelligence* is shown as **Asisten AI**, as the interface already did.

**Brand Mode → "Mode Brand".** It is the label under the workspace's name, not a product like AI Hub, so it is
translated like the other labels: Indonesian word order (*mode* first, as in *mode gelap*, *mode demo*), with
*brand*, the glossary's word, which also gives "Pustaka brand", "Font brand" and "Karakter brand". The earlier
blocks said both "Mode Brand" and "Mode merek".

## Writing rules

- **An Indonesian affix on an English word takes a hyphen:** *task-nya*, *project-nya*, *file-nya*, *di-review*,
  *me-review*. Indonesian words take it without: *pengaturannya*, *perannya*.
- **No reduplication** of an English word for a plural: "semua task", "3 project", never *task-task*.
- **Capitals** only where a sentence or a title begins ("Task belum selesai", "Project aktif"), for names
  ("Mode Brand", "Smart Scoring", "Team Lead"), and for **Anda**, which is always written with a capital A, also
  mid-sentence ("Item itu tidak tersedia untuk Anda").
- **Never change the English.** It is the key `tr()` looks up.

## Addressing the reader

The interface speaks to the reader as **Anda** (the owner's decision, 23 October 2026). *Anda* is a separate word, so
the suffix *-mu* becomes "… Anda" after the word it was on, with or without the hyphen:

| Was | Now |
|---|---|
| kamu bisa, Kamu tidak punya izin | Anda bisa, Anda tidak punya izin |
| task-mu, review-mu, workspace-mu, Gallery-mu | task Anda, review Anda, workspace Anda, Gallery Anda |
| akunmu, peranmu, Peranmu, perubahanmu | akun Anda, peran Anda, Peran Anda, perubahan Anda |
| milikmu, untukmu, kepadamu, darimu, olehmu | milik Anda, untuk Anda, kepada Anda, dari Anda, oleh Anda |
| menyebutmu, membalasmu, memintamu, mengirimimu | menyebut Anda, membalas Anda, meminta Anda, mengirimi Anda |
| dirimu sendiri | diri Anda sendiri |
| perlu kamu review, yang kamu pilih | perlu Anda review, yang Anda pilih |

- **Keep the sentence readable.** When *Anda* would follow a noun it does not belong to, add the comma the sentence
  needs: "Per percakapan, Anda tetap bisa memilih…", "Saat kuota penuh, Anda masih bisa…" (without it, "percakapan
  Anda" reads as *your conversation*). A bare verb after *sampai* takes its prefix: "sampai Anda memilih Pakai ini".
  A person takes *kepada*: "dipindahkan kepada Anda".
- **"Task saya" stays.** *Saya* is the reader speaking about their own things (menus and filters such as "Task saya",
  "Project saya", "Profil saya", "Ingatkan saya", "Hanya saya"), not the app addressing them.
- **Not the reader:** the words the AI uses to recognise an Indonesian question (`src/ai.js`, `server/server.js`: *kamu*,
  *anda*, … as people type them) and the copy of a sample poster (an advert's own voice) keep their words. The legal
  pages (`LEGAL/public/`) already use *Anda*.

## Adding a string

1. Write the Indonesian with this glossary's words.
2. If the English is already in another block, use its words exactly — `node build.js --i18n-conflicts` shows every
   wording a text has. A text that has two stops the build:

   ```
   build.js: 1 English text has different Indonesian words in the UI_ID blocks, …
     "Search projects…"
         src/messages.js: "Cari proyek…"
         src/i18n.js: "Cari project…"
   Fix: give the English text the same Indonesian words in every block that has it (docs/GLOSSARY-ID.md has the
   standard terms), or keep it in one block only. Never change the English: it is the key.
   ```
3. A block may repeat a key another file already has, with the same words, when its module is loaded on its own (a
   test); within one file the key is needed only once.
