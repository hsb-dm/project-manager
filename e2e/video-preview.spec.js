/* A video's picture first, its player when asked (Oct 2026, src/version-preview.js, server/link-preview.js): YouTube,
   Vimeo and Loom, as a Figma file already was (e2e/figma-preview.spec.js). The test server answers for the providers
   from e2e/fixtures/video-stub.js (COS_LINK_FETCH_STUB in e2e/serve.js, through link-stub.js): a YouTube id starting
   "YtPub", "YtSlo" (1.2 s late) or "YtSrt" (a Short) is a public video and "YtPrv" a private one; a Vimeo number
   starting 77 is public and 78 unlisted and limited to other sites; a Loom id starting "a11ce" is public, any other
   unknown. The page's own requests to the providers (the player, once asked for) are answered here, so nothing
   leaves the machine.
   - the picture shows first, in the player's shape and size, after a skeleton of that shape, with Play / Putar in the
     middle and Open in YouTube / Buka di YouTube beside it, and no player frame (nor any request to the provider)
     until Play; Play (a click or Enter) puts the player exactly where the picture was, the same address with
     autoplay=1 and the same sandbox; it stays through a redraw and until the task is closed;
   - each provider's shape: 16:9, a Short 9:16, a Loom recording 4:3; the length on the picture when it is known;
   - a private, unlisted-without-hash or unknown video: the card with the provider's mark, the name from its link, and
     Play, which loads the player as before; a provider out of reach (a Vimeo number starting 79: vimeo.com does not
     resolve) the "No preview right now" card the same way, the panel never waiting, asked again 10 minutes later;
   - Full view, a file's Preview and a preview outside a task (a link card's Open preview, a chat file) do the same;
   - a link the server cannot check (a Loom id of the wrong length) and a Drive folder are framed at once, as before;
   - English and Indonesian, light and dark, and at 390 px. Every task made is deleted; localStorage is cleaned. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const SANDBOX = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation allow-downloads";
/* ids of their own: the server keeps what a provider said for 7 days, and a test may need a video it has not seen */
let seq = 0;
const tag = n => (Date.now().toString(36) + (seq++).toString(36).padStart(2, "0")).slice(-n);
const ytId = kind => "Yt" + kind + tag(6);
const vimeoId = kind => kind + String(Date.now()).slice(-7) + (seq++);
const loomId = kind => kind + (Date.now().toString(16) + (seq++).toString(16).padStart(3, "0")).padStart(32 - kind.length, "0").slice(-(32 - kind.length));
const DRIVE = "https://drive.google.com/drive/folders/1VdNoVideoFolder";
const made = [];
const asked = [];
const PROVIDER = /^https:\/\/([a-z0-9-]+\.)*(youtube-nocookie\.com|youtube\.com|youtu\.be|ytimg\.com|vimeo\.com|vimeocdn\.com|loom\.com)\//;

async function signIn(page) {
  page.on("request", r => { if (PROVIDER.test(r.url())) asked.push(r.url()); });
  /* the players, once asked for: a page of our own, so nothing leaves the machine */
  await page.route(PROVIDER, r => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>player</title><body style=\"margin:0;height:100vh;display:grid;place-items:center;background:#000;color:#fff;font:600 18px system-ui\">player</body>" }));
  await page.route(/^https:\/\/(drive|docs)\.google\.com\//, r => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>embed</title>" }));
  await page.route("**/api/links/title**", r => r.fulfill({ contentType: "application/json", body: JSON.stringify({ title: "" }) }));
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => window.ZC_READY === true && API.on);
  await page.evaluate(() => { try { localStorage.removeItem("cos.linkPreviews"); } catch (e) {} });
}
const makeTask = (page, title, versions, files) => page.evaluate(([t, v, f]) => apiFetch("POST", "/api/tasks", { title: t, status: WS.workflow[1].id, prio: "medium", assignee: ME, assignees: [ME], reviewer: ME, reviewers: [ME], versions: v, files: f || [] }).then(d => { TASKS.push(hTask(d)); return d.id; }), [title, versions, files]);
const version = url => [{ n: 1, state: "pending", color: "#123A6B", note: "", driveUrl: url }];
const openFiles = (page, id) => page.evaluate(t => { openTask(t); S.drawerTab = "files"; renderDrawer(); }, id);
const box = page => page.locator("#drBody .av-version .vd-box");
const frames = page => page.locator("#drBody iframe, #modal iframe");
/* the size of an element, rounded (the panel slides in, so where it is moves; its size does not) */
const size = loc => loc.evaluate(e => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await page.goto("/"); await page.locator("#au_email").fill(ADMIN.email); await page.locator("#au_pw").fill(ADMIN.pw);
    await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForFunction(() => window.ZC_READY === true && API.on);
    for (const id of made) await page.evaluate(t => apiFetch("DELETE", "/api/tasks/" + t).catch(() => {}), id);
    await page.evaluate(() => { try { localStorage.removeItem("cos.linkPreviews"); } catch (e) {} });
  } finally { await page.close(); }
});

