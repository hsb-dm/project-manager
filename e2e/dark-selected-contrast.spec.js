/* Dark mode: what a menu or picker shows as chosen, in the accent colour, can be read (Oct 2026, the owner approved).
   The task panel's project picker named the chosen projects under "Selected (N)" / "Dipilih (N)" in the dark primary,
   which on its soft highlight was 4.8:1 (4.6:1 under the moved row's light, 3.1:1 with the Ink accent). Text in the
   accent now uses --color-primary-text (src/head.html): the primary itself in light, a lighter tint of it in dark.
   Measured here with the colours the page computes, painted over every background behind them, by WCAG's ratio:
   - the project picker's chosen names, plain, highlighted, hovered and under the moved row's light: at least 4.5:1,
     and their check at least 3:1;
   - the kind of work dropdown's chosen row and its check, and the Auto mark on its trigger;
   - the pill-selects' menu (Sort): the chosen option and the one under the pointer;
   with the workspace's accent and with Ink, the darkest of the accents. In light every one of them is exactly the
   primary, as before. With DSC_SHOTS=<folder>, screenshots in light, dark and at 390 px. Everything is put back. */
const { test, expect } = require("@playwright/test");
const path = require("path");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const SHOTS = process.env.DSC_SHOTS || "";
const INK = "#111214";
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

/* in the page: an element's colour (a property: color, stroke) painted over the backgrounds of it and every element
   around it, and its WCAG contrast with them; a 1×1 canvas does the painting, so any colour syntax and alpha count */
const HELPERS = () => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 1; const cx = cv.getContext("2d", { willReadFrequently: true });
  const paint = layers => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#fff"; cx.fillRect(0, 0, 1, 1); layers.forEach(c => { cx.fillStyle = "rgba(0,0,0,0)"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); }); return Array.from(cx.getImageData(0, 0, 1, 1).data).slice(0, 3); };
  const behind = el => { const out = []; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const b = getComputedStyle(n).backgroundColor; if (b && b !== "transparent" && b !== "rgba(0, 0, 0, 0)") out.unshift(b); } return out; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const hex = c => "#" + c.map(v => ("0" + v.toString(16)).slice(-2)).join("");
  window.__dsc = (el, prop, bgFrom) => { if (!el) return null; const layers = behind(bgFrom || el), bg = paint(layers), fg = paint(layers.concat([getComputedStyle(el)[prop || "color"]])), a = lum(fg), b = lum(bg);
    return { fg: hex(fg), bg: hex(bg), ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100, raw: getComputedStyle(el)[prop || "color"] }; };
  /* the primary as the page computes it, for comparing in light */
  window.__dscPrimary = () => { const i = document.createElement("i"); i.style.color = "var(--color-primary)"; document.body.appendChild(i); const c = getComputedStyle(i).color; i.remove(); return c; };
};

