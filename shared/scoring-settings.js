/* SMART SCORING SETTINGS (Oct 2026) — one shape for the server, the browser and the tests (docs/SMART-SCORING.md).

   The workspace's Smart Scoring settings are one JSON object, kept in workspaces.scoring_settings and written only by
   PUT /api/scoring/settings. Whatever arrives — from the database, from the Settings tab, from an older version or a
   hand-made request — goes through normalizeSettings first: every key the shape does not know is dropped, a missing
   one takes its default, every number is held to its range, the factor weights are made to add up to exactly 1, the
   Story Points thresholds are sorted, the Fibonacci scale is always 1, 2, 3, 5, 8, 13, and a mode or a capacity
   metric that is not one of the known ones goes back to its default. So every reader can trust what it gets.

   Off by default: the master switch is off, and inside it only Effort Hours is on. The default numbers are the
   engine's (shared/scoring-engine.js ENGINE_DEFAULTS), the estimator's too: each next deliverable counts at the kind's
   own share of the first, never more than it.

   Asset points (Oct 2026): modules.assets.on is their switch (off by default; assets.on mirrors it), and assets holds
   what one asset produced is worth per kind of work — the same kind ids, one feed post = 1 point, each 0–20 — with
   whether counts a lead has not validated yet count (they do by default, marked as such).

   The Teams screen (Oct 2026): teams.memberBars says who sees each person's Smart Scoring bars there —
   "self_and_leads" (the default: the person, the lead of their team and whoever holds scoring_view_analytics) or
   "everyone" (every member who is not a stakeholder). A team's own bars are everyone's either way.

   Kinds of work (Oct 2026): kinds [{id, name, nameId, keywords, builtIn, active, order}] in detection order, built-ins
   never removed, the admin's own "k_…" (ids from the server); each has asset points (new: unknownKind's) and, once
   typed, hours (low, high, next left out: ×0.5, ×1.5, 0.5).

   diffSettings(a, b) lists what changed, one leaf at a time ({path, from, to}; kinds by id), for the audit.

   The calculations themselves are in shared/scoring-engine.js, which takes the sub-objects of this shape
   (settings.hours, settings.story, settings.weighted, settings.bonus, settings.ai) and never reads this module (it is
   inlined before it).
   Used by server/serialize.js, server/scoring.js and, inlined by build.js, the page (window.ScoringSettings). */
