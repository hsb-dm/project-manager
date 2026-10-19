/* Smart Scoring engine (shared/scoring-engine.js): the spec's formulas — Effort Hours, Story Points, Weighted Points,
   the base points, the efficiency bonus, credit splits, KPI/OKR progress, the AI reply check and the AI cache key —
   worked out the same way on the server and, inlined by build.js, in the browser. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const S = require('../shared/scoring-engine');
const D = S.ENGINE_DEFAULTS;
const OK = { completed: true, qualityApproved: true, scopeChanged: false, validLogs: true };
const eff = (E, A, B, extra) => S.efficiency(D.bonus, Object.assign({ E, A, B }, OK, extra));
const cents = xs => xs.reduce((n, x) => n + Math.round(x * 100), 0);
const all = r => ({ complexity: r, scope: r, uncertainty: r, dependencies: r });

/* ---------- the efficiency bonus (spec §7.2) ---------- */
test('the spec acceptance example: E=8h, A=5h, B=8 gives a 1.10 bonus and 9.10 earned', () => {
  const r = eff(8, 5, 8);
  assert.equal(r.eligible, true);
  assert.deepEqual(r.reasons, []);
  assert.equal(r.savedRatio, 0.375);
  assert.equal(r.eligibleSavings, 0.275);
  assert.equal(r.multiplier, 0.1375);
  assert.equal(r.bonus, 1.1);
  assert.equal(r.earned, 9.1);
  assert.equal(r.base, 8);
  assert.equal(r.savedHours, 3);
  assert.equal(r.needsReview, false);
  assert.deepEqual(r.inputs, Object.assign({ E: 8, A: 5, B: 8 }, OK));
  assert.deepEqual(r.policy, { grace: 0.1, rewardFactor: 0.5, maxRate: 0.2, minE: 1, minA: 0.25, reviewBelowRatio: 0.4 });
  assert.ok(r.explanation.some(s => s.includes('1.10') && s.includes('9.10')), r.explanation.join(' | '));
  /* the defaults when no policy is given, and the whole settings object where the bonus sub-object is expected */
  assert.equal(S.efficiency(undefined, Object.assign({ E: 8, A: 5, B: 8 }, OK)).earned, 9.1);
  assert.equal(S.efficiency({ hours: D.hours, bonus: D.bonus }, Object.assign({ E: 8, A: 5, B: 8 }, OK)).earned, 9.1);
});

test('savings within the 10% grace earn nothing: E=8, A=7.5', () => {
  const r = eff(8, 7.5, 8);
  assert.equal(r.eligible, true);
  assert.equal(r.savedRatio, 0.0625);
  assert.equal(r.eligibleSavings, 0);
  assert.equal(r.multiplier, 0);
  assert.equal(r.bonus, 0);
  assert.equal(r.earned, 8);
  assert.ok(r.explanation.some(s => s.includes('grace')));
  assert.equal(eff(10, 9, 8).bonus, 0, 'exactly at the grace');
});

test('an estimate under 1 h or an actual under 0.25 h is ineligible, and says why', () => {
  const e = eff(0.5, 0.4, 1);
  assert.equal(e.eligible, false);
  assert.deepEqual(e.reasons, ['estimate_below_minimum']);
  assert.equal(e.bonus, 0);
  assert.equal(e.earned, 1);
  assert.equal(e.potentialBonus, 0.05, 'what the formula alone would give');
  assert.ok(e.explanation.includes('The locked estimate of 0.5 h is under the 1 h minimum.'));
  const a = eff(8, 0.2, 8);
  assert.deepEqual(a.reasons, ['actual_below_minimum']);
  assert.equal(a.bonus, 0);
  assert.ok(a.explanation.includes('The logged 0.2 h is under the 0.25 h minimum.'));
  assert.deepEqual(eff(1, 0.25, 2).reasons, [], 'the minimums themselves are allowed');
});

test('finishing in under 40% of the estimate is flagged for review, and the bonus rate is capped at 20%', () => {
  const r = eff(10, 3, 10);
  assert.equal(r.needsReview, true);
  assert.equal(r.eligible, true, 'a flag, not a refusal');
  assert.equal(r.eligibleSavings, 0.6);
  assert.equal(r.multiplier, 0.2);
  assert.equal(r.bonus, 2);
  assert.equal(r.earned, 12);
  assert.ok(r.explanation.some(s => s.includes('capped at 20%')));
  assert.ok(r.explanation.some(s => s.includes('reviewer')));
  assert.equal(eff(10, 4, 10).needsReview, false, 'exactly 40% is not under 40%');
});

test('taking longer than the estimate gives no bonus, never negative points, and reports the variance', () => {
  const r = eff(8, 10, 8);
  assert.equal(r.eligible, true);
  assert.equal(r.savedRatio, 0);
  assert.equal(r.savedHours, 0);
  assert.equal(r.bonus, 0);
  assert.equal(r.earned, 8);
  assert.equal(r.varianceHours, 2);
  assert.equal(r.varianceRatio, 0.25);
  assert.ok(r.explanation[0].includes('2 h more than the 8 h estimate'));
  const way = S.efficiency(Object.assign({}, D.bonus, { negative: true }), Object.assign({ E: 8, A: 80, B: 8 }, OK));
  assert.equal(way.bonus, 0);
  assert.equal(way.earned, 8);
  assert.ok(way.potentialBonus >= 0);
});

test('every unmet condition is named', () => {
  const cases = [
    [{ completed: false }, 'not_completed'], [{ completed: 'yes' }, 'not_completed'],
    [{ qualityApproved: false }, 'quality_not_approved'], [{ scopeChanged: true }, 'scope_changed'],
    [{ validLogs: false }, 'invalid_time_logs'],
    [{ E: 0 }, 'no_locked_estimate'], [{ E: null }, 'no_locked_estimate'], [{ E: 0.75 }, 'estimate_below_minimum'],
    [{ A: 0 }, 'no_actual_time'], [{ A: undefined }, 'no_actual_time'], [{ A: 0.1 }, 'actual_below_minimum'],
    [{ B: null }, 'no_base_points'], [{ B: 0 }, 'no_base_points']
  ];
  for (const [change, code] of cases) {
    const r = S.efficiency(D.bonus, Object.assign({ E: 8, A: 5, B: 8 }, OK, change));
    assert.equal(r.eligible, false, code);
    assert.deepEqual(r.reasons, [code], code);
    assert.equal(r.bonus, 0, code);
    const step = r.steps.find(s => s.key === S.REASONS[code]);
    assert.ok(step && r.explanation.includes(S.fill(step.key, step.vars)), code);
  }
  assert.equal(eff(8, 5, null).earned, null, 'no base, nothing earned');
  /* nothing confirmed: the conditions not stated are unmet (scope unchanged unless said otherwise) */
  const bare = S.efficiency(D.bonus, { E: 8, A: 5, B: 8 });
  assert.deepEqual(bare.reasons, ['not_completed', 'quality_not_approved', 'invalid_time_logs']);
  assert.equal(bare.bonus, 0);
  assert.equal(bare.earned, 8);
  assert.equal(bare.potentialBonus, 1.1);
  assert.ok(bare.explanation.includes('When every condition is met, the bonus would be 1.10 points.'));
});

