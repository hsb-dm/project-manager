/* A Figma file's picture first, Figma's viewer when asked (Oct 2026, src/version-preview.js, server/link-preview.js).
   The test server answers for Figma from e2e/fixtures/figma-stub.js (COS_LINK_FETCH_STUB in e2e/serve.js): a key
   starting "FgPub" or "FgSlow" (1.2 s late) is a public file with a thumbnail, any other is private. The page's own
   requests to Figma (the embed, once asked for) are answered here, so nothing leaves the machine.
   - the thumbnail shows first, in the embed's own height, after a skeleton of its shape, and no Figma frame (nor any
     request to Figma) until Open interactive; the click — or Enter on it — loads the embed, node-id and sandbox kept;
     it stays through a redraw and until the task is closed;
   - Full view and a file's Preview do the same;
   - a private file: the card with the Figma mark, the name from its link, and Open interactive;
   - a link to the whole file: the tip, once, dismissed for good (per person); a frame link: no tip;
   - the connection to Figma is warmed only when a task with a Figma link opens, once;
   - English and Indonesian, and at 390 px. Every task made is deleted; the keys put in localStorage are removed. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
/* keys of their own: the server keeps what Figma said for 6 hours, and the first test needs a file it has not seen */
let seq = 0;
const uniq = () => String(Date.now()).slice(-8) + (seq++);
const slowLink = () => "https://www.figma.com/design/FgSlowKv" + uniq() + "/KV-Ramadan?node-id=1-2";
const SLOW = slowLink();
const PUB = "https://www.figma.com/design/FgPubHero" + uniq() + "/Hero-Banner-Q4";
const PRIV = "https://www.figma.com/design/Priv4te99/Moodboard-Draft?node-id=3-4";
const DRIVE = "https://drive.google.com/drive/folders/1FgNoFigmaFolder";
const SANDBOX = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation allow-downloads";
const made = [];
const figmaAsked = [];

