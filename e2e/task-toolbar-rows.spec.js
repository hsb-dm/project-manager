/* The Tasks page header is two rows at every width from a phone on its side (600 px) to a desktop, as the owner asked
   ("beberapa ukuran tablet tidak konsisten dan jadi 2 line untuk pilihan diatasnya, pastikan semua ukuran tetap 2
   line"): at 768 and 800 px "+ Task baru" fell onto a row of its own under Select, the views and Excel, at 834 it did
   not, and on a phone held sideways the header was three rows. Now row 1 is Select, the views, Excel and New task, row 2
   the toolbar (sort, group, columns or fields, Mine / All, filters, saved views), and neither wraps: below 828 px the
   views other than the chosen one show their icon (their name stays as a tooltip and for screen readers), below 828 px
   the toolbar's pills show an icon for their name, and a pill short of room truncates its value. Controls are 36 px on
   a tablet. The topbar no longer pushes the page sideways (1,180 px in English with My Tasks' count). A phone (up to
   599 px) keeps its own header. A project and some tasks assigned to the admin are made through the API and removed
   after; the language, theme and select mode are put back.
   The Calendar view too (Oct 2026): its row 2 is the month's row (whose tasks, filters, previous, the month, next,
   Today, Show labels, saved views, Month / Week / Day, the legend), one line at every width, where it used to be two
   more lines under row 1 from 761 px and the phone's two-line bar from 600 to 760 px: the month's name short below
   1100 px and never cut, Show labels an icon below 1366 px (left out up to 760 px, as on a phone), the legend under the
   calendar below 1281 px, whose tasks its icons below 828 px and the period its letters below 700 px, each still named;
   with the "N checked" chip and filter chips, in every period; and the Calendar page and a project's calendar from
   761 px. A week's title is whole at every width in both languages whatever today is: the widest weeks inside one
   month, across two months and across two years are shown, and below 700 px it is two lines, its first day over its
   last (on 27 Oct 2026 "Okt 26 – Nov 1" was cut at 600 px beside the chip). The personal checks are put back. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const WIDTHS = [600, 640, 700, 768, 800, 834, 900, 960, 1024, 1100, 1180, 1280, 1366];
const VIEWS = ["kanban", "list", "grid", "timeline", "calendar"];
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const TAG = "rows" + Date.now().toString(36);
let M = null;   /* { pid, ids } */
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage(); await signIn(page);
  M = await page.evaluate(async tag => {
    const st = WS.workflow.filter(s => s.kind !== "closed").map(s => s.id), pid = "prw" + tag, ids = [];
    await apiFetch("POST", "/api/projects", { id: pid, name: "Two rows " + tag, status: "active", owner: ME, startDate: iso(-3), dueDate: iso(20) });
    for (let i = 0; i < 6; i++) ids.push((await apiFetch("POST", "/api/tasks", { title: "Row task " + (i + 1) + " " + tag, status: st[i % st.length], prio: "medium", assignee: ME, assignees: [ME], reviewer: ME, reviewers: [ME], proj: pid, dueDate: iso(2 + i) })).id);
    return { pid, ids };
  }, TAG);
  await page.close();
});
test.afterAll(async ({ browser }) => {
  if (!M) return;
  const page = await browser.newPage(); await signIn(page);
  await page.evaluate(async m => { for (const id of m.ids) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); await apiFetch("DELETE", "/api/projects/" + m.pid).catch(() => {}); }, M);
  await page.close();
});

