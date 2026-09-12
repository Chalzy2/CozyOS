# CP6.7 Checkpoint: CDP-Native Taskbar Browser Test (Android/Termux Runtime Path)

**Checkpoint name:** CozyOS-CP6.7-Taskbar-CDP-Android-Checkpoint
**Created:** 2026-08-28
**Built from:** `CozyOS-CP6.6-Taskbar-Termux-Browser-CDP-Pipe-Diagnostic-Checkpoint.zip`

## Problem

`core/shell/tests/taskbar-browser.test.js` (the Playwright-driven
Taskbar real-browser test) cannot execute on the Termux device. Not
because Chromium is missing, not because of a launch-flag crash — the
blocker is one level up, in Playwright's own runtime.

## Evidence that Playwright is installed but unsupported on this platform

Reported directly by the operator, from the real Termux device:

```
node_modules/playwright/          — present
playwright@1.62.1                 — resolvable
require.resolve('playwright')     — succeeds
require('playwright')             — throws: Error: Unsupported platform: android
```

`require.resolve()` only locates the module file; it does not execute
Playwright's own platform-detection code. `require()` does, and that
code refuses Android outright, independent of whether a working
Chromium binary or a working automation transport exists underneath
it. This is a different failure class than every prior CP6.x finding —
those were all about Chromium itself (zygote re-exec, GPU process,
`--single-process` SIGTRAP). This one is about the automation layer
Chromium sits behind.

## Prior evidence relied on (not re-diagnosed)

- **CP6.5 bisect, repeated a second time, 6/6 clean:**
  `00-baseline-headless-only` through `05-disable-crash-reporter` all
  exited 0 with no signal. The combined Android-native flag set
  (`--no-sandbox --no-zygote --disable-gpu --disable-dev-shm-usage
  --in-process-gpu --no-proxy-server --disable-crash-reporter`) renders
  and runs JS correctly on this device, confirmed twice now.
- **CP6.6 CDP diagnostic:** Step B (CDP-over-pipe, same combined flags)
  reported `spawned=true, bytesReceived=true, msToFirstByte=1720`, and
  a valid CDP response to `Browser.getVersion`. The Chromium process
  being SIGKILLed afterward was the diagnostic's own cleanup, not
  evidence CDP failed — it is treated here as PASS, consistent with
  that checkpoint's own pass/fail criterion (a parsed response to
  request id 1).
- Together: Chromium works, the flag set works, and CDP-over-pipe works
  on this exact device. The only unproven piece was whether a real
  multi-command, multi-target CDP session (not just one round-trip)
  could drive an actual test suite — that's what this checkpoint adds.

## Architecture decision

Two parallel real-browser paths, both exercising the same unmodified
production Taskbar/WindowManager:

```
Desktop / Linux / CI
    → Playwright
    → core/shell/tests/taskbar-browser.test.js   (unchanged, still authoritative there)

Android / Termux
    → system Chromium
    → CDP-over-pipe (no playwright import)
    → tools/termux/taskbar-cdp-browser.test.js   (new, this checkpoint)
```

This replaces only the broken automation layer. It does not change
Chromium, the flags, or Taskbar/WindowManager, and does not delete or
weaken the Playwright test.

## What was built

- **`tools/termux/lib/cdp-pipe-client.js`** — new. A small,
  dependency-free CDP-over-pipe client generalizing the transport
  CP6.6 proved (`--remote-debugging-pipe`, fd 3 write / fd 4 read,
  NUL-framed JSON), extended from "one request, one response" to a
  real session: `send()`/event dispatch keyed by request id and
  sessionId, `newSession()`/`closeSession()` (Target domain, flattened
  attach), `navigate()` (Page domain, waits for `Page.loadEventFired`),
  `evaluate()` (Runtime domain, real function serialization,
  `awaitPromise`, exception surfacing), and `clickSelector()` (a
  genuine CDP Input-domain `mousePressed`/`mouseReleased` pair at the
  element's real on-screen center — not a page-side `element.click()`
  call). No `playwright` import anywhere in this file.
- **`tools/termux/taskbar-cdp-browser.test.js`** — new. Same 12
  real-browser checks as `taskbar-browser.test.js`, translated from
  Playwright's `page.evaluate`/`page.click`/`page.$$eval` calls to the
  CDP client's equivalents, against the same unmodified
  `core/shell/tests/taskbar-harness.html` harness and the same local
  static HTTP server pattern. Reports `PASS`/`FAIL`/`BLOCKED`
  explicitly — a missing Chromium binary or a failed CDP handshake is
  reported as `BLOCKED` with the specific reason, never folded into a
  silent "0 tests passed."
- **This checkpoint document.**

## What was explicitly NOT touched

- `server/webauthn-rp/test/browser-launch.js` — untouched.
  `resolveLaunchOptions()` is only imported and called, never edited.
  No flag added, removed, or reordered. `--single-process` was not
  reintroduced.
- `tools/termux/chromium-dependency-verify.js`,
  `tools/termux/chromium-single-process-bisect.js`,
  `tools/termux/chromium-cdp-pipe-combination-diagnostic.js` —
  untouched.
- `core/shell/taskbar.js`, `core/shell/window-manager.js`,
  `core/shell/tests/taskbar-harness.html`,
  `core/shell/tests/taskbar-browser.test.js` — untouched. No second
  WindowManager or Taskbar was created; both are loaded from their real
  files via the real harness, exactly as the Playwright test already
  does.

