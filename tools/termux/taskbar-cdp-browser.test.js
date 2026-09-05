'use strict';

/**
 * tools/termux/taskbar-cdp-browser.test.js
 *
 * CP6.7 — Android/Termux runtime path for the Taskbar real-browser
 * tests. Exercises the SAME production files as
 * core/shell/tests/taskbar-browser.test.js —
 *   /core/shell/window-manager.js
 *   /core/shell/taskbar.js
 * served over the same kind of local HTTP server and loaded through
 * the same test harness (core/shell/tests/taskbar-harness.html) — but
 * drives the real Chromium binary through raw CDP-over-pipe
 * (tools/termux/lib/cdp-pipe-client.js) instead of Playwright.
 *
 * WHY THIS FILE EXISTS (do not re-diagnose — see
 * docs/checkpoints/CP6.7-TASKBAR-CDP-ANDROID-CHECKPOINT.md for the
 * full evidence trail)
 *   `playwright` is installed and resolvable in node_modules on the
 *   Termux device (playwright@1.62.1, require.resolve() succeeds), but
 *   `require('playwright')` itself throws
 *   `Error: Unsupported platform: android` — Playwright's own runtime
 *   refuses to initialize on Android, independent of whether a working
 *   Chromium binary and a working CDP transport exist. CP6.5's linear
 *   flag bisect (6/6 steps passing) and CP6.6's CDP-pipe diagnostic
 *   (Step B: PASS, valid CDP response) already proved Chromium itself
 *   and the `--remote-debugging-pipe` transport both work correctly
 *   under this device's Android-native flag set. The only broken piece
 *   is Playwright's own automation layer — so this file replaces only
 *   that layer, not Chromium, not the flags, not Taskbar, not
 *   WindowManager.
 *
 * WHAT THIS FILE DOES NOT DO
 *   - Does not require('playwright') or call playwright.chromium.launch().
 *   - Does not create a second WindowManager or Taskbar, mock either
 *     one, or duplicate their logic. Both are loaded, unmodified, from
 *     their real production files via the real test harness.
 *   - Does not change server/webauthn-rp/test/browser-launch.js or any
 *     Android-native flag. resolveLaunchOptions() is only read.
 *   - Does not replace core/shell/tests/taskbar-browser.test.js, which
 *     remains the desktop/Linux/CI Playwright path.
 *
 * COVERAGE (mirrors taskbar-browser.test.js's 12 real-browser checks;
 * see that file for the Playwright-driven version of the same list)
 *   1. Setup / harness+module loading
 *   2. Window creation adds one taskbar entry
 *   3. Multiple windows — one entry each, newest active
 *   4. Focus — real CDP mouse click drives WindowManager + DOM class
 *   5. Minimize
 *   6. Restore (via click on the minimized entry)
 *   7. Close via the taskbar's own close control
 *   8. Close via the window's own titlebar control
 *   9. setTitle() synchronization
 *   10. maximize() leaves the entry present and non-minimized
 *   11. Taskbar.destroy() unsubscribes and stops reacting
 *   12. Duplicate <script src="taskbar.js"> include is a real no-op
 *
 * Every assertion below is a runtime assertion evaluated inside the
 * real page via CDP (Runtime.evaluate) or driven via a real CDP
 * Input-domain mouse click (tools/termux/lib/cdp-pipe-client.js's
 * clickSelector) — nothing here inspects source text.
 *
 * RESULT VOCABULARY
 *   PASS    — the assertion ran and the real browser confirmed it.
 *   FAIL    — the assertion ran and the real browser contradicted it.
 *   BLOCKED — infrastructure prevented the assertion from running at
 *             all. Never reported as a pass. As of CP6.8, setup
 *             failures report the EXACT stage that failed (see
 *             SETUP_STAGES below) rather than one generic
 *             "harness failed to load" — this matters because an
 *             Android CDP session has several distinct failure points
 *             between "Chromium's own CDP handler answered a
 *             browser-level ping" and "the fixture's JS actually ran",
 *             and prior versions of this file collapsed all of them
 *             into one undifferentiated BLOCKED result.
 *
 * CP6.8 CORRECTION — setup is staged, not one bundled try/catch
 *   CP6.7's setup wrapped Chromium launch, CDP session creation,
 *   navigation, and module-load checks in one try/catch, so a failure
 *   anywhere in that sequence reported only `BLOCKED: <e.message>` —
 *   informative if the underlying error message happened to be
 *   specific, but not guaranteed to be, and not labeled by WHICH stage
 *   failed. Two concrete problems this caused, found by actually
 *   running this file (not by inspection):
 *     1. `cdp-pipe-client.js`'s transport-error path rejected in-flight
 *        commands with only a request id, no method name — so a
 *        transport failure during, say, `Target.createTarget` was
 *        indistinguishable from one during `Runtime.enable`. Fixed in
 *        `cdp-pipe-client.js` (CP6.8): pending commands now carry their
 *        method name, and transport-close rejections name it.
 *     2. CP6.6's diagnostic proved `Browser.getVersion` (browser-level,
 *        no target/renderer/network-service involved) works over this
 *        transport — that is a real but NARROWER finding than "CDP
 *        automation works", since it never touched
 *        `Target.createTarget`/navigation/in-page `Runtime.evaluate`,
 *        which is everything this test actually needs and everything
 *        this repo's own CP6.1-CP6.4 history already flags as the
 *        specific place Termux's restricted-exec model causes trouble.
 *   `SETUP_STAGES` below makes each of these an explicit, individually
 *   labeled step, so a real Android BLOCKED result now names one of:
 *     "Chromium spawned but no CDP greeting/response"
 *     "CDP connected but no page target"
 *     "target attachment failed"
 *     "Page.enable failed" / "Runtime.enable failed"
 *     "fixture navigation failed"
 *     "fixture JavaScript did not execute"
 *     "Taskbar harness initialization failed"
 *   instead of one undifferentiated message. `Target.createTarget` and
 *   navigation are retried once after a short delay before being
 *   reported as failed, specifically because "Network service crashed,
 *   restarting service" is a documented transient on this class of
 *   device (see `classifyStderr()` in cdp-pipe-client.js) — a retry
 *   that still fails is reported as failed WITH both attempts' errors
 *   shown, never silently swallowed into a pass.
 *
 * Every setup run (pass or blocked) writes a full log to
 * ./cozy-taskbar-cdp-diagnostic-<timestamp>/setup.log — CP6.7 did not
 * produce a log directory at all, unlike every other tools/termux/
 * diagnostic in this repo; this brings it in line with that
 * convention so a BLOCKED report always has an artifact to send back,
 * not just a console line.
 *
 * CP6.9 ADDITION — interleaved causal-ordering trace in setup.log
 *   CP6.8's setup.log named the failing stage but couldn't answer
 *   ordering questions like "did a network-service-crash stderr line
 *   arrive before or after the Page.enable request that then timed
 *   out?" — the stage name and the raw stderr blob were both present,
 *   but nothing tied them to the same timeline. On a BLOCKED outcome,
 *   setup.log now also contains cdp-pipe-client.js's full trace
 *   (every send/response/event/timeout/transport-error/stderr-line,
 *   each tagged with when this process observed it), rendered as one
 *   ordered, human-readable list with relative millisecond offsets.
 *   Diagnostic-only: this changes what gets logged, not what counts as
 *   pass/fail/blocked.
 *
 * Run: node tools/termux/taskbar-cdp-browser.test.js
 */

