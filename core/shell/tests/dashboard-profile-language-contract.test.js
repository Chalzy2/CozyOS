'use strict';

/**
 * core/shell/tests/dashboard-profile-language-contract.test.js
 * Profile Phase 2A-1 — Language Registry Contract. Runs the real,
 * unmodified Tier-1 registry (window.CozyOS.CozyLanguagePacks) through
 * core/shell/dashboard-profile-language-contract.js.
 * Run: node core/shell/tests/dashboard-profile-language-contract.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CONTRACT_PATH = path.join(__dirname, '..', 'dashboard-profile-language-contract.js');
const REGISTRY_PATH = path.join(__dirname, '..', '..', 'modules', 'intelligence', 'language-packs', 'cozy-language-pack-registry.js');

/** Fresh real registry + fresh contract, wired the way the browser wires them (window.CozyOS). */
function fresh({ withRegistry = true } = {}) {
  global.window = { CozyOS: {} };
  delete require.cache[require.resolve(REGISTRY_PATH)];
  delete require.cache[require.resolve(CONTRACT_PATH)];
  if (withRegistry) require(REGISTRY_PATH);
  require(CONTRACT_PATH);
  return { contract: global.window.CozyOS.DashboardProfileLanguageContract, registry: global.window.CozyOS.CozyLanguagePacks };
}

const CANONICAL_IDS = ['am', 'ar', 'en', 'fr', 'ha', 'hi', 'ig', 'kam', 'ki', 'ln', 'luo', 'ru', 'so', 'sw', 'yo', 'zh', 'zu'];

const fakePack = (languageId, name, nativeName, iso, origin = 'DEFAULT') => ({ identity: { languageId, name, nativeName, iso, flag: null }, origin });

// ------------------------------------------------------------ registry resolves correctly
test('RESOLVES: every one of the 17 registry languages resolves, and its metadata equals the registry record field for field', () => {
  const { contract, registry } = fresh();
  for (const id of CANONICAL_IDS) {
    const r = contract.resolveLanguageId(id);
    assert.equal(r.ok, true, id);
    const identity = registry.getPack(id).identity;
    assert.equal(r.language.id, identity.languageId);
    assert.equal(r.language.name, identity.name);
    assert.equal(r.language.nativeName, identity.nativeName);
    assert.equal(r.language.bcp47, identity.iso || null);
    assert.equal(r.language.origin, 'DEFAULT');
    assert.equal(r.language.source, 'CozyLanguagePacks');
  }
});

test('RESOLVES: the profile example languages (luo, sw, en) show the registry\'s display and native names', () => {
  const { contract } = fresh();
  const show = (id) => { const l = contract.getLanguage(id); return [l.id, l.name, l.nativeName]; };
  assert.deepEqual(show('luo'), ['luo', 'Luo / Dholuo', 'Dholuo']);
  assert.deepEqual(show('sw'), ['sw', 'Kiswahili', 'Kiswahili']);
  assert.deepEqual(show('en'), ['en', 'English', 'English']);
});

test('RESOLVES: listLanguages() returns exactly the registry\'s languages, in registry order', () => {
  const { contract, registry } = fresh();
  const listed = contract.listLanguages();
  assert.equal(listed.ok, true);
  assert.deepEqual(listed.languages.map(l => l.id), registry.listPacks().map(p => p.identity.languageId));
  assert.equal(listed.languages.length, 17);
});

// ------------------------------------------------------------ canonical IDs are stable
test('STABLE IDS: the canonical id set is pinned — a change to the registry\'s ids fails here, deliberately', () => {
  const { contract } = fresh();
  assert.deepEqual(contract.listLanguages().languages.map(l => l.id).sort(), CANONICAL_IDS);
});

test('STABLE IDS: case and surrounding whitespace canonicalize to the same id and the same descriptor', () => {
  const { contract } = fresh();
  for (const variant of ['luo', 'LUO', 'Luo', '  luo  ', '\tluo\n']) {
    assert.equal(contract.canonicalizeLanguageId(variant), 'luo', JSON.stringify(variant));
    assert.deepEqual(contract.resolveLanguageId(variant).language, contract.getLanguage('luo'));
  }
});