async function signIn(page) {
  page.on("request", r => { if (/^https:\/\/([a-z0-9-]+\.)*figma\.com\//.test(r.url())) figmaAsked.push(r.url()); });
  /* Figma's embed, once asked for: a page of our own, so nothing leaves the machine */
  await page.route(/^https:\/\/([a-z0-9-]+\.)*figma\.com\//, r => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Figma embed</title><p>viewer</p>" }));
  await page.route(/^https:\/\/(drive|docs)\.google\.com\//, r => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>embed</title>" }));
  await page.route("**/api/links/title**", r => r.fulfill({ contentType: "application/json", body: JSON.stringify({ title: "" }) }));
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  await page.evaluate(() => { try { localStorage.removeItem("cos.figmaPreviews"); localStorage.removeItem("cos.figmaTip.off." + ME); } catch (e) {} });
}
const makeTask = (page, title, versions, files) => page.evaluate(([t, v, f]) => apiFetch("POST", "/api/tasks", { title: t, status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME], reviewer: ME, reviewers: [ME], versions: v, files: f || [] }).then(d => { TASKS.push(hTask(d)); return d.id; }), [title, versions, files]);
const version = url => [{ n: 1, state: "pending", color: "#123A6B", note: "", driveUrl: url }];
const openFiles = (page, id) => page.evaluate(t => { openTask(t); S.drawerTab = "files"; renderDrawer(); }, id);
const box = page => page.locator("#drBody .av-version .fg-box");
const figmaFrames = page => page.locator('iframe[src^="https://www.figma.com/"]');

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await page.goto("/"); await page.locator("#au_email").fill(ADMIN.email); await page.locator("#au_pw").fill(ADMIN.pw);
    await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForFunction(() => window.ZC_READY === true && API.on);
    for (const id of made) await page.evaluate(t => apiFetch("DELETE", "/api/tasks/" + t).catch(() => {}), id);
    await page.evaluate(() => { try { localStorage.removeItem("cos.figmaPreviews"); localStorage.removeItem("cos.figmaTip.off." + ME); } catch (e) {} });
  } finally { await page.close(); }
});

test("the thumbnail shows first and Figma's viewer only after Open interactive, which keeps the node-id", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await signIn(page);
  const link = slowLink(), id = await makeTask(page, "Figma slow " + Date.now(), version(link)); made.push(id);
  figmaAsked.length = 0;
  await openFiles(page, id);
  /* at once: the box, in the embed's height, and a skeleton of the picture's shape while the server asks Figma */
  await expect(box(page)).toBeVisible();
  await expect(box(page).locator(".fg-stage[aria-busy] .fg-skel")).toBeVisible();
  expect(Math.round((await box(page).boundingBox()).height)).toBe(340);
  const sk = await box(page).locator(".fg-skel").boundingBox();
  expect(Math.abs(sk.width / sk.height - 800 / 448)).toBeLessThan(0.02);
  /* then the picture, kept on this server; the box did not move */
  const img = box(page).locator(".fg-img");
  await expect(img).toBeVisible({ timeout: 10000 });
  await expect(img).toHaveAttribute("src", /^\/files\/[a-f0-9]{64}\.png$/);
  await expect(img).toHaveAttribute("alt", "KV Ramadan");
  await expect.poll(() => img.evaluate(i => i.complete && i.naturalWidth)).toBe(800);
  await expect(box(page).locator(".fg-skel")).toBeHidden();
  expect(Math.round((await box(page).boundingBox()).height)).toBe(340);
  await expect(box(page).locator(".fg-tname")).toHaveText("KV Ramadan");
  /* no Figma frame, and the page has asked Figma for nothing */
  await expect(figmaFrames(page)).toHaveCount(0);
  expect(figmaAsked, "no request to Figma before the click").toEqual([]);
  /* real buttons, with their names */
  await expect(box(page).getByRole("button", { name: "Open interactive" })).toBeVisible();
  await expect(box(page).getByRole("button", { name: "Open in Figma" })).toBeVisible();
  await expect(box(page).getByRole("button", { name: "Refresh preview" })).toBeVisible();
  /* the click: Figma's embed, the same address as before (node-id kept), the same sandbox, the same height */
  await box(page).getByRole("button", { name: "Open interactive" }).click();
  const frame = page.locator("#drBody .av-version .vp-frame iframe");
  await expect(frame).toHaveAttribute("src", "https://www.figma.com/embed?embed_host=share&url=" + encodeURIComponent(link));
  expect(await frame.getAttribute("src")).toContain("node-id%3D1-2");
  await expect(frame).toHaveAttribute("sandbox", SANDBOX);
  expect(Math.round((await page.locator("#drBody .av-version .vp-frame").boundingBox()).height)).toBe(340);
  await expect(box(page)).toHaveCount(0);
  /* it stays the viewer through a redraw of the panel */
  await page.evaluate(() => renderDrawer());
  await expect(frame).toHaveCount(1);
  await expect(box(page)).toHaveCount(0);
  /* the task closed and opened again: the picture again, drawn at once (no skeleton), and the keyboard opens the viewer */
  await page.evaluate(t => { closeDrawer(); openTask(t); S.drawerTab = "files"; renderDrawer(); }, id);
  await expect(img).toBeVisible();
  await expect(box(page).locator(".fg-skel")).toHaveCount(0);
  await expect(figmaFrames(page)).toHaveCount(0);
  await box(page).getByRole("button", { name: "Open interactive" }).focus();
  await page.keyboard.press("Enter");
  await expect(frame).toHaveCount(1);
  await page.evaluate(() => closeDrawer());
});