test('the policy numbers come from the settings, each falling back to its default', () => {
  const r = S.efficiency({ grace: 0, rewardFactor: 1, maxRate: 1 }, Object.assign({ E: 10, A: 5, B: 10 }, OK));
  assert.equal(r.multiplier, 0.5);
  assert.equal(r.bonus, 5);
  assert.equal(r.earned, 15);
  assert.equal(S.efficiency({ grace: '0.2' }, Object.assign({ E: 8, A: 5, B: 8 }, OK)).eligibleSavings, 0.175);
  assert.equal(S.efficiency({ grace: 'abc', maxRate: null }, Object.assign({ E: 8, A: 5, B: 8 }, OK)).earned, 9.1);
  assert.equal(S.efficiency({ minE: 10 }, Object.assign({ E: 8, A: 5, B: 8 }, OK)).reasons[0], 'estimate_below_minimum');
});

/* ---------- rounding ---------- */
test('round2 has no binary floating-point noise', () => {
  assert.equal(S.round2(0.1 + 0.2), 0.3);
  assert.equal(S.round2(1.005), 1.01);
  assert.equal(S.round2(2.675), 2.68);
  assert.equal(S.round2(1.255), 1.26);
  assert.equal(S.round2(-1.005), -1.01);
  assert.equal(S.round2(8 * 0.1375), 1.1);
  assert.equal(S.round2(3.04 + 3.03 + 3.03), 9.1);
  assert.equal(S.round2(123456.785), 123456.79);
  assert.equal(S.round2(1e-7), 0);
  assert.ok(Object.is(S.round2(-0.001), 0), 'no negative zero');
  assert.equal(S.round2('1.005'), 1.01);
  for (const bad of [null, undefined, '', 'abc', Infinity, NaN, true, {}]) assert.ok(Number.isNaN(S.round2(bad)), String(bad));
  /* a bonus of exactly half a cent rounds up, whatever 10 − 8.9 is in binary */
  const r = eff(10, 8.9, 1);
  assert.equal(r.savedRatio, 0.11);
  assert.equal(r.eligibleSavings, 0.01);
  assert.equal(r.multiplier, 0.005);
  assert.equal(r.bonus, 0.01);
});

/* ---------- Effort Hours ---------- */
test('hours follow the templates of today\'s estimate: the first deliverable in full, each next one at the kind\'s share', () => {
  const h = (kind, units, more) => S.hours(D.hours, Object.assign({ kind, units }, more));
  assert.equal(h('feed', 1).value, 2);
  assert.equal(h('feed', 3).value, 4, 'a post, then two more at half each');
  assert.equal(h('feed', 3).low, 2);
  assert.equal(h('feed', 3).high, 6);
  assert.equal(h('story', 5).value, 4.5);
  assert.equal(h('resize', 12, { complexity1to5: 2 }).value, 5.06, 'twelve resizes are an afternoon, not ten hours');
  assert.equal(h('reels', 3).value, 13.2, 'three reels are more than one');
  const car = S.hours({ templates: { piece: { perUnit: 4, low: 3, high: 6, nextUnitFactor: 0 } } }, { kind: 'piece', units: 3 });
  assert.equal(car.value, 4, 'a template at 0 is one piece of work, whatever the count');
  assert.ok(car.explanation.includes('3 deliverables made as one piece of work: ×1.'));
  assert.equal(h('feed', 3, { nextUnitFactor: 1 }).value, 6, '1.0 is the spec\'s straight perUnit × units');
  assert.equal(S.hours({ templates: { x: { perUnit: 2, low: 1, high: 3, nextUnitFactor: 1 } } }, { kind: 'x', units: 4 }).value, 8);
  assert.equal(h('feed', 0).inputs.units, 1, 'at least one deliverable');
  assert.deepEqual(S.hours({ hours: D.hours }, { kind: 'feed', units: 3 }).value, 4, 'the whole settings object works too');
});

test('complexity and open dependencies multiply the hours, kept within the bounds', () => {
  const h = more => S.hours(D.hours, Object.assign({ kind: 'feed', units: 1 }, more));
  assert.equal(h({ complexity1to5: 5, openDeps: 2 }).value, 3.6);
  assert.equal(h({ complexity1to5: 1 }).value, 1.6);
  assert.equal(h({ complexity: 4 }).value, 2.5, 'complexity is accepted for complexity1to5');
  assert.equal(h({ openDeps: 7 }).value, 2.6, 'three or more open dependencies: ×1.3');
  assert.equal(h({ openDeps: 1 }).factors.dependencyMultiplier, 1.1);
  const unrated = h({});
  assert.equal(unrated.value, 2);
  assert.equal(unrated.inputs.complexityRated, false);
  assert.ok(unrated.explanation.includes('Complexity not rated, taken as 3 of 5: ×1.'));
  assert.equal(h({ complexity1to5: 9 }).inputs.complexity1to5, 5);
  const big = S.hours(D.hours, { perUnit: 100 });
  assert.equal(big.value, 80);
  assert.equal(big.bounded, true);
  assert.ok(big.explanation.includes('Capped at the maximum of 80 h.'));
  const small = S.hours(D.hours, { perUnit: 0.1 });
  assert.equal(small.value, 0.25);
  assert.equal(small.bounded, true);
  assert.equal(S.hours({ bounds: { min: 1, max: 4 } }, { kind: 'feed', units: 10 }).value, 4);
  const none = S.hours(D.hours, { kind: 'unknown' });
  assert.equal(none.value, null);
  assert.equal(none.reason, 'no_template');
});

/* today's estimator (src/effort-estimate.js), run whole as the page runs it — after the engine, which build.js inlines first */
function estimator() {
  const c = { UI_ID: {}, UI_LANG: 'en', tr: s => s, console, document: { addEventListener() {} } };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared', 'scoring-engine.js'), 'utf8'), c);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'effort-estimate.js'), 'utf8').replace(/<\/?script>/g, ''), c);
  return c;
}
/* the estimator's table as it has been since 2026-10-16 (id, typical, low, high, each next at): the hours it gives
   never change because the list moved into the engine */
