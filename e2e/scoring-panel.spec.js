/* The task's "Scoring & Intelligence" panel (Oct 2026, src/scoring-panel.js, docs/SMART-SCORING.md Phase 1 C).
   With Smart Scoring off the Effort line is exactly what it always was and nothing asks for scores. On (turned on here
   through PUT /api/scoring/settings and put back at the end), the panel is under the Effort line, folded at first and
   remembered per person; its buttons follow the `can` the server sends; Calculate shows the math and its explanation;
   a member's change is a proposal with a reason; an approver locks it, and from then on the Estimate cannot be typed
   over — in the task's details, in the Effort line and in the grid; a re-baseline is a new approved lock; the ratings
   start Scope from the assets produced; a phone has room for all of it. The task scoring routes are answered here
   (page.route) with the shapes and rules of server/scoring.js (docs/SMART-SCORING.md §5.2) and the same engine, so the
   panel is tested on its own; tests/scoring-routes.test.js tests the server's side. The offline demo answers them in
   the page. */
const { test, expect } = require("@playwright/test");
const path = require("path"), { pathToFileURL } = require("url");
const Engine = require("../shared/scoring-engine.js"), Settings = require("../shared/scoring-settings.js");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page, who) {
  await page.goto("/");
  await page.locator("#au_email").fill(who.email);
  await page.locator("#au_pw").fill(who.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
/* GET …/scoring's can, §5.2.1 */
const CAN = o => Object.assign({ view: true, calculate: true, propose: true, edit: false, approve: false, rebaseline: false, requestAi: false, logTime: false, approveCompletion: false, viewEfficiency: false, viewAnalytics: false, assignee: false, impersonating: false, approveBlocked: null }, o);
const ALL = CAN({ edit: true, approve: true, rebaseline: true });
const MEMBER_CAN = CAN({ assignee: true, logTime: true });
/* nothing the panel does may throw in the page */
const PAGE_ERRORS = [], watch = p => { p.on("pageerror", e => PAGE_ERRORS.push(e.message)); return p; };
const ROUTE = /\/api\/tasks\/[^/?]+\/scoring(\/[^?]*)?(\?.*)?$/;
const half = h => (h > 0 ? Math.max(0.5, Math.round(h * 2) / 2) : 0);
const UNIT = { hours: "h", story: "story_points", weighted: "weighted_points" };
const LOCKED = ["approved", "locked", "rebaseline_needed"];

/* the server's task scoring routes (docs/SMART-SCORING.md §5.2, server/scoring.js), answered from one shared state */
function blankRow(m) { return { module: m, unit: UNIT[m], value: null, source: null, status: "draft", locked: false, mathValue: null, math: {}, aiValue: null, aiRunId: null, factors: {}, mappingVersion: null, configVersion: 1, lockedValue: null, lockedAt: null, lockedBy: null, approvedBy: null, approvedAt: null, approvedAtLock: false, proposal: null, scope: null, updatedBy: null, updatedAt: null, rev: 0 }; }
function freshState(settings, assetCount) {
  /* the backfill gave the task's old estimate (3 h, typed before Smart Scoring) an unverified row */
  return { settings, assetCount, calls: [], audit: [], rows: { hours: Object.assign(blankRow("hours"), { value: 3, source: "legacy", status: "unverified", rev: 1 }), story: null, weighted: null } };
}
function mock(page, st, who) {
  return page.route(ROUTE, async route => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    const m = url.pathname.match(/^\/api\/tasks\/([^/]+)\/scoring(?:\/([a-z]+))?(?:\/([a-z]+))?$/);
    let body = {}; try { body = req.postDataJSON() || {}; } catch (e) { body = {}; }
    st.calls.push({ who: who.id, method, path: url.pathname, body });
    const send = (status, o) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(o) });
    if (!m) return send(404, { error: "Not found" });
    const id = decodeURIComponent(m[1]), can = who.can, now = new Date().toISOString(), S = Settings.normalizeSettings(st.settings);
    const sv = n => (n < 1 ? 1 : n <= 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : n <= 12 ? 4 : 5);
    const view = () => ({ taskId: id, rows: { hours: st.rows.hours || null, story: st.rows.story || null, weighted: st.rows.weighted || null }, audit: st.audit.slice(0, 50),
      on: { feature: true, enabled: true, hours: true, story: true, weighted: true, kpi: false, okr: false },
      context: { kind: "feed", assetCount: st.assetCount, deliverables: Math.max(1, st.assetCount), openDeps: 0, dependencies: 0, scope: { value: sv(st.assetCount), source: "assets", assetCount: st.assetCount, assumed: st.assetCount < 1 }, stage: "todo", stageKind: "queue", lockPolicy: "approve_or_work_start", requireReason: true, requireApproval: false, configVersion: S.configVersion },
      can });
    /* a write answers with the view and the task as the caller sees it: here the real task, its Estimate following the hours row */
    const written = async extra => { const r = await page.request.get(url.origin + "/api/tasks/" + encodeURIComponent(id)), doc = await r.json(), h = st.rows.hours;
      if (h && h.value != null) doc.effort = h.value;
      doc.scoring = {}; ["hours", "story", "weighted"].forEach(k => { const x = st.rows[k]; doc.scoring[k] = x ? { value: x.value, unit: x.unit, status: x.status, source: x.source, lockedValue: x.lockedValue, lockedAt: x.lockedAt, rev: x.rev, proposed: !!x.proposal } : null; });
      return send(200, Object.assign(view(), { task: doc }, extra || {})); };
    if (method === "GET") return send(200, view());
    const mod = m[2] === "calculate" ? body.module : m[2], act = m[2] === "calculate" ? "calculate" : (m[3] || "set");
    if (!UNIT[mod]) return send(400, { error: "Unknown score: " + mod });
    const fresh = !st.rows[mod], r = st.rows[mod] || (st.rows[mod] = blankRow(mod));
    const snap = () => ({ value: r.value, source: r.source, status: r.status, mathValue: r.mathValue, lockedValue: r.lockedValue, lockedAt: r.lockedAt, lockedBy: r.lockedBy, approvedBy: r.approvedBy, rev: r.rev }), from = snap();
    const log = (action, reason) => { r.rev++; r.updatedBy = who.id; r.updatedAt = now; r.locked = LOCKED.includes(r.status); st.audit.unshift({ id: "a" + st.audit.length, module: mod, action, by: who.id, impersonatedBy: null, at: now, reason: reason || "", from, to: snap(), meta: {} }); };
    const valueOf = () => { if (body.useProposal) return r.proposal ? { v: r.proposal.value, src: r.proposal.use === "math" ? "math" : "manual" } : null;
      if (body.use === "math") return r.mathValue == null ? null : { v: mod === "hours" ? half(r.mathValue) : r.mathValue, src: "math" };
      if (body.value !== undefined) return { v: +body.value, src: "manual" }; return null; };
    const stale = () => body.rev !== undefined && body.rev !== null && body.rev !== r.rev;
    if (act === "calculate") {
      if (!can.calculate) return send(403, { error: "Not allowed" });
      let res;
      if (mod === "hours") { const inp = body.inputs || {}, h = st.rows.hours, stored = h && h.math && h.math.inputs && h.math.inputs.complexity, pts = (st.rows.story || st.rows.weighted || {}).factors || {};
        const cx = inp.complexity != null ? inp.complexity : stored != null ? stored : pts.complexity != null ? pts.complexity : null;
        res = Engine.hours(S.hours, { kind: inp.kind || "feed", units: Math.max(1, st.assetCount), complexity1to5: cx, openDeps: 0 });
        r.math = { inputs: { kind: inp.kind || "feed", kindSource: inp.kind ? "given" : "title", units: Math.max(1, st.assetCount), unitsSource: "assets", assetCount: st.assetCount, complexity: cx, complexitySource: cx == null ? null : inp.complexity != null ? "given" : "stored", openDeps: 0 }, steps: res.steps, low: res.low, high: res.high, at: now, by: who.id, engine: 1 }; }
      else { res = mod === "story" ? Engine.storyPoints(S.story, body.ratings) : Engine.weightedPoints(S.weighted, body.ratings); r.factors = res.inputs.ratings; r.math = { inputs: { ratings: res.inputs.ratings, weights: res.inputs.weights }, steps: res.steps, at: now, by: who.id, engine: 1 }; }
      r.mathValue = res.value;
      const finalSet = !LOCKED.includes(r.status) && (fresh || r.status === "draft" && (r.value == null || r.source === "math" || r.source === "legacy"));
      if (finalSet) { r.value = mod === "hours" ? half(res.value) : res.value; r.source = "math"; }
      log("calculated");
      return written({ result: { module: mod, value: res.value, final: r.value, finalSet, unit: r.unit, low: res.low, high: res.high, index: res.index, split: res.split, reason: res.reason, missing: res.missing, inputs: r.math.inputs, steps: res.steps, explanation: res.explanation } });
    }
    if (act === "set") {
      if (body.rev === undefined || body.rev === null) return send(400, { error: "Say which revision of the score was changed (rev; 0 when it has none yet)" });
      if (stale()) return send(409, { error: "Someone else changed this score in the meantime. Reload it and try again." });
      if (!body.reason) return send(400, { error: "Say why the score changes: a reason is required." });
      const v = valueOf(); if (!v) return send(400, { error: "Send the new value" });
      if (can.edit) { const lk = LOCKED.includes(r.status); r.value = v.v; r.source = v.src; r.proposal = null;
        if (lk) Object.assign(r, { status: "locked", lockedValue: v.v, lockedBy: who.id, lockedAt: now, approvedBy: null, approvedAt: null }); else r.status = "draft";
        log(lk ? "locked_changed" : "changed", body.reason); return written({ applied: true }); }
      if (!can.propose) return send(403, { error: "Not allowed" });
      r.proposal = { value: v.v, ratings: null, use: body.use || null, by: who.id, at: now, reason: body.reason }; if (!LOCKED.includes(r.status)) r.status = "proposed";
      log("proposed", body.reason); return written({ applied: false });
    }
    if (act === "approve") {
      if (!can.approve) return send(403, { error: "Not allowed" });
      if (stale()) return send(409, { error: "Someone else changed this score in the meantime. Reload it and try again." });
      if (r.status === "approved") return send(409, { error: "This estimate is already approved. Re-baseline it to change it." });
      const v = body.useProposal ? valueOf() : { v: r.value, src: r.source }; if (!v || !(v.v > 0)) return send(400, { error: "There is no estimate to approve yet: calculate or enter one first." });
      const kept = r.status === "locked" && r.lockedValue === v.v;
      Object.assign(r, { value: v.v, source: v.src, lockedValue: v.v, status: "approved", approvedBy: who.id, approvedAt: now, proposal: null }, kept ? {} : { lockedBy: who.id, lockedAt: now });
      r.approvedAtLock = !kept; log("approved", body.reason); return written();
    }
    if (act === "rebaseline") {
      if (!can.rebaseline) return send(403, { error: "Not allowed" });
      if (!LOCKED.includes(r.status)) return send(409, { error: "Only a locked estimate is re-baselined; approve this one instead." });
      if (!body.reason) return send(400, { error: "Say why the estimate is re-baselined: a reason is required." });
      if (stale()) return send(409, { error: "Someone else changed this score in the meantime. Reload it and try again." });
      const v = valueOf() || { v: r.value, src: r.source };
      Object.assign(r, { value: v.v, source: v.src, lockedValue: v.v, status: "approved", approvedBy: who.id, approvedAt: now, lockedBy: who.id, lockedAt: now, approvedAtLock: true, proposal: null });
      log("rebaselined", body.reason); return written();
    }
    return send(404, { error: "Not found" });
  });
}
const calls = (st, path) => st.calls.filter(c => c.method !== "GET" && (!path || c.path.endsWith(path)));
const panel = page => page.locator("#drawer .scr-panel");
const row = (page, m) => page.locator('#drawer .scr-row[data-scr-module="' + m + '"]');
const act = (page, m, a) => row(page, m).locator('[data-scr-act="' + a + '"]');
const openBrief = (page, id) => page.evaluate(i => { openTask(i); S.drawerTab = "brief"; renderDrawer(); }, id);
const estimateField = page => page.locator('#drawer [data-meta="effort"] .v input');
const effortLineEstimate = page => page.locator("#drawer .enh-blocks .effort input").first();

