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
 *   node server/webauthn-rp/bootstrap-admin.js grant  --db <path> --email <email>
 *   node server/webauthn-rp/bootstrap-admin.js revoke --db <path> --email <email>
 *   node server/webauthn-rp/bootstrap-admin.js list   --db <path>
 *
 *   --db defaults to $COZY_WEBAUTHN_DB, then ./cozy-webauthn.local.sqlite.
 */

const path = require('node:path');
const { openDb } = require('./db');
const { RelyingParty } = require('./rp');
const { SQLiteDatabaseAdapter } = require('./database-adapter');

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

  if (!command || !['grant', 'revoke', 'set-username', 'list'].includes(command)) {
    console.error('Usage: bootstrap-admin.js <grant|revoke|set-username|list> --db <path> [--email <email>] [--username <username>]');
    console.error('   or: bootstrap-admin.js <grant|revoke|set-username|list> --database-url <url> [--email <email>] [--username <username>]');
    process.exitCode = 1;
    return;
  }
  if (['grant', 'revoke', 'set-username'].includes(command) && !flags.email) {
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

module.exports = { parseArgs, resolveDbPath, grant, revoke, setUsername, list, pgGetOrCreateUser, pgGrant, pgRevoke, pgSetUsername, pgList, redactForLog: (u) => { try { const x = new URL(u); return `${x.protocol}//${x.hostname}${x.pathname}`; } catch (_e) { return '(unparseable)'; } } };

if (require.main === module) {
  main().catch((err) => {
    console.error(`bootstrap-admin.js: ${err.message}`);
    process.exitCode = 1;
  });
}
