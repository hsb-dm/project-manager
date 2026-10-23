/* Editing a comment happens where the comment is: Edit opens the comment box in its place — the same box it was
   written in — with the comment's words (a link written with a name shows as that name), its attachments as chips
   that can be taken off, and the @ picker. It has Cancel and Save; Ctrl+Enter saves, Esc lets it go. The box at the
   bottom steps aside meanwhile, and what was being written in it comes back. Saved, the comment says "edited" and
   whoever the new words name is told. And a link written in a comment is a chip — its service's mark and a name —
   with the card on hover. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("edit a comment where it is, in the same box it was written in; links in comments are chips", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const sent = []; page.on("request", r => { if (r.method() === "POST" && /\/api\/notifications$/.test(r.url())) { try { const b = JSON.parse(r.postData() || "{}"); if (b.k === "mention") sent.push(b); } catch (e) {} } });
  const ids = await page.evaluate(async () => {
    if (!Object.keys(PEOPLE).some(k => PEOPLE[k].email === "rina.edit@e2e.test")) await apiFetch("POST", "/api/members", { id: "editrina", name: "Rina Editor", email: "rina.edit@e2e.test", perm: "member", ini: "RE", teams: [] });
    await reloadAll();
    const d = await apiFetch("POST", "/api/tasks", { title: "Comment edit", status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME] });
    TASKS.push(hTask(d));
    const withMine = await apiFetch("POST", "/api/tasks/" + d.id + "/comments", { id: "cm_mine", text: "Ukuran logo 2x, lihat [Brief deck](https://example.org/brief-deck) dan https://www.behance.net/gallery/123/Brand-Refresh", attachments: [{ name: "Moodboard", url: "https://example.org/moodboard", type: "link", kind: "link", source: "link", size: "Link", named: true }] });
    replaceInto(task(d.id), hTask(withMine));
    task(d.id).comments.push({ id: "cm_theirs", by: Object.keys(PEOPLE).find(k => PEOPLE[k].email === "rina.edit@e2e.test"), text: "Siap", vis: "internal", createdAt: new Date().toISOString(), ago: 0, attachments: [] });
    openTask(d.id); S.drawerTab = "comments"; window._cmtDraft = ""; window._cmtAtt = []; renderDrawer();
    return { task: d.id, rina: Object.keys(PEOPLE).find(k => PEOPLE[k].email === "rina.edit@e2e.test") };
  });
  try {
    const mine = page.locator('#drawer .cmt[data-cid="cm_mine"]'), theirs = page.locator('#drawer .cmt[data-cid="cm_theirs"]'), box = page.locator("#cmtText"), post = page.locator("#drawer .composer .bar .btn.primary");
    const composers = page.locator("#drawer .composer");
    /* links in a comment's words are chips: the named one by its name, a Behance one by its mark and its page */
    await expect(mine.locator(".body a.drive-chip")).toHaveCount(2);
    await expect(mine.locator(".body a.drive-chip").nth(0)).toContainText("Brief deck");
    const be = mine.locator(".body a.drive-chip").nth(1);
    await expect(be).toContainText("Brand Refresh");
    await expect(be.locator("svg.brand-ico")).toBeVisible();
    await be.hover();
    await expect(page.locator(".link-card.open .lc-kind")).toHaveText("Behance");
    await page.mouse.move(5, 5);
    await expect(theirs.locator(".cmt-edit-btn")).toHaveCount(0);
    const avX = async loc => (await loc.locator(".av").first().boundingBox()).x;
    const lineX = await avX(mine);
    /* something being written is put aside while editing */
    await box.fill("draft yang sedang ditulis");
    await mine.locator(".cmt-edit-btn").click();
    /* the box opens in the comment's place: one box, inside the comment; its words and buttons give way */
    await expect(composers).toHaveCount(1);
    await expect(mine.locator(".composer #cmtText")).toBeVisible();
    await expect(mine.locator(".body")).toHaveCount(0);
    await expect(mine.locator(".acts")).toHaveCount(0);
    await expect(mine).toHaveClass(/cmt-editing/);
    await expect(mine.locator(".composer")).toHaveAttribute("aria-label", "Editing your comment");
    await expect(post).toHaveText("Save");
    await expect(mine.locator(".composer .cmt-edit-cancel")).toHaveText("Cancel");
    await expect(box).toBeFocused();
    await expect(box, "a named link reads as its name, as when it was written").toHaveValue("Ukuran logo 2x, lihat \u2001Brief deck dan https://www.behance.net/gallery/123/Brand-Refresh");
    await expect(mine.locator(".composer .att.att-chip")).toHaveCount(1);
    /* the card has room around it, and the avatar stays in line with the others */
    const pad = await mine.evaluate(e => parseFloat(getComputedStyle(e).paddingLeft));
    expect(pad, "padding inside the highlight").toBeGreaterThanOrEqual(10);
    expect(Math.abs((await avX(mine)) - lineX), "the avatar does not move").toBeLessThan(1.5);
    /* Esc lets it go: the comment as it was, the box back at the bottom with the draft */
    await page.keyboard.press("Escape");
    await expect(mine.locator(".composer")).toHaveCount(0);
    await expect(mine.locator(".body")).toHaveCount(1);
    await expect(composers).toHaveCount(1);
    await expect(box).toHaveValue("draft yang sedang ditulis");
    await expect(post).toHaveText("Post");
    await expect(page.locator("#drawer")).toBeVisible();
    /* Cancel does the same */
    await mine.locator(".cmt-edit-btn").click();
    await mine.locator(".composer .cmt-edit-cancel").click();
    await expect(mine.locator(".composer")).toHaveCount(0);
    await expect(box).toHaveValue("draft yang sedang ditulis");
    /* edit: change the words, name someone with the @ picker, take the attachment off; Ctrl+Enter saves */
    await mine.locator(".cmt-edit-btn").click();
    await box.press("End");
    await box.evaluate(t => { t.value = t.value.replace("2x", "3x"); t.dispatchEvent(new Event("input", { bubbles: true })); const n = t.value.length; t.setSelectionRange(n, n); });
    await page.keyboard.type(" cek @Rina");
    await expect(page.locator("#entityPicker")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(mine.locator(".composer .cmt-ta-mirror .msg-mention"), "the name coloured, as when writing").toHaveText("@Rina Editor");
    await mine.locator(".composer .att.att-chip .att-x").click();
    await expect(mine.locator(".composer .att.att-chip")).toHaveCount(0);
    /* Enter saves, as Enter sends a new comment; Shift+Enter would be a new line */
    await expect(mine.locator(".composer .bar .hint")).toContainText("Enter saves · Shift + Enter new line · Esc cancels");
    await box.focus(); await page.keyboard.press("Enter");
    await expect(mine.locator(".composer")).toHaveCount(0);
    const saved = await page.evaluate(async id => { const d = await apiFetch("GET", "/api/tasks/" + id); const c = d.comments.find(x => x.id === "cm_mine"); return { text: c.text, att: c.attachments.length, edited: !!c.editedAt }; }, ids.task);
    expect(saved.text).toBe("Ukuran logo 3x, lihat [Brief deck](https://example.org/brief-deck) dan https://www.behance.net/gallery/123/Brand-Refresh cek @Rina Editor");
    expect(saved.att, "the attachment taken off").toBe(0);
    expect(saved.edited).toBe(true);
    await expect(mine.locator(".cmt-edited")).toHaveText("· edited");
    await expect(box, "the draft is back").toHaveValue("draft yang sedang ditulis");
    await expect(post).toHaveText("Post");
    await expect.poll(() => sent.filter(b => (b.recipients || []).includes(ids.rina)).length, "the newly named person is told").toBe(1);
    /* links an edit brings are filed under Assets & versions, as when posting: a Drive file and a Figma design are
       assets; the Behance page already there is a reference and stays on the comment */
    const DRIVE = "https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view", FIGMA = "https://www.figma.com/design/Zx9Ab/Key-Visual";
    const filedUrls = () => page.evaluate(async id => (await apiFetch("GET", "/api/tasks/" + id)).files.map(f => f.url).sort(), ids.task);
    const editTo = async fn => { await mine.locator(".cmt-edit-btn").click(); await box.evaluate(fn); await box.focus(); await page.keyboard.press("Control+Enter"); await expect(mine.locator(".composer")).toHaveCount(0); };
    await editTo(t => { t.value = t.value + " final di https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view dan https://www.figma.com/design/Zx9Ab/Key-Visual, referensi baru https://www.behance.net/gallery/999/Moodboard-Two"; t.dispatchEvent(new Event("input", { bubbles: true })); });
    await expect.poll(filedUrls, { timeout: 10000 }).toEqual([DRIVE, FIGMA].sort());
    await page.evaluate(() => { S.drawerTab = "files"; renderDrawer(); });
    await expect(page.locator("#drawer .av-from-comments .av-head .cnt"), "under From comments").toHaveText("2");
    /* one taken off Assets does not come back with the next edit */
    await page.evaluate(id => editTaskWith(task(id), t => { t.files = t.files.filter(f => f.url.indexOf("figma") < 0); }), ids.task);
    await expect.poll(filedUrls).toEqual([DRIVE]);
    await page.evaluate(() => { S.drawerTab = "comments"; renderDrawer(); });
    await editTo(t => { t.value = t.value.replace("final di", "final ada di"); t.dispatchEvent(new Event("input", { bubbles: true })); });
    await expect.poll(() => page.evaluate(async id => (await apiFetch("GET", "/api/tasks/" + id)).comments.find(c => c.id === "cm_mine").text, ids.task)).toContain("final ada di");
    await page.waitForTimeout(300);
    expect(await filedUrls()).toEqual([DRIVE]);
    /* Indonesian */
    await page.evaluate(() => { UI_LANG = "id"; renderDrawer(); });
    await mine.locator(".cmt-edit-btn").click();
    await expect(mine.locator(".composer")).toHaveAttribute("aria-label", "Mengedit komentar Anda");
    await expect(post).toHaveText("Simpan");
    await expect(mine.locator(".composer .cmt-edit-cancel")).toHaveText("Batal");
    await expect(mine.locator(".cmt-edited")).toHaveText("· diedit");
    await page.evaluate(() => { cmtEditCancel(); UI_LANG = "en"; renderDrawer(); });
  } finally {
    await page.evaluate(async ids => { S.cmtEdit = null; window._cmtDraft = ""; closeDrawer(); await apiFetch("DELETE", "/api/tasks/" + ids.task).catch(() => {}); if (ids.rina) await apiFetch("DELETE", "/api/members/" + ids.rina).catch(() => {}); }, ids);
  }
});
