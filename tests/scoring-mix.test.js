/* Several kinds of work in one task (Oct 2026; shared/scoring-engine.js hours' mix, mixClean, kindMix, kindPrimary,
   assetPoints' mix, validateAi's mix, inputHash; server/scoring.js meta.kinds, Calculate, the view; server/scoring-ai.js
   the prompt, the reply's mix, the far check; src/effort-estimate.js; docs/SMART-SCORING.md §11.2). The owner's case:
   "Youtube Podcast (Full Video, Clippers Socmed & Cover)" is 1 video + 4 reels + 1 cover (a key visual). As one kind it
   was 8 h (one asset) or 32 h (six assets of video), and a sensible AI answer of 22 h was "far from the math". With the
   split, each kind's own hours for its own count, added up: 8 + 16.8 + 6 = 30.8 h, and 22 h is not far. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const E = require('../shared/scoring-engine');
const S = require('../shared/scoring-settings');
const sz = require('../server/serialize');
const { calculate } = require('../server/scoring');
const AI = require('../server/scoring-ai').pure;
const { setup, reply } = require('./scoring-ai-harness');

const D = E.defaults();
const POD = [{ kind: 'video', units: 1 }, { kind: 'reels', units: 4 }, { kind: 'kv', units: 1 }];
const POD_META = [{ k: 'video', n: 1 }, { k: 'reels', n: 4 }, { k: 'kv', n: 1 }];
const TITLE = 'Youtube Podcast (Full Video, Clippers Socmed & Cover)';

/* ---------- the engine ---------- */
test('hours with a mix: each kind its own hours for its own count, added up, then complexity and dependencies once — the podcast by hand', () => {
  /* the workspace's default templates: video 8 h (4–16), each next 60%; reels 6 h (4–10), each next 60%; kv 6 h (4–10), 50% */
  const r = E.hours(D.hours, { mix: POD });
  /* video 8 × 1 = 8; reels 6 × (1 + 0.6 × 3) = 6 × 2.8 = 16.8; kv 6 × 1 = 6 → 30.8 h */
  assert.equal(r.value, 30.8); assert.equal(r.reason, null); assert.equal(r.bounded, false);
  /* low 4 + 4 × 2.8 + 4 = 19.2; high 16 + 10 × 2.8 + 10 = 54 */
  assert.equal(r.low, 19.2); assert.equal(r.high, 54);
  assert.deepEqual(r.mix.map(x => [x.kind, x.units, x.unitsFactor, x.value, x.low, x.high]), [['video', 1, 1, 8, 4, 16], ['reels', 4, 2.8, 16.8, 11.2, 28], ['kv', 1, 1, 6, 4, 10]]);
  assert.deepEqual([r.inputs.kind, r.inputs.units, r.inputs.perUnit], ['reels', 6, null], 'the primary kind (the most hours) and all the deliverables');
  assert.deepEqual(r.inputs.mix, POD);
  assert.deepEqual(r.explanation, [
    '"video": one deliverable, 8 h.',
    '"reels": 4 deliverables, 6 h for the first and each next one at 60%: 16.8 h.',
    '"kv": one deliverable, 6 h.',
    'All the kinds of work together: 8 + 16.8 + 6 = 30.8 h.',
    'Complexity not rated, taken as 3 of 5: ×1.',
    'No open dependencies: ×1.',
    '30.8 × 1 × 1 = 30.8 h.',
    'The usual range for this work: 19.2–54 h.'
  ], 'one step per kind, then the total');
  /* complexity 4 (×1.25) and one open dependency (×1.1), once over the whole: 30.8 × 1.25 × 1.1 = 42.35 */
  const hard = E.hours(D.hours, { mix: POD, complexity1to5: 4, openDeps: 1 });
  assert.equal(hard.value, 42.35); assert.equal(hard.low, 26.4); assert.equal(hard.high, 74.25);
  assert.deepEqual(hard.mix.map(x => x.value), [11, 23.1, 8.25], 'each kind through the same factors');
  /* the same deliverables as one kind: too low as one asset, too high as six videos */
  assert.equal(E.hours(D.hours, { kind: 'video', units: 1 }).value, 8);
  assert.equal(E.hours(D.hours, { kind: 'video', units: 6 }).value, 32);
  /* a kind made as one piece, and the {k, n} of meta.kinds read the same */
  const whole = E.hours({ templates: { a: { perUnit: 4, low: 3, high: 6, nextUnitFactor: 0 }, b: { perUnit: 1, low: 0.5, high: 2, nextUnitFactor: 0.5 } } }, { mix: [{ k: 'a', n: 3 }, { k: 'b', n: 2 }] });
  assert.equal(whole.value, 5.5); assert.match(whole.explanation[0], /"a": 3 deliverables made as one piece of work, 4 h\./);
});

