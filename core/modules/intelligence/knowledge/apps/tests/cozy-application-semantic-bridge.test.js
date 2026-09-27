'use strict';

/**
 * core/modules/intelligence/knowledge/apps/tests/cozy-application-semantic-bridge.test.js
 * EXECUTED via `node --test` this session. Covers the project's own
 * "Kiswahili Application Intent Map" (section C) sample phrases, plus
 * the "Test Matrix" (section J): known-direct, paraphrase-adjacent,
 * morphological variation, and an English negative control.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..', '..');
const BRIDGE_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'apps', 'cozy-application-semantic-bridge.js');
const LEXICON_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-lexicon-en-sw.js');

function freshStack() {
    delete require.cache[require.resolve(BRIDGE_PATH)];
    global.window = {};
    require(BRIDGE_PATH);
    return global.window.CozyOS;
}

test('A1: capability coverage is exactly the 6 named in the project intent map', () => {
    const CozyOS = freshStack();
    const counts = CozyOS.CozyApplicationSemanticBridge.getCounts();
    assert.equal(counts.total, 6);
    assert.equal(counts.shopos, 3);
    assert.equal(counts.churchos, 2);
    assert.equal(counts.quarryos, 1);
});

test('B1: known-direct — inventory lookup, HIGH confidence', () => {
    const CozyOS = freshStack();
    const r = CozyOS.CozyApplicationSemanticBridge.resolveApplicationIntent('Nionyeshe bidhaa zilizopo dukani.');
    assert.equal(r.domain, 'shopos');
    assert.equal(r.capability, 'inventory.lookup');
    assert.equal(r.confidence, 'HIGH');
});

test('B2: sales report resolves to shopos/sales.report', () => {
    const CozyOS = freshStack();
    const r = CozyOS.CozyApplicationSemanticBridge.resolveApplicationIntent('Niambie mauzo ya leo.');
    assert.equal(r.domain, 'shopos');
    assert.equal(r.capability, 'sales.report');
});

test('B3: profit question resolves to shopos/business.profit, not sales.report', () => {
    const CozyOS = freshStack();
    const r = CozyOS.CozyApplicationSemanticBridge.resolveApplicationIntent('Faida yangu ya mwezi huu ni kiasi gani?');
    assert.equal(r.domain, 'shopos');
    assert.equal(r.capability, 'business.profit');
});

test('B4: church member count', () => {
    const CozyOS = freshStack();
    const r = CozyOS.CozyApplicationSemanticBridge.resolveApplicationIntent('Washiriki wetu wako wangapi?');
    assert.equal(r.domain, 'churchos');
    assert.equal(r.capability, 'church.members.count');
});

test('B5: church member regional listing', () => {
    const CozyOS = freshStack();
    const r = CozyOS.CozyApplicationSemanticBridge.resolveApplicationIntent('Nionyeshe washiriki wa Kilifi.');
    assert.equal(r.domain, 'churchos');
    assert.equal(r.capability, 'church.members.list');
    assert.equal(r.confidence, 'HIGH');
});

test('B6: quarry truck lookup', () => {
    const CozyOS = freshStack();
    const r = CozyOS.CozyApplicationSemanticBridge.resolveApplicationIntent('Lori limefika machimboni?');
    assert.equal(r.domain, 'quarryos');
    assert.equal(r.capability, 'quarry.truck.lookup');
    assert.equal(r.confidence, 'HIGH');
});

test('C1: natural Kenyan colloquial register still resolves inventory.lookup', () => {
    const CozyOS = freshStack();
    const r = CozyOS.CozyApplicationSemanticBridge.resolveApplicationIntent('Niko chonjo, nionyeshe mzigo uliobaki.');
    assert.equal(r.domain, 'shopos');
    assert.equal(r.capability, 'inventory.lookup');
});

test('C2: code-switched/urban blend register resolves inventory.lookup', () => {
    const CozyOS = freshStack();
    const r = CozyOS.CozyApplicationSemanticBridge.resolveApplicationIntent('Boss, niambie stock ya leo.');
    assert.equal(r.domain, 'shopos');
    assert.equal(r.capability, 'inventory.lookup');
});

test('D1: morphological variation ("walituonyesha" — 3rd person plural past + object marker) still resolves inventory.lookup', () => {
    const CozyOS = freshStack();
    const r = CozyOS.CozyApplicationSemanticBridge.resolveApplicationIntent('Walituonyesha bidhaa zilizobaki.');
    assert.ok(r, 'a conjugated form of the same root should still resolve, since matching is not \\b-anchored at the start');
    assert.equal(r.domain, 'shopos');
    assert.equal(r.capability, 'inventory.lookup');
});

test('E1: English negative control returns null (no domain false-positive)', () => {
    const CozyOS = freshStack();
    const r = CozyOS.CozyApplicationSemanticBridge.resolveApplicationIntent('Show me the inventory.');
    assert.equal(r, null);
});

test('F1: an unrelated Kiswahili sentence with no domain vocabulary returns null (honest, not fabricated)', () => {
    const CozyOS = freshStack();
    const r = CozyOS.CozyApplicationSemanticBridge.resolveApplicationIntent('Habari za asubuhi, hali gani leo?');
    assert.equal(r, null);
});

test('G1: loading the app-bridge layer does not touch the 473-record lexicon', () => {
    delete require.cache[require.resolve(LEXICON_PATH)];
    global.window = {};
    require(LEXICON_PATH);
    const before = global.window.CozyOS.CozyLexiconEnSw.getRecordCount();
    require(BRIDGE_PATH);
    const after = global.window.CozyOS.CozyLexiconEnSw.getRecordCount();
    assert.equal(before, 473);
    assert.equal(after, 473);
});
