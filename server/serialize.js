// Row ↔ document mapping. The API speaks in documents (what the UI renders); the database stays normalized.
const { uid, now, J, S } = require("./db");
const secrets = require("./secrets");

/* API keys are write-only: the client can set one but never reads one back. */
/* v18: non-secret AI settings that round-trip as-is. v17 added `policy` and
   `models` on the client but never listed them here, so they silently reset
   on every server reload — fixed by carrying them through explicitly. */
const AI_PLAIN_KEYS = ["policy", "models", "galleryRoleQuota", "basePrompt", "taskPromptTemplates", "tools"];
function maskAI(ai) {
  const out = { promptTemplates: ai.promptTemplates || null, chatTemplates: ai.chatTemplates || null, processing: Object.assign({ externalEnabled: true, workspaceContextEnabled: true }, ai.processing || {}) };
  AI_PLAIN_KEYS.forEach(k => { if (ai[k] !== undefined) out[k] = ai[k]; });
  for (const k of ["image", "chat"]) {
    const c = Object.assign({}, ai[k] || {});
    out[k] = Object.assign({}, c, { key: "", keySet: !!c.key });
  }
  return out;
}
/* v17 §P1-4 — SMTP configuration lives with the workspace, alongside AI
   settings. The password is stored encrypted and NEVER leaves the server:
   readSmtp() reports only whether one is set. */
function readSmtpRaw(db, wsId) {
  const w = db.prepare("SELECT smtp_settings FROM workspaces WHERE id=?").get(wsId);
  return J(w && w.smtp_settings, {}) || {};
}
function readSmtp(db, wsId) {
  const c = readSmtpRaw(db, wsId);
  return {
    enabled: !!c.enabled, provider: c.provider || "custom", host: c.host || "", port: c.port || 587,
    secure: !!c.secure, user: c.user || "", passSet: !!c.pass,
    fromName: c.fromName || "", fromEmail: c.fromEmail || "", replyTo: c.replyTo || "",
    updatedAt: c.updatedAt || null, updatedBy: c.updatedBy || null
  };
}
function writeSmtp(db, wsId, incoming, secrets, userId) {
  const cur = readSmtpRaw(db, wsId), inc = incoming || {};
  /* a blank password means "keep the stored one"; the literal "clear" removes it */
  let pass = cur.pass || "";
  if (inc.pass === "clear") pass = "";
  else if (inc.pass) pass = secrets.encrypt(String(inc.pass));
  const next = {
    enabled: inc.enabled !== undefined ? !!inc.enabled : !!cur.enabled,
    provider: String(inc.provider || cur.provider || "custom").slice(0, 40),
    host: String(inc.host !== undefined ? inc.host : cur.host || "").trim().slice(0, 255),
    port: Math.max(1, Math.min(65535, +(inc.port !== undefined ? inc.port : cur.port) || 587)),
    secure: inc.secure !== undefined ? !!inc.secure : !!cur.secure,
    user: String(inc.user !== undefined ? inc.user : cur.user || "").trim().slice(0, 255),
    pass,
    fromName: String(inc.fromName !== undefined ? inc.fromName : cur.fromName || "").trim().slice(0, 120),
    fromEmail: String(inc.fromEmail !== undefined ? inc.fromEmail : cur.fromEmail || "").trim().slice(0, 255),
    replyTo: String(inc.replyTo !== undefined ? inc.replyTo : cur.replyTo || "").trim().slice(0, 255),
    updatedAt: new Date().toISOString(), updatedBy: userId || cur.updatedBy || null
  };
  db.prepare("UPDATE workspaces SET smtp_settings=? WHERE id=?").run(JSON.stringify(next), wsId);
  return readSmtp(db, wsId);
}
/* The decrypted config the mailer needs. Server-side only. */
function smtpRuntime(db, wsId, secrets) {
  const c = readSmtpRaw(db, wsId);
  if (!c.enabled || !c.host) return null;
  return { enabled: true, host: c.host, port: c.port, secure: !!c.secure, user: c.user,
           pass: c.pass ? secrets.decrypt(c.pass) : "", fromName: c.fromName, fromEmail: c.fromEmail, replyTo: c.replyTo };
}
function readAIRaw(db, wsId) {
  const w = db.prepare("SELECT ai_settings FROM workspaces WHERE id=?").get(wsId);
  return J(w && w.ai_settings, {}) || {};
}
/* an incoming blank key means "keep what is stored"; "" after an explicit clear removes it */
function mergeAI(db, wsId, incoming) {
  const cur = readAIRaw(db, wsId), inc0 = incoming || {};
  const next = {
    promptTemplates: inc0.promptTemplates === undefined ? (cur.promptTemplates || null) : inc0.promptTemplates,
    chatTemplates: inc0.chatTemplates === undefined ? (cur.chatTemplates || null) : inc0.chatTemplates,
    processing: inc0.processing === undefined ? (cur.processing || { externalEnabled: true, workspaceContextEnabled: true }) : Object.assign({ externalEnabled: true, workspaceContextEnabled: true }, cur.processing || {}, inc0.processing)
  };
  AI_PLAIN_KEYS.forEach(k => { next[k] = inc0[k] === undefined ? (cur[k] === undefined ? null : cur[k]) : inc0[k]; });
  for (const k of ["image", "chat"]) {
    const inc = (incoming || {})[k] || {}, old = cur[k] || {};
    const merged = Object.assign({}, old, inc);
    /* "" is what the masked read-back sends, so it must mean "keep";
       only an explicit null clears the key. */
    if (inc.key === null) merged.key = "";
    else if (inc.key === undefined || inc.key === "") merged.key = old.key ? secrets.encrypt(String(old.key)) : "";
    else merged.key = secrets.encrypt(String(inc.key));
    delete merged.keySet;
    /* v38: a stored test result stays valid only while provider, endpoint, model and key are unchanged */
    const changed = ["provider", "endpoint", "model"].some(f => (inc[f] !== undefined && inc[f] !== old[f])) || (inc.key !== undefined && inc.key !== "" );
    if (changed) delete merged.lastCheck; else if (old.lastCheck) merged.lastCheck = old.lastCheck; else delete merged.lastCheck;
    next[k] = merged;
  }
  return next;
}
/* v33 review gate defaults (Settings → Workflow → "Who can move tasks here" overrides them).
   - requireReviewer: every stage from the first "review" stage onward. A task cannot be sent
     for review, or closed, without someone named to review it.
   - reviewerOnly: flexible by default — anyone who can edit the task may move it up to and
     including "Delivered". Closed stages after Delivered (e.g. Done, Declined) default to the
     reviewer, requester, team lead or an admin. Workflows without a "delivered" stage start
     fully open. Admins can tighten or loosen any stage. */
