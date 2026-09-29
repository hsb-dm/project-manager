/* A reload must not cost a Google sign-in. The token is never persisted to the server, but it is
   kept for the tab, so refreshing a page mid-session reuses it instead of opening a window. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = page => page.waitForFunction(() => window.ZC_READY === true && API.on);

/* Stand in for Google Identity Services and count how often it is asked for a token. */
async function stubGoogle(page) {
  await page.addInitScript(() => {
    window.__gsiCalls = 0;
    window.google = { accounts: { oauth2: { initTokenClient: o => ({
      requestAccessToken: () => { window.__gsiCalls++; o.callback({ access_token: "tok-" + window.__gsiCalls, expires_in: 3600 }); }
    }) } } };
  });
}
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  await page.evaluate(() => { const c = cloudOf("gdrive"); c.config = c.config || {}; c.config.clientId = "test-client.apps.googleusercontent.com"; c.config.autoUpload = true; });
}

/* Signing in persists the connection for the whole workspace, and these specs share one server
   with flows.spec.js — leave Drive switched off again or its upload flow takes the Drive path. */
test.afterEach(async ({ page }) => {
  await page.evaluate(() => { const c = cloudOf("gdrive"); c.config = {}; c.connected = false; c.account = ""; return persistWS(); }).catch(() => {});
});

test("a reload reuses the Drive token instead of asking Google again", async ({ page }) => {
  await stubGoogle(page);
  await signIn(page);
  expect(await page.evaluate(() => gdToken())).toBe("tok-1");
  expect(await page.evaluate(() => window.__gsiCalls)).toBe(1);

  await page.reload(); await ready(page);
  /* fresh page, empty GD — the token must come back from the tab's own store */
  expect(await page.evaluate(() => gdNeedsToken())).toBe(false);
  expect(await page.evaluate(() => gdToken())).toBe("tok-1");
  expect(await page.evaluate(() => window.__gsiCalls)).toBe(0);
});

test("a token minted for a different OAuth client is not reused", async ({ page }) => {
  await stubGoogle(page);
  await signIn(page);
  await page.evaluate(() => gdToken());
  await page.reload(); await ready(page);
  await page.evaluate(() => { const c = cloudOf("gdrive"); c.config.clientId = "someone-else.apps.googleusercontent.com"; c.config.autoUpload = true; });
  expect(await page.evaluate(() => gdNeedsToken())).toBe(true);
});

test("an expired token is not reused", async ({ page }) => {
  await stubGoogle(page);
  await signIn(page);
  await page.evaluate(() => gdToken());
  await page.evaluate(() => { const k = gdTokenKey(), x = JSON.parse(sessionStorage.getItem(k)); x.exp = Date.now() - 1000; sessionStorage.setItem(k, JSON.stringify(x)); });
  await page.reload(); await ready(page);
  expect(await page.evaluate(() => gdNeedsToken())).toBe(true);
});
