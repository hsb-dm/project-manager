/* Several kinds of work in one task, the page's side (Oct 2026; src/scoring-kinds.js, src/scoring-panel.js): a task's
   meta.kinds [{k, n}] read as the server keeps it (active kinds, each once, counts 1–500, 2–8 of them), the kind
   trigger that reads "Mixed · 3 kinds" with the kinds in its tooltip, the mix editor (a row a kind, the count, the
   live total from ScoringEngine.hours with the mix), "Use one kind" under 2, the plain list for whoever only reads it,
   the hint when the title names several kinds (kind by kind, never applied by itself), the AI's split with "Use this
   split", the rating form's inputs with a mix, and every word of it in English and Indonesian. Run as the page runs
   them, in one context. In the browser: e2e/kind-mix.spec.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Engine = require('../shared/scoring-engine.js'), Settings = require('../shared/scoring-settings.js');
const SRC = p => fs.readFileSync(path.join(__dirname, '..', 'src', p), 'utf8');
const script = p => { const s = SRC(p); return s.slice(s.indexOf('<script>') + 8, s.lastIndexOf('</script>')); };
const CORE = SRC('core.js'), line = name => { const at = CORE.indexOf('function ' + name + '('); return CORE.slice(at, CORE.indexOf('\n', at)); };

/* the workspace's kinds with two of its own, Cover and Podcast */
const OWN = [{ id: 'k_cover', name: 'Cover', nameId: 'Sampul', keywords: ['cover', 'thumbnail'], active: true }, { id: 'k_pod', name: 'Podcast', nameId: 'Siniar', keywords: ['podcast*', 'siniar'], active: true }];
const settingsWith = extra => Settings.normalizeSettings(Object.assign({ kinds: Settings.defaults().kinds.concat(OWN), hours: { templates: { k_cover: { perUnit: 2, nextUnitFactor: 0.5 }, k_pod: { perUnit: 5 } } } }, extra || {}));

function load(o) {
  o = o || {};
  const settings = o.settings || settingsWith(), tasks = o.tasks || {}, writes = [];
  const c = {
    UI_ID: {}, UI_LANG: 'en', console, ScoringEngine: Engine, ScoringSettings: Settings, setTimeout, clearTimeout, JSON, Math,
    I: { lock: '', gauge: '', chevd: '', clock: '', sparkle: '', x: '<svg data-x></svg>', plus: '<svg data-plus></svg>', check: '<svg data-check></svg>' },
    API: { on: false }, task: id => tasks[id], canI: { editTask: () => o.ed !== false, scoringConfigure: () => true },
    taskMeta: t => (t.meta = t.meta || {}), isClosed: () => false, effortEstimate: () => null, effortApply: () => {},
    editTaskWith: (t, fn) => { fn(t); writes.push(JSON.parse(JSON.stringify(t.meta || {}))); return Promise.resolve(t); },
    estSettings: () => settings, estKindList: () => settings.kinds, estKindOf: t => Engine.kindOfTask(t, settings.kinds),
    estKindName: id => { const k = settings.kinds.find(x => x.id === id); return k ? (c.UI_LANG === 'id' ? k.nameId : k.name) : id; },
    scoringSettings: () => settings, scoringModuleOn: () => true, scoringMode: () => 'suggest', assetCount: t => +t.assetCount || 0,
    scPathLabel: p => p, scVal: (p, v) => v, toast: () => {}, scoringStakeholder: () => false, scoringOn: () => true
  };
  c.window = c; c.tr = s => (c.UI_LANG === 'id' ? c.UI_ID[s] || s : s);
  vm.createContext(c);
  vm.runInContext([line('fmt'), line('esc'), line('attr'), line('jsq')].join('\n'), c);
  vm.runInContext(script('scoring-panel.js'), c);
  vm.runInContext(script('scoring-kinds.js'), c);
  c.writes = writes; c.settings = settings; return c;
}
const text = h => String(h).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

