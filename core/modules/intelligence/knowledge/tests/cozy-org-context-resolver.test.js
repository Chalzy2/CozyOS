'use strict';

/**
 * core/modules/intelligence/knowledge/tests/cozy-org-context-resolver.test.js
 *
 * Current-organization-context resolver dependency - real regression
 * coverage. Proves natural request -> real session actorId -> real
 * OrganizationMembership -> resolved orgId -> real ChurchOS.createMember(),
 * with honest clarification when zero or multiple active memberships
 * exist, and explicit orgId remaining backward-compatible.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const ORG_REGISTRY_PATH = path.join(ROOT, 'core', 'organization', 'organization-registry.js');
const ORG_MEMBERSHIP_PATH = path.join(ROOT, 'core', 'organization', 'organization-membership.js');
const CHURCHOS_PATH = path.join(ROOT, 'core', 'plugins', 'churchOS-core.js');
const KNOWLEDGE_REGISTRY_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js');
const LANGUAGE_REGISTRY_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'language', 'cozy-language-registry.js');
const LANGUAGE_TEMPLATES_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'language', 'cozy-language-templates.js');
const PUBLIC_KNOWLEDGE_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-public-knowledge-source.js');
const PROVIDER_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'providers', 'rule-based-conversational-provider.js');

function makeFakeLivingAI() {
    const registered = new Map();
    return {
        registerProvider(name, provider) { registered.set(name, provider); return { success: true }; },
        setActiveProvider() { return { success: true }; },
        getActiveProvider() { return null; },
        _registered: registered,
    };
}
function makeFakeCoordinator() { return { async run() { return {}; } }; }
function makeFakeProviderManager() { return { register() {}, healthReport: () => ({}) }; }

function freshFullStack() {
    const files = [ORG_REGISTRY_PATH, ORG_MEMBERSHIP_PATH, CHURCHOS_PATH, KNOWLEDGE_REGISTRY_PATH, LANGUAGE_REGISTRY_PATH, LANGUAGE_TEMPLATES_PATH, PUBLIC_KNOWLEDGE_PATH, PROVIDER_PATH];
    files.forEach((p) => delete require.cache[require.resolve(p)]);
    const fakeWindow = {
        CozyOS: {
            LivingAI: makeFakeLivingAI(),
            CognitiveCoordinator: makeFakeCoordinator(),
            ProviderManager: makeFakeProviderManager(),
            listApplications: () => [],
        },
    };
    global.window = fakeWindow;
    files.forEach((p) => require(p));
    return {
        window: fakeWindow,
        provider: fakeWindow.CozyOS.LivingAI._registered.get('rule-based-conversational'),
    };
}

test('1. A real user with exactly one real active membership resolves the org automatically, no clarification asked', async () => {
    const { provider, window: win } = freshFullStack();
    const org = win.CozyOS.OrganizationRegistry.createOrganization({ name: 'Grace Church' });
    win.CozyOS.OrganizationMembership.createMembership({ userId: 'user-1', organizationId: org.orgId });

    const result = await provider.think('Add John Mwangi as a new member', { actorId: 'user-1' });
    assert.equal(result.result.intent, 'record-church-member');
    assert.match(result.result.text, /John Mwangi/);
    assert.match(result.result.text, /record MEM/i);

    const members = win.CozyOS.ChurchOS.listMembers({ orgId: org.orgId });
    assert.ok(members.some((m) => m.firstName === 'John' && m.lastName === 'Mwangi'));
});

test('2. Zero active memberships -> honest clarification, never a fabricated organization', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Add John Mwangi as a new member', { actorId: 'user-with-no-orgs' });
    assert.equal(result.result.intent, 'record-church-member');
    assert.match(result.result.text, /which church or organization/i);
});

test('3. Multiple active memberships -> honest clarification listing the real organizations, never picks one', async () => {
    const { provider, window: win } = freshFullStack();
    const orgA = win.CozyOS.OrganizationRegistry.createOrganization({ name: 'Church A' });
    const orgB = win.CozyOS.OrganizationRegistry.createOrganization({ name: 'Church B' });
    win.CozyOS.OrganizationMembership.createMembership({ userId: 'user-multi', organizationId: orgA.orgId });
    win.CozyOS.OrganizationMembership.createMembership({ userId: 'user-multi', organizationId: orgB.orgId });

    const result = await provider.think('Add John Mwangi as a new member', { actorId: 'user-multi' });
    assert.equal(result.result.intent, 'record-church-member');
    assert.match(result.result.text, /more than one organization/i);
    assert.match(result.result.text, new RegExp(orgA.orgId));
    assert.match(result.result.text, new RegExp(orgB.orgId));
});

test('4. A suspended (non-active) membership is honestly NOT used to resolve an organization', async () => {
    const { provider, window: win } = freshFullStack();
    const org = win.CozyOS.OrganizationRegistry.createOrganization({ name: 'Suspended Org' });
    win.CozyOS.OrganizationMembership.createMembership({ userId: 'user-suspended', organizationId: org.orgId });
    win.CozyOS.OrganizationMembership.suspendMembership('user-suspended', org.orgId);

    const result = await provider.think('Add John Mwangi as a new member', { actorId: 'user-suspended' });
    assert.equal(result.result.intent, 'record-church-member');
    assert.match(result.result.text, /which church or organization/i);
});

test('5. Explicit orgId remains backward-compatible and still takes priority over session resolution', async () => {
    const { provider, window: win } = freshFullStack();
    const sessionOrg = win.CozyOS.OrganizationRegistry.createOrganization({ name: 'Session Org' });
    const explicitOrg = win.CozyOS.OrganizationRegistry.createOrganization({ name: 'Explicit Org' });
    win.CozyOS.OrganizationMembership.createMembership({ userId: 'user-both', organizationId: sessionOrg.orgId });

    const result = await provider.think('Add Grace Achieng as a new member', { actorId: 'user-both', orgId: explicitOrg.orgId });
    assert.equal(result.result.intent, 'record-church-member');
    const explicitOrgMembers = win.CozyOS.ChurchOS.listMembers({ orgId: explicitOrg.orgId });
    const sessionOrgMembers = win.CozyOS.ChurchOS.listMembers({ orgId: sessionOrg.orgId });
    assert.ok(explicitOrgMembers.some((m) => m.firstName === 'Grace'), 'explicit orgId must be used, not the session-resolved one');
    assert.equal(sessionOrgMembers.length, 0);
});

test('6. No actorId and no explicit orgId -> the original honest clarification (regression from the prior dependency)', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Add John Mwangi as a new member');
    assert.equal(result.result.intent, 'record-church-member');
    assert.match(result.result.text, /which church or organization/i);
});

test('7. Human-purpose knowledge for this capability is retrievable through the existing centralized fact-getter, never fabricated for an unregistered name', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getCapabilityHumanPurposeFact('natural-record-capture');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.match(fact.purpose.humanPurpose, /never guesses/);
    const unknown = win.CozyOS.CozyKnowledge.getCapabilityHumanPurposeFact('some-unregistered-capability');
    assert.equal(unknown.evidence, 'NOT_FOUND');
});

test('7b. "Why is record capture important?" resolves through the existing app-importance intent to the real capability fact', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Why is record capture important?');
    assert.equal(result.result.intent, 'app-importance');
    assert.match(result.result.text, /CURRENTLY VERIFIED/);
    assert.match(result.result.text, /VISION \/ DESTINATION/);
});

test('8. REGRESSION: existing ChurchOS human-purpose (app importance) still works unaffected', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Why is ChurchOS important?');
    assert.equal(result.result.intent, 'app-importance');
    assert.match(result.result.text, /ChurchOS matters because/);
});

test('9. SECURITY: the resolver never bypasses OrganizationRegistry\'s own real requirement that the organization exist', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Add John Mwangi as a new member', { orgId: 'org_totally_fake' });
    assert.match(result.result.text, /couldn't add/i);
});
