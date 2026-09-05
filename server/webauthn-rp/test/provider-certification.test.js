'use strict';
/**
 * server/webauthn-rp/test/provider-certification.test.js
 *
 * Applies the Phase 5.2 certification harness to:
 *   1. cash (REAL adapter — proves the harness itself works against a
 *      genuine, fully-functional provider, not just a fake one).
 *   2. test-only-async-provider (TEST-ONLY — see that file's header;
 *      never registered outside this test, exercises the async/webhook/
 *      unknown-state machinery cash cannot exercise).
 *
 * Labeling discipline (Phase 5.2 explicit requirement): results below
 * are TESTED/VERIFIED against real local infrastructure (real SQLite,
 * real transactions, real crypto). Nothing here is REAL RUNTIME evidence
 * of external provider connectivity — no external network call is made
 * by anything in this file.
 */
const test = require('node:test');
const { certifyProvider } = require('./provider-certification-harness');
const { createCashProviderAdapter } = require('../providers/cash-provider');
const { createTestOnlyAsyncProviderAdapter, simulateTestOnlyWebhookEvent } = require('./test-only-async-provider');

// ---------- 1. Real adapter: cash ----------
certifyProvider(test, {
  providerId: 'cash',
  createAdapter: createCashProviderAdapter,
  supportsWebhooks: false,
});

// ---------- 2. TEST-ONLY: async provider (exercises webhook/unknown-state paths) ----------
certifyProvider(test, {
  providerId: 'test_only_async',
  createAdapter: createTestOnlyAsyncProviderAdapter,
  supportsWebhooks: true,
  simulateWebhookEvent: simulateTestOnlyWebhookEvent,
});