/* the Tasks page in a view, everything a person taps in its header measured */
async function show(page, view, cols, savedView, o) {
  await page.evaluate(([v, cols, sv, o]) => { S.taskScope = "all"; S.sort = o.sort || "due"; S.sortDir = 1; S.group = o.group || ""; S.activeView = sv; S.filters = Object.assign(emptyTaskFilters(), o.filters || {}); S.calMode = o.calMode || "month"; S.calMonth = TODAY.getMonth(); S.calYear = TODAY.getFullYear(); S.calDay = o.calDay || 0; if (cols) myPrefs().listCols = cols; go("tasks", v); }, [view, cols || null, savedView || null, o || {}]);
  await page.waitForFunction(() => document.querySelector("#content .task-pagehead .actions .bulk-btn"));
  await page.evaluate(() => document.fonts.ready);
}
const measure = page => page.evaluate(() => {
  const vis = e => { if (!e || !e.offsetParent) return false; const b = e.getBoundingClientRect(), cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== "hidden"; };
  const box = (e, row) => { const b = e.getBoundingClientRect(); return { row, cls: String(e.className), name: (e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30), l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height, ctl: e.tagName !== "H2" && !e.classList.contains("legend") }; };
  const act = document.querySelector("#content .task-pagehead .actions");
  const seg = act.querySelector(".seg");
  const row1 = [...act.children].filter(vis).map(e => box(e, 1));
  /* row 2: the task toolbar, or in the Calendar view the month's row (its title and legend are in the row but are not
     controls, so they need not be 36 px) */
  const cal = [...document.querySelectorAll("#content .calendar-toolbar.cal-row")].find(vis) || null;
  const tb = document.querySelector("#content .task-filter-toolbar") || cal;
  const row2 = tb ? [...tb.querySelectorAll(".task-toolbar-sort>*, .task-toolbar-primary>*, .task-toolbar-tail>*, .cal-nav>*, .calendar-display-controls>*")].filter(vis).map(e => box(e, 2)) : [];
  const segs2 = tb ? [...tb.querySelectorAll(".seg button")].filter(vis).map(e => box(e, 2)) : [];   /* Mine / All: what is tapped */
  const views = [...seg.querySelectorAll("button")].filter(vis).map(b => { const lab = b.querySelector(".view-label"), x = box(b, 1); return Object.assign(x, { on: b.classList.contains("on"), aria: b.getAttribute("aria-label"), title: b.getAttribute("title"), label: lab ? lab.textContent.trim() : "", labelShown: vis(lab) }); });
  const pills = tb ? [...tb.querySelectorAll(".pillsel-custom")].filter(vis).map(p => ({ name: p.querySelector("span").textContent.trim(), nameShown: p.querySelector("span").getBoundingClientRect().width > 2, icon: getComputedStyle(p, "::before").content !== "none", value: p.querySelector(".pillsel-value").textContent.trim(), cut: (() => { const v = p.querySelector(".pillsel-value"); return vis(v) && v.scrollWidth > v.clientWidth + 1; })() })) : [];
  const c = document.getElementById("content"), cb = c.getBoundingClientRect(), cs = getComputedStyle(c);
  const nt = act.querySelector(".task-new"), chips = tb && tb.querySelector(".fchips");
  /* the month's row: what gave way, and that each control is still named */
  const calInfo = cal && (() => {
    const h2 = cal.querySelector("h2"), lb = cal.querySelector("#calLabelBtn"), word = lb.querySelector(".cal-lbl-word"), foot = document.querySelector("#content .cal-legend-foot");
    const radios = sel => [...cal.querySelectorAll(sel + ' [role="radio"]')].map(b => ({ aria: b.getAttribute("aria-label"), word: vis(b.querySelector(".seg-word")) || !b.querySelector(".seg-word"), icon: vis(b.querySelector(".seg-ico")), letter: getComputedStyle(b, "::before").content.replace(/"/g, "") }));
    return { title: h2.textContent, cut: h2.scrollWidth > h2.clientWidth + 1, short: vis(h2.querySelector(".cal-t-short")), long: vis(h2.querySelector(".cal-t-long")),
      scope: radios(".cal-scope-seg"), mode: radios(".cal-mode-seg"), labels: { shown: vis(lb), words: vis(word), aria: lb.getAttribute("aria-label") },
      legendRow: vis(cal.querySelector(".calendar-display-controls .legend")), legendFoot: vis(foot), chip: vis(cal.querySelector(".tcheck-chip.on")) };
  })();
  return { row1, row2, segs2, views, pills, cal: calInfo, seg: { sw: seg.scrollWidth, cw: seg.clientWidth }, left: cb.left + parseFloat(cs.paddingLeft), right: cb.right - parseFloat(cs.paddingRight),
    page: { sw: document.scrollingElement.scrollWidth, vw: innerWidth }, badge: !!document.querySelector("#nav .nav-item .cnt"), lang: UI_LANG,
    newTask: nt && { gap: parseFloat(getComputedStyle(nt).columnGap) || 0, font: parseFloat(getComputedStyle(nt).fontSize) },
    toolbar: tb && { t: tb.getBoundingClientRect().top, b: tb.getBoundingClientRect().bottom, chips: !!(chips && chips.children.length), chipsTop: chips && chips.children.length ? chips.getBoundingClientRect().top : null } };
});
/* rows: controls whose boxes share their height (more than 2 px of it) are one row */
function rowsOf(list) {
  const rows = [];
  for (const b of list.slice().sort((x, y) => x.t - y.t)) {
    const r = rows.find(r => Math.min(r.b, b.b) - Math.max(r.t, b.t) > 2);
    if (r) { r.items.push(b); r.t = Math.min(r.t, b.t); r.b = Math.max(r.b, b.b); } else rows.push({ t: b.t, b: b.b, items: [b] });
  }
  return rows;
}
const overlap = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;
const NAMES = { en: { kanban: "Kanban", list: "List", grid: "Grid", calendar: "Calendar", timeline: "Timeline" }, id: { kanban: "Kanban", list: "Daftar", grid: "Tabel", calendar: "Kalender", timeline: "Linimasa" } };

/* the checks every header must pass: two rows, New task in the first, nothing overlapping, nothing past the edge */
function checkRows(m, where, opts) {
  opts = opts || {};
  const all = m.row1.concat(m.row2);
  const rows = rowsOf(all);
  expect(rows.length, where + ": exactly two rows of controls — " + rows.map(r => r.items.map(i => i.name).join(" · ")).join("  /  ")).toBe(2);
  expect(m.row1.every(b => rows[0].items.includes(b)), where + ": Select, the views, Excel and New task are row 1").toBe(true);
  expect(m.row2.every(b => rows[1].items.includes(b)), where + ": the toolbar is row 2").toBe(true);
  const nt = m.row1.find(b => /\btask-new\b/.test(b.cls));
  expect(nt, where + ": New task is there").toBeTruthy();
  expect(rows[0].items.includes(nt), where + ": New task is in row 1").toBe(true);
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++)
    expect(overlap(all[i], all[j]), where + ": " + all[i].name + " and " + all[j].name + " do not overlap").toBe(false);
  for (let i = 0; i < m.views.length; i++) for (let j = i + 1; j < m.views.length; j++)
    expect(overlap(m.views[i], m.views[j]), where + ": views " + m.views[i].name + " and " + m.views[j].name + " do not overlap").toBe(false);
  for (const b of all) {
    expect(b.l, where + ": " + b.name + " starts inside the page").toBeGreaterThanOrEqual(m.left - 0.5);
    expect(b.r, where + ": " + b.name + " ends inside the page").toBeLessThanOrEqual(m.right + 0.5);
  }
  if (opts.seg !== "scrolls") expect(m.seg.sw, where + ": the views fit their track without scrolling").toBeLessThanOrEqual(m.seg.cw + 1);
  expect(m.page.sw, where + ": the page does not scroll sideways").toBeLessThanOrEqual(m.page.vw);
  /* the toolbar is no taller than its row of controls (an empty line of filter chips added 6–8 px under it); active
     filter chips have a line of their own under the controls */
  if (m.toolbar && m.row2.length) {
    if (!m.toolbar.chips) expect(m.toolbar.b - rows[1].b, where + ": nothing under the toolbar's row").toBeLessThanOrEqual(1);
    else expect(m.toolbar.chipsTop, where + ": the filter chips are under the controls").toBeGreaterThanOrEqual(rows[1].b - 0.5);
  }
  /* New task keeps its words and the space between its + and them */
  expect(nt.w, where + ": New task shows its words").toBeGreaterThan(70);
  expect(m.newTask.gap, where + ": a space between New task's + and its words").toBeGreaterThanOrEqual(6);
  if (opts.tablet) for (const b of all.concat(m.views, m.segs2).filter(b => b.ctl !== false)) {
    expect(b.h, where + ": " + b.name + " is at least 36 px tall").toBeGreaterThanOrEqual(35.5);
    expect(b.w, where + ": " + b.name + " is at least 36 px wide").toBeGreaterThanOrEqual(35.5);
  }
}

/* the Calendar view's row: what gives way at which width (responsive.css, "Calendar controls"), each control still
   named; the month's name is never cut. scoped: whose tasks is in the row (the Tasks page) */
const CAL_NAMES = { en: { scope: ["Mine", "Team"], mode: ["Month", "Week", "Day"], labels: "Show labels" }, id: { scope: ["Milik saya", "Tim"], mode: ["Bulan", "Minggu", "Hari"], labels: "Tampilkan label" } };
function checkCal(c, where, w, lang, o) {
  o = Object.assign({ scoped: true, chip: false }, o || {});
  const n = CAL_NAMES[lang];
  expect(c, where + ": the month's row is on screen").toBeTruthy();
  expect(c.cut, where + ": the month's name is whole (" + c.title + ")").toBe(false);
  expect(c.short, where + ": the month's short name below " + (o.scoped ? 1100 : 828) + " px").toBe(w < (o.scoped ? 1100 : 828));
  expect(c.long, where + ": its full name from " + (o.scoped ? 1100 : 828) + " px").toBe(w >= (o.scoped ? 1100 : 828));
  if (o.scoped) {
    expect(c.scope.map(r => r.aria), where + ": whose tasks' options are named").toEqual(n.scope);
    for (const r of c.scope) {
      expect(r.icon, where + ": whose tasks shows its icon below 828 px").toBe(w < 828);
      expect(r.word, where + ": whose tasks shows its word from 828 px").toBe(w >= 828);
    }
  } else expect(c.scope.length, where + ": no whose tasks in this row").toBe(0);
  expect(c.mode.map(r => r.aria), where + ": the period's options are named").toEqual(n.mode);
  const letters = w < 700 || (o.chip && w <= 980);
  c.mode.forEach((r, i) => {
    expect(r.word, where + ": " + n.mode[i] + " shows its word" + (letters ? " (no: its letter)" : "")).toBe(!letters);
    if (letters) expect(r.letter, where + ": " + n.mode[i] + "'s letter").toBe(n.mode[i].charAt(0));
  });
  expect(c.labels.aria, where + ": Show labels is named").toBe(n.labels);
  expect(c.labels.shown, where + ": Show labels is there from 761 px").toBe(w > 760);
  if (w > 760) expect(c.labels.words, where + ": Show labels shows its words from 1366 px").toBe(w >= 1366);
  expect(c.legendRow, where + ": the legend is in the row from 1281 px" + (o.chip ? " (not beside the chip)" : "")).toBe(w >= 1281 && !o.chip);
  expect(c.legendFoot, where + ": else under the calendar (not on a phone's width)").toBe(w > 760 && (w < 1281 || o.chip));
  expect(c.chip, where + ": the N checked chip").toBe(o.chip);
}

for (const lang of ["en", "id"]) {
  test(`two rows at every width from 600 to 1366 px in ${lang === "en" ? "English" : "Indonesian"}, light and dark, in every view`, async ({ page }) => {
    test.setTimeout(420000);
    await signIn(page);
    const theme0 = await page.evaluate(() => myPrefs().appearance || null);
    await page.evaluate(l => setLanguage(l), lang);
    await page.waitForFunction(l => UI_LANG === l, lang);
    try {
      for (const theme of ["light", "dark"]) {
        /* the person's own appearance, applied as the theme menu does (not saved) */
        await page.evaluate(t => { myPrefs().appearance = t; applyTheme(); }, theme);
        expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(theme);
        for (const w of WIDTHS) {
          await page.setViewportSize({ width: w, height: 900 });
          for (const v of VIEWS) {
            await show(page, v);
            const m = await measure(page), where = [lang, theme, w + "px", v].join(" ");
            expect(m.lang).toBe(lang);
            if (w > 1150) expect(m.badge, "My Tasks shows its count in the topbar, as it does for someone with tasks").toBe(true);
            checkRows(m, where, { tablet: w <= 980 });
            /* the views: each named for screen readers and as a tooltip; below 828 px only the chosen one shows its word */
            for (const b of m.views) {
              const k = Object.keys(NAMES[lang]).find(x => NAMES[lang][x] === b.label);
              expect(k, where + ": a view's word is its name").toBeTruthy();
              expect(b.aria, where + ": " + b.label + " has its name for screen readers").toBe(b.label);
              expect(b.title, where + ": " + b.label + " has its name as a tooltip").toBe(b.label);
              expect(b.labelShown, where + ": " + b.label + (b.on ? " (chosen)" : "") + " shows its word").toBe(b.on || w >= 828);
            }
            expect(m.views.find(b => b.on).label).toBe(NAMES[lang][v]);
            /* the toolbar's pills: an icon for their name below 828 px, the name from 828 px; a value is never cut here */
            for (const p of m.pills) {
              expect(p.nameShown, where + ": the pill " + p.name + " shows its name").toBe(w >= 828);
              expect(p.icon, where + ": the pill " + p.name + " shows its icon").toBe(w < 828);
              expect(p.cut, where + ": the pill " + p.name + " shows all of " + p.value).toBe(false);
            }
            if (v === "calendar") checkCal(m.cal, where, w, lang);
          }
        }
      }
    } finally {
      await page.evaluate(t => { if (t) myPrefs().appearance = t; else delete myPrefs().appearance; applyTheme(); setLanguage("en"); }, theme0);
    }
  });
}

test("while selecting, with List's Reset columns, a saved view, the longest sort and group values and filter chips: still two rows, New task in row 1", async ({ page }) => {
  test.setTimeout(180000);
  await signIn(page);
  await page.evaluate(() => setLanguage("id"));
  await page.waitForFunction(() => UI_LANG === "id");
  const cols0 = await page.evaluate(() => JSON.stringify(myPrefs().listCols || null));
  try {
    for (const w of [600, 640, 768, 800, 827, 828, 834, 900, 1024]) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const v of VIEWS) {
        /* select mode: "Memilih…" is wider than "Pilih" */
        await show(page, v);
        await page.evaluate(() => { if (!ENH.bulk) bulkToggle(); });
        await page.evaluate(() => document.fonts.ready);
        const m = await measure(page);
        expect(m.row1.some(b => /Memilih/.test(b.name)), "select mode is on").toBe(true);
        checkRows(m, "select mode " + w + "px " + v, { tablet: w <= 980 });
        await page.evaluate(() => { if (ENH.bulk) bulkToggle(); });
      }
      /* a List with a column hidden: Reset columns joins the toolbar from 761 px */
      await show(page, "list", { hide: ["team"] });
      const m = await measure(page);
      if (w > 760) expect(m.row2.some(b => /lcol-reset/.test(b.cls)), "Reset columns is shown").toBe(true);
      checkRows(m, "Reset columns " + w + "px", { tablet: w <= 980 });
      await page.evaluate(c => { const p = myPrefs(); if (c === "null") delete p.listCols; else p.listCols = JSON.parse(c); }, cols0);
    }
    /* a saved view with a long name widens the title's line ("view “…”"): on a desktop the actions go under the title,
       still one row, and the toolbar is still the second */
    await page.evaluate(() => VIEWS.push({ id: "sv_rows_e2e", name: "Desain kampanye asuransi minggu ini untuk semua tim", type: "kanban", filters: {}, sort: "due", group: "", fields: [], config: { scope: "all", sortDir: 1 } }));
    for (const w of [600, 834, 1024, 1100, 1180, 1280]) {
      await page.setViewportSize({ width: w, height: 900 });
      await show(page, "kanban", null, "sv_rows_e2e");
      checkRows(await measure(page), "saved view " + w + "px", { tablet: w <= 980 });
    }
    /* sorted and grouped by the longest words ("Penanggung jawab" twice): the pills give up width and truncate their
       value, the row does not wrap; and with filters on, their chips take a line of their own under the controls */
    for (const w of [600, 640, 700, 768, 800, 834, 960]) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const v of ["list", "grid"]) {
        await show(page, v, null, null, { sort: "assignee", group: "assignee" });
        const m = await measure(page);
        expect(m.pills.map(p => p.value).join("|"), "the long values").toMatch(/Penanggung jawab\|Penanggung jawab/);
        checkRows(m, "long values " + w + "px " + v, { tablet: true });
        await show(page, v, null, null, { filters: { prio: "medium", due: "overdue" } });
        const f = await measure(page);
        expect(f.toolbar.chips, "filter chips are shown").toBe(true);
        checkRows(f, "filters " + w + "px " + v, { tablet: true });
      }
    }
  } finally {
    await page.evaluate(c => { const p = myPrefs(); if (c === "null") delete p.listCols; else p.listCols = JSON.parse(c); const i = VIEWS.findIndex(v => v.id === "sv_rows_e2e"); if (i >= 0) VIEWS.splice(i, 1); S.activeView = null; if (ENH.bulk) bulkToggle(); setLanguage("en"); }, cols0);
  }
});

