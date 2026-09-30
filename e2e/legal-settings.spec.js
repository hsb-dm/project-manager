/* The legal contact, entity and jurisdiction are set from Settings → Workspace and appear on the
   public pages at once. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = page => page.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page, who) {
  await page.goto("/");
  await page.locator("#au_email").fill(who.email);
  await page.locator("#au_pw").fill(who.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
async function openWorkspaceSettings(page) {
  await page.goto("/settings/workspace"); await ready(page);
  await expect(page.locator("#legBody")).toContainText(/Contact email|Email kontak/, { timeout: 8000 });
}

test("an admin sets the contact in Settings and the public page shows it", async ({ page, browser }) => {
  await signIn(page, ADMIN);
  await openWorkspaceSettings(page);
  await page.locator("#leg_contact").fill("privacy@hsb.co.id");
  await page.locator("#leg_entity").fill("PT Studio Contoh");
  await page.locator("#legBody").getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#legBody")).toContainText("privacy@hsb.co.id");

  /* read it the way Google does: no cookies at all */
  const anon = await browser.newContext(), p = await anon.newPage();
  await p.goto("/privacy");
  await expect(p.locator("div[lang=en]")).toContainText("privacy@hsb.co.id");
  await expect(p.locator(".brand .nm")).toHaveText("PT Studio Contoh");
  await anon.close();
});

test("a malformed address is refused rather than silently dropped", async ({ page }) => {
  await signIn(page, ADMIN);
  await openWorkspaceSettings(page);
  await page.locator("#leg_contact").fill("not an email");
  await page.locator("#legBody").getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".toast, #toast").filter({ hasText: /email address/i }).first()).toBeVisible();
  /* and the good one from before is still there */
  const saved = await page.evaluate(() => apiFetch("GET", "/api/workspace/legal"));
  expect(saved.saved.contact).toBe("privacy@hsb.co.id");
});

test("saving the rest of the workspace does not wipe the legal details", async ({ page }) => {
  await signIn(page, ADMIN);
  /* the ordinary workspace save rewrites the whole row */
  await page.evaluate(() => { WS.tagline = "changed " + Date.now(); return persistWS(); });
  const after = await page.evaluate(() => apiFetch("GET", "/api/workspace/legal"));
  expect(after.saved.contact).toBe("privacy@hsb.co.id");
  expect(after.saved.entity).toBe("PT Studio Contoh");
});

test("the panel is bilingual and does not blink when the language changes", async ({ page }) => {
  await signIn(page, ADMIN);
  await openWorkspaceSettings(page);
  await page.evaluate(() => {
    window.__blinks = 0;
    new MutationObserver(() => { const el = document.getElementById("legBody"); if (el && /Checking|Memeriksa/.test(el.textContent)) window.__blinks++; })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await page.evaluate(() => setLanguage("id"));
  await expect(page.locator("#legBody")).toContainText("Email kontak");
  await expect(page.locator("#legBody").locator("xpath=ancestor::section[1]")).toContainText("Halaman legal");
  expect(await page.evaluate(() => window.__blinks)).toBe(0);
  await page.evaluate(() => setLanguage("en"));
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try { await signIn(page, ADMIN); await page.evaluate(() => apiFetch("PUT", "/api/workspace/legal", { contact: "", entity: "", jurisdiction: "" })); } catch {} finally { await page.close(); }
});
