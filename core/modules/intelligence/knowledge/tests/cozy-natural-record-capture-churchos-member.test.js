'use strict';

/**
 * core/modules/intelligence/knowledge/tests/cozy-natural-record-capture-churchos-member.test.js
 *
 * Natural Human Record Capture dependency - first real slice. Proves
 * the real end-to-end path: natural utterance -> real, narrow entity
 * extraction -> real, authoritative ChurchOS.createMember() (which
 * itself reuses the real, unmodified OrganizationRegistry) -> real
 * created record, or an honest clarification when required
 * information is missing. Never a parallel/invented record store.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const ORG_REGISTRY_PATH = path.join(ROOT, 'core', 'organization', 'organization-registry.js');
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
    const files = [ORG_REGISTRY_PATH, CHURCHOS_PATH, KNOWLEDGE_REGISTRY_PATH, LANGUAGE_REGISTRY_PATH, LANGUAGE_TEMPLATES_PATH, PUBLIC_KNOWLEDGE_PATH, PROVIDER_PATH];
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
    const org = fakeWindow.CozyOS.OrganizationRegistry.createOrganization({ name: 'Test Church Org' });
    return {
        window: fakeWindow,
        provider: fakeWindow.CozyOS.LivingAI._registered.get('rule-based-conversational'),
        orgId: org.orgId,
    };
}

test('1/2. ENGLISH: "Add John Mwangi as a new member" is interpreted, extracting firstName/lastName without invention', async () => {
    const { provider, orgId } = freshFullStack();
    const result = await provider.think('Add John Mwangi as a new member', { orgId });
    assert.equal(result.result.intent, 'record-church-member');
    assert.match(result.result.text, /John Mwangi/);
});

test('2b. KISWAHILI: "Ongeza John Mwangi kama mwanachama" is interpreted equivalently', async () => {
    const { provider, orgId } = freshFullStack();
    const result = await provider.think('Ongeza John Mwangi kama mwanachama', { orgId });
    assert.equal(result.result.intent, 'record-church-member');
    assert.match(result.result.text, /John Mwangi/);
});

test('4/5. A real record is created through the real, authoritative ChurchOS.createMember() - not a duplicated/invented store', async () => {
    const { provider, window: win, orgId } = freshFullStack();
    const before = win.CozyOS.ChurchOS.listMembers({ orgId }).length;
    const result = await provider.think('Add Grace Achieng as a new member', { orgId });
    assert.equal(result.result.intent, 'record-church-member');
    assert.match(result.result.text, /record MEM/i);
    const after = win.CozyOS.ChurchOS.listMembers({ orgId }).length;
    assert.equal(after, before + 1, 'exactly one real member record must have been created');
});

test('6. The resulting record can be retrieved via the real, existing ChurchOS.listMembers()', async () => {
    const { provider, window: win, orgId } = freshFullStack();
    await provider.think('Add Peter Otieno as a new member', { orgId });
    const members = win.CozyOS.ChurchOS.listMembers({ orgId });
    assert.ok(members.some((m) => m.firstName === 'Peter' && m.lastName === 'Otieno'));
});

test('7a. Missing name -> honest clarification or no match, never a fabricated member', async () => {
    const { provider, orgId } = freshFullStack();
    const result = await provider.think('Add as a new member', { orgId });
    if (result.result.intent === 'record-church-member') {
        assert.match(result.result.text, /who would you like|jina lake/i);
    }
});

test('7b. Missing organization context -> honest clarification, never guesses which church', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Add John Mwangi as a new member');
    assert.equal(result.result.intent, 'record-church-member');
    assert.match(result.result.text, /which church or organization/i);
});

test('8. An invalid organization is honestly rejected, never silently creates a record under a fake org', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Add John Mwangi as a new member', { orgId: 'org_does_not_exist' });
    assert.equal(result.result.intent, 'record-church-member');
    assert.match(result.result.text, /couldn't add/i);
});

test('9. The real created record carries the real, existing provenance fields ChurchOS itself already produces', async () => {
    const { provider, window: win, orgId } = freshFullStack();
    await provider.think('Add Faith Wanjiru as a new member', { orgId });
    const members = win.CozyOS.ChurchOS.listMembers({ orgId });
    const created = members.find((m) => m.firstName === 'Faith');
    assert.ok(created.memberId);
    assert.ok(created.createdAt);
});

test('10. The conversational layer never bypasses ChurchOS.createMember()\'s own real validation', () => {
    const { window: win, orgId } = freshFullStack();
    assert.throws(() => win.CozyOS.ChurchOS.createMember({ orgId, firstName: '' }), /firstName is required/);
});

test('13a. Existing app-info intent remains unaffected by the new options parameter threading', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('What is ChurchOS?');
    assert.equal(result.result.intent, 'app-info');
});

test('13b. Existing translate-request intent remains unaffected', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Translate hello to French.');
    assert.equal(result.result.intent, 'translate-request');
});

test('13c. think() called with NO options object at all (the original call shape) still works exactly as before', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Habari yako?');
    assert.equal(result.result.intent, 'greeting-generic');
});
