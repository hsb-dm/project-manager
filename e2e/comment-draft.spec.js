/* A comment being written belongs to its task (Oct 2026). Left unsent it is kept — a draft — but only for that task:
   opening another task shows that task's own draft, or an empty box; going back brings the first one back, with its
   attachments — and a reply being written, in its box under the comment it answers (comment-reply-inline.spec). It
   used to follow the person into every task they opened. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };

test("an unsent comment stays with the task it was written in", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const ids = await page.evaluate(async () => {
    const mk = async title => { const d = await apiFetch("POST", "/api/tasks", { title, status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME] }); TASKS.push(hTask(d)); return d.id; };
    const a = await mk("Draft task A"), b = await mk("Draft task B");
    const withComment = await apiFetch("POST", "/api/tasks/" + a + "/comments", { id: "cm_draft_a", text: "Komentar di A" });
    replaceInto(task(a), hTask(withComment));
    return { a, b };
  });
  const open = id => page.evaluate(id => { openTask(id); S.drawerTab = "comments"; S.commentVis = "internal"; renderDrawer(); }, id);
  const box = page.locator("#cmtText"), chips = page.locator("#drawer .cmts + .composer .att.att-chip"), reply = page.locator("#drawer .cmt-reply-box #cmtReplyText"), replyChips = page.locator("#drawer .cmt-reply-box .att.att-chip");
  try {
    /* A: words and an attachment in the box at the bottom; a reply under the comment, with its own words and attachment */
    await open(ids.a);
    await box.click(); await page.keyboard.type("Draft untuk A");
    await page.evaluate(() => cmtStage({ name: "Brief A", url: "https://example.org/brief-a", type: "link", kind: "link" }));
    await expect(chips).toHaveCount(1);
    await page.locator('#drawer .cmt[data-cid="cm_draft_a"] .acts .cmt-reply-btn').click();
    await expect(reply).toBeFocused();
    await page.keyboard.type("Balasan untuk A");
    await page.evaluate(() => cmtStage({ name: "Ref A", url: "https://example.org/ref-a", type: "link", kind: "link" }));
    await expect(replyChips).toHaveCount(1);
    await expect(chips).toHaveCount(1);
    await expect(box).toHaveValue("Draft untuk A");
    /* B: an empty box and no reply — nothing of A's */
    await open(ids.b);
    await expect(box).toHaveValue("");
    await expect(chips).toHaveCount(0);
    await expect(reply).toHaveCount(0);
    await box.click(); await page.keyboard.type("Draft untuk B");
    /* back to A: A's draft, whole, and the reply still open under its comment */
    await open(ids.a);
    await expect(box).toHaveValue("Draft untuk A");
    await expect(chips).toHaveCount(1);
    await expect(reply).toHaveValue("Balasan untuk A");
    await expect(replyChips).toHaveCount(1);
    /* and B's is B's */
    await open(ids.b);
    await expect(box).toHaveValue("Draft untuk B");
    /* sent in B: B's box is empty, A's draft is still there — also after the panel was closed */
    await box.focus(); await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(id => task(id).comments.length, ids.b), { timeout: 10000 }).toBe(1);
    await expect(box).toHaveValue("");
    await page.evaluate(() => closeDrawer());
    await open(ids.a);
    await expect(box).toHaveValue("Draft untuk A");
    await expect(reply).toHaveValue("Balasan untuk A");
    /* an upload that finishes after its task was left lands in that task's comment */
    await open(ids.b);
    await page.evaluate(id => cmtDraftAttach(id, { name: "Late.png", size: "1 MB", url: "https://example.org/late.png", type: "image" }), ids.a);
    await expect(chips).toHaveCount(0);
    await open(ids.a);
    await expect(page.locator("#drawer .cmts + .composer .att")).toHaveCount(2);
  } finally {
    await page.evaluate(async ids => { closeDrawer(); window._cmtDraft = ""; window._cmtAtt = []; CMT_DRAFTS = {}; CMT_REPLY_OPEN = {}; for (const id of [ids.a, ids.b]) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); }, ids);
  }
});
