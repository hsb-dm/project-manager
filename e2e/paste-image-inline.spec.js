/* A picture placed IN the writing, the way it works in Trello or a document.

   The description is a contenteditable, so the picture can sit between two paragraphs and move
   with the text around it. The Markdown keeps a marker, ![name](zc-att:ID), never the picture
   itself — the task record has to stay free of image bytes (server/uploads.js), and a Drive-hosted
   image resolves through its attachment like any other.

   A brief field is a <textarea> and cannot hold anything, so its pictures stay in the strip below
   it. Both of those are covered here, including taking one out again. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
let taskId = null;

async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
async function pasteImage(page, selector, name) {
  return page.evaluate(async ([sel, fname]) => {
    const c = document.createElement("canvas"); c.width = 240; c.height = 160;
    const x = c.getContext("2d"); x.fillStyle = "#1F4FD8"; x.fillRect(0, 0, 240, 160);
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    const file = new File([blob], fname, { type: "image/png" });
    const dt = new DataTransfer(); dt.items.add(file);
    const el = document.querySelector(sel); el.focus();
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    return true;
  }, [selector, name]);
}
const descOf = page => page.evaluate(id => task(id).description || "", taskId);
const openEditor = async page => {
  await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; S.descMode = "editor"; renderDrawer(); }, taskId);
  await expect(page.locator("#descSrc")).toBeVisible();
};

test("a task to write in", async ({ page }) => {
  await signIn(page);
  await page.goto("/projects"); await ready(page);
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.locator("#np_name").fill("Inline images");
  await page.locator("#modal .btn.primary").click();
  await expect.poll(() => page.evaluate(() => !!PROJECTS.find(p => p.name === "Inline images"))).toBe(true);
  await page.evaluate(() => { newTaskModal({ title: "Inline target", proj: PROJECTS.find(p => p.name === "Inline images").id, assignee: ME }); createDraft(); });
  await expect.poll(() => page.evaluate(() => (TASKS.find(t => t.title === "Inline target" && !t._draft) || {}).id || "")).not.toBe("");
  taskId = await page.evaluate(() => TASKS.find(t => t.title === "Inline target" && !t._draft).id);
});

test("the picture lands where the caret is, not at the end", async ({ page }) => {
  await signIn(page);
  await openEditor(page);
  /* two paragraphs, caret put back at the end of the first one */
  await page.evaluate(() => {
    const el = document.getElementById("descSrc");
    el.innerHTML = "<p>First paragraph</p><p>Second paragraph</p>";
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el.firstChild); r.collapse(false);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  await pasteImage(page, "#descSrc", "between.png");
  await expect.poll(() => descOf(page), { timeout: 15000 }).toContain("zc-att:");

  const md = await descOf(page);
  const iImg = md.indexOf("![between.png]"), iFirst = md.indexOf("First paragraph"), iSecond = md.indexOf("Second paragraph");
  expect(iFirst, "the writing before it is kept").toBeGreaterThanOrEqual(0);
  expect(iSecond, "and the writing after it").toBeGreaterThan(0);
  expect(iImg, "the picture sits between the two paragraphs").toBeGreaterThan(iFirst);
  expect(iImg, "the picture sits between the two paragraphs").toBeLessThan(iSecond);
});

test("the marker holds an id, never the picture", async ({ page }) => {
  await signIn(page);
  const saved = await page.evaluate(id => apiFetch("GET", "/api/tasks/" + id), taskId);
  /* a new picture arrives at a quarter of the column, and the width rides on the marker */
  expect(saved.description).toMatch(/!\[between\.png\]\(zc-att:[A-Za-z0-9_.:-]+ =25%\)/);
  expect(saved.description, "no bytes in the writing").not.toContain("data:image");
  expect(saved.description, "and no blob: URL from the preview shown during upload").not.toContain("blob:");
  expect(JSON.stringify(saved), "nothing base64 in the stored task").not.toContain("data:image");
  /* and it is not counted as a deliverable */
  expect(saved.files.some(f => f.name === "between.png"), "not an asset").toBe(false);
});

test("it draws as a real picture, in the editor and in the read-only view", async ({ page }) => {
  await signIn(page);
  await openEditor(page);
  const img = page.locator("#descSrc img.desc-img").first();
  await expect(img).toBeVisible();
  const size = await img.evaluate(i => [i.naturalWidth, i.naturalHeight]);
  expect(size[0], "real pixels").toBeGreaterThan(0);
  expect(await page.locator("#descSrc").innerText(), "no marker characters on screen").not.toContain("zc-att:");

  await page.evaluate(() => { S.descMode = "viewer"; renderDrawer(); });
  await expect(page.locator(".md-view img.desc-img").first()).toBeVisible();
  expect(await page.locator(".md-view").first().innerText()).not.toContain("zc-att:");
});

test("moving the picture in the editor moves it in the text", async ({ page }) => {
  await signIn(page);
  await openEditor(page);
  /* what a drag does, without the drag: put the image first instead of second */
  await page.evaluate(() => {
    const el = document.getElementById("descSrc"), img = el.querySelector("img.desc-img");
    el.insertBefore(img, el.firstChild);
    descSaveNow();
  });
  await expect.poll(() => descOf(page), { timeout: 10000 }).toMatch(/^\s*!\[between\.png\]/);
  const md = await descOf(page);
  expect(md, "the writing is still there, just after the picture").toContain("First paragraph");
});

