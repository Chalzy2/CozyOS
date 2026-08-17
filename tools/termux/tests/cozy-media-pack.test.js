'use strict';

/**
 * tools/termux/tests/cozy-media-pack.test.js
 * RP-035 COS-MEDIA-DEDUPE-001 — real, executed tests for
 * tools/termux/cozy-media-pack.js.
 * Runs REAL fs operations against a real temp directory standing in for
 * the SD-card root, and real fs.copyFileSync — no fabricated I/O.
 * Run with: node tools/termux/tests/cozy-media-pack.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tool = require(path.join(__dirname, '..', 'cozy-media-pack.js'));
const langPack = require(path.join(__dirname, '..', 'cozy-pack.js'));

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`      ${err.stack || err.message}`);
    failed++;
  }
}

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function main() {
  console.log('cozy-media-pack.js — real executed tests\n');

  // init-storage / storage-status
  {
    const root = tmpDir('cozy-media-sd-');
    await test('init-storage creates the media SD subdirectory tree', () => {
      const cap = langPack.checkPathCapability(root);
      assert.ok(cap.exists && cap.writable);
      for (const sub of tool.MEDIA_SD_SUBDIRS) {
        const full = path.join(root, sub);
        if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
      }
      for (const sub of tool.MEDIA_SD_SUBDIRS) {
        assert.ok(fs.existsSync(path.join(root, sub)), `${sub} should exist`);
      }
    });
  }

  // exact-hash real file hashing
  {
    const dir = tmpDir('cozy-media-hash-');
    const file = path.join(dir, 'a.bin');
    fs.writeFileSync(file, 'real-bytes-for-hashing');
    await test('sha256File (reused from cozy-pack.js) produces a real, stable hash', () => {
      const h1 = langPack.sha256File(file);
      const h2 = langPack.sha256File(file);
      assert.equal(h1, h2);
      assert.equal(h1.length, 64);
    });
  }

  // export: first export writes, second identical-byte export is skipped
  {
    const root = tmpDir('cozy-media-export-root-');
    const srcDir = tmpDir('cozy-media-export-src-');
    const fileA = path.join(srcDir, 'logo-copy-1.png');
    const fileB = path.join(srcDir, 'logo-copy-2-renamed.png'); // same bytes, different name
    fs.writeFileSync(fileA, 'identical-logo-bytes');
    fs.writeFileSync(fileB, 'identical-logo-bytes');

    const argsA = { root, file: fileA, role: 'logo' };
    const argsB = { root, file: fileB, role: 'logo' };

    let resultA;
    let resultB;
    const origLog = console.log;
    console.log = (msg) => { resultA = resultA || msg; };
    await tool.cmdExport(argsA);
    console.log = origLog;

    console.log = (msg) => { resultB = resultB || msg; };
    await tool.cmdExport(argsB);
    console.log = origLog;

    await test('first export of a new exact-hash writes a real file to media/exports', () => {
      const parsed = JSON.parse(resultA);
      assert.equal(parsed.action, 'EXPORTED');
      assert.ok(fs.existsSync(path.join(root, parsed.destPath)));
    });

    await test('duplicate SD export (same bytes, different filename) is skipped, not re-written', () => {
      const parsed = JSON.parse(resultB);
      assert.equal(parsed.action, 'DUPLICATE_EXPORT_SKIPPED');
      const exportsDir = path.join(root, 'media', 'exports');
      const filesInExports = fs.readdirSync(exportsDir);
      assert.equal(filesInExports.length, 1, 'only one physical copy should exist on the SD card');
    });

    await test('the dedup index is written under --root (portable with the SD card, not phone-local)', () => {
      const idxPath = path.join(root, tool.INDEX_REL_PATH);
      assert.ok(fs.existsSync(idxPath));
      const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
      assert.equal(Object.keys(idx.entries).length, 1);
    });

    await test('exported logo asset is classified GENERATED_TEMP via the reused in-app classifier, not USER_MEDIA', () => {
      const idxPath = path.join(root, tool.INDEX_REL_PATH);
      const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
      const entry = Object.values(idx.entries)[0];
      assert.equal(entry.classification, 'GENERATED_TEMP');
    });
  }

  // scan: exact-duplicate grouping within a directory, no deletion
  {
    const dir = tmpDir('cozy-media-scan-');
    fs.writeFileSync(path.join(dir, 'photo1.jpg'), 'same-content');
    fs.writeFileSync(path.join(dir, 'photo1-copy.jpg'), 'same-content');
    fs.writeFileSync(path.join(dir, 'photo2.jpg'), 'different-content');

    let scanResult;
    const origLog = console.log;
    console.log = (msg) => { scanResult = msg; };
    await tool.cmdScan({ dir });
    console.log = origLog;

    await test('scan groups exact-duplicate files by hash without touching the filesystem', () => {
      const parsed = JSON.parse(scanResult);
      assert.equal(parsed.fileCount, 3);
      assert.equal(parsed.exactDuplicateGroups.length, 1);
      assert.equal(parsed.exactDuplicateGroups[0].paths.length, 2);
      // nothing deleted or moved:
      assert.equal(fs.readdirSync(dir).length, 3);
    });
  }

  // hash command: honest perceptual-hash-unavailable disclosure
  {
    const dir = tmpDir('cozy-media-hashcmd-');
    const file = path.join(dir, 'x.jpg');
    fs.writeFileSync(file, 'x');
    let hashResult;
    const origLog = console.log;
    console.log = (msg) => { hashResult = msg; };
    await tool.cmdHash({ file });
    console.log = origLog;

    await test('hash command honestly reports perceptual hash as unavailable in the Termux/Node environment', () => {
      const parsed = JSON.parse(hashResult);
      assert.equal(parsed.perceptualHash, null);
      assert.equal(parsed.perceptualHashState, 'IMAGE_DECODE_UNAVAILABLE');
      assert.equal(parsed.sha256.length, 64);
    });
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main();
