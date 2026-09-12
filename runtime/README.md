# CozyOS Runtime Foundation (CP5)

Node.js-side entry point for running CozyOS locally under:

```
Android/HyperOS -> Termux -> Linux userspace + Node.js -> CozyOS Runtime -> CozyOS Workspace
```

This does not replace Android/HyperOS and does not attempt any OS-level
work. It runs inside whatever userspace Termux (or any Node 22.5+ host)
provides, and reuses CP4's `server/static-boundary-server.js` unmodified
as the thing it launches — it does not reimplement request handling,
auth, or static serving.

## Why a separate runtime layer

`core/bootstrap/bootstrap.js` — the repo's only pre-existing "bootstrap"
— is entirely browser-scoped (`window`, `document`, `navigator`,
`location`). It cannot run under plain Node.js/Termux and this work does
not modify it. `runtime/` is additive: a new, Node-only entry point, not
a duplicate or a replacement of anything under `core/`.

## Files

- `cozy-runtime.js` — the module + CLI. Exports `CozyRuntime` plus the
  individual pure functions it's built from (`detectEnvironment`,
  `checkNodeCompatibility`, `resolveRuntimeDir`, `checkModuleHealth`,
  `getHealthReport`).
- `tests/cozy-runtime.test.js` — `node:test` suite; run with
  `node --test runtime/tests/cozy-runtime.test.js`.

## CLI usage

```bash
# Health check only — no server started, no ports bound, no side effects.
node runtime/cozy-runtime.js check

# Start a local Workspace on 127.0.0.1:8787 (override with
# COZY_RUNTIME_PORT). Runs in the foreground; Ctrl+C stops it cleanly.
node runtime/cozy-runtime.js start
```

`check` prints a machine-readable JSON health report
(`schema: "cozyos.runtime.health.v1"`) to stdout and exits `0` if
healthy, `1` if not, with plain-language diagnostic lines on stderr for
every failed check. This is what Termux (or any script) should call
before attempting `start`.

## What "healthy" means here

- The running Node version satisfies this repo's own
  `package.json` → `engines.node` (read once, not duplicated).
- `server/static-boundary-server.js`, `server/webauthn-rp/server.js`,
  and `server/webauthn-rp/db.js` all resolve via `require.resolve`
  (existence/loadability only — nothing is executed by a health check).
- A writable local runtime directory can be found, trying
  `$COZY_RUNTIME_DIR`, then `~/.cozyos/runtime`, then a tmp dir, then a
  repo-local fallback, in that order.

## What this does not claim

Local (sandbox) test passes here prove the Node-level logic is correct.
They do **not** prove this runs successfully under real Termux on a real
Android device — that requires an actual on-device run, reported back
with real command/output, per the project's standing rule against
claiming Android/Termux success from local tests alone.
