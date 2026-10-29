/* Notifications read, everywhere at once (Oct 2026). Whenever someone's notifications become read — Mark all read, a
   task opened, some ids, a conversation read, a sign-up let in or turned away — every page of theirs hears of it at
   once (notifications_read), with the page that asked (X-ZC-Tab) when it said a well-formed one, and nobody else
   does. A read that changed nothing says nothing. The browser side: e2e/notif-live.spec.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-notiflive-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'NotifLive!Admin234', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'notiflive-secret-key-longer-than-32-characters', COS_BACKUP_KEY: 'notiflive-backup-key-longer-than-32-characters', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0', COS_MAIL_TRANSPORT: 'log', COS_PRESENCE_GRACE_MS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c, h) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}, h || {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const ok = async r => { assert.equal(r.status, 200, await r.clone().text()); return r.json(); };
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'NotifLive!Admin234');
  const as = async id => { await ok(await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin)); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  /* one page's live stream: every event it hears, in order */
  const stream = cookie => { const events = []; let buf = ''; const r = http.get({ host: '127.0.0.1', port, path: '/api/messages/stream', headers: { cookie, origin: base } }, res => { res.setEncoding('utf8'); res.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const block = buf.slice(0, i); buf = buf.slice(i + 2); block.split('\n').filter(l => l.startsWith('data: ')).forEach(l => { try { events.push(JSON.parse(l.slice(6))); } catch {} }); } }); }); r.on('error', () => {}); t.after(() => r.destroy()); return events; };
  const boot = async c => ok(await req('GET', '/api/bootstrap', undefined, c));
  return { req, ok, admin, as, stream, boot };
}
const reads = evs => evs.filter(e => e.type === 'notifications_read');

