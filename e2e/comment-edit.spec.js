/* Editing a comment in the task panel: Edit on your own comment opens its words in place; Save (or Ctrl+Enter)
   keeps them and the comment says "edited"; Esc or Cancel leaves it as it was; what is being written survives
   a redraw of the panel; whoever the new words name is told; someone else's comment has no Edit. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("edit your own comment in place; it says it was edited; new names are told", async ({ page }) => {
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
    const withMine = await apiFetch("POST", "/api/tasks/" + d.id + "/comments", { id: "cm_mine", text: "Ukuran logo 2x" });
    replaceInto(task(d.id), hTask(withMine));
    /* someone else's comment, as it would arrive */
    task(d.id).comments.push({ id: "cm_theirs", by: Object.keys(PEOPLE).find(k => PEOPLE[k].email === "rina.edit@e2e.test"), text: "Siap", vis: "internal", createdAt: new Date().toISOString(), ago: 0, attachments: [] });
    openTask(d.id); S.drawerTab = "comments"; renderDrawer();
    return { task: d.id, rina: Object.keys(PEOPLE).find(k => PEOPLE[k].email === "rina.edit@e2e.test") };
  });
  try {
    const mine = page.locator('#drawer .cmt[data-cid="cm_mine"]'), theirs = page.locator('#drawer .cmt[data-cid="cm_theirs"]');
    await expect(theirs.locator(".cmt-edit-btn")).toHaveCount(0);
    /* Esc leaves it as it was */
    await mine.locator(".cmt-edit-btn").click();
    await expect(page.locator("#cmtEditText")).toBeFocused();
    await expect(page.locator("#cmtEditText")).toHaveValue("Ukuran logo 2x");
    await page.keyboard.type(" salah");
    await page.keyboard.press("Escape");
    await expect(page.locator("#cmtEditText")).toHaveCount(0);
    await expect(page.locator("#drawer")).toBeVisible();
    await expect(mine.locator(".body")).toHaveText("Ukuran logo 2x");
    /* what is being written survives a redraw */
    await mine.locator(".cmt-edit-btn").click();
    await page.locator("#cmtEditText").fill("Ukuran logo 3x, cek @Rina Editor");
    await page.evaluate(() => renderDrawer());
    await expect(page.locator("#cmtEditText")).toHaveValue("Ukuran logo 3x, cek @Rina Editor");
    /* Ctrl+Enter saves */
    await page.locator("#cmtEditText").focus();
    await page.keyboard.press("Control+Enter");
    await expect(page.locator("#cmtEditText")).toHaveCount(0);
    await expect(mine.locator(".body")).toContainText("Ukuran logo 3x");
    await expect(mine.locator(".cmt-edited")).toHaveText("· edited");
    await expect.poll(() => page.evaluate(async id => { const d = await apiFetch("GET", "/api/tasks/" + id); const c = d.comments.find(x => x.id === "cm_mine"); return c.text + "|" + !!c.editedAt; }, ids.task)).toBe("Ukuran logo 3x, cek @Rina Editor|true");
    await expect.poll(() => sent.filter(b => (b.recipients || []).includes(ids.rina)).length, "the newly named person is told").toBe(1);
    /* Indonesian */
    await page.evaluate(() => { UI_LANG = "id"; renderDrawer(); });
    await expect(mine.locator(".cmt-edit-btn")).toHaveText("Edit");
    await expect(mine.locator(".cmt-edited")).toHaveText("· diedit");
    await page.evaluate(() => { UI_LANG = "en"; renderDrawer(); });
  } finally {
    /* the person made here goes too: a later spec checks a clean install has only the admin */
    await page.evaluate(async ids => { S.cmtEdit = null; closeDrawer(); await apiFetch("DELETE", "/api/tasks/" + ids.task).catch(() => {}); if (ids.rina) await apiFetch("DELETE", "/api/members/" + ids.rina).catch(() => {}); }, ids);
  }
});
