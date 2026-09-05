'use strict';
/**
 * server/webauthn-rp/test/test-only-rate-provider.js
 *
 * ============================================================
 * TEST-ONLY — NEVER A REAL MARKET RATE SOURCE
 * ============================================================
 * A deterministic, in-memory rate source used exclusively to test the
 * Quote Engine's financial arithmetic and lifecycle logic locally. Every
 * rate it records is written with rateType='TEST_RATE_PROVIDER' via
 * CryptoPaymentRegistry.setExchangeRate() — that field is never
 * defaulted, so a test rate can never be mistaken for
 * REAL_RATE_PROVIDER data by anything reading crypto_exchange_rates.
 *
 * Never imported by server.js. Never wired into any production route.
 * No real network call exists anywhere in this file.
 */

function createTestOnlyRateProvider(cryptoPayments) {
  return {
    async publishRate(actorUserId, { baseCurrency, quoteAsset, rate, bid = null, ask = null, expiresInMs }) {
      return cryptoPayments.setExchangeRate(actorUserId, true, {
        baseCurrency, quoteAsset, rate, bid, ask,
        source: 'test_only_rate_provider', rateType: 'TEST_RATE_PROVIDER', expiresInMs,
      });
    },
  };
}

module.exports = { createTestOnlyRateProvider };
