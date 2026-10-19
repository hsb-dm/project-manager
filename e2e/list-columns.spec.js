/* The Tasks List's columns are moved by dragging a header and sized by dragging its edge (src/list-columns.js), kept
   for the person across reloads, and "Reset columns" brings the usual back. A click on a header still sorts; the rows'
   own drag-and-drop between groups still works; the keyboard moves and sizes a column; on a phone the cards keep their
   layout whatever the order, and on a touch tablet a header is held to pick it up while a swipe still scrolls. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const DEF = ["title", "status", "dependency", "team", "assignee", "proj", "prio", "start", "due", "effort", "tags"];
test.use({ viewport: { width: 1680, height: 900 } });   /* the whole table in view, so a drag never has to scroll it */
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const resetPrefs = page => page.evaluate(() => { myPrefs().listCols = {}; return saveMyPrefs(); });
const showList = (page, tag, group) => page.evaluate(([t, g]) => { UI_LANG = "en"; S.taskScope = "all"; S.taskView = "list"; S.sort = "manual"; S.sortDir = 1; S.group = g || ""; S.filters = Object.assign(emptyTaskFilters(), { tag: t }); if (S.screen !== "tasks") go("tasks"); else renderScreen(false); }, [tag, group]);
const heads = page => page.$$eval("#content .lcol-tbl thead th[data-col]", ths => ths.map(t => t.getAttribute("data-col")));
const cells = (page, id) => page.$$eval('#content .lcol-tbl tr[data-id="' + id + '"] > td', tds => tds.map(td => (td.className.match(/lcol-(\w+)/) || [, td.className.split(" ")[0] || "?"])[1]));
const box = (page, sel) => page.locator(sel).first().boundingBox();
const saved = page => page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(b => (b.people[ME].prefs || {}).listCols || null));
async function makeTasks(page, tag) {
  return page.evaluate(async t => {
    const st = WS.workflow.filter(s => s.kind !== "closed").map(s => s.id), ids = [];
    for (const [i, title] of ["Alpha banner " + t, "Beta poster " + t, "Gamma reel " + t].entries()) {
      const d = await apiFetch("POST", "/api/tasks", { title, status: st[i === 2 ? 1 : 0], prio: "medium", assignee: ME, assignees: [ME], tags: [t] });
      TASKS.push(hTask(d)); ids.push(d.id);
    }
    return ids;
  }, tag);
}
const dropTasks = (page, ids) => page.evaluate(list => Promise.all(list.map(i => apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}))), ids);

