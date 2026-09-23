# ZenCrevia v31 — Third audit (UI/UX, security, optimisation)

Version 1.9.0. Builds on v30. Schema change is additive (three indexes).
Audit data: 3,000 tasks, admin / creative lead / member / viewer accounts.

## Most serious finding: demo mode on a slow network

Served over http(s), the app aborted `/api/auth/session` after 4 s and fell back to the
offline demo: a demo user picker and "changes are not saved". While loading it also showed
the demo identity ("ZN" avatar) and demo badge counts.

- Served builds now wait up to 20 s and never fall back to demo on a network failure. They
  show "Can't reach the ZenCrevia server" with an automatic, backing-off retry and a retry button.
- Demo mode is used only for the standalone file (`file:`) or a static host with no API
  (404 or non-JSON session response).
- Demo identity and counters are hidden (`html.zc-booting`) until the real session loads.
- Verified in Chromium: server unreachable → retry screen, identity hidden, retry signs in;
  6-second session → waits and signs in, never demo; 404 → demo still works.

## Security

| Finding | v30 | v31 |
|---|---|---|
| Account enumeration by sign-in timing | registered ~80 ms, unknown ~2 ms | 39.2 ms vs 39.4 ms (one scrypt on every path) |
| No text length limits | a 5 MB comment grew every sign-in from 3.6 MB to 18.4 MB | limits enforced before handlers, HTTP 413 |
| CSV formula injection (`=HYPERLINK(...)` in a title) | executed when the CSV opens in Excel/Sheets | text cells starting with `= + - @` get a leading apostrophe; numbers unchanged. XLSX export was already safe (inline strings) |

Limits: task title 240, description 20,000, comment 10,000, version note 4,000, brief field
10,000; Knowledge title 200, page 200,000; project name 160 / description 5,000; team name 80;
member name 120; view name 120. Chat messages were already cut at 4,000. Existing oversized
data is not deleted.

Checked and fine: viewer can call 3 of 74 mutating routes, all legitimate (own views,
own notifications read, idempotent channel sync); bootstrap exposes no keys, invite codes
or SMTP data; members cannot edit or delete others' messages; non-members cannot read or
post in a team channel; AI provider hosts are allow-listed; SVG is not accepted as an image.

Residual: `script-src 'unsafe-inline'` (single-file architecture with inline handlers); the
forgot-password endpoint differs by ~1 ms between known and unknown addresses.

## UI/UX

- Connection pill said "Connected" while offline. It now follows browser online/offline and
  the live stream, shows "Offline — changes will not be saved" / "Reconnecting…", and reloads
  data when the connection returns.
- Network failures showed raw "Failed to fetch" in English. They now show a plain, translated
  message; an expired session sends the user to sign-in.
- Modal and task drawer: `role="dialog"`, `aria-modal`, `aria-labelledby`. Focus returns to
  the control that opened them, including when that control was re-rendered meanwhile.
  (Focus trap and Esc already worked.)
- Dark mode: 0 axe violations after naming the conversation notification select. Light: 0.
- Legibility: status badges, labels and eyebrows no longer go below 10.5 px (were 9–9.5 px;
  up to 43 % of Calendar text was under 11 px). A finished task's struck-through title no
  longer strikes through its "Done" badge. No horizontal overflow introduced.
- Home pipeline count is localised.

Checked and fine: 300 screen switches → heap stable at 28 MB, DOM stable, 22 document /
6 window listeners (no leak). Focus trap and Esc in dialogs. Mobile touch targets are mostly
28 px: WCAG 2.2 AA (24 px) passes; Apple's 44 px guideline is not met — unchanged.

## Optimisation

- Indexes added on `comments(task_id, created_at)`, `files(task_id, created_at)` and
  `notifications(recipient_id, created_at)`. Honest result: at 12,000 comments the task read
  went 7.4 → 7.2 ms, i.e. no measurable gain yet; they matter at larger volumes and cost little.
- Measured and acceptable for ~30 users: analytics over 52 weeks 0.6 s, manual backup 0.3 s,
  first compressed shell 0.2 s (each briefly holds the single server thread).
- Slow 3G on a mid-range phone: first content 6.4 s, repeat visit 0.6 s.

## Verification

- `npm test`: **134/134**. New `tests/v31-audit-fixes.test.js`: text limits at and over the
  limit, sign-in timing parity, CSV neutralisation, no demo fallback on network failure.
- Chromium, as above; 13 screens × admin/member × desktop/mobile: no JS errors, no overflow;
  axe light and dark: 0 violations on 6–8 screens; XSS payloads inert; security probes all blocked.
