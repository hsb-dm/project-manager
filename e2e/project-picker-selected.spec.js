/* The task panel's project picker lists the task's own projects first, under "Selected (N)" / "Dipilih (N)" — the
   main project, then the others in the order they were added — above "Select project later", and leaves them out
   of Recent and Active projects below, so each is listed once. A tick moves its row up there at once and an untick
   moves it back to its place below ("langsung auto keatas ... bukan nunggu dropdownnya ditutup dan dibuka lagi"):
   every row glides from where it was (FLIP, about 200 ms), the moved row is lit for a moment, a heading that goes
   fades where it was, and with reduced motion it is only the move. The keyboard highlight goes with the moved row;
   a click holds the person's place in a long list. With more than 20 projects the recent ones are not cut off, nor
   is a project ticked or unticked while the picker is open. */
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
/* 21 more, named to sort before the five, so the list scrolls and the twenty-row cut is reached */
async function addMany(page, m) {
  const many = await page.evaluate(async t => { const ids = []; for (let i = 0; i < 21; i++) { const id = "p_many_" + i + "_" + t; ids.push(id); PROJECTS = (await apiFetch("POST", "/api/projects", { id, name: "00 Many " + t + " " + String(i).padStart(2, "0"), status: "active", owner: ME })).map(hProject); } return ids; }, m.tag);
  many.forEach((id, i) => { m.ids["many" + i] = id; });
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
   other projects in the workspace are left out (and a heading left with none of this test's rows), the lead row is
   kept, and what is only fading out (.ep-ghost) is not there */
const layout = (page, tag) => page.evaluate(t => {
  const out = [...document.querySelectorAll("#entityPicker .ep-list > *:not(.ep-ghost)")].map(n => {
    if (n.classList.contains("mh")) return "# " + n.textContent.trim();
    if (n.classList.contains("ep-sep")) return "---";
    if (n.classList.contains("ep-row")) { const b = n.querySelector(".ep-main b").textContent.trim(); if (b.indexOf(t) < 0 && !n.querySelector(".ep-none")) return null; return b.replace(" " + t, "") + (n.classList.contains("chosen") ? " [x]" : ""); }
    return n.className;
  }).filter(Boolean);
  return out.filter((x, i) => x.indexOf("# ") !== 0 || (i + 1 < out.length && out[i + 1].indexOf("# ") !== 0 && out[i + 1] !== "---"));
}, tag);
/* the move is over: no glide or fade running in the picker (the moved row's light may still be fading) */
const settled = page => page.waitForFunction(() => { const p = document.getElementById("entityPicker"); if (!p) return true; if (p.querySelector(".ep-ghost")) return false; return p.getAnimations({ subtree: true }).every(a => a.playState !== "running" || a instanceof CSSAnimation || a instanceof CSSTransition); });
const server = (page, id) => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(t => [t.proj || ""].concat(t.alsoIn || []).join(",")), id);
const named = (m, ...ns) => ns.map(n => m.ids[n]).join(",");
const lit = page => page.evaluate(() => { const r = document.querySelectorAll("#entityPicker .ep-row.on"); return r.length === 1 ? r[0].querySelector(".ep-main b").textContent.trim() : r.length + " lit"; });
const searchFocused = page => page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains("ep-search"));
/* clicks a row by its name inside the page and reads, in the same moment, where everything is on the screen just
   before and just after (the first frame of the glide), what is animated and for how long, and what fades out */
