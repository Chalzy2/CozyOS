'use strict';

/**
 * core/shell/tests/admin-workspace-launch-gate-handoff.test.js
 *
 * DESTINATION/HANDOFF regression test — NOT a launch-sequence redesign.
 *
 * ROOT CAUSE CONFIRMED: admin-workspace.html loads
 * <script src="core/shell/launch-sequence.js"> very early in its body
 * (line ~451) but only registers its own
 * bus.once("cozy:launch-sequence-complete", proceedOnce) listener near
 * the very end of the file (line ~1857) — with 50+ real <script> tags,
 * each requiring a real sequential load, in between. launch-sequence.js's
 * "skip when Bootstrap.isStarting()" fix (previous checkpoint) correctly
 * skips its own animation and emits the completion event IMMEDIATELY —
 * but "immediately" is long before that later listener has been
 * registered, so the event fires into the void and the page fell through
 * to the (correct, but slow) 12-second fallback timer instead of the
 * intended zero-delay handoff. This is why the real phone test still
 * showed the launch/logo screen: it eventually would have proceeded
 * after ~12 real seconds, not never — but that is still not "no second
 * wait", and a slow/unstable connection could plausibly make it look
 * stuck for longer.
 *
 * FIX UNDER TEST: admin-workspace.html's own gating code (immediately
 * before it registers that listener) now checks the exact same real,
 * unmodified window.CozyOS.Bootstrap.isStarting() condition DIRECTLY,
 * and proceeds straight to proceedPastLaunchScreen() when true — no
 * event wait, no 12-second fallback, in the one case where
 * launch-sequence.js has already structurally guaranteed it skipped
 * itself. Every other real caller (standalone page load) is unaffected:
 * falls through to the exact same, unmodified event-based path as
 * before.
 *
 * This file extracts and runs the REAL, final <script> block from
 * admin-workspace.html verbatim (same extraction technique already
 * established by server/test/chalzydashboard-bootstrap-failure-
 * visibility.test.js) — it does not reimplement mountWorkspaceIfAdmin,
 * proceedPastLaunchScreen, or the gating logic. window.CozyOS.
 * WorkspaceShell.mount() itself (the real Enterprise Control Center
 * renderer — a large, separate rendering subsystem) is stubbed, exactly
 * the way this repository already stubs deep rendering internals while
 * proving real handoff/wiring code; everything ABOVE that boundary
 * (AdminGateCore, PlatformEventBus, the real fetch("/webauthn/session")
 * call, the real Bootstrap-state check) is real and unmodified.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..', '..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function extractBootWorkspaceIIFE(html) {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  const match = withoutComments.match(/\(function bootWorkspace\(\) \{[\s\S]*?\n\s*\}\)\(\);/);
  if (!match) throw new Error('Could not locate the real bootWorkspace() IIFE in admin-workspace.html');
  return match[0];
}

function makeElement() {
  return { innerHTML: '', classList: { add() {}, remove() {} }, style: {}, remove() {} };
}

function buildSandbox({ bootstrapping, sessionVerdict, mountCalls }) {
  const root = makeElement();
  const launchScreen = makeElement();
  const elementsById = { 'cozy-workspace-root': root, 'cozy-launch-screen': launchScreen };

  const sandbox = {
    window: {
      CozyOS: {
        PlatformEventBus: (() => {
          let listener = null;
          return {
            once: (event, fn) => { if (event === 'cozy:launch-sequence-complete') listener = fn; },
            _fireCompletion: () => { if (listener) listener(); },
          };
        })(),
        AdminGateCore: undefined, // set below, real file
        WorkspaceShell: { mount: (r) => { mountCalls.push(r); } },
        Bootstrap: bootstrapping === undefined ? undefined : { isStarting: () => bootstrapping },
      },
      location: { href: '' },
    },
    document: { getElementById: (id) => elementsById[id] || null },
    fetch: async (url) => {
      assert.equal(url, '/webauthn/session');
      return { status: sessionVerdict.httpStatus, json: async () => sessionVerdict };
    },
    console,
    // Deliberately non-firing: no test in this file depends on the real
    // 12-second fallback actually elapsing (the Bootstrap-composing
    // tests prove it is bypassed entirely; the standalone test fires the
    // completion event manually) — a real setTimeout here would leave a
    // genuine 12s timer alive in the background for the rest of this
    // test file's process for no benefit.
    setTimeout: () => 0, clearInterval: () => {}, setInterval: () => 0,
  };
  sandbox.window.location = sandbox.window.location;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('core/shell/admin-gate-core.js'), sandbox, { filename: 'admin-gate-core.js' });
  return { sandbox, root, launchScreen };
}

const ADMIN_WORKSPACE_HTML = read('admin-workspace.html');
const BOOT_WORKSPACE_IIFE = extractBootWorkspaceIIFE(ADMIN_WORKSPACE_HTML);

test('sanity: the real bootWorkspace() IIFE was actually extracted (regex did not silently match nothing)', () => {
  assert.match(BOOT_WORKSPACE_IIFE, /mountWorkspaceIfAdmin/);
  assert.match(BOOT_WORKSPACE_IIFE, /isStarting/, 'the real handoff fix must be present in the extracted block');
});

test('3. successful admin session + Bootstrap actively composing (post-login) -> mounts the real Enterprise Control Center IMMEDIATELY, no event/timeout wait', async () => {
  const mountCalls = [];
  const { sandbox, root } = buildSandbox({
    bootstrapping: true,
    sessionVerdict: { httpStatus: 200, authenticated: true, isPlatformAdmin: true },
    mountCalls,
  });

  const startedAt = Date.now();
  vm.runInContext(BOOT_WORKSPACE_IIFE, sandbox, { filename: 'bootWorkspace.js' });
  // mountWorkspaceIfAdmin() is async (awaits fetch) — flush microtasks.
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const elapsedMs = Date.now() - startedAt;

  assert.equal(mountCalls.length, 1, 'WorkspaceShell.mount() — the real Enterprise Control Center — must be mounted');
  assert.equal(mountCalls[0], root);
  assert.ok(elapsedMs < 1000, `must not depend on the 12s fallback or wait for an event that will never arrive (took ${elapsedMs}ms)`);
});

test('4. no second launch sequence: the completion-event listener is never even relied upon when Bootstrap is composing (proceeds without the event ever firing)', async () => {
  const mountCalls = [];
  const { sandbox } = buildSandbox({
    bootstrapping: true,
    sessionVerdict: { httpStatus: 200, authenticated: true, isPlatformAdmin: true },
    mountCalls,
  });

  vm.runInContext(BOOT_WORKSPACE_IIFE, sandbox, { filename: 'bootWorkspace.js' });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  // Deliberately never call sandbox.window.CozyOS.PlatformEventBus._fireCompletion()
  // here — proving the mount did NOT depend on it (i.e. did not depend on
  // launch-sequence.js's skip-emit actually being heard).
  assert.equal(mountCalls.length, 1, 'must have mounted already, without the completion event ever being fired');
});

test('standalone (non-Bootstrap) admin page load: unaffected — still mounts only after the real completion event, exactly as before', async () => {
  const mountCalls = [];
  const { sandbox } = buildSandbox({
    bootstrapping: undefined, // window.CozyOS.Bootstrap does not exist — standalone page load
    sessionVerdict: { httpStatus: 200, authenticated: true, isPlatformAdmin: true },
    mountCalls,
  });

  vm.runInContext(BOOT_WORKSPACE_IIFE, sandbox, { filename: 'bootWorkspace.js' });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  assert.equal(mountCalls.length, 0, 'must NOT mount before the real completion event fires when not composed via Bootstrap');

  sandbox.window.CozyOS.PlatformEventBus._fireCompletion();
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  assert.equal(mountCalls.length, 1, 'must mount once the real event genuinely fires, unchanged existing behavior');
});

test('5. an ordinary (non-admin) session, even with Bootstrap composing, is NEVER mounted into the Enterprise Control Center', async () => {
  const mountCalls = [];
  const { sandbox } = buildSandbox({
    bootstrapping: true,
    sessionVerdict: { httpStatus: 200, authenticated: true, isPlatformAdmin: false },
    mountCalls,
  });

  vm.runInContext(BOOT_WORKSPACE_IIFE, sandbox, { filename: 'bootWorkspace.js' });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  assert.equal(mountCalls.length, 0, 'a non-admin must never reach WorkspaceShell.mount(), regardless of Bootstrap state');
  assert.equal(sandbox.window.location.href, 'chalzydashboard.html', 'must be sent back through the canonical, honest denial path');
});

test('5b. an unauthenticated session, even with Bootstrap composing, is NEVER mounted', async () => {
  const mountCalls = [];
  const { sandbox } = buildSandbox({
    bootstrapping: true,
    sessionVerdict: { httpStatus: 401, authenticated: false },
    mountCalls,
  });

  vm.runInContext(BOOT_WORKSPACE_IIFE, sandbox, { filename: 'bootWorkspace.js' });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  assert.equal(mountCalls.length, 0);
  assert.equal(sandbox.window.location.href, 'chalzydashboard.html');
});