test('STABLE IDS: canonicalization is idempotent and pure (no registry needed)', () => {
  const { contract } = fresh({ withRegistry: false });
  for (const id of CANONICAL_IDS) assert.equal(contract.canonicalizeLanguageId(contract.canonicalizeLanguageId(id)), id);
  assert.equal(contract.canonicalizeLanguageId(' SW '), 'sw');
});

// ------------------------------------------------------------ display metadata comes from the registry
test('REGISTRY IS THE SOURCE: a different registry yields different metadata — nothing is baked into the contract', () => {
  const { contract } = fresh({ withRegistry: false });
  const custom = { listPacks: () => [fakePack('xq', 'Quenya', 'Quenya', 'qya')] };
  const r = contract.resolveLanguageId('xq', { registry: custom });
  assert.deepEqual([r.ok, r.language.name, r.language.nativeName, r.language.bcp47], [true, 'Quenya', 'Quenya', 'qya']);
  assert.equal(contract.resolveLanguageId('en', { registry: custom }).reason, 'UNKNOWN_LANGUAGE_ID');
});

test('REGISTRY IS THE SOURCE: nothing is cached — a registry correction, or a newly registered optional pack, is visible on the next call', () => {
  const { contract, registry } = fresh();
  assert.equal(contract.getLanguage('kln'), null);
  assert.equal(registry.registerOptionalPack({ languageId: 'kln', name: 'Kalenjin', nativeName: 'Kalenjin', iso: null }).ok, true);
  const kln = contract.getLanguage('kln');
  assert.deepEqual([kln.name, kln.origin, kln.bcp47], ['Kalenjin', 'OPTIONAL', null]);
  let name = 'Old Name';
  const mutable = { listPacks: () => [fakePack('zz', name, name, null)] };
  assert.equal(contract.getLanguage('zz', { registry: mutable }).name, 'Old Name');
  name = 'Corrected Name';
  assert.equal(contract.getLanguage('zz', { registry: mutable }).name, 'Corrected Name');
});

test('REGISTRY IS THE SOURCE: descriptors carry no readiness state, so knowing a language never implies CozyAI supports it', () => {
  const { contract } = fresh();
  const keys = Object.keys(contract.getLanguage('luo')).sort();
  assert.deepEqual(keys, ['bcp47', 'id', 'name', 'nativeName', 'origin', 'searchNames', 'source']);
});

test('REGISTRY IS READ-ONLY: resolving/listing/searching never changes the registry, and the contract exposes no mutator', () => {
  const { contract, registry } = fresh();
  const before = JSON.stringify(registry.listPacks());
  CANONICAL_IDS.forEach(id => contract.resolveLanguageId(id));
  contract.listLanguages(); contract.searchLanguages('zulu'); contract.getLanguage('nope');
  assert.equal(JSON.stringify(registry.listPacks()), before);
  assert.doesNotMatch(Object.keys(contract).join(' '), /register|set[A-Z]|add|remove|delete|save|write/);
});

// ------------------------------------------------------------ BCP-47
test('BCP-47: reported exactly as the registry holds it — a bare language subtag for 14 languages, null (never inferred) for luo, ki, kam', () => {
  const { contract } = fresh();
  const nulls = contract.listLanguages().languages.filter(l => l.bcp47 === null).map(l => l.id).sort();
  assert.deepEqual(nulls, ['kam', 'ki', 'luo']);
  for (const l of contract.listLanguages().languages.filter(l => l.bcp47 !== null)) {
    assert.equal(l.bcp47, l.id, l.id);
    assert.match(l.bcp47, /^[a-z]{2,3}$/);
  }
});