test("a YouTube video shows its picture first, in the player's shape, and the player only after Play", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await signIn(page);
  const id = ytId("Slo"), link = "https://www.youtube.com/watch?v=" + id + "&t=42s";
  const task = await makeTask(page, "Video slow " + Date.now(), version(link)); made.push(task);
  asked.length = 0;
  await openFiles(page, task);
  /* at once: the box, 16:9 and the player's size, and a skeleton of that shape while the server asks YouTube */
  const b = box(page);
  await expect(b).toBeVisible();
  await expect(b.locator(".vd-stage[aria-busy] .vd-skel")).toBeVisible();
  const first = await size(b);
  expect(Math.abs(first.w / first.h - 16 / 9)).toBeLessThan(0.01);
  expect(first.h).toBeLessThanOrEqual(340);
  expect(await size(b.locator(".vd-skel"))).toEqual(first);
  /* then the picture, kept on this server, filling the box (YouTube's letterbox bars cut off); nothing moved */
  const img = b.locator(".vd-img");
  await expect(img).toBeVisible({ timeout: 10000 });
  await expect(img).toHaveAttribute("src", /^\/files\/[a-f0-9]{64}\.png$/);
  await expect(img).toHaveAttribute("alt", "Product teaser cut 2");
  await expect.poll(() => img.evaluate(i => i.complete && i.naturalWidth)).toBe(480);
  expect(await img.evaluate(i => getComputedStyle(i).objectFit)).toBe("cover");
  await expect(b.locator(".vd-skel")).toBeHidden();
  expect(await size(b)).toEqual(first);
  expect(await size(img)).toEqual(first);
  await expect(b.locator(".vd-cap")).toHaveText("Product teaser cut 2");
  await expect(b.locator(".vd-cap svg.brand-ico")).toHaveCount(1);
  await expect(b.locator(".vd-dur"), "YouTube's oEmbed gives no length").toHaveCount(0);
  /* no player, and the page has asked YouTube for nothing */
  await expect(frames(page)).toHaveCount(0);
  expect(asked, "no request to YouTube before Play").toEqual([]);
  /* Play in the middle, Open in YouTube beside it, real buttons */
  const play = b.getByRole("button", { name: "Play", exact: true }), open = b.getByRole("button", { name: "Open in YouTube" });
  await expect(play).toBeVisible(); await expect(open).toBeVisible();
  const at = await page.evaluate(() => { const r = s => document.querySelector("#drBody .av-version .vd-box " + s).getBoundingClientRect(), bx = r(""), p = r(".vd-play"), o = r(".vd-open"); return { row: Math.abs((p.top + p.bottom) / 2 - (o.top + o.bottom) / 2), beside: o.left > p.right, mid: Math.abs((p.left + o.right) / 2 - (bx.left + bx.right) / 2), midY: Math.abs((p.top + p.bottom) / 2 - (bx.top + bx.bottom) / 2), big: p.height }; }).catch(() => null);
  expect(at).toEqual({ row: expect.any(Number), beside: true, mid: expect.any(Number), midY: expect.any(Number), big: expect.any(Number) });
  expect(at.row, "on one line").toBeLessThan(2); expect(at.mid, "centred").toBeLessThan(2); expect(at.midY, "in the middle").toBeLessThan(2); expect(at.big, "a large button").toBeGreaterThanOrEqual(44);
  /* Play: YouTube's player where the picture was, the same address with autoplay, the same sandbox, the same size */
  await play.click();
  const frame = page.locator("#drBody .av-version .vp-frame iframe");
  await expect(frame).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1");
  await expect(frame).toHaveAttribute("sandbox", SANDBOX);
  await expect(frame).toHaveAttribute("allow", /autoplay/);
  expect(await size(page.locator("#drBody .av-version .vp-frame"))).toEqual(first);
  await expect(b).toHaveCount(0);
  /* it stays the player through a redraw (which does not start it again by itself) */
  await page.evaluate(() => renderDrawer());
  await expect(frame).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/" + id);
  await expect(b).toHaveCount(0);
  /* the task closed and opened again: the picture again, drawn at once (no skeleton), and the keyboard plays it */
  await page.evaluate(t => { closeDrawer(); openTask(t); S.drawerTab = "files"; renderDrawer(); }, task);
  await expect(img).toBeVisible();
  await expect(b.locator(".vd-skel")).toHaveCount(0);
  await expect(frames(page)).toHaveCount(0);
  await b.getByRole("button", { name: "Play", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(frame).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1");
  await expect(frame).toBeFocused();
  await page.evaluate(() => closeDrawer());
});

test("each video takes its player's shape: Vimeo 16:9, a YouTube Short upright, a Loom recording 4:3, with the length", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await signIn(page);
  const vm = vimeoId("77"), short = ytId("Srt"), lm = loomId("a11ce");
  const cases = [
    { link: "https://vimeo.com/" + vm + "/abcdef1234", ratio: 16 / 9, dur: "1:35", name: "Harbour at dawn", open: "Open in Vimeo", w: 640, src: "https://player.vimeo.com/video/" + vm + "?h=abcdef1234&autoplay=1" },
    { link: "https://youtube.com/shorts/" + short + "?feature=share", ratio: 9 / 16, dur: null, name: "Behind the scenes #shorts", open: "Open in YouTube", w: 480, src: "https://www.youtube-nocookie.com/embed/" + short + "?autoplay=1" },
    /* a Loom link with the recording's title before its id */
    { link: "https://www.loom.com/share/Checkout-walkthrough-" + lm + "?sid=e2e", ratio: 4 / 3, dur: "0:21", name: "Walkthrough: the checkout flow", open: "Open in Loom", w: 640, src: "https://www.loom.com/embed/" + lm + "?autoplay=1" }
  ];
  for (const c of cases) {
    const task = await makeTask(page, "Video shape " + Date.now(), version(c.link)); made.push(task);
    asked.length = 0;
    await openFiles(page, task);
    const b = box(page), img = b.locator(".vd-img");
    await expect(img).toBeVisible({ timeout: 10000 });
    await expect.poll(() => img.evaluate(i => i.complete && i.naturalWidth)).toBe(c.w);
    const s = await size(b);
    expect(Math.abs(s.w / s.h - c.ratio), c.link).toBeLessThan(0.01);
    expect(s.h, c.link).toBeLessThanOrEqual(340);
    await expect(b.locator(".vd-cap")).toHaveText(c.name);
    if (c.dur) await expect(b.locator(".vd-dur")).toHaveText(c.dur); else await expect(b.locator(".vd-dur")).toHaveCount(0);
    await expect(b.getByRole("button", { name: c.open })).toBeVisible();
    /* the buttons inside the box, whatever its shape */
    const inside = await b.evaluate(x => { const r = x.getBoundingClientRect(); return Array.from(x.querySelectorAll(".vd-acts button")).every(e => { const q = e.getBoundingClientRect(); return q.left >= r.left - 1 && q.right <= r.right + 1 && q.top >= r.top - 1 && q.bottom <= r.bottom + 1; }); });
    expect(inside, c.link).toBe(true);
    await expect(frames(page)).toHaveCount(0);
    expect(asked, c.link).toEqual([]);
    /* seen once, drawn at once in its shape the next time: no skeleton, no change of shape */
    const again = await page.evaluate(t => { closeDrawer(); openTask(t); S.drawerTab = "files"; renderDrawer(); const x = document.querySelector("#drBody .av-version .vd-box"), r = x.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), waiting: !!x.querySelector(".vd-stage[aria-busy]"), pic: !!x.querySelector(".vd-img") }; }, task);
    expect(again, c.link).toEqual({ w: s.w, h: s.h, waiting: false, pic: true });
    await b.getByRole("button", { name: "Play", exact: true }).click();
    const frame = page.locator("#drBody .av-version .vp-frame iframe");
    await expect(frame).toHaveAttribute("src", c.src);
    await expect(frame).toHaveAttribute("sandbox", SANDBOX);
    expect(await size(page.locator("#drBody .av-version .vp-frame")), c.link).toEqual(s);
    /* the player is asked for now, and only now (waited for, so it is not counted for the next video) */
    await expect.poll(() => asked.includes(c.src), { message: c.link }).toBe(true);
    await page.evaluate(() => closeDrawer());
  }
});

