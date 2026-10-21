/* One redraw for what happened (Oct 2026). A save drew the whole page at once and again when the server answered,
   a bulk edit twice per task, a live update once per task fetched, a hidden tab as often as a shown one, and
   Analytics went back to a skeleton after every change. Now each draws once, on the next frame; an answer that
   changes nothing on screen is not drawn; this tab's own save is not fetched again when the server tells every tab
   of it; a hidden tab is drawn once when shown; Analytics keep their numbers while new ones are fetched. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
/* counts the page's redraws: refresh() (everything), renderScreen and renderDrawer */
const count = page => page.evaluate(() => { const C = window.__redraws = { refresh: 0, screen: 0, drawer: 0 };
  [["refresh", "refresh"], ["renderScreen", "screen"], ["renderDrawer", "drawer"]].forEach(([n, k]) => { const f = window[n].__base || window[n]; const w = function () { C[k]++; return f.apply(this, arguments); }; w.__base = f; window[n] = w; }); });
const redraws = page => page.evaluate(() => Object.assign({}, window.__redraws));
const frames = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))));
const make = (page, n, title) => page.evaluate(async o => { const ids = []; for (let i = 0; i < o.n; i++) { const d = await apiFetch("POST", "/api/tasks", { title: o.title + " " + (i + 1), status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME] }); ids.push(d.id); } await reloadAll(); return ids; }, { n, title });
const remove = (page, ids) => page.evaluate(async l => { try { closeDrawer(); } catch (e) {} for (const id of l) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); await reloadAll(); }, ids);
/* the tab hidden or shown, as the page's scripts see it */
const hide = (page, on) => page.evaluate(h => { Object.defineProperty(document, "hidden", { configurable: true, get: () => h }); Object.defineProperty(document, "visibilityState", { configurable: true, get: () => h ? "hidden" : "visible" }); document.dispatchEvent(new Event("visibilitychange")); }, on);

test("a description's autosave draws the page once, and typing goes on through it with the caret where it was", async ({ page }) => {
  await signIn(page);
  const [id] = await make(page, 1, "Autosave once");
  const saved = () => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(t => t.description), id);
  /* the save's answer held back until released, so the typing goes on while it is on its way */
  let release; const gate = new Promise(r => { release = r; }); let held = 0;
  await page.route("**/api/tasks/" + id, async route => { if (route.request().method() !== "PUT" || held++) return route.continue(); const res = await route.fetch(); await gate; await route.fulfill({ response: res }); });
  try {
    await page.evaluate(i => { S.taskScope = "all"; go("tasks", "list"); openTask(i); S.drawerTab = "brief"; S.descMode = "editor"; renderDrawer(); }, id);
    await page.locator("#descSrc").click(); await page.keyboard.press("Control+End");
    await count(page);
    const put = page.waitForRequest(r => r.method() === "PUT" && r.url().endsWith("/api/tasks/" + id));
    await page.keyboard.type("Plan: shoot");
    await put; await frames(page);
    expect((await redraws(page)).refresh, "the save draws the page once, on the next frame").toBe(1);
    await page.keyboard.type(" on Monday");   /* while the save is on its way */
    const answered = page.waitForResponse(r => r.request().method() === "PUT" && r.url().endsWith("/api/tasks/" + id));
    release(); await answered; await frames(page);
    const r = await redraws(page);
    expect(r.refresh, "the server's answer, which changes only the history, does not draw the page again").toBe(1);
    expect(r.screen, "the list behind is drawn once").toBe(1);
    await expect(page.locator("#descSrc")).toBeFocused();
    await page.keyboard.type("!");
    await expect(page.locator("#descSrc")).toHaveText("Plan: shoot on Monday!");
    await expect.poll(saved, { timeout: 8000 }).toBe("Plan: shoot on Monday!");
  } finally {
    await page.unroute("**/api/tasks/" + id);
    await remove(page, [id]);
  }
});

test("a bulk edit of several tasks, and its undo, each draw the page once", async ({ page }) => {
  await signIn(page);
  const ids = await make(page, 8, "Bulk once");
  const prios = () => page.evaluate(l => Promise.all(l.map(i => apiFetch("GET", "/api/tasks/" + i).then(t => t.prio))), ids);
  try {
    await page.evaluate(l => { S.taskScope = "all"; go("tasks", "list"); ENH.bulk = true; ENH.bulkSel = {}; l.forEach(i => { ENH.bulkSel[i] = true; }); renderScreen(false); }, ids);
    await count(page);
    await page.evaluate(() => bulkApply("{n} tasks set to high", t => { t.prio = "high"; }));
    await expect.poll(prios, { timeout: 10000 }).toEqual(ids.map(() => "high"));
    await page.waitForTimeout(300); await frames(page);
    expect((await redraws(page)).refresh, "drawn once for the 8 tasks (it was twice per task)").toBe(1);
    await page.evaluate(() => { window.__redraws.refresh = 0; });
    await page.locator("#toasts .undo-toast button").click();
    await expect.poll(prios, { timeout: 10000 }).toEqual(ids.map(() => "medium"));
    await page.waitForTimeout(300); await frames(page);
    expect((await redraws(page)).refresh, "and once for the undo").toBe(1);
    await expect(page.locator("#content .lcol-tbl tbody tr[data-id]")).toHaveCount(8);
  } finally {
    await page.evaluate(() => { ENH.bulk = false; ENH.bulkSel = {}; });
    await remove(page, ids);
  }
});

