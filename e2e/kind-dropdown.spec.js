/* The kind of work is chosen in the app's own dropdown (Oct 2026, src/scoring-kinds.js kindDropdownHtml), not the
   browser's list (on Windows a bright blue highlight, small plain text, 15 bare names). The trigger is a chip like the
   Estimate beside it — the kind chosen, or "Auto" as a small mark with what the title gives — and read-only the same
   chip, still. Its menu: Auto with what the title gives, then each kind in detection order with its usual hours for
   one deliverable from the workspace's templates, a ✓ on the chosen one; over 8 kinds a box finds one by name or by
   the words of its titles. The keys of a listbox; Esc goes back to the trigger and leaves the task open. Opening and
   closing draw nothing again, a redraw keeps it open beside the new trigger, only one is open at a time. In the
   Smart Scoring panel and the Calculate form it is the same dropdown, the form's choice in its preview. In English and
   Indonesian, light and dark, at phone width. With KDD_SHOTS=<folder>, screenshots of the menu open (light, dark).
   Everything is put back as it was. */
const { test, expect } = require("@playwright/test");
const path = require("path"), { pathToFileURL } = require("url");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const SHOTS = process.env.KDD_SHOTS || "";
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

test("the kind of work: Auto and the kinds with their hours, chosen and kept, by keyboard, found, read-only, on a phone", async ({ page }) => {
  const errors = []; page.on("pageerror", e => errors.push(String(e)));
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  const id = await page.evaluate(async () => (await apiFetch("POST", "/api/tasks", { title: "Video teaser HSB promo", status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME], effort: 4 })).id);
  const look_ = () => page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => ((d.people[ME] || {}).prefs || {}).appearance || (d.ws.theme || {}).appearance || "light"));
  const appearance = await look_(); let themed = false;
  const trig = page.locator("#drawer .enh-blocks .effort .scr-kdd"), pop = page.locator("#scrKdd"), rows = pop.locator("[role=option]");
  const option = v => pop.locator('[role=option][data-v="' + v + '"]'), find = pop.locator("input");
  const openTask_ = () => page.evaluate(i => { openTask(i); S.drawerTab = "brief"; renderDrawer(); }, id);
  const kind = () => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(d => (d.meta || {}).kind), id);
  const box = l => l.boundingBox();
  try {
    await reloadTask();
    /* the trigger: Auto as a small mark, what the title gives, a chevron; a combobox named by its field */
    await expect(trig).toHaveText("Auto · video");
    await expect(trig.locator(".scr-kdd-mk")).toHaveText("Auto");
    await expect(trig.locator(".scr-kdd-chev")).toHaveCount(1);
    await expect(trig).toHaveAttribute("role", "combobox"); await expect(trig).toHaveAttribute("aria-expanded", "false");
    await expect(trig).toHaveAttribute("aria-label", "Kind of work"); await expect(trig).toHaveAttribute("aria-haspopup", "listbox");
    /* the same height, corners, border and font as the Estimate beside it */
    const look = await page.evaluate(() => [document.querySelector("#drawer .enh-blocks .effort input"), document.querySelector("#drawer .enh-blocks .effort .scr-kdd")].map(e => { const c = getComputedStyle(e); return [Math.round(e.getBoundingClientRect().height), c.borderTopLeftRadius, c.borderTopWidth, c.fontFamily, c.fontSize]; }));
    expect(look[1]).toEqual(look[0]);
    /* opening and closing draw nothing again */
    await page.evaluate(() => { window.__kddDraws = 0; window.__kddBase = renderDrawer; renderDrawer = function () { window.__kddDraws++; return window.__kddBase.apply(this, arguments); }; });
    await trig.click();
    await expect(pop).toBeVisible(); await expect(trig).toHaveAttribute("aria-expanded", "true");
    /* Auto first, then each active kind in detection order with its hours */
    const order = await page.evaluate(() => estKindList().filter(k => k.active !== false).map(k => k.id));
    expect(order.length).toBe(14);
    await expect(rows).toHaveCount(15);
    expect(await rows.evaluateAll(r => r.map(x => x.getAttribute("data-v")))).toEqual([""].concat(order));
    await expect(rows.first()).toHaveText("Auto — from the title: video");
    await expect(rows.first()).toHaveAttribute("aria-selected", "true"); await expect(rows.first().locator(".scr-kdd-ck svg")).toHaveCount(1);
    await expect(option("video").locator(".scr-kdd-l")).toHaveText("video"); await expect(option("video").locator(".scr-kdd-h")).toHaveText("4–16 h");
    await expect(option("carousel").locator(".scr-kdd-h")).toHaveText("3–6 h"); await expect(option("resize").locator(".scr-kdd-h")).toHaveText("0.5–3 h");
    await expect(option("video")).toHaveAttribute("aria-selected", "false"); await expect(option("video").locator(".scr-kdd-ck svg")).toHaveCount(0);
    await expect(pop.locator(".scr-kdd-tag"), "only the workspace's own kinds say custom").toHaveCount(0);
    await expect(pop.locator("[role=listbox]")).toHaveAttribute("aria-label", "Kind of work");
    /* over 8 kinds, a box to find one, focused on a computer */
    await expect(find).toBeFocused(); await expect(find).toHaveAttribute("placeholder", "Find a kind");
    await expect(find).toHaveAttribute("aria-activedescendant", await rows.first().getAttribute("id"));
    /* below the trigger or above it, inside the window, 260–300 px wide, at most 320 px tall, the list scrolling */
    let [t, p] = [await box(trig), await box(pop)];
    expect(p.width).toBeGreaterThanOrEqual(260); expect(p.width).toBeLessThanOrEqual(300); expect(p.height).toBeLessThanOrEqual(321);
    expect(p.y >= t.y + t.height - 1 || p.y + p.height <= t.y + 1, "beside the trigger, not over it").toBe(true);
    expect(p.x >= 0 && p.y >= 0 && p.x + p.width <= 1366 && p.y + p.height <= 900).toBe(true);
    expect(await pop.locator(".scr-kdd-list").evaluate(l => l.scrollHeight > l.clientHeight)).toBe(true);
    /* the row under the pointer and the chosen one take the app's soft highlight, not the system's blue */
    await option("story").hover();
    const soft = await page.evaluate(() => { const e = document.createElement("i"); e.style.background = "var(--color-primary-soft)"; document.body.appendChild(e); const c = getComputedStyle(e).backgroundColor; e.remove(); return c; });
    await expect(option("story")).toHaveClass(/\bact\b/);
    expect(await option("story").evaluate(e => getComputedStyle(e).backgroundColor)).toBe(soft);
    expect(await rows.first().evaluate(e => getComputedStyle(e).backgroundColor), "and the chosen one").toBe(soft);
    expect(await option("video").evaluate(e => getComputedStyle(e).backgroundColor), "the others none").toBe("rgba(0, 0, 0, 0)");
    expect(await rows.first().evaluate(e => getComputedStyle(e).color)).toBe(await page.evaluate(() => getComputedStyle(document.querySelector("#drawer .scr-kdd-mk")).color));
    /* a click outside closes it */
    await page.locator("#drHead .dr-title").click({ position: { x: 5, y: 5 } });
    await expect(pop).toBeHidden(); await expect(trig).toHaveAttribute("aria-expanded", "false");
    expect(await page.evaluate(() => window.__kddDraws), "opening and closing drew nothing").toBe(0);

    /* chosen: saved, as the select did it (drawn once at once, once when the save comes back), and kept after a reload */
    await trig.click(); await option("carousel").click();
    await expect(pop).toBeHidden();
    await expect.poll(kind).toBe("carousel");
    await expect(trig).toHaveText("carousel"); await expect(trig).toHaveAttribute("data-value", "carousel");
    await expect(trig, "the focus stays on the trigger").toBeFocused();
    expect(await page.evaluate(() => window.__kddDraws)).toBeLessThanOrEqual(2);
    await page.evaluate(() => { renderDrawer = window.__kddBase; delete window.__kddBase; });
    await page.reload(); await ready(page); await openTask_();
    await expect(trig).toHaveText("carousel");
    await trig.click();
    await expect(option("carousel")).toHaveAttribute("aria-selected", "true"); await expect(option("carousel").locator(".scr-kdd-ck svg")).toHaveCount(1);
    await expect(find).toHaveAttribute("aria-activedescendant", await option("carousel").getAttribute("id"));
    await expect(rows.first()).toHaveText("Auto — from the title: video");
    /* Auto again */
    await rows.first().click();
    await expect.poll(kind).toBeUndefined();
    await expect(trig).toHaveText("Auto · video");

    /* the keyboard: ↓ opens it on the chosen one, ↓ moves, Enter chooses and leaves the focus on the trigger */
    await trig.focus(); await page.keyboard.press("ArrowDown");
    await expect(pop).toBeVisible(); await expect(find).toBeFocused();
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
    await expect(option("story")).toHaveClass(/\bact\b/);
    await expect(find).toHaveAttribute("aria-activedescendant", await option("story").getAttribute("id"));
    await page.keyboard.press("End"); await expect(rows.last()).toHaveClass(/\bact\b/);
    await page.keyboard.press("Home"); await expect(rows.first()).toHaveClass(/\bact\b/);
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
    await expect(pop).toBeHidden(); await expect.poll(kind).toBe("story");
    await expect(trig).toHaveText("story"); await expect(trig).toBeFocused();
    /* Esc closes it, back on the trigger, and the task stays open; Tab closes it */
    await page.keyboard.press("Enter"); await expect(pop).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden(); await expect(trig).toBeFocused(); await expect(page.locator("#drawer")).toHaveClass(/\bopen\b/);
    await page.keyboard.press("Space"); await expect(pop).toBeVisible();
    await page.keyboard.press("Tab"); await expect(pop).toBeHidden(); await expect(trig).toHaveAttribute("aria-expanded", "false");
    expect(await kind(), "nothing chosen by closing").toBe("story");

    /* finding one: by its name, by the words of its titles, in any case; Enter takes the first found */
    await trig.click(); await find.fill("brosur");
    await expect(rows).toHaveCount(2); await expect(rows.nth(1)).toHaveAttribute("data-v", "poster"); await expect(rows.nth(1)).toHaveClass(/\bact\b/);
    await find.fill("VIDEO");
    expect(await rows.evaluateAll(r => r.map(x => x.getAttribute("data-v")))).toEqual(["", "reels", "video"]);
    await find.fill("zzz");
    await expect(rows).toHaveCount(1); await expect(pop.locator(".scr-kdd-none")).toHaveText("No kind of work has “zzz” in its name or words.");
    await page.keyboard.press("Enter"); await expect(pop, "nothing to take").toBeVisible();
    await find.fill("reels"); await page.keyboard.press("Enter");
    await expect.poll(kind).toBe("reels"); await expect(trig).toHaveText("reels or short video");

    /* 8 kinds or fewer: no box, and letters jump (the same letter again: the next one) */
    await page.evaluate(() => { window.__kddWs = WS.scoring; const s = JSON.parse(JSON.stringify(scoringSettings())); s.kinds.forEach((k, i) => { if (i >= 6) k.active = false; }); WS.scoring = s; renderDrawer(); });
    await trig.focus(); await page.keyboard.press("v");
    await expect(pop).toBeVisible(); await expect(find).toHaveCount(0); await expect(rows).toHaveCount(7);
    await expect(option("video")).toHaveClass(/\bact\b/); await expect(trig).toHaveAttribute("aria-activedescendant", await option("video").getAttribute("id"));
    await page.keyboard.press("r"); await page.waitForTimeout(700); await page.keyboard.press("r");
    await expect(option("resize")).toHaveClass(/\bact\b/);
    await page.keyboard.press("r"); await expect(option("reels")).toHaveClass(/\bact\b/);
    await page.keyboard.press("Escape"); await expect(pop).toBeHidden();
    await page.evaluate(() => { WS.scoring = window.__kddWs; delete window.__kddWs; renderDrawer(); });

    /* a redraw while it is open keeps it open beside the new trigger; the task closed, it closes */
    await trig.click(); await find.fill("vid");
    await page.evaluate(() => renderDrawer());
    await expect(pop).toBeVisible(); await expect(find).toHaveValue("vid"); await expect(find).toBeFocused();
    await expect(trig).toHaveAttribute("aria-expanded", "true");
    [t, p] = [await box(trig), await box(pop)];
    expect(p.y >= t.y + t.height - 1 || p.y + p.height <= t.y + 1).toBe(true); expect(Math.abs(p.x - t.x)).toBeLessThan(2);
    await option("video").click(); await expect.poll(kind).toBe("video");
    await trig.click(); await page.evaluate(() => closeDrawer());
    await expect(pop).toBeHidden();
    await openTask_();

    /* one open at a time: the task's other menus close it, and it closes them */
    await trig.click(); await expect(pop).toBeVisible();
    await page.locator('#drawer [data-meta="prio"] .task-read-value.editable, #drawer .task-read-value.editable').first().click();
    await expect(page.locator("#ctxMenu.open")).toHaveCount(1); await expect(pop).toBeHidden();
    await trig.click(); await expect(pop).toBeVisible(); await expect(page.locator("#ctxMenu.open")).toHaveCount(0);
    await page.keyboard.press("Escape");
    /* opened from the keyboard too */
    await page.locator('#drawer [data-meta="prio"] .task-read-value.editable, #drawer .task-read-value.editable').first().click();
    await expect(page.locator("#ctxMenu.open")).toHaveCount(1);
    await trig.focus(); await page.keyboard.press("ArrowDown");
    await expect(pop).toBeVisible(); await expect(page.locator("#ctxMenu.open")).toHaveCount(0);
    await page.keyboard.press("Escape");

    /* read-only: the same chip, still — no chevron, nothing to open */
    await page.evaluate(() => { window.__kddEdit = canI.editTask; canI.editTask = () => false; renderDrawer(); });
    const still = page.locator("#drawer .enh-blocks .effort .scr-kdd");
    await expect(still).toHaveClass(/\bro\b/); await expect(still).toHaveText("video");
    expect(await still.evaluate(e => e.tagName)).toBe("SPAN");
    await expect(still.locator(".scr-kdd-chev")).toHaveCount(0); await expect(still).not.toHaveAttribute("role", "combobox");
    await still.click(); await expect(pop).toBeHidden();
    await page.evaluate(() => { canI.editTask = window.__kddEdit; delete window.__kddEdit; renderDrawer(); });
    await rowsBackToAuto();

    /* Indonesian */
    await page.evaluate(() => setLanguage("id"));
    await expect(trig).toHaveText("Otomatis · video");
    await trig.click();
    await expect(rows.first()).toHaveText("Otomatis — dari judul: video");
    await expect(option("video").locator(".scr-kdd-h")).toHaveText("4–16 j"); await expect(option("poster").locator(".scr-kdd-l")).toHaveText("poster atau flyer");
    await expect(find).toHaveAttribute("placeholder", "Cari jenis");
    await find.fill("zzz"); await expect(pop.locator(".scr-kdd-none")).toHaveText("Tidak ada jenis pekerjaan dengan “zzz” di nama atau katanya.");
    await page.keyboard.press("Escape");
    await page.evaluate(() => setLanguage("en"));

    /* dark: the app's surface and soft highlight, readable */
    themed = true; await page.evaluate(() => setAppearance("dark"));
    await openTask_(); await trig.click(); await option("story").hover();
    const dark = await page.evaluate(() => { const g = e => getComputedStyle(e), d = document.getElementById("drawer"), p = document.getElementById("scrKdd"), r = p.querySelector('[data-v="story"]'), i = document.createElement("i"); i.style.background = "var(--color-primary-soft)"; document.body.appendChild(i); const soft = g(i).backgroundColor; i.remove();
      const lum = s => { const c = s.match(/[\d.]+/g).map(Number).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
      const a = lum(g(r).color), b = lum(g(p).backgroundColor); return { theme: document.documentElement.getAttribute("data-theme"), pop: g(p).backgroundColor, drawer: g(d).backgroundColor, row: g(r).backgroundColor, soft, contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }; });
    expect(dark.theme).toBe("dark"); expect(dark.pop).toBe(dark.drawer); expect(dark.row).toBe(dark.soft); expect(dark.contrast).toBeGreaterThan(7);
    await page.keyboard.press("Escape");
    if (SHOTS) for (const mode of ["light", "dark"]) {
      await page.evaluate(m => setAppearance(m), mode); await openTask_(); await trig.scrollIntoViewIfNeeded(); await trig.click(); await option("story").hover();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SHOTS, "kind-dropdown-" + mode + ".png") });
      const d = await box(page.locator("#drawer"));
      await page.screenshot({ path: path.join(SHOTS, "kind-dropdown-" + mode + "-close.png"), clip: { x: d.x, y: Math.max(0, (await box(pop)).y - 40), width: d.width, height: Math.min(900, (await box(trig)).y + 80) - Math.max(0, (await box(pop)).y - 40) } });
      await page.keyboard.press("Escape");
    }
    await page.evaluate(m => setAppearance(m), appearance);

    /* a phone: inside the screen, and the box waits for a tap before the keyboard comes up */
    await page.setViewportSize({ width: 390, height: 844 });
    await openTask_(); await trig.scrollIntoViewIfNeeded(); await trig.click();
    await expect(pop).toBeVisible(); await expect(find).not.toBeFocused();
    p = await box(pop);
    expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x + p.width).toBeLessThanOrEqual(390); expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y + p.height).toBeLessThanOrEqual(844);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "kind-dropdown-phone.png") });
    await option("feed").click(); await expect.poll(kind).toBe("feed");
    await trig.click(); await rows.first().click(); await expect.poll(kind).toBeUndefined();
    await page.setViewportSize({ width: 1366, height: 900 });
  } finally {
    await page.evaluate(async x => { if (window.__kddBase) { renderDrawer = window.__kddBase; delete window.__kddBase; } if (window.__kddEdit) { canI.editTask = window.__kddEdit; delete window.__kddEdit; } if (window.__kddWs) { WS.scoring = window.__kddWs; delete window.__kddWs; }
      if (UI_LANG !== "en") setLanguage("en"); if (x.themed) setAppearance(x.appearance); closeDrawer(); await apiFetch("DELETE", "/api/tasks/" + x.id).catch(() => {}); }, { id, appearance, themed });
    if (themed) await expect.poll(look_, "the look is as it was").toBe(appearance);
  }
  expect(errors, "no errors in the page").toEqual([]);

  async function reloadTask() { await page.evaluate(() => reloadAll()); await openTask_(); await expect(trig).toBeVisible(); }
  async function rowsBackToAuto() { await trig.click(); await rows.first().click(); await expect.poll(kind).toBeUndefined(); }
});

