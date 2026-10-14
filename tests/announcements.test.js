/* Announcement e-mails (Oct 2026): from Settings → Notifications, whoever holds send_announcements (Admin, unless a
   role is given it) e-mails every member — stakeholders only when asked for — or first a test to themselves. The
   history counts what went; at most five an hour. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { readMail } = require('./mail-text');
const root = path.join(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-announce-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Announce!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'announce-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'announce-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0', COS_MAIL_TRANSPORT: 'log', APP_URL: 'https://zen.hsb-test.dev' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const json = async (m, p, b, c) => { const r = await req(m, p, b, c); const text = await r.text(); let body = null; try { body = JSON.parse(text); } catch {} return { status: r.status, body, text }; };
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Announce!Admin23456');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const boot = (await json('GET', '/api/bootstrap', undefined, admin)).body;
  const box = path.join(temp, 'outbox');
  const mails = subject => (fs.existsSync(box) ? fs.readdirSync(box) : []).map(f => Object.assign({ file: f }, readMail(fs.readFileSync(path.join(box, f), 'utf8')))).filter(m => m.subject.includes(subject));
  const done = async () => { for (let i = 0; i < 80; i++) { const h = (await json('GET', '/api/announcements', undefined, admin)).body.history; if (h.every(x => x.status !== 'sending')) return h; await wait(100); } throw new Error('still sending'); };
  return { req, json, admin, as, boot, mails, done };
}
const members = s => Object.keys(s.boot.people).filter(id => s.boot.people[id].active !== false);

test('sent to every member with an address — stakeholders only when asked; a test goes to the sender alone; the history counts', { timeout: 40000 }, async t => {
  const s = await start(t); const sh = members(s).find(id => id !== 'admin' && !s.boot.people[id].stakeholder);
  assert.equal((await s.req('PUT', '/api/members/' + sh, { stakeholder: true }, s.admin)).status, 200);
  let r = await s.json('GET', '/api/announcements', undefined, s.admin);
  assert.equal(r.status, 200, r.text);
  const team = r.body.members, outside = r.body.stakeholders; assert.ok(team >= 3, 'demo members: ' + team); assert.ok(outside >= 1);
  /* a test: the sender alone */
  r = await s.json('POST', '/api/announcements', { subject: 'Release 2.0 (test)', message: 'Line one\nLine two', link: 'https://zen.hsb-test.dev/changelog', test: true }, s.admin);
  assert.equal(r.status, 200, r.text); assert.equal(r.body.to, 'admin@zencrevia.demo');
  await wait(200);
  let got = s.mails('Release 2.0 (test)'); assert.equal(got.length, 1); assert.match(got[0].file, /admin@zencrevia\.demo/);
  assert.equal((await s.json('GET', '/api/announcements', undefined, s.admin)).body.history.length, 0, 'a test is not in the history');
  /* to everyone in the team */
  r = await s.json('POST', '/api/announcements', { subject: 'Release 2.0', message: 'What changed:\n- Project discussion', link: 'https://zen.hsb-test.dev/changelog' }, s.admin);
  assert.equal(r.status, 200, r.text); assert.equal(r.body.announcement.recipients, team);
  let h = await s.done();
  assert.equal(h[0].status, 'sent'); assert.equal(h[0].sent, team); assert.equal(h[0].failed, 0); assert.equal(h[0].by, 'admin');
  got = s.mails('] Release 2.0').filter(m => !m.subject.includes('(test)'));
  assert.equal(got.length, team, 'one each');
  assert.ok(!got.some(m => m.file.includes(sh + '@')), 'not the stakeholder');
  assert.ok(got.every(m => m.text.includes('What changed:') && m.text.includes('- Project discussion') && m.text.includes('https://zen.hsb-test.dev/changelog')), 'the message and the link');
  assert.ok(got.every(m => /^\[[^\]]+\] Release 2\.0$/.test(m.subject)), 'subject: [workspace] what was written');
  /* and with stakeholders */
  r = await s.json('POST', '/api/announcements', { subject: 'Holiday hours', message: 'Closed on Friday.', stakeholders: true }, s.admin);
  assert.equal(r.body.announcement.recipients, team + outside);
  h = await s.done();
  assert.ok(s.mails('Holiday hours').some(m => m.file.includes(sh + '@')), 'the stakeholder too, when asked');
  assert.equal(h.length, 2);
});

