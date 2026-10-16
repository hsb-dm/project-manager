/* The AI Hub look for a forex broker, tack-sharp (16 Oct 2026). Nothing in the brand prompt or a built-in template's
   description and style asks for coins or anything that reads as crypto, or for grain, mist, haze, halftone or blur —
   and it is said as what to show, never as "no Bitcoin" or "no grain": Magnific Mystic has no negative prompt, and a
   thing named is a thing drawn. A workspace still on the brand prompt it was given before gets the new one, once. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const root = path.join(__dirname, '..');
const brand = require('../server/ai-brand');
const WORDS = /\b(coins?|bitcoin|btc|crypto\w*|blockchain|tokens?|nft|fintech|grain\w*|mist\w*|haze|hazy|fog\w*|smoke|halftone|bokeh|blur\w*|vignette|noise)\b/i;

function templates() {
  const noop = () => {};
  const c = { UI_ID: {}, WS: { brand: {}, theme: {}, ai: {} }, API: { on: true }, ME: 'u1', console, setTimeout, window: { addEventListener: noop }, localStorage: { getItem: () => null, setItem: noop },
    document: { addEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, getContext: () => null, addEventListener: noop }), head: { appendChild: noop }, body: { appendChild: noop } },
    clone: x => JSON.parse(JSON.stringify(x)), byId: (l, id) => (l || []).find(x => x.id === id), tr: x => x, toast: noop, renderScreen: noop, canI: { manageWorkspace: () => false }, has: () => false };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(root, 'src', 'ai.js'), 'utf8').replace(/<\/?script>/g, ''), c, { filename: 'ai.js' });
  return Array.from(c.AI_PROMPT_DEFAULT);
}

test('the brand prompt and every template show money as banknotes or gold, sharp and clean — and never name what to leave out', () => {
  const p = brand.RECOMMENDED_BRAND_PROMPT;
  assert.match(p, /forex/); assert.match(p, /banknotes/); assert.match(p, /tack-sharp/);
  assert.equal(WORDS.exec(p), null, 'brand prompt: ' + (WORDS.exec(p) || [])[0]);
  const list = templates();
  assert.equal(list.length, 8);
  list.forEach(t => { for (const k of ['brief', 'style', 'characterPrompt']) { const m = WORDS.exec(t[k] || ''); assert.equal(m, null, t.id + ' ' + k + ': ' + (m || [])[0]); } });
  assert.ok(list.filter(t => /tack-sharp/.test(t.style)).length >= 6, 'sharp, said in the style');
});

test('a workspace still on the brand prompt it was given gets the new one, once; one an admin wrote stays', { timeout: 60000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-forex-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const boot = async () => {
    const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: dir, COS_ADMIN_PASSWORD: 'Forex!Admin234567', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'forex-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'forex-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '0', COS_BACKUP_INTERVAL_HOURS: '0' }) });
    let out = '';
    await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 10000); child.stdout.on('data', d => { out += d; if (/localhost:\d+/.test(out)) { clearTimeout(tm); res(); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
    child.kill(); await new Promise(r => child.once('exit', r));
  };
  const style = () => { const d = new DatabaseSync(path.join(dir, 'creative-os.db')); const a = JSON.parse(d.prepare('SELECT ai_settings FROM workspaces').get().ai_settings || '{}'); d.close(); return (a.image || {}).defaultStyle; };
  const set = (text, dropFlag) => { const d = new DatabaseSync(path.join(dir, 'creative-os.db')); const w = d.prepare('SELECT id, ai_settings FROM workspaces').get(); const a = JSON.parse(w.ai_settings || '{}'); a.image = Object.assign({}, a.image, { defaultStyle: text }); d.prepare('UPDATE workspaces SET ai_settings=? WHERE id=?').run(JSON.stringify(a), w.id); if (dropFlag) d.prepare("DELETE FROM app_meta WHERE key='ai_brand_prompt_forex'").run(); d.close(); };
  await boot();
  assert.equal(style(), brand.RECOMMENDED_BRAND_PROMPT, 'a new workspace starts on the new one');
  set(brand.PREVIOUS_BRAND_PROMPTS[0], true); await boot();
  assert.equal(style(), brand.RECOMMENDED_BRAND_PROMPT, 'the text it was given before: replaced');
  set('Our own look, written by the admin', true); await boot();
  assert.equal(style(), 'Our own look, written by the admin', 'one an admin wrote: kept');
  set(brand.PREVIOUS_BRAND_PROMPTS[0], false); await boot();
  assert.equal(style(), brand.PREVIOUS_BRAND_PROMPTS[0], 'once only');
});
