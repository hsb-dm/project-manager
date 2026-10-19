/* ============================================================
   SMART SCORING ENGINE (Oct 2026) — the arithmetic of Smart Scoring, worked out the same way everywhere.
   One file, used three ways: the server and the tests require() it, and build.js inlines it into the page, where it
   is the global ScoringEngine — so the number a task panel previews is the number the server stores. It is pure: no
   clock, no randomness, no page, no database and no settings module. Each function is handed the already normalized
   settings sub-object it needs (settings.hours, .story, .weighted or .bonus; validateAi takes the whole settings
   object, because it needs both hours and weighted) and the task's numbers, and gives back the answer together with
   the inputs it used and why. A missing or odd setting falls back to ENGINE_DEFAULTS field by field, and the whole
   settings object passed where a sub-object is expected works too.

   Why, in two forms. `explanation` is a list of plain English sentences. `steps` is the same list as {key, vars}:
   key is the English sentence with {placeholders} (every one is in SENTENCES), so the page can show it in either
   language with fill(tr(step.key), step.vars). Points in sentences have two decimals (1.10); hours and percentages
   up to two.

   round2(x) → number
     Two decimals, half away from zero, without binary noise: 0.1 + 0.2 → 0.3, 1.005 → 1.01, 8 × 0.1375 → 1.1.
     Anything that is not a finite number (or a number written as text) gives NaN. Ratios inside the engine are
     cleaned to 12 significant digits, so 0.375 − 0.1 is 0.275 and not 0.27499999999999997.

   hours(settings.hours, {kind, units, complexity1to5, openDeps, perUnit?, nextUnitFactor?})
     → {value, unit:"h", low, high, bounded, reason, inputs, factors, explanation, steps}
     value = perUnit × (1 + nextUnitFactor × (units − 1)) × complexity[c] × dependency[d], kept within
     bounds.min–bounds.max, 2 decimals. perUnit and nextUnitFactor come from templates[kind] unless given. The first
     deliverable counts in full and each next one at nextUnitFactor — the kind's own share, as src/effort-estimate.js has it,
     1 is the spec's straight perUnit × units, 0 is work made as one piece whatever the count. c is the 1–5
     complexity rating (3 when not rated; `complexity` is accepted for complexity1to5); d is the number of open
     dependencies, read at the highest key of the dependency table not above it. low and high are the template's
     usual range through the same factors. No template and no perUnit: value null, reason "no_template".

   storyPoints(settings.story, {complexity, scope, uncertainty, dependencies})
     → {index, value, split, scale, thresholds, missing, reason, inputs, explanation, steps}
     index = Σ weight × rating, the weights scaled to total 1 and the ratings whole numbers 1–5 (others are rounded
     and clamped, with a sentence). value is the scale 1, 2, 3, 5, 8, 13 at the first of the five ascending
     thresholds the index is at most, 13 above the last; split is true at 13, a suggestion to split the task. A
     weighted factor left unrated: value null, reason "missing_ratings", and `missing` names it.

   weightedPoints(settings.weighted, ratings) → {index, value, scaleMax, mappingVersion, missing, reason, inputs, …}
     The index as above with the weighted weights (by default complexity 40%, scope 30%, uncertainty 20%,
     dependencies 10%), spread evenly over the point scale: value = 1 + (index − 1) ÷ 4 × (scaleMax − 1), 2 decimals,
     so index 1 is 1 point and index 5 is scaleMax (10 by default). mappingVersion is handed back to be stored.

   basePoints(settings.bonus, {weightedFinal, lockedHours}) → {value, source, band, reason, inputs, explanation, steps}
     The one base B of the efficiency bonus. With baseSource "weighted_else_mapping" (the default) and a final
     Weighted Points value above 0, that value, source "weighted" — pass weightedFinal only while the Weighted Points
     module is on. Otherwise the LOCKED hours through hourMapping.bands, a list of [up to hours, points]: the first band
     the hours are at most, the top band when they are above all of them, source "hour_mapping". By default ≤ 1 h is
     1, ≤ 2 h 2, ≤ 4 h 3, ≤ 8 h 5, ≤ 16 h 8 and more 13. Hours are never used as points themselves. baseSource
     "mapping" always uses the bands. No locked hours: value null, reason "no_locked_hours".

   efficiency(settings.bonus, {E, A, B, completed, qualityApproved, scopeChanged, validLogs})
     → {eligible, reasons, bonus, earned, base, potentialBonus, savedRatio, eligibleSavings, multiplier, savedHours,
        actualRatio, varianceHours, varianceRatio, needsReview, inputs, policy, explanation, steps}
     The spec's §7.2 formula, with E the locked estimated hours, A the verified actual hours and B the base points:
       savedRatio      = clamp((E − A) ÷ E, 0, 1)
       eligibleSavings = max(0, savedRatio − grace)
       multiplier      = min(maxRate, eligibleSavings × rewardFactor)
       bonus           = round2(B × multiplier), earned = round2(B + bonus)
     Defaults: grace 0.10, rewardFactor 0.5, maxRate 0.20, minE 1 h, minA 0.25 h, reviewBelowRatio 0.4. E = 8, A = 5,
     B = 8 gives 0.375, 0.275, 0.1375, a bonus of 1.10 and 9.10 earned; E = 8, A = 7.5 is within the grace, no bonus.
     Eligible only when every condition holds; each one that does not adds its code to `reasons`, in this order:
     not_completed (completed is not true), quality_not_approved (qualityApproved is not true), scope_changed
     (scopeChanged is truthy), invalid_time_logs (validLogs is not true), no_locked_estimate (E missing or 0) or
     estimate_below_minimum (E under minE), no_actual_time (A missing or 0) or actual_below_minimum (A under minA),
     no_base_points (B missing or 0). Not eligible: bonus 0 and earned = B, while potentialBonus still says what the
     formula gives, for a pending award. A over E saves nothing, so the bonus is 0 — never negative, whatever the
     policy — and varianceHours (A − E) and varianceRatio ((A − E) ÷ E) report the estimation variance instead.
     needsReview is true when A ÷ E is under reviewBelowRatio: a flag for the reviewer, never an accusation. The
     caller checks the rest of the policy (the bonus switched on, pilot teams, a lock approved by someone other than
     the assignee after bonus.enabledAt).

   allocate(total, shares) → {total, values, inputs, explanation, steps}
     Splits the total, rounded to 2 decimals, in proportion to the shares: an array of numbers, or an object of id →
     number, and `values` comes back in the same form. Each part is cut down to whole cents and the cents left over
     all go to the largest share (the first of equal ones), so the parts add up to the total cent for cent. No
     positive share at all: an equal split. Nobody to share between: no values.

   progress({baseline, target, actual, direction:"up"|"down"}) → {value, raw, reason, inputs, explanation, steps}
     up: (actual − baseline) ÷ (target − baseline); down: (baseline − actual) ÷ (baseline − target); value is raw
     clamped to 0–1 (anything but "down" is "up"). value null with a reason: missing_data (a number missing; null or
     empty is missing, 0 is not), zero_range (the target equals the baseline), direction_mismatch (an "up" target
     below its baseline, a "down" target above it).

   rollup([{progress, weight}]) → {value, counted, ignored, totalWeight, reason, inputs, explanation, steps}
     The weighted mean of the key results' progress, each clamped to 0–1, weight 1 when not given; a progress()
     result is accepted as the progress. A key result with null progress is left out, and the explanation says how
     many were. Nothing left: value null, reason no_progress (or zero_weight when the rest all weigh 0).

   validateAi(reply, settings) → {ok, value, errors}
     Cleans an AI reply already parsed from JSON. Kept: kind (an active one of settings.kinds, else a template id), deliverables (a whole number 1–500),
     factors (the four ratings, whole numbers 1–5), hours (above 0, kept within settings.hours.bounds), storyPoints
     (only 1, 2, 3, 5, 8 or 13), weightedPoints (kept within 1–settings.weighted.scaleMax), confidence (0–1; above 1
     up to 100 is read as a percentage, above 100 dropped), explanation (600 characters at most), assumptions and
     missing (8 items of 200 characters at most), comparables (8 task ids at most) and outcomes (8 {metricId, why} at
     most, why 200 characters). Every other key is dropped; numbers written as text are read; each fix is a sentence
     in `errors`. ok is true when hours, story points, weighted points or a factor rating survived; value is the
     cleaned reply then, and null otherwise.

   inputHash(task) → 16 hexadecimal characters
     FNV-1a (two 32-bit passes) over the task as the AI is told about it: title, description, brief fields (the
     template id with them), deliverable count (deliverables, else assetCount), labels, team and kind (only if given). Text in Unicode NFC,
     spaces collapsed, lower case; brief keys and labels sorted; an empty field is the same as a missing one. The same
     task gives the same hash in the browser and on the server, whatever the key order or spacing — the AI cache key,
     with the settings' configVersion.

   KINDS (built-ins), KIND_LIMITS, kindMatch(title, kinds) → {id, keyword}|null, kindOf(title, kinds), kindPick(task, kinds)
   (an active meta.kind), kindOfTask = kindPick || kindOf(title), kindKeyword. The first active kind of the list (else
   KINDS) with a keyword in the title: text, never a pattern, whole words ("copy" is not "copywriter"), any case; a final
   * takes longer words (video* → videografi).

   assetPoints(settings.assets, {kind, split, validated, validatedSplit?, validatedTotal?})
     → {perPerson: {id: {count, counted, points, validated, changedSinceValidation, validatedCount}}, total,
        totalAssets, pointsPerAsset, kind, kindKnown, countUnvalidated, isValidated, reason, inputs, explanation, steps}
     Output points for the assets each person produced on a task (meta.assetSplit, or as the reports credit them):
     points = count × the points one asset of this kind of work is worth (perKind[kind]; a kind not known, or none,
     takes unknownKind), 2 decimals; total is their sum. Anchored at one feed post = 1 point, about a piece's typical
     hours ÷ 2: a resize 0.25, a logo 5 — a logo is not a resize. split is {userId: count}; counts below or at 0 are
     left out and a count is never negative. validated is the task's meta.assetSplitOk ({by, at, split, total}, as a
     team lead validated it; without a split object it is not a validation) or true/false with validatedSplit and
     validatedTotal given apart. A person's count is validated when it is what the lead validated (their own number
     when the validation holds per person, else the task's total), changedSinceValidation when it differs now. With
     countUnvalidated (the default) every count counts and is only marked; without it a count never validated earns
     nothing yet, and one changed since earns at most what was validated (min of the two) until validated again.
     The caller checks that the module is on. Points from assets are output credit, kept apart from hours, base
     points and the bonus — never the base of the efficiency bonus.

   ENGINE_DEFAULTS (frozen; defaults() gives a copy to change) holds the plan's §3.2 defaults of the six sub-objects:
   hours (the 14 kinds of KINDS as templates, the hours today's estimator has always used — the kinds made per
   deliverable at its own share: resize 0.25, copy, deck and logo 0.4, poster, reels and video 0.6, the rest 0.5 —
   the complexity and dependency tables, bounds 0.25–80 h),
   story, weighted, ai, bonus and assets (off; every count counts; per kind of work: resize 0.25, story and copy
   0.75, feed 1, poster, banner and email 1.5, carousel 2, reels, key visual and deck 3, video 4, logo and web 5;
   a kind not known 1). shared/scoring-settings.js owns normalizing and the rest of the settings, and can take these
   numbers from here.
   ============================================================ */
