/* A project's discussion (Oct 2026): comments on the project as a whole, on its own routes
   (server/project-discussion.js). The Overview reads the newest three threads, the Discussion tab twenty at a
   time; a stakeholder never receives an internal comment in any form; an archived project only reads; the
   people named, the one answered and the owner are told once each, by a link to that comment. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { readMail } = require('./mail-text');
const root = path.join(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-pdisc-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Discuss!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'discuss-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'discuss-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0', COS_MAIL_TRANSPORT: 'log', APP_URL: 'https://zen.hsb-test.dev' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const json = async (m, p, b, c) => { const r = await req(m, p, b, c); const text = await r.text(); let body = null; try { body = JSON.parse(text); } catch {} return { status: r.status, body, text }; };
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Discuss!Admin23456');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const boot = (await json('GET', '/api/bootstrap', undefined, admin)).body;
  const stream = cookie => { const events = []; const r = http.get({ host: '127.0.0.1', port, path: '/api/messages/stream', headers: { cookie, origin: base } }, res => { res.setEncoding('utf8'); res.on('data', d => d.split('\n').filter(l => l.startsWith('data: ')).forEach(l => { try { events.push(JSON.parse(l.slice(6))); } catch {} })); }); r.on('error', () => {}); t.after(() => r.destroy()); return events; };
  return { temp, req, json, admin, as, boot, stream };
}
const people = (s, n, not) => Object.keys(s.boot.people).filter(id => id !== 'admin' && s.boot.people[id].active !== false && !(not || []).includes(id)).slice(0, n);
const live = s => s.boot.projects.filter(p => p.status !== 'archived');
const url = (p, rest) => '/api/projects/' + encodeURIComponent(p) + '/comments' + (rest || '');

test('posted from either place, read back as the newest three or a page at a time; replies keep to their thread', { timeout: 40000 }, async t => {
  const s = await start(t); const pr = live(s)[0]; const [m] = people(s, 1); const mc = await s.as(m);
  for (let i = 1; i <= 5; i++) { const r = await s.json('POST', url(pr.id), { id: 'pd' + i, text: 'Thought ' + i }, s.admin); assert.equal(r.status, 200, r.text); await wait(5); }
  let r = await s.json('GET', url(pr.id, '?limit=3&view=preview'), undefined, mc);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.comments.map(c => c.id), ['pd3', 'pd4', 'pd5'], 'the newest three, oldest of them first');
  assert.equal(r.body.total, 5); assert.equal(r.body.hasMore, true);
  /* a reply, and a reply to the reply: both hang off the thread's first comment */
  r = await s.json('POST', url(pr.id), { id: 'pr1', text: 'Agreed', parent: 'pd5' }, mc); assert.equal(r.status, 200, r.text); assert.equal(r.body.comment.parent, 'pd5');
  r = await s.json('POST', url(pr.id), { id: 'pr2', text: 'Same', parent: 'pr1' }, s.admin); assert.equal(r.body.comment.parent, 'pd5', 'one level, as in a task');
  r = await s.json('GET', url(pr.id, '?limit=3&view=preview'), undefined, mc);
  assert.equal(r.body.comments.find(c => c.id === 'pd5').replyCount, 2); assert.ok(!r.body.comments.some(c => c.parent), 'the preview shows no replies, only how many');
  /* the tab: twenty threads at a time, older ones on request */
  r = await s.json('GET', url(pr.id, '?limit=2'), undefined, mc);
  assert.deepEqual(r.body.comments.map(c => c.id), ['pd4', 'pd5', 'pr1', 'pr2']); assert.equal(r.body.hasMore, true);
  r = await s.json('GET', url(pr.id, '?limit=2&before=pd4'), undefined, mc);
  assert.deepEqual(r.body.comments.map(c => c.id), ['pd2', 'pd3']);
  r = await s.json('GET', url(pr.id, '?limit=2&before=pd2'), undefined, mc);
  assert.deepEqual(r.body.comments.map(c => c.id), ['pd1']); assert.equal(r.body.hasMore, false);
  /* sent twice, saved once */
  r = await s.json('POST', url(pr.id), { id: 'pd5', text: 'Thought 5' }, s.admin); assert.equal(r.status, 200); assert.equal(r.body.total, 7);
  assert.equal((await s.json('POST', url(pr.id), { text: '   ' }, mc)).status, 400);
  assert.equal((await s.json('POST', url(pr.id), { text: 'x'.repeat(10001) }, mc)).status, 413);
  assert.equal((await s.json('GET', url('nope'), undefined, mc)).status, 404);
  /* another project's discussion is its own */
  const other = live(s)[1];
  assert.equal((await s.json('GET', url(other.id, '?view=preview'), undefined, mc)).body.total, 0);
  assert.equal((await s.json('POST', url(other.id), { text: 'x', parent: 'pd5' }, mc)).status, 404, 'a reply names a comment of this project');
});

