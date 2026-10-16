/* SMART SCORING — THE EFFICIENCY BONUS: AWARDS, THEIR REVIEW AND THEIR SAFEGUARDS (Oct 2026). docs/SMART-SCORING.md §13

   What it is. A task finished in less time than its approved, locked estimate may earn a small bonus in points — never
   extra hours — on top of its base points, once someone who did not work on it has approved it. The arithmetic is the
   spec's (§7.2) and lives in shared/scoring-engine.js: with E the locked estimate, A the time logged on it and B its
   base points, the bonus is B × min(maxRate, (saved share − grace) × rewardFactor), never negative and never above
   maxRate of B. E 8 h, A 5 h, B 8 points gives a bonus of 1.10 and 9.10 earned. It is an operational number, not pay,
   not a ranking and not a judgement of anyone.

   When a task can earn it. Every condition that is not met is named, in the engine's words or in this module's:
   the bonus is on (Settings → Smart Scoring), with Effort Hours; the task's team is in the pilot, when the workspace
   runs one; the hours estimate is locked and was approved — by someone who neither is assigned to the task nor logged
   time on it, after the bonus was turned on (no award is ever made retroactively), before the work started (a re-
   baseline later is fine when the first baseline was such an approval, and is flagged for the reviewer); the estimate
   is at least minE and the time at least minA, counting only the work and revision time of the time log (time kept
   from before the time log never counts, blocked time never counts); the task is completed (the stages the workspace
   chose, else every closed stage but Declined); its latest version was approved by someone who did not work on it (the
   quality gate, unless the workspace turned that requirement off); its scope is as it was when the estimate was locked.
   The base is the one canonical base: the Weighted Points while that module is on, else the workspace's bands of
   hours → points read on the LOCKED hours.

   The awards. One row per person credited (UNIQUE task, person), shared by each person's logged work and revision time
   — the base and the bonus are each shared cent for cent (ScoringEngine.allocate), so a shared task's awards add up to
   exactly its base and its bonus and nothing is counted twice. Provisional while the task is not completed (the
   numbers say what it would be); pending review once it is completed and eligible — the approvers are told; ineligible
   when completed without meeting a condition (the reasons say which); approved or rejected by an independent reviewer;
   revoked for someone with no time on it any more. Opened again: back to provisional (as server/scoring.js does). An
   approved or rejected award stays as it was unless something material changes afterwards — the time by at least
   materialChangeHours, the estimate, the base, the people credited, or (approved) a condition no longer holds — and
   then it goes back to review, the earlier decision kept in the history. Everything is recalculated after every task
   write (scoring.onTaskWritten), when the scores are read, by POST …/efficiency/recalculate and by a sweep every ten
   minutes; a calc_key per row keeps that idempotent — nothing is written, and nothing audited, when nothing changed.

   Flags for the reviewer, never accusations: done in less than reviewBelowRatio of the estimated time; time logged,
   changed or deleted after the work was approved; the estimate raised in the 24 hours before it was approved; a re-
   baseline after the work started; a base from Weighted Points nobody locked. There is no cap per person or period in
   this version — the flags are the safeguard, as the owner decided.

   The review. Approve and reject (scoringApproveCompletion): never by someone assigned to the task or credited on it,
   admins included, never while acting as someone else. Approving verifies the time entries of the people credited
   (verified, verified_by, verified_at), may adjust the shares (they must add up to 100%, with a reason), takes a quality
   score of 1–5 (required when the workspace sets a minimum, and at least that minimum). Rejecting needs a reason. Every
   change is in scoring_audit (module "efficiency") with the awards as they were and became.

   Who sees it. The task's scoring view (GET /api/tasks/:id/scoring, through scoring.extendView) carries an
   `efficiency` block only for the people credited (their own award), whoever approves finished work and whoever holds
   scoring_view_analytics (every award). The task document — the list everyone shares — never carries any of it.

   Routes (each: 409 with COS_SCORING=0, 404 for an unknown task, 403 without the right, 409 while Smart Scoring, Effort
   Hours or the bonus is off; answer { taskId, efficiency, task, changed }):
     POST /api/tasks/:id/efficiency/recalculate           anyone who sees the task's efficiency; idempotent
     POST /api/tasks/:id/efficiency/approve  { qualityScore?, shares?: {userId: percent}, reason?, calcKey? }
     POST /api/tasks/:id/efficiency/reject   { reason, qualityScore?, calcKey? }

   Registered in server.js after server/scoring.js and the other Smart Scoring modules. The pure arithmetic of one task
   is module.exports.pure.evaluateFacts (tests/scoring-sanity.test.js). */
const crypto = require("crypto");
const engine = require("../shared/scoring-engine");
const model = require("../shared/scoring-settings");
const { has } = require("./permissions");

const LOCKED = new Set(["approved", "locked", "rebaseline_needed"]);
const REVIEWED = new Set(["approved", "rejected"]);
const RAISE_WINDOW_HOURS = 24;
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const parse = (v, dflt) => { if (v == null || v === "") return dflt; try { const x = JSON.parse(v); return x == null ? dflt : x; } catch (e) { return dflt; } };
const r2 = x => engine.round2(x);
const r4 = x => Math.round((+x || 0) * 10000) / 10000;
const pct = x => Math.round((+x || 0) * 10000) / 100;
/* the time logged, to the nearest quarter of an hour — the task's Actual is shown the same way (server/scoring-time.js) */
const quarter = minutes => Math.round(Math.max(0, +minutes || 0) / 15) / 4;

/* this module's sentences: the conditions the engine does not know about, the flags, the revoked row */
const SENTENCES = {
  not_in_pilot: "The efficiency bonus runs as a pilot for other teams; this task's team is not in it.",
  lock_not_approved: "The estimate is locked but nobody approved it: it was frozen when work started, or changed after its lock. A bonus needs an approved estimate.",
  lock_self_approved: "The estimate was approved by someone who works on this task. A bonus needs someone else's approval.",
  lock_before_bonus: "The estimate was approved before the efficiency bonus was turned on. Awards are never made retroactively.",
  lock_after_work_started: "The estimate was approved only after the work had started. A bonus needs a baseline approved before the work.",
  legacy_time_only: "Only time from before the time log is recorded, and it never counts towards a bonus.",
  not_credited: "No work or revision time of theirs is logged on this task any more.",
  review_fast: engine.SENTENCES.eReview,
  review_time_after_approval: "Time was logged, changed or deleted after the work was approved ({n} entries): check it before approving.",
  review_estimate_raised: "The estimate went up from {from} h to {to} h in the {hours} hours before it was approved.",
  review_rebaselined: "The estimate was set again after the work had started: {from} h → {to} h.",
  review_base_not_locked: "The Weighted Points the base comes from are not locked yet."
};
const sentence = code => SENTENCES[code] || (engine.REASONS && engine.REASONS[code]) || code;
/* the conditions that are simply still ahead while the work is under way */
const AHEAD = new Set(["not_completed", "quality_not_approved"]);

