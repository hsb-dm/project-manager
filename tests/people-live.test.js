/* A status (focus, meeting…) reaches everyone at once over the live stream; other preferences are
   nobody else's business and are not sent. Every channel — #general too — can be renamed by whoever may
   edit it; a name is unique among everyone's channels or one team's, and is written as a channel name.
   The browser side: e2e/people-status.spec.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));

test('status goes out live; every channel can be renamed', { timeout: 30000 }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-peoplelive-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'PeopleLive!Admin234', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'peoplelive-secret-key-longer-than-32-characters', COS_BACKUP_KEY: 'peoplelive-backup-key-longer-than-32-characters', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0', COS_MAIL_TRANSPORT: 'log' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const json = async (m, p, b, c) => { const r = await req(m, p, b, c); const text = await r.text(); return { status: r.status, body: text ? JSON.parse(text) : null }; };
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'PeopleLive!Admin234');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const stream = cookie => { const events = []; const r = http.get({ host: '127.0.0.1', port, path: '/api/messages/stream', headers: { cookie, origin: base } }, res => { res.setEncoding('utf8'); res.on('data', d => d.split('\n').filter(l => l.startsWith('data: ')).forEach(l => { try { events.push(JSON.parse(l.slice(6))); } catch {} })); }); r.on('error', () => {}); t.after(() => r.destroy()); return events; };
  const sarah = await as('sarah'), zein = await as('zein');
  const sEv = stream(sarah), zEv = stream(zein); await wait(400);

  /* --- status --- */
  const boot = (await json('GET', '/api/bootstrap', undefined, sarah)).body;
  const me = boot.people.sarah;
  const putPrefs = prefs => json('PUT', '/api/members/sarah?prefsOnly=1', Object.assign({}, me, { id: 'sarah', prefs }), sarah);
  const focus = { state: 'focus', emoji: '🎯', text: '', until: new Date(Date.now() + 3600000).toISOString() };
  assert.equal((await putPrefs(Object.assign({}, me.prefs, { availability: focus }))).status, 200);
  await wait(400);
  const got = zEv.filter(e => e.type === 'person_status');
  assert.equal(got.length, 1, 'zein hears of it: ' + JSON.stringify(zEv.map(e => e.type)));
  assert.equal(got[0].id, 'sarah'); assert.deepEqual(got[0].availability, focus);
  assert.ok(sEv.some(e => e.type === 'person_status'), 'her other tabs hear of it too');
  assert.equal(Object.keys(got[0]).sort().join(','), 'availability,by,id,type', 'nothing else of her preferences goes out');
  /* a preference that is not a status: nothing goes out */
  assert.equal((await putPrefs(Object.assign({}, me.prefs, { availability: focus, projScope: 'mine' }))).status, 200);
  await wait(300);
  assert.equal(zEv.filter(e => e.type === 'person_status').length, 1, 'a view preference is not announced');
  /* cleared */
  assert.equal((await putPrefs(Object.assign({}, me.prefs, { availability: null, projScope: 'mine' }))).status, 200);
  await wait(300);
  const last = zEv.filter(e => e.type === 'person_status').pop();
  assert.equal(last.availability, null);

  /* --- channels --- */
  await json('POST', '/api/members/admin/team', { teamId: boot.teams[0].id }, admin);   /* team channels are seen by the team */
  const convs = (await json('GET', '/api/messages/conversations', undefined, admin)).body;
  const wsGeneral = convs.find(c => c.type === 'WORKSPACE');
  const teamGeneral = convs.find(c => c.type === 'TEAM_DEFAULT');
  assert.ok(wsGeneral && teamGeneral, 'both #generals are there');
  const patch = (id, b, c) => json('PATCH', '/api/messages/conversations/' + id, b, c || admin);
  /* everyone's #general takes a new name, written as a channel name */
  let r = await patch(wsGeneral.id, { name: 'Company Lobby!', description: 'Say hello' });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.name, 'company-lobby'); assert.equal(r.body.description, 'Say hello');
  /* "everyone" is the group's own name */
  r = await patch(wsGeneral.id, { name: 'everyone' }); assert.equal(r.status, 400);
  /* a team's #general too */
  r = await patch(teamGeneral.id, { name: 'umum' }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.name, 'umum');
  /* a team channel cannot take a name its team already uses, on creation or on rename */
  r = await json('POST', '/api/messages/conversations', { type: 'TEAM_CHANNEL', teamId: teamGeneral.teamId, name: 'umum' }, admin); assert.equal(r.status, 400);
  r = await json('POST', '/api/messages/conversations', { type: 'TEAM_CHANNEL', teamId: teamGeneral.teamId, name: 'Shoot Plans' }, admin); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.name, 'shoot-plans');
  const chan = r.body;
  r = await patch(chan.id, { name: 'umum' }); assert.equal(r.status, 400);
  r = await patch(chan.id, { name: 'Shoot Plans 2!' }); assert.equal(r.status, 200); assert.equal(r.body.name, 'shoot-plans-2', 'a team channel rename is written as a channel name');
  /* "general" is free once #general has another name */
  r = await json('POST', '/api/messages/conversations', { type: 'TEAM_CHANNEL', teamId: teamGeneral.teamId, name: 'general' }, admin); assert.equal(r.status, 200, JSON.stringify(r.body));
  /* only whoever may edit a channel can rename it */
  r = await patch(wsGeneral.id, { name: 'mine-now' }, zein); assert.equal(r.status, 403);
  /* everyone hears of the new name */
  await wait(300);
  assert.ok(zEv.some(e => e.type === 'conversation_updated' && e.conversation.id === wsGeneral.id && e.conversation.name === 'company-lobby'));

  /* --- an email's link reads like its task: /tasks?task=<id>-<title> --- */
  const tk = boot.tasks.find(x => !x._slim && x.title);
  const slug = tk.title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  assert.equal((await json('POST', '/api/notifications', { k: 'assigned', recipients: ['zein'], t: tk.id, entityType: 'task' }, admin)).status, 200);
  const box = path.join(temp, 'outbox'); let text = '';
  for (let i = 0; i < 40 && !text.includes('task='); i++) { await wait(100); const files = fs.existsSync(box) ? fs.readdirSync(box).filter(f => f.includes('zein')) : []; text = files.map(f => fs.readFileSync(path.join(box, f), 'utf8').split(/\r?\n\r?\n/).map(part => { try { return Buffer.from(part.replace(/\s+/g, ''), 'base64').toString('utf8'); } catch { return ''; } }).join('\n')).join('\n'); }
  assert.ok(text.includes('/tasks?task=' + encodeURIComponent(tk.id + '-' + slug)), 'the link carries the title: ' + (text.match(/\/tasks\?task=[^\s"<]+/) || [''])[0] + ' want ' + tk.id + '-' + slug);
});