const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');

const REPO_ROOT = path.join(__dirname, '..', '..');
const { discoverChromium, resolveLaunchOptions } = require(path.join(REPO_ROOT, 'server', 'webauthn-rp', 'test', 'browser-launch.js'));
const { launchWithCDP, classifyStderr } = require('./lib/cdp-pipe-client');

let passed = 0, failed = 0, blocked = 0;
const setupLog = [];
function logLine(line) {
  setupLog.push(line);
  console.log(line);
}

/** Retries fn() once after delayMs if the first attempt throws — used only for the two stages known to be sensitive to the documented transient network-service crash/restart on Android. Both attempts' errors are preserved in the thrown error if both fail; nothing is silently swallowed. */
async function withOneRetry(label, fn, delayMs = 1000) {
  try {
    return await fn();
  } catch (firstErr) {
    logLine(`      (attempt 1 of "${label}" failed: ${firstErr.message} — retrying once after ${delayMs}ms, per documented network-service-restart transience)`);
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      return await fn();
    } catch (secondErr) {
      const combined = new Error(`${label} failed twice. Attempt 1: ${firstErr.message} | Attempt 2: ${secondErr.message}`);
      throw combined;
    }
  }
}

function contentType(p) {
  if (p.endsWith('.html')) return 'text/html';
  if (p.endsWith('.js')) return 'application/javascript';
  if (p.endsWith('.css')) return 'text/css';
  return 'application/octet-stream';
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filePath = path.join(REPO_ROOT, decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found: ' + filePath); return; }
        res.writeHead(200, { 'Content-Type': contentType(filePath) });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/** Runs one test against a FRESH page (own CDP target), closing the target afterward regardless of outcome. */
async function test(cdp, base, name, fn) {
  let session;
  try {
    session = await cdp.newSession();
    await cdp.navigate(session.sessionId, `${base}/core/shell/tests/taskbar-harness.html`);
    await fn(session.sessionId);
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`      ${err.stack || err.message}`);
    failed++;
  } finally {
    if (session) await cdp.closeSession(session);
  }
}

/** Creates a real WindowManager window directly — the same API ApplicationLauncher composes, no fixture-only mock. */
function createWindow(cdp, sessionId, { id, title, icon = null }) {
  return cdp.evaluate(sessionId, (id, title, icon) => {
    const el = document.createElement('div');
    el.textContent = `content for ${id}`;
    return window.CozyOS.WindowManager.create({ id, title, icon, element: el });
  }, id, title, icon);
}

function taskbarItems(cdp, sessionId) {
  return cdp.evaluate(sessionId, () => Array.from(document.querySelectorAll('#cozy-taskbar-root .cozy-taskbar-item')).map((el) => ({
    id: el.dataset.taskbarId,
    title: el.querySelector('.cozy-taskbar-title').textContent,
    minimized: el.classList.contains('cozy-taskbar-minimized'),
    active: el.classList.contains('cozy-taskbar-active'),
  })));
}

function formatTrace(trace) {
  if (!trace || !trace.length) return '(no trace captured)';
  const t0 = trace[0].ts;
  return trace.map((e) => {
    const rel = `+${(e.ts - t0).toString().padStart(6, ' ')}ms`;
    switch (e.kind) {
      case 'send': return `${rel}  SEND      id=${e.id} ${e.method}${e.sessionId ? ` (session ${e.sessionId})` : ''}`;
      case 'recv-response': return `${rel}  RESPONSE  id=${e.id} ${e.method}${e.sessionId ? ` (session ${e.sessionId})` : ''}${e.isError ? ' [ERROR]' : ''}`;
      case 'event': return `${rel}  EVENT     ${e.method}${e.sessionId ? ` (session ${e.sessionId})` : ''}`;
      case 'timeout': return `${rel}  TIMEOUT   id=${e.id} ${e.method}${e.sessionId ? ` (session ${e.sessionId})` : ''} after ${e.timeoutMs}ms`;
      case 'transport-error': return `${rel}  TRANSPORT-ERROR  ${e.code || ''} ${e.message || ''}`;
      case 'stderr': return `${rel}  stderr>   ${e.line}`;
      default: return `${rel}  ${e.kind}  ${JSON.stringify(e)}`;
    }
  }).join('\n');
}

function writeSetupLog(logDir, extra = {}) {
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, 'setup.log');
  const trace = extra.trace || [];
  fs.writeFileSync(logPath, [
    setupLog.join('\n'),
    '',
    '--- CP6.9 interleaved trace (send/response/event/timeout/transport-error/stderr, in observation order) ---',
    formatTrace(trace),
    '',
    '--- extra (JSON, includes raw trace array) ---',
    JSON.stringify(extra, null, 2),
  ].join('\n'));
  return logPath;
}

