/* The dropdowns by touch, on the devices the owner's team uses: iPhones and iPads (WebKit, the "webkit-touch" project)
   and Android phones and tablets (Chromium, "chromium-touch"); playwright.config.js runs this spec only there.
   "di beberapa device walau udah di hard refresh juga masih muncul bug dropdown gabisa": Sort and Group opened, but
   between 561 and 760 px wide (an iPhone on its side, a small tablet, a foldable) the toolbar was a row that scrolled
   sideways, which cut their menus off at its own 44 px — a tap showed nothing to choose. A pill low on a phone (a
   project's List) opened its last choices under the bottom tab bar or off the screen. Here every choice of every
   toolbar pill must be what a finger at its place touches (on the screen, above the tab bar, on top of everything),
   a real tap there must choose it, no box between a pill and the page may cut off what overflows it, and so after
   moving between screens, a redraw from a live update and a reload into the remembered view. The other menus a
   finger opens there are checked too: List columns, saved views, the kind of work, the task's project, a person, a
   project's status. In English and Indonesian, light and dark. Everything is put back as it was. */
const { test, expect, devices } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
/* [device, language, appearance]; the widths 561–760 are where the menus were cut off (568: the phone's header, up to
   599 px; 640–750: the tablet's two rows) */
const DEVICES = {
  webkit: [["iPhone SE (3rd gen)", "en", "light"], ["iPhone 13", "id", "dark"], ["iPhone SE landscape", "id", "light"], ["iPhone 13 landscape", "en", "dark"], ["iPad (gen 11)", "id", "light"]],
  chromium: [["Pixel 7", "en", "dark"], ["Galaxy Tab S4", "id", "dark"], ["Galaxy Tab S9", "en", "light"], ["Galaxy S8 landscape", "id", "light"]]
};
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on, null, { timeout: 30000 });
/* the session cookie is Secure and WebKit keeps no Secure cookie for http://localhost, so it is set here by hand */
async function signIn(ctx, page, baseURL) {
  const r = await ctx.request.post(baseURL + "/api/auth/login", { data: { email: ADMIN.email, password: ADMIN.pw }, headers: { origin: baseURL } });
  const m = /cos_session=([0-9a-f]+)/.exec(r.headers()["set-cookie"] || "");
  expect(m, "signed in").toBeTruthy();
  await ctx.addCookies([{ name: "cos_session", value: m[1], url: baseURL, httpOnly: true, sameSite: "Lax" }]);
  await page.goto(baseURL + "/");
  await ready(page);
  await page.evaluate(() => { try { closeModal(); } catch (e) {} });
}
async function setLook(page, lang, look) {
  if (lang === "id") { await page.evaluate(() => setLanguage("id")); await page.waitForFunction(() => UI_LANG === "id"); }
  /* light or dark is each person's own (saved with their preferences): put back exactly as it was after */
  await page.evaluate(l => { const p = myPrefs(); window.__touchLook = { had: Object.prototype.hasOwnProperty.call(p, "appearance"), was: p.appearance }; setAppearance(l); }, look);
  await page.waitForFunction(l => document.documentElement.getAttribute("data-theme") === l, look);
}
async function restoreLook(page) {
  await page.evaluate(async () => { const k = window.__touchLook; if (k) { if (k.had) setAppearance(k.was); else { delete myPrefs().appearance; saveMyPrefs(); try { localStorage.removeItem("cos.appearance." + ME); } catch (e) {} applyTheme(); } } localStorage.setItem("cos.language", "en"); if (UI_LANG !== "en" || (PEOPLE[ME] && myPrefs().language !== "en")) { await setLanguage("en"); await new Promise(r => setTimeout(r, 600)); } }).catch(() => {});
}
/* a finger at (x, y), on the screen: what it touches is el, not the tab bar or anything else over it */
const REACH = `(function(el){ var b=el.getBoundingClientRect(), x=b.left+Math.min(16,b.width/2), y=b.top+b.height/2;
  if(x<0||x>innerWidth||y<0||y>innerHeight) return {ok:false,why:"off the screen ("+Math.round(x)+","+Math.round(y)+")",x:x,y:y};
  var e=document.elementFromPoint(x,y); return {ok:!!(e&&(el===e||el.contains(e))),why:e?"covered by "+e.tagName.toLowerCase()+"."+String(e.className).slice(0,40)+(e.id?"#"+e.id:""):"nothing there",x:x,y:y}; })`;
/* sel's first shown element where it is, or (when a finger cannot touch it there: below the tab bar, off the screen)
   scrolled to the middle of the page as a person would: where a finger goes, and whether it touches it there */
