/* A pasted Google link turns into its name straight away — no Tab — in the comment box, and into the
   Drive chip right inside the description editor, the way Trello does it. Hovering a chip opens a
   small card: Open preview, Open link, Copy link. The test server cannot reach Google, so
   /api/links/title is answered here. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const FOLDER = "https://drive.google.com/drive/folders/1PasteFolderKV";
const NAME = "Insurance Campaign KV";
let taskId = null;

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

async function signIn(page) {
  await page.route("**/api/links/title**", r => {
    const url = new URL(r.request().url()).searchParams.get("url") || "";
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ title: url.includes("1PasteFolderKV") ? NAME : "" }) });
  });
  await page.route(/^https:\/\/(drive|docs)\.google\.com\//, r => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>embed</title>" }));
  await page.goto("/");
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const copy = (page, text) => page.evaluate(t => navigator.clipboard.writeText(t), text);
const paste = page => page.keyboard.press("Control+V");

test("pasted into a comment, a Google link turns into its name, and typing carries on", async ({ page }) => {
  await signIn(page);
  taskId = await page.evaluate(() => apiFetch("POST", "/api/tasks", { title: "Paste links target", status: WS.workflow[0].id, assignee: ME }).then(t => { TASKS.push(hTask(t)); return t.id; }));
  await page.evaluate(id => { openTask(id); S.drawerTab = "comments"; renderDrawer(); }, taskId);
  await page.locator("#cmtText").click();
  await page.keyboard.type("KV is here: ");
  await copy(page, FOLDER);
  await paste(page);
  await page.keyboard.type(" thanks");   /* straight on, while the name is being read */
  /* the name is a capsule while writing, as it will be once posted: its mark, the name; the layer behind holds the
     very letters of the box — a spare one in front of the name carries the mark — so the caret stays on the text */
  await expect(page.locator("#cmtText")).toHaveValue("KV is here: \u2001" + NAME + " thanks");
  const chip = page.locator("#drawer .cmt-ta-mirror .cmt-chip");
  await expect(chip.locator(".cmt-chip-name")).toHaveText(NAME);
  await expect(chip.locator(".cmt-chip-ico > *")).toHaveCount(1);
  expect(await page.evaluate(() => { const ta = document.getElementById("cmtText"), m = ta.parentNode.querySelector(".cmt-ta-mirror"); return m.textContent.replace(/​$/, "") === ta.value; })).toBe(true);
  /* the capsule moves no letter: its name sits where the same letters sit drawn plain */
  expect(await page.evaluate(() => {
    const m = document.querySelector("#drawer .cmt-ta-mirror"), n = m.querySelector(".cmt-chip-name"), plain = m.cloneNode(false);
    plain.textContent = m.textContent; m.parentNode.appendChild(plain);
    const r1 = document.createRange(); r1.selectNodeContents(n.firstChild);
    const i = plain.textContent.indexOf(n.textContent), r2 = document.createRange(); r2.setStart(plain.firstChild, i); r2.setEnd(plain.firstChild, i + n.textContent.length);
    const a = r1.getBoundingClientRect(), b = r2.getBoundingClientRect(); plain.remove();
    return Math.abs(a.left - b.left) < 0.5 && Math.abs(a.right - b.right) < 0.5 && Math.abs(a.top - b.top) < 0.5;
  })).toBe(true);
  await page.locator("#drawer .composer .bar .btn.primary").click();
  await expect.poll(() => page.evaluate(id => (task(id).comments.slice(-1)[0] || {}).text, taskId)).toBe("KV is here: [" + NAME + "](" + FOLDER + ") thanks");
  await expect(page.locator("#drawer .cmt .drive-chip").last()).toHaveText(NAME);
});

test("hovering a chip opens a card with Open preview, Open link and Copy link", async ({ page }) => {
  await signIn(page);
  await page.evaluate(id => { openTask(id); S.drawerTab = "comments"; renderDrawer(); }, taskId);
  await page.locator("#drawer .cmt .drive-chip").last().hover();
  const card = page.locator(".link-card.open");
  await expect(card).toBeVisible();
  await expect(card.locator(".lc-head")).toHaveText(NAME);
  await expect(card.locator(".lc-kind")).toHaveText("Google Drive Folder");
  await expect(card.locator("button")).toHaveText(["Open preview", "Open link", "Copy link"]);
  await card.locator("button", { hasText: "Copy link" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(FOLDER);
  /* preview: the folder's own embed */
  await page.locator("#drawer .cmt .drive-chip").last().hover();
  await page.locator(".link-card.open button", { hasText: "Open preview" }).click();
  await expect(page.locator("#modal .vp-frame iframe")).toHaveAttribute("src", /embeddedfolderview\?id=1PasteFolderKV/);
  await page.evaluate(() => closeModal());
});

test("pasted into the description editor, it becomes the chip right there, and saves as the link", async ({ page }) => {
  await signIn(page);
  await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; S.descMode = "editor"; renderDrawer(); }, taskId);
  const ed = page.locator("#descSrc");
  await ed.click();
  await page.keyboard.type("Hero KV: ");
  await copy(page, FOLDER);
  await paste(page);
  const chip = ed.locator(".drive-chip");
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveAttribute("contenteditable", "false");
  await expect(chip).toHaveText(NAME);
  await page.keyboard.type("please resize");
  await expect(ed).toContainText("please resize");
  /* saved: the bare link, not the name that was looked up */
  await page.evaluate(() => descWysiwygSave());
  await expect.poll(() => page.evaluate(id => task(id).description, taskId)).toMatch(new RegExp("^Hero KV: " + FOLDER.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + "\\s+please resize$"));
  const d = await page.evaluate(id => task(id).description, taskId);
  expect(d).not.toContain("[");
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try { await signIn(page); if (taskId) await page.evaluate(id => apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}), taskId); } catch {} finally { await page.close(); }
});

