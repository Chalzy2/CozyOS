/**
 * core/modules/intelligence/language-packs/storage/tests/cozy-language-pack-format.test.js
 * RP-035 COS-LANG-PM-001 — real, executed tests for cozy-language-pack-format.js
 * Run with: node core/modules/intelligence/language-packs/storage/tests/cozy-language-pack-format.test.js
 */
'use strict';

const assert = require('assert');
const path = require('path');
const format = require(path.join(__dirname, '..', 'cozy-language-pack-format.js'));

let passed = 0, failed = 0;
async function test(name, fn) {
    try {
        await fn();
        console.log(`  \u2713 ${name}`);
        passed++;
    } catch (err) {
        console.log(`  \u2717 ${name}`);
        console.log(`      ${err.message}`);
        failed++;
    }
}

(async () => {
    await test('sha256Hex is deterministic and produces a real 64-hex-char digest', async () => {
        const h1 = await format.sha256Hex('hello world');
        const h2 = await format.sha256Hex('hello world');
        assert.strictEqual(h1, h2);
        assert.strictEqual(h1.length, 64);
        assert.ok(/^[0-9a-f]{64}$/.test(h1));
    });

    await test('sha256Hex matches the Node crypto reference implementation for known inputs', async () => {
        const nodeCrypto = require('crypto');
        for (const input of ['abc', '', 'CozyOS RP-035 COS-LANG-PM-001']) {
            const expected = nodeCrypto.createHash('sha256').update(input).digest('hex');
            const actual = await format.sha256Hex(input);
            assert.strictEqual(actual, expected, `mismatch for input: ${JSON.stringify(input)}`);
        }
    });

    await test('buildManifest computes real recordCount and byteSize from actual records', async () => {
        const manifest = await format.buildManifest({
            packId: 'pack-sw', languageCode: 'sw', languageName: 'Kiswahili',
            records: { vocabulary: [{ a: 1 }, { a: 2 }], translations: [{ b: 1 }] }
        });
        assert.strictEqual(manifest.counts.vocabulary, 2);
        assert.strictEqual(manifest.counts.translations, 1);
        assert.strictEqual(manifest.counts.recordCount, 3);
        assert.ok(manifest.byteSize > 0);
        assert.strictEqual(manifest.contentHash.length, 64);
        assert.strictEqual(manifest.manifestHash.length, 64);
    });

    await test('buildManifest never reports AVAILABLE with zero records', async () => {
        const manifest = await format.buildManifest({
            packId: 'pack-zu', languageCode: 'zu', languageName: 'isiZulu',
            resourceState: 'AVAILABLE', records: {}
        });
        assert.strictEqual(manifest.resourceState, 'NOT_READY');
    });

    await test('buildManifest flags non-canonical language identities honestly', async () => {
        const manifest = await format.buildManifest({ packId: 'pack-xx', languageCode: 'xx', records: {} });
        assert.strictEqual(manifest.isCanonicalIdentity, false);
    });

    await test('buildManifest recognizes all 13 canonical identities', async () => {
        for (const id of format.CANONICAL_IDENTITIES) {
            const manifest = await format.buildManifest({ packId: `pack-${id}`, languageCode: id, records: {} });
            assert.strictEqual(manifest.isCanonicalIdentity, true, `${id} should be canonical`);
        }
        assert.strictEqual(format.CANONICAL_IDENTITIES.length, 13);
    });

    await test('verifyManifest PASSES on unmodified round-trip', async () => {
        const records = { vocabulary: [{ expression: 'jambo', meaning: 'hello' }] };
        const manifest = await format.buildManifest({ packId: 'pack-sw', languageCode: 'sw', records });
        const check = await format.verifyManifest(manifest, records);
        assert.strictEqual(check.result, 'PACK_VERIFIED');
    });

    await test('verifyManifest detects PACK_CORRUPTED on tampered content', async () => {
        const records = { vocabulary: [{ expression: 'jambo', meaning: 'hello' }] };
        const manifest = await format.buildManifest({ packId: 'pack-sw', languageCode: 'sw', records });
        const tampered = { vocabulary: [{ expression: 'jambo', meaning: 'TAMPERED' }] };
        const check = await format.verifyManifest(manifest, tampered);
        assert.strictEqual(check.result, 'PACK_CORRUPTED');
        assert.strictEqual(check.reason, 'CONTENT_HASH_MISMATCH');
    });

    await test('verifyManifest detects PACK_SCHEMA_UNSUPPORTED', async () => {
        const manifest = await format.buildManifest({ packId: 'pack-sw', languageCode: 'sw', records: {} });
        manifest.schemaVersion = '99.0.0';
        const check = await format.verifyManifest(manifest, {});
        assert.strictEqual(check.result, 'PACK_SCHEMA_UNSUPPORTED');
    });

    await test('verifyManifest detects PACK_INCOMPLETE on missing required field', async () => {
        const check = await format.verifyManifest({ schemaVersion: format.SCHEMA_VERSION }, {});
        assert.strictEqual(check.result, 'PACK_INCOMPLETE');
    });

    await test('verifyManifest detects PACK_CORRUPTED on malformed/missing manifest', async () => {
        const check = await format.verifyManifest(null, {});
        assert.strictEqual(check.result, 'PACK_CORRUPTED');
    });

    await test('verifyIdentity detects PACK_IDENTITY_MISMATCH', async () => {
        const manifest = await format.buildManifest({ packId: 'pack-sw', languageCode: 'sw', records: {} });
        const check = format.verifyIdentity(manifest, 'fr');
        assert.strictEqual(check.result, 'PACK_IDENTITY_MISMATCH');
        assert.strictEqual(check.expected, 'fr');
        assert.strictEqual(check.actual, 'sw');
    });

    await test('verifyIdentity PASSES on matching language', async () => {
        const manifest = await format.buildManifest({ packId: 'pack-sw', languageCode: 'sw', records: {} });
        const check = format.verifyIdentity(manifest, 'sw');
        assert.strictEqual(check.result, 'PACK_VERIFIED');
    });

    await test('packFileName produces a stable, identifiable name', async () => {
        const manifest = await format.buildManifest({ packId: 'pack-sw', languageCode: 'sw', version: '1.2.3', records: {} });
        assert.strictEqual(format.packFileName(manifest), 'CozyOS-LanguagePack-pack-sw-sw-v1.2.3.json');
    });

    await test('PACK_STATES exactly matches cozy-language-pack-registry.js PACK_STATES', async () => {
        assert.deepStrictEqual(format.PACK_STATES, [
            'REGISTERED', 'NOT_READY', 'PARTIAL', 'COMMUNITY_BUILDING', 'VALIDATING', 'AVAILABLE', 'DEPRECATED'
        ]);
    });

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exitCode = failed > 0 ? 1 : 0;
})();
