/* One English text, one Indonesian wording (Oct 2026). The 135 UI_ID blocks in src/ used to give 224 English texts
   two or more Indonesian wordings ("Projects": "Proyek" in one block, "Project" in another), and the page showed
   whichever its order kept. They are settled to the terms of docs/GLOSSARY-ID.md, and the build now stops on a new
   one (build.js checkI18n, build-i18n.js conflicts). This file holds the guard and the glossary's main terms. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process');
const i18n = require('../build-i18n.js');
const build = require('../build.js');
const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zc-i18n-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

const FILL = '(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })';

test('the sources give every English text one Indonesian wording', () => {
  const clash = i18n.conflicts(build.served().dict);
  assert.deepEqual(clash.map(c => c.key), [], clash.length ? i18n.conflictMessage(clash) : '');
  assert.doesNotThrow(() => build.checkI18n(build.served().dict));
});

test('a text two blocks word differently is a conflict, and so is a key one block gives twice; the same words twice are not', () => {
  const r = i18n.extract([
    { file: 'src/core.js', code: 'var UI_ID={"Projects":"Project","Save":"Simpan"};' },
    { file: 'src/a.js', code: 'Object.assign(UI_ID,{"Projects":"Proyek","Save":"Simpan","Close":"Tutup","Close":"Tutup"});' },
    { file: 'src/b.js', code: FILL + '({"Open":"Buka","Edit":"Edit","Open":"Buka sekarang"});' }
  ]);
  const clash = i18n.conflicts(r);
  assert.deepEqual(clash.map(c => [c.key, c.given.map(g => g.file + ': ' + g.value)]), [
    ['Projects', ['src/core.js: Project', 'src/a.js: Proyek']],
    ['Open', ['src/b.js (twice in one block): Buka', 'src/b.js (twice in one block): Buka sekarang']]
  ], 'Save and Close have the same words wherever they are');
  const msg = i18n.conflictMessage(clash);
  assert.match(msg, /2 English texts have different Indonesian words/);
  assert.match(msg, /"Projects"\n {6}src\/core\.js: "Project"\n {6}src\/a\.js: "Proyek"/, 'the text, each block and its words');
  assert.match(msg, /docs\/GLOSSARY-ID\.md/, 'where the standard terms are');
  assert.match(msg, /same Indonesian words in every block/, 'how to settle it');
  assert.throws(() => build.checkI18n(r), e => e.i18nConflicts.length === 2 && /Projects/.test(e.message));
});

/* the real build, in a copy of the sources with one wording changed back */
function copySources(to) {
  for (const f of ['build.js', 'build-strip.js', 'build-i18n.js']) fs.copyFileSync(path.join(root, f), path.join(to, f));
  fs.cpSync(path.join(root, 'src'), path.join(to, 'src'), { recursive: true });
  fs.cpSync(path.join(root, 'shared'), path.join(to, 'shared'), { recursive: true });
}
test('node build.js stops on a new conflict, says how to fix it, and writes nothing', async () => {
  copySources(tmp);
  const file = path.join(tmp, 'src', 'messages.js'), was = '"Search projects…":"Cari project…"';
  const src = fs.readFileSync(file, 'utf8');
  assert.equal(src.split(was).length, 2, 'the wording this test changes is in src/messages.js once');
  fs.writeFileSync(file, src.replace(was, '"Search projects…":"Cari proyek…"'));
  /* both at once: each is a whole build */
  const run = args => new Promise(done => {
    const p = cp.spawn(process.execPath, ['build.js'].concat(args || []), { cwd: tmp });
    let stdout = '', stderr = '';
    p.stdout.setEncoding('utf8').on('data', d => { stdout += d; });
    p.stderr.setEncoding('utf8').on('data', d => { stderr += d; });
    p.on('close', status => done({ status, stdout, stderr }));
  });
  const [r, list] = await Promise.all([run(), run(['--i18n-conflicts'])]);
  assert.equal(r.status, 1, 'the build fails');
  assert.match(r.stderr, /1 English text has different Indonesian words in the UI_ID blocks/);
  assert.match(r.stderr, /"Search projects…"\n {6}src\/messages\.js: "Cari proyek…"\n {6}src\/i18n\.js: "Cari project…"/, 'which text, where, and each wording');
  assert.match(r.stderr, /Fix: give the English text the same Indonesian words in every block that has it \(docs\/GLOSSARY-ID\.md/);
  assert.ok(!/at write|at Object/.test(r.stderr), 'a message, not a stack trace');
  assert.ok(!fs.existsSync(path.join(tmp, 'public', 'index.html')) && !fs.existsSync(path.join(tmp, 'dist')), 'nothing is written');
  assert.equal(list.status, 1);
  assert.match(list.stdout, /^"Search projects…" → "Cari project…"\n {4}src\/messages\.js: "Cari proyek…"\n {4}src\/i18n\.js: "Cari project…"/, '--i18n-conflicts lists them');
});

/* the glossary's main decisions (docs/GLOSSARY-ID.md), over every Indonesian wording the page has */
test('the Indonesian follows the glossary: task, project, workspace, brand, template, file, password, review, tenggat, kamu', () => {
  const dict = build.served().dict.dict;
  const banned = [
    [/\b[Pp]royek/, 'project, never proyek'],
    [/\b[Tt]ugas(nya|mu)?\b/, 'task, never tugas (tugaskan / ditugaskan stay)'],
    [/\b[Rr]uang kerja\b/, 'workspace, never ruang kerja'],
    [/\b[Mm]erek\b/, 'brand, never merek'],
    [/\b[Tt]emplat\b/, 'template, never templat'],
    [/\b[Bb]erkas/, 'file, never berkas'],
    [/\b[Kk]ata sandi\b/, 'password, never kata sandi'],
    [/\b([Pp]eninjau|[Dd]itinjau|[Tt]injau)/, 'review / reviewer, never tinjau'],
    [/\b[Jj]atuh tempo\b/, 'tenggat, never jatuh tempo'],
    [/\bAnda\b/, 'kamu, never Anda'],
    [/\b[Ss]etelan\b/, 'pengaturan, never setelan'],
    [/\b[Tt]arget tahapan\b/, 'milestone, never target tahapan']
  ];
  const bad = [];
  for (const [en, id] of Object.entries(dict)) for (const [re, why] of banned) if (re.test(id)) bad.push(why + ': ' + JSON.stringify(en) + ' → ' + JSON.stringify(id));
  assert.deepEqual(bad, []);
  assert.equal(dict['My Tasks'], 'Task saya');
  assert.equal(dict.Projects, 'Project');
  assert.equal(dict['Search projects…'], 'Cari project…');
  assert.equal(dict['Select project later'], 'Pilih project nanti');
  assert.equal(dict['Not in any project for now'], 'Belum masuk project mana pun');
  assert.equal(dict['Brand Mode'], 'Mode Brand');
});
