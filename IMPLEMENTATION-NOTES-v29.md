# ZenCrevia v29 — Production readiness

Scope: the findings of the v28 readiness audit (22 Sep 2026) plus the new notification sound.
Version 1.7.0. No database schema change; existing `data/` folders keep working.

## Notification sound

- The supplied `Notification_ZenCrevia_compressed.mp3` was an MPEG-1 *program stream*
  (a 1024×1024 video track plus MP2 audio) with an `.mp3` name. Browsers do not reliably
  play that in `<audio>`. It was converted to a real audio-only MP3: mono, 44.1 kHz,
  64 kbps, 0.84 s, **6.9 KB** (the v28 chime was 940 KB). Loudness is unchanged
  (mean −20 dB, peak −2 dB).
- The server's Content-Security-Policy had no `media-src`, so `default-src 'self'` blocked
  the inlined `data:audio/mpeg` chime in the served app. **The notification sound never
  played on the server build before v29.** `media-src 'self' data: blob:` is now allowed.
  Verified in Chromium: the chime plays and decodes (0.81 s, 1 channel) under the live CSP.

## Installation

- Production (`NODE_ENV=production`) now creates a **clean workspace** on an empty
  database: one admin (`COS_ADMIN_EMAIL`, `COS_ADMIN_NAME`, `COS_ADMIN_PASSWORD`), system
  roles, workflow stages, brief templates, custom fields, tags and a `General` Knowledge
  folder. No demo people, projects, tasks, assets or history.
- `COS_SEED_DEMO=1` loads the demo workspace (still the default in development).
- The demo admin is now named from `COS_ADMIN_NAME` (default `Admin`), so the dashboard no
  longer greets "Good morning, Workspace".

## Performance

- The app shell is served with brotli (gzip fallback), a strong ETag and
  `Cache-Control: no-cache`; repeat visits return **304**. Large JSON responses are gzipped.
- Wire size of the shell: **~460 KB** (v28: 3.1 MB uncompressed, re-downloaded on every
  visit). Uncompressed shell: 1.85 MB (v28: 3.06 MB) — the new chime accounts for ~1.25 MB.
- Static files are served only from `public/` and `shared/`.

## Data safety

- Automatic backups now follow **Settings → Backup & Data → Automatic Backups**. The
  scheduler checks every 10 minutes and measures "due" from the last automatic backup, so
  restarts do not reset the cadence. Scheduled backups are recorded as `scheduled`, use the
  dashboard retention, and fill in "Last automatic backup".
- `COS_BACKUP_INTERVAL_HOURS` is an operator override; the dashboard shows it as
  "set by server" and disables the selector instead of silently ignoring it.

## Security and validation

- Saved views: validated body; a view can only be written by its owner. (v28 let any
  member overwrite another member's view by id — found during this pass.)
- `PUT /api/members/:id` merges a partial body over the stored record instead of crashing;
  role, teams, capacity and active state remain admin-only. `POST /api/members` validates
  name, email and duplicates.
- Any remaining "missing field" error that reaches SQLite returns **400**, not 500.
- `POST /api/notifications` (which sends real email): known kinds only, target must be an
  existing task/project/request, ≤ 25 recipients, ≤ 60 notifications per sender per minute,
  no free text.
- `POST /api/mail/test` is admin-only and returns only the outbox file name.
- Link previews: the resolved address is re-checked **at connect time** (DNS-rebinding
  guard); IPv4-mapped IPv6, NAT64, benchmark and multicast ranges are also refused.
- The Viewer role description no longer says "Read-only": viewers can submit requests,
  which create backlog tasks. Existing databases are migrated on start.

## UI/UX

- Members: **Deactivate / Reactivate** control (blocks sign-in, ends sessions, keeps work).
- First run shows one modal (Workspace Quest). The task-panel picker no longer appears
  first (default Right; change it in Settings → Layout). Skipping needs no second confirm.
- Phones: the Messages/AI floating buttons hide on the screen they duplicate, tuck away while
  scrolling down, return on scroll up, and content reserves space beneath them.
- Phones: the month calendar shows coloured bars per item instead of truncated titles;
  tapping a day opens that day's full agenda.
- Phones: Settings card footers are no longer sticky, so only one Save is visible per card.
- Projects: empty state with a New project action for clean workspaces.
- The test-email button is shown only to workspace admins.

## Verification

- `npm test`: **125/125** (v28: 116). New behavioural suites spawn a real production server:
  `tests/v29-readiness.test.js` (clean install, compression/ETag/304, sound file format,
  authorization/validation, backup schedule) and `tests/v29-link-preview-guard.test.js`
  (live socket blocked for a loopback-resolving host).
- Security probes re-run: path traversal, CSRF, login rate limit, cross-user edits, backup
  access, role escalation — all blocked; zero 500s in the security log.
- Chromium at 1440×900 and 390×844, demo and clean workspaces, 13 screens each: no JS
  errors, no horizontal overflow; XSS payloads in chat and task fields render inert.

## Not verified here

Real SMTP delivery, Google Drive OAuth, AI providers, Windows restore, concurrent load,
screen-reader accessibility, and link previews against the public internet (the build
sandbox has no direct egress).
