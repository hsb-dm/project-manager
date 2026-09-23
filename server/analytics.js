// Analytics are queries over the same tables the views use (§58, §65). Nothing is precomputed or duplicated.
function monday(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
const iso = (d) => d.toISOString();
const localDate = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

function compute(db, wsId, nWeeks, toDate) {
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
  const sz = require("./serialize"), people = sz.readPeople(db, wsId);
  const tasks = db.prepare("SELECT k.*,s.is_completed FROM tasks k JOIN task_statuses s ON s.id=k.status_id LEFT JOIN projects p ON p.id=k.project_id WHERE k.workspace_id=? AND (p.id IS NULL OR p.status!='archived')").all(wsId);
  const assignedTo = (t) => {let a=[];try{a=JSON.parse(t.assignees||"[]");}catch{}if(t.assignee_id&&!a.includes(t.assignee_id))a.unshift(t.assignee_id);return [...new Set(a.filter(Boolean))];};
  const hours = id => Math.round(tasks.filter(t=>!t.is_completed).reduce((n,t)=>{const ids=assignedTo(t);return n+(ids.includes(id)?(t.estimated_minutes||0)/60/ids.length:0);},0));
  const byTeam = db.prepare("SELECT id,name,color FROM teams WHERE workspace_id=? AND is_archived=0 ORDER BY sort_order").all(wsId).map(t=>{
    const members=Object.keys(people).filter(id=>!people[id].stakeholder&&(people[id].teams||[]).some(x=>x[0]===t.id));
    const capacity=members.reduce((n,id)=>n+(people[id].cap||0),0),assigned=members.reduce((n,id)=>n+hours(id),0),open=tasks.filter(k=>k.team_id===t.id&&!k.is_completed);
    return {id:t.id,name:t.name,color:t.color,open:open.length,workloadHours:open.reduce((n,k)=>n+(k.estimated_minutes||0)/60,0),completed:tasks.filter(k=>k.team_id===t.id&&k.is_completed).length,capacity,assigned,utilization:capacity?Math.round(assigned/capacity*100):0};
  });
  const today = localDate(new Date());
  const byProject = db.prepare("SELECT id, name, progress, due_date FROM projects WHERE workspace_id=? AND status NOT IN ('done','archived') ORDER BY sort_order").all(wsId).map(p => {
    const open = q("SELECT count(*) n, coalesce(sum(estimated_minutes),0) m FROM tasks k JOIN task_statuses s ON s.id=k.status_id WHERE k.project_id=? AND s.is_completed=0", p.id);
    const over = q("SELECT count(*) n FROM tasks k JOIN task_statuses s ON s.id=k.status_id WHERE k.project_id=? AND s.is_completed=0 AND due_date<?", p.id, today).n;
    const daysLeft = p.due_date ? Math.round((new Date(p.due_date) - new Date(today)) / 86400000) : null;
    const risk = over > 0 || (daysLeft != null && daysLeft < 0) ? "high" : (daysLeft != null && daysLeft <= 7 && p.progress < 70) ? "medium" : "low";
    return { id: p.id, name: p.name, progress: p.progress, remainingHours: Math.round(open.m / 60), open: open.n, overdue: over, daysLeft, risk };
  });
  return { weeks: weeks.map(w => w.label), created, completed, overdue, avgDays, revisionRate, approvalHrs, timeInStatus, byTeam, byProject };
}
module.exports = { compute };