test('hours with a mix stay within the bounds, a kind with no template adds nothing, none at all is no estimate', () => {
  const big = E.hours(D.hours, { mix: [{ kind: 'video', units: 20 }, { kind: 'web', units: 5 }], complexity1to5: 5, openDeps: 3 });
  assert.equal(big.value, 80); assert.equal(big.bounded, true); assert.match(big.explanation.join(' '), /Capped at the maximum of 80 h\./);
  assert.ok(big.high <= 80 && big.low <= 80, 'the range too');
  const tiny = E.hours({ templates: { a: { perUnit: 0.05, low: 0.05, high: 0.1, nextUnitFactor: 0.5 }, b: { perUnit: 0.05, low: 0.05, high: 0.1 } }, bounds: { min: 0.25, max: 80 } }, { mix: [{ kind: 'a', units: 1 }, { kind: 'b', units: 1 }] });
  assert.equal(tiny.value, 0.25); assert.equal(tiny.bounded, true); assert.match(tiny.explanation.join(' '), /Raised to the minimum of 0\.25 h\./);
  const some = E.hours(D.hours, { mix: [{ kind: 'video', units: 1 }, { kind: 'k_new', units: 3 }] });
  assert.equal(some.value, 8, 'a kind with no template adds no hours'); assert.match(some.explanation[1], /"k_new": there is no template for it, so its 3 deliverables add no hours\./);
  assert.deepEqual([some.mix[1].value, some.low, some.high], [null, 4, 16]);
  const none = E.hours(D.hours, { mix: [{ kind: 'x1', units: 1 }, { kind: 'x2', units: 2 }] });
  assert.deepEqual([none.value, none.reason, none.low], [null, 'no_template', null]);
  assert.match(none.explanation.join(' '), /None of these kinds of work has a template/);
  /* counts within 1–500, the same kind twice added together, at most 8 kinds */
  assert.deepEqual(E.hours(D.hours, { mix: [{ kind: 'feed', units: 2 }, { kind: 'feed', units: 3 }, { kind: 'story', units: 1 }] }).inputs.mix, [{ kind: 'feed', units: 5 }, { kind: 'story', units: 1 }]);
  assert.equal(E.hours(D.hours, { mix: E.KIND_IDS.map(k => ({ kind: k, units: 1 })) }).inputs.mix.length, 8);
  assert.equal(E.hours(D.hours, { mix: [{ kind: 'feed', units: 9000 }, { kind: 'story', units: 0 }] }).inputs.mix[0].units, 500);
  /* every step is a known sentence, filled */
  const known = new Set(Object.values(E.SENTENCES));
  for (const r of [E.hours(D.hours, { mix: POD, complexity1to5: 2, openDeps: 2 }), big, tiny, some, none]) r.steps.forEach((s, i) => { assert.ok(known.has(s.key), s.key); assert.equal(r.explanation[i], E.fill(s.key, s.vars)); assert.doesNotMatch(r.explanation[i], /\{\w+\}/); });
});

test('a mix of one kind is exactly that kind without a mix: hours and asset points', () => {
  for (const kind of Object.keys(D.hours.templates)) for (let units = 1; units <= 6; units++) for (const [c, d] of [[3, 0], [4, 1], [1, 3]]) {
    const one = E.hours(D.hours, { mix: [{ kind, units }], complexity1to5: c, openDeps: d });
    assert.deepEqual(one, E.hours(D.hours, { kind, units, complexity1to5: c, openDeps: d }), kind + ' × ' + units);
    assert.equal(one.mix, undefined, 'no mix in the answer');
  }
  assert.deepEqual(E.hours(D.hours, { mix: [{ k: 'logo', n: 2 }] }), E.hours(D.hours, { kind: 'logo', units: 2 }), 'meta.kinds\' shape too');
  assert.deepEqual(E.hours(D.hours, { kind: 'feed', units: 3, mix: [] }), E.hours(D.hours, { kind: 'feed', units: 3 }), 'an empty mix is none');
  for (const kind of E.KIND_IDS) assert.deepEqual(E.assetPoints(D.assets, { kind: 'feed', mix: [{ kind, units: 3 }], split: { a: 2, b: 1 } }), E.assetPoints(D.assets, { kind, split: { a: 2, b: 1 } }), kind);
});

test('the primary kind is the one with the most hours; kindPick and kindOfTask give it for a task with a mix', () => {
  assert.equal(E.kindPrimary(POD), 'reels', '16.8 h of reels beat 8 h of video');
  assert.equal(E.kindPrimary([{ kind: 'video', units: 2 }, { kind: 'reels', units: 1 }]), 'video');
  assert.equal(E.kindPrimary([{ kind: 'kv', units: 1 }, { kind: 'reels', units: 1 }]), 'kv', 'equal hours: the first');
  assert.equal(E.kindPrimary([{ kind: 'x1', units: 1 }, { kind: 'x2', units: 3 }]), 'x2', 'no hours at all: the most deliverables');
  assert.equal(E.kindPrimary([{ kind: 'x1', units: 9 }, { kind: 'feed', units: 1 }]), 'feed', 'a kind with hours beats one without');
  assert.equal(E.kindPrimary(null), null); assert.equal(E.kindPrimary([]), null);
  const task = { title: 'Feed post Monday', meta: { kind: 'logo', kinds: POD_META } };
  assert.equal(E.kindPick(task), 'reels', 'the mix takes the place of meta.kind');
  assert.equal(E.kindOfTask(task), 'reels');
  /* the workspace's own hours decide (as the hours or the whole settings) */
  const s = S.normalizeSettings({ hours: { templates: { video: { perUnit: 30 } } } });
  assert.equal(E.kindOfTask(task, s), 'video', 'the whole settings: its hours');
  assert.equal(E.kindOfTask(task, s.kinds, s.hours), 'video', 'the kinds and the hours apart');
  assert.equal(E.kindOfTask(task, s.kinds), 'reels', 'the kinds alone: the default hours');
  /* a mix that is not one (fewer than 2 active kinds): meta.kind, else the title */
  const off = S.normalizeSettings({ kinds: S.defaults().kinds.map(k => (k.id === 'reels' || k.id === 'kv' ? Object.assign({}, k, { active: false }) : k)) });
  assert.equal(E.kindMix(task, off), null, 'only video is left'); assert.equal(E.kindOfTask(task, off), 'logo');
  assert.equal(E.kindOfTask({ title: 'Feed post', meta: { kinds: [{ k: 'video', n: 1 }] } }), 'feed', 'one kind is no mix: the title');
  assert.deepEqual(E.kindMix({ meta: { kinds: POD_META } }), POD);
  assert.equal(E.kindMix({ meta: {} }), null); assert.equal(E.kindMix(null), null);
  assert.deepEqual(E.MIX_LIMITS, { min: 2, max: 8, units: 500 });
});

