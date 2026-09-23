/* v30 — behavioural tests against a real production-mode server process. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const root = path.join(__dirname, '..');
const ADMIN = { email: 'ops@zencrevia.test', password: 'Accounts!Admin234' };

async function startServer(t, extraEnv, reuseDir) {
  const temp = reuseDir || fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-v30-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], {
    cwd: root,
    env: Object.assign({}, process.env, {
      NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, APP_URL: 'https://zencrevia.test',
      COS_ADMIN_PASSWORD: ADMIN.password, COS_ADMIN_EMAIL: ADMIN.email, COS_ADMIN_NAME: 'Rina Ops',
      COS_SECRET_KEY: 'v30-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'v30-backup-key-longer-than-32-characters!!',
      COS_ALLOW_REGISTRATION: '0', COS_BACKUP_INTERVAL_HOURS: '0', COS_SEED_DEMO: '', COS_MAIL_TRANSPORT: 'log'
    }, extraEnv || {})
  });
  const stop = async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } };
  if (!reuseDir) t.after(async () => { await stop(); fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  else t.after(stop);
  let out = '';
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start: ' + out)), 8000);
    child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(timer); resolve(+m[1]); } });
    child.stderr.on('data', d => { out += d; });
    child.once('exit', c => { clearTimeout(timer); reject(new Error('exited ' + c + ': ' + out)); });
  });
  const base = 'http://127.0.0.1:' + port;
  const req = (method, p, body, cookie, headers) => fetch(base + p, { method, headers: Object.assign({ 'content-type': 'application/json', origin: base }, cookie ? { cookie } : {}, headers || {}), body: body === undefined ? undefined : JSON.stringify(body) });
  const login = async (email, password) => { const r = await req('POST', '/api/auth/login', { email, password }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  return { base, req, login, temp, stop };
}

/* The "log" mail transport writes base64 MIME parts; decode them and pull the reset token. */
async function resetTokenFor(dir, email, minFiles) {
  const box = path.join(dir, 'outbox');
  for (let i = 0; i < 40; i++) {
    const files = fs.existsSync(box) ? fs.readdirSync(box).filter(f => f.includes(email.replace(/[^a-z0-9@.]/gi, '_'))).sort() : [];
    if (files.length && files.length >= (minFiles || 1)) {
      const raw = fs.readFileSync(path.join(box, files[files.length - 1]), 'utf8');
      const text = raw.split(/\r?\n\r?\n/).map(part => { try { return Buffer.from(part.replace(/\s+/g, ''), 'base64').toString('utf8'); } catch { return ''; } }).join('\n');
      const m = text.match(/\/\?reset=([a-f0-9]{64})/);
      if (m) return { token: m[1], files: files.length, text };
    }
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('no reset email #' + (minFiles || 1) + ' for ' + email);
}

test('forgot password: uniform response, single-use expiring token, sessions ended', { timeout: 30000 }, async t => {
  const s = await startServer(t);
  const admin = await s.login(ADMIN.email, ADMIN.password);
  assert.equal((await s.req('POST', '/api/members', { id: 'mira', name: 'Mira Member', email: 'mira@zencrevia.test', perm: 'member', teams: [] }, admin)).status, 200);
  assert.equal((await s.req('POST', '/api/members/mira/password', { password: 'Original!Pass234' }, admin)).status, 200);
  const miraOld = await s.login('mira@zencrevia.test', 'Original!Pass234');

  // same answer for known and unknown addresses; nothing is sent for unknown ones
  const known = await (await s.req('POST', '/api/auth/forgot', { email: 'MIRA@zencrevia.test' })).json();
  const unknown = await (await s.req('POST', '/api/auth/forgot', { email: 'nobody@zencrevia.test' })).json();
  assert.deepEqual(known, unknown);
  assert.equal((await s.req('POST', '/api/auth/forgot', { email: 'not-an-email' })).status, 400);
  const { token, text } = await resetTokenFor(s.temp, 'mira@zencrevia.test');
  assert.match(text, /https:\/\/zencrevia\.test\/\?reset=/);
  assert.ok(!fs.readdirSync(path.join(s.temp, 'outbox')).some(f => f.includes('nobody')));

  // only a hash is stored
  const { DatabaseSync } = require('node:sqlite');
  const peek = new DatabaseSync(path.join(s.temp, 'creative-os.db'), { readOnly: true });
  const stored = peek.prepare('SELECT id FROM password_resets').all().map(r => r.id);
  peek.close();
  assert.ok(stored.length >= 1 && stored.every(id => id.startsWith('sha256:') && !id.includes(token)));

  assert.deepEqual(await (await s.req('POST', '/api/auth/reset/check', { token })).json(), { valid: true });
  assert.equal((await s.req('POST', '/api/auth/reset', { token, password: 'short' })).status, 400);
  assert.equal((await s.req('POST', '/api/auth/reset', { token, password: 'Brand!NewPass2345' })).status, 200);

  // token is single use, old password and old session are gone, new password works
  assert.equal((await s.req('POST', '/api/auth/reset', { token, password: 'Another!Pass23456' })).status, 400);
  assert.deepEqual(await (await s.req('POST', '/api/auth/reset/check', { token })).json(), { valid: false });
  assert.equal((await s.req('GET', '/api/bootstrap', undefined, miraOld)).status, 401);
  assert.equal((await s.req('POST', '/api/auth/login', { email: 'mira@zencrevia.test', password: 'Original!Pass234' })).status, 401);
  await s.login('mira@zencrevia.test', 'Brand!NewPass2345');

  // a newer request voids the older link (each request writes one more .eml; wait for it)
  const count = () => fs.readdirSync(path.join(s.temp, 'outbox')).filter(f => f.includes('mira@zencrevia.test')).length;
  let n = count();
  await s.req('POST', '/api/auth/forgot', { email: 'mira@zencrevia.test' });
  const first = await resetTokenFor(s.temp, 'mira@zencrevia.test', ++n);
  await new Promise(r => setTimeout(r, 5));
  await s.req('POST', '/api/auth/forgot', { email: 'mira@zencrevia.test' });
  const second = await resetTokenFor(s.temp, 'mira@zencrevia.test', ++n);
  assert.notEqual(second.token, first.token);
  assert.deepEqual(await (await s.req('POST', '/api/auth/reset/check', { token: first.token })).json(), { valid: false });
  assert.deepEqual(await (await s.req('POST', '/api/auth/reset/check', { token: second.token })).json(), { valid: true });

  // expired links are refused
  { const w = new DatabaseSync(path.join(s.temp, 'creative-os.db')); w.prepare("UPDATE password_resets SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").run('sha256:' + crypto.createHash('sha256').update(second.token).digest('hex')); w.close(); }
  assert.deepEqual(await (await s.req('POST', '/api/auth/reset/check', { token: second.token })).json(), { valid: false });
  assert.equal((await s.req('POST', '/api/auth/reset', { token: second.token, password: 'Expired!Pass23456' })).status, 400);

  // deactivated accounts cannot use a live token
  await new Promise(r => setTimeout(r, 5));
  await s.req('POST', '/api/auth/forgot', { email: 'mira@zencrevia.test' });
  const third = await resetTokenFor(s.temp, 'mira@zencrevia.test', ++n);
  assert.deepEqual(await (await s.req('POST', '/api/auth/reset/check', { token: third.token })).json(), { valid: true });
  assert.equal((await s.req('POST', '/api/members/mira/active', { active: false }, admin)).status, 200);
  assert.deepEqual(await (await s.req('POST', '/api/auth/reset/check', { token: third.token })).json(), { valid: false });

  // rate limit per address
  let limited = false; for (let i = 0; i < 8 && !limited; i++) limited = (await s.req('POST', '/api/auth/forgot', { email: 'someone@zencrevia.test' })).status === 429;
  assert.ok(limited, 'forgot-password requests are rate limited');
});

test('a stored session hash cannot be replayed as a cookie', { timeout: 20000 }, async t => {
  const s = await startServer(t);
  const cookie = await s.login(ADMIN.email, ADMIN.password);
  const token = cookie.split('=')[1];
  assert.equal((await s.req('GET', '/api/bootstrap', undefined, cookie)).status, 200);
  const hashed = 'sha256:' + crypto.createHash('sha256').update(token).digest('hex');
  assert.equal((await s.req('GET', '/api/bootstrap', undefined, 'cos_session=' + hashed)).status, 401);
  assert.equal((await s.req('GET', '/api/bootstrap', undefined, 'cos_session=' + encodeURIComponent(hashed))).status, 401);
  // logout with a hash must not end someone else's session
  await s.req('POST', '/api/auth/logout', {}, 'cos_session=' + hashed);
  assert.equal((await s.req('GET', '/api/bootstrap', undefined, cookie)).status, 200);
});

test('old finished tasks arrive slim, hydrate on demand, and can never wipe history', { timeout: 30000 }, async t => {
  const s = await startServer(t, { COS_TASK_HOT_DAYS: '30' });
  const admin = await s.login(ADMIN.email, ADMIN.password);
  const boot0 = await (await s.req('GET', '/api/bootstrap', undefined, admin)).json();
  const done = boot0.ws.workflow.find(w => w.kind === 'closed' || w.id === 'done') || boot0.ws.workflow[boot0.ws.workflow.length - 1];
  const oldDate = new Date(Date.now() - 120 * 86400000).toISOString();
  const mk = async (id, status, completedAt) => { const r = await s.req('POST', '/api/tasks', { id, title: 'Task ' + id, status: 'backlog', description: 'Brief for ' + id }, admin); assert.equal(r.status, 200, await r.clone().text()); const cur = await r.json();
    cur.comments = [{ id: 'cm_' + id, by: 'admin', createdAt: oldDate, vis: 'team', text: 'History for ' + id, parent: null, attachments: [] }];
    cur.status = status; cur.reviewer = 'admin'; cur.reviewers = ['admin']; if (completedAt) cur.completedAt = completedAt;
    const u = await s.req('PUT', '/api/tasks/' + id, cur, admin); assert.equal(u.status, 200, await u.clone().text()); };
  await mk('OLD-1', 'done', oldDate);
  await mk('NEW-1', 'done', new Date().toISOString());
  await mk('OPEN-1', 'backlog');

  const boot = await (await s.req('GET', '/api/bootstrap', undefined, admin)).json();
  const byId = Object.fromEntries(boot.tasks.map(x => [x.id, x]));
  assert.equal(byId['OLD-1']._slim, true, 'old finished task is slim');
  assert.equal(byId['OLD-1'].comments.length, 0);
  assert.equal(byId['OLD-1'].title, 'Task OLD-1');
  assert.ok(!byId['NEW-1']._slim && byId['NEW-1'].comments.length === 1, 'recently finished task is full');
  assert.ok(!byId['OPEN-1']._slim && byId['OPEN-1'].description === 'Brief for OPEN-1', 'open task is full');
  assert.deepEqual(boot.taskWindow, { hotDays: 30, slim: 1, full: 2 });

  // GET /api/tasks/:id returns the full record
  const full = await (await s.req('GET', '/api/tasks/OLD-1', undefined, admin)).json();
  assert.equal(full.comments[0].text, 'History for OLD-1');
  assert.equal(full.description, 'Brief for OLD-1');
  assert.equal((await s.req('GET', '/api/tasks/NOPE', undefined, admin)).status, 404);

  // saving the slim copy changes only scalar fields; comments and description survive
  const slim = Object.assign({}, byId['OLD-1'], { title: 'Renamed from slim copy' });
  const saved = await (await s.req('PUT', '/api/tasks/OLD-1', slim, admin)).json();
  assert.equal(saved.title, 'Renamed from slim copy');
  assert.equal(saved.comments.length, 1);
  assert.equal(saved.description, 'Brief for OLD-1');
});

test('batched task reads return exactly what single reads return', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-batch-'));
  process.env.COS_DATA_DIR = temp;
  const { open } = require('../server/db'); const seed = require('../server/seed'); const sz = require('../server/serialize');
  const db = open(); seed.run(db);
  const ws = db.prepare('SELECT id FROM workspaces').get().id;
  const batch = sz.readTasksBatch(db, ws, '1=1', []);
  const ids = db.prepare('SELECT id FROM tasks ORDER BY sort_order').all().map(r => r.id);
  assert.equal(batch.length, ids.length);
  ids.forEach((id, i) => assert.deepEqual(batch[i], sz.readTask(db, id), id));
  db.close(); fs.rmSync(temp, { recursive: true, force: true });
});

test('security log rotates by size and keeps a bounded number of files', { timeout: 10000 }, () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-log-'));
  const script = `
    const s=require(${JSON.stringify(path.join(root, 'server', 'security.js'))});
    const big='x'.repeat(4000);
    for(let round=0;round<6;round++){ for(let i=0;i<300;i++) s.log('test_event',{pad:big.slice(0,180)}); s._rotateNow(); }
  `;
  require('node:child_process').execFileSync(process.execPath, ['--no-warnings', '-e', script], { env: Object.assign({}, process.env, { COS_DATA_DIR: temp, COS_SECURITY_LOG_MAX_MB: '0.05', COS_SECURITY_LOG_KEEP: '2' }) });
  const files = fs.readdirSync(temp).filter(f => f.startsWith('security.log')).sort();
  assert.ok(files.includes('security.log.1'), files.join(','));
  assert.ok(!files.includes('security.log.3'), 'keeps at most COS_SECURITY_LOG_KEEP rotated files: ' + files.join(','));
  fs.rmSync(temp, { recursive: true, force: true });
});
