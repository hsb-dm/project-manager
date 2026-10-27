/* The upload tray (src/upload-tray.js): every upload in the app in one small panel, bottom left on a computer and
   above the tab bar on a phone. It follows the bytes without redrawing a row, counts what is going, done and
   failed in its header, cancels, folds, closes itself once all went well and stays when something failed; it keeps
   clear of a dialog's Save, the task panel's foot and the chat's box, speaks Indonesian, asks before the page is
   left mid-upload, and shows the custom emoji's upload too. Uploads go to "This server" unless said otherwise. */
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
  /* this page only, as e2e/storage.spec.js does; put back in finally */
  await page.evaluate(() => { const c = cloudOf("gdrive"); c.config = c.config || {}; window._trayWas = { storage: c.config.storage, shared: c.shared }; c.config.storage = "server"; UPT_HIDE_MS = 700; });
}
const restore = page => page.evaluate(() => { const c = cloudOf("gdrive"), w = window._trayWas || {}; c.config.storage = w.storage; c.shared = w.shared; UPT_HIDE_MS = 4000; if (UI_LANG !== "en") setLanguage("en"); }).catch(() => {});
/* starts an upload in the page; its promise is kept as window._up[name], settled either way */
const start = (page, name, bytes, type) => page.evaluate(([n, b, t]) => {
  window._up = window._up || {};
  const p = uploadAny(new File([new Uint8Array(b)], n, { type: t || "application/pdf" }), { forceDrive: true });
  window._up[n] = p.then(() => "done", e => (e && e.cancelled ? "cancelled" : "failed: " + (e && e.message)));
  return p.upload.id;
}, [name, bytes || 2000, type]);
/* holds every upload to this server until released */
async function hold(page, pattern) {
  let release; const gate = new Promise(r => { release = r; });
  await page.route(pattern || "**/api/files/upload*", async route => { await gate; await route.continue().catch(() => {}); });
  return () => release();
}
const tray = page => page.locator("#upTray");
const row = (page, name) => page.locator("#upTray .uptray-row", { has: page.locator(".uptray-name", { hasText: name }) });
const box = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);
/* the tray has finished sliding in */
const settled = page => page.evaluate(() => Promise.all(document.getElementById("upTray").getAnimations().map(a => a.finished.catch(() => {}))));
const overlap = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
/* what is drawn at the middle of a box belongs to it */
const onTop = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && e.contains(hit); }, sel);

