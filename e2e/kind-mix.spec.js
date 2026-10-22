/* Several kinds of work in one task (Oct 2026, src/scoring-kinds.js, src/scoring-panel.js; the contract in
   docs/SMART-SCORING.md). "Youtube podcast: full video, 4 reels and a key visual" is 1 video + 4 reels + 1 key visual:
   the kind dropdown's last option, "Several kinds…", opens the mix editor inline under the trigger it was chosen from —
   a row a kind (the same dropdown, no Auto, no kind twice), its count typed or with − + and the arrow keys, × to remove,
   "+ Add kind" up to 8, the hours of each kind and the total from the engine — and what it shows is saved as meta.kinds
   once it has 2 kinds; the trigger then reads "Mixed · 3 kinds", the kinds in its tooltip, and keeps it after a reload;
   under 2 kinds "Use one kind" turns it back into the single pick of the kind left, and so does choosing one kind in
   the dropdown. The Smart Scoring panel has the same trigger and its own editor under the hours row, its deliverables
   by kind, and the rating form shows the mix instead of offering a kind that would replace it. The AI's split, when it
   is not the task's own, is offered with "Use this split". When the title names several kinds a quiet line under the
   Effort line offers to split it (never applied by itself) and can be dismissed for the task. Read-only: a plain list.
   At 390 px nothing scrolls sideways; English and Indonesian, light and dark (KMIX_SHOTS=<folder> for screenshots).
   GET …/scoring is the real server's; its `kinds` and `mix` are added here while it has none, and the AI's suggestion
   (with its `mix`) always, since the e2e server has no AI. Smart Scoring is turned on here and everything is put back. */
const { test, expect } = require("@playwright/test");
const path = require("path");
const Engine = require("../shared/scoring-engine.js"), Settings = require("../shared/scoring-settings.js");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const SHOTS = process.env.KMIX_SHOTS || "";
const TITLE = "Youtube podcast: full video, 4 reels and a key visual";
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
/* the mix as the server keeps it (the contract): active kinds, each once, counts 1–500, 2 to 8 */
const cleanMix = (l, kinds) => { const act = new Set(kinds.filter(k => k.active !== false).map(k => k.id)), out = [];
  (Array.isArray(l) ? l : []).forEach(x => { if (x && act.has(x.k) && !out.some(o => o.k === x.k) && out.length < 8) out.push({ k: x.k, n: Math.max(1, Math.min(500, Math.round(+x.n) || 1)) }); });
  return out.length >= 2 ? out : null; };
async function mock(page, st) {
  await page.route(/\/api\/tasks\/[^/?]+\/scoring(\?.*)?$/, async route => {
    if (route.request().method() !== "GET") return route.fallback();
    const res = await route.fetch(), json = await res.json();
    if (res.ok()) {
      if (!("kinds" in json)) {
        const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/")[3]), t = await (await page.request.get(new URL(route.request().url()).origin + "/api/tasks/" + encodeURIComponent(id))).json();
        const S = Settings.normalizeSettings(st.settings), mix = cleanMix((t.meta || {}).kinds, S.kinds);
        json.kinds = mix; json.mix = mix ? mix.map(x => { const f = Engine.hours(S.hours, { kind: x.k, units: x.n }).factors; return { kind: x.k, units: x.n, hours: f ? f.perUnit * f.unitsFactor : null }; }) : null;
      }
      json.ai = Object.assign({}, json.ai, { external: true });
      if (st.suggestion) json.ai.rows = Object.assign({}, json.ai.rows, { hours: st.suggestion });
    }
    await route.fulfill({ response: res, json });
  });
  await page.route("**/api/tasks/*/scoring/calculate", async route => { st.calcs.push(route.request().postDataJSON()); return route.fallback(); });
}
const sug = (me, mix) => ({ module: "hours", value: 30, runId: "e2e-mix-" + Date.now(), at: new Date().toISOString(), by: me, requestedBy: me, trigger: "ask", background: false, confidence: 0.8, shownConfidence: 0.8,
  lowConfidence: false, far: false, math: null, stale: false, explanation: "A full video, four reels and a key visual.", assumptions: [], missing: [], warnings: [], acceptable: false, mix });
