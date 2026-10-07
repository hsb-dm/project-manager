/* Everyone: a group of channels with every active member of the workspace, beside the teams' —
   its #general, and the channels an admin adds.

   Their members are worked out, not stored: whoever is active in the workspace is in them. None can
   be left or given a member list; #general cannot be archived or renamed. Only an admin adds,
   renames, archives or describes them. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-everyone-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Everyone!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'everyone-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'everyone-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Everyone!Admin23456');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  return { req, admin, as };
}

test("Everyone's #general holds every active member, and stays that way", { timeout: 30000 }, async t => {
  const s = await start(t); const sarah = await s.as('sarah'); const zein = await s.as('zein');
  const list = async c => (await s.req('GET', '/api/messages/conversations', undefined, c)).json();
  const general = (await list(sarah)).filter(c => c.type === 'WORKSPACE');
  assert.equal(general.length, 1, 'one #general for the workspace');
  assert.equal(general[0].name, 'general');
  const id = general[0].id;
  assert.ok((await list(zein)).some(c => c.id === id), 'the same channel for someone in another team');
  assert.ok((await list(s.admin)).some(c => c.id === id));

  /* a message in it reaches everyone */
  let r = await s.req('POST', '/api/messages/conversations/' + id + '/messages', { body: 'Hello all' }, sarah);
  assert.equal(r.status, 200, await r.clone().text());
  const seen = await (await s.req('GET', '/api/messages/conversations/' + id + '/messages', undefined, zein)).json();
  assert.ok(JSON.stringify(seen).includes('Hello all'));

  /* not left, archived or given members; only an admin renames it or changes the description */
  assert.equal((await s.req('POST', '/api/messages/conversations/' + id + '/leave', {}, sarah)).status, 400);
  assert.equal((await s.req('PATCH', '/api/messages/conversations/' + id, { archived: true }, s.admin)).status, 400);
  assert.equal((await s.req('PATCH', '/api/messages/conversations/' + id, { name: 'random' }, sarah)).status, 403);
  r = await s.req('PATCH', '/api/messages/conversations/' + id, { name: 'random' }, s.admin);
  assert.equal(r.status, 200, await r.clone().text()); assert.equal((await r.json()).name, 'random');
  assert.equal((await s.req('PATCH', '/api/messages/conversations/' + id, { name: 'general' }, s.admin)).status, 200);
  assert.equal((await s.req('PATCH', '/api/messages/conversations/' + id, { members: ['sarah'] }, s.admin)).status, 400);
  assert.equal((await s.req('PATCH', '/api/messages/conversations/' + id, { description: 'Mine now' }, sarah)).status, 403);
  r = await s.req('PATCH', '/api/messages/conversations/' + id, { description: 'Company news' }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await r.json()).description, 'Company news');

  /* someone new is in it straight away */
  r = await s.req('POST', '/api/members', { name: 'New Joiner', email: 'newjoiner@zencrevia.demo', perm: 'member', cap: 40 }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  const people = (await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).people;
  const nid = Object.keys(people).find(k => people[k].email === 'newjoiner@zencrevia.demo');
  const joiner = await (async () => { await s.req('POST', '/api/members/' + nid + '/password', { password: 'Member!Pass2345' }, s.admin); return (await s.req('POST', '/api/auth/login', { email: 'newjoiner@zencrevia.demo', password: 'Member!Pass2345' })).headers.get('set-cookie').split(';')[0]; })();
  assert.ok((await list(joiner)).some(c => c.id === id), 'a new member is in it');
});

test('an admin adds channels for everyone; everyone is in them', { timeout: 30000 }, async t => {
  const s = await start(t); const sarah = await s.as('sarah'); const zein = await s.as('zein');
  const list = async c => (await s.req('GET', '/api/messages/conversations', undefined, c)).json();
  const add = (b, c) => s.req('POST', '/api/messages/conversations', Object.assign({ type: 'WORKSPACE_CHANNEL' }, b), c);

  /* only an admin adds one, and not a second #general or a name already used */
  assert.equal((await add({ name: 'announcements' }, sarah)).status, 403);
  let r = await add({ name: '#Announcements', description: 'News for all' }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  const ch = await r.json();
  assert.equal(ch.type, 'WORKSPACE_CHANNEL'); assert.equal(ch.name, 'announcements');
  assert.equal((await add({ name: 'general' }, s.admin)).status, 400);
  assert.equal((await add({ name: 'announcements' }, s.admin)).status, 400);

  /* everyone is in it, whatever their team */
  for (const c of [sarah, zein, s.admin]) assert.ok((await list(c)).some(x => x.id === ch.id));
  r = await s.req('POST', '/api/messages/conversations/' + ch.id + '/messages', { body: 'Office closed Friday' }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  assert.ok(JSON.stringify(await (await s.req('GET', '/api/messages/conversations/' + ch.id + '/messages', undefined, zein)).json()).includes('Office closed Friday'));

  /* not left or given members; an admin renames and archives it, nobody else */
  assert.equal((await s.req('POST', '/api/messages/conversations/' + ch.id + '/leave', {}, sarah)).status, 400);
  assert.equal((await s.req('PATCH', '/api/messages/conversations/' + ch.id, { members: ['sarah'] }, s.admin)).status, 400);
  assert.equal((await s.req('PATCH', '/api/messages/conversations/' + ch.id, { name: 'mine' }, sarah)).status, 403);
  assert.equal((await s.req('PATCH', '/api/messages/conversations/' + ch.id, { name: 'general' }, s.admin)).status, 400);
  r = await s.req('PATCH', '/api/messages/conversations/' + ch.id, { name: 'News Desk' }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await r.json()).name, 'news-desk');
  assert.equal((await s.req('PATCH', '/api/messages/conversations/' + ch.id, { archived: true }, sarah)).status, 403);
  r = await s.req('PATCH', '/api/messages/conversations/' + ch.id, { archived: true }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  assert.ok((await r.json()).archivedAt);
  /* its name is free again once it is archived */
  assert.equal((await add({ name: 'news-desk' }, s.admin)).status, 200);
});
