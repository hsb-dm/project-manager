/* Upload progress where the file waits (src/drawer.js upRowHtml and the chips, src/assets.js, src/messages.js,
   src/paste-image.js, v38's several versions and description file chip): the record's bar and how far it is,
   right where the picked file waits, patched in place; Save, Post or Send pressed too early says how far it is;
   × cancels; a cancelled upload says nothing in red. Throttled with CDP (chromium only) or held with page.route. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const file = (name, mimeType, bytes) => ({ name, mimeType, buffer: Buffer.alloc(bytes, 7) });

async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  /* this server's storage (put back as it was by restore()); every toast is kept to be read back */
  await page.evaluate(() => {
    const c = cloudOf("gdrive"); c.config = c.config || {}; window.__sto = c.config.storage === undefined ? null : c.config.storage;
    if (c.config.storage !== "server") { c.config.storage = "server"; persistWS(); }
    window.__toasts = [];
    new MutationObserver(rs => rs.forEach(r => r.addedNodes.forEach(n => { if (n.classList && n.classList.contains("toast")) window.__toasts.push({ bad: n.classList.contains("bad"), text: n.textContent }); })))
      .observe(document.getElementById("toasts"), { childList: true });
  });
}
async function restore(page) { await page.evaluate(() => { const c = cloudOf("gdrive").config; if (c.storage === (window.__sto === null ? undefined : window.__sto)) return; if (window.__sto === null) delete c.storage; else c.storage = window.__sto; return persistWS(); }).catch(() => {}); }
const toasts = page => page.evaluate(() => window.__toasts.slice());
const redToasts = async page => (await toasts(page)).filter(t => t.bad);
/* the bytes leave slowly (CDP), so a bar can be seen moving; chromium only */
async function throttle(page, bps) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 20, downloadThroughput: 4e6, uploadThroughput: bps });
  return async () => { await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }).catch(() => {}); };
}
/* or every byte is sent and the answer is held: the "finishing" stage */
async function hold(page, pattern) {
  let release; const gate = new Promise(r => { release = r; });
  await page.route(pattern, async route => { await gate; await route.continue(); });
  return async () => { release(); };
}
async function newTask(page, title) {
  return page.evaluate(async t => { const d = await apiFetch("POST", "/api/tasks", { title: t + " " + Date.now(), status: WS.workflow[0].id, prio: "medium" }); const tk = hTask(d); TASKS.push(tk); return tk.id; }, title);
}
const dropTask = (page, id) => page.evaluate(i => { window._cmtDraft = ""; window._cmtAtt = []; closeModal(); closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id).catch(() => {});
const lastUpload = page => page.evaluate(() => { const r = UPLOADS[UPLOADS.length - 1]; return r ? { id: r.id, stage: r.stage, name: r.name } : null; });

test.beforeEach(({ browserName }) => { test.skip(browserName !== "chromium", "CDP throttling is chromium only"); });

test("Upload version: the bar under the file moves, Add version says how far, closing cancels", async ({ page }) => {
  await signIn(page);
  const id = await newTask(page, "Upload version bar");
  const unthrottle = await throttle(page, 60000);
  try {
    await page.evaluate(i => { openTask(i); S.drawerTab = "versions"; renderDrawer(); uploadVersion(); }, id);
    let chooser = page.waitForEvent("filechooser");
    await page.locator("#modal").getByRole("button", { name: /Choose file/ }).click();
    await (await chooser).setFiles(file("Layout v1.pdf", "application/pdf", 320000));
    const bar = page.locator("#uv_up .upbar[role=progressbar]");
    await expect(bar).toBeVisible();
    await expect(page.locator("#uv_file")).toContainText("Layout v1.pdf");
    /* it moves, in place: the same element, never drawn again */
    await page.evaluate(() => { window.__bar = document.querySelector("#uv_up .upbar"); });
    await expect.poll(() => bar.getAttribute("aria-valuenow").then(Number), { timeout: 15000 }).toBeGreaterThan(5);
    await expect(page.locator("#uv_up .uptext")).toContainText(/\d+% · .* of /);
    expect(await page.evaluate(() => window.__bar === document.querySelector("#uv_up .upbar"))).toBe(true);
    /* too early: how far, the bar lit, nothing added */
    await page.locator("#modal").getByRole("button", { name: "Add version" }).click();
    await expect.poll(async () => (await toasts(page)).map(t => t.text).join("|")).toMatch(/Still uploading — \d+%/);
    expect(await page.evaluate(i => task(i).versions.length, id)).toBe(0);
    await expect(page.locator("#modal")).toBeVisible();
    await unthrottle();
    await expect(page.locator("#uv_up .uptext")).toHaveText("Uploaded", { timeout: 20000 });
    await expect(bar).toHaveClass(/\bok\b/);
    await page.locator("#modal").getByRole("button", { name: "Add version" }).click();
    await expect.poll(() => page.evaluate(i => task(i).versions.length, id)).toBe(1);

    /* closing the dialog while the file is on its way cancels it: nothing else could keep it */
    const again = await throttle(page, 30000);
    await page.evaluate(() => uploadVersion());
    chooser = page.waitForEvent("filechooser");
    await page.locator("#modal").getByRole("button", { name: /Choose file/ }).click();
    await (await chooser).setFiles(file("Layout v2.pdf", "application/pdf", 320000));
    await expect(page.locator("#uv_up .upbar")).toBeVisible();
    await expect.poll(() => lastUpload(page).then(r => r && r.stage)).toBe("uploading");
    await page.locator("#modal").getByRole("button", { name: "Cancel" }).click();
    await expect.poll(() => lastUpload(page).then(r => r.stage)).toBe("cancelled");
    await again();
    expect(await redToasts(page)).toEqual([]);
    expect(await page.evaluate(i => task(i).versions.length, id)).toBe(1);
  } finally {
    await unthrottle(); await restore(page); await dropTask(page, id);
  }
});

test("Upload version with several files: a named bar for each", async ({ page }) => {
  await signIn(page);
  const id = await newTask(page, "Several versions");
  const unthrottle = await throttle(page, 80000);
  try {
    await page.evaluate(i => { openTask(i); S.drawerTab = "versions"; renderDrawer(); uploadVersion(); }, id);
    const chooser = page.waitForEvent("filechooser");
    await page.locator("#modal").getByRole("button", { name: /Choose file/ }).click();
    await (await chooser).setFiles([file("Cut A.pdf", "application/pdf", 150000), file("Cut B.pdf", "application/pdf", 150000)]);
    await expect(page.locator("#uv_up .upwait.named")).toHaveCount(2);
    await expect(page.locator("#uv_up .upwait-name")).toHaveText(["Cut A.pdf", "Cut B.pdf"]);
    await page.locator("#modal").getByRole("button", { name: "Add version" }).click();
    await expect.poll(async () => (await toasts(page)).map(t => t.text).join("|")).toMatch(/Still uploading — \d+%/);
    await unthrottle();
    await expect(page.locator("#uv_up .uptext")).toHaveText(["Uploaded", "Uploaded"], { timeout: 20000 });
    await page.locator("#modal").getByRole("button", { name: "Add version" }).click();
    await expect.poll(() => page.evaluate(i => task(i).versions.length, id)).toBe(2);
  } finally {
    await unthrottle(); await restore(page); await dropTask(page, id);
  }
});

test("Upload asset: the bar under the file, Upload while it is saved says so, closing cancels", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => go("assets"));
  const release = await hold(page, "**/api/files/upload*");
  try {
    await page.evaluate(() => uploadAssetModal());
    const chooser = page.waitForEvent("filechooser");
    await page.locator("#modal").getByRole("button", { name: /Choose file/ }).click();
    await (await chooser).setFiles(file("Guidelines.pdf", "application/pdf", 60000));
    /* every byte sent, the answer held: "Saving…". A held route keeps the body too, so the record is told its
       bytes are all out, as XHR's upload.onload tells it (src/upload-progress.js) */
    await expect(page.locator("#ua_up .upbar")).toBeVisible();
    await page.evaluate(() => { const r = UPLOADS[UPLOADS.length - 1]; uploadSet(r, { stage: "finishing", loaded: r.total }); });
    await expect(page.locator("#ua_up .uptext")).toHaveText("Saving…", { timeout: 10000 });
    await expect(page.locator("#ua_up .upbar")).toHaveClass(/\bwait\b/);
    await page.locator("#modal").getByRole("button", { name: "Upload", exact: true }).click();
    await expect.poll(async () => (await toasts(page)).map(t => t.text).join("|")).toContain("Saving…");
    await expect(page.locator("#modal")).toBeVisible();
    await release();
    await expect(page.locator("#ua_up .uptext")).toHaveText("Uploaded");
    await expect(page.locator("#ua_up .upbar")).toHaveClass(/\bok\b/);
    expect(await page.evaluate(() => !window._assetPending && !!window._assetUp && window._assetUp.url)).toMatch(/^\/files\/d\//);
    /* (not saved: the server refuses an asset whose link is this server's /files/d/…, which is not this change's) */
    await page.locator("#modal").getByRole("button", { name: "Cancel" }).click();
    expect(await lastUpload(page).then(r => r.stage)).toBe("done");
  } finally { await page.unroute("**/api/files/upload*"); }
  /* closed while the bytes are leaving: cancelled, quietly */
  const unthrottle = await throttle(page, 30000);
  try {
    await page.evaluate(() => uploadAssetModal());
    const chooser = page.waitForEvent("filechooser");
    await page.locator("#modal").getByRole("button", { name: /Choose file/ }).click();
    await (await chooser).setFiles(file("Big.pdf", "application/pdf", 300000));
    await expect.poll(() => lastUpload(page).then(r => r && r.name === "Big.pdf" && r.stage)).toBe("uploading");
    await page.keyboard.press("Escape");
    await expect.poll(() => lastUpload(page).then(r => r.stage)).toBe("cancelled");
    expect(await redToasts(page)).toEqual([]);
  } finally {
    await unthrottle(); await restore(page);
  }
});

