'use strict';

/**
 * server/webauthn-rp/test/mock-pg-client.js
 * B4.3 repair — a minimal, in-memory stand-in for `pg`'s `Client`,
 * used ONLY to exercise migrate-sqlite-to-postgres.js's own logic
 * (transaction boundaries, insert ordering, ID preservation, the
 * refuse-non-empty-target check, rollback-on-failure) when a real
 * disposable PostgreSQL server is not reachable.
 *
 * THIS IS NOT A SUBSTITUTE FOR REAL POSTGRESQL EVIDENCE. It does not
 * exercise real network I/O, real SQL parsing, real Postgres type
 * coercion, or real TLS. It implements just enough of `pg.Client`'s
 * surface (`connect()`, `query(sql, params)`, `end()`) and just enough
 * SQL-pattern recognition to run the exact statements
 * migrate-sqlite-to-postgres.js issues, with constraint checks (primary
 * key uniqueness, foreign key existence) modeled on the real schema in
 * server/webauthn-rp/migrations/*.sql. Any result obtained through this
 * mock must be reported as such, never relabeled as a real PostgreSQL
 * execution.
 */

const PRIMARY_KEYS = {
  users: 'id',
  credentials: 'credential_id',
  challenges: 'challenge',
  sessions: 'session_id',
  password_reset_tokens: 'token_hash',
  mfa_recovery_codes: 'code_hash',
  pending_auth_sessions: 'pending_id',
  organizations: 'id',
  organization_memberships: 'id',
  audit_events: 'id',
};

// Mirrors the real REFERENCES constraints in 001-005 *.sql exactly.
const FOREIGN_KEYS = {
  credentials: [{ column: 'user_id', table: 'users' }],
  sessions: [{ column: 'user_id', table: 'users' }],
  password_reset_tokens: [{ column: 'user_id', table: 'users' }],
  mfa_recovery_codes: [{ column: 'user_id', table: 'users' }],
  pending_auth_sessions: [{ column: 'user_id', table: 'users' }],
  organizations: [{ column: 'created_by', table: 'users' }],
  organization_memberships: [
    { column: 'organization_id', table: 'organizations' },
    { column: 'user_id', table: 'users' },
  ],
  // challenges.user_id and audit_events.user_id are unconstrained in the
  // real schema (nullable, no REFERENCES) — deliberately omitted here.
};

function createMockPgClient({ failOnTable = null, failMessage = 'simulated failure' } = {}) {
  const tables = Object.fromEntries(Object.keys(PRIMARY_KEYS).map((t) => [t, []]));
  let snapshot = null;
  let connected = false;

  function deepCloneTables() {
    return Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, rows.map((r) => ({ ...r }))]));
  }

  async function query(sql, params = []) {
    const text = sql.trim();

    if (/^BEGIN$/i.test(text)) {
      snapshot = deepCloneTables();
      return { rows: [] };
    }
    if (/^COMMIT$/i.test(text)) {
      snapshot = null;
      return { rows: [] };
    }
    if (/^ROLLBACK$/i.test(text)) {
      if (snapshot) {
        for (const t of Object.keys(tables)) tables[t] = snapshot[t];
        snapshot = null;
      }
      return { rows: [] };
    }

    const countMatch = text.match(/^SELECT COUNT\(\*\)::int AS n FROM (\w+)$/i);
    if (countMatch) {
      const table = countMatch[1];
      return { rows: [{ n: tables[table] ? tables[table].length : 0 }] };
    }

    const insertMatch = text.match(/^INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\)$/i);
    if (insertMatch) {
      const table = insertMatch[1];
      const cols = insertMatch[2].split(',').map((c) => c.trim());
      if (!tables[table]) throw new Error(`mock-pg-client: unknown table "${table}"`);

      if (failOnTable && table === failOnTable) {
        throw new Error(failMessage);
      }

      const row = {};
      cols.forEach((c, i) => { row[c] = params[i]; });

      const pk = PRIMARY_KEYS[table];
      if (pk && tables[table].some((r) => r[pk] === row[pk])) {
        throw new Error(`duplicate key value violates unique constraint "${table}_pkey" (${pk}=${row[pk]})`);
      }

      for (const fk of FOREIGN_KEYS[table] || []) {
        const value = row[fk.column];
        if (value === null || value === undefined) continue; // nullable FK columns (e.g. invited_by)
        const referenced = tables[fk.table];
        const refPk = PRIMARY_KEYS[fk.table];
        if (!referenced.some((r) => r[refPk] === value)) {
          throw new Error(`insert or update on table "${table}" violates foreign key constraint (${fk.column}=${value} not present in ${fk.table}.${refPk})`);
        }
      }

      tables[table].push(row);
      return { rows: [] };
    }

    throw new Error(`mock-pg-client: unrecognized query pattern: ${text}`);
  }

  return {
    async connect() { connected = true; },
    query,
    async end() { connected = false; },
    // Test-only inspection surface — never part of the real pg.Client API.
    _inspect: { tables, isConnected: () => connected },
  };
}

module.exports = { createMockPgClient, PRIMARY_KEYS, FOREIGN_KEYS };
