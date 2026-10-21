/* Profile photos come from the server as files, "/files/<sha>.<ext>", no longer as data URLs inside every
   people payload (server/avatars.js). They look exactly as they did: the same size and crop, the initials
   when a photo cannot load (in light and dark mode), and a data URL — the standalone demo, a photo an
   older server has not moved yet — still draws. Nothing blinks when a photo changes: the one shown stays
   until the new one has loaded, in the tab that changed it and in everyone else's.
   The server side: tests/avatar-files.test.js. */
const { test, expect } = require("@playwright/test");
const path = require("path"), { pathToFileURL } = require("url");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page, who) {
  await page.goto("/");
  await page.locator("#au_email").fill((who || ADMIN).email);
  await page.locator("#au_pw").fill((who || ADMIN).pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
/* a 256×256 JPEG like the crop dialog makes, with a pattern so a different crop or size would show */
const picture = (page, color) => page.evaluate(c => { const cv = document.createElement("canvas"); cv.width = 256; cv.height = 256; const g = cv.getContext("2d"); g.fillStyle = "#ffffff"; g.fillRect(0, 0, 256, 256); g.fillStyle = c; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128); g.fillStyle = "#222222"; g.beginPath(); g.arc(150, 90, 40, 0, Math.PI * 2); g.fill(); return cv.toDataURL("image/jpeg", 0.9); }, color);
const FILE_JPG = /^\/files\/[a-f0-9]{64}\.jpg$/;
const bg = loc => loc.evaluate(el => el.classList.contains("img") ? el.style.backgroundImage : "initials:" + el.textContent);
const clearMine = page => page.evaluate(() => { PEOPLE[ME].avatar = ""; return persistPerson(ME, false); });
/* the largest difference of any colour channel between two screenshots of the same size (0 = identical) */
const pixelDiff = (page, a, b) => page.evaluate(async ([x, y]) => {
  const load = s => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = "data:image/png;base64," + s; });
  const [ia, ib] = await Promise.all([load(x), load(y)]); if (ia.width !== ib.width || ia.height !== ib.height) return 255;
  const px = im => { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
  const da = px(ia), db = px(ib); let max = 0; for (let i = 0; i < da.length; i++) max = Math.max(max, Math.abs(da[i] - db[i])); return max;
}, [a.toString("base64"), b.toString("base64")]);
/* a screenshot once the top bar's hover has faded; the avatar sits at a fractional position, so two
   identical redraws can still differ by a shade on the circle's edge: "the same" is a difference of at most 3 */
const shot = async loc => { await loc.page().waitForTimeout(250); return loc.screenshot(); };
const SAME = 3;

test("a photo from the server draws exactly as the same photo inline did", async ({ page }) => {
  await signIn(page);
  const data = await picture(page, "#00a000");
  try {
    const url = await page.evaluate(async d => { PEOPLE[ME].avatar = d; await persistPerson(ME, false); return PEOPLE[ME].avatar; }, data);
    expect(url, "the server keeps the photo as a file and sends its URL").toMatch(FILE_JPG);
    expect(await page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => d.people[ME].avatar))).toBe(url);
    await page.reload(); await ready(page);
    const top = page.locator("#meBtn .av");
    await expect.poll(() => bg(top)).toBe('url("' + url + '")');
    await page.waitForFunction(u => AV_IMG[u] && AV_IMG[u].s === 1, url);
    await page.mouse.move(5, 500);
    const box = await top.boundingBox();
    const fromFile = await shot(top);
    /* the same bytes inline, as the standalone demo or an older server has them */
    await page.evaluate(d => { PEOPLE[ME].avatar = d; applyShell(); }, data);
    await expect.poll(() => bg(top).then(s => s.slice(0, 26))).toBe('url("data:image/jpeg;base6');
    expect(await top.boundingBox()).toEqual(box);
    await expect.poll(async () => pixelDiff(page, await top.screenshot(), fromFile), { message: "pixel for pixel the same" }).toBeLessThanOrEqual(SAME);
    /* and in a bigger place: the profile header */
    await page.evaluate(u => { PEOPLE[ME].avatar = u; go("team", ME); }, url);
    const big = page.locator("#content .mp-avatar .av.xl");
    await expect.poll(() => bg(big)).toBe('url("' + url + '")');
    const bigFile = await shot(big);
    await page.evaluate(d => { PEOPLE[ME].avatar = d; renderScreen(false); }, data);
    await expect.poll(() => bg(big).then(s => s.slice(0, 15))).toBe('url("data:image');
    await expect.poll(async () => pixelDiff(page, await big.screenshot(), bigFile)).toBeLessThanOrEqual(SAME);
  } finally { await clearMine(page); }
});

