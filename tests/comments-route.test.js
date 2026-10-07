/* Comments (audit, Oct 2026).
   - Someone who may comment but not edit the task — a Viewer, a stakeholder — posts a comment on its
     own route; through a task PUT it was refused and what they typed was lost.
   - Deleting a comment that someone else replied to keeps the reply, as a comment of its own; it
     used to fail with a server error, the reply still pointing at the deleted comment. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-comments-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Comments!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'comments-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'comments-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Comments!Admin23456');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const get = async id => (await req('GET', '/api/tasks/' + id, undefined, admin)).json();
  return { req, admin, as, get };
}

test('a Viewer comments on a task they cannot edit', { timeout: 30000 }, async t => {
  const s = await start(t);
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json();
  const tk = boot.tasks.find(x => !x._slim);
  const who = Object.keys(boot.people).find(id => id !== 'admin' && boot.people[id].active !== false);
  assert.equal((await s.req('PUT', '/api/members/' + who, { perm: 'viewer' }, s.admin)).status, 200);
  const viewer = await s.as(who);
  const doc = await s.get(tk.id); doc.comments.push({ id: 'cm_put', text: 'via PUT' });
  assert.equal((await s.req('PUT', '/api/tasks/' + tk.id, doc, viewer)).status, 403, 'a Viewer still cannot edit the task');
  const r = await s.req('POST', '/api/tasks/' + tk.id + '/comments', { id: 'cm_view', text: 'Looks good to me', vis: 'internal', parent: 'nope' }, viewer);
  assert.equal(r.status, 200, await r.clone().text());
  const c = (await s.get(tk.id)).comments.find(x => x.id === 'cm_view');
  assert.ok(c, 'kept'); assert.equal(c.by, who); assert.equal(c.parent, null, 'a parent that does not exist is dropped');
  assert.ok((await s.get(tk.id)).activity.some(a => a.k === 'comment' && a.who === who), 'in the history');
  assert.equal((await s.req('POST', '/api/tasks/' + tk.id + '/comments', { text: '   ' }, viewer)).status, 400);
  assert.equal((await s.req('POST', '/api/tasks/' + tk.id + '/comments', { text: 'x'.repeat(10001) }, viewer)).status, 413);
});

test('deleting a comment someone replied to keeps the reply', { timeout: 30000 }, async t => {
  const s = await start(t);
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json();
  const tk = boot.tasks.find(x => !x._slim && x.assignee && x.assignee !== 'admin');
  const a = await s.as(tk.assignee);
  const other = Object.keys(boot.people).find(id => id !== 'admin' && id !== tk.assignee && boot.people[id].active !== false);
  const b = await s.as(other);
  let r = await s.req('POST', '/api/tasks/' + tk.id + '/comments', { id: 'cm_root', text: 'First thought' }, a); assert.equal(r.status, 200, await r.clone().text());
  r = await s.req('POST', '/api/tasks/' + tk.id + '/comments', { id: 'cm_reply', text: 'Agreed', parent: 'cm_root' }, b); assert.equal(r.status, 200, await r.clone().text());
  const doc = await s.get(tk.id); doc.comments = doc.comments.filter(c => c.id !== 'cm_root' && c.parent !== 'cm_root');
  r = await s.req('PUT', '/api/tasks/' + tk.id, doc, a);
  assert.equal(r.status, 200, await r.clone().text());
  const after = (await s.get(tk.id)).comments;
  assert.ok(!after.some(c => c.id === 'cm_root'), 'the comment is gone');
  const reply = after.find(c => c.id === 'cm_reply');
  assert.ok(reply, 'the reply stays'); assert.equal(reply.parent, null);
});