const flip = (page, name) => page.evaluate(n => {
  const l = document.querySelector("#entityPicker .ep-list");
  const pos = () => { const lt = l.getBoundingClientRect().top, o = {}; l.querySelectorAll("[data-k]").forEach(e => { o[e.getAttribute("data-k")] = Math.round(e.getBoundingClientRect().top - lt); }); return o; };
  const before = pos(), box0 = document.getElementById("entityPicker").getBoundingClientRect();
  const row = [...l.querySelectorAll(".ep-row")].find(r => r.querySelector(".ep-main b").textContent.trim() === n);
  const key = row.getAttribute("data-k");
  row.click();
  const first = pos(), box1 = document.getElementById("entityPicker").getBoundingClientRect();
  const anims = l.getAnimations({ subtree: true }).filter(a => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition));
  const moved = l.querySelector('.ep-row[data-k="' + CSS.escape(key) + '"]');
  const slides = anims.filter(a => a.effect && a.effect.target && a.effect.target.classList.contains("ep-row") && JSON.stringify(a.effect.getKeyframes()).indexOf("translateY") >= 0);
  return { key, before, first, durations: [...new Set(anims.map(a => a.effect.getTiming().duration))], slid: slides.map(a => a.effect.target.getAttribute("data-k")),
    lit: !!moved && moved.classList.contains("ep-moved"), ring: moved ? getComputedStyle(moved).boxShadow : "", ghosts: [...l.querySelectorAll(".ep-ghost")].map(g => g.textContent.trim()),
    boxMoved: Math.abs(box1.top - box0.top) + Math.abs(box1.left - box0.left), grew: Math.round(box1.height - box0.height),
    listAnimated: l.getAnimations().some(a => a.effect && a.effect.target === l) };
}, name);
/* where each row is on the screen now, by key */
const tops = page => page.evaluate(() => { const l = document.querySelector("#entityPicker .ep-list"), lt = l.getBoundingClientRect().top, o = {}; l.querySelectorAll("[data-k]").forEach(e => { o[e.getAttribute("data-k")] = Math.round(e.getBoundingClientRect().top - lt); }); return o; });
/* nothing jumps: what was there before is, in the first frame, exactly where it was */
function expectNoJump(f) {
  const jumped = Object.keys(f.before).filter(k => k in f.first && Math.abs(f.first[k] - f.before[k]) > 1);
  expect(jumped, "in the first frame every row, heading and line is where it was").toEqual([]);
  expect(f.boxMoved, "the picker itself stays put").toBeLessThan(2);
  expect(Math.abs(f.grew), "and keeps its height in the first frame (a change of height follows the rows)").toBeLessThan(2);
}
/* is a row (by name) fully inside the list's visible part */
const inView = (page, name) => page.evaluate(n => { const l = document.querySelector("#entityPicker .ep-list"), lr = l.getBoundingClientRect(); const r = [...l.querySelectorAll(".ep-row")].find(x => x.querySelector(".ep-main b").textContent.trim() === n); if (!r) return "missing"; const b = r.getBoundingClientRect(); return b.top >= lr.top - 1 && b.bottom <= lr.bottom + 1; }, name);

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

