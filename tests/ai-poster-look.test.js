/* AI Hub follows the workspace's posters (Oct 2026): starting templates in the poster families, a Poster layout,
   a template's own type (colours, button, alignment, disclaimer), the admin's Brand default prompt sent once,
   and brand characters, people an admin sets up as the main reference whenever a visual shows a person. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/<\/?script>/g, '');
const PNG = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'e2e/fixtures/red.png')).toString('base64');

/* the browser side: ai.js and brand-characters.js as the bundle has them */
function hub(extra) {
  const noop = () => {};
  const c = Object.assign({ UI_ID: {}, WS: { brand: {}, ai: {} }, API: { on: true }, console, setTimeout, URL, window: { addEventListener: noop }, localStorage: { getItem: () => null, setItem: noop },
    document: { addEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, getContext: () => null, addEventListener: noop }), head: { appendChild: noop }, body: { appendChild: noop } },
    attr: x => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'), esc: x => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    jsq: x => JSON.stringify(String(x)).replace(/"/g, '&quot;'),
    clone: x => JSON.parse(JSON.stringify(x)), byId: (l, id) => (l || []).find(x => x.id === id), tr: x => x, toast: noop, renderScreen: noop, aiHistoryBefore: noop,
    aiSelectedModelCan: () => true }, extra || {});
  vm.createContext(c);
  vm.runInContext(read('src/ai.js'), c, { filename: 'ai.js' });
  vm.runInContext(read('src/brand-characters.js'), c, { filename: 'brand-characters.js' });
  return c;
}
const tpl = (c, id) => c.AI_PROMPT_DEFAULT.find(t => t.id === id);

test('the starting templates follow the poster families and only use sizes and layouts that exist', () => {
  const c = hub(), ids = new Set(), names = new Set();
  assert.ok(c.AI_PROMPT_DEFAULT.length >= 8);
  c.AI_PROMPT_DEFAULT.forEach(t => {
    assert.ok(!ids.has(t.id) && !names.has(t.name), 'unique: ' + t.name); ids.add(t.id); names.add(t.name);
    assert.ok(c.AI_SIZES.some(s => s.id === t.size), t.name + ' size ' + t.size);
    assert.ok(c.AI_LAYOUTS.some(l => l.id === t.layout), t.name + ' layout ' + t.layout);
    ['brief', 'style', 'negative', 'headline'].forEach(k => assert.ok(String(t[k] || '').trim(), t.name + ' has a ' + k));
    assert.match(t.negative, /text/, t.name + ': the picture carries no words');
    assert.ok(c.UI_ID[t.name], t.name + ' is translated');
  });
  /* the reference sizes: YouTube thumbnails, the 3:4 feed and stories */
  assert.deepEqual([c.aiSize('thumb').w, c.aiSize('thumb').h], [1280, 720]);
  assert.deepEqual([c.aiSize('feed34').w, c.aiSize('feed34').h], [1080, 1440]);
  assert.ok(c.AI_PROMPT_DEFAULT.some(t => t.size === 'story'));
  /* thumbnails carry no legal line; feed posts and stories carry the two-line one */
  c.AI_PROMPT_DEFAULT.forEach(t => t.size === 'thumb' ? assert.equal(t.disclaimerText, '') : assert.equal(t.disclaimerText.split('\n').length, 2, t.name));
  assert.equal(tpl(c, 'p_thumb_people').people, 2, 'the testimonial picks two brand characters');
  const poster = c.aiLayout('poster'); assert.ok(poster.foot > poster.box.y && poster.box && poster.align === 'center');
  assert.match(poster.zone, /top 30%.*bottom 25%/);
});

