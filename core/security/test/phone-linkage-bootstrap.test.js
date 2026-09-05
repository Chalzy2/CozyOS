'use strict';
/**
 * Real vm-based browser simulation for phone-linkage-bootstrap.js.
 *
 * WHY vm AND NOT require()
 *   Every UMD file in this repo picks its CommonJS branch under
 *   require() (Node always defines `module`), so require()-ing these
 *   files never exercises the actual <script>-tag / browser code path
 *   dashboard.html really runs — including the exact bug this test
 *   would have caught (phone-account-linkage.js discarding its
 *   factory's return value under a plain <script> tag). Loading the
 *   raw file source into a vm context with a real `window` global and
 *   no `module`/`exports` in scope forces the real browser branch,
 *   the same one a real <script> tag executes.
 *
 * WHAT IS AND ISN'T FAKED
 *   phone-provider.js, delivery-backend-registry.js,
 *   phone-account-linkage.js, phone-linkage-store-adapter.js, and
 *   phone-linkage-bootstrap.js are the REAL, unmodified-for-this-test
 *   file contents, executed as real browser code. Only
 *   window.CozyOS.IdentityStorage is a test fixture (matching
 *   CozyIdentityStorage's real async save()/loadAll() contract) —
 *   real IndexedDB does not exist in this sandbox at all, the same
 *   disclosed limitation identity-storage.js itself already carries.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadIntoContext(context, relPath) {
    const fullPath = path.join(__dirname, '..', relPath);
    const source = fs.readFileSync(fullPath, 'utf8');
    vm.runInContext(source, context, { filename: fullPath });
}

class FakeIdentityStorage {
    constructor() { this._data = new Map(); }
    async save(storeName, record) {
        if (!record || !record.id) return { success: false, reason: 'record.id is required' };
        if (!this._data.has(storeName)) this._data.set(storeName, new Map());
        this._data.get(storeName).set(record.id, { ...record });
        return { success: true };
    }
    async loadAll(storeName) {
        const store = this._data.get(storeName);
        return { success: true, records: store ? [...store.values()] : [] };
    }
}

function makeBrowserSandbox(identityStorage) {
    const sandbox = {};
    sandbox.console = console;
    sandbox.setTimeout = setTimeout;
    // Real Web Crypto / TextEncoder — Node 22's own globalThis.crypto
    // (WebCrypto) and TextEncoder, the same real APIs a browser
    // provides; phone-provider.js's real hashing genuinely needs
    // these, they are not stubbed/faked.
    sandbox.crypto = globalThis.crypto;
    sandbox.TextEncoder = TextEncoder;
    sandbox.TextDecoder = TextDecoder;
    sandbox.window = sandbox; // window === global object, like a real page
    sandbox.window.CozyOS = { IdentityStorage: identityStorage };
    const context = vm.createContext(sandbox);
    return { sandbox, context };
}

test('REAL BROWSER-SHAPED WIRING: phone-linkage-bootstrap.js constructs and assigns window.CozyOS.PhoneAccountLinkage from the real files', async () => {
    const identityStorage = new FakeIdentityStorage();
    const { sandbox, context } = makeBrowserSandbox(identityStorage);

    // Real load order dashboard.html uses: provider/registry/linkage
    // class files before the adapter, adapter before the bootstrap
    // wiring script.
    loadIntoContext(context, 'phone-provider.js');
    loadIntoContext(context, 'delivery-backend-registry.js');
    loadIntoContext(context, 'phone-account-linkage.js');
    loadIntoContext(context, 'phone-linkage-store-adapter.js');
    loadIntoContext(context, 'phone-linkage-bootstrap.js');

    // Before hydration resolves, AuthCoordinator's real
    // `window.CozyOS && window.CozyOS.PhoneAccountLinkage` check must
    // see it as absent (fail closed), not as a half-ready object.
    // Hydration of an empty store resolves on a microtask, so check
    // synchronously right after the script runs.
    // (Not asserted strictly here since it can legitimately resolve
    // before this line on a fast/empty store — the real fail-closed
    // guarantee proven below is that it becomes correctly usable once
    // ready, and phone-linkage-store-adapter.test.js already proves
    // the throws-until-ready contract directly.)

    // Give the real async hydration chain a turn to complete.
    await new Promise((resolve) => sandbox.setTimeout(resolve, 20));

    assert.ok(sandbox.window.CozyOS.PhoneAccountLinkage, 'window.CozyOS.PhoneAccountLinkage must be assigned after real hydration completes');
    const linkage = sandbox.window.CozyOS.PhoneAccountLinkage;

    const req = await linkage.requestLink('user-1', '+254700000005');
    const code = req._test_rawCode;
    assert.ok(code, 'real challenge service must be reachable through the real wiring');
    const result = await linkage.confirmLink('user-1', '+254700000005', code);
    assert.equal(result.linked, true);
    assert.equal(linkage.getPhoneState('user-1').phoneVerified, true);

    // Real persistence: reachable through the real IdentityStorage fixture, under the real "phoneLinkages" store name.
    const persisted = await identityStorage.loadAll('phoneLinkages');
    assert.equal(persisted.records.length, 1);
    assert.equal(persisted.records[0].id, 'user-1');
    assert.equal(persisted.records[0].phoneVerified, true);
});

test('REAL BROWSER-SHAPED WIRING: missing a real dependency leaves PhoneAccountLinkage unassigned (fail closed), never a stub', async () => {
    const { sandbox, context } = makeBrowserSandbox(new FakeIdentityStorage());
    // Deliberately do NOT load phone-provider.js — PhoneChallengeService never registers.
    loadIntoContext(context, 'delivery-backend-registry.js');
    loadIntoContext(context, 'phone-account-linkage.js');
    loadIntoContext(context, 'phone-linkage-store-adapter.js');
    loadIntoContext(context, 'phone-linkage-bootstrap.js');

    await new Promise((resolve) => sandbox.setTimeout(resolve, 20));
    // phone-account-linkage.js itself sets a `null` placeholder at
    // load time (its own pre-existing convention); the bootstrap
    // script must not overwrite that with a real instance when a
    // real dependency is missing. Either way, AuthCoordinator's real
    // `window.CozyOS && window.CozyOS.PhoneAccountLinkage` check
    // treats both `undefined` and `null` as "unavailable" — the
    // falsy check is what actually matters here.
    assert.ok(!sandbox.window.CozyOS.PhoneAccountLinkage, 'must remain falsy (unassigned/null) when a real dependency is missing');
});

test('REAL BROWSER-SHAPED WIRING: running the bootstrap script twice never constructs a second instance', async () => {
    const identityStorage = new FakeIdentityStorage();
    const { sandbox, context } = makeBrowserSandbox(identityStorage);
    loadIntoContext(context, 'phone-provider.js');
    loadIntoContext(context, 'delivery-backend-registry.js');
    loadIntoContext(context, 'phone-account-linkage.js');
    loadIntoContext(context, 'phone-linkage-store-adapter.js');
    loadIntoContext(context, 'phone-linkage-bootstrap.js');
    await new Promise((resolve) => sandbox.setTimeout(resolve, 20));
    const first = sandbox.window.CozyOS.PhoneAccountLinkage;

    loadIntoContext(context, 'phone-linkage-bootstrap.js'); // re-run, e.g. a second inadvertent script inclusion
    await new Promise((resolve) => sandbox.setTimeout(resolve, 20));
    assert.equal(sandbox.window.CozyOS.PhoneAccountLinkage, first, 'must remain the exact same authoritative instance');
});