test("dark: chosen names and options in the accent colour are readable in the project picker, the kind of work and the pill menus; light is exactly as before", async ({ page }) => {
  const errors = []; page.on("pageerror", e => errors.push(String(e)));
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  await page.evaluate(HELPERS);
  const look_ = () => page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => ((d.people[ME] || {}).prefs || {}).appearance || (d.ws.theme || {}).appearance || "light"));
  const appearance = await look_(); let themed = false;
  const m = await page.evaluate(async t => {
    const ids = {};
    for (const n of ["Alpha", "Bravo", "Charlie"]) { const id = "p_" + n.toLowerCase() + "_" + t; ids[n] = id; PROJECTS = (await apiFetch("POST", "/api/projects", { id, name: n + " " + t, status: "active", owner: ME })).map(hProject); }
    const d = await apiFetch("POST", "/api/tasks", { title: "Video teaser " + t, status: WS.workflow[0].id, prio: "medium", proj: ids.Charlie, alsoIn: [ids.Alpha], effort: 4 }); TASKS.push(hTask(d));
    return { ids, task: d.id };
  }, "dsc" + Date.now().toString(36));
  const away = () => page.mouse.move(2, 2);
  const settled = () => page.waitForTimeout(250); /* the rows' colour and background transitions (.15s) are over */
  const openTask = () => page.evaluate(i => { closePops(); epClose(); S.mDetails = true; openTask(i); S.drawerTab = "brief"; renderDrawer(); }, m.task);
  const picker = page.locator("#entityPicker"), chosen = picker.locator(".ep-row.chosen");
  const chosenNow = () => page.evaluate(() => [...document.querySelectorAll("#entityPicker .ep-row.chosen")].map(r => ({ on: r.classList.contains("on"), hover: r.matches(":hover"), name: __dsc(r.querySelector(".ep-main b")), check: __dsc(r.querySelector(".ep-check svg"), "stroke", r) })));

  /* every place, read in one theme and accent */
  async function measure(label, shots) {
    const out = {};
    /* the task panel's project picker: Charlie (the main project, highlighted as the list opens) and Alpha */
    await openTask(); await away();
    await page.locator('#drawer button[onclick="taskProjectPicker(this)"]').click();
    await expect(chosen).toHaveCount(2); await settled();
    let c = await chosenNow();
    out["project: chosen, highlighted"] = c.find(x => x.on); out["project: chosen, plain"] = c.find(x => !x.on);
    if (shots) await picker.screenshot({ path: path.join(SHOTS, "project-picker-" + label + ".png") });
    await chosen.nth(1).hover(); await settled();
    c = await chosenNow(); out["project: chosen, hovered"] = c.find(x => x.hover);
    /* Bravo ticked: it moves up lit; its light held at its start (the strongest tint) */
    await picker.locator(".ep-row", { hasText: "Bravo" }).click();
    out["project: chosen, moved row's light"] = await page.evaluate(() => { const r = document.querySelector("#entityPicker .ep-row.ep-moved"); if (!r) return null; r.getAnimations().forEach(a => { a.pause(); a.currentTime = 0; }); const o = { name: __dsc(r.querySelector(".ep-main b")), check: __dsc(r.querySelector(".ep-check svg"), "stroke", r) }; r.getAnimations().forEach(a => a.finish()); return o; });
    await settled(); await picker.locator(".ep-row.chosen", { hasText: "Bravo" }).click(); await expect(chosen).toHaveCount(2);
    await page.waitForTimeout(400); await page.evaluate(() => epClose());
    /* the kind of work: the trigger's Auto mark, the chosen row (Auto) and its check */
    await openTask(); await away();
    const trig = page.locator("#drawer .enh-blocks .effort .scr-kdd");
    await trig.scrollIntoViewIfNeeded();
    out["kind: Auto mark on the trigger"] = await page.evaluate(() => __dsc(document.querySelector("#drawer .enh-blocks .effort .scr-kdd .scr-kdd-mk")));
    await trig.click(); await expect(page.locator("#scrKdd .scr-kdd-o.on")).toBeVisible(); await settled();
    out["kind: chosen row"] = await page.evaluate(() => { const o = document.querySelector("#scrKdd .scr-kdd-o.on"); return { name: __dsc(o.querySelector(".scr-kdd-l")), check: __dsc(o.querySelector(".scr-kdd-ck svg"), "stroke", o) }; });
    if (shots) await page.locator("#scrKdd").screenshot({ path: path.join(SHOTS, "kind-of-work-" + label + ".png") });
    await page.keyboard.press("Escape"); await page.evaluate(() => { closePops(); closeDrawer(); });
    /* the pill-selects: Sort's menu, its chosen option and the one under the pointer */
    await page.evaluate(() => { S.taskScope = "all"; S.taskView = "list"; go("tasks"); }); await away();
    const pill = page.locator("#content .pillsel-custom").first();
    await pill.locator(".pillsel-trigger").click(); await expect(pill.locator(".pillsel-menu")).toBeVisible(); await settled();
    out["pill menu: chosen option"] = await page.evaluate(() => __dsc(document.querySelector("#content .pillsel-custom.open .pillsel-menu button[aria-selected=true]")));
    await pill.locator(".pillsel-menu button:not([aria-selected=true])").first().hover(); await settled();
    out["pill menu: option under the pointer"] = await page.evaluate(() => __dsc(document.querySelector("#content .pillsel-custom.open .pillsel-menu button:hover")));
    if (shots) await page.screenshot({ path: path.join(SHOTS, "pill-menu-" + label + ".png"), clip: await page.evaluate(() => { const r = document.querySelector("#content .pillsel-custom.open .pillsel-menu").getBoundingClientRect(); return { x: Math.max(0, r.left - 12), y: Math.max(0, r.top - 52), width: Math.min(innerWidth, r.width + 24), height: r.height + 64 }; }) });
    await page.evaluate(() => { document.querySelectorAll(".pillsel-custom.open").forEach(x => pillSelClose(x)); closePops(); });
    return out;
  }
  /* a name and its check, or one colour, as [what, {fg, bg, ratio}] pairs */
  const each = out => Object.entries(out).flatMap(([k, v]) => v && v.name ? [[k + " — name", v.name], [k + " — check", v.check]] : [[k, v]]);

  try {
    /* light: every one of them is the primary, exactly as before, and the token is the primary */
    const light = await measure("light", !!SHOTS);
    const primary = await page.evaluate(() => __dscPrimary());
    expect(await page.evaluate(() => { const s = getComputedStyle(document.documentElement); return s.getPropertyValue("--color-primary-text").trim() === s.getPropertyValue("--color-primary").trim(); }), "light: the token is the primary").toBe(true);
    for (const [k, v] of each(light)) { expect(v, k).toBeTruthy(); expect(v.raw, "light: " + k + " is the primary").toBe(primary); }

    themed = true; await page.evaluate(() => setAppearance("dark"));
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("dark");
    /* the workspace's accent, then Ink (the darkest preset, chosen here for this page only and never saved) */
    for (const accent of [null, INK]) {
      await page.evaluate(a => { if (a) myPrefs().theme = { accent: a }; else delete myPrefs().theme; applyTheme(); }, accent);
      const label = "dark" + (accent ? "-ink" : "");
      const dark = await measure(label, !!SHOTS);
      const darkPrimary = await page.evaluate(() => __dscPrimary());
      for (const [k, v] of each(dark)) {
        expect(v, k).toBeTruthy();
        const icon = / — check$/.test(k);
        expect(v.ratio, label + ": " + k + " (" + v.fg + " on " + v.bg + ")").toBeGreaterThanOrEqual(icon ? 3 : 4.5);
        expect(v.raw, label + ": " + k + " is a lighter tint, not the dark primary").not.toBe(darkPrimary);
      }
    }
    await page.evaluate(() => { delete myPrefs().theme; applyTheme(); });

    /* a phone: the same picker, readable */
    if (SHOTS) {
      await page.setViewportSize({ width: 390, height: 844 });
      for (const mode of ["dark", "light"]) {
        await page.evaluate(md => setAppearance(md), mode);
        await openTask(); await page.locator('#drawer button[onclick="taskProjectPicker(this)"]').click(); await expect(chosen).toHaveCount(2); await settled();
        await page.screenshot({ path: path.join(SHOTS, "project-picker-" + mode + "-390.png") });
        await page.evaluate(() => { epClose(); closeDrawer(); });
      }
      await page.setViewportSize({ width: 1366, height: 900 });
    }
  } finally {
    await page.evaluate(async x => { delete myPrefs().theme; epClose(); closePops(); closeDrawer(); if (x.themed) setAppearance(x.appearance); else applyTheme();
      await Promise.all([apiFetch("DELETE", "/api/tasks/" + x.task).catch(() => {})].concat(Object.values(x.ids).map(id => apiFetch("DELETE", "/api/projects/" + id).catch(() => {})))); }, Object.assign({ appearance, themed }, m));
    if (themed) await expect.poll(look_, "the look is as it was").toBe(appearance);
  }
  expect(errors, "no errors in the page").toEqual([]);
});
