const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = process.env.COS_DATA_DIR || path.join(__dirname, "..", "data");
const BACKUP_DIR = process.env.COS_BACKUP_DIR || path.join(DATA_DIR, "backups");
const KEEP = Math.max(3, +(process.env.COS_BACKUP_KEEP || 14));
const MAGIC = Buffer.from("ZCV1");

function backupKey() {
  const raw = process.env.COS_BACKUP_KEY || "";
  if (raw.length < 32) { const e = new Error("COS_BACKUP_KEY must contain at least 32 characters"); e.status = 400; throw e; }
  return raw;
}
function sqlPath(file) { return String(file).replace(/'/g, "''"); }
function stamp() { return new Date().toISOString().replace(/[:.]/g, "-"); }
/* An encrypted file is MAGIC · salt (16) · iv (12) · GCM tag (16) · the AES-256-GCM ciphertext, the key being
   scrypt(COS_BACKUP_KEY, salt). Oct 2026: the file is sealed a megabyte at a time (it was read whole into memory),
   the tag written into its place once known, and the result appears under its name only when complete. One backup
   derives its key once — one salt for the database and every picture and document it mirrors, each with its own iv;
   scrypt took about 30 ms per file. The format is unchanged, so every backup restores as before. */
const CHUNK = 1 << 20;
function writeAll(fd, buf, position) { let off = 0; while (off < buf.length) off += fs.writeSync(fd, buf, off, buf.length - off, position == null ? null : position + off); }
function sealer(secret) {
  const salt = crypto.randomBytes(16), key = crypto.scryptSync(secret, salt, 32);
  return function seal(source, target) {
    /* a part file of its own: another backup (a safety copy, the command line) may be sealing the same file now */
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", key, iv), part = target + "." + iv.toString("hex").slice(0, 8) + ".part";
    const inp = fs.openSync(source, "r");
    try {
      const out = fs.openSync(part, "w", 0o600);
      try {
        writeAll(out, Buffer.concat([MAGIC, salt, iv, Buffer.alloc(16)]));
        const buf = Buffer.allocUnsafe(CHUNK); let n;
        while ((n = fs.readSync(inp, buf, 0, CHUNK, null)) > 0) writeAll(out, cipher.update(buf.subarray(0, n)));
        writeAll(out, cipher.final());
        writeAll(out, cipher.getAuthTag(), 32);
      } finally { fs.closeSync(out); }
    } catch (e) { try { fs.unlinkSync(part); } catch {} throw e; }
    finally { fs.closeSync(inp); }
    try { fs.renameSync(part, target); }
    catch (e) { try { fs.unlinkSync(part); } catch {} if (!fs.existsSync(target)) throw e; /* the other one sealed it first; theirs is whole */ }
  };
}
function encryptFile(source, target) { sealer(backupKey())(source, target); }
function decryptFile(source, target) {
  const raw = fs.readFileSync(source);
  if (!raw.subarray(0, 4).equals(MAGIC)) throw new Error("Backup format is not recognized");
  const salt = raw.subarray(4, 20), iv = raw.subarray(20, 32), tag = raw.subarray(32, 48), encrypted = raw.subarray(48);
  const key = crypto.scryptSync(backupKey(), salt, 32), decipher = crypto.createDecipheriv("aes-256-gcm", key, iv); decipher.setAuthTag(tag);
  fs.writeFileSync(target, Buffer.concat([decipher.update(encrypted), decipher.final()]), { mode: 0o600 });
}
function verifyDatabase(file) {
  const test = new DatabaseSync(file, { readOnly: true });
  try {
    const row = test.prepare("PRAGMA integrity_check").get();
    if (!row || Object.values(row)[0] !== "ok") throw new Error("SQLite integrity check failed");
    const tables = test.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n;
    if (!tables) throw new Error("Backup contains no database tables");
    return { ok: true, tables };
  } finally { test.close(); }
}
/* ============================================================
   v17 §P1-5 — Backup History, safe restore and rollback.
   A backup is a file plus a small JSON sidecar carrying its checksum, who
   made it, why, and what the integrity check found. Restores are staged and
   roll back on failure, and every restore is written to an audit trail.
   ============================================================ */
const META_SUFFIX = ".meta.json";
const AUDIT_FILE = () => path.join(BACKUP_DIR, "restore-audit.json");

function sha256(file) {
  const h = crypto.createHash("sha256"), fd = fs.openSync(file, "r"), buf = Buffer.allocUnsafe(CHUNK);
  try { let n; while ((n = fs.readSync(fd, buf, 0, CHUNK, null)) > 0) h.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); }
  return h.digest("hex");
}
function metaPath(name) { return path.join(BACKUP_DIR, name + META_SUFFIX); }
function readMeta(name) {
  try { return JSON.parse(fs.readFileSync(metaPath(name), "utf8")); } catch { return {}; }
}
function writeMeta(name, meta) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(metaPath(name), JSON.stringify(meta, null, 2), { mode: 0o600 });
  return meta;
}
/* §P1-5 retention is configurable; the env var remains the default. */
function retention(settings) {
  const keep = settings && +settings.keep;
  return Math.max(3, Math.min(365, keep || KEEP));
}
function list() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter(n => /^zencrevia-.*\.db\.enc$/.test(n)).map(name => {
    const s = fs.statSync(path.join(BACKUP_DIR, name)), meta = readMeta(name);
    return {
      name, bytes: s.size, createdAt: meta.createdAt || s.mtime.toISOString(), encrypted: true,
      kind: meta.kind || "manual",            // manual | scheduled | pre-restore | pre-import
      createdBy: meta.createdBy || null,
      reason: meta.reason || null,
      checksum: meta.checksum || null,
      integrity: meta.integrity || null,      // { ok, tables } recorded at creation
      tables: meta.tables || null
    };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
/* Re-hash a stored file and compare it with what was recorded at creation. A
   backup you cannot verify is not a backup you can rely on (§9). */
function verifyStored(name) {
  const file = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(file)) return { ok: false, status: "missing", detail: "The backup file is no longer on disk." };
  const meta = readMeta(name);
  if (!meta.checksum) return { ok: true, status: "unverified", detail: "This backup predates checksum recording." };
  const actual = sha256(file);
  return actual === meta.checksum
    ? { ok: true, status: "verified", detail: "Checksum matches the value recorded when the backup was created." }
    : { ok: false, status: "corrupt", detail: "Checksum does not match — the file changed after it was written." };
}
function prune(settings) {
  const keep = retention(settings);
  list().slice(keep).forEach(x => {
    /* never prune a safety copy taken for an in-flight restore/import */
    if (x.kind === "pre-restore" || x.kind === "pre-import") return;
    try { fs.unlinkSync(path.join(BACKUP_DIR, x.name)); } catch {}
    try { fs.unlinkSync(metaPath(x.name)); } catch {}
  });
}
function audit(entry) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  let log = []; try { log = JSON.parse(fs.readFileSync(AUDIT_FILE(), "utf8")) || []; } catch {}
  log.unshift(Object.assign({ at: new Date().toISOString() }, entry));
  log = log.slice(0, 200);
  fs.writeFileSync(AUDIT_FILE(), JSON.stringify(log, null, 2), { mode: 0o600 });
  return log;
}
function auditLog() { try { return JSON.parse(fs.readFileSync(AUDIT_FILE(), "utf8")) || []; } catch { return []; } }
/* One backup's work, the same wherever it runs: the database copied (VACUUM INTO — through the server's own
   handle, or a connection of the worker's own), checked, sealed under the name `sealed`; the pictures and the
   documents mirrored with the same key; the sealed file's checksum. job: { dbFile?, plain, sealed, secret, backupDir } */
