/* A picture attached to a comment is kept whole, as Assets, versions and a task's Files keep one (src/comment-attach.js
   cmtPicStart, the picture branch of attachToComment in src/drawer.js, the comment paste in src/clipboard.js): it goes
   up through uploadAny, its chip waits in the box with its bar and the picture in it, Post says how far it is, × cancels
   it, and it lands in place while the box is typed in. The comment shows the small preview and opens the original, whose
   Download is the original. A comment made before (a data URL and nothing else) is shown and opened as it always was, and
   with nowhere to keep files a picture is still made small in the browser. The server keeps the shape on every route:
   a comment, a reply, an edit and a project's discussion. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  /* every toast is kept, to be read back however briefly it showed */
  await page.evaluate(() => {
    window.__toasts = [];
    new MutationObserver(rs => rs.forEach(r => r.addedNodes.forEach(n => { if (n.classList && n.classList.contains("toast")) window.__toasts.push({ bad: n.classList.contains("bad"), text: n.textContent }); })))
      .observe(document.getElementById("toasts"), { childList: true });
  });
}
/* the workspace's storage for one test, put back as it was by the function it returns */
async function storage(page, set) {
  await page.evaluate(s => {
    const c = cloudOf("gdrive"); c.config = c.config || {};
    window.__sto = { storage: c.config.storage, imageOptimize: c.config.imageOptimize, clientId: c.config.clientId, shared: c.shared };
    Object.keys(s.config || {}).forEach(k => { if (s.config[k] === null) delete c.config[k]; else c.config[k] = s.config[k]; });
    if ("shared" in s) c.shared = s.shared;
    return s.persist ? persistWS() : null;
  }, set);
  return () => page.evaluate(persist => {
    const c = cloudOf("gdrive"), was = window.__sto; if (!was) return;
    ["storage", "imageOptimize", "clientId"].forEach(k => { if (was[k] === undefined) delete c.config[k]; else c.config[k] = was[k]; });
    c.shared = was.shared; window.__sto = null;
    return persist ? persistWS() : null;
  }, !!set.persist).catch(() => {});
}
const SERVER = { config: { storage: "server", imageOptimize: "off" }, persist: true };
const toasts = page => page.evaluate(() => window.__toasts.slice());
const redToasts = async page => (await toasts(page)).filter(t => t.bad);
/* the bytes leave slowly (CDP), so the chip can be seen on its way; chromium only */
async function throttle(page, bps) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 20, downloadThroughput: 8e6, uploadThroughput: bps });
  return async () => { await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }).catch(() => {}); };
}
/* a large picture, made here: a gradient with a patch of noise, so it weighs something and a small copy is not it */
const picture = (page, w, h, mime) => page.evaluate(async ([w, h, t]) => {
  const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#0F766E"); g.addColorStop(1, "#F59E0B"); x.fillStyle = g; x.fillRect(0, 0, w, h);
  const n = x.createImageData(240, 240); for (let i = 0; i < n.data.length; i += 4) { n.data[i] = Math.random() * 255 | 0; n.data[i + 1] = Math.random() * 255 | 0; n.data[i + 2] = Math.random() * 255 | 0; n.data[i + 3] = 255; }
  x.putImageData(n, 40, 40);
  const b = await new Promise(r => c.toBlob(r, t || "image/png", 0.95)), u = new Uint8Array(await b.arrayBuffer()); let s = "";
  for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768));
  return btoa(s);
}, [w, h, mime]).then(b => Buffer.from(b, "base64"));
/* a picture pasted into a box, as Ctrl+V hands it over */
const paste = (page, sel, name, w, h) => page.evaluate(async ([s, n, w, h]) => {
  const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.fillStyle = "#1F4FD8"; x.fillRect(0, 0, w, h);
  const im = x.createImageData(200, 200); for (let i = 0; i < im.data.length; i += 4) { im.data[i] = Math.random() * 255 | 0; im.data[i + 1] = 90; im.data[i + 2] = Math.random() * 255 | 0; im.data[i + 3] = 255; } x.putImageData(im, 10, 10);
  const blob = await new Promise(r => c.toBlob(r, "image/png")), dt = new DataTransfer(); dt.items.add(new File([blob], n, { type: "image/png" }));
  const el = document.querySelector(s); el.focus(); el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
}, [sel, name, w, h]);
/* any other file pasted the same way (copied in Explorer or Finder) */
const pasteFile = (page, sel, name, type, bytes) => page.evaluate(([s, n, t, b]) => {
  const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(b).fill(7)], n, { type: t }));
  const el = document.querySelector(s); el.focus(); el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
}, [sel, name, type, bytes]);
/* a picture's size, from its address (the stored original, a preview) */
const dims = (page, url) => page.evaluate(u => fetch(u, { credentials: "same-origin" }).then(r => r.blob()).then(b => createImageBitmap(b).then(i => ({ w: i.width, h: i.height, bytes: b.size, type: b.type }))), url);
async function newTask(page, title) {
  return page.evaluate(async t => { const d = await apiFetch("POST", "/api/tasks", { title: t + " " + Date.now(), status: WS.workflow[0].id, prio: "medium" }); const tk = hTask(d); TASKS.push(tk); return tk.id; }, title);
}
const openComments = (page, id) => page.evaluate(i => { window._cmtDraft = ""; window._cmtAtt = []; openTask(i); S.drawerTab = "comments"; S.commentVis = "internal"; renderDrawer(); }, id);
const dropTask = (page, id) => page.evaluate(i => { window._cmtDraft = ""; window._cmtAtt = []; closeModal(); closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id).catch(() => {});
const saved = (page, id) => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(t => t.comments), id);