test("Files: every file on its way has its row with a bar; × cancels one and the other is attached", async ({ page }) => {
  await signIn(page);
  const id = await newTask(page, "Files bars");
  const unthrottle = await throttle(page, 60000);
  try {
    await page.evaluate(i => { openTask(i); S.drawerTab = "files"; renderDrawer(); }, id);
    const chooser = page.waitForEvent("filechooser");
    await page.evaluate(() => attachLocal());
    await (await chooser).setFiles([file("Keep me.pdf", "application/pdf", 120000), file("Drop me.zip", "application/zip", 300000)]);
    const rows = page.locator("#drawer .file.pending.up-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.first().locator(".upbar")).toBeVisible();
    await expect(rows.nth(1)).toContainText("this server");
    await rows.filter({ hasText: "Drop me.zip" }).getByRole("button", { name: /Cancel this upload/ }).click();
    await expect(rows).toHaveCount(1);
    await unthrottle();
    await expect.poll(() => page.evaluate(i => task(i).files.map(f => f.name), id), { timeout: 20000 }).toEqual(["Keep me.pdf"]);
    await expect(page.locator("#drawer .file.pending")).toHaveCount(0);
    expect(await redToasts(page)).toEqual([]);
  } finally {
    await unthrottle(); await restore(page); await dropTask(page, id);
  }
});

test("a comment: a file's chip is in the box at once with its bar; Post says how far; × cancels; a picture goes up too", async ({ page }) => {
  await signIn(page);
  const id = await newTask(page, "Comment chip");
  const unthrottle = await throttle(page, 50000);
  try {
    await page.evaluate(i => { window._cmtDraft = ""; window._cmtAtt = []; openTask(i); S.drawerTab = "comments"; S.commentVis = "internal"; renderDrawer(); }, id);
    const box = page.locator("#cmtText");
    await box.click(); await page.keyboard.type("Notes ");
    let chooser = page.waitForEvent("filechooser");
    await page.evaluate(() => cmtUpload(false));
    await (await chooser).setFiles(file("Brief notes.pdf", "application/pdf", 200000));
    const chip = page.locator("#drawer .composer .att-up", { hasText: "Brief notes.pdf" });
    await expect(chip).toBeVisible();
    await expect(chip.locator(".upbar")).toBeVisible();
    await expect(chip.locator(".up-pct")).toHaveText(/^\d+%$/);
    /* typing goes on while it moves */
    await box.click(); await page.keyboard.press("End"); await page.keyboard.type("for you");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await toasts(page)).map(t => t.text).join("|")).toMatch(/Still uploading — \d+%/);
    expect(await page.evaluate(i => task(i).comments.length, id)).toBe(0);
    await expect(box).toHaveValue("Notes for you");
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe("cmtText");
    /* the Post button too, and postComment() called from anywhere else */
    await page.locator("#drawer .composer .bar .btn.primary").click();
    expect(await page.evaluate(i => task(i).comments.length, id)).toBe(0);
    await page.evaluate(() => postComment());
    expect(await page.evaluate(i => task(i).comments.length, id)).toBe(0);
    await expect(box).toHaveValue("Notes for you");
    /* a second file, through the paperclip, cancelled by its × */
    chooser = page.waitForEvent("filechooser");
    await page.evaluate(() => attachToComment());
    await (await chooser).setFiles(file("Not this.zip", "application/zip", 200000));
    const second = page.locator("#drawer .composer .att-up", { hasText: "Not this.zip" });
    await expect(second).toBeVisible();
    const upId = await second.getAttribute("data-cmt-up");
    await second.getByRole("button", { name: /Cancel this upload/ }).click();
    await expect(second).toHaveCount(0);
    expect(await page.evaluate(u => uploadById(u).stage, upId)).toBe("cancelled");
    await box.click(); await page.keyboard.press("End");
    await page.evaluate(() => { window.__ta = document.getElementById("cmtText"); });
    await unthrottle();
    /* landed: the chip is the attachment's own, in place (the box is not drawn again), and the box still has what was typed */
    await expect(page.locator("#drawer .composer .att-chip", { hasText: "Brief notes.pdf" })).toBeVisible({ timeout: 20000 });
    await expect(page.locator("#drawer .composer .att-up")).toHaveCount(0);
    await expect(box).toHaveValue("Notes for you");
    expect(await page.evaluate(() => window.__ta === document.getElementById("cmtText") && document.activeElement === window.__ta)).toBe(true);
    /* a picture goes up whole too (kept as an asset's, e2e/comment-pictures.spec.js), and lands as its preview */
    const n = await page.evaluate(() => UPLOADS.length);
    chooser = page.waitForEvent("filechooser");
    await page.evaluate(() => cmtUpload(true));
    await (await chooser).setFiles({ name: "red.png", mimeType: "image/png", buffer: require("fs").readFileSync(require("path").join(__dirname, "fixtures", "red.png")) });
    await expect(page.locator("#drawer .composer .att-img")).toBeVisible({ timeout: 20000 });
    expect(await page.evaluate(() => UPLOADS.length)).toBe(n + 1);
    await page.locator("#drawer .composer .bar .btn.primary").click();
    await expect.poll(() => page.evaluate(i => (task(i).comments[0] || {}).attachments || [], id).then(a => a.map(x => x.name)), { timeout: 15000 }).toEqual(["Brief notes.pdf", "red.png"]);
    const atts = await page.evaluate(i => task(i).comments[0].attachments, id);
    atts.forEach(att => {
      expect(att.url).toMatch(/^\/files\/d\//);
      expect(att.pending).toBeUndefined();
      expect(att.upId).toBeUndefined();
    });
    expect(atts[1].preview).toBeTruthy();
    expect(await redToasts(page)).toEqual([]);
  } finally {
    await unthrottle(); await restore(page); await dropTask(page, id);
  }
});

