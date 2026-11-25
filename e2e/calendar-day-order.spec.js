/* A calendar day's own order, and its dialog (Nov 2026). The owner asked to reorder a day's tasks in the dialog that
   "+N more" opens, by dragging them, and to drag a task from that dialog onto another day as a chip is dragged. A
   task's place in its day is its own (meta.dayOrder, the move REORDER_TASK_DAY), apart from the board's manual order
   (sort), and the month's cell shows its first three in that order. Two screenshots of the same dialog showed its
   right-hand cells drawn over each other: four people over the due date ("toda", "t"), an asset badge over
   "3 hari terlambat"; its columns now size to their widest cell and line up from row to row.
   Checked here, against tasks made through the API and removed after (with the people made for them):
   - the dialog in Indonesian and English, 1366 and 390 px, light and dark, on a day 43 and one 143 days overdue
     (three assets, two to four people, a milestone and the project's deadline) and on today with four people: the
     files, the due date, the people and the title never overlap, the due date is never cut, every row's due date and
     asset badge start at the same x, and nothing leaves the dialog;
   - "+1 more" opens it; a row dragged above the first shows where it lands, moves there, stays there after a reload,
     the cell's first three follow and the board's order (sort) is unchanged;
   - the keyboard: Space takes a row's handle, the arrows move it with the focus on it, Enter puts it down, Escape lets
     go and the dialog stays; a colleague's open dialog follows live;
   - a row carried past the card's edge: the dialog fades and lets the pointer through, a day that was under the card
     takes the drop, the due date moves as a chip's does, and the dialog comes back with one item fewer; a drag let go
     elsewhere changes nothing, and overshooting by a little stays a reorder;
   - the week view's dialog, in Indonesian: the drag to another day and the toast;
   - a viewer: no row or chip moves, and the server answers 403; a bad key or a day that is not the due date, 400. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page, who) {
  await page.goto("/");
  await page.locator("#au_email").fill(who.email);
  await page.locator("#au_pw").fill(who.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const tag = Date.now().toString(36);
const VIEWER = { name: "Vera Viewer " + tag, email: "vera-cdo-" + tag + "@e2e.test", pw: "Vera!Order-2026x" };
/* the drag day (in nine days), the two overdue days and today */
const OFF = { drag: 9, late: -43, later: -143, today: 0 };
let admin, M = null;

test.beforeAll(async ({ browser }) => {
  admin = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await signIn(admin, ADMIN);
  M = await admin.evaluate(async ([o, v, OFF]) => {
    const m = { people: [], tasks: {}, all: [], me: ME, pid: "pcdo" + o };
    const people = async () => (await apiFetch("GET", "/api/bootstrap")).people;
    for (let i = 1; i <= 3; i++) { const email = "cdo" + i + "-" + o + "@e2e.test"; await apiFetch("POST", "/api/members", { name: "Order Person " + i + " " + o, email, perm: "member", cap: 40 }); const p = await people(); m.people.push(Object.keys(p).find(id => p[id].email === email)); }
    await apiFetch("POST", "/api/members", { name: v.name, email: v.email, perm: "viewer", cap: 40 });
    const p = await people(); m.viewer = Object.keys(p).find(id => p[id].email === v.email);
    await apiFetch("POST", "/api/members/" + m.viewer + "/password", { password: v.pw });
    m.day = {}; Object.keys(OFF).forEach(k => { m.day[k] = iso(OFF[k]); });
    await apiFetch("POST", "/api/projects", { id: m.pid, name: "Order project " + o, status: "active", owner: ME, startDate: m.day.later, dueDate: m.day.late, milestones: [{ id: "ms" + o, name: "Order milestone", dueDate: m.day.late, done: false }] });
    const st = WS.workflow.filter(s => s.kind !== "closed")[1].id, two = [ME, m.people[0]], four = [ME].concat(m.people);
    const make = async (key, day, title, who, assets) => { const t = await apiFetch("POST", "/api/tasks", { title: title + " " + o, status: st, prio: "medium", assignee: ME, assignees: who, proj: m.pid, assetCount: assets || 0, startDate: day, dueDate: day }); m.tasks[key] = t.id; m.all.push(t.id); };
    for (const k of ["A", "B", "C", "E"]) await make(k, m.day.drag, "Order " + k, [ME]);
    await make("L1", m.day.late, "Late with files", two, 3);
    await make("L2", m.day.late, "Late with four people", four, 0);
    await make("L3", m.day.late, "Late with files and four people", four, 3);
    await make("H1", m.day.later, "Much later with files and four", four, 3);
    await make("H2", m.day.later, "Much later with two", two, 0);
    await make("Z1", m.day.today, "Today with four people and files", four, 3);
    await make("Z2", m.day.today, "Today with four people", four, 0);
    await make("Z3", m.day.today, "Today with two", two, 0);
    await make("Z4", m.day.today, "Today alone", [ME], 0);
    await reloadAll();
    m.was = { calMode: S.calMode, calScope: S.calScope, calDay: S.calDay, calYear: S.calYear, calMonth: S.calMonth, sort: S.sort };
    return m;
  }, [tag, VIEWER, OFF]);
});
test.afterAll(async () => {
  if (!admin || !M) return;
  await admin.evaluate(async m => {
    try { closeModal(); setLanguage("en"); document.documentElement.removeAttribute("data-theme"); Object.assign(S, m.was); go("home"); } catch (e) {}
    for (const id of m.all) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {});
    await apiFetch("DELETE", "/api/projects/" + m.pid).catch(() => {});
    for (const id of m.people.concat([m.viewer])) if (id) await apiFetch("DELETE", "/api/members/" + id).catch(() => {});
  }, M).catch(() => {});
  await admin.context().close().catch(() => {});
});

