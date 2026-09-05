# CP6.4 Checkpoint: Bisect Step Ordering Fix (GPU Child-Process Launch)

**Checkpoint name:** CozyOS-CP6.4-Taskbar-Termux-Browser-Bisect-GPU-Step-Fix-Checkpoint
**Created:** 2026-08-28
**Built from:** `CozyOS-CP6.3-Taskbar-Termux-Browser-Proxy-Crashpad-Fix-Checkpoint.zip`
**Trigger:** Termux ran `tools/termux/chromium-single-process-bisect.js`
(the CP6.4-diagnostic bisect script written after CP6.3's combined-flag
run reported an unexplained SIGTRAP). Result:
```
00-baseline-headless-only → signal=null, exit=0, killed=false
01-no-sandbox             → signal=null, exit=0, killed=false
02-no-zygote              → signal=SIGABRT, exit=null, killed=false
```
Chromium's own stderr at step 02:
```
GPU process exited unexpectedly: exit_code=256
GPU process isn't usable. Goodbye.
```
Per the bisect script's own design, it stopped at this first signal.
Termux made no code changes — correctly, per the bisect script's own
instructions not to touch `--no-zygote`.

## Diagnosis (evidence gathered before touching anything)

- The crash is real, but it is **not the SIGTRAP** the CP6.3
  combined-flag run reported — it's a different signal, a different
  message, and (this is the important part) it happened at a step the
  bisect's own step ordering created artificially: step 02 tests
  `--no-sandbox --no-zygote` alone, with none of the GPU-related flags
  (`--disable-gpu`, `--in-process-gpu`) added yet. Production code
  (`browser-launch.js`'s `resolveLaunchOptions()`) never launches
  Chromium in that partial state — it applies all eight Android-native
  flags together, in one `args` array, every time. So step 02 answered
  a question the real launch configuration never asks.
- What the step 02 crash *does* show, correctly: once `--no-zygote`
  disables pre-fork zygote-based process creation, launching the GPU
  child process falls back to the same direct fork/exec path already
  diagnosed for the renderer in CP6.1/CP6.2 — and that path fails the
  same way under Termux's restricted-exec model (the termux-exec
  LD_PRELOAD interception doesn't survive it). `exit_code=256` is a
  crashed/non-zero child exit, and headless Chromium's own fatal
  fallback (`GPU process isn't usable. Goodbye.`) tears down the whole
  browser rather than retry indefinitely.
- This is a documented pattern, not unique to CozyOS or this bisect:
  independent reports describe a `--type=gpu-process` child spawning
  and failing to initialize even with `--in-process-gpu` set (CEF forum,
  magpcss.org/ceforum topic 18982), and a Chromium headless tracker
  entry confirms a GPU process launch is attempted — and can fail —
  unless `--disable-gpu` is present (issues.chromium.org/issues/40527919).
- **What this does *not* establish:** whether the actual production flag
  set (all eight flags together, `--disable-gpu`/`--in-process-gpu`
  included) still hits this same GPU-process failure, or whether it
  avoids it and the CP6.3 SIGTRAP is a separate, still-unidentified
  cause further down the flag list. Both remain open.

## What was built (repair, additive/reordering only)

- **`tools/termux/chromium-single-process-bisect.js`** — the `STEPS`
  array now introduces `--no-zygote`, `--disable-gpu`, and
  `--in-process-gpu` together, as one step, instead of `--no-zygote`
  alone followed by the GPU flags two steps later. Rationale: these
  three flags are causally coupled (eliminating the GPU child-process
  launch has to happen at the same time zygote-based forking is turned
  off, not after), and pairing them here matches how production code
  actually applies them — together, in a single launch. Steps were
  renumbered (7 steps instead of 9); no step was removed, only merged.
  File header extended with a dated correction explaining the CP6.3→CP6.4
  step change and citing the supporting evidence.
- **`--no-zygote` itself was not touched.** It is unchanged, still the
  first Android-workaround flag applied, in this script and in
  `browser-launch.js`. Neither `browser-launch.js` nor
  `chromium-dependency-verify.js` was modified — both already apply all
  eight flags together and needed no change.
- **This checkpoint document.**

## What was explicitly NOT touched

- `server/webauthn-rp/test/browser-launch.js`,
  `tools/termux/chromium-dependency-verify.js`,
  `core/shell/tests/taskbar-browser.test.js`, `taskbar.js`,
  `window-manager.js`, `taskbar-harness.html`, `admin-workspace.html`,
  `package.json` — unchanged.

```
$ md5sum core/shell/tests/taskbar-browser.test.js
0d34fcdd04ed665c24e7084afe42337f   (unchanged since CP6.1/CP6.2/CP6.3)
$ md5sum server/webauthn-rp/test/browser-launch.js
e364fe8a2c2ae2388559d9f08e1a1452   (unchanged since CP6.3)
$ md5sum tools/termux/chromium-dependency-verify.js
d422835750964f5e777596b1f0999be5   (unchanged since CP6.3)
$ md5sum tools/termux/chromium-single-process-bisect.js
2a64da6496e79f7fca7a9f02ab05b3ef   (this checkpoint's edit)
```

## Tests (this sandbox, unchanged behavior confirmed)

```
node core/shell/tests/taskbar-browser.test.js         → 12 passed / 0 failed
node core/modules/ChurchOS/test/living-worship-player-mini-pip-browser.test.js
                                                        → 14 passed / 0 failed
```
Both unchanged from CP6.1–CP6.3 — this sandbox has no Android-native
Chromium, so it cannot itself exercise the bisect script or the
Android-native launch flags; only Termux's retry can.

## Known limitations (explicitly not claimed as done)

- **Not proven on real Android/Termux — still.** This checkpoint fixes
  a flaw in the *diagnostic tool's* step ordering, not a confirmed
  production fix. It has not been shown that the full eight-flag
  production launch avoids the CP6.3 SIGTRAP; that is still the open
  question this next bisect run is for.
- If the bisect now reaches a later step (single-process,
  no-proxy-server, or disable-crash-reporter) before crashing, that
  step's flag is the far more useful answer to CP6.3's original
  question. If it crashes again at the merged step 02
  (`no-zygote-disable-gpu-in-process-gpu`), that would mean the GPU
  child-process launch fails even with the suppression flags active —
  a genuinely new finding that would need its own diagnosis, not
  something to guess at now.
- If the bisect reaches the end with no signal at all, that's evidence
  (not proof) that the CP6.3 SIGTRAP may be intermittent or dependent
  on something outside flag combination alone — worth stating plainly
  rather than declaring victory.

## Next action

Termux re-runs the corrected bisect script and reports the full summary
plus the full log file for whichever step (if any) first shows a
signal:
```
node tools/termux/chromium-single-process-bisect.js
```
No manual code repair on the Termux side either way — a new or
persisting failure comes back to Cloud, per the bisect script's own
standing instruction.