test('a mix is kept as the server keeps it: active kinds, each once, whole counts 1–500, 2 to 8 of them', () => {
  const c = load({ settings: settingsWith({ kinds: Settings.defaults().kinds.concat([Object.assign({}, OWN[0], { active: false }), OWN[1]]) }) });
  const out = l => JSON.parse(JSON.stringify(c.kmixClean(l)));
  assert.deepEqual(out([{ k: 'video', n: 1 }, { k: 'reels', n: 4 }, { k: 'kv', n: 1 }]), [{ k: 'video', n: 1 }, { k: 'reels', n: 4 }, { k: 'kv', n: 1 }]);
  assert.deepEqual(out([{ k: 'made_up', n: 2 }, { k: 'k_cover', n: 1 }, { k: 'video', n: 0 }, { k: 'reels', n: 2.6 }, { k: 'kv', n: 900 }]), [{ k: 'video', n: 1 }, { k: 'reels', n: 3 }, { k: 'kv', n: 500 }], 'unknown and switched-off kinds go; counts are whole, 1 to 500');
  assert.deepEqual(out([{ kind: 'video', count: 1 }, { kind: 'reels', count: 2 }, { kind: 'reels', count: 2 }]), [{ k: 'video', n: 1 }, { k: 'reels', n: 4 }], 'the AI\'s spelling; a kind twice is one kind');
  assert.equal(out(Array.from({ length: 12 }, (_, i) => ({ k: c.settings.kinds[i].id, n: 1 }))).length, 8, 'at most 8');
  assert.equal(c.kmixOf({ meta: { kinds: [{ k: 'video', n: 2 }] } }), null, 'one kind is no mix');
  assert.equal(c.kmixOf({ meta: { kinds: [{ k: 'video', n: 2 }, { k: 'made_up', n: 1 }] } }), null);
  assert.equal(c.kmixOf({ meta: {} }), null); assert.equal(c.kmixOf({}), null); assert.equal(c.kmixOf(null), null);
  assert.ok(c.kmixSame([{ k: 'a', n: 1 }, { k: 'b', n: 2 }], [{ k: 'b', n: 2 }, { k: 'a', n: 1 }]), 'the order does not make another mix');
  assert.ok(!c.kmixSame([{ k: 'a', n: 1 }, { k: 'b', n: 2 }], [{ k: 'a', n: 1 }, { k: 'b', n: 3 }]));
});

test('the trigger of a mixed task reads "Mixed · 3 kinds", the kinds in its tooltip; "Several kinds…" is its menu\'s last option', () => {
  const tk = { id: 'T-1', title: 'Youtube podcast', meta: { kind: 'feed', kinds: [{ k: 'video', n: 1 }, { k: 'reels', n: 4 }, { k: 'kv', n: 1 }] } };
  const c = load({ tasks: { 'T-1': tk } });
  const h = c.kindPickHtml(tk, true);
  assert.match(h, /data-kdd="task:T-1" data-value="" data-mix="3" title="video 1 · reels or short video 4 · key visual 1"/);
  assert.equal(text(h.match(/<button[^>]*data-kdd[\s\S]*?<\/button>/)[0]), 'Mixed · 3 kinds');
  assert.equal(c.KDD.cfg['task:T-1'].hasMix, true, 'the task\'s own trigger offers several kinds');
  assert.equal(c.KDD.cfg['task:T-1'].hasAuto, true);
  /* read-only: the same chip, still, with its tooltip */
  const ro = load({ tasks: { 'T-1': tk }, ed: false }).kindPickHtml(tk, false);
  assert.match(ro, /<span class="scr-kdd ro" data-kdd="task:T-1" data-value="" data-mix="3" title="video 1 · reels or short video 4 · key visual 1">/);
  /* Indonesian */
  c.UI_LANG = 'id';
  assert.equal(text(c.kindPickHtml(tk, true).match(/<button[^>]*data-kdd[\s\S]*?<\/button>/)[0]), 'Campuran · 3 jenis');
  assert.match(c.kindPickHtml(tk, true), /title="video 1 · reels atau video pendek 4 · key visual 1"/);
  /* one kind: as it was */
  const one = { id: 'T-2', title: 'Video teaser', meta: { kind: 'carousel' } };
  assert.match(c.kindPickHtml(one, true), /data-kdd="task:T-2" data-value="carousel" role="combobox"/);
  assert.doesNotMatch(c.kindPickHtml(one, true), /data-mix/);
});

