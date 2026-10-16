/* The AI's suggestion in a task's Scoring & Intelligence panel (Oct 2026, src/scoring-panel.js, server/scoring-ai.js,
   docs/SMART-SCORING.md §5.4). Smart Scoring is turned on here through PUT /api/scoring/settings and put back at the end.
   POST /api/tasks/:id/scoring/ai is intercepted with page.route() (as e2e/effort-estimate.spec.js intercepts the AI):
   the answer is worked out in this test's process by the server's own module (server/scoring-ai.js, with a stand-in for
   the model) on the test server's own database, so what the page shows — and what the real PUT …/:module {use:"ai"}
   then checks — is exactly what the server would have stored. Ask AI shows a spinner, then the suggestion with how sure
   it is, why, what it assumes and what the task does not say; Accept takes it (the task's Estimate follows); a
   suggestion far from the calculation says so, its confidence lowered, and needs a reason; one made before the task
   changed cannot be taken; Dismiss folds it away for this person, across a reload; the cache, a quota and an AI chat
   model not set up are said in plain words (the last on the real server); in Indonesian too; it fits a phone. "AI on
   create": the Create-time AI call goes to Smart Scoring's route, and its answer fills the Estimate only when it is
   sure enough; with it off, the AI is not asked on Create at all. */
const { test, expect } = require("@playwright/test");
const os = require("os"), path = require("path");
const { DatabaseSync } = require("node:sqlite");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const WS_ID = "ws_zencrevia";
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const row = (page, m) => page.locator('#drawer .scr-row[data-scr-module="' + m + '"]');
const act = (page, m, a) => row(page, m).locator('[data-scr-act="' + a + '"]');
const card = (page, m) => row(page, m).locator('[data-scr-ai="' + m + '"]');
const openBrief = (page, id) => page.evaluate(i => { myPrefs().scoringPanelOpen = true; openTask(i); S.drawerTab = "brief"; renderDrawer(); }, id);

/* the server's AI route, run in this process on the test server's database, the model answering what the test says */
function pipeline() {
  const db = new DatabaseSync(path.join(os.tmpdir(), "zencrevia-e2e-" + (process.env.E2E_PORT || "3310"), "creative-os.db"));
  db.exec("PRAGMA busy_timeout = 5000;");
  const { tx, uid, now } = require("../server/db"), { can } = require("../server/permissions"), sz = require("../server/serialize");
  class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const routes = {}, P = { db, asked: [], answer: null };
  /* on only while a request is answered here: the module's own sweep stays the server's */
  let live = false;
  const deps = { route: (m, p, h) => { routes[m + " " + p] = h; }, HttpError, forbid: (ok, w) => { if (!ok) throw new HttpError(403, "You don't have permission to " + w); }, can, security: { log() {} }, uid, now, tx, act() {}, readRoles: () => [], featureOn: () => live, sz };
  const scoring = require("../server/scoring")(db, WS_ID, deps);
  require("../server/scoring-ai")(db, WS_ID, Object.assign({}, deps, { scoring, callModel: async prompt => { P.asked.push(prompt); return { text: JSON.stringify(P.answer), usage: { in: 640, out: 120 }, provider: "e2e", model: "e2e-model" }; } }));
  const during = async fn => { live = true; try { return await fn(); } finally { live = false; } };
  P.ask = (u, id, body) => during(() => routes["POST /api/tasks/:id/scoring/ai"](u, { id }, {}, body, { ip: "e2e" }));
  P.view = (u, id, extra) => during(() => scoring.ai.answer(u, id, extra));
  return P;
}
const ANSWER = o => Object.assign({ kind: "feed", deliverables: 5, factors: { complexity: 3, scope: 3, uncertainty: 2, dependencies: 1 }, hours: 6.5, storyPoints: 3, weightedPoints: 4.6, confidence: 0.8, explanation: "Five feed posts from one key visual; the first takes longest.", assumptions: ["One round of revision"], missing: ["The copy is not written yet"], comparables: [], outcomes: [] }, o || {});