test("in a project's discussion too; Backspace just after a capsule takes all of it", async ({ page }) => {
  await signIn(page);
  const pid = await page.evaluate(async () => { const id = "pd_paste_" + Date.now().toString(36); await apiFetch("POST", "/api/projects", { id, name: "Paste chip project", status: "active", owner: ME, teams: [] }); await reloadAll(); S.projectTab = "overview"; go("projects", id); return id; });
  try {
    const box = page.locator("#pdText"), chip = page.locator("#content .pd-box .cmt-ta-mirror .cmt-chip");
    await box.click();
    await page.keyboard.type("See ");
    await copy(page, FOLDER); await paste(page);
    await expect(box).toHaveValue("See \u2001" + NAME);
    await expect(chip.locator(".cmt-chip-name")).toHaveText(NAME);
    /* a capsule goes as one, as a chip does */
    await page.keyboard.press("End");
    await page.keyboard.press("Backspace");
    await expect(box).toHaveValue("See ");
    await expect(chip).toHaveCount(0);
    expect(await page.evaluate(() => (window._cmtLinks || []).length)).toBe(0);
    /* pasted again and sent: a chip in the discussion, [name](url) where it is kept */
    await copy(page, FOLDER); await paste(page);
    await expect(box).toHaveValue("See \u2001" + NAME);
    await page.keyboard.press("Enter");
    await expect(page.locator("#content .pd-overview .cmt .drive-chip")).toHaveText(NAME);
    const saved = await page.evaluate(id => apiFetch("GET", "/api/projects/" + id + "/comments"), pid);
    expect(saved.comments.map(c => c.text)).toEqual(["See [" + NAME + "](" + FOLDER + ")"]);
    /* a capsule whose name was edited into something else is plain words again: its spare letter is not kept, and
       the address goes at the end as before */
    expect(await page.evaluate(o => linkTokensExpand("See \u2001Insurance Campaign V", [{ display: o.NAME, url: o.FOLDER }]), { NAME, FOLDER })).toBe("See Insurance Campaign V " + FOLDER);
  } finally { await page.evaluate(id => apiFetch("DELETE", "/api/projects/" + id).catch(() => {}), pid); }
});