function stageRules(rows) {
  const firstReview = rows.findIndex(s => s.kind === "review");
  const delivered = rows.findIndex(s => s.id === "delivered");
  return rows.map((s, i) => {
    const pastReview = firstReview >= 0 ? i >= firstReview : (s.kind === "revision" || s.kind === "closed");
    const afterDelivered = delivered >= 0 && i > delivered && s.kind === "closed";
    return Object.assign({}, s, {
      reviewerOnly: s.reviewer_only == null ? afterDelivered : !!s.reviewer_only,
      requireReviewer: s.require_reviewer == null ? pastReview : !!s.require_reviewer
    });
  });
}
function readWorkspace(db, wsId) {
  const w = db.prepare("SELECT * FROM workspaces WHERE id=?").get(wsId);
  if (!w) return null;
  return {
    id: w.id, name: w.name, logo: w.logo, logoImg: w.logo_img, favicon: w.favicon, tagline: w.tagline, timeZone: w.time_zone,
    workingDays: J(w.working_days, [1,2,3,4,5]), workStart: w.work_start, workEnd: w.work_end, theme: J(w.theme, {}), brand: J(w.brand, {}),
    briefFields: J(w.brief_fields, []), notifPrefs: J(w.notif_prefs, {}), autoHide: Object.assign({ tasks: "month", taskDays: 30, projects: "month", projectDays: 30 }, J(w.auto_hide, {}) || {}),
    ai: maskAI(J(w.ai_settings, {}) || {}),
    labels: J(w.labels, []), taskFields: J(w.task_fields, []), allowRegistration: !!w.allow_registration, defaultRole: w.default_role_id || "member", joinCode: w.invite_code || "",
    workflow: stageRules(db.prepare("SELECT * FROM task_statuses WHERE workspace_id=? AND is_archived=0 ORDER BY sort_order").all(wsId)).map(s => ({ id: s.id, name: s.name, kind: s.kind, color: s.color, reviewerOnly: s.reviewerOnly, requireReviewer: s.requireReviewer })),
    briefTemplates: db.prepare("SELECT * FROM brief_templates WHERE workspace_id=? ORDER BY sort_order").all(wsId).map(t => ({ id: t.id, name: t.name, description: t.description, fields: J(t.fields, []), required: J(t.required_fields, []) })),
    customFields: db.prepare("SELECT * FROM custom_fields WHERE workspace_id=? ORDER BY sort_order").all(wsId).map(f => ({ id: f.id, name: f.name, type: f.type, options: J(f.options, []) })),
    /* v17 §7.5 manual order wins; §7.7 archived tags still round-trip. No colour (§1). */
    tags: db.prepare("SELECT name,sort_order,archived FROM tags WHERE workspace_id=? ORDER BY sort_order, name").all(wsId)
      .map((t, i) => ({ id: "tag_" + String(t.name).trim().toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9]+/g, "_"), name: t.name, archived: !!t.archived, sortOrder: t.sort_order || (i + 1) * 10 })),
    cloud: db.prepare("SELECT * FROM cloud_connections WHERE workspace_id=? ORDER BY rowid").all(wsId).map(c => ({ id: c.provider, name: c.name, connected: !!c.is_connected, account: c.account || "", folder: c.root_folder || "", lastSyncAt: c.last_sync_at, color: c.color, config: J(c.config, {}) })),
  };
}
function writeWorkspace(db, wsId, d) {
  db.prepare("UPDATE workspaces SET name=?, logo=?, logo_img=?, favicon=?, tagline=?, time_zone=?, working_days=?, work_start=?, work_end=?, theme=?, brand=?, brief_fields=?, notif_prefs=?, auto_hide=?, ai_settings=?, labels=?, task_fields=?, invite_code=?, default_role_id=?, allow_registration=?, updated_at=? WHERE id=?")
    .run(d.name, d.logo, d.logoImg || null, d.favicon || null, d.tagline || "", d.timeZone || "Asia/Jakarta", S(d.workingDays || [1,2,3,4,5]), d.workStart || "09:00", d.workEnd || "18:00", S(d.theme || {}), S(d.brand || {}), S(d.briefFields || []), S(d.notifPrefs || {}), S(d.autoHide || {}), S(mergeAI(db, wsId, d.ai)), S(d.labels || []), S(d.taskFields || []), d.joinCode || null, d.defaultRole || "member", d.allowRegistration === false ? 0 : 1, now(), wsId);
  // statuses: upsert + archive missing (tasks keep referencing archived ids until moved)
  const keep = new Set();
  (d.workflow || []).forEach((s, i) => { keep.add(s.id); const b3 = v => v === true ? 1 : v === false ? 0 : null; db.prepare("INSERT INTO task_statuses (id,workspace_id,name,kind,color,sort_order,is_completed,is_archived,reviewer_only,require_reviewer) VALUES (?,?,?,?,?,?,?,0,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind, color=excluded.color, sort_order=excluded.sort_order, is_completed=excluded.is_completed, is_archived=0, reviewer_only=excluded.reviewer_only, require_reviewer=excluded.require_reviewer").run(s.id, wsId, s.name, s.kind, s.color || null, i, s.kind === "closed" ? 1 : 0, b3(s.reviewerOnly), b3(s.requireReviewer)); });
  db.prepare("SELECT id FROM task_statuses WHERE workspace_id=?").all(wsId).forEach(r => { if (!keep.has(r.id)) db.prepare("UPDATE task_statuses SET is_archived=1 WHERE id=?").run(r.id); });
  db.prepare("DELETE FROM brief_templates WHERE workspace_id=?").run(wsId);
  (d.briefTemplates || []).forEach((t, i) => db.prepare("INSERT INTO brief_templates (id,workspace_id,name,description,fields,required_fields,sort_order) VALUES (?,?,?,?,?,?,?)").run(t.id, wsId, t.name, t.description || "", S(t.fields || []), S(t.required || []), i));
  const keepF = new Set();
  (d.customFields || []).forEach((f, i) => { keepF.add(f.id); db.prepare("INSERT INTO custom_fields (id,workspace_id,name,type,options,sort_order) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type, options=excluded.options, sort_order=excluded.sort_order").run(f.id, wsId, f.name, f.type, S(f.options || []), i); });
  db.prepare("SELECT id FROM custom_fields WHERE workspace_id=?").all(wsId).forEach(r => { if (!keepF.has(r.id)) db.prepare("DELETE FROM custom_fields WHERE id=?").run(r.id); });
  const keepT = new Set();
  /* Accepts legacy plain strings and legacy {name,color} objects alike; the
     colour is read tolerantly and never stored back (v17 §P0-1). */
  (d.tags || []).forEach((raw, i) => {
    const name = typeof raw === "string" ? raw : (raw && raw.name) || "";
    if (!name) return;
    keepT.add(name);
    const order = raw && typeof raw.sortOrder === "number" ? raw.sortOrder : (i + 1) * 10;
    const archived = raw && raw.archived ? 1 : 0;
    db.prepare("INSERT OR IGNORE INTO tags (id,workspace_id,name,sort_order,archived) VALUES (?,?,?,?,?)").run("tag_" + wsId + "_" + name, wsId, name, order, archived);
    db.prepare("UPDATE tags SET sort_order=?, archived=? WHERE workspace_id=? AND name=?").run(order, archived, wsId, name);
  });
  db.prepare("SELECT id,name FROM tags WHERE workspace_id=?").all(wsId).forEach(r => { if (!keepT.has(r.name)) db.prepare("DELETE FROM tags WHERE id=?").run(r.id); });
  db.prepare("DELETE FROM cloud_connections WHERE workspace_id=?").run(wsId);
  (d.cloud || []).forEach(c => db.prepare("INSERT INTO cloud_connections (id,workspace_id,provider,name,account,root_folder,color,is_connected,last_sync_at,config) VALUES (?,?,?,?,?,?,?,?,?,?)").run("cc_" + wsId + "_" + c.id, wsId, c.id, c.name, c.account || "", c.folder || "", c.color || null, c.connected ? 1 : 0, c.lastSyncAt || null, S(c.config || {})));
}

