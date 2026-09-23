# ZenCrevia v32 — Data integrity (fourth audit)

Version 1.10.0. Builds on v31. No schema change. The focus this round was authorization
depth: not "can this user reach the route" (v29–v31 covered that) but "can the request body
change data this user should not control." It could, in several places.

## The core problem

Task and entity writes rebuild every child collection from the request body. Route-level
permission checks (edit this task, approve this task) were in place, but the body itself was
trusted: comments, activity entries, version approval state, and reviewer were written as
sent. A member editing a task they legitimately had access to could:

- overwrite **any** task, including ones they don't own, by POSTing with an existing id
  (create silently overwrote) — even a viewer could;
- rewrite or delete **other people's comments**, and add a comment attributed to someone else;
- stamp a version **"approved"** with another user as the decider;
- appoint **themselves** as reviewer;
- inject fabricated **activity-log** entries.

All confirmed against a running server, then fixed and re-confirmed blocked.

## Fixes

- `POST /api/tasks` (and `/api/projects`, `/api/knowledge`, `/api/assets`, `/api/folders`,
  `/api/requests`) reject an id that already exists → **409**, instead of overwriting.
  `POST /api/decisions` refuses to overwrite a decision the caller does not own → **403**.
- On task write, server-owned collections are reconciled against the stored task
  (`sanitizeTaskWrite`): a comment keeps its original author and can be edited only by that
  author or an admin; foreign comments cannot be deleted through a task edit or reassigned to
  another author; a version's `approved`/`revision` decision and `decidedBy` are written only
  when the existing approve authz check passed, and always attributed to the caller; the
  activity log is taken from the stored task (it is append-only, written server-side).
- Changing the reviewer now requires the same permission as changing the assignee.
- New tasks are sanitized too: comments become the caller's, versions reset to `pending`,
  activity starts empty.

Legitimate work is unchanged (verified): a member adds, edits and deletes **their own**
comments, edits their assigned task, and the assigned reviewer approves with the decision
correctly attributed.

## Checked and acceptable

- Request creation forces `status="submitted"` and `by=caller`; the request PUT gates status
  changes behind `decide_request`. Activity actor is always the caller (no impersonation).
- Members overwriting/deleting Knowledge pages and Assets is **by role**: the demo `member`
  role includes `manage_knowledge` and `manage_assets`. That is a workspace policy choice, not
  a bug; tighten those roles in Settings → Roles if the team should not have them.
- Cookie flags (`HttpOnly; SameSite=Lax; Secure` in production), scrypt N=16384, session by
  hashed id only — all as before.

## DoS surface (measured, server stayed up)

- Body capped at `COS_MAX_BODY_BYTES` (12 MB): a 60 MB body → 413.
- 20,000-level nested JSON → 200 (parsed iteratively, ignored), no crash.
- 5,000 dependencies → 400; malformed JSON → 400; wrong content-type → 400.
- Health endpoint responsive throughout.

## Residual (unchanged, documented)

- A member can post an `approved`-typed **activity** entry on any task via `/api/activity`.
  It pollutes the cosmetic timeline only; it does not change real approval state (which lives
  in `approvals` / `file_versions`, now protected). Low severity; left as-is.
- Workflow allows any status → `done` without a review gate: a demo-workflow design choice,
  not an authorization hole.
- `script-src 'unsafe-inline'` (single-file architecture); ~1 ms timing signal on forgot.

## Verification

- `npm test`: **136/136**. New in `tests/v31-audit-fixes.test.js`: a member cannot overwrite,
  forge, rewrite/delete foreign comments, self-appoint reviewer or self-approve; create routes
  reject existing ids; legitimate own-comment and own-task edits still succeed.
- Re-ran the full attack matrix on a fresh database: A1 create-with-existing-id 409,
  self-approve 403, foreign-comment rewrite 0/2, comment deletion 5→5, self-reviewer 403,
  forged activity dropped.
- Chromium light + dark axe: 0 violations. 13 screens × admin/member × desktop/mobile:
  no JS errors, no overflow. XSS payloads inert. Prior security probes all still blocked;
  zero 500s.
