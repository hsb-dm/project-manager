/* Links in comments: some were not taken — an http:// link and an address written without its https://
   (figma.com/…, bit.ly/…) were refused by Attach link and stayed plain text in the comment, a link written
   twice was a link only the first time, and a comment took 10 attachments. Now: http:// goes as https://, an
   address with a known ending and a path is a link, every one written is a link, Attach link takes a whole
   list (or text with links in it) at once, and a comment keeps up to 50. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("many links at once; http and bare addresses taken; every link written is a link; up to 50", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const id = await page.evaluate(async () => { const d = await apiFetch("POST", "/api/tasks", { title: "Many links", status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME] }); TASKS.push(hTask(d)); openTask(d.id); S.drawerTab = "comments"; window._cmtAtt = []; renderDrawer(); return d.id; });
  try {
    /* a list pasted at once — with an http:// link, two bare addresses, a repeat and words in between */
    await page.locator("#drawer .composer .cmt-tools .btn", { hasText: "Attach link" }).click();
    await page.locator("#cmt_url").fill("Referensi:\nhttps://www.figma.com/design/A1/KV-Insurance\nhttp://example.org/brief-2026\nbit.ly/3abcXYZ dan figma.com/file/B2/Logo\nhttps://www.figma.com/design/A1/KV-Insurance");
    await expect(page.locator("#cmt_found")).toHaveText("4 links found — each is attached");
    await expect(page.locator("#cmt_name_wrap")).toBeHidden();
    await page.locator("#modal .btn.primary").click();
    const urls = await page.evaluate(() => window._cmtAtt.map(a => a.url));
    expect(urls).toEqual(["https://www.figma.com/design/A1/KV-Insurance", "https://example.org/brief-2026", "https://bit.ly/3abcXYZ", "https://figma.com/file/B2/Logo"]);
    await expect(page.locator("#drawer .composer .att.att-chip")).toHaveCount(4);
    /* one address without its https:// is taken on its own too, with its name field */
    await page.locator("#drawer .composer .cmt-tools .btn", { hasText: "Attach link" }).click();
    await page.locator("#cmt_url").fill("canva.com/design/DAF123/view");
    await expect(page.locator("#cmt_found")).toHaveText("1 link found");
    await expect(page.locator("#cmt_name_wrap")).toBeVisible();
    await page.locator("#cmt_name").fill("Canva deck");
    await page.locator("#modal .btn.primary").click();
    await expect(page.locator("#drawer .composer .att.att-chip", { hasText: "Canva deck" })).toBeVisible();
    /* posted: the server keeps them all (it used to cut at 10) */
    await page.evaluate(() => { for (let i = 0; i < 9; i++) window._cmtAtt.push({ name: "", url: "https://example.org/ref-" + i, type: "link", kind: "link", source: "link", size: "Link", named: false }); renderDrawer(); });
    await page.locator("#cmtText").fill("Cek figma.com/file/B2/Logo dan https://a.example/x lalu https://a.example/x lagi; file.pdf versi v1.2/final bukan link");
    await page.locator("#drawer .composer .bar .btn.primary").click();
    await expect.poll(() => page.evaluate(async id => { const d = await apiFetch("GET", "/api/tasks/" + id); return d.comments.length ? d.comments[0].attachments.length : -1; }, id), { timeout: 10000 }).toBe(14);
    /* every link written is a link, the repeat too; a bare address goes to https; "file.pdf" and "v1.2/final" stay words */
    const body = page.locator("#drawer .cmt .body").first();
    const hrefs = await body.locator("a").evaluateAll(as => as.map(a => a.getAttribute("href")));
    expect(hrefs).toEqual(["https://figma.com/file/B2/Logo", "https://a.example/x", "https://a.example/x"]);
    await expect(body).toContainText("file.pdf versi v1.2/final bukan link");
    /* chat draws a repeated link twice as well */
    const chat = await page.evaluate(() => { const d = document.createElement("div"); d.innerHTML = msgBodyHtml({ body: "lihat https://a.example/y dan https://a.example/y", mentions: [] }); return d.querySelectorAll("a").length; });
    expect(chat).toBe(2);
    /* the limit: 50 — the 11th to 20th are taken the usual way, the 51st is not */
    expect(await page.evaluate(() => { window._cmtAtt = []; for (let i = 0; i < 20; i++) cmtStage({ name: "", url: "https://example.org/s" + i, type: "link", kind: "link" }); return window._cmtAtt.length; })).toBe(20);
    await page.evaluate(() => { window._cmtAtt = []; for (let i = 0; i < 50; i++) window._cmtAtt.push({ name: "", url: "https://example.org/n" + i, type: "link", kind: "link" }); cmtStage({ name: "", url: "https://example.org/one-more", type: "link", kind: "link" }); });
    await expect(page.locator("#toasts")).toContainText("Up to 50 attachments per comment");
    expect(await page.evaluate(() => window._cmtAtt.length)).toBe(50);
    /* Indonesian */
    await page.evaluate(() => { window._cmtAtt = []; UI_LANG = "id"; renderDrawer(); cmtLinkModal("web"); });
    await page.locator("#cmt_url").fill("bit.ly/a1 bit.ly/b2");
    await expect(page.locator("#cmt_found")).toHaveText("2 tautan ditemukan — semuanya dilampirkan");
    await page.evaluate(() => { closeModal(); UI_LANG = "en"; });
  } finally {
    await page.evaluate(async id => { window._cmtAtt = []; closeDrawer(); await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); }, id);
  }
});
