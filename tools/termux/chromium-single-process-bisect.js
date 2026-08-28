#!/usr/bin/env node
'use strict';
/**
 * tools/termux/chromium-single-process-bisect.js
 *
 * CP6.4 diagnostic — run this ON the Termux device.
 *
 * WHY THIS EXISTS
 *   CP6.3's chromium-dependency-verify.js applies all 7 Android-native
 *   flags at once (--no-sandbox --no-zygote --disable-gpu
 *   --disable-dev-shm-usage --in-process-gpu --single-process
 *   --no-proxy-server --disable-crash-reporter) and truncates captured
 *   stderr to 2000 chars. The real Termux run reported SIGTRAP with no
 *   exit code — a Chromium-internal CHECK()/IMMEDIATE_CRASH() trap, not
 *   a hang and not an OS-level sandbox kill (that would be
 *   SIGSEGV/SIGBUS/SIGSYS instead). We don't yet know WHICH flag, or
 *   which flag interaction, produces that trap, because they're all
 *   applied together and the output that would show it is truncated.
 *
 * WHAT THIS SCRIPT DOES
 *   Launches the SAME discovered binary (via browser-launch.js's
 *   discoverChromium(), so no path guessing) repeatedly, adding ONE
 *   more flag at each step, in the same order CP6.1-CP6.3 introduced
 *   them. For each step it writes FULL, untruncated stdout+stderr to
 *   its own log file and records exit code / signal / timeout-killed.
 *   It stops at the first step that produces a signal (crash) rather
 *   than continuing past it, so the log file for that step is the one
 *   that matters most.
 *
 * USAGE
 *   node tools/termux/chromium-single-process-bisect.js
 *
 * OUTPUT
 *   ./cozy-chromium-bisect-<timestamp>/step-N-<flags>.log for each step,
 *   plus a summary printed to the console. Send back the summary AND
 *   the full log file for the first step that shows a signal.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { discoverChromium } = require('../../server/webauthn-rp/test/browser-launch');

const MARKER = 'CozyOS Chromium OK';
const FIXTURE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body>
<div id="result">not-run</div>
<script>
  document.getElementById('result').textContent = ['CozyOS', 'Chromium', 'OK'].join(' ');
</script>
</body></html>`;

// Cumulative flag sets, one flag added per step, in CP6.1→CP6.3 order.
// Step 0 is the sandboxed-desktop baseline (no Android workaround flags
// at all) purely as a sanity check of the binary itself.
const STEPS = [
  { name: '00-baseline-headless-only', add: [] },
  { name: '01-no-sandbox', add: ['--no-sandbox'] },
  { name: '02-no-zygote', add: ['--no-zygote'] },
  { name: '03-disable-gpu', add: ['--disable-gpu'] },
  { name: '04-disable-dev-shm-usage', add: ['--disable-dev-shm-usage'] },
  { name: '05-in-process-gpu', add: ['--in-process-gpu'] },
  { name: '06-single-process', add: ['--single-process'] },
  { name: '07-no-proxy-server', add: ['--no-proxy-server'] },
  { name: '08-disable-crash-reporter', add: ['--disable-crash-reporter'] },
];

function runStep(executablePath, cumulativeArgs, fixturePath, logDir, step) {
  const args = [...cumulativeArgs, '--headless', '--dump-dom', `file://${fixturePath}`];
  const logPath = path.join(logDir, `step-${step.name}.log`);
  const header = `CMD: ${executablePath} ${args.join(' ')}\n\n`;
  const result = {
    name: step.name,
    args: cumulativeArgs,
    killed: false,
    signal: null,
    exitCode: null,
    markerFound: false,
    logPath,
  };
  try {
    const dom = execFileSync(executablePath, args, { encoding: 'utf8', timeout: 30000 });
    result.exitCode = 0;
    result.markerFound = dom.includes(MARKER);
    fs.writeFileSync(logPath, header + `EXIT: 0\nMARKER_FOUND: ${result.markerFound}\n\n--- stdout ---\n${dom}`);
  } catch (e) {
    result.killed = e.killed === true;
    result.signal = e.signal || null;
    result.exitCode = (e.status === null || e.status === undefined) ? null : e.status;
    const stdout = e.stdout ? e.stdout.toString() : '';
    const stderr = e.stderr ? e.stderr.toString() : '';
    fs.writeFileSync(
      logPath,
      header +
      `KILLED_BY_OUR_TIMEOUT: ${result.killed}\n` +
      `SIGNAL: ${result.signal || '(none)'}\n` +
      `EXIT_CODE: ${result.exitCode === null ? '(none — did not exit normally)' : result.exitCode}\n\n` +
      `--- FULL stdout (untruncated) ---\n${stdout}\n\n` +
      `--- FULL stderr (untruncated) ---\n${stderr}\n`
    );
  }
  return result;
}

async function main() {
  const { executablePath, isAndroidNative } = discoverChromium();
  if (!executablePath) {
    console.log('No system Chromium discovered — this bisect script is only meaningful');
    console.log('against a discovered system binary (same as chromium-dependency-verify.js).');
    return;
  }
  console.log(`Discovered executable: ${executablePath}`);
  console.log(`Detected as Android-native: ${isAndroidNative}\n`);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cozy-chromium-bisect-'));
  const fixturePath = path.join(tmpRoot, 'fixture.html');
  fs.writeFileSync(fixturePath, FIXTURE_HTML);
  const logDir = path.join(process.cwd(), `cozy-chromium-bisect-${Date.now()}`);
  fs.mkdirSync(logDir, { recursive: true });

  let cumulativeArgs = [];
  const results = [];
  let firstSignalStep = null;

  for (const step of STEPS) {
    cumulativeArgs = [...cumulativeArgs, ...step.add];
    process.stdout.write(`[${step.name}] flags so far: ${cumulativeArgs.join(' ') || '(none)'} ... `);
    const result = runStep(executablePath, cumulativeArgs, fixturePath, logDir, step);
    results.push(result);
    if (result.signal && !firstSignalStep) {
      firstSignalStep = result;
      console.log(`CRASH — signal ${result.signal}. Full log: ${result.logPath}`);
      console.log('Stopping bisect here — this is the flag that introduced the trap.');
      break;
    } else if (result.killed) {
      console.log(`HUNG (our 30s timeout fired). Full log: ${result.logPath}`);
      console.log('Stopping bisect here — this is the flag that introduced the hang.');
      break;
    } else if (result.exitCode !== 0) {
      console.log(`clean nonzero exit (${result.exitCode}), marker found: ${result.markerFound}. Log: ${result.logPath}`);
    } else {
      console.log(`OK (exit 0, marker found: ${result.markerFound})`);
    }
  }

  console.log('\n=== SUMMARY ===');
  for (const r of results) {
    console.log(`${r.name.padEnd(28)} signal=${String(r.signal).padEnd(8)} exit=${String(r.exitCode).padEnd(6)} killed=${r.killed} marker=${r.markerFound}`);
  }
  if (firstSignalStep) {
    console.log(`\nFirst crash at: ${firstSignalStep.name}`);
    console.log(`Send back this file in full: ${firstSignalStep.logPath}`);
  } else {
    console.log('\nNo signal-crash reproduced in isolation — the SIGTRAP may require a flag');
    console.log('order/combination this linear bisect doesn\'t cover, or may be intermittent.');
    console.log('Send back the full summary above plus the log directory listing:');
    console.log(logDir);
  }

  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

main().catch((e) => {
  console.error('Bisect script crashed:', e);
  process.exit(1);
});
