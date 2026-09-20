'use strict';

/**
 * core/shell/tests/dashboard-profile-core.test.js
 * User Profile Phase 1 — pure-logic coverage for
 * core/shell/dashboard-profile-core.js (country list, full-name
 * mapping, minimal-diff validation, picture validation).
 * Run: node core/shell/tests/dashboard-profile-core.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const core = require(path.join(__dirname, '..', 'dashboard-profile-core.js'));

const stored = (o = {}) => ({ firstName: null, lastName: null, country: null, city: null, ...o });

// ---------------------------------------------------------------- country
test('COUNTRY: the list is the 249 ISO 3166-1 entries, unique codes and names, sorted by name', () => {
  const list = core.listCountries();
  assert.equal(list.length, 249);
  assert.equal(new Set(list.map(c => c.code)).size, 249);
  assert.equal(new Set(list.map(c => c.name)).size, 249);
  const names = list.map(c => c.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en')));
  for (const c of list) assert.match(c.code, /^[A-Z]{2}$/);
});

test('COUNTRY: Kenya is one entry among many — not first, not a default, other countries resolve', () => {
  const list = core.listCountries();
  assert.notEqual(list[0].code, 'KE');
  for (const [code, name] of [['KE', 'Kenya'], ['TZ', 'Tanzania'], ['NG', 'Nigeria'], ['US', 'United States'], ['BR', 'Brazil'], ['JP', 'Japan']]) {
    assert.deepEqual(core.findCountry(code), { code, name });
    assert.deepEqual(core.findCountry(name.toUpperCase()), { code, name });
  }
  assert.equal(core.findCountry(''), null);
  assert.equal(core.findCountry('Atlantis'), null);
});

test('COUNTRY: no listed name contains a character IdentityEngine would HTML-escape (except the one apostrophe, which round-trips)', () => {
  for (const c of core.listCountries()) assert.doesNotMatch(c.name, /[&<>"]/, c.name);
  assert.equal(core.findCountry("C\u00f4te d&#39;Ivoire").code, 'CI'); // stored (escaped) form still resolves
});

test('COUNTRY: a stored value outside the ISO list is preserved as "current", never dropped', () => {
  const cur = core.fromStoredProfile(stored({ country: 'Somaliland' }));
  assert.equal(cur.countryListed, false);
  assert.equal(cur.countryRaw, 'Somaliland');
  // keeping it is a no-op ...
  const keep = core.validateProfileInput({ fullName: '', countryCode: core.KEEP_CURRENT_COUNTRY, city: '' }, cur);
  assert.equal(keep.valid, true);
  assert.deepEqual(keep.changes, {});
  // ... and choosing a real country replaces it
  const swap = core.validateProfileInput({ fullName: '', countryCode: 'KE', city: '' }, cur);
  assert.deepEqual(swap.changes, { country: 'Kenya' });
});

test('COUNTRY: validateProfileInput accepts a listed code, rejects an unlisted one, clears on ""', () => {
  const cur = core.fromStoredProfile(stored({ firstName: 'Ada', lastName: 'Lovelace', country: 'Kenya' }));
  assert.deepEqual(core.validateProfileInput({ fullName: 'Ada Lovelace', countryCode: 'UG', city: '' }, cur).changes, { country: 'Uganda' });
  const bad = core.validateProfileInput({ fullName: 'Ada Lovelace', countryCode: 'ZZ', city: '' }, cur);
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.country);
  assert.deepEqual(bad.changes, {});
  assert.deepEqual(core.validateProfileInput({ fullName: 'Ada Lovelace', countryCode: '', city: '' }, cur).changes, { country: null });
  assert.deepEqual(core.validateProfileInput({ fullName: 'Ada Lovelace', countryCode: 'KE', city: '' }, cur).changes, {}); // unchanged -> no change
});

// ---------------------------------------------------------------- full name
test('FULL NAME: composed from firstName + lastName; entity-decoded; whitespace collapsed', () => {
  assert.equal(core.composeFullName('Charles', 'Owuor'), 'Charles Owuor');
  assert.equal(core.composeFullName('Mary  Anne', 'Kamau'), 'Mary Anne Kamau');
  assert.equal(core.composeFullName('Ada', null), 'Ada');
  assert.equal(core.composeFullName(null, null), '');
  assert.equal(core.composeFullName('Se&aacute;n', "O&#39;Brien"), "Se&aacute;n O'Brien"); // only the engine's five entities are decoded
  assert.equal(core.fromStoredProfile(stored({ firstName: 'Ada', lastName: 'O&#39;Neil &amp; Co' })).fullName, "Ada O'Neil & Co");
});

test('FULL NAME: split = first word -> firstName, rest -> lastName; single word -> lastName ""', () => {
  assert.deepEqual(core.splitFullName('Charles Owuor'), { firstName: 'Charles', lastName: 'Owuor' });
  assert.deepEqual(core.splitFullName('  Mary   Anne  Wanjiru Kamau '), { firstName: 'Mary', lastName: 'Anne Wanjiru Kamau' });
  assert.deepEqual(core.splitFullName('Cher'), { firstName: 'Cher', lastName: '' });
  assert.deepEqual(core.splitFullName(''), { firstName: '', lastName: '' });
});

test('FULL NAME: an UNCHANGED name is never re-split (stored firstName "Mary Anne" survives a city-only save)', () => {
  const cur = core.fromStoredProfile(stored({ firstName: 'Mary Anne', lastName: 'Kamau' }));
  const r = core.validateProfileInput({ fullName: 'Mary Anne Kamau', countryCode: '', city: 'Nairobi' }, cur);
  assert.deepEqual(r.changes, { city: 'Nairobi' });
});

test('FULL NAME: an edited name changes both parts; cannot be emptied once set; may stay blank if never set; length-capped', () => {
  const cur = core.fromStoredProfile(stored({ firstName: 'Ada', lastName: 'Lovelace' }));
  assert.deepEqual(core.validateProfileInput({ fullName: 'Charles Owuor', countryCode: '', city: '' }, cur).changes, { firstName: 'Charles', lastName: 'Owuor' });
  const empty = core.validateProfileInput({ fullName: '   ', countryCode: '', city: '' }, cur);
  assert.equal(empty.valid, false);
  assert.ok(empty.errors.fullName);
  const never = core.fromStoredProfile(stored());
  const ok = core.validateProfileInput({ fullName: '', countryCode: 'KE', city: '' }, never);
  assert.equal(ok.valid, true);
  assert.deepEqual(ok.changes, { country: 'Kenya' });
  const long = core.validateProfileInput({ fullName: 'A'.repeat(101), countryCode: '', city: '' }, cur);
  assert.equal(long.valid, false);
  assert.ok(long.errors.fullName);
  assert.equal(core.validateProfileInput({ fullName: 'A'.repeat(100), countryCode: '', city: '' }, cur).valid, true);
});

test('FULL NAME: initials are unicode-safe, at most two, empty when no name', () => {
  assert.equal(core.initialsFor('Charles Owuor'), 'CO');
  assert.equal(core.initialsFor('cher'), 'C');
  assert.equal(core.initialsFor('Mary Anne Wanjiru Kamau'), 'MK');
  assert.equal(core.initialsFor('\u00c9mile Zola'), '\u00c9Z');
  assert.equal(core.initialsFor(''), '');
});

// ---------------------------------------------------------------- city
test('CITY: free text, trimmed/collapsed, cleared to null when empty, capped at 80, never inferred', () => {
  const cur = core.fromStoredProfile(stored({ firstName: 'Ada', lastName: 'Lovelace', city: 'Mombasa' }));
  assert.equal(cur.city, 'Mombasa');
  assert.deepEqual(core.validateProfileInput({ fullName: 'Ada Lovelace', countryCode: '', city: '  Nairobi   West ' }, cur).changes, { city: 'Nairobi West' });
  assert.deepEqual(core.validateProfileInput({ fullName: 'Ada Lovelace', countryCode: '', city: '' }, cur).changes, { city: null });
  assert.deepEqual(core.validateProfileInput({ fullName: 'Ada Lovelace', countryCode: '', city: 'Mombasa' }, cur).changes, {});
  const long = core.validateProfileInput({ fullName: 'Ada Lovelace', countryCode: '', city: 'x'.repeat(81) }, cur);
  assert.equal(long.valid, false);
  assert.ok(long.errors.city);
  // control characters are neutralised, not stored
  assert.deepEqual(core.validateProfileInput({ fullName: 'Ada Lovelace', countryCode: '', city: 'Kis\u0000umu\n' }, cur).changes, { city: 'Kis umu' });
});

test('CHANGES: only whitelisted keys can ever be produced (never username/email/phone/roles/hash)', () => {
  const cur = core.fromStoredProfile(stored({ firstName: 'Ada', lastName: 'Lovelace' }));
  const r = core.validateProfileInput({ fullName: 'Bob Marley', countryCode: 'JM', city: 'Kingston', username: 'x', roles: ['platform-admin'], hash: 'x' }, cur);
  assert.deepEqual(Object.keys(r.changes).sort(), ['city', 'country', 'firstName', 'lastName']);
});

// ---------------------------------------------------------------- picture
test('PICTURE: allow-list types only (JPEG/PNG/WebP); SVG/GIF/PDF/unknown rejected', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp', 'IMAGE/PNG']) assert.equal(core.validateProfilePicture({ type, size: 1000 }).valid, true, type);
  for (const type of ['image/svg+xml', 'image/gif', 'application/pdf', 'text/html', '', undefined]) {
    const r = core.validateProfilePicture({ type, size: 1000 });
    assert.equal(r.valid, false, String(type));
    assert.ok(r.reason);
  }
});

test('PICTURE: size bounds — empty, non-numeric and >5 MB rejected; exactly 5 MB accepted', () => {
  assert.equal(core.PICTURE_MAX_BYTES, 5 * 1024 * 1024);
  assert.equal(core.validateProfilePicture({ type: 'image/png', size: 0 }).valid, false);
  assert.equal(core.validateProfilePicture({ type: 'image/png', size: NaN }).valid, false);
  assert.equal(core.validateProfilePicture({ type: 'image/png', size: core.PICTURE_MAX_BYTES + 1 }).valid, false);
  assert.equal(core.validateProfilePicture({ type: 'image/png', size: core.PICTURE_MAX_BYTES }).valid, true);
  assert.equal(core.validateProfilePicture(null).valid, false);
  assert.equal(core.validateProfilePicture('file.png').valid, false);
});

test('PICTURE: persistence is honestly reported as NOT supported and deferred to Profile Phase 2', () => {
  const s = core.getPicturePersistenceStatus();
  assert.equal(s.supported, false);
  assert.equal(s.deferredTo, 'Profile Phase 2');
  assert.ok(Object.isFrozen(s));
});

// ---------------------------------------------------------------- scope guard
test('SCOPE: the module exposes no language-profile or security functionality (separate phases)', () => {
  const keys = Object.keys(core).join(' ').toLowerCase();
  assert.doesNotMatch(keys, /language|motherlang|teach|password|passkey|twofactor|2fa|session|device/);
});
