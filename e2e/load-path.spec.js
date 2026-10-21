/* The load path (Oct 2026, performance stage 2): what a visit downloads and when it asks for it.
   - Signed in on this browser, the session and the workspace are asked for while the page itself still loads, once
     each; signed out, the workspace is not asked for at all. A reload reads the tab's saved design side by side
     with the workspace, not before it.
   - Poppins is the app's own (public/fonts/), never Google's; the pictures and the chime are files the browser keeps
     a year; the demo workspace is not in the served page, yet a page with no API behind it still opens in demo mode.
   - Brand fonts are fetched when AI Hub first draws, not at sign-in, and the canvas waits for them. */
const { test, expect } = require("@playwright/test");
const fs = require("fs"), path = require("path");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = page => page.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const entries = (page, re) => page.evaluate(src => performance.getEntriesByType("resource").filter(e => new RegExp(src).test(e.name)).map(e => ({ name: e.name, start: e.startTime, end: e.responseEnd })), re.source);

test("signed in, the session and the workspace are asked for at once, while the page loads", async ({ page }) => {
  await signIn(page);
  const me = await page.evaluate(() => SESSION.user.id);
  expect(await page.evaluate(() => localStorage.getItem("cos.signedIn"))).toBe(me);
  await page.reload(); await ready(page);
  const session = await entries(page, /\/api\/auth\/session$/), boot = await entries(page, /\/api\/bootstrap$/);
  expect(session.length, "the session, once").toBe(1);
  expect(boot.length, "the workspace, once").toBe(1);
  expect(boot[0].start, "the workspace is asked for before the session has answered").toBeLessThan(session[0].end);
  await expect(page.locator("#meBtn")).toContainText("Admin");
  /* signing out forgets it: the next visit does not ask for a workspace it would be refused */
  await page.evaluate(() => signOut());
  await expect(page.locator("#au_email")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("cos.signedIn"))).toBe(null);
});

test("signed out, the workspace is not asked for, and the sign-in page's flag comes with the page", async ({ page }) => {
  const asked = []; page.on("request", r => { if (/\/api\/bootstrap/.test(r.url())) asked.push(r.url()); });
  await page.goto("/");
  await expect(page.locator("#au_email")).toBeVisible();
  const flag = page.locator(".authcard .lang-flag").first();
  await expect(flag).toHaveAttribute("src", /^\/assets\/flag-en\.[0-9a-f]{10}\.webp$/);
  await expect.poll(() => flag.evaluate(i => i.complete && i.naturalWidth)).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect(asked, "no refused request for a workspace").toEqual([]);
  /* a browser that was signed in when the session ended: asked once, refused, and not again */
  await page.evaluate(() => localStorage.setItem("cos.signedIn", "u_gone"));
  await page.reload(); await expect(page.locator("#au_email")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("cos.signedIn"))).toBe(null);
});

test("a reload reads the tab's saved design side by side with the workspace", async ({ page }) => {
  await signIn(page);
  /* without the early request (as for the first visit after this change): view-memory.js reads IndexedDB first */
  await page.evaluate(() => localStorage.removeItem("cos.signedIn"));
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name) {
      const rq = open.apply(this, arguments); if (name !== "zencrevia-tab") return rq;
      const slow = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      rq.onupgradeneeded = e => { slow.result = rq.result; if (slow.onupgradeneeded) slow.onupgradeneeded(e); };
      rq.onerror = e => { if (slow.onerror) slow.onerror(e); };
      rq.onsuccess = e => { slow.result = rq.result; setTimeout(() => { window.__idbRead = performance.now(); if (slow.onsuccess) slow.onsuccess(e); }, 1200); };
      return slow;
    };
  });
  await page.reload(); await ready(page);
  const boot = await entries(page, /\/api\/bootstrap$/), read = await page.evaluate(() => window.__idbRead);
  expect(read, "the tab's design was read").toBeGreaterThan(0);
  expect(boot.length).toBe(1);
  expect(boot[0].start, "the workspace was asked for before the read finished").toBeLessThan(read);
});

