/* Phone toolbars. Sort and Group opened their menus off the left edge of the screen, clipped by a row that scrolled
   sideways, and the pills were squeezed to a sliver (worse in Indonesian): nothing could be chosen, in My tasks or
   in a project. A project's tabs jumped back to the start on every choice. The calendar's controls sat to the right,
   without whose tasks; the projects list took two lines for two switches; a project's header is tighter. */
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
/* open a pill's menu by tapping it; the menu is on the screen and on top; choose an option by its value */
async function choose(page, pill, value) {
  const root = page.locator("#content .task-filter-toolbar .pillsel-custom").nth(pill);
  await root.locator(".pillsel-trigger").tap();
  const m = await root.evaluate(r => { const menu = r.querySelector(".pillsel-menu"), b = menu.getBoundingClientRect(), mid = document.elementFromPoint(b.left + b.width / 2, b.top + 14); return { left: b.left, right: b.right, vw: innerWidth, onTop: !!(mid && menu.contains(mid)), trigger: r.getBoundingClientRect().width, whole: (() => { const rb = r.getBoundingClientRect(), hit = document.elementFromPoint(rb.left + 8, rb.top + rb.height / 2); return !!(hit && r.querySelector(".pillsel-trigger").contains(hit)); })() }; });
  expect(m.left, "the menu starts on the screen").toBeGreaterThanOrEqual(0);
  expect(m.right, "and ends on it").toBeLessThanOrEqual(m.vw);
  expect(m.onTop, "and nothing covers or clips it").toBe(true);
  expect(m.trigger, "the pill is wide enough to tap").toBeGreaterThan(36);
  expect(m.whole, "the whole pill opens it, its icon included").toBe(true);
  await root.locator('.pillsel-menu [data-value="' + value + '"]').tap();
}

