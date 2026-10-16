/* Smart Scoring's recommendations make sense (Oct 2026). The engine's exact formulas are tests/scoring-engine.test.js;
   this file holds it to what a creative team would call reasonable, so a change to a default that gives silly numbers
   fails here: the hours for real kinds of work stay in plausible ranges, more work never recommends less, and every
   score moves the right way with its inputs; the efficiency bonus stays small, bounded and never negative. */
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../shared/scoring-engine.js');
const D = S.defaults();
const hours = (kind, units, complexity1to5 = 3, openDeps = 0) => S.hours(D.hours, { kind, units, complexity1to5, openDeps }).value;
const ratings = (complexity, scope, uncertainty, dependencies) => ({ complexity, scope, uncertainty, dependencies });

test('the hours recommended for real kinds of work are in plausible ranges', () => {
  const within = (h, lo, hi, what) => assert.ok(h >= lo && h <= hi, what + ': ' + h + ' h is outside ' + lo + '–' + hi);
  within(hours('feed', 1), 1, 3, 'one feed post');
  within(hours('feed', 5), 4, 9, 'five feed posts');
  within(hours('feed', 10), 7, 15, 'ten feed posts');
  within(hours('story', 8), 4, 9, 'eight stories');
  within(hours('resize', 12, 2), 3, 7, 'twelve resizes');
  within(hours('carousel', 1), 3, 6, 'one carousel');
  within(hours('reels', 1), 4, 10, 'one reel');
  within(hours('reels', 3), 10, 18, 'three reels');
  within(hours('video', 1, 4, 3), 8, 20, 'a complex video waiting on three things');
  within(hours('logo', 1, 5), 10, 24, 'a demanding logo');
  within(hours('copy', 1, 1), 0.25, 2, 'a simple caption');
  assert.equal(S.hours(D.hours, { kind: 'nothing-like-this', units: 1 }).value, null, 'no template: no number made up');
});

/* the whole of today's estimator, run as the page runs it: a comment left open once swallowed its table, and only a
   check on the running file — not on a slice of its text — notices */
test('today\'s estimator, run whole, gives the engine\'s hours for every kind and count', () => {
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
  const c = { UI_ID: {}, UI_LANG: 'en', tr: s => s, console, document: { addEventListener() {} } };
  vm.createContext(c);
  /* the page inlines the engine first; the estimator's kinds and hours are built from it */
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared', 'scoring-engine.js'), 'utf8'), c);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'effort-estimate.js'), 'utf8').replace(/<\/?script>/g, ''), c);
  assert.equal(typeof c.estKindHours, 'function'); assert.ok(Array.isArray(c.EST_KINDS) && c.EST_KINDS.length === Object.keys(D.hours.templates).length, 'the table is there');
  for (const k of c.EST_KINDS) for (let n = 1; n <= 6; n++)
    assert.equal(S.round2(c.estKindHours(k, n).h), hours(k[0], n), k[0] + ' × ' + n + ': the estimator and the engine disagree');
});

test('more work never recommends fewer hours, and an added piece costs less than the first', () => {
  for (const kind of Object.keys(D.hours.templates)) {
    let last = 0;
    for (let n = 1; n <= 12; n++) {
      const h = hours(kind, n);
      assert.ok(h >= last, kind + ': ' + n + ' deliverables recommend less than ' + (n - 1));
      if (n > 1) assert.ok(h - last <= hours(kind, 1) + 1e-9, kind + ': the ' + n + 'th piece costs more than the first');
      last = h;
    }
    for (let c = 2; c <= 5; c++) assert.ok(hours(kind, 2, c) > hours(kind, 2, c - 1), kind + ': complexity ' + c + ' is not more work');
    for (let d = 1; d <= 3; d++) assert.ok(hours(kind, 2, 3, d) > hours(kind, 2, 3, d - 1), kind + ': ' + d + ' open dependencies are not more work');
    const t = D.hours.templates[kind];
    assert.ok(t.low <= t.perUnit && t.perUnit <= t.high, kind + ': typical inside its range');
    assert.ok(t.nextUnitFactor > 0 && t.nextUnitFactor < 1, kind + ': a next piece is quicker than the first, and is some work');
  }
  assert.ok(hours('video', 40, 5, 3) <= D.hours.bounds.max, 'never above the bound');
});

test('story points and weighted points rise with every factor and agree with each other', () => {
  const keys = ['complexity', 'scope', 'uncertainty', 'dependencies'];
  assert.equal(S.storyPoints(D.story, ratings(3, 3, 3, 3)).value, 3, 'a middling task is a middling score');
  assert.equal(S.storyPoints(D.story, ratings(1, 1, 1, 1)).value, 1);
  assert.equal(S.storyPoints(D.story, ratings(5, 4, 5, 4)).split, false, 'very hard but not everything at the top: no split asked');
  assert.equal(S.storyPoints(D.story, ratings(5, 5, 5, 5)).split, true, 'everything at the top: split it');
  for (const k of keys) for (let r = 1; r < 5; r++) {
    const lo = ratings(3, 3, 3, 3), hi = ratings(3, 3, 3, 3); lo[k] = r; hi[k] = r + 1;
    assert.ok(S.storyPoints(D.story, hi).value >= S.storyPoints(D.story, lo).value, 'story points fall when ' + k + ' rises');
    assert.ok(S.weightedPoints(D.weighted, hi).value > S.weightedPoints(D.weighted, lo).value, 'weighted points do not rise with ' + k);
  }
  /* the same ratings never put the two on opposite ends */
  for (const r of [ratings(1, 1, 1, 1), ratings(2, 3, 2, 1), ratings(4, 4, 3, 2), ratings(5, 5, 5, 5)]) {
    const s = S.STORY_SCALE.indexOf(S.storyPoints(D.story, r).value) / (S.STORY_SCALE.length - 1), w = (S.weightedPoints(D.weighted, r).value - 1) / (D.weighted.scaleMax - 1);
    assert.ok(Math.abs(s - w) <= 0.35, 'story ' + s.toFixed(2) + ' and weighted ' + w.toFixed(2) + ' disagree for ' + JSON.stringify(r));
  }
});

