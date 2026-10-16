/* ============================================================
   GOOGLE DRIVE DELETION SYNC (Oct 2026) — ZenCrevia_Google_Drive_Deletion_Sync_Spec.md
   A file ZenCrevia itself put in Google Drive (uploaded through the shared account, server/gdrive.js) can be deleted
   everywhere in ZenCrevia by someone who manages cloud storage; when the workspace has turned deletion sync on, the
   same Drive file — by the id recorded at upload, never by name — is then moved to Drive's Trash, where it can still
   be restored. Never deleted for good: files.update {trashed:true}, never files.delete.
   What is never touched:
   • a link to a Drive file someone already had — only uploads recorded here (drive_uploads) are ZenCrevia's;
   • a file still used anywhere (a task, a version, a comment, a chat message, a request, a description, the asset
     library…): the delete is refused with where it is used, and the job checks again before trashing;
   • a file uploaded under another Google account than the one connected now.
   Removing a file from a task or a message stays what it was: the reference goes, the file stays.
   The job is the file's own row (status, attempts, next attempt, generation): one at a time per file, retried with
   backoff on 429/5xx/timeouts, failed for good on 403 or a revoked grant, and a newer generation (an Undo) makes an
   older one stale. Nothing reports Drive done before Drive said so.
   ============================================================ */
"use strict";
const API = "https://www.googleapis.com/drive/v3/files/";
const MAX_ATTEMPTS = 8;
const err = (status, message, code) => { const e = new Error(message); e.status = status; if (code) e.code = code; return e; };
const nowIso = () => new Date().toISOString();
const ID_RE = /^[-\w]{10,200}$/;

function ensure(db) {
  if (ensure.ready === db) return;
  db.exec("CREATE TABLE IF NOT EXISTS drive_uploads (drive_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT, mime TEXT, size_label TEXT, url TEXT, account TEXT, uploaded_by TEXT, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', generation INTEGER NOT NULL DEFAULT 0, deleted_by TEXT, deleted_at TEXT, trashed_at TEXT, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, last_error TEXT)");
  db.exec("CREATE INDEX IF NOT EXISTS drive_uploads_due ON drive_uploads(status, next_attempt_at)");
  db.exec("CREATE TABLE IF NOT EXISTS drive_deletion_settings (workspace_id TEXT PRIMARY KEY, deletion_sync INTEGER NOT NULL DEFAULT 0, show_errors INTEGER NOT NULL DEFAULT 1, updated_by TEXT, updated_at TEXT)");
  ensure.ready = db;
}

/* ---------- settings: per workspace, off until an admin turns it on; trash is the only behaviour ---------- */
function settings(db, wsId) {
  ensure(db);
  const r = db.prepare("SELECT * FROM drive_deletion_settings WHERE workspace_id=?").get(wsId);
  return { deletionSync: !!(r && r.deletion_sync), mode: "trash", showErrors: r ? !!r.show_errors : true, protectReferenced: true, confirmDelete: true, updatedBy: (r && r.updated_by) || null, updatedAt: (r && r.updated_at) || null };
}
function saveSettings(db, wsId, s, userId) {
  ensure(db); const cur = settings(db, wsId);
  const sync = typeof s.deletionSync === "boolean" ? s.deletionSync : cur.deletionSync, show = typeof s.showErrors === "boolean" ? s.showErrors : cur.showErrors;
  db.prepare("INSERT INTO drive_deletion_settings (workspace_id, deletion_sync, show_errors, updated_by, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET deletion_sync=excluded.deletion_sync, show_errors=excluded.show_errors, updated_by=excluded.updated_by, updated_at=excluded.updated_at")
    .run(wsId, sync ? 1 : 0, show ? 1 : 0, userId || null, nowIso());
  return settings(db, wsId);
}

