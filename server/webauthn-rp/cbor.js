'use strict';
/**
 * Minimal CBOR decoder — just enough to parse WebAuthn attestationObjects
 * (maps, byte strings, text strings, unsigned/negative ints, arrays, bools,
 * null, and simple floats aren't needed for WebAuthn so are not supported).
 *
 * This intentionally does NOT depend on any npm package: this sandbox has
 * no registry access (verified via a real 403 — see
 * PHASE-WEBAUTHN-BACKEND-IMPLEMENTATION-REPORT.md). Swap for a real CBOR
 * library (e.g. `cbor`) when network access is available; the decode(buf)
 * contract below is what any replacement needs to satisfy.
 */

function decode(buffer) {
  const state = { buf: buffer, offset: 0 };
  const value = readValue(state);
  return { value, bytesRead: state.offset };
}

function readValue(state) {
  const initialByte = state.buf[state.offset];
  state.offset += 1;
  const majorType = initialByte >> 5;
  const additionalInfo = initialByte & 0x1f;

  switch (majorType) {
    case 0: // unsigned integer
      return readUint(state, additionalInfo);
    case 1: // negative integer
      return -1 - readUint(state, additionalInfo);
    case 2: // byte string
      return readBytes(state, readUint(state, additionalInfo));
    case 3: // text string
      return readBytes(state, readUint(state, additionalInfo)).toString('utf8');
    case 4: { // array
      const len = readUint(state, additionalInfo);
      const arr = new Array(len);
      for (let i = 0; i < len; i++) arr[i] = readValue(state);
      return arr;
    }
    case 5: { // map
      const len = readUint(state, additionalInfo);
      const map = new Map();
      for (let i = 0; i < len; i++) {
        const key = readValue(state);
        const val = readValue(state);
        map.set(key, val);
      }
      return map;
    }
    case 7: // simple/float/bool/null
      if (additionalInfo === 20) return false;
      if (additionalInfo === 21) return true;
      if (additionalInfo === 22) return null;
      if (additionalInfo === 23) return undefined;
      throw new Error(`Unsupported CBOR simple type: ${additionalInfo}`);
    default:
      throw new Error(`Unsupported CBOR major type: ${majorType}`);
  }
}

function readUint(state, additionalInfo) {
  if (additionalInfo < 24) return additionalInfo;
  if (additionalInfo === 24) {
    const v = state.buf.readUInt8(state.offset);
    state.offset += 1;
    return v;
  }
  if (additionalInfo === 25) {
    const v = state.buf.readUInt16BE(state.offset);
    state.offset += 2;
    return v;
  }
  if (additionalInfo === 26) {
    const v = state.buf.readUInt32BE(state.offset);
    state.offset += 4;
    return v;
  }
  if (additionalInfo === 27) {
    const v = state.buf.readBigUInt64BE(state.offset);
    state.offset += 8;
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) return v; // rare for our use
    return Number(v);
  }
  throw new Error(`Unsupported CBOR length encoding: ${additionalInfo}`);
}

function readBytes(state, len) {
  const out = state.buf.subarray(state.offset, state.offset + len);
  state.offset += len;
  return Buffer.from(out);
}

// Minimal CBOR encoder — only the shapes WebAuthn needs (maps with string/int
// keys, byte strings, text strings, small non-negative integers). Used by the
// test-only virtual authenticator to build real attestationObjects/authData
// so tests exercise genuine CBOR + COSE + ECDSA round-trips, not mocks.
function encode(value) {
  if (Buffer.isBuffer(value)) return encodeHead(2, value.length, value);
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'utf8');
    return encodeHead(3, bytes.length, bytes);
  }
  if (typeof value === 'number') {
    if (value >= 0) return encodeHead(0, value);
    return encodeHead(1, -1 - value);
  }
  if (Array.isArray(value)) {
    const head = encodeHead(4, value.length);
    return Buffer.concat([head, ...value.map(encode)]);
  }
  if (value instanceof Map) {
    const head = encodeHead(5, value.size);
    const parts = [head];
    for (const [k, v] of value.entries()) {
      parts.push(encode(k));
      parts.push(encode(v));
    }
    return Buffer.concat(parts);
  }
  throw new Error(`Cannot CBOR-encode value of type ${typeof value}`);
}

function encodeHead(majorType, len, trailingBytes) {
  const mt = majorType << 5;
  let head;
  if (len < 24) {
    head = Buffer.from([mt | len]);
  } else if (len <= 0xff) {
    head = Buffer.from([mt | 24, len]);
  } else if (len <= 0xffff) {
    head = Buffer.alloc(3);
    head[0] = mt | 25;
    head.writeUInt16BE(len, 1);
  } else {
    head = Buffer.alloc(5);
    head[0] = mt | 26;
    head.writeUInt32BE(len, 1);
  }
  return trailingBytes ? Buffer.concat([head, trailingBytes]) : head;
}

module.exports = { decode, encode };
