'use strict';

/**
 * core/shell/tests/startup-orchestrator-sound-pack-assets.test.js
 *
 * SEQUENCE PATH INTEGRITY PASS follow-up: startup-orchestrator.js's
 * loadOfficialSoundPack() registers 8 event -> file mappings
 * (wind/birds/forest/typing-click/button-hover/logo-chime/login-success/
 * notification). A prior pass confirmed all 8 files were missing from the
 * repository (0 bytes on disk, real 404s). This test proves they now
 * exist as real, non-trivial, valid audio files at the exact paths
 * startup-orchestrator.js references — not placeholders, not zero-byte
 * stubs.
 *
 * Provenance for every file (source recording, extraction range, and why
 * it was chosen) is documented in
 * assets/audio-source-library/PROVENANCE.md — this test only proves the
 * production files exist and are structurally valid; it does not
 * re-verify the classification judgment calls, which were made by
 * listening/spectrogram inspection, not by an automated rule this test
 * could re-check.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const AUDIO_DIR = path.join(ROOT, 'assets', 'audio');

const REQUIRED_FILES = [
  'wind.mp3',
  'birds.mp3',
  'forest.mp3',
  'typing-click.mp3',
  'button-hover.mp3',
  'logo-chime.mp3',
  'login-success.mp3',
  'notification.mp3',
];

function hasFfprobe() {
  try {
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return true;
  } catch (_err) {
    return false;
  }
}

test('1. every registered sound-pack file exists on disk at its exact production path', () => {
  for (const name of REQUIRED_FILES) {
    const p = path.join(AUDIO_DIR, name);
    assert.ok(fs.existsSync(p), `${p} must exist (referenced by startup-orchestrator.js loadOfficialSoundPack())`);
  }
});

test('2. every file is non-trivial in size (not a zero-byte or accidental empty placeholder)', () => {
  for (const name of REQUIRED_FILES) {
    const p = path.join(AUDIO_DIR, name);
    const size = fs.statSync(p).size;
    assert.ok(size > 1000, `${p} is only ${size} bytes — suspiciously small for a real audio file`);
  }
});

test('3. every file is a real, decodable audio stream with a sensible non-zero duration (skips gracefully if ffprobe is unavailable)', { skip: !hasFfprobe() && 'ffprobe not available in this environment' }, () => {
  for (const name of REQUIRED_FILES) {
    const p = path.join(AUDIO_DIR, name);
    const out = execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      p,
    ]).toString().trim();
    const duration = parseFloat(out);
    assert.ok(Number.isFinite(duration) && duration > 0, `${name}: ffprobe must report a real, positive duration (got "${out}")`);
  }
});

test('4. startup-orchestrator.js still registers all 8 files at these exact paths (mapping unchanged by this asset delivery)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'core', 'shell', 'startup-orchestrator.js'), 'utf8');
  for (const name of REQUIRED_FILES) {
    assert.match(src, new RegExp('assets/audio/' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('5. the preserved source library and its provenance record exist', () => {
  const libDir = path.join(ROOT, 'assets', 'audio-source-library');
  const provenance = path.join(libDir, 'PROVENANCE.md');
  const rawUploads = path.join(libDir, 'raw-uploads');
  assert.ok(fs.existsSync(provenance), 'PROVENANCE.md must document where each production asset came from');
  assert.ok(fs.existsSync(rawUploads) && fs.statSync(rawUploads).isDirectory(), 'raw-uploads/ must preserve the original supplied recordings');
  assert.ok(fs.readdirSync(rawUploads).length > 0, 'raw-uploads/ must not be empty');
});
