# ZenCrevia v30 — Accounts, scale and remaining audit items

Version 1.8.0. Builds on v29 (see IMPLEMENTATION-NOTES-v29.md). One additive table
(`password_resets`); existing `data/` folders upgrade automatically on start.

## Sign-in load at realistic size (the heaviest problem found)

Measured with 3,000 tasks (272 open, the rest finished across a year):

| | v29 | v30 |
|---|---|---|
| `/api/bootstrap` payload | 10.3 MB | 3.6 MB (113 KB gzip) |
| Server time per sign-in | 2.3 s | 0.1 s |
| 20 people signing in at once | 46 s until the last one loads | 3 s |
| Data ready — laptop / mid-range phone (4× CPU throttle) | 3.5 s / 7.0 s | 0.8 s / 1.7 s |
| Browser JS heap | 32 MB | 11 MB |

- Tasks finished more than `COS_TASK_HOT_DAYS` (default 45) days ago are sent as slim rows:
  every field lists, calendars, search, project progress and reports need, without
  comments, versions, files and activity. Opening one fetches the full record
  (`GET /api/tasks/:id`) first.
- Open and recent tasks are read with 9 queries in total instead of ~10 per task
  (`readTasksBatch`). A test proves the batched records are identical to single reads.
- Saving a slim copy can never erase history: the server merges only scalar fields over
  the stored task.
- Correction to the earlier audit: the "4.9 s Tasks render on a phone" figure came from test
  data without completion dates. With realistic data, screen rendering was already fast; the
  problem was load time and the blocked server thread.

## Forgot password (email)

- "Forgot password?" on the sign-in screen → email → link `APP_URL/?reset=<token>`.
- 256-bit token, stored only as SHA-256, valid `COS_RESET_MINUTES` (default 60), single use.
  A newer request voids older links. Completing a reset ends every session of that user.
- The response is identical for registered and unknown addresses. Deactivated accounts
  cannot use a live link.
- Limits: 5 requests per address and 30 per IP per 15 minutes; 30 invalid link checks per
  IP per 15 minutes. Separate from the sign-in limiter so an office behind one NAT address
  is not locked out.
- The token is removed from the address bar immediately. A link opened while signed in
  shows the same form in a modal. English and Indonesian.
- Admins can still reset passwords from Settings → Members.

## Security and operations

- Sessions: only the hashed id is accepted. v29 also accepted the stored hash itself, so a
  leaked database or backup could be replayed as a cookie. Logout no longer deletes by raw
  value. Pre-hash sessions are removed on start.
- Home warns admins while email uses the `log` transport, because reset links and
  notifications are then only written to `data/outbox`.
- `security.log` rotates at `COS_SECURITY_LOG_MAX_MB` (10) keeping `COS_SECURITY_LOG_KEEP` (5).
  The outbox keeps `COS_OUTBOX_DAYS` (14) / `COS_OUTBOX_MAX` (1000) files, written 0600,
  with unique names (two mails in one millisecond used to overwrite each other).

## Accessibility (axe-core, WCAG 2 A/AA)

Home, Tasks, Calendar, Projects, Messages and Settings: **0 violations** (v29: 3 rule types,
11 nodes). Form labels are linked to their controls, unnamed selects are named, empty
pipeline stages keep AA label contrast, and the light-theme danger red is #DC2626 (4.8:1).

## Smaller fixes

- AI Gallery daily allowance resets at local midnight (was 00:00 UTC = 07:00 WIB).
- Theme & appearance is read-only for non-admins, with an explanation.
- Reset modal no longer repeats its title; the expiry shown matches `COS_RESET_MINUTES`.

## Documentation and legal

- `npm run docs` (`docs/build-docs.py`) regenerates `docs/zencrevia-docs.html` (168 internal
  links, 0 broken) and `docs/zencrevia-docs.pdf` (54 pages) from the Markdown guides.
- ADMIN-OPS: forgot password, deactivate vs remove, new environment variables, production
  checklist, updated limitations. USER-MANUAL: forgot password.
- `LEGAL/PLACEHOLDERS.md` lists every value still to fill (48 occurrences, 18 unique).
  The privacy policy now states retention for reset requests and outbox copies.

## Verification

- `npm test`: **130/130**, stable across 6 consecutive runs. New: `tests/v30-accounts-and-scale.test.js`
  (reset flow end to end including expiry, reuse, voiding and deactivation; hash replay;
  slim/hydrate/merge; batch parity; log rotation).
- Chromium, 390×844 and 1280×820: forgot → email → reset → sign in with the new password;
  reused link shows the invalid state; signed-in link opens the modal and signs out after
  saving. A slim task hydrates on open (0 → 6 activity entries, one request).
- 13 screens × admin/member × desktop/mobile: no JS errors, no horizontal overflow.
  XSS payloads inert. Security probes unchanged (all blocked), zero 500s.

## Still open

- Legal values (company name, address, contacts, court, retention) — HSB and counsel.
- Security-log retention is size based; the privacy policy proposes 90–365 days. Pick one.
- No 2FA/SSO. Rate limiters live in process memory (reset on restart, single instance).
- Not testable here: real SMTP delivery, Google Drive OAuth, AI providers, Windows restore.