test("Full view and a file's Preview show the picture first too", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await signIn(page);
  const id = await makeTask(page, "Figma full " + Date.now(), version(SLOW), [{ id: "f_fg1", name: "KV file", type: "document", source: "link", size: "Link", url: SLOW }]); made.push(id);
  await openFiles(page, id);
  await expect(box(page).locator(".fg-img")).toBeVisible({ timeout: 10000 });
  await page.locator("#drBody .pbar-foot .btn", { hasText: "Full view" }).click();
  const full = page.locator("#modal .fg-box.full");
  await expect(full.locator(".fg-img")).toBeVisible();
  await expect(page.locator("#modal iframe")).toHaveCount(0);
  await full.getByRole("button", { name: "Open interactive" }).click();
  await expect(page.locator("#modal .vp-frame.full iframe")).toHaveAttribute("src", /^https:\/\/www\.figma\.com\/embed\?embed_host=share&url=.*node-id%3D1-2/);
  await page.evaluate(() => closeModal());
  /* the viewer was asked for in this task: the version box shows it too now */
  await page.evaluate(() => renderDrawer());
  await expect(page.locator("#drBody .av-version .vp-frame iframe")).toHaveCount(1);
  /* another task: pictures again; a file's Preview */
  await page.evaluate(() => closeDrawer());
  await openFiles(page, id);
  await page.evaluate(t => previewFile(task(t).files.find(f => f.url.indexOf("figma.com") > 0).id), id);
  await expect(page.locator("#modal .fg-box .fg-img")).toBeVisible();
  await expect(page.locator("#modal iframe")).toHaveCount(0);
  await page.evaluate(() => { closeModal(); closeDrawer(); });
});

test("a private file shows a card with its name, and Open interactive still loads Figma's viewer", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await signIn(page);
  const id = await makeTask(page, "Figma private " + Date.now(), version(PRIV)); made.push(id);
  await openFiles(page, id);
  const card = box(page).locator(".fg-card");
  await expect(card).toBeVisible({ timeout: 10000 });
  await expect(card.locator(".fg-card-name")).toHaveText("Moodboard Draft");
  await expect(card).toContainText("Private file: no static preview");
  await expect(card.locator("svg.brand-ico")).toHaveCount(1);
  await expect(box(page).locator(".fg-img")).toHaveCount(0);
  await expect(figmaFrames(page)).toHaveCount(0);
  expect(Math.round((await box(page).boundingBox()).height)).toBe(340);
  await box(page).getByRole("button", { name: "Open interactive" }).click();
  await expect(page.locator("#drBody .av-version .vp-frame iframe")).toHaveAttribute("src", "https://www.figma.com/embed?embed_host=share&url=" + encodeURIComponent(PRIV));
  /* in Indonesian */
  await page.evaluate(t => { closeDrawer(); setLanguage("id"); }, id);
  await page.waitForFunction(() => UI_LANG === "id");
  try {
    await openFiles(page, id);
    await expect(box(page).locator(".fg-card")).toContainText("File privat: pratinjau statis tidak tersedia");
    await expect(box(page).getByRole("button", { name: "Buka interaktif" })).toBeVisible();
    await expect(box(page).getByRole("button", { name: "Buka di Figma" })).toBeVisible();
    await expect(box(page).getByRole("button", { name: "Muat ulang pratinjau" })).toBeVisible();
  } finally { await page.evaluate(() => { closeDrawer(); setLanguage("en"); }); }
});

test("a link to the whole file gets the tip once; dismissed, it stays away; a frame link gets none", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await signIn(page);
  const whole = await makeTask(page, "Figma whole " + Date.now(), version(PUB), [{ id: "f_fg2", name: "Hero file", type: "document", source: "link", size: "Link", url: PUB }]); made.push(whole);
  const frameOnly = await makeTask(page, "Figma frame " + Date.now(), version(SLOW)); made.push(frameOnly);
  await openFiles(page, frameOnly);
  await expect(box(page)).toBeVisible();
  await expect(page.locator("#drBody .fg-tip")).toHaveCount(0);
  await openFiles(page, whole);
  const tip = page.locator("#drBody .fg-tip");
  await expect(tip, "once, though the link is the version and a file").toHaveCount(1);
  await expect(tip).toHaveText("Tip: in Figma use Copy link to selection to show the exact frame — it loads faster.");
  await expect(page.locator("#drBody .av-version .preview.vp + .fg-tip"), "under the version").toHaveCount(1);
  /* in Indonesian */
  await page.evaluate(() => setLanguage("id")); await page.waitForFunction(() => UI_LANG === "id");
  await page.evaluate(() => renderDrawer());
  await expect(tip).toHaveText("Tips: di Figma gunakan Copy link to selection agar langsung ke frame yang di-review — lebih cepat dimuat.");
  await expect(tip.getByRole("button", { name: "Tutup tips" })).toBeVisible();
  await page.evaluate(() => setLanguage("en")); await page.waitForFunction(() => UI_LANG === "en");
  await page.evaluate(() => renderDrawer());
  /* dismissed by keyboard: gone, through a redraw and a reload */
  await tip.getByRole("button", { name: "Dismiss tip" }).focus();
  await page.keyboard.press("Enter");
  await expect(tip).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("cos.figmaTip.off." + ME))).toBe("1");
  await page.evaluate(() => renderDrawer());
  await expect(tip).toHaveCount(0);
  await page.reload(); await page.waitForFunction(() => window.ZC_READY === true && API.on);
  await openFiles(page, whole);
  await expect(box(page)).toBeVisible();
  await expect(tip).toHaveCount(0);
  await page.evaluate(() => { localStorage.removeItem("cos.figmaTip.off." + ME); closeDrawer(); });
});