test("headers move by dragging, edges size the columns, both kept; a click still sorts; Reset brings the usual back", async ({ page }) => {
  await signIn(page);
  const tag = "lcol" + Date.now().toString(36);
  await resetPrefs(page);
  const ids = await makeTasks(page, tag);
  try {
    await showList(page, tag);
    expect(await heads(page)).toEqual(DEF);
    expect(await cells(page, ids[0])).toEqual(["tcheck-col", "drag-h"].concat(DEF));
    await expect(page.locator("#content .lcol-reset")).toBeHidden();
    expect(await page.locator('#content .lcol-tbl th[data-col="status"]').getAttribute("title")).toBe("Drag to move · drag the edge to resize");

    /* a plain click sorts, a second one reverses it */
    await page.locator('#content .lcol-tbl th[data-col="due"] .lcol-lbl').click();
    expect(await page.evaluate(() => [S.sort, S.sortDir])).toEqual(["due", 1]);
    await page.locator('#content .lcol-tbl th[data-col="due"] .lcol-lbl').click();
    expect(await page.evaluate(() => [S.sort, S.sortDir])).toEqual(["due", -1]);
    await page.evaluate(() => { S.sort = "manual"; S.sortDir = 1; renderScreen(false); });

    /* drag Assignee in front of Status: a ghost and a line between the headers, nothing redrawn until the drop */
    await page.evaluate(() => { window.__lcolTbl = document.querySelector("#content .lcol-tbl"); });
    const a = await box(page, '#content .lcol-tbl th[data-col="assignee"]'), s = await box(page, '#content .lcol-tbl th[data-col="status"]');
    await page.mouse.move(a.x + a.width / 2 - 10, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(s.x + 8, s.y + s.height / 2, { steps: 12 });
    const during = await page.evaluate(() => { const l = document.querySelector(".lcol-drop"), g = document.querySelector(".lcol-ghost"); return { line: l && Math.round(l.getBoundingClientRect().left), ghost: g && g.textContent, same: document.querySelector("#content .lcol-tbl") === window.__lcolTbl, src: document.querySelector('#content th[data-col="assignee"]').classList.contains("lcol-src") }; });
    expect(during.ghost).toBe("Assignee");
    expect(Math.abs(during.line - s.x)).toBeLessThan(4);
    expect(during.same, "the table is not drawn again while dragging").toBe(true);
    expect(during.src).toBe(true);
    await page.mouse.up();
    const moved = ["title", "assignee", "status", "dependency", "team", "proj", "prio", "start", "due", "effort", "tags"];
    expect(await heads(page)).toEqual(moved);
    expect(await cells(page, ids[1]), "the cells follow the header").toEqual(["tcheck-col", "drag-h"].concat(moved));
    expect(await page.evaluate(() => [document.querySelector("#content .lcol-tbl") !== window.__lcolTbl, !document.querySelector(".lcol-drop,.lcol-ghost"), S.sort])).toEqual([true, true, "manual"]);
    await expect(page.locator("#content .lcol-reset")).toBeVisible();
    await expect.poll(() => saved(page)).toMatchObject({ order: moved });

    /* a drag that comes back to where it started changes nothing and does not sort */
    const d = await box(page, '#content .lcol-tbl th[data-col="due"]');
    await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2); await page.mouse.down();
    await page.mouse.move(d.x + d.width / 2 + 30, d.y + d.height / 2, { steps: 5 }); await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(await heads(page)).toEqual(moved); expect(await page.evaluate(() => S.sort)).toBe("manual");

    /* Esc cancels a move */
    const t = await box(page, '#content .lcol-tbl th[data-col="tags"]');
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2); await page.mouse.down();
    await page.mouse.move(a.x - 200, t.y + t.height / 2, { steps: 10 });
    await expect(page.locator(".lcol-drop")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(".lcol-drop")).toHaveCount(0);
    await page.mouse.up();
    expect(await heads(page)).toEqual(moved); expect(await page.evaluate(() => S.sort)).toBe("manual");

    /* until a column is sized the spare room is shared by every column, as before (Task has its usual width too) */
    const widths = () => page.$$eval("#content .lcol-tbl thead th[data-col]", ths => Object.fromEntries(ths.map(t => [t.getAttribute("data-col"), t.getBoundingClientRect().width])));
    const w1 = await widths();
    expect(await page.locator('#content .lcol-tbl th[data-col="title"]').getAttribute("style")).toContain("width:164px");
    expect(w1.proj / 130).toBeGreaterThan(1.05); expect(Math.abs(w1.proj / 130 - w1.status / 116)).toBeLessThan(0.02);
    /* size Project by dragging its edge: live, without drawing a row again, and no other column jumps */
    const P = Math.round(w1.proj) + 60;
    await page.evaluate(id => { window.__lcolRow = document.querySelector('#content tr[data-id="' + id + '"]'); window.__lcolTbl = document.querySelector("#content .lcol-tbl"); }, ids[0]);
    const h = await box(page, '#content .lcol-tbl th[data-col="proj"] .lcol-rz');
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + 60, h.y + h.height / 2, { steps: 8 });
    const live = await page.evaluate(id => ({ w: Math.round(document.querySelector('#content th[data-col="proj"]').getBoundingClientRect().width), sameRow: document.querySelector('#content tr[data-id="' + id + '"]') === window.__lcolRow }), ids[0]);
    expect(live).toEqual({ w: P, sameRow: true });
    const w2 = await widths();
    for (const k of moved) if (k !== "proj" && k !== "title") expect(Math.abs(w2[k] - w1[k]), k + " keeps its width").toBeLessThan(1.01);
    expect(w2.title, "Task gives the room").toBeLessThan(w1.title);
    await page.mouse.up();
    expect(await page.evaluate(() => [document.querySelector("#content .lcol-tbl") === window.__lcolTbl, S.sort])).toEqual([true, "manual"]);
    await expect.poll(() => saved(page)).toMatchObject({ order: moved, w: { proj: P } });
    /* never narrower than its least width */
    const h2 = await box(page, '#content .lcol-tbl th[data-col="team"] .lcol-rz');
    await page.mouse.move(h2.x + h2.width / 2, h2.y + h2.height / 2); await page.mouse.down();
    await page.mouse.move(h2.x - 300, h2.y + h2.height / 2, { steps: 6 }); await page.mouse.up();
    expect(Math.round((await box(page, '#content .lcol-tbl th[data-col="team"]')).width)).toBe(60);
    await expect.poll(() => saved(page)).toMatchObject({ w: { proj: P, team: 60 } });

    /* kept after a reload */
    await page.reload(); await ready(page); await showList(page, tag);
    expect(await heads(page)).toEqual(moved);
    expect(await cells(page, ids[2])).toEqual(["tcheck-col", "drag-h"].concat(moved));
    expect(Math.round((await box(page, '#content .lcol-tbl th[data-col="proj"]')).width)).toBe(P);
    expect(Math.round((await box(page, '#content .lcol-tbl th[data-col="team"]')).width)).toBe(60);

    /* a double-click on the edge gives the usual width back */
    const h3 = await box(page, '#content .lcol-tbl th[data-col="proj"] .lcol-rz');
    await page.mouse.dblclick(h3.x + h3.width / 2, h3.y + h3.height / 2);
    expect(Math.round((await box(page, '#content .lcol-tbl th[data-col="proj"]')).width)).toBe(130);
    await expect.poll(() => saved(page).then(x => x && x.w && [x.w.proj, x.w.team])).toEqual([undefined, 60]);
    expect(await page.evaluate(() => S.sort), "a double-click on the edge does not sort").toBe("manual");

    /* Task can move too, and takes the room left */
    const ti = await box(page, '#content .lcol-tbl th[data-col="title"]'), du = await box(page, '#content .lcol-tbl th[data-col="due"]');
    await page.mouse.move(ti.x + 40, ti.y + ti.height / 2); await page.mouse.down();
    await page.mouse.move(du.x + du.width - 4, du.y + du.height / 2, { steps: 15 }); await page.mouse.up();
    expect(await heads(page)).toEqual(["assignee", "status", "dependency", "team", "proj", "prio", "start", "due", "title", "effort", "tags"]);

    /* Reset columns: the usual order and widths, kept as such */
    await page.locator("#content .lcol-reset").click();
    expect(await heads(page)).toEqual(DEF);
    const w3 = await widths();
    for (const k of DEF) expect(Math.abs(w3[k] - w1[k]), k + " is back to its usual width").toBeLessThan(1.01);
    await expect(page.locator("#content .lcol-reset")).toBeHidden();
    await expect.poll(() => saved(page)).toEqual({});

    /* kept layouts from elsewhere: unknown keys are ignored, a missing column comes back at its usual place, widths are clamped */
    await page.evaluate(() => { myPrefs().listCols = { order: ["bogus", "tags", "title", "<x>"], w: { bogus: 300, status: "x", team: 9999 } }; renderScreen(false); });
    expect(await heads(page)).toEqual(["tags", "title", "status", "dependency", "team", "assignee", "proj", "prio", "start", "due", "effort"]);
    expect(Math.round((await box(page, '#content .lcol-tbl th[data-col="team"]')).width)).toBe(800);
    expect(Math.round((await box(page, '#content .lcol-tbl th[data-col="status"]')).width)).toBe(116);

    /* Indonesian */
    await page.evaluate(() => { UI_LANG = "id"; renderScreen(false); });
    expect(await page.locator('#content .lcol-tbl th[data-col="status"]').getAttribute("title")).toBe("Seret untuk memindahkan · seret tepinya untuk mengubah lebar");
    await expect(page.locator("#content .lcol-reset")).toHaveText("Atur ulang kolom");
    await page.evaluate(() => { UI_LANG = "en"; renderScreen(false); });
  } finally {
    await resetPrefs(page);
    await dropTasks(page, ids);
    await page.evaluate(() => { UI_LANG = "en"; S.filters = emptyTaskFilters(); S.group = ""; S.sort = "manual"; renderScreen(false); });
  }
});

