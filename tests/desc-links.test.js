/* A link written as its own address (a Figma link, whose name is not read) was linked twice when the description
   was drawn; the browser split it into an empty link and a full one, the empty one was saved as "[](address)", and
   every save wrapped it again until the description filled up with "[]([](https://…". The repair turns such text back
   into its addresses, on the page (src/desc-links.js) and once on the server for what is stored; a link inside a
   link is never drawn. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const root = path.join(__dirname, '..');
const U = 'https://www.figma.com/design/mXJlv7xJ7Wy6bv1vNhL8y8f/Ads-banner?node-id=8571-222&p=f&t=MSMYUAAiVJ7DIZ1V-0';
const BROKEN = 'Please create voice over video for UAC part Aug - Sept.\n[]([]([]([](' + U + ')[](' + U + ')' + U + ')[]([](' + U + ')' + U + ')' + U + ')[](' + U + ')' + U + ')';

function page() { const c = {}; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(root, 'src/desc-links.js'), 'utf8').replace(/<\/?script>/g, ''), c); return c; }

test('a description filled with "[](" goes back to the address it was; other links and pictures stay', () => {
  const { descLinkRepair: fix } = page();
  assert.equal(fix(BROKEN), 'Please create voice over video for UAC part Aug - Sept.\n' + U, 'the task in the report');
  assert.equal(fix('[' + U + '](' + U + ')'), U, 'a link whose words are its address: the address');
  assert.equal(fix('a [](https://a.com/x) and [](https://b.com/y) b'), 'a https://a.com/x and https://b.com/y b', 'an empty link: its address');
  assert.equal(fix('[](https://a.com/x)[](https://b.com/y)'), 'https://a.com/x https://b.com/y', 'two addresses, a space apart');
  for (const keep of ['[Brief deck](https://a.com/x)', '![](https://a.com/pic.png)', '![](zc-att:abc =50%)', 'see (https://a.com/x) now', '[https://a.com](https://b.com)', 'plain text, no links'])
    assert.equal(fix(keep), keep, keep);
  assert.equal(fix(fix(BROKEN)), fix(BROKEN), 'once repaired, it stays');
});

test('a link inside a link is never drawn: the inner one\'s words stay in the outer one', () => {
  const { descUnnestLinks: unnest } = page();
  assert.equal(unnest('<a href="u" x>' + '<a href="u">u</a>' + '</a> after <a href="v">v</a>'), '<a href="u" x>u</a> after <a href="v">v</a>');
  assert.equal(unnest('<a href="a">a</a> <b>b</b>'), '<a href="a">a</a> <b>b</b>', 'nothing nested: as it was');
  /* wrapped, the page's own functions repair and unnest */
  const c = { descMdInline: s => '<a href="' + U + '">' + '<a href="' + U + '">' + U + '</a></a>', descMdHtml: s => s, descHtmlToMd: () => '[](' + U + ')' };
  vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(root, 'src/desc-links.js'), 'utf8').replace(/<\/?script>/g, ''), c);
  assert.equal(c.descMdInline('x'), '<a href="' + U + '">' + U + '</a>');
  assert.equal(c.descMdHtml(BROKEN), 'Please create voice over video for UAC part Aug - Sept.\n' + U);
  assert.equal(c.descHtmlToMd('<a href="' + U + '"></a>'), U, 'an empty link is saved as its address');
});

test('the server cleans stored descriptions and progress notes once', { timeout: 60000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-desc-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const boot = async () => {
    const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: dir, COS_ADMIN_PASSWORD: 'Desc!Admin2345678', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'desc-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'desc-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
    let out = '';
    await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 10000); child.stdout.on('data', d => { out += d; if (/localhost:\d+/.test(out)) { clearTimeout(tm); res(); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
    child.kill(); await new Promise(r => child.once('exit', r));
  };
  await boot();
  let d = new DatabaseSync(path.join(dir, 'creative-os.db'));
  const [a, b] = d.prepare('SELECT id FROM tasks LIMIT 2').all().map(r => r.id);
  d.prepare('UPDATE tasks SET description=? WHERE id=?').run(BROKEN, a);
  d.prepare('UPDATE tasks SET description=? WHERE id=?').run('Brief: [Deck](https://a.com/x) and ![](https://a.com/p.png)', b);
  d.prepare("INSERT INTO task_progress_notes (id, task_id, version_number, body, created_at) VALUES ('pn_x', ?, 99, ?, '2026-10-15T00:00:00Z')").run(a, 'Ref [](' + U + ')');
  d.prepare("DELETE FROM app_meta WHERE key='desc_link_repair'").run();
  d.close();
  await boot();
  d = new DatabaseSync(path.join(dir, 'creative-os.db'));
  assert.equal(d.prepare('SELECT description FROM tasks WHERE id=?').get(a).description, 'Please create voice over video for UAC part Aug - Sept.\n' + U);
  assert.equal(d.prepare('SELECT description FROM tasks WHERE id=?').get(b).description, 'Brief: [Deck](https://a.com/x) and ![](https://a.com/p.png)', 'a proper link and a picture stay');
  assert.equal(d.prepare("SELECT body FROM task_progress_notes WHERE id='pn_x'").get().body, 'Ref ' + U);
  assert.ok(d.prepare("SELECT 1 FROM app_meta WHERE key='desc_link_repair'").get(), 'once');
  d.close();
});
