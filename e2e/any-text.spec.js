/* Any text goes in and comes back as written (Oct 2026): emoji, other scripts, symbols, things that look like HTML,
   and characters Markdown would read as formatting — in a task's description, its progress note and a comment,
   typed or pasted. Formatting chosen with the toolbar still formats. Rules: tests/desc-literal.test.js. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
test.use({ permissions: ["clipboard-read", "clipboard-write"] });
const LINES = [
  "Emoji: ✅❗👍🏽🇮🇩1️⃣👨‍👩‍👧",
  "Scripts: 中文 日本語 한국어 العربية ไทย Ελληνικά Русский",
  "Accents: café naïve über São Paulo",
  "Symbols: € £ ¥ ₹ ™ © ® ° ± × ÷ ≥ ≤ ≠ √ ∞ µ § ¶ • · – — …",
  "Quotes: “double” ‘single’ «guillemets» „low“",
  "Markup: <b>not bold</b> &amp; &lt; <script>alert(1)</script>",
  "Stars: 5 * 3 * 2 = 30 and **not bold** here",
  "Under: file_name_v2 and _not italic_ here",
  "Tilde: ~~not struck~~ and `not code` and [label](https://example.org)",
  "# not a heading",
  "- not a list",
  "1. not numbered",
  "> not a quote",
  "Math: x² H₂O ½ ¾ 𝐀𝐁𝐂",
  "Back\\slash C:\\Users\\hsb and a \\* star",
];

test("any text comes back as written in the description, the progress note and a comment", async ({ page }) => {
  test.setTimeout(150000);
  await page.setViewportSize({ width: 1366, height: 1000 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const id = await page.evaluate(async () => { const d = await apiFetch("POST", "/api/tasks", { title: "Any text " + Date.now(), status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME] }); TASKS.push(hTask(d)); openTask(d.id); S.drawerTab = "brief"; S.descMode = "editor"; renderDrawer(); return d.id; });
  const reopen = tab => page.evaluate(async o => { await reloadAll(); openTask(o.id); S.drawerTab = o.tab; S.descMode = "viewer"; renderDrawer(); }, { id, tab });
  const missing = async sel => { const text = await page.locator(sel).first().innerText(); return LINES.filter(l => text.indexOf(l) < 0); };

  /* the caret at the end of the writing, without clicking (a click on a link opens it) */
  const caretEnd = sel => page.evaluate(q => { const el = document.querySelector(q); el.focus(); const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let t = null, n; while ((n = w.nextNode())) t = n; const r = document.createRange(); if (t) r.setStart(t, t.length); else r.selectNodeContents(el); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }, sel);
  /* pasted with the real clipboard and Ctrl+V, on a new line at the end */
  const paste = async (sel, data) => { await caretEnd(sel); await page.keyboard.press("Enter");
    await page.evaluate(d => navigator.clipboard.write([new ClipboardItem(Object.fromEntries(Object.keys(d).map(k => [k, new Blob([d[k]], { type: k })])))]), data);
    await page.keyboard.press("Control+V"); await page.waitForTimeout(150); };
  try {
    /* the description, typed */
    await page.locator("#descSrc").click();
    for (const l of LINES) { await page.keyboard.insertText(l); await page.keyboard.press("Enter"); }
    await page.evaluate(() => descSaveNow());
    await reopen("brief");
    expect(await missing("#drawer .md-view"), "typed, then shown").toEqual([]);
    await expect(page.locator("#drawer .md-view").first().locator("h3,h4,h5,ul,ol,blockquote,code,em,strong,del,script")).toHaveCount(0);
    /* the toolbar still formats */
    await page.evaluate(() => { S.descMode = "editor"; renderDrawer(); });
    await caretEnd("#descSrc"); await page.keyboard.press("Enter");
    await page.locator(".md-btn[aria-label='Bold']").first().click(); await page.keyboard.insertText("Really bold");
    await page.evaluate(() => descSaveNow());
    await reopen("brief");
    await expect(page.locator("#drawer .md-view").first().locator("strong", { hasText: "Really bold" })).toHaveCount(1);
    expect(await missing("#drawer .md-view"), "saved again, still as written").toEqual([]);
    /* the description, pasted as plain text and as a page's HTML */
    await page.evaluate(() => { S.descMode = "editor"; renderDrawer(); });
    await paste("#descSrc", { "text/plain": "Pasted: 2 * 4 * 6 and # tag" });
    await paste("#descSrc", { "text/html": '<p><span style="font-family:Arial;color:#c00;font-size:28px">Docs: 10 * 20 * 30 &lt;tag&gt;</span> <b>bold from Docs</b></p>', "text/plain": "Docs: 10 * 20 * 30 <tag> bold from Docs" });
    /* in the editor at once: the formatting, not the page's own fonts and colours */
    await expect(page.locator("#descSrc [style]")).toHaveCount(0);
    await expect(page.locator("#descSrc strong, #descSrc b").filter({ hasText: "bold from Docs" })).toHaveCount(1);
    await page.evaluate(() => descSaveNow());
    await reopen("brief");
    const view = page.locator("#drawer .md-view").first();
    await expect(view).toContainText("Pasted: 2 * 4 * 6 and # tag");
    await expect(view).toContainText("Docs: 10 * 20 * 30 <tag>");
    await expect(view.locator("strong", { hasText: "bold from Docs" }), "pasted formatting stays").toHaveCount(1);
    expect(await view.locator("[style]").count(), "the page's own fonts and colours do not come along").toBe(0);
    /* the progress note, typed */
    await page.evaluate(() => { S.drawerTab = "progress"; renderDrawer(); pnStart("new"); });
    await page.locator("#pnSrc").click();
    for (const l of LINES) { await page.keyboard.insertText(l); await page.keyboard.press("Enter"); }
    await page.evaluate(() => pnSave());
    await expect.poll(() => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(d => (d.progress || []).length), id)).toBe(1);
    await reopen("progress");
    expect(await missing("#drawer .pn-view"), "a progress note").toEqual([]);
    /* a comment, typed */
    await page.evaluate(() => { S.drawerTab = "comments"; renderDrawer(); });
    await page.locator("#cmtText").click(); await page.keyboard.insertText(LINES.join("\n"));
    await page.locator("#drawer .composer .bar .btn.primary").click();
    await expect.poll(() => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(d => d.comments.length), id)).toBe(1);
    await reopen("comments");
    const cmt = await page.evaluate(i => task(i).comments[0].text, id);
    expect(cmt).toBe(LINES.join("\n"));
    /* readers of the plain text: search finds what was typed */
    expect(await page.evaluate(i => descPlainText(task(i).description).indexOf("5 * 3 * 2") >= 0, id)).toBe(true);
  } finally {
    await page.evaluate(async i => { closeDrawer(); await apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, id);
  }
});
