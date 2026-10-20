/* The team's context for the AI (Oct 2026, src/scoring-panel.js, docs/SMART-SCORING.md). After the AI's suggestion in
   a task's Scoring & Intelligence panel, each assumption of "It assumes" is marked Right or Wrong (a wrong one with what
   is true instead) and a note tells the AI what the brief does not say; "Send & ask again" saves it and asks at once,
   and the row then says what it was before and why it changed; it stays across a reload; checks of assumptions the
   suggestion no longer makes are "Saved corrections"; the notes of similar tasks going with it link to those tasks;
   "Clear context" saves it empty and asks nothing; a quota used up keeps it saved, a refusal loses nothing typed.
   Read-only for whoever may not change it, hidden with external AI processing off or no score asking the AI; nothing
   blinks — the note keeps its element, caret and focus through every redraw and while the AI is asked; in Indonesian,
   dark mode and on a phone. The AI's answer (POST …/scoring/ai) is answered here. GET …/scoring is the real server's
   with the suggestion added; its ai.context and PUT …/scoring/context are the real server's when it has them (and
   then the context sent with an ask is saved through that PUT, as the server does first), else answered here.
   Smart Scoring is turned on here and everything is put back. */
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
const ASSUME = ["1 revision round", "Copy is ready from the client"];
const sug = (st, o) => Object.assign({ module: "hours", value: 6, runId: "e2e-ctx-0", at: new Date().toISOString(), by: st.me, requestedBy: st.me, trigger: "ask", background: false, confidence: 0.8, shownConfidence: 0.8,
  lowConfidence: false, far: false, math: null, stale: false, explanation: "Twelve feed posts with copy.", assumptions: ASSUME.slice(), missing: [], warnings: [], acceptable: false }, o || {});
const emptyCtx = () => ({ note: "", checks: [], by: null, byName: null, at: null, canEdit: true, maxNote: 1000, maxChecks: 8, similar: [] });
/* as the server keeps it: trimmed, a fix only on a wrong one, by whoever saved it, now */
const keep = (st, b) => { const checks = (b.checks || []).map(c => (c.ok ? { a: c.a, ok: true } : Object.assign({ a: c.a, ok: false }, c.fix ? { fix: c.fix } : {})));
  const any = !!(String(b.note || "").trim() || checks.length);
  return Object.assign(emptyCtx(), { note: String(b.note || "").trim(), checks, by: any ? st.me : null, byName: any ? "Admin E2E" : null, at: any ? new Date().toISOString() : null }); };
/* what the panel is told: external AI processing on, the suggestion, the context (the server's, or the one kept here),
   the similar tasks and who may change it as set here */
