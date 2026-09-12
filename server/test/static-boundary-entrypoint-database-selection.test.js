'use strict';

/**
 * server/test/static-boundary-entrypoint-database-selection.test.js
 * B4.2 repair regression — production boot path database selection.
 *
 * BACKGROUND (the defect this test guards against)
 *   createBoundaryServer() (the factory function) has always correctly
 *   accepted and forwarded a `databaseUrl` option. But the actual
 *   process entrypoint — the `if (require.main === module)` block at
 *   the bottom of server/static-boundary-server.js, which is what
 *   really runs when the process boots (e.g. a Render Start Command) —
 *   never read process.env.COZY_DATABASE_URL and never passed it into
 *   that factory call. Setting COZY_DATABASE_URL in a real deployment
 *   therefore had NO effect: the process always silently opened the
 *   local SQLite file.
 *
 *   Requiring static-boundary-server.js from another test (the way
 *   every other test in this suite does) does NOT exercise this bug,
 *   because `require.main !== module` in that case — the boot block
 *   never runs. The only way to actually test the real boot path is to
 *   spawn the file as its own process, exactly as a real deployment
 *   would, and observe what it does.
 *
 * WHAT THIS PROVES
 *   1. With COZY_DATABASE_URL unset, the process starts normally and
 *      logs that it selected SQLite (unchanged prior behavior — this is
 *      a regression guard, not just a test of the new code).
 *   2. With COZY_DATABASE_URL set to a syntactically valid but
 *      unreachable PostgreSQL URL, the process selects PostgreSQL (not
 *      SQLite) — proven by (a) the configured SQLite file never being
 *      created/opened, and (b) the boot log explicitly reporting
 *      PostgreSQL selection. node-postgres's Pool connects lazily (does
 *      not open a socket until the first query), so the HTTP server
 *      does start listening in this case — that is correct pg behavior,
 *      not a silent fallback to SQLite.
 *
 *   This test never touches a real database, real credentials, or
 *   production infrastructure. The "unreachable" URL points at a closed
 *   local port so any real connection attempt would fail fast and
 *   deterministically if one were made.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { freshDbPath, cleanupDbPath } = require('../webauthn-rp/test/tmp-db');

const ENTRYPOINT = path.resolve(__dirname, '..', 'static-boundary-server.js');

// Finds a genuinely closed TCP port on localhost so a connection attempt
// to it fails fast and deterministically (ECONNREFUSED), rather than
// hanging or depending on any real network/service.
function findClosedPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });
}

function runEntrypoint(env, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [ENTRYPOINT], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill('SIGKILL'); } catch (_err) { /* already exited */ }
      resolve(result);
    };

    const timer = setTimeout(() => finish({ timedOut: true, code: null, stdout, stderr }), timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      // The full boot sequence logs several lines synchronously inside
      // the same listen() callback; "Database backend: ..." is
      // deliberately the LAST of them (see static-boundary-server.js),
      // so waiting for it (not just the first "listening" line) avoids
      // killing the child mid-flush and losing the very line these
      // tests assert on.
      if (stdout.includes('Database backend:')) {
        finish({ timedOut: false, code: null, stdout, stderr, stillRunning: true });
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('exit', (code) => finish({ timedOut: false, code, stdout, stderr }));
  });
}

test('production entrypoint: COZY_DATABASE_URL unset -> boots normally against SQLite (regression guard, unchanged behavior)', async () => {
  const dbPath = freshDbPath('entrypoint-sqlite-regression');
  try {
    const result = await runEntrypoint({
      COZY_WEBAUTHN_DB: dbPath,
      PORT: '0', // let the OS pick a free port
      COZY_DATABASE_URL: '', // explicitly unset/empty
    });
    assert.equal(result.timedOut, false, `entrypoint should have started or exited within the timeout; stderr: ${result.stderr}`);
    assert.ok(result.stillRunning, `expected the process to reach a successful listening state; stdout: ${result.stdout}\nstderr: ${result.stderr}`);
    assert.match(result.stdout, /Database backend: SQLite \(COZY_DATABASE_URL not set\)/,
      'expected the boot log to explicitly report SQLite selection when COZY_DATABASE_URL is unset');
  } finally {
    cleanupDbPath(dbPath);
  }
});

