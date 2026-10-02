/* Each person's assets produced are visible: beside their hours on the Team page and in a team's
   members, and as a figure on their profile — this month, with the all-time total under it. The
   counting is the reports' (whoever uploaded the versions), tested in tests/person-assets.test.js. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
let taskId = null;

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
  await page.reload(); await ready(page);
  expect(await page.evaluate(id => isSuccessfulTask(task(id)) && teamDoneThisMonth(task(id)), taskId)).toBe(true);
});

test("the Team page shows each person's assets beside their hours", async ({ page }) => {
  await signIn(page);
  const mine = await page.evaluate(() => memberAssets(ME));
  expect(mine.month).toBeGreaterThanOrEqual(5);
  await page.evaluate(() => go("teams"));
  const row = page.locator(".wl.click", { has: page.locator(".n", { hasText: "(you)" }) }).first();
  await expect(row.locator(".wl-assets")).toHaveText(String(mine.month));
  await expect(row.locator(".wl-assets")).toHaveAttribute("title", "Assets produced this month · " + mine.total + " in total");
});

test("my profile has it as a figure, and it speaks Indonesian", async ({ page }) => {
  await signIn(page);
  const mine = await page.evaluate(() => memberAssets(ME));
  await page.evaluate(() => go("team", ME));
  const fig = page.locator(".kpi", { has: page.locator(".k", { hasText: "Assets produced" }) });
  await expect(fig.locator(".v")).toHaveText(String(mine.month));
  await expect(fig.locator(".d")).toHaveText("this month · " + mine.total + " in total");
  await page.evaluate(() => { UI_LANG = "id"; renderScreen(false); });
  const figId = page.locator(".kpi", { has: page.locator(".k", { hasText: "Aset yang dihasilkan" }) });
  await expect(figId.locator(".d")).toHaveText("bulan ini · " + mine.total + " total");
  await page.evaluate(() => { UI_LANG = "en"; renderScreen(false); });
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try { await signIn(page); if (taskId) await page.evaluate(id => apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}), taskId); } catch {} finally { await page.close(); }
});