test('a stakeholder sees and writes only what stakeholders may see; a reply is never wider than its thread', { timeout: 40000 }, async t => {
  const s = await start(t); const pr = live(s)[0]; const [sh, m] = people(s, 2, [pr.owner]);
  assert.equal((await s.req('PUT', '/api/members/' + sh, { stakeholder: true }, s.admin)).status, 200);
  const shc = await s.as(sh), mc = await s.as(m), shName = s.boot.people[sh].name;
  await s.json('POST', url(pr.id), { id: 'pi1', text: 'Secret margin plan @' + shName, vis: 'internal' }, s.admin);
  await s.json('POST', url(pr.id), { id: 'pc1', text: 'Hello client @' + shName, vis: 'client' }, s.admin);
  for (const q of ['?view=preview&limit=3', '', '?before=pc1']) {
    const r = await s.json('GET', url(pr.id, q), undefined, shc);
    assert.equal(r.status, 200); assert.ok(!/Secret margin/.test(r.text), 'no internal comment reaches a stakeholder (' + q + ')');
  }
  assert.equal((await s.json('GET', url(pr.id, '?view=preview'), undefined, shc)).body.total, 1, 'nor its count');
  let r = await s.json('POST', url(pr.id), { id: 'ps1', text: 'From the client side', vis: 'internal' }, shc);
  assert.equal(r.status, 200, r.text); assert.equal(r.body.comment.vis, 'client', 'a stakeholder writes for stakeholders');
  assert.equal((await s.json('POST', url(pr.id), { text: 'peek', parent: 'pi1' }, shc)).status, 404, 'no reply to what they cannot see');
  assert.equal((await s.json('PUT', url(pr.id, '/pi1'), { text: 'x' }, shc)).status, 404);
  assert.equal((await s.json('DELETE', url(pr.id, '/pi1'), undefined, shc)).status, 404);
  r = await s.json('POST', url(pr.id), { id: 'pm1', text: 'Noted', vis: 'client', parent: 'pi1' }, mc);
  assert.equal(r.body.comment.vis, 'internal', 'a reply to an internal comment stays internal');
  /* told only of what they may read */
  await wait(200);
  const notifs = (await s.json('GET', '/api/bootstrap', undefined, shc)).body.notifs.filter(n => n.entityType === 'project');
  assert.equal(notifs.length, 1, 'named in both, told of the one they can read: ' + JSON.stringify(notifs));
  assert.equal(notifs[0].k, 'mention'); assert.equal(notifs[0].t, pr.id); assert.equal(JSON.parse(notifs[0].message).comment, 'pc1');
});

