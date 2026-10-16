/* SMART SCORING SETTINGS (Oct 2026) — one shape for the server, the browser and the tests (docs/SMART-SCORING.md).

   The workspace's Smart Scoring settings are one JSON object, kept in workspaces.scoring_settings and written only by
   PUT /api/scoring/settings. Whatever arrives — from the database, from the Settings tab, from an older version or a
   hand-made request — goes through normalizeSettings first: every key the shape does not know is dropped, a missing
   one takes its default, every number is held to its range, the factor weights are made to add up to exactly 1, the
   Story Points thresholds are sorted, the Fibonacci scale is always 1, 2, 3, 5, 8, 13, and a mode or a capacity
   metric that is not one of the known ones goes back to its default. So every reader can trust what it gets.

   Off by default: the master switch is off, and inside it only Effort Hours is on. The hours templates are the kinds
   of work src/effort-estimate.js already knows (EST_KINDS), with its numbers and its ids; a kind made in sets counts
   each next deliverable at 60% of the first, the others count once (nextUnitFactor 0), as today.

   diffSettings(a, b) lists what changed between two settings, one leaf at a time ({path, from, to}), for the audit.

   The calculations themselves are in shared/scoring-engine.js, which takes the sub-objects of this shape
   (settings.hours, settings.story, settings.weighted, settings.bonus, settings.ai) and never reads this module.
   Used by server/serialize.js, server/scoring.js and, inlined by build.js, the page (window.ScoringSettings). */
