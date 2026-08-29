#!/usr/bin/env node
'use strict';
/**
 * tools/termux/chromium-dependency-verify.js
 *
 * Run this ON the Termux device to independently verify the Chromium
 * runtime dependency for server/webauthn-rp/test/browser-e2e-passkey-login.test.js,
 * using the SAME discovery + launch-flag logic
 * (server/webauthn-rp/test/browser-launch.js) that the real E2E test
 * uses — so a pass here genuinely predicts the E2E test will find a
 * working browser, not just that some chromium binary exists somewhere.
 *
 * USAGE (from the repo root, in Termux):
 *   node tools/termux/chromium-dependency-verify.js
 *
 * To force a specific binary instead of relying on discovery:
 *   COZY_E2E_CHROMIUM_PATH=/data/data/com.termux/files/usr/bin/chromium-browser \
 *     node tools/termux/chromium-dependency-verify.js
 *
 * WHAT THIS CHECKS, IN ORDER (stops at the first failure)
 *   1. Chromium version — via the discovered binary's own --version.
 *   2. Raw Chromium launches successfully and runs to completion
 *      headless, with the SAME flags browser-launch.js applies for an
 *      Android-native binary (--no-sandbox --no-zygote --disable-gpu
 *      --disable-dev-shm-usage) — this is the direct, non-Playwright
 *      equivalent of the `--headless --no-sandbox --disable-gpu
 *      --dump-dom` command that originally failed, with --no-zygote and
 *      --disable-dev-shm-usage added as the fix.
 *   3. JavaScript executes: the dumped DOM must contain
 *      "CozyOS Chromium OK", produced by an inline <script> element in
 *      the fixture page, not hard-coded in the HTML — proving the JS
 *      engine actually ran, not just that the raw markup was echoed.
 *   4. Only after 1-3 pass: Playwright launches that SAME discovered
 *      executable (via resolveLaunchOptions()) and independently
 *      confirms the version, JS execution, and DOM content again
 *      through the CDP-driven path the real test suite uses.
 *
 * This script prints a clear PASS/FAIL for each step and a final
 * summary. It performs no cleanup of anything outside a private temp
 * directory it creates and removes itself.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { discoverChromium, resolveLaunchOptions } = require('../../server/webauthn-rp/test/browser-launch');

const MARKER = 'CozyOS Chromium OK';
const FIXTURE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body>
<div id="result">not-run</div>
<script>
  // Deliberately computed at runtime, not hard-coded as static markup,
  // so a passing result proves the JS engine actually executed.
  document.getElementById('result').textContent = ['CozyOS', 'Chromium', 'OK'].join(' ');
</script>
</body></html>`;

function step(n, label) {
  console.log(`\n[${n}] ${label}`);
}

function fail(msg) {
  console.log(`    FAIL: ${msg}`);
  process.exitCode = 1;
}

function pass(msg) {
  console.log(`    PASS: ${msg}`);
}

async function main() {
  const { executablePath, isAndroidNative } = discoverChromium();
  if (!executablePath) {
    console.log('No system Chromium discovered (COZY_E2E_CHROMIUM_PATH unset, not on PATH, ');
    console.log('not found under $PREFIX/bin). Falling back to Playwright-managed browser —');
    console.log('this script is specifically for verifying a discovered SYSTEM binary, so');
    console.log('there is nothing further to check here. Set COZY_E2E_CHROMIUM_PATH and rerun.');
    return;
  }
  console.log(`Discovered executable: ${executablePath}`);
  console.log(`Detected as Android-native: ${isAndroidNative}`);

  // Kept in sync with resolveLaunchOptions()'s Android-native args by hand,
  // since this script's raw CLI launch (steps 1-3) intentionally happens
  // BEFORE step 4 requires/loads playwright at all, so it can't just import
  // the args from there. If you change one, change the other. (CP6.2: added
  // --single-process — see browser-launch.js header for why --no-zygote
  // alone does not stop the /proc/self/exe re-exec that breaks under
  // termux-exec. CP6.3: added --no-proxy-server and
  // --disable-crash-reporter after --single-process itself surfaced its
  // own known "Cannot use V8 Proxy resolver in single process mode" error
  // plus Crashpad process-launch noise — see browser-launch.js header.
  // CP6.5: --single-process REMOVED — the CP6.4 real-device bisect
  // reproduced a SIGTRAP from it directly, consistent with documented
  // Chromium-for-Android behavior that single-process mode isn't
  // supported at all, not a flag-ordering issue. Bisect steps 01-03
  // already passed without it, so it was never actually needed for the
  // renderer to launch on this device. See browser-launch.js header for
  // the full correction. --no-proxy-server and --disable-crash-reporter
  // are left as-is, untested in isolation.)
  const flagArgs = isAndroidNative
    ? ['--headless', '--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage', '--in-process-gpu', '--no-proxy-server', '--disable-crash-reporter']
    : ['--headless', '--no-sandbox', '--disable-gpu'];

  // --- Step 1: version ---------------------------------------------------
  step(1, 'Chromium version');
  let version;
  try {
    version = execFileSync(executablePath, ['--version'], { encoding: 'utf8' }).trim();
    pass(version);
  } catch (e) {
    fail(`could not run --version: ${e.message}`);
    return;
  }

  // --- Steps 2+3: raw launch + JS execution via --dump-dom ---------------
  step(2, 'Raw Chromium headless launch + DOM dump (raw CLI, same flags E2E will use)');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozy-chromium-verify-'));
  const fixturePath = path.join(tmpDir, 'fixture.html');
  fs.writeFileSync(fixturePath, FIXTURE_HTML);
  let dom;
  try {
    dom = execFileSync(
      executablePath,
      [...flagArgs, '--dump-dom', `file://${fixturePath}`],
      { encoding: 'utf8', timeout: 30000 },
    );
  } catch (e) {
    fail(`raw launch/dump-dom failed: ${e.message}`);
    // CP6.3: report exit signal/code and whether execFileSync's own
    // timeout fired explicitly, rather than leaving it to be inferred
    // from message text — a hang (killed by our timeout), a real crash
    // (SIGSEGV/SIGABRT from Chromium/Crashpad), and a clean nonzero exit
    // (Chromium ran and refused) are three different findings and need
    // three different next steps.
    console.log(`    killed by our timeout: ${e.killed === true}`);
    console.log(`    signal: ${e.signal || '(none)'}`);
    console.log(`    exit code: ${e.status === null || e.status === undefined ? '(none — process did not exit normally)' : e.status}`);
    console.log('    (stdout/stderr from the attempt, if any, follow)');
    if (e.stdout) console.log('    stdout:', e.stdout.toString().slice(0, 2000));
    if (e.stderr) console.log('    stderr:', e.stderr.toString().slice(0, 2000));
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return;
  }
  pass('chromium exited successfully and produced DOM output');

  step(3, 'JavaScript executed (dumped DOM contains the runtime-computed marker)');
  if (dom.includes(MARKER)) {
    pass(`found "${MARKER}" in dumped DOM`);
  } else {
    fail(`marker "${MARKER}" NOT found in dumped DOM — JS did not run, or launch produced no real page`);
    console.log('    --- dumped DOM (first 2000 chars) ---');
    console.log(dom.slice(0, 2000));
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return;
  }

  // --- Step 4: Playwright launching the SAME executable -------------------
  step(4, 'Playwright launches the same discovered executable');
  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    fail(`playwright is not resolvable from this environment: ${e.message}`);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return;
  }
  try {
    const browser = await playwright.chromium.launch(resolveLaunchOptions({ headless: true }));
    const pwVersion = browser.version();
    const page = await browser.newPage();
    await page.setContent(FIXTURE_HTML);
    const text = await page.evaluate(() => document.getElementById('result').textContent);
    await browser.close();
    if (text === MARKER) {
      pass(`Playwright launched Chromium ${pwVersion}, JS executed, DOM marker confirmed: "${text}"`);
    } else {
      fail(`Playwright launched Chromium but DOM marker mismatch: got "${text}"`);
    }
  } catch (e) {
    fail(`Playwright could not launch/drive the discovered executable: ${e.message}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(process.exitCode ? '\nOVERALL: FAIL — see above' : '\nOVERALL: PASS — all four checks succeeded');
}

main().catch((e) => {
  console.error('Verification script crashed:', e);
  process.exit(1);
});
