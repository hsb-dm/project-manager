/* Each person's own notifications (Oct 2026): whoever's role has choose_notifications picks, per kind, whether it
   shows in their bell, comes by e-mail, or comes to the browser; each way on its own. Without the capability they
   receive everything the workspace sends. Every role is given it once. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const http = require('node:http');
const { readMail } = require('./mail-text');
const root = path.join(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-notifchoice-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Choose!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'choose-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'choose-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0', COS_MAIL_TRANSPORT: 'log', APP_URL: 'https://zen.hsb-test.dev' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const json = async (m, p, b, c) => { const r = await req(m, p, b, c); const text = await r.text(); let body = null; try { body = JSON.parse(text); } catch {} return { status: r.status, body, text }; };
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Choose!Admin23456');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const boot = (await json('GET', '/api/bootstrap', undefined, admin)).body;
  const box = path.join(temp, 'outbox');
  const mailsTo = id => (fs.existsSync(box) ? fs.readdirSync(box).filter(f => f.includes(id + '@')) : []).map(f => readMail(fs.readFileSync(path.join(box, f), 'utf8')));
  const stream = cookie => { const events = []; const r = http.get({ host: '127.0.0.1', port, path: '/api/messages/stream', headers: { cookie, origin: base } }, res => { res.setEncoding('utf8'); res.on('data', d => d.split('\n').filter(l => l.startsWith('data: ')).forEach(l => { try { events.push(JSON.parse(l.slice(6))); } catch {} })); }); r.on('error', () => {}); t.after(() => r.destroy()); return events; };
  return { req, json, admin, as, boot, mailsTo, stream };
}
/* someone with the Member role, a task to be told about, and their choices saved the way the page saves them */
async function setup(s) {
  const m = Object.keys(s.boot.people).find(id => id !== 'admin' && s.boot.people[id].perm === 'member' && !s.boot.people[id].stakeholder);
  const mc = await s.as(m), tk = s.boot.tasks.find(x => !x._slim);
  const choose = async notif => { const me = (await s.json('GET', '/api/bootstrap', undefined, mc)).body.people[m]; const r = await s.req('PUT', '/api/members/' + m + '?prefsOnly=1', Object.assign({}, me, { id: m, prefs: Object.assign({}, me.prefs || {}, { notif }) }), mc); assert.equal(r.status, 200, await r.text()); };
  const tell = async k => { const r = await s.json('POST', '/api/notifications', { k, recipients: [m], t: tk.id }, s.admin); assert.equal(r.status, 200, r.text); };
  const bell = async () => (await s.json('GET', '/api/bootstrap', undefined, mc)).body.notifs.filter(n => n.t === tk.id).map(n => n.k).sort();
  return { m, mc, tk, choose, tell, bell };
}

test('what someone turns off does not reach them that way — and only that way', { timeout: 40000 }, async t => {
  const s = await start(t), x = await setup(s);
  /* every role was given the capability once */
  assert.ok(s.boot.roles.filter(r => r.id !== 'admin').every(r => r.permissions.includes('choose_notifications')), 'every role may choose');
  assert.ok(s.boot.caps.some(c => c[0] === 'choose_notifications'), 'listed in Roles & permissions');
  await x.choose({ 'task_assigned:app': false, 'comment_mention:email': false });
  await x.tell('assigned'); await x.tell('mention'); await x.tell('comment');
  await wait(400);
  assert.deepEqual(await x.bell(), ['comment', 'mention'], 'assigned is not in the bell');
  const subjects = s.mailsTo(x.m).map(m => m.subject);
  assert.ok(subjects.some(sj => /assigned you/.test(sj)), 'assigned still comes by e-mail: ' + subjects.join(' | '));
  assert.ok(!subjects.some(sj => /mentioned you/.test(sj)), 'a mention does not come by e-mail');
  assert.ok(subjects.some(sj => /commented on/.test(sj)), 'a comment still does');
  /* a direct message turned off in the bell: not listed, and no "new notification" on the live stream either */
  await x.choose({ 'chat_dm:app': false });
  const ev = s.stream(x.mc); await wait(400);
  const dm = await s.json('POST', '/api/messages/conversations', { type: 'DM', members: ['admin', x.m] }, s.admin);
  assert.equal(dm.status, 200, dm.text);
  assert.equal((await s.json('POST', '/api/messages/conversations/' + dm.body.id + '/messages', { body: 'Hi there' }, s.admin)).status, 200);
  await wait(400);
  assert.ok(!(await s.json('GET', '/api/bootstrap', undefined, x.mc)).body.notifs.some(n => n.k === 'chat_dm'), 'no direct message in the bell');
  assert.ok(ev.some(e => e.type === 'message_created'), 'the message itself still arrives');
  assert.ok(!ev.some(e => e.type === 'notification_created' && e.notification.k === 'chat_dm'), 'no live bell notification either');
});

test('without the capability, everything arrives as the workspace sends it; given back, the choices hold again', { timeout: 40000 }, async t => {
  const s = await start(t), x = await setup(s);
  await x.choose({ 'task_assigned:app': false, 'comment_mention:email': false });
  const role = s.boot.roles.find(r => r.id === 'member'), put = perms => s.req('PUT', '/api/roles/member', Object.assign({}, role, { permissions: perms }), s.admin);
  assert.equal((await put(role.permissions.filter(c => c !== 'choose_notifications'))).status, 200);
  await x.tell('assigned'); await x.tell('mention'); await wait(400);
  assert.deepEqual(await x.bell(), ['assigned', 'mention'], 'everything in the bell');
  assert.ok(s.mailsTo(x.m).some(m => /mentioned you/.test(m.subject)), 'and by e-mail');
  assert.equal((await put(role.permissions)).status, 200);
  assert.deepEqual(await x.bell(), ['mention'], 'the choice made before applies again');
});

test('a finished task and what waited on it: their own kinds, each with its own row', { timeout: 40000 }, async t => {
  const s = await start(t), x = await setup(s);
  await x.choose({ 'task_completed:app': false, 'blocker:email': false });
  await x.tell('completed'); await x.tell('blocker'); await wait(400);
  assert.deepEqual(await x.bell(), ['blocker'], 'a finished task is not in the bell; what waited on it is');
  const subjects = s.mailsTo(x.m).map(m => m.subject);
  assert.ok(subjects.some(sj => /finished/.test(sj)), 'finished, by e-mail: ' + subjects.join(' | '));
  assert.ok(!subjects.some(sj => /can start/.test(sj)), 'what waited on it, not by e-mail');
});