test("ticking moves the row to the top at once; unticking moves it back", async ({ page }) => {
  await signIn(page);
  const m = await setup(page);
  try {
    await openPicker(page, m.task);
    /* tick Bravo in Recent: it goes up under Selected, last (the order they were added), and leaves Recent */
    let f = await flip(page, "Bravo " + m.tag);
    expectNoJump(f);
    expect(f.slid, "the moved row glides").toContain(f.key);
    expect(f.durations.length, "something is animated").toBeGreaterThan(0);
    for (const d of f.durations) { expect(d, "a short move").toBeGreaterThanOrEqual(180); expect(d).toBeLessThanOrEqual(220); }
    expect(f.lit, "the moved row is lit for a moment").toBe(true);
    expect(await layout(page, m.tag), "in its new place at once").toEqual(["# Selected (3)", "Charlie [x]", "Alpha [x]", "Bravo [x]", "---", "Select project later", "# Recent", "Delta", "# Active projects", "Echo"]);
    await settled(page);
    const t1 = await tops(page);
    expect(t1[f.key], "it ends up higher than it was").toBeLessThan(f.before[f.key]);
    expect(t1[f.key], "right under Alpha").toBeGreaterThan(t1[m.ids.Alpha]);
    await expect.poll(() => server(page, m.task)).toBe(named(m, "Charlie", "Alpha", "Bravo"));
    await expect(page.locator("#entityPicker .ep-row.ep-moved"), "the light goes again").toHaveCount(0, { timeout: 3000 });

    /* untick Charlie, the main project: Alpha becomes the main one, and Charlie, not used lately when the picker
       opened, goes down to Active projects, in its place by name */
    f = await flip(page, "Charlie " + m.tag);
    expectNoJump(f);
    expect(await layout(page, m.tag)).toEqual(["# Selected (2)", "Alpha [x]", "Bravo [x]", "---", "Select project later", "# Recent", "Delta", "# Active projects", "Charlie", "Echo"]);
    await settled(page);
    expect((await tops(page))[f.key], "it ends up lower than it was").toBeGreaterThan(f.before[f.key]);
    await expect.poll(() => server(page, m.task)).toBe(named(m, "Alpha", "Bravo"));
    /* untick Alpha, which was among the recent: back to Recent, in its place */
    await flip(page, "Alpha " + m.tag);
    expect(await layout(page, m.tag)).toEqual(["# Selected (1)", "Bravo [x]", "---", "Select project later", "# Recent", "Delta", "Alpha", "# Active projects", "Charlie", "Echo"]);
    await settled(page);
    /* tick and untick Echo: up, then back exactly where it was */
    const e0 = (await tops(page))[m.ids.Echo];
    await flip(page, "Echo " + m.tag);
    expect(await layout(page, m.tag)).toEqual(["# Selected (2)", "Bravo [x]", "Echo [x]", "---", "Select project later", "# Recent", "Delta", "Alpha", "# Active projects", "Charlie"]);
    await settled(page);
    await flip(page, "Echo " + m.tag);
    await settled(page);
    expect((await tops(page))[m.ids.Echo]).toBe(e0);
    await expect.poll(() => server(page, m.task)).toBe(named(m, "Bravo"));

    /* the last one off: "Selected" goes, fading where it was, nothing else jumps, and the rows glide up */
    f = await flip(page, "Bravo " + m.tag);
    expectNoJump(f);
    expect(f.ghosts, "the heading fades out where it was").toContain("Selected (1)");
    expect(await layout(page, m.tag)).toEqual(["Select project later", "# Recent", "Delta", "Alpha", "Bravo", "# Active projects", "Charlie", "Echo"]);
    await settled(page);
    await expect(page.locator("#entityPicker .ep-sel-h")).toHaveCount(0);
    await expect(page.locator("#entityPicker .ep-sep")).toHaveCount(0);
    await expect.poll(() => server(page, m.task)).toBe("");
    /* and the first one on: it comes in under a heading that fades in */
    f = await flip(page, "Delta " + m.tag);
    expectNoJump(f);
    expect(await layout(page, m.tag)).toEqual(["# Selected (1)", "Delta [x]", "---", "Select project later", "# Recent", "Alpha", "Bravo", "# Active projects", "Charlie", "Echo"]);
    await settled(page);
    await expect.poll(() => server(page, m.task)).toBe(named(m, "Delta"));

    /* closed and opened again: the same order as it was left, the recent now first among the rest */
    await page.keyboard.press("Escape");
    await expect(page.locator("#entityPicker")).toHaveCount(0);
    await expect(field(page)).toContainText("Delta " + m.tag);
    await openPicker(page, m.task);
    expect((await layout(page, m.tag)).slice(0, 4)).toEqual(["# Selected (1)", "Delta [x]", "---", "Select project later"]);
    await page.keyboard.press("Escape");
  } finally { await cleanup(page, m); }
});

