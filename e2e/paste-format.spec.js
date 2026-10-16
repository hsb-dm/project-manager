/* Pasted writing keeps the format it came with (src/desc-format.js): bold, italic, strikethrough, underline, headings,
   lists, quotes, links and code from Google Docs, Word and web pages, and the marks of plain text from ChatGPT or a .md
   file (Markdown) and from WhatsApp. Fonts and colours stay behind; ordinary text is never formatted; what is typed
   stays as typed, a typed "<u>" too; Ctrl+U underlines. Pasted with the real clipboard and Ctrl+V — a made-up paste
   event cannot reach the browser's own paste. Rules: tests/desc-format.test.js. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const S1 = "font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-variant:normal;vertical-align:baseline;white-space:pre;white-space:pre-wrap;";
const DOCS = '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1a2b3c"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">'
  + '<span style="' + S1 + 'font-weight:700;font-style:normal;text-decoration:none;">Bold </span>'
  + '<span style="' + S1 + 'font-weight:400;font-style:normal;text-decoration:none;">then </span>'
  + '<span style="' + S1 + 'font-weight:400;font-style:italic;text-decoration:none;">italic</span>'
  + '<span style="' + S1 + 'font-weight:400;font-style:normal;text-decoration:none;">, </span>'
  + '<span style="' + S1 + 'font-weight:400;font-style:normal;text-decoration:line-through;-webkit-text-decoration-skip:none;text-decoration-skip-ink:none;">struck</span>'
  + '<span style="' + S1 + 'font-weight:400;font-style:normal;text-decoration:none;">, </span>'
  + '<span style="' + S1 + 'font-weight:400;font-style:normal;text-decoration:underline;-webkit-text-decoration-skip:none;text-decoration-skip-ink:none;">underlined</span>'
  + '<span style="' + S1 + 'font-weight:400;font-style:normal;text-decoration:none;">, </span>'
  + '<span style="' + S1 + 'font-weight:700;font-style:italic;text-decoration:none;">bold italic</span>'
  + '<span style="' + S1 + 'font-weight:400;"> and 5 * 3</span></p>'
  + '<h2 dir="ltr" style="line-height:1.38;margin-top:18pt;margin-bottom:6pt;"><span style="font-size:16pt;font-family:Arial;font-weight:400;">Heading two</span></h2>'
  + '<ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;"><li dir="ltr" style="list-style-type:disc;" aria-level="1"><p dir="ltr" style="line-height:1.38;" role="presentation"><span style="' + S1 + 'font-weight:400;">Item one</span></p></li>'
  + '<li dir="ltr" style="list-style-type:disc;" aria-level="1"><p dir="ltr" role="presentation"><span style="' + S1 + 'font-weight:700;">Item two bold</span></p></li></ul>'
  + '<p dir="ltr"><a href="https://example.com/brief" style="text-decoration:none;"><span style="' + S1 + 'color:#1155cc;font-weight:400;text-decoration:underline;-webkit-text-decoration-skip:none;">a link</span></a></p></b><br class="Apple-interchange-newline">';
/* as Word puts it on the clipboard: line breaks between and inside its paragraphs, list markers between
   <![if !supportLists]> and <![endif]> or in a mso-list:Ignore span */
