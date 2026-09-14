'use strict';
/**
 * tools/termux/lib/cdp-pipe-client.js
 *
 * CP6.7 — minimal, dependency-free Chrome DevTools Protocol client over
 * the `--remote-debugging-pipe` file descriptors (fd 3 = commands in,
 * fd 4 = events/responses out).
 *
 * WHY THIS EXISTS
 *   `tools/termux/chromium-cdp-pipe-combination-diagnostic.js` (CP6.6)
 *   proved this exact transport works under the combined Android-native
 *   flag set: it spawns Chromium with `--remote-debugging-pipe`, writes
 *   one NUL-terminated JSON command to fd 3, and reads a NUL-terminated
 *   JSON response from fd 4. That diagnostic hard-codes a single
 *   request/response pair inline because it only ever needed to answer
 *   one yes/no question (does the handshake complete at all). CP6.7
 *   needs a real, multi-command, multi-target, event-aware CDP session
 *   (navigate, evaluate, dispatch input, wait for load events, tear
 *   down cleanly) to drive actual Taskbar/WindowManager test scenarios
 *   — so that transport is generalized here into a small reusable
 *   client, rather than re-inlining a bigger version of the same
 *   plumbing into the test file itself.
 *
 *   This module intentionally does NOT depend on `playwright`,
 *   `chrome-remote-interface`, or any other npm package — it exists
 *   specifically because `require('playwright')` throws
 *   `Error: Unsupported platform: android` on Termux even though the
 *   package is installed (see CP6.7 checkpoint for the full evidence).
 *   Node's own `child_process` and JSON are the only dependencies.
 *
 * WHAT THIS DOES NOT DO
 *   - Does not discover the Chromium binary itself (callers use the
 *     existing `discoverChromium()` from
 *     server/webauthn-rp/test/browser-launch.js).
 *   - Does not decide which launch flags to use (callers pass `args`
 *     explicitly, normally built from `resolveLaunchOptions()`).
 *   - Does not implement a full CDP protocol surface — only the
 *     generic send/recv/event plumbing plus the small set of domain
 *     helpers CP6.7's test actually needs (evaluate, navigate, click).
 *
 * USAGE
 *   const { launchWithCDP } = require('./lib/cdp-pipe-client');
 *   const cdp = await launchWithCDP(executablePath, args);
 *   await cdp.ping();                              // browser-level only, see CP6.8 note below
 *   const targetId = await cdp.createTarget();      // page-level, starts here
 *   const sessionId = await cdp.attachToTarget(targetId);
 *   await cdp.enablePage(sessionId);
 *   await cdp.enableRuntime(sessionId);
 *   await cdp.navigate(sessionId, 'http://127.0.0.1:1234/page.html');
 *   const value = await cdp.evaluate(sessionId, () => document.title);
 *   await cdp.clickSelector(sessionId, '#some-button');
 *   cdp.close();
 *
 * CP6.8 CORRECTION — "proven" only meant browser-level, not page-level
 *   CP6.6's diagnostic (and this file's own CP6.7 header, above, before
 *   this correction) treated a successful `Browser.getVersion` round
 *   trip as proof "the CDP-over-pipe transport works" on this device.
 *   That conclusion was too broad. `Browser.getVersion` is answered by
 *   the browser process's own CDP handler directly — it never creates
 *   a target, never spawns a renderer, and never touches the network
 *   service. It is a real, valid finding (the pipe handshake itself
 *   works), but it says nothing about whether `Target.createTarget` /
 *   `Target.attachToTarget` / navigation / in-page `Runtime.evaluate`
 *   — everything an actual test needs — also work. Those depend on the
 *   renderer and network-service child processes, which this repo's
 *   own history (CP6.1-CP6.4) already documents as the specific place
 *   Termux's restricted-exec model causes trouble, and which CP6.6's
 *   own Step A (`--dump-dom`, a real page render) has been observed to
 *   FAIL on a run where Step B (`Browser.getVersion` only) PASSED —
 *   direct evidence the two are not the same guarantee. `ping()` below
 *   is kept, named accurately, and documented as browser-level-only so
 *   future diagnosis doesn't repeat this conflation; `createTarget()`
 *   through `navigate()` are the page-level calls that actually matter
 *   for a real test and are exposed individually (rather than only
 *   inside one bundled `newSession()`) specifically so a caller can
 *   report exactly which one failed, instead of collapsing all of them
 *   into one generic "blocked" outcome.
 *
 * CP6.9 ADDITION — unified timestamped trace, for causal-ordering
 *   questions CP6.8's plain setup.log couldn't answer (e.g. "did a
 *   network-service-crash stderr line arrive before or after the
 *   Page.enable request that then timed out?"). `getTrace()` returns
 *   every send/response/event/timeout/transport-error/stderr-line this
 *   process observed, each tagged with the Date.now() it was observed
 *   at, in observation order. Diagnostic-only: adds data collection,
 *   never changes control flow or pass/fail outcomes.
 */