test('a template sets its own type on fresh text layers: colours, a readable button, alignment, disclaimer and characters', () => {
  const c = hub();
  c.WS.ai.characters = [{ id: 'ch_none', name: 'No photo', photos: [] }, { id: 'ch_rina', name: 'Rina', photos: [PNG] }, { id: 'ch_dimas', name: 'Dimas', photos: [PNG] }];
  /* leftovers from a previous design: a dragged headline and a red subheadline */
  c.AIF.layerPositions = { headline: { x: 30, y: 12 }, extra_pic: { x: 5, y: 5 } }; c.AIF.layerStyles = { sub: Object.assign({}, c.aiLayerStyle('sub'), { textFill: '#FF0000' }), extra_pic: { shadow: true } };
  c.aiApplyTemplate('p_feed_engage');
  assert.equal(c.AIF.layout, 'poster'); assert.equal(c.AIF.size, 'feed34');
  assert.equal(c.aiLayerStyle('headline').textFill, '#FFFFFF'); assert.equal(c.aiLayerStyle('sub').textFill, '#FFFFFF');
  assert.equal(c.AIF.ctaColor, c.AI_PILL); assert.equal(c.aiLayerStyle('cta').textFill, '#FFFFFF', 'white on the dark pill');
  assert.equal(c.AIF.ctaRadius, 50); assert.equal(c.AIF.ctaStroke, true); assert.equal(c.AIF.textAlign, 'center');
  assert.equal(c.AIF.disclaimer, true); assert.match(c.AIF.disclaimerText, /BAPPEBTI/);
  assert.equal(c.AIF.layerPositions.headline, undefined, 'the template places its own text'); assert.deepEqual(c.AIF.layerPositions.extra_pic, { x: 5, y: 5 }, 'a layer added by hand keeps its place');
  assert.equal(c.AIF.layerStyles.extra_pic.shadow, true);
  assert.deepEqual(Array.from(c.AIF.characters), [], 'no people in this one');
  /* a lime badge gets dark text */
  c.aiApplyTemplate('p_feed_promo'); assert.equal(c.aiLayerStyle('badge').textFill, '#0B1220');
  /* the thumbnail: lime headline, no legal line, two characters with photos chosen by themselves */
  c.aiApplyTemplate('p_thumb_people');
  assert.equal(c.aiLayerStyle('headline').textFill, c.AI_LIME); assert.equal(c.AIF.disclaimer, false);
  assert.deepEqual(Array.from(c.AIF.characters), ['ch_rina', 'ch_dimas']);
  /* the colour a template gives its headline is the colour it gets (it used to be ignored) */
  c.WS.ai.promptTemplates = [{ id: 'mine', name: 'Mine', brief: 'x', textColor: '#123456' }];
  c.aiApplyTemplate('mine'); assert.equal(c.aiLayerStyle('headline').textFill, '#123456');
  assert.equal(c.AIF.disclaimerText !== undefined, true);
});

