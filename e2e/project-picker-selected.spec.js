/* The task panel's project picker lists the task's own projects first, under "Selected (N)" / "Dipilih (N)" — the
   main project, then the others in the order they were added — above "Select project later", and leaves them out
   of Recent and Active projects below, so each is listed once ("project yang terpilih langsung auto keatas"). The
   order is taken when the picker opens (and when the search text changes): a click only ticks or unticks a row and
   the count follows, nothing moves under the pointer; the next opening has the new choice on top. With more than
   20 projects the recent ones are no longer the ones cut off. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const NAMES = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];
/* five projects; a task in Charlie (its own) and Alpha (added after); a task in none; Delta, Alpha, Bravo used lately */
async function setup(page) {
  const tag = "pp" + Date.now().toString(36);
  const made = await page.evaluate(async t => {
    const ids = {};
    for (const n of ["Alpha", "Bravo", "Charlie", "Delta", "Echo"]) { const id = "p_" + n.toLowerCase() + "_" + t; ids[n] = id; PROJECTS = (await apiFetch("POST", "/api/projects", { id, name: n + " " + t, status: n === "Delta" ? "risk" : "active", owner: ME })).map(hProject); }
    const d = await apiFetch("POST", "/api/tasks", { title: "Two projects " + t, status: WS.workflow[0].id, prio: "medium", proj: ids.Charlie, alsoIn: [ids.Alpha] }); TASKS.push(hTask(d));
    const e = await apiFetch("POST", "/api/tasks", { title: "No project " + t, status: WS.workflow[0].id, prio: "medium" }); TASKS.push(hTask(e));
    EP.recentProjects = [ids.Delta, ids.Alpha, ids.Bravo];
    return { ids, task: d.id, bare: e.id };
  }, tag);
  return Object.assign({ tag }, made);
}
const cleanup = (page, m) => page.evaluate(x => { try { setLanguage("en"); } catch (_) {} closeDrawer(); return Promise.all([x.task, x.bare].map(id => apiFetch("DELETE", "/api/tasks/" + id).catch(() => {})).concat(Object.values(x.ids).map(id => apiFetch("DELETE", "/api/projects/" + id).catch(() => {})))); }, m);
const field = page => page.locator('#drawer button[onclick="taskProjectPicker(this)"]');
async function openPicker(page, taskId) {
  if (taskId) await page.evaluate(i => { S.mDetails = true; openTask(i); S.drawerTab = "brief"; renderDrawer(); }, taskId);
  await field(page).click();
  await expect(page.locator("#entityPicker .ep-row").first()).toBeVisible();
  await expect(page.locator("#entityPicker .ep-search")).toBeFocused();
}
/* the picker as read top to bottom: "# heading", "---" (the line under the chosen), "name [x]" when ticked; rows of
   other projects in the workspace are left out (and a heading left with none of this test's rows), the lead row is kept */
const layout = (page, tag) => page.evaluate(t => {
  const out = [...document.querySelectorAll("#entityPicker .ep-list > *")].map(n => {
    if (n.classList.contains("mh")) return "# " + n.textContent.trim();
    if (n.classList.contains("ep-sep")) return "---";
    if (n.classList.contains("ep-row")) { const b = n.querySelector(".ep-main b").textContent.trim(); if (b.indexOf(t) < 0 && !n.querySelector(".ep-none")) return null; return b.replace(" " + t, "") + (n.classList.contains("chosen") ? " [x]" : ""); }
    return n.className;
  }).filter(Boolean);
  return out.filter((x, i) => x.indexOf("# ") !== 0 || (i + 1 < out.length && out[i + 1].indexOf("# ") !== 0 && out[i + 1] !== "---"));
}, tag);
/* where each row sits in the list's own scroll */
const rowTops = page => page.evaluate(() => { const l = document.querySelector("#entityPicker .ep-list"), lt = l.getBoundingClientRect().top; return [...l.querySelectorAll(".ep-row")].map(r => Math.round(r.getBoundingClientRect().top - lt + l.scrollTop)); });
const server = (page, id) => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(t => [t.proj || ""].concat(t.alsoIn || []).join(",")), id);
const named = (m, ...ns) => ns.map(n => m.ids[n]).join(",");