test('a read reaches every page of that person, with the page that asked, and nobody else', { timeout: 40000 }, async t => {
  const s = await start(t);
  const b0 = await s.boot(s.admin);
  const tasks = b0.tasks.filter(x => !x._slim).slice(0, 2); assert.equal(tasks.length, 2);
  const sarah = await s.as('sarah'), zein = await s.as('zein');
  const one = s.stream(sarah), two = s.stream(sarah), other = s.stream(zein); await wait(400);
  for (const tk of tasks) await s.ok(await s.req('POST', '/api/notifications', { k: 'assigned', recipients: ['sarah'], t: tk.id, entityType: 'task' }, s.admin));
  await wait(300);
  const mine = (await s.boot(sarah)).notifs, onFirst = mine.find(n => n.t === tasks[0].id && !n.read), onSecond = mine.find(n => n.t === tasks[1].id && !n.read);
  assert.ok(onFirst && onSecond, 'sarah has both, unread');
  const before = Date.now();
  /* a task opened in one page (entityId), saying which page it is */
  await s.ok(await s.req('POST', '/api/notifications/read', { entityId: tasks[0].id }, sarah, { 'x-zc-tab': 'tab0abc123' }));
  await wait(300);
  for (const evs of [one, two]) {
    const ev = reads(evs); assert.equal(ev.length, 1, 'each page of hers hears it once: ' + JSON.stringify(evs.map(e => e.type)));
    assert.equal(ev[0].entityId, tasks[0].id); assert.equal(ev[0].tab, 'tab0abc123'); assert.equal(ev[0].all, undefined); assert.equal(ev[0].ids, undefined);
    assert.ok(Date.parse(ev[0].at) >= before - 1000 && Date.parse(ev[0].at) >= Date.parse(onFirst.createdAt), 'when: ' + ev[0].at);
  }
  assert.equal(reads(other).length, 0, 'zein hears nothing');
  /* the same again changes nothing, and says nothing */
  await s.ok(await s.req('POST', '/api/notifications/read', { entityId: tasks[0].id }, sarah, { 'x-zc-tab': 'tab0abc123' }));
  await wait(250); assert.equal(reads(one).length, 1, 'nothing left to read: no event');
  /* some ids; a header that is not a page's id is not passed on */
  await s.ok(await s.req('POST', '/api/notifications/read', { ids: [onSecond.id, 'nt_nobody'] }, sarah, { 'x-zc-tab': 'BAD tab!' }));
  await wait(250);
  let ev = reads(two).slice(-1)[0]; assert.equal(reads(two).length, 2);
  assert.deepEqual(ev.ids, [onSecond.id], 'only the ids it read'); assert.equal('tab' in ev, false, 'a malformed tab is dropped');
  for (const bad of ['short', 'x'.repeat(33), 'UPPERCASE1', '../../etc1']) {
    await s.ok(await s.req('POST', '/api/notifications', { k: 'review', recipients: ['sarah'], t: tasks[1].id, entityType: 'task' }, s.admin)); await wait(150);
    await s.ok(await s.req('POST', '/api/notifications/read', { entityId: tasks[1].id }, sarah, { 'x-zc-tab': bad })); await wait(150);
    assert.equal('tab' in reads(one).slice(-1)[0], false, bad + ' is not a tab');
  }
  /* Mark all read: every one there by then */
  await s.ok(await s.req('POST', '/api/notifications', { k: 'mention', recipients: ['sarah'], t: tasks[1].id, entityType: 'task' }, s.admin)); await wait(200);
  await s.ok(await s.req('POST', '/api/notifications/read', { all: true }, sarah));
  await wait(300);
  ev = reads(one).slice(-1)[0]; assert.equal(ev.all, true); assert.equal('tab' in ev, false, 'no header: no tab');
  const after = (await s.boot(sarah)).notifs; assert.ok(after.length && after.every(n => n.read), 'all of hers are read');
  assert.ok(after.every(n => Date.parse(n.createdAt) <= Date.parse(ev.at)), 'at is when, after every one of them');
  assert.equal(reads(other).length, 0, 'zein still hears nothing');
  await s.ok(await s.req('POST', '/api/notifications/read', { all: true }, sarah)); await wait(250);
  assert.equal(reads(one).length, reads(two).length); assert.equal(reads(one).filter(e => e.all).length, 1, 'all again, nothing unread: no event');
});

test('a conversation read in one page: the others hear up to where, and which notifications it read', { timeout: 40000 }, async t => {
  const s = await start(t);
  const sarah = await s.as('sarah');
  const one = s.stream(sarah), two = s.stream(sarah), mine = s.stream(s.admin); await wait(400);
  const dm = await s.ok(await s.req('POST', '/api/messages/conversations', { type: 'DM', members: ['admin', 'sarah'] }, s.admin));
  const m1 = await s.ok(await s.req('POST', '/api/messages/conversations/' + dm.id + '/messages', { body: 'Live one' }, s.admin));
  const m2 = await s.ok(await s.req('POST', '/api/messages/conversations/' + dm.id + '/messages', { body: 'Live two' }, s.admin));
  await wait(400);
  assert.ok(one.some(e => e.type === 'notification_created' && e.notification.t === dm.id), 'she was told');
  await s.ok(await s.req('PATCH', '/api/messages/conversations/' + dm.id + '/read', { lastReadMessageId: m2.id }, sarah, { 'x-zc-tab': 'pagetwo99' }));
  await wait(300);
  for (const evs of [one, two]) {
    const uc = evs.filter(e => e.type === 'unread_count_changed' && e.lastReadAt).slice(-1)[0];
    assert.ok(uc, 'up to where: ' + JSON.stringify(evs.map(e => e.type)));
    assert.equal(uc.conversationId, dm.id); assert.equal(uc.unread, 0); assert.equal(uc.lastReadMessageId, m2.id); assert.equal(uc.lastReadAt, m2.createdAt); assert.equal(uc.tab, 'pagetwo99');
    const nr = reads(evs); assert.equal(nr.length, 1);
    assert.equal(nr[0].entityId, dm.id); assert.equal(nr[0].entityType, 'message'); assert.equal(nr[0].tab, 'pagetwo99'); assert.ok(Date.parse(nr[0].at) >= Date.parse(m2.createdAt));
  }
  assert.equal(reads(mine).length, 0, 'the sender hears nothing of her reading');
  assert.ok(!mine.some(e => e.type === 'unread_count_changed' && e.lastReadAt), 'nor where she read up to');
  /* read again: where she is, said again; no notification left to read, so no notifications_read */
  await s.ok(await s.req('PATCH', '/api/messages/conversations/' + dm.id + '/read', { lastReadMessageId: m1.id }, sarah)); await wait(250);
  const last = one.filter(e => e.type === 'unread_count_changed').slice(-1)[0];
  assert.equal(last.lastReadMessageId, m1.id); assert.equal('tab' in last, false);
  assert.equal(reads(one).length, 1, 'nothing more read');
});

