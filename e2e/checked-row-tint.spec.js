/* A task ticked "Mark as checked" ("Tandai dicentang", the personal tick, src/core.js) is tinted with
   --color-success-soft. On a computer or a tablet the List is a table and every cell of a checked row carries the tint
   (.tbl tr.checked>td, src/refinements.css), which reads as one row. On a phone (760 px and below, src/responsive.css)
   the row is a card of loose cells with room around them, and the same rule drew green patches behind the title, the
   status, the team, the due date and the avatar, with gaps between them; there the card carries the tint and its cells
   none, as a selected card already did. The tick is set through the page's own toggleTaskChecked, never its storage.
   Checked and hovered stays checked (a tap leaves :hover behind on a phone), checked and selected is selected, as on
   a computer. The first and the last card follow the panel's round corners, so a tinted one pokes no square corner
   out of them. A Kanban card is one box with a tinted border and is left as it was; the Grid draws no tick. Three tasks in one project are
   made through the API, and they, their ticks and the project are removed after.
   With TINT_SHOTS=<folder>, screenshots at 390 px light and dark and at 1366 px. */
const { test, expect } = require("@playwright/test");
const path = require("path");
test.describe.configure({ mode: "serial" });
const SHOTS = process.env.TINT_SHOTS || "";
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const TAG = "tint" + Date.now().toString(36);
let M = null;   /* { pid, ids } */
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage(); await signIn(page);
  M = await page.evaluate(async tag => {
    const st = WS.workflow.filter(s => s.kind !== "closed").map(s => s.id), pid = "ptn" + tag, ids = [];
    await apiFetch("POST", "/api/projects", { id: pid, name: "Tint " + tag, status: "active", owner: ME, startDate: iso(-3), dueDate: iso(20) });
    for (let i = 0; i < 3; i++) ids.push((await apiFetch("POST", "/api/tasks", { title: ["Hero banner", "Instagram carousel", "Launch video cut"][i] + " " + tag, status: st[0], prio: "medium", assignee: ME, assignees: [ME], reviewer: ME, reviewers: [ME], tags: [tag], proj: pid, startDate: iso(1), dueDate: iso(2 + i) })).id);
    return { pid, ids };
  }, TAG);
  await page.close();
});
/* the ticks it set, then the tasks and the project */
test.afterAll(async ({ browser }) => {
  if (!M) return;
  const page = await browser.newPage(); await signIn(page);
  await page.evaluate(async m => {
    for (const id of m.ids) { try { if (taskChecked(id)) await toggleTaskChecked(id); } catch (e) {} }
    for (const id of m.ids) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {});
    await apiFetch("DELETE", "/api/projects/" + m.pid).catch(() => {});
  }, M);
  await page.close();
});

const ROWS = "#content .lcol-tbl tbody tr[data-id]";
const rowSel = id => ROWS + '[data-id="' + id + '"]';
/* the project's three tasks in the Tasks page's List, at this width */
async function showList(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(pid => { S.taskScope = "all"; S.group = ""; S.sort = "manual"; S.sortDir = 1; S.filters = Object.assign(emptyTaskFilters(), { proj: pid }); ENH.bulk = false; go("tasks", "list"); }, M.pid);
  await expect(page.locator(ROWS)).toHaveCount(3);
  await page.mouse.move(0, 0);
}
/* the tick, through the page's own function, and the row's class following it */
async function setCheck(page, id, on) {
  await page.evaluate(async ([id, on]) => { if (taskChecked(id) !== on) await toggleTaskChecked(id); }, [id, on]);
  if (on) await expect(page.locator(rowSel(id))).toHaveClass(/(^|\s)checked(\s|$)/);
  else await expect(page.locator(rowSel(id))).not.toHaveClass(/(^|\s)checked(\s|$)/);
}
/* what a token paints as a background, in the theme now on */
const paint = (page, token) => page.evaluate(t => { const p = document.createElement("div"); p.style.background = "var(" + t + ")"; document.body.appendChild(p); const c = getComputedStyle(p).backgroundColor; p.remove(); return c; }, token);
const CLEAR = "rgba(0, 0, 0, 0)";
/* a row: its own background, each shown cell's, every element inside it that has the tint of its own, its box beside
   its table body's, and its corners (top left, top right, bottom right, bottom left) beside its panel's */
