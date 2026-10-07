/* A workspace's own emoji, made from a PNG or JPG: added from the emoji picker's Custom tab (the picture
   is made small, its shape kept), named :like-this:, and usable wherever emoji are — a message, a
   reaction, a comment, a status. Colleagues get it without a reload; whoever added it, or an admin,
   removes it. The server only accepts its own stored pictures. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page, who) {
  await page.goto("/");
  await page.locator("#au_email").fill(who.email);
  await page.locator("#au_pw").fill(who.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const tag = Date.now().toString(36);
const NAME = "party" + tag, TOKEN = ":" + NAME + ":";
const MEMBER = { name: "Emo Ji " + tag, email: "emoji-" + tag + "@e2e.test", pw: "Emoji!Maker-2026x" };
let memberId = null;
/* a 300×150 picture, transparent around a red disc */
const wide = page => page.evaluate(() => { const c = document.createElement("canvas"); c.width = 300; c.height = 150; const g = c.getContext("2d"); g.fillStyle = "#e00"; g.beginPath(); g.arc(150, 75, 60, 0, Math.PI * 2); g.fill(); return c.toDataURL("image/png"); });
const ws = page => page.evaluate(() => CONVERSATIONS.find(c => c.type === "WORKSPACE").id);
async function openPickerCustom(page) {
  await page.locator('.msg-composer button[onclick="msgEmojiInsert(this)"]').click();
  await expect(page.locator("#ctxMenu.emoji-menu.open")).toBeVisible();
  await page.locator("#ctxMenu .emoji-tabs button[title='Custom']").click();
}

test("setup: a member, signed in elsewhere", async ({ page }) => {
  await signIn(page, ADMIN);
  memberId = await page.evaluate(async o => {
    await apiFetch("POST", "/api/members", { name: o.name, email: o.email, perm: "member", cap: 40 });
    const people = (await apiFetch("GET", "/api/bootstrap")).people, id = Object.keys(people).find(k => people[k].email === o.email);
    await apiFetch("POST", "/api/members/" + id + "/password", { password: o.pw });
    return id;
  }, MEMBER);
  expect(memberId).toBeTruthy();
});

test("an emoji is added from a PNG in the picker's Custom tab; a colleague has it without a reload", async ({ page, browser }) => {
  const other = await (await browser.newContext()).newPage();
  await signIn(other, MEMBER);
  await other.waitForTimeout(800);
  await signIn(page, ADMIN);
  const cid = await ws(page);
  await page.evaluate(id => { go("messages"); openConversation(id); }, cid);
  await openPickerCustom(page);
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#ctxMenu .emoji-grid .ce-add").click();
  const png = await wide(page);
  await (await chooser).setFiles({ name: "Party Cat!.png", mimeType: "image/png", buffer: Buffer.from(png.split(",")[1], "base64") });
  await expect(page.locator("#modal .modal-head h3")).toHaveText("Add custom emoji");
  await expect(page.locator("#ceName")).toHaveValue("party-cat");   /* named after the file */
  /* the picture, made small with its shape kept */
  const dims = await page.evaluate(() => new Promise(r => { const i = new Image(); i.onload = () => r([i.width, i.height]); i.src = document.querySelector("#modal .ce-prev img.lg").src; }));
  expect(dims).toEqual([128, 64]);
  /* a name has to be one */
  await page.locator("#ceName").fill("1bad");
  await expect(page.locator("#ceHint")).toHaveClass(/bad/);
  await expect(page.locator("#ceSave")).toBeDisabled();
  await page.locator("#ceName").fill(NAME);
  await expect(page.locator("#ceHint")).toHaveText("Write it as " + TOKEN);
  await page.locator("#ceSave").click();
  await expect(page.locator(".toast").last()).toContainText("Emoji added " + TOKEN);
  /* stored on the server as our own picture */
  const saved = await page.evaluate(n => apiFetch("GET", "/api/emoji").then(l => l.find(x => x.name === n)), NAME);
  expect(saved.url).toMatch(/^\/files\/d\/[a-f0-9]{64}\.png$/);
  expect(saved.by).toBe(await page.evaluate(() => ME));
  const served = await page.evaluate(u => fetch(u, { credentials: "same-origin" }).then(r => [r.status, r.headers.get("content-type")]), saved.url);
  expect(served[0]).toBe(200); expect(served[1]).toContain("image/png");
  /* the colleague: live */
  await expect.poll(() => other.evaluate(t => !!customEmoji(t), TOKEN), { timeout: 8000 }).toBe(true);
  /* and the same name again is refused */
  await openPickerCustom(page);
  const again = page.waitForEvent("filechooser");
  await page.locator("#ctxMenu .emoji-grid .ce-add").click();
  await (await again).setFiles({ name: "x.png", mimeType: "image/png", buffer: Buffer.from(png.split(",")[1], "base64") });
  await page.locator("#ceName").fill(NAME);
  await expect(page.locator("#ceHint")).toHaveText("That name is taken");
  await expect(page.locator("#ceSave")).toBeDisabled();
  await page.evaluate(() => closeModal());
  /* not a picture: said so */
  await openPickerCustom(page);
  const third = page.waitForEvent("filechooser");
  await page.locator("#ctxMenu .emoji-grid .ce-add").click();
  await (await third).setFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(page.locator(".toast").last()).toContainText("Choose a PNG or JPG picture");
  await other.context().close();
});

