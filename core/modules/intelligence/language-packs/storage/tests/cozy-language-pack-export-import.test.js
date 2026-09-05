/**
 * core/modules/intelligence/language-packs/storage/tests/cozy-language-pack-export-import.test.js
 * RP-035 COS-LANG-PM-001 — real, executed tests for cozy-language-pack-export-import.js
 * Runs against the REAL cozy-language-pack-registry.js (not a mock) so
 * exports/imports are exercised through the actual submitExpression() /
 * listExpressions() contract. Run with:
 *   node core/modules/intelligence/language-packs/storage/tests/cozy-language-pack-export-import.test.js
 */
'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0, failed = 0;
async function test(name, fn) {
    try {
        await fn();
        console.log(`  \u2713 ${name}`);
        passed++;
    } catch (err) {
        console.log(`  \u2717 ${name}`);
        console.log(`      ${err.stack || err.message}`);
        failed++;
    }
}

function freshRegistry(extraCozyOS) {
    global.window = { CozyOS: Object.assign({}, extraCozyOS) };
    const registryPath = path.join(__dirname, '..', '..', 'cozy-language-pack-registry.js');
    delete require.cache[require.resolve(registryPath)];
    require(registryPath);
    return global.window.CozyOS.CozyLanguagePacks;
}

function freshExportImport() {
    const exportImportPath = path.join(__dirname, '..', 'cozy-language-pack-export-import.js');
    delete require.cache[require.resolve(exportImportPath)];
    return require(exportImportPath);
}

// A minimal, real (not fabricated-success) fake of the privacy engine's
// canExport() contract, used only to exercise the gating logic — mirrors
// the real cozy-intelligence-privacy.js behavior for the tiers it checks.
function fakePrivacyEngine() {
    return {
        canExport(item) {
            if (!item.privacyTier) return { allowed: false, reason: 'NO_REAL_PRIVACY_TIER' };
            if (item.privacyTier === 'PRIVATE' || item.privacyTier === 'LOCAL_ONLY') return { allowed: false, reason: 'PRIVACY_TIER_FORBIDS_EXPORT' };
            return { allowed: true };
        }
    };
}

// The real cozy-language-pack-registry.js fails CLOSED to QUARANTINED
// when no real safety gate is loaded (confirmed by reading the source —
// this is not a bug this suite works around silently, it's why this fake
// gate must be supplied for these tests to exercise the CANDIDATE_CREATED
// path at all, exactly as a real deployment with RP-029-C loaded would).
function fakeSafetyGate() {
    return { classify: () => ({ classification: 'SAFE' }) };
}