/* The time a task's people logged that counts: work and revision entries of the time log (not deleted). Time kept from
   before the time log (source 'legacy') is counted apart and never earns; blocked time is never counted. */
function contributions(entries) {
  const minutes = {}; let manual = 0, legacy = 0;
  (entries || []).forEach(e => {
    if (!e || e.deletedAt || (e.kind !== "work" && e.kind !== "revision")) return;
    const n = Math.max(0, Math.round(+e.minutes || 0)); if (!n) return;
    if (e.source === "legacy") { legacy += n; return; }
    minutes[e.userId] = (minutes[e.userId] || 0) + n; manual += n;
  });
  return { minutes, manual, legacy };
}
/* the base and the bonus shared by the given weights (minutes, or percentages an approver set), cent for cent */
function share(B, bonus, weights) {
  const ids = Object.keys(weights || {}); if (!ids.length) return {};
  const p = engine.allocate(100, weights).values, bs = engine.allocate(B || 0, weights).values, bn = engine.allocate(bonus || 0, weights).values, out = {};
  ids.forEach(id => { out[id] = { share: r4(p[id] / 100), base: bs[id] || 0, bonus: bn[id] || 0, awarded: r2((bs[id] || 0) + (bn[id] || 0)) }; });
  return out;
}

/* Everything about one task's bonus, from what the database holds — pure, so tests hold it to sensible numbers.
   s: the normalized settings. f: { team, assignees, completed, hoursRow: {status, lockedValue, approvedBy, approvedAt},
   approvals: [{action, by, at, workStarted, value, impersonatedBy}] (oldest first), raises: [{at, by, from, to}],
   weightedOn, weightedRow: {value, status}, entries: [{userId, minutes, kind, source, deletedAt}], version: {n, state,
   decidedBy, decidedAt} | null, lateEntries: n }. */
function evaluateFacts(s, f) {
  f = f || {}; const b = s.bonus || {}, mine = [], flags = [];
  const reason = (code, vars) => mine.push({ code, key: sentence(code), vars: vars || {} });
  const flag = (code, vars) => flags.push({ code, key: sentence(code), vars: vars || {} });
  const work = contributions(f.entries);
  const people = new Set([].concat(f.assignees || [], Object.keys(work.minutes)));
  const inPilot = !(Array.isArray(b.pilotTeams) && b.pilotTeams.length) || b.pilotTeams.indexOf(f.team) >= 0;
  if (!inPilot) reason("not_in_pilot");

  /* the estimate: locked, approved by someone else, after the bonus was on, before the work */
  const h = f.hoursRow || null, locked = !!h && LOCKED.has(h.status);
  const E = locked && +h.lockedValue > 0 ? r2(h.lockedValue) : null;
  const lock = { status: h ? h.status : null, value: E, approvedBy: (h && h.approvedBy) || null, approvedAt: (h && h.approvedAt) || null, valid: false, rebaselined: false, baseline: null };
  if (locked) {
    if (!h.approvedBy) reason("lock_not_approved");
    else {
      const enabledAt = b.enabledAt || null;
      if (people.has(h.approvedBy)) reason("lock_self_approved");
      if (!enabledAt || !(String(h.approvedAt || "") > enabledAt)) reason("lock_before_bonus");
      const aps = Array.isArray(f.approvals) ? f.approvals : [], latest = aps.length ? aps[aps.length - 1] : null;
      const fair = a => !!a && a.workStarted === false && !!a.by && !people.has(a.by) && !a.impersonatedBy && !!enabledAt && String(a.at || "") > enabledAt;
      const first = aps.find(fair) || null;
      if (!latest || latest.workStarted !== false) {
        if (first) { lock.rebaselined = true; flag("review_rebaselined", { from: first.value, to: E }); }
        else reason("lock_after_work_started");
      }
      lock.baseline = first || latest || null;
      lock.valid = !mine.some(m => /^lock_/.test(m.code));
      /* raised shortly before the lock, by someone other than the approver */
      const at = lock.baseline && Date.parse(lock.baseline.at);
      if (at && Array.isArray(f.raises)) {
        const since = at - RAISE_WINDOW_HOURS * 3600000;
        const up = f.raises.filter(x => x && x.by !== lock.baseline.by && +x.to > +x.from && Date.parse(x.at) >= since && Date.parse(x.at) <= at);
        if (up.length) flag("review_estimate_raised", { from: Math.min.apply(null, up.map(x => +x.from)), to: Math.max.apply(null, up.map(x => +x.to)), hours: RAISE_WINDOW_HOURS });
      }
    }
  }

  /* the time: work and revision entries of the time log only */
  const A = quarter(work.manual);
  if (!work.manual && work.legacy) reason("legacy_time_only");

  /* the quality gate: the latest version approved by someone who did not work on it */
  const v = f.version || null, quality = { required: !!b.requireApprovedVersion, ok: true, why: null, version: v };
  if (quality.required) {
    if (!v) { quality.ok = false; quality.why = "no_version"; }
    else if (v.state !== "approved") { quality.ok = false; quality.why = "not_approved"; }
    else if (!v.decidedBy || people.has(v.decidedBy)) { quality.ok = false; quality.why = "approved_by_contributor"; }
  }

  /* the one base: the Weighted Points while that module is on, else the bands on the locked hours */
  const wv = f.weightedOn && f.weightedRow && +f.weightedRow.value > 0 ? +f.weightedRow.value : null;
  const base = engine.basePoints(b, { weightedFinal: wv, lockedHours: E });
  if (base.source === "weighted" && !(f.weightedRow && LOCKED.has(f.weightedRow.status))) flag("review_base_not_locked");

  const eff = engine.efficiency(b, { E, A, B: base.value, completed: !!f.completed, qualityApproved: quality.ok, scopeChanged: !!h && h.status === "rebaseline_needed", validLogs: true });
  if (eff.needsReview) flag("review_fast", { pct: pct(eff.actualRatio), limit: pct(eff.policy.reviewBelowRatio) });
  if (+f.lateEntries > 0) flag("review_time_after_approval", { n: +f.lateEntries });

  const engineReasons = eff.reasons.filter(c => !(c === "no_actual_time" && mine.some(m => m.code === "legacy_time_only")))
    .map(code => ({ code, key: sentence(code), vars: code === "estimate_below_minimum" ? { E, minE: eff.policy.minE } : code === "actual_below_minimum" ? { A, minA: eff.policy.minA } : {} }));
  const reasons = mine.concat(engineReasons);
  const eligible = reasons.length === 0;
  const status = !f.completed ? "provisional" : eligible ? "pending_review" : "ineligible";
  /* what a row stores as its bonus: the bonus once eligible; while the work is under way, what it would be when the
     only conditions left are the ones still ahead (completion, the quality review); otherwise nothing */
  const ahead = !f.completed && reasons.every(x => AHEAD.has(x.code));
  const stored = eligible ? eff.bonus : ahead ? (eff.potentialBonus || 0) : 0;
  const B = base.value;
  return {
    status, eligible, completed: !!f.completed, inPilot, reasons, flags, E, A, B, base, eff, bonus: eligible ? eff.bonus : 0, stored,
    earned: B === null ? null : r2(B + stored), minutes: work.minutes, legacyMinutes: work.legacy, manualMinutes: work.manual,
    alloc: share(B, stored, work.minutes), quality, lock, steps: (base.steps || []).concat(eff.steps || [])
  };
}

