/* v33 — who may move a task into each workflow stage (server-enforced, configurable). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-v33-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'V33!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'v33-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'v33-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'V33!Admin23456');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const get = async id => (await req('GET', '/api/tasks/' + id, undefined, admin)).json();
  const put = async (id, patch, c) => { const cur = await get(id); return req('PUT', '/api/tasks/' + id, Object.assign(cur, patch), c); };
  const move = (id, to, c) => req('POST', '/api/tasks/' + id + '/move', { type: 'MOVE_TASK_STATUS', toStatusId: to }, c);
  return { req, admin, as, get, put, move };
}
/* a fresh task assigned to sarah, reviewed by laura */
async function sarahTask(s, reviewer) {
  const r = await s.req('POST', '/api/tasks', { title: 'Rule test ' + Math.random(), status: 'progress', team: 'design', assignee: 'sarah', assignees: ['sarah'], reviewer: reviewer || null, reviewers: reviewer ? [reviewer] : [] }, s.admin);
  assert.equal(r.status, 200, await r.clone().text()); return (await r.json()).id;
}

test('defaults: the assignee may move their own task up to Delivered, not to Done', { timeout: 30000 }, async t => {
  const s = await start(t); const sarah = await s.as('sarah'); const laura = await s.as('laura');
  const id = await sarahTask(s, 'laura');
  for (const st of ['review', 'approved', 'delivered']) { const r = await s.move(id, st, sarah); assert.equal(r.status, 200, st + ': ' + await r.clone().text()); }
  let r = await s.move(id, 'done', sarah); assert.equal(r.status, 403); assert.match((await r.json()).error, /reviewer, the requester, a team lead or an admin/);
  r = await s.put(id, { status: 'done' }, sarah); assert.equal(r.status, 403, 'the PUT path is gated too');
  r = await s.move(id, 'done', laura); assert.equal(r.status, 200, 'the reviewer can close it');
  assert.equal((await s.get(id)).status, 'done');
});

test('a reviewer must be named before a task enters review', { timeout: 30000 }, async t => {
  const s = await start(t); const sarah = await s.as('sarah');
  const id = await sarahTask(s, null);
  let r = await s.move(id, 'review', sarah); assert.equal(r.status, 400); assert.match((await r.json()).error, /Choose a reviewer/);
  r = await s.req('POST', '/api/tasks', { title: 'straight to delivered', status: 'delivered', assignee: 'sarah', assignees: ['sarah'] }, s.admin);
  assert.equal(r.status, 400, 'creating directly in a review-or-later stage also needs a reviewer');
  await s.put(id, { reviewer: 'laura', reviewers: ['laura'] }, s.admin);
  r = await s.move(id, 'review', sarah); assert.equal(r.status, 200);
});

test('admins can change every rule in Settings → Workflow', { timeout: 30000 }, async t => {
  const s = await start(t); const sarah = await s.as('sarah');
  const ws = (await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).ws;
  const rule = id => ws.workflow.find(x => x.id === id);
  assert.equal(rule('delivered').reviewerOnly, false); assert.equal(rule('done').reviewerOnly, true); assert.equal(rule('review').requireReviewer, true); assert.equal(rule('progress').requireReviewer, false);
  // tighten Delivered, loosen Done, drop the reviewer requirement for Review
  ws.workflow.forEach(x => { if (x.id === 'delivered') x.reviewerOnly = true; if (x.id === 'done') x.reviewerOnly = false; if (x.id === 'review') x.requireReviewer = false; });
  let r = await s.req('PUT', '/api/workspace', ws, s.admin); assert.equal(r.status, 200, await r.clone().text());
  const ws2 = (await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).ws;
  assert.equal(ws2.workflow.find(x => x.id === 'delivered').reviewerOnly, true, 'stored');
  const noRev = await sarahTask(s, null);
  assert.equal((await s.move(noRev, 'review', sarah)).status, 200, 'review no longer requires a reviewer');
  const id = await sarahTask(s, 'laura');
  assert.equal((await s.move(id, 'approved', sarah)).status, 200);
  assert.equal((await s.move(id, 'delivered', sarah)).status, 403, 'Delivered is now reviewer-only');
  assert.equal((await s.move(id, 'done', sarah)).status, 200, 'Done is now open');
  // a member cannot change the rules
  r = await s.req('PUT', '/api/workspace', ws2, sarah); assert.equal(r.status, 403);
});

test('the requester of a request task may close it; the assignee may not', { timeout: 30000 }, async t => {
  const s = await start(t); const nadia = await s.as('nadia'); const sarah = await s.as('sarah');
  let r = await s.req('POST', '/api/tasks', { title: 'Please design a banner', status: 'backlog' }, nadia);
  assert.equal(r.status, 200, await r.clone().text()); const id = (await r.json()).id;
  await s.put(id, { assignee: 'sarah', assignees: ['sarah'], reviewer: 'laura', reviewers: ['laura'], team: 'design' }, s.admin);
  assert.equal((await s.move(id, 'delivered', sarah)).status, 200);
  assert.equal((await s.move(id, 'done', sarah)).status, 403);
  assert.equal((await s.move(id, 'done', nadia)).status, 200, 'the requester can accept the work');
});
