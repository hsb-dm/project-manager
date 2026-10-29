/* Live updates reach one's own other tabs and devices (Oct 2026). A change was announced to everyone with who made it
   (by), and most handlers dropped what the person signed in had made themselves, so the tab that saved would not draw
   it twice; that dropped it in their other tabs and on their other devices too. The page now makes an id once per
   load (ZC_TAB) and sends it as X-ZC-Tab with every request; the server puts it on each live event the request causes
   (tab), and only that tab skips the echo (liveFromThisTab). Two pages of one browser context are two tabs (one
   session); a second context signed in as the same person is a second device. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
/* signed in, and its live stream open */
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on && !!CHAT_RUNTIME.connection && CHAT_RUNTIME.connection.readyState === 1);
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
/* another tab of the same browser: the same session */
async function openTab(context) { const p = await context.newPage(); await p.goto("/"); await ready(p); return p; }
/* what a page sends to the server, what it hears, and how often it draws its screen */
async function watch(page) {
  const log = { api: [] };
  page.on("request", r => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) log.api.push({ method: r.method(), path: u.pathname, tab: r.headers()["x-zc-tab"] || null }); });
  await page.evaluate(() => { window.__live = []; window.__renders = 0;
    /* a picture, for an upload */
    window.__png = () => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); g.fillStyle = "#e33"; g.fillRect(8, 8, 48, 48); return new Promise(r => c.toBlob(r, "image/png")); };
    const b = msgOnEvent; msgOnEvent = function (ev) { window.__live.push(ev); return b.apply(this, arguments); };
    const rs = renderScreen; renderScreen = function () { window.__renders++; return rs.apply(this, arguments); }; });
  log.liveFetches = () => log.api.filter(x => x.method === "GET" && x.path.startsWith("/api/live/")).map(x => x.path);
  return log;
}
/* the events a page heard of a type (and kind) */
const heard = (page, type, kind) => page.evaluate(([t, k]) => window.__live.filter(e => e.type === t && (k == null || e.kind === k)), [type, kind || null]);
const tabOf = page => page.evaluate(() => window.ZC_TAB);

