#!/usr/bin/env node
'use strict';
/**
 * server/webauthn-rp/bootstrap-admin.js
 * CozyOS — WebAuthn RP — Operator Administrator Bootstrap CLI
 *
 * WHY THIS FILE EXISTS
 *   rp.js's setPlatformAdmin() is deliberately never wired to any HTTP
 *   route (see its own comment: "the whole point of this system is that
 *   no client request can flip this bit"). Something still has to set
 *   is_platform_admin = 1 for the very first administrator, and for any
 *   later ones — that "something" is this CLI, run by a trusted operator
 *   directly against the database file on the machine that owns it
 *   (local dev box or, per the deployment doc, over an already-trusted
 *   Termux/SSH session — never over a public HTTP endpoint).
 *
 * WHAT THIS DOES NOT DO
 *   - Does not accept the admin decision from any network request.
 *   - Does not create a WebAuthn credential or a Firebase link — it only
 *     flips the is_platform_admin bit on a CozyOS user row. The operator
 *     runs `grant` for an email, and that person becomes an
 *     administrator the next time THEY successfully authenticate
 *     (passkey or Firebase) — this script never logs anyone in.
 *   - Does not require the user to already exist: `grant` will create
 *     the CozyOS user row for that email if none exists yet (via
 *     rp.getOrCreateUser), so an operator can pre-authorize an
 *     administrator's email before that person has ever logged in.
 *
 * USAGE
 *   node server/webauthn-rp/bootstrap-admin.js grant        --db <path> --email <email>
 *   node server/webauthn-rp/bootstrap-admin.js revoke       --db <path> --email <email>
 *   node server/webauthn-rp/bootstrap-admin.js set-password --db <path> --email <email>
 *   node server/webauthn-rp/bootstrap-admin.js list         --db <path>
 *
 *   --db defaults to $COZY_WEBAUTHN_DB, then ./cozy-webauthn.local.sqlite.
 *
 * set-password
 *   Restores/rotates the password of an EXISTING CozyOS account (email
 *   must already exist — this command never creates a user, unlike
 *   `grant`). It never accepts the new password as a flag or any other
 *   argv token: it is always read interactively, twice, with the
 *   terminal echo disabled the whole time, so the value never appears
 *   in shell history, `ps`/process-argument listings, or any log this
 *   script writes. It updates password_hash only — is_platform_admin,
 *   username, firebase_uid, and every WebAuthn credential row are left
 *   completely untouched. Intended to be run directly in a trusted
 *   operator shell (e.g. Render's Shell/CLI) against the real database
 *   — it is never wired to any HTTP route or application-startup path,
 *   for the same reason setPlatformAdmin() never is (see file header).
 */

const path = require('node:path');
const { openDb } = require('./db');
const { RelyingParty, hashPassword } = require('./rp');
const { SQLiteDatabaseAdapter } = require('./database-adapter');

// Same minimum-length policy server.js already enforces on
// /auth/register and /auth/reset-password (see server.js) — this
// operator path reuses that number rather than inventing a second,
// possibly-weaker password policy.
const MIN_PASSWORD_LENGTH = 8;

// ---------------------------------------------------------------------
// Interactive hidden-password prompt (set-password only).
//
// Deliberately hand-rolled instead of pulling in a "hidden input" npm
// package: package.json's own description says no other npm package is
// required anywhere in this repository, and the need here is small and
// security-sensitive enough to want to read every line of it. Raw-mode
// keystroke capture with the characters never written back to stdout
// means the password is never echoed to the terminal at all (not even
// masked with asterisks) — combined with never accepting it as a CLI
// flag, it cannot end up in shell history, `ps`, or any log line this
// script prints.
//
// Refuses to run non-interactively (no TTY): set-password is meant to
// be typed by a human at a real prompt, not piped/scripted, so a
// missing TTY is treated as a hard error rather than silently reading
// whatever byte stream happens to be on stdin.
// ---------------------------------------------------------------------
function readHiddenLine(promptText) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error('set_password_requires_interactive_terminal'));
      return;
    }
    process.stdout.write(promptText);
    let input = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    function cleanup() {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    }

    function onData(chunk) {
      const str = chunk.toString('utf8');
      for (const ch of str) {
        if (ch === '\n' || ch === '\r') {
          cleanup();
          process.stdout.write('\n');
          resolve(input);
          return;
        }
        if (ch === '\u0003') { // Ctrl-C — abort, never resolve with a partial password
          cleanup();
          process.stdout.write('\n');
          reject(new Error('set_password_aborted'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') { // backspace/delete
          input = input.slice(0, -1);
          continue;
        }
        input += ch;
      }
    }

    stdin.on('data', onData);
  });
}

