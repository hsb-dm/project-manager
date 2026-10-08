/* People and their status, seen by everyone:
   - Projects: All projects / My projects, remembered for the person;
   - an @mention (comment or chat) opens its person's card, and the card's photo opens large;
   - someone else's photo opens large from their profile;
   - choosing a profile photo first crops it (drag, zoom), and what is in the circle is saved;
   - a theme colour can be dragged through the picker without the picker or the panel closing;
   - a status (focus, meeting…) reaches everyone without a reload;
   - every channel — #general too, for everyone and for a team — can be renamed and described.
   The server side: tests/people-live.test.js. */
const { test, expect } = require("@playwright/test");
test.describe.configure({ mode: "serial" });
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
async function signIn(page, who) {
  await page.goto("/");
  await page.locator("#au_email").fill(who.email);
  await page.locator("#au_pw").fill(who.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
}
const tag = Date.now().toString(36);
const PIA = { name: "Pia Peeps " + tag, email: "pia-" + tag + "@e2e.test", pw: "Pia!Peeps-2026x" };
const QUINN = { name: "Quinn Photo " + tag, email: "quinn-" + tag + "@e2e.test" };
let ids = {};
/* a picture the browser draws: red on the left 300 pixels, blue on the right 300 */
const twoTone = (page, w, h, split) => page.evaluate(o => { const c = document.createElement("canvas"); c.width = o.w; c.height = o.h; const g = c.getContext("2d"); g.fillStyle = "#ff0000"; g.fillRect(0, 0, o.split, o.h); g.fillStyle = "#0000ff"; g.fillRect(o.split, 0, o.w - o.split, o.h); return c.toDataURL("image/png"); }, { w, h, split });

test("setup: two members, one with a photo", async ({ page }) => {
  await signIn(page, ADMIN);
  const photo = await twoTone(page, 64, 64, 32);
  ids = await page.evaluate(async o => {
    const made = {};
    for (const [k, p] of [["pia", o.pia], ["quinn", o.quinn]]) {
      await apiFetch("POST", "/api/members", { name: p.name, email: p.email, perm: "member", cap: 40 });
      const people = (await apiFetch("GET", "/api/bootstrap")).people; made[k] = Object.keys(people).find(id => people[id].email === p.email);
    }
    await apiFetch("POST", "/api/members/" + made.pia + "/password", { password: o.pia.pw });
    const people = (await apiFetch("GET", "/api/bootstrap")).people;
    await apiFetch("PUT", "/api/members/" + made.quinn, Object.assign({}, people[made.quinn], { id: made.quinn, avatar: o.photo }));
    return made;
  }, { pia: PIA, quinn: QUINN, photo });
  expect(ids.pia && ids.quinn).toBeTruthy();
});

test("Projects: All projects or My projects, and the choice is remembered", async ({ page }) => {
  await signIn(page, ADMIN);
  const p = await page.evaluate(async o => {
    const mine = "pmine" + o.tag, theirs = "ptheirs" + o.tag;
    await apiFetch("POST", "/api/projects", { id: mine, name: "Mine " + o.tag, status: "active", owner: ME });
    const l = await apiFetch("POST", "/api/projects", { id: theirs, name: "Theirs " + o.tag, status: "active", owner: o.pia, team: [o.pia] });
    PROJECTS = l.map(hProject); myPrefs().projScope = "all"; saveMyPrefs(); S.projectId = null; S.projView = "active"; go("projects");
    return { mine, theirs };
  }, { tag, pia: ids.pia });
  try {
    const card = name => page.locator("#content").getByText(name + " " + tag, { exact: true });
    await expect(page.locator(".proj-scope")).toBeVisible();
    await expect(card("Mine")).toBeVisible();
    await expect(card("Theirs")).toBeVisible();
    await page.locator(".proj-scope button", { hasText: "My projects" }).click();
    await expect(card("Mine")).toBeVisible();
    await expect(card("Theirs")).toHaveCount(0);
    await expect(page.locator(".proj-scope button.on")).toContainText("My projects");
    /* it is the person's choice: it survives a reload */
    await expect.poll(() => page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => (d.people[ME].prefs || {}).projScope))).toBe("mine");
    await page.reload(); await ready(page);
    await page.evaluate(() => { S.projectId = null; go("projects"); });
    await expect(page.locator(".proj-scope button.on")).toContainText("My projects");
    await expect(card("Theirs")).toHaveCount(0);
    expect(await page.evaluate(() => { const was = UI_LANG; UI_LANG = "id"; const r = [tr("All projects"), tr("My projects")]; UI_LANG = was; return r; })).toEqual(["Semua proyek", "Proyek saya"]);
    await page.locator(".proj-scope button", { hasText: "All projects" }).click();
    await expect(card("Theirs")).toBeVisible();
  } finally {
    await page.evaluate(x => { myPrefs().projScope = "all"; saveMyPrefs(); return Promise.all([apiFetch("DELETE", "/api/projects/" + x.mine).catch(() => {}), apiFetch("DELETE", "/api/projects/" + x.theirs).catch(() => {})]); }, p);
  }
});