test.describe("phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  test("sort, group, project tabs, calendar row and the projects list work on a phone", async ({ page }) => {
    await signIn(page);
    const pid = await page.evaluate(async () => { const p = { id: uid("p"), name: "Toolbar check " + Date.now(), owner: ME, start: -4, due: 20, progress: 0, status: "active", tags: [], teams: [], team: [ME], description: "", brief: "", milestones: [], sort: PROJECTS.length + 1 }; PROJECTS.push(p); await persistProject(p, true); return p.id; });
    try {
      /* My tasks, list: whose tasks, filters, sort, group and views on one row — in English and in Indonesian */
      const rowSpread = () => page.evaluate(() => { const t = [...document.querySelectorAll("#content .task-filter-toolbar .pillsel, #content .task-filter-toolbar .iconbtn, #content .task-filter-toolbar .task-scope-toggle")].filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().top)); return Math.max(...t) - Math.min(...t); });
      for (const lang of ["en", "id"]) {
        await page.evaluate(l => { UI_LANG = l; S.sort = "manual"; S.group = ""; S.taskScope = "mine"; go("tasks"); S.taskView = "list"; renderScreen(); }, lang);
        expect(await rowSpread(), "one row in " + lang).toBeLessThan(8);
      }
      await page.locator("#content .task-scope-toggle").tap();
      expect(await page.evaluate(() => S.taskScope), "whose tasks switches with one tap").toBe("all");
      await page.evaluate(() => { S.taskScope = "mine"; renderScreen(); });
      await choose(page, 0, "prio");
      expect(await page.evaluate(() => S.sort)).toBe("prio");
      await choose(page, 1, "status");
      expect(await page.evaluate(() => S.group)).toBe("status");
      /* a project's list: the same */
      await page.evaluate(i => { S.sort = "manual"; S.projectTab = "list"; go("projects", i); }, pid);
      await choose(page, 0, "due");
      expect(await page.evaluate(() => S.sort)).toBe("due");
      const oneRow = await page.evaluate(() => { const t = [...document.querySelectorAll("#content .task-filter-toolbar .pillsel, #content .task-filter-toolbar .iconbtn")].filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().top)); return Math.max(...t) - Math.min(...t); });
      expect(oneRow, "a project's sort, group, filters and views share one row").toBeLessThan(12);
      /* a project's tabs keep their place: the chosen one stays in view */
      await page.evaluate(() => { const r = document.querySelector("#content .ptabs"); r.scrollLeft = r.scrollWidth; });
      const far = page.locator('#content .ptabs .tab[data-tab="activity"]');
      await far.tap();
      const tabs = await page.evaluate(() => { const r = document.querySelector("#content .ptabs"), on = r.querySelector(".tab.on"), a = r.getBoundingClientRect(), b = on.getBoundingClientRect(); return { left: r.scrollLeft, inView: b.left >= a.left - 1 && b.right <= a.right + 1, tab: on.getAttribute("data-tab") }; });
      expect(tabs.tab).toBe("activity"); expect(tabs.left, "the row did not jump back").toBeGreaterThan(0); expect(tabs.inView).toBe(true);
      /* the calendar: whose tasks first, the row at the left */
      await page.evaluate(() => { S.taskScope = "mine"; go("tasks"); S.taskView = "calendar"; renderScreen(); });
      const cal = await page.evaluate(() => { const row = document.querySelector(".cal-mobile-actions"), kids = [...row.children].filter(e => e.offsetParent), first = kids.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0]; return { first: first.className, gap: first.getBoundingClientRect().left - row.getBoundingClientRect().left }; });
      expect(cal.first).toContain("cal-mobile-scope-toggle"); expect(cal.gap, "it starts at the left").toBeLessThan(4);
      const ends = await page.evaluate(() => { const row = document.querySelector(".cal-mobile-actions").getBoundingClientRect(), f = document.querySelector(".cal-mobile-actions>.iconbtn:first-child").getBoundingClientRect(), v = document.querySelector(".cal-mobile-actions>.iconbtn[data-menu]").getBoundingClientRect(), seg = document.querySelector(".cal-mobile-actions .seg").getBoundingClientRect(); return { right: Math.round(row.right - v.right), gap: Math.round(f.left - seg.right), row: Math.abs(f.top - seg.top) < 6 }; });
      expect(ends.right, "filters and saved views sit at the right").toBeLessThan(4); expect(ends.gap, "with space between them and the period").toBeGreaterThan(8); expect(ends.row, "on one row").toBe(true);
      await page.locator(".cal-mobile-actions .cal-mobile-scope-toggle").tap();
      expect(await page.evaluate(() => S.taskScope)).toBe("all");
      /* the projects list: its two switches on one line; whose projects switches with one tap */
      await page.evaluate(() => { setProjScope("all"); go("projects"); });
      const pl = await page.evaluate(() => { const bar = document.querySelector("#content .toolbar:has(>.proj-scope)"), kids = [...bar.children].filter(e => e.offsetParent); return { lines: new Set(kids.map(e => Math.round(e.getBoundingClientRect().top / 10))).size, segHidden: !document.querySelector("#content .proj-scope").offsetParent }; });
      expect(pl.lines, "one line").toBe(1); expect(pl.segHidden).toBe(true);
      await page.locator("#content .proj-scope-toggle").tap();
      expect(await page.evaluate(() => typeof projScope === "function" ? projScope() : (S.projScope || (WS.prefs || {}).projScope))).toBe("mine");
      await page.evaluate(() => setProjScope("all"));
      /* chat: the conversations are a side panel over the chat, not a page reached by Back; the messages are dense,
         as in WhatsApp — a small picture, name and time, the text a size down */
      await page.evaluate(async () => { const c = CONVERSATIONS.find(x => x.type === "WORKSPACE"); await apiFetch("POST", "/api/messages/conversations/" + c.id + "/messages", { body: "Size check " + Date.now() }); go("messages"); openConversation(c.id); });
      await expect(page.locator("#msgMain .msg-text").last()).toBeVisible();
      const sizes = await page.evaluate(() => { const m = [...document.querySelectorAll("#msgMain article.msg")].filter(x => x.querySelector(".av")).pop(); return { text: parseFloat(getComputedStyle(m.querySelector(".msg-text")).fontSize), name: parseFloat(getComputedStyle(m.querySelector(".msg-meta b")).fontSize), avatar: Math.round(m.querySelector(".av").getBoundingClientRect().width) }; });
      expect(sizes.text).toBeLessThanOrEqual(12); expect(sizes.name).toBeLessThanOrEqual(12); expect(sizes.avatar).toBeLessThanOrEqual(28);
      await page.locator("#msgMain .msg-back").tap();
      await expect(page.locator("#msgNav")).toBeVisible();
      await expect(page.locator("#msgMain"), "the chat stays under the panel").toBeVisible();
      const panel = await page.evaluate(() => { const n = document.getElementById("msgNav").getBoundingClientRect(), l = document.querySelector(".msg-layout").getBoundingClientRect(); return { pos: getComputedStyle(document.getElementById("msgNav")).position, share: n.width / l.width }; });
      expect(panel.pos).toBe("absolute"); expect(panel.share).toBeLessThan(0.95);
      await page.locator(".msg-nav-scrim").click({ position: { x: 325, y: 200 }, force: true });
      await expect(page.locator("#msgNav"), "a tap beside it closes the panel").toBeHidden();
      await page.locator("#msgMain .msg-back").tap();
      await page.locator("#msgNav .msg-conv, #msgNav [onclick^=\"openConversation\"]").first().tap();
      await expect(page.locator("#msgNav"), "choosing a conversation closes it").toBeHidden();
      await expect(page.locator("#msgMain")).toBeVisible();
    } finally {
      await page.evaluate(i => { UI_LANG = "en"; return apiFetch("DELETE", "/api/projects/" + i).catch(() => {}); }, pid);
    }
  });
});

test("a wide screen keeps its switches", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => go("projects"));
  await expect(page.locator("#content .proj-scope")).toBeVisible();
  await expect(page.locator("#content .proj-scope-toggle")).toBeHidden();
});
