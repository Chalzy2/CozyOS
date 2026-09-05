'use strict';
/**
 * server/webauthn-rp/test/test-only-blockchain-verifier.js
 *
 * ============================================================
 * TEST-ONLY — NEVER A REAL BLOCKCHAIN CONNECTION
 * ============================================================
 * This is an in-memory fixture, not a blockchain client. It exists
 * solely to exercise CryptoPaymentRegistry.verifyTransaction()'s real
 * decision logic (match / mismatch / underpayment / overpayment / wrong
 * network / wrong destination / not-found / RPC-error-as-UNKNOWN)
 * locally, since no real blockchain RPC/node/API credentials or network
 * access exist in this environment (Phase 5.1/5.3 discovery, unchanged).
 *
 * Never imported by server.js. Never registered as a real verifier.
 * Every test using this file must label its results TESTED/VERIFIED
 * against local logic, never REAL RUNTIME blockchain verification.
 */

function createTestOnlyBlockchainVerifier() {
  const fixtures = new Map(); // `${network}:${hash}` -> { state, network, asset, destination, amount, confirmations }

  return {
    /** seed — test setup only, not part of the real verifier interface. */
    seed(network, hash, fixture) {
      fixtures.set(`${network}:${hash}`, fixture);
    },
    async getTransaction(network, hash) {
      const fixture = fixtures.get(`${network}:${hash}`);
      if (!fixture) return { state: 'not_found' };
      if (fixture.rpcError) throw new Error('simulated RPC failure');
      return {
        state: fixture.state || 'confirmed',
        network: fixture.network,
        asset: fixture.asset,
        destination: fixture.destination,
        amount: fixture.amount,
      };
    },
    async getConfirmations(network, hash) {
      const fixture = fixtures.get(`${network}:${hash}`);
      if (!fixture) return 0;
      if (fixture.rpcError) throw new Error('simulated RPC failure');
      return fixture.confirmations ?? 0;
    },
  };
}

module.exports = { createTestOnlyBlockchainVerifier };