const WORD = '<html xmlns:o="urn:schemas-microsoft-com:office:office">\r\n<head><style>p.MsoNormal{margin:0}</style></head>\r\n<body lang=EN-US style=\'tab-interval:.5in\'>\r\n<!--StartFragment-->\r\n\r\n'
  + '<p class=MsoNormal><b><span lang=EN-US>Bold</span></b><span lang=EN-US> then\r\n<i>italic</i>, <s>struck</s>, <u>underlined</u>, <b><i>bold italic</i></b><o:p></o:p></span></p>\r\n\r\n'
  + '<p class=MsoListParagraphCxSpFirst style=\'text-indent:-.25in;mso-list:l0 level1 lfo1\'><![if !supportLists]><span\r\nlang=EN-US style=\'font-family:Symbol;mso-fareast-font-family:Symbol\'><span style=\'mso-list:Ignore\'>·<span\r\nstyle=\'font:7.0pt "Times New Roman"\'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;\r\n</span></span></span><![endif]><span lang=EN-US>Item one<o:p></o:p></span></p>\r\n\r\n'
  + '<p class=MsoListParagraphCxSpLast style=\'text-indent:-.25in;mso-list:l0 level1 lfo1\'><span lang=EN-US style=\'font-family:Symbol\'><span style=\'mso-list:Ignore\'>·<span style=\'font:7.0pt "Times New Roman"\'>&nbsp;&nbsp;&nbsp;&nbsp;\r\n</span></span></span><b><span lang=EN-US>Item two bold</span></b><o:p></o:p></p>\r\n\r\n'
  + '<p class=MsoListParagraph style=\'text-indent:-.25in;mso-list:l1 level1 lfo2\'><![if !supportLists]><span lang=EN-US><span style=\'mso-list:Ignore\'>1.<span style=\'font:7.0pt "Times New Roman"\'>&nbsp;&nbsp;&nbsp;\r\n</span></span></span><![endif]><span lang=EN-US>First x<sup>2</sup> H<sub>2</sub>O<o:p></o:p></span></p>\r\n\r\n'
  + '<p class=MsoNormal><span lang=EN-US>After<o:p></o:p></span></p>\r\n\r\n<!--EndFragment-->\r\n</body>\r\n\r\n</html>';
const WEB = '<h2>Judul</h2><p>Teks <strong>tebal</strong>, <em>miring</em>, <code>kode</code>, <del>coret</del>, <u>garis bawah</u>, <ins>sisipan</ins>, <mark>stabilo</mark>, x<sup>2</sup> dan H<sub>2</sub>O, x<sup>abc</sup></p>'
  + '<ul><li>satu</li><li><strong>dua</strong> tebal</li></ul><ol><li>pertama</li><li>kedua</li></ol><blockquote><p>kutipan</p></blockquote>'
  + '<pre><code>if (a) {\n  b *= 2;\n}</code></pre><hr><p>akhir</p>';
const MARKDOWN = "## Brief\n**Tebal** dan *miring* dan ~~coret~~ dan `kode`\n- satu\n- dua\n1. pertama\n> kutipan\nLink [di sini](https://example.com/a) dan 5 \\* 3\n";
const WHATSAPP = "*PROMO MERDEKA*\n*Diskon 50%*\n_berlaku sampai 17 Agustus_\n~harga lama~ jadi 5 * 3\n- poin satu\n- poin dua\n1. langkah\n> kutipan";

async function signIn(page) {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
}
/* a task of its own, its description open for writing */
const newTask = (page, ids) => page.evaluate(async () => { const d = await apiFetch("POST", "/api/tasks", { title: "Paste format " + Date.now(), status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME] }); TASKS.push(hTask(d)); openTask(d.id); S.drawerTab = "brief"; S.descMode = "editor"; renderDrawer(); return d.id; }).then(id => { ids.push(id); return id; });
/* the caret at the end of the writing, without clicking (a click on a link opens it) */
const caretEnd = (page, sel) => page.evaluate(q => { const el = document.querySelector(q); el.focus(); const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let t = null, n; while ((n = w.nextNode())) t = n; const r = document.createRange(); if (t) r.setStart(t, t.length); else r.selectNodeContents(el); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }, sel);
const paste = async (page, data) => {
  await page.evaluate(d => navigator.clipboard.write([new ClipboardItem(Object.fromEntries(Object.keys(d).map(k => [k, new Blob([d[k]], { type: k })])))]), data);
  await page.keyboard.press("Control+V"); await page.waitForTimeout(150); };
const stored = (page, id) => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(d => d.description), id);
/* saved, then drawn again from what the server keeps */
async function savedAndShown(page, id, want) {
  await page.evaluate(() => descSaveNow());
  await expect.poll(() => stored(page, id)).toBe(want);
  await page.evaluate(async i => { await reloadAll(); openTask(i); S.drawerTab = "brief"; S.descMode = "viewer"; renderDrawer(); }, id);
  return page.locator("#drawer .md-view").first();
}
const cleanup = (page, ids) => page.evaluate(async l => { closeDrawer(); for (const i of l) await apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}); }, ids);

