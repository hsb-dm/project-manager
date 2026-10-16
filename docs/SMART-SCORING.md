# Smart Scoring & Intelligence — the build contract

Status: **Phase 0 + Phase 1 B done** (Oct 2026): schema, permissions, settings model, settings routes, the
Settings → Smart Scoring tab, the roles UI, and empty browser modules for the later phases. Everything is **off**
until an admin turns it on; with it off the app behaves exactly as before (spec §12.2).

This file is the contract later phases build against. Where it and the code differ, fix one of them in the same
change. Sources: the product spec (`ZenCrevia_Smart_Scoring_Intelligence_Full_Spec.md`) and the implementation plan
(sections referenced as "plan §n"). The calculations are in **`shared/scoring-engine.js`** — its header is the
authoritative API (round2, hours, storyPoints, weightedPoints, basePoints, efficiency, allocate, progress, rollup,
validateAi, inputHash); this file only records how the settings feed it.

---

## 1. Deviations from the spec (spec §15 asks for them to be written down)

| # | Spec says | What we do | Why |
|---|---|---|---|
| 1 | Permission keys `scoring.manage_workspace` … | snake_case: `scoring_manage_workspace`, `scoring_manage_project`, `scoring_approve_estimate`, `scoring_edit_task`, `scoring_request_ai`, `scoring_approve_completion`, `scoring_manage_outcomes`, `scoring_view_analytics` | Every existing capability is snake_case (`server/permissions.js` CAPS); roles store flat strings. |
| 2 | Workspace Settings → Task Management → Smart Scoring | A flat Settings tab **"Smart Scoring"** right after **Automation** | Settings has no category headers on purpose (owner decision 18). |
| 3 | `PATCH` routes | `PUT` (whole object for settings) | PATCH is used only by the gallery; every other write is PUT. |
| 4 | `GET/PATCH /roles/:id/scoring-permissions` | Not built: the existing `PUT /api/roles/:id` (manage_roles) and per-person extra permissions (`PUT /api/members/:id/cap-grants`) carry the new capabilities | The role editor already lists every capability in groups; a "Smart Scoring" group was added. |
| 5 | Project-scoped grants, "Project Manager" role | No project-scoped grants exist. `scoring_manage_project` is defined now; project overrides are deferred (decision 19). A "PM" maps to the project owner / `can.editProject`. | Roles are workspace-wide; there is no PM role. |
| 6 | `task_scoring_factors` table | Factor ratings are JSON in `task_scoring.factors` | One row per task and module; ratings are always read together. |
| 7 | `task_time_entries`: "reuse existing schema" | New table — there was no time log, only one free number `meta.actualEffort` | Biggest gap in the inventory. `meta.actualEffort` stays as the server-derived sum so existing readers keep working. |
| 8 | Separate KPI and OKR entities | One metric model (`outcome_metrics.kind` 'kpi' \| 'kr') plus `outcome_objectives`; two independent switches | Decision 6/(a). |
| 9 | Idempotent background jobs, event bus | Synchronous idempotent re-evaluation after writes (`afterTaskWrite`) plus a 10-minute sweep (`setInterval`, like `sweepArchive`) | There is no job queue or event bus. |
| 10 | Pilot workspaces | Single-workspace server: a staging pilot, then production with the bonus off, optionally `bonus.pilotTeams` | One `WS_ID` per server. |
| 11 | "Enforce existing AI Hub quotas and cost logging" | Chat has no server quota or cost log today; Smart Scoring's are new (`scoring_ai_runs`, `ai.perUserDaily`, `ai.workspaceDaily`) | Inventory finding: AI Gallery quotas are browser-side only. |
| 12 | Routes under `/workspaces/:id/…` | `/api/…` with no workspace id | Single workspace; every query is scoped by `WS_ID`. |
| 13 | `locked_estimated_hours` frozen "when approved or work begins" | `hours.lockPolicy` = `approve_or_work_start` by default: an approval locks; if work starts first the value is frozen as an **unapproved** baseline that never earns a bonus | Decision 8/(c). |
| 14 | Hours formula `perUnit × count × …` | Templates keep `nextUnitFactor`, each kind's own share for every next deliverable (resize 0.25; copy, deck, logo 0.4; poster, reels, video 0.6; the rest 0.5 — the same as today's estimator, src/effort-estimate.js, since 2026-10-16), at most 1; 1 gives the spec's linear formula | One set of numbers for the estimator, the engine and the settings; twelve resizes are not ten hours. |
| 15 | Extra columns beyond plan §3.3 | `task_scoring.approved_at`; `scoring_audit.meta` (JSON, e.g. a settings diff); `task_time_entries.verified_at`, `deleted_by`; `task_efficiency_awards.review_note`; `workspace_id` on `outcome_values`; `rev`/`sort_order`/`created_*`/`updated_*` on the outcome tables | Needed for "lock approved after `bonus.enabledAt`", for the audit diff, and for tenant scoping. |
| 16 | `minutes CHECK (1..1440)` | `CHECK (minutes >= 1 AND (minutes <= 1440 OR source = 'legacy'))` | A legacy "Actual" of 40 h becomes one legacy entry. |