function overlay(json, st) {
  const ai = json.ai = Object.assign({}, json.ai, { external: st.external !== false });
  if (st.suggestion) ai.rows = Object.assign({}, ai.rows, { hours: st.suggestion });
  if (!st.real) ai.context = st.ctx;
  ai.context = Object.assign({}, ai.context, st.similar ? { similar: st.similar } : {}, st.ro ? { canEdit: false } : {});
  return json;
}
async function mock(page, st) {
  await page.route(/\/api\/tasks\/[^/?]+\/scoring(\?.*)?$/, async route => {
    if (route.request().method() !== "GET") return route.fallback();
    const res = await route.fetch(), json = await res.json();
    await route.fulfill({ response: res, json: res.ok() ? overlay(json, st) : json });
  });
  await page.route(/\/api\/tasks\/[^/?]+\/scoring\/context$/, async route => {
    const b = route.request().postDataJSON(); st.puts.push(b);
    if (st.real) return route.fallback();
    if (!b || typeof b.note !== "string" || !Array.isArray(b.checks)) return route.fulfill({ status: 400, json: { error: "note is text and checks a list" } });
    st.ctx = keep(st, b); await route.fulfill({ status: 200, json: { context: st.ctx } });
  });
  await page.route("**/api/tasks/*/scoring/ai", async route => {
    const req = route.request(), url = new URL(req.url()), id = decodeURIComponent(url.pathname.split("/")[3]), b = req.postDataJSON(), base = url.origin + "/api/tasks/" + encodeURIComponent(id);
    st.asked.push(b);
    if (st.hold) await st.hold;
    if (st.forbid) return route.fulfill({ status: 403, json: { error: "You may not change this task's context for the AI." } });
    /* the context first, as the server does: through its own PUT when it has one */
    if (b.context) { if (st.real) { const r = await page.request.put(base + "/scoring/context", { data: b.context, headers: { origin: url.origin } }); expect(r.status()).toBe(200); } else st.ctx = keep(st, b.context); }
    let aiResult;
    if (st.quota) aiResult = { status: "quota", reason: "quota_user", runId: null, trigger: "ask", modules: ["hours"], missingModules: [], quota: { user: { limit: 20, used: 20, resetAt: null } } };
    else {
      const prev = { hours: st.suggestion ? st.suggestion.value : null, storyPoints: null, weightedPoints: null }, effect = b.context ? st.effect : "", runId = "e2e-ctx-" + (++st.n);
      st.suggestion = sug(st, { value: st.next, runId, previous: prev, contextEffect: effect, assumptions: st.nextAssume || ASSUME.slice() });
      aiResult = { status: "ok", reason: null, runId, trigger: "ask", modules: ["hours"], stored: ["hours"], missingModules: [], gaps: [], docs: [], previous: prev, contextEffect: effect, context: { used: !!b.context, similar: [] } };
    }
    const view = overlay(await (await page.request.get(base + "/scoring")).json(), st);
    view.aiResult = aiResult; view.task = await (await page.request.get(base)).json();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(view) });
  });
}
const openBrief = (page, id) => page.evaluate(i => { myPrefs().scoringPanelOpen = true; openTask(i); S.drawerTab = "brief"; renderDrawer(); }, id);
const box = page => page.locator("#drawer .scr-ctx");
const note = page => page.locator("#drawer #scrCtxNote");
const send = page => page.locator('#drawer [data-scr-act="ctx-send"]');
const clear = page => page.locator('#drawer [data-scr-act="ctx-clear"]');
const card = page => page.locator('#drawer [data-scr-ai="hours"]');
const asm = (page, i) => card(page).locator(".scr-asm").nth(i);
const tog = (page, i, ok) => asm(page, i).locator('.scr-tog[data-ok="' + (ok ? 1 : 0) + '"]');
const fix = (page, i) => asm(page, i).locator(".scr-fix");