test("Google Docs, Word and a web page keep bold, italic, strikethrough, underline, headings, lists, links and code", async ({ page }) => {
  test.setTimeout(120000);
  await signIn(page);
  const ids = [];
  try {
    /* Google Docs: its styles are the formatting; the space after "Bold" stays outside the bold */
    let id = await newTask(page, ids);
    await caretEnd(page, "#descSrc"); await paste(page, { "text/html": DOCS, "text/plain": "Bold then italic, struck, underlined, bold italic and 5 * 3\nHeading two\nItem one\nItem two bold\na link" });
    await expect(page.locator("#descSrc [style]"), "fonts and colours stay behind").toHaveCount(0);
    await expect(page.locator("#descSrc u")).toHaveText(["underlined"]);
    let view = await savedAndShown(page, id, "**Bold** then *italic*, ~~struck~~, <u>underlined</u>, ***bold italic*** and 5 \\* 3\n## Heading two\n- Item one\n- **Item two bold**\n[a link](https://example.com/brief)");
    await expect(view).toContainText("Bold then italic, struck, underlined, bold italic and 5 * 3");
    await expect(view.locator("strong").first()).toHaveText("Bold");
    await expect(view.locator("em").first()).toHaveText("italic");
    await expect(view.locator("del")).toHaveText(["struck"]);
    await expect(view.locator("u")).toHaveText(["underlined"]);
    await expect(view.locator("em strong, strong em")).toHaveText(["bold italic"]);
    await expect(view.locator("h4")).toHaveText(["Heading two"]);
    await expect(view.locator("ul > li")).toHaveText(["Item one", "Item two bold"]);
    await expect(view.locator("a", { hasText: "a link" })).toHaveCount(1);
    await expect(view.locator("a u, u a"), "a link's own underline is not the writer's").toHaveCount(0);

    /* Word: its list paragraphs are lists again, without their written bullets; no empty lines from its line breaks */
    id = await newTask(page, ids);
    await caretEnd(page, "#descSrc"); await paste(page, { "text/html": WORD, "text/plain": "Bold then italic, struck, underlined, bold italic\n·         Item one\n·         Item two bold\n1.    First x2 H2O\nAfter" });
    view = await savedAndShown(page, id, "**Bold** then *italic*, ~~struck~~, <u>underlined</u>, ***bold italic***\n- Item one\n- **Item two bold**\n1. First x² H₂O\nAfter");
    await expect(view.locator("ul > li")).toHaveText(["Item one", "Item two bold"]);
    await expect(view.locator("ol > li")).toHaveText(["First x² H₂O"]);
    await expect(view.locator("u")).toHaveText(["underlined"]);
    await expect(view.locator("del")).toHaveText(["struck"]);
    expect(await view.innerText()).not.toContain("·");
    await expect(view.locator(":scope > div")).toHaveText(["Bold then italic, struck, underlined, bold italic", "After"]);

    /* a web page: <u>, <ins>, x², H₂O, lists, a quote, code, a code block and a line */
    id = await newTask(page, ids);
    await caretEnd(page, "#descSrc"); await paste(page, { "text/html": WEB, "text/plain": "Judul\nTeks tebal" });
    view = await savedAndShown(page, id, "## Judul\nTeks **tebal**, *miring*, `kode`, ~~coret~~, <u>garis bawah</u>, <u>sisipan</u>, stabilo, x² dan H₂O, xabc\n- satu\n- **dua** tebal\n1. pertama\n1. kedua\n> kutipan\n```\nif (a) {\n  b *= 2;\n}\n```\n---\nakhir");
    await expect(view.locator("u")).toHaveText(["garis bawah", "sisipan"]);
    await expect(view).toContainText("x² dan H₂O, xabc");
    await expect(view.locator("ul > li")).toHaveText(["satu", "dua tebal"]);
    await expect(view.locator("ol > li")).toHaveText(["pertama", "kedua"]);
    await expect(view.locator("blockquote")).toHaveText(["kutipan"]);
    await expect(view.locator(":scope > div code")).toHaveText(["kode"]);
    await expect(view.locator("pre code")).toHaveText("if (a) {\n  b *= 2;\n}");
    await expect(view.locator("hr")).toHaveCount(1);
    /* opened and saved again, it is the same text (the code block and the line used to be dropped) */
    await page.evaluate(() => { S.descMode = "editor"; renderDrawer(); });
    await page.evaluate(() => descSaveNow()); await page.waitForTimeout(500);
    expect(await stored(page, id)).toContain("```\nif (a) {\n  b *= 2;\n}\n```\n---\nakhir");
  } finally { await cleanup(page, ids); }
});

