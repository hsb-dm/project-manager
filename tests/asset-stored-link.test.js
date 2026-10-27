/* An asset whose file is kept on this server. With File storage set to "This server", Upload asset
   and an asset's New version link the asset to /files/d/<sha256>.<ext>; the asset routes asked for an
   HTTPS link only and refused it ("Asset link is invalid"), so neither could be saved. A task's
   files, versions and comment attachments already took such a link when this server had stored it
   (filestore.isStoredUrl); an asset now takes it on the same terms, and a made-up path is still
   refused. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-assetlink-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'AssetLink!Admin2345', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'assetlink-secret-key-longer-than-32-characters!', COS_BACKUP_KEY: 'assetlink-backup-key-longer-than-32-characters!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const upload = (name, bytes, c) => fetch(base + '/api/files/upload?name=' + encodeURIComponent(name), { method: 'POST', headers: { 'content-type': 'application/octet-stream', origin: base, cookie: c }, body: bytes });
  const r = await req('POST', '/api/auth/login', { email: 'admin@zencrevia.demo', password: 'AssetLink!Admin2345' });
  assert.equal(r.status, 200, await r.clone().text());
  return { req, upload, admin: r.headers.get('set-cookie').split(';')[0] };
}

test('an asset kept on this server saves with its /files/d/ link; a link this server never stored is still refused', { timeout: 30000 }, async t => {
  const s = await start(t);
  /* a small PDF, as Upload asset sends it when File storage is "This server" */
  const up = await s.upload('brief.pdf', Buffer.from('%PDF-1.4\n% asset link test\n'), s.admin);
  assert.equal(up.status, 200, await up.clone().text());
  const stored = (await up.json()).url;
  assert.match(stored, /^\/files\/d\/[0-9a-f]{64}\.pdf$/);

  let r = await s.req('POST', '/api/assets', { id: 'as_stored', name: 'Brief', type: 'other', source: 'server', url: stored }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  const saved = (await r.json()).find(a => a.id === 'as_stored');
  assert.equal(saved.url, stored);

  /* New version: the same asset, now pointing at a second stored file */
  const up2 = await s.upload('brief-v2.pdf', Buffer.from('%PDF-1.4\n% version two\n'), s.admin);
  const stored2 = (await up2.json()).url;
  r = await s.req('PUT', '/api/assets/as_stored', Object.assign({}, saved, { url: stored2, ver: 2 }), s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await r.json()).find(a => a.id === 'as_stored').url, stored2);

  /* our own path shape, but nothing this server stored: still refused, on create and on edit */
  const fake = '/files/d/' + 'a'.repeat(64) + '.pdf';
  r = await s.req('POST', '/api/assets', { id: 'as_fake', name: 'Fake', type: 'other', url: fake }, s.admin);
  assert.equal(r.status, 400);
  r = await s.req('PUT', '/api/assets/as_stored', Object.assign({}, saved, { url: fake }), s.admin);
  assert.equal(r.status, 400);
  /* and the HTTPS rule for every other link stands */
  r = await s.req('POST', '/api/assets', { id: 'as_http', name: 'Plain', type: 'other', url: 'http://example.com/a.pdf' }, s.admin);
  assert.equal(r.status, 400);
  r = await s.req('POST', '/api/assets', { id: 'as_https', name: 'Link', type: 'other', url: 'https://example.com/a.pdf' }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
});
