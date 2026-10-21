/* KPIs AND OKRs — WHAT THE WORK ADDS UP TO (Oct 2026). docs/SMART-SCORING.md §11, Smart Scoring Phase 4.

   One small model for both: a metric is a KPI indicator (kind 'kpi') or a Key Result (kind 'kr', always under an
   Objective). A metric has a baseline, a target, a direction (up: more is better; down: less is better), a weight (how
   much a key result counts towards its objective), a period, an owner and an evidence rule saying where its progress
   comes from:
   - approved_assets: the assets a team's lead validated on a task (meta.assetSplitOk.total), counted once the task is
     finished successfully. Counted once per task — the unique key (metric, evidence type, task) of task_outcome_links
     prevents a second count; a validation changed later changes what the task adds to the new validated total; a
     validation withdrawn, or the task reopened, takes it back (revoked, kept in the history).
   - tasks_completed: 1 for each task finished successfully — a closed stage other than Declined, or the stages listed
     in the bonus policy's completionStages when the workspace has chosen them (one meaning of "completed"); reopened, 0.
   - manual: no counting at all; the latest value entered by someone allowed to manage outcomes, with a reason, is the
     metric's current reading (7.9 on a satisfaction score that runs from 7.2 to 8.5). Values are entered only on such a
     metric: the progress of a counted metric comes from its evidence, never typed over it.
   Which tasks a rule counts: every task that matches its filter (team, project, label — each one given must match; no
   filter is every task in the workspace) when its scope is "matching" (the default), and in either scope a task linked
   to it by hand once the link is confirmed. Scope "linked" counts linked tasks only. A task counts in the period the
   metric covers by the day it was finished (the server's local day; no period is any day).
   Actual = baseline + what was counted for a metric that goes up, baseline − what was counted for one that goes down
   (each piece of evidence moves it towards its target: a backlog burnt down by completions), the manual value for a
   manual one. Progress = ScoringEngine.progress; a metric with nothing to measure against (no target, a target equal to
   its baseline, a target on the wrong side) or no value has no progress, with the reason, never a made-up percentage.
   An objective's progress is ScoringEngine.rollup of its key results by weight; a key result that weighs 0 is left out,
   and so are drafts and archived ones. Points never become progress, and the AI never writes any (it may only ever
   suggest links).

   Who: everyone signed in except stakeholders reads it all (GET /api/outcomes, …/metrics/:id, /api/tasks/:id/outcomes).
   Objectives, metrics and manual values are written by whoever holds scoring_manage_outcomes (Admin unless given). Anyone
   who can edit a task may link it to a KPI or key result; the link counts once an outcomes manager confirms it (a
   manager's own link is confirmed at once), so nobody raises a number by linking their own work. A confirmed link is
   removed by a manager only. KPI writes need the KPI switch on, objective and key result writes the OKR switch (409
   with a clear message otherwise); what is there stays readable either way, and nothing is counted or taken back while a
   switch is off — when it comes back on, everything it covers is counted again from the tasks as they are then. Every
   write carries the version it was made on (rev): an older one answers 409. Every change is in scoring_audit (module
   'outcomes'), the evidence counted and taken back included.

   When: after every task write (deps.scoring.onTaskWritten, once server/scoring.js has it), right after a metric is
   created or changed, and in a sweep every 10 minutes and at start-up over the tasks changed since the last one — run
   also before answering a read, so what is shown is never behind. Each is idempotent. The sweep tells the server's caches
   (bumpData) when it changed something. Link rows and evidence rows share task_outcome_links: a link row has
   evidence_type 'link' and evidence_id the task's id (status 'linked' = waiting for a manager, 'counted' = confirmed,
   counted_at = when); an evidence row has the rule's type, the task's id, what it added (contribution) and status
   'counted' or 'revoked'. Each time a metric's counted total changes, its actual is kept in outcome_values (source
   'evidence') as its history. */
const engine = require("../shared/scoring-engine");