(function(root){
"use strict";
const MODES = ["math_only", "ai_assisted", "hybrid"];
const PRIMARY_CAPACITY = ["hours", "story_points", "weighted_points"];
const FACTORS = ["complexity", "scope", "uncertainty", "dependencies"];
const SCALE = [1, 2, 3, 5, 8, 13];
const LOCK_POLICIES = ["approve", "approve_or_work_start"];
const COMPARABLES = ["team", "none"];
const BASE_SOURCES = ["weighted_else_mapping", "mapping"];
/* the kinds of work, as src/effort-estimate.js EST_KINDS has them: [id, typical hours, low, high, made in sets] */
const KINDS = [
  ["carousel", 4, 3, 6, false], ["story", 1.5, 1, 3, true], ["reels", 6, 4, 10, false], ["video", 8, 4, 16, false],
  ["kv", 6, 4, 10, false], ["resize", 1.5, 0.5, 3, true], ["feed", 2, 1, 3, true], ["poster", 3, 2, 5, true],
  ["banner", 3, 2, 5, true], ["copy", 1.5, 0.5, 3, false], ["deck", 6, 3, 10, false], ["logo", 10, 6, 16, false],
  ["web", 10, 6, 20, false], ["email", 3, 2, 5, false]];
const KIND_IDS = KINDS.map(k => k[0]);
/* written by the server, never by the person saving: left out of what diffSettings reports */
const VOLATILE = new Set(["configVersion", "updatedAt", "updatedBy"]);

function defaults() {
  const templates = {};
  KINDS.forEach(k => { templates[k[0]] = { perUnit: k[1], low: k[2], high: k[3], nextUnitFactor: k[4] ? 0.6 : 0 }; });
  return {
    enabled: false, configVersion: 1, updatedAt: null, updatedBy: null,
    modules: { hours: { on: true, mode: "hybrid" }, story: { on: false, mode: "math_only" }, weighted: { on: false, mode: "math_only" }, kpi: { on: false }, okr: { on: false } },
    primaryCapacity: "hours",
    hours: {
      templates,
      complexity: { 1: 0.8, 2: 0.9, 3: 1, 4: 1.25, 5: 1.5 },
      dependency: { 0: 1, 1: 1.1, 2: 1.2, 3: 1.3 },
      bounds: { min: 0.25, max: 80 },
      lockPolicy: "approve_or_work_start"
    },
    story: { scale: SCALE.slice(), thresholds: [1.5, 2.5, 3.5, 4.25, 4.75], weights: { complexity: 0.4, scope: 0.3, uncertainty: 0.2, dependencies: 0.1 } },
    weighted: { weights: { complexity: 0.4, scope: 0.3, uncertainty: 0.2, dependencies: 0.1 }, scaleMax: 10, mappingVersion: 1 },
    ai: { minConfidence: 0.6, onCreate: false, onBriefRevision: false, perUserDaily: 20, workspaceDaily: 200, comparables: "team" },
    overrides: { requireReason: true, requireApproval: false, allowSelfApproveEstimate: false },
    bonus: {
      on: false, enabledAt: null, grace: 0.1, rewardFactor: 0.5, maxRate: 0.2, minE: 1, minA: 0.25, reviewBelowRatio: 0.4,
      materialChangeHours: 0.25, baseSource: "weighted_else_mapping",
      hourMapping: { type: "bands", bands: [[1, 1], [2, 2], [4, 3], [8, 5], [16, 8], [999, 13]] },
      completionStages: null, requireApprovedVersion: true, minQuality: null,
      independentApproval: true, allowSelfApproval: false, perPeriodCap: null, pilotTeams: [], negative: false, retroactive: false
    }
  };
}
function freeze(o) { if (o && typeof o === "object") { Object.values(o).forEach(freeze); Object.freeze(o); } return o; }
const DEFAULTS = freeze(defaults());

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const round4 = x => Math.round(x * 1e4) / 1e4;
/* a number (or a numeric string) held to [lo, hi]; anything else is the default */
function num(v, lo, hi, d) { const x = typeof v === "string" && v.trim() !== "" ? +v : v; if (typeof x !== "number" || !isFinite(x)) return d; return round4(Math.min(hi, Math.max(lo, x))); }
function int(v, lo, hi, d) { const x = num(v, lo, hi, null); return x === null ? d : Math.round(x); }
const bool = (v, d) => typeof v === "boolean" ? v : d;
const pick = (v, list, d) => list.indexOf(v) >= 0 ? v : d;
const ID = /^[-\w]{1,40}$/;
const idOrNull = v => typeof v === "string" && ID.test(v) ? v : null;
const isoOrNull = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(v) ? v : null;
const ids = (v, max) => Array.isArray(v) ? [...new Set(v.filter(x => typeof x === "string" && ID.test(x)))].slice(0, max) : [];

/* the factor weights, made to add up to exactly 1 (in steps of 0.0001, any remainder on the largest); all zero or
   not a set of weights: the defaults. Weights given as percentages (40, 30, 20, 10) come out the same. */
function weights(v, d) {
  if (!isObj(v)) return Object.assign({}, d);
  const w = {}; let sum = 0;
  FACTORS.forEach(f => { w[f] = num(v[f], 0, 1e6, 0); sum += w[f]; });
  if (!(sum > 0)) return Object.assign({}, d);
  const units = {}; let total = 0, big = FACTORS[0];
  FACTORS.forEach(f => { units[f] = Math.round(w[f] / sum * 1e4); total += units[f]; if (units[f] > units[big]) big = f; });
  units[big] += 1e4 - total;
  const out = {}; FACTORS.forEach(f => { out[f] = units[f] / 1e4; }); return out;
}
/* the five cut points on the 1–5 index, lowest first: an index at most thresholds[i] (and above the one before) is
   SCALE[i]; above the last it is 13 — as shared/scoring-engine.js storyPoints reads them */
function thresholds(v, d) {
  if (!Array.isArray(v) || v.length !== d.length || v.some(x => num(x, -1e9, 1e9, null) === null)) return d.slice();
  return v.map(x => num(x, 1, 5, 1)).sort((a, b) => a - b);
}
/* hours → base points: [up to this many hours, points] pairs, fewest hours first, each number of hours once */
function bands(v, d) {
  if (!Array.isArray(v) || !v.length || v.length > 12) return d.map(b => b.slice());
  const out = [], seen = new Set();
  for (const b of v) {
    if (!Array.isArray(b) || b.length !== 2) return d.map(x => x.slice());
    const h = num(b[0], 0.05, 10000, null), p = num(b[1], 0.01, 1000, null);
    if (h === null || p === null) return d.map(x => x.slice());
    if (!seen.has(h)) { seen.add(h); out.push([h, p]); }
  }
  return out.sort((a, b) => a[0] - b[0]);
}
function mod(v, d, withMode) { const m = isObj(v) ? v : {}; const o = { on: bool(m.on, d.on) }; if (withMode) o.mode = pick(m.mode, MODES, d.mode); return o; }

function normalizeSettings(raw) {
  let r = raw;
  if (typeof r === "string") { try { r = JSON.parse(r); } catch (e) { r = null; } }
  if (!isObj(r)) r = {};
  const d = defaults(), o = {};
  o.enabled = bool(r.enabled, d.enabled);
  o.configVersion = int(r.configVersion, 1, 1e9, d.configVersion);
  o.updatedAt = isoOrNull(r.updatedAt); o.updatedBy = idOrNull(r.updatedBy);
  const m = isObj(r.modules) ? r.modules : {};
  o.modules = { hours: mod(m.hours, d.modules.hours, true), story: mod(m.story, d.modules.story, true), weighted: mod(m.weighted, d.modules.weighted, true), kpi: mod(m.kpi, d.modules.kpi), okr: mod(m.okr, d.modules.okr) };
  o.primaryCapacity = pick(r.primaryCapacity, PRIMARY_CAPACITY, d.primaryCapacity);

  const h = isObj(r.hours) ? r.hours : {}, dh = d.hours, tpl = isObj(h.templates) ? h.templates : {};
  o.hours = { templates: {} };
  KIND_IDS.forEach(id => {
    const t = isObj(tpl[id]) ? tpl[id] : {}, dt = dh.templates[id];
    const perUnit = num(t.perUnit, 0.05, 200, dt.perUnit);
    o.hours.templates[id] = { perUnit, low: Math.min(perUnit, num(t.low, 0.05, 200, dt.low)), high: Math.max(perUnit, num(t.high, 0.05, 200, dt.high)), nextUnitFactor: num(t.nextUnitFactor, 0, 2, dt.nextUnitFactor) };
  });
  const cx = isObj(h.complexity) ? h.complexity : {}, dp = isObj(h.dependency) ? h.dependency : {}, bd = isObj(h.bounds) ? h.bounds : {};
  o.hours.complexity = {}; [1, 2, 3, 4, 5].forEach(k => { o.hours.complexity[k] = num(cx[k], 0.1, 10, dh.complexity[k]); });
  o.hours.dependency = {}; [0, 1, 2, 3].forEach(k => { o.hours.dependency[k] = num(dp[k], 0.5, 10, dh.dependency[k]); });
  const min = num(bd.min, 0.05, 40, dh.bounds.min);
  o.hours.bounds = { min, max: Math.max(min, num(bd.max, 0.5, 400, dh.bounds.max)) };
  o.hours.lockPolicy = pick(h.lockPolicy, LOCK_POLICIES, dh.lockPolicy);

  const s = isObj(r.story) ? r.story : {};
  o.story = { scale: SCALE.slice(), thresholds: thresholds(s.thresholds, d.story.thresholds), weights: weights(s.weights, d.story.weights) };
  const w = isObj(r.weighted) ? r.weighted : {};
  o.weighted = { weights: weights(w.weights, d.weighted.weights), scaleMax: int(w.scaleMax, 2, 100, d.weighted.scaleMax), mappingVersion: int(w.mappingVersion, 1, 1e6, d.weighted.mappingVersion) };

  const a = isObj(r.ai) ? r.ai : {}, da = d.ai;
  o.ai = { minConfidence: num(a.minConfidence, 0, 1, da.minConfidence), onCreate: bool(a.onCreate, da.onCreate), onBriefRevision: bool(a.onBriefRevision, da.onBriefRevision),
    perUserDaily: int(a.perUserDaily, 0, 1000, da.perUserDaily), workspaceDaily: int(a.workspaceDaily, 0, 100000, da.workspaceDaily), comparables: pick(a.comparables, COMPARABLES, da.comparables) };
  const v = isObj(r.overrides) ? r.overrides : {}, dv = d.overrides;
  o.overrides = { requireReason: bool(v.requireReason, dv.requireReason), requireApproval: bool(v.requireApproval, dv.requireApproval), allowSelfApproveEstimate: bool(v.allowSelfApproveEstimate, dv.allowSelfApproveEstimate) };

  const b = isObj(r.bonus) ? r.bonus : {}, db = d.bonus, hm = isObj(b.hourMapping) ? b.hourMapping : {};
  const stages = ids(b.completionStages, 30);
  o.bonus = {
    on: bool(b.on, db.on), enabledAt: isoOrNull(b.enabledAt),
    grace: num(b.grace, 0, 0.9, db.grace), rewardFactor: num(b.rewardFactor, 0, 5, db.rewardFactor), maxRate: num(b.maxRate, 0, 1, db.maxRate),
    minE: num(b.minE, 0, 1000, db.minE), minA: num(b.minA, 0, 1000, db.minA), reviewBelowRatio: num(b.reviewBelowRatio, 0, 1, db.reviewBelowRatio),
    materialChangeHours: num(b.materialChangeHours, 0, 100, db.materialChangeHours), baseSource: pick(b.baseSource, BASE_SOURCES, db.baseSource),
    hourMapping: { type: "bands", bands: bands(hm.bands, db.hourMapping.bands) },
    completionStages: Array.isArray(b.completionStages) && stages.length ? stages : null,
    requireApprovedVersion: bool(b.requireApprovedVersion, db.requireApprovedVersion),
    minQuality: b.minQuality === null || b.minQuality === undefined ? null : num(b.minQuality, 1, 5, null),
    /* owner decisions: an independent reviewer always, admins included; no per-period cap in v1; never negative;
       never retroactive — held here so no request can change them */
    independentApproval: true, allowSelfApproval: false, perPeriodCap: null,
    pilotTeams: ids(b.pilotTeams, 50), negative: false, retroactive: false
  };
  return o;
}

/* what changed from a to b, leaf by leaf (lists compared whole), the server's own bookkeeping left out */
function diffSettings(a, b) {
  const out = [];
  const same = (x, y) => JSON.stringify(x === undefined ? null : x) === JSON.stringify(y === undefined ? null : y);
  (function walk(x, y, p) {
    if (isObj(x) && isObj(y)) { [...new Set(Object.keys(x).concat(Object.keys(y)))].sort().forEach(k => walk(x[k], y[k], p ? p + "." + k : k)); return; }
    if (!same(x, y)) out.push({ path: p, from: x === undefined ? null : x, to: y === undefined ? null : y });
  })(isObj(a) ? a : {}, isObj(b) ? b : {}, "");
  return out.filter(c => !VOLATILE.has(c.path));
}
/* a module counts only with the master switch on */
const moduleOn = (s, id) => !!(s && s.enabled && s.modules && s.modules[id] && s.modules[id].on);

const model = { DEFAULTS, defaults, normalizeSettings, diffSettings, moduleOn, MODES, PRIMARY_CAPACITY, FACTORS, SCALE, KINDS: KIND_IDS, LOCK_POLICIES, COMPARABLES };
if (typeof module !== "undefined" && module.exports) module.exports = model; else root.ScoringSettings = model;
})(typeof window !== "undefined" ? window : this);
