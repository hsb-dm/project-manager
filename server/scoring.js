/* SMART SCORING — THE SETTINGS, A TASK'S SCORES, THEIR LOCKS AND THEIR HISTORY (Oct 2026). docs/SMART-SCORING.md

   THE SETTINGS. The workspace's Smart Scoring settings are one JSON object in workspaces.scoring_settings, in the shape
   of shared/scoring-settings.js. Everyone signed in reads them (GET /api/scoring/settings; the workspace document
   carries them too, as ws.scoring). Only whoever holds scoring_manage_workspace — Admin, unless a role or a person is
   given it — changes them, through PUT /api/scoring/settings, and only from the version they were looking at: a save
   made on an older version than the one stored answers 409, so two people never overwrite each other unseen. What is
   saved is normalized first, the version goes up by one, and the change is written to scoring_audit with the whole old
   and new settings and the list of what changed, as well as to the workspace's history and the security log. A save
   that changes nothing is not a change: no new version, no audit row. The server keeps a few fields its own: the
   version, who saved and when, when the efficiency bonus was turned on (bonus.enabledAt — only estimates locked after
   it can ever earn one), and the weighted points mapping version, which goes up whenever the weights or the scale
   change so a stored score always says which mapping made it. The bonus stays off until the awards ship (BONUS_READY).
   POST /api/scoring/delegate-leads is the one-click hand-over the owner asked for: the Team Lead and Creative Lead
   roles (where they exist) are given the permissions to approve estimates, approve finished work and see the team's
   scoring analytics. For whoever manages roles; nothing else about the roles changes; audited.
   Kinds of work (settings.kinds) are used even while Smart Scoring is off — the estimator on Create reads them: a kind
   added gets its id here; one removed sends the tasks that chose it by hand back to their title's kind, each audited;
   a task keeps meta.kind (the kind chosen by hand) only as an active kind, or the one it already had. A task of several
   kinds of work (Oct 2026) keeps its mix in meta.kinds, [{k, n}]: 2–8 active kinds, each once, n a whole number 1–500
   (an unknown or switched-off kind dropped, a count kept within 1–500, the same kind twice added together; fewer than
   2 left and the mix goes); while it is there it takes the place of meta.kind for estimating, and a removed kind leaves
   it too.

   A TASK'S SCORES. Each task has at most one row per module in task_scoring — Effort Hours, Story Points, Weighted
   Points — with the math, the AI's suggestion (server/scoring-ai.js writes only that), the final value, where the final
   value came from (math, AI, manual, legacy), its status and its lock. A person takes the AI's suggestion with
   {use:"ai"} — set, or proposed, as any other change — never onto a locked score, and only while it was made for the
   task as it is now. GET /api/tasks/:id/scoring gives the rows, the last fifty changes and
   what the caller may do with them. Calculate works the math out with shared/scoring-engine.js on the server, from the
   task itself: the kind of work its title names, its asset count as the deliverables, the complexity rating, and its
   open dependencies; Story and Weighted Points from four 1–5 ratings, the Scope rating suggested from the asset count
   (1 → 1, 2–3 → 2, 4–6 → 3, 7–12 → 4, 13 or more → 5) and saying so. The math becomes the final value only while the
   score is a draft with no estimate of its own (a manual or AI estimate stays, as the spec asks). Someone allowed to
   change scores (scoring_edit_task) sets a final value with a reason; anyone else who works on the task proposes one.
   Whoever approves estimates (scoring_approve_estimate — never on a task they are assigned to unless the workspace
   allows it, never while acting as someone else) approves and locks it; Effort Hours' locked value becomes the task's
   estimate. A locked score changes again only by a re-baseline (same permission, always with a reason, the old one kept
   in the audit) or by someone allowed to change locked scores — whose change leaves it locked but no longer approved.

   THE TASK'S OWN ESTIMATE. Effort Hours' final value is the task's Estimate (tasks.estimated_minutes): before the lock
   anyone who may edit the task changes it as before, in the task, and the row follows, saying where the number came
   from (typed: manual; filled in by the estimator: math, or AI). Once it is locked, the task's own save refuses a
   different estimate from anyone without scoring_edit_task (guardTaskWrite); a history restore and an old slim copy
   keep it. With the default lock policy, work starting first (the task leaves a queue stage for work, review or
   revision, or time is logged on it) freezes the estimate as an unapproved baseline: locked, approved by nobody, so it
   never earns a bonus. A lock remembers the task's scope — its deliverables, the brief and description, its
   dependencies — and a change to any of them afterwards marks the score "rebaseline_needed" until it is re-baselined
   (or the scope is put back). A finished task opened again sends its efficiency awards back to provisional.
   While Smart Scoring logs time (on, with Effort Hours on), the Actual (meta.actualEffort) is the time log's: the
   task's save, its creation and a restore keep the stored one.

   AFTER A TASK IS WRITTEN. afterTaskWrite(taskId, user, info) runs this re-evaluation, then every function registered
   with onTaskWritten(fn), each in its own try/catch — after every task create, update, move and restore and after the
   scoring routes, outside the task's transaction, so nothing here can stop a task from saving. It writes only when
   something changed. A sweep every ten minutes (and at start) re-evaluates the tasks changed since the last one and
   tells the page (bumpData).

   ONCE: every task with an estimate gets an Effort Hours row from it (scoring_backfill_v1): unverified, nothing locked,
   the task's own number never rewritten.

   With COS_SCORING=0 on the server every route here answers 409 "Smart Scoring is turned off on this server" and the
   page hides the feature; the settings, the tables and the audit stay as they are. With the master switch or a module
   off, its scores and history are still read by those allowed, and nothing changes them. Registered in server.js after
   the AI helpers, like the scoring modules of the later phases. */
const model = require("../shared/scoring-settings");
const engine = require("../shared/scoring-engine");
const { has } = require("./permissions");
const docsLib = require("./scoring-docs");

const MODULES = ["hours", "story", "weighted"];
const UNIT = { hours: "h", story: "story_points", weighted: "weighted_points" };
const NAME = { hours: "Effort Hours", story: "Story Points", weighted: "Weighted Points" };
/* a locked score: approved, frozen when work started (or changed after its lock by someone allowed), or waiting for a
   new baseline after its scope changed */
const LOCKED = new Set(["approved", "locked", "rebaseline_needed"]);
/* the stages where work has started */
const WORK_KINDS = new Set(["work", "review", "revision"]);
const SWEEP_BATCH = 50;   /* tasks the timers' sweep re-evaluates before it lets the server answer again */
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const parse = (v, dflt) => { if (v == null || v === "") return dflt; try { return JSON.parse(v); } catch (e) { return dflt; } };
/* an object and everything in it made read-only (the settings every caller shares) */
function deepFreeze(v) { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); Object.keys(v).forEach(k => deepFreeze(v[k])); } return v; }

/* The kind of work a task's title names, from the workspace's kinds of work (settings.kinds; without them the engine's
   built-ins) through the engine's one matcher (the page's too): keywords as whole words, the first kind in the list
   that has one wins, English or Indonesian. */
function kindOf(title, kinds) { const k = engine.kindOf(title, kinds); return typeof k === "string" ? k : null; }
const kindsIn = s => (s && Array.isArray(s.kinds) ? s.kinds : engine.KINDS);
/* the Scope rating the asset count suggests: 1 → 1, 2–3 → 2, 4–6 → 3, 7–12 → 4, 13 or more → 5 (no count: one deliverable) */
function scopeFromAssets(count) {
  const n = Math.max(0, Math.round(+count || 0));
  return { value: n <= 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : n <= 12 ? 4 : 5, source: "assets", assetCount: n, assumed: n < 1 };
}
/* the hours a task is given from the math: to the half hour, as today's estimator gives them (estRound) */
const halfHour = h => Math.max(0.5, Math.round(h * 2) / 2);
class CalcError extends Error { constructor(msg) { super(msg); this.status = 400; } }
const numOr = v => { if (v === null || v === undefined || v === "") return null; const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN; return Number.isFinite(n) ? n : NaN; };
const rating = (v, what) => { const n = numOr(v); if (n === null) return null; if (Number.isNaN(n) || n < 1 || n > 5) throw new CalcError("The " + what + " rating is a number from 1 to 5"); return n; };

/* What "Calculate" works out — pure, so tests hold it to sensible numbers (tests/scoring-sanity.test.js).
   settings: the normalized settings; task: {title, assetCount, meta?}; body: {module, inputs | ratings};
   ctx: {openDeps, factors: {hours, story, weighted}} (the ratings stored on the task's rows).
   Hours: the kind chosen on the task (meta.kind), else the title's (inputs.kind, an active kind, corrects it), the
   asset count as the deliverables (inputs.units to
   correct it), the complexity given, else the one already rated on the task (its hours, then its story or weighted
   ratings), else unrated (3); the open dependencies are always the task's own. Several kinds of work in one task (Oct
   2026): the task's mix (meta.kinds, 2 or more active kinds) takes the place of the kind and the deliverables — each
   kind's own hours for its count, added up (ScoringEngine.hours' mix); inputs.mix ([{kind, units}], active kinds; []:
   none) works it out for another split, and inputs.kind for one kind instead; with a mix, inputs.units is not used.
   The kind is then the mix's primary kind ("mix"), the deliverables all of them ("mix"), and inputs.mix each kind's
   hours. Story and Weighted Points: each rating
   given, else the one stored on this score, else on the other points score; Scope, when nobody rated it, from the
   asset count. Every input says where it came from. */
