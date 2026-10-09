/* A draft — a new task closed before it was created — is kept in the first stage, assigned to no one. Its maker
   may finish or delete it although they are neither its assignee nor its reviewer (a member could not, before:
   editing needs one of those, deleting needs delete_task). Only their own draft, and only while it is a draft. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');

async function start(temp) {
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Draft!Admin2345', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'draft-secret-key-longer-than-32-characters-x', COS_BACKUP_KEY: 'draft-backup-key-longer-than-32-characters-x', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const json = async (m, p, b, c) => { const r = await req(m, p, b, c); const text = await r.text(); return { status: r.status, body: text ? JSON.parse(text) : null }; };
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const stop = async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } };
  return { json, req, login, stop };
}

test('a member finishes and deletes their own draft, and only their own', { timeout: 60000 }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-draft-'));
  const s = await start(temp);
  t.after(async () => { await s.stop(); fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const admin = await s.login('admin@zencrevia.demo', 'Draft!Admin2345');
  const boot = (await s.json('GET', '/api/bootstrap', undefined, admin)).body;
  const wf = (boot.ws || boot.workspace).workflow, first = wf[0].id, later = wf[1].id;
  const members = Object.keys(boot.people).filter(id => id !== 'admin' && !boot.people[id].stakeholder).slice(0, 2);
  const as = async id => { await s.req('PUT', '/api/members/' + id, Object.assign({}, boot.people[id], { id, perm: 'member' }), admin); await s.req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return s.login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const [me, other] = [await as(members[0]), await as(members[1])];
  const draft = (by, title) => ({ title, status: first, prio: 'medium', assignee: null, assignees: [], reviewer: null, reviewers: [], createdBy: by, meta: { draft: { status: later, assignees: [by], reviewers: [], by, at: new Date().toISOString() } } });

  /* kept: first stage, no one on it */
  let r = await s.json('POST', '/api/tasks', draft(members[0], 'Half-written brief'), me);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const id = r.body.id;
  assert.equal(r.body.status, first); assert.deepEqual(r.body.assignees, []); assert.ok(r.body.meta.draft, 'marked as a draft');

  /* its maker edits it; someone else may not */
  r = await s.json('PUT', '/api/tasks/' + id, Object.assign({}, r.body, { title: 'Half-written brief, better' }), me);
  assert.equal(r.status, 200, 'the maker edits their draft: ' + JSON.stringify(r.body));
  assert.equal((await s.json('PUT', '/api/tasks/' + id, Object.assign({}, r.body, { title: 'not yours' }), other)).status, 403);
  assert.equal((await s.json('DELETE', '/api/tasks/' + id, undefined, other)).status, 403, 'nor delete it');

  /* finishing it: the stage and the people chosen come back, and it is an ordinary task from then on */
  const done = Object.assign({}, r.body, { status: later, assignee: members[0], assignees: [members[0]], meta: {} });
  r = await s.json('PUT', '/api/tasks/' + id, done, me);
  assert.equal(r.status, 200, 'the maker finishes it: ' + JSON.stringify(r.body));
  assert.equal(r.body.status, later); assert.deepEqual(r.body.assignees, [members[0]]); assert.ok(!r.body.meta.draft);
  assert.equal((await s.json('DELETE', '/api/tasks/' + id, undefined, me)).status, 403, 'no longer a draft: deleting needs the capability again');

  /* a draft thrown away by its maker */
  const gone = (await s.json('POST', '/api/tasks', draft(members[0], 'Closed by mistake'), me)).body.id;
  assert.equal((await s.json('DELETE', '/api/tasks/' + gone, undefined, me)).status, 200);
  assert.equal((await s.json('GET', '/api/tasks/' + gone, undefined, admin)).status, 404);
});