/* the month of a day, on the Calendar screen, every task shown */
const showMonth = (page, day) => page.evaluate(k => { closeModal(); const d = dateOf(offsetFromIso(k)); S.calMode = "month"; S.calYear = d.getFullYear(); S.calMonth = d.getMonth(); S.calScope = "all"; S.filters = emptyTaskFilters(); go("calendar"); }, day);
const dayCell = (page, day) => page.evaluate(k => offsetFromIso(k), day).then(off => page.locator('#content .cal-day[data-off="' + off + '"]').first());
const chips = async (page, day) => (await dayCell(page, day)).locator(".chip[data-id]").evaluateAll(els => els.map(e => e.getAttribute("data-id")));
const rows = page => page.locator("#modalWrap.open .cal-more-list > .task-row");
const order = page => rows(page).evaluateAll(els => els.map(e => e.getAttribute("data-id")));
const rowOf = (page, id) => page.locator('#modalWrap.open .cal-more-list > .task-row[data-id="' + id + '"]');
const saved = (page, ids) => page.evaluate(ids => Promise.all(ids.map(id => apiFetch("GET", "/api/tasks/" + id).then(t => ({ id, sort: t.sort, due: t.dueDate, start: t.startDate, dayOrder: (t.meta || {}).dayOrder || null })))), ids);
/* the day's tasks in the order their saved keys give (the day's own place where it holds, the board's otherwise) */
const savedOrder = async (page, ids, day) => (await saved(page, ids)).map(t => ({ id: t.id, k: t.dayOrder && t.dayOrder.d === day ? t.dayOrder.k : t.sort, s: t.sort })).sort((a, b) => (a.k - b.k) || (a.s - b.s)).map(t => t.id);
/* a drag with the mouse: pressed on the row's title, carried through each point in turn, let go at the last. A
   browser fires dragover again and again while the pointer rests; the test's browser only when it moves, and not on
   the move that enters an element, so the pointer stirs a pixel at each point. */
async function drag(page, row, points, during) {
  const b = await row.boundingBox(), x = b.x + Math.min(260, b.width / 2), y = b.y + b.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 4, y + 4, { steps: 2 });
  for (let i = 0; i < points.length; i++) { const p = points[i]; await page.mouse.move(p.x, p.y, { steps: 8 }); await page.mouse.move(p.x + 1, p.y); await page.mouse.move(p.x, p.y); if (during && during[i]) await during[i](); }
  await page.mouse.up();
}