test("the x takes the picture out of the writing and out of Comments", async ({ page }) => {
  await signIn(page);
  await openEditor(page);
  const before = await page.evaluate(id => task(id).comments.length, taskId);
  await page.locator("#descSrc img.desc-img").first().hover();
  await expect(page.locator("#descImgX")).toBeVisible();
  await page.locator("#descImgX").click();
  await page.locator("#modal .btn.danger, #modal .btn.primary").first().click();

  await expect.poll(() => descOf(page), { timeout: 10000 }).not.toContain("zc-att:");
  const t = await page.evaluate(id => JSON.parse(JSON.stringify(task(id))), taskId);
  expect(t.comments.length, "the comment it rode on goes with it").toBe(before - 1);
  expect(await descOf(page), "the writing around it is kept").toContain("First paragraph");
  /* and the server agrees, once the save has reached it */
  await expect.poll(() => page.evaluate(id => apiFetch("GET", "/api/tasks/" + id).then(t => t.description), taskId), { timeout: 10000 }).not.toContain("zc-att:");
});

test("a reply is never deleted with the picture", async ({ page }) => {
  await signIn(page);
  await openEditor(page);
  await pasteImage(page, "#descSrc", "with-reply.png");
  await expect.poll(() => descOf(page), { timeout: 15000 }).toContain("zc-att:");
  await page.waitForTimeout(1500);   /* let the upload's own save land before editing on top of it */
  /* somebody answers the comment the picture arrived on */
  const ids = await page.evaluate(id => {
    const tk = task(id), c = tk.comments[tk.comments.length - 1];
    const out = { commentId: c.id, attId: c.attachments[0].id };
    return editTaskWith(tk, t => { t.comments.push(C(ME, 0, "internal", "Looks right to me", out.commentId)); }).then(() => out);
  }, taskId);
  await page.evaluate(([id, att]) => { const tk = task(id); return editTaskWith(tk, t => pasteDropAttachment(t, att)); }, [taskId, ids.attId]);
  const t = await page.evaluate(id => JSON.parse(JSON.stringify(task(id))), taskId);
  expect(t.comments.some(c => c.id === ids.commentId), "the comment stays because it was answered").toBe(true);
  expect(t.comments.some(c => (c.attachments || []).some(a => a.id === ids.attId)), "but the picture is gone").toBe(false);
});

test("writing typed a moment earlier is not lost when the drawer redraws", async ({ page }) => {
  await signIn(page);
  await openEditor(page);
  await page.evaluate(() => {
    const el = document.getElementById("descSrc");
    el.focus(); el.innerHTML = "<p>Typed and not yet saved</p>";
  });
  /* anything that touches the task redraws the drawer from the saved text */
  await page.evaluate(id => { const tk = task(id); editTaskWith(tk, t => { t.prio = "high"; }); }, taskId);
  await page.waitForTimeout(2200);
  expect(await descOf(page), "the sentence survived the redraw").toContain("Typed and not yet saved");
});

test("a brief field keeps its strip, with a way to add and to remove", async ({ page }) => {
  await signIn(page);
  await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; renderDrawer(); addBrief("general"); S.briefEdit = true; renderDrawer(); }, taskId);
  await expect(page.locator("[data-bf]").first()).toBeVisible();
  /* a textarea cannot hold a picture, so there is a button to add one and the strip holds it */
  await expect(page.locator(".paste-add").first()).toBeVisible();
  await pasteImage(page, "[data-bf]", "in-brief.png");
  await expect(page.locator(".paste-thumb img").first()).toBeVisible({ timeout: 15000 });
  expect(await descOf(page), "a brief image does not go into the description").not.toContain("in-brief.png");

  await page.locator(".paste-thumb-wrap").first().hover();
  await page.locator(".paste-thumb-x").first().click();
  await page.locator("#modal .btn.danger, #modal .btn.primary").first().click();
  await expect.poll(() => page.evaluate(id => task(id).comments.some(c => (c.attachments || []).some(a => a.name === "in-brief.png")), taskId), { timeout: 10000 }).toBe(false);
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try { await signIn(page); if (taskId) await page.evaluate(id => apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}), taskId); } catch {} finally { await page.close(); }
});

/* The server lets you take an attachment off your own comment — that is how the x works — but a
   task PUT may never put one onto a comment. Without that line, any editor could hang a file off
   somebody else's words. */
test("a task PUT cannot add an attachment to an existing comment", async ({ page }) => {
  await signIn(page);
  await page.evaluate(id => { openTask(id); S.drawerTab = "comments"; renderDrawer(); }, taskId);
  const cid = await page.evaluate(id => {
    const tk = task(id);
    return editTaskWith(tk, t => { t.comments.push(C(ME, 0, "internal", "Plain words, no picture", null)); })
      .then(() => task(id).comments.slice(-1)[0].id);
  }, taskId);

  const after = await page.evaluate(async ([id, commentId]) => {
    const payload = await apiFetch("GET", "/api/tasks/" + id);
    payload.comments = payload.comments.map(c => c.id === commentId
      ? Object.assign({}, c, { attachments: [{ id: "att_forged", name: "forged.png", type: "image", url: "https://example.com/forged.png" }] })
      : c);
    await apiFetch("PUT", "/api/tasks/" + id, payload);
    return apiFetch("GET", "/api/tasks/" + id);
  }, [taskId, cid]);

  const c = after.comments.find(x => x.id === cid);
  expect(c, "the comment is still there").toBeTruthy();
  expect(c.attachments || [], "nothing was hung off it").toHaveLength(0);
  expect(JSON.stringify(after)).not.toContain("forged.png");
});
