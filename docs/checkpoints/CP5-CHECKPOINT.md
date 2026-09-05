# CP5 Checkpoint: CozyOS Android Runtime Foundation

**Checkpoint name:** CozyOS-CP5-Checkpoint
**Created:** 2026-08-28
**Built from:** `CozyOS-CP4-Part3B-3-Checkpoint.zip` as the mandatory
recovery baseline. No CP4 work was reopened.

## Objective (restated)

Make CozyOS capable of running as a local, desktop-like runtime on the
Android phone via `Android/HyperOS -> Termux -> Linux userspace +
Node.js -> CozyOS Runtime -> CozyOS Workspace`, without replacing
Android/HyperOS or attempting a full OS replacement.

## Evidence gathered before implementation (per instruction — no assumptions)

- `core/bootstrap/bootstrap.js` — the repo's only pre-existing
  "bootstrap" — was read in full. It is entirely browser-scoped
  (`window.CozyOS`, `document.createElement('script')`, `navigator`,
  `location`). It cannot run under plain Node.js/Termux and was not
  modified. **Conclusion: no existing Node-side runtime entry point
  exists to extend; a new one is additive, not a duplicate.**
- `server/static-boundary-server.js` (CP4) was confirmed to be a real,
  already-tested, plain-Node HTTP server with zero browser dependency,
  exporting `createBoundaryServer` for reuse. **Conclusion: the local
  Workspace launch target already exists and did not need to be
  reimplemented — only launched, with local-only config, behind a
  health gate.**
- `tools/termux/*.js` was inspected for prior Termux-specific patterns
  (`cozy-pack.js`, `cozy-pack-core.js`, `cozy-media-pack.js`,
  `chromium-dependency-verify.js`). None of them implement environment
  detection, a Node-version check, or a lifecycle-managed server —
  they are packaging/verification utilities for a different purpose.
  No existing pattern was duplicated; none existed to duplicate.
- `package.json` was read for the single source of truth on required
  Node version (`engines.node: ">=22.5.0"`) rather than hardcoding a
  second copy of that number.
- `scripts/verify-production-routing.sh`'s `resolve_workdir` (CP4) was
  reused as the precedent for the writable-directory fallback pattern
  now implemented in Node as `resolveRuntimeDir`, rather than inventing
  a new fallback strategy.

## What was built (additive only)

New top-level `runtime/` directory:

- `runtime/cozy-runtime.js` (430 lines) — the runtime foundation module
  + CLI:
  - `detectEnvironment()` — Termux/Android/generic Node detection via
    `PREFIX` containing `com.termux` (the one Termux-documented signal;
    cross-checked against existing `tools/termux/*.js`, none of which
    assert a stronger one), plus platform/arch/Node version/hostname.
  - `checkNodeCompatibility()` — compares the running Node version
    against `package.json`'s own `engines.node`, fails closed (reports
    incompatible) on anything unparseable rather than assuming success.
  - `resolveRuntimeDir()` — writable local runtime directory with a
    fallback chain (`$COZY_RUNTIME_DIR` -> `~/.cozyos/runtime` ->
    system tmp dir -> repo-local fallback).
  - `checkModuleHealth()` — confirms `server/static-boundary-server.js`,
    `server/webauthn-rp/server.js`, `server/webauthn-rp/db.js` resolve
    via `require.resolve` (existence/loadability only — never executes
    them, so a health check can never trigger a dependency's own side
    effects).
  - `getHealthReport()` — machine-readable JSON
    (`schema: "cozyos.runtime.health.v1"`) combining all of the above,
    with a `diagnostics` array that always contains a plain-language
    line for every failed sub-check.
  - `CozyRuntime` class — `start()`/`stop()` lifecycle: refuses to
    start if the health check fails (returns why, does not throw an
    opaque error), otherwise launches CP4's unmodified
    `createBoundaryServer` against a local-only config (loopback host,
    a runtime-dir-local sqlite path, `localhost` RP id/origin),
    installs `SIGINT`/`SIGTERM` handlers for clean shutdown.
  - CLI: `node runtime/cozy-runtime.js check` (health only, exit 0/1,
    JSON on stdout, diagnostics on stderr) and `... start` (launches the
    local Workspace in the foreground).
