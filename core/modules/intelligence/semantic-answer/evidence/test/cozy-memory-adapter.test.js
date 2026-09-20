'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { freshLoad } = require('./_test-helpers');

function loadStack() {
    const w = freshLoad(['memoryEngine', 'identityEngine', 'orgRegistry', 'orgMembership', 'orgSupport', 'evidenceContract', 'adapter', 'memoryAdapter']);
    return {
        memory: w.CozyOS.CozyMemory,
        identity: w.CozyOS.IdentityEngine,
        orgRegistry: w.CozyOS.OrganizationRegistry,
        support: w.CozyOS.OrganizationSupport,
        adapter: w.CozyOS.CozyMemoryEvidenceAdapter,
        evidenceContract: w.CozyOS.VerifiedEvidenceContract,
    };
}

/**
 * Real fixture. Two genuinely SEPARATE real org-identity systems are
 * involved here, by design (neither invented nor unified by this
 * adapter — see this test file's own comments at each use site):
 *   - identity.createOrganization() — IdentityEngine's OWN, private
 *     #orgs registry, which createUser({orgId}) validates against, and
 *     which CozyMemory's own real #checkReadVisibility() reads via
 *     identity.getUser(actorId).orgId for "organisation"-visibility
 *     entries. Used for userA1/userA2/userB1 below.
 *   - orgRegistry.createOrganization() — the real OrganizationRegistry,
 *     which OrganizationSupport.grantSupport()/isSupportActive()
 *     require (organizationExists()). Used only for the platform-
 *     support-scoped tests below, via `orgA`/`orgB`'s own `orgId`.
 */
async function buildFixture() {
    const stack = loadStack();
    const { memory, identity, orgRegistry } = stack;

    const identityOrgA = identity.createOrganization('Org A');
    const identityOrgB = identity.createOrganization('Org B');
    const orgA = orgRegistry.createOrganization({ name: 'Org A' });
    const orgB = orgRegistry.createOrganization({ name: 'Org B' });

    const userA1 = await identity.createUser({ username: 'usera1_' + Date.now(), password: 'Passw0rd!12345', orgId: identityOrgA.id });
    const userA2 = await identity.createUser({ username: 'usera2_' + Date.now(), password: 'Passw0rd!12345', orgId: identityOrgA.id });
    const userB1 = await identity.createUser({ username: 'userb1_' + Date.now(), password: 'Passw0rd!12345', orgId: identityOrgB.id });
    const platformAdmin = await identity.createUser({ username: 'platformadmin_' + Date.now(), password: 'Passw0rd!12345', roles: ['platform-admin'] });

    memory.saveMemory('test-ns', 'orgA-note', 'Org A internal ministry note.', { owner: userA1.userId, actorId: userA1.userId, visibility: 'organisation' });
    memory.saveMemory('test-ns', 'private-note', 'A private personal reflection.', { owner: userA1.userId, actorId: userA1.userId, visibility: 'private' });
    memory.saveMemory('test-ns', 'public-note', 'A public church announcement.', { owner: userA1.userId, actorId: userA1.userId, visibility: 'public' });

    return { ...stack, orgA, orgB, userA1, userA2, userB1, platformAdmin };
}

// ---------- registration ----------

test('registers window.CozyOS.CozyMemoryEvidenceAdapter', () => {
    const { adapter } = loadStack();
    assert.ok(adapter);
    assert.equal(typeof adapter.getVersion(), 'string');
});

// ---------- contract validity ----------

test('every emitted evidence record passes VerifiedEvidenceContract.validate()', async () => {
    const { adapter, evidenceContract, userA1 } = await buildFixture();
    const result = adapter.adaptFromSearch({ query: 'note', accessContext: { actorId: userA1.userId } });
    assert.ok(result.evidence.length > 0);
    for (const ev of result.evidence) assert.deepEqual(evidenceContract.validate(ev).errors, []);
});

// ---------- source provenance / sensitivity mapping ----------

