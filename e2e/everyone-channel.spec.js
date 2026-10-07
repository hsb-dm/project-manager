/* Messages has a group like a team's for everyone in the workspace — Everyone — first in the list:
   its #general, which Messages opens on, and the channels an admin adds. None can be left. In
   Indonesian the group reads Semua orang. The server's rules are tests/everyone-channel.test.js. */
const { test, expect } = require("@playwright/test");
const ADMIN = { email: "admin@e2e.test", pw: "E2E!Admin-2026" };
const ready = p => p.waitForFunction(() => window.ZC_READY === true && API.on);
const signIn = async page => {
  await page.goto("/");
  await page.locator("#au_email").fill(ADMIN.email);
  await page.locator("#au_pw").fill(ADMIN.pw);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready(page);
};
const serverConv = (page, id) => page.evaluate(async id => (await apiFetch("GET", "/api/messages/conversations")).find(c => c.id === id), id);

test("Everyone is a group first in the list, opened on its #general, which cannot be left", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => { S.messageConversationId = null; go("messages"); });
  await expect(page.locator(".msg-nav-scroll .msg-section-title").first()).toHaveText("Workspace");
  const group = page.locator(".msg-nav-scroll .msg-team-ws");
  await expect(group.locator(".msg-team-head")).toContainText("Everyone");
  const first = group.locator(".msg-crow").first();
  await expect(first.locator(".msg-crow-name")).toHaveText("general");
  await expect(first, "Messages opens on it").toHaveClass(/\bon\b/);
  const general = await page.evaluate(() => conv(S.messageConversationId));
  expect(general.type).toBe("WORKSPACE");
  expect(await page.evaluate(() => convMembers(conv(S.messageConversationId)).length)).toBe(await page.evaluate(() => Object.keys(PEOPLE).filter(id => PEOPLE[id].active !== false).length));
  await expect(page.locator(".msg-chead-text span").first()).toContainText("Everyone");
  /* no way out, and it says why */
  await page.evaluate(() => { S.messageDetailOpen = true; S.messageDetailTab = "detail"; renderMessages(); });
  await expect(page.locator("#msgDetail .msg-leave")).toHaveCount(0);
  await expect(page.locator("#msgDetail .msg-leave-note")).toContainText("Everyone in the workspace is in this channel");
  /* the group folds like a team's */
  await group.locator(".msg-team-head").click();
  await expect(page.locator(".msg-nav-scroll .msg-team-ws .msg-crow")).toHaveCount(0);
  await page.locator(".msg-nav-scroll .msg-team-ws .msg-team-head").click();
  await expect(page.locator(".msg-nav-scroll .msg-team-ws .msg-crow").first()).toBeVisible();
  /* and in Indonesian */
  await page.evaluate(() => { UI_LANG = "id"; renderMessages(); });
  await expect(page.locator(".msg-nav-scroll .msg-team-ws .msg-team-head")).toContainText("Semua orang");
  await expect(page.locator("#msgDetail .msg-leave-note")).toContainText("Semua orang di workspace ada di channel ini");
  await page.evaluate(() => { UI_LANG = "en"; renderMessages(); });
});

test("an admin adds a channel for everyone from the group's +, and edits #general's description", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => { S.messageConversationId = null; go("messages"); });
  const errors = []; page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.locator(".msg-nav-scroll .msg-team-ws .msg-team-head .iconbtn").click();
  await expect(page.locator("#chTeam")).toHaveValue("ws");
  await expect(page.locator("#chHint")).toContainText("Everyone in the workspace joins automatically");
  await page.locator("#chName").fill("Announcements " + Date.now().toString(36));
  await page.getByRole("button", { name: "Create channel" }).click();
  const made = await page.evaluate(() => conv(S.messageConversationId));
  expect(made.type).toBe("WORKSPACE_CHANNEL");
  await expect(page.locator(".msg-nav-scroll .msg-team-ws .msg-crow-name", { hasText: made.name })).toBeVisible();
  await expect.poll(async () => (await serverConv(page, made.id) || {}).type).toBe("WORKSPACE_CHANNEL");
  /* the same name again is refused before it reaches the server */
  await page.evaluate(() => newChannelModal("ws"));
  await page.locator("#chName").fill(made.name);
  await page.getByRole("button", { name: "Create channel" }).click();
  await expect(page.locator(".toast").last()).toContainText("A channel with that name already exists");
  await page.evaluate(() => closeModal());

  /* #general's description saves without the server refusing it (its name can change too: people-status.spec.js) */
  const gid = await page.evaluate(() => CONVERSATIONS.find(c => c.type === "WORKSPACE").id);
  await page.evaluate(id => editChannelModal(id), gid);
  await expect(page.locator("#chName")).toHaveValue("general");
  const desc = "Company news " + Date.now().toString(36);
  await page.locator("#chDesc").fill(desc);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(async () => (await serverConv(page, gid) || {}).description).toBe(desc);
  await expect(page.locator(".toast.bad")).toHaveCount(0);
  await page.evaluate(id => apiFetch("PATCH", "/api/messages/conversations/" + id, { archived: true }), made.id);
});