test.beforeEach(({ browserName }) => { test.skip(browserName !== "chromium", "CDP throttling is chromium only"); });

test("Upload images: the picture goes up whole with its bar, lands in place while typing goes on, and the comment opens the original", async ({ page }) => {
  await signIn(page);
  const put = await storage(page, SERVER);
  const id = await newTask(page, "Comment poster");
  const png = await picture(page, 2400, 1600);
  const unthrottle = await throttle(page, 40000);
  try {
    await openComments(page, id);
    const box = page.locator("#cmtText");
    await box.click(); await page.keyboard.type("Poster ");
    const chooser = page.waitForEvent("filechooser");
    await page.evaluate(() => cmtUpload(true));
    await (await chooser).setFiles({ name: "Poster A2.png", mimeType: "image/png", buffer: png });
    /* on its way: its chip, its bar, how far, the picture itself in it, small */
    const chip = page.locator("#drawer .composer .att-up", { hasText: "Poster A2.png" });
    await expect(chip).toBeVisible();
    await expect(chip.locator(".upbar")).toBeVisible();
    await expect(chip.locator(".up-pct")).toHaveText(/^\d+%$/);
    await expect(chip.locator("img.up-chip-pic")).toHaveAttribute("src", /^blob:/);
    const pic = await chip.locator("img.up-chip-pic").boundingBox();
    expect([pic.width, pic.height]).toEqual([26, 26]);
    await expect.poll(() => chip.locator("img.up-chip-pic").evaluate(i => i.complete && i.naturalWidth)).toBe(2400);
    expect(await page.evaluate(() => { const r = UPLOADS[UPLOADS.length - 1]; return [r.name, r.dest]; })).toEqual(["Poster A2.png", "server"]);
    /* typing goes on; Post and Enter wait, saying how far it is */
    await box.click(); await page.keyboard.press("End"); await page.keyboard.type("for print");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await toasts(page)).map(t => t.text).join("|")).toMatch(/Still uploading — \d+%/);
    await page.locator("#drawer .composer .bar .btn.primary").click();
    expect(await page.evaluate(i => task(i).comments.length, id)).toBe(0);
    await expect(box).toHaveValue("Poster for print");
    await box.click(); await page.keyboard.press("End");
    await page.evaluate(() => { window.__ta = document.getElementById("cmtText"); });
    const tall = await page.locator("#drawer .composer").evaluate(b => b.getBoundingClientRect().height);
    const at = await chip.locator("img.up-chip-pic").evaluate(i => { const r = i.getBoundingClientRect(); return [r.left, r.top]; });
    await unthrottle();
    /* landed: the picture's own chip, in place — the same box, its focus and what was typed; neither the box nor the picture moves */
    await expect(page.locator("#drawer .composer .att-img")).toBeVisible({ timeout: 30000 });
    await expect(page.locator("#drawer .composer .att-up")).toHaveCount(0);
    expect(Math.abs(await page.locator("#drawer .composer").evaluate(b => b.getBoundingClientRect().height) - tall)).toBeLessThanOrEqual(1);
    const now = await page.locator("#drawer .composer .att-img img").evaluate(i => { const r = i.getBoundingClientRect(); return [r.left, r.top]; });
    expect(Math.abs(now[0] - at[0])).toBeLessThanOrEqual(1); expect(Math.abs(now[1] - at[1])).toBeLessThanOrEqual(1);
    await expect(page.locator("#drawer .composer .att-img img")).toHaveAttribute("src", /^data:image\//);
    expect(await page.evaluate(() => window.__ta === document.getElementById("cmtText") && document.activeElement === window.__ta)).toBe(true);
    await page.keyboard.type("!");
    await expect(box).toHaveValue("Poster for print!");
    /* the picture held for the chip is let go */
    expect(await page.evaluate(() => Object.keys(CMT_UP_THUMB).length)).toBe(0);
    await page.keyboard.press("Enter");
    await expect.poll(() => saved(page, id).then(c => c.length)).toBe(1);
    const att = (await saved(page, id))[0].attachments[0];
    expect(att).toMatchObject({ name: "Poster A2.png", type: "image", source: "server" });
    expect(att.url).toMatch(/^\/files\/d\/[a-f0-9]{64}\.png$/);
    expect(att.preview).toMatch(/^(\/files\/|data:image\/)/);
    expect(att.pending).toBeUndefined(); expect(att.upId).toBeUndefined();
    /* kept whole: the stored file is the very file chosen, every pixel of it; the preview is the small copy */
    const orig = await dims(page, att.url);
    expect(orig).toMatchObject({ w: 2400, h: 1600, bytes: png.length });
    const prev = await dims(page, att.preview);
    expect(Math.max(prev.w, prev.h)).toBeLessThanOrEqual(640);
    /* the comment shows the light preview inline, and a click opens the original */
    const shown = page.locator("#drawer .cmts .cmt .cmt-images .cmt-img");
    await expect(shown).toHaveCount(1);
    await expect.poll(() => shown.locator("img").getAttribute("src")).toBe(att.preview);
    await shown.click();
    await expect(page.locator("#modal img").first()).toHaveAttribute("src", att.url);
    await expect.poll(() => page.locator("#modal img").first().evaluate(i => i.complete && i.naturalWidth)).toBe(2400);
    /* Download is the original, by its name */
    const dl = page.waitForEvent("download");
    await page.locator("#modal").getByRole("button", { name: "Download" }).click();
    const file = await dl;
    expect(file.suggestedFilename()).toBe("Poster A2.png");
    expect(require("fs").statSync(await file.path()).size).toBe(png.length);
    await page.evaluate(() => closeModal());
    /* filed under Assets & versions as the picture it is, the original and its preview */
    const filed = await page.evaluate(i => task(i).files.map(f => ({ name: f.name, type: f.type, url: f.url, preview: !!f.preview })), id);
    expect(filed).toEqual([{ name: "Poster A2.png", type: "image", url: att.url, preview: true }]);
    expect(await redToasts(page)).toEqual([]);
  } finally {
    await unthrottle(); await put(); await dropTask(page, id);
  }
});

