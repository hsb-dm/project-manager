/* How much room a task gets to be read in.

   • A picture in the writing arrives at a quarter of the column and can be resized from its corner.
   • Expand folds the header down to its top line so the tab's contents fill the panel; Collapse
     brings every field back. Auto-expand, in the gear menu, opens every task that way.
   • A centred panel is one size whatever tab is open. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
let taskId = null, plainId = null;

async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
/* How a picture arrives is covered by paste-image.spec and paste-image-inline.spec; this spec
   hands it to the same function those drive, because what is checked here is its size. */
async function attachImage(page, name) {
  const ok = await page.evaluate(async fname => {
    const c = document.createElement("canvas"); c.width = 400; c.height = 400;
    const x = c.getContext("2d"); x.fillStyle = "#1F4FD8"; x.fillRect(0, 0, 400, 400);
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    document.getElementById("descSrc").focus();
    return briefPasteImage(new File([blob], fname, { type: "image/png" }));
  }, name);
  if (!ok) throw new Error("the image was not taken in");
}
const descOf = page => page.evaluate(id => task(id).description || "", taskId);
const openEditor = async page => {
  await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; S.descMode = "editor"; renderDrawer(); }, taskId);
  await expect(page.locator("#descSrc")).toBeVisible();
};
const bodyHeight = page => page.locator("#drBody").evaluate(el => Math.round(el.getBoundingClientRect().height));
const shown = (page, sel) => page.locator(sel).first().isVisible().catch(() => false);
/* Point at the picture's bottom-right corner, scrolling it into view first — the way a person
   reaches the resize handle of a picture taller than the panel. */
async function hoverCorner(page) {
  await page.evaluate(() => {
    document.querySelector("#descSrc img.desc-img").scrollIntoView({ block: "end" });
    document.getElementById("drBody").scrollTop += 40;   /* clear of the footer */
  });
  /* The panel scrolls smoothly. A picture that slides under a pointer which is not moving gets no
     mouseover — in any browser — so wait for the scroll to stop before pointing at it. */
  let last = -1;
  for (let n = 0; n < 40; n++) {
    const top = await page.evaluate(() => document.getElementById("drBody").scrollTop);
    if (top === last) break;
    last = top; await page.waitForTimeout(50);
  }
  const pt = await page.evaluate(() => { const r = document.querySelector("#descSrc img.desc-img").getBoundingClientRect(); return { x: r.right - 40, y: r.bottom - 40 }; });
  await page.mouse.move(pt.x - 6, pt.y - 6);
  await page.mouse.move(pt.x, pt.y);
  await page.waitForTimeout(120);
}

test("two tasks: one with a brief and a picture in it, one with neither", async ({ page }) => {
  await signIn(page);
  /* The storage tests leave the workspace pointed at Drive, which no e2e run can reach. Say where
     files go rather than inherit whatever the spec before this one left behind. */
  await page.evaluate(() => { if (typeof stoSet === "function" && storageMode() !== "server") stoSet("server"); });
  await expect.poll(() => page.evaluate(() => storageMode())).toBe("server");
  await page.goto("/projects"); await ready(page);
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.locator("#np_name").fill("Panel project");
  await page.locator("#modal .btn.primary").click();
  await expect.poll(() => page.evaluate(() => !!PROJECTS.find(p => p.name === "Panel project"))).toBe(true);
  page.on("pageerror", e => console.log("[pageerror]", e.message));
  for (const title of ["Panel target", "Panel plain"]) {
    console.log("CREATING", title, await page.evaluate(() => JSON.stringify({ drawer: S.drawerTask, titles: TASKS.map(t => t.title + (t._draft ? "*" : "")) })));
    await page.evaluate(t => { newTaskModal({ title: t, proj: PROJECTS.find(p => p.name === "Panel project").id, assignee: ME }); createDraft(); }, title);
    await expect.poll(() => page.evaluate(t => TASKS.some(x => x.title === t && !x._draft), title), { timeout: 15000 }).toBe(true);
    console.log("AFTER", title, await page.evaluate(() => JSON.stringify({ drawer: S.drawerTask, open: (task(S.drawerTask) || {}).title, toasts: (document.getElementById("toasts") || {}).textContent })));
  }
  taskId = await page.evaluate(() => TASKS.find(t => t.title === "Panel target" && !t._draft).id);
  plainId = await page.evaluate(() => TASKS.find(t => t.title === "Panel plain" && !t._draft).id);
  await openEditor(page);
  await page.evaluate(() => { const el = document.getElementById("descSrc"); el.innerHTML = "<p>Line one</p><p>Line two</p><p>Line three</p>"; });
  await attachImage(page, "banner.png");
  await expect(page.locator("#descSrc img.desc-img")).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1200);
});