const EST_TABLE = [['carousel', 4, 3, 6, 0.5], ['story', 1.5, 1, 3, 0.5], ['reels', 6, 4, 10, 0.6], ['video', 8, 4, 16, 0.6],
  ['kv', 6, 4, 10, 0.5], ['resize', 1.5, 0.5, 3, 0.25], ['feed', 2, 1, 3, 0.5], ['poster', 3, 2, 5, 0.6], ['banner', 3, 2, 5, 0.5],
  ['copy', 1.5, 0.5, 3, 0.4], ['deck', 6, 3, 10, 0.4], ['logo', 10, 6, 16, 0.4], ['web', 10, 6, 20, 0.5], ['email', 3, 2, 5, 0.5]];
test('the hour templates are the kinds of src/effort-estimate.js, and give its numbers', () => {
  const c = estimator();
  const kinds = Array.from(c.EST_KINDS, k => Array.from(k));
  assert.equal(kinds.length, 14);
  assert.deepEqual(Object.keys(D.hours.templates), kinds.map(k => k[0]), 'same ids, same order');
  assert.deepEqual(kinds.map(k => [k[0], k[4], k[5], k[6], k[7]]), EST_TABLE, 'the estimator\'s hours are what they were');
  for (const k of kinds) {
    assert.deepEqual(Object.assign({}, D.hours.templates[k[0]]), { perUnit: k[4], low: k[5], high: k[6], nextUnitFactor: k[7] }, k[0]);
    const def = S.KINDS.find(x => x.id === k[0]);
    assert.deepEqual([k[1], k[2], String(k[3])], [def.name, def.nameId, String(def.keywords)], k[0] + ': the names and the keywords are the engine\'s');
    for (let items = 1; items <= 4; items++) {
      const f = items > 1 ? 1 + k[7] * (items - 1) : 1; /* estKindHours */
      assert.equal(S.hours(D.hours, { kind: k[0], units: items }).value, S.round2(k[4] * f), k[0] + ' × ' + items);
      assert.equal(S.round2(c.estKindHours(k, items).h), S.round2(k[4] * f), k[0] + ' × ' + items + ' (estKindHours)');
    }
  }
});

/* ---------- the kinds of work, from a task's title ---------- */
const TITLES = [
  ['Carousel 5 slides promo Oktober', 'carousel'], ['Karosel edukasi trading', 'carousel'], ['IG story giveaway', 'story'],
  ['Insta story x3', 'story'], ['Stories for the launch', 'story'], ['Reels market update', 'reels'], ['TikTok trend', 'reels'],
  ['Video pendek promo', 'reels'], ['Explainer video', 'video'], ['Motion graphic intro', 'video'], ['Animasi logo', 'video'],
  ['KV campaign Ramadan', 'kv'], ['Key visual for the expo', 'kv'], ['Resize banner 12 sizes', 'resize'], ['Adaptasi KV ke story', 'story'],
  ['Turunan materi', 'resize'], ['Feed post Monday', 'feed'], ['Konten Instagram', 'feed'], ['Social media plan', 'feed'],
  ['Poster seminar', 'poster'], ['Brosur produk', 'poster'], ['Web banner', 'banner'], ['Iklan Google', 'banner'],
  ['Spanduk cabang', 'banner'], ['Copywriting caption', 'copy'], ['Naskah video', 'video'], ['Blog article SEO', 'copy'],
  ['Pitch deck investor', 'deck'], ['Presentasi Q3', 'deck'], ['Logo concept', 'logo'], ['Brand identity refresh', 'logo'],
  ['Landing page promo', 'web'], ['Halaman web karier', 'web'], ['Newsletter October', 'email'], ['EDM blast', 'email'],
  ['Weekly sync', null], ['', null]];
test('kindOf reads the kind of work from a title, English or Indonesian, the more specific kinds first — and the estimator reads it the same', () => {
  const c = estimator();
  for (const [title, kind] of TITLES) {
    assert.equal(S.kindOf(title), kind, JSON.stringify(title));
    const k = c.estKind(title);
    assert.equal(k ? k[0] : null, kind, 'estKind ' + JSON.stringify(title));
  }
  assert.equal(S.kindOf(null), null); assert.equal(S.kindOf(undefined), null); assert.equal(S.kindOf('LOGO CONCEPT'), 'logo', 'any case');
  assert.deepEqual(S.KIND_IDS, Object.keys(D.hours.templates), 'one kind per hour template, in the same order');
  assert.deepEqual(S.KIND_IDS, Object.keys(D.assets.perKind), 'one kind per asset points value, in the same order');
  assert.ok(Object.isFrozen(S.KINDS) && Object.isFrozen(S.KINDS[0]), 'nobody changes the list in passing');
  S.KINDS.forEach(k => assert.ok(k.name && k.nameId && k.keywords.length && Object.isFrozen(k.keywords) && k.keywords.every(w => S.kindKeyword(w) === w), k.id));
});

/* ---------- points for the assets produced ---------- */
test('asset points: each kind of work has its own value per asset, a kind not known counts 1, two decimals', () => {
  const pp = kind => S.assetPoints(D.assets, { kind, split: { a: 1 } }).pointsPerAsset;
  assert.deepEqual(S.KIND_IDS.map(pp), [2, 0.75, 3, 4, 3, 0.25, 1, 1.5, 1.5, 0.75, 3, 5, 5, 1.5]);
  assert.equal(pp(null), 1); assert.equal(pp('nothing-like-this'), 1);
  const r = S.assetPoints(D.assets, { kind: 'logo', split: { a: 2, b: '1' } });
  assert.deepEqual(r.perPerson.a, { count: 2, counted: 2, points: 10, validated: false, changedSinceValidation: false, validatedCount: null });
  assert.equal(r.perPerson.b.points, 5, 'a count written as text');
  assert.equal(r.total, 15); assert.equal(r.totalAssets, 3); assert.equal(r.kindKnown, true); assert.equal(r.reason, null);
  assert.ok(r.explanation.includes('a: 2 × 5.00 = 10.00 points.'), r.explanation.join(' | '));
  assert.ok(r.explanation.some(s => s === 'Total: 15.00 points for 3 assets.'));
  /* resizes: 7 × 0.25 */
  assert.equal(S.assetPoints(D.assets, { kind: 'resize', split: { a: 7 } }).total, 1.75);
  /* a share worked out by the reports (3 assets between two people) keeps its fraction; points have two decimals */
  const shared = S.assetPoints(D.assets, { kind: 'story', split: { a: 1.5, b: 1.5 } });
  assert.deepEqual([shared.perPerson.a.points, shared.total], [1.13, 2.26]);
  /* the admin's own table, a kind left out of it falls back to the default, the whole settings object works too */
  assert.equal(S.assetPoints({ perKind: { feed: 2 }, unknownKind: 0.5 }, { kind: 'feed', split: { a: 3 } }).total, 6);
  assert.equal(S.assetPoints({ perKind: { feed: 2 } }, { kind: 'logo', split: { a: 1 } }).pointsPerAsset, 5);
  assert.equal(S.assetPoints({ perKind: {}, unknownKind: 0.5 }, { kind: 'nope', split: { a: 2 } }).total, 1);
  assert.equal(S.assetPoints({ assets: { perKind: { logo: 8 } }, hours: {} }, { kind: 'logo', split: { a: 1 } }).total, 8);
  /* steps translate */
  r.steps.forEach(s => assert.ok(Object.values(S.SENTENCES).includes(s.key), s.key));
});