## 2. Owner decisions (final)

- Build all phases in order, each fully tested. Master switch default **off**; inside it Effort Hours **on**,
  Story Points, Weighted Points, KPI and OKR **off**. Off = the app behaves exactly as today.
- Time logging: the single "Actual" becomes dated entries (work / blocked / revision); existing numbers are kept as
  legacy, **unverified** entries; `meta.actualEffort` stays as the server-derived sum.
- Estimate edits before lock: as today — anyone who can edit the task, the assignee included, recorded as "manual";
  after lock only `scoring_edit_task` holders; a bonus needs a lock approved by someone other than the assignee.
- KPI + OKR: one minimal metric model shared by KPI indicators and Key Results, plus Objectives; two independent
  switches; progress only from evidence (lead-validated assets, successful completions) or a manual value with a reason.
- Points shown with **2 decimals**. Quality review only for bonus-eligible tasks. **Independent reviewer always,
  admins included.** One canonical base: Weighted Points when that module is on, else the admin hours→points bands
  ≤1h=1, ≤2h=2, ≤4h=3, ≤8h=5, ≤16h=8, more=13. Lock by approval; if work starts first, frozen as an unapproved
  baseline that earns no bonus.
- Delegation admin-only by default, plus a one-click "give Team Lead and Creative Lead the approval and analytics
  permissions" (built: §5.3).
- Bonus/earned visible only to credited contributors, approvers and `scoring_view_analytics` holders. Logged time is
  verified by the reviewer approving the award. Credit on shared tasks split by logged time, adjustable by the approver.
- "Completed" = configurable stage list defaulting to closed-except-Declined (`bonus.completionStages: null`).
- AI-on-create keeps today's behaviour while Smart Scoring is off. Hours stay the workload unit. No retroactive awards.
- Settings in a new flat "Smart Scoring" tab next to Automation. Project overrides deferred (permission defined now).
- No per-period bonus cap in v1 (review flags only).
- AI gets title, brief fields, deliverable count, labels, team, ≤800 chars of description without links/emails, and
  similar finished tasks only when workspace context is on.

---

## 3. Settings

### 3.1 Where they live and who writes them

- Column **`workspaces.scoring_settings`** (TEXT JSON; JSONB in `db/schema.postgres.sql`; added by the `server/db.js`
  ALTER list for old databases).
- Shape, defaults, `normalizeSettings(raw)` and `diffSettings(a, b)`: **`shared/scoring-settings.js`** (UMD; Node
  `require("../shared/scoring-settings")`, browser global `ScoringSettings`, inlined by build.js).
- Read: `ws.scoring` in every workspace document (bootstrap, `GET /api/live/workspace`, `PUT /api/workspace` answer) —
  `serialize.readWorkspace` always returns it normalized. Server modules call `scoring.settings()`.
- Written **only** by `PUT /api/scoring/settings`. `writeWorkspace` never writes the column, so `PUT /api/workspace`
  (which sends the whole workspace back, `scoring` included) cannot change it (tested).
- Browser: `scoringSettings()` (normalized, cached on `WS.scoring` identity, **read-only** — clone before editing).

### 3.2 The shape (every key; anything else is dropped)

```
{ enabled: false,                      // master switch
  configVersion: 1,                    // server-owned: +1 on every saved change; PUT must send the version it edited
  updatedAt: null, updatedBy: null,    // server-owned
  modules: {
    hours:    { on: true,  mode: "hybrid"    },   // mode: "math_only" | "ai_assisted" | "hybrid"
    story:    { on: false, mode: "math_only" },
    weighted: { on: false, mode: "math_only" },
    kpi: { on: false }, okr: { on: false } },     // no mode: AI only ever suggests links
  primaryCapacity: "hours",            // "hours" | "story_points" | "weighted_points" (velocity unit; workload stays hours)
  hours: {
    templates: { <kindId>: { perUnit, low, high, nextUnitFactor } },  // exactly the 14 ids of src/effort-estimate.js EST_KINDS
    complexity: { 1: .8, 2: .9, 3: 1, 4: 1.25, 5: 1.5 },              // rating 1–5 → multiplier
    dependency: { 0: 1, 1: 1.1, 2: 1.2, 3: 1.3 },                     // open dependencies; 3 = "3 or more"
    bounds: { min: .25, max: 80 },                                    // hours
    lockPolicy: "approve_or_work_start" },                            // "approve" | "approve_or_work_start"
  story: { scale: [1,2,3,5,8,13],                                     // pinned
           thresholds: [1.5, 2.5, 3.5, 4.25, 4.75],                   // see 3.3
           weights: { complexity: .4, scope: .3, uncertainty: .2, dependencies: .1 } },
  weighted: { weights: { complexity: .4, scope: .3, uncertainty: .2, dependencies: .1 },
              scaleMax: 10,                                           // points 1..scaleMax
              mappingVersion: 1 },                                    // server-owned: +1 when weights or scaleMax change
  ai: { minConfidence: .6, onCreate: false, onBriefRevision: false, perUserDaily: 20, workspaceDaily: 200,
        comparables: "team" },                                        // "team" | "none"
  overrides: { requireReason: true, requireApproval: false, allowSelfApproveEstimate: false },
  bonus: { on: false,                  // forced false by the server until Phase 3 (server/scoring.js BONUS_READY)
           enabledAt: null,            // server-owned: stamped when bonus.on goes false→true, null when off
           grace: .10, rewardFactor: .5, maxRate: .20, minE: 1, minA: .25, reviewBelowRatio: .4,
           materialChangeHours: .25,
           baseSource: "weighted_else_mapping",                       // or "mapping" (always the bands)
           hourMapping: { type: "bands", bands: [[1,1],[2,2],[4,3],[8,5],[16,8],[999,13]] },
           completionStages: null,     // null = every closed stage except Declined; else a list of stage ids
           requireApprovedVersion: true, minQuality: null,            // minQuality: null or 1–5
           independentApproval: true, allowSelfApproval: false,       // pinned (decision 3)
           perPeriodCap: null,                                        // pinned null in v1 (decision 21)
           pilotTeams: [],                                            // team ids; empty = every team
           negative: false, retroactive: false } }                    // pinned (spec §7.2, decision 17)
```

