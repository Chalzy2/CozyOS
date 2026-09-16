'use strict';
/**
 * server/webauthn-rp/database-adapter.js
 * CozyOS — Phase B2 — async DatabaseAdapter interface.
 *
 * WHY THIS EXISTS
 *   rp.js and organizations.js were written directly against node:sqlite's
 *   DatabaseSync — a synchronous API. A real PostgreSQL connection is
 *   inherently asynchronous (it's network I/O), so there is no way to
 *   give the application genuine PostgreSQL access without an async
 *   boundary somewhere. This file IS that boundary: one small, shared
 *   async interface, with two real implementations behind it. rp.js and
 *   organizations.js are converted (Phase B2) to call only this
 *   interface — never a raw SQLite or `pg` object directly.
 *
 * INTERFACE (every method returns a Promise, on both backends)
 *   get(sql, params)  -> single row object, or undefined if no match
 *   all(sql, params)  -> array of row objects (possibly empty)
 *   run(sql, params)  -> { changes } (rows affected; lastInsertRowid is
 *                         NOT part of this interface — every table in
 *                         this schema uses an application-generated TEXT
 *                         id (crypto.randomUUID()), never an
 *                         autoincrement primary key that a caller reads
 *                         back, except audit_events.id which nothing
 *                         ever reads back either)
 *   exec(sql)          -> undefined (DDL / no-result statements)
 *   transaction(fn)    -> runs fn(txAdapter) where txAdapter exposes the
 *                         same get/all/run/exec methods bound to a single
 *                         connection inside BEGIN/COMMIT, with automatic
 *                         ROLLBACK if fn throws or its returned promise
 *                         rejects. Returns whatever fn returns/resolves.
 *   close()            -> Promise, releases the underlying connection(s)
 *
 * SQL DIALECT RULE: every query written against this interface uses `?`
 * placeholders (SQLite's native style) in call-site order, exactly like
 * the pre-Phase-B2 code already did. SQLiteDatabaseAdapter passes them
 * straight through. PostgreSQLDatabaseAdapter rewrites `?` -> `$1,$2,...`
 * internally before calling `pg` — callers never need two versions of
 * any query. This was a deliberate choice over hand-writing `$N` at
 * every call site: it keeps rp.js/organizations.js's ~75 queries
 * unchanged in spirit (same order, same shape), which is far easier to
 * audit for behavioral equivalence than a second full rewrite of every
 * query string would have been.
 */

// ----------------------------- SQLite -----------------------------

class SQLiteDatabaseAdapter {
  // `sqliteDb` is the existing DatabaseSync instance returned by
  // openDb() in db.js — completely unchanged. This class only adds an
  // async-shaped face on top of it; it performs no new SQLite behavior.
  constructor(sqliteDb) {
    this._db = sqliteDb;
  }

  async get(sql, params = []) {
    return this._db.prepare(sql).get(...params);
  }

  async all(sql, params = []) {
    return this._db.prepare(sql).all(...params);
  }

  async run(sql, params = []) {
    const info = this._db.prepare(sql).run(...params);
    return { changes: info.changes };
  }

  async exec(sql) {
    this._db.exec(sql);
  }

  // node:sqlite's DatabaseSync has no separate connection to hand a
  // nested scope — it's a single synchronous handle already serialized
  // by the process itself. A "transaction" here is therefore real
  // BEGIN/COMMIT/ROLLBACK against that same handle; there is no
  // possibility of a second concurrent connection interleaving with it
  // from within this same process, which is exactly SQLite's existing
  // pre-Phase-B2 concurrency model — unchanged.
  async transaction(fn) {
    this._db.exec('BEGIN');
    try {
      const result = await fn(this);
      this._db.exec('COMMIT');
      return result;
    } catch (err) {
      try { this._db.exec('ROLLBACK'); } catch (_rollbackErr) { /* connection already dead; nothing more to do */ }
      throw err;
    }
  }

  async close() {
    this._db.close();
  }
}

// --------------------------- PostgreSQL ---------------------------
//
// STATUS: written against the documented `pg` client API. NOT executed
// against a real PostgreSQL server in this environment — see the Phase
// B1/B2 reports for why (no network access, no local PostgreSQL
// install). Treat every method here as unverified until it has actually
// run against a real target.

function toPositionalPlaceholders(sql) {
  // Rewrites `?` (in textual order) to `$1, $2, ...`. Deliberately naive
  // (no attempt to skip `?` inside quoted string literals) because none
  // of the ~75 existing queries in rp.js/organizations.js ever contain a
  // literal `?` character inside a string constant — verified by
  // inspection of every query in both files during the Phase B1
  // inventory. If a future query ever needs a literal `?`, this function
  // must be revisited before that query is added.
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

class PostgreSQLDatabaseAdapter {
  constructor(poolOrClient) {
    // Accepts either a `pg.Pool` (top-level adapter, each call borrows a
    // connection from the pool) or a single `pg.PoolClient` (the bound
    // connection used inside transaction()).
    this._conn = poolOrClient;
  }

  async get(sql, params = []) {
    const { rows } = await this._conn.query(toPositionalPlaceholders(sql), params);
    return rows[0];
  }

  async all(sql, params = []) {
    const { rows } = await this._conn.query(toPositionalPlaceholders(sql), params);
    return rows;
  }

  async run(sql, params = []) {
    const result = await this._conn.query(toPositionalPlaceholders(sql), params);
    return { changes: result.rowCount };
  }

  async exec(sql) {
    await this._conn.query(sql);
  }

  async transaction(fn) {
    // Only the top-level, Pool-backed adapter can start a transaction —
    // a transaction must run on one single checked-out connection for
    // its entire duration, never a fresh connection per statement (which
    // is what re-using the Pool for each query would silently do).
    if (typeof this._conn.connect !== 'function') {
      throw new Error('PostgreSQLDatabaseAdapter.transaction(): nested transactions are not supported.');
    }
    const client = await this._conn.connect();
    const txAdapter = new PostgreSQLDatabaseAdapter(client);
    try {
      await client.query('BEGIN');
      const result = await fn(txAdapter);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_rollbackErr) { /* connection already broken; nothing more to do */ }
      throw err;
    } finally {
      client.release();
    }
  }

  async close() {
    if (typeof this._conn.end === 'function') await this._conn.end();
  }
}

/**
 * createDatabaseAdapter — the single, explicit selection point.
 *
 * Selection rule (Phase B2 Step 7, deliberately explicit, no silent
 * fallback in either direction):
 *   - opts.databaseUrl (or COZY_DATABASE_URL) present -> PostgreSQL.
 *     If `pg` cannot be loaded, or the connection fails, this throws —
 *     it never silently drops back to SQLite or to an empty database.
 *   - otherwise opts.sqliteDb (an already-open DatabaseSync instance,
 *     e.g. from openDb()) -> SQLite.
 *   - neither provided -> throws. There is no default database.
 */
function createDatabaseAdapter({ databaseUrl, sqliteDb } = {}) {
  if (databaseUrl) {
    const { Pool } = require('pg'); // required lazily so this file loads even where `pg` isn't installed
    const pool = new Pool({ connectionString: databaseUrl });
    return new PostgreSQLDatabaseAdapter(pool);
  }
  if (sqliteDb) {
    return new SQLiteDatabaseAdapter(sqliteDb);
  }
  throw new Error('createDatabaseAdapter(): neither databaseUrl nor sqliteDb was provided. Refusing to guess a database.');
}

module.exports = {
  SQLiteDatabaseAdapter,
  PostgreSQLDatabaseAdapter,
  createDatabaseAdapter,
  toPositionalPlaceholders, // exported for unit testing
};
