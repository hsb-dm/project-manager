# ZenCrevia v36 — Pre-launch audit

Version 1.14.0. Builds on v35. No schema change.
This audit deployed the v35 ZIP exactly as an operator would — unzip, copy `.env.example`,
start — then upgraded a v28 database, restored backups, sent real SMTP mail, simulated 30 people,
and stopped the server the way systemd does.

## Findings and fixes

| # | Finding | Fix |
|---|---|---|
| 1 | **Copying `.env.example` unchanged started a live production server** whose admin password was the public placeholder `replace-with-a-strong-password`, with placeholder encryption keys, and with reset links pointing at `example.com`. An empty `COS_SECRET_KEY` or a 3-character admin password also started fine. | `server/preflight.js`: in production the server exits (code 78, reasons listed) on placeholder/short/missing `COS_SECRET_KEY`, placeholder or reused `COS_BACKUP_KEY`, placeholder or < 12-char admin password or placeholder admin email on first start, placeholder `APP_URL` / `COS_ALLOWED_ORIGINS` / invite code. Warnings for: no backup key, email still `log`, https without `COS_TRUST_PROXY=1` (everyone would share one IP for rate limits), no `TZ`, placeholder `MAIL_FROM`. |
| 2 | **SMTP password could go out unencrypted.** If the mail server did not offer STARTTLS — or an attacker on the path stripped it — `AUTH` was sent in clear text. | Refused before `AUTH` unless implicit TLS, STARTTLS, a localhost relay, or `COS_SMTP_ALLOW_PLAINTEXT_AUTH=1`. Same rule in "Test connection". Verified with a mail server that hides STARTTLS: no `AUTH` sent, reason logged. |
| 3 | **Restore left an unencrypted copy of the old database** (`creative-os.db.before-restore-*`, world-readable) that was never removed. | Deleted after a successful restore — the encrypted safety backup already holds it. |
| 4 | **Data files were world-readable** (0644 database, logs, backups, outbox). | Data directory 0700, database files 0600, and the process runs with umask 077 (production, POSIX). `busy_timeout` 5 s so a backup and a write wait instead of failing. |
| 5 | **Morning sign-in burst**: 30 people opening the app at once with 3,000 tasks — p95 5.1 s. | The shared task list is cached until any task-affecting write or the hour changes: p95 **2.1 s**. Normal use under the same 30-user load: reads p95 11–30 ms, writes 14–19 ms, chat 11 ms. |
| 6 | **No graceful shutdown**: a deploy/restart killed requests mid-flight and left the WAL unmerged. | SIGTERM/SIGINT stop accepting, end streams, finish in-flight requests (≤ 8 s), checkpoint and close the database. Measured: 2.8 s with an open live stream; 13 MB WAL folded in. |
| 7 | **Health check said "ok" without touching the database.** | `/api/health` runs a query; 503 on database failure or while shutting down. |

## Verified and fine

- **Upgrade from v28**: a v28 database (72 tasks, 9 people, a v28 backup) opened by v36 — data intact,
  new columns/tables/indexes added, stage-rule defaults applied, the v28 backup still listed.
- **Restore**: restoring that v28 backup into the running v36 server succeeded, made an encrypted
  safety backup first, migrated the restored database on open, reverted a later edit, sign-in worked.
- **Real SMTP delivery**: forgot-password sent through SMTP (`EHLO → AUTH → MAIL → RCPT → DATA`),
  the email contained the correct `APP_URL/?reset=…` link.
- Security headers (HSTS, CSP, frame, referrer, permissions) in production; `/api/health` exposes
  nothing but `ok`.
- All earlier protections re-run: stage rules, comment/approval integrity, concurrent merge,
  reopen gate, authorization probes, XSS, zero 500s.

## Added for go-live

- `deploy/GO-LIVE.md` — the 13-step checklist.
- `deploy/Caddyfile` — HTTPS reverse proxy with streaming for the live board/chat.
- `deploy/zencrevia.service` — systemd unit (restart on failure but not on preflight exit 78,
  sandboxing, UMask 0077, TZ Asia/Jakarta).

## Verification

- `npm test`: **150/150**. New `tests/v36-preflight.test.js`: `.env.example` refused with every
  placeholder named; good config clean; weak values caught; the real server exits 78 before
  listening; the cached task list reflects edits and moves immediately.
- Chromium: 13 screens × admin/member × desktop/mobile, no errors or overflow; axe light/dark and
  Messages 0 violations; XSS inert.

## Not tested here

Caddy itself (not installable in this sandbox), a real mail provider's TLS certificate, Google
Drive OAuth, AI providers, and restore on Windows.