```
$ md5sum server/webauthn-rp/test/browser-launch.js
2b0e6269670458499ee18fba16b789f4   (unchanged since CP6.5)
$ md5sum tools/termux/chromium-dependency-verify.js
fb07d3328bb5d54cb6f58dafca429f51   (unchanged since CP6.5)
$ md5sum tools/termux/chromium-single-process-bisect.js
21ffdcefae6ff8c56eb82e97bc45dadd   (unchanged since CP6.5)
$ md5sum tools/termux/chromium-cdp-pipe-combination-diagnostic.js
b5651ece439fc1a3cb5cceb7248974de   (unchanged since CP6.6)
$ md5sum core/shell/taskbar.js
b0755554d55ddd0c83c262bee208d4de   (unchanged since CP6)
$ md5sum core/shell/window-manager.js
ede5ab12073a138209087feffe462f3f   (unchanged since CP6)
$ md5sum core/shell/tests/taskbar-harness.html
8482d9a46f3b9001364ff828a9168a53   (unchanged since CP6)
$ md5sum core/shell/tests/taskbar-browser.test.js
0d34fcdd04ed665c24e7084afe42337f   (unchanged since CP6.1 — matches CP6.5's own recorded hash)
$ md5sum tools/termux/taskbar-cdp-browser.test.js
6e1941eb4bc235501ecaac67d53c54fd   (this checkpoint's new file)
$ md5sum tools/termux/lib/cdp-pipe-client.js
fde00cd6d6f6bce89d370afc5afc4833   (this checkpoint's new file)
```

## Tests run (this Cloud sandbox — NOT Android/Termux; see limitations)

```
node --check tools/termux/lib/cdp-pipe-client.js
node --check tools/termux/taskbar-cdp-browser.test.js
```
→ both syntax-valid.

**Committed script, run as-is, no overrides**, against this sandbox's
Playwright-managed desktop Chromium (`/opt/pw-browsers/chromium-1194/`,
via `COZY_E2E_CHROMIUM_PATH`):

```
COZY_E2E_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  node tools/termux/taskbar-cdp-browser.test.js
```
→ `real Chromium launched (pid 578)`, then
`BLOCKED: CDP transport closed before response arrived (ECONNRESET)`.
Chromium's own stderr explained why: this container runs as root, and
Chromium refuses to start without `--no-sandbox` when running as root
(`Running as root without --no-sandbox is not supported`). This is a
property of the Cloud sandbox's root user, not of Termux (an unrooted
Android app), not of this device's Android-native flag set (which
already includes `--no-sandbox` for exactly this class of reason on
Android), and not something this checkpoint changed anything to fix —
the script correctly reported `BLOCKED` rather than a false pass or an
uncaught crash.

That BLOCKED result did surface one real bug, fixed in this
checkpoint: `cdp-pipe-client.js`'s fd3/fd4 streams had no `'error'`
listener, so the ECONNRESET crashed the whole Node process with an
unhandled-event exception instead of being reported. Fixed by treating
fd3/fd4 `'error'` as a transport-level failure: it now rejects any
in-flight CDP commands with a clear message and is captured for
`getStderr()`-style reporting, instead of taking the process down.

**Same script's logic, verified end-to-end** by launching with
`--no-sandbox` added purely as a one-off wrapper for this root-user
Cloud container (not written into any committed file — confirmed by
the hashes above):

```
12 passed, 0 failed, 0 blocked
```
All 12 checks passed against the real, unmodified `taskbar.js` /
`window-manager.js`, driven by real CDP-over-pipe commands (`Runtime.evaluate`
for state/assertions, real `Input.dispatchMouseEvent` mouse-down/mouse-up
pairs for every click, including focus, restore, and both close paths).
This proves the CDP client's session/navigate/evaluate/click plumbing
is correct end-to-end; it does not by itself prove the Android-native
flag combination works through this transport on Android, since this
run used a desktop Chromium binary with no Android-native flags
applied (`isAndroidNative` was `false` here).

## Known limitations (explicitly not claimed as done)

- **Real Android/Termux verification was NOT performed.** Everything
  above ran in this Cloud sandbox, against a desktop Linux Chromium
  binary, as root. This checkpoint is prepared for Termux, not proven
  on it.
- The root/`--no-sandbox` requirement encountered here is specific to
  running as root in this Cloud container and is not expected to
  reproduce on Termux (an unprivileged Android app, already covered by
  the existing `--no-sandbox` in the Android-native flag set) — but
  that expectation is exactly that, an expectation, not a Termux-side
  confirmation.
- The fd3/fd4 `'error'`-handling fix was discovered and fixed via a
  real crash in this sandbox. It has not yet been exercised against
  whatever specific failure mode (if any) the Android-native flag
  combination produces on the real device's CDP pipe.
- No claim of "Production Certified" status is made. Two verification
  levels exist for this feature (desktop/Playwright, Android/CDP); only
  the desktop level plus this Cloud-sandbox CDP dry run are confirmed
  as of this checkpoint. The Android/CDP level is implemented and
  statically verified, not device-verified.

## Next action

Termux restores this checkpoint into `~/K-compare/CozyOS-main` via the
existing checkpoint workflow, then runs:

```
node tools/termux/taskbar-cdp-browser.test.js
```

No environment variable or flag override is needed on Termux — the
script calls the existing `discoverChromium()`/`resolveLaunchOptions()`
unchanged, so it will pick up the real Termux `chromium-browser` binary
and the real Android-native flag set automatically, exactly as
`chromium-dependency-verify.js` and the bisect script already do.

Report the full console output either way — a clean
`12 passed, 0 failed, 0 blocked`, or the specific test name and
PASS/FAIL/BLOCKED reason for whichever check doesn't. Do not run
`core/shell/tests/taskbar-browser.test.js` (the Playwright path) on
Termux — it remains expected to report its own honest `SKIPPED` there,
unrelated to this checkpoint.