test('kindMatches: every active kind a title names, in the list\'s order (the panel\'s "several kinds?" hint)', () => {
  assert.deepEqual(E.kindMatches('Video teaser, 3 reels and a key visual'), [{ id: 'reels', keyword: 'reels' }, { id: 'video', keyword: 'video*' }, { id: 'kv', keyword: 'key visual*' }]);
  assert.deepEqual(E.kindMatches('Video teaser, 3 reels and a key visual')[0].id, E.kindMatch('Video teaser, 3 reels and a key visual').id, 'the first is kindMatch\'s');
  assert.deepEqual(E.kindMatches('Logo concept').map(x => x.id), ['logo']);
  assert.deepEqual(E.kindMatches('Something else'), []); assert.deepEqual(E.kindMatches(''), []); assert.deepEqual(E.kindMatches(null), []);
  const off = S.normalizeSettings({ kinds: S.defaults().kinds.map(k => (k.id === 'reels' ? Object.assign({}, k, { active: false }) : k)) });
  assert.deepEqual(E.kindMatches('Video teaser, 3 reels and a key visual', off).map(x => x.id), ['video', 'kv'], 'a switched-off kind is never found');
});

test('mixClean: the shapes it reads, what it drops, merges, clamps and cuts', () => {
  assert.deepEqual(E.mixClean([{ k: 'video', n: 1 }, { kind: 'reels', units: '4' }, { kind: 'kv', count: 1.4 }]), POD, '{k, n}, {kind, units} and {kind, count}');
  const problems = [];
  const m = E.mixClean([{ k: 'video', n: 0 }, { k: 'video', n: 2 }, { k: 'made_up', n: 1 }, { k: '<b>', n: 1 }, 'x', { k: 'feed' }, { k: 'reels', n: 600 }], S.defaults().kinds, problems);
  assert.deepEqual(m, [{ kind: 'video', units: 3 }, { kind: 'reels', units: 500 }]);
  assert.deepEqual(problems.map(p => p.code).sort(), ['clamped', 'clamped', 'count', 'kind', 'kind', 'kind', 'merged']);
  assert.equal(E.mixClean('video', null), null); assert.equal(E.mixClean([], null), null); assert.equal(E.mixClean([{ k: 'x', n: 'many' }], null), null);
  const nine = E.mixClean(E.KIND_IDS.slice(0, 9).map(k => ({ k, n: 1 })), null, problems);
  assert.equal(nine.length, 8); assert.equal(problems[problems.length - 1].code, 'cut');
});

test('asset points with a mix: each kind its own count when as many were produced as planned, else in proportion', () => {
  /* video 4, reels 3, kv 3 points per asset: 1 × 4 + 4 × 3 + 1 × 3 = 19 points for the 6 planned */
  const eq = E.assetPoints(D.assets, { kind: 'reels', mix: POD, split: { a: 2, b: 4 } });
  assert.deepEqual([eq.total, eq.totalAssets, eq.pointsPerAsset, eq.mixRule, eq.kind], [19, 6, 3.17, 'equal', 'reels']);
  assert.deepEqual(eq.mix, [{ kind: 'video', planned: 1, credited: 1, per: 4, points: 4 }, { kind: 'reels', planned: 4, credited: 4, per: 3, points: 12 }, { kind: 'kv', planned: 1, credited: 1, per: 3, points: 3 }]);
  assert.deepEqual([eq.perPerson.a.points, eq.perPerson.b.points], [6.33, 12.67], 'each person\'s share of the assets at the split\'s worth, not 3.17 × count');
  assert.match(eq.explanation.join(' '), /The 6 assets produced are the 6 planned, so each kind of work counts its own\..*Kind of work "reels": 4 × 3\.00 = 12\.00 points\..*a: 2 of the 6 assets = 6\.33 points\./);
  /* five produced of the six planned: 5 × 19 ÷ 6 = 15.83 */
  const pr = E.assetPoints(D.assets, { kind: 'reels', mix: POD, split: { a: 5 } });
  assert.deepEqual([pr.total, pr.mixRule], [15.83, 'proportional']);
  assert.deepEqual(pr.mix.map(x => [x.kind, E.round2(x.credited)]), [['video', 0.83], ['reels', 3.33], ['kv', 0.83]]);
  assert.match(pr.explanation[0], /The 5 assets produced are shared over the kinds of work in proportion to the 6 planned\./);
  /* twelve produced: twice the plan */
  assert.equal(E.assetPoints(D.assets, { mix: POD, split: { a: 12 } }).total, 38);
  /* the validation and the person split are as without a mix */
  const strict = Object.assign({}, D.assets, { countUnvalidated: false });
  const held = E.assetPoints(strict, { mix: POD, split: { a: 2, b: 4 } });
  assert.deepEqual([held.total, held.perPerson.a.counted], [0, 0], 'not validated: nothing yet');
  const ok = E.assetPoints(strict, { mix: POD, split: { a: 2, b: 4 }, validated: { by: 'lead', split: { a: 2, b: 4 }, total: 6 } });
  assert.equal(ok.total, 19); assert.equal(ok.perPerson.a.validated, true);
  const changed = E.assetPoints(strict, { mix: POD, split: { a: 3, b: 4 }, validated: { by: 'lead', split: { a: 2, b: 4 }, total: 6 } });
  assert.equal(changed.perPerson.a.counted, 2, 'changed since: at most what was validated');
  /* the workspace's own points per kind; a kind not known */
  assert.equal(E.assetPoints({ perKind: { video: 8, reels: 2, kv: 2 } }, { mix: POD, split: { a: 6 } }).total, 18);
  assert.equal(E.assetPoints({ unknownKind: 1 }, { mix: [{ kind: 'x1', units: 1 }, { kind: 'video', units: 1 }], split: { a: 2 } }).total, 5);
  const none = E.assetPoints(D.assets, { mix: POD, split: {} });
  assert.deepEqual([none.total, none.reason, none.mixRule, none.pointsPerAsset], [0, 'no_assets', null, 3.17]);
  const known = new Set(Object.values(E.SENTENCES));
  for (const r of [eq, pr, held, ok, changed, none]) r.steps.forEach(s => assert.ok(known.has(s.key), s.key));
});

