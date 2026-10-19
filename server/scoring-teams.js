/* SMART SCORING ON THE TEAMS SCREEN (Oct 2026). docs/SMART-SCORING.md §5.3 (the teams route).

   The owner asked for the team to see its Smart Scoring numbers where it already looks at its workload: as bars under
   the effort-hours (utilization) bar of each team card, on a team's own page, and under each person's workload bar.
   This module works out those bars, over the last 4 weeks (today and the 28 days before it, the period the Analytics
   screen opens on), for every team and for the people the asker may see.

   - Points done against points planned, one bar per points module switched on — Story Points, Weighted Points, Assets
     produced (asset points). Planned = the final points of the tasks whose due date falls in the period, except those
     Declined; done = the points of those same tasks that were completed successfully (in a completed stage: Settings →
     Smart Scoring's completion stages, by default every closed stage but Declined — the analytics' rule). So done is
     never more than planned and the bar runs from 0 to 100 %. A task without a score in that module counts in neither
     and is told apart as "not scored". For a person, a shared task's story and weighted points are split equally
     among the people assigned (as velocity splits them); asset points are what the asset module credits each person
     with (server/scoring-assets.js credit() and ScoringEngine.assetPoints — the reports' crediting). Hours are no bar
     here: the utilization bar already is the hours.
   - Estimate accuracy (only while Effort Hours is on): of the tasks completed in the period with a verified pair — a
     locked estimate (approved, or frozen when work started) against an Actual logged in the time log with nothing from
     before it —, how many took within ±20 % of their estimate. The analytics' own helpers decide (estimateOf, actualOf,
     accuracy), so the numbers agree with GET /api/scoring/analytics. No verified pair: no share (null), never 0 %.
   A team's bars are its tasks' (the task's own team, as the analytics' team filter reads it); a person's bars are the
   tasks they are assigned to (and, for asset points, credited with), whatever their team.

   Who sees what: every member who is not a stakeholder sees every team's bars. Each person's own bars go to that
   person; the bars of a team's members go to the team's lead and to whoever holds scoring_view_analytics — or, when an
   admin sets Settings → Smart Scoring → Teams screen to "Everyone in the workspace" (teams.memberBars "everyone"), to
   every member. Nobody else's bars are sent at all. People are never sorted or ranked by these numbers. A stakeholder
   is refused; Smart Scoring switched off (on the server or in the workspace) answers 409.

   GET /api/scoring/teams → { from, to, weeks: 4, memberBars, modules: {story, weighted, assets, hours},
     teams: [{ id, bars }], people: { userId: { bars } } } — bars: { story?, weighted?, assets?: {done, planned, pct,
     notScored}, accuracy?: {tasks, within, share} }; pct and share are whole percentages (0–100) or null when there is
     nothing to divide by; points to 2 decimals. Read only: nothing is stored. Two queries (the tasks with their scores
     and logged time; the uploads the asset crediting reads) and three small ones (teams, memberships, people). The
     arithmetic is module.exports.pure (tests/scoring-sanity.test.js). */
const engine = require("../shared/scoring-engine");
const A = require("./scoring-analytics").pure;
/* the reports' crediting of assets — the asset module's own function (it reads nothing from the database) */
const assetCredit = require("./scoring-assets")(null, null, { route: () => {} }).credit;

const DAYS = 28, WEEKS = 4;
const MEMBER_BARS = ["self_and_leads", "everyone"];
const POINTS = ["story", "weighted", "assets"];

