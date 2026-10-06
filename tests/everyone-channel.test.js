/* #everyone: one channel with every active member of the workspace, beside the team channels.

   Its members are worked out, not stored: whoever is active in the workspace is in it. It cannot be
   left, archived, renamed or given a member list; an admin can change its description. */
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

test('#everyone holds every active member, and stays that way', { timeout: 30000 }, async t => {
  const s = await start(t); const sarah = await s.as('sarah'); const zein = await s.as('zein');
  const list = async c => (await s.req('GET', '/api/messages/conversations', undefined, c)).json();
  const everyone = (await list(sarah)).filter(c => c.type === 'WORKSPACE');
  assert.equal(everyone.length, 1, 'one #everyone in the workspace');
  const id = everyone[0].id;
  assert.ok((await list(zein)).some(c => c.id === id), 'the same channel for someone in another team');
  assert.ok((await list(s.admin)).some(c => c.id === id));

  /* a message in it reaches everyone */
  let r = await s.req('POST', '/api/messages/conversations/' + id + '/messages', { body: 'Hello all' }, sarah);
  assert.equal(r.status, 200, await r.clone().text());
  const seen = await (await s.req('GET', '/api/messages/conversations/' + id + '/messages', undefined, zein)).json();
  assert.ok(JSON.stringify(seen).includes('Hello all'));

  /* not left, archived, renamed or given members; only an admin changes the description */
  assert.equal((await s.req('POST', '/api/messages/conversations/' + id + '/leave', {}, sarah)).status, 400);
  assert.equal((await s.req('PATCH', '/api/messages/conversations/' + id, { archived: true }, s.admin)).status, 400);
  assert.equal((await s.req('PATCH', '/api/messages/conversations/' + id, { name: 'random' }, s.admin)).status, 400);
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
  assert.ok((await list(joiner)).some(c => c.id === id), 'a new member is in #everyone');
});
