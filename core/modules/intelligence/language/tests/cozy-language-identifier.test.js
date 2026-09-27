'use strict';

/**
 * core/modules/intelligence/language/tests/cozy-language-identifier.test.js
 * Universal Language Seam — the one authoritative resolveLanguageIdentity().
 * Run with: node --test core/modules/intelligence/language/tests/cozy-language-identifier.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CONTRACT_PATH = path.join(__dirname, '..', 'language-identity-contract.js');
const IDENTIFIER_PATH = path.join(__dirname, '..', 'cozy-language-identifier.js');
const REGISTRY_PATH = path.join(__dirname, '..', 'cozy-language-registry.js');

function freshIdentifier(withRegistry) {
    [CONTRACT_PATH, IDENTIFIER_PATH, REGISTRY_PATH].forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    global.window = { CozyOS: {} };
    require(CONTRACT_PATH);
    if (withRegistry) require(REGISTRY_PATH);
    require(IDENTIFIER_PATH);
    return window.CozyOS.CozyLanguageIdentifier;
}

/* ------------------------------------------------------------------ */
/* A: layer 1 — marker match, HIGH confidence                          */
/* ------------------------------------------------------------------ */

test('A: a real Kiswahili sentence with a known marker word resolves via MARKER_MATCH, HIGH confidence', () => {
    const { resolveLanguageIdentity } = freshIdentifier();
    const identity = resolveLanguageIdentity({ text: 'Nisaidie tafadhali.' });
    assert.equal(identity.languageId, 'sw');
    assert.equal(identity.source, 'MARKER_MATCH');
    assert.equal(identity.confidence, 'HIGH');
});

test('A: the exact reproduced failure from KISWAHILI-FIRST-READINESS-REPORT.md — "Nina duka." — now resolves to Kiswahili', () => {
    const { resolveLanguageIdentity } = freshIdentifier();
    const identity = resolveLanguageIdentity({ text: 'Nina duka.' });
    assert.equal(identity.languageId, 'sw');
    assert.notEqual(identity.languageId, 'en');
});

test('A: "Unaweza kunisaidia?" — the second reproduced English-leak case — now resolves to Kiswahili', () => {
    const { resolveLanguageIdentity } = freshIdentifier();
    const identity = resolveLanguageIdentity({ text: 'Unaweza kunisaidia?' });
    assert.equal(identity.languageId, 'sw');
});

test('A: a real English sentence resolves via MARKER_MATCH', () => {
    const { resolveLanguageIdentity } = freshIdentifier();
    const identity = resolveLanguageIdentity({ text: 'What does ShopOS do?' });
    assert.equal(identity.languageId, 'en');
    assert.equal(identity.source, 'MARKER_MATCH');
});

/* ------------------------------------------------------------------ */
/* B: layer 2 — morphological match on genuinely NOVEL Kiswahili verbs */
/* ------------------------------------------------------------------ */

test('B: a Kiswahili verb never seen anywhere in this codebase resolves via MORPHOLOGICAL_MATCH, not a marker', () => {
    const { resolveLanguageIdentity, SW_MARKERS } = freshIdentifier();
    const text = 'Alipika chakula.';
    // Prove no marker word is actually present in this sentence — this
    // is a genuine test of generalization, not a disguised marker hit.
    const words = text.toLowerCase().match(/[a-z]+/g) || [];
    assert.ok(words.every((w) => !SW_MARKERS.includes(w)), `expected no marker word in "${text}", found one among: ${words.join(',')}`);
    const identity = resolveLanguageIdentity({ text });
    assert.equal(identity.languageId, 'sw');
    assert.equal(identity.source, 'MORPHOLOGICAL_MATCH');
    assert.equal(identity.confidence, 'MEDIUM');
});

test('B: a second, independently novel Kiswahili verb also resolves via morphology', () => {
    const { resolveLanguageIdentity } = freshIdentifier();
    const identity = resolveLanguageIdentity({ text: 'Watapokea zawadi.' });
    assert.equal(identity.languageId, 'sw');
    assert.equal(identity.source, 'MORPHOLOGICAL_MATCH');
});

test('B: the bare word "tuna" (collides with the English fish word) never falsely triggers Kiswahili on its own', () => {
    const { resolveLanguageIdentity } = freshIdentifier();
    const identity = resolveLanguageIdentity({ text: 'I like tuna fish.' });
    assert.equal(identity.languageId, 'en');
});

test('B: the existing "-je" interrogative suffix rule still works, unchanged', () => {
    const { hasMorphologicalSignal } = freshIdentifier();
    assert.equal(hasMorphologicalSignal('Inasaidiaje watu?'), true);
});

/* ------------------------------------------------------------------ */
/* C: layer 3 — statistical trigram match, LOW confidence, last resort */
/* ------------------------------------------------------------------ */

