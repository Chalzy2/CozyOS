/**
 * core/modules/media/dedup/cozy-media-deduplication.js
 * RP-035 COS-MEDIA-DEDUPE-001 — Media Deduplication Detection Engine
 *
 * OWNERSHIP
 *   Composes core/modules/media/cozy-media.js (window.CozyOS.CozyMedia) —
 *   does not rewrite it, does not duplicate its registries. Does not touch
 *   core/modules/duplicate-detection/duplicate-detection.js, which is
 *   scoped strictly to { documentRecord, understanding } text/document
 *   fingerprinting (see that file's own header) and has nothing to do
 *   with media bytes.
 *
 * ARCHITECTURAL RULE (non-negotiable, per RP-035 spec)
 *   Detection and deletion are separate engines. This file only ever
 *   walks: Media -> Detect -> Hash -> Compare -> Classify -> Candidate.
 *   It NEVER deletes, moves, archives, or mutates media bytes, and it
 *   NEVER marks anything for automatic deletion. The most it does is
 *   append an audit record and, best-effort, attach the classification
 *   to CozyMedia's own metadata registry via updateMedia(). Actual
 *   recovery/trash/permanent-deletion lives only in the sibling file
 *   cozy-media-cleanup.js, which requires an explicit owner
 *   policy/confirmation before it will act on any candidate this engine
 *   produces.
 *
 * HONESTY CONTRACT
 *   - Exact identity: real SHA-256 via crypto.subtle over the actual
 *     media bytes. Returns null — never a fabricated hash — if the Web
 *     Crypto API is unavailable in this runtime.
 *   - Near-duplicate identity: real aHash/dHash computed from real
 *     decoded pixel data, via an injectable ImageDecoder adapter
 *     (registerImageDecoder). Returns null — never a fabricated hash —
 *     if no decoder is registered or decoding throws (corrupted media,
 *     unsupported format, etc.).
 *   - A similarity score is a Hamming-distance measurement against an
 *     explicit, documented threshold. It is never reported or treated
 *     as certainty — every near-duplicate candidate carries its raw
 *     distance and the threshold used, so a human (or a future,
 *     explicitly-enabled policy) judges it, not this engine.
 *   - Classification is deterministic and signal-based (declared
 *     source, path convention, explicit descriptor flags such as
 *     assetRole/generated/extractedFrom) — never an AI/LLM guess. If no
 *     signal applies, the class is UNKNOWN. UNKNOWN is a valid, honest
 *     answer, not a defect.
 *   - This engine never treats "the logo appears in this file" as
 *     meaning "this file is the logo" — classification is driven by the
 *     asset's own declared role/origin, not by pixel content
 *     recognition. Two different user photos that happen to contain the
 *     same generated logo overlay are compared on their whole-image
 *     hash, which will differ, so they are correctly NOT flagged as
 *     duplicates of each other.
 */
'use strict';