test("plain text with Markdown or WhatsApp marks pastes as that formatting; text without marks stays as it is", async ({ page }) => {
  test.setTimeout(120000);
  await signIn(page);
  const ids = [];
  try {
    /* Markdown, as ChatGPT's or Claude's Copy gives it */
    let id = await newTask(page, ids);
    await caretEnd(page, "#descSrc"); await paste(page, { "text/plain": MARKDOWN });
    let view = await savedAndShown(page, id, MARKDOWN.trim());
    await expect(view.locator("h4")).toHaveText(["Brief"]);
    await expect(view.locator("strong")).toHaveText(["Tebal"]);
    await expect(view.locator("em")).toHaveText(["miring"]);
    await expect(view.locator("del")).toHaveText(["coret"]);
    await expect(view.locator("code")).toHaveText(["kode"]);
    await expect(view.locator("ul > li")).toHaveText(["satu", "dua"]);
    await expect(view.locator("ol > li")).toHaveText(["pertama"]);
    await expect(view.locator("blockquote")).toHaveText(["kutipan"]);
    await expect(view.locator("a", { hasText: "di sini" })).toHaveAttribute("href", "https://example.com/a");
    await expect(view).toContainText("dan 5 * 3");

    /* WhatsApp: *bold*, _italic_, ~strike~ — two bold lines stay two lines (they used to be saved as one) */
    id = await newTask(page, ids);
    await caretEnd(page, "#descSrc"); await paste(page, { "text/plain": WHATSAPP });
    view = await savedAndShown(page, id, "**PROMO MERDEKA**\n**Diskon 50%**\n*berlaku sampai 17 Agustus*\n~~harga lama~~ jadi 5 \\* 3\n- poin satu\n- poin dua\n1. langkah\n> kutipan");
    await expect(view.locator("strong")).toHaveText(["PROMO MERDEKA", "Diskon 50%"]);
    await expect(view.locator("em")).toHaveText(["berlaku sampai 17 Agustus"]);
    await expect(view.locator("del")).toHaveText(["harga lama"]);
    await expect(view.locator("ul > li")).toHaveText(["poin satu", "poin dua"]);
    await expect(view).toContainText("jadi 5 * 3");

    /* text without marks is pasted as it always was; one line goes into the line it is pasted in */
    id = await newTask(page, ids);
    await page.locator("#descSrc").click();
    await page.keyboard.insertText("Before ");
    await paste(page, { "text/plain": "Pasted: 2 * 4 * 6 and # tag" });
    await page.keyboard.insertText(" after");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("Hi ");
    await paste(page, { "text/plain": "*PROMO*" });
    view = await savedAndShown(page, id, "Before Pasted: 2 \\* 4 \\* 6 and # tag after\nHi **PROMO**");
    await expect(view.locator(":scope > div")).toHaveText(["Before Pasted: 2 * 4 * 6 and # tag after", "Hi PROMO"]);
    await expect(view.locator("strong")).toHaveText(["PROMO"]);
    await expect(view.locator("h3,h4,h5,em,ul,ol")).toHaveCount(0);
  } finally { await cleanup(page, ids); }
});

