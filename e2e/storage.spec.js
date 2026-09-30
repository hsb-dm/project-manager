/* "This server" file storage, end to end: the admin's switch, a member attaching PDFs, decks and
   spreadsheets through the real task drawer, the 5 MB limit, image optimisation, and the rules
   that keep a stored file from being forged or read without a session. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const SARI = { email: "sari@e2e.test", pw: "Sari!Member-2026", name: "Sari Member" };
const ready = page => page.waitForFunction(() => window.ZC_READY === true && API.on);
let taskId = null;

async function signIn(page, who, target) {
  await page.goto(target || "/");
  await page.locator("#au_email").fill(who.email);
  await page.locator("#au_pw").fill(who.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
async function asUser(browser, who, target) { const ctx = await browser.newContext(), page = await ctx.newPage(); await signIn(page, who, target); return page; }
const api = (page, m, u, b) => page.evaluate(([m, u, b]) => apiFetch(m, u, b), [m, u, b]);
/* a raw call, so a refusal can be inspected instead of thrown */
const raw = (page, m, u, b) => page.evaluate(([m, u, b]) => fetch(u, { method: m, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: b == null ? undefined : JSON.stringify(b) }).then(r => r.text().then(t => ({ status: r.status, body: t }))), [m, u, b]);
const file = (name, mimeType, bytes) => ({ name, mimeType, buffer: Buffer.alloc(bytes, 7) });

test("an admin switches storage to this server, and the choice survives a reload", async ({ page }) => {
  await signIn(page, ADMIN, "/settings/integrations");
  /* The real situation: a Drive client ID is still configured — the workspace tried Drive and it
     did not work out. Without this the earlier version of these tests passed while every
     attachment still went to Drive, because forceDrive only asked whether Drive was configured. */
  await page.evaluate(() => { const c = cloudOf("gdrive"); c.config = c.config || {}; c.config.clientId = "left-over.apps.googleusercontent.com"; return persistWS(); });
  await page.reload(); await ready(page);
  await expect(page.locator("#stoBody")).toBeVisible();
  await page.locator("#stoBody").getByRole("button", { name: "This server", exact: true }).click();
  await expect(page.locator("#stoBody")).toContainText("5 MB");
  await page.reload(); await ready(page);
  expect(await page.evaluate(() => storageMode())).toBe("server");
  /* every upload path asks for real storage with forceDrive; none of them may reach Drive now */
  expect(await page.evaluate(() => gdAuto())).toBe(false);
  expect(await page.evaluate(() => gdReady())).toBe(true);   /* Drive is still configured… */
  expect(await page.evaluate(() => storageLabel())).toBe("this server");   /* …and still not used */
  await expect(page.locator('#stoBody [data-storage="server"]')).toHaveAttribute("aria-pressed", "true");

  /* a member to do the uploading, and a task for them to attach to */
  const added = await api(page, "POST", "/api/members", { id: "sari", name: SARI.name, email: SARI.email, perm: "member", ini: "SM", teams: [] });
  await api(page, "POST", "/api/members/" + added.id + "/password", { password: SARI.pw });
  /* a task needs a project, and a clean install has none — make both the way the app does */
  await page.goto("/projects"); await ready(page);
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.locator("#np_name").fill("Storage project");
  await page.locator("#modal .btn.primary").click();
  const projId = await expect.poll(() => page.evaluate(() => (PROJECTS.find(p => p.name === "Storage project") || {}).id || "")).not.toBe("").then(() => page.evaluate(() => PROJECTS.find(p => p.name === "Storage project").id));
  await page.evaluate(([pid, who]) => { newTaskModal({ title: "Storage check", proj: pid, assignee: who }); }, [projId, added.id]);
  await page.evaluate(() => createDraft());
  await expect.poll(() => page.evaluate(() => (TASKS.find(t => t.title === "Storage check" && !t._draft && t.id !== "T-new") || {}).id || "")).not.toBe("");
  taskId = await page.evaluate(() => TASKS.find(t => t.title === "Storage check" && !t._draft).id);
  await expect.poll(() => api(page, "GET", "/api/tasks/" + taskId).then(t => t.id, () => "")).toBe(taskId);
});

