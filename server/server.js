#!/usr/bin/env node
// ZenCrevia — Brand Mode · API + static server. Zero dependencies (Node ≥ 22.13, node:sqlite).
const http = require("http");
const fs = require("fs");
const path = require("path");
const { open, tx, uid, now, S, J } = require("./db");
const sz = require("./serialize");
const { can, CAPS, DEFAULT_ROLES } = require("./permissions");
const auth = require("./auth");
const crypto = require("crypto");
const analytics = require("./analytics");
const seed = require("./seed");
const mailer = require("./mailer");
const security = require("./security");
const secrets = require("./secrets");
const backups = require("./backup");

const PORT = +(process.env.PORT || 3000);
const DEV_HEADER_AUTH = !security.IS_PRODUCTION && (process.env.COS_DEV_HEADER_AUTH === "1" || process.env.COS_ALLOW_HEADER_AUTH === "1");
const ALLOW_IMPERSONATION = !security.IS_PRODUCTION || process.env.COS_ALLOW_IMPERSONATION === "1";
const PUBLIC = path.join(__dirname, "..", "public");
/* v36: files the server creates (database, logs, backups, outbox) are owner-only. */
if (process.platform !== "win32") process.umask(0o077);
let db = open();
require("./preflight").run({ firstStart: !db.prepare("SELECT 1 FROM workspaces LIMIT 1").get() });
if (!db.prepare("SELECT 1 FROM workspaces LIMIT 1").get()) {
  console.log(seed.SEED_DEMO ? "Empty database — seeding ZenCrevia demo workspace (COS_SEED_DEMO=0 for a clean install)" : "Empty database — creating a clean ZenCrevia workspace (no demo content)"); seed.seedInitial(db);
  if (seed.GENERATED_ADMIN_PASSWORD) console.log("One-time admin login: " + seed.ADMIN_EMAIL + " / " + seed.ADMIN_PASSWORD + "  (save it now; it is not written to a file)");
}
/* v29 one-time label migration: the old Viewer description said "Read-only" although
   viewers can submit requests, which create backlog tasks. */
try { db.prepare("UPDATE roles SET description=? WHERE id='viewer' AND is_system=1 AND description='Read-only (can submit requests and comment)'").run(DEFAULT_ROLES.find(r => r.id === "viewer").description); } catch (e) {}
try { db.prepare("DELETE FROM sessions WHERE id NOT LIKE 'sha256:%'").run(); } catch (e) {} /* v29: drop pre-hash sessions */
let WS_ID = db.prepare("SELECT id FROM workspaces LIMIT 1").get().id; // single-workspace MVP; every query is scoped by it (§74)
/* v38: a removed member keeps their user row (history points at it) but loses everything that
   made the account usable: sign-in email, password, sessions. The email is free to be added or
   registered again. Runs on every start for accounts removed by older versions. */
function releaseAccount(userId) {
  db.prepare("UPDATE users SET email=NULL, password_hash=NULL, password_salt=NULL, is_active=0 WHERE id=?").run(userId);
  db.prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
  try { db.prepare("DELETE FROM password_resets WHERE user_id=?").run(userId); } catch (e) {}
}
try { db.prepare("SELECT id FROM users WHERE id NOT IN (SELECT user_id FROM workspace_members) AND (email IS NOT NULL OR password_hash IS NOT NULL)").all().forEach(r => releaseAccount(r.id)); } catch (e) { console.warn("[v38] account release migration:", e.message); }
/* v39: images move out of the database into COS_DATA_DIR/uploads (once; see server/uploads.js) */
const uploads = require("./uploads");
try { const moved = uploads.migrate(db); if (moved) console.log("[uploads] moved images out of the database:", JSON.stringify(moved)); } catch (e) { console.error("[uploads] migration failed — images stay in the database for now:", e.message); }
/* v17 §P1-4 — load any dashboard-configured SMTP at boot so notifications use
   it immediately, without a restart or an environment variable. */
try { mailer.setStoredConfig(sz.smtpRuntime(db, WS_ID, secrets)); } catch (e) { console.warn("[mail] stored SMTP config unavailable:", e.message); }
// Requests were merged into tasks: any open creative_requests rows become tasks in the first queue stage (rejected → 'declined').
(function migrateRequests() {
  const rows = db.prepare("SELECT * FROM creative_requests WHERE workspace_id=? AND (converted_task_id IS NULL OR converted_task_id='')").all(WS_ID); if (!rows.length) return;
  const first = db.prepare("SELECT id FROM task_statuses WHERE workspace_id=? AND is_archived=0 ORDER BY sort_order LIMIT 1").get(WS_ID); const declined = db.prepare("SELECT id FROM task_statuses WHERE workspace_id=? AND id='declined'").get(WS_ID);
  tx(db, () => rows.forEach(r => {
    const id = "T-" + r.id.replace(/^R-/, "R");
    if (db.prepare("SELECT 1 FROM tasks WHERE id=?").get(id)) return;
    const desc = [r.objective && "Objective: " + r.objective, r.description, r.deliverables && "Deliverables: " + r.deliverables, r.links && "Links: " + r.links, r.notes && "Notes: " + r.notes].filter(Boolean).join("\n\n");
    sz.writeTask(db, WS_ID, { id, title: r.title, description: desc, proj: null, team: r.team_id, status: r.status === "rejected" && declined ? "declined" : first.id, prio: r.priority || "medium", assignee: null, reviewer: null, dueDate: r.deadline, startDate: r.created_at ? r.created_at.slice(0, 10) : null, effort: 0, sort: 0, tags: ["request"], brief: { tpl: "general", objective: r.objective || "", deliverables: r.deliverables || "", references: r.links || "", notes: r.notes || "" }, custom: {}, createdBy: r.requested_by, createdAt: r.created_at, versions: [], files: [], comments: r.decision_note ? [{ by: r.requested_by, vis: "client", text: "Decision: " + r.decision_note }] : [], activity: [{ who: r.requested_by, k: "created", createdAt: r.created_at, a: {} }] }, r.requested_by);
    db.prepare("UPDATE creative_requests SET converted_task_id=? WHERE id=?").run(id, r.id);
  }));
  console.log("Migrated " + rows.length + " creative request(s) into tasks");
})();
const swept = sz.sweepArchive(db, WS_ID); if (swept) console.log("Auto-archived " + swept + " project(s) completed in a previous month");
setInterval(() => { try { sz.sweepArchive(db, WS_ID); } catch (e) { console.error(e); } }, 6 * 3600 * 1000);

/* ---------- email notifications (§52) ---------- */
const MAIL_TEXT = { assigned: "{who} assigned you “{t}”.", mention: "{who} mentioned you in a comment on “{t}”.", comment: "{who} commented on “{t}”.", revision: "{who} requested a revision on “{t}”.", approved: "{who} approved “{t}”.", upload: "{who} uploaded a new version of “{t}”.", status: "{who} moved “{t}” to a new stage.", file: "{who} attached a file to “{t}”.", deadline: "“{t}” is due today.", missed: "“{t}” missed its deadline.", request: "{who} submitted a creative request: “{t}”.", request_status: "{who} updated the status of your request “{t}”." };
const CHAT_MAIL_SENT = new Map();
function emailNotification(notifId) {
  const n = db.prepare("SELECT n.*, u.email, u.name AS recipient_name FROM notifications n JOIN users u ON u.id=n.recipient_id WHERE n.id=?").get(notifId);
  if (!n || !n.email) return;
  const ws = sz.readWorkspace(db, WS_ID); const prefs = ws.notifPrefs || {};
  if (prefs.email === false || prefs[n.type] === false) return;
  const actor = n.actor_id ? (db.prepare("SELECT name FROM users WHERE id=?").get(n.actor_id) || {}).name : "ZenCrevia";
  /* v38.1 chat: v37 sent one email per direct message, titled with the conversation id
     ("Admin updated “cv_…”"). Now: nothing while the person has ZenCrevia open, at most one email
     per conversation per 30 minutes, and the email quotes the message and links to the chat. */
  if (n.entity_type === "message") {
    if (typeof chat !== "undefined" && chat.isOnline && chat.isOnline(n.recipient_id)) return;
    const key = n.recipient_id + "|" + n.entity_id, last = CHAT_MAIL_SENT.get(key) || 0;
    if (Date.now() - last < 30 * 60000) return; CHAT_MAIL_SENT.set(key, Date.now());
    let info = {}; try { info = JSON.parse(n.message || "{}"); } catch (e) {}
    const mention = n.type === "chat_mention";
    const text = actor + (mention ? " mentioned you in a conversation" : " sent you a message") + (info.text ? ": “" + String(info.text).slice(0, 160) + "”" : ".");
    return mailer.send({ to: n.email, subject: "[" + ws.name + "] " + actor + (mention ? " mentioned you" : " sent you a message"), text: "Hi " + (n.recipient_name || "").split(" ")[0] + ", " + text, meta: {}, link: mailer.link("/messages/" + encodeURIComponent(n.entity_id) + (info.msg ? "?msg=" + encodeURIComponent(info.msg) : "")), workspace: ws.name })
      .then(() => db.prepare("UPDATE notifications SET emailed_at=? WHERE id=?").run(now(), n.id))
      .catch(e => db.prepare("UPDATE notifications SET email_error=? WHERE id=?").run(String(e.message).slice(0, 300), n.id));
  }
  let title = n.entity_id, meta = {}, link = "/";
  if (n.entity_type === "request") { const r = db.prepare("SELECT title, deadline, priority FROM creative_requests WHERE id=?").get(n.entity_id); if (r) { title = r.title; meta = { Request: n.entity_id, Deadline: r.deadline, Priority: r.priority }; } link = "/tasks?task=" + encodeURIComponent(n.entity_id); }
  else { const t = db.prepare("SELECT t.title, t.due_date, t.priority, s.name AS status, p.name AS project FROM tasks t JOIN task_statuses s ON s.id=t.status_id LEFT JOIN projects p ON p.id=t.project_id WHERE t.id=?").get(n.entity_id); if (t) { title = t.title; meta = { Task: n.entity_id, Project: t.project || "—", Status: t.status, Due: t.due_date || "—", Priority: t.priority }; } link = "/tasks?task=" + encodeURIComponent(n.entity_id); }
  const text = (MAIL_TEXT[n.type] || "{who} updated “{t}”.").replace("{who}", actor).replace("{t}", title);
  mailer.send({ to: n.email, subject: "[" + ws.name + "] " + text.replace(/\.$/, ""), text: "Hi " + (n.recipient_name || "").split(" ")[0] + ", " + text, meta, link: mailer.link(link), workspace: ws.name })
    .then(() => db.prepare("UPDATE notifications SET emailed_at=? WHERE id=?").run(now(), notifId))
    .catch(e => { console.error("[mail] " + e.message); db.prepare("UPDATE notifications SET email_error=? WHERE id=?").run(e.message.slice(0, 200), notifId); });
}

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const forbid = (ok, what) => { if (!ok) throw new HttpError(403, "You don't have permission to " + what + "."); };
/* v31 content limits. Without them one member could post a 5 MB comment and every
   colleague's sign-in payload grew by 5 MB (measured: 3.6 MB -> 18.4 MB). Limits are
   generous for real work and enforced before any handler runs. */
const TEXT_LIMITS = [
  [/^\/api\/tasks(\/|$)/, { title: 240, description: 20000 }, t => {
    (Array.isArray(t.comments) ? t.comments : []).forEach(c => tooLong("comment", c && c.text, 10000));
    (Array.isArray(t.versions) ? t.versions : []).forEach(v => { tooLong("version note", v && v.note, 4000); tooLong("revision reason", v && v.reason, 4000); });
    if (t.brief && typeof t.brief === "object") Object.values(t.brief).forEach(v => tooLong("brief field", typeof v === "string" ? v : "", 10000));
    if (Array.isArray(t.comments) && t.comments.length > 2000) throw new HttpError(413, "Too many comments on one task");
  }],
  [/^\/api\/knowledge(\/|$)/, { title: 200, body: 200000, folder: 120 }, k => { if (k.translations && typeof k.translations === "object") Object.values(k.translations).forEach(tr => { if (tr && typeof tr === "object") { tooLong("title", tr.title, 200); tooLong("page", tr.body, 200000); } }); }],
  [/^\/api\/knowledge-folders/, { name: 120, nameId: 120 }],
  [/^\/api\/projects(\/|$)/, { name: 160, description: 5000 }],
  [/^\/api\/teams(\/|$)/, { name: 80, description: 1000 }],
  [/^\/api\/requests(\/|$)/, { title: 240, description: 20000 }],
  [/^\/api\/members(\/|$)/, { name: 120, role: 120, email: 254 }],
  [/^\/api\/views(\/|$)/, { name: 120 }],
  [/^\/api\/assets(\/|$)/, { name: 240, notes: 5000 }],
  [/^\/api\/decisions/, { title: 240, body: 10000, rationale: 10000 }]
];
function tooLong(label, v, max) { if (typeof v === "string" && v.length > max) throw new HttpError(413, "Text is too long: " + label + " (max " + max.toLocaleString("en-US") + " characters)"); }
function checkTextLimits(pathname, b) {
  if (!b || typeof b !== "object") return;
  for (const [re, fields, extra] of TEXT_LIMITS) { if (!re.test(pathname)) continue; Object.entries(fields).forEach(([k, max]) => tooLong(k, b[k], max)); if (extra) extra(b); }
}
/* v34 live board. After any successful task write, every signed-in client gets a small
   "task_changed" event and fetches just that task, so boards stop going stale while several
   people work at once. Bulk bootstrap is not re-sent. */
function announceTaskChange(method, pathname, out, user) {
  try {
    const m = /^\/api\/tasks(?:\/([^\/]+))?(?:\/(move|hidden))?$/.exec(pathname); if (!m) return;
    const id = m[1] || (out && out.id); if (!id || id === "bulk") return;
    const deleted = method === "DELETE";
    const row = deleted ? null : db.prepare("SELECT updated_at FROM tasks WHERE id=?").get(id);
    const ids = db.prepare("SELECT m.user_id FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND u.is_active=1").all(WS_ID).map(r => r.user_id);
    if (typeof chat !== "undefined" && chat.publishToUsers) chat.publishToUsers(ids, { type: "task_changed", id, deleted, updatedAt: row ? row.updated_at : null, by: user.id });
  } catch (e) { /* live updates are best effort */ }
}
/* v38 live updates for projects, teams, members, assets, knowledge, workspace settings and roles.
   Clients refetch only the named collection via GET /api/live/:kind. */