// Prompts for the new password twice (entry + confirmation) and
// validates length/match before returning it. `readLine` is injectable
// so tests can supply a scripted reader without a real TTY — the real
// CLI path (main()/runPostgres(), below) always uses the real hidden
// reader, never a fake one.
async function readNewPasswordInteractively(readLine = readHiddenLine) {
  const first = await readLine('New password for this account (input hidden): ');
  if (!first || first.length < MIN_PASSWORD_LENGTH) {
    throw new Error('password_too_short');
  }
  const second = await readLine('Confirm new password: ');
  if (first !== second) {
    throw new Error('passwords_do_not_match');
  }
  return first;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[i + 1] : true;
    if (value !== true) i += 1;
    flags[key] = value;
  }
  return { command, flags };
}

function resolveDbPath(flags) {
  return flags.db || process.env.COZY_WEBAUTHN_DB || path.resolve(process.cwd(), 'cozy-webauthn.local.sqlite');
}

// Exported separately from main() so tests can exercise the actual
// grant/revoke/list logic against a real temp database without going
// through argv/process.exit.
// PHASE B2: grant/revoke/list are now async — rp's methods are async
// (see rp.js), and rp.db is now a DatabaseAdapter (get/all/run), not a
// raw node:sqlite handle with .prepare().
async function grant(rp, email) {
  const user = await rp.getOrCreateUser(email);
  await rp.setPlatformAdmin(user.id, true);
  return rp.getUserById(user.id);
}

async function revoke(rp, email) {
  const user = await rp.db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) return null;
  await rp.setPlatformAdmin(user.id, false);
  return rp.getUserById(user.id);
}

// CHALZYDASHBOARD-USERNAME-LOGIN: the ONLY way a `username` mapping is
// ever created — a trusted operator, running this CLI directly against
// the database, mapping an already-known canonical server email to a
// username. Deliberately does NOT create a user (unlike grant()) —
// requires the email to already exist, so an operator cannot
// accidentally conjure a new administrator account by typo; use `grant`
// first if the account genuinely does not exist yet. Never touches
// password_hash or is_platform_admin — those remain separate, existing
// operator actions (registerWithPassword/reset flow, and `grant`
// respectively), so this command alone can never grant admin access to
// anyone.
async function setUsername(rp, email, username) {
  const user = await rp.db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) return null;
  return rp.setUsername(user.id, username);
}

async function list(rp) {
  return rp.db.all('SELECT id, email, username, is_platform_admin, firebase_uid, created_at FROM users ORDER BY created_at ASC', []);
}

// set-password: the ONLY way an operator resets an EXISTING account's
// password from a trusted shell. Mirrors setUsername()'s refuse-to-create
// contract — resolves the account by exact email and never calls
// getOrCreateUser, so a typo can never conjure a new account. It writes
// exactly one column: reuses rp.setPassword(), the same
// hashPassword()/scrypt mechanism registerWithPassword() and the
// password-reset flow already use (see rp.js) — no second, parallel
// hashing path is introduced here. Never touches is_platform_admin,
// username, firebase_uid, or the credentials table.
async function setPassword(rp, email, readPassword = readNewPasswordInteractively) {
  const user = await rp.db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) return null;
  const newPassword = await readPassword();
  await rp.setPassword(user.id, newPassword);
  return rp.getUserById(user.id);
}

// ---------------------------------------------------------------------
// PostgreSQL path (Phase B1). Deliberately NOT built on RelyingParty —
// rp.js's entire public surface is synchronous (node:sqlite's
// DatabaseSync), and a real PostgreSQL connection cannot be synchronous
// in Node.js. Converting rp.js itself to async is a larger, separate
// piece of work (see Phase B1 report) that would also require updating
// every one of its ~70+ existing synchronous call sites and their
// tests — out of scope for this CLI-only addition, and not something to
// do speculatively without a real PostgreSQL instance to verify against
// (none is available in the environment this was written in).
//
// grant/revoke/list only ever need three simple, isolated operations on
// the `users` table — they do not need WebAuthn ceremonies, sessions, or
// any of RelyingParty's other machinery — so they are reimplemented
// here directly against `pg`, async, completely independent of the
// SQLite path above. Untested against a real PostgreSQL server; see
// Phase B1 report before trusting this in production.
// ---------------------------------------------------------------------

function newUserId() {
  return require('node:crypto').randomUUID();
}

async function pgGetOrCreateUser(client, email) {
  const { rows } = await client.query('SELECT * FROM users WHERE email = $1', [email]);
  if (rows[0]) return rows[0];
  const id = newUserId();
  await client.query(
    'INSERT INTO users (id, email, is_platform_admin, created_at) VALUES ($1, $2, 0, $3)',
    [id, email, Date.now()]
  );
  return { id, email, is_platform_admin: 0, created_at: Date.now(), firebase_uid: null };
}

