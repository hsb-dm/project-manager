/* A comment's links and files are drawn as the description draws them: a chip with a small mark — a file
   type's coloured badge (PDF…), Figma's and Canva's badge, a Google product's mark, a link mark — and the
   name on one line. In the comment box a link used to be its bare icon at full size (a black shape) with
   its name broken over two lines. Images keep their thumbnails. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const FIGMA = "https://www.figma.com/design/AbC123xyz/Figma-KV-Insurance";
const DRIVE = "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit";
const WEB = "https://example.org/brand/guidelines-2026";

test("links and files in a comment are chips with a small mark and a one-line name, in the box and once posted", async ({ page }) => {
  await page.route("**/api/links/title**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ title: "Copy deck" }) }));
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const id = await page.evaluate(async () => { const d = await apiFetch("POST", "/api/tasks", { title: "Comment chips", status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME] }); TASKS.push(hTask(d)); openTask(d.id); S.drawerTab = "comments"; renderDrawer(); return d.id; });
  try {
    await page.evaluate(([f, d, w]) => {
      cmtStage({ name: "Figma KV Insurance", url: f, named: true });
      cmtStage({ name: "Copy deck", url: d });
      cmtStage({ name: "", url: w });
      cmtStage({ name: "Media plan Q4.pdf", url: "https://example.org/files/media-plan-q4.pdf" });
    }, [FIGMA, DRIVE, WEB]);
    const staged = page.locator("#drawer .composer .att.att-chip");
    await expect(staged).toHaveCount(4);
    /* every mark is small, every name one line */
    const sizes = await staged.evaluateAll(list => list.map(s => { const chip = s.querySelector(".drive-chip"), mark = chip.querySelector("svg,.file-chip-ico,img"); const m = mark.getBoundingClientRect(), c = chip.getBoundingClientRect(); return { markW: Math.round(m.width), markH: Math.round(m.height), chipH: Math.round(c.height), fill: mark.tagName.toLowerCase() === "svg" ? getComputedStyle(mark).fill : "" }; }));
    for (const s of sizes) { expect(s.markW, JSON.stringify(s)).toBeLessThanOrEqual(30); expect(s.markH, JSON.stringify(s)).toBeLessThanOrEqual(18); expect(s.chipH, "one line").toBeLessThanOrEqual(30); }
    expect(sizes[2].fill, "the link mark is drawn, not filled black").toBe("none");
    await expect(staged.nth(0).locator(".file-chip-ico")).toHaveText("FIG");
    await expect(staged.nth(0)).toContainText("Figma KV Insurance");
    await expect(staged.nth(2)).toContainText("example.org");
    await expect(staged.nth(3).locator(".file-chip-ico")).toHaveText("PDF");
    /* the × removes that one */
    await staged.nth(2).locator(".att-x").click();
    await expect(page.locator("#drawer .composer .att.att-chip")).toHaveCount(3);
    /* posted: the same chips */
    await page.locator("#cmtText").fill("Referensi untuk revisi");
    await page.locator("#drawer .composer .bar .btn.primary").click();
    await expect.poll(() => page.evaluate(id => task(id).comments.length, id), { timeout: 10000 }).toBe(1);
    const posted = page.locator("#drawer .cmt .cmt-links .drive-chip");
    await expect(posted).toHaveCount(3);
    await expect(posted.nth(0).locator(".file-chip-ico")).toHaveText("FIG");
    await expect(posted.filter({ hasText: "Media plan Q4.pdf" }).locator(".file-chip-ico")).toHaveText("PDF");
    const h = await posted.evaluateAll(list => list.map(a => Math.round(a.getBoundingClientRect().height)));
    for (const x of h) expect(x).toBeLessThanOrEqual(30);
    /* and in Indonesian the remove button says so */
    await page.evaluate(() => { UI_LANG = "id"; cmtStage({ name: "Brief", url: "https://example.org/brief" }); });
    await expect(page.locator("#drawer .composer .att.att-chip .att-x").first()).toHaveAttribute("title", "Hapus");
    await page.evaluate(() => { UI_LANG = "en"; window._cmtAtt = []; renderDrawer(); });
  } finally {
    await page.evaluate(async id => { closeDrawer(); await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); }, id);
  }
});
