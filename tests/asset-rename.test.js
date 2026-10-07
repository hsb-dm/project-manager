/* Renaming an asset. Whoever added it can rename it; changing anything else is for those who manage
   assets. A name is never empty. Who added an asset, and when, are the server's — an edit used to be
   able to rewrite them. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-assetname-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'AssetName!Admin2345', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'assetname-secret-key-longer-than-32-characters!', COS_BACKUP_KEY: 'assetname-backup-key-longer-than-32-characters!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'AssetName!Admin2345');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const boot = await (await req('GET', '/api/bootstrap', undefined, admin)).json();
  return { req, admin, as, boot };
}

test('whoever added an asset renames it; nobody empties a name or rewrites who added it', { timeout: 30000 }, async t => {
  const s = await start(t);
  const [mine, other] = Object.keys(s.boot.people).filter(id => id !== 'admin' && s.boot.people[id].active !== false);
  assert.equal((await s.req('PUT', '/api/members/' + mine, { perm: 'member' }, s.admin)).status, 200);
  const me = await s.as(mine);
  let r = await s.req('POST', '/api/assets', { id: 'as_mine', name: 'motio freelance', type: 'video', folder: s.boot.folders[0] && s.boot.folders[0].id }, me);
  assert.equal(r.status, 200, await r.clone().text());
  const get = async () => (await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).assets.find(a => a.id === 'as_mine');
  const before = await get();
  assert.equal(before.by, mine);

  /* the one who added it renames it */
  r = await s.req('PUT', '/api/assets/as_mine', Object.assign({}, before, { name: '  Motion reel — freelance  ' }), me);
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await get()).name, 'Motion reel — freelance');
  /* without managing assets any more, the name is still theirs to change — and only the name */
  assert.equal((await s.req('PUT', '/api/members/' + mine, { perm: 'viewer' }, s.admin)).status, 200);
  r = await s.req('PUT', '/api/assets/as_mine', Object.assign({}, await get(), { name: 'Reel v2', type: 'image', description: 'changed' }), me);
  assert.equal(r.status, 200, await r.clone().text());
  const now = await get(); assert.equal(now.name, 'Reel v2'); assert.equal(now.type, 'video'); assert.equal(now.description, '');
  /* someone else without asset rights cannot */
  assert.equal((await s.req('PUT', '/api/members/' + other, { perm: 'viewer' }, s.admin)).status, 200);
  assert.equal((await s.req('PUT', '/api/assets/as_mine', Object.assign({}, now, { name: 'Taken' }), await s.as(other))).status, 403);
  /* never empty; who added it stays */
  assert.equal((await s.req('PUT', '/api/assets/as_mine', Object.assign({}, now, { name: '   ' }), s.admin)).status, 400);
  r = await s.req('PUT', '/api/assets/as_mine', Object.assign({}, now, { by: 'admin', createdAt: '2000-01-01T00:00:00.000Z' }), s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  const after = await get(); assert.equal(after.by, mine); assert.equal(after.createdAt, before.createdAt);
});