test("an upload to this server: the tray appears, follows the bytes in place, and closes itself once done", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "throttles the upload through the DevTools protocol");
  await signIn(page);
  await page.evaluate(() => { UPT_HIDE_MS = 2500; });   /* long enough to look at it done */
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 20, downloadThroughput: 4e6, uploadThroughput: 160000 });
    await expect(tray(page)).toHaveCount(0);   /* nothing is made before the first upload */
    await start(page, "Campaign brief Q4.pdf", 480000);
    await expect(tray(page)).toBeVisible();
    await expect(page.locator("#upTray .uptray-title")).toHaveText("Uploading 1 file");
    await expect(page.locator("#upTray .uptray-title")).toHaveAttribute("role", "status");
    await expect(page.locator("#upTray .uptray-title")).toHaveAttribute("aria-live", "polite");
    const r = row(page, "Campaign brief Q4.pdf");
    await expect(r.locator(".uptray-meta")).toContainText("to this server");
    await expect(r.locator(".ficon")).toHaveText("pdf");
    await expect(r.getByRole("button", { name: "Cancel upload: Campaign brief Q4.pdf" })).toBeVisible();
    /* from here on, nothing in the tray may be built again: only words, the bar's width and the mark at the end */
    await page.evaluate(() => {
      const t = document.getElementById("upTray"); t.querySelector(".uptray-row").dataset.probe = "1";
      window._trayRebuilt = 0; window._titleChanges = 0; window._pcts = new Set(); window._steps = [];
      const ok = n => n && n.closest && n.closest(".uptray-end,.uptray-pct,[data-upload-text],.uptray-dest,.uptray-note,.uptray-title");
      new MutationObserver(ms => ms.forEach(m => { if (m.type === "childList" && !ok(m.target)) window._trayRebuilt++; })).observe(t, { childList: true, subtree: true });
      new MutationObserver(() => { window._titleChanges++; }).observe(t.querySelector(".uptray-title"), { childList: true, characterData: true, subtree: true });
      document.addEventListener("zc-upload", e => { const x = t.querySelector("[data-upload-text]"); const m = x && /^(\d+)%/.exec(x.textContent); if (m) window._pcts.add(+m[1]); window._steps.push([e.detail.stage, x.textContent, t.querySelector(".uptray-end").getAttribute("data-mark")]); });
    });
    await expect(r.locator("[data-upload-text]")).toHaveText(/^\d+% · .+ of .+$/);
    await expect(page.locator("#upTray .uptray-title")).toHaveText("1 upload complete", { timeout: 20000 });
    await expect(r.getByRole("img", { name: "Uploaded" })).toBeVisible();
    await expect(r.locator("[data-upload-text]")).toHaveText("Uploaded");
    const seen = await page.evaluate(() => ({ rebuilt: window._trayRebuilt, titles: window._titleChanges, pcts: [...window._pcts], steps: window._steps, same: !!document.querySelector('#upTray .uptray-row[data-probe="1"]') }));
    expect(seen.same, "the row is the one drawn at the start").toBe(true);
    expect(seen.rebuilt, "nothing but words and marks changed").toBe(0);
    expect(seen.pcts.filter(p => p > 0 && p < 100).length, "the bar moved in steps: " + seen.pcts).toBeGreaterThan(1);
    expect(seen.titles, "the live header changed once, not per byte").toBe(1);
    /* every byte sent, the server still keeping it: no × any more, then ✓ */
    expect(seen.steps, JSON.stringify(seen.steps.slice(-4))).toContainEqual(["finishing", "Saving…", ""]);
    expect(seen.steps[seen.steps.length - 1]).toEqual(["done", "Uploaded", "ok"]);
    expect(await page.evaluate(() => window._up["Campaign brief Q4.pdf"])).toBe("done");
    /* all went well: it goes by itself, and takes its finished rows */
    await expect(tray(page)).toBeHidden({ timeout: 8000 });
    await expect(page.locator("#upTray .uptray-row")).toHaveCount(0);
  } finally {
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }).catch(() => {});
    await restore(page);
  }
});

