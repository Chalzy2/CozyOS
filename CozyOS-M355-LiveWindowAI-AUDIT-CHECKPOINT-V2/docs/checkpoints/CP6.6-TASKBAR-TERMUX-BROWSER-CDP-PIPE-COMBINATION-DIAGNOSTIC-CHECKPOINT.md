# CP6.6 Checkpoint: CDP-Pipe Combination Diagnostic (No Production Change)

**Checkpoint name:** CozyOS-CP6.6-Taskbar-Termux-Browser-CDP-Pipe-Diagnostic-Checkpoint
**Created:** 2026-08-28
**Built from:** `CozyOS-CP6.5-Taskbar-Termux-Browser-SingleProcess-Removed-Checkpoint.zip`
**Trigger:** Termux re-ran the CP6.5-corrected bisect a second time and
reported a clean pass across all 6 steps:

```
00-baseline-headless-only                    → PASS, exit 0
01-no-sandbox                                → PASS, exit 0
02-no-zygote-disable-gpu-in-process-gpu      → PASS, exit 0
03-disable-dev-shm-usage                     → PASS, exit 0
04-no-proxy-server                           → PASS, exit 0
05-disable-crash-reporter                    → PASS, exit 0
```

No signal crash reproduced. Full logs preserved at
`~/K-compare/CozyOS-main/cozy-chromium-bisect-1787926041410` (six log
files, ~1.6 MB total) — **not** superseded or deleted by this
checkpoint; still the evidence trail for every bisect step above.

Separately, and not yet explained by the above: the exact combined
CP6.5 flag set, launched the way production actually launches it,
previously reported:

```
ETIMEDOUT, killed=false, signal=null, exit=0
```

That shape doesn't match a bisect-script timeout (which sets
`killed=true`) or a crash (which sets a signal). Per instruction, no
production code was touched to chase this — a diagnostic was built
first.

## Diagnosis (why the passing bisect doesn't already explain the ETIMEDOUT)

- `chromium-single-process-bisect.js` only ever runs
  `--headless --dump-dom`. That path never opens a CDP channel at all —
  Chromium renders the fixture, dumps the DOM, and exits. It cannot, by
  construction, reveal a problem that only exists in the CDP transport.
- The real production path — `chromium.launch(resolveLaunchOptions(...))`
  as used by `taskbar-browser.test.js` and step 4 of
  `chromium-dependency-verify.js` — always opens CDP. Playwright's
  default transport for a launched (non-`connectOverCDP`) Chromium is a
  pair of inherited pipe file descriptors opened via
  `--remote-debugging-pipe` (fd 3 = commands in, fd 4 = events out), not
  a websocket.
- So the passing bisect and the hanging production launch were never
  actually exercising the same code path. The one variable the bisect
  never touched — CDP-over-pipe — is exactly the candidate the
  `killed=false, signal=null, exit=0` shape points at: a process that's
  still alive and never force-killed, with something waiting on it that
  never arrived. That's consistent with Playwright's own launch-level
  timeout firing while the underlying Chromium process sat idle,
  independent of whether the DOM/renderer path (already proven fine by
  six bisect passes) works at all.
- The Playwright prerequisite itself is still unresolved in this
  environment, so the diagnostic could not depend on `require('playwright')`
  — it needed to answer the CDP-pipe question on its own, with a raw
  pipe handshake, so that question isn't blocked on this one.

## What was built (diagnostic only — no repair)

- **`tools/termux/chromium-cdp-pipe-combination-diagnostic.js`** — new
  file. Does two things, both using the exact combined Android-native
  flag set (imported directly from `resolveLaunchOptions()`, not
  hand-copied — closing the "two lists kept in sync by hand" risk
  `chromium-dependency-verify.js`'s own header has flagged since CP6.2):
  - **Step A (control):** re-runs the same `--dump-dom` check the
    bisect already validated, to reconfirm nothing regressed before
    trusting Step B.
  - **Step B (isolation):** launches with `--remote-debugging-pipe`,
    writes a single `Browser.getVersion` CDP request to fd 3, and waits
    up to 15s for a valid JSON response on fd 4 — recording whether the
    process spawned, whether any bytes ever arrived on fd 4, time to
    first byte, and the final exit code/signal after this script forces
    the process down. Requires no `playwright` import.
  - Full, untruncated stderr captured for both steps, written to their
    own log files under a fresh `cozy-chromium-cdp-diagnostic-<ts>/`
    directory — separate from, and not replacing, the CP6.5 bisect log
    directory.
- **This checkpoint document.**

## What was explicitly NOT touched

- `server/webauthn-rp/test/browser-launch.js` — untouched. This
  checkpoint diagnoses; it does not repair. `resolveLaunchOptions()` is
  only read (imported), never modified.
- `tools/termux/chromium-dependency-verify.js`,
  `tools/termux/chromium-single-process-bisect.js` — untouched.
- `core/shell/tests/taskbar-browser.test.js`, `taskbar.js`,
  `window-manager.js`, `taskbar-harness.html`, `admin-workspace.html`,
  `package.json` — untouched. The Taskbar browser test was **not run**
  this checkpoint, per instruction — the Playwright prerequisite is
  still unresolved.
- `cozy-chromium-bisect-1787926041410/` — untouched, not deleted, still
  the evidence trail for the CP6.5 bisect result.

```
$ md5sum tools/termux/chromium-cdp-pipe-combination-diagnostic.js
b5651ece439fc1a3cb5cceb7248974de   (this checkpoint's new file)
```

## Tests (this sandbox)

```
node --check tools/termux/chromium-cdp-pipe-combination-diagnostic.js
```
→ syntax valid.

```
node tools/termux/chromium-cdp-pipe-combination-diagnostic.js
```
→ `No system Chromium discovered` — this sandbox has no Android-native
Chromium (no `PREFIX`, no `chromium-browser`/`chromium` on PATH), so
the script correctly falls through to its no-op guard, the same way
the bisect and verify scripts already do here. This is not itself
evidence either way about the CDP-pipe question — only confirms the
script requires `browser-launch.js` cleanly, guards correctly on a
platform with no Android-native binary, and never touches
`playwright`.

## Known limitations (explicitly not claimed as done)

- **Not run against the real ETIMEDOUT yet.** This checkpoint only adds
  the tool. Only Termux's run of it, against the real device, tells us
  whether Step B actually reproduces or clears the CDP-pipe hypothesis.
- If Step A now fails on the real device (unlikely given two clean
  bisect passes, but not assumed here), Step B's result should not be
  trusted in isolation — the script's own summary output says so.
- This diagnostic does not touch, and cannot substitute for, the actual
  Playwright-driven launch. A Step B pass narrows the field but does
  not by itself prove `chromium.launch()` will succeed — only that a
  bare CDP-pipe handshake does, under identical flags.

## Next action

Termux runs:
```
node tools/termux/chromium-cdp-pipe-combination-diagnostic.js
```
Report the full console summary and both log files
(`step-A-dump-dom-control.log`, `step-B-cdp-pipe.log`) regardless of
outcome. Do not run the Taskbar browser test, and do not delete the
CP6.5 bisect log directory, until this comes back and is reviewed.
