/* The AI reading the documents in a brief (Oct 2026, src/scoring-settings.js, src/scoring-panel.js, docs/SMART-SCORING.md).
   Settings → Smart Scoring → AI: "Let the AI read documents in the brief" is off by default; "Document text per Ask AI"
   under it waits for it; both count in the Save bar, Discard puts them back; with external AI processing off both are
   disabled and say where to turn it on; they are saved through the real PUT /api/scoring/settings and stay across a
   reload (that part needs the server side, ai.readDocs and ai.docsChars in shared/scoring-settings.js, and is skipped
   without it). The task's Scoring & Intelligence panel: GET /api/tasks/:id/scoring is the real server's answer with
   `ai.docs` added here (page.route), POST /api/tasks/:id/scoring/ai is answered here with `aiResult.docs`. Reading off:
   no documents on the task, one quiet line for whoever may turn it on. On: each document a chip with its kind and
   what it is; "Use this task's documents" saves meta.aiReadDocs false with the task (and takes it away again), the
   chips then say nothing is sent; after Ask AI they say what was read, how much and what was cut. In Indonesian, in
   dark mode, and on a phone without sideways scrolling. Smart Scoring is turned on here and everything is put back. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const SLIDES = "https://docs.google.com/presentation/d/e2eDeck/edit", PRIV = "https://docs.google.com/document/d/e2ePrivate/edit", COPY = "https://docs.google.com/document/d/e2eCopy/edit";
const FOUND = () => [
  { ref: SLIDES, kind: "gslides", title: "Ramadan deck", status: "ready" },
  { ref: PRIV, kind: "gdoc", title: "Private brief", status: "not_public" },
  { ref: COPY, kind: "gdoc", title: "Copy doc", status: "ready" },
  { ref: "file:e2e-spec", kind: "file", title: "Spec sheet.pdf", status: "too_large" },
  { ref: "file:e2e-logo", kind: "file", title: "logo.ai", status: "unsupported" }];
const RUN = () => [
  { ref: SLIDES, kind: "gslides", title: "Ramadan deck", status: "read", chars: 4200 },
  { ref: PRIV, kind: "gdoc", title: "Private brief", status: "not_public" },
  { ref: COPY, kind: "gdoc", title: "Copy doc", status: "read", chars: 10000, cut: true },
  { ref: "file:e2e-spec", kind: "file", title: "Spec sheet.pdf", status: "too_large" },
  { ref: "file:e2e-logo", kind: "file", title: "logo.ai", status: "unsupported" }];
/* the real GET …/scoring with ai.docs added (and the AI's suggestion once asked, as the server keeps it — the documents'
   statuses it does not keep: "ready" again); POST …/ai answered with the view, the task, a suggestion and aiResult.docs */