const LIVE_KINDS = [[/^\/api\/projects(\/|$)/, "projects"], [/^\/api\/teams(\/|$)/, "teams"], [/^\/api\/members(\/|$)/, "people"], [/^\/api\/(assets|folders)(\/|$)/, "assets"], [/^\/api\/knowledge(-folders)?(\/|$)/, "knowledge"], [/^\/api\/workspace$/, "workspace"], [/^\/api\/roles(\/|$)/, "roles"]];
function announceWorkspaceChange(pathname, user) {
  try {
    const hit = LIVE_KINDS.find(([re]) => re.test(pathname)); if (!hit) return;
    const ids = db.prepare("SELECT m.user_id FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND u.is_active=1").all(WS_ID).map(r => r.user_id);
    if (typeof chat !== "undefined" && chat.publishToUsers) chat.publishToUsers(ids, { type: "ws_changed", kind: hit[1], by: user.id });
  } catch (e) { /* best effort */ }
}
const DUMMY_PW = auth.hashPassword(crypto.randomBytes(18).toString("hex"));
const passwordError = (pw) => { const problem = auth.passwordProblem(pw); if (problem) throw new HttpError(400, problem); };
function safeHttpsUrl(value, field) {
  value = String(value || ""); if (!value) return;
  let u; try { u = new URL(value); } catch { throw new HttpError(400, (field || "URL") + " is invalid"); }
  if (u.protocol !== "https:" && u.protocol !== "s3:") throw new HttpError(400, (field || "URL") + " must use HTTPS");
}
function validateEmbeddedImage(value, field) {
  value = String(value || ""); if (!value) return;
  if (uploads.isFileUrl(value)) return; /* v39: already stored on disk */
  if (!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(value)) throw new HttpError(400, (field || "Image") + " must be PNG, JPEG, WebP or GIF");
  if (value.length > 3_000_000) throw new HttpError(413, (field || "Image") + " is too large");
}
function validateStoredFiles(doc, userId) {
  (doc.files || []).forEach(f => { if (f.preview) validateEmbeddedImage(f.preview, "File preview"); if (f.url) safeHttpsUrl(f.url, "File link"); if (String(f.name || "").length > 240) throw new HttpError(400, "File name is too long"); });
  (doc.versions || []).forEach(v => { if (v.img) validateEmbeddedImage(v.img, "Version preview"); if (v.driveUrl) safeHttpsUrl(v.driveUrl, "Version link"); });
  (doc.comments || []).forEach(c => (c.attachments || []).forEach(a => { if (a.preview) validateEmbeddedImage(a.preview, "Comment preview"); if (a.url) safeHttpsUrl(a.url, "Comment file link"); }));
  try { uploads.externalizeTask(db, doc, userId); } catch (e) { throw new HttpError(e.status || 400, e.message); }
}

function userContext(id) {
  const m = db.prepare("SELECT wm.role_id, wm.is_stakeholder, u.name, u.email FROM workspace_members wm JOIN users u ON u.id=wm.user_id WHERE wm.workspace_id=? AND wm.user_id=? AND u.is_active=1").get(WS_ID, id);
  if (!m) return null;
  const r = db.prepare("SELECT permissions, rank, name AS role_name FROM roles WHERE id=?").get(m.role_id); const caps = {}; (J(r && r.permissions, [])).forEach(c => { caps[c] = true; });
  return { id, name: m.name, email: m.email, role: m.role_id, roleName: r ? r.role_name : m.role_id, rank: r ? (r.rank || 0) : 0, caps, stakeholder: !!m.is_stakeholder, teams: db.prepare("SELECT team_id FROM team_memberships WHERE user_id=?").all(id).map(r => r.team_id), ledTeams: db.prepare("SELECT id FROM teams WHERE workspace_id=? AND team_lead_id=?").all(WS_ID, id).map(r => r.id) };
}
const MAX_BODY_BYTES = Math.max(1_000_000, +(process.env.COS_MAX_BODY_BYTES || 12_000_000));
const readBody = (req) => new Promise((res, rej) => { let b = "", rejected = false; const declared = +(req.headers["content-length"] || 0); if (declared > MAX_BODY_BYTES) return rej(new HttpError(413, "Body too large")); req.on("data", c => { if (rejected) return; b += c; if (Buffer.byteLength(b) > MAX_BODY_BYTES) { rejected = true; rej(new HttpError(413, "Body too large")); } }); req.on("end", () => { if (rejected) return; try { res(b ? JSON.parse(b) : {}); } catch { rej(new HttpError(400, "Invalid JSON")); } }); });
const act = (user, k, entityType, entityId, a) => sz.appendActivity(db, WS_ID, { who: user.id, k, a: a || {} }, entityType, entityId);

/* ---------- drag-and-drop mutations (§39, §76, §77) ---------- */
// afterTaskId = the neighbour the moved task lands AFTER (predecessor); beforeTaskId = the neighbour it lands BEFORE (successor). Fractional ranks (§77).
function rank(beforeId, afterId, fallback) {
  const s = (id) => id ? (db.prepare("SELECT sort_order FROM tasks WHERE id=?").get(id) || {}).sort_order : null;
  const pred = s(afterId), succ = s(beforeId);
  if (pred != null && succ != null) return (pred + succ) / 2;
  if (pred != null) return pred + 1000;
  if (succ != null) return succ - 1000;
  return fallback;
}
function validateDependencies(taskId, deps) {
  const ids = (deps || []).map(d => d && d.taskId).filter(Boolean);
  if (ids.some(id => id === taskId)) throw new HttpError(400, "A task cannot depend on itself");
  if (new Set(ids).size !== ids.length) throw new HttpError(400, "The same dependency cannot be added twice");
  ids.forEach(id => { if (!db.prepare("SELECT 1 FROM tasks WHERE id=? AND workspace_id=?").get(id, WS_ID)) throw new HttpError(400, "Dependency task was not found"); });
  const graph = {};
  db.prepare("SELECT task_id, depends_on_task_id FROM task_dependencies").all().forEach(r => { (graph[r.task_id] = graph[r.task_id] || []).push(r.depends_on_task_id); });
  graph[taskId] = ids;
  const reaches = (from, goal, seen) => { if (from === goal) return true; if (seen[from]) return false; seen[from] = true; return (graph[from] || []).some(next => reaches(next, goal, seen)); };
  ids.forEach(id => { if (reaches(id, taskId, {})) throw new HttpError(400, "This dependency would create a circular chain"); });
}
/* ---- v33 review gate ------------------------------------------------------------------
   Moving a task INTO a decision stage (compliance, revision, approved, delivered, done,
   declined by default) is reserved for someone other than the person doing the work:
   its reviewer, the requester, a team lead, anyone with review_any, or an admin. A reviewer
   or requester who is also an assignee does not count — nobody signs off their own work
   unless a lead/admin role says so. Stages from the first review stage onward also require
   a named reviewer. Rules are per stage and configurable in Settings → Workflow. */
function stageRule(statusId) {
  return sz.stageRules(db.prepare("SELECT * FROM task_statuses WHERE workspace_id=? AND is_archived=0 ORDER BY sort_order").all(WS_ID)).find(x => x.id === statusId) || null;
}
function requesterOf(t) {
  if (!t) return null;
  if (t.requestId) { const r = db.prepare("SELECT requested_by FROM creative_requests WHERE id=?").get(t.requestId); if (r && r.requested_by) return r.requested_by; }
  /* tasks submitted through the request path carry the "request" tag and createdBy = requester */
  if ((t.tags || []).includes("request") && t.createdBy) return t.createdBy;
  return null;
}
function canDecideStage(u, t) {
  const assignees = new Set([t.assignee].concat(t.assignees || []).filter(Boolean));
  const mine = assignees.has(u.id);
  if (can.manageWorkspace(u) || can.hasReviewAny(u) || can.leadsTaskTeam(u, t)) return true;
  if (mine) return false;
  if (t.reviewer === u.id || (t.reviewers || []).includes(u.id)) return true;
  return requesterOf(t) === u.id;
}
function gateStatusChange(u, cur, next, toStatus) {
  if (!toStatus || (cur && cur.status === toStatus)) return;
  const rule = stageRule(toStatus); if (!rule) return;
  const reviewers = [next.reviewer].concat(next.reviewers || []).filter(Boolean);
  if (rule.requireReviewer && !reviewers.length) throw new HttpError(400, "Choose a reviewer before moving this task to " + rule.name + ".");
  if (rule.reviewerOnly && !canDecideStage(u, cur || next)) throw new HttpError(403, "Only the reviewer, the requester, a team lead or an admin can move this task to " + rule.name + ".");
  /* v34: leaving a reviewer-only stage (e.g. reopening a task the reviewer marked Done)
     needs the same right as entering it, or the assignee could undo an acceptance. */
  const fromRule = cur && stageRule(cur.status);
  if (fromRule && fromRule.reviewerOnly && !canDecideStage(u, cur)) throw new HttpError(403, "Only the reviewer, the requester, a team lead or an admin can move this task out of " + fromRule.name + ".");
}
function moveTask(user, id, op) {
  const doc = sz.readTask(db, id); if (!doc) throw new HttpError(404, "Task not found");
  /* v33: the reviewer or requester may change the status (accept, send back) even
     without general edit rights — e.g. a stakeholder who submitted the request. */
  forbid(can.editTask(user, doc) || (op && op.type === "MOVE_TASK_STATUS" && canDecideStage(user, doc)), "move this task");
  return tx(db, () => {
    switch (op.type) {
      case "MOVE_TASK_STATUS": {
        if (!db.prepare("SELECT 1 FROM task_statuses WHERE id=? AND workspace_id=?").get(op.toStatusId, WS_ID)) throw new HttpError(400, "Unknown status");
        gateStatusChange(user, doc, doc, op.toStatusId);
        const st = db.prepare("SELECT is_completed FROM task_statuses WHERE id=?").get(op.toStatusId);
        db.prepare("UPDATE tasks SET status_id=?, sort_order=?, completed_at=?, updated_at=? WHERE id=?").run(op.toStatusId, rank(op.beforeTaskId, op.afterTaskId, doc.sort), st.is_completed ? (doc.completedAt || now()) : null, now(), id);
        if (doc.status !== op.toStatusId) act(user, "moved", "task", id, { from: doc.status, to: op.toStatusId, task: id });
        break; }
      case "REORDER_TASK": db.prepare("UPDATE tasks SET sort_order=?, updated_at=? WHERE id=?").run(rank(op.beforeTaskId, op.afterTaskId, doc.sort), now(), id); break;
      case "MOVE_TASK_DATE": case "MOVE_TASK_TIMELINE":
        db.prepare("UPDATE tasks SET start_date=?, due_date=?, updated_at=? WHERE id=?").run(op.startDate || doc.startDate, op.dueDate || doc.dueDate, now(), id);
        act(user, "deadline", "task", id, { task: id, from: doc.dueDate, to: op.dueDate }); break;
      case "MOVE_TASK_PROJECT": db.prepare("UPDATE tasks SET project_id=?, updated_at=? WHERE id=?").run(op.projectId, now(), id); act(user, "edited", "task", id, { task: id, what: "project" }); break;
      case "MOVE_TASK_TEAM": db.prepare("UPDATE tasks SET team_id=?, updated_at=? WHERE id=?").run(op.teamId || null, now(), id); act(user, "team", "task", id, { task: id, to: op.teamId }); break;
      case "MOVE_TASK_ASSIGNEE": { forbid(can.assignTask(user, doc), "assign this task"); const list = (doc.assignees || []).filter(x => x !== doc.assignee); if (op.assigneeId) list.unshift(op.assigneeId); db.prepare("UPDATE tasks SET assignee_id=?, assignees=?, updated_at=? WHERE id=?").run(op.assigneeId || null, S(list), now(), id); } act(user, "assigned", "task", id, { task: id, to: op.assigneeId }); break;
      case "MOVE_TASK_PRIORITY": db.prepare("UPDATE tasks SET priority=?, updated_at=? WHERE id=?").run(op.priority, now(), id); act(user, "edited", "task", id, { task: id, what: "priority" }); break;
      default: throw new HttpError(400, "Unknown drag operation " + op.type);
    }
    return sz.readTask(db, id);
  });
}

