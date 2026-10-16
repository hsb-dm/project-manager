/* SMART SCORING — POINTS FOR THE ASSETS PEOPLE PRODUCE (Oct 2026). docs/SMART-SCORING.md §11

   ZenCrevia already counts the assets each person produced on a task: the counts typed per person under Assets &
   versions (meta.assetSplit, whole numbers, the task's "Assets produced" their sum), validated by a team's lead
   (meta.assetSplitOk), and credited in every report by the same rule (src/export.js taskAssetCredit): the counts typed
   per person first; else whoever uploaded the versions, in proportion to how many each uploaded; else the people
   assigned, shared equally — and then the number is an estimate and says so. Asset points turn those counts into
   output points, per kind of work: one feed post is 1 point, a resize 0.25, a logo 5 (ScoringEngine.assetPoints,
   with the workspace's table in Settings → Smart Scoring). They are their own figure, apart from hours, base points
   and the efficiency bonus, and never the base of that bonus.

   GET /api/scoring/assets?from&to&team&person&project answers, per person: the assets and the points, how much of
   it a lead has validated, how much is not validated yet and how much was changed since it was validated, by kind of
   work and by week. Which tasks count: those completed in the period — by the date they were completed
   (completed_at), in a completed stage (Settings → Smart Scoring's completion stages; by default every closed stage
   but Declined: a declined task produced nothing anyone used). Work still open is not counted yet; it counts in the
   week it is completed. team and project choose tasks (the task's team; its project or one of the others it is in),
   person chooses the row. The kind of work is read from the task's title, as the estimator reads it.

   Whoever holds scoring_view_analytics sees everyone's rows; anyone else only their own (asking for someone else's
   is refused). People are listed in name order — never ranked. The module off (or Smart Scoring, or the server's
   feature) answers 409 with what is off. Read only: nothing is stored, every answer is worked out from the tasks as
   they are, so a count changed or validated shows at once. */
const engine = require("../shared/scoring-engine");

