/* v34 — several people working at once: merges, live updates, reopen gate, last admin. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-v34-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'V34!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'v34-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'v34-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'V34!Admin23456');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const get = async id => (await req('GET', '/api/tasks/' + id, undefined, admin)).json();
  return { base, port, temp, req, admin, as, get };
}

test('two people editing different fields of the same task both keep their change', { timeout: 30000 }, async t => {
  const s = await start(t); const laura = await s.as('laura'); const sarah = await s.as('sarah');
  const a = await s.get('T-116'), b = await s.get('T-116');
  let r = await s.req('PUT', '/api/tasks/T-116', Object.assign({}, a, { title: 'Title by Laura', _rev: a.updatedAt, _changed: ['title'] }), laura); assert.equal(r.status, 200);
  r = await s.req('PUT', '/api/tasks/T-116', Object.assign({}, b, { description: 'Brief by Sarah', _rev: b.updatedAt, _changed: ['description'] }), sarah); assert.equal(r.status, 200);
  assert.deepEqual((await r.json())._merged, ['description']);
  const f = await s.get('T-116'); assert.equal(f.title, 'Title by Laura'); assert.equal(f.description, 'Brief by Sarah');
  // a stale save that does not say what it changed is refused, not applied
  const c = await s.get('T-118'); await s.req('PUT', '/api/tasks/T-118', Object.assign({}, c, { title: 'fresh' }), s.admin);
  r = await s.req('PUT', '/api/tasks/T-118', Object.assign({}, c, { title: 'stale', _rev: c.updatedAt }), s.admin); assert.equal(r.status, 409);
  assert.equal((await s.get('T-118')).title, 'fresh');
  // merging never widens permissions
  const d = await s.get('T-116'); await s.req('PUT', '/api/tasks/T-116', Object.assign({}, d, { title: 'bump' }), s.admin);
  r = await s.req('PUT', '/api/tasks/T-116', Object.assign({}, d, { reviewer: 'sarah', reviewers: ['sarah'], _rev: d.updatedAt, _changed: ['reviewer', 'reviewers'] }), sarah); assert.equal(r.status, 403);
});

test('every signed-in client is told when a task changes', { timeout: 30000 }, async t => {
  const s = await start(t); const sarah = await s.as('sarah');
  const events = [];
  const stream = http.get({ host: '127.0.0.1', port: s.port, path: '/api/messages/stream', headers: { cookie: sarah, origin: s.base } }, res => { res.setEncoding('utf8'); res.on('data', d => d.split('\n').filter(l => l.startsWith('data: ')).forEach(l => { try { events.push(JSON.parse(l.slice(6))); } catch {} })); });
  t.after(() => stream.destroy());
  await new Promise(r => setTimeout(r, 300));
  const cur = await s.get('T-119');
  await s.req('PUT', '/api/tasks/T-119', Object.assign(cur, { title: 'Live' }), s.admin);
  await s.req('POST', '/api/tasks/T-119/move', { type: 'MOVE_TASK_STATUS', toStatusId: 'todo' }, s.admin);
  await s.req('POST', '/api/tasks', { id: 'LIVE-1', title: 'New', status: 'todo' }, s.admin);
  await s.req('DELETE', '/api/tasks/LIVE-1', undefined, s.admin);
  await new Promise(r => setTimeout(r, 400));
  const tc = events.filter(e => e.type === 'task_changed');
  assert.ok(tc.filter(e => e.id === 'T-119').length >= 2, JSON.stringify(tc));
  assert.ok(tc.some(e => e.id === 'LIVE-1' && !e.deleted) && tc.some(e => e.id === 'LIVE-1' && e.deleted));
  assert.ok(tc.every(e => e.by === 'admin'));
});

test('the assignee cannot reopen a task the reviewer closed', { timeout: 30000 }, async t => {
  const s = await start(t); const sarah = await s.as('sarah'); const zein = await s.as('zein');
  const mv = (to, c) => s.req('POST', '/api/tasks/T-116/move', { type: 'MOVE_TASK_STATUS', toStatusId: to }, c);
  assert.equal((await mv('delivered', sarah)).status, 200);
  assert.equal((await mv('done', zein)).status, 200, 'the reviewer closes it');
  const r = await mv('progress', sarah); assert.equal(r.status, 403); assert.match((await r.json()).error, /out of Done/);
  assert.equal((await mv('revision', zein)).status, 200, 'the reviewer can reopen');
});

test('the last admin cannot demote themselves', { timeout: 30000 }, async t => {
  const s = await start(t);
  const people = (await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).people;
  let r = await s.req('PUT', '/api/members/admin', Object.assign({}, people.admin, { perm: 'member' }), s.admin);
  assert.equal(r.status, 400); assert.match((await r.json()).error, /At least one active admin/);
  assert.equal((await s.req('PUT', '/api/members/zein', Object.assign({}, people.zein, { perm: 'admin' }), s.admin)).status, 200);
  assert.equal((await s.req('PUT', '/api/members/admin', Object.assign({}, people.admin, { perm: 'member' }), s.admin)).status, 200, 'fine once another admin exists');
});

test('a tampered backup is refused with a clear reason and nothing changes', { timeout: 30000 }, async t => {
  const s = await start(t);
  const bk = await (await s.req('POST', '/api/backups', {}, s.admin)).json();
  const file = path.join(s.temp, 'backups', bk.name); const buf = fs.readFileSync(file); buf[buf.length >> 1] ^= 0xff; fs.writeFileSync(file, buf);
  const r = await s.req('POST', '/api/backups/' + bk.name + '/restore', { confirm: bk.name }, s.admin);
  assert.equal(r.status, 422); assert.match((await r.json()).error, /Refusing to restore.*Nothing was changed/);
  assert.equal((await s.req('GET', '/api/health')).status, 200);
  assert.equal((await s.req('GET', '/api/bootstrap', undefined, s.admin)).status, 200);
});
