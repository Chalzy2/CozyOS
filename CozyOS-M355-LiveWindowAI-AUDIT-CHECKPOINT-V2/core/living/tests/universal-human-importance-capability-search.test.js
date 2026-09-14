/**
 * core/living/tests/universal-human-importance-capability-search.test.js
 * Universal CozyOS Human-Importance Architecture — Cross-Application
 * Capability Discovery
 *
 * ARCHITECTURE: Application -> Capability Registry -> Human Importance
 * -> Central Knowledge -> Semantic Understanding -> Assistance AI.
 *
 * Reuses the EXISTING, already-verified APPLICATION_HUMAN_PURPOSE_DATA
 * table (cozy-knowledge-registry.js) as the real "capability registry +
 * human importance" layer - no second registry, no per-application
 * hardcoded routing. searchApplicationsByCapability() is the one,
 * centralized, generic search function; "app-capability-search" is the
 * one, generic trigger phrasing. A new application becomes discoverable
 * the moment a real entry exists for it - no new pattern per app.
 *
 * Run with: node --test core/living/tests/universal-human-importance-capability-search.test.js
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

// ---- Direct function tests: searchApplicationsByCapability() ----

test('searchApplicationsByCapability("sell products") finds WholesaleOS/ShopOS from their real, existing verified text', () => {
    const { knowledge } = freshProvider();
    const r = knowledge.searchApplicationsByCapability('sell products', 'en');
    assert.equal(r.evidence, 'VERIFIED');
    assert.ok(r.matches.some((m) => m.application === 'wholesaleos' || m.application === 'shopos'));
});

test('searchApplicationsByCapability returns real evidence text, never a fabricated summary', () => {
    const { knowledge } = freshProvider();
    const r = knowledge.searchApplicationsByCapability('church members', 'en');
    const top = r.matches[0];
    assert.ok(top.evidenceSnippet.length > 0);
    assert.equal(top.verified, true);
});

test('searchApplicationsByCapability honestly returns NOT_FOUND for a genuinely unsupported need', () => {
    const { knowledge } = freshProvider();
    const r = knowledge.searchApplicationsByCapability('fly to the moon', 'en');
    assert.equal(r.evidence, 'NOT_FOUND');
    assert.deepEqual(r.matches, []);
});

test('a new application automatically becomes discoverable the moment it has a real human-purpose entry - no per-app pattern required', () => {
    const { knowledge } = freshProvider();
    // Proves genericity: pharmacyos and interestos were never named in
    // any capability-search-specific code - they are found purely
    // because they exist in the shared, real data table.
    const pharmacy = knowledge.searchApplicationsByCapability('pharmacy medicine dispensing', 'en');
    assert.ok(pharmacy.matches.some((m) => m.application === 'pharmacyos'));
});

// ---- Live conversational path tests ----

test('LIVE: "Which CozyOS application can help me sell products?" resolves through the real provider', async () => {
    const { provider } = freshProvider();
    const r = await provider.think('Which CozyOS application can help me sell products?', {});
    assert.equal(r.result.intent, 'app-capability-search');
    assert.match(r.result.text, /wholesale|shop/i);
});

test('LIVE: "Which application can help me track payments?" finds a real payment-related application', async () => {
    const { provider } = freshProvider();
    const r = await provider.think('Which application can help me track payments?', {});
    assert.equal(r.result.intent, 'app-capability-search');
    assert.doesNotMatch(r.result.text, /couldn't find/i);
});

test('LIVE: Kiswahili "Programu gani inaweza kunisaidia kuuza bidhaa?" resolves in Kiswahili', async () => {
    const { provider } = freshProvider();
    const r = await provider.think('Programu gani inaweza kunisaidia kuuza bidhaa?', {});
    assert.equal(r.result.intent, 'app-capability-search');
    assert.match(r.result.text, /inaonekana kuwa chaguo sahihi/);
});

test('LIVE: a genuinely unsupported need is honestly reported, never a fabricated application match', async () => {
    const { provider } = freshProvider();
    const r = await provider.think('Which application can help me fly to the moon?', {});
    assert.match(r.result.text, /couldn't find/i);
});

// ---- Regression: existing "which app(s)" list-all behavior still works ----

test('REGRESSION: a genuine "what apps are available" question still resolves to list-apps, not capability-search', async () => {
    const { provider } = freshProvider();
    const r = await provider.think('What apps are available?', {});
    assert.equal(r.result.intent, 'list-apps');
});

test('REGRESSION: existing named-application benefit questions (app-importance) are unaffected', async () => {
    const { provider } = freshProvider();
    const r = await provider.think('Why is ChurchOS useful?', {});
    assert.equal(r.result.intent, 'app-importance');
});

console.log('Universal Human-Importance capability search suite: run complete.');