test("a private, unlisted or unknown video shows a card with its mark and the name from its link, and Play still loads the player", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await signIn(page);
  const yt = ytId("Prv"), vm = vimeoId("78"), lm = loomId("b0b");
  const cases = [
    { link: "https://youtu.be/" + yt + "?si=e2e", name: "youtu.be/" + yt, open: ["Open in YouTube", "Buka di YouTube"], src: "https://www.youtube-nocookie.com/embed/" + yt + "?autoplay=1" },
    /* unlisted, asked without its hash: Vimeo says 404 */
    { link: "https://vimeo.com/" + vm, name: "vimeo.com/" + vm, open: ["Open in Vimeo", "Buka di Vimeo"], src: "https://player.vimeo.com/video/" + vm + "?autoplay=1" },
    /* unlisted and limited to other sites: an answer without a title or a thumbnail */
    { link: "https://vimeo.com/" + vm + "?h=0123abcd99", name: "vimeo.com/" + vm, open: ["Open in Vimeo", "Buka di Vimeo"], src: "https://player.vimeo.com/video/" + vm + "?h=0123abcd99&autoplay=1" },
    { link: "https://www.loom.com/share/" + lm, name: "loom.com/share/" + lm.slice(0, 8) + "…", open: ["Open in Loom", "Buka di Loom"], src: "https://www.loom.com/embed/" + lm + "?autoplay=1" }
  ];
  for (const c of cases) {
    const task = await makeTask(page, "Video private " + Date.now(), version(c.link)); made.push(task);
    await openFiles(page, task);
    const b = box(page), card = b.locator(".vd-card");
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card.locator(".vd-card-name")).toHaveText(c.name);
    await expect(card).toContainText("Private video: no preview");
    await expect(card.locator("svg.brand-ico")).toHaveCount(1);
    await expect(b.locator(".vd-img")).toHaveCount(0);
    await expect(frames(page)).toHaveCount(0);
    const s = await size(b);
    expect(Math.abs(s.w / s.h - 16 / 9), c.link).toBeLessThan(0.01);
    /* the card and its buttons inside the box, none over another */
    const fit = await b.evaluate(x => { const r = x.getBoundingClientRect(), q = s => x.querySelector(s).getBoundingClientRect(), note = q(".vd-card-note"), acts = q(".vd-acts");
      return Array.from(x.querySelectorAll(".vd-acts button, .vd-logo, .vd-card-name, .vd-card-note")).every(e => { const k = e.getBoundingClientRect(); return k.left >= r.left - 1 && k.right <= r.right + 1 && k.top >= r.top - 1 && k.bottom <= r.bottom + 1; }) && note.bottom <= acts.top + 4; });
    expect(fit, c.link).toBe(true);
    /* in Indonesian */
    await page.evaluate(() => setLanguage("id"));
    await page.waitForFunction(() => UI_LANG === "id");
    await page.evaluate(() => renderDrawer());
    await expect(card).toContainText("Video privat: pratinjau tidak tersedia");
    await expect(b.getByRole("button", { name: "Putar", exact: true })).toBeVisible();
    await expect(b.getByRole("button", { name: c.open[1] })).toBeVisible();
    await page.evaluate(() => setLanguage("en"));
    await page.waitForFunction(() => UI_LANG === "en");
    await page.evaluate(() => renderDrawer());
    await expect(b.getByRole("button", { name: c.open[0] })).toBeVisible();
    /* Play loads the player as before (it says the video is private, or asks the viewer to sign in) */
    await b.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.locator("#drBody .av-version .vp-frame iframe")).toHaveAttribute("src", c.src);
    expect(await size(page.locator("#drBody .av-version .vp-frame")), c.link).toEqual(s);
    await page.evaluate(() => closeDrawer());
  }
});

