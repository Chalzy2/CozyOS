'use strict';

/**
 * core/modules/intelligence/offline/tests/cozy-offline-capability-registry.test.js
 *
 * Real, executed Node unit tests for
 * core/modules/intelligence/offline/cozy-offline-capability-registry.js —
 * Vision Section 4's LOCAL-CAPABLE/OPTIONAL/REQUIRED/UNKNOWN taxonomy.
 *
 * No DOM/browser needed for these: the module runs identically under
 * plain Node (global.window is created for it, matching the pattern
 * already used by core/modules/module-registry.js's own IIFE guard).
 * Real-browser, file://-loading verification of THIS SAME module lives
 * separately in
 * core/tests/browser/offline-capability-registry-browser.test.js.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function freshModule() {
    // Force a genuinely fresh require() each time so tests are isolated
    // from each other (the module guards against double-registration on
    // its own global namespace).
    delete global.window;
    delete global.CozyOS;
    const modPath = path.join(__dirname, '..', 'cozy-offline-capability-registry.js');
    delete require.cache[require.resolve(modPath)];
    return require(modPath);
}

test('module loads under plain Node (no browser) and exposes the exact four vision classifications', () => {
    const registry = freshModule();
    assert.deepEqual(registry.CLASSIFICATIONS, ['LOCAL-CAPABLE', 'OPTIONAL', 'REQUIRED', 'UNKNOWN']);
});

test('seed entries are registered with real evidence citations, not fabricated', () => {
    const registry = freshModule();
    const all = registry.list();
    assert.ok(all.length >= 4, 'expected at least the 4 seed entries');
    for (const entry of all) {
        assert.equal(entry.registered, true);
        assert.ok(entry.evidence && entry.evidence.length > 0, `entry "${entry.name}" must carry a real evidence citation`);
        assert.ok(registry.CLASSIFICATIONS.includes(entry.classification));
    }
});

test('classify() on an unregistered name returns a real, explicit UNKNOWN — never a fabricated default', () => {
    const registry = freshModule();
    const result = registry.classify('capability-nobody-has-ever-registered');
    assert.equal(result.classification, 'UNKNOWN');
    assert.equal(result.registered, false);
    assert.equal(result.evidence, null);
});

test('register() rejects an invalid classification rather than silently coercing it', () => {
    const registry = freshModule();
    assert.throws(() => {
        registry.register('bad-capability', {
            classification: 'PROBABLY_FINE',
            description: 'x',
            evidence: 'x'
        });
    }, TypeError);
});

test('register() rejects a registration with no evidence citation', () => {
    const registry = freshModule();
    assert.throws(() => {
        registry.register('no-evidence-capability', {
            classification: 'LOCAL-CAPABLE',
            description: 'x'
        });
    }, TypeError);
});

test('register() rejects a registration with no description', () => {
    const registry = freshModule();
    assert.throws(() => {
        registry.register('no-description-capability', {
            classification: 'LOCAL-CAPABLE',
            evidence: 'x'
        });
    }, TypeError);
});

test('register() never silently overwrites an existing entry — duplicate registration throws', () => {
    const registry = freshModule();
    assert.throws(() => {
        registry.register('storage-gateway-indexeddb', {
            classification: 'REQUIRED',
            description: 'attempted overwrite',
            evidence: 'nowhere'
        });
    }, Error);
    // The original seed classification must be untouched by the failed attempt.
    assert.equal(registry.classify('storage-gateway-indexeddb').classification, 'LOCAL-CAPABLE');
});

test('a fresh register() + classify() round-trip preserves classification, description, evidence and operationalNote', () => {
    const registry = freshModule();
    registry.register('roundtrip-capability', {
        classification: 'OPTIONAL',
        description: 'A test capability.',
        evidence: 'this test file',
        operationalNote: 'a caveat'
    });
    const result = registry.classify('roundtrip-capability');
    assert.equal(result.classification, 'OPTIONAL');
    assert.equal(result.description, 'A test capability.');
    assert.equal(result.evidence, 'this test file');
    assert.equal(result.operationalNote, 'a caveat');
    assert.equal(result.registered, true);
});

test('classify() returns a frozen object; mutating the returned object never touches the registry', () => {
    const registry = freshModule();
    const first = registry.classify('storage-gateway-indexeddb');
    assert.throws(() => { first.classification = 'REQUIRED'; }, TypeError);
    const second = registry.classify('storage-gateway-indexeddb');
    assert.equal(second.classification, 'LOCAL-CAPABLE');
});

test('checkReachability() returns null (never true/false) for a name with no detect() function — indeterminate stays indeterminate', async () => {
    const registry = freshModule();
    registry.register('no-detector-capability', {
        classification: 'REQUIRED',
        description: 'x',
        evidence: 'x'
    });
    const result = await registry.checkReachability('no-detector-capability');
    assert.equal(result, null);
});

test('checkReachability() returns null for an unregistered name', async () => {
    const registry = freshModule();
    const result = await registry.checkReachability('nobody-registered-this');
    assert.equal(result, null);
});

test('checkReachability() runs a real detect() function and coerces its result to a real boolean', async () => {
    const registry = freshModule();
    registry.register('detectable-capability', {
        classification: 'LOCAL-CAPABLE',
        description: 'x',
        evidence: 'x',
        detect: () => true
    });
    assert.equal(await registry.checkReachability('detectable-capability'), true);
});

test('checkReachability() catches a throwing detect() function and honestly returns null rather than crashing', async () => {
    const registry = freshModule();
    registry.register('throwing-detector-capability', {
        classification: 'LOCAL-CAPABLE',
        description: 'x',
        evidence: 'x',
        detect: () => { throw new Error('boom'); }
    });
    const result = await registry.checkReachability('throwing-detector-capability');
    assert.equal(result, null);
});

test('checkReachability() awaits an async detect() function correctly', async () => {
    const registry = freshModule();
    registry.register('async-detector-capability', {
        classification: 'OPTIONAL',
        description: 'x',
        evidence: 'x',
        detect: async () => { await Promise.resolve(); return false; }
    });
    assert.equal(await registry.checkReachability('async-detector-capability'), false);
});

test('the storage-gateway-indexeddb seed entry carries a non-fabricated operational note about the real file:// + ES-module gap, and it does not change the classification', () => {
    const registry = freshModule();
    const entry = registry.classify('storage-gateway-indexeddb');
    assert.equal(entry.classification, 'LOCAL-CAPABLE');
    assert.match(entry.operationalNote, /file:\/\//);
    assert.match(entry.operationalNote, /CORS|ES module/i);
});

test('unregister() removes an entry, after which classify() honestly reports UNKNOWN again', () => {
    const registry = freshModule();
    registry.register('temporary-capability', {
        classification: 'REQUIRED',
        description: 'x',
        evidence: 'x'
    });
    assert.equal(registry.classify('temporary-capability').registered, true);
    assert.equal(registry.unregister('temporary-capability'), true);
    assert.equal(registry.classify('temporary-capability').registered, false);
    assert.equal(registry.classify('temporary-capability').classification, 'UNKNOWN');
});

test('listByClassification() filters correctly and rejects an invalid classification argument', () => {
    const registry = freshModule();
    const required = registry.listByClassification('REQUIRED');
    assert.ok(required.length >= 1);
    for (const entry of required) assert.equal(entry.classification, 'REQUIRED');
    assert.throws(() => registry.listByClassification('NOT_A_REAL_STATE'), TypeError);
});

test('getAuditLog() records real register()/unregister() actions, most recent last', () => {
    const registry = freshModule();
    registry.register('audited-capability', {
        classification: 'LOCAL-CAPABLE',
        description: 'x',
        evidence: 'x'
    });
    registry.unregister('audited-capability');
    const log = registry.getAuditLog();
    const relevant = log.filter((e) => e.name === 'audited-capability');
    assert.equal(relevant.length, 2);
    assert.equal(relevant[0].action, 'register');
    assert.equal(relevant[1].action, 'unregister');
});

test('window.CozyOS.OfflineCapabilityRegistry and window.CozyOS.Modules registration mirror the module-registry.js / cozy-storage-provider.js convention', () => {
    freshModule();
    assert.ok(global.window.CozyOS.OfflineCapabilityRegistry, 'expected window.CozyOS.OfflineCapabilityRegistry to be set');
    assert.ok(global.window.CozyOS.Modules['cozy-offline-capability-registry'], 'expected a Modules registry entry');
    assert.equal(global.window.CozyOS.Modules['cozy-offline-capability-registry'].version, '1.0.0');
});

test('loading the module a second time on the same window is a real no-op guard (does not throw on duplicate seed registration)', () => {
    freshModule();
    const modPath = path.join(__dirname, '..', 'cozy-offline-capability-registry.js');
    delete require.cache[require.resolve(modPath)];
    // Do NOT delete global.window/global.CozyOS this time — simulate a
    // page that accidentally includes the <script> tag twice.
    assert.doesNotThrow(() => { require(modPath); });
});