function runJob(job, db) {
  const plain = job.plain, backupDir = job.backupDir || BACKUP_DIR;
  try {
    cleanStale(backupDir);
    if (db) db.exec("VACUUM INTO '" + sqlPath(plain) + "'");
    else { const src = new DatabaseSync(job.dbFile); try { src.exec("PRAGMA busy_timeout = 5000"); src.exec("VACUUM INTO '" + sqlPath(plain) + "'"); } finally { src.close(); } }
    const verified = verifyDatabase(plain);
    const seal = sealer(job.secret);
    seal(plain, job.sealed);
    /* v39: images live in COS_DATA_DIR/uploads; they are immutable, so an incremental encrypted
       mirror (BACKUP_DIR/uploads/<name>.enc) is enough for every database backup to be complete */
    let files = null; try { files = require("./uploads").mirror(backupDir, seal); } catch (e) { files = { error: e.message }; console.error("[backup] uploads mirror failed:", e.message); }
    /* Documents kept on this server live in their own folder, which the image mirror above does not
       match. Without this a restore would bring back every image and none of the PDFs or decks. */
    try { const docs = require("./filestore").mirror(backupDir, seal); files = Object.assign({}, files, { documents: docs }); } catch (e) { files = Object.assign({}, files, { documents: { error: e.message } }); console.error("[backup] documents mirror failed:", e.message); }
    return { verified, files, checksum: sha256(job.sealed), bytes: fs.statSync(job.sealed).size };
  } finally { try { fs.unlinkSync(plain); } catch {} }
}
/* what a backup that stopped half-way (the server was stopped during it) left behind: never a finished backup */
const STALE_MS = 3600000;
function cleanStale(backupDir) {
  const sweep = (dir, re) => { let names = []; try { names = fs.readdirSync(dir); } catch { return; } names.forEach(n => { if (!re.test(n)) return; const f = path.join(dir, n); try { if (Date.now() - fs.statSync(f).mtimeMs > STALE_MS) fs.unlinkSync(f); } catch {} }); };
  sweep(backupDir, /^zencrevia-.*\.(tmp\.db|db\.enc\.tmp|db\.enc\.tmp\.[a-f0-9]{8}\.part)$/);
  sweep(path.join(backupDir, "uploads"), /\.enc\.[a-f0-9]{8}\.part$/); sweep(path.join(backupDir, "uploads", "d"), /\.enc\.[a-f0-9]{8}\.part$/);
}
function plan(opts) {
  const secret = backupKey();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const kind = opts.kind || "manual";
  const base = "zencrevia-" + (kind === "manual" ? "" : kind + "-") + stamp();
  const encrypted = path.join(BACKUP_DIR, base + ".db.enc");
  return { kind, encrypted, job: { plain: path.join(BACKUP_DIR, base + ".tmp.db"), sealed: encrypted + ".tmp", secret, backupDir: BACKUP_DIR } };
}
/* the sidecar first, then the file under its name: a backup is never listed (or pruned) half-written */
function finish(p, opts, out) {
  const name = path.basename(p.encrypted), kind = p.kind, verified = out.verified;
  const meta = writeMeta(name, {
    name, kind, createdAt: new Date().toISOString(), createdBy: opts.userId || null,
    reason: opts.reason || null, checksum: out.checksum,
    integrity: { ok: !!verified.ok, tables: verified.tables }, tables: verified.tables,
    bytes: out.bytes, uploads: out.files
  });
  fs.renameSync(p.job.sealed, p.encrypted);
  /* a pre-restore/pre-import safety copy must never be pruned away by the
     very operation it exists to protect */
  if (kind === "manual" || kind === "scheduled") prune(opts.settings);
  return Object.assign({ name, bytes: meta.bytes, createdAt: meta.createdAt, encrypted: true, kind, checksum: meta.checksum }, verified);
}
function discard(p) {
  for (const f of [p.job.sealed, p.job.plain]) { try { fs.unlinkSync(f); } catch {} }
  const dir = path.dirname(p.job.sealed), stem = path.basename(p.job.sealed) + ".";
  try { fs.readdirSync(dir).filter(n => n.startsWith(stem) && n.endsWith(".part")).forEach(n => { try { fs.unlinkSync(path.join(dir, n)); } catch {} }); } catch {}
}
/* On the calling thread: the command line, and the safety copies a restore or an import takes, which must hold
   exactly what the next step replaces (nothing may be written in between). */