test("× on a picture on its way cancels it: the chip goes, nothing is attached and nothing says so in red", async ({ page }) => {
  await signIn(page);
  const put = await storage(page, SERVER);
  const id = await newTask(page, "Comment cancel");
  const png = await picture(page, 1800, 1200);
  const unthrottle = await throttle(page, 30000);
  try {
    await openComments(page, id);
    await page.locator("#cmtText").click(); await page.keyboard.type("Not this one");
    const chooser = page.waitForEvent("filechooser");
    await page.evaluate(() => cmtUpload(true));
    await (await chooser).setFiles({ name: "Draft.png", mimeType: "image/png", buffer: png });
    const chip = page.locator("#drawer .composer .att-up", { hasText: "Draft.png" });
    await expect(chip.locator("img.up-chip-pic")).toBeVisible();
    const upId = await chip.getAttribute("data-cmt-up");
    await chip.getByRole("button", { name: /Cancel this upload/ }).click();
    await expect(chip).toHaveCount(0);
    await expect.poll(() => page.evaluate(u => uploadById(u).stage, upId)).toBe("cancelled");
    await expect.poll(() => page.evaluate(() => Object.keys(CMT_UP_THUMB).length)).toBe(0);
    expect(await page.evaluate(() => (window._cmtAtt || []).length)).toBe(0);
    await expect(page.locator("#cmtText")).toHaveValue("Not this one");
    expect(await redToasts(page)).toEqual([]);
  } finally {
    await unthrottle(); await put(); await dropTask(page, id);
  }
});