test("a wider brand font: the views scroll sideways in their own track and the pills truncate, nothing wraps, the page never scrolls", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => setLanguage("id"));
  await page.waitForFunction(() => UI_LANG === "id");
  /* 6 px between letters stands in for a workspace font wider than Poppins */
  await page.evaluate(() => { const s = document.createElement("style"); s.id = "wideFontE2E"; s.textContent = ".task-pagehead .actions button,.task-filter-toolbar button,.task-filter-toolbar .pillsel{letter-spacing:6px}"; document.head.appendChild(s); });
  try {
    const scrolled = [];
    for (const w of [600, 700, 768, 834, 960]) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const v of ["list", "grid"]) {
        await show(page, v);
        const m = await measure(page);
        if (m.seg.sw > m.seg.cw + 1) scrolled.push(w + " " + v);
        checkRows(m, "wide font " + w + "px " + v, { tablet: true, seg: "scrolls" });
      }
    }
    /* the font was wide enough for the views to need more room than they had, at the narrow end and with all five words */
    expect(scrolled, "the views scrolled in their track").toEqual(expect.arrayContaining(["600 list", "600 grid", "834 list", "960 grid"]));
  } finally {
    await page.evaluate(() => { document.getElementById("wideFontE2E").remove(); setLanguage("en"); });
  }
});

