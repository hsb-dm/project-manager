/* Messages has a channel with everyone in the workspace — #everyone — first in the list, in its own
   section above the teams, and Messages opens on it. It cannot be left. In Indonesian it reads
   #semua-orang. The server's rules are tests/everyone-channel.test.js. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

test("#everyone is first, opened by default, and cannot be left", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  await page.evaluate(() => { S.messageConversationId = null; go("messages"); });
  await expect(page.locator(".msg-nav-scroll .msg-section-title").first()).toHaveText("Everyone");
  const first = page.locator(".msg-nav-scroll .msg-crow").first();
  await expect(first.locator(".msg-crow-name")).toHaveText("everyone");
  await expect(first, "Messages opens on it").toHaveClass(/\bon\b/);
  const everyone = await page.evaluate(() => conv(S.messageConversationId));
  expect(everyone.type).toBe("WORKSPACE");
  expect(await page.evaluate(() => convMembers(conv(S.messageConversationId)).length)).toBe(await page.evaluate(() => Object.keys(PEOPLE).filter(id => PEOPLE[id].active !== false).length));
  /* no way out, and it says why */
  await page.evaluate(() => { S.messageDetailOpen = true; S.messageDetailTab = "detail"; renderMessages(); });
  await expect(page.locator("#msgDetail .msg-leave")).toHaveCount(0);
  await expect(page.locator("#msgDetail .msg-leave-note")).toContainText("Everyone in the workspace is in #everyone");
  /* and in Indonesian */
  await page.evaluate(() => { UI_LANG = "id"; renderMessages(); });
  await expect(page.locator(".msg-nav-scroll .msg-section-title").first()).toHaveText("Semua orang");
  await expect(page.locator(".msg-nav-scroll .msg-crow").first().locator(".msg-crow-name")).toHaveText("semua-orang");
  await page.evaluate(() => { UI_LANG = "en"; renderMessages(); });
});
