/* The task panel over a big List, made cheap (performance stage 1, Oct 2026), in the browser; tests/drawer-perf.test.js
   runs the same pieces on their own.
   - The AI Hub's desktop layout keys on #content.ai-hub-page (was .content:has(>.ai-studio), whose ">*" restyled the
     whole screen on every change): the class is there exactly while the Hub is, and the Hub is laid out as before.
   - The screen is its own stacking context (isolation) so typing in the task panel no longer repaints the List: a
     position:fixed element inside it stays where it was and is not cut off, everything over it stays over it, and on
     Messages nothing changes (its details pane lies over the tab bar on a short phone, as before).
   - The AI panel open hides the floating buttons by body.aichat-open (was body:has(.aichat.open)).
   - The Scoring & Intelligence panel: folded, its body is not built; opened again, it is drawn at once from what was
     loaded, asked for again in the background and changed in place only when the answer differs.
   - The KPI/OKR row of the task open in the panel is asked for once each time it is opened and on a live change to the
     task — not on each redraw.
   Smart Scoring, KPI and OKR are turned on here and put back; the task and the KPI made here are deleted. */
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
const PAGE_ERRORS = [], watch = p => { p.on("pageerror", e => PAGE_ERRORS.push(e.message)); return p; };

test("the AI Hub's desktop layout is on #content.ai-hub-page exactly while the Hub is drawn, and looks as it did", async ({ page }) => {
  watch(page); await page.setViewportSize({ width: 1366, height: 860 });
  await signIn(page);
  await page.evaluate(() => go("aihub"));
  await expect(page.locator("#content > .ai-studio")).toHaveCount(1);
  const hub = () => page.evaluate(() => { const c = document.getElementById("content"), cs = getComputedStyle(c), st = c.querySelector(":scope>.ai-studio"), r = c.getBoundingClientRect(), top = document.querySelector(".topbar").getBoundingClientRect();
    return { cls: c.classList.contains("ai-hub-page"), display: cs.display, overflow: cs.overflowY, height: Math.round(r.height), room: Math.round(innerHeight - top.height), pt: cs.paddingTop,
      grow: st ? getComputedStyle(st).flexGrow : null, kids: [...c.children].every(k => k === st || (getComputedStyle(k).flexGrow === "0" && getComputedStyle(k).marginTop === "0px")),
      props: getComputedStyle(document.querySelector(".ai-studio>.ai-props")).overflowY, scrolls: document.getElementById("appScroll").scrollHeight <= document.getElementById("appScroll").clientHeight + 1 }; });
  /* the page stays still, the screen fills the room under the header, each panel scrolls inside itself */
  expect(await hub()).toEqual({ cls: true, display: "flex", overflow: "hidden", height: (await hub()).room, room: (await hub()).room, pt: "14px", grow: "1", kids: true, props: "auto", scrolls: true });
  /* a search takes the Hub's place without renderScreen: the class goes with it, and the results are not cut off */
  await page.evaluate(() => { document.getElementById("searchInput").value = "zz"; onSearch("zz"); });
  await expect(page.locator("#content > .ai-studio")).toHaveCount(0);
  expect(await page.evaluate(() => { const c = document.getElementById("content"); return [c.classList.contains("ai-hub-page"), getComputedStyle(c).overflowY, getComputedStyle(c).display]; })).toEqual([false, "visible", "flex"]);
  await page.evaluate(() => { document.getElementById("searchInput").value = ""; onSearch(""); });
  await expect(page.locator("#content > .ai-studio")).toHaveCount(1);
  expect((await hub()).cls).toBe(true);
  /* another screen */
  await page.evaluate(() => go("home"));
  expect(await page.evaluate(() => document.getElementById("content").className)).toBe("content");
  /* a phone: the class is there, the desktop layout is not (as before) */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => go("aihub"));
  expect(await page.evaluate(() => { const c = document.getElementById("content"); return [c.classList.contains("ai-hub-page"), getComputedStyle(c).overflowY]; })).toEqual([true, "visible"]);
  await page.evaluate(() => go("home"));
  expect(PAGE_ERRORS).toEqual([]);
});

