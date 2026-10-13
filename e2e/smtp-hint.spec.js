/* A refused SMTP sign-in says what to do (Oct 2026). Gmail answered "535-5.7.8 Username and Password not accepted"
   and the form showed only that; for Gmail it now says: a 16-letter App Password, not the Google password; the full
   address as the username; type it again, as a blank password field keeps the one already stored. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const REFUSED = "Could not connect: 535-5.7.8 Username and Password not accepted. For more information, go to | 535 5.7.8 https://support.google.com/mail/?p=BadCredentials - gsmtp";

test("a refused SMTP sign-in says what to do — for Gmail, an App Password", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  await page.goto("/settings/notifications"); await page.waitForFunction(() => window.ZC_READY === true && API.on);
  /* the server's answer, as Gmail gave it */
  await page.route("**/api/mail/smtp/test", r => r.fulfill({ status: 424, contentType: "application/json", body: JSON.stringify({ error: REFUSED }) }));
  await page.route("**/api/mail/smtp/send-test", r => r.fulfill({ status: 424, contentType: "application/json", body: JSON.stringify({ error: REFUSED.replace("Could not connect", "Send failed") }) }));
  await page.locator("#smtp_host").fill("smtp.gmail.com");
  await page.locator("#smtpTestBtn").click();
  const result = page.locator("#smtpResult");
  await expect(result).toContainText("535-5.7.8 Username and Password not accepted");
  await expect(result.locator(".smtp-hint")).toContainText("Use a 16-letter App Password");
  await expect(result.locator(".smtp-hint")).toContainText("a blank password field keeps the one already stored");
  /* another server: the general words */
  await page.locator("#smtp_host").fill("smtp.office365.com");
  await page.locator("#smtpTestBtn").click();
  await expect(result.locator(".smtp-hint")).toHaveText("The mail server refused the username or password. Check both; a blank password field keeps the one already stored.");
  /* not a sign-in problem: no hint */
  expect(await page.evaluate(() => smtpAuthHint("Could not connect: The server did not respond within 15 seconds", "smtp.gmail.com"))).toBe("");
  /* Indonesian */
  await page.evaluate(() => { UI_LANG = "id"; });
  expect(await page.evaluate(r => smtpAuthHint(r, "smtp.gmail.com"), REFUSED)).toContain("Pakai App Password 16 huruf");
  await page.evaluate(() => { UI_LANG = "en"; });
});
