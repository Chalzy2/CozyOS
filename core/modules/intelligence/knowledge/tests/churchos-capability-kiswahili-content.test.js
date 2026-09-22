'use strict';

/**
 * core/modules/intelligence/knowledge/tests/churchos-capability-kiswahili-content.test.js
 *
 * WAVE 7b — Kiswahili content/knowledge gap repair.
 *
 * ROOT CAUSE (reproduced from the real Live Window first, then traced
 * through the real semantic -> cognitive -> knowledge -> response-plan ->
 * language-realization -> validation -> Live Window path):
 *   "ChurchOS inafanya nini?" resolves correctly at every layer —
 *   SemanticIntentEngine correctly classifies it as a CAPABILITY_QUERY,
 *   SA-3's planner correctly resolves entity=ChurchOS/goal=CAPABILITY,
 *   GOAL_FIELD_MAP correctly routes CAPABILITY to the real
 *   currentVerifiedCapabilities field, SA-2's evidence adapter correctly
 *   returns the real, VERIFIED currentVerifiedCapabilitiesSw entries for
 *   churchos, SA-4's realizer correctly composes them with the (Cluster
 *   7-repaired) entity-named intro "Hivi ndivyo ChurchOS inavyoweza
 *   kufanya kwa sasa:", and SA-5/Live Window render it correctly. Every
 *   code layer behaved exactly as designed.
 *
 *   The actual gap was in the CONTENT itself: the real, human-authored
 *   currentVerifiedCapabilitiesSw entries for churchos describe generic
 *   OrganizationRegistry/member-management mechanics ("wanachama" —
 *   members) without ever making explicit that, in ChurchOS's own
 *   context, those are specifically CHURCH members — unlike every other
 *   real Sw field on the same churchos record (humanPurposeSw,
 *   realLifeProblemsSw, humanBenefitsSw, whoBenefitsSw, all of which
 *   already say "kanisa"/"makanisa" naturally). This is a genuine
 *   content-authoring gap (PRE-EXISTING-FAILURE-REGISTER.md §7.2.2),
 *   confirmed via a real-browser reproduction
 *   (core/living/tests/cozy-living-assistant-live-window-e2e.test.js's
 *   own "Kiswahili ChurchOS-specific questions" test, `not ok 14`).
 *
 * REPAIR (content correction, not a code change — no new template, no
 * app-specific hard-coding in any code path; this is the exact same kind
 * of human-authored knowledge-registry content every other real,
 * VERIFIED fact in this file already is):
 *   cozy-knowledge-registry.js's churchos.currentVerifiedCapabilitiesSw
 *   now explicitly says "wa kanisa" ("of the church") where the real,
 *   already-VERIFIED capability is specifically about church members —
 *   the exact same real capabilities, faithfully and more precisely
 *   localized, not a new or fabricated capability.
 *
 * This test asserts against the real, live-loaded knowledge registry
 * (not a copy/fixture) so it fails again if the content ever regresses.
 *
 * Run with: node --test core/modules/intelligence/knowledge/tests/churchos-capability-kiswahili-content.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const REGISTRY_PATH = path.join(__dirname, '..', 'cozy-knowledge-registry.js');

function freshRegistry() {
    try { delete require.cache[require.resolve(REGISTRY_PATH)]; } catch (_e) { /* not loaded */ }
    global.window = { CozyOS: {} };
    require(REGISTRY_PATH);
    return global.window.CozyOS.CozyKnowledge;
}

test('A: churchos.currentVerifiedCapabilitiesSw now contains "kanisa" — the real content gap that produced an English-sounding, church-less Kiswahili capability answer is repaired', () => {
    const knowledge = freshRegistry();
    const fact = knowledge.getApplicationHumanPurposeFact('churchos', 'sw');
    assert.equal(fact.evidence, 'VERIFIED');
    const joined = fact.purpose.currentVerifiedCapabilities.join(' ');
    assert.match(joined, /kanisa/i, `expected churchos's real Kiswahili currentVerifiedCapabilities to mention "kanisa", got: ${joined}`);
});

test('B: every real, VERIFIED currentVerifiedCapabilitiesSw entry for churchos is UNCHANGED in substance (same 4 real capabilities, same setupChurch()/publishMembershipReport() references) — no capability invented, none removed', () => {
    const knowledge = freshRegistry();
    const fact = knowledge.getApplicationHumanPurposeFact('churchos', 'sw');
    const items = fact.purpose.currentVerifiedCapabilities;
    assert.equal(items.length, 4);
    assert.match(items[0], /setupChurch\(\)/);
    assert.match(items[0], /OrganizationRegistry/);
    assert.match(items[1], /wanachama/);
    assert.match(items[2], /wanachama/);
    assert.match(items[2], /nchi/);
    assert.match(items[3], /publishMembershipReport\(\)/);
});

test('C: the real English currentVerifiedCapabilities for churchos is completely untouched by this Kiswahili-only content correction', () => {
    const knowledge = freshRegistry();
    const fact = knowledge.getApplicationHumanPurposeFact('churchos', 'en');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.deepEqual(fact.purpose.currentVerifiedCapabilities, [
        "setupChurch() — reuses the real, existing OrganizationRegistry, no second organization system",
        "member creation, retrieval, and listing",
        "country-filtered member listing",
        "membership reporting (publishMembershipReport())"
    ]);
});

test('D: every OTHER real application\'s currentVerifiedCapabilitiesSw is unaffected by this ChurchOS-scoped content correction', () => {
    const knowledge = freshRegistry();
    for (const appId of ['shopos', 'mpesaos', 'quarryos']) {
        const fact = knowledge.getApplicationHumanPurposeFact(appId, 'sw');
        assert.equal(fact.evidence, 'VERIFIED', `expected ${appId} to still have real, VERIFIED Sw capability content`);
        assert.ok(Array.isArray(fact.purpose.currentVerifiedCapabilities) && fact.purpose.currentVerifiedCapabilities.length > 0);
    }
});