/* every row's files, due date, people and title, measured */
function measure() {
  const list = document.querySelector("#modalWrap.open .cal-more-list"), R = e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
  return { sw: list.scrollWidth, cw: list.clientWidth, vw: document.documentElement.clientWidth, modal: R(document.getElementById("modal")),
    rows: [...list.querySelectorAll(":scope > .row")].map(row => { const q = s => row.querySelector(s), dueCell = q(".mcell-due");
      return { id: row.getAttribute("data-id") || "context", row: R(row), title: R(q(".mcell-main") || q(':scope > div[style*="min-width"]')), badge: q(".mcell-assets .acount") && R(q(".mcell-assets .acount")), dueCell: R(dueCell), due: R(q(".mcell-due .due")), text: q(".mcell-due .due").textContent, clip: dueCell.scrollWidth - dueCell.clientWidth, who: (q(".mcell-who .av-stack") || q(".mcell-who .av")) && R(q(".mcell-who .av-stack") || q(".mcell-who .av")), people: row.querySelectorAll(".mcell-who .av").length }; }) };
}
const hit = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
function checkLayout(m, where) {
  expect(m.sw, where + ": the list does not scroll sideways").toBeLessThanOrEqual(m.cw);
  expect(m.modal.l, where + ": the dialog is on the screen").toBeGreaterThanOrEqual(0);
  expect(m.modal.r, where + ": the dialog is on the screen").toBeLessThanOrEqual(m.vw + 0.5);
  for (const r of m.rows) {
    const at = where + " " + r.id;
    const parts = [["files", r.badge], ["due", r.due], ["people", r.who], ["title", r.title]].filter(p => p[1]);
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) expect(hit(parts[i][1], parts[j][1]), at + ": " + parts[i][0] + " and " + parts[j][0] + " do not overlap").toBe(false);
      expect(parts[i][1].l >= r.row.l - 0.5 && parts[i][1].r <= r.row.r + 0.5, at + ": " + parts[i][0] + " is inside the row").toBe(true);
    }
    expect(r.clip, at + ": the due date '" + r.text + "' is not cut").toBeLessThanOrEqual(0);
    expect(r.due.l >= r.dueCell.l - 0.5 && r.due.r <= r.dueCell.r + 0.5, at + ": the due date is inside its cell, not spilling out of it").toBe(true);
  }
  const lefts = k => m.rows.filter(r => r[k]).map(r => Math.round(r[k].l));
  expect(new Set(lefts("dueCell")).size, where + ": every due date starts at the same x " + JSON.stringify(lefts("dueCell"))).toBe(1);
  expect(new Set(lefts("badge")).size, where + ": every asset badge starts at the same x " + JSON.stringify(lefts("badge"))).toBeLessThanOrEqual(1);
}

test("the dialog's columns line up and never overlap: Indonesian and English, 1366 and 390 px, light and dark", async () => {
  const page = admin;
  try {
    for (const lang of ["id", "en"]) for (const theme of ["light", "dark"]) for (const width of [1366, 390]) for (const which of ["late", "later", "today"]) {
      await page.setViewportSize({ width, height: width > 600 ? 900 : 844 });
      await page.evaluate(([l, t]) => { setLanguage(l); if (t === "dark") document.documentElement.setAttribute("data-theme", "dark"); else document.documentElement.removeAttribute("data-theme"); }, [lang, theme]);
      await page.waitForFunction(l => UI_LANG === l, lang);
      await showMonth(page, M.day[which]);
      const where = [lang, theme, width, which].join(" ");
      if (width > 600 && which === "late") {
        /* the cell's "+N more" opens it: three tasks, the milestone and the project's deadline */
        await (await dayCell(page, M.day.late)).locator(".chip.more").click();
      } else await page.evaluate(k => calAgenda(k), M.day[which]);
      await expect(page.locator("#modalWrap.open .cal-more-list")).toBeVisible();
      const m = await page.evaluate(measure);
      const late = m.rows.filter(r => r.id !== "context");
      expect(late.length, where).toBe(which === "late" ? 3 : which === "later" ? 2 : 4);
      if (which === "late") { expect(m.rows.length, where + ": the milestone and the deadline are rows too").toBe(5); expect(late.filter(r => r.badge).length).toBe(2); expect(Math.max(...late.map(r => r.people))).toBe(4); }
      const words = { late: { id: "43 hari terlambat", en: "43d overdue" }, later: { id: "143 hari terlambat", en: "143d overdue" }, today: { id: "hari ini", en: "today" } }[which][lang];
      for (const r of late) expect(r.text, where).toBe(words);
      checkLayout(m, where);
      await page.evaluate(() => closeModal());
    }
  } finally {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.evaluate(() => { setLanguage("en"); document.documentElement.removeAttribute("data-theme"); });
  }
});

