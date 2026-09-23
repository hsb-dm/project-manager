# ZenCrevia v33 — Stage move rules

Version 1.11.0. Builds on v32. Two nullable columns on `task_statuses`
(`reviewer_only`, `require_reviewer`), added automatically on start; NULL means "use the default".

## What it does

Settings → Workflow stages → **Who can move tasks into each stage**. Per stage:

| Rule | Options |
|---|---|
| Before entering | *Reviewer required* on/off |
| Who can move tasks here | *Anyone who can edit the task*, or *Reviewer, requester, team lead or admin* |

Presets: **Flexible (default)**, **Strict review**, **No restrictions**; then any stage can be changed
individually.

**Flexible default** (as agreed):
- A reviewer must be named before a task enters the first review stage or any later stage.
- The assignee can move their own task through every stage up to and including **Delivered**.
- **Done** and **Declined** need the reviewer, the requester, a team lead or an admin.
- Workflows without a stage with id `delivered` start fully open (reviewer requirement still applies).

## Enforcement

- Server-side in `gateStatusChange` for every path that changes status: `POST /api/tasks`
  (creating directly in a stage), `PUT /api/tasks/:id`, and `POST /api/tasks/:id/move` (board drag,
  drawer, keyboard, calendar, bulk actions). Missing reviewer → 400; not allowed to decide → 403.
- "May decide" = admin, `review_any`, lead of the task's team, the task's reviewer, or its requester —
  and never the assignee (unless they also hold one of the lead/admin roles).
- Requester = the submitter of the linked creative request, or `createdBy` of a task created through
  the request path (tagged `request`). A requester may change the status even without general edit
  rights, so a Viewer who submitted a request can accept the delivery.
- Only workspace admins can change the rules (`PUT /api/workspace` → 403 for others).

## In the UI

- The board refuses a move before anything jumps, with the reason as a toast. If the problem is a
  missing reviewer, the task drawer opens so the reviewer can be picked.
- While dragging a card, columns it may not enter are dimmed with a 🔒.
- The rules table is read-only for non-admins, stacks on phones, and has no axe violations. The
  existing stage name and stage type fields in the workflow editor also got accessible names.

## Verification

- `npm test`: **140/140**. New `tests/v33-stage-rules.test.js` (server process, real HTTP):
  default flexible rules via move and PUT; reviewer required before review and on direct creation;
  admin tightens Delivered / loosens Done / drops the reviewer requirement and the server follows;
  a member cannot change rules; the requester (a Viewer) can close their request while the assignee cannot.
- Chromium: panel renders 10 stages; Strict preset marks compliance → declined; a single change
  persists across reload; the member sees a disabled table; a member's move to Done is refused with
  the explanation, to Delivered succeeds; a missing reviewer opens the drawer; dragging locks
  Done and Declined; no overflow at 390 px; axe 0 violations on Workflow and Tasks.

This closes the residual "any status → done without review" noted in v32.
