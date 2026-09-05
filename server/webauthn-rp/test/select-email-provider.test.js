'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { selectEmailProvider, REQUIRED_SMTP_VARS } = require('../providers/select-email-provider');
const { MockEmailProvider, UnconfiguredEmailProvider } = require('../delivery-provider');
const { SmtpEmailProvider } = require('../providers/smtp-email-provider');

const FULL_SMTP_ENV = Object.freeze({
  COZY_EMAIL_PROVIDER: 'smtp',
  COZY_SMTP_HOST: 'smtp.example.com',
  COZY_SMTP_PORT: '587',
  COZY_SMTP_USER: 'reset-bot@cozyos.org',
  COZY_SMTP_PASS: 'super-secret-should-not-leak',
  COZY_SMTP_FROM: 'CozyOS <no-reply@cozyos.org>',
});

test('selectEmailProvider: no env var -> Unconfigured (honest no-delivery default)', () => {
  const provider = selectEmailProvider({});
  assert.ok(provider instanceof UnconfiguredEmailProvider);
  assert.equal(provider.status().configured, false);
});

test('selectEmailProvider: COZY_EMAIL_PROVIDER=none -> Unconfigured', () => {
  const provider = selectEmailProvider({ COZY_EMAIL_PROVIDER: 'none' });
  assert.ok(provider instanceof UnconfiguredEmailProvider);
});

test('selectEmailProvider: COZY_EMAIL_PROVIDER=mock -> MockEmailProvider', () => {
  const provider = selectEmailProvider({ COZY_EMAIL_PROVIDER: 'mock' });
  assert.ok(provider instanceof MockEmailProvider);
  assert.equal(provider.status().configured, true);
  assert.equal(provider.status().kind, 'mock');
});

test('selectEmailProvider: COZY_EMAIL_PROVIDER=smtp with full config -> SmtpEmailProvider', () => {
  const provider = selectEmailProvider(FULL_SMTP_ENV);
  assert.ok(provider instanceof SmtpEmailProvider);
  const status = provider.status();
  assert.equal(status.kind, 'smtp');
  assert.equal(status.host, 'smtp.example.com');
  assert.equal(status.port, 587);
  assert.ok(!JSON.stringify(status).includes(FULL_SMTP_ENV.COZY_SMTP_PASS));
});

for (const missingVar of REQUIRED_SMTP_VARS) {
  test(`selectEmailProvider: smtp missing ${missingVar} -> throws at startup, names the var, leaks no secret`, () => {
    const env = { ...FULL_SMTP_ENV };
    delete env[missingVar];
    assert.throws(
      () => selectEmailProvider(env),
      (err) => {
        assert.match(err.message, new RegExp(missingVar));
        assert.ok(!err.message.includes(FULL_SMTP_ENV.COZY_SMTP_PASS));
        return true;
      }
    );
  });
}

test('selectEmailProvider: unknown provider kind throws', () => {
  assert.throws(() => selectEmailProvider({ COZY_EMAIL_PROVIDER: 'sendgrid-sdk-please' }), /Unknown COZY_EMAIL_PROVIDER/);
});

test('selectEmailProvider: blank string treated as none', () => {
  const provider = selectEmailProvider({ COZY_EMAIL_PROVIDER: '' });
  assert.ok(provider instanceof UnconfiguredEmailProvider);
});
