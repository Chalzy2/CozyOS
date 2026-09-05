'use strict';
/**
 * selectEmailProvider(env) — the one place environment variables are
 * turned into a real EmailDeliveryProvider (see delivery-provider.js for
 * the interface). Composes existing providers; never a second delivery
 * engine.
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * server/static-boundary-server.js's real entrypoint (the
 * `require.main === module` block that Render's `startCommand` actually
 * runs) never constructed an emailProvider at all, so createServer()'s
 * own default (UnconfiguredEmailProvider — see webauthn-rp/server.js)
 * was silently in effect in every real deployment. /auth/password/forgot
 * still returned its generic 200 (by design, anti-enumeration), so this
 * failure was invisible on the wire — the account holder never received
 * a reset email and had no way to tell that from a real success. This
 * file is the fix: one explicit, fail-fast seam between env vars and the
 * provider the server actually uses.
 *
 * VALIDATION PHILOSOPHY (per COZY_EMAIL_PROVIDER value)
 *   unset / "none"  -> UnconfiguredEmailProvider. Honest "no delivery
 *                      configured" state — same behavior as before this
 *                      change for any deployment that sets nothing,
 *                      so this is not a breaking default change.
 *   "mock"          -> MockEmailProvider. For local dev / Lab smoke
 *                      testing without sending real email.
 *   "smtp"          -> SmtpEmailProvider, but ONLY if every required
 *                      COZY_SMTP_* variable is present. If the operator
 *                      explicitly asked for smtp and configuration is
 *                      incomplete, this throws synchronously so the
 *                      process fails at boot — never falls back to
 *                      Unconfigured silently, which would look identical
 *                      to "working but nobody signed up for email yet".
 *   anything else   -> throws. Typos must be loud, not silently ignored.
 */

const { MockEmailProvider, UnconfiguredEmailProvider } = require('../delivery-provider');
const { SmtpEmailProvider } = require('./smtp-email-provider');

const REQUIRED_SMTP_VARS = ['COZY_SMTP_HOST', 'COZY_SMTP_USER', 'COZY_SMTP_PASS', 'COZY_SMTP_FROM'];

function selectEmailProvider(env = process.env) {
  const kind = String(env.COZY_EMAIL_PROVIDER || 'none').trim().toLowerCase();

  if (kind === 'none' || kind === '') {
    return new UnconfiguredEmailProvider();
  }

  if (kind === 'mock') {
    return new MockEmailProvider();
  }

  if (kind === 'smtp') {
    const missing = REQUIRED_SMTP_VARS.filter((k) => !env[k] || String(env[k]).trim() === '');
    if (missing.length > 0) {
      throw new Error(
        `[selectEmailProvider] COZY_EMAIL_PROVIDER=smtp but missing required environment variable(s): ${missing.join(', ')}. ` +
        'Refusing to start with an incomplete email configuration rather than silently falling back to no delivery.'
      );
    }
    return new SmtpEmailProvider({
      host: env.COZY_SMTP_HOST,
      port: env.COZY_SMTP_PORT ? Number(env.COZY_SMTP_PORT) : 587,
      secure: env.COZY_SMTP_SECURE === '1',
      requireTLS: env.COZY_SMTP_REQUIRE_TLS !== '0',
      user: env.COZY_SMTP_USER,
      pass: env.COZY_SMTP_PASS,
      from: env.COZY_SMTP_FROM,
    });
  }

  throw new Error(`[selectEmailProvider] Unknown COZY_EMAIL_PROVIDER "${kind}". Expected one of: none, mock, smtp.`);
}

module.exports = { selectEmailProvider, REQUIRED_SMTP_VARS };