/* ---------- what ZenCrevia uploaded: written by the upload route, the only proof a file is ours ---------- */
function record(db, wsId, f, userId, account) {
  if (!f || !ID_RE.test(String(f.driveId || ""))) return;
  ensure(db);
  db.prepare("INSERT OR IGNORE INTO drive_uploads (drive_id, workspace_id, name, mime, size_label, url, account, uploaded_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(f.driveId, wsId, String(f.name || "").slice(0, 240), String(f.mime || "").slice(0, 120), String(f.size || "").slice(0, 40), String(f.url || "").slice(0, 600), account || null, userId || null, nowIso());
}
function get(db, wsId, driveId) { ensure(db); return db.prepare("SELECT * FROM drive_uploads WHERE drive_id=? AND workspace_id=?").get(String(driveId || ""), wsId) || null; }

/* ---------- where a file is still used: anywhere its Drive id is written ----------
   Each place is looked for by the id itself (instr, not LIKE: an id's "_" is no wildcard). A place a database does
   not have is skipped. What a deleted chat message held does not count; everything else does. */
const PLACES = [
  ["task", "Task file", "SELECT DISTINCT t.id, t.title label FROM files f JOIN tasks t ON t.id=f.task_id WHERE t.workspace_id=? AND (f.drive_id=? OR instr(coalesce(f.external_url,''),?)>0 OR instr(coalesce(f.preview_data,''),?)>0)", 4],
  ["task", "Version", "SELECT DISTINCT t.id, t.title label FROM file_versions v JOIN tasks t ON t.id=v.task_id WHERE t.workspace_id=? AND (v.drive_id=? OR instr(coalesce(v.drive_url,''),?)>0 OR instr(coalesce(v.preview_data,''),?)>0)", 4],
  ["task", "Comment", "SELECT DISTINCT t.id, t.title label FROM comments c JOIN tasks t ON t.id=c.task_id WHERE t.workspace_id=? AND (instr(coalesce(c.attachments,''),?)>0 OR instr(coalesce(c.body,''),?)>0)", 3],
  ["task", "Description", "SELECT id, title label FROM tasks WHERE workspace_id=? AND instr(coalesce(description,''),?)>0", 2],
  ["task", "Progress note", "SELECT DISTINCT t.id, t.title label FROM task_progress_notes n JOIN tasks t ON t.id=n.task_id WHERE t.workspace_id=? AND instr(coalesce(n.body,''),?)>0", 2],
  ["project", "Project discussion", "SELECT DISTINCT p.id, p.name label FROM project_comments c JOIN projects p ON p.id=c.project_id WHERE p.workspace_id=? AND (instr(coalesce(c.attachments,''),?)>0 OR instr(coalesce(c.body,''),?)>0)", 3],
  ["asset", "Asset library", "SELECT id, name label FROM assets WHERE workspace_id=? AND (instr(coalesce(external_url,''),?)>0 OR instr(coalesce(preview_data,''),?)>0)", 3],
  ["message", "Chat", "SELECT DISTINCT c.id, coalesce(c.name,'') label FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.workspace_id=? AND m.deleted_at IS NULL AND (instr(coalesce(m.refs,''),?)>0 OR instr(coalesce(m.body,''),?)>0)", 3],
  ["request", "Creative request", "SELECT id, title label FROM creative_requests WHERE workspace_id=? AND (instr(coalesce(reference_files,''),?)>0 OR instr(coalesce(links,''),?)>0 OR instr(coalesce(description,''),?)>0)", 4],
  ["knowledge", "Knowledge page", "SELECT id, title label FROM knowledge_pages WHERE workspace_id=? AND instr(coalesce(body,''),?)>0", 2],
];
function references(db, wsId, driveId) {
  const id = String(driveId || ""), out = [], seen = {};
  if (!ID_RE.test(id)) return out;
  PLACES.forEach(([type, where, sql, n]) => {
    let rows = [];
    try { rows = db.prepare(sql).all(wsId, ...Array(n - 1).fill(id)); } catch (e) { return; }
    rows.forEach(r => { const k = type + ":" + r.id + ":" + where; if (seen[k]) return; seen[k] = 1; out.push({ type, id: r.id, label: String(r.label || r.id).slice(0, 160), where }); });
  });
  return out;
}

/* ---------- deleting, undoing, retrying ---------- */
function view(db, wsId, r, withUsage) {
  const o = { driveId: r.drive_id, name: r.name || "", mime: r.mime || "", size: r.size_label || "", url: r.url || "", account: r.account || "", uploadedBy: r.uploaded_by || null, createdAt: r.created_at,
    status: r.status, deletedBy: r.deleted_by || null, deletedAt: r.deleted_at || null, trashedAt: r.trashed_at || null, attempts: r.attempts || 0, nextAttemptAt: r.next_attempt_at || null, lastError: r.last_error || null };
  if (withUsage) { const u = references(db, wsId, r.drive_id); o.usage = u.length; o.usedIn = u.slice(0, 12); }
  return o;
}
function list(db, wsId, limit) { ensure(db); return db.prepare("SELECT * FROM drive_uploads WHERE workspace_id=? ORDER BY created_at DESC LIMIT ?").all(wsId, Math.max(1, Math.min(500, limit || 200))).map(r => view(db, wsId, r, true)); }

/* drive: {shared, sharedAccount} as server/gdrive.js status() says now */
function requestDelete(db, wsId, driveId, user, drive) {
  const r = get(db, wsId, driveId);
  if (!r) throw err(404, "This file is not one ZenCrevia put in Google Drive.");
  if (r.status !== "active") return view(db, wsId, r, true);   /* asked twice: one deletion */
  const used = references(db, wsId, r.drive_id);
  if (used.length) throw err(409, "This file is still used in " + used.length + (used.length === 1 ? " place" : " places") + ". Remove it there first.", "FILE_IN_USE");
  const s = settings(db, wsId), sameAccount = !r.account || !drive || r.account === drive.sharedAccount;
  const trash = s.deletionSync && !!(drive && drive.shared) && sameAccount, at = nowIso();
  const note = s.deletionSync && !trash ? (!(drive && drive.shared) ? "Google Drive is not connected" : "Uploaded under another Google account") : null;
  db.prepare("UPDATE drive_uploads SET status=?, generation=generation+1, deleted_by=?, deleted_at=?, attempts=0, next_attempt_at=?, last_error=? WHERE drive_id=? AND workspace_id=? AND status='active'")
    .run(trash ? "trash_pending" : "deleted_local", user.id, at, trash ? at : null, note, r.drive_id, wsId);
  return view(db, wsId, get(db, wsId, r.drive_id), true);
}
/* Undo: back in use, before Drive has trashed it — a newer generation, so a job already under way is stale */
function restore(db, wsId, driveId) {
  const r = get(db, wsId, driveId); if (!r) throw err(404, "This file is not one ZenCrevia put in Google Drive.");
  if (["deleted_local", "trash_pending", "trash_failed"].indexOf(r.status) < 0) throw err(409, r.status === "trashed" ? "It is already in Google Drive's Trash — restore it there." : "This file is not deleted.");
  db.prepare("UPDATE drive_uploads SET status='active', generation=generation+1, deleted_by=NULL, deleted_at=NULL, attempts=0, next_attempt_at=NULL, last_error=NULL WHERE drive_id=? AND workspace_id=?").run(r.drive_id, wsId);
  return view(db, wsId, get(db, wsId, r.drive_id), true);
}
function retry(db, wsId, driveId) {
  const r = get(db, wsId, driveId); if (!r) throw err(404, "This file is not one ZenCrevia put in Google Drive.");
  if (r.status !== "trash_failed") throw err(409, "Only a failed Drive sync can be tried again.");
  db.prepare("UPDATE drive_uploads SET status='trash_pending', attempts=0, next_attempt_at=?, last_error=NULL WHERE drive_id=? AND workspace_id=?").run(nowIso(), r.drive_id, wsId);
  return view(db, wsId, get(db, wsId, r.drive_id), true);
}

/* ---------- the job ----------
   deps: { token: async () => accessToken, drive: () => ({shared, sharedAccount}), fetch, log(event, details), onDone(row, outcome) } */
function backoffMs(attempt) { const base = Math.min(6 * 3600e3, 30e3 * Math.pow(2, attempt)); return Math.round(base * (0.5 + Math.random())); }
async function driveCall(deps, method, id, body) {
  const token = await deps.token();
  const res = await (deps.fetch || fetch)(API + encodeURIComponent(id) + "?supportsAllDrives=true&fields=id,trashed,capabilities(canTrash)", {
    method, headers: Object.assign({ authorization: "Bearer " + token }, body ? { "content-type": "application/json" } : {}), body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  let json = null; try { json = await res.json(); } catch (e) {}
  return { status: res.status, ok: res.ok, json: json || {} };
}
/* what Drive said, as what to do: done, gone, failed for good, or try again later */
function classify(status) {
  if (status === 404) return "missing";
  if (status === 403 || status === 400) return "denied";
  if (status === 401 || status === 408 || status === 429 || status >= 500) return "later";
  return "later";
}
async function runOne(db, wsId, r, deps) {
  const gen = r.generation, settle = (status, fields) => {
    const f = Object.assign({ last_error: null, next_attempt_at: null, trashed_at: null }, fields || {});
    return db.prepare("UPDATE drive_uploads SET status=?, last_error=?, next_attempt_at=?, trashed_at=coalesce(?, trashed_at), attempts=attempts+? WHERE drive_id=? AND workspace_id=? AND generation=? AND status='trash_pending'")
      .run(status, f.last_error, f.next_attempt_at, f.trashed_at, f.attempt ? 1 : 0, r.drive_id, wsId, gen).changes > 0;
  };
  const done = (outcome, status, fields) => { const ok = settle(status, fields); if (ok && deps.onDone) deps.onDone(r, outcome, fields && fields.last_error); return outcome; };
  /* used again since it was deleted: back in use, untouched */
  if (references(db, wsId, r.drive_id).length) {
    db.prepare("UPDATE drive_uploads SET status='active', generation=generation+1, deleted_by=NULL, deleted_at=NULL, attempts=0, next_attempt_at=NULL, last_error=NULL WHERE drive_id=? AND workspace_id=? AND generation=? AND status='trash_pending'").run(r.drive_id, wsId, gen);
    if (deps.onDone) deps.onDone(r, "back_in_use"); return "back_in_use";
  }
  const s = settings(db, wsId), d = deps.drive ? deps.drive() : { shared: true };
  if (!s.deletionSync) return done("failed", "trash_failed", { last_error: "Deletion sync was turned off before Drive was reached" });
  if (!d.shared) return done("failed", "trash_failed", { last_error: "Google Drive is not connected — reconnect it, then try again" });
  if (r.account && d.sharedAccount && r.account !== d.sharedAccount) return done("failed", "trash_failed", { last_error: "Uploaded under another Google account than the one connected now" });
  const later = (why) => (r.attempts || 0) + 1 >= MAX_ATTEMPTS
    ? done("failed", "trash_failed", { last_error: why + " — tried " + MAX_ATTEMPTS + " times", attempt: true })
    : done("later", "trash_pending", { last_error: why, next_attempt_at: new Date(Date.now() + backoffMs(r.attempts || 0)).toISOString(), attempt: true });
  try {
    /* what Drive has now: a retry after a lost answer finds it already in the Trash */
    const meta = await driveCall(deps, "GET", r.drive_id);
    if (meta.status === 401 && deps.dropToken) deps.dropToken();
    if (!meta.ok) {
      const k = classify(meta.status);
      if (k === "missing") return done("missing", "provider_missing", { last_error: "No longer in Google Drive (or not visible to the connected account)" });
      if (k === "denied") return done("failed", "trash_failed", { last_error: "Google Drive refused (" + meta.status + "): the connected account cannot move this file to the Trash" });
      return later("Google Drive answered " + meta.status);
    }
    if (meta.json.trashed === true) return done("trashed", "trashed", { trashed_at: nowIso() });
    if (meta.json.capabilities && meta.json.capabilities.canTrash === false) return done("failed", "trash_failed", { last_error: "The connected account may not move this file to the Trash" });
    const res = await driveCall(deps, "PATCH", r.drive_id, { trashed: true });
    if (res.status === 401 && deps.dropToken) deps.dropToken();
    if (res.ok && res.json.trashed !== false) return done("trashed", "trashed", { trashed_at: nowIso() });
    const k = classify(res.status);
    if (k === "missing") return done("missing", "provider_missing", { last_error: "No longer in Google Drive" });
    if (k === "denied") return done("failed", "trash_failed", { last_error: "Google Drive refused (" + res.status + "): the connected account cannot move this file to the Trash" });
    return later("Google Drive answered " + res.status);
  } catch (e) {
    /* a revoked grant needs an admin; anything else (timeout, network) is tried again */
    if (e.status === 409) return done("failed", "trash_failed", { last_error: "Google Drive access was revoked — reconnect the shared account, then try again" });
    return later(e.name === "TimeoutError" ? "Google Drive did not answer in time" : "Google Drive could not be reached");
  }
}
let running = false;
async function tick(db, wsId, deps, limit) {
  if (running) return 0; running = true; let n = 0;
  try {
    ensure(db);
    const due = db.prepare("SELECT * FROM drive_uploads WHERE workspace_id=? AND status='trash_pending' AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY next_attempt_at LIMIT ?").all(wsId, nowIso(), limit || 5);
    for (const r of due) { await runOne(db, wsId, r, deps); n++; }
  } finally { running = false; }
  return n;
}
function summary(db, wsId) {
  ensure(db);
  const c = {}; db.prepare("SELECT status, count(*) n FROM drive_uploads WHERE workspace_id=? GROUP BY status").all(wsId).forEach(r => { c[r.status] = r.n; });
  return { active: c.active || 0, pending: c.trash_pending || 0, trashed: c.trashed || 0, failed: c.trash_failed || 0, local: c.deleted_local || 0, missing: c.provider_missing || 0 };
}

module.exports = { ensure, settings, saveSettings, record, get, references, list, view, requestDelete, restore, retry, tick, runOne, summary, MAX_ATTEMPTS, _classify: classify, _backoffMs: backoffMs };
