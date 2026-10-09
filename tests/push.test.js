/* Web Push end to end. The test plays the browser: it makes the subscription's key pair and auth secret, and a
   local push service. The server must encrypt every notification so only that key pair can read it (RFC 8291),
   sign who sends it (VAPID, RFC 8292), write it in the person's language, follow their switches, drop a
   subscription the service says is gone, refuse an endpoint that is not a push service, and stop on sign-out. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');

/* a push service: records what it is sent; an endpoint ending in /gone answers 410 */
function pushService() {
  const got = [];
  const srv = http.createServer((req, res) => { const parts = []; req.on('data', d => parts.push(d)); req.on('end', () => { got.push({ path: req.url, headers: req.headers, body: Buffer.concat(parts) }); res.writeHead(/\/gone$/.test(req.url) ? 410 : 201); res.end(); }); });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ got, host: '127.0.0.1:' + srv.address().port, close: () => new Promise(c => srv.close(c)) })));
}
/* the browser's side of a subscription */
function browserKeys() { const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys(); return { ecdh, p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') }; }
/* RFC 8291, the browser's half: read a pushed body */
function decrypt(body, keys) {
  const salt = body.subarray(0, 16), idlen = body[20], asPublic = body.subarray(21, 21 + idlen), sealed = body.subarray(21 + idlen);
  const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
  const uaPublic = keys.ecdh.getPublicKey(), shared = keys.ecdh.computeSecret(asPublic), auth = Buffer.from(keys.auth, 'base64url');
  const ikm = hmac(hmac(auth, shared), Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(sealed.subarray(sealed.length - 16));
  const plain = Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2, 'the last record ends with the 0x02 delimiter');
  return JSON.parse(plain.subarray(0, plain.length - 1).toString('utf8'));
}
/* RFC 8292: the JWT is signed by the server's VAPID key, for the push service's origin */
function checkVapid(header, publicKey, origin) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(header); assert.ok(m, 'vapid authorization: ' + header);
  assert.equal(m[2], publicKey);
  const [h, p, s] = m[1].split('.'), pub = Buffer.from(publicKey, 'base64url');
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33, 65).toString('base64url') }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from(h + '.' + p), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')), 'signature verifies');
  const claims = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(claims.aud, origin); assert.ok(claims.exp > Date.now() / 1000 && claims.exp < Date.now() / 1000 + 24 * 3600); assert.match(claims.sub, /^(mailto:|https:)/);
}

async function start(temp, extraHost) {
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Push!Admin2345', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'push-secret-key-longer-than-32-characters-x', COS_BACKUP_KEY: 'push-backup-key-longer-than-32-characters-x', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0', COS_PUSH_EXTRA_HOSTS: extraHost, COS_MAIL_TRANSPORT: 'log' }) });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const json = async (m, p, b, c) => { const r = await req(m, p, b, c); const text = await r.text(); return { status: r.status, body: text ? JSON.parse(text) : null }; };
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const stop = async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } };
  return { json, req, login, stop };
}
const until = async (fn, ms = 4000) => { const t = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t > ms) return v; await new Promise(r => setTimeout(r, 50)); } };

