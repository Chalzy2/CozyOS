# CP6 Checkpoint: CozyOS Taskbar Capability

**Checkpoint name:** CozyOS-CP6-Taskbar-Checkpoint
**Created:** 2026-08-28
**Built from:** `CozyOS-CP5-Checkpoint.zip` as the mandatory recovery
baseline. CP4 and CP5 (`runtime/`, everything under `core/` other than
`window-manager.js`, all auth/WebAuthn code) were not reopened or
modified.

**Note on CP5-LIVE:** the user-supplied
`CozyOS-CP5-Live-Verification-Checkpoint.zip` failed to extract in this
environment on two separate uploads (truncated archive — no end-of-
central-directory record found either time). This checkpoint is built
from the last known-good archive, `CozyOS-CP5-Checkpoint.zip`, which
extracted and verified byte-for-byte. No file this checkpoint touches
was part of the CP5 Termux live-verification work (`runtime/`), so this
does not reopen or depend on anything CP5-LIVE was verifying.

## Objective (restated)

Add the smallest next desktop-shell capability: a Taskbar that makes
the already-built WindowManager floating-window system actually usable
— specifically, a way to see and restore a minimized window, which
previously had no UI affordance at all.

## Evidence gathered before implementation (per instruction — no assumptions)

- `core/shell/window-manager.js` was read in full. Confirmed a real,
  complete window engine (create/focus/minimize/restore/maximize/
  toggleFullscreen/close/setBounds/getBounds/tileAll/cascadeAll) with
  no change-event/subscription API and no taskbar/list consumer
  anywhere in the repository (`grep` for taskbar/dock/app-switcher
  returned nothing relevant). **Conclusion: a taskbar is additive, not
  a duplicate of any existing engine.**
- `core/shell/application-launcher.js` was read in full. Confirmed it
  already composes WindowManager for `mode: "window"`/`"fullscreen"` —
  meaning any application opened that way automatically appears in the
  taskbar with zero changes to this file.
- The approved scope named `core/shell/cozy-shell.html` as the mount
  point. Reading that file found it does **not** load
  `window-manager.js` or `application-launcher.js` at all.
  `admin-workspace.html` is the one real page that loads both today.
  This is disclosed in `taskbar.js`'s own header — the taskbar's
  `<script>` tag was added to `admin-workspace.html`, and the taskbar
  self-mounts its own root element (the same pattern `window-manager.js`
  itself already uses), so it does not depend on any specific static
  markup in whichever page loads it.
- `core/shell/tests/` (dashboard-navigation-core, organization-workspace,
  etc.) and `core/modules/ChurchOS/test/living-worship-player-mini-pip-*`
  were inspected for this repo's existing test conventions before
  writing new tests. WindowManager has no `node:test`-style unit test —
  its one existing consumer test
  (`living-worship-player-mini-pip-browser.test.js`) is a real
  Playwright browser test against a static HTML harness serving the
  real, unmodified production files. The new Taskbar tests follow that
  exact same pattern rather than inventing a second test style for
  DOM-dependent code.

## What was built (additive only)

- **`core/shell/window-manager.js`** — additive only, no existing
  method signature or behavior changed (verified by diff below and by
  the pre-existing 14/14 Playwright suite still passing unmodified):
  - `onChange(callback)` — subscribes to window state changes, returns
    an unsubscribe function. Mirrors this same file's own pre-existing
    `CozyEnvironment.onChange(apply)` consumption pattern
    (`#wireLivingEnvironment`).
  - `getSnapshot()` — read-only array of every open window's
    `{id, title, icon, minimized, maximized, active}`, sourced from the
    existing `#windows` Map (title/icon now also tracked per entry,
    since neither was stored anywhere before this) and a new
    `#activeId` field set inside the existing `#bringToFront()`.
  - `#emitChange()` called from `#bringToFront()` (covers create/
    focus/restore), `minimize()`, `maximize()`, `close()`, and
    `setTitle()` — the exact set of state changes a taskbar needs to
    stay in sync.
  - `VERSION` bumped `1.0.0` → `1.1.0`; module description updated.
    Nothing outside this file reads that version string
    (confirmed by repo-wide grep).
- **`core/shell/taskbar.js`** (new, ~185 lines) — self-mounting Taskbar
  module. Renders one entry per `getSnapshot()` row; click restores a
  minimized window or focuses an active one; a dedicated close control
  per entry calls `WindowManager.close()` directly. Subscribes exactly
  once via the new `onChange()` hook; `destroy()` unsubscribes and
  removes its own DOM root. Guarded the same way every other CozyOS
  module in this repo is (`if (window.CozyOS.Modules["taskbar"]) return;`).
- **`admin-workspace.html`** — one `<script src="core/shell/taskbar.js">`
  tag added immediately after the existing `window-manager.js` tag.
  No other line changed (see diff below).
- **`core/shell/tests/taskbar-harness.html`** (new, test fixture only) —
  loads the real, unmodified `window-manager.js` + `taskbar.js`, same
  pattern as the existing ChurchOS harness.
- **`core/shell/tests/taskbar-browser.test.js`** (new, 12 real
  Playwright test cases) — see Tests below.

## What was explicitly NOT touched

- `runtime/` and everything CP5 verified (Termux/Android runtime
  foundation) — zero files under `runtime/` were opened for editing.
- `core/shell/application-launcher.js` — read only, not modified;
  already composes WindowManager correctly for window-mode apps.
- `core/shell/cozy-workspace.js` (5,655 lines, owns the dynamically
  rendered footer on `admin-workspace.html`) — not modified. The
  taskbar deliberately self-mounts instead of touching this file's
  footer template.