### 3.3 normalizeSettings(raw) → settings

Pure. `raw` may be an object, a JSON string (the DB column) or anything else (→ defaults). Rules:

- Unknown keys are dropped at every level; a missing key takes its default; a wrong type takes its default.
- Numbers (numeric strings accepted) are clamped and rounded to 4 decimals: template hours 0.05–200 with
  `low ≤ perUnit ≤ high` enforced; `nextUnitFactor` 0–2; complexity multipliers 0.1–10; dependency 0.5–10;
  `bounds.min` 0.05–40, `bounds.max` 0.5–400 and never below min; `scaleMax` 2–100 (integer); `minConfidence` 0–1;
  `perUserDaily` 0–1000, `workspaceDaily` 0–100000 (integers); bonus `grace` 0–0.9, `rewardFactor` 0–5, `maxRate` 0–1,
  `minE`/`minA` 0–1000, `reviewBelowRatio` 0–1, `materialChangeHours` 0–100; bands: 1–12 pairs `[hours 0.05–10000,
  points 0.01–1000]`, sorted by hours, each hours value once (invalid list → defaults).
- **Weights** (story and weighted): the four factors, each ≥ 0, scaled to sum to **exactly 1** in steps of 0.0001
  (remainder on the largest) — percentages (40/30/20/10) give the same result; all zero → defaults.
- **Thresholds**: exactly 5 numbers, each clamped to 1–5 and sorted ascending (wrong length → defaults). Meaning
  (as `ScoringEngine.storyPoints` reads them): the story value is `scale[i]` for the first `i` with
  `index ≤ thresholds[i]`, and 13 above the last.
