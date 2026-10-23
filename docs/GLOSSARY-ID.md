# Glosarium Bahasa Indonesia · Indonesian glossary

The standard Indonesian words for ZenCrevia's interface (October 2026). Every Indonesian string follows it: the
`UI_ID` blocks in `src/`, the Indonesian halves written in code (the Workspace Quest, AI Intelligence's local answers,
the notification texts in `src/core.js` and `server/server.js`), and `docs/USER-MANUAL.md`.

**Confirmed by the owner (23 Oct 2026):** *reviewer* (never *peninjau*) and the reader as *kamu / -mu* (never *Anda*).
"Anda" was tried for an hour the same day and taken back; do not switch it again without asking.

**The owner's decision:** *task* and *project* are the standard terms and stay English in Indonesian text, as the main
menu shows them ("Task saya", "Project"). The rest were picked from what the app used most, and where it was split,
from the main navigation and the Settings headings.

`node build.js` stops when two blocks give one English text different Indonesian words (see "Adding a string" at the
end), and `tests/i18n-conflicts.test.js` fails when a word this glossary replaced comes back.

## Work

| English | Indonesian | Notes |
|---|---|---|
| task, tasks | **task** | Never *tugas*. "Task saya", "Task baru", "Buat task", "3 task". |
| project, projects | **project** | Never *proyek*. "Cari project…", "Pilih project nanti", "Belum masuk project mana pun". |
| subtask | subtask | |
| assign, assigned to | tugaskan, ditugaskan kepada | The verbs stay Indonesian; only the noun *tugas* went. |
| assignee | **penanggung jawab** | Never *assignee* in Indonesian text. |
| reviewer | **reviewer** | Never *peninjau*. |
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
| role, permission, access | **peran**, izin, akses | "Peran & izin", "Peranmu…". Never *role* in Indonesian text. |
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
| you, your | **kamu, -mu** | Never *Anda*. Menus that speak for the reader keep *saya*: "Task saya", "Profil saya". |

## Names that stay as they are

ZenCrevia, **AI Hub**, **AI Gallery**, **Smart Scoring** and its modules **Effort Hours**, **Story Points** and
**Weighted Points** (after a number, their units: "5 story point", "3 weighted point"), **Knowledge**, **Messages**,
KPI, OKR. *AI Intelligence* is shown as **Asisten AI**, as the interface already did.

**Brand Mode → "Mode Brand".** It is the label under the workspace's name, not a product like AI Hub, so it is
translated like the other labels: Indonesian word order (*mode* first, as in *mode gelap*, *mode demo*), with
*brand*, the glossary's word, which also gives "Pustaka brand", "Font brand" and "Karakter brand". The earlier
blocks said both "Mode Brand" and "Mode merek".

## Writing rules

- **An Indonesian affix on an English word takes a hyphen:** *task-nya*, *project-nya*, *file-nya*, *task-mu*,
  *review-mu*, *di-review*, *me-review*. Indonesian words take it without: *pengaturannya*, *perannya*, *peranmu*.
- **No reduplication** of an English word for a plural: "semua task", "3 project", never *task-task*.
- **Capitals** only where a sentence or a title begins ("Task belum selesai", "Project aktif") and for names
  ("Mode Brand", "Smart Scoring", "Team Lead").
- **Never change the English.** It is the key `tr()` looks up.

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