const aim = (page, sel) => page.evaluate(a => { const el = [...document.querySelectorAll(a.sel)].find(e => e.getClientRects().length); if (!el) return { ok: false, why: "missing " + a.sel }; const f = eval(a.reach), here = f(el); if (here.ok) return here; el.scrollIntoView({ block: "center" }); return f(el); }, { sel, reach: REACH });
async function tapOn(page, sel) { const s = await aim(page, sel); expect(s.ok, sel + ": " + s.why).toBe(true); await page.touchscreen.tap(s.x, s.y); }
/* every visible pill in #content: no box around it cuts it off; a tap opens it; each choice, scrolled into view inside
   the menu as a finger would, is what a finger there touches; with choose, a tap on the choice furthest down (a
   project is not archived here, that asks first) chooses it */
async function pills(page, where, choose) {
  const n = await page.evaluate(() => [...document.querySelectorAll("#content .pillsel-custom")].map((r, i) => r.getClientRects().length ? i : -1).filter(i => i >= 0));
  for (const i of n) {
    /* the i-th pill, found again each time: a live redraw may draw it anew at any moment */
    const pre = await page.evaluate(i => { const r = document.querySelectorAll("#content .pillsel-custom")[i], clip = []; for (let e = r.parentElement; e && e.id !== "content"; e = e.parentElement) { const c = getComputedStyle(e); if (c.overflowX !== "visible" || c.overflowY !== "visible") clip.push(e.tagName.toLowerCase() + "." + e.className + " " + c.overflowX + "/" + c.overflowY); } const was = r.querySelector(".pillsel-native").value, pool = [...r.querySelectorAll(".pillsel-menu [role=option]")].map(o => o.getAttribute("data-value")).filter(v => v !== was && v !== "archived"); return { clip, want: pool[pool.length - 1], name: r.textContent.slice(0, 20) }; }, i);
    expect(pre.clip, where + ": nothing around pill " + i + " cuts off its menu").toEqual([]);
    const s = await page.evaluate(a => { const el = document.querySelectorAll("#content .pillsel-custom")[a.i].querySelector(".pillsel-trigger"), f = eval(a.reach), here = f(el); if (here.ok) return here; el.scrollIntoView({ block: "center" }); return f(el); }, { i, reach: REACH });
    expect(s.ok, where + ": pill " + i + " can be touched: " + s.why).toBe(true);
    await page.touchscreen.tap(s.x, s.y);
    const got = await page.evaluate(a => { const r = document.querySelectorAll("#content .pillsel-custom")[a.i], f = eval(a.reach), m = r.querySelector(".pillsel-menu"), miss = []; if (!r.classList.contains("open")) return { open: false };
      const at = o => { const mb = m.getBoundingClientRect(), ob = o.getBoundingClientRect(); if (ob.top < mb.top || ob.bottom > mb.bottom) m.scrollTop += ob.top - mb.top - 6; return f(o); };
      for (const o of m.querySelectorAll("[role=option]")) { const h = at(o); if (!h.ok) miss.push(o.textContent + ": " + h.why); }
      return { open: true, miss, spot: at(r.querySelector('.pillsel-menu [data-value="' + a.want + '"]')) }; }, { i, want: pre.want, reach: REACH });
    expect(got.open, where + ": a tap opens pill " + i + " (" + pre.name + ")").toBe(true);
    expect(got.miss, where + ": every choice of pill " + i + " (" + pre.name + ") can be touched").toEqual([]);
    if (!choose) { await page.evaluate(() => document.querySelectorAll(".pillsel-custom.open").forEach(pillSelClose)); continue; }
    expect(got.spot.ok, where + ": " + got.spot.why).toBe(true);
    await page.touchscreen.tap(got.spot.x, got.spot.y);
    await expect.poll(() => page.evaluate(i => { const r = document.querySelectorAll("#content .pillsel-custom")[i]; return r ? r.querySelector(".pillsel-native").value : null; }, i), { message: where + ": the tap chose " + pre.want }).toBe(pre.want);
    expect(await page.locator("#content .pillsel-custom.open").count()).toBe(0);
  }
  return n.length;
}
/* is the element a finger would hit at sel's place sel itself (scrolled into view inside its menu)? */
const hits = (page, sel) => page.evaluate(a => { const els = [...document.querySelectorAll(a.sel)].filter(e => e.getClientRects().length); if (!els.length) return "missing"; const o = els[0]; for (let s = o.parentElement; s; s = s.parentElement) { const c = getComputedStyle(s); if (/(auto|scroll)/.test(c.overflowY) && s.scrollHeight > s.clientHeight && s.closest(".menu,.pop,#scrKdd")) { const sb = s.getBoundingClientRect(), ob = o.getBoundingClientRect(); if (ob.top < sb.top || ob.bottom > sb.bottom) s.scrollTop += ob.top - sb.top - 4; break; } } const h = eval(a.reach)(o); return h.ok ? "ok" : h.why; }, { sel, reach: REACH });