test("in the Scoring panel and the Calculate form it is the same dropdown: one open at a time, the form's choice in its preview", async ({ page }) => {
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(pathToFileURL(path.join(__dirname, "..", "dist", "creative-os-standalone.html")).href);
  await expect(page.locator(".demo-user-card").first()).toBeVisible({ timeout: 10000 });
  await page.evaluate(() => demoLogin(Object.keys(PEOPLE).find(k => PEOPLE[k].perm === "admin")));
  await page.waitForFunction(() => !API.on && !document.body.classList.contains("auth") && typeof ME === "string" && !!PEOPLE[ME]);
  await page.waitForTimeout(600);   /* the first-run guide, if it opens, is not what is tested here */
  await page.evaluate(() => { closeModal(); if (typeof wqClose === "function") try { wqClose(); } catch (e) {} });
  const id = await page.evaluate(() => { WS.scoring = ScoringSettings.normalizeSettings({ enabled: true }); myPrefs().scoringPanelOpen = true;
    const tk = TASKS.find(t => !t._draft && canI.editTask(t)) || TASKS[0]; tk.title = "Resize the banner for five channels"; tk.assetCount = 5; delete taskMeta(tk).kind; openTask(tk.id); S.drawerTab = "brief"; renderDrawer(); return tk.id; });
  const both = page.locator('#drawer button.scr-kdd[data-kdd="task:' + id + '"]'), pop = page.locator("#scrKdd"), option = v => pop.locator('[role=option][data-v="' + v + '"]');
  await expect(both, "the Effort line's and the Scoring panel's").toHaveCount(2);
  await expect(both.nth(1)).toHaveText("Auto · resize or adaptation");
  /* the panel's opens beside it, and a redraw keeps it beside the panel's, not the Effort line's */
  await both.nth(1).click();
  await expect(pop).toBeVisible(); await expect(both.nth(1)).toHaveAttribute("aria-expanded", "true"); await expect(both.nth(0)).toHaveAttribute("aria-expanded", "false");
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "kind-dropdown-panel.png") });
  await page.evaluate(() => renderDrawer());
  await expect(pop).toBeVisible(); await expect(both.nth(1)).toHaveAttribute("aria-expanded", "true"); await expect(both.nth(0)).toHaveAttribute("aria-expanded", "false");
  const near = async i => { const t = await both.nth(i).boundingBox(), p = await pop.boundingBox(); return Math.abs(p.x - t.x) < 2 && (p.y >= t.y + t.height - 1 || p.y + p.height <= t.y + 1); };
  expect(await near(1)).toBe(true);
  /* the other one opens instead: only one is open */
  await both.nth(0).click();
  await expect(pop).toHaveCount(1); await expect(both.nth(0)).toHaveAttribute("aria-expanded", "true"); await expect(both.nth(1)).toHaveAttribute("aria-expanded", "false");
  expect(await near(0)).toBe(true);
  await page.keyboard.press("Escape"); await expect(pop).toBeHidden();
  /* Calculate: the form's field, its kind from the title; a kind chosen goes into the preview, and Esc leaves the form open */
  await page.locator('#drawer .scr-row[data-scr-module="hours"] [data-scr-act="calculate"]').click();
  const field = page.locator("#modal #scrKind");
  await expect(field).toHaveAttribute("data-value", "resize"); await expect(field).toHaveText("resize or adaptation"); await expect(field).toHaveClass(/\bfld\b/);
  await expect(page.locator('#modal label[for="scrKind"]')).toHaveText("Kind of work");
  const before = await page.locator("#modal [data-scr-preview]").textContent();
  await field.click();
  await expect(pop.locator("[role=option]"), "no Auto in the form: the kinds only").toHaveCount(14);
  await expect(option("resize")).toHaveAttribute("aria-selected", "true");
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "kind-dropdown-form.png") });
  await option("logo").click();
  await expect(pop).toBeHidden(); await expect(field).toHaveAttribute("data-value", "logo"); await expect(field).toHaveText("logo or brand identity");
  expect(await page.evaluate(() => SCR.rate.kind)).toBe("logo");
  await expect(page.locator("#modal [data-scr-preview]")).not.toHaveText(before);
  await field.click(); await expect(pop).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pop).toBeHidden(); await expect(page.locator("#modalWrap")).toHaveClass(/\bopen\b/); await expect(field).toBeFocused();
  /* the form closed while it is open: it closes too */
  await field.click(); await expect(pop).toBeVisible();
  await page.evaluate(() => closeModal());
  await expect(pop).toBeHidden();
  expect(errors, "no errors in the page").toEqual([]);
});