test('sensitivity mapping: organisation/private/public entries map to ORGANIZATION/PRIVATE/PUBLIC, with matching source.type', async () => {
    const { adapter, userA1 } = await buildFixture();
    const result = adapter.adaptFromSearch({ query: 'note', accessContext: { actorId: userA1.userId } }); // owner sees all three
    const byKey = Object.fromEntries(result.evidence.map((e) => [e.source.id.split(':')[1], e]));
    assert.equal(byKey['orgA-note'].sensitivity, 'ORGANIZATION');
    assert.equal(byKey['orgA-note'].source.type, 'ORGANIZATION_KNOWLEDGE');
    assert.equal(byKey['private-note'].sensitivity, 'PRIVATE');
    assert.equal(byKey['private-note'].source.type, 'USER_MEMORY');
    assert.equal(byKey['public-note'].sensitivity, 'PUBLIC');
    assert.equal(byKey['public-note'].source.type, 'PUBLIC_KNOWLEDGE');
});

test('verification status is CURATED (human-saved, real, but not platform-VERIFIED), never inflated to VERIFIED', async () => {
    const { adapter, userA1 } = await buildFixture();
    const result = adapter.adaptFromSearch({ query: 'note', accessContext: { actorId: userA1.userId } });
    for (const ev of result.evidence) assert.equal(ev.verification.status, 'CURATED');
});

// ---------- organization isolation ----------

test('ORG ISOLATION: Org A member sees Org A organisation-visibility evidence', async () => {
    const { adapter, userA1 } = await buildFixture();
    const result = adapter.adaptFromSearch({ query: 'ministry', accessContext: { actorId: userA1.userId } });
    assert.ok(result.evidence.some((e) => e.claim.includes('Org A internal ministry note')));
});

test('ORG ISOLATION: a different real member of the SAME Org A also sees it', async () => {
    const { adapter, userA2 } = await buildFixture();
    const result = adapter.adaptFromSearch({ query: 'ministry', accessContext: { actorId: userA2.userId } });
    assert.ok(result.evidence.some((e) => e.claim.includes('Org A internal ministry note')));
});

test('ORG ISOLATION: Org B member never sees Org A organisation-visibility evidence', async () => {
    const { adapter, userB1 } = await buildFixture();
    const result = adapter.adaptFromSearch({ query: 'ministry', accessContext: { actorId: userB1.userId } });
    assert.equal(result.evidence.some((e) => e.claim.includes('Org A internal ministry note')), false);
});

test('ORG ISOLATION: an anonymous actor never sees organisation-visibility evidence', async () => {
    const { adapter } = await buildFixture();
    const result = adapter.adaptFromSearch({ query: 'ministry', accessContext: { actorId: 'unregistered-anonymous-id' } });
    assert.equal(result.evidence.some((e) => e.claim.includes('Org A internal ministry note')), false);
});

test('an anonymous actor DOES see genuinely public evidence', async () => {
    const { adapter } = await buildFixture();
    const result = adapter.adaptFromSearch({ query: 'church announcement', accessContext: { actorId: 'unregistered-anonymous-id' } });
    assert.ok(result.evidence.some((e) => e.claim.includes('public church announcement')));
});

// ---------- memory (owner) isolation ----------

test('MEMORY ISOLATION: the owner sees their own private memory', async () => {
    const { adapter, userA1 } = await buildFixture();
    const result = adapter.adaptFromSearch({ query: 'reflection', accessContext: { actorId: userA1.userId } });
    assert.ok(result.evidence.some((e) => e.claim.includes('private personal reflection')));
});

test('MEMORY ISOLATION: a different, unrelated real user (even in the same org) never sees another user\'s private memory', async () => {
    const { adapter, userA2 } = await buildFixture();
    const result = adapter.adaptFromSearch({ query: 'reflection', accessContext: { actorId: userA2.userId } });
    assert.equal(result.evidence.some((e) => e.claim.includes('private personal reflection')), false);
});

// ---------- platform support isolation ----------

