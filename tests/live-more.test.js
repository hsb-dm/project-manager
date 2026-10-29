/* Live updates for what had none (Oct 2026, server/live-more.js): saved views, AI Gallery and the announcements'
   list send live_changed {kind, id, by, tab} to whoever may see the thing, and to no one else:
   - a saved view is its owner's alone: only the owner's pages hear of it;
   - an AI Gallery design in use reaches everyone who may view AI Gallery, not someone whose role cannot; going to the
     archive reaches them too (it leaves their screens); one archived before and after a change reaches only its
     owner and whoever manages every design; a favourite only the person's own pages;
   - an announcement reaches whoever may send them, when it starts (with the tab) and when it is done (without);
     a test reaches no one.
   tab is the request's X-ZC-Tab when it is well formed, and nothing otherwise. The browser side: e2e/live-more.spec.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

test('live_changed goes only to whoever may see what changed', { timeout: 60000 }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-livemore-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'LiveMore!Admin2345', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'livemore-secret-key-longer-than-32-characters', COS_BACKUP_KEY: 'livemore-backup-key-longer-than-32-characters', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0', COS_MAIL_TRANSPORT: 'log' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c, tab) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}, tab !== undefined ? { 'x-zc-tab': tab } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const json = async (m, p, b, c, tab) => { const r = await req(m, p, b, c, tab); const text = await r.text(); let body = null; try { body = JSON.parse(text); } catch {} return { status: r.status, body, text }; };
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'LiveMore!Admin2345');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const stream = cookie => { const events = []; const r = http.get({ host: '127.0.0.1', port, path: '/api/messages/stream', headers: { cookie, origin: base } }, res => { res.setEncoding('utf8'); res.on('data', d => d.split('\n').filter(l => l.startsWith('data: ')).forEach(l => { try { events.push(JSON.parse(l.slice(6))); } catch {} })); }); r.on('error', () => {}); t.after(() => r.destroy()); return events; };
  /* a role that may open the app but not AI Gallery, and one that may send announcements */
  assert.equal((await json('POST', '/api/roles', { id: 'role_nogallery', name: 'No gallery', permissions: ['view_all'] }, admin)).status, 200);
  assert.equal((await json('POST', '/api/roles', { id: 'role_announcer', name: 'Announcer', permissions: ['view_all', 'send_announcements', 'view_ai_gallery'] }, admin)).status, 200);
  assert.equal((await req('PUT', '/api/members/rizky', { perm: 'role_nogallery' }, admin)).status, 200);
  assert.equal((await req('PUT', '/api/members/andi', { perm: 'role_announcer' }, admin)).status, 200);
  const sarah = await as('sarah'), maya = await as('maya'), rizky = await as('rizky'), andi = await as('andi'), zein = await as('zein');
  const ev = { admin: stream(admin), sarah: stream(sarah), sarah2: stream(sarah), maya: stream(maya), rizky: stream(rizky), andi: stream(andi), zein: stream(zein) };
  await wait(500);
  const live = (who, kind) => ev[who].filter(e => e.type === 'live_changed' && (!kind || e.kind === kind));
  const clear = () => Object.values(ev).forEach(l => l.splice(0, l.length));
  const settle = () => wait(350);

  /* ---------- saved views: the owner's pages alone ---------- */
  let r = await json('POST', '/api/views', { name: 'Mine this week', type: 'list', filters: {} }, sarah, 'tabsarah0001');
  assert.equal(r.status, 200, r.text); const view = r.body.find(v => v.name === 'Mine this week'); assert.ok(view);
  await settle();
  assert.equal(live('sarah', 'views').length, 1, 'her page hears of it'); assert.equal(live('sarah2', 'views').length, 1, 'and her other page');
  assert.deepEqual(live('sarah', 'views')[0], { type: 'live_changed', kind: 'views', id: view.id, by: 'sarah', tab: 'tabsarah0001' });
  for (const who of ['admin', 'maya', 'rizky', 'andi', 'zein']) assert.equal(live(who).length, 0, who + ' hears nothing of her view');
  /* GET /api/views: her own, nobody else's */
  assert.deepEqual((await json('GET', '/api/views', undefined, sarah)).body.map(v => v.id), [view.id]);
  assert.deepEqual((await json('GET', '/api/views', undefined, maya)).body, []);
  /* a malformed tab is not passed on; none at all, none either */
  clear(); assert.equal((await json('PUT', '/api/views/' + view.id, { name: 'Renamed', type: 'list' }, sarah, 'BAD tab!')).status, 200); await settle();
  assert.equal(live('sarah2', 'views').length, 1); assert.equal('tab' in live('sarah2', 'views')[0], false, 'a malformed header is ignored');
  clear(); assert.equal((await json('PUT', '/api/views/' + view.id, { name: 'Renamed', type: 'list' }, sarah, 'x'.repeat(40))).status, 200); await settle();
  assert.equal('tab' in live('sarah2', 'views')[0], false, 'too long is malformed');
  /* someone else's view cannot be changed, and nothing is said */
  clear(); assert.equal((await json('PUT', '/api/views/' + view.id, { name: 'Taken', type: 'list' }, maya)).status, 404);
  assert.equal((await json('DELETE', '/api/views/' + view.id, undefined, maya)).status, 200); await settle();
  for (const who of Object.keys(ev)) assert.equal(live(who).length, 0, 'a view that is not theirs: no event for ' + who);
  /* deleted: her pages */
  assert.equal((await json('DELETE', '/api/views/' + view.id, undefined, sarah, 'tabsarah0001')).status, 200); await settle();
  assert.equal(live('sarah2', 'views').length, 1); assert.equal(live('maya').length, 0);
  assert.deepEqual((await json('GET', '/api/views', undefined, sarah)).body, []);

  /* ---------- AI Gallery ---------- */
  clear();
  r = await json('POST', '/api/ai/gallery', { name: 'Launch poster', tags: ['launch'], fields: { headline: 'Hello' }, thumb: pixel }, sarah, 'tabsarah0001');
  assert.equal(r.status, 200, r.text); const item = r.body; await settle();
  for (const who of ['admin', 'sarah', 'sarah2', 'maya', 'andi', 'zein']) assert.equal(live(who, 'gallery').length, 1, who + ' may view AI Gallery and hears of a new design');
  assert.deepEqual(live('maya', 'gallery')[0], { type: 'live_changed', kind: 'gallery', id: item.id, by: 'sarah', tab: 'tabsarah0001' });
  assert.equal(live('rizky').length, 0, 'a role that cannot view AI Gallery hears nothing');
  /* a favourite: her own pages only */
  clear(); assert.equal((await json('POST', '/api/ai/gallery/' + item.id + '/favorite', { favorite: true }, sarah, 'tabsarah0002')).status, 200); await settle();
  assert.equal(live('sarah2', 'gallery').length, 1); assert.equal(live('sarah2', 'gallery')[0].tab, 'tabsarah0002');
  for (const who of ['admin', 'maya', 'rizky', 'andi', 'zein']) assert.equal(live(who).length, 0, 'her favourite is nobody else\'s: ' + who);
  /* a copy by a colleague: everyone who may view */
  clear(); r = await json('POST', '/api/ai/gallery/' + item.id + '/duplicate', { name: 'Maya copy' }, maya); assert.equal(r.status, 200, r.text); const copy = r.body; await settle();
  assert.equal(live('sarah', 'gallery').length, 1); assert.equal(live('sarah', 'gallery')[0].id, copy.id); assert.equal('tab' in live('sarah', 'gallery')[0], false, 'no header, no tab');
  assert.equal(live('rizky').length, 0);
  /* archived: everyone who saw it hears it went */
  clear(); r = await json('PATCH', '/api/ai/gallery/' + item.id, { archived: true, revision: item.revision }, sarah); assert.equal(r.status, 200, r.text); let rev = r.body.revision; await settle();
  for (const who of ['admin', 'sarah2', 'maya', 'andi', 'zein']) assert.equal(live(who, 'gallery').length, 1, who + ' saw it and hears it went to the archive');
  assert.equal(live('rizky').length, 0);
  /* renamed while archived: private — its owner and whoever manages every design, nobody else */
  clear(); r = await json('PATCH', '/api/ai/gallery/' + item.id, { name: 'Secret rename', revision: rev }, sarah); assert.equal(r.status, 200, r.text); rev = r.body.revision; await settle();
  assert.equal(live('sarah2', 'gallery').length, 1, 'the owner'); assert.equal(live('admin', 'gallery').length, 1, 'an admin manages every design');
  for (const who of ['maya', 'andi', 'zein', 'rizky']) assert.equal(live(who).length, 0, 'an archived design does not leak to ' + who);
  /* an admin renames it while it is still archived: the same few */
  clear(); r = await json('PATCH', '/api/ai/gallery/' + item.id, { name: 'Secret rename 2', revision: rev }, admin); assert.equal(r.status, 200, r.text); rev = r.body.revision; await settle();
  assert.equal(live('sarah', 'gallery').length, 1); assert.equal(live('admin', 'gallery').length, 1);
  for (const who of ['maya', 'andi', 'zein', 'rizky']) assert.equal(live(who).length, 0, 'still private to ' + who);
  /* restored: everyone who may view again */
  clear(); r = await json('PATCH', '/api/ai/gallery/' + item.id, { archived: false, revision: rev }, sarah); assert.equal(r.status, 200, r.text); await settle();
  for (const who of ['admin', 'sarah2', 'maya', 'andi', 'zein']) assert.equal(live(who, 'gallery').length, 1, who + ' hears it is back');
  assert.equal(live('rizky').length, 0);
  /* a refused change says nothing */
  clear(); assert.equal((await json('PATCH', '/api/ai/gallery/' + item.id, { name: 'Stolen', revision: r.body.revision }, maya)).status, 403); await settle();
  for (const who of Object.keys(ev)) assert.equal(live(who).length, 0, 'a refused change: nothing for ' + who);

  /* ---------- announcements: whoever may send them ---------- */
  clear(); r = await json('POST', '/api/announcements', { subject: 'Just a test', message: 'Hi', test: true }, admin, 'tabadmin0001'); assert.equal(r.status, 200, r.text); await settle();
  for (const who of Object.keys(ev)) assert.equal(live(who).length, 0, 'a test changes no list: nothing for ' + who);
  r = await json('POST', '/api/announcements', { subject: 'Big news', message: 'Hello everyone' }, admin, 'tabadmin0001'); assert.equal(r.status, 200, r.text);
  const an = r.body.announcement;
  for (let i = 0; i < 60 && live('andi', 'announcements').length < 2; i++) await wait(100);
  assert.deepEqual(live('andi', 'announcements')[0], { type: 'live_changed', kind: 'announcements', id: an.id, by: 'admin', tab: 'tabadmin0001' }, 'it started');
  assert.equal(live('andi', 'announcements').length, 2, 'and it is done');
  assert.equal('tab' in live('andi', 'announcements')[1], false, 'the end has no request behind it');
  assert.equal(live('admin', 'announcements').length, 2);
  for (const who of ['sarah', 'maya', 'rizky', 'zein']) assert.equal(live(who).length, 0, who + ' does not see the list and hears nothing');
});
