/* The page split (Oct 2026, performance stage 3): its code is one file the browser keeps, and the Indonesian dictionary
   a file of its own, asked for only when Indonesian is needed — and nothing is ever drawn in Indonesian without its
   words, nor in English first.
   - An English page never asks for it; choosing Indonesian brings it once and switches everything at once, the menu
     staying open; English again needs nothing.
   - A page that starts in Indonesian asks for it with the session, and is never shown in English, signed in or not.
   - Someone whose own choice is Indonesian, on a browser that showed English, is shown the app once, in Indonesian,
     and the next visit asks for the words at once.
   - An export in Indonesian from an English page waits for the words; the Indonesian names Settings offers are
     filled in where they are. */
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = page => page.waitForFunction(() => window.ZC_READY === true && API.on);
const DICT = /\/assets\/i18n-id\.[0-9a-f]{10}\.json$/;
async function signIn(page) {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
/* what the page shows, at every frame: the menu bar's words and the sign-in card's, and whether the cover is gone */
const FRAMES = () => {
  window.__frames = [];
  const tick = () => {
    const cover = document.getElementById("bootCover"), nav = document.getElementById("nav"), card = document.querySelector(".authcard");
    window.__frames.push({ shown: !cover || cover.classList.contains("gone"), nav: nav ? nav.textContent : "", card: card ? card.textContent : "", lang: typeof UI_LANG === "string" ? UI_LANG : "" });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
const frames = page => page.evaluate(() => window.__frames.filter(f => f.shown));
/* who asked for the dictionary: the head's early script (the page's own code not there yet), or the page's code */
const WHO_ASKS = () => { const f = window.fetch; window.__dictAsked = []; window.fetch = function (u) { if (/\/assets\/i18n-id\./.test(String(u && u.url || u))) window.__dictAsked.push(typeof window.boot === "function" ? "page" : "head"); return f.apply(this, arguments); }; };
const restoreEnglish = page => page.evaluate(async () => { localStorage.setItem("cos.language", "en"); if (UI_LANG !== "en" || (PEOPLE[ME] && myPrefs().language !== "en")) { await setLanguage("en"); await new Promise(r => setTimeout(r, 600)); } });

test("an English page never asks for the Indonesian words; choosing Indonesian brings them once and switches at once", async ({ page }) => {
  const asked = []; page.on("request", r => { if (DICT.test(r.url())) asked.push(r.url()); });
  await signIn(page);
  await page.waitForTimeout(800);
  expect(asked, "not asked for in English").toEqual([]);
  expect(await page.evaluate(() => ({ ready: ZC_I18N.ready, words: Object.keys(UI_ID).length }))).toEqual({ ready: false, words: 0 });
  /* the page's code is a file the browser keeps a year, without asking */
  const code = await page.evaluate(() => performance.getEntriesByType("resource").map(e => e.name).find(n => /\/assets\/app\.[0-9a-f]{10}\.js$/.test(n)));
  expect(code).toBeTruthy();
  const head = await page.request.get(code);
  expect(head.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  expect(head.headers()["etag"]).toMatch(/^"[\w-]{27}"$/);
  try {
    /* the switch, from the menu: every frame is all English, then all Indonesian */
    await page.locator("#meBtn").click();
    await expect(page.locator("#userMenu")).toHaveClass(/open/);
    await page.evaluate(FRAMES); await page.evaluate(WHO_ASKS);
    const got = page.waitForResponse(r => DICT.test(r.url()));
    await page.locator('#userMenu .lang-choice[data-lang="id"]').click();
    const res = await got;
    expect(res.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
    await page.waitForFunction(() => UI_LANG === "id");
    await expect(page.locator("#nav")).toContainText("Beranda");
    await page.waitForTimeout(300);
    const f = await frames(page);
    const first = f.findIndex(x => /Beranda/.test(x.nav));
    expect(first, "Indonesian is shown").toBeGreaterThan(-1);
    expect(f.slice(0, first).every(x => /Home/.test(x.nav) && !/Beranda/.test(x.nav)), "English until the switch").toBe(true);
    expect(f.slice(first).every(x => /Beranda/.test(x.nav) && !/\bHome\b/.test(x.nav)), "Indonesian from then on, never back").toBe(true);
    await expect(page.locator("#userMenu"), "the menu stays open, translated in place").toHaveClass(/open/);
    await expect(page.locator("#userMenu")).toContainText("Bahasa");
    expect(await page.evaluate(() => window.__dictAsked), "asked for in the background as the pointer came, never blocking the page").toEqual(["page"]);
    /* the words are the file, in its order */
    const file = await res.json();
    const held = await page.evaluate(() => ({ keys: Object.keys(UI_ID), ready: ZC_I18N.ready }));
    expect(held.ready).toBe(true);
    expect(held.keys).toEqual(Object.keys(file));
    /* English again needs nothing; Indonesian a second time neither */
    await page.locator('#userMenu .lang-choice[data-lang="en"]').click();
    await expect(page.locator("#nav")).toContainText("Home");
    await page.evaluate(() => setLanguage("id"));
    expect(await page.evaluate(() => UI_LANG), "at once, the words being here").toBe("id");
    expect(asked.length, "asked for once").toBe(1);
  } finally { await restoreEnglish(page); }
});

test("a page that starts in Indonesian asks for the words with the session and is never shown in English", async ({ page, context }) => {
  await signIn(page);
  try {
    await page.evaluate(() => setLanguage("id"));
    await page.waitForFunction(() => UI_LANG === "id");
    await page.addInitScript(FRAMES); await page.addInitScript(WHO_ASKS);
    /* the words a little slower than the page's code (which the browser has by now): what is drawn must wait for them */
    await page.route("**/assets/i18n-id.*.json", async r => { await new Promise(x => setTimeout(x, 700)); await r.continue(); });
    await page.reload(); await ready(page);
    await expect(page.locator("#nav")).toContainText("Beranda");
    await page.waitForTimeout(300);
    const f = await frames(page);
    expect(f.length).toBeGreaterThan(0);
    expect(f.filter(x => x.nav).every(x => /Beranda/.test(x.nav) && !/\bHome\b/.test(x.nav)), "no frame in English").toBe(true);
    const all = await page.evaluate(() => window.__frames.filter(x => x.nav));
    expect(all.every(x => !/\bHome\b/.test(x.nav)), "not even under the cover: drawn once, in Indonesian").toBe(true);
    /* asked for side by side with the rest, from the top of the page, before its code has run */
    expect(await page.evaluate(() => window.__dictAsked)).toEqual(["head"]);
    /* signed out, in Indonesian: the sign-in card is never in English either */
    await page.evaluate(() => signOut());
    await expect(page.locator("#au_email")).toBeVisible();
    await page.reload();
    await expect(page.locator(".authcard")).toContainText("Masuk");
    await page.waitForTimeout(300);
    const g = await frames(page);
    expect(g.filter(x => x.card).length).toBeGreaterThan(0);
    expect(g.filter(x => x.card).every(x => !/Sign in/.test(x.card)), "the sign-in card, in Indonesian from its first frame").toBe(true);
    await page.unroute("**/assets/i18n-id.*.json");
    await page.locator("#au_email").fill(ADMIN.email); await page.locator("#au_pw").fill(ADMIN.pw);
    await page.getByRole("button", { name: "Masuk", exact: true }).last().click(); await ready(page);   /* "Log in" (the tab) is "Masuk" too */
  } finally { await page.unroute("**/assets/i18n-id.*.json").catch(() => {}); await restoreEnglish(page); }
});

test("someone whose choice is Indonesian, on a browser that showed English, is shown the app once, in Indonesian", async ({ page }) => {
  await signIn(page);
  try {
    await page.evaluate(() => setLanguage("id"));
    await page.waitForFunction(() => UI_LANG === "id" && myPrefs().language === "id");
    await page.waitForTimeout(800);   /* the choice saved with the person's preferences */
    await page.evaluate(() => { localStorage.setItem("cos.language", "en"); localStorage.removeItem("cos.signedInLang"); });
    const asked = []; page.on("request", r => { if (DICT.test(r.url())) asked.push(Date.now()); });
    await page.addInitScript(FRAMES); await page.addInitScript(WHO_ASKS);
    await page.reload(); await ready(page);
    expect(await page.evaluate(() => UI_LANG)).toBe("id");
    expect(await page.evaluate(() => window.__dictAsked), "the page's code asks, once it knows").toEqual(["page"]);
    await expect(page.locator("#nav")).toContainText("Beranda");
    await page.waitForTimeout(300);
    const f = await frames(page);
    expect(f.filter(x => x.nav).every(x => /Beranda/.test(x.nav)), "the app is first shown in Indonesian").toBe(true);
    expect(asked.length).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem("cos.signedInLang")), "remembered for the next visit").toBe("id");
    /* the next visit asks for the words from the top of the page */
    await page.reload(); await ready(page);
    expect(await page.evaluate(() => window.__dictAsked)).toEqual(["head"]);
    await expect(page.locator("#nav")).toContainText("Beranda");
  } finally { await restoreEnglish(page); }
});

test("an export in Indonesian waits for the words; Settings fills in its Indonesian names where they are", async ({ page }) => {
  await signIn(page);
  try {
    await page.evaluate(() => setLanguage("en"));
    /* Settings: the Indonesian name each built-in stage would have, offered as the placeholder once the words are here */
    await page.reload(); await ready(page);
    expect(await page.evaluate(() => ZC_I18N.ready)).toBe(false);
    await page.evaluate(() => go("settings", "workflow"));
    await expect(page.locator("input.bi-id").first()).toBeVisible();
    await expect(page.locator("input[data-tr-id-of]")).toHaveCount(0);
    const stage = await page.evaluate(() => { const k = WS.workflow.findIndex(s => !s.nameId && trIdOf(s.name) !== s.name); return { k, want: k < 0 ? null : trIdOf(WS.workflow[k].name) }; });
    expect(stage.k, "a built-in stage with an Indonesian word").toBeGreaterThan(-1);
    await expect(page.locator("input.bi-id").nth(stage.k)).toHaveAttribute("placeholder", stage.want);
    /* an export in Indonesian, from an English page that has not had the words yet (Home: Settings would ask for them) */
    await page.goto("/"); await ready(page);
    await page.mouse.move(1, 1);   /* not over the dialog's Indonesian choice, which would ask for the words already */
    await page.evaluate(() => exportModal("csv"));
    await page.evaluate(() => { EXF.lang = "id"; }); await page.evaluate(WHO_ASKS);
    expect(await page.evaluate(() => ZC_I18N.ready), "the words are not here yet").toBe(false);
    const download = page.waitForEvent("download");
    await page.locator("#modal").getByRole("button", { name: "Export" }).click();
    const csv = fs.readFileSync(await (await download).path(), "utf8");
    const title = await page.evaluate(() => UI_ID["Title"]);
    expect(title).toBeTruthy();
    expect(csv.split("\n")[0]).toContain(title);
    expect(await page.evaluate(() => window.__dictAsked), "waited for in the background, never blocking the page").toEqual(["page"]);
    expect(await page.evaluate(() => UI_LANG), "the page itself stays in English").toBe("en");
  } finally { await page.evaluate(() => closeModal()); await restoreEnglish(page); }
});

test("words that do not come hold the page back no longer than a while; when they come it is drawn again in Indonesian", async ({ page }) => {
  test.setTimeout(90000);
  await signIn(page);
  const DICT_URL = "**/assets/i18n-id.*.json";
  try {
    await page.evaluate(() => setLanguage("id"));
    await page.waitForFunction(() => UI_LANG === "id");
    /* the dictionary held back until the page has gone on without it */
    let held = null;
    await page.route(DICT_URL, r => { held = r; });
    const t0 = Date.now();
    await page.reload(); await ready(page);
    expect(Date.now() - t0, "shown after the wait, not never").toBeLessThan(30000);
    expect(await page.evaluate(() => ({ ready: ZC_I18N.ready, lang: UI_LANG }))).toEqual({ ready: false, lang: "id" });
    expect(held, "it was asked for").not.toBe(null);
    await held.continue(); await page.unroute(DICT_URL);
    await expect(page.locator("#nav")).toContainText("Beranda");
    expect(await page.evaluate(() => ZC_I18N.ready)).toBe(true);
  } finally { await page.unroute(DICT_URL).catch(() => {}); await restoreEnglish(page); }
});