/* the Effort line as it was before Smart Scoring (src/enhance.js, Oct 2026), to compare with */
const OLD_EFFORT = (tk, ed) => { var m = taskMeta(tk), est = tk.effort || 0, act = m.actualEffort || 0, over = est && act > est; return '<div class="effort"><b>' + tr("Effort") + '</b><span>' + tr("Estimated") + ' ' + (ed ? '<input type="number" min="0" step="0.5" value="' + est + '" onchange="editTaskWith(task(\'' + tk.id + '\'),function(t){t.effort=+this.value||0;if(window.effortManual)effortManual(t)}.bind(this))">' : '<b>' + est + '</b>') + ' h' + (typeof effortBadge === "function" ? effortBadge(tk) : '') + '</span><span' + (over ? ' class="over"' : '') + '>' + tr("Actual") + ' ' + (ed ? '<input type="number" min="0" step="0.5" value="' + act + '" onchange="editTaskWith(task(\'' + tk.id + '\'),function(t){taskMeta(t).actualEffort=+this.value||0}.bind(this))">' : '<b>' + act + '</b>') + ' h</span>' + (est && act ? '<span class="hint">' + (over ? "+" : "") + Math.round((act - est) / est * 100) + '%</span>' : '') + '</div>'; };

test.describe.serial("the Scoring & Intelligence panel", () => {
  let admin, adminCtx, original, onSettings, member = null, other, taskId, adminId;
  test.beforeAll(async ({ browser }) => {
    adminCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    admin = await adminCtx.newPage(); watch(admin);
    await signIn(admin, ADMIN);
    adminId = await admin.evaluate(() => ME);
    original = await admin.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings));
    expect(original.enabled).toBe(false);
    const tag = Date.now().toString(36);
    other = { email: "scp-" + tag + "@e2e.test", pw: "Scoring!Panel-2026x", name: "Panel Member " + tag };
    member = await admin.evaluate(async o => { await apiFetch("POST", "/api/members", { name: o.name, email: o.email, perm: "member", cap: 40 }); const people = (await apiFetch("GET", "/api/bootstrap")).people, id = Object.keys(people).find(k => people[k].email === o.email); await apiFetch("POST", "/api/members/" + id + "/password", { password: o.pw }); return id; }, other);
    taskId = await admin.evaluate(async mid => { const d = await apiFetch("POST", "/api/tasks", { title: "Feed posts for the October promo", status: WS.workflow[1].id, prio: "medium", assignee: mid, assignees: [mid], assetCount: 5, effort: 3 }); await reloadAll(); return d.id; }, member);
    /* the member has been shown around before: the first-run guide would cover the task panel */
    const first = await browser.newContext(), fp = await first.newPage();
    await signIn(fp, other);
    await fp.evaluate(() => { myPrefs().onboardingDone = true; return saveMyPrefs(); });
    await first.close();
  });
  test.afterAll(async () => {
    await admin.evaluate(async o => {
      const cur = await apiFetch("GET", "/api/scoring/settings"); await apiFetch("PUT", "/api/scoring/settings", { settings: o.original, configVersion: cur.settings.configVersion });
      if (o.taskId) await apiFetch("DELETE", "/api/tasks/" + o.taskId).catch(() => {});
      if (o.member) await apiFetch("DELETE", "/api/members/" + o.member).catch(() => {});
      delete myPrefs().scoringPanelOpen; await saveMyPrefs();
    }, { original, taskId, member });
    const back = await admin.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings));
    expect(back.enabled).toBe(false);
    await adminCtx.close();
    expect(PAGE_ERRORS, "no errors in the page").toEqual([]);
  });
  const turnOn = async () => {
    onSettings = await admin.evaluate(async () => { const cur = (await apiFetch("GET", "/api/scoring/settings")).settings;
      const next = Object.assign({}, cur, { enabled: true, modules: Object.assign({}, cur.modules, { hours: { on: true, mode: "hybrid" }, story: { on: true, mode: "hybrid" }, weighted: { on: true, mode: "math_only" } }) });
      return (await apiFetch("PUT", "/api/scoring/settings", { settings: next, configVersion: cur.configVersion })).settings; });
    await admin.reload(); await ready(admin);
    expect(await admin.evaluate(() => [scoringOn(), scoringModuleOn("hours"), scoringModuleOn("story"), scoringModuleOn("weighted")])).toEqual([true, true, true, true]);
  };

  test("with Smart Scoring off the Effort line is exactly as before, the Estimate stays editable and no score is asked for", async () => {
    const st = freshState(original, 5); await mock(admin, st, { id: adminId, can: ALL });
    await openBrief(admin, taskId);
    await expect(admin.locator("#drBody .enh-blocks .effort")).toHaveCount(1);
    await expect(panel(admin)).toHaveCount(0);
    const same = await admin.evaluate(f => { const OLD = new Function("return " + f)(), tk = task(S.drawerTask), t = document.createElement("div"); t.innerHTML = OLD(tk, true);
      return { dom: document.querySelector("#drBody .enh-blocks .effort").outerHTML === t.firstElementChild.outerHTML, html: effortHtml(tk, true) === OLD(tk, true) && effortHtml(tk, false) === OLD(tk, false) }; }, OLD_EFFORT.toString());
    expect(same).toEqual({ dom: true, html: true });
    /* even a task that says it is locked: while Smart Scoring is off nothing is */
    await admin.evaluate(() => { const tk = task(S.drawerTask); tk.scoring = { hours: { finalValue: 3, status: "locked", lockedValue: 3, lockedAt: new Date().toISOString(), lockedBy: ME, approvedBy: ME, rev: 9 } }; renderDrawer(); });
    expect(await admin.evaluate(() => scoringEstimateLock(task(S.drawerTask)))).toBeNull();
    await expect(estimateField(admin)).toBeEnabled();
    await expect(effortLineEstimate(admin)).toBeEnabled();
    expect(st.calls.length, "no score was asked for").toBe(0);
    await admin.evaluate(() => { delete task(S.drawerTask).scoring; closeDrawer(); });
    await admin.unroute(ROUTE);
  });

  test("as admin: the buttons follow `can`, Calculate shows the math and why, the math is taken and approved, the Estimate is greyed out everywhere, Re-baseline sets a new lock", async () => {
    await turnOn();
    const st = freshState(onSettings, 5); await mock(admin, st, { id: adminId, can: ALL });
    const gets = () => st.calls.filter(c => c.method === "GET").length;
    await admin.evaluate(() => { myPrefs().scoringPanelOpen = false; return saveMyPrefs(); });
    await openBrief(admin, taskId);
    /* the old line is still there, the panel under it, folded */
    await expect(admin.locator("#drBody .enh-blocks .effort")).toHaveCount(1);
    await expect(panel(admin)).toHaveCount(1);
    await expect(panel(admin)).not.toHaveClass(/\bopen\b/);
    await expect(panel(admin).locator(".scr-head")).toHaveAttribute("aria-expanded", "false");
    await expect(row(admin, "hours")).toBeHidden();
    await expect(panel(admin).locator(".scr-sum")).toContainText("3 h");
    await expect.poll(gets).toBe(1);
    await panel(admin).locator(".scr-head").click();
    await expect(panel(admin)).toHaveClass(/\bopen\b/);
    await expect(admin.locator("#drawer .scr-row")).toHaveCount(3);
    /* where every number came from: the backfilled 3 h is the task's old estimate, unverified */
    await expect(row(admin, "hours").locator('[data-scr-v="final"] b')).toHaveText("3 h");
    await expect(row(admin, "hours").locator('[data-scr-v="final"] [data-scr-src]')).toHaveText("Legacy");
    await expect(row(admin, "hours").locator("[data-scr-status]")).toHaveText("Unverified");
    await expect(row(admin, "hours").locator('[data-scr-v="math"] b')).toHaveText("—");
    await expect(row(admin, "hours").locator('[data-scr-v="ai"]')).toContainText("Available in a later phase");
    await expect(row(admin, "hours")).toContainText("5 deliverables");
    /* an admin may do everything but ask the AI (later), and has nothing to re-baseline yet */
    for (const a of ["calculate", "change", "approve", "explain"]) await expect(act(admin, "hours", a)).toBeVisible();
    await expect(act(admin, "hours", "ai")).toBeDisabled();
    await expect(act(admin, "hours", "ai")).toHaveAttribute("title", /later phase/);
    await expect(act(admin, "weighted", "ai")).toHaveCount(0);   /* math only */
    for (const a of ["propose", "rebaseline"]) await expect(act(admin, "hours", a)).toHaveCount(0);

    /* Calculate: the kind from the title, the assets produced as the deliverables, a complexity rating, a live result */
    await act(admin, "hours", "calculate").click();
    const modal = admin.locator("#modal");
    await expect(modal.locator("#scrKind")).toHaveValue("feed");
    await expect(modal.locator('[data-scr-in="deliverables"]')).toContainText("5 deliverables");
    const expected = Engine.hours(Settings.normalizeSettings(onSettings).hours, { kind: "feed", units: 5, complexity1to5: 4, openDeps: 0 });
    expect(expected.value).toBe(7.5);
    await expect(modal.locator("[data-scr-preview]")).toHaveText(Engine.hours(Settings.normalizeSettings(onSettings).hours, { kind: "feed", units: 5, openDeps: 0 }).value + " h");
    await modal.locator('#scrRate_complexity .seg button', { hasText: "4" }).click();
    await expect(modal.locator("[data-scr-preview]")).toHaveText("7.5 h");
    await expect(modal.locator("#scrLvl_complexity")).toHaveText("4 — Demanding, many details");
    await modal.getByRole("button", { name: "Calculate", exact: true }).click();
    await expect(admin.locator("#modalWrap")).not.toHaveClass(/\bopen\b/);
    /* the server counts the assets produced and the open dependencies itself */
    expect(calls(st, "/calculate").map(c => c.body)).toEqual([{ module: "hours", inputs: { kind: "feed", complexity: 4 } }]);
    await expect(row(admin, "hours").locator('[data-scr-v="math"] b')).toHaveText("7.5 h");
    /* the old 3 h stays the value — the math never silently replaces an estimate from before — and the explanation is open */
    await expect(row(admin, "hours").locator('[data-scr-v="final"] b')).toHaveText("3 h");
    const why = row(admin, "hours").locator('[data-scr-why="hours"]');
    await expect(why).toContainText('Template "feed post": 2 h for one deliverable.');
    await expect(why).toContainText("5 deliverables, the first in full and each next one at 50%: ×3.");
    await expect(why).toContainText("Complexity 4 of 5: ×1.25.");
    await expect(why).toContainText("The final value 3 h is the task's estimate from before Smart Scoring.");
    expect(gets(), "a write answers with the whole view: nothing more is asked").toBe(1);
    /* in Indonesian, the same sentences */
    await admin.evaluate(() => { setLanguage("id"); renderDrawer(); });
    await expect(row(admin, "hours").locator('[data-scr-why="hours"]')).toContainText('Template "post feed": 2 jam untuk satu deliverable.');
    await expect(panel(admin).locator(".scr-head b")).toHaveText("Skor & Intelijen");
    await admin.evaluate(() => { setLanguage("en"); renderDrawer(); });

    /* take the math: Change value → Use the math baseline, with a reason */
    await act(admin, "hours", "change").click();
    await modal.locator("[data-scr-usemath]").click();
    await expect(modal.locator("#scrVal")).toHaveValue("7.5");
    await modal.getByRole("button", { name: "Save", exact: true }).click();
    await expect(admin.locator("#toasts .toast").last()).toHaveText("Write a reason for the change");
    await modal.locator("#scrWhy").fill("Five posts at the usual pace");
    await modal.getByRole("button", { name: "Save", exact: true }).click();
    expect(calls(st, "/scoring/hours").map(c => c.body)).toEqual([{ use: "math", reason: "Five posts at the usual pace", rev: 2 }]);
    await expect(row(admin, "hours").locator('[data-scr-v="final"] b')).toHaveText("7.5 h");
    await expect(row(admin, "hours").locator('[data-scr-v="final"] [data-scr-src]')).toHaveText("Math");
    await expect(row(admin, "hours").locator("[data-scr-status]")).toHaveText("Draft");
    expect(await admin.evaluate(id => task(id).effort, taskId), "the task's Estimate came back with the answer").toBe(7.5);
    await expect(estimateField(admin)).toHaveValue("7.5");
    await expect(estimateField(admin)).toBeEnabled();

    /* Approve & lock the current 7.5 h */
    await act(admin, "hours", "approve").click();
    await expect(modal.locator(".scr-opt")).toHaveCount(1);
    await expect(modal.locator(".scr-opt")).toContainText("Current value 7.5 h (Math)");
    await modal.getByRole("button", { name: "Approve & lock" }).click();
    expect(calls(st, "/hours/approve").map(c => c.body)).toEqual([{ rev: 3 }]);
    await expect(row(admin, "hours").locator("[data-scr-status]")).toHaveText("Approved");
    await expect(row(admin, "hours").locator('[data-scr-v="final"] b')).toHaveText("7.5 h");
    await expect(row(admin, "hours").locator(".scr-locked-line")).toContainText("Approved and locked by Admin E2E");
    expect(gets(), "no write asked again").toBe(1);
    /* the Estimate cannot be typed over: the details, the Effort line, the grid; each says who locked it */
    await expect(estimateField(admin)).toBeDisabled();
    await expect(estimateField(admin)).toHaveAttribute("title", /locked by Admin E2E/);
    await expect(effortLineEstimate(admin)).toBeDisabled();
    await expect(effortLineEstimate(admin)).toHaveAttribute("title", /locked by Admin E2E/);
    await expect(act(admin, "hours", "rebaseline")).toBeVisible();
    await expect(act(admin, "hours", "approve")).toHaveCount(0);
    await admin.evaluate(() => editTask("effort", "12"));
    expect(await admin.evaluate(id => task(id).effort, taskId)).toBe(7.5);
    await admin.evaluate(() => { closeDrawer(); go("tasks"); S.taskView = "grid"; S.taskScope = "all"; renderScreen(false); });
    const cell = admin.locator('#content tr[data-id="' + taskId + '"] input[type="number"]');
    await expect(cell).toBeDisabled();
    await expect(cell).toHaveAttribute("title", /locked by Admin E2E/);
    /* the history */
    await openBrief(admin, taskId);
    await panel(admin).locator('[data-scr-act="audit"]').click();
    await expect(modal.locator(".scr-aitem")).toHaveCount(3);
    await expect(modal.locator(".scr-aitem").nth(0)).toContainText("Approved and locked");
    await expect(modal.locator(".scr-aitem").nth(1)).toContainText("Changed the value");
    await expect(modal.locator(".scr-aitem").nth(1)).toContainText("3 → 7.5");
    await expect(modal.locator(".scr-aitem").nth(1)).toContainText("Five posts at the usual pace");
    await expect(modal.locator(".scr-aitem").nth(2)).toContainText("Calculated");
    await admin.evaluate(() => closeModal());
    /* Re-baseline: a new approved lock, at the value chosen, with a reason */
    await act(admin, "hours", "rebaseline").click();
    await expect(modal.locator(".scr-opt")).toHaveText([/Keep 7.5 h/, /Another value/]);
    await modal.locator('.scr-opt[data-scr-opt="other"] #scrVal').fill("9");
    await expect(modal.locator('.scr-opt[data-scr-opt="other"] input[type="radio"]')).toBeChecked();
    await modal.getByRole("button", { name: "Re-baseline" }).click();
    await expect(admin.locator("#toasts .toast").last()).toHaveText("Write a reason for the change");
    expect(calls(st, "/rebaseline").length).toBe(0);
    await modal.locator("#scrWhy").fill("The client added two more posts");
    await modal.getByRole("button", { name: "Re-baseline" }).click();
    expect(calls(st, "/hours/rebaseline").map(c => c.body)).toEqual([{ reason: "The client added two more posts", rev: 4, value: 9 }]);
    await expect(admin.locator("#toasts .toast").last()).toHaveText("New baseline approved and locked");
    await expect(row(admin, "hours").locator("[data-scr-status]")).toHaveText("Approved");
    await expect(row(admin, "hours").locator('[data-scr-v="final"] b')).toHaveText("9 h");
    await expect(row(admin, "hours").locator('[data-scr-v="final"] [data-scr-src]')).toHaveText("Manual");
    expect(await admin.evaluate(id => task(id).effort, taskId)).toBe(9);
    await expect(estimateField(admin)).toBeDisabled();
    await expect(estimateField(admin)).toHaveValue("9");
    await admin.evaluate(() => closeDrawer());
    await admin.unroute(ROUTE);
  });

  test("as a member: no approving; the ratings start Scope from the assets produced; a change is a proposal with a reason, which an approver locks", async ({ browser }) => {
    const st = freshState(onSettings, 5);
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } }), two = watch(await ctx.newPage());
    try {
      await mock(two, st, { id: member, can: MEMBER_CAN });
      await signIn(two, other);
      expect(await two.evaluate(() => scoringOn())).toBe(true);
      await openBrief(two, taskId);
      /* folded for someone who never opened it */
      await expect(panel(two)).not.toHaveClass(/\bopen\b/);
      await panel(two).locator(".scr-head").click();
      for (const a of ["calculate", "propose", "explain"]) await expect(act(two, "hours", a)).toBeVisible();
      for (const a of ["change", "approve", "rebaseline"]) await expect(act(two, "hours", a)).toHaveCount(0);
      await expect(row(two, "story")).toContainText("Scope suggested from 5 assets produced: 3");

      /* Story Points: Scope already 3 (from 5 assets), the result follows each rating */
      await act(two, "story", "calculate").click();
      const modal = two.locator("#modal");
      await expect(modal.locator("#scrRate_scope .seg button.on")).toHaveText("3");
      await expect(modal.locator("#scrRate_scope .scr-sugg")).toHaveText("Suggested from 5 assets produced: 3");
      await expect(modal.locator("#scrRate_complexity .seg button.on")).toHaveCount(0);
      await expect(modal.locator("[data-scr-preview]")).toHaveText("—");
      await expect(modal.locator("#scrPreview")).toContainText("Rate every factor first");
      const rate = (f, v) => modal.locator("#scrRate_" + f + " .seg button", { hasText: String(v) }).click();
      await rate("complexity", 3); await rate("uncertainty", 2); await rate("dependencies", 1);
      const sp = r => Engine.storyPoints(Settings.normalizeSettings(onSettings).story, r).value;
      expect(sp({ complexity: 3, scope: 3, uncertainty: 2, dependencies: 1 })).toBe(3);
      await expect(modal.locator("[data-scr-preview]")).toHaveText("3 SP");
      await rate("complexity", 5); await rate("uncertainty", 5);
      expect(sp({ complexity: 5, scope: 3, uncertainty: 5, dependencies: 1 })).toBe(5);
      await expect(modal.locator("[data-scr-preview]")).toHaveText("5 SP");
      await expect(modal.locator("#scrLvl_uncertainty")).toHaveText("5 — The brief is unclear and will change");
      /* Scope can be changed from the suggestion */
      await rate("scope", 4);
      await expect(modal.locator("#scrRate_scope .seg button.on")).toHaveText("4");
      await modal.getByRole("button", { name: "Calculate", exact: true }).click();
      expect(calls(st, "/calculate").map(c => c.body)).toEqual([{ module: "story", ratings: { complexity: 5, scope: 4, uncertainty: 5, dependencies: 1 } }]);
      await expect(row(two, "story").locator('[data-scr-v="math"] b')).toHaveText(sp({ complexity: 5, scope: 4, uncertainty: 5, dependencies: 1 }) + " SP");
      await expect(row(two, "story")).toContainText("Complexity 5 · Scope 4 · Uncertainty 5 · Dependencies 1");
      /* Weighted Points start from the Story Points' ratings, two decimals */
      await act(two, "weighted", "calculate").click();
      await expect(modal.locator("#scrRate_complexity .seg button.on")).toHaveText("5");
      const wp = Engine.weightedPoints(Settings.normalizeSettings(onSettings).weighted, { complexity: 5, scope: 4, uncertainty: 5, dependencies: 1 }).value;
      await expect(modal.locator("[data-scr-preview]")).toHaveText(wp.toFixed(2) + " pts");
      await two.evaluate(() => closeModal());

      /* a change of the hours is a proposal, and needs a reason */
      await act(two, "hours", "propose").click();
      await expect(modal.locator(".modal-head h3")).toHaveText("Propose a change");
      await modal.locator("#scrVal").fill("6");
      await modal.getByRole("button", { name: "Propose", exact: true }).click();
      await expect(two.locator("#toasts .toast").last()).toHaveText("Write a reason for the change");
      expect(calls(st, "/hours").length).toBe(0);
      await modal.locator("#scrWhy").fill("Five posts with two rounds of client changes");
      await modal.getByRole("button", { name: "Propose", exact: true }).click();
      expect(calls(st, "/hours").map(c => c.body)).toEqual([{ value: 6, reason: "Five posts with two rounds of client changes", rev: 1 }]);
      await expect(two.locator("#toasts .toast").last()).toHaveText("Change proposed — an approver will look at it");
      await expect(row(two, "hours").locator("[data-scr-proposal]")).toContainText("Proposed 6 h by " + other.name + ": “Five posts with two rounds of client changes”");
      await expect(row(two, "hours").locator("[data-scr-status]")).toHaveText("Proposed");
      await expect(row(two, "hours").locator('[data-scr-v="final"] b')).toHaveText("3 h");   /* the current value stays */
      await expect(panel(two).locator(".scr-sum")).toContainText("1 proposal waiting");

      /* the admin reviews it and locks the proposed 6 h */
      await mock(admin, st, { id: adminId, can: ALL });
      /* the mocked server started again from rev 1 for this test; the admin's page still remembers the rev 4 of the test
         before, which a real server never goes back below */
      await admin.evaluate(i => { myPrefs().scoringPanelOpen = true; delete SCR.cache[i]; delete task(i).scoring; }, taskId);
      await openBrief(admin, taskId);
      await expect(row(admin, "hours").locator("[data-scr-proposal]")).toContainText("Proposed 6 h");
      await act(admin, "hours", "approve").click();
      await expect(admin.locator("#modal .scr-opt").first()).toContainText("Proposed 6 h by " + other.name);
      await admin.locator("#modal").getByRole("button", { name: "Approve & lock" }).click();
      expect(calls(st, "/hours/approve").map(c => c.body)).toEqual([{ rev: 2, useProposal: true }]);
      await expect(row(admin, "hours").locator("[data-scr-status]")).toHaveText("Approved");
      await expect(row(admin, "hours").locator('[data-scr-v="final"] [data-scr-src]')).toHaveText("Manual");
      await expect(estimateField(admin)).toBeDisabled();
      await admin.evaluate(() => { closeDrawer(); go("tasks"); S.taskView = "grid"; S.taskScope = "all"; renderScreen(false); });
      await expect(admin.locator('#content tr[data-id="' + taskId + '"] input[type="number"]')).toBeDisabled();
      await admin.unroute(ROUTE);

      /* the member opens the task again: the lock arrives and the Estimate greys out where it stands */
      await two.evaluate(() => closeDrawer());
      await openBrief(two, taskId);
      await expect(row(two, "hours").locator("[data-scr-status]")).toHaveText("Approved");
      await expect(estimateField(two)).toBeDisabled();
      await expect(estimateField(two)).toHaveAttribute("title", /locked by Admin E2E/);
      await expect(effortLineEstimate(two)).toBeDisabled();
      for (const a of ["approve", "rebaseline", "change"]) await expect(act(two, "hours", a)).toHaveCount(0);
      await expect(act(two, "hours", "propose")).toBeVisible();
    } finally { await ctx.close(); }
  });

  test("the panel stays folded or open, per person, across reloads — and its details arrive without redrawing the task", async ({ browser }) => {
    const st = freshState(onSettings, 5);
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } }), two = watch(await ctx.newPage());
    try {
      await mock(two, st, { id: member, can: MEMBER_CAN });
      await signIn(two, other);
      await openBrief(two, taskId);
      await expect(panel(two)).toHaveClass(/\bopen\b/);   /* opened in the test before */
      await panel(two).locator(".scr-head").click();
      await expect(panel(two)).not.toHaveClass(/\bopen\b/);
      await expect.poll(() => two.evaluate(() => apiFetch("GET", "/api/bootstrap").then(b => b.people[ME].prefs.scoringPanelOpen))).toBe(false);
      await two.reload(); await ready(two);
      await openBrief(two, taskId);
      await expect(panel(two)).not.toHaveClass(/\bopen\b/);
      await panel(two).locator(".scr-head").click();
      await expect.poll(() => two.evaluate(() => apiFetch("GET", "/api/bootstrap").then(b => b.people[ME].prefs.scoringPanelOpen))).toBe(true);
      /* the details are slow to come: the task is drawn from what it carries, and only the panel changes after */
      await two.unroute(ROUTE);
      let release; const gate = new Promise(r => { release = r; });
      await two.route(ROUTE, async route => { await gate; const s = Object.assign({}, st, { rows: Object.assign({}, st.rows, { story: { module: "story", unit: "story_points", mathValue: 5, value: 5, source: "math", status: "draft", locked: false, math: {}, rev: 1, factors: { complexity: 3, scope: 3, uncertainty: 3, dependencies: 3 } } }) });
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ taskId, rows: s.rows, audit: [], can: MEMBER_CAN }) }); });
      await two.reload(); await ready(two);
      await two.waitForTimeout(500);   /* a reload reopens the task that was open: let it */
      await two.evaluate(() => { if (S.drawerTask) closeDrawer(); });
      await openBrief(two, taskId);
      await expect(panel(two)).toHaveClass(/\bopen\b/);
      await two.evaluate(() => { window.__scrMut = 0; window.__scrObs = new MutationObserver(ms => ms.forEach(m => { if (!(m.target.closest && m.target.closest(".scr-panel")) && [...m.removedNodes].some(n => n.nodeType === 1 && !n.classList.contains("scr-panel"))) window.__scrMut++; })); window.__scrObs.observe(document.getElementById("drawer"), { childList: true, subtree: true });
        const t = document.querySelectorAll("#drBody .enh-blocks .effort input")[1]; t.focus(); t.select(); window.__scrFocus = t; });
      await expect(row(two, "story").locator('[data-scr-v="math"] b')).toHaveText("—");
      release();
      await expect(row(two, "story").locator('[data-scr-v="math"] b')).toHaveText("5 SP");
      expect(await two.evaluate(() => ({ removed: window.__scrMut, focus: document.activeElement === window.__scrFocus }))).toEqual({ removed: 0, focus: true });
    } finally { await ctx.close(); }
  });

  test("on a phone the panel fits: no sideways scroll, every row and button in view", async ({ browser }) => {
    const st = freshState(onSettings, 5);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), ph = watch(await ctx.newPage());
    try {
      await mock(ph, st, { id: adminId, can: ALL });
      await signIn(ph, ADMIN);
      await ph.evaluate(() => { myPrefs().scoringPanelOpen = true; });
      await openBrief(ph, taskId);
      await expect(ph.locator("#drawer .scr-row")).toHaveCount(3);
      await act(ph, "hours", "explain").click();
      const m = await ph.evaluate(() => { const d = document.getElementById("drawer"), p = document.querySelector("#drawer .scr-panel"), pr = p.getBoundingClientRect();
        const out = [...p.querySelectorAll(".scr-row, .scr-val, .scr-acts .btn")].filter(e => { const r = e.getBoundingClientRect(); return r.left < pr.left - 1 || r.right > pr.right + 1; }).length;
        return { drawer: d.scrollWidth <= d.clientWidth + 1, panel: p.scrollWidth <= p.clientWidth + 1, out, width: Math.round(pr.width) }; });
      expect(m.drawer, "the task panel has no sideways scroll").toBe(true);
      expect(m.panel, "the scoring panel has no sideways scroll").toBe(true);
      expect(m.out, "nothing sticks out of the panel").toBe(0);
      expect(m.width).toBeLessThanOrEqual(390);
      await act(ph, "story", "calculate").click();
      const fits = await ph.evaluate(() => { const b = document.querySelector("#modal"); return b.scrollWidth <= b.clientWidth + 1; });
      expect(fits, "the ratings fit the phone").toBe(true);
      await ph.evaluate(() => closeModal());
    } finally { await ctx.close(); }
  });
});