test("a project's discussion: Enter and Post wait for a file still on its way, then it goes with the comment", async ({ page }) => {
  await signIn(page);
  const pid = await page.evaluate(async () => { const id = "pd_" + Math.random().toString(36).slice(2, 9); await apiFetch("POST", "/api/projects", { id, name: "Upload bars project", status: "active", owner: ME, teams: [] }); await reloadAll(); return id; });
  const unthrottle = await throttle(page, 40000);
  try {
    await page.evaluate(i => { S.projectTab = "discussion"; go("projects", i); }, pid);
    const box = page.locator("#pdText");
    await expect(box).toBeVisible();
    await box.click(); await page.keyboard.type("Kickoff timeline");
    const chooser = page.waitForEvent("filechooser");
    await page.evaluate(() => cmtUpload(false));   /* the paperclip's Upload file, for the box being written in */
    await (await chooser).setFiles(file("Timeline.pdf", "application/pdf", 200000));
    const chip = page.locator(".pd-box .composer .att-up", { hasText: "Timeline.pdf" });
    await expect(chip).toBeVisible();
    await box.click(); await page.keyboard.press("End"); await page.keyboard.press("Enter");
    await expect.poll(async () => (await toasts(page)).filter(t => /Still uploading — \d+%/.test(t.text)).length).toBe(1);
    await page.locator(".pd-box .composer .bar .btn.primary").click();
    await expect.poll(async () => (await toasts(page)).filter(t => /Still uploading — \d+%/.test(t.text)).length).toBe(2);
    expect(await page.evaluate(i => pdState(i).items.length, pid)).toBe(0);
    await expect(box).toHaveValue("Kickoff timeline");
    await unthrottle();
    await expect(page.locator(".pd-box .composer .att-chip", { hasText: "Timeline.pdf" })).toBeVisible({ timeout: 20000 });
    await box.click(); await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(i => pdState(i).items.map(c => (c.attachments || []).map(a => a.url).join()), pid)).toEqual([expect.stringMatching(/^\/files\/d\//)]);
    expect(await redToasts(page)).toEqual([]);
  } finally {
    await unthrottle(); await restore(page);
    await page.evaluate(i => apiFetch("DELETE", "/api/projects/" + i).catch(() => {}), pid).catch(() => {});
  }
});

test("chat: the staged chip says Uploading with its percentage and bar; Send says how far; × cancels", async ({ page }) => {
  await signIn(page);
  const cid = await page.evaluate(() => CONVERSATIONS.find(c => c.type === "WORKSPACE").id);
  await page.evaluate(id => { go("messages"); openConversation(id); }, cid);
  const unthrottle = await throttle(page, 40000);
  try {
    await page.evaluate(() => msgStageFile(new File([new Uint8Array(200000)], "brief deck.pdf", { type: "application/pdf" })));
    const chip = page.locator(".msg-staged-chip", { hasText: "brief deck.pdf" });
    await expect(chip).toContainText("Uploading");
    await expect(chip).toContainText(/\d+%/);
    await expect(chip.locator(".upbar")).toBeVisible();
    await page.locator("#msgInput").click(); await page.keyboard.type("see attached");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await toasts(page)).map(t => t.text).join("|")).toMatch(/Wait for attachments to finish uploading — \d+%/);
    await expect(page.locator("#msgInput")).toHaveValue("see attached");
    const upId = await page.evaluate(id => msgDraft(id).refs[0].upId, cid);
    await chip.getByRole("button", { name: "Remove" }).click();
    await expect(chip).toHaveCount(0);
    await expect.poll(() => page.evaluate(u => uploadById(u).stage, upId)).toBe("cancelled");
    expect(await page.evaluate(id => msgDraft(id).refs.length, cid)).toBe(0);
    expect((await redToasts(page)).filter(t => !/Wait for attachments/.test(t.text))).toEqual([]);
  } finally {
    await unthrottle(); await restore(page);
    await page.evaluate(id => { const d = msgDraft(id); d.text = ""; d.refs = []; renderMsgMain(true); }, cid).catch(() => {});
  }
});