test('base points grow with the locked hours and are never the raw hours', () => {
  let last = 0;
  for (const h of [0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 40, 80]) {
    const b = S.basePoints(D.bonus, { lockedHours: h });
    assert.equal(b.source, 'hour_mapping'); assert.ok(b.value >= last, h + ' h gives fewer points than less work');
    if (h >= 8) assert.ok(b.value < h, h + ' h is counted as ' + b.value + ' points: hours taken for points');
    last = b.value;
  }
});

test('the efficiency bonus stays small, bounded and fair', () => {
  const ok = { completed: true, qualityApproved: true, scopeChanged: false, validLogs: true };
  const run = (E, A, B) => S.efficiency(D.bonus, Object.assign({ E, A, B }, ok));
  let last = -1;
  for (let A = 8; A >= 0.5; A -= 0.25) {
    const r = run(8, A, 5);
    assert.ok(r.bonus >= 0, 'never negative'); assert.ok(r.bonus <= 5 * D.bonus.maxRate + 1e-9, 'never above the cap');
    assert.ok(r.bonus >= last - 1e-9, 'saving more never earns less (A ' + A + ')'); last = r.bonus;
    assert.equal(S.round2(r.earned), S.round2(5 + r.bonus));
    if ((8 - A) / 8 <= D.bonus.grace) assert.equal(r.bonus, 0, 'within the grace a bonus is not earned');
    assert.equal(r.needsReview, A / 8 < D.bonus.reviewBelowRatio, 'far quicker than estimated is looked at (A ' + A + ')');
  }
  assert.equal(run(8, 12, 5).bonus, 0, 'over the estimate: no bonus and nothing taken away');
  assert.equal(run(8, 12, 5).earned, 5);
  const shared = S.allocate(run(8, 5, 8).earned, { a: 3, b: 2 });
  assert.equal(Math.round((shared.values.a + shared.values.b) * 100), 910, 'a shared task gives out exactly what it earned');
});

test('points for assets produced follow the work: a logo is not a resize, more assets never earn less, nothing negative', () => {
  const per = kind => S.assetPoints(D.assets, { kind, split: { a: 1 } }).pointsPerAsset;
  const pts = (kind, n, extra) => S.assetPoints(D.assets, Object.assign({ kind, split: { a: n } }, extra)).total;
  assert.ok(per('logo') > per('resize'), 'a logo earns more than a resize');
  assert.ok(per('video') > per('feed'), 'a video earns more than a feed post');
  assert.ok(per('reels') > per('story'), 'a reel earns more than a story');
  assert.ok(per('carousel') > per('feed'), 'a carousel earns more than one feed post');
  assert.equal(per('feed'), 1, 'one feed post is the anchor: 1 point');
  assert.equal(per('something we have never seen'), 1, 'a kind not known counts like a feed post');
  for (const kind of S.KIND_IDS) {
    const p = per(kind), hours = D.hours.templates[kind].perUnit;
    assert.ok(p >= 0.25 && p <= 5, kind + ': ' + p + ' points per asset is outside 0.25–5');
    assert.ok(p <= Math.round(hours / 2 * 4) / 4, kind + ': ' + p + ' points is more than half the ' + hours + ' h a piece takes');
    let last = 0;
    for (let n = 1; n <= 30; n++) {
      const t = pts(kind, n);
      assert.ok(t >= last, kind + ': ' + n + ' assets earn fewer points than ' + (n - 1)); last = t;
      assert.ok(Math.abs(t - S.round2(n * p)) < 0.011, kind + ': ' + n + ' assets are not ' + n + ' × ' + p);
    }
  }
  /* kinds that take clearly longer per piece never earn fewer points per asset */
  for (const a of S.KIND_IDS) for (const b of S.KIND_IDS)
    if (D.hours.templates[a].perUnit >= 2 * D.hours.templates[b].perUnit) assert.ok(per(a) >= per(b), a + ' takes twice the hours of ' + b + ' but earns less per asset');
  /* a lead's validation never adds points, and counting only validated counts never gives more */
  const strict = Object.assign({}, D.assets, { countUnvalidated: false });
  for (const v of [undefined, { split: { a: 3 }, total: 3 }, { split: { a: 5 }, total: 5 }])
    for (const n of [0, 1, 3, 4, 8]) {
      const lenient = S.assetPoints(D.assets, { kind: 'poster', split: { a: n }, validated: v }).total, only = S.assetPoints(strict, { kind: 'poster', split: { a: n }, validated: v }).total;
      assert.ok(only <= lenient + 1e-9 && only >= 0, 'validated only: ' + only + ' vs ' + lenient);
      assert.equal(lenient, pts('poster', n), 'validation does not change what a count earns by default');
    }
  assert.equal(pts('logo', -5), 0, 'never negative');
});
