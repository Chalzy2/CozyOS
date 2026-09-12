# CP6.8 Checkpoint: Staged CDP Diagnostics for the Taskbar Android Blocker

**Checkpoint name:** CozyOS-CP6.8-Taskbar-CDP-Android-Diagnostics-Checkpoint
**Created:** 2026-08-28
**Built from:** `CozyOS-CP6.7-Taskbar-CDP-Android-Checkpoint.zip`

## 1. ROOT CAUSE

Two distinct problems, both found by actually running CP6.7's code, not
by inspection alone:

1. **`cdp-pipe-client.js` collapsed all setup failures into one
   undifferentiated message.** Its `pending` map stored only
   `{resolve, reject}` per in-flight CDP request id — no method name.
   When the fd3/fd4 transport closed (ECONNRESET, EPIPE, the browser
   process dying mid-command), the rejection message could only say
   `request id N`, not which CDP call was outstanding. Combined with
   `taskbar-cdp-browser.test.js` wrapping its entire setup sequence
   (launch → session → navigate → module checks) in one try/catch, a
   real Android BLOCKED result gave no way to tell whether Chromium
   never answered at all, answered but couldn't create a target,
   created a target but couldn't navigate, or navigated but the
   fixture's JS never ran. This is why the reported Android result —
   `0 passed, 0 failed, 1 blocked` — was uninformative on its own.

2. **CP6.6's "CDP-over-pipe: PASS" was a real but narrower finding
   than it was being treated as.** That diagnostic's Step B sends
   exactly one command, `Browser.getVersion`, and calls it PASS on a
   valid response. `Browser.getVersion` is answered by the browser
   process's own CDP handler directly — it creates no target, spawns
   no renderer, and touches no network service. It proves the pipe
   handshake itself works. It does **not** prove `Target.createTarget`,
   `Target.attachToTarget`, page navigation, or in-page
   `Runtime.evaluate` work — everything `taskbar-cdp-browser.test.js`
   actually needs, and everything this repo's own CP6.1-CP6.4 history
   already documents as the specific place Termux's restricted-exec
   model (the `/proc/self/exe` re-exec / `libtermux-exec.so` linker
   failure, the network-service crash/restart cycle) causes trouble.
   Direct evidence the two are different guarantees: a CP6.6 run on the
   real device recorded Step A (`--dump-dom`, a real page render) as
   **FAIL** in the same session Step B (**PASS**, browser-level only)
   succeeded.

Neither of these is a Chromium flag problem. No flag changed in this
checkpoint.

## 2. WHY CP6.6 CDP "WORKED"

It genuinely did — for the narrow thing it tested. `Browser.getVersion`
requires no target/renderer/network-service involvement, so a device
where the renderer or network service is flaky can still answer it
reliably. That's a real, useful finding (the transport itself is
sound), and it's kept in this checkpoint as `cdp.ping()`, named and
documented accurately as browser-level-only, specifically so it isn't
mistaken for page-level proof again.

## 3. WHY CP6.7 TASKBAR CDP IS BLOCKING

