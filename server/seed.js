// Seeds the demo workspace from shared/demo-data.js, turning day offsets into real dates so the demo is always "today".
const { tx, uid, S } = require("./db");
const sz = require("./serialize");
const DEMO = require("../shared/demo-data");
const { DEFAULT_ROLES } = require("./permissions");
const auth = require("./auth");
const crypto = require("crypto");
const GENERATED_ADMIN_PASSWORD = !process.env.COS_ADMIN_PASSWORD;
const ADMIN_PASSWORD = process.env.COS_ADMIN_PASSWORD || ("Zc!" + crypto.randomBytes(12).toString("base64url"));
const DEMO_PASSWORD = process.env.COS_DEMO_PASSWORD || "";
const INVITE_CODE = process.env.COS_INVITE_CODE || crypto.randomBytes(8).toString("hex").toUpperCase();
const ALLOW_REGISTRATION = process.env.COS_ALLOW_REGISTRATION === "1";
/* v29: production starts from a clean workspace. Demo content is opt-in there
   (COS_SEED_DEMO=1) and opt-out in development (COS_SEED_DEMO=0). */
const SEED_DEMO = process.env.COS_SEED_DEMO != null ? process.env.COS_SEED_DEMO === "1" : process.env.NODE_ENV !== "production";
const ADMIN_NAME = String(process.env.COS_ADMIN_NAME || "Admin").trim().slice(0, 120) || "Admin";
const ADMIN_EMAIL = String(process.env.COS_ADMIN_EMAIL || (SEED_DEMO ? "admin@zencrevia.demo" : "admin@zencrevia.local")).trim().toLowerCase();
const initials = name => { const w = name.split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || "AD").slice(0, 2)).toUpperCase(); };

