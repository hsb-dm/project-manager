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

/* KPIs and OKRs (server/outcomes.js): progress only from evidence, within 0–100%, moving the right way, never made up */
test('a KPI or key result moves towards its target with its evidence, stays within 0–100% and is never made up', () => {
  const O = require('../server/outcomes.js').pure;
  const rule = (type, extra) => O.ruleOf(Object.assign({ type }, extra || {}));
  const kpi = (o, ev, manual) => O.metricProgress(Object.assign({ baseline: 0, target: 40, direction: 'up', rule: rule('approved_assets') }, o), ev, manual);
  /* more approved assets never lower an increasing KPI; a burn-down never rises against its target */
  let up = -1, down = -1;
  for (let n = 0; n <= 60; n += 3) {
    const a = kpi({}, { count: n ? 1 : 0, total: n }), b = kpi({ baseline: 30, target: 0, direction: 'down', rule: rule('tasks_completed') }, { count: n, total: n });
    for (const p of [a, b]) assert.ok(p.progress.value >= 0 && p.progress.value <= 1, 'within 0–100% (' + n + ')');
    assert.ok(a.progress.value >= up, 'more assets never lower it (' + n + ')'); up = a.progress.value;
    assert.ok(b.progress.value >= down, 'each completion brings a burn-down closer (' + n + ')'); down = b.progress.value;
  }
  assert.equal(kpi({}, { count: 0, total: 0 }).progress.value, 0, 'nothing counted: no progress');
  assert.equal(kpi({}, { count: 3, total: 10 }).progress.value, 0.25, '10 of 40 assets is a quarter');
  /* nothing to measure against: no number, a reason */
  for (const [o, why] of [[{ target: 0 }, 'zero_range'], [{ target: null }, 'missing_data'], [{ baseline: null }, 'missing_data'], [{ target: -5 }, 'direction_mismatch']])
    assert.deepEqual([kpi(o, { count: 2, total: 2 }).progress.value, kpi(o, { count: 2, total: 2 }).progress.reason], [null, why], JSON.stringify(o));
  /* by hand: the reading itself, clamped; no reading, no progress */
  const sat = v => kpi({ baseline: 7.2, target: 8.5, rule: rule('manual') }, null, v == null ? null : { value: v }).progress;
  assert.deepEqual([sat(null).value, sat(null).reason], [null, 'no_value']);
  assert.equal(sat(9.5).value, 1, 'past the target counts as 100%'); assert.equal(sat(6).value, 0, 'below the baseline as 0%');
  assert.ok(sat(7.9).value > 0.5 && sat(7.9).value < 0.6, '7.9 on 7.2 → 8.5 is a little over half');
});

test('a task adds only what is verified, and an objective is never more than its best key result nor less than its worst', () => {
  const O = require('../server/outcomes.js').pure;
  const m = type => ({ rule: O.ruleOf({ type }), period: { start: null, end: null } });
  const done = o => Object.assign({ id: 'T-1', status: 'done', kind: 'closed', meta: { assetSplitOk: { total: 5, at: '2026-10-10T03:00:00.000Z' } }, completedAt: '2026-10-11T03:00:00.000Z', labels: [], alsoIn: [] }, o);
  assert.equal(O.wanted(m('approved_assets'), done()).value, 5, 'the validated total of a finished task');
  assert.equal(O.wanted(m('approved_assets'), done({ status: 'progress', kind: 'work' })).value, null, 'not finished: nothing');
  assert.equal(O.wanted(m('approved_assets'), done({ status: 'declined' })).value, null, 'declined: nothing');
  assert.equal(O.wanted(m('approved_assets'), done({ meta: {} })).value, null, 'not validated: nothing');
  assert.equal(O.wanted(m('approved_assets'), done({ meta: { assetSplitOk: { total: -4 } } })).value, null, 'never negative');
  assert.equal(O.wanted(m('tasks_completed'), done()).value, 1, 'a finished task is one');
  assert.equal(O.wanted(m('manual'), done()).value, null, 'a manual metric counts no task');
  /* the objective sits between its key results; raising one never lowers it; a key result weighing 0 changes nothing */
  const obj = krs => O.objectiveProgress(krs.map(([p, w]) => ({ progress: { value: p }, weight: w, status: 'active' }))).value;
  for (const set of [[[0.2, 1], [0.8, 3]], [[0, 2], [1, 2], [0.5, 1]], [[0.4, 1]]]) {
    const v = obj(set), ps = set.map(x => x[0]);
    assert.ok(v >= Math.min(...ps) - 1e-9 && v <= Math.max(...ps) + 1e-9, 'between its key results');
    assert.ok(obj(set.map((x, i) => (i === 0 ? [Math.min(1, x[0] + 0.1), x[1]] : x))) >= v - 1e-9, 'raising a key result never lowers it');
    assert.equal(obj(set.concat([[0, 0]])), v, 'a key result weighing 0 is not counted');
  }
  assert.equal(obj([]), null, 'no key results: no progress');
});

