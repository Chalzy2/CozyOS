/**
 * core/modules/intelligence/language-packs/tests/cozy-rp035-optional-country-correction.test.js
 * RP-035 Phase 1 correction — optional-pack discovery + country/flag metadata
 * Run with: node core/modules/intelligence/language-packs/tests/cozy-rp035-optional-country-correction.test.js
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
        console.log(`      ${err.message}`);
        failed++;
    }
}

function fakeSafetyGate(verdict) {
    return {
        classify: () => ({ verdict: verdict || 'SAFE' }),
        quarantine: () => ({ id: 'q-1' })
    };
}

function freshEnv(extraDeps) {
    const win = { CozyOS: Object.assign({ CozyKnowledgeSafetyGate: fakeSafetyGate('SAFE') }, extraDeps || {}) };
    global.window = win;

    ['cozy-language-pack-registry.js', 'cozy-language-acquisition-pipeline.js',
     'cozy-optional-language-pack-discovery.js', 'cozy-language-country-metadata.js'
    ].forEach((f) => {
        const p = path.join(__dirname, '..', f);
        delete require.cache[require.resolve(p)];
        require(p);
    });

    return {
        registry: win.CozyOS.CozyLanguagePacks,
        discovery: win.CozyOS.Modules['cozy-optional-language-pack-discovery'].api,
        country: win.CozyOS.Modules['cozy-language-country-metadata'].api
    };
}

// ---------------------------------------------------------------------
// 1. 17/17 defaults untouched
// ---------------------------------------------------------------------
console.log('\n17 defaults:');

test('exactly 17 default packs, read from DEFAULT_IDENTITIES, never hard-coded here', () => {
    const s = freshEnv();
    assert.strictEqual(s.registry.DEFAULT_IDENTITIES.length, 17);
    assert.strictEqual(s.registry.listDefaultPacks().length, 17);
});

test('every default pack is discoverable and routable via getPack()', () => {
    const s = freshEnv();
    s.registry.DEFAULT_IDENTITIES.forEach((d) => {
        const p = s.registry.getPack(d.languageId);
        assert.ok(p, d.languageId);
        assert.strictEqual(p.origin, 'DEFAULT');
    });
});

test('registering optional packs never removes/downgrades a default pack', () => {
    const s = freshEnv();
    s.discovery.requestOptionalPack('lg', {});
    s.discovery.requestOptionalPack('lg', {});
    assert.strictEqual(s.registry.listDefaultPacks().length, 17);
    s.registry.DEFAULT_IDENTITIES.forEach((d) => {
        assert.strictEqual(s.registry.getPack(d.languageId).status, 'REGISTERED');
    });
});

// ---------------------------------------------------------------------
// 2. Optional-pack discovery
// ---------------------------------------------------------------------
console.log('\nOptional-pack discovery:');

test('discoverOptionalPacks() returns catalog entries as DISCOVERABLE before install', () => {
    const s = freshEnv();
    const r = s.discovery.discoverOptionalPacks();
    const am = r.packs.find((p) => p.languageId === 'lg');
    assert.strictEqual(am.installState, 'DISCOVERABLE');
});

test('requestOptionalPack() registers into the SAME RP-030 registry, never a second one', () => {
    const s = freshEnv();
    const r = s.discovery.requestOptionalPack('lg', {});
    assert.strictEqual(r.status, 'DISCOVERY_REGISTERED');
    assert.strictEqual(s.registry.getPack('lg').origin, 'OPTIONAL');
});

test('after install, discoverOptionalPacks() reports INSTALLED', () => {
    const s = freshEnv();
    s.discovery.requestOptionalPack('lg', {});
    const r = s.discovery.discoverOptionalPacks();
    assert.strictEqual(r.packs.find((p) => p.languageId === 'lg').installState, 'INSTALLED');
});

test('optional pack is never mistaken for a default pack (origin field)', () => {
    const s = freshEnv();
    s.discovery.requestOptionalPack('lg', {});
    assert.strictEqual(s.registry.getPack('lg').origin, 'OPTIONAL');
    assert.strictEqual(s.registry.getPack('sw').origin, 'DEFAULT');
});

test('duplicate optional-pack request returns ALREADY_REGISTERED, does not double-register', () => {
    const s = freshEnv();
    s.discovery.requestOptionalPack('lg', {});
    const r2 = s.discovery.requestOptionalPack('lg', {});
    assert.strictEqual(r2.status, 'ALREADY_REGISTERED');
});

test('malformed/unsupported language request is rejected, not fabricated', () => {
    const s = freshEnv();
    const r = s.discovery.requestOptionalPack('zzz-not-real', {});
    assert.strictEqual(r.status, 'UNSUPPORTED_LANGUAGE');
});

test('optional pack cannot collide with a default identity', () => {
    const s = freshEnv();
    const r = s.registry.registerOptionalPack({ languageId: 'sw', name: 'Fake Swahili' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'COLLIDES_WITH_DEFAULT_IDENTITY');
});

test('installing an optional pack keeps counts correct: 17 default + 1 optional = 18 total', () => {
    const s = freshEnv();
    assert.strictEqual(s.registry.listPacks().length, 17);
    s.discovery.requestOptionalPack('lg', {});
    assert.strictEqual(s.registry.listDefaultPacks().length, 17);
    assert.strictEqual(s.registry.listOptionalPacks().length, 1);
    assert.strictEqual(s.registry.listPacks().length, 18);
});

test('capability degrades honestly when registry is not loaded', () => {
    global.window = { CozyOS: {} };
    const p = path.join(__dirname, '..', 'cozy-optional-language-pack-discovery.js');
    delete require.cache[require.resolve(p)];
    require(p);
    const api = global.window.CozyOS.Modules['cozy-optional-language-pack-discovery'].api;
    assert.strictEqual(api.discoverOptionalPacks().status, 'CAPABILITY_UNAVAILABLE');
});

// ---------------------------------------------------------------------
// 3. Rule 82 — no unauthorized promotion, no new mutators
// ---------------------------------------------------------------------
console.log('\nRule 82 enforcement:');

test('requestOptionalPack() never returns AVAILABLE; Rule 82 gate stays BLOCKED', () => {
    const s = freshEnv();
    const r = s.discovery.requestOptionalPack('lg', {});
    assert.notStrictEqual(r.pack.status, 'AVAILABLE');
    assert.strictEqual(r.rule82Gate.status, 'BLOCKED');
});

test('discovery module exposes no promote/forceAvailable/approvePack/setStatus mutator', () => {
    const s = freshEnv();
    ['promote', 'promotePack', 'forceAvailable', 'approvePack', 'setStatus'].forEach((m) => {
        assert.strictEqual(typeof s.discovery[m], 'undefined', m);
    });
});

test('registry itself still refuses to promote an optional pack', () => {
    const s = freshEnv();
    s.discovery.requestOptionalPack('lg', {});
    assert.strictEqual(s.registry.requestPromotion('am').status, 'BLOCKED');
});

// ---------------------------------------------------------------------
// 4. Country & flag metadata
// ---------------------------------------------------------------------
console.log('\nCountry & flag metadata:');

test('multi-country example: Swahili (sw) maps to KE/TZ/UG with names and flags', () => {
    const s = freshEnv();
    s.registry.registerRegionalContext('sw', { country: 'KE' });
    s.registry.registerRegionalContext('sw', { country: 'TZ' });
    s.registry.registerRegionalContext('sw', { country: 'UG' });
    const r = s.country.listCountriesForLanguage('sw');
    const codes = r.countries.map((c) => c.code).sort();
    assert.deepStrictEqual(codes, ['KE', 'TZ', 'UG']);
    r.countries.forEach((c) => { assert.ok(c.name !== 'UNKNOWN'); assert.ok(c.flag); });
});

test('missing country metadata returns UNKNOWN with no fabricated flag', () => {
    const s = freshEnv();
    s.registry.registerRegionalContext('luo', { country: 'ZZ' });
    const r = s.country.listCountriesForLanguage('luo');
    const zz = r.countries.find((c) => c.code === 'ZZ');
    assert.strictEqual(zz.name, 'UNKNOWN');
    assert.strictEqual(zz.flag, null);
});

test('getCountryMetadata() for a known code returns real name + flag', () => {
    const s = freshEnv();
    const ke = s.country.getCountryMetadata('ke');
    assert.strictEqual(ke.name, 'Kenya');
    assert.ok(ke.flag);
});

test('unregistered language returns UNREGISTERED_LANGUAGE, not a fabricated empty pass', () => {
    const s = freshEnv();
    const r = s.country.listCountriesForLanguage('xx');
    assert.strictEqual(r.status, 'UNREGISTERED_LANGUAGE');
});

test('country metadata capability degrades honestly when registry absent', () => {
    global.window = { CozyOS: {} };
    const p = path.join(__dirname, '..', 'cozy-language-country-metadata.js');
    delete require.cache[require.resolve(p)];
    require(p);
    const api = global.window.CozyOS.Modules['cozy-language-country-metadata'].api;
    assert.strictEqual(api.listCountriesForLanguage('sw').status, 'CAPABILITY_UNAVAILABLE');
});

// ---------------------------------------------------------------------
// 5. Flag isolation from routing / provenance
// ---------------------------------------------------------------------
console.log('\nFlag isolation & provenance:');

test('flag/country metadata never appears inside detectLanguagePack() routing result', () => {
    const s = freshEnv();
    s.registry.registerRegionalContext('luo', { country: 'KE', region: 'Homa Bay' });
    const result = s.registry.detectLanguagePack({ languageId: 'luo', region: 'Homa Bay' });
    assert.strictEqual(JSON.stringify(result).indexOf('flag'), -1);
});

test('country entries derive from real geography.countries evidence, not invented independently', () => {
    const s = freshEnv();
    s.registry.registerRegionalContext('ki', { country: 'KE', region: 'Kiambu' });
    const pack = s.registry.getPack('ki');
    const r = s.country.listCountriesForLanguage('ki');
    assert.deepStrictEqual(r.countries.map((c) => c.code), pack.geography.countries);
});

// ---------------------------------------------------------------------
// 6. Negative identity/location-inference test
// ---------------------------------------------------------------------
console.log('\nNegative identity/location inference:');

test('country metadata module exposes no nationality/location-inference function', () => {
    const s = freshEnv();
    ['inferNationality', 'inferLocation', 'getUserCountry', 'guessNationality', 'getUserLocation']
        .forEach((m) => assert.strictEqual(typeof s.country[m], 'undefined', m));
});

test('country association carries no person/user field of any kind', () => {
    const s = freshEnv();
    s.registry.registerRegionalContext('sw', { country: 'KE' });
    const r = s.country.listCountriesForLanguage('sw');
    r.countries.forEach((c) => {
        assert.strictEqual(Object.prototype.hasOwnProperty.call(c, 'user'), false);
        assert.strictEqual(Object.prototype.hasOwnProperty.call(c, 'nationality'), false);
    });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