test('validateAi keeps the mix the AI proposes: active kinds, counts 1–500, the same kind added together, at most 8', () => {
  const v = E.validateAi({ hours: 22, mix: [{ kind: 'video', count: 1 }, { kind: 'reels', count: '4' }, { kind: 'kv', count: 1 }] }, D);
  assert.deepEqual(v.value.mix, [{ kind: 'video', count: 1 }, { kind: 'reels', count: 4 }, { kind: 'kv', count: 1 }]);
  assert.deepEqual(v.errors, [], 'mix is a key of the reply, not an unknown one');
  const odd = E.validateAi({ hours: 22, mix: [{ kind: 'video', count: 1 }, { kind: 'video', count: 2 }, { kind: 'made_up', count: 1 }, { kind: 'reels', count: 900 }, { kind: 'kv' }] }, D);
  assert.deepEqual(odd.value.mix, [{ kind: 'video', count: 3 }, { kind: 'reels', count: 500 }]);
  assert.equal(odd.errors.length, 4, odd.errors.join(' | '));
  const s = S.normalizeSettings({ kinds: S.defaults().kinds.map(k => (k.id === 'kv' ? Object.assign({}, k, { active: false }) : k)) });
  assert.deepEqual(E.validateAi({ hours: 22, mix: [{ kind: 'video', count: 1 }, { kind: 'kv', count: 1 }, { kind: 'reels', count: 4 }] }, s).value.mix, [{ kind: 'video', count: 1 }, { kind: 'reels', count: 4 }], 'a switched-off kind is not one');
  const one = E.validateAi({ hours: 22, mix: [{ kind: 'video', count: 1 }, { kind: 'kv', count: 1 }] }, s);
  assert.equal(one.value.mix, undefined, 'one kind left is no split'); assert.match(one.errors.join(' '), /at least two kinds/);
  assert.equal(E.validateAi({ hours: 22, mix: [] }, D).value.mix, undefined, '[]: work of one kind');
  assert.deepEqual(E.validateAi({ hours: 22, mix: [] }, D).errors, []);
  assert.match(E.validateAi({ hours: 22, mix: 'video' }, D).errors.join(' '), /mix must be a list/);
  assert.equal(E.validateAi({ hours: 22, mix: E.KIND_IDS.map(k => ({ kind: k, count: 1 })) }, D).value.mix.length, 8);
  assert.equal(E.validateAi({ mix: POD.map(x => ({ kind: x.kind, count: x.units })) }, D).ok, false, 'a split alone is no estimate');
});

test('the input hash has the mix (in kind order) and only when there is one', () => {
  const t = { title: TITLE, labels: [], assetCount: 6 };
  const h = E.inputHash(t), m = E.inputHash(Object.assign({}, t, { mix: POD }));
  assert.equal(E.inputHash(Object.assign({}, t, { mix: null })), h, 'no mix: the hash it always was');
  assert.equal(E.inputHash(Object.assign({}, t, { mix: [] })), h);
  assert.notEqual(m, h, 'a mix is part of what the AI is told');
  assert.equal(E.inputHash(Object.assign({}, t, { mix: POD.slice().reverse() })), m, 'in kind order');
  assert.equal(E.inputHash(Object.assign({}, t, { mix: POD_META })), m, 'meta.kinds\' shape too');
  assert.notEqual(E.inputHash(Object.assign({}, t, { mix: [{ kind: 'video', units: 1 }, { kind: 'reels', units: 3 }, { kind: 'kv', units: 1 }] })), m, 'another count');
  assert.notEqual(E.inputHash(Object.assign({}, t, { mix: POD.slice(0, 2) })), m, 'another kind');
});