(function(root){
"use strict";
const E = typeof module !== "undefined" && module.exports ? require("./scoring-engine") : root.ScoringEngine;
const MODES = ["math_only", "ai_assisted", "hybrid"];
const PRIMARY_CAPACITY = ["hours", "story_points", "weighted_points"];
const FACTORS = ["complexity", "scope", "uncertainty", "dependencies"];
const SCALE = [1, 2, 3, 5, 8, 13];
const LOCK_POLICIES = ["approve", "approve_or_work_start"];
const COMPARABLES = ["team", "none"];
const BASE_SOURCES = ["weighted_else_mapping", "mapping"];
/* who sees each person's bars on the Teams screen (server/scoring-teams.js) */
const MEMBER_BARS = ["self_and_leads", "everyone"];
/* the built-in kinds of work and the points of one asset of each (the engine's) */
const KIND_IDS = E.KIND_IDS, ASSET_POINTS = E.ENGINE_DEFAULTS.assets.perKind, BUILT_IN = E.KINDS, LIM = E.KIND_LIMITS, CUSTOM_ID = /^[a-z][a-z0-9_]{1,31}$/;
/* written by the server, never by the person saving: left out of what diffSettings reports; assets.on is
   modules.assets.on mirrored, so turning the module on is reported once */
const VOLATILE = new Set(["configVersion", "updatedAt", "updatedBy", "assets.on"]);

/* the numbers are the engine's own (ENGINE_DEFAULTS: hours, story, weighted, ai, bonus, assets) — one set, never forked */
function defaults() {
  const e = E.defaults();
  return {
    enabled: false, configVersion: 1, updatedAt: null, updatedBy: null,
    modules: { hours: { on: true, mode: "hybrid" }, story: { on: false, mode: "math_only" }, weighted: { on: false, mode: "math_only" }, kpi: { on: false }, okr: { on: false }, assets: { on: false } },
    primaryCapacity: "hours",
    kinds: kinds(),
    hours: e.hours, story: { scale: SCALE.slice(), thresholds: e.story.thresholds, weights: e.story.weights }, weighted: e.weighted, ai: e.ai,
    overrides: { requireReason: true, requireApproval: false, allowSelfApproveEstimate: false },
    bonus: e.bonus, assets: e.assets, teams: { memberBars: "self_and_leads" }
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
/* ---------- the kinds of work ---------- */
const text = (v, max) => typeof v === "string" ? Array.from(v.replace(/[\s\p{Cc}]+/gu, " ").trim()).slice(0, max).join("").trim() : "";
/* a list or a comma-separated text, each keyword once, at most 40 */
function keywords(v, d) {
  const src = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : null;
  if (!src) return d.slice();
  const out = [];
  src.forEach(x => { const k = E.kindKeyword(x); if (k && out.indexOf(k) < 0 && out.length < LIM.keywords) out.push(k); });
  return out;
}
/* by order, each id once, a built-in left out back at the end; one's own needs a name (or a keyword) */
function kinds(v) {
  const list = [], seen = new Set();
  (Array.isArray(v) ? v : []).map((x, i) => [x, i]).filter(p => isObj(p[0])).sort((a, b) => num(a[0].order, -1e9, 1e9, a[1]) - num(b[0].order, -1e9, 1e9, b[1]) || a[1] - b[1]).forEach(([x]) => {
    const id = typeof x.id === "string" ? x.id : "", b = BUILT_IN.find(k => k.id === id), kw = keywords(x.keywords, b ? b.keywords : []), name = text(x.name, LIM.name) || (b ? b.name : (kw[0] || "").replace(/\*$/, ""));
    if (!id || !name || seen.has(id) || (!b && (!CUSTOM_ID.test(id) || list.length - list.filter(k => k.builtIn).length >= LIM.kinds - BUILT_IN.length))) return;
    seen.add(id); list.push({ id, name, nameId: text(x.nameId, LIM.name) || (b ? b.nameId : name), keywords: kw, builtIn: !!b, active: bool(x.active, true) });
  });
  BUILT_IN.forEach(k => { if (!seen.has(k.id)) list.push({ id: k.id, name: k.name, nameId: k.nameId, keywords: k.keywords.slice(), builtIn: true, active: true }); });
  return list.map((k, i) => Object.assign(k, { order: i }));
}
const quarter = x => Math.max(0.05, Math.round(x * 4) / 4);
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
  const ra = isObj(r.assets) ? r.assets : {};
  /* the asset points switch is modules.assets.on; an older or hand-made object with only assets.on is read too */
  o.modules = { hours: mod(m.hours, d.modules.hours, true), story: mod(m.story, d.modules.story, true), weighted: mod(m.weighted, d.modules.weighted, true), kpi: mod(m.kpi, d.modules.kpi), okr: mod(m.okr, d.modules.okr),
    assets: mod(m.assets, { on: bool(ra.on, d.modules.assets.on) }) };
  o.primaryCapacity = pick(r.primaryCapacity, PRIMARY_CAPACITY, d.primaryCapacity);

  o.kinds = kinds(r.kinds);
  const h = isObj(r.hours) ? r.hours : {}, dh = d.hours, tpl = isObj(h.templates) ? h.templates : {};
  o.hours = { templates: {} };
  o.kinds.forEach(k => {
    const id = k.id, t = isObj(tpl[id]) ? tpl[id] : {}, dt = dh.templates[id];
    const perUnit = num(t.perUnit, 0.05, 200, dt ? dt.perUnit : null);
    if (perUnit === null) return;
    o.hours.templates[id] = { perUnit, low: Math.min(perUnit, num(t.low, 0.05, 200, dt ? dt.low : quarter(perUnit / 2))), high: Math.max(perUnit, num(t.high, 0.05, 200, dt ? dt.high : quarter(perUnit * 1.5))), nextUnitFactor: num(t.nextUnitFactor, 0, 1, dt ? dt.nextUnitFactor : 0.5) };
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

  /* asset points: each kind's points for one asset, 0–20; on mirrors the module switch */
  const pk = isObj(ra.perKind) ? ra.perKind : {}, da2 = d.assets;
  o.assets = { on: o.modules.assets.on, countUnvalidated: bool(ra.countUnvalidated, da2.countUnvalidated), perKind: {}, unknownKind: num(ra.unknownKind, 0, 20, da2.unknownKind) };
  o.kinds.forEach(k => { o.assets.perKind[k.id] = num(pk[k.id], 0, 20, k.id in da2.perKind ? da2.perKind[k.id] : o.assets.unknownKind); });
  /* the Teams screen: who sees each person's bars — only the two known choices */
  const tm = isObj(r.teams) ? r.teams : {};
  o.teams = { memberBars: pick(tm.memberBars, MEMBER_BARS, d.teams.memberBars) };
  return o;
}

/* what changed from a to b, leaf by leaf (lists compared whole), the server's own bookkeeping left out */
function diffSettings(a, b) {
  const out = [];
  const same = (x, y) => JSON.stringify(x === undefined ? null : x) === JSON.stringify(y === undefined ? null : y);
  const byId = s => isObj(s) && Array.isArray(s.kinds) ? Object.assign({}, s, { kinds: s.kinds.reduce((m, k) => { if (isObj(k)) m[k.id] = k; return m; }, {}) }) : isObj(s) ? s : {};
  (function walk(x, y, p) {
    if (isObj(x) && isObj(y)) { [...new Set(Object.keys(x).concat(Object.keys(y)))].sort().forEach(k => walk(x[k], y[k], p ? p + "." + k : k)); return; }
    if (!same(x, y)) out.push({ path: p, from: x === undefined ? null : x, to: y === undefined ? null : y });
  })(byId(a), byId(b), "");
  return out.filter(c => !VOLATILE.has(c.path));
}
/* a module counts only with the master switch on */
const moduleOn = (s, id) => !!(s && s.enabled && s.modules && s.modules[id] && s.modules[id].on);

const model = { DEFAULTS, defaults, normalizeSettings, diffSettings, moduleOn, MODES, PRIMARY_CAPACITY, FACTORS, SCALE, KINDS: KIND_IDS, CUSTOM_ID, LOCK_POLICIES, COMPARABLES, MEMBER_BARS, ASSET_POINTS: Object.freeze(Object.assign({}, ASSET_POINTS)) };
if (typeof module !== "undefined" && module.exports) module.exports = model; else root.ScoringSettings = model;
})(typeof window !== "undefined" ? window : this);
