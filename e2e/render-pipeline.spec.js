/* A redraw does only the work it needs (performance stage 1, October 2026). Measured with 1,577 tasks, most of a
   redraw went into helpers that looked at the whole page after every change: the form-label linker read every
   select's .labels (34 of the Grid's 39 seconds), the dialog focus-return scanned every [onclick] element and moved
   focus by itself, a live redraw measured every element four ways, the translation walked each screen twice, and
   three observers searched the whole page at every change. Global search drew every match at each keystroke.
   Each test checks the work is no longer done, and that what it was for still happens. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const N = 60;   /* more than one search section holds */
let ids = [];

async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  /* English, and Indonesian not yet shown in this page */
  const lang = await page.evaluate(() => UI_LANG);
  if (lang !== "en") { await page.evaluate(() => setLanguage("en")); await page.reload(); await ready(page); }
}
const frames = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30)))));

test("the tasks to draw", async ({ page }) => {
  await signIn(page);
  ids = await page.evaluate(async n => {
    const out = [], st = WS.workflow[0].id;
    for (let i = 0; i < n; i++) { const d = await apiFetch("POST", "/api/tasks", { title: "Zebra probe " + i, status: st, prio: "medium", assignee: ME, assignees: [ME], description: "Plain **words** number " + i }); out.push(d.id); }
    await reloadAll(); return out;
  }, N);
  expect(ids.length).toBe(N);
});

test("form labels: only what was added is looked at, and selects are named as before", async ({ page }) => {
  await signIn(page);
  const reads = await page.evaluate(async () => {
    const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "labels"); let n = 0, whole = 0;
    const dq = Document.prototype.querySelectorAll, eq = Element.prototype.querySelectorAll;
    Object.defineProperty(HTMLSelectElement.prototype, "labels", { configurable: true, get() { n++; return d.get.call(this); } });
    Document.prototype.querySelectorAll = function (s) { if (/label:not\(\[for\]\)/.test(s)) whole++; return dq.apply(this, arguments); };
    Element.prototype.querySelectorAll = function (s) { if (this === document.documentElement && /label:not\(\[for\]\)/.test(s)) whole++; return eq.apply(this, arguments); };
    try { S.taskScope = "all"; go("tasks", "grid"); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))); }
    finally { Object.defineProperty(HTMLSelectElement.prototype, "labels", d); Document.prototype.querySelectorAll = dq; Element.prototype.querySelectorAll = eq; }
    return { n, whole, selects: document.querySelectorAll("#content select").length };
  });
  expect(reads.selects, "the Grid is full of selects").toBeGreaterThan(100);
  expect(reads.n, "no select's .labels is read (each read walked the whole page)").toBe(0);
  expect(reads.whole, "only what was added is searched for labels, not the whole page").toBe(0);
  const named = await page.evaluate(async () => {
    const tick = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    document.getElementById("content").insertAdjacentHTML("beforeend", '<div id="zzLab">'
      + '<div class="field" id="zzF1"><label>Colour</label><select id="zzS1"><option>a</option></select></div>'
      + '<div class="pref"><b>Density</b><select id="zzS2"><option>a</option></select></div>'
      + '<div class="field" id="zzF3"><label>Two</label><select id="zzS3"><option>a</option></select><input></div>'
      + '<div class="field"><b>Wrapped</b><label>Size <select id="zzS4"><option>a</option></select></label></div>'
      + '<label for="zzS5">Elsewhere</label><div class="field"><b>Bold</b><select id="zzS5"><option>a</option></select></div>'
      + '<div class="field" id="zzF6"><b>Nameless</b><select><option>a</option></select></div>'
      + '<div class="field" id="zzF7"><label>Later</label></div></div>');
    await tick();
    document.getElementById("zzF7").insertAdjacentHTML("beforeend", '<select id="zzS7"><option>a</option></select>');
    await tick();
    const g = id => document.getElementById(id), lab = document.querySelector("#zzF6 select");
    const out = { s1for: g("zzF1").querySelector("label").htmlFor, s1: g("zzS1").getAttribute("aria-label"), s2: g("zzS2").getAttribute("aria-label"),
      s3for: g("zzF3").querySelector("label").htmlFor, s3: g("zzS3").getAttribute("aria-label"), s4: g("zzS4").getAttribute("aria-label"),
      s5: g("zzS5").getAttribute("aria-label"), s6: lab.getAttribute("aria-label"), s7for: g("zzF7").querySelector("label").htmlFor, s7: g("zzS7").getAttribute("aria-label") };
    g("zzLab").remove(); return out;
  });
  expect(named).toEqual({ s1for: "zzS1", s1: null, s2: "Density", s3for: "", s3: "Two", s4: null, s5: null, s6: "Nameless", s7for: "zzS7", s7: null });
});

