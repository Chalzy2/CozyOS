'use strict';
const crypto = require('node:crypto');
const cbor = require('./cbor');

// COSE algorithm identifiers we accept.
const COSE_ALG = { ES256: -7, RS256: -257 };
// COSE key type + curve identifiers.
const COSE_KTY = { EC2: 2, RSA: 3 };
const COSE_CRV = { P256: 1 };

function parseAuthenticatorData(buf) {
  if (buf.length < 37) throw new Error('authenticatorData too short');
  const rpIdHash = buf.subarray(0, 32);
  const flagsByte = buf.readUInt8(32);
  const signCount = buf.readUInt32BE(33);
  const flags = {
    userPresent: !!(flagsByte & 0x01),
    userVerified: !!(flagsByte & 0x04),
    attestedCredentialData: !!(flagsByte & 0x40),
    extensionData: !!(flagsByte & 0x80),
  };

  let offset = 37;
  let credentialId = null;
  let coseKeyMap = null;

  if (flags.attestedCredentialData) {
    // aaguid(16) + credIdLen(2) + credId + COSE public key (CBOR map)
    offset += 16; // aaguid, not needed for verification
    const credIdLen = buf.readUInt16BE(offset);
    offset += 2;
    credentialId = Buffer.from(buf.subarray(offset, offset + credIdLen));
    offset += credIdLen;
    const decoded = cbor.decode(buf.subarray(offset));
    coseKeyMap = decoded.value;
    offset += decoded.bytesRead;
  }

  return { rpIdHash, flags, signCount, credentialId, coseKeyMap, consumedBytes: offset };
}

// Convert a COSE_Key (as a Map, per RFC 8152 §7) into a Node KeyObject
// and report which COSE algorithm it is meant to be used with.
function coseKeyToCryptoKey(coseKeyMap) {
  const kty = coseKeyMap.get(1);
  const alg = coseKeyMap.get(3);

  if (kty === COSE_KTY.EC2) {
    const crv = coseKeyMap.get(-1);
    const x = coseKeyMap.get(-2);
    const y = coseKeyMap.get(-3);
    if (crv !== COSE_CRV.P256) throw new Error(`Unsupported EC2 curve: ${crv}`);
    // Uncompressed SEC1 point: 0x04 || X || Y
    const point = Buffer.concat([Buffer.from([0x04]), x, y]);
    const jwk = {
      kty: 'EC',
      crv: 'P-256',
      x: x.toString('base64url'),
      y: y.toString('base64url'),
    };
    const keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    return { keyObject, algorithm: 'ES256', point };
  }

  if (kty === COSE_KTY.RSA) {
    const n = coseKeyMap.get(-1);
    const e = coseKeyMap.get(-2);
    const jwk = { kty: 'RSA', n: n.toString('base64url'), e: e.toString('base64url') };
    const keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    return { keyObject, algorithm: 'RS256' };
  }

  throw new Error(`Unsupported COSE key type: ${kty}`);
}

function verifySignature({ algorithm, keyObject, signedData, signature }) {
  if (algorithm === 'ES256') {
    // WebAuthn ECDSA assertion signatures are ASN.1/DER-encoded (r,s), which
    // is Node's default dsaEncoding, so no extra options are needed here.
    return crypto.verify('sha256', signedData, keyObject, signature);
  }
  if (algorithm === 'RS256') {
    return crypto.verify('sha256', signedData, keyObject, signature);
  }
  throw new Error(`Unsupported signature algorithm: ${algorithm}`);
}

module.exports = {
  parseAuthenticatorData,
  coseKeyToCryptoKey,
  verifySignature,
  COSE_ALG,
};
