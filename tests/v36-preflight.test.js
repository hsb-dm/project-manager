/* v36 — production preflight refuses unsafe configuration (pre-launch audit). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { check } = require('../server/preflight');
const root = path.join(__dirname, '..');

function parseEnv(file) { const o = {}; fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach(l => { const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()); if (m) o[m[1]] = m[2]; }); return o; }

test('.env.example copied unchanged is refused, with every placeholder named', () => {
  const r = check(parseEnv(path.join(root, '.env.example')), { firstStart: true });
  const all = r.errors.join('\n');
  for (const k of ['COS_SECRET_KEY', 'COS_BACKUP_KEY', 'COS_ADMIN_PASSWORD', 'COS_ADMIN_EMAIL', 'APP_URL', 'COS_ALLOWED_ORIGINS']) assert.match(all, new RegExp(k), k);
});

test('a proper configuration passes; weak values are caught', () => {
  const good = { NODE_ENV: 'production', COS_SECRET_KEY: 'k'.repeat(40), COS_BACKUP_KEY: 'b'.repeat(40), COS_ADMIN_PASSWORD: 'Strong!Pass-2026', COS_ADMIN_EMAIL: 'ops@hsb.co.id', APP_URL: 'https://zen.hsb.co.id', COS_ALLOWED_ORIGINS: 'https://zen.hsb.co.id', COS_TRUST_PROXY: '1', COS_MAIL_TRANSPORT: 'smtp', MAIL_FROM: 'ZenCrevia <zen@hsb.co.id>', TZ: 'Asia/Jakarta', COS_DATA_DIR: '/var/lib/zencrevia' };
  const r = check(good, { firstStart: true });
  assert.deepEqual(r.errors, []); assert.deepEqual(r.warnings, []);
  assert.ok(check(Object.assign({}, good, { COS_SECRET_KEY: 'short' })).errors.length);
  assert.ok(check(Object.assign({}, good, { COS_BACKUP_KEY: good.COS_SECRET_KEY })).errors.some(e => /different/.test(e)));
  assert.ok(check(Object.assign({}, good, { COS_ADMIN_PASSWORD: 'abc' }), { firstStart: true }).errors.some(e => /12 characters/.test(e)));
  assert.deepEqual(check(Object.assign({}, good, { COS_ADMIN_PASSWORD: 'abc' }), { firstStart: false }).errors, [], 'admin password only matters on first start');
  assert.ok(check(Object.assign({}, good, { COS_TRUST_PROXY: '' })).warnings.some(w => /COS_TRUST_PROXY/.test(w)));
  assert.ok(check(Object.assign({}, good, { COS_DATA_DIR: '' })).warnings.some(w => /inside the application folder/.test(w)), 'v38: data inside the app folder is flagged');
  assert.ok(check(Object.assign({}, good, { COS_MAIL_TRANSPORT: 'log' })).warnings.some(w => /outbox/.test(w)));
});

test('the real server exits before listening when preflight fails', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-pf-'));
  const env = Object.assign({}, process.env, parseEnv(path.join(root, '.env.example')), { PORT: '0', COS_DATA_DIR: temp });
  const r = spawnSync(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env, timeout: 8000, encoding: 'utf8' });
  fs.rmSync(temp, { recursive: true, force: true });
  assert.equal(r.status, 78, r.stdout + r.stderr);
  assert.match(r.stderr, /will not start in production/);
  assert.doesNotMatch(r.stdout, /running at/);
});

test('cached sign-in task list reflects a write immediately', { timeout: 20000 }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-cache-'));
  const { spawn } = require('node:child_process');
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Cache!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'cache-secret-key-longer-than-32-chars!!!', COS_BACKUP_KEY: 'cache-backup-key-longer-than-32-chars!!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = await req('POST', '/api/auth/login', { email: 'admin@zencrevia.demo', password: 'Cache!Admin23456' }); const c = login.headers.get('set-cookie').split(';')[0];
  const title = async () => (await (await req('GET', '/api/bootstrap', undefined, c)).json()).tasks.find(x => x.id === 'T-118').title;
  const first = await title(); assert.equal(await title(), first, 'second read served from cache');
  const cur = await (await req('GET', '/api/tasks/T-118', undefined, c)).json();
  assert.equal((await req('PUT', '/api/tasks/T-118', Object.assign(cur, { title: 'Changed after cache' }), c)).status, 200);
  assert.equal(await title(), 'Changed after cache');
  assert.equal((await req('POST', '/api/tasks/T-118/move', { type: 'MOVE_TASK_STATUS', toStatusId: 'progress' }, c)).status, 200);
  assert.equal((await (await req('GET', '/api/bootstrap', undefined, c)).json()).tasks.find(x => x.id === 'T-118').status, 'progress');
});
