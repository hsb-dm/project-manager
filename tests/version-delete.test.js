/* A version made by mistake can be deleted; an approved one cannot. Whoever takes a version away,
   the task's history says so. The browser shows Delete only on the newest undecided version
   (e2e/version-delete.spec.js); the server refuses the approved one whatever the browser sends. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-verdel-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'VerDel!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'verdel-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'verdel-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'VerDel!Admin23456');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const get = async id => (await req('GET', '/api/tasks/' + id, undefined, admin)).json();
  return { req, admin, as, get };
}

test('a version made by mistake is deleted and recorded; an approved one stays', { timeout: 30000 }, async t => {
  const s = await start(t);
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json();
  const pick = boot.tasks.find(x => x.versions && x.versions.length && x.assignee && x.reviewer && x.assignee !== x.reviewer && x.assignee !== 'admin' && x.reviewer !== 'admin');
  assert.ok(pick, 'the demo has a task with a version, an assignee and a reviewer');
  const id = pick.id, A = pick.assignee, R = pick.reviewer;
  const designer = await s.as(A), reviewer = await s.as(R);
  const put = (doc, who) => s.req('PUT', '/api/tasks/' + id, doc, who);
  const top = doc => doc.versions.reduce((m, v) => Math.max(m, v.n), 0);

  /* the designer adds one by mistake, then deletes it */
  let doc = await s.get(id); const n = top(doc) + 1;
  doc.versions.push({ id: 'ver_oops', n, by: A, state: 'pending', color: '#1D4ED8', note: 'wrong file', driveUrl: 'https://example.org/oops.png', annots: [] });
  let r = await put(doc, designer); assert.equal(r.status, 200, await r.clone().text());
  doc = await s.get(id); assert.equal(top(doc), n);
  doc.versions = doc.versions.filter(v => v.n !== n);
  r = await put(doc, designer); assert.equal(r.status, 200, await r.clone().text());
  doc = await s.get(id);
  assert.ok(!doc.versions.some(v => v.n === n), 'gone');
  assert.ok(doc.activity.some(a => a.k === 'version_deleted' && a.who === A && JSON.stringify(a).includes('"v":' + n)), 'in the history');

  /* approved, it is part of the record: nobody takes it away, not even an admin */
  doc = await s.get(id); const last = doc.versions[doc.versions.length - 1];
  last.state = 'approved';
  r = await put(doc, reviewer); assert.equal(r.status, 200, await r.clone().text());
  for (const who of [designer, s.admin]) {
    doc = await s.get(id);
    doc.versions = doc.versions.filter(v => v.n !== last.n);
    r = await put(doc, who); assert.equal(r.status, 400, await r.clone().text());
    assert.ok((await s.get(id)).versions.some(v => v.n === last.n && v.state === 'approved'));
  }
});