test("\"+1 more\" opens the day; a row dragged above the first lands there, stays after a reload, and the board's order is untouched", async () => {
  const page = admin, T = M.tasks, ids = [T.A, T.B, T.C, T.E];
  await showMonth(page, M.day.drag);
  expect(await chips(page, M.day.drag), "the board's order places them at first").toEqual([T.A, T.B, T.C]);
  const before = await saved(page, ids);
  await (await dayCell(page, M.day.drag)).locator(".chip.more").click();
  await expect(page.locator("#modal h3")).toHaveText(/ · 4 items$/);
  expect(await order(page)).toEqual(ids);
  await expect(page.locator("#modalWrap.open .cal-more-list")).toHaveClass(/cal-dd/);
  await expect(page.locator("#modalWrap.open .cal-dd-hint")).toBeVisible();
  for (const id of ids) { await expect(rowOf(page, id)).toHaveAttribute("draggable", "true"); await expect(rowOf(page, id).locator(".cal-dd-h")).toHaveCount(1); }
  /* E, carried to the top half of A: a line says it lands before A */
  const a = await rowOf(page, T.A).boundingBox();
  await drag(page, rowOf(page, T.E), [{ x: a.x + 300, y: a.y + 8 }], [async () => { await expect(rowOf(page, T.A)).toHaveClass(/cal-drop-before/); await expect(page.locator("#modalWrap")).not.toHaveClass(/cal-dd-out/); }]);
  await expect.poll(() => order(page)).toEqual([T.E, T.A, T.B, T.C]);
  await expect(page.locator("#modalWrap")).toHaveClass(/open/);
  await expect(page.locator("#modal h3")).toHaveText(/ · 4 items$/);
  await expect(page.locator("#modalWrap.open .cal-drop-before, #modalWrap.open .cal-drop-after, #modalWrap.open .dragging")).toHaveCount(0);
  expect(await page.evaluate(() => S.drawerTask || null), "the drag opened no task").toBe(null);
  /* the calendar behind follows: the cell's first three */
  await expect.poll(() => chips(page, M.day.drag)).toEqual([T.E, T.A, T.B]);
  /* saved: E's place in this day, between nothing and A; the board's order of all four as it was */
  await expect.poll(async () => (await saved(page, [T.E]))[0].dayOrder).toEqual({ d: M.day.drag, k: before[0].sort - 1000 });
  const after = await saved(page, ids);
  expect(after.map(t => t.sort), "the board's manual order is unchanged").toEqual(before.map(t => t.sort));
  expect(after.filter(t => t.id !== T.E).map(t => t.dayOrder)).toEqual([null, null, null]);
  expect(await savedOrder(page, ids, M.day.drag)).toEqual([T.E, T.A, T.B, T.C]);
  /* the board itself, by hand: as before */
  await page.evaluate(() => { closeModal(); S.sort = "manual"; S.sortDir = 1; S.taskView = "kanban"; S.taskScope = "all"; S.filters = emptyTaskFilters(); go("tasks"); });
  await expect.poll(() => page.locator("#content .kcard[data-id]").evaluateAll((els, ids) => els.map(e => e.getAttribute("data-id")).filter(id => ids.includes(id)), ids)).toEqual(ids);
  /* after a reload */
  await page.reload(); await ready(page);
  await showMonth(page, M.day.drag);
  await expect.poll(() => chips(page, M.day.drag)).toEqual([T.E, T.A, T.B]);
  await (await dayCell(page, M.day.drag)).locator(".chip.more").click();
  expect(await order(page)).toEqual([T.E, T.A, T.B, T.C]);
});