(function () {
  window.CozyOS = window.CozyOS || {};

  const VERSION = '1.0.1-COS-MEDIA-DEDUPE-001';

  // Canonical audit vocabulary (locked, do not rename without an
  // explicit new milestone — cozy-media-cleanup.js and any external
  // audit tooling depend on these exact strings):
  //   decisions: DETECTED_DUPLICATE | PROTECTED_MEDIA | NEW_CANONICAL | ERROR
  //   reasons (for DETECTED_DUPLICATE): EXACT_SHA256_MATCH |
  //     NEAR_DUPLICATE_DHASH_CANDIDATE

  const MEDIA_CLASSES = Object.freeze([
    'USER_MEDIA', 'GENERATED_TEMP', 'CACHE', 'THUMBNAIL', 'EXTRACTED', 'UNKNOWN',
  ]);

  // Hamming-distance thresholds, out of 64 measured bits (8x8 hash grid).
  // Explicit and documented — not a hidden magic number.
  const NEAR_DUP_THRESHOLDS = Object.freeze({
    aHash: 8,
    dHash: 8,
  });

  const CLASS_PRIORITY = Object.freeze({
    USER_MEDIA: 0,
    EXTRACTED: 1,
    THUMBNAIL: 2,
    CACHE: 3,
    GENERATED_TEMP: 4,
    UNKNOWN: 5,
  });

  // ---- state (per-runtime; a fresh require()/script-load starts clean) ----
  let _exactIndex = new Map();       // sha256Hex -> [mediaId, ...]
  let _perceptualIndex = new Map();  // mediaId -> { aHash, dHash }
  let _audit = [];                   // append-only
  let _decoder = null;               // (bytes) -> { width, height, pixels(grayscale 0-255) } | throws

  function _now() { return Date.now(); }
  function _genId(prefix) {
    return `${prefix}_${_now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
  function _deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.getOwnPropertyNames(value).forEach((key) => _deepFreeze(value[key]));
      Object.freeze(value);
    }
    return value;
  }

  // ---- ImageDecoder adapter (pluggable composition point) ----
  // Production callers register a real decoder (e.g. Canvas-based) once
  // at startup. Tests register a synthetic decoder. If nothing is
  // registered, perceptual hashing honestly reports unavailable.
  function registerImageDecoder(decoderFn) {
    if (typeof decoderFn !== 'function') {
      throw new Error('[CozyMediaDeduplication] registerImageDecoder requires a function.');
    }
    _decoder = decoderFn;
    return true;
  }
  function unregisterImageDecoder() { _decoder = null; }
  function _hasDecoder() { return typeof _decoder === 'function'; }

  // ---- Exact hashing ----
  async function computeExactHash(bytes) {
    if (typeof crypto === 'undefined' || !crypto.subtle || !bytes) return null;
    try {
      const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const hashBuffer = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (_err) {
      return null;
    }
  }

  // ---- Perceptual hashing ----
  // Resamples decoded grayscale pixels to targetW x targetH via simple
  // box averaging. When the decoder already hands back exactly the
  // target size (common for synthetic/test decoders), this is an
  // identity pass-through — still real code, not a special case.
  function _resample(width, height, pixels, targetW, targetH) {
    if (width === targetW && height === targetH) return Array.from(pixels);
    const out = new Array(targetW * targetH).fill(0);
    for (let ty = 0; ty < targetH; ty++) {
      const y0 = Math.floor((ty * height) / targetH);
      const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * height) / targetH));
      for (let tx = 0; tx < targetW; tx++) {
        const x0 = Math.floor((tx * width) / targetW);
        const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * width) / targetW));
        let sum = 0;
        let count = 0;
        for (let y = y0; y < y1 && y < height; y++) {
          for (let x = x0; x < x1 && x < width; x++) {
            sum += pixels[y * width + x];
            count++;
          }
        }
        out[ty * targetW + tx] = count > 0 ? sum / count : 0;
      }
    }
    return out;
  }

  async function _decode(bytes) {
    if (!_hasDecoder()) return null;
    try {
      const decoded = await _decoder(bytes);
      if (!decoded || !decoded.pixels || !decoded.width || !decoded.height) return null;
      return decoded;
    } catch (_err) {
      return null;
    }
  }

  async function computeAHash(bytes) {
    const decoded = await _decode(bytes);
    if (!decoded) return null;
    try {
      const gray = _resample(decoded.width, decoded.height, decoded.pixels, 8, 8);
      const avg = gray.reduce((a, b) => a + b, 0) / gray.length;
      return gray.map((p) => (p >= avg ? '1' : '0')).join('');
    } catch (_err) {
      return null;
    }
  }

  async function computeDHash(bytes) {
    const decoded = await _decode(bytes);
    if (!decoded) return null;
    try {
      const gray = _resample(decoded.width, decoded.height, decoded.pixels, 9, 8);
      let bits = '';
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          bits += gray[r * 9 + c] > gray[r * 9 + c + 1] ? '1' : '0';
        }
      }
      return bits;
    } catch (_err) {
      return null;
    }
  }

  function hammingDistance(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return null;
    let d = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
    return d;
  }

  // ---- Classification (deterministic, signal-based, never AI-guessed) ----
  function classify(descriptor) {
    if (!descriptor || typeof descriptor !== 'object') return 'UNKNOWN';
    const role = String(descriptor.assetRole || '').toLowerCase();
    if (['logo', 'icon', 'brand', 'splash', 'favicon'].includes(role)) return 'GENERATED_TEMP';
    if (descriptor.generated === true) return 'GENERATED_TEMP';
    if (descriptor.extractedFrom) return 'EXTRACTED';
    const p = String(descriptor.path || descriptor.filename || '').toLowerCase();
    if (descriptor.kind === 'thumbnail' || /thumbnail|(^|[/_-])thumb([/_.-]|$)/.test(p)) return 'THUMBNAIL';
    if (/\/cache\/|\.cache\/|\/tmp\/|\/temp\//.test(p)) return 'CACHE';
    if (descriptor.source === 'user' || /dcim|\/camera\/|\/pictures\/|\/gallery\//.test(p)) return 'USER_MEDIA';
    return 'UNKNOWN';
  }

  // ---- Canonical / reference decision ----
  // Never chooses arbitrarily between two legitimate user files — marks
  // them as ambiguous candidates instead (per the locked rule: an AI
  // classification is not grounds for deletion).
  function decideCanonical(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) return null;
    if (candidates.length === 1) {
      return Object.freeze({ canonicalId: candidates[0].mediaId, duplicateIds: [], ambiguous: false, reason: 'SINGLE_CANDIDATE' });
    }
    const userMediaOnes = candidates.filter((c) => c.classification === 'USER_MEDIA');
    if (userMediaOnes.length >= 2) {
      return Object.freeze({
        canonicalId: null,
        duplicateIds: [],
        ambiguous: true,
        candidateIds: candidates.map((c) => c.mediaId),
        reason: 'MULTIPLE_LEGITIMATE_USER_FILES',
      });
    }
    const sorted = [...candidates].sort((a, b) => {
      const pa = CLASS_PRIORITY[a.classification] ?? 9;
      const pb = CLASS_PRIORITY[b.classification] ?? 9;
      if (pa !== pb) return pa - pb;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
    return Object.freeze({
      canonicalId: sorted[0].mediaId,
      duplicateIds: sorted.slice(1).map((c) => c.mediaId),
      ambiguous: false,
      reason: 'CLASS_PRIORITY',
    });
  }

  // ---- Audit trail ----
  function _recordAudit(entry) {
    const record = _deepFreeze(Object.assign({
      auditId: _genId('audit'),
      timestamp: _now(),
      recoveryLocation: null,
      recoveryStatus: 'NOT_APPLICABLE',
    }, entry));
    _audit.push(record);
    return record;
  }

  function getAuditTrail(filters) {
    let entries = _audit.slice();
    if (filters && filters.mediaId) entries = entries.filter((e) => e.mediaId === filters.mediaId);
    if (filters && filters.decision) entries = entries.filter((e) => e.decision === filters.decision);
    return Object.freeze(entries);
  }
  function getAuditCount() { return _audit.length; }

  // ---- Scan pipeline: Detect -> Hash -> Compare -> Classify -> Candidate ----
  // Idempotent by design at the index level: re-scanning identical bytes
  // just adds mediaId to the existing exact-hash bucket and correctly
  // reports DETECTED_DUPLICATE again — it never de-duplicates
  // itself out of the audit trail, because every scan is its own
  // auditable event.
  async function scanMedia(descriptor) {
    if (!descriptor || (!descriptor.bytes && descriptor.bytes !== '')) {
      return _recordAudit({
        mediaId: (descriptor && descriptor.mediaId) || null,
        source: descriptor && descriptor.source || null,
        filename: descriptor && descriptor.filename || null,
        path: descriptor && descriptor.path || null,
        exactHash: null,
        perceptualHashes: { aHash: null, dHash: null },
        classification: 'UNKNOWN',
        similarityCandidates: [],
        decision: 'ERROR',
        reason: 'MISSING_BYTES',
      });
    }

    const mediaId = descriptor.mediaId || _genId('media');
    const exactHash = await computeExactHash(descriptor.bytes);
    const aHash = await computeAHash(descriptor.bytes);
    const dHash = await computeDHash(descriptor.bytes);
    const classification = classify(descriptor);
    const isProtected = descriptor.protected === true;

    let decision = 'NEW_CANONICAL';
    let reason = 'NO_MATCH_FOUND';
    let similarityCandidates = [];

    if (exactHash) {
      const existing = _exactIndex.get(exactHash) || [];
      if (existing.length > 0) {
        // Canonical vocabulary: top-level decision is always
        // DETECTED_DUPLICATE for any match (exact or near) — the
        // *reason* field, not the decision, distinguishes exact-hash
        // matches from perceptual near-duplicate candidates. This is
        // what downstream (cozy-media-cleanup.js) branches on.
        decision = 'DETECTED_DUPLICATE';
        reason = 'EXACT_SHA256_MATCH';
        similarityCandidates = existing.map((id) => ({ mediaId: id, matchType: 'EXACT', hammingDistance: 0 }));
      }
      _exactIndex.set(exactHash, existing.concat([mediaId]));
    } else {
      reason = descriptor.bytes ? 'HASH_UNAVAILABLE_CRYPTO_SUBTLE_MISSING' : reason;
    }

    if (decision !== 'DETECTED_DUPLICATE' && (aHash || dHash)) {
      const nearMatches = [];
      for (const [otherId, hashes] of _perceptualIndex.entries()) {
        const da = hammingDistance(aHash, hashes.aHash);
        const dd = hammingDistance(dHash, hashes.dHash);
        const aNear = da !== null && da <= NEAR_DUP_THRESHOLDS.aHash;
        const dNear = dd !== null && dd <= NEAR_DUP_THRESHOLDS.dHash;
        if (aNear || dNear) {
          nearMatches.push({
            mediaId: otherId,
            matchType: 'NEAR',
            aHashDistance: da,
            dHashDistance: dd,
            aHashThreshold: NEAR_DUP_THRESHOLDS.aHash,
            dHashThreshold: NEAR_DUP_THRESHOLDS.dHash,
          });
        }
      }
      if (nearMatches.length > 0) {
        decision = 'DETECTED_DUPLICATE';
        reason = 'NEAR_DUPLICATE_DHASH_CANDIDATE';
        similarityCandidates = nearMatches;
      }
    }
    if (aHash || dHash) _perceptualIndex.set(mediaId, { aHash, dHash });

    // Owner/user-important media is a hard override: even if this file
    // is byte-identical or perceptually near a duplicate, it is
    // reported PROTECTED_MEDIA, not DETECTED_DUPLICATE. This is a
    // separate, explicit signal (descriptor.protected === true) — never
    // inferred from classification or an AI guess — and the cleanup
    // engine refuses to act on PROTECTED_MEDIA candidates regardless of
    // confirmation or policy.
    if (isProtected) {
      decision = 'PROTECTED_MEDIA';
      reason = 'OWNER_MARKED_PROTECTED';
    }

    const record = _recordAudit({
      mediaId,
      source: descriptor.source || null,
      filename: descriptor.filename || null,
      path: descriptor.path || null,
      exactHash,
      perceptualHashes: { aHash, dHash },
      classification,
      similarityCandidates,
      decision,
      reason,
    });

    // Best-effort CozyMedia composition — additive metadata only, never
    // required for detection to succeed, never a delete/mutate call.
    const CM = window.CozyOS.CozyMedia;
    if (CM && typeof CM.hasMedia === 'function' && typeof CM.updateMedia === 'function') {
      try {
        if (CM.hasMedia(mediaId)) {
          CM.updateMedia(mediaId, { dedupClassification: classification, dedupDecision: decision, dedupAuditId: record.auditId });
        }
      } catch (_err) { /* CozyMedia integration is additive; never block detection on it. */ }
    }

    return record;
  }

  function getVersionInfo() { return VERSION; }

  // Test-only reset — production callers must never call this; it exists
  // so each test file can start from a clean index without cross-test
  // contamination, exactly like resetting a fresh require().
  function _resetForTests() {
    _exactIndex = new Map();
    _perceptualIndex = new Map();
    _audit = [];
    _decoder = null;
  }

  window.CozyOS.CozyMediaDeduplication = Object.freeze({
    registerImageDecoder,
    unregisterImageDecoder,
    computeExactHash,
    computeAHash,
    computeDHash,
    hammingDistance,
    classify,
    decideCanonical,
    scanMedia,
    getAuditTrail,
    getAuditCount,
    MEDIA_CLASSES,
    NEAR_DUP_THRESHOLDS,
    getVersion: getVersionInfo,
    _resetForTests,
  });
})();