/* What the server's Calculate gives (server/scoring.js): the kind of work from the title, the asset count as the
   deliverables, the task's open dependencies, and the Scope rating suggested from the asset count — the numbers a
   creative team would expect for tasks as they are really written, English or Indonesian. */
test('Calculate, as the server works it out, gives sensible hours for real tasks and a Scope that grows with the asset count', () => {
  const calc = require('../server/scoring.js').calculate;
  const set = require('../shared/scoring-settings.js').normalizeSettings({});
  const hoursFor = (title, assetCount, openDeps, inputs) => calc(set, { title, assetCount }, { module: 'hours', inputs: inputs || {} }, { openDeps: openDeps || 0 });
  const within = (title, n, lo, hi) => { const r = hoursFor(title, n); assert.ok(r.value >= lo && r.value <= hi, title + ' × ' + n + ': ' + r.value + ' h is outside ' + lo + '–' + hi); return r; };
  assert.equal(within('Feed post Ramadan', 5, 6, 6).final, 6, 'five feed posts: 6 h');
  assert.equal(within('Konten feed Ramadan', 5, 6, 6).inputs.kind, 'feed', 'Indonesian too');
  within('Instagram carousel', 1, 3, 6);
  assert.equal(within('Resize banner ke 12 ukuran', 12, 3, 7).inputs.kind, 'resize', 'a resize is not a banner');
  within('Reels promo Ramadan', 3, 10, 18);
  within('Logo refresh', 1, 6, 16);
  within('Caption Ramadan', 1, 0.5, 3);
  within('Landing page webinar', 1, 6, 20);
  within('Newsletter Oktober', 1, 2, 5);
  within('Story set', 8, 4, 9);
  const none = hoursFor('Quarterly sync', 1);
  assert.equal(none.value, null, 'a title that names no kind: no number made up'); assert.equal(none.final, null); assert.equal(none.reason, 'no_template');
  for (const title of ['Feed post Ramadan', 'Resize banner', 'Reels promo', 'Poster A3', 'Logo refresh', 'Deck update']) {
    let last = 0;
    for (let n = 0; n <= 30; n++) {
      const r = hoursFor(title, n);
      assert.ok(r.value >= last, title + ': ' + n + ' deliverables recommend fewer hours than ' + (n - 1));
      assert.ok(r.value >= set.hours.bounds.min && r.value <= set.hours.bounds.max, title + ' × ' + n + ' outside the bounds');
      assert.ok(r.final >= 0.5 && r.final * 2 === Math.round(r.final * 2) && Math.abs(r.final - r.value) <= 0.25 + 1e-9, title + ' × ' + n + ': the task gets ' + r.final + ' h for ' + r.value);
      if (n >= 2) assert.ok(r.value - hoursFor(title, n - 1).value <= hoursFor(title, 1).value + 1e-9, title + ': an added piece costs more than the first');
      last = r.value;
    }
    let dep = 0;
    for (let d = 0; d <= 5; d++) { const h = hoursFor(title, 3, d).value; assert.ok(h >= dep, title + ': more open dependencies, fewer hours'); dep = h; }
    let cx = 0;
    for (let c = 1; c <= 5; c++) { const h = hoursFor(title, 3, 0, { complexity: c }).value; assert.ok(h >= cx, title + ': more complex, fewer hours'); cx = h; }
  }
  /* the Scope suggestion: the agreed bands, never down as the count grows, always a rating */
  const scopeAt = n => calc(set, { title: 'Feed post', assetCount: n }, { module: 'story', ratings: { complexity: 3, uncertainty: 3, dependencies: 3 } }).inputs.ratings.scope;
  assert.deepEqual([1, 2, 3, 4, 6, 7, 12, 13, 40].map(scopeAt), [1, 2, 2, 3, 3, 4, 4, 5, 5]);
  let last = 0, sp = 0, wp = 0;
  for (let n = 0; n <= 40; n++) {
    const sc = scopeAt(n); assert.ok(sc >= last && sc >= 1 && sc <= 5, n + ' assets: Scope ' + sc); last = sc;
    const story = calc(set, { title: 'Feed post', assetCount: n }, { module: 'story', ratings: { complexity: 3, uncertainty: 2, dependencies: 1 } });
    const weighted = calc(set, { title: 'Feed post', assetCount: n }, { module: 'weighted', ratings: { complexity: 3, uncertainty: 2, dependencies: 1 } });
    assert.equal(story.inputs.sources.scope, 'assets', 'and it says where it came from');
    assert.ok(story.value >= sp && weighted.value >= wp, n + ' assets: more deliverables, fewer points'); sp = story.value; wp = weighted.value;
    assert.ok(S.STORY_SCALE.includes(story.value)); assert.ok(weighted.value >= 1 && weighted.value <= set.weighted.scaleMax);
  }
  assert.ok(sp <= 5, 'a big set of simple, certain, independent work is not a 13-point task: ' + sp);
});