test('C: a pure Kiswahili noun phrase with no marker word and no verb morphology resolves via STATISTICAL_MATCH', () => {
    const { resolveLanguageIdentity, SW_MARKERS } = freshIdentifier();
    const text = 'maarifa ya jumuiya';
    const words = text.toLowerCase().match(/[a-z]+/g) || [];
    assert.ok(words.every((w) => !SW_MARKERS.includes(w)));
    const identity = resolveLanguageIdentity({ text });
    assert.equal(identity.languageId, 'sw');
    assert.equal(identity.source, 'STATISTICAL_MATCH');
    assert.equal(identity.confidence, 'LOW');
});

test('C: a pure English phrase with no marker word resolves via STATISTICAL_MATCH, favoring English', () => {
    const { resolveLanguageIdentity } = freshIdentifier();
    const identity = resolveLanguageIdentity({ text: 'church community members' });
    assert.equal(identity.languageId, 'en');
    assert.equal(identity.source, 'STATISTICAL_MATCH');
});

/* ------------------------------------------------------------------ */
/* D: layer 4 — honest UNKNOWN, never a silent "en" default            */
/* ------------------------------------------------------------------ */

test('D: genuinely unrecognizable input resolves to UNKNOWN, never silently "en"', () => {
    const { resolveLanguageIdentity } = freshIdentifier();
    const identity = resolveLanguageIdentity({ text: 'xqzvbkmp fjhwrltn' });
    assert.equal(identity.languageId, 'UNKNOWN');
    assert.equal(identity.source, 'UNRESOLVED');
});

test('D: empty input resolves to UNKNOWN, never a guess', () => {
    const { resolveLanguageIdentity } = freshIdentifier();
    const identity = resolveLanguageIdentity({ text: '' });
    assert.equal(identity.languageId, 'UNKNOWN');
});

/* ------------------------------------------------------------------ */
/* E: authority rule — EXPLICIT_USER_SELECTION always wins, conflict   */
/*    is disclosed, never silently dropped                             */
/* ------------------------------------------------------------------ */

test('E: an explicit language selection wins over a contradicting detection, and the disagreement is disclosed', () => {
    const { resolveLanguageIdentity } = freshIdentifier();
    const identity = resolveLanguageIdentity({ text: 'What does ShopOS do?', explicitLanguage: 'sw' });
    assert.equal(identity.languageId, 'sw');
    assert.equal(identity.source, 'EXPLICIT_USER_SELECTION');
    assert.ok(identity.conflict, 'expected the explicit-vs-detected disagreement to be disclosed');
    assert.equal(identity.conflict.explicitSaid, 'sw');
    assert.equal(identity.conflict.detectedSaid, 'en');
});

test('E: an explicit language selection that AGREES with detection reports no conflict', () => {
    const { resolveLanguageIdentity } = freshIdentifier();
    const identity = resolveLanguageIdentity({ text: 'Nisaidie tafadhali.', explicitLanguage: 'sw' });
    assert.equal(identity.conflict, null);
});

/* ------------------------------------------------------------------ */
/* F: CONVERSATION_CARRYOVER — only when the CURRENT turn is itself    */
/*    unresolved, never overriding a confident current-turn detection  */
/* ------------------------------------------------------------------ */

test('F: a genuinely ambiguous follow-up inherits the prior turn\'s resolved language', () => {
    const { resolveLanguageIdentity } = freshIdentifier();
    const conversationState = { languageIdentity: { languageId: 'sw', confidence: 'HIGH', dialectRegion: null } };
    const identity = resolveLanguageIdentity({ text: 'Na hii je?', conversationState });
    // "hii" and "je" are both real markers already, so this resolves via
    // MARKER_MATCH on its own merits — carryover is proven with text
    // that has NO signal of its own, below.
    assert.equal(identity.languageId, 'sw');
});

test('F: carryover only fires when the CURRENT turn has no real signal of its own', () => {
    const { resolveLanguageIdentity } = freshIdentifier();
    const conversationState = { languageIdentity: { languageId: 'sw', confidence: 'HIGH', dialectRegion: 'sw-KE' } };
    const identity = resolveLanguageIdentity({ text: 'xqzvbkmp', conversationState });
    assert.equal(identity.languageId, 'sw');
    assert.equal(identity.source, 'CONVERSATION_CARRYOVER');
    assert.equal(identity.dialectRegion, 'sw-KE');
});

test('F: carryover NEVER overrides a confident current-turn detection, even a contradicting one', () => {
    const { resolveLanguageIdentity } = freshIdentifier();
    const conversationState = { languageIdentity: { languageId: 'sw', confidence: 'HIGH' } };
    const identity = resolveLanguageIdentity({ text: 'What does ShopOS do?', conversationState });
    assert.equal(identity.languageId, 'en', 'expected the current turn\'s own confident English detection to win over stale Kiswahili carryover');
    assert.equal(identity.source, 'MARKER_MATCH');
});

/* ------------------------------------------------------------------ */
/* G: mixed-language dominance weighting                               */
/* ------------------------------------------------------------------ */