test("focus stays where a redraw left it, and goes back to what opened a dialog when it closes", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => { go("home"); document.getElementById("content").insertAdjacentHTML("afterbegin", '<div id="zzFocus"><button type="button" class="btn" onclick="openModal(\'Probe\',\'<input id=zz_in>\')">Open probe</button></div>'); });
  const opener = page.locator("#zzFocus button");
  await opener.click();
  await expect(page.locator("#modalWrap")).toHaveClass(/\bopen\b/);
  await expect(page.locator("#zz_in")).toBeFocused();
  await page.evaluate(() => closeModal());
  await expect(opener, "back on what opened the dialog").toBeFocused();
  /* the opener drawn again while the dialog is open: focus goes to the one drawn in its place */
  await opener.click();
  await expect(page.locator("#zz_in")).toBeFocused();
  await page.evaluate(() => { const f = document.getElementById("zzFocus"); f.innerHTML = f.innerHTML; closeModal(); });
  await expect(page.locator("#zzFocus button"), "on the control drawn in its place").toBeFocused();
  /* a redraw that takes the focused control away puts focus nowhere by itself */
  const after = await page.evaluate(async () => {
    const f = document.getElementById("zzFocus"); f.querySelector("button").focus(); f.innerHTML = f.innerHTML;
    document.body.classList.add("zz-probe"); document.getElementById("content").classList.add("zz-probe");
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))));
    document.body.classList.remove("zz-probe"); document.getElementById("content").classList.remove("zz-probe");
    const a = document.activeElement; f.remove(); return a === document.body ? "the page" : a.outerHTML.slice(0, 80);
  });
  expect(after, "focus did not jump onto the redrawn button").toBe("the page");
});

test("a redraw measures only the app's scrollers, and an opted-in one keeps its place", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => { S.taskScope = "all"; go("tasks", "kanban"); });
  const r = await page.evaluate(() => {
    const d = Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight"); let n = 0;
    Object.defineProperty(Element.prototype, "scrollHeight", { configurable: true, get() { n++; return d.get.call(this); } });
    try { renderScreen(false); } finally { Object.defineProperty(Element.prototype, "scrollHeight", d); }
    return { n, els: document.querySelectorAll("#content *").length };
  });
  expect(r.els, "a board with many cards").toBeGreaterThan(500);
  expect(r.n, "not every element measured to find the scrollers").toBeLessThan(20);
  /* any element can opt in with data-keep-scroll */
  const kept = await page.evaluate(() => {
    const base = renderTasks;
    renderTasks = function () { const out = base.apply(this, arguments); document.getElementById("content").insertAdjacentHTML("beforeend", '<div data-keep-scroll id="zzKeep" style="height:60px;overflow:auto"><div style="height:600px">x</div></div>'); return out; };
    try { renderScreen(false); document.getElementById("zzKeep").scrollTop = 220; bgRedraw(function () { renderScreen(false); }); return document.getElementById("zzKeep").scrollTop; }
    finally { renderTasks = base; renderScreen(false); }
  });
  expect(kept).toBe(220);
});