async function mock(page, st) {
  await page.route(/\/api\/tasks\/[^/?]+\/scoring(\?.*)?$/, async route => {
    if (route.request().method() !== "GET") return route.fallback();
    const res = await route.fetch(), json = await res.json();
    if (res.ok()) json.ai = Object.assign({}, json.ai, { external: true, docs: st.docs }, st.suggestion ? { rows: Object.assign({}, (json.ai || {}).rows, { hours: st.suggestion }) } : {});
    await route.fulfill({ response: res, json });
  });
  await page.route("**/api/tasks/*/scoring/ai", async route => {
    const req = route.request(), url = new URL(req.url()), id = decodeURIComponent(url.pathname.split("/")[3]);
    st.asked.push(req.postDataJSON());
    const view = await (await page.request.get(url.origin + "/api/tasks/" + encodeURIComponent(id) + "/scoring")).json(), at = new Date().toISOString();
    st.suggestion = { module: "hours", value: 6.5, runId: "e2e-run", at, by: st.me, requestedBy: st.me, trigger: "ask", background: false, confidence: 0.8, shownConfidence: 0.8,
      lowConfidence: false, far: false, math: null, stale: false, explanation: "The deck shows twelve feed posts.", assumptions: [], missing: [], warnings: [], acceptable: false };
    view.ai = Object.assign({}, view.ai, { external: true, docs: st.docs, rows: { hours: st.suggestion, story: null, weighted: null } });
    view.aiResult = { status: "ok", reason: null, runId: "e2e-run", trigger: "ask", modules: ["hours"], stored: ["hours"], missingModules: [], gaps: [], docs: st.run };
    /* the task as the server has it, as every answer of the route carries it */
    view.task = await (await page.request.get(url.origin + "/api/tasks/" + encodeURIComponent(id))).json();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(view) });
  });
}
/* the workspace's switch as the page knows it (WS.scoring, normalized), without saving it: the panel's own reading */
const wsDocs = (page, on) => page.evaluate(v => { WS.scoring = Object.assign({}, WS.scoring, { ai: Object.assign({}, WS.scoring.ai, { readDocs: v }) }); }, on);
const external = (page, on) => page.evaluate(v => { WS.ai = Object.assign({}, WS.ai, { processing: Object.assign({}, (WS.ai || {}).processing, { externalEnabled: v }) }); }, on);
const openBrief = (page, id) => page.evaluate(i => { myPrefs().scoringPanelOpen = true; openTask(i); S.drawerTab = "brief"; renderDrawer(); }, id);
const docs = page => page.locator("#drawer [data-scr-docs]");
const chip = (page, ref) => page.locator('#drawer .scr-doc[data-scr-doc="' + ref + '"]');
const status = (page, ref) => chip(page, ref).locator(".scr-doc-st");
const useSwitch = page => page.locator('#drawer [data-scr-act="docs-use"]');
const sw = page => page.locator('[data-sc="ai.readDocs"]'), chars = page => page.locator("#sc_ai_docs_chars"), bar = page => page.locator("#scrBar");

