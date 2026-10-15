/* Brand fonts (Oct 2026): an admin uploads TTF, OTF, WOFF or WOFF2 files in Settings → AI; each becomes one font in
   AI Hub's font lists and a template can name it for its headline and subheadline. What a file is comes from its
   first bytes; it is served only to someone signed in, with its font type; picture fields still take pictures only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/<\/?script>/g, '');
const fontBytes = sig => { const b = Buffer.alloc(64, 7); if (sig === 'ttf') b.writeUInt32BE(0x00010000, 0); else b.write(sig, 0, 'latin1'); return b; };
const dataUrl = (buf, mime) => 'data:' + (mime || 'application/octet-stream') + ';base64,' + buf.toString('base64');

test('a font is what its first bytes say, never what the browser called it', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-fonts-')); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  process.env.COS_DATA_DIR = temp; delete require.cache[require.resolve('../server/uploads.js')];
  const uploads = require('../server/uploads.js'), { DatabaseSync } = require('node:sqlite'), db = new DatabaseSync(':memory:'); uploads.ensureTable(db);
  assert.deepEqual(['wOF2', 'wOFF', 'OTTO', 'ttf', 'true'].map(s => uploads.fontKind(fontBytes(s))), ['woff2', 'woff', 'otf', 'ttf', 'ttf']);
  assert.equal(uploads.fontKind(Buffer.from('<html><script>alert(1)</script></html>')), null);
  const url = uploads.putFont(db, dataUrl(fontBytes('wOF2'), 'font/ttf'), 'u1');
  assert.match(url, /^\/files\/[a-f0-9]{64}\.woff2$/, 'stored by what it is, not by the type given');
  assert.equal(db.prepare('SELECT mime FROM uploads').get().mime, 'font/woff2');
  assert.equal(uploads.externalizeFont(db, url, 'u1'), url, 'a stored font is kept');
  assert.throws(() => uploads.putFont(db, dataUrl(Buffer.from('<html>' + 'x'.repeat(40) + '</html>'), 'font/woff2')), e => e.status === 400);
  assert.throws(() => uploads.putFont(db, dataUrl(Buffer.concat([fontBytes('wOF2'), Buffer.alloc(5_000_001)]))), e => e.status === 413);
  assert.throws(() => uploads.externalizeFont(db, 'https://example.com/a.woff2', 'u1'), e => e.status === 400);
  assert.throws(() => uploads.externalizeFont(db, '/files/' + 'a'.repeat(64) + '.woff2', 'u1'), e => e.status === 400, 'not one of ours');
  /* a picture field never takes a font, even one of ours */
  assert.throws(() => uploads.externalize(db, url, 'u1', 'Version preview'), e => e.status === 400);
  db.close();
});

/* the browser side */
function hub() {
  const noop = () => {};
  const c = { UI_ID: {}, WS: { brand: {}, theme: {}, ai: {} }, API: { on: true }, console, setTimeout, window: { addEventListener: noop }, localStorage: { getItem: () => null, setItem: noop },
    document: { addEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, getContext: () => null, addEventListener: noop }), head: { appendChild: noop }, body: { appendChild: noop } },
    clone: x => JSON.parse(JSON.stringify(x)), byId: (l, id) => (l || []).find(x => x.id === id), tr: x => x, toast: noop, renderScreen: noop, aiHistoryBefore: noop, aiSelectedModelCan: () => true };
  vm.createContext(c);
  ['src/ai.js', 'src/brand-characters.js', 'src/brand-fonts.js'].forEach(f => vm.runInContext(read(f), c, { filename: f }));
  return c;
}

test('uploaded fonts join the font lists; a template sets its headline and subheadline fonts; names come out clean', () => {
  const c = hub();
  c.WS.ai.fonts = [{ id: 'fn_a1', name: 'Gilroy Black Italic', url: '/files/' + 'c'.repeat(64) + '.otf' }, { id: 'fn_b2', name: 'Broken', url: 'https://example.com/x.woff2' }];
  const list = Array.from(c.aiWorkspaceFonts());
  assert.ok(list.includes('Gilroy Black Italic')); assert.ok(!list.includes('Broken'), 'a font from anywhere else is never used');
  assert.equal(c.aiFontNameFrom('Gilroy-BlackItalic.otf'), 'Gilroy Black Italic 2', 'from the file name, and never a name already taken');
  assert.equal(c.aiFontNameFrom('Brand_Sans-Bold.woff2'), 'Brand Sans Bold');
  assert.equal(c.aiFontCleanName('Bad"Name</style>'), 'Bad Name style');
  assert.equal(c.aiFontKind(new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0]).buffer), 'woff2');
  assert.equal(c.aiFontKind(new TextEncoder().encode('<svg>').buffer), null);
  /* a template names its fonts; one that names none goes back to the workspace's */
  c.WS.ai.promptTemplates = [{ id: 'f1', name: 'With fonts', brief: 'x', headlineFont: 'Gilroy Black Italic', subFont: 'Inter' }, { id: 'f2', name: 'Without', brief: 'y' }];
  c.aiApplyTemplate('f1'); assert.deepEqual([c.AIF.headlineFont, c.AIF.subFont], ['Gilroy Black Italic', 'Inter']);
  c.aiApplyTemplate('f2'); assert.deepEqual([c.AIF.headlineFont, c.AIF.subFont], ['', '']);
  /* a rename is carried into the templates and the open design */
  let saved = 0; c.persistWS = () => { saved++; return Promise.resolve(); };
  c.aiApplyTemplate('f1'); c.aiFontRename('fn_a1', 'Gilroy Heavy');
  assert.equal(c.WS.ai.promptTemplates[0].headlineFont, 'Gilroy Heavy'); assert.equal(c.AIF.headlineFont, 'Gilroy Heavy'); assert.equal(saved, 1);
});