test("translation: no walk while English has only ever been shown, one walk per draw in Indonesian, nothing missed", async ({ page }) => {
  await signIn(page);
  const en = await page.evaluate(id => { const ws = UI_TEXT_SOURCE; let n = 0;
    UI_TEXT_SOURCE = { get(k) { n++; return ws.get(k); }, set(k, v) { n++; return ws.set(k, v); } };
    try { S.taskScope = "all"; go("tasks", "list"); openTask(id); renderDrawer(); go("home"); } finally { UI_TEXT_SOURCE = ws; closeDrawer(); }
    return { n, lang: UI_LANG };
  }, ids[0]);
  expect(en.lang).toBe("en");
  expect(en.n, "English text is already English: nothing walked").toBe(0);
  const navEn = await page.evaluate(() => document.getElementById("nav").textContent);
  const walks = await page.evaluate(id => {
    setLanguage("id"); S.taskScope = "all"; go("tasks", "list"); openTask(id);
    const ws = UI_TEXT_SOURCE; let gets = 0;
    UI_TEXT_SOURCE = { get(k) { gets++; return ws.get(k); }, set(k, v) { return ws.set(k, v); } };
    const out = {};
    try {
      renderScreen(false); out.screen = gets; gets = 0; localizeVisibleText(document.getElementById("content")); out.screenOnce = gets; gets = 0;
      renderDrawer(); out.drawer = gets; gets = 0; localizeVisibleText(document.getElementById("drawer")); out.drawerOnce = gets;
    } finally { UI_TEXT_SOURCE = ws; }
    return out;
  }, ids[0]);
  expect(walks.screenOnce).toBeGreaterThan(50);
  expect(walks.screen, "the screen is walked once, not twice").toBeLessThan(walks.screenOnce * 1.5);
  expect(walks.drawerOnce).toBeGreaterThan(20);
  expect(walks.drawer, "the task panel is walked once, not twice").toBeLessThan(walks.drawerOnce * 1.5);
  /* what is added after the draw is still translated: a switch named from its row (src/enhance.js) */
  const sw = await page.evaluate(() => { const base = renderDashboard;
    renderDashboard = function () { const r = base.apply(this, arguments); document.getElementById("content").insertAdjacentHTML("beforeend", '<div class="pref" id="zzSw"><b class="lbl">Settings</b><span class="switch" role="switch"></span></div>'); return r; };
    try { go("home"); return { got: document.querySelector("#zzSw .switch").getAttribute("aria-label"), want: tr("Settings") }; } finally { renderDashboard = base; renderScreen(false); } });
  expect(sw.want).not.toBe("Settings");
  expect(sw.got, "the switch's name, added after the screen was translated, is translated too").toBe(sw.want);
  /* nothing was left for another walk to translate, on screens that add to what renderScreen drew */
  const screens = [["home"], ["tasks", "list"], ["tasks", "kanban"], ["tasks", "grid"], ["projects"], ["settings", "profile"], ["calendar"], ["teams"]];
  for (const s of screens) {
    const left = await page.evaluate(([s, id]) => {
      go(s[0], s[1]); if (s[0] === "tasks" && s[1] === "list") { openTask(id); setTab("brief"); }
      const mo = new MutationObserver(() => {}); mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
      localizeVisibleText(document.getElementById("content")); if (S.drawerTask) localizeVisibleText(document.getElementById("drawer"));
      const n = mo.takeRecords().length; mo.disconnect(); if (S.drawerTask) closeDrawer(); return n;
    }, [s, ids[0]]);
    expect(left, "nothing left untranslated on " + s.join(" ")).toBe(0);
  }
  /* and back to English: what was translated in place is English again */
  const navId = await page.evaluate(() => document.getElementById("nav").textContent);
  expect(navId, "the menu was in Indonesian").not.toBe(navEn);
  const navBack = await page.evaluate(() => { setLanguage("en"); return document.getElementById("nav").textContent; });
  expect(navBack).toBe(navEn);
});

test("moving between screens sets the page's scroll only when it changes, and still remembers it", async ({ page }) => {
  await signIn(page);
  const sets = await page.evaluate(() => {
    const el = appScrollEl(), d = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop"); let n = 0;
    Object.defineProperty(el, "scrollTop", { configurable: true, get() { return d.get.call(this); }, set(v) { n++; d.set.call(this, v); } });
    try { go("home"); go("settings", "profile"); go("teams"); go("home"); } finally { delete el.scrollTop; }
    return n;
  });
  expect(sets, "at the top and staying at the top: nothing set").toBe(0);
  const back = await page.evaluate(() => { S.taskScope = "all"; S.taskView = "list"; go("tasks", "list"); appScrollTop(240); const was = appScrollTop(); go("home"); const home = appScrollTop(); go("tasks", "list"); return { was, home, back: appScrollTop() }; });
  expect(back.was, "the list is long enough to scroll").toBe(240);
  expect(back.home).toBe(0);
  expect(back.back, "coming back puts it where it was").toBe(240);
  await page.evaluate(() => { appScrollTop(0); go("home"); });
});

