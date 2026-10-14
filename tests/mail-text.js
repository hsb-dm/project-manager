/* An email from the "log" transport's outbox as readable text: its subject (encoded words decoded) and
   its body with quoted-printable undone, so tests can look for a link or a sentence in it. */
function qpDecode(s) {
  s = s.replace(/=\r?\n/g, "");
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-F]{2}$/i.test(s.substr(i + 1, 2))) { bytes.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
    else for (const b of Buffer.from(s[i], "utf8")) bytes.push(b);
  }
  return Buffer.from(bytes).toString("utf8");
}
function readMail(raw) {
  const head = raw.split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]/g, " ");
  const subj = (head.match(/^Subject: (.*)$/m) || [])[1] || "";
  const subject = subj.replace(/=\?UTF-8\?B\?([^?]+)\?=\s*/gi, (_, b) => Buffer.from(b, "base64").toString("utf8")).trim();
  return { subject, text: qpDecode(raw) };
}
module.exports = { readMail, qpDecode };