test("searching: the matching chosen first under Selected, and a tick moves the match there at once", async ({ page }) => {
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
    /* a tick while searching moves the match under Selected at once, last */
    await search.fill(m.tag);
    let f = await flip(page, "Echo " + m.tag);
    expectNoJump(f);
    expect(f.lit).toBe(true);
    expect(await layout(page, m.tag)).toEqual(["# Selected", "Charlie [x]", "Alpha [x]", "Echo [x]", "---", "Delta", "Bravo"]);
    await expect.poll(() => server(page, m.task)).toBe(named(m, "Charlie", "Alpha", "Echo"));
    await settled(page);
    /* an untick moves it back among the matches, in its place */
    await flip(page, "Alpha " + m.tag);
    expect(await layout(page, m.tag)).toEqual(["# Selected", "Charlie [x]", "Echo [x]", "---", "Delta", "Alpha", "Bravo"]);
    await expect.poll(() => server(page, m.task)).toBe(named(m, "Charlie", "Echo"));
    await settled(page);
    expect(await searchFocused(page), "the typing stays in the search box").toBe(true);
    await expect(search).toHaveValue(m.tag);
    /* the only chosen match unticked: the heading goes */
    await search.fill("Echo " + m.tag);
    expect(await layout(page, m.tag)).toEqual(["# Selected", "Echo [x]"]);
    const tall = (await page.locator("#entityPicker").boundingBox()).height;
    f = await flip(page, "Echo " + m.tag);
    expect(f.ghosts).toContain("Selected");
    expectNoJump(f);
    expect(f.listAnimated, "the shorter list closes up smoothly").toBe(true);
    expect(await layout(page, m.tag)).toEqual(["Echo"]);
    await settled(page);
    await expect(page.locator("#entityPicker .mh")).toHaveCount(0);
    expect((await page.locator("#entityPicker").boundingBox()).height, "and ends up shorter").toBeLessThan(tall - 10);
    /* cleared, the list as a whole */
    await search.fill("");
    expect(await layout(page, m.tag)).toEqual(["# Selected (1)", "Charlie [x]", "---", "Select project later", "# Recent", "Delta", "Alpha", "Bravo", "# Active projects", "Echo"]);
    /* "Select project later" still means: in no project for now (and closes the picker) */
    await search.fill("Select project");
    expect(await layout(page, m.tag)).toEqual(["Select project later"]);
    await page.keyboard.press("Enter");
    await expect(page.locator("#entityPicker")).toHaveCount(0);
    await expect.poll(() => server(page, m.task)).toBe("");
  } finally { await cleanup(page, m); }
});

test("the keyboard: the highlight goes with the moved row, the focus stays in the search box, the arrows go on from there", async ({ page }) => {
  await signIn(page);
  const m = await setup(page);
  try {
    await openPicker(page, m.task);
    const shown = await page.evaluate(() => [...document.querySelectorAll("#entityPicker .ep-row .ep-main b")].map(b => b.textContent.trim()));
    const walked = [await lit(page)];
    for (let i = 1; i < shown.length; i++) { await page.keyboard.press("ArrowDown"); walked.push(await lit(page)); }
    expect(walked, "ArrowDown walks the rows in the order they show").toEqual(shown);
    /* up to Bravo in Recent; Enter ticks it: it moves up under Selected and the highlight goes with it */
    while (await lit(page) !== "Bravo " + m.tag) await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect.poll(() => server(page, m.task)).toBe(named(m, "Charlie", "Alpha", "Bravo"));
    expect(await layout(page, m.tag)).toEqual(["# Selected (3)", "Charlie [x]", "Alpha [x]", "Bravo [x]", "---", "Select project later", "# Recent", "Delta", "# Active projects", "Echo"]);
    expect(await lit(page), "the highlight is on the moved row").toBe("Bravo " + m.tag);
    await expect(page.locator("#entityPicker .ep-row.on")).toHaveClass(/chosen/);
    expect(await searchFocused(page), "the focus stays in the search box").toBe(true);
    await expect(page.locator("#entityPicker .ep-sel-h")).toHaveText("Selected (3)");
    await settled(page);
    /* the arrows go on from its new place */
    await page.keyboard.press("ArrowDown");
    expect(await lit(page)).toBe("Select project later");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    expect(await lit(page)).toBe("Alpha " + m.tag);
    /* Enter unticks Alpha: down to Recent (it was recent when the picker opened), the highlight with it */
    await page.keyboard.press("Enter");
    await expect.poll(() => server(page, m.task)).toBe(named(m, "Charlie", "Bravo"));
    expect(await layout(page, m.tag)).toEqual(["# Selected (2)", "Charlie [x]", "Bravo [x]", "---", "Select project later", "# Recent", "Delta", "Alpha", "# Active projects", "Echo"]);
    expect(await lit(page)).toBe("Alpha " + m.tag);
    await expect(page.locator("#entityPicker .ep-row.on")).not.toHaveClass(/chosen/);
    expect(await searchFocused(page)).toBe(true);
    await settled(page);
    expect(await inView(page, "Alpha " + m.tag), "the list follows the highlight").toBe(true);
    /* the row after Alpha as shown now (other projects in the workspace may come before Echo) */
    const nextShown = await page.evaluate(n => { const b = [...document.querySelectorAll("#entityPicker .ep-row .ep-main b")].map(x => x.textContent.trim()); return b[b.indexOf(n) + 1]; }, "Alpha " + m.tag);
    expect(nextShown, "Active projects comes next").not.toContain("Delta");
    await page.keyboard.press("ArrowDown");
    expect(await lit(page)).toBe(nextShown);
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    expect(await lit(page)).toBe("Delta " + m.tag);
    await page.keyboard.press("Escape");
  } finally { await cleanup(page, m); }
});