test.describe.serial("the AI's suggestion in the task panel", () => {
  let page, ctx, original, prefs, P, me, made = [], mode = "pipeline", lastBody = null, delay = 0;
  const ROUTE = "**/api/tasks/*/scoring/ai";
  const intercept = async route => {
    const req = route.request(), id = decodeURIComponent(new URL(req.url()).pathname.split("/")[3]), body = req.postDataJSON() || {}, u = { id: me, role: "admin", caps: {}, teams: [], ledTeams: [] };
    lastBody = body;
    if (delay) await new Promise(r => setTimeout(r, delay));
    try {
      const out = mode === "quota"
        ? await P.view(u, id, { aiResult: { status: "quota", reason: "quota_user", modules: [body.module], missingModules: [body.module], quota: { user: { used: 20, limit: 20, left: 0, resetAt: new Date(Date.now() + 3 * 3600000).toISOString() }, workspace: { used: 31, limit: 200, left: 169, resetAt: null } } } })
        : await P.ask(u, id, body);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(out) });
    } catch (e) { await route.fulfill({ status: e.status || 500, contentType: "application/json", body: JSON.stringify({ error: e.message }) }); }
  };
  const save = (id, fields) => page.evaluate(([i, f]) => editTaskWith(task(i), t => Object.assign(t, f)), [id, fields]);

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    page = await ctx.newPage();
    await signIn(page);
    me = await page.evaluate(() => ME);
    prefs = await page.evaluate(() => ({ scoringPanelOpen: myPrefs().scoringPanelOpen, taskMoreDetailsOpen: myPrefs().taskMoreDetailsOpen }));
    original = await page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings));
    expect(original.enabled).toBe(false);
    await page.evaluate(async () => { const cur = (await apiFetch("GET", "/api/scoring/settings")).settings;
      const next = Object.assign({}, cur, { enabled: true, modules: Object.assign({}, cur.modules, { hours: { on: true, mode: "hybrid" }, story: { on: true, mode: "ai_assisted" }, weighted: { on: true, mode: "math_only" } }), ai: Object.assign({}, cur.ai, { onCreate: true }) });
      WS.scoring = (await apiFetch("PUT", "/api/scoring/settings", { settings: next, configVersion: cur.configVersion })).settings; });
    P = pipeline();
    await page.route(ROUTE, intercept);
  });
  test.afterAll(async () => {
    await page.unroute(ROUTE).catch(() => {});
    await page.evaluate(async o => {
      const cur = await apiFetch("GET", "/api/scoring/settings"); await apiFetch("PUT", "/api/scoring/settings", { settings: o.original, configVersion: cur.settings.configVersion });
      if (task("T-new")) discardDraft(); closeDrawer();
      for (const id of o.made) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {});
      try { localStorage.removeItem("zc_scr_ai_hide"); } catch (e) {}
      /* this person's preferences as they were (the panel folded or open, More details open or not) */
      Object.keys(o.prefs).forEach(k => { if (o.prefs[k] === undefined || o.prefs[k] === null) delete myPrefs()[k]; else myPrefs()[k] = o.prefs[k]; }); await saveMyPrefs();
    }, { original, made, prefs });
    if (made.length) P.db.prepare("DELETE FROM scoring_ai_runs WHERE task_id IN (" + made.map(() => "?").join(",") + ")").run(...made);
    P.db.close();
    const back = await page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings));
    expect(back.enabled).toBe(false);
    await ctx.close();
  });

  test("Ask AI: a spinner, then the suggestion with how sure it is, why, what it assumes and what is missing; Accept takes it and the Estimate follows", async () => {
    const id = await page.evaluate(async () => { const d = await apiFetch("POST", "/api/tasks", { title: "Feed post Ramadan AI", status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME], assetCount: 5, effort: 0 }); await reloadAll(); return d.id; });
    made.push(id);
    await openBrief(page, id);
    await expect(row(page, "hours")).toBeVisible();
    await expect(row(page, "hours").locator('[data-scr-v="ai"]')).toContainText("Not asked yet");
    await expect(act(page, "hours", "ai")).toBeEnabled();
    await expect(act(page, "weighted", "ai"), "Weighted Points is math only: the AI is not asked for it").toHaveCount(0);
    await expect(row(page, "weighted").locator('[data-scr-v="ai"]')).toContainText("Math only");
    P.answer = ANSWER(); delay = 700;
    await act(page, "hours", "ai").click();
    await expect(act(page, "hours", "ai")).toHaveAttribute("aria-busy", "true");
    await expect(act(page, "hours", "ai")).toBeDisabled();
    await expect(row(page, "hours").locator('[data-scr-v="ai"]')).toContainText("Asking the AI…");
    await expect(card(page, "hours")).toBeVisible();
    delay = 0;
    expect(lastBody).toMatchObject({ module: "hours", trigger: "ask", lang: "en" });
    expect(P.asked.length).toBe(1);
    expect(P.asked[0].user, "the server built the prompt from the task").toContain("Title: Feed post Ramadan AI");
    await expect(row(page, "hours").locator('[data-scr-v="ai"] b')).toHaveText("6.5 h");
    await expect(row(page, "hours").locator("[data-scr-conf]")).toHaveText("80% sure");
    await expect(card(page, "hours")).toContainText("The AI suggests 6.5 h");
    await expect(card(page, "hours").locator("[data-scr-ai-conf]")).toHaveText("Confidence 80%");
    await expect(card(page, "hours").locator(".scr-ai-text")).toHaveText("Five feed posts from one key visual; the first takes longest.");
    await expect(card(page, "hours").locator("[data-scr-ai-assumptions]")).toContainText("One round of revision");
    const missing = card(page, "hours").locator("[data-scr-ai-missing]");
    await expect(missing).toContainText("No description"); await expect(missing).toContainText("No brief filled in"); await expect(missing).toContainText("The copy is not written yet");
    await expect(card(page, "hours").locator("[data-scr-warn]")).toHaveCount(0);
    await expect(row(page, "hours").locator('[data-scr-v="final"] b'), "a suggestion, not the final value").toHaveText("—");
    /* Accept: a reason (the workspace asks for one), then the real PUT …/hours {use:"ai"} */
    await card(page, "hours").locator('[data-scr-act="ai-accept"]').click();
    await expect(page.locator("#modal")).toContainText("Effort Hours: 6.5 h, the AI's suggestion.");
    await page.locator("#scrWhy").fill("Matches the brief");
    const put = page.waitForResponse(r => r.request().method() === "PUT" && /\/scoring\/hours$/.test(r.url()));
    await page.locator("#scrGo").click();
    const res = await put; expect(res.status()).toBe(200); expect(res.request().postDataJSON()).toMatchObject({ use: "ai", reason: "Matches the brief" });
    await expect(row(page, "hours").locator('[data-scr-v="final"] b')).toHaveText("6.5 h");
    await expect(row(page, "hours").locator('[data-scr-v="final"] [data-scr-src]')).toHaveText("AI");
    const saved = await page.evaluate(i => apiFetch("GET", "/api/tasks/" + i), id);
    expect(saved.effort).toBe(6.5); expect(saved.meta.effortAuto).toMatchObject({ src: "ai" });
    await expect(page.locator('#drawer [data-meta="effort"] .v input')).toHaveValue("6.5");
  });

  test("a changed task makes the suggestion stale; one far from the calculation says so, its confidence lowered, and needs a reason", async () => {
    const id = made[0];
    await save(id, { assetCount: 6 });
    await expect(card(page, "hours").locator('[data-scr-warn="stale"]')).toContainText("The task changed since this suggestion: ask the AI again.");
    await expect(card(page, "hours").locator('[data-scr-act="ai-accept"]'), "a stale suggestion cannot be taken").toHaveCount(0);
    await expect(act(page, "hours", "ai")).toHaveText("Ask AI again");
    P.answer = ANSWER({ hours: 16, confidence: 0.8, deliverables: 6 });
    await act(page, "hours", "ai").click();
    await expect(card(page, "hours").locator('[data-scr-warn="far"]')).toHaveText("Far from the calculation (7 h): check it before taking it.");
    await expect(card(page, "hours").locator('[data-scr-warn="low_confidence"]')).toHaveText("Low confidence: under the workspace's minimum of 60%.");
    await expect(card(page, "hours").locator("[data-scr-ai-conf]")).toHaveText("Confidence 48% — lowered from 80%, far from the calculation");
    await expect(card(page, "hours")).toHaveClass(/\bfar\b/);
    await card(page, "hours").locator('[data-scr-act="ai-accept"]').click();
    await expect(page.locator("#scrWhy")).toHaveAttribute("placeholder", "Why take a value far from the calculation?");
    await page.locator("#scrGo").click();
    await expect(page.locator("#toasts .toast", { hasText: "Write a reason for the change" })).toBeVisible();
    await page.locator("#scrWhy").fill("The brief adds two formats");
    await page.locator("#scrGo").click();
    await expect(row(page, "hours").locator('[data-scr-v="final"] b')).toHaveText("16 h");
    const v = await page.evaluate(i => apiFetch("GET", "/api/tasks/" + i + "/scoring"), id);
    expect(v.audit[0].meta).toMatchObject({ use: "ai", far: true }); expect(v.audit[0].reason).toBe("The brief adds two formats");
  });

  test("Dismiss folds it away for this person, across a reload; the cache and a used-up quota are said in plain words", async () => {
    const id = made[0];
    await save(id, { assetCount: 7 });
    P.answer = ANSWER({ hours: 7.5, confidence: 0.9, deliverables: 7 });
    await act(page, "hours", "ai").click();
    await expect(card(page, "hours")).toContainText("The AI suggests 7.5 h");
    const asked = P.asked.length;
    /* asked again, the task as it is: the earlier answer, no new request */
    await act(page, "hours", "ai").click();
    await expect(row(page, "hours").locator('[data-scr-ai-note="cached"]')).toHaveText("The AI's earlier answer, for the task as it is now: it was not asked again.");
    expect(P.asked.length, "the model was not asked again").toBe(asked);
    await card(page, "hours").locator('[data-scr-act="ai-dismiss"]').click();
    await expect(card(page, "hours")).toHaveCount(0);
    await expect(row(page, "hours").locator('[data-scr-act="ai-show"]')).toHaveText("Show the suggestion");
    await page.reload(); await ready(page);   /* page.route stays with the page across the reload */
    await openBrief(page, id);
    await expect(row(page, "hours").locator('[data-scr-v="ai"] b')).toHaveText("7.5 h");
    await expect(card(page, "hours"), "still dismissed after a reload").toHaveCount(0);
    await row(page, "hours").locator('[data-scr-act="ai-show"]').click();
    await expect(card(page, "hours")).toBeVisible();
    /* a quota used up */
    mode = "quota";
    await act(page, "hours", "ai").click();
    await expect(row(page, "hours").locator('[data-scr-ai-note="quota_user"]')).toContainText("You have used your 20 AI suggestions for today, so the math stands. The next one is possible from");
    mode = "pipeline";
  });

  test("on the real server, with no AI chat model set up, the math stands and the panel says why; in Indonesian the panel's words change and the AI's do not", async () => {
    const id = made[0];
    await page.unroute(ROUTE);
    await save(id, { assetCount: 8 });
    await act(page, "hours", "ai").click();
    await expect(row(page, "hours").locator('[data-scr-ai-note="not_configured"]')).toHaveText("No AI chat model is set up in Settings → AI, so only the math is shown.");
    await page.route(ROUTE, intercept);
    P.answer = ANSWER({ hours: 9, deliverables: 8 });
    await act(page, "hours", "ai").click();
    await expect(card(page, "hours")).toContainText("The AI suggests 9 h");
    await page.evaluate(() => { UI_LANG = "id"; renderDrawer(); });
    await expect(card(page, "hours").locator('[data-scr-act="ai-dismiss"]')).toHaveText("Tutup");
    await expect(card(page, "hours").locator('[data-scr-act="ai-accept"]')).toHaveText("Terima");
    await expect(card(page, "hours").locator("[data-scr-ai-conf]")).toHaveText("Keyakinan 80%");
    await expect(card(page, "hours")).toContainText("AI menyarankan 9 h");
    await expect(card(page, "hours").locator(".scr-ai-text"), "the AI's own words stay as written").toHaveText("Five feed posts from one key visual; the first takes longest.");
    await page.evaluate(() => { UI_LANG = "en"; renderDrawer(); });
  });

  test("on a phone the suggestion fits: no sideways scroll", async ({ browser }) => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), ph = await phone.newPage();
    try {
      await signIn(ph);
      await openBrief(ph, made[0]);
      await expect(card(ph, "hours")).toBeVisible();
      /* measured once the task panel has finished sliding in */
      await expect.poll(() => ph.evaluate(() => { const d = document.getElementById("drawer"), c = document.querySelector('#drawer [data-scr-ai="hours"]'), r = c.getBoundingClientRect();
        return { drawer: d.scrollWidth <= d.clientWidth + 1, card: c.scrollWidth <= c.clientWidth + 1, inView: r.left >= -1 && r.right <= innerWidth + 1 }; })).toEqual({ drawer: true, card: true, inView: true });
    } finally { await phone.close(); }
  });

  test("\"AI on create\": the Create-time AI call goes to Smart Scoring's route and fills the Estimate when it is sure enough; off, the AI is not asked on Create", async () => {
    const chat = []; await page.route("**/api/ai/chat", r => { chat.push(1); return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: '{"hours": 3}' }) }); });
    await page.evaluate(() => { closeDrawer(); WS.ai = Object.assign({}, WS.ai, { chat: Object.assign({}, (WS.ai || {}).chat, { keySet: true }), processing: { externalEnabled: true, workspaceContextEnabled: true } }); });
    const draft = async title => { await page.evaluate(() => { myPrefs().taskMoreDetailsOpen = true; newTaskModal({}); S.drawerTask = "T-new"; renderDrawer(); }); await page.locator("#drHead .dr-title").click(); await page.keyboard.type(title); };
    const create = () => page.evaluate(async () => { const t = await createDraft(); return t && t.id; });
    const saved = id => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i), id);
    try {
      /* nothing finished like it and no kind of work in the title: the AI, through Smart Scoring */
      P.answer = ANSWER({ kind: null, hours: 7.3, confidence: 0.8, explanation: "An audit report of about a day's work." });
      await draft("Quarterly vendor audit report e2e");
      let id = await create(); made.push(id);
      await expect.poll(() => lastBody && lastBody.trigger).toBe("create");
      await expect.poll(async () => (await saved(id)).effort).toBe(7.5);
      let s = await saved(id);
      expect(s.meta.effortAuto).toMatchObject({ src: "ai", reason: "An audit report of about a day's work." });
      expect(chat.length, "not the old chat call").toBe(0);
      const v = await page.evaluate(i => apiFetch("GET", "/api/tasks/" + i + "/scoring"), id);
      expect(v.rows.hours.source).toBe("ai"); expect(v.rows.hours.aiValue).toBe(7.3);
      /* not sure enough: it waits in the panel, the Estimate is the draft's own */
      P.answer = ANSWER({ kind: null, hours: 9, confidence: 0.4 }); lastBody = null;
      await draft("Annual vendor audit summary e2e");
      const before = await page.evaluate(() => task("T-new").effort);
      id = await create(); made.push(id);
      await expect.poll(() => lastBody && lastBody.trigger).toBe("create");
      await page.waitForTimeout(400);
      expect((await saved(id)).effort, "a low-confidence suggestion is not taken by itself").toBe(before);
      await openBrief(page, id);
      await expect(card(page, "hours").locator('[data-scr-warn="low_confidence"]')).toBeVisible();
      /* "AI on create" off: nothing is asked on Create */
      await page.evaluate(async () => { const cur = (await apiFetch("GET", "/api/scoring/settings")).settings; WS.scoring = (await apiFetch("PUT", "/api/scoring/settings", { settings: Object.assign({}, cur, { ai: Object.assign({}, cur.ai, { onCreate: false }) }), configVersion: cur.configVersion })).settings; closeDrawer(); });
      lastBody = null;
      await draft("Biannual vendor audit memo e2e");
      id = await create(); made.push(id);
      await page.waitForTimeout(500);
      expect(lastBody, "Smart Scoring's route is not called").toBeNull();
      expect(chat.length, "nor the old chat call").toBe(0);
    } finally { await page.unroute("**/api/ai/chat"); }
  });
});