function readTeams(db, wsId) {
  return db.prepare("SELECT * FROM teams WHERE workspace_id=? ORDER BY sort_order").all(wsId).map(t => ({ id: t.id, name: t.name, description: t.description || "", color: t.color, icon: t.icon, lead: t.team_lead_id, sort: t.sort_order, archived: !!t.is_archived }));
}
function writeTeam(db, wsId, t) {
  db.prepare("INSERT INTO teams (id,workspace_id,name,description,color,icon,team_lead_id,sort_order,is_archived,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, color=excluded.color, icon=excluded.icon, team_lead_id=excluded.team_lead_id, sort_order=excluded.sort_order, is_archived=excluded.is_archived, updated_at=excluded.updated_at")
    .run(t.id, wsId, t.name, t.description || "", t.color || "blue", t.icon || "palette", t.lead || null, t.sort || 0, t.archived ? 1 : 0, now());
}
function readPeople(db, wsId) {
  const out = {};
  db.prepare("SELECT u.*, m.role_id, m.job_title, m.capacity_hours, m.hours_per_day, m.is_stakeholder, m.prefs FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY u.name").all(wsId).forEach(r => {
    out[r.id] = { name: r.name, ini: r.initials, c: r.avatar_color, email: r.email || "", role: r.job_title || "", perm: r.role_id, cap: r.capacity_hours, hoursPerDay: r.hours_per_day, stakeholder: !!r.is_stakeholder, active: r.is_active !== 0, hasPassword: !!r.password_hash, lastLoginAt: r.last_login_at, prefs: J(r.prefs, {}), avatar: r.avatar_data || null, active: !!r.is_active, hasPassword: !!r.password_hash, lastLogin: r.last_login_at,
      teams: db.prepare("SELECT team_id, is_primary FROM team_memberships WHERE user_id=? ORDER BY is_primary DESC").all(r.id).map(m => [m.team_id, !!m.is_primary]) };
  });
  return out;
}
function writePerson(db, wsId, id, p) {
  db.prepare("INSERT INTO users (id,name,email,initials,avatar_color,avatar_data) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, email=excluded.email, initials=excluded.initials, avatar_color=excluded.avatar_color, avatar_data=CASE WHEN excluded.avatar_data IS NULL THEN users.avatar_data ELSE excluded.avatar_data END").run(id, p.name, p.email || null, p.ini, p.c || 0, p.avatar === undefined ? null : (p.avatar || ""));
  db.prepare("INSERT INTO workspace_members (id,workspace_id,user_id,role_id,job_title,capacity_hours,hours_per_day,is_stakeholder,prefs) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,user_id) DO UPDATE SET role_id=excluded.role_id, job_title=excluded.job_title, capacity_hours=excluded.capacity_hours, hours_per_day=excluded.hours_per_day, is_stakeholder=excluded.is_stakeholder, prefs=excluded.prefs")
    .run("wm_" + wsId + "_" + id, wsId, id, p.perm || "member", p.role || "", p.cap == null ? 40 : p.cap, p.hoursPerDay || 8, p.stakeholder ? 1 : 0, S(p.prefs || {}));
  if (p.teams) { db.prepare("DELETE FROM team_memberships WHERE user_id=?").run(id); p.teams.forEach(([team, primary]) => db.prepare("INSERT OR IGNORE INTO team_memberships (id,team_id,user_id,is_primary) VALUES (?,?,?,?)").run("tm_" + team + "_" + id, team, id, primary ? 1 : 0)); }
}

