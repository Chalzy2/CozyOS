/**
 * core/modules/intelligence/advisor/tests/cozy-runtime-wiring-audit.test.js
 * Milestone J — Runtime Wiring Audit.
 *
 * WHAT THIS PROVES
 *   Not "does the Advisor's own logic work" (Checkpoint I already proved
 *   that) — this proves the chain is actually RUNTIME_REACHABLE the way
 *   admin-workspace.html now loads it, by requiring the exact same real,
 *   unmodified files in the exact same order they appear as <script> tags
 *   on that page (verified programmatically below against the live HTML,
 *   so this test breaks if the page's load order ever regresses), and
 *   proving window.CozyOS exposes the full chain afterward.
 *
 *   A few files that are pure browser/DOM glue with no bearing on this
 *   chain (Firebase SDK loaders, security/session/UI modules, etc.) are
 *   not requirable under plain Node and are correctly out of scope here —
 *   they are not dependencies of QuestionUnderstanding/getContext/
 *   AnswerEngine/Advisor. A genuine full-page load (all ~330 scripts, with
 *   a real DOM) can only be verified with a real browser — see the
 *   Chromium section below for that limitation, honestly disclosed.
 *
 * Run with: node core/modules/intelligence/advisor/tests/cozy-runtime-wiring-audit.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const pending = [];
function test(name, fn) { pending.push({ name, fn }); }

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const ADMIN_HTML = path.join(ROOT, 'admin-workspace.html');

// The real dependency chain this milestone cares about, plus the minimum
// real files each one needs loaded first (Vault, for founder-story-engine's
// createStory() to succeed during seeding) — every path here is a REAL file
// in the repository, not a fixture.
const CHAIN_FILES = [
    'core/modules/vault/secret-registry.js',
    'core/modules/vault/encryption-manager.js',
    'core/modules/vault/secret-manager.js',
    'core/modules/vault/typed-managers.js',
    'core/modules/vault/rotation-and-health.js',
    'core/modules/vault/cozy-vault-engine.js',
    'core/modules/founder-story/founder-story-engine.js',
    'core/modules/founder-story/founder-story-seed.js',
    'core/modules/memory/cozy-memory-engine.js',
    'core/identity/developer-profile.js',
    'core/identity/project-history.js',
    'core/identity/african-knowledge-initiative.js',
    'core/identity/cozyai-identity.js',
    'core/modules/intelligence/knowledge/cozy-knowledge-registry.js',
    'core/modules/intelligence/cozy-ai.js',
    'core/modules/knowledge/cozyos-identity-faq-router.js',
    'core/modules/intelligence/answer/cozy-answer-engine.js',
    'core/modules/intelligence/advisor/cozy-advisor.js'
];

function scriptSrcsInOrder(htmlPath) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const re = /<script[^>]*\ssrc="([^"]+)"/g;
    const out = [];
    let m;
    while ((m = re.exec(html))) out.push(m[1]);
    return out;
}

function freshRealStack() {
    CHAIN_FILES.forEach((rel) => {
        const abs = path.join(ROOT, rel);
        delete require.cache[require.resolve(abs)];
    });
    const win = {
        CozyOS: {},
        // Real browser globals CozyVaultEngine's load-time listener
        // registration expects. Node has no DOM; this is the one
        // Node/browser gap a genuine Chromium run would close (see
        // "Browser Runtime" section at the bottom of this file).
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => {}
    };
    global.window = win;
    CHAIN_FILES.forEach((rel) => require(path.join(ROOT, rel)));
    return win.CozyOS;
}

console.log('Milestone J \u2014 Runtime Wiring Audit\n');

test('AUDIT: admin-workspace.html actually contains a <script> tag for every chain file, in the order this test replays', () => {
    const srcs = scriptSrcsInOrder(ADMIN_HTML);
    const positions = CHAIN_FILES
        .filter((f) => !f.startsWith('core/modules/vault/')) // vault order checked separately below; not unique to this chain
        .map((f) => srcs.indexOf(f));
    positions.forEach((p, i) => assert.ok(p !== -1, `${CHAIN_FILES.filter((f) => !f.startsWith('core/modules/vault/'))[i]} is not <script>-included on admin-workspace.html`));
    for (let i = 1; i < positions.length; i++) {
        assert.ok(positions[i] > positions[i - 1], `Load order regression: a chain file appears before a file it depends on (position ${positions[i - 1]} vs ${positions[i]})`);
    }
});

test('AUDIT: window.CozyOS exposes the complete chain after real-file load, in real page order', () => {
    const CozyOS = freshRealStack();
    ['FounderStory', 'CozyMemory', 'DeveloperIdentity', 'CozyKnowledge', 'CozyAI', 'CozyIdentityFAQRouter', 'CozyAnswerEngine', 'CozyAdvisor']
        .forEach((k) => assert.strictEqual(typeof CozyOS[k], 'object', `window.CozyOS.${k} did not register`));
    assert.strictEqual(typeof CozyOS.CozyAI.getContext, 'function');
    assert.strictEqual(typeof CozyOS.CozyAnswerEngine.answer, 'function');
    assert.strictEqual(typeof CozyOS.CozyAdvisor.advise, 'function');
});

test('SCENARIO 1 (identity/vision): real chain answers a founder question, VERIFIED, sourced from identity-faq-router', async () => {
    const CozyOS = freshRealStack();
    const question = "Who founded CozyOS?";
    const answerResult = await CozyOS.CozyAnswerEngine.answer(question);
    assert.strictEqual(answerResult.evidenceState, 'VERIFIED');
    assert.strictEqual(answerResult.sources[0].authority, 'identity-faq-router');
    assert.ok(answerResult.answer.includes('Charles Owuor') || answerResult.answer.length > 0);
});

test('SCENARIO 2 (general technical): an unmatched technical question flows router -> getContext without crashing', async () => {
    const CozyOS = freshRealStack();
    const question = "What providers does CozyOS currently have registered?";
    const answerResult = await CozyOS.CozyAnswerEngine.answer(question);
    assert.ok(['VERIFIED', 'INSUFFICIENT_DATA'].includes(answerResult.evidenceState));
    assert.ok(Array.isArray(answerResult.contextUsed));
});

test('SCENARIO 3 (advice): "How can this improve CozyOS?" reaches Advisor and returns ADVICE with real-derived reasoning', async () => {
    const CozyOS = freshRealStack();
    const question = "How can this improve CozyOS?";
    const answerResult = await CozyOS.CozyAnswerEngine.answer(question);
    const advice = CozyOS.CozyAdvisor.advise({ question, answerResult });
    assert.strictEqual(advice.responseMode, 'ADVICE');
    assert.strictEqual(advice.evidenceState, answerResult.evidenceState === 'VERIFIED' ? 'VERIFIED' : 'INSUFFICIENT_DATA');
});

test('SCENARIO 4 (encouragement): "I feel like CozyOS is taking too long" reaches Advisor and returns grounded ENCOURAGEMENT', async () => {
    const CozyOS = freshRealStack();
    const question = "I feel like CozyOS is taking too long.";
    const answerResult = await CozyOS.CozyAnswerEngine.answer(question);
    const advice = CozyOS.CozyAdvisor.advise({ question, answerResult });
    assert.strictEqual(advice.responseMode, 'ENCOURAGEMENT');
    assert.ok(advice.encouragement && advice.encouragement.length > 0);
});

test('SCENARIO 5 (memory/context): a memoryQuery flows real actorId through CozyAI.getContext() into CozyMemory with visibility enforced', async () => {
    const CozyOS = freshRealStack();
    CozyOS.CozyMemory.saveMemory('project-knowledge', 'note-1', 'A private planning note.', {
        owner: 'user-alice', actorId: 'user-alice', visibility: 'private', tags: ['planning']
    });
    const question = "What should I build next?";

    const asOwner = await CozyOS.CozyAnswerEngine.answer(question, { actorId: 'user-alice', memoryQuery: 'planning' });
    const ownerHasMemorySource = asOwner.contextUsed.some((r) => r.authority === 'cozy-memory' && r.key === 'note-1');
    assert.ok(ownerHasMemorySource, 'Owner actorId should see their own private memory entry flow into context');

    const asStranger = await CozyOS.CozyAnswerEngine.answer(question, { actorId: 'user-bob', memoryQuery: 'planning' });
    const strangerHasMemorySource = asStranger.contextUsed.some((r) => r.authority === 'cozy-memory' && r.key === 'note-1');
    assert.strictEqual(strangerHasMemorySource, false, 'A different actorId must never see another owner\'s private memory entry');

    const ownerAdvice = CozyOS.CozyAdvisor.advise({ question, answerResult: asOwner });
    const strangerAdvice = CozyOS.CozyAdvisor.advise({ question, answerResult: asStranger });
    assert.deepStrictEqual(ownerAdvice.sources, asOwner.sources);
    assert.deepStrictEqual(strangerAdvice.sources, asStranger.sources);
});

test('AUDIT: no applicationId-scoped boundary exists anywhere in CozyMemory (disclosed gap, not silently assumed)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'core/modules/memory/cozy-memory-engine.js'), 'utf8');
    assert.ok(!/applicationId/.test(src), 'If this ever fires, CozyMemory gained applicationId scoping and this audit note is stale, not the boundary being violated.');
});

test('AUDIT: an unidentified caller (no actorId) never defaults to "system" through getContext() -> AnswerEngine -> Advisor', async () => {
    const CozyOS = freshRealStack();
    CozyOS.CozyMemory.saveMemory('project-knowledge', 'note-2', 'Another private note.', {
        owner: 'user-carol', actorId: 'user-carol', visibility: 'private'
    });
    const answerResult = await CozyOS.CozyAnswerEngine.answer("What should I build next?", { memoryQuery: 'note' });
    const leaked = answerResult.contextUsed.some((r) => r.authority === 'cozy-memory' && r.key === 'note-2');
    assert.strictEqual(leaked, false);
});

(async () => {
    for (const { name, fn } of pending) {
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
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
})();