test('a notification reaches the person\'s device: encrypted, signed, in their language, by their switches', { timeout: 60000 }, async t => {
  const svc = await pushService(), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-push-'));
  const s = await start(temp, svc.host);
  t.after(async () => { await s.stop(); await svc.close(); fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const admin = await s.login('admin@zencrevia.demo', 'Push!Admin2345');
  const boot = (await s.json('GET', '/api/bootstrap', undefined, admin)).body;
  const mid = Object.keys(boot.people).find(id => id !== 'admin' && !boot.people[id].stakeholder);
  await s.req('PUT', '/api/members/' + mid, Object.assign({}, boot.people[mid], { id: mid, perm: 'member' }), admin);
  await s.req('POST', '/api/members/' + mid + '/password', { password: 'Member!Pass2345' }, admin);
  const member = await s.login(mid + '@zencrevia.demo', 'Member!Pass2345');
  const setPrefs = notif => s.req('PUT', '/api/members/' + mid + '?prefsOnly=1', Object.assign({}, boot.people[mid], { id: mid, prefs: { language: 'id', notif } }), member);
  await setPrefs({ browser: true });

  const { body: key } = await s.json('GET', '/api/push/key', undefined, member);
  assert.equal(Buffer.from(key.publicKey, 'base64url').length, 65, 'an uncompressed P-256 public key');
  /* only a push service is accepted as an endpoint */
  const kb = browserKeys();
  for (const bad of ['https://evil.example.com/x', 'http://127.0.0.2:9/x', 'https://fcm.googleapis.com.evil.com/x', 'javascript:alert(1)'])
    assert.equal((await s.json('POST', '/api/push/subscribe', { subscription: { endpoint: bad, keys: { p256dh: kb.p256dh, auth: kb.auth } } }, member)).status, 400, bad);
  assert.equal((await s.json('POST', '/api/push/subscribe', { subscription: { endpoint: 'http://' + svc.host + '/x', keys: { p256dh: 'short', auth: kb.auth } } }, member)).status, 400, 'malformed keys');
  /* two devices: one keeps working, the other the service has dropped */
  const gone = browserKeys();
  let r = await s.json('POST', '/api/push/subscribe', { subscription: { endpoint: 'http://' + svc.host + '/sub/phone', keys: { p256dh: kb.p256dh, auth: kb.auth } } }, member);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await s.json('POST', '/api/push/subscribe', { subscription: { endpoint: 'http://' + svc.host + '/sub/gone', keys: { p256dh: gone.p256dh, auth: gone.auth } } }, member);
  assert.equal(r.body.devices, 2);

  /* a task assigned to them: the notification is pushed, readable only with the device's keys */
  const tk = (await s.json('POST', '/api/tasks', { title: 'Hero KV push', status: boot.ws.workflow[1].id, prio: 'high', assignee: mid, assignees: [mid] }, admin)).body;
  assert.equal((await s.json('POST', '/api/notifications', { k: 'assigned', t: tk.id, recipients: [mid] }, admin)).status, 200);
  const hit = await until(() => svc.got.find(g => g.path === '/sub/phone'));
  assert.ok(hit, 'the push service got it');
  assert.equal(hit.headers['content-encoding'], 'aes128gcm'); assert.ok(+hit.headers.ttl > 0);
  checkVapid(hit.headers.authorization, key.publicKey, 'http://' + svc.host);
  const p = decrypt(hit.body, kb);
  assert.match(p.body, /menugaskan “Hero KV push” kepadamu/, 'in Indonesian, as they chose: ' + p.body);
  assert.match(p.url, new RegExp('^/tasks\\?task=' + tk.id)); assert.equal(p.tag, 'task:' + tk.id);
  /* the device the service said is gone is dropped */
  await until(() => svc.got.find(g => g.path === '/sub/gone'));
  let devices = 0; for (let i = 0; i < 40; i++) { devices = (await s.json('GET', '/api/push/key', undefined, member)).body.devices; if (devices === 1) break; await new Promise(r => setTimeout(r, 50)); }
  assert.equal(devices, 1, 'the subscription answered 410 is dropped');

  /* their switch for this kind off: nothing is pushed */
  await setPrefs({ browser: true, task_assigned: false });
  const before = svc.got.length;
  await s.json('POST', '/api/notifications', { k: 'assigned', t: tk.id, recipients: [mid] }, admin);
  await new Promise(r => setTimeout(r, 700));
  assert.equal(svc.got.length, before, 'assignments are switched off');
  /* a mention in chat is pushed, with who and where */
  await setPrefs({ browser: true });
  const convs = (await s.json('GET', '/api/messages/conversations', undefined, admin)).body;
  const general = (convs.conversations || convs).find(c => c.type === 'WORKSPACE');
  await s.json('POST', '/api/messages/conversations/' + general.id + '/messages', { body: 'Morning, please check slide 3', mentions: [{ userId: mid, display: boot.people[mid].name }] }, admin);
  const chatHit = await until(() => svc.got.slice(before).find(g => g.path === '/sub/phone'));
  assert.ok(chatHit, 'the mention was pushed');
  const cp = decrypt(chatHit.body, kb);
  assert.match(cp.title, /menyebutmu di #/); assert.equal(cp.body, 'Morning, please check slide 3'); assert.match(cp.url, /^\/messages\//);

  /* signing out on the device stops its notifications */
  await s.json('POST', '/api/auth/logout', { pushEndpoint: 'http://' + svc.host + '/sub/phone' }, member);
  const again = await s.login(mid + '@zencrevia.demo', 'Member!Pass2345');
  assert.equal((await s.json('GET', '/api/push/key', undefined, again)).body.devices, 0);
});

test('the payload encryption round-trips for any text, and endpoints are checked by host, not by prefix', () => {
  const push = require(path.join(root, 'server/push.js'));
  const k = browserKeys();
  for (const text of ['{}', JSON.stringify({ title: 'Ünïcødé “quotes” — ✓', body: 'x'.repeat(3000) })]) assert.deepEqual(decrypt(push.encrypt(text, k.p256dh, k.auth), k), JSON.parse(text));
  assert.equal(push.allowedEndpoint('https://fcm.googleapis.com/fcm/send/abc'), true);
  assert.equal(push.allowedEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x'), true);
  assert.equal(push.allowedEndpoint('https://web.push.apple.com/QF'), true);
  assert.equal(push.allowedEndpoint('https://wns2-sn1p.notify.windows.com/w/?token=1'), true);
  assert.equal(push.allowedEndpoint('http://fcm.googleapis.com/fcm/send/abc'), false, 'https only');
  assert.equal(push.allowedEndpoint('https://notfcm.googleapis.com.attacker.io/'), false);
  assert.equal(push.allowedEndpoint('https://user:pw@fcm.googleapis.com/x'), false);
});