const openBrief = (page, id) => page.evaluate(i => { myPrefs().scoringPanelOpen = true; openTask(i); S.drawerTab = "brief"; renderDrawer(); }, id);
const effort = page => page.locator("#drawer .enh-blocks .effort");
const trig = page => effort(page).locator(".scr-kpick .scr-kdd");
const panelTrig = page => page.locator('#drawer .scr-row[data-scr-module="hours"] .scr-kpick .scr-kdd');
const pop = page => page.locator("#scrKdd");
const option = (page, v) => pop(page).locator('[role=option][data-v="' + v + '"]');
const ed = (page, at) => page.locator('#drawer [data-kmix-slot="' + (at || "effort") + '"] .scr-kmix');
const row = (page, i, at) => ed(page, at).locator(".scr-kmix-row").nth(i);
const count = (page, i, at) => row(page, i, at).locator(".scr-kmix-step input");
const total = (page, at) => ed(page, at).locator("[data-kmix-total]");
const hint = page => effort(page).locator("[data-kmix-hint]");
const meta = (page, id) => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(d => { const m = d.meta || {}; return { kind: m.kind || null, kinds: m.kinds || null }; }), id);
const kindsOf = (page, id) => meta(page, id).then(m => m.kinds);
const setMeta = (page, id, m) => page.evaluate(async o => { const t = task(o.id); await editTaskWith(t, x => { const mm = taskMeta(x); delete mm.kinds; delete mm.kind; Object.assign(mm, o.m); }); }, { id, m });
/* with KMIX_SHOTS: the task panel with what is shown in the middle of it */
async function snap(page, name, what) {
  if (!SHOTS) return;
  await what.evaluate(e => e.scrollIntoView({ block: "center" })); await page.waitForTimeout(250);
  const d = await page.locator("#drawer").boundingBox();
  await page.screenshot({ path: path.join(SHOTS, name + ".png"), clip: { x: d.x, y: d.y, width: d.width, height: d.height } });
}
const noSideways = page => page.evaluate(() => { const d = document.getElementById("drawer"), b = document.querySelector("#drawer .dr-body, #drBody") || d;
  return document.documentElement.scrollWidth <= window.innerWidth + 1 && b.scrollWidth <= b.clientWidth + 1; });