test("the screen behind the task panel is its own stacking context: nothing in it moves or is cut off, nothing over it goes under, Messages as before", async ({ page }) => {
  watch(page); await page.setViewportSize({ width: 1366, height: 860 });
  await signIn(page);
  const id = await page.evaluate(async () => { const t = await apiFetch("POST", "/api/tasks", { title: "Isolation e2e", status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME] }); await reloadAll(); S.taskScope = "all"; go("tasks", "list"); return t.id; });
  try {
    expect(await page.evaluate(() => getComputedStyle(document.getElementById("content")).isolation)).toBe("isolate");
    /* a fixed element inside the screen is placed by the window and not clipped (a transform, will-change or contain on
       #content would move it, or cut it off) */
    const fixed = await page.evaluate(() => { const el = document.createElement("div"); el.id = "zzFixed"; el.style.cssText = "position:fixed;left:12px;top:300px;width:40px;height:30px;z-index:1000;background:red"; document.querySelector("#content > *").appendChild(el);
      const r = el.getBoundingClientRect(), hit = document.elementFromPoint(30, 315), out = { left: r.left, top: r.top, hit: hit === el }; el.remove(); return out; });
    expect(fixed).toEqual({ left: 12, top: 300, hit: true });
    /* what floats over the screen is on top of it: the AI button, a menu, a popover, a toast, the task panel (each
       looked for again while it slides or fades in) */
    const onTop = sel => page.evaluate(s => { const el = document.querySelector(s); if (!el) return "missing"; const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 14)); return !!hit && (hit === el || el.contains(hit)); }, sel);
    await expect.poll(() => onTop("#aiFab")).toBe(true);
    await page.locator("#content .lcol-cols").click();
    await expect(page.locator("#ctxMenu.open")).toBeVisible();
    await expect.poll(() => onTop("#ctxMenu.open")).toBe(true);
    await page.evaluate(() => closePops());
    await page.evaluate(() => toast("Isolation check"));
    await expect.poll(() => onTop("#toasts .toast:last-child")).toBe(true);
    await page.evaluate(i => openTask(i), id);
    await expect(page.locator("#drawer.open")).toBeVisible();
    await expect.poll(() => onTop("#drawer .dr-head")).toBe(true);
    await expect.poll(() => page.evaluate(() => { const hit = document.elementFromPoint(40, 400); return !!hit && hit.id === "overlay"; }), { message: "the overlay is over the List" }).toBe(true);
    await page.evaluate(() => closeDrawer());
    /* Messages keeps what it had: no stacking context, the details pane over the tab bar on a short phone */
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(() => { S.messageDetailOpen = true; S.messagePane = "detail"; go("messages"); });
    await expect(page.locator("#msgDetail")).toBeVisible();
    const msg = await page.evaluate(() => { const c = document.getElementById("content"), tb = document.getElementById("tabbar").getBoundingClientRect(), d = document.getElementById("msgDetail").getBoundingClientRect();
      const y = tb.top + 4, x = d.left + d.width / 2, hit = document.elementFromPoint(x, y); return { iso: getComputedStyle(c).isolation, overlap: d.bottom > y, top: hit && hit.closest("#msgDetail") ? "details" : hit && hit.closest("#tabbar") ? "tab bar" : String(hit && hit.tagName) }; });
    expect(msg.iso).toBe("auto");
    expect(msg.overlap, "the details pane reaches under the tab bar here").toBe(true);
    expect(msg.top, "the details pane stays over the tab bar, as it was").toBe("details");
    await page.setViewportSize({ width: 1366, height: 860 });
    await page.evaluate(() => go("home"));
    expect(await page.evaluate(() => getComputedStyle(document.getElementById("content")).isolation)).toBe("isolate");
  } finally {
    await page.evaluate(i => apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}), id);
  }
  expect(PAGE_ERRORS).toEqual([]);
});

test("the AI panel open hides the floating buttons by a class of the body", async ({ page }) => {
  watch(page); await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.evaluate(() => { myPrefs().onboardingDone = true; go("home"); });
  await expect(page.locator("#aiFab")).toBeVisible(); await expect(page.locator("#msgFab")).toBeVisible();
  await page.evaluate(() => aiChatToggle(true));
  await expect(page.locator("#aiChat.open")).toBeVisible();
  expect(await page.evaluate(() => document.body.classList.contains("aichat-open"))).toBe(true);
  await expect(page.locator("#aiFab")).toBeHidden(); await expect(page.locator("#msgFab")).toBeHidden();
  await page.evaluate(() => aiChatToggle(false));
  expect(await page.evaluate(() => document.body.classList.contains("aichat-open"))).toBe(false);
  await expect(page.locator("#aiFab")).toBeVisible(); await expect(page.locator("#msgFab")).toBeVisible();
  expect(PAGE_ERRORS).toEqual([]);
});

