# ZenCrevia v34 — Working at the same time (fifth audit)

Version 1.12.0. Builds on v33. No schema change.
This round looked at what happens when several people use the app at once, and at the admin and
recovery paths that had not been exercised.

## Findings and fixes

| # | Finding (reproduced on a running server) | Fix |
|---|---|---|
| 1 | **Lost updates.** Laura renamed a task, Sarah saved a description from the copy she had open; Laura's title was silently overwritten (both 200). | The client sends the revision it loaded (`_rev`) and the fields it changed (`_changed`). If someone saved in between, the server applies only those fields on top of the latest version and returns `_merged`; the user sees "Someone else edited this task at the same time. Both changes were kept." A stale save without `_changed` is refused (409). Merging runs before every permission check, so it cannot widen rights. |
| 2 | **Boards went stale.** Task changes by others appeared only after a reload; only chat was live. | After every task write the server sends `task_changed` to every signed-in client; clients fetch just that task (batched). Board, calendar and open drawer update in about a second; deletions disappear, new tasks appear. |
| 3 | **The assignee could reopen a task the reviewer had closed** (Done → In Progress, then deliver again). | Leaving a reviewer-only stage needs the same right as entering it. |
| 4 | **The only admin could demote themselves**, leaving nobody able to manage members, backups or settings. | Refused while no other active admin exists. |
| 5 | **Restoring a corrupted or tampered backup showed "Server error".** (It was already refused safely.) | 422 with the reason and "Nothing was changed." |
| 6 | **Bulk "move to" said "5 tasks moved"** and then showed one error per task the stage rules refused. | Tasks that may not move are skipped up front: "3 tasks moved to Delivered · 2 not moved (reviewer rule)". |

## Checked and fine

- Changing your own password signs out your other sessions and keeps the current one.
- Admins cannot deactivate or remove themselves, and cannot strip the admin role's permissions.
- Backup integrity: a flipped byte fails `verify` ("Checksum does not match") and restore; the live
  database and server are untouched.
- Deleting a task asks for confirmation and names the tasks it blocks. It is a hard delete (backups
  are the recovery path) — acceptable, noted.
- Server memory under 3,000 mixed requests (10 parallel workers, bootstrap/read/write): 73 → 112 →
  129 → 130 → 134 → 133 MB — it plateaus; no leak.

## Verification

- `npm test`: **145/145**. New `tests/v34-collaboration.test.js`: field merge and 409, merge cannot
  widen permissions, `task_changed` events over a real SSE stream (edit, move, create, delete),
  reopen gate, last-admin guard, tampered-backup restore.
- Chromium, two users in parallel: Laura renames, Sarah edits the brief from a stale copy → both
  kept, Sarah sees the notice. Live board: a rename, a status move, a new task and a deletion by
  another user show up in Sarah's open app within ~1 s. Bulk move to Done with no permission → one
  clear message; bulk move to Delivered → all three moved.