// ------------------------------------------------------------ unknown / invalid ids rejected
test('REJECTS: malformed input is INVALID_ID', () => {
  const { contract } = fresh();
  for (const bad of ['', '   ', null, undefined, 123, true, {}, [], ['sw'], 's w', 'a'.repeat(contract.MAX_ID_LENGTH + 1), 'sw\u0000']) {
    const r = contract.resolveLanguageId(bad);
    assert.deepEqual([r.ok, r.reason], [false, 'INVALID_ID'], JSON.stringify(bad));
    assert.equal(contract.isKnownLanguageId(bad), false);
    assert.equal(contract.getLanguage(bad), null);
  }
});

test('REJECTS: well-formed ids that are not in the registry are UNKNOWN_LANGUAGE_ID (prototype-method names included; __proto__ is refused as malformed)', () => {
  const { contract } = fresh();
  for (const unknown of ['xx', 'klingon', 'constructor', 'toString', 'hasOwnProperty', 'zz9']) {
    const r = contract.resolveLanguageId(unknown);
    assert.deepEqual([r.ok, r.reason], [false, 'UNKNOWN_LANGUAGE_ID'], unknown);
  }
  assert.equal(contract.resolveLanguageId('__proto__').ok, false); // rejected earlier still: not a well-formed id
});

test('REJECTS: ids that other CozyOS registries use are NOT accepted as aliases (no alias table exists)', () => {
  const { contract } = fresh();
  // 'lg' is Luganda in the chat registry only; kik/zul/ibo/amh/hau/yor are CozySpeech's codes; 'sw-KE' is a region tag; names are not ids
  for (const other of ['lg', 'kik', 'zul', 'ibo', 'amh', 'hau', 'yor', 'kln', 'sw-ke', 'Kiswahili', 'English']) {
    assert.equal(contract.resolveLanguageId(other).ok, false, other);
  }
});

// ------------------------------------------------------------ fails closed
test('FAILS CLOSED: with no registry loaded, everything reports REGISTRY_UNAVAILABLE and no list is fabricated', () => {
  const { contract } = fresh({ withRegistry: false });
  assert.deepEqual(contract.resolveLanguageId('en'), { ok: false, reason: 'REGISTRY_UNAVAILABLE' });
  assert.deepEqual(contract.listLanguages(), { ok: false, reason: 'REGISTRY_UNAVAILABLE', languages: [] });
  assert.equal(contract.searchLanguages('en').ok, false);
  assert.equal(contract.getLanguage('en'), null);
  assert.equal(contract.resolveLanguageId('???bad').reason, 'INVALID_ID'); // syntax is judged first, regardless of registry
});

test('FAILS CLOSED: a broken registry (throws / wrong shape / no listPacks) is unavailable; malformed entries are skipped, never repaired', () => {
  const { contract } = fresh({ withRegistry: false });
  for (const registry of [{ listPacks() { throw new Error('boom'); } }, { listPacks: () => 'nope' }, { listPacks: () => null }, {}, null]) {
    assert.equal(contract.resolveLanguageId('en', { registry }).reason, 'REGISTRY_UNAVAILABLE');
  }
  const mixed = { listPacks: () => [null, {}, { identity: {} }, { identity: { languageId: 'aa', name: '' } }, fakePack('ok', 'Okay', 'Okay', null)] };
  assert.deepEqual(contract.listLanguages({ registry: mixed }).languages.map(l => l.id), ['ok']);
});

// ------------------------------------------------------------ aliases / search names (derived)
test('SEARCH NAMES: derived from registry fields only; the registry itself has no alias field', () => {
  const { contract, registry } = fresh();
  assert.deepEqual(contract.getLanguage('luo').searchNames, ['Luo / Dholuo', 'Luo', 'Dholuo']); // id 'luo' is a case-insensitive duplicate of 'Luo', so it is not listed twice
  assert.deepEqual(contract.getLanguage('en').searchNames, ['English', 'en']);
  assert.deepEqual(contract.getLanguage('zh').searchNames, ['Chinese / Mandarin', 'Chinese', 'Mandarin', '\u4e2d\u6587', 'zh']);
  assert.equal(Object.keys(registry.getPack('luo').identity).some(k => /alias|search/i.test(k)), false);
  assert.ok(Object.isFrozen(contract.getLanguage('luo')) && Object.isFrozen(contract.getLanguage('luo').searchNames));
});