/* ---------- the AI's prompt and the far check, pure ---------- */
test('the prompt lists the deliverables by kind only when the task has a mix, and asks for the reply\'s mix', () => {
  const s = S.normalizeSettings({ enabled: true });
  const input = { title: TITLE, kind: 'reels', kindPicked: true, assetCount: 6, labels: [], briefFields: [], description: '', mix: POD };
  const p = AI.buildPrompt(input, [], s, 'en').user;
  assert.match(p, /\nDeliverables by kind: video 1, reels \(reels or short video\) 4, kv \(key visual\) 1\n/);
  assert.match(p, /Kind of work chosen on the task: reels \(the kind with the most hours of the several below\)/);
  assert.match(p, /The team set the task's deliverables by kind: estimate the hours of all of them together/);
  assert.match(p, /"mix": \[\{"kind": "<one of the kinds above>", "count": <whole number>\}\]/, 'the reply format');
  assert.match(p, /count each kind's pieces apart, estimate them all together and give the split in mix; work of one kind has mix \[\]/, 'the deliverables guidance mentions the split');
  assert.ok(p.indexOf('Deliverables by kind') < p.indexOf('</task>'), 'inside the task, as data');
  const without = AI.buildPrompt(Object.assign({}, input, { mix: null, kindPicked: false, kind: 'video' }), [], s, 'en').user;
  assert.doesNotMatch(without, /Deliverables by kind|The team set the task's deliverables|of the several below/);
  assert.match(without, /"mix": \[/, 'the reply may still propose a split');
  assert.equal(AI.mixLine(POD.slice(0, 1), s.kinds), '', 'one kind is no split');
  assert.equal(AI.PROMPT_VERSION, 3);
});

test('far from the math: 22 h is far from the 8 h of one video and not from the 30.8 h of the split', () => {
  assert.deepEqual(AI.farFrom('hours', 22, 8), { far: true, ratio: 2.75 });
  assert.deepEqual(AI.farFrom('hours', 22, E.hours(D.hours, { mix: POD }).value), { far: false, ratio: 0.71 });
  assert.equal(AI.farFrom('hours', 22, 32).far, false, 'six videos: too high, but not far either');
  assert.equal(AI.shownConfidence(0.8, true), 0.48, 'far: lowered ×0.6');
});

/* ---------- Calculate (pure) ---------- */
test('Calculate uses the task\'s mix, a mix given, or one kind given instead', () => {
  const s = S.normalizeSettings({ enabled: true });
  const hours = (task, inputs) => calculate(s, task, { module: 'hours', inputs }, { openDeps: 0 });
  const r = hours({ title: TITLE, assetCount: 6, meta: { kinds: POD_META } });
  assert.deepEqual([r.value, r.final, r.low, r.high], [30.8, 31, 19.2, 54], 'to the half hour for the task');
  assert.deepEqual([r.inputs.kind, r.inputs.kindSource, r.inputs.units, r.inputs.unitsSource, r.inputs.mixSource], ['reels', 'mix', 6, 'mix', 'task']);
  assert.deepEqual(r.inputs.mix, [{ kind: 'video', units: 1, value: 8, low: 4, high: 16 }, { kind: 'reels', units: 4, value: 16.8, low: 11.2, high: 28 }, { kind: 'kv', units: 1, value: 6, low: 4, high: 10 }]);
  assert.equal(r.steps.length, 8);
  /* inputs.units is not used with a mix; one kind given calculates it instead */
  assert.equal(hours({ title: TITLE, assetCount: 6, meta: { kinds: POD_META } }, { units: 2 }).value, 30.8);
  const v = hours({ title: TITLE, assetCount: 1, meta: { kinds: POD_META } }, { kind: 'video' });
  assert.deepEqual([v.value, v.inputs.kindSource, v.inputs.mix], [8, 'given', undefined]);
  /* a split given (a preview), [] for none, one kind of it is that kind */
  const g = hours({ title: TITLE, assetCount: 1 }, { mix: [{ kind: 'video', units: 1 }, { kind: 'reels', units: 2 }] });
  assert.deepEqual([g.value, g.inputs.mixSource, g.inputs.kind], [17.6, 'given', 'reels'], '8 + 6 × 1.6');
  const none = hours({ title: TITLE, assetCount: 3, meta: { kinds: POD_META } }, { mix: [] });
  assert.deepEqual([none.value, none.inputs.kind, none.inputs.kindSource, none.inputs.mix], [13.2, 'reels', 'picked', undefined], 'the primary kind with the task\'s asset count: 6 × 2.2');
  const one = hours({ title: 'x', assetCount: 1 }, { mix: [{ kind: 'logo', units: 2 }] });
  assert.deepEqual([one.value, one.inputs.kind, one.inputs.kindSource, one.inputs.units, one.inputs.unitsSource], [14, 'logo', 'given', 2, 'given']);
  assert.throws(() => hours({ title: 'x' }, { mix: [{ kind: 'made_up', units: 1 }, { kind: 'video', units: 1 }] }), /Unknown kind of work: made_up/);
  assert.throws(() => hours({ title: 'x' }, { mix: [{ kind: 'video', units: 0 }, { kind: 'kv', units: 1 }] }), /a whole number from 1 to 500/);
  assert.throws(() => hours({ title: 'x' }, { mix: [{ kind: 'video', units: 501 }, { kind: 'kv', units: 1 }] }), /a whole number from 1 to 500/);
  assert.throws(() => hours({ title: 'x' }, { mix: 'video' }), /A split of the work is a list/);
  assert.throws(() => hours({ title: 'x' }, { mix: E.KIND_IDS.map(k => ({ kind: k, units: 1 })) }), /at most 8 kinds/);
  /* one kind of the task, as before: no mix in the answer */
  const plain = hours({ title: 'Feed post Ramadan', assetCount: 5 });
  assert.deepEqual(Object.keys(plain.inputs), ['kind', 'kindSource', 'units', 'unitsSource', 'assetCount', 'complexity', 'complexitySource', 'openDeps']);
});

/* ---------- the server, in process (tests/scoring-ai-harness.js: the demo seed, the stand-in model) ---------- */
test('the server cleans meta.kinds on create, save and restore: active kinds, counts within 1–500, each kind once, 2 to 8 or none', async () => {
  const k = setup();
  await k.set(x => { x.kinds.find(y => y.id === 'kv').active = false; });
  const T = k.task({ title: TITLE, assetCount: 6 });
  const cur = sz.readTask(k.db, T);
  const clean = (fn, kinds) => { const b = JSON.parse(JSON.stringify(cur)); b.meta = Object.assign({}, b.meta, { kinds }); fn(b); return b.meta.kinds; };
  const write = kinds => clean(b => k.scoring.guardTaskWrite(k.admin, cur, b), kinds), create = kinds => clean(b => k.scoring.guardNewTask(k.admin, b), kinds), restore = kinds => clean(b => k.scoring.guardRestore(k.admin, cur, b), kinds);
  for (const fn of [write, create, restore]) {
    assert.deepEqual(fn([{ k: 'video', n: 1 }, { k: 'reels', n: 4 }]), [{ k: 'video', n: 1 }, { k: 'reels', n: 4 }]);
    assert.deepEqual(fn([{ k: 'video', n: 1 }, { k: 'reels', n: 4 }, { k: 'kv', n: 1 }, { k: 'made_up', n: 2 }, { k: '<script>', n: 1 }]), [{ k: 'video', n: 1 }, { k: 'reels', n: 4 }], 'an unknown or switched-off kind is dropped');
    assert.deepEqual(fn([{ k: 'video', n: 0 }, { k: 'reels', n: 2.6 }, { k: 'feed', n: 9999 }, { k: 'story' }]), [{ k: 'video', n: 1 }, { k: 'reels', n: 3 }, { k: 'feed', n: 500 }], 'counts kept within 1–500; no count, dropped');
    assert.deepEqual(fn([{ k: 'video', n: 1 }, { k: 'reels', n: 2 }, { k: 'reels', n: 2 }]), [{ k: 'video', n: 1 }, { k: 'reels', n: 4 }], 'each kind once');
    assert.equal(fn([{ k: 'video', n: 1 }, { k: 'kv', n: 1 }]), undefined, 'fewer than 2 kinds left: the mix goes');
    assert.equal(fn('video,reels'), undefined); assert.equal(fn([]), undefined); assert.equal(fn(null), undefined);
    assert.equal(fn(E.KIND_IDS.map(id => ({ k: id, n: 1 }))).length, 8, 'at most 8 kinds');
  }
  /* a save that does not send meta.kinds leaves it alone (the merge keeps the stored one) */
  const b = JSON.parse(JSON.stringify(cur)); delete b.meta.kinds; k.scoring.guardTaskWrite(k.admin, cur, b); assert.equal('kinds' in b.meta, false);
});

test('the server: a task with a mix — Calculate, the view, the AI\'s suggestion carrying its mix, taking it, and the far check against the split', async () => {
  const k = setup(); await k.on();
  const T = k.task({ title: TITLE, assetCount: 6, meta: { kinds: POD_META } });
  const c = await k.calc(T, { module: 'hours' });
  assert.deepEqual([c.result.value, c.result.final, c.result.finalSet, c.result.inputs.kindSource, c.result.inputs.mixSource], [30.8, 31, true, 'mix', 'task']);
  assert.equal(sz.readTask(k.db, T).effort, 31, 'the task\'s estimate, to the half hour');
  assert.deepEqual(sz.readTask(k.db, T).meta.effortAuto.mix, POD_META, 'its mark says the split');
  /* the view: the cleaned split, the primary kind, each kind's hours on the hours row */
  const v = await k.view(T);
  assert.deepEqual(v.kinds, POD_META); assert.deepEqual(v.context.kinds, POD_META);
  assert.deepEqual([v.context.kind, v.context.kindPicked], ['reels', true]);
  assert.deepEqual(v.rows.hours.mix, [{ kind: 'video', units: 1, value: 8, low: 4, high: 16 }, { kind: 'reels', units: 4, value: 16.8, low: 11.2, high: 28 }, { kind: 'kv', units: 1, value: 6, low: 4, high: 10 }]);
  assert.equal(v.rows.story, null);
  /* the AI is told the split and proposes one; 22 h is near the 30.8 h of all of it */
  k.model = () => reply({ kind: 'reels', deliverables: 6, mix: [{ kind: 'video', count: 1 }, { kind: 'reels', count: 4 }, { kind: 'kv', count: 1 }], hours: 22, confidence: 0.8 });
  const a = await k.ask(T);
  assert.equal(a.aiResult.status, 'ok');
  assert.match(k.calls[0].prompt.user, /Deliverables by kind: video 1, reels \(reels or short video\) 4, kv \(key visual\) 1/);
  assert.deepEqual(a.aiResult.suggestion.mix, [{ kind: 'video', count: 1 }, { kind: 'reels', count: 4 }, { kind: 'kv', count: 1 }]);
  assert.deepEqual(a.aiResult.math.hours.mix, POD, 'the run says which split its math was for');
  const sug = a.ai.rows.hours;
  assert.deepEqual(sug.mix, [{ kind: 'video', count: 1 }, { kind: 'reels', count: 4 }, { kind: 'kv', count: 1 }], 'the stored suggestion carries its mix, for "Use this split"');
  assert.deepEqual([sug.value, sug.math, sug.mathSource, sug.far, sug.shownConfidence, sug.stale], [22, 30.8, 'score', false, 0.8, false]);
  assert.ok(!sug.warnings.some(w => w.code === 'far'));
  const runs = k.runs(T); assert.equal(runs[runs.length - 1].prompt_version, 3);
  /* taken, as any suggestion */
  const put = await k.put(T, 'hours', { use: 'ai', reason: 'Clips are cut from the full video', rev: a.rows.hours.rev });
  assert.equal(put.applied, true); assert.equal(sz.readTask(k.db, T).effort, 22);
  /* another split is another task for the AI: the suggestion is stale */
  k.edit(T, { meta: Object.assign({}, sz.readTask(k.db, T).meta, { kinds: [{ k: 'video', n: 1 }, { k: 'reels', n: 6 }, { k: 'kv', n: 1 }] }) });
  assert.equal((await k.view(T)).ai.rows.hours.stale, true);
});

test('the far check: against the split\'s calculation when the score was calculated before the split was set', async () => {
  const k = setup(); await k.on();
  k.model = () => reply({ kind: 'video', deliverables: 6, mix: [], hours: 22, confidence: 0.8 });
  /* one kind, one asset: 8 h, and 22 h is far */
  const one = k.task({ title: TITLE, assetCount: 1, meta: { kind: 'video' } });
  await k.calc(one, { module: 'hours' });
  const far = (await k.ask(one)).ai.rows.hours;
  assert.deepEqual([far.math, far.far, far.shownConfidence], [8, true, 0.48]);
  assert.equal(far.mix.length, 0, 'the AI proposed no split');
  /* the same, then the split set: the run's calculation (with the split) is the baseline, not the stale 8 h */
  const T = k.task({ title: TITLE + ' 2', assetCount: 1, meta: { kind: 'video' } });
  await k.calc(T, { module: 'hours' });
  k.edit(T, { meta: { kind: 'video', kinds: POD_META } });
  const a = await k.ask(T), s = a.ai.rows.hours;
  assert.deepEqual([s.math, s.mathSource, s.far, s.shownConfidence], [30.8, 'calculation', false, 0.8]);
  assert.equal(k.db.prepare("SELECT meta FROM scoring_audit WHERE task_id=? AND action='ai_suggested' ORDER BY rowid DESC").get(T).meta.includes('"far":false'), true, 'stored as not far');
  /* calculated again with the split: the score's own math */
  await k.calc(T, { module: 'hours' });
  const again = (await k.view(T)).ai.rows.hours;
  assert.deepEqual([again.math, again.mathSource, again.far], [30.8, 'score', false]);
});

test('the server: a lock remembers the split (another split needs a new baseline), and a removed kind leaves the splits', async () => {
  const k = setup(); await k.on();
  const T = k.task({ title: TITLE, assetCount: 6, meta: { kinds: POD_META } });
  await k.calc(T, { module: 'hours' });
  const ap = await k.approve(T, 'hours', { rev: (await k.view(T)).rows.hours.rev });
  assert.equal(ap.rows.hours.status, 'approved'); assert.equal(ap.rows.hours.scope.kinds, 'kv:1,reels:4,video:1');
  const meta = () => sz.readTask(k.db, T).meta;
  k.edit(T, { meta: Object.assign({}, meta(), { kinds: [{ k: 'video', n: 1 }, { k: 'reels', n: 2 }, { k: 'kv', n: 1 }] }) });
  let v = await k.view(T);
  assert.equal(v.rows.hours.status, 'rebaseline_needed');
  assert.deepEqual(v.audit.find(x => x.action === 'scope_changed').meta.what, ['kinds']);
  k.edit(T, { meta: Object.assign({}, meta(), { kinds: POD_META }) });
  assert.equal((await k.view(T)).rows.hours.status, 'approved', 'the split put back');
  /* a lock taken before any split compares as it always did */
  const L = k.task({ title: 'Feed post Ramadan', assetCount: 5 });
  await k.calc(L, { module: 'hours' }); await k.approve(L, 'hours', { rev: (await k.view(L)).rows.hours.rev });
  assert.equal((await k.view(L)).rows.hours.scope.kinds, undefined);
  k.edit(L, { title: 'Feed post Ramadan!' }); assert.equal((await k.view(L)).rows.hours.status, 'approved');
  /* a kind of the workspace's own, in two splits, removed */
  const set = await k.set(x => { x.kinds.push({ id: 'k_pod', name: 'Podcast', keywords: ['podcast'] }); x.hours.templates.k_pod = { perUnit: 3 }; });
  const pod = set.settings.kinds.find(x => x.name === 'Podcast').id;
  const A = k.task({ title: 'Podcast eps 1', assetCount: 3, meta: { kinds: [{ k: pod, n: 1 }, { k: 'reels', n: 1 }, { k: 'kv', n: 1 }] } });
  const B = k.task({ title: 'Podcast eps 2', assetCount: 2, meta: { kind: 'video', kinds: [{ k: pod, n: 1 }, { k: 'reels', n: 1 }] } });
  assert.equal(k.scoring.kindOfTask(sz.readTask(k.db, A)), 'reels', 'the workspace\'s hours: 3 h of podcast, 6 h each of reels and kv — the first of those');
  assert.equal(k.scoring.kindOfTask({ title: 'x', meta: { kinds: [{ k: pod, n: 3 }, { k: 'reels', n: 1 }] } }), pod, '3 podcasts, 3 × (1 + 0.5 × 2) = 6 h, before 6 h of reels');
  /* the view's kind is the primary one by the workspace's own hours (the defaults know no podcast) */
  const C = k.task({ title: 'Podcast eps 3', assetCount: 4, meta: { kinds: [{ k: pod, n: 3 }, { k: 'reels', n: 1 }] } });
  const cv = await k.view(C);
  assert.deepEqual([cv.context.kind, cv.context.kindPicked], [pod, true]);
  assert.equal((await k.calc(C, { module: 'hours' })).result.inputs.kind, pod);
  await k.set(x => { x.kinds = x.kinds.filter(y => y.id !== pod); });
  assert.deepEqual(sz.readTask(k.db, A).meta.kinds, [{ k: 'reels', n: 1 }, { k: 'kv', n: 1 }], 'two kinds left: the split stays');
  assert.equal(sz.readTask(k.db, B).meta.kinds, undefined, 'one left: the split goes'); assert.equal(sz.readTask(k.db, B).meta.kind, 'video');
  const fb = k.db.prepare("SELECT meta FROM scoring_audit WHERE task_id=? AND action='kind_fallback'").get(B);
  assert.deepEqual(JSON.parse(fb.meta), { kind: pod, name: 'Podcast', mix: true, mixKept: false });
});

test('asset points on the server read the split, and count under the primary kind by kind', async () => {
  const k = setup(); await k.on(s => { s.modules.assets.on = true; });
  const closed = k.db.prepare("SELECT id FROM task_statuses WHERE workspace_id=? AND is_completed=1 AND id<>'declined' ORDER BY sort_order").get('ws_zencrevia').id;
  const deps = { route: (m, p, h) => { deps.routes[m + ' ' + p] = h; }, routes: {}, HttpError: Error, forbid: () => {}, can: { scoringViewAnalytics: () => true }, scoring: k.scoring };
  require('../server/scoring-assets')(k.db, 'ws_zencrevia', deps);
  const reels = () => (deps.routes['GET /api/scoring/assets'](k.admin, {}, { person: 'sarah' }).people.find(p => p.userId === 'sarah').byKind.reels || { assets: 0, points: 0 });
  const before = reels();
  const T = k.task({ title: TITLE, assetCount: 6, status: closed, assignee: 'sarah', assignees: ['sarah'], meta: { kinds: POD_META, assetSplit: { sarah: 6 } } });
  k.db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(new Date().toISOString(), T);
  const after = reels();
  assert.deepEqual([after.assets - before.assets, E.round2(after.points - before.points)], [6, 19], '1 × 4 + 4 × 3 + 1 × 3, under the primary kind');
});

test('Smart Scoring\'s analytics and the Teams bars read the split for the asset points too', async () => {
  const k = setup(); await k.on(s => { s.modules.assets.on = true; });
  const closed = k.db.prepare("SELECT id FROM task_statuses WHERE workspace_id=? AND is_completed=1 AND id<>'declined' ORDER BY sort_order").get('ws_zencrevia').id;
  const routes = {};
  require('../server/scoring-analytics')(k.db, 'ws_zencrevia', { route: (m, p, h) => { routes[m + ' ' + p] = h; }, HttpError: Error, forbid: () => {}, can: { scoringViewAnalytics: () => true }, scoring: k.scoring, outcomes: null });
  const points = () => routes['GET /api/scoring/analytics'](k.admin, {}, { weeks: '4' }).assets.points;
  const before = points();
  const T = k.task({ title: TITLE, assetCount: 6, status: closed, assignee: 'sarah', assignees: ['sarah'], meta: { kinds: POD_META, assetSplit: { sarah: 6 } } });
  k.db.prepare('UPDATE tasks SET completed_at=? WHERE id=?').run(new Date().toISOString(), T);
  assert.equal(E.round2(points() - before), 19, 'the analytics: 19 points for the podcast, not 6 × 4 as six videos');
  /* the Teams screen's arithmetic (server/scoring-teams.js tally), with the workspace's kinds and hours */
  const Teams = require('../server/scoring-teams.js').pure, s = k.settings();
  const task = { id: 't', team: 'a', status: 'done', assignees: ['x'], due: '2026-10-10', doneDay: '2026-10-10', story: null, weighted: null, title: TITLE, assetCount: 6, assetSplit: { x: 6 }, assetOk: null, uploaders: [], hours: null, estimatedMinutes: 0, typedActual: 0, time: { manual: 0, legacy: 0 }, meta: { kinds: POD_META } };
  const o = { from: '2026-09-21', to: '2026-10-19', stages: ['done'], on: { story: false, weighted: false, assets: true, hours: false }, assets: s.assets, kinds: s.kinds, hours: s.hours };
  assert.deepEqual(Teams.barsOf(Teams.tally([task], o).people.get('x'), o.on).assets, { done: 19, planned: 19, pct: 100, notScored: 0 });
  assert.deepEqual(Teams.barsOf(Teams.tally([Object.assign({}, task, { meta: {} })], o).people.get('x'), o.on).assets.planned, 24, 'without the split: six videos at 4');
});

/* ---------- the estimate on Create (src/effort-estimate.js, run as the page runs it) ---------- */
test('the estimate on Create uses the split: each kind\'s usual hours for its count, added up, and says so', () => {
  const c = { UI_ID: {}, UI_LANG: 'en', tr: s => s, console, document: { addEventListener() {} }, TASKS: [], simScore: () => 0 };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared', 'scoring-engine.js'), 'utf8'), c);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'effort-estimate.js'), 'utf8').replace(/<\/?script>/g, ''), c);
  const est = c.effortEstimate({ title: TITLE, assetCount: 6, meta: { kinds: POD_META } });
  assert.deepEqual(JSON.parse(JSON.stringify(est)), { h: 31, n: 0, low: 19, high: 54, src: 'kind', basis: '', kind: 'reels', items: 6, mix: POD_META });
  const plain = c.effortEstimate({ title: TITLE, assetCount: 6 });
  assert.deepEqual([plain.h, plain.kind, plain.mix], [32, 'video', undefined], 'without the split: six videos, as before');
  const tk = { title: TITLE, meta: { kinds: POD_META } };
  c.taskMeta = t => (t.meta = t.meta || {});
  c.effortApply(tk, est);
  assert.deepEqual(JSON.parse(JSON.stringify(tk.meta.effortAuto)), { src: 'kind', basis: '', n: 0, low: 19, high: 54, reason: '', kind: 'reels', items: 6, mix: POD_META });
  assert.equal(c.effortWhy(tk.meta.effortAuto), 'Typical for 1 video, 4 reels or short video, 1 key visual (19–54 h). Type a number to set your own.');
  assert.equal(c.UI_ID['Typical for'], 'Lazimnya untuk', 'in Indonesian too');
  /* the chat route's prompt (Smart Scoring off) */
  c.byId = () => null; c.team = () => null; c.WS = {};
  assert.match(c.effortAiPrompt({ title: TITLE, assetCount: 6, meta: { kinds: POD_META } }, []), /\nDeliverables by kind: video 1, reels 4, kv 1\n/);
  assert.doesNotMatch(c.effortAiPrompt({ title: TITLE, assetCount: 6 }, []), /Deliverables by kind/);
});

test('the task panel\'s asset row in the page reads the split: its kinds, the average per asset, each person\'s share', () => {
  const c = { UI_ID: {}, UI_LANG: 'en', console, document: { addEventListener() {} }, TASKS: [], simScore: () => 0, PEOPLE: { a: { name: 'Ana' }, b: { name: 'Budi' } }, ME: 'a', I: { check: '' },
    scoringModuleOn: () => true, scoringSettings: () => null, person: id => ({ name: id === 'a' ? 'Ana' : 'Budi' }), av: () => '', esc: s => String(s), attr: s => String(s),
    taskAssetCredit: tk => ({ by: tk.split, exact: true, how: 'split' }) };
  c.tr = s => (c.UI_LANG === 'id' ? c.UI_ID[s] || s : s);
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared', 'scoring-engine.js'), 'utf8'), c);
  for (const f of ['effort-estimate.js', 'scoring-assets.js']) { const src = fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'); vm.runInContext(src.slice(src.indexOf('<script>') + 8, src.indexOf('</script>')), c); }
  const tk = { id: 'T-1', title: TITLE, assetCount: 6, meta: { kinds: POD_META }, split: { a: 2, b: 4 } };
  const a = c.scoringAssetsTask(tk);
  assert.deepEqual([a.kind, a.r.total, a.r.mixRule], ['reels', 19, 'equal']);
  const html = c.scoringAssetsRowHtml(tk);
  assert.match(html, /1 video, 4 reels or short video, 1 key visual · 3\.17 pts per asset on average/);
  assert.match(html, /2 of 6 = <b>6\.33<\/b> pts/); assert.match(html, /4 of 6 = <b>12\.67<\/b> pts/);
  assert.match(html, />19\.00 pts</);
  c.UI_LANG = 'id';
  assert.match(c.scoringAssetsRowHtml(tk), /poin per aset rata-rata/); assert.match(c.scoringAssetsRowHtml(tk), /2 dari 6 = <b>6\.33<\/b> poin/);
  c.UI_LANG = 'en';
  const plain = c.scoringAssetsRowHtml({ id: 'T-2', title: 'Feed post', assetCount: 3, meta: {}, split: { a: 3 } });
  assert.match(plain, /feed post · 1\.00 pts per asset</); assert.match(plain, /3 × 1\.00 = <b>3\.00<\/b> pts/, 'one kind: as before');
});

test('a duplicate of a task keeps its split (src/drawer.js duplicateTask leaves meta.kinds)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'drawer.js'), 'utf8');
  const line = src.split(/\r?\n/).find(l => l.indexOf('function duplicateTask') >= 0);
  assert.ok(line, 'duplicateTask is there'); assert.match(line, /delete c\.meta\.aiDocParts/);
  assert.doesNotMatch(line, /meta\.kinds/, 'its split is copied with the rest of meta');
});