test('SUPPORT ISOLATION: a real platform admin with NO active support grant is denied organisation-scoped evidence — support !== global access', async () => {
    const { adapter, platformAdmin, orgA } = await buildFixture();
    const result = adapter.adaptFromSearch({ query: 'ministry', accessContext: { actorId: platformAdmin.userId, organizationId: orgA.orgId } });
    assert.equal(result.evidence.some((e) => e.claim.includes('Org A internal ministry note')), false);
});

test('SUPPORT ISOLATION: a real platform admin WITH a real, active, correctly-scoped grant DOES see organisation-scoped evidence, and every access is recorded for audit', async () => {
    const { adapter, support, platformAdmin, orgA } = await buildFixture();
    const grant = support.grantSupport({ organizationId: orgA.orgId, operatorId: platformAdmin.userId, reason: 'Investigating a member-reported issue.', scope: ['view-organization-knowledge'] });
    assert.equal(grant.success, true);

    const result = adapter.adaptFromSearch({ query: 'ministry', accessContext: { actorId: platformAdmin.userId, organizationId: orgA.orgId } });
    assert.ok(result.evidence.some((e) => e.claim.includes('Org A internal ministry note')));

    const auditTrail = support.getAuditTrail(orgA.orgId);
    assert.ok(auditTrail.some((e) => e.action === 'support-action'));
});

test('SUPPORT ISOLATION: even WITH an active grant, private (and honestly-unenforced team/department/family-category) memory is NEVER exposed via the support path — only organisation-visibility evidence', async () => {
    const { adapter, support, platformAdmin, orgA } = await buildFixture();
    support.grantSupport({ organizationId: orgA.orgId, operatorId: platformAdmin.userId, reason: 'test', scope: ['view-organization-knowledge'] });
    const result = adapter.adaptFromSearch({ query: 'reflection', accessContext: { actorId: platformAdmin.userId, organizationId: orgA.orgId } });
    assert.equal(result.evidence.some((e) => e.claim.includes('private personal reflection')), false, 'a support grant must never expose private memory, even though CozyMemory\'s own "system" identity technically could read it');
});

test('SUPPORT ISOLATION: a grant scoped to a DIFFERENT organization never authorizes access to Org A evidence', async () => {
    const { adapter, support, platformAdmin, orgA, orgB } = await buildFixture();
    support.grantSupport({ organizationId: orgB.orgId, operatorId: platformAdmin.userId, reason: 'test', scope: ['view-organization-knowledge'] });
    const result = adapter.adaptFromSearch({ query: 'ministry', accessContext: { actorId: platformAdmin.userId, organizationId: orgA.orgId } });
    assert.equal(result.evidence.some((e) => e.claim.includes('Org A internal ministry note')), false);
});

test('SUPPORT ISOLATION: a grant scoped to a DIFFERENT capability (wrong requiredScope) never authorizes access', async () => {
    const { adapter, support, platformAdmin, orgA } = await buildFixture();
    support.grantSupport({ organizationId: orgA.orgId, operatorId: platformAdmin.userId, reason: 'test', scope: ['moderate-live-session'] }); // real scope, wrong capability
    const result = adapter.adaptFromSearch({ query: 'ministry', accessContext: { actorId: platformAdmin.userId, organizationId: orgA.orgId } });
    assert.equal(result.evidence.some((e) => e.claim.includes('Org A internal ministry note')), false);
});

// ---------- adversarial / "mutation" tests: never trust a client-supplied trust claim ----------

test('ADVERSARIAL: a fake `isPlatformAdmin: true` / `role: "admin"` field injected into accessContext is completely ignored — the adapter only ever trusts the real, independently-loaded IdentityEngine', async () => {
    const { adapter, userB1, orgA } = await buildFixture();
    const result = adapter.adaptFromSearch({
        query: 'ministry',
        accessContext: { actorId: userB1.userId, organizationId: orgA.orgId, isPlatformAdmin: true, role: 'admin', isAdmin: true },
    });
    assert.equal(result.evidence.some((e) => e.claim.includes('Org A internal ministry note')), false, 'an ordinary Org B user must never be elevated by a self-declared trust flag');
});