async function pgGrant(client, email) {
  const user = await pgGetOrCreateUser(client, email);
  await client.query('UPDATE users SET is_platform_admin = 1 WHERE id = $1', [user.id]);
  const { rows } = await client.query('SELECT * FROM users WHERE id = $1', [user.id]);
  return rows[0];
}

async function pgRevoke(client, email) {
  const { rows } = await client.query('SELECT * FROM users WHERE email = $1', [email]);
  if (!rows[0]) return null;
  await client.query('UPDATE users SET is_platform_admin = 0 WHERE id = $1', [rows[0].id]);
  const { rows: after } = await client.query('SELECT * FROM users WHERE id = $1', [rows[0].id]);
  return after[0];
}

async function pgSetUsername(client, email, username) {
  const { rows } = await client.query('SELECT * FROM users WHERE email = $1', [email]);
  if (!rows[0]) return null;
  if (username) {
    const dup = await client.query('SELECT id FROM users WHERE username = $1', [username]);
    if (dup.rows[0] && dup.rows[0].id !== rows[0].id) throw new Error('username_already_taken');
  }
  await client.query('UPDATE users SET username = $1 WHERE id = $2', [username || null, rows[0].id]);
  const { rows: after } = await client.query('SELECT * FROM users WHERE id = $1', [rows[0].id]);
  return after[0];
}

// Postgres counterpart of setPassword() above — same refuse-to-create
// contract (exact-email lookup, no insert on miss), same reused
// hashPassword() from rp.js (imported at top of this file), writes only
// password_hash. Takes the already-read plaintext password as an
// argument (the interactive prompt itself is TTY/readline-based and has
// no meaningful "sync vs async db" distinction, so it is read once in
// runPostgres() below rather than duplicating the prompt per backend).
async function pgSetPassword(client, email, password) {
  const { rows } = await client.query('SELECT * FROM users WHERE email = $1', [email]);
  if (!rows[0]) return null;
  const hash = hashPassword(password);
  await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, rows[0].id]);
  const { rows: after } = await client.query('SELECT * FROM users WHERE id = $1', [rows[0].id]);
  return after[0];
}

async function pgList(client) {
  const { rows } = await client.query(
    'SELECT id, email, username, is_platform_admin, firebase_uid, created_at FROM users ORDER BY created_at ASC'
  );
  return rows;
}

