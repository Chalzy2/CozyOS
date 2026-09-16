#!/usr/bin/env node
/**
 * tools/termux/cozy-media-pack.js
 * RP-035 COS-MEDIA-DEDUPE-001 — Termux Media Export-Guard CLI
 *
 * WHAT THIS IS
 *   A real Node.js CLI, meant to run under Termux on the user's Realme
 *   Android phone, against a real filesystem path (the prepared SD
 *   card) — the same real-filesystem role that tools/termux/cozy-pack.js
 *   plays for language packs (RP-035 COS-LANG-PM-001). This file
 *   extends that pattern for media rather than duplicating it: it
 *   requires cozy-pack.js directly and reuses its real, already-tested
 *   filesystem-capability/disk-space/SHA-256 functions instead of
 *   reimplementing them.
 *
 * WHY A SEPARATE FILE FROM cozy-pack.js
 *   Different domain (media bytes vs. language-pack JSON records),
 *   different SD subdirectory tree, different command set. Reusing the
 *   language-pack CLI's file for this would blur two unrelated
 *   responsibilities into one file — the opposite of what composition
 *   is for. What's actually shared (fs capability checks, disk space,
 *   SHA-256) is required in, not copy-pasted.
 *
 * SCOPE
 *   Enforces the SCAN -> HASH -> DEDUPE -> CLASSIFY -> EXPORT order
 *   before anything is written to the SD card, and never exports the
 *   same exact byte content twice under a different filename. This CLI
 *   never deletes anything on the phone or the SD card — export-side
 *   guarding only. Trash/permanent-deletion decisions belong to the
 *   in-app cozy-media-cleanup.js engine, not this tool.
 *
 * PORTABILITY
 *   The dedup index (media/index/index.json) is written under --root,
 *   i.e. physically on the SD card itself, not in phone-local storage —
 *   so the index survives a phone change along with the rest of the
 *   CozyOS storage package, exactly like the language-pack manifests.
 *
 * HONESTY CONTRACT
 *   - Every hash reported is a real SHA-256 of real file bytes read
 *     from disk (via cozy-pack.js's sha256File). Never fabricated.
 *   - Perceptual (near-duplicate) hashing requires real image decoding.
 *     This CLI has no image-decoding library available in a bare
 *     Termux/Node environment (deliberately, per COS-LANG-PM-001's own
 *     "no third-party npm packages required" precedent), so it honestly
 *     reports perceptualHash: null / IMAGE_DECODE_UNAVAILABLE rather
 *     than fabricating a similarity judgment. Near-duplicate detection
 *     for images is a browser-side capability (see
 *     cozy-media-deduplication.js's injectable ImageDecoder), not a
 *     claim made here.
 *   - init-storage / storage-status refuse to report READY on a guess,
 *     identically to cozy-pack.js.
 *
 * USAGE
 *   node cozy-media-pack.js storage-status --root <SD root>
 *   node cozy-media-pack.js init-storage   --root <SD root>
 *   node cozy-media-pack.js hash           --file <path>
 *   node cozy-media-pack.js scan           --dir <path>
 *   node cozy-media-pack.js export         --root <SD root> --file <path> [--role logo|icon|...]
 *   node cozy-media-pack.js list-exports   --root <SD root>
 *   node cozy-media-pack.js test
 */
'use strict';

const fs = require('fs');
const path = require('path');

const langPack = require('./cozy-pack.js'); // real composition, not duplication

const MEDIA_SD_SUBDIRS = ['media', 'media/exports', 'media/index'];
const INDEX_REL_PATH = path.join('media', 'index', 'index.json');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[key] = val;
    } else {
      out._.push(a);
    }
  }
  return out;
}
function requireRoot(args) {
  if (!args.root) { fail('--root <CozyOS SD root path> is required'); return null; }
  return args.root;
}
function fail(msg) {
  console.log(JSON.stringify({ ok: false, reason: msg }, null, 2));
  process.exitCode = 1;
}

// ---- deterministic classification, reused (not reimplemented) from the
// in-app detection engine via a minimal window shim ----
function _loadClassifier() {
  const prevWindow = global.window;
  global.window = { CozyOS: {} };
  try {
    delete require.cache[require.resolve('../../core/modules/media/dedup/cozy-media-deduplication.js')];
    require('../../core/modules/media/dedup/cozy-media-deduplication.js');
    const classify = global.window.CozyOS.CozyMediaDeduplication.classify;
    return classify;
  } finally {
    global.window = prevWindow;
  }
}

function _readIndex(root) {
  const p = path.join(root, INDEX_REL_PATH);
  if (!fs.existsSync(p)) return { entries: {} }; // sha256 -> { exportedPath, exportedAt, originalFilename }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_err) {
    return { entries: {} };
  }
}
function _writeIndex(root, index) {
  const dir = path.join(root, 'media', 'index');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(root, INDEX_REL_PATH), JSON.stringify(index, null, 2));
}

async function cmdStorageStatus(args) {
  const root = requireRoot(args);
  if (!root) return;
  const cap = langPack.checkPathCapability(root);
  const status = cap.exists && cap.isDirectory && cap.readable && cap.writable ? 'READY' : cap.exists ? 'STORAGE_PERMISSION_REQUIRED' : 'STORAGE_UNAVAILABLE';
  console.log(JSON.stringify({ command: 'storage-status', status, capability: cap }, null, 2));
}

