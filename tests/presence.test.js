/* Online / offline in real time.

   A page that opens its event stream is told at once who is online — it used to learn only of people
   who came or went after it opened, so everyone already there looked offline. Leaving is announced
   after a short grace, so a reload (close and reopen within a moment) does not flash someone offline
   and back; leaving for good is announced. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');
const GRACE = 400;

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-presence-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Presence!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'presence-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'presence-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0', COS_PRESENCE_GRACE_MS: String(GRACE) }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Presence!Admin23456');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  /* a page's event stream: the events it receives, and a way to close it */
  const stream = (cookie) => {
    const events = [];
    const r = http.get({ host: '127.0.0.1', port, path: '/api/messages/stream', headers: { cookie, origin: base } }, res => { res.setEncoding('utf8'); res.on('data', d => d.split('\n').filter(l => l.startsWith('data: ')).forEach(l => { try { events.push(JSON.parse(l.slice(6))); } catch {} })); });
    r.on('error', () => {});
    t.after(() => r.destroy());
    return { events, close: () => r.destroy() };
  };
  return { as, stream };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const presence = (events, id) => events.filter(e => e.type === 'presence' && e.userId === id).map(e => e.state);

test('a page learns who is online at once, and hears others come and go', { timeout: 30000 }, async t => {
  const s = await start(t); const sarah = await s.as('sarah'); const zein = await s.as('zein');
  const a = s.stream(sarah); await wait(300);
  const first = a.events.find(e => e.type === 'presence_snapshot');
  assert.ok(first && first.online.includes('sarah'), 'the snapshot comes first');

  const b = s.stream(zein); await wait(300);
  const snap = b.events.find(e => e.type === 'presence_snapshot');
  assert.ok(snap, 'a snapshot on connecting');
  assert.ok(snap.online.includes('sarah'), 'someone already online is online for the newcomer');
  assert.deepEqual(presence(a.events, 'zein'), ['online'], 'the others hear of the newcomer');

  /* a reload: gone and back within the grace — nobody sees a flash */
  b.close(); await wait(80);
  const back = s.stream(zein); await wait(GRACE + 400);
  assert.deepEqual(presence(a.events, 'zein'), ['online'], 'no offline, no second online');

  /* gone for good: announced after the grace */
  back.close(); await wait(GRACE / 2);
  assert.deepEqual(presence(a.events, 'zein'), ['online'], 'not before the grace');
  await wait(GRACE + 300);
  assert.deepEqual(presence(a.events, 'zein'), ['online', 'offline']);
});
