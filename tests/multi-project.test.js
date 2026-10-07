/* One task can be in more than one project — it can serve two campaigns — or in none for now.
   Its own project comes first (proj); the others are listed in alsoIn: real projects of the workspace,
   each once, at most five. Project analytics count a shared task in each of its projects, and deleting
   a project moves a task that is also in another project there instead of deleting it. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-multiproj-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'MultiProj!Admin2345', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'multiproj-secret-key-longer-than-32-characters!', COS_BACKUP_KEY: 'multiproj-backup-key-longer-than-32-characters!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const r = await req('POST', '/api/auth/login', { email: 'admin@zencrevia.demo', password: 'MultiProj!Admin2345' });
  assert.equal(r.status, 200, await r.clone().text());
  const admin = r.headers.get('set-cookie').split(';')[0];
  const boot = await (await req('GET', '/api/bootstrap', undefined, admin)).json();
  return { req, admin, boot };
}

test('a task in two projects, in none, and through a project being deleted', { timeout: 30000 }, async t => {
  const s = await start(t);
  const stage = (s.boot.ws || s.boot.workspace).workflow[0].id;
  const mk = async name => { const r = await s.req('POST', '/api/projects', { id: 'p_' + name, name, status: 'active' }, s.admin); assert.equal(r.status, 200, await r.clone().text()); return 'p_' + name; };
  const A = await mk('spring'), B = await mk('ramadan');
  const get = async id => (await s.req('GET', '/api/tasks/' + id, undefined, s.admin)).json();

  /* in A and B; nonsense and repeats are dropped */
  let r = await s.req('POST', '/api/tasks', { title: 'Shared banner', status: stage, prio: 'medium', proj: A, alsoIn: [B, 'p_nope', A, B] }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  const shared = (await r.json()).id;
  let doc = await get(shared); assert.equal(doc.proj, A); assert.deepEqual(doc.alsoIn, [B]);
  r = await s.req('POST', '/api/tasks', { title: 'Only spring', status: stage, prio: 'medium', proj: A }, s.admin);
  const only = (await r.json()).id;

  /* with no project of its own, the first other one becomes it */
  r = await s.req('POST', '/api/tasks', { title: 'Late pick', status: stage, prio: 'medium', proj: null, alsoIn: [B] }, s.admin);
  const late = (await r.json()).id;
  doc = await get(late); assert.equal(doc.proj, B); assert.deepEqual(doc.alsoIn, []);
  /* "select project later": in none for now */
  doc.proj = null; doc.alsoIn = [];
  assert.equal((await s.req('PUT', '/api/tasks/' + late, doc, s.admin)).status, 200);
  doc = await get(late); assert.equal(doc.proj, null); assert.deepEqual(doc.alsoIn, []);

  /* analytics count the shared task in both */
  const an = await (await s.req('GET', '/api/analytics', undefined, s.admin)).json();
  const byP = id => (an.byProject || []).find(p => p.id === id) || {};
  assert.equal(byP(A).open, 2, JSON.stringify(an.byProject));
  assert.equal(byP(B).open, 1);

  /* deleting A: the shared task moves to B; the task only in A goes */
  assert.equal((await s.req('DELETE', '/api/projects/' + A, undefined, s.admin)).status, 200);
  doc = await get(shared); assert.equal(doc.proj, B); assert.deepEqual(doc.alsoIn, []);
  assert.equal((await s.req('GET', '/api/tasks/' + only, undefined, s.admin)).status, 404);
});