/* ---------- routes ---------- */
const routes = [];
const OPEN = new Set(["/api/auth/session", "/api/auth/status", "/api/auth/login", "/api/auth/register", "/api/auth/logout", "/api/auth/forgot", "/api/auth/reset", "/api/auth/reset/check", "/api/health"]);
function readRoles() { return db.prepare("SELECT * FROM roles ORDER BY rank DESC, sort_order, name").all().map(r => ({ id: r.id, name: r.name, description: r.description || "", permissions: J(r.permissions, []), rank: r.rank || 0, system: !!r.is_system })); }
function publicUser(id) { const u = db.prepare("SELECT id, name, email, initials, avatar_color FROM users WHERE id=?").get(id); const m = db.prepare("SELECT role_id, job_title FROM workspace_members WHERE user_id=? AND workspace_id=?").get(id, WS_ID); return u && { id: u.id, name: u.name, email: u.email, ini: u.initials, c: u.avatar_color, perm: m ? m.role_id : null, role: m ? m.job_title : "" }; }
function workspaceFor(u) { const w = sz.readWorkspace(db, WS_ID); if (!can.manageWorkspace(u)) w.joinCode = ""; return w; }
const route = (method, pattern, handler) => routes.push({ method, re: new RegExp("^" + pattern.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"), handler });
require('./gallery')(db, WS_ID, route, () => sz.readAIRaw(db, WS_ID));
/* v18 §144–147 Messages: the SSE stream handler needs the raw response, which route handlers receive as ctx.res */
/* v19 task.meta (watchers, checklist, actual effort, source message) — one JSON column, added lazily for existing DBs */
try { db.exec("ALTER TABLE tasks ADD COLUMN meta TEXT DEFAULT '{}'"); } catch (e) {}
require('./decisions')(db, WS_ID, route);
const chat = require('./messages')(db, WS_ID, (method, pattern, handler) => route(method, pattern, (u, p, q, b, ctx) => handler(u, p, q, b, ctx && ctx.req, ctx && ctx.res)), { readNotifs: sz.readNotifs, writeNotif: sz.writeNotif, onNotification: id => emailNotification(id) });

/* v36: the health check proves the database answers (an uptime monitor saw "ok" even with a
   broken database) and reports 503 while shutting down, so a load balancer stops routing. */
route("GET", "/api/health", () => { if (typeof shuttingDown !== "undefined" && shuttingDown) throw new HttpError(503, "shutting down"); try { db.prepare("SELECT 1").get(); } catch (e) { throw new HttpError(503, "database unavailable"); } return { ok: true, service: "zencrevia" }; });
/* auth */
route("GET", "/api/auth/session", (u, p, q, b, ctx) => { const ws = db.prepare("SELECT name, logo, logo_img, invite_code, allow_registration FROM workspaces WHERE id=?").get(WS_ID); return { user: ctx.sessionUserId ? publicUser(ctx.sessionUserId) : null, workspace: { name: ws.name, logo: ws.logo, logoImg: ws.logo_img, joinCodeRequired: !!ws.invite_code }, canRegister: !!ws.allow_registration, teams: ws.allow_registration ? db.prepare("SELECT id, name FROM teams WHERE workspace_id=? AND coalesce(is_archived,0)=0 ORDER BY sort_order").all(WS_ID) : [] }; });
route("POST", "/api/auth/login", (u, p, q, b, ctx) => { const email = String(b.email || "").trim().toLowerCase(); const gate = security.loginStatus(ctx.ip, email); if (!gate.allowed) { const e = new HttpError(429, "Too many sign-in attempts. Try again later."); e.retryAfter = gate.retryAfter; throw e; } const row = db.prepare("SELECT id, password_hash, password_salt, is_active FROM users WHERE lower(email)=?").get(email); /* v31: always spend one scrypt, so response time does not reveal whether the
     address has an account (was ~80 ms vs ~2 ms). */
  const pwOk = row && row.password_hash ? auth.verifyPassword(b.password || "", row.password_salt, row.password_hash) : (auth.verifyPassword(b.password || "", DUMMY_PW.salt, DUMMY_PW.hash), false);
  if (!row || !row.is_active || !pwOk) { security.loginResult(ctx.ip, email, false); security.log("login_failed", { ip: ctx.ip, email, userAgent: ctx.ua }); throw new HttpError(401, "Email or password is incorrect"); } if (!db.prepare("SELECT 1 FROM workspace_members WHERE user_id=? AND workspace_id=?").get(row.id, WS_ID)) { security.loginResult(ctx.ip, email, false); throw new HttpError(403, "This account is not a member of the workspace"); } security.loginResult(ctx.ip, email, true); const sess = auth.createSession(db, row.id, ctx.ua); ctx.setCookie = auth.cookie(sess.id, sess.exp); security.log("login_succeeded", { ip: ctx.ip, userId: row.id, userAgent: ctx.ua }); return { user: publicUser(row.id) }; });
route("POST", "/api/auth/register", (u, p, q, b, ctx) => { const name = String(b.name || "").trim(), email = String(b.email || "").trim().toLowerCase(); const gate = security.loginStatus(ctx.ip, "register:" + email); if (!gate.allowed) throw new HttpError(429, "Too many registration attempts. Try again later."); if (name.length < 2 || name.length > 120) throw new HttpError(400, "Name is required"); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) throw new HttpError(400, "A valid email is required"); passwordError(b.password);
  const ws = db.prepare("SELECT invite_code AS join_code, default_role_id, allow_registration FROM workspaces WHERE id=?").get(WS_ID); if (!ws.allow_registration) { security.loginResult(ctx.ip, "register:" + email, false); throw new HttpError(403, "Registration is closed — ask an admin to create your account"); } if (ws.join_code && String(b.joinCode || "").trim().toUpperCase() !== ws.join_code.toUpperCase()) { security.loginResult(ctx.ip, "register:" + email, false); security.log("registration_rejected", { ip: ctx.ip, email }); throw new HttpError(403, "Invalid workspace join code — ask your admin"); }
  if (db.prepare("SELECT 1 FROM users WHERE lower(email)=?").get(email)) throw new HttpError(409, "An account with this email already exists — sign in instead");
  const id = auth.userIdFor(name, db); const pw = auth.hashPassword(b.password); const ini = name.split(" ").map(s => s[0]).join("").slice(0, 2).toUpperCase(); const roleId = db.prepare("SELECT 1 FROM roles WHERE id=?").get(ws.default_role_id || "member") ? (ws.default_role_id || "member") : "member";
  tx(db, () => { sz.writePerson(db, WS_ID, id, { name, email, ini, c: db.prepare("SELECT count(*) n FROM users").get().n % 7, role: String(b.jobTitle || "").trim(), perm: roleId, cap: 40, teams: b.teamId && db.prepare("SELECT 1 FROM teams WHERE id=?").get(b.teamId) ? [[b.teamId, true]] : [] }); db.prepare("UPDATE users SET password_hash=?, password_salt=? WHERE id=?").run(pw.hash, pw.salt, id); });
  sz.appendActivity(db, WS_ID, { who: id, k: "member_added", a: { what: name + " registered" } }, "user", id);
  security.loginResult(ctx.ip, "register:" + email, true); const sess = auth.createSession(db, id, ctx.ua); ctx.setCookie = auth.cookie(sess.id, sess.exp); security.log("account_registered", { ip: ctx.ip, userId: id }); return { user: publicUser(id) }; });
/* v29 self-service password reset by email.
   - The response never reveals whether an address has an account.
   - Tokens are 256-bit, emailed once, stored only as SHA-256, valid 60 minutes, single use.
   - Requesting a new link voids older unused ones; completing a reset ends every session.
   - Rate limited per address and per IP with the same limiter as sign-in. */
/* Separate counters for reset traffic: an office behind one NAT address must not lock
   itself out after five requests, while a single address still cannot flood mail. */
const resetRate = new Map();
function resetLimit(key, max, windowMs) { const now = Date.now(); let r = resetRate.get(key); if (!r || r.resetAt <= now) { r = { n: 0, resetAt: now + windowMs }; resetRate.set(key, r); } if (resetRate.size > 20000) for (const [k, v] of resetRate) if (v.resetAt <= now) resetRate.delete(k); return { allowed: r.n < max, hit: () => { r.n++; }, retryAfter: Math.max(1, Math.ceil((r.resetAt - now) / 1000)) }; }
const RESET_MINUTES = Math.max(10, Math.min(24 * 60, +(process.env.COS_RESET_MINUTES || 60)));
const resetHash = t => "sha256:" + crypto.createHash("sha256").update(String(t)).digest("hex");
const FORGOT_OK = { ok: true, minutes: RESET_MINUTES, message: "If that address belongs to an active account, a reset link is on its way. Check your inbox and spam folder." };
route("POST", "/api/auth/forgot", (u, p, q, b, ctx) => {
  const email = String(b.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) throw new HttpError(400, "Enter a valid email address");
  const perEmail = resetLimit("forgot|" + email, 5, 15 * 60000), perIp = resetLimit("forgot-ip|" + ctx.ip, 30, 15 * 60000);
  if (!perEmail.allowed || !perIp.allowed) { const e = new HttpError(429, "Too many reset requests. Try again later."); e.retryAfter = Math.max(perEmail.allowed ? 0 : perEmail.retryAfter, perIp.allowed ? 0 : perIp.retryAfter); throw e; }
  perEmail.hit(); perIp.hit();
  const row = db.prepare("SELECT u.id, u.name, u.is_active FROM users u JOIN workspace_members m ON m.user_id=u.id AND m.workspace_id=? WHERE lower(u.email)=?").get(WS_ID, email);
  security.log("password_reset_requested", { ip: ctx.ip, email, matched: !!(row && row.is_active) });
  if (!row || !row.is_active) return FORGOT_OK;
  const token = crypto.randomBytes(32).toString("hex"), at = now(), exp = new Date(Date.now() + RESET_MINUTES * 60000).toISOString();
  tx(db, () => {
    db.prepare("UPDATE password_resets SET used_at=? WHERE user_id=? AND used_at IS NULL").run(at, row.id);
    db.prepare("DELETE FROM password_resets WHERE expires_at<?").run(new Date(Date.now() - 7 * 86400000).toISOString());
    db.prepare("INSERT INTO password_resets (id,user_id,created_at,expires_at,request_ip) VALUES (?,?,?,?,?)").run(resetHash(token), row.id, at, exp, String(ctx.ip || "").slice(0, 80));
  });
  const ws = sz.readWorkspace(db, WS_ID);
  setImmediate(() => mailer.send({ to: email, subject: "Reset your " + ws.name + " password", workspace: ws.name,
    text: "Hi " + String(row.name || "").split(" ")[0] + ", someone asked to reset the password for this account. The link works once and expires in " + RESET_MINUTES + " minutes. If this was not you, ignore this email; your password stays the same.",
    link: mailer.link("/?reset=" + token), cta: "Choose a new password",
    footer: "You receive this because a password reset was requested for your account. Nobody at ZenCrevia will ever ask you for this link." })
    .catch(e => security.log("password_reset_email_failed", { userId: row.id, error: e.message })));
  return FORGOT_OK;
});
const resetRow = token => { if (!/^[a-f0-9]{64}$/.test(String(token || ""))) return null; const r = db.prepare("SELECT r.*, u.is_active FROM password_resets r JOIN users u ON u.id=r.user_id WHERE r.id=?").get(resetHash(token)); return r && !r.used_at && r.expires_at > now() && r.is_active ? r : null; };
route("POST", "/api/auth/reset/check", (u, p, q, b, ctx) => {
  const gate = resetLimit("reset-ip|" + ctx.ip, 30, 15 * 60000); if (!gate.allowed) throw new HttpError(429, "Too many attempts. Try again later.");
  const r = resetRow(b.token); if (!r) gate.hit();
  return { valid: !!r };
});
route("POST", "/api/auth/reset", (u, p, q, b, ctx) => {
  const gate = resetLimit("reset-ip|" + ctx.ip, 30, 15 * 60000); if (!gate.allowed) throw new HttpError(429, "Too many attempts. Try again later.");
  const r = resetRow(b.token);
  if (!r) { gate.hit(); throw new HttpError(400, "This reset link is invalid, already used or expired. Request a new one."); }
  passwordError(b.password);
  const pw = auth.hashPassword(b.password);
  tx(db, () => {
    db.prepare("UPDATE users SET password_hash=?, password_salt=? WHERE id=?").run(pw.hash, pw.salt, r.user_id);
    db.prepare("UPDATE password_resets SET used_at=? WHERE user_id=? AND used_at IS NULL").run(now(), r.user_id);
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(r.user_id);
  });
  security.log("password_reset_completed", { userId: r.user_id, ip: ctx.ip });
  return { ok: true };
});
route("POST", "/api/auth/logout", (u, p, q, b, ctx) => { auth.destroySession(db, ctx.token); ctx.setCookie = auth.cookie(null); if (u) security.log("logout", { userId: u.id, ip: ctx.ip }); return { ok: true }; });
route("POST", "/api/auth/password", (u, p, q, b, ctx) => { const row = db.prepare("SELECT password_hash, password_salt FROM users WHERE id=?").get(u.id); if (row.password_hash && !auth.verifyPassword(b.current || "", row.password_salt, row.password_hash)) throw new HttpError(400, "Current password is incorrect"); passwordError(b.password); const pw = auth.hashPassword(b.password); db.prepare("UPDATE users SET password_hash=?, password_salt=? WHERE id=?").run(pw.hash, pw.salt, u.id); db.prepare("DELETE FROM sessions WHERE user_id=? AND id!=?").run(u.id, auth.sessionId(ctx.token)); security.log("password_changed", { userId: u.id, ip: ctx.ip }); return { ok: true }; });
route("POST", "/api/members/:id/password", (u, p, q, b, ctx) => { forbid(can.manageMembers(u), "reset passwords"); passwordError(b.password); const pw = auth.hashPassword(b.password); db.prepare("UPDATE users SET password_hash=?, password_salt=? WHERE id=?").run(pw.hash, pw.salt, p.id); db.prepare("DELETE FROM sessions WHERE user_id=?").run(p.id); act(u, "edited", "user", p.id, { what: "password reset" }); security.log("password_reset_by_admin", { adminId: u.id, userId: p.id, ip: ctx.ip }); return { ok: true }; });
route("POST", "/api/members/:id/active", (u, p, q, b) => { forbid(can.manageMembers(u), "deactivate members"); if (p.id === u.id) throw new HttpError(400, "You cannot deactivate yourself"); db.prepare("UPDATE users SET is_active=? WHERE id=?").run(b.active ? 1 : 0, p.id); if (!b.active) db.prepare("DELETE FROM sessions WHERE user_id=?").run(p.id); return sz.readPeople(db, WS_ID); });
/* roles (customizable) */
route("GET", "/api/roles", () => ({ roles: readRoles(), caps: CAPS }));
route("POST", "/api/roles", (u, p, q, b) => { forbid(can.manageRoles(u), "create roles"); if (!b.name) throw new HttpError(400, "Name is required"); const id = b.id || ("role_" + String(b.name).toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24)); if (db.prepare("SELECT 1 FROM roles WHERE id=?").get(id)) throw new HttpError(409, "A role with this id exists"); db.prepare("INSERT INTO roles (id,workspace_id,name,description,permissions,rank,is_system,sort_order) VALUES (?,?,?,?,?,?,0,?)").run(id, WS_ID, b.name, b.description || "", S((b.permissions || []).filter(c => CAPS.some(x => x[0] === c))), +(b.rank || 50), db.prepare("SELECT coalesce(max(sort_order),0)+1 s FROM roles").get().s); act(u, "edited", "workspace", WS_ID, { what: "role " + b.name + " (created)" }); return readRoles(); });
route("PUT", "/api/roles/:id", (u, p, q, b) => { forbid(can.manageRoles(u), "edit roles"); const r = db.prepare("SELECT * FROM roles WHERE id=?").get(p.id); if (!r) throw new HttpError(404, "Role not found"); const perms = p.id === "admin" ? CAPS.map(c => c[0]) : (b.permissions || []).filter(c => CAPS.some(x => x[0] === c)); db.prepare("UPDATE roles SET name=?, description=?, permissions=?, rank=? WHERE id=?").run(b.name || r.name, b.description == null ? r.description : b.description, S(perms), +(b.rank == null ? r.rank : b.rank), p.id); act(u, "edited", "workspace", WS_ID, { what: "role " + (b.name || r.name) }); return readRoles(); });
route("DELETE", "/api/roles/:id", (u, p) => { forbid(can.manageRoles(u), "delete roles"); const r = db.prepare("SELECT * FROM roles WHERE id=?").get(p.id); if (!r) throw new HttpError(404, "Role not found"); if (r.is_system) throw new HttpError(400, "System roles cannot be deleted"); tx(db, () => { db.prepare("UPDATE workspace_members SET role_id='member' WHERE role_id=?").run(p.id); db.prepare("DELETE FROM roles WHERE id=?").run(p.id); }); return readRoles(); });
route("GET", "/api/me", (u) => u);
route("GET", "/api/live/:kind", (u, p) => {
  switch (p.kind) {
    case "projects": return { projects: sz.readProjects(db, WS_ID) };
    case "teams": return { teams: sz.readTeams(db, WS_ID), people: sz.readPeople(db, WS_ID) };
    case "people": return { people: sz.readPeople(db, WS_ID) };
    case "assets": return { assets: sz.readAssets(db, WS_ID), folders: sz.readFolders(db, WS_ID) };
    case "knowledge": return { knowledge: sz.readKnowledge(db, WS_ID), knowledgeFolders: sz.readKnowledgeFolders(db, WS_ID) };
    case "workspace": return { ws: workspaceFor(u) };
    case "roles": return { roles: readRoles() };
    default: throw new HttpError(404, "Unknown collection");
  }
});
route("GET", "/api/auth/me", (u) => u);
/* v29 scale: full detail for work that is live or recently finished; everything older
   arrives slim and is hydrated on demand through GET /api/tasks/:id. With 3,000 tasks the
   old bootstrap was 8 MB and blocked the single server thread for ~2.3 s per sign-in. */
const HOT_DAYS = Math.max(7, +(process.env.COS_TASK_HOT_DAYS || 45));
const COLD_WHERE = "t.completed_at IS NOT NULL AND t.completed_at < ? AND EXISTS (SELECT 1 FROM task_statuses s WHERE s.id=t.status_id AND s.is_completed=1)";
/* v36: the task list is the same for everyone and is the expensive part of sign-in (~165 ms at
   3,000 tasks). Cache it until any write happens (DATA_VERSION) or the hour changes (the
   hot/slim boundary moves with the clock). 30 people opening the app at 9:00 now share one read. */
let DATA_VERSION = 0; const TASK_CACHE = { key: null, value: null };
function bootstrapTasks() {
  const key = DATA_VERSION + ":" + Math.floor(Date.now() / 3600000);
  if (TASK_CACHE.key === key) return TASK_CACHE.value;
  const value = bootstrapTasksFresh(); TASK_CACHE.key = key; TASK_CACHE.value = value; return value;
}
function bootstrapTasksFresh() {
  const cutoff = new Date(Date.now() - HOT_DAYS * 86400000).toISOString();
  const hot = sz.readTasksBatch(db, WS_ID, "NOT (" + COLD_WHERE + ")", [cutoff]);
  const cold = sz.readTaskSlimRows(db, WS_ID, COLD_WHERE, [cutoff]);
  const tasks = hot.concat(cold).sort((a, b) => (a.sort || 0) - (b.sort || 0));
  return { tasks, taskWindow: { hotDays: HOT_DAYS, slim: cold.length, full: hot.length } };
}
route("GET", "/api/tasks/:id", (u, p) => { const t = sz.readTask(db, p.id); if (!t || !db.prepare("SELECT 1 FROM tasks WHERE id=? AND workspace_id=?").get(p.id, WS_ID)) throw new HttpError(404, "Task not found"); return t; });
route("GET", "/api/bootstrap", (u) => (sz.sweepArchive(db, WS_ID), {
  me: u, ws: workspaceFor(u), teams: sz.readTeams(db, WS_ID), people: sz.readPeople(db, WS_ID), projects: sz.readProjects(db, WS_ID),
  ...bootstrapTasks(),
  requests: sz.readRequests(db, WS_ID), folders: sz.readFolders(db, WS_ID), assets: sz.readAssets(db, WS_ID), knowledge: sz.readKnowledge(db, WS_ID), knowledgeFolders: sz.readKnowledgeFolders(db, WS_ID),
  savedViews: sz.readViews(db, WS_ID, u.id), notifs: sz.readNotifs(db, WS_ID, u.id), activity: sz.readActivity(db, WS_ID, 200), roles: readRoles(), caps: CAPS, mail: { transport: mailer.activeConfig().transport }, features: { impersonation: ALLOW_IMPERSONATION },
}));
route("GET", "/api/analytics", (u, p, q) => { forbid(can.viewAnalytics(u), "view analytics"); return analytics.compute(db, WS_ID, +(q.weeks || 8), /^\d{4}-\d{2}-\d{2}$/.test(q.to || "") ? q.to : null); });
/* ---------- AI proxies: the browser never sees the provider key ---------- */
const aiConf = (kind) => {
  const settings = sz.readAIRaw(db, WS_ID) || {}, processing = Object.assign({ externalEnabled: true }, settings.processing || {});
  if (!processing.externalEnabled) throw new HttpError(403, "External AI processing is disabled. An admin must enable it in Settings \\u2192 AI.");
  const c = Object.assign({}, settings[kind] || {});
  if (!c.key) throw new HttpError(400, "No " + kind + " API key configured. Add one in Settings \u2192 AI.");
  c.key = secrets.decrypt(c.key);
  let endpoint; try { endpoint = new URL(String(c.endpoint || "")); } catch { throw new HttpError(400, "The AI provider endpoint is invalid"); }
  const allowed = new Set(["api.anthropic.com", "generativelanguage.googleapis.com", "api.openai.com", "api.magnific.ai", "api.magnific.com", "api.freepik.com", "ai.sumopod.com"].concat(String(process.env.COS_AI_ALLOWED_HOSTS || "").split(",").map(s => s.trim()).filter(Boolean)));
  if (endpoint.protocol !== "https:" || !allowed.has(endpoint.hostname)) throw new HttpError(400, "The AI provider endpoint is not on the server allowlist");
  return c;
};
/* v17 §P1-1 — the server, not the browser, decides which model may run.
   A request names a registry entry; anything else is refused. Arbitrary
   model IDs from a client are never forwarded to the provider. */
const aiResolveRegistryModel = (registryId) => {
  const settings = sz.readAIRaw(db, WS_ID) || {};
  const models = Array.isArray(settings.models) && settings.models.length ? settings.models : null;
  if (!models) return null;                       // registry not configured yet
  const active = models.filter(m => m && m.active !== false);
  if (!active.length) throw new HttpError(400, "No AI model is active. An admin must enable one in Settings \u2192 AI & Integrations \u2192 Models.");
  if (!registryId) return active.find(m => m.isDefault) || active[0];
  const hit = active.find(m => m.id === registryId);
  if (!hit) throw new HttpError(400, "That AI model is not available in this workspace.");
  return hit;
};

const aiFetch = async (url, init, label, ms) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms || 45000);
  try {
    const r = await fetch(url, Object.assign({ signal: ctrl.signal }, init));
    const text = await r.text();
    let j; try { j = text ? JSON.parse(text) : {}; } catch { j = { raw: text }; }
    if (!r.ok) { const detail = (j.error && (j.error.message || (typeof j.error === "string" ? j.error : JSON.stringify(j.error)))) || j.message || (/^\s*</.test(text) ? "the provider answered with an HTML page instead of JSON (wrong endpoint?)" : text.slice(0, 300)); throw new HttpError(424, label + " provider error (" + r.status + "): " + String(detail).slice(0, 400)); }
    return j;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(424, e.name === "AbortError" ? label + " provider timed out \u2014 check the endpoint in Settings \u2192 AI." : label + " request failed: " + e.message + (e.cause && e.cause.code ? " (" + e.cause.code + ")" : ""));
  } finally { clearTimeout(timer); }
};

