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
function grant(rp, email) {
  const user = rp.getOrCreateUser(email);
  rp.setPlatformAdmin(user.id, true);
  return rp.getUserById(user.id);
}

function revoke(rp, email) {
  const user = rp.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return null;
  rp.setPlatformAdmin(user.id, false);
  return rp.getUserById(user.id);
}

function list(rp) {
  return rp.db.prepare('SELECT id, email, is_platform_admin, firebase_uid, created_at FROM users ORDER BY created_at ASC').all();
}

function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const dbPath = resolveDbPath(flags);

  if (!command || !['grant', 'revoke', 'list'].includes(command)) {
    console.error('Usage: bootstrap-admin.js <grant|revoke|list> --db <path> [--email <email>]');
    process.exitCode = 1;
    return;
  }
  if (command !== 'list' && !flags.email) {
    console.error(`Usage: bootstrap-admin.js ${command} --db <path> --email <email>`);
    process.exitCode = 1;
    return;
  }

  const db = openDb(dbPath);
  const rp = new RelyingParty(db, {
    rpId: process.env.COZY_RP_ID || 'localhost',
    rpName: 'CozyOS',
    origin: process.env.COZY_RP_ORIGIN || 'http://localhost:8787',
  });

  try {
    if (command === 'grant') {
      const user = grant(rp, flags.email);
      console.log(`Granted platform-admin to ${user.email} (user ${user.id}).`);
      console.log('They will hold administrator authority the next time they successfully authenticate.');
    } else if (command === 'revoke') {
      const user = revoke(rp, flags.email);
      if (!user) {
        console.error(`No CozyOS user found for ${flags.email}. Nothing to revoke.`);
        process.exitCode = 1;
        return;
      }
      console.log(`Revoked platform-admin from ${user.email} (user ${user.id}).`);
      console.log('Existing sessions for this user remain valid until they expire/are revoked separately —');
      console.log('resolveSession() re-reads is_platform_admin on every request, so authorization drops');
      console.log('immediately even though the session row itself is untouched.');
    } else if (command === 'list') {
      const users = list(rp);
      if (users.length === 0) {
        console.log('No CozyOS users yet.');
      } else {
        for (const u of users) {
          console.log(`${u.is_platform_admin ? '[admin]' : '[user] '} ${u.email}  id=${u.id}  firebase_uid=${u.firebase_uid || '(none)'}`);
        }
      }
    }
  } finally {
    db.close();
  }
}

module.exports = { parseArgs, resolveDbPath, grant, revoke, list };

if (require.main === module) {
  main();
}