test("a failure stays until closed; × folds while something is going; a cancel from the tray stops the upload", async ({ page }) => {
  await signIn(page);
  await page.route("**/api/files/upload?name=broken*", route => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Disk full" }) }));
  const release = await hold(page, "**/api/files/upload?name=held*");
  try {
    await start(page, "held.txt", 3000, "text/plain");
    await start(page, "broken.txt", 3000, "text/plain");
    const title = page.locator("#upTray .uptray-title");
    await expect(title).toHaveText("Uploading 1 file · 1 failed");
    await expect(row(page, "broken.txt").locator(".uptray-meta")).toContainText("Upload failed · Disk full");
    await expect(row(page, "broken.txt").getByRole("img", { name: "Upload failed" })).toBeVisible();
    /* × only folds while held.txt is going */
    await page.getByRole("button", { name: "Collapse — uploads keep going" }).click();
    await expect(tray(page)).toBeVisible();
    await expect(page.locator("#upTrayList")).toBeHidden();
    await expect(page.locator("#upTray .uptray-tog")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#upTray .uptray-pct")).toHaveText(/^\d+%$/);
    await page.getByRole("button", { name: "Expand uploads" }).click();
    await expect(page.locator("#upTrayList")).toBeVisible();
    /* the cancel stops it: the upload rejects as cancelled, no red toast */
    await row(page, "held.txt").getByRole("button", { name: "Cancel upload: held.txt" }).click();
    await expect.poll(() => page.evaluate(() => window._up["held.txt"])).toBe("cancelled");
    await expect(row(page, "held.txt")).toHaveAttribute("data-stage", "cancelled");
    await expect(row(page, "held.txt").locator("[data-upload-text]")).toHaveText("Upload cancelled");
    await expect(title).toHaveText("1 failed");
    await expect(page.locator(".toast.bad")).toHaveCount(0);
    /* a failure keeps it open well past the time it would have closed itself (700 ms, then 1.5 s more after the
       click on the cancel), the pointer moved off it (hovering it holds it open too) */
    await page.mouse.move(900, 120);
    await page.waitForTimeout(3500);
    await expect(tray(page)).toBeVisible();
    await page.getByRole("button", { name: "Close uploads" }).click();
    await expect(tray(page)).toBeHidden();
    await expect(page.locator("#upTray .uptray-row")).toHaveCount(0);
    expect(await page.evaluate(() => window._up["broken.txt"])).toBe("failed: Disk full");
  } finally {
    release();
    await page.unroute("**/api/files/upload?name=broken*");
    await page.unroute("**/api/files/upload?name=held*");
    await restore(page);
  }
});

test("Google Drive through the shared account: the row says where it goes, and Drive is waited for after the bytes", async ({ page }) => {
  await signIn(page);
  let release; const gate = new Promise(r => { release = r; });
  await page.route("**/api/cloud/gdrive/upload*", async route => { await gate; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: "https://drive.google.com/file/d/trayfile/view", driveId: "trayfile", size: "0.1 MB" }) }); });
  try {
    await page.evaluate(() => { const c = cloudOf("gdrive"); c.shared = true; c.config.storage = "drive"; });
    expect(await page.evaluate(() => gdShared() && storageMode())).toBe("drive");
    const id = await start(page, "Moodboard.pdf", 40000);
    const r = row(page, "Moodboard.pdf");
    await expect(r.locator(".uptray-meta")).toContainText("to Google Drive");
    await expect(r.locator(".uptray-end button")).toBeVisible();   /* cancellable while the bytes go */
    /* every byte has left and Drive is still answering (said here as the request's upload.onload says it: an
       intercepted request never reports its body sent, so the browser cannot be asked to) */
    await page.evaluate(i => { const rec = uploadById(i); uploadSet(rec, { stage: "finishing", loaded: rec.total }); }, id);
    await expect(r.locator("[data-upload-text]")).toHaveText("Saving to Google Drive…");
    await expect(r.locator(".uptray-end button")).toHaveCount(0);   /* too late to cancel */
    await expect(page.locator("#upTray .uptray-title")).toHaveText("Uploading 1 file");
    release();
    await expect(r.locator("[data-upload-text]")).toHaveText("Uploaded");
    await expect(r.getByRole("img", { name: "Uploaded" })).toBeVisible();
    await expect(r.locator(".uptray-meta")).toContainText("Uploaded · to Google Drive");
  } finally {
    release();
    await page.unroute("**/api/cloud/gdrive/upload*");
    await restore(page);
  }
});

test("Indonesian: the tray speaks it, and switching language while it is open patches it in place", async ({ page }) => {
  await signIn(page);
  const release = await hold(page);
  try {
    await start(page, "Laporan.pdf", 3000);
    await expect(page.locator("#upTray .uptray-title")).toHaveText("Uploading 1 file");
    await page.evaluate(() => { const t = document.getElementById("upTray"); t.dataset.probe = "1"; t.querySelector(".uptray-row").dataset.probe = "1"; });
    await page.evaluate(() => setLanguage("id"));
    await expect(page.locator("#upTray .uptray-title")).toHaveText("Mengunggah 1 file");
    await expect(row(page, "Laporan.pdf").locator(".uptray-meta")).toContainText("ke server ini");
    await expect(page.locator("#upTray .uptray-tog")).toHaveAttribute("aria-label", "Ciutkan daftar unggahan");
    await expect(page.locator("#upTray .uptray-x")).toHaveAttribute("aria-label", "Ciutkan — unggahan tetap berjalan");
    await expect(row(page, "Laporan.pdf").locator(".uptray-end button")).toHaveAttribute("aria-label", "Batalkan unggahan: Laporan.pdf");
    expect(await page.evaluate(() => !!document.querySelector('#upTray[data-probe="1"] .uptray-row[data-probe="1"]')), "patched, not drawn again").toBe(true);
    release();
    await expect(page.locator("#upTray .uptray-title")).toHaveText("1 unggahan selesai");
    await expect(row(page, "Laporan.pdf").locator("[data-upload-text]")).toHaveText("Terunggah");
    await page.evaluate(() => setLanguage("en"));
    await expect(page.locator("#upTray .uptray-title")).toHaveText("1 upload complete");
    await expect(row(page, "Laporan.pdf").locator(".uptray-meta")).toContainText("Uploaded · to this server");
  } finally {
    release();
    await page.unroute("**/api/files/upload*");
    await restore(page);
  }
});

