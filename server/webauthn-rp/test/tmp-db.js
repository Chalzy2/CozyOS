/**
 * server/webauthn-rp/test/tmp-db.js
 *
 * Shared helper for giving each test its own throwaway SQLite file.
 *
 * Root cause this fixes: every affected test suite used to build its
 * dbPath as `path.join('/tmp', ...)` — a hardcoded POSIX absolute path.
 * That is not portable: Node's own guidance is to use os.tmpdir(), which
 * resolves TMPDIR/TEMP/TMP first and only falls back to a fixed default
 * after that. On Android/Termux there is no writable '/tmp' at all —
 * Termux is an unprivileged, non-rooted userland whose real filesystem
 * lives under $PREFIX (e.g. /data/data/com.termux/files/usr), and an
 * interactive Termux shell exports TMPDIR pointing at a real writable
 * directory under that prefix. Code that hardcodes '/tmp' ignores that
 * env var entirely and tries to create/open a database file under a path
 * Termux's app sandbox will not let it write to — which is exactly the
 * `ERR_SQLITE_ERROR: unable to open database file` failure seen in
 * openDb()/new DatabaseSync(dbPath), before any routing or auth
 * assertion ever runs.
 *
 * This helper uses os.tmpdir() (portable, env-aware, works unchanged on
 * Linux/macOS/Windows/Termux) and fs.mkdtempSync() to give every test its
 * own fresh, collision-free, guaranteed-writable-or-loudly-failing
 * directory — no personal or hardcoded path, nothing environment-variable
 * dependent that isn't itself the portable Node API.
 *
 * Production database configuration (server/webauthn-rp/db.js openDb,
 * and whatever dbPath the real server is started with) is untouched —
 * this module is only ever imported from *.test.js files.
 */
'use strict';

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Returns a fresh path for a throwaway SQLite database file, isolated
 * from every other test's database (own mkdtemp'd directory), and never
 * colliding even under parallel test execution (Date.now() + random
 * suffix on top of the mkdtemp uniqueness).
 *
 * @param {string} prefix short label identifying the test suite/case,
 *   used only for a human-readable directory/file name.
 */
function freshDbPath(prefix) {
  const base = os.tmpdir();
  // os.tmpdir() is documented as "not guaranteed to exist" — create it
  // defensively rather than assuming, same as openDb() already does for
  // its own dbPath's parent directory.
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, `${prefix}-`));
  return path.join(dir, `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
}

/**
 * Removes a test database's main file, its WAL/SHM sidecar files (since
 * openDb() runs in WAL mode), and the mkdtemp'd directory that held them
 * — full cleanup, so tests stay isolated and don't leak files into the
 * system temp directory across runs.
 */
function cleanupDbPath(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
}

module.exports = { freshDbPath, cleanupDbPath };
