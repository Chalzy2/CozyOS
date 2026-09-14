'use strict';
/**
 * CozyOS Runtime Foundation — runtime/cozy-runtime.js (CP5)
 *
 * WHAT THIS IS
 * ------------
 * The Node.js-side runtime entry point for running CozyOS as a local,
 * desktop-like process under:
 *
 *   Android/HyperOS -> Termux -> Linux userspace + Node.js -> CozyOS
 *   Runtime -> CozyOS Workspace
 *
 * This does NOT replace Android/HyperOS and does NOT attempt any OS-level
 * work. It is a plain Node.js module + CLI that runs inside whatever
 * userspace Termux (or any other Node 22+ host) provides.
 *
 * WHY THIS FILE EXISTS (repository evidence, not assumption)
 * ------------------------------------------------------------
 * `core/bootstrap/bootstrap.js` is CozyOS's only existing "bootstrap" —
 * inspected before writing this file. It is entirely browser-scoped: it
 * reads/writes `window.CozyOS`, injects `<script>` tags into `document`,
 * and reads `navigator`/`location`. None of that exists under plain
 * Node.js/Termux. So there is no existing Node-side runtime entry point
 * to extend — this is additive, not a replacement or duplicate of
 * anything in `core/bootstrap/`, `core/shell/`, or `tools/termux/`.
 *
 * `server/static-boundary-server.js` (CP4, untouched by this file) is a
 * real, already-tested, plain-Node HTTP server with no browser
 * dependency at all — `createBoundaryServer()` is reused here exactly as
 * exported, unmodified, as the thing this runtime launches locally. This
 * runtime foundation does not reimplement request handling, auth, or
 * static serving — it only decides *whether* and *how* to start what
 * already exists, and reports on whether it's safe to.
 *
 * SCOPE (CP5 — foundation only)
 * -------------------------------
 * - environment detection (Termux/Android/generic Node, arch, Node version)
 * - Node.js compatibility check against this repo's own `package.json`
 *   `engines.node` requirement (single source of truth, not duplicated)
 * - a local runtime directory (state/logs/db), resolved with a writable
 *   fallback chain
 * - module/health detection for the specific Node-loadable pieces this
 *   runtime depends on, using `require.resolve` (no side effects, no
 *   execution) so a missing/broken file is reported, not thrown
 * - startup/shutdown lifecycle for a local Workspace instance
 * - a machine-readable JSON health report
 *
 * Explicitly NOT in scope: anything that touches `server/webauthn-rp/*`
 * behavior, `render.yaml`, production routing, or CP4's gate/auth logic.
 * This file only *consumes* `createBoundaryServer` as a black box.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------
// Environment detection
// ---------------------------------------------------------------------

/**
 * Detects the runtime environment CozyOS is currently executing in.
 * Pure — reads only `process.env`/`os`/`fs`, no side effects.
 */
function detectEnvironment(env = process.env) {
  const prefix = env.PREFIX || null;
  // Termux sets PREFIX to a path containing "/com.termux/" — this is the
  // one Termux-specific signal documented by Termux itself (there is no
  // dedicated "is Termux" env var). Cross-checked against the existing
  // Termux tooling already in this repo (`tools/termux/*.js`), none of
  // which assert a stronger detection signal than this.
  const isTermux = typeof prefix === 'string' && prefix.includes('com.termux');
  const platform = os.platform(); // 'android' is not a Node os.platform() value; Termux reports 'linux'
  const isAndroidKernel = isTermux || /android/i.test(env.ANDROID_ROOT || env.ANDROID_DATA || '');

  return Object.freeze({
    platform,
    arch: os.arch(),
    nodeVersion: process.version,
    isTermux,
    isAndroidKernel,
    prefix,
    hostname: os.hostname(),
    homedir: os.homedir(),
    tmpdir: os.tmpdir(),
    cwd: process.cwd(),
    repoRoot: REPO_ROOT,
  });
}

// ---------------------------------------------------------------------
// Node.js compatibility check
// ---------------------------------------------------------------------

/**
 * Parses a `">=X.Y.Z"`-style engines range. This repo's own
 * `package.json` only ever uses a single `">="` bound (verified by
 * reading it, not assumed) — this parser intentionally supports only
 * that shape and fails loudly (does not guess) on anything else.
 */
