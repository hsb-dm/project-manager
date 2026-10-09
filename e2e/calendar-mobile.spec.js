/* On a phone every calendar works like the Calendar screen: the month row's controls (previous,
   next, Today, Month/Week/Day) are there, and tapping a day shows that day's tasks. It used to be the
   Calendar screen only — in Tasks and in a project the controls were hidden and a tap did nothing
   useful. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
let taskId = null, projId = null;

async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
async function tapToday(page) {
  await expect(page.locator(".calendar-mobile-controls")).toBeVisible();
  await page.locator(".cal-grid .cal-day.today .dn").tap();
  await expect(page.locator("#modal .cal-more-list")).toContainText("Phone calendar task");
  await page.evaluate(() => closeModal());
}

test("a task due today, in a project", async ({ page }) => {
  await signIn(page);
  projId = await page.evaluate(() => apiFetch("POST", "/api/projects", { name: "Phone calendar project", status: "active", owner: ME, teams: [] }).then(() => apiFetch("GET", "/api/bootstrap")).then(b => { const p = b.projects.find(x => x.name === "Phone calendar project"); return p && p.id; }));
  expect(projId).toBeTruthy();
  taskId = await page.evaluate(p => apiFetch("POST", "/api/tasks", { title: "Phone calendar task", status: WS.workflow[0].id, assignee: ME, proj: p, dueDate: new Date().toISOString().slice(0, 10), startDate: new Date().toISOString().slice(0, 10) }).then(t => t.id), projId);
  expect(taskId).toBeTruthy();
});

test("the Calendar screen: tap a day, see its tasks", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => { S.calMode = "month"; S.calScope = "all"; go("calendar"); });
  await tapToday(page);
});

test("the calendar view in Tasks does the same", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => { S.calMode = "month"; S.taskScope = "all"; S.taskView = "calendar"; go("tasks"); });
  /* whose tasks has its own switch here (Mine / All, as the list and board have); the Calendar screen's Mine / Team stays its own */
  await expect(page.locator(".cal-mobile-scope-toggle")).toHaveCount(1);
  const calScope = await page.evaluate(() => S.calScope);
  await page.locator(".cal-mobile-scope-toggle").tap();
  expect(await page.evaluate(() => [S.taskScope, S.calScope])).toEqual(["mine", calScope]);
  await page.evaluate(() => { S.taskScope = "all"; renderScreen(); });
  await tapToday(page);
  /* and the month can be changed here too */
  const title = await page.locator(".cal-mobile-date strong").innerText();
  await page.locator(".cal-mobile-date .iconbtn").last().tap();
  await expect(page.locator(".cal-mobile-date strong")).not.toHaveText(title);
});

test("and so does a project's calendar", async ({ page }) => {
  await signIn(page);
  await page.evaluate(id => { S.calMode = "month"; S.projectTab = "calendar"; go("projects", id); }, projId);
  await tapToday(page);
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try { await signIn(page);
    if (taskId) await page.evaluate(id => apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}), taskId);
    if (projId) await page.evaluate(id => apiFetch("DELETE", "/api/projects/" + id).catch(() => {}), projId); } catch {} finally { await page.close(); }
});
