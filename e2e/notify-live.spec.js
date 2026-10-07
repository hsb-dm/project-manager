/* A notification shows up for its recipient at once — the bell's number, the red dot on the tab —
   without a reload. The server side: tests/notify-live.test.js. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page, who) {
  await page.goto("/");
  await page.locator("#au_email").fill(who.email);
  await page.locator("#au_pw").fill(who.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}

test("a task notification reaches the other person without a reload", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, ADMIN);
  const tag = Date.now().toString(36), other = { email: "live-" + tag + "@e2e.test", pw: "Live!Notify-2026x" };
  const ids = await admin.evaluate(async o => {
    await apiFetch("POST", "/api/members", { name: "Live Tester " + o.tag, email: o.email, perm: "member", cap: 40 });
    const people = (await apiFetch("GET", "/api/bootstrap")).people, id = Object.keys(people).find(k => people[k].email === o.email);
    await apiFetch("POST", "/api/members/" + id + "/password", { password: o.pw });
    const d = await apiFetch("POST", "/api/tasks", { title: "Live " + o.tag, status: WS.workflow[0].id, prio: "medium" });
    return { member: id, task: d.id };
  }, Object.assign({ tag }, other));
  const two = await (await browser.newContext()).newPage();
  await signIn(two, other);
  await two.waitForTimeout(800);   /* its live stream is open */
  const before = await two.evaluate(() => NOTIFS.filter(n => !n.read).length);
  try {
    await admin.evaluate(x => notify("assigned", [x.member], x.task), ids);
    await expect.poll(() => two.evaluate(t => NOTIFS.filter(n => !n.read && n.t === t).length, ids.task), { timeout: 8000 }).toBe(1);
    await expect(two.locator("#notifDot")).toHaveText(String(before + 1));
    await expect.poll(() => two.locator("#favicon").getAttribute("href")).toMatch(/^data:image\/png/);
  } finally {
    await admin.evaluate(x => Promise.all([apiFetch("DELETE", "/api/tasks/" + x.task).catch(() => {}), apiFetch("DELETE", "/api/members/" + x.member).catch(() => {})]), ids);
  }
});