test.describe.serial("the Scoring & Intelligence panel and its KPI/OKR row in a task", () => {
  let page, original, id, metric, prefs;
  const gets = { scoring: 0, outcomes: 0 };
  test.beforeAll(async ({ browser }) => {
    page = watch(await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage());
    await signIn(page);
    page.on("request", r => { if (r.method() !== "GET") return; const u = r.url(); if (/\/api\/tasks\/[^/]+\/scoring$/.test(u)) gets.scoring++; if (/\/api\/tasks\/[^/]+\/outcomes$/.test(u)) gets.outcomes++; });
    original = await page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings));
    prefs = await page.evaluate(() => ({ scoringPanelOpen: myPrefs().scoringPanelOpen }));
    await page.evaluate(async () => { const cur = (await apiFetch("GET", "/api/scoring/settings")).settings, n = JSON.parse(JSON.stringify(cur)); n.enabled = true; n.modules.hours = { on: true, mode: "hybrid" }; n.modules.kpi.on = true; n.modules.okr.on = true;
      await apiFetch("PUT", "/api/scoring/settings", { settings: n, configVersion: cur.configVersion }); });
    metric = await page.evaluate(() => apiFetch("POST", "/api/outcomes/metrics", { kind: "kpi", title: "Panel e2e KPI", rule: { type: "tasks_completed", scope: "matching", filter: {} }, direction: "up", unit: "tasks", baseline: 0, target: 10, status: "active", period: { start: "2026-01-01", end: "2026-12-31" } }).then(r => r.metrics.find(m => m.title === "Panel e2e KPI").id));
    id = await page.evaluate(async () => { const t = await apiFetch("POST", "/api/tasks", { title: "Feed posts for the panel check", status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME], effort: 3 }); return t.id; });
    await page.reload(); await ready(page);
    expect(await page.evaluate(() => [scoringOn(), scoringModuleOn("kpi")])).toEqual([true, true]);
  });
  test.afterAll(async () => {
    await page.evaluate(async o => { try { closeDrawer(); } catch (e) {} if (o.id) await apiFetch("DELETE", "/api/tasks/" + o.id).catch(() => {}); if (o.metric) await apiFetch("DELETE", "/api/outcomes/metrics/" + o.metric).catch(() => {});
      const cur = await apiFetch("GET", "/api/scoring/settings"); await apiFetch("PUT", "/api/scoring/settings", { settings: o.original, configVersion: cur.settings.configVersion });
      if (o.prefs.scoringPanelOpen === undefined) delete myPrefs().scoringPanelOpen; else myPrefs().scoringPanelOpen = o.prefs.scoringPanelOpen; await saveMyPrefs(); }, { id, metric, original, prefs });
    expect(await page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings.enabled))).toBe(original.enabled);
    expect(await page.evaluate(() => apiFetch("GET", "/api/outcomes").then(r => r.metrics.length))).toBe(0);
    await page.context().close();
    expect(PAGE_ERRORS).toEqual([]);
  });
  const open = () => page.evaluate(i => { openTask(i); if (S.drawerTab !== "brief") setTab("brief"); }, id);
  const panel = () => page.locator("#drawer .scr-panel");

  test("folded, the panel's body is not built and nothing for it is asked for; opened, it is drawn at once", async () => {
    await page.evaluate(() => { myPrefs().scoringPanelOpen = false; });
    gets.scoring = 0; gets.outcomes = 0;
    await open();
    await expect(panel()).toHaveCount(1);
    await expect(panel()).not.toHaveClass(/\bopen\b/);
    await expect.poll(() => gets.scoring).toBe(1);
    expect(await page.evaluate(() => document.querySelector("#drawer .scr-panel .scr-body").childElementCount), "the folded body is empty").toBe(0);
    await page.waitForTimeout(400);
    expect(gets.outcomes, "no KPI/OKR row while folded").toBe(0);
    await panel().locator(".scr-head").click();
    await expect(panel()).toHaveClass(/\bopen\b/);
    await expect(panel().locator('.scr-row[data-scr-module="hours"]')).toBeVisible();
    await expect(panel().locator(".scr-out-row")).toHaveCount(1);
    expect(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains("scr-head")), "the focus stays on the head").toBe(true);
    await expect.poll(() => gets.outcomes).toBe(1);
    await expect(panel().locator(".scr-out-row")).toContainText("Not linked to a KPI or key result");
    /* folded again: the body goes, and comes back on opening */
    await panel().locator(".scr-head").click();
    await expect(panel()).not.toHaveClass(/\bopen\b/);
    expect(await page.evaluate(() => document.querySelector("#drawer .scr-panel .scr-body").childElementCount)).toBe(0);
    await panel().locator(".scr-head").click();
    await expect(panel().locator('.scr-row[data-scr-module="hours"]')).toBeVisible();
    await page.evaluate(() => closeDrawer());
  });

  test("opened again, the panel is drawn from what was loaded at once, asked for in the background, and redrawn only when the answer differs", async () => {
    await page.evaluate(() => { myPrefs().scoringPanelOpen = true; });
    await open(); await expect(panel().locator('.scr-row[data-scr-module="hours"] [data-scr-v="final"] b')).toHaveText("3 h");
    await page.evaluate(() => closeDrawer());
    /* the answer held back: the panel is there with the values it had, no "Loading", no skeleton */
    let release; const gate = new Promise(r => { release = r; });
    await page.route(/\/api\/tasks\/[^/]+\/scoring$/, async route => { await gate; await route.continue(); });
    gets.scoring = 0;
    await open();
    await expect(panel().locator('.scr-row[data-scr-module="hours"] [data-scr-v="final"] b')).toHaveText("3 h");
    await expect.poll(() => gets.scoring, "asked for again in the background").toBe(1);
    expect(await page.evaluate(() => /Loading|Memuat|skel/.test(document.querySelector("#drawer .scr-panel").outerHTML))).toBe(false);
    await page.evaluate(() => { window.__scrEl = document.querySelector("#drawer .scr-panel"); window.__scrBuilt = 0; const b = window.scrPanelHtml; window.scrPanelHtml = function () { window.__scrBuilt++; return b.apply(this, arguments); }; window.__scrBase = b; });
    release();
    await expect.poll(() => page.evaluate(i => !SCR.busy[i], id)).toBe(true);
    await page.waitForTimeout(300); await page.unroute(/\/api\/tasks\/[^/]+\/scoring$/);
    expect(await page.evaluate(() => ({ same: document.querySelector("#drawer .scr-panel") === window.__scrEl, built: window.__scrBuilt })), "the same answer: nothing drawn again").toEqual({ same: true, built: 0 });
    await page.evaluate(() => closeDrawer());
    /* the server's answer changed (a value set by someone else): opened again, it is drawn at once as it was, then only
       the panel changes, in place */
    let release2; const gate2 = new Promise(r => { release2 = r; });
    await page.route(/\/api\/tasks\/[^/]+\/scoring$/, async route => { await gate2; const r = await route.fetch(), j = await r.json(), h = j.rows.hours || { module: "hours", unit: "h", rev: 0 };
      j.rows.hours = Object.assign({}, h, { value: 5, source: "manual", status: "draft", rev: (h.rev || 0) + 1 }); await route.fulfill({ response: r, json: j }); });
    await open();
    await expect(panel().locator('.scr-row[data-scr-module="hours"] [data-scr-v="final"] b')).toHaveText("3 h");
    await page.evaluate(() => { window.__scrRemoved = 0; window.__scrObs = new MutationObserver(ms => ms.forEach(m => [...m.removedNodes].forEach(n => { if (n.nodeType === 1 && !n.classList.contains("scr-panel") && !(m.target.closest && m.target.closest(".scr-panel"))) window.__scrRemoved++; }))); window.__scrObs.observe(document.getElementById("drawer"), { childList: true, subtree: true }); });
    release2();
    await expect(panel().locator('.scr-row[data-scr-module="hours"] [data-scr-v="final"] b')).toHaveText("5 h");
    expect(await page.evaluate(() => { window.__scrObs.disconnect(); return window.__scrRemoved; }), "only the panel was drawn again").toBe(0);
    await page.unroute(/\/api\/tasks\/[^/]+\/scoring$/);
    await page.evaluate(() => { window.scrPanelHtml = window.__scrBase; closeDrawer(); });
  });

  test("the KPI/OKR row is asked for once each time the task is opened and on a live change, not on each redraw", async () => {
    await page.evaluate(() => { myPrefs().scoringPanelOpen = true; });
    gets.outcomes = 0;
    await open();
    await expect(panel().locator(".scr-out-row")).toContainText("Not linked to a KPI or key result");
    await expect.poll(() => gets.outcomes).toBe(1);
    /* redrawn after the 5 s the row used to wait, and the tab left and come back to */
    await page.waitForTimeout(5300);
    await page.evaluate(() => renderDrawer()); await page.evaluate(() => { setTab("comments"); setTab("brief"); }); await page.evaluate(() => renderDrawer());
    await page.waitForTimeout(600);
    expect(gets.outcomes, "a redraw asks nothing").toBe(1);
    /* a change to the task (here a save of our own; the server tells every open copy): asked again */
    await page.evaluate(i => apiFetch("POST", "/api/tasks/" + i + "/comments", { text: "A change the row hears about" }), id);
    await expect.poll(() => gets.outcomes, { timeout: 8000 }).toBe(2);
    /* closed and opened again: once more */
    await page.evaluate(() => closeDrawer()); await open();
    await expect.poll(() => gets.outcomes).toBe(3);
    await page.waitForTimeout(600); expect(gets.outcomes).toBe(3);
    await page.evaluate(() => closeDrawer());
  });
});
