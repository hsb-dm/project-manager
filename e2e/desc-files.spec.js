/* Files attached in a task's description: from the paperclip, pasted from the clipboard, or dropped
   on the writing. Each goes to the workspace's storage and sits in the text as a chip with its type and
   name — [name.pptx](link) in the saved text. A web page is kept as a download, never shown as a page.
   An upload that finishes after the editor has closed puts the link at the end of that task's
   description. In Indonesian the paperclip reads "Lampirkan file". */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
let storageBefore;

test("the paperclip, a paste and a drop each attach a file as a chip", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  storageBefore = await page.evaluate(() => (typeof stoCfg === "function" ? stoCfg().storage || null : null));
  await page.evaluate(() => { if (typeof stoSet === "function" && storageMode() !== "server") stoSet("server"); });
  await expect.poll(() => page.evaluate(() => storageMode())).toBe("server");
  const id = await page.evaluate(async () => { const d = await apiFetch("POST", "/api/tasks", { title: "Desc files " + Date.now(), description: "Brief below:", status: WS.workflow[0].id, prio: "medium" }); const t = hTask(d); TASKS.push(t); return t.id; });
  const desc = () => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(t => t.description), id);
  try {
    await page.evaluate(i => { openTask(i); S.drawerTab = "brief"; S.descMode = "editor"; renderDrawer(); }, id);
    await page.locator("#descSrc").click(); await page.keyboard.press("End");

    /* 1. the paperclip */
    await expect(page.locator("#drawer .md-attach")).toHaveAttribute("title", "Attach file");
    const chooser = page.waitForEvent("filechooser");
    await page.locator("#drawer .md-attach").click();
    await (await chooser).setFiles({ name: "Brief deck.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer: Buffer.from("PK\u0003\u0004 deck") });
    const deck = page.locator("#descSrc .file-chip", { hasText: "Brief deck.pptx" });
    await expect(deck.locator(".file-chip-ico")).toHaveText("PPT");
    await expect(deck).not.toHaveClass(/uploading/);
    await expect.poll(desc).toMatch(/^Brief below: \[Brief deck\.pptx\]\(\/files\/d\/[a-f0-9]{64}\.pptx\)$/);

    /* 2. pasted from the clipboard */
    await page.locator("#descSrc").click(); await page.keyboard.press("End");
    await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(["%PDF-1.4 report"], "Report.pdf", { type: "application/pdf" })); document.getElementById("descSrc").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); });
    await expect(page.locator("#descSrc .file-chip", { hasText: "Report.pdf" }).locator(".file-chip-ico")).toHaveText("PDF");
    await expect.poll(desc).toContain("[Report.pdf](/files/d/");

    /* 3. dropped on the writing — a web page too, kept as a download */
    await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(["<script>alert(1)</script>"], "landing.html", { type: "text/html" })); const el = document.getElementById("descSrc"), r = el.getBoundingClientRect(); el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.right - 5, clientY: r.bottom - 5 })); });
    const page_ = page.locator("#descSrc .file-chip", { hasText: "landing.html" });
    await expect(page_.locator(".file-chip-ico")).toHaveText("HTML");
    await expect.poll(desc).toMatch(/\[landing\.html\]\(\/files\/d\/[a-f0-9]{64}\.html\)/);
    const href = await page_.getAttribute("href");
    const head = await page.evaluate(h => fetch(h, { credentials: "same-origin" }).then(r => ({ type: r.headers.get("content-type"), disp: r.headers.get("content-disposition"), csp: r.headers.get("content-security-policy") })), href);
    expect(head.type).toBe("application/octet-stream"); expect(head.disp).toMatch(/^attachment/); expect(head.csp).toContain("sandbox");

    /* the view shows the chips; editing again and saving changes nothing */
    const saved = await desc();
    await page.locator("#drawer .md-head .btn.primary", { hasText: "Done" }).click();
    await expect(page.locator("#drawer .md-preview .file-chip")).toHaveCount(3);
    await page.evaluate(() => { S.descMode = "editor"; renderDrawer(); descSaveNow(); });
    await page.waitForTimeout(500);
    expect(await desc()).toBe(saved);

    /* 4. the editor closes before the upload answers: the link goes at the end */
    let release; const held = new Promise(r => { release = r; });
    await page.route("**/api/files/upload*", async r => { await held; await r.continue(); });
    await page.locator("#descSrc").click(); await page.keyboard.press("End");
    await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(["text"], "Notes.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })); document.getElementById("descSrc").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); });
    await expect(page.locator("#descSrc .file-chip.uploading", { hasText: "Notes.docx" })).toBeVisible();
    await page.locator("#drawer .md-head .btn.primary", { hasText: "Done" }).click();
    release();
    await expect.poll(desc).toMatch(/\n\[Notes\.docx\]\(\/files\/d\/[a-f0-9]{64}\.docx\)$/);
    await page.unroute("**/api/files/upload*");

    /* in Indonesian */
    await page.evaluate(() => { setLanguage("id"); S.descMode = "editor"; renderDrawer(); });
    await expect(page.locator("#drawer .md-attach")).toHaveAttribute("title", "Lampirkan file");
    await page.evaluate(() => { setLanguage("en"); closeDrawer(); });
  } finally {
    await page.evaluate(i => apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}), id);
    await page.evaluate(m => { if (typeof stoCfg !== "function" || m === undefined) return; const c = stoCfg(); if ((c.storage || null) === m) return; if (m) c.storage = m; else delete c.storage; return persistWS(); }, storageBefore);
  }
});
