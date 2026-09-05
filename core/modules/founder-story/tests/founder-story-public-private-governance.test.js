/**
 * core/modules/founder-story/tests/founder-story-public-private-governance.test.js
 * CozyAI Micro-Milestone B — Public Story Governance.
 *
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN
 *   The Public/Private Story governance layer this milestone asked for
 *   already exists in this checkpoint, built and wired in an earlier
 *   session ("CozyAI Project Knowledge & Public Story Integration"):
 *     - PUBLIC STORY (CozyOS's origin/vision):
 *       core/identity/project-history.js + african-knowledge-initiative.js
 *       -> window.CozyOS.DeveloperIdentity (explicitly public).
 *     - PRIVATE STORY (the Founder's personal biography):
 *       core/modules/founder-story/founder-story-engine.js
 *       (window.CozyOS.FounderStory) — encrypted, Vault-backed, default
 *       visibility "only-me", fail-closed canView()/canViewChapter().
 *     - THE BOUNDARY between them: FounderStoryEngine.getPublicStory(),
 *       which takes no viewerId, never delegates to canView(), and only
 *       ever returns a story/chapter pair that is BOTH visibility
 *       "public" AND status "published" — checked directly, not
 *       inferred from access/availability.
 *     - THE CONSUMPTION CHOKEPOINT: cozy-knowledge-registry.js composes
 *       ONLY getPublicStory() for project-origin/public-story/vision/
 *       mission/history facts, and cozyos-identity-faq-router.js reads
 *       ONLY DeveloperIdentity — neither ever reaches into the private
 *       vault directly.
 *   This file adds NO new engine, NO new authority, and NO new
 *   production code. Per the milestone's own "No New AI Authority" and
 *   "prefer extending an existing governance authority" rules, the only
 *   genuinely missing piece found by this audit is direct, engine-level
 *   regression coverage for governance guarantees that were previously
 *   exercised only indirectly (through the conversational provider).
 *   This suite exercises FounderStoryEngine's real public API directly
 *   — no mocking of visibility/authorization logic.
 *
 * Run with: node core/modules/founder-story/tests/founder-story-public-private-governance.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

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

const roots = {
    secretRegistry: path.join(__dirname, '..', '..', 'vault', 'secret-registry.js'),
    encryptionManager: path.join(__dirname, '..', '..', 'vault', 'encryption-manager.js'),
    secretManager: path.join(__dirname, '..', '..', 'vault', 'secret-manager.js'),
    typedManagers: path.join(__dirname, '..', '..', 'vault', 'typed-managers.js'),
    rotationHealth: path.join(__dirname, '..', '..', 'vault', 'rotation-and-health.js'),
    vaultEngine: path.join(__dirname, '..', '..', 'vault', 'cozy-vault-engine.js'),
    founderStory: path.join(__dirname, '..', 'founder-story-engine.js')
};

function loadFounderStory() {
    Object.values(roots).forEach((p) => { delete require.cache[require.resolve(p)]; });
    const fakeWindow = { CozyOS: {}, addEventListener: () => {}, dispatchEvent: () => {} };
    global.window = fakeWindow;
    if (!global.crypto) { global.crypto = require('crypto').webcrypto; }
    Object.values(roots).forEach((p) => require(p));
    return fakeWindow.CozyOS.FounderStory;
}

console.log('Public/Private Story governance tests\n');

(async () => {

/* 1. Public Story can be consumed by an authorized public-facing context. */
await test('public + published story/chapter -> getPublicStory() returns the real content', async () => {
    const founderStory = loadFounderStory();
    const story = await founderStory.createStory('owner1', { title: 'origin', category: 'project-origin' });
    await founderStory.setVisibility(story.storyId, 'owner1', 'public');
    await founderStory.setStatus(story.storyId, 'owner1', 'published');
    await founderStory.addChapter(story.storyId, 'owner1', { title: 'origin', body: 'Real public origin text.', status: 'published' });
    const fact = await founderStory.getPublicStory('project-origin');
    assert.ok(fact);
    assert.strictEqual(fact.body, 'Real public origin text.');
});

/* 2. Private Story is not publicly exposed by default. */
await test('a freshly created story defaults to only-me and is invisible to any other viewer', async () => {
    const founderStory = loadFounderStory();
    const story = await founderStory.createStory('owner2', { title: 'bio', category: 'biography' });
    assert.strictEqual(founderStory.canView(story.storyId, 'owner2'), true);
    assert.strictEqual(founderStory.canView(story.storyId, 'anyone-else'), false);
    assert.strictEqual(founderStory.canView(story.storyId, null), false);
});

