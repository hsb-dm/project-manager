# ZenCrevia v37 — Handover audit

Version 1.15.0. Builds on v36. No schema change.
Focus: what a new developer would trip over, plus a last functional sweep.

## Findings and fixes

| # | Finding | Fix |
|---|---|---|
| 1 | **Google Drive links were always rejected.** `assets.js` and `messages.js` both declared a global `detectProvider()`. The chat version (loaded later) returns an object; the asset and task-version dialogs compared the result with `"gdrive"`, so "Add Google Drive link" (Assets) and "Link Drive version" (task) always said "Use a Google Drive link". | Asset helper renamed `isDriveUrl()` / `driveKind()`; both callers updated. Verified in Chromium: a Drive version is linked. |
| 2 | **Clicking a task's status in List view opened the personal availability menu** ("Focus", "In a meeting", "Lunch") instead of "Move to". `enhance.js` declared `statusMenu(a)` for availability, replacing `tasks.js` `statusMenu(anchor, id)`. | Availability menu renamed `availabilityMenu()`. Verified: List status opens "Move to"; the account menu still opens availability. |
| 3 | Nothing prevented the next collision. | `tests/v37-code-health.test.js` fails on any global function declared in two front-end files (three deliberate supersets are listed) and on files in `src/` that `build.js` never includes. |
| 4 | No `.gitignore`: a first `git add .` would commit `.env` secrets and the live database/backups. | `.gitignore` for `.env*`, `data/`, databases, backups, logs. |
| 5 | `npm run reset` in production printed a raw stack trace. | Clear message: what it would destroy and how to proceed. |

Checked and fine: no secrets in the repository (key-pattern scan); CLI `npm run backup` works;
the test suite passes 3 runs in a row (152 tests, ~17 s each); no duplicate top-level variables.

## Documentation

- **`docs/HANDOVER.md`** — the developer's entry point: status, quick start, repository map, request
  pipeline, the data-integrity / stage-rule / concurrency invariants, the v29–v35 front-end patch layer
  (which core function each file wraps and why), permissions, configuration, tests, release history,
  prioritised technical debt, recipes for common changes, and a table of accesses to hand over.
- Included first in `docs/zencrevia-docs.html` / `.pdf`; linked from README and DEVELOPER.md.