test.describe.serial("several kinds of work in one task", () => {
  let page, ctx, original, prefs, taskId, me, appearance;
  const st = { settings: null, suggestion: null, calcs: [] }, errors = [];
  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    page = await ctx.newPage(); page.on("pageerror", e => errors.push(e.message));
    await signIn(page);
    me = await page.evaluate(() => ME);
    prefs = await page.evaluate(() => ({ scoringPanelOpen: myPrefs().scoringPanelOpen }));
    appearance = await page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => ((d.people[ME] || {}).prefs || {}).appearance || (d.ws.theme || {}).appearance || "light"));
    original = await page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings));
    expect(original.enabled).toBe(false);
    st.settings = await page.evaluate(async () => { const cur = (await apiFetch("GET", "/api/scoring/settings")).settings;
      WS.scoring = (await apiFetch("PUT", "/api/scoring/settings", { settings: Object.assign({}, cur, { enabled: true }), configVersion: cur.configVersion })).settings; return WS.scoring; });
    taskId = await page.evaluate(async t => { const d = await apiFetch("POST", "/api/tasks", { title: t, status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME], assetCount: 0, effort: 0 }); await reloadAll(); return d.id; }, TITLE);
    await page.evaluate(() => { try { localStorage.removeItem("zc_kmix_hint"); } catch (e) {} KMIX.hide = null; });
    await mock(page, st);
  });
  test.afterAll(async () => {
    await page.unroute(/\/api\/tasks\/[^/?]+\/scoring(\?.*)?$/).catch(() => {}); await page.unroute("**/api/tasks/*/scoring/calculate").catch(() => {});
    await page.evaluate(async o => {
      if (UI_LANG !== "en") setLanguage("en"); closeDrawer(); try { localStorage.removeItem("zc_kmix_hint"); } catch (e) {}
      if (o.taskId) await apiFetch("DELETE", "/api/tasks/" + o.taskId).catch(() => {});
      const cur = await apiFetch("GET", "/api/scoring/settings"); await apiFetch("PUT", "/api/scoring/settings", { settings: o.original, configVersion: cur.settings.configVersion });
      if (o.prefs.scoringPanelOpen === undefined) delete myPrefs().scoringPanelOpen; else myPrefs().scoringPanelOpen = o.prefs.scoringPanelOpen; await saveMyPrefs();
    }, { original, taskId, prefs });
    expect((await page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings))).enabled).toBe(false);
    expect(await page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(() => "still there", () => "gone"), taskId), "the task made here is gone").toBe("gone");
    await ctx.close();
    expect(errors, "no errors in the page").toEqual([]);
  });

  test("Several kinds… from the dropdown: the editor under the Effort line, the counts and the total, saved, and kept after a reload", async () => {
    await openBrief(page, taskId);
    await expect(trig(page)).toHaveText("Auto · reels or short video");
    /* the menu's last option, after a line */
    await trig(page).click();
    await expect(pop(page).locator("[role=option]").last()).toHaveAttribute("data-v", ":mix");
    await expect(option(page, ":mix")).toHaveText("Several kinds…"); await expect(option(page, ":mix")).toHaveAttribute("aria-selected", "false");
    await option(page, ":mix").click();
    await expect(pop(page)).toBeHidden();
    /* inline, under the Effort line; the title's kinds, each once — and that is a mix, so it is saved */
    await expect(ed(page)).toBeVisible(); await expect(ed(page, "panel")).toHaveCount(0);
    await expect(ed(page)).toHaveAttribute("role", "group"); await expect(ed(page).locator(".scr-kmix-head b")).toHaveText("Several kinds of work");
    await expect(ed(page).locator(".scr-kmix-row")).toHaveCount(3);
    expect(await ed(page).locator(".scr-kmix-row").evaluateAll(r => r.map(x => x.getAttribute("data-k")))).toEqual(["reels", "video", "kv"]);
    await expect(count(page, 0)).toBeFocused();
    await expect.poll(() => kindsOf(page, taskId)).toEqual([{ k: "reels", n: 1 }, { k: "video", n: 1 }, { k: "kv", n: 1 }]);
    await expect(trig(page)).toHaveText("Mixed · 3 kinds");
    await expect(trig(page)).toHaveAttribute("title", "reels or short video 1 · video 1 · key visual 1");
    await expect(trig(page)).toHaveAttribute("data-mix", "3");
    await expect(hint(page), "the editor in its place").toHaveCount(0);
    /* each row: the same dropdown, without Auto and without the kinds already in the mix */
    await row(page, 1).locator(".scr-kdd").click();
    const offered = await pop(page).locator("[role=option]").evaluateAll(r => r.map(x => x.getAttribute("data-v")));
    expect(offered).toContain("video"); expect(offered).not.toContain("reels"); expect(offered).not.toContain("kv"); expect(offered).not.toContain(""); expect(offered).not.toContain(":mix");
    await page.keyboard.press("Escape"); await expect(pop(page)).toBeHidden(); await expect(ed(page), "Esc in the menu closes only the menu").toBeVisible();
    await expect(row(page, 1).locator(".scr-kdd")).toBeFocused();

    /* the stepper: + three times, the total following, one save after the clicks */
    const tot = await page.evaluate(() => { const s = scoringSettings().hours, f = (k, n) => { const x = ScoringEngine.hours(s, { kind: k, units: n }).factors; return x.perUnit * x.unitsFactor; }; return f("reels", 4) + f("video", 1) + f("kv", 1); });
    for (let i = 0; i < 3; i++) await row(page, 0).locator('[data-kmix-key="0:inc"]').click();
    await expect(count(page, 0)).toHaveValue("4"); await expect(count(page, 0)).toHaveAttribute("aria-valuenow", "4");
    const half = h => String(Math.max(0.5, Math.round(h * 2) / 2));
    await expect(total(page)).toHaveText("≈ " + half(tot) + " h · reels or short video 4× 17 h + video 8 h + key visual 6 h");
    await expect.poll(() => kindsOf(page, taskId)).toEqual([{ k: "reels", n: 4 }, { k: "video", n: 1 }, { k: "kv", n: 1 }]);
    await snap(page, "kind-mix-editor", ed(page));
    /* − is off at 1 */
    await expect(row(page, 1).locator('[data-kmix-key="1:dec"]')).toBeDisabled();
    /* the keyboard: ↑ ↓ PageUp PageDown Home End; typed; Enter saves now; the field keeps its focus and caret through the save */
    await count(page, 1).focus();
    await page.keyboard.press("ArrowUp"); await expect(count(page, 1)).toHaveValue("2");
    await page.keyboard.press("PageUp"); await expect(count(page, 1)).toHaveValue("12");
    await page.keyboard.press("PageDown"); await page.keyboard.press("ArrowDown"); await expect(count(page, 1)).toHaveValue("1");
    await page.keyboard.press("End"); await expect(count(page, 1)).toHaveValue("500");
    await page.keyboard.press("Home"); await expect(count(page, 1)).toHaveValue("1");
    await count(page, 1).fill(""); await page.keyboard.type("2a");
    await expect(count(page, 1)).toHaveValue("2");
    await page.keyboard.press("Enter");
    await expect.poll(() => kindsOf(page, taskId)).toEqual([{ k: "reels", n: 4 }, { k: "video", n: 2 }, { k: "kv", n: 1 }]);
    await expect(count(page, 1)).toBeFocused();
    await page.keyboard.type("0"); await expect(count(page, 1)).toHaveValue("20");
    await page.waitForTimeout(800);
    await expect(count(page, 1), "still the field being typed in").toBeFocused();
    expect(await count(page, 1).evaluate(e => e.selectionStart)).toBe(2);
    await expect.poll(() => kindsOf(page, taskId)).toEqual([{ k: "reels", n: 4 }, { k: "video", n: 20 }, { k: "kv", n: 1 }]);
    await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace"); await page.keyboard.type("1"); await page.keyboard.press("Enter");
    await expect.poll(() => kindsOf(page, taskId)).toEqual([{ k: "reels", n: 4 }, { k: "video", n: 1 }, { k: "kv", n: 1 }]);
    /* Esc closes it, back on the trigger, and the task stays open */
    await page.keyboard.press("Escape");
    await expect(ed(page)).toHaveCount(0); await expect(trig(page)).toBeFocused(); await expect(page.locator("#drawer")).toHaveClass(/\bopen\b/);
    /* kept after a reload */
    await page.reload(); await ready(page); await openBrief(page, taskId);
    await expect(trig(page)).toHaveText("Mixed · 3 kinds"); await expect(trig(page)).toHaveAttribute("title", "reels or short video 4 · video 1 · key visual 1");
    await trig(page).click();
    await expect(option(page, ":mix")).toHaveAttribute("aria-selected", "true"); await expect(option(page, ":mix")).toHaveText("Several kinds…3 kinds");
    await expect(option(page, "")).toHaveAttribute("aria-selected", "false");
    await page.keyboard.press("Escape");
  });

  test("the Smart Scoring panel: the same trigger, its own editor under the hours row, the deliverables by kind, and the rating form with the mix", async () => {
    await openBrief(page, taskId);
    await expect(panelTrig(page)).toHaveText("Mixed · 3 kinds");
    await expect(page.locator('#drawer .scr-row[data-scr-module="hours"] [data-scr-in="mix"]')).toHaveText(/^Deliverables by kind: reels or short video 4 \(\d+(\.5)? h\), video 1 \(\d+(\.5)? h\), key visual 1 \(\d+(\.5)? h\)$/);
    await panelTrig(page).click(); await option(page, ":mix").click();
    await expect(ed(page, "panel")).toBeVisible(); await expect(ed(page, "effort")).toHaveCount(0);
    await expect(ed(page, "panel").locator(".scr-kmix-row")).toHaveCount(3);
    await expect(count(page, 0, "panel")).toHaveValue("4");
    await snap(page, "kind-mix-panel", ed(page, "panel"));
    /* Done: back on the panel's trigger */
    await ed(page, "panel").locator('[data-kmix-key="done"]').click();
    await expect(ed(page, "panel")).toHaveCount(0); await expect(panelTrig(page)).toBeFocused();
    /* Calculate: the mix, not a kind to pick that would replace it, and what happens */
    await page.locator('#drawer .scr-row[data-scr-module="hours"] [data-scr-act="calculate"]').click();
    await expect(page.locator("#modal #scrKind")).toHaveCount(0);
    await expect(page.locator("#modal #scrKindMix")).toHaveText("Mixedreels or short video 4 · video 1 · key visual 1");
    await expect(page.locator("#modal [data-scr-mix] .hint")).toContainText("Calculated with this task's mix: each kind's hours added up, then complexity and open dependencies once. One kind is not chosen here, so the mix stays as it is.");
    await expect(page.locator('#modal [data-scr-in="deliverables"]')).toHaveText(/^Deliverables by kind: reels or short video 4/);
    const preview = await page.evaluate(() => { const s = scoringSettings().hours, f = (k, n) => { const x = ScoringEngine.hours(s, { kind: k, units: n }).factors; return x.perUnit * x.unitsFactor; }; return ScoringEngine.round2(f("reels", 4) + f("video", 1) + f("kv", 1)); });
    await expect(page.locator("#modal [data-scr-preview]")).toHaveText(String(Math.max(0.5, Math.round(preview * 2) / 2)) + " h");
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "kind-mix-calculate.png") });
    await page.locator('#modal .scr-rate[data-scr-factor="complexity"] .seg button', { hasText: "4" }).click();
    await page.locator("#modal #scrGo").click();
    await expect(page.locator("#modalWrap")).not.toHaveClass(/\bopen\b/);
    expect(st.calcs.pop(), "no single kind sent beside the mix").toEqual({ module: "hours", inputs: { complexity: 4 } });
    /* "Change the mix" from the form: the panel's editor */
    await page.locator('#drawer .scr-row[data-scr-module="hours"] [data-scr-act="calculate"]').click();
    await page.locator('#modal [data-scr-act="mix-edit"]').click();
    await expect(page.locator("#modalWrap")).not.toHaveClass(/\bopen\b/);
    await expect(ed(page, "panel")).toBeVisible(); await expect(count(page, 0, "panel")).toBeFocused();
    await page.keyboard.press("Escape"); await expect(ed(page, "panel")).toHaveCount(0);
  });

  test("back to one kind: × down to one kind, nothing saved under 2, Use one kind; and one kind chosen in the dropdown ends the mix", async () => {
    await openBrief(page, taskId);
    await trig(page).click(); await option(page, ":mix").click();
    await expect(ed(page).locator(".scr-kmix-row")).toHaveCount(3);
    await row(page, 2).locator('[data-kmix-key="2:x"]').click();
    await expect(ed(page).locator(".scr-kmix-row")).toHaveCount(2); await expect(row(page, 1).locator('[data-kmix-key="1:x"]')).toBeFocused();
    await expect.poll(() => kindsOf(page, taskId)).toEqual([{ k: "reels", n: 4 }, { k: "video", n: 1 }]);
    await expect(trig(page)).toHaveText("Mixed · 2 kinds");
    await row(page, 1).locator('[data-kmix-key="1:x"]').click();
    await expect(ed(page).locator("[data-kmix-few]")).toHaveText("A mix needs at least 2 kinds; it is saved once it has them. Use one kind: reels or short video");
    await snap(page, "kind-mix-one-left", ed(page));
    await page.waitForTimeout(700);
    expect(await kindsOf(page, taskId), "one kind: nothing saved").toEqual([{ k: "reels", n: 4 }, { k: "video", n: 1 }]);
    /* + Add kind: a row to choose, its menu open */
    await ed(page).locator('[data-kmix-key="add"]').click();
    await expect(pop(page)).toBeVisible(); await option(page, "kv").click();
    await expect.poll(() => kindsOf(page, taskId)).toEqual([{ k: "reels", n: 4 }, { k: "kv", n: 1 }]);
    await expect(ed(page).locator("[data-kmix-few]")).toHaveCount(0);
    await row(page, 1).locator('[data-kmix-key="1:x"]').click();
    await ed(page).locator('[data-kmix-key="one"]').click();
    await expect.poll(() => meta(page, taskId)).toEqual({ kind: "reels", kinds: null });
    await expect(ed(page)).toHaveCount(0); await expect(trig(page)).toHaveText("reels or short video"); await expect(trig(page)).toBeFocused();
    await expect(trig(page)).not.toHaveAttribute("title", /./);
    /* mixed again, then one kind from the dropdown */
    await setMeta(page, taskId, { kinds: [{ k: "video", n: 1 }, { k: "reels", n: 4 }] });
    await expect(trig(page)).toHaveText("Mixed · 2 kinds");
    await trig(page).click(); await option(page, "video").click();
    await expect.poll(() => meta(page, taskId)).toEqual({ kind: "video", kinds: null });
    await expect(trig(page)).toHaveText("video");
    /* Auto as well */
    await setMeta(page, taskId, { kinds: [{ k: "video", n: 1 }, { k: "reels", n: 4 }] });
    await trig(page).click(); await option(page, "").click();
    await expect.poll(() => meta(page, taskId)).toEqual({ kind: null, kinds: null });
    await expect(trig(page)).toHaveText("Auto · reels or short video");
  });

  test("the AI's split: offered when it is not the task's own, Use this split sets it", async () => {
    st.suggestion = sug(me, [{ kind: "video", count: 1 }, { kind: "reels", count: 4 }, { kind: "kv", count: 1 }]);
    await setMeta(page, taskId, { kind: "video" });
    await page.evaluate(i => scrLoad(task(i), true), taskId);
    await openBrief(page, taskId);
    const block = page.locator('#drawer [data-scr-ai="hours"] [data-scr-ai-mix]');
    await expect(block).toHaveText("The AI suggests: video 1 · reels or short video 4 · key visual 1Use this split");
    await snap(page, "kind-mix-ai", block);
    await block.getByRole("button", { name: "Use this split" }).click();
    await expect.poll(() => kindsOf(page, taskId)).toEqual([{ k: "video", n: 1 }, { k: "reels", n: 4 }, { k: "kv", n: 1 }]);
    await expect(page.locator("#toasts .toast").last()).toHaveText("The AI's split is set");
    await expect(block, "the task's own now: nothing to offer").toHaveCount(0);
    await expect(trig(page)).toHaveText("Mixed · 3 kinds");
    /* the rest of the suggestion as it was */
    await expect(page.locator('#drawer [data-scr-ai="hours"] .scr-ai-head')).toContainText("The AI suggests 30 h");
    await expect(page.locator('#drawer [data-scr-ai="hours"] .scr-ai-text')).toHaveText("A full video, four reels and a key visual.");
    st.suggestion = null; await page.evaluate(i => scrLoad(task(i), true), taskId);
  });

  test("the hint when the title names several kinds: Split sets them and opens the editor; dismissed, it stays away for the task", async () => {
    await setMeta(page, taskId, {});
    await openBrief(page, taskId);
    await expect(hint(page)).toHaveText("Looks like several kinds: reels or short video, video, key visual — split?Split");
    await expect(page.locator("#drawer .scr-panel [data-kmix-hint]"), "once, under the Effort line").toHaveCount(0);
    expect(await kindsOf(page, taskId), "never applied by itself").toBeNull();
    await snap(page, "kind-mix-hint", hint(page));
    await hint(page).getByRole("button", { name: "Split" }).click();
    await expect.poll(() => kindsOf(page, taskId)).toEqual([{ k: "reels", n: 1 }, { k: "video", n: 1 }, { k: "kv", n: 1 }]);
    await expect(ed(page)).toBeVisible(); await expect(count(page, 0)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(hint(page), "a mix: no hint").toHaveCount(0);
    /* dismissed: gone, the focus on the trigger, and still gone after a reload */
    await setMeta(page, taskId, {});
    await expect(hint(page)).toBeVisible();
    await hint(page).getByRole("button", { name: "Dismiss" }).click();
    await expect(hint(page)).toHaveCount(0); await expect(trig(page)).toBeFocused();
    expect(await kindsOf(page, taskId)).toBeNull();
    await page.reload(); await ready(page); await openBrief(page, taskId);
    await expect(trig(page)).toHaveText("Auto · reels or short video"); await expect(hint(page)).toHaveCount(0);
    expect(await page.evaluate(i => JSON.parse(localStorage.getItem("zc_kmix_hint"))[i], taskId)).toBe("reels,video,kv");
  });

  test("read-only: the same chip, still, and a plain list; no Use this split", async () => {
    await setMeta(page, taskId, { kinds: [{ k: "reels", n: 4 }, { k: "video", n: 1 }, { k: "kv", n: 1 }] });
    st.suggestion = sug(me, [{ kind: "video", count: 2 }, { kind: "reels", count: 4 }]);
    await page.evaluate(i => scrLoad(task(i), true), taskId);
    await page.evaluate(() => { window.__kmixEdit = canI.editTask; canI.editTask = () => false; renderDrawer(); });
    try {
      await expect(trig(page)).toHaveClass(/\bro\b/); await expect(trig(page)).toHaveText("Mixed · 3 kinds");
      expect(await trig(page).evaluate(e => e.tagName)).toBe("SPAN");
      await expect(trig(page)).toHaveAttribute("title", "reels or short video 4 · video 1 · key visual 1");
      const ro = effort(page).locator("[data-kmix-ro]");
      await expect(ro).toHaveText(/^Several kinds of work:reels or short video 4video 1key visual 1≈ \d+(\.5)? h$/);
      await expect(effort(page).locator("[data-kmix-slot] button, [data-kmix-slot] input")).toHaveCount(0);
      await expect(page.locator("#drawer .scr-panel [data-kmix-ro]"), "once").toHaveCount(0);
      await expect(page.locator('#drawer [data-scr-ai="hours"] [data-scr-ai-mix]')).toHaveText("The AI suggests: video 2 · reels or short video 4");
      await expect(page.locator('#drawer [data-scr-act="ai-mix"]')).toHaveCount(0);
      await snap(page, "kind-mix-readonly", ro);
    } finally { await page.evaluate(() => { canI.editTask = window.__kmixEdit; delete window.__kmixEdit; renderDrawer(); }); }
    st.suggestion = null; await page.evaluate(i => scrLoad(task(i), true), taskId);
  });

  test("390 px with nothing sideways, Indonesian, light and dark", async () => {
    await setMeta(page, taskId, { kinds: [{ k: "reels", n: 4 }, { k: "video", n: 1 }, { k: "kv", n: 1 }] });
    await openBrief(page, taskId);
    await trig(page).click(); await option(page, ":mix").click();
    await expect(ed(page)).toBeVisible();
    const look = await page.evaluate(() => { const g = e => getComputedStyle(e), box = document.querySelector("#drawer .scr-kmix"), i = document.createElement("i"); i.style.background = "var(--color-surface)"; document.body.appendChild(i); const s = g(i).backgroundColor; i.remove();
      return { bg: g(box).backgroundColor, surface: s, step: g(box.querySelector(".scr-kmix-step")).height, trig: g(box.querySelector(".scr-kdd")).height }; });
    expect(look.bg).toBe(look.surface); expect(look.step).toBe(look.trig);
    await snap(page, "kind-mix-light", ed(page));
    /* Indonesian */
    await page.evaluate(() => setLanguage("id"));
    await expect(trig(page)).toHaveText("Campuran · 3 jenis");
    await expect(ed(page).locator(".scr-kmix-head b")).toHaveText("Beberapa jenis pekerjaan");
    await expect(ed(page).locator('[data-kmix-key="add"]')).toHaveText("Tambah jenis");
    await expect(ed(page).locator('[data-kmix-key="done"]')).toHaveText("Selesai");
    await expect(total(page)).toHaveText(/^≈ \d+(\.5)? j · reels atau video pendek 4× 17 j \+ video 8 j \+ key visual 6 j$/);
    await expect(count(page, 0)).toHaveAttribute("aria-label", "Berapa banyak: reels atau video pendek");
    await expect(row(page, 0).locator('[data-kmix-key="0:x"]')).toHaveAttribute("aria-label", "Hapus reels atau video pendek");
    await expect(panelTrig(page)).toHaveText("Campuran · 3 jenis");
    await snap(page, "kind-mix-id", ed(page));
    await trig(page).click(); await expect(option(page, ":mix")).toHaveText("Beberapa jenis…3 jenis"); await page.keyboard.press("Escape");
    await row(page, 2).locator('[data-kmix-key="2:x"]').click(); await row(page, 1).locator('[data-kmix-key="1:x"]').click();
    await expect(ed(page).locator("[data-kmix-few]")).toHaveText("Campuran butuh paling sedikit 2 jenis; disimpan setelah ada 2. Pakai satu jenis: reels atau video pendek");
    await page.keyboard.press("Escape");
    await setMeta(page, taskId, {});
    await page.evaluate(() => { try { localStorage.removeItem("zc_kmix_hint"); } catch (e) {} KMIX.hide = null; renderDrawer(); });
    await expect(hint(page)).toHaveText("Sepertinya beberapa jenis: reels atau video pendek, video, key visual — bagi?Bagi");
    await page.evaluate(() => setLanguage("en"));
    /* dark */
    await setMeta(page, taskId, { kinds: [{ k: "reels", n: 4 }, { k: "video", n: 1 }, { k: "kv", n: 1 }] });
    await page.evaluate(() => setAppearance("dark"));
    try {
      await openBrief(page, taskId); await trig(page).click(); await option(page, ":mix").click();
      const dark = await page.evaluate(() => { const g = e => getComputedStyle(e), box = document.querySelector("#drawer .scr-kmix"), d = document.getElementById("drawer");
        const lum = s => { const c = s.match(/[\d.]+/g).map(Number).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
        const a = lum(g(box.querySelector(".scr-kmix-head b")).color), b = lum(g(box).backgroundColor);
        return { theme: document.documentElement.getAttribute("data-theme"), box: g(box).backgroundColor, drawer: g(d).backgroundColor, contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }; });
      expect(dark.theme).toBe("dark"); expect(dark.box).toBe(dark.drawer); expect(dark.contrast).toBeGreaterThan(7);
      await snap(page, "kind-mix-dark", ed(page));
    } finally { await page.evaluate(m => setAppearance(m), appearance); }
    /* a phone: the editor fits, nothing scrolls sideways */
    await page.setViewportSize({ width: 390, height: 844 });
    try {
      await openBrief(page, taskId);
      if (!(await ed(page).count())) { await trig(page).scrollIntoViewIfNeeded(); await trig(page).click(); await option(page, ":mix").click(); }
      await expect(ed(page)).toBeVisible(); await ed(page).scrollIntoViewIfNeeded();
      expect(await noSideways(page)).toBe(true);
      const fit = await page.evaluate(() => { const box = document.querySelector("#drawer .scr-kmix").getBoundingClientRect(); return [...document.querySelectorAll("#drawer .scr-kmix-row")].every(r => { const b = r.getBoundingClientRect(); return b.left >= box.left - 1 && b.right <= box.right + 1; }) && box.right <= window.innerWidth; });
      expect(fit, "every row inside the editor, the editor inside the screen").toBe(true);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "kind-mix-phone.png") });
      await page.evaluate(() => setAppearance("dark"));
      if (SHOTS) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, "kind-mix-phone-dark.png") }); }
      await page.evaluate(m => setAppearance(m), appearance);
      /* the hint at phone width too */
      await page.keyboard.press("Escape").catch(() => {});
      await setMeta(page, taskId, {}); await page.evaluate(() => { try { localStorage.removeItem("zc_kmix_hint"); } catch (e) {} KMIX.hide = null; renderDrawer(); });
      await expect(hint(page)).toBeVisible(); expect(await noSideways(page)).toBe(true);
    } finally { await page.setViewportSize({ width: 1366, height: 900 }); }
    await expect.poll(() => page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => ((d.people[ME] || {}).prefs || {}).appearance || (d.ws.theme || {}).appearance || "light")), "the look is as it was").toBe(appearance);
  });
});

