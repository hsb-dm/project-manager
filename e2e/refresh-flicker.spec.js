/* Refreshing on any screen must paint that screen once. It used to paint Home first — a whole
   dashboard — and replace it a moment later, which read as a flicker on every reload. */
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
/* Record every write to the content area across a reload, with what it drew. */
async function watchWrites(page) {
  await page.addInitScript(() => {
    window.__w = [];
    document.addEventListener("DOMContentLoaded", () => {
      const c = document.getElementById("content");
      if (!c) return;
      const d = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
      Object.defineProperty(c, "innerHTML", {
        configurable: true,
        get() { return d.get.call(this); },
        set(v) { window.__w.push(String(v).slice(0, 200)); d.set.call(this, v); }
      });
    });
  });
}
const writes = page => page.evaluate(() => window.__w || []);

/* Analytics paints twice on purpose — a loading skeleton, then the charts. That is progressive
   rendering, not the wrong screen. What must never happen anywhere is a paint of Home. */
for (const [path, marker, paints] of [["/calendar", "calendar-pagehead", 1], ["/tasks", "task-pagehead", 1], ["/projects", "Projects</h1>", 1], ["/analytics", "Analytics</h1>", 2]]) {
  test(`refreshing ${path} paints it once, never Home first`, async ({ page }) => {
    await signIn(page);
    await page.goto(path); await ready(page);
    await watchWrites(page);
    await page.reload(); await ready(page);
    await page.waitForTimeout(900);

    const w = await writes(page);
    expect(w.length, "extra paint: " + JSON.stringify(w.map(x => x.slice(0, 40)))).toBeLessThanOrEqual(paints);
    expect(w[w.length - 1]).toContain(marker);
    /* the greeting belongs to Home alone — "m-head" would not do, several pageheads share it */
    expect(w.join("")).not.toMatch(/Good (morning|afternoon|evening)/);
  });
}

test("Home itself still renders on refresh", async ({ page }) => {
  await signIn(page);
  await page.goto("/"); await ready(page);
  await watchWrites(page);
  await page.reload(); await ready(page);
  await page.waitForTimeout(900);
  const w = await writes(page);
  expect(w.length).toBe(1);
  expect(w[0]).toMatch(/Good (morning|afternoon|evening)/);
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
});

test("a deep link to a task still opens it, and paints once", async ({ page }) => {
  await signIn(page);
  const id = await page.evaluate(() => (TASKS.find(t => !t._draft) || {}).id || "");
  test.skip(!id, "no task in this workspace");
  await page.goto("/tasks?task=" + id); await ready(page);
  await watchWrites(page);
  await page.reload(); await ready(page);
  await page.waitForTimeout(900);
  expect((await writes(page)).length).toBe(1);
  await expect.poll(() => page.evaluate(() => S.drawerTask || "")).toBe(id);
});

test("the content area is never left blank if a route draws nothing", async ({ page }) => {
  await signIn(page);
  /* the safety net: with the route neutered, Home must still appear rather than an empty page */
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const t = setInterval(() => { if (typeof routeApply === "function") { window.routeApply = () => {}; clearInterval(t); } }, 5);
      setTimeout(() => clearInterval(t), 4000);
    });
  });
  await page.goto("/calendar");
  await ready(page);
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => document.getElementById("content").innerHTML.trim().length)).toBeGreaterThan(0);
});

/* ---- the calendar header, which used to spend a whole row on two icons ---- */

test("the calendar filter and saved-views controls share the month row", async ({ page }) => {
  await signIn(page);
  await page.goto("/calendar"); await ready(page);
  /* one toolbar, not two: the filter band above the month row is gone */
  expect(await page.evaluate(() => document.querySelectorAll("#content .toolbar").length)).toBe(1);
  const bar = page.locator(".calendar-toolbar");
  await expect(bar.locator('[data-tour="task-filters"]')).toBeVisible();
  await expect(bar.locator('[aria-label="Views"]')).toBeVisible();
  /* and they really are on the same line as the month title */
  const tops = await page.evaluate(() => {
    const y = s => Math.round(document.querySelector(s).getBoundingClientRect().top);
    return { filter: y('.calendar-toolbar [data-tour="task-filters"]'), title: y(".cal-nav h2"), views: y('.calendar-toolbar [aria-label="Views"]') };
  });
  expect(Math.abs(tops.filter - tops.title)).toBeLessThan(24);
  expect(Math.abs(tops.views - tops.title)).toBeLessThan(24);
});

test("an active filter shows its chip on that same row", async ({ page }) => {
  await signIn(page);
  await page.goto("/calendar"); await ready(page);
  await page.evaluate(() => setFilter("prio", "high"));
  await expect(page.locator(".calendar-toolbar .fchip")).toContainText("High");
  expect(await page.evaluate(() => document.querySelectorAll("#content .toolbar").length)).toBe(1);
  await page.evaluate(() => clearFilters());
});

test("the tasks screen in calendar view keeps its scope toggle, still on one row", async ({ page }) => {
  await signIn(page);
  await page.goto("/tasks"); await ready(page);
  await page.evaluate(() => { S.taskView = "calendar"; renderScreen(false); });
  /* two segments live here now — the scope one on the left, Month/Week/Day on the right */
  await expect(page.locator(".cal-nav .seg")).toContainText("Mine");
  expect(await page.evaluate(() => document.querySelectorAll("#content .toolbar").length)).toBe(1);
  await page.evaluate(() => { S.taskView = "list"; renderScreen(false); });
});

test("on a phone the calendar keeps its own compact bar and hides the desktop one", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 820 });
  await signIn(page);
  await page.goto("/calendar"); await ready(page);
  await page.waitForTimeout(400);
  /* the desktop row carries a mobile rule that force-shows any .toolbar marked as the tour target,
     so the tour attribute must sit on the button inside it, never on the row */
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".calendar-toolbar")).display)).toBe("none");
  await expect(page.locator(".calendar-mobile-controls")).toBeVisible();
  const h = await page.evaluate(() => Math.round(document.querySelector(".calendar-mobile-controls").getBoundingClientRect().height));
  expect(h).toBeLessThan(110);
});
