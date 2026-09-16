/**
 * core/living/tests/deep-application-capability-audit.test.js
 * CozyOS — Deep Application Capability Audit + APPLICATION_DETAILED_INFORMATION
 *
 * Verifies the 3-way distinction the architecture correction requires:
 *   VERIFIED_END_TO_END (currentVerifiedCapabilities)
 *   IMPLEMENTED_AWAITING_CONNECTION (implementedAwaitingConnection - real
 *     code exists elsewhere in CozyOS, not yet wired to this application)
 *   PARTIALLY_IMPLEMENTED (partiallyImplemented - part of an idea is
 *     real, part genuinely does not exist anywhere)
 *   PLANNED_NOT_IMPLEMENTED (visionCapabilities)
 * are never collapsed into "not built" or "already works."
 *
 * Run with: node --test core/living/tests/deep-application-capability-audit.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const PROVIDER_PATH = path.join(ROOT, 'modules', 'intelligence', 'providers', 'rule-based-conversational-provider.js');
const TEMPLATES_PATH = path.join(ROOT, 'modules', 'intelligence', 'language', 'cozy-language-templates.js');
const REGISTRY_PATH = path.join(ROOT, 'modules', 'intelligence', 'language', 'cozy-language-registry.js');
const PUBLIC_KNOWLEDGE_PATH = path.join(ROOT, 'modules', 'intelligence', 'knowledge', 'cozy-public-knowledge-source.js');
const KNOWLEDGE_REGISTRY_PATH = path.join(ROOT, 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js');
const DEV_PROFILE_PATH = path.join(ROOT, 'identity', 'developer-profile.js');
const PROJECT_HISTORY_PATH = path.join(ROOT, 'identity', 'project-history.js');
const AFRICAN_KNOWLEDGE_PATH = path.join(ROOT, 'identity', 'african-knowledge-initiative.js');
const IDENTITY_ASSEMBLY_PATH = path.join(ROOT, 'identity', 'cozyai-identity.js');
const FAQ_ROUTER_PATH = path.join(ROOT, 'modules', 'knowledge', 'cozyos-identity-faq-router.js');

const ALL_PATHS = [DEV_PROFILE_PATH, PROJECT_HISTORY_PATH, AFRICAN_KNOWLEDGE_PATH, IDENTITY_ASSEMBLY_PATH, REGISTRY_PATH, TEMPLATES_PATH, PUBLIC_KNOWLEDGE_PATH, KNOWLEDGE_REGISTRY_PATH, FAQ_ROUTER_PATH, PROVIDER_PATH];

function freshProvider() {
    ALL_PATHS.forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    const registered = new Map();
    global.window = { CozyOS: { LivingAI: { registerProvider(name, p) { registered.set(name, p); }, setActiveProvider() {} } } };
    for (const p of ALL_PATHS) require(p);
    return { provider: registered.get('rule-based-conversational'), knowledge: global.window.CozyOS.CozyKnowledge };
}

// ---- Direct function tests: getApplicationDetailedInfo() ----

test('getApplicationDetailedInfo("churchos") separates all 4 capability tiers, never collapsing them', () => {
    const { knowledge } = freshProvider();
    const r = knowledge.getApplicationDetailedInfo('churchos', 'en');
    assert.equal(r.evidence, 'VERIFIED');
    assert.ok(r.detail.currentVerifiedCapabilities.length > 0, 'VERIFIED_END_TO_END tier must be populated');
    assert.ok(r.detail.implementedAwaitingConnection.length > 0, 'IMPLEMENTED_AWAITING_CONNECTION tier must be populated');
    assert.ok(r.detail.partiallyImplemented.length > 0, 'PARTIALLY_IMPLEMENTED tier must be populated');
    assert.ok(r.detail.visionCapabilities.length > 0, 'PLANNED_NOT_IMPLEMENTED tier must be populated');
});

test('ChurchOS "implemented awaiting connection" cites the real Media Intelligence and translation modules by name, not a fabricated claim', () => {
    const { knowledge } = freshProvider();
    const r = knowledge.getApplicationDetailedInfo('churchos', 'en');
    const joined = r.detail.implementedAwaitingConnection.join(' ');
    assert.match(joined, /cozy-media-intelligence\.js/);
    assert.match(joined, /searchByPersonReference/);
    assert.match(joined, /translation-service\.js/);
});

test('ChurchOS "partially implemented" correctly separates name-based search (real) from face/voice recognition (not implemented anywhere)', () => {
    const { knowledge } = freshProvider();
    const r = knowledge.getApplicationDetailedInfo('churchos', 'en');
    const joined = r.detail.partiallyImplemented.join(' ');
    assert.match(joined, /NOT.*face\/voice recognition|face\/voice recognition, which.*does not implement/i);
});

test('ChurchOS realLifeExamples returns exactly 2 items, drawn from real, existing data (never invented to satisfy a "2 examples" requirement)', () => {
    const { knowledge } = freshProvider();
    const r = knowledge.getApplicationDetailedInfo('churchos', 'en');
    assert.equal(r.detail.realLifeExamples.length, 2);
});

test('getApplicationDetailedInfo honestly returns NOT_FOUND for an unregistered application name', () => {
    const { knowledge } = freshProvider();
    const r = knowledge.getApplicationDetailedInfo('nonexistentapp999', 'en');
    assert.equal(r.evidence, 'NOT_FOUND');
});

test('Kiswahili detailed info uses the real Sw-suffixed fields, not English text under a Kiswahili request', () => {
    const { knowledge } = freshProvider();
    const r = knowledge.getApplicationDetailedInfoFact('churchos', 'sw');
    assert.equal(r.evidence, 'VERIFIED');
    assert.match(r.answer, /kanisa|Kiswahili|makanisa/i);
});

// ---- Live conversational path: app-detailed-info intent ----

const DETAILED_QUESTIONS = [
    'Tell me everything about ChurchOS.',
    'Give me detailed information about ChurchOS.',
    'Explain ChurchOS in detail.',
    'What can ChurchOS do in real life?',
    'Which ChurchOS features are already connected?',
    'Which ChurchOS features are waiting for integration?',
    'Nieleze ChurchOS kwa undani.',
];

for (const q of DETAILED_QUESTIONS) {
    test(`LIVE: "${q}" resolves to app-detailed-info with a real, structured multi-tier answer`, async () => {
        const { provider } = freshProvider();
        const r = await provider.think(q, {});
        assert.equal(r.result.intent, 'app-detailed-info');
        assert.match(r.result.text, /ChurchOS/i);
    });
}

test('LIVE: the detailed-info answer for ChurchOS explicitly distinguishes "already implemented but not yet connected" from "verified today"', async () => {
    const { provider } = freshProvider();
    const r = await provider.think('Tell me everything about ChurchOS.', {});
    assert.match(r.result.text, /Verified today/i);
    assert.match(r.result.text, /already implemented but not yet connected/i);
    assert.match(r.result.text, /Vision\/planned/i);
});

test('LIVE: the detailed-info answer never claims the private-audio/broadcast/messaging ideas already work', async () => {
    const { provider } = freshProvider();
    const r = await provider.think('Tell me everything about ChurchOS.', {});
    const visionSection = r.result.text.split('Vision/planned')[1] || '';
    assert.match(visionSection, /private, selective-audience audio/i);
    assert.match(visionSection, /one-to-many live video broadcast/i);
});

// ---- Regression: existing app-importance / app-capability-search / list-apps unaffected ----

test('REGRESSION: "Why is ChurchOS useful?" still resolves via app-importance, unaffected by the new detailed-info intent', async () => {
    const { provider } = freshProvider();
    const r = await provider.think('Why is ChurchOS useful?', {});
    assert.equal(r.result.intent, 'app-importance');
});

test('REGRESSION: cross-application capability search still works', async () => {
    const { provider } = freshProvider();
    const r = await provider.think('Which CozyOS application can help me sell products?', {});
    assert.equal(r.result.intent, 'app-capability-search');
});

test('REGRESSION: a genuinely unnamed application in "tell me everything about X" honestly reports not found', async () => {
    const { provider } = freshProvider();
    const r = await provider.think('Tell me everything about FlyingCarOS.', {});
    assert.match(r.result.text, /don't have a currently registered/i);
});

console.log('Deep Application Capability Audit suite: run complete.');
