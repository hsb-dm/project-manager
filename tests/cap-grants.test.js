/* Extra permissions for one person (Oct 2026): someone who manages roles gives a person permissions on top of their
   role, until an optional last day, without changing the role; and AI Hub templates have two permissions, for
   everyone and for oneself (given once to every role that can use AI Hub). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const root = path.join(__dirname, '..');

function place(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-grants-')), servers = []; t.after(async () => { for (const s of servers) await s.stop(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }); return { dir, servers }; }
async function start(at) {
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: at.dir, COS_ADMIN_PASSWORD: 'Grant!Admin234567', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'grant-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'grant-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0', COS_MAIL_TRANSPORT: 'log', APP_URL: 'https://zen.hsb-test.dev' }) });
  const stop = async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } };
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 10000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Grant!Admin234567');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const boot = await (await req('GET', '/api/bootstrap', undefined, admin)).json();
  const s = { req, admin, as, boot, stop }; at.servers.push(s); return s;
}
const tpl = extra => ({ template: Object.assign({ name: 'T', brief: 'b' }, extra || {}) });
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

test('a person gets permissions on top of their role, until a last day, without the role changing', { timeout: 60000 }, async t => {
  const at = place(t), s = await start(at);
  const ids = Object.keys(s.boot.people).filter(id => id !== 'admin' && s.boot.people[id].perm === 'member' && !s.boot.people[id].stakeholder);
  const [m1, m2] = [await s.as(ids[0]), await s.as(ids[1])];
  const me = async ck => (await (await s.req('GET', '/api/bootstrap', undefined, ck)).json()).me;
  /* every role that can use AI Hub got templates for themselves, once */
  assert.ok(s.boot.roles.find(r => r.id === 'member').permissions.includes('save_own_ai_templates'));
  assert.ok(!s.boot.roles.find(r => r.id === 'member').permissions.includes('save_ai_templates'));
  /* a member: their own templates yes, for everyone no */
  assert.equal((await s.req('POST', '/api/ai/templates', tpl({ private: true }), m1)).status, 200);
  assert.equal((await s.req('POST', '/api/ai/templates', tpl(), m1)).status, 403);
  /* only someone who manages roles gives extra permissions */
  const grant = (id, body, ck) => s.req('PUT', '/api/members/' + id + '/cap-grants', body, ck || s.admin);
  assert.equal((await grant(ids[1], { caps: ['save_ai_templates'] }, m1)).status, 403);
  assert.equal((await s.req('GET', '/api/cap-grants', undefined, m1)).status, 403);
  /* not to oneself, not to an admin, not with a date that is not one or has passed */
  assert.equal((await grant('admin', { caps: ['save_ai_templates'] })).status, 400);
  assert.equal((await grant(ids[0], { caps: ['save_ai_templates'], expiresAt: 'soon' })).status, 400);
  assert.equal((await grant(ids[0], { caps: ['save_ai_templates'], expiresAt: day(-2) })).status, 400);
  /* given until next week: unknown permissions and ones the role already has are left out */
  let r = await grant(ids[0], { caps: ['save_ai_templates', 'use_ai_hub', 'not_a_permission'], expiresAt: day(7) });
  assert.equal(r.status, 200, await r.clone().text());
  assert.deepEqual((await r.json()).grants.map(g => [g.userId, g.cap, g.expiresAt]), [[ids[0], 'save_ai_templates', day(7)]]);
  const m1me = await me(m1);
  assert.equal(m1me.role, 'member', 'the role stays');
  assert.deepEqual(m1me.extraCaps, [{ cap: 'save_ai_templates', expiresAt: day(7) }]);
  assert.equal((await s.req('POST', '/api/ai/templates', tpl(), m1)).status, 200, 'now for everyone too');
  assert.equal((await s.req('POST', '/api/ai/templates', tpl(), m2)).status, 403, 'only that person');
  assert.deepEqual((await (await s.req('GET', '/api/live/grants', undefined, m1)).json()).mine, [{ cap: 'save_ai_templates', expiresAt: day(7) }]);
  assert.equal((await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).capGrants.length, 1, 'the admin sees who has them');
  assert.deepEqual((await (await s.req('GET', '/api/bootstrap', undefined, m2)).json()).capGrants, [], 'a member does not');
  /* the last day passed: gone by itself */
  await s.stop();
  const d = new DatabaseSync(path.join(at.dir, 'creative-os.db')); d.prepare('UPDATE cap_grants SET expires_at=?').run(day(-1)); d.close();
  const s2 = await start(at), m1b = await s2.as(ids[0]);
  assert.equal((await s2.req('POST', '/api/ai/templates', tpl(), m1b)).status, 403);
  assert.deepEqual((await (await s2.req('GET', '/api/bootstrap', undefined, m1b)).json()).me.extraCaps, []);
  /* given without a day, then taken back */
  assert.equal((await s2.req('PUT', '/api/members/' + ids[0] + '/cap-grants', { caps: ['view_analytics'] }, s2.admin)).status, 200);
  assert.deepEqual((await (await s2.req('GET', '/api/bootstrap', undefined, m1b)).json()).me.extraCaps, [{ cap: 'view_analytics', expiresAt: null }]);
  assert.equal((await s2.req('GET', '/api/analytics', undefined, m1b)).status === 403, false);
  assert.equal((await s2.req('PUT', '/api/members/' + ids[0] + '/cap-grants', { caps: [] }, s2.admin)).status, 200);
  assert.deepEqual((await (await s2.req('GET', '/api/bootstrap', undefined, m1b)).json()).me.extraCaps, []);
});

test('templates for oneself and for everyone each take their own permission', { timeout: 60000 }, async t => {
  const s = await start(place(t));
  const ids = Object.keys(s.boot.people).filter(id => id !== 'admin' && s.boot.people[id].perm === 'member' && !s.boot.people[id].stakeholder);
  const m1 = await s.as(ids[0]), role = s.boot.roles.find(r => r.id === 'member');
  const setRole = caps => s.req('PUT', '/api/roles/member', Object.assign({}, role, { permissions: role.permissions.filter(c => c !== 'save_own_ai_templates' && c !== 'save_ai_templates').concat(caps) }), s.admin);
  /* own only: a private template, kept private */
  let r = await s.req('POST', '/api/ai/templates', tpl({ private: true }), m1); const own = (await r.json()).id;
  assert.equal((await s.req('PUT', '/api/ai/templates/' + own, tpl({ private: false }), m1)).status, 403, 'sharing it takes the everyone permission');
  assert.equal((await s.req('PUT', '/api/ai/templates/' + own, tpl({ name: 'T2', private: true }), m1)).status, 200);
  /* everyone only (it covers one's own too) */
  assert.equal((await setRole(['save_ai_templates'])).status, 200);
  assert.equal((await s.req('PUT', '/api/ai/templates/' + own, tpl({ private: false }), m1)).status, 200);
  assert.equal((await s.req('POST', '/api/ai/templates', tpl({ private: true }), m1)).status, 200);
  /* neither: nothing, not even removing one's own */
  assert.equal((await setRole([])).status, 200);
  assert.equal((await s.req('POST', '/api/ai/templates', tpl({ private: true }), m1)).status, 403);
  assert.equal((await s.req('DELETE', '/api/ai/templates/' + own, undefined, m1)).status, 403);
});