- `scale` is always `[1,2,3,5,8,13]`. Modes only `math_only|ai_assisted|hybrid` (invalid → that module's default);
  `primaryCapacity` only the three values; `lockPolicy`, `comparables`, `baseSource` only their listed values.
- Ids (`updatedBy`, `completionStages`, `pilotTeams`) must match `/^[-\w]{1,40}$/`; an empty `completionStages` list
  is `null`; `updatedAt`/`enabledAt` must be ISO timestamps.
- Idempotent: `normalizeSettings(normalizeSettings(x))` equals `normalizeSettings(x)`.

Other exports: `DEFAULTS` (deep-frozen, normalized), `defaults()` (fresh copy), `diffSettings(a, b)` →
`[{path, from, to}]` per changed leaf (arrays compared whole, a side missing an object reports it whole;
`configVersion`/`updatedAt`/`updatedBy` left out; callers pass normalized objects), `moduleOn(s, id)` (master switch
and module), `MODES`, `PRIMARY_CAPACITY`, `FACTORS`, `SCALE`, `KINDS` (template ids in order), `LOCK_POLICIES`,
`COMPARABLES`.

The engine keeps its own `ENGINE_DEFAULTS` fallback; `tests/scoring-settings.test.js` asserts the two agree
sub-object by sub-object once `shared/scoring-engine.js` is present. Pass the engine the normalized sub-objects:
`hours(s.hours, …)`, `storyPoints(s.story, …)`, `weightedPoints(s.weighted, …)`, `basePoints(s.bonus, …)`,
`efficiency(s.bonus, …)`, `validateAi(reply, s)` (whole object).

---

## 4. Tables (all created now — no later phase changes the schema)

`db/schema.sql` (SQLite, run on every start), mirrored in `db/schema.postgres.sql` (JSON → JSONB, REAL → DOUBLE
PRECISION, flags → BOOLEAN, timestamps → TIMESTAMPTZ). JSON columns are TEXT holding JSON. Timestamps are ISO strings
written by the app (`now()`).

```sql
CREATE TABLE task_scoring (            -- one row per task and module
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module IN ('hours','story','weighted')),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  math_value REAL, math_inputs TEXT DEFAULT '{}', ai_value REAL, ai_run_id TEXT, final_value REAL, unit TEXT,
  source TEXT CHECK (source IN ('legacy','math','ai','manual')),            -- of final_value; NULL allowed
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','proposed','approved','locked','unverified','rebaseline_needed')),
  factors TEXT DEFAULT '{}', mapping_version INTEGER, config_version INTEGER,
  locked_value REAL, locked_at TEXT, locked_by TEXT, approved_by TEXT, approved_at TEXT, scope_fingerprint TEXT, proposal TEXT,
  updated_by TEXT, updated_at TEXT, rev INTEGER NOT NULL DEFAULT 1,         -- rev: optimistic concurrency (stale → 409)
  PRIMARY KEY (task_id, module));
CREATE INDEX idx_task_scoring_ws ON task_scoring(workspace_id, module, status);

CREATE TABLE scoring_audit (           -- every scoring change; no FKs (outlives the task, like activity_logs)
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, task_id TEXT, module TEXT, action TEXT NOT NULL,
  actor_id TEXT, impersonated_by TEXT, old_value TEXT, new_value TEXT, reason TEXT, meta TEXT DEFAULT '{}', created_at TEXT NOT NULL);
  -- module: hours | story | weighted | time | efficiency | outcomes | settings
CREATE INDEX idx_scoring_audit_task ON scoring_audit(task_id, created_at);
CREATE INDEX idx_scoring_audit_ws ON scoring_audit(workspace_id, created_at);

CREATE TABLE task_time_entries (       -- soft edits/deletes, audited
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, work_date TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes >= 1 AND (minutes <= 1440 OR source = 'legacy')),
  kind TEXT NOT NULL DEFAULT 'work' CHECK (kind IN ('work','blocked','revision')), started_at TEXT, ended_at TEXT, note TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','legacy')),
  verified INTEGER NOT NULL DEFAULT 0, verified_by TEXT, verified_at TEXT,
  created_by TEXT, created_at TEXT NOT NULL, edited_by TEXT, edited_at TEXT, deleted_at TEXT, deleted_by TEXT);
CREATE INDEX idx_time_entries_task ON task_time_entries(task_id, work_date);
CREATE INDEX idx_time_entries_user ON task_time_entries(workspace_id, user_id, work_date);

CREATE TABLE task_efficiency_awards (  -- one per person per task
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, share REAL NOT NULL DEFAULT 1, estimate_snapshot REAL, actual_snapshot REAL,
  base_points REAL, bonus_points REAL, awarded_points REAL,
  status TEXT NOT NULL DEFAULT 'provisional' CHECK (status IN ('provisional','pending_review','approved','rejected','revoked','ineligible')),
  reasons TEXT DEFAULT '[]', needs_review INTEGER NOT NULL DEFAULT 0, reviewer_id TEXT, reviewed_at TEXT, review_note TEXT, quality_score REAL,
  policy_version INTEGER, calc_key TEXT, recalculated_at TEXT, created_at TEXT NOT NULL,
  UNIQUE (task_id, user_id));
CREATE INDEX idx_awards_ws ON task_efficiency_awards(workspace_id, status);
CREATE INDEX idx_awards_user ON task_efficiency_awards(workspace_id, user_id, status);

CREATE TABLE scoring_ai_runs (         -- cost log, cache, quota counter; no FK on task
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, task_id TEXT, user_id TEXT, trigger TEXT, input_hash TEXT, config_version INTEGER, prompt_version INTEGER,
  status TEXT NOT NULL CHECK (status IN ('ok','invalid','error','timeout','quota','cached')), recommendation TEXT, confidence REAL,
  tokens_in INTEGER, tokens_out INTEGER, provider TEXT, model TEXT, ms INTEGER, error TEXT, created_at TEXT NOT NULL);
CREATE INDEX idx_scoring_ai_cache ON scoring_ai_runs(task_id, input_hash, config_version);
CREATE INDEX idx_scoring_ai_user ON scoring_ai_runs(user_id, created_at);
CREATE INDEX idx_scoring_ai_ws ON scoring_ai_runs(workspace_id, created_at);

CREATE TABLE outcome_objectives (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), title TEXT NOT NULL, description TEXT DEFAULT '',
  period_start TEXT, period_end TEXT, owner_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','closed','archived')),
  sort_order INTEGER DEFAULT 0, rev INTEGER NOT NULL DEFAULT 1, created_by TEXT, created_at TEXT NOT NULL, updated_by TEXT, updated_at TEXT);
CREATE TABLE outcome_metrics (         -- KPI indicators (kind 'kpi') and Key Results (kind 'kr')
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), kind TEXT NOT NULL CHECK (kind IN ('kpi','kr')),
  objective_id TEXT REFERENCES outcome_objectives(id) ON DELETE SET NULL, title TEXT NOT NULL, description TEXT DEFAULT '', unit TEXT DEFAULT '',
  direction TEXT NOT NULL DEFAULT 'up' CHECK (direction IN ('up','down')), baseline REAL, target REAL, weight REAL NOT NULL DEFAULT 1,
  period_start TEXT, period_end TEXT, evidence_rule TEXT DEFAULT '{}',      -- {type:'approved_assets'|'tasks_completed'|'manual', filter:{team,project,label}}
  owner_id TEXT, status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','closed','archived')),
  sort_order INTEGER DEFAULT 0, rev INTEGER NOT NULL DEFAULT 1, created_by TEXT, created_at TEXT NOT NULL, updated_by TEXT, updated_at TEXT);
CREATE TABLE task_outcome_links (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  metric_id TEXT NOT NULL REFERENCES outcome_metrics(id) ON DELETE CASCADE, linked_by TEXT,
  origin TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','ai_accepted')),
  evidence_type TEXT, evidence_id TEXT, contribution REAL,
  status TEXT NOT NULL DEFAULT 'linked' CHECK (status IN ('linked','counted','revoked')),
  counted_at TEXT, revoked_at TEXT, created_at TEXT NOT NULL,
  UNIQUE (metric_id, evidence_type, evidence_id));                          -- NULL evidence does not collide (SQLite/PG)
CREATE TABLE outcome_values (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), metric_id TEXT NOT NULL REFERENCES outcome_metrics(id) ON DELETE CASCADE,
  value REAL NOT NULL, source TEXT NOT NULL CHECK (source IN ('evidence','manual')), reason TEXT, actor_id TEXT, created_at TEXT NOT NULL);
-- + indexes: idx_outcome_objectives_ws, idx_outcome_metrics_ws, idx_outcome_metrics_objective,
--   idx_outcome_links_task, idx_outcome_links_metric, idx_outcome_values_metric
```

`server/seed.js` `reset()` clears all nine tables first. Task deletion cascades `task_scoring`,
`task_time_entries`, `task_efficiency_awards`, `task_outcome_links` (the plan's `clearTaskRows` hook should still
write a "removed with task" audit row first — Phase 1 A).

---

## 5. Routes

Conventions: `/api/…`, JSON bodies, `PUT` for updates, errors `{error}` with HTTP status. **409** means either a stale
version/rev or "Smart Scoring is turned off on this server" (`COS_SCORING=0`; every scoring route answers it). Register
specific paths before `:param` routes (first match wins). Writes bump `DATA_VERSION` automatically (not under the
excluded prefixes).

### 5.1 Built now (server/scoring.js)

**`GET /api/scoring/settings`** — any signed-in member (401 otherwise).
Answer `{ settings, audit }`. `audit` is the last 20 rows of `scoring_audit` with `module='settings'`, newest first —
only for `scoring_manage_workspace`, `scoring_view_analytics` or `manage_roles` holders (else `[]`). Each entry:
`{ id, action: "settings_changed"|"leads_delegated", by, impersonatedBy, at, reason, diff: [{path, from, to}],
configVersion, added }` (`added`: `{roleId: [caps]}` for leads_delegated, else null).

**`PUT /api/scoring/settings`** — `can.scoringConfigure` (`scoring_manage_workspace`; 403 otherwise).
Body `{ settings: <object>, configVersion: <the version it was edited from>, reason?: string ≤ 1000 }`.
- 400 when `settings` is not an object or `configVersion` is not a number; 413 above 100 000 characters.
- **409** "Someone else changed the Smart Scoring settings in the meantime. Reload them and make your change again."
  when `configVersion` ≠ stored.
- The settings are normalized; the server sets `configVersion`, `updatedAt`, `updatedBy`, `bonus.enabledAt`,
  `weighted.mappingVersion`, and keeps `bonus.on` false while `BONUS_READY` is false.
- No change → `{ settings, unchanged: true, audit }`, nothing written.
- A change → version +1, column written, one `scoring_audit` row (`module 'settings'`, `action 'settings_changed'`,
  `old_value`/`new_value` = the whole settings, `meta {diff, configVersion}`, `impersonated_by` when acting as someone),
  a workspace activity line "Smart Scoring settings", `security.log("scoring_settings_changed", {userId, ip,
  configVersion, enabled, changes, paths})`. Answer `{ settings, unchanged: false, audit }`.
- Live: `LIVE_KINDS` maps it to `"workspace"`, so open tabs refetch `WS` (with `scoring`).

**`POST /api/scoring/delegate-leads`** — `can.manageRoles` (403 otherwise). Body `{}`.
Adds `scoring_approve_estimate`, `scoring_approve_completion`, `scoring_view_analytics` to the roles `team_lead` and
`creative_lead` where they exist and lack them; nothing else changes. Audited (`action 'leads_delegated'`, `meta
{added}`), activity line, `security.log("scoring_leads_delegated")` — only when something was added. Answer
`{ roles: <readRoles()>, added: {team_lead?: [...], creative_lead?: [...]}, audit }`. Live kind `"roles"`.

Bootstrap: `features.scoring` = `process.env.COS_SCORING !== "0"` (next to `features.impersonation`; `COS_SCORING`
is documented in `.env.example`, which `tests/server-security-integration.test.js` requires of every `COS_*` the
server reads).

### 5.2 Planned (plan §3.5; Phase 1 A unless noted). Permission → body → answer.

- `GET /api/tasks/:id/scoring` — anyone who can see the task (not stakeholders' hidden data) → `{ rows, audit (last 50),
  efficiency (only credited contributors, approvers, scoring_view_analytics holders), outcomes, can: {…} }`.
- `POST /api/tasks/:id/scoring/calculate` — `scoringPropose` or `scoringEditTask` → `{ module, inputs | ratings }` →
  stores `math_value`, `math_inputs`, `factors`; sets `final_value` only on a draft row the caller may edit/propose.
- `POST /api/tasks/:id/scoring/ai` (Phase 2 A) — `scoringRequestAi`, or `trigger:"create"` when `ai.onCreate` → math
  fallback with a reason when AI is off / out of quota / invalid. Never sets final on approved/locked/manual rows.
- `PUT /api/tasks/:id/scoring/:module` — `{ value | ratings, reason, rev }`; with `scoring_edit_task` final
  (`source:"manual"`), else a proposal; reason required when `overrides.requireReason`; stale `rev` → 409.
- `POST /api/tasks/:id/scoring/:module/approve` — `scoringApproveEstimate(u, t, settings.overrides)`; refused while
  impersonating; writes `tasks.estimated_minutes` from the locked hours.
- `POST /api/tasks/:id/scoring/:module/rebaseline` — same permission, reason required.
- `GET|POST /api/tasks/:id/time`, `PUT|DELETE /api/tasks/:id/time/:entryId` (Phase 3a D) — `logTime` for one's own
  entries; others' only with `scoring_edit_task` and a reason; audited.
- `POST /api/tasks/:id/efficiency/recalculate|approve|reject` (Phase 3 A) — approve/reject:
  `scoringApproveCompletion(u, t, creditedIds)`, body `{ qualityScore?, shares?, reason? }`.
- `GET /api/scoring/analytics?weeks&from&to&project&team&assignee&status` (D) — team for
  `scoring_view_analytics`, else own rows only.
- `GET|POST|PUT|DELETE /api/outcomes[/:id]`, `POST /api/outcomes/:id/value`, `POST /api/tasks/:id/outcomes`,
  `DELETE /api/tasks/:id/outcomes/:linkId` (Phase 4 B) — `scoringManageOutcomes` for definitions and manual values.

---

## 6. Permissions

### 6.1 Capabilities (server/permissions.js CAPS; in **no** default role — Admin has them via `has()`)

| key | description (as shown in Roles & permissions) |
|---|---|
| `scoring_manage_workspace` | Set up Smart Scoring: modules, weights, scales and policies |
| `scoring_manage_project` | Change a project's Smart Scoring settings, where the workspace allows it |
| `scoring_approve_estimate` | Approve and lock task estimates (never on a task they are assigned to) |
| `scoring_edit_task` | Change any task's scores, a locked estimate included |
| `scoring_request_ai` | Ask the AI to suggest a task's scores |
| `scoring_approve_completion` | Approve finished work and efficiency bonuses (never their own) |
| `scoring_manage_outcomes` | Set up KPIs and OKRs and correct their progress |
| `scoring_view_analytics` | See the whole team's scoring analytics |

Delegation: per role (`PUT /api/roles/:id`), per person with an optional end date (`PUT /api/members/:id/cap-grants`,
the "Extra permissions" dialog lists the Smart Scoring group too), or the one-click lead delegation (§5.1).
`scoring_edit_task` does **not** imply configuration.

### 6.2 Server predicates (`can.*`) — separation of duties written out, so it binds admins too

```
scoringConfigure(u)                    has(scoring_manage_workspace)
scoringManageProject(u, p)             has(scoring_manage_project)
scoringEditTask(u, t)                  !u.stakeholder && has(scoring_edit_task)
scoringPropose(u, t)                   !u.stakeholder && (isAssignee(u,t) || can.editTask(u,t))
scoringApproveEstimate(u, t, policy)   !u.stakeholder && !u.impersonatedBy && has(scoring_approve_estimate)
                                       && (!isAssignee(u,t) || policy.allowSelfApproveEstimate)    // policy = settings.overrides
scoringRequestAi(u, t)                 !u.stakeholder && has(scoring_request_ai)
scoringApproveCompletion(u, t, credited) !u.stakeholder && !u.impersonatedBy && has(scoring_approve_completion)
                                       && !isAssignee(u,t) && !credited.includes(u.id)             // credited = award user ids
scoringManageOutcomes(u)               has(scoring_manage_outcomes)
scoringViewAnalytics(u)                has(scoring_view_analytics)
logTime(u, t)                          !u.stakeholder && isAssignee(u,t)                            // no capability needed
```

### 6.3 Browser mirror (src/scoring-core.js) — hides buttons only; the server decides

`canI.scoringConfigure()`, `canI.scoringManageProject(p)`, `canI.scoringEditTask(t)`, `canI.scoringPropose(t)`,
`canI.scoringApproveEstimate(t)` (reads `scoringSettings().overrides`), `canI.scoringRequestAi(t)`,
`canI.scoringApproveCompletion(t, creditedIds)`, `canI.scoringManageOutcomes()`, `canI.scoringViewAnalytics()`,
`canI.logTime(t)`. "Acting as" = `SESSION.user && ME !== SESSION.user.id` (refuses approvals like the server).
`src/core.js` `DEMO_CAP_LIST` carries the eight with the server's descriptions; `DEMO_CAPS.admin` only.

### 6.4 Roles UI

- `src/settings-access.js` `CAP_GROUPS` has a last group **"Smart Scoring"** (icon `gauge`, defined in
  scoring-core.js) with the eight keys in the order above; `SETTINGS_ACCESS.scoring =
  ["scoring_manage_workspace","scoring_view_analytics"]`.
- The role modal warns (`.scr-duty-warn`) when a non-admin role has `scoring_edit_task` together with
  `scoring_approve_estimate` or `scoring_approve_completion` (wrappers of `roleModal` and `capGroupSync`).

---

## 7. Server module pattern and hook points

- `module.exports = function(db, WS_ID, deps)` returning its hooks (style of server/announcements.js). **Register
  after the AI helpers**: `aiConf`/`aiFetch` are `const` declared after the early module registrations; passing them
  earlier throws. `server/scoring.js` is required right after the `PUT /api/workspace` route (before the "v38
  connection test" `POST /api/ai/test`). Later modules go next to it — **not** between `route("POST", "/api/ai/chat"`
  and `route("PUT", "/api/workspace"`: `tests/studio-editor.test.js` runs that stretch of server.js alone in a sandbox
  without `require`.
- `server/scoring.js` gets `{ route, HttpError, forbid, can, security, uid, now, tx, act, readRoles, featureOn }` and
  returns:
  - `settings()` → the current normalized settings object (reads the column each call; no arguments).
  - `audit({ taskId?, module, action, actor, impersonatedBy?, oldValue?, newValue?, reason?, meta?, at? })` → id.
    Writes one `scoring_audit` row (values JSON-encoded, reason cut to 1000). Call it inside your transaction.
  - `featureOn()` → `process.env.COS_SCORING !== "0"`.
  - `isOn()` → feature on and `settings().enabled`. `moduleOn(id)` → that and the module on.
  - `LEAD_CAPS` — the three delegated capabilities.
- Pass `bumpData: () => { DATA_VERSION++; }` to modules that change tasks outside a request (the sweep), and never call
  it while the module loads.
- Hook points for Phase 1 A (plan §3.4, re-grep by name): `PUT /api/tasks/:id` (`guardTaskWrite` after the `_changed`
  merge, before `sanitizeTaskWrite`; `afterTaskWrite` after the transaction), `POST /api/tasks`/`sanitizeNewTask` (strip
  server-owned meta — the main session is fixing `assetSplitOk` there and in `duplicateTask`), `moveTask`
  `MOVE_TASK_STATUS`, restore (`POST /api/restore/:type/:id`), `clearTaskRows`, `forViewer`, the `announceTaskChange`
  regex, `LIVE_KINDS` (`/api/outcomes` → "outcomes" plus a `/api/live/:kind` case), `TEXT_LIMITS` (reasons 1000),
  `serialize.buildTask`/`readTaskSlimRows` projection `scoring:{hours,story,weighted}` (one batched query; the parity
  test `tests/v30-accounts-and-scale.test.js` must stay green; **no bonus/earned data in task documents** — the
  bootstrap task cache is shared by everyone).
- Once-only migrations use `app_meta` keys (`scoring_backfill_v1`, `scoring_time_backfill_v1`).

---

## 8. Browser modules and hook points

All in build.js `parts` after `cap-grants.js`, before `live-redraw.js`/`boot.js`, in this order:

| file | owner | what |
|---|---|---|
| `src/scoring-core.js` | Phase 0 | `scoringFeature()` (server flag; always true in the offline demo), `scoringSettings()`, `scoringOn()` (= feature && settings.enabled), `scoringModuleOn(id)`, `scoringMode(id)`, `scoringPrimary()`, the `canI.scoring*` mirror, `scoringLoad()`, `scoringSave(next, version)`, `scoringDelegateLeads()` (all with demo-mode fallbacks), `scoringLeadsMissing()`, `SCORING_CAPS`, `SCORING_LEAD_CAPS`, `I.gauge`. Wraps `settingsTabAllowed` (tab hidden when the server has the feature off) and `dTask` (never sends `scoring` back through `PUT /api/tasks`). |
| `src/scoring-settings.js` | Phase 1 B | `setScoring()` — the Settings tab (dispatch in `renderSettings`), draft state `SC`, save with 409 reload, the role-modal warning `scoringDutyWarn()`. Phase 3 B adds the live bonus policy here. Phase 4 B adds outcome definitions here. |
| `src/scoring-panel.js` | Phase 1 C | empty — the task's Scoring & Intelligence panel (wraps `effortHtml`; old block unchanged while off; `.enh-blocks` stays Brief-tab only). |
| `src/scoring-time.js` | Phase 3a D | empty — the time log. |
| `src/scoring-analytics.js` | Phase 1 D / 3 D | empty — analytics sections (wrap `renderAnalytics`, `renderMember`; no ranking). |
| `src/scoring-outcomes.js` | Phase 4 B | empty — KPI/OKR UI. |

`build.js` inlines `shared/gallery-model.js`, `shared/scoring-settings.js` and — as soon as the file exists —
`shared/scoring-engine.js` (`window.ScoringEngine`) right after the demo data, before any `src/` file.

Rules: every file starts with `<script>` and a titled "(Oct 2026)" header; overrides as `var base=f; f=function(){…}`
(no duplicate global function names — `tests/v37-code-health.test.js`); every string `tr("English")` with an
Indonesian entry added only if missing (`(function(d){…if(!(k in UI_ID))…})({…})`); render from cache first, refresh
in place; CSS in `src/v38.css` (prefix `scr-` for Smart Scoring — `sc-` is taken by the shortcuts help); run
`node build.js` and commit `public/index.html` and `dist/creative-os-standalone.html`.

---

## 9. Phases and file ownership

| phase | agent | files |
|---|---|---|
| 0 | foundation | this doc, `shared/scoring-settings.js`, schema (`db/schema.sql`, `db/schema.postgres.sql`, `server/db.js`), `server/permissions.js` caps + predicates, `server/scoring.js` (settings routes), `src/scoring-core.js`, stubs, `build.js` |
| 0 | engine | `shared/scoring-engine.js`, `tests/scoring-engine.test.js` |
| 1 A | server owner | `server/server.js`, `server/serialize.js`, `server/permissions.js` from now on; task scoring routes in `server/scoring.js`; backfill; hook points (§7) |
| 1 B | settings/roles | `src/scoring-settings.js`, `src/settings.js`, `src/settings-access.js` (done) |
| 1 C | task panel | `src/scoring-panel.js`, drawer/enhance/tasks/effort-estimate |
| 1 D / 3a / 3 D | time + analytics | `src/scoring-time.js`, `src/scoring-analytics.js`, `server/scoring-time.js`, `server/scoring-analytics.js` (wired by A) |
| 2 A | server | `server/scoring-ai.js`, `chatUsage` in `server/ai-chat-format.js` |
| 3 A | server | `server/scoring-awards.js` (+ flip `BONUS_READY` in `server/scoring.js`) |
| 4 B | outcomes | `server/outcomes.js`, `src/scoring-outcomes.js` |

The schema and `build.js` belong to Phase 0: later phases do not change them (ask first if a column is missing).

---

## 10. Tests

- `tests/scoring-settings.test.js` — the settings model (defaults, EST_KINDS templates, clamping, weights sum, thresholds,
  pinned fields, diff, browser global), the engine-defaults agreement (skipped until the engine file is present), the
  permission predicates (separation of duties binding admins), the browser mirror (DEMO_CAP_LIST, CAP_GROUPS,
  SETTINGS_ACCESS, the tab entry).
- `tests/scoring-settings-route.test.js` — spawned server: the permission matrix (member, stakeholder, a role given the
  permission, a role with `scoring_edit_task` only, an extra grant, the analytics permission), 409 on a stale version,
  normalizing and server-owned fields, the audit row (DB) and security log, `PUT /api/workspace` not clobbering,
  `COS_SCORING=0`, the lead delegation.
- `e2e/scoring-settings.spec.js` — admin toggles the master switch, a module and OKR and they persist; weights not
  totalling 100% cannot be saved; member has no tab; a role with `scoring_manage_workspace` has it; analytics-only is
  read-only; the role-modal warning; the one-click delegation. Everything put back.
- Fragile tests to keep green: `e2e/settings-access.spec.js` (exact tab list and group list — now includes "scoring"
  and "Smart Scoring", 11 group icons), `e2e/mobile-settings.spec.js` (sweeps every tab at phone width, "scoring"
  included), `tests/v37-code-health.test.js`, `e2e/progress-note.spec.js` (`.enh-blocks` Brief only),
  `e2e/ai-context.spec.js` (`meta.actualEffort`), `tests/v30-accounts-and-scale.test.js` (batch = single read).