function calculate(settings, task, body, ctx) {
  ctx = ctx || {}; body = isObj(body) ? body : {}; task = task || {};
  const module = body.module;
  if (MODULES.indexOf(module) < 0) throw new CalcError("Say which score to calculate: hours, story or weighted");
  const assetCount = Math.max(0, Math.round(+task.assetCount || 0)), scope = scopeFromAssets(assetCount), stored = ctx.factors || {};
  if (module === "hours") {
    const inp = isObj(body.inputs) ? body.inputs : {};
    const kinds = kindsIn(settings), withHours = settings && settings.hours ? settings : null, picked = engine.kindPick(task, kinds, withHours), detected = picked || kindOf(task.title, kinds);
    const known = id => typeof id === "string" && kinds.some(k => k.id === id && k.active !== false);
    let kind = detected, kindSource = picked ? "picked" : detected ? "title" : null;
    const kindGiven = inp.kind !== undefined && inp.kind !== null && inp.kind !== "";
    if (kindGiven) {
      if (!known(inp.kind)) throw new CalcError("Unknown kind of work: " + String(inp.kind).slice(0, 40));
      kind = inp.kind; kindSource = "given";
    }
    /* the split: given (a split of one kind is that kind; [] is none), else the task's — not when one kind is given */
    let mix = null, mixSource = null, one = null;
    if (inp.mix !== undefined && inp.mix !== null) {
      if (!Array.isArray(inp.mix)) throw new CalcError("A split of the work is a list of kinds of work, each with its deliverables");
      const problems = [], m = engine.mixClean(inp.mix, kinds, problems);
      const p = problems.find(x => x.code === "kind" || x.code === "count" || x.code === "cut" || (x.code === "clamped" && Math.round(Number(x.value)) !== x.used));
      if (p) throw new CalcError(p.code === "kind" ? "Unknown kind of work: " + String(isObj(p.value) ? JSON.stringify(p.value) : p.value).slice(0, 40) : p.code === "cut" ? "A split names at most " + engine.MIX_LIMITS.max + " kinds of work" : "Each kind of work in the split needs its deliverables, a whole number from 1 to " + engine.MIX_LIMITS.units);
      if (m && m.length === 1) one = m[0]; else if (m) { mix = m; mixSource = "given"; }
    } else if (!kindGiven) { mix = engine.kindMix(task, kinds); mixSource = mix ? "task" : null; }
    let units = Math.max(1, assetCount), unitsSource = "assets";
    const u = numOr(inp.units);
    if (one) { kind = one.kind; kindSource = "given"; units = one.units; unitsSource = "given"; }
    else if (mix) { kind = engine.kindPrimary(mix, withHours); kindSource = "mix"; units = mix.reduce((n, x) => n + x.units, 0); unitsSource = "mix"; }
    else if (u !== null) { if (Number.isNaN(u) || u < 1 || u > 999) throw new CalcError("Deliverables are a whole number from 1 to 999"); units = Math.round(u); unitsSource = "given"; }
    let complexity = rating(inp.complexity, "complexity"), complexitySource = complexity === null ? null : "given";
    if (complexity === null) for (const m of MODULES) {
      const v = stored[m] ? numOr(stored[m].complexity) : null;
      if (v !== null && !Number.isNaN(v) && v >= 1 && v <= 5) { complexity = v; complexitySource = m === "hours" ? "stored" : m; break; }
    }
    if (complexity !== null) complexity = Math.round(complexity);
    const openDeps = Math.max(0, Math.round(+ctx.openDeps || 0));
    const r = engine.hours(settings.hours, mix ? { mix, complexity1to5: complexity, openDeps } : { kind, units, complexity1to5: complexity, openDeps });
    const inputs = { kind, kindSource, units, unitsSource, assetCount, complexity, complexitySource, openDeps };
    /* several kinds of work: each kind's hours, and where the split came from (only then: one kind is as it always was) */
    if (r.mix) Object.assign(inputs, { mix: r.mix.map(x => ({ kind: x.kind, units: x.units, value: x.value, low: x.low, high: x.high })), mixSource });
    return {
      module, value: r.value, unit: UNIT.hours, final: r.value === null ? null : halfHour(r.value), low: r.low, high: r.high, bounded: r.bounded, reason: r.reason,
      inputs,
      factors: complexity === null ? {} : { complexity }, steps: r.steps, explanation: r.explanation, suggestions: { scope }
    };
  }
  const given = isObj(body.ratings) ? body.ratings : isObj(body.inputs) && isObj(body.inputs.ratings) ? body.inputs.ratings : {};
  const other = module === "story" ? "weighted" : "story", ratings = {}, sources = {};
  engine.FACTORS.forEach(f => {
    const g = rating(given[f], f);
    if (g !== null) { ratings[f] = g; sources[f] = "given"; return; }
    for (const [from, label] of [[module, "stored"], [other, other]]) {
      const v = stored[from] ? numOr(stored[from][f]) : null;
      if (v !== null && !Number.isNaN(v) && v >= 1 && v <= 5) { ratings[f] = v; sources[f] = label; return; }
    }
    if (f === "scope") { ratings[f] = scope.value; sources[f] = "assets"; }
  });
  const r = module === "story" ? engine.storyPoints(settings.story, ratings) : engine.weightedPoints(settings.weighted, ratings);
  return {
    module, value: r.value, unit: UNIT[module], final: r.value, index: r.index, split: !!r.split, reason: r.reason, missing: r.missing || [],
    mappingVersion: module === "weighted" ? r.mappingVersion : null,
    inputs: { ratings: r.inputs.ratings, weights: r.inputs.weights, sources, assetCount },
    factors: r.inputs.ratings, steps: r.steps, explanation: r.explanation, suggestions: { scope }
  };
}

