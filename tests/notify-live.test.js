/* A notification reaches its recipient at once, over their live stream — task notifications (assigned,
   review, approved, comment, mention…) used to wait for the recipient's next reload. Nobody else hears
   of it. The browser side: e2e/notify-live.spec.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));

test('a notification goes to its recipient live, and only to them', { timeout: 30000 }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-notifylive-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'NotifyLive!Admin234', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'notifylive-secret-key-longer-than-32-characters', COS_BACKUP_KEY: 'notifylive-backup-key-longer-than-32-characters', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'NotifyLive!Admin234');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const stream = cookie => { const events = []; const r = http.get({ host: '127.0.0.1', port, path: '/api/messages/stream', headers: { cookie, origin: base } }, res => { res.setEncoding('utf8'); res.on('data', d => d.split('\n').filter(l => l.startsWith('data: ')).forEach(l => { try { events.push(JSON.parse(l.slice(6))); } catch {} })); }); r.on('error', () => {}); t.after(() => r.destroy()); return events; };
  const boot = await (await req('GET', '/api/bootstrap', undefined, admin)).json();
  const tk = boot.tasks.find(x => !x._slim);
  const sarah = await as('sarah'), zein = await as('zein');
  const sEv = stream(sarah), zEv = stream(zein); await wait(400);
  const r = await req('POST', '/api/notifications', { k: 'assigned', recipients: ['sarah'], t: tk.id, entityType: 'task' }, admin);
  assert.equal(r.status, 200, await r.clone().text());
  await wait(500);
  const got = sEv.find(e => e.type === 'notification_created');
  assert.ok(got, 'sarah hears of it: ' + JSON.stringify(sEv.map(e => e.type)));
  assert.equal(got.notification.k, 'assigned'); assert.equal(got.notification.t, tk.id); assert.equal(got.notification.who, 'admin');
  assert.ok(!zEv.some(e => e.type === 'notification_created'), 'zein does not');
});