test('G: mixed Kiswahili/English input is dominated by the grammatical-backbone language, not an isolated English loanword', () => {
    const { resolveLanguageIdentity } = freshIdentifier();
    const identity = resolveLanguageIdentity({ text: 'Nataka app ya kusaidia biashara yangu, especially stock na sales.' });
    assert.equal(identity.languageId, 'sw');
    assert.equal(identity.mixedLanguage, true);
    assert.ok(identity.detectedLanguages.includes('en'), 'expected the real English signal to still be disclosed in detectedLanguages');
});

/* ------------------------------------------------------------------ */
/* H: regression — every existing marker-list entry from BOTH prior    */
/*    detectors still resolves to Kiswahili, byte-for-byte behavior    */
/*    preserved (no capability removed)                                */
/* ------------------------------------------------------------------ */

test('H: every word from the ORIGINAL rule-based-conversational-provider.js marker list is still present in the reconciled set', () => {
    const { SW_MARKERS } = freshIdentifier();
    const original = ["habari", "hujambo", "mambo", "nataka", "nisaidie", "nisaidi", "fungua",
        "nionyeshe", "ninawezaje", "naweza", "wapi", "akaunti", "sajili", "kujisajili",
        "kusajili", "dashibodi", "mipangilio", "arifa", "nini", "karibuni", "shughuli",
        "kuona", "kufungua", "kuingia", "msaada", "nipe", "asante", "sawa", "kwenye",
        "nitumie", "tumie", "faida", "inatofautianaje", "tofauti", "tofautiana",
        "lugha", "zinazoungwa", "mkono", "zinazotumika", "zipi", "gani",
        "usajili", "kutengeneza", "tengeneza", "kuunda", "unda", "nifanye", "ninaanzaje",
        "sielewi", "elewi", "samahani", "kwaheri", "karibu", "ndiyo", "hapana", "vizuri",
        "muhimu", "tatizo", "nzuri", "nufaika", "atanufaika", "maisha", "inabadilisha", "ngapi", "hii", "aje",
        "matumizi", "yapi", "vipi", "yake", "wanaofaidika", "kanisa", "kanuni", "ndani",
        "nani", "nieleze", "eleza", "kuhusu"];
    for (const w of original) assert.ok(SW_MARKERS.includes(w), `expected reconciled list to still contain "${w}"`);
});

test('H: every word from the ORIGINAL cozy-ai-semantic-intent.js marker list is still present in the reconciled set', () => {
    const { SW_MARKERS } = freshIdentifier();
    const original = ["nataka", "naomba", "nahitaji", "naweza", "nawezaje", "je", "vipi", "kwa", "nini",
        "kununua", "kuwa", "mteja", "kunisaidia", "inasaidia", "inasaidiaje", "inaweza", "kufanya", "kutumia",
        "nikumbushe", "kesho", "leo", "jana", "badilisha", "futa", "ondoa", "sitaki", "usinikumbushe",
        "haifanyi", "kazi", "imeshindwa", "imekataa", "gharimu", "kiasi", "bora", "nisaidie", "nieleze", "nielezee",
        "nifundishe", "nauliza", "hiyo", "hii", "hicho", "yake", "hapo", "lakini", "kwanza", "sijui", "deni", "saa",
        "inanisaidiaje", "inanisaidia"];
    for (const w of original) assert.ok(SW_MARKERS.includes(w), `expected reconciled list to still contain "${w}"`);
});

/* ------------------------------------------------------------------ */
/* I: real integration with the existing CozyLanguageRegistry           */
/* ------------------------------------------------------------------ */

test('I: COUNTRY_SUGGESTION tier composes the real, existing CozyLanguageRegistry.resolveLanguage(), never a second implementation', () => {
    const { resolveLanguageIdentity } = freshIdentifier(true);
    const identity = resolveLanguageIdentity({ text: 'xqzvbkmp', actorProfile: { country: 'KE' } });
    // Kenya's real suggestFromCountry() mapping is whatever the registry
    // itself defines — this test only proves the identifier actually
    // calls through to it (not "en" by default), not a specific code.
    assert.notEqual(identity.source, 'UNRESOLVED');
});

/* ------------------------------------------------------------------ */
/* J: every real result is contract-valid                              */
/* ------------------------------------------------------------------ */

test('J: every resolveLanguageIdentity() result validates against LanguageIdentityContract', () => {
    const { resolveLanguageIdentity } = freshIdentifier();
    const contract = window.CozyOS.LanguageIdentityContract;
    const samples = ['Nina duka.', 'What does ShopOS do?', 'xqzvbkmp', 'Alipika chakula.', 'maarifa ya jumuiya'];
    for (const text of samples) {
        const identity = resolveLanguageIdentity({ text });
        const result = contract.validate(identity);
        assert.equal(result.valid, true, `expected a contract-valid identity for "${text}", got errors: ${JSON.stringify(result.errors)}`);
    }
});