test.describe.serial("the AI reading the documents in a brief", () => {
  let page, ctx, original, enabledState, prefs, taskId, known;
  const st = { docs: null, run: null, suggestion: null, asked: [], me: null }, errors = [];
  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    page = await ctx.newPage(); page.on("pageerror", e => errors.push(e.message));
    await signIn(page);
    st.me = await page.evaluate(() => ME);
    prefs = await page.evaluate(() => ({ scoringPanelOpen: myPrefs().scoringPanelOpen }));
    original = await page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings));
    expect(original.enabled).toBe(false);
    /* Smart Scoring on with Effort Hours as it comes (hybrid: the AI may be asked) */
    enabledState = await page.evaluate(async () => { const cur = (await apiFetch("GET", "/api/scoring/settings")).settings;
      WS.scoring = (await apiFetch("PUT", "/api/scoring/settings", { settings: Object.assign({}, cur, { enabled: true }), configVersion: cur.configVersion })).settings; return WS.scoring; });
    known = await page.evaluate(() => { const a = ScoringSettings.normalizeSettings({ ai: { readDocs: true, docsChars: 30000 } }).ai; return a.readDocs === true && a.docsChars === 30000; });
    taskId = await page.evaluate(async () => { const d = await apiFetch("POST", "/api/tasks", { title: "Feed posts from the Ramadan deck", status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME], assetCount: 0, effort: 0 }); await reloadAll(); return d.id; });
    st.docs = { on: true, allowed: true, canToggle: true, charsLimit: 15000, found: FOUND() };
    await mock(page, st);
  });
  test.afterAll(async () => {
    await page.unroute(/\/api\/tasks\/[^/?]+\/scoring(\?.*)?$/).catch(() => {});
    await page.unroute("**/api/tasks/*/scoring/ai").catch(() => {});
    await page.evaluate(async o => {
      UI_LANG = "en"; closeDrawer();
      const cur = await apiFetch("GET", "/api/scoring/settings"); await apiFetch("PUT", "/api/scoring/settings", { settings: o.original, configVersion: cur.settings.configVersion });
      if (o.taskId) await apiFetch("DELETE", "/api/tasks/" + o.taskId).catch(() => {});
      Object.keys(o.prefs).forEach(k => { if (o.prefs[k] === undefined || o.prefs[k] === null) delete myPrefs()[k]; else myPrefs()[k] = o.prefs[k]; }); await saveMyPrefs();
    }, { original, taskId, prefs });
    const back = await page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings));
    expect(back.enabled).toBe(false);
    expect(back.ai.readDocs === true, "reading documents is off again").toBe(false);
    await ctx.close();
    expect(errors, "no errors in the page").toEqual([]);
  });

  test("Settings → Smart Scoring → AI: off by default, the text budget waits for it, both count in the Save bar; with external AI processing off both say where to turn it on; in Indonesian", async () => {
    await external(page, true);
    await page.evaluate(() => go("settings", "scoring/ai"));
    await expect(page.locator('[data-scr-sec="ai"]')).toBeVisible();
    await expect(sw(page)).not.toHaveClass(/\bon\b/); await expect(sw(page)).toBeEnabled();
    await expect(sw(page)).toHaveAttribute("aria-label", "Let the AI read documents in the brief");
    await expect(chars(page)).toBeDisabled(); await expect(chars(page)).toHaveValue("15000");
    await expect(page.locator("#f_sc_ai_docs_chars label")).toHaveText("Document text per Ask AI");
    await expect(page.locator(".scr-docs-set")).toContainText("More text can make suggestions more accurate but uses more AI credit per Ask AI; documents share this budget evenly.");
    await expect(page.locator(".scr-docs-set")).toContainText("Example: A brief linking a Google Slides deck shared with “anyone with the link”: the AI reads its slides to judge the scope.");
    await expect(page.locator(".scr-docs-set")).toContainText("Not read: private Google documents — share them with “anyone with the link”, or attach the file to the task.");
    expect(await chars(page).locator("option").allTextContents()).toEqual(["5,000 characters (≈1.5 pages)", "15,000 characters (≈5 pages, default)", "30,000 characters (≈10 pages)"]);
    await sw(page).click();
    await expect(sw(page)).toHaveClass(/\bon\b/); await expect(chars(page)).toBeEnabled();
    await chars(page).selectOption("30000");
    await expect(bar(page).locator(".scr-bar-n")).toHaveText("2 unsaved changes");
    /* switched off again before saving: the budget waits again, its choice kept */
    await sw(page).click(); await expect(chars(page)).toBeDisabled(); await expect(chars(page)).toHaveValue("30000");
    await bar(page).getByRole("button", { name: "Discard" }).click();
    await expect(bar(page)).toBeHidden();
    await expect(sw(page)).not.toHaveClass(/\bon\b/); await expect(chars(page)).toHaveValue("15000"); await expect(chars(page)).toBeDisabled();
    /* external AI processing off (Settings → AI → Permissions): nothing can be sent */
    await external(page, false); await page.evaluate(() => scRepaint());
    await expect(sw(page)).toBeDisabled(); await expect(chars(page)).toBeDisabled();
    const ext = page.locator(".scr-docs-ext");
    await expect(ext).toContainText("External AI processing is off in Settings → AI, so no document can be sent to the AI. Turn it on there first.");
    await ext.getByRole("button", { name: "Open AI permissions" }).click();
    await expect(page).toHaveURL(/\/settings\/ai/);
    await expect(page.getByText("Allow external AI providers").first()).toBeVisible();
    await external(page, true);
    await page.evaluate(() => go("settings", "scoring/ai"));
    await expect(sw(page)).toBeEnabled(); await expect(page.locator(".scr-docs-ext")).toHaveCount(0);
    /* in Indonesian */
    await page.evaluate(() => { UI_LANG = "id"; renderScreen(false); });
    await expect(sw(page)).toHaveAttribute("aria-label", "Izinkan AI membaca dokumen di brief");
    await expect(page.locator('[data-scr-sec="ai"] .pref', { has: sw(page) })).toContainText("Izinkan AI membaca dokumen di brief");
    await expect(page.locator("#f_sc_ai_docs_chars label")).toHaveText("Teks dokumen per Ask AI");
    expect(await chars(page).locator("option").allTextContents()).toEqual(["5.000 karakter (±1,5 halaman)", "15.000 karakter (±5 halaman, bawaan)", "30.000 karakter (±10 halaman)"]);
    await expect(page.locator(".scr-docs-set")).toContainText("memakai lebih banyak kredit AI per Ask AI");
    await page.evaluate(() => { UI_LANG = "en"; renderScreen(false); });
  });

  test("the switch and the text budget are saved and stay across a reload, with their names in the history", async () => {
    test.skip(!known, "needs the server side: ai.readDocs and ai.docsChars in shared/scoring-settings.js");
    await external(page, true);
    await page.evaluate(() => go("settings", "scoring/ai"));
    await sw(page).click(); await chars(page).selectOption("30000");
    await expect(bar(page).locator(".scr-bar-n")).toHaveText("2 unsaved changes");
    await bar(page).getByRole("button", { name: "Save" }).click();
    await expect(page.locator("#toasts .toast").last()).toHaveText("Smart Scoring saved");
    await expect(bar(page)).toBeHidden();
    const saved = await page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings.ai));
    expect(saved).toMatchObject({ readDocs: true, docsChars: 30000 });
    await page.reload(); await ready(page); await external(page, true); await page.evaluate(() => scRepaint());
    await expect(page).toHaveURL(/\/settings\/scoring\/ai$/);
    await expect(sw(page)).toHaveClass(/\bon\b/); await expect(chars(page)).toHaveValue("30000"); await expect(chars(page)).toBeEnabled();
    await page.locator('.scr-nav [data-g="history"]').click();
    await expect(page.locator("#scAudit .scr-audit-row").first()).toContainText("Let the AI read documents in the brief");
    await expect(page.locator("#scAudit .scr-audit-row").first()).toContainText("Document text per Ask AI");
    await expect(page.locator("#scAudit .scr-audit-row").first()).toContainText("30,000 characters (≈10 pages)");
    /* back to Smart Scoring on with reading off, as the tests below start */
    await page.evaluate(async s => { const cur = (await apiFetch("GET", "/api/scoring/settings")).settings; WS.scoring = (await apiFetch("PUT", "/api/scoring/settings", { settings: Object.assign({}, s, { ai: cur.ai && Object.assign({}, cur.ai, { readDocs: false, docsChars: 15000 }) || s.ai }), configVersion: cur.configVersion })).settings; SC.draft = null; SC.saved = null; }, enabledState);
    expect(await page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings.ai))).toMatchObject({ readDocs: false, docsChars: 15000 });
  });

  test("reading off: no documents on the task; one quiet line for whoever may turn it on", async () => {
    await page.evaluate(() => go("tasks"));
    await wsDocs(page, false); st.docs = { on: false, allowed: false, canToggle: true, charsLimit: 15000, found: FOUND() };
    await openBrief(page, taskId);
    await expect(page.locator('#drawer .scr-row[data-scr-module="hours"]')).toBeVisible();
    await expect(docs(page)).toHaveAttribute("data-scr-docs", "off");
    await expect(docs(page)).toContainText("Reading brief documents is off for this workspace");
    await expect(page.locator("#drawer .scr-doc")).toHaveCount(0); await expect(useSwitch(page)).toHaveCount(0);
    /* someone who may not change it sees nothing about documents */
    await page.evaluate(() => { window.__scc = canI.scoringConfigure; canI.scoringConfigure = () => false; renderDrawer(); });
    await expect(page.locator('#drawer .scr-row[data-scr-module="hours"]')).toBeVisible();
    await expect(docs(page)).toHaveCount(0);
    await page.evaluate(() => { canI.scoringConfigure = window.__scc; delete window.__scc; renderDrawer(); });
    await docs(page).getByRole("button", { name: "Change it in Settings" }).click();
    await expect(page).toHaveURL(/\/settings\/scoring\/ai/);
    await expect(sw(page)).toBeVisible();
    await page.evaluate(() => { closeDrawer(); go("tasks"); });
  });

  test("reading on: each document a chip with its kind and what it is; the task can leave them out, saved with the task, and take them back", async () => {
    await wsDocs(page, true); st.docs = { on: true, allowed: true, canToggle: true, charsLimit: 15000, found: FOUND() };
    await openBrief(page, taskId);
    await expect(docs(page)).toHaveAttribute("data-scr-docs", "on");
    await expect(docs(page).locator(".scr-docs-head")).toContainText("Documents for the AI");
    await expect(page.locator("#drawer .scr-doc")).toHaveCount(5);
    await expect(chip(page, SLIDES)).toHaveAttribute("data-kind", "gslides"); await expect(chip(page, PRIV)).toHaveAttribute("data-kind", "gdoc"); await expect(chip(page, "file:e2e-spec")).toHaveAttribute("data-kind", "file");
    await expect(chip(page, SLIDES).locator("a")).toHaveText("Ramadan deck");
    await expect(chip(page, SLIDES).locator("a")).toHaveAttribute("href", SLIDES); await expect(chip(page, SLIDES).locator("a")).toHaveAttribute("target", "_blank");
    await expect(status(page, SLIDES)).toHaveText("read when the AI is asked");
    await expect(status(page, PRIV)).toHaveText("not shared publicly — set it to “anyone with the link”");
    await expect(status(page, "file:e2e-spec")).toHaveText("too large");
    await expect(status(page, "file:e2e-logo")).toHaveText("not supported");
    await expect(page.locator("#drawer [data-scr-docs-sum]")).toHaveCount(0);
    /* left out: meta.aiReadDocs false, saved with the task */
    await expect(useSwitch(page)).toHaveAttribute("aria-checked", "true");
    let put = page.waitForResponse(r => r.request().method() === "PUT" && new RegExp("/api/tasks/" + taskId + "$").test(r.url()));
    await useSwitch(page).click();
    let res = await put; expect(res.status()).toBe(200); expect(res.request().postDataJSON().meta.aiReadDocs).toBe(false);
    await expect(page.locator("#toasts .toast").last()).toHaveText("This task's documents will not be sent to the AI");
    await expect(docs(page)).toHaveAttribute("data-scr-docs", "excluded");
    await expect(useSwitch(page)).toHaveAttribute("aria-checked", "false");
    for (const ref of [SLIDES, PRIV, COPY, "file:e2e-spec", "file:e2e-logo"]) await expect(status(page, ref)).toHaveText("will not be sent");
    expect((await page.evaluate(i => apiFetch("GET", "/api/tasks/" + i), taskId)).meta.aiReadDocs).toBe(false);
    /* still left out after a reload */
    await page.reload(); await ready(page); await wsDocs(page, true);
    await openBrief(page, taskId);
    await expect(docs(page)).toHaveAttribute("data-scr-docs", "excluded");
    /* taken back: no word of its own, the workspace's again */
    put = page.waitForResponse(r => r.request().method() === "PUT" && new RegExp("/api/tasks/" + taskId + "$").test(r.url()));
    await useSwitch(page).click();
    res = await put; expect(res.status()).toBe(200); expect("aiReadDocs" in (res.request().postDataJSON().meta || {})).toBe(false);
    await expect(page.locator("#toasts .toast").last()).toHaveText("This task's documents are read when the AI is asked");
    await expect(docs(page)).toHaveAttribute("data-scr-docs", "on");
    await expect(status(page, SLIDES)).toHaveText("read when the AI is asked");
    expect("aiReadDocs" in ((await page.evaluate(i => apiFetch("GET", "/api/tasks/" + i), taskId)).meta || {})).toBe(false);
    /* whoever may not edit the task sees the switch, not to be changed */
    st.docs = Object.assign({}, st.docs, { canToggle: false });
    await page.evaluate(i => { SCR.shown = null; scrLoad(task(i), true); }, taskId);
    await expect(useSwitch(page)).toBeDisabled();
    st.docs = Object.assign({}, st.docs, { canToggle: true });
    await page.evaluate(i => scrLoad(task(i), true), taskId);
    await expect(useSwitch(page)).toBeEnabled();
  });

  test("after Ask AI each chip says what was read, how much and what was cut; reopened, it still says so; in Indonesian; dark mode", async () => {
    st.run = RUN(); st.asked.length = 0;
    await page.locator('#drawer [data-scr-act="ai"][data-scr-m="hours"]').click();
    await expect(page.locator('#drawer [data-scr-ai="hours"]')).toContainText("The AI suggests 6.5 h");
    expect(st.asked[0]).toMatchObject({ module: "hours", trigger: "ask" });
    await expect(status(page, SLIDES)).toHaveText("read · 4,200 characters");
    await expect(status(page, COPY)).toHaveText("read · 10,000 characters · cut to fit");
    await expect(status(page, PRIV)).toHaveText("not shared publicly — set it to “anyone with the link”");
    await expect(page.locator("#drawer [data-scr-docs-sum]")).toHaveText("read 14,200 of 15,000 characters");
    /* the server still says "ready" for them: what the ask said stays */
    await page.evaluate(i => { closeDrawer(); }, taskId);
    await openBrief(page, taskId);
    await expect(status(page, SLIDES)).toHaveText("read · 4,200 characters");
    /* in Indonesian */
    await page.evaluate(() => { UI_LANG = "id"; renderDrawer(); });
    await expect(docs(page).locator(".scr-docs-head b")).toHaveText("Dokumen untuk AI");
    await expect(docs(page).locator(".scr-docs-use")).toContainText("Pakai dokumen task ini");
    await expect(useSwitch(page)).toHaveAttribute("aria-label", "Pakai dokumen task ini");
    await expect(status(page, SLIDES)).toHaveText("dibaca · 4.200 karakter");
    await expect(status(page, COPY)).toHaveText("dibaca · 10.000 karakter · dipotong agar muat");
    await expect(status(page, PRIV)).toHaveText("tidak dibagikan secara publik — atur ke “siapa saja yang memiliki link”");
    await expect(status(page, "file:e2e-spec")).toHaveText("terlalu besar");
    await expect(page.locator("#drawer [data-scr-docs-sum]")).toHaveText("dibaca 14.200 dari 15.000 karakter");
    await page.evaluate(() => { UI_LANG = "en"; renderDrawer(); });
    /* dark mode (this page only, not saved): the words stay readable on the chip */
    const was = await page.evaluate(() => myPrefs().appearance === undefined ? null : myPrefs().appearance);
    try {
      await page.evaluate(() => { myPrefs().appearance = "dark"; applyTheme(); renderDrawer(); });
      const contrast = await page.evaluate(ref => { const el = document.querySelector('#drawer .scr-doc[data-scr-doc="' + ref + '"]'), rgb = s => s.match(/[\d.]+/g).slice(0, 3).map(Number);
        const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
        const ratio = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }, bg = getComputedStyle(el).backgroundColor;
        return { title: ratio(getComputedStyle(el.querySelector("a")).color, bg), status: ratio(getComputedStyle(el.querySelector(".scr-doc-st")).color, bg), dark: lum(rgb(bg)) < 0.2 }; }, SLIDES);
      expect(contrast.dark, "a dark chip").toBe(true);
      expect(contrast.title).toBeGreaterThan(4.5); expect(contrast.status).toBeGreaterThan(3);
    } finally { await page.evaluate(v => { if (v === null) delete myPrefs().appearance; else myPrefs().appearance = v; applyTheme(); renderDrawer(); }, was); }
  });

  test("on a phone the documents fit, and so does their setting: no sideways scroll", async ({ browser }) => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), ph = await phone.newPage();
    try {
      await signIn(ph); await mock(ph, st); await wsDocs(ph, true);
      await openBrief(ph, taskId);
      await expect(ph.locator("#drawer .scr-doc")).toHaveCount(5);
      /* (a switch's larger touch target is invisible and may reach past the edge: what is seen is measured) */
      await expect.poll(() => ph.evaluate(() => { const d = document.getElementById("drawer"), b = document.querySelector("#drawer .scr-docs"), r = b.getBoundingClientRect();
        const inside = sel => [...b.querySelectorAll(sel)].every(x => { const c = x.getBoundingClientRect(); return c.left >= r.left - 1 && c.right <= r.right + 1; });
        return { drawer: d.scrollWidth <= d.clientWidth + 1, inView: r.left >= -1 && r.right <= innerWidth + 1, chips: inside(".scr-doc"), head: inside(".scr-docs-head > *, .scr-docs-use > *") }; })).toEqual({ drawer: true, inView: true, chips: true, head: true });
      await ph.evaluate(() => { closeDrawer(); go("settings", "scoring/ai"); });
      await expect(ph.locator(".scr-docs-set")).toBeVisible();
      await expect.poll(() => ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector(".scr-docs-set").getBoundingClientRect().right <= innerWidth + 1)).toBe(true);
    } finally { await phone.close(); }
  });
});
