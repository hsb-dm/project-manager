/* A Figma link reads as its file's name, as a Drive link does (Oct 2026) — and so do YouTube and Vimeo videos, Loom
   recordings and Miro boards. The server reads the name from the service's own oEmbed (stubbed here); a private file
   has none, and keeps the words in its address. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const FIGMA = "https://www.figma.com/design/AbC123xyz/KV-Insurance-v2";
const PRIVATE = "https://www.figma.com/design/Priv4te99/Moodboard-Draft";
const NAME = "Key Visual — Insurance Q4";

test("a Figma link reads as its file's name: in a comment, in Attach link, pasted, and in Assets", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  const asked = [];
  await page.route("**/api/links/title?*", route => { const u = new URL(route.request().url()).searchParams.get("url"); asked.push(u); route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ title: /AbC123xyz/.test(u) ? NAME : "" }) }); });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const id = await page.evaluate(async o => {
    const d = await apiFetch("POST", "/api/tasks", { title: "Figma names", status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME] });
    const w = await apiFetch("POST", "/api/tasks/" + d.id + "/comments", { id: "cm_fig", text: "Lihat " + o.FIGMA + " dan " + o.PRIVATE });
    TASKS.push(hTask(w)); openTask(d.id); S.drawerTab = "comments"; window._cmtDraft = ""; window._cmtAtt = []; renderDrawer(); return d.id;
  }, { FIGMA, PRIVATE });
  try {
    /* in a comment: the file's name; a private one, the words of its address */
    const chips = page.locator('#drawer .cmt[data-cid="cm_fig"] .body a.drive-chip');
    await expect(chips.nth(0).locator(".lc-name")).toHaveText(NAME);
    await expect(chips.nth(1).locator(".lc-name")).toHaveText(/Moodboard Draft/);
    await expect(chips.nth(0).locator("svg.brand-ico"), "still the Figma mark").toBeVisible();
    /* Attach link fills the name in */
    await page.evaluate(() => cmtLinkModal("web"));
    await page.locator("#cmt_url").fill(FIGMA);
    await expect(page.locator("#cmt_name")).toHaveValue(NAME);
    await page.locator("#cmt_url").fill(PRIVATE);
    await expect(page.locator("#cmt_name_hint")).toContainText("The name could not be read — the link is probably private");
    await page.evaluate(() => closeModal());
    /* pasted in the comment box: it turns into its name; a private one stays a link */
    const box = page.locator("#cmtText");
    await box.click();
    await page.evaluate(t => { const dt = new DataTransfer(); dt.setData("text/plain", t); const ta = document.getElementById("cmtText"); ta.focus(); ta.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); ta.value = "Cek " + t; ta.dispatchEvent(new Event("input", { bubbles: true })); }, FIGMA);
    await expect(box).toHaveValue("Cek \u2001" + NAME);   /* the spare letter on which its capsule's mark is drawn */
    await page.keyboard.press("End"); await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(async id => (await apiFetch("GET", "/api/tasks/" + id)).comments.map(c => c.text), id), { timeout: 10000 }).toContain("Cek [" + NAME + "](" + FIGMA + ")");
    /* Assets: a Figma file filed under the words of its address is renamed once its name is read */
    await page.evaluate(async o => { const t = task(o.id); /* only the stand-in: the comment above filed the link already, under its name */ await editTaskWith(t, x => { x.files = [F(cmtLinkLabel(o.FIGMA), "document", "link", "Link", 0, o.FIGMA)]; }); AV_HEALED = {}; S.drawerTab = "files"; renderDrawer(); }, { id, FIGMA });
    await expect.poll(() => page.evaluate(async id => (await apiFetch("GET", "/api/tasks/" + id)).files.map(f => f.name), id), { timeout: 10000 }).toEqual([NAME]);
    /* the server is asked only about links it can name */
    expect(asked.every(u => /figma\.com\/design\//.test(u)), asked.join(", ")).toBe(true);
    /* Indonesian */
    await page.evaluate(() => { UI_LANG = "id"; });
    expect(await page.evaluate(() => tr("Reading the name…"))).toBe("Membaca nama…");
    await page.evaluate(() => { UI_LANG = "en"; });
  } finally {
    await page.evaluate(async id => { closeModal(); closeDrawer(); await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); }, id);
  }
});

/* A Figma link pasted without www: Figma's oEmbed refuses figma.com ("expected the url host to be a figma host"), so
   the server asks it at www.figma.com (server/oembed-links.js). Here the server itself answers /api/links/title, and
   Figma is the stand-in e2e/fixtures/figma-stub.js (COS_LINK_FETCH_STUB), which refuses figma.com as Figma does. */
test("a Figma link without www reads as its file's name, from the server", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  const NOWWW = "https://figma.com/design/FgPubHeroNoWww1023/KV-draft-3?node-id=12-345&t=AbC123-0";
  const PRIV = "https://figma.com/design/PrivNoWww1023/Moodboard-Draft";
  const asked = [];
  page.on("request", r => { if (/\/api\/links\/title\?/.test(r.url())) asked.push(new URL(r.url()).searchParams.get("url")); });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const id = await page.evaluate(async o => {
    const d = await apiFetch("POST", "/api/tasks", { title: "Figma without www", status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME] });
    const w = await apiFetch("POST", "/api/tasks/" + d.id + "/comments", { id: "cm_nowww", text: "Cek " + o.NOWWW + " dan " + o.PRIV });
    TASKS.push(hTask(w)); openTask(d.id); S.drawerTab = "comments"; window._cmtDraft = ""; window._cmtAtt = []; renderDrawer(); return d.id;
  }, { NOWWW, PRIV });
  try {
    const chips = page.locator('#drawer .cmt[data-cid="cm_nowww"] .body a.drive-chip');
    /* the stand-in's name for the file, not the words in its link ("KV draft 3") */
    await expect(chips.nth(0).locator(".lc-name")).toHaveText("Hero Banner Q4");
    await expect(chips.nth(0)).toHaveAttribute("href", NOWWW);
    /* a private file has no name there, and keeps the words in its link */
    await expect(chips.nth(1).locator(".lc-name")).toHaveText(/Moodboard Draft/);
    expect(asked, "the page asks the server about the link as written").toContain(NOWWW);
    /* the server answers with the name (the browser did not stand in for it) */
    expect(await page.evaluate(u => apiFetch("GET", "/api/links/title?url=" + encodeURIComponent(u)), NOWWW)).toEqual({ title: "Hero Banner Q4" });
  } finally {
    await page.evaluate(async id => { closeModal(); closeDrawer(); await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); }, id);
  }
});
