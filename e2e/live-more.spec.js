/* What had no live update at all now has one (Oct 2026, src/live-more.js, server/live-more.js): a change shows in a
   colleague's open screen and in the same person's other tab and device without a reload, patched in place, and
   never reaches someone who may not see it.
   - Saved views: the owner's other tab (an open Views menu is written again where it is; a rename or a delete of the
     view applied follows in the header) and their other device; a colleague hears nothing of them.
   - AI Gallery: a colleague's open gallery and the owner's other tab show a new design, a rename, a trip to the
     archive and back; a card that did not change is not drawn again; a favourite stays the person's own (it follows
     in their other tab); a design renamed in the archive is not heard of by a colleague; a tab out of sight catches
     up when it is shown.
   - Requests: a requester's new request (a task in the first stage) shows on a lead's Home and in the requester's
     other tab.
   - Announcements: a colleague who may send them sees one sent appear in "Sent before" and follow to "Sent to N",
     while what they are typing stays; a member hears nothing.
   The server side: tests/live-more.test.js. LIVE_MORE_SHOTS=<folder> writes screenshots (light, dark, 390 px). */
const { test, expect } = require("@playwright/test");
const path = require("path");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page, who) {
  await page.goto("/");
  await page.locator("#au_email").fill(who.email);
  await page.locator("#au_pw").fill(who.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  /* someone new here is first shown around; not today */
  if (who !== ADMIN) await page.evaluate(() => { if (typeof WorkspaceQuest !== "undefined" && WorkspaceQuest.skipAll) WorkspaceQuest.skipAll(); myPrefs().onboardingDone = true; closeModal(); return saveMyPrefs(); });
}
/* the live stream is open, and every live_changed it brings is written down (window.__live) */
async function listen(page) {
  await page.waitForFunction(() => CHAT_RUNTIME.connection && CHAT_RUNTIME.connection.readyState === 1, null, { timeout: 15000 });
  await page.evaluate(() => { if (window.__liveTap) return; window.__liveTap = true; window.__live = []; const base = msgOnEvent; msgOnEvent = function (ev) { if (ev && ev.type === "live_changed") window.__live.push(ev); return base.apply(this, arguments); }; });
}
const heard = (page, kind) => page.evaluate(k => window.__live.filter(e => !k || e.kind === k).length, kind);
const SHOTS = process.env.LIVE_MORE_SHOTS || "";
async function shots(page, name) {
  if (!SHOTS) return;
  await page.screenshot({ path: path.join(SHOTS, name + "-light.png") });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark")); await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, name + "-dark.png") });
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
}
const tag = Date.now().toString(36);
const PIA = { name: "Pia Live " + tag, email: "pia-live-" + tag + "@e2e.test", pw: "Pia!LiveMore-2026x" };
const QUILL = { name: "Quill Announce " + tag, email: "quill-live-" + tag + "@e2e.test", pw: "Quill!LiveMore-2026x" };
const ROLE = "role_e2e_ann_" + tag;
let ids = {};

test("setup: a colleague, and one who may send announcements", async ({ page }) => {
  await signIn(page, ADMIN);
  ids = await page.evaluate(async o => {
    await apiFetch("POST", "/api/roles", { id: o.role, name: "Announcer " + o.tag, permissions: ["view_all", "view_messages", "send_announcements"] });
    const made = {};
    for (const [k, p, perm] of [["pia", o.pia, "member"], ["quill", o.quill, o.role]]) {
      await apiFetch("POST", "/api/members", { name: p.name, email: p.email, perm, cap: 40 });
      const people = (await apiFetch("GET", "/api/bootstrap")).people; made[k] = Object.keys(people).find(id => people[id].email === p.email);
      await apiFetch("POST", "/api/members/" + made[k] + "/password", { password: p.pw });
    }
    return made;
  }, { pia: PIA, quill: QUILL, role: ROLE, tag });
  expect(ids.pia && ids.quill).toBeTruthy();
});

test("saved views: the owner's other tab and device follow, in place; a colleague hears nothing", async ({ browser }) => {
  const ctx = await browser.newContext(), a1 = await ctx.newPage(), a2 = await ctx.newPage();
  await signIn(a1, ADMIN); await a2.goto("/"); await ready(a2);
  const dev = await (await browser.newContext()).newPage(); await signIn(dev, ADMIN);
  const pia = await (await browser.newContext()).newPage(); await signIn(pia, PIA);
  for (const p of [a1, a2, dev, pia]) await listen(p);
  const name = "Live view " + tag, renamed = "Renamed view " + tag;
  const views = p => p.evaluate(() => VIEWS.map(v => v.name));
  const viewsBtn = p => p.locator('#content button[aria-label="Views"]').first();
  try {
    for (const p of [a1, a2]) await p.evaluate(() => { S.activeView = null; go("tasks", "list"); });
    /* the other tab: its Views menu is open, and the page is marked to see that nothing else is drawn again */
    await viewsBtn(a2).click();
    await expect(a2.locator("#ctxMenu.open")).toContainText("No saved views yet");
    await a2.evaluate(() => { document.querySelector("#content .pagehead").__kept = 1; });
    /* saved in the first tab, through its own menu */
    await viewsBtn(a1).click();
    await a1.locator("#ctxMenu.open button", { hasText: "Save current view" }).click();
    await a1.locator("#sv_name").fill(name);
    await a1.locator("#modal").getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => a1.evaluate(() => apiFetch("GET", "/api/views").then(l => l.map(v => v.name)))).toEqual([name]);
    /* the other tab's open menu is written again where it is, and stays open */
    await expect(a2.locator("#ctxMenu.open")).toContainText(name, { timeout: 8000 });
    await expect(a2.locator("#ctxMenu.open")).not.toContainText("No saved views yet");
    expect(await a2.evaluate(() => document.querySelector("#content .pagehead").__kept)).toBe(1);   /* nothing else drawn again */
    await shots(a2, "views-menu");
    /* the other device */
    await expect.poll(() => views(dev), { timeout: 8000 }).toEqual([name]);
    /* the other tab applies it; a rename in the first follows in its header */
    await a2.locator("#ctxMenu.open button", { hasText: name }).click();
    await expect(a2.locator("#content .pagehead")).toContainText("“" + name + "”");
    const vid = await a2.evaluate(() => S.activeView); expect(vid).toBeTruthy();
    await a1.evaluate(o => { const v = byId(VIEWS, o.vid); v.name = o.renamed; return persistView(v, false); }, { vid, renamed });
    await expect(a2.locator("#content .pagehead")).toContainText("“" + renamed + "”", { timeout: 8000 });
    await expect.poll(() => views(dev)).toEqual([renamed]);
    /* deleted in the first: the other tab lets go of it, the list stays as it was filtered */
    await a1.evaluate(id => deleteViewById(id), vid);
    await expect.poll(() => a2.evaluate(() => S.activeView), { timeout: 8000 }).toBe(null);
    await expect(a2.locator("#content .pagehead")).not.toContainText(renamed);
    await expect.poll(() => views(dev)).toEqual([]);
    /* a colleague heard nothing of any of it, and has none of it */
    expect(await heard(pia, "views")).toBe(0);
    expect(await views(pia)).toEqual([]);
    /* the tab that saved: its own event, once it carries its tab (src/core.js ZC_TAB), is left alone */
    const own = await a1.evaluate(async () => {
      const had = typeof liveFromThisTab === "function"; if (!had) { window.ZC_TAB = "e2etab0001"; window.liveFromThisTab = ev => !!(ev && ev.tab && window.ZC_TAB && ev.tab === window.ZC_TAB); }
      let asked = 0; const f = apiFetch; apiFetch = function (m, u) { if (m === "GET" && u === "/api/views") asked++; return f.apply(this, arguments); };
      msgOnEvent({ type: "live_changed", kind: "views", id: "x", by: ME, tab: window.ZC_TAB }); await new Promise(r => setTimeout(r, 400));
      const mine = asked; msgOnEvent({ type: "live_changed", kind: "views", id: "x", by: ME, tab: "othertab001" }); await new Promise(r => setTimeout(r, 400));
      apiFetch = f; if (!had) { delete window.liveFromThisTab; delete window.ZC_TAB; } return [mine, asked];
    });
    expect(own).toEqual([0, 1]);
  } finally {
    await a1.evaluate(() => apiFetch("GET", "/api/views").then(l => Promise.all(l.map(v => apiFetch("DELETE", "/api/views/" + v.id))))).catch(() => {});
    await ctx.close(); await dev.context().close(); await pia.context().close();
  }
});