test("a colleague's changes are fetched together and drawn once; in a hidden tab, once when it is shown", async ({ browser, page }) => {
  await signIn(page);
  const ids = await make(page, 3, "Live once");
  const colleague = await (await browser.newContext()).newPage();
  await signIn(colleague);
  const rename = suffix => colleague.evaluate(async o => Promise.all(o.ids.map(async (id, i) => { const d = await apiFetch("GET", "/api/tasks/" + id); d.title = "Live once " + (i + 1) + o.s; await apiFetch("PUT", "/api/tasks/" + id, d); })), { ids, s: suffix });
  try {
    await page.evaluate(() => { S.taskScope = "all"; go("tasks", "list"); });
    await count(page);
    await rename(" · seen");
    for (let i = 0; i < 3; i++) await expect(page.locator("#content", { hasText: "Live once " + (i + 1) + " · seen" })).toHaveCount(1, { timeout: 10000 });
    await page.waitForTimeout(400); await frames(page);
    /* one batch of three (two at most, should the server be slow to tell of the third): it was one per task */
    expect((await redraws(page)).refresh, "three tasks changed at once: drawn once").toBeLessThan(3);
    /* hidden: fetched, not drawn */
    await hide(page, true); await page.evaluate(() => { window.__redraws.refresh = 0; });
    await rename(" · while away");
    await expect.poll(() => page.evaluate(l => l.map(i => task(i).title), ids), { timeout: 10000 }).toEqual(ids.map((_, i) => "Live once " + (i + 1) + " · while away"));
    await page.waitForTimeout(400); await frames(page);
    expect((await redraws(page)).refresh, "nothing drawn while the tab is hidden").toBe(0);
    await expect(page.locator("#content", { hasText: "· while away" })).toHaveCount(0);
    await hide(page, false);
    await expect(page.locator("#content", { hasText: "Live once 3 · while away" })).toHaveCount(1, { timeout: 5000 });
    await frames(page);
    expect((await redraws(page)).refresh, "drawn once when shown").toBe(1);
  } finally {
    await hide(page, false);
    await colleague.context().close();
    await remove(page, ids);
  }
});

test("this tab's own save is not fetched again when the server tells every tab of it", async ({ page }) => {
  await signIn(page);
  const [id] = await make(page, 1, "Own echo");
  const gets = []; page.on("request", r => { if (r.method() === "GET" && r.url().endsWith("/api/tasks/" + id)) gets.push(r.url()); });
  /* the answer arrives well after the server has announced the change */
  await page.route("**/api/tasks/" + id, async route => { if (route.request().method() !== "PUT") return route.continue(); const res = await route.fetch(); await new Promise(r => setTimeout(r, 900)); await route.fulfill({ response: res }); });
  try {
    await page.evaluate(() => { S.taskScope = "all"; go("tasks", "list"); });
    await count(page);
    await page.evaluate(i => editTaskWith(task(i), t => { t.title = "Own echo, renamed"; }), id);
    await page.waitForTimeout(1500); await frames(page);
    expect(gets.length, "not fetched again").toBe(0);
    expect((await redraws(page)).refresh, "drawn once: the change, not the echo or the answer").toBe(1);
    await expect(page.locator("#content", { hasText: "Own echo, renamed" })).toHaveCount(1);
  } finally {
    await page.unroute("**/api/tasks/" + id);
    await remove(page, [id]);
  }
});

test("Analytics keep their numbers through a change and put the new ones in their place; Refresh still starts over", async ({ page }) => {
  await signIn(page);
  const [id] = await make(page, 1, "Analytics stay");
  let extra = 0, calls = 0;
  await page.route("**/api/analytics*", async route => { calls++; const res = await route.fetch(); const j = await res.json(); if (extra && Array.isArray(j.created) && j.created.length) j.created[j.created.length - 1] += extra; await route.fulfill({ response: res, json: j }); });
  try {
    await page.evaluate(() => go("analytics"));
    await expect(page.locator("#content .kpis")).toBeVisible();
    const kpiText = () => page.locator("#content .kpis").innerText();
    const before = await kpiText();
    /* a change (what a save or a live update does): the numbers stay, no skeleton, and the new ones replace them */
    await page.evaluate(() => { window.__skel = 0; const mo = new MutationObserver(() => { if (document.querySelector("#content .skel")) window.__skel++; }); mo.observe(document.getElementById("content"), { childList: true, subtree: true }); window.__skelMo = mo; });
    extra = 7; const c0 = calls;
    const at = await page.evaluate(() => { refresh(); return { skel: document.querySelectorAll("#content .skel").length, text: document.querySelector("#content .kpis").innerText }; });
    expect(at.skel, "no skeleton").toBe(0);
    expect(at.text, "the numbers drawn again at once").toBe(before);
    await expect.poll(() => calls, { timeout: 8000 }).toBeGreaterThan(c0);
    await expect.poll(kpiText, { timeout: 8000 }).not.toBe(before);
    expect(await page.evaluate(() => window.__skel), "never a skeleton on the way").toBe(0);
    /* Refresh starts from the skeleton, as before */
    await page.locator("#content .pagehead button", { hasText: "Refresh" }).click();
    await expect.poll(() => page.evaluate(() => window.__skel), { timeout: 5000 }).toBeGreaterThan(0);
    await expect(page.locator("#content .kpis")).toBeVisible();
  } finally {
    await page.evaluate(() => { if (window.__skelMo) window.__skelMo.disconnect(); });
    await page.unroute("**/api/analytics*");
    await remove(page, [id]);
  }
});
