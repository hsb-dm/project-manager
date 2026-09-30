/* Importing a JSON snapshot (server/importer.js) against a real database with the full schema.
   The promises worth pinning: a preview writes nothing, nothing is ever deleted, existing items are
   skipped unless updating was chosen, secrets and consent never arrive, members are only ever added
   and never as admins, and a failure part-way leaves the workspace exactly as it was. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");

function fresh() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zcv-imp-"));
  process.env.COS_DATA_DIR = dir;
  process.env.COS_DB_PATH = path.join(dir, "t.db");
  process.env.COS_SECRET_KEY = "k".repeat(40);
  ["../server/db.js", "../server/serialize.js", "../server/uploads.js", "../server/filestore.js", "../server/secrets.js", "../server/importer.js"].forEach(m => delete require.cache[require.resolve(m)]);
  const dbm = require("../server/db.js"), sz = require("../server/serialize.js");
  const db = dbm.open();
  db.prepare("INSERT INTO workspaces (id,name) VALUES ('ws','Here')").run();
  db.prepare("INSERT INTO users (id,name,email) VALUES ('admin','Admin','admin@here.test')").run();
  /* every real workspace is seeded with these; member roles are foreign keys to them */
  db.prepare("INSERT INTO roles (id,workspace_id,name,is_system) VALUES ('admin','ws','Admin',1),('member','ws','Member',1)").run();
  const calls = { check: 0, validate: 0 };
  const deps = {
    db, wsId: "ws", sz, tx: dbm.tx,
    uploads: require("../server/uploads.js"), filestore: require("../server/filestore.js"),
    validTaskId: require("../server/security.js").validTaskId,
    checkStoredFiles: () => { calls.check++; }, validateStoredFiles: () => { calls.validate++; },
    validateDependencies: () => {}, userIdFor: require("../server/auth.js").userIdFor
  };
  const imp = require("../server/importer.js").makeImporter(deps);
  return { db, sz, imp, calls, dir };
}
/* a workspace document writeWorkspace accepts, with two stages */
function wsDoc(extra) {
  return Object.assign({ name: "Here", logo: "HE", workingDays: [1, 2, 3, 4, 5], theme: { accent: "#2F5BFF" }, brand: {}, briefFields: [], notifPrefs: {}, autoHide: {}, labels: [], taskFields: [], briefTemplates: [], customFields: [], tags: [], cloud: [],
    ai: { image: { provider: "magnific", endpoint: "https://api.magnific.com/v1", key: "sk-real-secret" }, processing: { externalEnabled: false } },
    workflow: [{ id: "todo", name: "To Do", kind: "queue" }, { id: "done", name: "Done", kind: "closed" }] }, extra || {});
}
function seed(ctx) {
  ctx.sz.writeWorkspace(ctx.db, "ws", wsDoc());
  ctx.sz.writeProject(ctx.db, "ws", { id: "p1", name: "Local project", startDate: "2026-09-01", dueDate: "2026-12-01", milestones: [], teams: [], team: [], tags: [] });
  ctx.sz.writeTask(ctx.db, "ws", task("T-101", "Local task, must survive"), "admin");
}
function task(id, title, extra) {
  return Object.assign({ id, title, proj: "p1", status: "todo", prio: "medium", assignee: "admin", assignees: ["admin"], reviewers: [], dueDate: "2026-10-10", startDate: "2026-10-09", createdAt: "2026-09-30T00:00:00.000Z",
    versions: [], files: [], comments: [], activity: [], tags: [], labels: [], dependencies: [], custom: {} }, extra || {});
}
const count = (db, t) => db.prepare("SELECT count(*) n FROM " + t).get().n;
const snap = (data, sections, conflict) => ({ sections, conflict: conflict || "skip", data: Object.assign({ ws: {}, teams: [], people: [], projects: [], tasks: [], requests: [], folders: [], assets: [], pages: [], knowledgeFolders: [], views: [] }, data) });

test("a preview writes nothing", () => {
  const c = fresh(); seed(c);
  const before = ["tasks", "projects", "task_statuses", "users"].map(t => count(c.db, t));
  const r = c.imp.preview(snap({ tasks: [task("T-500", "From the file")], ws: { name: "Renamed", workflow: [{ id: "review", name: "Review", kind: "review" }] } }, ["projects", "identity", "workflow"]), "admin");
  assert.equal(r.sections.projects.tasks.added, 1);
  assert.deepEqual(r.sections.identity.changes, ["name"]);
  assert.deepEqual(["tasks", "projects", "task_statuses", "users"].map(t => count(c.db, t)), before, "no row added or changed");
  assert.equal(c.sz.readWorkspace(c.db, "ws").name, "Here");
  assert.equal(c.calls.validate, 0, "the preview never moved an image to disk");
});