test('the title\'s kinds are found kind by kind, in the list\'s order, the workspace\'s own too', () => {
  const c = load();
  assert.deepEqual(Array.from(c.kmixDetect('Youtube podcast: full video, 4 reels and a key visual')), ['reels', 'video', 'kv', 'k_pod']);
  assert.deepEqual(Array.from(c.kmixDetect('Youtube Podcast (Full Video, Clippers Socmed & Cover)')), ['video', 'k_cover', 'k_pod'], '"socmed" is not one of the feed\'s words');
  assert.deepEqual(Array.from(c.kmixDetect('Feed post Monday')), ['feed']);
  assert.deepEqual(Array.from(c.kmixDetect('')), []); assert.deepEqual(Array.from(c.kmixDetect(null)), []);
  /* a switched-off kind is never found */
  const off = load({ settings: settingsWith({ kinds: Settings.defaults().kinds.map(k => (k.id === 'video' ? Object.assign({}, k, { active: false }) : k)).concat(OWN) }) });
  assert.deepEqual(Array.from(off.kmixDetect('Full video and 4 reels')), ['reels']);
});

test('the total is the engine\'s for the mix: each kind\'s hours added up, then complexity and dependencies once', () => {
  const tk = { id: 'T-1', title: 'x', meta: {} }, c = load({ tasks: { 'T-1': tk } }), T = c.settings.hours.templates;
  const rows = [{ k: 'video', n: 1 }, { k: 'reels', n: 4 }, { k: 'kv', n: 1 }];
  const own = k => T[k].perUnit, each = (k, n) => own(k) * (1 + T[k].nextUnitFactor * (n - 1));
  const h = c.kmixHours(tk, rows);
  assert.deepEqual(h.per.map(x => [x.k, x.n, Engine.round2(x.h)]), [['video', 1, 8], ['reels', 4, 16.8], ['kv', 1, 6]]);
  assert.equal(h.total, Engine.round2(each('video', 1) + each('reels', 4) + each('kv', 1)), 'complexity 3 and no open dependency: ×1');
  assert.equal(text(c.kmixTotalInner(tk, rows)), '≈ 31 h · video 8 h + reels or short video 4× 17 h + key visual 6 h');
  /* complexity rated 5 and one open dependency: once, for the whole */
  c.kmixCx = () => 5; c.kmixDeps = () => 1;
  assert.equal(c.kmixHours(tk, rows).total, Engine.round2(30.8 * c.settings.hours.complexity[5] * c.settings.hours.dependency[1]));
  /* a kind with no hours yet says so; nothing chosen yet: nothing to add */
  const bare = load({ settings: Settings.normalizeSettings({ kinds: Settings.defaults().kinds.concat([{ id: 'k_new', name: 'Workshop', keywords: ['workshop'] }]) }) });
  assert.equal(text(bare.kmixTotalInner(tk, [{ k: 'video', n: 1 }, { k: 'k_new', n: 2 }])), '≈ 8 h · video 8 h + Workshop: no hours yet');
  assert.equal(text(bare.kmixTotalInner(tk, [{ k: '', n: 1 }])), 'Choose the kinds to see their hours.');
  c.UI_LANG = 'id';
  assert.equal(text(load({ tasks: { 'T-1': tk } }).kmixTotalInner(tk, rows)), '≈ 31 h · video 8 h + reels or short video 4× 17 h + key visual 6 h', 'the English page');
  const id = load({ tasks: { 'T-1': tk } }); id.UI_LANG = 'id';
  assert.equal(text(id.kmixTotalInner(tk, rows)), '≈ 31 j · video 8 j + reels atau video pendek 4× 17 j + key visual 6 j');
});

