/* The build split (Oct 2026, performance stage 3): the served page is a few KB of HTML, its scripts are one file
   (app.<hash>.js) in their order, its style sheets one file (app.<hash>.css), the Indonesian dictionary one file
   (i18n-id.<hash>.json) taken out of the code by build-i18n.js, and the server keeps the files of the builds it served
   for the tabs still open on them (server/delivery.js createAssetKeeper). The standalone file carries all of it. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm'), crypto = require('node:crypto');
const { builtPage, scriptOf, root } = require('./built-page');
const i18n = require('../build-i18n.js');
const build = require('../build.js');
const delivery = require('../server/delivery.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zc-split-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

/* ---------- the dictionary, out of the code ---------- */
const FILL = '(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })';
test('the dictionary is what the blocks add up to, by the page\'s own rules, in the page\'s order', () => {
  const blocks = [
    { file: 'src/core.js', code: 'var LANG="en";\nvar UI_ID={"Home":"Beranda","Save":"Simpan"};\nfunction tr(s){ return UI_ID[s]||s; }\nObject.assign(UI_ID,{"Save":"Simpan dulu","Tasks":"Tugas"});' },
    { file: 'src/a.js', code: FILL + '({"Save":"Simpan nanti","Close":"Tutup"});\nvar SK_INTRO="Read from the title";\n' + FILL + '({[SK_INTRO]:"Dibaca dari judul"});' },
    { file: 'src/b.js', code: '(function(){ var x=1; if(typeof tr!=="function") return; Object.assign(UI_ID,{"Close":"Tutup sekarang"}); })();\nvar SC_T=(function(t){ Object.keys(t).forEach(function(k){ var p=t[k]; if(!(p[0] in UI_ID)) UI_ID[p[0]]=p[1]; t[k]=p[0]; }); return t; })({ a:["Alpha","Alfa"], h:["Home","Rumah"] });\n(function(E,d){ if(!E) return; Object.keys(d).forEach(function(k){ var en=E.S[k]; if(en&&!(en in UI_ID)) UI_ID[en]=d[k]; }); })(typeof ENG!=="undefined"?ENG:null,{ k1:"Satu" });' }
  ];
  const r = i18n.extract(blocks, ['var ENG={S:{k1:"One"}};']);
  assert.deepEqual(r.dict, { Home: 'Beranda', Save: 'Simpan dulu', Tasks: 'Tugas', Close: 'Tutup sekarang', 'Read from the title': 'Dibaca dari judul', Alpha: 'Alfa', One: 'Satu' }, 'a later Object.assign wins, a block that only adds does not');
  assert.deepEqual(Object.keys(r.dict), ['Home', 'Save', 'Tasks', 'Close', 'Read from the title', 'Alpha', 'One'], 'in the order the page adds them');
  assert.equal(r.statements, 7);
  const code = r.blocks.map(b => b.code);
  assert.match(code[0], /^var LANG="en";\nvar UI_ID=ZC_I18N\.lazy\(\);\nfunction tr\(s\)\{ return UI_ID\[s\]\|\|s; \}\nvoid 0;$/);
  assert.equal(code[1], 'void 0;\nvar SK_INTRO="Read from the title";\nvoid 0;', 'the constant stays: the code uses it too');
  assert.match(code[2], /^\(function\(\)\{ var x=1; if\(typeof tr!=="function"\) return; void 0; \}\)\(\);\nvar SC_T=\{"a":"Alpha","h":"Home"\};\nvoid 0;$/, 'a value kept, as data');
  code.forEach(c => new vm.Script(c));
  const clash = i18n.conflicts(r).map(c => [c.key, c.kept, c.given.map(g => g.file + ' ' + g.value)]);
  assert.deepEqual(clash, [
    ['Home', 'Beranda', ['src/core.js Beranda', 'src/b.js Rumah']],
    ['Save', 'Simpan dulu', ['src/core.js Simpan', 'src/core.js Simpan dulu', 'src/a.js Simpan nanti']],
    ['Close', 'Tutup sekarang', ['src/a.js Tutup', 'src/b.js Tutup sekarang']]
  ]);
});