test("Poppins is the app's own: no Google Fonts, the same five weights, kept a year", async ({ page }) => {
  const google = [], own = [];
  page.on("request", r => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) google.push(r.url()); });
  page.on("response", r => { if (/\/fonts\/poppins-/.test(r.url())) own.push({ url: r.url(), type: r.headers()["content-type"], cache: r.headers()["cache-control"] }); });
  await page.goto("/");
  await expect(page.locator("#au_email")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const faces = await page.evaluate(() => { const w = new Set(); document.fonts.forEach(f => { if (f.family.replace(/["']/g, "") === "Poppins") w.add(f.weight); }); return [...w].sort(); });
  expect(faces).toEqual(["400", "500", "600", "700", "800"]);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/^"?Poppins/);
  await expect.poll(() => page.evaluate(() => document.fonts.check('400 14px "Poppins"'))).toBe(true);
  expect(own.length, "the latin 400 weight at least").toBeGreaterThan(0);
  own.forEach(r => { expect(r.type).toBe("font/woff2"); expect(r.cache).toBe("public, max-age=31536000, immutable"); });
  expect(await page.locator('link[rel="preload"][as="font"][href^="/fonts/"]').count()).toBe(1);
  expect(google, "nothing from Google Fonts").toEqual([]);
  expect((await page.request.get("/fonts/OFL.txt")).status(), "the font's licence ships with it").toBe(200);
});

test("the pictures and the chime are files the browser keeps a year; the demo workspace is not in the page", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#au_email")).toBeVisible();
  const urls = await page.evaluate(() => [FLAG_EN, DRIVE_LOGO_DATA, ZEN_SOUND_SRC]);
  const files = ["flag-en.webp", "google-drive-logo.webp", "sounds/zen-chime.mp3"].map(f => fs.readFileSync(path.join(__dirname, "..", "src", f)));
  for (let i = 0; i < urls.length; i++) {
    expect(urls[i]).toMatch(/^\/assets\/[\w-]+\.[0-9a-f]{10}\.(webp|mp3)$/);
    const r = await page.request.get(urls[i]);
    expect(r.status()).toBe(200);
    expect(r.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect((await r.body()).equals(files[i]), urls[i]).toBe(true);
  }
  const demo = await page.evaluate(() => ({ tasks: CREATIVE_OS_DEMO.tasks, people: CREATIVE_OS_DEMO.people, roles: CREATIVE_OS_DEMO.roles.length, knowledge: CREATIVE_OS_DEMO.knowledge.length, src: CREATIVE_OS_DEMO_SRC, records: TASKS.length + PROJECTS.length + Object.keys(PEOPLE).length }));
  expect(demo.tasks, "no demo tasks in the served page").toBeUndefined();
  expect(demo.people).toBeUndefined();
  expect(demo.roles).toBeGreaterThan(0);
  expect(demo.knowledge).toBeGreaterThan(0);
  expect(demo.records).toBe(0);
  expect(demo.src).toMatch(/^\/assets\/demo-data\.[0-9a-f]{10}\.js$/);
});

test("a page with no API behind it (a static host) still opens in demo mode", async ({ page }) => {
  await page.context().clearCookies();
  await page.route("**/api/auth/session", r => r.fulfill({ status: 404, contentType: "text/plain", body: "Not found" }));
  await page.goto("/");
  await expect(page.locator(".demo-user-card").first()).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#content")).toContainText("Demo mode");
  expect(await page.evaluate(() => CREATIVE_OS_DEMO.tasks.length)).toBeGreaterThan(10);
});

test("brand fonts are fetched when AI Hub first draws, not at sign-in, and the canvas waits for them", async ({ page }) => {
  const dir = path.join(path.dirname(require.resolve("playwright-core/package.json")), "lib", "vite", "traceViewer");
  const ttf = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find(n => /^codicon.*\.ttf$/.test(n))));
  await signIn(page);
  const before = await page.evaluate(() => JSON.parse(JSON.stringify((WS.ai && WS.ai.fonts) || null)));
  let route = null;
  try {
    const url = await page.evaluate(async b64 => {
      WS.ai = WS.ai || {}; WS.ai.fonts = [{ id: "fn_loadpath", name: "Load Path Brand", url: "data:font/ttf;base64," + b64, kind: "ttf" }];
      const ws = await persistWS(); if (ws && ws.ai) WS.ai.fonts = ws.ai.fonts; return WS.ai.fonts[0].url;
    }, ttf.toString("base64"));
    expect(url).toMatch(/^\/files\/[a-f0-9]{64}\.ttf$/);
    /* every line of text drawn on a canvas in that font, and whether the browser had the font when it was drawn */
    await page.addInitScript(() => {
      window.__drawn = [];
      const fill = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function () { if (/Load Path Brand/.test(this.font)) window.__drawn.push(document.fonts.check(this.font)); return fill.apply(this, arguments); };
    });
    const fetched = [];
    page.on("request", r => { if (r.url().endsWith(url)) fetched.push(Date.now()); });
    /* slow, so a canvas that does not wait would draw before it arrives */
    route = "**" + url;
    await page.route(route, async r => { await new Promise(x => setTimeout(x, 800)); await r.continue(); });
    await page.reload(); await ready(page);
    await page.waitForTimeout(1500);
    expect(fetched.length, "not fetched at sign-in").toBe(0);
    expect(await page.evaluate(() => [...document.fonts].some(f => f.family.replace(/["']/g, "") === "Load Path Brand")), "but known to the browser").toBe(true);
    await page.evaluate(() => { AIF.headline = "Brand headline"; AIF.headlineFont = "Load Path Brand"; go("aihub"); });
    await expect.poll(() => fetched.length, { timeout: 15000 }).toBeGreaterThan(0);
    await page.waitForFunction(() => window.__drawn.length > 0, null, { timeout: 15000 });
    expect(await page.evaluate(() => window.__drawn), "the canvas drew in it only once it had arrived").not.toContain(false);
  } finally {
    if (route) await page.unroute(route).catch(() => {});
    await page.evaluate(async b => { WS.ai = WS.ai || {}; WS.ai.fonts = b || []; AIF.headlineFont = ""; AIF.headline = ""; await persistWS(); if (typeof aiFontsLoad === "function") aiFontsLoad(); }, before);
  }
});
