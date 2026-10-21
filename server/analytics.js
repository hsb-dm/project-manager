// Analytics are queries over the same tables the views use (§58, §65). Nothing is precomputed or duplicated.
/* Oct 2026 (performance): this used to ask the database about eight times per week shown — every task row read
   again for each of them, julianday() worked out on each — and to walk every task once per person per team for the
   hours. 26 weeks at 1,500 tasks held the server for a quarter of a second. Now each table is read once for all the
   weeks and every row is placed in its week here; the per-person hours are added up once. The answer is the same,
   number for number: timestamps are still compared as SQLite's julianday() sees them (some are stored with a space,
   some with a T and a Z, so comparing the text would not do), and each average is still SQLite's own, over the same
   rows in the same order. tests/analytics-equivalence.test.js runs the version before this one beside it. */
function monday(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
const iso = (d) => d.toISOString();
const localDate = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

/* the people the figures need — not readPeople(), which also reads every photo — in the order readPeople() keeps */
function teamPeople(db, wsId) {
  const out = {};
  db.prepare("SELECT u.id, m.capacity_hours, m.is_stakeholder FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND coalesce(m.pending,0)=0 ORDER BY u.name").all(wsId)
    .forEach(r => { out[r.id] = { cap: r.capacity_hours, stakeholder: !!r.is_stakeholder, teams: [] }; });
  db.prepare("SELECT tm.user_id, tm.team_id, tm.is_primary FROM team_memberships tm WHERE tm.user_id IN (SELECT user_id FROM workspace_members WHERE workspace_id=?)").all(wsId)
    .forEach(r => { const p = Object.prototype.hasOwnProperty.call(out, r.user_id) ? out[r.user_id] : null; if (p) p.teams.push([r.team_id, !!r.is_primary]); });
  return out;
}
/* a number as SQLite's sum() takes it */
const num = v => typeof v === "number" ? v : (Number(v) || 0);

function compute(db, wsId, nWeeks, toDate) {
  const n = Math.max(1, Math.min(52, nWeeks || 8));
  const end = toDate ? new Date(toDate + "T12:00:00") : new Date();
  const start = monday(end); start.setDate(start.getDate() - 7 * (n - 1));
  const weeks = []; for (let i = 0; i < n; i++) { const a = new Date(start); a.setDate(start.getDate() + 7 * i); const b = new Date(a); b.setDate(a.getDate() + 7); weeks.push({ label: MO[a.getMonth()] + " " + a.getDate(), a: iso(a), b: iso(b), aDate: a, bDate: b }); }
  const first = weeks[0].a, last = weeks[n - 1].b;
  /* each week's bounds as julianday() gives them, so a row lands in the week the SQL comparison put it in */
  const jd = db.prepare("SELECT julianday(?) AS j");
  const A = weeks.map(w => jd.get(w.a).j), B = weeks.map(w => jd.get(w.b).j);
  const tally = (values) => { const out = weeks.map(() => 0); for (const j of values) { if (j == null) continue; for (let i = 0; i < n; i++) if (j >= A[i] && j < B[i]) out[i]++; } return out; };
  /* one avg() per week over a single read of the rows: the same rows, in the same order, as one query per week */
  const avgCols = (expr, at) => weeks.map((w, i) => "avg(CASE WHEN " + at + ">=julianday(?) AND " + at + "<julianday(?) THEN " + expr + " END) AS w" + i).join(", ");
  const bounds = () => weeks.reduce((p, w) => { p.push(w.a, w.b); return p; }, []);
  const perWeek = row => weeks.map((w, i) => row ? row["w" + i] : null);

  const stamps = db.prepare("SELECT julianday(created_at) AS jc, julianday(completed_at) AS jd FROM tasks WHERE workspace_id=?").all(wsId);
  const created = tally(stamps.map(r => r.jc));
  const completed = tally(stamps.map(r => r.jd));
  const overdue = (() => {
    const aD = weeks.map(w => localDate(w.aDate)), bD = weeks.map(w => localDate(w.bDate)), out = weeks.map(() => 0);
    db.prepare("SELECT due_date FROM tasks WHERE workspace_id=? AND due_date>=? AND due_date<? AND (completed_at IS NULL OR date(completed_at)>due_date)").all(wsId, aD[0], bD[n - 1])
      .forEach(r => { const d = r.due_date; for (let i = 0; i < n; i++) if (d >= aD[i] && d < bD[i]) out[i]++; });
    return out;
  })();
  const avgDays = perWeek(db.prepare("WITH t AS MATERIALIZED (SELECT julianday(completed_at) AS jd, julianday(created_at) AS jc FROM tasks WHERE workspace_id=? AND julianday(completed_at)>=julianday(?) AND julianday(completed_at)<julianday(?) AND julianday(completed_at)>=julianday(created_at)) SELECT " + avgCols("jd-jc", "jd") + " FROM t")
    .get(wsId, first, last, ...bounds())).map(r => r == null ? null : Math.round(r * 10) / 10);
  const versions = tally(db.prepare("SELECT julianday(fv.created_at) AS j FROM file_versions fv JOIN tasks t ON t.id=fv.task_id WHERE t.workspace_id=?").all(wsId).map(r => r.j));
  const revisions = tally(db.prepare("SELECT julianday(rr.created_at) AS j FROM revision_requests rr JOIN tasks t ON t.id=rr.task_id WHERE t.workspace_id=?").all(wsId).map(r => r.j));
  const revisionRate = weeks.map((w, i) => { const v = versions[i], r = revisions[i]; return v ? Math.round(r / v * 100) / 100 : null; });
  const approvalHrs = perWeek(db.prepare("WITH x AS MATERIALIZED (SELECT julianday(ap.created_at) AS ja, julianday(fv.created_at) AS jf FROM approvals ap JOIN file_versions fv ON fv.id=ap.version_id JOIN tasks t ON t.id=ap.task_id WHERE t.workspace_id=? AND julianday(ap.created_at)>=julianday(?) AND julianday(ap.created_at)<julianday(?)) SELECT " + avgCols("(ja-jf)*24", "ja") + " FROM x")
    .get(wsId, first, last, ...bounds())).map(r => r == null ? null : Math.round(r));
  // time in status: walk 'moved' activity per task
  const statuses = db.prepare("SELECT id, name FROM task_statuses WHERE workspace_id=? AND is_archived=0 ORDER BY sort_order").all(wsId);
  const bucket = {}; statuses.forEach(s => bucket[s.id] = []);
  const rows = db.prepare("SELECT entity_id task_id, payload, created_at FROM activity_logs WHERE workspace_id=? AND action='moved' AND entity_type='task' ORDER BY entity_id, created_at").all(wsId);
  let prev = null;
  for (const r of rows) { let p; try { p = JSON.parse(r.payload); } catch { continue; } if (prev && prev.task_id === r.task_id && prev.to && bucket[prev.to]) bucket[prev.to].push((new Date(r.created_at) - new Date(prev.created_at)) / 86400000); prev = { task_id: r.task_id, to: p.to, created_at: r.created_at }; }
  const timeInStatus = statuses.map(s => ({ id: s.id, name: s.name, days: bucket[s.id].length ? Math.round(avg(bucket[s.id]) * 10) / 10 : null, samples: bucket[s.id].length }));
  const people = teamPeople(db, wsId);
  const tasks = db.prepare("SELECT k.team_id, k.assignee_id, k.assignees, k.estimated_minutes, s.is_completed FROM tasks k JOIN task_statuses s ON s.id=k.status_id LEFT JOIN projects p ON p.id=k.project_id WHERE k.workspace_id=? AND (p.id IS NULL OR p.status!='archived')").all(wsId);
  const assignedTo = (t) => {let a=[];try{a=JSON.parse(t.assignees||"[]");}catch{}if(t.assignee_id&&!a.includes(t.assignee_id))a.unshift(t.assignee_id);return [...new Set(a.filter(Boolean))];};
  /* who a task is assigned to, worked out once per task (it was once per task for every person of every team) */
  const ids = new Map(), idsOf = t => { let v = ids.get(t); if (!v) { v = assignedTo(t); ids.set(t, v); } return v; };
  /* each person's share of the open hours, added up once, task by task in the same order as before */
  let shares = null;
  const hours = id => {
    if (!shares) { const s = new Map(); tasks.forEach(t => { if (t.is_completed) return; const who = idsOf(t); who.forEach(x => s.set(x, (s.has(x) ? s.get(x) : 0) + (t.estimated_minutes || 0) / 60 / who.length)); }); shares = s; }
    return Math.round(shares.has(id) ? shares.get(id) : 0);
  };
  const byTeam = db.prepare("SELECT id,name,color FROM teams WHERE workspace_id=? AND is_archived=0 ORDER BY sort_order").all(wsId).map(t=>{
    const members=Object.keys(people).filter(id=>!people[id].stakeholder&&(people[id].teams||[]).some(x=>x[0]===t.id));
    /* a team's tasks: its own, and other teams' tasks its people are assigned to (each keeps its team) */
    const inTeam=new Set(Object.keys(people).filter(id=>(people[id].teams||[]).some(x=>x[0]===t.id))), involves=k=>k.team_id===t.id||idsOf(k).some(id=>inTeam.has(id));
    const capacity=members.reduce((n,id)=>n+(people[id].cap||0),0),assigned=members.reduce((n,id)=>n+hours(id),0),open=tasks.filter(k=>involves(k)&&!k.is_completed);
    return {id:t.id,name:t.name,color:t.color,open:open.length,workloadHours:open.reduce((n,k)=>n+(k.estimated_minutes||0)/60,0),completed:tasks.filter(k=>involves(k)&&k.is_completed).length,capacity,assigned,utilization:capacity?Math.round(assigned/capacity*100):0};
  });
  const today = localDate(new Date());
  /* the open tasks once, for every project (a task shared by two projects counts in both) */
  const openTasks = db.prepare("SELECT k.project_id, coalesce(k.extra_projects,'') AS extra, k.estimated_minutes AS m, k.due_date FROM tasks k JOIN task_statuses s ON s.id=k.status_id WHERE s.is_completed=0").all();
  const byProject = db.prepare("SELECT id, name, progress, due_date FROM projects WHERE workspace_id=? AND status NOT IN ('done','archived') ORDER BY sort_order").all(wsId).map(p => {
    const mark = p.id == null ? null : '"' + p.id + '"';
    const open = { n: 0, m: 0 }; let over = 0;
    if (mark !== null) openTasks.forEach(k => { if (k.project_id !== p.id && String(k.extra).indexOf(mark) < 0) return; open.n++; if (k.m != null) open.m += num(k.m); if (k.due_date != null && k.due_date < today) over++; });
    const daysLeft = p.due_date ? Math.round((new Date(p.due_date) - new Date(today)) / 86400000) : null;
    const risk = over > 0 || (daysLeft != null && daysLeft < 0) ? "high" : (daysLeft != null && daysLeft <= 7 && p.progress < 70) ? "medium" : "low";
    return { id: p.id, name: p.name, progress: p.progress, remainingHours: Math.round(open.m / 60), open: open.n, overdue: over, daysLeft, risk };
  });
  return { weeks: weeks.map(w => w.label), created, completed, overdue, avgDays, revisionRate, approvalHrs, timeInStatus, byTeam, byProject };
}
module.exports = { compute };