test("in Indonesian: Dipilih (N), then Pilih proyek nanti, Terbaru and Project aktif, and a tick moves up at once", async ({ page }) => {
  await signIn(page);
  const m = await setup(page);
  try {
    await page.evaluate(() => setLanguage("id"));
    await openPicker(page, m.task);
    await expect(page.locator("#entityPicker .ep-search")).toHaveAttribute("placeholder", "Cari proyek…");
    expect(await layout(page, m.tag)).toEqual(["# Dipilih (2)", "Charlie [x]", "Alpha [x]", "---", "Pilih proyek nanti", "# Terbaru", "Delta", "Bravo", "# Project aktif", "Echo"]);
    await page.locator("#entityPicker .ep-row", { hasText: "Bravo " + m.tag }).click();
    await expect(page.locator("#entityPicker .ep-sel-h")).toHaveText("Dipilih (3)");
    expect(await layout(page, m.tag)).toEqual(["# Dipilih (3)", "Charlie [x]", "Alpha [x]", "Bravo [x]", "---", "Pilih proyek nanti", "# Terbaru", "Delta", "# Project aktif", "Echo"]);
    await settled(page);
    await page.locator("#entityPicker .ep-row", { hasText: "Charlie " + m.tag }).click();
    expect(await layout(page, m.tag)).toEqual(["# Dipilih (2)", "Alpha [x]", "Bravo [x]", "---", "Pilih proyek nanti", "# Terbaru", "Delta", "# Project aktif", "Charlie", "Echo"]);
    await settled(page);
    await page.locator("#entityPicker .ep-search").fill(m.tag);
    expect((await layout(page, m.tag))[0]).toBe("# Dipilih");
    await page.keyboard.press("Escape");
  } finally { await cleanup(page, m); }
});

test("with reduced motion it is only the move: nothing glides or fades, the row is ringed quietly", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  const m = await setup(page);
  try {
    await openPicker(page, m.task);
    let f = await flip(page, "Bravo " + m.tag);
    expect(f.durations, "no animation at all").toEqual([]);
    expect(f.first[f.key], "already in its new place in the very first frame").toBeLessThan(f.before[f.key]);
    expect(f.lit).toBe(true);
    expect(f.ring, "a quiet ring instead of the light").toContain("inset");
    expect(await layout(page, m.tag)).toEqual(["# Selected (3)", "Charlie [x]", "Alpha [x]", "Bravo [x]", "---", "Select project later", "# Recent", "Delta", "# Active projects", "Echo"]);
    expect((await tops(page))[f.key], "and nothing moves after").toBe(f.first[f.key]);
    /* the heading goes without fading */
    await flip(page, "Charlie " + m.tag);
    await flip(page, "Alpha " + m.tag);
    f = await flip(page, "Bravo " + m.tag);
    expect(f.ghosts).toEqual([]);
    expect(f.durations).toEqual([]);
    expect(await layout(page, m.tag)).toEqual(["Select project later", "# Recent", "Delta", "Alpha", "Bravo", "# Active projects", "Charlie", "Echo"]);
    await expect.poll(() => server(page, m.task)).toBe("");
    await page.keyboard.press("Escape");
  } finally { await cleanup(page, m); }
});