test("the description: a pasted picture has its bar under it, kept out of the text; a file chip has its bar inside", async ({ page }) => {
  await signIn(page);
  const id = await newTask(page, "Desc bars");
  const release = await hold(page, "**/api/files/upload*");
  try {
    await page.evaluate(i => { openTask(i); S.drawerTab = "brief"; S.descMode = "editor"; renderDrawer(); }, id);
    await page.locator("#descSrc").click();
    await page.keyboard.type("Look:");
    await page.evaluate(async () => { const c = document.createElement("canvas"); c.width = 40; c.height = 30; c.getContext("2d").fillStyle = "#c00"; c.getContext("2d").fillRect(0, 0, 40, 30);
      const b = await new Promise(r => c.toBlob(r, "image/png")); briefPasteImage(new File([b], "shot.png", { type: "image/png" }), { key: PASTE_DESC_KEY }); });
    await expect(page.locator("#descSrc .desc-img-up .upbar")).toBeVisible();
    const md = await page.evaluate(() => descHtmlToMd(document.getElementById("descSrc").innerHTML));
    expect(md).toMatch(/!\[shot\.png\]\(zc-att:/);
    expect(md.replace(/!\[[^\]]*\]\([^)]*\)/g, "").trim()).toBe("Look:");   /* the bar writes nothing */
    await page.evaluate(() => descAttachFile(new File([new Uint8Array(4000)], "Plan.pdf", { type: "application/pdf" })));
    await expect(page.locator("#descSrc .file-chip.uploading .upbar")).toBeVisible();
    await release();
    await expect(page.locator("#descSrc .desc-img-up")).toHaveCount(0, { timeout: 15000 });
    await expect(page.locator("#descSrc .file-chip.uploading")).toHaveCount(0);
    await expect(page.locator("#descSrc img.desc-img")).not.toHaveClass(/uploading/);
    expect(await redToasts(page)).toEqual([]);
  } finally {
    await page.unroute("**/api/files/upload*"); await restore(page); await dropTask(page, id);
  }
});