function readProjects(db, wsId) {
  return db.prepare("SELECT * FROM projects WHERE workspace_id=? ORDER BY sort_order, created_at").all(wsId).map(p => ({
    id: p.id, name: p.name, description: p.description || "", brief: p.brief || "", owner: p.owner_id, status: p.status, progress: p.progress, startDate: p.start_date, dueDate: p.due_date, tags: J(p.tags, []), teams: J(p.team_ids, []), sort: p.sort_order, completedAt: p.completed_at, archivedAt: p.archived_at,
    team: db.prepare("SELECT user_id FROM project_members WHERE project_id=?").all(p.id).map(m => m.user_id),
    milestones: db.prepare("SELECT * FROM milestones WHERE project_id=? ORDER BY sort_order, due_date").all(p.id).map(m => ({ id: m.id, name: m.name, dueDate: m.due_date, done: !!m.is_done })),
  }));
}
function writeProject(db, wsId, p) {
  const prev = db.prepare("SELECT status, completed_at, archived_at FROM projects WHERE id=?").get(p.id);
  const done = p.status === "done" || p.status === "archived";
  const completedAt = done ? (p.completedAt || (prev && prev.completed_at) || now()) : null;
  const archivedAt = p.status === "archived" ? (p.archivedAt || (prev && prev.archived_at) || now()) : null;
  db.prepare("INSERT INTO projects (id,workspace_id,name,description,brief,owner_id,status,progress,start_date,due_date,tags,team_ids,sort_order,completed_at,archived_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, brief=excluded.brief, owner_id=excluded.owner_id, status=excluded.status, progress=excluded.progress, start_date=excluded.start_date, due_date=excluded.due_date, tags=excluded.tags, team_ids=excluded.team_ids, sort_order=excluded.sort_order, completed_at=excluded.completed_at, archived_at=excluded.archived_at, updated_at=excluded.updated_at")
    .run(p.id, wsId, p.name, p.description || "", p.brief || "", p.owner || null, p.status || "active", p.progress || 0, p.startDate || null, p.dueDate || null, S(p.tags || []), S(p.teams || []), p.sort || 0, completedAt, archivedAt, now());
  db.prepare("DELETE FROM project_members WHERE project_id=?").run(p.id);
  (p.team || []).forEach(u => db.prepare("INSERT OR IGNORE INTO project_members (project_id,user_id) VALUES (?,?)").run(p.id, u));
  db.prepare("DELETE FROM milestones WHERE project_id=?").run(p.id);
  (p.milestones || []).forEach((m, i) => db.prepare("INSERT INTO milestones (id,project_id,name,due_date,is_done,sort_order) VALUES (?,?,?,?,?,?)").run(m.id || uid("ms"), p.id, m.name, m.dueDate || null, m.done ? 1 : 0, i));
}

