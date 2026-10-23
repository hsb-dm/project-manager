/* WHICH LINKS A SERVICE'S OWN oEMBED ANSWERS FOR, AND THE ADDRESS IT IS ASKED AT (Oct 2026).

   Two routes ask oEmbed: /api/links/title (server/messages.js: the name of a Figma file, a YouTube or Vimeo video, a
   Loom recording, a Miro board) and /api/link-preview (server/link-preview.js: a Figma file's picture). Both take the
   link from here, so the two cannot drift apart.

   A link is never sent as it was written where its service refuses that form: it is rebuilt from the parts checked
   here. What each oEmbed accepts, asked with curl about real public links on 23 Oct 2026:
   - Figma, https://www.figma.com/api/oembed?url=: 200 for https://www.figma.com/<kind>/<key>, for every kind (file,
     design, proto, board, slides, make, deck), with or without the name after the key, with a branch path, with
     node-id, t or other query parameters, with a fragment. 400 "expected the url host to be a figma host" for
     figma.com without www (and for a host in capitals), 400 "expected the url scheme to be 'https'" for http. 404 "Not
     found." for a private or unknown file. A community link (figma.com/community/file/<id>[/<name>], with or without
     www) is 400 "Not a Figma URL" in every form, and its number as a file key is 404: a community file's name cannot
     be read, so it keeps the words in its link (the route refuses it before anything is fetched). The title is the
     file's whatever the query says, so a name is asked with https://www.figma.com/<kind>/<key><the path after the
     key> and node-id when it is one; nothing else the link carried (t=, a fragment) goes to Figma. A picture is asked
     with the kind and key alone (server/link-preview.js).
   - YouTube, https://www.youtube.com/oembed: every form people paste is accepted as written (www., m., no www,
     youtu.be with ?si= and ?t=, &list=, &feature=share, shorts, live, http, a #t= fragment). Sent as written.
   - Vimeo, https://vimeo.com/api/oembed.json: www., m., http, #t=30s, ?share=copy, /<id>/<hash> are accepted as
     written. Sent as written.
   - Loom, https://www.loom.com/v1/oembed: loom.com with or without www, ?sid=, ?t=, a title before the id, an id in
     capitals are accepted; a fragment straight after the id (/share/<id>#t=5, /share/<id>#) and a slash after it are
     400 Bad Request. Rebuilt as https://www.loom.com/share/<id>, the id 32 hexadecimal digits.
   - Miro, https://miro.com/api/v1/oembed: miro.com with or without the slash after the board, ?share_link_id=,
     ?moveToWidget=, a fragment, http, the = written %3D are accepted; www.miro.com is 400 "The required 'url' query
     parameter is invalid". Rebuilt as https://miro.com/app/board/<id>/.
   A link that is not one of these, or whose key or id does not have its service's shape, is not asked about. */
"use strict";

const FIGMA_OEMBED = "https://www.figma.com/api/oembed?url=";
const FIGMA_KIND = /^\/(file|design|proto|board|slides|make|deck)\/([A-Za-z0-9]{2,128})(?=\/|$)(?:\/([^/]*))?/;
const FIGMA_NODE = /^[A-Za-z0-9:;_-]{1,64}$/;
const LOOM_SHARE = /^\/share\/(?:[^/]*-)?([0-9A-Fa-f]{32})\/?$/;
const MIRO_BOARD = /^\/app\/board\/([A-Za-z0-9_-]{4,64}(?:=|%3[Dd]){0,2})\/?$/;
const CONTROL = new RegExp("[" + String.fromCharCode(0) + "-" + String.fromCharCode(31) + String.fromCharCode(127) + "<>]", "g");
const ELLIPSIS = String.fromCharCode(0x2026);