test('the prompt: characters right behind the brief, the brand prompt left to the server, nothing for a model that cannot use photos', () => {
  let can = true;
  const c = hub({ aiSelectedModelCan: () => can, aiBasePrompt: () => ({ text: 'BASE' }) });
  c.WS.ai.characters = [{ id: 'ch_rina', name: 'Rina', description: 'Indonesian woman, late 20s', photos: [PNG] }];
  c.WS.ai.image = { endpoint: 'https://api.openai.com/v1/images/generations', defaultStyle: 'Dark studio, electric lime.' };   /* a provider that takes reference pictures */
  c.aiApplyTemplate('p_thumb_people');
  let p = c.aiBuildPrompt();
  assert.match(p, /People: the reference photos show Rina \(Indonesian woman, late 20s\)\. This person is the main person/);
  assert.ok(p.indexOf('People:') > p.indexOf('Two friendly') && p.indexOf('People:') < p.indexOf('Format:'), 'between the brief and the format');
  assert.doesNotMatch(p, /Dark studio, electric lime/, 'the server adds the brand prompt itself');
  /* what they do comes from the template, and can be written over for one generation */
  assert.match(p, /In this visual: the two people stand together in the right half/);
  c.AIF.characterRole = 'sitting at a desk, reading a chart'; assert.match(c.aiBuildPrompt(), /In this visual: sitting at a desk, reading a chart\./);
  c.AIF.characterRole = ''; assert.match(c.aiBuildPrompt(), /In this visual: placed naturally in the scene next to the hero subject/);
  /* switched off: no people line, no photos, and the field says so */
  c.aiCharactersSwitch(); assert.equal(c.aiCharactersOn(), false);
  assert.doesNotMatch(c.aiBuildPrompt(), /People:/); assert.equal(c.aiSelectedCharacters().length, 0);
  assert.match(c.aiCharactersFieldHtml(), /aria-checked="false"/); assert.doesNotMatch(c.aiCharactersFieldHtml(), /ai-char-card/);
  /* switched off by hand, then a template with people: on again */
  c.aiApplyTemplate('p_thumb_people'); assert.equal(c.aiCharactersOn(), true, 'a template with people turns them on');
  c.aiCharactersSwitch(); c.AIF.characters = ['ch_rina']; c.aiApplyTemplate('p_feed_market'); assert.equal(c.aiCharactersOn(), false, 'and one without people turns them off');
  /* a template without people starts with them off; switched on, the first character is chosen */
  c.aiApplyTemplate('p_feed_promo'); assert.equal(c.aiCharactersOn(), false);
  c.aiCharactersSwitch(); assert.deepEqual(Array.from(c.AIF.characters), ['ch_rina']); assert.match(c.aiBuildPrompt(), /next to the trophy/);
  c.aiApplyTemplate('p_thumb_people');
  c.API.on = false; assert.match(c.aiBuildPrompt(), /Brand requirements \(apply to every generation\): Dark studio, electric lime\./, 'without a server it is only here');
  can = false; c.API.on = true; p = c.aiBuildPrompt();
  assert.doesNotMatch(p, /People:/); assert.deepEqual(Array.from(c.aiSelectedCharacters()), []);
  /* the field in AI Hub says why */
  assert.match(c.aiCharactersFieldHtml(), /disabled/); assert.match(c.aiCharactersFieldHtml(), /cannot use reference photos/);
  can = true; assert.match(c.aiCharactersFieldHtml(), /aria-pressed="true"/);
  /* at most two */
  c.WS.ai.characters.push({ id: 'ch_b', name: 'B', photos: [PNG] }, { id: 'ch_c', name: 'C', photos: [PNG] });
  let warned = ''; c.toast = m => { warned = m; };
  c.aiToggleCharacter('ch_b'); c.aiToggleCharacter('ch_c');
  assert.deepEqual(Array.from(c.AIF.characters), ['ch_rina', 'ch_b']); assert.match(warned, /up to two/);
  /* a photo that is neither ours nor a picture is never shown or sent */
  c.WS.ai.characters = [{ id: 'ch_x', name: 'X', photos: ['https://example.com/x.png', 'javascript:alert(1)'] }];
  assert.deepEqual(Array.from(c.aiCharacters()), []);
  /* a workspace on Magnific: whatever the model is called it is Mystic, so no likeness from photos and the field says why;
     the member's own picture still goes, as a style or a structure */
  c.WS.ai.characters = [{ id: 'ch_rina', name: 'Rina', photos: [PNG] }];
  c.WS.ai.image = { endpoint: 'https://api.magnific.ai/v1/mystic' }; c.aiSelectedModelCan = () => false;
  c.aiApplyTemplate('p_thumb_people');
  assert.equal(c.aiImageRoute(), 'magnific'); assert.equal(c.aiSelectedCharacters().length, 0); assert.doesNotMatch(c.aiBuildPrompt(), /People:/);
  /* even a model called GPT Image, as the server sends it: the endpoint decides */
  c.aiResolveModel = () => ({ id: 'm_gpt2mag', name: 'GPT 2 Magnific', modelId: 'gpt-image-2', provider: 'openai', capabilities: ['reference'] });
  assert.equal(c.aiImageRoute(), 'magnific'); c.aiSelectedModelCan = () => true; assert.equal(c.aiSelectedCharacters().length, 0);
  c.aiSelectedModelCan = () => false; delete c.aiResolveModel;
  assert.match(c.aiCharactersFieldHtml(), /Magnific Mystic, which cannot keep a person's face/);
  assert.equal(c.aiRefUsable(), true, 'the upload works on Mystic');
  c.AIF.reference = PNG; assert.match(c.aiRefMysticHtml(), /aria-checked="true"[^>]*><span>Style/); assert.match(c.aiRefMysticHtml(), /value="50"/);
  c.WS.ai.image = { endpoint: 'https://api.openai.com/v1/images/generations' }; assert.equal(c.aiRefUsable(), false, 'a model elsewhere that takes none'); assert.equal(c.aiRefMysticHtml(), '');
});

test('the template editor keeps fields it does not show and saves the new type fields', () => {
  const els = { pt_sub_color: '#EEEEEE', pt_cta_color: '#15180F', pt_cta_shape: '50', pt_cta_stroke_color: '#4B5535', pt_align: 'center', pt_people: '1', pt_head: 'Hi', pt_text: '#D4FA00' };
  const box = { pt_sub_color: {}, pt_cta_stroke: { checked: true }, pt_disc: { value: 'Line one.\r\nLine two.' } };
  const c = { WS: { ai: {} }, require: () => true, clone: x => JSON.parse(JSON.stringify(x)), closeModal() {}, saveWS() {}, renderScreen() {},
    aiPromptTemplates: () => [{ id: 'p1', name: 'One', brief: 'b', style: 's', badgeColor: '#ABCDEF', ctaStrokeWidth: 2 }],
    val: id => els[id] || '', document: { getElementById: id => box[id] || null } };
  vm.createContext(c);
  const s = read('src/settings.js'); vm.runInContext(s.slice(s.indexOf('function savePromptTpl('), s.indexOf('function delPromptTpl(')), c);
  c.savePromptTpl('p1');
  const t = c.WS.ai.promptTemplates[0];
  assert.equal(t.badgeColor, '#ABCDEF', 'kept'); assert.equal(t.ctaStrokeWidth, 2, 'kept');
  assert.equal(t.subColor, '#EEEEEE'); assert.equal(t.ctaColor, '#15180F'); assert.equal(t.ctaRadius, 50); assert.equal(t.ctaStroke, true);
  assert.equal(t.textAlign, 'center'); assert.equal(t.people, 1); assert.equal(t.disclaimerText, 'Line one.\nLine two.'); assert.equal(t.textColor, '#D4FA00');
});

/* the server side, in a sandbox: which pictures a generation sends, and how each provider gets them */
function providers(stored) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-refs-'));
  process.env.COS_DATA_DIR = temp; delete require.cache[require.resolve('../server/uploads.js')];
  const uploads = require('../server/uploads.js');
  const bytes = fs.readFileSync(path.join(root, 'e2e/fixtures/red.png')), sha = require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  const file = uploads.fileFor(sha + '.png'); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes);
  const calls = [];
  const c = { fs, uploads, Buffer, FormData, Blob, URL, AbortSignal, process, console, db: {}, WS_ID: 'w',
    HttpError: class extends Error { constructor(code, msg) { super(msg); this.code = code; this.status = code; } },
    sz: { readAIRaw: () => ({ characters: (stored || []).map(ch => Object.assign({}, ch, { photos: (ch.photos || []).map(p => p === 'STORED' ? '/files/' + sha + '.png' : p) })) }) },
    aiFetch: async (url, init) => { calls.push({ url, init }); return { data: [{ b64_json: 'AAAA' }], candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }], url: 'https://cdn.example.com/x.png' }; } };
  vm.createContext(c);
  const s = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8');
  vm.runInContext(s.slice(s.indexOf('/* v38 image providers'), s.indexOf('route("POST", "/api/ai/image"')), c);
  return { c, calls, sha, cleanup: () => fs.rmSync(temp, { recursive: true, force: true }) };
}