test("existing items are skipped by default, and new ones are added", () => {
  const c = fresh(); seed(c);
  const r = c.imp.apply(snap({ tasks: [task("T-101", "Different work, same id"), task("T-500", "New from the file")] }, ["projects"]), "admin");
  assert.deepEqual(r.sections.projects.tasks, { added: 1, updated: 0, skipped: 1 });
  assert.equal(c.sz.readTask(c.db, "T-101").title, "Local task, must survive", "same id, different work: left alone");
  assert.equal(c.sz.readTask(c.db, "T-500").title, "New from the file");
});

test("updating replaces an existing item only when asked", () => {
  const c = fresh(); seed(c);
  const r = c.imp.apply(snap({ tasks: [task("T-101", "Restored title")] }, ["projects"], "update"), "admin");
  assert.deepEqual(r.sections.projects.tasks, { added: 0, updated: 1, skipped: 0 });
  assert.equal(c.sz.readTask(c.db, "T-101").title, "Restored title");
});

test("nothing is deleted: stages and tasks missing from the file stay", () => {
  const c = fresh(); seed(c);
  c.imp.apply(snap({ ws: { workflow: [{ id: "review", name: "Review", kind: "review" }] }, tasks: [] }, ["workflow", "projects"]), "admin");
  const stages = c.sz.readWorkspace(c.db, "ws").workflow.map(s => s.id);
  assert.deepEqual(stages, ["review", "todo", "done"], "the file's stage first, then the ones only this workspace has");
  assert.ok(c.sz.readTask(c.db, "T-101"), "the task still has its stage and still exists");
});

test("only the chosen sections change", () => {
  const c = fresh(); seed(c);
  c.imp.apply(snap({ ws: { name: "Renamed", ai: { promptRules: "Brand voice: warm" } }, tasks: [task("T-500", "Should not arrive")] }, ["ai"]), "admin");
  const ws = c.sz.readWorkspace(c.db, "ws");
  assert.equal(ws.name, "Here", "identity was not chosen");
  assert.equal(c.sz.readTask(c.db, "T-500"), null, "projects were not chosen");
});

test("AI settings arrive without keys and without the processing consent", () => {
  const c = fresh(); seed(c);
  const r = c.imp.apply(snap({ ws: { ai: {
    image: { provider: "openai", endpoint: "https://attacker.example/v1", key: "sk-from-the-file" },
    processing: { externalEnabled: true, workspaceContextEnabled: true }
  } } }, ["ai"]), "admin");
  const raw = c.sz.readAIRaw(c.db, "ws");
  assert.equal(require("../server/secrets.js").decrypt(raw.image.key), "sk-real-secret", "the stored key is untouched");
  assert.equal(raw.processing.externalEnabled, false, "consent is given in Settings, never by a file");
  assert.ok(r.warnings.some(w => /attacker\.example/.test(w)), "a changed AI address is called out");
  assert.ok(r.warnings.some(w => /consent is not imported/.test(w)));
});

test("members are only added: existing accounts untouched, nobody made admin, no password", () => {
  const c = fresh(); seed(c);
  const r = c.imp.apply(snap({ people: [
    { id: "admin", name: "Imposter", email: "ADMIN@here.test", perm: "admin" },     /* existing email */
    { id: "boss", name: "Boss", email: "boss@there.test", perm: "admin", password: "x" },
    { id: "rina", name: "Rina", email: "rina@there.test", perm: "member" },
    { id: "nomail", name: "No Mail" }
  ] }, ["people"]), "admin");
  assert.deepEqual(r.sections.people.members, { added: 2, existing: 1, noEmail: 1 });
  assert.equal(c.db.prepare("SELECT name FROM users WHERE id='admin'").get().name, "Admin", "the existing account is not renamed");
  const boss = c.db.prepare("SELECT * FROM users WHERE lower(email)='boss@there.test'").get();
  assert.ok(boss, "the new member exists");
  assert.ok(!boss.password_hash, "and has no password");
  const perm = c.sz.readPeople(c.db, "ws")[boss.id].perm;
  assert.notEqual(perm, "admin", "a file cannot make anyone an admin");
  assert.ok(r.warnings.some(w => /arrive as members/.test(w)));
});