/* v38 image providers. v37 sent one Magnific-shaped body to every endpoint, so OpenAI and
   Gemini always rejected it. Each provider now gets its own request and response shape. */
function aiImageProvider(c, chosen, model) {
  const p = (chosen && chosen.provider) || c.provider || "";
  const m = String(model || "");
  const host = (() => { try { return new URL(c.endpoint).hostname; } catch { return ""; } })();
  if (/^(api\.)?magnific\.(com|ai)$|(^|\.)freepik\.com$/.test(host)) return "magnific";
  if (host === "api.openai.com") return "openai";
  if (host === "generativelanguage.googleapis.com") return "gemini";
  if (/^(gpt-image|dall-e)/i.test(m)) return "openai";
  if (/^(gemini|imagen)/i.test(m)) return "gemini";
  if (p) return p;
  return p || "magnific";
}
function aiPickFirstImage(j) {
  const d0 = Array.isArray(j.data) && j.data[0];
  const out = j.imageUrl || j.image_url || j.url || (typeof j.output === "string" ? j.output : null)
    || (Array.isArray(j.images) && j.images[0] && (j.images[0].url || (typeof j.images[0] === "string" ? j.images[0] : null)))
    || (j.data && Array.isArray(j.data.images) && j.data.images[0] && (j.data.images[0].url || (typeof j.data.images[0] === "string" ? j.data.images[0] : null)))
    || (d0 && (d0.url || (d0.b64_json && "data:image/png;base64," + d0.b64_json) || (Array.isArray(d0.generated) && d0.generated[0])))
    || (j.data && !Array.isArray(j.data) && (j.data.url || (Array.isArray(j.data.generated) && j.data.generated[0])))
    || (Array.isArray(j.output) && (typeof j.output[0] === "string" ? j.output[0] : j.output[0] && j.output[0].url));
  return typeof out === "string" && /^(https?:|data:image\/)/i.test(out) ? out : null;
}
async function aiImageCall(c, provider, body) {
  const ratio = body.width / body.height;
  if (provider === "openai") {
    const endpoint = /api\.openai\.com/.test(c.endpoint || "") && /images/.test(c.endpoint) ? c.endpoint : "https://api.openai.com/v1/images/generations";
    const model = body.model || "gpt-image-1";
    const size = /^dall-e-3/.test(model) ? (ratio > 1.2 ? "1792x1024" : ratio < 0.83 ? "1024x1792" : "1024x1024") : (ratio > 1.2 ? "1536x1024" : ratio < 0.83 ? "1024x1536" : "1024x1024");
    const req = { model, prompt: body.prompt + (body.negative_prompt ? "\n\nAvoid: " + body.negative_prompt : ""), size, n: 1 };
    if (/^dall-e/.test(model)) req.response_format = "b64_json";
    const j = await aiFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + c.key }, body: JSON.stringify(req) }, "Image", 90000);
    const url = aiPickFirstImage(j); if (!url) throw new HttpError(424, "OpenAI returned no image."); return url;
  }
  if (provider === "gemini") {
    const model = body.model || "gemini-2.5-flash-image";
    const base = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model);
    const headers = { "Content-Type": "application/json", "x-goog-api-key": c.key };
    const aspect = ratio > 1.6 ? "16:9" : ratio > 1.2 ? "4:3" : ratio < 0.62 ? "9:16" : ratio < 0.83 ? "3:4" : "1:1";
    const prompt = body.prompt + (body.negative_prompt ? "\n\nAvoid: " + body.negative_prompt : "");
    if (/^imagen/i.test(model)) {
      const j = await aiFetch(base + ":predict", { method: "POST", headers, body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: aspect } }) }, "Image", 90000);
      const p0 = (j.predictions || [])[0]; if (p0 && p0.bytesBase64Encoded) return "data:" + (p0.mimeType || "image/png") + ";base64," + p0.bytesBase64Encoded;
      throw new HttpError(424, "Imagen returned no image (the prompt may have been filtered).");
    }
    const j = await aiFetch(base + ":generateContent", { method: "POST", headers, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: aspect } } }) }, "Image", 90000);
    const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    const img = parts.find(p => p.inlineData || p.inline_data); const d = img && (img.inlineData || img.inline_data);
    if (d && d.data) return "data:" + (d.mimeType || d.mime_type || "image/png") + ";base64," + d.data;
    const said = parts.map(p => p.text || "").join(" ").trim();
    throw new HttpError(424, "Gemini returned no image" + (said ? ": " + said.slice(0, 200) : ". Use an image model such as gemini-2.5-flash-image or imagen-4.0-generate-001."));
  }
  /* Magnific / Freepik Mystic: async API. POST returns { data: { task_id, status } },
     then GET <endpoint>/<task_id> until COMPLETED. Custom endpoints keep the old body. */
  const mhost = (() => { try { return new URL(c.endpoint).hostname; } catch { return ""; } })();
  const isMystic = /(^|\.)(magnific\.com|magnific\.ai|freepik\.com)$/.test(mhost);
  const mheaders = { "Content-Type": "application/json", "Authorization": "Bearer " + c.key, "x-magnific-api-key": c.key, "x-freepik-api-key": c.key };
  let reqBody = body;
  if (isMystic) {
    const aspect = ratio > 1.9 ? "widescreen_16_9" : ratio > 1.6 ? "widescreen_16_9" : ratio > 1.4 ? "standard_3_2" : ratio > 1.2 ? "classic_4_3" : ratio < 0.53 ? "social_story_9_16" : ratio < 0.62 ? "social_story_9_16" : ratio < 0.72 ? "portrait_2_3" : ratio < 0.83 ? "traditional_3_4" : "square_1_1";
    const MYSTIC_MODELS = ["realism", "fluid", "zen", "flexible", "super_real", "editorial_portraits"];
    const m = String(body.model || "").toLowerCase();
    reqBody = { prompt: body.prompt + (body.negative_prompt ? "\n\nAvoid: " + body.negative_prompt : ""), aspect_ratio: aspect, resolution: process.env.COS_MYSTIC_RESOLUTION || "2k", model: MYSTIC_MODELS.includes(m) ? m : "realism", filter_nsfw: true };
  }
  const j = await aiFetch(c.endpoint, { method: "POST", headers: mheaders, body: JSON.stringify(reqBody) }, "Image", 90000);
  let url = aiPickFirstImage(j);
  const taskId = j && ((j.data && (j.data.task_id || j.data.taskId || j.data.id || j.data.uuid)) || j.task_id || j.taskId || j.id || j.uuid);
  if (!url && taskId && isMystic) {
    const pollUrl = c.endpoint.replace(/\/+$/, "") + "/" + encodeURIComponent(taskId);
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000));
      const t = await aiFetch(pollUrl, { method: "GET", headers: mheaders }, "Image", 30000);
      const st = String((t.data && t.data.status) || "").toUpperCase();
      if (st === "COMPLETED") { url = aiPickFirstImage(t); if (!url) throw new HttpError(424, "Magnific finished but returned no image URL."); return url; }
      if (st === "FAILED" || st === "ERROR") throw new HttpError(424, "Magnific generation failed (task " + taskId + ").");
    }
    throw new HttpError(424, "Magnific is still processing after 3 minutes (task " + taskId + "). Try again or lower the resolution.");
  }
  if (!url) throw new HttpError(424, "The provider returned no image URL" + (j.data && j.data.status ? " (task status: " + j.data.status + " \u2014 this endpoint works asynchronously and is not supported)" : "") + ". Keys seen: " + Object.keys(j).join(", "));
  return url;
}
route("POST", "/api/ai/image", async (u, p, q, b) => {
  forbid(can.useAIHub(u), "use AI Hub");
  const c = aiConf("image");
  const chosen = aiResolveRegistryModel(b.modelRegistryId);
  const body = {
    prompt: String(b.prompt || "").slice(0, 4000) + (c.defaultStyle ? "\n\nWorkspace brand requirements (take precedence over conflicting creative preferences):\n" + String(c.defaultStyle).slice(0,4000) : ""),
    negative_prompt: String(b.negativePrompt || "").slice(0, 1000),
    width: Math.max(64, Math.min(4096, +b.width || 1024)),
    height: Math.max(64, Math.min(4096, +b.height || 1024)),
    model: (chosen ? chosen.modelId : (b.model || c.model)) || undefined,
    num_images: 1
  };
  /* v18 §131 audit trail for Task-derived generations: who, which task, which
     tool and which admin/tool prompt versions. The base prompt text is never
     written to the log. */
  const brief = b.brief && typeof b.brief === "object" ? { taskId: String(b.brief.task_id || "").slice(0, 40), taskTitle: String(b.brief.task_title || "").slice(0, 160), toolId: String(b.brief.tool_id || "").slice(0, 40), adminPromptVersion: +b.brief.admin_prompt_version || null, toolPromptVersion: +b.brief.tool_prompt_version || null } : null;
  if (brief && brief.taskId && !db.prepare("SELECT 1 FROM tasks WHERE id=? AND workspace_id=?").get(brief.taskId, WS_ID)) throw new HttpError(403, "The selected task is not available.");
  const provider = aiImageProvider(c, chosen, body.model);
  security.log("ai_image_requested", { userId: u.id, provider, model: body.model, registryId: (chosen && chosen.id) || null, brief });
  const url = await aiImageCall(c, provider, body);
  return { imageUrl: url, raw: { model: body.model, provider } };
});