/* scrolls the list to `st` and takes the row nearest its middle, with its neighbours and where they are */
const pickMid = (page, st) => page.evaluate(st => { const l = document.querySelector("#entityPicker .ep-list"); l.scrollTop = st; const lr = l.getBoundingClientRect(), mid = lr.top + lr.height / 2, rows = [...l.querySelectorAll(".ep-row")]; let i = 0, bd = 1e9; rows.forEach((r, j) => { const b = r.getBoundingClientRect(), d = Math.abs(b.top + b.height / 2 - mid); if (d < bd) { bd = d; i = j; } }); const nm = r => r.querySelector(".ep-main b").textContent.trim(), b = rows[i].getBoundingClientRect(); return { name: nm(rows[i]), prev: nm(rows[i - 1]), next: nm(rows[i + 1]), prevTop: Math.round(rows[i - 1].getBoundingClientRect().top), x: b.left + b.width / 2, y: b.top + b.height / 2, st: l.scrollTop }; }, st);
const headInView = page => page.evaluate(() => { const l = document.querySelector("#entityPicker .ep-list"), lr = l.getBoundingClientRect(), h = l.querySelector(".ep-sel-h"); if (!h) return false; const b = h.getBoundingClientRect(); return b.top >= lr.top - 1 && b.bottom <= lr.bottom + 1; });

