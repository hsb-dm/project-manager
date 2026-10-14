/* The announcement e-mail in Settings → Notifications (Oct 2026): an admin writes it, sends a test to themselves,
   then to everyone — asked once more with the number of people — and sees it in the list with how far it got.
   Someone without the capability does not see the section. The server side: tests/announcements.test.js. */
const { test, expect } = require("@playwright/test");
const fs = require("fs"), os = require("os"), path = require("path");
const { readMail } = require("../tests/mail-text.js");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const OUTBOX = path.join(os.tmpdir(), "zencrevia-e2e-" + (process.env.E2E_PORT || "3310"), "outbox");
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page, who) {
  await page.goto("/");
  await page.locator("#au_email").fill(who.email);
  await page.locator("#au_pw").fill(who.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const mails = subject => (fs.existsSync(OUTBOX) ? fs.readdirSync(OUTBOX) : []).map(f => Object.assign({ file: f }, readMail(fs.readFileSync(path.join(OUTBOX, f), "utf8")))).filter(m => m.subject.includes(subject));

test("an admin writes an announcement, tries it on themselves, then sends it to everyone", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await signIn(page, ADMIN);
  const tag = Date.now().toString(36), subject = "Release notes " + tag, other = { email: "ann-" + tag + "@e2e.test", pw: "Announce!Member-2026x" };
  const member = await page.evaluate(async o => { await apiFetch("POST", "/api/members", { name: "Announce Reader " + o.tag, email: o.email, perm: "member", cap: 40 }); const people = (await apiFetch("GET", "/api/bootstrap")).people, id = Object.keys(people).find(k => people[k].email === o.email); await apiFetch("POST", "/api/members/" + id + "/password", { password: o.pw }); await reloadAll(); return id; }, Object.assign({ tag }, other));
  try {
    await page.evaluate(() => go("settings", "notifications"));
    const panel = page.locator("#annPanel");
    await expect(panel.locator("h2")).toHaveText("Announcement email");
    await expect(panel.locator(".ann-who")).toHaveText("It goes to 2 people.");
    await panel.locator("#ann_subject").fill(subject);
    await panel.locator("#ann_message").fill("What changed:\n- Discussions on every project");
    await panel.locator("#ann_link").fill("https://example.com/changelog");
    /* a test, to the sender alone */
    await panel.getByRole("button", { name: "Send a test to me" }).click();
    await expect(page.locator("#toasts")).toContainText("Test sent to admin@e2e.test");
    await expect.poll(() => mails(subject).map(m => m.file.includes("admin@e2e.test"))).toEqual([true]);
    /* to everyone: asked once more, with how many */
    await panel.getByRole("button", { name: "Send to everyone" }).click();
    await expect(page.locator("#modal")).toContainText("This e-mail goes to 2 people.");
    await expect(page.locator("#modal .ann-preview")).toContainText(subject);
    await page.locator("#annGo").click();
    await expect(page.locator("#toasts")).toContainText("Sending to 2 people");
    await expect(panel.locator(".ann-row").first()).toContainText(subject);
    await expect(panel.locator(".ann-row").first().locator(".badge")).toHaveText("Sent to 2", { timeout: 10000 });
    await expect(panel.locator("#ann_subject")).toHaveValue("");
    await expect.poll(() => mails(subject).length).toBe(3);
    const toMember = mails(subject).find(m => m.file.includes(other.email.replace(/[^a-z0-9@.]/gi, "_")));
    expect(toMember.text).toContain("- Discussions on every project");
    expect(toMember.text).toContain("https://example.com/changelog");
    await expect(panel.locator(".ann-row").first()).toContainText("to everyone");
    /* or to the people chosen: Select all, untick one, search; only they get it */
    const subject2 = "Just for you " + tag;
    await panel.locator("#ann_subject").fill(subject2);
    await panel.locator("#ann_message").fill("A note for one person.");
    await panel.locator(".ann-mode button", { hasText: "Choose people" }).click();
    const list = panel.locator(".ann-pick-list .ann-person");
    await expect(list).toHaveCount(2);
    /* one row each: the box, the photo, the name and what they do — not a form field's label stretched over the width */
    expect(await list.first().evaluate(r => r.getBoundingClientRect().height)).toBeLessThan(64);
    expect(await list.first().locator("input").evaluate(i => i.getBoundingClientRect().width)).toBeLessThan(24);
    expect(await list.first().locator(".ann-pn b").evaluate(b => getComputedStyle(b).textTransform)).toBe("none");
    await expect(panel.locator(".ann-count")).toHaveText("0 selected");
    await expect(panel.getByRole("button", { name: "Send to 0 people" })).toBeDisabled();
    await panel.locator("#ann_all").check();
    await expect(panel.locator(".ann-count")).toHaveText("2 selected");
    await list.filter({ hasText: "Admin E2E" }).locator("input").uncheck();
    await expect(panel.locator(".ann-count")).toHaveText("1 selected");
    await expect(panel.locator("#ann_all")).not.toBeChecked();
    await panel.locator("#ann_q").fill("Announce Reader");
    await expect(list).toHaveCount(1);
    await expect(panel.locator("#ann_q")).toBeFocused();
    await expect(panel.locator("#ann_all")).toBeChecked();   /* everyone found is ticked */
    await panel.locator("#ann_q").fill("");
    await expect(list).toHaveCount(2);
    await expect(panel.locator("#ann_subject")).toHaveValue(subject2);   /* what was written stays */
    await panel.getByRole("button", { name: "Send to 1 person" }).click();
    await expect(page.locator("#modal")).toContainText("This e-mail goes to 1 person.");
    await expect(page.locator("#modal .ann-names")).toHaveText("Announce Reader " + tag);
    await page.locator("#annGo").click();
    await expect(panel.locator(".ann-row").first()).toContainText("to 1 person chosen");
    await expect(panel.locator(".ann-row").first().locator(".badge")).toHaveText("Sent to 1", { timeout: 10000 });
    await expect.poll(() => mails(subject2).map(m => m.file.includes(other.email.replace(/[^a-z0-9@.]/gi, "_")))).toEqual([true]);
    await expect(panel.locator(".ann-mode button.on")).toHaveText("Everyone");   /* back to everyone for the next one */
    /* Indonesian */
    await page.evaluate(() => { setLanguage("id"); renderScreen(false); });
    await expect(page.locator("#annPanel h2")).toHaveText("Email pengumuman");
    await expect(page.locator("#annPanel")).toContainText("Kirim tes ke saya");
    await page.evaluate(() => { setLanguage("en"); });
    /* someone without the capability does not see it */
    const two = await (await browser.newContext()).newPage();
    await signIn(two, other);
    await two.evaluate(() => go("settings", "notifications"));
    await expect(two.locator("#content h2").first()).toBeVisible();
    expect(await two.locator("#annPanel").count()).toBe(0);
  } finally {
    await page.evaluate(id => apiFetch("DELETE", "/api/members/" + id).catch(() => {}), member);
  }
});