test("two new members with the same name, or the same email twice, never collide", () => {
  const c = fresh(); seed(c);
  const r = c.imp.apply(snap({ people: [
    { name: "Sam Lee", email: "sam1@there.test" }, { name: "Sam Lee", email: "sam2@there.test" }, { name: "Sam Again", email: "SAM1@there.test" }
  ] }, ["people"]), "admin");
  assert.deepEqual(r.sections.people.members, { added: 2, existing: 1, noEmail: 0 });
  const rows = c.db.prepare("SELECT id, email FROM users WHERE email LIKE 'sam%'").all();
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].id, rows[1].id);
});

test("previews pointing at another server's files are dropped and counted, not fatal", () => {
  const c = fresh(); seed(c);
  const t = task("T-600", "With foreign previews", { files: [{ id: "f1", name: "a.png", url: "", preview: "/files/" + "b".repeat(64) + ".png" }], versions: [{ n: 1, img: "/files/" + "c".repeat(64) + ".jpg", status: "pending" }] });
  const r = c.imp.apply(snap({ tasks: [t] }, ["projects"]), "admin");
  assert.equal(r.sections.projects.tasks.added, 1);
  assert.ok(r.warnings.some(w => /^2 image preview/.test(w)), r.warnings.join(" | "));
});

test("the same id twice in one file is written once", () => {
  const c = fresh(); seed(c);
  const r = c.imp.apply(snap({ tasks: [task("T-700", "First"), task("T-700", "Second")] }, ["projects"]), "admin");
  assert.deepEqual(r.sections.projects.tasks, { added: 1, updated: 0, skipped: 1 });
  assert.equal(c.sz.readTask(c.db, "T-700").title, "First");
});

test("a failure part-way leaves the workspace exactly as it was", () => {
  const c = fresh(); seed(c);
  const before = count(c.db, "tasks");
  /* the second task has an id the server refuses, which is caught before anything is written */
  assert.throws(() => c.imp.apply(snap({ ws: { name: "Renamed" }, tasks: [task("T-800", "Fine"), task("bad id!", "Refused")] }, ["identity", "projects"]), "admin"), /id this server does not accept/);
  assert.equal(count(c.db, "tasks"), before);
  assert.equal(c.sz.readWorkspace(c.db, "ws").name, "Here", "the rename did not happen either");
});

test("a write that fails inside the transaction rolls back everything before it", () => {
  const c = fresh(); seed(c);
  const before = count(c.db, "tasks");
  const real = c.sz.writeTask;
  let n = 0; c.sz.writeTask = function () { if (++n === 2) throw new Error("disk full"); return real.apply(this, arguments); };
  try {
    assert.throws(() => c.imp.apply(snap({ tasks: [task("T-901", "One"), task("T-902", "Two")] }, ["projects"]), "admin"), /disk full/);
  } finally { c.sz.writeTask = real; }
  assert.equal(count(c.db, "tasks"), before, "T-901 was rolled back with the failed T-902");
});

test("an import with no section chosen is refused", () => {
  const c = fresh(); seed(c);
  assert.throws(() => c.imp.preview(snap({}, []), "admin"), /at least one part/);
});

test("the server takes a safety backup before an import, and asks when it cannot", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "server", "server.js"), "utf8");
  /* up to the audit log line: the route's own body contains "});" inside backups.create(...) */
  const start = src.indexOf('route("POST", "/api/admin/import",');
  const route = src.slice(start, src.indexOf('security.log("data_imported"', start));
  assert.ok(route.indexOf('kind: "pre-import"') > 0 && route.indexOf('kind: "pre-import"') < route.indexOf("importer.apply("), "the backup comes before the import");
  assert.match(route, /confirmNoBackup !== true/);
  assert.match(src, /forbid\(can\.manageWorkspace\(u\), "import data"\)/);
  assert.match(src, /forbid\(can\.manageMembers\(u\), "import members"\)/);
});

test("a member pointing at a team or role that does not exist here cannot abort the import", () => {
  const c = fresh(); seed(c);
  const r = c.imp.apply(snap({
    teams: [{ id: "design", name: "Design" }],
    people: [{ name: "Dewi", email: "dewi@there.test", perm: "art-director", teams: [["design", true], ["ghost-team", false]] }]
  }, ["people"]), "admin");
  assert.equal(r.sections.people.members.added, 1);
  const dewi = c.db.prepare("SELECT id FROM users WHERE email='dewi@there.test'").get();
  const teams = c.db.prepare("SELECT team_id FROM team_memberships WHERE user_id=?").all(dewi.id).map(x => x.team_id);
  assert.deepEqual(teams, ["design"], "the link to a team that arrived is kept; the one to nowhere is dropped");
  assert.equal(c.db.prepare("SELECT role_id FROM workspace_members WHERE user_id=?").get(dewi.id).role_id, "member", "an unknown role becomes member");
});