test('the template editor saves its fonts', () => {
  const els = { pt_head_font: 'Gilroy Black Italic', pt_sub_font: 'Inter', pt_sub_color: '#FFFFFF', pt_cta_shape: '28', pt_people: '0' };
  const c = { WS: { ai: {} }, require: () => true, clone: x => JSON.parse(JSON.stringify(x)), closeModal() {}, saveWS() {}, renderScreen() {},
    aiPromptTemplates: () => [{ id: 'p1', name: 'One', brief: 'b' }], val: id => els[id] || '', document: { getElementById: id => (id === 'pt_disc' ? { value: '' } : id === 'pt_sub_color' ? {} : null) } };
  vm.createContext(c);
  const s = read('src/settings.js'); vm.runInContext(s.slice(s.indexOf('function savePromptTpl('), s.indexOf('function delPromptTpl(')), c);
  c.savePromptTpl('p1');
  assert.deepEqual([c.WS.ai.promptTemplates[0].headlineFont, c.WS.ai.promptTemplates[0].subFont], ['Gilroy Black Italic', 'Inter']);
});

/* the real server */
function place(t) {
  const at = { temp: fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-fonts-')), stops: [] };
  t.after(async () => { for (const stop of at.stops) await stop(); fs.rmSync(at.temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  return at;
}
async function start(at) {
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: at.temp, COS_ADMIN_PASSWORD: 'Fonts!Admin23456', COS_ADMIN_EMAIL: 'ops@hsb.co.id', COS_SECRET_KEY: 'fonts-secret-key-long-enough-for-the-check!!', COS_BACKUP_KEY: 'fonts-backup-key-long-enough-for-the-check!!', COS_BACKUP_INTERVAL_HOURS: '0', APP_URL: 'https://zen.hsb-test.dev' }) });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 10000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', code => { clearTimeout(tm); rej(new Error('exit ' + code + ' ' + out)); }); });
  at.stops.push(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, ck) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, ck ? { cookie: ck } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const r = await req('POST', '/api/auth/login', { email: 'ops@hsb.co.id', password: 'Fonts!Admin23456' });
  return { base, req, admin: r.headers.get('set-cookie').split(';')[0] };
}

test('fonts are saved as stored files, served with their type to signed-in people, named cleanly and capped', { timeout: 60000 }, async t => {
  const s = await start(place(t));
  const ws = async () => (await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).ws;
  const put = async fonts => { const w = await ws(); w.ai = Object.assign({}, w.ai, { fonts }); return s.req('PUT', '/api/workspace', w, s.admin); };
  let r = await put([{ id: 'fn_gilroy1', name: 'Gilroy Black Italic', url: dataUrl(fontBytes('OTTO')) }, { id: 'fn_gilroy2', name: 'gilroy black italic', url: dataUrl(fontBytes('wOF2')) }, { id: 'x"><b', name: 'Bad"Name</style>', url: dataUrl(fontBytes('ttf')) }]);
  assert.equal(r.status, 200, await r.clone().text());
  const fonts = (await ws()).ai.fonts;
  assert.deepEqual(fonts.map(f => f.name), ['Gilroy Black Italic', 'gilroy black italic 2', 'Bad Name style']);
  assert.match(fonts[0].url, /\.otf$/); assert.match(fonts[1].url, /\.woff2$/); assert.match(fonts[2].url, /\.ttf$/); assert.match(fonts[2].id, /^fn_[a-z0-9]+$/);
  let f = await fetch(s.base + fonts[1].url, { headers: { cookie: s.admin } });
  assert.equal(f.status, 200); assert.equal(f.headers.get('content-type'), 'font/woff2'); assert.equal(f.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await fetch(s.base + fonts[1].url)).status, 401, 'fonts need a session');
  /* sent back as they came: kept */
  assert.equal((await put(fonts)).status, 200);
  /* something that is not a font, a font from elsewhere, a picture of ours: refused */
  assert.equal((await put([{ id: 'fn_x0001', name: 'X', url: dataUrl(Buffer.from('<html>' + 'x'.repeat(60))) }])).status, 400);
  assert.equal((await put([{ id: 'fn_x0001', name: 'X', url: 'https://example.com/x.woff2' }])).status, 400);
  /* twenty at most */
  r = await put(Array.from({ length: 23 }, (_, i) => ({ id: 'fn_n' + String(i).padStart(4, '0'), name: 'N' + i, url: fonts[0].url })));
  assert.equal(r.status, 200); assert.equal((await ws()).ai.fonts.length, 20);
});