module.exports = function scoringAssets(db, WS_ID, d) {
  const { route, HttpError, forbid, can, scoring } = d;
  const DAY = /^\d{4}-\d{2}-\d{2}$/, ID = /^[-\w.@]{1,80}$/;
  const parse = (v, dflt) => { if (v == null || v === "") return dflt; try { return JSON.parse(v); } catch (e) { return dflt; } };
  const r2 = x => engine.round2(x);

  /* the counts typed per person, whole numbers above zero; null when there are none (src/export.js taskAssetSplit) */
  function typedSplit(meta) {
    const s = meta && meta.assetSplit; if (!s || typeof s !== "object") return null;
    const out = {}; let n = 0;
    Object.keys(s).forEach(id => { const v = Math.max(0, Math.round(+s[id] || 0)); if (v) { out[id] = v; n += v; } });
    return n ? out : null;
  }
  /* who is credited with a task's assets — the reports' rule (src/export.js taskAssetCredit), on the stored task:
     {by: {userId: count}, exact, how: "split" | "uploads" | "assignees" | ""} */
  function credit(t) {
    const total = +t.assetCount || 0;
    if (!total) return { by: {}, exact: true, how: "" };
    const by = {}, add = (id, n) => { if (!id) return; by[id] = (by[id] || 0) + n; };
    const split = typedSplit(t.meta);
    if (split) { Object.keys(split).forEach(id => add(id, split[id])); return { by, exact: true, how: "split" }; }
    const creators = (t.uploaders || []).filter(Boolean);
    if (creators.length) {
      const tally = {}; let n = 0;
      creators.forEach(id => { tally[id] = (tally[id] || 0) + 1; n++; });
      Object.keys(tally).forEach(id => add(id, total * tally[id] / n));
      return { by, exact: true, how: "uploads" };
    }
    const owners = (t.assignees || []).filter(Boolean);
    if (!owners.length) return { by: {}, exact: false, how: "assignees" };
    owners.forEach(id => add(id, total / owners.length));
    return { by, exact: false, how: "assignees" };
  }
  /* the stages a task is completed in: the list set in Smart Scoring, else every closed stage but Declined */
  function completionStages(s) {
    const closed = db.prepare("SELECT id FROM task_statuses WHERE workspace_id=? AND is_completed=1 ORDER BY sort_order").all(WS_ID).map(r => r.id);
    const list = s && s.bonus && Array.isArray(s.bonus.completionStages) ? s.bonus.completionStages : null;
    return list ? closed.filter(id => list.includes(id)) : closed.filter(id => id !== "declined");
  }
  /* the Monday of the week a date is in (UTC), as YYYY-MM-DD */
  function weekOf(iso) {
    const day = new Date(String(iso || "").slice(0, 10) + "T00:00:00Z");
    if (isNaN(day.getTime())) return null;
    day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
    return day.toISOString().slice(0, 10);
  }
  /* the completed tasks of the period, with what the crediting needs: one query for the tasks, one for the uploads */
  function tasksOf(s, f) {
    const stages = completionStages(s); if (!stages.length) return { stages, tasks: [] };
    let where = "t.workspace_id=? AND t.completed_at IS NOT NULL AND t.asset_count > 0 AND t.status_id IN (" + stages.map(() => "?").join(",") + ")";
    const params = [WS_ID, ...stages];
    if (f.from) { where += " AND substr(t.completed_at,1,10) >= ?"; params.push(f.from); }
    if (f.to) { where += " AND substr(t.completed_at,1,10) <= ?"; params.push(f.to); }
    if (f.team) { where += " AND t.team_id = ?"; params.push(f.team); }
    const rows = db.prepare("SELECT t.id, t.title, t.team_id, t.project_id, t.extra_projects, t.assignee_id, t.assignees, t.asset_count, t.meta, t.completed_at FROM tasks t WHERE " + where + " ORDER BY t.completed_at, t.id").all(...params);
    const ups = new Map();
    if (rows.length) db.prepare("SELECT task_id, uploaded_by FROM file_versions WHERE task_id IN (SELECT t.id FROM tasks t WHERE " + where + ") ORDER BY task_id, version_number").all(...params)
      .forEach(v => { if (!ups.has(v.task_id)) ups.set(v.task_id, []); ups.get(v.task_id).push(v.uploaded_by); });
    const tasks = rows.map(t => {
      const assignees = parse(t.assignees, []); const a = Array.isArray(assignees) ? assignees.slice() : [];
      if (t.assignee_id && a.indexOf(t.assignee_id) < 0) a.unshift(t.assignee_id);
      const extra = parse(t.extra_projects, []);
      return { id: t.id, title: t.title, team: t.team_id, proj: t.project_id, alsoIn: Array.isArray(extra) ? extra : [], assignees: a, assetCount: t.asset_count || 0,
        meta: parse(t.meta, {}) || {}, completedAt: t.completed_at, uploaders: ups.get(t.id) || [] };
    }).filter(t => !f.project || t.proj === f.project || t.alsoIn.includes(f.project));
    return { stages, tasks };
  }
  const bucket = () => ({ assets: 0, points: 0 });
  const addTo = (b, assets, points) => { b.assets += assets; b.points += points; };
  const done = b => ({ assets: r2(b.assets), points: r2(b.points) });
  function row(id, name) { return { userId: id, name, raw: 0, points: 0, tasks: 0, validated: bucket(), notValidated: bucket(), changed: bucket(), attributed: false, typed: false, uploads: false, byKind: {}, byWeek: {} }; }
  function finish(p) {
    const map = o => { const out = {}; Object.keys(o).sort().forEach(k => { out[k] = done(o[k]); }); return out; };
    return { userId: p.userId, name: p.name, assets: Math.round(p.raw), assetsExact: r2(p.raw), points: r2(p.points), tasks: p.tasks,
      validated: done(p.validated), notValidated: done(p.notValidated), changed: done(p.changed),
      attributed: p.attributed, typed: p.typed, uploads: p.uploads, byKind: map(p.byKind), byWeek: map(p.byWeek) };
  }
  function on() {
    if (!scoring.featureOn()) throw new HttpError(409, "Smart Scoring is turned off on this server");
    const s = scoring.settings();
    if (!s.enabled) throw new HttpError(409, "Smart Scoring is switched off for this workspace");
    if (!s.modules.assets || !s.modules.assets.on) throw new HttpError(409, "Points for assets produced are switched off. They are turned on in Settings → Smart Scoring.");
    return s;
  }

  route("GET", "/api/scoring/assets", (u, p, q) => {
    const s = on();
    q = q || {};
    const f = {};
    ["from", "to"].forEach(k => { if (q[k] == null || q[k] === "") return; if (!DAY.test(String(q[k])) || isNaN(new Date(q[k] + "T00:00:00Z").getTime())) throw new HttpError(400, "from and to are dates (YYYY-MM-DD)"); f[k] = String(q[k]); });
    if (f.from && f.to && f.from > f.to) throw new HttpError(400, "The period ends before it starts");
    ["team", "project", "person"].forEach(k => { if (q[k] == null || q[k] === "") return; if (!ID.test(String(q[k]))) throw new HttpError(400, "Unknown " + k); f[k] = String(q[k]); });
    const all = can.scoringViewAnalytics(u);
    if (!all) forbid(!f.person || f.person === u.id, "see other people's asset points");
    const only = all ? f.person || null : u.id;
    const names = {};
    db.prepare("SELECT u.id, u.name FROM workspace_members wm JOIN users u ON u.id=wm.user_id WHERE wm.workspace_id=?").all(WS_ID).forEach(r => { names[r.id] = r.name || r.id; });
    const { stages, tasks } = tasksOf(s, f), people = new Map();
    const get = id => { if (!people.has(id)) people.set(id, row(id, names[id] || id)); return people.get(id); };
    if (only) get(only);
    let counted = 0;
    tasks.forEach(t => {
      const c = credit(t), kind = engine.kindOf(t.title), week = weekOf(t.completedAt);
      const r = engine.assetPoints(s.assets, { kind, split: c.by, validated: t.meta.assetSplitOk });
      let mine = false;
      Object.keys(r.perPerson).forEach(id => {
        if (only && id !== only) return;
        const x = r.perPerson[id], pr = get(id), n = c.by[id];
        mine = true; pr.raw += n; pr.points += x.points; pr.tasks++;
        if (!c.exact) pr.attributed = true; else if (c.how === "split") pr.typed = true; else pr.uploads = true;
        addTo(x.validated ? pr.validated : x.changedSinceValidation ? pr.changed : pr.notValidated, n, x.points);
        const k = kind || "unknown"; addTo(pr.byKind[k] = pr.byKind[k] || bucket(), n, x.points);
        if (week) addTo(pr.byWeek[week] = pr.byWeek[week] || bucket(), n, x.points);
      });
      if (mine) counted++;
    });
    /* name order, never a ranking */
    const list = [...people.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)) || (a.userId < b.userId ? -1 : 1)).map(finish);
    const raw = [...people.values()].reduce((n, x) => n + x.raw, 0);
    return {
      scope: all ? "everyone" : "own", from: f.from || null, to: f.to || null, team: f.team || null, project: f.project || null, person: only,
      rule: "completed_in_period", stages, countUnvalidated: s.assets.countUnvalidated, perKind: s.assets.perKind, unknownKind: s.assets.unknownKind,
      people: list,
      total: { assets: Math.round(raw), assetsExact: r2(raw), points: r2(list.reduce((n, x) => n + x.points, 0)), tasks: counted, people: list.filter(x => x.tasks > 0).length }
    };
  });

  return { credit, weekOf };
};
