#!/usr/bin/env node
/**
 * build-pages-output.js
 *
 * Builds pages-dist/ — the ONLY directory Cloudflare Pages should be
 * configured to deploy from (Build output directory: pages-dist).
 * This script does not delete, move, or modify anything in the
 * source repository; it copies a filtered subset into pages-dist/.
 *
 * Excluded (source/provenance/dev — never deployed):
 *   - assets/audio-source-library/**  (raw recordings; zero runtime
 *     references, confirmed by grep + startup-orchestrator-sound-
 *     pack-assets.test.js #5, which requires this dir to exist AS
 *     source material, separate from assets/audio/ which IS deployed)
 *   - assets/video-source-library/**  (same pattern, confirmed by
 *     startup-orchestrator-video-pack-assets.test.js)
 *   - server/**  (the Node/SQLite auth backend — not static, cannot
 *     run on Pages, deployed separately on Render; publishing its
 *     source via Pages would also expose backend logic needlessly)
 *   - test files and test directories (dev-only)
 *   - docs, any .md file, dashboard-baseline-reference,
 *     evidence, harness, cozy-taskbar-cdp-diagnostic dirs
 *     (internal build/checkpoint history — not public site content)
 *   - .git, node_modules
 *   - core/vendor/tesseract/chi_sim.traineddata specifically (see
 *     KNOWN GAP below — this one is a real runtime asset that still
 *     cannot be excluded silently; it is excluded because Cloudflare
 *     Pages cannot deploy it at all, not because it is unneeded)
 *
 * KNOWN GAP (not solved by this script, flagged deliberately):
 *   core/vendor/tesseract/chi_sim.traineddata is a genuine runtime
 *   dependency (Chinese-Simplified OCR language pack, lazy-fetched
 *   same-origin by tesseract.js when a user selects that language —
 *   see core/modules/ocr/plugins/tesseract-plugin.js). At 44.3 MiB it
 *   exceeds Cloudflare Pages' 25 MiB single-file ceiling regardless of
 *   whether it is "needed". Excluding it from pages-dist/ means the
 *   Chinese-OCR feature will 404 on the Pages-served copy of the site
 *   until it is hosted from a separate origin (e.g. R2, the Render
 *   server, or a public CDN) and tesseract-plugin.js is given an
 *   explicit langPath override to fetch it from there. That is a
 *   real, separate follow-up — not something this deployment-boundary
 *   pass can fix without moving/changing a real production asset,
 *   which was explicitly out of scope.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'pages-dist');

const EXCLUDE_DIRS = new Set([
  '.git', 'node_modules', 'server', 'docs', 'evidence', 'harness',
  'dashboard-baseline-reference', 'test', 'tests', 'pages-dist',
]);
const EXCLUDE_DIR_PREFIXES = [
  'assets/audio-source-library',
  'assets/video-source-library',
  'cozy-taskbar-cdp-diagnostic-',
];
const EXCLUDE_FILE_SUFFIXES = ['.test.js', '.md'];
const EXCLUDE_EXACT_FILES = new Set([
  path.join('core', 'vendor', 'tesseract', 'chi_sim.traineddata'),
]);

let copiedCount = 0;
let skippedForSize = [];

function shouldSkipDir(relPath) {
  const base = path.basename(relPath);
  if (EXCLUDE_DIRS.has(base)) return true;
  for (const prefix of EXCLUDE_DIR_PREFIXES) {
    if (relPath === prefix || relPath.startsWith(prefix + path.sep) || relPath.startsWith(prefix)) return true;
  }
  return false;
}

function shouldSkipFile(relPath) {
  if (EXCLUDE_EXACT_FILES.has(relPath)) return true;
  for (const suffix of EXCLUDE_FILE_SUFFIXES) {
    if (relPath.endsWith(suffix)) return true;
  }
  return false;
}

function walk(relDir) {
  const absDir = path.join(ROOT, relDir);
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const relPath = path.join(relDir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDir(relPath)) continue;
      walk(relPath);
    } else if (entry.isFile()) {
      if (shouldSkipFile(relPath)) continue;
      const absSrc = path.join(ROOT, relPath);
      const size = fs.statSync(absSrc).size;
      if (size > 25 * 1024 * 1024) {
        skippedForSize.push({ file: relPath, sizeMB: (size / (1024 * 1024)).toFixed(1) });
        continue; // never let an oversized file into pages-dist/, whatever it is
      }
      const absDest = path.join(OUT, relPath);
      fs.mkdirSync(path.dirname(absDest), { recursive: true });
      fs.copyFileSync(absSrc, absDest);
      copiedCount++;
    }
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
walk('.');

console.log(`Copied ${copiedCount} files into pages-dist/`);
if (skippedForSize.length) {
  console.log('Skipped for exceeding 25 MiB (unexpected — investigate if not chi_sim.traineddata):');
  for (const s of skippedForSize) console.log(`  ${s.sizeMB} MiB  ${s.file}`);
}
