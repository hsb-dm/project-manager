/* v17 §P1-4 / §P1-5 — SMTP configuration and the safe-restore backup flow.
   These exercise the real modules against a temporary data directory. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zcv-"));
  process.env.COS_DATA_DIR = dir;
  process.env.COS_BACKUP_DIR = path.join(dir, "backups");
  process.env.COS_BACKUP_KEY = "x".repeat(40);
  delete require.cache[require.resolve("../server/backup.js")];
  return { dir, backups: require("../server/backup.js") };
}
function tinyDb(file, rows) {
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE IF NOT EXISTS marker (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO marker (note) VALUES (?)").run(rows);
  return db;
}

test("a backup records who made it, why, and a checksum that can be re-verified", () => {
  const { dir, backups } = sandbox();
  const db = tinyDb(path.join(dir, "live.db"), "original");
  const made = backups.create(db, { kind: "manual", userId: "zein", reason: "before the migration" });
  assert.ok(made.name.endsWith(".db.enc"));
  assert.match(made.checksum, /^[a-f0-9]{64}$/);

  const listed = backups.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].createdBy, "zein");
  assert.equal(listed[0].reason, "before the migration");
  assert.equal(listed[0].kind, "manual");
  assert.equal(backups.verifyStored(made.name).status, "verified");

  /* tampering with the stored file must be detected, not silently restored */
  const file = path.join(backups.BACKUP_DIR, made.name);
  const raw = fs.readFileSync(file); raw[raw.length - 1] ^= 0xff; fs.writeFileSync(file, raw);
  const after = backups.verifyStored(made.name);
  assert.equal(after.ok, false);
  assert.equal(after.status, "corrupt");
  db.close();
});

test("restore takes a pre-restore safety backup first and swaps the database in", () => {
  const { dir, backups } = sandbox();
  const live = path.join(dir, "live.db");
  let db = tinyDb(live, "version-one");
  const snapshot = backups.create(db, { kind: "manual", userId: "zein" });

  /* move the live database on to a second state */
  db.prepare("UPDATE marker SET note=?").run("version-two");
  db.close();
  db = new DatabaseSync(live);
  assert.equal(db.prepare("SELECT note FROM marker").get().note, "version-two");

  let active = db;
  const r = backups.safeRestore(db, snapshot.name, live, {
    userId: "zein",
    closeDatabase(handle) { handle.close(); },
    reopenDatabase() { active = new DatabaseSync(live); return active; }
  });
  assert.equal(r.ok, true);
  assert.equal(r.restartRequired, false);
  assert.ok(r.safetyBackup, "a pre-restore safety backup must be created");

  const safety = backups.list().filter(b => b.name === r.safetyBackup)[0];
  assert.equal(safety.kind, "pre-restore");

  assert.equal(active.prepare("SELECT note FROM marker").get().note, "version-one");
  active.close();

  const log = backups.auditLog();
  assert.equal(log[0].action, "restore");
  assert.equal(log[0].result, "ok");
  assert.equal(log[0].userId, "zein");
});

test("the server restore route closes and reopens SQLite without asking for a restart", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "server", "server.js"), "utf8");
  assert.match(source, /let db = open\(\)/);
  assert.match(source, /closeDatabase: \(handle\) => handle\.close\(\)/);
  assert.match(source, /reopenDatabase: \(\) =>/);
  assert.doesNotMatch(source, /Object\.assign\(\{ restartRequired: true \}, r\)/);
});

test("restore confirmation UI explains the safe flow and prevents duplicate submissions", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "admin-ops.js"), "utf8");
  assert.match(source, /function bkRestoreConfirmState\(input\)/);
  assert.match(source, /id="bkRestoreBtn"[^>]+disabled/);
  assert.match(source, /if\(BK\.busy\) return/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /The server has already reconnected to the restored database/);
  assert.doesNotMatch(source, /Restart the server now so it reopens the restored database/);
});

test("a corrupt backup is refused before the live database is touched", () => {
  const { dir, backups } = sandbox();
  const live = path.join(dir, "live.db");
  const db = tinyDb(live, "must-survive");
  const snapshot = backups.create(db, { kind: "manual" });

  const file = path.join(backups.BACKUP_DIR, snapshot.name);
  const raw = fs.readFileSync(file); raw[40] ^= 0xff; fs.writeFileSync(file, raw);

  assert.throws(() => backups.safeRestore(db, snapshot.name, live, {}), /Refusing to restore/);

  /* the live database is untouched and still readable */
  const reopened = new DatabaseSync(live, { readOnly: true });
  assert.equal(reopened.prepare("SELECT note FROM marker").get().note, "must-survive");
  reopened.close();
  assert.equal(backups.auditLog().length, 0, "a refused restore never reaches the audit trail as an attempt on the file");
});

test("retention prunes old backups but never a safety copy", () => {
  const { dir, backups } = sandbox();
  const db = tinyDb(path.join(dir, "live.db"), "x");
  const safety = backups.create(db, { kind: "pre-restore" });
  for (let i = 0; i < 6; i++) backups.create(db, { kind: "manual", settings: { keep: 3 } });
  const names = backups.list().map(b => b.name);
  assert.ok(names.includes(safety.name), "the safety copy must survive pruning");
  assert.ok(backups.list().filter(b => b.kind === "manual").length <= 4);
  db.close();
});