- `runtime/tests/cozy-runtime.test.js` (249 lines, 19 `node:test`
  cases) — covers every function above against real conditions (real
  filesystem, real ephemeral loopback server, real request/response
  round-trips), not mocks, because the module under test exists
  specifically to catch real missing-file/wrong-Node/unwritable-dir
  conditions.
- `runtime/README.md` — entry-point documentation, CLI usage, and an
  explicit statement of what local test passes do and do not prove
  (see "Known limitations" below).

Builder knowledge:

- `docs/builder/knowledge/lessons-learned.md` — new "Runtime/Platform
  Patterns" section (3 entries), appended only; no existing content in
  the file was altered.
- `docs/builder/improvements/CP5-improvement-report.md` — one finding
  (IMP-CP5-001: verify environment assumptions from the code, not the
  filename), deliberately not padded with additional entries the work
  didn't actually produce.

## What was explicitly NOT touched

- `core/bootstrap/bootstrap.js` and everything else under `core/`.
- `server/static-boundary-server.js`, `server/webauthn-rp/*` — consumed
  via `require()`/`require.resolve()` only, never modified.
- `render.yaml`, any CP4 production routing/config.
- Any authentication/WebAuthn/gate code.
- Any existing test file.
- `docs/builder/knowledge/lessons-learned.md`'s pre-existing content
  (append-only edit, verified by diff below).

## Tests

- `node --check runtime/cozy-runtime.js` and
  `node --check runtime/tests/cozy-runtime.test.js` → syntax OK.
- `node --test runtime/tests/cozy-runtime.test.js` → **19 pass / 0
  fail**.
- Manual CLI verification (not just unit tests): `node
  runtime/cozy-runtime.js check` → real JSON health report, exit 0.
  `node runtime/cozy-runtime.js start` → real local Workspace on
  `127.0.0.1:18787`; `curl` confirmed `/` → 200, `/admin` → 404,
  `/webauthn/session` → 401 — i.e. CP4's actual gate behavior, reached
  through the new runtime, unmodified.

## Regression check (targeted, not the full 305-suite)

Per instruction, the full 305-test suite was **not** re-run, since no
file it covers was modified. Instead, a targeted regression check was
run against exactly the modules `runtime/` newly depends on:

- `node --test server/webauthn-rp/test/*.test.js` → **111 pass / 0
  fail** — confirms requiring these modules from the new runtime layer
  introduces no regression in their own pre-existing suite.

## Bugs found/fixed

None. This was new, additive code; no defect was found in or introduced
to any existing file (confirmed by the diff below).

## Diff against the CP4-Part3B-3 baseline

```
$ diff -rq <CP4-Part3B-3 baseline> <this checkpoint>
Only in <this checkpoint>: runtime
Only in <this checkpoint>/docs/builder/improvements: CP5-improvement-report.md
Only in <this checkpoint>/docs/checkpoints: CP5-CHECKPOINT.md
docs/builder/knowledge/lessons-learned.md differs (append-only — see below)
```

`lessons-learned.md`'s diff is a pure append: every pre-existing line is
unchanged; only a new trailing section was added. Verified with `diff`
(not just visual inspection) before packaging this checkpoint.

## Known limitations (explicitly not claimed as done)

- **Not proven on real Termux/Android.** Everything above is local
  sandbox verification (this environment has no Android device and no
  network egress, same standing limitation as every CP4 checkpoint).
  Android/Termux runtime success is not being claimed — only that the
  foundation is built, internally consistent, and passes every test
  runnable in this environment.
- **Not a production certification.** This checkpoint is a local
  foundation only; it says nothing about `cozyos.org` production
  behavior, which CP4-Part3B-3 already covers separately.
- **`isTermux` detection is single-signal.** It relies on `PREFIX`
  containing `com.termux`, the one signal documented by Termux itself
  and consistent with this repo's existing `tools/termux/*.js`. If a
  future real-device run finds this insufficient (e.g. a non-standard
  Termux fork), that's a finding for the next checkpoint, not something
  assumed away here.
- **No packaging/install step.** This foundation assumes Node 22.5+ and
  a cloned repository already present under Termux; it does not attempt
  to install Node, clone the repo, or manage Termux packages. That is
  future scope if the objective requires it, not assumed as already
  done.

## Next action

Termux restores this checkpoint on a real Android device, runs
`node runtime/cozy-runtime.js check` first, and only if that reports
`ok: true` proceeds to `node runtime/cozy-runtime.js start`, then
reports back the exact JSON/console output (success or failure) —
see the exact command below.