test("a long list: the first tick is followed up into view, later clicks hold the place, the keyboard follows; nothing ticked is cut off", async ({ page }) => {
  await signIn(page);
  const m = await setup(page);
  await addMany(page, m);
  try {
    await openPicker(page, m.task);
    const l = await layout(page, m.tag);
    /* Delta and Bravo were used lately and sort after the 21 "00 Many" projects by name: they used to be cut off */
    expect(l.slice(0, 8)).toEqual(["# Selected (2)", "Charlie [x]", "Alpha [x]", "---", "Select project later", "# Recent", "Delta", "Bravo"]);

    /* the first tick of this opening, far down the list: the list glides up to show it arriving under "Selected (3)" */
    const one = await pickMid(page, 560);
    expect(one.name).toContain("00 Many");
    await page.mouse.click(one.x, one.y);
    await settled(page);
    expect(await inView(page, one.name), "the moved row is shown").toBe(true);
    expect(await headInView(page), "with its heading").toBe(true);
    await expect(page.locator("#entityPicker .ep-sel-h")).toHaveText("Selected (3)");

    /* a later tick far down: the person is choosing several, the place holds; the rows above the click hold still,
       the next one slides under the pointer, and the list does not run off to the top */
    const pick = await pickMid(page, 560);
    expect(pick.name).toContain("00 Many");
    await page.mouse.click(pick.x, pick.y);
    await settled(page);
    const after = await page.evaluate(p => { const l = document.querySelector("#entityPicker .ep-list"), nm = r => r ? r.querySelector(".ep-main b").textContent.trim() : ""; const rows = [...l.querySelectorAll(".ep-row")], prev = rows.find(r => nm(r) === p.prev), under = document.elementFromPoint(p.x, p.y); return { prevTop: Math.round(prev.getBoundingClientRect().top), under: nm(under && under.closest(".ep-row")), st: l.scrollTop, sel: [...l.querySelectorAll(".ep-row.chosen")].map(nm) }; }, pick);
    expect(after.sel, "ticked and moved under Selected, last").toEqual(["Charlie " + m.tag, "Alpha " + m.tag, one.name, pick.name]);
    expect(Math.abs(after.prevTop - pick.prevTop), "the row above the click holds still").toBeLessThanOrEqual(1);
    expect(after.under, "the next row slides under the pointer").toBe(pick.next);
    expect(after.st, "the list kept its place").toBeGreaterThan(pick.st);
    expect(await inView(page, pick.name), "too far up to show without losing the place").toBe(false);
    await expect(page.locator("#entityPicker .ep-sel-h")).toHaveText("Selected (4)");

    /* just under Selected: the moved row is brought into view, and the place clicked stays in view too */
    const near = await page.evaluate(() => { const l = document.querySelector("#entityPicker .ep-list"), sep = l.querySelector('[data-k="sep"]'); l.scrollTop = sep.offsetTop + sep.offsetHeight + 4; const lr = l.getBoundingClientRect(), nm = r => r.querySelector(".ep-main b").textContent.trim(); const rows = [...l.querySelectorAll(".ep-row")].filter(r => !r.classList.contains("chosen") && !r.querySelector(".ep-none") && r.getBoundingClientRect().top >= lr.top); const r = rows[0], b = r.getBoundingClientRect(); return { name: nm(r), next: nm(rows[1]), x: b.left + b.width / 2, y: b.top + b.height / 2, st: l.scrollTop }; });
    await page.mouse.click(near.x, near.y);
    await settled(page);
    expect(await inView(page, near.name), "the moved row is in view").toBe(true);
    expect(await inView(page, near.next), "and so is the row after the place clicked").toBe(true);
    expect(await page.evaluate(() => document.querySelector("#entityPicker .ep-list").scrollTop), "it scrolled up a little").toBeLessThan(near.st);
    await expect(page.locator("#entityPicker .ep-sel-h")).toHaveText("Selected (5)");

    /* Charlie unticked ranks past the twentieth row: it stays in sight in its place, at the end, rather than vanishing */
    await page.evaluate(() => { document.querySelector("#entityPicker .ep-list").scrollTop = 0; });
    await page.locator("#entityPicker .ep-row", { hasText: "Charlie " + m.tag }).click();
    await settled(page);
    await expect(page.locator("#entityPicker .ep-row", { hasText: "Charlie " + m.tag })).toHaveCount(1);
    await expect(page.locator("#entityPicker .ep-row", { hasText: "Charlie " + m.tag })).not.toHaveClass(/chosen/);
    expect((await layout(page, m.tag)).slice(-1)[0]).toBe("Charlie");
    await expect(page.locator("#entityPicker .ep-sel-h")).toHaveText("Selected (4)");

    /* the keyboard deep in the list: Enter moves the row up and the list follows the highlight there */
    await page.evaluate(() => { document.querySelector("#entityPicker .ep-search").focus(); });
    const target = "00 Many " + m.tag + " 14";
    /* the highlight went with Charlie to the end: up from there */
    expect(await lit(page)).toBe("Charlie " + m.tag);
    for (let i = 0; i < 40 && await lit(page) !== target; i++) await page.keyboard.press("ArrowUp");
    expect(await lit(page)).toBe(target);
    expect(await inView(page, target)).toBe(true);
    await page.keyboard.press("Enter");
    await settled(page);
    expect(await lit(page)).toBe(target);
    expect(await inView(page, target), "the list followed the moved row up").toBe(true);
    expect(await searchFocused(page)).toBe(true);
    await expect(page.locator("#entityPicker .ep-sel-h")).toHaveText("Selected (5)");
    await expect.poll(() => server(page, m.task).then(s => s.split(",").length)).toBe(5);
    await page.keyboard.press("Escape");
  } finally { await cleanup(page, m); }
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("the chosen on top, on screen; a tap moves the row up at once and back again", async ({ page }) => {
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
      const noSideways = () => page.evaluate(() => { const l = document.querySelector("#entityPicker .ep-list"); return l.scrollWidth <= l.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1; });
      expect(await noSideways()).toBe(true);
      await picker.locator(".ep-row", { hasText: "Delta " + m.tag }).tap();
      expect(await layout(page, m.tag), "up at once").toEqual(["# Selected (3)", "Charlie [x]", "Alpha [x]", "Delta [x]", "---", "Select project later", "# Recent", "Bravo", "# Active projects", "Echo"]);
      await expect(picker.locator(".ep-row.ep-moved")).toContainText("Delta " + m.tag);
      await expect.poll(() => server(page, m.task)).toBe(named(m, "Charlie", "Alpha", "Delta"));
      await expect(picker.locator(".ep-sel-h")).toHaveText("Selected (3)");
      await settled(page);
      expect(await noSideways(), "nothing scrolls sideways after the move").toBe(true);
      expect(await inView(page, "Delta " + m.tag)).toBe(true);
      const box1 = await picker.boundingBox();
      expect(Math.abs(box1.y - box.y) + Math.abs(box1.x - box.x), "the picker stays put").toBeLessThan(3);
      /* tapped again: back to Recent */
      await picker.locator(".ep-row", { hasText: "Delta " + m.tag }).tap();
      expect(await layout(page, m.tag)).toEqual(["# Selected (2)", "Charlie [x]", "Alpha [x]", "---", "Select project later", "# Recent", "Delta", "Bravo", "# Active projects", "Echo"]);
      await expect.poll(() => server(page, m.task)).toBe(named(m, "Charlie", "Alpha"));
      await settled(page);
      await page.keyboard.press("Escape");
    } finally { await cleanup(page, m); }
  });
});