async function runPostgres(command, flags, databaseUrl) {
  const { Client } = require('pg'); // required lazily — see file header
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    if (command === 'grant') {
      const user = await pgGrant(client, flags.email);
      console.log(`Granted platform-admin to ${user.email} (user ${user.id}).`);
      console.log('They will hold administrator authority the next time they successfully authenticate.');
    } else if (command === 'revoke') {
      const user = await pgRevoke(client, flags.email);
      if (!user) {
        console.error(`No CozyOS user found for ${flags.email}. Nothing to revoke.`);
        process.exitCode = 1;
        return;
      }
      console.log(`Revoked platform-admin from ${user.email} (user ${user.id}).`);
    } else if (command === 'set-username') {
      const user = await pgSetUsername(client, flags.email, flags.username || null);
      if (!user) {
        console.error(`No CozyOS user found for ${flags.email}. Use 'grant' first if this account does not exist yet.`);
        process.exitCode = 1;
        return;
      }
      console.log(flags.username
        ? `Set username '${user.username}' for ${user.email} (user ${user.id}). Password/admin status unchanged.`
        : `Cleared username for ${user.email} (user ${user.id}).`);
    } else if (command === 'set-password') {
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [flags.email]);
      if (!existing.rows[0]) {
        console.error(`No CozyOS user found for ${flags.email}. This command never creates an account — use 'grant' first if it genuinely does not exist yet.`);
        process.exitCode = 1;
        return;
      }
      const password = await readNewPasswordInteractively();
      const user = await pgSetPassword(client, flags.email, password);
      console.log(`Password updated for ${user.email} (user ${user.id}). Username/admin status/Firebase identity/WebAuthn credentials unchanged.`);
    } else if (command === 'list') {
      const users = await pgList(client);
      if (users.length === 0) {
        console.log('No CozyOS users yet.');
      } else {
        for (const u of users) {
          console.log(`${u.is_platform_admin ? '[admin]' : '[user] '} ${u.email}${u.username ? ` (username: ${u.username})` : ''}  id=${u.id}  firebase_uid=${u.firebase_uid || '(none)'}`);
        }
      }
    }
  } finally {
    await client.end();
  }
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (!command || !['grant', 'revoke', 'set-username', 'set-password', 'list'].includes(command)) {
    console.error('Usage: bootstrap-admin.js <grant|revoke|set-username|set-password|list> --db <path> [--email <email>] [--username <username>]');
    console.error('   or: bootstrap-admin.js <grant|revoke|set-username|set-password|list> --database-url <url> [--email <email>] [--username <username>]');
    process.exitCode = 1;
    return;
  }
  if (['grant', 'revoke', 'set-username', 'set-password'].includes(command) && !flags.email) {
    console.error(`Usage: bootstrap-admin.js ${command} --db <path> --email <email>${command === 'set-username' ? ' --username <username>' : ''}`);
    process.exitCode = 1;
    return;
  }
  if (command === 'set-username' && !flags.username) {
    console.error('Usage: bootstrap-admin.js set-username --db <path> --email <email> --username <username>');
    console.error('(pass --username "" to clear an existing username mapping)');
    process.exitCode = 1;
    return;
  }

  const databaseUrl = flags['database-url'] || (flags.db ? null : process.env.COZY_DATABASE_URL);
  if (databaseUrl && !flags.db) {
    // PostgreSQL path — --database-url (or COZY_DATABASE_URL) explicitly
    // takes precedence only when --db was not also given, so an operator
    // who explicitly passes --db always gets the SQLite path they asked
    // for, never a silent PostgreSQL fallback.
    runPostgres(command, flags, databaseUrl).catch((err) => {
      console.error(`bootstrap-admin.js (postgres): ${err.message}`);
      process.exitCode = 1;
    });
    return;
  }

  const dbPath = resolveDbPath(flags);
  const rawDb = openDb(dbPath);
  const db = new SQLiteDatabaseAdapter(rawDb);
  const rp = new RelyingParty(db, {
    rpId: process.env.COZY_RP_ID || 'localhost',
    rpName: 'CozyOS',
    origin: process.env.COZY_RP_ORIGIN || 'http://localhost:8787',
  });

  try {
    if (command === 'grant') {
      const user = await grant(rp, flags.email);
      console.log(`Granted platform-admin to ${user.email} (user ${user.id}).`);
      console.log('They will hold administrator authority the next time they successfully authenticate.');
    } else if (command === 'revoke') {
      const user = await revoke(rp, flags.email);
      if (!user) {
        console.error(`No CozyOS user found for ${flags.email}. Nothing to revoke.`);
        process.exitCode = 1;
        return;
      }
      console.log(`Revoked platform-admin from ${user.email} (user ${user.id}).`);
      console.log('Existing sessions for this user remain valid until they expire/are revoked separately —');
      console.log('resolveSession() re-reads is_platform_admin on every request, so authorization drops');
      console.log('immediately even though the session row itself is untouched.');
    } else if (command === 'set-username') {
      const user = await setUsername(rp, flags.email, flags.username || null);
      if (!user) {
        console.error(`No CozyOS user found for ${flags.email}. Use 'grant' first if this account does not exist yet.`);
        process.exitCode = 1;
        return;
      }
      console.log(flags.username
        ? `Set username '${user.username}' for ${user.email} (user ${user.id}). Password/admin status unchanged.`
        : `Cleared username for ${user.email} (user ${user.id}).`);
    } else if (command === 'set-password') {
      const user = await setPassword(rp, flags.email);
      if (!user) {
        console.error(`No CozyOS user found for ${flags.email}. This command never creates an account — use 'grant' first if it genuinely does not exist yet.`);
        process.exitCode = 1;
        return;
      }
      console.log(`Password updated for ${user.email} (user ${user.id}). Username/admin status/Firebase identity/WebAuthn credentials unchanged.`);
    } else if (command === 'list') {
      const users = await list(rp);
      if (users.length === 0) {
        console.log('No CozyOS users yet.');
      } else {
        for (const u of users) {
          console.log(`${u.is_platform_admin ? '[admin]' : '[user] '} ${u.email}${u.username ? ` (username: ${u.username})` : ''}  id=${u.id}  firebase_uid=${u.firebase_uid || '(none)'}`);
        }
      }
    }
  } finally {
    rawDb.close();
  }
}

module.exports = {
  parseArgs, resolveDbPath, grant, revoke, setUsername, setPassword, list,
  pgGetOrCreateUser, pgGrant, pgRevoke, pgSetUsername, pgSetPassword, pgList,
  readNewPasswordInteractively,
  redactForLog: (u) => { try { const x = new URL(u); return `${x.protocol}//${x.hostname}${x.pathname}`; } catch (_e) { return '(unparseable)'; } },
};

if (require.main === module) {
  main().catch((err) => {
    console.error(`bootstrap-admin.js: ${err.message}`);
    process.exitCode = 1;
  });
}
