/* Importing a JSON snapshot into a live workspace — whole, or section by section.

   The browser reads the file, shifts its dates and converts every item to the server's shape with
   the same functions it uses for ordinary saves (dTask, dProject…), so there is no second copy of
   the date logic here. This module decides what each section would change, then applies it.

   Rules that hold for every import:
   - Nothing is ever deleted. A stage, field, task or page that exists here and not in the file stays.
     Replacing everything is what restoring an encrypted backup is for.
   - An item whose id already exists is skipped unless the admin chooses "update". T-101 in a file
     from another workspace is a different task from T-101 here; overwriting it by default would
     silently destroy work.
   - Secrets never travel: AI keys, SMTP and Drive credentials, passwords. Neither do roles and
     permissions, the AI data-processing consent (it has to be given in Settings, where it is
     recorded), notifications or the activity log.
   - A preview that points at /files/… on another server cannot be resolved here, so it is dropped
     and counted rather than failing the whole import.
   - Everything is validated before anything is written, and the writes run in one transaction. */

const SECTIONS = ["identity", "workflow", "ai", "projects", "knowledge", "assets", "views", "people"];
const NEVER = ["API keys and SMTP credentials", "Google Drive connection", "Member passwords", "Roles and permissions", "AI data-processing consent", "Notifications and activity history"];
const IDENTITY_KEYS = ["name", "logo", "logoImg", "favicon", "tagline", "theme", "brand", "timeZone", "workingDays", "workStart", "workEnd"];
const err = (status, message) => { const e = new Error(message); e.status = status; return e; };
const arr = v => Array.isArray(v) ? v : [];
const byId = list => { const m = new Map(); arr(list).forEach(x => { if (x && x.id != null) m.set(String(x.id), x); }); return m; };
const clone = v => JSON.parse(JSON.stringify(v));

/* Keep the file's order for what it names, and append what only exists here. */
function mergeList(current, incoming, conflict) {
  const cur = byId(current), out = [], seen = new Set();
  let added = 0, updated = 0, skipped = 0;
  arr(incoming).forEach(x => {
    if (!x || x.id == null) return;
    const id = String(x.id); seen.add(id);
    if (!cur.has(id)) { out.push(x); added++; }
    else if (conflict === "update") { out.push(Object.assign({}, cur.get(id), x)); updated++; }
    else { out.push(cur.get(id)); skipped++; }
  });
  let kept = 0;
  arr(current).forEach(x => { if (x && x.id != null && !seen.has(String(x.id))) { out.push(x); kept++; } });
  return { list: out, added, updated, skipped, kept };
}

/* AI settings without anything that must not arrive from a file. */
function cleanAI(ai) {
  const out = clone(ai || {});
  delete out.processing;
  ["image", "chat"].forEach(k => { if (out[k] && typeof out[k] === "object") { out[k].key = ""; delete out[k].keySet; delete out[k].lastCheck; } });
  return out;
}