test("an @mention in a comment opens the person's card; the card's photo opens large", async ({ page }) => {
  await signIn(page, ADMIN);
  const tid = await page.evaluate(async o => {
    const d = await apiFetch("POST", "/api/tasks", { title: "Mention card " + o.tag, status: WS.workflow[0].id, prio: "medium" });
    await apiFetch("POST", "/api/tasks/" + d.id + "/comments", { text: "Hi @" + o.quinn + " please look", vis: "internal" });
    return d.id;
  }, { tag, quinn: QUINN.name });
  try {
    await page.reload(); await ready(page);
    await page.evaluate(id => { openTask(id); S.drawerTab = "comments"; S.commentVis = "internal"; renderDrawer(); }, tid);
    const mention = page.locator('#drawer .msg-mention[data-uid="' + ids.quinn + '"]');
    await expect(mention).toBeVisible();
    await mention.click();
    const card = page.locator("#ctxMenu.profile-pop.open");
    await expect(card).toBeVisible();
    await expect(card.locator(".pp-id b")).toHaveText(QUINN.name);
    await expect(card.getByRole("button", { name: /Message/ })).toBeVisible();
    /* the photo on the card opens large */
    await card.locator(".pp-top .av.img").click();
    await expect(page.locator("#modalWrap.open #modal .modal-body img")).toHaveAttribute("src", /^data:image\/png/);
    await expect(page.locator("#modal .modal-head h3")).toHaveText(QUINN.name);
    await page.evaluate(() => closeModal());
  } finally {
    await page.evaluate(id => { closeDrawer(); return apiFetch("DELETE", "/api/tasks/" + id).catch(() => {}); }, tid);
  }
});

test("an @mention in chat opens the person's card", async ({ page }) => {
  await signIn(page, ADMIN);
  const cid = await page.evaluate(async o => {
    const c = CONVERSATIONS.find(x => x.type === "WORKSPACE");
    await apiFetch("POST", "/api/messages/conversations/" + c.id + "/messages", { body: "Welcome @" + o.pia + " to the team", mentions: [{ userId: o.piaId, display: o.pia }] });
    return c.id;
  }, { pia: PIA.name, piaId: ids.pia });
  await page.evaluate(id => { go("messages"); openConversation(id); }, cid);
  const mention = page.locator('#msgTimeline .msg-mention[data-uid="' + ids.pia + '"]').last();
  await expect(mention).toBeVisible();
  await mention.click();
  await expect(page.locator("#ctxMenu.profile-pop.open .pp-id b")).toHaveText(PIA.name);
  /* opening the card does not open anything else (the message's own menu, a thread…) */
  await expect(page.locator("#modalWrap.open")).toHaveCount(0);
});

test("someone else's photo opens large from their profile", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, PIA);
  await page.evaluate(id => go("team", id), ids.quinn);
  const photo = page.locator(".mp-avatar-view");
  await expect(photo).toBeVisible();
  await expect(page.locator(".mp-avatar-edit")).toHaveCount(0);   /* not hers to change */
  await photo.click();
  await expect(page.locator("#modalWrap.open #modal .modal-body img")).toHaveAttribute("src", /^data:image\/png/);
  await page.evaluate(() => closeModal());
  /* someone without a photo: nothing to open */
  await page.evaluate(() => go("team", ME));
  await expect(page.locator(".mp-avatar")).toBeVisible();
  await page.evaluate(() => go("team", Object.keys(PEOPLE).find(id => PEOPLE[id].perm === "admin" && !PEOPLE[id].avatar)));
  await expect(page.locator(".mp-avatar-view")).toHaveCount(0);
  await page.context().close();
});