route("POST", "/api/ai/chat", async (u, p, q, b) => {
  forbid(can.useAIHub(u), "use AI Hub");
  const c = aiConf("chat");
  const processing = Object.assign({ workspaceContextEnabled: true }, (sz.readAIRaw(db, WS_ID) || {}).processing || {});
  if (b.context && !processing.workspaceContextEnabled) throw new HttpError(403, "Sending workspace context to AI is disabled by the workspace admin");
  const msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-14)
    .filter(m => m && (m.role === "user" || m.role === "assistant"))
    .map(m => ({ role: m.role, content: String(m.content || "").slice(0, 8000) }));
  if (!msgs.length) throw new HttpError(400, "No message to send");
  const latestQuestion = [...msgs].reverse().find(m => m.role === "user");
  const replyInIndonesian = /\b(apa|yang|dan|untuk|dengan|dari|pada|ini|itu|saya|kami|kamu|anda|tolong|bagaimana|berapa|siapa|proyek|tugas|terlambat|hari|minggu|kerja|cek|status|mohon|bisa|belum|sudah|ada|buat|lihat|tampilkan|ringkas|sekarang|mana|lebih|kurang|masih)\b/i.test((latestQuestion || {}).content || "");
  const languageRule = replyInIndonesian
    ? "Reply in Indonesian because the latest user question is in Indonesian. Keep task IDs, proper names, file names, and campaign names exactly as written."
    : "Reply in English because the latest user question is in English. Keep task IDs, proper names, file names, and campaign names exactly as written.";
  const workspaceContext = String(b.context || "").slice(0, 12000);
  const system = "You are AI Intelligence inside ZenCrevia for " + (db.prepare("SELECT name FROM workspaces WHERE id=?").get(WS_ID) || {}).name +
    ". Answer only from the workspace snapshot below. Be concise, cite task IDs. Never invent data. " + languageRule + "\n\n" +
    (c.systemExtra ? c.systemExtra + "\n\n" : "") + workspaceContext;
  const anthropic = c.provider === "anthropic" || /anthropic/i.test(c.endpoint || "");
  const gemini = c.provider === "gemini" || /generativelanguage\.googleapis\.com/.test(c.endpoint || "");
  const headers = { "Content-Type": "application/json" };
  let body, endpoint = c.endpoint;
  if (anthropic) {
    headers["x-api-key"] = c.key; headers["anthropic-version"] = "2023-06-01";
    body = { model: c.model || "claude-sonnet-4-6", max_tokens: 1500, system, messages: msgs };
  } else if (gemini) {
    endpoint = (endpoint || "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent").replace("{model}", encodeURIComponent(c.model || "gemini-3.5-flash"));
    headers["x-goog-api-key"] = c.key;
    body = { systemInstruction: { parts: [{ text: system }] }, contents: msgs.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })) };
  } else {
    headers["Authorization"] = "Bearer " + c.key;
    body = { model: c.model, max_tokens: 500, messages: [{ role: "system", content: system }].concat(msgs) };
  }
  security.log("ai_chat_requested", { userId: u.id, provider: c.provider || "chat", model: c.model, workspaceContext: !!b.context });
  const j = await aiFetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) }, "Chat", 60000);
  const directContent = typeof j.content === "string" ? j.content
    : Array.isArray(j.content) ? j.content.filter(x => x && x.type === "text").map(x => x.text || "").join("\n") : "";
  const choiceContent = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  const text = gemini ? (j.candidates && j.candidates[0] && j.candidates[0].content && (j.candidates[0].content.parts || []).map(p => p.text || "").join(""))
    : (directContent || (typeof choiceContent === "string" ? choiceContent : Array.isArray(choiceContent) ? choiceContent.map(x => x && (x.text || x.content || "")).join("") : ""));
  if (!text) throw new HttpError(502, "The model returned no text.");
  return { text };
});

route("PUT", "/api/workspace", (u, p, q, b, ctx) => { forbid(can.manageWorkspace(u), "change workspace settings"); const previous = sz.readAIRaw(db, WS_ID) || {}, before = previous.processing || {}; b.ai = b.ai || {}; b.ai.processing = Object.assign({ externalEnabled: true, workspaceContextEnabled: true }, before, b.ai.processing || {}); if ((!before.externalEnabled && b.ai.processing.externalEnabled) || (!before.workspaceContextEnabled && b.ai.processing.workspaceContextEnabled)) { b.ai.processing.acceptedAt = now(); b.ai.processing.acceptedBy = u.id; } else { b.ai.processing.acceptedAt = before.acceptedAt || null; b.ai.processing.acceptedBy = before.acceptedBy || null; } (b.cloud || []).forEach(c => { if (c.id === "gdrive") { c.config = c.config || {}; c.config.publicLinks = c.config.publicLinks === true; } }); tx(db, () => sz.writeWorkspace(db, WS_ID, b)); act(u, "edited", "workspace", WS_ID, { what: "workspace settings" }); security.log("workspace_security_settings_changed", { userId: u.id, ip: ctx.ip, aiExternal: !!b.ai.processing.externalEnabled, aiWorkspaceContext: !!b.ai.processing.workspaceContextEnabled, drivePublicLinks: !!(((b.cloud || []).find(c => c.id === "gdrive") || {}).config || {}).publicLinks }); return sz.readWorkspace(db, WS_ID); });
/* v38 connection test. "Connected" in Settings used to mean only "a key is stored". The server
   now makes a real, minimal call with the stored settings and records the outcome, and the UI
   shows Connected only after a passing check. */
function aiRecordCheck(kind, result) {
  const raw = sz.readAIRaw(db, WS_ID) || {}; raw[kind] = Object.assign({}, raw[kind] || {}, { lastCheck: result });
  db.prepare("UPDATE workspaces SET ai_settings=? WHERE id=?").run(JSON.stringify(raw), WS_ID);
}
route("POST", "/api/ai/test", async (u, p, q, b) => {
  forbid(can.manageWorkspace(u), "test AI providers");
  const kind = b.kind === "image" ? "image" : "chat";
  const handler = routes.find(r => r.method === "POST" && r.re.test("/api/ai/" + kind)).handler;
  const probe = kind === "chat" ? { messages: [{ role: "user", content: "Reply with the single word: ready" }] } : { prompt: "a plain neutral grey gradient, no subject", width: 1024, height: 1024, modelRegistryId: b.modelRegistryId || null };
  const started = Date.now();
  try {
    const out = await handler(u, {}, {}, probe);
    const result = { ok: true, at: now(), by: u.id, ms: Date.now() - started, sample: kind === "chat" ? String(out.text || "").slice(0, 60) : "image" };
    aiRecordCheck(kind, result); return Object.assign({ imageUrl: out.imageUrl || null }, result);
  } catch (e) {
    const result = { ok: false, at: now(), by: u.id, ms: Date.now() - started, error: String(e.message || e).slice(0, 400) };
    aiRecordCheck(kind, result); return result;
  }
});
/* v38 remove demo accounts and demo content from a live workspace (Settings → Backup & Data). */
const demoPurge = require("./demo-purge");
route("GET", "/api/admin/demo-data", (u) => { forbid(can.manageWorkspace(u) && can.manageMembers(u), "remove demo data"); return demoPurge.preview(db, WS_ID, u.id); });
route("POST", "/api/admin/demo-data/remove", (u, p, q, b, ctx) => { forbid(can.manageWorkspace(u) && can.manageMembers(u), "remove demo data"); const out = demoPurge.purge(db, WS_ID, u.id, { people: b.people !== false, content: b.content !== false }, releaseAccount); DATA_VERSION++; security.log("demo_data_removed", Object.assign({ adminId: u.id, ip: ctx.ip }, out)); return out; });
/* teams */
route("POST", "/api/teams", (u, p, q, b) => { forbid(can.manageTeams(u), "create teams"); b.id = b.id || uid("team"); b.sort = b.sort || (db.prepare("SELECT coalesce(max(sort_order),0)+1 s FROM teams WHERE workspace_id=?").get(WS_ID).s); tx(db, () => sz.writeTeam(db, WS_ID, b)); act(u, "team_created", "team", b.id, { team: b.id, what: b.name }); chat.ensureTeamDefaults(); /* v18 §3.1 create Team → #general */ return sz.readTeams(db, WS_ID); });
route("PUT", "/api/teams/:id", (u, p, q, b) => { forbid(can.manageTeams(u), "edit teams"); const old = db.prepare("SELECT color FROM teams WHERE id=?").get(p.id); b.id = p.id; tx(db, () => sz.writeTeam(db, WS_ID, b)); act(u, old && old.color !== b.color ? "team_color" : "edited", "team", p.id, { team: p.id, what: b.name + (old && old.color !== b.color ? " color" : "") }); return sz.readTeams(db, WS_ID); });
route("DELETE", "/api/teams/:id", (u, p) => { forbid(can.manageTeams(u), "archive teams"); tx(db, () => { db.prepare("UPDATE teams SET is_archived=1 WHERE id=?").run(p.id); db.prepare("UPDATE tasks SET team_id=NULL WHERE team_id=?").run(p.id); db.prepare("DELETE FROM team_memberships WHERE team_id=?").run(p.id); }); return sz.readTeams(db, WS_ID); });
route("POST", "/api/teams/reorder", (u, p, q, b) => { forbid(can.manageTeams(u), "reorder teams"); tx(db, () => (b.ids || []).forEach((id, i) => db.prepare("UPDATE teams SET sort_order=? WHERE id=? AND workspace_id=?").run(i + 1, id, WS_ID))); return sz.readTeams(db, WS_ID); });
/* members */
route("POST", "/api/members", (u, p, q, b) => { forbid(can.manageMembers(u), "add members"); b.name = String(b.name || "").trim(); if (!b.name || b.name.length > 120) throw new HttpError(400, "Name is required"); if (b.email) { b.email = String(b.email).trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) throw new HttpError(400, "Invalid email"); if (db.prepare("SELECT 1 FROM users WHERE lower(email)=?").get(b.email)) throw new HttpError(409, "That email is already used by another member"); } if (!b.ini) b.ini = b.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase(); if (b.id != null && !/^[A-Za-z0-9_-]{1,60}$/.test(String(b.id))) throw new HttpError(400, "Invalid member id"); let id = b.id || uid("u"); /* v38: never reuse the id of a removed account (it would bring back its old password) */ if (db.prepare("SELECT 1 FROM users WHERE id=?").get(id)) id = auth.userIdFor(b.name, db); tx(db, () => { sz.writePerson(db, WS_ID, id, b); db.prepare("UPDATE users SET is_active=1 WHERE id=?").run(id); }); act(u, "member_added", "user", id, { what: b.name }); return { id, people: sz.readPeople(db, WS_ID) }; });
route("PUT", "/api/members/:id", (u, p, q, b) => { forbid(can.manageMembers(u) || u.id === p.id, "edit members"); const existing = sz.readPeople(db, WS_ID)[p.id]; if (!existing) throw new HttpError(404, "Member not found"); b = Object.assign({}, existing, b || {}); b.name = String(b.name || "").trim(); if (!b.name || b.name.length > 120) throw new HttpError(400, "Name is required"); if (!b.ini) b.ini = b.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase(); if (!can.manageMembers(u)) { const cur = existing; b.perm = cur.perm; b.teams = cur.teams; b.stakeholder = cur.stakeholder; b.cap = cur.cap; b.active = cur.active; } /* v34: never leave the workspace without an admin (the last admin demoting themselves locked everyone out of members, backups and settings). */ if (existing.perm === "admin" && b.perm !== "admin" && !db.prepare("SELECT 1 FROM workspace_members m JOIN users x ON x.id=m.user_id WHERE m.workspace_id=? AND m.role_id='admin' AND x.is_active=1 AND m.user_id<>?").get(WS_ID, p.id)) throw new HttpError(400, "At least one active admin must remain. Make someone else an admin first."); if (b.email) { b.email = String(b.email).trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) throw new HttpError(400, "Invalid email"); const other = db.prepare("SELECT id FROM users WHERE lower(email)=? AND id!=?").get(b.email, p.id); if (other) throw new HttpError(409, "That email is already used by another member"); } if (b.avatar && String(b.avatar).length > 300000) throw new HttpError(413, "Profile photo too large"); if (b.avatar && !/^data:image\/(png|jpeg|webp);base64,/.test(b.avatar)) throw new HttpError(400, "Photo must be PNG/JPEG/WebP"); tx(db, () => sz.writePerson(db, WS_ID, p.id, b)); return sz.readPeople(db, WS_ID); });
route("DELETE", "/api/members/:id", (u, p) => { forbid(can.manageMembers(u), "remove members"); if (p.id === u.id) throw new HttpError(400, "You cannot remove yourself"); tx(db, () => { db.prepare("UPDATE tasks SET assignee_id=? WHERE assignee_id=?").run(u.id, p.id); db.prepare("UPDATE tasks SET reviewer_id=? WHERE reviewer_id=?").run(u.id, p.id); db.prepare("UPDATE projects SET owner_id=? WHERE owner_id=?").run(u.id, p.id); db.prepare("UPDATE teams SET team_lead_id=NULL WHERE team_lead_id=?").run(p.id); db.prepare("DELETE FROM project_members WHERE user_id=?").run(p.id); db.prepare("DELETE FROM team_memberships WHERE user_id=?").run(p.id); db.prepare("DELETE FROM workspace_members WHERE user_id=? AND workspace_id=?").run(p.id, WS_ID); releaseAccount(p.id); }); security.log("member_removed", { adminId: u.id, userId: p.id }); return sz.readPeople(db, WS_ID); });
route("POST", "/api/members/:id/team", (u, p, q, b) => { forbid(can.manageTeams(u), "change team membership"); tx(db, () => { if (b.isPrimary) db.prepare("UPDATE team_memberships SET is_primary=0 WHERE user_id=?").run(p.id); if (b.fromTeamId) db.prepare("DELETE FROM team_memberships WHERE user_id=? AND team_id=?").run(p.id, b.fromTeamId); db.prepare("INSERT INTO team_memberships (id,team_id,user_id,is_primary) VALUES (?,?,?,?) ON CONFLICT(team_id,user_id) DO UPDATE SET is_primary=excluded.is_primary").run("tm_" + b.teamId + "_" + p.id, b.teamId, p.id, b.isPrimary ? 1 : 0); if (!db.prepare("SELECT 1 FROM team_memberships WHERE user_id=? AND is_primary=1").get(p.id)) db.prepare("UPDATE team_memberships SET is_primary=1 WHERE id=(SELECT id FROM team_memberships WHERE user_id=? LIMIT 1)").run(p.id); }); act(u, "member_team", "user", p.id, { team: b.teamId, user: p.id }); return sz.readPeople(db, WS_ID); });
route("DELETE", "/api/members/:id/team/:teamId", (u, p) => { forbid(can.manageTeams(u), "change team membership"); tx(db, () => { db.prepare("DELETE FROM team_memberships WHERE user_id=? AND team_id=?").run(p.id, p.teamId); if (!db.prepare("SELECT 1 FROM team_memberships WHERE user_id=? AND is_primary=1").get(p.id)) db.prepare("UPDATE team_memberships SET is_primary=1 WHERE id=(SELECT id FROM team_memberships WHERE user_id=? LIMIT 1)").run(p.id); }); return sz.readPeople(db, WS_ID); });
/* projects */
/* v32: a POST (create) must not silently overwrite an existing row of the same id — that
   turns a create-only permission into edit-any. Callers pass the table to check. */