const TYPES = ["approved_assets", "tasks_completed", "manual"];
const EVIDENCE = ["approved_assets", "tasks_completed"];
const STATUSES = ["draft", "active", "closed", "archived"];
const ROLLED = ["active", "closed"];   /* the key results an objective's progress is made of */
/* the sentences this module adds to the engine's; the page shows them in either language with fill(tr(key), vars) */
const SENTENCES = {
  nothing: "Nothing has been counted yet.",
  countedOne: "{total} counted from the evidence of 1 task.",
  counted: "{total} counted from the evidence of {n} tasks.",
  up: "Actual = the baseline {baseline} + {total} counted = {actual}.",
  down: "Actual = the baseline {baseline} − {total} counted = {actual}.",
  manual: "Actual = the value entered by hand: {actual}.",
  noValue: "No progress yet: no value has been entered.",
  noKrs: "No progress yet: this objective has no key results.",
  zeroOne: "1 key result weighs 0 and is not counted.",
  zero: "{n} key results weigh 0 and are not counted."
};
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const J = (v, d) => { if (v == null || v === "") return d; try { const x = JSON.parse(v); return x == null ? d : x; } catch (e) { return d; } };
function num(v) { if (typeof v === "number") return Number.isFinite(v) ? v : null; if (typeof v === "string" && /^\s*[-+]?(\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?\s*$/i.test(v)) return Number(v); return null; }
const clean = x => Number(Number(x).toPrecision(12));
const pad = n => String(n).padStart(2, "0");
/* the day something happened, in the server's own time zone (a team's "this month" is theirs, not UTC's) */
function localDay(iso) { if (!iso) return null; const d = new Date(iso); if (isNaN(d.getTime())) return null; return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function inPeriod(day, p) { if (!p || (!p.start && !p.end)) return true; if (!day) return false; return (!p.start || day >= p.start) && (!p.end || day <= p.end); }
/* finished successfully: a closed stage other than Declined, or one of the stages the workspace chose */
function successful(t, stages) { if (!t) return false; if (Array.isArray(stages) && stages.length) return stages.indexOf(t.status) >= 0; return t.kind === "closed" && t.status !== "declined"; }
function filterMatches(t, f) {
  if (!isObj(f)) return true;
  if (f.team && t.team !== f.team) return false;
  if (f.project && t.project !== f.project && (t.alsoIn || []).indexOf(f.project) < 0) return false;
  if (f.label && (t.labels || []).indexOf(f.label) < 0) return false;
  return true;
}
function ruleOf(raw) {
  const r = isObj(raw) ? raw : J(raw, {}), f = isObj(r.filter) ? r.filter : {};
  const id = v => (typeof v === "string" && /^[-\w.]{1,80}$/.test(v) ? v : null);
  return { type: TYPES.indexOf(r.type) >= 0 ? r.type : "manual", scope: r.scope === "linked" ? "linked" : "matching", filter: { team: id(f.team), project: id(f.project), label: id(f.label) } };
}
/* What one task adds to one metric now: {value, day} — or value null and why not. o.linked: the task has a confirmed
   link to the metric; o.completionStages: the workspace's list, if any. */
function wanted(m, t, o) {
  o = o || {};
  if (!t) return { value: null, why: "no_task" };
  const rule = m.rule || ruleOf(null), type = rule.type;
  if (type === "manual") return { value: null, why: "manual_rule" };
  if (!o.linked && (rule.scope === "linked" || !filterMatches(t, rule.filter))) return { value: null, why: rule.scope === "linked" ? "not_linked" : "outside_filter" };
  if (!successful(t, o.completionStages)) return { value: null, why: "not_completed" };
  let value = 1;
  const ok = isObj(t.meta) && isObj(t.meta.assetSplitOk) ? t.meta.assetSplitOk : null;
  if (type === "approved_assets") {
    if (!ok) return { value: null, why: "not_validated" };
    value = Math.max(0, Math.round(num(ok.total) || 0));
    if (!value) return { value: null, why: "no_assets" };
  }
  const day = localDay(t.completedAt || (ok && ok.at) || t.updatedAt);
  if (!inPeriod(day, m.period)) return { value: null, why: "outside_period", day };
  return { value, day, why: null };
}
function steps2(steps) { return { steps, explanation: steps.map(s => engine.fill(s.key, s.vars)) }; }
/* a metric's actual and progress from what was counted ({count, total}) and its latest manual value ({value} or null) */
function metricProgress(m, ev, manual) {
  ev = ev || { count: 0, total: 0 };
  const rule = m.rule || ruleOf(null), steps = [];
  let actual = null, source;
  if (rule.type === "manual") {
    source = "manual";
    if (!manual || num(manual.value) === null) return { actual: null, source, progress: Object.assign({ value: null, raw: null, reason: "no_value" }, steps2([{ key: SENTENCES.noValue, vars: {} }])) };
    actual = num(manual.value); steps.push({ key: SENTENCES.manual, vars: { actual } });
  } else {
    source = "evidence";
    const base = num(m.baseline), total = clean(num(ev.total) || 0), n = ev.count || 0;
    steps.push(n ? { key: n === 1 ? SENTENCES.countedOne : SENTENCES.counted, vars: { total, n } } : { key: SENTENCES.nothing, vars: {} });
    if (base !== null) {
      actual = clean(m.direction === "down" ? base - total : base + total);
      if (n) steps.push({ key: m.direction === "down" ? SENTENCES.down : SENTENCES.up, vars: { baseline: base, total, actual } });
    } else actual = null;
  }
  /* no baseline: the engine names it as what is missing (the actual follows from it) */
  const p = engine.progress({ baseline: m.baseline, target: m.target, actual: actual === null && rule.type !== "manual" ? 0 : actual, direction: m.direction });
  const all = steps.concat(p.steps);
  return { actual, source, progress: Object.assign({ value: p.value, raw: p.raw, reason: p.reason }, steps2(all)) };
}
/* an objective's progress from its key results ({progress:{value}, weight, status}) */
function objectiveProgress(krs) {
  const list = (Array.isArray(krs) ? krs : []).filter(k => k && ROLLED.indexOf(k.status || "active") >= 0);
  if (!list.length) return Object.assign({ value: null, reason: "no_key_results", counted: 0, ignored: 0, totalWeight: 0 }, steps2([{ key: SENTENCES.noKrs, vars: {} }]));
  const weight = k => { const w = num(k.weight); return w === null ? 1 : Math.max(0, w); };
  const pos = list.filter(k => weight(k) > 0), zero = list.length - pos.length, pre = [];
  const use = pos.length ? pos : list;
  if (pos.length && zero) pre.push(zero === 1 ? { key: SENTENCES.zeroOne, vars: {} } : { key: SENTENCES.zero, vars: { n: zero } });
  const r = engine.rollup(use.map(k => ({ progress: isObj(k.progress) ? k.progress.value : k.progress, weight: weight(k) })));
  return Object.assign({ value: r.value, reason: r.reason, counted: r.counted, ignored: r.ignored, totalWeight: r.totalWeight }, steps2(pre.concat(r.steps)));
}

module.exports = function outcomes(db, WS_ID, d) {
  const { route, HttpError, forbid, can, uid, now, tx, act, scoring, readTask, bumpData } = d;
  const META_KEY = "outcomes_sweep_v1";
  const SWEEP_MS = 10 * 60000;
  const SWEEP_BATCH = 50;   /* changed tasks a step of the timers' sweep counts before the server may answer again */
  db.exec("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)");

  /* ---------- small helpers ---------- */
  const run = fn => (db.isTransaction ? fn() : tx(db, fn));   /* one transaction, also when called inside one */
  function on() { if (!scoring.featureOn()) throw new HttpError(409, "Smart Scoring is turned off on this server"); }
  const reader = u => forbid(u && !u.stakeholder, "see KPIs and OKRs");
  const kinds = () => ({ kpi: scoring.moduleOn("kpi"), kr: scoring.moduleOn("okr") });
  /* a write to a KPI needs the KPI switch, to an objective or key result the OKR switch */
  function writable(kind) {
    if (!scoring.isOn()) throw new HttpError(409, "Smart Scoring is switched off for this workspace. Turn it on in Settings → Smart Scoring first.");
    if (kind === "kpi" && !scoring.moduleOn("kpi")) throw new HttpError(409, "KPIs are switched off. Turn KPI on in Settings → Smart Scoring to change them; what is there stays readable.");
    if (kind !== "kpi" && !scoring.moduleOn("okr")) throw new HttpError(409, "OKRs are switched off. Turn OKR on in Settings → Smart Scoring to change them; what is there stays readable.");
  }
  const noun = kind => (kind === "kpi" ? "KPI" : kind === "kr" ? "key result" : "objective");
  const stages = () => { const s = scoring.settings(); return s && s.bonus ? s.bonus.completionStages : null; };
  function audit(u, e) { return scoring.audit(Object.assign({ module: "outcomes", actor: u ? u.id : null, impersonatedBy: u ? u.impersonatedBy : null }, e)); }

  /* ---------- reading ---------- */
  const metricRec = r => ({ id: r.id, kind: r.kind, objective: r.objective_id || null, title: r.title, description: r.description || "", unit: r.unit || "", direction: r.direction === "down" ? "down" : "up",
    baseline: r.baseline, target: r.target, weight: r.weight, period: { start: r.period_start || null, end: r.period_end || null }, rule: ruleOf(r.evidence_rule), owner: r.owner_id || null,
    status: r.status, sortOrder: r.sort_order || 0, rev: r.rev, createdBy: r.created_by || null, createdAt: r.created_at, updatedBy: r.updated_by || null, updatedAt: r.updated_at || null });
  const objectiveRec = r => ({ id: r.id, title: r.title, description: r.description || "", period: { start: r.period_start || null, end: r.period_end || null }, owner: r.owner_id || null, status: r.status,
    sortOrder: r.sort_order || 0, rev: r.rev, createdBy: r.created_by || null, createdAt: r.created_at, updatedBy: r.updated_by || null, updatedAt: r.updated_at || null });
  const metricRow = id => db.prepare("SELECT * FROM outcome_metrics WHERE id=? AND workspace_id=?").get(String(id || ""), WS_ID);
  const objectiveRow = id => db.prepare("SELECT * FROM outcome_objectives WHERE id=? AND workspace_id=?").get(String(id || ""), WS_ID);
  /* the metrics that count evidence right now: active, their switch on, a counting rule */
  function counting(k) { return db.prepare("SELECT * FROM outcome_metrics WHERE workspace_id=? AND status='active'").all(WS_ID).map(metricRec).filter(m => k[m.kind] && EVIDENCE.indexOf(m.rule.type) >= 0); }
  const taskOf = r => ({ id: r.id, status: r.status_id, kind: r.stage_kind, team: r.team_id, project: r.project_id, alsoIn: J(r.extra_projects, []), labels: J(r.labels, []), meta: J(r.meta, {}), completedAt: r.completed_at, updatedAt: r.updated_at, title: r.title });
  const tasks = (where, params) => db.prepare("SELECT t.id, t.title, t.status_id, s.kind AS stage_kind, t.team_id, t.project_id, t.extra_projects, t.labels, t.meta, t.completed_at, t.updated_at FROM tasks t LEFT JOIN task_statuses s ON s.id=t.status_id WHERE t.workspace_id=? AND (" + where + ")").all(WS_ID, ...(params || [])).map(taskOf);
  /* what was counted for each metric, how many links wait for a manager, and each metric's latest manual value */
  function tallies() {
    const ev = {}, links = {}, manual = {};
    db.prepare("SELECT l.metric_id, l.evidence_type, count(*) n, sum(l.contribution) s FROM task_outcome_links l JOIN outcome_metrics m ON m.id=l.metric_id WHERE l.workspace_id=? AND l.status='counted' AND l.evidence_type<>'link' GROUP BY l.metric_id, l.evidence_type").all(WS_ID)
      .forEach(r => { (ev[r.metric_id] = ev[r.metric_id] || {})[r.evidence_type] = { count: r.n, total: r.s || 0 }; });
    db.prepare("SELECT metric_id, status, count(*) n FROM task_outcome_links WHERE workspace_id=? AND evidence_type='link' GROUP BY metric_id, status").all(WS_ID)
      .forEach(r => { const x = links[r.metric_id] = links[r.metric_id] || { confirmed: 0, waiting: 0 }; if (r.status === "counted") x.confirmed += r.n; else if (r.status === "linked") x.waiting += r.n; });
    db.prepare("SELECT * FROM outcome_values WHERE workspace_id=? AND source='manual' ORDER BY created_at, rowid").all(WS_ID)
      .forEach(r => { manual[r.metric_id] = { value: r.value, reason: r.reason || "", by: r.actor_id || null, at: r.created_at }; });
    return { ev, links, manual };
  }
  function metricOut(m, T) {
    const ev = (T.ev[m.id] || {})[m.rule.type] || { count: 0, total: 0 }, man = m.rule.type === "manual" ? T.manual[m.id] || null : null;
    const p = metricProgress(m, ev, man);
    return Object.assign({}, m, { evidence: { count: ev.count, total: clean(ev.total || 0) }, links: T.links[m.id] || { confirmed: 0, waiting: 0 }, manual: man, actual: p.actual, source: p.source, progress: p.progress });
  }
  function objectiveOut(o, mets) {
    const krs = mets.filter(m => m.kind === "kr" && m.objective === o.id);
    return Object.assign({}, o, { keyResults: krs.map(m => m.id), progress: objectiveProgress(krs) });
  }
  function allMetrics() { const T = tallies(); return db.prepare("SELECT * FROM outcome_metrics WHERE workspace_id=? ORDER BY sort_order, created_at, rowid").all(WS_ID).map(r => metricOut(metricRec(r), T)); }
  function state(u) {
    const metrics = allMetrics();
    const objectives = db.prepare("SELECT * FROM outcome_objectives WHERE workspace_id=? ORDER BY sort_order, created_at, rowid").all(WS_ID).map(r => objectiveOut(objectiveRec(r), metrics));
    const k = kinds();
    return { on: { enabled: scoring.isOn(), kpi: k.kpi, okr: k.kr }, objectives, metrics, can: { manage: !!(u && can.scoringManageOutcomes(u)) } };
  }

  /* ---------- counting ---------- */
  /* One task's evidence for one metric brought in line with what it should add (want: {value, why}). Each change is
     audited on the task — unless `tally` is given (a metric counted again from scratch): then it is counted there and
     the caller writes one audit row for the whole recount. */
  function settle(m, t, row, want, actor, tally) {
    const at = now(), base = { taskId: t.id, meta: { metricId: m.id, kind: m.kind, type: m.rule.type } };
    const note = (action, from, to, why) => { if (tally) tally[action] = (tally[action] || 0) + 1; else audit(actor, Object.assign({}, base, { action, oldValue: from, newValue: to }, why ? { meta: Object.assign({}, base.meta, { why }) } : {})); return 1; };
    if (want && want.value != null) {
      const v = want.value;
      if (!row) {
        db.prepare("INSERT INTO task_outcome_links (id,workspace_id,task_id,metric_id,linked_by,origin,evidence_type,evidence_id,contribution,status,counted_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
          .run(uid("ol"), WS_ID, t.id, m.id, null, "manual", m.rule.type, t.id, v, "counted", at, at);
        return note("evidence_counted", null, v);
      }
      if (row.status !== "counted" || row.contribution !== v) {
        db.prepare("UPDATE task_outcome_links SET status='counted', contribution=?, counted_at=?, revoked_at=NULL WHERE id=?").run(v, at, row.id);
        return row.status === "counted" ? note("evidence_updated", row.contribution, v) : note("evidence_counted", null, v);
      }
      return 0;
    }
    if (row && row.status === "counted") {
      db.prepare("UPDATE task_outcome_links SET status='revoked', revoked_at=? WHERE id=?").run(at, row.id);
      return note("evidence_revoked", row.contribution, null, (want && want.why) || "not_counted");
    }
    return 0;
  }
  const confirmedLinks = taskId => new Set(db.prepare("SELECT metric_id FROM task_outcome_links WHERE task_id=? AND evidence_type='link' AND status='counted'").all(taskId).map(r => r.metric_id));
  /* one task against the given metrics */
  function taskInner(t, metrics, actor, touched) {
    const linked = confirmedLinks(t.id), st = stages();
    const rows = new Map(db.prepare("SELECT * FROM task_outcome_links WHERE task_id=? AND evidence_type<>'link'").all(t.id).map(r => [r.metric_id + "|" + r.evidence_type, r]));
    let n = 0;
    metrics.forEach(m => { if (settle(m, t, rows.get(m.id + "|" + m.rule.type), wanted(m, t, { linked: linked.has(m.id), completionStages: st }), actor)) { n++; touched.add(m.id); } });
    return n;
  }
  /* One metric against every task it may count; counted evidence of another type (its rule changed) is taken back.
     One audit row says what the recount did (how many counted, changed and taken back). */
  function metricInner(m, actor, touched) {
    const k = kinds();
    if (m.status !== "active" || !k[m.kind]) return 0;   /* frozen: nothing counted or taken back */
    const tally = {};
    const other = db.prepare("UPDATE task_outcome_links SET status='revoked', revoked_at=? WHERE metric_id=? AND evidence_type<>'link' AND evidence_type<>? AND status='counted'").run(now(), m.id, m.rule.type).changes;
    if (other) tally.evidence_revoked = other;
    if (EVIDENCE.indexOf(m.rule.type) >= 0) {
      const linked = new Set(db.prepare("SELECT task_id FROM task_outcome_links WHERE metric_id=? AND evidence_type='link' AND status='counted'").all(m.id).map(r => r.task_id)), st = stages();
      const rows = new Map(db.prepare("SELECT * FROM task_outcome_links WHERE metric_id=? AND evidence_type=?").all(m.id, m.rule.type).map(r => [r.task_id, r]));
      const list = m.rule.scope === "linked" ? tasks("t.id IN (SELECT task_id FROM task_outcome_links WHERE metric_id=? AND evidence_type='link' AND status='counted')", [m.id]) : tasks("1=1");
      const seen = new Set();
      list.forEach(t => { seen.add(t.id); settle(m, t, rows.get(t.id), wanted(m, t, { linked: linked.has(t.id), completionStages: st }), actor, tally); });
      rows.forEach((row, taskId) => { if (!seen.has(taskId) && row.status === "counted") settle(m, { id: taskId }, row, { value: null, why: "not_linked" }, actor, tally); });
    }
    const n = (tally.evidence_counted || 0) + (tally.evidence_updated || 0) + (tally.evidence_revoked || 0);
    if (n) { touched.add(m.id); audit(actor, { action: "evidence_recounted", newValue: { counted: tally.evidence_counted || 0, changed: tally.evidence_updated || 0, revoked: tally.evidence_revoked || 0 }, meta: { metricId: m.id, kind: m.kind, type: m.rule.type } }); }
    return n;
  }
  /* each metric whose counted total changed keeps its new actual in its history. snappedAt: when (a count, not a time)
     each metric last got one, so a sweep that runs in steps adds one only for what changed after it (sweepInSteps) */
  let snapSeq = 0; const snappedAt = new Map();
  function snapshot(touched, actor) {
    if (!touched.size) return;
    const T = tallies();
    touched.forEach(id => { snappedAt.set(id, ++snapSeq); const r = metricRow(id); if (!r) return; const m = metricOut(metricRec(r), T); if (m.source !== "evidence" || m.actual === null) return;
      db.prepare("INSERT INTO outcome_values (id,workspace_id,metric_id,value,source,reason,actor_id,created_at) VALUES (?,?,?,?,?,?,?,?)").run(uid("ov"), WS_ID, id, m.actual, "evidence", null, actor ? actor.id : null, now()); });
  }
  /* after a task is written (registered with server/scoring.js's onTaskWritten): that task, against every counting metric */
  function evaluateTask(taskId, user) {
    if (!scoring.isOn()) return 0;
    const k = kinds(); if (!k.kpi && !k.kr) return 0;
    const ms = counting(k); if (!ms.length) return 0;
    const t = tasks("t.id=?", [String(taskId || "")])[0]; if (!t) return 0;
    const touched = new Set(); let n = 0;
    run(() => { n = taskInner(t, ms, user || null, touched); snapshot(touched, user || null); });
    if (n && bumpData) bumpData();
    return n;
  }
  /* a metric counted again from scratch against every task (after it is created or changed) */
  function evaluateMetric(metricId, user) {
    const r = metricRow(metricId); if (!r || !scoring.isOn()) return 0;
    const touched = new Set(); let n = 0;
    run(() => { n = metricInner(metricRec(r), user || null, touched); snapshot(touched, user || null); });
    return n;
  }
  /* The sweep: the tasks changed since the last one, against the metrics of each switch that stayed on; a switch that
     has come on since counts its metrics again from scratch. Remembers when it ran and what was on (app_meta). */
  function cursor() { try { const r = db.prepare("SELECT value FROM app_meta WHERE key=?").get(META_KEY); return r ? J(r.value, {}) : {}; } catch (e) { return {}; } }
  const writeCursor = (started, k) => db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(META_KEY, JSON.stringify({ at: started, kpi: !!k.kpi, kr: !!k.kr }));
  let sweeps = 0;   /* how many sweeps have run whole (sweepInSteps leaves the cursor to one that ran meanwhile) */
  function sweep(user) {
    if (!scoring.featureOn()) return 0;
    sweeps++;
    const k = kinds(), c = cursor(), started = now(), touched = new Set(); let n = 0;
    run(() => {
      const fresh = ["kpi", "kr"].filter(x => k[x] && !(c.at && c[x])), kept = ["kpi", "kr"].filter(x => k[x] && c.at && c[x]);
      if (fresh.length) counting(k).filter(m => fresh.indexOf(m.kind) >= 0).forEach(m => { n += metricInner(m, user || null, touched); });
      if (kept.length) { const ms = counting(k).filter(m => kept.indexOf(m.kind) >= 0); if (ms.length) tasks("t.updated_at >= ?", [c.at]).forEach(t => { n += taskInner(t, ms, user || null, touched); }); }
      snapshot(touched, user || null);
      writeCursor(started, k);
    });
    if (n && bumpData) bumpData();
    return n;
  }
  /* The timers' sweep (Oct 2026, performance): the same work in steps — a metric counted again from scratch, or
     SWEEP_BATCH changed tasks — each its own transaction, with the server free to answer in between (setImmediate), so
     a sweep over many tasks never holds a request for half a second. Each step reads the metrics again (one edited or
     removed meanwhile is counted as it is now); every step is idempotent, as the sweep is. At the end, the history of
     each metric it changed — unless something else has recorded it since — and the cursor; the cursor stays as it was
     when a switch changed or a whole sweep (a read's catch-up) ran meanwhile, so the next sweep looks again. */
  let stepping = false;
  function sweepInSteps(done) {
    const finish = n => { stepping = false; if (n && bumpData) bumpData(); if (done) done(n); };
    if (stepping || !scoring.featureOn()) { if (done) done(0); return; }
    stepping = true;
    let n = 0, i = 0, plan = null;
    const touchedSeq = new Map(), mark = touched => touched.forEach(id => touchedSeq.set(id, snapSeq));
    const make = () => {
      const k = kinds(), c = cursor(), started = now(), jobs = [];
      const fresh = ["kpi", "kr"].filter(x => k[x] && !(c.at && c[x])), kept = ["kpi", "kr"].filter(x => k[x] && c.at && c[x]);
      if (fresh.length) counting(k).filter(m => fresh.indexOf(m.kind) >= 0).forEach(m0 => jobs.push(() => {
        const r = metricRow(m0.id); if (!r) return;
        const m = metricRec(r); if (fresh.indexOf(m.kind) < 0) return;
        const touched = new Set(); n += metricInner(m, null, touched); mark(touched);
      }));
      if (kept.length && counting(k).some(m => kept.indexOf(m.kind) >= 0)) {
        const list = tasks("t.updated_at >= ?", [c.at]);
        for (let at = 0; at < list.length; at += SWEEP_BATCH) {
          const part = list.slice(at, at + SWEEP_BATCH);
          jobs.push(() => {
            const ms = counting(kinds()).filter(m => kept.indexOf(m.kind) >= 0); if (!ms.length) return;
            const touched = new Set(); part.forEach(t => { n += taskInner(t, ms, null, touched); }); mark(touched);
          });
        }
      }
      return { k, started, sweeps, jobs };
    };
    const step = () => {
      try {
        if (!plan) plan = make();
        if (i < plan.jobs.length) { run(plan.jobs[i++]); return setImmediate(step); }
        const due = new Set(); touchedSeq.forEach((seq, id) => { if ((snappedAt.get(id) || 0) <= seq) due.add(id); });
        const k = kinds(), same = k.kpi === plan.k.kpi && k.kr === plan.k.kr && sweeps === plan.sweeps;
        run(() => { snapshot(due, null); if (same) writeCursor(plan.started, plan.k); });
        finish(n);
      } catch (e) { console.error("[outcomes] " + e.message); finish(n); }
    };
    step();
  }
  /* before a read: never behind, and a failure here never stops the read (what it counts is the server's doing, not the
     reader's: no actor) */
  function catchUp() { try { sweep(null); } catch (e) { console.error("[outcomes] " + e.message); } }
  if (scoring.onTaskWritten) scoring.onTaskWritten((taskId, user) => { try { evaluateTask(taskId, user); } catch (e) { console.error("[outcomes] " + e.message); } });
  setTimeout(() => sweepInSteps(), 3000).unref();
  setInterval(() => sweepInSteps(), SWEEP_MS).unref();

  /* ---------- what is sent in ---------- */
  const text = (v, max, what, need) => { const s = String(v == null ? "" : v).replace(/\r\n/g, "\n").trim(); if (need && !s) throw new HttpError(400, "A " + what + " is required"); if (s.length > max) throw new HttpError(400, "The " + what + " is too long (" + max.toLocaleString("en-US") + " characters at most)"); return s; };
  function number(v, what, lo, hi) {
    if (v === null || v === "") return null;
    const n = num(v); if (n === null) throw new HttpError(400, "The " + what + " must be a number");
    if (n < lo || n > hi) throw new HttpError(400, "The " + what + " must be between " + lo + " and " + hi);
    return clean(n);
  }
  function day(v, what) {
    if (v == null || v === "") return null;
    const s = String(v); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(new Date(s + "T00:00:00Z").getTime()) || new Date(s + "T00:00:00Z").toISOString().slice(0, 10) !== s) throw new HttpError(400, "The " + what + " must be a date (YYYY-MM-DD)");
    return s;
  }
  function period(b, cur) {
    const p = isObj(b.period) ? b.period : {};
    const start = p.start !== undefined ? day(p.start, "start of the period") : cur ? cur.start : null, end = p.end !== undefined ? day(p.end, "end of the period") : cur ? cur.end : null;
    if (start && end && end < start) throw new HttpError(400, "The period ends before it starts");
    return { start, end };
  }
  function owner(v, cur) {
    if (v === undefined) return cur || null; if (v === null || v === "") return null;
    if (!db.prepare("SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=?").get(WS_ID, String(v))) throw new HttpError(400, "The owner is not a member of this workspace");
    return String(v);
  }
  function direction(v, cur) { if (v === undefined) return cur || "up"; if (v !== "up" && v !== "down") throw new HttpError(400, "The direction is up (more is better) or down (less is better)"); return v; }
  function status(v, cur) { if (v === undefined) return cur || "active"; if (STATUSES.indexOf(v) < 0) throw new HttpError(400, "Unknown status " + String(v).slice(0, 40)); return v; }
  function rule(v, cur) {
    if (v === undefined) return cur || ruleOf({ type: "manual" });
    if (!isObj(v) || TYPES.indexOf(v.type) < 0) throw new HttpError(400, "Choose where the progress comes from: approved assets, completed tasks or a value entered by hand");
    const f = isObj(v.filter) ? v.filter : {}, out = { type: v.type, scope: v.scope === "linked" ? "linked" : "matching", filter: { team: null, project: null, label: null } };
    if (f.team) { if (!db.prepare("SELECT 1 FROM teams WHERE id=? AND workspace_id=?").get(String(f.team), WS_ID)) throw new HttpError(400, "That team does not exist"); out.filter.team = String(f.team); }
    if (f.project) { if (!db.prepare("SELECT 1 FROM projects WHERE id=? AND workspace_id=?").get(String(f.project), WS_ID)) throw new HttpError(400, "That project does not exist"); out.filter.project = String(f.project); }
    if (f.label) { if (!/^[-\w.]{1,80}$/.test(String(f.label))) throw new HttpError(400, "That label does not exist"); out.filter.label = String(f.label); }
    return out;
  }
  function rev(b, cur, kind) {
    if (!/^\d{1,9}$/.test(String(b && b.rev))) throw new HttpError(400, "Say which version you changed (rev)");
    if (+b.rev !== cur.rev) throw new HttpError(409, "Someone else changed this " + noun(kind) + " in the meantime. Reload it and make your change again.");
  }
  function objectiveFields(b, cur) {
    b = isObj(b) ? b : {};
    return { title: b.title !== undefined || !cur ? text(b.title, 200, "title", true) : cur.title, description: b.description !== undefined ? text(b.description, 2000, "description") : cur ? cur.description : "",
      period: period(b, cur && cur.period), owner: owner(b.owner, cur && cur.owner), status: status(b.status, cur && cur.status), sortOrder: b.sortOrder !== undefined ? Math.round(number(b.sortOrder, "order", -1e9, 1e9) || 0) : cur ? cur.sortOrder : 0 };
  }
  function metricFields(b, cur, kind) {
    b = isObj(b) ? b : {};
    const o = objectiveFields(b, cur);
    const x = Object.assign(o, {
      unit: b.unit !== undefined ? text(b.unit, 24, "unit") : cur ? cur.unit : "",
      direction: direction(b.direction, cur && cur.direction),
      baseline: b.baseline !== undefined ? number(b.baseline, "baseline", -1e12, 1e12) : cur ? cur.baseline : 0,
      target: b.target !== undefined ? number(b.target, "target", -1e12, 1e12) : cur ? cur.target : null,
      weight: b.weight !== undefined ? number(b.weight, "weight", 0, 1000) : cur ? cur.weight : 1,
      rule: rule(b.rule, cur && cur.rule), objective: null });
    if (x.weight === null) x.weight = 1;
    if (kind === "kr") {
      const oid = b.objective !== undefined ? b.objective : cur ? cur.objective : null;
      if (!oid) throw new HttpError(400, "A key result belongs to an objective: choose one");
      if (!objectiveRow(oid)) throw new HttpError(400, "That objective does not exist");
      x.objective = String(oid);
    }
    return x;
  }
  const stamp = (u, o) => Object.assign({}, o, { updatedBy: u.id });

  /* ---------- routes: reading ---------- */
  route("GET", "/api/outcomes", (u) => { on(); reader(u); catchUp(); return state(u); });
  route("GET", "/api/outcomes/metrics/:id", (u, p) => {
    on(); reader(u); catchUp();
    const r = metricRow(p.id); if (!r) throw new HttpError(404, "That KPI or key result does not exist");
    const m = metricOut(metricRec(r), tallies());
    const rows = db.prepare("SELECT l.*, t.title AS task_title FROM task_outcome_links l LEFT JOIN tasks t ON t.id=l.task_id WHERE l.metric_id=? ORDER BY coalesce(l.counted_at, l.created_at) DESC LIMIT 200").all(r.id);
    const evidence = rows.filter(x => x.evidence_type !== "link").map(x => ({ taskId: x.task_id, title: x.task_title || x.task_id, type: x.evidence_type, contribution: x.contribution, status: x.status, countedAt: x.counted_at || null, revokedAt: x.revoked_at || null }));
    const links = rows.filter(x => x.evidence_type === "link").map(x => ({ id: x.id, taskId: x.task_id, title: x.task_title || x.task_id, confirmed: x.status === "counted", by: x.linked_by || null, at: x.created_at, confirmedAt: x.counted_at || null }));
    const values = db.prepare("SELECT * FROM outcome_values WHERE metric_id=? ORDER BY created_at DESC, rowid DESC LIMIT 50").all(r.id).map(v => ({ value: v.value, source: v.source, reason: v.reason || "", by: v.actor_id || null, at: v.created_at }));
    const history = db.prepare("SELECT * FROM scoring_audit WHERE workspace_id=? AND module='outcomes' AND meta LIKE ? ESCAPE '\\' ORDER BY created_at DESC, rowid DESC LIMIT 50").all(WS_ID, '%"metricId":"' + r.id.replace(/[\\%_]/g, "\\$&") + '"%')
      .map(a => ({ id: a.id, action: a.action, taskId: a.task_id || null, by: a.actor_id || null, impersonatedBy: a.impersonated_by || null, at: a.created_at, reason: a.reason || "", from: J(a.old_value, null), to: J(a.new_value, null), why: (J(a.meta, {}) || {}).why || null }));
    return { metric: m, evidence, links, values, audit: history };
  });

  /* ---------- routes: objectives ---------- */
  route("POST", "/api/outcomes/objectives", (u, p, q, b) => {
    on(); forbid(can.scoringManageOutcomes(u), "set up OKRs"); writable("objective");
    const x = objectiveFields(b, null), id = uid("ob"), at = now();
    run(() => {
      db.prepare("INSERT INTO outcome_objectives (id,workspace_id,title,description,period_start,period_end,owner_id,status,sort_order,rev,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(id, WS_ID, x.title, x.description, x.period.start, x.period.end, x.owner, x.status, x.sortOrder, 1, u.id, at, u.id, at);
      audit(u, { action: "objective_created", newValue: x, meta: { objectiveId: id } });
      act(u, "edited", "workspace", WS_ID, { what: "objective “" + x.title + "”" });
    });
    return Object.assign(state(u), { id });
  });
  route("PUT", "/api/outcomes/objectives/:id", (u, p, q, b) => {
    on(); forbid(can.scoringManageOutcomes(u), "set up OKRs"); writable("objective");
    const r = objectiveRow(p.id); if (!r) throw new HttpError(404, "That objective does not exist");
    const cur = objectiveRec(r); rev(b, cur, "objective");
    const x = objectiveFields(b, cur);
    run(() => {
      db.prepare("UPDATE outcome_objectives SET title=?, description=?, period_start=?, period_end=?, owner_id=?, status=?, sort_order=?, rev=rev+1, updated_by=?, updated_at=? WHERE id=?")
        .run(x.title, x.description, x.period.start, x.period.end, x.owner, x.status, x.sortOrder, u.id, now(), r.id);
      audit(u, { action: "objective_updated", oldValue: cur, newValue: stamp(u, x), reason: b && b.reason ? String(b.reason) : null, meta: { objectiveId: r.id } });
    });
    return state(u);
  });
  /* deleting an objective that has key results takes them with it only when asked (?cascade=1) */
  route("DELETE", "/api/outcomes/objectives/:id", (u, p, q) => {
    on(); forbid(can.scoringManageOutcomes(u), "set up OKRs"); writable("objective");
    const r = objectiveRow(p.id); if (!r) throw new HttpError(404, "That objective does not exist");
    if (q.rev !== undefined) rev(q, objectiveRec(r), "objective");
    const krs = db.prepare("SELECT * FROM outcome_metrics WHERE objective_id=? AND workspace_id=?").all(r.id, WS_ID);
    if (krs.length && q.cascade !== "1") throw new HttpError(409, "This objective still has " + krs.length + (krs.length === 1 ? " key result" : " key results") + ". Delete them first, or delete the objective with them.");
    run(() => {
      krs.forEach(k => { const m = metricOut(metricRec(k), tallies()); audit(u, { action: "metric_deleted", oldValue: m, meta: { metricId: k.id, kind: "kr", objectiveId: r.id } }); db.prepare("DELETE FROM outcome_metrics WHERE id=?").run(k.id); });
      audit(u, { action: "objective_deleted", oldValue: objectiveRec(r), meta: { objectiveId: r.id, keyResults: krs.length } });
      db.prepare("DELETE FROM outcome_objectives WHERE id=?").run(r.id);
      act(u, "edited", "workspace", WS_ID, { what: "objective “" + r.title + "” deleted" });
    });
    return state(u);
  });

  /* ---------- routes: KPIs and key results ---------- */
  route("POST", "/api/outcomes/metrics", (u, p, q, b) => {
    on();
    const kind = b && b.kind === "kr" ? "kr" : b && b.kind === "kpi" ? "kpi" : null;
    if (!kind) throw new HttpError(400, "Say whether this is a KPI or a key result (kind)");
    forbid(can.scoringManageOutcomes(u), kind === "kpi" ? "set up KPIs" : "set up OKRs"); writable(kind);
    const x = metricFields(b, null, kind), id = uid("om"), at = now();
    run(() => {
      db.prepare("INSERT INTO outcome_metrics (id,workspace_id,kind,objective_id,title,description,unit,direction,baseline,target,weight,period_start,period_end,evidence_rule,owner_id,status,sort_order,rev,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(id, WS_ID, kind, x.objective, x.title, x.description, x.unit, x.direction, x.baseline, x.target, x.weight, x.period.start, x.period.end, JSON.stringify(x.rule), x.owner, x.status, x.sortOrder, 1, u.id, at, u.id, at);
      audit(u, { action: "metric_created", newValue: Object.assign({ kind }, x), meta: { metricId: id, kind } });
      act(u, "edited", "workspace", WS_ID, { what: noun(kind) + " “" + x.title + "”" });
      const touched = new Set(); metricInner(metricRec(metricRow(id)), u, touched); snapshot(touched, u);
    });
    return Object.assign(state(u), { id });
  });
  route("PUT", "/api/outcomes/metrics/:id", (u, p, q, b) => {
    on();
    const r = metricRow(p.id); if (!r) throw new HttpError(404, "That KPI or key result does not exist");
    const cur = metricRec(r);
    forbid(can.scoringManageOutcomes(u), cur.kind === "kpi" ? "set up KPIs" : "set up OKRs"); writable(cur.kind); rev(b, cur, cur.kind);
    const x = metricFields(b, cur, cur.kind);
    run(() => {
      db.prepare("UPDATE outcome_metrics SET objective_id=?, title=?, description=?, unit=?, direction=?, baseline=?, target=?, weight=?, period_start=?, period_end=?, evidence_rule=?, owner_id=?, status=?, sort_order=?, rev=rev+1, updated_by=?, updated_at=? WHERE id=?")
        .run(x.objective, x.title, x.description, x.unit, x.direction, x.baseline, x.target, x.weight, x.period.start, x.period.end, JSON.stringify(x.rule), x.owner, x.status, x.sortOrder, u.id, now(), r.id);
      audit(u, { action: "metric_updated", oldValue: cur, newValue: stamp(u, Object.assign({ kind: cur.kind }, x)), reason: b && b.reason ? String(b.reason) : null, meta: { metricId: r.id, kind: cur.kind } });
      const touched = new Set(); metricInner(metricRec(metricRow(r.id)), u, touched); snapshot(touched, u);
    });
    return state(u);
  });
  route("DELETE", "/api/outcomes/metrics/:id", (u, p, q) => {
    on();
    const r = metricRow(p.id); if (!r) throw new HttpError(404, "That KPI or key result does not exist");
    const cur = metricRec(r);
    forbid(can.scoringManageOutcomes(u), cur.kind === "kpi" ? "set up KPIs" : "set up OKRs"); writable(cur.kind);
    if (q.rev !== undefined) rev(q, cur, cur.kind);
    run(() => {
      audit(u, { action: "metric_deleted", oldValue: metricOut(cur, tallies()), meta: { metricId: r.id, kind: cur.kind } });
      db.prepare("DELETE FROM outcome_metrics WHERE id=?").run(r.id);   /* its links, evidence and values go with it; the audit keeps them */
      act(u, "edited", "workspace", WS_ID, { what: noun(cur.kind) + " “" + cur.title + "” deleted" });
    });
    return state(u);
  });
  /* a value entered by hand, with a reason: the current reading of a metric whose rule is manual */
  route("POST", "/api/outcomes/metrics/:id/value", (u, p, q, b) => {
    on();
    const r = metricRow(p.id); if (!r) throw new HttpError(404, "That KPI or key result does not exist");
    const m = metricRec(r);
    forbid(can.scoringManageOutcomes(u), "correct the progress of KPIs and OKRs"); writable(m.kind);
    if (m.rule.type !== "manual") throw new HttpError(409, "This " + noun(m.kind) + " counts its progress from evidence. A value is entered by hand only on one whose progress is entered by hand.");
    const value = number(b && b.value, "value", -1e12, 1e12); if (value === null) throw new HttpError(400, "Enter the value");
    const reason = text(b && b.reason, 1000, "reason", false); if (!reason) throw new HttpError(400, "Say why this value is entered (a reason is required)");
    const before = tallies().manual[m.id] || null;
    run(() => {
      db.prepare("INSERT INTO outcome_values (id,workspace_id,metric_id,value,source,reason,actor_id,created_at) VALUES (?,?,?,?,?,?,?,?)").run(uid("ov"), WS_ID, m.id, value, "manual", reason, u.id, now());
      audit(u, { action: "manual_value", oldValue: before ? before.value : null, newValue: value, reason, meta: { metricId: m.id, kind: m.kind } });
    });
    return state(u);
  });

  /* ---------- routes: a task's links ---------- */
  const linkRow = (taskId, linkId) => db.prepare("SELECT * FROM task_outcome_links WHERE id=? AND task_id=? AND evidence_type='link'").get(String(linkId || ""), String(taskId || ""));
  function taskFor(id) { const t = readTask(id); if (!t || !db.prepare("SELECT 1 FROM tasks WHERE id=? AND workspace_id=?").get(id, WS_ID)) throw new HttpError(404, "Task not found"); return t; }
  /* what a task's Smart Scoring panel shows: the metrics it is linked to or counts towards, and why one does not count */
  function forTask(u, taskId) {
    const doc = taskFor(taskId), t = tasks("t.id=?", [taskId])[0], k = kinds(), st = stages(), live = scoring.isOn();
    const mets = allMetrics(), byId = new Map(mets.map(m => [m.id, m]));
    const rows = db.prepare("SELECT * FROM task_outcome_links WHERE task_id=? ORDER BY created_at, rowid").all(taskId);
    const ids = [...new Set(rows.map(r => r.metric_id))].filter(id => byId.has(id));
    const items = ids.map(id => {
      const m = byId.get(id), link = rows.find(r => r.metric_id === id && r.evidence_type === "link") || null, ev = rows.find(r => r.metric_id === id && r.evidence_type === m.rule.type) || null;
      const counts = !!(ev && ev.status === "counted");
      let why = null;
      if (!counts) {
        if (link && link.status !== "counted") why = "waiting_confirmation";
        else if (!live || !k[m.kind]) why = "switched_off";
        else if (m.status !== "active") why = "not_active";
        else why = wanted(m, t, { linked: !!(link && link.status === "counted"), completionStages: st }).why;
      }
      return { metric: m, link: link ? { id: link.id, confirmed: link.status === "counted", by: link.linked_by || null, at: link.created_at, confirmedAt: link.counted_at || null } : null,
        evidence: ev ? { status: ev.status, contribution: ev.contribution, countedAt: ev.counted_at || null, revokedAt: ev.revoked_at || null } : null, counts, why };
    }).filter(it => it.link || it.evidence);
    const linked = new Set(rows.filter(r => r.evidence_type === "link").map(r => r.metric_id));
    const available = live ? mets.filter(m => m.status === "active" && k[m.kind] && !linked.has(m.id)) : [];
    const manage = can.scoringManageOutcomes(u);
    return { on: { enabled: live, kpi: k.kpi, okr: k.kr }, taskId, items, available, objectives: db.prepare("SELECT id, title FROM outcome_objectives WHERE workspace_id=?").all(WS_ID).map(o => ({ id: o.id, title: o.title })),
      can: { link: !u.stakeholder && (manage || can.editTask(u, doc)), manage } };
  }
  route("GET", "/api/tasks/:id/outcomes", (u, p) => { on(); reader(u); catchUp(); return forTask(u, p.id); });
  route("POST", "/api/tasks/:id/outcomes", (u, p, q, b) => {
    on(); reader(u);
    const doc = taskFor(p.id), r = metricRow(b && b.metricId); if (!r) throw new HttpError(404, "That KPI or key result does not exist");
    const m = metricRec(r), manage = can.scoringManageOutcomes(u);
    forbid(manage || can.editTask(u, doc), "link this task to a KPI or key result"); writable(m.kind);
    if (m.status !== "active") throw new HttpError(409, "Only an active " + noun(m.kind) + " can be linked");
    if (db.prepare("SELECT 1 FROM task_outcome_links WHERE metric_id=? AND evidence_type='link' AND evidence_id=?").get(m.id, p.id)) throw new HttpError(409, "This task is already linked to it");
    const at = now(), origin = b && b.origin === "ai_accepted" ? "ai_accepted" : "manual";
    run(() => {
      db.prepare("INSERT INTO task_outcome_links (id,workspace_id,task_id,metric_id,linked_by,origin,evidence_type,evidence_id,contribution,status,counted_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(uid("ol"), WS_ID, p.id, m.id, u.id, origin, "link", p.id, null, manage ? "counted" : "linked", manage ? at : null, at);
      audit(u, { taskId: p.id, action: "task_linked", newValue: { confirmed: manage, origin }, meta: { metricId: m.id, kind: m.kind } });
      const t = tasks("t.id=?", [p.id])[0], touched = new Set(); if (scoring.isOn()) { taskInner(t, counting(kinds()).filter(x => x.id === m.id), u, touched); snapshot(touched, u); }
    });
    return forTask(u, p.id);
  });
  route("POST", "/api/tasks/:id/outcomes/:linkId/confirm", (u, p) => {
    on(); reader(u); taskFor(p.id);
    const l = linkRow(p.id, p.linkId); if (!l) throw new HttpError(404, "That link does not exist");
    const m = metricRec(metricRow(l.metric_id));
    forbid(can.scoringManageOutcomes(u), "confirm what a task counts towards"); writable(m.kind);
    if (l.status !== "counted") run(() => {
      db.prepare("UPDATE task_outcome_links SET status='counted', counted_at=? WHERE id=?").run(now(), l.id);
      audit(u, { taskId: p.id, action: "link_confirmed", oldValue: { by: l.linked_by }, newValue: { confirmed: true }, meta: { metricId: m.id, kind: m.kind } });
      const touched = new Set(); taskInner(tasks("t.id=?", [p.id])[0], counting(kinds()).filter(x => x.id === m.id), u, touched); snapshot(touched, u);
    });
    return forTask(u, p.id);
  });
  /* a link waiting for a manager is removed by anyone who can edit the task; a confirmed one by a manager */
  route("DELETE", "/api/tasks/:id/outcomes/:linkId", (u, p) => {
    on(); reader(u);
    const doc = taskFor(p.id), l = linkRow(p.id, p.linkId); if (!l) throw new HttpError(404, "That link does not exist");
    const m = metricRec(metricRow(l.metric_id)), manage = can.scoringManageOutcomes(u);
    forbid(manage || (l.status !== "counted" && can.editTask(u, doc)), l.status === "counted" ? "remove a confirmed link (an outcomes manager does)" : "remove this link");
    writable(m.kind);
    run(() => {
      db.prepare("DELETE FROM task_outcome_links WHERE id=?").run(l.id);
      audit(u, { taskId: p.id, action: "task_unlinked", oldValue: { confirmed: l.status === "counted", by: l.linked_by }, meta: { metricId: m.id, kind: m.kind } });
      const touched = new Set(); taskInner(tasks("t.id=?", [p.id])[0], counting(kinds()).filter(x => x.id === m.id), u, touched); snapshot(touched, u);
    });
    return forTask(u, p.id);
  });

  return { evaluateTask, evaluateMetric, sweep, sweepInSteps, forTask, state };
};
/* the arithmetic, without a database, for the tests (tests/scoring-sanity.test.js, tests/outcomes.test.js) */
module.exports.pure = { wanted, metricProgress, objectiveProgress, filterMatches, successful, inPeriod, localDay, ruleOf, SENTENCES };
