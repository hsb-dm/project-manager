# ZenCrevia v35 — One chat style (and a chat audit)

Version 1.13.0. Builds on v34. No schema change.

## One style for every message

Follow-up messages from the same person (within 5 minutes) were drawn in grey bubbles while the
first message of the group was plain text. All messages now use the same plain style.

- The hover action pill (react, reply, more) floats above the row instead of reserving a 34 px
  grid column. Follow-up lines were ~36 px tall because of it; they are now 25 px on desktop and
  mobile, so a run of messages reads as one block.
- The hover timestamp beside a follow-up line no longer wraps to two lines ("10:19 / AM").
  On touch screens, where there is no hover, it stays faintly visible.
- During the change a `min-height:0` let rows shrink inside the flex timeline and overlap in long
  conversations. Caught on a screenshot, removed, and row heights re-measured.

## Chat audit — fixes

| # | Finding | Fix |
|---|---|---|
| 1 | A message the server refused (offline, too fast, too long) **looked sent**: it stayed in the timeline with no marker. | Shown as **Not sent** with **Retry** and **Discard**; sending state is dimmed until the server confirms. Verified: 4 refused messages marked, one retried and delivered. |
| 2 | **No send rate limit**: one account posted 60 messages in 0.3 s, flooding the channel and everyone's notifications. | 30 messages per 30 s per person (`COS_MSG_RATE_MAX`), 429 with a readable message. |
| 3 | Messages over 4,000 characters were **cut silently**. | The composer stops at 4,000 with a counter from 90 %; the server refuses longer messages (413) instead of truncating (POST and edit). |
| 4 | **"Pinned" and "edited" disappeared** on follow-up messages (their header is hidden). | Shown inline after the text. |
| 5 | **Screen readers** were not told about new messages; the composer had no label. | New messages from others in the open conversation are announced through a polite live region; composer labelled. |
| 6 | Member avatars in the chat details panel were dimmed along with their names (white initials at 3.7:1). | Avatars keep full colour; axe 0 on Messages. |

Checked and fine: Pin is only offered to people who may pin (server agrees); long URLs and
unbroken words wrap without horizontal scroll; chat XSS payloads stay inert.

## Verification

- `npm test`: **146/146**. `tests/messages.test.js` gains a test for the rate limit and the 4,000
  limit (refused, not cut); its pagination test raises the limit for its own 45-message fixture.
- Chromium: text background identical for first and follow-up messages; row heights 25 px desktop
  and mobile; inline "edited" / "Pinned"; counter at 3,700/4,000; a 5,000-character paste stops at
  4,000; rate-limit toast and Not-sent markers; axe 0 on Messages, and light/dark sweeps of the main
  screens; 13 screens × admin/member × desktop/mobile with no errors or overflow; security probes
  unchanged.