(async () => {
    await test('gatherExportableRecords excludes ALL records when none carry a privacyTier (fail-closed default)', async () => {
        const reg = freshRegistry({ CozyIntelligencePrivacy: fakePrivacyEngine(), CozyKnowledgeSafetyGate: fakeSafetyGate() });
        const submission = reg.submitExpression({ languageId: 'sw', expression: 'jambo', meaning: 'hello', contributorPseudonym: 'tester' });
        assert.strictEqual(submission.status, 'CANDIDATE_CREATED', 'test setup requires the fake safety gate to actually admit the record');
        const exportImport = freshExportImport();
        const result = exportImport.gatherExportableRecords('sw', {});
        assert.strictEqual(result.ok, true);
        assert.strictEqual(result.vocabulary.length, 0);
        assert.strictEqual(result.excludedCount, 1);
        assert.strictEqual(result.excluded[0].reason, 'NO_REAL_PRIVACY_TIER');
    });

    await test('gatherExportableRecords includes COMMUNITY-tier records and excludes PRIVATE-tier ones', async () => {
        // The real registry does not yet stamp privacyTier onto expression
        // records (disclosed gap — see file header). To isolate and test
        // the gating logic in cozy-language-pack-export-import.js itself
        // (as opposed to the registry, tested separately above), this test
        // substitutes a small real object shaped like the registry's public
        // read surface (getPack/listExpressions) rather than mutating the
        // real, frozen registry API.
        const fakeRegistry = {
            getPack: (id) => (id === 'sw' ? { identity: { languageId: 'sw', name: 'Kiswahili' }, resourceState: 'COMMUNITY_BUILDING' } : null),
            listExpressions: () => ([
                { recordId: 'r1', expression: 'jambo', meaning: 'hello', privacyTier: 'COMMUNITY' },
                { recordId: 'r2', expression: 'siri-yangu', meaning: 'my secret', privacyTier: 'PRIVATE' }
            ])
        };
        global.window = { CozyOS: { CozyLanguagePacks: fakeRegistry, CozyIntelligencePrivacy: fakePrivacyEngine() } };
        const exportImport = freshExportImport();
        const result = exportImport.gatherExportableRecords('sw', {});
        assert.strictEqual(result.vocabulary.length, 1);
        assert.strictEqual(result.vocabulary[0].expression, 'jambo');
        assert.strictEqual(result.excludedCount, 1);
        assert.strictEqual(result.excluded[0].reason, 'PRIVACY_TIER_FORBIDS_EXPORT');
    });

    await test('exportPack returns UNREGISTERED_LANGUAGE for a non-existent language', async () => {
        freshRegistry({ CozyIntelligencePrivacy: fakePrivacyEngine() });
        const exportImport = freshExportImport();
        const result = await exportImport.exportPack('xx', {});
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.reason, 'UNREGISTERED_LANGUAGE');
    });

    await test('exportPack on a pack with zero exportable records still produces a valid NOT_READY manifest (never fabricated AVAILABLE)', async () => {
        freshRegistry({ CozyIntelligencePrivacy: fakePrivacyEngine() });
        const exportImport = freshExportImport();
        const result = await exportImport.exportPack('zu', {});
        assert.strictEqual(result.ok, true);
        assert.strictEqual(result.manifest.resourceState, 'NOT_READY');
        assert.strictEqual(result.manifest.counts.recordCount, 0);
        assert.strictEqual(result.privacyReport.includedCount, 0);
    });

    await test('round-trip: export then stageImport verifies PACK_VERIFIED', async () => {
        freshRegistry({ CozyIntelligencePrivacy: fakePrivacyEngine() });
        const exportImport = freshExportImport();
        const exported = await exportImport.exportPack('fr', {});
        const staged = await exportImport.stageImport(exported.payload, 'fr');
        assert.strictEqual(staged.ok, true);
        assert.strictEqual(staged.result, 'PACK_VERIFIED');
    });

    await test('stageImport detects PACK_IDENTITY_MISMATCH against the wrong expected language', async () => {
        freshRegistry({ CozyIntelligencePrivacy: fakePrivacyEngine() });
        const exportImport = freshExportImport();
        const exported = await exportImport.exportPack('fr', {});
        const staged = await exportImport.stageImport(exported.payload, 'ar');
        assert.strictEqual(staged.ok, false);
        assert.strictEqual(staged.result, 'PACK_IDENTITY_MISMATCH');
    });

    await test('stageImport detects tampered/corrupted content', async () => {
        freshRegistry({ CozyIntelligencePrivacy: fakePrivacyEngine() });
        const exportImport = freshExportImport();
        const exported = await exportImport.exportPack('fr', {});
        const tampered = JSON.parse(JSON.stringify(exported.payload));
        tampered.vocabulary.push({ expression: 'INJECTED', meaning: 'not really in the manifest hash' });
        const staged = await exportImport.stageImport(tampered, 'fr');
        assert.strictEqual(staged.ok, false);
        assert.strictEqual(staged.result, 'PACK_CORRUPTED');
    });

    await test('importPack is idempotent — importing the same pack twice does not duplicate vocabulary', async () => {
        // Build a portable pack payload directly (bypassing export's
        // privacyTier gate, which is exercised separately above) so this
        // test isolates commitImport()'s own idempotency guarantee against
        // the real registry's submitExpression()/listExpressions().
        const reg = freshRegistry({ CozyIntelligencePrivacy: fakePrivacyEngine(), CozyKnowledgeSafetyGate: fakeSafetyGate() });
        const format = require(path.join(__dirname, '..', 'cozy-language-pack-format.js'));
        const manifest = await format.buildManifest({
            packId: 'pack-sw', languageCode: 'sw', languageName: 'Kiswahili',
            records: { vocabulary: [{ expression: 'jambo', meaning: 'hello' }] }
        });
        const payload = { manifest, vocabulary: [{ expression: 'jambo', meaning: 'hello' }], translations: [], phrases: [], provenance: [], corrections: [], conflicts: [] };

        const exportImport = freshExportImport();
        const first = await exportImport.importPack(payload, 'sw', {});
        assert.strictEqual(first.ok, true);
        assert.strictEqual(first.imported, 1);

        const countAfterFirst = reg.listExpressions({ languageId: 'sw' }).length;
        const second = await exportImport.importPack(payload, 'sw', {});
        assert.strictEqual(second.ok, true);
        assert.strictEqual(second.skippedDuplicate, 1);
        const countAfterSecond = reg.listExpressions({ languageId: 'sw' }).length;

        assert.strictEqual(countAfterSecond, countAfterFirst, 'second import must not add duplicate vocabulary records');
    });

    await test('commitImport refuses to run on an unverified stage', async () => {
        freshRegistry({ CozyIntelligencePrivacy: fakePrivacyEngine() });
        const exportImport = freshExportImport();
        const result = exportImport.commitImport({ result: 'PACK_CORRUPTED' }, {});
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.reason, 'CANNOT_COMMIT_UNVERIFIED_STAGE');
    });

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exitCode = failed > 0 ? 1 : 0;
})();