test('asset points: never negative, nothing for no counts, and the counts as given are never changed', () => {
  const split = { a: -3, b: 0, c: 'x', d: 2, e: null };
  const r = S.assetPoints(D.assets, { kind: 'feed', split });
  assert.deepEqual(Object.keys(r.perPerson), ['d'], 'only counts above 0');
  assert.equal(r.total, 2);
  assert.deepEqual(split, { a: -3, b: 0, c: 'x', d: 2, e: null });
  assert.equal(S.assetPoints({ perKind: { feed: -4 } }, { kind: 'feed', split: { a: 2 } }).total, 0, 'a negative value is read as 0');
  assert.equal(S.assetPoints({ unknownKind: -1 }, { split: { a: 2 } }).total, 0);
  const none = S.assetPoints(D.assets, { kind: 'feed', split: {} });
  assert.deepEqual([none.total, none.totalAssets, none.reason], [0, 0, 'no_assets']);
  assert.deepEqual(none.explanation.slice(-1), ['No assets produced yet.']);
  assert.equal(S.assetPoints(D.assets).total, 0, 'no inputs at all');
  assert.equal(S.assetPoints(null, null).pointsPerAsset, 1);
});

test('asset points: counts a lead has not validated yet count and are marked; a count changed since is marked too', () => {
  const ok = { by: 'lead', at: '2026-10-16T09:00:00.000Z', split: { a: 2, b: 3 }, total: 5 };
  /* never validated */
  let r = S.assetPoints(D.assets, { kind: 'feed', split: { a: 2, b: 3 } });
  assert.equal(r.isValidated, false);
  assert.deepEqual([r.perPerson.a.validated, r.perPerson.a.changedSinceValidation, r.total], [false, false, 5], 'counted, not validated yet');
  assert.ok(r.explanation.includes('a: not validated by a lead yet; counted as entered.'));
  /* validated as it is */
  r = S.assetPoints(D.assets, { kind: 'feed', split: { a: 2, b: 3 }, validated: ok });
  assert.deepEqual([r.perPerson.a.validated, r.perPerson.b.validated, r.perPerson.b.changedSinceValidation, r.total], [true, true, false, 5]);
  /* b changed afterwards: b is marked, a still validated; and someone new is changed since too */
  r = S.assetPoints(D.assets, { kind: 'feed', split: { a: 2, b: 4, c: 1 }, validated: ok });
  assert.deepEqual([r.perPerson.a.validated, r.perPerson.b.validated, r.perPerson.b.changedSinceValidation, r.perPerson.b.validatedCount, r.perPerson.c.changedSinceValidation], [true, false, true, 3, true]);
  assert.equal(r.total, 7, 'counted as entered now');
  assert.ok(r.explanation.includes('b: changed since a lead validated 3; counted as entered now.'), r.explanation.join(' | '));
  /* one person on the task: the total is what was validated */
  const one = { by: 'lead', split: {}, total: 3 };
  assert.equal(S.assetPoints(D.assets, { kind: 'feed', split: { a: 3 }, validated: one }).perPerson.a.validated, true);
  r = S.assetPoints(D.assets, { kind: 'feed', split: { a: 5 }, validated: one });
  assert.deepEqual([r.perPerson.a.validated, r.perPerson.a.changedSinceValidation, r.perPerson.a.validatedCount], [false, true, 3]);
  /* a validation with no counts in it is no validation (as the page reads meta.assetSplitOk); true/false with the counts apart */
  assert.equal(S.assetPoints(D.assets, { kind: 'feed', split: { a: 1 }, validated: { by: 'lead' } }).isValidated, false);
  r = S.assetPoints(D.assets, { kind: 'feed', split: { a: 2 }, validated: true, validatedSplit: { a: 1 } });
  assert.deepEqual([r.perPerson.a.changedSinceValidation, r.perPerson.a.validatedCount], [true, 1]);
  assert.equal(S.assetPoints(D.assets, { kind: 'feed', split: { a: 2 }, validated: true }).perPerson.a.validated, true, 'validated, nothing to compare with');
});

test('asset points with only validated counts counting: nothing before a lead validates, at most what was validated after a change', () => {
  const strict = Object.assign({}, D.assets, { countUnvalidated: false });
  const ok = { by: 'lead', split: { a: 2, b: 3 }, total: 5 };
  let r = S.assetPoints(strict, { kind: 'poster', split: { a: 2, b: 3 } });
  assert.deepEqual([r.perPerson.a.counted, r.perPerson.a.points, r.total, r.countUnvalidated], [0, 0, 0, false]);
  assert.ok(r.explanation.includes('a: not validated by a lead yet; no points until a lead validates it.'));
  r = S.assetPoints(strict, { kind: 'poster', split: { a: 2, b: 3 }, validated: ok });
  assert.equal(r.total, 7.5);
  r = S.assetPoints(strict, { kind: 'poster', split: { a: 1, b: 6 }, validated: ok });
  assert.deepEqual([r.perPerson.a.counted, r.perPerson.b.counted, r.total], [1, 3, 6], 'fewer now: what there is; more now: what was validated');
  assert.ok(r.explanation.includes('b: changed since a lead validated 3; 3 counts until a lead validates it again.'), r.explanation.join(' | '));
  assert.equal(S.assetPoints({ countUnvalidated: 'no' }, { split: { a: 1 } }).countUnvalidated, true, 'not a yes or no: the default');
});