/* the widths where something in the month's row gives way, either side of each */
const CAL_EDGES = [600, 601, 699, 700, 760, 761, 827, 828, 980, 981, 1099, 1100, 1280, 1281, 1366];
const setChecks = (page, on) => page.evaluate(on => { const set = taskCheckSet(); set.length = 0; if (on) TASKS.filter(t => /^Row task /.test(t.title)).slice(0, 3).forEach(t => set.push(t.id)); taskCheckSave(); }, on);

test("the Calendar view in every period, with the N checked chip and filter chips: still two rows, the month's name whole, the chips on a line of their own", async ({ page }) => {
  test.setTimeout(480000);
  await signIn(page);
  await page.evaluate(() => setLanguage("id"));
  await page.waitForFunction(() => UI_LANG === "id");
  const checks0 = await page.evaluate(() => JSON.stringify(taskCheckSet()));
  try {
    for (const w of CAL_EDGES) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const calMode of ["month", "week", "day"]) for (const chip of [false, true]) {
        await setChecks(page, chip);
        await show(page, "calendar", null, null, { calMode });
        const m = await measure(page), where = ["id", w + "px", calMode, chip ? "with N checked" : ""].join(" ");
        checkRows(m, where, { tablet: w <= 980 });
        checkCal(m.cal, where, w, "id", { chip });
      }
      /* filters on: their chips under the controls, the row unchanged */
      await setChecks(page, true);
      await show(page, "calendar", null, null, { calMode: "week", filters: { prio: "medium", due: "overdue" } });
      const f = await measure(page);
      expect(f.toolbar.chips, w + "px: filter chips are shown").toBe(true);
      checkRows(f, "filters " + w + "px", { tablet: w <= 980 });
      checkCal(f.cal, "filters " + w + "px", w, "id", { chip: true });
    }
    /* the chip's clear button shows its x (it had no stroke: an empty green space), and clears */
    await page.setViewportSize({ width: 834, height: 900 });
    await setChecks(page, true);
    await show(page, "calendar");
    const x = await page.evaluate(() => { const s = document.querySelector("#content .cal-row .tcheck-chip.on button svg"); return s && getComputedStyle(s).stroke; });
    expect(x, "the x is drawn").not.toBe("none");
    await page.locator("#content .cal-row .tcheck-chip.on button").click();
    expect(await page.evaluate(() => taskCheckCount())).toBe(0);
    await expect(page.locator("#content .cal-row .tcheck-chip.on")).toHaveCount(0);
  } finally {
    await page.evaluate(c => { const set = taskCheckSet(); set.length = 0; JSON.parse(c).forEach(id => set.push(id)); taskCheckSave(); S.calMode = "month"; S.filters = emptyTaskFilters(); setLanguage("en"); }, checks0);
  }
});

