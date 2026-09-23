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
function encryptFile(source, target) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), key = crypto.scryptSync(backupKey(), salt, 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv), plain = fs.readFileSync(source);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  fs.writeFileSync(target, Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), encrypted]), { mode: 0o600 });
}
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

function sha256(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
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
function create(db, opts) {
  opts = opts || {};
  backupKey();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const kind = opts.kind || "manual";
  const base = "zencrevia-" + (kind === "manual" ? "" : kind + "-") + stamp();
  const plain = path.join(BACKUP_DIR, base + ".tmp.db"), encrypted = path.join(BACKUP_DIR, base + ".db.enc");
  try {
    db.exec("VACUUM INTO '" + sqlPath(plain) + "'");
    const verified = verifyDatabase(plain);
    encryptFile(plain, encrypted);
    const name = path.basename(encrypted);
    /* v39: images live in COS_DATA_DIR/uploads; they are immutable, so an incremental encrypted
       mirror (BACKUP_DIR/uploads/<name>.enc) is enough for every database backup to be complete */
    let files = null; try { files = require("./uploads").mirror(BACKUP_DIR, encryptFile); } catch (e) { files = { error: e.message }; console.error("[backup] uploads mirror failed:", e.message); }
    const meta = writeMeta(name, {
      name, kind, createdAt: new Date().toISOString(), createdBy: opts.userId || null,
      reason: opts.reason || null, checksum: sha256(encrypted),
      integrity: { ok: !!verified.ok, tables: verified.tables }, tables: verified.tables,
      bytes: fs.statSync(encrypted).size, uploads: files
    });
    /* a pre-restore/pre-import safety copy must never be pruned away by the
       very operation it exists to protect */
    if (kind === "manual" || kind === "scheduled") prune(opts.settings);
    return Object.assign({ name, bytes: meta.bytes, createdAt: meta.createdAt, encrypted: true, kind, checksum: meta.checksum }, verified);
  } finally { try { fs.unlinkSync(plain); } catch {} }
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
module.exports = { create, list, restore, safeRestore, remove, verifyDatabase, verifyStored, encryptFile, decryptFile, readMeta, audit, auditLog, retention, BACKUP_DIR, KEEP };

if (require.main === module) {
  const mode = process.argv[2] || "backup";
  if (mode === "backup") {
    const { open } = require("./db"); const db = open(); try { console.log(JSON.stringify(create(db), null, 2)); } finally { db.close(); }
  } else if (mode === "restore") {
    const { DB_PATH } = require("./db"); if (!process.argv[3]) throw new Error("Usage: node server/backup.js restore <backup-file>"); console.log(JSON.stringify(restore(process.argv[3], DB_PATH), null, 2));
  } else throw new Error("Unknown backup command");
}