test("a brief field: a pasted picture waits in its strip with its bar; × cancels it; the next one lands there", async ({ page }) => {
  await signIn(page);
  const field = await page.evaluate(() => WS.briefTemplates[0].fields[0]);
  const id = await page.evaluate(async () => { const t = WS.briefTemplates[0], b = { tpl: t.id }; t.fields.forEach(f => { b[f] = ""; });
    const d = await apiFetch("POST", "/api/tasks", { title: "Brief strip " + Date.now(), status: WS.workflow[0].id, prio: "medium", brief: b }); const tk = hTask(d); TASKS.push(tk); return tk.id; });
  const paste = name => page.evaluate(async n => { const c = document.createElement("canvas"); c.width = 30; c.height = 20; c.getContext("2d").fillRect(0, 0, 30, 20);
    const b = await new Promise(r => c.toBlob(r, "image/png")); briefPasteImage(new File([b], n, { type: "image/png" })); }, name);
  let release = await hold(page, "**/api/files/upload*");
  try {
    await page.evaluate(i => { openTask(i); S.drawerTab = "brief"; S.briefEdit = true; renderDrawer(); }, id);
    const box = page.locator('[data-bf="' + field + '"]');
    await box.click(); await page.keyboard.type("Square crop");
    const n = (await toasts(page)).length;
    await paste("ref-1.png");
    const waiting = page.locator('.v[data-k="' + field + '"] .paste-strip .paste-up');
    await expect(waiting).toHaveCount(1);
    await expect(waiting.locator(".upbar")).toBeVisible();
    expect((await toasts(page)).slice(n).map(t => t.text)).not.toContain("Uploading the pasted image…");   /* the bar says it */
    await waiting.hover();
    await waiting.getByRole("button", { name: /Cancel this upload/ }).click();
    await expect(waiting).toHaveCount(0);
    expect(await redToasts(page)).toEqual([]);
    await paste("ref-2.png");
    await expect(waiting).toHaveCount(1);
    await release();
    await expect(waiting).toHaveCount(0, { timeout: 15000 });
    await expect(page.locator('.v[data-k="' + field + '"] .paste-strip .paste-thumb-wrap img[alt="ref-2.png"]')).toBeVisible();
    await expect(box).toHaveValue("Square crop");
  } finally {
    await page.unroute("**/api/files/upload*"); await restore(page);
    await page.evaluate(() => { S.briefEdit = false; }).catch(() => {});
    await dropTask(page, id);
  }
});

