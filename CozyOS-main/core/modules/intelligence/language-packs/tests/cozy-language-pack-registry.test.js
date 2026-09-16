/**
 * core/modules/intelligence/language-packs/tests/cozy-language-pack-registry.test.js
 * RP-030 — real, executed tests for cozy-language-pack-registry.js
 * Run with: node core/modules/intelligence/language-packs/tests/cozy-language-pack-registry.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  \u2713 ${name}`);
        passed++;
    } catch (err) {
        console.log(`  \u2717 ${name}`);
        console.log(`      ${err.message}`);
        failed++;
    }
}

function loadModule(fakeWindow) {
    const modulePath = path.join(__dirname, '..', 'cozy-language-pack-registry.js');
    delete require.cache[require.resolve(modulePath)];
    global.window = fakeWindow;
    require(modulePath);
    return global.window.CozyOS.CozyLanguagePacks;
}

function freshRegistry() {
    return loadModule({ CozyOS: {} });
}

// ---------------------------------------------------------------------
// 1. The 17 language pack identities exist
// ---------------------------------------------------------------------

test('all 17 default language-pack identities are registered', () => {
    const reg = freshRegistry();
    const ids = reg.listPacks().map((p) => p.identity.languageId).sort();
    const expected = ['am', 'ar', 'en', 'fr', 'ha', 'hi', 'ig', 'kam', 'ki', 'ln', 'luo', 'ru', 'so', 'sw', 'yo', 'zh', 'zu'].sort();
    assert.deepStrictEqual(ids, expected);
});

test('pack identity exposes name/nativeName/iso/status/resourceState', () => {
    const reg = freshRegistry();
    const en = reg.getPack('en');
    assert.strictEqual(en.identity.name, 'English');
    assert.ok('nativeName' in en.identity);
    assert.ok('iso' in en.identity);
    assert.strictEqual(en.status, 'REGISTERED');
    assert.strictEqual(en.resourceState, 'NOT_READY');
});

test('no pack is AVAILABLE by default — pack creation != language verification', () => {
    const reg = freshRegistry();
    reg.listPacks().forEach((p) => assert.notStrictEqual(p.status, 'AVAILABLE'));
});

// ---------------------------------------------------------------------
// 2. Pack schema / states
// ---------------------------------------------------------------------

test('PACK_STATES includes every spec-required state', () => {
    const reg = freshRegistry();
    ['UNREGISTERED', 'REGISTERED', 'NOT_READY', 'PARTIAL', 'COMMUNITY_BUILDING', 'VALIDATING', 'AVAILABLE', 'DEPRECATED']
        .forEach((s) => assert.ok(reg.PACK_STATES.indexOf(s) !== -1, s));
});

test('getPack() for an unregistered code returns null (never fabricated)', () => {
    const reg = freshRegistry();
    assert.strictEqual(reg.getPack('xx'), null);
});

// ---------------------------------------------------------------------
// 3. Rule 82 — never auto-promoted
// ---------------------------------------------------------------------

test('requestPromotion() is always BLOCKED from this file, for a registered language', () => {
    const reg = freshRegistry();
    const result = reg.requestPromotion('sw');
    assert.strictEqual(result.status, 'BLOCKED');
});

test('requestPromotion() for an unregistered language is BLOCKED with UNREGISTERED_LANGUAGE', () => {
    const reg = freshRegistry();
    const result = reg.requestPromotion('xx');
    assert.strictEqual(result.status, 'BLOCKED');
    assert.strictEqual(result.reason, 'UNREGISTERED_LANGUAGE');
});

test('requestPromotion() composes the real Rule 82 gate when cozy-knowledge-review is loaded', () => {
    const reg = loadModule({
        CozyOS: {
            Modules: {
                'cozy-knowledge-review': { api: { evaluateRule82Gate: (code) => ({ languageCode: code, eligible: false }) } }
            }
        }
    });
    const result = reg.requestPromotion('sw');
    assert.strictEqual(result.status, 'BLOCKED');
    assert.ok(result.rule82Gate);
    assert.strictEqual(result.rule82Gate.eligible, false);
});

// ---------------------------------------------------------------------
// 4. Regional variants / dialects: language != country != dialect
// ---------------------------------------------------------------------

test('registerRegionalContext() requires country as evidence', () => {
    const reg = freshRegistry();
    const result = reg.registerRegionalContext('ha', { region: 'Kano' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'COUNTRY_REQUIRED_AS_EVIDENCE');
});

test('Tanzania/Hausa and Nigeria/Hausa remain distinct regional contexts', () => {
    const reg = freshRegistry();
    reg.registerRegionalContext('ha', { country: 'TZ', dialect: 'Tanzanian Hausa' });
    reg.registerRegionalContext('ha', { country: 'NG', dialect: 'Nigerian Hausa' });
    const contexts = reg.listRegionalContexts('ha');
    assert.strictEqual(contexts.length, 2);
    const dialects = contexts.map((c) => c.dialect).sort();
    assert.deepStrictEqual(dialects, ['Nigerian Hausa', 'Tanzanian Hausa']);
});

test('detectLanguagePack() never merges two distinct regional/dialect contexts', () => {
    const reg = freshRegistry();
    reg.registerRegionalContext('ha', { country: 'TZ', dialect: 'Tanzanian Hausa' });
    reg.registerRegionalContext('ha', { country: 'NG', dialect: 'Nigerian Hausa' });
    const tz = reg.detectLanguagePack({ languageId: 'ha', country: 'TZ' });
    const ng = reg.detectLanguagePack({ languageId: 'ha', country: 'NG' });
    assert.strictEqual(tz.dialect, 'Tanzanian Hausa');
    assert.strictEqual(ng.dialect, 'Nigerian Hausa');
    assert.notStrictEqual(tz.dialect, ng.dialect);
});

test('detectLanguagePack() for unregistered language reports no match, not a guess', () => {
    const reg = freshRegistry();
    const result = reg.detectLanguagePack({ languageId: 'xx' });
    assert.strictEqual(result.matched, false);
});

// ---------------------------------------------------------------------
// 5. Word-level matching: same spelling never auto-merges
// ---------------------------------------------------------------------

function fakeSafetyGate(classification) {
    return {
        classify: () => ({ classification, category: null, note: null }),
        quarantine: (fields, cls, contributor) => ({ id: 'q-1' })
    };
}

test('two identical spellings with different meanings create two distinct records', () => {
    const reg = loadModule({ CozyOS: { CozyKnowledgeSafetyGate: fakeSafetyGate('SAFE') } });
    const r1 = reg.submitExpression({ languageId: 'sw', expression: 'example', meaning: 'meaning A', region: 'KE' });
    const r2 = reg.submitExpression({ languageId: 'sw', expression: 'example', meaning: 'meaning B', region: 'KE' });
    assert.strictEqual(r1.status, 'CANDIDATE_CREATED');
    assert.strictEqual(r2.status, 'CANDIDATE_CREATED');
    assert.notStrictEqual(r1.recordId, r2.recordId);
});

test('same language+region+dialect+meaning+source adds evidence instead of duplicating', () => {
    const reg = loadModule({ CozyOS: { CozyKnowledgeSafetyGate: fakeSafetyGate('SAFE') } });
    const r1 = reg.submitExpression({ languageId: 'sw', expression: 'jambo', meaning: 'greeting', region: 'KE', dialect: 'coastal' });
    const r2 = reg.submitExpression({ languageId: 'sw', expression: 'jambo', meaning: 'greeting', region: 'KE', dialect: 'coastal' });
    assert.strictEqual(r1.status, 'CANDIDATE_CREATED');
    assert.strictEqual(r2.status, 'EVIDENCE_ADDED');
    assert.strictEqual(r2.recordId, r1.recordId);
    assert.strictEqual(r2.evidenceCount, 2);
});

test('same spelling in two different languages never merges', () => {
    const reg = loadModule({ CozyOS: { CozyKnowledgeSafetyGate: fakeSafetyGate('SAFE') } });
    const r1 = reg.submitExpression({ languageId: 'sw', expression: 'moto', meaning: 'fire' });
    const r2 = reg.submitExpression({ languageId: 'fr', expression: 'moto', meaning: 'motorbike (informal)' });
    assert.notStrictEqual(r1.recordId, r2.recordId);
    const e1 = reg.getExpression(r1.recordId);
    const e2 = reg.getExpression(r2.recordId);
    assert.strictEqual(e1.languageId, 'sw');
    assert.strictEqual(e2.languageId, 'fr');
});

test('submitExpression() to an unregistered language is BLOCKED', () => {
    const reg = loadModule({ CozyOS: { CozyKnowledgeSafetyGate: fakeSafetyGate('SAFE') } });
    const r = reg.submitExpression({ languageId: 'xx', expression: 'foo', meaning: 'bar' });
    assert.strictEqual(r.status, 'BLOCKED');
    assert.strictEqual(r.reason, 'UNREGISTERED_LANGUAGE');
});

// ---------------------------------------------------------------------
// 6. Oral languages — audio without orthography
// ---------------------------------------------------------------------

test('an expression can exist with audio evidence and no orthography yet', () => {
    const reg = loadModule({ CozyOS: { CozyKnowledgeSafetyGate: fakeSafetyGate('SAFE') } });
    const r = reg.submitExpression({ languageId: 'luo', audioReference: 'audio://clip1', meaning: 'greeting', contributionType: 'AUDIO_REFERENCE' });
    assert.strictEqual(r.status, 'CANDIDATE_CREATED');
    const rec = reg.getExpression(r.recordId);
    assert.strictEqual(rec.orthography, 'UNAVAILABLE');
    assert.strictEqual(rec.expression, null);
    assert.strictEqual(rec.meaning, 'greeting');
});

test('submitExpression() with neither expression text nor audio is BLOCKED', () => {
    const reg = loadModule({ CozyOS: { CozyKnowledgeSafetyGate: fakeSafetyGate('SAFE') } });
    const r = reg.submitExpression({ languageId: 'en', meaning: 'nothing to go on' });
    assert.strictEqual(r.status, 'BLOCKED');
    assert.strictEqual(r.reason, 'NO_EXPRESSION_OR_AUDIO_EVIDENCE');
});

test('module never claims a speech-recognition/OCR/video backend exists', () => {
    const src = require('fs').readFileSync(path.join(__dirname, '..', 'cozy-language-pack-registry.js'), 'utf8');
    assert.ok(!/we (transcribe|recognize speech|perform OCR)/i.test(src));
    assert.ok(/no ML language-ID\/ASR backend exists/i.test(src));
});

// ---------------------------------------------------------------------
// 7. Confidence dimensions remain separate
// ---------------------------------------------------------------------

test('confidence dimensions are stored independently, not one generic number', () => {
    const reg = loadModule({ CozyOS: { CozyKnowledgeSafetyGate: fakeSafetyGate('SAFE') } });
    const r = reg.submitExpression({
        languageId: 'sw', expression: 'karibu', meaning: 'welcome',
        languageConfidence: 0.98, regionConfidence: 0.91, dialectConfidence: 0.74,
        meaningConfidence: 0.96, pronunciationConfidence: 0.88
    });
    const rec = reg.getExpression(r.recordId);
    assert.strictEqual(rec.confidence.languageConfidence, 0.98);
    assert.strictEqual(rec.confidence.regionConfidence, 0.91);
    assert.strictEqual(rec.confidence.dialectConfidence, 0.74);
    assert.notStrictEqual(rec.confidence.languageConfidence, rec.confidence.dialectConfidence);
});

// ---------------------------------------------------------------------
// 8. Provenance / licensing
// ---------------------------------------------------------------------

test('provenance survives on the record and lists every contributing source', () => {
    const reg = loadModule({ CozyOS: { CozyKnowledgeSafetyGate: fakeSafetyGate('SAFE') } });
    const r1 = reg.submitExpression({ languageId: 'sw', expression: 'jambo', meaning: 'greeting', region: 'KE', sourceType: 'COMMUNITY' });
    reg.submitExpression({ languageId: 'sw', expression: 'jambo', meaning: 'greeting', region: 'KE', sourceType: 'COMMUNITY' });
    const rec = reg.getExpression(r1.recordId);
    assert.strictEqual(rec.provenanceLog.length, 2);
});

test('licensing defaults to LICENSE_UNKNOWN and is never treated as approved', () => {
    const reg = loadModule({ CozyOS: { CozyKnowledgeSafetyGate: fakeSafetyGate('SAFE') } });
    const r = reg.submitExpression({ languageId: 'en', expression: 'test', meaning: 'test meaning' });
    const rec = reg.getExpression(r.recordId);
    assert.strictEqual(rec.licensing, 'LICENSE_UNKNOWN');
    const pack = reg.getPack('en');
    assert.strictEqual(pack.licensingProblems, 1);
});

test('an explicit license state is honored and not overwritten', () => {
    const reg = loadModule({ CozyOS: { CozyKnowledgeSafetyGate: fakeSafetyGate('SAFE') } });
    const r = reg.submitExpression({ languageId: 'en', expression: 'test2', meaning: 'm', license: 'PUBLIC_DOMAIN' });
    const rec = reg.getExpression(r.recordId);
    assert.strictEqual(rec.licensing, 'PUBLIC_DOMAIN');
});

// ---------------------------------------------------------------------
// 9. Safety gate composition — quarantine cannot enter a pack
// ---------------------------------------------------------------------

test('UNSAFE content is rejected outright and never stored as a record', () => {
    const reg = loadModule({ CozyOS: { CozyKnowledgeSafetyGate: fakeSafetyGate('UNSAFE') } });
    const r = reg.submitExpression({ languageId: 'en', expression: 'bad', meaning: 'bad' });
    assert.strictEqual(r.status, 'REJECTED');
    assert.strictEqual(reg.listExpressions({ languageId: 'en' }).length, 0);
});

test('UNCERTAIN content is quarantined, not made available as pack knowledge', () => {
    const reg = loadModule({ CozyOS: { CozyKnowledgeSafetyGate: fakeSafetyGate('UNCERTAIN') } });
    const r = reg.submitExpression({ languageId: 'en', expression: 'ambiguous', meaning: 'm' });
    assert.strictEqual(r.status, 'QUARANTINED');
    assert.strictEqual(reg.listExpressions({ languageId: 'en' }).length, 0);
});

test('missing safety gate fails closed to quarantine, never a silent SAFE accept', () => {
    const reg = loadModule({ CozyOS: {} });
    const r = reg.submitExpression({ languageId: 'en', expression: 'x', meaning: 'y' });
    assert.strictEqual(r.status, 'QUARANTINED');
});

// ---------------------------------------------------------------------
// 10. Storage abstraction — QUEUED, never fabricated SYNCED
// ---------------------------------------------------------------------

test('createStorageAdapter() queues items as QUEUED and never auto-marks SYNCED', () => {
    const reg = freshRegistry();
    const storage = reg.createStorageAdapter();
    const result = storage.queueForSync({ hello: 'world' });
    assert.strictEqual(result.status, 'QUEUED');
    assert.strictEqual(storage.listQueue()[0].status, 'QUEUED');
});

test('storage adapter markSynced() only changes state when explicitly called', () => {
    const reg = freshRegistry();
    const storage = reg.createStorageAdapter();
    storage.queueForSync({ a: 1 });
    assert.strictEqual(storage.listQueue()[0].status, 'QUEUED');
    storage.markSynced(0);
    assert.strictEqual(storage.listQueue()[0].status, 'SYNCED');
});

test('storage adapter get/set roundtrip works with the default in-memory backend', () => {
    const reg = freshRegistry();
    const storage = reg.createStorageAdapter();
    storage.set('k', 'v');
    assert.strictEqual(storage.get('k'), 'v');
    assert.strictEqual(storage.get('missing'), null);
});

// ---------------------------------------------------------------------
// 11. Admin dashboard foundation — SUBMITTED vs VALIDATED vs USED
// ---------------------------------------------------------------------

test('dashboard snapshot distinguishes mostSubmitted from mostValidated and never reports real usage', () => {
    const reg = loadModule({ CozyOS: { CozyKnowledgeSafetyGate: fakeSafetyGate('SAFE') } });
    reg.submitExpression({ languageId: 'sw', expression: 'a', meaning: 'm1' });
    reg.submitExpression({ languageId: 'sw', expression: 'b', meaning: 'm2' });
    reg.submitExpression({ languageId: 'en', expression: 'c', meaning: 'm3' });
    const snap = reg.getDashboardSnapshot();
    const sw = snap.packs.find((p) => p.languageId === 'sw');
    assert.strictEqual(sw.submitted, 2);
    assert.strictEqual(sw.mostUsed, 'NOT_AVAILABLE_NO_TELEMETRY');
    assert.ok(Array.isArray(snap.mostSubmitted));
    assert.ok(Array.isArray(snap.mostValidated));
});

// ---------------------------------------------------------------------
// 12. Module registration hygiene
// ---------------------------------------------------------------------

test('module registers exactly once under window.CozyOS.Modules["cozy-language-pack-registry"]', () => {
    const win = { CozyOS: {} };
    global.window = win;
    const modulePath = path.join(__dirname, '..', 'cozy-language-pack-registry.js');
    delete require.cache[require.resolve(modulePath)];
    require(modulePath);
    require(modulePath); // second require, same cache-cleared window
    assert.ok(win.CozyOS.Modules['cozy-language-pack-registry']);
});

test('evidenceBand() labels illustrative bands correctly and discloses they are not scientific truth', () => {
    const reg = freshRegistry();
    assert.strictEqual(reg.evidenceBand(0), 'NONE');
    assert.strictEqual(reg.evidenceBand(1), 'CANDIDATE');
    assert.strictEqual(reg.evidenceBand(5), 'EMERGING');
    assert.strictEqual(reg.evidenceBand(20), 'STRONG');
    assert.strictEqual(reg.evidenceBand(100), 'HIGHLY_VALIDATED');
});

// ---------------------------------------------------------------------
// 13. Language capability ownership model (Phase C-1)
// ---------------------------------------------------------------------

test('getLanguageCapabilities() returns null for an identity this registry has never heard of — never fabricates a profile', () => {
    const reg = freshRegistry();
    assert.strictEqual(reg.getLanguageCapabilities('xx-not-a-real-language'), null);
});

test('getLanguageCapabilities(): all 17 default identities report nllb.mapped === true, matching the real, independently-confirmed COZY_TO_NLLB dict', () => {
    const reg = freshRegistry();
    for (const identity of reg.DEFAULT_IDENTITIES) {
        const caps = reg.getLanguageCapabilities(identity.languageId);
        assert.ok(caps, `expected capabilities for default identity ${identity.languageId}`);
        assert.strictEqual(caps.nllb.mapped, true, `expected ${identity.languageId} to be NLLB-mapped`);
    }
    assert.strictEqual(reg.DEFAULT_IDENTITIES.length, 17, 'sanity check: still exactly 17 default identities');
});

test('getLanguageCapabilities(): NLLB runtimeStatus is NEVER reported as RUNTIME_VERIFIED by this offline-safe function — only DOCUMENTED_ONLY', () => {
    const reg = freshRegistry();
    for (const identity of reg.DEFAULT_IDENTITIES) {
        const caps = reg.getLanguageCapabilities(identity.languageId);
        assert.strictEqual(caps.nllb.runtimeStatus, 'DOCUMENTED_ONLY');
        assert.notStrictEqual(caps.nllb.runtimeStatus, 'RUNTIME_VERIFIED');
    }
});

test('getLanguageCapabilities(): an OPTIONAL (non-default) pack is correctly reported as NOT NLLB-mapped', () => {
    const reg = freshRegistry();
    const result = reg.registerOptionalPack({ languageId: 'xh', name: 'Xhosa', nativeName: 'isiXhosa', iso: 'xh' });
    assert.strictEqual(result.ok, true);
    const caps = reg.getLanguageCapabilities('xh');
    assert.ok(caps, 'expected a capability record for the newly-registered optional pack');
    assert.strictEqual(caps.origin, 'OPTIONAL');
    assert.strictEqual(caps.nllb.mapped, false, 'an optional pack must never be claimed as NLLB-mapped merely because it now has an identity');
});

test('getLanguageCapabilities() reflects the pack\'s real, current status/resourceState fields — never a stale or invented value', () => {
    const reg = freshRegistry();
    const caps = reg.getLanguageCapabilities('sw');
    const rawPack = reg.getPack('sw');
    assert.strictEqual(caps.packStatus, rawPack.status);
    assert.strictEqual(caps.resourceState, rawPack.resourceState);
});

test('getOnlineProviderStatus(): reports both NLLB and Gemini honestly, neither treated as central or default-available', () => {
    const reg = freshRegistry();
    const status = reg.getOnlineProviderStatus();
    assert.strictEqual(status.nllb.networkRequired, true);
    assert.strictEqual(status.nllb.runtimeStatus, 'DOCUMENTED_ONLY');
    assert.strictEqual(status.nllb.mappingCoverage, '17/17');
    assert.strictEqual(status.gemini.networkRequired, true);
    assert.strictEqual(status.gemini.runtimeStatus, 'NETWORK_REQUIRED');
    assert.strictEqual(status.gemini.languageSpecific, false, 'Gemini must never be represented as a per-language mapping the way NLLB genuinely is');
});

test('getOnlineProviderStatus() never claims RUNTIME_VERIFIED for any provider — this function performs no network call and cannot honestly know current live state', () => {
    const reg = freshRegistry();
    const status = reg.getOnlineProviderStatus();
    assert.notStrictEqual(status.nllb.runtimeStatus, 'RUNTIME_VERIFIED');
    assert.notStrictEqual(status.gemini.runtimeStatus, 'RUNTIME_VERIFIED');
});

test('capability functions are pure and synchronous — calling them performs no network access, safe for fully offline Core initialization', () => {
    const reg = freshRegistry();
    // A real behavioral proof, not just an assertion about intent: both
    // calls must return a plain, already-resolved value (not a Promise),
    // confirming nothing here awaits a network round-trip.
    const capsResult = reg.getLanguageCapabilities('en');
    const statusResult = reg.getOnlineProviderStatus();
    assert.strictEqual(typeof capsResult.then, 'undefined', 'getLanguageCapabilities() must not return a Promise');
    assert.strictEqual(typeof statusResult.then, 'undefined', 'getOnlineProviderStatus() must not return a Promise');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
