/* The export dialog, laid out as the design asks: a heading with its icon and a line saying what it is for;
   Period, Scope and Content as cards, each with its icon, title and line; the scope's rows each with their icon;
   the slides (or sheets) in their own box with Select all / Clear all; a count of what the export holds; Reset
   scope with its icon at the foot. The same for PowerPoint, Excel and CSV; on a phone the rows stack and nothing
   runs off the screen. The phone's Settings and Assets pickers show their chevron. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
}

test("the export dialog: heading, three cards, scope rows, the slides box, the count, Reset scope", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await signIn(page);
  await page.evaluate(() => { go("tasks"); exportModal("ppt"); });
  const m = page.locator("#modal.ex-modal");
  await expect(m.locator(".modal-head .exm-head-ico svg")).toBeVisible();
  await expect(m.locator(".modal-head h3")).toHaveText("Export PowerPoint report");
  await expect(m.locator(".modal-head .exm-sub")).toHaveText("Choose a time period, set the scope, and select the content to include in your report.");
  /* the subtitle has the width of the heading, not half of it */
  const head = await m.locator(".modal-head").evaluate(h => { const t = h.querySelector(".exm-titles").getBoundingClientRect(), r = h.getBoundingClientRect(); return t.width / r.width; });
  expect(head).toBeGreaterThan(0.75);
  await expect(m.locator(".exm-sec")).toHaveCount(3);
  await expect(m.locator(".exm-sec-titles h4")).toHaveText(["Period", "Scope", "Content"]);
  await expect(m.locator(".exm-sec .exm-sec-head .exm-ico svg")).toHaveCount(3);
  /* each heading is set off from what its card holds by a clear line */
  const lines = await m.locator(".exm-sec-head").evaluateAll(hs => hs.map(h => { const cs = getComputedStyle(h), next = h.nextElementSibling; return cs.borderBottomStyle + ":" + parseFloat(cs.borderBottomWidth) + ":" + (next.getBoundingClientRect().top - h.getBoundingClientRect().bottom >= 10); }));
  expect(lines).toEqual(["solid:1:true", "solid:1:true", "solid:1:true"]);
  await expect(m.locator(".exm-aside")).toHaveText("Everything is chosen to start with. Leave out what the report should not hold.");
  await expect(m.locator(".exm-row .exm-row-label b")).toHaveText(["Teams", "Projects", "Labels", "People", "Task state"]);
  await expect(m.locator(".exm-row .exm-row-label .exm-ico svg")).toHaveCount(5);
  /* the presets: one row of six, Last 8 weeks chosen; a preset sets the dates */
  await expect(m.locator("#ex_presets button")).toHaveCount(6);
  await expect(m.locator("#ex_presets button.on")).toHaveText("Last 8 weeks");
  await m.locator("#ex_presets button", { hasText: "Last 4 weeks" }).click();
  expect(await page.evaluate(() => offsetFromIso(val("ex_to")) - offsetFromIso(val("ex_from")))).toBe(27);
  /* the slides box: its own head and actions; Clear all and Select all still work, and the count follows */
  const box = m.locator(".exm-box").first();
  await expect(box.locator(".exm-box-head b")).toHaveText("Slides to include");
  await box.locator(".exm-box-acts .btn", { hasText: "Clear all" }).click();
  await expect(m.locator("#ex_count")).toContainText("0 of 9 report sections");
  await box.locator(".exm-box-acts .btn", { hasText: "Select all" }).click();
  await expect(m.locator("#ex_count")).toContainText("9 of 9 report sections");
  await expect(m.locator(".exm-count .exm-count-ico svg")).toBeVisible();
  /* the scope: every chip chosen to start with; each row has Select all / Clear all at its top right, styled as the
     Content box's; a chip clicked is left out */
  const labels = m.locator('.exm-row .chipx[data-scope="labels"]'), selAll = m.locator('[data-scope-act="labels:all"]'), clrAll = m.locator('[data-scope-act="labels:none"]');
  expect(await labels.count()).toBeGreaterThan(1);
  await expect(m.locator(".exm-row .chipx[data-scope]:not(.on)")).toHaveCount(0);
  await expect(m.locator("[data-scope-all]")).toHaveCount(0);
  const place = await m.locator(".exm-row.has-acts").filter({ has: page.locator('.chipx[data-scope="labels"]') }).evaluate(r => { const b = x => x.getBoundingClientRect(), row = b(r), acts = b(r.querySelector(".exm-row-acts")), lab = b(r.querySelector(".exm-row-label")), boxBtn = document.querySelector(".exm-box-acts .btn"), rowBtn = r.querySelector(".exm-row-acts .btn");
    const st = el => { const c = getComputedStyle(el); return [c.fontSize, c.fontWeight, c.borderRadius, c.backgroundColor, Math.round(el.getBoundingClientRect().height)].join("|"); };
    return { right: row.right - acts.right, top: Math.abs(acts.top - lab.top), same: st(boxBtn) === st(rowBtn) }; });
  expect(place.right, "at the row's right").toBeLessThanOrEqual(2);
  expect(place.top, "at its top").toBeLessThanOrEqual(6);
  expect(place.same, "styled as the Content box's").toBe(true);
  const first = labels.first(), firstId = await first.getAttribute("data-id");
  await first.click();
  await expect(first).not.toHaveClass(/on/);
  const left = await page.evaluate(() => EXF.labels.slice());
  expect(left).not.toContain(firstId); expect(left.length).toBe(await labels.count() - 1);
  /* what it does: a task with that label goes; a task with another stays */
  const counts = await page.evaluate(id => { const other = EXF_ALL.labels.find(x => x !== id), mk = (l, n) => ({ id: "T-x" + n, title: "x", status: WS.workflow[1].id, labels: [l], due: 0, proj: null, team: null, tags: [], files: [], versions: [], comments: [], assignees: [ME], assignee: ME });
    const save = TASKS; TASKS = [mk(id, 1), mk(other, 2)]; const run = labs => { EXPORT = { from: -55, to: 0, teams: [], projects: [], labels: labs, people: [], status: "all" }; const n = exportTasks().map(t => t.id); EXPORT = null; return n; };
    const r = { now: run(EXF.labels), all: run([]), none: run(["__none__"]) }; TASKS = save; return r; }, firstId);
  expect(counts).toEqual({ now: ["T-x2"], all: ["T-x1", "T-x2"], none: [] });
  /* Clear all: none, and the count says nothing matches; Select all: everything */
  await clrAll.click();
  await expect(m.locator('.exm-row .chipx[data-scope="labels"].on')).toHaveCount(0);
  expect(await page.evaluate(() => EXF.labels)).toEqual(["__none__"]);
  await expect(m.locator("#ex_count")).toContainText("nothing matches this scope");
  await selAll.click();
  expect(await page.evaluate(() => EXF.labels)).toEqual([]);
  await expect(m.locator('.exm-row .chipx[data-scope="labels"]:not(.on)')).toHaveCount(0);
  /* chosen one by one back to all of them is everything again */
  await first.click(); await first.click();
  expect(await page.evaluate(() => EXF.labels)).toEqual([]);
  /* Reset scope: everything chosen again */
  await first.click();
  await m.locator(".modal-foot .exm-reset").click();
  await expect(first).toHaveClass(/on/);
  expect(await page.evaluate(() => EXF.labels)).toEqual([]);
  await expect(m.locator(".modal-foot .exm-reset svg")).toBeVisible();
  /* Excel and CSV: the same layout, with the Tasks table's columns */
  await page.evaluate(() => { closeModal(); exportModal("xlsx"); });
  await expect(page.locator("#modal.ex-modal .modal-head h3")).toHaveText("Export Excel workbook");
  await expect(page.locator("#modal .exm-box-head b").first()).toHaveText("Sheets to include");
  await expect(page.locator("#modal .exm-box.ex-cols [data-col]").first()).toBeVisible();
  await page.evaluate(() => { closeModal(); exportModal("csv"); });
  await expect(page.locator("#modal.ex-modal .modal-head h3")).toHaveText("Export tasks CSV");
  await expect(page.locator("#modal .exm-sec")).toHaveCount(3);
  await expect(page.locator("#modal .exm-box")).toHaveCount(1);   /* only the columns */
  /* Indonesian */
  await page.evaluate(() => { closeModal(); UI_LANG = "id"; exportModal("ppt"); });
  await expect(page.locator("#modal .modal-head h3")).toHaveText("Ekspor laporan PowerPoint");
  await expect(page.locator("#modal .exm-sec-titles h4").nth(1)).toHaveText("Cakupan");
  await expect(page.locator("#modal .modal-foot .exm-reset")).toContainText("Hapus filter laporan");   /* its translation from before */
  await page.evaluate(() => { closeModal(); UI_LANG = "en"; });
});