test('a block the build cannot place, or a write it would miss, stops the build', () => {
  const run = code => () => i18n.extract([{ file: 'src/x.js', code: 'var UI_ID={};' }, { file: 'src/y.js', code }]);
  assert.throws(run('function later(){ Object.assign(UI_ID,{"A":"B"}); }'), /cannot place/, 'inside a function called later');
  assert.throws(run('(function(){ if(window.x){ Object.assign(UI_ID,{"A":"B"}); } })();'), /cannot place/, 'inside a condition of its own');
  assert.throws(run('function add(k,v){ UI_ID[k]=v; }'), /still writes to UI_ID/);
  assert.throws(run('setTimeout(function(){ UI_ID.x="y"; });'), /still writes to UI_ID/);
  assert.doesNotThrow(run('function zcI18nTake(d){ Object.keys(d).forEach(function(k){ UI_ID[k]=d[k]; }); }\nfunction tr(s){ return UI_ID[s]||s; }\nif(typeof UI_ID!=="undefined") Object.assign(UI_ID,{"A":"B"});'), 'the loader may add the dictionary; reading it is fine');
  assert.throws(() => i18n.extract([{ file: 'src/x.js', code: 'Object.assign(UI_ID,{"A":"B"});' }]), /UI_ID|undefined/, 'no var UI_ID={...}');
});

/* ---------- the served page ---------- */
test('the served page: a few KB of HTML, its style sheet in the head, its one script where the scripts began', () => {
  const b = builtPage();
  assert.ok(b.raw.html.length < 32 * 1024, 'the HTML is ' + b.raw.html.length + ' bytes');
  const scripts = [...b.html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 2, 'the head\'s early script and the page\'s script');
  assert.match(scripts[0][2], /ZC_EARLY=\{i18nSrc:"\/assets\/i18n-id\.[0-9a-f]{10}\.json"\}/, 'the early script knows where the dictionary is');
  assert.equal(scripts[1][1], ' src="/assets/' + b.names.js + '"');
  assert.ok(/<script src="\/assets\/app\.[0-9a-f]{10}\.js"><\/script>\n<\/body>\n<\/html>\n?$/.test(b.html), 'a plain script at the end of the body: it runs before DOMContentLoaded, as the scripts did');
  assert.ok(b.html.indexOf('<link rel="stylesheet" href="/assets/' + b.names.css + '">') < b.html.indexOf('</head>'), 'the style sheet in the head');
  assert.equal((b.html.match(/<style>/g) || []).length, 1, 'only the fonts\' faces stay in the page');
  for (const k of ['js', 'css', 'i18n']) assert.equal(b.names[k].split('.')[1], crypto.createHash('sha1').update(b.raw[k]).digest('hex').slice(0, 10), k + ' is named after its content');
  assert.ok(!b.raw.js.includes(0), 'no NUL character written as itself (Git would take the file for binary)');
});

test('the page\'s script: every script of the page, in the page\'s order, and each still its own', () => {
  const b = builtPage(), src = build.pageSources();
  const order = [...b.code.matchAll(/(?:^|\n);\/\* ([^*]+) \*\/\n/g)].map(m => m[1]);
  assert.deepEqual(order, src.scripts.map(s => s.file), 'the same scripts in the same order');
  assert.deepEqual(order.slice(0, 5), ['demo settings', 'shared/gallery-model.js', 'shared/scoring-engine.js', 'shared/scoring-settings.js', 'shared/ai-chat-models.js']);
  assert.equal(order[order.length - 1], 'src/boot.js');
  const parts = build.parts.filter(p => p.endsWith('.js')).map(p => 'src/' + p);
  assert.deepEqual([...new Set(order.slice(5))], parts, 'src/*.js as build.js lists them');
  new vm.Script(b.code);
  /* shared/* exactly as written; a src/ script as build-strip.js left it, but for its dictionary */
  assert.equal(scriptOf(b.code, 'shared/scoring-settings.js'), fs.readFileSync(path.join(root, 'shared', 'scoring-settings.js'), 'utf8').replace(/\r\n/g, '\n'));
  assert.match(scriptOf(b.code, 'src/boot.js'), /^\s*void 0;\nboot\(\);\n$/);
  /* the style sheets: src/head.html's first, then the four that follow it, then each file's own, in the page's order */
  const sheets = [...b.css.matchAll(/(?:^|\n)\/\* (src\/[^*]+) \*\/\n/g)].map(m => m[1]);
  assert.deepEqual(sheets, src.styles.map(s => s.file));
  assert.deepEqual(sheets.slice(0, 5), ['src/head.html', 'src/refinements.css', 'src/v18.css', 'src/responsive.css', 'src/v38.css']);
});

