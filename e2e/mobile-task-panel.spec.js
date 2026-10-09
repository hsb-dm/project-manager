/* The task panel on a phone is one scroll: the details scroll away and the tabs stay at the top (the details had a
   scroll of their own, cut off mid-row, above a short one). A tab chosen down there starts under the tabs. One row
   of actions; one "All details" toggle; a final file's name is not squeezed out by its buttons. The chat has no
   page title over it. A wide screen keeps its layout. */
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
const makeTask = page => page.evaluate(async () => {
  const d = await apiFetch("POST", "/api/tasks", { title: "Phone panel " + Date.now(), description: Array.from({ length: 14 }, (_, i) => "Line " + (i + 1) + " of the brief").join("\n\n"), status: WS.workflow[1].id, prio: "high", assignee: ME, assignees: [ME], reviewers: [ME], reviewer: ME });
  const tk = hTask(d); TASKS.push(tk); const url = "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOp/edit";
  await editTaskWith(tk, t => { t.versions.push(V(1, ME, 0, "pending", "#0F766E", "First cut")); t.files.push(F("Insurance Campaign deck", "document", "gdrive", "—", 0, url, { driveId: "1AbCdEfGhIjKlMnOp" })); });
  return d.id;
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("the task panel is one scroll with the tabs on top; one row of actions; the chat has the room", async ({ page }) => {
    await signIn(page);
    const id = await makeTask(page);
    try {
      await page.evaluate(i => { openTask(i); S.drawerTab = "brief"; renderDrawer(); }, id);
      const m = () => page.evaluate(() => { const d = document.getElementById("drawer"), tabs = d.querySelector(".dr-head>.tabs"), body = document.getElementById("drBody"), foot = document.getElementById("drFoot"), dt = d.getBoundingClientRect().top;
        return { scrolls: d.scrollHeight > d.clientHeight + 50, bodyScrolls: body.scrollHeight > body.clientHeight + 2, head: getComputedStyle(document.getElementById("drHead")).display, tabsTop: Math.round(tabs.getBoundingClientRect().top - dt), tabsBottom: Math.round(tabs.getBoundingClientRect().bottom), bodyTop: Math.round(body.getBoundingClientRect().top), scrollTop: d.scrollTop, expand: !!(d.querySelector(".tab-expand") && d.querySelector(".tab-expand").offsetParent), footH: Math.round(foot.getBoundingClientRect().height) }; });
      let x = await m();
      expect(x.scrolls, "the whole panel scrolls").toBe(true);
      expect(x.bodyScrolls, "the tab has no scroll of its own").toBe(false);
      expect(x.head).toBe("contents");
      expect(x.expand, "no Expand button over the tabs").toBe(false);
      expect(x.footH, "the actions take one row").toBeLessThan(72);
      /* scrolled: the details are gone, the tabs stay on top */
      await page.evaluate(() => { document.getElementById("drawer").scrollTop = 900; });
      x = await m();
      expect(x.tabsTop, "the tabs stay at the top").toBeLessThanOrEqual(1);
      /* another tab, chosen down there, starts just under the tabs */
      await page.evaluate(() => setTab("files"));
      x = await m();
      expect(Math.abs(x.bodyTop - x.tabsBottom), "its content starts under the tabs").toBeLessThanOrEqual(2);
      /* a final file: its name keeps the room, its buttons go under it */
      const row = await page.evaluate(() => { const r = document.querySelector("#drBody .file[data-fid]"); return [...r.children].map(c => Math.round(c.getBoundingClientRect().width)); });
      expect(row[1], "the file's name and details have room").toBeGreaterThan(200);
      /* one toggle opens every detail */
      await page.evaluate(() => { S.mDetails = true; setTab("brief"); document.getElementById("drawer").scrollTop = 0; });
      await expect(page.locator("#drHead .m-details-toggle")).toBeVisible();
      await expect(page.locator("#drHead .task-more-toggle")).toBeHidden();
      await expect(page.locator("#drHead .task-meta-secondary")).toBeVisible();
      await expect(page.locator('#drHead [data-meta="prio"]')).toBeVisible();
      /* folded: priority and team (already in the badges) wait under All details, which sits beside the due date */
      await page.evaluate(() => { S.mDetails = false; renderDrawer(); });
      await expect(page.locator('#drHead [data-meta="prio"]')).toBeHidden();
      await expect(page.locator('#drHead [data-meta="team"]')).toBeHidden();
      const beside = await page.evaluate(() => { const t = document.querySelector("#drHead .m-details-toggle").getBoundingClientRect(), d = document.querySelector('#drHead [data-meta="due"]').getBoundingClientRect(); return t.top < d.bottom && t.left > d.left + 100; });
      expect(beside, "All details sits beside the due date").toBe(true);
      /* opened, the toggle stays where it was; what it opens comes under it, shaded, past a line */
      const at = () => page.evaluate(() => { const r = document.querySelector("#drHead .m-details-toggle").getBoundingClientRect(); return [Math.round(r.top), Math.round(r.right)]; });
      const folded = await at();
      await page.evaluate(() => { S.mDetails = true; renderDrawer(); });
      const now = await at();
      expect(Math.abs(now[0] - folded[0]) <= 3 && Math.abs(now[1] - folded[1]) <= 3, "Fewer details is where All details was: " + now + " vs " + folded).toBe(true);
      const opened = await page.evaluate(() => { const due = document.querySelector('#drHead [data-meta="due"]').getBoundingClientRect(), prio = document.querySelector('#drHead [data-meta="prio"]'); return { under: prio.getBoundingClientRect().top > due.bottom, shade: getComputedStyle(prio).backgroundColor, line: getComputedStyle(document.querySelector("#drHead .task-meta-primary"), "::before").borderTopStyle }; });
      expect(opened.under, "the opened details come under the toggle").toBe(true);
      expect(opened.shade).not.toBe("rgba(0, 0, 0, 0)"); expect(opened.line).toBe("solid");
      await page.evaluate(() => { S.mDetails = false; renderDrawer(); });
      /* the tabs fit, short names, no sideways scroll */
      const tabs = await page.evaluate(() => { const t = document.querySelector("#drawer .dr-head>.tabs"); return { fits: t.scrollWidth <= t.clientWidth + 1, text: t.innerText.replace(/\s+/g, " ") }; });
      expect(tabs.fits, "no sideways scroll in the tabs").toBe(true);
      expect(tabs.text).toContain("Assets"); expect(tabs.text).not.toContain("Assets & versions"); expect(tabs.text).toContain("Progress"); expect(tabs.text).not.toContain("Progress note");
      /* smaller buttons; icons where the icon says it; a shorter name where the words are needed */
      await page.evaluate(() => setTab("files"));
      const sz = await page.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); const ver = document.querySelector("#drBody .av-version .av-head .btn:not(.primary)"), up = document.querySelector("#drBody .av-version .av-head .btn.primary"), prev = [...document.querySelectorAll("#drBody .file-acts .btn")].find(b => /Preview/.test(b.textContent));
        return { verW: Math.round(ver.getBoundingClientRect().width), prevW: Math.round(prev.getBoundingClientRect().width), prevName: prev.textContent.trim(), upShort: getComputedStyle(up, "::after").content, tallest: Math.max(...[...document.querySelectorAll("#drawer .btn")].filter(b => b.offsetParent).map(b => b.getBoundingClientRect().height)) }; });
      expect(sz.verW, "Link from Google Drive is its icon").toBeLessThanOrEqual(32);
      expect(sz.prevW, "Preview is its icon").toBeLessThanOrEqual(30);
      expect(sz.prevName, "its name is kept for screen readers").toContain("Preview");
      expect(sz.upShort).toBe('"Upload"');
      expect(sz.tallest, "no button taller than 32px").toBeLessThanOrEqual(33);
      /* actions that need their words keep them: a file from a comment */
      const words = await page.evaluate(() => { const tk = task(S.drawerTask), f = F("ref.png", "image", "upload", "1 KB", 0, "https://example.com/ref.png", {}); document.getElementById("drBody").insertAdjacentHTML("afterbegin", '<section class="av-sec" id="wordsProbe">' + fileRowHtml(tk, f, 0, true, { btns: '<button class="btn xs av-use-ver" onclick="void 0">' + I.up + "Use as new version</button>" + '<button class="btn xs ghost" onclick="void 0">View comment</button>' + '<button class="btn xs av-make-final" onclick="void 0">' + I.check + "Make final version</button>" }) + "</section>");
        const out = [...document.querySelectorAll("#wordsProbe .file-acts .btn")].map(b => [b.textContent.trim(), Math.round(b.getBoundingClientRect().width)]); document.getElementById("wordsProbe").remove(); return out; });
      for (const name of ["Use as new version", "View comment", "Make final version"]) expect(words.find(w => w[0] === name)[1], name + " keeps its words").toBeGreaterThan(60);
      for (const name of ["Preview", "Save"]) expect(words.find(w => w[0] === name)[1], name + " is its icon").toBeLessThanOrEqual(30);
      /* the five ways to add a final file are one button; its menu presses the real one */
      await expect(page.locator("#drBody .av-tools")).toBeHidden();
      await page.locator("#drBody .av-sec .m-attach").click();
      await expect(page.locator("#ctxMenu.open button")).toHaveCount(5);
      await page.locator("#ctxMenu.open button", { hasText: "Attach link" }).click();
      await expect(page.locator("#modalWrap.open")).toBeVisible();
      await page.evaluate(() => closeModal());
      /* the comment box: one attach button beside @ and Post */
      await page.evaluate(() => setTab("comments"));
      await expect(page.locator("#drBody .composer .cmt-tools")).toBeHidden();
      /* in Indonesian the visibility switch is short: one line, not "Terlihat oleh pemangku kepentingan" over two */
      const vis = await page.evaluate(() => { const was = UI_LANG; UI_LANG = "id"; renderDrawer(); const b = [...document.querySelectorAll("#drBody .cvis button")].map(x => ({ t: x.textContent.trim(), h: Math.round(x.getBoundingClientRect().height) })); UI_LANG = was; renderDrawer(); return b; });
      expect(vis.map(b => b.t)).toEqual(["Internal", "Stakeholder"]);
      expect(Math.max(...vis.map(b => b.h)), "one line").toBeLessThan(40);
      await page.locator("#drBody .composer .m-attach").click();
      await expect(page.locator("#ctxMenu.open button")).toHaveCount(5);
      await page.evaluate(() => closePops());
      /* another task starts at the top */
      await page.evaluate(() => { document.getElementById("drawer").scrollTop = 600; S.mDetails = false; });
      const id2 = await makeTask(page);
      try {
        await page.evaluate(i => openTask(i), id2);
        expect(await page.evaluate(() => document.getElementById("drawer").scrollTop)).toBe(0);
      } finally { await page.evaluate(i => apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}), id2); }
      await page.evaluate(() => closeDrawer());
      /* the chat: no "Messages" title over it */
      await page.evaluate(() => { const c = CONVERSATIONS.find(x => x.type === "WORKSPACE"); go("messages"); openConversation(c.id); });
      await expect(page.locator("#msgInput")).toBeVisible();
      await expect(page.locator(".msg-head")).toBeHidden();
    } finally {
      await page.evaluate(i => { if (S.drawerTask) closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id);
    }
  });

  test("in review, stage, Request revision and Approve fit one row without running into each other", async ({ page }) => {
    await signIn(page);
    const id = await page.evaluate(async () => { const rev = WS.workflow.find(s => /review/.test(s.kind || "")); const d = await apiFetch("POST", "/api/tasks", { title: "Footer in review " + Date.now(), status: rev.id, prio: "medium", assignee: ME, assignees: [ME], reviewers: [ME], reviewer: ME }); const tk = hTask(d); TASKS.push(tk); await editTaskWith(tk, t => { t.versions.push(V(1, ME, 0, "pending", "#0F766E", "v1")); }); openTask(d.id); return d.id; });
    try {
      await page.waitForFunction(() => Math.abs(document.getElementById("drawer").getBoundingClientRect().left) < 1); /* the panel has finished sliding in */
      for (const lang of ["en", "id"]) {
        const f = await page.evaluate(l => { UI_LANG = l; renderDrawer(); const kids = [...document.querySelectorAll("#drFoot > *")].filter(e => e.offsetParent && !e.classList.contains("spacer")).map(e => e.getBoundingClientRect()), pill = document.querySelector("#drFoot .task-stage-select"); return { n: kids.length, overlap: kids.some((r, i) => i && r.left < kids[i - 1].right - 0.5), rows: Math.max(...kids.map(r => r.top + r.height / 2)) - Math.min(...kids.map(r => r.top + r.height / 2)) < 6 ? 1 : 2, clips: getComputedStyle(pill).overflow, within: kids[kids.length - 1].right <= innerWidth, last: Math.round(kids[kids.length - 1].right), iw: innerWidth, dw: document.documentElement.clientWidth, foot: Math.round(document.getElementById("drFoot").getBoundingClientRect().right) }; }, lang);
        expect(f.n, lang + ": stage and two actions").toBe(3);
        expect(f.overlap, lang + ": nothing runs into the next").toBe(false);
        expect(f.rows, lang + ": one row").toBe(1);
        expect(f.clips, lang + ": the stage keeps its arrow inside").toBe("hidden");
        expect(f.within, JSON.stringify(f)).toBe(true);
      }
      /* activity: when it happened is under what happened, so the line reads across */
      await page.evaluate(() => { UI_LANG = "en"; setTab("activity"); });
      const a = await page.evaluate(() => { const it = document.querySelector("#drBody .tl .it"), text = it.children[1].getBoundingClientRect(), when = it.querySelector(".when").getBoundingClientRect(); return { under: when.top >= text.bottom - 1, wide: text.width > 220 }; });
      expect(a.under, "the time is under the line").toBe(true);
      expect(a.wide, "the line keeps the width").toBe(true);
    } finally {
      await page.evaluate(i => { UI_LANG = "en"; closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id);
    }
  });
});

test("a wide screen keeps the panel as it was", async ({ page }) => {
  await signIn(page);
  const id = await makeTask(page);
  try {
    await page.evaluate(i => { openTask(i); S.drawerTab = "brief"; renderDrawer(); }, id);
    const x = await page.evaluate(() => ({ head: getComputedStyle(document.getElementById("drHead")).display, body: getComputedStyle(document.getElementById("drBody")).overflowY }));
    expect(x.head).not.toBe("contents"); expect(x.body).toBe("auto");
    await expect(page.locator("#drFoot .foot-up .foot-lbl")).toBeVisible();
    await expect(page.locator("#drawer .tab .tab-l", { hasText: "Assets & versions" })).toBeVisible();
    await page.evaluate(() => setTab("files"));
    await expect(page.locator("#drBody .av-tools")).toBeVisible();
    await expect(page.locator("#drBody .m-attach")).toBeHidden();
    await page.evaluate(() => { closeDrawer(); go("messages"); });
    await expect(page.locator(".msg-head")).toBeVisible();
  } finally {
    await page.evaluate(i => apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}), id);
  }
});
