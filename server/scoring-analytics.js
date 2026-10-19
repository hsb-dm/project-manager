/* SMART SCORING — ANALYTICS (Oct 2026). docs/SMART-SCORING.md §5.3 (the analytics route), spec §7.4 and §11, plan §4
   "Analytics v1/v2".

   What the scores add up to over a period, for the team or for one person, as operational figures — never pay, never a
   ranking. One rule chooses the tasks, the asset points' rule: those completed in the period (the day of completed_at,
   inclusive) in a completed stage (Settings → Smart Scoring's completion stages; by default every closed stage but
   Declined — a declined task produced nothing anyone used). Work still open counts in the week it is completed. Each
   task falls in the week (Monday, UTC) of the day it was completed. team = the task's team; project = its project or one
   of the others it is in; status = the state of its Effort Hours estimate (approved, locked — approved or frozen when
   work started —, not locked, from before Smart Scoring); person = the tasks that person is assigned to (and, for asset
   points, bonus and base points, what that person is credited with).

   The figures, each family read with one query (aggregated per task in SQL; the weeks, medians and shares worked out
   here):
   - throughput: tasks completed.
   - estimates (Effort Hours): the estimate against the time log's Actual. Counted as "verified" only a task whose
     estimate was locked (approved, or frozen when work started) and whose Actual is time logged in the time log;
     estimates from before Smart Scoring, never locked or whose scope changed since the lock, and Actuals typed or from
     before the time log, are counted apart as "unverified", with why. A task with no estimate (or 0) is "not
     estimated" and left out; one with an estimate and no time is "no time logged" and left out. Accuracy is only over
     tasks with both numbers: the median of |actual − estimate| ÷ estimate and the share within ±20 % (also how many
     took longer or less). Blocked time (waiting) is reported on its own, never in Actual.
   - velocity: the final values of the primary capacity metric (hours, story points or weighted points) of the tasks
     completed; for one person, a task shared by n people counts 1/n.
   - sources: where each module's final values came from (math, AI, typed by hand, from before) and how many times a
     person changed one by hand (scoring_audit).
   - review: first-pass approval (approved without any revision request), the review rounds until approval and the
     hours from the first version to the last approval (approvals, revision_requests, file_versions).
   - points: approved base points and efficiency bonus, always apart, from task_efficiency_awards (approved only; those
     waiting — provisional, pending review — apart; rejected, revoked and ineligible counted), the distribution of
     bonus rates over awards (never over people) and the reviewers' average quality score.
   - assets: output points for assets produced — the asset module's own crediting (server/scoring-assets.js credit())
     and ScoringEngine.assetPoints, on these same tasks, so they equal GET /api/scoring/assets.
   - outcomes: KPI and OKR progress as server/outcomes.js states it (read only; metrics have their own periods).
   Time-based and point-based figures are never combined into one score. People (for whoever sees the team) are in
   name order with their own figures side by side — never ranked, never sorted by points or bonus.

   GET /api/scoring/analytics?from&to&weeks&team&project&person&status&history
   - COS_SCORING=0 → 409; a stakeholder → 403; Smart Scoring switched off → 409, unless history.
   - scoring_view_analytics: the team (filters as given). Anyone else: their own figures only; asking for someone else
     → 403.
   - A module off (Effort Hours, the primary metric's module, assets, KPI, OKR, the efficiency bonus): its section is
     left out — and kept readable to scoring_view_analytics holders asking with history=1 (marked off: true).
   - from / to: YYYY-MM-DD; without from, the `weeks` (1–104, default 8) up to `to` (default today, UTC), from a Monday.
     At most two years.
   Read only: nothing is stored. Returns { compute }; the arithmetic is module.exports.pure (tests/scoring-sanity.test.js). */
const engine = require("../shared/scoring-engine");
const timeMath = require("./scoring-time").math;

const DAY = /^\d{4}-\d{2}-\d{2}$/, ID = /^[-\w.@]{1,80}$/;
const LOCKED = ["approved", "locked", "rebaseline_needed"];
const MODULES = ["hours", "story", "weighted"];
const PRIMARY = { hours: "hours", story_points: "story", weighted_points: "weighted" };
const UNITS = { hours: "h", story: "story_points", weighted: "weighted_points" };
const STATUS = ["approved", "locked", "not_locked", "unverified"];
const SOURCES = ["math", "ai", "manual", "legacy"];
/* a change of a score by a person that left a value typed by hand (scoring_audit, server/scoring.js) */
const MANUAL_ACTIONS = ["changed", "locked_changed", "estimate_changed", "estimate_set", "rebaselined"];
const WITHIN = 0.2;
const MAX_DAYS = 731;
/* the bonus rate of an award (bonus ÷ base): no bonus, then steps of 5 % up to the policy's usual cap, then above */
const BONUS_BUCKETS = [[0, 0], [0, 0.05], [0.05, 0.1], [0.1, 0.15], [0.15, 0.2], [0.2, null]];
const WAITING = ["provisional", "pending_review"];
const ROLLED = ["active", "closed"];

