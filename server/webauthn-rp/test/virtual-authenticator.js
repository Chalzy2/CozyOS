'use strict';
// A real (not mocked) authenticator simulator for tests: it generates an
// actual P-256 EC key pair, builds a genuine CBOR-encoded attestationObject
// (fmt: "none") and authenticatorData, and produces real ASN.1/DER ECDSA
// signatures for assertions. Every downstream verification step in rp.js
// runs against this exactly as it would against a real platform
// authenticator's output — nothing here is faked or stubbed out.
const crypto = require('node:crypto');
const cbor = require('../cbor');

function makeClientDataJSON(type, challenge, origin) {
  const json = JSON.stringify({ type, challenge, origin });
  return Buffer.from(json, 'utf8').toString('base64url');
}

function buildAuthenticatorData({ rpId, signCount, credentialId, publicKeyCoseMap, userPresent = true }) {
  const rpIdHash = crypto.createHash('sha256').update(rpId).digest();
  const flags = (userPresent ? 0x01 : 0x00) | (credentialId ? 0x40 : 0x00);
  const countBuf = Buffer.alloc(4);
  countBuf.writeUInt32BE(signCount >>> 0, 0);

  const parts = [rpIdHash, Buffer.from([flags]), countBuf];
  if (credentialId) {
    parts.push(Buffer.alloc(16)); // aaguid (zeroed — not relevant to verification)
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16BE(credentialId.length, 0);
    parts.push(lenBuf, credentialId, cbor.encode(publicKeyCoseMap));
  }
  return Buffer.concat(parts);
}

function createVirtualAuthenticator({ rpId, origin }) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const credentialId = crypto.randomBytes(16);
  let signCount = 0;

  const jwk = publicKey.export({ format: 'jwk' });
  const coseKeyMap = new Map([
    [1, 2],  // kty: EC2
    [3, -7], // alg: ES256
    [-1, 1], // crv: P-256
    [-2, Buffer.from(jwk.x, 'base64url')],
    [-3, Buffer.from(jwk.y, 'base64url')],
  ]);

  function register(challenge) {
    const clientDataJSON = makeClientDataJSON('webauthn.create', challenge, origin);
    signCount += 1;
    const authData = buildAuthenticatorData({ rpId, signCount, credentialId, publicKeyCoseMap: coseKeyMap });
    const attestationObject = new Map([
      ['fmt', 'none'],
      ['attStmt', new Map()],
      ['authData', authData],
    ]);
    return {
      credentialId: credentialId.toString('base64url'),
      clientDataJSON,
      attestationObjectB64: cbor.encode(attestationObject).toString('base64url'),
    };
  }

  function authenticate(challenge, { forceSignCount, corruptSignature = false } = {}) {
    const clientDataJSON = makeClientDataJSON('webauthn.get', challenge, origin);
    signCount = typeof forceSignCount === 'number' ? forceSignCount : signCount + 1;
    const authenticatorData = buildAuthenticatorData({ rpId, signCount, credentialId: null, publicKeyCoseMap: null });
    const clientDataHash = crypto.createHash('sha256').update(Buffer.from(clientDataJSON, 'base64url')).digest();
    const signedData = Buffer.concat([authenticatorData, clientDataHash]);
    let signature = crypto.sign('sha256', signedData, privateKey);
    if (corruptSignature) signature = crypto.randomBytes(signature.length);
    return {
      credentialId: credentialId.toString('base64url'),
      clientDataJSON,
      authenticatorDataB64: authenticatorData.toString('base64url'),
      signatureB64: signature.toString('base64url'),
    };
  }

  return { register, authenticate, credentialId: credentialId.toString('base64url') };
}

module.exports = { createVirtualAuthenticator };