test("AI Gallery: a colleague's and the owner's other tab follow; favourites stay personal; the archive does not leak", async ({ browser }) => {
  const ctx = await browser.newContext(), a1 = await ctx.newPage(), a2 = await ctx.newPage();
  await signIn(a1, ADMIN); await a2.goto("/"); await ready(a2);
  const pctx = await browser.newContext(), pia = await pctx.newPage(), pia2 = await pctx.newPage();
  await signIn(pia, PIA); await pia2.goto("/"); await ready(pia2);
  for (const p of [a1, a2, pia, pia2]) await listen(p);
  const thumb = await a1.evaluate(() => { const c = document.createElement("canvas"); c.width = 64; c.height = 40; const g = c.getContext("2d"); g.fillStyle = "#3355ff"; g.fillRect(0, 0, 64, 40); return c.toDataURL("image/png"); });
  const save = (name) => a1.evaluate(o => agRequest("POST", "", { name: o.name, tags: ["live"], fields: { headline: o.name }, thumb: o.thumb }), { name, thumb });
  const cardNames = p => p.evaluate(() => Array.from(document.querySelectorAll("#agItems .ag-card h2")).map(h => h.textContent));
  const made = [];
  try {
    for (const p of [a2, pia, pia2]) await p.evaluate(() => { AG.mode = "all"; AG.q = ""; AG.offset = 0; go("aigallery"); });
    const first = await save("Steady " + tag); made.push(first);
    for (const p of [a2, pia, pia2]) await expect.poll(() => cardNames(p), { timeout: 8000 }).toContain("Steady " + tag);
    /* a card that does not change is not drawn again */
    for (const p of [a2, pia]) await p.evaluate(n => { Array.from(document.querySelectorAll("#agItems .ag-card")).find(c => c.querySelector("h2").textContent === n).__kept = 1; }, "Steady " + tag);
    const d = await save("Poster " + tag); made.push(d);
    for (const p of [a2, pia, pia2]) await expect.poll(() => cardNames(p), { timeout: 8000 }).toContain("Poster " + tag);
    for (const p of [a2, pia]) expect(await p.evaluate(n => Array.from(document.querySelectorAll("#agItems .ag-card")).find(c => c.querySelector("h2").textContent === n).__kept, "Steady " + tag)).toBe(1);
    await shots(pia, "gallery-new");
    /* renamed by the owner, while the colleague has the focus on that card's star: drawn again, the focus kept */
    await pia.locator("#agItems .ag-card", { hasText: "Poster " + tag }).locator(".ag-favorite").focus();
    let x = await a1.evaluate(o => agRequest("PATCH", "/" + o.id, { name: o.name, revision: o.revision }), { id: d.id, revision: d.revision, name: "Poster v2 " + tag });
    for (const p of [a2, pia]) await expect.poll(() => cardNames(p), { timeout: 8000 }).toContain("Poster v2 " + tag);
    expect(await cardNames(pia)).not.toContain("Poster " + tag);
    await expect(pia.locator("#agItems .ag-card", { hasText: "Poster v2 " + tag }).locator(".ag-favorite")).toBeFocused();
    /* a favourite: the colleague's own other tab follows; the owner's tabs hear nothing of it */
    const ownerHeard = await heard(a2, "gallery");
    const star = p => p.locator("#agItems .ag-card", { hasText: "Poster v2 " + tag }).locator(".ag-favorite");
    await star(pia).click();
    await expect(star(pia)).toHaveAttribute("aria-pressed", "true");
    await expect(star(pia2)).toHaveAttribute("aria-pressed", "true", { timeout: 8000 });
    await a2.waitForTimeout(500);
    expect(await heard(a2, "gallery")).toBe(ownerHeard);
    await expect(star(a2)).toHaveAttribute("aria-pressed", "false");
    /* a tab out of sight does nothing until it is shown, then catches up */
    const hide = (p, h) => p.evaluate(on => { Object.defineProperty(document, "hidden", { configurable: true, get: () => on }); Object.defineProperty(document, "visibilityState", { configurable: true, get: () => on ? "hidden" : "visible" }); if (!on) document.dispatchEvent(new Event("visibilitychange")); }, h);
    await hide(pia2, true);
    const third = await save("Late " + tag); made.push(third);
    await expect.poll(() => cardNames(pia), { timeout: 8000 }).toContain("Late " + tag);
    expect(await cardNames(pia2)).not.toContain("Late " + tag);
    await hide(pia2, false);
    await expect.poll(() => cardNames(pia2), { timeout: 8000 }).toContain("Late " + tag);
    /* in Indonesian, a card that comes in reads Indonesian */
    await pia.evaluate(() => { setLanguage("id"); renderScreen(false); });
    await expect(pia.locator("#agItems .ag-card").first()).toContainText("Salin & edit");
    made.push(await save("Bahasa " + tag));
    await expect(pia.locator("#agItems .ag-card", { hasText: "Bahasa " + tag })).toContainText("Salin & edit", { timeout: 8000 });
    await pia.evaluate(() => { setLanguage("en"); renderScreen(false); });
    await expect(pia.locator("#agItems .ag-card").first()).toContainText("Duplicate & edit");
    /* to the archive: it leaves the colleague's screen */
    x = await a1.evaluate(o => agRequest("PATCH", "/" + o.id, { archived: true, revision: o.revision }), { id: x.id, revision: x.revision });
    for (const p of [a2, pia]) await expect.poll(() => cardNames(p), { timeout: 8000 }).not.toContain("Poster v2 " + tag);
    /* renamed in the archive: the owner's other tab, showing the archive, follows; the colleague hears nothing */
    await a2.evaluate(() => { AG.mode = "archived"; AG.offset = 0; renderAIGallery(); });
    await expect.poll(() => cardNames(a2)).toContain("Poster v2 " + tag);
    const piaHeard = await heard(pia, "gallery"), pia2Heard = await heard(pia2, "gallery");
    x = await a1.evaluate(o => agRequest("PATCH", "/" + o.id, { name: o.name, revision: o.revision }), { id: x.id, revision: x.revision, name: "Secret " + tag });
    await expect.poll(() => cardNames(a2), { timeout: 8000 }).toContain("Secret " + tag);
    await pia.waitForTimeout(600);
    expect(await heard(pia, "gallery")).toBe(piaHeard);
    expect(await heard(pia2, "gallery")).toBe(pia2Heard);
    expect(await pia.locator("#content").textContent()).not.toContain("Secret " + tag);
    /* back from the archive: the colleague sees it again, with its new name */
    x = await a1.evaluate(o => agRequest("PATCH", "/" + o.id, { archived: false, revision: o.revision }), { id: x.id, revision: x.revision });
    await expect.poll(() => cardNames(pia), { timeout: 8000 }).toContain("Secret " + tag);
    /* "Manage design" open in the other tab: a rename made elsewhere waits until it closes, so it is not written over */
    await a2.evaluate(() => { AG.mode = "all"; AG.offset = 0; renderAIGallery(); });
    await expect.poll(() => cardNames(a2)).toContain("Secret " + tag);
    await a2.locator("#agItems .ag-card", { hasText: "Secret " + tag }).getByRole("button", { name: "Manage" }).click();
    await expect(a2.locator("#agRename")).toHaveValue("Secret " + tag);
    x = await a1.evaluate(o => agRequest("PATCH", "/" + o.id, { name: o.name, revision: o.revision }), { id: x.id, revision: x.revision, name: "Final " + tag });
    await expect.poll(() => cardNames(pia), { timeout: 8000 }).toContain("Final " + tag);
    await a2.locator("#agRename").fill("Mine instead " + tag);
    await a2.locator("#modal").getByRole("button", { name: "Save changes" }).click();
    await expect(a2.locator(".toast.bad")).toContainText("This design changed");
    await a2.evaluate(() => closeModal());
    await expect.poll(() => cardNames(a2), { timeout: 8000 }).toContain("Final " + tag);
    await a2.setViewportSize({ width: 390, height: 844 });
    if (SHOTS) await a2.screenshot({ path: path.join(SHOTS, "gallery-390.png") });
    expect(await a2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  } finally {
    /* the gallery has no delete: what was made here goes to the archive */
    await a1.evaluate(async list => { for (const m of list) { try { const cur = await agRequest("GET", "/" + m.id); if (!cur.archived) await agRequest("PATCH", "/" + m.id, { archived: true, revision: cur.revision }); } catch (e) {} } }, made).catch(() => {});
    await ctx.close(); await pctx.close();
  }
});

test("requests: a requester's new request shows on a lead's Home and in the requester's other tab", async ({ browser }) => {
  const lead = await (await browser.newContext()).newPage(); await signIn(lead, ADMIN);
  const pctx = await browser.newContext(), pia = await pctx.newPage(), pia2 = await pctx.newPage();
  await signIn(pia, PIA); await pia2.goto("/"); await ready(pia2);
  for (const p of [lead, pia, pia2]) await listen(p);
  const title = "Need a banner " + tag; let tid = null;
  const was = await lead.evaluate(() => ((myPrefs().dashScope || {}).requests) || "mine");
  try {
    await lead.evaluate(() => { go("home"); setDashScope("requests", "all"); });
    const inbox = lead.locator("#content section.panel", { hasText: "Inbox — new requests" });
    await expect(inbox).toBeVisible();
    await expect(inbox).not.toContainText(title);
    await pia2.evaluate(() => { S.taskScope = "all"; go("tasks", "list"); });
    /* submitted the way a requester does: Request work */
    await pia.evaluate(() => newRequestModal());
    await pia.locator(".dr-title").click(); await pia.keyboard.type(title);
    await pia.locator("#drFoot").getByRole("button", { name: "Submit request" }).click();
    await expect(pia.locator(".toast", { hasText: "submitted" })).toBeVisible();
    tid = await pia.evaluate(t => (TASKS.find(x => x.title === t) || {}).id, title);
    await expect(inbox).toContainText(title, { timeout: 8000 });
    await expect(pia2.locator("#content")).toContainText(title, { timeout: 8000 });
    await shots(lead, "request-inbox");
  } finally {
    if (!tid) tid = await lead.evaluate(t => apiFetch("GET", "/api/bootstrap").then(b => (b.tasks.find(x => x.title === t) || {}).id), title).catch(() => null);
    await lead.evaluate(o => { setDashScope("requests", o.was); return Promise.all([o.tid ? apiFetch("DELETE", "/api/tasks/" + o.tid).catch(() => {}) : null, o.tid ? apiFetch("POST", "/api/notifications/read", { entityId: o.tid }).catch(() => {}) : null]); }, { was, tid });
    await lead.context().close(); await pctx.close();
  }
});

test("announcements: a colleague's open list and the sender's other tab follow; a member hears nothing", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } }), a1 = await ctx.newPage(), a2 = await ctx.newPage();
  await signIn(a1, ADMIN); await a2.goto("/"); await ready(a2);
  const quill = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); await signIn(quill, QUILL);
  const pia = await (await browser.newContext()).newPage(); await signIn(pia, PIA);
  for (const p of [a1, a2, quill, pia]) await listen(p);
  const subject = "Live news " + tag;
  try {
    for (const p of [a2, quill]) await p.evaluate(() => go("settings", "notifications"));
    for (const p of [a2, quill]) await expect(p.locator("#annPanel .ann-who")).toContainText("It goes to");
    /* the colleague is writing one of their own, the caret in the middle of it */
    await quill.locator("#ann_subject").click(); await quill.keyboard.type("Half written");
    await quill.evaluate(() => { const el = document.getElementById("ann_subject"); el.setSelectionRange(4, 4); });
    await quill.evaluate(() => { document.getElementById("annPanel").__kept = 1; });
    /* sent from the first tab */
    const r = await a1.evaluate(s => apiFetch("POST", "/api/announcements", { subject: s, message: "Hello, live." }), subject);
    expect(r.announcement.subject).toBe(subject);
    for (const p of [a2, quill]) {
      await expect(p.locator("#annHistory .ann-row").first()).toContainText(subject, { timeout: 8000 });
      await expect(p.locator("#annHistory .ann-row").first().locator(".badge")).toHaveText(/^Sent to \d+$/, { timeout: 10000 });
    }
    /* only the list was written again: what is typed, the caret and the panel itself stay */
    await expect(quill.locator("#ann_subject")).toHaveValue("Half written");
    await expect(quill.locator("#ann_subject")).toBeFocused();
    expect(await quill.evaluate(() => [document.getElementById("ann_subject").selectionStart, document.getElementById("annPanel").__kept])).toEqual([4, 1]);
    await quill.locator("#annHistory").scrollIntoViewIfNeeded();
    await shots(quill, "announcements");
    await quill.setViewportSize({ width: 390, height: 844 });
    await quill.locator("#annHistory").scrollIntoViewIfNeeded();
    if (SHOTS) await quill.screenshot({ path: path.join(SHOTS, "announcements-390.png") });
    /* a member does not see the list and hears nothing */
    expect(await heard(pia, "announcements")).toBe(0);
    /* Indonesian: the list as the colleague reads it */
    await quill.evaluate(() => { setLanguage("id"); renderScreen(false); });
    await expect(quill.locator("#annHistory")).toContainText("Terkirim sebelumnya");
    await quill.evaluate(() => setLanguage("en"));
  } finally {
    await ctx.close(); await quill.context().close(); await pia.context().close();
  }
});

/* the people and the role made here go, whatever happened above (flows.spec expects the admin alone) */
test.afterAll(async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, ADMIN);
  await page.evaluate(async o => { for (const id of [o.ids.pia, o.ids.quill]) if (id) await apiFetch("DELETE", "/api/members/" + id).catch(() => {}); await apiFetch("DELETE", "/api/roles/" + o.role).catch(() => {}); }, { ids, role: ROLE });
  await page.context().close();
});
