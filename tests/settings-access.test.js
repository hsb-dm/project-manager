/* E-mail delivery, cloud storage and backups each answer to a capability of their own (Oct 2026) — they all came under
   manage_workspace, so an admin could not hand one over without the whole workspace. A role that could manage the
   workspace is given the three once, so nobody loses what they could do. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');

/* every server a test starts is stopped before its folder goes (Windows will not remove a database still open) */
function place(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-access-')), servers = []; t.after(async () => { for (const s of servers) await s.stop(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }); return { dir, servers }; }
async function start(t, at) { const temp = at.dir;
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Access!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'access-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'access-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0', COS_MAIL_TRANSPORT: 'log', APP_URL: 'https://zen.hsb-test.dev' }) });
  /* stopped by a signal, a process keeps exitCode null — signalCode says it is gone, so a second stop does not wait forever */
  const stop = async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } };
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Access!Admin23456');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const boot = await (await req('GET', '/api/bootstrap', undefined, admin)).json();
  const s = { req, admin, as, boot, stop }; at.servers.push(s); return s;
}

test('e-mail delivery, cloud storage and backups each answer to their own capability, not the whole workspace', { timeout: 40000 }, async t => {
  const s = await start(t, place(t));
  const m = Object.keys(s.boot.people).find(id => id !== 'admin' && s.boot.people[id].perm === 'member' && !s.boot.people[id].stakeholder);
  const mc = await s.as(m), role = s.boot.roles.find(r => r.id === 'member');
  const give = caps => s.req('PUT', '/api/roles/member', Object.assign({}, role, { permissions: role.permissions.concat(caps) }), s.admin);
  const status = async p => (await s.req('GET', p, undefined, mc)).status;
  const areas = { email: ['/api/mail/smtp', '/api/mail/log', '/api/mail/status'], cloud: ['/api/cloud/gdrive/status'], backups: ['/api/backups'] };
  for (const list of Object.values(areas)) for (const p of list) assert.equal(await status(p), 403, 'a member: ' + p);
  /* e-mail only */
  assert.equal((await give(['manage_email'])).status, 200);
  for (const p of areas.email) assert.equal(await status(p), 200, 'with manage_email: ' + p);
  for (const p of areas.cloud.concat(areas.backups)) assert.equal(await status(p), 403, 'still not: ' + p);
  assert.equal((await s.req('PUT', '/api/workspace', s.boot.ws, mc)).status, 403, 'nor the workspace itself');
  /* the other two, each on its own */
  assert.equal((await give(['manage_cloud_storage'])).status, 200);
  assert.equal(await status('/api/cloud/gdrive/status'), 200);
  assert.equal(await status('/api/backups'), 403);
  assert.equal((await give(['manage_backups'])).status, 200);
  assert.equal(await status('/api/backups'), 200);
  /* listed for Roles & permissions */
  for (const c of ['manage_email', 'manage_cloud_storage', 'manage_backups', 'choose_notifications', 'send_announcements']) assert.ok(s.boot.caps.some(x => x[0] === c), c);
});

test('a role that could manage the workspace is given the three once — and keeps what is decided after', { timeout: 40000 }, async t => {
  const at = place(t), temp = at.dir;
  let s = await start(t, at);
  await s.stop();
  /* a role from before: it manages the workspace, and the three did not exist */
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(temp, 'creative-os.db'));
  db.prepare("INSERT INTO roles (id, name, description, permissions, rank, is_system, sort_order) VALUES ('ops', 'Ops', '', ?, 50, 0, 99)").run(JSON.stringify(['manage_workspace', 'view_all']));
  db.prepare("DELETE FROM app_meta WHERE key='caps_settings_areas'").run();
  db.close();
  s = await start(t, at);
  let ops = (await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).roles.find(r => r.id === 'ops');
  assert.deepEqual(['manage_email', 'manage_cloud_storage', 'manage_backups', 'manage_notification_settings'].filter(c => ops.permissions.includes(c)), ['manage_email', 'manage_cloud_storage', 'manage_backups', 'manage_notification_settings']);
  const member = (await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).roles.find(r => r.id === 'member');
  assert.ok(!member.permissions.includes('manage_email'), 'a role that could not manage the workspace is not given them');
  /* taken away afterwards, it stays away */
  assert.equal((await s.req('PUT', '/api/roles/ops', Object.assign({}, ops, { permissions: ops.permissions.filter(c => c !== 'manage_backups') }), s.admin)).status, 200);
  await s.stop(); s = await start(t, at);
  ops = (await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).roles.find(r => r.id === 'ops');
  assert.ok(!ops.permissions.includes('manage_backups'), 'once only');
});

test("the workspace's own notifications have a capability of their own; a whole-workspace save cannot change them without it", { timeout: 40000 }, async t => {
  const s = await start(t, place(t));
  const m = Object.keys(s.boot.people).find(id => id !== 'admin' && s.boot.people[id].perm === 'member' && !s.boot.people[id].stakeholder);
  const mc = await s.as(m), role = s.boot.roles.find(r => r.id === 'member');
  const give = caps => s.req('PUT', '/api/roles/member', Object.assign({}, role, { permissions: role.permissions.concat(caps) }), s.admin);
  const wsPrefs = async () => (await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).ws.notifPrefs || {};
  assert.equal((await s.req('PUT', '/api/workspace/notif-prefs', { notifPrefs: { status: true } }, mc)).status, 403, 'a member');
  assert.equal((await give(['manage_notification_settings'])).status, 200);
  const r = await s.req('PUT', '/api/workspace/notif-prefs', { notifPrefs: { status: true, mention: false, 'bad key!': true, email: 'yes' } }, mc);
  assert.equal(r.status, 200, await r.clone().text());
  let prefs = await wsPrefs();
  assert.equal(prefs.status, true); assert.equal(prefs.mention, false); assert.ok(!('bad key!' in prefs) && prefs.email !== 'yes', 'switches only');
  /* someone who manages the workspace but not its notifications: the whole save leaves them as they are */
  assert.equal((await give(['manage_workspace'])).status, 200);
  const ws = (await (await s.req('GET', '/api/bootstrap', undefined, mc)).json()).ws;
  assert.equal((await s.req('PUT', '/api/workspace', Object.assign({}, ws, { notifPrefs: Object.assign({}, ws.notifPrefs, { mention: true, status: false }) }), mc)).status, 200);
  prefs = await wsPrefs();
  assert.equal(prefs.mention, false); assert.equal(prefs.status, true);
});
