/* What the browser sends is checked before it is stored or shown to anyone else (audit, Oct 2026).
   - A version number is a whole number, each once; a new version starts undecided — a "2" or a
     version sent as "approved" used to skip the approval rights and overwrite version 2.
   - A priority is one of four words; a colour is a colour; an id the browser picks is plain: all of
     them are written into the page as they are.
   - A task's history is the server's: the browser cannot add to it, and what it adds elsewhere is small.
   - A stakeholder receives only the comments meant for them, and their own comments are those.
   - Removing a version keeps the decision made on it on record. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-secaudit-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'SecAudit!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'secaudit-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'secaudit-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'SecAudit!Admin23456');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const get = async id => (await req('GET', '/api/tasks/' + id, undefined, admin)).json();
  return { req, admin, as, get, dbFile: path.join(temp, 'creative-os.db') };
}
const pickTask = boot => boot.tasks.find(x => x.versions && x.versions.length && x.assignee && x.reviewer && x.assignee !== x.reviewer && x.assignee !== 'admin' && x.reviewer !== 'admin');

test('versions: whole numbers, each once; a new one starts undecided', { timeout: 30000 }, async t => {
  const s = await start(t);
  const pick = pickTask(await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json());
  const designer = await s.as(pick.assignee);
  const put = doc => s.req('PUT', '/api/tasks/' + pick.id, doc, designer);
  const before = await s.get(pick.id); const last = before.versions[before.versions.length - 1];

  /* "2" for version 2: refused, and version 2 is untouched */
  let doc = await s.get(pick.id);
  doc.versions.push({ id: 'ver_x', n: String(last.n), state: 'approved', driveUrl: 'https://example.org/swapped.png', annots: [] });
  assert.equal((await put(doc)).status, 400);
  assert.deepEqual((await s.get(pick.id)).versions.find(v => v.n === last.n), last);

  /* a version sent as approved, with a colour that is markup */
  doc = await s.get(pick.id); const n = last.n + 1;
  doc.versions.push({ id: 'ver_y', n, state: 'approved', decidedBy: pick.assignee, color: '#000"><img src=x onerror=alert(1)>', annots: [] });
  let r = await put(doc); assert.equal(r.status, 200, await r.clone().text());
  const made = (await s.get(pick.id)).versions.find(v => v.n === n);
  assert.equal(made.state, 'pending'); assert.equal(made.decidedBy, null);
  assert.equal(made.color, '#64748B');
});

test('priorities, colours and ids are plain values', { timeout: 30000 }, async t => {
  const s = await start(t);
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json();
  const stage = (boot.ws || boot.workspace).workflow[0].id;
  const evil = 'x"><img src=x onerror=alert(1)>';
  let r = await s.req('POST', '/api/tasks', { title: 'Prio', status: stage, prio: evil }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  const tk = await r.json(); assert.equal(tk.prio, 'medium');
  const doc = await s.get(tk.id); doc.prio = evil;
  assert.equal((await s.req('PUT', '/api/tasks/' + tk.id, doc, s.admin)).status, 200);
  assert.equal((await s.get(tk.id)).prio, 'medium');
  r = await s.req('POST', '/api/tasks/' + tk.id + '/move', { type: 'MOVE_TASK_PRIORITY', priority: evil }, s.admin);
  assert.equal(r.status, 400);
  r = await s.req('POST', '/api/tasks/' + tk.id + '/move', { type: 'MOVE_TASK_PRIORITY', priority: 'urgent' }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());

  r = await s.req('POST', '/api/assets', { name: 'Logo', type: 'image', color: evil }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  assert.ok((await r.json()).every(a => !/[<>"]/.test(a.color || '')), 'no markup in a colour');
  assert.equal((await s.req('POST', '/api/assets', { id: "a');alert(1);('", name: 'Bad id', type: 'image' }, s.admin)).status, 400);
  assert.equal((await s.req('POST', '/api/knowledge', { id: "k';alert(1);'", title: 'Bad id', body: '' }, s.admin)).status, 400);
});

test('a task’s history is the server’s, and history from the browser is small', { timeout: 30000 }, async t => {
  const s = await start(t);
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json();
  const id = boot.tasks[0].id;
  assert.equal((await s.req('POST', '/api/activity', { k: 'moved', entityType: 'task', entityId: id, a: { to: 'done' } }, s.admin)).status, 400);
  const r = await s.req('POST', '/api/activity', { k: 'edited', entityType: 'project', entityId: 'p1', a: { what: 'x'.repeat(50000), nested: { deep: 1 } } }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  const mine = (await r.json()).find(a => a.k === 'edited' && a.a && a.a.what && a.a.what.startsWith('xxx'));
  assert.ok(mine, 'recorded'); assert.ok(mine.a.what.length <= 200); assert.equal(mine.a.nested, undefined);
});

test('a stakeholder gets only the comments meant for them', { timeout: 30000 }, async t => {
  const s = await start(t);
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json();
  const tk = boot.tasks.find(x => (x.comments || []).length);
  const doc = await s.get(tk.id);
  doc.comments.push({ id: 'cm_int', text: 'internal: budget is tight', vis: 'internal' }, { id: 'cm_cli', text: 'for the client', vis: 'client' });
  assert.equal((await s.req('PUT', '/api/tasks/' + tk.id, doc, s.admin)).status, 200);
  const who = Object.keys(boot.people).find(id => id !== 'admin' && boot.people[id].active !== false);
  assert.equal((await s.req('PUT', '/api/members/' + who, { stakeholder: true }, s.admin)).status, 200);
  const sh = await s.as(who);
  const seen = await (await s.req('GET', '/api/tasks/' + tk.id, undefined, sh)).json();
  assert.ok(seen.comments.some(c => c.id === 'cm_cli'));
  assert.ok(seen.comments.every(c => c.vis === 'client'), JSON.stringify(seen.comments.map(c => c.vis)));
  const all = await (await s.req('GET', '/api/bootstrap', undefined, sh)).json();
  assert.ok(!JSON.stringify(all.tasks).includes('budget is tight'), 'not in the bootstrap either');
  /* the admin still sees everything */
  assert.ok((await s.get(tk.id)).comments.some(c => c.id === 'cm_int'));
});

test('removing a version keeps the decision made on it', { timeout: 30000 }, async t => {
  const s = await start(t);
  const pick = pickTask(await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json());
  const designer = await s.as(pick.assignee), reviewer = await s.as(pick.reviewer);
  let doc = await s.get(pick.id); const n = doc.versions.reduce((m, v) => Math.max(m, v.n), 0) + 1;
  doc.versions.push({ id: 'ver_z', n, annots: [] });
  assert.equal((await s.req('PUT', '/api/tasks/' + pick.id, doc, designer)).status, 200);
  doc = await s.get(pick.id); doc.versions.find(v => v.n === n).state = 'revision';
  assert.equal((await s.req('PUT', '/api/tasks/' + pick.id, doc, reviewer)).status, 200);
  const { DatabaseSync } = require('node:sqlite');
  const count = () => { const d = new DatabaseSync(s.dbFile, { readOnly: true }); const c = d.prepare('SELECT count(*) c FROM revision_requests WHERE task_id=?').get(pick.id).c; d.close(); return c; };
  const before = count();
  doc = await s.get(pick.id); doc.versions = doc.versions.filter(v => v.n !== n);
  assert.equal((await s.req('PUT', '/api/tasks/' + pick.id, doc, designer)).status, 200);
  assert.equal(count(), before, 'the revision request is still on record');
});
