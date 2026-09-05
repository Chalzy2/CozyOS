# CP6.5 Checkpoint: `--single-process` Removed (Not Supported on Android)

**Checkpoint name:** CozyOS-CP6.5-Taskbar-Termux-Browser-SingleProcess-Removed-Checkpoint
**Created:** 2026-08-28
**Built from:** `CozyOS-CP6.4-Taskbar-Termux-Browser-Bisect-GPU-Step-Fix-Checkpoint.zip`
**Trigger:** Termux re-ran the CP6.4-corrected bisect on the real device:

```
00-baseline-headless-only                    → PASS, exit 0
01-no-sandbox                                → PASS, exit 0
02-no-zygote-disable-gpu-in-process-gpu      → PASS, exit 0
03-disable-dev-shm-usage                     → PASS, exit 0
04-single-process                            → CRASH, SIGTRAP
```
First crash: `04-single-process`. Termux made no repair, per the
bisect script's standing instruction. Taskbar browser test explicitly
**not** run this round, per instruction — this checkpoint only touches
the flag list and the diagnostic script.

## Diagnosis

- This is a clean, unambiguous boundary, unlike CP6.4's step-02 finding:
  every flag up through `--disable-dev-shm-usage` passes, and adding
  exactly one more flag — `--single-process` — turns a working launch
  into a SIGTRAP. There's no step-ordering artifact to correct here;
  the crash is attributable to that one flag.
- **The important part:** steps 00-03 passing means the fixture
  actually rendered and ran its inline `<script>` (the bisect and
  verify scripts only report PASS when the runtime-computed DOM marker
  is found) — with the renderer running as a real child process,
  *without* `--single-process`. That directly undercuts the premise
  CP6.1/CP6.2 built `--single-process` on: that the renderer's own
  `/proc/self/exe` re-exec would still fail under termux-exec's
  LD_PRELOAD interception even with `--no-zygote` active. On this
  device, once `--no-zygote`, `--disable-gpu`, and `--in-process-gpu`
  are active together (CP6.4's merged step), the renderer already
  launches cleanly. `--single-process` was solving a problem that no
  longer existed once the GPU flags were correctly paired with it.
- Separately, `--single-process` is documented as unsupported on
  Chrome/Chromium for Android at all — not a Termux-specific quirk. A
  Chromium-dev mailing-list thread on this exact flag ("Flags
  --single-process doesn't work on chrome public 50.0.2652.0")
  concludes plainly that Chrome for Android doesn't support
  single-process mode and isn't guaranteed to work properly in it. A
  SIGTRAP with no other signal is consistent with that: Chromium
  release builds turn `CHECK()`/`NOTREACHED()` failures into
  `base::ImmediateCrash()`, which executes a trap instruction rather
  than segfaulting or aborting — it's an intentional hard stop, not
  memory corruption or a resource limit. An independently filed CEF
  issue (chromiumembedded/cef#4067) reproduces a SIGTRAP tied
  specifically to `--single-process` on recent Chromium builds, and its
  own workaround drops `--single-process` in favor of
  `no-zygote`/`no-sandbox`/`in-process-gpu`/`disable-dev-shm-usage` —
  the same flags steps 01-03 here already validated independently.
- **What this does not establish:** whether `--no-proxy-server` and
  `--disable-crash-reporter` (added in CP6.3 for reasons specific to
  `--single-process`'s own side effects — the V8 proxy resolver error
  and Crashpad noise) are still needed, harmful, or irrelevant now that
  `--single-process` is gone. They're kept, untested in isolation, per
  "repair only what the evidence supports."

## What was built (repair)

- **`server/webauthn-rp/test/browser-launch.js`** — `--single-process`
  removed from `resolveLaunchOptions()`'s Android-native args array.
  File header's `--single-process` section extended with a dated
  CP6.5 correction explaining why (see Diagnosis above), rather than
  deleting the CP6.1-CP6.3 history — the prior reasoning was reasonable
  given what was known at each point; the correction records what
  changed and why, the same pattern CP6.3 and CP6.4 already used.
- **`tools/termux/chromium-dependency-verify.js`** — its
  hand-synced `flagArgs` array (kept in sync with
  `resolveLaunchOptions()` by comment convention, since step 2's raw
  CLI launch runs before Playwright is even required) updated to match:
  `--single-process` removed, comment extended with the same CP6.5
  correction.
- **`tools/termux/chromium-single-process-bisect.js`** — the
  `04-single-process` step removed from `STEPS`; `no-proxy-server` and
  `disable-crash-reporter` renumbered to 04/05 so they now run directly
  after the already-passing `disable-dev-shm-usage` step instead of
  after a crash. File header extended with a dated correction citing
  the evidence above.
- **This checkpoint document.**

## What was explicitly NOT touched

- `core/shell/tests/taskbar-browser.test.js`, `taskbar.js`,
  `window-manager.js`, `taskbar-harness.html`, `admin-workspace.html`,
  `package.json` — unchanged. The Taskbar browser test was explicitly
  **not run** this checkpoint, per instruction — not in this sandbox,
  not on Termux.

```
$ md5sum core/shell/tests/taskbar-browser.test.js
0d34fcdd04ed665c24e7084afe42337f   (unchanged since CP6.1)
$ md5sum server/webauthn-rp/test/browser-launch.js
2b0e6269670458499ee18fba16b789f4   (this checkpoint's edit)
$ md5sum tools/termux/chromium-dependency-verify.js
fb07d3328bb5d54cb6f58dafca429f51   (this checkpoint's edit)
$ md5sum tools/termux/chromium-single-process-bisect.js
21ffdcefae6ff8c56eb82e97bc45dadd   (this checkpoint's edit)
```

## Tests

- `node --check` run against all three edited files — syntax valid.
- No test suite executed this checkpoint (Taskbar browser test
  withheld per instruction; no Android-native Chromium in this sandbox
  to exercise the bisect/verify scripts directly either way).

## Known limitations (explicitly not claimed as done)

- **Not proven on real Android/Termux — still.** This removes the flag
  the evidence points at and updates both scripts that reference it,
  but only Termux's next run confirms it.
- `--no-proxy-server` and `--disable-crash-reporter` remain in the flag
  set untested on their own. If Termux's next run passes cleanly
  through them, that's reasonable confirmation they're harmless; if
  either now causes its own failure with `--single-process` out of the
  picture, that's new information, not something to guess at now.
- This checkpoint deliberately says nothing about the Taskbar browser
  test — that is still explicitly out of scope until told otherwise.

## Next action

Termux re-runs the corrected bisect script:
```
node tools/termux/chromium-single-process-bisect.js
```
Expected: all 6 steps (00-05) PASS with no signal. Report the full
summary either way — a clean pass through all steps, or a new crash at
whichever step (if any) first shows one.

Still **do not** run the Taskbar browser test until that comes back
and is reviewed.