/* the time log (server/scoring-time.js): Actual is the work and revision logged, near enough to the minutes to be
   trusted, never below zero, never from blocked time, never less for more work */
test('the time log\'s Actual is the work and revision logged, to the quarter hour, and never counts blocked time', () => {
  const T = require('../server/scoring-time.js').math;
  let last = 0;
  for (let m = 0; m <= 3000; m++) {
    const h = T.actualHours(m);
    assert.ok(h >= 0, 'never negative'); assert.ok(h >= last, 'more minutes never give less (' + m + ')'); last = h;
    assert.equal(Math.round(h * 4), h * 4, 'quarter hours');
    if (m > 0) assert.ok(h > 0, 'a minute logged is never shown as nothing');
    if (m >= 8) assert.ok(Math.abs(h * 60 - m) <= 7.5, m + ' minutes shown as ' + h + ' h');
  }
  assert.equal(T.actualHours(-30), 0); assert.equal(T.actualHours(480), 8, 'a working day is 8 h');
  const e = (userId, kind, minutes, deletedAt) => ({ userId, kind, minutes, deletedAt });
  const base = [e('a', 'work', 90), e('a', 'revision', 30), e('b', 'work', 45)];
  const t = T.totals(base);
  assert.deepEqual(t.minutes, { work: 135, revision: 30, blocked: 0 });
  assert.equal(t.actualHours, T.actualHours(165), 'Actual is the sum of work and revision');
  for (const blocked of [1, 30, 480, 1440]) assert.equal(T.totals(base.concat([e('a', 'blocked', blocked), e('b', 'blocked', blocked)])).actualHours, t.actualHours, 'blocked time never counts');
  assert.equal(T.totals(base.concat([e('a', 'work', 600, '2026-10-01')])).actualHours, t.actualHours, 'a deleted entry never counts');
  assert.ok(T.totals(base.concat([e('b', 'revision', 60)])).actualHours > t.actualHours, 'revision is work');
  assert.equal(t.byPerson.a.work + t.byPerson.b.work, t.minutes.work, 'the people add up to the task');
  /* the limits a creative team would call reasonable */
  assert.equal(T.LIMITS.maxMinutes, 1440); assert.equal(T.LIMITS.maxDayMinutes, 1440); assert.equal(T.LIMITS.daysBack, 60); assert.equal(T.LIMITS.longDayFactor, 1.5);
  assert.deepEqual(T.dayWindow(Date.parse('2026-10-16T12:00:00Z')), { latest: '2026-10-17', earliest: '2026-08-17' }, 'today anywhere on Earth, 60 days back');
});