const look = (page, id, tint) => page.$eval(rowSel(id), (tr, tint) => {
  const cells = Array.from(tr.children).filter(td => getComputedStyle(td).display !== "none" && td.getBoundingClientRect().width > 0);
  const inner = Array.from(tr.querySelectorAll("*")).filter(el => getComputedStyle(el).backgroundColor === tint).map(el => el.tagName + "." + el.className);
  const r = tr.getBoundingClientRect(), b = tr.parentElement.getBoundingClientRect();
  return { tr: getComputedStyle(tr).backgroundColor, cells: Array.from(new Set(cells.map(td => getComputedStyle(td).backgroundColor))), n: cells.length, inner, left: Math.round(r.left - b.left), right: Math.round(b.right - r.right),
    radius: ["TopLeft", "TopRight", "BottomRight", "BottomLeft"].map(k => getComputedStyle(tr)["border" + k + "Radius"]), panelR: getComputedStyle(tr.closest(".panel")).borderTopLeftRadius };
}, tint);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + ".png") }); };

test("390 px, light: a checked List card carries one even tint, edge to edge, and its cells none; unticked, it is clear again", async ({ page }) => {
  await signIn(page); await showList(page, 390);
  const tint = await paint(page, "--color-success-soft");
  await setCheck(page, M.ids[0], true); await setCheck(page, M.ids[2], true);
  await page.mouse.move(0, 0);
  await shot(page, "phone-390-light");
  for (const id of [M.ids[0], M.ids[2]]) {
    const l = await look(page, id, tint);
    expect(l.tr).toBe(tint);
    expect(l.n).toBeGreaterThanOrEqual(4);
    expect(l.cells).toEqual([CLEAR]);
    expect(l.inner).toEqual([]);
    expect([l.left, l.right]).toEqual([0, 0]);
  }
  /* the row between them is not checked and carries nothing */
  const plain = await look(page, M.ids[1], tint);
  expect(plain.tr).not.toBe(tint);
  expect(plain.cells).toEqual([CLEAR]);
  /* the first and the last card follow the panel's round corners where they meet them, and no others */
  const first = await look(page, M.ids[0], tint), last = await look(page, M.ids[2], tint), R = first.panelR;
  expect(parseFloat(R)).toBeGreaterThan(0);
  expect(first.radius).toEqual([R, R, "0px", "0px"]);
  expect(last.radius).toEqual(["0px", "0px", R, R]);
  expect(plain.radius).toEqual(["0px", "0px", "0px", "0px"]);
  /* the gap between the title and the pills shows the tint: what is drawn there is the row itself */
  const gap = await page.$eval(rowSel(M.ids[0]), tr => { const t = tr.querySelector("td.lcol-title").getBoundingClientRect(), s = tr.querySelector("td.lcol-status").getBoundingClientRect(); const x = Math.round(t.left + t.width * 0.75), y = Math.round((t.bottom + s.top) / 2); const el = document.elementFromPoint(x, y); return el && (el === tr || tr.contains(el)) ? getComputedStyle(el.closest("tr")).backgroundColor : null; });
  expect(gap).toBe(tint);
  /* hovered, a plain card takes the hover colour; a checked card stays checked */
  const hover = await paint(page, "--color-surface-hover");
  await page.locator(rowSel(M.ids[1]) + " td.lcol-title").hover();
  expect((await look(page, M.ids[1], tint)).tr).toBe(hover);
  await page.locator(rowSel(M.ids[0]) + " td.lcol-title").hover();
  expect((await look(page, M.ids[0], tint)).tr).toBe(tint);
  await page.mouse.move(0, 0);
  /* unticked, the card is clear again */
  await setCheck(page, M.ids[0], false); await setCheck(page, M.ids[2], false);
  for (const id of M.ids) { const l = await look(page, id, tint); expect(l.tr).not.toBe(tint); expect(l.cells).toEqual([CLEAR]); }
});

