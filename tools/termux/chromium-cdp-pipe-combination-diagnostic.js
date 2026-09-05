#!/usr/bin/env node
'use strict';
/**
 * tools/termux/chromium-cdp-pipe-combination-diagnostic.js
 *
 * CP6.6 diagnostic — run this ON the Termux device. Does NOT change
 * production code; does NOT run the Taskbar browser test.
 *
 * WHY THIS EXISTS
 *   CP6.5's linear bisect (chromium-single-process-bisect.js) proved
 *   all 6 remaining Android-native flags together — the exact set
 *   resolveLaunchOptions() applies — launch cleanly via raw CLI
 *   `--headless --dump-dom`: every step exits 0, DOM marker found,
 *   confirmed on TWO separate Termux runs now. But the real production
 *   path (Playwright's `chromium.launch(resolveLaunchOptions(...))`,
 *   as used by taskbar-browser.test.js and
 *   chromium-dependency-verify.js step 4) was separately reported to
 *   hang: ETIMEDOUT, killed=false, signal=null, exit=0.
 *
 *   That result shape does not match a spawnSync timeout (which sets
 *   killed=true) or a crash (which sets a signal). exit=0 with no
 *   signal and killed=false is consistent with the underlying
 *   Chromium *process* itself never dying and never being force-killed
 *   by anything in this diagnostic's own control — i.e. Playwright's
 *   own launch()-level timeout fired while the process was still
 *   sitting there alive, waiting on something Playwright needed and
 *   never got.
 *
 *   The one thing `--dump-dom` and a real Playwright launch do
 *   differently is the transport: `--dump-dom` never opens a CDP
 *   channel at all, while `chromium.launch()` always does — and
 *   Playwright's default transport for a launched (non-connectOverCDP)
 *   Chromium is a pair of inherited pipe file descriptors opened via
 *   `--remote-debugging-pipe` (fd 3 = commands in, fd 4 = events out),
 *   not a websocket. So the passing bisect and the hanging production
 *   launch are not actually testing the same thing: one never touches
 *   CDP, the other depends on it working. This script isolates exactly
 *   that difference — same discovered binary, same combined flag set
 *   (imported from resolveLaunchOptions() itself, not hand-copied, so
 *   it can never drift from what production actually uses) — but
 *   speaks raw CDP over the pipe directly, with no dependency on the
 *   `playwright` npm package at all. That matters because the
 *   Playwright prerequisite itself is still unresolved in this
 *   environment; this script answers "does CDP-over-pipe work under
 *   this flag combination" without needing that question settled
 *   first, and without going anywhere near the Taskbar test.
 *
 * WHAT THIS SCRIPT DOES
 *   Step A (control, re-confirms no regression):
 *     Same combined flags, `--headless --dump-dom` on the same fixture
 *     used by the bisect script. Expected: exit 0, marker found, same
 *     as CP6.5. If this alone fails, something changed since the last
 *     bisect and step B's result can't be trusted in isolation.
 *   Step B (the actual isolation):
 *     Same combined flags, `--headless --remote-debugging-pipe`,
 *     spawned with fd 3 (write) / fd 4 (read) attached. Sends a single
 *     minimal CDP command, `Browser.getVersion`, framed with the
 *     trailing NUL byte the pipe protocol requires, and waits up to
 *     CDP_TIMEOUT_MS for any response on fd 4. Records, independent of
 *     each other:
 *       - whether the process spawned at all (pid assigned)
 *       - whether ANY bytes ever arrived on fd 4
 *       - whether those bytes parsed as a valid JSON-RPC response to
 *         request id 1
 *       - elapsed wall-clock time to first byte (or to giving up)
 *       - the process's own exit code/signal AFTER this script kills
 *         it (it does not wait for the process to exit on its own,
 *         since a hang-forever process by definition won't)
 *       - full, untruncated stderr captured for the entire run
 *
 *   Both steps' full logs are written to their own files. Nothing
 *   about this script infers success from absence of an error message;
 *   step B only reports PASS if a well-formed JSON response to id 1
 *   was actually parsed from fd 4.
 *
 * USAGE
 *   node tools/termux/chromium-cdp-pipe-combination-diagnostic.js
 *
 * OUTPUT
 *   ./cozy-chromium-cdp-diagnostic-<timestamp>/step-A-dump-dom-control.log
 *   ./cozy-chromium-cdp-diagnostic-<timestamp>/step-B-cdp-pipe.log
 *   plus a summary printed to the console. Send back both files and
 *   the summary regardless of outcome — a step-B failure with step-A
 *   passing is itself the finding (CDP-pipe-specific), and a step-A
 *   failure means re-run the CP6.5 bisect first before trusting this.
 *
 * WHAT THIS DOES NOT DO
 *   - Does not require, import, or otherwise touch the `playwright`
 *     npm package.
 *   - Does not run core/shell/tests/taskbar-browser.test.js.
 *   - Does not modify browser-launch.js or any other production file.
 *   - Does not delete or touch any prior bisect/diagnostic log
 *     directory.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

const { discoverChromium, resolveLaunchOptions } = require('../../server/webauthn-rp/test/browser-launch');

const MARKER = 'CozyOS Chromium OK';
const FIXTURE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body>
<div id="result">not-run</div>
<script>
  document.getElementById('result').textContent = ['CozyOS', 'Chromium', 'OK'].join(' ');
</script>
</body></html>`;

const CDP_TIMEOUT_MS = 15000;

function getCombinedAndroidArgs() {
  // Pulled directly from resolveLaunchOptions() rather than hand-copied,
  // so this diagnostic can never silently drift from what production
  // actually launches with (the exact hand-sync problem
  // chromium-dependency-verify.js's own header has flagged as a risk
  // since CP6.2).
  const opts = resolveLaunchOptions({});
  return opts.args || [];
}

function runStepA(executablePath, combinedArgs, fixturePath, logDir) {
  const args = [...combinedArgs, '--headless', '--dump-dom', `file://${fixturePath}`];
  const logPath = path.join(logDir, 'step-A-dump-dom-control.log');
  const header = `CMD: ${executablePath} ${args.join(' ')}\n\n`;
  const result = { name: 'A-dump-dom-control', pass: false, logPath };
  try {
    const dom = execFileSync(executablePath, args, { encoding: 'utf8', timeout: 30000 });
    result.pass = dom.includes(MARKER);
    fs.writeFileSync(logPath, header + `EXIT: 0\nMARKER_FOUND: ${result.pass}\n\n--- stdout ---\n${dom}`);
  } catch (e) {
    const stdout = e.stdout ? e.stdout.toString() : '';
    const stderr = e.stderr ? e.stderr.toString() : '';
    fs.writeFileSync(
      logPath,
      header +
      `KILLED_BY_OUR_TIMEOUT: ${e.killed === true}\n` +
      `SIGNAL: ${e.signal || '(none)'}\n` +
      `EXIT_CODE: ${e.status === null || e.status === undefined ? '(none)' : e.status}\n\n` +
      `--- FULL stdout ---\n${stdout}\n\n--- FULL stderr ---\n${stderr}\n`
    );
  }
  return result;
}

function runStepB(executablePath, combinedArgs, fixturePath, logDir) {
  return new Promise((resolve) => {
    const args = [...combinedArgs, '--headless', '--remote-debugging-pipe', `file://${fixturePath}`];
    const logPath = path.join(logDir, 'step-B-cdp-pipe.log');
    const header = `CMD: ${executablePath} ${args.join(' ')}\n(fd3=cmd-in, fd4=event-out)\n\n`;
    const startedAt = Date.now();

    const result = {
      name: 'B-cdp-pipe',
      pass: false,
      spawned: false,
      pid: null,
      bytesReceived: false,
      validCdpResponse: false,
      msElapsedToFirstByte: null,
      finalSignal: null,
      finalExitCode: null,
      logPath,
    };

    let child;
    try {
      // stdio: [stdin, stdout, stderr, fd3=cmd-in (we write), fd4=event-out (we read)]
      child = spawn(executablePath, args, {
        stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      fs.writeFileSync(logPath, header + `FAILED TO SPAWN: ${e.message}\n`);
      resolve(result);
      return;
    }

    result.spawned = true;
    result.pid = child.pid;

    let stderrBuf = '';
    let fd4Buf = '';
    let settled = false;

    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
    });

    const fd4 = child.stdio[4];
    fd4.on('data', (chunk) => {
      if (result.msElapsedToFirstByte === null) {
        result.msElapsedToFirstByte = Date.now() - startedAt;
      }
      result.bytesReceived = true;
      fd4Buf += chunk.toString();
      // Pipe protocol frames messages with a trailing NUL byte.
      let idx;
      while ((idx = fd4Buf.indexOf('\0')) !== -1) {
        const raw = fd4Buf.slice(0, idx);
        fd4Buf = fd4Buf.slice(idx + 1);
        try {
          const msg = JSON.parse(raw);
          if (msg && msg.id === 1) {
            result.validCdpResponse = true;
            finish();
            return;
          }
        } catch (_e) {
          // Not valid JSON on its own (partial frame or unrelated
          // message) — keep waiting for id:1 specifically or timeout.
        }
      }
    });

    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill('SIGKILL');
      } catch (_e) {
        // already gone
      }
      child.once('exit', (code, signal) => {
        result.finalExitCode = code;
        result.finalSignal = signal;
        result.pass = result.validCdpResponse;
        fs.writeFileSync(
          logPath,
          header +
          `SPAWNED: ${result.spawned} (pid ${result.pid})\n` +
          `BYTES_EVER_RECEIVED_ON_FD4: ${result.bytesReceived}\n` +
          `MS_TO_FIRST_BYTE: ${result.msElapsedToFirstByte === null ? '(never)' : result.msElapsedToFirstByte}\n` +
          `VALID_CDP_RESPONSE_ID_1: ${result.validCdpResponse}\n` +
          `KILLED_BY_THIS_SCRIPT_AFTER: ${CDP_TIMEOUT_MS}ms ceiling (or on success)\n` +
          `FINAL_EXIT_CODE_AFTER_KILL: ${result.finalExitCode === null ? '(none)' : result.finalExitCode}\n` +
          `FINAL_SIGNAL_AFTER_KILL: ${result.finalSignal || '(none)'}\n\n` +
          `--- FULL stderr (untruncated) ---\n${stderrBuf}\n`
        );
        resolve(result);
      });
      // In case the process is already gone / doesn't fire 'exit'
      // promptly after SIGKILL under a restricted namespace.
      setTimeout(() => {
        if (!fs.existsSync(logPath)) {
          fs.writeFileSync(
            logPath,
            header +
            `SPAWNED: ${result.spawned} (pid ${result.pid})\n` +
            `BYTES_EVER_RECEIVED_ON_FD4: ${result.bytesReceived}\n` +
            `MS_TO_FIRST_BYTE: ${result.msElapsedToFirstByte === null ? '(never)' : result.msElapsedToFirstByte}\n` +
            `VALID_CDP_RESPONSE_ID_1: ${result.validCdpResponse}\n` +
            `(process did not fire 'exit' within 3s of SIGKILL)\n\n` +
            `--- FULL stderr (untruncated so far) ---\n${stderrBuf}\n`
          );
          result.pass = result.validCdpResponse;
          resolve(result);
        }
      }, 3000);
    }

    const timer = setTimeout(finish, CDP_TIMEOUT_MS);

    // Send the minimal CDP command once the pipe is writable. Framed
    // with the trailing NUL the pipe transport requires.
    const fd3 = child.stdio[3];
    fd3.write(JSON.stringify({ id: 1, method: 'Browser.getVersion' }) + '\0');

    child.once('error', (e) => {
      stderrBuf += `\n[child process error event]: ${e.message}\n`;
    });
  });
}

async function main() {
  const { executablePath, isAndroidNative } = discoverChromium();
  if (!executablePath) {
    console.log('No system Chromium discovered — this diagnostic is only meaningful');
    console.log('against a discovered system binary (same requirement as the bisect script).');
    return;
  }
  if (!isAndroidNative) {
    console.log(`Discovered executable: ${executablePath}`);
    console.log('Detected as Android-native: false');
    console.log('resolveLaunchOptions() adds no extra flags on this platform, so there is');
    console.log('no "combination" to isolate here. Run this on the Termux device.');
    return;
  }

  const combinedArgs = getCombinedAndroidArgs();
  console.log(`Discovered executable: ${executablePath}`);
  console.log(`Detected as Android-native: true`);
  console.log(`Combined flags under test (from resolveLaunchOptions()): ${combinedArgs.join(' ')}\n`);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cozy-chromium-cdp-diag-'));
  const fixturePath = path.join(tmpRoot, 'fixture.html');
  fs.writeFileSync(fixturePath, FIXTURE_HTML);
  const logDir = path.join(process.cwd(), `cozy-chromium-cdp-diagnostic-${Date.now()}`);
  fs.mkdirSync(logDir, { recursive: true });

  process.stdout.write('[Step A: dump-dom control, same combined flags] ... ');
  const resultA = runStepA(executablePath, combinedArgs, fixturePath, logDir);
  console.log(resultA.pass ? `PASS (marker found). Log: ${resultA.logPath}` : `FAIL. Log: ${resultA.logPath}`);

  process.stdout.write('[Step B: CDP-over-pipe, same combined flags] ... this can take up to ' + (CDP_TIMEOUT_MS / 1000) + 's ... ');
  const resultB = await runStepB(executablePath, combinedArgs, fixturePath, logDir);
  console.log(resultB.pass ? `PASS (valid CDP response received). Log: ${resultB.logPath}` : `FAIL. Log: ${resultB.logPath}`);

  console.log('\n=== SUMMARY ===');
  console.log(`Step A (dump-dom control): ${resultA.pass ? 'PASS' : 'FAIL'}`);
  console.log(
    `Step B (CDP over pipe):    ${resultB.pass ? 'PASS' : 'FAIL'}` +
    `  spawned=${resultB.spawned} bytesReceived=${resultB.bytesReceived} ` +
    `msToFirstByte=${resultB.msElapsedToFirstByte === null ? '(never)' : resultB.msElapsedToFirstByte} ` +
    `finalSignal=${resultB.finalSignal || '(none)'} finalExit=${resultB.finalExitCode === null ? '(none)' : resultB.finalExitCode}`
  );

  if (resultA.pass && !resultB.pass) {
    console.log('\nFINDING: the combined flag set still renders/runs JS correctly (Step A),');
    console.log('but never completes a CDP handshake over the pipe transport (Step B).');
    console.log('This isolates the ETIMEDOUT to the CDP-pipe layer specifically, not the');
    console.log('renderer/DOM path the bisect already validated. Do not change');
    console.log('browser-launch.js on this evidence alone — send back both log files first.');
  } else if (!resultA.pass) {
    console.log('\nStep A regressed from the CP6.5 bisect result under this exact combined');
    console.log('flag set — re-run chromium-single-process-bisect.js before trusting Step B.');
  } else {
    console.log('\nBoth steps passed: CDP-over-pipe works fine under this flag combination in');
    console.log('isolation. The production ETIMEDOUT may be specific to something Playwright');
    console.log('itself adds/expects beyond a bare pipe handshake, or may be intermittent.');
  }

  console.log(`\nLog directory (send back in full): ${logDir}`);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

main().catch((e) => {
  console.error('Diagnostic script crashed:', e);
  process.exit(1);
});