test('the Indonesian dictionary is a file of its own: none of it in the code, all of it in the file', () => {
  const b = builtPage();
  assert.match(b.code, /\nvar UI_ID=ZC_I18N\.lazy\(\);\n/);
  assert.ok(!/Object\.assign\(UI_ID/.test(b.code), 'no block adds to it');
  for (const id of ['Mode merek', 'Pintasan keyboard', 'Belum ada emoji kustom', 'Dibaca dari kata utuh di judul', 'Tampilkan semua proyek']) {
    assert.ok(!b.code.includes(id) && !b.html.includes(id), id + ' is not in the page');
    assert.ok(Object.values(b.dict).some(v => v.includes(id)), id + ' is in the dictionary');
  }
  /* core.js starts with "Mode Brand"; a later Object.assign gives it "Mode merek", which the page has always shown */
  assert.equal(b.dict['Brand Mode'], 'Mode merek'); assert.equal(b.dict['Keyboard shortcuts'], 'Pintasan keyboard');
  /* what the sources give, today: the file is current */
  const again = build.served();
  assert.deepEqual(b.dict, again.dict.dict, 'run node build.js');
  assert.ok(Object.keys(b.dict).length > 4000);
  /* src/ keeps its blocks: a file loaded as written has its words */
  assert.match(fs.readFileSync(path.join(root, 'src', 'core.js'), 'utf8'), /var UI_ID=\{"Brand Mode":"Mode Brand"/);
});

test('the standalone file carries the page\'s files inside, the dictionary as one object', () => {
  const b = builtPage(), html = fs.readFileSync(path.join(root, 'dist', 'creative-os-standalone.html'), 'utf8');
  assert.ok(!/\/assets\/(app|i18n-id)\./.test(html), 'it fetches nothing of the page');
  const m = html.match(/<script>var ZC_I18N_INLINE=(\{[\s\S]*?\});<\/script>/);
  assert.ok(m, 'the dictionary inside');
  assert.deepEqual(JSON.parse(m[1].replace(/<\\\//g, '</')), b.dict);
  assert.ok(html.includes('ZC_EARLY={i18nSrc:""}'), 'and the early script asks for none');
  assert.ok(html.includes('<style>' + b.css + '</style>'), 'its style sheet');
  assert.equal(scriptOf(html, 'src/i18n.js'), scriptOf(b.code, 'src/i18n.js'), 'its code');
});

test('the Docker build has every file the build reads', () => {
  const docker = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  for (const f of ['build.js', 'build-strip.js', 'build-i18n.js']) assert.match(docker, new RegExp('COPY [^\\n]*\\b' + f.replace('.', '\\.') + '\\b'), f);
  for (const f of fs.readdirSync(root).filter(n => /^build.*\.js$/.test(n))) assert.ok(docker.includes(f), f + ' is copied into the image');
});

/* ---------- the files of earlier builds ---------- */
function page(id, names) { return Buffer.from('<meta name="zc-build" content="' + id + '">' + names.map(n => '<script src="/assets/' + n + '"></script>').join('')); }
test('the server keeps the files of the builds it served, for the tabs still open on them, and lets go of older ones', async () => {
  const pub = path.join(tmp, 'public-assets'), keepDir = path.join(tmp, 'asset-history'), cacheDir = path.join(tmp, 'page-cache');
  fs.mkdirSync(pub, { recursive: true });
  const put = (n, s) => fs.writeFileSync(path.join(pub, n), s);
  const statics = delivery.createStatic({ mime: { '.js': 'text/javascript' }, compressible: new Set(['.js']), cacheDir, bestFrom: 1024 });
  const keeper = delivery.createAssetKeeper({ publicAssets: pub, keepDir, keep: 2, statics });
  const names = k => ['app.' + k.repeat(10) + '.js', 'i18n-id.' + k.repeat(10) + '.json'];
  /* build a: its script names a picture, which is kept too */
  put(names('a')[0], 'var a="/assets/flag-en.0123456789.webp";' + 'x'.repeat(4000)); put(names('a')[1], '{}'); put('flag-en.0123456789.webp', 'img');
  await keeper.note(page('a1', names('a')));
  assert.deepEqual(fs.readdirSync(keepDir).sort(), ['app.aaaaaaaaaa.js', 'builds.json', 'flag-en.0123456789.webp', 'i18n-id.aaaaaaaaaa.json']);
  /* its compressed copies, as the server makes them */
  await statics.entry(path.join(pub, names('a')[0])).best;
  assert.equal(fs.readdirSync(cacheDir).filter(n => n.startsWith('app.aaaaaaaaaa.js.')).length, 2);
  /* build b replaces it in public/assets: a tab on build a still gets its files */
  names('a').forEach(n => fs.rmSync(path.join(pub, n)));
  put(names('b')[0], 'var b=1;'); put(names('b')[1], '{}');
  await keeper.note(page('b1', names('b')));
  assert.equal(fs.readFileSync(keeper.find('app.aaaaaaaaaa.js'), 'utf8').slice(0, 6), 'var a=');
  assert.ok(keeper.find('i18n-id.bbbbbbbbbb.json'));
  /* build c: two builds are kept, so a's files go, and their compressed copies */
  put(names('c')[0], 'var c=1;'); put(names('c')[1], '{}');
  await keeper.note(page('c1', names('c')));
  assert.equal(keeper.find('app.aaaaaaaaaa.js'), null);
  assert.ok(keeper.find('app.bbbbbbbbbb.js') && keeper.find('app.cccccccccc.js'));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(keepDir, 'builds.json'), 'utf8')).map(x => x.id), ['c1', 'b1']);
  assert.deepEqual(fs.readdirSync(cacheDir).filter(n => n.startsWith('app.aaaaaaaaaa.js.')), [], 'the compressed copies of a file no build names go too');
  /* only content-named files, by their own name */
  for (const bad of ['../builds.json', 'builds.json', 'app.js', 'app.bbbbbbbbbb.js/x', '']) assert.equal(keeper.find(bad), null, bad);
  /* the same page noted again changes nothing */
  await keeper.note(page('c1', names('c')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(keepDir, 'builds.json'), 'utf8')).length, 2);
});

test('through the server: a file of an earlier build is still served, kept a year; an unknown one is a 404', { timeout: 60000 }, async t => {
  const { spawn } = require('node:child_process');
  const data = fs.mkdtempSync(path.join(tmp, 'srv-')), kept = path.join(data, 'asset-history');
  fs.mkdirSync(kept, { recursive: true });
  fs.writeFileSync(path.join(kept, 'app.0123456789.js'), 'window.OLD_BUILD=1;');
  fs.writeFileSync(path.join(kept, 'builds.json'), JSON.stringify([{ id: 'old', at: new Date().toISOString(), files: ['app.0123456789.js'] }]));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: data, COS_ADMIN_PASSWORD: 'Split!Admin23456', COS_ADMIN_EMAIL: 'admin@split.test', COS_SECRET_KEY: 'split-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'split-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '0', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 15000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => { out += d; }); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port, b = builtPage();
  const old = await fetch(base + '/assets/app.0123456789.js');
  assert.equal(old.status, 200); assert.equal(await old.text(), 'window.OLD_BUILD=1;');
  assert.equal(old.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.match(old.headers.get('content-type'), /javascript/);
  assert.equal((await fetch(base + '/assets/app.fedcba9876.js')).status, 404);
  assert.equal((await fetch(base + '/assets/builds.json')).status, 404, 'the keeper\'s own list is not a file of the page');
  /* the files of the build it serves are kept too, from the start */
  for (let i = 0; i < 100 && !fs.existsSync(path.join(kept, b.names.js)); i++) await new Promise(r => setTimeout(r, 100));
  assert.ok(fs.existsSync(path.join(kept, b.names.js)) && fs.existsSync(path.join(kept, b.names.i18n)) && fs.existsSync(path.join(kept, b.names.css)));
  const now = await fetch(base + '/assets/' + b.names.i18n);
  assert.equal(now.status, 200); assert.equal(now.headers.get('cache-control'), 'public, max-age=31536000, immutable'); assert.deepEqual(await now.json(), b.dict);
});
