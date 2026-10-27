/* The Archived button on the Tasks page (src/tasks.js ARCHIVED TASKS): "satu tombol di Tasks untuk lihat task mana yang
   sudah diarsipkan". An archived task is hidden from the board by hand (t.hidden) or automatically (done work older
   than Settings → Automation's rule); the List could show them only from inside the Filters dialog.
   - The button is in the page head's actions, before Excel, always (0 too), with the number a click shows: the scope
     (Mine / All) and the other filters held, archived by hand and automatically alike.
   - A click shows only them (Hidden tasks: Hidden only) in the List, the Board and the Calendar, the view, the scope and
     the other filters kept; aria-pressed, the title "Archived tasks", the line under it, "Back to tasks"; again, or
     Back to tasks, or Enter on it (the focus kept), and the board is back. No "Hidden tasks: hidden only" chip beside it.
   - A task archived by hand and a done task archived automatically are both there; a task's menu offers Unarchive for
     the first and, for the second, the rule that archived it (no Archive, which only archived it by hand too).
   - Unarchive: the row goes, the count goes one down, the title stays, nothing drawn twice or skeleton (no blink).
   - Nothing archived (or nothing the other filters let through) says so, in every view; saved views keep it.
   - English and Indonesian, light and dark (the pressed button in the ink tokens, its count on the primary colour in
     the primary ink), at 390 and 360 px (round, in the title's row beside New task), at a tablet's width (in the row
     of actions, Excel giving up its word where that row is short).
   The project and tasks made here are deleted; the language, the look and the filters are put back.
   With ARCH_SHOTS=<folder>, screenshots in light, dark, at 390 px and at 834 px. */
const { test, expect } = require("@playwright/test");
const path = require("path");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const SHOTS = process.env.ARCH_SHOTS || "";
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

