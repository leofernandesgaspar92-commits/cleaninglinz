// ============================================================================
//  Auth-Primitive: Passwort-Hashing, JWT, TOTP (RFC 6238), Base32.
//  Bewusst ohne native Abhängigkeiten (nur node:crypto + jsonwebtoken) –
//  läuft identisch auf Windows/macOS/Linux.
// ============================================================================
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-bitte-in-produktion-setzen';
const JWT_TTL = process.env.JWT_TTL || '8h';

// --- Passwörter (scrypt) ---------------------------------------------------
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, saltHex, hashHex] = stored.split('$');
  const hash = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}

// --- JWT -------------------------------------------------------------------
export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_TTL });
}
export function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

// --- Base32 (RFC 4648, ohne Padding) ---------------------------------------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(str) {
  const clean = str.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0, value = 0; const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

// --- TOTP (RFC 6238, HMAC-SHA1, 6 Stellen, 30s) ----------------------------
export function hotp(secretBuf, counter, digits = 6) {
  const buf = Buffer.alloc(8);
  // 64-Bit Counter big-endian
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', secretBuf).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16)
            | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}
export function totp(base32Secret, { t = Date.now(), step = 30, digits = 6 } = {}) {
  const counter = Math.floor(t / 1000 / step);
  return hotp(base32Decode(base32Secret), counter, digits);
}
// Prüft mit ±1 Zeitfenster (Toleranz für Uhr-Drift).
export function verifyTotp(base32Secret, code, { t = Date.now(), step = 30, digits = 6, window = 1 } = {}) {
  const secret = base32Decode(base32Secret);
  const counter = Math.floor(t / 1000 / step);
  for (let w = -window; w <= window; w++) {
    if (hotp(secret, counter + w, digits) === String(code).padStart(digits, '0')) return true;
  }
  return false;
}

export function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}
export function otpauthURL(secret, { label = 'user', issuer = 'Leco' } = {}) {
  const l = encodeURIComponent(`${issuer}:${label}`);
  return `otpauth://totp/${l}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
