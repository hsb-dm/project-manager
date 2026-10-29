/* An asset that is already here, attached to a comment as easily as a task or a project (Oct 2026).

   • the comment box's attach menu has Asset beside Task and Project, with the assets icon, in both languages
   • in a task's comments the picker lists this task's versions and Final files first (not its files from comments,
     which are in the thread already), then the other tasks' assets in its project, then the Asset library — with
     their previews and searchable; nothing from another project
   • picking one attaches that file as it is: nothing is uploaded, it carries name, type, url, preview, size and where
     it came from, it is drawn exactly as an uploaded file with the same fields is, and it is not filed under the
     task's Assets & versions — a Final file picked into its own task stays final; editing a comment the same
   • in a project's discussion the picker lists every asset of the project (its Files tab's set), then the library
   • a task the person may not open lends no assets; on a phone the same entry is in the one attach menu
   The files are real: uploaded to this server once, at the start (this server's storage for the test only). */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const ids = {};

async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const openComments = (page, id) => page.evaluate(id => { openTask(id); S.drawerTab = "comments"; renderDrawer(); }, id || ids.a);
const openDiscussion = page => page.evaluate(id => { S.projectTab = "discussion"; go("projects", id); }, ids.p1);
/* the paperclip of a box and one of its entries */
const attach = async (page, label, box) => {
  await page.locator((box || "#drawer .composer") + " .m-attach").first().click();
  await page.locator("#ctxMenu.m-attach-menu button", { hasText: new RegExp("^\\s*" + label + "\\s*$") }).click();
};
const menuLabels = async (page, box) => { await page.locator((box || "#drawer .composer") + " .m-attach").first().click(); const l = (await page.locator("#ctxMenu.m-attach-menu button").allInnerTexts()).map(s => s.trim()); await page.evaluate(() => closePops()); return l; };
/* the picker as it reads: each heading with the names under it */
const pickerSections = page => page.locator("#entityPicker .ep-list").evaluate(list => { const out = []; for (const el of list.children) { if (el.classList.contains("mh")) out.push({ title: el.textContent.trim(), rows: [] }); else if (el.classList.contains("ep-row")) { if (!out.length) out.push({ title: "", rows: [] }); out[out.length - 1].rows.push(el.querySelector(".ep-main b").textContent.trim()); } } return out; });
/* the picker sits right above or below the paperclip it was opened from (the Asset button itself is out of sight) */
const besidePaperclip = async (page, box) => (await expect(page.locator("#entityPicker")).toBeVisible(), page.evaluate(sel => { const ep = document.getElementById("entityPicker").getBoundingClientRect(), b = document.querySelector(sel + " .m-attach").getBoundingClientRect();
  return b.width > 0 && Math.min(Math.abs(ep.bottom - b.top), Math.abs(ep.top - b.bottom)) <= 16; }, box || "#drawer .composer"));
const pick = async (page, name) => { await page.locator("#entityPicker .ep-row", { hasText: name }).first().click(); await expect(page.locator("#entityPicker")).toHaveCount(0); };
/* a task's files as Assets & versions keeps them (how long ago is left out: it is worked out again on every load) */
const filesOf = (page, id) => page.evaluate(id => task(id).files.map(f => [f.id, f.name, f.type, f.source, f.size, f.url, f.preview || null, f.driveId || null]), id || ids.a);
const watchUploads = page => { const seen = []; page.on("request", r => { const u = r.url(); if (/\/api\/files\/upload/.test(u) || (r.method() === "POST" && /\/api\/assets$/.test(u))) seen.push(u); }); return seen; };