/* ---------- Story Points and Weighted Points ---------- */
test('story points map the weighted index through the thresholds to 1, 2, 3, 5, 8, 13, and 13 suggests a split', () => {
  [[1, 1], [2, 2], [3, 3], [4, 5], [5, 13]].forEach(([r, p]) => assert.equal(S.storyPoints(D.story, all(r)).value, p, 'all ' + r));
  assert.equal(S.storyPoints(D.story, { complexity: 5, scope: 5, uncertainty: 4, dependencies: 3 }).value, 8);
  const edge = S.storyPoints(D.story, { complexity: 3, scope: 2, uncertainty: 2, dependencies: 3 });
  assert.equal(edge.index, 2.5, 'no binary noise in the index');
  assert.equal(edge.value, 2, 'an index on a threshold is in the lower size');
  const big = S.storyPoints(D.story, all(5));
  assert.equal(big.split, true);
  assert.ok(big.explanation.some(s => s.includes('splitting')));
  assert.equal(S.storyPoints(D.story, all(4)).split, false);
  assert.deepEqual(big.scale, [1, 2, 3, 5, 8, 13]);
  const missing = S.storyPoints(D.story, { complexity: 3, scope: 3, dependencies: 3 });
  assert.equal(missing.value, null);
  assert.equal(missing.reason, 'missing_ratings');
  assert.deepEqual(missing.missing, ['uncertainty']);
  const odd = S.storyPoints(D.story, { complexity: 9, scope: '3', uncertainty: 2.6, dependencies: 0 });
  assert.deepEqual(odd.inputs.ratings, { complexity: 5, scope: 3, uncertainty: 3, dependencies: 1 });
  assert.ok(odd.explanation.includes('The complexity rating 9 was read as 5 (ratings are whole numbers from 1 to 5).'));
  assert.equal(S.storyPoints({ thresholds: [3, 1, 2, 1.5, 2.5], weights: D.story.weights }, all(3)).value, 8, 'thresholds sorted');
  assert.equal(S.storyPoints({ story: D.story }, all(3)).value, 3, 'the whole settings object works too');
});

test('weighted points: 40/30/20/10 of the 1–5 ratings, spread evenly over 1–10', () => {
  const r = S.weightedPoints(D.weighted, { complexity: 5, scope: 4, uncertainty: 3, dependencies: 2 });
  assert.equal(r.index, 4);
  assert.equal(r.value, 7.75);
  assert.equal(r.mappingVersion, 1);
  assert.equal(r.scaleMax, 10);
  assert.deepEqual(r.inputs.weights, { complexity: 0.4, scope: 0.3, uncertainty: 0.2, dependencies: 0.1 });
  assert.ok(r.explanation[0].includes('40% × 5 + 30% × 4 + 20% × 3 + 10% × 2'));
  assert.equal(S.weightedPoints(D.weighted, all(1)).value, 1);
  assert.equal(S.weightedPoints(D.weighted, all(5)).value, 10);
  assert.equal(S.weightedPoints(D.weighted, all(3)).value, 5.5);
  assert.equal(S.weightedPoints({ weights: { complexity: 40, scope: 30, uncertainty: 20, dependencies: 10 } }, { complexity: 5, scope: 4, uncertainty: 3, dependencies: 2 }).value, 7.75, 'percentages work as weights');
  assert.equal(S.weightedPoints({ scaleMax: 5, mappingVersion: 3 }, all(3)).value, 3);
  assert.equal(S.weightedPoints({ scaleMax: 5, mappingVersion: 3 }, all(3)).mappingVersion, 3);
  const noDeps = S.weightedPoints({ weights: { complexity: 1, scope: 1, uncertainty: 0, dependencies: 0 } }, { complexity: 5, scope: 3 });
  assert.equal(noDeps.index, 4, 'a factor weighing 0 needs no rating');
  assert.equal(S.weightedPoints(D.weighted, { complexity: 5 }).reason, 'missing_ratings');
});

/* ---------- the base points ---------- */
test('base points: the final Weighted Points, else the locked hours through the bands — never the hours themselves', () => {
  const w = S.basePoints(D.bonus, { weightedFinal: 7.75, lockedHours: 6 });
  assert.equal(w.value, 7.75);
  assert.equal(w.source, 'weighted');
  const bands = [[0.5, 1], [1, 1], [1.5, 2], [2, 2], [3, 3], [4, 3], [6, 5], [8, 5], [8.01, 8], [16, 8], [17, 13], [5000, 13]];
  for (const [hours, pts] of bands) {
    const r = S.basePoints(D.bonus, { lockedHours: hours });
    assert.equal(r.value, pts, hours + ' h');
    assert.equal(r.source, 'hour_mapping');
  }
  assert.ok(S.basePoints(D.bonus, { lockedHours: 6 }).explanation.includes('Base 5.00 points: the locked 6 h falls in the band up to 8 h.'));
  assert.ok(S.basePoints(D.bonus, { lockedHours: 5000 }).explanation[0].includes('above every band'));
  const none = S.basePoints(D.bonus, {});
  assert.equal(none.value, null);
  assert.equal(none.reason, 'no_locked_hours');
  assert.equal(S.basePoints(D.bonus, { weightedFinal: 0, lockedHours: 3 }).source, 'hour_mapping');
  assert.equal(S.basePoints({ baseSource: 'mapping' }, { weightedFinal: 7.75, lockedHours: 3 }).value, 3);
  assert.equal(S.basePoints({ hourMapping: { type: 'bands', bands: [[10, 4], [2, 1]] } }, { lockedHours: 3 }).value, 4, 'bands sorted');
  assert.equal(S.basePoints({ bonus: D.bonus }, { lockedHours: 3 }).value, 3, 'the whole settings object works too');
});

/* ---------- credit split ---------- */
test('allocate splits a total so the parts add up to it exactly', () => {
  const three = S.allocate(9.1, [1, 1, 1]);
  assert.deepEqual(three.values, [3.04, 3.03, 3.03], 'the cent left over goes to the first of equal shares');
  assert.equal(cents(three.values), 910);
  assert.ok(three.explanation.includes('The rounding remainder of 0.01 goes to the largest share.'));
  assert.deepEqual(S.allocate(9.1, [60, 120, 60]).values, [2.27, 4.56, 2.27], 'by logged minutes; the remainder to the largest');
  assert.deepEqual(S.allocate(1.1, { ana: 3, budi: 1 }).values, { ana: 0.83, budi: 0.27 }, 'an object of id → share');
  assert.deepEqual(S.allocate(0.01, [1, 1]).values, [0.01, 0]);
  const eq = S.allocate(1, [0, 0, -2]);
  assert.deepEqual(eq.values, [0.34, 0.33, 0.33], 'no positive share: equal');
  assert.ok(eq.explanation[0].includes('split equally 3 ways'));
  assert.deepEqual(S.allocate(5, []).values, []);
  assert.deepEqual(S.allocate(-1, [1, 1, 1]).values, [-0.34, -0.33, -0.33]);
  assert.deepEqual(S.allocate(null, [1, 2]).values, [0, 0]);
  /* many totals and shares, deterministic: always exact to the cent, never a negative part */
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 500; i++) {
    const total = Math.round(rnd() * 1000000) / 100, n = 1 + Math.floor(rnd() * 6);
    const shares = Array.from({ length: n }, () => (rnd() < 0.2 ? 0 : Math.round(rnd() * 10000) / 100));
    const r = S.allocate(total, shares);
    assert.equal(cents(r.values), Math.round(total * 100), total + ' / ' + shares.join(','));
    assert.ok(r.values.every(v => v >= 0 && S.round2(v) === v));
  }
});