test("a provider out of reach (vimeo.com does not resolve): the panel at once, then the no-preview card, Play still works, asked again 10 minutes later", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await signIn(page);
  const vm = vimeoId("79"), link = "https://vimeo.com/" + vm;
  const asks = []; page.on("request", r => { if (r.url().indexOf("/api/link-preview?url=" + encodeURIComponent(link)) >= 0) asks.push(r.url()); });
  const task = await makeTask(page, "Vimeo out of reach " + Date.now(), version(link)); made.push(task);
  /* drawn at once, nothing waits for Vimeo: the box (its skeleton) and the rest of the panel in the same draw */
  const drawn = await page.evaluate(t => { openTask(t); S.drawerTab = "files"; renderDrawer(); const b = document.querySelector("#drBody .av-version .vd-box"); return { box: !!b, waiting: !!(b && b.querySelector(".vd-stage[aria-busy]")), notes: !!document.querySelector("#drBody .vn") }; }, task);
  expect(drawn).toEqual({ box: true, waiting: true, notes: true });
  const b = box(page), card = b.locator(".vd-card");
  await expect(card).toBeVisible({ timeout: 10000 });
  await expect(card).toContainText("No preview right now");
  await expect(card).not.toContainText("Private video");
  await expect(card.locator(".vd-card-name")).toHaveText("vimeo.com/" + vm);
  await expect(card.locator("svg.brand-ico")).toHaveCount(1);
  await expect(frames(page)).toHaveCount(0);
  expect(asks.length).toBe(1);
  /* drawn again within 10 minutes: not asked again, the card as it was */
  await page.evaluate(() => renderDrawer());
  await expect(card).toBeVisible();
  expect(asks.length).toBe(1);
  /* drawn 10 minutes later: asked again, the card staying in place meanwhile (no skeleton) */
  const again = await page.evaluate(() => { for (const k in LPV.asked) LPV.asked[k] -= 10 * 60e3 + 1000; renderDrawer(); return !!document.querySelector("#drBody .av-version .vd-stage[aria-busy]"); });
  expect(again, "no skeleton over a card already shown").toBe(false);
  await expect.poll(() => asks.length).toBe(2);
  await expect(card).toContainText("No preview right now");
  /* in Indonesian */
  await page.evaluate(() => setLanguage("id")); await page.waitForFunction(() => UI_LANG === "id");
  await page.evaluate(() => renderDrawer());
  await expect(card).toContainText("Pratinjau belum tersedia");
  await page.evaluate(() => setLanguage("en")); await page.waitForFunction(() => UI_LANG === "en");
  await page.evaluate(() => renderDrawer());
  /* Play loads Vimeo's player as before */
  await b.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator("#drBody .av-version .vp-frame iframe")).toHaveAttribute("src", "https://player.vimeo.com/video/" + vm + "?autoplay=1");
  await page.evaluate(() => closeDrawer());
});

