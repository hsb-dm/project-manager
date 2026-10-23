/* The providers, for the browser tests (e2e/serve.js sets COS_LINK_FETCH_STUB to this file; server/link-preview.js
   uses it in place of the network): YouTube, Vimeo and Loom from video-stub.js, Figma and anything else from
   figma-stub.js, which fails for an address it does not know, as the test server has no network. */
const figma = require("./figma-stub"), video = require("./video-stub");
async function fetch(url, init) {
  let host = ""; try { host = new URL(url).hostname; } catch (e) { /* figma-stub refuses it */ }
  return video.HOSTS.indexOf(host) >= 0 ? video.fetch(url, init) : figma.fetch(url, init);
}
module.exports = { fetch };