test.describe.serial("the team's context for the AI", () => {
  let page, ctx, original, prefs, taskId, otherId;
  const st = { suggestion: null, ctx: emptyCtx(), similar: null, ro: false, external: true, real: false, quota: false, forbid: false, hold: null, asked: [], puts: [], me: null, n: 0, next: 9, effect: "", nextAssume: null }, errors = [];
  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    page = await ctx.newPage(); page.on("pageerror", e => errors.push(e.message));
    await signIn(page);
    st.me = await page.evaluate(() => ME);
    prefs = await page.evaluate(() => ({ scoringPanelOpen: myPrefs().scoringPanelOpen, appearance: myPrefs().appearance }));
    original = await page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings));
    expect(original.enabled).toBe(false);
    await page.evaluate(async () => { const cur = (await apiFetch("GET", "/api/scoring/settings")).settings;
      WS.scoring = (await apiFetch("PUT", "/api/scoring/settings", { settings: Object.assign({}, cur, { enabled: true }), configVersion: cur.configVersion })).settings; });
    [taskId, otherId] = await page.evaluate(async () => { const mk = t => apiFetch("POST", "/api/tasks", { title: t, status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME], assetCount: 0, effort: 0 }).then(d => d.id);
      const a = await mk("Feed posts for the Ramadan campaign"), b = await mk("Older feed posts for the same client"); await reloadAll(); return [a, b]; });
    /* the real server keeps the context when its GET says so */
    st.real = await page.evaluate(i => apiFetch("GET", "/api/tasks/" + i + "/scoring").then(r => !!(r.ai && r.ai.context && typeof r.ai.context === "object")), taskId);
    st.suggestion = sug(st);
    await mock(page, st);
  });
  test.afterAll(async () => {
    st.hold = null;
    for (const r of [/\/api\/tasks\/[^/?]+\/scoring(\?.*)?$/, /\/api\/tasks\/[^/?]+\/scoring\/context$/, "**/api/tasks/*/scoring/ai"]) await page.unroute(r).catch(() => {});
    await page.evaluate(async o => {
      UI_LANG = "en"; closeDrawer();
      for (const i of [o.taskId, o.otherId]) if (i) { if (o.real) await apiFetch("PUT", "/api/tasks/" + i + "/scoring/context", { note: "", checks: [] }).catch(() => {}); await apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }
      const cur = await apiFetch("GET", "/api/scoring/settings"); await apiFetch("PUT", "/api/scoring/settings", { settings: o.original, configVersion: cur.settings.configVersion });
      Object.keys(o.prefs).forEach(k => { if (o.prefs[k] === undefined || o.prefs[k] === null) delete myPrefs()[k]; else myPrefs()[k] = o.prefs[k]; }); applyTheme(); await saveMyPrefs();
    }, { original, taskId, otherId, prefs, real: st.real });
    expect((await page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings))).enabled).toBe(false);
    const left = await page.evaluate(ids => Promise.all(ids.map(i => apiFetch("GET", "/api/tasks/" + i).then(() => i, () => null))), [taskId, otherId]);
    expect(left.filter(Boolean), "the tasks made here are gone").toEqual([]);
    await ctx.close();
    expect(errors, "no errors in the page").toEqual([]);
  });

  test("after a suggestion: Right or Wrong on each assumption, what is true instead under a wrong one, and the note with its counter, placeholder and help line", async () => {
    await openBrief(page, taskId);
    await expect(card(page)).toContainText("The AI suggests 6 h");
    await expect(box(page)).toHaveAttribute("data-scr-ctx", "edit");
    await expect(box(page).locator(".scr-ctx-head")).toHaveText("Add context for the AI");
    await expect(note(page)).toHaveAttribute("placeholder", "E.g. this client usually asks for 3 revision rounds; product photos arrive two days before the deadline.");
    await expect(box(page)).toContainText("The AI uses this on every Ask AI for this task, and as an example for similar tasks.");
    await expect(box(page).locator("[data-scr-ctx-n]")).toHaveText("0 / 1,000");
    await expect(send(page)).toHaveText("Send & ask again"); await expect(send(page)).toBeDisabled();
    await expect(clear(page)).toHaveCount(0);
    await expect(asm(page, 0).locator("[data-no-translate]")).toHaveText("1 revision round");
    await expect(tog(page, 0, true)).toHaveText("✓ Right"); await expect(tog(page, 0, false)).toHaveText("✗ Wrong");
    await expect(tog(page, 0, false)).toHaveAttribute("aria-pressed", "false"); await expect(fix(page, 0)).toHaveCount(0);
    /* Wrong: the line for what is true instead, focused; Right on the other; the same again takes the mark away */
    await tog(page, 0, false).click();
    await expect(tog(page, 0, false)).toHaveAttribute("aria-pressed", "true");
    await expect(fix(page, 0)).toBeFocused(); await expect(fix(page, 0)).toHaveAttribute("placeholder", "What is true instead…"); await expect(fix(page, 0)).toHaveAttribute("maxlength", "200");
    await page.keyboard.type("this client usually asks for 3 rounds");
    await expect(send(page)).toBeEnabled();
    await tog(page, 1, true).click(); await expect(tog(page, 1, true)).toHaveAttribute("aria-pressed", "true");
    await tog(page, 1, true).click(); await expect(tog(page, 1, true)).toHaveAttribute("aria-pressed", "false");
    await tog(page, 1, true).click();
    await expect(fix(page, 0)).toHaveValue("this client usually asks for 3 rounds");
    /* the note: counted as typed, and nothing blinks — a redraw keeps the very same field, caret and focus */
    await note(page).click(); await page.keyboard.type("Product photos arrive two days before the deadline.");
    await expect(box(page).locator("[data-scr-ctx-n]")).toHaveText("51 / 1,000");
    await page.evaluate(() => { window.__note = document.getElementById("scrCtxNote"); window.__note.setSelectionRange(7, 13); });
    await page.evaluate(i => { SCR.why[i + "|hours"] = true; scrPaint(i); renderDrawer(); }, taskId);
    expect(await page.evaluate(() => { const n = document.getElementById("scrCtxNote"); return { same: n === window.__note, focus: document.activeElement === n, sel: [n.selectionStart, n.selectionEnd], why: !!document.querySelector('#drawer [data-scr-why="hours"]') }; }))
      .toEqual({ same: true, focus: true, sel: [7, 13], why: true });
    await page.evaluate(i => { delete window.__note; SCR.why[i + "|hours"] = false; scrPaint(i); }, taskId);
    await expect(note(page)).toHaveValue("Product photos arrive two days before the deadline.");
    expect(st.asked.length, "nothing asked yet").toBe(0); expect(st.puts.length, "nothing saved yet").toBe(0);
  });

  test("Send & ask again: saved and asked at once; while it runs the button waits and the note keeps its text and focus; then before → now, and why", async () => {
    let release; st.hold = new Promise(r => { release = r; }); st.next = 9; st.effect = "The client asks for three rounds, so the revisions take three more hours.";
    await send(page).click();
    await expect(send(page)).toBeDisabled(); await expect(send(page)).toHaveAttribute("aria-busy", "true"); await expect(send(page)).toContainText("Sending…");
    await expect(page.locator('#drawer [data-scr-act="ai"][data-scr-m="hours"]')).toHaveAttribute("aria-busy", "true");
    await expect(page.locator('#drawer .scr-val[data-scr-v="ai"]').first()).toContainText("Asking the AI…");
    /* typed on while it is asked: the same field, focused */
    await note(page).click(); await page.keyboard.press("End");
    await expect(note(page)).toBeEnabled(); await expect(note(page)).toBeFocused();
    await page.keyboard.type(" Two");
    release(); st.hold = null;
    await expect(card(page)).toContainText("The AI suggests 9 h");
    expect(st.asked.length).toBe(1);
    expect(st.asked[0]).toMatchObject({ module: "hours", trigger: "ask", context: { note: "Product photos arrive two days before the deadline.", checks: [{ a: "1 revision round", ok: false, fix: "this client usually asks for 3 rounds" }, { a: "Copy is ready from the client", ok: true }] } });
    await expect(note(page)).toBeFocused();
    await expect(note(page)).toHaveValue("Product photos arrive two days before the deadline. Two");
    await expect(card(page).locator("[data-scr-ai-delta]")).toHaveText("Before 6 h → now 9 h");
    await expect(card(page).locator("[data-scr-ai-effect]")).toHaveText("Because of the team's context: " + st.effect);
    await expect(box(page).locator("[data-scr-ctx-by]")).toContainText("Context from Admin E2E · ");
    await expect(clear(page)).toBeVisible();
    await expect(send(page), "typed on since: something new to send").toBeEnabled();
    await expect(tog(page, 0, false)).toHaveAttribute("aria-pressed", "true"); await expect(fix(page, 0)).toHaveValue("this client usually asks for 3 rounds");
    /* back to what is saved: nothing new to send */
    await note(page).fill("Product photos arrive two days before the deadline.");
    await expect(send(page)).toBeDisabled();
    if (st.real) expect((await page.evaluate(i => apiFetch("GET", "/api/tasks/" + i + "/scoring").then(r => r.ai.context), taskId))).toMatchObject({ note: "Product photos arrive two days before the deadline.", canEdit: true });
  });

  test("it stays across a reload: the note, the marks, before → now and why", async () => {
    await page.reload(); await ready(page);
    await openBrief(page, taskId);
    await expect(note(page)).toHaveValue("Product photos arrive two days before the deadline.");
    await expect(tog(page, 0, false)).toHaveAttribute("aria-pressed", "true"); await expect(fix(page, 0)).toHaveValue("this client usually asks for 3 rounds");
    await expect(tog(page, 1, true)).toHaveAttribute("aria-pressed", "true");
    await expect(card(page).locator("[data-scr-ai-delta]")).toHaveText("Before 6 h → now 9 h");
    await expect(card(page).locator("[data-scr-ai-effect]")).toContainText("the revisions take three more hours");
    await expect(box(page).locator("[data-scr-ctx-by]")).toContainText("Context from Admin E2E");
    await expect(send(page)).toBeDisabled();
    /* out of date (the task changed since): Send & ask again asks again with nothing new */
    st.suggestion = Object.assign({}, st.suggestion, { stale: true, warnings: [{ code: "stale" }] });
    await page.evaluate(i => scrLoad(task(i), true), taskId);
    await expect(send(page)).toBeEnabled();
    st.suggestion = Object.assign({}, st.suggestion, { stale: false, warnings: [] });
    await page.evaluate(i => scrLoad(task(i), true), taskId);
    await expect(send(page)).toBeDisabled();
  });

  test("saved corrections and the similar tasks' notes, with links that open the task; Clear context saves it empty and asks nothing", async () => {
    /* the AI no longer assumes "1 revision round": its check is a saved correction, to be removed */
    st.suggestion = Object.assign({}, st.suggestion, { assumptions: ["Copy is ready from the client", "Stock photos are fine"] });
    st.similar = [{ id: otherId, title: "Older feed posts for the same client" }];
    await page.evaluate(i => scrLoad(task(i), true), taskId);
    const saved = box(page).locator("[data-scr-ctx-saved]");
    await expect(saved.locator("b")).toHaveText("Saved corrections");
    await expect(saved.locator("li")).toHaveCount(1);
    await expect(saved.locator("li")).toHaveText("“1 revision round” — wrong; in fact: this client usually asks for 3 rounds");
    await expect(tog(page, 0, true)).toHaveAttribute("aria-pressed", "true");
    await expect(box(page).locator("[data-scr-ctx-sim]")).toContainText("+ 1 note from a similar task will be used: " + otherId + " Older feed posts for the same client");
    await expect(saved.getByRole("button", { name: "Remove" }).locator("svg"), "the × is drawn").toHaveCSS("stroke", /^rgb/);
    await saved.getByRole("button", { name: "Remove" }).click();
    await expect(saved).toHaveCount(0); await expect(send(page)).toBeEnabled();
    /* a similar task opens */
    await box(page).locator('[data-scr-sim="' + otherId + '"]').click();
    await expect.poll(() => page.evaluate(() => S.drawerTask)).toBe(otherId);
    await openBrief(page, taskId);
    await expect(box(page).locator("[data-scr-ctx-saved]"), "the removal is still to be sent").toHaveCount(0);
    st.similar = null;
    /* Clear context: PUT with nothing, no ask */
    const asked = st.asked.length, put = page.waitForResponse(r => r.request().method() === "PUT" && /\/scoring\/context$/.test(r.url()));
    await clear(page).click();
    const res = await put; expect(res.status()).toBe(200); expect(res.request().postDataJSON()).toEqual({ note: "", checks: [] });
    await expect(page.locator("#toasts .toast").last()).toHaveText("Context cleared");
    await expect(note(page)).toHaveValue(""); await expect(clear(page)).toHaveCount(0); await expect(box(page).locator("[data-scr-ctx-by]")).toHaveCount(0);
    await expect(tog(page, 0, true)).toHaveAttribute("aria-pressed", "false");
    expect(st.asked.length, "nothing asked").toBe(asked);
    if (st.real) expect((await page.evaluate(i => apiFetch("GET", "/api/tasks/" + i + "/scoring").then(r => r.ai.context), taskId))).toMatchObject({ note: "", checks: [] });
  });

  test("a quota used up keeps the context saved and says so; a refusal loses nothing typed", async () => {
    st.quota = true;
    await note(page).fill("The client replies slowly on Fridays.");
    await send(page).click();
    await expect(card(page).locator("[data-scr-ai-note]")).toContainText("You have used your 20 AI suggestions for today, so the math stands.");
    await expect(box(page).locator("[data-scr-ctx-by]")).toContainText("Context from Admin E2E");
    await expect(note(page)).toHaveValue("The client replies slowly on Fridays."); await expect(send(page)).toBeDisabled();
    await expect(clear(page)).toBeVisible();
    st.quota = false; st.forbid = true;
    await note(page).fill("Keep this text");
    await send(page).click();
    await expect(page.locator("#toasts .toast").last()).toHaveText("You may not change this task's context for the AI.");
    await expect(note(page)).toHaveValue("Keep this text"); await expect(send(page)).toBeEnabled();
    st.forbid = false;
    await note(page).fill("The client replies slowly on Fridays.");
    await expect(send(page)).toBeDisabled();
  });

  test("read-only for whoever may not change it; hidden with external AI processing off or no score asking the AI", async () => {
    st.ro = true; await page.evaluate(i => scrLoad(task(i), true), taskId);
    await expect(box(page)).toHaveAttribute("data-scr-ctx", "ro");
    await expect(box(page).locator(".scr-ctx-head")).toHaveText("The team's context for the AI");
    await expect(box(page).locator(".scr-ctx-text")).toHaveText("The client replies slowly on Fridays.");
    await expect(box(page).locator("textarea, input, button")).toHaveCount(0);
    await expect(card(page).locator(".scr-tog, .scr-fix")).toHaveCount(0);
    st.ro = false;
    st.external = false; await page.evaluate(i => scrLoad(task(i), true), taskId);
    await expect(page.locator('#drawer .scr-row[data-scr-module="hours"]')).toBeVisible();
    await expect(box(page)).toHaveCount(0); await expect(card(page).locator(".scr-tog")).toHaveCount(0);
    st.external = true; await page.evaluate(i => scrLoad(task(i), true), taskId);
    await expect(box(page)).toHaveAttribute("data-scr-ctx", "edit");
    const was = await page.evaluate(() => WS.scoring);
    try {
      await page.evaluate(() => { const m = WS.scoring.modules; WS.scoring = Object.assign({}, WS.scoring, { modules: Object.assign({}, m, { hours: Object.assign({}, m.hours, { mode: "math_only" }) }) }); renderDrawer(); });
      await expect(page.locator('#drawer .scr-row[data-scr-module="hours"]')).toBeVisible();
      await expect(box(page)).toHaveCount(0);
    } finally { await page.evaluate(w => { WS.scoring = w; renderDrawer(); }, was); }
    await expect(box(page)).toHaveAttribute("data-scr-ctx", "edit");
  });

  test("in Indonesian, and in dark mode the words stay readable", async () => {
    st.similar = [{ id: otherId, title: "Older feed posts for the same client" }];
    await page.evaluate(i => scrLoad(task(i), true), taskId);
    await tog(page, 0, false).click();
    await page.evaluate(() => { UI_LANG = "id"; renderDrawer(); });
    try {
      await expect(box(page).locator(".scr-ctx-head")).toHaveText("Tambah konteks untuk AI");
      await expect(note(page)).toHaveAttribute("placeholder", "Misal: klien ini biasanya minta 3x revisi; foto produk dari klien baru masuk H-2.");
      await expect(box(page)).toContainText("AI memakai ini setiap Ask AI di task ini, dan sebagai contoh untuk task serupa.");
      await expect(send(page)).toHaveText("Kirim & tanya ulang"); await expect(clear(page)).toHaveText("Hapus konteks");
      await expect(box(page).locator("[data-scr-ctx-by]")).toContainText("Konteks dari Admin E2E · ");
      await expect(box(page).locator("[data-scr-ctx-sim]")).toContainText("+ 1 catatan dari task serupa ikut dipakai: ");
      await expect(tog(page, 0, true)).toHaveText("✓ Benar"); await expect(tog(page, 0, false)).toHaveText("✗ Salah");
      await expect(fix(page, 0)).toHaveAttribute("placeholder", "Yang sebenarnya…");
      await expect(card(page).locator("[data-scr-ai-delta]")).toHaveText("Sebelumnya 6 h → sekarang 9 h");
      await expect(card(page).locator("[data-scr-ai-effect]")).toContainText("Karena konteks tim: ");
    } finally { await page.evaluate(() => { UI_LANG = "en"; renderDrawer(); }); }
    try {
      await page.evaluate(() => { myPrefs().appearance = "dark"; applyTheme(); renderDrawer(); });
      const c = await page.evaluate(() => { const rgb = s => s.match(/[\d.]+/g).slice(0, 3).map(Number);
        const lum = x => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(x[0]) + 0.7152 * f(x[1]) + 0.0722 * f(x[2]); };
        const ratio = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }, cs = el => getComputedStyle(el);
        const n = document.getElementById("scrCtxNote"), on = document.querySelector('#drawer .scr-tog.on'), eff = document.querySelector("#drawer [data-scr-ai-effect]");
        return { dark: lum(rgb(cs(n).backgroundColor)) < 0.2, note: ratio(cs(n).color, cs(n).backgroundColor), toggle: ratio(cs(on).color, cs(on).backgroundColor), effect: ratio(cs(eff).color, cs(eff).backgroundColor) }; });
      expect(c.dark, "a dark field").toBe(true);
      expect(c.note).toBeGreaterThan(4.5); expect(c.toggle).toBeGreaterThan(3); expect(c.effect).toBeGreaterThan(4.5);
    } finally { await page.evaluate(v => { if (v === undefined || v === null) delete myPrefs().appearance; else myPrefs().appearance = v; applyTheme(); renderDrawer(); }, prefs.appearance); }
    /* the mark made here is not kept */
    await tog(page, 0, false).click(); await expect(send(page)).toBeDisabled();
    st.similar = null;
  });

  test("on a phone the context fits: no sideways scroll", async ({ browser }) => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), ph = await phone.newPage();
    try {
      await signIn(ph); st.similar = [{ id: otherId, title: "Older feed posts for the same client, with a very long title that has to wrap" }]; await mock(ph, st);
      await ph.evaluate(() => { myPrefs().scoringPanelOpen = true; });
      await openBrief(ph, taskId);
      await expect(ph.locator("#drawer .scr-ctx")).toBeVisible();
      await ph.locator('#drawer [data-scr-ai="hours"] .scr-tog[data-ok="0"]').first().click();
      await expect(ph.locator('#drawer [data-scr-ai="hours"] .scr-fix')).toBeVisible();
      await expect.poll(() => ph.evaluate(() => { const d = document.getElementById("drawer"), w = innerWidth;
        const inside = sel => [...document.querySelectorAll(sel)].every(x => { const r = x.getBoundingClientRect(); return r.left >= -1 && r.right <= w + 1; });
        return { drawer: d.scrollWidth <= d.clientWidth + 1, box: inside("#drawer .scr-ctx, #drawer .scr-ctx *"), card: inside('#drawer [data-scr-ai="hours"], #drawer [data-scr-ai="hours"] .scr-asm *') }; })).toEqual({ drawer: true, box: true, card: true });
    } finally { st.similar = null; await phone.close(); }
  });
});