test('ADVERSARIAL: a fake IdentityEngine.isPlatformAdmin() that always returns true is still gated by a real, independent OrganizationSupport check — elevation requires BOTH real facts, never either alone', async () => {
    const w = freshLoad(['memoryEngine', 'orgRegistry', 'orgMembership', 'orgSupport', 'evidenceContract', 'adapter', 'memoryAdapter']);
    w.CozyOS.IdentityEngine = { isPlatformAdmin: () => true }; // adversarial stub: always claims admin
    const orgA = w.CozyOS.OrganizationRegistry.createOrganization({ name: 'Org A' });
    w.CozyOS.CozyMemory.saveMemory('test-ns', 'orgA-note', 'Org A internal ministry note.', { owner: 'owner-1', actorId: 'owner-1', visibility: 'organisation' });
    // No real OrganizationSupport grant ever issued — isSupportActive() must honestly report inactive.
    const result = w.CozyOS.CozyMemoryEvidenceAdapter.adaptFromSearch({ query: 'ministry', accessContext: { actorId: 'anyone-at-all', organizationId: orgA.orgId } });
    assert.equal(result.evidence.length, 0, 'a fake isPlatformAdmin() alone, with no real active grant, must never elevate access');
});

// ---------- conflict preservation ----------

test('CONFLICT PRESERVATION: two contradictory real memory entries are both represented as separate evidence — SA-2 never chooses a winner', async () => {
    const { adapter, memory, userA1 } = await buildFixture();
    memory.saveMemory('test-ns', 'attendance-claim-1', 'Sunday attendance was 120 people.', { owner: userA1.userId, actorId: userA1.userId, visibility: 'public' });
    memory.saveMemory('test-ns', 'attendance-claim-2', 'Sunday attendance was 150 people.', { owner: userA1.userId, actorId: userA1.userId, visibility: 'public' });
    const result = adapter.adaptFromSearch({ query: 'Sunday attendance', accessContext: { actorId: userA1.userId } });
    const claims = result.evidence.map((e) => e.claim);
    assert.ok(claims.includes('Sunday attendance was 120 people.'));
    assert.ok(claims.includes('Sunday attendance was 150 people.'));
});

// ---------- no source mutation ----------

test('adapting the same memory repeatedly never mutates the real, underlying CozyMemory entry', async () => {
    const { adapter, memory, userA1 } = await buildFixture();
    const before = JSON.stringify(memory.readMemory('test-ns', 'orgA-note', 'system'));
    adapter.adaptFromSearch({ query: 'ministry', accessContext: { actorId: userA1.userId } });
    adapter.adaptFromRead({ namespace: 'test-ns', key: 'orgA-note', accessContext: { actorId: userA1.userId } });
    const after = JSON.stringify(memory.readMemory('test-ns', 'orgA-note', 'system'));
    assert.equal(before, after);
});

// ---------- determinism ----------

test('repeated adaptation of the same authorized memory entry produces stable evidence identity/content', async () => {
    const { adapter, userA1 } = await buildFixture();
    const first = adapter.adaptFromRead({ namespace: 'test-ns', key: 'orgA-note', accessContext: { actorId: userA1.userId } });
    const second = adapter.adaptFromRead({ namespace: 'test-ns', key: 'orgA-note', accessContext: { actorId: userA1.userId } });
    assert.deepEqual(first.evidence, second.evidence);
});

// ---------- honest degrade paths ----------

test('degrades honestly when CozyMemory is not loaded', () => {
    const w = freshLoad(['evidenceContract', 'adapter', 'memoryAdapter']);
    const result = w.CozyOS.CozyMemoryEvidenceAdapter.adaptFromSearch({ query: 'anything', accessContext: { actorId: 'x' } });
    assert.equal(result.success, false);
});

test('adaptFromRead() for a real key the actor is not authorized to see returns a real, honest denial, never fabricated evidence', async () => {
    const { adapter, userB1 } = await buildFixture();
    const result = adapter.adaptFromRead({ namespace: 'test-ns', key: 'orgA-note', accessContext: { actorId: userB1.userId } });
    assert.equal(result.success, false);
    assert.deepEqual(result.evidence, []);
});