test("a task's projects come first, main one first, each listed once; no project: no Selected section", async ({ page }) => {
  await signIn(page);
  const m = await setup(page);
  try {
    await openPicker(page, m.task);
    expect(await layout(page, m.tag)).toEqual(["# Selected (2)", "Charlie [x]", "Alpha [x]", "---", "Select project later", "# Recent", "Delta", "Bravo", "# Active projects", "Echo"]);
    /* the status under each name stays */
    await expect(page.locator("#entityPicker .ep-row", { hasText: "Delta " + m.tag })).toContainText("risk");
    await expect(page.locator("#entityPicker .ep-row", { hasText: "Charlie " + m.tag })).toContainText("active");
    /* the highlight starts on the first row */
    await expect(page.locator("#entityPicker .ep-row.on")).toContainText("Charlie " + m.tag);
    /* each of the task's projects once */
    for (const n of NAMES) await expect(page.locator("#entityPicker .ep-row", { hasText: n + " " + m.tag }), n).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator("#entityPicker")).toHaveCount(0);

    /* a task in no project: the picker as it was, "Select project later" first */
    await openPicker(page, m.bare);
    await expect(page.locator("#entityPicker .ep-sel-h")).toHaveCount(0);
    await expect(page.locator("#entityPicker .ep-sep")).toHaveCount(0);
    await expect(page.locator("#entityPicker .ep-row").first()).toContainText("Select project later");
    expect(await layout(page, m.tag)).toEqual(["Select project later", "# Recent", "Delta", "Alpha", "Bravo", "# Active projects", "Charlie", "Echo"]);
    await page.keyboard.press("Escape");
  } finally { await cleanup(page, m); }
});

test("choosing while it is open moves nothing; the count follows; opened again, the new choice is on top", async ({ page }) => {
  await signIn(page);
  const m = await setup(page);
  try {
    await openPicker(page, m.task);
    const picker = page.locator("#entityPicker");
    const box0 = await picker.boundingBox();
    const tops0 = await rowTops(page);
    /* add Bravo from Recent: it stays where it is, ticked, and the heading counts 3 */
    const bravo = picker.locator(".ep-row", { hasText: "Bravo " + m.tag });
    const bb = await bravo.boundingBox();
    await bravo.click();
    await expect.poll(() => server(page, m.task)).toBe(named(m, "Charlie", "Alpha", "Bravo"));
    await expect(picker.locator(".ep-sel-h")).toHaveText("Selected (3)");
    expect(await layout(page, m.tag)).toEqual(["# Selected (3)", "Charlie [x]", "Alpha [x]", "---", "Select project later", "# Recent", "Delta", "Bravo [x]", "# Active projects", "Echo"]);
    expect(await rowTops(page), "no row moved").toEqual(tops0);
    const under = await page.evaluate(([x, y]) => { const r = document.elementFromPoint(x, y); return r && r.closest(".ep-row") ? r.closest(".ep-row").querySelector(".ep-main b").textContent : ""; }, [bb.x + bb.width / 2, bb.y + bb.height / 2]);
    expect(under, "the row under the pointer is the one clicked").toBe("Bravo " + m.tag);
    /* take Charlie, the main project, off: it stays on top, unticked, and the count goes down */
    await picker.locator(".ep-row", { hasText: "Charlie " + m.tag }).click();
    await expect.poll(() => server(page, m.task)).toBe(named(m, "Alpha", "Bravo"));
    expect(await layout(page, m.tag)).toEqual(["# Selected (2)", "Charlie", "Alpha [x]", "---", "Select project later", "# Recent", "Delta", "Bravo [x]", "# Active projects", "Echo"]);
    expect(await rowTops(page), "still no row moved").toEqual(tops0);
    const box1 = await picker.boundingBox();
    expect(Math.abs(box1.y - box0.y) + Math.abs(box1.x - box0.x), "the picker stays beside the field").toBeLessThan(3);
    await page.keyboard.press("Escape");
    await expect(page.locator("#entityPicker")).toHaveCount(0);
    await expect(field(page)).toContainText("Alpha " + m.tag + ", Bravo " + m.tag);
    /* opened again: Alpha (now the main one) and Bravo on top; Charlie back among the recent */
    await openPicker(page, m.task);
    expect(await layout(page, m.tag)).toEqual(["# Selected (2)", "Alpha [x]", "Bravo [x]", "---", "Select project later", "# Recent", "Charlie", "Delta", "# Active projects", "Echo"]);
    await page.keyboard.press("Escape");
  } finally { await cleanup(page, m); }
});