const { spawn } = require('node:child_process');

const DEFAULT_COMMAND_TIMEOUT_MS = 15000;

/**
 * Spawns executablePath with args plus `--headless` and
 * `--remote-debugging-pipe` (added if not already present), wires up
 * fd 3 (write) / fd 4 (read), and resolves with a client object once
 * the process has actually spawned (not once CDP has responded to
 * anything — callers issue their own first command to confirm the
 * handshake, same as CP6.6's Step B did).
 */
function launchWithCDP(executablePath, args = []) {
  return new Promise((resolve, reject) => {
    const fullArgs = [...args];
    if (!fullArgs.includes('--remote-debugging-pipe')) fullArgs.push('--remote-debugging-pipe');
    if (!fullArgs.includes('--headless')) fullArgs.push('--headless');

    let child;
    try {
      child = spawn(executablePath, fullArgs, {
        stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      reject(e);
      return;
    }

    const fd3 = child.stdio[3]; // we write CDP commands here
    const fd4 = child.stdio[4]; // we read CDP responses/events here

    let recvBuf = '';
    let nextId = 1;
    const pending = new Map(); // id -> {resolve, reject}
    const listeners = new Map(); // method -> Set<fn(params, sessionId)>
    let stderrBuf = '';
    let stderrLineBuf = '';
    let closed = false;
    let spawnSettled = false;

    // CP6.9 — unified, timestamped trace of every send/response/event/
    // stderr-line, in the order this process actually observed them.
    // Purpose: answer causal-ordering questions ("did the network
    // service crash message arrive before or after we sent
    // Page.enable?") from a single interleaved timeline instead of
    // trying to align two separate logs after the fact. Every entry
    // uses Date.now() at the moment THIS process received or sent the
    // data — not Chromium's own internal log timestamp (different
    // clock representation, no year, awkward to correlate) — so stderr
    // lines and CDP traffic share one directly-comparable clock.
    // Diagnostic-only: adds data collection, changes no control flow,
    // and is never used to decide pass/fail.
    const trace = [];
    function traceEvent(entry) {
      trace.push({ ts: Date.now(), ...entry });
    }

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrBuf += text;
      stderrLineBuf += text;
      let nl;
      while ((nl = stderrLineBuf.indexOf('\n')) !== -1) {
        const line = stderrLineBuf.slice(0, nl);
        stderrLineBuf = stderrLineBuf.slice(nl + 1);
        if (line) traceEvent({ kind: 'stderr', line });
      }
    });

    child.once('error', (e) => {
      if (!spawnSettled) {
        spawnSettled = true;
        reject(e);
      }
    });

    // fd3/fd4 close/reset (e.g. the browser process exiting, or being
    // killed) surfaces as an 'error' event on these streams. Without a
    // handler, Node treats that as an unhandled 'error' event and
    // crashes the whole process — a transport-level failure, not a
    // reason to take the process down. Record it and fail any commands
    // still waiting on a response instead.
    let transportError = null;
    function onTransportError(e) {
      transportError = e;
      stderrBuf += `\n[transport error on fd3/fd4]: ${e.message}\n`;
      traceEvent({ kind: 'transport-error', code: e.code || null, message: e.message });
      // CP6.8 fix: the rejection message now names the in-flight method
      // (and sessionId, if any) instead of only the opaque request id.
      // Previously `pending` stored only {resolve, reject}, so a
      // transport-level failure (ECONNRESET, EPIPE, browser process
      // dying mid-command) produced a message with no way to tell
      // WHICH CDP call was outstanding — exactly the "BLOCKED
      // classification too broad" gap this checkpoint's investigation
      // was asked to close.
      for (const [id, entry] of pending) {
        const where = entry.sessionId ? `${entry.method} (session ${entry.sessionId})` : entry.method;
        entry.reject(new Error(`CDP transport closed before response arrived (${e.code || e.message}): ${where}, request id ${id}`));
      }
      pending.clear();
    }
    fd3.on('error', onTransportError);
    fd4.on('error', onTransportError);

    fd4.on('data', (chunk) => {
      recvBuf += chunk.toString();
      let idx;
      while ((idx = recvBuf.indexOf('\0')) !== -1) {
        const raw = recvBuf.slice(0, idx);
        recvBuf = recvBuf.slice(idx + 1);
        if (!raw) continue;
        let msg;
        try {
          msg = JSON.parse(raw);
        } catch (_e) {
          continue; // partial/garbled frame — not actionable, skip
        }
        if (msg.id !== undefined && pending.has(msg.id)) {
          const { resolve: res, reject: rej, method: reqMethod, sessionId: reqSessionId } = pending.get(msg.id);
          pending.delete(msg.id);
          traceEvent({ kind: 'recv-response', id: msg.id, method: reqMethod, sessionId: reqSessionId, isError: !!msg.error });
          if (msg.error) rej(new Error(`CDP error (${msg.error.code}): ${msg.error.message}`));
          else res(msg.result);
        } else if (msg.method) {
          traceEvent({ kind: 'event', method: msg.method, sessionId: msg.sessionId });
          const cbs = listeners.get(msg.method);
          if (cbs) for (const cb of cbs) cb(msg.params, msg.sessionId);
        }
      }
    });

    function send(method, params = {}, sessionId, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS) {
      return new Promise((res, rej) => {
        if (transportError) {
          rej(new Error(`CDP transport already closed (${transportError.code || transportError.message}): ${method}`));
          return;
        }
        const id = nextId++;
        const timer = setTimeout(() => {
          pending.delete(id);
          traceEvent({ kind: 'timeout', id, method, sessionId, timeoutMs });
          rej(new Error(`CDP command timed out after ${timeoutMs}ms: ${method}${sessionId ? ` (session ${sessionId})` : ''}`));
        }, timeoutMs);
        pending.set(id, {
          method,
          sessionId,
          resolve: (v) => { clearTimeout(timer); res(v); },
          reject: (e) => { clearTimeout(timer); rej(e); },
        });
        const payload = { id, method, params };
        if (sessionId) payload.sessionId = sessionId;
        traceEvent({ kind: 'send', id, method, sessionId });
        fd3.write(JSON.stringify(payload) + '\0');
      });
    }

    function on(method, cb) {
      if (!listeners.has(method)) listeners.set(method, new Set());
      listeners.get(method).add(cb);
    }

    function off(method, cb) {
      const set = listeners.get(method);
      if (set) set.delete(cb);
    }

    function waitForEvent(method, sessionId, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS) {
      return new Promise((res, rej) => {
        const timer = setTimeout(() => {
          off(method, handler);
          rej(new Error(`timed out waiting for event ${method}`));
        }, timeoutMs);
        function handler(params, sid) {
          if (!sessionId || sid === sessionId) {
            clearTimeout(timer);
            off(method, handler);
            res(params);
          }
        }
        on(method, handler);
      });
    }

    /** Navigates the given session to url and waits for Page.loadEventFired on that session. Caller must have already sent Page.enable for this session. */
    async function navigate(sessionId, url, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS) {
      const loaded = waitForEvent('Page.loadEventFired', sessionId, timeoutMs);
      await send('Page.navigate', { url }, sessionId);
      await loaded;
    }

    /**
     * Evaluates `fn` (a real function, not a string built by hand) in
     * the page, with `args` JSON-serialized in. Supports async
     * functions / functions returning a Promise via awaitPromise.
     * Throws with the page-side exception description on failure.
     */
    async function evaluate(sessionId, fn, ...args) {
      const expression = `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`;
      const result = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      }, sessionId);
      if (result.exceptionDetails) {
        const desc = result.exceptionDetails.exception && result.exceptionDetails.exception.description;
        throw new Error(desc || JSON.stringify(result.exceptionDetails));
      }
      return result.result ? result.result.value : undefined;
    }

    /**
     * A genuine CDP Input-domain click (mousePressed + mouseReleased
     * at the element's real on-screen center), not a page-side
     * `element.click()` call — this dispatches the same synthetic
     * mouse events a real user/Playwright's own page.click() would
     * produce, so Taskbar/WindowManager's real addEventListener
     * click handlers fire exactly as they would for a human.
     */
    async function clickSelector(sessionId, selector) {
      const rect = await evaluate(sessionId, (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, selector);
      if (!rect) throw new Error(`clickSelector: no element matched "${selector}"`);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sessionId);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sessionId);
    }

    /**
     * Browser-level-only ping: `Browser.getVersion` needs no target, no
     * renderer, no network service — it is answered directly by the
     * browser process. This is deliberately the SAME single call
     * CP6.6's diagnostic used, exposed here under an honest name so a
     * caller can confirm "the pipe handshake itself works" as a
     * distinct, narrower claim from "a real page loads" (see the
     * CP6.8 correction in this file's header).
     */
    function ping(timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS) {
      return send('Browser.getVersion', {}, undefined, timeoutMs);
    }

    /** Page-level: creates a new target (tab). This is the first call that requires Chromium's target/renderer machinery beyond the bare browser process CP6.6's ping() already covers. */
    async function createTarget(url = 'about:blank', timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS) {
      const { targetId } = await send('Target.createTarget', { url }, undefined, timeoutMs);
      return targetId;
    }

    /** Page-level: attaches to an existing target and returns the flattened sessionId used by every other per-page call. */
    async function attachToTarget(targetId, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS) {
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }, undefined, timeoutMs);
      return sessionId;
    }

    function enablePage(sessionId, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS) {
      return send('Page.enable', {}, sessionId, timeoutMs);
    }

    function enableRuntime(sessionId, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS) {
      return send('Runtime.enable', {}, sessionId, timeoutMs);
    }

    /**
     * Convenience wrapper composing the four page-level calls above.
     * Kept for simple callers; anything that needs to know exactly
     * which stage failed (e.g. taskbar-cdp-browser.test.js's setup
     * sequence) should call createTarget()/attachToTarget()/
     * enablePage()/enableRuntime() individually instead of relying on
     * this bundling all four failure modes into one thrown error.
     */
    async function newSession() {
      const targetId = await createTarget('about:blank');
      const sessionId = await attachToTarget(targetId);
      await enablePage(sessionId);
      await enableRuntime(sessionId);
      return { sessionId, targetId };
    }

    async function closeSession({ targetId }) {
      try { await send('Target.closeTarget', { targetId }); } catch (_e) { /* best-effort */ }
    }

    function getStderr() {
      return stderrBuf;
    }

    function getTransportError() {
      return transportError;
    }

    /**
     * CP6.9 — full interleaved trace: every CDP send, response, event
     * (including Target.targetCrashed / Inspector.targetCrashed, if
     * they ever fire — no special-casing needed, they arrive through
     * the same generic 'event' trace path as everything else), timeout,
     * transport error, and stderr line, each tagged with the Date.now()
     * this process observed it. Intended to be dumped verbatim into a
     * setup.log so causal-ordering questions ("was there a renderer/
     * network-service message between the Page.enable send and its
     * timeout?") can be answered by reading one ordered list instead of
     * aligning two separate logs by hand.
     */
    function getTrace() {
      return trace.slice();
    }

    function close() {
      if (closed) return;
      closed = true;
      if (stderrLineBuf) {
        traceEvent({ kind: 'stderr', line: stderrLineBuf });
        stderrLineBuf = '';
      }
      try { fd3.end(); } catch (_e) { /* already gone */ }
      try { child.kill('SIGKILL'); } catch (_e) { /* already gone */ }
    }

    child.once('spawn', () => {
      if (spawnSettled) return;
      spawnSettled = true;
      resolve({
        pid: child.pid,
        send,
        on,
        off,
        waitForEvent,
        ping,
        createTarget,
        attachToTarget,
        enablePage,
        enableRuntime,
        navigate,
        evaluate,
        clickSelector,
        newSession,
        closeSession,
        getStderr,
        getTransportError,
        getTrace,
        close,
      });
    });
  });
}