/* ---------- the arithmetic (pure) ---------- */
const r2 = x => engine.round2(+x || 0);
function addDays(day, n) { const d = new Date(day + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
/* the last 4 weeks: today and the 28 days before it */
function period(today) { return { from: addDays(today, -DAYS), to: today, weeks: WEEKS }; }
/* a whole percentage of done against planned: null with nothing planned; 100 only when all of it is done and 0 only
   when none of it is (99.6 % is not "all done", 0.3 % is not "nothing") */
function pct(done, planned) {
  done = +done || 0; planned = +planned || 0;
  if (!(planned > 0)) return null;
  if (done >= planned) return 100;
  if (!(done > 0)) return 0;
  return Math.min(99, Math.max(1, Math.round(done / planned * 100)));
}
function bar(done, planned, notScored) { const d = r2(Math.max(0, done)), p = r2(Math.max(0, planned)); return { done: Math.min(d, p), planned: p, pct: pct(Math.min(d, p), p), notScored: Math.max(0, notScored | 0) }; }
/* the share of the verified pairs within ±20 %, as the analytics count it */
function accuracyBar(pairs) { const a = A.accuracy(pairs); return { tasks: a.tasks, within: a.within, share: pct(a.within, a.tasks) }; }
/* who may see each person's bars: everyone (the admin's choice), or themselves, the lead of a team they are in and the
   analytics holders. people = the members who are not stakeholders; membersOf = {teamId: [userId]}; leads = the
   active teams the asker leads */
function visible(o) {
  const people = o.people || [];
  if (o.stakeholder) return [];
  if (o.mode === "everyone" || o.analytics) return people.slice();
  const seen = new Set(), out = [];
  const add = id => { if (!seen.has(id) && people.indexOf(id) >= 0) { seen.add(id); out.push(id); } };
  add(o.me);
  (o.leads || []).forEach(t => ((o.membersOf || {})[t] || []).forEach(add));
  return out;
}
/* every task's part in the bars, added up per team (the task's team) and per person. tasks: [{team, status,
   assignees, due, doneDay, story, weighted, title, assetCount, assetSplit, assetOk, uploaders, hours, estimatedMinutes,
   typedActual, time:{manual, legacy}}]; o: {from, to, stages, on:{story, weighted, assets, hours}, assets (settings)} */
function tally(tasks, o) {
  const teams = new Map(), people = new Map();
  const blank = () => ({ story: { done: 0, planned: 0, notScored: 0 }, weighted: { done: 0, planned: 0, notScored: 0 }, assets: { done: 0, planned: 0, notScored: 0 }, pairs: [] });
  const of = (map, id) => { if (!map.has(id)) map.set(id, blank()); return map.get(id); };
  const inside = day => !!day && day >= o.from && day <= o.to;
  (tasks || []).forEach(t => {
    const done = (o.stages || []).indexOf(t.status) >= 0, who = t.assignees || [];
    const team = t.team ? of(teams, t.team) : null;
    if (inside(t.due) && t.status !== "declined") {
      ["story", "weighted"].forEach(m => {
        if (!o.on[m]) return;
        const v = +t[m] > 0 ? +t[m] : null;
        if (team) { const x = team[m]; if (v === null) x.notScored++; else { x.planned += v; if (done) x.done += v; } }
        who.forEach(id => { const x = of(people, id)[m]; if (v === null) x.notScored++; else { x.planned += v / who.length; if (done) x.done += v / who.length; } });
      });
      if (o.on.assets) {
        const c = assetCredit({ assetCount: t.assetCount, meta: { assetSplit: t.assetSplit }, uploaders: t.uploaders || [], assignees: who });
        const r = engine.assetPoints(o.assets, { kind: engine.kindOf(t.title), split: c.by, validated: t.assetOk });
        const ids = Object.keys(r.perPerson);
        if (!(+t.assetCount > 0) || !ids.length) {
          if (team) team.assets.notScored++;
          who.forEach(id => { of(people, id).assets.notScored++; });
        } else {
          const total = ids.reduce((n, id) => n + r.perPerson[id].points, 0);
          if (team) { team.assets.planned += total; if (done) team.assets.done += total; }
          ids.forEach(id => { const x = of(people, id).assets, p = r.perPerson[id].points; x.planned += p; if (done) x.done += p; });
        }
      }
    }
    if (o.on.hours && done && inside(t.doneDay)) {
      const e = A.estimateOf(t.hours, t.estimatedMinutes), a = A.actualOf(t.time, t.typedActual);
      if (e && a && e.basis === "locked" && a.basis === "logged") {
        const pair = { estimate: e.value, actual: a.value };
        if (team) team.pairs.push(pair);
        who.forEach(id => { of(people, id).pairs.push(pair); });
      }
    }
  });
  return { teams, people };
}
/* the bars of one team or person, only those of the modules switched on */
function barsOf(x, on) {
  const out = {};
  POINTS.forEach(m => { if (on[m]) out[m] = x ? bar(x[m].done, x[m].planned, x[m].notScored) : bar(0, 0, 0); });
  if (on.hours) out.accuracy = accuracyBar(x ? x.pairs : []);
  return out;
}
const pure = { DAYS, WEEKS, MEMBER_BARS, period, pct, bar, accuracyBar, visible, tally, barsOf };

module.exports = function scoringTeams(db, WS_ID, d) {
  const { route, HttpError, forbid, can, scoring } = d;
  const J = (v, dflt) => { if (v == null || v === "") return dflt; if (typeof v === "object") return v; try { return JSON.parse(v); } catch (e) { return dflt; } };

  /* the stages a task is completed in: the list set in Smart Scoring, else every closed stage but Declined (as the
     analytics and the asset points read it) */
  function completionStages(s) {
    const closed = db.prepare("SELECT id FROM task_statuses WHERE workspace_id=? AND is_completed=1 ORDER BY sort_order").all(WS_ID).map(r => r.id);
    const list = s && s.bonus && Array.isArray(s.bonus.completionStages) ? s.bonus.completionStages : null;
    return list ? closed.filter(id => list.includes(id)) : closed.filter(id => id !== "declined");
  }
  /* the tasks the bars are made of: due in the period (planned), or completed in it (the accuracy) — one query with
     their scores and logged time, and one for the uploads the asset crediting reads */
  function tasksOf(f, on) {
    const meta = k => "CASE WHEN json_valid(t.meta) THEN json_extract(t.meta,'$." + k + "') END";
    const done = f.stages.length ? " OR (t.completed_at IS NOT NULL AND substr(t.completed_at,1,10) >= ? AND substr(t.completed_at,1,10) <= ? AND t.status_id IN (" + f.stages.map(() => "?").join(",") + "))" : "";
    const where = "t.workspace_id=? AND ((t.due_date IS NOT NULL AND substr(t.due_date,1,10) >= ? AND substr(t.due_date,1,10) <= ? AND t.status_id<>'declined')" + done + ")";
    const params = [WS_ID, f.from, f.to].concat(f.stages.length ? [f.from, f.to].concat(f.stages) : []);
    const logged = src => "(SELECT sum(e.minutes) FROM task_time_entries e WHERE e.task_id=t.id AND e.deleted_at IS NULL AND e.kind<>'blocked' AND e.source" + src + ")";
    const rows = db.prepare("SELECT t.id, t.title, t.team_id, t.status_id, t.assignee_id, t.assignees, t.asset_count, t.estimated_minutes, substr(t.due_date,1,10) AS due, substr(t.completed_at,1,10) AS done_day, "
      + "ss.final_value AS story, ws.final_value AS weighted, hs.status AS h_status, hs.source AS h_source, hs.final_value AS h_final, hs.locked_value AS h_locked, "
      + meta("actualEffort") + " AS typed_actual, " + meta("assetSplit") + " AS asset_split, " + meta("assetSplitOk") + " AS asset_ok, "
      + (on.hours ? logged("<>'legacy'") + " AS tm_manual, " + logged("='legacy'") + " AS tm_legacy " : "NULL AS tm_manual, NULL AS tm_legacy ")
      + "FROM tasks t LEFT JOIN task_scoring ss ON ss.task_id=t.id AND ss.module='story' LEFT JOIN task_scoring ws ON ws.task_id=t.id AND ws.module='weighted' "
      + "LEFT JOIN task_scoring hs ON hs.task_id=t.id AND hs.module='hours' WHERE " + where + " ORDER BY t.id").all(...params);
    const ups = new Map();
    if (on.assets && rows.some(r => +r.asset_count > 0))
      db.prepare("SELECT task_id, uploaded_by FROM file_versions WHERE task_id IN (SELECT t.id FROM tasks t WHERE t.asset_count > 0 AND " + where + ") ORDER BY task_id, version_number").all(...params)
        .forEach(v => { if (!ups.has(v.task_id)) ups.set(v.task_id, []); ups.get(v.task_id).push(v.uploaded_by); });
    return rows.map(r => {
      const a = J(r.assignees, []), assignees = Array.isArray(a) ? a.filter(x => typeof x === "string" && x) : [];
      if (r.assignee_id && assignees.indexOf(r.assignee_id) < 0) assignees.unshift(r.assignee_id);
      return { id: r.id, title: r.title, team: r.team_id, status: r.status_id, assignees, due: r.due, doneDay: r.done_day,
        story: r.story, weighted: r.weighted, assetCount: +r.asset_count || 0, assetSplit: J(r.asset_split, null), assetOk: J(r.asset_ok, null), uploaders: ups.get(r.id) || [],
        hours: r.h_status ? { status: r.h_status, source: r.h_source, final: r.h_final, locked: r.h_locked } : null,
        estimatedMinutes: +r.estimated_minutes || 0, typedActual: +r.typed_actual || 0, time: { manual: +r.tm_manual || 0, legacy: +r.tm_legacy || 0 } };
    });
  }

  function answer(u) {
    if (!scoring.featureOn()) throw new HttpError(409, "Smart Scoring is turned off on this server");
    forbid(u && !u.stakeholder, "see Smart Scoring on the Teams screen");
    const s = scoring.settings();
    if (!s.enabled) throw new HttpError(409, "Smart Scoring is turned off in this workspace");
    const mod = id => !!(s.modules[id] && s.modules[id].on);
    const on = { story: mod("story"), weighted: mod("weighted"), assets: mod("assets"), hours: mod("hours") };
    const mode = s.teams && MEMBER_BARS.indexOf(s.teams.memberBars) >= 0 ? s.teams.memberBars : MEMBER_BARS[0];
    const f = Object.assign(period(new Date().toISOString().slice(0, 10)), { stages: completionStages(s) });
    const teams = db.prepare("SELECT id, team_lead_id AS lead FROM teams WHERE workspace_id=? AND coalesce(is_archived,0)=0 ORDER BY sort_order, id").all(WS_ID);
    const membersOf = {};
    db.prepare("SELECT m.team_id, m.user_id FROM team_memberships m JOIN teams t ON t.id=m.team_id WHERE t.workspace_id=? AND coalesce(t.is_archived,0)=0").all(WS_ID)
      .forEach(r => { (membersOf[r.team_id] = membersOf[r.team_id] || []).push(r.user_id); });
    const people = db.prepare("SELECT user_id AS id FROM workspace_members WHERE workspace_id=? AND coalesce(pending,0)=0 AND coalesce(is_stakeholder,0)=0 ORDER BY user_id").all(WS_ID).map(r => r.id);
    const shown = visible({ me: u.id, mode, analytics: can.scoringViewAnalytics(u), people, membersOf, leads: teams.filter(t => t.lead === u.id).map(t => t.id) });
    const sum = tally(tasksOf(f, on), { from: f.from, to: f.to, stages: f.stages, on, assets: s.assets });
    const out = { from: f.from, to: f.to, weeks: WEEKS, memberBars: mode, modules: on, teams: teams.map(t => ({ id: t.id, bars: barsOf(sum.teams.get(t.id), on) })), people: {} };
    shown.forEach(id => { out.people[id] = { bars: barsOf(sum.people.get(id), on) }; });
    return out;
  }
  route("GET", "/api/scoring/teams", u => answer(u));
  return { answer };
};
module.exports.pure = pure;