test('who may change or remove a comment; an archived project only reads until it is restored', { timeout: 40000 }, async t => {
  const s = await start(t); const pr = live(s)[0]; const [a, b] = people(s, 2); const ac = await s.as(a), bc = await s.as(b);
  await s.json('POST', url(pr.id), { id: 'pa1', text: 'Mine' }, ac);
  await s.json('POST', url(pr.id), { id: 'pb1', text: 'A reply', parent: 'pa1' }, bc);
  assert.equal((await s.json('PUT', url(pr.id, '/pa1'), { text: 'Not mine' }, bc)).status, 403);
  assert.equal((await s.json('DELETE', url(pr.id, '/pa1'), undefined, bc)).status, 403);
  let r = await s.json('PUT', url(pr.id, '/pa1'), { text: 'Mine, better' }, ac);
  assert.equal(r.status, 200, r.text); assert.equal(r.body.comment.text, 'Mine, better'); assert.ok(r.body.comment.editedAt, 'marked edited');
  /* removed, its reply stays on its own */
  assert.equal((await s.json('DELETE', url(pr.id, '/pa1'), undefined, ac)).status, 200);
  r = await s.json('GET', url(pr.id), undefined, ac);
  assert.deepEqual(r.body.comments.map(c => [c.id, c.parent]), [['pb1', null]]);
  /* archived: readable, nothing new */
  const doc = s.boot.projects.find(x => x.id === pr.id);
  assert.equal((await s.req('PUT', '/api/projects/' + pr.id, Object.assign({}, doc, { status: 'archived' }), s.admin)).status, 200);
  r = await s.json('GET', url(pr.id, '?view=preview'), undefined, ac); assert.equal(r.status, 200); assert.equal(r.body.archived, true);
  assert.equal((await s.json('POST', url(pr.id), { text: 'late' }, ac)).status, 409);
  assert.equal((await s.json('PUT', url(pr.id, '/pb1'), { text: 'edit' }, bc)).status, 409);
  assert.equal((await s.json('DELETE', url(pr.id, '/pb1'), undefined, bc)).status, 409);
  assert.equal((await s.req('PUT', '/api/projects/' + pr.id, Object.assign({}, doc, { status: 'active' }), s.admin)).status, 200);
  assert.equal((await s.json('POST', url(pr.id), { text: 'back again' }, ac)).status, 200, 'restored, it takes comments again');
  assert.equal((await s.json('GET', url(pr.id), undefined, ac)).body.total, 2, 'nothing was lost meanwhile');
});

test('the people named, the one answered and the owner are told once each, with a link to the comment; the stream says which discussion changed', { timeout: 40000 }, async t => {
  const s = await start(t); const pr = live(s).find(p => p.owner && p.owner !== 'admin') || live(s)[0];
  const [a, b] = people(s, 2, [pr.owner]); const ac = await s.as(a), bc = await s.as(b), oc = await s.as(pr.owner);
  const bEv = s.stream(bc); await wait(400);
  await s.json('POST', url(pr.id), { id: 'pq1', text: 'Question for everyone' }, bc);
  let r = await s.json('POST', url(pr.id), { id: 'pq2', text: '@' + s.boot.people[b].name + ' here is the answer', parent: 'pq1' }, ac);
  assert.equal(r.status, 200, r.text);
  await wait(500);
  const of = async c => (await s.json('GET', '/api/bootstrap', undefined, c)).body.notifs.filter(n => n.entityType === 'project' && n.t === pr.id);
  const bn = await of(bc);
  assert.deepEqual(bn.map(n => n.k), ['mention'], 'named and answered: told once, as named');
  const on = await of(oc);
  assert.ok(on.some(n => n.k === 'comment' && JSON.parse(n.message).comment === 'pq2'), 'the owner hears of it');
  assert.ok(bEv.some(e => e.type === 'project_comments' && e.project === pr.id && e.comment === 'pq2'), 'the live stream names the discussion');
  assert.ok(!bEv.some(e => e.type === 'ws_changed' && e.kind === 'projects'), 'a comment does not make every page fetch the projects again');
  assert.ok(bEv.some(e => e.type === 'notification_created' && e.notification.entityType === 'project'), 'the bell hears at once');
  /* the e-mail says it is the project's discussion and links to the comment */
  const box = path.join(s.temp, 'outbox'); let mail = null;
  for (let i = 0; i < 40 && !mail; i++) { await wait(100); const f = fs.existsSync(box) ? fs.readdirSync(box).filter(x => x.includes(b + '@')) : []; mail = f.map(x => readMail(fs.readFileSync(path.join(box, x), 'utf8'))).find(x => /discussion/.test(x.subject)); }
  assert.ok(mail, 'an e-mail to the one named');
  assert.match(mail.subject, /mentioned you in the discussion on/);
  assert.match(mail.text, /\/projects\/[^?\s"]+\?tab=discussion&comment=pq2/);
});