test("Full view, a file's Preview and a preview outside a task show the picture first too", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await signIn(page);
  const id = ytId("Pub"), link = "https://www.youtube.com/watch?v=" + id;
  const task = await makeTask(page, "Video full " + Date.now(), version(link), [{ id: "f_vd1", name: "Brand film", type: "document", source: "link", size: "Link", url: link }]); made.push(task);
  await openFiles(page, task);
  await expect(box(page).locator(".vd-img")).toBeVisible({ timeout: 10000 });
  await page.locator("#drBody .pbar-foot .btn", { hasText: "Full view" }).click();
  const full = page.locator("#modal .vd-box.full");
  await expect(full.locator(".vd-img")).toBeVisible();
  await expect(page.locator("#modal iframe")).toHaveCount(0);
  const fs = await size(full);
  expect(Math.abs(fs.w / fs.h - 16 / 9)).toBeLessThan(0.01);
  expect(fs.h, "larger than in the panel").toBeGreaterThan(340);
  await full.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator("#modal .vp-frame.full iframe")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1");
  expect(await size(page.locator("#modal .vp-frame.full"))).toEqual(fs);
  await page.evaluate(() => closeModal());
  /* played in this task: the version box shows the player too now */
  await page.evaluate(() => renderDrawer());
  await expect(page.locator("#drBody .av-version .vp-frame iframe")).toHaveCount(1);
  /* the task again: pictures again; a file's Preview */
  await page.evaluate(() => closeDrawer());
  await openFiles(page, task);
  await page.evaluate(t => previewFile(task(t).files.find(f => f.id === "f_vd1").id), task);
  await expect(page.locator("#modal .vd-box .vd-img")).toBeVisible();
  await expect(page.locator("#modal iframe")).toHaveCount(0);
  await page.evaluate(() => { closeModal(); closeDrawer(); });
  /* outside a task (a link card's Open preview, a chat file): the picture, the player for that box only */
  await page.evaluate(u => previewModal({ title: "Link", name: "Link", url: u }), link);
  await expect(page.locator("#modal .vd-box .vd-img")).toBeVisible();
  await page.locator("#modal .vd-box").getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator("#modal iframe")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1");
  await page.evaluate(() => closeModal());
  await page.evaluate(u => previewModal({ title: "Link", name: "Link", url: u }), link);
  await expect(page.locator("#modal .vd-box .vd-img")).toBeVisible();
  await expect(page.locator("#modal iframe")).toHaveCount(0);
  await page.evaluate(() => closeModal());
});

