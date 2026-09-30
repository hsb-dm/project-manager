/* Bilingual names for workflow stages and custom fields (server/serialize.js), against a real
   database with the full schema. English stays in name, Indonesian in name_id, and the one left
   empty follows the other. Also pins the custom-field display mode, which was never saved. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");

function fresh() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zcv-bi-"));
  process.env.COS_DATA_DIR = dir;
  process.env.COS_DB_PATH = path.join(dir, "t.db");
  ["../server/db.js", "../server/serialize.js"].forEach(m => delete require.cache[require.resolve(m)]);
  const { open } = require("../server/db.js"), sz = require("../server/serialize.js");
  const db = open();
  db.prepare("INSERT INTO workspaces (id,name) VALUES ('ws','Test')").run();
  return { db, sz };
}
/* the smallest workspace document writeWorkspace accepts */
function doc(extra) {
  return Object.assign({ name: "Test", logo: "TS", workingDays: [1, 2, 3, 4, 5], theme: {}, brand: {}, briefFields: [], notifPrefs: {}, autoHide: {}, ai: {}, labels: [], taskFields: [], workflow: [], briefTemplates: [], customFields: [], tags: [], cloud: [] }, extra || {});
}

test("a stage keeps both names, and they come back apart", () => {
  const { db, sz } = fresh();
  sz.writeWorkspace(db, "ws", doc({ workflow: [{ id: "doing", name: "In Progress", nameId: "Sedang dikerjakan", kind: "work" }] }));
  const s = sz.readWorkspace(db, "ws").workflow[0];
  assert.equal(s.name, "In Progress");
  assert.equal(s.nameId, "Sedang dikerjakan");
});

test("a stage without an Indonesian name reads as it always did", () => {
  const { db, sz } = fresh();
  sz.writeWorkspace(db, "ws", doc({ workflow: [{ id: "todo", name: "To Do", kind: "queue" }] }));
  const s = sz.readWorkspace(db, "ws").workflow[0];
  assert.equal(s.name, "To Do");
  assert.equal(s.nameId, "", "no Indonesian name — the page falls back to English, as before");
});

test("a stage named only in Indonesian stores that name as the English one too", () => {
  const { db, sz } = fresh();
  sz.writeWorkspace(db, "ws", doc({ workflow: [{ id: "legal", name: "", nameId: "Cek legal", kind: "review" }] }));
  const s = sz.readWorkspace(db, "ws").workflow[0];
  assert.equal(s.name, "Cek legal", "name is never empty; every screen and report reads it");
  assert.equal(s.nameId, "Cek legal");
});

test("a stage with no name in either language keeps its id rather than going blank", () => {
  const { db, sz } = fresh();
  sz.writeWorkspace(db, "ws", doc({ workflow: [{ id: "mystery", name: "  ", nameId: "", kind: "work" }] }));
  assert.equal(sz.readWorkspace(db, "ws").workflow[0].name, "mystery");
});

test("custom fields keep both names too", () => {
  const { db, sz } = fresh();
  sz.writeWorkspace(db, "ws", doc({ customFields: [{ id: "c1", name: "Cost centre", nameId: "Pusat biaya", type: "text", options: [] }] }));
  const f = sz.readWorkspace(db, "ws").customFields[0];
  assert.equal(f.name, "Cost centre");
  assert.equal(f.nameId, "Pusat biaya");
});

test("a custom field's Primary / Hidden choice survives a save — it used to be dropped", () => {
  const { db, sz } = fresh();
  sz.writeWorkspace(db, "ws", doc({ customFields: [
    { id: "c1", name: "Budget", type: "number", options: [], displayMode: "primary" },
    { id: "c2", name: "Legal flag", type: "checkbox", options: [], displayMode: "hidden" },
    { id: "c3", name: "Channel", type: "text", options: [] }
  ] }));
  const fields = sz.readWorkspace(db, "ws").customFields;
  assert.deepEqual(fields.map(f => f.displayMode), ["primary", "hidden", "secondary"]);
});

test("an unknown display mode falls back instead of being stored", () => {
  const { db, sz } = fresh();
  sz.writeWorkspace(db, "ws", doc({ customFields: [{ id: "c1", name: "X", type: "text", options: [], displayMode: "<script>" }] }));
  assert.equal(sz.readWorkspace(db, "ws").customFields[0].displayMode, "secondary");
  assert.equal(db.prepare("SELECT display_mode FROM custom_fields WHERE id='c1'").get().display_mode, null);
});

test("names are tidied: control characters out, whitespace collapsed, length bounded", () => {
  const { db, sz } = fresh();
  sz.writeWorkspace(db, "ws", doc({ workflow: [{ id: "a", name: "In\tProgress\u0000", nameId: "  Sedang   dikerjakan  ", kind: "work" }] }));
  const s = sz.readWorkspace(db, "ws").workflow[0];
  assert.equal(s.name, "In Progress");
  assert.equal(s.nameId, "Sedang dikerjakan");
  sz.writeWorkspace(db, "ws", doc({ workflow: [{ id: "a", name: "x".repeat(500), kind: "work" }] }));
  assert.equal(sz.readWorkspace(db, "ws").workflow[0].name.length, 120);
});

test("existing databases gain the new columns by migration", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "server", "db.js"), "utf8");
  ["ALTER TABLE task_statuses ADD COLUMN name_id TEXT", "ALTER TABLE custom_fields ADD COLUMN name_id TEXT", "ALTER TABLE custom_fields ADD COLUMN display_mode TEXT"]
    .forEach(sql => assert.ok(src.includes(sql), sql));
});
