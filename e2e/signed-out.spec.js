/* Nothing of a workspace may be reachable without a session.

   The login card used to be the only thing in the way: body.auth hid the navigation, but any
   re-render — clicking the logo, go(), a live update — painted the dashboard straight over it, and
   after a session ended the previous person's work was still in memory to paint. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const PRIVATE = "PRIVATE WORKSPACE ITEM";

async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const seen = page => page.evaluate(() => ({
  text: (document.body.innerText || "").replace(/\s+/g, " "),
  html: document.getElementById("content").innerHTML,
  screen: typeof S !== "undefined" ? S.screen : null
}));

test("a visitor who never signed in gets the login card, whatever they click", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/");
  await page.waitForTimeout(900);

  /* the bundled demo data must not be rendered to a stranger either */
  for (const act of [
    () => page.locator(".brand").click(),
    () => page.evaluate(() => go("tasks")),
    () => page.evaluate(() => go("projects")),
    () => page.evaluate(() => renderScreen(false))
  ]) {
    await act();
    await page.waitForTimeout(250);
    const s = await seen(page);
    expect(s.text, "sign-in form still in front").toContain("Sign in");
    expect(s.html).not.toContain("Good morning");
    expect(await page.evaluate(() => document.body.classList.contains("auth"))).toBe(true);
  }
});

test("when a session ends, the workspace leaves memory and the screen with it", async ({ page }) => {
  await signIn(page);
  await page.evaluate(t => { newTaskModal({ title: t }); createDraft(); }, PRIVATE);
  await expect.poll(() => page.evaluate(t => TASKS.some(x => x.title === t), PRIVATE)).toBe(true);

  /* the session ends — expiry, or a sign-out somewhere else */
  await page.context().clearCookies();
  await page.evaluate(() => apiFetch("GET", "/api/bootstrap").catch(() => {}));
  await page.waitForTimeout(700);

  expect(await page.evaluate(() => TASKS.length), "nothing left in memory").toBe(0);
  expect(await page.evaluate(() => Object.keys(PEOPLE).length)).toBe(0);
  expect(await page.evaluate(() => !!(SESSION && SESSION.user))).toBe(false);

  /* and the next person at the keyboard cannot paint it back */
  await page.locator(".brand").click();
  await page.waitForTimeout(400);
  let s = await seen(page);
  expect(s.text).not.toContain(PRIVATE);
  expect(s.text).not.toContain("Good morning");
  expect(s.text).toContain("Sign in");

  await page.evaluate(() => go("tasks"));
  await page.waitForTimeout(400);
  s = await seen(page);
  expect(s.html).not.toContain(PRIVATE);
  expect(s.screen, "navigation does not move while signed out").not.toBe("tasks");
});

test("creating a task while signed out reaches neither the page nor the server", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/");
  await page.waitForTimeout(800);
  await page.evaluate(() => { try { newTaskModal({ title: "UNAUTH PROBE" }); createDraft(); } catch (e) {} });
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => TASKS.filter(t => t.title === "UNAUTH PROBE").length)).toBe(0);
  const status = await page.evaluate(() => fetch("/api/bootstrap", { credentials: "same-origin" }).then(r => r.status));
  expect(status).toBe(401);
});

test("signing in afterwards still works and brings the workspace back", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(PEOPLE).length)).toBeGreaterThan(0);
  await page.evaluate(() => go("tasks"));
  await expect.poll(() => page.evaluate(() => S.screen)).toBe("tasks");
  /* tidy up the task the second test made */
  await page.evaluate(t => { const x = TASKS.find(y => y.title === t); return x ? apiFetch("DELETE", "/api/tasks/" + x.id).catch(() => {}) : null; }, PRIVATE);
});

test("the standalone demo still lets a demo user in", async ({ page }) => {
  /* API.on is false there, so the bundled data is the product and must survive showLogin */
  await page.context().clearCookies();
  await page.goto("/");
  await page.waitForTimeout(600);
  const kept = await page.evaluate(() => {
    API.on = false;                     /* pretend this page is the standalone build */
    const before = TASKS.length;
    showLogin();
    return { before, after: TASKS.length };
  });
  expect(kept.after, "demo data is not cleared in standalone mode").toBe(kept.before);
});
