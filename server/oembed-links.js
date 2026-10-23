/* WHICH LINKS A SERVICE'S OWN oEMBED ANSWERS FOR, AND THE ADDRESS IT IS ASKED AT (Oct 2026).

   Two routes ask oEmbed: /api/links/title (server/messages.js: the name of a Figma file, a YouTube or Vimeo video, a
   Loom recording, a Miro board) and /api/link-preview (server/link-preview.js: the picture of a Figma file or of a
   YouTube, Vimeo or Loom video). Both take the link from here, so the two cannot drift apart. Which links are a Figma
   file or a video, and their key or id, is shared/link-providers.js: the same check the page makes to decide which
   link shows its picture first.

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
     with the kind and key alone.
   - YouTube, https://www.youtube.com/oembed: every form people paste is accepted as written (www., m., no www,
     youtu.be with ?si= and ?t=, &list=, &feature=share, shorts, live, http, a #t= fragment). A name is asked with the
     link as written, once its 11-character id checks (an /embed/ link is not asked about); a picture with
     https://www.youtube.com/watch?v=<id>, or /shorts/<id> for a Short, which YouTube answers with its upright shape.
   - Vimeo, https://vimeo.com/api/oembed.json: www., m., http, #t=30s, ?share=copy, /<id>/<hash> are accepted as
     written. A name is asked with the link as written once its number checks; a picture with
     https://vimeo.com/<id>[/<hash>] and width=1280 (a thumbnail of up to 1280 pixels, where the default is 295).
   - Loom, https://www.loom.com/v1/oembed: loom.com with or without www, ?sid=, ?t=, a title before the id, an id in
     capitals are accepted; a fragment straight after the id (/share/<id>#t=5, /share/<id>#) and a slash after it are
     400 Bad Request. Rebuilt as https://www.loom.com/share/<id>, the id 32 hexadecimal digits, for a name and a picture.
   - Miro, https://miro.com/api/v1/oembed: miro.com with or without the slash after the board, ?share_link_id=,
     ?moveToWidget=, a fragment, http, the = written %3D are accepted; www.miro.com is 400 "The required 'url' query
     parameter is invalid". Rebuilt as https://miro.com/app/board/<id>/ (a name only).
   A link that is not one of these, or whose key or id does not have its service's shape, is not asked about. */
"use strict";
const LINKS = require("../shared/link-providers");

const FIGMA_OEMBED = "https://www.figma.com/api/oembed?url=";
const MIRO_BOARD = /^\/app\/board\/([A-Za-z0-9_-]{4,64}(?:=|%3[Dd]){0,2})\/?$/;
const { nameFromLink } = LINKS;

/* A Figma file link, checked: {kind, key, nodeId, name, rest} or null. https (or http when opts.http) on figma.com or
   www.figma.com, no user name, no port, a file, design, prototype, board, slides, make or deck address with a key of
   letters and digits. rest is the path after the key (the name, a branch), as the URL writes it. */
function parseFigmaLink(raw, opts) {
  const p = LINKS.parse(raw, { http: !!(opts && opts.http) });
  return p && p.provider === "figma" ? { kind: p.kind, key: p.key, nodeId: p.nodeId, name: p.name, rest: p.rest } : null;
}
/* The file's address as Figma's oEmbed takes it: always https://www.figma.com/<kind>/<key>; for a name (whole) also
   the path after the key and node-id when it is one. */
function figmaLink(p, whole) {
  let link = "https://www.figma.com/" + p.kind + "/" + p.key;
  if (whole) { link += p.rest || ""; if (p.nodeId) link += "?node-id=" + encodeURIComponent(p.nodeId); }
  return link;
}
const figmaOembedUrl = (p, whole) => FIGMA_OEMBED + encodeURIComponent(figmaLink(p, whole));
const OEMBED = { figma: FIGMA_OEMBED, youtube: "https://www.youtube.com/oembed?format=json&url=", vimeo: "https://vimeo.com/api/oembed.json?url=", loom: "https://www.loom.com/v1/oembed?url=", miro: "https://miro.com/api/v1/oembed?url=" };

/* The oEmbed address for a link's picture (server/link-preview.js), built from its checked key or id alone (a link
   from LINKS.parse; one with no provider is a Figma file, as parseFigmaLink gives it). */
function pictureOembedUrl(p) {
  const provider = p.provider || "figma";
  if (provider === "figma") return figmaOembedUrl(p, false);
  if (provider === "youtube") return OEMBED.youtube + encodeURIComponent(p.shorts ? "https://www.youtube.com/shorts/" + p.id : "https://www.youtube.com/watch?v=" + p.id);
  if (provider === "vimeo") return OEMBED.vimeo + encodeURIComponent("https://vimeo.com/" + p.id + (p.hash ? "/" + p.hash : "")) + "&width=1280";
  if (provider === "loom") return OEMBED.loom + encodeURIComponent("https://www.loom.com/share/" + p.id);
  return null;
}
/* The link to send for a name, from a checked one (null: not one of its files, videos or boards) */
function nameLink(u) {
  const h = u.hostname.toLowerCase();
  if (/^(www\.)?miro\.com$/.test(h)) { const m = MIRO_BOARD.exec(u.pathname); return m ? ["miro", "https://miro.com/app/board/" + m[1].replace(/%3d/gi, "=") + "/"] : null; }
  const p = LINKS.parse(u.href, { http: true }); if (!p) return null;
  if (p.provider === "figma") return ["figma", figmaLink(p, true)];
  if (p.provider === "youtube") return p.form === "embed" ? null : ["youtube", u.href];
  if (p.provider === "vimeo") return ["vimeo", u.href];
  if (p.provider === "loom") return ["loom", "https://www.loom.com/share/" + p.id];
  return null;
}
/* The oEmbed address that names this link, or null when none does. */
function oembedFor(raw) {
  const u = LINKS.link(raw, { http: true }); if (!u) return null;
  const x = nameLink(u);
  return x ? OEMBED[x[0]] + encodeURIComponent(x[1]) : null;
}

module.exports = { oembedFor, parseFigmaLink, figmaLink, figmaOembedUrl, pictureOembedUrl, parseLink: LINKS.parse, nameFromLink, FIGMA_OEMBED };
