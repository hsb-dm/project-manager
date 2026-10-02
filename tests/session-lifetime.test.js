/* A session lasts 60 days from the last time it was used, not from sign-in.

   It used to be extended only when someone happened to use the app in the final day before it ran
   out, so a member who worked every week was still signed out at day 30. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
delete process.env.COS_SESSION_HOURS; delete process.env.COS_SESSION_RENEW_HOURS;
const auth = require('../server/auth');
const DAY = 86400000;

function db() {
  const d = new DatabaseSync(':memory:');
  d.exec('CREATE TABLE users(id TEXT PRIMARY KEY,is_active INTEGER,last_login_at TEXT); CREATE TABLE sessions(id TEXT PRIMARY KEY,user_id TEXT,user_agent TEXT,expires_at TEXT);');
  d.prepare('INSERT INTO users(id,is_active) VALUES (?,1)').run('u1');
  return d;
}
const daysLeft = (d) => (new Date(d.prepare('SELECT expires_at FROM sessions').get().expires_at).getTime() - Date.now()) / DAY;
const setDaysLeft = (d, n) => d.prepare('UPDATE sessions SET expires_at=?').run(new Date(Date.now() + n * DAY).toISOString());

test('a new session lasts 60 days', () => {
  const d = db(); auth.createSession(d, 'u1', 't');
  assert.ok(Math.abs(daysLeft(d) - 60) < 0.01, 'about 60 days, got ' + daysLeft(d));
});

test('using it the same day does not rewrite it', () => {
  const d = db(); const s = auth.createSession(d, 'u1', 't');
  assert.equal(auth.renewSession(d, s.id, auth.readSession(d, s.id)), null);
});

test('using it a day or more later pushes the end back to a full 60 days', () => {
  const d = db(); const s = auth.createSession(d, 'u1', 't');
  /* a weekly user: last pushed back a week ago */
  setDaysLeft(d, 53);
  const exp = auth.renewSession(d, s.id, auth.readSession(d, s.id));
  assert.ok(exp, 'renewed');
  assert.ok(Math.abs(daysLeft(d) - 60) < 0.01, 'back to 60 days, got ' + daysLeft(d));
});

test('a member who comes back after a month is still signed in, and gets the full 60 days again', () => {
  const d = db(); const s = auth.createSession(d, 'u1', 't');
  setDaysLeft(d, 29);   /* the old rule would not have renewed this until the very last day */
  assert.equal(auth.sessionUser(d, s.id), 'u1');
  assert.ok(auth.renewSession(d, s.id, auth.readSession(d, s.id)));
  assert.ok(daysLeft(d) > 59.9);
});

test('after 60 days without use it has ended, and is not revived', () => {
  const d = db(); const s = auth.createSession(d, 'u1', 't');
  setDaysLeft(d, -1);
  assert.equal(auth.readSession(d, s.id), null);
  assert.equal(auth.sessionUser(d, s.id), null);
});