test('a sign-up let in or turned away settles every approver\'s bell, in each of their pages', { timeout: 40000 }, async t => {
  const s = await start(t);
  const b0 = await s.boot(s.admin);
  assert.equal((await s.req('PUT', '/api/workspace', Object.assign({}, b0.ws, { allowRegistration: true, joinCode: '' }), s.admin)).status, 200);
  const leadId = Object.keys(b0.people).find(id => b0.people[id].perm === 'team_lead' && b0.people[id].active !== false);
  const memberId = Object.keys(b0.people).find(id => b0.people[id].perm === 'member' && b0.people[id].active !== false);
  const lead = await s.as(leadId), member = await s.as(memberId);
  const a1 = s.stream(s.admin), a2 = s.stream(s.admin), l1 = s.stream(lead), m1 = s.stream(member); await wait(400);
  for (const [n, e] of [['Live Pending', 'live.pending@example.org'], ['Live Turned', 'live.turned@example.org']]) assert.equal((await s.req('POST', '/api/auth/register', { name: n, email: e, password: 'Newbie!Pass2345' })).status, 200);
  await wait(300);
  const pend = (await s.boot(s.admin)).pendingMembers, yes = pend.find(x => x.email === 'live.pending@example.org').id, no = pend.find(x => x.email === 'live.turned@example.org').id;
  assert.ok((await s.boot(lead)).notifs.some(n => n.k === 'signup' && n.t === yes && !n.read), 'the lead was told');
  await s.ok(await s.req('POST', '/api/members/' + yes + '/approve', {}, s.admin, { 'x-zc-tab': 'adminpage1' }));
  await wait(300);
  for (const evs of [a1, a2, l1]) {
    const ev = reads(evs).find(e => e.entityId === yes); assert.ok(ev, 'each approver page hears it');
    assert.equal(ev.entityType, 'user'); assert.equal(ev.removed, undefined); assert.ok(ev.at);
  }
  assert.equal(reads(a1).find(e => e.entityId === yes).tab, 'adminpage1', 'the asker\'s pages: the page that asked, as it said it');
  assert.equal('tab' in reads(l1).find(e => e.entityId === yes), false, 'another approver is not told which page of someone else\'s asked');
  assert.ok((await s.boot(lead)).notifs.filter(n => n.t === yes).every(n => n.read), 'read for the lead too');
  await s.ok(await s.req('POST', '/api/members/' + no + '/decline', {}, lead));
  await wait(300);
  for (const evs of [a1, a2, l1]) { const ev = reads(evs).find(e => e.entityId === no); assert.ok(ev, 'turned away: heard'); assert.equal(ev.removed, true); assert.equal(ev.entityType, 'user'); }
  assert.ok(!(await s.boot(s.admin)).notifs.some(n => n.t === no), 'gone from the bell');
  assert.equal(reads(m1).length, 0, 'a member who approves nobody hears nothing');
});