function rejectExistingId(table, id) { if (id != null && db.prepare("SELECT 1 FROM " + table + " WHERE id=?").get(id)) throw new HttpError(409, "An item with this ID already exists"); }
route("POST", "/api/projects", (u, p, q, b) => { forbid(can.createProject(u), "create projects"); b.id = b.id || uid("p"); rejectExistingId("projects", b.id); b.sort = b.sort || db.prepare("SELECT coalesce(max(sort_order),0)+1 s FROM projects WHERE workspace_id=?").get(WS_ID).s; tx(db, () => sz.writeProject(db, WS_ID, b)); act(u, "project_created", "project", b.id, { project: b.id, what: b.name }); return sz.readProjects(db, WS_ID); });
route("PUT", "/api/projects/:id", (u, p, q, b) => { const cur = sz.readProjects(db, WS_ID).find(x => x.id === p.id); if (!cur) throw new HttpError(404, "Project not found"); forbid(can.editProject(u, cur), "edit this project"); b.id = p.id; tx(db, () => sz.writeProject(db, WS_ID, b)); return sz.readProjects(db, WS_ID); });
route("DELETE", "/api/projects/:id", (u, p) => { forbid(can.deleteProject(u), "delete projects"); tx(db, () => db.prepare("DELETE FROM projects WHERE id=? AND workspace_id=?").run(p.id, WS_ID)); act(u, "deleted", "project", p.id, { what: "project " + p.id }); return sz.readProjects(db, WS_ID); });
route("POST", "/api/projects/:id/archive", (u, p, q, b) => { const cur = sz.readProjects(db, WS_ID).find(x => x.id === p.id); if (!cur) throw new HttpError(404, "Project not found"); forbid(can.editProject(u, cur), "archive this project"); cur.status = b.restore ? "done" : "archived"; if (b.restore) cur.archivedAt = null; tx(db, () => sz.writeProject(db, WS_ID, cur)); act(u, b.restore ? "project_restored" : "project_archived", "project", p.id, { project: p.id, what: cur.name }); return sz.readProjects(db, WS_ID); });
route("POST", "/api/projects/reorder", (u, p, q, b) => { forbid(can.createProject(u), "reorder projects"); tx(db, () => (b.ids || []).forEach((id, i) => db.prepare("UPDATE projects SET sort_order=? WHERE id=? AND workspace_id=?").run(i + 1, id, WS_ID))); return sz.readProjects(db, WS_ID); });
/* tasks */
/* ---- v32 task write integrity ---------------------------------------------------------
   The task write path (serialize.writeTask) replaces every child collection from the body.
   Without these guards any editor could rewrite or forge other people's comments, invent
   activity-log entries, self-assign as reviewer, or stamp a version "approved". */
function sanitizeComments(prevComments, bodyComments, u) {
  const prev = new Map((prevComments || []).map(c => [c.id, c]));
  const canModerate = can.has ? false : false; // moderation handled per-comment below
  const out = [];
  (Array.isArray(bodyComments) ? bodyComments : []).forEach(c => {
    if (!c) return;
    const old = c.id && prev.get(c.id);
    if (old) { out.push(Object.assign({}, old, { text: old.author_id === u.id || old.by === u.id || can.manageWorkspace(u) ? String(c.text != null ? c.text : old.text) : old.text, vis: old.vis })); prev.delete(c.id); }
    else out.push({ id: /^[-\w]{1,40}$/.test(String(c.id || "")) ? c.id : uid("cm"), by: u.id, createdAt: now(), vis: c.vis === "internal" ? "internal" : c.vis === "client" ? "client" : "team", text: String(c.text || ""), parent: c.parent || null, attachments: Array.isArray(c.attachments) ? c.attachments.slice(0, 10) : [] });
  });
  /* keep other people's comments even if the client dropped them; only the author or an
     admin may delete, and that path is a dedicated route, not a task PUT. */
  prev.forEach(old => { if (!(old.by === u.id || old.author_id === u.id || can.manageWorkspace(u))) out.push(old); });
  return out;
}
function sanitizeVersions(prevVersions, bodyVersions, u, decided) {
  const prev = new Map((prevVersions || []).map(v => [v.n, v]));
  const okDecision = new Set(decided.map(v => v.n));
  return (Array.isArray(bodyVersions) ? bodyVersions : []).map(v => {
    const old = prev.get(v.n);
    if (!old) return Object.assign({}, v, { by: u.id, decidedBy: v.state === "pending" || !v.state ? null : (okDecision.has(v.n) ? u.id : null), decidedAt: okDecision.has(v.n) ? now() : null });
    const stateChanged = old.state !== v.state;
    if (stateChanged && okDecision.has(v.n)) return Object.assign({}, old, { state: v.state, note: v.note != null ? v.note : old.note, reason: v.reason, decidedBy: u.id, decidedAt: now() });
    return Object.assign({}, old, { note: v.note != null && (old.by === u.id) ? v.note : old.note, state: old.state, decidedBy: old.decidedBy, decidedAt: old.decidedAt, by: old.by });
  });
}
function sanitizeTaskWrite(cur, b, u, decided) {
  b.comments = sanitizeComments(cur.comments, b.comments, u);
  b.versions = sanitizeVersions(cur.versions, b.versions, u, decided);
  b.activity = cur.activity; /* activity is append-only, written server-side elsewhere */
  return b;
}
function nextTaskNumber() { const r = db.prepare("SELECT max(CAST(substr(id,3) AS INTEGER)) n FROM tasks WHERE id GLOB 'T-[0-9]*'").get(); return "T-" + Math.max(101, (r && r.n || 100) + 1); }
function sanitizeNewTask(b, u) {
  b.comments = (Array.isArray(b.comments) ? b.comments : []).map(c => ({ id: uid("cm"), by: u.id, createdAt: now(), vis: c && c.vis === "internal" ? "internal" : "team", text: String((c && c.text) || ""), parent: null, attachments: [] })).filter(c => c.text);
  b.versions = (Array.isArray(b.versions) ? b.versions : []).map(v => Object.assign({}, v, { by: u.id, state: "pending", decidedBy: null, decidedAt: null }));
  b.activity = [];
  return b;
}
route("POST", "/api/tasks", (u, p, q, b) => { const firstStage = db.prepare("SELECT id FROM task_statuses WHERE workspace_id=? AND is_archived=0 ORDER BY sort_order LIMIT 1").get(WS_ID); const isRequest = can.submitRequest(u) && firstStage && b.status === firstStage.id && !b.assignee; forbid(can.createTask(u, b) || isRequest, "create tasks"); if (isRequest && !can.createTask(u, b)) { b.createdBy = u.id; b.tags = (b.tags || []).concat(["request"]); } if (!b.title || String(b.title).length > 240) throw new HttpError(400, "A title under 240 characters is required"); if (b.id != null && !security.validTaskId(b.id)) throw new HttpError(400, "Task ID contains unsupported characters"); /* v39: the server owns task numbers. Browsers still propose T-<n> (their best guess from what
     they have loaded); when two people create at the same moment the second gets the next free
     number instead of a 409 — an existing task is still never overwritten. */
  if (!b.id || /^T-\d+$/.test(b.id)) { const want = b.id; if (!want || db.prepare("SELECT 1 FROM tasks WHERE id=?").get(want)) b.id = nextTaskNumber(); }
  if (db.prepare("SELECT 1 FROM tasks WHERE id=?").get(b.id)) throw new HttpError(409, "A task with this ID already exists"); b.sort = b.sort || db.prepare("SELECT coalesce(max(sort_order),0)+1000 s FROM tasks WHERE workspace_id=?").get(WS_ID).s;
  /* v32: creation never carries server-owned history or decisions from the client. */
  gateStatusChange(u, null, Object.assign({}, b, { assignee: b.assignee, assignees: b.assignees }), b.status);
  b = sanitizeNewTask(b, u); validateStoredFiles(b, u.id); validateDependencies(b.id, b.dependencies || []); tx(db, () => sz.writeTask(db, WS_ID, b, u.id)); return sz.readTask(db, b.id); });
route("PUT", "/api/tasks/:id", (u, p, q, b) => {
  const cur = sz.readTask(db, p.id); if (!cur) throw new HttpError(404, "Task not found");
  if (b && b._slim) b = sz.mergeSlimTask(cur, b); /* never wipe history from a slim copy */
  /* v34 concurrent edits. The client sends the revision it loaded (_rev) and the fields it
     changed (_changed). If someone saved in between, only the caller's changed fields are
     applied on top of the latest version, so two people editing different fields both keep
     their work. Without _changed a stale save is refused (409) instead of overwriting. */
  let merged = null;
  if (b && b._rev && cur.updatedAt && b._rev !== cur.updatedAt) {
    if (!Array.isArray(b._changed)) { const e = new HttpError(409, "Someone else changed this task while you were editing. Reload it and try again."); throw e; }
    const allowed = new Set(["title","description","proj","team","status","prio","assignee","reviewer","assignees","reviewers","hidden","startDate","dueDate","effort","assetCount","labels","parent","tags","dependencies","brief","custom","meta","versions","files","comments"]);
    const fields = b._changed.filter(k => allowed.has(k));
    const next = JSON.parse(JSON.stringify(cur)); fields.forEach(k => { next[k] = b[k]; });
    merged = fields; b = next;
  }
  forbid(can.editTask(u, cur), "edit this task");
  if (b.assignee !== cur.assignee || JSON.stringify(b.assignees || []) !== JSON.stringify(cur.assignees || [])) forbid(can.assignTask(u, cur), "assign this task");
  if (b.reviewer !== cur.reviewer || JSON.stringify(b.reviewers || []) !== JSON.stringify(cur.reviewers || [])) forbid(can.assignTask(u, cur), "change the reviewer on this task");
  const decided = (b.versions || []).filter(v => { const o = cur.versions.find(x => x.n === v.n); return o && o.state !== v.state && (v.state === "approved" || v.state === "revision"); });
  if (decided.length) forbid(can.approveTask(u, cur), "approve or send back this task");
  if ((b.versions || []).length > cur.versions.length || (b.files || []).length > cur.files.length) forbid(can.uploadFile(u, cur), "upload files to this task");
  /* v32: comments, activity, and version authorship/decision metadata are server-owned.
     Take them from the stored task; only genuinely new comments by this user are added,
     and a version's decision fields are only what the authz checks above allowed. */
  gateStatusChange(u, cur, b, b.status);
  b = sanitizeTaskWrite(cur, b, u, decided);
  b.id = p.id; validateStoredFiles(b, u.id); validateDependencies(b.id, b.dependencies || []);
  tx(db, () => { sz.writeTask(db, WS_ID, b, u.id); decided.forEach(v => { const row = db.prepare("SELECT id FROM file_versions WHERE task_id=? AND version_number=?").get(p.id, v.n); if (v.state === "approved") db.prepare("INSERT INTO approvals (id,task_id,version_id,decided_by,decision) VALUES (?,?,?,?,?)").run(uid("ap"), p.id, row.id, u.id, "approved"); else db.prepare("INSERT INTO revision_requests (id,task_id,version_id,requested_by,reason,feedback,priority) VALUES (?,?,?,?,?,?,?)").run(uid("rr"), p.id, row.id, u.id, v.reason || "Revision requested", v.feedback || "", b.prio || null); }); });
  { const out = sz.readTask(db, p.id); if (merged) out._merged = merged; return out; }
});
route("DELETE", "/api/tasks/:id", (u, p) => { forbid(can.deleteTask(u), "delete tasks"); tx(db, () => db.prepare("DELETE FROM tasks WHERE id=? AND workspace_id=?").run(p.id, WS_ID)); act(u, "deleted", "task", p.id, { what: "task " + p.id }); return { ok: true }; });
route("POST", "/api/tasks/:id/move", (u, p, q, b) => moveTask(u, p.id, b));
route("POST", "/api/tasks/:id/hidden", (u, p, q, b) => { const cur = sz.readTask(db, p.id); if (!cur) throw new HttpError(404, "Task not found"); forbid(can.editTask(u, cur), "hide this task"); db.prepare("UPDATE tasks SET is_hidden=?, updated_at=? WHERE id=?").run(b.hidden ? 1 : 0, now(), p.id); act(u, b.hidden ? "hidden" : "unhidden", "task", p.id, { task: p.id }); return sz.readTask(db, p.id); });
/* requests */
route("POST", "/api/requests", (u, p, q, b) => { forbid(can.submitRequest(u), "submit requests"); b.id = b.id || uid("R"); rejectExistingId("creative_requests", b.id); b.by = u.id; b.status = "submitted"; tx(db, () => sz.writeRequest(db, WS_ID, b)); act(u, "request", "request", b.id, { request: b.id, what: b.title }); return sz.readRequests(db, WS_ID); });
route("PUT", "/api/requests/:id", (u, p, q, b) => { const cur = sz.readRequests(db, WS_ID).find(r => r.id === p.id); if (!cur) throw new HttpError(404, "Request not found"); if (b.status !== cur.status || b.converted !== cur.converted) forbid(can.decideRequest(u), "decide on requests"); else forbid(can.decideRequest(u) || cur.by === u.id, "edit this request"); b.id = p.id; b.by = cur.by; b.createdAt = cur.createdAt; tx(db, () => sz.writeRequest(db, WS_ID, b)); if (b.status !== cur.status) act(u, "request_" + b.status, "request", p.id, { request: p.id, what: b.title }); return sz.readRequests(db, WS_ID); });
route("DELETE", "/api/requests/:id", (u, p) => { forbid(can.decideRequest(u), "delete requests"); db.prepare("DELETE FROM creative_requests WHERE id=? AND workspace_id=?").run(p.id, WS_ID); return sz.readRequests(db, WS_ID); });
/* assets / folders */
route("POST", "/api/assets", (u, p, q, b) => { forbid(can.manageAssets(u), "add assets"); if (b.img) { validateEmbeddedImage(b.img, "Asset preview"); b.img = uploads.externalize(db, b.img, u.id, "Asset preview"); } if (b.url) safeHttpsUrl(b.url, "Asset link"); b.id = b.id || uid("as"); rejectExistingId("assets", b.id); b.by = u.id; tx(db, () => sz.writeAsset(db, WS_ID, b)); act(u, "asset", "asset", b.id, { what: b.name }); return sz.readAssets(db, WS_ID); });
route("PUT", "/api/assets/:id", (u, p, q, b) => { forbid(can.manageAssets(u), "edit assets"); if (b.img) { validateEmbeddedImage(b.img, "Asset preview"); b.img = uploads.externalize(db, b.img, u.id, "Asset preview"); } if (b.url) safeHttpsUrl(b.url, "Asset link"); b.id = p.id; tx(db, () => sz.writeAsset(db, WS_ID, b)); return sz.readAssets(db, WS_ID); });
route("DELETE", "/api/assets/:id", (u, p) => { forbid(can.manageAssets(u), "delete assets"); db.prepare("DELETE FROM assets WHERE id=? AND workspace_id=?").run(p.id, WS_ID); return sz.readAssets(db, WS_ID); });
route("POST", "/api/folders", (u, p, q, b) => { forbid(can.manageAssets(u), "create folders"); b.id = b.id || uid("f"); rejectExistingId("asset_folders", b.id); b.sort = b.sort || db.prepare("SELECT coalesce(max(sort_order),0)+1 s FROM asset_folders WHERE workspace_id=?").get(WS_ID).s; tx(db, () => sz.writeFolder(db, WS_ID, b)); return sz.readFolders(db, WS_ID); });
route("DELETE", "/api/folders/:id", (u, p) => { forbid(can.manageAssets(u), "delete folders"); db.prepare("DELETE FROM asset_folders WHERE id=? AND workspace_id=?").run(p.id, WS_ID); return sz.readFolders(db, WS_ID); });
/* knowledge */
route("POST", "/api/knowledge", (u, p, q, b) => { forbid(can.manageKnowledge(u), "create pages"); b.id = b.id || uid("k"); rejectExistingId("knowledge_pages", b.id); b.by = u.id; tx(db, () => sz.writePage(db, WS_ID, b)); return sz.readKnowledge(db, WS_ID); });
route("PUT", "/api/knowledge/:id", (u, p, q, b) => { forbid(can.manageKnowledge(u), "edit pages"); b.id = p.id; b.updatedAt = now(); tx(db, () => sz.writePage(db, WS_ID, b)); return sz.readKnowledge(db, WS_ID); });
route("DELETE", "/api/knowledge/:id", (u, p) => { forbid(can.manageKnowledge(u), "delete pages"); db.prepare("DELETE FROM knowledge_pages WHERE id=? AND workspace_id=?").run(p.id, WS_ID); return sz.readKnowledge(db, WS_ID); });
route("POST", "/api/knowledge-folders", (u, p, q, b) => { forbid(can.manageKnowledge(u), "create knowledge folders"); if (!String(b.name||"").trim()) throw new HttpError(400,"Folder name is required"); b.id=b.id||uid("kf"); b.sort=b.sort||db.prepare("SELECT coalesce(max(sort_order),0)+1 s FROM knowledge_folders WHERE workspace_id=?").get(WS_ID).s; sz.writeKnowledgeFolder(db,WS_ID,b); return sz.readKnowledgeFolders(db,WS_ID); });
route("DELETE", "/api/knowledge-folders/:id", (u, p) => { forbid(can.manageKnowledge(u), "delete knowledge folders"); const f=db.prepare("SELECT * FROM knowledge_folders WHERE id=? AND workspace_id=?").get(p.id,WS_ID); if(!f) throw new HttpError(404,"Folder not found"); tx(db,()=>{ db.prepare("UPDATE knowledge_pages SET folder='General' WHERE workspace_id=? AND folder=?").run(WS_ID,f.name); db.prepare("DELETE FROM knowledge_folders WHERE id=? AND workspace_id=?").run(p.id,WS_ID); }); return {folders:sz.readKnowledgeFolders(db,WS_ID),knowledge:sz.readKnowledge(db,WS_ID)}; });
/* saved views */
/* v29 saved views: validated body, and a view can only ever be written by its owner
   (the upsert used to let anyone overwrite another member's view by id). */