module.exports = function scoring(db, WS_ID, d) {
  const { route, HttpError, forbid, can, security, uid, now, tx, act, readRoles, featureOn } = d;
  const sz = d.sz || require("./serialize");
  const forViewer = d.forViewer || ((u, t) => t);
  const bumpData = d.bumpData || (() => {});
  const announce = d.announce || (() => {});
  const BONUS_READY = true;   /* Phase 3: the efficiency awards are built (server/scoring-awards.js), so the bonus can be turned on */
  const LEAD_ROLES = ["team_lead", "creative_lead"];
  const LEAD_CAPS = ["scoring_approve_estimate", "scoring_approve_completion", "scoring_view_analytics"];
  const SHOWN = 20;   /* the settings changes the Settings tab lists */
  const TASK_AUDIT = 50;   /* the changes a task's scores show */
  const STALE = "Someone else changed this score in the meantime. Reload it and try again.";

  /* The settings, read on every call — a task save asks some ten times, a sweep once per task — but parsed and normalized
     only when the stored text changes (Oct 2026, performance: normalizing took about 0.15 ms each time). Whoever writes
     the column — PUT /api/scoring/settings, a restore, an import — needs to do nothing: a different text is normalized
     again. The object is shared, so it is frozen all the way down; a caller that wants to change it copies it first. */
  let settingsStmt = null, settingsMemo = { text: undefined, value: null };
  function settings() {
    if (!settingsStmt) settingsStmt = db.prepare("SELECT scoring_settings FROM workspaces WHERE id=?");
    const r = settingsStmt.get(WS_ID), text = r ? r.scoring_settings : null;
    if (settingsMemo.value && settingsMemo.text === text) return settingsMemo.value;
    const value = deepFreeze(model.normalizeSettings(text));
    settingsMemo = { text, value };
    return value;
  }
  /* one row of the audit: what was done to what, by whom (and who was acting as them), the old and new value, why */
  function audit(e) {
    const id = uid("sa"), json = v => v === undefined || v === null ? null : JSON.stringify(v);
    db.prepare("INSERT INTO scoring_audit (id,workspace_id,task_id,module,action,actor_id,impersonated_by,old_value,new_value,reason,meta,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(id, WS_ID, e.taskId || null, e.module || null, String(e.action), e.actor || null, e.impersonatedBy || null, json(e.oldValue), json(e.newValue), e.reason ? String(e.reason).slice(0, 1000) : null, JSON.stringify(e.meta || {}), e.at || now());
    return id;
  }
  const shape = r => { const m = parse(r.meta, {}) || {}; return { id: r.id, action: r.action, by: r.actor_id, impersonatedBy: r.impersonated_by || null, at: r.created_at, reason: r.reason || "", diff: Array.isArray(m.diff) ? m.diff : [], configVersion: m.configVersion || null, added: m.added || null, fallback: isObj(m.fallback) && Object.keys(m.fallback).length ? m.fallback : null }; };
  const settingsAudit = () => db.prepare("SELECT * FROM scoring_audit WHERE workspace_id=? AND module='settings' ORDER BY created_at DESC, rowid DESC LIMIT ?").all(WS_ID, SHOWN).map(shape);
  /* who sees the history of the settings: those who see the Settings tab */
  const seesAudit = u => can.scoringConfigure(u) || can.scoringViewAnalytics(u) || can.manageRoles(u);
  function on() { if (!featureOn()) throw new HttpError(409, "Smart Scoring is turned off on this server"); }
  const isOn = () => !!featureOn() && settings().enabled;
  const moduleOn = id => !!featureOn() && model.moduleOn(settings(), id);

  /* Kinds of work. A kind the admin adds gets its id here ("k_" and a short id): any id the stored settings do not
     have, its hours and points moved along with it. */
  function newKindIds(raw, cur) {
    if (!Array.isArray(raw.kinds)) return;
    const known = new Set(cur.kinds.map(k => k.id).concat(engine.KIND_IDS));
    raw.kinds.forEach(k => {
      if (!isObj(k) || typeof k.id !== "string" || known.has(k.id)) return;
      const was = k.id, id = uid("k"); k.id = id;
      [isObj(raw.hours) && raw.hours.templates, isObj(raw.assets) && raw.assets.perKind].forEach(o => { if (isObj(o) && Object.prototype.hasOwnProperty.call(o, was)) { o[id] = o[was]; delete o[was]; } });
    });
  }
  /* A kind removed: the tasks that chose it by hand go back to their title's kind — meta.kind taken off, each task
     touched and audited (module "kinds", "kind_fallback"). → {kindId: [taskIds]} */
  function kindsRemoved(cur, next, u) {
    const left = new Set(next.kinds.map(k => k.id)), out = {};
    cur.kinds.filter(k => !left.has(k.id)).forEach(k => {
      db.prepare("SELECT id, meta FROM tasks WHERE workspace_id=? AND meta LIKE ?").all(WS_ID, "%" + k.id + "%").forEach(t => {
        const m = parse(t.meta, null); if (!isObj(m)) return;
        /* the kind chosen by hand, and the kind in a mix (fewer than 2 kinds left: the mix goes) */
        const picked = m.kind === k.id, inMix = Array.isArray(m.kinds) && m.kinds.some(x => isObj(x) && x.k === k.id);
        if (!picked && !inMix) return;
        if (picked) delete m.kind;
        if (inMix) { const rest = m.kinds.filter(x => !(isObj(x) && x.k === k.id)); if (rest.length >= engine.MIX_LIMITS.min) m.kinds = rest; else delete m.kinds; }
        db.prepare("UPDATE tasks SET meta=?, updated_at=? WHERE id=?").run(JSON.stringify(m), now(), t.id);
        audit({ taskId: t.id, module: "kinds", action: "kind_fallback", actor: u.id, impersonatedBy: u.impersonatedBy, oldValue: { kind: k.id, name: k.name }, meta: Object.assign({ kind: k.id, name: k.name }, inMix ? { mix: true, mixKept: !!m.kinds } : {}) });
        (out[k.id] = out[k.id] || []).push(t.id);
      });
    });
    return out;
  }
  /* meta.kind on a task's create, save or restore: an active kind, or the one it already has (switched off since, it
     stays chosen and counts again when switched back on); anything else is dropped */
  function cleanKind(cur, b) {
    if (!b || !isObj(b.meta) || !Object.prototype.hasOwnProperty.call(b.meta, "kind")) return;
    const v = b.meta.kind, k = typeof v === "string" ? settings().kinds.find(x => x.id === v) : null;
    if (!k || !(k.active || (cur && isObj(cur.meta) && cur.meta.kind === v))) delete b.meta.kind;
  }
  /* meta.kinds, several kinds of work in one task, on its create, save or restore: [{k, n}] of 2–8 active kinds, each
     once (the same kind twice added together), n a whole number kept within 1–500; an unknown or switched-off kind, or
     an entry without a count, is dropped, and with fewer than 2 kinds left the mix goes */
  function cleanKinds(b) {
    if (!b || !isObj(b.meta) || !Object.prototype.hasOwnProperty.call(b.meta, "kinds")) return;
    const m = engine.mixClean(b.meta.kinds, settings().kinds);
    if (m && m.length >= engine.MIX_LIMITS.min) b.meta.kinds = m.map(x => ({ k: x.kind, n: x.units })); else delete b.meta.kinds;
  }
  /* a task that keeps its documents from the AI (Oct 2026, server/scoring-docs.js): meta.aiReadDocs is false, or not
     there at all (the workspace's switch decides) — anything else sent is dropped. Whoever may save the task may set it. */
  function cleanReadDocs(b) {
    if (b && isObj(b.meta) && Object.prototype.hasOwnProperty.call(b.meta, "aiReadDocs") && b.meta.aiReadDocs !== false) delete b.meta.aiReadDocs;
  }
  /* the slides or pages a person set for a document of the task (Oct 2026, server/scoring-docs.js cleanDocParts):
     meta.aiDocParts = {"<the document's ref>": "12-13"} — at most 5 documents, numbers, commas and ranges, at most 20,
     none over 999; written back as "12-13", anything else dropped, nothing left: the key goes */
  function cleanDocParts(b) {
    if (!b || !isObj(b.meta) || !Object.prototype.hasOwnProperty.call(b.meta, "aiDocParts")) return;
    const v = docsLib.cleanDocParts(b.meta.aiDocParts);
    if (v) b.meta.aiDocParts = v; else delete b.meta.aiDocParts;
  }

  route("GET", "/api/scoring/settings", (u) => { on(); return { settings: settings(), audit: seesAudit(u) ? settingsAudit() : [] }; });

  route("PUT", "/api/scoring/settings", (u, p, q, b, ctx) => {
    on();
    forbid(can.scoringConfigure(u), "change the Smart Scoring settings");
    if (!b || !b.settings || typeof b.settings !== "object" || Array.isArray(b.settings)) throw new HttpError(400, "Send the settings to save");
    if (JSON.stringify(b.settings).length > 100000) throw new HttpError(413, "These settings are too large");
    if (!/^\d{1,9}$/.test(String(b.configVersion))) throw new HttpError(400, "Say which version of the settings was changed (configVersion)");
    const reason = String((b && b.reason) || "").trim(); if (reason.length > 1000) throw new HttpError(413, "Text is too long: reason (max 1,000 characters)");
    const out = tx(db, () => {
      const cur = settings();
      if (+b.configVersion !== cur.configVersion) throw new HttpError(409, "Someone else changed the Smart Scoring settings in the meantime. Reload them and make your change again.");
      newKindIds(b.settings, cur);
      const next = model.normalizeSettings(b.settings);
      next.configVersion = cur.configVersion; next.updatedAt = cur.updatedAt; next.updatedBy = cur.updatedBy;
      if (!BONUS_READY) next.bonus.on = false;
      next.bonus.enabledAt = next.bonus.on ? (cur.bonus.on && cur.bonus.enabledAt ? cur.bonus.enabledAt : now()) : null;
      next.weighted.mappingVersion = cur.weighted.mappingVersion;
      if (JSON.stringify([cur.weighted.weights, cur.weighted.scaleMax]) !== JSON.stringify([next.weighted.weights, next.weighted.scaleMax])) next.weighted.mappingVersion++;
      const diff = model.diffSettings(cur, next);
      if (!diff.length) return { settings: cur, unchanged: true };
      next.configVersion = cur.configVersion + 1; next.updatedAt = now(); next.updatedBy = u.id;
      db.prepare("UPDATE workspaces SET scoring_settings=?, updated_at=? WHERE id=?").run(JSON.stringify(next), now(), WS_ID);
      const fallback = kindsRemoved(cur, next, u);
      audit({ module: "settings", action: "settings_changed", actor: u.id, impersonatedBy: u.impersonatedBy, oldValue: cur, newValue: next, reason, meta: { diff, configVersion: next.configVersion, fallback } });
      act(u, "edited", "workspace", WS_ID, { what: "Smart Scoring settings" });
      return { settings: next, diff };
    });
    if (!out.unchanged) security.log("scoring_settings_changed", { userId: u.id, impersonatedBy: u.impersonatedBy || undefined, ip: ctx.ip, configVersion: out.settings.configVersion, enabled: out.settings.enabled, changes: out.diff.length, paths: out.diff.slice(0, 20).map(c => c.path) });
    return { settings: out.settings, unchanged: !!out.unchanged, audit: settingsAudit() };
  });

  route("POST", "/api/scoring/delegate-leads", (u, p, q, b, ctx) => {
    on();
    forbid(can.manageRoles(u), "change roles");
    const added = {};
    tx(db, () => {
      LEAD_ROLES.forEach(id => {
        const r = db.prepare("SELECT permissions FROM roles WHERE id=?").get(id); if (!r) return;
        let perms = parse(r.permissions, []); if (!Array.isArray(perms)) perms = [];
        const add = LEAD_CAPS.filter(c => perms.indexOf(c) < 0); if (!add.length) return;
        db.prepare("UPDATE roles SET permissions=? WHERE id=?").run(JSON.stringify(perms.concat(add)), id); added[id] = add;
      });
      if (Object.keys(added).length) {
        audit({ module: "settings", action: "leads_delegated", actor: u.id, impersonatedBy: u.impersonatedBy, newValue: added, meta: { added } });
        act(u, "edited", "workspace", WS_ID, { what: "roles " + Object.keys(added).join(", ") + " (Smart Scoring approval and analytics)" });
      }
    });
    if (Object.keys(added).length) security.log("scoring_leads_delegated", { userId: u.id, impersonatedBy: u.impersonatedBy || undefined, ip: ctx.ip, added });
    return { roles: readRoles(), added, audit: seesAudit(u) ? settingsAudit() : [] };
  });

  /* ======================= a task's scores ======================= */
  const hooks = [], extenders = [], live = {};
  const J = v => v === undefined || v === null ? null : JSON.stringify(v);
  const isAssignee = (u, t) => !!u && (t.assignee === u.id || (t.assignees || []).indexOf(u.id) >= 0);
  const minutes = h => Math.round((+h || 0) * 60);
  const hoursOf = m => engine.round2(m / 60);

  /* what the scores need of a task — its fields for the permission checks, its estimate, deliverables, brief and
     dependencies — without its comments, files and versions (the sweep reads many) */
  function liteTask(id) {
    const t = db.prepare("SELECT * FROM tasks WHERE id=? AND workspace_id=?").get(String(id), WS_ID); if (!t) return null;
    const b = db.prepare("SELECT template_id, fields FROM briefs WHERE task_id=?").get(t.id);
    const people = (v, first) => { const a = parse(v, []); const out = Array.isArray(a) ? a.slice() : []; if (first && out.indexOf(first) < 0) out.unshift(first); return out; };
    return {
      id: t.id, title: t.title || "", description: t.description || "", team: t.team_id, status: t.status_id, assignee: t.assignee_id, assignees: people(t.assignees, t.assignee_id),
      reviewer: t.reviewer_id, reviewers: people(t.reviewers, t.reviewer_id), createdBy: t.created_by, meta: parse(t.meta, {}) || {}, minutes: t.estimated_minutes || 0,
      effort: (t.estimated_minutes || 0) / 60, assetCount: t.asset_count || 0, brief: b ? Object.assign({ tpl: b.template_id }, parse(b.fields, {})) : null,
      deps: db.prepare("SELECT count(*) n FROM task_dependencies WHERE task_id=?").get(t.id).n, updatedAt: t.updated_at
    };
  }
  function taskOr404(id) { const t = liteTask(id); if (!t) throw new HttpError(404, "Task not found"); return t; }
  function moduleParam(m) { if (MODULES.indexOf(m) < 0) throw new HttpError(400, "Unknown score: " + String(m).slice(0, 40) + " (hours, story or weighted)"); return m; }
  const stageOf = id => (id ? db.prepare("SELECT id, kind FROM task_statuses WHERE id=?").get(id) : null) || null;
  const openDeps = id => db.prepare("SELECT count(*) n FROM task_dependencies d JOIN tasks t ON t.id=d.depends_on_task_id JOIN task_statuses s ON s.id=t.status_id WHERE d.task_id=? AND coalesce(s.is_completed,0)=0").get(id).n;
  /* the scope a lock remembers: the deliverables (no count is one), the brief and description, the dependencies — and,
     for a task of several kinds of work, its split as stored (kinds: "kv:1,reels:4,video:1"; only when there is one, so
     a lock taken before it compares as it always did) */
  const mixKey = m => (Array.isArray(m) && m.length ? m.map(x => x.kind + ":" + x.units).sort().join(",") : "");
  const scopeOf = t => {
    const o = { assets: Math.max(1, Math.round(+t.assetCount || 0)), deps: t.deps || 0, text: engine.inputHash({ description: t.description, brief: t.brief }) };
    const m = engine.mixClean(t.meta && t.meta.kinds, null); if (m && m.length >= engine.MIX_LIMITS.min) o.kinds = mixKey(m);
    return o;
  };
  const SCOPE_KEYS = ["assets", "deps", "text", "kinds"];
  const scopePart = (s, k) => (k === "kinds" ? s.kinds || "" : s[k]);
  const sameScope = (a, b) => !!a && !!b && SCOPE_KEYS.every(k => scopePart(a, k) === scopePart(b, k));
  /* "completed": the stages the settings name, else every closed stage but Declined */
  function completedStage(statusId, s) {
    const list = s.bonus && s.bonus.completionStages;
    if (Array.isArray(list) && list.length) return list.indexOf(statusId) >= 0;
    const st = stageOf(statusId); return !!st && st.kind === "closed" && st.id !== "declined";
  }

  const readRow = (id, m) => db.prepare("SELECT * FROM task_scoring WHERE task_id=? AND module=?").get(id, m) || null;
  const readRows = id => { const o = { hours: null, story: null, weighted: null }; db.prepare("SELECT * FROM task_scoring WHERE task_id=?").all(id).forEach(r => { if (r.module in o) o[r.module] = r; }); return o; };
  const COLS = ["math_value", "math_inputs", "ai_value", "ai_run_id", "final_value", "unit", "source", "status", "factors", "mapping_version", "config_version", "locked_value", "locked_at", "locked_by", "approved_by", "approved_at", "scope_fingerprint", "proposal"];
  const blank = (m, s) => ({ math_value: null, math_inputs: "{}", ai_value: null, ai_run_id: null, final_value: null, unit: UNIT[m], source: null, status: "draft", factors: "{}", mapping_version: m === "weighted" ? s.weighted.mappingVersion : null, config_version: s.configVersion, locked_value: null, locked_at: null, locked_by: null, approved_by: null, approved_at: null, scope_fingerprint: null, proposal: null });
  /* every write to a row goes up one revision, and only onto the revision it was read at */
  function saveRow(taskId, m, prev, changes, actorId, s) {
    const next = Object.assign({}, prev || blank(m, s), changes), vals = COLS.map(c => next[c] === undefined ? null : next[c]);
    if (!prev) db.prepare("INSERT INTO task_scoring (task_id,module,workspace_id," + COLS.join(",") + ",updated_by,updated_at,rev) VALUES (?,?,?," + COLS.map(() => "?").join(",") + ",?,?,1)").run(taskId, m, WS_ID, ...vals, actorId || null, now());
    else if (!db.prepare("UPDATE task_scoring SET " + COLS.map(c => c + "=?").join(",") + ", updated_by=?, updated_at=?, rev=rev+1 WHERE task_id=? AND module=? AND rev=?").run(...vals, actorId || null, now(), taskId, m, prev.rev).changes) throw new HttpError(409, STALE);
    return readRow(taskId, m);
  }
  /* a row as the panel reads it */
  function rowOut(r) {
    if (!r) return null;
    const math = parse(r.math_inputs, {}) || {}, mi = isObj(math.inputs) ? math.inputs : {};
    const out = {
      module: r.module, unit: r.unit || UNIT[r.module], value: r.final_value, source: r.source || null, status: r.status, locked: LOCKED.has(r.status),
      mathValue: r.math_value, math, aiValue: r.ai_value, aiRunId: r.ai_run_id || null, factors: parse(r.factors, {}) || {},
      mappingVersion: r.mapping_version, configVersion: r.config_version,
      lockedValue: r.locked_value, lockedAt: r.locked_at || null, lockedBy: r.locked_by || null, approvedBy: r.approved_by || null, approvedAt: r.approved_at || null,
      /* approved in the act of locking it (not a baseline frozen earlier and approved later) */
      approvedAtLock: !!(r.approved_by && r.approved_at && r.locked_at === r.approved_at && r.locked_by === r.approved_by),
      proposal: parse(r.proposal, null), scope: parse(r.scope_fingerprint, null), updatedBy: r.updated_by || null, updatedAt: r.updated_at || null, rev: r.rev
    };
    /* the hours row: each kind's hours when its math was worked out for several kinds of work, else null */
    if (r.module === "hours") out.mix = Array.isArray(mi.mix) && mi.mix.length ? mi.mix : null;
    return out;
  }
  /* what the audit keeps of a row (without the explanation steps) */
  const snap = r => r ? { value: r.final_value, source: r.source || null, status: r.status, mathValue: r.math_value, aiValue: r.ai_value, factors: parse(r.factors, {}) || {}, lockedValue: r.locked_value, lockedAt: r.locked_at || null, lockedBy: r.locked_by || null, approvedBy: r.approved_by || null, approvedAt: r.approved_at || null, proposal: parse(r.proposal, null), scope: parse(r.scope_fingerprint, null), rev: r.rev } : null;
  const auditRow = (taskId, m, action, actor, prev, next, reason, meta) => audit({ taskId, module: m, action, actor: actor ? actor.id : null, impersonatedBy: actor && actor.impersonatedBy, oldValue: snap(prev), newValue: snap(next), reason, meta });
  const auditOut = r => { const m = parse(r.meta, {}) || {}; return { id: r.id, module: r.module, action: r.action, by: r.actor_id || null, impersonatedBy: r.impersonated_by || null, at: r.created_at, reason: r.reason || "", from: parse(r.old_value, null), to: parse(r.new_value, null), meta: m }; };
  const awardOut = a => ({ id: a.id, userId: a.user_id, share: a.share, estimate: a.estimate_snapshot, actual: a.actual_snapshot, basePoints: a.base_points, bonusPoints: a.bonus_points, awardedPoints: a.awarded_points, status: a.status, reasons: parse(a.reasons, []) || [], needsReview: !!a.needs_review, reviewerId: a.reviewer_id || null, reviewedAt: a.reviewed_at || null, reviewNote: a.review_note || "", qualityScore: a.quality_score, policyVersion: a.policy_version, recalculatedAt: a.recalculated_at || null, createdAt: a.created_at });

  /* the task's own estimate and its "where from" marks (meta.effortManual / meta.effortAuto, src/effort-estimate.js) */
  const touch = id => db.prepare("UPDATE tasks SET updated_at=? WHERE id=?").run(now(), id);
  function writeEffort(taskId, hours, marks) {
    const row = db.prepare("SELECT meta FROM tasks WHERE id=?").get(taskId), meta = parse(row && row.meta, {}) || {};
    if (marks === "manual") { meta.effortManual = true; delete meta.effortAuto; }
    else if (isObj(marks)) { delete meta.effortManual; meta.effortAuto = marks; }
    db.prepare("UPDATE tasks SET estimated_minutes=?, meta=?, updated_at=? WHERE id=?").run(minutes(hours), JSON.stringify(meta), now(), taskId);
  }
  /* the estimator's mark for an estimate taken from the math: "typical for this kind, n deliverables" */
  /* (several kinds of work: mix [{k, n}] beside the primary kind and all the deliverables, as src/effort-estimate.js marks it) */
  const mathMarks = row => {
    const mi = parse(row && row.math_inputs, {}) || {}, inp = mi.inputs || {}; const v = row && row.math_value != null ? halfHour(row.math_value) : null;
    if (!(inp.kind && v)) return "manual";
    const marks = { src: "kind", basis: "", n: 0, low: mi.low != null ? halfHour(mi.low) : v, high: mi.high != null ? halfHour(mi.high) : v, reason: "", kind: inp.kind, items: inp.units || 1 };
    if (Array.isArray(inp.mix) && inp.mix.length) marks.mix = inp.mix.map(x => ({ k: x.kind, n: x.units }));
    return marks;
  };
  /* the estimator's mark for an estimate taken from the AI's suggestion (server/scoring-ai.js gives a fuller one) */
  const aiMarks = v => ({ src: "ai", basis: "", n: 0, low: halfHour(v), high: halfHour(v), reason: "" });
  /* where a final value taken from {use} comes from, and the task's mark for it (hours) */
  const sourceOfUse = use => (use === "math" ? "math" : use === "ai" ? "ai" : "manual");
  const marksOfUse = (use, row, v) => (use === "math" ? mathMarks(row) : use === "ai" ? aiMarks(v) : "manual");
  /* server/scoring-ai.js: whether a row's AI suggestion may be taken now — fn(row, task, module, settings) →
     {ok, status?, error?, far?, marks?}; without it {use:"ai"} is refused */
  let aiGuard = null;
  /* server/scoring-ai.js: PUT /api/tasks/:id/scoring/context, the team's context for the AI — fn(u, p, q, b, ctx) */
  let contextPut = null;
  function sourceFromMeta(meta, dflt) {
    const a = meta && meta.effortAuto;
    if (a && a.src === "ai") return "ai";
    if (a && (a.src === "history" || a.src === "kind")) return "math";
    if (meta && meta.effortManual) return "manual";
    return dflt;
  }
  /* Effort Hours follows the task's Estimate. Before the lock a different Estimate is the new final value, from where its
     marks say (typed: manual; a number nobody typed when the task was created, or found by the sweep: legacy). After
     the lock (only someone allowed got it past guardTaskWrite) it is a new lock, no longer approved. */
  function syncHours(t, row, s, actor, info) {
    const mins = t.minutes, rowMins = row && row.final_value != null ? minutes(row.final_value) : 0;
    if (mins === rowMins || (!row && mins <= 0)) return row;
    const value = mins > 0 ? hoursOf(mins) : null, actorId = actor ? actor.id : null, via = (info && info.via) || "task";
    if (row && LOCKED.has(row.status)) {
      const changes = value === null
        ? { final_value: null, source: null, status: "draft", locked_value: null, locked_at: null, locked_by: null, approved_by: null, approved_at: null, scope_fingerprint: null }
        : { final_value: value, locked_value: value, source: sourceFromMeta(t.meta, "manual"), status: "locked", approved_by: null, approved_at: null, locked_at: now(), locked_by: actorId, scope_fingerprint: J(scopeOf(t)) };
      const next = saveRow(t.id, "hours", row, changes, actorId, s);
      auditRow(t.id, "hours", "locked_changed", actor, row, next, "", { via, approvalCleared: !!row.approved_by, unlocked: value === null });
      return next;
    }
    const src = value === null ? null : sourceFromMeta(t.meta, actor && !(info && info.created) && via !== "sync" ? "manual" : "legacy");
    const next = saveRow(t.id, "hours", row, { final_value: value, source: src, status: row && row.status === "proposed" ? "proposed" : "draft" }, actorId, s);
    auditRow(t.id, "hours", row ? "estimate_changed" : "estimate_set", actor, row, next, "", { via });
    return next;
  }
  /* work has started: the task left a queue stage (or was created) for a stage of work, review or revision, or time is
     logged on it (the time log's own entries, not the legacy one) */
  function startedWork(t, info) {
    if (info && (info.created || info.prevStatus !== undefined) && info.prevStatus !== t.status) {
      const to = stageOf(t.status), from = info.created ? null : stageOf(info.prevStatus);
      if (to && WORK_KINDS.has(to.kind) && (info.created || (from && from.kind === "queue"))) return "stage";
    }
    try { if (db.prepare("SELECT 1 FROM task_time_entries WHERE task_id=? AND deleted_at IS NULL AND source='manual' LIMIT 1").get(t.id)) return "time"; } catch (e) { /* no time log */ }
    return null;
  }
  /* for the audit of an approval or a re-baseline: was the work already under way (past a queue stage, or time logged)?
     A lock made then is no baseline set before the work — the efficiency bonus (a later phase) reads it so */
  function workStartedNow(t) { const st = stageOf(t.status); return !!(st && st.kind !== "queue") || startedWork(t, {}) === "time"; }

  /* The re-evaluation after a task is written (and in the sweep): stateless, in its own transaction, writing only
     what changed. Returns whether it changed anything. */
  function evaluate(taskId, actor, info) {
    if (!featureOn()) return false;
    const s = settings(); if (!s.enabled) return false;
    info = info || {};
    return tx(db, () => {
      const t = liteTask(taskId); if (!t) return false;
      const rows = readRows(t.id), actorId = actor ? actor.id : null; let changed = false;
      if (model.moduleOn(s, "hours")) {
        const before = rows.hours; rows.hours = syncHours(t, rows.hours, s, actor, info); if (rows.hours !== before) changed = true;
        const h = rows.hours;
        if (h && s.hours.lockPolicy === "approve_or_work_start" && h.final_value > 0 && !LOCKED.has(h.status)) {
          const why = startedWork(t, info);
          if (why) {
            const next = saveRow(t.id, "hours", h, { status: "locked", locked_value: h.final_value, locked_at: now(), locked_by: null, approved_by: null, approved_at: null, scope_fingerprint: J(scopeOf(t)) }, actorId, s);
            auditRow(t.id, "hours", "frozen_at_work_start", actor, h, next, "", { trigger: why, stage: t.status });
            rows.hours = next; changed = true;
          }
        }
      }
      const scope = scopeOf(t);
      MODULES.forEach(m => {
        const r = rows[m]; if (!r || !LOCKED.has(r.status) || !model.moduleOn(s, m)) return;
        const was = parse(r.scope_fingerprint, null);
        let changes = null, action = null, meta = null;
        if (!was) { changes = { scope_fingerprint: J(scope) }; action = "scope_recorded"; }
        else if (r.status !== "rebaseline_needed" && !sameScope(was, scope)) { changes = { status: "rebaseline_needed" }; action = "scope_changed"; meta = { from: was, to: scope, what: SCOPE_KEYS.filter(k => scopePart(was, k) !== scopePart(scope, k)) }; }
        else if (r.status === "rebaseline_needed" && sameScope(was, scope)) { changes = { status: r.approved_by ? "approved" : "locked" }; action = "scope_restored"; }
        if (!changes) return;
        const next = saveRow(t.id, m, r, changes, actorId, s); auditRow(t.id, m, action, actor, r, next, "", meta); rows[m] = next; changed = true;
      });
      /* a finished task opened again: its awards wait for it to be finished again */
      if (!completedStage(t.status, s)) {
        const r = db.prepare("UPDATE task_efficiency_awards SET status='provisional', recalculated_at=? WHERE task_id=? AND workspace_id=? AND status IN ('approved','pending_review','ineligible')").run(now(), t.id, WS_ID);
        if (r.changes) { audit({ taskId: t.id, module: "efficiency", action: "reopened", actor: actorId, impersonatedBy: actor && actor.impersonatedBy, meta: { awards: r.changes, stage: t.status } }); changed = true; }
      }
      if (changed) touch(t.id);
      return changed;
    });
  }
  /* after any task write, outside its transaction: this module's re-evaluation, then every registered hook */
  function afterTaskWrite(taskId, user, info) {
    if (!featureOn()) return false;
    let changed = false;
    try { changed = evaluate(taskId, user || null, info || {}); } catch (e) { console.error("[scoring] re-evaluating " + taskId + ": " + (e && e.message)); }
    hooks.forEach(fn => { try { fn(taskId, user || null, info || {}); } catch (e) { console.error("[scoring] a task-write hook failed for " + taskId + ": " + (e && e.message)); } });
    return changed;
  }
  /* the tasks changed since the last sweep (and those whose time log changed), re-evaluated; nothing while it is off,
     so turning it on catches up with everything changed in between */
  function sweepPlan() {
    db.exec("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)");
    const since = (db.prepare("SELECT value FROM app_meta WHERE key='scoring_sweep_at'").get() || {}).value || "", started = now();
    const ids = new Set(db.prepare("SELECT id FROM tasks WHERE workspace_id=? AND coalesce(updated_at,'') > ?").all(WS_ID, since).map(r => r.id));
    try { db.prepare("SELECT DISTINCT task_id FROM task_time_entries WHERE workspace_id=? AND (created_at > ? OR coalesce(edited_at,'') > ? OR coalesce(deleted_at,'') > ?)").all(WS_ID, since, since, since).forEach(r => ids.add(r.task_id)); } catch (e) { /* no time log */ }
    return { ids: [...ids], started, changed: [] };
  }
  const sweepOne = (plan, id) => { try { if (evaluate(id, null, { via: "sweep" })) plan.changed.push(id); } catch (e) { console.error("[scoring] sweep " + id + ": " + (e && e.message)); } };
  function sweepDone(plan) {
    const changed = plan.changed;
    db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('scoring_sweep_at', ?)").run(plan.started);
    if (changed.length) { bumpData(); if (changed.length <= 50) changed.forEach(id => { try { announce(id); } catch (e) { /* best effort */ } }); console.log("[scoring] sweep: " + changed.length + " task(s) re-evaluated with changes"); }
    return changed.length;
  }
  function sweep() {
    if (!isOn()) return 0;
    const plan = sweepPlan();
    plan.ids.forEach(id => sweepOne(plan, id));
    return sweepDone(plan);
  }
  /* The timers' sweep (Oct 2026, performance): the same, SWEEP_BATCH tasks at a time with the server free to answer in
     between (setImmediate), so a sweep over many tasks — every task, on the first start after an update — never holds
     a request for half a second. Each task is its own transaction, as above; the time it remembers is taken at the
     start, so a task written while it runs is looked at again next time. One at a time. */
  let sweeping = false;
  function sweepInBatches(done) {
    if (sweeping || !isOn()) { if (done) done(0); return; }
    sweeping = true;
    let plan, i = 0;
    const finish = n => { sweeping = false; if (done) done(n); };
    const step = () => {
      try {
        if (!plan) plan = sweepPlan();
        for (const end = Math.min(plan.ids.length, i + SWEEP_BATCH); i < end; i++) sweepOne(plan, plan.ids[i]);
        if (i < plan.ids.length) return setImmediate(step);
        finish(sweepDone(plan));
      } catch (e) { console.error("[scoring] sweep: " + (e && e.message)); finish(0); }
    };
    step();
  }
  const sweepSafe = () => sweepInBatches();

  /* Once: an Effort Hours row for every task with an estimate, from that estimate and where it came from — unverified,
     nothing locked, the task's own number never rewritten. In one transaction; the counts are logged and kept. */
  function backfill() {
    db.exec("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)");
    if (db.prepare("SELECT 1 FROM app_meta WHERE key='scoring_backfill_v1'").get()) return null;
    const counts = { ai: 0, math: 0, manual: 0, legacy: 0, kept: 0 }, s = settings(), at = now();
    tx(db, () => {
      const ins = db.prepare("INSERT OR IGNORE INTO task_scoring (task_id,module,workspace_id,final_value,unit,source,status,factors,math_inputs,config_version,updated_at,rev) VALUES (?,'hours',?,?,'h',?,'unverified','{}','{}',?,?,1)");
      db.prepare("SELECT id, estimated_minutes, meta FROM tasks WHERE workspace_id=? AND estimated_minutes > 0").all(WS_ID).forEach(t => {
        const src = sourceFromMeta(parse(t.meta, {}) || {}, "legacy");
        if (ins.run(t.id, WS_ID, hoursOf(t.estimated_minutes), src, s.configVersion, at).changes) counts[src]++; else counts.kept++;
      });
      const made = counts.ai + counts.math + counts.manual + counts.legacy;
      if (made) audit({ module: "hours", action: "backfilled", meta: { counts }, at });
      db.prepare("INSERT INTO app_meta (key, value) VALUES ('scoring_backfill_v1', ?)").run(JSON.stringify({ at, counts }));
    });
    const made = counts.ai + counts.math + counts.manual + counts.legacy;
    if (made || counts.kept) console.log("[scoring] backfill: " + made + " estimate(s) kept as Effort Hours rows, unverified (ai " + counts.ai + ", math " + counts.math + ", manual " + counts.manual + ", legacy " + counts.legacy + (counts.kept ? ", " + counts.kept + " already there" : "") + ")");
    return counts;
  }

  /* ---------- the guards on the task's own writes (server.js) ---------- */
  /* while Smart Scoring logs time, the Actual is the time log's */
  const timeLogMode = () => { if (!featureOn()) return false; const s = settings(); return s.enabled && model.moduleOn(s, "hours"); };
  function keepActual(cur, b) {
    if (!isObj(b.meta)) b.meta = {};
    const was = (cur && cur.meta || {}).actualEffort;
    if (was === undefined) delete b.meta.actualEffort; else b.meta.actualEffort = was;
  }
  const hoursLocked = id => { const r = db.prepare("SELECT status FROM task_scoring WHERE task_id=? AND module='hours'").get(id); return !!r && LOCKED.has(r.status); };
  /* PUT /api/tasks/:id — after the concurrent-edit merge (and a slim copy's), before the task is cleaned and saved */
  function guardTaskWrite(u, cur, b) {
    cleanKind(cur, b); cleanKinds(b); cleanReadDocs(b); cleanDocParts(b);
    if (!timeLogMode() || !b || !cur) return;
    if (hoursLocked(cur.id)) {
      if (b.effort === undefined) b.effort = cur.effort;
      if (minutes(b.effort) !== minutes(cur.effort) && !can.scoringEditTask(u, cur)) throw new HttpError(403, "This task's estimate is locked. Only someone allowed to change locked estimates can change it; propose a change in the task's Scoring & Intelligence instead.");
    }
    keepActual(cur, b);
  }
  /* POST /api/tasks: a new task has logged no time */
  function guardNewTask(u, b) { cleanKind(null, b); cleanKinds(b); cleanReadDocs(b); cleanDocParts(b); if (timeLogMode() && b && isObj(b.meta)) delete b.meta.actualEffort; }
  /* POST /api/restore/task/:id: a locked estimate and the logged Actual stay as they are now */
  function guardRestore(u, cur, next) {
    cleanKind(cur, next); cleanKinds(next); cleanReadDocs(next); cleanDocParts(next);
    if (!timeLogMode() || !cur || !next) return;
    if (hoursLocked(cur.id)) next.effort = cur.effort;
    keepActual(cur, next);
  }
  /* DELETE /api/tasks/:id (and a new task written under an id): inside the caller's transaction, each score, the time
     log, the awards and the outcome links leave a "removed with task" line in the audit first */
  function removeTaskRows(taskId, actor) {
    const actorId = actor ? actor.id : null, imp = actor && actor.impersonatedBy;
    const get = sql => { try { return db.prepare(sql).get(taskId) || null; } catch (e) { return null; } };
    let rows = []; try { rows = db.prepare("SELECT * FROM task_scoring WHERE task_id=?").all(taskId); } catch (e) { /* none */ }
    rows.forEach(r => audit({ taskId, module: r.module, action: "removed_with_task", actor: actorId, impersonatedBy: imp, oldValue: snap(r) }));
    const te = get("SELECT count(*) n, coalesce(sum(minutes),0) m FROM task_time_entries WHERE task_id=? AND deleted_at IS NULL");
    if (te && te.n) audit({ taskId, module: "time", action: "removed_with_task", actor: actorId, impersonatedBy: imp, meta: { entries: te.n, minutes: te.m } });
    const aw = get("SELECT count(*) n FROM task_efficiency_awards WHERE task_id=?");
    if (aw && aw.n) audit({ taskId, module: "efficiency", action: "removed_with_task", actor: actorId, impersonatedBy: imp, meta: { awards: aw.n } });
    const ol = get("SELECT count(*) n FROM task_outcome_links WHERE task_id=?");
    if (ol && ol.n) audit({ taskId, module: "outcomes", action: "removed_with_task", actor: actorId, impersonatedBy: imp, meta: { links: ol.n } });
    /* the team's context for the AI (server/scoring-ai.js) goes with the task, without an audit line: it is no score */
    ["task_scoring", "task_time_entries", "task_efficiency_awards", "task_outcome_links", "scoring_ai_context"].forEach(tb => { try { db.prepare("DELETE FROM " + tb + " WHERE task_id=?").run(taskId); } catch (e) { /* a table this database does not have */ } });
  }

  /* The AI's suggestion for a score (server/scoring-ai.js): only ai_value and ai_run_id are written — never the final
     value, the status, the lock or the ratings; a score with no row yet gets a draft without a final value. The row's
     revision goes up (other open copies reload it), the task is touched, and it is audited as "ai_suggested". Nothing
     is written when the row already holds this suggestion. Inside the caller's transaction. */
  function setAiSuggestion(taskId, m, value, runId, actor, meta) {
    const row = readRow(taskId, m);
    if (row && row.ai_value === value && (row.ai_run_id || null) === (runId || null)) return { row, changed: false };
    const next = saveRow(taskId, m, row, { ai_value: value, ai_run_id: runId || null }, actor ? actor.id : null, settings());
    touch(taskId);
    auditRow(taskId, m, "ai_suggested", actor, row, next, "", meta || {});
    return { row: next, changed: true };
  }

  /* ---------- the routes ---------- */
  /* writes: the server's feature, the workspace's master switch and the module must be on */
  function writable(m) {
    on();
    const s = settings();
    if (!s.enabled) throw new HttpError(409, "Smart Scoring is turned off in this workspace, so scores cannot be changed now. Their history can still be read.");
    if (m && !model.moduleOn(s, m)) throw new HttpError(409, NAME[m] + " is turned off in Smart Scoring, so its scores cannot be changed now.");
    return s;
  }
  function reasonOf(b) { const r = String((b && b.reason) || "").trim(); if (r.length > 1000) throw new HttpError(413, "Text is too long: reason (max 1,000 characters)"); return r; }
  function revOf(b, required) {
    if (!b || b.rev === undefined || b.rev === null) { if (required) throw new HttpError(400, "Say which revision of the score was changed (rev; 0 when it has none yet)"); return null; }
    if (!/^\d{1,9}$/.test(String(b.rev))) throw new HttpError(400, "rev is the score's revision, a whole number");
    return +b.rev;
  }
  /* the value a change sends: {value}, {ratings} (Story and Weighted Points), {use:"math"} (the calculated value) or
     {use:"ai"} (the AI's suggestion, server/scoring-ai.js) — never onto a locked score, never one the AI's answer did not
     give, never one made for the task as it was before (the AI module's check says so) */
  function valueFrom(m, b, row, s, t) {
    if (b.use === "math") {
      if (!row || row.math_value == null) throw new HttpError(400, "Calculate it first: there is no math value to use.");
      return { value: m === "hours" ? halfHour(row.math_value) : row.math_value, ratings: null, use: "math" };
    }
    if (b.use === "ai") {
      if (!row || row.ai_value == null) throw new HttpError(400, "There is no AI suggestion to use yet: ask the AI first.");
      if (LOCKED.has(row.status)) throw new HttpError(409, NAME[m] + " is locked, so the AI's suggestion is not applied to it. Re-baseline it, with a reason, to change it.");
      const chk = aiGuard ? aiGuard(row, t, m, s) : null;
      if (!chk) throw new HttpError(409, "AI suggestions are not available on this server.");
      if (!chk.ok) throw new HttpError(chk.status || 409, chk.error || "The AI's suggestion cannot be used.");
      let value = engine.round2(row.ai_value);
      if (m === "hours") value = Math.min(s.hours.bounds.max, Math.max(s.hours.bounds.min, halfHour(value)));
      else if (m === "story") { if (engine.STORY_SCALE.indexOf(value) < 0) throw new HttpError(400, "The AI's suggestion could not be used: story points are 1, 2, 3, 5, 8 or 13."); }
      else value = Math.min(s.weighted.scaleMax, Math.max(1, value));
      return { value, ratings: null, use: "ai", far: !!chk.far, marks: chk.marks || null, runId: row.ai_run_id || null };
    }
    if (b.use !== undefined && b.use !== null) throw new HttpError(400, "Only the math value or the AI's suggestion can be used here (use: \"math\" or \"ai\")");
    if (isObj(b.ratings) && m !== "hours") {
      const given = {}; engine.FACTORS.forEach(f => { try { const v = rating(b.ratings[f], f); if (v !== null) given[f] = v; } catch (e) { throw new HttpError(400, e.message); } });
      const r = m === "story" ? engine.storyPoints(s.story, given) : engine.weightedPoints(s.weighted, given);
      if (r.value === null) throw new HttpError(400, "Rate every factor from 1 to 5 first" + (r.missing && r.missing.length ? " (not rated: " + r.missing.join(", ") + ")" : "") + ".");
      return { value: r.value, ratings: r.inputs.ratings, use: "ratings" };
    }
    const n = typeof b.value === "number" ? b.value : typeof b.value === "string" && b.value.trim() !== "" ? Number(b.value) : NaN;
    if (!Number.isFinite(n)) throw new HttpError(400, m === "hours" ? "Send the new value in hours" : "Send the new value, or the four ratings");
    if (m === "hours") { const { min, max } = s.hours.bounds; if (n < min || n > max) throw new HttpError(400, "Hours are between " + min + " and " + max + "."); return { value: engine.round2(n), ratings: null }; }
    if (m === "story") { if (engine.STORY_SCALE.indexOf(n) < 0) throw new HttpError(400, "Story points are 1, 2, 3, 5, 8 or 13."); return { value: n, ratings: null }; }
    if (n < 1 || n > s.weighted.scaleMax) throw new HttpError(400, "Weighted points are between 1 and " + s.weighted.scaleMax + "."); return { value: engine.round2(n), ratings: null };
  }
  /* approving and re-baselining: never while acting as someone else, never by an assignee unless the policy allows it */
  function mayApprove(u, t, policy) {
    if (u.stakeholder) forbid(false, "approve this task's estimate");
    if (u.impersonatedBy) throw new HttpError(403, "Estimates are never approved or re-baselined while acting as someone else.");
    if (can.scoringApproveEstimate(u, t, policy)) return;
    if (has(u, "scoring_approve_estimate") && isAssignee(u, t)) throw new HttpError(403, "You are assigned to this task, so you cannot approve or re-baseline its estimate.");
    forbid(false, "approve and lock this task's estimate");
  }
  /* what a person sees of a task's scores, and what they may do with them */
  function view(u, id) {
    const t = liteTask(id), s = settings(), rows = readRows(id);
    const awards = db.prepare("SELECT * FROM task_efficiency_awards WHERE task_id=? AND workspace_id=? ORDER BY created_at").all(id, WS_ID);
    const credited = awards.map(a => a.user_id), sees = can.scoringSeesEfficiency(u, t, credited);
    const seesAll = sees && (has(u, "scoring_approve_completion") || has(u, "scoring_view_analytics"));
    const policy = s.overrides, assignee = isAssignee(u, t), approve = can.scoringApproveEstimate(u, t, policy);
    const edit = can.scoringEditTask(u, t), propose = can.scoringPropose(u, t), stage = stageOf(t.status);
    /* several kinds of work: the task's split as it counts now ([{k, n}], active kinds only), or null */
    const mix = engine.kindMix(t, s), kinds = mix ? mix.map(x => ({ k: x.kind, n: x.units })) : null;
    const out = {
      taskId: id,
      kinds,
      rows: { hours: rowOut(rows.hours), story: rowOut(rows.story), weighted: rowOut(rows.weighted) },
      audit: db.prepare("SELECT * FROM scoring_audit WHERE workspace_id=? AND task_id=? AND (coalesce(module,'') <> 'efficiency' OR ?) ORDER BY created_at DESC, rowid DESC LIMIT ?").all(WS_ID, id, sees ? 1 : 0, TASK_AUDIT).map(auditOut),
      on: { feature: !!featureOn(), enabled: s.enabled, hours: model.moduleOn(s, "hours"), story: model.moduleOn(s, "story"), weighted: model.moduleOn(s, "weighted"), kpi: model.moduleOn(s, "kpi"), okr: model.moduleOn(s, "okr") },
      context: { kind: engine.kindOfTask(t, s), kindPicked: !!engine.kindPick(t, s), kinds, assetCount: t.assetCount, deliverables: Math.max(1, t.assetCount), openDeps: openDeps(id), dependencies: t.deps, scope: scopeFromAssets(t.assetCount), stage: t.status, stageKind: stage ? stage.kind : null, lockPolicy: s.hours.lockPolicy, requireReason: !!policy.requireReason, requireApproval: !!policy.requireApproval, configVersion: s.configVersion },
      can: {
        view: true, calculate: edit || propose, propose, edit, approve, rebaseline: approve, requestAi: can.scoringRequestAi(u, t), logTime: can.logTime(u, t),
        approveCompletion: can.scoringApproveCompletion(u, t, credited), viewEfficiency: sees, viewAnalytics: can.scoringViewAnalytics(u),
        assignee, impersonating: !!u.impersonatedBy,
        approveBlocked: approve ? null : u.stakeholder ? "stakeholder" : u.impersonatedBy ? "impersonating" : !has(u, "scoring_approve_estimate") ? "permission" : "assignee"
      }
    };
    if (sees) out.efficiency = { awards: awards.filter(a => seesAll || a.user_id === u.id).map(awardOut) };
    extenders.forEach(fn => { try { fn(u, t, out); } catch (e) { console.error("[scoring] a view extension failed: " + (e && e.message)); } });
    return out;
  }
  /* a write answers with the scores as the caller now sees them, and the task */
  const answer = (u, id, extra) => Object.assign(view(u, id), { task: forViewer(u, sz.readTask(db, id)) }, extra || {});

  route("GET", "/api/tasks/:id/scoring", (u, p) => {
    on();
    const t = taskOr404(p.id);
    forbid(can.scoringView(u, t), "see this task's scores");
    /* catch up first (a change made while it was off, time logged since): the same re-evaluation as after a write */
    if (evaluate(t.id, null, { via: "sync" })) bumpData();
    return view(u, t.id);
  });

  route("POST", "/api/tasks/:id/scoring/calculate", (u, p, q, b) => {
    on();
    const t = taskOr404(p.id); b = isObj(b) ? b : {};
    const m = moduleParam(b.module);
    forbid(can.scoringPropose(u, t) || can.scoringEditTask(u, t), "calculate this task's scores");
    const s = writable(m);
    let result;
    tx(db, () => {
      const rows = readRows(t.id);
      if (m === "hours") rows.hours = syncHours(t, rows.hours, s, null, { via: "sync" });
      const factors = {}; MODULES.forEach(k => { factors[k] = rows[k] ? parse(rows[k].factors, {}) || {} : {}; });
      try { result = calculate(s, t, b, { openDeps: openDeps(t.id), factors }); } catch (e) { if (e instanceof CalcError) throw new HttpError(400, e.message); throw e; }
      const row = rows[m];
      /* the math is the final value only on a draft with no estimate of its own (a math one, or one nobody typed) */
      const setFinal = result.value !== null && (!row || (row.status === "draft" && (row.final_value === null || row.source === "math" || row.source === "legacy" || row.source === null)));
      const mathInputs = { inputs: result.inputs, steps: result.steps, low: result.low === undefined ? null : result.low, high: result.high === undefined ? null : result.high, index: result.index === undefined ? null : result.index, split: !!result.split, reason: result.reason || null, missing: result.missing || [], suggestions: result.suggestions, at: now(), by: u.id, engine: engine.ENGINE_VERSION };
      const changes = { math_value: result.value, math_inputs: J(mathInputs), factors: J(result.factors || {}), config_version: s.configVersion };
      if (m === "weighted") changes.mapping_version = result.mappingVersion;
      if (setFinal) { changes.final_value = result.final; changes.source = "math"; }
      const next = saveRow(t.id, m, row, changes, u.id, s);
      if (setFinal && m === "hours") writeEffort(t.id, result.final, mathMarks(next)); else touch(t.id);
      auditRow(t.id, m, "calculated", u, row, next, "", { value: result.value, setFinal, reason: result.reason || null });
      result.finalSet = setFinal;
    });
    afterTaskWrite(t.id, u, { via: "scoring" });
    const r = result;
    return answer(u, t.id, { result: { module: r.module, value: r.value, final: r.final, finalSet: r.finalSet, unit: r.unit, low: r.low === undefined ? null : r.low, high: r.high === undefined ? null : r.high, index: r.index === undefined ? null : r.index, split: !!r.split, reason: r.reason || null, missing: r.missing || [], mappingVersion: r.mappingVersion === undefined ? null : r.mappingVersion, inputs: r.inputs, steps: r.steps, explanation: r.explanation, suggestions: r.suggestions } });
  });

  route("PUT", "/api/tasks/:id/scoring/:module", (u, p, q, b, ctx) => {
    /* PUT …/scoring/context is server/scoring-ai.js's (the team's context for the AI): the server's router takes the
       first route that matches, and this one is registered first */
    if (p.module === "context" && contextPut) return contextPut(u, p, q, b, ctx);
    on();
    const t = taskOr404(p.id), m = moduleParam(p.module); b = isObj(b) ? b : {};
    const edit = can.scoringEditTask(u, t), propose = can.scoringPropose(u, t);
    forbid(edit || propose, "change this task's scores");
    const s = writable(m);
    const reason = reasonOf(b); if (s.overrides.requireReason && !reason) throw new HttpError(400, "Say why the score changes: a reason is required.");
    const rev = revOf(b, true);
    /* someone allowed to change scores sets it — unless changes need an approval they cannot give — anyone else proposes */
    const direct = edit && (!s.overrides.requireApproval || can.scoringApproveEstimate(u, t, s.overrides));
    tx(db, () => {
      const rows = readRows(t.id);
      if (m === "hours") rows.hours = syncHours(t, rows.hours, s, null, { via: "sync" });
      const row = rows[m];
      if ((row ? row.rev : 0) !== rev) throw new HttpError(409, STALE);
      const v = valueFrom(m, b, row, s, t);
      /* a suggestion far from the calculation is taken only by someone who says why, whatever the reason policy */
      if (v.use === "ai" && v.far && !reason) throw new HttpError(400, "The AI's suggestion is far from the calculation: say why you take it.");
      const aiMeta = v.use === "ai" ? { aiRunId: v.runId, far: v.far } : {};
      if (direct) {
        const locked = !!row && LOCKED.has(row.status);
        const changes = { final_value: v.value, source: sourceOfUse(v.use), proposal: null, status: "draft" };
        if (v.ratings) changes.factors = J(v.ratings);
        if (locked) Object.assign(changes, { status: "locked", locked_value: v.value, locked_at: now(), locked_by: u.id, approved_by: null, approved_at: null, scope_fingerprint: J(scopeOf(t)) });
        const next = saveRow(t.id, m, row, changes, u.id, s);
        if (m === "hours") writeEffort(t.id, v.value, v.use === "math" ? mathMarks(next) : v.use === "ai" ? (v.marks || aiMarks(v.value)) : "manual"); else touch(t.id);
        auditRow(t.id, m, locked ? "locked_changed" : "changed", u, row, next, reason, Object.assign({ via: "scoring", use: v.use || "value", approvalCleared: locked && !!row.approved_by, proposalSuperseded: !!(row && row.proposal) }, aiMeta));
      } else {
        const proposal = { value: v.value, ratings: v.ratings || null, use: v.use || null, by: u.id, at: now(), reason };
        if (v.use === "ai") proposal.aiRunId = v.runId;
        const changes = { proposal: J(proposal) }; if (!row || !LOCKED.has(row.status)) changes.status = "proposed";
        const next = saveRow(t.id, m, row, changes, u.id, s); touch(t.id);
        auditRow(t.id, m, "proposed", u, row, next, reason, Object.assign({ value: v.value, use: v.use || "value" }, aiMeta));
      }
    });
    afterTaskWrite(t.id, u, { via: "scoring" });
    return answer(u, t.id, { applied: direct });
  });

  route("POST", "/api/tasks/:id/scoring/:module/approve", (u, p, q, b, ctx) => {
    on();
    const t = taskOr404(p.id), m = moduleParam(p.module); b = isObj(b) ? b : {};
    mayApprove(u, t, settings().overrides);
    const s = writable(m);
    const rev = revOf(b, false), reason = reasonOf(b);
    let self = false;
    tx(db, () => {
      const rows = readRows(t.id);
      if (m === "hours") rows.hours = syncHours(t, rows.hours, s, null, { via: "sync" });
      const row = rows[m];
      if (rev !== null && (row ? row.rev : 0) !== rev) throw new HttpError(409, STALE);
      if (row && row.status === "approved") throw new HttpError(409, "This estimate is already approved and locked. Re-baseline it to change it.");
      if (row && row.status === "rebaseline_needed") throw new HttpError(409, "The task's scope changed after this estimate was locked: re-baseline it instead.");
      let value = row ? row.final_value : null, source = row ? row.source : null, factors, marks = null;
      if (b.useProposal) {
        const pr = row && parse(row.proposal, null); if (!pr) throw new HttpError(400, "There is no proposed change to accept.");
        value = pr.value; source = sourceOfUse(pr.use); factors = pr.ratings; marks = marksOfUse(pr.use, row, pr.value);
      }
      if (!(value > 0)) throw new HttpError(400, "There is no estimate to approve yet: calculate or enter one first.");
      /* a baseline frozen when work started keeps when it was frozen: approved later, it was not approved before work */
      const kept = row.status === "locked" && row.locked_value === value, at = now();
      const changes = { final_value: value, source, status: "approved", approved_by: u.id, approved_at: at, locked_value: value, locked_at: kept ? row.locked_at : at, locked_by: kept ? row.locked_by : u.id, scope_fingerprint: kept && row.scope_fingerprint ? row.scope_fingerprint : J(scopeOf(t)), proposal: null };
      if (factors) changes.factors = J(factors);
      const next = saveRow(t.id, m, row, changes, u.id, s);
      if (m === "hours") writeEffort(t.id, value, marks); else touch(t.id);
      self = isAssignee(u, t);
      auditRow(t.id, m, "approved", u, row, next, reason, { selfApproved: self, acceptedProposal: !!b.useProposal, declinedProposal: !b.useProposal && !!row.proposal, frozenAt: kept ? row.locked_at : null, workStarted: workStartedNow(t) });
    });
    security.log("scoring_estimate_approved", { userId: u.id, ip: ctx && ctx.ip, taskId: t.id, module: m, selfApproved: self || undefined });
    afterTaskWrite(t.id, u, { via: "scoring" });
    return answer(u, t.id);
  });

  route("POST", "/api/tasks/:id/scoring/:module/rebaseline", (u, p, q, b, ctx) => {
    on();
    const t = taskOr404(p.id), m = moduleParam(p.module); b = isObj(b) ? b : {};
    mayApprove(u, t, settings().overrides);
    const s = writable(m);
    const reason = reasonOf(b); if (!reason) throw new HttpError(400, "Say why the estimate is re-baselined: a reason is required.");
    const rev = revOf(b, false);
    tx(db, () => {
      const rows = readRows(t.id);
      if (m === "hours") rows.hours = syncHours(t, rows.hours, s, null, { via: "sync" });
      const row = rows[m];
      if (!row || !LOCKED.has(row.status)) throw new HttpError(409, "Only a locked estimate is re-baselined; approve this one instead.");
      if (rev !== null && row.rev !== rev) throw new HttpError(409, STALE);
      let value = row.final_value, source = row.source, factors = null, marks = null;
      if (b.useProposal) {
        const pr = parse(row.proposal, null); if (!pr) throw new HttpError(400, "There is no proposed change to accept.");
        value = pr.value; source = sourceOfUse(pr.use); factors = pr.ratings; marks = marksOfUse(pr.use, row, pr.value);
      } else if (b.value !== undefined || b.ratings !== undefined || b.use !== undefined) {
        const v = valueFrom(m, b, row, s, t); value = v.value; source = sourceOfUse(v.use); factors = v.ratings; marks = marksOfUse(v.use, row, v.value);
      }
      if (!(value > 0)) throw new HttpError(400, "Say the new baseline (value).");
      const at = now();
      const changes = { final_value: value, source, status: "approved", approved_by: u.id, approved_at: at, locked_value: value, locked_at: at, locked_by: u.id, scope_fingerprint: J(scopeOf(t)), proposal: null };
      if (factors) changes.factors = J(factors);
      const next = saveRow(t.id, m, row, changes, u.id, s);
      if (m === "hours") writeEffort(t.id, value, marks); else touch(t.id);
      auditRow(t.id, m, "rebaselined", u, row, next, reason, { acceptedProposal: !!b.useProposal, workStarted: workStartedNow(t), previousLock: { value: row.locked_value, at: row.locked_at, by: row.locked_by, approvedBy: row.approved_by, status: row.status } });
    });
    security.log("scoring_estimate_rebaselined", { userId: u.id, ip: ctx && ctx.ip, taskId: t.id, module: m });
    afterTaskWrite(t.id, u, { via: "scoring" });
    return answer(u, t.id);
  });

  /* once, at start; the sweep a moment after start (never while this loads) and every ten minutes */
  try { backfill(); } catch (e) { console.error("[scoring] backfill failed — it runs again at the next start: " + (e && e.message)); }
  setTimeout(sweepSafe, 3000).unref();
  setInterval(sweepSafe, 10 * 60000).unref();

  return {
    settings,
    audit,
    featureOn,
    /* the master switch, and a module inside it; both false while the server has the feature turned off */
    isOn,
    moduleOn,
    LEAD_CAPS,
    /* the task write path (server.js) */
    timeLogMode, guardTaskWrite, guardNewTask, guardRestore, removeTaskRows, afterTaskWrite,
    /* for the other scoring modules: fn(taskId, user, info) after every task write; fn(user, task, out) to add to a
       task's scoring answer; a collection for GET /api/live/:kind */
    onTaskWritten: fn => { if (typeof fn === "function") hooks.push(fn); },
    extendView: fn => { if (typeof fn === "function") extenders.push(fn); },
    liveCollection: (kind, fn) => { if (typeof fn === "function") live[kind] = fn; },
    liveRead: (kind, u) => (Object.prototype.hasOwnProperty.call(live, kind) ? live[kind](u) : null),
    sweep, sweepInBatches, backfill, scopeFromAssets,
    /* a task's kind of work with the workspace's kinds: the one chosen on it (its mix's primary kind), else its title's;
       and its mix of several kinds ([{kind, units}] or null) */
    kindOf: title => kindOf(title, settings().kinds), kindOfTask: t => engine.kindOfTask(t, settings()), kindMix: t => engine.kindMix(t, settings()),
    /* for server/scoring-ai.js: the checks and answers of the task scoring routes, the task as the scores read it, the
       suggestion write, and the check {use:"ai"} asks of it */
    ai: {
      guard: fn => { aiGuard = typeof fn === "function" ? fn : null; },
      contextRoute: fn => { contextPut = typeof fn === "function" ? fn : null; },
      requireFeature: on, taskOr404, moduleParam, writable, liteTask, readRows, openDeps, answer, setSuggestion: setAiSuggestion,
      completed: statusId => completedStage(statusId, settings()), isAssignee, LOCKED, NAME
    }
  };
};
module.exports.calculate = calculate;
module.exports.kindOf = kindOf;
module.exports.scopeFromAssets = scopeFromAssets;
module.exports.MODULES = MODULES;
module.exports.UNIT = UNIT;
