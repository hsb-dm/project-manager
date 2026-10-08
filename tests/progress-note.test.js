/* Progress notes on the server: a new version is the next number; only the latest can be changed; whoever
   wrote a version, or an admin, removes it; stakeholders neither see nor write them; each change is in the
   task's Activity and makes open copies refetch the task. The browser side: e2e/progress-note.spec.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));

test('progress notes: versions, permissions, privacy, activity, live', { timeout: 30000 }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-progress-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Progress!Admin234', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'progress-secret-key-longer-than-32-characters', COS_BACKUP_KEY: 'progress-backup-key-longer-than-32-characters', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const json = async (m, p, b, c) => { const r = await req(m, p, b, c); const text = await r.text(); return { status: r.status, body: text ? JSON.parse(text) : null }; };
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Progress!Admin234');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const stream = cookie => { const events = []; const r = http.get({ host: '127.0.0.1', port, path: '/api/messages/stream', headers: { cookie, origin: base } }, res => { res.setEncoding('utf8'); res.on('data', d => d.split('\n').filter(l => l.startsWith('data: ')).forEach(l => { try { events.push(JSON.parse(l.slice(6))); } catch {} })); }); r.on('error', () => {}); t.after(() => r.destroy()); return events; };
  const boot = (await json('GET', '/api/bootstrap', undefined, admin)).body;
  const tk = boot.tasks.find(x => !x._slim && x.assignee);
  const doer = tk.assignee, doerCookie = await as(doer);
  const other = Object.keys(boot.people).find(id => id !== doer && id !== 'admin' && !boot.people[id].stakeholder && boot.people[id].perm === 'member');
  const otherCookie = await as(other);
  const ev = stream(otherCookie); await wait(400);

  /* V1 by the assignee, then a change to it, then V2 */
  let r = await json('POST', '/api/tasks/' + tk.id + '/progress', { text: 'Started' }, doerCookie);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.progress.map(p => [p.v, p.text, p.by]), [[1, 'Started', doer]]);
  assert.ok(r.body.updatedAt > tk.updatedAt, 'the task is touched so open copies refetch it');
  r = await json('PUT', '/api/tasks/' + tk.id + '/progress/1', { text: 'Started, half done' }, doerCookie);
  assert.equal(r.status, 200); assert.equal(r.body.progress[0].text, 'Started, half done'); assert.equal(r.body.progress[0].editedBy, doer); assert.ok(r.body.progress[0].editedAt);
  r = await json('POST', '/api/tasks/' + tk.id + '/progress', { text: 'Done, in review' }, admin);
  assert.deepEqual(r.body.progress.map(p => p.v), [1, 2]);
  /* only the latest can change; nothing empty; not too long */
  assert.equal((await json('PUT', '/api/tasks/' + tk.id + '/progress/1', { text: 'rewrite' }, admin)).status, 409);
  assert.equal((await json('POST', '/api/tasks/' + tk.id + '/progress', { text: '   ' }, admin)).status, 400);
  assert.equal((await json('POST', '/api/tasks/' + tk.id + '/progress', { text: 'x'.repeat(20001) }, admin)).status, 413);
  /* removing: not someone else's version (unless an admin) */
  const v1Author = doer;
  const notMine = await json('DELETE', '/api/tasks/' + tk.id + '/progress/2', undefined, doerCookie);
  assert.equal(notMine.status, 403, 'V2 is the admin\'s');
  r = await json('DELETE', '/api/tasks/' + tk.id + '/progress/2', undefined, admin);
  assert.equal(r.status, 200); assert.deepEqual(r.body.progress.map(p => p.v), [1]);
  /* the next new version follows the latest there is */
  r = await json('POST', '/api/tasks/' + tk.id + '/progress', { text: 'Again' }, doerCookie);
  assert.deepEqual(r.body.progress.map(p => [p.v, p.by]), [[1, v1Author], [2, doer]]);
  /* in the Activity */
  const kinds = r.body.activity.map(a => a.k + (a.a && a.a.v ? ':' + a.a.v : ''));
  for (const k of ['progress:1', 'progress_edited:1', 'progress:2', 'progress_removed:2']) assert.ok(kinds.includes(k), k + ' in ' + kinds.join(','));
  /* live: a colleague's open copy hears the task changed */
  await wait(300);
  assert.ok(ev.some(e => e.type === 'task_changed' && e.id === tk.id), 'task_changed for ' + tk.id + ': ' + JSON.stringify(ev.map(e => e.type)));

  /* a stakeholder: nothing to see, nothing to write */
  const stake = Object.keys(boot.people).find(id => boot.people[id].stakeholder);
  if (stake) {
    const sc = await as(stake);
    const seen = await json('GET', '/api/tasks/' + tk.id, undefined, sc);
    if (seen.status === 200) assert.deepEqual(seen.body.progress, [], 'stripped for a stakeholder');
    assert.notEqual((await json('POST', '/api/tasks/' + tk.id + '/progress', { text: 'client' }, sc)).status, 200);
    const sb = (await json('GET', '/api/bootstrap', undefined, sc)).body;
    (sb.tasks || []).forEach(x => assert.deepEqual(x.progress || [], [], 'no progress in a stakeholder bootstrap'));
  }
  /* deleting the task takes its notes with it */
  assert.equal((await json('DELETE', '/api/tasks/' + tk.id, undefined, admin)).status, 200);
  const db = new (require('node:sqlite').DatabaseSync)(path.join(temp, 'creative-os.db'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM task_progress_notes WHERE task_id=?').get(tk.id).n, 0);
  db.close();
});
