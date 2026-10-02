/* A version's notes — what the reviewer wants changed — belong to the server, like comments: a new
   note is stamped with who wrote it and when, an existing one keeps its text and author, only its
   done tick can change, and only its author or an admin can take it away. A picture on a note is an
   uploaded image or nothing. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-notes-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Notes!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'notes-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'notes-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Notes!Admin23456');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const get = async id => (await req('GET', '/api/tasks/' + id, undefined, admin)).json();
  return { req, admin, as, get };
}

test('notes are stamped by the server, keep their words, and are removed only by their author or an admin', { timeout: 30000 }, async t => {
  const s = await start(t);
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json();
  const pick = boot.tasks.find(x => x.versions && x.versions.length && x.assignee && x.reviewer && x.assignee !== x.reviewer && x.assignee !== 'admin' && x.reviewer !== 'admin');
  assert.ok(pick, 'the demo has a task with a version, an assignee and a reviewer');
  const id = pick.id, A = pick.assignee, R = pick.reviewer;
  const designer = await s.as(A), reviewer = await s.as(R);
  const last = doc => doc.versions[doc.versions.length - 1];
  const put = (doc, who) => s.req('PUT', '/api/tasks/' + id, doc, who);

  /* pins saved before notes had ids are read with the same id every time */
  const first = await s.get(id), again = await s.get(id);
  assert.deepEqual(last(first).annots.map(n => n.id), last(again).annots.map(n => n.id));
  assert.ok(last(first).annots.every(n => n.id));
  const pinsBefore = last(first).annots.length;

  /* the reviewer writes a note, claiming to be someone else, long ago, already done */
  let doc = await s.get(id);
  last(doc).annots.push({ id: 'an_r1', text: '  Headline too small  ', by: 'admin', at: '2000-01-01T00:00:00.000Z', done: true, doneBy: 'admin' });
  let r = await put(doc, reviewer); assert.equal(r.status, 200, await r.clone().text());
  let note = last(await s.get(id)).annots.find(n => n.id === 'an_r1');
  assert.equal(note.text, 'Headline too small');
  assert.equal(note.by, R, 'written by whoever saved it');
  assert.ok(Date.now() - new Date(note.at).getTime() < 60000, 'stamped now');
  assert.equal(note.done, false); assert.equal(note.doneBy, null);
  assert.ok((await s.get(id)).activity.some(a => a.k === 'note' && a.who === R), 'in the history');

  /* the designer cannot reword it or take it away, only tick it off */
  doc = await s.get(id);
  last(doc).annots.find(n => n.id === 'an_r1').text = 'Looks great';
  r = await put(doc, designer); assert.equal(r.status, 200);
  doc = await s.get(id);
  last(doc).annots = last(doc).annots.filter(n => n.id !== 'an_r1');
  r = await put(doc, designer); assert.equal(r.status, 200);
  note = last(await s.get(id)).annots.find(n => n.id === 'an_r1');
  assert.ok(note, 'still there'); assert.equal(note.text, 'Headline too small');
  doc = await s.get(id);
  last(doc).annots.find(n => n.id === 'an_r1').done = true;
  r = await put(doc, designer); assert.equal(r.status, 200);
  note = last(await s.get(id)).annots.find(n => n.id === 'an_r1');
  assert.equal(note.done, true); assert.equal(note.doneBy, A);
  assert.ok(note.doneAt);

  /* a picture is an uploaded image, never a link to somewhere else */
  doc = await s.get(id);
  last(doc).annots.push({ id: 'an_hot', text: 'see', img: 'https://evil.example/x.png' });
  r = await put(doc, designer); assert.equal(r.status, 400);
  assert.match((await r.json()).error, /Note picture/);
  doc = await s.get(id);
  last(doc).annots.push({ id: 'an_pic', text: '', img: PNG });
  r = await put(doc, designer); assert.equal(r.status, 200, await r.clone().text());
  note = last(await s.get(id)).annots.find(n => n.id === 'an_pic');
  assert.match(note.img, /^\/files\/[0-9a-f]{64}\.png$/, 'stored on the server');

  /* the author removes their own; nothing else goes with it */
  doc = await s.get(id);
  last(doc).annots = last(doc).annots.filter(n => n.id !== 'an_r1');
  r = await put(doc, reviewer); assert.equal(r.status, 200);
  const after = last(await s.get(id)).annots;
  assert.equal(after.some(n => n.id === 'an_r1'), false);
  assert.equal(after.length, pinsBefore + 1, 'the pins and the picture note are kept');

  /* a version made with the task carries no forged notes either */
  r = await s.req('POST', '/api/tasks', { title: 'Notes on create', status: boot.workflow ? boot.workflow[0].id : 'todo', versions: [{ n: 1, state: 'pending', annots: [{ id: 'an_c', text: 'x', by: 'ghost', done: true }] }] }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  const made = await r.json();
  assert.equal(made.versions[0].annots[0].by, 'admin'); assert.equal(made.versions[0].annots[0].done, false);
});
