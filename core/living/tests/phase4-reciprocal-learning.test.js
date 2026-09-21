/**
 * core/living/tests/phase4-reciprocal-learning.test.js
 * PHASE 4 — Universal Language Capability: verified-gap intelligence +
 * reciprocal learning. Proves the exact Michael Onyango scenario your
 * spec names: a real Profile shows Michael as a consenting Luo
 * CONTRIBUTOR; one Luo concept already has STRONG real evidence
 * (VERIFIED — must never be surfaced as an opportunity); another has
 * only weak evidence (PARTIAL — the real, honest gap that should be
 * surfaced). A different, non-consenting or non-contributor profile
 * never gets an opportunity at all.
 *
 * Run with: node --test core/living/tests/phase4-reciprocal-learning.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const PACK_REGISTRY_PATH = path.join(__dirname, '..', '..', 'modules', 'intelligence', 'language-packs', 'cozy-language-pack-registry.js');
const AFRICAN_INTEL_PATH = path.join(__dirname, '..', '..', 'modules', 'intelligence', 'language-packs', 'cozy-african-language-intelligence.js');
const IDENTITY_ENGINE_PATH = path.join(__dirname, '..', '..', 'modules', 'identity', 'identity-engine.js');
const RECIPROCAL_PATH = path.join(__dirname, '..', 'cozy-reciprocal-learning.js');
const SAFETY_GATE_PATH = path.join(__dirname, '..', '..', 'modules', 'intelligence', 'knowledge', 'ui', 'cozy-knowledge-safety-gate.js');

function freshStack() {
    [PACK_REGISTRY_PATH, AFRICAN_INTEL_PATH, IDENTITY_ENGINE_PATH, RECIPROCAL_PATH, SAFETY_GATE_PATH].forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    global.window = { CozyOS: { IdentityStorage: { save: async () => ({ success: true }) } } };
    require(SAFETY_GATE_PATH); // real safety classifier — without it, submitExpression() fails closed to QUARANTINED (honest, but not what these tests are proving)
    require(PACK_REGISTRY_PATH);
    require(AFRICAN_INTEL_PATH);
    require(IDENTITY_ENGINE_PATH);
    require(RECIPROCAL_PATH);
    global.window.CozyOS.CozyLanguagePacks.registerDefaultPacks();
    return global.window.CozyOS;
}

async function registerMichael(IE) {
    const reg = await IE.register({ accountType: 'user', firstName: 'Michael', lastName: 'Onyango', username: 'michael_' + Date.now(), email: `michael${Date.now()}@example.com`, phone: '+254700000002', password: 'Str0ng!Passw0rd', confirmPassword: 'Str0ng!Passw0rd', acceptTerms: true });
    return reg.userId;
}

test('A: a strongly-evidenced Luo concept is VERIFIED and never surfaced as a reciprocal opportunity', async () => {
    const cozy = freshStack();
    const userId = await registerMichael(cozy.IdentityEngine);
    await cozy.IdentityEngine.updateProfile(userId, { languageRoles: [{ language: 'luo', roles: ['NATIVE', 'FLUENT', 'CONTRIBUTOR'], consent: true }] });

    // 20 independent submissions of the SAME expression -> STRONG evidence band (real, composed evidenceBand()).
    for (let i = 0; i < 20; i++) {
        cozy.CozyLanguagePacks.submitExpression({ languageId: 'luo', expression: 'erokamano', meaning: 'thank you', sourceType: 'COMMUNITY', contributorPseudonym: 'contributor_' + i });
    }
    const gap = cozy.CozyAfricanLanguageIntelligence.checkVerifiedGap({ languageId: 'luo', expression: 'erokamano' });
    assert.equal(gap.status, 'VERIFIED');
});

test('B: a weakly-evidenced Luo concept is a real PARTIAL gap, and IS surfaced as the reciprocal opportunity, while the strong one is skipped', async () => {
    const cozy = freshStack();
    const userId = await registerMichael(cozy.IdentityEngine);
    await cozy.IdentityEngine.updateProfile(userId, { languageRoles: [{ language: 'luo', roles: ['NATIVE', 'FLUENT', 'CONTRIBUTOR'], consent: true }, { language: 'ki', roles: ['LEARNING'] }] });

    for (let i = 0; i < 20; i++) {
        cozy.CozyLanguagePacks.submitExpression({ languageId: 'luo', expression: 'erokamano', meaning: 'thank you', sourceType: 'COMMUNITY', contributorPseudonym: 'contributor_' + i });
    }
    // Only ONE submission -> CANDIDATE band -> PARTIAL, a genuine gap.
    cozy.CozyLanguagePacks.submitExpression({ languageId: 'luo', expression: 'oyawore nade', meaning: 'informal response to a greeting', sourceType: 'COMMUNITY', contributorPseudonym: 'contributor_x' });

    const opportunity = cozy.CozyReciprocalLearning.findReciprocalOpportunity({ actorId: userId, excludeLanguage: 'ki' });
    assert.notEqual(opportunity, null);
    assert.equal(opportunity.language, 'luo');
    assert.equal(opportunity.expression, 'oyawore nade'); // the PARTIAL one — never the VERIFIED "erokamano"
    assert.equal(opportunity.status, 'PARTIAL');
});

test('C: a user with no CONTRIBUTOR role, or no consent, never gets a reciprocal opportunity', async () => {
    const cozy = freshStack();
    const userId = await registerMichael(cozy.IdentityEngine);
    cozy.CozyLanguagePacks.submitExpression({ languageId: 'luo', expression: 'oyawore nade', meaning: 'informal response to a greeting', sourceType: 'COMMUNITY' });

    // No languageRoles at all.
    assert.equal(cozy.CozyReciprocalLearning.findReciprocalOpportunity({ actorId: userId, excludeLanguage: 'ki' }), null);

    // FLUENT but not CONTRIBUTOR.
    await cozy.IdentityEngine.updateProfile(userId, { languageRoles: [{ language: 'luo', roles: ['FLUENT'], consent: true }] });
    assert.equal(cozy.CozyReciprocalLearning.findReciprocalOpportunity({ actorId: userId, excludeLanguage: 'ki' }), null);

    // CONTRIBUTOR but consent:false (never defaulted to true).
    await cozy.IdentityEngine.updateProfile(userId, { languageRoles: [{ language: 'luo', roles: ['CONTRIBUTOR'], consent: false }] });
    assert.equal(cozy.CozyReciprocalLearning.findReciprocalOpportunity({ actorId: userId, excludeLanguage: 'ki' }), null);
});

test('D: the language currently being learned is excluded, even if the actor is a consenting contributor for it', async () => {
    const cozy = freshStack();
    const userId = await registerMichael(cozy.IdentityEngine);
    await cozy.IdentityEngine.updateProfile(userId, { languageRoles: [{ language: 'ki', roles: ['CONTRIBUTOR'], consent: true }] });
    cozy.CozyLanguagePacks.submitExpression({ languageId: 'ki', expression: 'test-gap', meaning: 'a genuine gap', sourceType: 'COMMUNITY' });

    const opportunity = cozy.CozyReciprocalLearning.findReciprocalOpportunity({ actorId: userId, excludeLanguage: 'ki' });
    assert.equal(opportunity, null); // ki is excluded even though it would otherwise qualify
});
