'use strict';

/**
 * core/modules/intelligence/knowledge/geography/tests/geo-index.test.js
 *
 * Regression + generalization coverage for the new, additive geography
 * layer (kenya-counties.js, tanzania-regions.js, east-africa-hub.js,
 * continental-framework.js, geo-index.js). All tests below were
 * EXECUTED via `node --test` in this session — see the handoff
 * document for the exact command and pass/fail counts.
 *
 * Test matrix (project brief section 14):
 *  - Kenya county lookup
 *  - Tanzania region lookup
 *  - country lookup / alias lookup
 *  - city lookup (via majorTowns / headquarters / regional capital)
 *  - geographical relationship lookup (same-country / cross-country)
 *  - travel origin/destination (novel sentence, not memorized)
 *  - geographical comparison / proximity ("karibu na")
 *  - city/country question, county question, region question
 *  - multi-location sentence
 *  - Kiswahili morphology + location
 *  - unfamiliar location handling (honest, not fabricated)
 *  - English control (no false positive)
 *  - Kiswahili control
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..', '..');
const KENYA_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'geography', 'kenya-counties.js');
const TANZANIA_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'geography', 'tanzania-regions.js');
const UGANDA_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'geography', 'uganda-districts.js');
const EAST_AFRICA_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'geography', 'east-africa-hub.js');
const CONTINENTAL_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'geography', 'continental-framework.js');
const GEO_INDEX_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'geography', 'geo-index.js');
const LEXICON_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-lexicon-en-sw.js');

function freshStack() {
    const files = [KENYA_PATH, TANZANIA_PATH, UGANDA_PATH, EAST_AFRICA_PATH, CONTINENTAL_PATH, GEO_INDEX_PATH];
    files.forEach((p) => delete require.cache[require.resolve(p)]);
    global.window = {};
    files.forEach((p) => require(p));
    return global.window.CozyOS;
}

// ---------------------------------------------------------------------
// A. Coverage counts (no false completeness — exact numbers)
// ---------------------------------------------------------------------

test('A1: Kenya coverage is exactly 47 counties', () => {
    const CozyOS = freshStack();
    assert.equal(CozyOS.GeoKenyaCounties.count, 47);
});

test('A2: Tanzania coverage is exactly 31 regions', () => {
    const CozyOS = freshStack();
    assert.equal(CozyOS.GeoTanzaniaRegions.count, 31);
});

test('A3: East Africa hub covers exactly the 13 named countries', () => {
    const CozyOS = freshStack();
    assert.equal(CozyOS.GeoEastAfricaHub.count, 13);
});

test('A4: getCoverageCounts() reports exact numbers, matching sub-modules', () => {
    const CozyOS = freshStack();
    const counts = CozyOS.CozyGeographyIndex.getCoverageCounts();
    assert.equal(counts.kenyaCounties, 47);
    assert.equal(counts.tanzaniaRegions, 31);
    assert.equal(counts.ugandaDistricts, 9);
    assert.equal(counts.eastAfricaCountries, 13);
    assert.equal(counts.continentalFeatures, 11); // 4 rivers + 4 mountains + 3 lakes
    assert.equal(counts.additionalAfricanCountries, 10);
});

test('A5: Uganda district coverage is exactly 9 (disclosed non-exhaustive)', () => {
    const CozyOS = freshStack();
    assert.equal(CozyOS.GeoUgandaDistricts.count, 9);
});

test('A6: Uganda district lookup resolves via geo-index', () => {
    const CozyOS = freshStack();
    const entity = CozyOS.CozyGeographyIndex.findEntity('Gulu');
    assert.equal(entity.type, 'district');
    assert.equal(entity.country, 'Uganda');
    assert.equal(entity.source, 'geo-uganda-districts');
});

// ---------------------------------------------------------------------
// B. Kenya county lookup
// ---------------------------------------------------------------------

test('B1: Kenya county lookup by name resolves headquarters + region', () => {
    const CozyOS = freshStack();
    const kilifi = CozyOS.GeoKenyaCounties.getCounty('Kilifi');
    assert.equal(kilifi.headquarters, 'Kilifi');
    assert.equal(kilifi.region, 'Coast');
    assert.equal(kilifi.country, 'Kenya');
});

test('B2: Kenya city lookup via majorTowns resolves the containing county', () => {
    const CozyOS = freshStack();
    const malindiCounty = CozyOS.GeoKenyaCounties.getCounty('Malindi');
    assert.ok(malindiCounty, 'Malindi should resolve to Kilifi county via majorTowns');
    assert.equal(malindiCounty.name, 'Kilifi');
});

test('B3: alias lookup ("Mvita" -> Mombasa) works', () => {
    const CozyOS = freshStack();
    const county = CozyOS.GeoKenyaCounties.getCounty('mvita');
    assert.equal(county.name, 'Mombasa');
});

test('B4: county question via geo-index resolves entity type "county"', () => {
    const CozyOS = freshStack();
    const entity = CozyOS.CozyGeographyIndex.findEntity('Kisumu');
    assert.equal(entity.type, 'county');
    assert.equal(entity.source, 'geo-kenya-counties');
});

// ---------------------------------------------------------------------
// C. Tanzania region lookup
// ---------------------------------------------------------------------

test('C1: Tanzania region lookup by name resolves capital + zone', () => {
    const CozyOS = freshStack();
    const dsm = CozyOS.GeoTanzaniaRegions.getRegion('Dar es Salaam');
    assert.equal(dsm.capital, 'Dar es Salaam');
    assert.equal(dsm.zone, 'Coastal');
});

test('C2: Zanzibar region is included and flagged isZanzibar', () => {
    const CozyOS = freshStack();
    const zone = CozyOS.GeoTanzaniaRegions.getRegion('Mjini Magharibi');
    assert.equal(zone.metadata.isZanzibar, true);
    assert.equal(zone.metadata.island, true);
});

test('C3: region question via geo-index resolves entity type "region"', () => {
    const CozyOS = freshStack();
    const entity = CozyOS.CozyGeographyIndex.findEntity('Arusha');
    assert.equal(entity.type, 'region');
    assert.equal(entity.source, 'geo-tanzania-regions');
});

// ---------------------------------------------------------------------
// D. Country lookup / relationship lookup
// ---------------------------------------------------------------------

test('D1: country lookup resolves East Africa hub entity', () => {
    const CozyOS = freshStack();
    const kenya = CozyOS.GeoEastAfricaHub.getCountry('Kenya');
    assert.equal(kenya.capital, 'Nairobi');
});

test('D2: countryOf() resolves a county to its country', () => {
    const CozyOS = freshStack();
    const mombasa = CozyOS.CozyGeographyIndex.findEntity('Mombasa');
    assert.equal(CozyOS.CozyGeographyIndex.countryOf(mombasa), 'Kenya');
});

// ---------------------------------------------------------------------
// E. Compositional Kiswahili semantic query resolution — NOVEL
//    sentences not stored anywhere in the module (project brief
//    section 10 test list, executed verbatim).
// ---------------------------------------------------------------------

test('E1: "Nataka kusafiri kutoka Mombasa hadi Nairobi." -> travel, same country', () => {
    const CozyOS = freshStack();
    const result = CozyOS.CozyGeographyIndex.resolveQuery('Nataka kusafiri kutoka Mombasa hadi Nairobi.', 'sw');
    assert.equal(result.intent, 'travel');
    assert.equal(result.origin.entity.name, 'Mombasa');
    assert.equal(result.destination.entity.name, 'Nairobi');
    assert.equal(result.relation.sameCountry, true);
    assert.deepEqual(result.relation.originCountry, ['Kenya']);
});

test('E2: "Je, Kilifi iko karibu na Mombasa?" -> proximity, both resolved', () => {
    const CozyOS = freshStack();
    const result = CozyOS.CozyGeographyIndex.resolveQuery('Je, Kilifi iko karibu na Mombasa?', 'sw');
    assert.equal(result.intent, 'proximity');
    assert.equal(result.subject.entity.name, 'Kilifi');
    assert.equal(result.reference.entity.name, 'Mombasa');
    assert.equal(result.relation.sameCountry, true);
});

test('E3: "Ninatoka Kisumu lakini sasa ninaishi Nairobi." -> travel, multi-entity', () => {
    const CozyOS = freshStack();
    const result = CozyOS.CozyGeographyIndex.resolveQuery('Ninatoka Kisumu lakini sasa ninaishi Nairobi.', 'sw');
    assert.equal(result.intent, 'travel');
    assert.equal(result.origin.entity.name, 'Kisumu');
    assert.ok(result.destination.entity, 'destination should be recovered by scanning the remainder of the sentence');
    assert.equal(result.destination.entity.name, 'Nairobi');
});

test('E4: "Ni miji gani mikubwa Tanzania?" -> list_query returns Tanzania regional capitals', () => {
    const CozyOS = freshStack();
    const result = CozyOS.CozyGeographyIndex.resolveQuery('Ni miji gani mikubwa Tanzania?', 'sw');
    assert.equal(result.intent, 'list_query');
    assert.equal(result.country.entity.name, 'Tanzania');
    assert.equal(result.items.length, 31);
    assert.ok(result.items.includes('Dodoma'));
});

test('E5: "Dar es Salaam iko katika eneo gani?" -> location_question', () => {
    const CozyOS = freshStack();
    const result = CozyOS.CozyGeographyIndex.resolveQuery('Dar es Salaam iko katika eneo gani?', 'sw');
    assert.equal(result.intent, 'location_question');
    assert.equal(result.subject.entity.name, 'Dar es Salaam');
});

test('E6: "Ni maeneo gani ya pwani ya Kenya?" — no crash, honest null when no matching construction', () => {
    const CozyOS = freshStack();
    // This sentence does not match any of the implemented constructions
    // (it is a coastal-region listing question, out of this phase's
    // scope) — the module must return null rather than fabricate an
    // answer. Documented as a known limitation in the handoff.
    const result = CozyOS.CozyGeographyIndex.resolveQuery('Ni maeneo gani ya pwani ya Kenya?', 'sw');
    assert.equal(result, null);
});

// ---------------------------------------------------------------------
// F. Unfamiliar location handling — honest, not fabricated
// ---------------------------------------------------------------------

test('F1: unrecognized destination is reported unknownLocation:true, not guessed', () => {
    const CozyOS = freshStack();
    const result = CozyOS.CozyGeographyIndex.resolveQuery('Nataka kusafiri kutoka Mombasa hadi Zzyxlandia.', 'sw');
    assert.equal(result.intent, 'travel');
    assert.equal(result.origin.entity.name, 'Mombasa');
    assert.equal(result.destination.unknownLocation, true);
    assert.equal(result.destination.entity, null);
});

test('F2: language field always reflects the caller-supplied language, never silently changed to "en"', () => {
    const CozyOS = freshStack();
    const result = CozyOS.CozyGeographyIndex.resolveQuery('Nataka kusafiri kutoka Mombasa hadi Zzyxlandia.', 'sw');
    assert.equal(result.language, 'sw');
});

// ---------------------------------------------------------------------
// G. English control — no false positive geography-query firing
// ---------------------------------------------------------------------

test('G1: an ordinary English sentence with no geographic construction returns null', () => {
    const CozyOS = freshStack();
    const result = CozyOS.CozyGeographyIndex.resolveQuery('I would like to open my dashboard please.', 'en');
    assert.equal(result, null);
});

test('G2: English "from X to Y" phrasing is NOT matched by the Kiswahili kutoka...hadi construction', () => {
    const CozyOS = freshStack();
    const result = CozyOS.CozyGeographyIndex.resolveQuery('I am travelling from Mombasa to Nairobi.', 'en');
    // No Kiswahili construction present; travel-verb list is Kiswahili-
    // only, so this must not fire a travel intent.
    assert.equal(result, null);
});

// ---------------------------------------------------------------------
// H. Kiswahili control — a plain Kiswahili sentence with a travel verb
//    but no full construction still surfaces the entities honestly.
// ---------------------------------------------------------------------

test('H1: "Tunasafiri Nakuru wiki hii." -> travel_mention (no explicit from/to construction)', () => {
    const CozyOS = freshStack();
    const result = CozyOS.CozyGeographyIndex.resolveQuery('Tunasafiri Nakuru wiki hii.', 'sw');
    assert.equal(result.intent, 'travel_mention');
    assert.equal(result.entities.length, 1);
    assert.equal(result.entities[0].entity.name, 'Nakuru');
});

// ---------------------------------------------------------------------
// I. Existing files preserved (confirmed, not merely assumed)
// ---------------------------------------------------------------------

test('I1: loading the geography layer does not touch the 473-record lexicon', () => {
    const files = [LEXICON_PATH, KENYA_PATH, TANZANIA_PATH, UGANDA_PATH, EAST_AFRICA_PATH, CONTINENTAL_PATH, GEO_INDEX_PATH];
    files.forEach((p) => delete require.cache[require.resolve(p)]);
    global.window = {};
    require(LEXICON_PATH);
    const before = global.window.CozyOS.CozyLexiconEnSw.getRecordCount();
    // Load the entire new geography layer onto the SAME window object
    // the lexicon already attached to, then re-check the lexicon.
    require(KENYA_PATH);
    require(TANZANIA_PATH);
    require(UGANDA_PATH);
    require(EAST_AFRICA_PATH);
    require(CONTINENTAL_PATH);
    require(GEO_INDEX_PATH);
    const after = global.window.CozyOS.CozyLexiconEnSw.getRecordCount();
    assert.equal(before, 473);
    assert.equal(after, 473);
});
