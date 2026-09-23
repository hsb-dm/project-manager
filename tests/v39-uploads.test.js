/* v39 — images on disk instead of inside the database (architecture review P1). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');
const PNG = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'e2e/fixtures/red.png')).toString('base64');

async function start(t, temp) {
  temp = temp || fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-v39-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'V39!Admin23456', COS_ADMIN_EMAIL: 'ops@hsb.co.id', COS_SECRET_KEY: 'v39-secret-key-long-enough-0123456789', COS_BACKUP_KEY: 'v39-backup-key-long-enough-9876543210', COS_SECURE_COOKIE: '0', APP_URL: 'http://127.0.0.1', COS_SEED_DEMO: '0' }) });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => rej(new Error('exit ' + c + ' ' + out))); });
  const stop = async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } };
  t.after(async () => { await stop(); fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const r = await req('POST', '/api/auth/login', { email: 'ops@hsb.co.id', password: 'V39!Admin23456' });
  return { base, req, admin: r.headers.get('set-cookie').split(';')[0], temp, stop, out: () => out };
}
const newTask = (id, extra) => Object.assign({ id, title: 'With images', proj: null, status: 'backlog', assignee: 'admin', versions: [], files: [], comments: [], activity: [] }, extra || {});

test('a data URL sent with a task is stored once on disk and never again in the task', { timeout: 30000 }, async t => {
  const s = await start(t);
  let r = await s.req('POST', '/api/tasks', newTask('T-101', { versions: [{ n: 1, by: 'admin', state: 'pending', img: PNG, annots: [] }], files: [{ name: 'red.png', type: 'image', source: 'local', preview: PNG }] }), s.admin);
  assert.equal(r.status, 200, await r.clone().text()); const tk = await r.json();
  assert.match(tk.versions[0].img, /^\/files\/[a-f0-9]{64}\.png$/); assert.equal(tk.files[0].preview, tk.versions[0].img, 'same bytes, one file');
  assert.ok(JSON.stringify(tk).length < 3000, 'the task no longer carries the image');
  const img = await fetch(s.base + tk.versions[0].img, { headers: { cookie: s.admin } });
  assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/png'); assert.match(img.headers.get('cache-control'), /immutable/);
  assert.equal((await fetch(s.base + tk.versions[0].img)).status, 401, 'files need a session');
  /* a later edit sends the short URL back: accepted as-is */
  r = await s.req('PUT', '/api/tasks/T-101', Object.assign({}, tk, { title: 'renamed' }), s.admin); assert.equal(r.status, 200, await r.clone().text());
  /* a path that is not one of our uploads is refused */
  r = await s.req('POST', '/api/tasks', newTask('T-102', { files: [{ name: 'x', type: 'image', source: 'local', preview: '/files/' + 'a'.repeat(64) + '.png' }] }), s.admin);
  assert.equal(r.status, 400);
  /* backups carry the images (encrypted, incremental) */
  r = await s.req('POST', '/api/backups', {}, s.admin); assert.equal(r.status, 200, await r.clone().text());
  const mirror = path.join(s.temp, 'backups', 'uploads'); assert.equal(fs.readdirSync(mirror).filter(n => n.endsWith('.enc')).length, 1);
  /* a file lost from disk comes back from the backup mirror */
  const name = tk.versions[0].img.slice(7); fs.rmSync(path.join(s.temp, 'uploads', name.slice(0, 2), name));
  assert.equal((await fetch(s.base + tk.versions[0].img, { headers: { cookie: s.admin } })).status, 200);
});

test('existing base64 images are moved out of the database on start', { timeout: 30000 }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-v39m-'));
  let s = await start({ after() {} }, temp);
  await s.req('POST', '/api/tasks', newTask('T-101'), s.admin); await s.stop();
  const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(path.join(temp, 'creative-os.db'));
  db.prepare("INSERT INTO file_versions (id,task_id,version_number,preview_data,approval_status,annotations,created_at) VALUES ('v1','T-101',1,?,'pending','[]',datetime('now'))").run(PNG);
  db.prepare("DELETE FROM app_meta WHERE key='uploads_migrated'").run(); db.close();
  s = await start(t, temp);
  assert.match(s.out(), /moved images out of the database/);
  const tk = await (await s.req('GET', '/api/tasks/T-101', undefined, s.admin)).json();
  assert.match(tk.versions[0].img, /^\/files\//);
});

test('two people creating a task at once both get one: the server assigns the next number', { timeout: 30000 }, async t => {
  const s = await start(t);
  const [a, b] = await Promise.all([s.req('POST', '/api/tasks', newTask('T-101', { title: 'A' }), s.admin), s.req('POST', '/api/tasks', newTask('T-101', { title: 'B' }), s.admin)]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  const ids = [(await a.json()).id, (await b.json()).id].sort(); assert.deepEqual(ids, ['T-101', 'T-102']);
  assert.equal((await (await s.req('GET', '/api/tasks/T-101', undefined, s.admin)).json()).title.length, 1, 'nothing overwritten');
});
