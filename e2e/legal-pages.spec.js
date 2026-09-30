/* Google opens these from a signed-out browser. If either one redirected to the sign-in screen, or
   the app shell swallowed the URL, the OAuth app could not leave "Testing". */
const { test, expect } = require("@playwright/test");

for (const [path, heading] of [["/privacy", "Privacy Policy"], ["/terms", "Terms of Service"]]) {
  test(`${path} opens with no session and no sign-in screen`, async ({ page }) => {
    await page.context().clearCookies();
    const res = await page.goto(path);
    expect(res.status()).toBe(200);
    await expect(page.locator("h1")).toHaveText(heading);
    /* the app shell would have put the login form here instead */
    expect(await page.locator("#au_email").count()).toBe(0);
    expect(await page.evaluate(() => document.body.classList.contains("auth"))).toBe(false);
    expect(await page.content()).not.toContain("{{");
  });
}

test("each page offers both languages and switches in place", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/privacy");
  await expect(page.locator("div[lang=en]")).toBeVisible();
  await expect(page.locator("div[lang=id]")).toBeHidden();
  await page.getByRole("button", { name: "Bahasa Indonesia" }).click();
  await expect(page.locator("div[lang=id]")).toBeVisible();
  await expect(page.locator("div[lang=en]")).toBeHidden();
  await expect(page.locator("div[lang=id]")).toContainText("Data pengguna Google");
  /* the choice survives a reload, so a reader is not flipped back mid-document */
  await page.reload();
  await expect(page.locator("div[lang=id]")).toBeVisible();
});

test("the pages reach each other, and the sign-in screen reaches both", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/privacy");
  await page.locator("footer").getByRole("link", { name: "Terms of Service" }).click();
  await expect(page.locator("h1")).toHaveText("Terms of Service");
  await page.locator("footer").getByRole("link", { name: "Privacy Policy" }).click();
  await expect(page.locator("h1")).toHaveText("Privacy Policy");

  await page.goto("/");
  await expect(page.locator("#au_email")).toBeVisible();
  const legal = page.locator(".auth-legal");
  await expect(legal.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  await expect(legal.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
});

test("the privacy policy states the Limited Use pledge Google's review looks for", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/privacy");
  const text = await page.locator("div[lang=en]").innerText();
  expect(text).toContain("Limited Use");
  expect(text).toContain("Google API Services User Data Policy");
  expect(text).toContain("drive.file");
});
