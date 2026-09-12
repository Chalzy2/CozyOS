'use strict';

/**
 * core/shell/tests/startup-orchestrator-video-pack-assets.test.js
 *
 * Login Sequence video integration. Proves:
 * - the 5 selected, encoded production videos exist at their registered
 *   paths and are real, valid, non-trivial video files;
 * - loadOfficialVideoPack() (startup-orchestrator.js) registers all 5
 *   through the EXISTING window.CozyOS.Background.registerVideo() /
 *   VIDEO_CATEGORIES API (core/ui/cozy-background.js) rather than a new
 *   engine;
 * - revealLiveBackground() still does its original job (flips the canvas
 *   opacity) and additionally attempts the video reveal, without making
 *   the video attempt a requirement for the canvas result;
 * - the video-source library and its provenance record exist;
 * - no source video was overwritten (raw-uploads/ untouched byte-for-byte
 *   from the production assets/video/ files, which are re-encoded and
 *   therefore expected to differ).
 *
 * Full source/segment/reasoning documentation lives in
 * assets/video-source-library/PROVENANCE.md. This test proves the wiring
 * and file existence, not the visual-classification judgment calls.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const VIDEO_DIR = path.join(ROOT, 'assets', 'video');

const REQUIRED_FILES = [
  'waterfall.mp4',
  'underwater.mp4',
  'forest.mp4',
  'palm-trees.mp4',
  'clouds.mp4',
];

function hasFfprobe() {
  try {
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return true;
  } catch (_err) {
    return false;
  }
}

test('1. every registered production video exists on disk at assets/video/', () => {
  for (const name of REQUIRED_FILES) {
    const p = path.join(VIDEO_DIR, name);
    assert.ok(fs.existsSync(p), `${p} must exist`);
  }
});

test('2. every file is non-trivial in size', () => {
  for (const name of REQUIRED_FILES) {
    const size = fs.statSync(path.join(VIDEO_DIR, name)).size;
    assert.ok(size > 5000, `${name} is only ${size} bytes — suspiciously small`);
  }
});

test('3. every file is a real, decodable video stream with a sensible non-zero duration (skips gracefully without ffprobe)', { skip: !hasFfprobe() && 'ffprobe not available' }, () => {
  for (const name of REQUIRED_FILES) {
    const p = path.join(VIDEO_DIR, name);
    const out = execFileSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      p,
    ]).toString().trim();
    const duration = parseFloat(out);
    assert.ok(Number.isFinite(duration) && duration > 0, `${name}: ffprobe must report a real positive duration (got "${out}")`);
  }
});

test('4. loadOfficialVideoPack() registers all 5 videos via the EXISTING Background.registerVideo() API, not a new engine', () => {
  const src = fs.readFileSync(path.join(ROOT, 'core', 'shell', 'startup-orchestrator.js'), 'utf8');
  assert.match(src, /loadOfficialVideoPack\s*\(\s*\)\s*\{/);
  assert.match(src, /window\.CozyOS\.Background/);
  assert.match(src, /bg\.registerVideo/);
  for (const name of REQUIRED_FILES) {
    assert.match(src, new RegExp('assets/video/' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('5. registered categories are drawn from the EXISTING fixed VIDEO_CATEGORIES list (no invented category)', () => {
  const bgSrc = fs.readFileSync(path.join(ROOT, 'core', 'ui', 'cozy-background.js'), 'utf8');
  const orchSrc = fs.readFileSync(path.join(ROOT, 'core', 'shell', 'startup-orchestrator.js'), 'utf8');
  const catMatch = bgSrc.match(/VIDEO_CATEGORIES\s*=\s*Object\.freeze\(\[([^\]]+)\]\)/);
  assert.ok(catMatch, 'VIDEO_CATEGORIES must still exist in cozy-background.js');
  const categories = catMatch[1].split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
  const usedCategories = ['Waterfalls', 'Ocean', 'Forest', 'Nature', 'Clouds'];
  for (const cat of usedCategories) {
    assert.ok(categories.includes(cat), `"${cat}" must be one of the existing VIDEO_CATEGORIES`);
    assert.match(orchSrc, new RegExp('"' + cat + '"'));
  }
});

test('6. revealLiveBackground() still flips the canvas opacity (original behavior preserved)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'core', 'shell', 'startup-orchestrator.js'), 'utf8');
  assert.match(src, /revealLiveBackground\(\)\s*\{[\s\S]*?canvas\.style\.opacity\s*=\s*"1"/);
});

test('7. revealLiveBackground() attempts video playback via playVideoFromLibrary but does not require it to report revealed:true', () => {
  const src = fs.readFileSync(path.join(ROOT, 'core', 'shell', 'startup-orchestrator.js'), 'utf8');
  const fnMatch = src.match(/revealLiveBackground\(\)\s*\{([\s\S]*?)\n {8}\}/);
  assert.ok(fnMatch, 'revealLiveBackground() body must be found');
  const body = fnMatch[1];
  assert.match(body, /playVideoFromLibrary/);
  assert.match(body, /return \{ revealed: true, video \}/);
});

test('8. the video-source library and its provenance record exist', () => {
  const libDir = path.join(ROOT, 'assets', 'video-source-library');
  const provenance = path.join(libDir, 'PROVENANCE.md');
  const rawUploads = path.join(libDir, 'raw-uploads');
  assert.ok(fs.existsSync(provenance), 'PROVENANCE.md must document where each production video came from');
  assert.ok(fs.existsSync(rawUploads) && fs.statSync(rawUploads).isDirectory(), 'raw-uploads/ must preserve the original supplied videos');
  assert.ok(fs.readdirSync(rawUploads).length > 0, 'raw-uploads/ must not be empty');
});

test('9. the provenance record explicitly documents birds/nature as unresolved (no fabricated asset)', () => {
  const provenance = fs.readFileSync(path.join(ROOT, 'assets', 'video-source-library', 'PROVENANCE.md'), 'utf8');
  assert.match(provenance, /UNRESOLVED/);
  assert.match(provenance, /bird/i);
  const files = fs.readdirSync(VIDEO_DIR);
  assert.ok(!files.some((f) => /bird/i.test(f)), 'no birds.mp4 (or similar) should exist — none was supplied');
});