(function (root) {
  'use strict';

  const ENGINE_VERSION = 1;
  const INPUT_HASH_VERSION = 1;
  const FACTORS = ['complexity', 'scope', 'uncertainty', 'dependencies'];
  const STORY_SCALE = [1, 2, 3, 5, 8, 13];
  const DEFAULT_NEXT_UNIT = 0.6;

  /* ---------- the defaults (plan §3.2) ---------- */
  const tpl = (perUnit, low, high, nextUnitFactor) => ({ perUnit, low, high, nextUnitFactor });
  const factorWeights = () => ({ complexity: 0.4, scope: 0.3, uncertainty: 0.2, dependencies: 0.1 });
  function deepFreeze(o) { Object.keys(o).forEach(k => { if (o[k] && typeof o[k] === 'object') deepFreeze(o[k]); }); return Object.freeze(o); }
  const ENGINE_DEFAULTS = deepFreeze({
    hours: {
      /* src/effort-estimate.js EST_KINDS: [id, …, typical, low, high, each next deliverable at] → {perUnit, low, high, nextUnitFactor} */
      templates: {
        carousel: tpl(4, 3, 6, 0.5), story: tpl(1.5, 1, 3, 0.5), reels: tpl(6, 4, 10, 0.6), video: tpl(8, 4, 16, 0.6),
        kv: tpl(6, 4, 10, 0.5), resize: tpl(1.5, 0.5, 3, 0.25), feed: tpl(2, 1, 3, 0.5), poster: tpl(3, 2, 5, 0.6),
        banner: tpl(3, 2, 5, 0.5), copy: tpl(1.5, 0.5, 3, 0.4), deck: tpl(6, 3, 10, 0.4), logo: tpl(10, 6, 16, 0.4),
        web: tpl(10, 6, 20, 0.5), email: tpl(3, 2, 5, 0.5)
      },
      complexity: { 1: 0.8, 2: 0.9, 3: 1, 4: 1.25, 5: 1.5 },
      dependency: { 0: 1, 1: 1.1, 2: 1.2, 3: 1.3 },
      bounds: { min: 0.25, max: 80 },
      lockPolicy: 'approve_or_work_start'
    },
    story: { weights: factorWeights(), thresholds: [1.5, 2.5, 3.5, 4.25, 4.75] },
    weighted: { weights: factorWeights(), scaleMax: 10, mappingVersion: 1 },
    ai: { minConfidence: 0.6, onCreate: false, onBriefRevision: false, perUserDaily: 20, workspaceDaily: 200, comparables: 'team' },
    bonus: {
      on: false, enabledAt: null, grace: 0.10, rewardFactor: 0.5, maxRate: 0.20, minE: 1, minA: 0.25, reviewBelowRatio: 0.4,
      materialChangeHours: 0.25, baseSource: 'weighted_else_mapping',
      hourMapping: { type: 'bands', bands: [[1, 1], [2, 2], [4, 3], [8, 5], [16, 8], [999, 13]] },
      completionStages: null, requireApprovedVersion: true, minQuality: null, independentApproval: true,
      allowSelfApproval: false, perPeriodCap: null, pilotTeams: [], negative: false, retroactive: false
    },
    /* points for one asset produced, per kind of work: one feed post = 1, about a piece's typical hours ÷ 2 */
    assets: {
      on: false, countUnvalidated: true,
      perKind: {
        carousel: 2, story: 0.75, reels: 3, video: 4, kv: 3, resize: 0.25, feed: 1, poster: 1.5,
        banner: 1.5, copy: 0.75, deck: 3, logo: 5, web: 5, email: 1.5
      },
      unknownKind: 1
    }
  });
  const defaults = () => JSON.parse(JSON.stringify(ENGINE_DEFAULTS));

  /* ---------- the kinds of work, and how a title says which (the one matcher: page and server) ---------- */
  const kindDef = (id, name, nameId, kw) => Object.freeze({ id, name, nameId: nameId || name, keywords: Object.freeze(kw.split(',')) });
  const KINDS = Object.freeze([
    kindDef('carousel', 'carousel', 'karosel', 'carousel*,karosel*'),
    kindDef('story', 'story', '', 'story,stories,insta story*,instastory*,ig story*,igstory*'),
    kindDef('reels', 'reels or short video', 'reels atau video pendek', 'reel,reels,tiktok*,shorts,short video*,video pendek*'),
    kindDef('video', 'video', '', 'video*,motion*,animation*,animasi*'),
    kindDef('kv', 'key visual', '', 'kv,key visual*,keyvisual*'),
    kindDef('resize', 'resize or adaptation', 'resize atau adaptasi', 'resize*,adaptasi*,adaptation*,turunan*'),
    kindDef('feed', 'feed post', 'post feed', 'feed,feeds,post,posts,posting*,konten,instagram*,facebook*,linkedin*,social media*,sosmed*,media sosial*'),
    kindDef('poster', 'poster or flyer', 'poster atau flyer', 'poster*,flyer*,leaflet*,brosur*,brochure*,pamflet*'),
    kindDef('banner', 'banner or ad', 'banner atau iklan', 'banner*,ad,ads,iklan*,periklanan*,billboard*,baliho*,spanduk*'),
    kindDef('copy', 'copywriting', '', 'copywriting*,copy,caption*,naskah*,script*,artikel*,article*,blog'),
    kindDef('deck', 'presentation', 'presentasi', 'deck,presentation*,presentasi*,ppt,pitch*'),
    kindDef('logo', 'logo or brand identity', 'logo atau identitas brand', 'logo,branding*,rebranding*,brand identity*,identitas brand*'),
    kindDef('web', 'web page', 'halaman web', 'landing page*,landingpage*,website*,web page*,webpage*,halaman web*'),
    kindDef('email', 'email or newsletter', 'email atau newsletter', 'email,newsletter*,edm')
  ]);
  const KIND_IDS = KINDS.map(k => k.id), KIND_LIMITS = Object.freeze({ kinds: 50, keywords: 40, keyword: 40, name: 40 });
  const EDGE = '(?:^|[^\\p{L}\\p{N}])', END = '(?![\\p{L}\\p{N}])';
  const textOf = v => String(v == null ? '' : v).normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  function kindKeyword(v) {
    if (typeof v !== 'string') return '';
    const s = textOf(v), k = s.replace(/\*/g, '').trim(), n = Array.from(k).length;
    return !n || n > KIND_LIMITS.keyword || !/[\p{L}\p{N}]/u.test(k) ? '' : k + (s.endsWith('*') && n > 2 ? '*' : '');
  }
  const kindsOf = x => (Array.isArray(x) ? x : isObj(x) && Array.isArray(x.kinds) ? x.kinds : KINDS);
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reOf = w => (w.endsWith('*') ? esc(w.slice(0, -1)) : esc(w) + END);
  /* per list, each active kind's keywords as escaped text between word edges: one expression a kind */
  const compiled = new WeakMap();
  function compile(list) {
    if (!compiled.has(list)) compiled.set(list, list.filter(k => isObj(k) && k.active !== false).map(k => {
      const kws = (Array.isArray(k.keywords) ? k.keywords : []).map(kindKeyword).filter(Boolean);
      return { id: k.id, kws, re: kws.length ? new RegExp(EDGE + '(?:' + kws.map(reOf).join('|') + ')', 'u') : null };
    }));
    return compiled.get(list);
  }
  function kindMatch(title, kinds, idOnly) {
    const s = textOf(title), k = s ? compile(kindsOf(kinds)).find(x => x.re && x.re.test(s)) : null;
    return !k ? null : idOnly ? k.id : { id: k.id, keyword: k.kws.find(w => new RegExp(EDGE + reOf(w), 'u').test(s)) };
  }
  const kindOf = (title, kinds) => kindMatch(title, kinds, true);
  const kindPick = (task, kinds) => { const id = isObj(task) && isObj(task.meta) ? task.meta.kind : null; return kindsOf(kinds).some(k => isObj(k) && k.id === id && k.active !== false) ? id : null; };
  const kindOfTask = (task, kinds) => kindPick(task, kinds) || kindOf(isObj(task) ? task.title : '', kinds);

  /* ---------- the sentences (keys of `steps`; the page translates them with tr()) ---------- */
  const SENTENCES = {
    hNoTemplate: 'There is no template for this kind of work and no hours per deliverable were given, so there is no math estimate.',
    hTemplate: 'Template "{kind}": {perUnit} h for one deliverable.',
    hPerUnit: '{perUnit} h for one deliverable, as given.',
    hOne: 'One deliverable: ×1.',
    hWhole: '{units} deliverables made as one piece of work: ×1.',
    hUnits: '{units} deliverables, the first in full and each next one at {pct}%: ×{factor}.',
    hComplexityDefault: 'Complexity not rated, taken as 3 of 5: ×{mult}.',
    hComplexity: 'Complexity {rating} of 5: ×{mult}.',
    hNoDeps: 'No open dependencies: ×{mult}.',
    hOneDep: 'One open dependency: ×{mult}.',
    hDeps: '{deps} open dependencies: ×{mult}.',
    hProduct: '{perUnit} × {factor} × {cmult} × {dmult} = {raw} h.',
    hMin: 'Raised to the minimum of {min} h.',
    hMax: 'Capped at the maximum of {max} h.',
    hRange: 'The usual range for this work: {low}–{high} h.',
    fAdjusted: 'The {factor} rating {given} was read as {used} (ratings are whole numbers from 1 to 5).',
    fMissing: 'Rate every factor first; not rated yet: {factors}.',
    fIndex: 'Weighted index {index} = {terms}.',
    sBucket: 'The index {index} is at most {limit}: {points} story points.',
    sTop: 'The index {index} is above {limit}: 13 story points.',
    sSplit: '13 points is the largest size: consider splitting this task into smaller ones.',
    wMap: 'The index {index} on the 1–5 scale, spread evenly over 1–{max}: {points} points (mapping version {version}).',
    bWeighted: 'Base {points} points: the final Weighted Points.',
    bBand: 'Base {points} points: the locked {hours} h falls in the band up to {limit} h.',
    bTop: 'Base {points} points: the locked {hours} h is above every band, so the top band counts.',
    bNone: 'No base points: there is no locked hour estimate and no final Weighted Points.',
    bNotHours: 'Hours are never counted as points themselves; the bands turn them into points.',
    eSaved: 'Time saved: ({E} − {A}) ÷ {E} = {pct}% of the estimate.',
    eOver: 'It took {over} h more than the {E} h estimate ({pct}% over): no bonus, and points are never taken away.',
    eWithinGrace: 'Savings of {pct}% are within the {grace}% grace: no bonus.',
    eBeyond: 'Savings beyond the {grace}% grace: {pct}%.',
    eRate: 'Bonus rate: {eligible}% × {factor} = {rate}%.',
    eRateCapped: 'Bonus rate: {eligible}% × {factor} = {uncapped}%, capped at {max}%.',
    eBonus: 'Bonus: {B} × {rate}% = {bonus} points. Earned: {B} + {bonus} = {earned} points.',
    eWouldBe: 'When every condition is met, the bonus would be {bonus} points.',
    eNone: 'No bonus: earned stays at the base of {B} points.',
    eReview: 'Done in {pct}% of the estimated time, under {limit}%: a reviewer should look closely before approving.',
    rNotCompleted: 'The task is not completed yet.',
    rQuality: 'The work has not passed quality review.',
    rScope: 'The scope changed after the estimate was locked; it needs a new baseline first.',
    rLogs: 'The logged time is not valid or not verified yet.',
    rNoE: 'There is no locked estimate.',
    rMinE: 'The locked estimate of {E} h is under the {minE} h minimum.',
    rNoA: 'No working time is logged.',
    rMinA: 'The logged {A} h is under the {minA} h minimum.',
    rNoB: 'There are no base points.',
    aNoTotal: 'There is no total to share.',
    aNone: 'There is nobody to share {total} between.',
    aEqual: 'No shares were given, so {total} is split equally {n} ways.',
    aShares: '{total} split in proportion to each share.',
    aRemainder: 'The rounding remainder of {rem} goes to the largest share.',
    pMissing: 'No progress: {fields} missing.',
    pZero: 'No progress: the target equals the baseline ({baseline}), so there is nothing to measure against.',
    pUpWrong: 'No progress: an increasing metric needs a target above its baseline ({baseline}).',
    pDownWrong: 'No progress: a decreasing metric needs a target below its baseline ({baseline}).',
    pUp: 'Increasing: ({actual} − {baseline}) ÷ ({target} − {baseline}) = {pct}%.',
    pDown: 'Decreasing: ({baseline} − {actual}) ÷ ({baseline} − {target}) = {pct}%.',
    pAbove: 'Past the target: counted as 100%.',
    pBelow: 'Behind the baseline: counted as 0%.',
    uNone: 'No progress yet: no key result has a measured value.',
    uIgnored: '{n} of {total} key results have no measured progress yet and are left out.',
    uZero: 'No progress: the key results with a value all weigh 0.',
    uWeighted: 'Weighted progress of {n} key results: {pct}%.',
    apKind: 'Kind of work "{kind}": {per} points for each asset.',
    apUnknown: 'The kind of work is not known from the title: {per} points for each asset.',
    apNone: 'No assets produced yet.',
    apPerson: '{person}: {count} × {per} = {points} points.',
    apNotYet: '{person}: not validated by a lead yet; counted as entered.',
    apNotYetHeld: '{person}: not validated by a lead yet; no points until a lead validates it.',
    apChanged: '{person}: changed since a lead validated {validated}; counted as entered now.',
    apChangedHeld: '{person}: changed since a lead validated {validated}; {counted} counts until a lead validates it again.',
    apTotal: 'Total: {points} points for {assets} assets.'
  };
  /* efficiency() reason code → its sentence */
  const REASONS = {
    not_completed: SENTENCES.rNotCompleted, quality_not_approved: SENTENCES.rQuality, scope_changed: SENTENCES.rScope,
    invalid_time_logs: SENTENCES.rLogs, no_locked_estimate: SENTENCES.rNoE, estimate_below_minimum: SENTENCES.rMinE,
    no_actual_time: SENTENCES.rNoA, actual_below_minimum: SENTENCES.rMinA, no_base_points: SENTENCES.rNoB
  };

  /* ---------- small helpers ---------- */
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const NUM_TEXT = /^[-+]?(\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?$/i;
  /* a finite number, or a number written as text; null for anything else (null, '', NaN, true…) */
  function num(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string') { const s = v.trim(); if (NUM_TEXT.test(s)) { const n = Number(s); return Number.isFinite(n) ? n : null; } }
    return null;
  }
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  /* binary noise off: 0.27499999999999997 → 0.275 (12 significant digits) */
  const clean = x => (Number.isFinite(x) ? Number(x.toPrecision(12)) || 0 : x);
  const pct = x => clean(x * 100);
  function round2(x) {
    const n = num(x);
    if (n === null) return NaN;
    const cents = Math.round(Number((Math.abs(n) * 100).toPrecision(15)));
    return cents === 0 ? 0 : (n < 0 ? -cents : cents) / 100;
  }
  const p2 = x => round2(x).toFixed(2);
  const positive = (n, dflt) => (n !== null && n > 0 ? n : dflt);
  function setting(v, dflt, lo, hi) { const n = num(v); return n === null ? dflt : clamp(n, lo, hi); }
  /* the sub-object, also when the whole settings object was passed */
  function sub(o, name, probe) { if (!isObj(o)) return {}; return isObj(o[name]) && !probe.some(k => hasOwn(o, k)) ? o[name] : o; }

  function fill(template, vars, format) {
    const f = typeof format === 'function' ? format : v => (typeof v === 'number' ? String(round2(v)) : String(v));
    return String(template).replace(/\{(\w+)\}/g, (m, k) => (vars && hasOwn(vars, k) && vars[k] !== null && vars[k] !== undefined ? f(vars[k], k) : m));
  }
  function explainer() {
    const steps = [];
    return { add: (key, vars) => { steps.push({ key, vars: vars || {} }); }, done: () => ({ explanation: steps.map(s => fill(s.key, s.vars)), steps }) };
  }
  function boundsOf(hs) {
    const D = ENGINE_DEFAULTS.hours.bounds, b = isObj(hs.bounds) ? hs.bounds : D;
    let min = num(b.min), max = num(b.max);
    if (min === null || min < 0) min = D.min;
    if (max === null || max <= 0) max = D.max;
    return { min, max: Math.max(min, max) };
  }
  function scaleMaxOf(ws) { const n = num(ws.scaleMax); return n !== null && n >= 2 ? clamp(Math.round(n), 2, 100) : ENGINE_DEFAULTS.weighted.scaleMax; }

  /* ---------- Effort Hours ---------- */
  function depMultiplier(map, deps) {
    let best = null;
    Object.keys(map).forEach(k => { const n = Number(k); if (Number.isInteger(n) && n >= 0 && n <= deps && (best === null || n > best)) best = n; });
    return best === null ? 1 : positive(num(map[best]), 1);
  }
  function hours(hs, inputs) {
    hs = sub(hs, 'hours', ['templates', 'complexity', 'dependency', 'bounds']);
    inputs = isObj(inputs) ? inputs : {};
    const D = ENGINE_DEFAULTS.hours, ex = explainer();
    const templates = isObj(hs.templates) ? hs.templates : D.templates;
    const kind = typeof inputs.kind === 'string' && inputs.kind ? inputs.kind : null;
    const t = kind && hasOwn(templates, kind) && isObj(templates[kind]) ? templates[kind] : null;
    const given = num(inputs.perUnit), ownPerUnit = given !== null && given > 0 ? given : null;
    const perUnit = ownPerUnit !== null ? ownPerUnit : (t ? positive(num(t.perUnit), null) : null);
    const u = num(inputs.units), units = u === null ? 1 : clamp(Math.round(u), 1, 999);
    const nuGiven = num(inputs.nextUnitFactor), nuTpl = t ? num(t.nextUnitFactor) : null;
    const nextUnitFactor = clamp(nuGiven !== null ? nuGiven : nuTpl !== null ? nuTpl : DEFAULT_NEXT_UNIT, 0, 1);
    const cGiven = num(inputs.complexity1to5 !== undefined && inputs.complexity1to5 !== null ? inputs.complexity1to5 : inputs.complexity);
    const complexity = cGiven === null ? 3 : clamp(Math.round(cGiven), 1, 5);
    const d = num(inputs.openDeps), openDeps = d === null ? 0 : clamp(Math.round(d), 0, 999);
    const echo = { kind, units, complexity1to5: complexity, complexityRated: cGiven !== null, openDeps, perUnit, nextUnitFactor };
    if (perUnit === null) {
      ex.add(SENTENCES.hNoTemplate);
      return Object.assign({ value: null, unit: 'h', low: null, high: null, bounded: false, reason: 'no_template', inputs: echo, factors: null }, ex.done());
    }
    const cm = positive(num((isObj(hs.complexity) ? hs.complexity : D.complexity)[complexity]), 1);
    const dm = depMultiplier(isObj(hs.dependency) ? hs.dependency : D.dependency, openDeps);
    const unitsFactor = clean(1 + nextUnitFactor * (units - 1));
    const raw = clean(perUnit * unitsFactor * cm * dm);
    const { min, max } = boundsOf(hs);
    const value = round2(clamp(raw, min, max));
    if (ownPerUnit !== null) ex.add(SENTENCES.hPerUnit, { perUnit });
    else ex.add(SENTENCES.hTemplate, { kind, perUnit });
    if (units === 1) ex.add(SENTENCES.hOne);
    else if (nextUnitFactor === 0) ex.add(SENTENCES.hWhole, { units });
    else ex.add(SENTENCES.hUnits, { units, pct: pct(nextUnitFactor), factor: unitsFactor });
    ex.add(cGiven === null ? SENTENCES.hComplexityDefault : SENTENCES.hComplexity, { rating: complexity, mult: cm });
    ex.add(openDeps === 0 ? SENTENCES.hNoDeps : openDeps === 1 ? SENTENCES.hOneDep : SENTENCES.hDeps, { deps: openDeps, mult: dm });
    ex.add(SENTENCES.hProduct, { perUnit, factor: unitsFactor, cmult: cm, dmult: dm, raw: round2(raw) });
    if (raw < min) ex.add(SENTENCES.hMin, { min });
    else if (raw > max) ex.add(SENTENCES.hMax, { max });
    let low = null, high = null;
    if (ownPerUnit === null && t) {
      const lo = num(t.low), hi = num(t.high);
      if (lo !== null && hi !== null && lo > 0 && hi >= lo) {
        low = round2(clamp(clean(lo * unitsFactor * cm * dm), min, max));
        high = round2(clamp(clean(hi * unitsFactor * cm * dm), min, max));
        ex.add(SENTENCES.hRange, { low, high });
      }
    }
    return Object.assign({
      value, unit: 'h', low, high, bounded: raw < min || raw > max, reason: null, inputs: echo,
      factors: { perUnit, unitsFactor, complexityMultiplier: cm, dependencyMultiplier: dm, raw }
    }, ex.done());
  }

  /* ---------- the four factor ratings (Story Points and Weighted Points) ---------- */
  function factorIndex(weightsIn, defaultWeights, ratingsIn, ex) {
    const raw = {}; let sum = 0;
    FACTORS.forEach(f => { const w = isObj(weightsIn) ? num(weightsIn[f]) : null; raw[f] = w !== null && w > 0 ? w : 0; sum += raw[f]; });
    if (!(sum > 0)) { sum = 0; FACTORS.forEach(f => { raw[f] = defaultWeights[f]; sum += raw[f]; }); }
    const weights = {}; FACTORS.forEach(f => { weights[f] = clean(raw[f] / sum); });
    const rin = isObj(ratingsIn) ? ratingsIn : {}, ratings = {}, missing = [];
    FACTORS.forEach(f => {
      const r = num(rin[f]);
      if (r === null) { if (weights[f] > 0) missing.push(f); return; }
      const used = clamp(Math.round(r), 1, 5);
      if (used !== r) ex.add(SENTENCES.fAdjusted, { factor: f, given: r, used });
      ratings[f] = used;
    });
    if (missing.length) { ex.add(SENTENCES.fMissing, { factors: missing.join(', ') }); return { index: null, weights, ratings, missing }; }
    let index = 0; const terms = [];
    FACTORS.forEach(f => { if (weights[f] > 0) { index += weights[f] * ratings[f]; terms.push(pct(weights[f]) + '% × ' + ratings[f]); } });
    index = clean(index);
    ex.add(SENTENCES.fIndex, { index, terms: terms.join(' + ') });
    return { index, weights, ratings, missing };
  }
  function thresholdsOf(t) {
    if (!Array.isArray(t) || t.length !== 5) return null;
    const n = t.map(num);
    return n.some(x => x === null) ? null : n.sort((a, b) => a - b);
  }
  function storyPoints(ss, ratings) {
    ss = sub(ss, 'story', ['thresholds', 'weights']);
    const D = ENGINE_DEFAULTS.story, ex = explainer();
    const thresholds = thresholdsOf(ss.thresholds) || D.thresholds.slice();
    const fi = factorIndex(ss.weights, D.weights, ratings, ex);
    const rest = { scale: STORY_SCALE.slice(), thresholds, missing: fi.missing, inputs: { ratings: fi.ratings, weights: fi.weights } };
    if (fi.index === null) return Object.assign({ index: null, value: null, split: false, reason: 'missing_ratings' }, rest, ex.done());
    let i = thresholds.findIndex(t => fi.index <= t);
    if (i < 0) i = thresholds.length;
    const value = STORY_SCALE[i];
    if (i < thresholds.length) ex.add(SENTENCES.sBucket, { index: fi.index, limit: thresholds[i], points: value });
    else ex.add(SENTENCES.sTop, { index: fi.index, limit: thresholds[thresholds.length - 1] });
    if (value === 13) ex.add(SENTENCES.sSplit);
    return Object.assign({ index: fi.index, value, split: value === 13, reason: null }, rest, ex.done());
  }
  function weightedPoints(ws, ratings) {
    ws = sub(ws, 'weighted', ['weights', 'scaleMax', 'mappingVersion']);
    const D = ENGINE_DEFAULTS.weighted, ex = explainer();
    const scaleMax = scaleMaxOf(ws);
    const mv = num(ws.mappingVersion), mappingVersion = mv !== null && mv >= 1 ? Math.round(mv) : D.mappingVersion;
    const fi = factorIndex(ws.weights, D.weights, ratings, ex);
    const rest = { scaleMax, mappingVersion, missing: fi.missing, inputs: { ratings: fi.ratings, weights: fi.weights } };
    if (fi.index === null) return Object.assign({ index: null, value: null, reason: 'missing_ratings' }, rest, ex.done());
    const value = round2(1 + (fi.index - 1) / 4 * (scaleMax - 1));
    ex.add(SENTENCES.wMap, { index: fi.index, max: scaleMax, points: p2(value), version: mappingVersion });
    return Object.assign({ index: fi.index, value, reason: null }, rest, ex.done());
  }

  /* ---------- the base points B ---------- */
  function bandsOf(b) {
    if (!Array.isArray(b) || !b.length) return null;
    const out = [];
    for (const x of b) {
      if (!Array.isArray(x) || x.length < 2) return null;
      const lim = num(x[0]), pts = num(x[1]);
      if (lim === null || pts === null || lim <= 0 || pts < 0) return null;
      out.push([lim, pts]);
    }
    return out.sort((a, c) => a[0] - c[0]);
  }
  function basePoints(bs, inputs) {
    bs = sub(bs, 'bonus', ['baseSource', 'hourMapping', 'grace']);
    inputs = isObj(inputs) ? inputs : {};
    const ex = explainer();
    const baseSource = bs.baseSource === 'mapping' ? 'mapping' : 'weighted_else_mapping';
    const w = num(inputs.weightedFinal), h = num(inputs.lockedHours);
    const echo = { weightedFinal: w, lockedHours: h, baseSource };
    if (baseSource !== 'mapping' && w !== null && w > 0) {
      const value = round2(w);
      ex.add(SENTENCES.bWeighted, { points: p2(value) });
      return Object.assign({ value, source: 'weighted', band: null, reason: null, inputs: echo }, ex.done());
    }
    if (h === null || h <= 0) {
      ex.add(SENTENCES.bNone);
      return Object.assign({ value: null, source: null, band: null, reason: 'no_locked_hours', inputs: echo }, ex.done());
    }
    const bands = bandsOf(isObj(bs.hourMapping) ? bs.hourMapping.bands : null) || ENGINE_DEFAULTS.bonus.hourMapping.bands.map(b => b.slice());
    let band = bands.find(b => h <= b[0]);
    if (band) ex.add(SENTENCES.bBand, { points: p2(band[1]), hours: h, limit: band[0] });
    else { band = bands[bands.length - 1]; ex.add(SENTENCES.bTop, { points: p2(band[1]), hours: h }); }
    ex.add(SENTENCES.bNotHours);
    return Object.assign({ value: round2(band[1]), source: 'hour_mapping', band: band.slice(), reason: null, inputs: echo }, ex.done());
  }

  /* ---------- the efficiency bonus (spec §7.2) ---------- */
  function efficiency(policy, inputs) {
    policy = sub(policy, 'bonus', ['grace', 'rewardFactor', 'maxRate', 'minE', 'minA', 'reviewBelowRatio']);
    inputs = isObj(inputs) ? inputs : {};
    const D = ENGINE_DEFAULTS.bonus, ex = explainer(), why = [];
    const P = {
      grace: setting(policy.grace, D.grace, 0, 1),
      rewardFactor: setting(policy.rewardFactor, D.rewardFactor, 0, 10),
      maxRate: setting(policy.maxRate, D.maxRate, 0, 1),
      minE: setting(policy.minE, D.minE, 0, 1e6),
      minA: setting(policy.minA, D.minA, 0, 1e6),
      reviewBelowRatio: setting(policy.reviewBelowRatio, D.reviewBelowRatio, 0, 1)
    };
    const E = num(inputs.E), A = num(inputs.A), B = num(inputs.B);
    const echo = { E, A, B, completed: inputs.completed === true, qualityApproved: inputs.qualityApproved === true, scopeChanged: !!inputs.scopeChanged, validLogs: inputs.validLogs === true };
    const hasE = E !== null && E > 0, hasA = A !== null && A > 0, hasB = B !== null && B > 0;
    let savedRatio = null, eligibleSavings = null, multiplier = null, potentialBonus = null;
    let savedHours = null, actualRatio = null, varianceHours = null, varianceRatio = null, needsReview = false;
    if (hasE && hasA) {
      savedHours = round2(Math.max(0, E - A));
      actualRatio = clean(A / E);
      varianceHours = round2(A - E);
      varianceRatio = clean((A - E) / E);
      savedRatio = clean(clamp((E - A) / E, 0, 1));
      eligibleSavings = clean(Math.max(0, savedRatio - P.grace));
      const uncapped = clean(eligibleSavings * P.rewardFactor);
      multiplier = clean(Math.min(P.maxRate, uncapped));
      if (A > E) ex.add(SENTENCES.eOver, { over: varianceHours, E, pct: pct(varianceRatio) });
      else {
        ex.add(SENTENCES.eSaved, { E, A, pct: pct(savedRatio) });
        if (eligibleSavings > 0) {
          ex.add(SENTENCES.eBeyond, { grace: pct(P.grace), pct: pct(eligibleSavings) });
          ex.add(uncapped > P.maxRate ? SENTENCES.eRateCapped : SENTENCES.eRate, { eligible: pct(eligibleSavings), factor: P.rewardFactor, rate: pct(multiplier), uncapped: pct(uncapped), max: pct(P.maxRate) });
        } else ex.add(SENTENCES.eWithinGrace, { pct: pct(savedRatio), grace: pct(P.grace) });
      }
      if (hasB) potentialBonus = round2(B * multiplier);
      needsReview = actualRatio < P.reviewBelowRatio;
    }
    const unmet = (code, vars) => { why.push(code); ex.add(REASONS[code], vars); };
    if (!echo.completed) unmet('not_completed');
    if (!echo.qualityApproved) unmet('quality_not_approved');
    if (echo.scopeChanged) unmet('scope_changed');
    if (!echo.validLogs) unmet('invalid_time_logs');
    if (!hasE) unmet('no_locked_estimate'); else if (E < P.minE) unmet('estimate_below_minimum', { E, minE: P.minE });
    if (!hasA) unmet('no_actual_time'); else if (A < P.minA) unmet('actual_below_minimum', { A, minA: P.minA });
    if (!hasB) unmet('no_base_points');
    const eligible = why.length === 0;
    const bonus = eligible ? potentialBonus : 0;
    const earned = hasB ? round2(B + bonus) : null;
    if (eligible && bonus > 0) ex.add(SENTENCES.eBonus, { B: p2(B), rate: pct(multiplier), bonus: p2(bonus), earned: p2(earned) });
    else {
      if (!eligible && potentialBonus > 0) ex.add(SENTENCES.eWouldBe, { bonus: p2(potentialBonus) });
      if (hasB) ex.add(SENTENCES.eNone, { B: p2(B) });
    }
    if (needsReview) ex.add(SENTENCES.eReview, { pct: pct(actualRatio), limit: pct(P.reviewBelowRatio) });
    return Object.assign({
      eligible, reasons: why, bonus, earned, base: hasB ? round2(B) : null, potentialBonus,
      savedRatio, eligibleSavings, multiplier, savedHours, actualRatio, varianceHours, varianceRatio, needsReview,
      inputs: echo, policy: P
    }, ex.done());
  }

  /* ---------- sharing a total, cent for cent ---------- */
  function allocate(total, shares) {
    const ex = explainer();
    const isArr = Array.isArray(shares);
    const keys = isArr ? shares.map((_, i) => i) : isObj(shares) ? Object.keys(shares) : [];
    const weights = keys.map(k => { const w = num(shares[k]); return w !== null && w > 0 ? w : 0; });
    const shape = vals => { if (isArr) return vals; const o = {}; keys.forEach((k, i) => { o[k] = vals[i]; }); return o; };
    const t = num(total);
    const echo = { total: t, shares: shape(weights.slice()) };
    if (t === null) { ex.add(SENTENCES.aNoTotal); return Object.assign({ total: null, values: shape(keys.map(() => 0)), inputs: echo }, ex.done()); }
    const T = round2(t);
    if (!keys.length) { ex.add(SENTENCES.aNone, { total: p2(T) }); return Object.assign({ total: T, values: shape([]), inputs: echo }, ex.done()); }
    const cents = Math.round(Number((Math.abs(T) * 100).toPrecision(15)));
    let w = weights, W = w.reduce((a, b) => a + b, 0);
    if (!(W > 0)) { w = keys.map(() => 1); W = keys.length; ex.add(SENTENCES.aEqual, { total: p2(T), n: keys.length }); }
    else ex.add(SENTENCES.aShares, { total: p2(T) });
    const c = w.map(x => Math.floor(clean(cents * x / W)));
    const rem = cents - c.reduce((a, b) => a + b, 0);
    let big = 0;
    w.forEach((x, i) => { if (x > w[big]) big = i; });
    c[big] += rem;
    if (rem > 0) ex.add(SENTENCES.aRemainder, { rem: (rem / 100).toFixed(2) });
    return Object.assign({ total: T, values: shape(c.map(x => (x === 0 ? 0 : (T < 0 ? -x : x) / 100))), inputs: echo }, ex.done());
  }

  /* ---------- KPI and Key Result progress ---------- */
  function progress(inputs) {
    inputs = isObj(inputs) ? inputs : {};
    const ex = explainer();
    const direction = inputs.direction === 'down' ? 'down' : 'up';
    const baseline = num(inputs.baseline), target = num(inputs.target), actual = num(inputs.actual);
    const echo = { baseline, target, actual, direction };
    const none = (reason, key, vars) => { ex.add(key, vars); return Object.assign({ value: null, raw: null, reason, inputs: echo }, ex.done()); };
    const missing = [['baseline', baseline], ['target', target], ['actual', actual]].filter(x => x[1] === null).map(x => x[0]);
    if (missing.length) return none('missing_data', SENTENCES.pMissing, { fields: missing.join(', ') });
    if (target === baseline) return none('zero_range', SENTENCES.pZero, { baseline });
    if (direction === 'up' && target < baseline) return none('direction_mismatch', SENTENCES.pUpWrong, { baseline });
    if (direction === 'down' && target > baseline) return none('direction_mismatch', SENTENCES.pDownWrong, { baseline });
    const raw = clean(direction === 'up' ? (actual - baseline) / (target - baseline) : (baseline - actual) / (baseline - target));
    ex.add(direction === 'up' ? SENTENCES.pUp : SENTENCES.pDown, { actual, baseline, target, pct: pct(raw) });
    if (raw > 1) ex.add(SENTENCES.pAbove); else if (raw < 0) ex.add(SENTENCES.pBelow);
    return Object.assign({ value: clamp(raw, 0, 1), raw, reason: null, inputs: echo }, ex.done());
  }
  function rollup(krs) {
    const ex = explainer(), list = Array.isArray(krs) ? krs : [];
    let counted = 0, ignored = 0, sumW = 0, sumWP = 0;
    const items = list.map(k => {
      const o = isObj(k) ? k : {};
      const p = num(isObj(o.progress) ? o.progress.value : o.progress);
      const w0 = num(o.weight), weight = w0 === null ? 1 : Math.max(0, w0);
      if (p === null) { ignored++; return { progress: null, weight }; }
      const pc = clamp(p, 0, 1);
      counted++; sumW += weight; sumWP += weight * pc;
      return { progress: pc, weight };
    });
    const out = (value, reason) => Object.assign({ value, counted, ignored, totalWeight: clean(sumW), reason, inputs: { krs: items } }, ex.done());
    if (!counted) { ex.add(SENTENCES.uNone); return out(null, 'no_progress'); }
    if (ignored) ex.add(SENTENCES.uIgnored, { n: ignored, total: list.length });
    if (!(sumW > 0)) { ex.add(SENTENCES.uZero); return out(null, 'zero_weight'); }
    const value = clean(sumWP / sumW);
    ex.add(SENTENCES.uWeighted, { n: counted, pct: pct(value) });
    return out(value, null);
  }

  /* ---------- points for the assets produced, per person ---------- */
  /* {id: count} with the counts above 0 only, never negative; anything else is no counts */
  function countsOf(v) {
    const out = {};
    if (!isObj(v)) return out;
    Object.keys(v).forEach(id => { const n = num(v[id]); if (n !== null && n > 0) out[id] = clean(n); });
    return out;
  }
  function assetPoints(as, inputs) {
    as = sub(as, 'assets', ['perKind', 'unknownKind', 'countUnvalidated']);
    inputs = isObj(inputs) ? inputs : {};
    const D = ENGINE_DEFAULTS.assets, ex = explainer();
    const perKind = isObj(as.perKind) ? as.perKind : {};
    const kind = typeof inputs.kind === 'string' && inputs.kind ? inputs.kind : null;
    const given = kind && hasOwn(perKind, kind) ? num(perKind[kind]) : null;
    const kindKnown = !!kind && (given !== null || hasOwn(D.perKind, kind));
    const unknownKind = setting(as.unknownKind, D.unknownKind, 0, 20);
    const per = round2(given !== null ? clamp(given, 0, 20) : kindKnown ? D.perKind[kind] : unknownKind);
    const countUnvalidated = typeof as.countUnvalidated === 'boolean' ? as.countUnvalidated : D.countUnvalidated;
    /* the lead's validation: meta.assetSplitOk itself, or true/false with its counts given apart */
    const vin = inputs.validated, vObj = isObj(vin) ? vin : null;
    const isValidated = vObj ? isObj(vObj.split) : vin === true;
    const vSplit = countsOf(inputs.validatedSplit !== undefined ? inputs.validatedSplit : vObj ? vObj.split : null);
    const vt = num(inputs.validatedTotal !== undefined ? inputs.validatedTotal : vObj ? vObj.total : null);
    const vTotal = vt === null ? null : Math.max(0, vt);
    const perPersonCheck = Object.keys(vSplit).length > 0;
    const split = countsOf(inputs.split), ids = Object.keys(split);
    const totalAssets = clean(ids.reduce((n, id) => n + split[id], 0));
    const differs = (a, b) => Math.abs(a - b) > 1e-9;
    ex.add(kindKnown ? SENTENCES.apKind : SENTENCES.apUnknown, { kind, per: p2(per) });
    const perPerson = {};
    let total = 0;
    ids.forEach(id => {
      const count = split[id];
      const validatedCount = !isValidated ? null : perPersonCheck ? (vSplit[id] || 0) : vTotal !== null ? vTotal : count;
      const changed = isValidated &&(perPersonCheck ? differs(count, vSplit[id] || 0) : vTotal !== null && differs(totalAssets, vTotal));
      const ok = isValidated && !changed;
      const counted = countUnvalidated || ok ? count : changed ? clean(Math.min(count, validatedCount)) : 0;
      const points = round2(counted * per);
      total += points;
      perPerson[id] = { count, counted, points, validated: ok, changedSinceValidation: changed, validatedCount };
      ex.add(SENTENCES.apPerson, { person: id, count: counted, per: p2(per), points: p2(points) });
      if (!isValidated) ex.add(countUnvalidated ? SENTENCES.apNotYet : SENTENCES.apNotYetHeld, { person: id });
      else if (changed) ex.add(countUnvalidated ? SENTENCES.apChanged : SENTENCES.apChangedHeld, { person: id, validated: validatedCount, counted });
    });
    total = round2(total);
    if (!ids.length) ex.add(SENTENCES.apNone);
    else ex.add(SENTENCES.apTotal, { points: p2(total), assets: totalAssets });
    return Object.assign({
      perPerson, total, totalAssets, pointsPerAsset: per, kind, kindKnown, countUnvalidated, isValidated,
      reason: ids.length ? null : 'no_assets',
      inputs: { kind, split, validated: isValidated, validatedSplit: vSplit, validatedTotal: vTotal }
    }, ex.done());
  }

  /* ---------- what the AI says, cleaned before anything stores it ---------- */
  const AI_KEYS = ['kind', 'deliverables', 'factors', 'hours', 'storyPoints', 'weightedPoints', 'confidence', 'explanation', 'assumptions', 'missing', 'comparables', 'outcomes'];
  const ID_TEXT = /^[-\w.:]{1,64}$/;
  const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
  const short = v => Array.from(typeof v === 'string' ? v : JSON.stringify(v) || String(v)).slice(0, 40).join('');
  function cut(s, max) {
    const chars = Array.from(String(s).replace(CONTROL, '').trim());
    return { text: chars.length > max ? chars.slice(0, max).join('').trim() : chars.join(''), cut: chars.length > max };
  }
  function textList(v, name, errors) {
    const list = Array.isArray(v) ? v : typeof v === 'string' ? [v] : null;
    if (!list) { errors.push(name + ' must be a list of short texts; dropped.'); return null; }
    let odd = 0, long = 0;
    const out = [];
    list.forEach(x => { if (typeof x !== 'string') { odd++; return; } const c = cut(x, 200); if (c.cut) long++; if (c.text) out.push(c.text); });
    if (odd) errors.push(odd + ' ' + name + ' that are not text were dropped.');
    if (long) errors.push(long + ' ' + name + ' shortened to 200 characters.');
    if (out.length > 8) errors.push('Only the first 8 ' + name + ' were kept.');
    return out.length ? out.slice(0, 8) : null;
  }
  function validateAi(reply, settings) {
    if (!isObj(reply)) return { ok: false, value: null, errors: ['The AI reply is not a JSON object.'] };
    settings = isObj(settings) ? settings : {};
    const hs = isObj(settings.hours) ? settings.hours : {}, ws = isObj(settings.weighted) ? settings.weighted : {};
    const { min, max } = boundsOf(hs), scaleMax = scaleMaxOf(ws);
    const templates = isObj(hs.templates) ? hs.templates : ENGINE_DEFAULTS.hours.templates;
    const errors = [], v = {};
    const has = k => hasOwn(reply, k) && reply[k] !== null && reply[k] !== undefined;
    const unknown = Object.keys(reply).filter(k => !AI_KEYS.includes(k));
    if (unknown.length) errors.push('Ignored unknown fields: ' + unknown.slice(0, 10).map(short).join(', ') + (unknown.length > 10 ? ' and ' + (unknown.length - 10) + ' more' : '') + '.');
    if (has('kind')) {
      const k = typeof reply.kind === 'string' ? reply.kind.trim() : '';
      const known = Array.isArray(settings.kinds) ? settings.kinds.some(x => isObj(x) && x.id === k && x.active !== false) : hasOwn(templates, k);
      if (k && known) v.kind = k; else errors.push('kind ' + short(reply.kind) + ' is not a known kind of work; dropped.');
    }
    if (has('deliverables')) {
      const n = num(reply.deliverables);
      if (n === null || n < 1) errors.push('deliverables must be a whole number of at least 1; dropped.');
      else { const r = clamp(Math.round(n), 1, 500); if (r !== n) errors.push('deliverables ' + short(reply.deliverables) + ' read as ' + r + '.'); v.deliverables = r; }
    }
    if (has('factors')) {
      if (!isObj(reply.factors)) errors.push('factors must be an object of ratings; dropped.');
      else {
        const f = {};
        Object.keys(reply.factors).forEach(k => { if (!FACTORS.includes(k)) errors.push('Ignored unknown factor ' + short(k) + '.'); });
        FACTORS.forEach(k => {
          if (!hasOwn(reply.factors, k) || reply.factors[k] === null || reply.factors[k] === undefined) return;
          const n = num(reply.factors[k]);
          if (n === null) { errors.push('The ' + k + ' rating is not a number; dropped.'); return; }
          const r = clamp(Math.round(n), 1, 5);
          if (r !== n) errors.push('The ' + k + ' rating ' + short(reply.factors[k]) + ' read as ' + r + ' (whole numbers from 1 to 5).');
          f[k] = r;
        });
        if (Object.keys(f).length) v.factors = f;
      }
    }
    if (has('hours')) {
      const n = num(reply.hours);
      if (n === null || n <= 0) errors.push('hours must be a number above 0; dropped.');
      else { if (n < min || n > max) errors.push('hours ' + n + ' kept within ' + min + '–' + max + ' h.'); v.hours = round2(clamp(n, min, max)); }
    }
    if (has('storyPoints')) {
      const n = num(reply.storyPoints);
      if (n === null || !STORY_SCALE.includes(n)) errors.push('storyPoints must be one of ' + STORY_SCALE.join(', ') + '; ' + short(reply.storyPoints) + ' dropped.');
      else v.storyPoints = n;
    }
    if (has('weightedPoints')) {
      const n = num(reply.weightedPoints);
      if (n === null) errors.push('weightedPoints is not a number; dropped.');
      else { if (n < 1 || n > scaleMax) errors.push('weightedPoints ' + n + ' kept within 1–' + scaleMax + '.'); v.weightedPoints = round2(clamp(n, 1, scaleMax)); }
    }
    if (has('confidence')) {
      const n = num(reply.confidence);
      if (n === null || n > 100) errors.push('confidence must be between 0 and 1; dropped.');
      else if (n > 1) { v.confidence = clean(n / 100); errors.push('confidence ' + n + ' read as a percentage: ' + v.confidence + '.'); }
      else if (n < 0) { v.confidence = 0; errors.push('confidence ' + n + ' read as 0.'); }
      else v.confidence = clean(n);
    }
    if (has('explanation')) {
      if (typeof reply.explanation !== 'string') errors.push('explanation is not text; dropped.');
      else { const c = cut(reply.explanation, 600); if (c.cut) errors.push('explanation shortened to 600 characters.'); if (c.text) v.explanation = c.text; }
    }
    ['assumptions', 'missing'].forEach(k => { if (has(k)) { const l = textList(reply[k], k, errors); if (l) v[k] = l; } });
    if (has('comparables')) {
      if (!Array.isArray(reply.comparables)) errors.push('comparables must be a list of task ids; dropped.');
      else {
        const ids = [];
        let bad = 0;
        reply.comparables.forEach(x => { const s = typeof x === 'string' || typeof x === 'number' ? String(x).trim() : ''; if (ID_TEXT.test(s)) { if (!ids.includes(s)) ids.push(s); } else bad++; });
        if (bad) errors.push(bad + ' comparables that are not task ids were dropped.');
        if (ids.length > 8) errors.push('Only the first 8 comparables were kept.');
        if (ids.length) v.comparables = ids.slice(0, 8);
      }
    }
    if (has('outcomes')) {
      if (!Array.isArray(reply.outcomes)) errors.push('outcomes must be a list of {metricId, why}; dropped.');
      else {
        const out = [];
        let bad = 0;
        reply.outcomes.forEach(o => {
          const id = isObj(o) && (typeof o.metricId === 'string' || typeof o.metricId === 'number') ? String(o.metricId).trim() : '';
          if (!ID_TEXT.test(id) || out.some(x => x.metricId === id)) { bad++; return; }
          out.push({ metricId: id, why: typeof o.why === 'string' ? cut(o.why, 200).text : '' });
        });
        if (bad) errors.push(bad + ' outcomes without a valid metricId were dropped.');
        if (out.length > 8) errors.push('Only the first 8 outcomes were kept.');
        if (out.length) v.outcomes = out.slice(0, 8);
      }
    }
    const ok = ['hours', 'storyPoints', 'weightedPoints', 'factors'].some(k => hasOwn(v, k));
    if (!ok) errors.push('The reply has no usable hours, points or factor ratings.');
    return { ok, value: ok ? v : null, errors };
  }

  /* ---------- the AI cache key ---------- */
  const norm = s => String(s).normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  function canon(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') { const s = norm(v); return s === '' ? null : s; }
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'boolean') return v;
    if (Array.isArray(v)) { const a = v.map(canon).filter(x => x !== null); return a.length ? a : null; }
    if (typeof v === 'object') { const pairs = Object.keys(v).sort().map(k => [k, canon(v[k])]).filter(p => p[1] !== null); return pairs.length ? { o: pairs } : null; }
    return null;
  }
  function fnv1a(s, seed) {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h = Math.imul(h ^ (c & 0xff), 0x01000193) >>> 0;
      h = Math.imul(h ^ (c >>> 8), 0x01000193) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function inputHash(task) {
    const t = isObj(task) ? task : {};
    const text = v => (v === null || v === undefined ? '' : norm(v));
    const labels = Array.isArray(t.labels) ? Array.from(new Set(t.labels.map(text).filter(Boolean))).sort() : [];
    const d = num(t.deliverables !== undefined && t.deliverables !== null ? t.deliverables : t.assetCount);
    const payload = JSON.stringify([INPUT_HASH_VERSION, text(t.title), text(t.description), canon(isObj(t.brief) ? t.brief : null), d === null ? 0 : Math.max(0, Math.round(d)), labels, text(t.team)].concat(t.kind ? [text(t.kind)] : []));
    return fnv1a(payload, 0x811c9dc5) + fnv1a(payload, 0x9747b28c);
  }

  const engine = {
    round2, hours, storyPoints, weightedPoints, basePoints, efficiency, allocate, progress, rollup, validateAi, inputHash,
    assetPoints, kindOf, kindMatch, kindPick, kindOfTask, kindKeyword, KINDS, KIND_IDS, KIND_LIMITS,
    fill, defaults, ENGINE_DEFAULTS, SENTENCES, REASONS, FACTORS, STORY_SCALE, ENGINE_VERSION, INPUT_HASH_VERSION
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = engine; else root.ScoringEngine = engine;
})(typeof window !== 'undefined' ? window : this);