test("a new profile photo is cropped first: drag and zoom, and the circle is what is saved", async ({ page }) => {
  await signIn(page, ADMIN);
  const png = await twoTone(page, 600, 400, 300);
  const buffer = Buffer.from(png.split(",")[1], "base64");
  await page.evaluate(() => go("team", ME));
  try {
    const chooser = page.waitForEvent("filechooser");
    await page.evaluate(() => pickAvatar(ME));
    await (await chooser).setFiles({ name: "wide.png", mimeType: "image/png", buffer });
    const view = page.locator("#avcView");
    await expect(view).toBeVisible();
    await expect(page.locator("#modal .modal-head h3")).toHaveText("Crop your photo");
    const width = () => page.evaluate(() => parseFloat(document.getElementById("avcImg").style.width));
    const w1 = await width();
    expect(Math.round(w1)).toBe(420);   /* fills the 280px frame: the short side is 280 */
    /* the slider zooms… */
    await page.evaluate(() => { const z = document.getElementById("avcZoom"); z.value = "2"; z.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(Math.round(await width())).toBe(840);
    /* …and so does the wheel; it never goes below filling the frame */
    await page.evaluate(() => { const z = document.getElementById("avcZoom"); z.value = "1"; z.dispatchEvent(new Event("input", { bubbles: true })); });
    const box = await view.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -200);
    await expect.poll(width).toBeGreaterThan(w1);
    await page.locator("#modal").getByRole("button", { name: "Zoom out" }).click();
    await page.locator("#modal").getByRole("button", { name: "Zoom out" }).click();
    await page.locator("#modal").getByRole("button", { name: "Zoom out" }).click();
    expect(Math.round(await width())).toBe(420);
    /* drag the picture right: its left edge stops at the frame, so the left 400px of the 600 are kept */
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 4 });
    await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    await page.locator("#avcSave").click();
    await expect(page.locator("#modalWrap.open")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (PEOPLE[ME].avatar || "").slice(0, 15))).toBe("data:image/jpeg");
    const look = await page.evaluate(() => new Promise(res => { const im = new Image(); im.onload = () => { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0); const row = g.getImageData(0, 128, im.width, 1).data; let red = 0; for (let x = 0; x < im.width; x++) if (row[x * 4] > 200 && row[x * 4 + 2] < 60) red++; res({ w: im.width, h: im.height, red: red / im.width }); }; im.src = PEOPLE[ME].avatar; }));
    expect(look.w).toBe(256); expect(look.h).toBe(256);
    expect(look.red).toBeGreaterThan(0.7); expect(look.red).toBeLessThan(0.8);   /* 300 of the 400 kept are red */
    await expect.poll(() => page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => (d.people[ME].avatar || "").slice(0, 15)))).toBe("data:image/jpeg");
    /* Cancel keeps the photo there was */
    const before = await page.evaluate(() => PEOPLE[ME].avatar);
    const again = page.waitForEvent("filechooser");
    await page.evaluate(() => pickAvatar(ME));
    await (await again).setFiles({ name: "wide.png", mimeType: "image/png", buffer });
    await expect(page.locator("#avcView")).toBeVisible();
    await page.locator("#modal").getByRole("button", { name: "Cancel" }).click();
    expect(await page.evaluate(() => PEOPLE[ME].avatar)).toBe(before);
    /* not a picture: said so, nothing opens */
    const third = page.waitForEvent("filechooser");
    await page.evaluate(() => pickAvatar(ME));
    await (await third).setFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await expect(page.locator(".toast").last()).toContainText("Choose a JPG, PNG or WebP picture");
    await expect(page.locator("#modalWrap.open #avcView")).toHaveCount(0);
    expect(await page.evaluate(() => { const was = UI_LANG; UI_LANG = "id"; const r = tr("Crop your photo"); UI_LANG = was; return r; })).toBe("Potong foto kamu");
  } finally {
    await page.evaluate(() => { PEOPLE[ME].avatar = ""; return persistPerson(ME, false); });
  }
});