function makeImporter(deps) {
  const { db, wsId, sz } = deps;
  const exists = (table, id) => !!db.prepare("SELECT 1 FROM " + table + " WHERE id=?").get(String(id));

  /* A preview is resolvable if it is inline data or a file this server really has. */
  function previewOk(v) {
    const s = String(v || ""); if (!s) return true;
    if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(s)) return true;
    const m = deps.uploads.URL_RE.exec(s);
    /* the uploads table is created when the first file is stored; before that, nothing resolves */
    if (m) { try { return !!db.prepare("SELECT 1 FROM uploads WHERE id=?").get(m[1] + "." + m[2]); } catch { return false; } }
    return false;
  }
  function linkOk(v) { const s = String(v || ""); if (!s) return true; if (/^\/files\/d\//.test(s)) return deps.filestore.isStoredUrl(db, s); return /^(https|s3):/i.test(s); }
  /* Drops what cannot be resolved on this server, and counts it. */
  function scrubTask(t, n) {
    arr(t.files).forEach(f => { if (f.preview && !previewOk(f.preview)) { f.preview = null; n.previews++; } if (f.url && !linkOk(f.url)) { f.url = ""; n.links++; } });
    arr(t.versions).forEach(v => { if (v.img && !previewOk(v.img)) { v.img = null; n.previews++; } if (v.driveUrl && !linkOk(v.driveUrl)) { v.driveUrl = null; n.links++; } });
    arr(t.comments).forEach(c => arr(c.attachments).forEach(a => { if (a.preview && !previewOk(a.preview)) { a.preview = null; n.previews++; } if (a.url && !linkOk(a.url)) { a.url = ""; n.links++; } }));
    return t;
  }
  function scrubAsset(a, n) {
    ["img", "preview", "previewData"].forEach(k => { if (a[k] && !previewOk(a[k])) { a[k] = null; n.previews++; } });
    return a;
  }

  /* One pass that both previews and applies. With write=false nothing touches the database. */
  function run(payload, userId, write) {
    const p = payload || {}, data = p.data || {};
    const sections = arr(p.sections).filter(s => SECTIONS.includes(s));
    if (!sections.length) throw err(400, "Choose at least one part of the snapshot to import.");
    const conflict = p.conflict === "update" ? "update" : "skip";
    const report = { sections: {}, warnings: [], never: NEVER.slice(), conflict };
    const n = { previews: 0, links: 0 };
    const writes = [];   /* collected, validated, then run together */

    /* ---- workspace-level sections share one read and one write ---- */
    const wsSections = sections.filter(s => s === "identity" || s === "workflow" || s === "ai");
    if (wsSections.length) {
      const incoming = data.ws || {};
      const next = sz.readWorkspace(db, wsId);   /* AI keys come back masked, which the writer reads as "keep" */
      if (sections.includes("identity")) {
        const changed = IDENTITY_KEYS.filter(k => incoming[k] !== undefined && JSON.stringify(incoming[k]) !== JSON.stringify(next[k]));
        changed.forEach(k => { next[k] = clone(incoming[k]); });
        ["logoImg", "favicon"].forEach(k => { if (next[k] && !previewOk(next[k])) { next[k] = null; n.previews++; } });
        if (!String(next.name || "").trim()) next.name = sz.readWorkspace(db, wsId).name;
        report.sections.identity = { changes: changed };
      }
      if (sections.includes("workflow")) {
        const w = mergeList(next.workflow, incoming.workflow, conflict);
        const cf = mergeList(next.customFields, incoming.customFields, conflict);
        const bt = mergeList(next.briefTemplates, incoming.briefTemplates, conflict);
        const lb = mergeList(next.labels, incoming.labels, conflict);
        const tg = mergeList(next.tags, incoming.tags, conflict);
        next.workflow = w.list; next.customFields = cf.list; next.briefTemplates = bt.list; next.labels = lb.list; next.tags = tg.list;
        /* brief fields are [id, label] pairs; add the ones this workspace lacks */
        const haveBF = new Set(arr(next.briefFields).map(f => Array.isArray(f) ? f[0] : f && f.id));
        let bfAdded = 0; arr(incoming.briefFields).forEach(f => { const id = Array.isArray(f) ? f[0] : f && f.id; if (id != null && !haveBF.has(id)) { next.briefFields = arr(next.briefFields).concat([f]); bfAdded++; } });
        /* the field layout is one arrangement, not a list of records: taken whole when present */
        const layout = Array.isArray(incoming.taskFields) && incoming.taskFields.length ? clone(incoming.taskFields) : null;
        if (layout) next.taskFields = layout;
        if (!next.workflow.length) throw err(400, "The snapshot's workflow has no stages.");
        report.sections.workflow = { stages: pick(w), customFields: pick(cf), briefTemplates: pick(bt), briefFields: { added: bfAdded }, labels: pick(lb), tags: pick(tg), fieldLayout: !!layout };
      }
      if (sections.includes("ai")) {
        const inc = cleanAI(incoming.ai), cur = next.ai || {};
        const endpoints = ["image", "chat"].filter(k => inc[k] && inc[k].endpoint && inc[k].endpoint !== (cur[k] || {}).endpoint).map(k => k + ": " + inc[k].endpoint);
        const keys = Object.keys(inc).filter(k => JSON.stringify(inc[k]) !== JSON.stringify(cur[k]));
        next.ai = Object.assign({}, cur, inc);
        /* providers keep their stored key; only the non-secret settings arrive */
        ["image", "chat"].forEach(k => { if (inc[k]) next.ai[k] = Object.assign({}, cur[k] || {}, inc[k], { key: "" }); });
        next.ai.processing = cur.processing;
        if (endpoints.length) report.warnings.push("AI requests will go to a different address: " + endpoints.join("; ") + ". Check it before enabling AI features.");
        if (incoming.ai && incoming.ai.processing && incoming.ai.processing.externalEnabled && !(cur.processing || {}).externalEnabled) report.warnings.push("The snapshot had external AI processing switched on. That consent is not imported — turn it on in Settings → AI if you want it.");
        report.sections.ai = { changes: keys, endpoints };
      }
      writes.push(() => sz.writeWorkspace(db, wsId, next));
    }

    /* ---- records, one table at a time ---- */
    const upsert = (label, list, table, validate, writeOne) => {
      let added = 0, updated = 0, skipped = 0;
      const seen = new Set();   /* the same id twice in one file is written once */
      arr(list).forEach(item => {
        if (!item || item.id == null) return;
        if (seen.has(String(item.id))) { skipped++; return; }
        seen.add(String(item.id));
        const here = exists(table, item.id);
        if (here && conflict !== "update") { skipped++; return; }
        const doc = clone(item);
        if (validate) validate(doc, here);
        here ? updated++ : added++;
        writes.push(() => writeOne(doc));
      });
      return { added, updated, skipped };
    };

    if (sections.includes("projects")) {
      const projects = upsert("projects", data.projects, "projects", d => { if (!String(d.name || "").trim()) throw err(400, "A project in the snapshot has no name."); }, d => sz.writeProject(db, wsId, d));
      const tasks = upsert("tasks", data.tasks, "tasks", d => {
        if (!deps.validTaskId(d.id)) throw err(400, "Task " + d.id + " has an id this server does not accept.");
        if (!String(d.title || "").trim() || String(d.title).length > 240) throw err(400, "Task " + d.id + " needs a title under 240 characters.");
        scrubTask(d, n);
        /* The same checks as an ordinary save for what is stored with a task. sanitizeTaskWrite is
           deliberately not used: it stops a member forging someone else's comments or approvals in
           a live edit, whereas an import is an admin replaying a snapshot's history as it was. */
        /* A preview must not write: checkStoredFiles only validates, while validateStoredFiles also
           moves inline images to disk, which is right only when the import is really applied. */
        if (write) deps.validateStoredFiles(d, userId); else deps.checkStoredFiles(d);
        deps.validateDependencies(d.id, arr(d.dependencies));
      }, d => sz.writeTask(db, wsId, d, userId));
      const requests = upsert("requests", data.requests, "creative_requests", null, d => sz.writeRequest(db, wsId, d));
      report.sections.projects = { projects, tasks, requests };
    }
    if (sections.includes("knowledge")) {
      const folders = upsert("knowledgeFolders", data.knowledgeFolders, "knowledge_folders", null, d => sz.writeKnowledgeFolder(db, wsId, d));
      const pages = upsert("pages", data.pages, "knowledge_pages", d => { if (!String(d.title || "").trim()) throw err(400, "A knowledge page in the snapshot has no title."); }, d => sz.writePage(db, wsId, d));
      report.sections.knowledge = { folders, pages };
    }
    if (sections.includes("assets")) {
      const folders = upsert("assetFolders", data.folders, "asset_folders", null, d => sz.writeFolder(db, wsId, d));
      const assets = upsert("assets", data.assets, "assets", d => { scrubAsset(d, n); if (d.url && !linkOk(d.url)) { d.url = ""; n.links++; } }, d => sz.writeAsset(db, wsId, d));
      report.sections.assets = { folders, assets };
    }
    if (sections.includes("views")) {
      const views = upsert("views", data.views, "saved_views", d => {
        /* a view belongs to someone; one whose owner is not here goes to the importing admin */
        if (!d.owner || !db.prepare("SELECT 1 FROM users WHERE id=?").get(String(d.owner))) d.owner = userId;
      }, d => sz.writeView(db, wsId, d));
      report.sections.views = { views };
    }
    if (sections.includes("people")) {
      const teams = upsert("teams", data.teams, "teams", d => { if (!String(d.name || "").trim()) throw err(400, "A team in the snapshot has no name."); }, d => sz.writeTeam(db, wsId, d));
      /* Members are matched by email and only ever added. An existing account is never changed,
         a new one arrives without a password (they set one through "Forgot password"), and
         nobody is made an admin by a file. */
      let added = 0, existing = 0, noEmail = 0, demoted = 0;
      /* Writes wait until everything is validated, so the database cannot see an earlier member of
         this same file: track emails and ids handed out in this run, or two people with the same
         name would get the same id and one email could become two accounts. */
      const takenEmails = new Set(), takenIds = new Set();
      const teamIds = new Set(db.prepare("SELECT id FROM teams WHERE workspace_id=?").all(wsId).map(r => String(r.id)));
      arr(data.teams).forEach(t => { if (t && t.id != null && String(t.name || "").trim()) teamIds.add(String(t.id)); });
      const idFree = id => !takenIds.has(id) && !db.prepare("SELECT 1 FROM users WHERE id=?").get(id);
      arr(data.people).forEach(person => {
        const pr = clone(person || {});
        const email = String(pr.email || "").trim().toLowerCase();
        if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { noEmail++; return; }
        if (takenEmails.has(email) || db.prepare("SELECT 1 FROM users WHERE lower(email)=?").get(email)) { existing++; return; }
        takenEmails.add(email);
        pr.email = email; pr.name = String(pr.name || email.split("@")[0]).trim().slice(0, 120);
        if (pr.perm === "admin") { pr.perm = "member"; demoted++; }
        let id = /^[A-Za-z0-9_-]{1,60}$/.test(String(pr.id || "")) ? String(pr.id) : null;
        if (!id || !idFree(id)) { id = deps.userIdFor(pr.name, db); let k = 2; const base = id; while (!idFree(id)) id = base + "_" + (k++); }
        takenIds.add(id);
        delete pr.password; delete pr.passwordHash;
        /* Shaped the way POST /api/members shapes a new member, so an incomplete file cannot fail
           with a database error. Role and team links are foreign keys: a role this workspace does
           not have becomes "member", and a team link survives only if that team exists here or
           arrives in this same import — otherwise one stray link would abort the whole import. */
        pr.ini = String(pr.ini || pr.name.split(/\s+/).slice(0, 2).map(w => w[0] || "").join("")).toUpperCase().slice(0, 3) || "?";
        pr.c = Number.isFinite(+pr.c) ? +pr.c : 0;
        if (pr.avatar && !previewOk(pr.avatar)) { pr.avatar = null; n.previews++; }
        if (!db.prepare("SELECT 1 FROM roles WHERE id=?").get(String(pr.perm || "member"))) pr.perm = "member";
        pr.teams = arr(pr.teams).filter(x => Array.isArray(x) && x[0] != null && teamIds.has(String(x[0]))).map(x => [String(x[0]), !!x[1]]);
        added++;
        writes.push(() => { sz.writePerson(db, wsId, id, pr); db.prepare("UPDATE users SET is_active=1 WHERE id=?").run(id); });
      });
      if (demoted) report.warnings.push(demoted + " member(s) were admins in the snapshot and arrive as members. Promote them in Settings → Members if that is right.");
      if (added) report.warnings.push(added + " new member(s) arrive without a password. They sign in by choosing \"Forgot password\".");
      report.sections.people = { teams, members: { added, existing, noEmail } };
    }

    if (n.previews) report.warnings.push(n.previews + " image preview(s) point at files this server does not have and were left out. The snapshot carries links to images, not the images themselves.");
    if (n.links) report.warnings.push(n.links + " file link(s) could not be resolved here and were left out.");

    if (write) {
      deps.tx(db, () => writes.forEach(fn => fn()));
      report.applied = true;
    }
    return report;
  }
  const pick = r => ({ added: r.added, updated: r.updated, skipped: r.skipped, kept: r.kept });

  return {
    preview: (payload, userId) => run(payload, userId, false),
    apply: (payload, userId) => run(payload, userId, true)
  };
}
module.exports = { makeImporter, SECTIONS, NEVER, mergeList, cleanAI };
