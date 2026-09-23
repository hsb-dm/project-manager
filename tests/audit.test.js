const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'creative-os-audit-'));
process.env.COS_DATA_DIR = temp;
const {open} = require('../server/db');
const seed = require('../server/seed');
const sz = require('../server/serialize');
const analytics = require('../server/analytics');
const demo = require('../shared/demo-data');
const db = open();
test.after(() => { db.close(); if(path.dirname(temp)===os.tmpdir()&&path.basename(temp).startsWith('creative-os-audit-'))fs.rmSync(temp,{recursive:true,force:true}); });

test('clean installation seeds all dependency links and local calendar dates', () => {
 seed.run(db);
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
 const expected = demo.tasks.reduce((n,t)=>n+(t.dependencies||[]).length,0);
 assert.equal(db.prepare('SELECT count(*) n FROM task_dependencies').get().n,expected);
 const t=demo.tasks[0],stored=sz.readTask(db,t.id),date=new Date();date.setHours(0,0,0,0);date.setDate(date.getDate()+t.due);
 const local=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
 assert.equal(stored.dueDate,local);
});
test('editing task preserves approvals, revisions and fractional effort', () => {
 const row=db.prepare('SELECT task_id FROM approvals LIMIT 1').get();const t=sz.readTask(db,row.task_id);
 const counts=()=>[db.prepare('SELECT count(*) n FROM approvals').get().n,db.prepare('SELECT count(*) n FROM revision_requests').get().n];
 const before=counts();const versionIds=t.versions.map(v=>v.id);t.title+=' [audit]';t.effort=1.5;
 sz.writeTask(db,demo.ws.id,t,'admin');
 assert.deepEqual(counts(),before);assert.deepEqual(sz.readTask(db,t.id).versions.map(v=>v.id),versionIds);assert.equal(sz.readTask(db,t.id).effort,1.5);
 sz.writeTask(db,demo.ws.id,sz.readTask(db,t.id),'admin');assert.deepEqual(counts(),before);
});
test('analytics excludes archived projects and splits shared assignments', () => {
 const r=analytics.compute(db,demo.ws.id,8);assert.equal(r.weeks.length,8);assert.equal(r.created.length,8);
 assert.ok(r.byTeam.every(t=>Number.isFinite(t.assigned)));
 const t=sz.readTask(db,demo.tasks.find(t=>t.assignee&&t.status==='progress').id);const people=Object.keys(demo.people).filter(id=>!demo.people[id].stakeholder);
 const p1=t.assignee,p2=people.find(id=>id!==p1);t.assignees=[p1,p2];t.effort=10;sz.writeTask(db,demo.ws.id,t,'admin');
 const before=analytics.compute(db,demo.ws.id,8);t.effort=20;sz.writeTask(db,demo.ws.id,t,'admin');const after=analytics.compute(db,demo.ws.id,8);
 const team=demo.teams.find(team=>(demo.people[p1].teams||[]).some(x=>x[0]===team.id));
 const memberIds=Object.entries(demo.people).filter(([id,p])=>!p.stakeholder&&(p.teams||[]).some(x=>x[0]===team.id)).map(([id])=>id);
 assert.equal(after.byTeam.find(x=>x.id===team.id).assigned-before.byTeam.find(x=>x.id===team.id).assigned,5*[p1,p2].filter(id=>memberIds.includes(id)).length);
 db.prepare("UPDATE projects SET status='archived' WHERE id=?").run(t.proj);assert.ok(!analytics.compute(db,demo.ws.id,8).byProject.some(p=>p.id===t.proj));
});
test('generated server and standalone HTML are identical and parse',()=>{
 const root=path.join(__dirname,'..');const a=fs.readFileSync(path.join(root,'public/index.html'),'utf8'),b=fs.readFileSync(path.join(root,'dist/creative-os-standalone.html'),'utf8');assert.equal(a,b);
 for(const m of a.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
});
