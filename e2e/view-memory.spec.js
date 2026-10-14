/* The last view is kept (Oct 2026): a reload, or ZenCrevia opened again, went back to the defaults — Tasks to
   "Mine" after "All", the calendar to a month after a week. Now each screen opens the way it was last looked at, on
   this device; a link that names a view still wins; filters last for the tab; Settings still opens on My profile. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

test("each screen opens the way it was last looked at", async ({ page, context }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  const state = p => p.evaluate(() => ({ taskScope: S.taskScope, taskView: S.taskView, calMode: S.calMode, calScope: S.calScope, projView: S.projView, teamView: S.teamView, notif: NOTIF_FILTER, prio: S.filters.prio, settingsTab: S.settingsTab, sort: S.sort }));
  /* the way things were last looked at */
  await page.evaluate(() => { S.taskScope = "all"; S.sort = "due"; S.filters.prio = "high"; go("tasks", "list"); });
  await page.evaluate(() => { go("calendar"); setCalMode("week"); S.calScope = "mine"; renderScreen(false); });
  await page.evaluate(() => { S.projView = "archived"; go("projects"); });
  await page.evaluate(() => { S.teamView = "timeline"; S.settingsTab = "members"; go("home"); });
  await page.evaluate(() => { NOTIF_FILTER = "unread"; if (typeof renderNotifs === "function") renderNotifs(); renderScreen(false); });
  /* ZenCrevia opened again, at its front page */
  await page.goto("/"); await ready(page);
  expect(await state(page)).toMatchObject({ taskScope: "all", taskView: "list", calMode: "week", calScope: "mine", projView: "archived", teamView: "timeline", notif: "unread", sort: "due", prio: "high" });
  /* from the menu: Tasks opens on All, the list; the calendar on the week */
  await page.evaluate(() => go("tasks"));
  await expect(page).toHaveURL(/\/tasks\/list$/);
  await page.evaluate(() => go("calendar"));
  await expect(page).toHaveURL(/\/calendar\/week$/);
  /* Settings still opens on My profile, as it was asked to */
  expect((await state(page)).settingsTab).toBe("profile");
  /* a link that names a view wins */
  await page.goto("/calendar/month"); await ready(page);
  expect((await state(page)).calMode).toBe("month");
  /* filters last for the tab: a new tab starts without them, keeping the rest */
  const other = await context.newPage();
  await other.goto("/tasks"); await ready(other);
  expect(await state(other)).toMatchObject({ taskScope: "all", prio: "" });
  await other.close();
  /* a stored value that makes no sense is not used */
  await page.evaluate(() => { const k = viewMemoryKey(); const o = JSON.parse(localStorage.getItem(k)); o.taskScope = "everyone"; o.calMode = 42; localStorage.setItem(k, JSON.stringify(o)); });
  await page.goto("/"); await ready(page);
  const s = await state(page);
  expect(s.taskScope).toBe("mine");
  expect(s.calMode).toBe("month");
});