test("searching: the matching chosen first under Selected, then the other matches", async ({ page }) => {
  await signIn(page);
  const m = await setup(page);
  try {
    await openPicker(page, m.task);
    const search = page.locator("#entityPicker .ep-search");
    await search.fill(m.tag);
    expect(await layout(page, m.tag)).toEqual(["# Selected", "Charlie [x]", "Alpha [x]", "---", "Delta", "Bravo", "Echo"]);
    await search.fill("Alpha " + m.tag);
    expect(await layout(page, m.tag)).toEqual(["# Selected", "Alpha [x]"]);
    /* none of the chosen match: no heading, as before */
    await search.fill("Echo " + m.tag);
    expect(await layout(page, m.tag)).toEqual(["Echo"]);
    await expect(page.locator("#entityPicker .mh")).toHaveCount(0);
    await search.fill("no such project " + m.tag);
    await expect(page.locator("#entityPicker .ep-empty")).toHaveText("No results");
    /* a choice made while searching stays where it is... */
    await search.fill(m.tag);
    await page.locator("#entityPicker .ep-row", { hasText: "Echo " + m.tag }).click();
    await expect.poll(() => server(page, m.task)).toBe(named(m, "Charlie", "Alpha", "Echo"));
    expect(await layout(page, m.tag)).toEqual(["# Selected", "Charlie [x]", "Alpha [x]", "---", "Delta", "Bravo", "Echo [x]"]);
    /* ...until the search changes, which lays the list out again */
    await search.fill("");
    expect(await layout(page, m.tag)).toEqual(["# Selected (3)", "Charlie [x]", "Alpha [x]", "Echo [x]", "---", "Select project later", "# Recent", "Delta", "Bravo"]);
    /* "Select project later" still means: in no project for now (and closes the picker) */
    await search.fill("Select project");
    expect(await layout(page, m.tag)).toEqual(["Select project later"]);
    await page.keyboard.press("Enter");
    await expect(page.locator("#entityPicker")).toHaveCount(0);
    await expect.poll(() => server(page, m.task)).toBe("");
  } finally { await cleanup(page, m); }
});

test("the arrow keys follow the order shown; the focus and the highlight stay through a choice", async ({ page }) => {
  await signIn(page);
  const m = await setup(page);
  try {
    await openPicker(page, m.task);
    const shown = await page.evaluate(() => [...document.querySelectorAll("#entityPicker .ep-row .ep-main b")].map(b => b.textContent.trim()));
    const lit = () => page.evaluate(() => { const r = document.querySelectorAll("#entityPicker .ep-row.on"); return r.length === 1 ? r[0].querySelector(".ep-main b").textContent.trim() : r.length + " lit"; });
    const walked = [await lit()];
    for (let i = 1; i < shown.length; i++) { await page.keyboard.press("ArrowDown"); walked.push(await lit()); }
    expect(walked, "ArrowDown walks the rows in the order they show").toEqual(shown);
    for (let i = shown.length - 1; i > 1; i--) await page.keyboard.press("ArrowUp");
    expect(await lit()).toBe("Alpha " + m.tag);
    const tops0 = await rowTops(page);
    /* Enter unticks Alpha: the focus stays in the search box, the highlight on Alpha, every row where it was */
    await page.keyboard.press("Enter");
    await expect.poll(() => server(page, m.task)).toBe(named(m, "Charlie"));
    expect(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains("ep-search"))).toBe(true);
    expect(await lit()).toBe("Alpha " + m.tag);
    await expect(page.locator("#entityPicker .ep-row.on")).not.toHaveClass(/chosen/);
    await expect(page.locator("#entityPicker .ep-sel-h")).toHaveText("Selected (1)");
    expect(await rowTops(page)).toEqual(tops0);
    /* and the arrows go on from there */
    await page.keyboard.press("ArrowDown");
    expect(await lit()).toBe(shown[2]);
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect.poll(() => server(page, m.task)).toBe(named(m, "Charlie", "Alpha"));
    await expect(page.locator("#entityPicker .ep-sel-h")).toHaveText("Selected (2)");
    expect(await lit()).toBe("Alpha " + m.tag);
    await page.keyboard.press("Escape");
  } finally { await cleanup(page, m); }
});