test("a theme colour can be dragged through the picker: neither the picker nor the panel closes", async ({ page }) => {
  await signIn(page, ADMIN);
  const orig = await page.evaluate(() => WS.theme.accent);
  try {
    await page.locator("#themeBtn").click();
    const pop = page.locator("#themePop");
    await expect(pop).toHaveClass(/open/);
    /* dragging fires input after input; the picker's input must stay the same element throughout */
    const kept = await page.evaluate(async () => {
      const el = document.querySelector("#quickTheme input[type=color]"), out = [];
      for (const v of ["#ff0000", "#00aa00", "#123456"]) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); await new Promise(r => setTimeout(r, 120)); out.push(el.isConnected && document.getElementById("themePop").classList.contains("open") && myPrefs().theme.accent === v); }
      return out;
    });
    expect(kept).toEqual([true, true, true]);
    await expect(page.locator("#quickTheme .sw.on")).toHaveCount(0);   /* a custom colour: no preset is marked */
    /* letting go saves it; the panel stays open */
    await page.evaluate(() => { const el = document.querySelector("#quickTheme input[type=color]"); el.dispatchEvent(new Event("change", { bubbles: true })); });
    await page.waitForTimeout(150);
    await expect(pop).toHaveClass(/open/);
    await expect(page.locator("#quickTheme input[type=color]")).toHaveValue("#123456");
    /* the colour is personal: it is saved with the person, not the workspace */
    await expect.poll(() => page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => ((d.people[ME].prefs || {}).theme || {}).accent)), { timeout: 5000 }).toBe("#123456");
    /* a preset swatch: picked, marked, and the panel stays open */
    const preset = page.locator("#quickTheme .sw[data-v]").nth(2);
    const v = await preset.getAttribute("data-v");
    await preset.click();
    await page.waitForTimeout(150);
    await expect(pop).toHaveClass(/open/);
    expect(await page.evaluate(() => myPrefs().theme.accent)).toBe(v);   /* the colour is personal */
    await expect(page.locator('#quickTheme .sw.on[data-v="' + v + '"]')).toHaveCount(1);
    /* Settings → Theme: the same, and the hex beside it follows the drag */
    await page.evaluate(() => { closePops(); go("settings", "theme"); });
    const kept2 = await page.evaluate(async () => {
      const el = document.querySelector("#content .swatches input[type=color]"), out = [];
      for (const v of ["#aa0000", "#00bb00"]) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); await new Promise(r => setTimeout(r, 120)); out.push(el.isConnected && el.closest(".swatches").querySelector(".sw-hex").value === v); }
      return out;
    });
    expect(kept2).toEqual([true, true]);
  } finally {
    await page.evaluate(() => resetMyTheme());
    await expect.poll(() => page.evaluate(() => apiFetch("GET", "/api/bootstrap").then(d => ((d.people[ME].prefs || {}).theme || {}).accent || null)), { timeout: 5000 }).toBe(null);
    expect(await page.evaluate(() => WS.theme.accent)).toBe(orig);
  }
});

test("a status reaches everyone without a reload", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, ADMIN);
  const pia = await (await browser.newContext()).newPage();
  await signIn(pia, PIA);
  await pia.waitForTimeout(800);   /* its live stream is open */
  const adminId = await admin.evaluate(() => ME);
  try {
    await admin.evaluate(() => setAvailability("focus"));
    await expect.poll(() => pia.evaluate(id => availabilityOf(id).state, adminId), { timeout: 8000 }).toBe("focus");
    /* where it shows: the person's card */
    await pia.evaluate(() => go("messages"));
    await pia.evaluate(id => { const a = document.createElement("span"); a.id = "ppAnchor"; document.body.appendChild(a); profilePop(a, id); }, adminId);
    await expect(pia.locator("#ctxMenu.profile-pop .pp-status")).toContainText("Focus");
    /* cleared: that reaches her too, and the open card follows */
    await admin.evaluate(() => setAvailability("available"));
    await expect.poll(() => pia.evaluate(id => availabilityOf(id).state, adminId), { timeout: 8000 }).toBe("available");
    await expect(pia.locator("#ctxMenu.profile-pop .pp-status")).toContainText("Available");
  } finally {
    await admin.evaluate(() => { if (availabilityOf(ME).state !== "available") setAvailability("available"); });
    await admin.context().close(); await pia.context().close();
  }
});