/* ---------- KPI and OKR progress ---------- */
test('progress: up and down, clamped to 0–1, with no number for a zero range or missing data', () => {
  assert.equal(S.progress({ baseline: 0, target: 100, actual: 40, direction: 'up' }).value, 0.4);
  const down = S.progress({ baseline: 10, target: 2, actual: 6, direction: 'down' });
  assert.equal(down.value, 0.5);
  assert.ok(down.explanation[0].startsWith('Decreasing'));
  const past = S.progress({ baseline: 0, target: 100, actual: 120 });
  assert.equal(past.value, 1);
  assert.equal(past.raw, 1.2);
  const behind = S.progress({ baseline: 50, target: 100, actual: 40, direction: 'up' });
  assert.equal(behind.value, 0);
  assert.equal(behind.raw, -0.2);
  assert.equal(S.progress({ baseline: 0, target: 10, actual: 0 }).value, 0, '0 is a value, not missing');
  assert.equal(S.progress({ baseline: '0', target: '10', actual: '4' }).value, 0.4);
  const zero = S.progress({ baseline: 5, target: 5, actual: 7 });
  assert.equal(zero.value, null);
  assert.equal(zero.reason, 'zero_range');
  for (const gap of [{ target: null }, { actual: '' }, { baseline: undefined }, { actual: 'n/a' }]) {
    const r = S.progress(Object.assign({ baseline: 0, target: 10, actual: 3 }, gap));
    assert.equal(r.value, null, JSON.stringify(gap));
    assert.equal(r.reason, 'missing_data');
  }
  assert.ok(S.progress({}).explanation[0].includes('baseline, target, actual'));
  assert.equal(S.progress({ baseline: 10, target: 2, actual: 6, direction: 'up' }).reason, 'direction_mismatch');
  assert.equal(S.progress({ baseline: 2, target: 10, actual: 6, direction: 'down' }).reason, 'direction_mismatch');
});

test('rollup weighs the key results, leaves out the ones with no progress and says so', () => {
  const r = S.rollup([{ progress: 0.5, weight: 2 }, { progress: null, weight: 1 }, { progress: 1, weight: 1 }]);
  assert.equal(r.value, 0.666666666667);
  assert.equal(r.counted, 2);
  assert.equal(r.ignored, 1);
  assert.ok(r.explanation[0].startsWith('1 of 3 key results'));
  const fromResults = S.rollup([{ progress: S.progress({ baseline: 0, target: 10, actual: 4 }) }, { progress: S.progress({ baseline: 5, target: 5, actual: 1 }), weight: 3 }]);
  assert.equal(fromResults.value, 0.4, 'a progress() result is accepted; its null is left out');
  assert.equal(fromResults.ignored, 1);
  assert.equal(S.rollup([{ progress: 2 }, { progress: 0 }]).value, 0.5, 'clamped to 0–1, weight 1 by default');
  const none = S.rollup([{ progress: null }, {}]);
  assert.equal(none.value, null);
  assert.equal(none.reason, 'no_progress');
  assert.equal(S.rollup([]).value, null);
  assert.equal(S.rollup([{ progress: 0.5, weight: 0 }]).reason, 'zero_weight');
});

/* ---------- the AI reply ---------- */
test('validateAi keeps a good reply as it is', () => {
  const good = {
    kind: 'feed', deliverables: 3, factors: { complexity: 3, scope: 2, uncertainty: 4, dependencies: 1 }, hours: 4.5, storyPoints: 5,
    weightedPoints: 6.25, confidence: 0.72, explanation: 'Three feed posts from a supplied brief.', assumptions: ['Copy is supplied'],
    missing: ['Sizes'], comparables: ['T-12', 'T-40'], outcomes: [{ metricId: 'kr_1', why: 'Approved posts count toward it' }]
  };
  const r = S.validateAi(JSON.parse(JSON.stringify(good)), D);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.value, good);
});

test('validateAi rejects what is not a reply, and clamps, drops and shortens what is out of bounds', () => {
  for (const bad of [null, undefined, 'hours: 4', [4], 5]) {
    const r = S.validateAi(bad, D);
    assert.equal(r.ok, false);
    assert.equal(r.value, null);
    assert.ok(r.errors.length);
  }
  const nothing = S.validateAi({ explanation: 'I cannot tell.', confidence: 0.2 }, D);
  assert.equal(nothing.ok, false, 'no hours, points or ratings: not usable');
  assert.equal(nothing.value, null);
  const v = x => S.validateAi(x, D).value;
  assert.equal(v({ hours: 500 }).hours, 80);
  assert.equal(v({ hours: '3.5' }).hours, 3.5);
  assert.equal(v({ hours: -2, storyPoints: 3 }).hours, undefined);
  assert.equal(S.validateAi({ hours: 50 }, { hours: { bounds: { min: 1, max: 40 } } }).value.hours, 40);
  assert.deepEqual(v({ factors: { complexity: 7, scope: 2.6, uncertainty: 'high', dependencies: 0, mood: 5 } }).factors, { complexity: 5, scope: 3, dependencies: 1 });
  assert.equal(S.validateAi({ storyPoints: 4 }, D).ok, false, 'story points only from the scale');
  assert.equal(v({ storyPoints: '8' }).storyPoints, 8);
  assert.equal(v({ weightedPoints: 15 }).weightedPoints, 10);
  assert.equal(v({ weightedPoints: 0 }).weightedPoints, 1);
  assert.equal(S.validateAi({ weightedPoints: 7 }, { weighted: { scaleMax: 5 } }).value.weightedPoints, 5);
  assert.equal(v({ hours: 2, confidence: 0.8 }).confidence, 0.8);
  assert.equal(v({ hours: 2, confidence: 80 }).confidence, 0.8, 'a percentage');
  assert.equal(v({ hours: 2, confidence: -1 }).confidence, 0);
  assert.equal(v({ hours: 2, confidence: 500 }).confidence, undefined);
  assert.equal(v({ hours: 2, confidence: 'sure' }).confidence, undefined);
  assert.equal(v({ hours: 2, explanation: 'x'.repeat(1000) }).explanation.length, 600);
  assert.equal(v({ hours: 2, explanation: 'a\u0000b\u0007c\nd' }).explanation, 'abc\nd');
  assert.equal(v({ hours: 2, explanation: '😀'.repeat(700) }).explanation, '😀'.repeat(600), 'cut on whole characters');
  const lists = v({ hours: 2, assumptions: Array.from({ length: 12 }, () => 'y'.repeat(300)), missing: 'One thing' });
  assert.equal(lists.assumptions.length, 8);
  assert.ok(lists.assumptions.every(s => s.length === 200));
  assert.deepEqual(lists.missing, ['One thing']);
  assert.deepEqual(v({ hours: 2, comparables: ['T-1', 'T-1', 'bad id!', 7, { id: 'x' }] }).comparables, ['T-1', '7']);
  assert.deepEqual(v({ hours: 2, outcomes: [{ metricId: 'kr_1' }, { metricId: '<script>' }, 'kr_2'] }).outcomes, [{ metricId: 'kr_1', why: '' }]);
  assert.equal(v({ hours: 2, kind: 'spaceship' }).kind, undefined);
  assert.equal(v({ hours: 2, deliverables: 2.4 }).deliverables, 2);
  assert.equal(v({ hours: 2, deliverables: 0 }).deliverables, undefined);
  /* unknown keys are dropped, and a "__proto__" key from JSON.parse changes nothing */
  const r = S.validateAi(JSON.parse('{"hours":3,"__proto__":{"admin":true},"isAdmin":true,"final":true}'), D);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.value), ['hours']);
  assert.equal(r.value.admin, undefined);
  assert.equal({}.admin, undefined);
  assert.ok(r.errors[0].startsWith('Ignored unknown fields:'));
  const errs = S.validateAi({ hours: 500, storyPoints: 4, confidence: 80 }, D).errors;
  assert.ok(errs.includes('hours 500 kept within 0.25–80 h.'));
  assert.ok(errs.some(e => e.startsWith('storyPoints must be one of 1, 2, 3, 5, 8, 13')));
  assert.ok(errs.includes('confidence 80 read as a percentage: 0.8.'));
});