test("the Calendar page and a project's calendar: the month's controls are one line from 761 px, the month's name whole", async ({ page }) => {
  test.setTimeout(240000);
  await signIn(page);
  const checks0 = await page.evaluate(() => JSON.stringify(taskCheckSet()));
  try {
    for (const lang of ["en", "id"]) {
      await page.evaluate(l => setLanguage(l), lang);
      await page.waitForFunction(l => UI_LANG === l, lang);
      for (const w of [761, 768, 800, 827, 828, 834, 900, 980, 981, 1024, 1100, 1179, 1180, 1280, 1281, 1366]) {
        await page.setViewportSize({ width: w, height: 900 });
        for (const where of ["calendar", "project"]) for (const calMode of ["month", "week", "day"]) for (const chip of [false, true]) {
          if (lang === "en" && (calMode !== "month" || chip)) continue;
          await setChecks(page, chip);
          await page.evaluate(([where, pid, calMode]) => { S.calMode = calMode; S.calMonth = TODAY.getMonth(); S.calYear = TODAY.getFullYear(); S.calDay = 0; S.calScope = "all"; S.filters = emptyTaskFilters(); if (where === "calendar") go("calendar"); else { S.projectTab = "calendar"; go("projects", pid); } }, [where, M.pid, calMode]);
          const r = await page.evaluate(() => {
            const vis = e => !!(e && e.offsetParent && e.getBoundingClientRect().width > 0);
            const row = [...document.querySelectorAll("#content .calendar-toolbar.cal-row")].find(vis);
            if (!row) return null;
            const c = document.getElementById("content"), cs = getComputedStyle(c), cb = c.getBoundingClientRect();
            const els = [...row.querySelectorAll(".cal-nav>*, .calendar-display-controls>*")].filter(vis).map(e => { const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right, name: (e.getAttribute("aria-label") || e.textContent).trim().slice(0, 24) }; });
            const h2 = row.querySelector("h2");
            return { els, cut: h2.scrollWidth > h2.clientWidth + 1, title: h2.textContent, right: cb.right - parseFloat(cs.paddingRight), sw: document.scrollingElement.scrollWidth, vw: innerWidth, mobile: vis(document.querySelector("#content .calendar-mobile-controls")) };
          });
          const at = [lang, where, w + "px", calMode, chip ? "with N checked" : ""].join(" ");
          expect(r, at + ": the month's row is shown").not.toBeNull();
          expect(rowsOf(r.els).length, at + ": one line — " + r.els.map(e => e.name).join(" · ")).toBe(1);
          expect(r.cut, at + ": the month's name is whole (" + r.title + ")").toBe(false);
          for (const e of r.els) expect(e.r, at + ": " + e.name + " ends inside the page").toBeLessThanOrEqual(r.right + 0.5);
          expect(r.sw, at + ": no sideways scroll").toBeLessThanOrEqual(r.vw);
          expect(r.mobile, at + ": not the phone's bar").toBe(false);
        }
      }
    }
  } finally {
    await page.evaluate(c => { const set = taskCheckSet(); set.length = 0; JSON.parse(c).forEach(id => set.push(id)); taskCheckSave(); S.calMode = "month"; setLanguage("en"); }, checks0);
  }
});