const cleanView = b => { const name = String(b.name || "").trim(); if (!name || name.length > 120) throw new HttpError(400, "A view name under 120 characters is required"); if (b.id != null && !/^[A-Za-z0-9_-]{1,80}$/.test(String(b.id))) throw new HttpError(400, "Invalid view id"); return Object.assign({}, b, { name, type: String(b.type || "list").slice(0, 40), sort: b.sort == null ? null : String(b.sort).slice(0, 200), group: b.group == null ? null : String(b.group).slice(0, 200), filters: b.filters && typeof b.filters === "object" ? b.filters : {}, fields: Array.isArray(b.fields) ? b.fields : [], config: b.config && typeof b.config === "object" ? b.config : {} }); };
route("POST", "/api/views", (u, p, q, b) => { const v = cleanView(b); v.id = v.id || uid("sv"); const other = db.prepare("SELECT owner_id FROM saved_views WHERE id=?").get(v.id); if (other && other.owner_id !== u.id) v.id = uid("sv"); v.owner = u.id; tx(db, () => sz.writeView(db, WS_ID, v)); return sz.readViews(db, WS_ID, u.id); });
route("PUT", "/api/views/:id", (u, p, q, b) => { const cur = db.prepare("SELECT owner_id FROM saved_views WHERE id=? AND workspace_id=?").get(p.id, WS_ID); if (!cur || cur.owner_id !== u.id) throw new HttpError(404, "View not found"); const v = cleanView(b); v.id = p.id; v.owner = u.id; tx(db, () => sz.writeView(db, WS_ID, v)); return sz.readViews(db, WS_ID, u.id); });
route("DELETE", "/api/views/:id", (u, p) => { db.prepare("DELETE FROM saved_views WHERE id=? AND owner_id=?").run(p.id, u.id); return sz.readViews(db, WS_ID, u.id); });
/* notifications + activity */
/* v29 client-raised notifications: they trigger real email, so they must point at a real
   entity, use a known kind, reach a bounded number of people and be rate limited per
   sender. Free text is not accepted; the email body is built from the entity. */
const NOTIF_KINDS = new Set(["approved", "assigned", "comment", "file", "mention", "request", "revision", "status", "upload", "watch", "deadline", "transition", "request_status"]);
const notifRate = new Map();
route("POST", "/api/notifications", (u, p, q, b) => { const k = String(b.k || ""); if (!NOTIF_KINDS.has(k)) throw new HttpError(400, "Unknown notification type"); const entityType = ["task", "project", "request"].includes(b.entityType || "task") ? (b.entityType || "task") : null; if (!entityType) throw new HttpError(400, "Unsupported notification target"); const table = { task: "tasks", project: "projects", request: "creative_requests" }[entityType]; b.t = String(b.t || ""); if (!db.prepare("SELECT 1 FROM " + table + " WHERE id=? AND workspace_id=?").get(b.t, WS_ID)) throw new HttpError(404, "The item for this notification does not exist"); const recips = [...new Set((Array.isArray(b.recipients) ? b.recipients : [b.recipient]).filter(Boolean).map(String))]; if (recips.length > 25) throw new HttpError(400, "Too many recipients"); const minute = Math.floor(Date.now() / 60000), rk = u.id, rs = notifRate.get(rk); const cur = rs && rs.minute === minute ? rs : { minute, n: 0 }; if (cur.n + recips.length > 60) throw new HttpError(429, "Too many notifications. Try again in a minute."); cur.n += recips.length; notifRate.set(rk, cur); b = { k, t: b.t, entityType, recipients: recips }; const ids = []; recips.forEach(r => { if (r !== u.id && db.prepare("SELECT 1 FROM workspace_members WHERE user_id=? AND workspace_id=?").get(r, WS_ID)) { const id = uid("nt"); sz.writeNotif(db, WS_ID, { id, recipient: r, who: u.id, k: b.k, t: b.t, entityType: b.entityType }); ids.push(id); } }); setImmediate(() => ids.forEach(emailNotification)); return sz.readNotifs(db, WS_ID, u.id); });
route("GET", "/api/mail/status", (u) => { forbid(can.manageWorkspace(u), "view email diagnostics"); return { transport: mailer.cfg.transport, from: mailer.cfg.from, outbox: mailer.cfg.transport === "log" ? mailer.cfg.outbox : null, sent: mailer.state.sent, failed: mailer.state.failed, lastError: mailer.state.lastError, lastTo: mailer.state.lastTo, lastAt: mailer.state.lastAt, pending: db.prepare("SELECT count(*) n FROM notifications WHERE emailed_at IS NULL AND email_error IS NOT NULL").get().n }; });
route("POST", "/api/mail/test", (u) => { forbid(can.manageWorkspace(u), "send test email"); const me = db.prepare("SELECT email, name FROM users WHERE id=?").get(u.id); if (!me || !me.email) throw new HttpError(400, "Your user has no email address"); const ws = sz.readWorkspace(db, WS_ID); return mailer.send({ to: me.email, subject: "[" + ws.name + "] Test email from ZenCrevia", text: "Hi " + me.name.split(" ")[0] + ", this is a test message. If you can read this, email notifications work.", meta: { Transport: mailer.cfg.transport }, link: mailer.link("/"), workspace: ws.name }).then(r => ({ ok: true, transport: mailer.cfg.transport, result: r && r.file ? { file: path.basename(r.file) } : r })).catch(e => { throw new HttpError(502, "Send failed: " + e.message); }); });
route("POST", "/api/notifications/read", (u, p, q, b) => { if (b.all) db.prepare("UPDATE notifications SET read_at=? WHERE recipient_id=? AND read_at IS NULL").run(now(), u.id); else (b.ids || []).forEach(id => db.prepare("UPDATE notifications SET read_at=? WHERE id=? AND recipient_id=?").run(now(), id, u.id)); if (b.entityId) db.prepare("UPDATE notifications SET read_at=? WHERE entity_id=? AND recipient_id=? AND read_at IS NULL").run(now(), b.entityId, u.id); return sz.readNotifs(db, WS_ID, u.id); });
route("POST", "/api/activity", (u, p, q, b) => { const allowed = new Set(["created","edited","moved","assigned","deadline","commented","mentioned","uploaded","approved","revision","file","request","request_submitted","request_approved","request_rejected","hidden","unhidden","team","asset","project_created","member_team"]); if (!allowed.has(String(b.k || ""))) throw new HttpError(400, "Unknown activity type"); const entityType = ["workspace","task","project","asset","request"].includes(b.entityType) ? b.entityType : "workspace"; act(u, b.k, entityType, String(b.entityId || WS_ID).slice(0, 100), b.a || {}); return sz.readActivity(db, WS_ID, 200); });
/* ============================================================
   v17 §P1-4 — SMTP setup from the Admin dashboard
   Credentials are stored server-side, encrypted, and never returned after
   save. "Test connection" and "Send test email" can both exercise an unsaved
   form so an admin can prove the settings before committing them.
   ============================================================ */
const smtpFromBody = (b, stored) => ({
  enabled: b.enabled !== undefined ? !!b.enabled : true,
  host: String(b.host || "").trim(), port: +b.port || 587, secure: !!b.secure,
  user: String(b.user || "").trim(),
  /* a blank password in the form means "use the one already stored" */
  pass: b.pass ? String(b.pass) : (stored ? stored.pass : ""),
  fromName: String(b.fromName || "").trim(), fromEmail: String(b.fromEmail || "").trim(),
  replyTo: String(b.replyTo || "").trim()
});
route("GET", "/api/mail/smtp", (u) => {
  forbid(can.manageWorkspace(u), "view email settings");
  return { config: sz.readSmtp(db, WS_ID), presets: mailer.PROVIDER_PRESETS, active: mailer.activeConfig().source, secretsReady: !!process.env.COS_SECRET_KEY };
});
route("PUT", "/api/mail/smtp", (u, p, q, b, ctx) => {
  forbid(can.manageWorkspace(u), "change email settings");
  if (b.enabled && !String(b.host || "").trim()) throw new HttpError(400, "Enter the SMTP host");
  if (b.enabled && !String(b.fromEmail || "").trim()) throw new HttpError(400, "Enter the sender email address");
  if (b.fromEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(b.fromEmail).trim())) throw new HttpError(400, "The sender email address is not valid");
  if (b.replyTo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(b.replyTo).trim())) throw new HttpError(400, "The reply-to address is not valid");
  const saved = sz.writeSmtp(db, WS_ID, b, secrets, u.id);
  mailer.setStoredConfig(sz.smtpRuntime(db, WS_ID, secrets));
  security.log("smtp_settings_saved", { userId: u.id, ip: ctx && ctx.ip, host: saved.host, enabled: saved.enabled });
  return saved;
});
route("POST", "/api/mail/smtp/test", (u, p, q, b) => {
  forbid(can.manageWorkspace(u), "test email settings");
  const stored = sz.smtpRuntime(db, WS_ID, secrets) || {};
  const conf = smtpFromBody(b || {}, stored);
  return mailer.verifySmtp(conf)
    .then(r => ({ ok: true, encryption: r.encryption, authenticated: r.authenticated }))
    .catch(e => { throw new HttpError(502, "Could not connect: " + e.message); });
});
route("POST", "/api/mail/smtp/send-test", (u, p, q, b) => {
  forbid(can.manageWorkspace(u), "send a test email");
  const me = db.prepare("SELECT email, name FROM users WHERE id=?").get(u.id);
  const to = String((b && b.to) || (me && me.email) || "").trim();
  if (!to) throw new HttpError(400, "Enter an address to send the test to");
  const stored = sz.smtpRuntime(db, WS_ID, secrets) || {};
  const form = smtpFromBody(b || {}, stored);
  const ws = sz.readWorkspace(db, WS_ID);
  const conf = { transport: "smtp", from: form.fromName ? form.fromName + " <" + form.fromEmail + ">" : form.fromEmail, smtp: { host: form.host, port: form.port, user: form.user, pass: form.pass, secure: form.secure } };
  return mailer.sendWith(conf, { to, subject: "[" + ws.name + "] SMTP test", text: "This is a test message from ZenCrevia. If you can read it, your SMTP settings work.", meta: { Host: form.host, Port: String(form.port) }, link: mailer.link("/"), workspace: ws.name })
    .then(() => ({ ok: true, to }))
    .catch(e => { throw new HttpError(502, "Send failed: " + e.message); });
});
/* §10 delivery logs — what actually happened to the last messages. */
route("GET", "/api/mail/log", (u) => {
  forbid(can.manageWorkspace(u), "view delivery logs");
  /* the columns are recipient_id and type — an older name for them here made
     every call to this endpoint raise a SQLite error, so the Delivery log panel
     silently stayed empty (the browser swallows the failure). */
  const rows = db.prepare("SELECT id, recipient_id, type, emailed_at, email_error FROM notifications WHERE emailed_at IS NOT NULL OR email_error IS NOT NULL ORDER BY COALESCE(emailed_at,'') DESC LIMIT 50").all();
  return { entries: rows.map(r => ({ id: r.id, to: r.recipient_id, kind: r.type, at: r.emailed_at, error: r.email_error })), state: mailer.state };
});

/* ============================================================
   v17 §P1-5 — Backup History, restore, rollback, retention, audit
   ============================================================ */
function backupSchedule(settings) {
  const env = process.env.COS_BACKUP_INTERVAL_HOURS;
  if (env != null && env !== "") { const h = Math.max(0, +env || 0); return { source: "environment", intervalHours: h, mode: h ? "every " + h + "h" : "off" }; }
  const mode = settings && ["off", "daily", "weekly"].includes(settings.auto) ? settings.auto : (security.IS_PRODUCTION ? "daily" : "off");
  return { source: settings && settings.auto ? "dashboard" : "default", intervalHours: mode === "daily" ? 24 : mode === "weekly" ? 168 : 0, mode };
}
const backupSettings = () => {
  try { const w = db.prepare("SELECT backup_settings FROM workspaces WHERE id=?").get(WS_ID); return JSON.parse((w && w.backup_settings) || "{}") || {}; }
  catch { return {}; }
};
route("GET", "/api/backups", (u) => {
  forbid(can.manageWorkspace(u), "view backups");
  const settings = backupSettings();
  const items = backups.list().map(b => Object.assign({}, b, { integrityStatus: backups.verifyStored(b.name).status }));
  return {
    configured: !!process.env.COS_BACKUP_KEY,
    backups: items,
    settings: { keep: backups.retention(settings), auto: settings.auto || "off", lastAutoAt: settings.lastAutoAt || null, offsite: settings.offsite || "" },
    schedule: backupSchedule(settings),
    storage: { dir: backups.BACKUP_DIR, count: items.length, bytes: items.reduce((n, b) => n + b.bytes, 0) },
    audit: backups.auditLog().slice(0, 25)
  };
});
route("GET", "/api/backups/:name", (u, p) => {
  forbid(can.manageWorkspace(u), "view backups");
  const meta = backups.readMeta(p.name);
  if (!meta || !meta.name) throw new HttpError(404, "That backup no longer exists");
  return Object.assign({}, meta, { integrity: backups.verifyStored(p.name) });
});
route("PUT", "/api/backups/settings", (u, p, q, b, ctx) => {
  forbid(can.manageWorkspace(u), "change backup settings");
  const cur = backupSettings();
  const next = Object.assign({}, cur, {
    keep: Math.max(3, Math.min(365, +b.keep || backups.retention(cur))),
    auto: ["off", "daily", "weekly"].includes(b.auto) ? b.auto : (cur.auto || "off"),
    offsite: String(b.offsite || cur.offsite || "").slice(0, 500)
  });
  db.prepare("UPDATE workspaces SET backup_settings=? WHERE id=?").run(JSON.stringify(next), WS_ID);
  security.log("backup_settings_saved", { userId: u.id, ip: ctx && ctx.ip, keep: next.keep, auto: next.auto });
  return next;
});
/* §P1-5 restore is staged, takes a safety backup first, and rolls back on
   failure. It never silently overwrites the live database. */