test("a dialog on a laptop: the tray stays above its shade, folded, and never under its Save", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 700 });
  await signIn(page);
  const release = await hold(page);
  try {
    await page.evaluate(() => openModal("Upload version", '<div style="height:1200px">tall</div>', '<button class="btn" onclick="closeModal()">Cancel</button><span class="spacer"></span><button class="btn primary" id="trayProbeSave">Save version</button>'));
    await start(page, "From a dialog.pdf", 3000);
    await expect(tray(page)).toBeVisible();
    await expect(page.locator("#upTray .uptray-tog")).toHaveAttribute("aria-expanded", "false");
    expect(await onTop(page, "#upTray .uptray-title"), "in reach above the dialog's shade").toBe(true);
    await expect.poll(async () => overlap(await box(page, "#upTray"), await box(page, "#modal"))).toBe(false);
    expect(await onTop(page, "#trayProbeSave")).toBe(true);
    /* opened by hand it still keeps clear: the dialog makes room */
    await page.getByRole("button", { name: "Expand uploads" }).click();
    await expect(page.locator("#upTrayList")).toBeVisible();
    await expect.poll(async () => overlap(await box(page, "#upTray"), await box(page, "#modal"))).toBe(false);
    expect(await onTop(page, "#trayProbeSave")).toBe(true);
    await page.evaluate(() => closeModal());
    /* a wide screen: a dialog in the middle never reaches the corner, and nothing moves for it */
    await page.setViewportSize({ width: 1360, height: 860 });
    await page.evaluate(() => openModal("Upload version", '<div style="height:1200px">tall</div>', '<button class="btn primary" id="trayProbeSave">Save version</button>'));
    await expect.poll(() => page.evaluate(() => document.getElementById("upTray").hasAttribute("data-resv"))).toBe(false);
    await expect(page.locator("#upTrayList")).toBeVisible();
    await page.evaluate(() => closeModal());
  } finally {
    release();
    await page.evaluate(() => closeModal()).catch(() => {});
    await page.unroute("**/api/files/upload*");
    await restore(page);
  }
});