/**
 * CP6.8 — tags known Android/Termux Chromium stderr noise so a BLOCKED
 * report can say which known patterns were present, as CONTEXT, without
 * asserting any of them caused the failure. None of these are treated
 * as fatal by cdp-pipe-client.js itself; classification is informational
 * only, for whoever reads the diagnostic log next. See docs/checkpoints/
 * CP6.1 through CP6.5 for the origin and history of each pattern.
 */
function classifyStderr(text) {
  const patterns = [
    {
      tag: 'LIBTERMUX_EXEC_LINK_ERROR',
      re: /CANNOT LINK EXECUTABLE.*libtermux-exec\.so/,
      note: 'Documented since CP6.1/CP6.2 — a child process re-execing via /proc/self/exe outside termux-exec\'s LD_PRELOAD interception. Expected noise on this device given the current flag set; not by itself evidence of a CDP failure.',
    },
    {
      tag: 'NETWORK_SERVICE_CRASH_RESTART',
      re: /Network service crashed, restarting service/,
      note: 'Known transient on Android Chromium under restricted-exec conditions. Chromium recovers by restarting the service, but a CDP call in flight AT THE MOMENT of the crash can still legitimately fail/time out — correlate timing with the failing stage rather than assuming either "definitely the cause" or "definitely irrelevant".',
    },
    {
      tag: 'NETLINK_PERMISSION_DENIED',
      re: /Could not bind NETLINK socket: Permission denied/,
      note: 'Unprivileged-Android warning, unrelated to CDP — Chromium degrades network-change-detection gracefully without it (documented since CP6.2).',
    },
    {
      tag: 'INOTIFY_WATCH_LIMIT',
      re: /Failed to read \/proc\/sys\/fs\/inotify\/max_user_watches/,
      note: 'Unprivileged-Android warning, unrelated to CDP (documented since CP6.2).',
    },
    {
      tag: 'SIGTRAP_SINGLE_PROCESS_PATTERN',
      re: /SIGTRAP/,
      note: 'CP6.5 removed --single-process specifically because it produced this signal on this device. If this reappears, confirm --single-process has not been reintroduced anywhere in the launch args before investigating anything else.',
    },
  ];
  return patterns
    .map(({ tag, re, note }) => ({ tag, matched: re.test(text), note }))
    .filter((r) => r.matched);
}

module.exports = { launchWithCDP, classifyStderr };