/* 3. Private information cannot become public merely through availability/AI memory. */
await test('getPublicStory() ignores an org/app-shaped argument that looks like elevated context — availability is not authorization', async () => {
    const founderStory = loadFounderStory();
    const story = await founderStory.createStory('owner3', { title: 'private', category: 'private-topic' });
    // never made public — only-me stays in force regardless of any
    // extra context a caller might pass.
    const fact = await founderStory.getPublicStory('private-topic', { orgId: 'org-1', role: 'admin', isInternal: true });
    assert.strictEqual(fact, null);
});

/* 4. Public/Private classification is preserved — cannot be set to an invalid tier. */
await test('setVisibility()/addChapter() reject an unrecognized visibility tier rather than silently storing it', async () => {
    const founderStory = loadFounderStory();
    const story = await founderStory.createStory('owner4', { title: 'x', category: 'x' });
    await assert.rejects(
        () => Promise.resolve(founderStory.setVisibility(story.storyId, 'owner4', 'shared-with-everyone-i-guess')),
        TypeError
    );
    await assert.rejects(
        () => founderStory.addChapter(story.storyId, 'owner4', { title: 'c', body: 'b', visibility: 'sort-of-public' }),
        TypeError
    );
});

/* 5. Missing/invalid classification fails closed (defense in depth). */
await test('canView()\'s own default branch fails closed for any tier outside the known set (verified by source inspection)', () => {
    const src = fs.readFileSync(roots.founderStory, 'utf8');
    assert.ok(/default:\s*return false;\s*\/\/\s*unrecognized tier/.test(src),
        'expected canView() to keep an explicit fail-closed default branch for unrecognized visibility tiers');
});

/* 6. Unauthorized private-story access fails closed (honest notice, never a throw, never partial data). */
await test('getChapter() for an unauthorized viewer returns the private notice, never the real content, never throws', async () => {
    const founderStory = loadFounderStory();
    const story = await founderStory.createStory('owner5', { title: 'bio', category: 'biography' });
    const chapter = await founderStory.addChapter(story.storyId, 'owner5', { title: 'ch1', body: 'SECRET.', status: 'published' });
    const result = await founderStory.getChapter(chapter.chapterId, 'someone-unauthorized');
    assert.strictEqual(result.locked, true);
    assert.ok(!('body' in result));
});

/* 7. Public Story can be surfaced without exposing a same-category Private Story. */
await test('a public+published chapter and a private-by-default chapter in the same story category never get conflated', async () => {
    const founderStory = loadFounderStory();
    const story = await founderStory.createStory('owner6', { title: 'mission', category: 'mission' });
    await founderStory.setVisibility(story.storyId, 'owner6', 'public');
    await founderStory.setStatus(story.storyId, 'owner6', 'published');
    // A private (only-me) chapter added first...
    await founderStory.addChapter(story.storyId, 'owner6', { title: 'private-notes', body: 'PRIVATE — must never surface as the public mission.', status: 'published', visibility: 'only-me' });
    // ...then the real public chapter.
    await founderStory.addChapter(story.storyId, 'owner6', { title: 'mission', body: 'The real public mission text.', status: 'published' });
    const fact = await founderStory.getPublicStory('mission');
    assert.ok(fact);
    assert.strictEqual(fact.body, 'The real public mission text.');
});

/* 8. No fabricated story is returned when source data is missing. */
await test('getPublicStory() returns null (never a fabricated answer) for a topic with no story at all', async () => {
    const founderStory = loadFounderStory();
    const fact = await founderStory.getPublicStory('a-topic-nobody-ever-created');
    assert.strictEqual(fact, null);
});

/* 9. Organization/application context does not override story privacy. */
await test('getPublicStory() has no org/application-scoped parameter to override with', () => {
    const founderStory = loadFounderStory();
    assert.strictEqual(founderStory.getPublicStory.length, 1); // topicTag only
});

/* 10. Existing CozyMemory behavior remains intact — this governance layer never touches it. */
await test('founder-story-engine.js has zero coupling to CozyMemory (confirmed by source inspection, not just by convention)', () => {
    const src = fs.readFileSync(roots.founderStory, 'utf8');
    assert.ok(!/CozyMemory/.test(src), 'expected no reference to CozyMemory anywhere in founder-story-engine.js');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;

})();
