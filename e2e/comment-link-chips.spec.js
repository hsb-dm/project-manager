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
    /* Figma by its own mark (src/brand-icons.js), in its colour */
    await expect(staged.nth(0).locator("svg.brand-ico")).toBeVisible();
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
    await expect(posted.nth(0).locator("svg.brand-ico")).toBeVisible();
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

/* A task or a project goes with a comment as a chip, the way chat attaches one: the Task and Project buttons
   beside the others (on a phone, in the one attach menu), a chip with × while writing, a live chip on the
   posted comment that opens it. Nothing is filed under Assets & versions; the server keeps it on the comment. */
for (const vp of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  test("a task and a project attached to a comment (" + vp.width + "px)", async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/");
    await page.locator("#au_email").fill(ADMIN.email);
    await page.locator("#au_pw").fill(ADMIN.pw);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForFunction(() => window.ZC_READY === true && API.on);
    const ids = await page.evaluate(async () => {
      const mk = async title => { const d = await apiFetch("POST", "/api/tasks", { title, status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME] }); TASKS.push(hTask(d)); return d.id; };
      const list = await apiFetch("POST", "/api/projects", { name: "Comment ref project " + Date.now().toString(36), status: "active", owner: ME, teams: [] });
      PROJECTS = list.map(hProject);
      const p = PROJECTS.filter(x => /^Comment ref project /.test(x.name)).pop();
      const ids = { task: await mk("Commenting here"), other: await mk("Banner resize for the ref"), project: p.id, projectName: p.name };
      openTask(ids.task); S.drawerTab = "comments"; renderDrawer(); return ids;
    });
    const phone = vp.width < 761;
    const pick = async (kind, q) => {
      /* one paperclip with a menu, on a laptop as on a phone */
      await page.locator("#drawer .composer .m-attach").click(); await page.locator("#ctxMenu.open button", { hasText: kind === "task" ? "Task" : "Project" }).click();
      await expect(page.locator("#entityPicker")).toBeVisible();
      const box = await page.locator("#entityPicker").boundingBox();
      expect(box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width + 1, "the picker is on screen").toBe(true);
      /* by the button it came from: the visible paperclip, not the hidden one it pressed */
      const from = await page.locator("#drawer .composer .m-attach").boundingBox();
      expect(Math.min(Math.abs(box.y - (from.y + from.height)), Math.abs(box.y + box.height - from.y)), "next to its button").toBeLessThan(24);
      await page.locator("#entityPicker .ep-search").fill(q);
      await page.locator("#entityPicker .ep-row").first().click();
    };
    try {
      await pick("task", "Banner resize");
      const staged = page.locator(`#drawer .composer .att.att-chip a.ref-chip[data-ref="task:${ids.other}"]`);
      await expect(staged).toContainText("Banner resize for the ref");
      /* the same one again is refused */
      await pick("task", "Banner resize");
      await expect(page.locator(`#drawer .composer a.ref-chip[data-ref="task:${ids.other}"]`)).toHaveCount(1);
      /* a chip in the comment box does not leave the task being written about */
      await staged.click();
      expect(await page.evaluate(() => S.drawerTask)).toBe(ids.task);
      await pick("project", ids.projectName);
      await expect(page.locator(`#drawer .composer a.ref-chip[data-ref="project:${ids.project}"]`)).toContainText(ids.projectName);
      /* posted */
      await page.locator("#cmtText").fill("Lihat juga ini");
      await page.locator("#drawer .composer .bar .btn.primary").click();
      await expect.poll(() => page.evaluate(id => task(id).comments.length, ids.task), { timeout: 10000 }).toBe(1);
      const posted = page.locator("#drawer .cmt .cmt-links");
      await expect(posted.locator(`a.ref-chip[data-ref="task:${ids.other}"]`)).toBeVisible();
      await expect(posted.locator(`a.ref-chip[data-ref="project:${ids.project}"]`)).toBeVisible();
      expect(await page.evaluate(id => task(id).files.length, ids.task), "nothing filed under Assets").toBe(0);
      const kept = await page.evaluate(async id => (await apiFetch("GET", "/api/tasks/" + id)).comments[0].attachments.map(a => a.ref + ":" + a.refId), ids.task);
      expect(kept).toEqual(["task:" + ids.other, "project:" + ids.project]);
      /* the posted chip opens the task */
      await posted.locator(`a.ref-chip[data-ref="task:${ids.other}"]`).click();
      await expect.poll(() => page.evaluate(() => S.drawerTask)).toBe(ids.other);
    } finally {
      await page.evaluate(async ids => { closeDrawer(); for (const id of [ids.task, ids.other]) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); await apiFetch("DELETE", "/api/projects/" + ids.project).catch(() => {}); }, ids);
    }
  });
}
