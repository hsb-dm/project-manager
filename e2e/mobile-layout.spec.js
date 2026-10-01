/* Phone and tablet layout: the four things that made the app awkward to use on a phone.

   Chromium's device emulation gives real viewport sizes and touch events, but not Safari's own
   behaviour — it never auto-zooms into a small field. So the zoom fix is checked at its cause (the
   page declares its scale while a field is focused) rather than by watching the page zoom. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const PHONE = { width: 390, height: 844 };
const TABLET = { width: 834, height: 1112 };

async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}

test.describe("phone", () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test("a new task can be given a title", async ({ page }) => {
    await signIn(page);
    await page.evaluate(() => newTaskModal({}));
    const title = page.locator(".dr-title");
    await expect(title).toBeVisible();

    /* The cause: a contenteditable laid out as a -webkit-box takes no caret on iOS, and an empty
       one has not even a letter to tap. Clamping is for titles being read, not written. */
    const box = await title.evaluate(el => {
      const cs = getComputedStyle(el);
      return { display: cs.display, clamp: cs.webkitLineClamp, h: el.getBoundingClientRect().height };
    });
    expect(box.display, "not a -webkit-box while it can be edited").not.toBe("-webkit-box");
    expect(["none", "", "auto"], "and not clamped").toContain(String(box.clamp));
    expect(box.h, "a tap target even when empty").toBeGreaterThan(18);

    /* and it comes to rest on screen, not pushed off the right edge (the drawer slides in) */
    await expect.poll(async () => { const r = await title.boundingBox(); return Math.round(r.x + r.width); }).toBeLessThanOrEqual(PHONE.width + 1);
    expect((await title.boundingBox()).x).toBeGreaterThanOrEqual(0);

    await title.tap();
    await page.keyboard.type("Made on a phone");
    await page.evaluate(() => createDraft());
    await expect.poll(() => page.evaluate(() => TASKS.some(t => t.title === "Made on a phone" && !t._draft))).toBe(true);
    await page.evaluate(() => { const t = TASKS.find(x => x.title === "Made on a phone"); if (t) apiFetch("DELETE", "/api/tasks/" + t.id).catch(() => {}); });
  });

  test("focusing a field tells the browser not to zoom, and lets go afterwards", async ({ page }) => {
    await signIn(page);
    const content = () => page.evaluate(() => document.querySelector('meta[name="viewport"]').getAttribute("content"));
    /* signing in leaves the password field focused, which is itself a field worth not zooming into */
    await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
    await expect.poll(content, { timeout: 3000 }).not.toContain("maximum-scale");

    await page.evaluate(() => { const i = document.createElement("input"); i.id = "zoomProbe"; document.body.appendChild(i); i.focus(); });
    await expect.poll(content).toContain("maximum-scale=1");

    await page.evaluate(() => { document.getElementById("zoomProbe").blur(); });
    await expect.poll(content, { timeout: 3000 }).not.toContain("maximum-scale");
    /* a button is not a keyboard, so it must not lock anything */
    await page.evaluate(() => { const b = document.createElement("button"); b.id = "btnProbe"; document.body.appendChild(b); b.focus(); });
    await page.waitForTimeout(250);
    expect(await content()).not.toContain("maximum-scale");
    await page.evaluate(() => { ["zoomProbe", "btnProbe"].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); });
  });

  test("every control in the AI panel header fits on screen", async ({ page }) => {
    await signIn(page);
    await page.evaluate(() => aiChatToggle(true));
    await expect(page.locator(".aichat.open .aichat-head")).toBeVisible();
    const head = await page.locator(".aichat-head").boundingBox();
    const btns = await page.locator(".aichat-head .iconbtn").all();
    expect(btns.length, "there are several").toBeGreaterThan(2);
    for (const b of btns) {
      const r = await b.boundingBox();
      expect(r.x, "not pushed off the left").toBeGreaterThanOrEqual(head.x - 1);
      expect(r.x + r.width, "nor cut off on the right").toBeLessThanOrEqual(head.x + head.width + 1);
      expect(r.width, "and smaller than the desktop size").toBeLessThanOrEqual(32);
    }
    await page.screenshot({ path: "e2e/results/phone-aichat.png" });
    await page.evaluate(() => aiChatToggle(false));
  });

  test("the message composer is one row, and the reading area gets the space", async ({ page }) => {
    await signIn(page);
    await page.goto("/messages"); await ready(page);
    /* a conversation to read: messages need somebody on the other side */
    const cid = await page.evaluate(async () => {
      let id = Object.keys(PEOPLE).find(p => PEOPLE[p].email === "mate@e2e.test");
      if (!id) id = (await apiFetch("POST", "/api/members", { id: "mate", name: "Mate Mobile", email: "mate@e2e.test", perm: "member", ini: "MM", teams: [] })).id;
      return (await apiFetch("POST", "/api/messages/conversations", { type: "DM", members: [id] })).id;
    });
    await page.goto("/messages/" + cid); await ready(page);
    const composer = page.locator(".msg-composer").first();
    await expect(composer).toBeVisible();

    expect(await page.locator(".msg-quick").first().isVisible().catch(() => false), "the duplicate shortcut row is gone").toBe(false);
    /* everything it offered is still reachable from the + beside the box */
    await page.locator(".msg-input>button").first().click();
    const menu = page.locator(".menu, #popMenu, [role=menu]").last();
    const text = await menu.innerText();
    ["Task", "Google Drive", "Upload / File", "AI Assist"].forEach(label => expect(text, label + " is still there").toContain(label));
    await page.keyboard.press("Escape");

    /* one row: every button shares the box's line rather than sitting under it */
    const shared = await page.locator(".msg-input").evaluate(el => {
      const ta = el.querySelector("textarea").getBoundingClientRect();
      return Array.from(el.children)
        .filter(c => !c.contains(el.querySelector("textarea")) && c.getBoundingClientRect().height > 0)
        .every(c => {
          const r = c.getBoundingClientRect(), mid = r.top + r.height / 2;
          return mid >= ta.top - 2 && mid <= ta.bottom + 2;
        });
    });
    expect(shared, "the composer is a single line").toBe(true);

    const timeline = await page.locator(".msg-timeline").first().boundingBox();
    const comp = await composer.boundingBox();
    console.log("COMPOSER", comp.height, "TIMELINE", timeline.height);
    expect(comp.height, "the composer is small").toBeLessThan(110);
    expect(timeline.height, "and the reading area gets most of the panel").toBeGreaterThan(comp.height * 4);
    await page.screenshot({ path: "e2e/results/phone-messages.png" });
  });
});

test.describe("tablet", () => {
  test.use({ viewport: TABLET, hasTouch: true, isMobile: true });

  test("a new task can be given a title here too", async ({ page }) => {
    await signIn(page);
    await page.evaluate(() => newTaskModal({}));
    const title = page.locator(".dr-title");
    await expect(title).toBeVisible();
    expect(await title.evaluate(el => getComputedStyle(el).display)).not.toBe("-webkit-box");
    await title.tap();
    await page.keyboard.type("Made on a tablet");
    await page.evaluate(() => createDraft());
    await expect.poll(() => page.evaluate(() => TASKS.some(t => t.title === "Made on a tablet" && !t._draft))).toBe(true);
    await page.evaluate(() => { const t = TASKS.find(x => x.title === "Made on a tablet"); if (t) apiFetch("DELETE", "/api/tasks/" + t.id).catch(() => {}); });
  });
});