test("Google Drive through the shared account: \"Saving to Google Drive…\" under the file", async ({ page }) => {
  await signIn(page);
  const id = await newTask(page, "Drive bar");
  await page.evaluate(() => { const c = cloudOf("gdrive"); window.__shared = c.shared; c.shared = true; c.config.storage = "drive"; });
  let release; const gate = new Promise(r => { release = r; });
  await page.route("**/api/cloud/gdrive/upload*", async route => { await gate; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ driveId: "d-e2e-1", url: "https://drive.google.com/file/d/d-e2e-1/view", size: "0.1 MB" }) }); });
  try {
    await page.evaluate(i => { openTask(i); S.drawerTab = "versions"; renderDrawer(); uploadVersion(); }, id);
    const chooser = page.waitForEvent("filechooser");
    await page.locator("#modal").getByRole("button", { name: /Choose file/ }).click();
    await (await chooser).setFiles(file("Drive cut.pdf", "application/pdf", 50000));
    await expect(page.locator("#uv_up .upbar")).toBeVisible();
    await expect.poll(() => lastUpload(page).then(r => r && r.stage)).toBe("uploading");
    expect(await page.evaluate(() => UPLOADS[UPLOADS.length - 1].dest)).toBe("gdrive");
    await page.evaluate(() => { const r = UPLOADS[UPLOADS.length - 1]; uploadSet(r, { stage: "finishing", loaded: r.total }); });
    await expect(page.locator("#uv_up .uptext")).toHaveText("Saving to Google Drive…", { timeout: 10000 });
    await page.locator("#modal").getByRole("button", { name: "Add version" }).click();
    await expect.poll(async () => (await toasts(page)).map(t => t.text).join("|")).toContain("Saving to Google Drive…");
    release();
    await expect(page.locator("#uv_up .uptext")).toHaveText("Uploaded");
    await expect(page.locator("#uv_file")).toContainText("in Google Drive");
    await page.evaluate(() => closeModal());
  } finally {
    await page.unroute("**/api/cloud/gdrive/upload*");
    await page.evaluate(() => { const c = cloudOf("gdrive"); c.shared = window.__shared; }).catch(() => {});
    await restore(page); await dropTask(page, id);
  }
});