test("the keyboard moves and sizes a column; rows still drag between groups; group rows span every column", async ({ page }) => {
  await signIn(page);
  const tag = "lcolk" + Date.now().toString(36);
  await resetPrefs(page);
  const ids = await makeTasks(page, tag);
  try {
    await showList(page, tag);
    await page.locator('#content .lcol-tbl th[data-col="team"]').focus();
    await page.keyboard.press("Alt+ArrowLeft");
    expect(await heads(page)).toEqual(["title", "status", "team", "dependency", "assignee", "proj", "prio", "start", "due", "effort", "tags"]);
    expect(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-col")), "the header keeps the focus").toBe("team");
    await page.keyboard.press("Alt+ArrowLeft");
    expect((await heads(page)).slice(0, 3)).toEqual(["title", "team", "status"]);
    await expect(page.locator("#lcolLive")).toHaveText("Team: column 2 of 11");
    await page.keyboard.press("Alt+ArrowRight");
    expect((await heads(page)).slice(0, 3)).toEqual(["title", "status", "team"]);
    const teamW = async () => (await box(page, '#content .lcol-tbl th[data-col="team"]')).width;
    const t1 = Math.round((await teamW()) + 16);
    await page.keyboard.press("Alt+Shift+ArrowRight");
    expect(Math.round(await teamW())).toBe(t1);
    await page.keyboard.press("Alt+Shift+ArrowRight");
    expect(Math.round(await teamW())).toBe(t1 + 16);
    await expect(page.locator("#lcolLive")).toHaveText("Team: " + (t1 + 16) + " px wide");
    await page.keyboard.press("Alt+Shift+ArrowLeft");
    expect(Math.round(await teamW())).toBe(t1);
    expect(await page.evaluate(() => document.activeElement.getAttribute("data-col"))).toBe("team");
    await expect.poll(() => saved(page)).toMatchObject({ order: ["title", "status", "team", "dependency", "assignee", "proj", "prio", "start", "due", "effort", "tags"], w: { team: t1 } });
    /* Enter sorts by the focused header */
    await page.locator('#content .lcol-tbl th[data-col="prio"]').focus();
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => [S.sort, document.activeElement.getAttribute("data-col")])).toEqual(["prio", "prio"]);
    expect(await page.locator('#content .lcol-tbl th[data-col="prio"]').getAttribute("aria-sort")).toBe("ascending");
    await page.evaluate(() => { S.sort = "manual"; renderScreen(false); });

    /* grouped by status, with a moved column: group rows span every column, and a row dragged onto another group
       header moves the task there (HTML5 drag-and-drop, as before) */
    await showList(page, tag, "status");
    const span = await page.$$eval("#content .lcol-tbl tr.grp > td", tds => tds.map(td => td.colSpan));
    expect(span.length).toBeGreaterThan(1); expect(new Set(span)).toEqual(new Set([13]));
    const [from, to] = await page.evaluate(id => [task(id).status, WS.workflow.filter(s => s.kind !== "closed")[1].id], ids[0]);
    expect(from).not.toBe(to);
    await page.locator('#content .lcol-tbl tr[data-id="' + ids[0] + '"] td.lcol-tags').dragTo(page.locator('#content .lcol-tbl tr.grp[data-group="' + to + '"]'));
    await expect.poll(() => page.evaluate(id => task(id).status, ids[0])).toBe(to);
    await expect.poll(() => page.evaluate(id => apiFetch("GET", "/api/bootstrap").then(b => b.tasks.find(x => x.id === id).status), ids[0])).toBe(to);
    expect(await heads(page), "dragging a row leaves the columns alone").toEqual(["title", "status", "team", "dependency", "assignee", "proj", "prio", "start", "due", "effort", "tags"]);
    /* and within the list, under Manual sort, a row dropped on another row is placed before it */
    await showList(page, tag);
    const before = await page.$$eval("#content .lcol-tbl tbody tr[data-id]", r => r.map(x => x.getAttribute("data-id")));
    await page.locator('#content .lcol-tbl tr[data-id="' + before[2] + '"] td.lcol-tags').dragTo(page.locator('#content .lcol-tbl tr[data-id="' + before[0] + '"] td.lcol-proj'));
    await expect.poll(() => page.$$eval("#content .lcol-tbl tbody tr[data-id]", r => r.map(x => x.getAttribute("data-id"))[0])).toBe(before[2]);
  } finally {
    await resetPrefs(page);
    await dropTasks(page, ids);
    await page.evaluate(() => { S.filters = emptyTaskFilters(); S.group = ""; S.sort = "manual"; renderScreen(false); });
  }
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("the List's cards keep their layout whatever the column order, and nothing scrolls the page sideways", async ({ page }) => {
    await signIn(page);
    const tag = "lcolp" + Date.now().toString(36);
    await resetPrefs(page);
    const ids = await makeTasks(page, tag);
    try {
      await showList(page, tag);
      const layout = () => page.evaluate(id => { const r = document.querySelector('#content tr[data-id="' + id + '"]'), rb = r.getBoundingClientRect(), o = {}; for (const k of ["title", "status", "dependency", "team", "assignee", "prio", "due"]) { const b = r.querySelector("td.lcol-" + k).getBoundingClientRect(); o[k] = [Math.round(b.left - rb.left), Math.round(b.top - rb.top), Math.round(b.width)]; } for (const k of ["proj", "start", "effort", "tags"]) o[k] = getComputedStyle(r.querySelector("td.lcol-" + k)).display; return o; }, ids[0]);
      const usual = await layout();
      expect(usual.proj).toBe("none"); expect(usual.title[1]).toBeLessThan(usual.status[1]);
      await page.evaluate(() => { myPrefs().listCols = { order: ["tags", "prio", "due", "assignee", "start", "effort", "title", "team", "dependency", "status", "proj"], w: { title: 400, assignee: 300 } }; renderScreen(false); });
      expect(await heads(page)).toEqual(["tags", "prio", "due", "assignee", "start", "effort", "title", "team", "dependency", "status", "proj"]);
      expect(await layout(), "the same card").toEqual(usual);
      const page_ = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: innerWidth, head: getComputedStyle(document.querySelector("#content .lcol-tbl thead")).display, reset: !!document.querySelector("#content .lcol-reset") && getComputedStyle(document.querySelector("#content .lcol-reset")).display }));
      expect(page_.sw).toBeLessThanOrEqual(page_.vw);
      expect(page_.head).toBe("none"); expect(page_.reset).toBe("none");
    } finally {
      await page.evaluate(() => { myPrefs().listCols = {}; return saveMyPrefs(); });
      await dropTasks(page, ids);
      await page.evaluate(() => { S.filters = emptyTaskFilters(); renderScreen(false); });
    }
  });
});

