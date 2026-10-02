/* Each person's assets produced are visible: beside their hours on the Team page and in a team's
   members, and as a figure on their profile — the total, with delivered and this month under it. The
   counting is the reports' (whoever uploaded the versions), tested in tests/person-assets.test.js. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
let taskId = null, openId = null;

async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}

test("a delivered task with five assets, its version uploaded by me", async ({ page }) => {
  await signIn(page);
  taskId = await page.evaluate(() => apiFetch("POST", "/api/tasks", { title: "Member assets target", status: WS.workflow[0].id, assignee: ME, reviewer: ME, assetCount: 5, versions: [{ n: 1, state: "pending", color: "#123A6B", note: "" }] }).then(d => d.id));
  const done = await page.evaluate(() => WS.workflow.find(s => s.kind === "closed" && s.id !== "declined").id);
  const moved = await page.evaluate(([id, to]) => apiFetch("POST", "/api/tasks/" + id + "/move", { type: "MOVE_TASK_STATUS", toStatusId: to }).then(() => true, e => e.message), [taskId, done]);
  expect(moved).toBe(true);
  /* and one still in progress, so the total is more than what was delivered */
  openId = await page.evaluate(() => apiFetch("POST", "/api/tasks", { title: "Member assets in progress", status: WS.workflow[0].id, assignee: ME, reviewer: ME, assetCount: 3, versions: [{ n: 1, state: "pending", color: "#123A6B", note: "" }] }).then(d => d.id));
  await page.reload(); await ready(page);
  expect(await page.evaluate(id => isSuccessfulTask(task(id)) && teamDoneThisMonth(task(id)), taskId)).toBe(true);
});

test("the Team page shows each person's assets beside their hours", async ({ page }) => {
  await signIn(page);
  const mine = await page.evaluate(() => memberAssets(ME));
  expect(mine.total).toBeGreaterThanOrEqual(5);
  expect(mine.delivered).toBeGreaterThanOrEqual(5);
  expect(mine.month).toBeGreaterThanOrEqual(5);
  expect(mine.total, "the task in progress counts in the total").toBeGreaterThanOrEqual(mine.delivered + 3);
  await page.evaluate(() => go("teams"));
  const row = page.locator(".wl.click", { has: page.locator(".n", { hasText: "(you)" }) }).first();
  /* the total, not only this month: early in a month that would read 0 for nearly everyone */
  await expect(row.locator(".wl-assets")).toHaveText(String(mine.total) + (mine.attributed ? "*" : ""));
  await expect(row.locator(".wl-assets")).toHaveAttribute("title", "Assets produced: " + mine.total + " · " + mine.delivered + " delivered · " + mine.month + " this month");
});

test("my profile has it as a figure, and it speaks Indonesian", async ({ page }) => {
  await signIn(page);
  const mine = await page.evaluate(() => memberAssets(ME));
  await page.evaluate(() => go("team", ME));
  const fig = page.locator(".kpi", { has: page.locator(".k", { hasText: "Assets produced" }) });
  await expect(fig.locator(".v")).toHaveText(String(mine.total) + (mine.attributed ? " *" : ""));
  await expect(fig.locator(".d")).toHaveText(mine.delivered + " delivered · " + mine.month + " this month");
  await page.evaluate(() => { UI_LANG = "id"; renderScreen(false); });
  const figId = page.locator(".kpi", { has: page.locator(".k", { hasText: "Aset yang dihasilkan" }) });
  await expect(figId.locator(".d")).toHaveText(mine.delivered + " terkirim · " + mine.month + " bulan ini");
  await page.evaluate(() => { UI_LANG = "en"; renderScreen(false); });
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try { await signIn(page); for (const id of [taskId, openId]) if (id) await page.evaluate(i => apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}), id); } catch {} finally { await page.close(); }
});