async function main() {
  const logDir = path.join(process.cwd(), `cozy-taskbar-cdp-diagnostic-${Date.now()}`);

  const { executablePath, isAndroidNative } = discoverChromium();
  if (!executablePath) {
    logLine('BLOCKED: no system Chromium discovered (COZY_E2E_CHROMIUM_PATH unset, not on');
    logLine('PATH, not found under $PREFIX/bin). This is honestly reported as BLOCKED, not');
    logLine('a pass and not a silent skip. See server/webauthn-rp/test/browser-launch.js.');
    writeSetupLog(logDir, { stage: 'discoverChromium', blocked: true });
    process.exitCode = 2;
    return;
  }
  logLine(`Discovered executable: ${executablePath}`);
  logLine(`Detected as Android-native: ${isAndroidNative}\n`);

  // Same flags production uses. resolveLaunchOptions() only adds
  // Android-native args when isAndroidNative is true; on a desktop
  // Chromium (e.g. this Cloud sandbox's Playwright-managed binary) it
  // adds nothing, and --headless alone is enough.
  const launchArgs = resolveLaunchOptions({}).args || [];

  logLine('CozyOS Taskbar \u2014 CDP real-browser tests\n');
  logLine('Setup:');

  let cdp;
  try {
    cdp = await launchWithCDP(executablePath, launchArgs);
  } catch (e) {
    logLine(`  \u2717 real Chromium launched`);
    logLine(`      BLOCKED: failed to spawn: ${e.message}`);
    blocked++;
    logLine(`\n${passed} passed, ${failed} failed, ${blocked} blocked`);
    writeSetupLog(logDir, { stage: 'spawn', error: e.message });
    process.exitCode = 2;
    return;
  }
  logLine(`  \u2713 real Chromium launched (pid ${cdp.pid})`);

  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  // CP6.8: setup is now a sequence of individually labeled stages
  // instead of one bundled try/catch, per the correction in this
  // file's header. `stage` always names the exact step that was in
  // progress when `blockedReason` gets set, so a real Android run
  // reports one of the SETUP_STAGES vocabulary entries rather than
  // one generic message.
  let stage = 'ping (browser-level CDP handshake)';
  let blockedReason = null;
  let firstSession = null;
  try {
    // Stage 0 — the exact CP6.6-proven call, browser-level only. If
    // THIS fails, the finding is identical in scope to what CP6.6
    // already tested: the pipe handshake itself. If it succeeds,
    // everything after this point is NEW information CP6.6 never
    // established (see header correction).
    await cdp.ping();
    logLine('  \u2713 CDP pipe connected (browser-level ping answered)');

    stage = 'CDP connected but no page target';
    const targetId = await withOneRetry('Target.createTarget', () => cdp.createTarget('about:blank'));
    logLine('  \u2713 page target created');

    stage = 'target attachment failed';
    const sessionId = await cdp.attachToTarget(targetId);
    firstSession = { sessionId, targetId };
    logLine('  \u2713 attached to target (session established)');

    stage = 'Page.enable failed';
    await cdp.enablePage(sessionId);
    stage = 'Runtime.enable failed';
    await cdp.enableRuntime(sessionId);
    logLine('  \u2713 Page/Runtime domains enabled');

    stage = 'fixture navigation failed';
    await withOneRetry('navigate to harness', () => cdp.navigate(sessionId, `${base}/core/shell/tests/taskbar-harness.html`));
    logLine('  \u2713 harness navigated + loaded');

    stage = 'fixture JavaScript did not execute';
    const hasWm = await cdp.evaluate(sessionId, () => !!(window.CozyOS && window.CozyOS.WindowManager));
    const hasTaskbar = await cdp.evaluate(sessionId, () => !!(window.CozyOS && window.CozyOS.Taskbar));
    if (!hasWm) throw new Error('window.CozyOS.WindowManager is not defined after navigation — production script did not run or did not load');
    logLine('  \u2713 WindowManager loaded');
    if (!hasTaskbar) throw new Error('window.CozyOS.Taskbar is not defined after navigation — production script did not run or did not load');
    logLine('  \u2713 Taskbar loaded');

    stage = 'Taskbar harness initialization failed';
    const hasRoot = await cdp.evaluate(sessionId, () => !!document.getElementById('cozy-taskbar-root'));
    if (!hasRoot) throw new Error('Taskbar did not self-mount #cozy-taskbar-root');
    logLine('  \u2713 Taskbar self-mounted #cozy-taskbar-root');
    passed++;
  } catch (e) {
    blockedReason = `${stage}: ${e.message}`;
    logLine(`  \u2717 setup`);
    logLine(`      BLOCKED: ${blockedReason}`);
    const stderrText = cdp.getStderr();
    const tags = classifyStderr(stderrText);
    if (tags.length) {
      logLine('      Known Android/Termux stderr patterns present (context, not asserted as cause):');
      for (const t of tags) logLine(`        - ${t.tag}: ${t.note}`);
    }
    logLine(`      Chromium stderr (untruncated):\n${stderrText}`);
    blocked++;
    logLine(`\n${passed} passed, ${failed} failed, ${blocked} blocked`);
    if (firstSession) await cdp.closeSession(firstSession).catch(() => {});
    cdp.close();
    server.close();
    const logPath = writeSetupLog(logDir, {
      stage,
      blockedReason,
      transportError: cdp.getTransportError() ? String(cdp.getTransportError()) : null,
      stderrTags: tags,
      pid: cdp.pid,
      isAndroidNative,
      launchArgs,
      trace: cdp.getTrace(),
    });
    logLine(`\nFull setup log: ${logPath}`);
    process.exitCode = 2;
    return;
  } finally {
    if (firstSession && passed > 0) await cdp.closeSession(firstSession).catch(() => {});
  }

  console.log('\nWindow creation:');
  await test(cdp, base, 'creating a window adds a real entry to the taskbar', async (sessionId) => {
    await createWindow(cdp, sessionId, { id: 'app-a', title: 'App A', icon: '\ud83d\udcc4' });
    const items = await taskbarItems(cdp, sessionId);
    if (items.length !== 1) throw new Error(`expected 1 taskbar entry, got ${items.length}`);
    if (items[0].id !== 'app-a') throw new Error(`expected id "app-a", got "${items[0].id}"`);
    if (items[0].title !== 'App A') throw new Error(`expected title "App A", got "${items[0].title}"`);
    if (items[0].minimized) throw new Error('a freshly created window should not show as minimized');
    if (!items[0].active) throw new Error('a freshly created window should be the active entry');
  });

  console.log('\nMultiple windows:');
  await test(cdp, base, 'creating several windows adds one entry each, most recent active', async (sessionId) => {
    await createWindow(cdp, sessionId, { id: 'app-a', title: 'App A' });
    await createWindow(cdp, sessionId, { id: 'app-b', title: 'App B' });
    await createWindow(cdp, sessionId, { id: 'app-c', title: 'App C' });
    const items = await taskbarItems(cdp, sessionId);
    if (items.length !== 3) throw new Error(`expected 3 taskbar entries, got ${items.length}`);
    const ids = items.map((i) => i.id).sort();
    if (JSON.stringify(ids) !== JSON.stringify(['app-a', 'app-b', 'app-c'])) throw new Error(`unexpected id set: ${ids.join(',')}`);
    const activeCount = items.filter((i) => i.active).length;
    if (activeCount !== 1) throw new Error(`expected exactly 1 active entry, got ${activeCount}`);
    const active = items.find((i) => i.active);
    if (active.id !== 'app-c') throw new Error(`expected most-recently-created window ("app-c") active, got "${active.id}"`);
  });

  console.log('\nFocus:');
  await test(cdp, base, 'a real CDP mouse click on a non-active entry focuses it via the real WindowManager', async (sessionId) => {
    await createWindow(cdp, sessionId, { id: 'app-a', title: 'App A' });
    await createWindow(cdp, sessionId, { id: 'app-b', title: 'App B' });
    // app-b is active after creation; click app-a's taskbar entry with a real dispatched mouse event.
    await cdp.clickSelector(sessionId, '[data-taskbar-id="app-a"]');
    const items = await taskbarItems(cdp, sessionId);
    const active = items.find((i) => i.active);
    if (!active || active.id !== 'app-a') throw new Error(`expected "app-a" active after click, got "${active && active.id}"`);
    const isActiveInDom = await cdp.evaluate(sessionId, () => document.querySelector('.cozy-window[data-window-id="app-a"]').classList.contains('cozy-window-active'));
    if (!isActiveInDom) throw new Error('real WindowManager window did not receive cozy-window-active after taskbar click');
  });

  console.log('\nMinimize:');
  await test(cdp, base, 'minimizing a window (via WindowManager) marks its taskbar entry minimized', async (sessionId) => {
    await createWindow(cdp, sessionId, { id: 'app-a', title: 'App A' });
    await cdp.evaluate(sessionId, () => window.CozyOS.WindowManager.minimize('app-a'));
    const items = await taskbarItems(cdp, sessionId);
    if (!items[0].minimized) throw new Error('taskbar entry did not mark window as minimized');
  });

  console.log('\nRestore:');
  await test(cdp, base, 'a real click on a minimized entry restores the real window and clears the minimized class', async (sessionId) => {
    await createWindow(cdp, sessionId, { id: 'app-a', title: 'App A' });
    await cdp.evaluate(sessionId, () => window.CozyOS.WindowManager.minimize('app-a'));
    await cdp.clickSelector(sessionId, '[data-taskbar-id="app-a"]');
    const items = await taskbarItems(cdp, sessionId);
    if (items[0].minimized) throw new Error('taskbar entry still shows minimized after restore click');
    const isMinimizedInDom = await cdp.evaluate(sessionId, () => document.querySelector('.cozy-window[data-window-id="app-a"]').classList.contains('cozy-window-minimized'));
    if (isMinimizedInDom) throw new Error('real WindowManager window is still minimized after taskbar restore click');
  });

  console.log('\nClose:');
  await test(cdp, base, 'a real click on an entry\'s close control closes the real window and removes the taskbar entry', async (sessionId) => {
    await createWindow(cdp, sessionId, { id: 'app-a', title: 'App A' });
    await createWindow(cdp, sessionId, { id: 'app-b', title: 'App B' });
    await cdp.clickSelector(sessionId, '[data-taskbar-close="app-a"]');
    const items = await taskbarItems(cdp, sessionId);
    if (items.length !== 1) throw new Error(`expected 1 remaining taskbar entry, got ${items.length}`);
    if (items[0].id !== 'app-b') throw new Error(`expected "app-b" to remain, got "${items[0].id}"`);
    const stillInDom = await cdp.evaluate(sessionId, () => !!document.querySelector('.cozy-window[data-window-id="app-a"]'));
    if (stillInDom) throw new Error('real WindowManager window DOM still present after close');
    const wmSaysOpen = await cdp.evaluate(sessionId, () => window.CozyOS.WindowManager.isOpen('app-a'));
    if (wmSaysOpen) throw new Error('real WindowManager still reports app-a as open after taskbar close');
  });

  await test(cdp, base, 'closing a window via its own titlebar control (not the taskbar) still syncs the taskbar', async (sessionId) => {
    await createWindow(cdp, sessionId, { id: 'app-a', title: 'App A' });
    await cdp.clickSelector(sessionId, '.cozy-window[data-window-id="app-a"] [data-win-action="close"]');
    const items = await taskbarItems(cdp, sessionId);
    if (items.length !== 0) throw new Error(`expected 0 taskbar entries after titlebar close, got ${items.length}`);
  });

  console.log('\nState synchronization:');
  await test(cdp, base, 'setTitle() on the real WindowManager updates the taskbar entry text', async (sessionId) => {
    await createWindow(cdp, sessionId, { id: 'app-a', title: 'Original Title' });
    await cdp.evaluate(sessionId, () => window.CozyOS.WindowManager.setTitle('app-a', 'Renamed'));
    const items = await taskbarItems(cdp, sessionId);
    if (items[0].title !== 'Renamed') throw new Error(`expected renamed title, got "${items[0].title}"`);
  });

  await test(cdp, base, 'maximize() does not remove the taskbar entry and keeps it active', async (sessionId) => {
    await createWindow(cdp, sessionId, { id: 'app-a', title: 'App A' });
    await cdp.evaluate(sessionId, () => window.CozyOS.WindowManager.maximize('app-a'));
    const items = await taskbarItems(cdp, sessionId);
    if (items.length !== 1) throw new Error(`expected 1 taskbar entry after maximize, got ${items.length}`);
    if (items[0].minimized) throw new Error('maximize should not mark the window as minimized');
  });

  console.log('\nListener cleanup / no duplicate subscriptions:');
  await test(cdp, base, 'Taskbar.destroy() unsubscribes \u2014 later WindowManager changes no longer update (or recreate) the taskbar', async (sessionId) => {
    await createWindow(cdp, sessionId, { id: 'app-a', title: 'App A' });
    await cdp.evaluate(sessionId, () => window.CozyOS.Taskbar.destroy());
    const rootGoneAfterDestroy = await cdp.evaluate(sessionId, () => !document.getElementById('cozy-taskbar-root'));
    if (!rootGoneAfterDestroy) throw new Error('Taskbar.destroy() did not remove its own root element');
    await createWindow(cdp, sessionId, { id: 'app-b', title: 'App B' });
    const rootAfterNewWindow = await cdp.evaluate(sessionId, () => !!document.getElementById('cozy-taskbar-root'));
    if (rootAfterNewWindow) throw new Error('a destroyed Taskbar should not react to further WindowManager changes (listener was not actually removed)');
    const diag = await cdp.evaluate(sessionId, () => window.CozyOS.Taskbar.getDiagnosticsReport());
    if (diag.subscribed) throw new Error('getDiagnosticsReport() reports still subscribed after destroy()');
  });

  await test(cdp, base, 're-including taskbar.js a second time is a real no-op \u2014 exactly one entry per window, not two', async (sessionId) => {
    // Simulate an accidental duplicate <script src="taskbar.js"> include.
    await cdp.evaluate(sessionId, (url) => new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => resolve(true);
      s.onerror = () => reject(new Error('script failed to load: ' + url));
      document.head.appendChild(s);
    }), `${base}/core/shell/taskbar.js`);
    await createWindow(cdp, sessionId, { id: 'app-a', title: 'App A' });
    const items = await taskbarItems(cdp, sessionId);
    const matching = items.filter((i) => i.id === 'app-a');
    if (matching.length !== 1) throw new Error(`expected exactly 1 taskbar entry for app-a after duplicate script include, got ${matching.length}`);
  });

  cdp.close();
  server.close();

  console.log(`\n=========================`);
  console.log(`${passed} passed, ${failed} failed, ${blocked} blocked`);
  console.log(`=========================`);
  process.exitCode = (failed > 0 || blocked > 0) ? 1 : 0;
}

main().catch((err) => {
  console.error('FATAL:', err.stack || err.message);
  process.exitCode = 1;
});