test("typed: Ctrl+U underlines, a bold word's space stays outside it, a typed <u> is text", async ({ page }) => {
  test.setTimeout(90000);
  await signIn(page);
  const ids = [];
  try {
    const id = await newTask(page, ids);
    await page.locator("#descSrc").click();
    const k = page.keyboard;
    await k.type("Typed "); await k.press("Control+U"); await k.type("under"); await k.press("Control+U"); await k.type(" end");
    await k.press("Enter");
    await k.press("Control+B"); await k.type("Bold "); await k.press("Control+B"); await k.type("then");
    /* two bold lines, one after the other */
    await k.press("Enter"); await k.press("Control+B"); await k.type("Line A"); await k.press("Enter"); await k.type("Line B"); await k.press("Control+B");
    await k.press("Enter");
    await k.insertText("Literal <u>x</u> and </u> and a < b");
    const want = "Typed <u>under</u> end\n**Bold** then\n**Line A**\n**Line B**\nLiteral \\<u>x\\</u> and \\</u> and a < b";
    const view = await savedAndShown(page, id, want);
    await expect(view.locator("u")).toHaveText(["under"]);
    await expect(view.locator("strong")).toHaveText(["Bold", "Line A", "Line B"]);
    await expect(view.locator(":scope > div")).toHaveText(["Typed under end", "Bold then", "Line A", "Line B", "Literal <u>x</u> and </u> and a < b"]);
    /* opened again and saved: still the same */
    await page.evaluate(() => { S.descMode = "editor"; renderDrawer(); });
    await expect(page.locator("#descSrc u")).toHaveText(["under"]);
    await page.evaluate(() => descSaveNow()); await page.waitForTimeout(500);
    expect(await stored(page, id)).toBe(want);
    /* readers of the plain text: underline's tags are not words, a typed one is */
    expect(await page.evaluate(i => descPlainText(task(i).description), id)).toBe("Typed under end\n**Bold** then\n**Line A**\n**Line B**\nLiteral <u>x</u> and </u> and a < b");
    /* what is kept reads back into the editor and is written again as the same text (opening it saves nothing) */
    for (const m of ["<u>under</u> and **<u>both</u>**", "```\nif (a) {\n  b *= 2;\n}\n```", "a\n---\nb", "**a** **b**", "**a**\n**b**", "- <u>x</u>\n1. y",
      "## <u>Head</u>", "\\<u>typed\\</u> and \\</u>", "x² H₂O", "[link](https://example.com/x) <u>after</u>", "*it* and ***both*** and ~~gone~~"])
      expect(await page.evaluate(x => descHtmlToMd(descMdHtml(x)), m), m).toBe(m);
  } finally { await cleanup(page, ids); }
});

test("the progress note keeps pasted formatting too", async ({ page }) => {
  test.setTimeout(90000);
  await signIn(page);
  const ids = [];
  try {
    const id = await newTask(page, ids);
    await page.evaluate(() => { S.drawerTab = "progress"; renderDrawer(); pnStart("new"); });
    await expect(page.locator("#pnSrc")).toBeVisible();
    await caretEnd(page, "#pnSrc");
    await paste(page, { "text/html": '<p><span style="text-decoration:underline">garis</span> dan <span style="text-decoration:line-through">coret</span> dan <b>Bold </b>lalu</p>', "text/plain": "garis dan coret dan Bold lalu" });
    await page.keyboard.press("Enter");
    await paste(page, { "text/plain": "*Status*: _on track_\n- desain selesai\n- copy menunggu" });
    await page.evaluate(() => pnSave());
    const want = "<u>garis</u> dan ~~coret~~ dan **Bold** lalu\n**Status**: *on track*\n- desain selesai\n- copy menunggu";
    await expect.poll(() => page.evaluate(i => apiFetch("GET", "/api/tasks/" + i).then(d => (d.progress || []).map(p => p.text)), id)).toEqual([want]);
    await page.evaluate(async i => { await reloadAll(); openTask(i); S.drawerTab = "progress"; renderDrawer(); }, id);
    const view = page.locator("#drawer .pn-view");
    await expect(view.locator("u")).toHaveText(["garis"]);
    await expect(view.locator("del")).toHaveText(["coret"]);
    await expect(view.locator("strong")).toHaveText(["Bold", "Status"]);
    await expect(view.locator("em")).toHaveText(["on track"]);
    await expect(view.locator("li")).toHaveText(["desain selesai", "copy menunggu"]);
  } finally { await cleanup(page, ids); }
});