/* ---------- the arithmetic (pure) ---------- */
const r2 = x => engine.round2(+x || 0);
const r4 = x => Math.round((+x || 0) * 10000) / 10000;
function median(list) {
  const a = (list || []).map(Number).filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
/* part of a whole, 0–1; null when there is no whole (never a 0 % made of nothing) */
function share(part, whole) { return whole > 0 ? r4(Math.min(1, Math.max(0, (+part || 0) / whole))) : null; }
/* the Monday (UTC) of the week a day is in, as YYYY-MM-DD — as GET /api/scoring/assets buckets its weeks */
function weekOf(iso) {
  const day = new Date(String(iso || "").slice(0, 10) + "T00:00:00Z");
  if (isNaN(day.getTime())) return null;
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
}
function addDays(day, n) { const d = new Date(day + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const validDay = s => DAY.test(String(s)) && !isNaN(new Date(s + "T00:00:00Z").getTime()) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
/* the period asked for: {from, to, weeks: [Mondays]} or an error message */
function periodOf(q, today) {
  q = q || {};
  const to = q.to == null || q.to === "" ? today : String(q.to);
  if (!validDay(to)) return { error: "from and to are dates (YYYY-MM-DD)" };
  let from = q.from == null || q.from === "" ? null : String(q.from);
  if (from !== null && !validDay(from)) return { error: "from and to are dates (YYYY-MM-DD)" };
  if (from === null) {
    const n = q.weeks == null || q.weeks === "" ? 8 : Number(q.weeks);
    if (!Number.isInteger(n) || n < 1 || n > 104) return { error: "weeks is a whole number from 1 to 104" };
    from = addDays(weekOf(to), -7 * (n - 1));
  }
  if (from > to) return { error: "The period ends before it starts" };
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > MAX_DAYS) return { error: "A period is at most two years" };
  const weeks = []; for (let w = weekOf(from); w <= to; w = addDays(w, 7)) weeks.push(w);
  return { from, to, weeks };
}
/* a task's estimate for the comparison: its Effort Hours row (status, source, final, locked) and the task's Estimate in
   minutes → {value (h), basis: "locked" | "unverified" | "not_locked", approved, why} or null (not estimated) */
function estimateOf(row, estimatedMinutes) {
  if (row && LOCKED.indexOf(row.status) >= 0 && +row.locked > 0) {
    if (row.status === "rebaseline_needed") return { value: +row.locked, basis: "unverified", approved: false, why: "scope_changed" };
    return { value: +row.locked, basis: "locked", approved: row.status === "approved", why: null };
  }
  if (row && +row.final > 0) {
    const before = row.status === "unverified" || row.source === "legacy";
    return { value: +row.final, basis: before ? "unverified" : "not_locked", approved: false, why: before ? "estimate_from_before" : "estimate_not_locked" };
  }
  if (+estimatedMinutes > 0) return { value: +estimatedMinutes / 60, basis: "unverified", approved: false, why: "estimate_from_before" };
  return null;
}
/* a task's Actual for the comparison: the time log (minutes of work and revision, logged in it and from before it) or a
   number typed before the time log → {value (h, as the task shows it: to the quarter hour), basis: "logged" |
   "unverified", why} or null (no time logged) */
function actualOf(time, typed) {
  const manual = time ? Math.max(0, +time.manual || 0) : 0, legacy = time ? Math.max(0, +time.legacy || 0) : 0;
  if (manual + legacy > 0) return { value: timeMath.actualHours(manual + legacy), basis: legacy > 0 ? "unverified" : "logged", why: legacy > 0 ? "time_from_before" : null };
  if (+typed > 0) return { value: +typed, basis: "unverified", why: "actual_typed" };
  return null;
}
/* how close the estimates were, over the tasks that have both numbers: [{estimate, actual}] → {tasks, medianError (|a−e|
   ÷ e, ≥ 0), within (±20 %), over (took longer), under (took less), withinShare (0–1)}; nothing to measure → nulls */
function accuracy(pairs) {
  const ok = (pairs || []).filter(p => p && +p.estimate > 0 && p.actual != null && p.actual !== "" && Number.isFinite(+p.actual) && +p.actual >= 0);
  let within = 0, over = 0, under = 0;
  const errs = ok.map(p => { const e = Math.abs(p.actual - p.estimate) / p.estimate; if (e <= WITHIN + 1e-9) within++; else if (p.actual > p.estimate) over++; else under++; return e; });
  return { tasks: ok.length, medianError: ok.length ? r4(median(errs)) : null, within, over, under, withinShare: share(within, ok.length) };
}
/* which bar of the bonus distribution an award goes in (its bonus ÷ its base); null without a base */
function bonusBucket(base, bonus) {
  if (!(+base > 0)) return null;
  const rate = Math.max(0, +bonus || 0) / +base;
  if (rate <= 1e-9) return 0;
  for (let i = 1; i < BONUS_BUCKETS.length; i++) { const hi = BONUS_BUCKETS[i][1]; if (hi === null || rate <= hi + 1e-9) return i; }
  return BONUS_BUCKETS.length - 1;
}
/* the review of one task: {approvals, revisions, cycleHours} → reviewed, first pass, rounds */
function reviewOf(r) {
  const ap = Math.max(0, +r.approvals || 0), rr = Math.max(0, +r.revisions || 0);
  return { reviewed: ap > 0 || rr > 0, approved: ap > 0, firstPass: ap > 0 && rr === 0, rounds: ap > 0 ? rr + 1 : null, cycleHours: ap > 0 && Number.isFinite(+r.cycleHours) && r.cycleHours !== null && +r.cycleHours >= 0 ? +r.cycleHours : null };
}
function reviewSum(list) {
  const rs = list.map(reviewOf), reviewed = rs.filter(x => x.reviewed).length, firstPass = rs.filter(x => x.firstPass).length;
  const rounds = rs.filter(x => x.rounds !== null).map(x => x.rounds), cycle = rs.map(x => x.cycleHours).filter(x => x !== null);
  return { reviewed, firstPass, firstPassShare: share(firstPass, reviewed), approved: rounds.length, rounds: rounds.length ? r2(rounds.reduce((n, x) => n + x, 0) / rounds.length) : null, medianCycleHours: cycle.length ? r2(median(cycle)) : null };
}
const pure = { median, share, weekOf, periodOf, estimateOf, actualOf, accuracy, bonusBucket, reviewOf, reviewSum, WITHIN, BONUS_BUCKETS, LOCKED, MANUAL_ACTIONS };

module.exports = function scoringAnalytics(db, WS_ID, d) {
  const { route, HttpError, forbid, can, scoring } = d;
  const outcomes = d.outcomes || null;
  /* the reports' crediting of assets, exactly as GET /api/scoring/assets credits them: that module's own helper. This
     copy of the module registers no route (server.js registers the real one). */
  const assetCredit = require("./scoring-assets")(db, WS_ID, { route: () => {}, HttpError, forbid, can, scoring }).credit;
  const J = (v, dflt) => { if (v == null || v === "") return dflt; if (typeof v === "object") return v; try { return JSON.parse(v); } catch (e) { return dflt; } };

  /* the stages a task is completed in: the list set in Smart Scoring, else every closed stage but Declined (as the asset
     points and the outcomes read it) */
  function completionStages(s) {
    const closed = db.prepare("SELECT id FROM task_statuses WHERE workspace_id=? AND is_completed=1 ORDER BY sort_order").all(WS_ID).map(r => r.id);
    const list = s && s.bonus && Array.isArray(s.bonus.completionStages) ? s.bonus.completionStages : null;
    return list ? closed.filter(id => list.includes(id)) : closed.filter(id => id !== "declined");
  }
  /* the tasks of the period, as SQL: FROM … WHERE … with its parameters (repeated in each family's query) */
  function population(s, f) {
    const stages = completionStages(s);
    const from = "tasks t LEFT JOIN task_scoring hs ON hs.task_id=t.id AND hs.module='hours'";
    if (!stages.length) return { stages, from, where: "0", params: [] };
    let where = "t.workspace_id=? AND t.completed_at IS NOT NULL AND t.status_id IN (" + stages.map(() => "?").join(",") + ") AND substr(t.completed_at,1,10) >= ? AND substr(t.completed_at,1,10) <= ?";
    const params = [WS_ID, ...stages, f.from, f.to];
    if (f.team) { where += " AND t.team_id=?"; params.push(f.team); }
    if (f.project) { where += " AND (t.project_id=? OR instr(coalesce(t.extra_projects,''), ?)>0)"; params.push(f.project, JSON.stringify(f.project)); }
    const L = "('approved','locked','rebaseline_needed')";
    if (f.status === "approved") where += " AND hs.status='approved'";
    else if (f.status === "locked") where += " AND hs.status IN " + L;
    else if (f.status === "not_locked") where += " AND (hs.status IS NULL OR hs.status NOT IN " + L + ")";
    else if (f.status === "unverified") where += " AND (hs.status='unverified' OR (hs.source='legacy' AND hs.status NOT IN " + L + ") OR (hs.task_id IS NULL AND t.estimated_minutes>0))";
    return { stages, from, where, params };
  }
  const inPop = P => "(SELECT t.id FROM " + P.from + " WHERE " + P.where + ")";

  function compute(u, s, f, person, team, history) {
    const P = population(s, f), sub = inPop(P), meta = k => "CASE WHEN json_valid(t.meta) THEN json_extract(t.meta,'$." + k + "') END";
    const mod = id => !!(s.enabled && s.modules[id] && s.modules[id].on);
    const show = on => on || history;
    const primary = PRIMARY[s.primaryCapacity] || "hours";
    const on = { enabled: !!s.enabled, hours: mod("hours"), story: mod("story"), weighted: mod("weighted"), assets: mod("assets"), kpi: mod("kpi"), okr: mod("okr"), bonus: !!(s.enabled && s.bonus && s.bonus.on) };
    const weekIx = new Map(); f.weeks.forEach((w, i) => weekIx.set(w, i));
    const perWeek = make => f.weeks.map(() => make());

    /* the tasks (one query, with the Effort Hours row the status filter reads) */
    const tasks = P.where === "0" ? [] : db.prepare("SELECT t.id, t.title, t.team_id, t.project_id, t.assignee_id, t.assignees, t.asset_count, t.completed_at, t.estimated_minutes, hs.status AS h_status, hs.source AS h_source, hs.final_value AS h_final, hs.locked_value AS h_locked, "
      + meta("actualEffort") + " AS typed_actual, " + meta("assetSplit") + " AS asset_split, " + meta("assetSplitOk") + " AS asset_ok, " + meta("kind") + " AS kind_pick FROM " + P.from + " WHERE " + P.where + " ORDER BY t.completed_at, t.id").all(...P.params)
      .map(r => {
        const a = J(r.assignees, []), assignees = Array.isArray(a) ? a.filter(x => typeof x === "string" && x) : [];
        if (r.assignee_id && assignees.indexOf(r.assignee_id) < 0) assignees.unshift(r.assignee_id);
        return { id: r.id, title: r.title, meta: { kind: r.kind_pick }, assignees, assetCount: +r.asset_count || 0, week: weekIx.has(weekOf(r.completed_at)) ? weekIx.get(weekOf(r.completed_at)) : null,
          estimatedMinutes: +r.estimated_minutes || 0, typedActual: +r.typed_actual || 0, assetSplit: J(r.asset_split, null), assetOk: J(r.asset_ok, null),
          hours: r.h_status ? { status: r.h_status, source: r.h_source, final: r.h_final, locked: r.h_locked } : null };
      });
    const byId = new Map(tasks.map(t => [t.id, t]));
    /* the tasks this answer is about: one person's (assigned to them), or all */
    const mine = person ? tasks.filter(t => t.assignees.indexOf(person) >= 0) : tasks;
    const shareOf = t => person ? 1 / Math.max(1, t.assignees.length) : 1;
    const out = { scope: team ? "team" : "own", from: f.from, to: f.to, weeks: f.weeks, filters: { team: f.team || null, project: f.project || null, person, status: f.status || null },
      rule: "completed_in_period", stages: P.stages, on, primary: s.primaryCapacity, history: !!history, within: WITHIN };

    /* ---------- throughput ---------- */
    const thr = perWeek(() => 0); mine.forEach(t => { if (t.week !== null) thr[t.week]++; });
    out.throughput = { tasks: mine.length, byWeek: thr };

    /* ---------- the scores of the tasks (one query: every module's row) ---------- */
    const rows = new Map();
    if (tasks.length) db.prepare("SELECT task_id, module, final_value, source, status, ai_value FROM task_scoring WHERE task_id IN " + sub).all(...P.params)
      .forEach(r => { if (!rows.has(r.task_id)) rows.set(r.task_id, {}); rows.get(r.task_id)[r.module] = r; });

    /* ---------- time logged (one query: per task, person, kind and source) ---------- */
    const time = new Map(), logged = new Map();
    if (tasks.length && show(on.hours)) db.prepare("SELECT task_id, user_id, kind, source, sum(minutes) AS m FROM task_time_entries WHERE workspace_id=? AND deleted_at IS NULL AND task_id IN " + sub + " GROUP BY task_id, user_id, kind, source").all(WS_ID, ...P.params)
      .forEach(r => {
        const x = time.get(r.task_id) || { manual: 0, legacy: 0, blocked: 0 }, m = +r.m || 0; time.set(r.task_id, x);
        if (r.kind === "blocked") x.blocked += m; else if (r.source === "legacy") x.legacy += m; else x.manual += m;
        if (r.kind !== "blocked") logged.set(r.user_id + "\n" + r.task_id, (logged.get(r.user_id + "\n" + r.task_id) || 0) + m);
      });

    /* ---------- estimate against actual (Effort Hours) ---------- */
    if (show(on.hours)) {
      const group = () => ({ tasks: 0, estimateHours: 0, actualHours: 0 });
      const ver = group(), unv = group(), verW = perWeek(group), unvW = perWeek(group), why = { scope_changed: 0, estimate_from_before: 0, estimate_not_locked: 0, time_from_before: 0, actual_typed: 0 };
      const pairs = { verified: [], unverified: [] }, pairsW = perWeek(() => ({ verified: [], unverified: [] }));
      let notEstimated = 0, noTime = 0, blocked = 0, approved = 0;
      mine.forEach(t => {
        const tm = time.get(t.id); if (tm) blocked += tm.blocked;
        const e = estimateOf(t.hours, t.estimatedMinutes); if (!e) { notEstimated++; return; }
        const a = actualOf(tm, t.typedActual); if (!a) { noTime++; return; }
        const v = e.basis === "locked" && a.basis === "logged", g = v ? ver : unv, k = v ? "verified" : "unverified";
        [g, t.week !== null ? (v ? verW : unvW)[t.week] : null].forEach(x => { if (!x) return; x.tasks++; x.estimateHours += e.value; x.actualHours += a.value; });
        pairs[k].push({ estimate: e.value, actual: a.value }); if (t.week !== null) pairsW[t.week][k].push({ estimate: e.value, actual: a.value });
        if (!v) { if (e.why) why[e.why]++; if (a.why) why[a.why]++; } else if (e.approved) approved++;
      });
      const fin = x => ({ tasks: x.tasks, estimateHours: r2(x.estimateHours), actualHours: r2(x.actualHours) });
      const weekly = (list, k) => list.map((x, i) => x.tasks ? Object.assign(fin(x), { accuracy: accuracy(pairsW[i][k]) }) : null);
      out.estimates = { off: !on.hours || undefined, verified: Object.assign(fin(ver), { approved, accuracy: accuracy(pairs.verified), byWeek: weekly(verW, "verified") }),
        unverified: Object.assign(fin(unv), { why, accuracy: accuracy(pairs.unverified), byWeek: weekly(unvW, "unverified") }),
        notEstimated, noTimeLogged: noTime, blockedHours: r2(blocked / 60), timeLog: on.hours };
    }

    /* ---------- velocity in the primary capacity metric ---------- */
    if (show(mod(primary))) {
      const w = perWeek(() => ({ value: 0, tasks: 0 }));
      let total = 0, scored = 0;
      mine.forEach(t => { const r = (rows.get(t.id) || {})[primary]; if (!r || r.final_value == null || !(+r.final_value > 0)) return;
        const v = +r.final_value * shareOf(t); total += v; scored++; if (t.week !== null) { w[t.week].value += v; w[t.week].tasks++; } });
      out.velocity = { off: !mod(primary) || undefined, module: primary, unit: UNITS[primary], total: r2(total), scored, unscored: mine.length - scored, shared: !!person,
        byWeek: w.map(x => x.tasks ? { value: r2(x.value), tasks: x.tasks } : null) };
    }

    /* ---------- where the scores came from, and manual changes (one query over the audit) ---------- */
    const shown = MODULES.filter(m => show(mod(m)));
    if (shown.length) {
      const changes = new Map();
      if (tasks.length) db.prepare("SELECT task_id, module, count(*) AS n FROM scoring_audit WHERE workspace_id=? AND module IN ('hours','story','weighted') AND actor_id IS NOT NULL AND action IN (" + MANUAL_ACTIONS.map(() => "?").join(",") + ") AND CASE WHEN json_valid(new_value) THEN json_extract(new_value,'$.source') END = 'manual' AND task_id IN " + sub + " GROUP BY task_id, module")
        .all(WS_ID, ...MANUAL_ACTIONS, ...P.params).forEach(r => changes.set(r.task_id + "\n" + r.module, +r.n || 0));
      out.sources = {};
      shown.forEach(m => {
        const c = { off: !mod(m) || undefined, math: 0, ai: 0, manual: 0, legacy: 0, notScored: 0, aiSuggested: 0, manualChanges: 0, changedTasks: 0 };
        mine.forEach(t => {
          const r = (rows.get(t.id) || {})[m];
          if (!r || r.final_value == null || !(+r.final_value > 0) || SOURCES.indexOf(r.source) < 0) c.notScored++; else c[r.source]++;
          if (r && r.ai_value != null) c.aiSuggested++;
          const n = changes.get(t.id + "\n" + m) || 0; c.manualChanges += n; if (n) c.changedTasks++;
        });
        c.tasks = mine.length; out.sources[m] = c;
      });
    }

    /* ---------- review: first pass, rounds, cycle (one query) ---------- */
    {
      const rv = new Map();
      if (tasks.length) db.prepare("SELECT x.id, coalesce(a.n,0) AS approvals, coalesce(r.n,0) AS revisions, (julianday(a.last)-julianday(v.first))*24 AS cycle FROM " + sub + " x "
        + "LEFT JOIN (SELECT task_id, count(*) AS n, max(created_at) AS last FROM approvals WHERE task_id IN " + sub + " GROUP BY task_id) a ON a.task_id=x.id "
        + "LEFT JOIN (SELECT task_id, count(*) AS n FROM revision_requests WHERE task_id IN " + sub + " GROUP BY task_id) r ON r.task_id=x.id "
        + "LEFT JOIN (SELECT task_id, min(created_at) AS first FROM file_versions WHERE task_id IN " + sub + " GROUP BY task_id) v ON v.task_id=x.id")
        .all(...P.params, ...P.params, ...P.params, ...P.params).forEach(r => rv.set(r.id, { approvals: r.approvals, revisions: r.revisions, cycleHours: r.cycle }));
      const all = [], w = perWeek(() => []);
      mine.forEach(t => { const x = rv.get(t.id) || { approvals: 0, revisions: 0, cycleHours: null }; all.push(x); if (t.week !== null) w[t.week].push(x); });
      out.review = Object.assign(reviewSum(all), { tasks: mine.length, byWeek: w.map(l => { const x = reviewSum(l); return x.reviewed ? x : null; }) });
    }

    /* ---------- approved base points and efficiency bonus, apart (one query) ---------- */
    const awardsBy = new Map();
    if (show(on.bonus)) {
      const g = () => ({ base: 0, bonus: 0, awards: 0 });
      const approved = g(), waiting = g(), other = { rejected: 0, revoked: 0, ineligible: 0 }, dist = BONUS_BUCKETS.map(() => 0), w = perWeek(g), q = [];
      if (tasks.length) db.prepare("SELECT task_id, user_id, status, base_points, bonus_points, quality_score FROM task_efficiency_awards WHERE workspace_id=? AND task_id IN " + sub + (person ? " AND user_id=?" : "")).all(WS_ID, ...P.params, ...(person ? [person] : []))
        .forEach(a => {
          const t = byId.get(a.task_id); if (!t) return;
          const base = Math.max(0, +a.base_points || 0), bonus = Math.max(0, +a.bonus_points || 0);
          if (a.status === "approved") {
            approved.base += base; approved.bonus += bonus; approved.awards++;
            if (t.week !== null) { w[t.week].base += base; w[t.week].bonus += bonus; w[t.week].awards++; }
            const b = bonusBucket(base, bonus); if (b !== null) dist[b]++;
            if (a.quality_score != null && Number.isFinite(+a.quality_score)) q.push(+a.quality_score);
            const p = awardsBy.get(a.user_id) || { base: 0, bonus: 0, waiting: 0 }; p.base += base; p.bonus += bonus; awardsBy.set(a.user_id, p);
          } else if (WAITING.indexOf(a.status) >= 0) {
            waiting.base += base; waiting.bonus += bonus; waiting.awards++;
            const p = awardsBy.get(a.user_id) || { base: 0, bonus: 0, waiting: 0 }; p.waiting += base + bonus; awardsBy.set(a.user_id, p);
          } else if (other.hasOwnProperty(a.status)) other[a.status]++;
        });
      const fin = x => ({ base: r2(x.base), bonus: r2(x.bonus), awards: x.awards });
      out.points = { off: !on.bonus || undefined, approved: Object.assign(fin(approved), { bonusShare: approved.base > 0 ? share(approved.bonus, approved.base + approved.bonus) : null }), pending: fin(waiting), other,
        distribution: BONUS_BUCKETS.map((b, i) => ({ from: b[0], to: b[1], awards: dist[i] })),
        quality: { scored: q.length, average: q.length ? r2(q.reduce((n, x) => n + x, 0) / q.length) : null },
        byWeek: w.map(x => x.awards ? fin(x) : null) };
    }

    /* ---------- output points for assets produced: the asset module's crediting, on these tasks ---------- */
    const assetsBy = new Map();
    if (show(on.assets)) {
      const withAssets = tasks.filter(t => t.assetCount > 0), ups = new Map();
      if (withAssets.length) db.prepare("SELECT task_id, uploaded_by FROM file_versions WHERE task_id IN " + sub + " ORDER BY task_id, version_number").all(...P.params)
        .forEach(v => { if (!byId.has(v.task_id) || !(byId.get(v.task_id).assetCount > 0)) return; if (!ups.has(v.task_id)) ups.set(v.task_id, []); ups.get(v.task_id).push(v.uploaded_by); });
      const w = perWeek(() => ({ assets: 0, points: 0 }));
      let assets = 0, counted = 0, validated = 0, attributed = false;
      withAssets.forEach(t => {
        const c = assetCredit({ assetCount: t.assetCount, meta: { assetSplit: t.assetSplit }, uploaders: ups.get(t.id) || [], assignees: t.assignees });
        const r = engine.assetPoints(s.assets, { kind: engine.kindOfTask(t, s.kinds), split: c.by, validated: t.assetOk });
        let any = false;
        Object.keys(r.perPerson).forEach(id => {
          if (person && id !== person) return;
          const x = r.perPerson[id], n = c.by[id] || 0; any = true;
          assets += n; if (x.validated) validated += x.points; if (!c.exact) attributed = true;
          if (t.week !== null) { w[t.week].assets += n; w[t.week].points += x.points; }
          const p = assetsBy.get(id) || { assets: 0, points: 0 }; p.assets += n; p.points += x.points; assetsBy.set(id, p);
        });
        if (any) counted++;
      });
      /* the totals as GET /api/scoring/assets adds them up: each person's points to 2 decimals, then their sum */
      const perPersonPoints = [...assetsBy.values()].reduce((n, x) => n + r2(x.points), 0);
      out.assets = { off: !on.assets || undefined, assets: Math.round(assets), assetsExact: r2(assets), points: r2(perPersonPoints), validatedPoints: r2(validated), tasks: counted, attributed, countUnvalidated: !!(s.assets && s.assets.countUnvalidated),
        byWeek: w.map(x => x.assets > 0 || x.points > 0 ? { assets: r2(x.assets), points: r2(x.points) } : null) };
    }

    /* ---------- KPIs and OKRs, as the outcomes module states them (read only) ---------- */
    if (outcomes && (show(on.kpi) || show(on.okr))) {
      const st = outcomes.state(u), keep = x => ROLLED.indexOf(x.status) >= 0;
      const lite = p => p ? { value: p.value == null ? null : Math.max(0, Math.min(1, +p.value)), reason: p.reason || null, steps: p.steps || [] } : { value: null, reason: "missing_data", steps: [] };
      const metric = m => ({ id: m.id, kind: m.kind, title: m.title, unit: m.unit, direction: m.direction, baseline: m.baseline, target: m.target, actual: m.actual, source: m.source, weight: m.weight, period: m.period, rule: m.rule.type, status: m.status, progress: lite(m.progress) });
      out.outcomes = { off: { kpi: !on.kpi, okr: !on.okr }, note: "own_periods" };
      if (show(on.kpi)) out.outcomes.kpis = st.metrics.filter(m => m.kind === "kpi" && keep(m)).map(metric);
      if (show(on.okr)) out.outcomes.objectives = st.objectives.filter(keep).map(o => ({ id: o.id, title: o.title, period: o.period, status: o.status, progress: lite(o.progress),
        keyResults: st.metrics.filter(m => m.kind === "kr" && m.objective === o.id && keep(m)).map(metric) }));
    }

    /* ---------- people (whoever sees the team): each one's own figures, side by side, in name order ---------- */
    if (team) {
      const names = new Map(), stake = new Set();
      db.prepare("SELECT u.id, u.name, m.is_stakeholder FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=?").all(WS_ID).forEach(r => { names.set(r.id, r.name || r.id); if (r.is_stakeholder) stake.add(r.id); });
      const ppl = new Map(), get = id => { if (!ppl.has(id)) ppl.set(id, { userId: id, name: names.get(id) || id, tasks: 0, loggedHours: 0, velocity: 0 }); return ppl.get(id); };
      tasks.forEach(t => t.assignees.forEach(id => {
        if (person && id !== person) return;
        const p = get(id); p.tasks++;
        const r = out.velocity ? (rows.get(t.id) || {})[primary] : null; if (r && +r.final_value > 0) p.velocity += +r.final_value / Math.max(1, t.assignees.length);
      }));
      /* the time each person logged on these tasks (work and revision; also on a task no longer assigned to them) */
      if (out.estimates) logged.forEach((m, k) => { const id = k.split("\n")[0]; if (person && id !== person) return; get(id).loggedHours += m / 60; });
      assetsBy.forEach((x, id) => { get(id).assetPoints = x.points; });
      awardsBy.forEach((x, id) => { const p = get(id); p.basePoints = x.base; p.bonusPoints = x.bonus; p.pendingPoints = x.waiting; });
      out.people = [...ppl.values()].filter(p => !stake.has(p.userId))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)) || (a.userId < b.userId ? -1 : 1))
        .map(p => {
          const o = { userId: p.userId, name: p.name, tasks: p.tasks };
          if (out.estimates) o.loggedHours = r2(p.loggedHours);
          if (out.velocity) o.velocity = r2(p.velocity);
          if (out.points) { o.basePoints = r2(p.basePoints || 0); o.bonusPoints = r2(p.bonusPoints || 0); o.pendingPoints = r2(p.pendingPoints || 0); }
          if (out.assets) o.assetPoints = r2(p.assetPoints || 0);
          return o;
        });
    }
    /* undefined "off" marks are left out of the answer */
    ["estimates", "velocity", "points", "assets"].forEach(k => { if (out[k] && out[k].off === undefined) delete out[k].off; });
    if (out.sources) Object.keys(out.sources).forEach(k => { if (out.sources[k].off === undefined) delete out.sources[k].off; });
    return out;
  }

  /* the answer for a signed-in person and a query (the route's checks included) */
  function answer(u, q) {
    if (!scoring.featureOn()) throw new HttpError(409, "Smart Scoring is turned off on this server");
    forbid(u && !u.stakeholder, "see Smart Scoring's analytics");
    q = q || {};
    const team = can.scoringViewAnalytics(u), history = team && (q.history === "1" || q.history === "true" || q.history === true);
    const per = periodOf(q, new Date().toISOString().slice(0, 10)); if (per.error) throw new HttpError(400, per.error);
    const f = { from: per.from, to: per.to, weeks: per.weeks };
    ["team", "project", "person"].forEach(k => { if (q[k] == null || q[k] === "") return; if (!ID.test(String(q[k]))) throw new HttpError(400, "Unknown " + k); f[k] = String(q[k]); });
    if (q.status != null && q.status !== "" && q.status !== "any") { if (STATUS.indexOf(String(q.status)) < 0) throw new HttpError(400, "status is one of " + STATUS.join(", ")); f.status = String(q.status); }
    const s = scoring.settings();
    if (!s.enabled && !history) throw new HttpError(409, "Smart Scoring is switched off for this workspace. Turn it on in Settings → Smart Scoring first.");
    if (!team) forbid(!f.person || f.person === u.id, "see other people's scoring analytics");
    return compute(u, s, f, team ? f.person || null : u.id, team, history);
  }
  route("GET", "/api/scoring/analytics", (u, p, q) => answer(u, q));

  return { compute: answer };
};
module.exports.pure = pure;