route("POST", "/api/backups/:name/restore", (u, p, q, b, ctx) => {
  forbid(can.manageWorkspace(u), "restore backups");
  if (!process.env.COS_BACKUP_KEY) throw new HttpError(400, "Encrypted backups are not configured. Set COS_BACKUP_KEY on the server.");
  if (!b || b.confirm !== p.name) throw new HttpError(400, "Type the backup name to confirm the restore");
  const { DB_PATH } = require("./db");
  try {
    const r = backups.safeRestore(db, p.name, DB_PATH, {
      userId: u.id,
      closeDatabase: (handle) => handle.close(),
      reopenDatabase: () => {
        const nextDb = open();
        try {
          const workspace = nextDb.prepare("SELECT id FROM workspaces LIMIT 1").get();
          if (!workspace) throw new Error("The restored database does not contain a workspace");
          db = nextDb;
          WS_ID = workspace.id;
          try { mailer.setStoredConfig(sz.smtpRuntime(db, WS_ID, secrets)); } catch (e) { console.warn("[mail] restored SMTP config unavailable:", e.message); }
          return db;
        } catch (e) {
          try { nextDb.close(); } catch {}
          throw e;
        }
      }
    });
    security.log("backup_restored", { userId: u.id, ip: ctx && ctx.ip, name: p.name, safetyBackup: r.safetyBackup });
    return r;
  } catch (e) {
    security.log("backup_restore_failed", { userId: u.id, ip: ctx && ctx.ip, name: p.name, error: e.message, rolledBack: !!e.rolledBack });
    /* v34: say why. A corrupted or tampered file is refused before anything changes; the
       admin used to see only "Server error". */
    if (/^Refusing to restore|no longer exists|must be inside|does not contain a workspace|Unsupported|decrypt|authenticate/i.test(e.message)) throw new HttpError(422, e.message + " Nothing was changed.");
    throw new HttpError(500, "Restore failed" + (e.rolledBack ? " and the previous database was put back" : "") + ": " + e.message);
  }
});
route("POST", "/api/backups/:name/verify", (u, p) => {
  forbid(can.manageWorkspace(u), "verify backups");
  return backups.verifyStored(p.name);
});
route("DELETE", "/api/backups/:name", (u, p, q, b, ctx) => {
  forbid(can.manageWorkspace(u), "delete backups");
  const r = backups.remove(p.name);
  security.log("backup_deleted", { userId: u.id, ip: ctx && ctx.ip, name: p.name });
  return r;
});
route("POST", "/api/backups", (u, p, q, b, ctx) => {
  forbid(can.manageWorkspace(u), "create backups");
  if (!process.env.COS_BACKUP_KEY) throw new HttpError(400, "Encrypted backups are not configured. Set COS_BACKUP_KEY on the server.");
  const result = backups.create(db, { kind: (b && b.kind === "pre-import") ? "pre-import" : "manual", userId: u.id, reason: b && b.reason, settings: backupSettings() });
  security.log("backup_created", { userId: u.id, ip: ctx.ip, name: result.name, bytes: result.bytes, kind: result.kind });
  return result;
});
route("POST", "/api/reset", (u, p, q, b, ctx) => { forbid(can.manageWorkspace(u), "reset the workspace"); if (security.IS_PRODUCTION) throw new HttpError(403, "Demo reset is disabled in production"); security.log("demo_database_reset", { userId: u.id, ip: ctx.ip }); seed.reset(db); return { ok: true }; });

route("GET", "/api/auth/status", () => { const ws = db.prepare("SELECT name, logo, allow_registration, invite_code FROM workspaces WHERE id=?").get(WS_ID); return { workspace: ws.name, logo: ws.logo, allowRegistration: !!ws.allow_registration, joinCodeRequired: !!ws.invite_code }; });

/* ---------- server ---------- */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".mp3": "audio/mpeg", ".webp": "image/webp" };
/* v29 static delivery: the app shell is ~1.7 MB of text. Serve it compressed
   (brotli, then gzip), with a strong ETag so repeat visits cost one 304 instead of a
   full download. The shell revalidates every load (no-cache) so deploys show up
   immediately; nothing is cached without revalidation. Compressed bodies are cached
   in memory per file and rebuilt when the file's mtime or size changes. */
const zlib = require("zlib");
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".json", ".svg"]);
const staticCache = new Map();
function staticEntry(file) {
  const st = fs.statSync(file), key = st.mtimeMs + ":" + st.size, hit = staticCache.get(file);
  if (hit && hit.key === key) return hit;
  const raw = fs.readFileSync(file), ext = path.extname(file);
  const entry = { key, raw, type: MIME[ext] || "application/octet-stream", etag: '"' + crypto.createHash("sha1").update(raw).digest("base64url") + '"' };
  if (COMPRESSIBLE.has(ext) && raw.length > 1024) {
    entry.br = zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } });
    entry.gzip = zlib.gzipSync(raw, { level: 9 });
  }
  staticCache.set(file, entry); return entry;
}
function acceptedEncoding(req, entry) {
  const ae = String(req.headers["accept-encoding"] || "");
  if (entry.br && /\bbr\b/.test(ae)) return "br";
  if (entry.gzip && /\bgzip\b/.test(ae)) return "gzip";
  return null;
}
function sendStatic(req, res, file) {
  const e = staticEntry(file);
  security.applyHeaders(res);
  const headers = { "Content-Type": e.type, "ETag": e.etag, "Vary": "Accept-Encoding", "Cache-Control": e.type.startsWith("text/html") ? "no-cache" : "public, max-age=3600, must-revalidate" };
  if (req.headers["if-none-match"] === e.etag) { res.writeHead(304, headers); return res.end(); }
  const enc = acceptedEncoding(req, e), body = enc ? e[enc] : e.raw;
  if (enc) headers["Content-Encoding"] = enc;
  headers["Content-Length"] = body.length;
  res.writeHead(200, headers); res.end(req.method === "HEAD" ? undefined : body);
}
function sendJson(req, res, status, obj) {
  security.applyHeaders(res);
  let body = Buffer.from(JSON.stringify(obj));
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Vary": "Accept-Encoding" };
  if (body.length > 2048 && /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""))) { body = zlib.gzipSync(body, { level: 6 }); headers["Content-Encoding"] = "gzip"; }
  headers["Content-Length"] = body.length;
  res.writeHead(status, headers); res.end(body);
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const ip = security.clientIp(req);
  const send = (status, body, type) => { if (!type) return sendJson(req, res, status, body); security.applyHeaders(res); res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" }); res.end(body); };
  try {
    if (url.pathname.startsWith("/api/")) {
      security.requireSameOrigin(req);
      const r = routes.find(x => x.method === req.method && x.re.test(url.pathname));
      if (!r) throw new HttpError(404, "No such endpoint");
      const token = auth.parseCookies(req.headers.cookie).cos_session; const ctx = { req, res, token, ip, ua: req.headers["user-agent"], sessionUserId: auth.sessionUser(db, token), setCookie: null };
      if (!ctx.sessionUserId && DEV_HEADER_AUTH && req.headers["x-user-id"]) ctx.sessionUserId = String(req.headers["x-user-id"]);
      let user = ctx.sessionUserId ? userContext(ctx.sessionUserId) : null;
      if (ALLOW_IMPERSONATION && user && req.headers["x-act-as"] && user.caps.manage_members) { const adminId = user.id, imp = userContext(String(req.headers["x-act-as"])); if (imp) { imp.impersonatedBy = adminId; user = imp; security.log("admin_impersonation", { adminId, targetId: imp.id, ip }); } }
      if (!user && !OPEN.has(url.pathname)) throw new HttpError(401, "Please sign in");
      const params = url.pathname.match(r.re).groups || {};
      const body = req.method === "GET" || req.method === "DELETE" ? {} : await readBody(req);
      checkTextLimits(url.pathname, body);
      const out = await r.handler(user, params, Object.fromEntries(url.searchParams), body, ctx);
      if (out && out.__raw) return; /* v18: streaming handlers (SSE) own the response */
      if (ctx.setCookie) res.setHeader("Set-Cookie", ctx.setCookie);
      /* sign-ins, chat, read receipts, saved views and AI calls never touch tasks */
      if (req.method !== "GET" && !/^\/api\/(auth|messages|notifications|views|ai|live)(\/|$)/.test(url.pathname) && url.searchParams.get("prefsOnly") !== "1") DATA_VERSION++;
      if (req.method !== "GET" && user) announceTaskChange(req.method, url.pathname, out, user);
      /* v38.1 personal preferences (theme, layout, saved items) are nobody else's business: no broadcast */
      if (req.method !== "GET" && user && !(url.searchParams.get("prefsOnly") === "1" && url.pathname === "/api/members/" + user.id)) announceWorkspaceChange(url.pathname, user);
      return send(200, out);
    }
    /* v39 uploaded images: signed-in users only */
    const fm = /^\/files\/([a-f0-9]{64}\.(?:png|jpg|webp|gif))$/.exec(url.pathname);
    if (fm) {
      if (req.method !== "GET" && req.method !== "HEAD") return send(405, "Method not allowed", "text/plain");
      const token = auth.parseCookies(req.headers.cookie).cos_session, uid0 = auth.sessionUser(db, token);
      if (!uid0 || !userContext(uid0)) return send(401, "Please sign in", "text/plain");
      security.applyHeaders(res); return uploads.serve(req, res, fm[1], backups.BACKUP_DIR, backups.decryptFile);
    }
    let file = path.join(PUBLIC, url.pathname === "/" ? "index.html" : url.pathname);
    if (url.pathname.startsWith("/shared/")) file = path.join(__dirname, "..", url.pathname);
    const SHARED = path.join(__dirname, "..", "shared");
    const missing = !(file.startsWith(PUBLIC + path.sep) || file.startsWith(SHARED + path.sep)) || !fs.existsSync(file) || fs.statSync(file).isDirectory();
    /* v38.1 clean URLs: /tasks, /projects/p1, /register … are app routes, not files. Any GET for a
       path without a file extension that is not /api or /shared gets the app shell; the router in
       the page decides what to show. Paths that look like files (/logo.png) still 404. */
    if (missing && (req.method === "GET" || req.method === "HEAD") && !url.pathname.startsWith("/shared/") && !/\.[a-z0-9]{1,8}$/i.test(url.pathname) && /^\/[-\w\/.~%]*$/.test(url.pathname)) return sendStatic(req, res, path.join(PUBLIC, "index.html"));
    if (missing) return send(404, "Not found", "text/plain");
    if (req.method !== "GET" && req.method !== "HEAD") return send(405, "Method not allowed", "text/plain");
    return sendStatic(req, res, file);
  } catch (e) {
    /* v29: a body that is missing required fields reaches SQLite as undefined. That is a
       client error, not a server fault, so report it as 400 instead of a bare 500. */
    if (!e.status && (e.code === "ERR_INVALID_ARG_TYPE" || /NOT NULL constraint failed|cannot be bound to SQLite/.test(String(e.message)))) { e = new HttpError(400, "The request is missing required fields"); }
    if (!e.status) console.error(e);
    const status = e.status || 500;
    if (e.retryAfter) res.setHeader("Retry-After", String(e.retryAfter));
    if (status === 401 || status === 403 || status === 429 || status >= 500) security.log("request_rejected", { ip, method: req.method, path: url.pathname, status, error: status >= 500 ? "internal" : e.message });
    send(status, { error: status >= 500 && security.IS_PRODUCTION ? "Server error" : (e.message || "Server error") });
  }
});
server.listen(PORT, () => console.log("ZenCrevia running at http://localhost:" + server.address().port + "  (db: " + require("./db").DB_PATH + ")"));
/* v36 graceful shutdown (systemd/pm2 stop, deploys): stop accepting connections, end live
   streams, let requests in flight finish (max 8 s), then checkpoint and close the database so
   the -wal file is folded back into the main file. */
let shuttingDown = false;
function shutdown(sig) {
  if (shuttingDown) return; shuttingDown = true;
  console.log("[shutdown] " + sig + " received — finishing requests");
  server.close(() => { try { db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); db.close(); } catch (e) {} console.log("[shutdown] database closed"); process.exit(0); });
  try { server.closeIdleConnections && server.closeIdleConnections(); } catch (e) {}
  setTimeout(() => { try { server.closeAllConnections && server.closeAllConnections(); } catch (e) {} }, 1500).unref();
  setTimeout(() => { try { db.close(); } catch (e) {} process.exit(0); }, 8000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

/* v29 scheduled backups follow Settings → Backup & Data → Automatic Backups.
   COS_BACKUP_INTERVAL_HOURS, when set, is an operator override and the UI says so.
   The scheduler checks every 10 minutes, so a restart never loses the cadence:
   "due" is measured from the last automatic backup recorded in the workspace. */
function runScheduledBackupIfDue() {
  if (!process.env.COS_BACKUP_KEY) return null;
  const settings = backupSettings(), sch = backupSchedule(settings);
  if (!sch.intervalHours) return null;
  const last = Date.parse(settings.lastAutoAt || "") || 0;
  if (Date.now() - last < sch.intervalHours * 3600000) return null;
  try {
    const result = backups.create(db, { kind: "scheduled", userId: null, reason: "Automatic " + (sch.source === "environment" ? "(COS_BACKUP_INTERVAL_HOURS=" + sch.intervalHours + ")" : settings.auto), settings });
    const next = Object.assign({}, backupSettings(), { lastAutoAt: now() });
    db.prepare("UPDATE workspaces SET backup_settings=? WHERE id=?").run(JSON.stringify(next), WS_ID);
    security.log("scheduled_backup_created", { name: result.name, bytes: result.bytes, source: sch.source, intervalHours: sch.intervalHours });
    return result;
  } catch (e) { security.log("scheduled_backup_failed", { error: e.message }); return null; }
}
if (process.env.COS_BACKUP_KEY) {
  const first = setTimeout(runScheduledBackupIfDue, 60000); first.unref();
  const timer = setInterval(runScheduledBackupIfDue, 10 * 60000); timer.unref();
}