test('only whoever holds the capability sends; what is sent is checked; at most five an hour', { timeout: 40000 }, async t => {
  const s = await start(t); const m = members(s).find(id => id !== 'admin' && s.boot.people[id].perm === 'member') || members(s).find(id => id !== 'admin');
  assert.equal((await s.req('PUT', '/api/members/' + m, { perm: 'member' }, s.admin)).status, 200);
  const mc = await s.as(m);
  assert.equal((await s.json('GET', '/api/announcements', undefined, mc)).status, 403);
  assert.equal((await s.json('POST', '/api/announcements', { subject: 'x', message: 'y' }, mc)).status, 403);
  /* a role given it may */
  const role = (await s.json('GET', '/api/bootstrap', undefined, s.admin)).body.roles.find(r => r.id === 'member');
  assert.equal((await s.req('PUT', '/api/roles/member', Object.assign({}, role, { permissions: role.permissions.concat(['send_announcements']) }), s.admin)).status, 200);
  assert.equal((await s.json('GET', '/api/announcements', undefined, mc)).status, 200, 'given in Roles & permissions');
  /* checked */
  assert.equal((await s.json('POST', '/api/announcements', { subject: '  ', message: 'y' }, s.admin)).status, 400);
  assert.equal((await s.json('POST', '/api/announcements', { subject: 'x', message: '' }, s.admin)).status, 400);
  assert.equal((await s.json('POST', '/api/announcements', { subject: 'x', message: 'y', link: 'http://plain.example.com' }, s.admin)).status, 400);
  assert.equal((await s.json('POST', '/api/announcements', { subject: 'x'.repeat(151), message: 'y' }, s.admin)).status, 413);
  assert.equal((await s.json('POST', '/api/announcements', { subject: 'x', message: 'y'.repeat(5001) }, s.admin)).status, 413);
  /* a line break cannot become a header */
  let r = await s.json('POST', '/api/announcements', { subject: 'Hello\r\nBcc: spy@evil.example.com', message: 'y', test: true }, s.admin);
  assert.equal(r.status, 200); await wait(200);
  assert.deepEqual(s.mails('Hello').map(x => x.subject), [s.boot.ws.name ? '[' + s.boot.ws.name + '] Hello Bcc: spy@evil.example.com' : s.mails('Hello')[0].subject]);
  /* five an hour */
  for (let i = 1; i <= 5; i++) { r = await s.json('POST', '/api/announcements', { subject: 'Update ' + i, message: 'y' }, i % 2 ? s.admin : mc); assert.equal(r.status, 200, r.text); }
  r = await s.json('POST', '/api/announcements', { subject: 'Update 6', message: 'y' }, s.admin);
  assert.equal(r.status, 429, r.text);
  await s.done();
});

test('to the people chosen: only they get it — a stakeholder chosen too; someone who cannot receive it is refused', { timeout: 40000 }, async t => {
  const s = await start(t);
  let r = await s.json('GET', '/api/announcements', undefined, s.admin);
  const people = r.body.people, st = people.find(x => x.stakeholder).id, m = people.find(x => !x.stakeholder && x.id !== 'admin').id;
  assert.ok(people.length >= 4 && people.every(x => typeof x.id === 'string'), 'who can be chosen');
  r = await s.json('POST', '/api/announcements', { subject: 'Picked only', message: 'Just you two.', recipients: [m, st, m] }, s.admin);
  assert.equal(r.status, 200, r.text); assert.equal(r.body.announcement.recipients, 2, 'each once'); assert.equal(r.body.announcement.chosen, true);
  const h = await s.done();
  assert.equal(h[0].sent, 2); assert.equal(h[0].chosen, true);
  const got = s.mails('Picked only').map(x => x.file);
  assert.equal(got.length, 2);
  assert.ok(got.some(f => f.includes(m + '@')) && got.some(f => f.includes(st + '@')), 'the two chosen, the stakeholder too: ' + got.join(', '));
  assert.equal((await s.json('POST', '/api/announcements', { subject: 'x', message: 'y', recipients: [] }, s.admin)).status, 400, 'no one chosen');
  r = await s.json('POST', '/api/announcements', { subject: 'x', message: 'y', recipients: [m, 'nobody'] }, s.admin);
  assert.equal(r.status, 400); assert.match(r.body.error, /can no longer receive it/);
});