test("every channel can be renamed and described — #general too, for everyone and for a team", async ({ page }) => {
  await signIn(page, ADMIN);
  const team = await page.evaluate(async t => { const id = "tch" + t; await apiFetch("POST", "/api/teams", { id, name: "Chan Team " + t, color: "blue" }); await apiFetch("POST", "/api/members/" + ME + "/team", { teamId: id }); await reloadAll(); msgRefreshConversations(); return id; }, tag);
  const serverConv = id => page.evaluate(i => apiFetch("GET", "/api/messages/conversations").then(d => (d.items || d).find(c => c.id === i)), id);
  const ws = await page.evaluate(() => CONVERSATIONS.find(c => c.type === "WORKSPACE").id);
  try {
    await page.evaluate(() => go("messages"));
    /* everyone's #general */
    await page.evaluate(id => editChannelModal(id), ws);
    await expect(page.locator("#chName")).toBeEnabled();
    await expect(page.locator("#modal .hint")).toContainText("A new name keeps every member and message");
    await page.locator("#chName").fill("Lobby " + tag);
    await page.locator("#chDesc").fill("Say hello " + tag);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(async () => { const c = await serverConv(ws) || {}; return c.name + "|" + c.description; }).toBe("lobby-" + tag + "|Say hello " + tag);
    await expect(page.locator(".msg-nav-scroll .msg-team-ws .msg-crow-name", { hasText: "lobby-" + tag })).toBeVisible();
    await expect(page.locator(".toast.bad")).toHaveCount(0);
    /* a team's #general */
    await expect.poll(() => page.evaluate(t => { msgRefreshConversations(); return !!CONVERSATIONS.find(c => c.type === "TEAM_DEFAULT" && c.teamId === t && !c._local); }, team), { timeout: 8000 }).toBe(true);
    const tg = await page.evaluate(t => CONVERSATIONS.find(c => c.type === "TEAM_DEFAULT" && c.teamId === t).id, team);
    expect(await page.evaluate(id => convCanEditChannel(conv(id)), tg)).toBe(true);
    await page.evaluate(id => editChannelModal(id), tg);
    await expect(page.locator("#chName")).toBeEnabled();
    await page.locator("#chName").fill("umum");
    await page.locator("#chDesc").fill("Obrolan tim " + tag);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(async () => { const c = await serverConv(tg) || {}; return c.name + "|" + c.description; }).toBe("umum|Obrolan tim " + tag);
    /* a team channel cannot take a name its team already uses */
    await page.evaluate(t => newChannelModal(t), team);
    await page.locator("#chName").fill("umum");
    await page.getByRole("button", { name: "Create channel" }).click();
    await expect(page.locator(".toast").last()).toContainText("A channel with that name already exists");
    await page.evaluate(() => closeModal());
    /* the server says the same, whoever asks */
    const refused = await page.evaluate(t => apiFetch("POST", "/api/messages/conversations", { type: "TEAM_CHANNEL", teamId: t, name: "umum" }).then(() => "made", e => e.message), team);
    expect(refused).toContain("Choose another channel name");
    /* in Indonesian */
    await page.evaluate(id => { UI_LANG = "id"; editChannelModal(id); }, tg);
    await expect(page.locator("#modal .hint")).toContainText("Channel utama tim");
  } finally {
    await page.evaluate(() => { UI_LANG = "en"; closeModal(); });
    await page.evaluate(id => apiFetch("PATCH", "/api/messages/conversations/" + id, { name: "general", description: "" }), ws);
    await page.evaluate(t => apiFetch("DELETE", "/api/teams/" + t).catch(() => {}), team);
  }
});

test("cleanup: the members made here", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.evaluate(x => Promise.all([x.pia, x.quinn].map(id => apiFetch("DELETE", "/api/members/" + id).catch(() => {}))), ids);
});