/* ---------- the picture ---------- */

test("a picture arrives at a quarter of the column, and says so in the text", async ({ page }) => {
  await signIn(page);
  await openEditor(page);
  const img = page.locator("#descSrc img.desc-img").first();
  const host = await page.locator("#descSrc").boundingBox(), r = await img.boundingBox();
  expect(r.width / host.width, "about a quarter of the writing").toBeGreaterThan(0.18);
  expect(r.width / host.width).toBeLessThan(0.32);
  expect(await descOf(page)).toMatch(/ =25%\)/);
});

test("the corner handle carries a resize icon and sits on the corner", async ({ page }) => {
  await signIn(page);
  await openEditor(page);
  const img = page.locator("#descSrc img.desc-img").first();
  await img.hover();
  const handle = page.locator("#descImgSize");
  await expect(handle).toBeVisible();
  expect(await handle.locator("svg path").count(), "an icon, not a blank square").toBeGreaterThan(0);
  const h = await handle.boundingBox(), r = await img.boundingBox();
  expect(Math.abs(h.x + h.width - (r.x + r.width)), "at the bottom-right of the picture").toBeLessThan(10);
  expect(Math.abs(h.y + h.height - (r.y + r.height))).toBeLessThan(10);
});

test("dragging the corner resizes it, and that is what gets saved", async ({ page }) => {
  await signIn(page);
  await openEditor(page);
  const img = page.locator("#descSrc img.desc-img").first();
  await img.hover();
  const before = (await img.boundingBox()).width;
  const h = await page.locator("#descImgSize").boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 220, h.y + h.height / 2, { steps: 8 });
  await page.mouse.up();
  expect((await img.boundingBox()).width, "the picture really grew").toBeGreaterThan(before + 100);

  await expect.poll(() => descOf(page), { timeout: 10000 }).not.toMatch(/ =25%\)/);
  const saved = await page.evaluate(id => apiFetch("GET", "/api/tasks/" + id), taskId);
  const pct = +(saved.description.match(/=(\d{1,3})%/) || [])[1];
  expect(pct, "a new width, from the server").toBeGreaterThan(25);
  await page.reload(); await ready(page);
  await openEditor(page);
  expect(await page.locator("#descSrc img.desc-img").first().evaluate(i => i.style.width)).toBe(pct + "%");
});

test("a tap with no drag steps up through the sizes and round again", async ({ page }) => {
  await signIn(page);
  await openEditor(page);
  const img = page.locator("#descSrc img.desc-img").first();
  /* start from the size a picture arrives at */
  await page.evaluate(() => { const i = document.querySelector("#descSrc img.desc-img"); pasteSetImageWidth(i, 25); });
  const seen = [];
  for (let i = 0; i < 4; i++) {
    await hoverCorner(page);
    await page.locator("#descImgSize").click();
    await page.waitForTimeout(250);
    seen.push(await img.evaluate(e => e.style.width || "100%"));
  }
  expect(seen).toEqual(["50%", "75%", "100%", "25%"]);
});

test("the read-only view keeps the size and offers no handles", async ({ page }) => {
  await signIn(page);
  await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; S.descMode = "viewer"; renderDrawer(); }, taskId);
  const img = page.locator(".md-view img.desc-img").first();
  await expect(img).toBeVisible();
  expect(await img.evaluate(i => i.style.width)).toBe("25%");
  await img.hover();
  expect(await shown(page, "#descImgSize")).toBe(false);
  expect(await shown(page, "#descImgX")).toBe(false);
});

/* The bug in the screenshot: the x scrolled under the header and was clipped, and from then on
   nothing ever moved or hid the resize square, which was left floating over the page. */