/* A week's title, whatever today is: the widest weeks of 2026 and 2027 in either language inside one month ("May
   24–30", "Agu 24–30"), across two months ("Okt 26 – Nov 1", "Aug 30 – Sep 5") and across two years ("Des 28 – Jan
   3"), at the widths where the month's row gives way, with and without the "N checked" chip, on the Tasks page (and its
   phone's bar), the Calendar page and a project. It was cut on 27 Oct 2026, today in a week into November: beside the
   chip at 600 and 601 px the title had 89 and 74 px, and on one line such a week needs 112, one inside a month 85. Now
   below 700 px it is two lines, its first day over its last. A width's weeks are drawn and measured in one go. */
const WEEKS = { "2026-08-24": "inside one month", "2027-05-24": "inside one month", "2026-10-26": "across two months", "2027-08-30": "across two months", "2026-12-28": "across two years" };
const weekTitles = (page, wheres) => page.evaluate(([weeks, wheres, pid]) => {
  const vis = e => !!(e && e.offsetParent && e.getBoundingClientRect().width > 0), out = [];
  const checks = TASKS.filter(t => /^Row task /.test(t.title)).slice(0, 3).map(t => t.id), set = taskCheckSet();
  for (const chip of [false, true]) {
    set.length = 0; if (chip) checks.forEach(id => set.push(id)); taskCheckSave();
    for (const where of wheres) for (const monday of weeks) {
      const [y, mo, d] = monday.split("-").map(Number);
      Object.assign(S, { calMode: "week", calMonth: TODAY.getMonth(), calYear: TODAY.getFullYear(), calDay: Math.round((new Date(y, mo - 1, d) - TODAY) / 864e5) - weekRange(0)[0], calScope: "all", taskScope: "all", sort: "due", sortDir: 1, group: "", activeView: null, filters: emptyTaskFilters() });
      if (where === "tasks") go("tasks", "calendar"); else if (where === "calendar") go("calendar"); else { S.projectTab = "calendar"; go("projects", pid); }
      const bar = [...document.querySelectorAll("#content .calendar-toolbar.cal-row, #content .calendar-mobile-controls")].find(vis);
      const h = bar.querySelector("h2, .cal-mobile-date strong"), two = h.querySelector(".cal-t-two"), s = weekRange(0)[0] + Math.floor(S.calDay / 7) * 7;
      const c = document.getElementById("content"), cs = getComputedStyle(c), row = bar.classList.contains("cal-row");
      out.push({ where, chip, monday, first: uiMo(mo - 1) + " " + d, from: dueDate(s), to: dueDate(s + 6), long: calTitle(), short: calTitleShort(),
        row, text: h.innerText, cut: h.scrollWidth > h.clientWidth + 1, height: h.getBoundingClientRect().height,
        shortShown: vis(h.querySelector(".cal-t-short")), longShown: vis(h.querySelector(".cal-t-long")), one: vis(h.querySelector(".cal-t-one")), two: vis(two),
        lines: vis(two) ? [...two.children].map(e => ({ text: e.textContent, t: e.getBoundingClientRect().top })) : [],
        els: row ? [...bar.querySelectorAll(".cal-nav>*, .calendar-display-controls>*")].filter(vis).map(e => { const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, r: b.right, name: (e.getAttribute("aria-label") || e.textContent).trim().slice(0, 24) }; }) : [],
        right: c.getBoundingClientRect().right - parseFloat(cs.paddingRight), sw: document.scrollingElement.scrollWidth, vw: innerWidth });
    }
  }
  return out;
}, [Object.keys(WEEKS), wheres, M.pid]);

