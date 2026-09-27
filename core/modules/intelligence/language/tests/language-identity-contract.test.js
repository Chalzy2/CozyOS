'use strict';

/**
 * core/modules/intelligence/language/tests/language-identity-contract.test.js
 * Universal Language Seam — cozy.language-identity.v1 contract tests.
 * Run with: node --test core/modules/intelligence/language/tests/language-identity-contract.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CONTRACT_PATH = path.join(__dirname, '..', 'language-identity-contract.js');

function freshContract() {
    try { delete require.cache[require.resolve(CONTRACT_PATH)]; } catch (_e) { /* not loaded */ }
    global.window = { CozyOS: {} };
    require(CONTRACT_PATH);
    return global.window.CozyOS.LanguageIdentityContract;
}

test('registers window.CozyOS.LanguageIdentityContract', () => {
    const contract = freshContract();
    assert.ok(contract);
    assert.equal(typeof contract.getVersion(), 'string');
});

test('a real, resolved identity validates', () => {
    const contract = freshContract();
    const result = contract.create({
        languageId: 'sw', source: 'MARKER_MATCH', confidence: 'HIGH', modality: 'text',
        dialectRegion: null, detectedLanguages: ['sw'], mixedLanguage: false, conflict: null,
    });
    assert.equal(result.success, true, JSON.stringify(result));
});

test('unresolved() produces a real, valid, honest UNKNOWN identity', () => {
    const contract = freshContract();
    const identity = contract.unresolved('text');
    const result = contract.validate(identity);
    assert.equal(result.valid, true, JSON.stringify(result));
    assert.equal(identity.languageId, 'UNKNOWN');
    assert.equal(identity.source, 'UNRESOLVED');
    assert.equal(identity.confidence, 'UNKNOWN');
});

test('THE ONE RULE: source UNRESOLVED with a real languageId is rejected', () => {
    const contract = freshContract();
    const result = contract.validate({
        schemaVersion: 'cozy.language-identity.v1',
        languageId: 'en', source: 'UNRESOLVED', confidence: 'UNKNOWN', modality: 'text',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('UNRESOLVED')));
});

test('THE ONE RULE: languageId UNKNOWN with a real source is rejected (contradictory)', () => {
    const contract = freshContract();
    const result = contract.validate({
        schemaVersion: 'cozy.language-identity.v1',
        languageId: 'UNKNOWN', source: 'MARKER_MATCH', confidence: 'HIGH', modality: 'text',
    });
    assert.equal(result.valid, false);
});

test('rejects an invalid source value', () => {
    const contract = freshContract();
    const result = contract.validate({
        schemaVersion: 'cozy.language-identity.v1',
        languageId: 'sw', source: 'GUESSED', confidence: 'HIGH', modality: 'text',
    });
    assert.equal(result.valid, false);
});

test('rejects an invalid confidence value', () => {
    const contract = freshContract();
    const result = contract.validate({
        schemaVersion: 'cozy.language-identity.v1',
        languageId: 'sw', source: 'MARKER_MATCH', confidence: 'CERTAIN', modality: 'text',
    });
    assert.equal(result.valid, false);
});

test('rejects an invalid modality value', () => {
    const contract = freshContract();
    const result = contract.validate({
        schemaVersion: 'cozy.language-identity.v1',
        languageId: 'sw', source: 'MARKER_MATCH', confidence: 'HIGH', modality: 'telepathy',
    });
    assert.equal(result.valid, false);
});

test('dialectRegion is real, disclosed, and optional', () => {
    const contract = freshContract();
    const withRegion = contract.create({ languageId: 'sw', source: 'MARKER_MATCH', confidence: 'HIGH', modality: 'voice', dialectRegion: 'sw-KE' });
    assert.equal(withRegion.success, true);
    assert.equal(withRegion.identity.dialectRegion, 'sw-KE');
    const withoutRegion = contract.create({ languageId: 'sw', source: 'MARKER_MATCH', confidence: 'HIGH', modality: 'text' });
    assert.equal(withoutRegion.success, true);
});

test('conflict, when present, must be a real {explicitSaid, detectedSaid} object', () => {
    const contract = freshContract();
    const valid = contract.create({
        languageId: 'sw', source: 'EXPLICIT_USER_SELECTION', confidence: 'HIGH', modality: 'text',
        conflict: { explicitSaid: 'sw', detectedSaid: 'en' },
    });
    assert.equal(valid.success, true);
    const invalid = contract.validate({
        schemaVersion: 'cozy.language-identity.v1',
        languageId: 'sw', source: 'EXPLICIT_USER_SELECTION', confidence: 'HIGH', modality: 'text',
        conflict: 'sw vs en',
    });
    assert.equal(invalid.valid, false);
});

test('rejects a missing/empty languageId', () => {
    const contract = freshContract();
    const result = contract.validate({
        schemaVersion: 'cozy.language-identity.v1',
        source: 'MARKER_MATCH', confidence: 'HIGH', modality: 'text',
    });
    assert.equal(result.valid, false);
});

test('SOURCE enum priority order matches the design (explicit first, unresolved last)', () => {
    const contract = freshContract();
    assert.equal(contract.SOURCE[0], 'EXPLICIT_USER_SELECTION');
    assert.equal(contract.SOURCE[contract.SOURCE.length - 1], 'UNRESOLVED');
});