test("the keyboard: Space takes a row, the arrows move it with the focus on it, Enter puts it down, Escape lets go; a colleague's open dialog follows live", async ({ browser }) => {
  const page = admin, T = M.tasks, ids = [T.A, T.B, T.C, T.E];
  const other = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  try {
    await signIn(other, ADMIN);
    await showMonth(other, M.day.drag); await other.evaluate(k => calAgenda(k), M.day.drag);
    expect(await order(other)).toEqual([T.E, T.A, T.B, T.C]);
    await showMonth(page, M.day.drag); await page.evaluate(k => calAgenda(k), M.day.drag);
    const handle = id => rowOf(page, id).locator(".cal-dd-h");
    await expect(handle(T.B)).toHaveAttribute("aria-label", /^Reorder — Order B /);
    await handle(T.B).focus();
    await page.keyboard.press("Space");
    await expect(rowOf(page, T.B)).toHaveClass(/kb-grabbed/);
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => order(page)).toEqual([T.E, T.B, T.A, T.C]);
    await expect(handle(T.B)).toBeFocused();
    await expect(rowOf(page, T.B)).toHaveClass(/kb-grabbed/);
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => order(page)).toEqual([T.B, T.E, T.A, T.C]);
    await expect(handle(T.B)).toBeFocused();
    /* at the top it stays */
    await page.keyboard.press("ArrowUp");
    expect(await order(page)).toEqual([T.B, T.E, T.A, T.C]);
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => order(page)).toEqual([T.E, T.B, T.A, T.C]);
    await expect(handle(T.B)).toBeFocused();
    /* Enter puts it down; Space takes it again; Escape lets go of the row, not of the dialog */
    await page.keyboard.press("Enter");
    await expect(rowOf(page, T.B)).not.toHaveClass(/kb-grabbed/);
    await page.keyboard.press("ArrowDown");
    expect(await order(page), "a row put down does not move").toEqual([T.E, T.B, T.A, T.C]);
    await page.keyboard.press("Space");
    await expect(rowOf(page, T.B)).toHaveClass(/kb-grabbed/);
    await page.keyboard.press("Escape");
    await expect(rowOf(page, T.B)).not.toHaveClass(/kb-grabbed/);
    await expect(page.locator("#modalWrap")).toHaveClass(/open/);
    await expect.poll(() => savedOrder(page, ids, M.day.drag)).toEqual([T.E, T.B, T.A, T.C]);
    expect((await saved(page, ids)).map(t => t.sort), "the board's order is still its own").toEqual((await saved(page, ids)).map(t => t.sort).slice().sort((x, y) => x - y));
    await expect.poll(() => chips(page, M.day.drag)).toEqual([T.E, T.B, T.A]);
    /* the colleague's dialog, open all along, follows */
    await expect.poll(() => order(other), { timeout: 10000 }).toEqual([T.E, T.B, T.A, T.C]);
    await expect(other.locator("#modalWrap")).toHaveClass(/open/);
    await expect(other.locator("#modal h3")).toHaveText(/ · 4 items$/);
    await expect.poll(() => chips(other, M.day.drag)).toEqual([T.E, T.B, T.A]);
  } finally { await other.context().close().catch(() => {}); }
});