test('the editor: a row a kind (without the kinds already used), the count, × to remove, Add kind up to 8, the total; under 2, "Use one kind"', () => {
  const tk = { id: 'T-1', title: 'Video and reels', meta: { kinds: [{ k: 'video', n: 1 }, { k: 'reels', n: 4 }] } }, c = load({ tasks: { 'T-1': tk } });
  c.KMIX.open['T-1'] = 'effort'; c.KMIX.draft['T-1'] = c.kmixStart(tk);
  assert.deepEqual(JSON.parse(JSON.stringify(c.KMIX.draft['T-1'])), [{ k: 'video', n: 1 }, { k: 'reels', n: 4 }], 'it starts from the mix');
  let h = c.kindMixSlotHtml(tk, true, 'effort');
  assert.equal((h.match(/class="scr-kmix-row"/g) || []).length, 2);
  assert.match(h, /data-kdd="mix:T-1:0" data-value="video"/); assert.match(h, /data-kdd="mix:T-1:1" data-value="reels"/);
  assert.deepEqual(Array.from(c.KDD.cfg['mix:T-1:0'].kinds).includes('reels'), false, 'a kind already in the mix is not offered again');
  assert.ok(Array.from(c.KDD.cfg['mix:T-1:0'].kinds).includes('video') && Array.from(c.KDD.cfg['mix:T-1:0'].kinds).includes('kv'));
  assert.ok(!c.KDD.cfg['mix:T-1:0'].hasAuto && !c.KDD.cfg['mix:T-1:0'].hasMix, 'no Auto, no "Several kinds…" in a row');
  assert.match(h, /role="spinbutton" aria-valuemin="1" aria-valuemax="500" aria-valuenow="4" aria-label="How many: reels or short video" value="4" data-kmix-key="1:n"/);
  assert.match(h, /data-kmix-key="0:dec"[^>]*disabled>−</, 'one: no fewer');
  assert.match(h, /aria-label="Remove video"/); assert.match(h, /data-kmix-key="add"[^>]*>/);
  assert.doesNotMatch(h, /data-kmix-key="add"[^>]*disabled/);
  assert.match(text(h), /≈ 25 h · video 8 h \+ reels or short video 4× 17 h/);
  assert.doesNotMatch(h, /data-kmix-few/, 'a mix: nothing to say');
  /* one kind left: nothing saved, and the way back to one kind */
  c.KMIX.draft['T-1'].splice(1, 1);
  h = c.kindMixSlotHtml(tk, true, 'effort');
  assert.match(text(h), /A mix needs at least 2 kinds; it is saved once it has them\. Use one kind: video/);
  /* 8 rows: no more */
  c.KMIX.draft['T-1'] = c.settings.kinds.slice(0, 8).map(k => ({ k: k.id, n: 1 }));
  assert.match(c.kindMixSlotHtml(tk, true, 'effort'), /data-kmix-key="add"[^>]*disabled title="Up to 8 kinds"/);
  /* the editor stands where it was opened: the panel's slot stays empty */
  assert.equal(c.kindMixSlotHtml(tk, true, 'panel'), '<div class="scr-kmix-slot" data-kmix-slot="panel" data-kmix-task="T-1"></div>');
});