test("an asset's New version: its bar under the tile; the dialog is drawn again with the new version only while open", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => { const c = cloudOf("gdrive"); window.__shared = c.shared; c.shared = true; c.config.storage = "drive"; });
  let n = 0, release; let gate = new Promise(r => { release = r; });
  await page.route("**/api/cloud/gdrive/upload*", async route => { n++; await gate; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ driveId: "d-nv-" + n, url: "https://drive.google.com/file/d/d-nv-" + n + "/view", size: "0.1 MB" }) }); });
  const aid = await page.evaluate(async () => { go("assets"); const a = { id: uid("as"), name: "NV asset " + Date.now(), type: "document", folder: "", tags: [], size: "1 MB", ver: 1, source: "gdrive", url: "https://drive.google.com/file/d/nv0/view", driveId: "nv0", ago: 0, color: "#7C3AED", by: ME, brand: false, description: "" };
    ASSETS.unshift(a); await persistAsset(a, true); return ASSETS[0].id; });
  try {
    await page.evaluate(i => openAsset(i), aid);
    let chooser = page.waitForEvent("filechooser");
    await page.locator("#modal").getByRole("button", { name: "New version" }).click();
    await (await chooser).setFiles(file("Logo v2.pdf", "application/pdf", 40000));
    const row = page.locator("#modal .as-newver .upwait.named");
    await expect(row).toBeVisible();
    await expect(row.locator(".upwait-name")).toHaveText("Logo v2.pdf");
    release();
    await expect.poll(() => page.evaluate(i => asset(i).ver, aid)).toBe(2);
    await expect(page.locator("#modal .as-newver .upwait")).toHaveCount(0);   /* drawn again, with v2 */
    await expect(page.locator("#modal")).toContainText("v2");
    /* closed meanwhile: the version is still kept, and the dialog stays shut */
    gate = new Promise(r => { release = r; });
    chooser = page.waitForEvent("filechooser");
    await page.locator("#modal").getByRole("button", { name: "New version" }).click();
    await (await chooser).setFiles(file("Logo v3.pdf", "application/pdf", 40000));
    await expect(row).toBeVisible();
    await page.evaluate(() => closeModal());
    release();
    await expect.poll(() => page.evaluate(i => asset(i).ver, aid)).toBe(3);
    await expect(page.locator("#modalWrap")).not.toHaveClass(/\bopen\b/);
    expect(await redToasts(page)).toEqual([]);
  } finally {
    await page.unroute("**/api/cloud/gdrive/upload*");
    await page.evaluate(i => { const c = cloudOf("gdrive"); c.shared = window.__shared; closeModal(); deleteAssetById(i); }, aid).catch(() => {});
    await restore(page);
  }
});