test("a week's title is whole at every width, in English and Indonesian, inside one month, across two months and across two years, whatever today is", async ({ page }) => {
  test.setTimeout(240000);
  await signIn(page);
  const checks0 = await page.evaluate(() => JSON.stringify(taskCheckSet()));
  try {
    for (const lang of ["en", "id"]) {
      await page.evaluate(l => setLanguage(l), lang);
      await page.waitForFunction(l => UI_LANG === l, lang);
      /* the Tasks page: the phone's bar up to 599 px, the month's row (row 2) from 600; the Calendar page and a
         project: the month's row from 761 px */
      for (const w of [390, 599].concat(CAL_EDGES)) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.evaluate(() => document.fonts.ready);
        for (const t of await weekTitles(page, w > 760 ? ["tasks", "calendar", "project"] : ["tasks"])) {
          const at = [lang, t.where, w + "px", "the week of " + t.monday, "(" + WEEKS[t.monday] + ")", t.chip ? "with N checked" : ""].join(" ");
          expect(t.from, at + ": that week is shown").toBe(t.first);
          expect(t.cut, at + ": the week's title is whole (" + t.text + ")").toBe(false);
          if (w < 600) { expect([t.row, t.text], at + ": the phone's bar names the week").toEqual([false, t.long]); continue; }
          expect(t.row, at + ": the month's row").toBe(true);
          expect(rowsOf(t.els).length, at + ": one line — " + t.els.map(e => e.name).join(" · ")).toBe(1);
          for (const e of t.els) expect(e.r, at + ": " + e.name + " ends inside the page").toBeLessThanOrEqual(t.right + 0.5);
          expect(t.sw, at + ": no sideways scroll").toBeLessThanOrEqual(t.vw);
          const short = w < (t.where === "tasks" ? 1100 : 828);
          expect([t.shortShown, t.longShown], at + ": the " + (short ? "short" : "whole") + " title").toEqual([short, !short]);
          if (w < 700) {
            expect([t.one, t.two], at + ": below 700 px the title is two lines").toEqual([false, true]);
            expect(t.lines.map(l => l.text), at + ": its first day over its last").toEqual([t.from + " –", t.to]);
            expect(t.lines[1].t - t.lines[0].t, at + ": the last day under the first").toBeGreaterThan(8);
            expect(t.height, at + ": the two lines within the row's 36 px").toBeLessThanOrEqual(36);
          } else expect(t.text, at + ": one line").toBe(short ? t.short : t.long);
        }
      }
    }
  } finally {
    await page.evaluate(c => { const set = taskCheckSet(); set.length = 0; JSON.parse(c).forEach(id => set.push(id)); taskCheckSave(); S.calMode = "month"; S.calDay = 0; setLanguage("en"); }, checks0);
  }
});

