'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

// Idempotent column migration: node:sqlite has no "ADD COLUMN IF NOT
// EXISTS", so we check PRAGMA table_info first, same idempotency
// guarantee the CREATE TABLE IF NOT EXISTS statements below already give
// every fresh-vs-existing DB file. Safe to run against either a brand
// new database (created moments ago by the CREATE TABLE below) or an
// existing pre-Firebase-unification database file.
function migrateAddFirebaseUid(db) {
  const cols = db.prepare('PRAGMA table_info(users)').all();
  const hasColumn = cols.some((c) => c.name === 'firebase_uid');
  if (!hasColumn) {
    db.exec('ALTER TABLE users ADD COLUMN firebase_uid TEXT');
  }
  // Partial unique index: many users will have firebase_uid = NULL
  // (WebAuthn-only accounts that have never linked a Firebase login),
  // and SQLite's UNIQUE treats every NULL as distinct, so this only
  // actually constrains rows that DO have a firebase_uid set — exactly
  // the "one CozyOS user per Firebase identity" guarantee required.
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid) WHERE firebase_uid IS NOT NULL');
}

// CHALZYDASHBOARD-USERNAME-LOGIN: adds an optional, uniquely-constrained
// `username` column to the SAME real, server-authoritative `users` table
// — not a second identity/authentication system. A row's canonical
// identity remains its `id`/`email`; `username` is purely an additional,
// operator-assigned lookup key that resolves to that same canonical row
// before the existing, unmodified password-verification path runs (see
// rp.js's authenticateWithPassword()). Never set by any HTTP-reachable
// endpoint — only by the trusted-operator CLI (bootstrap-admin.js
// set-username), same access-control posture as is_platform_admin
// itself. Exact same idempotent-column + partial-unique-index pattern as
// migrateAddFirebaseUid() above, for the exact same NULL-is-distinct
// reason: most rows will have no username at all (WebAuthn/email-only
// accounts), and only rows that DO have one are constrained unique.
function migrateAddUsername(db) {
  const cols = db.prepare('PRAGMA table_info(users)').all();
  const hasColumn = cols.some((c) => c.name === 'username');
  if (!hasColumn) {
    db.exec('ALTER TABLE users ADD COLUMN username TEXT');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL');
}

function openDb(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      // M-DEPLOY-DISK: real production evidence (Render deploy log,
      // 2026-09) showed this exact call fail with
      // "EACCES: permission denied, mkdir '/var/data'" — a raw,
      // opaque Node error that gives no hint about the actual cause.
      // EACCES here (as opposed to ENOENT, which would mean a simpler
      // missing-parent problem) specifically means the process was
      // denied permission to create a brand-new directory at this
      // exact path — the signature of trying to create a path that is
      // SUPPOSED to already exist as a mounted volume, not as an
      // ordinary directory the app is expected to create for itself.
      // Every current production caller of openDb() (server.js,
      // static-boundary-server.js, bootstrap-admin.js) passes a path
      // under COZY_WEBAUTHN_DB, which render.yaml declares as
      // /var/data/cozy-webauthn.sqlite — a path that is only ever
      // meant to be writable because Render's own persistent-disk
      // mount (declared in render.yaml's `disk:` block) is actually
      // attached to the service. A declared disk is not automatically
      // attached to a pre-existing (non-Blueprint-created) service —
      // that can require an explicit one-time step in the Render
      // Dashboard. This rethrow does not change any behavior for the
      // success path; it only replaces an opaque crash with an
      // actionable one for this specific, already-observed failure
      // mode, and preserves the original error as `cause` rather than
      // discarding it.
      throw new Error(
        `[db] Failed to create database directory "${dir}": ${err.message} (code: ${err.code || 'unknown'}). ` +
        `If this path is meant to be a mounted persistent disk (see render.yaml's "disk:" block), ` +
        `this usually means the disk is declared but not actually attached to this service yet — ` +
        `check the Render Dashboard (Settings -> Disks) and confirm a disk is attached at this exact ` +
        `mount path before this server can start. This is not something changing application code can fix.`,
        { cause: err }
      );
    }
  }
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      is_platform_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credentials (
      credential_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      public_key_jwk TEXT NOT NULL,
      algorithm TEXT NOT NULL,
      sign_count INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER,
      revoked_at INTEGER,
      nickname TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS challenges (
      challenge TEXT PRIMARY KEY,
      user_id TEXT,
      purpose TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      event_type TEXT NOT NULL,
      detail TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  migrateAddFirebaseUid(db);
  migrateAddUsername(db);
  migrateAddPasswordAuth(db);
  migrateAddTotpMfa(db);
  migrateAddOrganizations(db);
  migrateAddBilling(db);
  migrateAddBillingPlanFeatures(db);
  migrateAddPayments(db);
  migrateAddPaymentProviders(db);
  migrateAddCryptoPayments(db);
  migrateAddQuoteEngine(db);
  migrateAddKnowledgeFoundation(db);
  migrateAddDocumentStorage(db);
  migrateAddDocumentBinaryStorage(db);
  migrateAddDocumentFolders(db);
  migrateAddTransferSessions(db);
  return db;
}

// Same idempotent-migration pattern as migrateAddFirebaseUid above: safe to
// run against a brand-new DB (just created by the CREATE TABLE above) or an
// existing pre-password-auth database file.
function migrateAddPasswordAuth(db) {
  const cols = db.prepare('PRAGMA table_info(users)').all();
  const hasPasswordHash = cols.some((c) => c.name === 'password_hash');
  if (!hasPasswordHash) {
    db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
  }
  const hasDisabledAt = cols.some((c) => c.name === 'disabled_at');
  if (!hasDisabledAt) {
    db.exec('ALTER TABLE users ADD COLUMN disabled_at INTEGER');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

// Phase C §4 — real server-side MFA storage. Same idempotent-migration
// pattern as the two migrations above. Adds:
//   - users.totp_secret / totp_enabled / totp_enrolled_at: server-side
//     TOTP enrollment state. totp_secret is written at enroll-begin time
//     but totp_enabled stays 0 (and is NOT treated as "MFA required" by
//     authenticateWithPassword) until enroll-complete verifies a real
//     code — see rp.js completeTotpEnrollment().
//   - mfa_recovery_codes: hashed, single-use recovery codes, same
//     posture as password_reset_tokens (never stored in plaintext).
//   - pending_auth_sessions: the real "password_verified_pending_mfa"
//     state required by Phase C §4. A row here is deliberately NOT a
//     `sessions` row — resolveSession()/currentSession() never reads
//     this table, so a pending id can never authorize /webauthn/session,
//     admin routes, or any protected resource no matter what a modified
//     client sends. It carries its own short TTL and its own bounded
//     attempt counter, independent of the real session TTL.
function migrateAddTotpMfa(db) {
  const cols = db.prepare('PRAGMA table_info(users)').all();
  if (!cols.some((c) => c.name === 'totp_secret')) {
    db.exec('ALTER TABLE users ADD COLUMN totp_secret TEXT');
  }
  if (!cols.some((c) => c.name === 'totp_enabled')) {
    db.exec('ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0');
  }
  if (!cols.some((c) => c.name === 'totp_enrolled_at')) {
    db.exec('ALTER TABLE users ADD COLUMN totp_enrolled_at INTEGER');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
      code_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      used_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS pending_auth_sessions (
      pending_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      consumed_at INTEGER,
      cancelled_at INTEGER,
      locked_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

// Server-backed organization + membership foundation (Milestone A).
// Same idempotent-migration pattern as the migrations above. Mirrors the
// existing client-side core/organization/organization-membership.js data
// shape (memberKey = organizationId+userId, one row per pair reused across
// status transitions, roles/applications/permissions as arrays) so the
// server model is a faithful, verifiable backing for what the browser
// already displays — not a second, divergent authority.
function migrateAddOrganizations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS organization_memberships (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      roles TEXT NOT NULL DEFAULT '[]',
      applications TEXT NOT NULL DEFAULT '[]',
      permissions TEXT NOT NULL DEFAULT '[]',
      invited_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      responded_at INTEGER,
      expires_at INTEGER,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- One real membership row per (organization, user) pair, reused across
    -- status transitions — matches the client's memberKey() precedent.
    -- Prevents a duplicate "invited" row from ever being created for a
    -- user who already has a non-terminal membership in that organization.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_org_membership_pair
      ON organization_memberships(organization_id, user_id);
  `);
}

// CozyOS Billing Foundation (server-authoritative). Faithful mirror of
// server/webauthn-rp/migrations/006_billing.sql — do not let the two
// schemas drift; if one changes, change the other in the same commit.
// See that file for the full rationale (versioned pricing for historical
// integrity, wallet_ledger as the only source of truth for balance,
// deliberately no invoices/payments/refunds tables yet).
function migrateAddBilling(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscription_plans (
      id TEXT PRIMARY KEY,
      plan_key TEXT NOT NULL,
      application_id TEXT,
      name TEXT NOT NULL,
      currency TEXT NOT NULL,
      billing_interval TEXT NOT NULL CHECK (billing_interval IN ('month', 'year', 'one_time')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_plans_app_key
      ON subscription_plans(application_id, plan_key);

    CREATE TABLE IF NOT EXISTS subscription_plan_prices (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units >= 0),
      currency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
      effective_from INTEGER NOT NULL,
      effective_until INTEGER,
      reason TEXT,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (plan_id, version),
      FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_plan_prices_current
      ON subscription_plan_prices(plan_id)
      WHERE status = 'active' AND effective_until IS NULL;

    CREATE INDEX IF NOT EXISTS idx_subscription_plan_prices_plan
      ON subscription_plan_prices(plan_id);

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      current_price_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('trialing', 'active', 'grace_period', 'expired', 'paused', 'canceled')),
      current_period_start INTEGER NOT NULL,
      current_period_end INTEGER NOT NULL,
      trial_ends_at INTEGER,
      grace_period_ends_at INTEGER,
      canceled_at INTEGER,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
      FOREIGN KEY (current_price_id) REFERENCES subscription_plan_prices(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_org_nonterminal
      ON subscriptions(organization_id)
      WHERE status IN ('trialing', 'active', 'grace_period', 'paused');

    CREATE INDEX IF NOT EXISTS idx_subscriptions_organization ON subscriptions(organization_id);

    CREATE TABLE IF NOT EXISTS wallet_accounts (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL UNIQUE,
      currency TEXT NOT NULL,
      balance_minor_units INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    );

    CREATE TABLE IF NOT EXISTS wallet_ledger (
      id TEXT PRIMARY KEY,
      wallet_account_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      amount_minor_units INTEGER NOT NULL,
      currency TEXT NOT NULL,
      balance_after_minor_units INTEGER NOT NULL,
      entry_type TEXT NOT NULL CHECK (entry_type IN ('subscription_charge', 'credit', 'refund', 'adjustment')),
      reference_type TEXT,
      reference_id TEXT,
      description TEXT,
      created_by TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (wallet_account_id) REFERENCES wallet_accounts(id),
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_wallet_ledger_organization ON wallet_ledger(organization_id);
    CREATE INDEX IF NOT EXISTS idx_wallet_ledger_wallet_account ON wallet_ledger(wallet_account_id);
  `);
}

// Phase 3 — mirrors server/webauthn-rp/migrations/007_billing_plan_features.sql.
// See that file for why this exists (the missing dependency for real
// entitlement resolution).
function migrateAddBillingPlanFeatures(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscription_plan_features (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      feature_key TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (plan_id, feature_key),
      FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_subscription_plan_features_plan
      ON subscription_plan_features(plan_id);
  `);
}

// Phase 4 — mirrors server/webauthn-rp/migrations/008_payments.sql. See
// that file for the full rationale.
function migrateAddPayments(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_intents (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units > 0),
      currency TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN (
        'CREATED', 'PENDING', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED',
        'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED'
      )),
      reference_type TEXT,
      reference_id TEXT,
      metadata TEXT,
      idempotency_key TEXT,
      provider_payment_id TEXT,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intents_idempotency
      ON payment_intents(organization_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_payment_intents_organization ON payment_intents(organization_id);
    CREATE INDEX IF NOT EXISTS idx_payment_intents_provider_payment_id ON payment_intents(provider_payment_id);

    CREATE TABLE IF NOT EXISTS payment_events (
      id TEXT PRIMARY KEY,
      payment_intent_id TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN (
        'created', 'status_changed', 'webhook_received', 'refunded', 'cancelled'
      )),
      previous_status TEXT,
      new_status TEXT,
      detail TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (payment_intent_id) REFERENCES payment_intents(id)
    );

    CREATE INDEX IF NOT EXISTS idx_payment_events_intent ON payment_events(payment_intent_id);
  `);
}

// Phase 5.2 — mirrors server/webauthn-rp/migrations/009_payment_providers.sql.
// See that file for the full rationale (deliberately no raw webhook
// payload storage — structured, derived fields only).
function migrateAddPaymentProviders(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_provider_configs (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 0,
      environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
      supported_currencies TEXT NOT NULL,
      supported_payment_methods TEXT NOT NULL,
      routing_priority INTEGER NOT NULL DEFAULT 100,
      min_amount_minor_units INTEGER,
      max_amount_minor_units INTEGER,
      credential_ref TEXT,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS payment_webhook_events (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      provider_event_id TEXT,
      payment_intent_id TEXT,
      verified INTEGER NOT NULL,
      canonical_status TEXT,
      amount_matched INTEGER,
      currency_matched INTEGER,
      outcome TEXT NOT NULL CHECK (outcome IN (
        'applied', 'rejected_unverified', 'rejected_unknown_payment',
        'rejected_amount_mismatch', 'rejected_currency_mismatch',
        'duplicate_ignored', 'held_unknown_status'
      )),
      created_at INTEGER NOT NULL,
      FOREIGN KEY (payment_intent_id) REFERENCES payment_intents(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_webhook_events_dedup
      ON payment_webhook_events(provider_id, provider_event_id)
      WHERE provider_event_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_intent ON payment_webhook_events(payment_intent_id);
  `);
}

// Phase 5.3 — mirrors server/webauthn-rp/migrations/010_crypto_payments.sql.
// See that file for the full rationale.
function migrateAddCryptoPayments(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS crypto_network_asset_rules (
      id TEXT PRIMARY KEY,
      asset TEXT NOT NULL,
      network TEXT NOT NULL,
      address_format TEXT NOT NULL CHECK (address_format IN ('evm', 'bitcoin_base58', 'bitcoin_bech32', 'tron_base58', 'solana_base58')),
      UNIQUE (asset, network)
    );

    CREATE TABLE IF NOT EXISTS crypto_destinations (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      asset TEXT NOT NULL,
      network TEXT NOT NULL,
      address TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 0,
      effective_from INTEGER NOT NULL,
      effective_until INTEGER,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_crypto_destinations_active
      ON crypto_destinations(organization_id, asset, network)
      WHERE active = 1 AND effective_until IS NULL;

    CREATE INDEX IF NOT EXISTS idx_crypto_destinations_org ON crypto_destinations(organization_id);

    CREATE TABLE IF NOT EXISTS crypto_exchange_rates (
      id TEXT PRIMARY KEY,
      base_currency TEXT NOT NULL,
      quote_asset TEXT NOT NULL,
      rate TEXT NOT NULL,
      source TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_crypto_exchange_rates_lookup ON crypto_exchange_rates(base_currency, quote_asset, expires_at);

    CREATE TABLE IF NOT EXISTS crypto_transactions (
      id TEXT PRIMARY KEY,
      payment_intent_id TEXT NOT NULL,
      network TEXT NOT NULL,
      transaction_hash TEXT NOT NULL,
      asset TEXT,
      amount_claimed TEXT,
      destination_claimed TEXT,
      confirmations INTEGER,
      verification_status TEXT NOT NULL CHECK (verification_status IN (
        'PENDING_VERIFICATION', 'VERIFIED_MATCH', 'VERIFIED_MISMATCH', 'UNKNOWN'
      )),
      mismatch_reason TEXT,
      submitted_by TEXT,
      created_at INTEGER NOT NULL,
      verified_at INTEGER,
      FOREIGN KEY (payment_intent_id) REFERENCES payment_intents(id),
      FOREIGN KEY (submitted_by) REFERENCES users(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_crypto_transactions_dedup
      ON crypto_transactions(network, transaction_hash);

    CREATE INDEX IF NOT EXISTS idx_crypto_transactions_intent ON crypto_transactions(payment_intent_id);

    CREATE TABLE IF NOT EXISTS crypto_confirmation_policy (
      id TEXT PRIMARY KEY,
      network TEXT NOT NULL UNIQUE,
      required_confirmations INTEGER NOT NULL CHECK (required_confirmations >= 0),
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
  `);
}

// Phase 5.3 Step 2 — mirrors server/webauthn-rp/migrations/011_quote_engine.sql.
// Uses the same idempotent-column pattern as migrateAddTotpMfa() above
// (PRAGMA table_info + conditional ALTER) since this SQLite build does
// not support "ADD COLUMN IF NOT EXISTS" syntax — confirmed directly
// before writing this function, not assumed from the .sql file's own
// (Postgres-only-safe) phrasing.
function migrateAddQuoteEngine(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS financial_assets (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      asset_type TEXT NOT NULL CHECK (asset_type IN ('FIAT', 'CRYPTO')),
      decimals INTEGER NOT NULL CHECK (decimals >= 0 AND decimals <= 18),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const rateCols = db.prepare("PRAGMA table_info(crypto_exchange_rates)").all();
  if (!rateCols.some((c) => c.name === 'rate_type')) {
    db.exec("ALTER TABLE crypto_exchange_rates ADD COLUMN rate_type TEXT NOT NULL DEFAULT 'MANUAL_RATE' CHECK (rate_type IN ('REAL_RATE_PROVIDER', 'TEST_RATE_PROVIDER', 'MANUAL_RATE'))");
  }
  if (!rateCols.some((c) => c.name === 'bid')) {
    db.exec('ALTER TABLE crypto_exchange_rates ADD COLUMN bid TEXT');
  }
  if (!rateCols.some((c) => c.name === 'ask')) {
    db.exec('ALTER TABLE crypto_exchange_rates ADD COLUMN ask TEXT');
  }
  if (!rateCols.some((c) => c.name === 'observed_at')) {
    db.exec('ALTER TABLE crypto_exchange_rates ADD COLUMN observed_at INTEGER');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS crypto_fee_configs (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      fee_type TEXT NOT NULL CHECK (fee_type IN ('percentage', 'fixed')),
      fee_value TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
      effective_from INTEGER NOT NULL,
      effective_until INTEGER,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_crypto_fee_configs_current
      ON crypto_fee_configs(organization_id, fee_type)
      WHERE status = 'active' AND effective_until IS NULL;

    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      base_currency TEXT NOT NULL,
      base_amount_minor_units INTEGER NOT NULL CHECK (base_amount_minor_units > 0),
      asset TEXT NOT NULL,
      network TEXT NOT NULL,
      destination_address TEXT NOT NULL,
      exchange_rate_id TEXT NOT NULL,
      rate_snapshot TEXT NOT NULL,
      rate_type_snapshot TEXT NOT NULL,
      fee_config_id TEXT,
      fee_snapshot TEXT NOT NULL,
      gross_atomic_amount TEXT NOT NULL,
      net_atomic_amount TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'LOCKED', 'EXPIRED', 'REJECTED', 'CONSUMED')),
      reject_reason TEXT,
      payment_intent_id TEXT,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      locked_at INTEGER,
      consumed_at INTEGER,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (exchange_rate_id) REFERENCES crypto_exchange_rates(id),
      FOREIGN KEY (fee_config_id) REFERENCES crypto_fee_configs(id),
      FOREIGN KEY (payment_intent_id) REFERENCES payment_intents(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_quotes_organization ON quotes(organization_id);
    CREATE INDEX IF NOT EXISTS idx_quotes_payment_intent ON quotes(payment_intent_id);
  `);
}

// Universal Knowledge Intelligence Foundation — mirrors
// server/webauthn-rp/migrations/012_knowledge_foundation.sql.
function migrateAddKnowledgeFoundation(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_records (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      scope TEXT NOT NULL CHECK (scope IN ('GLOBAL', 'ORGANIZATION')),
      domain TEXT NOT NULL,
      subject TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      facts TEXT NOT NULL DEFAULT '{}',
      capabilities TEXT NOT NULL DEFAULT '[]',
      limitations TEXT NOT NULL DEFAULT '[]',
      dependencies TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL CHECK (status IN ('AVAILABLE', 'IMPLEMENTED', 'TEST_ONLY', 'BLOCKED', 'NOT_IMPLEMENTED', 'DEPRECATED', 'UNKNOWN')),
      evidence_state TEXT NOT NULL CHECK (evidence_state IN ('OBSERVED', 'VERIFIED', 'INFERRED', 'NOT_RUN', 'SKIPPED', 'BLOCKED', 'UNKNOWN')),
      source_type TEXT NOT NULL CHECK (source_type IN ('repository_file', 'database_schema', 'test_result', 'certification_report', 'official_provider_documentation', 'administrator_configuration', 'runtime_observation')),
      source_reference TEXT NOT NULL,
      source_version TEXT,
      visibility TEXT NOT NULL CHECK (visibility IN ('PUBLIC', 'USER', 'ORGANIZATION', 'ADMIN', 'SYSTEM', 'SECRET')),
      sensitivity TEXT NOT NULL DEFAULT 'normal' CHECK (sensitivity IN ('normal', 'sensitive')),
      record_status TEXT NOT NULL DEFAULT 'active' CHECK (record_status IN ('active', 'superseded')),
      effective_until INTEGER,
      owner TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      verified_at INTEGER,
      expires_at INTEGER,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (owner) REFERENCES users(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_records_current
      ON knowledge_records(scope, organization_id, domain, subject)
      WHERE record_status = 'active' AND effective_until IS NULL;

    CREATE INDEX IF NOT EXISTS idx_knowledge_records_org ON knowledge_records(organization_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_records_domain ON knowledge_records(domain);

    CREATE TABLE IF NOT EXISTS knowledge_evidence_links (
      id TEXT PRIMARY KEY,
      knowledge_id TEXT NOT NULL,
      evidence_type TEXT NOT NULL CHECK (evidence_type IN ('test', 'source_file', 'documentation', 'runtime_observation')),
      reference TEXT NOT NULL,
      result TEXT CHECK (result IN ('PASS', 'FAIL', 'NOT_RUN', 'SKIPPED')),
      recorded_by TEXT NOT NULL,
      recorded_at INTEGER NOT NULL,
      FOREIGN KEY (knowledge_id) REFERENCES knowledge_records(id),
      FOREIGN KEY (recorded_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_evidence_links_knowledge ON knowledge_evidence_links(knowledge_id);
  `);
}

// CozyOS File Phase 1 — mirrors
// server/webauthn-rp/migrations/013_document_storage.sql. See that
// file's own header for the full repository-discovery rationale.
function migrateAddDocumentStorage(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      document_type TEXT NOT NULL DEFAULT 'unknown',
      category TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'verified', 'approved', 'rejected', 'archived', 'deleted', 'exported')),
      title TEXT,
      raw_text TEXT,
      checksum TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      record_json TEXT NOT NULL,
      binary_storage_ref TEXT,
      current_version INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_documents_org ON documents(organization_id);
    CREATE INDEX IF NOT EXISTS idx_documents_org_status ON documents(organization_id, status);
    CREATE INDEX IF NOT EXISTS idx_documents_org_type ON documents(organization_id, document_type);

    CREATE TABLE IF NOT EXISTS document_versions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      checksum TEXT,
      changed_by TEXT,
      change_summary TEXT,
      changed_at INTEGER NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id),
      FOREIGN KEY (changed_by) REFERENCES users(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_document_versions_unique ON document_versions(document_id, version);
    CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON document_versions(document_id);
  `);
}

// CozyOS File Phase 2 - mirrors
// server/webauthn-rp/migrations/014_document_binary_storage.sql.
// Idempotent column-add, matching migrateAddFirebaseUid()'s own
// established pattern exactly (SQLite has no ADD COLUMN IF NOT EXISTS).
function migrateAddDocumentBinaryStorage(db) {
  const cols = db.prepare('PRAGMA table_info(documents)').all();
  const existing = new Set(cols.map((c) => c.name));
  if (!existing.has('binary_size')) db.exec('ALTER TABLE documents ADD COLUMN binary_size INTEGER');
  if (!existing.has('binary_mime_type')) db.exec('ALTER TABLE documents ADD COLUMN binary_mime_type TEXT');
  if (!existing.has('binary_checksum')) db.exec('ALTER TABLE documents ADD COLUMN binary_checksum TEXT');
  if (!existing.has('binary_original_filename')) db.exec('ALTER TABLE documents ADD COLUMN binary_original_filename TEXT');
}

// CozyOS File Phase 3 - mirrors
// server/webauthn-rp/migrations/015_document_folders.sql. See that
// file's own header for the full repository-discovery rationale and
// documented design decisions (single parent folder per document,
// disallowed duplicate active sibling names, immutable single root per
// organization).
function migrateAddDocumentFolders(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      parent_folder_id TEXT,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
      is_root INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      updated_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (parent_folder_id) REFERENCES folders(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (updated_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_folders_org ON folders(organization_id);
    CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_folder_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_one_root_per_org ON folders(organization_id) WHERE is_root = 1;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_unique_sibling_name ON folders(organization_id, parent_folder_id, normalized_name) WHERE status = 'active';
  `);

  const cols = db.prepare('PRAGMA table_info(documents)').all();
  const hasColumn = cols.some((c) => c.name === 'folder_id');
  if (!hasColumn) db.exec('ALTER TABLE documents ADD COLUMN folder_id TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id)');
}

// CozyOS File Phase 4 - mirrors
// server/webauthn-rp/migrations/016_transfer_sessions.sql. See that
// file's own header for the full repository-discovery rationale.
function migrateAddTransferSessions(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transfer_sessions (
      id TEXT PRIMARY KEY,
      sender_user_id TEXT NOT NULL,
      sender_organization_id TEXT NOT NULL,
      receiver_user_id TEXT,
      receiver_organization_id TEXT,
      pairing_token_hash TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pairing' CHECK (state IN ('pairing', 'connected', 'transfer_negotiation', 'transferring', 'verifying', 'completed', 'failed', 'cancelled', 'corrupted', 'expired')),
      manifest_json TEXT,
      failure_reason TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (sender_user_id) REFERENCES users(id),
      FOREIGN KEY (sender_organization_id) REFERENCES organizations(id),
      FOREIGN KEY (receiver_user_id) REFERENCES users(id),
      FOREIGN KEY (receiver_organization_id) REFERENCES organizations(id)
    );

    CREATE INDEX IF NOT EXISTS idx_transfer_sessions_sender ON transfer_sessions(sender_user_id);
    CREATE INDEX IF NOT EXISTS idx_transfer_sessions_receiver ON transfer_sessions(receiver_user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transfer_sessions_one_active_per_sender ON transfer_sessions(sender_user_id) WHERE state NOT IN ('completed', 'failed', 'cancelled', 'corrupted', 'expired');

    CREATE TABLE IF NOT EXISTS transfer_items (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      source_document_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      filename TEXT NOT NULL,
      size INTEGER,
      mime_type TEXT,
      checksum TEXT,
      received_document_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'transferring', 'verified', 'failed')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES transfer_sessions(id),
      FOREIGN KEY (source_document_id) REFERENCES documents(id),
      FOREIGN KEY (received_document_id) REFERENCES documents(id)
    );

    CREATE INDEX IF NOT EXISTS idx_transfer_items_session ON transfer_items(session_id);
  `);
}

module.exports = { openDb };