test("it is used in a message, as a reaction, in a comment and in a status — and found by name", async ({ page }) => {
  await signIn(page, ADMIN);
  const cid = await ws(page);
  await page.evaluate(id => { go("messages"); openConversation(id); }, cid);
  /* found by name in the picker's search */
  await page.locator('.msg-composer button[onclick="msgEmojiInsert(this)"]').click();
  await page.locator("#ctxMenu .emoji-search").fill(NAME.slice(0, 7));
  await expect(page.locator("#ctxMenu .emoji-grid button[title='" + TOKEN + "'] img.emj.custom")).toBeVisible();
  await page.locator("#ctxMenu .emoji-grid button[title='" + TOKEN + "']").click();
  await expect(page.locator("#msgInput")).toHaveValue(TOKEN);
  await page.locator("#msgInput").press("End");
  await page.keyboard.type(" hore " + tag);
  await page.keyboard.press("Enter");
  const msg = page.locator("#msgTimeline .msg", { hasText: "hore " + tag }).last();
  await expect(msg.locator("img.emj.custom[alt='" + TOKEN + "']")).toBeVisible();
  /* as a reaction */
  const mid = await page.evaluate(t => { const l = MESSAGES[S.messageConversationId] || []; const m = l.filter(x => (x.body || "").indexOf("hore " + t) >= 0).pop(); return m && m.id; }, tag);
  await expect.poll(() => page.evaluate(id => !!id && !/^tmp|^local/.test(id), mid)).toBe(true);
  await page.evaluate(x => toggleReaction(x.mid, x.t), { mid, t: TOKEN });
  await expect(page.locator('#msgTimeline [data-mid="' + mid + '"] .msg-react img.emj.custom')).toBeVisible();
  await expect.poll(() => page.evaluate(x => apiFetch("GET", "/api/messages/conversations/" + x.cid + "/messages").then(d => { const m = d.items.find(i => i.id === x.mid); return m && m.reactions && Object.keys(m.reactions); }), { cid, mid })).toContain(TOKEN);
  /* the server takes only emoji that exist */
  const refused = await page.evaluate(id => apiFetch("POST", "/api/messages/" + id + "/reactions", { emoji: ":nope-not-here:" }).then(() => "ok", e => e.message), mid);
  expect(refused).toContain("no longer here");
  /* in a comment */
  const tid = await page.evaluate(async t => { const d = await apiFetch("POST", "/api/tasks", { title: "Emoji comment " + t, status: WS.workflow[0].id, prio: "medium" }); await apiFetch("POST", "/api/tasks/" + d.id + "/comments", { text: "Great work :party" + t + ":", vis: "internal" }); return d.id; }, tag);
  await page.reload(); await ready(page);
  await page.evaluate(id => { openTask(id); S.drawerTab = "comments"; S.commentVis = "internal"; renderDrawer(); }, tid);
  await expect(page.locator("#drawer .body img.emj.custom[alt='" + TOKEN + "']")).toBeVisible();
  await page.evaluate(id => { closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); }, tid);
  /* in a status */
  expect(await page.evaluate(t => { setAvailability("custom", { emoji: t, text: "Celebrating" }); const h = availabilityDot(ME, true); setAvailability("available"); return h; }, TOKEN)).toContain('class="emj custom');
  /* a time is not an emoji */
  expect(await page.evaluate(() => customEmojiInText("at 10:30:45"))).toBe("at 10:30:45");
  expect(await page.evaluate(() => { const was = UI_LANG; UI_LANG = "id"; const r = [tr("Add custom emoji"), tr("Custom")]; UI_LANG = was; return r; })).toEqual(["Tambah emoji kustom", "Kustom"]);
});

test("the server only accepts its own stored pictures and good names", async ({ page }) => {
  await signIn(page, ADMIN);
  const r = await page.evaluate(async n => {
    const tryAdd = b => apiFetch("POST", "/api/emoji", b).then(() => "ok", e => e.message);
    const own = (await apiFetch("GET", "/api/emoji")).find(x => x.name === n).url;
    return [await tryAdd({ name: "hotlink", url: "https://example.com/x.png" }), await tryAdd({ name: "notstored", url: "/files/d/" + "a".repeat(64) + ".png" }), await tryAdd({ name: "Bad Name", url: own }), await tryAdd({ name: n, url: own })];
  }, NAME);
  expect(r[0]).toContain("Upload a PNG or JPG picture first");
  expect(r[1]).toContain("Upload a PNG or JPG picture first");
  expect(r[2]).toContain("letters");
  expect(r[3]).toContain("That name is taken");
});

test("whoever added it, or an admin, removes it; a colleague cannot remove someone else's", async ({ page, browser }) => {
  const mem = await (await browser.newContext()).newPage();
  await signIn(mem, MEMBER);
  await mem.evaluate(() => customEmojiManage());
  const row = mem.locator(".ce-row", { hasText: TOKEN });
  await expect(row).toBeVisible();
  await expect(row.locator("button")).toHaveCount(0);   /* not hers */
  const refused = await mem.evaluate(n => apiFetch("DELETE", "/api/emoji/" + n).then(() => "ok", e => e.message), NAME);
  expect(refused).not.toBe("ok");
  await mem.context().close();
  await signIn(page, ADMIN);
  await page.evaluate(() => customEmojiManage());
  await page.locator(".ce-row", { hasText: TOKEN }).getByRole("button").click();
  await expect(page.locator(".toast").last()).toContainText("Emoji removed " + TOKEN);
  expect(await page.evaluate(n => apiFetch("GET", "/api/emoji").then(l => l.some(x => x.name === n)), NAME)).toBe(false);
  /* where it was written, the name is left as text */
  expect(await page.evaluate(t => emojiHtml(t), TOKEN)).toBe('<span class="emj">' + TOKEN + "</span>");
  await page.evaluate(() => closeModal());
});

test("cleanup", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.evaluate(id => apiFetch("DELETE", "/api/members/" + id).catch(() => {}), memberId);
});
