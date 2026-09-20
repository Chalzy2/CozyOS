'use strict';

/**
 * core/shell/tests/dashboard-profile-language-normalizer.test.js
 * Profile Phase 2A-2 — the pure language-profile normalizer, run against
 * the real, unmodified Tier-1 registry (window.CozyOS.CozyLanguagePacks)
 * through the 2A-1 contract.
 * Run: node core/shell/tests/dashboard-profile-language-normalizer.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const REGISTRY_PATH = path.join(__dirname, '..', '..', 'modules', 'intelligence', 'language-packs', 'cozy-language-pack-registry.js');
const CONTRACT_PATH = path.join(__dirname, '..', 'dashboard-profile-language-contract.js');
const NORMALIZER_PATH = path.join(__dirname, '..', 'dashboard-profile-language-normalizer.js');

function fresh({ withRegistry = true, withContract = true } = {}) {
  global.window = { CozyOS: {} };
  for (const p of [REGISTRY_PATH, CONTRACT_PATH, NORMALIZER_PATH]) delete require.cache[require.resolve(p)];
  if (withRegistry) require(REGISTRY_PATH);
  if (withContract) require(CONTRACT_PATH);
  require(NORMALIZER_PATH);
  const C = global.window.CozyOS;
  return { N: C.DashboardProfileLanguageNormalizer, contract: C.DashboardProfileLanguageContract, registry: C.CozyLanguagePacks };
}

const ALL_IDS = ['en', 'sw', 'fr', 'ar', 'so', 'ru', 'zh', 'ha', 'yo', 'luo', 'ki', 'kam', 'zu', 'am', 'ln', 'ig', 'hi'];
const EMPTY = { motherLanguages: [], languagesKnown: [] };
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };

// ------------------------------------------------------------ empty / missing
test('EMPTY: missing fields, null fields, empty arrays and arrays of only-empty values all normalize to two empty lists', () => {
  const { N } = fresh();
  for (const input of [undefined, null, {}, { motherLanguages: null }, { languagesKnown: undefined }, { motherLanguages: [], languagesKnown: [] }, { motherLanguages: ['', '   ', null, undefined], languagesKnown: ['\t', ''] }, { motherLanguages: '', languagesKnown: '  ' }]) {
    const r = N.normalizeLanguageProfile(input);
    assert.deepEqual([r.ok, r.profile, r.rejected, r.partial], [true, EMPTY, [], null], JSON.stringify(input));
  }
});

test('OLD PROFILES: a profile that predates the language fields normalizes to empty lists and keeps every other field', () => {
  const { N } = fresh();
  const old = { firstName: 'Ada', lastName: 'Lovelace', country: 'Kenya', city: 'Mombasa' };
  const r = N.withNormalizedLanguages(old);
  assert.equal(r.ok, true);
  assert.deepEqual(r.profile, { ...old, motherLanguages: [], languagesKnown: [] });
});

test('EMPTY: the output is a fresh object each time — never a shared instance', () => {
  const { N } = fresh();
  const a = N.normalizeLanguageProfile({}).profile;
  a.motherLanguages.push('luo');
  assert.deepEqual(N.normalizeLanguageProfile({}).profile, EMPTY);
});

// ------------------------------------------------------------ valid ids
test('SINGLE: one mother language is also known; one known language alone leaves mother empty; a bare string is one value', () => {
  const { N } = fresh();
  assert.deepEqual(N.normalizeLanguageProfile({ motherLanguages: ['luo'] }).profile, { motherLanguages: ['luo'], languagesKnown: ['luo'] });
  assert.deepEqual(N.normalizeLanguageProfile({ languagesKnown: ['en'] }).profile, { motherLanguages: [], languagesKnown: ['en'] });
  assert.deepEqual(N.normalizeLanguageProfile({ motherLanguages: 'sw' }).profile, { motherLanguages: ['sw'], languagesKnown: ['sw'] });
});

test('MULTIPLE: several valid ids in both fields are kept; case and surrounding whitespace canonicalize', () => {
  const { N } = fresh();
  const r = N.normalizeLanguageProfile({ motherLanguages: ['Luo', ' SW '], languagesKnown: ['EN', 'fr', 'sw'] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.profile, { motherLanguages: ['luo', 'sw'], languagesKnown: ['en', 'fr', 'sw', 'luo'] });
});

test('THE PLAN EXAMPLE: mother [luo, sw, luo] + known [en, sw] -> mother [luo, sw], known [en, sw, luo]', () => {
  const { N } = fresh();
  const r = N.normalizeLanguageProfile({ motherLanguages: ['luo', 'sw', 'luo'], languagesKnown: ['en', 'sw'] });
  assert.deepEqual(r.profile, { motherLanguages: ['luo', 'sw'], languagesKnown: ['en', 'sw', 'luo'] });
});

// ------------------------------------------------------------ duplicates
test('DUPLICATES: removed within each field, first occurrence wins, across case/whitespace variants too', () => {
  const { N } = fresh();
  const r = N.normalizeLanguageProfile({ motherLanguages: ['luo', 'LUO', ' Luo ', 'sw', 'luo'], languagesKnown: ['en', 'EN', 'en', 'sw', 'en'] });
  assert.deepEqual(r.profile, { motherLanguages: ['luo', 'sw'], languagesKnown: ['en', 'sw', 'luo'] });
  assert.deepEqual(r.rejected, []);
});

// ------------------------------------------------------------ invalid ids
test('INVALID: unknown ids, names, region tags, other registries\' codes and non-strings are REJECTED and reported — never silently dropped', () => {
  const { N } = fresh();
  const cases = [
    ['xx', 'UNKNOWN_LANGUAGE_ID'], ['Kiswahili', 'UNKNOWN_LANGUAGE_ID'], ['sw-KE', 'UNKNOWN_LANGUAGE_ID'], ['luo-KE', 'UNKNOWN_LANGUAGE_ID'],
    ['lg', 'UNKNOWN_LANGUAGE_ID'], ['kik', 'UNKNOWN_LANGUAGE_ID'], ['zul', 'UNKNOWN_LANGUAGE_ID'],
    ['s w', 'INVALID_ID'], ['???', 'INVALID_ID'], ['__proto__', 'INVALID_ID'], [42, 'INVALID_ID'], [true, 'INVALID_ID'], [{}, 'INVALID_ID'], [['sw'], 'INVALID_ID'],
  ];
  for (const [value, reason] of cases) {
    const r = N.normalizeLanguageProfile({ motherLanguages: [value] });
    assert.equal(r.ok, false, JSON.stringify(value));
    assert.equal(r.profile, null);
    assert.equal(r.reason, 'REJECTED_VALUES');
    assert.equal(r.rejected.length, 1);
    assert.deepEqual([r.rejected[0].field, r.rejected[0].index, r.rejected[0].reason], ['motherLanguages', 0, reason], JSON.stringify(value));
    assert.equal(typeof r.rejected[0].value, 'string');
  }
});

test('INVALID: wrong field types and over-long lists are rejected as a field; a non-object profile is INVALID_INPUT', () => {
  const { N } = fresh();
  for (const bad of [5, true, {}, () => 1]) {
    const r = N.normalizeLanguageProfile({ languagesKnown: bad });
    assert.deepEqual([r.ok, r.rejected[0].reason, r.rejected[0].field, r.rejected[0].index], [false, 'INVALID_FIELD_TYPE', 'languagesKnown', null]);
  }
  const tooMany = N.normalizeLanguageProfile({ motherLanguages: new Array(N.MAX_INPUT_VALUES + 1).fill('sw') });
  assert.deepEqual([tooMany.ok, tooMany.rejected[0].reason], [false, 'TOO_MANY_VALUES']);
  assert.equal(N.normalizeLanguageProfile({ motherLanguages: new Array(N.MAX_INPUT_VALUES).fill('sw') }).ok, true);
  for (const bad of ['sw', 5, ['sw'], true]) {
    const r = N.normalizeLanguageProfile(bad);
    assert.deepEqual([r.ok, r.profile, r.reason], [false, null, 'INVALID_INPUT']);
  }
});

test('INVALID: rejected values are bounded strings, never live references to the input', () => {
  const { N } = fresh();
  const hostile = { toString() { throw new Error('must not be called'); } };
  const r = N.normalizeLanguageProfile({ motherLanguages: [hostile, 'x'.repeat(500)] });
  assert.equal(r.rejected.length, 2);
  assert.equal(r.rejected[0].value, '[object]');
  assert.ok(r.rejected[1].value.length <= 65);
});

// ------------------------------------------------------------ mixed
test('MIXED: valid + invalid together -> ok false, profile null (fail closed), every invalid value reported with field and index, valid remainder offered only as `partial`', () => {
  const { N } = fresh();
  const r = N.normalizeLanguageProfile({ motherLanguages: ['luo', 'xx', 'sw'], languagesKnown: ['en', 'lg', 'en', 42] });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'REJECTED_VALUES');
  assert.equal(r.profile, null);
  assert.deepEqual(r.rejected.map(x => [x.field, x.index, x.value, x.reason]), [
    ['motherLanguages', 1, 'xx', 'UNKNOWN_LANGUAGE_ID'],
    ['languagesKnown', 1, 'lg', 'UNKNOWN_LANGUAGE_ID'],
    ['languagesKnown', 3, '42', 'INVALID_ID'],
  ]);
  assert.deepEqual(r.partial, { motherLanguages: ['luo', 'sw'], languagesKnown: ['en', 'luo', 'sw'] });
});

test('MIXED: an invalid mother language is not added to languagesKnown', () => {
  const { N } = fresh();
  const r = N.normalizeLanguageProfile({ motherLanguages: ['xx'], languagesKnown: ['en'] });
  assert.deepEqual(r.partial, { motherLanguages: [], languagesKnown: ['en'] });
});

// ------------------------------------------------------------ mother ⊆ known
test('INVARIANT: motherLanguages is always a subset of languagesKnown, for every combination tried', () => {
  const { N } = fresh();
  const pools = [[], ['luo'], ['sw', 'luo'], ['en'], ['zu', 'am', 'en'], ALL_IDS];
  for (const m of pools) for (const k of pools) {
    const r = N.normalizeLanguageProfile({ motherLanguages: m, languagesKnown: k });
    assert.equal(r.ok, true);
    assert.ok(r.profile.motherLanguages.every(id => r.profile.languagesKnown.includes(id)), JSON.stringify([m, k]));
    assert.equal(new Set(r.profile.languagesKnown).size, r.profile.languagesKnown.length);
  }
});

test('INVARIANT: a mother language missing from known is appended AFTER the existing known entries, in mother order', () => {
  const { N } = fresh();
  assert.deepEqual(N.normalizeLanguageProfile({ motherLanguages: ['zu', 'luo', 'ki'], languagesKnown: ['en', 'luo'] }).profile.languagesKnown, ['en', 'luo', 'zu', 'ki']);
});

// ------------------------------------------------------------ stable ordering
test('ORDER: input-driven and stable — not sorted, not registry order; normalizing twice changes nothing', () => {
  const { N } = fresh();
  const input = { motherLanguages: ['zu', 'am'], languagesKnown: ['hi', 'en', 'zu'] };
  const once = N.normalizeLanguageProfile(input).profile;
  assert.deepEqual(once, { motherLanguages: ['zu', 'am'], languagesKnown: ['hi', 'en', 'zu', 'am'] });
  assert.deepEqual(N.normalizeLanguageProfile(once).profile, once);
  assert.deepEqual(N.normalizeLanguageProfile({ motherLanguages: ['am', 'zu'], languagesKnown: ['zu', 'en', 'hi'] }).profile, { motherLanguages: ['am', 'zu'], languagesKnown: ['zu', 'en', 'hi', 'am'] });
  assert.deepEqual(N.normalizeLanguageProfile(input).profile, once); // deterministic
});

test('ORDER: output keys are exactly motherLanguages then languagesKnown', () => {
  const { N } = fresh();
  assert.deepEqual(Object.keys(N.normalizeLanguageProfile({ languagesKnown: ['en'], junk: 1 }).profile), ['motherLanguages', 'languagesKnown']);
});

// ------------------------------------------------------------ many
test('MANY: all 17 registry languages (shuffled, duplicated, mixed case) normalize to 17 unique ids; a runtime-registered optional pack is accepted too', () => {
  const { N, registry } = fresh();
  const noisy = [...ALL_IDS].reverse().concat(ALL_IDS.map(i => i.toUpperCase()), ALL_IDS);
  const r = N.normalizeLanguageProfile({ motherLanguages: noisy, languagesKnown: noisy });
  assert.equal(r.ok, true);
  assert.equal(r.profile.languagesKnown.length, 17);
  assert.deepEqual([...r.profile.languagesKnown].sort(), [...ALL_IDS].sort());
  assert.equal(registry.registerOptionalPack({ languageId: 'kln', name: 'Kalenjin', nativeName: 'Kalenjin', iso: null }).ok, true);
  assert.deepEqual(N.normalizeLanguageProfile({ languagesKnown: ['kln'] }).profile.languagesKnown, ['kln']);
});

// ------------------------------------------------------------ no mutation
test('NO MUTATION: a deep-frozen input is accepted, is unchanged afterwards, and the output shares no array with it', () => {
  const { N } = fresh();
  const input = deepFreeze({ firstName: 'Ada', address: { city: 'Mombasa' }, motherLanguages: ['luo', 'sw', 'luo'], languagesKnown: ['en'] });
  const snapshot = JSON.stringify(input);
  const r = N.withNormalizedLanguages(input);
  assert.equal(r.ok, true);
  assert.equal(JSON.stringify(input), snapshot);
  assert.notEqual(r.profile.motherLanguages, input.motherLanguages);
  assert.notEqual(r.profile.languagesKnown, input.languagesKnown);
});

test('NO MUTATION OF UNRELATED FIELDS: every other profile field comes through exactly as it was, including odd ones, and nothing is added', () => {
  const { N } = fresh();
  const unrelated = { firstName: 'Charles', lastName: 'Owuor', country: 'Kenya', city: 'Mombasa', roles: ['user'], nested: { a: [1, 2, { b: 3 }] }, nothing: null, zero: 0, empty: '' };
  const r = N.withNormalizedLanguages({ ...unrelated, motherLanguages: ['luo'], languagesKnown: ['en'] });
  for (const key of Object.keys(unrelated)) assert.deepEqual(r.profile[key], unrelated[key], key);
  assert.deepEqual(Object.keys(r.profile).sort(), [...Object.keys(unrelated), 'motherLanguages', 'languagesKnown'].sort());
});

test('NO PROTOTYPE POLLUTION: an own "__proto__" key in the profile is copied as data and changes no prototype', () => {
  const { N } = fresh();
  const hostile = JSON.parse('{"__proto__":{"polluted":true},"motherLanguages":["sw"]}');
  const r = N.withNormalizedLanguages(hostile);
  assert.equal(r.ok, true);
  assert.equal(r.profile.polluted, undefined);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.getPrototypeOf(r.profile), Object.prototype);
  assert.equal(Object.prototype.hasOwnProperty.call(r.profile, '__proto__'), true);
});

// ------------------------------------------------------------ languagePreference
test('languagePreference: copied through verbatim — even when it looks invalid — never read, validated, derived or changed', () => {
  const { N } = fresh();
  for (const pref of ['sw', 'xx-INVALID', '', null, 7, { a: 1 }]) {
    const r = N.withNormalizedLanguages({ languagePreference: pref, motherLanguages: ['luo'], languagesKnown: ['en'] });
    assert.equal(r.ok, true);
    assert.deepEqual(r.profile.languagePreference, pref);
  }
});

test('languagePreference: not added when absent, and never derived from the mother language', () => {
  const { N } = fresh();
  const r = N.withNormalizedLanguages({ motherLanguages: ['luo'] });
  assert.equal('languagePreference' in r.profile, false);
  const r2 = N.withNormalizedLanguages({ languagePreference: 'en', motherLanguages: ['luo'] });
  assert.equal(r2.profile.languagePreference, 'en');
});

test('SCOPE: the normalizer never touches IdentityEngine (no read, no updateProfile, no language-preference call) or any storage', () => {
  const { N } = fresh();
  const trap = new Proxy({}, { get() { throw new Error('IdentityEngine must not be touched'); }, set() { throw new Error('IdentityEngine must not be touched'); } });
  global.window.CozyOS.IdentityEngine = trap;
  global.window.localStorage = trap;
  assert.equal(N.normalizeLanguageProfile({ motherLanguages: ['luo'], languagesKnown: ['en'] }).ok, true);
  assert.equal(N.withNormalizedLanguages({ languagePreference: 'sw', motherLanguages: ['luo'] }).ok, true);
});

test('SCOPE: the public surface has no persistence / UI / alias / registration functions', () => {
  const { N } = fresh();
  assert.deepEqual(Object.keys(N).sort(), ['FIELDS', 'MAX_INPUT_VALUES', 'REASONS', 'getVersion', 'normalizeLanguageProfile', 'withNormalizedLanguages']);
});

test('READ-ONLY: normalizing never changes the registry', () => {
  const { N, registry } = fresh();
  const before = JSON.stringify(registry.listPacks());
  N.normalizeLanguageProfile({ motherLanguages: ALL_IDS, languagesKnown: ['xx'] });
  assert.equal(JSON.stringify(registry.listPacks()), before);
});

// ------------------------------------------------------------ fail closed
test('FAILS CLOSED: ids to validate + no registry -> REGISTRY_UNAVAILABLE, no profile, nothing passed through unvalidated', () => {
  const { N } = fresh({ withRegistry: false });
  for (const input of [{ motherLanguages: ['luo'] }, { languagesKnown: ['en'] }, { motherLanguages: ['luo'], languagesKnown: ['en', 'xx'] }, { motherLanguages: 'sw' }]) {
    const r = N.normalizeLanguageProfile(input);
    assert.deepEqual(r, { ok: false, profile: null, rejected: [], partial: null, reason: 'REGISTRY_UNAVAILABLE' }, JSON.stringify(input));
    const w = N.withNormalizedLanguages(input);
    assert.deepEqual([w.ok, w.profile, w.partial, w.reason], [false, null, null, 'REGISTRY_UNAVAILABLE']);
  }
});

test('FAILS CLOSED: a broken injected registry (throws / wrong shape) is unavailable too', () => {
  const { N } = fresh({ withRegistry: false });
  for (const registry of [{ listPacks() { throw new Error('boom'); } }, { listPacks: () => 'nope' }, {}]) {
    assert.equal(N.normalizeLanguageProfile({ motherLanguages: ['en'] }, { registry }).reason, 'REGISTRY_UNAVAILABLE');
  }
});

test('FAILS CLOSED: nothing to validate needs no registry — an old/empty profile still reads as two empty lists (deliberate; see header)', () => {
  const { N } = fresh({ withRegistry: false });
  assert.deepEqual(N.normalizeLanguageProfile({ firstName: 'Ada' }).profile, EMPTY);
  assert.deepEqual(N.normalizeLanguageProfile({ motherLanguages: [' ', null] }).profile, EMPTY);
});

test('FAILS CLOSED: with no 2A-1 contract available the normalizer refuses (CONTRACT_UNAVAILABLE) — it has no id logic of its own to fall back on', () => {
  const { N } = fresh({ withContract: false });
  assert.deepEqual(N.normalizeLanguageProfile({ motherLanguages: ['en'] }), { ok: false, profile: null, rejected: [], partial: null, reason: 'CONTRACT_UNAVAILABLE' });
});

test('DEPENDENCY INJECTION: an injected registry is honored and its metadata is the authority (no baked-in list)', () => {
  const { N } = fresh({ withRegistry: false });
  const custom = { listPacks: () => [{ identity: { languageId: 'xq', name: 'Quenya', nativeName: 'Quenya', iso: null }, origin: 'DEFAULT' }] };
  assert.deepEqual(N.normalizeLanguageProfile({ motherLanguages: ['XQ'] }, { registry: custom }).profile, { motherLanguages: ['xq'], languagesKnown: ['xq'] });
  assert.equal(N.normalizeLanguageProfile({ motherLanguages: ['en'] }, { registry: custom }).rejected[0].reason, 'UNKNOWN_LANGUAGE_ID');
});

// ------------------------------------------------------------ no fabricated BCP-47
test('NO FABRICATED BCP-47: output is ids only; luo/ki/kam are accepted and their tag stays null in the contract; tag-shaped input is rejected', () => {
  const { N, contract, registry } = fresh();
  const r = N.normalizeLanguageProfile({ motherLanguages: ['luo', 'ki', 'kam'], languagesKnown: ['en'] });
  assert.equal(r.ok, true);
  assert.doesNotMatch(JSON.stringify(r), /bcp47|iso|-[A-Z]{2}/i);
  for (const id of r.profile.languagesKnown) {
    const pack = registry.getPack(id).identity;
    assert.equal(contract.getLanguage(id).bcp47, pack.iso || null);
  }
  assert.deepEqual(['luo', 'ki', 'kam'].map(id => contract.getLanguage(id).bcp47), [null, null, null]);
  for (const tag of ['sw-KE', 'en-GB', 'luo-KE', 'zh-Hans']) assert.equal(N.normalizeLanguageProfile({ languagesKnown: [tag] }).ok, false, tag);
});
