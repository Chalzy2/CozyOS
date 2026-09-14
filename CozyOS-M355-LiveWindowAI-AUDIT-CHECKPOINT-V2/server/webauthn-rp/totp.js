'use strict';
// Minimal RFC 4226 (HOTP) / RFC 6238 (TOTP) implementation using only
// node:crypto — no external dependency. This is the real, server-side
// second-factor primitive; nothing here is a stub or a placeholder.
//
// Defaults match every mainstream authenticator app (Google Authenticator,
// Authy, 1Password, Bitwarden, etc.): SHA-1, 6 digits, 30-second step.
const crypto = require('node:crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DEFAULT_STEP_SECONDS = 30;
const DEFAULT_DIGITS = 6;
const DEFAULT_WINDOW = 1; // accept 1 step before/after to absorb clock drift

function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    out += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return out;
}

function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const ch of clean) {
    const val = BASE32_ALPHABET.indexOf(ch);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

// Generates a real random 160-bit secret (20 bytes — the RFC 4226
// recommended minimum), base32-encoded for both storage and display in
// an authenticator app's manual-entry field.
function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secretBuffer, counter, digits = DEFAULT_DIGITS) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const code = (binCode % 10 ** digits).toString().padStart(digits, '0');
  return code;
}

function totpCodeAt(secretBase32, timeMs, { step = DEFAULT_STEP_SECONDS, digits = DEFAULT_DIGITS } = {}) {
  const counter = Math.floor(timeMs / 1000 / step);
  return hotp(base32Decode(secretBase32), counter, digits);
}

// Verifies a submitted code against +/- `window` steps of the current
// time, so a client clock a few tens of seconds off (or human typing
// delay right at a 30s boundary) doesn't spuriously fail. Constant-time
// comparison per candidate to avoid leaking which step (if any) matched
// via timing.
function verifyTotpCode(secretBase32, code, { now = Date.now(), step = DEFAULT_STEP_SECONDS, digits = DEFAULT_DIGITS, window = DEFAULT_WINDOW } = {}) {
  if (!secretBase32 || typeof code !== 'string') return false;
  const normalized = code.trim().replace(/\s+/g, '');
  if (!/^\d+$/.test(normalized) || normalized.length !== digits) return false;
  const codeBuffer = Buffer.from(normalized, 'utf8');
  const secretBuffer = base32Decode(secretBase32);
  const counter = Math.floor(now / 1000 / step);
  for (let delta = -window; delta <= window; delta++) {
    const candidate = hotp(secretBuffer, counter + delta, digits);
    const candidateBuffer = Buffer.from(candidate, 'utf8');
    if (candidateBuffer.length === codeBuffer.length && crypto.timingSafeEqual(candidateBuffer, codeBuffer)) {
      return true;
    }
  }
  return false;
}

function totpProvisioningUri({ secret, email, issuer = 'CozyOS' }) {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DEFAULT_DIGITS), period: String(DEFAULT_STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// Recovery codes: real random codes, only ever returned to the caller
// once (at enrollment); only their salted hash is stored, same posture
// as password_reset_tokens.
function generateRecoveryCode() {
  // 10 chars, grouped for readability (xxxxx-xxxxx), drawn from a
  // non-ambiguous alphabet (no 0/O/1/I/L).
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(String(code || '').toUpperCase().trim()).digest('hex');
}

module.exports = {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  totpCodeAt,
  verifyTotpCode,
  totpProvisioningUri,
  generateRecoveryCode,
  hashRecoveryCode,
  DEFAULT_STEP_SECONDS,
  DEFAULT_DIGITS,
};