test('a generation sends the chosen characters\' stored photos and the member\'s own picture, read by id', async t => {
  const { c, cleanup } = providers([{ id: 'ch_rina', name: 'Rina', photos: ['STORED', 'STORED'] }]); t.after(cleanup);
  const able = { capabilities: ['reference'] };
  assert.equal(c.aiReferenceImages({}, able).length, 0, 'nothing asked, nothing sent');
  let refs = c.aiReferenceImages({ characters: ['ch_rina'], referenceImage: PNG }, able);
  assert.equal(refs.length, 3); assert.equal(refs[0].mime, 'image/png'); assert.ok(Buffer.isBuffer(refs[0].data) && refs[0].data.length > 10);
  assert.throws(() => c.aiReferenceImages({ characters: ['ch_gone'] }, able), e => e.status === 400 && /no longer available/.test(e.message));
  assert.throws(() => c.aiReferenceImages({ characters: ['ch_rina'] }, { capabilities: [] }), e => e.status === 400 && /cannot use reference photos/.test(e.message));
  assert.throws(() => c.aiReferenceImages({ referenceImage: 'data:text/html;base64,PGI+' }, able), e => e.status === 400);
  /* a stored entry that is not one of our uploads is skipped, never read */
  const other = providers([{ id: 'ch_x', name: 'X', photos: ['/etc/passwd', '../../secret.png'] }]); t.after(other.cleanup);
  assert.equal(other.c.aiReferenceImages({ characters: ['ch_x'] }, able).length, 0);
});