test("the offline demo: the mix is set in the page and Calculate works it out with it", async ({ page }) => {
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(require("url").pathToFileURL(path.join(__dirname, "..", "dist", "creative-os-standalone.html")).href);
  await expect(page.locator(".demo-user-card").first()).toBeVisible({ timeout: 10000 });
  await page.evaluate(() => demoLogin(Object.keys(PEOPLE).find(k => PEOPLE[k].perm === "admin")));
  await page.waitForFunction(() => !API.on && !document.body.classList.contains("auth") && typeof ME === "string" && !!PEOPLE[ME]);
  await page.waitForTimeout(600);
  await page.evaluate(() => { closeModal(); if (typeof wqClose === "function") try { wqClose(); } catch (e) {} });
  const id = await page.evaluate(t => { WS.scoring = ScoringSettings.normalizeSettings({ enabled: true }); myPrefs().scoringPanelOpen = true;
    const tk = TASKS.find(x => !x._draft && canI.editTask(x) && !isClosed(x)) || TASKS[0]; tk.title = t; tk.assetCount = 0; const m = taskMeta(tk); delete m.kind; delete m.kinds;
    try { localStorage.removeItem("zc_kmix_hint"); } catch (e) {} KMIX.hide = null; openTask(tk.id); S.drawerTab = "brief"; renderDrawer(); return tk.id; }, TITLE);
  await hint(page).getByRole("button", { name: "Split" }).click();
  await expect(ed(page)).toBeVisible();
  await row(page, 0).locator('[data-kmix-key="0:inc"]').click(); await row(page, 0).locator('[data-kmix-key="0:inc"]').click(); await row(page, 0).locator('[data-kmix-key="0:inc"]').click();
  await expect.poll(() => page.evaluate(i => JSON.stringify(task(i).meta.kinds), id)).toBe(JSON.stringify([{ k: "reels", n: 4 }, { k: "video", n: 1 }, { k: "kv", n: 1 }]));
  await page.keyboard.press("Escape"); await expect(ed(page)).toHaveCount(0);
  await expect(trig(page)).toHaveText("Mixed · 3 kinds"); await expect(panelTrig(page)).toHaveText("Mixed · 3 kinds");
  /* the page's own answer to Calculate: the mix's hours */
  await page.locator('#drawer .scr-row[data-scr-module="hours"] [data-scr-act="calculate"]').click();
  await expect(page.locator("#modal #scrKindMix")).toHaveText("Mixedreels or short video 4 · video 1 · key visual 1");
  await page.locator("#modal #scrGo").click();
  const want = await page.evaluate(() => { const s = scoringSettings().hours, f = (k, n) => { const x = ScoringEngine.hours(s, { kind: k, units: n }).factors; return x.perUnit * x.unitsFactor; }; return ScoringEngine.round2(f("reels", 4) + f("video", 1) + f("kv", 1)); });
  await expect.poll(() => page.evaluate(i => SCR.cache[i] && SCR.cache[i].rows.hours && SCR.cache[i].rows.hours.mathValue, id)).toBe(want);
  await expect(page.locator('#drawer .scr-row[data-scr-module="hours"] [data-scr-v="math"] b')).toHaveText(String(Math.max(0.5, Math.round(want * 2) / 2)) + " h");
  await expect(page.locator('#drawer .scr-row[data-scr-module="hours"] [data-scr-in="mix"]')).toHaveText("Deliverables by kind: reels or short video 4 (17 h), video 1 (8 h), key visual 1 (6 h)");
  expect(errors, "no errors in the page").toEqual([]);
});