test("390 px: checked and selected reads as selected, a card at a time; leaving select mode brings the check's tint back", async ({ page }) => {
  await signIn(page); await showList(page, 390);
  const tint = await paint(page, "--color-success-soft"), sel = await paint(page, "--color-primary-soft");
  await setCheck(page, M.ids[0], true); await setCheck(page, M.ids[2], true);
  await page.evaluate(() => bulkToggle());
  await expect(page.locator(ROWS + ".bulk-selectable")).toHaveCount(3);
  for (const id of [M.ids[0], M.ids[1]]) await page.evaluate(id => document.querySelector('#content .bulk-check input[data-bulk-id="' + id + '"]').click(), id);
  await expect(page.locator(ROWS + ".bulk-selected")).toHaveCount(2);
  await page.mouse.move(0, 0);
  await shot(page, "phone-390-checked-and-selected");
  const both = await look(page, M.ids[0], tint), onlySel = await look(page, M.ids[1], tint), onlyChk = await look(page, M.ids[2], tint);
  expect([both.tr, onlySel.tr, onlyChk.tr]).toEqual([sel, sel, tint]);
  for (const l of [both, onlySel, onlyChk]) { expect(l.cells).toEqual([CLEAR]); expect(l.inner).toEqual([]); }
  const R = both.panelR;
  expect([both.radius, onlySel.radius, onlyChk.radius]).toEqual([[R, R, "0px", "0px"], ["0px", "0px", "0px", "0px"], ["0px", "0px", R, R]]);
  /* the first card unticked while still selected: selected alone, with the same corners */
  await setCheck(page, M.ids[0], false);
  const selFirst = await look(page, M.ids[0], tint);
  expect([selFirst.tr, selFirst.cells, selFirst.radius]).toEqual([sel, [CLEAR], [R, R, "0px", "0px"]]);
  await setCheck(page, M.ids[0], true);
  await page.evaluate(() => bulkToggle());
  await expect(page.locator("#content .bulk-selected")).toHaveCount(0);
  expect((await look(page, M.ids[0], tint)).tr).toBe(tint);
  await setCheck(page, M.ids[0], false); await setCheck(page, M.ids[2], false);
});

test("390 px, dark: the same, in the dark theme's tint", async ({ page }) => {
  await signIn(page); await showList(page, 390);
  const light = await paint(page, "--color-success-soft");
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  const tint = await paint(page, "--color-success-soft"), panel = await page.$eval("#content .lcol-wrap", el => getComputedStyle(el.closest(".panel")).backgroundColor);
  expect(tint).not.toBe(light);
  expect(tint).not.toBe(panel);
  await setCheck(page, M.ids[0], true); await setCheck(page, M.ids[2], true);
  await page.mouse.move(0, 0);
  await shot(page, "phone-390-dark");
  const l = await look(page, M.ids[0], tint);
  expect(l.tr).toBe(tint);
  expect(l.cells).toEqual([CLEAR]);
  expect(l.inner).toEqual([]);
  expect((await look(page, M.ids[1], tint)).tr).not.toBe(tint);
  /* a Kanban card is one box: its border carries the check, nothing inside it is tinted on its own */
  await page.evaluate(() => go("tasks", "kanban"));
  const card = "#content .kcard[data-id=\"" + M.ids[0] + "\"]";
  await expect(page.locator(card)).toHaveClass(/(^|\s)checked(\s|$)/);
  expect(await page.$eval(card, (c, tint) => Array.from(c.querySelectorAll("*")).filter(el => getComputedStyle(el).backgroundColor === tint).length, tint)).toBe(0);
  await shot(page, "phone-390-dark-kanban");
  await page.evaluate(() => go("tasks", "list"));
  await setCheck(page, M.ids[0], false); await setCheck(page, M.ids[2], false);
});

test("1366 px and 820 px: a checked row is tinted cell by cell as before, the row itself left clear", async ({ page }) => {
  await signIn(page);
  for (const w of [1366, 820]) {
    await showList(page, w);
    const tint = await paint(page, "--color-success-soft");
    await setCheck(page, M.ids[0], true); await setCheck(page, M.ids[2], true);
    await page.mouse.move(0, 0);
    await shot(page, "desktop-" + w + "-light");
    for (const id of [M.ids[0], M.ids[2]]) {
      const l = await look(page, id, tint);
      expect(l.tr).toBe(CLEAR);
      expect(l.cells).toEqual([tint]);
      expect(l.n).toBeGreaterThanOrEqual(6);
    }
    const plain = await look(page, M.ids[1], tint);
    expect(plain.tr).toBe(CLEAR);
    expect(plain.cells).toEqual([CLEAR]);
    await setCheck(page, M.ids[0], false); await setCheck(page, M.ids[2], false);
  }
});
