/* What floats sits above the dialogs it can be opened from.

   The tag list of New project opened behind the dialog (180 under 200) and could not be clicked.
   Every layer now follows one order (src/v38.css): menus, popovers and the tag list above dialogs,
   the person picker above those. A dialog closes whatever menu was left open when it opens. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);

async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
/* is the element on top at the middle of this box part of the box? */
const onTop = (page, sel) => page.evaluate(s => { const el = document.querySelector(s); if (!el) return "missing"; const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 20)); return el.contains(hit) ? true : (hit && (hit.id || hit.className)) || "nothing"; }, sel);

test("every floating layer sits above the dialogs", async ({ page }) => {
  await signIn(page);
  const z = await page.evaluate(() => {
    const probe = (cls, id) => { const el = document.createElement("div"); el.className = cls; if (id) el.id = id; el.style.display = "block"; document.body.appendChild(el); const v = +getComputedStyle(el).zIndex; el.remove(); return v; };
    return { modal: +getComputedStyle(document.getElementById("modalWrap")).zIndex, drawer: +getComputedStyle(document.getElementById("drawer")).zIndex,
      pop: probe("pop"), menu: probe("menu"), tagList: probe("tag-picker-pop"), linkCard: probe("link-card"), picker: probe("menu", "entityPickerProbe") };
  });
  for (const k of ["pop", "menu", "tagList", "linkCard", "picker"]) expect(z[k], k + " above dialogs").toBeGreaterThan(z.modal);
  expect(z.modal).toBeGreaterThan(z.drawer);
});

test("the tag list of New project opens above the dialog, and a tag can be picked", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => { WS.tags = (WS.tags || []).concat(["layercheck"]); go("projects"); newProjectModal(); });
  await page.locator("#modal .tag-picker-add").click();
  await expect(page.locator("#tagPickPop.open")).toBeVisible();
  expect(await onTop(page, "#tagPickPop.open"), "nothing covers the list").toBe(true);
  await page.locator("#tagPickSearch").fill("layercheck");
  const opt = page.locator("#tagPickPop .tag-opt", { hasText: "layercheck" });
  expect(await onTop(page, "#tagPickPop .tag-opt")).toBe(true);
  await opt.click();
  await expect.poll(() => page.evaluate(() => tagPickerValues("np_tags"))).toContain("layercheck");
  await page.evaluate(() => { tagPickerClose(); closeModal(); });
});

test("a menu left open is closed when a dialog opens", async ({ page }) => {
  await signIn(page);
  await page.locator("#meBtn").click();
  await expect(page.locator(".menu.open")).toHaveCount(1);
  await page.evaluate(() => openModal("Check", "<p>body</p>"));
  await expect(page.locator(".menu.open, .pop.open")).toHaveCount(0);
  await page.evaluate(() => closeModal());
});