/* a link as a URL: http or https (https only when asked), no user name or password, no port; else null */
function asUrl(raw, httpsOnly) {
  const text = String(raw || "").trim(); if (!text || text.length > 2000) return null;
  let u; try { u = new URL(text); } catch (e) { return null; }
  if (!(u.protocol === "https:" || (u.protocol === "http:" && !httpsOnly)) || u.username || u.password || u.port) return null;
  return u;
}
/* the words of a link's name part: figma.com/design/KEY/Hero-Banner-Q4 -> "Hero Banner Q4" */
function nameFromLink(seg) {
  let s = String(seg || ""); try { s = decodeURIComponent(s); } catch (e) { /* as written */ }
  s = s.replace(CONTROL, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return s.length > 120 ? s.slice(0, 119) + ELLIPSIS : s;
}
/* A Figma file link, checked: {kind, key, nodeId, name, rest} or null. https (or http when opts.http) on figma.com or
   www.figma.com, no user name, no port, a file, design, prototype, board, slides, make or deck address with a key of
   letters and digits. rest is the path after the key (the name, a branch), as the URL writes it. */
function parseFigmaLink(raw, opts) {
  const u = asUrl(raw, !(opts && opts.http)); if (!u) return null;
  const h = u.hostname.toLowerCase(); if (h !== "figma.com" && h !== "www.figma.com") return null;
  const m = FIGMA_KIND.exec(u.pathname); if (!m) return null;
  const node = u.searchParams.get("node-id");
  return { kind: m[1], key: m[2], nodeId: node && FIGMA_NODE.test(node) ? node : null, name: nameFromLink(m[3]), rest: u.pathname.slice(m[1].length + m[2].length + 2) };
}
/* The file's address as Figma's oEmbed takes it: always https://www.figma.com/<kind>/<key>; for a name (whole) also
   the path after the key and node-id when it is one. */
function figmaLink(p, whole) {
  let link = "https://www.figma.com/" + p.kind + "/" + p.key;
  if (whole) { link += p.rest || ""; if (p.nodeId) link += "?node-id=" + encodeURIComponent(p.nodeId); }
  return link;
}
const figmaOembedUrl = (p, whole) => FIGMA_OEMBED + encodeURIComponent(figmaLink(p, whole));

/* host, then the link to send for a checked URL (null: not one of its files, videos or boards), then the oEmbed */
const PROVIDERS = [
  [/^(www\.)?figma\.com$/, u => { const p = parseFigmaLink(u.href, { http: true }); return p ? figmaLink(p, true) : null; }, FIGMA_OEMBED],
  [/^(www\.|m\.)?youtube\.com$|^youtu\.be$/, u => (u.hostname === "youtu.be" ? u.pathname.length > 1 : /^\/(watch|shorts|live)\b/.test(u.pathname)) ? u.href : null, "https://www.youtube.com/oembed?format=json&url="],
  [/^(www\.)?vimeo\.com$/, u => /^\/\d+/.test(u.pathname) ? u.href : null, "https://vimeo.com/api/oembed.json?url="],
  [/^(www\.)?loom\.com$/, u => { const m = LOOM_SHARE.exec(u.pathname); return m ? "https://www.loom.com/share/" + m[1] : null; }, "https://www.loom.com/v1/oembed?url="],
  [/^(www\.)?miro\.com$/, u => { const m = MIRO_BOARD.exec(u.pathname); return m ? "https://miro.com/app/board/" + m[1].replace(/%3d/gi, "=") + "/" : null; }, "https://miro.com/api/v1/oembed?url="]
];
/* The oEmbed address that names this link, or null when none does. */
function oembedFor(raw) {
  const u = asUrl(raw, false); if (!u) return null;
  const h = u.hostname.toLowerCase(), p = PROVIDERS.find(x => x[0].test(h)); if (!p) return null;
  const link = p[1](u);
  return link ? p[2] + encodeURIComponent(link) : null;
}

module.exports = { oembedFor, parseFigmaLink, figmaLink, figmaOembedUrl, nameFromLink, FIGMA_OEMBED };
