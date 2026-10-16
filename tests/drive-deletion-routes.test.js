/* Google Drive deletion sync, through the routes (server/server.js): only who manages cloud storage sees and changes
   it; sync cannot be turned on without a connected account; a file used anywhere is refused; deleting with sync off
   deletes it in ZenCrevia only; Undo keeps it; what happened is in the history. Drive itself: tests/drive-trash.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const root = path.join(__dirname, '..');
const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz_routes-01';

test('Storage & Deletion: who may, what is refused, and deleting a file in ZenCrevia only', { timeout: 90000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-ddel-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: dir, COS_ADMIN_PASSWORD: 'DDel!Admin2345678', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'ddel-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'ddel-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 10000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'DDel!Admin2345678');
  const boot = await (await req('GET', '/api/bootstrap', undefined, admin)).json();
  const memberId = Object.keys(boot.people).find(id => boot.people[id].perm === 'member' && !boot.people[id].stakeholder);
  assert.ok((await req('POST', '/api/members/' + memberId + '/password', { password: 'Member!Pass2345' }, admin)).ok);
  const member = await login(boot.people[memberId].email, 'Member!Pass2345');

  /* nothing yet, and off */
  let v = await (await req('GET', '/api/cloud/gdrive/deletion', undefined, admin)).json();
  assert.equal(v.settings.deletionSync, false, 'off until an admin turns it on'); assert.equal(v.settings.mode, 'trash'); assert.equal(v.drive.shared, false); assert.deepEqual(v.files, []);
  /* a member: none of it */
  assert.equal((await req('GET', '/api/cloud/gdrive/deletion', undefined, member)).status, 403);
  assert.equal((await req('PUT', '/api/cloud/gdrive/deletion', { deletionSync: false }, member)).status, 403);
  /* no connected account: sync cannot be turned on */
  let r = await req('PUT', '/api/cloud/gdrive/deletion', { deletionSync: true }, admin);
  assert.equal(r.status, 409); assert.match((await r.json()).error, /Connect the shared Google Drive account first/);
  r = await req('PUT', '/api/cloud/gdrive/deletion', { showErrors: false }, admin);
  assert.equal(r.status, 200); assert.equal((await r.json()).settings.showErrors, false);

  /* a file ZenCrevia uploaded (written as the upload route writes it) */
  const db = new DatabaseSync(path.join(dir, 'creative-os.db'));
  db.prepare("INSERT INTO drive_uploads (drive_id, workspace_id, name, size_label, account, uploaded_by, created_at) VALUES (?, ?, 'campaign-hero.png', '1.2 MB', 'team@example.com', 'admin', ?)").run(ID, boot.ws.id, new Date().toISOString());
  db.close();
  v = await (await req('GET', '/api/cloud/gdrive/deletion', undefined, admin)).json();
  assert.deepEqual(v.files.map(f => [f.name, f.status, f.usage]), [['campaign-hero.png', 'active', 0]]);
  assert.equal((await req('POST', '/api/cloud/gdrive/files/' + ID + '/delete', {}, member)).status, 403, 'a member cannot delete everywhere');
  assert.equal((await req('POST', '/api/cloud/gdrive/files/not-ours-0123456789/delete', {}, admin)).status, 404, 'a link someone pasted is not ours');

  /* used in a task's description: refused, with where */
  const task = await (await req('POST', '/api/tasks', { title: 'Hero', status: boot.ws.workflow[0].id, prio: 'medium', description: 'Use https://drive.google.com/file/d/' + ID + '/view' }, admin)).json();
  const usage = (await (await req('GET', '/api/cloud/gdrive/files/' + ID + '/usage', undefined, admin)).json()).usage;
  assert.deepEqual(usage.map(u => [u.where, u.id]), [['Description', task.id]]);
  r = await req('POST', '/api/cloud/gdrive/files/' + ID + '/delete', {}, admin);
  assert.equal(r.status, 409); assert.match((await r.json()).error, /still used in 1 place/);
  /* removed there: deleted in ZenCrevia only (sync is off), once however often it is asked */
  const d = await (await req('GET', '/api/tasks/' + task.id, undefined, admin)).json(); d.description = 'Use the new one';
  assert.ok((await req('PUT', '/api/tasks/' + task.id, d, admin)).ok);
  r = await req('POST', '/api/cloud/gdrive/files/' + ID + '/delete', {}, admin);
  assert.equal(r.status, 200); assert.equal((await r.json()).status, 'deleted_local');
  assert.equal((await (await req('POST', '/api/cloud/gdrive/files/' + ID + '/delete', {}, admin)).json()).status, 'deleted_local');
  assert.equal((await req('POST', '/api/cloud/gdrive/files/' + ID + '/retry', {}, admin)).status, 409, 'only a failed sync is retried');
  /* Undo */
  r = await req('POST', '/api/cloud/gdrive/files/' + ID + '/restore', {}, admin);
  assert.equal((await r.json()).status, 'active');
  /* in the history */
  const acts = (await (await req('GET', '/api/bootstrap', undefined, admin)).json()).activity || [];
  assert.ok(JSON.stringify(acts).includes('deleted “campaign-hero.png” from ZenCrevia'), 'recorded');
});