test("a row carried past the card goes to another day, one that was under the card too; let go elsewhere, nothing changes", async () => {
  const page = admin, T = M.tasks;
  await showMonth(page, M.day.drag); await page.evaluate(k => calAgenda(k), M.day.drag);
  expect(await order(page)).toEqual([T.E, T.B, T.A, T.C]);
  const card = await page.locator("#modal").boundingBox(), outside = { x: card.x + card.width / 2, y: card.y - 70 };
  /* a day under the card, the one nearest its middle */
  const target = await page.evaluate(([c, k]) => { const cx = c.x + c.width / 2, cy = c.y + c.height / 2; let best = null;
    document.querySelectorAll("#content .cal-grid .cal-day[data-off]").forEach(el => { const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, off = +el.getAttribute("data-off"), d = Math.hypot(x - cx, y - cy);
      if (iso(off) !== k && x > c.x && x < c.x + c.width && y > c.y && y < c.y + c.height && (!best || d < best.d)) best = { off, x, y, d }; });
    return best; }, [card, M.day.drag]);
  expect(target, "a day lies under the dialog").toBeTruthy();
  const spot = { x: target.x, y: target.y }, targetCell = page.locator('#content .cal-day[data-off="' + target.off + '"]').first();
  /* overshooting the card by a little is still a reorder */
  const c = await rowOf(page, T.C).boundingBox(), a = await rowOf(page, T.A).boundingBox();
  await drag(page, rowOf(page, T.C), [{ x: card.x + card.width + 12, y: c.y + c.height / 2 }, { x: a.x + 300, y: a.y + 6 }], [async () => { await page.waitForTimeout(150); await expect(page.locator("#modalWrap")).not.toHaveClass(/cal-dd-out/); }]);
  await expect.poll(() => order(page)).toEqual([T.E, T.B, T.C, T.A]);
  /* C, past the card's edge: the dialog fades and lets the pointer through; the day under it takes the drop */
  const span = await page.evaluate(id => task(id).span, T.C);
  await drag(page, rowOf(page, T.C), [outside, spot], [
    async () => { await expect(page.locator("#modalWrap")).toHaveClass(/cal-dd-out/); await expect.poll(() => page.evaluate(() => +getComputedStyle(document.getElementById("modal")).opacity)).toBeLessThan(0.3); expect(await page.evaluate(() => getComputedStyle(document.getElementById("modalWrap")).pointerEvents)).toBe("none"); },
    async () => { await expect(targetCell).toHaveClass(/\bover\b/); }]);
  await expect(page.locator("#modalWrap")).not.toHaveClass(/cal-dd-out/);
  await expect(page.locator("#modalWrap")).toHaveClass(/open/);
  await expect.poll(() => order(page)).toEqual([T.E, T.B, T.A]);
  await expect(page.locator("#modal h3")).toHaveText(/ · 3 items$/);
  await expect(page.locator("#toasts .toast").last()).toHaveText("Due date moved to " + await page.evaluate(o => dueDate(o), target.off));
  await expect.poll(async () => { const s = (await saved(page, [T.C]))[0]; return [s.due, s.start]; }).toEqual(await page.evaluate(([o, sp]) => [iso(o), iso(o - sp)], [target.off, span]));
  await expect.poll(() => targetCell.locator('.chip[data-id="' + T.C + '"]').count()).toBe(1);
  expect(await chips(page, M.day.drag)).toEqual([T.E, T.B, T.A]);
  /* A, past the card and let go on the page's heading: no day, nothing changes, the dialog is back as it was */
  const before = await saved(page, [T.E, T.B, T.A]);
  const head = await page.locator("#content .pagehead h1").boundingBox();
  await drag(page, rowOf(page, T.A), [outside, { x: head.x + head.width / 2, y: head.y + head.height / 2 }], [async () => { await expect(page.locator("#modalWrap")).toHaveClass(/cal-dd-out/); }]);
  await expect(page.locator("#modalWrap")).not.toHaveClass(/cal-dd-out/);
  await expect(page.locator("#modalWrap")).toHaveClass(/open/);
  expect(await order(page)).toEqual([T.E, T.B, T.A]);
  await expect(page.locator("#modal h3")).toHaveText(/ · 3 items$/);
  await page.waitForTimeout(400);
  expect(await saved(page, [T.E, T.B, T.A])).toEqual(before);
  await expect(page.locator("#content .cal-day.over")).toHaveCount(0);
});