test("a member attaches a PDF, a deck and a spreadsheet; each is stored and saved", async ({ browser }) => {
  const page = await asUser(browser, SARI, "/tasks?task=" + taskId);
  await page.evaluate(id => { S.drawerTask = id; }, taskId);
  const chooser = page.waitForEvent("filechooser");
  await page.evaluate(() => attachLocal());
  await (await chooser).setFiles([
    file("Brief Q4.pdf", "application/pdf", 40_000),
    file("Pitch deck.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", 90_000),
    file("Budget.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 20_000)
  ]);
  await expect.poll(() => page.evaluate(id => task(id).files.map(f => f.url).filter(u => /^\/files\/d\//.test(u)).length, taskId), { timeout: 15000 }).toBe(3);
  const urls = await page.evaluate(id => task(id).files.map(f => f.url), taskId);
  expect(urls.some(u => u.endsWith(".pdf"))).toBe(true);
  expect(urls.some(u => u.endsWith(".pptx"))).toBe(true);
  expect(urls.some(u => u.endsWith(".xlsx"))).toBe(true);

  /* saved on the server, not just in this tab */
  await expect.poll(() => api(page, "GET", "/api/tasks/" + taskId).then(t => (t.files || []).filter(f => /^\/files\/d\//.test(f.url)).length)).toBe(3);

  /* and it comes back byte for byte */
  const pdf = urls.find(u => u.endsWith(".pdf"));
  const got = await page.evaluate(u => fetch(u).then(r => r.arrayBuffer()).then(b => b.byteLength), pdf);
  expect(got).toBe(40_000);
  await page.close();
});

test("a file over 5 MB is refused in the page, before a byte is sent", async ({ browser }) => {
  const page = await asUser(browser, SARI, "/tasks?task=" + taskId);
  let sent = 0;
  page.on("request", r => { if (r.url().includes("/api/files/upload")) sent++; });
  const err = await page.evaluate(() => uploadAny(new File([new Uint8Array(6 * 1024 * 1024)], "huge.pdf", { type: "application/pdf" })).then(() => "uploaded", e => e.message));
  expect(err).toMatch(/5 MB/);
  expect(err).toMatch(/Google Drive/);
  expect(sent).toBe(0);
  await page.close();
});

test("the server enforces the limit too, whatever the page does", async ({ browser }) => {
  const page = await asUser(browser, SARI);
  const r = await page.evaluate(() => fetch("/api/files/upload?name=big.pdf", { method: "POST", credentials: "same-origin", body: new Uint8Array(6 * 1024 * 1024) }).then(x => x.text().then(t => ({ status: x.status, body: t }))));
  expect(r.status).toBe(413);
  expect(r.body).toMatch(/5 MB/);
  await page.close();
});

test("a forged link to a file this server never stored is refused", async ({ browser }) => {
  const page = await asUser(browser, SARI);
  const t = await api(page, "GET", "/api/tasks/" + taskId);
  t.files = (t.files || []).concat([{ id: "fake", name: "fake.pdf", type: "pdf", source: "server", url: "/files/d/" + "a".repeat(64) + ".pdf", size: "1 KB" }]);
  const r = await raw(page, "PUT", "/api/tasks/" + taskId, t);
  expect(r.status).toBe(400);
  expect(r.body).toMatch(/File link/);
  await page.close();
});

test("stored files need a session", async ({ browser, page }) => {
  await signIn(page, ADMIN);
  const url = (await api(page, "GET", "/api/tasks/" + taskId)).files.find(f => /\.pdf$/.test(f.url)).url;
  const anon = await browser.newContext(), p = await anon.newPage();
  const res = await p.request.get(url);
  expect(res.status()).toBe(401);
  await anon.close();
});

test("images are optimised: opaque to a smaller JPEG, transparent to PNG, GIF left alone", async ({ page }) => {
  await signIn(page, ADMIN);
  const out = await page.evaluate(async () => {
    const make = (w, h, paint, mime, q) => new Promise(res => { const c = document.createElement("canvas"); c.width = w; c.height = h; paint(c.getContext("2d"), w, h); c.toBlob(b => res(b), mime, q); });
    /* photo-like: smooth light with sensor-style grain, which PNG stores badly and JPEG well.
       Seeded, so the test sees the same image every run. */
    const noisy = (x, w, h) => { const d = x.createImageData(w, h); let s = 12345; const rnd = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
      for (let y = 0; y < h; y++) for (let c = 0; c < w; c++) { const i = (y * w + c) * 4, n = (rnd() - 0.5) * 40;
        d.data[i] = Math.max(0, Math.min(255, 120 + 100 * Math.sin(c / 180) + n)); d.data[i + 1] = Math.max(0, Math.min(255, 110 + 90 * Math.cos(y / 140) + n)); d.data[i + 2] = Math.max(0, Math.min(255, 140 + 60 * Math.sin((c + y) / 220) + n)); d.data[i + 3] = 255; }
      x.putImageData(d, 0, 0); };
    /* a flat graphic: solid blocks, the kind JPEG makes heavier and blurrier */
    const flat = (x, w, h) => { x.fillStyle = "#EEF0F3"; x.fillRect(0, 0, w, h); x.fillStyle = "#1F4FD8"; x.fillRect(0, 0, w, h / 3); x.fillStyle = "#C6F24E"; x.fillRect(w / 4, h / 2, w / 2, h / 5); x.fillStyle = "#111214"; x.font = "bold 160px sans-serif"; x.fillText("Campaign Q4", 200, h - 200); };
    const opaque = new File([await make(3000, 2000, noisy, "image/png")], "photo.png", { type: "image/png" });
    const banner = new File([await make(3000, 1500, flat, "image/png")], "banner.png", { type: "image/png" });
    const clear = new File([await make(800, 600, (x) => { x.fillStyle = "#1F4FD8"; x.fillRect(100, 100, 300, 200); }, "image/png")], "logo.png", { type: "image/png" });
    const webp = new File([await make(1200, 800, noisy, "image/webp", 0.9)], "shot.webp", { type: "image/webp" });
    /* a real one-frame GIF */
    const gifBytes = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), c => c.charCodeAt(0));
    const gif = new File([gifBytes], "spin.gif", { type: "image/gif" });
    const a = await optimizeImage(opaque, "balanced"), b = await optimizeImage(clear, "balanced"), c = await optimizeImage(webp, "balanced"), d = await optimizeImage(gif, "balanced"), e = await optimizeImage(opaque, "off"), f = await optimizeImage(banner, "balanced");
    return {
      opaque: { changed: a.changed, type: a.file.type, name: a.file.name, w: a.width, before: a.before, after: a.after },
      banner: { type: f.file.type, before: f.before, after: f.after, size: f.file.size },
      clear: { changed: b.changed, type: b.file.type, name: b.file.name },
      webp: { type: c.file.type, name: c.file.name },
      gif: { changed: d.changed, reason: d.reason, type: d.file.type },
      off: { changed: e.changed }
    };
  });
  expect(out.opaque.changed).toBe(true);
  expect(out.opaque.type).toBe("image/jpeg");
  expect(out.opaque.name).toBe("photo.jpg");
  expect(out.opaque.w).toBe(2048);
  expect(out.opaque.after).toBeLessThan(out.opaque.before);
  /* the case that once went wrong: a flat banner must stay PNG and must never grow */
  expect(out.banner.type).toBe("image/png");
  expect(out.banner.size).toBeLessThanOrEqual(out.banner.before);
  expect(out.clear.type).toBe("image/png");          /* JPEG would lose the transparency */
  expect(out.clear.name).toBe("logo.png");
  expect(out.webp.type).toBe("image/jpeg");          /* WebP always becomes PNG or JPEG */
  expect(out.webp.name).toBe("shot.jpg");
  expect(out.gif.changed).toBe(false);               /* a canvas would keep only the first frame */
  expect(out.gif.reason).toBe("animated");
  expect(out.gif.type).toBe("image/gif");
  expect(out.off.changed).toBe(false);
});

test("an optimised image is stored as .jpg, and its version links to that original", async ({ browser }) => {
  const page = await asUser(browser, SARI, "/tasks?task=" + taskId);
  /* a photo-like PNG (smooth light plus grain), which is what JPEG is for */
  const png = await page.evaluate(() => new Promise(res => { const W = 2600, H = 1600, c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d"), d = x.createImageData(W, H); let s = 777; const rnd = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
    for (let y = 0; y < H; y++) for (let k = 0; k < W; k++) { const i = (y * W + k) * 4, n = (rnd() - 0.5) * 40; d.data[i] = Math.max(0, Math.min(255, 130 + 90 * Math.sin(k / 160) + n)); d.data[i + 1] = Math.max(0, Math.min(255, 100 + 80 * Math.cos(y / 120) + n)); d.data[i + 2] = Math.max(0, Math.min(255, 150 + 50 * Math.sin((k + y) / 200) + n)); d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0); c.toBlob(b => b.arrayBuffer().then(a => res(Array.from(new Uint8Array(a)))), "image/png"); }));
  await page.evaluate(id => { S.drawerTask = id; S.drawerTab = "versions"; renderDrawer(); uploadVersion(); }, taskId);
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#modal").getByRole("button", { name: /Choose file/ }).click();
  await (await chooser).setFiles([{ name: "hero.png", mimeType: "image/png", buffer: Buffer.from(png) }]);
  /* the upload starts as soon as the file is chosen; "Add version" is refused until it lands */
  await expect.poll(() => page.evaluate(() => !window._verPending && !!window._verUp), { timeout: 20000 }).toBe(true);
  await page.locator("#modal .btn.primary").click();
  await expect.poll(() => page.evaluate(id => (task(id).versions.slice(-1)[0] || {}).driveUrl || "", taskId), { timeout: 20000 }).toMatch(/^\/files\/d\/[a-f0-9]{64}\.jpg$/);
  const v = await page.evaluate(id => task(id).versions.slice(-1)[0], taskId);
  const bytes = await page.evaluate(u => fetch(u).then(r => r.arrayBuffer()).then(b => b.byteLength), v.driveUrl);
  expect(bytes).toBeLessThan(png.length);
  expect(bytes).toBeLessThanOrEqual(5 * 1024 * 1024);
  await page.close();
});

test("switching back to Drive leaves files already stored here working", async ({ page }) => {
  await signIn(page, ADMIN, "/settings/integrations");
  await page.locator("#stoBody").getByRole("button", { name: "Google Drive", exact: true }).click();
  await expect(page.locator('#stoBody [data-storage="drive"]')).toHaveAttribute("aria-pressed", "true");
  const url = (await api(page, "GET", "/api/tasks/" + taskId)).files.find(f => /\.pdf$/.test(f.url)).url;
  expect(await page.evaluate(u => fetch(u).then(r => r.status), url)).toBe(200);
});

test("the panel is bilingual and does not blink when the language changes", async ({ page }) => {
  await signIn(page, ADMIN, "/settings/integrations");
  await page.locator("#stoBody").getByRole("button", { name: "This server", exact: true }).click();
  await page.evaluate(() => {
    window.__blinks = 0; window.__gone = 0;
    new MutationObserver(() => { const el = document.getElementById("stoBody"); if (!el) window.__gone++; else if (!el.textContent.trim()) window.__blinks++; })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await page.evaluate(() => setLanguage("id"));
  await expect(page.locator("#stoBody")).toContainText("Server ini");
  await expect(page.locator("#stoBody")).toContainText("Optimasi gambar");
  await expect(page.locator("#stoBody").locator("xpath=ancestor::section[1]")).toContainText("Penyimpanan file");
  expect(await page.evaluate(() => window.__blinks)).toBe(0);
  await page.evaluate(() => setLanguage("en"));
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await signIn(page, ADMIN);
    await page.evaluate(() => { const c = cloudOf("gdrive").config; delete c.storage; delete c.imageOptimize; return persistWS(); });
    if (taskId) await page.evaluate(id => apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}), taskId);
    await page.evaluate(() => apiFetch("DELETE", "/api/members/sari").catch(() => {}));
  } catch {} finally { await page.close(); }
});