test("a link the server cannot check and a Drive folder are framed at once, and the server is not asked", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await signIn(page);
  const asks = []; page.on("request", r => { if (r.url().indexOf("/api/link-preview") >= 0) asks.push(r.url()); });
  const odd = "https://www.loom.com/share/0123456789abcdef";
  for (const [link, src] of [[odd, "https://www.loom.com/embed/0123456789abcdef"], [DRIVE, "https://drive.google.com/embeddedfolderview?id=1VdNoVideoFolder#grid"]]) {
    const task = await makeTask(page, "Framed " + Date.now(), version(link)); made.push(task);
    await openFiles(page, task);
    await expect(page.locator("#drBody .av-version .vp-frame iframe")).toHaveAttribute("src", src);
    await expect(box(page)).toHaveCount(0);
    await page.evaluate(() => closeDrawer());
  }
  expect(asks).toEqual([]);
});

test("what this browser kept for Figma files before videos is taken over: a file seen before is still drawn at once", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await signIn(page);
  const link = "https://www.figma.com/design/FgPubHero" + tag(6) + "/Hero-Banner-Q4";
  const r = await page.evaluate(u => apiFetch("GET", "/api/link-preview?url=" + encodeURIComponent(u)), link);
  expect(r.thumb).toMatch(/^\/files\//);
  /* the first, Figma-only store, as a browser that saw this file last week has it */
  await page.evaluate(([k, th]) => { localStorage.removeItem("cos.linkPreviews"); localStorage.setItem("cos.figmaPreviews", JSON.stringify({ [k]: { t: "Hero Banner Q4", th, w: 800, h: 448, p: false, off: false, at: Date.now() } })); }, [r.key, r.thumb]);
  await page.reload(); await page.waitForFunction(() => window.ZC_READY === true && API.on);
  const task = await makeTask(page, "Figma kept " + Date.now(), version(link)); made.push(task);
  const drawn = await page.evaluate(t => { openTask(t); S.drawerTab = "files"; renderDrawer(); const b = document.querySelector("#drBody .av-version .fg-box"); return { img: !!b.querySelector(".fg-img"), waiting: !!b.querySelector("[aria-busy]") }; }, task);
  expect(drawn, "the picture at once, no skeleton").toEqual({ img: true, waiting: false });
  expect(await page.evaluate(k => [localStorage.getItem("cos.figmaPreviews"), !!JSON.parse(localStorage.getItem("cos.linkPreviews") || "{}")[k]], r.key)).toEqual([null, true]);
  await page.evaluate(() => closeDrawer());
});