test("the week view's dialog, in Indonesian: a row dragged onto the next day moves there", async () => {
  const page = admin, T = M.tasks;
  try {
    await page.evaluate(() => setLanguage("id")); await page.waitForFunction(() => UI_LANG === "id");
    await page.evaluate(k => { closeModal(); S.calMode = "week"; S.calScope = "all"; S.filters = emptyTaskFilters(); S.calDay = offsetFromIso(k); go("calendar"); }, M.day.drag);
    /* what "+N more" opens in a week (12 to a day) */
    await page.evaluate(k => calAgenda(k), M.day.drag);
    await expect(page.locator("#modal h3")).toHaveText(/ · 3 item$/);
    await expect(page.locator("#modalWrap.open .cal-dd-hint")).toHaveText("Seret task untuk mengubah urutannya di hari itu, atau ke hari lain di kalender untuk memindahkan tenggatnya.");
    await expect(rowOf(page, T.B).locator(".cal-dd-h")).toHaveAttribute("aria-label", /^Ubah urutan — Order B /);
    const off = await page.evaluate(k => offsetFromIso(k), M.day.drag), dow = await page.evaluate(o => (dateOf(o).getDay() + 6) % 7, off), to = dow === 6 ? off - 1 : off + 1;
    const cellBox = await page.locator('#content .cal-week .cal-day[data-off="' + to + '"]').boundingBox(), card = await page.locator("#modal").boundingBox();
    await drag(page, rowOf(page, T.B), [{ x: card.x + card.width / 2, y: card.y - 70 }, { x: cellBox.x + cellBox.width / 2, y: cellBox.y + Math.min(cellBox.height - 20, 140) }], [async () => { await expect(page.locator("#modalWrap")).toHaveClass(/cal-dd-out/); }]);
    await expect.poll(() => order(page)).toEqual([T.E, T.A]);
    await expect(page.locator("#modal h3")).toHaveText(/ · 2 item$/);
    await expect(page.locator("#toasts .toast").last()).toHaveText("Tenggat dipindah ke " + await page.evaluate(o => dueDate(o), to));
    await expect.poll(async () => (await saved(page, [T.B]))[0].due).toBe(await page.evaluate(o => iso(o), to));
    await expect(page.locator('#content .cal-week .cal-day[data-off="' + to + '"] .chip[data-id="' + T.B + '"]')).toHaveCount(1);
  } finally { await page.evaluate(() => { closeModal(); setLanguage("en"); S.calMode = "month"; }); }
});

test("a viewer: no row or chip moves, and the server refuses; a bad key or another day is refused too", async ({ browser }) => {
  const T = M.tasks;
  const viewer = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  try {
    await signIn(viewer, VIEWER);
    expect(await viewer.evaluate(() => canI.createTask())).toBe(false);
    await showMonth(viewer, M.day.late);
    const lateCell = await dayCell(viewer, M.day.late);
    await expect(lateCell.locator(".chip[data-id]").first()).toBeVisible();
    expect(await lateCell.locator(".chip[data-id]").evaluateAll(els => els.filter(e => e.getAttribute("draggable") === "true").length), "no chip moves").toBe(0);
    /* a click on the day opens the same dialog for someone who cannot create tasks */
    await lateCell.locator(".dn").click();
    await expect(viewer.locator("#modalWrap.open .cal-more-list")).toBeVisible();
    await expect(rows(viewer)).toHaveCount(3);
    await expect(viewer.locator("#modalWrap.open .cal-more-list")).not.toHaveClass(/cal-dd/);
    await expect(viewer.locator("#modalWrap.open .cal-dd-h")).toHaveCount(0);
    await expect(viewer.locator('#modalWrap.open .cal-more-list [draggable="true"]')).toHaveCount(0);
    await expect(viewer.locator("#modalWrap.open .cal-dd-hint")).toBeHidden();
    const post = (page, id, body) => page.evaluate(([id, body]) => fetch("/api/tasks/" + id + "/move", { method: "POST", credentials: "same-origin", headers: zcTabHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) }).then(r => r.status), [id, body]);
    const before = await saved(admin, [T.L1]);
    expect(await post(viewer, T.L1, { type: "REORDER_TASK_DAY", day: M.day.late, key: 5 }), "a viewer may not").toBe(403);
    /* the admin: a key that is not a number, none, or a day that is not the due date */
    expect(await post(admin, T.L1, { type: "REORDER_TASK_DAY", day: M.day.late, key: "5" })).toBe(400);
    expect(await post(admin, T.L1, { type: "REORDER_TASK_DAY", day: M.day.late, key: null })).toBe(400);
    expect(await post(admin, T.L1, { type: "REORDER_TASK_DAY", day: M.day.late })).toBe(400);
    expect(await post(admin, T.L1, { type: "REORDER_TASK_DAY", day: M.day.today, key: 5 })).toBe(400);
    expect(await saved(admin, [T.L1])).toEqual(before);
    /* and one that is right */
    expect(await post(admin, T.L1, { type: "REORDER_TASK_DAY", day: M.day.late, key: 5 })).toBe(200);
    expect((await saved(admin, [T.L1]))[0].dayOrder).toEqual({ d: M.day.late, k: 5 });
  } finally { await viewer.context().close().catch(() => {}); }
});
