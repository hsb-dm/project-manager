const crypto = require("crypto");

const PREFIX = "enc:v1:";
function masterKey() {
  const raw = process.env.COS_SECRET_KEY || "";
  if (!raw) return null;
  if (raw.length < 32) { const e = new Error("COS_SECRET_KEY must contain at least 32 characters"); e.status = 400; throw e; }
  return crypto.createHash("sha256").update(raw).digest();
}
function encrypt(value) {
  value = String(value || "");
  if (!value || value.startsWith(PREFIX)) return value;
  const key = masterKey();
  if (!key) {
    if (process.env.NODE_ENV === "production") { const e = new Error("COS_SECRET_KEY is required before saving provider keys in production"); e.status = 400; throw e; }
    return value;
  }
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]), tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}
function decrypt(value) {
  value = String(value || "");
  if (!value.startsWith(PREFIX)) return value;
  const key = masterKey();
  if (!key) { const e = new Error("COS_SECRET_KEY is required to decrypt stored provider keys"); e.status = 500; throw e; }
  const raw = Buffer.from(value.slice(PREFIX.length), "base64"), iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
module.exports = { encrypt, decrypt, PREFIX };