Cannot be stated definitively without a real Android run of the
improved diagnostics (that's the point of this checkpoint), but the
evidence narrows it to one of: target creation, attachment, domain
enabling, or navigation — the page-level stages CP6.6 never actually
exercised. This checkpoint does not guess which one; it makes the next
real run say which one, precisely, and retries the two stages most
plausibly affected by the documented network-service restart
transient before reporting either of them as failed.

In this Cloud sandbox specifically, running the committed script
against a real Chromium binary surfaced a concrete (sandbox-specific)
example of exactly this improvement working: the exact same setup used
to report a bare `ECONNRESET`; it now reports
`ping (browser-level CDP handshake): CDP transport closed before
response arrived (ECONNRESET): Browser.getVersion, request id 1`,
which is immediately actionable (this container runs as root, and
Chromium needs `--no-sandbox` as root) instead of requiring a follow-up
investigation turn. That is not the Android finding — it is proof the
new diagnostics behave as intended.

## 4. EXACT FILES CHANGED

- `tools/termux/lib/cdp-pipe-client.js`
- `tools/termux/taskbar-cdp-browser.test.js`

Nothing else. No production file, no other tool, no manifest deleted.

## 5. EXACT FIX

**`cdp-pipe-client.js`:**
- `pending` map entries now store `{ method, sessionId, resolve, reject }`
  instead of only `{ resolve, reject }`. Both the timeout path and the
  transport-error path now name the exact method (and session, if any)
  that was outstanding.
- Added `ping()` — the exact CP6.6 `Browser.getVersion` call, exposed
  under an honest, narrowly-scoped name.
- Added `createTarget()`, `attachToTarget()`, `enablePage()`,
  `enableRuntime()` as individually callable stages (previously only
  available bundled inside `newSession()`, which still exists as a
  convenience wrapper for callers that don't need per-stage labeling).
- Added `classifyStderr(text)` — a pure, exported function tagging
  known Android/Termux stderr patterns (`libtermux-exec` linker error,
  network-service crash/restart, NETLINK/inotify permission noise,
  a `SIGTRAP` sanity check for `--single-process` never having
  reappeared) as **context for a human reading a BLOCKED log**, not as
  an automatic cause determination — none of these patterns are treated
  as fatal or non-fatal by the client itself.

**`taskbar-cdp-browser.test.js`:**
- Setup is now a sequence of individually labeled stages (ping → create
  target → attach → enable Page → enable Runtime → navigate → check
  `window.CozyOS.WindowManager`/`.Taskbar` → check taskbar
  self-mounted), each updating a `stage` variable before the call it
  guards, so a thrown error is reported as `"<stage>: <message>"` —
  matching the exact BLOCKED vocabulary requested for this checkpoint.
- `Target.createTarget` and the harness navigation are wrapped in
  `withOneRetry()` — one retry after a 1s delay, both attempts' errors
  preserved and shown if both fail. This is disclosed in the log output
  (`(attempt 1 of "..." failed: ... — retrying once ...)`), never
  silently swallowed, and scoped only to the two stages plausibly
  affected by the documented network-service-restart transient — not
  applied blanket across every stage.
- Every setup outcome (pass or blocked) now writes a full log to
  `./cozy-taskbar-cdp-diagnostic-<timestamp>/setup.log`, closing the
  gap where CP6.7's Taskbar test produced no diagnostic directory at
  all, unlike every other `tools/termux/` diagnostic in this repo. On
  a BLOCKED outcome the log includes the stage, the raw error, any
  `classifyStderr()` tags, the transport error (if any), the launch
  args, and the full untruncated Chromium stderr.

## 6. CLOUD TEST RESULTS

```
node --check tools/termux/lib/cdp-pipe-client.js
node --check tools/termux/taskbar-cdp-browser.test.js
```
→ both syntax-valid.

**Committed script, as-is, no overrides** (root Cloud container,
`COZY_E2E_CHROMIUM_PATH` pointed at the sandbox's own Chromium):
```
✓ real Chromium launched (pid 521)
✗ setup
    BLOCKED: ping (browser-level CDP handshake): CDP transport closed
    before response arrived (ECONNRESET): Browser.getVersion, request id 1
0 passed, 0 failed, 1 blocked
Full setup log: .../cozy-taskbar-cdp-diagnostic-<ts>/setup.log
```
Chromium's own stderr in that log explains it precisely: "Running as
root without --no-sandbox is not supported." A property of this
container's root user, not of Termux, and not fixed by (or requiring)
any change to production flags.

**Same script, logic verified end-to-end**, `--no-sandbox` added only
as a throwaway wrapper for this root container (never written into any
committed file — confirmed by the hash table below):
```
✓ real Chromium launched (pid 538)
✓ CDP pipe connected (browser-level ping answered)
✓ page target created
✓ attached to target (session established)
✓ Page/Runtime domains enabled
✓ harness navigated + loaded
✓ WindowManager loaded
✓ Taskbar loaded
✓ Taskbar self-mounted #cozy-taskbar-root
... (all 12 tests) ...
12 passed, 0 failed, 0 blocked
```
No regression from the CP6.7 result — same outcome, now with staged,
visible progress through setup instead of one bundled step.

**Regression suites**, unaffected by this checkpoint's changes:
```
node core/shell/tests/taskbar-browser.test.js
```
→ 12 passed, 0 failed (desktop Playwright path, untouched).
```
node core/modules/ChurchOS/test/living-worship-player-mini-pip-browser.test.js
```
→ 14 passed, 0 failed.

**Retry logic**, verified in isolation (simulated transient failure,
succeeding on the second attempt): confirmed it retries once, logs the
first failure without hiding it, and returns the successful second
result — matching the "disclosed, not masked" requirement.

## 7. UNCHANGED PRODUCTION FILES + HASH CONFIRMATION

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
0d34fcdd04ed665c24e7084afe42337f   (unchanged since CP6.1)
$ md5sum core/modules/ChurchOS/test/living-worship-player-mini-pip-browser.test.js
6a7dab033220341f88cf1f930e4884e5   (unchanged; regression-tested above)
```

Investigation confirmed no production Taskbar/WindowManager bug — both
files are untouched, per instruction, since nothing implicated them.

```
$ md5sum tools/termux/lib/cdp-pipe-client.js
137a89ff91ba46f506cd1bb840f6ad19   (this checkpoint's edit)
$ md5sum tools/termux/taskbar-cdp-browser.test.js
1276ca38dc500bdc33a706872d3861dd   (this checkpoint's edit)
```

## Verification vocabulary — Cloud vs Android

**Cloud verification:** staged diagnostics implemented, syntax-checked,
and run for real against a genuine Chromium binary in this sandbox —
both the honest-BLOCKED path (root/no-sandbox) and the full-pass path
(12/0/0 with a throwaway `--no-sandbox` wrapper) were exercised.
Regression suites unaffected.

**Android verification: not yet run.** Everything above is Cloud-side.
This checkpoint does not claim, and should not be read as implying, any
Android/Termux result — improved or otherwise. No "Production
Certified" status is claimed.

## 8. CHECKPOINT NAME

`CozyOS-CP6.8-Taskbar-CDP-Android-Diagnostics-Checkpoint`

## 9. CHECKPOINT ZIP NAME

`CozyOS-CP6_8-Taskbar-CDP-Android-Diagnostics-Checkpoint.zip`

## 10. EXACT NEXT TERMUX COMMAND

```
cd ~/K-compare/CozyOS-main && node tools/termux/taskbar-cdp-browser.test.js
```

No environment variable, no flag override, no bisect. If it blocks,
report the exact `BLOCKED: <stage>: <message>` line and the full
`cozy-taskbar-cdp-diagnostic-<timestamp>/setup.log` it now always
produces — that will name precisely which of the seven setup stages
failed, which this checkpoint exists to make possible.