/* the task panel on a phone keeps its buttons compact (src/v38.css "The task panel on a phone"); the box's are at least 28 px */
test("at 390 px, in English and Indonesian, light and dark, the picture and its buttons fit, and Play keeps the size", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const wide = ytId("Pub"), short = ytId("Srt"), priv = ytId("Prv");
  const links = ["https://www.youtube.com/watch?v=" + wide, "https://www.youtube.com/shorts/" + short, "https://www.youtube.com/watch?v=" + priv];
  const tasks = [];
  for (const l of links) { const t = await makeTask(page, "Video phone " + Date.now(), version(l)); made.push(t); tasks.push(t); }
  const fit = () => page.evaluate(() => {
    const x = document.querySelector("#drBody .av-version .vd-box"), r = x.getBoundingClientRect(), btns = Array.from(x.querySelectorAll(".vd-acts button")).map(e => e.getBoundingClientRect());
    return { inside: r.left >= -1 && r.right <= innerWidth + 1, btns: btns.length, ok: btns.every(k => k.height >= 28 && k.left >= r.left - 1 && k.right <= r.right + 1 && k.top >= r.top - 1 && k.bottom <= r.bottom + 1), wide: document.documentElement.scrollWidth <= innerWidth, labels: Array.from(x.querySelectorAll(".vd-acts button")).every(e => e.scrollWidth <= e.clientWidth + 1) };
  });
  try {
    for (const lang of ["en", "id"]) {
      await page.evaluate(l => setLanguage(l), lang); await page.waitForFunction(l => UI_LANG === l, lang);
      for (const theme of ["light", "dark"]) {
        await page.evaluate(t => document.documentElement.setAttribute("data-theme", t), theme);
        for (let i = 0; i < tasks.length; i++) {
          const at = links[i] + " " + lang + " " + theme;
          await openFiles(page, tasks[i]);
          await expect(box(page).locator(i === 2 ? ".vd-card" : ".vd-img")).toBeVisible({ timeout: 10000 });
          await expect.poll(fit, { message: at }).toEqual({ inside: true, btns: 2, ok: true, wide: true, labels: true });
          await expect(box(page).getByRole("button", { name: lang === "id" ? "Putar" : "Play", exact: true })).toBeVisible();
          await expect(box(page).getByRole("button", { name: lang === "id" ? "Buka di YouTube" : "Open in YouTube" })).toBeVisible();
          /* the card's words read on the card in both themes: not the box's own colour */
          if (i === 2) {
            const c = await box(page).evaluate(x => [getComputedStyle(x.querySelector(".vd-card-name")).color, getComputedStyle(x).backgroundColor]);
            expect(c[0], at).not.toBe(c[1]);
          }
          await page.evaluate(() => closeDrawer());
        }
      }
    }
    /* Play on a phone: the player of the picture's size */
    await openFiles(page, tasks[0]);
    await expect(box(page).locator(".vd-img")).toBeVisible();
    const s = await size(box(page));
    expect(Math.abs(s.w / s.h - 16 / 9)).toBeLessThan(0.01);
    await box(page).getByRole("button", { name: "Putar", exact: true }).click();
    expect(await size(page.locator("#drBody .av-version .vp-frame"))).toEqual(s);
    await page.evaluate(() => closeDrawer());
  } finally {
    await page.evaluate(() => { document.documentElement.removeAttribute("data-theme"); setLanguage("en"); });
  }
});
