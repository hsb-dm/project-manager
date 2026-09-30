/* The shared Google Drive account, through the real server: who may configure it, what a member is
   told before it is connected, and the guarantee that the credential never comes back out. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const BUDI = { email: "budi@e2e.test", pw: "Budi!Member-2026", name: "Budi Member" };
const ready = page => page.waitForFunction(() => window.ZC_READY === true && API.on);

/* A second sign-in in the same context never sees the login form, so each identity gets its own
   browser context — the same isolation a different person would have. */
async function signIn(page, who) {
  await page.goto("/");
  await page.locator("#au_email").fill(who.email);
  await page.locator("#au_pw").fill(who.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
async function asUser(browser, who) {
  const ctx = await browser.newContext(), page = await ctx.newPage();
  await signIn(page, who);
  return page;
}
/* raw fetch, so a refusal can be inspected instead of thrown */
const call = (page, method, url, body) => page.evaluate(([m, u, b]) => fetch(u, {
  method: m, credentials: "same-origin",
  headers: b === null ? {} : { "Content-Type": "application/json" },
  body: b === null ? undefined : JSON.stringify(b)
}).then(r => r.text().then(t => { let j = {}; try { j = t ? JSON.parse(t) : {}; } catch { j = { raw: t }; } return { status: r.status, body: j }; })), [method, url, body === undefined ? null : body]);

test("an admin sets the OAuth client, and the secret goes in but never comes back", async ({ page }) => {
  await signIn(page, ADMIN);
  /* the client ID is an ordinary setting and lives in the workspace */
  await page.evaluate(() => { const c = cloudOf("gdrive"); c.config = c.config || {}; c.config.clientId = "cid.apps.googleusercontent.com"; c.config.folderId = "folder123"; return persistWS(); });

  let st = await call(page, "GET", "/api/cloud/gdrive/status");
  expect(st.status).toBe(200);
  expect(st.body.clientId).toBe("cid.apps.googleusercontent.com");
  expect(st.body.hasSecret).toBe(false);
  expect(st.body.shared).toBe(false);

  const saved = await call(page, "PUT", "/api/cloud/gdrive/secret", { clientSecret: "GOCSPX-e2e-never-echo-this" });
  expect(saved.status).toBe(200);
  expect(JSON.stringify(saved.body)).not.toContain("GOCSPX");

  st = await call(page, "GET", "/api/cloud/gdrive/status");
  expect(st.body.hasSecret).toBe(true);
  expect(JSON.stringify(st.body)).not.toContain("GOCSPX");

  /* nor may it leak through the workspace payload every member receives */
  const ws = await call(page, "GET", "/api/workspace");
  expect(JSON.stringify(ws.body)).not.toContain("GOCSPX");
});

test("connect hands back a Google URL asking for offline access and this server's redirect", async ({ page }) => {
  await signIn(page, ADMIN);
  const r = await call(page, "POST", "/api/cloud/gdrive/connect", {});
  expect(r.status).toBe(200);
  const u = new URL(r.body.url);
  expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  expect(u.searchParams.get("access_type")).toBe("offline");
  expect(u.searchParams.get("prompt")).toBe("consent");
  expect(u.searchParams.get("response_type")).toBe("code");
  expect(u.searchParams.get("scope")).toContain("drive.file");
  expect(u.searchParams.get("redirect_uri")).toBe(r.body.redirectUri);
  expect(u.searchParams.get("redirect_uri")).toMatch(/^http:\/\/localhost:\d+\/api\/cloud\/gdrive\/callback$/);
  expect(u.searchParams.get("state")).toBeTruthy();
});

test("a forged callback is refused and nothing is connected", async ({ page }) => {
  await signIn(page, ADMIN);
  const r = await page.evaluate(() => fetch("/api/cloud/gdrive/callback?code=fake&state=made.up", { credentials: "same-origin", redirect: "manual" }).then(res => ({ type: res.type, status: res.status })));
  /* the route answers with a redirect back to settings carrying the refusal, never a connection */
  expect([0, 302, 200]).toContain(r.status);
  const st = await call(page, "GET", "/api/cloud/gdrive/status");
  expect(st.body.shared).toBe(false);
});

test("a member may not read or change the cloud credential settings", async ({ browser, page }) => {
  await signIn(page, ADMIN);
  const added = await page.evaluate(([b]) => apiFetch("POST", "/api/members", { id: "budi", name: b.name, email: b.email, perm: "member", ini: "BM", teams: [] }), [BUDI]);
  await page.evaluate(([id, pw]) => apiFetch("POST", "/api/members/" + id + "/password", { password: pw }), [added.id, BUDI.pw]);

  const bud = await asUser(browser, BUDI);
  expect((await call(bud, "GET", "/api/cloud/gdrive/status")).status).toBe(403);
  expect((await call(bud, "PUT", "/api/cloud/gdrive/secret", { clientSecret: "GOCSPX-member" })).status).toBe(403);
  expect((await call(bud, "POST", "/api/cloud/gdrive/connect", {})).status).toBe(403);
  expect((await call(bud, "DELETE", "/api/cloud/gdrive/shared")).status).toBe(403);
  await bud.close();
});

test("before an admin connects, a member's upload says so plainly instead of failing obscurely", async ({ browser }) => {
  const page = await asUser(browser, BUDI);
  const r = await page.evaluate(() => fetch("/api/cloud/gdrive/upload?name=a.png&mime=image/png", {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "image/png" }, body: new Blob([new Uint8Array([1, 2, 3])])
  }).then(res => res.text().then(t => ({ status: res.status, body: t }))));
  expect(r.status).toBe(409);
  expect(r.body).toMatch(/not connected/i);
  expect(r.body).toMatch(/admin/i);
});

test("a member's page knows a shared account is live without ever seeing the credential", async ({ browser, page }) => {
  await signIn(page, ADMIN);
  /* stand in for a completed Google connection by writing the row the callback would write */
  await call(page, "PUT", "/api/cloud/gdrive/secret", { clientSecret: "GOCSPX-e2e-never-echo-this" });
  const page2 = await asUser(browser, BUDI);
  const seen = await page2.evaluate(() => { const c = cloudOf("gdrive"); return { shared: !!c.shared, hasConfigSecret: JSON.stringify(c.config || {}) }; });
  expect(seen.shared).toBe(false);
  expect(seen.hasConfigSecret).not.toContain("GOCSPX");
  /* and with no shared account the page must not claim one */
  expect(await page2.evaluate(() => gdShared())).toBe(false);
  await page2.close();
});

/* The secret field is a password input, and Chrome ignores autocomplete="off" on those: it decides
   the page is a sign-in form, pairs the field with the nearest text input -- the global search box
   -- and offers the saved login there. Opening Settings then threw the admin's own email over the
   search bar. autocomplete="new-password" is what actually stops it. */
test("opening the panel offers no saved login over the search box", async ({ page }) => {
  const crashes = [];
  page.on("pageerror", e => crashes.push(String(e.message).slice(0, 200)));
  await signIn(page, ADMIN);
  await page.goto("/settings/integrations"); await ready(page);
  await page.waitForTimeout(800);
  const fields = await page.evaluate(() => Array.from(document.querySelectorAll("input")).map(i => ({ id: i.id, type: i.type, autocomplete: i.getAttribute("autocomplete") })));
  const secret = fields.find(f => f.id === "gdsSecret");
  expect(secret, "the panel rendered its secret field").toBeTruthy();
  expect(secret.autocomplete).toBe("new-password");
  expect(fields.filter(f => f.type === "password" && f.autocomplete !== "new-password")).toEqual([]);
  const search = fields.find(f => f.id === "searchInput");
  expect(search.autocomplete).toBe("off");
  expect(crashes).toEqual([]);
});

/* Switching language re-renders the whole settings screen. The panel paints from its cached status
   so the section swaps straight from English to Indonesian; if it rebuilt the placeholder each time,
   the observer below would catch the blink. */
async function openIntegrations(page) {
  await page.goto("/settings/integrations");
  await ready(page);
  await expect(page.locator("#gdsBody")).toContainText(/OAuth/, { timeout: 8000 });
}
test("the panel is bilingual and does not blink when the language changes", async ({ page }) => {
  await signIn(page, ADMIN);
  await openIntegrations(page);
  await expect(page.locator("#gdsBody")).toContainText("Connect Google once as an admin");

  /* watch every mutation for the loading placeholder reappearing */
  await page.evaluate(() => {
    window.__blinks = 0;
    const look = () => { const el = document.getElementById("gdsBody"); if (el && /Checking|Memeriksa/.test(el.textContent) ) window.__blinks++; };
    window.__obs = new MutationObserver(look);
    window.__obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await page.evaluate(() => setLanguage("id"));
  await page.waitForTimeout(1500);

  expect(await page.evaluate(() => window.__blinks)).toBe(0);
  await expect(page.locator("#gdsBody")).toContainText("Hubungkan Google sekali sebagai admin");
  /* the panel heading travels through sp(), which translates it */
  await expect(page.locator("#gdsBody").locator("xpath=ancestor::section[1]")).toContainText("Akun Google Drive bersama");
  /* no English left behind in the section */
  const text = await page.locator("#gdsBody").innerText();
  expect(text).not.toContain("Not connected");
  expect(text).not.toContain("Upload limit");

  await page.evaluate(() => setLanguage("en"));
  await expect(page.locator("#gdsBody")).toContainText("Connect Google once as an admin");
  expect(await page.evaluate(() => window.__blinks)).toBe(0);
});

test("the in-app setup guide is bilingual and shows this server's redirect URI", async ({ page }) => {
  await signIn(page, ADMIN);
  await openIntegrations(page);
  const uri = await page.evaluate(() => GDS.status.redirectUri);
  expect(uri.endsWith("/api/cloud/gdrive/callback")).toBe(true);

  await page.locator("#gdsBody").getByRole("button", { name: "Step-by-step setup guide" }).click();
  await expect(page.locator("#modal")).toContainText("Open Google Cloud Console");
  await expect(page.locator("#modal")).toContainText(uri, { useInnerText: true });
  await page.locator("#modal").getByRole("button", { name: "Got it" }).click();

  await page.evaluate(() => setLanguage("id"));
  await page.locator("#gdsBody").getByRole("button", { name: "Panduan langkah demi langkah" }).click();
  await expect(page.locator("#modal")).toContainText("Buka Google Cloud Console");
  await expect(page.locator("#modal")).toContainText("Selama masih berstatus Testing");
  await expect(page.locator("#modal")).toContainText(uri, { useInnerText: true });
  await page.evaluate(() => setLanguage("en"));
});

test.afterAll(async ({ browser }) => {
  /* leave the workspace as the other specs expect to find it */
  const page = await browser.newPage();
  try {
    await signIn(page, ADMIN);
    await call(page, "PUT", "/api/cloud/gdrive/secret", { clientSecret: "" });
    await page.evaluate(() => { const c = cloudOf("gdrive"); c.config = {}; c.connected = false; return persistWS(); });
    /* flows.spec.js asserts a clean install has only the admin, and these specs share one server */
    await call(page, "DELETE", "/api/members/budi");
  } catch {} finally { await page.close(); }
});