test.describe("touch tablet", () => {
  test.use({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true });
  test("a held header moves; a swipe scrolls the table inside its panel, never the page", async ({ page }) => {
    await signIn(page);
    const tag = "lcolt" + Date.now().toString(36);
    await resetPrefs(page);
    const ids = await makeTasks(page, tag);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: Math.round(x), y: Math.round(y) }] });
    try {
      await showList(page, tag);
      const geo = await page.evaluate(() => { const w = document.querySelector("#content .lcol-tbl").parentNode; return { sw: document.documentElement.scrollWidth, vw: innerWidth, inner: w.scrollWidth > w.clientWidth, left: w.scrollLeft }; });
      expect(geo.sw, "no sideways scroll of the page").toBeLessThanOrEqual(geo.vw);
      expect(geo.inner, "the table scrolls inside its panel").toBe(true);
      /* a quick swipe on the headers scrolls the table and moves nothing */
      const st = await box(page, '#content .lcol-tbl th[data-col="status"]');
      await touch("touchStart", st.x + st.width / 2 + 200, st.y + st.height / 2);
      for (let i = 1; i <= 8; i++) await touch("touchMove", st.x + st.width / 2 + 200 - i * 25, st.y + st.height / 2);
      await touch("touchEnd");
      await expect.poll(() => page.evaluate(() => document.querySelector("#content .lcol-tbl").parentNode.scrollLeft)).toBeGreaterThan(0);
      expect(await heads(page)).toEqual(DEF);
      await page.evaluate(() => { document.querySelector("#content .lcol-tbl").parentNode.scrollLeft = 0; });
      /* held, then moved: Status goes after Team */
      const s = await box(page, '#content .lcol-tbl th[data-col="status"]'), tm = await box(page, '#content .lcol-tbl th[data-col="team"]');
      await touch("touchStart", s.x + s.width / 2, s.y + s.height / 2);
      await page.waitForTimeout(500);
      await expect(page.locator(".lcol-ghost")).toHaveCount(1);
      for (let i = 1; i <= 10; i++) await touch("touchMove", s.x + s.width / 2 + (tm.x + tm.width - 6 - s.x - s.width / 2) * i / 10, s.y + s.height / 2);
      await touch("touchEnd");
      expect(await heads(page)).toEqual(["title", "dependency", "team", "status", "assignee", "proj", "prio", "start", "due", "effort", "tags"]);
      expect(await page.evaluate(() => S.sort), "the hold did not sort").toBe("manual");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
      await page.evaluate(() => { myPrefs().listCols = {}; return saveMyPrefs(); });
      await dropTasks(page, ids);
      await page.evaluate(() => { S.filters = emptyTaskFilters(); renderScreen(false); });
    }
  });
});
