# CP6.3 Checkpoint: Termux Chromium `--no-proxy-server` / `--disable-crash-reporter` Fix

**Checkpoint name:** CozyOS-CP6.3-Taskbar-Termux-Browser-Proxy-Crashpad-Fix-Checkpoint
**Created:** 2026-08-28
**Built from:** `CozyOS-CP6.2-Taskbar-Termux-Browser-SingleProcess-Fix-Checkpoint.zip`
**Trigger:** Termux retried `chromium-dependency-verify.js` with CP6.2's
`--single-process` flag applied. Step 1 (`--version`) still passed. Step
2 no longer reported the `libtermux-exec.so` linker error, but did not
reach a final `PASS` either — the new repeated line was:
```
Cannot use V8 Proxy resolver in single process mode.
```
alongside DBus, `inotify` `max_user_watches`, `NETLINK` permission, and
Crashpad permission/error messages. Termux made no code changes.

## Correction to CP6.2, stated plainly

CP6.2's checkpoint text said `--single-process` "removes the only
remaining cause" of the `/proc/self/exe` re-exec failure, as if that
settled the matter. That was an overstatement: it correctly identified
`--single-process` as the standard fix *for the re-exec problem
specifically*, but this run never got far enough to confirm that
problem is actually gone — a different, `--single-process`-specific
side effect (below) surfaced first and prevented a clean pass/fail
reading either way. Both the original re-exec hypothesis and this new
one now need `browser-launch.js` header comments are updated to no
longer imply confidence beyond what's actually been shown, and this
document does not repeat that mistake: everything below is still
unproven until Termux reports an actual `PASS`.

## Diagnosis (evidence gathered before touching anything)

- `Cannot use V8 Proxy resolver in single process mode.` is a
  long-standing, widely-reported Chromium message, not new to CozyOS or
  Termux — it comes from `proxy_service_factory.cc` /
  `system_network_context_manager.cc` and appears specifically and only
  when `--single-process` is used. Multiple independent public reports
  (Chromium issue 80564; CEF, brozzler, and nw.js bug trackers) confirm
  the same line under the same flag across many Chromium versions:
  `--single-process` removes the separate process Chromium would
  normally use to host an out-of-process V8 instance for PAC
  (proxy-auto-config) script evaluation, and Chromium logs this as an
  error when it would otherwise have used that path.
- Two documented workarounds exist: `--winhttp-proxy-resolver` (Windows
  only — not applicable to a Termux/Android binary) or removing the
  need for proxy resolution entirely with `--no-proxy-server`. Since
  this test fixture makes no outbound network requests at all (it's
  served from a local HTTP server over `file://`/`localhost`, loading
  only local repo files), disabling proxy support changes nothing about
  what's under test.
- The Crashpad permission/error messages are consistent with a second,
  independent process-launch problem of the same shape as the
  zygote/`/proc/self/exe` issue CP6.1/CP6.2 addressed: Crashpad's own
  crash handler is a separate process Chromium spawns on startup, and
  spawning it under the same restricted-exec Termux environment is a
  plausible source of the same class of failure. It serves no purpose
  for a disposable, scripted, headless verification run, so it's
  disabled outright rather than debugged.
- **What's still not established:** whether removing these two sources
  of noise reveals a clean `PASS`, or whether the original
  `/proc/self/exe`/termux-exec problem (or something else) is still
  present underneath them. The verifier's step-2 failure handler was
  also updated (below) to report exit code, signal, and whether our own
  30s timeout fired — the prior two reports could not distinguish "hung
  again" from "crashed" from "exited cleanly but unhappy," and that
  distinction matters for what Cloud should try next if this doesn't
  pass either.

## What was built (repair, additive only)

- **`server/webauthn-rp/test/browser-launch.js`** — Android-native args
  gained `--no-proxy-server` and `--disable-crash-reporter`. Header
  comment corrected (see above) and extended with rationale for both
  new flags, each citing the specific evidence for it.
- **`tools/termux/chromium-dependency-verify.js`**:
  - Raw-CLI flag list synced with the two new flags.
  - Step 2's failure handler now reports `killed by our timeout`,
    `signal`, and `exit code` explicitly, instead of only the error
    message text, so a future report can distinguish a hang from a
    crash from a clean nonzero exit without guessing from prose.
- **This checkpoint document.**

## What was explicitly NOT touched

- `core/shell/tests/taskbar-browser.test.js`, `taskbar.js`,
  `window-manager.js`, `taskbar-harness.html`, `admin-workspace.html`,
  `package.json` — unchanged. Checksum below confirms the test file.

```
$ md5sum core/shell/tests/taskbar-browser.test.js
0d34fcdd04ed665c24e7084afe42337f   (unchanged since CP6.1/CP6.2)
```

## Tests (this sandbox, unchanged behavior confirmed)

```
node core/shell/tests/taskbar-browser.test.js         → 12 passed / 0 failed
node core/modules/ChurchOS/test/living-worship-player-mini-pip-browser.test.js
                                                        → 14 passed / 0 failed
```
Both unchanged from CP6.1/CP6.2 — this sandbox has no Android-native
Chromium, so it never exercises the new flags; only Termux's retry can.

## Known limitations (explicitly not claimed as done)

- **Not proven on real Android/Termux — still.** This is the third
  iteration on the same underlying goal; the pattern so far (fix one
  process-launch failure, uncover the next one) means a further
  not-yet-visible issue after this one is a real possibility, not
  hypothetical.
- If step 2 still doesn't show `PASS`, the new exit-code/signal/timeout
  reporting added here should make the next report far more precise
  than "no final PASS shown" — please include those three new lines
  verbatim along with the stderr tail.
- `--disable-crash-reporter` and `--no-proxy-server` are both safe,
  narrowly-scoped, standard Chromium flags with no bearing on
  Taskbar/WindowManager behavior; they only affect how the test's
  disposable browser instance starts up.

## Next action

Termux re-runs and reports full output including the new exit
code/signal/timeout lines if step 2 fails again:
```
node tools/termux/chromium-dependency-verify.js
```
If PASS on all 4 steps:
```
node core/shell/tests/taskbar-browser.test.js
```
No manual code repair on the Termux side either way — a new or
persisting failure comes back to Cloud.