test("pasted, through the paperclip, in a reply and in an edit: each picture goes up whole and the server keeps it", async ({ page }) => {
  await signIn(page);
  const put = await storage(page, SERVER);
  const id = await newTask(page, "Comment paste");
  try {
    await openComments(page, id);
    const box = page.locator("#cmtText");
    /* pasted: uploaded whole with its bar, not made 560 px */
    await box.click(); await page.keyboard.type("Screenshot");
    const n = await page.evaluate(() => UPLOADS.length);
    await paste(page, "#cmtText", "Shot 1.png", 1400, 900);
    await expect(page.locator("#drawer .composer .att-img")).toBeVisible({ timeout: 20000 });
    expect(await page.evaluate(() => UPLOADS.length)).toBe(n + 1);
    await expect(box).toBeFocused();
    await expect(box).toHaveValue("Screenshot");
    /* the paperclip, beside it */
    let chooser = page.waitForEvent("filechooser");
    await page.evaluate(() => attachToComment());
    await (await chooser).setFiles({ name: "Clip.png", mimeType: "image/png", buffer: await picture(page, 1300, 700) });
    await expect(page.locator("#drawer .composer .att-img")).toHaveCount(2, { timeout: 20000 });
    /* a file that is not a picture, pasted: it goes up as Upload file sends it, its chip a file's */
    await pasteFile(page, "#cmtText", "Spec sheet.pdf", "application/pdf", 3000);
    await expect(page.locator("#drawer .composer .att-chip", { hasText: "Spec sheet.pdf" })).toBeVisible({ timeout: 20000 });
    await expect(page.locator("#drawer .composer .att-up")).toHaveCount(0, { timeout: 20000 });
    await box.click(); await page.keyboard.press("Enter");
    await expect.poll(() => saved(page, id).then(c => c.length)).toBe(1);
    let c0 = (await saved(page, id))[0];
    expect(c0.attachments.map(a => [a.name, /^\/files\/d\//.test(a.url), !!a.preview])).toEqual([["Shot 1.png", true, true], ["Clip.png", true, true], ["Spec sheet.pdf", true, false]]);
    expect((await dims(page, c0.attachments[0].url)).w).toBe(1400);
    expect((await dims(page, c0.attachments[1].url)).w).toBe(1300);
    /* a reply: a picture pasted into its box goes with it */
    await page.locator('#drawer .cmt[data-cid="' + c0.id + '"] .cmt-reply-btn').click();
    const reply = page.locator("#cmtReplyText");
    await expect(reply).toBeFocused();
    await page.keyboard.type("Here is the crop");
    await paste(page, "#cmtReplyText", "Crop.png", 1200, 1200);
    await expect(page.locator("#drawer .cmt-reply-box .att-img")).toBeVisible({ timeout: 20000 });
    await expect(reply).toHaveValue("Here is the crop");
    await reply.press("Enter");
    await expect.poll(() => saved(page, id).then(c => c.length)).toBe(2);
    const r = (await saved(page, id)).find(x => x.parent === c0.id);
    expect(r.attachments.map(a => [a.name, /^\/files\/d\//.test(a.url)])).toEqual([["Crop.png", true]]);
    expect((await dims(page, r.attachments[0].url)).w).toBe(1200);
    /* an edit: a picture added to the first comment, saved through the comment's own route */
    await page.evaluate(c => cmtEditStart(c), c0.id);
    await expect(page.locator("#drawer .cmt-edit-box")).toBeVisible();
    chooser = page.waitForEvent("filechooser");
    await page.evaluate(() => cmtUpload(true));
    await (await chooser).setFiles({ name: "Added later.png", mimeType: "image/png", buffer: await picture(page, 1000, 1000) });
    await expect(page.locator("#drawer .cmt-edit-box .att-img")).toHaveCount(3, { timeout: 20000 });
    await page.locator("#drawer .cmt-edit-box .bar .btn.primary").click();
    await expect.poll(() => saved(page, id).then(c => (c.find(x => x.id === c0.id).attachments || []).length)).toBe(4);
    c0 = (await saved(page, id)).find(x => x.id === c0.id);
    expect(c0.attachments[3]).toMatchObject({ name: "Added later.png", type: "image" });
    expect(c0.attachments[3].url).toMatch(/^\/files\/d\//);
    expect(c0.editedAt).toBeTruthy();
    /* every one is drawn as its preview, and opens its original */
    const pics = page.locator("#drawer .cmts .cmt-img");
    await expect(pics).toHaveCount(4);
    for (let i = 0; i < 4; i++) expect(await pics.nth(i).getAttribute("onclick")).toMatch(/^cmtPicOpen\(/);
    expect(await redToasts(page)).toEqual([]);
  } finally {
    await put(); await dropTask(page, id);
  }
});

test("the workspace's image optimisation applies: a large WebP is stored at its preset, under the name of the file kept", async ({ page }) => {
  await signIn(page);
  const put = await storage(page, { config: { storage: "server", imageOptimize: "balanced" }, persist: true });
  const id = await newTask(page, "Comment optimise");
  try {
    await openComments(page, id);
    const chooser = page.waitForEvent("filechooser");
    await page.evaluate(() => cmtUpload(true));
    await (await chooser).setFiles({ name: "Moodboard.webp", mimeType: "image/webp", buffer: await picture(page, 3000, 2000, "image/webp") });
    await expect(page.locator("#drawer .composer .att-img")).toBeVisible({ timeout: 30000 });
    await page.locator("#cmtText").click(); await page.keyboard.press("Enter");
    await expect.poll(() => saved(page, id).then(c => c.length)).toBe(1);
    const att = (await saved(page, id))[0].attachments[0];
    /* Balanced: at most 2048 px, as PNG or JPEG; the name says what the stored file is, so its download is what it says */
    const ext = (att.url.match(/\.(png|jpg)$/) || [])[1];
    expect(ext).toBeTruthy();
    expect(att.name).toBe("Moodboard." + ext);
    const d = await dims(page, att.url);
    expect([d.w, d.h]).toEqual([2048, 1365]);
  } finally {
    await put(); await dropTask(page, id);
  }
});

test("Google Drive through the shared account: the picture goes to Drive, opens in Drive's viewer, and Download is Drive's original", async ({ page }) => {
  await signIn(page);
  await page.route(/^https:\/\/(drive|docs)\.google\.com\//, r => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>viewer</title>" }));
  let sent = null;
  await page.route("**/api/cloud/gdrive/upload*", async route => { sent = { url: route.request().url(), bytes: (route.request().postDataBuffer() || Buffer.alloc(0)).length }; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ driveId: "d-cmt-pic-1", url: "https://drive.google.com/file/d/d-cmt-pic-1/view", size: "0.3 MB" }) }); });
  const put = await storage(page, { config: { storage: "drive" }, shared: true });
  const id = await newTask(page, "Comment Drive");
  const png = await picture(page, 2200, 1400);
  try {
    await openComments(page, id);
    const chooser = page.waitForEvent("filechooser");
    await page.evaluate(() => cmtUpload(true));
    await (await chooser).setFiles({ name: "Key visual.png", mimeType: "image/png", buffer: png });
    await expect(page.locator("#drawer .composer .att-img")).toBeVisible({ timeout: 20000 });
    /* the file itself went, as it is */
    expect(sent.bytes).toBe(png.length);
    expect(new URL(sent.url).searchParams.get("name")).toBe("Key visual.png");
    await page.locator("#cmtText").click(); await page.keyboard.type("For the hero"); await page.keyboard.press("Enter");
    await expect.poll(() => saved(page, id).then(c => c.length)).toBe(1);
    const att = (await saved(page, id))[0].attachments[0];
    expect(att).toMatchObject({ name: "Key visual.png", type: "image", source: "gdrive", driveId: "d-cmt-pic-1", url: "https://drive.google.com/file/d/d-cmt-pic-1/view" });
    expect(Math.max(...Object.values(await dims(page, att.preview)).slice(0, 2))).toBeLessThanOrEqual(640);
    /* opened: Drive's viewer, not the small copy */
    await page.locator("#drawer .cmts .cmt-img").click();
    await expect(page.locator("#modal iframe")).toHaveAttribute("src", "https://drive.google.com/file/d/d-cmt-pic-1/preview");
    await expect(page.locator("#modal").getByRole("button", { name: /Open in Google Drive/ })).toBeVisible();
    await page.evaluate(() => { window.__opened = []; window.open = u => { window.__opened.push(u); return null; }; });
    await page.locator("#modal").getByRole("button", { name: "Download" }).click();
    expect(await page.evaluate(() => window.__opened)).toEqual(["https://drive.google.com/uc?export=download&id=d-cmt-pic-1"]);
    await page.evaluate(() => closeModal());
    /* filed under Assets & versions as a picture, as Upload images in Files files one */
    expect(await page.evaluate(i => task(i).files.map(f => [f.type, f.source, f.driveId]), id)).toEqual([["image", "gdrive", "d-cmt-pic-1"]]);
    expect(await redToasts(page)).toEqual([]);
  } finally {
    await page.unroute("**/api/cloud/gdrive/upload*");
    await put(); await dropTask(page, id);
  }
});

test("with nowhere to keep files, a picture is made small here as before; a comment made before is drawn and opened as before", async ({ page }) => {
  await signIn(page);
  /* no storage: no server storage chosen, no Drive client, no shared account (this page only) */
  const put = await storage(page, { config: { storage: null, clientId: null }, shared: false });
  const id = await newTask(page, "Comment no storage");
  try {
    expect(await page.evaluate(() => [storageMode(), storageKeepsFiles()])).toEqual(["legacy", false]);
    await openComments(page, id);
    const n = await page.evaluate(() => UPLOADS.length);
    const chooser = page.waitForEvent("filechooser");
    await page.evaluate(() => cmtUpload(true));
    await (await chooser).setFiles({ name: "Local.png", mimeType: "image/png", buffer: await picture(page, 2400, 1600) });
    await expect(page.locator("#drawer .composer .att-img")).toBeVisible();
    await page.locator("#cmtText").click();
    await paste(page, "#cmtText", "Pasted.png", 1400, 900);
    await expect(page.locator("#drawer .composer .att-img")).toHaveCount(2);
    expect(await page.evaluate(() => UPLOADS.length)).toBe(n);
    await expect(page.locator("#drawer .composer .att-up")).toHaveCount(0);
    const staged = await page.evaluate(() => window._cmtAtt.map(a => ({ name: a.name, url: a.url || "", data: /^data:image\//.test(a.preview || "") })));
    expect(staged).toEqual([{ name: "Local.png", url: "", data: true }, { name: "Pasted.png", url: "", data: true }]);
    /* made small as before: 1600 px chosen, 560 px pasted */
    const sizes = await page.evaluate(() => Promise.all(window._cmtAtt.map(a => new Promise(r => { const i = new Image(); i.onload = () => r(Math.max(i.naturalWidth, i.naturalHeight)); i.onerror = () => r(0); i.src = a.preview; }))));
    expect(sizes).toEqual([1600, 560]);
    await page.locator("#cmtText").press("Enter");
    await expect.poll(() => saved(page, id).then(c => c.length)).toBe(1);
    const atts = (await saved(page, id))[0].attachments;
    expect(atts.every(a => !a.url && !a.driveId && a.preview)).toBe(true);
    /* drawn as before: its preview, opened as itself */
    const pics = page.locator("#drawer .cmts .cmt-img");
    await expect(pics).toHaveCount(2);
    expect(await pics.first().getAttribute("onclick")).toMatch(/^previewModal\(/);
    await pics.first().click();
    await expect.poll(() => page.locator("#modal img").first().getAttribute("src")).toBe(atts[0].preview);
    await page.evaluate(() => closeModal());
    /* a comment made before, beside one kept whole: one row of pictures, each opened its own way */
    await page.evaluate(i => { const tk = task(i); tk.comments.push(Object.assign(C(ME, 0, "internal", "Both kinds"), { attachments: [{ name: "old.png", type: "image", preview: tk.comments[0].attachments[0].preview }, { name: "kept.png", type: "image", preview: tk.comments[0].attachments[1].preview, url: "/files/d/" + "a".repeat(64) + ".png", driveId: null }] })); renderDrawer(); }, id);
    const both = page.locator("#drawer .cmt", { hasText: "Both kinds" });
    await expect(both.locator(".cmt-images")).toHaveCount(1);
    await expect(both.locator(".cmt-img")).toHaveCount(2);
    expect(await both.locator(".cmt-img").nth(0).getAttribute("onclick")).toMatch(/^previewModal\(/);
    expect(await both.locator(".cmt-img").nth(1).getAttribute("onclick")).toMatch(/^cmtPicOpen\(/);
    expect(await redToasts(page)).toEqual([]);
  } finally {
    await put(); await dropTask(page, id);
  }
});

test("the server keeps a kept picture's shape on a comment, a reply, an edit and a project's discussion", async ({ page }) => {
  await signIn(page);
  const put = await storage(page, SERVER);
  const id = await newTask(page, "Comment shape");
  const pid = await page.evaluate(async () => { const id = "pd_" + Math.random().toString(36).slice(2, 9); await apiFetch("POST", "/api/projects", { id, name: "Picture discussion", status: "active", owner: ME, teams: [] }); await reloadAll(); return id; });
  try {
    /* a stored original and a Drive one, each with its small preview, as uploadAny hands them back */
    const shapes = await page.evaluate(async () => {
      const c = document.createElement("canvas"); c.width = 64; c.height = 40; c.getContext("2d").fillRect(0, 0, 64, 40);
      const preview = c.toDataURL("image/png"), blob = await new Promise(r => c.toBlob(r, "image/png"));
      const up = await uploadAny(new File([blob], "Stored.png", { type: "image/png" }), { forceDrive: true });
      return { stored: { name: "Stored.png", type: "image", size: up.size, url: up.url, driveId: null, preview, source: "server" }, drive: { name: "Drive.png", type: "image", size: "0.2 MB", url: "https://drive.google.com/file/d/d-shape-1/view", driveId: "d-shape-1", preview, source: "gdrive" } };
    });
    expect(shapes.stored.url).toMatch(/^\/files\/d\//);
    const kept = (a, b) => { expect(a).toMatchObject({ name: b.name, type: "image", url: b.url, driveId: b.driveId, source: b.source }); expect(a.preview).toMatch(/^\/files\/[a-f0-9]{64}\.png$/); };
    /* a comment, on the route someone who may comment but not edit the task uses */
    const t1 = await page.evaluate(([i, s]) => apiFetch("POST", "/api/tasks/" + i + "/comments", { id: "cm_pic_a", text: "Two pictures", vis: "internal", attachments: [s.stored, s.drive] }), [id, shapes]);
    const c1 = t1.comments.find(c => c.id === "cm_pic_a");
    kept(c1.attachments[0], shapes.stored); kept(c1.attachments[1], shapes.drive);
    /* a reply to it */
    const t2 = await page.evaluate(([i, s]) => apiFetch("POST", "/api/tasks/" + i + "/comments", { id: "cm_pic_b", text: "And one more", vis: "internal", parent: "cm_pic_a", attachments: [s.drive] }), [id, shapes]);
    const c2 = t2.comments.find(c => c.id === "cm_pic_b");
    expect(c2.parent).toBe("cm_pic_a"); kept(c2.attachments[0], shapes.drive);
    /* an edit that takes one off and keeps the other */
    const t3 = await page.evaluate(([i, a]) => apiFetch("PUT", "/api/tasks/" + i + "/comments/cm_pic_a", { text: "One picture", attachments: [a] }), [id, c1.attachments[1]]);
    const c3 = t3.comments.find(c => c.id === "cm_pic_a");
    expect(c3.attachments.length).toBe(1); kept(c3.attachments[0], shapes.drive);
    /* and read back */
    const back = await saved(page, id);
    kept(back.find(c => c.id === "cm_pic_b").attachments[0], shapes.drive);
    /* a project's discussion: its own routes, posted and edited */
    const p1 = await page.evaluate(([p, s]) => apiFetch("POST", "/api/projects/" + p + "/comments", { id: "pc_pic_a", text: "Kickoff boards", vis: "internal", attachments: [s.stored, s.drive] }), [pid, shapes]);
    kept(p1.comment.attachments[0], shapes.stored); kept(p1.comment.attachments[1], shapes.drive);
    const p2 = await page.evaluate(([p, a]) => apiFetch("PUT", "/api/projects/" + p + "/comments/pc_pic_a", { text: "Kickoff board", attachments: [a] }), [pid, p1.comment.attachments[0]]);
    expect(p2.comment.attachments.length).toBe(1); kept(p2.comment.attachments[0], shapes.stored);
    /* and through the page: a picture chosen in the discussion's own box */
    await page.evaluate(i => { S.projectTab = "discussion"; go("projects", i); }, pid);
    const box = page.locator("#pdText");
    await expect(box).toBeVisible();
    await box.click(); await page.keyboard.type("Moodboard");
    const chooser = page.waitForEvent("filechooser");
    await page.evaluate(() => cmtUpload(true));
    await (await chooser).setFiles({ name: "Board.png", mimeType: "image/png", buffer: await picture(page, 1600, 1000) });
    await expect(page.locator(".pd-box .composer .att-img")).toBeVisible({ timeout: 20000 });
    await box.click(); await page.keyboard.press("End"); await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(p => apiFetch("GET", "/api/projects/" + p + "/comments?limit=20").then(d => (d.comments || []).filter(c => c.text === "Moodboard").map(c => c.attachments.map(a => [a.name, a.url.slice(0, 9)]))), pid)).toEqual([[["Board.png", "/files/d/"]]]);
    const pic = page.locator(".pd-box .cmt", { hasText: "Moodboard" }).locator(".cmt-img");
    await expect(pic).toHaveCount(1);
    await pic.click();
    await expect(page.locator("#modal img").first()).toHaveAttribute("src", /^\/files\/d\//);
    await page.evaluate(() => closeModal());
    expect(await redToasts(page)).toEqual([]);
  } finally {
    await put(); await dropTask(page, id);
    await page.evaluate(i => apiFetch("DELETE", "/api/projects/" + i).catch(() => {}), pid).catch(() => {});
  }
});