/* ---------- the AI cache key ---------- */
test('inputHash is stable under key order, spacing, case and label order, and changes with what the AI is told', () => {
  const task = { title: 'Feed post for Ramadan', description: 'Three posts.\nWarm colours.', brief: { tpl: 'social', goal: 'Sell', channel: 'IG' }, assetCount: 3, labels: ['promo', 'ig'], team: 'design' };
  const h = S.inputHash(task);
  assert.match(h, /^[0-9a-f]{16}$/);
  assert.equal(S.inputHash(task), h);
  const same = [
    { team: 'design', labels: ['ig', 'promo', 'IG'], assetCount: 3, brief: { channel: 'IG', goal: 'Sell', tpl: 'social' }, description: 'Three posts.\nWarm colours.', title: 'Feed post for Ramadan' },
    Object.assign({}, task, { title: '  feed   POST for ramadan ', description: 'Three posts.   Warm colours.  ' }),
    Object.assign({}, task, { brief: { tpl: 'social', goal: ' Sell ', channel: 'IG', audience: '', notes: null } }),
    Object.assign({}, task, { assetCount: undefined, deliverables: 3 }),
    Object.assign({}, task, { comments: [{ text: 'not part of the brief' }], updatedAt: '2026-10-16' })
  ];
  same.forEach((t, i) => assert.equal(S.inputHash(t), h, 'same #' + i));
  const different = [
    { title: 'Feed post for Eid' }, { description: 'Four posts.' }, { brief: { tpl: 'social', goal: 'Awareness', channel: 'IG' } },
    { brief: { tpl: 'event', goal: 'Sell', channel: 'IG' } }, { assetCount: 4 }, { labels: ['promo', 'ig', 'urgent'] }, { team: 'video' }
  ];
  different.forEach(change => assert.notEqual(S.inputHash(Object.assign({}, task, change)), h, JSON.stringify(change)));
  assert.match(S.inputHash(null), /^[0-9a-f]{16}$/);
  assert.equal(S.inputHash({}), S.inputHash({ title: '', labels: [], brief: null }));
});

/* ---------- the defaults, the sentences, purity ---------- */
test('ENGINE_DEFAULTS hold the plan\'s numbers, frozen; defaults() is a copy to change', () => {
  assert.deepEqual(Object.keys(D), ['hours', 'story', 'weighted', 'ai', 'bonus', 'assets']);
  assert.ok(Object.isFrozen(D.assets.perKind));
  assert.deepEqual([D.assets.on, D.assets.countUnvalidated, D.assets.unknownKind], [false, true, 1]);
  assert.ok(Object.isFrozen(D) && Object.isFrozen(D.hours.templates.feed) && Object.isFrozen(D.bonus.hourMapping.bands[0]));
  const b = D.bonus;
  assert.deepEqual([b.on, b.grace, b.rewardFactor, b.maxRate, b.minE, b.minA, b.reviewBelowRatio], [false, 0.1, 0.5, 0.2, 1, 0.25, 0.4]);
  assert.deepEqual(JSON.parse(JSON.stringify(b.hourMapping.bands)), [[1, 1], [2, 2], [4, 3], [8, 5], [16, 8], [999, 13]]);
  assert.equal(b.baseSource, 'weighted_else_mapping');
  assert.equal(b.negative, false);
  assert.equal(b.retroactive, false);
  assert.deepEqual(Object.assign({}, D.weighted.weights), { complexity: 0.4, scope: 0.3, uncertainty: 0.2, dependencies: 0.1 });
  assert.equal(D.weighted.scaleMax, 10);
  assert.deepEqual(Object.assign({}, D.hours.complexity), { 1: 0.8, 2: 0.9, 3: 1, 4: 1.25, 5: 1.5 });
  assert.deepEqual(Object.assign({}, D.hours.dependency), { 0: 1, 1: 1.1, 2: 1.2, 3: 1.3 });
  assert.deepEqual(Object.assign({}, D.hours.bounds), { min: 0.25, max: 80 });
  assert.equal(D.ai.minConfidence, 0.6);
  const copy = S.defaults();
  copy.bonus.grace = 0.5;
  copy.hours.templates.feed.perUnit = 9;
  assert.equal(D.bonus.grace, 0.1);
  assert.equal(D.hours.templates.feed.perUnit, 2);
  assert.deepEqual(S.STORY_SCALE, [1, 2, 3, 5, 8, 13]);
});