test.describe.serial("The Archived button on the Tasks page", () => {
  let page, ctx, m;
  const errors = [];
  const tag = "arch" + Date.now().toString(36);
  const btn = () => page.locator("#content .task-pagehead .actions .task-archived");
  const item = name => page.locator("#ctxMenu.open").getByRole("button", { name, exact: true });
  const shot = async name => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + ".png") }); };
  /* the Tasks page in a view, only this spec's tasks (its tag), archived ones shown or not */
  const show = (view, o) => page.evaluate(([v, t, o]) => {
    closePops(); closeModal(); closeDrawer(); S.search = ""; ENH.bulk = !!o.sel; S.taskScope = o.scope || "all"; S.group = ""; S.sort = "title"; S.sortDir = 1; S.activeView = null;
    S.filters = Object.assign(emptyTaskFilters(), { tag: o.tag === undefined ? t : o.tag }, o.arch ? { hidden: "only" } : {});
    S.calMode = "week"; S.calMonth = TODAY.getMonth(); S.calYear = TODAY.getFullYear(); S.calDay = 0; go("tasks", v);
  }, [view, tag, o || {}]);
  /* what the head says and which of this spec's tasks are drawn */
  const head = () => page.evaluate(ids => {
    const q = s => document.querySelector("#content " + s), b = q(".task-pagehead .actions .task-archived");
    const drawn = Object.keys(ids).filter(k => document.querySelector('#content [data-id="' + ids[k] + '"]'));
    return { h1: q(".task-pagehead h1").textContent.trim(), sub: q(".task-pagehead .muted").textContent.trim(), pressed: b.getAttribute("aria-pressed"), aria: b.getAttribute("aria-label"), title: b.getAttribute("title"),
      label: b.querySelector(".task-archived-label").textContent, count: b.querySelector(".task-archived-count").textContent, beforeExcel: !!(b.nextElementSibling && b.nextElementSibling.classList.contains("task-export")),
      back: !!(q(".task-archived-back") && q(".task-archived-back").offsetParent), chipHidden: [...document.querySelectorAll("#content .fchip")].some(c => /Hidden tasks|Task tersembunyi/.test(c.textContent)),
      drawn: drawn.sort(), filters: Object.assign({}, S.filters), view: S.taskView, scope: S.taskScope };
  }, m.ids);
  const click = async () => { await btn().click(); };

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    page = await ctx.newPage(); page.on("pageerror", e => errors.push(e.message));
    await page.goto("/");
    await page.locator("#au_email").fill(ADMIN.email);
    await page.locator("#au_pw").fill(ADMIN.pw);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await ready(page);
    m = await page.evaluate(async t => {
      const open = WS.workflow.filter(s => s.kind !== "closed"), done = WS.workflow.find(s => s.kind === "closed"), pid = "p_arch_" + t, ids = {};
      await apiFetch("POST", "/api/projects", { id: pid, name: "Archive " + t, status: "active", owner: ME, startDate: iso(-5), dueDate: iso(20) });
      const make = async (k, title, o) => { ids[k] = (await apiFetch("POST", "/api/tasks", Object.assign({ title: title + " " + t, status: open[0].id, prio: "medium", assignee: ME, assignees: [ME], reviewer: ME, reviewers: [ME], tags: [t], proj: pid, startDate: iso(0), dueDate: iso(0) }, o || {}))).id; };
      await make("open1", "Alpha open"); await make("open2", "Bravo open", { status: open[1].id });
      /* archived by hand: two of mine, one of nobody's (shown under All, not under Mine) */
      await make("hand1", "Charlie by hand"); await make("hand2", "Delta by hand", { status: open[1].id });
      await make("other", "Echo nobody's", { assignee: null, assignees: [], reviewer: null, reviewers: [] });
      for (const k of ["hand1", "hand2", "other"]) await apiFetch("POST", "/api/tasks/" + ids[k] + "/hidden", { hidden: true });
      /* done 65 days ago: archived automatically under the default rule (previous months) */
      await make("done", "Foxtrot done long ago", { status: done.id, startDate: iso(-70), dueDate: iso(-66), completedAt: new Date(Date.now() - 65 * 86400000).toISOString() });
      await reloadAll();
      return { pid, ids, auto: JSON.stringify((WS.autoHide || {}).tasks || null), appearance: myPrefs().appearance || null };
    }, tag);
    expect(await page.evaluate(ids => [!!task(ids.hand1).hidden, autoHidden(task(ids.done)), !!task(ids.done).hidden, autoHidden(task(ids.open1))], m.ids), "two archived by hand, one automatically, the open ones not").toEqual([true, true, false, false]);
  });
  test.afterAll(async () => {
    await page.evaluate(async x => {
      try { closePops(); closeModal(); closeDrawer(); } catch (e) {}
      ENH.bulk = false; S.filters = emptyTaskFilters(); S.activeView = null; S.taskScope = "all";
      if (x.appearance) myPrefs().appearance = x.appearance; else delete myPrefs().appearance; applyTheme(); setLanguage("en");
      for (const id of Object.values(x.ids)) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {});
      await apiFetch("DELETE", "/api/projects/" + x.pid).catch(() => {});
    }, m);
    const left = await page.evaluate(async x => { const out = []; for (const id of Object.values(x.ids)) if (await apiFetch("GET", "/api/tasks/" + id).then(() => true, () => false)) out.push(id); const b = await apiFetch("GET", "/api/bootstrap"); if ((b.projects || []).some(p => p.id === x.pid)) out.push(x.pid); return out; }, m);
    expect(left, "what this spec made is gone").toEqual([]);
    await ctx.close();
    expect(errors, "no errors in the page").toEqual([]);
  });

  test("the button: before Excel, the number a click shows in the scope and the other filters, always there", async () => {
    await show("list");
    let h = await head();
    expect(h.beforeExcel, "in the actions, just before Excel").toBe(true);
    expect([h.label, h.count, h.pressed, h.aria], "its name and its count: three by hand, one automatically").toEqual(["Archived", "4", "false", "Archived 4"]);
    expect(h.drawn, "the board shows the open tasks only").toEqual(["open1", "open2"]);
    /* the count is what the same pass over the tasks finds archived, and what a click shows */
    expect(await page.evaluate(() => taskFilterPass().archived)).toBe(4);
    await click();
    h = await head();
    expect(h.drawn, "a click shows the four").toEqual(["done", "hand1", "hand2", "other"]);
    expect(h.count).toBe("4");
    await click();
    /* Mine: nobody's task is not counted */
    await show("list", { scope: "mine" });
    expect((await head()).count, "Mine: three").toBe("3");
    await click();
    expect((await head()).drawn, "Mine: the three shown").toEqual(["done", "hand1", "hand2"]);
    expect((await head()).scope, "the scope kept").toBe("mine");
    /* another filter: medium priority holds them all, high none, and the button stays there at 0 */
    await show("list", { tag: "" }); await page.evaluate(t => setFilter("tag", t), tag);
    expect((await head()).count).toBe("4");
    await page.evaluate(() => setFilter("prio", "high"));
    h = await head();
    expect([h.count, h.aria], "at 0 the button is still there").toEqual(["0", "Archived 0"]);
    await expect(btn()).toBeVisible();
  });

  test("a click shows only them in the List, the Board and the Calendar, the view, scope and filters kept; again, Back to tasks or Enter turns it off", async () => {
    const want = { list: ["done", "hand1", "hand2", "other"], kanban: ["done", "hand1", "hand2", "other"], calendar: ["hand1", "hand2", "other"] };
    for (const v of ["list", "kanban", "calendar"]) {
      await show(v);
      let h = await head();
      expect(h.drawn, v + ": the open ones").toEqual(["open1", "open2"]);
      expect([h.h1, h.pressed, h.back], v + ": off").toEqual(["All tasks", "false", false]);
      await click();
      h = await head();
      expect(h.drawn, v + ": only the archived ones (the done one is not on this week's calendar)").toEqual(want[v]);
      expect([h.h1, h.pressed, h.back, h.title], v + ": on").toEqual(["Archived tasks", "true", true, "Back to tasks"]);
      expect(h.sub, v + ": how many and how they got there").toBe("4 tasks · archived by hand, or automatically when done (previous months)");
      expect([h.view, h.scope, h.filters.tag, h.filters.hidden], v + ": the view, the scope and the other filter kept").toEqual([v, "all", tag, "only"]);
      expect(h.chipHidden, v + ": no Hidden tasks chip beside the pressed button").toBe(false);
      /* every card readable: none greyed out */
      if (v === "kanban") expect(await page.evaluate(id => getComputedStyle(document.querySelector('#content .kcard[data-id="' + id + '"]')).opacity, m.ids.hand1)).toBe("1");
      await click();
      h = await head();
      expect([h.h1, h.pressed, h.back, h.filters.hidden, h.filters.tag], v + ": off again").toEqual(["All tasks", "false", false, "", tag]);
      expect(h.drawn).toEqual(["open1", "open2"]);
      /* Back to tasks above the head */
      await click();
      await page.locator("#content .task-archived-back button").click();
      expect((await head()).pressed, v + ": Back to tasks turns it off").toBe("false");
    }
    /* by key: Enter on the focused button, the focus kept on it as it is drawn again */
    await show("list");
    await btn().focus();
    await page.keyboard.press("Enter");
    expect((await head()).pressed).toBe("true");
    expect(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains("task-archived")), "the focus stays on the button").toBe(true);
    await page.keyboard.press("Enter");
    expect((await head()).pressed).toBe("false");
    /* a saved view keeps it */
    await show("kanban", { arch: true });
    await page.evaluate(() => { const v = Object.assign({ id: "sv_arch_e2e", name: "Archived e2e", owner: ME }, viewSnapshot()); VIEWS.push(v); });
    expect(await page.evaluate(() => VIEWS.find(v => v.id === "sv_arch_e2e").filters.hidden)).toBe("only");
    await show("list");
    await page.evaluate(() => applyView("sv_arch_e2e"));
    const h = await head();
    expect([h.view, h.pressed, h.h1], "the saved view opens on the archived tasks").toEqual(["kanban", "true", "Archived tasks"]);
    await page.evaluate(() => { VIEWS.splice(VIEWS.findIndex(v => v.id === "sv_arch_e2e"), 1); S.activeView = null; });
  });

  test("archived by hand and automatically: both shown, each with its own way back in its menu", async () => {
    await show("kanban", { arch: true });
    expect(await page.evaluate(ids => [ids.hand1, ids.done].map(id => document.querySelector('#content .kcard[data-id="' + id + '"] .muted-badge').textContent), m.ids), "the card says which").toEqual(["hidden", "archived"]);
    await show("list", { arch: true });
    const row = k => page.locator('#content .lcol-tbl tbody tr[data-id="' + m.ids[k] + '"] .lcol-title');
    await row("hand1").click({ button: "right" });
    await expect(item("Unarchive"), "by hand: Unarchive").toBeVisible();
    await expect(item("Archive")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await row("done").click({ button: "right" });
    await expect(page.locator("#ctxMenu.open .mh", { hasText: "Archived automatically · previous months" }), "automatically: why").toBeVisible();
    await expect(item("Change the rule"), "and the rule, for an admin").toBeVisible();
    await expect(item("Archive"), "no Archive: it would only archive it by hand as well").toHaveCount(0);
    await expect(item("Unarchive")).toHaveCount(0);
    await item("Change the rule").click();
    expect(await page.evaluate(() => [S.screen, S.settingsTab])).toEqual(["settings", "automation"]);
    /* an open task's menu is as it was */
    await show("list");
    await page.locator('#content .lcol-tbl tbody tr[data-id="' + m.ids.open1 + '"] td:nth-child(3)').click({ button: "right" });
    await expect(item("Archive")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("Unarchive: the row goes, the count one less, the title kept, nothing drawn twice (no blink)", async () => {
    await show("list", { arch: true });
    const before = await head();
    expect(before.count).toBe("4");
    const order0 = await page.evaluate(() => [...document.querySelectorAll("#content .lcol-tbl tbody tr[data-id]")].map(r => r.getAttribute("data-id")));
    await page.evaluate(id => {
      window.__arch = []; const c = document.getElementById("content");
      const look = () => { const b = c.querySelector(".task-archived-count"); window.__arch.push({ count: b ? b.textContent : null, row: !!c.querySelector('tr[data-id="' + id + '"]'), h1: (c.querySelector(".task-pagehead h1") || {}).textContent || null, pressed: b ? b.parentNode.getAttribute("aria-pressed") : null, skel: !!c.querySelector(".skel") }); };
      window.__archObs = new MutationObserver(look); window.__archObs.observe(c, { childList: true, subtree: true, characterData: true });
    }, m.ids.hand2);
    await page.locator('#content .lcol-tbl tbody tr[data-id="' + m.ids.hand2 + '"] td:nth-child(3)').click({ button: "right" });
    await item("Unarchive").click();
    await expect(page.locator("#toasts .toast", { hasText: "Task restored" })).toBeVisible();
    await expect.poll(() => page.evaluate(id => apiFetch("GET", "/api/tasks/" + id).then(t => !!t.hidden), m.ids.hand2), "saved").toBe(false);
    await page.waitForTimeout(400);
    const seen = await page.evaluate(() => { window.__archObs.disconnect(); return window.__arch; });
    expect(seen.length, "the screen was drawn again").toBeGreaterThan(0);
    const counts = seen.map(s => s.count).filter(Boolean);
    expect(counts[counts.length - 1], "the count went one down").toBe("3");
    expect(counts.every(c => c === "4" || c === "3"), "only 4 and 3 were ever shown (" + counts.join(",") + ")").toBe(true);
    expect(counts.slice(counts.indexOf("3")).every(c => c === "3"), "once 3, never 4 again").toBe(true);
    const rows = seen.map(s => s.row), gone = rows.indexOf(false);
    expect(gone, "the row went").toBeGreaterThanOrEqual(0);
    expect(rows.slice(gone).every(r => !r), "and never came back").toBe(true);
    expect(seen.every(s => !s.skel), "no skeleton").toBe(true);
    expect(seen.every(s => s.h1 === null || s.h1 === "Archived tasks"), "the title stayed").toBe(true);
    expect(seen.every(s => s.pressed === null || s.pressed === "true"), "the button stayed pressed").toBe(true);
    const order1 = await page.evaluate(() => [...document.querySelectorAll("#content .lcol-tbl tbody tr[data-id]")].map(r => r.getAttribute("data-id")));
    expect(order1, "the others in place").toEqual(order0.filter(id => id !== m.ids.hand2));
    /* and it is back among the open ones */
    await click();
    expect((await head()).drawn).toEqual(["hand2", "open1", "open2"]);
  });

  test("nothing archived says so, and what to change when the other filters leave none, in every view", async () => {
    for (const v of ["list", "kanban", "calendar", "grid", "timeline"]) {
      await show(v, { arch: true });
      await page.evaluate(() => setFilter("prio", "urgent"));
      const e = page.locator("#content .task-archived-empty");
      await expect(e, v + ": the note").toContainText("No archived tasks match these filters");
      await expect(e).toContainText("Clear a filter or switch to All tasks.");
      if (v === "calendar") await expect(page.locator("#content .cal-row"), "the calendar keeps its row of controls").toBeVisible();
      else await expect(page.locator("#content .kanban, #content .lcol-tbl, #content .tlw"), v + ": no empty board").toHaveCount(0);
    }
    /* none archived anywhere (the tasks of the page, without the archived ones, for a moment) */
    await show("kanban", { arch: true, tag: "" });
    const note = await page.evaluate(() => { const keep = TASKS; TASKS = keep.filter(t => !(t.hidden || autoHidden(t))); try { renderScreen(false); const e = document.querySelector("#content .task-archived-empty"); return { text: e && e.textContent, count: document.querySelector("#content .task-archived-count").textContent }; } finally { TASKS = keep; } });
    expect(note.text).toContain("No archived tasks");
    expect(note.text).toContain("Archive a task from its menu, or done tasks are archived automatically (previous months).");
    expect(note.count).toBe("0");
    await page.evaluate(() => renderScreen(false));
    /* its Back to tasks turns it off */
    await show("list", { arch: true, tag: "nothing-" + tag });
    await page.locator("#content .task-archived-empty button").click();
    expect((await head()).pressed).toBe("false");
  });

  test("Indonesian: the button, the title, the line, Back to tasks, the empty note and the menus", async () => {
    await page.evaluate(() => setLanguage("id"));
    await page.waitForFunction(() => UI_LANG === "id");
    try {
      await show("list");
      let h = await head();
      expect([h.label, h.aria, h.title], "the button").toEqual(["Diarsipkan", "Diarsipkan 3", "Tampilkan task diarsipkan"]);
      await click();
      h = await head();
      expect([h.h1, h.sub, h.title]).toEqual(["Task diarsipkan", "3 task · diarsipkan manual, atau otomatis setelah selesai (bulan-bulan sebelumnya)", "Kembali ke task"]);
      await expect(page.locator("#content .task-archived-back")).toHaveText("Kembali ke task");
      const english = await page.evaluate(() => document.querySelector("#content .task-pagehead").textContent + " " + document.querySelector("#content .task-archived-back").textContent);
      expect(english, "no English left in the head").not.toMatch(/Archived|Back to tasks|tasks|by hand|automatically/);
      await page.locator('#content .lcol-tbl tbody tr[data-id="' + m.ids.hand1 + '"] td:nth-child(3)').click({ button: "right" });
      await expect(item("Keluarkan dari arsip")).toBeVisible();
      await page.keyboard.press("Escape");
      await page.locator('#content .lcol-tbl tbody tr[data-id="' + m.ids.done + '"] td:nth-child(3)').click({ button: "right" });
      await expect(page.locator("#ctxMenu.open .mh", { hasText: "Diarsipkan otomatis · bulan-bulan sebelumnya" })).toBeVisible();
      await expect(item("Ubah aturan")).toBeVisible();
      await page.keyboard.press("Escape");
      await page.evaluate(() => setFilter("prio", "urgent"));
      await expect(page.locator("#content .task-archived-empty")).toContainText("Tidak ada task diarsipkan yang cocok dengan filter ini");
      const none = await page.evaluate(() => { const keep = TASKS; TASKS = keep.filter(t => !(t.hidden || autoHidden(t))); S.filters.prio = ""; S.filters.tag = ""; try { renderScreen(false); return document.querySelector("#content .task-archived-empty").textContent; } finally { TASKS = keep; renderScreen(false); } });
      expect(none).toContain("Belum ada task yang diarsipkan");
      expect(none).toContain("Arsipkan task dari menunya, atau task selesai diarsipkan otomatis (bulan-bulan sebelumnya).");
      expect(none).toContain("Kembali ke task");
      await show("list", { arch: true });
      await shot("archived-id-light-1366");
    } finally {
      await page.evaluate(() => setLanguage("en"));
    }
  });

  test("light and dark: pressed, it is drawn in the ink tokens, its count on the primary colour in the primary ink", async () => {
    for (const theme of ["light", "dark"]) {
      await page.evaluate(t => { myPrefs().appearance = t; applyTheme(); }, theme);
      for (const on of [false, true]) {
        await show("list", { arch: on });
        const c = await page.evaluate(() => {
          const b = document.querySelector("#content .task-archived"), n = b.querySelector(".task-archived-count"), probe = document.createElement("div"); document.body.appendChild(probe);
          const tok = v => { probe.style.color = "var(" + v + ")"; return getComputedStyle(probe).color; };
          const out = { bg: getComputedStyle(b).backgroundColor, fg: getComputedStyle(b).color, nbg: getComputedStyle(n).backgroundColor, nfg: getComputedStyle(n).color, ink: tok("--color-ink"), inkText: tok("--color-ink-text"), primary: tok("--color-primary"), primaryInk: tok("--color-primary-ink"), surface: tok("--color-surface"), text: tok("--color-text-primary"), theme: document.documentElement.getAttribute("data-theme") };
          probe.remove(); return out;
        });
        const where = theme + (on ? " pressed" : "");
        expect(c.theme).toBe(theme);
        if (on) expect([c.bg, c.fg, c.nbg, c.nfg], where).toEqual([c.ink, c.inkText, c.primary, c.primaryInk]);
        else expect([c.bg, c.fg], where).toEqual([c.surface, c.text]);
        await shot("archived-" + theme + (on ? "-on" : "") + "-1366");
      }
    }
    await page.evaluate(a => { if (a) myPrefs().appearance = a; else delete myPrefs().appearance; applyTheme(); }, m.appearance);
  });

  test("390 and 360 px: round, its count on it, in the title's row beside New task; the views' row unchanged", async () => {
    for (const w of [390, 360]) {
      await page.setViewportSize({ width: w, height: 844 });
      for (const on of [false, true]) {
        await show("kanban", { arch: on });
        const r = await page.evaluate(() => {
          const q = s => document.querySelector("#content .task-pagehead " + s), b = e => e.getBoundingClientRect();
          const a = q(".task-archived"), nt = q(".task-new"), h1 = q("h1"), seg = q(".actions .seg"), n = a.querySelector(".task-archived-count");
          return { box: [Math.round(b(a).width), Math.round(b(a).height)], label: getComputedStyle(a.querySelector(".task-archived-label")).display, count: n.textContent, countShown: b(n).width > 0,
            besideNew: Math.abs(b(a).top - b(nt).top) < 1 && b(a).right <= b(nt).left - 4, aboveViews: b(a).bottom <= b(seg).top, clearOfTitle: b(h1).right <= b(a).left && b(q(".muted")).right <= b(a).left,
            segFits: seg.scrollWidth <= seg.clientWidth + 1, sw: document.scrollingElement.scrollWidth, vw: innerWidth, aria: a.getAttribute("aria-label"), title: a.getAttribute("title"),
            /* pressed: the count on the primary colour in its ink, as on a desktop */
            badge: [getComputedStyle(n).backgroundColor, getComputedStyle(n).color], tokens: (() => { const p = document.createElement("div"); document.body.appendChild(p); const t = v => { p.style.color = "var(" + v + ")"; return getComputedStyle(p).color; }; const o = [t("--color-primary"), t("--color-primary-ink")]; p.remove(); return o; })() };
        });
        const where = w + "px" + (on ? " pressed" : "");
        expect(r.box, where + ": round, 38 px").toEqual([38, 38]);
        expect([r.label, r.count, r.countShown], where + ": its icon and count, its name not drawn").toEqual(["none", "3", true]);
        expect(r.aria, where + ": its name for screen readers").toBe("Archived 3");
        expect(r.title, where + ": and as a tooltip").toBe(on ? "Back to tasks" : "Show archived tasks");
        expect([r.besideNew, r.aboveViews, r.clearOfTitle], where + ": beside New task, over the views, clear of the title").toEqual([true, true, true]);
        expect(r.segFits, where + ": the views fit their row as before").toBe(true);
        expect(r.sw, where + ": no sideways scroll").toBeLessThanOrEqual(r.vw);
        if (on) expect(r.badge, where + ": the count on the primary colour in its ink").toEqual(r.tokens);
        if (w === 390) await shot("archived-390" + (on ? "-on" : ""));
      }
      /* a tap toggles it */
      await show("list");
      await btn().tap().catch(() => btn().click());
      expect((await head()).pressed).toBe("true");
      await expect(page.locator("#content .task-archived-back")).toBeVisible();
    }
    await page.setViewportSize({ width: 1366, height: 900 });
  });

  test("a tablet: in the row of actions, 36 px or more; Excel shows its icon where that row is short, its name kept", async () => {
    await page.evaluate(() => setLanguage("id"));
    await page.waitForFunction(() => UI_LANG === "id");
    try {
      for (const [w, short] of [[600, true], [768, true], [834, true], [900, true], [1024, true], [1100, false], [1240, false]]) {
        await page.setViewportSize({ width: w, height: 900 });
        for (const sel of [false, true]) {
          await show("kanban", { sel });
          const r = await page.evaluate(() => {
            const act = document.querySelector("#content .task-pagehead .actions"), a = act.querySelector(".task-archived"), x = act.querySelector(".task-export"), ab = a.getBoundingClientRect();
            const kids = [...act.children].filter(e => e.offsetParent).map(e => e.getBoundingClientRect());
            return { oneRow: kids.every(k => Math.min(k.bottom, ab.bottom) - Math.max(k.top, ab.top) > 2), w: ab.width, h: ab.height, label: getComputedStyle(a.querySelector(".task-archived-label")).display, excelWord: getComputedStyle(x.querySelector(".task-export-label")).display, excelAria: x.getAttribute("aria-label"), excelTitle: x.getAttribute("title"), right: Math.max(...kids.map(k => k.right)), edge: document.getElementById("content").getBoundingClientRect().right };
          });
          const where = w + "px" + (sel ? " selecting" : "");
          expect(r.oneRow, where + ": in the row of actions").toBe(true);
          expect(Math.min(r.w, r.h), where + ": 36 px or more").toBeGreaterThanOrEqual(35.5);
          expect(r.label !== "none", where + ": its name from 1240 px").toBe(w >= 1240);
          expect(r.excelWord === "none", where + ": Excel's word" + (short ? " given up" : "")).toBe(short);
          expect([r.excelAria, r.excelTitle], where + ": Excel keeps its name").toEqual(["Excel", "Excel"]);
          expect(r.right, where + ": nothing past the edge").toBeLessThanOrEqual(r.edge);
          if (w === 834 && !sel) await shot("archived-834");
        }
      }
    } finally {
      await page.evaluate(() => { ENH.bulk = false; setLanguage("en"); });
      await page.setViewportSize({ width: 1366, height: 900 });
    }
  });
});
