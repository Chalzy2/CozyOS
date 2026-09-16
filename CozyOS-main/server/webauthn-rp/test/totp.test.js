'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateTotpSecret, totpCodeAt, verifyTotpCode, base32Encode, base32Decode, generateRecoveryCode, hashRecoveryCode } = require('../totp');

test('totp: generated secrets are base32 and round-trip through decode', () => {
  const secret = generateTotpSecret();
  assert.match(secret, /^[A-Z2-7]+$/);
  const decoded = base32Decode(secret);
  assert.equal(base32Encode(decoded).replace(/=+$/, ''), secret.replace(/=+$/, ''));
});

test('totp: a code generated for "now" verifies against "now"', () => {
  const secret = generateTotpSecret();
  const now = Date.now();
  const code = totpCodeAt(secret, now);
  assert.equal(code.length, 6);
  assert.equal(verifyTotpCode(secret, code, { now }), true);
});

test('totp: a code from 3 steps away (90s) does not verify with the default window', () => {
  const secret = generateTotpSecret();
  const now = Date.now();
  const staleCode = totpCodeAt(secret, now - 90_000);
  assert.equal(verifyTotpCode(secret, staleCode, { now }), false);
});

test('totp: a code from 1 step away (30s) verifies (clock-drift window)', () => {
  const secret = generateTotpSecret();
  const now = Date.now();
  const nearCode = totpCodeAt(secret, now - 30_000);
  assert.equal(verifyTotpCode(secret, nearCode, { now }), true);
});

test('totp: wrong secret does not verify a code generated for a different secret', () => {
  const secretA = generateTotpSecret();
  const secretB = generateTotpSecret();
  const now = Date.now();
  const codeForA = totpCodeAt(secretA, now);
  assert.equal(verifyTotpCode(secretB, codeForA, { now }), false);
});

test('totp: malformed codes are rejected without throwing', () => {
  const secret = generateTotpSecret();
  assert.equal(verifyTotpCode(secret, 'abcdef'), false);
  assert.equal(verifyTotpCode(secret, '123'), false);
  assert.equal(verifyTotpCode(secret, ''), false);
  assert.equal(verifyTotpCode(secret, null), false);
});

test('recovery codes: distinct, formatted, and hash deterministically', () => {
  const a = generateRecoveryCode();
  const b = generateRecoveryCode();
  assert.match(a, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/);
  assert.notEqual(a, b);
  assert.equal(hashRecoveryCode(a), hashRecoveryCode(a.toLowerCase()), 'hash is case-insensitive to match user entry');
});