function create(db, opts) {
  opts = opts || {};
  const p = plan(opts);
  let out; try { out = runJob(p.job, db); } catch (e) { discard(p); throw e; }
  return finish(p, opts, out);
}
/* Oct 2026: a manual or scheduled backup held the server for its whole run — half a second at a 36 MB database, and
   about 30 ms more per picture it mirrored. Now its work runs in a worker thread (server/backup-worker.js) on a
   connection of its own; the server goes on answering meanwhile. Same files, same sidecar, same answer as create().
   One runs at a time, in the order asked; idle() is when the last one asked has finished. */
let queue = Promise.resolve();
function createInBackground(db, opts) {
  opts = opts || {};
  const run = queue.then(() => createAsync(db, opts));
  queue = run.then(() => {}, () => {});
  return run;
}
function idle() { return queue; }
function dbFileOf(db) { try { const main = db.prepare("PRAGMA database_list").all().find(r => r.name === "main"); return main && main.file ? main.file : null; } catch { return null; } }
async function createAsync(db, opts) {
  const p = plan(opts), file = dbFileOf(db);
  let out;
  try { out = file ? await inWorker(Object.assign({ task: "backup", dbFile: file }, p.job)) : runJob(p.job, db); }   /* an in-memory database has no file a worker could open */
  catch (e) { discard(p); throw e; }
  return finish(p, opts, out);
}
/* The checksum of each stored backup, worked out in a worker: GET /api/backups re-reads every one of them. */
async function verifyManyInBackground(names) {
  if (!names.length) return [];
  return inWorker({ task: "verify", names });
}
function inWorker(job) {
  const { Worker } = require("worker_threads");
  return new Promise((resolve, reject) => {
    let settled = false;
    const w = new Worker(path.join(__dirname, "backup-worker.js"), { workerData: Object.assign({ backupDir: BACKUP_DIR, dataDir: path.dirname(require("./uploads").UPLOAD_DIR) }, job) });
    w.once("message", m => { settled = true; if (m && m.ok) resolve(m.result); else reject(new Error((m && m.error) || "The backup did not finish")); });
    w.once("error", e => { if (!settled) { settled = true; reject(e); } });
    w.once("exit", code => { if (!settled) { settled = true; reject(new Error("The backup did not finish (worker exited " + code + ")")); } });
  });
}
function restore(source, destination) {
  backupKey();
  if (process.env.COS_CONFIRM_RESTORE !== "YES") throw new Error("Set COS_CONFIRM_RESTORE=YES before restoring a backup");
  const src = path.resolve(source), dest = path.resolve(destination), tmp = dest + ".restore.tmp"; let previous = null;
  if (!src.startsWith(path.resolve(BACKUP_DIR) + path.sep)) throw new Error("Backup must be inside COS_BACKUP_DIR");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    decryptFile(src, tmp); verifyDatabase(tmp);
    if (fs.existsSync(dest)) { previous = dest + ".before-restore-" + stamp(); fs.renameSync(dest, previous); }
    try { fs.renameSync(tmp, dest); }
    catch (e) { if (previous && !fs.existsSync(dest)) fs.renameSync(previous, dest); throw e; }
    for (const suffix of ["-wal", "-shm"]) { try { fs.unlinkSync(dest + suffix); } catch {} }
    return { ok: true, restored: dest, previous };
  } finally { try { fs.unlinkSync(tmp); } catch {} }
}