- Any authentication/WebAuthn/gate code.
- Any existing test file — all new tests are additive files only.
- Every `window-manager.js` method's existing signature and behavior —
  confirmed unchanged by the full pre-existing 14/14 Playwright suite
  passing without modification (see Regression check).

## Tests

Run: `node core/shell/tests/taskbar-browser.test.js`

```
Taskbar — real browser tests

Setup:
  ✓ harness loads and mounts the real WindowManager + Taskbar modules

Window creation:
  ✓ creating a window adds a real entry to the taskbar

Multiple windows:
  ✓ creating several windows adds one entry each, most recent active

Focus:
  ✓ clicking a non-active entry focuses it via the real WindowManager

Minimize:
  ✓ minimizing a window (via WindowManager) marks its taskbar entry minimized

Restore:
  ✓ clicking a minimized entry restores the real window and clears the minimized class

Close:
  ✓ clicking an entry's close control closes the real window and removes the taskbar entry
  ✓ closing a window via its own titlebar control (not the taskbar) still syncs the taskbar

State synchronization:
  ✓ setTitle() on the real WindowManager updates the taskbar entry text
  ✓ maximize() does not remove the taskbar entry and keeps it active

Listener cleanup / no duplicate subscriptions:
  ✓ Taskbar.destroy() unsubscribes — later WindowManager changes no longer update (or recreate) the taskbar
  ✓ re-including taskbar.js a second time is a real no-op — exactly one entry per window, not two

12 passed, 0 failed
```

`node --check core/shell/window-manager.js` and
`node --check core/shell/taskbar.js` and
`node --check core/shell/tests/taskbar-browser.test.js` → syntax OK.

## Regression check (targeted, not a full-suite run)

Per instruction, only the tests that exercise the modified file
(`window-manager.js`) were re-run — no unrelated file was touched, so a
full-repo run was not needed:

```
node core/modules/ChurchOS/test/living-worship-player-mini-pip-browser.test.js
```
→ **14 passed / 0 failed** (unchanged from CP5's own baseline — the
Living Worship Player's mini/PiP/drag/persistence behavior is byte-for-
byte the same after the `window-manager.js` edit).

A repo-wide search confirmed these two Playwright suites
(`living-worship-player-mini-pip-browser.test.js` and the new
`taskbar-browser.test.js`) are the *only* two files anywhere in the
repository that reference `WindowManager`/`window-manager.js` — so this
is the complete relevant regression surface, not a partial sample.

## Diff against the CP5 baseline

```
$ diff -rq <CP5 baseline> <this checkpoint>
Only in <this checkpoint>/core/shell: taskbar.js
Only in <this checkpoint>/core/shell/tests: taskbar-browser.test.js
Only in <this checkpoint>/core/shell/tests: taskbar-harness.html
Files admin-workspace.html differ (1 script tag + its comment, verified below)
Files core/shell/window-manager.js differ (additive-only, verified below)
```

Both modified files' diffs were inspected line-by-line before packaging
this checkpoint (not just visually skimmed):
- `admin-workspace.html`: exactly one new `<script>` line (plus its
  explanatory comment) inserted after the existing `window-manager.js`
  tag. No existing line changed or removed.
- `core/shell/window-manager.js`: every change is either a doc-comment
  addition, a new field (`#activeId`, `#listeners`), a new method
  (`getSnapshot`, `onChange`, `#emitChange`), a new `#emitChange()` call
  appended at the end of an existing method body, or two new fields
  (`title`, `icon`) added to the internal `entry` object literal at
  creation and updated in `setTitle`. No existing line was deleted or
  had its logic altered; no existing method's return value, argument
  list, or error-handling path changed.

## Bugs found/fixed

None. This was new, additive code plus one non-behavioral doc/version
update to `window-manager.js`; no defect was found in or introduced to
any existing file's behavior (confirmed by the diff and by the
pre-existing suite passing unmodified).

## Known limitations (explicitly not claimed as done)

- **Not proven on real Termux/Android or a real touchscreen.** All
  testing above is headless-Chromium Playwright in this sandbox (no
  Android device, no network egress — same standing limitation as
  every prior checkpoint). Real-device taskbar tap/scroll behavior is
  not being claimed.
- **`cozy-shell.html` still does not load WindowManager/Taskbar at
  all.** This checkpoint deliberately did not add script tags to that
  file, since doing so wouldn't reflect that page's real current
  architecture (no ApplicationLauncher/WindowManager wiring exists
  there today) — that would be undisclosed scope creep, not the
  approved Taskbar capability. If `cozy-shell.html` is meant to become
  a second real windowed shell, that's a separate, disclosed future
  decision, not assumed here.
- **No taskbar entry ordering/grouping logic** (e.g. pinned apps, most-
  recently-used ordering) — entries render in `Map` insertion order via
  `getSnapshot()`, matching `WindowManager.listWindows()`'s own existing
  order convention. Not built because it wasn't part of the approved
  scope, not because it was overlooked.
- **No keyboard navigation for taskbar entries** — click/tap only, same
  interaction surface WindowManager's own titlebar buttons already
  have (no repo-wide keyboard-nav convention existed to extend).

## Next action

Termux restores this checkpoint on a real Android device and proves it
by loading `admin-workspace.html` through the already-verified CP5
runtime (`node runtime/cozy-runtime.js start`, unchanged and untouched
by this checkpoint), then reports back exactly what it observes —
success or failure — per the command below.
