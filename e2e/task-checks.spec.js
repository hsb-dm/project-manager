/* Personal checks kept on the server (Oct 2026): the tick on a task ("Mark as checked", the "N checked" chip, Clear
   checks) follows the person to their other tab and their other device without a reload, painted in place (the row,
   the chip's count, nothing else drawn again); a hidden tab catches up when it is shown; the ticks a browser kept
   before (localStorage) are moved up once and merged with the server's, never written over, and kept until the server
   has them; with no server (the standalone file) the tick lives in the browser as it always did. The server side:
   tests/task-checks.test.js. Everything made here is removed after: the tasks, the project and the checks. */
const { test, expect } = require("@playwright/test");
const path = require("path");
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
/* a page of the same browser (the session is shared): signed in already */
async function sameBrowser(context) { const p = await context.newPage(); await p.goto("/"); await ready(p); return p; }
const TAG = "tck" + Date.now().toString(36);
let M = null;
const tick = (page, id) => page.locator(`#content .tcheck[data-check="${id}"]`).first();
const chip = page => page.locator("#content .tcheck-chip");
const server = page => page.evaluate(() => apiFetch("GET", "/api/task-checks").then(r => r.ids.slice().sort()));
/* the project's tasks in the List, nothing else on it */
const openList = (page, pid) => page.evaluate(pid => { closeDrawer(); S.taskScope = "all"; S.taskView = "list"; S.filters = Object.assign(emptyTaskFilters(), { proj: pid }); go("tasks"); }, pid);
/* counts the ticks this page paints and marks the rows drawn now, so a row drawn again is seen */
const watch = (page, ids) => page.evaluate(ids => {
  if (!window.__paints) { window.__paints = {}; const base = paintTaskCheck; paintTaskCheck = function (id) { window.__paints[id] = (window.__paints[id] || 0) + 1; return base.apply(this, arguments); }; }
  window.__paints = {}; ids.forEach(id => { const r = document.querySelector('#content tr[data-id="' + id + '"]'); if (r) r.__kept = true; });
  const c = document.querySelector("#content .tcheck-chip"); if (c) c.__kept = true;
}, ids);
const paints = page => page.evaluate(() => window.__paints);
const kept = (page, ids) => page.evaluate(ids => ids.every(id => { const r = document.querySelector('#content tr[data-id="' + id + '"]'); return !!(r && r.__kept); }), ids);
const chipKept = page => page.evaluate(() => { const c = document.querySelector("#content .tcheck-chip"); return !!(c && c.__kept); });
/* nothing on its way and nothing waiting: the page has the server's set */
const settled = page => expect.poll(() => page.evaluate(() => !!(TCHK.key && !TCHK.busy && !TCHK.load && !TCHK.clear && !Object.keys(TCHK.want).length))).toBe(true);
const clearAll = page => page.evaluate(() => apiFetch("POST", "/api/task-checks", { clear: true }));

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage(); await signIn(page);
  M = await page.evaluate(async tag => {
    const pid = "p" + tag, st = WS.workflow.filter(s => s.kind !== "closed").map(s => s.id), ids = [];
    await apiFetch("POST", "/api/projects", { id: pid, name: "Checks project " + tag, status: "active", owner: ME, startDate: iso(-3), dueDate: iso(20) });
    for (let i = 1; i <= 4; i++) ids.push((await apiFetch("POST", "/api/tasks", { title: "Check task " + i + " " + tag, status: st[0], prio: "medium", assignee: ME, assignees: [ME], proj: pid, dueDate: iso(i) })).id);
    await apiFetch("POST", "/api/task-checks", { clear: true });
    await reloadAll();
    return { pid, ids };
  }, TAG);
  await page.close();
});
test.afterAll(async ({ browser }) => {
  if (!M) return;
  const page = await browser.newPage(); await signIn(page);
  await page.evaluate(async m => {
    clearTaskChecks(); S.filters = emptyTaskFilters(); go("home");
    for (const id of m.ids) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {});
    await apiFetch("DELETE", "/api/projects/" + m.pid).catch(() => {});
    await apiFetch("POST", "/api/task-checks", { clear: true }).catch(() => {});
    try { Object.keys(localStorage).filter(k => /^cos\.taskCheck/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) {}
  }, M);
  await page.close();
});