test('a new editor starts from the title\'s kinds, else from the task\'s kind and one to choose', () => {
  const c = load();
  assert.deepEqual(JSON.parse(JSON.stringify(c.kmixStart({ title: 'Full video and 4 reels' }))), [{ k: 'reels', n: 1 }, { k: 'video', n: 1 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(c.kmixStart({ title: 'Video teaser' }))), [{ k: 'video', n: 1 }, { k: '', n: 1 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(c.kmixStart({ title: 'Weekly sync', meta: { kind: 'kv' } }))), [{ k: 'kv', n: 1 }, { k: '', n: 1 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(c.kmixStart({ title: 'Weekly sync' }))), [{ k: '', n: 1 }, { k: '', n: 1 }]);
});

test('read-only: a plain list under the Effort line, nothing to change', () => {
  const tk = { id: 'T-1', title: 'Video', meta: { kinds: [{ k: 'video', n: 1 }, { k: 'reels', n: 4 }, { k: 'kv', n: 1 }] } }, c = load({ tasks: { 'T-1': tk }, ed: false });
  c.KMIX.open['T-1'] = 'effort'; c.KMIX.draft['T-1'] = c.kmixStart(tk);
  const h = c.kindMixSlotHtml(tk, false, 'effort');
  assert.match(h, /data-kmix-ro/); assert.doesNotMatch(h, /<button|<input/);
  assert.equal(text(h), 'Several kinds of work:video 1reels or short video 4key visual 1≈ 31 h');
  assert.equal(text(c.kindMixSlotHtml(tk, false, 'panel')), '', 'once: under the Effort line');
  assert.equal(c.kindMixSlotHtml({ id: 'T-2', title: 'Video and reels', meta: {} }, false, 'effort'), '<div class="scr-kmix-slot" data-kmix-slot="effort" data-kmix-task="T-2"></div>', 'no mix, no hint for whoever only reads it');
});

test('the hint: 2 kinds or more in the title, under the Effort line, never on a mix, gone once dismissed for that title\'s kinds', () => {
  const tk = { id: 'T-1', title: 'Youtube podcast: full video and 4 reels', meta: {} }, c = load({ tasks: { 'T-1': tk } });
  let h = c.kindMixSlotHtml(tk, true, 'effort');
  assert.equal(text(h), 'Looks like several kinds: reels or short video, video, Podcast — split?Split');
  assert.match(h, /data-kmix-key="hint:split" onclick="kmixSplit\(&quot;T-1&quot;\)"/);
  assert.match(h, /aria-label="Dismiss"/);
  assert.equal(text(c.kindMixSlotHtml(tk, true, 'panel')), '', 'once, under the Effort line');
  assert.equal(text(c.kindMixSlotHtml({ id: 'T-2', title: 'Video teaser', meta: {} }, true, 'effort')), '', 'one kind: nothing');
  assert.equal(text(c.kindMixSlotHtml({ id: 'T-3', title: 'Full video and reels', meta: { kinds: [{ k: 'video', n: 1 }, { k: 'reels', n: 2 }] } }, true, 'effort')), '', 'a mix already: nothing');
  /* dismissed: for these kinds; another title's kinds bring it back */
  c.KMIX.hide = { 'T-1': 'reels,video,k_pod' };
  assert.equal(c.kindMixSlotHtml(tk, true, 'effort'), '<div class="scr-kmix-slot" data-kmix-slot="effort" data-kmix-task="T-1"></div>');
  tk.title = 'Youtube podcast: full video, 4 reels and a cover';
  assert.match(text(c.kindMixSlotHtml(tk, true, 'effort')), /reels or short video, video, Cover, Podcast/);
  c.UI_LANG = 'id';
  assert.match(text(c.kindMixSlotHtml(tk, true, 'effort')), /^Sepertinya beberapa jenis: reels atau video pendek, video, Sampul, Siniar — bagi\?Bagi$/);
});

test('saved as a task change: a mix replaces the single pick; one kind or Auto ends the mix; the Split is the title\'s kinds once each', async () => {
  const tk = { id: 'T-1', title: 'Full video and 4 reels', meta: { kind: 'feed' } }, c = load({ tasks: { 'T-1': tk } });
  await c.kmixUse('T-1', [{ kind: 'video', count: 1 }, { kind: 'reels', count: 4 }]);
  assert.deepEqual(c.writes.pop(), { kinds: [{ k: 'video', n: 1 }, { k: 'reels', n: 4 }] });
  assert.equal(await c.kmixUse('T-1', [{ kind: 'video', count: 1 }]), false, 'one kind is not a split');
  c.kindPick('T-1', 'kv'); await Promise.resolve();
  assert.deepEqual(c.writes.pop(), { kind: 'kv' });
  tk.meta = { kinds: [{ k: 'video', n: 1 }, { k: 'reels', n: 4 }] };
  c.kindPick('T-1', ''); assert.deepEqual(c.writes.pop(), {}, 'Auto');
  /* the editor's own: saved once it has 2 kinds, and not again when nothing changed */
  c.KMIX.open['T-1'] = 'effort'; c.KMIX.draft['T-1'] = [{ k: 'video', n: 1 }, { k: '', n: 1 }];
  c.kmixSave('T-1'); assert.equal(c.writes.length, 0, 'one kind: nothing saved');
  c.KMIX.draft['T-1'][1].k = 'kv'; c.kmixSave('T-1');
  assert.deepEqual(c.writes.pop(), { kinds: [{ k: 'video', n: 1 }, { k: 'kv', n: 1 }] });
  c.kmixSave('T-1'); assert.equal(c.writes.length, 0, 'the same: nothing to save');
  /* Use one kind: the kind left */
  c.KMIX.draft['T-1'] = [{ k: 'kv', n: 3 }];
  c.document = { querySelectorAll: () => [], querySelector: () => null };
  c.kmixUseOne('T-1'); assert.deepEqual(c.writes.pop(), { kind: 'kv' });
  assert.equal(c.KMIX.open['T-1'], undefined, 'the editor is closed');
});

test('the AI\'s split: shown when it is not the task\'s own, with "Use this split" for whoever may edit the task', () => {
  const tk = { id: 'T-1', title: 'Youtube podcast', meta: {} }, c = load({ tasks: { 'T-1': tk } });
  c.SCR.cache['T-1'] = { rows: {}, audit: [], ai: { rows: { hours: { value: 30, runId: 'r1', mix: [{ kind: 'video', count: 1 }, { kind: 'reels', count: 4 }, { kind: 'kv', count: 1 }] } } } };
  let h = c.scrAiMixHtml(tk);
  assert.equal(text(h), 'The AI suggests: video 1 · reels or short video 4 · key visual 1Use this split');
  assert.match(h, /data-scr-act="ai-mix" data-scr-m="hours" onclick="scrAiMix\(&quot;T-1&quot;\)"/);
  /* the card shows it, for hours only */
  assert.match(c.scrAiCardHtml(tk, 'hours', { edit: true }, false), /data-scr-ai-mix/);
  c.SCR.cache['T-1'].ai.rows.story = { value: 5, runId: 'r1', mix: [{ kind: 'video', count: 1 }, { kind: 'reels', count: 4 }] };
  assert.doesNotMatch(c.scrAiCardHtml(tk, 'story', { edit: true }, false), /data-scr-ai-mix/);
  /* the task has it already (in any order): nothing to offer */
  tk.meta.kinds = [{ k: 'kv', n: 1 }, { k: 'video', n: 1 }, { k: 'reels', n: 4 }];
  assert.equal(c.scrAiMixHtml(tk), '');
  /* another split: offered */
  tk.meta.kinds = [{ k: 'video', n: 1 }, { k: 'reels', n: 2 }];
  assert.match(c.scrAiMixHtml(tk), /Use this split/);
  /* no split, one kind, or kinds that are not the workspace's: nothing */
  c.SCR.cache['T-1'].ai.rows.hours.mix = [];
  assert.equal(c.scrAiMixHtml(tk), '');
  c.SCR.cache['T-1'].ai.rows.hours.mix = [{ kind: 'video', count: 1 }, { kind: 'made_up', count: 2 }];
  assert.equal(c.scrAiMixHtml(tk), '');
  /* read-only: what it suggests, no button; Indonesian */
  c.SCR.cache['T-1'].ai.rows.hours.mix = [{ kind: 'video', count: 1 }, { kind: 'reels', count: 4 }];
  c.canI.editTask = () => false;
  assert.equal(text(c.scrAiMixHtml(tk)), 'The AI suggests: video 1 · reels or short video 4');
  c.canI.editTask = () => true; c.UI_LANG = 'id';
  assert.equal(text(c.scrAiMixHtml(tk)), 'Saran AI: video 1 · reels atau video pendek 4Pakai pembagian ini');
});

test('the rating form and the hours row with a mix: the mix\'s inputs, its deliverables by kind, the server\'s hours when they are for this mix', () => {
  const tk = { id: 'T-1', title: 'Youtube podcast', assetCount: 6, meta: { kinds: [{ k: 'video', n: 1 }, { k: 'reels', n: 4 }] } }, c = load({ tasks: { 'T-1': tk } });
  c.scrCtxKind = () => 'video'; c.scrCtxDeps = () => 0;
  const inp = JSON.parse(JSON.stringify(c.scrHoursInputs(tk, { kind: 'feed', complexity1to5: 4 })));
  assert.deepEqual(inp, { kind: null, units: 6, complexity1to5: 4, openDeps: 0, mix: [{ kind: 'video', units: 1 }, { kind: 'reels', units: 4 }] }, 'no single kind beside the mix');
  assert.equal(c.scrCompute('hours', inp).value, Engine.round2((8 + 16.8) * c.settings.hours.complexity[4]));
  assert.equal(c.scrMixLine(tk), 'Deliverables by kind: video 1 (8 h), reels or short video 4 (17 h)');
  /* the server's hours, for the mix it counted with */
  c.SCR.cache['T-1'] = { rows: {}, audit: [], kinds: [{ k: 'video', n: 1 }, { k: 'reels', n: 4 }], mix: [{ kind: 'video', units: 1, hours: 9 }, { kind: 'reels', units: 4, hours: 18 }] };
  assert.equal(c.scrMixLine(tk), 'Deliverables by kind: video 1 (9 h), reels or short video 4 (18 h)');
  c.SCR.cache['T-1'].kinds = [{ k: 'video', n: 2 }, { k: 'reels', n: 4 }];
  assert.equal(c.scrMixLine(tk), 'Deliverables by kind: video 1 (8 h), reels or short video 4 (17 h)', 'for another mix: the page\'s own');
  /* GET …/scoring's fields are kept */
  c.scrStore('T-1', { kinds: [{ k: 'video', n: 1 }, { k: 'reels', n: 4 }], mix: [{ kind: 'video', units: 1, hours: 9 }] });
  assert.equal(c.SCR.cache['T-1'].mix[0].hours, 9); assert.equal(c.SCR.cache['T-1'].kinds.length, 2);
  c.scrStore('T-1', { rows: { hours: { value: 20, rev: 9, mix: [{ kind: 'video', units: 1, hours: 7 }] } } });
  assert.equal(c.SCR.cache['T-1'].mix[0].hours, 7, 'or with the hours row');
  /* a mix is part of what makes the scores worth asking for again */
  const a = c.scrSig(tk); tk.meta.kinds[1].n = 5; assert.notEqual(c.scrSig(tk), a);
  delete tk.meta.kinds; assert.doesNotMatch(c.scrSig(tk), /mix/, 'no mix: the signature is as it was');
  assert.equal(c.scrMixLine(tk), '');
});

test('every word of the mix has its Indonesian, with the same placeholders', () => {
  const c = load(), K = script('scoring-kinds.js'), P = script('scoring-panel.js');
  const from = K.slice(K.indexOf('several kinds of work in one task'), K.indexOf('/* ---------- the kind of work, a dropdown'));
  const lits = new Set();
  for (const src of [from, K.slice(K.indexOf('function kddValHtml'), K.indexOf('function kddCls')), K.slice(K.indexOf('function kddRows'), K.indexOf('function kddAct'))])
    for (const m of src.matchAll(/\btr\("((?:[^"\\]|\\.)*)"\)/g)) lits.add(JSON.parse('"' + m[1] + '"'));
  for (const m of from.matchAll(/\btr\([^"()]*\?"((?:[^"\\]|\\.)*)":"((?:[^"\\]|\\.)*)"\)\)/g)) { lits.add(m[1]); lits.add(m[2]); }
  for (const m of from.matchAll(/btn\(-?1,'[^']+',"((?:[^"\\]|\\.)*)"/g)) lits.add(m[1]);
  for (const name of ['scrAiMixHtml', 'scrAiMix', 'scrMixLine'])
    for (const m of P.slice(P.indexOf('function ' + name + '('), P.indexOf('\n', P.indexOf('function ' + name + '(') + 200) + 400).matchAll(/\btr\("((?:[^"\\]|\\.)*)"\)/g)) lits.add(JSON.parse('"' + m[1] + '"'));
  ['Several kinds…', 'Mixed', '{n} kinds', 'Use one kind', 'Use one kind: {kind}', 'Add kind', 'Split', 'Dismiss', 'Use this split', 'The AI suggests: {mix}', 'One fewer: {kind}', 'One more: {kind}', 'Up to 8 kinds', 'Every kind is in the mix'].forEach(s => assert.ok(lits.has(s), 'found: ' + s));
  const marks = s => (String(s).match(/\{\w+\}/g) || []).sort().join(' ');
  for (const s of lits) {
    assert.ok(s in c.UI_ID, 'no Indonesian for: ' + s);
    assert.equal(marks(c.UI_ID[s]), marks(s), 'the placeholders of: ' + s);
  }
  assert.equal(c.UI_ID['Several kinds…'], 'Beberapa jenis…'); assert.equal(c.UI_ID['Use this split'], 'Pakai pembagian ini');
  assert.equal(c.UI_ID['Use one kind'], 'Pakai satu jenis'); assert.equal(c.UI_ID['Add kind'], 'Tambah jenis');
});
