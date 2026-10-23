/* Escape closes only the innermost open thing (the owner's rule, Oct 2026; src/core.js escLayerOpen). Inside the task
   panel a picker's Esc used to close the picker and the whole panel with it. Now one Esc closes the picker, popover,
   menu or dropdown and nothing else, the focus back on the field that opened it, and the next Esc closes the panel:
   the project picker (after a tick, which draws the panel again), the assignee and reviewer pickers, labels, tags,
   priority, team and status, the kind-of-work dropdown, the task settings menu, a field and the start date under
   "More details", the due date's own picker; in the mixed-kinds editor its dropdown first, then the editor; in the
   comments the @mention list, and the inline reply box. A dialog over the panel (Add dependency, the Delete confirm)
   closes alone, the focus back on the panel's control, and an emoji panel in a dialog closes before the dialog.
   Outside the panel a toolbar dropdown, the List's columns popover, a header's menu, a row's Status and Priority menus
   and the command palette close alone, the focus back where it was; the search box's Esc still clears it. The task and projects made
   here are deleted, and what was changed in the page is put back. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const OPEN = /(^|\s)open(\s|$)/;
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

test.describe.serial("Escape closes only the innermost open thing", () => {
  let page, ctx, m;
  const errors = [];
  const tag = "esc" + Date.now().toString(36);
  const drawer = () => page.locator("#drawer");
  const openPanel = (tab) => page.evaluate(o => { closePops(); openTask(o.id); S.drawerTab = o.tab || "brief"; S.commentVis = "internal"; renderDrawer(); }, { id: m.task, tab });
  const pickerOpen = sel => page.waitForFunction(s => { const i = document.querySelector(s); return !!i && i.matches(":open"); }, sel);
  /* one Esc: the layer is gone, the panel open, the focus on the field; the next Esc: the panel closed */
  async function escapeOnce(name, layer, field) {
    await page.keyboard.press("Escape");
    if (layer) await expect(layer, name + ": one Esc closes it").toBeHidden();
    await expect(drawer(), name + ": the task panel stays open").toHaveClass(OPEN);
    await expect(field, name + ": the focus is back on its field").toBeFocused();
  }
  async function thenThePanel(name) {
    await page.keyboard.press("Escape");
    await expect(drawer(), name + ": the next Esc closes the panel").not.toHaveClass(OPEN);
  }

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    page = await ctx.newPage(); page.on("pageerror", e => errors.push(e.message));
    await page.goto("/");
    await page.locator("#au_email").fill(ADMIN.email);
    await page.locator("#au_pw").fill(ADMIN.pw);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await ready(page);
    m = await page.evaluate(async t => {
      const ids = { a: "p_esca_" + t, b: "p_escb_" + t };
      for (const k of ["a", "b"]) PROJECTS = (await apiFetch("POST", "/api/projects", { id: ids[k], name: "Esc " + k.toUpperCase() + " " + t, status: "active", owner: ME })).map(hProject);
      const d = await apiFetch("POST", "/api/tasks", { title: "Esc layers: a video and 4 reels " + t, status: WS.workflow[1].id, prio: "medium", proj: ids.a, assignee: ME, assignees: [ME], reviewer: ME, reviewers: [ME], tags: [t] });
      const cid = "cm_esc_" + t;
      await apiFetch("POST", "/api/tasks/" + d.id + "/comments", { id: cid, text: "Which logo do we use?" });
      await reloadAll();
      return { ids, names: { a: "Esc A " + t, b: "Esc B " + t }, task: d.id, cid, fields: WS.taskFields, more: myPrefs().taskMoreDetailsOpen };
    }, tag);
  });
  test.afterAll(async () => {
    await page.evaluate(async x => {
      try { closePops(); closeModal(); closeDrawer(); } catch (e) {}
      WS.taskFields = x.fields; if (x.more === undefined) delete myPrefs().taskMoreDetailsOpen; else myPrefs().taskMoreDetailsOpen = x.more; await saveMyPrefs();
      window._cmtDraft = ""; window._cmtAtt = []; window._cmtMentions = []; if (typeof CMT_DRAFTS !== "undefined") CMT_DRAFTS = {}; if (typeof CMT_REPLY_OPEN !== "undefined") CMT_REPLY_OPEN = {};
      await apiFetch("DELETE", "/api/tasks/" + x.task).catch(() => {});
      for (const id of Object.values(x.ids)) await apiFetch("DELETE", "/api/projects/" + id).catch(() => {});
    }, m);
    const left = await page.evaluate(x => Promise.all([apiFetch("GET", "/api/tasks/" + x.task).then(() => "task", () => "")].concat(Object.values(x.ids).map(id => apiFetch("GET", "/api/bootstrap").then(b => (b.projects || []).some(p => p.id === id) ? id : "")))), m);
    expect(left.filter(Boolean), "what this spec made is gone").toEqual([]);
    await ctx.close();
    expect(errors, "no errors in the page").toEqual([]);
  });

  test("in the task panel: one Esc closes the picker, the menu or the dropdown, the next one the panel", async () => {
    const ep = page.locator("#entityPicker");
    /* the project picker; a tick draws the panel again, and the focus still goes back to the field drawn in its place */
    await openPanel();
    const proj = page.locator('#drawer button[onclick="taskProjectPicker(this)"]');
    await proj.click();
    await expect(page.locator("#entityPicker .ep-search")).toBeFocused();
    await page.locator("#entityPicker .ep-row", { hasText: m.names.b }).click();
    await expect(page.locator("#entityPicker .ep-row.chosen", { hasText: m.names.b })).toHaveCount(1);
    await expect(proj).toContainText(m.names.b);
    await expect(page.locator("#entityPicker .ep-search")).toBeFocused();
    await escapeOnce("the project picker", ep, proj);
    await expect(ep).toHaveCount(0);
    await thenThePanel("the project picker");

    /* the assignee and reviewer pickers */
    for (const k of ["assignees", "reviewers"]) {
      await openPanel();
      const add = page.locator('#drawer [data-meta="' + k + '"] button[onclick*="addPersonMenu"]');
      await add.click();
      await expect(page.locator("#entityPicker .ep-search")).toBeFocused();
      await escapeOnce("the " + k + " picker", ep, add);
      await thenThePanel("the " + k + " picker");
    }

    /* the menus of labels, priority, team and status (status shown here: by default the header has it) */
    await page.evaluate(() => { WS.taskFields = [{ id: "status", name: "Status", builtin: true, displayMode: "primary" }]; });
    const menu = page.locator("#ctxMenu");
    for (const [k, sel] of [["labels", 'button[onclick="labelMenu(this)"]'], ["prio", "button.task-read-value"], ["team", "button.task-read-value"], ["status", "button.task-read-value"]]) {
      await openPanel();
      const b = page.locator('#drawer [data-meta="' + k + '"] ' + sel);
      await b.click();
      await expect(menu).toBeVisible();
      await escapeOnce("the " + k + " menu", menu, b);
      await thenThePanel("the " + k + " menu");
    }
    await page.evaluate(x => { WS.taskFields = x; }, m.fields);

    /* a layer that closes itself without saying the press was used (the emoji panel's Esc did) still leaves the panel
       open: the open layers are looked at before any handler runs */
    await openPanel();
    const lab = page.locator('#drawer [data-meta="labels"] button[onclick="labelMenu(this)"]');
    await lab.click();
    await expect(menu).toBeVisible();
    await page.evaluate(() => document.getElementById("ctxMenu").addEventListener("keydown", function quiet(e) { if (e.key === "Escape") { this.removeEventListener("keydown", quiet); closePops(); } }));
    await page.locator("#ctxMenu button").first().focus();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(drawer(), "a layer closed quietly: the task panel stays open").toHaveClass(OPEN);
    await thenThePanel("a layer closed quietly");

    /* tags: its own dropdown, the focus back on Add tag */
    await openPanel();
    const addTag = page.locator("#drawer .task-tags-bottom .tag-picker-add");
    await addTag.click();
    await expect(page.locator("#tagPickSearch")).toBeFocused();
    await page.keyboard.type("zz");
    await escapeOnce("the tag picker", page.locator("#tagPickPop"), addTag);
    await thenThePanel("the tag picker");

    /* the kind of work: its dropdown, its find box focused */
    await openPanel();
    const kind = page.locator("#drawer .enh-blocks .effort .scr-kpick .scr-kdd");
    await kind.click();
    await expect(page.locator("#scrKdd input")).toBeFocused();
    await escapeOnce("the kind of work", page.locator("#scrKdd"), kind);
    await thenThePanel("the kind of work");

    /* the task settings menu, the focus on a position inside it */
    await openPanel();
    const gear = page.locator('#drawer [data-tour="task-settings"]');
    await gear.click();
    await expect(page.locator("#ctxMenu .gear-pos").first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!document.activeElement.closest("#ctxMenu"))).toBe(true);
    await escapeOnce("the task settings menu", menu, gear);
    await thenThePanel("the task settings menu");

    /* the due date's own picker (the browser's: Esc closes it and the page never hears it) */
    await openPanel();
    const due = page.locator('#drawer [data-meta="due"] label.task-date-read');
    await due.focus(); await page.keyboard.press("Enter");
    await pickerOpen('#drawer [data-meta="due"] input[type=date]');
    await escapeOnce("the due date picker", null, due);
    expect(await page.evaluate(() => document.querySelector('#drawer [data-meta="due"] input[type=date]').matches(":open"))).toBe(false);
    await thenThePanel("the due date picker");

    /* under More details: a field's menu, and the start date's picker */
    await page.evaluate(() => { myPrefs().taskMoreDetailsOpen = true; });
    await openPanel();
    await expect(page.locator("#drawer .task-more-toggle")).toHaveAttribute("aria-expanded", "true");
    const custom = page.locator('#drawer .task-meta-secondary [data-meta^="custom-"] button.task-read-value').first();
    await custom.click();
    await expect(menu).toBeVisible();
    await escapeOnce("a field under More details", menu, custom);
    await thenThePanel("a field under More details");
    await openPanel();
    const start = page.locator('#drawer [data-meta="start"] label.task-date-read');
    await start.focus(); await page.keyboard.press("Enter");
    await pickerOpen('#drawer [data-meta="start"] input[type=date]');
    await escapeOnce("the start date picker", null, start);
    await thenThePanel("the start date picker");
    await page.evaluate(x => { if (x === undefined) delete myPrefs().taskMoreDetailsOpen; else myPrefs().taskMoreDetailsOpen = x; }, m.more);
  });

  test("the mixed-kinds editor: its dropdown first, then the editor, then the panel", async () => {
    await openPanel();
    const kind = page.locator("#drawer .enh-blocks .effort .scr-kpick .scr-kdd"), pop = page.locator("#scrKdd");
    const ed = page.locator('#drawer [data-kmix-slot="effort"] .scr-kmix');
    await kind.click();
    await pop.locator('[role=option][data-v=":mix"]').click();
    await expect(ed).toBeVisible();
    const rowKind = ed.locator(".scr-kmix-row").nth(1).locator(".scr-kdd");
    await rowKind.click();
    await expect(pop).toBeVisible();
    await escapeOnce("the mix editor's dropdown", pop, rowKind);
    await expect(ed, "Esc in its dropdown leaves the editor open").toBeVisible();
    await escapeOnce("the mix editor", ed, kind);
    await thenThePanel("the mix editor");
  });

  test("comments: the @mention list, then the panel; the inline reply box, then the panel", async () => {
    await openPanel("comments");
    const box = page.locator("#cmtText"), ep = page.locator("#entityPicker.ep-mention");
    await box.click(); await page.keyboard.type("@");
    await expect(ep).toBeVisible();
    await escapeOnce("the @mention list", ep, box);
    await expect(box, "what was typed stays").toHaveValue("@");
    await box.fill("");
    await thenThePanel("the @mention list");

    await openPanel("comments");
    const reply = page.locator('#drawer .cmt[data-cid="' + m.cid + '"] > div > .acts .cmt-reply-btn'), rbox = page.locator("#drawer .cmt-reply-box");
    await reply.click();
    await expect(rbox).toHaveCount(1);
    await page.keyboard.type("Never mind");
    await escapeOnce("the inline reply box", rbox, reply);
    await thenThePanel("the inline reply box");
  });

  test("a dialog over the panel closes alone, the focus back on the panel's control; an emoji panel in a dialog first", async () => {
    const wrap = page.locator("#modalWrap");
    /* Add dependency */
    await openPanel();
    const dep = page.locator('#drawer button[onclick^="openDependencyPicker"]').first();
    await dep.click();
    await expect(wrap).toHaveClass(OPEN);
    await page.keyboard.press("Escape");
    await expect(wrap, "one Esc closes the dialog").not.toHaveClass(OPEN);
    await expect(drawer(), "the task panel stays open").toHaveClass(OPEN);
    await expect(dep, "the focus is back on Add dependency").toBeFocused();
    await thenThePanel("the dependency dialog");

    /* Delete task's confirm, from the task settings menu: nothing deleted, the focus on the menu's button */
    await openPanel();
    const gear = page.locator('#drawer [data-tour="task-settings"]');
    await gear.click();
    await page.locator("#ctxMenu button.danger").click();
    await expect(wrap).toHaveClass(OPEN);
    await page.keyboard.press("Escape");
    await expect(wrap, "one Esc closes the confirm").not.toHaveClass(OPEN);
    await expect(drawer(), "the task panel stays open").toHaveClass(OPEN);
    await expect(gear, "the focus is back on the task settings button").toBeFocused();
    expect(await page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(() => "kept", () => "gone"), m.task)).toBe("kept");
    await thenThePanel("the delete confirm");

    /* the emoji panel in the status dialog: the panel first, the dialog next */
    /* (the task settings menu was the last menu opened: its keys must not come with this one) */
    await page.evaluate(() => statusModal());
    await expect(wrap).toHaveClass(OPEN);
    const emo = page.locator("#stEmojiBtn"), emenu = page.locator("#ctxMenu.emoji-menu");
    await emo.click();
    await expect(emenu.locator(".emoji-search")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#ctxMenu"), "one Esc closes the emoji panel").toBeHidden();
    await expect(wrap, "and leaves the dialog open").toHaveClass(OPEN);
    await expect(emo, "the focus back on the emoji button").toBeFocused();
    await page.keyboard.press("Escape");
    await expect(wrap, "the next Esc closes the dialog").not.toHaveClass(OPEN);
  });

  test("outside the panel: a toolbar dropdown, the columns popover, a header's menu, a row's menus and the command palette close alone", async () => {
    await page.evaluate(t => { closeDrawer(); S.taskScope = "all"; S.taskView = "list"; S.group = ""; S.filters = Object.assign(emptyTaskFilters(), { tag: t }); if (S.screen !== "tasks") go("tasks"); else renderScreen(false); }, tag);
    const row = page.locator('#content .lcol-tbl tr[data-id="' + m.task + '"]');
    await expect(row).toHaveCount(1);
    const menu = page.locator("#ctxMenu");

    /* a toolbar dropdown: the focus on one of its options, Esc closes it and gives its trigger the focus */
    const pill = page.locator('#content .pillsel-custom[data-pill="sort"]'), trig = pill.locator(".pillsel-trigger");
    await trig.click();
    await expect(pill).toHaveClass(OPEN);
    await pill.locator("[role=option]").first().focus();
    await page.keyboard.press("Escape");
    await expect(pill, "one Esc closes the dropdown").not.toHaveClass(OPEN);
    await expect(trig, "the focus is back on its trigger").toBeFocused();
    await expect(row, "the list is as it was").toHaveCount(1);

    /* the List's columns popover */
    const cols = page.locator("#content .lcol-cols");
    await cols.click();
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(cols).toBeFocused();

    /* a header's own menu */
    const th = page.locator('#content .lcol-tbl th[data-col="status"]');
    await th.click({ button: "right" });
    await expect(page.locator("#ctxMenu.open .lcol-hm")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(th).toBeFocused();

    /* a row's menus, its Status and Priority cells': closed, and no task panel opened */
    for (const c of ["status", "prio"]) {
      await row.locator("td.lcol-" + c).click();
      await expect(menu).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu, "the " + c + " menu closes").toBeHidden();
      await expect(drawer()).not.toHaveClass(OPEN);
    }

    /* the command palette over the task panel: the palette alone, the focus back where it was */
    await openPanel();
    const gear = page.locator('#drawer [data-tour="task-settings"]');
    await gear.focus();
    await page.keyboard.press("Control+k");
    await expect(page.locator("#paletteInput")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#palette"), "one Esc closes the palette").toHaveCount(0);
    await expect(drawer(), "the task panel stays open").toHaveClass(OPEN);
    await expect(gear, "the focus is back where it was").toBeFocused();
    await thenThePanel("the command palette");

    /* the search box's Esc still clears it */
    const search = page.locator("#searchInput");
    await search.click(); await page.keyboard.type("zzq");
    await page.keyboard.press("Escape");
    await expect(search).toHaveValue("");
    await page.evaluate(() => { S.filters = emptyTaskFilters(); go("tasks"); });
  });

  test("on a phone (390 px) the same: the project picker, the kind of work, then the panel", async ({ browser }) => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 } }), p = await phone.newPage();
    p.on("pageerror", e => errors.push(e.message));
    try {
      await p.goto("/");
      await p.locator("#au_email").fill(ADMIN.email);
      await p.locator("#au_pw").fill(ADMIN.pw);
      await p.getByRole("button", { name: "Sign in", exact: true }).click();
      await ready(p);
      const open_ = () => p.evaluate(i => { closePops(); S.mDetails = true; openTask(i); S.drawerTab = "brief"; renderDrawer(); }, m.task);
      const dr = p.locator("#drawer");
      const steps = [["the project picker", '#drawer button[onclick="taskProjectPicker(this)"]', "#entityPicker"], ["the kind of work", "#drawer .enh-blocks .effort .scr-kpick .scr-kdd", "#scrKdd"]];
      for (const [name, f, l] of steps) {
        await open_();
        const field = p.locator(f), layer = p.locator(l);
        await field.click();
        await expect(layer).toBeVisible();
        await p.keyboard.press("Escape");
        await expect(layer, name + ": one Esc closes it").toBeHidden();
        await expect(dr, name + ": the task panel stays open").toHaveClass(OPEN);
        await expect(field, name + ": the focus is back on its field").toBeFocused();
        await p.keyboard.press("Escape");
        await expect(dr, name + ": the next Esc closes the panel").not.toHaveClass(OPEN);
      }
    } finally { await phone.close(); }
  });
});