test("the page names its tab in every request to its server, an upload too, never to Google Drive; a malformed tab is ignored", async ({ page }) => {
  await signIn(page);
  const B = await openTab(page.context()), a = await watch(page), b = await watch(B), tag = Date.now().toString(36), roles = [];
  try {
    const [ta, tb] = [await tabOf(page), await tabOf(B)];
    expect(ta).toMatch(/^[a-z0-9]{8,32}$/); expect(tb).toMatch(/^[a-z0-9]{8,32}$/);
    expect(ta, "two tabs, two ids").not.toBe(tb);
    expect(await page.evaluate(t => Object.keys(sessionStorage).some(k => String(sessionStorage.getItem(k)).indexOf(t) >= 0), ta), "kept nowhere a duplicated tab would copy").toBe(false);
    /* apiFetch, reading and writing */
    await page.evaluate(n => apiFetch("POST", "/api/roles", { name: n, permissions: [] }), "Live tab role " + tag); roles.push("Live tab role " + tag);
    await page.evaluate(() => apiFetch("GET", "/api/live/roles"));
    const sent = a.api.filter(x => x.path === "/api/roles" || x.path === "/api/live/roles");
    expect(sent.length).toBe(2); sent.forEach(x => expect(x.tab, x.method + " " + x.path).toBe(ta));
    /* the other tab heard the role with the saving tab's id, and took it */
    await expect.poll(() => heard(B, "ws_changed", "roles").then(l => l.map(e => e.tab))).toEqual([ta]);
    await expect.poll(() => B.evaluate(n => ROLES.some(r => r.name === n), "Live tab role " + tag)).toBe(true);
    /* an event is this tab's own echo only when it is this tab's and the person signed in here made it: someone who
       learnt the id could send it with a change of theirs, which must still show (and the server tells the id to the
       person's own pages only) */
    expect(await page.evaluate(() => [liveFromThisTab({ type: "ws_changed", tab: ZC_TAB, by: ME }), liveFromThisTab({ type: "ws_changed", tab: ZC_TAB, by: "someone-else" }), liveFromThisTab({ type: "ws_changed", tab: ZC_TAB }), liveFromThisTab({ type: "ws_changed", by: ME })]))
      .toEqual([true, false, true, false]);
    /* an upload to this server (uploadSend) names it too */
    const up = await page.evaluate(async () => { const blob = await window.__png(); const r = await uploadSend(API.base + "/api/files/upload?name=live-tab.png", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: blob }); return r.status; });
    expect(up).toBe(200);
    expect(a.api.filter(x => x.path === "/api/files/upload").map(x => x.tab)).toEqual([ta]);
    /* to Google Drive, never: it would refuse a header it does not know */
    const drive = [];
    await page.route("https://www.googleapis.com/**", r => { drive.push(r.request().headers()); r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" }, body: JSON.stringify({ id: "x", name: "live-tab.png" }) }); });
    await page.evaluate(async () => { const blob = await window.__png(); await uploadSend("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", { method: "POST", headers: { Authorization: "Bearer test" }, body: blob }).catch(() => {}); });
    expect(drive.length).toBeGreaterThan(0); drive.forEach(h => expect(h["x-zc-tab"], "no tab header to Google").toBeUndefined());
    /* a header that is not a tab id: the event names no tab, so every tab, this one too, takes it */
    for (const bad of ["Not A Tab!", "abc", "x".repeat(40), "ABCDEFGH1234"]) {
      const name = "Live tab bad " + bad.length + " " + tag; roles.push(name);
      const st = await page.evaluate(o => fetch("/api/roles", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-ZC-Tab": o.bad }, body: JSON.stringify({ name: o.name, permissions: [] }) }).then(r => r.status), { bad, name });
      expect(st).toBe(200);
      await expect.poll(() => B.evaluate(n => ROLES.some(r => r.name === n), name), "the other tab: " + bad).toBe(true);
      await expect.poll(() => page.evaluate(n => ROLES.some(r => r.name === n), name), "and the tab that sent it, which cannot tell it is its own: " + bad).toBe(true);
    }
    const tabs = (await heard(B, "ws_changed", "roles")).map(e => e.tab === undefined ? null : e.tab);
    expect(tabs).toEqual([ta, null, null, null, null]);
    /* a new load is a new tab */
    await B.reload(); await ready(B);
    expect(await tabOf(B)).not.toBe(tb);
  } finally {
    await page.evaluate(async names => { for (const r of (await apiFetch("GET", "/api/roles")).roles || []) if (names.indexOf(r.name) >= 0) await apiFetch("DELETE", "/api/roles/" + r.id).catch(() => {}); }, roles);
    await B.close();
  }
});

test("every kind of change reaches the same person's other tab without a reload, and the tab that saved it does nothing again", async ({ page }) => {
  test.setTimeout(120000);
  await signIn(page);
  const B = await openTab(page.context()), tag = Date.now().toString(36), m = { tag };
  const a = await watch(page), b = await watch(B), ta = await tabOf(page);
  m.original = await page.evaluate(() => ({ name: WS.name, role: PEOPLE[ME].role || "" }));
  m.scoring = await page.evaluate(() => apiFetch("GET", "/api/scoring/settings").then(r => r.settings));
  const inB = (fn, arg) => expect.poll(() => B.evaluate(fn, arg), { timeout: 10000 });
  try {
    /* projects: on the other tab's Projects screen */
    m.project = "p_lt_" + tag;
    await B.evaluate(() => go("projects"));
    await page.evaluate(o => apiFetch("POST", "/api/projects", { id: o.project, name: "Live tab project " + o.tag, status: "active", owner: ME, teams: [], team: [], milestones: [] }), m);
    await expect(B.locator("#content", { hasText: "Live tab project " + tag })).toBeVisible({ timeout: 10000 });
    /* teams */
    m.team = "team_lt_" + tag;
    await page.evaluate(o => apiFetch("POST", "/api/teams", { id: o.team, name: "Live tab team " + o.tag, color: "blue" }), m);
    await inB(id => TEAMS.some(t => t.id === id), m.team).toBe(true);
    /* people: one's own profile */
    await page.evaluate(o => { const p = JSON.parse(JSON.stringify(PEOPLE[ME])); delete (p.prefs || {})._loaded; return apiFetch("PUT", "/api/members/" + ME, Object.assign({ id: ME }, p, { role: "Live tab lead " + o.tag })); }, m);
    await inB(() => PEOPLE[ME].role, null).toBe("Live tab lead " + tag);
    /* assets: a folder */
    m.folder = "f_lt_" + tag;
    await page.evaluate(o => apiFetch("POST", "/api/folders", { id: o.folder, name: "Live tab folder " + o.tag, type: "other" }), m);
    await inB(id => ASSET_FOLDERS.some(f => f.id === id), m.folder).toBe(true);
    /* knowledge */
    m.page = "k_lt_" + tag;
    await page.evaluate(o => apiFetch("POST", "/api/knowledge", { id: o.page, title: "Live tab page " + o.tag, folder: "General", body: "Written in another tab" }), m);
    await inB(id => KNOWLEDGE.some(k => k.id === id), m.page).toBe(true);
    /* workspace settings: its name, in the other tab's shell */
    await page.evaluate(o => { const d = JSON.parse(JSON.stringify(WS)); delete d.people; d.cloud = (WS.cloud || []).map(dCloud); d.name = "Live tab studio " + o.tag; return apiFetch("PUT", "/api/workspace", d); }, m);
    await inB(() => WS.name, null).toBe("Live tab studio " + tag);
    await expect(B.locator("body")).toContainText("Live tab studio " + tag);
    /* roles */
    await page.evaluate(o => apiFetch("POST", "/api/roles", { name: "Live tab role " + o.tag, permissions: [] }), m);
    await inB(n => ROLES.some(r => r.name === n), "Live tab role " + tag).toBe(true);
    /* AI Hub templates */
    m.template = await page.evaluate(o => apiFetch("POST", "/api/ai/templates", { template: { name: "Live tab template " + o.tag } }).then(r => r.id), m);
    await inB(id => ((WS.ai || {}).promptTemplates || []).some(t => t && t.id === id), m.template).toBe(true);
    /* custom emoji */
    m.emoji = "lt" + tag;
    await page.evaluate(async o => { const blob = await window.__png(); const r = await uploadSend(API.base + "/api/files/upload?name=" + o.emoji + ".png", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: blob }); const j = await r.json(); return apiFetch("POST", "/api/emoji", { name: o.emoji, url: j.url }); }, m);
    await inB(n => CUSTOM_EMOJI.some(c => c.name === n), m.emoji).toBe(true);
    /* Smart Scoring settings: on, with KPIs */
    await page.evaluate(async () => { const cur = (await apiFetch("GET", "/api/scoring/settings")).settings, n = JSON.parse(JSON.stringify(cur)); n.enabled = true; n.modules.kpi.on = true; n.modules.okr.on = true; await apiFetch("PUT", "/api/scoring/settings", { settings: n, configVersion: cur.configVersion }); });
    await inB(() => !!(WS.scoring && WS.scoring.enabled && WS.scoring.modules.kpi.on), null).toBe(true);
    /* KPIs and OKRs */
    m.metric = await page.evaluate(o => apiFetch("POST", "/api/outcomes/metrics", { kind: "kpi", title: "Live tab KPI " + o.tag, baseline: 0, target: 5, rule: { type: "tasks_completed", filter: { project: o.project } } }).then(r => r.id), m);
    await inB(id => !!(SCO.data && SCO.data.metrics.some(x => x.id === id)), m.metric).toBe(true);
    /* extra permissions for someone */
    m.member = await page.evaluate(async o => { const r = await apiFetch("POST", "/api/members", { name: "Live Tab Grantee " + o.tag, email: "live-tab-" + o.tag + "@e2e.test", perm: "member", cap: 40 }); return r.id; }, m);
    await inB(id => !!PEOPLE[id], m.member).toBe(true);
    /* one their role (Member) lacks; this tab has not taken the new person in (its own echo), so it is not asked */
    m.cap = await page.evaluate(id => { const ro = ROLES.find(r => r.id === "member") || { permissions: [] }; const cap = CAPS.map(c => c[0]).find(c => ro.permissions.indexOf(c) < 0); return apiFetch("PUT", "/api/members/" + id + "/cap-grants", { caps: [cap], expiresAt: null }).then(() => cap); }, m.member);
    await inB(o => CAP_GRANTS.some(g => g.userId === o.member && g.cap === o.cap), m).toBe(true);
    /* a project's discussion, open in the other tab */
    await B.evaluate(id => { S.projectTab = "discussion"; go("projects", id); }, m.project);
    await expect(B.locator("#content .pd-box")).toBeVisible();
    await page.evaluate(o => apiFetch("POST", "/api/projects/" + o.project + "/comments", { text: "Live tab comment " + o.tag }), m);
    await expect(B.locator("#content .pd-box")).toContainText("Live tab comment " + tag, { timeout: 10000 });

    /* the tab that saved heard every one with its own id, and fetched and drew nothing for them */
    const mine = await page.evaluate(t => window.__live.filter(e => (e.type === "ws_changed" || e.type === "project_comments") && e.tab === t).map(e => e.kind || e.type), ta);
    for (const k of ["projects", "teams", "people", "assets", "knowledge", "workspace", "roles", "emoji", "outcomes", "grants", "project_comments"]) expect(mine, k).toContain(k);
    await page.waitForTimeout(1200);
    expect(a.liveFetches(), "the saving tab fetched nothing again").toEqual([]);
    expect(await page.evaluate(() => window.__renders), "nor drew its screen again").toBe(0);
    /* the other tab fetched each kind it heard; emoji and extra permissions once each (their own modules, at once) */
    expect(b.liveFetches().length).toBeGreaterThan(8);
    expect(b.liveFetches().filter(p => p === "/api/live/grants").length, "extra permissions fetched once").toBe(1);
    expect(b.liveFetches().filter(p => p === "/api/live/emoji").length, "emoji fetched once").toBe(1);
  } finally {
    await page.evaluate(async o => {
      const ok = p => p.catch(() => {});
      await ok(apiFetch("DELETE", "/api/projects/" + o.project)); await ok(apiFetch("DELETE", "/api/teams/" + o.team)); await ok(apiFetch("DELETE", "/api/folders/" + o.folder)); await ok(apiFetch("DELETE", "/api/knowledge/" + o.page));
      if (o.template) await ok(apiFetch("DELETE", "/api/ai/templates/" + o.template)); await ok(apiFetch("DELETE", "/api/emoji/" + o.emoji));
      if (o.metric) await ok(apiFetch("DELETE", "/api/outcomes/metrics/" + o.metric));
      if (o.member) await ok(apiFetch("DELETE", "/api/members/" + o.member));
      for (const r of (await apiFetch("GET", "/api/roles")).roles || []) if (r.name === "Live tab role " + o.tag) await ok(apiFetch("DELETE", "/api/roles/" + r.id));
      const cur = await apiFetch("GET", "/api/scoring/settings"); await ok(apiFetch("PUT", "/api/scoring/settings", { settings: o.scoring, configVersion: cur.settings.configVersion }));
      const ws = (await apiFetch("GET", "/api/live/workspace")).ws; delete ws.people; ws.name = o.original.name; await ok(apiFetch("PUT", "/api/workspace", ws));
      const me = (await apiFetch("GET", "/api/live/people")).people[ME]; await ok(apiFetch("PUT", "/api/members/" + ME, Object.assign({ id: ME }, me, { role: o.original.role })));
    }, m);
    await B.close();
  }
});

test("one's own preferences follow to one's other tabs and devices: light or dark, language, reminders, a status", async ({ page, browser }) => {
  test.setTimeout(90000);
  await signIn(page);
  const B = await openTab(page.context()), devCtx = await browser.newContext(), D = await devCtx.newPage(); await signIn(D);
  const a = await watch(page), b = await watch(B); await watch(D);
  const both = async (fn, arg, want, what) => { for (const p of [B, D]) await expect.poll(() => p.evaluate(fn, arg), { message: what + (p === B ? " (other tab)" : " (other device)"), timeout: 10000 }).toEqual(want); };
  const at = new Date(Date.now() + 2 * 864e5).toISOString();
  /* where an earlier test left this person: each is changed to the other choice, and put back */
  const was = await page.evaluate(() => ({ look: document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light", pref: myAppearance(), lang: UI_LANG, status: (myPrefs().availability || null) }));
  const look = was.look === "dark" ? "light" : "dark", lang = was.lang === "id" ? "en" : "id", state = was.status && was.status.state === "remote" ? "commuting" : "remote";
  try {
    await page.evaluate(() => go("home")); await B.evaluate(() => go("home")); await D.evaluate(() => go("home"));
    expect(await B.locator("html").getAttribute("data-theme")).toBe(was.look);
    /* light or dark, chosen in one tab */
    await page.evaluate(v => setAppearance(v), look);
    await expect(B.locator("html")).toHaveAttribute("data-theme", look, { timeout: 10000 });
    await expect(D.locator("html")).toHaveAttribute("data-theme", look, { timeout: 10000 });
    /* the other language */
    await page.evaluate(l => setLanguage(l), lang);
    await both(() => UI_LANG, null, lang, "the language");
    const home = lang === "id" ? "Beranda" : "Home";
    await expect(B.locator("#nav")).toContainText(home); await expect(D.locator("#nav")).toContainText(home);
    expect(await B.evaluate(() => [document.documentElement.lang, localStorage.getItem("cos.language")])).toEqual([lang, lang]);
    /* a reminder */
    await page.evaluate(at => addReminder("project", "p_none", at, "Live tab reminder"), at);
    await both(() => reminders().filter(r => r.note === "Live tab reminder" && !r.done).length, null, 1, "the reminder");
    /* a project, on the other device */
    const pid = "p_ltd_" + Date.now().toString(36);
    await page.evaluate(id => apiFetch("POST", "/api/projects", { id, name: "Live device project", status: "active", owner: ME, teams: [], team: [], milestones: [] }), pid);
    await expect.poll(() => D.evaluate(id => PROJECTS.some(p => p.id === id), pid), { timeout: 10000 }).toBe(true);
    await page.evaluate(id => apiFetch("DELETE", "/api/projects/" + id), pid);
    await expect.poll(() => D.evaluate(id => PROJECTS.some(p => p.id === id && p.status !== "archived"), pid), { timeout: 10000 }).toBe(false);
    /* a status */
    await page.evaluate(v => setAvailability(v), state);
    await both(() => availabilityOf(ME).state, null, state, "the status");
    /* the tab that chose them fetched no one again, and drew nothing for its own echoes */
    await page.waitForTimeout(1000);
    expect(a.liveFetches()).toEqual([]);
    expect(await page.evaluate(t => window.__live.filter(e => e.type === "ws_changed" && e.kind === "prefs" && e.tab === t).length, await tabOf(page))).toBeGreaterThanOrEqual(4);
    /* the other tab put them on without saving them back */
    expect(b.api.filter(x => x.method !== "GET" && x.path.startsWith("/api/members/")), "nothing saved back").toEqual([]);
  } finally {
    await page.evaluate(w => { setLanguage(w.lang); setAppearance(w.pref); const p = myPrefs(); p.availability = w.status; saveMyPrefs(); renderNav(); reminders().filter(r => r.note === "Live tab reminder").forEach(r => cancelReminder(r.id)); }, was);
    await expect(B.locator("html")).toHaveAttribute("data-theme", was.look, { timeout: 10000 });
    await expect.poll(() => D.evaluate(() => UI_LANG)).toBe(was.lang);
    await devCtx.close(); await B.close();
  }
});

test("a task open in another tab: one's own change is drawn there without \"Updated by\", and its removal closes it with a plain word", async ({ page }) => {
  await signIn(page);
  const B = await openTab(page.context()), tag = Date.now().toString(36);
  const id = await page.evaluate(n => apiFetch("POST", "/api/tasks", { title: n, status: WS.workflow[0].id, prio: "medium", assignee: ME, assignees: [ME] }).then(t => t.id), "Live tab task " + tag);
  try {
    await expect.poll(() => B.evaluate(id => !!task(id), id)).toBe(true);
    await B.evaluate(id => openTask(id), id);
    await expect(B.locator("#drawer")).toContainText("Live tab task " + tag);
    /* every toast the other tab shows, as it is asked for (a toast leaves by itself, so the screen alone cannot tell) */
    await B.evaluate(() => { window.__toasts = []; const t = toast; toast = function (m) { window.__toasts.push(String(m)); return t.apply(this, arguments); }; });
    await page.evaluate(o => apiFetch("GET", "/api/tasks/" + o.id).then(d => { d.title = "Live tab task renamed " + o.tag; return apiFetch("PUT", "/api/tasks/" + o.id, d); }), { id, tag });
    await expect.poll(() => B.evaluate(id => task(id).title, id)).toBe("Live tab task renamed " + tag);
    await page.waitForTimeout(600);
    expect(await B.evaluate(() => window.__toasts), "no \"Updated by\" for one's own change").toEqual([]);
    await page.evaluate(id => apiFetch("DELETE", "/api/tasks/" + id), id);
    await expect.poll(() => B.evaluate(() => S.drawerTask)).toBeFalsy();
    await expect(B.locator("#toasts")).toContainText("This task was deleted");
    expect(await B.evaluate(() => window.__toasts), "said plainly, not \"deleted by\" oneself").toEqual(["This task was deleted"]);
  } finally {
    await page.evaluate(id => apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}), id);
    await B.close();
  }
});