test("neither button is ever left floating where there is no picture", async ({ page }) => {
  await signIn(page);
  await openEditor(page);
  await page.evaluate(() => { const i = document.querySelector("#descSrc img.desc-img"); pasteSetImageWidth(i, 60); });
  await hoverCorner(page);
  await expect(page.locator("#descImgSize")).toBeVisible();

  /* scroll through every position, checking each button against the picture it belongs to */
  const max = await page.evaluate(() => { const b = document.getElementById("drBody"); return b.scrollHeight - b.clientHeight; });
  for (let y = 0; y <= max + 40; y += 30) {
    const bad = await page.evaluate(top => {
      const b = document.getElementById("drBody"); b.scrollTop = top;
      b.dispatchEvent(new Event("scroll"));
      const i = document.querySelector("#descSrc img.desc-img").getBoundingClientRect();
      const body = b.getBoundingClientRect();
      const out = [];
      ["descImgX", "descImgSize"].forEach(id => {
        const el = document.getElementById(id);
        if (!el || !el.classList.contains("on")) return;
        const r = el.getBoundingClientRect();
        const onPicture = r.left >= i.left - 2 && r.right <= i.right + 2 && r.top >= i.top - 2 && r.bottom <= i.bottom + 2;
        const inPanel = r.top >= body.top - 2 && r.bottom <= body.bottom + 2;
        if (!onPicture || !inPanel) out.push(id + "@" + Math.round(r.top) + " pic " + Math.round(i.top) + "-" + Math.round(i.bottom) + " body " + Math.round(body.top) + "-" + Math.round(body.bottom));
      });
      return out;
    }, y);
    expect(bad, "at scroll " + y).toEqual([]);
  }

  /* and leaving the picture takes both away */
  await page.mouse.move(5, 5);
  await page.waitForTimeout(400);
  expect(await shown(page, "#descImgX")).toBe(false);
  expect(await shown(page, "#descImgSize")).toBe(false);
});

/* ---------- expand ---------- */

test("Expand folds the header to its top line and gives the tab the room; Collapse brings it back", async ({ page }) => {
  await signIn(page);
  await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; renderDrawer(); }, taskId);
  await page.waitForTimeout(300);
  const normal = await bodyHeight(page);
  await expect(page.locator(".dr-head .meta").first(), "the fields are there to begin with").toBeVisible();

  const btn = page.locator(".tab-expand");
  await expect(btn, "the button sits in the tab row").toBeVisible();
  await expect(btn).toHaveText("Expand");
  await btn.click();
  await page.waitForTimeout(300);

  for (const sel of [".dr-title", ".dr-head .meta", ".task-tags-bottom"]) expect(await shown(page, sel), sel + " is folded away").toBe(false);
  await expect(page.locator(".dr-top"), "the top line stays").toBeVisible();
  await expect(page.locator(".dr-head .tabs"), "and so do the tabs").toBeVisible();
  expect(await bodyHeight(page), "the tab's contents get the space").toBeGreaterThan(normal + 150);
  await expect(page.locator(".tab-expand")).toHaveText("Collapse");
  await expect(page.locator(".tab-expand")).toHaveAttribute("aria-pressed", "true");

  await page.locator(".tab-expand").click();
  await page.waitForTimeout(300);
  await expect(page.locator(".dr-head .meta").first()).toBeVisible();
  expect(await bodyHeight(page), "back to how it was").toBe(normal);
  await expect(page.locator(".tab-expand")).toHaveText("Expand");
});

/* The tab row scrolls sideways to fit a phone, and CSS then made it scroll up and down as well:
   each tab reached 1px below the row, enough for a vertical scrollbar with arrows at its end. */
test("the tab row never scrolls up and down", async ({ page }) => {
  await signIn(page);
  await page.evaluate(id => { openTask(id); renderDrawer(); }, taskId);
  const check = () => page.locator(".dr-head .tabs").evaluate(el => ({
    overflowY: getComputedStyle(el).overflowY, extra: el.scrollHeight - el.clientHeight }));
  for (const state of ["normal", "expanded"]) {
    const r = await check();
    expect(r.extra, state + ": nothing below the row to scroll to").toBeLessThanOrEqual(0);
    expect(r.overflowY, state).toBe("hidden");
    if (state === "normal") await page.locator(".tab-expand").click();
  }
  await page.locator(".tab-expand").click();
  /* the active tab's underline is still drawn, inside the row */
  const line = await page.locator(".dr-head .tab.on").evaluate(el => getComputedStyle(el).borderBottomWidth);
  expect(line).toBe("2px");
});