test("a photo that cannot load shows the initials, as someone without a photo looks, in light and dark mode", async ({ page }) => {
  await signIn(page);
  const top = page.locator("#meBtn .av");
  const ini = await page.evaluate(() => PEOPLE[ME].ini);
  await page.mouse.move(5, 500);
  try {
    for (const mode of ["light", "dark"]) {
      await page.evaluate(m => document.documentElement.setAttribute("data-theme", m), mode);
      await page.evaluate(() => { PEOPLE[ME].avatar = ""; applyShell(); });
      await expect(top).toHaveText(ini);
      const none = await shot(top);
      /* a file this server does not have: drawn as a photo first, then the initials in place */
      const missing = "/files/" + (mode === "light" ? "0" : "1").repeat(64) + ".png";
      await page.evaluate(m => { PEOPLE[ME].avatar = m; applyShell(); }, missing);
      await expect.poll(() => bg(top)).toBe("initials:" + ini);
      /* put right in place: the same circle, colour and letters */
      expect(await pixelDiff(page, await shot(top), none), mode + ": as with no photo").toBeLessThanOrEqual(SAME);
      /* a redraw keeps the initials and does not try again */
      await page.evaluate(() => applyShell());
      expect(await bg(top)).toBe("initials:" + ini);
      expect(await pixelDiff(page, await shot(top), none), mode + ": the same as no photo").toBeLessThanOrEqual(SAME);
      expect(await page.evaluate(m => AV_IMG[m].s, missing)).toBe(2);
    }
  } finally {
    await page.evaluate(() => { document.documentElement.removeAttribute("data-theme"); applyTheme(); PEOPLE[ME].avatar = ""; applyShell(); });
  }
});