function parseMinimumVersion(rangeString) {
  const match = /^>=\s*(\d+)\.(\d+)\.(\d+)$/.exec(String(rangeString || '').trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function parseVersion(versionString) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(versionString || '').trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compareVersions(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/**
 * Reads the required Node version from this repo's own `package.json`
 * rather than hardcoding it a second time.
 */
function readRequiredNodeVersion(repoRoot = REPO_ROOT) {
  const pkgPath = path.join(repoRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const raw = pkg.engines && pkg.engines.node;
  return { raw: raw || null, parsed: parseMinimumVersion(raw) };
}

function checkNodeCompatibility(actualVersion = process.version, repoRoot = REPO_ROOT) {
  const required = readRequiredNodeVersion(repoRoot);
  const actual = parseVersion(actualVersion);

  if (!required.parsed) {
    return {
      compatible: false,
      required: required.raw,
      actual: actualVersion,
      reason: `package.json engines.node ("${required.raw}") is not in the supported ">=X.Y.Z" shape — cannot verify compatibility, refusing to guess.`,
    };
  }
  if (!actual) {
    return {
      compatible: false,
      required: required.raw,
      actual: actualVersion,
      reason: `Could not parse the running Node version ("${actualVersion}").`,
    };
  }
  const compatible = compareVersions(actual, required.parsed) >= 0;
  return {
    compatible,
    required: required.raw,
    actual: actualVersion,
    reason: compatible
      ? null
      : `Running Node ${actualVersion} is below the required ${required.raw}.`,
  };
}

// ---------------------------------------------------------------------
// Local runtime directory (state / logs / local db)
// ---------------------------------------------------------------------

/**
 * Resolves a writable local runtime directory, with a fallback chain.
 * Mirrors the fallback pattern already established in this repo for the
 * same class of problem (`scripts/verify-production-routing.sh`'s
 * `resolve_workdir`: TMPDIR -> /tmp -> .) rather than inventing a new
 * one, applied here to Node instead of bash.
 */
function resolveRuntimeDir(candidates, mkdirSync = fs.mkdirSync) {
  const tried = [];
  const list =
    candidates ||
    [
      process.env.COZY_RUNTIME_DIR,
      path.join(os.homedir() || '', '.cozyos', 'runtime'),
      path.join(os.tmpdir(), 'cozyos-runtime'),
      path.join(REPO_ROOT, '.cozyos-runtime'),
    ].filter(Boolean);

  for (const dir of list) {
    try {
      mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return { dir, tried: [...tried, dir], ok: true };
    } catch (err) {
      tried.push(dir);
    }
  }
  return { dir: null, tried, ok: false };
}

// ---------------------------------------------------------------------
// Module / health detection
// ---------------------------------------------------------------------

// The specific Node-loadable pieces this runtime depends on. Kept as an
// explicit, named list (repository evidence) rather than a directory
// scan, so a missing file is reported by name, not silently skipped.
const DEPENDS_ON = Object.freeze([
  { name: 'static-boundary-server', file: 'server/static-boundary-server.js' },
  { name: 'webauthn-rp-server', file: 'server/webauthn-rp/server.js' },
  { name: 'webauthn-rp-db', file: 'server/webauthn-rp/db.js' },
]);

/**
 * Checks that each depended-on module can be *resolved* (found, valid
 * path) without *executing* it — `require.resolve` never runs the
 * module's top-level code, so this cannot trigger side effects (e.g.
 * opening a DB, binding a port) just by checking health.
 */
function checkModuleHealth(repoRoot = REPO_ROOT) {
  const results = DEPENDS_ON.map(({ name, file }) => {
    const absPath = path.join(repoRoot, file);
    try {
      require.resolve(absPath);
      return { name, file, ok: true, error: null };
    } catch (err) {
      return { name, file, ok: false, error: err.message };
    }
  });
  return {
    ok: results.every((r) => r.ok),
    modules: results,
  };
}

// ---------------------------------------------------------------------
// Machine-readable health report
// ---------------------------------------------------------------------

function getHealthReport({ repoRoot = REPO_ROOT, env = process.env } = {}) {
  const environment = detectEnvironment(env);
  const nodeCompat = checkNodeCompatibility(process.version, repoRoot);
  const moduleHealth = checkModuleHealth(repoRoot);
  const runtimeDir = resolveRuntimeDir();

  const ok = nodeCompat.compatible && moduleHealth.ok && runtimeDir.ok;

  return {
    schema: 'cozyos.runtime.health.v1',
    generatedAt: new Date().toISOString(),
    ok,
    environment,
    nodeCompatibility: nodeCompat,
    moduleHealth,
    runtimeDir: { path: runtimeDir.dir, ok: runtimeDir.ok, tried: runtimeDir.tried },
    diagnostics: buildDiagnostics({ nodeCompat, moduleHealth, runtimeDir }),
  };
}

/**
 * Turns failed checks into plain-language, actionable diagnostic lines.
 * Never silently drops a failure — every `ok: false` check above
 * produces at least one line here.
 */
function buildDiagnostics({ nodeCompat, moduleHealth, runtimeDir }) {
  const lines = [];
  if (!nodeCompat.compatible) {
    lines.push(`Node.js compatibility: ${nodeCompat.reason}`);
  }
  for (const mod of moduleHealth.modules) {
    if (!mod.ok) {
      lines.push(`Missing/unloadable dependency "${mod.name}" (${mod.file}): ${mod.error}`);
    }
  }
  if (!runtimeDir.ok) {
    lines.push(
      `No writable runtime directory found. Tried: ${runtimeDir.tried.join(', ') || '(none)'}`,
    );
  }
  return lines;
}

// ---------------------------------------------------------------------
// Startup / shutdown lifecycle — local Workspace launch
// ---------------------------------------------------------------------

class CozyRuntime {
  constructor(options = {}) {
    this.repoRoot = options.repoRoot || REPO_ROOT;
    this.port = options.port || Number(process.env.COZY_RUNTIME_PORT) || 8787;
    this.host = options.host || '127.0.0.1';
    this.server = null;
    this.state = 'idle'; // idle -> starting -> running -> stopping -> stopped | failed
    this._runtimeDir = null;
  }

  /** Runs every foundation check without starting anything. */
  checkHealth() {
    return getHealthReport({ repoRoot: this.repoRoot });
  }

  /**
   * Starts a local CozyOS Workspace by launching the existing,
   * unmodified `createBoundaryServer` from CP4 against a local-only
   * config (loopback host, a runtime-local sqlite path, `localhost`
   * RP id/origin). Refuses to start if health checks fail, and reports
   * exactly why rather than throwing an opaque error.
   */
  async start() {
    if (this.state === 'running') {
      return { ok: true, alreadyRunning: true, url: this._url() };
    }
    this.state = 'starting';

    const health = this.checkHealth();
    if (!health.ok) {
      this.state = 'failed';
      return { ok: false, reason: 'Pre-start health check failed.', health };
    }
    this._runtimeDir = health.runtimeDir.path;

    let createBoundaryServer;
    try {
      ({ createBoundaryServer } = require(path.join(this.repoRoot, 'server/static-boundary-server.js')));
    } catch (err) {
      this.state = 'failed';
      return { ok: false, reason: `Failed to load static-boundary-server.js: ${err.message}`, health };
    }

    try {
      this.server = createBoundaryServer({
        siteRoot: this.repoRoot,
        dbPath: path.join(this._runtimeDir, 'cozy-runtime-local.sqlite'),
        rpId: 'localhost',
        rpName: 'CozyOS (local runtime)',
        origin: this._url(),
        firebaseProjectId: process.env.COZY_FIREBASE_PROJECT_ID || 'cozycabin-affiliate',
      });
    } catch (err) {
      this.state = 'failed';
      return { ok: false, reason: `Failed to construct local Workspace server: ${err.message}`, health };
    }

    return new Promise((resolve) => {
      this.server.once('error', (err) => {
        this.state = 'failed';
        resolve({ ok: false, reason: `Failed to bind ${this.host}:${this.port}: ${err.message}`, health });
      });
      this.server.listen(this.port, this.host, () => {
        this.state = 'running';
        this._installShutdownHandlers();
        resolve({ ok: true, url: this._url(), health });
      });
    });
  }

  /** Graceful shutdown. Safe to call even if never started. */
  async stop() {
    if (!this.server || this.state === 'stopped' || this.state === 'idle') {
      this.state = 'stopped';
      return { ok: true, wasRunning: false };
    }
    this.state = 'stopping';
    return new Promise((resolve) => {
      this.server.close((err) => {
        this.state = 'stopped';
        if (err) {
          resolve({ ok: false, wasRunning: true, reason: err.message });
        } else {
          resolve({ ok: true, wasRunning: true });
        }
      });
    });
  }

  _url() {
    return `http://${this.host}:${this.port}`;
  }

  _installShutdownHandlers() {
    if (this._handlersInstalled) return;
    this._handlersInstalled = true;
    const shutdown = () => {
      this.stop().finally(() => process.exit(0));
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }
}

module.exports = {
  CozyRuntime,
  detectEnvironment,
  checkNodeCompatibility,
  resolveRuntimeDir,
  checkModuleHealth,
  getHealthReport,
  readRequiredNodeVersion,
  DEPENDS_ON,
};

// ---------------------------------------------------------------------
// CLI entry point — machine-readable output on stdout, diagnostics on
// stderr, distinct exit codes so a caller (Termux, a shell script, CI)
// can branch without parsing prose.
// ---------------------------------------------------------------------
if (require.main === module) {
  const command = process.argv[2] || 'check';

  (async () => {
    if (command === 'check') {
      const report = getHealthReport();
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      if (!report.ok) {
        for (const line of report.diagnostics) process.stderr.write(`[cozy-runtime] ${line}\n`);
      }
      process.exit(report.ok ? 0 : 1);
    } else if (command === 'start') {
      const runtime = new CozyRuntime();
      const result = await runtime.start();
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      if (!result.ok) {
        process.stderr.write(`[cozy-runtime] start failed: ${result.reason}\n`);
        process.exit(1);
      }
      process.stderr.write(`[cozy-runtime] Workspace running at ${result.url} (Ctrl+C to stop)\n`);
      // Intentionally does not exit — this is a long-running foreground
      // process; SIGINT/SIGTERM trigger the shutdown handlers above.
    } else {
      process.stderr.write(`[cozy-runtime] Unknown command "${command}". Use: check | start\n`);
      process.exit(2);
    }
  })();
}
