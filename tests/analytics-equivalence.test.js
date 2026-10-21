/* Analytics, faster (Oct 2026). server/analytics.js used to ask the database about eight times for every week shown,
   reading every task again each time, and to walk every task once per person per team for the hours. It now reads
   each table once for all the weeks. Its answer must not change by a single number, so the version before it is kept
   below, verbatim, and both run on the same databases — the demo, then the demo grown past 1,500 tasks whose
   timestamps come in every form the app stores (a T and a Z from the browser and the server, a space from SQLite's
   own defaults, an offset, a bare date, none), some exactly on a week's edge — for 8, 26 and 52 weeks, and again with
   other indexes and planner statistics. And the work no longer grows with the number of weeks. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-analytics-'));
process.env.COS_DATA_DIR = temp;
const { open } = require('../server/db');
const seed = require('../server/seed');
const analytics = require('../server/analytics');
const demo = require('../shared/demo-data');
const db = open();
test.after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

/* ---------- server/analytics.js as it was (4e0739f), kept only here ---------- */
function monday(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
const iso = (d) => d.toISOString();
const localDate = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

function computeBefore(db, wsId, nWeeks, toDate) {
  const n = Math.max(1, Math.min(52, nWeeks || 8));
  const end = toDate ? new Date(toDate + "T12:00:00") : new Date();
  const start = monday(end); start.setDate(start.getDate() - 7 * (n - 1));
  const weeks = []; for (let i = 0; i < n; i++) { const a = new Date(start); a.setDate(start.getDate() + 7 * i); const b = new Date(a); b.setDate(a.getDate() + 7); weeks.push({ label: MO[a.getMonth()] + " " + a.getDate(), a: iso(a), b: iso(b), aDate: a, bDate: b }); }
  const q = (sql, ...p) => db.prepare(sql).get(...p);
  const created = weeks.map(w => q("SELECT count(*) n FROM tasks WHERE workspace_id=? AND julianday(created_at)>=julianday(?) AND julianday(created_at)<julianday(?)", wsId, w.a, w.b).n);
  const completed = weeks.map(w => q("SELECT count(*) n FROM tasks WHERE workspace_id=? AND julianday(completed_at)>=julianday(?) AND julianday(completed_at)<julianday(?)", wsId, w.a, w.b).n);
  const overdue = weeks.map(w => { const d = localDate(w.bDate); return q("SELECT count(*) n FROM tasks WHERE workspace_id=? AND due_date>=? AND due_date<? AND (completed_at IS NULL OR date(completed_at)>due_date)", wsId, localDate(w.aDate), d).n; });
  const avgDays = weeks.map(w => { const r = q("SELECT avg((julianday(completed_at)-julianday(created_at))) d FROM tasks WHERE workspace_id=? AND julianday(completed_at)>=julianday(?) AND julianday(completed_at)<julianday(?) AND julianday(completed_at)>=julianday(created_at)", wsId, w.a, w.b).d; return r == null ? null : Math.round(r * 10) / 10; });
  const revisionRate = weeks.map(w => { const v = q("SELECT count(*) n FROM file_versions fv JOIN tasks t ON t.id=fv.task_id WHERE t.workspace_id=? AND julianday(fv.created_at)>=julianday(?) AND julianday(fv.created_at)<julianday(?)", wsId, w.a, w.b).n; const r = q("SELECT count(*) n FROM revision_requests rr JOIN tasks t ON t.id=rr.task_id WHERE t.workspace_id=? AND julianday(rr.created_at)>=julianday(?) AND julianday(rr.created_at)<julianday(?)", wsId, w.a, w.b).n; return v ? Math.round(r / v * 100) / 100 : null; });
  const approvalHrs = weeks.map(w => { const r = q("SELECT avg((julianday(ap.created_at)-julianday(fv.created_at))*24) h FROM approvals ap JOIN file_versions fv ON fv.id=ap.version_id JOIN tasks t ON t.id=ap.task_id WHERE t.workspace_id=? AND julianday(ap.created_at)>=julianday(?) AND julianday(ap.created_at)<julianday(?)", wsId, w.a, w.b).h; return r == null ? null : Math.round(r); });
  // time in status: walk 'moved' activity per task
  const statuses = db.prepare("SELECT id, name FROM task_statuses WHERE workspace_id=? AND is_archived=0 ORDER BY sort_order").all(wsId);
  const bucket = {}; statuses.forEach(s => bucket[s.id] = []);
  const rows = db.prepare("SELECT entity_id task_id, payload, created_at FROM activity_logs WHERE workspace_id=? AND action='moved' AND entity_type='task' ORDER BY entity_id, created_at").all(wsId);
  let prev = null;
  for (const r of rows) { let p; try { p = JSON.parse(r.payload); } catch { continue; } if (prev && prev.task_id === r.task_id && prev.to && bucket[prev.to]) bucket[prev.to].push((new Date(r.created_at) - new Date(prev.created_at)) / 86400000); prev = { task_id: r.task_id, to: p.to, created_at: r.created_at }; }
  const timeInStatus = statuses.map(s => ({ id: s.id, name: s.name, days: bucket[s.id].length ? Math.round(avg(bucket[s.id]) * 10) / 10 : null, samples: bucket[s.id].length }));
  const sz = require("../server/serialize"), people = sz.readPeople(db, wsId);
  const tasks = db.prepare("SELECT k.*,s.is_completed FROM tasks k JOIN task_statuses s ON s.id=k.status_id LEFT JOIN projects p ON p.id=k.project_id WHERE k.workspace_id=? AND (p.id IS NULL OR p.status!='archived')").all(wsId);
  const assignedTo = (t) => {let a=[];try{a=JSON.parse(t.assignees||"[]");}catch{}if(t.assignee_id&&!a.includes(t.assignee_id))a.unshift(t.assignee_id);return [...new Set(a.filter(Boolean))];};
  const hours = id => Math.round(tasks.filter(t=>!t.is_completed).reduce((n,t)=>{const ids=assignedTo(t);return n+(ids.includes(id)?(t.estimated_minutes||0)/60/ids.length:0);},0));
  const byTeam = db.prepare("SELECT id,name,color FROM teams WHERE workspace_id=? AND is_archived=0 ORDER BY sort_order").all(wsId).map(t=>{
    const members=Object.keys(people).filter(id=>!people[id].stakeholder&&(people[id].teams||[]).some(x=>x[0]===t.id));
    /* a team's tasks: its own, and other teams' tasks its people are assigned to (each keeps its team) */
    const inTeam=Object.keys(people).filter(id=>(people[id].teams||[]).some(x=>x[0]===t.id)), involves=k=>k.team_id===t.id||assignedTo(k).some(id=>inTeam.includes(id));
    const capacity=members.reduce((n,id)=>n+(people[id].cap||0),0),assigned=members.reduce((n,id)=>n+hours(id),0),open=tasks.filter(k=>involves(k)&&!k.is_completed);
    return {id:t.id,name:t.name,color:t.color,open:open.length,workloadHours:open.reduce((n,k)=>n+(k.estimated_minutes||0)/60,0),completed:tasks.filter(k=>involves(k)&&k.is_completed).length,capacity,assigned,utilization:capacity?Math.round(assigned/capacity*100):0};
  });
  const today = localDate(new Date());
  const byProject = db.prepare("SELECT id, name, progress, due_date FROM projects WHERE workspace_id=? AND status NOT IN ('done','archived') ORDER BY sort_order").all(wsId).map(p => {
    /* a task shared by two projects counts in both */
    const inP = "(k.project_id=? OR instr(coalesce(k.extra_projects,''),'\"'||?||'\"')>0)";
    const open = q("SELECT count(*) n, coalesce(sum(estimated_minutes),0) m FROM tasks k JOIN task_statuses s ON s.id=k.status_id WHERE " + inP + " AND s.is_completed=0", p.id, p.id);
    const over = q("SELECT count(*) n FROM tasks k JOIN task_statuses s ON s.id=k.status_id WHERE " + inP + " AND s.is_completed=0 AND due_date<?", p.id, p.id, today).n;
    const daysLeft = p.due_date ? Math.round((new Date(p.due_date) - new Date(today)) / 86400000) : null;
    const risk = over > 0 || (daysLeft != null && daysLeft < 0) ? "high" : (daysLeft != null && daysLeft <= 7 && p.progress < 70) ? "medium" : "low";
    return { id: p.id, name: p.name, progress: p.progress, remainingHours: Math.round(open.m / 60), open: open.n, overdue: over, daysLeft, risk };
  });
  return { weeks: weeks.map(w => w.label), created, completed, overdue, avgDays, revisionRate, approvalHrs, timeInStatus, byTeam, byProject };
}

const WS = demo.ws.id;
const toDates = () => { const d = new Date(Date.now() - 120 * 86400000); return [null, d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')]; };
function same(label) {
  for (const to of toDates()) for (const weeks of [8, 26, 52]) {
    const before = JSON.stringify(computeBefore(db, WS, weeks, to)), now = JSON.stringify(analytics.compute(db, WS, weeks, to));
    assert.equal(now, before, label + ': ' + weeks + ' weeks' + (to ? ' up to ' + to : ''));
  }
}

/* ---------- growing the demo: 1,500+ tasks, deterministic ---------- */
let seedN = 20261021; const rnd = () => { seedN = (seedN * 1103515245 + 12345) & 0x7fffffff; return seedN / 0x7fffffff; };
const pick = a => a[Math.floor(rnd() * a.length)];
const pad = x => String(x).padStart(2, '0');
const DAY = 86400000;
/* one instant, written the ways the app's rows carry it */
const stamp = (ms, form) => {
  const d = new Date(ms);
  if (form === 'space') return d.toISOString().slice(0, 19).replace('T', ' ');                 /* SQLite's datetime('now') */
  if (form === 'offset') { const l = new Date(ms + 7 * 3600000); return l.toISOString().slice(0, 19) + '+07:00'; }
  if (form === 'date') return d.toISOString().slice(0, 10);
  if (form === 'nosec') return d.toISOString().slice(0, 16);
  return d.toISOString();                                                                       /* new Date().toISOString() */
};
const anyForm = () => pick(['iso', 'iso', 'iso', 'space', 'space', 'offset', 'date', 'nosec']);
const localDay = ms => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
/* the Mondays the weeks start on (local midnight), as compute() works them out */
function weekEdges() { const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); const out = []; for (let k = -1; k <= 70; k++) { const a = new Date(x); a.setDate(x.getDate() - 7 * k); out.push(a.getTime()); } return out; }

function grow(target) {
  const statuses = db.prepare('SELECT id, is_completed FROM task_statuses WHERE workspace_id=? AND is_archived=0').all(WS);
  const done = statuses.filter(s => s.is_completed).map(s => s.id), open = statuses.filter(s => !s.is_completed).map(s => s.id);
  const teams = db.prepare('SELECT id FROM teams WHERE workspace_id=?').all(WS).map(t => t.id);
  const people = db.prepare('SELECT user_id FROM workspace_members WHERE workspace_id=?').all(WS).map(r => r.user_id);
  db.exec('BEGIN');
  try {
    /* capacities that are not all 40, people in more than one team, a stakeholder */
    people.forEach((id, i) => { db.prepare('UPDATE workspace_members SET capacity_hours=? WHERE workspace_id=? AND user_id=?').run(pick([40, 40, 32, 20, 37, 0, null]), WS, id);
      if (i % 3 === 0) db.prepare('INSERT OR IGNORE INTO team_memberships (id,team_id,user_id,is_primary) VALUES (?,?,?,0)').run('tm_grow_' + i, pick(teams), id); });
    db.prepare('UPDATE workspace_members SET is_stakeholder=1 WHERE workspace_id=? AND user_id=?').run(WS, people[people.length - 1]);
    /* more projects, two archived, one done */
    const projects = db.prepare('SELECT id FROM projects WHERE workspace_id=?').all(WS).map(p => p.id);
    for (let i = 0; i < 10; i++) { const id = 'p_grow_' + i; db.prepare("INSERT INTO projects (id,workspace_id,name,status,progress,due_date,sort_order) VALUES (?,?,?,?,?,?,?)").run(id, WS, 'Grown ' + i, i < 2 ? 'archived' : i === 2 ? 'done' : 'active', Math.floor(rnd() * 100), rnd() < 0.8 ? localDay(Date.now() + (Math.floor(rnd() * 120) - 30) * DAY) : null, 100 + i); projects.push(id); }
    const have = db.prepare('SELECT count(*) n FROM tasks WHERE workspace_id=?').get(WS).n;
    const edges = weekEdges();
    const insTask = db.prepare('INSERT INTO tasks (id,workspace_id,project_id,team_id,title,description,status_id,priority,assignee_id,reviewer_id,assignees,reviewers,start_date,due_date,estimated_minutes,sort_order,completed_at,created_by,created_at,updated_at,extra_projects) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    const insVer = db.prepare('INSERT INTO file_versions (id,task_id,version_number,uploaded_by,approval_status,created_at) VALUES (?,?,?,?,?,?)');
    const insAp = db.prepare('INSERT INTO approvals (id,task_id,version_id,decided_by,decision,created_at) VALUES (?,?,?,?,?,?)');
    const insRr = db.prepare('INSERT INTO revision_requests (id,task_id,version_id,requested_by,reason,created_at) VALUES (?,?,?,?,?,?)');
    const insAct = db.prepare("INSERT INTO activity_logs (id,workspace_id,actor_id,action,entity_type,entity_id,payload,created_at) VALUES (?,?,?,'moved','task',?,?,?)");
    for (let i = 0; i < target - have; i++) {
      const id = 'G-' + (1000 + i), isDone = rnd() < 0.62;
      /* a quarter of the tasks sit exactly on a week's edge, or a millisecond before it, in one form or another */
      const onEdge = rnd() < 0.25, edge = pick(edges);
      const createdMs = onEdge ? edge - (rnd() < 0.5 ? 0 : 1) : Date.now() - Math.floor(rnd() * 420 * DAY);
      const completedMs = isDone || rnd() < 0.05 ? (rnd() < 0.2 ? pick(edges) - (rnd() < 0.5 ? 0 : 1) : createdMs + Math.floor((rnd() * 30 - 2) * DAY + rnd() * DAY)) : null;
      const who = []; const k = rnd() < 0.15 ? 0 : 1 + Math.floor(rnd() * 3); for (let j = 0; j < k; j++) who.push(pick(people)); if (rnd() < 0.05) who.push(who[0] || pick(people));
      const lead = rnd() < 0.85 ? (who[0] || null) : pick(people);
      const extra = rnd() < 0.2 ? JSON.stringify([pick(projects), pick(projects)].slice(0, 1 + Math.floor(rnd() * 2))) : rnd() < 0.1 ? null : '[]';
      const due = rnd() < 0.85 ? localDay((completedMs || createdMs) + Math.floor(rnd() * 20 - 10) * DAY) : null;
      insTask.run(id, WS, rnd() < 0.9 ? pick(projects) : null, rnd() < 0.85 ? pick(teams) : null, 'Grown task ' + i, 'x'.repeat(Math.floor(rnd() * 400)), isDone ? pick(done) : pick(open), pick(['low', 'medium', 'high', 'urgent']),
        lead, pick(people), JSON.stringify(who), '[]', null, due, rnd() < 0.05 ? null : pick([0, 30, 45, 50, 60, 90, 100, 120, 200, 240, 480, 37, 1000]), 1000 + i,
        completedMs == null ? null : stamp(completedMs, anyForm()), lead, rnd() < 0.02 ? null : stamp(createdMs, anyForm()), stamp(createdMs, 'iso'), extra);
      /* versions, approvals and revisions: the app writes the first with a T and a Z, the others with SQLite's default */
      if (rnd() < 0.45) { const nv = 1 + Math.floor(rnd() * 3); for (let v = 1; v <= nv; v++) { const vid = id + '_v' + v, vMs = createdMs + Math.floor(rnd() * 10 * DAY);
        insVer.run(vid, id, v, lead, 'pending', stamp(vMs, rnd() < 0.8 ? 'iso' : anyForm()));
        if (rnd() < 0.5) insAp.run(id + '_ap' + v, id, vid, pick(people), 'approved', stamp(vMs + Math.floor(rnd() * 5 * DAY), rnd() < 0.7 ? 'space' : anyForm()));
        else if (rnd() < 0.5) insRr.run(id + '_rr' + v, id, vid, pick(people), 'Revision requested', stamp(vMs + Math.floor(rnd() * 3 * DAY), rnd() < 0.7 ? 'space' : anyForm())); } }
      if (rnd() < 0.4) { let t = createdMs, from = pick(open); const moves = 1 + Math.floor(rnd() * 4); for (let m = 0; m < moves; m++) { t += Math.floor(rnd() * 6 * DAY); const to = pick(open.concat(done)); insAct.run(id + '_mv' + m, WS, lead, id, JSON.stringify({ from, to, task: id }), stamp(t, 'iso')); from = to; } }
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

test('the demo: the same answer as before, number for number', () => {
  seed.run(db);
  same('demo');
});

test('grown past 1,500 tasks, stamps in every form and on the edges of weeks: the same answer', () => {
  grow(1600);
  assert.ok(db.prepare('SELECT count(*) n FROM tasks WHERE workspace_id=?').get(WS).n >= 1600);
  const r = analytics.compute(db, WS, 52);
  assert.ok(r.created.some(n => n > 10) && r.completed.some(n => n > 10) && r.avgDays.some(x => x != null) && r.approvalHrs.some(x => x != null) && r.revisionRate.some(x => x != null), 'the grown data reaches every figure');
  same('grown');
  /* other indexes and planner statistics change how SQLite walks the rows; the answer still matches */
  db.exec('CREATE INDEX x_an_done ON tasks(workspace_id, completed_at, created_at); CREATE INDEX x_an_due ON tasks(workspace_id, due_date); CREATE INDEX x_an_ap ON approvals(task_id); CREATE INDEX x_an_fv ON file_versions(task_id, created_at)');
  same('grown, more indexes');
  db.exec('ANALYZE');
  same('grown, analyzed');
  db.exec('DROP INDEX x_an_done; DROP INDEX x_an_due; DROP INDEX x_an_ap; DROP INDEX x_an_fv; DROP TABLE IF EXISTS sqlite_stat1');
});

test('the work no longer grows with the weeks shown, and no photo is read for it', () => {
  const prepare = db.prepare, seen = [];
  db.prepare = function (sql) { seen.push(String(sql)); return prepare.call(this, sql); };
  let at8, at52;
  try {
    analytics.compute(db, WS, 8); at8 = seen.length;
    seen.length = 0; analytics.compute(db, WS, 52); at52 = seen.length;
  } finally { delete db.prepare; }
  assert.equal(at52, at8, 'as many statements for 52 weeks as for 8');
  assert.ok(at8 <= 16, 'a handful of statements, not one per week per figure: ' + at8);
  assert.ok(!seen.some(s => /avatar_data|\bu\.\*/.test(s)), 'the people are read without their photos');
});