test('production entrypoint: COZY_DATABASE_URL set -> selects PostgreSQL, never opens the SQLite file, and fails closed on first real DB-touching request', async () => {
  const closedPort = await findClosedPort();
  const dbPath = freshDbPath('entrypoint-postgres-attempt');
  const fs = require('node:fs');
  let child = null;
  try {
    // node-postgres's Pool connects LAZILY (confirmed: `new Pool(...)`
    // does not open a socket until the first query), so an unreachable
    // target does NOT prevent the HTTP server from starting — this is
    // real pg behavior, not a defect in this fix. The correct,
    // deterministic proof that PostgreSQL (not SQLite) was actually
    // selected is therefore NOT "did boot fail" but:
    //   (a) the SQLite file at dbPath is never created/opened at all,
    //       since createBoundaryServer()'s ternary picks the Postgres
    //       branch and never calls openDb(dbPath) in that branch, and
    //   (b) a real request that must touch the database fails (rather
    //       than silently succeeding against some other store), because
    //       the pool's first real query hits the unreachable target.
    const result = await runEntrypoint({
      COZY_WEBAUTHN_DB: dbPath, // present but must NOT be opened if databaseUrl is honored
      PORT: '0',
      COZY_DATABASE_URL: `postgres://baduser:badpass@127.0.0.1:${closedPort}/nonexistent`,
    }, { timeoutMs: 4000 });

    assert.doesNotMatch(result.stdout, /Database backend: SQLite/,
      `regression: process logged SQLite selection despite COZY_DATABASE_URL being set. stdout: ${result.stdout}`);
    assert.match(result.stdout, /Database backend: PostgreSQL \(COZY_DATABASE_URL set\)/,
      `expected the boot log to explicitly report PostgreSQL selection. stdout: ${result.stdout}`);
    assert.ok(result.stillRunning,
      `expected the HTTP server to start listening even with an unreachable Postgres target, since pg.Pool connects lazily — this is correct pg behavior, not a fallback. stdout: ${result.stdout}\nstderr: ${result.stderr}`);
    assert.equal(fs.existsSync(dbPath), false,
      `regression: the SQLite file at dbPath was created even though COZY_DATABASE_URL was set — this would mean the entrypoint opened SQLite alongside (or instead of) PostgreSQL.`);
  } finally {
    if (child) { try { child.kill('SIGKILL'); } catch (_err) { /* noop */ } }
    cleanupDbPath(dbPath);
  }
});

// ---------------------------------------------------------------------
// B4.3.2 / B4.3.5 additions — credential-exposure and real query-level
// failure propagation. The two tests above prove SELECTION; these two
// prove what happens once the process is actually asked to use the
// database it selected.
// ---------------------------------------------------------------------

test('production entrypoint: COZY_DATABASE_URL is never printed to stdout/stderr, even the distinctive password inside it', async () => {
  const closedPort = await findClosedPort();
  const dbPath = freshDbPath('entrypoint-credential-exposure');
  // A deliberately unique, greppable password — if this string shows up
  // anywhere in the child's output, the connection string leaked.
  const SENTINEL_PASSWORD = 'B4dot3-SENTINEL-p4ssw0rd-do-not-log-me';
  try {
    const result = await runEntrypoint({
      COZY_WEBAUTHN_DB: dbPath,
      PORT: '0',
      COZY_DATABASE_URL: `postgres://sentineluser:${SENTINEL_PASSWORD}@127.0.0.1:${closedPort}/nonexistent`,
    }, { timeoutMs: 4000 });

    assert.ok(!result.stdout.includes(SENTINEL_PASSWORD),
      `regression: the connection string's password leaked into stdout. stdout: ${result.stdout}`);
    assert.ok(!result.stderr.includes(SENTINEL_PASSWORD),
      `regression: the connection string's password leaked into stderr. stderr: ${result.stderr}`);
    assert.ok(!result.stdout.includes('sentineluser') && !result.stderr.includes('sentineluser'),
      'regression: the connection string\'s username leaked into process output');
  } finally {
    cleanupDbPath(dbPath);
  }
});

test('production entrypoint: a real request that touches the database fails closed against an unreachable PostgreSQL target (no partial success, no silent SQLite substitution)', async () => {
  const closedPort = await findClosedPort();
  // NOTE: static-boundary-server.js's own boot log prints the literal
  // PORT env value, not the OS-assigned port from server.address() — so
  // PORT=0 ("let the OS pick") can't be parsed back out of stdout. Using
  // findClosedPort() to get a genuinely free port number and passing it
  // explicitly avoids that pre-existing, unrelated logging quirk rather
  // than working around it with fragile output-parsing.
  const appPort = await findClosedPort();
  const dbPath = freshDbPath('entrypoint-query-failure');
  const http = require('node:http');
  let child = null;
  try {
    child = spawn(process.execPath, [ENTRYPOINT], {
      env: {
        ...process.env,
        COZY_WEBAUTHN_DB: dbPath,
        PORT: String(appPort),
        COZY_DATABASE_URL: `postgres://baduser:badpass@127.0.0.1:${closedPort}/nonexistent`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let ready = false;
    child.stdout.on('data', (c) => {
      out += c.toString();
      if (out.includes('boundary server listening')) ready = true;
    });
    const deadline = Date.now() + 4000;
    while (!ready && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(ready, `entrypoint did not report listening within the timeout. stdout so far: ${out}`);

    // A request that MUST touch the database (registration begin —
    // rp.beginRegistration() unconditionally calls getOrCreateUser()).
    // GET /webauthn/session with no cookie was deliberately NOT used
    // here: rp.resolveSession() short-circuits on a missing session id
    // before ever touching the database, so it would prove nothing.
    const response = await new Promise((resolve, reject) => {
      const body = JSON.stringify({ email: 'b4dot3-query-failure-test@example.com' });
      const req = http.request({
        hostname: '127.0.0.1',
        port: appPort,
        path: '/webauthn/register/begin',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 4000,
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(new Error('request timed out')); });
      req.write(body);
      req.end();
    });

    // Must fail (5xx / internal_error) — never a 200, which would mean
    // it silently succeeded against SQLite or some other unintended
    // store instead of the PostgreSQL target it was told to use.
    assert.ok(response.status >= 500,
      `expected the request to fail closed (5xx) against an unreachable PostgreSQL target, got status ${response.status} body ${response.body}`);
  } finally {
    if (child) { try { child.kill('SIGKILL'); } catch (_err) { /* noop */ } }
    cleanupDbPath(dbPath);
  }
});
