/* The copies a task's or a project's history keeps of how it looked after each write (server.js, withSnapshot:
   "going back to a point in the history"), so an admin can put it back to any such point.

   Oct 2026 (performance): a full copy was saved on every write that adds to the history, even when nothing that
   going back restores had changed. A comment is the common case: the copy leaves comments out, so each new comment
   saved the task again, word for word, but for its "updated" time. Those copies were most of a large database.

   Now a point whose restorable content (TASK_RESTORE / PROJECT_RESTORE, compared by a hash) is the same as the
   latest copy's keeps a row of its own — its id, when, who — but not the copy again: it names the row that holds the
   copy (same_as) and keeps only what differs from it (doc = {"set": {...}, "del": [...]}, usually the updated time).
   Reading it back puts the two together, so every point shows and restores exactly what it did before.

   Only the last `keep` points of each are kept, as before. When the oldest is dropped while newer points still lean
   on its copy, the oldest of those becomes the one holding the full copy first, so nothing kept loses its copy. */
const crypto = require("crypto");

/* what going back puts back (POST /api/restore/:type/:id); everything else stays as it is now */
const TASK_RESTORE = ["title", "description", "proj", "team", "status", "prio", "assignee", "reviewer", "assignees", "reviewers", "hidden", "startDate", "dueDate", "effort", "assetCount", "labels", "parent", "tags", "dependencies", "brief", "custom", "meta", "versions", "files"];
const PROJECT_RESTORE = ["name", "description", "brief", "owner", "status", "progress", "startDate", "dueDate", "tags", "teams", "archivedAt"];
const RESTORE = { task: TASK_RESTORE, project: PROJECT_RESTORE };

const ready = new WeakSet();
function ensure(db) {
  if (ready.has(db)) return;
  db.exec("CREATE TABLE IF NOT EXISTS entity_snapshots (id TEXT PRIMARY KEY, workspace_id TEXT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, taken_at TEXT NOT NULL, actor_id TEXT, doc TEXT NOT NULL); CREATE INDEX IF NOT EXISTS idx_entity_snapshots ON entity_snapshots(entity_type, entity_id, taken_at);");
  /* added Oct 2026; a database from before has neither, and its rows are all full copies */
  for (const sql of ["ALTER TABLE entity_snapshots ADD COLUMN doc_hash TEXT", "ALTER TABLE entity_snapshots ADD COLUMN same_as TEXT"]) { try { db.exec(sql); } catch (e) { /* already there */ } }
  ready.add(db);
}
/* a hash of what going back would restore; a field the copy does not have is not the same as one that is empty */
function restorableHash(type, doc) {
  const fields = RESTORE[type] || Object.keys(doc).sort();
  return crypto.createHash("sha256").update(JSON.stringify(fields.map(k => Object.prototype.hasOwnProperty.call(doc, k) ? [k, doc[k]] : [k]))).digest("hex");
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
/* what turns `base` into `doc`, and back */
function diff(base, doc) {
  const set = {}, del = [];
  Object.keys(doc).forEach(k => { if (!has(base, k) || !same(base[k], doc[k])) set[k] = doc[k]; });
  Object.keys(base).forEach(k => { if (!has(doc, k)) del.push(k); });
  return del.length ? { set, del } : { set };
}
function apply(base, patch) {
  const set = (patch && patch.set) || {}, del = new Set((patch && patch.del) || []), out = {};
  Object.keys(base).forEach(k => { if (!del.has(k)) out[k] = has(set, k) ? set[k] : base[k]; });
  Object.keys(set).forEach(k => { if (!has(out, k)) out[k] = set[k]; });
  return out;
}
const parse = s => { try { return JSON.parse(s); } catch (e) { return null; } };

/* Saves the copy for one point, in one commit. row: { id, wsId, type, entityId, takenAt, actorId, doc } */
function put(db, row, keep) {
  ensure(db);
  db.exec("SAVEPOINT entity_snapshot");
  try { save(db, row, keep); db.exec("RELEASE entity_snapshot"); }
  catch (e) { try { db.exec("ROLLBACK TO entity_snapshot"); db.exec("RELEASE entity_snapshot"); } catch (x) { /* nothing to undo */ } throw e; }
}
function save(db, row, keep) {
  const json = JSON.stringify(row.doc), doc = JSON.parse(json), hash = restorableHash(row.type, doc);
  const last = db.prepare("SELECT id, doc_hash, same_as FROM entity_snapshots WHERE entity_type=? AND entity_id=? ORDER BY taken_at DESC LIMIT 1").get(row.type, row.entityId);
  let stored = json, sameAs = null;
  if (last && last.doc_hash === hash) {
    const rootId = last.same_as || last.id;
    const root = db.prepare("SELECT doc, same_as FROM entity_snapshots WHERE id=?").get(rootId);
    const base = root && !root.same_as ? parse(root.doc) : null;
    if (base && typeof base === "object") { stored = JSON.stringify(diff(base, doc)); sameAs = rootId; }
  }
  db.prepare("INSERT INTO entity_snapshots (id,workspace_id,entity_type,entity_id,taken_at,actor_id,doc,doc_hash,same_as) VALUES (?,?,?,?,?,?,?,?,?)").run(row.id, row.wsId, row.type, row.entityId, row.takenAt, row.actorId || null, stored, hash, sameAs);
  prune(db, row.type, row.entityId, keep);
}
/* the copy a row stands for, whole */
function docOf(db, s) {
  if (!s) return null;
  if (!s.same_as) return parse(s.doc);
  const root = db.prepare("SELECT doc FROM entity_snapshots WHERE id=?").get(s.same_as);
  const base = root ? parse(root.doc) : null, patch = parse(s.doc);
  return base && typeof base === "object" ? apply(base, patch) : undefined;
}
/* only the last `keep` points of one task or project */
function prune(db, type, entityId, keep) {
  const n = db.prepare("SELECT count(*) AS n FROM entity_snapshots WHERE entity_type=? AND entity_id=?").get(type, entityId).n;
  if (n <= keep) return;
  const kept = new Set(db.prepare("SELECT id FROM entity_snapshots WHERE entity_type=? AND entity_id=? ORDER BY taken_at DESC LIMIT " + Math.max(0, keep | 0)).all(type, entityId).map(r => r.id));
  const doomed = db.prepare("SELECT id, doc, same_as FROM entity_snapshots WHERE entity_type=? AND entity_id=?").all(type, entityId).filter(r => !kept.has(r.id));
  const upd = db.prepare("UPDATE entity_snapshots SET doc=?, same_as=? WHERE id=?");
  doomed.filter(r => !r.same_as).forEach(root => {
    const heirs = db.prepare("SELECT id, doc FROM entity_snapshots WHERE entity_type=? AND entity_id=? AND same_as=? ORDER BY taken_at, id").all(type, entityId, root.id).filter(r => kept.has(r.id));
    if (!heirs.length) return;
    const base = parse(root.doc); if (!base || typeof base !== "object") return;
    /* the oldest point still kept takes the full copy; the others lean on it from now on */
    const heirDoc = apply(base, parse(heirs[0].doc));
    upd.run(JSON.stringify(heirDoc), null, heirs[0].id);
    heirs.slice(1).forEach(h => upd.run(JSON.stringify(diff(heirDoc, apply(base, parse(h.doc)))), heirs[0].id, h.id));
  });
  const del = db.prepare("DELETE FROM entity_snapshots WHERE id=?");
  doomed.forEach(r => del.run(r.id));
}
module.exports = { TASK_RESTORE, PROJECT_RESTORE, ensure, put, docOf, prune, restorableHash, diff, apply };