test('every reason is a known sentence, so the page can show it in either language', () => {
  const runs = [
    eff(8, 5, 8), eff(8, 7.5, 8), eff(8, 10, 8), eff(10, 3, 10), S.efficiency({}, { E: 0.5, A: 0.1 }), eff(8, 5, 8, { scopeChanged: true }),
    S.hours(D.hours, { kind: 'feed', units: 3, complexity1to5: 4, openDeps: 2 }), S.hours(D.hours, { kind: 'carousel', units: 2, openDeps: 1 }),
    S.hours(D.hours, { perUnit: 100 }), S.hours(D.hours, { perUnit: 0.1 }), S.hours(D.hours, {}),
    S.storyPoints(D.story, all(5)), S.storyPoints(D.story, { complexity: 9 }), S.weightedPoints(D.weighted, all(2)),
    S.basePoints(D.bonus, { weightedFinal: 5 }), S.basePoints(D.bonus, { lockedHours: 3 }), S.basePoints(D.bonus, { lockedHours: 3000 }), S.basePoints(D.bonus, {}),
    S.allocate(9.1, [1, 1, 1]), S.allocate(1, []), S.allocate(1, [0]), S.allocate('x', [1]),
    S.progress({ baseline: 0, target: 10, actual: 12 }), S.progress({ baseline: 10, target: 0, actual: 12, direction: 'down' }), S.progress({}),
    S.progress({ baseline: 1, target: 1, actual: 1 }), S.progress({ baseline: 1, target: 0, actual: 1 }), S.progress({ baseline: 0, target: 1, actual: 1, direction: 'down' }),
    S.rollup([{ progress: 0.5 }, { progress: null }]), S.rollup([]), S.rollup([{ progress: 1, weight: 0 }])
  ];
  const known = new Set(Object.values(S.SENTENCES));
  for (const r of runs) {
    assert.ok(r.steps.length && r.steps.length === r.explanation.length);
    r.steps.forEach((s, i) => {
      assert.ok(known.has(s.key), s.key);
      assert.equal(r.explanation[i], S.fill(s.key, s.vars));
      assert.doesNotMatch(r.explanation[i], /\{\w+\}/, 'every placeholder filled');
    });
  }
  assert.equal(S.fill('Bonus {bonus} poin, dasar {B}', { bonus: '1.10', B: 8 }), 'Bonus 1.10 poin, dasar 8');
  assert.equal(S.fill('{n} jam', { n: 2.5 }, v => String(v).replace('.', ',')), '2,5 jam');
});

test('the engine is pure: no clock, no randomness, no page, no imports, and it never changes its inputs', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'shared', 'scoring-engine.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const banned of [/\bDate\b/, /Math\.random/, /\bdocument\b/, /localStorage/, /\brequire\s*\(/, /\bprocess\./, /\bfetch\s*\(/]) assert.doesNotMatch(code, banned);
  const freeze = o => { Object.values(o).forEach(v => { if (v && typeof v === 'object') freeze(v); }); return Object.freeze(o); };
  const settings = freeze(S.defaults());
  const task = freeze({ title: 'x', labels: ['b', 'a'], brief: { tpl: 't', z: 'y' } });
  assert.doesNotThrow(() => {
    S.hours(settings.hours, freeze({ kind: 'feed', units: 2 }));
    S.storyPoints(settings.story, freeze(all(3)));
    S.weightedPoints(settings.weighted, freeze(all(3)));
    S.basePoints(settings.bonus, freeze({ lockedHours: 3 }));
    S.efficiency(settings.bonus, freeze(Object.assign({ E: 8, A: 5, B: 8 }, OK)));
    S.allocate(9.1, freeze([1, 2, 3]));
    S.allocate(9.1, freeze({ a: 1, b: 2 }));
    S.progress(freeze({ baseline: 0, target: 1, actual: 0.5 }));
    S.rollup(freeze([freeze({ progress: 0.5 })]));
    S.validateAi(freeze({ hours: 500, factors: freeze({ complexity: 9 }), assumptions: freeze(['a']) }), settings);
    S.inputHash(task);
  });
  assert.deepEqual(task.labels, ['b', 'a']);
});

/* ---------- the same numbers in the browser ---------- */
test('the page built by build.js carries the same engine, and it gives the same numbers as require()', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'shared', 'scoring-engine.js'), 'utf8').replace(/\r\n/g, '\n');
  for (const file of [['public', 'index.html'], ['dist', 'creative-os-standalone.html']]) {
    const html = fs.readFileSync(path.join(__dirname, '..', ...file), 'utf8');
    const at = html.indexOf('SMART SCORING ENGINE (Oct 2026)');
    assert.ok(at > 0, file.join('/') + ' has the engine — run node build.js');
    const start = html.lastIndexOf('<script>', at) + '<script>'.length, end = html.indexOf('</script>', at);
    const inlined = html.slice(start, end);
    assert.equal(inlined, source, file.join('/') + ' carries the current engine — run node build.js');
    const page = {};
    vm.createContext(page);
    vm.runInContext(inlined, page);
    const B = page.ScoringEngine;
    assert.ok(B && typeof B.efficiency === 'function', 'the browser global ScoringEngine');
    const same = (name, ...args) => assert.deepEqual(JSON.parse(JSON.stringify(B[name](...args))), JSON.parse(JSON.stringify(S[name](...args))), name);
    const acceptance = B.efficiency(B.ENGINE_DEFAULTS.bonus, Object.assign({ E: 8, A: 5, B: 8 }, OK));
    assert.equal(acceptance.bonus, 1.1);
    assert.equal(acceptance.earned, 9.1);
    same('efficiency', D.bonus, Object.assign({ E: 8, A: 5, B: 8 }, OK));
    same('efficiency', D.bonus, { E: 8, A: 7.5, B: 8 });
    same('hours', D.hours, { kind: 'feed', units: 3, complexity1to5: 4, openDeps: 2 });
    same('storyPoints', D.story, { complexity: 5, scope: 5, uncertainty: 4, dependencies: 3 });
    same('weightedPoints', D.weighted, { complexity: 5, scope: 4, uncertainty: 3, dependencies: 2 });
    same('basePoints', D.bonus, { lockedHours: 6 });
    same('allocate', 9.1, [1, 1, 1]);
    same('progress', { baseline: 10, target: 2, actual: 6, direction: 'down' });
    same('rollup', [{ progress: 0.5, weight: 2 }, { progress: null }]);
    same('validateAi', { hours: 500, storyPoints: 4, confidence: 80, factors: { complexity: 7 } }, D);
    same('inputHash', { title: 'Feed  post', description: 'Été — 😀', labels: ['b', 'a'], brief: { tpl: 'x', goal: 'Sell' }, assetCount: 3 });
    same('assetPoints', D.assets, { kind: 'logo', split: { a: 2, b: 1 }, validated: { by: 'l', split: { a: 2, b: 2 }, total: 4 } });
    same('kindOf', 'Logo concept');
    assert.equal(B.round2(0.1 + 0.2), 0.3);
  }
});