test("a redraw of the task panel only asks what is under the pointer when a picture's handles could need it", async ({ page }) => {
  await signIn(page);
  await page.mouse.move(500, 400);
  const asks = await page.evaluate(async id => {
    openTask(id); S.drawerTab = "brief"; S.descMode = "editor"; let n = 0; const o = document.elementFromPoint;
    document.elementFromPoint = function () { n++; return o.apply(this, arguments); };
    try { renderDrawer(); renderDrawer(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); } finally { document.elementFromPoint = o; }
    return n;
  }, ids[1]);
  expect(asks, "no picture in this task's writing").toBe(0);
  /* a picture under a pointer that has not moved keeps its handles through a redraw */
  await page.evaluate(id => { const t = task(id); openTask(id); S.drawerTab = "brief"; S.descMode = "editor"; renderDrawer(); }, ids[1]);
  await expect(page.locator("#descSrc")).toBeVisible();
  await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 240; c.height = 160; const x = c.getContext("2d"); x.fillStyle = "#1F4FD8"; x.fillRect(0, 0, 240, 160);
    const blob = await new Promise(r => c.toBlob(r, "image/png")); const dt = new DataTransfer(); dt.items.add(new File([blob], "probe.png", { type: "image/png" }));
    const el = document.getElementById("descSrc"); el.focus(); el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect.poll(() => page.evaluate(id => task(id).description || "", ids[1]), { timeout: 15000 }).toContain("zc-att:");
  await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; S.descMode = "editor"; renderDrawer(); }, ids[1]);
  const img = page.locator("#descSrc img.desc-img").first();
  await expect(img).toBeVisible();
  await img.hover();
  await expect(page.locator("#descImgSize")).toHaveClass(/\bon\b/);
  await page.evaluate(() => renderDrawer());
  await expect(page.locator("#descImgSize"), "the handle is still there after the redraw").toHaveClass(/\bon\b/);
  await page.evaluate(() => closeDrawer());
});

test("typing a comment does not measure the box at each key", async ({ page }) => {
  await signIn(page);
  await page.evaluate(id => { openTask(id); setTab("comments"); }, ids[2]);
  await page.locator("#cmtText").click();
  await page.evaluate(() => { window.__gcs = 0; window.__gcsBase = window.getComputedStyle; window.getComputedStyle = function (el) { if (el && el.id === "cmtText") window.__gcs++; return window.__gcsBase.apply(this, arguments); }; });
  await page.keyboard.type("hello there");
  const r = await page.evaluate(async () => { window.getComputedStyle = window.__gcsBase; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const ta = document.getElementById("cmtText"), m = ta.parentNode.querySelector(".cmt-ta-mirror");
    return { n: window.__gcs, text: m.textContent.replace(new RegExp(String.fromCharCode(8203) + "$"), ""), font: m.style.fontSize === getComputedStyle(ta).fontSize, pad: m.style.paddingLeft === getComputedStyle(ta).paddingLeft }; });
  expect(r.n, "the box's style is read once, not at each key").toBe(0);
  expect(r.text, "the layer still draws what is typed").toBe("hello there");
  expect(r.font && r.pad, "with the box's own font and padding").toBe(true);
  await page.evaluate(() => { const el = document.getElementById("cmtText"); el.value = ""; window._cmtDraft = ""; el.blur(); closeDrawer(); });
});

