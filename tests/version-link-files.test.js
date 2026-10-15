/* A version attached as a link is filed under Final files (Oct 2026), as an uploaded version always was. The links
   attached before then are filed once, when the server starts (app_meta 'version_link_files'): one row for each link
   the task has no file for yet — a Drive link under Drive's stand-in name, which the Assets tab replaces with the
   file's own, any other named after its newest version. A new database files nothing, and a row removed afterwards
   is not brought back. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const root = path.join(__dirname, '..');

async function boot(dir) {
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: dir, COS_ADMIN_PASSWORD: 'VerLinks!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'verlinks-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'verlinks-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  let out = '';
  await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 10000); child.stdout.on('data', d => { out += d; if (/localhost:\d+/.test(out)) { clearTimeout(tm); res(); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  child.kill(); await new Promise(r => child.once('exit', r));
  return out;
}
const db = dir => new DatabaseSync(path.join(dir, 'creative-os.db'));
const FOLDER = 'https://drive.google.com/drive/folders/1FolderOfV6', FIGMA = 'https://www.figma.com/design/Abc123/Key-Visual', KEPT = 'https://example.org/already-filed';

test('version links attached before are filed under Final files once; a new database files nothing', { timeout: 60000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-verlinks-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  await boot(dir);
  let d = db(dir);
  const flag = JSON.parse(d.prepare("SELECT value FROM app_meta WHERE key='version_link_files'").get().value);
  assert.equal(flag.filed, 0, 'a new database: the demo is left as it was seeded');

  /* a task from before: V1–V5 kept in one Drive folder, V6 a Figma file, V7 a link already under Final files,
     V8 an uploaded picture (its file is its own) */
  const tk = d.prepare('SELECT id, workspace_id FROM tasks LIMIT 1').get(), who = d.prepare('SELECT id FROM users LIMIT 1').get().id;
  d.prepare('DELETE FROM files WHERE task_id=?').run(tk.id);
  d.prepare('DELETE FROM file_versions WHERE task_id=?').run(tk.id);
  const ver = d.prepare('INSERT INTO file_versions (id,task_id,version_number,note,drive_url,drive_id,preview_data,uploaded_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)');
  for (let n = 1; n <= 5; n++) ver.run('vl' + n, tk.id, n, 'round ' + n, FOLDER, '1FolderOfV6', null, who, '2026-10-0' + n + 'T09:00:00Z');
  ver.run('vl6', tk.id, 6, 'Key visual', FIGMA, null, null, who, '2026-10-06T09:00:00Z');
  ver.run('vl7', tk.id, 7, '', KEPT, null, null, who, '2026-10-07T09:00:00Z');
  ver.run('vl8', tk.id, 8, '', 'https://example.org/pic.png', null, 'data:image/png;base64,AAAA', who, '2026-10-08T09:00:00Z');
  d.prepare("INSERT INTO files (id,workspace_id,task_id,filename,file_type,size_label,storage_provider,external_url,uploaded_by) VALUES ('fk',?,?,'Delivered','document','Link','link',?,?)").run(tk.workspace_id, tk.id, KEPT, who);
  d.prepare("DELETE FROM app_meta WHERE key='version_link_files'").run();
  d.close();

  const log = await boot(dir);
  d = db(dir);
  const rows = d.prepare('SELECT filename, storage_provider, size_label, external_url, drive_id, uploaded_by FROM files WHERE task_id=? ORDER BY filename').all(tk.id).map(r => Object.assign({}, r));
  assert.deepEqual(rows.map(r => r.external_url).sort(), [FOLDER, KEPT, FIGMA].sort(), 'the folder once, the Figma file, the link that was there — not the uploaded picture');
  const folder = rows.find(r => r.external_url === FOLDER), figma = rows.find(r => r.external_url === FIGMA);
  assert.equal(folder.filename, 'Google Drive Folder', "Drive's stand-in, renamed when the task is opened");
  assert.equal(folder.storage_provider, 'gdrive');
  assert.equal(folder.drive_id, '1FolderOfV6');
  assert.equal(folder.size_label, 'Link');
  assert.equal(figma.filename, 'Version 6');
  assert.equal(figma.storage_provider, 'link');
  assert.equal(figma.uploaded_by, who, 'filed as the person who attached it');
  assert.equal(rows.find(r => r.external_url === KEPT).filename, 'Delivered', 'a file already there is left as it is');
  assert.match(log, /filed \d+ version link/);

  /* once only: a row removed afterwards stays removed */
  d.prepare('DELETE FROM files WHERE task_id=? AND external_url=?').run(tk.id, FIGMA);
  d.close();
  await boot(dir);
  d = db(dir);
  assert.equal(d.prepare('SELECT count(*) n FROM files WHERE task_id=? AND external_url=?').get(tk.id, FIGMA).n, 0, 'not filed again');
  d.close();
});