module.exports = function scoringAwards(db, WS_ID, d) {
  const { scoring, route, HttpError, forbid, can, security, uid, now, tx } = d;
  const sz = d.sz || require("./serialize");
  const forViewer = typeof d.forViewer === "function" ? d.forViewer : ((u, t) => t);
  const bumpData = typeof d.bumpData === "function" ? d.bumpData : () => {};
  const notify = typeof d.notify === "function" ? d.notify : null;
  const userContext = typeof d.userContext === "function" ? d.userContext : null;
  const NOTIF = "efficiency_review";
  /* the words of the notification, by e-mail and by push (server.js keeps them by notification type) */
  if (d.texts && d.texts.mail && !d.texts.mail[NOTIF]) d.texts.mail[NOTIF] = "“{t}” is finished: its efficiency bonus waits for your review.";
  if (d.texts && d.texts.pushId && !d.texts.pushId[NOTIF]) d.texts.pushId[NOTIF] = "“{t}” selesai: bonus efisiensinya menunggu review-mu.";
  const inTx = fn => (db.isTransaction ? fn() : tx(db, fn));
  db.exec("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)");

  const featureOn = () => !!(scoring && scoring.featureOn && scoring.featureOn());
  const settings = () => scoring.settings();
  /* the awards are worked out while Smart Scoring, its Effort Hours and the bonus are all on; otherwise they stay as
     they are (read, never changed) */
  const activeIn = s => featureOn() && !!s.enabled && !!(s.modules && s.modules.hours && s.modules.hours.on) && !!(s.bonus && s.bonus.on);
  function on() { if (!featureOn()) throw new HttpError(409, "Smart Scoring is turned off on this server"); }
  function writable() {
    const s = settings();
    if (!s.enabled) throw new HttpError(409, "Smart Scoring is turned off in this workspace, so efficiency awards cannot be changed now. Their history can still be read.");
    if (!(s.modules.hours && s.modules.hours.on)) throw new HttpError(409, "Effort Hours is turned off in Smart Scoring, so efficiency awards cannot be changed now.");
    if (!s.bonus.on) throw new HttpError(409, "The efficiency bonus is turned off in Smart Scoring, so awards cannot be changed now. Their history can still be read.");
    return s;
  }

  /* ---------- what the database holds about a task ---------- */
  function liteTask(id) {
    const t = db.prepare("SELECT id, title, team_id, status_id, assignee_id, assignees, completed_at, updated_at FROM tasks WHERE id=? AND workspace_id=?").get(String(id), WS_ID); if (!t) return null;
    const a = parse(t.assignees, []), list = Array.isArray(a) ? a.slice() : [];
    if (t.assignee_id && list.indexOf(t.assignee_id) < 0) list.unshift(t.assignee_id);
    return { id: t.id, title: t.title, team: t.team_id, status: t.status_id, assignee: t.assignee_id, assignees: list, completedAt: t.completed_at, updatedAt: t.updated_at };
  }
  function taskOr404(id) { const t = liteTask(id); if (!t) throw new HttpError(404, "Task not found"); return t; }
  function completedStage(statusId, s) {
    const list = s.bonus && s.bonus.completionStages;
    if (Array.isArray(list) && list.length) return list.indexOf(statusId) >= 0;
    const st = statusId ? db.prepare("SELECT id, kind FROM task_statuses WHERE id=?").get(statusId) : null;
    return !!st && st.kind === "closed" && st.id !== "declined";
  }
  const scoreRow = (id, m) => db.prepare("SELECT * FROM task_scoring WHERE task_id=? AND module=?").get(id, m) || null;
  const awardsOf = id => db.prepare("SELECT * FROM task_efficiency_awards WHERE task_id=? AND workspace_id=? ORDER BY created_at, rowid").all(id, WS_ID);
  const entriesOf = id => db.prepare("SELECT user_id, minutes, kind, source, created_at, edited_at, deleted_at FROM task_time_entries WHERE task_id=? AND workspace_id=?").all(id, WS_ID)
    .map(e => ({ userId: e.user_id, minutes: e.minutes, kind: e.kind, source: e.source, createdAt: e.created_at, editedAt: e.edited_at, deletedAt: e.deleted_at }));
  function facts(t, s, awards) {
    const h = scoreRow(t.id, "hours"), w = scoreRow(t.id, "weighted");
    const audit = db.prepare("SELECT action, actor_id, impersonated_by, old_value, new_value, meta, created_at FROM scoring_audit WHERE workspace_id=? AND task_id=? AND module='hours' ORDER BY created_at, rowid").all(WS_ID, t.id);
    const approvals = [], raises = [];
    audit.forEach(a => {
      const m = parse(a.meta, {}) || {}, from = parse(a.old_value, null), to = parse(a.new_value, null);
      const fv = from && from.value != null ? +from.value : null, tv = to && to.value != null ? +to.value : null;
      if (a.action === "approved" || a.action === "rebaselined") approvals.push({ action: a.action, by: a.actor_id || null, at: a.created_at, workStarted: m.workStarted === false ? false : true, value: to && to.lockedValue != null ? +to.lockedValue : tv, impersonatedBy: a.impersonated_by || null });
      if (fv !== null && tv !== null && tv > fv) {
        /* an accepted proposal raises the estimate in the name of whoever proposed it */
        const by = a.action === "approved" && m.acceptedProposal && from.proposal && from.proposal.by ? from.proposal.by : a.actor_id || null;
        raises.push({ at: a.created_at, by, from: fv, to: tv });
      }
    });
    const v = db.prepare("SELECT version_number n, approval_status state, decided_by, decided_at FROM file_versions WHERE task_id=? ORDER BY version_number DESC LIMIT 1").get(t.id);
    const version = v ? { n: v.n, state: v.state, decidedBy: v.decided_by || null, decidedAt: v.decided_at || null } : null;
    const entries = entriesOf(t.id);
    /* time changed after the work was approved: its latest version's approval, else an approved award's review */
    const reviewedAt = (awards || []).filter(a => a.status === "approved" && a.reviewed_at).map(a => a.reviewed_at).sort()[0] || null;
    const approvedAt = version && version.state === "approved" && version.decidedAt ? version.decidedAt : reviewedAt;
    const lateEntries = approvedAt ? entries.filter(e => e.source !== "legacy" && [e.createdAt, e.editedAt, e.deletedAt].some(x => x && x > approvedAt)).length : 0;
    return {
      team: t.team, assignees: t.assignees, completed: completedStage(t.status, s),
      hoursRow: h ? { status: h.status, lockedValue: h.locked_value, approvedBy: h.approved_by || null, approvedAt: h.approved_at || null } : null,
      approvals, raises, weightedOn: !!(s.modules.weighted && s.modules.weighted.on), weightedRow: w ? { value: w.final_value, status: w.status } : null,
      entries, version, lateEntries
    };
  }

  /* The settings an award was worked out under (the settings' history keeps every version whole). A decided award is
     judged by them, so a later change of the policy — the bands, the grace, a pilot, the bonus turned off and on again,
     which starts it again from then — never reopens an approval: only a change of the task itself does. */
  const settingsCache = new Map();
  function settingsAt(version, cur) {
    if (version == null || version === cur.configVersion) return cur;
    if (settingsCache.has(version)) return settingsCache.get(version);
    let n = null;
    try { db.prepare("SELECT new_value, meta FROM scoring_audit WHERE workspace_id=? AND module='settings' AND action='settings_changed' ORDER BY created_at DESC, rowid DESC").all(WS_ID).some(a => { const m = parse(a.meta, {}) || {}; if (m.configVersion !== version) return false; n = parse(a.new_value, null); return true; }); } catch (e) { n = null; }
    const out = n && typeof n === "object" ? model.normalizeSettings(n) : cur;
    settingsCache.set(version, out); return out;
  }

  /* ---------- the rows ---------- */
  const CONTENT =["share", "estimate_snapshot", "actual_snapshot", "base_points", "bonus_points", "awarded_points", "status", "reasons", "needs_review", "reviewer_id", "reviewed_at", "review_note", "quality_score"];
  const keyOf = c => crypto.createHash("sha1").update(JSON.stringify(CONTENT.map(k => (c[k] === undefined ? null : c[k])))).digest("hex").slice(0, 16);
  const same = (a, c) => CONTENT.every(k => { const x = a[k] === undefined ? null : a[k], y = c[k] === undefined ? null : c[k]; return typeof x === "number" || typeof y === "number" ? (x === null ? null : +x) === (y === null ? null : +y) : x === y; });
  const codes = r => JSON.stringify(r.reasons.map(x => x.code).concat(r.flags.map(x => x.code)));
  function fresh(r, userId, s, a) {
    const x = (a || r.alloc)[userId] || { share: 0, base: 0, bonus: 0, awarded: 0 };
    return { share: x.share, estimate_snapshot: r.E, actual_snapshot: r.A, base_points: x.base, bonus_points: x.bonus, awarded_points: x.awarded, status: r.status, reasons: codes(r), needs_review: r.flags.length ? 1 : 0, reviewer_id: null, reviewed_at: null, review_note: null, quality_score: null, policy_version: s.configVersion };
  }
  const revokedContent = (r, s) => ({ share: 0, estimate_snapshot: r.E, actual_snapshot: r.A, base_points: 0, bonus_points: 0, awarded_points: 0, status: "revoked", reasons: JSON.stringify(["not_credited"]), needs_review: 0, reviewer_id: null, reviewed_at: null, review_note: null, quality_score: null, policy_version: s.configVersion });
  function writeAward(prev, taskId, userId, c) {
    const key = keyOf(c), at = now();
    if (!prev) {
      db.prepare("INSERT INTO task_efficiency_awards (id,workspace_id,task_id,user_id," + CONTENT.join(",") + ",policy_version,calc_key,recalculated_at,created_at) VALUES (?,?,?,?," + CONTENT.map(() => "?").join(",") + ",?,?,?,?)")
        .run(uid("aw"), WS_ID, taskId, userId, ...CONTENT.map(k => (c[k] === undefined ? null : c[k])), c.policy_version == null ? null : c.policy_version, key, at, at);
      return true;
    }
    if (prev.calc_key === key) return false;
    if (same(prev, c)) { db.prepare("UPDATE task_efficiency_awards SET calc_key=? WHERE id=?").run(key, prev.id); return false; }
    db.prepare("UPDATE task_efficiency_awards SET " + CONTENT.map(k => k + "=?").join(",") + ", policy_version=?, calc_key=?, recalculated_at=? WHERE id=?")
      .run(...CONTENT.map(k => (c[k] === undefined ? null : c[k])), c.policy_version == null ? null : c.policy_version, key, at, prev.id);
    return true;
  }
  const snapAward = a => ({ userId: a.user_id, share: a.share, estimate: a.estimate_snapshot, actual: a.actual_snapshot, basePoints: a.base_points, bonusPoints: a.bonus_points, awardedPoints: a.awarded_points, status: a.status, reasons: parse(a.reasons, []), needsReview: !!a.needs_review, reviewerId: a.reviewer_id || null, reviewedAt: a.reviewed_at || null, qualityScore: a.quality_score });
  const touch = id => db.prepare("UPDATE tasks SET updated_at=? WHERE id=?").run(now(), id);

  /* What changed since an approval or a rejection that matters: the estimate, the time (by materialChangeHours or more),
     the base, the people credited; for an approved award also a condition that no longer holds. */
  function material(reviewed, r, s, live) {
    const a = reviewed[0], why = [];
    if ((a.estimate_snapshot == null ? null : r2(a.estimate_snapshot)) !== r.E) why.push("estimate");
    const dA = Math.abs((+a.actual_snapshot || 0) - (r.A || 0)), mch = +s.bonus.materialChangeHours || 0;
    if (dA > 0 && dA >= mch) why.push("time");
    if (r2(reviewed.reduce((x, y) => x + (+y.base_points || 0), 0)) !== r2(r.B || 0)) why.push("base");
    const had = reviewed.map(x => x.user_id).sort().join("|"), now_ = Object.keys(r.minutes).sort().join("|");
    if (had !== now_ || live.length !== reviewed.length) why.push("people");
    if (reviewed.some(x => x.status === "approved") && !r.eligible) why.push("eligibility");
    return why;
  }

  /* The awards of one task worked out again and written where they changed (idempotent). → {changed, pending, result} */
  function evaluate(taskId, actor, info) {
    const s = settings(); if (!activeIn(s)) return { changed: false, pending: false, result: null };
    const out = inTx(() => {
      const t = liteTask(taskId); if (!t) return { changed: false, pending: false, result: null };
      const rows = awardsOf(t.id);
      /* most task writes concern no award: no award yet, and no locked estimate or no time of anyone's own logged */
      if (!rows.length && !(db.prepare("SELECT 1 FROM task_scoring WHERE task_id=? AND module='hours' AND status IN ('approved','locked','rebaseline_needed')").get(t.id)
        && db.prepare("SELECT 1 FROM task_time_entries WHERE task_id=? AND workspace_id=? AND deleted_at IS NULL AND source='manual' AND kind IN ('work','revision') LIMIT 1").get(t.id, WS_ID))) return { changed: false, pending: false, result: null };
      const r = evaluateFacts(s, facts(t, s, rows));
      const live = Object.keys(r.minutes), byUser = new Map(rows.map(a => [a.user_id, a]));
      const create = r.inPilot && !!r.lock.status && LOCKED.has(r.lock.status) && live.length > 0;
      if (!rows.length && !create) return { changed: false, pending: false, result: r };
      const next = new Map();   /* user → content */
      const active = rows.filter(a => a.status !== "revoked"), reviewed = active.filter(a => REVIEWED.has(a.status));
      let action = "recalculated", why = [], flagsOnly = false;
      if (reviewed.length && !r.completed) {
        /* opened again: an approved award waits for the work to be finished again (server/scoring.js does the same);
           a rejected one stays rejected until something material changes */
        live.forEach(id => { const a = byUser.get(id); if (!a || a.status !== "rejected") next.set(id, fresh(r, id, s)); });
      } else if (reviewed.length) {
        /* judged by the settings it was decided under: only a change of the task itself reopens a decision */
        const sd = settingsAt(reviewed[0].policy_version, s), rd = sd === s ? r : evaluateFacts(sd, facts(t, sd, rows));
        why = material(reviewed, rd, sd, live);
        if (!why.length) {
          /* the decision stands; only what the reviewer is told may change */
          flagsOnly = true;
          reviewed.forEach(a => { next.set(a.user_id, Object.assign({}, a, { reasons: codes(r), needs_review: r.flags.length ? 1 : 0 })); });
        } else { action = "review_reopened"; live.forEach(id => next.set(id, fresh(r, id, s))); }
      } else live.forEach(id => next.set(id, fresh(r, id, s)));
      /* someone with no time on it any more is not credited */
      rows.forEach(a => { if (live.indexOf(a.user_id) < 0 && a.status !== "revoked") next.set(a.user_id, revokedContent(r, s)); });
      const before = rows.map(snapAward), wasPending = new Set(rows.filter(a => a.status === "pending_review").map(a => a.user_id));
      let changed = false, pending = false;
      next.forEach((c, id) => {
        const prev = byUser.get(id);
        if (c.policy_version === undefined) c.policy_version = prev ? prev.policy_version : s.configVersion;
        if (writeAward(prev || null, t.id, id, c)) { changed = true; if (c.status === "pending_review" && !wasPending.has(id)) pending = true; }
      });
      if (changed) {
        const after = awardsOf(t.id).map(snapAward);
        if (pending && action === "recalculated") action = "pending_review";
        scoring.audit({ taskId: t.id, module: "efficiency", action, actor: actor ? actor.id : null, impersonatedBy: actor && actor.impersonatedBy, oldValue: before, newValue: after,
          meta: { via: (info && info.via) || null, status: r.status, E: r.E, A: r.A, B: r.B, bonus: r.stored, reasons: r.reasons.map(x => x.code), flags: r.flags.map(x => x.code), material: why, flagsOnly } });
        touch(t.id);
      }
      return { changed, pending, result: r, task: t };
    });
    if (out.pending && out.task) tellApprovers(out.task, actor);
    return out;
  }
  function evaluateSafe(taskId, actor, info) {
    try { const o = evaluate(taskId, actor, info); if (o.changed) bumpData(); return o; }
    catch (e) { console.error("[scoring-awards] " + taskId + ": " + (e && e.message)); return { changed: false, pending: false, result: null }; }
  }
  /* the people who may approve it — scoring_approve_completion, not assigned, not credited — hear that it waits */
  function tellApprovers(t, actor) {
    if (!notify || !userContext) return;
    try {
      const credited = awardsOf(t.id).map(a => a.user_id), actorId = actor && actor.id;
      const ids = db.prepare("SELECT wm.user_id FROM workspace_members wm JOIN users u ON u.id=wm.user_id WHERE wm.workspace_id=? AND u.is_active=1 AND coalesce(wm.pending,0)=0").all(WS_ID).map(x => x.user_id)
        .filter(id => id !== actorId).filter(id => { const c = userContext(id); return !!c && can.scoringApproveCompletion(c, t, credited); });
      if (ids.length) notify(ids.map(id => ({ recipient: id, k: NOTIF, message: "" })), { who: actorId || null, entityType: "task", t: t.id });
    } catch (e) { console.error("[scoring-awards] telling the approvers: " + (e && e.message)); }
  }

  /* ---------- what a person sees: the `efficiency` block of a task's scoring view ---------- */
  const policyAt = (version, cur) => settingsAt(version, cur).bonus;
  const awardOut = a => ({ id: a.id, userId: a.user_id, share: a.share, estimate: a.estimate_snapshot, actual: a.actual_snapshot, basePoints: a.base_points, bonusPoints: a.bonus_points, awardedPoints: a.awarded_points, status: a.status, reasons: parse(a.reasons, []) || [], needsReview: !!a.needs_review, reviewerId: a.reviewer_id || null, reviewedAt: a.reviewed_at || null, reviewNote: a.review_note || "", qualityScore: a.quality_score, policyVersion: a.policy_version, recalculatedAt: a.recalculated_at || null, createdAt: a.created_at });
  const isAssignee = (u, t) => !!u && (t.assignee === u.id || (t.assignees || []).indexOf(u.id) >= 0);
  const taskKey = rows => crypto.createHash("sha1").update(rows.filter(a => a.status !== "revoked").map(a => a.user_id + ":" + a.status + ":" + a.calc_key).join("|")).digest("hex").slice(0, 16);
  /* who is credited, for the permission checks: the awards' people and whoever has time of their own on the task */
  function creditedOf(t, rows) { const ids = new Set(rows.map(a => a.user_id)); entriesOf(t.id).forEach(e => { if (!e.deletedAt && e.source !== "legacy" && (e.kind === "work" || e.kind === "revision")) ids.add(e.userId); }); return [...ids]; }
  function blockedFor(u, t, credited) {
    if (u.stakeholder) return "stakeholder";
    if (u.impersonatedBy) return "impersonating";
    if (!has(u, "scoring_approve_completion")) return "permission";
    if (isAssignee(u, t) || credited.indexOf(u.id) >= 0) return "worked_on_it";
    return null;
  }
  function block(u, t, result) {
    const s = settings(), rows = awardsOf(t.id), credited = creditedOf(t, rows);
    if (!can.scoringSeesEfficiency(u, t, credited)) return null;
    const all = has(u, "scoring_approve_completion") || has(u, "scoring_view_analytics");
    const active = activeIn(s), live = rows.filter(a => a.status !== "revoked");
    const r = result || (active || live.length ? evaluateFacts(s, facts(t, s, rows)) : null);
    const lead = live[0] || null, status = lead ? lead.status : null, frozen = !!lead && REVIEWED.has(status);
    const sum = k => r2(live.reduce((x, a) => x + (+a[k] || 0), 0));
    const E = lead ? lead.estimate_snapshot : r ? r.E : null, A = lead ? lead.actual_snapshot : r ? r.A : null;
    const B = lead ? sum("base_points") : r ? r.B : null;
    const bonus = lead ? sum("bonus_points") : r ? r.stored : 0;
    /* the breakdown of a decided award with the numbers and the policy it was decided on */
    let steps = r ? r.steps : [];
    if (frozen && r) { const e = engine.efficiency(policyAt(lead.policy_version, s), { E, A, B, completed: true, qualityApproved: true, scopeChanged: false, validLogs: true }); steps = (r.base.steps || []).concat(e.steps || []); }
    const blocked = blockedFor(u, t, credited), pend = status === "pending_review" && live.every(a => a.status === "pending_review");
    const people = {};
    rows.forEach(a => { people[a.user_id] = { userId: a.user_id, minutes: 0, share: a.share, basePoints: a.base_points, bonusPoints: a.bonus_points, awardedPoints: a.awarded_points, status: a.status }; });
    if (r) Object.keys(r.minutes).forEach(id => { const p = people[id] || (people[id] = { userId: id, share: r.alloc[id] ? r.alloc[id].share : 0, basePoints: null, bonusPoints: null, awardedPoints: null, status: null }); p.minutes = r.minutes[id]; });
    const list = Object.values(people).filter(p => all || p.userId === u.id).map(p => Object.assign(p, { hours: quarter(p.minutes) }));
    return {
      on: active, bonusOn: !!s.bonus.on, status, eligible: r ? r.eligible : false, completed: r ? r.completed : null,
      estimate: E, actual: A, saved: E != null && A != null ? r2(Math.max(0, E - A)) : null,
      savedRatio: r && r.eff ? r.eff.savedRatio : null, actualRatio: r && r.eff ? r.eff.actualRatio : null, varianceHours: r && r.eff ? r.eff.varianceHours : null,
      legacyHours: r ? quarter(r.legacyMinutes) : 0,
      base: { value: B, source: r ? r.base.source : null, band: r ? r.base.band : null },
      bonus, potentialBonus: r && r.eff ? r.eff.potentialBonus : null, earned: B == null ? null : r2(B + bonus),
      reasons: r ? r.reasons : [], flags: r ? r.flags : [], steps,
      quality: r ? r.quality : null, lock: r ? r.lock : null,
      people: list,
      awards: rows.filter(a => all || a.user_id === u.id).map(awardOut),
      review: frozen ? { by: lead.reviewer_id || null, at: lead.reviewed_at || null, note: lead.review_note || "", quality: lead.quality_score } : null,
      calcKey: taskKey(rows),
      policy: { version: s.configVersion, grace: s.bonus.grace, rewardFactor: s.bonus.rewardFactor, maxRate: s.bonus.maxRate, minE: s.bonus.minE, minA: s.bonus.minA, reviewBelowRatio: s.bonus.reviewBelowRatio, materialChangeHours: s.bonus.materialChangeHours, minQuality: s.bonus.minQuality, requireApprovedVersion: !!s.bonus.requireApprovedVersion },
      can: { recalculate: active && !u.stakeholder, review: active && !blocked, approve: active && !blocked && pend, reject: active && !blocked && pend, blocked, qualityRequired: s.bonus.minQuality != null }
    };
  }
  /* the block goes into GET /api/tasks/:id/scoring (and every scoring write's answer), only for those who may see it */
  if (scoring && typeof scoring.extendView === "function") scoring.extendView((u, t, out) => {
    if (!featureOn()) return;
    const ev = evaluateSafe(t.id, null, { via: "view" });
    const b = block(u, t, ev.result);
    if (!b) { delete out.efficiency; if (out.can) out.can.viewEfficiency = false; return; }
    out.efficiency = b;
    if (out.can) { const cr = creditedOf(t, awardsOf(t.id)); out.can.viewEfficiency = true; out.can.approveCompletion = can.scoringApproveCompletion(u, t, cr); }
  });
  if (scoring && typeof scoring.onTaskWritten === "function") scoring.onTaskWritten((taskId, user, info) => { evaluateSafe(taskId, user, info); });

  /* ---------- the routes ---------- */
  const answer = (u, t, extra) => Object.assign({ taskId: t.id, efficiency: block(u, liteTask(t.id)), task: forViewer(u, sz.readTask(db, t.id)) }, extra || {});
  function reasonOf(b, required, what) {
    const r = String((b && b.reason) || "").trim();
    if (r.length > 1000) throw new HttpError(413, "Text is too long: reason (max 1,000 characters)");
    if (required && !r) throw new HttpError(400, what);
    return r;
  }
  function qualityOf(b, s, approving) {
    const v = b && b.qualityScore;
    let q = null;
    if (v !== undefined && v !== null && v !== "") {
      q = typeof v === "number" ? v : /^\s*\d+(\.\d+)?\s*$/.test(String(v)) ? Number(v) : NaN;
      if (!Number.isFinite(q) || q < 1 || q > 5 || Math.round(q) !== q) throw new HttpError(400, "The quality score is a whole number from 1 to 5");
    }
    const min = s.bonus.minQuality;
    if (approving && min != null) {
      if (q === null) throw new HttpError(400, "Give a quality score from 1 to 5: this workspace approves a bonus from a score of " + min + ".");
      if (q < min) throw new HttpError(400, "The quality score " + q + " is under the " + min + " this workspace asks for: reject the bonus instead.");
    }
    return q;
  }
  /* never by someone who worked on the task (assigned or credited), admins included; never while acting as someone else */
  function mayReview(u, t, credited) {
    if (u.stakeholder) forbid(false, "review this task's efficiency bonus");
    if (u.impersonatedBy) throw new HttpError(403, "Efficiency bonuses are never approved or rejected while acting as someone else.");
    if (has(u, "scoring_approve_completion") && (isAssignee(u, t) || credited.indexOf(u.id) >= 0)) throw new HttpError(403, "You worked on this task (assigned to it or credited on it), so you cannot approve or reject its efficiency bonus.");
    forbid(can.scoringApproveCompletion(u, t, credited), "approve or reject this task's efficiency bonus");
  }
  /* the awards waiting for review, or why there is nothing to review */
  function waiting(t, b) {
    const rows = awardsOf(t.id), live = rows.filter(a => a.status !== "revoked");
    if (!live.length) throw new HttpError(409, "There is no efficiency award on this task yet.");
    if (b && b.calcKey !== undefined && b.calcKey !== null && String(b.calcKey) !== taskKey(rows)) throw new HttpError(409, "This task's efficiency award changed in the meantime. Look at it again and decide then.");
    const st = live.find(a => a.status !== "pending_review");
    if (st) throw new HttpError(409, st.status === "approved" ? "This efficiency bonus is already approved." : st.status === "rejected" ? "This efficiency bonus was already rejected." : st.status === "provisional" ? "This efficiency bonus is not waiting for review: the task is not completed yet." : "This efficiency bonus is not waiting for review: the task does not meet every condition (see why on the task).");
    return { rows, live };
  }

  route("POST", "/api/tasks/:id/efficiency/recalculate", (u, p) => {
    on();
    const t = taskOr404(p.id);
    forbid(!u.stakeholder && can.scoringSeesEfficiency(u, t, creditedOf(t, awardsOf(t.id))), "see this task's efficiency bonus");
    writable();
    const ev = evaluate(t.id, u, { via: "recalculate" });
    return answer(u, t, { changed: !!ev.changed });
  });

  route("POST", "/api/tasks/:id/efficiency/approve", (u, p, q, b, ctx) => {
    on();
    const t = taskOr404(p.id); b = isObj(b) ? b : {};
    mayReview(u, t, creditedOf(t, awardsOf(t.id)));
    const s = writable();
    const quality = qualityOf(b, s, true);
    evaluate(t.id, null, { via: "approve" });
    let out;
    tx(db, () => {
      const { rows, live } = waiting(t, b);
      const cur = {}; live.forEach(a => { cur[a.user_id] = r4((+a.share || 0) * 100); });
      let weights = null, adjusted = false;
      if (b.shares !== undefined && b.shares !== null) {
        if (!isObj(b.shares)) throw new HttpError(400, "Shares are given as {person: percent}");
        const ids = Object.keys(b.shares).sort(), want = live.map(a => a.user_id).sort();
        if (ids.join("|") !== want.join("|")) throw new HttpError(400, "Give a share for each person credited, and only for them");
        weights = {}; let total = 0;
        ids.forEach(id => { const v = typeof b.shares[id] === "number" ? b.shares[id] : Number(b.shares[id]); if (!Number.isFinite(v) || v < 0 || v > 100) throw new HttpError(400, "A share is a percentage from 0 to 100"); weights[id] = v; total += v; });
        if (Math.abs(total - 100) > 0.01) throw new HttpError(400, "The shares must add up to 100% (now " + r2(total) + "%)");
        adjusted = ids.some(id => Math.abs(weights[id] - cur[id]) > 0.005);
        if (!adjusted) weights = null;
      }
      const reason = reasonOf(b, adjusted, "Say why the shares change: a reason is required.");
      const B = r2(live.reduce((x, a) => x + (+a.base_points || 0), 0)), bonus = r2(live.reduce((x, a) => x + (+a.bonus_points || 0), 0));
      const alloc = weights ? share(B, bonus, weights) : null, at = now(), before = rows.map(snapAward);
      live.forEach(a => {
        const x = alloc ? alloc[a.user_id] : { share: a.share, base: a.base_points, bonus: a.bonus_points, awarded: a.awarded_points };
        const c = Object.assign({}, a, { share: x.share, base_points: x.base, bonus_points: x.bonus, awarded_points: x.awarded, status: "approved", reviewer_id: u.id, reviewed_at: at, review_note: reason || null, quality_score: quality });
        db.prepare("UPDATE task_efficiency_awards SET " + CONTENT.map(k => k + "=?").join(",") + ", calc_key=?, recalculated_at=? WHERE id=?").run(...CONTENT.map(k => (c[k] === undefined ? null : c[k])), keyOf(c), at, a.id);
      });
      /* the reviewer approving the award verifies the time it rests on */
      const ids = live.map(a => a.user_id);
      const verified = db.prepare("UPDATE task_time_entries SET verified=1, verified_by=?, verified_at=? WHERE task_id=? AND workspace_id=? AND deleted_at IS NULL AND source='manual' AND verified=0 AND user_id IN (" + ids.map(() => "?").join(",") + ")").run(u.id, at, t.id, WS_ID, ...ids).changes;
      const after = awardsOf(t.id).map(snapAward);
      scoring.audit({ taskId: t.id, module: "efficiency", action: "approved", actor: u.id, impersonatedBy: u.impersonatedBy, oldValue: before, newValue: after, reason,
        meta: { qualityScore: quality, sharesAdjusted: adjusted, sharesFrom: adjusted ? cur : null, sharesTo: adjusted ? weights : null, verifiedEntries: verified, base: B, bonus, earned: r2(B + bonus) } });
      touch(t.id);
      out = { awards: live.length, verified, bonus, base: B, adjusted };
    });
    security.log("scoring_award_approved", { userId: u.id, ip: ctx && ctx.ip, taskId: t.id, awards: out.awards, bonus: out.bonus, base: out.base, sharesAdjusted: out.adjusted || undefined, verifiedEntries: out.verified });
    return answer(u, t, { changed: true, approved: out.awards, verified: out.verified });
  });

  route("POST", "/api/tasks/:id/efficiency/reject", (u, p, q, b, ctx) => {
    on();
    const t = taskOr404(p.id); b = isObj(b) ? b : {};
    mayReview(u, t, creditedOf(t, awardsOf(t.id)));
    const s = writable();
    const reason = reasonOf(b, true, "Say why the bonus is rejected: a reason is required.");
    const quality = qualityOf(b, s, false);
    evaluate(t.id, null, { via: "reject" });
    let n = 0;
    tx(db, () => {
      const { rows, live } = waiting(t, b), at = now(), before = rows.map(snapAward);
      live.forEach(a => {
        const c = Object.assign({}, a, { bonus_points: 0, awarded_points: r2(+a.base_points || 0), status: "rejected", reviewer_id: u.id, reviewed_at: at, review_note: reason, quality_score: quality });
        db.prepare("UPDATE task_efficiency_awards SET " + CONTENT.map(k => k + "=?").join(",") + ", calc_key=?, recalculated_at=? WHERE id=?").run(...CONTENT.map(k => (c[k] === undefined ? null : c[k])), keyOf(c), at, a.id);
      });
      scoring.audit({ taskId: t.id, module: "efficiency", action: "rejected", actor: u.id, impersonatedBy: u.impersonatedBy, oldValue: before, newValue: awardsOf(t.id).map(snapAward), reason, meta: { qualityScore: quality } });
      touch(t.id); n = live.length;
    });
    security.log("scoring_award_rejected", { userId: u.id, ip: ctx && ctx.ip, taskId: t.id, awards: n });
    return answer(u, t, { changed: true, rejected: n });
  });

  /* ---------- the sweep: every 10 minutes (and soon after start) ---------- */
  const MARK = "scoring_awards_sweep_v1";
  function sweep() {
    const s = settings(); if (!activeIn(s)) return 0;
    const mark = parse((db.prepare("SELECT value FROM app_meta WHERE key=?").get(MARK) || {}).value, {}) || {}, since = mark.at || "", started = now();
    const ids = new Set(db.prepare("SELECT id FROM tasks WHERE workspace_id=? AND coalesce(updated_at,'') > ?").all(WS_ID, since).map(x => x.id));
    db.prepare("SELECT DISTINCT task_id FROM task_time_entries WHERE workspace_id=? AND (created_at > ? OR coalesce(edited_at,'') > ? OR coalesce(deleted_at,'') > ?)").all(WS_ID, since, since, since).forEach(x => ids.add(x.task_id));
    /* the policy changed (or the bonus was just turned on): every award, and every task that could have one */
    if (mark.configVersion !== s.configVersion) {
      db.prepare("SELECT DISTINCT task_id FROM task_efficiency_awards WHERE workspace_id=?").all(WS_ID).forEach(x => ids.add(x.task_id));
      db.prepare("SELECT s.task_id FROM task_scoring s WHERE s.workspace_id=? AND s.module='hours' AND s.status IN ('approved','locked','rebaseline_needed') AND EXISTS (SELECT 1 FROM task_time_entries e WHERE e.task_id=s.task_id AND e.source='manual' AND e.deleted_at IS NULL)").all(WS_ID).forEach(x => ids.add(x.task_id));
    }
    let changed = 0;
    ids.forEach(id => { try { if (evaluate(id, null, { via: "sweep" }).changed) changed++; } catch (e) { console.error("[scoring-awards] sweep " + id + ": " + (e && e.message)); } });
    db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)").run(MARK, JSON.stringify({ at: started, configVersion: s.configVersion }));
    if (changed) { bumpData(); console.log("[scoring-awards] sweep: " + changed + " task(s) with changed awards"); }
    return changed;
  }
  const run = () => { try { sweep(); } catch (e) { console.error("[scoring-awards] sweep: " + (e && e.message)); } };
  const first = setTimeout(run, 3000), every = setInterval(run, 10 * 60000);
  if (first.unref) first.unref(); if (every.unref) every.unref();

  return { evaluate: evaluateSafe, sweep, block };
};
module.exports.pure = { evaluateFacts, contributions, share, quarter, SENTENCES, RAISE_WINDOW_HOURS };