/* §P1-5 the safe path the Admin UI uses.
     current  → take a pre-restore safety backup
              → stage the chosen backup and validate it
              → swap it in
     on failure at any point → roll the previous database back and report why.
   The caller does not need COS_CONFIRM_RESTORE: taking the safety backup first
   is what makes the operation reversible, and the UI confirms explicitly. */
function safeRestore(db, name, destination, opts) {
  opts = opts || {};
  backupKey();
  const source = path.join(BACKUP_DIR, path.basename(String(name || "")));
  if (!source.startsWith(path.resolve(BACKUP_DIR) + path.sep) && path.resolve(source) !== path.resolve(BACKUP_DIR, path.basename(source)))
    throw new Error("Backup must be inside the backup directory");
  if (!fs.existsSync(source)) throw new Error("That backup no longer exists");

  const integrity = verifyStored(path.basename(source));
  if (!integrity.ok) throw new Error("Refusing to restore: " + integrity.detail);

  const dest = path.resolve(destination), tmp = dest + ".restore.tmp";
  let safety = null, previous = null, databaseClosed = false, reopened = null, failedCopy = null;
  const closeDatabase = typeof opts.closeDatabase === "function"
    ? opts.closeDatabase
    : function (handle) { if (handle && typeof handle.close === "function") handle.close(); };
  const reopenDatabase = typeof opts.reopenDatabase === "function" ? opts.reopenDatabase : null;
  function reopen() {
    if (!databaseClosed || !reopenDatabase) return null;
    reopened = reopenDatabase();
    databaseClosed = false;
    return reopened;
  }
  try {
    /* 1 · safety backup of what is live right now */
    if (db) { try { safety = create(db, { kind: "pre-restore", userId: opts.userId, reason: "Safety copy taken before restoring " + path.basename(source) }); } catch (e) { throw new Error("Could not take the pre-restore safety backup: " + e.message); } }
    /* 2 · stage and validate before touching the live file */
    decryptFile(source, tmp);
    verifyDatabase(tmp);
    /* 3 · close and swap. Windows will not rename an open SQLite database.
       Checkpoint first so the rollback file is self-contained, then close only
       after the safety copy and staged backup have both been validated. */
    if (db) {
      try { db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch {}
      closeDatabase(db);
      databaseClosed = true;
    }
    for (const suffix of ["-wal", "-shm"]) { try { fs.unlinkSync(dest + suffix); } catch {} }
    if (fs.existsSync(dest)) { previous = dest + ".before-restore-" + stamp(); fs.renameSync(dest, previous); }
    fs.renameSync(tmp, dest);
    verifyDatabase(dest);
    reopen();
    audit({ action: "restore", result: "ok", backup: path.basename(source), safetyBackup: safety && safety.name, userId: opts.userId || null });
    /* v36: the replaced database was left beside the live one as an unencrypted copy that was
       never cleaned up. The encrypted safety backup already holds it, so remove the plaintext. */
    let previousRemoved = false;
    if (previous && safety && fs.existsSync(previous)) { try { fs.unlinkSync(previous); for (const x of ["-wal", "-shm"]) { try { fs.unlinkSync(previous + x); } catch {} } previousRemoved = true; } catch {} }
    return { ok: true, restored: dest, safetyBackup: safety && safety.name, previous: previousRemoved ? null : previous, integrity, restartRequired: !reopenDatabase };
  } catch (e) {
    /* 4 · rollback: put the previous database back exactly where it was */
    let rolledBack = false;
    try {
      if (previous && fs.existsSync(previous)) {
        if (reopened && typeof reopened.close === "function") { try { reopened.close(); } catch {} reopened = null; databaseClosed = true; }
        if (fs.existsSync(dest)) {
          failedCopy = dest + ".failed-restore-" + stamp();
          fs.renameSync(dest, failedCopy);
        }
        fs.renameSync(previous, dest);
        rolledBack = true;
      }
    } catch {}
    /* Whether the swap failed before or after replacing the file, leave the
       caller with a usable handle whenever it supplied a reopen callback. */
    if (databaseClosed && reopenDatabase) {
      try { reopen(); } catch (reopenError) { e.message += " — the database could not be reopened: " + reopenError.message; }
    }
    try { fs.unlinkSync(tmp); } catch {}
    audit({ action: "restore", result: "failed", backup: path.basename(source), error: e.message, rolledBack, failedCopy, safetyBackup: safety && safety.name, userId: opts.userId || null });
    const err = new Error(e.message + (rolledBack ? " — the previous database was rolled back." : safety ? " — nothing was replaced; the safety backup is " + safety.name + "." : ""));
    err.rolledBack = rolledBack; err.safetyBackup = safety && safety.name; err.failedCopy = failedCopy;
    throw err;
  } finally { try { fs.unlinkSync(tmp); } catch {} }
}
function remove(name) {
  const file = path.join(BACKUP_DIR, path.basename(String(name || "")));
  if (!fs.existsSync(file)) throw new Error("That backup no longer exists");
  fs.unlinkSync(file);
  try { fs.unlinkSync(metaPath(path.basename(file))); } catch {}
  return { ok: true };
}
module.exports = { create, createInBackground, idle, runJob, verifyManyInBackground, list, restore, safeRestore, remove, verifyDatabase, verifyStored, encryptFile, decryptFile, readMeta, audit, auditLog, retention, BACKUP_DIR, KEEP };

if (require.main === module) {
  const mode = process.argv[2] || "backup";
  if (mode === "backup") {
    const { open } = require("./db"); const db = open(); try { console.log(JSON.stringify(create(db), null, 2)); } finally { db.close(); }
  } else if (mode === "restore") {
    const { DB_PATH } = require("./db"); if (!process.argv[3]) throw new Error("Usage: node server/backup.js restore <backup-file>"); console.log(JSON.stringify(restore(process.argv[3], DB_PATH), null, 2));
  } else throw new Error("Unknown backup command");
}