test('SEARCH: accent/case-insensitive; exact before prefix before substring; blank returns all; no match returns none', () => {
  const { contract } = fresh();
  const ids = (q) => contract.searchLanguages(q).languages.map(l => l.id);
  assert.deepEqual(ids('gikuyu'), ['ki']);         // Gĩkũyũ, accent-folded
  assert.deepEqual(ids('Dholuo'), ['luo']);
  assert.deepEqual(ids('kisw'), ['sw']);            // prefix of Kiswahili
  assert.deepEqual(ids('zulu'), ['zu']);            // substring of isiZulu
  assert.deepEqual(ids('YORUBA'), ['yo']);          // Yorùbá
  assert.deepEqual(ids('mandarin'), ['zh']);
  assert.deepEqual(ids('ki').slice(0, 1), ['ki']);  // exact id/tag outranks prefixes like Kikamba/Kikuyu/Kiswahili
  assert.equal(ids('').length, 17);
  assert.equal(ids('   ').length, 17);
  assert.deepEqual(ids('zzzzzz'), []);
});

// ------------------------------------------------------------ canonical profile representation
test('REPRESENTATION: an empty language profile is exactly { motherLanguages: [], languagesKnown: [] } and never a shared object', () => {
  const { contract } = fresh();
  const a = contract.emptyLanguageProfile();
  assert.deepEqual(a, { motherLanguages: [], languagesKnown: [] });
  a.motherLanguages.push('luo');
  assert.deepEqual(contract.emptyLanguageProfile(), { motherLanguages: [], languagesKnown: [] });
  assert.deepEqual([...contract.PROFILE_LANGUAGE_FIELDS], ['motherLanguages', 'languagesKnown']);
});

test('REPRESENTATION: a stored profile holds ids only, and every id displays through the registry', () => {
  const { contract } = fresh();
  const profile = { motherLanguages: ['luo', 'sw'], languagesKnown: ['en', 'sw', 'luo'] };
  for (const list of Object.values(profile)) for (const id of list) assert.match(id, /^[a-z]+$/);
  assert.deepEqual(profile.languagesKnown.map(id => contract.getLanguage(id).name), ['English', 'Kiswahili', 'Luo / Dholuo']);
  const c = contract.describeContract();
  assert.match(c.storedValue, /id/);
  assert.deepEqual([...c.derivedAtReadTime].sort(), ['bcp47', 'name', 'nativeName', 'origin', 'searchNames']);
});

// ------------------------------------------------------------ scope + audit pin
test('SCOPE: no normalization / invariant / UI / Live Window / Teach CozyAI functionality here (Phase 2A-2 and later)', () => {
  const { contract } = fresh();
  assert.doesNotMatch(Object.keys(contract).join(' ').toLowerCase(), /normaliz|dedup|invariant|subset|render|teach|live/);
});

test('AUDIT PIN: the cross-registry facts the contract\'s design rests on (fails on purpose if any registry drifts — re-audit then)', () => {
  // Run in a child process: the Speech and LanguageEngine modules the audit loads start timers that must not leak into this test process.
  const run = require('node:child_process').spawnSync(process.execPath, [path.join(__dirname, 'profile-language-registry-audit.js')], { encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0, run.stderr);
  const audit = JSON.parse(run.stdout);
  assert.equal(audit.tier1Count, 17);
  assert.deepEqual(audit.tier1.map(r => r.id).sort(), CANONICAL_IDS);
  assert.deepEqual(audit.tier2NotInTier1, ['lg']);
  assert.deepEqual(audit.tier1WithNullIso, ['luo', 'ki', 'kam']);
  assert.deepEqual([...audit.tier1DifferentSpeechCode].sort(), ['am->amh', 'ha->hau', 'ig->ibo', 'ki->kik', 'yo->yor', 'zu->zul']);
  assert.equal(audit.aliasFieldAnywhere, false);
});
