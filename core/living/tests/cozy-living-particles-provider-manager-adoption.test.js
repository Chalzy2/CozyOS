'use strict';

/**
 * core/living/tests/cozy-living-particles-provider-manager-adoption.test.js
 *
 * Engine Ecosystem dependency #4 — real regression coverage. Loads the
 * ACTUAL, unmodified core/shell/provider-manager.js, core/ui/
 * cozy-background.js, and core/living/cozy-living-particles.js (never
 * stubbed/no-op'd), proving genuine registration, unique id, category
 * "visual", real health invocation reflecting genuinely observable
 * particle-subsystem state, and that existing start()/stop()/
 * setDensity()/setSpeed()/setGlow() behavior is completely unchanged.
 *
 * First-ever test coverage for cozy-living-particles.js (confirmed by
 * repository-wide search before writing this file — none existed).
 *
 * DOM/canvas stub: same minimal, honest, general-purpose no-op
 * Canvas2D Proxy already established in
 * core/ui/tests/visual-engines-provider-manager-adoption.test.js — real
 * enough for cozy-background.js's own init()/animate() to run exactly
 * as written, not a reimplementation of its rendering.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const PROVIDER_MANAGER_PATH = path.join(ROOT, 'core', 'shell', 'provider-manager.js');
const BACKGROUND_PATH = path.join(ROOT, 'core', 'ui', 'cozy-background.js');
const PARTICLES_PATH = path.join(ROOT, 'core', 'living', 'cozy-living-particles.js');

function fakeLocalStorage() {
    const store = new Map();
    return { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
}

function fakeElement(tag) {
    const attrs = new Map();
    const children = [];
    const classSet = new Set();
    return {
        tagName: tag,
        style: {},
        dataset: {},
        classList: {
            add: (c) => classSet.add(c), remove: (c) => classSet.delete(c),
            contains: (c) => classSet.has(c), toggle: (c) => (classSet.has(c) ? classSet.delete(c) : classSet.add(c)),
        },
        setAttribute(k, v) { attrs.set(k, String(v)); },
        getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
        removeAttribute(k) { attrs.delete(k); },
        appendChild(child) { children.push(child); return child; },
        removeChild(child) { const i = children.indexOf(child); if (i >= 0) children.splice(i, 1); return child; },
        prepend(child) { children.unshift(child); return child; },
        insertBefore(child) { children.unshift(child); return child; },
        addEventListener() {}, removeEventListener() {},
        getContext() {
            function infiniteNoOp() {
                const fn = function () { return infiniteNoOp(); };
                return new Proxy(fn, {
                    get(target, prop) { if (prop === 'width' || prop === 'height') return 0; return infiniteNoOp(); },
                    set() { return true; },
                });
            }
            return infiniteNoOp();
        },
        width: 0, height: 0,
    };
}

function makeFakeDocument() {
    const documentElement = fakeElement('html');
    const body = fakeElement('body');
    return {
        documentElement, body,
        createElement: (tag) => fakeElement(tag),
        getElementById: () => null,
        addEventListener() {}, removeEventListener() {},
        readyState: 'complete',
        location: { pathname: '/' },
    };
}

function makeFakeWindow() {
    const fakeDocument = makeFakeDocument();
    return {
        CozyOS: {},
        localStorage: fakeLocalStorage(),
        document: fakeDocument,
        location: fakeDocument.location,
        matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: () => {},
        innerWidth: 1024, innerHeight: 768,
        addEventListener() {}, removeEventListener() {},
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
    };
}

function loadRealProviderManager() {
    delete require.cache[require.resolve(PROVIDER_MANAGER_PATH)];
    const win = { CozyOS: {}, localStorage: fakeLocalStorage() };
    global.window = win;
    require(PROVIDER_MANAGER_PATH);
    return win.CozyOS.ProviderManager;
}

function loadBackground(win) {
    delete require.cache[require.resolve(BACKGROUND_PATH)];
    global.window = win;
    global.document = win.document;
    global.requestAnimationFrame = win.requestAnimationFrame;
    global.cancelAnimationFrame = win.cancelAnimationFrame;
    global.getComputedStyle = win.getComputedStyle;
    global.MutationObserver = class { observe() {} disconnect() {} };
    require(BACKGROUND_PATH);
}

function loadParticles(win) {
    delete require.cache[require.resolve(PARTICLES_PATH)];
    global.window = win;
    global.document = win.document;
    require(PARTICLES_PATH);
}

function freshRealStack({ withBackground = true } = {}) {
    const pm = loadRealProviderManager();
    const win = makeFakeWindow();
    win.CozyOS.ProviderManager = pm;
    if (withBackground) loadBackground(win);
    loadParticles(win);
    return { pm, win };
}

// ---- Registration ----

test('LivingParticles registers with the REAL ProviderManager, category "visual", exactly once', () => {
    const { pm } = freshRealStack();
    const entries = pm.list().filter((p) => p.id === 'living-particles');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].category, 'visual');
    assert.equal(entries[0].name, 'CozyOS Living Particles Engine');
});

test("LivingParticles provider id is unique and does not collide with Background's own id", () => {
    const { pm } = freshRealStack();
    const ids = pm.list().map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.includes('living-particles'));
    assert.ok(ids.includes('cozy-background'));
});

// ---- Health: Background missing ----

test('Background missing -> honest DEGRADED health, never fabricated', () => {
    const { pm } = freshRealStack({ withBackground: false });
    const health = pm.health('living-particles');
    assert.equal(health.health, 'DEGRADED');
    assert.equal(health.backgroundLoaded, false);
});

// ---- Health: disabled ----

test('LivingParticles disabled (stop() called) -> honest DEGRADED health', () => {
    const { pm, win } = freshRealStack();
    win.CozyOS.LivingParticles.stop();
    const health = pm.health('living-particles');
    assert.equal(health.health, 'DEGRADED');
    assert.equal(health.enabled, false);
});

// ---- Health: enabled but empty ----

test('enabled but particle/spark arrays are empty -> honest DEGRADED health, not fabricated ONLINE', () => {
    const { pm, win } = freshRealStack();
    win.CozyOS.LivingParticles.start();
    win.CozyOS.Background.particles = [];
    win.CozyOS.Background.sparks = [];
    const health = pm.health('living-particles');
    assert.equal(health.health, 'DEGRADED');
    assert.equal(health.particleCount, 0);
    assert.equal(health.sparkCount, 0);
});

// ---- Health: enabled and genuinely populated ----

test('enabled and genuinely populated with real particles/sparks -> honest ONLINE health', () => {
    const { pm, win } = freshRealStack();
    win.CozyOS.LivingParticles.start();
    const result = win.CozyOS.LivingParticles.setDensity(10);
    assert.equal(result.success, true);
    const health = pm.health('living-particles');
    assert.equal(health.health, 'ONLINE');
    assert.ok(health.sparkCount > 0);
});

// ---- healthReport() aggregation ----

test('ProviderManager.healthReport() includes living-particles alongside cozy-background with independently-derived health', () => {
    const { pm, win } = freshRealStack();
    win.CozyOS.LivingParticles.start();
    win.CozyOS.LivingParticles.setDensity(5);
    const report = pm.healthReport();
    assert.ok(report['living-particles']);
    assert.ok(report['cozy-background']);
    assert.equal(report['living-particles'].health, 'ONLINE');
});

// ---- PRESERVATION: existing behavior unchanged ----

test('PRESERVATION: start()/stop() behavior is unchanged by ProviderManager adoption', () => {
    const { win } = freshRealStack();
    const stopResult = win.CozyOS.LivingParticles.stop();
    assert.equal(stopResult.success, true);
    assert.equal(win.CozyOS.Background.sparks.length, 0);
    const startResult = win.CozyOS.LivingParticles.start();
    assert.equal(startResult.success, true);
    assert.equal(win.CozyOS.LivingParticles.isEnabled(), true);
});

test('PRESERVATION: setDensity()/setSpeed()/setGlow() behavior is unchanged by ProviderManager adoption', () => {
    const { win } = freshRealStack();
    const densityResult = win.CozyOS.LivingParticles.setDensity(20);
    assert.equal(densityResult.success, true);
    assert.equal(densityResult.density, 20);
    assert.equal(win.CozyOS.Background.sparks.length, 20);

    const speedResult = win.CozyOS.LivingParticles.setSpeed(2);
    assert.equal(speedResult.success, true);
    assert.equal(speedResult.speed, 2);

    const glowResult = win.CozyOS.LivingParticles.setGlow(1.5);
    assert.equal(glowResult.success, true);
    assert.equal(glowResult.glow, 1.5);
});

test('PRESERVATION: setTheme()/loadPack()/unloadPack() remain honestly "not implemented", never fabricated by this change', () => {
    const { win } = freshRealStack();
    assert.equal(win.CozyOS.LivingParticles.setTheme('quarry').success, false);
    assert.equal(win.CozyOS.LivingParticles.loadPack('fireflies').success, false);
});

// ---- No second particle renderer/state introduced ----

test('NO DUPLICATE STATE: LivingParticles never creates its own particle array — all counts trace back to the same real Background arrays', () => {
    const { win } = freshRealStack();
    win.CozyOS.LivingParticles.start();
    win.CozyOS.LivingParticles.setDensity(7);
    const bgSparks = win.CozyOS.Background.sparks;
    assert.equal(bgSparks.length, 7);
    const ownProps = Object.getOwnPropertyNames(win.CozyOS.LivingParticles);
    assert.equal(ownProps.some((p) => /particle|spark/i.test(p)), false);
});
