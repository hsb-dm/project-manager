/* ZenCrevia as an installable app. The manifest carries the workspace's name and the favicon it uses as the icon
   (drawn at each size by an admin's browser; ZenCrevia's own mark until a favicon is uploaded). The service worker
   is registered and shows a page of its own offline. Settings → Notifications says what this device does; the
   menu offers Install when the browser can. A notification clicked while the app is open goes where it points,
   without a reload; with push on, the open tab does not show a second one; signing out tells the server to stop
   pushing to this device. */
const { test, expect } = require("@playwright/test");
const fs = require("fs"), path = require("path");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
/* the colour at the middle of an icon, read in the page */
const centre = (page, src) => page.evaluate(s => new Promise(ok => { const i = new Image(); i.onload = () => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"); x.drawImage(i, 0, 0, 64, 64); ok([...x.getImageData(32, 32, 1, 1).data].slice(0, 3)); }; i.src = s + (s.includes("?") ? "&" : "?") + "t=" + Date.now(); }), src);

test("installable: manifest from the workspace, the favicon as the icon, a service worker, offline, install and push wiring", async ({ page, context, request }) => {
  await signIn(page);
  const ws = await page.evaluate(() => ({ name: WS.name, favicon: WS.favicon || null }));
  try {
    /* the manifest: the workspace's name; ZenCrevia's mark while no favicon is uploaded */
    await page.evaluate(() => { WS.favicon = null; return saveWS(); });
    let m = await (await request.get("/manifest.webmanifest")).json();
    expect(m.name).toBe(ws.name); expect(m.display).toBe("standalone"); expect(m.start_url).toBe("/");
    expect(m.icons.map(i => i.sizes + ":" + i.purpose)).toEqual(["192x192:any", "512x512:any", "512x512:maskable"]);
    const res = await request.get("/manifest.webmanifest"); expect(res.headers()["content-type"]).toContain("application/manifest+json");
    const dflt = fs.readFileSync(path.join(__dirname, "../public/icons/icon-192.png"));
    expect(Buffer.compare(await (await request.get("/pwa-icon/192.png")).body(), dflt), "ZenCrevia's own mark").toBe(0);
    /* a favicon uploaded: the admin's browser draws it at each size; the icons and the manifest follow */
    const red = "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect width='16' height='16' fill='#E11D48'/></svg>");
    await page.evaluate(f => { WS.favicon = f; return saveWS(); }, red);
    await expect.poll(async () => (await (await request.get("/manifest.webmanifest")).json()).icons[0].src, { timeout: 15000 }).not.toContain("v=zc");
    m = await (await request.get("/manifest.webmanifest")).json();
    for (const i of m.icons) { const r = await request.get(i.src); expect(r.status()).toBe(200); expect(r.headers()["content-type"]).toBe("image/png"); }
    const [r1, g1, b1] = await centre(page, m.icons[0].src);
    expect(r1).toBeGreaterThan(200); expect(g1).toBeLessThan(80); expect(b1).toBeLessThan(110);
    expect(await page.evaluate(() => document.querySelector('link[rel="apple-touch-icon"]').getAttribute("href"))).toBe("/pwa-icon/apple-180.png");
    /* only an admin, only PNGs, only for the favicon in use */
    expect((await page.evaluate(() => apiFetch("PUT", "/api/workspace/pwa-icons", { hash: "stale-1", icons: {} }).then(() => 200, e => e.status || e.message)))).not.toBe(200);

    /* the service worker is registered for the whole app */
    const sw = await page.evaluate(() => navigator.serviceWorker.ready.then(r => ({ scope: r.scope, active: !!r.active })));
    expect(sw.active).toBe(true); expect(new URL(sw.scope).pathname).toBe("/");
    /* offline: the worker keeps a page of its own to show instead of the browser's error (the app itself, once
       loaded, already says when the server cannot be reached). Playwright's offline mode does not reach a service
       worker's own requests, so the page is checked where the worker keeps it. */
    await page.reload(); await ready(page);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const offline = await page.evaluate(() => caches.open("zc-offline-v1").then(c => c.match("/offline.html")).then(r => r ? r.text() : ""));
    expect(offline).toContain("You're offline"); expect(offline).toContain("Kamu sedang offline");

    /* Settings → Notifications: this device */
    await page.evaluate(() => { go("settings"); S.settingsTab = "notifications"; renderScreen(); });
    await page.evaluate(() => { const b = [...document.querySelectorAll(".snav button, .settings-nav button")].find(x => /Notification/.test(x.textContent)); if (b) b.click(); });
    await expect(page.locator(".pwa-device")).toContainText("This device");
    /* install: offered in the menu when the browser can install */
    await page.evaluate(() => { const e = new Event("beforeinstallprompt"); e.prompt = () => { window._prompted = true; }; e.userChoice = Promise.resolve({ outcome: "dismissed" }); window.dispatchEvent(e); });
    expect(await page.evaluate(() => userMenuHtml().includes("pwaInstall()"))).toBe(true);
    await page.evaluate(() => pwaInstall());
    expect(await page.evaluate(() => window._prompted)).toBe(true);
    expect(await page.evaluate(() => { const was = UI_LANG; UI_LANG = "id"; const r = [tr("Install app"), tr("This device")]; UI_LANG = was; return r; })).toEqual(["Pasang aplikasi", "Perangkat ini"]);

    /* a notification clicked while the app is open: straight to what it is about */
    const tid = await page.evaluate(async () => { const d = await apiFetch("POST", "/api/tasks", { title: "Pushed task " + Date.now(), status: WS.workflow[0].id, prio: "medium" }); TASKS.push(hTask(d)); return d.id; });
    try {
      await page.evaluate(i => pwaOpenUrl("/tasks?task=" + i + "-pushed-task"), tid);
      expect(await page.evaluate(() => S.drawerTask)).toBe(tid);
      await page.evaluate(() => closeDrawer());
      const conv = await page.evaluate(() => CONVERSATIONS.find(x => x.type === "WORKSPACE").id);
      await page.evaluate(c => pwaOpenUrl("/messages/" + encodeURIComponent(c)), conv);
      expect(await page.evaluate(() => [S.screen, S.messageConversationId])).toEqual(["messages", conv]);
    } finally { await page.evaluate(i => apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}), tid); }

    /* with push on, the open tab leaves chat and task notifications to it: one, not two */
    expect(await page.evaluate(() => { PWA.pushOn = true; const a = notifShowBrowser({ type: "CHAT_DM", conversationId: "x", title: "t" }); PWA.pushOn = false; return a; })).toBe(false);
    /* signing out tells the server to stop pushing to this device */
    await page.evaluate(() => { PWA.pushOn = true; PWA.endpoint = "https://fcm.googleapis.com/fcm/send/e2e-device"; });
    const [logout] = await Promise.all([page.waitForRequest(r => r.url().endsWith("/api/auth/logout")), page.evaluate(() => signOut())]);
    expect(JSON.parse(logout.postData() || "{}").pushEndpoint).toBe("https://fcm.googleapis.com/fcm/send/e2e-device");
  } finally {
    await signIn(page).catch(() => {});
    await page.evaluate(f => { WS.favicon = f; return saveWS(); }, ws.favicon).catch(() => {});
  }
});