test("setup: two projects, three tasks with versions and files uploaded once, and two library assets", async ({ page }) => {
  await signIn(page);
  const tag = Date.now().toString(36);
  Object.assign(ids, await page.evaluate(async tag => {
    const cfg = cloudOf("gdrive").config = cloudOf("gdrive").config || {}, was = cfg.storage;
    cfg.storage = "server";
    try {
      const png = (color, name) => new Promise(r => { const c = document.createElement("canvas"); c.width = 96; c.height = 64; const g = c.getContext("2d"); g.fillStyle = color; g.fillRect(0, 0, 96, 64); g.fillStyle = "#fff"; g.fillRect(20, 20, 30, 20); c.toBlob(b => r(new File([b], name, { type: "image/png" })), "image/png"); });
      const pdf = name => new File([new Uint8Array(3000).fill(7)], name, { type: "application/pdf" });
      const up = async f => uploadAny(f, { forceDrive: true });
      const proj = async name => { const id = "pk_" + Math.random().toString(36).slice(2, 9); await apiFetch("POST", "/api/projects", { id, name, status: "active", owner: ME, teams: [] }); return id; };
      const p1 = await proj("Pick project " + tag), p2 = await proj("Elsewhere project " + tag);
      const mk = async (title, pid) => (await apiFetch("POST", "/api/tasks", { title, status: WS.workflow[1].id, prio: "medium", proj: pid, assignee: ME, assignees: [ME] })).id;
      const a = await mk("Pick target " + tag, p1), b = await mk("Pick neighbour " + tag, p1), c = await mk("Pick stranger " + tag, p2);
      const poster = await up(await png("#C62828", "poster-v1.png")), brief = await up(pdf("brief-final.pdf")), shot = await up(await png("#1565C0", "moodboard.png"));
      const lib = await up(await png("#2E7D32", "logo-mark.png")), far = await up(pdf("elsewhere.pdf"));
      await reloadAll();
      /* A: version 1 is a picture with its own file (one row, the file's name); a Final file; a link handed over in a comment */
      await editTaskWith(task(a), t => { const v = V(1, ME, 0, "pending", "#7C3AED", "First cut"); v.img = poster.preview; v.driveUrl = poster.url; t.versions.push(v);
        t.files.push(F(poster.name, "image", "server", poster.size, 0, poster.url, { preview: poster.preview })); t.files.push(F(brief.name, "pdf", "server", brief.size, 0, brief.url)); });
      await editTaskWith(task(b), t => { t.files.push(F(shot.name, "image", "server", shot.size, 0, shot.url, { preview: shot.preview })); t.files.push(F("Pick shared folder", "document", "gdrive", "Link", 0, "https://drive.google.com/drive/folders/PICKFOLDER" + tag)); });
      await editTaskWith(task(c), t => { t.files.push(F(far.name, "pdf", "server", far.size, 0, far.url)); });
      const l1 = "as_pk1" + tag, l2 = "as_pk2" + tag;
      await apiFetch("POST", "/api/assets", { id: l1, name: "Logo mark " + tag, type: "logo", img: lib.preview, url: lib.url, size: lib.size, source: "server", color: "#2E7D32", tags: [] });
      await apiFetch("POST", "/api/assets", { id: l2, name: "Brand guide " + tag, type: "document", url: "https://example.org/brand-guide-" + tag + ".pdf", size: "Link", source: "link", color: "#1E5BB8", tags: [] });
      await reloadAll();
      return { tag, p1, p2, a, b, c, l1, l2, poster: poster.name, brief: brief.name, shot: shot.name, far: far.name };
    } finally { cfg.storage = was; }
  }, tag));
  /* a link handed over in A's comments: filed under A's files, from the comments */
  await openComments(page);
  await page.evaluate(tag => { window._cmtAtt = [{ name: "ref-shot-" + tag + ".pdf", url: "https://example.org/ref-shot-" + tag + ".pdf", type: "link", kind: "link", source: "link", size: "Link" }]; }, ids.tag);
  await page.locator("#cmtText").fill("A reference");
  await page.locator("#drawer .composer .bar .btn.primary").click();
  await expect.poll(() => page.evaluate(id => task(id).files.length, ids.a), { timeout: 10000 }).toBe(3);
  ids.refShot = "ref-shot-" + ids.tag + ".pdf";
  const a = await page.evaluate(id => ({ files: task(id).files.map(f => ({ name: f.name, fromComment: fileFromComment(task(id), f), url: f.url, preview: f.preview })), v: task(id).versions[0] }), ids.a);
  expect(a.files.map(f => [f.name, f.fromComment])).toEqual([[ids.poster, false], [ids.brief, false], [ids.refShot, true]]);
  expect(a.v.driveUrl).toMatch(/^\/files\/d\//);
  expect(a.v.img).toMatch(/^\/files\//);
});

test("Asset sits beside Task and Project in the attach menu, with the assets icon, in both languages", async ({ page }) => {
  await signIn(page);
  await openComments(page);
  expect(await menuLabels(page)).toEqual(["Upload images", "Upload file", "Link Google Drive", "Attach link", "Attach from library", "Task", "Project", "Asset"]);
  const btn = page.locator('#drawer .composer .cmt-tools .btn[data-ref-kind="asset"]');
  await expect(btn).toHaveAttribute("title", "Attach an asset");
  const sameIcon = el => { const d = document.createElement("div"); d.innerHTML = I.assets; return !!el && el.outerHTML === d.firstElementChild.outerHTML; };
  expect(await btn.locator("svg").evaluate(sameIcon), "the assets icon").toBe(true);
  await page.locator("#drawer .composer .m-attach").click();
  expect(await page.locator("#ctxMenu.m-attach-menu button", { hasText: /^\s*Asset\s*$/ }).locator("svg").evaluate(sameIcon), "the same in the menu").toBe(true);
  await page.evaluate(() => closePops());
  await page.evaluate(() => { UI_LANG = "id"; renderDrawer(); });
  expect((await menuLabels(page)).slice(-3)).toEqual(["Task", "Project", "Aset"]);
  await expect(btn).toHaveAttribute("title", "Lampirkan aset");
  await page.evaluate(() => { UI_LANG = "en"; renderDrawer(); });
});

test("in a task's comments: this task's own assets, then its project's other tasks', then the library — with previews", async ({ page }) => {
  await signIn(page);
  await openComments(page);
  await attach(page, "Asset");
  await expect(page.locator("#entityPicker")).toBeVisible();
  await expect(page.locator("#entityPicker .ep-search")).toHaveAttribute("placeholder", "Find an asset…");
  expect(await besidePaperclip(page), "it opens by the paperclip").toBe(true);
  const secs = await pickerSections(page);
  expect(secs.map(s => s.title)).toEqual(["This task", "Other tasks in this project", "Asset library"]);
  /* the version and its own file are one row, under the file's name; the link from the comments is not offered */
  expect(secs[0].rows).toEqual([ids.poster, ids.brief]);
  expect(secs[1].rows.sort()).toEqual([ids.shot, "Pick shared folder"].sort());
  expect(secs[2].rows).toEqual(expect.arrayContaining(["Logo mark " + ids.tag, "Brand guide " + ids.tag]));
  const all = secs.flatMap(s => s.rows);
  expect(all, "nothing from another project").not.toContain(ids.far);
  expect(all, "the task's files from its comments are in the thread already").not.toContain(ids.refShot);
  /* the pictures show themselves, a version says it is one */
  const thumb = name => page.locator("#entityPicker .ep-row", { hasText: name }).first().locator(".cma-thumb img").getAttribute("src");
  const live = await page.evaluate(x => ({ v: task(x.a).versions[0].img, shot: task(x.b).files[0].preview, logo: asset(x.l1).img }), ids);
  expect(await thumb(ids.poster)).toBe(live.v);
  expect(await thumb(ids.shot)).toBe(live.shot);
  expect(await thumb("Logo mark " + ids.tag)).toBe(live.logo);
  await expect(page.locator("#entityPicker .ep-row", { hasText: ids.poster }).first()).toContainText("Version 1");
  await expect(page.locator("#entityPicker .ep-row", { hasText: ids.brief }).first().locator(".cma-badge")).toHaveText("PDF");
  /* searching narrows every section, and a section with nothing left goes */
  await page.locator("#entityPicker .ep-search").fill("moodboard");
  expect(await pickerSections(page)).toEqual([{ title: "Other tasks in this project", rows: [ids.shot] }]);
  await page.locator("#entityPicker .ep-search").fill(ids.b);
  expect((await pickerSections(page)).map(s => s.title), "a task's id finds its assets").toEqual(["Other tasks in this project"]);
  await page.keyboard.press("Escape");
  await expect(page.locator("#entityPicker")).toHaveCount(0);
  /* Indonesian */
  await page.evaluate(() => { UI_LANG = "id"; renderDrawer(); });
  await attach(page, "Aset");
  expect((await pickerSections(page)).map(s => s.title)).toEqual(["Task ini", "Task lain di project ini", "Pustaka aset"]);
  await expect(page.locator("#entityPicker .ep-search")).toHaveAttribute("placeholder", "Cari aset…");
  await expect(page.locator("#entityPicker .ep-row", { hasText: ids.poster }).first()).toContainText("Versi 1");
  await page.keyboard.press("Escape");
  await page.evaluate(() => { UI_LANG = "en"; renderDrawer(); });
});

test("picked, an asset is attached as it is: nothing uploaded, drawn as an upload is, not filed again", async ({ page }) => {
  await signIn(page);
  const sent = watchUploads(page);
  await openComments(page);
  const before = await filesOf(page);
  await attach(page, "Asset"); await pick(page, ids.brief);
  await attach(page, "Asset"); await pick(page, ids.shot);
  await attach(page, "Asset"); await pick(page, "Brand guide " + ids.tag);
  /* the same one again: said, not attached twice; and it shows as chosen in the picker */
  await attach(page, "Asset");
  await expect(page.locator("#entityPicker .ep-row.chosen")).toHaveCount(3);
  await pick(page, ids.brief);
  await expect(page.locator("#toasts .toast", { hasText: /^Already attached$/ })).toBeVisible();
  const staged = await page.evaluate(() => JSON.parse(JSON.stringify(window._cmtAtt)));
  const live = await page.evaluate(x => ({ brief: task(x.a).files[1], shot: task(x.b).files[0], guide: asset(x.l2) }), ids);
  expect(staged).toEqual([
    { name: ids.brief, type: "pdf", url: live.brief.url, size: live.brief.size, source: "server", from: { kind: "file", task: ids.a, id: live.brief.id } },
    { name: ids.shot, type: "image", url: live.shot.url, preview: live.shot.preview, size: live.shot.size, source: "server", from: { kind: "file", task: ids.b, id: live.shot.id } },
    { name: "Brand guide " + ids.tag, type: "document", url: live.guide.url, size: "Link", source: "link", from: { kind: "library", id: ids.l2 } }
  ]);
  /* in the box: the picture by its preview, the files as chips with their remove buttons */
  const box = page.locator("#drawer .composer");
  await expect(box.locator('img[src="' + live.shot.preview + '"]')).toBeVisible();
  await expect(box.locator(".att-chip .file-chip", { hasText: ids.brief })).toBeVisible();
  await expect(box.locator(".att-chip", { hasText: "Brand guide" }).locator(".att-x")).toBeVisible();

  await page.locator("#cmtText").fill("Here are the files");
  await box.locator(".bar .btn.primary").click();
  await expect.poll(() => page.evaluate(id => task(id).comments.some(c => c.text === "Here are the files"), ids.a), { timeout: 10000 }).toBe(true);
  await page.waitForTimeout(600);
  /* saved as picked, on the server */
  const saved = await page.evaluate(async id => (await apiFetch("GET", "/api/tasks/" + id)).comments.find(c => c.text === "Here are the files").attachments, ids.a);
  expect(saved).toEqual(staged);
  /* nothing uploaded or added, and the task's Assets & versions are as they were: the Final file is still final */
  expect(sent).toEqual([]);
  expect(await filesOf(page)).toEqual(before);
  expect(await page.evaluate(id => { const t = task(id); return t.files.map(f => fileFromComment(t, f)); }, ids.a)).toEqual([false, false, true]);
  /* drawn exactly as the same files uploaded are: the comment's own drawing, which never looks at where they came from */
  const c = page.locator("#drawer .cmt", { hasText: "Here are the files" });
  await expect(c.locator('.cmt-images img[src="' + live.shot.preview + '"]')).toBeVisible();
  await expect(c.locator('.file-chip[href="' + live.brief.url + '"]')).toContainText(ids.brief);
  await expect(c.locator('[href="' + live.guide.url + '"]')).toContainText("Brand guide");
  const same = await page.evaluate(id => { const cm = task(id).comments.find(x => x.text === "Here are the files"), plain = Object.assign({}, cm, { attachments: cm.attachments.map(a => { const o = Object.assign({}, a); delete o.from; return o; }) });
    const norm = h => { const d = document.createElement("div"); d.innerHTML = h; return d.innerHTML; };
    const el = document.querySelector('#drawer .cmt[data-cid="' + cm.id + '"] > div'), drawn = el ? el.innerHTML : "";
    return { equal: commentAttachmentsHtml(cm) === commentAttachmentsHtml(plain), shown: drawn.indexOf(norm(commentAttachmentsHtml(plain))) >= 0 }; }, ids.a);
  expect(same).toEqual({ equal: true, shown: true });
  /* the Assets & versions tab: the PDF under Final files, not under From comments */
  await page.evaluate(() => { S.drawerTab = "files"; renderDrawer(); });
  await expect(page.locator("#drBody .av-sec:not(.av-from-comments)", { hasText: "Final files" }).locator(".file", { hasText: ids.brief })).toBeVisible();
  await expect(page.locator("#drBody .av-from-comments .file", { hasText: ids.brief })).toHaveCount(0);
  /* the picture opens as an uploaded one does */
  await openComments(page);
  await page.locator("#drawer .cmt", { hasText: "Here are the files" }).locator(".cmt-images .cmt-img").first().click();
  await expect(page.locator("#modalWrap.open")).toBeVisible();
  await page.evaluate(() => closeModal());
});

test("editing a comment: an asset picked there is not filed either", async ({ page }) => {
  await signIn(page);
  await openComments(page);
  const before = await filesOf(page);
  const cid = await page.evaluate(id => task(id).comments.find(c => c.text === "Here are the files").id, ids.a);
  await page.evaluate(cid => cmtEditStart(cid), cid);
  const ed = "#drawer .cmt-edit-box";
  await expect(page.locator(ed)).toBeVisible();
  await attach(page, "Asset", ed); await pick(page, ids.poster);
  await page.locator(ed + " .bar .btn.primary").click();
  await expect.poll(() => page.evaluate(([id, cid]) => (task(id).comments.find(c => c.id === cid) || {}).attachments.length, [ids.a, cid]), { timeout: 10000 }).toBe(4);
  const v = await page.evaluate(([id, cid]) => { const t = task(id); return { last: t.comments.find(c => c.id === cid).attachments[3], v: t.versions[0] }; }, [ids.a, cid]);
  expect(v.last).toEqual({ name: ids.poster, type: "image", url: v.v.driveUrl, preview: v.v.img, size: expect.any(String), source: "server", from: { kind: "version", task: ids.a, v: 1 } });
  expect(await filesOf(page)).toEqual(before);
});

test("in a project's discussion: every asset of the project, as its Files tab lists them, then the library", async ({ page }) => {
  await signIn(page);
  const sent = watchUploads(page);
  await openDiscussion(page);
  const box = "#content .pd-box .composer";
  await expect(page.locator(box)).toBeVisible();
  expect((await menuLabels(page, box)).slice(-3)).toEqual(["Task", "Project", "Asset"]);
  await attach(page, "Asset", box);
  expect(await besidePaperclip(page, box), "by this box's paperclip").toBe(true);
  const secs = await pickerSections(page);
  expect(secs.map(s => s.title)).toEqual(["This project", "Asset library"]);
  /* the Files tab's set: each task's versions and files — the link from A's comments too — and nothing of another project */
  expect(secs[0].rows.sort()).toEqual([ids.poster, ids.brief, ids.refShot, ids.shot, "Pick shared folder"].sort());
  expect(secs.flatMap(s => s.rows)).not.toContain(ids.far);
  await expect(page.locator("#entityPicker .ep-row", { hasText: ids.shot }).first()).toContainText(ids.b);
  await pick(page, ids.poster);
  await page.locator("#pdText").fill("Use this cut");
  await page.locator("#pdText").press("Enter");
  await expect(page.locator("#content .pd-box .cmt", { hasText: "Use this cut" }).locator(".cmt-images img")).toBeVisible();
  const saved = await page.evaluate(async pid => (await apiFetch("GET", "/api/projects/" + pid + "/comments?limit=20")).comments.find(c => c.text === "Use this cut").attachments, ids.p1);
  expect(saved).toHaveLength(1);
  expect(saved[0].from).toEqual({ kind: "version", task: ids.a, v: 1 });
  expect(saved[0].url).toMatch(/^\/files\/d\//);
  expect(sent).toEqual([]);
});

test("a task the person may not open lends none of its assets", async ({ page }) => {
  await signIn(page);
  await page.evaluate(b => { window.__viewTask = canI.viewTask; canI.viewTask = t => t.id !== b; }, ids.b);
  try {
    await openComments(page);
    await attach(page, "Asset");
    expect((await pickerSections(page)).map(s => s.title)).toEqual(["This task", "Asset library"]);
    await page.keyboard.press("Escape");
    await page.evaluate(() => closeDrawer());
    await openDiscussion(page);
    await attach(page, "Asset", "#content .pd-box .composer");
    const rows = (await pickerSections(page))[0].rows;
    expect(rows).not.toContain(ids.shot);
    expect(rows).not.toContain("Pick shared folder");
    expect(rows).toContain(ids.brief);
    await page.keyboard.press("Escape");
  } finally { await page.evaluate(() => { if (window.__viewTask) canI.viewTask = window.__viewTask; else delete canI.viewTask; }); }
});

test("on a phone the Asset entry is in the one attach menu, and picks the same way", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await openComments(page);
  await page.locator("#drawer .composer .m-attach").scrollIntoViewIfNeeded();
  expect((await menuLabels(page)).slice(-3)).toEqual(["Task", "Project", "Asset"]);
  await attach(page, "Asset");
  const ep = page.locator("#entityPicker");
  await expect(ep).toBeVisible();
  const r = await ep.boundingBox();
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.x + r.width).toBeLessThanOrEqual(390);
  expect(await besidePaperclip(page), "by the paperclip").toBe(true);
  await pick(page, ids.shot);
  await expect(page.locator('#drawer .composer img[src="' + (await page.evaluate(b => task(b).files[0].preview, ids.b)) + '"]')).toBeVisible();
  await page.evaluate(() => { window._cmtAtt = []; renderDrawer(); });
});

test("cleanup", async ({ page }) => {
  await signIn(page);
  await page.evaluate(async x => {
    for (const id of [x.a, x.b, x.c]) await apiFetch("DELETE", "/api/tasks/" + id).catch(() => {});
    for (const id of [x.p1, x.p2]) await apiFetch("DELETE", "/api/projects/" + id).catch(() => {});
    for (const id of [x.l1, x.l2]) await apiFetch("DELETE", "/api/assets/" + id).catch(() => {});
  }, ids);
  await page.evaluate(() => reloadAll());
  expect(await page.evaluate(x => [x.a, x.b, x.c].filter(id => task(id)).length + [x.p1, x.p2].filter(id => project(id)).length + [x.l1, x.l2].filter(id => asset(id)).length, ids)).toBe(0);
});
