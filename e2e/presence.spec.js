/* On screen, online / offline follows the server at once: every dot and "Online/Offline" carries its
   person and changes in place, with no redraw. On a server nobody is online by default — the demo's
   always-online people are the standalone demo's only. The protocol itself is tests/presence.test.js. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

test("dots and labels follow the snapshot and each change", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  expect(await page.evaluate(() => msgPresence("sarah")), "no demo rule on a server").toBe("offline");
  await page.evaluate(() => { document.getElementById("content").insertAdjacentHTML("beforeend", '<div id="presProbe"><i class="msg-presence offline" data-pid="ghost1"></i><span class="msg-presence-text" data-pid="ghost1">Offline</span></div>'); });
  const dot = page.locator("#presProbe .msg-presence"), label = page.locator("#presProbe .msg-presence-text");
  await page.evaluate(() => msgOnEvent({ type: "presence_snapshot", online: ["ghost1"] }));
  await expect(dot).toHaveClass(/\bonline\b/);
  await expect(label).toHaveText("Online");
  await page.evaluate(() => msgOnEvent({ type: "presence", userId: "ghost1", state: "offline" }));
  await expect(dot).toHaveClass(/\boffline\b/);
  await expect(label).toHaveText("Offline");
});