test("Indonesian, and a phone: the words are Indonesian, chips keep one line, nothing overflows", async ({ page }) => {
  await signIn(page);
  const id = await newTask(page, "Phone chips");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => { await setLanguage("id"); });
  await page.waitForFunction(() => UI_LANG === "id" && (typeof ZC_I18N === "undefined" || ZC_I18N.ready));
  const unthrottle = await throttle(page, 30000);
  try {
    await page.evaluate(i => { window._cmtDraft = ""; window._cmtAtt = []; openTask(i); S.drawerTab = "comments"; S.commentVis = "internal"; renderDrawer(); }, id);
    const chooser = page.waitForEvent("filechooser");
    await page.evaluate(() => cmtUpload(false));
    await (await chooser).setFiles(file("A rather long file name for a phone screen.pdf", "application/pdf", 200000));
    const chip = page.locator("#drawer .composer .att-up");
    await expect(chip).toBeVisible();
    const h = await chip.evaluate(el => el.getBoundingClientRect().height);
    expect(h).toBeLessThan(34);   /* one line */
    expect(await chip.evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.locator("#drawer .composer .bar .btn.primary").click();
    await expect.poll(async () => (await toasts(page)).map(t => t.text).join("|")).toMatch(/Masih mengunggah — \d+%/);
    await expect(chip.getByRole("button")).toHaveAttribute("aria-label", /Batalkan unggahan ini/);
    await chip.getByRole("button").click();
    await expect(chip).toHaveCount(0);
  } finally {
    await unthrottle(); await restore(page);
    await page.evaluate(() => setLanguage("en")).catch(() => {});
    await dropTask(page, id);
  }
});
