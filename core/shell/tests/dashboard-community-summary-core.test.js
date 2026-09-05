/**
 * core/shell/tests/dashboard-community-summary-core.test.js
 * Dashboard Prompt 2 — real, executed tests for
 * core/shell/dashboard-community-summary-core.js
 *
 * Run with: node core/shell/tests/dashboard-community-summary-core.test.js
 *
 * Loads the real, unmodified CozyKnowledgeIngestion/Community/Review
 * engines and drives real submitContribution()/confirm()/reject()/etc.
 * calls to produce real records — never hand-crafts a fake "record"
 * object with an invented reviewState.
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
        console.log(`      ${err.stack || err.message}`);
        failed++;
    }
}

const roots = {
    ingestion: path.join(__dirname, '..', '..', 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-ingestion.js'),
    community: path.join(__dirname, '..', '..', 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-community.js'),
    review: path.join(__dirname, '..', '..', 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-review.js'),
    summary: path.join(__dirname, '..', 'dashboard-community-summary-core.js')
};

function loadModules(opts) {
    opts = opts || {};
    Object.values(roots).forEach((p) => { delete require.cache[require.resolve(p)]; });
    global.window = { CozyOS: {} };
    require(roots.ingestion);
    require(roots.community);
    if (opts.withReview !== false) require(roots.review);
    require(roots.summary);
    return {
        Community: global.window.CozyOS.CozyKnowledgeCommunity,
        Review: global.window.CozyOS.CozyKnowledgeReview,
        Summary: global.window.CozyOS.DashboardCommunitySummaryCore
    };
}

let mods = loadModules();
let contributorSeq = 0;
function nextContributor() { contributorSeq += 1; return `contributor_${contributorSeq}`; }

function submitOne(mods, overrides) {
    const o = Object.assign({
        contributionType: 'TRANSLATION',
        statement: 'jambo -> hello',
        language: 'sw',
        contributorId: nextContributor()
    }, overrides || {});
    const result = mods.Community.submitContribution(o);
    assert.strictEqual(result.status, 'SUBMITTED', 'test setup expects a real SUBMITTED result');
    return result.record.id;
}

test('summary: with zero records, every bucket is a real empty array, not omitted', () => {
    mods = loadModules();
    const summary = mods.Summary.summarizeCommunityRecords([]);
    assert.deepStrictEqual(Object.keys(summary.buckets).sort(), ['communityVerified', 'learnedKnowledge', 'needsCorrection', 'pendingReview', 'rejected'].sort());
    Object.values(summary.buckets).forEach((arr) => assert.ok(Array.isArray(arr) && arr.length === 0));
    assert.strictEqual(summary.totalRecords, 0);
});

test('summary: a freshly submitted CANDIDATE lands in Pending Review, never Community Verified', () => {
    mods = loadModules();
    const id = submitOne(mods);
    const records = mods.Community.listCommunityRecords({});
    const summary = mods.Summary.summarizeCommunityRecords(records);
    const found = summary.buckets.pendingReview.find((r) => r.id === id);
    assert.ok(found, 'freshly submitted record must appear in Pending Review');
    assert.strictEqual(summary.buckets.communityVerified.find((r) => r.id === id), undefined);
});

test('summary: a rejected record lands in Rejected via the real reject() path', () => {
    mods = loadModules();
    const id = submitOne(mods);
    mods.Community.rejectContribution(id, { reason: 'Not accurate' });
    const records = mods.Community.listCommunityRecords({});
    const summary = mods.Summary.summarizeCommunityRecords(records);
    assert.ok(summary.buckets.rejected.find((r) => r.id === id), 'rejected record must appear in the Rejected bucket');
});

test('summary: a disputed record lands in Needs Correction, never Community Verified', () => {
    mods = loadModules();
    const id = submitOne(mods);
    mods.Community.disputeContribution(id, { contributorId: nextContributor(), reason: 'This spelling looks wrong to me' });
    const records = mods.Community.listCommunityRecords({});
    const summary = mods.Summary.summarizeCommunityRecords(records);
    assert.ok(summary.buckets.needsCorrection.find((r) => r.id === id));
    assert.strictEqual(summary.buckets.communityVerified.find((r) => r.id === id), undefined);
});

test('summary: falls back to raw reviewState honestly when CozyKnowledgeReview is not loaded (never crashes, never fabricates)', () => {
    mods = loadModules({ withReview: false });
    const id = submitOne(mods);
    const records = mods.Community.listCommunityRecords({});
    const summary = mods.Summary.summarizeCommunityRecords(records);
    const found = summary.buckets.pendingReview.find((r) => r.id === id);
    assert.ok(found);
    assert.strictEqual(found._displayStateSource, 'rawReviewState');
});

test('summary: myContributions is always honestly reported as unavailable, never a fabricated filtered list', () => {
    mods = loadModules();
    submitOne(mods);
    const records = mods.Community.listCommunityRecords({});
    const summary = mods.Summary.summarizeCommunityRecords(records);
    assert.strictEqual(summary.myContributions.available, false);
    assert.ok(summary.myContributions.reason && summary.myContributions.reason.length > 0);
});

test('summary: counts always match bucket array lengths (no drift between the two)', () => {
    mods = loadModules();
    submitOne(mods, { statement: 'habari -> news/hello' });
    submitOne(mods, { statement: 'asante -> thank you' });
    const rejectedId = submitOne(mods, { statement: 'karibu -> welcome' });
    mods.Community.rejectContribution(rejectedId, { reason: 'test' });
    const records = mods.Community.listCommunityRecords({});
    const summary = mods.Summary.summarizeCommunityRecords(records);
    Object.keys(summary.buckets).forEach((key) => {
        assert.strictEqual(summary.counts[key], summary.buckets[key].length);
    });
    assert.strictEqual(summary.totalRecords, records.length);
});

test('summary: never mutates the input records array or its objects', () => {
    mods = loadModules();
    submitOne(mods);
    const records = mods.Community.listCommunityRecords({});
    const before = JSON.stringify(records);
    mods.Summary.summarizeCommunityRecords(records);
    const after = JSON.stringify(records);
    assert.strictEqual(before, after);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
