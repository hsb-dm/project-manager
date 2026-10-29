/* A file's preview opened from a task: the heading is the file's name, then the task's id and status as capsules of
   one height on one centre line with the name. A finished task's status carries the tick; there is no second "done"
   capsule saying the same. A long name ends in "…" with the whole of it in its tooltip; on a phone the capsules go
   under the name and nothing leaves the dialog. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const NAME = "Pop Up Insurance Campaign_600x780.png";
const LONG = "Pop Up Insurance Campaign final approved export for every placement and size_600x780.png";

test("a file's preview: its name, then its task's capsules, one height and one line, the tick on a finished status", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const made = await page.evaluate(async ([NAME, LONG]) => {
    const cv = document.createElement("canvas"); cv.width = 60; cv.height = 78; const g = cv.getContext("2d"); g.fillStyle = "#1f2a12"; g.fillRect(0, 0, 60, 78);
    const png = cv.toDataURL("image/png");
    const closed = WS.workflow.find(s => s.kind === "closed"), open = WS.workflow.find(s => s.kind === "work") || WS.workflow[1];
    const mk = async (title, status, files) => (await apiFetch("POST", "/api/tasks", { title, status: status.id, prio: "medium", assignee: ME, assignees: [ME], reviewer: ME, reviewers: [ME], files })).id;
    const file = (id, name) => [{ id, name, type: "image", source: "local", size: "0.1 MB", preview: png }];
    const done = await mk("Preview title done", closed, file("pvf1", NAME));
    const going = await mk("Preview title open", open, file("pvf2", LONG));
    await reloadAll();
    return { done, going, closedName: closed.name, openName: open.name };
  }, [NAME, LONG]);
  const show = async (taskId, fileId) => {
    await page.evaluate(([t, f]) => { openTask(t); previewFile(f); }, [taskId, fileId]);
    await expect(page.locator("#modal .pv-head")).toBeVisible();
  };
  const measure = () => page.evaluate(() => {
    const head = document.querySelector("#modal .modal-head"), name = document.querySelector("#modal .pv-name");
    const tags = [...document.querySelectorAll("#modal .pv-tags .badge")].map(b => { const r = b.getBoundingClientRect(); return { text: b.textContent.trim(), h: r.height, mid: (r.top + r.bottom) / 2, svg: !!b.querySelector("svg"), cls: b.className }; });
    const nr = name.getBoundingClientRect(), hr = head.getBoundingClientRect();
    return { tags, nameMid: (nr.top + nr.bottom) / 2, nameRight: nr.right, tagsLeft: Math.min(...[...document.querySelectorAll("#modal .pv-tags .badge")].map(b => b.getBoundingClientRect().left)), nameTop: nr.top, tagsTop: Math.min(...tags.map(t => t.mid)),
      title: name.getAttribute("title"), cut: name.scrollWidth > name.clientWidth, overflow: head.scrollWidth > head.clientWidth + 1, headRight: hr.right, doneCapsules: document.querySelectorAll("#modal .modal-head .badge.done").length };
  });
  try {
    /* a finished task: two capsules, the tick on the status, one height, one centre line with the name */
    await show(made.done, "pvf1");
    let m = await measure();
    expect(m.tags.map(t => t.text)).toEqual([await page.evaluate(id => id, made.done), await page.evaluate(n => tr(n), made.closedName)]);
    expect(m.doneCapsules, "no second \"done\" capsule").toBe(0);
    expect(m.tags[1].svg, "the tick on the finished status").toBe(true);
    expect(m.tags[0].svg).toBe(false);
    expect(Math.abs(m.tags[0].h - m.tags[1].h), "one height").toBeLessThanOrEqual(0.5);
    expect(Math.abs(m.tags[0].mid - m.tags[1].mid), "one centre line").toBeLessThanOrEqual(0.5);
    expect(Math.abs(m.tags[0].mid - m.nameMid), "centred on the name").toBeLessThanOrEqual(1.5);
    expect(m.tagsLeft - m.nameRight, "right after the name").toBeGreaterThanOrEqual(6);
    expect(m.tagsLeft - m.nameRight, "right after the name").toBeLessThanOrEqual(14);
    expect(m.title).toBe(NAME);
    expect(m.cut).toBe(false);
    expect(m.overflow).toBe(false);
    /* dark */
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    m = await measure();
    expect(Math.abs(m.tags[0].mid - m.tags[1].mid)).toBeLessThanOrEqual(0.5);
    await page.evaluate(() => { document.documentElement.setAttribute("data-theme", WS.theme.appearance === "dark" ? "dark" : "light"); closeModal(); });

    /* a task still going: no tick; a long name ends in "…" with the whole of it in the tooltip, the capsules still beside it */
    await show(made.going, "pvf2");
    m = await measure();
    expect(m.tags[1].svg, "no tick on a task still going").toBe(false);
    expect(m.cut, "a long name ends in …").toBe(true);
    expect(m.title).toBe(LONG);
    expect(Math.abs(m.tags[0].mid - m.nameMid)).toBeLessThanOrEqual(1.5);
    expect(m.overflow).toBe(false);
    await page.evaluate(() => closeModal());

    /* a phone: the capsules under the name, nothing out of the dialog */
    await page.setViewportSize({ width: 390, height: 800 });
    await show(made.done, "pvf1");
    m = await measure();
    expect(m.tagsTop, "the capsules under the name").toBeGreaterThan(m.nameMid);
    expect(m.overflow).toBe(false);
    expect(Math.abs(m.tags[0].mid - m.tags[1].mid)).toBeLessThanOrEqual(0.5);
    await page.evaluate(() => closeModal());

    /* Indonesian */
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.evaluate(() => setLanguage("id"));
    await show(made.done, "pvf1");
    m = await measure();
    expect(m.tags[1].text).toBe(await page.evaluate(n => tr(n), made.closedName));
    expect(Math.abs(m.tags[0].mid - m.nameMid)).toBeLessThanOrEqual(1.5);
  } finally {
    await page.evaluate(async ids => { try { closeModal(); closeDrawer(); } catch (e) {} for (const id of ids) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); if (UI_LANG !== "en") setLanguage("en"); }, [made.done, made.going]);
  }
});