test('on Magnific Mystic the member\'s picture goes and a brand character is refused, whatever the model allows', async t => {
  const { c, cleanup } = providers([{ id: 'ch_rina', name: 'Rina', photos: ['STORED'] }]); t.after(cleanup);
  assert.equal(c.aiReferenceImages({ referenceImage: PNG }, { capabilities: [] }, true).length, 1, 'no capability needed on Mystic');
  assert.throws(() => c.aiReferenceImages({ characters: ['ch_rina'] }, { capabilities: ['reference'] }, true), e => e.status === 400 && /cannot keep a person's likeness/.test(e.message));
});

test('a generated picture is kept as the workspace\'s own file; links that are not safe to fetch are left as they were', async t => {
  const { c, cleanup } = providers([]); t.after(cleanup);
  const { DatabaseSync } = require('node:sqlite'); c.db = new DatabaseSync(':memory:'); c.uploads.ensureTable(c.db); t.after(() => c.db.close());
  const png = fs.readFileSync(path.join(root, 'e2e/fixtures/red.png')), fetched = [];
  c.fetch = async (url, opts) => { fetched.push(url); if (/redirect-inside/.test(url)) return { status: 302, ok: false, headers: { get: k => k === 'location' ? 'https://169.254.169.254/latest' : null } }; if (/redirect-ok/.test(url)) return { status: 302, ok: false, headers: { get: k => k === 'location' ? 'https://cdn.example.com/final.png' : null } }; if (/not-image/.test(url)) return { status: 200, ok: true, headers: { get: () => 'image/png' }, arrayBuffer: async () => Buffer.from('<html>nope</html>') }; return { status: 200, ok: true, headers: { get: k => k === 'content-type' ? 'binary/octet-stream' : null }, arrayBuffer: async () => png }; };
  /* base64 from OpenAI or Gemini */
  assert.match(await c.aiKeepImage(PNG, 'u1'), /^\/files\/[a-f0-9]{64}\.png$/);
  /* a provider's link, its type read from the bytes; a redirect followed when it stays public */
  assert.match(await c.aiKeepImage('https://cdn.example.com/x', 'u1'), /^\/files\/[a-f0-9]{64}\.png$/);
  assert.match(await c.aiKeepImage('https://cdn.example.com/redirect-ok', 'u1'), /^\/files\//);
  /* never fetched, or not a picture: the provider's link stays */
  assert.equal(await c.aiKeepImage('https://cdn.example.com/redirect-inside', 'u1'), null);
  assert.ok(!fetched.some(u => /169\.254/.test(u)), 'the inside address is not fetched');
  assert.equal(await c.aiKeepImage('http://cdn.example.com/x.png', 'u1'), null);
  assert.equal(await c.aiKeepImage('https://10.0.0.5/x.png', 'u1'), null);
  assert.equal(await c.aiKeepImage('https://localhost/x.png', 'u1'), null);
  assert.equal(await c.aiKeepImage('https://cdn.example.com/not-image', 'u1'), null);
});

test('the image route hands back the kept file, and the provider\'s link when it cannot be kept', async t => {
  const { c, cleanup } = providers([]); t.after(cleanup);
  const { DatabaseSync } = require('node:sqlite'); c.db = new DatabaseSync(':memory:'); c.uploads.ensureTable(c.db); t.after(() => c.db.close());
  const png = fs.readFileSync(path.join(root, 'e2e/fixtures/red.png')); let served = png;
  c.fetch = async () => ({ status: 200, ok: true, headers: { get: () => null }, arrayBuffer: async () => served });
  let handler; Object.assign(c, { route(m, u, h) { if (u === '/api/ai/image') handler = h; }, forbid(ok) { if (!ok) throw new c.HttpError(403, 'no'); }, can: { useAIHub: () => true }, security: { log() {} },
    aiConf: () => ({ key: 'k', endpoint: 'https://images.example.com/v1/generate', provider: 'custom' }), aiResolveRegistryModel: () => null });
  c.aiFetch = async () => ({ url: 'https://cdn.example.com/out.png' });
  const s = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8');
  vm.runInContext(s.slice(s.indexOf('route("POST", "/api/ai/image"'), s.indexOf('route("POST", "/api/ai/chat"')), c);
  let r = await handler({ id: 'u1', caps: {} }, {}, {}, { prompt: 'p', width: 1080, height: 1440 });
  assert.match(r.imageUrl, /^\/files\/[a-f0-9]{64}\.png$/); assert.equal(r.kept, true);
  served = Buffer.from('<html>expired</html>');
  r = await handler({ id: 'u1', caps: {} }, {}, {}, { prompt: 'p', width: 1080, height: 1440 });
  assert.equal(r.imageUrl, 'https://cdn.example.com/out.png'); assert.equal(r.kept, false);
});

test('each provider gets the pictures its own way; Magnific, Imagen and DALL-E say they cannot', async t => {
  const { c, calls, cleanup } = providers([]); t.after(cleanup);
  const refs = [{ mime: 'image/png', data: Buffer.from('a') }, { mime: 'image/jpeg', data: Buffer.from('b') }];
  const body = extra => Object.assign({ prompt: 'P', negative_prompt: 'N', width: 1080, height: 1440, refs }, extra);
  /* OpenAI: the edits endpoint, one image[] per picture */
  await c.aiImageCall({ key: 'k', endpoint: 'https://api.openai.com/v1/images/generations' }, 'openai', body({ model: 'gpt-image-1' }));
  let last = calls.pop(); assert.equal(last.url, 'https://api.openai.com/v1/images/edits');
  assert.equal(last.init.body.getAll('image[]').length, 2); assert.equal(last.init.body.get('size'), '1024x1536');
  /* without pictures it stays a plain generation */
  await c.aiImageCall({ key: 'k', endpoint: 'https://api.openai.com/v1/images/generations' }, 'openai', body({ model: 'gpt-image-1', refs: [] }));
  assert.equal(calls.pop().url, 'https://api.openai.com/v1/images/generations');
  await assert.rejects(() => c.aiImageCall({ key: 'k', endpoint: 'https://api.openai.com/v1/images/generations' }, 'openai', body({ model: 'dall-e-3' })), e => e.status === 400);
  /* Gemini: inline parts behind the text */
  await c.aiImageCall({ key: 'k', endpoint: 'https://generativelanguage.googleapis.com/v1beta' }, 'gemini', body({ model: 'gemini-3-pro-image' }));
  const parts = JSON.parse(calls.pop().init.body).contents[0].parts;
  assert.equal(parts.length, 3); assert.equal(parts[1].inlineData.mimeType, 'image/png'); assert.equal(parts[1].inlineData.data, Buffer.from('a').toString('base64'));
  await assert.rejects(() => c.aiImageCall({ key: 'k', endpoint: 'https://generativelanguage.googleapis.com/v1beta' }, 'gemini', body({ model: 'imagen-4.0-generate-001' })), e => e.status === 400);
  /* Magnific Mystic: the member's picture as a style (adherence: how much the prompt leads) or a structure; never a face from photos */
  const mystic = { key: 'k', endpoint: 'https://api.magnific.ai/v1/mystic' }, own = [{ mime: 'image/png', data: Buffer.from('s'), kind: 'member' }];
  await c.aiImageCall(mystic, 'magnific', body({ model: 'realism', refs: own, refStrength: 70 }));
  let my = JSON.parse(calls.pop().init.body);
  assert.equal(my.style_reference, Buffer.from('s').toString('base64')); assert.equal(my.adherence, 30); assert.equal(my.structure_reference, undefined); assert.equal(my.refs, undefined);
  await c.aiImageCall(mystic, 'magnific', body({ model: 'realism', refs: own, refMode: 'structure', refStrength: 40 }));
  my = JSON.parse(calls.pop().init.body);
  assert.equal(my.structure_reference, Buffer.from('s').toString('base64')); assert.equal(my.structure_strength, 40); assert.equal(my.style_reference, undefined);
  await c.aiImageCall(mystic, 'magnific', body({ model: 'realism', refs: [] }));
  my = JSON.parse(calls.pop().init.body); assert.equal(my.style_reference, undefined); assert.equal(my.structure_reference, undefined);
  await assert.rejects(() => c.aiImageCall(mystic, 'magnific', body({ model: 'realism', refs: [{ mime: 'image/png', data: Buffer.from('f'), kind: 'character' }] })), e => e.status === 400 && /cannot keep a person's likeness/.test(e.message));
  /* a custom endpoint gets data URLs, never raw buffers */
  await c.aiImageCall({ key: 'k', endpoint: 'https://images.example.com/v1/generate' }, 'custom', body({ model: 'x' }));
  const sent = JSON.parse(calls.pop().init.body);
  assert.equal(sent.refs, undefined); assert.deepEqual(sent.reference_images, ['data:image/png;base64,' + Buffer.from('a').toString('base64'), 'data:image/jpeg;base64,' + Buffer.from('b').toString('base64')]);
});

/* the real server: characters saved through Settings, and the Brand default prompt a workspace starts with */
/* one folder per test; every server started in it is stopped before the folder goes (Windows keeps open files) */
function place(t) {
  const at = { temp: fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-poster-')), stops: [] };
  t.after(async () => { for (const stop of at.stops) await stop(); fs.rmSync(at.temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  return at;
}
async function start(at) {
  const temp = at.temp;
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Poster!Admin23456', COS_ADMIN_EMAIL: 'ops@hsb.co.id', COS_SECRET_KEY: 'poster-secret-key-long-enough-for-the-check!!', COS_BACKUP_KEY: 'poster-backup-key-long-enough-for-the-check!!', COS_BACKUP_INTERVAL_HOURS: '0', APP_URL: 'https://zen.hsb-test.dev' }) });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 10000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', code => { clearTimeout(tm); rej(new Error('exit ' + code + ' ' + out)); }); });
  const stop = async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } };
  at.stops.push(stop);
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, ck) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, ck ? { cookie: ck } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const r = await req('POST', '/api/auth/login', { email: 'ops@hsb.co.id', password: 'Poster!Admin23456' });
  return { req, admin: r.headers.get('set-cookie').split(';')[0], temp, stop };
}

test('brand characters are saved as stored files, capped, and nothing but our own uploads is accepted', { timeout: 60000 }, async t => {
  const at = place(t), s = await start(at);
  const ws = async () => (await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).ws;
  const put = async chars => { const w = await ws(); w.ai = Object.assign({}, w.ai, { characters: chars }); return s.req('PUT', '/api/workspace', w, s.admin); };
  let r = await put([{ id: 'ch_rina01', name: '  Rina  ', description: 'Indonesian woman', photos: [PNG, PNG, PNG, PNG] }]);
  assert.equal(r.status, 200, await r.clone().text());
  let ch = (await ws()).ai.characters;
  assert.equal(ch.length, 1); assert.equal(ch[0].name, 'Rina'); assert.equal(ch[0].photos.length, 3, 'three photos at most');
  ch[0].photos.forEach(u => assert.match(u, /^\/files\/[a-f0-9]{64}\.png$/));
  /* sending it back as it came is fine */
  r = await put(ch); assert.equal(r.status, 200, await r.clone().text());
  /* a picture from anywhere else is refused, and so is a path that is not ours */
  assert.equal((await put([{ id: 'ch_x0001', name: 'X', photos: ['https://example.com/a.png'] }])).status, 400);
  assert.equal((await put([{ id: 'ch_x0001', name: 'X', photos: ['/files/' + 'b'.repeat(64) + '.png'] }])).status, 400);
  /* six people at most; an id that is not ours is replaced */
  r = await put(Array.from({ length: 8 }, (_, i) => ({ id: i ? 'ch_p00' + i : 'x"><img', name: 'P' + i, photos: [] })));
  assert.equal(r.status, 200); ch = (await ws()).ai.characters;
  assert.equal(ch.length, 6); assert.match(ch[0].id, /^ch_[a-z0-9]+$/);
  /* the Brand default prompt a workspace starts with: the poster look, editable */
  const w = await ws(); assert.match(w.ai.image.defaultStyle, /electric-lime glow \(#D4FA00\)/);
  assert.equal(w.ai.image.defaultStyle, require('../server/ai-brand.js').RECOMMENDED_BRAND_PROMPT);
  /* once only: cleared by an admin, it stays cleared after a restart */
  w.ai.image = Object.assign({}, w.ai.image, { defaultStyle: '' }); assert.equal((await s.req('PUT', '/api/workspace', w, s.admin)).status, 200);
  await s.stop(); const s2 = await start(at);
  assert.equal((await (await s2.req('GET', '/api/bootstrap', undefined, s2.admin)).json()).ws.ai.image.defaultStyle, '');
});

test('a workspace that already wrote its Brand default prompt keeps it', { timeout: 60000 }, async t => {
  const at = place(t), temp = at.temp;
  let s = await start(at); await s.stop();
  const { DatabaseSync } = require('node:sqlite'), d = new DatabaseSync(path.join(temp, 'creative-os.db'));
  const row = d.prepare('SELECT id, ai_settings FROM workspaces').get(), a = JSON.parse(row.ai_settings || '{}');
  a.image = Object.assign({}, a.image, { defaultStyle: 'Our own words.' }); d.prepare('UPDATE workspaces SET ai_settings=? WHERE id=?').run(JSON.stringify(a), row.id);
  d.prepare("DELETE FROM app_meta WHERE key='ai_brand_prompt_poster'").run(); d.close();
  s = await start(at);
  assert.equal((await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).ws.ai.image.defaultStyle, 'Our own words.');
});

/* The canvas's layout (Oct 2026): sent with a generation as the text's boxes and written into the prompt in words — the
   bands the text takes and the open area — for every provider alike. It first went as a picture, a grey map with black
   boxes, and GPT Image's edits endpoint (the one path for a picture) edited the map itself into grey noise: no picture
   ever goes for it, and a generation with no reference picture is a plain generation. */
test('the layout is written into the prompt as measured bands, and never sent as a picture', async t => {
  const { c, calls, cleanup } = providers([]); t.after(cleanup);
  /* a feed poster: the logo and the headline at the top, a line, the button and the disclaimer at the bottom */
  const zones = c.aiLayoutZonesFrom({ layoutZones: [
    { x: 0.07, y: 0.05, w: 0.18, h: 0.04, kind: 'logo' }, { x: 0.08, y: 0.1, w: 0.84, h: 0.2, kind: 'headline' },
    { x: 0.1, y: 0.82, w: 0.8, h: 0.03, kind: 'text' }, { x: 0.3, y: 0.87, w: 0.4, h: 0.04, kind: 'cta' }, { x: 0.1, y: 0.93, w: 0.8, h: 0.03 },
    { x: 'a', y: 0.5, w: 0.1, h: 0.1 }, null, { x: 0.5, y: 0.5, w: 0, h: 0.1 }] });
  assert.equal(zones.length, 5, 'a box that is not numbers, or has no size, is left out');
  assert.deepEqual([...zones.map(z => z.kind)], ['logo', 'headline', 'text', 'text', 'text']);
  assert.equal(c.aiLayoutZonesFrom({}), null); assert.equal(c.aiLayoutZonesFrom({ layoutZones: 'x' }), null);
  assert.ok(c.aiLayoutZonesFrom({ layoutZones: [{ x: 0.9, y: 0.9, w: 5, h: 5 }] })[0].w <= 0.1 + 1e-9, 'kept inside the poster');
  assert.equal(c.aiLayoutZonesFrom({ layoutZones: Array.from({ length: 40 }, () => ({ x: 0, y: 0, w: 0.1, h: 0.1 })) }).length, 24, 'at most 24 boxes');
  const note = c.aiLayoutNote(zones);
  assert.match(note, /the headline and the logo from 3% to 32% down; text from 80% to 98% down\./);
  assert.match(note, /open area from 32% to 80% of the height, fully inside it/);
  assert.equal(note.indexOf('image'), -1, 'nothing said about an attached picture');
  /* text all on one side: the subject goes beside it */
  const side = c.aiLayoutNote(c.aiLayoutZonesFrom({ layoutZones: [{ x: 0.05, y: 0.2, w: 0.45, h: 0.5, kind: 'headline' }] }));
  assert.match(side, /the headline from 18% to 72% down, on the left side/); assert.match(side, /right part of the poster, from 50% of the width/);
  /* text everywhere: no open area is made up */
  assert.match(c.aiLayoutNote(c.aiLayoutZonesFrom({ layoutZones: [{ x: 0, y: 0, w: 1, h: 0.45 }, { x: 0, y: 0.5, w: 1, h: 0.5 }] })), /covers most of the poster/);
  assert.equal(c.aiLayoutNote(null), '');

  /* every provider: the words in the prompt, no picture of it */
  const body = extra => Object.assign({ prompt: 'P\n\n' + note, negative_prompt: 'N', width: 1080, height: 1440, refs: [] }, extra);
  const own = [{ mime: 'image/png', data: Buffer.from('s'), kind: 'member' }];
  await c.aiImageCall({ key: 'k', endpoint: 'https://api.openai.com/v1/images/generations' }, 'openai', body({ model: 'gpt-image-1' }));
  let last = calls.pop();
  assert.equal(last.url, 'https://api.openai.com/v1/images/generations', 'no reference picture: a plain generation, never an edit');
  assert.match(JSON.parse(last.init.body).prompt, /open area from 32% to 80%/);
  await c.aiImageCall({ key: 'k', endpoint: 'https://api.openai.com/v1/images/generations' }, 'openai', body({ model: 'gpt-image-1', refs: own }));
  last = calls.pop(); assert.equal(last.url, 'https://api.openai.com/v1/images/edits');
  assert.deepEqual(last.init.body.getAll('image[]').map(f => f.name), ['reference-1.png'], 'only the reference picture is edited from');
  await c.aiImageCall({ key: 'k', endpoint: 'https://generativelanguage.googleapis.com/v1beta' }, 'gemini', body({ model: 'gemini-3-pro-image' }));
  const parts = JSON.parse(calls.pop().init.body).contents[0].parts;
  assert.equal(parts.length, 1); assert.match(parts[0].text, /Layout of the finished poster/);
  const mystic = { key: 'k', endpoint: 'https://api.magnific.ai/v1/mystic' };
  await c.aiImageCall(mystic, 'magnific', body({ model: 'realism' }));
  let my = JSON.parse(calls.pop().init.body);
  assert.equal(my.structure_reference, undefined, 'Mystic follows no map'); assert.match(my.prompt, /open area from 32% to 80%/);
  await c.aiImageCall(mystic, 'magnific', body({ model: 'realism', refs: own, refMode: 'style', refStrength: 50 }));
  my = JSON.parse(calls.pop().init.body);
  assert.equal(my.style_reference, Buffer.from('s').toString('base64')); assert.equal(my.structure_reference, undefined);

  /* the route: the boxes the page sends become the words, after the brief and before the brand's requirements */
  const { DatabaseSync } = require('node:sqlite'); c.db = new DatabaseSync(':memory:'); c.uploads.ensureTable(c.db); t.after(() => c.db.close());
  let handler, sent = null; Object.assign(c, { route(m, u, h) { if (u === '/api/ai/image') handler = h; }, forbid(ok) { if (!ok) throw new c.HttpError(403, 'no'); }, can: { useAIHub: () => true }, security: { log() {} },
    aiConf: () => ({ key: 'k', endpoint: 'https://images.example.com/v1/generate', provider: 'custom', defaultStyle: 'BRAND' }), aiResolveRegistryModel: () => null, fetch: async () => ({ status: 404, ok: false, headers: { get: () => null }, arrayBuffer: async () => Buffer.alloc(0) }) });
  c.aiFetch = async (url, init) => { sent = JSON.parse(init.body); return { url: 'https://cdn.example.com/out.png' }; };
  const s = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8');
  vm.runInContext(s.slice(s.indexOf('route("POST", "/api/ai/image"'), s.indexOf('route("POST", "/api/ai/chat"')), c);
  await handler({ id: 'u1', caps: {} }, {}, {}, { prompt: 'BRIEF', width: 1080, height: 1440, layoutZones: [{ x: 0.08, y: 0.1, w: 0.84, h: 0.2, kind: 'headline' }], layoutMap: 'data:image/png;base64,' + Buffer.from('old').toString('base64') });
  assert.match(sent.prompt, /^BRIEF\n\nLayout of the finished poster[^]*\n\nWorkspace brand requirements[^]*BRAND/);
  assert.equal(JSON.stringify(sent).indexOf(Buffer.from('old').toString('base64')), -1, 'a map from a page not yet reloaded is not passed on');
  await handler({ id: 'u1', caps: {} }, {}, {}, { prompt: 'BRIEF', width: 1080, height: 1440 });
  assert.equal(sent.prompt.indexOf('Layout of'), -1, 'no boxes, no words');
});
