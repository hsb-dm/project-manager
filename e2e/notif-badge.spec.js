/* The bell shows how many notifications are unread — a number, not a dot — and a notification
   that pops up stays long enough to be read: ten seconds, longer while the pointer is on it, with
   its own close button. A task notification pops up the way a chat message does.

   Also here: the version preview keeps to a fixed height, so the notes and the decision under it
   stay in view. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const FOLDER = "https://drive.google.com/drive/folders/1YujA_GjKigwSJXbRJTkO1l2p1gMmm8ai";
const made = [];

async function signIn(page) {
  await page.route(/^https:\/\/(drive|docs)\.google\.com\//, r => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>embed</title>" }));
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
/* a task made through the API and put where the page looks for it */
const makeTask = (page, body) => page.evaluate(b => apiFetch("POST", "/api/tasks", Object.assign({ status: WS.workflow[0].id, assignee: ME }, b)).then(d => { TASKS.push(hTask(d)); return d.id; }), body);
const pop = (page, id, k) => page.evaluate(([t, kind]) => msgOnEvent({ type: "notification_created", notification: { id: uid("nt"), k: kind, who: ME, t, createdAt: new Date().toISOString(), read: false } }), [id, k]);

test("the bell shows the unread count, 99+ past ninety-nine, nothing when all are read", async ({ page }) => {
  await signIn(page);
  const badge = page.locator("#notifBtn #notifDot");
  await page.evaluate(() => { NOTIFS.forEach(n => { n.read = true; }); for (let i = 0; i < 3; i++) NOTIFS.unshift({ id: "nt_b" + i, k: "comment", who: ME, t: "x", ago: 0, read: false }); syncNotifDot(); });
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText("3");
  await expect(page.locator("#notifBtn")).toHaveAttribute("aria-label", "Notifications (3 unread)");
  const box = await badge.boundingBox();
  expect(box.height, "big enough to read").toBeGreaterThanOrEqual(18);
  /* one more makes it pop */
  await page.evaluate(() => { NOTIFS.unshift({ id: "nt_b3", k: "comment", who: ME, t: "x", ago: 0, read: false }); syncNotifDot(); });
  await expect(badge).toHaveText("4");
  await expect(badge).toHaveClass(/bump/);
  await page.evaluate(() => { for (let i = 0; i < 120; i++) NOTIFS.unshift({ id: "nt_m" + i, k: "comment", who: ME, t: "x", ago: 0, read: false }); syncNotifDot(); });
  await expect(badge).toHaveText("99+");
  await page.evaluate(() => { NOTIFS.forEach(n => { n.read = true; }); syncNotifDot(); });
  await expect(badge).toBeHidden();
});

test("a task notification pops up, stays to be read, waits while hovered, and opens the task", async ({ page }) => {
  await page.clock.install();
  await signIn(page);
  const id = await makeTask(page, { title: "Bell target" }); made.push(id);
  const toast = page.locator("#toasts .notif-toast");

  await pop(page, id, "revision");
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText("requested revision on “Bell target”");
  /* the old pop-ups were gone after 2.4 or 5 seconds */
  await page.clock.runFor(8000);
  await expect(toast).toHaveCount(1);
  /* the pointer on it holds it */
  await toast.hover();
  await page.clock.runFor(20000);
  await expect(toast).toHaveCount(1);
  await page.mouse.move(5, 5);
  await page.clock.runFor(2600);
  await expect(toast).toHaveCount(0);

  /* its close button closes it without opening anything */
  await pop(page, id, "comment");
  await toast.locator(".notif-pop-x").click();
  await page.clock.runFor(400);
  await expect(toast).toHaveCount(0);
  expect(await page.evaluate(() => S.drawerTask)).toBeFalsy();

  /* a click opens the task */
  await pop(page, id, "assigned");
  await toast.click();
  await expect.poll(() => page.evaluate(() => S.drawerTask)).toBe(id);
});

test("the pop-up and the bell list speak Indonesian", async ({ page }) => {
  await signIn(page);
  const id = made[0];
  await page.evaluate(() => { UI_LANG = "id"; });
  await pop(page, id, "revision");
  await expect(page.locator("#toasts .notif-toast")).toContainText("meminta revisi pada “Bell target”");
  await page.locator("#notifBtn").click();
  await expect(page.locator("#notifPop .notif").first()).toContainText("meminta revisi pada “Bell target”");
  await page.evaluate(() => { UI_LANG = "en"; closePops(); });
});

test("the version preview keeps to a fixed height, so the notes stay in view", async ({ page }) => {
  await signIn(page);
  const id = await makeTask(page, { title: "Preview height", versions: [{ n: 1, state: "pending", color: "#123A6B", note: "", driveUrl: FOLDER, driveId: "1YujA_GjKigwSJXbRJTkO1l2p1gMmm8ai" }] }); made.push(id);
  await page.evaluate(t => { localStorage.removeItem("zc.drawerAutoExpand"); openTask(t); S.drawerTab = "files"; renderDrawer(); }, id);
  const frame = page.locator("#drBody .av-version .vp-frame");
  await expect(frame).toBeVisible();
  expect(Math.round((await frame.boundingBox()).height)).toBe(340);
  /* expanded gives it a little more, never the whole panel */
  await page.evaluate(() => toggleDrawerExpand());
  await expect.poll(async () => Math.round((await frame.boundingBox()).height)).toBe(400);
  const body = await page.locator("#drBody").boundingBox();
  const notes = await page.locator("#verNotes").boundingBox();
  expect(notes.y, "the notes start inside the visible panel").toBeLessThan(body.y + body.height);
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try { await signIn(page); for (const id of made) await page.evaluate(t => apiFetch("DELETE", "/api/tasks/" + t).catch(() => {}), id); } catch {} finally { await page.close(); }
});