test("on a phone: rows stack, nothing runs off the screen, and the pickers show their chevron", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.evaluate(() => { go("tasks"); exportModal("ppt"); });
  const fit = await page.evaluate(() => { const vw = innerWidth, over = []; document.querySelectorAll("#modal *").forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.right > vw + 1) over.push(e.className || e.tagName); });
    const row = document.querySelector(".exm-row"), lab = row.querySelector(".exm-row-label").getBoundingClientRect(), body = row.querySelector(".exm-row-body").getBoundingClientRect();
    const p = [...document.querySelectorAll("#ex_presets button")].map(b => b.scrollWidth <= b.clientWidth + 1);
    return { over: over.slice(0, 5), stacked: body.top >= lab.bottom - 1, presetsWhole: p.every(Boolean) }; });
  expect(fit.over, "nothing past the right edge").toEqual([]);
  expect(fit.stacked, "a row's chips come under its label").toBe(true);
  expect(fit.presetsWhole, "the presets' words are not cut").toBe(true);
  await page.evaluate(() => closeModal());
  /* Settings and Assets: the pickers show they open */
  const chevron = async () => page.evaluate(() => { const s = document.querySelector("select.settings-mobile-select, select.asset-folder-select"); return s && getComputedStyle(s).display !== "none" ? getComputedStyle(s).backgroundImage : "hidden"; });
  await page.evaluate(() => { go("settings"); renderScreen(); });
  expect(decodeURIComponent(await chevron())).toMatch(/M6 9l6 6 6-6/);   /* the shared chevron (dropdown-chevron.spec) */
  await page.evaluate(() => { go("assets"); renderScreen(); });
  expect(decodeURIComponent(await chevron())).toMatch(/M6 9l6 6 6-6/);   /* the shared chevron (dropdown-chevron.spec) */
});