test("a project's toolbar from 600 px is one row of 36 px controls, and its menus open on the screen", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => setLanguage("id"));
  await page.waitForFunction(() => UI_LANG === "id");
  try {
    for (const w of [600, 700, 760, 768, 834]) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const [tab, filtered] of [["board", false], ["list", false], ["grid", false], ["list", true]]) {
        await page.evaluate(([pid, t, f]) => { S.sort = "due"; S.group = ""; S.filters = Object.assign(emptyTaskFilters(), f ? { prio: "medium" } : {}); S.projectTab = t; go("projects", pid); }, [M.pid, tab, filtered]);
        await page.evaluate(() => document.fonts.ready);
        const r = await page.evaluate(() => {
          const tb = document.querySelector("#content .task-filter-toolbar");
          const els = [...tb.querySelectorAll(".task-toolbar-sort>*, .task-toolbar-primary>*, .task-toolbar-tail>*")].filter(e => e.offsetParent && e.getBoundingClientRect().width > 0).map(e => { const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right, w: b.width, h: b.height, name: (e.getAttribute("aria-label") || e.textContent).trim().slice(0, 20) }; });
          return { els, vw: innerWidth, sw: document.scrollingElement.scrollWidth };
        });
        const where = "project " + tab + (filtered ? " filtered" : "") + " " + w + "px";
        expect(rowsOf(r.els).length, where + ": one row — " + r.els.map(e => e.name).join(" · ")).toBe(1);
        for (const e of r.els) { expect(e.h, where + ": " + e.name + " 36 px").toBeGreaterThanOrEqual(35.5); expect(e.r).toBeLessThanOrEqual(r.vw); }
        expect(r.sw).toBeLessThanOrEqual(r.vw);
      }
      /* the sort menu opens below its pill, whole and on top: the row is no longer a sideways-scrolling strip that clipped it */
      await page.locator("#content .task-filter-toolbar .pillsel-custom .pillsel-trigger").first().click();
      const menu = await page.evaluate(() => { const m = document.querySelector("#content .task-filter-toolbar .pillsel-custom.open .pillsel-menu"), b = m.getBoundingClientRect(), hit = document.elementFromPoint(b.left + b.width / 2, b.bottom - 10); return { l: b.left, r: b.right, h: b.height, vw: innerWidth, whole: !!(hit && m.contains(hit)) }; });
      expect(menu.l).toBeGreaterThanOrEqual(0); expect(menu.r).toBeLessThanOrEqual(menu.vw); expect(menu.h).toBeGreaterThan(100);
      expect(menu.whole, "the menu's last option can be reached").toBe(true);
      await page.keyboard.press("Escape");
    }
  } finally {
    await page.evaluate(() => setLanguage("en"));
  }
});

test("a phone (up to 599 px) keeps its own header: New task round beside the title, the views and a round Select under it", async ({ page }) => {
  await signIn(page);
  for (const w of [390, 599]) {
    await page.setViewportSize({ width: w, height: 844 });
    await show(page, "kanban");
    const r = await page.evaluate(() => {
      const q = s => document.querySelector("#content .task-pagehead " + s), b = e => e.getBoundingClientRect(), wh = e => [Math.round(b(e).width), Math.round(b(e).height)];
      const nt = q(".task-new"), sel = q(".bulk-btn"), h1 = q("h1"), seg = q(".actions .seg");
      return { pos: getComputedStyle(nt).position, nt: wh(nt), sel: wh(sel), ntBesideTitle: b(nt).top < b(h1).bottom, segBelow: b(seg).top > b(h1).bottom, excel: !!q(".task-export").offsetParent };
    });
    expect(r.pos, w + "px: New task sits beside the title").toBe("absolute");
    expect(r.nt).toEqual([38, 38]);
    expect(r.sel).toEqual([34, 34]);
    expect(r.ntBesideTitle).toBe(true); expect(r.segBelow).toBe(true); expect(r.excel).toBe(false);
  }
  /* and from 600 px it is the two-row header: New task in the row of the views */
  await page.setViewportSize({ width: 600, height: 844 });
  await show(page, "kanban");
  checkRows(await measure(page), "600px", { tablet: true });
});

test("the topbar never pushes the page sideways, My Tasks' count shown (it did at 1,151–1,197 and 1,281–1,331 px in English)", async ({ page }) => {
  await signIn(page);
  try {
    for (const lang of ["en", "id"]) {
      await page.evaluate(l => setLanguage(l), lang);
      await page.waitForFunction(l => UI_LANG === l, lang);
      for (const w of [1151, 1160, 1180, 1199, 1200, 1240, 1280, 1281, 1300, 1320, 1339, 1340, 1366]) {
        await page.setViewportSize({ width: w, height: 820 });
        await show(page, "kanban");
        for (const cnt of [null, "126"]) {
          const r = await page.evaluate(c => { const n = document.querySelector("#nav .nav-item .cnt"); const was = n && n.textContent; if (n && c) n.textContent = c; const out = { cnt: !!n, sw: document.scrollingElement.scrollWidth, vw: innerWidth, right: Math.max(...[...document.querySelectorAll(".topbar-inner > *")].filter(e => e.offsetParent).map(e => e.getBoundingClientRect().right)) }; if (n && c) n.textContent = was; return out; }, cnt);
          expect(r.cnt, "My Tasks shows its count").toBe(true);
          expect(r.sw, lang + " " + w + "px" + (cnt ? " count " + cnt : "") + ": no sideways scroll").toBeLessThanOrEqual(r.vw);
          expect(r.right, lang + " " + w + "px: the topbar ends on the screen").toBeLessThanOrEqual(r.vw);
        }
      }
    }
  } finally {
    await page.evaluate(() => setLanguage("en"));
  }
});

test.describe("a tablet on its side", () => {
  test.use({ hasTouch: true });
  test("from 981 px a touch screen keeps the desktop's two rows with 36 px controls", async ({ page }) => {
    await signIn(page);
    for (const w of [1024, 1180, 1366]) {
      await page.setViewportSize({ width: w, height: 820 });
      for (const v of VIEWS) {
        await show(page, v);
        checkRows(await measure(page), "touch " + w + "px " + v, { tablet: true });
      }
    }
  });
});
