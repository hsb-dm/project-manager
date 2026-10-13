/* The default tagline was "Creative operations workspace"; teams outside creative use the workspace too, so the
   default is "Team operations workspace" (shared/demo-data.js). A workspace still on the old default gets the new
   one when the server starts — once (app_meta 'tagline_general'), so a tagline someone wrote, or the old words
   chosen again later, are left as they are. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const root = path.join(__dirname, '..');

async function boot(dir) {
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: dir, COS_ADMIN_PASSWORD: 'Tagline!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'tagline-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'tagline-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  let out = '';
  await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 10000); child.stdout.on('data', d => { out += d; if (/localhost:\d+/.test(out)) { clearTimeout(tm); res(); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  child.kill(); await new Promise(r => child.once('exit', r));
}
const db = dir => new DatabaseSync(path.join(dir, 'creative-os.db'));
const tagline = dir => { const d = db(dir); const t = d.prepare('SELECT tagline FROM workspaces').get().tagline; d.close(); return t; };
const set = (dir, t, dropFlag) => { const d = db(dir); d.prepare('UPDATE workspaces SET tagline=?').run(t); if (dropFlag) d.prepare("DELETE FROM app_meta WHERE key='tagline_general'").run(); d.close(); };

test('a new workspace gets the general tagline; one on the old default is moved once; a written one is kept', { timeout: 60000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-tagline-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  await boot(dir);
  assert.equal(tagline(dir), 'Team operations workspace', 'a new workspace');
  /* a workspace from before, still on the old default: moved on the next start */
  set(dir, 'Creative operations workspace', true);
  await boot(dir);
  assert.equal(tagline(dir), 'Team operations workspace', 'the old default is replaced');
  /* once only: the old words chosen again later stay */
  set(dir, 'Creative operations workspace', false);
  await boot(dir);
  assert.equal(tagline(dir), 'Creative operations workspace', 'not again');
  /* a tagline someone wrote is never touched */
  set(dir, 'Our creative studio', true);
  await boot(dir);
  assert.equal(tagline(dir), 'Our creative studio');
});