test("the connection to Figma is warmed only when a task with a Figma link opens, once", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await signIn(page);
  const plain = await makeTask(page, "No Figma " + Date.now(), version(DRIVE)); made.push(plain);
  const fig = await makeTask(page, "With Figma " + Date.now(), [], [{ id: "f_fg3", name: "Hero file", type: "document", source: "link", size: "Link", url: PUB }]); made.push(fig);
  const hints = () => page.evaluate(() => Array.from(document.querySelectorAll('link[rel="preconnect"]')).filter(l => /figma\.com/.test(l.href)).map(l => l.href.replace(/\/$/, "") + (l.crossOrigin ? " crossorigin" : "")).sort());
  expect(await hints()).toEqual([]);
  await page.evaluate(t => { openTask(t); S.drawerTab = "brief"; renderDrawer(); }, plain);
  await page.evaluate(() => { S.drawerTab = "files"; renderDrawer(); });
  expect(await hints(), "a task without a Figma link").toEqual([]);
  /* a task whose only Figma link is a file, opened on its Brief: warmed as it opens */
  await page.evaluate(t => { closeDrawer(); openTask(t); S.drawerTab = "brief"; renderDrawer(); }, fig);
  expect(await hints()).toEqual(["https://static.figma.com crossorigin", "https://www.figma.com", "https://www.figma.com crossorigin"]);
  await page.evaluate(t => { closeDrawer(); openTask(t); S.drawerTab = "files"; renderDrawer(); closeDrawer(); openTask(t); }, fig);
  expect((await hints()).length, "once").toBe(3);
  await page.evaluate(() => closeDrawer());
});

/* the task panel on a phone keeps its buttons compact, 28-32 px (src/v38.css "The task panel on a phone"); these are its */
test("at 390 px the box keeps the embed's phone height and its buttons fit, the panel's own size", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const id = await makeTask(page, "Figma phone " + Date.now(), version(SLOW)); made.push(id);
  await openFiles(page, id);
  await expect(box(page).locator(".fg-img")).toBeVisible({ timeout: 10000 });
  /* measured once the panel has slid in: the box inside the screen, each button inside the box and at least 28 px */
  const fit = () => page.evaluate(() => {
    const b = document.querySelector("#drBody .av-version .fg-box").getBoundingClientRect(), r = x => x.getBoundingClientRect();
    const btns = Array.from(document.querySelectorAll("#drBody .av-version .fg-bar button")).map(r);
    return { h: Math.round(b.height), inside: b.left >= -1 && b.right <= innerWidth + 1, btns: btns.length, ok: btns.every(x => x.height >= 28 && x.left >= b.left - 1 && x.right <= b.right + 1), img: Math.round(r(document.querySelector("#drBody .av-version .fg-img")).height), wide: document.documentElement.scrollWidth <= innerWidth };
  });
  await expect.poll(fit).toEqual({ h: 280, inside: true, btns: 3, ok: true, img: expect.any(Number), wide: true });
  expect((await fit()).img, "the picture keeps a usable size").toBeGreaterThan(80);
  await box(page).getByRole("button", { name: "Open interactive" }).click();
  expect(Math.round((await page.locator("#drBody .av-version .vp-frame").boundingBox()).height)).toBe(280);
  await page.evaluate(() => closeDrawer());
});