/* the task panel (src/scoring-panel.js), run as the page runs it: the Scope it suggests from the assets produced and
   the hours it previews with them as the deliverables */
test('the Scope suggested from the assets produced, and the hours previewed from them, make sense', () => {
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), Settings = require('../shared/scoring-settings.js');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'scoring-panel.js'), 'utf8');
  const c = { UI_ID: {}, UI_LANG: 'en', tr: s => s, console, ScoringEngine: S, I: {}, assetCount: t => Math.max(0, +(t && t.assetCount) || 0),
    estKind: title => (/post|feed/i.test(title) ? ['feed'] : /resize/i.test(title) ? ['resize'] : /reel/i.test(title) ? ['reels'] : null),
    unresolvedDependencies: () => [], scoringSettings: () => Settings.normalizeSettings({}) };
  vm.createContext(c); vm.runInContext(src.slice(src.indexOf('<script>') + 8, src.indexOf('</script>')), c);
  const sug = c.scrScopeFromAssets;
  assert.equal(sug(0), null, 'no assets recorded: nothing suggested, nothing made up');
  assert.deepEqual([1, 2, 3, 4, 6, 7, 12, 13, 40].map(sug), [1, 2, 2, 3, 3, 4, 4, 5, 5], 'the bands: 1, 2–3, 4–6, 7–12, 13 or more');
  let last = 0;
  for (let n = 1; n <= 200; n++) { const v = sug(n); assert.ok(v >= 1 && v <= 5, n + ' assets: Scope ' + v); assert.ok(v >= last, 'more assets never suggest a smaller Scope (' + n + ')'); last = v; }
  /* with the suggested Scope and the rest fixed, more assets never give fewer points */
  let sp = 0, wp = 0;
  for (let n = 1; n <= 40; n++) { const r = ratings(3, sug(n), 2, 1), s = S.storyPoints(D.story, r).value, w = S.weightedPoints(D.weighted, r).value;
    assert.ok(s >= sp && w >= wp, n + ' assets: ' + s + ' SP, ' + w + ' pts'); assert.ok(w >= 1 && w <= D.weighted.scaleMax); sp = s; wp = w; }
  assert.equal(S.storyPoints(D.story, ratings(3, sug(5), 3, 2)).value, 3, 'five posts of ordinary work: 3 story points');
  /* the hours previewed: the assets produced are the deliverables; none recorded counts as one, never as zero hours */
  const prev = (title, assetCount, cx) => c.scrCompute('hours', c.scrHoursInputs({ title, assetCount }, cx ? { complexity1to5: cx } : {})).value;
  assert.equal(prev('Feed post', 0), hours('feed', 1), 'no assets recorded yet: one deliverable');
  let h = 0;
  for (let n = 1; n <= 30; n++) { const v = prev('Feed posts', n); assert.ok(v > h, n + ' posts: ' + v + ' h'); if (n > 1) assert.ok(v - h < hours('feed', 1), 'each next post costs less than the first'); h = v; }
  assert.equal(prev('Resize the banner', 12, 2), hours('resize', 12, 2), 'the preview is the engine\'s number');
  assert.equal(prev('Something new', 3), null, 'a kind the title does not name: no hours made up');
  assert.ok(prev('Three reels', 3) >= 10 && prev('Three reels', 3) <= 18, 'three reels');
});