test("SMTP settings round-trip without ever returning the password", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zcv-sz-"));
  const db = new DatabaseSync(path.join(dir, "t.db"));
  db.exec("CREATE TABLE workspaces (id TEXT PRIMARY KEY, smtp_settings TEXT)");
  db.prepare("INSERT INTO workspaces (id, smtp_settings) VALUES ('w','{}')").run();
  const sz = require("../server/serialize.js");
  const secrets = require("../server/secrets.js");

  const saved = sz.writeSmtp(db, "w", {
    enabled: true, provider: "gmail", host: "smtp.gmail.com", port: 587, secure: false,
    user: "ops@hsb.co.id", pass: "app-password-here", fromName: "HSB", fromEmail: "no-reply@hsb.co.id"
  }, secrets, "zein");

  assert.equal(saved.host, "smtp.gmail.com");
  assert.equal(saved.passSet, true);
  assert.equal(saved.pass, undefined, "the password must never be returned to a client");
  assert.equal(saved.updatedBy, "zein");

  /* the runtime view decrypts for the mailer only */
  assert.equal(sz.smtpRuntime(db, "w", secrets).pass, "app-password-here");

  /* a blank password keeps the stored one; "clear" removes it */
  sz.writeSmtp(db, "w", { host: "smtp.gmail.com", fromEmail: "no-reply@hsb.co.id", pass: "" }, secrets, "zein");
  assert.equal(sz.smtpRuntime(db, "w", secrets).pass, "app-password-here");
  sz.writeSmtp(db, "w", { host: "smtp.gmail.com", fromEmail: "no-reply@hsb.co.id", pass: "clear" }, secrets, "zein");
  assert.equal(sz.readSmtp(db, "w").passSet, false);

  /* disabled config must not be handed to the mailer */
  sz.writeSmtp(db, "w", { enabled: false }, secrets, "zein");
  assert.equal(sz.smtpRuntime(db, "w", secrets), null);
  db.close();
});

test("the mailer prefers a dashboard config over the environment, and reverts cleanly", () => {
  const mailer = require("../server/mailer.js");
  assert.equal(mailer.activeConfig().source, "environment");
  mailer.setStoredConfig({ enabled: true, host: "smtp.example.com", port: 587, secure: false, user: "u", pass: "p", fromName: "HSB", fromEmail: "no-reply@hsb.co.id" });
  const active = mailer.activeConfig();
  assert.equal(active.source, "dashboard");
  assert.equal(active.transport, "smtp");
  assert.equal(active.from, "HSB <no-reply@hsb.co.id>");
  mailer.setStoredConfig(null);
  assert.equal(mailer.activeConfig().source, "environment");
});

test("§P1-1 the server resolves models from the registry and refuses anything else", () => {
  const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
  const src = fs.readFileSync(path.join(__dirname, "../server/server.js"), "utf8");
  const start = src.indexOf("const aiResolveRegistryModel");
  const slice = src.slice(start, src.indexOf("\n};", start) + 3);
  const exposed = slice + "\nthis.aiResolveRegistryModel = aiResolveRegistryModel;";

  const models = [
    { id: "m_a", name: "GPT Image 2", modelId: "gpt-image-2", provider: "openai", active: true, isDefault: true },
    { id: "m_b", name: "Nano Banana Pro", modelId: "gemini-3-pro-image", provider: "gemini", active: true },
    { id: "m_off", name: "Fast Image", modelId: "fast", provider: "openai", active: false }
  ];
  const ctx = { db: {}, WS_ID: "w", sz: { readAIRaw: () => ({ models }) },
    HttpError: class extends Error { constructor(code, msg) { super(msg); this.status = code; } } };
  vm.createContext(ctx); vm.runInContext(exposed, ctx);

  /* an omitted id falls back to the registered default */
  assert.equal(ctx.aiResolveRegistryModel(null).modelId, "gpt-image-2");
  /* an active model resolves to its real provider id */
  assert.equal(ctx.aiResolveRegistryModel("m_b").modelId, "gemini-3-pro-image");
  /* a DISABLED model is not available to a user */
  assert.throws(() => ctx.aiResolveRegistryModel("m_off"), /not available in this workspace/);
  /* an invented id — the exact thing free-text model entry used to allow */
  assert.throws(() => ctx.aiResolveRegistryModel("gpt-4o-secret"), /not available in this workspace/);

  /* with every model disabled the request is refused rather than guessed */
  const none = { db: {}, WS_ID: "w", sz: { readAIRaw: () => ({ models: [{ id: "x", active: false }] }) }, HttpError: ctx.HttpError };
  vm.createContext(none); vm.runInContext(exposed, none);
  assert.throws(() => none.aiResolveRegistryModel(null), /No AI model is active/);

  /* a workspace that never configured a registry keeps working (null = legacy path) */
  const legacy = { db: {}, WS_ID: "w", sz: { readAIRaw: () => ({}) }, HttpError: ctx.HttpError };
  vm.createContext(legacy); vm.runInContext(exposed, legacy);
  assert.equal(legacy.aiResolveRegistryModel("anything"), null);
});
