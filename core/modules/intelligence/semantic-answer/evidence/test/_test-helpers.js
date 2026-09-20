'use strict';

/**
 * core/modules/intelligence/semantic-answer/evidence/test/_test-helpers.js
 * SA-2 shared test loader — loads the REAL, unmodified production
 * source files (CozyKnowledge, CozyMemory, IdentityEngine,
 * OrganizationRegistry/Membership/Support) plus SA-1's
 * VerifiedEvidenceContract and the SA-2 adapters under test, all onto
 * ONE fresh window per call — matching this repo's own established
 * Node-test convention (see e.g. church-live-session-controller.test.js).
 */

const path = require('node:path');

const PATHS = Object.freeze({
    knowledgeRegistry: path.join(__dirname, '..', '..', '..', 'knowledge', 'cozy-knowledge-registry.js'),
    memoryEngine: path.join(__dirname, '..', '..', '..', '..', 'memory', 'cozy-memory-engine.js'),
    identityEngine: path.join(__dirname, '..', '..', '..', '..', 'identity', 'identity-engine.js'),
    orgRegistry: path.join(__dirname, '..', '..', '..', '..', '..', 'organization', 'organization-registry.js'),
    orgMembership: path.join(__dirname, '..', '..', '..', '..', '..', 'organization', 'organization-membership.js'),
    orgSupport: path.join(__dirname, '..', '..', '..', '..', '..', 'organization', 'organization-support.js'),
    evidenceContract: path.join(__dirname, '..', '..', 'contracts', 'verified-evidence-contract.js'),
    adapter: path.join(__dirname, '..', 'verified-evidence-adapter.js'),
    knowledgeAdapter: path.join(__dirname, '..', 'source-adapters', 'cozy-knowledge-adapter.js'),
    memoryAdapter: path.join(__dirname, '..', 'source-adapters', 'cozy-memory-adapter.js'),
});

/** freshLoad(selectedKeys) — clears require cache for every real module involved, builds a fresh window, loads only the selected real modules (in PATHS' own declared order), and returns that window. */
function freshLoad(selectedKeys) {
    for (const p of Object.values(PATHS)) delete require.cache[require.resolve(p)];
    global.window = { CozyOS: {}, addEventListener: () => {}, dispatchEvent: () => {} };
    if (typeof global.crypto === 'undefined') global.crypto = require('crypto').webcrypto;
    for (const key of Object.keys(PATHS)) {
        if (selectedKeys.includes(key)) require(PATHS[key]);
    }
    return global.window;
}

module.exports = { PATHS, freshLoad };
