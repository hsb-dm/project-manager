/* Chat on the server (audit, Oct 2026).
   - An archived conversation is read-only: no edits, deletes, reactions, pins or renames in it;
     unarchiving still works.
   - Someone taken out of a group is told (conversation_removed), instead of keeping a group whose
     every send fails. The browser side: e2e/chat-audit.spec.js. */
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
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-chataudit-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'ChatAudit!Admin2345', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'chataudit-secret-key-longer-than-32-characters!', COS_BACKUP_KEY: 'chataudit-backup-key-longer-than-32-characters!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'ChatAudit!Admin2345');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const stream = cookie => { const events = []; const r = http.get({ host: '127.0.0.1', port, path: '/api/messages/stream', headers: { cookie, origin: base } }, res => { res.setEncoding('utf8'); res.on('data', d => d.split('\n').filter(l => l.startsWith('data: ')).forEach(l => { try { events.push(JSON.parse(l.slice(6))); } catch {} })); }); r.on('error', () => {}); t.after(() => r.destroy()); return { events, close: () => r.destroy() }; };
  return { req, admin, as, stream };
}

test('an archived conversation is read-only; someone taken out of a group is told', { timeout: 30000 }, async t => {
  const s = await start(t);
  const sarah = await s.as('sarah'), zein = await s.as('zein');
  let r = await s.req('POST', '/api/messages/conversations', { type: 'GROUP', name: 'Launch crew', members: ['sarah', 'zein', 'admin'] }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  const g = await r.json();
  r = await s.req('POST', '/api/messages/conversations/' + g.id + '/messages', { body: 'Kick-off at 10' }, sarah);
  assert.equal(r.status, 200, await r.clone().text());
  const msg = await r.json(); const mid = (msg.message || msg).id;
  assert.equal((await s.req('PATCH', '/api/messages/conversations/' + g.id, { archived: true }, s.admin)).status, 200);
  assert.equal((await s.req('PATCH', '/api/messages/' + mid, { body: 'rewritten' }, sarah)).status, 400, 'no edits');
  assert.equal((await s.req('POST', '/api/messages/' + mid + '/reactions', { emoji: '👍' }, zein)).status, 400, 'no reactions');
  assert.equal((await s.req('POST', '/api/messages/' + mid + '/pin', {}, s.admin)).status, 400, 'no pins');
  assert.equal((await s.req('DELETE', '/api/messages/' + mid, undefined, sarah)).status, 400, 'no deletes');
  assert.equal((await s.req('PATCH', '/api/messages/conversations/' + g.id, { name: 'Renamed' }, s.admin)).status, 400, 'no renames');
  assert.equal((await s.req('PATCH', '/api/messages/conversations/' + g.id, { archived: false }, s.admin)).status, 200, 'unarchiving works');
  assert.equal((await s.req('PATCH', '/api/messages/' + mid, { body: 'Kick-off at 11' }, sarah)).status, 200, 'and it is open again');

  /* zein is taken out, and hears so */
  const z = s.stream(zein); await wait(300);
  assert.equal((await s.req('PATCH', '/api/messages/conversations/' + g.id, { members: ['sarah', 'admin'] }, s.admin)).status, 200);
  await wait(300);
  assert.ok(z.events.some(e => e.type === 'conversation_removed' && e.conversationId === g.id), JSON.stringify(z.events.map(e => e.type)));
});