test("in Indonesian: Dipilih (N), then Pilih proyek nanti, Terbaru and Project aktif", async ({ page }) => {
  await signIn(page);
  const m = await setup(page);
  try {
    await page.evaluate(() => setLanguage("id"));
    await openPicker(page, m.task);
    await expect(page.locator("#entityPicker .ep-search")).toHaveAttribute("placeholder", "Cari proyek…");
    expect(await layout(page, m.tag)).toEqual(["# Dipilih (2)", "Charlie [x]", "Alpha [x]", "---", "Pilih proyek nanti", "# Terbaru", "Delta", "Bravo", "# Project aktif", "Echo"]);
    await page.locator("#entityPicker .ep-row", { hasText: "Bravo " + m.tag }).click();
    await expect(page.locator("#entityPicker .ep-sel-h")).toHaveText("Dipilih (3)");
    await page.locator("#entityPicker .ep-search").fill(m.tag);
    expect((await layout(page, m.tag))[0]).toBe("# Dipilih");
    await page.keyboard.press("Escape");
  } finally { await cleanup(page, m); }
});

test("with more than 20 projects the recent ones still show under Recent", async ({ page }) => {
  await signIn(page);
  const m = await setup(page);
  const many = await page.evaluate(async t => { const ids = []; for (let i = 0; i < 21; i++) { const id = "p_many_" + i + "_" + t; ids.push(id); PROJECTS = (await apiFetch("POST", "/api/projects", { id, name: "00 Many " + t + " " + String(i).padStart(2, "0"), status: "active", owner: ME })).map(hProject); } return ids; }, m.tag);
  many.forEach((id, i) => { m.ids["many" + i] = id; });
  try {
    await openPicker(page, m.task);
    const l = await layout(page, m.tag);
    /* Delta and Bravo were used lately and sort after the 21 "00 Many" projects by name: they used to be cut off */
    expect(l.slice(0, 8)).toEqual(["# Selected (2)", "Charlie [x]", "Alpha [x]", "---", "Select project later", "# Recent", "Delta", "Bravo"]);
    await page.keyboard.press("Escape");
  } finally { await cleanup(page, m); }
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("the chosen on top, on screen, and a tap moves nothing", async ({ page }) => {
    await signIn(page);
    const m = await setup(page);
    try {
      await openPicker(page, m.task);
      const picker = page.locator("#entityPicker");
      const box = await picker.boundingBox();
      expect(box.x >= 0 && box.x + box.width <= 391, "the picker fits the width").toBe(true);
      expect(await layout(page, m.tag)).toEqual(["# Selected (2)", "Charlie [x]", "Alpha [x]", "---", "Select project later", "# Recent", "Delta", "Bravo", "# Active projects", "Echo"]);
      const head = await picker.locator(".ep-sel-h").boundingBox(), search = await picker.locator(".ep-search").boundingBox();
      expect(head.y - (search.y + search.height), "Selected sits right under the search box").toBeLessThan(24);
      /* no sideways scroll in the list; long names are cut with an ellipsis */
      expect(await page.evaluate(() => { const l = document.querySelector("#entityPicker .ep-list"); return l.scrollWidth <= l.clientWidth + 1; })).toBe(true);
      const tops0 = await rowTops(page);
      await picker.locator(".ep-row", { hasText: "Delta " + m.tag }).tap();
      await expect.poll(() => server(page, m.task)).toBe(named(m, "Charlie", "Alpha", "Delta"));
      await expect(picker.locator(".ep-sel-h")).toHaveText("Selected (3)");
      expect(await rowTops(page), "no row moved").toEqual(tops0);
      await page.keyboard.press("Escape");
    } finally { await cleanup(page, m); }
  });
});