function taskRelations(db, sub, params) {
  /* One query per child table for every task selected by `sub` (a SELECT of task ids). */
  const group = (rows, key) => { const m = new Map(); rows.forEach(r => { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return m; };
  return {
    briefs: new Map(db.prepare("SELECT * FROM briefs WHERE task_id IN (" + sub + ")").all(...params).map(b => [b.task_id, b])),
    custom: group(db.prepare("SELECT task_id, field_id, value FROM custom_field_values WHERE task_id IN (" + sub + ")").all(...params), "task_id"),
    tags: group(db.prepare("SELECT tt.task_id, g.name FROM task_tags tt JOIN tags g ON g.id=tt.tag_id WHERE tt.task_id IN (" + sub + ") ORDER BY tt.task_id, tt.tag_id").all(...params), "task_id"),
    deps: group(db.prepare("SELECT task_id, depends_on_task_id AS taskId, dependency_type AS type, created_by AS createdBy, created_at AS createdAt FROM task_dependencies WHERE task_id IN (" + sub + ") ORDER BY created_at").all(...params), "task_id"),
    versions: group(db.prepare("SELECT * FROM file_versions WHERE task_id IN (" + sub + ") ORDER BY version_number").all(...params), "task_id"),
    files: group(db.prepare("SELECT * FROM files WHERE task_id IN (" + sub + ") ORDER BY created_at").all(...params), "task_id"),
    comments: group(db.prepare("SELECT * FROM comments WHERE task_id IN (" + sub + ") ORDER BY created_at").all(...params), "task_id"),
    activity: group(db.prepare("SELECT * FROM activity_logs WHERE entity_type='task' AND entity_id IN (" + sub + ") ORDER BY created_at").all(...params), "entity_id")
  };
}
function buildTask(t, R) {
  const id = t.id, brief = R.briefs.get(id), custom = {};
  (R.custom.get(id) || []).forEach(r => { custom[r.field_id] = J(r.value, null); });
  return {
    id: t.id, title: t.title, description: t.description || "", proj: t.project_id, team: t.team_id, status: t.status_id, prio: t.priority, assignee: t.assignee_id, reviewer: t.reviewer_id, assignees: (function(a){ if (t.assignee_id && a.indexOf(t.assignee_id) < 0) a.unshift(t.assignee_id); return a; })(J(t.assignees, [])), reviewers: (function(a){ if (t.reviewer_id && a.indexOf(t.reviewer_id) < 0) a.unshift(t.reviewer_id); return a; })(J(t.reviewers, [])), hidden: !!t.is_hidden,
    startDate: t.start_date, dueDate: t.due_date, effort: (t.estimated_minutes || 0) / 60, assetCount: t.asset_count || 0, labels: J(t.labels, []), sort: t.sort_order, parent: t.parent_task_id, requestId: t.request_id, completedAt: t.completed_at, createdAt: t.created_at, createdBy: t.created_by, updatedAt: t.updated_at,
    tags: (R.tags.get(id) || []).map(r => r.name),
    dependencies: (R.deps.get(id) || []).map(r => ({ taskId: r.taskId, type: r.type, createdBy: r.createdBy, createdAt: r.createdAt })),
    brief: brief ? Object.assign({ tpl: brief.template_id }, J(brief.fields, {})) : null, custom, meta: J(t.meta, {}),
    versions: (R.versions.get(id) || []).map(v => ({ id: v.id, n: v.version_number, by: v.uploaded_by, createdAt: v.created_at, state: v.approval_status, color: v.preview_color, img: v.preview_data, note: v.note || "", annots: J(v.annotations, []), decidedBy: v.decided_by, decidedAt: v.decided_at, reason: v.decision_reason, driveUrl: v.drive_url || "", driveId: v.drive_id || null })),
    files: (R.files.get(id) || []).map(f => ({ id: f.id, name: f.filename, type: f.file_type, source: f.storage_provider, size: f.size_label, createdAt: f.created_at, url: f.external_url || "", preview: f.preview_data || null, driveId: f.drive_id || null })),
    comments: (R.comments.get(id) || []).map(c => ({ id: c.id, by: c.author_id, createdAt: c.created_at, vis: c.visibility, text: c.body, parent: c.parent_id, attachments: J(c.attachments, []) })),
    activity: (R.activity.get(id) || []).map(a => ({ id: a.id, who: a.actor_id, k: a.action, createdAt: a.created_at, a: J(a.payload, {}) })),
  };
}
function readTask(db, id) {
  const t = db.prepare("SELECT * FROM tasks WHERE id=?").get(id);
  if (!t) return null;
  return buildTask(t, taskRelations(db, "?", [id]));
}
/* v29 scale: the same records as readTask(), for many tasks, in 9 queries total. */
function readTasksBatch(db, wsId, where, params) {
  params = params || [];
  const rows = db.prepare("SELECT * FROM tasks t WHERE t.workspace_id=? AND (" + where + ") ORDER BY t.sort_order").all(wsId, ...params);
  if (!rows.length) return [];
  const R = taskRelations(db, "SELECT t.id FROM tasks t WHERE t.workspace_id=? AND (" + where + ")", [wsId, ...params]);
  return rows.map(t => buildTask(t, R));
}

/* v38: references to people, projects, teams or parent tasks that no longer exist (a removed
   member, demo ids such as "laura" left in a browser) are dropped instead of failing the whole
   save with a FOREIGN KEY error (HTTP 500 and a task that silently was never created). */
function cleanTaskRefs(db, d) {
  const has = (table, id) => !!(id && db.prepare("SELECT 1 FROM " + table + " WHERE id=?").get(id));
  const user = id => has("users", id) ? id : null;
  d.assignee = user(d.assignee); d.reviewer = user(d.reviewer);
  d.assignees = (d.assignees || []).filter(id => has("users", id));
  d.reviewers = (d.reviewers || []).filter(id => has("users", id));
  if (d.proj && !has("projects", d.proj)) d.proj = null;
  if (d.team && !has("teams", d.team)) d.team = null;
  if (d.parent && !has("tasks", d.parent)) d.parent = null;
  if (d.createdBy && !has("users", d.createdBy)) d.createdBy = null;
  d.dependencies = (d.dependencies || []).filter(dep => dep && has("tasks", dep.taskId));
  (d.comments || []).forEach(c => { if (c.by && !has("users", c.by)) c.by = null; });
  (d.versions || []).forEach(v => { if (v.by && !has("users", v.by)) v.by = null; if (v.decidedBy && !has("users", v.decidedBy)) v.decidedBy = null; });
  (d.files || []).forEach(f => { if (f.by && !has("users", f.by)) f.by = null; });
  return d;
}
function writeTask(db, wsId, d, actorId) {
  cleanTaskRefs(db, d);
  const existing = db.prepare("SELECT id, status_id FROM tasks WHERE id=?").get(d.id);
  const closed = db.prepare("SELECT is_completed FROM task_statuses WHERE id=?").get(d.status);
  const completedAt = closed && closed.is_completed ? (d.completedAt || now()) : null;
  const assignees = (d.assignees || []).filter(Boolean); if (d.assignee && assignees.indexOf(d.assignee) < 0) assignees.unshift(d.assignee); const reviewers = (d.reviewers || []).filter(Boolean); if (d.reviewer && reviewers.indexOf(d.reviewer) < 0) reviewers.unshift(d.reviewer);
  db.prepare(`INSERT INTO tasks (id,workspace_id,project_id,team_id,parent_task_id,request_id,title,description,status_id,priority,assignee_id,reviewer_id,assignees,reviewers,is_hidden,start_date,due_date,estimated_minutes,asset_count,labels,sort_order,completed_at,created_by,created_at,updated_at,meta)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET meta=excluded.meta, project_id=excluded.project_id, team_id=excluded.team_id, parent_task_id=excluded.parent_task_id, request_id=excluded.request_id, title=excluded.title, description=excluded.description, status_id=excluded.status_id, priority=excluded.priority, assignee_id=excluded.assignee_id, reviewer_id=excluded.reviewer_id, assignees=excluded.assignees, reviewers=excluded.reviewers, is_hidden=excluded.is_hidden, start_date=excluded.start_date, due_date=excluded.due_date, estimated_minutes=excluded.estimated_minutes, asset_count=excluded.asset_count, labels=excluded.labels, sort_order=excluded.sort_order, completed_at=excluded.completed_at, updated_at=excluded.updated_at`)
    .run(d.id, wsId, d.proj || null, d.team || null, d.parent || null, d.requestId || null, d.title, d.description || "", d.status, d.prio || "medium", (d.assignee || assignees[0]) || null, (d.reviewer || reviewers[0]) || null, S(assignees), S(reviewers), d.hidden ? 1 : 0, d.startDate || null, d.dueDate || null, Math.round((d.effort || 0) * 60), Math.max(0, Math.round(d.assetCount || 0)), S(Array.isArray(d.labels) ? d.labels : []), d.sort || 0, completedAt, d.createdBy || actorId, d.createdAt || now(), now(), S(d.meta && typeof d.meta === "object" ? d.meta : {}));
  if (d.brief) db.prepare("INSERT INTO briefs (id,task_id,template_id,fields,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(task_id) DO UPDATE SET template_id=excluded.template_id, fields=excluded.fields, updated_at=excluded.updated_at").run("brief_" + d.id, d.id, d.brief.tpl || null, S(Object.fromEntries(Object.entries(d.brief).filter(([k]) => k !== "tpl"))), now());
  else db.prepare("DELETE FROM briefs WHERE task_id=?").run(d.id);
  db.prepare("DELETE FROM task_tags WHERE task_id=?").run(d.id);
  (d.tags || []).forEach(t => { db.prepare("INSERT OR IGNORE INTO tags (id,workspace_id,name) VALUES (?,?,?)").run("tag_" + wsId + "_" + t, wsId, t); db.prepare("INSERT OR IGNORE INTO task_tags (task_id,tag_id) VALUES (?,?)").run(d.id, "tag_" + wsId + "_" + t); });
  db.prepare("DELETE FROM task_dependencies WHERE task_id=?").run(d.id);
  (d.dependencies || []).forEach(dep => db.prepare("INSERT INTO task_dependencies (task_id,depends_on_task_id,dependency_type,created_by,created_at) VALUES (?,?,?,?,?)").run(d.id, dep.taskId, dep.type || "finish_to_start", dep.createdBy || actorId, dep.createdAt || now()));
  db.prepare("DELETE FROM custom_field_values WHERE task_id=?").run(d.id);
  Object.entries(d.custom || {}).forEach(([k, v]) => { if (db.prepare("SELECT 1 FROM custom_fields WHERE id=?").get(k)) db.prepare("INSERT INTO custom_field_values (task_id,field_id,value) VALUES (?,?,?)").run(d.id, k, S(v)); });
  // Keep stable version rows so ordinary edits preserve approval/revision history.
  const versionNumbers = new Set((d.versions || []).map(v => +v.n));
  db.prepare("SELECT id,version_number FROM file_versions WHERE task_id=?").all(d.id).forEach(v => {
    if (!versionNumbers.has(v.version_number)) db.prepare("DELETE FROM file_versions WHERE id=?").run(v.id);
  });
  (d.versions || []).forEach(v => db.prepare("INSERT INTO file_versions (id,task_id,version_number,note,preview_color,preview_data,uploaded_by,approval_status,decided_by,decided_at,decision_reason,drive_url,drive_id,annotations,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(task_id,version_number) DO UPDATE SET note=excluded.note,preview_color=excluded.preview_color,preview_data=excluded.preview_data,approval_status=excluded.approval_status,decided_by=excluded.decided_by,decided_at=excluded.decided_at,decision_reason=excluded.decision_reason,drive_url=excluded.drive_url,drive_id=excluded.drive_id,annotations=excluded.annotations").run(v.id || uid("ver"), d.id, v.n, v.note || "", v.color || null, v.img || null, v.by || actorId, v.state || "pending", v.decidedBy || null, v.decidedAt || null, v.reason || null, v.driveUrl || null, v.driveId || null, S(v.annots || []), v.createdAt || now()));
  db.prepare("DELETE FROM files WHERE task_id=?").run(d.id);
  (d.files || []).forEach(f => db.prepare("INSERT INTO files (id,workspace_id,task_id,filename,file_type,size_label,storage_provider,external_url,preview_data,drive_id,uploaded_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(f.id || uid("file"), wsId, d.id, f.name, f.type || "other", f.size || "", f.source || "local", f.url || null, f.preview || null, f.driveId || null, f.by || actorId, f.createdAt || now()));
  db.prepare("DELETE FROM comments WHERE task_id=?").run(d.id);
  const ordered = (d.comments || []).slice().sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0));
  ordered.forEach(c => db.prepare("INSERT INTO comments (id,workspace_id,task_id,parent_id,author_id,visibility,body,attachments,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(c.id || uid("cm"), wsId, d.id, c.parent || null, c.by || actorId, c.vis || "internal", c.text, S(c.attachments || []), c.createdAt || now()));
  (d.activity || []).forEach(a => { if (!a.id || !db.prepare("SELECT 1 FROM activity_logs WHERE id=?").get(a.id)) appendActivity(db, wsId, { id: a.id, who: a.who || actorId, k: a.k, a: Object.assign({}, a.a, { task: d.id }), createdAt: a.createdAt }, "task", d.id); });
  return existing;
}
function appendActivity(db, wsId, a, entityType, entityId) {
  const id = a.id || uid("act");
  db.prepare("INSERT OR IGNORE INTO activity_logs (id,workspace_id,actor_id,action,entity_type,entity_id,payload,created_at) VALUES (?,?,?,?,?,?,?,?)").run(id, wsId, a.who, a.k, entityType, entityId, S(a.a || {}), a.createdAt || now());
  return id;
}
function readActivity(db, wsId, limit) {
  return db.prepare("SELECT * FROM activity_logs WHERE workspace_id=? ORDER BY created_at DESC LIMIT ?").all(wsId, limit || 200).map(a => ({ id: a.id, who: a.actor_id, k: a.action, createdAt: a.created_at, entityType: a.entity_type, entityId: a.entity_id, a: J(a.payload, {}) }));
}
function readRequests(db, wsId) {
  return db.prepare("SELECT * FROM creative_requests WHERE workspace_id=? ORDER BY created_at DESC").all(wsId).map(r => ({ id: r.id, title: r.title, objective: r.objective || "", description: r.description || "", deliverables: r.deliverables || "", deadline: r.deadline, prio: r.priority, links: r.links || "", notes: r.notes || "", files: J(r.reference_files, []), by: r.requested_by, status: r.status, decision: r.decision_note || "", converted: r.converted_task_id, convertedProject: r.converted_project_id, team: r.team_id, createdAt: r.created_at }));
}
function writeRequest(db, wsId, r) {
  db.prepare("INSERT INTO creative_requests (id,workspace_id,title,objective,description,deliverables,deadline,priority,links,notes,reference_files,requested_by,status,decision_note,converted_task_id,converted_project_id,team_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, objective=excluded.objective, description=excluded.description, deliverables=excluded.deliverables, deadline=excluded.deadline, priority=excluded.priority, links=excluded.links, notes=excluded.notes, reference_files=excluded.reference_files, status=excluded.status, decision_note=excluded.decision_note, converted_task_id=excluded.converted_task_id, converted_project_id=excluded.converted_project_id, team_id=excluded.team_id, updated_at=excluded.updated_at")
    .run(r.id, wsId, r.title, r.objective || "", r.description || "", r.deliverables || "", r.deadline || null, r.prio || "medium", r.links || "", r.notes || "", S(r.files || []), r.by || null, r.status || "submitted", r.decision || "", r.converted || null, r.convertedProject || null, r.team || null, r.createdAt || now(), now());
}
function readAssets(db, wsId) {
  return db.prepare("SELECT * FROM assets WHERE workspace_id=? ORDER BY created_at DESC").all(wsId).map(a => ({ id: a.id, name: a.name, type: a.type, description: a.description || "", folder: a.folder_id, tags: J(a.tags, []), size: a.size_label || "—", ver: a.version, source: a.storage_provider, url: a.external_url || "", createdAt: a.created_at, color: a.preview_color, img: a.preview_data, by: a.uploaded_by, brand: !!a.is_brand }));
}
function writeAsset(db, wsId, a) {
  db.prepare("INSERT INTO assets (id,workspace_id,folder_id,name,type,description,size_label,version,storage_provider,external_url,preview_color,preview_data,tags,is_brand,uploaded_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET folder_id=excluded.folder_id, name=excluded.name, type=excluded.type, description=excluded.description, size_label=excluded.size_label, version=excluded.version, storage_provider=excluded.storage_provider, external_url=excluded.external_url, preview_color=excluded.preview_color, preview_data=excluded.preview_data, tags=excluded.tags, is_brand=excluded.is_brand, updated_at=excluded.updated_at")
    .run(a.id, wsId, a.folder || null, a.name, a.type || "other", a.description || "", a.size || "—", a.ver || 1, a.source || "local", a.url || null, a.color || null, a.img || null, S(a.tags || []), a.brand ? 1 : 0, a.by || null, a.createdAt || now(), now());
}
function readFolders(db, wsId) { return db.prepare("SELECT * FROM asset_folders WHERE workspace_id=? ORDER BY sort_order").all(wsId).map(f => ({ id: f.id, name: f.name, type: f.type, sort: f.sort_order })); }
function writeFolder(db, wsId, f) { db.prepare("INSERT INTO asset_folders (id,workspace_id,name,type,sort_order) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type, sort_order=excluded.sort_order").run(f.id, wsId, f.name, f.type || "other", f.sort || 0); }
function readKnowledge(db, wsId) { return db.prepare("SELECT * FROM knowledge_pages WHERE workspace_id=? ORDER BY is_pinned DESC, sort_order, title").all(wsId).map(k => ({ id: k.id, folder: k.folder, title: k.title, body: k.body || "", translations: J(k.translations, {}), by: k.author_id, updatedAt: k.updated_at, fav: !!k.is_favorite, pinned: !!k.is_pinned })); }
function writePage(db, wsId, k) { db.prepare("INSERT INTO knowledge_pages (id,workspace_id,folder,title,body,translations,author_id,is_favorite,is_pinned,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET folder=excluded.folder, title=excluded.title, body=excluded.body, translations=excluded.translations, author_id=excluded.author_id, is_favorite=excluded.is_favorite, is_pinned=excluded.is_pinned, updated_at=excluded.updated_at").run(k.id, wsId, k.folder || "General", k.title, k.body || "", S(k.translations || {}), k.by || null, k.fav ? 1 : 0, k.pinned ? 1 : 0, k.updatedAt || now()); }
function readKnowledgeFolders(db, wsId) { return db.prepare("SELECT * FROM knowledge_folders WHERE workspace_id=? ORDER BY sort_order,name").all(wsId).map(f => ({ id:f.id, name:f.name, nameId:f.name_id || "", sort:f.sort_order || 0 })); }
function writeKnowledgeFolder(db, wsId, f) { db.prepare("INSERT INTO knowledge_folders (id,workspace_id,name,name_id,sort_order) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,name_id=excluded.name_id,sort_order=excluded.sort_order").run(f.id,wsId,f.name,f.nameId||"",f.sort||0); }
function readViews(db, wsId, userId) { return db.prepare("SELECT * FROM saved_views WHERE workspace_id=? AND owner_id=? ORDER BY created_at").all(wsId, userId).map(v => ({ id: v.id, name: v.name, owner: v.owner_id, type: v.view_type, filters: J(v.filters, {}), sort: v.sorting, group: v.grouping, fields: J(v.visible_fields, []), config: J(v.configuration, {}) })); }
function writeView(db, wsId, v) { db.prepare("INSERT INTO saved_views (id,workspace_id,owner_id,name,view_type,filters,sorting,grouping,visible_fields,configuration) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, view_type=excluded.view_type, filters=excluded.filters, sorting=excluded.sorting, grouping=excluded.grouping, visible_fields=excluded.visible_fields, configuration=excluded.configuration WHERE saved_views.owner_id=excluded.owner_id").run(v.id, wsId, v.owner, v.name, v.type, S(v.filters || {}), v.sort || null, v.group || null, S(v.fields || []), S(v.config || {})); }
function readNotifs(db, wsId, userId) { return db.prepare("SELECT * FROM notifications WHERE workspace_id=? AND recipient_id=? ORDER BY created_at DESC LIMIT 100").all(wsId, userId).map(n => ({ id: n.id, k: n.type, who: n.actor_id, t: n.entity_id, entityType: n.entity_type, message: n.message, createdAt: n.created_at, read: !!n.read_at })); }
function writeNotif(db, wsId, n) { db.prepare("INSERT INTO notifications (id,workspace_id,recipient_id,actor_id,type,entity_type,entity_id,message,read_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(n.id || uid("nt"), wsId, n.recipient, n.who || null, n.k, n.entityType || "task", n.t, n.message || "", n.read ? now() : null, n.createdAt || now()); }

// Auto-archive: projects marked done in a previous calendar month become 'archived' (still fully accessible, hidden from boards by default).
function autoCutoff(mode, days) {
  if (mode === "month") { const m = new Date(); m.setDate(1); m.setHours(0, 0, 0, 0); return m; }
  if (mode === "quarter") { const q = new Date(); q.setMonth(Math.floor(q.getMonth() / 3) * 3, 1); q.setHours(0, 0, 0, 0); return q; }
  return new Date(Date.now() - Math.max(1, days || 30) * 86400000);
}
function sweepArchive(db, wsId) {
  const w = db.prepare("SELECT auto_hide FROM workspaces WHERE id=?").get(wsId);
  const cfg = J(w && w.auto_hide, {}) || {};
  const mode = cfg.projects || "month";
  if (mode === "off") return 0;
  const m = autoCutoff(mode, cfg.projectDays);
  const rows = db.prepare("SELECT id, name FROM projects WHERE workspace_id=? AND status='done' AND completed_at IS NOT NULL AND completed_at < ?").all(wsId, m.toISOString());
  rows.forEach(r => { db.prepare("UPDATE projects SET status='archived', archived_at=?, updated_at=? WHERE id=?").run(now(), now(), r.id); appendActivity(db, wsId, { who: null, k: "project_archived", a: { project: r.id, what: r.name + " (auto-archived)" } }, "project", r.id); });
  return rows.length;
}

/* v29 scale: archived-history tasks travel as slim rows. One query for the rows plus
   one for their tags, instead of ~10 queries per task. Collections are empty arrays so
   the client can render lists; `_slim` tells the client to fetch the full task before
   opening it, and tells the server never to overwrite stored collections from it. */
const SLIM_FIELDS = ["title","proj","team","status","prio","assignee","reviewer","assignees","reviewers","hidden","startDate","dueDate","effort","assetCount","labels","sort","parent","requestId","completedAt","createdAt","createdBy","tags"];
function readTaskSlimRows(db, wsId, where, params) {
  const rows = db.prepare("SELECT * FROM tasks t WHERE t.workspace_id=? AND " + where + " ORDER BY t.sort_order").all(wsId, ...(params || []));
  if (!rows.length) return [];
  const tags = {}; db.prepare("SELECT tt.task_id, g.name FROM task_tags tt JOIN tags g ON g.id=tt.tag_id JOIN tasks t ON t.id=tt.task_id WHERE t.workspace_id=? AND " + where).all(wsId, ...(params || [])).forEach(r => { (tags[r.task_id] = tags[r.task_id] || []).push(r.name); });
  return rows.map(t => { const a = J(t.assignees, []), r = J(t.reviewers, []); if (t.assignee_id && a.indexOf(t.assignee_id) < 0) a.unshift(t.assignee_id); if (t.reviewer_id && r.indexOf(t.reviewer_id) < 0) r.unshift(t.reviewer_id);
    return { _slim: true, id: t.id, title: t.title, description: "", proj: t.project_id, team: t.team_id, status: t.status_id, prio: t.priority, assignee: t.assignee_id, reviewer: t.reviewer_id, assignees: a, reviewers: r, hidden: !!t.is_hidden, startDate: t.start_date, dueDate: t.due_date, effort: (t.estimated_minutes || 0) / 60, assetCount: t.asset_count || 0, labels: J(t.labels, []), sort: t.sort_order, parent: t.parent_task_id, requestId: t.request_id, completedAt: t.completed_at, createdAt: t.created_at, createdBy: t.created_by, updatedAt: t.updated_at, tags: tags[t.id] || [], dependencies: [], brief: null, custom: {}, meta: J(t.meta, {}), versions: [], files: [], comments: [], activity: [] }; });
}
/* Merge a slim client copy over the stored task: scalar fields win, collections stay. */
function mergeSlimTask(stored, incoming) { const out = Object.assign({}, stored); SLIM_FIELDS.forEach(k => { if (incoming[k] !== undefined) out[k] = incoming[k]; }); out.id = stored.id; return out; }

module.exports = { stageRules, readTasksBatch, readTaskSlimRows, mergeSlimTask, SLIM_FIELDS, sweepArchive, readAIRaw, readSmtp, readSmtpRaw, writeSmtp, smtpRuntime, readWorkspace, writeWorkspace, readTeams, writeTeam, readPeople, writePerson, readProjects, writeProject, readTask, writeTask, appendActivity, readActivity, readRequests, writeRequest, readAssets, writeAsset, readFolders, writeFolder, readKnowledge, writePage, readKnowledgeFolders, writeKnowledgeFolder, readViews, writeView, readNotifs, writeNotif };
