/* v29 readiness — behavioural tests against a real production-mode server process.
   Unlike most UI tests in this folder these do not grep source; they make HTTP calls. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');

const root = path.join(__dirname, '..');

async function startServer(t, extraEnv) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-v29-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], {
    cwd: root,
    env: Object.assign({}, process.env, {
      NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp,
      COS_ADMIN_PASSWORD: 'Readiness!Admin234', COS_ADMIN_EMAIL: 'ops@zencrevia.test', COS_ADMIN_NAME: 'Rina Operasional',
      COS_SECRET_KEY: 'v29-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'v29-backup-key-longer-than-32-characters!!',
      COS_ALLOW_REGISTRATION: '0', COS_BACKUP_INTERVAL_HOURS: '', COS_SEED_DEMO: ''
    }, extraEnv || {})
  });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); }
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  let out = '';
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start: ' + out)), 8000);
    child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(timer); resolve(+m[1]); } });
    child.stderr.on('data', d => { out += d; });
    child.once('exit', c => { clearTimeout(timer); reject(new Error('exited ' + c + ': ' + out)); });
  });
  const base = 'http://127.0.0.1:' + port;
  const req = (method, p, body, cookie, headers) => fetch(base + p, { method, headers: Object.assign({ 'content-type': 'application/json', origin: base }, cookie ? { cookie } : {}, headers || {}), body: body === undefined ? undefined : JSON.stringify(body) });
  const login = async (email, password) => { const r = await req('POST', '/api/auth/login', { email, password }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  return { base, req, login, temp, output: () => out };
}

test('clean production install: no demo data, configured admin, one-time setup', { timeout: 20000 }, async t => {
  const s = await startServer(t);
  assert.match(s.output(), /clean ZenCrevia workspace/);
  const admin = await s.login('ops@zencrevia.test', 'Readiness!Admin234');
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, admin)).json();
  assert.deepEqual(Object.keys(boot.people), ['admin']);
  assert.equal(boot.people.admin.name, 'Rina Operasional');
  assert.equal(boot.tasks.length, 0);
  assert.equal(boot.projects.length, 0);
  assert.equal(boot.teams.length, 0);
  assert.equal(boot.assets.length, 0);
  assert.ok(Array.isArray(boot.ws.workflow) && boot.ws.workflow.length > 3, 'workflow configuration is kept');
  const demo = await s.req('POST', '/api/auth/login', { email: 'admin@zencrevia.demo', password: 'Readiness!Admin234' });
  assert.equal(demo.status, 401);
});

test('app shell is compressed, cacheable by ETag, and small', { timeout: 20000 }, async t => {
  const s = await startServer(t);
  const r = await fetch(s.base + '/', { headers: { 'accept-encoding': 'br, gzip' } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-encoding'), 'br');
  assert.equal(r.headers.get('cache-control'), 'no-cache');
  const etag = r.headers.get('etag'); assert.ok(etag);
  const wire = Number(r.headers.get('content-length'));
  assert.ok(wire < 700 * 1024, 'compressed shell under 700 KB, got ' + wire);
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'));
  assert.ok(html.length < 2.2 * 1024 * 1024, 'uncompressed shell under 2.2 MB');
  const again = await fetch(s.base + '/', { headers: { 'if-none-match': etag } });
  assert.equal(again.status, 304);
  const gz = await new Promise((res, rej) => require('node:http').get(s.base + '/', { headers: { 'accept-encoding': 'gzip' } }, m => { const c = []; m.on('data', d => c.push(d)); m.on('end', () => res({ enc: m.headers['content-encoding'], body: Buffer.concat(c) })); m.on('error', rej); }));
  assert.equal(gz.enc, 'gzip');
  assert.equal(zlib.gunzipSync(gz.body).length, html.length);
  for (const p of ['/package.json', '/server/server.js', '/data/creative-os.db', '/.env.example', '/README.md']) assert.equal((await fetch(s.base + p)).status, 404, p);
});

test('notification sound is a real, small, audio-only MP3', () => {
  const mp3 = fs.readFileSync(path.join(root, 'src', 'sounds', 'zen-chime.mp3'));
  assert.ok(mp3.length < 16 * 1024, 'chime under 16 KB');
  const id3 = mp3.subarray(0, 3).toString() === 'ID3';
  let off = 0; if (id3) off = 10 + ((mp3[6] & 0x7f) << 21 | (mp3[7] & 0x7f) << 14 | (mp3[8] & 0x7f) << 7 | (mp3[9] & 0x7f));
  assert.equal(mp3[off], 0xFF, 'MPEG audio frame sync');
  assert.equal((mp3[off + 1] & 0xE0), 0xE0, 'MPEG audio frame sync');
  assert.equal((mp3[off + 1] >> 1) & 0x3, 1, 'Layer III');
  assert.notEqual(mp3.readUInt32BE(0), 0x000001BA, 'not an MPEG program stream');
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  assert.ok(html.includes('data:audio/mpeg;base64,' + mp3.toString('base64')), 'build inlines the new chime');
});

test('authorization and validation hardening', { timeout: 20000 }, async t => {
  const s = await startServer(t);
  const admin = await s.login('ops@zencrevia.test', 'Readiness!Admin234');
  // create a member and a task
  let r = await s.req('POST', '/api/members', { id: 'mira', name: 'Mira Member', email: 'mira@zencrevia.test', perm: 'member', teams: [] }, admin); assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await s.req('POST', '/api/members', { name: '' }, admin)).status, 400);
  assert.equal((await s.req('POST', '/api/members', { name: 'Dup', email: 'mira@zencrevia.test' }, admin)).status, 409);
  assert.equal((await s.req('POST', '/api/members/mira/password', { password: 'Member!Pass23456' }, admin)).status, 200);
  const mira = await s.login('mira@zencrevia.test', 'Member!Pass23456');
  const task = await (await s.req('POST', '/api/tasks', { title: 'Readiness task', status: 'backlog' }, admin)).json();

  // partial member edits merge instead of crashing, and never escalate
  r = await s.req('PUT', '/api/members/mira', { name: 'Mira M.' }, mira); assert.equal(r.status, 200, await r.clone().text());
  r = await s.req('PUT', '/api/members/mira', { perm: 'admin' }, mira); assert.equal(r.status, 200);
  assert.equal((await (await s.req('GET', '/api/bootstrap', undefined, admin)).json()).people.mira.perm, 'member');

  // saved views: validated, owner-only
  assert.equal((await s.req('POST', '/api/views', {}, admin)).status, 400);
  r = await s.req('POST', '/api/views', { id: 'sv_ops', name: 'Ops view', type: 'list' }, admin); assert.equal(r.status, 200);
  assert.equal((await s.req('PUT', '/api/views/sv_ops', { name: 'hijacked', type: 'list' }, mira)).status, 404);
  await s.req('POST', '/api/views', { id: 'sv_ops', name: 'hijacked', type: 'list' }, mira);
  const views = await (await s.req('GET', '/api/bootstrap', undefined, admin)).json();
  assert.equal(views.savedViews.find(v => v.id === 'sv_ops').name, 'Ops view');

  // notifications: known kind, real entity, bounded, rate limited
  assert.equal((await s.req('POST', '/api/notifications', { k: 'mention', t: 'NOPE-1', recipients: ['admin'] }, mira)).status, 404);
  assert.equal((await s.req('POST', '/api/notifications', { k: 'phish', t: task.id, recipients: ['admin'] }, mira)).status, 400);
  assert.equal((await s.req('POST', '/api/notifications', { k: 'mention', t: task.id, recipients: Array.from({ length: 30 }, (_, i) => 'u' + i) }, mira)).status, 400);
  assert.equal((await s.req('POST', '/api/notifications', { k: 'mention', t: task.id, recipients: ['admin'] }, mira)).status, 200);
  let limited = false; for (let i = 0; i < 70 && !limited; i++) limited = (await s.req('POST', '/api/notifications', { k: 'mention', t: task.id, recipients: ['admin'] }, mira)).status === 429;
  assert.ok(limited, 'per-sender notification rate limit');

  // test email: admin only, no filesystem path leak
  assert.equal((await s.req('POST', '/api/mail/test', {}, mira)).status, 403);
  const mail = await (await s.req('POST', '/api/mail/test', {}, admin)).json();
  assert.ok(!String(mail.result && mail.result.file).includes(path.sep), 'basename only');

  // deactivate keeps work, blocks sign-in
  assert.equal((await s.req('POST', '/api/members/mira/active', { active: false }, admin)).status, 200);
  assert.equal((await s.req('GET', '/api/bootstrap', undefined, mira)).status, 401);
  assert.equal((await s.req('POST', '/api/auth/login', { email: 'mira@zencrevia.test', password: 'Member!Pass23456' })).status, 401);
});

test('backup schedule follows the dashboard setting; environment override is reported', { timeout: 20000 }, async t => {
  const s = await startServer(t);
  const admin = await s.login('ops@zencrevia.test', 'Readiness!Admin234');
  let d = await (await s.req('GET', '/api/backups', undefined, admin)).json();
  assert.equal(d.schedule.source, 'default'); assert.equal(d.schedule.intervalHours, 24);
  await s.req('PUT', '/api/backups/settings', { auto: 'weekly', keep: 10 }, admin);
  d = await (await s.req('GET', '/api/backups', undefined, admin)).json();
  assert.deepEqual([d.schedule.source, d.schedule.intervalHours], ['dashboard', 168]);
  await s.req('PUT', '/api/backups/settings', { auto: 'off' }, admin);
  d = await (await s.req('GET', '/api/backups', undefined, admin)).json();
  assert.equal(d.schedule.intervalHours, 0);
});

test('backup schedule environment override', { timeout: 20000 }, async t => {
  const s = await startServer(t, { COS_BACKUP_INTERVAL_HOURS: '6' });
  const admin = await s.login('ops@zencrevia.test', 'Readiness!Admin234');
  await s.req('PUT', '/api/backups/settings', { auto: 'off' }, admin);
  const d = await (await s.req('GET', '/api/backups', undefined, admin)).json();
  assert.deepEqual([d.schedule.source, d.schedule.intervalHours], ['environment', 6]);
});

test('demo seed stays available on request', { timeout: 20000 }, async t => {
  const s = await startServer(t, { COS_SEED_DEMO: '1', COS_ADMIN_EMAIL: '' });
  const admin = await s.login('admin@zencrevia.demo', 'Readiness!Admin234');
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, admin)).json();
  assert.ok(boot.tasks.length > 10); assert.ok(Object.keys(boot.people).length > 5);
});