test("nothing blinks when a photo changes, in the tab that changed it and in a colleague's", async ({ page, browser }) => {
  await signIn(page);
  const tag = Date.now().toString(36);
  const mate = { name: "Avi Files " + tag, email: "avi-" + tag + "@e2e.test", pw: "Avi!Files-2026x" };
  const mateId = await page.evaluate(async m => { const r = await apiFetch("POST", "/api/members", { name: m.name, email: m.email, perm: "member", cap: 40 }); await apiFetch("POST", "/api/members/" + r.id + "/password", { password: m.pw }); return r.id; }, mate);
  const ctx2 = await browser.newContext(); const page2 = await ctx2.newPage();
  /* every photo file but the first waits until it is let go */
  let release = () => {}; const held = new Promise(r => { release = r; });
  try {
    const a = await picture(page, "#d00000"), b = await picture(page, "#0000d0");
    const urlA = await page.evaluate(async d => { PEOPLE[ME].avatar = d; applyShell(); await persistPerson(ME, false); applyShell(); return PEOPLE[ME].avatar; }, a);
    expect(urlA).toMatch(FILE_JPG);
    const adminId = await page.evaluate(() => ME);
    await signIn(page2, mate);
    await page2.evaluate(id => go("team", id), adminId);
    const theirs = page2.locator("#content .mp-avatar .av");
    await expect.poll(() => bg(theirs)).toBe('url("' + urlA + '")');
    await page2.waitForFunction(u => AV_IMG[u] && AV_IMG[u].s === 1, urlA);
    await page.waitForFunction(u => AV_IMG[u] && AV_IMG[u].s === 1, urlA);
    const hold = async route => { if (route.request().url().endsWith(urlA)) return route.continue(); await held; return route.continue(); };
    await page.route(/\/files\/[a-f0-9]{64}\.jpg$/, hold); await page2.route(/\/files\/[a-f0-9]{64}\.jpg$/, hold);
    /* what each avatar shows, every frame */
    const sample = (p, sel) => p.evaluate(s => { window.__avFrames = []; window.__avSample = true; const tick = () => { const el = document.querySelector(s); window.__avFrames.push(!el ? "none" : el.classList.contains("img") ? el.style.backgroundImage.slice(0, 40) : "initials"); if (window.__avSample) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }, sel);
    await sample(page, "#meBtn .av"); await sample(page2, "#content .mp-avatar .av");
    /* the cropped photo shows at once and stays while the server's file loads, through a redraw too */
    await page.evaluate(d => avatarSave(ME, d), b);
    await expect.poll(() => page.evaluate(a0 => /^\/files\/[a-f0-9]{64}\.jpg$/.test(PEOPLE[ME].avatar) && PEOPLE[ME].avatar !== a0, urlA)).toBe(true);
    const urlB = await page.evaluate(() => PEOPLE[ME].avatar);
    expect(urlB).toMatch(FILE_JPG); expect(urlB).not.toBe(urlA);
    const top = page.locator("#meBtn .av");
    expect((await bg(top)).slice(0, 26)).toBe('url("data:image/jpeg;base6');
    await page.evaluate(() => refresh());
    expect((await bg(top)).slice(0, 26)).toBe('url("data:image/jpeg;base6');
    /* the colleague hears of it; until the new file has loaded the photo they saw stays */
    await expect.poll(() => page2.evaluate(id => PEOPLE[id].avatar, adminId), { timeout: 10000 }).toBe(urlB);
    await page2.evaluate(() => refresh());
    expect(await bg(theirs)).toBe('url("' + urlA + '")');
    release();
    await expect.poll(() => bg(top)).toBe('url("' + urlB + '")');
    await expect.poll(() => bg(theirs)).toBe('url("' + urlB + '")');
    for (const p of [page, page2]) {
      const frames = await p.evaluate(() => { window.__avSample = false; return window.__avFrames; });
      expect(frames.length).toBeGreaterThan(5);
      expect(frames.filter(f => !/^url\("(data:image\/jpeg|\/files\/)/.test(f)), "every frame shows a photo").toEqual([]);
    }
  } finally {
    release();
    await ctx2.close().catch(() => {});
    await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
    await page.evaluate(id => Promise.all([apiFetch("DELETE", "/api/members/" + id).catch(() => {}), (PEOPLE[ME].avatar = "", persistPerson(ME, false))]), mateId);
  }
});

test("the standalone file draws an inline photo, and the initials for a file it cannot reach", async ({ page }) => {
  await page.goto(pathToFileURL(path.join(__dirname, "..", "dist", "creative-os-standalone.html")).href);
  await expect(page.locator(".demo-user-card").first()).toBeVisible({ timeout: 10000 });
  const data = await picture(page, "#00a000");
  const out = await page.evaluate(d => { const id = Object.keys(PEOPLE)[0]; PEOPLE[id].avatar = d; const host = document.createElement("div"); host.id = "avProbe"; host.innerHTML = av(id, "xl") + av(Object.keys(PEOPLE)[1], "xl"); document.body.appendChild(host); return { id, ini: PEOPLE[Object.keys(PEOPLE)[1]].ini }; }, data);
  await expect(page.locator("#avProbe .av").first()).toHaveClass(/\bimg\b/);
  expect((await bg(page.locator("#avProbe .av").first())).slice(0, 15)).toBe('url("data:image');
  await page.evaluate(() => { const id = Object.keys(PEOPLE)[1]; PEOPLE[id].avatar = "/files/" + "2".repeat(64) + ".jpg"; document.getElementById("avProbe").innerHTML += av(id, "xl"); });
  await expect.poll(() => bg(page.locator("#avProbe .av").nth(2))).toBe("initials:" + out.ini);
});
