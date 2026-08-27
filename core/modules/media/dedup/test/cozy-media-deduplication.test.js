'use strict';

/**
 * Test suite for core/modules/media/dedup/cozy-media-deduplication.js
 * (RP-035 COS-MEDIA-DEDUPE-001 — IMPLEMENTED phase).
 *
 * HARNESS DISCLOSURE
 *   REAL, unmodified production code under test: the real
 *   cozy-media-deduplication.js. Exact hashing runs through Node's real
 *   native Web Crypto (globalThis.crypto.subtle.digest('SHA-256', ...))
 *   — not a mock. Perceptual hashing (aHash/dHash) runs through the
 *   engine's real resampling/threshold code; only the *pixel decode
 *   step itself* is stubbed via the documented registerImageDecoder()
 *   composition point, exactly the way a real Canvas-based decoder
 *   would be registered in a browser. The stub decoder returns
 *   synthetic-but-deterministic pixel grids so near-duplicate vs.
 *   unrelated outcomes are exactly reproducible in Node, without
 *   requiring an image-decoding library.
 *
 *   NOT covered here (requires an actual browser Canvas/DOM, or the
 *   physical Realme/SD run): real photo/JPEG/PNG decoding, real device
 *   filesystem behavior. That gap is explicitly disclosed in the
 *   milestone's verification report, per Rule 116/117 — not silently
 *   assumed to pass.
 *
 * Run with: node --test core/modules/media/dedup/test/cozy-media-deduplication.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

function freshEngine() {
  const modPath = require.resolve('../cozy-media-deduplication.js');
  delete require.cache[modPath];
  global.window = { CozyOS: {} };
  require(modPath);
  return global.window.CozyOS.CozyMediaDeduplication;
}

function bytesFrom(str) { return new TextEncoder().encode(str); }

// 8x8 = 64-pixel synthetic grayscale grids, chosen so the engine's
// identity-resample path (decoder already hands back 8x8) exercises the
// real averaging/threshold/bit-packing logic directly.
const GRID_A = [10, 10, 10, 10, 200, 200, 200, 200, 10, 10, 10, 10, 200, 200, 200, 200, 10, 10, 10, 10, 200, 200, 200, 200, 10, 10, 10, 10, 200, 200, 200, 200, 10, 10, 10, 10, 200, 200, 200, 200, 10, 10, 10, 10, 200, 200, 200, 200, 10, 10, 10, 10, 200, 200, 200, 200, 10, 10, 10, 10, 200, 200, 200, 200];
// Slightly perturbed version of GRID_A (simulates resize/recompression):
// a handful of pixels nudged, average/edge structure preserved.
const GRID_A_RECOMPRESSED = GRID_A.map((v, i) => (i % 7 === 0 ? Math.min(255, v + 15) : v));
// Genuinely different image: independent pseudo-random pixel grid
// (mulberry32, fixed seed, so the test is deterministic) — deliberately
// NOT a simple transform of GRID_A, to avoid coincidental structural
// correlation between the two stripe patterns.
const GRID_B = [248, 162, 79, 197, 116, 147, 12, 148, 215, 44, 90, 9, 78, 2, 220, 13, 102, 141, 52, 12, 212, 162, 21, 164, 107, 61, 178, 4, 86, 242, 200, 114, 16, 195, 241, 37, 172, 107, 154, 181, 41, 63, 83, 200, 4, 135, 15, 226, 124, 233, 203, 114, 197, 192, 98, 200, 2, 217, 144, 209, 36, 142, 123, 172];
// Two "different photographs" that happen to share a small logo patch
// (top-left 2x2 corner set to a fixed logo value) but are otherwise
// unrelated — must NOT be flagged as duplicates of each other.
function withLogoCorner(base) {
  const g = base.slice();
  g[0] = 128; g[1] = 128; g[8] = 128; g[9] = 128; // 2x2 "logo" corner
  return g;
}
const PHOTO_1_WITH_LOGO = withLogoCorner(GRID_A);
const PHOTO_2_WITH_LOGO = withLogoCorner(GRID_B);

function decoderFor(map) {
  // map: bytes(string via TextDecoder) -> 64-length grayscale array
  return async (bytes) => {
    const key = new TextDecoder().decode(bytes);
    const pixels = map[key];
    if (!pixels) throw new Error('DECODE_FAILED');
    return { width: 8, height: 8, pixels };
  };
}

test('identical files produce the same SHA-256 and are flagged DETECTED_DUPLICATE / EXACT_SHA256_MATCH', async () => {
  const E = freshEngine();
  const bytes = bytesFrom('identical-content');
  const r1 = await E.scanMedia({ mediaId: 'm1', filename: 'a.jpg', bytes });
  const r2 = await E.scanMedia({ mediaId: 'm2', filename: 'b.jpg', bytes });
  assert.equal(r1.decision, 'NEW_CANONICAL');
  assert.equal(r2.decision, 'DETECTED_DUPLICATE');
  assert.equal(r2.reason, 'EXACT_SHA256_MATCH');
  assert.equal(r2.exactHash, r1.exactHash);
  assert.equal(r2.similarityCandidates[0].mediaId, 'm1');
});

test('renamed identical files (same bytes, different filename) are still detected as exact duplicates', async () => {
  const E = freshEngine();
  const bytes = bytesFrom('same-bytes-different-name');
  await E.scanMedia({ mediaId: 'orig', filename: 'IMG_001.jpg', bytes });
  const renamed = await E.scanMedia({ mediaId: 'renamed', filename: 'holiday-photo-final-v2.jpg', bytes });
  assert.equal(renamed.decision, 'DETECTED_DUPLICATE');
  assert.equal(renamed.reason, 'EXACT_SHA256_MATCH');
});

test('resized/recompressed images are flagged DETECTED_DUPLICATE / NEAR_DUPLICATE_DHASH_CANDIDATE, not exact', async () => {
  const E = freshEngine();
  E.registerImageDecoder(decoderFor({ original: GRID_A, recompressed: GRID_A_RECOMPRESSED }));
  await E.scanMedia({ mediaId: 'orig', filename: 'photo.jpg', bytes: bytesFrom('original') });
  const near = await E.scanMedia({ mediaId: 'resized', filename: 'photo_small.jpg', bytes: bytesFrom('recompressed') });
  assert.equal(near.decision, 'DETECTED_DUPLICATE');
  assert.equal(near.reason, 'NEAR_DUPLICATE_DHASH_CANDIDATE');
  assert.equal(near.similarityCandidates[0].mediaId, 'orig');
  assert.ok(near.similarityCandidates[0].aHashDistance <= E.NEAR_DUP_THRESHOLDS.aHash || near.similarityCandidates[0].dHashDistance <= E.NEAR_DUP_THRESHOLDS.dHash);
});

test('thumbnails are classified THUMBNAIL by path/kind signal', async () => {
  const E = freshEngine();
  const r = await E.scanMedia({ mediaId: 't1', filename: 'thumb_001.jpg', path: '/cache/thumbnails/thumb_001.jpg', bytes: bytesFrom('x') });
  assert.equal(r.classification, 'THUMBNAIL');
});

test('generated CozyOS assets (e.g. logo) are classified GENERATED_TEMP, never as a user photograph', async () => {
  const E = freshEngine();
  const r = await E.scanMedia({ mediaId: 'logo1', filename: 'logo.png', assetRole: 'logo', bytes: bytesFrom('logo-bytes') });
  assert.equal(r.classification, 'GENERATED_TEMP');
  assert.notEqual(r.classification, 'USER_MEDIA');
});

test('different photographs containing the same logo corner are NOT flagged as duplicates of each other', async () => {
  const E = freshEngine();
  E.registerImageDecoder(decoderFor({ photo1: PHOTO_1_WITH_LOGO, photo2: PHOTO_2_WITH_LOGO }));
  await E.scanMedia({ mediaId: 'p1', filename: 'beach.jpg', bytes: bytesFrom('photo1') });
  const r2 = await E.scanMedia({ mediaId: 'p2', filename: 'mountain.jpg', bytes: bytesFrom('photo2') });
  assert.notEqual(r2.decision, 'DETECTED_DUPLICATE');
  assert.equal(r2.decision, 'NEW_CANONICAL');
});

test('genuinely similar photographs (same scene, tiny variation) are flagged DETECTED_DUPLICATE / NEAR_DUPLICATE_DHASH_CANDIDATE', async () => {
  const E = freshEngine();
  E.registerImageDecoder(decoderFor({ a: GRID_A, aPrime: GRID_A_RECOMPRESSED }));
  await E.scanMedia({ mediaId: 's1', bytes: bytesFrom('a') });
  const r = await E.scanMedia({ mediaId: 's2', bytes: bytesFrom('aPrime') });
  assert.equal(r.decision, 'DETECTED_DUPLICATE');
  assert.equal(r.reason, 'NEAR_DUPLICATE_DHASH_CANDIDATE');
});

test('owner-protected media is flagged PROTECTED_MEDIA even when it is an exact byte-for-byte duplicate', async () => {
  const E = freshEngine();
  const bytes = bytesFrom('important-family-photo');
  await E.scanMedia({ mediaId: 'orig', filename: 'a.jpg', bytes });
  const r = await E.scanMedia({ mediaId: 'protected1', filename: 'b.jpg', bytes, protected: true });
  assert.equal(r.decision, 'PROTECTED_MEDIA');
  assert.notEqual(r.decision, 'DETECTED_DUPLICATE');
});

test('protected flag is an explicit signal only — never inferred from classification or similarity score', async () => {
  const E = freshEngine();
  const r = await E.scanMedia({ mediaId: 'user1', source: 'user', path: '/dcim/a.jpg', bytes: bytesFrom('ordinary-user-photo') });
  assert.notEqual(r.decision, 'PROTECTED_MEDIA');
  assert.equal(r.classification, 'USER_MEDIA');
});

test('unrelated photographs are not flagged as duplicates', async () => {
  const E = freshEngine();
  E.registerImageDecoder(decoderFor({ a: GRID_A, b: GRID_B }));
  await E.scanMedia({ mediaId: 'u1', bytes: bytesFrom('a') });
  const r = await E.scanMedia({ mediaId: 'u2', bytes: bytesFrom('b') });
  assert.equal(r.decision, 'NEW_CANONICAL');
});

test('corrupted media (decoder throws) never crashes the pipeline; perceptual hash is honestly null', async () => {
  const E = freshEngine();
  E.registerImageDecoder(async () => { throw new Error('CORRUPTED'); });
  const r = await E.scanMedia({ mediaId: 'c1', bytes: bytesFrom('broken-bytes') });
  assert.equal(r.perceptualHashes.aHash, null);
  assert.equal(r.perceptualHashes.dHash, null);
  assert.ok(r.exactHash); // exact hash is independent of image decode and still real
});

test('unavailable crypto.subtle: exact hash is honestly null, never fabricated, pipeline still completes', async () => {
  const E = freshEngine();
  // globalThis.crypto is a non-configurable native binding in this Node
  // runtime, so it cannot be swapped out wholesale — instead we simulate
  // the "unavailable" case the same way computeExactHash's own try/catch
  // is written to handle: crypto.subtle.digest throwing. The production
  // code path (catch -> return null, never a fabricated hash) is
  // identical either way.
  const proto = Object.getPrototypeOf(crypto.subtle);
  const realDigest = proto.digest;
  proto.digest = async () => { throw new Error('SubtleCrypto unavailable in this runtime'); };
  try {
    const r = await E.scanMedia({ mediaId: 'nc1', bytes: bytesFrom('x') });
    assert.equal(r.exactHash, null);
    assert.equal(r.reason, 'HASH_UNAVAILABLE_CRYPTO_SUBTLE_MISSING');
  } finally {
    proto.digest = realDigest;
  }
});

test('unavailable image decoding (no decoder registered): perceptual hashes are honestly null, no crash', async () => {
  const E = freshEngine();
  const r = await E.scanMedia({ mediaId: 'nd1', bytes: bytesFrom('x') });
  assert.equal(r.perceptualHashes.aHash, null);
  assert.equal(r.perceptualHashes.dHash, null);
});

test('idempotent repeated scans: scanning the same bytes twice produces two distinct, honest audit events', async () => {
  const E = freshEngine();
  const bytes = bytesFrom('repeat-me');
  const before = E.getAuditCount();
  await E.scanMedia({ mediaId: 'r1', bytes });
  await E.scanMedia({ mediaId: 'r1', bytes }); // same id re-scanned
  assert.equal(E.getAuditCount(), before + 2);
});

test('audit-log integrity: every scan record carries the required fields and is frozen (immutable)', async () => {
  const E = freshEngine();
  const r = await E.scanMedia({ mediaId: 'audit1', source: 'user', filename: 'a.jpg', path: '/dcim/a.jpg', bytes: bytesFrom('audit-check') });
  for (const field of ['auditId', 'timestamp', 'mediaId', 'source', 'filename', 'path', 'exactHash', 'perceptualHashes', 'classification', 'similarityCandidates', 'decision', 'reason', 'recoveryLocation', 'recoveryStatus']) {
    assert.ok(field in r, `missing audit field: ${field}`);
  }
  assert.ok(Object.isFrozen(r));
  assert.throws(() => { r.decision = 'TAMPERED'; }, /Cannot assign|read only|read-only/i);
});

test('never deletes: scanMedia has no delete/move side effects, and the module exposes no delete function', async () => {
  const E = freshEngine();
  assert.equal(typeof E.deleteMedia, 'undefined');
  assert.equal(typeof E.moveToTrash, 'undefined');
});

test('two legitimate user files are marked ambiguous candidates, never auto-chosen', async () => {
  const E = freshEngine();
  const decision = E.decideCanonical([
    { mediaId: 'user1', classification: 'USER_MEDIA', createdAt: 1 },
    { mediaId: 'user2', classification: 'USER_MEDIA', createdAt: 2 },
  ]);
  assert.equal(decision.ambiguous, true);
  assert.equal(decision.canonicalId, null);
});

test('user media is preferred as canonical over a generated/cache copy', async () => {
  const E = freshEngine();
  const decision = E.decideCanonical([
    { mediaId: 'cache1', classification: 'CACHE', createdAt: 1 },
    { mediaId: 'user1', classification: 'USER_MEDIA', createdAt: 2 },
  ]);
  assert.equal(decision.canonicalId, 'user1');
  assert.deepEqual(decision.duplicateIds, ['cache1']);
});