test("the offline demo works the panel out in the page: calculate, lock, and the Estimate follows", async ({ page }) => {
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(pathToFileURL(path.join(__dirname, "..", "dist", "creative-os-standalone.html")).href);
  await expect(page.locator(".demo-user-card").first()).toBeVisible({ timeout: 10000 });
  await page.evaluate(() => demoLogin(Object.keys(PEOPLE).find(k => PEOPLE[k].perm === "admin")));
  await page.waitForFunction(() => !API.on && !document.body.classList.contains("auth") && typeof ME === "string" && !!PEOPLE[ME]);
  await page.waitForTimeout(600);   /* the first-run guide, if it opens, is not what is tested here */
  await page.evaluate(() => { closeModal(); if (typeof wqClose === "function") try { wqClose(); } catch (e) {} });
  const id = await page.evaluate(() => { WS.scoring = ScoringSettings.normalizeSettings({ enabled: true }); myPrefs().scoringPanelOpen = true;
    const tk = TASKS.find(t => !t._draft && !isAssignee(t, ME)) || TASKS[0]; tk.title = "Resize the banner for five channels"; tk.assetCount = 5; tk.effort = 0; tk.assignees = (tk.assignees || []).filter(x => x !== ME); if (tk.assignee === ME) tk.assignee = tk.assignees[0] || null; openTask(tk.id); S.drawerTab = "brief"; renderDrawer(); return tk.id; });
  await expect(row(page, "hours")).toBeVisible();
  expect(await page.evaluate(() => scoringModuleOn("story"))).toBe(false);
  await expect(page.locator("#drawer .scr-row")).toHaveCount(1);
  await act(page, "hours", "calculate").click();
  await expect(page.locator("#scrKind")).toHaveValue("resize");
  const expected = Engine.hours(Settings.DEFAULTS.hours, { kind: "resize", units: 5, openDeps: await page.evaluate(i => unresolvedDependencies(task(i)).length, id) });
  await page.locator("#modal").getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(row(page, "hours").locator('[data-scr-v="math"] b')).toHaveText((Math.max(0.5, Math.round(expected.value * 2) / 2)) + " h");
  const canLock = await page.evaluate(i => canI.scoringApproveEstimate(task(i)), id);
  expect(canLock, "the demo admin is not on the task, so may approve it").toBe(true);
  /* a task with no estimate yet: the math is its value, to the half hour like the Estimate */
  const halfHour = Math.max(0.5, Math.round(expected.value * 2) / 2);
  await expect(row(page, "hours").locator('[data-scr-v="final"] [data-scr-src]')).toHaveText("Math");
  expect(await page.evaluate(i => task(i).effort, id)).toBe(halfHour);
  await act(page, "hours", "approve").click();
  await expect(page.locator("#modal .scr-opt")).toContainText("Current value");
  await page.locator("#modal").getByRole("button", { name: "Approve & lock" }).click();
  await expect(row(page, "hours").locator("[data-scr-status]")).toHaveText("Approved");
  expect(await page.evaluate(i => task(i).effort, id)).toBe(halfHour);
  await expect(estimateField(page)).toBeDisabled();
  await expect(effortLineEstimate(page)).toBeDisabled();
  expect(errors, "no errors in the page").toEqual([]);
});