test("two tabs: a tick, an untick and Clear checks reach the other tab at once, painted in place", async ({ page, context }) => {
  await signIn(page);
  const [a1, a2, a3] = M.ids;
  const other = await sameBrowser(context);
  try {
    await clearAll(page);
    for (const p of [page, other]) { await openList(p, M.pid); await expect(tick(p, a1)).toHaveAttribute("aria-checked", "false"); }
    await settled(page); await settled(other);
    await watch(page, M.ids); await watch(other, M.ids);
    /* ticked here: there at once, with its count */
    await tick(page, a1).click();
    await expect(tick(other, a1)).toHaveAttribute("aria-checked", "true");
    await expect(other.locator(`#content tr[data-id="${a1}"]`)).toHaveClass(/\bchecked\b/);
    await expect(chip(other)).toHaveClass(/\bon\b/);
    await expect(chip(other)).toContainText("1 checked");
    expect(await server(page)).toEqual([a1]);
    await page.waitForTimeout(400);   /* the event has reached this tab too, and was answered */
    expect(await paints(page), "the tab that ticked painted its tick once").toEqual({ [a1]: 1 });
    expect(await paints(other), "the other tab painted that tick, once, and nothing else").toEqual({ [a1]: 1 });
    expect(await kept(other, M.ids), "no row of the other tab was drawn again").toBe(true);
    expect(await kept(page, M.ids)).toBe(true);
    /* a second tick: the other tab's chip says 2 in place (the same element: a focused × would keep its focus) */
    await watch(other, M.ids);
    await tick(page, a2).click();
    await expect(chip(other)).toContainText("2 checked");
    await expect(tick(other, a2)).toHaveAttribute("aria-checked", "true");
    expect(await chipKept(other), "the count changed in place").toBe(true);
    /* unticked in the other tab: back here */
    await watch(page, M.ids);
    await tick(other, a1).click();
    await expect(tick(page, a1)).toHaveAttribute("aria-checked", "false");
    await expect(page.locator(`#content tr[data-id="${a1}"]`)).not.toHaveClass(/\bchecked\b/);
    await expect(chip(page)).toContainText("1 checked");
    expect(await kept(page, M.ids)).toBe(true);
    expect(await server(page)).toEqual([a2]);
    /* Clear checks in one tab clears them in the other */
    await tick(other, a3).click();
    await expect(chip(page)).toContainText("2 checked");
    await chip(page).locator("button").click();
    await expect(chip(other)).not.toHaveClass(/\bon\b/);
    for (const id of [a2, a3]) await expect(tick(other, id)).toHaveAttribute("aria-checked", "false");
    expect(await server(page)).toEqual([]);
    /* quick clicks in a row arrive as they were left */
    for (const id of [a1, a2, a3, a2]) await tick(page, id).click();
    await expect.poll(() => server(page)).toEqual([a1, a3].sort());
    await expect(tick(other, a3)).toHaveAttribute("aria-checked", "true");
    await expect(tick(other, a2)).toHaveAttribute("aria-checked", "false");
    await expect(chip(other)).toContainText("2 checked");
    /* the tab that made a change skips its own echo when the per-tab id says so (X-ZC-Tab, src/core.js) */
    const tab = await page.evaluate(() => { if (typeof liveFromThisTab !== "function") { window.ZC_TAB = "tcktab" + Date.now().toString(36); window.liveFromThisTab = ev => !!(ev && ev.tab && window.ZC_TAB && ev.tab === window.ZC_TAB); } return window.ZC_TAB; });
    let echo = 0; const count = r => { if (/\/api\/task-checks$/.test(r.url()) && r.method() === "GET") echo++; }; page.on("request", count);
    await page.evaluate(([id, tab]) => fetch("/api/task-checks", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-ZC-Tab": tab }, body: JSON.stringify({ uncheck: [id] }) }), [a3, tab]);
    await expect(tick(other, a3), "the other tab still hears it").toHaveAttribute("aria-checked", "false");
    await page.waitForTimeout(400);
    expect(echo, "its own echo is not asked for again").toBe(0);
    page.off("request", count);
  } finally {
    await other.close();
    await clearAll(page);
  }
});

test("a second device follows, and a tab that was hidden catches up when it is shown", async ({ page, browser }) => {
  await signIn(page);
  const [a1, a2] = M.ids;
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await phoneCtx.newPage();
  try {
    await clearAll(page);
    await signIn(phone);
    await openList(page, M.pid); await openList(phone, M.pid);
    await expect(tick(phone, a1)).toHaveAttribute("aria-checked", "false");
    await tick(page, a1).click();
    await expect(tick(phone, a1)).toHaveAttribute("aria-checked", "true");
    await expect(chip(phone)).toHaveClass(/\bon\b/);
    await tick(phone, a1).click();
    await expect(tick(page, a1)).toHaveAttribute("aria-checked", "false");
    /* the phone is put away: it asks for nothing, then catches up when it is shown */
    let asked = 0; phone.on("request", r => { if (/\/api\/task-checks$/.test(r.url()) && r.method() === "GET") asked++; });
    await phone.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
    await tick(page, a2).click();
    await expect.poll(() => server(page)).toEqual([a2]);
    await phone.waitForTimeout(600);
    expect(asked, "a hidden tab does not ask").toBe(0);
    await expect(tick(phone, a2)).toHaveAttribute("aria-checked", "false");
    await phone.evaluate(() => { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event("visibilitychange")); });
    await expect(tick(phone, a2)).toHaveAttribute("aria-checked", "true");
    await expect(chip(phone)).toHaveClass(/\bon\b/);
    expect(asked).toBe(1);
    /* the stream dropped and came back: what came meanwhile is asked for once */
    await phone.evaluate(() => { CHAT_RUNTIME.connection.close(); CHAT_RUNTIME.connection = null; });
    await page.evaluate(id => apiFetch("POST", "/api/task-checks", { check: [id] }), a1);
    await phone.waitForTimeout(300);
    await expect(tick(phone, a1)).toHaveAttribute("aria-checked", "false");
    await phone.evaluate(() => msgStream());
    await expect(tick(phone, a1)).toHaveAttribute("aria-checked", "true");
  } finally {
    await phoneCtx.close();
    await clearAll(page);
  }
});

test("the ticks this browser kept before move up once, merged with the server's, and stay until the server has them", async ({ page, browser }) => {
  await signIn(page);
  const [a1, a2, a3, a4] = M.ids;
  const ctx = await browser.newContext(); const laptop = await ctx.newPage();
  try {
    await clearAll(page);
    /* another device has ticked a3 already */
    await page.evaluate(id => apiFetch("POST", "/api/task-checks", { check: [id] }), a3);
    await signIn(laptop);
    /* this browser's old store, as the page before this kept it: two tasks, and one deleted since */
    await laptop.evaluate(ids => { localStorage.setItem("cos.taskChecked." + ME, JSON.stringify(ids)); localStorage.removeItem("cos.taskChecks." + ME); }, [a1, a2, "GONE-1"]);
    await laptop.reload(); await ready(laptop);
    await openList(laptop, M.pid);
    /* drawn at once from the old store, then the server's own */
    await expect(tick(laptop, a1)).toHaveAttribute("aria-checked", "true");
    await expect(tick(laptop, a2)).toHaveAttribute("aria-checked", "true");
    await expect(tick(laptop, a3)).toHaveAttribute("aria-checked", "true");
    await expect(tick(laptop, a4)).toHaveAttribute("aria-checked", "false");
    await expect(chip(laptop)).toContainText("3 checked");
    await expect.poll(() => server(page)).toEqual([a1, a2, a3].sort());
    await expect.poll(() => laptop.evaluate(() => localStorage.getItem("cos.taskChecked." + ME)), "the old store is gone once the server has it").toBe(null);
    expect(JSON.parse(await laptop.evaluate(() => localStorage.getItem("cos.taskChecks." + ME))).sort()).toEqual([a1, a2, a3].sort());
    /* from now on the server is the source: unticked elsewhere, it stays unticked here after a reload */
    await page.evaluate(id => apiFetch("POST", "/api/task-checks", { uncheck: [id] }), a1);
    await laptop.reload(); await ready(laptop); await openList(laptop, M.pid);
    await expect(tick(laptop, a1)).toHaveAttribute("aria-checked", "false");
    await expect(tick(laptop, a2)).toHaveAttribute("aria-checked", "true");
    expect(await server(page)).toEqual([a2, a3].sort());

    /* a first try that fails keeps the old store, and the ticks go up on the next */
    await clearAll(page);
    await laptop.evaluate(ids => localStorage.setItem("cos.taskChecked." + ME, JSON.stringify(ids)), [a4]);
    let fail = true;
    await laptop.route("**/api/task-checks", r => (fail && r.request().method() === "POST") ? r.abort() : r.fallback());
    await laptop.reload(); await ready(laptop); await openList(laptop, M.pid);
    await expect(tick(laptop, a4)).toHaveAttribute("aria-checked", "true");
    await laptop.waitForTimeout(500);
    expect(await laptop.evaluate(() => localStorage.getItem("cos.taskChecked." + ME)), "kept while the server does not have it").toBe(JSON.stringify([a4]));
    await expect(laptop.locator("#toasts .toast.bad"), "no alarm for ticks that are safe where they are").toHaveCount(0);
    /* a tick made here while the server cannot be reached: said once, kept, and sent with the rest */
    await tick(laptop, a1).click();
    await expect(laptop.locator("#toasts .toast.bad")).toHaveText("Your checks aren't saved yet — trying again");
    fail = false;
    await expect.poll(() => server(page), { timeout: 20000 }).toEqual([a1, a4].sort());
    await expect.poll(() => laptop.evaluate(() => localStorage.getItem("cos.taskChecked." + ME))).toBe(null);
    await expect(tick(laptop, a1)).toHaveAttribute("aria-checked", "true");
  } finally {
    await ctx.close();
    await clearAll(page);
  }
});

test("with no server (the standalone file) the tick lives in this browser, as before", async ({ page }) => {
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  let asked = 0; page.on("request", r => { if (/\/api\/task-checks/.test(r.url())) asked++; });
  const open = async () => {
    await page.goto(require("url").pathToFileURL(path.join(__dirname, "..", "dist", "creative-os-standalone.html")).href);
    await expect(page.locator(".demo-user-card").first()).toBeVisible({ timeout: 10000 });
    await page.evaluate(() => demoLogin(Object.keys(PEOPLE).find(k => PEOPLE[k].perm === "admin")));
    await page.waitForFunction(() => !API.on && !document.body.classList.contains("auth") && typeof ME === "string" && !!PEOPLE[ME]);
    await page.evaluate(() => { closeModal(); if (typeof wqClose === "function") try { wqClose(); } catch (e) {} S.taskScope = "all"; S.taskView = "list"; S.filters = emptyTaskFilters(); go("tasks"); });
  };
  await open();
  /* a tick kept for a task deleted since is not counted */
  const id = await page.evaluate(() => { localStorage.setItem("cos.taskChecked." + ME, JSON.stringify(["GONE-1"])); TASK_CHECKED = null; renderScreen(false); return TASKS.find(t => document.querySelector('#content .tcheck[data-check="' + t.id + '"]')).id; });
  await expect(chip(page)).not.toHaveClass(/\bon\b/);
  await tick(page, id).click();
  await expect(tick(page, id)).toHaveAttribute("aria-checked", "true");
  await expect(chip(page)).toContainText("1 checked");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("cos.taskChecked." + ME)))).toEqual(["GONE-1", id]);
  await open();
  await expect(tick(page, id)).toHaveAttribute("aria-checked", "true");
  await expect(chip(page)).toContainText("1 checked");
  await chip(page).locator("button").click();
  await expect(tick(page, id)).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("cos.taskChecked." + ME)))).toEqual([]);
  expect(asked, "nothing asked of a server").toBe(0);
  expect(errors).toEqual([]);
});