async function cmdInitStorage(args) {
  const root = requireRoot(args);
  if (!root) return;
  const cap = langPack.checkPathCapability(root);
  if (!cap.exists) return fail2('init-storage', 'ROOT_PATH_DOES_NOT_EXIST', { root });
  if (!cap.readable || !cap.writable) return fail2('init-storage', 'ROOT_PATH_NOT_READABLE_OR_WRITABLE', { capability: cap });
  const created = [];
  for (const sub of MEDIA_SD_SUBDIRS) {
    const full = path.join(root, sub);
    if (!fs.existsSync(full)) { fs.mkdirSync(full, { recursive: true }); created.push(sub); }
  }
  const space = langPack.getDiskSpace(root);
  console.log(JSON.stringify({ command: 'init-storage', ok: true, root, createdDirs: created, space, verifiedAt: new Date().toISOString() }, null, 2));
}
function fail2(command, reason, extra) {
  console.log(JSON.stringify(Object.assign({ command, ok: false, reason }, extra || {}), null, 2));
  process.exitCode = 1;
}

async function cmdHash(args) {
  const file = args.file;
  if (!file || !fs.existsSync(file)) return fail('--file <path> must exist');
  const result = langPack.sha256FileTwice(file);
  console.log(JSON.stringify({
    command: 'hash', file, sha256: result.hash, hashMatched: result.matched,
    perceptualHash: null, perceptualHashState: 'IMAGE_DECODE_UNAVAILABLE',
  }, null, 2));
}

/**
 * cmdScan({dir})
 *   Real directory walk + real SHA-256 of every file. Classifies each
 *   file deterministically and reports exact-duplicate groups. Never
 *   deletes or moves anything.
 */
async function cmdScan(args) {
  const dir = args.dir;
  if (!dir || !fs.existsSync(dir)) return fail('--dir <path> must exist');
  const classify = _loadClassifier();

  const files = [];
  (function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  })(dir);

  const byHash = new Map();
  const results = [];
  for (const f of files) {
    let sha256 = null;
    try { sha256 = langPack.sha256File(f); } catch (_err) { /* honestly null below */ }
    const classification = classify({ path: f, filename: path.basename(f) });
    results.push({ path: f, sha256, classification });
    if (sha256) {
      if (!byHash.has(sha256)) byHash.set(sha256, []);
      byHash.get(sha256).push(f);
    }
  }
  const exactDuplicateGroups = Array.from(byHash.entries())
    .filter(([, paths]) => paths.length > 1)
    .map(([sha256, paths]) => ({ sha256, paths }));

  console.log(JSON.stringify({
    command: 'scan', dir, fileCount: files.length, results, exactDuplicateGroups,
    note: 'Detection only. Nothing was moved or deleted.',
  }, null, 2));
}

/**
 * cmdExport({root, file, role})
 *   The SD export guard: SCAN -> HASH -> DEDUPE -> CLASSIFY -> EXPORT.
 *   Refuses to write the same exact byte content to the SD card twice
 *   under a different filename — checks the portable index first.
 */
async function cmdExport(args) {
  const root = requireRoot(args);
  if (!root) return;
  const file = args.file;
  if (!file || !fs.existsSync(file)) return fail('--file <path> must exist');

  const cap = langPack.checkPathCapability(root);
  if (!cap.exists || !cap.writable) return fail2('export', 'SD_ROOT_NOT_WRITABLE', { capability: cap });

  // SCAN + HASH
  const sha256 = langPack.sha256File(file);
  // CLASSIFY
  const classify = _loadClassifier();
  const classification = classify({ path: file, filename: path.basename(file), assetRole: args.role });

  // DEDUPE (against the portable, SD-resident index)
  const index = _readIndex(root);
  const existing = index.entries[sha256];
  if (existing) {
    console.log(JSON.stringify({
      command: 'export', ok: true, action: 'DUPLICATE_EXPORT_SKIPPED', sha256, classification,
      existingExport: existing, attemptedFile: file,
      reason: 'IDENTICAL_BYTE_CONTENT_ALREADY_EXPORTED',
    }, null, 2));
    return;
  }

  // EXPORT
  const exportsDir = path.join(root, 'media', 'exports');
  fs.mkdirSync(exportsDir, { recursive: true });
  const destName = `${sha256.slice(0, 12)}-${path.basename(file)}`;
  const destPath = path.join(exportsDir, destName);
  fs.copyFileSync(file, destPath);

  index.entries[sha256] = {
    exportedPath: path.relative(root, destPath),
    exportedAt: new Date().toISOString(),
    originalFilename: path.basename(file),
    originalPath: file,
    classification,
  };
  _writeIndex(root, index);

  console.log(JSON.stringify({
    command: 'export', ok: true, action: 'EXPORTED', sha256, classification,
    destPath: path.relative(root, destPath),
  }, null, 2));
}

async function cmdListExports(args) {
  const root = requireRoot(args);
  if (!root) return;
  const index = _readIndex(root);
  console.log(JSON.stringify({ command: 'list-exports', root, count: Object.keys(index.entries).length, entries: index.entries }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  const commands = {
    'storage-status': cmdStorageStatus,
    'init-storage': cmdInitStorage,
    hash: cmdHash,
    scan: cmdScan,
    export: cmdExport,
    'list-exports': cmdListExports,
  };
  if (command === 'test') { require('./tests/cozy-media-pack.test.js'); return; }
  const fn = commands[command];
  if (!fn) {
    console.log('Unknown command. Usage: node cozy-media-pack.js <storage-status|init-storage|hash|scan|export|list-exports|test> [--flags]');
    process.exitCode = 1;
    return;
  }
  await fn(args);
}

if (require.main === module) { main(); }

module.exports = { cmdStorageStatus, cmdInitStorage, cmdHash, cmdScan, cmdExport, cmdListExports, MEDIA_SD_SUBDIRS, INDEX_REL_PATH };
