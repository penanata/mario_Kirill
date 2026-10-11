import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

export function getSecret() {
  if (process.env.LIFEOS_SECRET?.trim()) return process.env.LIFEOS_SECRET.trim();
  const file = path.join(process.cwd(), "data", "secret.key");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const secret = randomBytes(32).toString("hex");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

function key() {
  return scryptSync(getSecret(), "lifeos-caldav", 32);
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string) {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
