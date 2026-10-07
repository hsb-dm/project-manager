/* An admin puts a task or a project back to a point in its history.
   Each write that adds to the history saves a copy of how things looked right after (a.snap names it);
   going back restores that copy, keeps the comments and the history, and is itself a point in the
   history — so it can be undone the same way. Only an admin can do it. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-restore-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Restore!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'restore-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'restore-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Restore!Admin23456');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const boot = await (await req('GET', '/api/bootstrap', undefined, admin)).json();
  return { req, admin, as, boot };
}

test('a task goes back to a point in its history, and the going back can be undone', { timeout: 30000 }, async t => {
  const s = await start(t);
  const flow = (s.boot.ws || s.boot.workspace).workflow, get = async id => (await s.req('GET', '/api/tasks/' + id, undefined, s.admin)).json();
  let r = await s.req('POST', '/api/tasks', { title: 'Hero banner', status: flow[0].id, prio: 'medium' }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  const id = (await r.json()).id;
  /* V1, then a move, then a new title */
  let doc = await get(id); doc.versions.push({ id: 'ver_1', n: 1, annots: [] });
  assert.equal((await s.req('PUT', '/api/tasks/' + id, doc, s.admin)).status, 200);
  assert.equal((await s.req('POST', '/api/tasks/' + id + '/move', { type: 'MOVE_TASK_STATUS', fromStatusId: flow[0].id, toStatusId: flow[1].id }, s.admin)).status, 200);
  doc = await get(id); doc.title = 'Hero banner — final'; doc.comments.push({ id: 'cm_keep', text: 'keep me' });
  assert.equal((await s.req('PUT', '/api/tasks/' + id, doc, s.admin)).status, 200);
  doc = await get(id);
  const upload = doc.activity.find(a => a.k === 'upload');
  assert.ok(upload && upload.a.snap, 'the upload names its copy: ' + JSON.stringify(doc.activity.map(a => [a.k, !!(a.a && a.a.snap)])));

  /* what going back would change, then going back */
  r = await s.req('GET', '/api/restore/task/' + id + '?activity=' + upload.id, undefined, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  const preview = await r.json(); assert.equal(preview.doc.status, flow[0].id); assert.equal(preview.doc.title, 'Hero banner');
  r = await s.req('POST', '/api/restore/task/' + id, { activityId: upload.id }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  doc = await get(id);
  assert.equal(doc.status, flow[0].id, 'back in the first stage'); assert.equal(doc.title, 'Hero banner');
  assert.deepEqual(doc.versions.map(v => v.n), [1]);
  assert.ok(doc.comments.some(c => c.id === 'cm_keep'), 'comments stay');
  const restored = doc.activity.find(a => a.k === 'restored');
  assert.ok(restored && restored.a.snap, 'going back is in the history, with its own copy');

  /* undo: back to the point just before going back */
  /* (the entries written by going back share its copy; the point before is the newest other one) */
  const before = doc.activity.filter(a => a.a && a.a.snap && a.a.snap !== restored.a.snap).sort((a, b) => a.createdAt < b.createdAt ? 1 : -1)[0];
  assert.equal((await s.req('POST', '/api/restore/task/' + id, { activityId: before.id }, s.admin)).status, 200);
  doc = await get(id); assert.equal(doc.title, 'Hero banner — final'); assert.equal(doc.status, flow[1].id);

  /* only an admin; only a point that has a copy */
  const who = Object.keys(s.boot.people).find(x => x !== 'admin' && s.boot.people[x].active !== false);
  const member = await s.as(who);
  assert.equal((await s.req('GET', '/api/restore/task/' + id + '?activity=' + upload.id, undefined, member)).status, 403);
  assert.equal((await s.req('POST', '/api/restore/task/' + id, { activityId: upload.id }, member)).status, 403);
  assert.equal((await s.req('POST', '/api/restore/task/' + id, { activityId: 'act_nope' }, s.admin)).status, 404);
});

test('a project goes back to a point in its history', { timeout: 30000 }, async t => {
  const s = await start(t);
  let r = await s.req('POST', '/api/projects', { name: 'Spring launch', status: 'active' }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  const p = (await r.json()).find(x => x.name === 'Spring launch');
  r = await s.req('PUT', '/api/projects/' + p.id, Object.assign({}, p, { name: 'Spring launch 2027', dueDate: '2027-04-01' }), s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  const feed = (await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).activity;
  const created = feed.find(a => a.k === 'project_created' && a.a.project === p.id);
  assert.ok(created && created.a.snap, 'created names its copy');
  assert.ok(feed.some(a => a.k === 'edited' && a.a.project === p.id && a.a.snap), 'the edit is in the history, written by the server');
  r = await s.req('POST', '/api/restore/project/' + p.id, { activityId: created.id }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  const back = (await r.json()).projects.find(x => x.id === p.id);
  assert.equal(back.name, 'Spring launch'); assert.ok(!back.dueDate);
});
