/* Which links are a Figma file or a YouTube, Vimeo or Loom video, and their key or id (Oct 2026): the one check the
   page (src/version-preview.js: which link shows its picture first) and the server (server/oembed-links.js, through it
   server/link-preview.js and the link names of server/messages.js) both use, so they cannot drift apart. */
(function (root) {
  "use strict";
  /* a link as it may be read: https (http too when opts.http), no user name, no port */
  function link(raw, opts) {
    var t = String(raw == null ? "" : raw).trim(); if (!t || t.length > 2000) return null;
    var u; try { u = new URL(t); } catch (e) { return null; }
    var ok = u.protocol === "https:" || (u.protocol === "http:" && !!(opts && opts.http));
    return ok && !u.username && !u.password && !u.port ? u : null;
  }
  /* the words of a link's name part: figma.com/design/KEY/Hero-Banner-Q4 -> "Hero Banner Q4" */
  function nameFromLink(seg) {
    var s = String(seg || ""); try { s = decodeURIComponent(s); } catch (e) { /* as written */ }
    s = s.replace(/[\x00-\x1f\x7f<>]/g, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
    return s.length > 120 ? s.slice(0, 119) + String.fromCharCode(0x2026) : s;
  }
  var FIGMA = /^\/(file|design|proto|board|slides|make|deck)\/([A-Za-z0-9]{2,128})(?=\/|$)(?:\/([^/]*))?/;
  var NODE = /^[A-Za-z0-9:;_-]{1,64}$/;
  var YT_ID = /^[A-Za-z0-9_-]{11}$/;
  var P = {
    /* a file, design, prototype, board, slides, make or deck address with a key of letters and digits; rest is the
       path after the key (the name, a branch) as the URL writes it */
    figma: {
      label: "Figma", hosts: ["figma.com", "www.figma.com"],
      parse: function (u) {
        var m = FIGMA.exec(u.pathname); if (!m) return null;
        var node = u.searchParams.get("node-id");
        return { key: m[2], kind: m[1], nodeId: node && NODE.test(node) ? node : null, name: nameFromLink(m[3]), rest: u.pathname.slice(m[1].length + m[2].length + 2) };
      }
    },
    /* watch?v=, youtu.be/, /shorts/, /embed/, /live/: the 11-character id (form says which; a Short is its own key, as
       YouTube gives it an upright shape when asked as a Short) */
    youtube: {
      label: "YouTube", hosts: ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"],
      parse: function (u) {
        var h = u.hostname.toLowerCase(), path = u.pathname, id = null, form = "", m;
        if (h === "youtu.be") { id = (/^\/([^/]+)\/?$/.exec(path) || [])[1]; form = "youtu.be"; }
        else if (/^\/watch\/?$/.test(path)) { id = u.searchParams.get("v"); form = "watch"; }
        else if ((m = /^\/(shorts|embed|live)\/([^/]+)\/?$/.exec(path))) { id = m[2]; form = m[1]; }
        return id && YT_ID.test(id) ? { key: (form === "shorts" ? "shorts/" : "") + id, id: id, shorts: form === "shorts", form: form, name: "" } : null;
      }
    },
    /* vimeo.com/<id>, with an unlisted video's hash after it (/<id>/<hash> or ?h=<hash>) */
    vimeo: {
      label: "Vimeo", hosts: ["vimeo.com", "www.vimeo.com", "m.vimeo.com"],
      parse: function (u) {
        var m = /^\/([0-9]{1,12})(?:\/([0-9a-f]{6,40}))?\/?$/.exec(u.pathname); if (!m) return null;
        var hash = m[2] || u.searchParams.get("h") || "";
        if (hash && !/^[0-9a-f]{6,40}$/.test(hash)) return null;
        return { key: m[1] + (hash ? "/" + hash : ""), id: m[1], hash: hash || null, name: "" };
      }
    },
    /* loom.com/share/<id> or /embed/<id>, 32 hex digits, a title before it allowed (Brand-review-<id>); nothing after it
       but ?sid= and the like (Loom refuses a slash or more path after the id) */
    loom: {
      label: "Loom", hosts: ["loom.com", "www.loom.com"],
      parse: function (u) {
        var m = /^\/(share|embed)\/(?:[^/]*-)?([0-9A-Fa-f]{32})\/?$/.exec(u.pathname);
        return m ? { key: m[2].toLowerCase(), id: m[2], form: m[1], name: "" } : null;
      }
    }
  };
  /* {provider, key, ...} for a link one of them describes, or null. opts.http: an http link too (a name may be read
     for one; a picture is asked only for https) */
  function parse(raw, opts) {
    var u = link(raw, opts); if (!u) return null;
    var h = u.hostname.toLowerCase();
    for (var id in P) {
      if (P[id].hosts.indexOf(h) < 0) continue;
      var r = P[id].parse(u); if (!r) return null;
      r.provider = id; return r;
    }
    return null;
  }
  var api = { PROVIDERS: P, parse: parse, link: link, nameFromLink: nameFromLink };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.LinkProviders = api;
})(typeof window !== "undefined" ? window : this);