test("a phone: above the tab bar at full width, the buttons and the chat's box sit on it, and a dialog or the task panel ends above it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const release = await hold(page);
  let id = null;
  try {
    await start(page, "Phone upload.pdf", 3000);
    await expect(tray(page)).toBeVisible();
    await expect(page.locator("#upTray .uptray-tog")).toHaveAttribute("aria-expanded", "false");   /* a phone starts folded */
    await settled(page);
    const t = await box(page, "#upTray"), bar = await box(page, "#tabbar");
    expect(Math.round(t.l)).toBe(16);
    expect(Math.round(390 - t.r)).toBe(16);
    expect(t.b).toBeLessThanOrEqual(bar.t - 6);
    const fab = await box(page, "#aiFab");
    if (fab && fab.h) expect(fab.b).toBeLessThanOrEqual(t.t);
    /* the chat's box sits on the tray, not under it */
    const cid = await page.evaluate(() => CONVERSATIONS.find(c => c.type === "WORKSPACE").id);
    await page.evaluate(c => { go("messages"); openConversation(c); }, cid);
    await expect(page.locator("#msgInput")).toBeVisible();
    await expect.poll(async () => (await box(page, ".msg-composer")).b <= (await box(page, "#upTray")).t).toBe(true);
    await page.evaluate(() => { document.getElementById("toasts").textContent = ""; });   /* "Welcome back" sits there a while */
    expect(await onTop(page, "#msgInput")).toBe(true);
    /* a dialog ends above it */
    await page.evaluate(() => openModal("Upload version", '<div style="height:1200px">tall</div>', '<button class="btn primary" id="trayProbeSave">Save version</button>'));
    await expect.poll(async () => overlap(await box(page, "#upTray"), await box(page, "#modal"))).toBe(false);
    expect(await onTop(page, "#trayProbeSave")).toBe(true);
    expect(await onTop(page, "#upTray .uptray-title")).toBe(true);
    await page.evaluate(() => closeModal());
    /* so does the task panel, its foot in full view */
    id = await page.evaluate(async () => { const d = await apiFetch("POST", "/api/tasks", { title: "Tray phone " + Date.now(), status: WS.workflow[0].id, prio: "medium" }); const t = hTask(d); TASKS.push(t); openTask(t.id); return t.id; });
    await expect(page.locator("#drFoot")).toBeVisible();
    await expect.poll(async () => (await box(page, "#drFoot")).b <= (await box(page, "#upTray")).t).toBe(true);
    await page.evaluate(() => closeDrawer());
    await expect.poll(async () => (await box(page, "#upTray")).b <= (await box(page, "#tabbar")).t).toBe(true);
  } finally {
    release();
    await page.unroute("**/api/files/upload*");
    if (id) await page.evaluate(i => { closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id);
    await restore(page);
  }
});

test("leaving the page mid-upload asks first; the sign-in screen and reduced motion", async ({ page }) => {
  await signIn(page);
  const release = await hold(page);
  const leaving = () => page.evaluate(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  try {
    expect(await leaving(), "nothing going, nothing asked").toBe(false);
    await start(page, "Going.pdf", 3000);
    await expect(tray(page)).toBeVisible();
    expect(await leaving(), "an upload going: the browser asks").toBe(true);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await page.evaluate(() => getComputedStyle(document.getElementById("upTray")).animationName)).toBe("none");
    await page.emulateMedia({ reducedMotion: null });
    await page.evaluate(() => document.body.classList.add("auth"));
    await expect(tray(page)).toBeHidden();
    await page.evaluate(() => document.body.classList.remove("auth"));
    await expect(tray(page)).toBeVisible();
    release();
    await expect(page.locator("#upTray .uptray-title")).toHaveText("1 upload complete");
    expect(await leaving()).toBe(false);
  } finally {
    release();
    await page.unroute("**/api/files/upload*");
    await restore(page);
  }
});

test("a custom emoji's picture goes up through the tray too", async ({ page }) => {
  await signIn(page);
  const name = "tray" + Date.now().toString(36);
  try {
    await page.evaluate(n => new Promise(res => {
      const c = document.createElement("canvas"); c.width = 64; c.height = 64; const g = c.getContext("2d"); g.fillStyle = "#e00"; g.fillRect(8, 8, 48, 48);
      c.toBlob(b => { CE_NEW = { url: c.toDataURL("image/png"), ext: "png", blob: b }; customEmojiModal(n); res(); }, "image/png");
    }), name);
    await page.locator("#ceSave").click();
    const r = row(page, name + ".png");
    await expect(r).toBeVisible();
    await expect(r.locator(".uptray-meta")).toContainText("to this server");
    await expect(r.locator("[data-upload-text]")).toHaveText("Uploaded");
    await expect.poll(() => page.evaluate(n => CUSTOM_EMOJI.some(e => e.name === n), name)).toBe(true);
  } finally {
    await page.evaluate(n => apiFetch("DELETE", "/api/emoji/" + n).catch(() => {}), name);
    await restore(page);
  }
});
