/* The @ picker sits above the box it is typed in when there is no room below — in chat and in a comment. Its anchor
   is worked out from the caret, not an element; it was taken for "gone", so the picker was never moved once its
   list filled in, and hung off the bottom of the screen. In chat the typing also went into the picker's search box. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const box = (page, sel) => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight }; }, sel);

test("the @ picker opens above the chat box and the comment box, fully on screen", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  /* a few people to mention, so the list is as tall as a real one */
  const tag = Date.now().toString(36);
  const x = await page.evaluate(async t => {
    const ids = [];
    for (const n of ["Mira", "Mika", "Milo"]) { await apiFetch("POST", "/api/members", { name: n + " " + t, email: n.toLowerCase() + "-" + t + "@e2e.test", perm: "member", cap: 40 }); const people = (await apiFetch("GET", "/api/bootstrap")).people; ids.push(Object.keys(people).find(id => people[id].email === n.toLowerCase() + "-" + t + "@e2e.test")); }
    const task = (await apiFetch("POST", "/api/tasks", { title: "Mention place " + t, status: WS.workflow[0].id, prio: "medium" })).id;
    return { ids, task };
  }, tag);
  await page.reload(); await ready(page);
  try {
    /* chat: the box is at the bottom of the screen */
    await page.evaluate(() => { const c = CONVERSATIONS.find(x => x.type === "WORKSPACE"); go("messages"); openConversation(c.id); });
    await page.locator("#msgInput").click();
    await page.keyboard.type("@");
    const picker = page.locator("#entityPicker.ep-mention");
    await expect(picker).toBeVisible();
    await expect(picker.locator("[role=option]").nth(2)).toBeVisible();
    let p = await box(page, "#entityPicker"), input = await box(page, "#msgInput");
    expect(p.bottom, "chat: on screen").toBeLessThanOrEqual(p.vh);
    expect(p.bottom, "chat: above the box").toBeLessThanOrEqual(input.top);
    /* the typing stays in the message (it went into the picker's search box) and narrows the list */
    await expect(page.locator("#msgInput")).toBeFocused();
    await page.keyboard.type("Mik");
    await expect(page.locator("#msgInput")).toHaveValue("@Mik");
    await expect(picker).toContainText("Mika " + tag);
    await expect(picker).not.toContainText("Mira " + tag);
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
    await page.evaluate(() => { const t = document.getElementById("msgInput"); t.value = ""; const c = conv(S.messageConversationId), d = msgDraft(c.id); d.text = ""; d.mentions = []; });

    /* a comment, with the box at the bottom of the screen */
    await page.evaluate(i => { window._cmtDraft = ""; openTask(i); S.drawerTab = "comments"; S.commentVis = "internal"; renderDrawer(); }, x.task);
    await page.locator("#cmtText").scrollIntoViewIfNeeded();
    await page.locator("#cmtText").click();
    await page.keyboard.type("@");
    await expect(page.locator("#entityPicker [role=option]").nth(2)).toBeVisible();
    p = await box(page, "#entityPicker"); input = await box(page, "#cmtText");
    expect(p.top, "comment: on screen").toBeGreaterThanOrEqual(0);
    expect(p.bottom, "comment: on screen").toBeLessThanOrEqual(p.vh);
    if (p.vh - input.bottom < p.bottom - p.top + 12) expect(p.bottom, "comment: above the box when there is no room below").toBeLessThanOrEqual(input.top);
    await page.keyboard.press("Escape");
  } finally {
    await page.evaluate(o => { window._cmtDraft = ""; window._cmtMentions = []; if (typeof closeDrawer === "function") closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + o.task).catch(() => {}).then(() => Promise.all(o.ids.map(id => apiFetch("DELETE", "/api/members/" + id).catch(() => {})))); }, x);
  }
});