test("the page watchers look only at what was added", async ({ page }) => {
  await signIn(page);
  const r = await page.evaluate(async () => {
    const qa = Document.prototype.querySelectorAll, q = Document.prototype.querySelector, seen = {};
    Document.prototype.querySelectorAll = function (s) { seen[s] = (seen[s] || 0) + 1; return qa.apply(this, arguments); };
    Document.prototype.querySelector = function (s) { seen[s] = (seen[s] || 0) + 1; return q.apply(this, arguments); };
    try { S.taskScope = "all"; go("tasks", "list"); renderScreen(false); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30)))); }
    finally { Document.prototype.querySelectorAll = qa; Document.prototype.querySelector = q; }
    return { pill: seen[".pillsel:not(.pillsel-custom) select"] || 0, eye: seen['input[type="password"]:not([data-no-eye])'] || 0, drive: seen['[data-drive-pending="1"]'] || 0 };
  });
  expect(r, "no whole-page search per change").toEqual({ pill: 0, eye: 0, drive: 0 });
  /* and what they are for still happens to what is added */
  const did = await page.evaluate(async () => {
    const c = document.getElementById("content");
    c.insertAdjacentHTML("beforeend", '<div id="zzObs"><div class="pillsel"><span>Order</span><select><option value="a">Alpha</option><option value="b">Beta</option></select></div><input type="password" id="zzPw"><a data-drive-pending="1" href="https://docs.google.com/document/d/zzprobe/edit"><span class="lc-name">x</span></a></div>');
    await new Promise(r => setTimeout(r, 200));
    const o = { pill: !!c.querySelector("#zzObs .pillsel.pillsel-custom .pillsel-trigger"), eye: !!c.querySelector("#zzObs .pw-wrap .pw-eye"), drive: c.querySelector("#zzObs a").getAttribute("data-drive-pending") };
    document.getElementById("zzObs").remove(); return o;
  });
  expect(did).toEqual({ pill: true, eye: true, drive: null });
});

test("search draws 50 results per section, Show all draws the rest in place, and descriptions are read once", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => go("home"));
  const panel = page.locator("#content section.panel", { has: page.locator(".panel-head h2", { hasText: /^Tasks$/ }) });
  await page.locator("#searchInput").fill("Zebra probe");
  await expect(panel.locator(".task-row")).toHaveCount(50);
  const more = panel.locator(".search-more");
  await expect(more).toHaveText("Show all (" + N + ")");
  await expect(panel.locator(".cnt"), "the count is of every match").toHaveText(String(N));
  await page.evaluate(() => { window.__rs = 0; const f = renderScreen; window.__rsBase = f; renderScreen = function () { window.__rs++; return f.apply(this, arguments); }; document.querySelector("#content section.panel")._zz = 1; });
  await more.click();
  await expect(panel.locator(".task-row")).toHaveCount(N);
  await expect(more).toHaveCount(0);
  expect(await page.evaluate(() => ({ rs: window.__rs, same: document.querySelector("#content section.panel")._zz === 1 })), "drawn in place, not the page again").toEqual({ rs: 0, same: true });
  await page.evaluate(() => { renderScreen = window.__rsBase; const i = document.getElementById("searchInput"); i.value = "Zebra pro"; onSearch(i.value); });
  await expect(panel.locator(".task-row"), "new words: 50 again").toHaveCount(50);
  await expect(panel.locator(".search-more")).toHaveCount(1);
  /* a description is searched as plain text, made once per change of the task and not again at every search */
  const plain = await page.evaluate(() => { let n = 0; const f = descPlainText; descPlainText = function () { n++; return f.apply(this, arguments); };
    try { const i = document.getElementById("searchInput"); i.value = "number 1"; onSearch(i.value); const first = n; n = 0; i.value = "number 2"; onSearch(i.value);
      return { first, again: n, rows: document.querySelectorAll("#content .task-row").length }; } finally { descPlainText = f; } });
  expect(plain.rows, "found by the words of the description").toBeGreaterThan(0);
  expect(plain.again, "nothing changed since the last search: no description read again").toBe(0);
  /* in Indonesian */
  await page.evaluate(() => setLanguage("id"));
  await page.locator("#searchInput").fill("Zebra");
  await expect(page.locator("#content .search-more").first()).toHaveText("Tampilkan semua (" + N + ")");
  await page.evaluate(() => { setLanguage("en"); const i = document.getElementById("searchInput"); i.value = ""; onSearch(""); go("home"); });
});

test.afterAll(async ({ browser }) => {
  if (!ids.length) return;
  const page = await (await browser.newContext()).newPage();
  await signIn(page);
  await page.evaluate(async list => { for (const id of list) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); }, ids);
  await page.close();
});