test("expanded still works on every tab", async ({ page }) => {
  await signIn(page);
  await page.evaluate(id => { openTask(id); S.drawerTab = "brief"; renderDrawer(); }, taskId);
  await page.locator(".tab-expand").click();
  for (const tab of ["files", "comments", "activity", "brief"]) {
    await page.evaluate(t => setTab(t), tab);
    expect(await shown(page, ".dr-head .meta"), tab + " stays expanded").toBe(false);
  }
  await page.locator(".tab-expand").click();
});

test("the labels are in Indonesian when the app is", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => { UI_LANG = "id"; });
  await page.evaluate(id => { openTask(id); renderDrawer(); }, taskId);
  await expect(page.locator(".tab-expand")).toHaveText("Perbesar");
  /* not "Buka", which is what tr("Expand") gives — a different word for a different thing */
  await page.locator(".tab-expand").click();
  await expect(page.locator(".tab-expand")).toHaveText("Perkecil");
  await expect(page.locator(".tab-expand")).toHaveAttribute("title", "Tampilkan lagi detail task");
  await page.locator(".tab-expand").click();
  await page.locator('[data-tour="task-settings"]').click();
  await expect(page.locator(".gear-toggle")).toHaveText("Auto perbesar");
  await page.keyboard.press("Escape");
  await page.evaluate(() => { UI_LANG = "en"; });
});

test("a centred panel is one size whatever tab is open", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => document.documentElement.setAttribute("data-task-panel", "center"));
  await page.evaluate(id => { openTask(id); renderDrawer(); }, taskId);
  await page.waitForTimeout(400);
  const heights = [];
  for (const tab of ["brief", "files", "comments", "activity"]) {
    await page.evaluate(t => setTab(t), tab);
    await page.waitForTimeout(150);
    heights.push(Math.round((await page.locator("#drawer").boundingBox()).height));
  }
  expect(new Set(heights).size, "heights per tab: " + heights.join(", ")).toBe(1);
  await page.evaluate(() => applyTaskPanelPosition());
});

/* ---------- auto-expand ---------- */

test("Auto-expand is off until switched on; then every task opens expanded, but never a new one", async ({ page }) => {
  await signIn(page);
  await page.evaluate(id => { openTask(id); renderDrawer(); }, taskId);
  await expect(page.locator(".dr-head .meta").first(), "off: the fields show").toBeVisible();

  await page.locator('[data-tour="task-settings"]').click();
  const sw = page.locator(".gear-toggle");
  await expect(sw, "one line in the gear menu").toHaveText("Auto-expand");
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await page.waitForTimeout(300);
  expect(await shown(page, ".dr-head .meta"), "the open task expands at once").toBe(false);

  /* another task — with or without a brief — opens expanded */
  await page.evaluate(id => { openTask(id); renderDrawer(); }, plainId);
  await page.waitForTimeout(300);
  expect(await shown(page, ".dr-head .meta"), "the next task opens expanded").toBe(false);

  /* a task being created keeps its title and fields: they are what is being filled in */
  await page.evaluate(() => newTaskModal({}));
  await expect(page.locator(".dr-title")).toBeVisible();
  await expect(page.locator(".dr-head .meta").first()).toBeVisible();
  expect(await page.locator(".tab-expand").count(), "and has no expand button").toBe(0);
  await page.evaluate(() => discardDraft());

  /* the preference outlives the page */
  await page.reload(); await ready(page);
  await page.evaluate(id => { openTask(id); renderDrawer(); }, taskId);
  await page.waitForTimeout(300);
  expect(await shown(page, ".dr-head .meta"), "still on after a reload").toBe(false);

  /* and Collapse still works on a task that opened expanded */
  await page.locator(".tab-expand").click();
  await expect(page.locator(".dr-head .meta").first()).toBeVisible();

  /* switch it off and leave nothing behind */
  await page.locator('[data-tour="task-settings"]').click();
  await page.locator(".gear-toggle").click();
  await page.evaluate(id => { openTask(id); renderDrawer(); }, plainId);
  await expect(page.locator(".dr-head .meta").first(), "off again: tasks open as before").toBeVisible();
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await signIn(page);
    for (const id of [taskId, plainId]) if (id) await page.evaluate(i => apiFetch("DELETE", "/api/tasks/" + i).catch(() => {}), id);
  } catch {} finally { await page.close(); }
});