const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);
const dateOff = (d) => { const x = new Date(TODAY); x.setDate(x.getDate() + d); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
const agoIso = (min) => new Date(Date.now() - min * 60000).toISOString();

function runClean(db) {
  tx(db, () => {
    const ws = DEMO.ws; const W = ws.id;
    DEFAULT_ROLES.forEach((r, i) => db.prepare("INSERT OR IGNORE INTO roles (id,workspace_id,name,description,permissions,rank,is_system,sort_order) VALUES (?,?,?,?,?,?,1,?)").run(r.id, W, r.name, r.description, S(r.permissions), r.rank, i));
    db.prepare("INSERT INTO workspaces (id,name,logo,tagline,allow_registration,default_role_id,invite_code) VALUES (?,?,?,?,?,'member',?)").run(W, ws.name, ws.logo, ws.tagline, ALLOW_REGISTRATION ? 1 : 0, INVITE_CODE);
    /* Workflow stages, brief templates, custom fields and tags are configuration, not sample
       content, so a clean workspace keeps them. Cloud connections start disconnected. */
    sz.writeWorkspace(db, W, Object.assign({}, ws, { allowRegistration: ALLOW_REGISTRATION, defaultRole: "member", joinCode: INVITE_CODE, workflow: DEMO.workflow, briefTemplates: DEMO.briefTemplates, customFields: DEMO.customFields, tags: DEMO.tags, cloud: DEMO.cloud.map(c => Object.assign({}, c, { connected: false, account: "", lastSyncAt: null })) }));
    sz.writePerson(db, W, "admin", Object.assign({}, DEMO.people.admin, { name: ADMIN_NAME, ini: initials(ADMIN_NAME), email: ADMIN_EMAIL, teams: [] }));
    auth.setPassword(db, "admin", ADMIN_PASSWORD);
    sz.writeKnowledgeFolder(db, W, { id: "kf_general", name: "General", nameId: "Umum", sort: 1 });
  });
}

function run(db) {
  tx(db, () => {
    const ws = DEMO.ws; const W = ws.id;
    DEFAULT_ROLES.forEach((r, i) => db.prepare("INSERT OR IGNORE INTO roles (id,workspace_id,name,description,permissions,rank,is_system,sort_order) VALUES (?,?,?,?,?,?,1,?)").run(r.id, W, r.name, r.description, S(r.permissions), r.rank, i));
    db.prepare("INSERT INTO workspaces (id,name,logo,tagline,allow_registration,default_role_id,invite_code) VALUES (?,?,?,?,?,'member',?)").run(W, ws.name, ws.logo, ws.tagline, ALLOW_REGISTRATION ? 1 : 0, INVITE_CODE);
    sz.writeWorkspace(db, W, Object.assign({}, ws, { allowRegistration: ALLOW_REGISTRATION, defaultRole: "member", joinCode: INVITE_CODE, workflow: DEMO.workflow, briefTemplates: DEMO.briefTemplates, customFields: DEMO.customFields, tags: DEMO.tags, cloud: DEMO.cloud.map(c => Object.assign({}, c, { lastSyncAt: c.lastSync == null ? null : agoIso(c.lastSync) })) }));
    const person = (id, p) => id === "admin" ? Object.assign({}, p, { name: ADMIN_NAME, ini: initials(ADMIN_NAME), email: ADMIN_EMAIL }) : p;
    Object.entries(DEMO.people).forEach(([id, p]) => sz.writePerson(db, W, id, Object.assign({}, person(id, p), { teams: [] })));
    DEMO.teams.forEach(t => sz.writeTeam(db, W, t));
    Object.entries(DEMO.people).forEach(([id, p]) => { sz.writePerson(db, W, id, person(id, p)); if (id === "admin" || DEMO_PASSWORD) auth.setPassword(db, id, id === "admin" ? ADMIN_PASSWORD : DEMO_PASSWORD); });
    DEMO.projects.forEach(p => sz.writeProject(db, W, Object.assign({}, p, { startDate: dateOff(p.start), dueDate: dateOff(p.due), completedAt: p.status === "done" ? agoIso(Math.max(1, -p.due) * 1440) : null, milestones: p.milestones.map(m => ({ id: uid("ms"), name: m.name, dueDate: dateOff(m.due), done: m.done })) })));
    DEMO.folders.forEach((f, i) => sz.writeFolder(db, W, Object.assign({ sort: i }, f)));
    DEMO.assets.forEach(a => sz.writeAsset(db, W, Object.assign({}, a, { createdAt: agoIso(a.ago) })));
    DEMO.knowledge.forEach(k => sz.writePage(db, W, Object.assign({}, k, { updatedAt: agoIso(k.ago) })));
    [...new Set(DEMO.knowledge.map(k => k.folder))].forEach((name,i) => sz.writeKnowledgeFolder(db,W,{id:"kf_seed_"+(i+1),name,sort:i+1}));
    DEMO.savedViews.forEach(v => sz.writeView(db, W, v));
    DEMO.tasks.forEach((t, ti) => {
      t = Object.assign({}, t, { sort: (ti + 1) * 1000 }); // globally unique manual order
      const cidx = {}; const comments = t.comments.map((c, i) => { const id = "cm_" + t.id + "_" + (i + 1); cidx["c" + (i + 1)] = id; return { id, by: c.by, createdAt: agoIso(c.ago), vis: c.vis, text: c.text, parent: c.parent ? cidx[c.parent] : null, attachments: [] }; });
      const created = t.activity.find(a => a.k === "created");
      const closed = DEMO.workflow.find(s => s.id === t.status).kind === "closed";
      const doc = Object.assign({}, t, { createdBy: t.createdBy || "zein", dueDate: dateOff(t.due), startDate: dateOff(t.due - t.span), createdAt: agoIso(created ? created.ago : (t.span + 2) * 1440), completedAt: closed ? agoIso(Math.max(60, -t.due * 1440 - 600)) : null,
        versions: t.versions.map(v => ({ id: "ver_" + t.id + "_" + v.n, n: v.n, by: v.by, createdAt: agoIso(v.ago), state: v.state, color: v.color, note: v.note, annots: v.annots, driveUrl: v.driveUrl || "", decidedAt: v.state !== "pending" ? agoIso(Math.max(30, v.ago - 300)) : null, decidedBy: v.state !== "pending" ? t.reviewer : null })),
        files: t.files.map(f => Object.assign({}, f, { createdAt: agoIso(f.ago) })), comments,
        activity: t.activity.map(a => ({ who: a.who, k: a.k, createdAt: agoIso(a.ago), a: a.a })) });
      // References can point to tasks later in the seed. Insert them after all tasks exist.
      sz.writeTask(db, W, Object.assign({}, doc, { dependencies: [] }), "zein");
      doc.versions.forEach(v => { if (v.state === "approved") db.prepare("INSERT INTO approvals (id,task_id,version_id,decided_by,decision,created_at) VALUES (?,?,?,?,?,?)").run(uid("ap"), t.id, v.id, t.reviewer, "approved", v.decidedAt); if (v.state === "revision") db.prepare("INSERT INTO revision_requests (id,task_id,version_id,requested_by,reason,feedback,priority,created_at) VALUES (?,?,?,?,?,?,?,?)").run(uid("rr"), t.id, v.id, t.reviewer, "Revision requested", "", t.prio, v.decidedAt); });
    });
    DEMO.tasks.forEach(t => (t.dependencies || []).forEach(dep => {
      db.prepare("INSERT INTO task_dependencies (task_id,depends_on_task_id,dependency_type,created_by,created_at) VALUES (?,?,?,?,?)")
        .run(t.id, dep.taskId, dep.type || "finish_to_start", dep.createdBy || "zein", dep.createdAt || agoIso(0));
    }));
    // History: completed tasks over the last 8 weeks so analytics have real rows to aggregate.
    const teams = ["design", "motion", "social", "copy", "brand"], people = ["sarah", "andi", "dian", "maya", "rizky", "laura", "zein"], projs = ["pq2"];
    const titles = ["Promo banner", "Story set", "Branch insert", "Email header", "Reel cutdown", "Icon refresh", "Poster A3", "Deck update", "Education carousel", "Landing hero", "Webinar slide", "Thumbnail set"];
    let n = 0;
    for (let w = 8; w >= 1; w--) for (let k = 0; k < 4 + (w % 3); k++) {
      n++; const id = "H-" + String(n).padStart(3, "0"); const createdDays = w * 7 + 3 + (k % 4); const days = 2 + ((k * 3 + w) % 6); const doneDays = createdDays - days;
      const team = teams[(k + w) % teams.length], who = people[(k * 2 + w) % people.length];
      const revised = (k + w) % 3 === 0;
      const t0 = agoIso(createdDays * 1440), tRev = agoIso((createdDays - Math.max(1, days - 2)) * 1440), tDone = agoIso(Math.max(0, doneDays) * 1440);
      sz.writeTask(db, W, { id, title: titles[(k + w) % titles.length] + " — wk " + w, proj: projs[(k + w) % projs.length], team, status: "done", prio: ["low", "medium", "high"][(k + w) % 3], assignee: who, reviewer: "laura", startDate: dateOff(-createdDays), dueDate: dateOff(-doneDays), effort: 2 + (k % 4) * 2, assetCount: 1 + ((k + w) % 5), labels: [["lb_gd","lb_ve","lb_mo","lb_cw","lb_ui"][(k + w) % 5]], sort: 9000 + n, tags: [], brief: null, custom: {}, createdAt: t0, completedAt: tDone,
        versions: revised ? [{ id: "ver_" + id + "_1", n: 1, by: who, createdAt: tRev, state: "revision", color: "#123A6B", note: "", annots: [], decidedAt: tRev, decidedBy: "laura" }, { id: "ver_" + id + "_2", n: 2, by: who, createdAt: tDone, state: "approved", color: "#0B2A5B", note: "", annots: [], decidedAt: tDone, decidedBy: "laura" }] : [{ id: "ver_" + id + "_1", n: 1, by: who, createdAt: tRev, state: "approved", color: "#0B2A5B", note: "", annots: [], decidedAt: tDone, decidedBy: "laura" }],
        files: [], comments: [], activity: [{ who: "laura", k: "created", createdAt: t0, a: {} }, { who, k: "moved", createdAt: agoIso((createdDays - 1) * 1440), a: { from: "todo", to: "progress" } }, { who, k: "moved", createdAt: tRev, a: { from: "progress", to: "review" } }].concat(revised ? [{ who: "laura", k: "moved", createdAt: agoIso((createdDays - Math.max(1, days - 2)) * 1440 - 600), a: { from: "review", to: "revision" } }, { who, k: "moved", createdAt: agoIso((createdDays - Math.max(1, days - 1)) * 1440), a: { from: "revision", to: "review" } }] : []).concat([{ who: "laura", k: "approved", createdAt: tDone, a: { v: revised ? 2 : 1 } }, { who: "laura", k: "moved", createdAt: tDone, a: { from: "review", to: "approved" } }, { who: "laura", k: "moved", createdAt: agoIso(Math.max(0, doneDays - 1) * 1440), a: { from: "approved", to: "done" } }]) }, "laura");
      db.prepare("INSERT INTO approvals (id,task_id,version_id,decided_by,decision,created_at) VALUES (?,?,?,?,?,?)").run(uid("ap"), id, "ver_" + id + "_" + (revised ? 2 : 1), "laura", "approved", tDone);
      if (revised) db.prepare("INSERT INTO revision_requests (id,task_id,version_id,requested_by,reason,feedback,priority,created_at) VALUES (?,?,?,?,?,?,?,?)").run(uid("rr"), id, "ver_" + id + "_1", "laura", "Off brief", "", "medium", tRev);
    }
    DEMO.activity.forEach(a => sz.appendActivity(db, W, { who: a.who, k: a.k, a: a.a, createdAt: agoIso(a.ago) }, a.a.task ? "task" : a.a.request ? "request" : "team", a.a.task || a.a.request || a.a.team || W));
    DEMO.notifs.forEach(nf => sz.writeNotif(db, W, { recipient: "zein", who: nf.who, k: nf.k, t: nf.t, entityType: "task", read: nf.read, createdAt: agoIso(nf.ago) }));
    sz.writeNotif(db, W, { recipient: "sarah", who: "zein", k: "assigned", t: "T-118", read: false, createdAt: agoIso(8 * 1440) });
    sz.writeNotif(db, W, { recipient: "laura", who: "sarah", k: "upload", t: "T-118", read: false, createdAt: agoIso(1440) });
  });
}
function reset(db) { tx(db, () => { ["sessions","activity_logs","notifications","saved_views","knowledge_pages","knowledge_folders","cloud_connections","assets","asset_folders","creative_requests","comments","revision_requests","approvals","file_versions","files","custom_field_values","custom_fields","task_tags","tags","briefs","tasks","brief_templates","task_statuses","milestones","project_members","projects","team_memberships","teams","workspace_members","users","roles","workspaces"].forEach(t => db.exec("DELETE FROM " + t)); }); run(db); }
module.exports = { run, runClean, seedInitial: db => (SEED_DEMO ? run(db) : runClean(db)), SEED_DEMO, ADMIN_EMAIL, reset, DEMO_PASSWORD, ADMIN_PASSWORD, GENERATED_ADMIN_PASSWORD, INVITE_CODE, ALLOW_REGISTRATION };
if (require.main === module) { if (process.env.NODE_ENV === "production" && process.env.COS_CONFIRM_RESET !== "YES") { console.error("Production reset blocked: this would replace every task, message and member with demo data.\nCreate and verify a backup first, then run again with COS_CONFIRM_RESET=YES."); process.exit(1); } const { open } = require("./db"); const db = open(); reset(db); console.log("Seeded ZenCrevia demo workspace →", require("./db").DB_PATH); console.log("Admin: " + ADMIN_EMAIL + " / " + ADMIN_PASSWORD); if (DEMO_PASSWORD) console.log("Demo team password supplied through COS_DEMO_PASSWORD"); if (GENERATED_ADMIN_PASSWORD) console.log("Save this one-time generated admin password now; it is not written to a file."); }
