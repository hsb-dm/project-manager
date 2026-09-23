// SQLite via node:sqlite (Node ≥ 22.13). Swap this module for a pg/Prisma adapter to run on PostgreSQL (db/schema.postgres.sql).
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.COS_DATA_DIR || path.join(__dirname, "..", "data");
const DB_PATH = process.env.COS_DB_PATH || path.join(DATA_DIR, "creative-os.db");

function open() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(DB_PATH);
  /* v36: the database, its WAL, logs and backups hold everything; keep them owner-only
     (they were created world-readable, 0644). Best effort — ignored where chmod is not
     meaningful (e.g. Windows). busy_timeout lets a backup and a write wait instead of failing. */
  if (process.platform !== "win32") { try { fs.chmodSync(path.dirname(DB_PATH), 0o700); } catch {} for (const f of [DB_PATH, DB_PATH + "-wal", DB_PATH + "-shm"]) { try { fs.chmodSync(f, 0o600); } catch {} } }
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8"));
  // migrations for databases created before a column existed (CREATE TABLE IF NOT EXISTS never adds one)
  [
    "ALTER TABLE tasks ADD COLUMN asset_count INTEGER DEFAULT 0",
    "ALTER TABLE tasks ADD COLUMN labels TEXT",
    "ALTER TABLE workspaces ADD COLUMN labels TEXT DEFAULT '[]'",
    "ALTER TABLE workspaces ADD COLUMN task_fields TEXT DEFAULT '[]'",
    "ALTER TABLE workspaces ADD COLUMN auto_hide TEXT DEFAULT '{}'",
    "ALTER TABLE workspaces ADD COLUMN ai_settings TEXT DEFAULT '{}'",
    "ALTER TABLE file_versions ADD COLUMN drive_url TEXT",
    "ALTER TABLE file_versions ADD COLUMN drive_id TEXT",
    /* v17 §7.5/§7.7 — tags gain a manual order and an archive flag.
       They deliberately gain NO colour column: Tags have no colours (§1). */
    "ALTER TABLE tags ADD COLUMN sort_order INTEGER DEFAULT 0",
    "ALTER TABLE tags ADD COLUMN archived INTEGER DEFAULT 0",
    /* v17 §P1-4 SMTP is configured from the Admin dashboard, not only env. */
    "ALTER TABLE workspaces ADD COLUMN smtp_settings TEXT DEFAULT '{}'",
    /* v17 §P1-5 backup history needs durable metadata, not just file mtimes. */
    "ALTER TABLE workspaces ADD COLUMN backup_settings TEXT DEFAULT '{}'",
    "ALTER TABLE knowledge_pages ADD COLUMN translations TEXT DEFAULT '{}'",
    /* v33 review gate: who may move a task INTO a stage, and whether a reviewer must be set.
       NULL means "use the default for this kind of stage" (see serialize.stageRules). */
    "ALTER TABLE task_statuses ADD COLUMN reviewer_only INTEGER",
    "ALTER TABLE task_statuses ADD COLUMN require_reviewer INTEGER",
  ].forEach((sql) => { try { db.exec(sql); } catch { /* already there */ } });
  return db;
}
function tx(db, fn) { db.exec("BEGIN"); try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; } }
const uid = (p) => (p || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const now = () => new Date().toISOString();
const J = (v, d) => { if (v == null || v === "") return d; try { return JSON.parse(v); } catch { return d; } };
const S = (v) => JSON.stringify(v == null ? null : v);

module.exports = { open, tx, uid, now, J, S, DB_PATH };
