/* The caret keeps up with the text after an @mention. A message box draws its text in a mirror layer (mentions
   as chips) under a see-through textarea that draws the caret. In the chat box the chip was bold: wider than
   the textarea's text under it, so after every mention the caret sat behind the words it should follow. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

/* how far the drawn text runs past (or short of) the textarea's own text, in pixels */
const drift = (page, taId, mirrorSel) => page.evaluate(([taId, sel]) => {
  const ta = document.getElementById(taId), m = document.querySelector(sel), r = document.createRange(); r.selectNodeContents(m);
  const rects = [...r.getClientRects()].filter(x => x.width > 0), left = Math.min(...rects.map(x => x.left)), right = Math.max(...rects.map(x => x.right));
  const cs = getComputedStyle(ta), c = document.createElement("canvas").getContext("2d"); c.font = [cs.fontStyle, cs.fontWeight, cs.fontSize, cs.fontFamily].join(" ");
  return Math.round(((right - left) - c.measureText(ta.value).width) * 10) / 10;
}, [taId, mirrorSel]);

test("after an @mention the caret stays with the text — in chat and in a comment", async ({ page }) => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
  const me = await page.evaluate(() => ({ id: ME, name: person(ME).name }));
  /* chat */
  await page.evaluate(() => { const c = CONVERSATIONS.find(x => x.type === "WORKSPACE"); go("messages"); openConversation(c.id); });
  await expect(page.locator("#msgInput")).toBeVisible();
  await page.evaluate(p => { const c = conv(S.messageConversationId), d = msgDraft(c.id), ta = document.getElementById("msgInput"); ta.value = "Hi @" + p.name + " and @everyone, thanks"; d.text = ta.value; d.mentions = [{ userId: p.id, display: p.name }, { userId: "@everyone", display: "everyone" }]; msgMirrorSync(c); }, me);
  await expect(page.locator("#msgMirror .msg-mention")).toHaveCount(2);
  expect(Math.abs(await drift(page, "msgInput", "#msgMirror")), "chat: drawn text and caret line up").toBeLessThan(1.5);
  await page.evaluate(() => { const c = conv(S.messageConversationId), d = msgDraft(c.id); d.text = ""; d.mentions = []; document.getElementById("msgInput").value = ""; msgMirrorSync(c); });
  /* a comment */
  const id = await page.evaluate(async () => { const d = await apiFetch("POST", "/api/tasks", { title: "Caret " + Date.now(), status: WS.workflow[0].id, prio: "medium" }); TASKS.push(hTask(d)); return d.id; });
  try {
    await page.evaluate(i => { window._cmtDraft = ""; openTask(i); S.drawerTab = "comments"; S.commentVis = "internal"; renderDrawer(); }, id);
    await page.evaluate(p => { const ta = document.getElementById("cmtText"); ta.value = "Hi @" + p.name + " please check"; window._cmtDraft = ta.value; window._cmtMentions = [{ id: p.id, display: p.name }]; cmtMirrorSync(); }, me);
    await expect(page.locator("#drawer .cmt-ta-mirror .msg-mention")).toHaveCount(1);
    expect(Math.abs(await drift(page, "cmtText", "#drawer .cmt-ta-mirror")), "comment: drawn text and caret line up").toBeLessThan(1.5);
  } finally {
    await page.evaluate(i => { window._cmtDraft = ""; window._cmtMentions = []; closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id);
  }
});