for (const browserName of ["webkit", "chromium"]) {
  test.describe(browserName, () => {
    test.skip(({ browserName: b }) => b !== browserName, "each device list runs in its own browser");
    for (const [name, lang, look] of DEVICES[browserName]) {
      test(name + " · " + lang + " · " + look + ": every toolbar pill opens where a finger can choose, and the other menus too", async ({ browser, baseURL }) => {
        test.setTimeout(150000);
        const d = Object.assign({}, devices[name]); delete d.defaultBrowserType;
        const ctx = await browser.newContext(d), page = await ctx.newPage();
        const errors = []; page.on("pageerror", e => errors.push(String(e)));
        await signIn(ctx, page, baseURL);
        const tag = "td" + Date.now().toString(36);
        const made = await page.evaluate(async t => {
          const pid = "p_" + t; PROJECTS = (await apiFetch("POST", "/api/projects", { id: pid, name: "Touch " + t, status: "active", owner: ME, team: [ME] })).map(hProject);
          const tasks = []; for (let i = 0; i < 4; i++) { const d = await apiFetch("POST", "/api/tasks", { title: "Video teaser touch " + t + " " + i, status: WS.workflow[i % 2].id, prio: ["low", "medium", "high", "urgent"][i], assignee: ME, assignees: [ME], proj: pid, effort: 4 }); TASKS.push(hTask(d)); tasks.push(d.id); }
          return { pid, tasks, sort: S.sort, group: S.group, scope: S.taskScope, view: S.taskView, ptab: S.projectTab };
        }, tag);
        try {
          await setLook(page, lang, look);
          const width = await page.evaluate(() => innerWidth);
          /* My tasks (the owner's screen) and all tasks in the List, the Kanban; a project's List; its status in its header */
          const scenes = [
            ["My tasks · List", () => { S.taskScope = "mine"; go("tasks"); S.taskView = "list"; renderScreen(false); }],
            ["All tasks · List", () => { S.taskScope = "all"; go("tasks"); S.taskView = "list"; renderScreen(false); }],
            ["Tasks · Kanban", () => { go("tasks"); S.taskView = "kanban"; renderScreen(false); }],
            ["Project · List", p => { S.projectTab = "list"; go("projects", p); }],
            ["Project · Overview", p => { S.projectTab = "overview"; go("projects", p); }]
          ];
          let total = 0;
          for (const [where, fn] of scenes) {
            await page.evaluate("(" + fn.toString() + ")(" + JSON.stringify(made.pid) + ")");
            await page.evaluate(() => { const s = document.getElementById("appScroll"); if (s) s.scrollTop = 0; });
            total += await pills(page, name + " " + width + "px " + where, true);
          }
          expect(total, "pills were checked").toBeGreaterThanOrEqual(7);
          /* after a redraw from a live update and after moving between screens, the same */
          await page.evaluate(() => { S.taskScope = "all"; go("tasks"); S.taskView = "list"; renderScreen(false); bgRedraw(function () { renderScreen(false); }); });
          await pills(page, name + " after a live redraw");
          /* a menu open while a colleague's change redraws the screen stays open, and a tap on it still chooses */
          const group = '#content .pillsel-custom[data-pill="group"]';
          await tapOn(page, group + " .pillsel-trigger");
          await expect(page.locator(group)).toHaveClass(/\bopen\b/);
          await page.evaluate(() => bgRedraw(function () { renderScreen(false); }));
          await expect(page.locator(group), "still open after the redraw").toHaveClass(/\bopen\b/);
          const other = await page.evaluate(a => { const r = document.querySelector(a.group), cur = r.querySelector(".pillsel-native").value, o = [...r.querySelectorAll(".pillsel-menu [role=option]")].find(x => x.getAttribute("data-value") !== cur && x.getAttribute("data-value")), m = r.querySelector(".pillsel-menu"), mb = m.getBoundingClientRect(), ob = o.getBoundingClientRect(); if (ob.top < mb.top || ob.bottom > mb.bottom) m.scrollTop += ob.top - mb.top - 6; return Object.assign({ value: o.getAttribute("data-value") }, eval(a.reach)(o)); }, { group, reach: REACH });
          expect(other.ok, "a choice after the redraw: " + other.why).toBe(true);
          await page.touchscreen.tap(other.x, other.y);
          await expect.poll(() => page.evaluate(() => S.group), { message: "the tap after the redraw chose" }).toBe(other.value);
          await page.evaluate(p => { go("projects", p); go("tasks"); }, made.pid);
          await pills(page, name + " after moving between screens");
          /* the List's columns, saved views */
          await page.evaluate(() => { S.taskView = "list"; renderScreen(false); });
          await tapOn(page, "#content .lcol-cols");
          await expect.poll(() => hits(page, "#ctxMenu.open .lcol-pr:nth-child(2) label"), { message: "a column's box" }).toBe("ok");
          const hidden = await page.evaluate(() => listColHidden().length);
          await tapOn(page, "#ctxMenu.open .lcol-pr:nth-child(2) label");
          await expect.poll(() => page.evaluate(() => listColHidden().length), { message: "the tap hid a column" }).toBe(hidden + 1);
          await tapOn(page, "#ctxMenu.open .lcol-pr:nth-child(2) label");
          await expect.poll(() => page.evaluate(() => listColHidden().length)).toBe(hidden);
          await page.evaluate(() => closePops());
          await tapOn(page, '#content .task-filter-toolbar [onclick="viewsMenu(this)"]');
          await expect.poll(() => hits(page, "#ctxMenu.open button"), { message: "saved views" }).toBe("ok");
          await page.evaluate(() => closePops());
          /* the task panel: the kind of work, its project, a person */
          await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; renderDrawer(); }, made.tasks[0]);
          /* once it has slid in */
          await page.waitForFunction(() => { const d = document.getElementById("drawer").getBoundingClientRect(); return d.left >= -1 && d.right <= innerWidth + 1 && !document.getElementById("drawer").getAnimations({ subtree: true }).some(a => a.playState === "running" && isFinite(a.effect.getComputedTiming().endTime)); });
          await expect(page.locator("#drawer .scr-kdd").first()).toBeVisible();
          await tapOn(page, "#drawer .scr-kdd");
          await expect.poll(() => hits(page, '#scrKdd [role=option][data-v="carousel"]'), { message: "a kind of work" }).toBe("ok");
          await tapOn(page, '#scrKdd [role=option][data-v="carousel"]');
          await expect.poll(() => page.evaluate(id => ((TASKS.find(t => t.id === id) || {}).meta || {}).kind, made.tasks[0]), { message: "the tap chose the kind" }).toBe("carousel");
          /* the kind's save draws the panel again: "All details" (a phone) is tapped once it has, and again if that redraw took the tap */
          await expect(page.locator("#scrKdd:not([hidden])")).toHaveCount(0);
          const projField = page.locator('#drawer button[onclick="taskProjectPicker(this)"]').first();
          await expect(async () => { if (!(await projField.isVisible())) await tapOn(page, "#drawer .m-details-toggle"); await expect(projField).toBeVisible({ timeout: 1500 }); }).toPass({ timeout: 15000 });
          await tapOn(page, '#drawer button[onclick="taskProjectPicker(this)"]');
          await expect.poll(() => hits(page, ".menu.ep.open .ep-row"), { message: "a project" }).toBe("ok");
          await page.evaluate(() => epClose());
          await tapOn(page, "#drawer button[onclick=\"addPersonMenu(this,'assignees')\"]");
          await expect.poll(() => hits(page, ".menu.ep.open .ep-row, #ctxMenu.open button"), { message: "a person" }).toBe("ok");
          await page.evaluate(() => { try { epClose(); } catch (e) {} closePops(); S.mDetails = false; closeDrawer(); });
          /* a reload into the remembered view: every pill is the app's own again, none left as the browser's list */
          await page.evaluate(p => { S.projectTab = "list"; go("projects", p); }, made.pid);
          await page.reload(); await ready(page);
          await expect.poll(() => page.evaluate(() => document.querySelectorAll("#content .pillsel-custom").length)).toBeGreaterThan(0);
          expect(await page.evaluate(() => [...document.querySelectorAll(".pillsel select")].filter(s => !s.classList.contains("pillsel-native")).length), "no select left un-upgraded").toBe(0);
          await pills(page, name + " after a reload");
          expect(errors, "no page errors").toEqual([]);
        } finally {
          await restoreLook(page);
          await page.evaluate(async m => { try { closeDrawer(); } catch (e) {} S.sort = m.sort; S.group = m.group; S.taskScope = m.scope; S.taskView = m.view; S.projectTab = m.ptab; for (const id of m.tasks) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); await apiFetch("DELETE", "/api/projects/" + m.pid).catch(() => {}); if (typeof listColReset === "function" && listColCustom()) listColReset(); }, made).catch(() => {});
          await ctx.close();
        }
      });
    }
  });
}
