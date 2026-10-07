/* Changing a photo that is already there. Clicking the photo opens its menu (View, Change, Remove photo) —
   the click that opened it used to close it at once, so a photo, once set, could not be changed or
   removed. From Settings → Profile, from one's own profile, and an admin on a colleague's profile. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const picture = (page, color) => page.evaluate(c => { const cv = document.createElement("canvas"); cv.width = 500; cv.height = 400; const g = cv.getContext("2d"); g.fillStyle = c; g.fillRect(0, 0, 500, 400); return cv.toDataURL("image/jpeg", 0.9); }, color).then(u => Buffer.from(u.split(",")[1], "base64"));
/* the colour at the middle of someone's saved photo */
const middle = (page, id) => page.evaluate(i => new Promise(r => { const im = new Image(); im.onload = () => { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0); const d = g.getImageData(im.width >> 1, im.height >> 1, 1, 1).data; r(d[0] > 150 && d[2] < 100 ? "red" : d[2] > 150 && d[0] < 100 ? "blue" : d[1] > 120 ? "green" : "other"); }; im.onerror = () => r("none"); im.src = PEOPLE[i].avatar || ""; }), id);

async function change(page, host, color) {
  const chooser = page.waitForEvent("filechooser");
  await page.locator(host + " .mp-avatar").first().click();
  const menu = page.locator("#ctxMenu.open");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button")).toHaveText(["View photo", "Change photo", "Remove photo"]);
  await menu.getByRole("button", { name: "Change photo" }).click();
  await (await chooser).setFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: await picture(page, color) });
  await expect(page.locator("#modalWrap.open #avcView")).toBeVisible();
  await page.locator("#avcSave").click();
}

test("Settings → Profile: a photo that is there can be changed, looked at and removed", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => go("settings", "profile"));
  /* none yet: a click goes straight to choosing one */
  await page.evaluate(() => { PEOPLE[ME].avatar = ""; return persistPerson(ME, false); });
  await page.evaluate(() => renderScreen(false));
  const first = page.waitForEvent("filechooser");
  await page.locator("#content .mp-avatar").first().click();
  await (await first).setFiles({ name: "a.jpg", mimeType: "image/jpeg", buffer: await picture(page, "#00a000") });
  await page.locator("#avcSave").click();
  await expect.poll(() => middle(page, "admin")).toBe("green");
  /* there is one now: change it */
  await change(page, "#content", "#d00000");
  await expect.poll(() => middle(page, "admin")).toBe("red");
  await expect.poll(() => page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => (d.people[ME].avatar || "").length))).toBeGreaterThan(100);
  /* look at it */
  await page.locator("#content .mp-avatar").first().click();
  await page.locator("#ctxMenu.open").getByRole("button", { name: "View photo" }).click();
  await expect(page.locator("#modalWrap.open #modal .modal-body img")).toHaveAttribute("src", /^data:image\/jpeg/);
  await page.evaluate(() => closeModal());
  /* remove it */
  await page.locator("#content .mp-avatar").first().click();
  await page.locator("#ctxMenu.open").getByRole("button", { name: "Remove photo" }).click();
  await expect.poll(() => page.evaluate(() => PEOPLE[ME].avatar || "")).toBe("");
  /* gone: a click goes straight to choosing one again */
  const again = page.waitForEvent("filechooser");
  await page.locator("#content .mp-avatar").first().click();
  await (await again).setFiles({ name: "b.jpg", mimeType: "image/jpeg", buffer: await picture(page, "#0000d0") });
  await page.locator("#avcSave").click();
  await expect.poll(() => middle(page, "admin")).toBe("blue");
  /* the menu speaks Indonesian too */
  await page.evaluate(() => setLanguage("id"));
  await page.locator("#content .mp-avatar").first().click();
  await expect(page.locator("#ctxMenu.open").getByRole("button")).toHaveText(["Lihat foto", "Ganti foto", "Hapus foto"]);
  await page.evaluate(() => { closePops(); setLanguage("en"); });
});

test("one's own profile, and an admin on a colleague's profile", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => go("team", ME));
  await change(page, "#content", "#00a000");
  await expect.poll(() => middle(page, "admin")).toBe("green");
  const id = await page.evaluate(async () => { const t = Date.now().toString(36); await apiFetch("POST", "/api/members", { name: "Photo Mate " + t, email: "photomate-" + t + "@e2e.test", perm: "member", cap: 40 }); await reloadAll(); return Object.keys(PEOPLE).find(k => PEOPLE[k].email === "photomate-" + t + "@e2e.test"); });
  try {
    const p2 = await picture(page, "#d00000");
    await page.evaluate(i => go("team", i), id);
    const chooser = page.waitForEvent("filechooser");
    await page.locator("#content .mp-avatar").first().click();   /* no photo yet: straight to choosing */
    await (await chooser).setFiles({ name: "mate.jpg", mimeType: "image/jpeg", buffer: p2 });
    await page.locator("#avcSave").click();
    await expect.poll(() => middle(page, id)).toBe("red");
    await change(page, "#content", "#0000d0");
    await expect.poll(() => middle(page, id)).toBe("blue");
  } finally {
    await page.evaluate(i => Promise.all([apiFetch("DELETE", "/api/members/" + i).catch(() => {}), (PEOPLE[ME].avatar = "", persistPerson(ME, false))]), id);
  }
});
