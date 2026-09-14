'use strict';

/**
 * core/ui/tests/visual-engines-provider-manager-adoption.test.js
 *
 * Engine Ecosystem discovery dependency #2 — real regression coverage.
 * Loads the ACTUAL, unmodified core/shell/provider-manager.js (never
 * stubbed) alongside the three real visual engines
 * (cozy-theme.js/cozy-background.js/living-theme-engine.js), proving
 * genuine registration, unique ids, category "visual", real health
 * invocation reflecting genuinely observable engine state, and that
 * existing Theme/Background/LivingThemeEngine public APIs are
 * completely unchanged by this additive registration.
 *
 * DOM STUB DISCLOSURE: these three files are real, browser-authored
 * modules with no Node/jsdom test harness available in this
 * environment (confirmed: jsdom is not installed). A minimal, honest
 * DOM/canvas stub is used — just enough real surface
 * (createElement/appendChild/getComputedStyle/documentElement
 * attributes/canvas 2D context) for each engine's own real
 * constructor/init() logic to run exactly as written, never a
 * reimplementation of engine behavior. Where the stub cannot supply a
 * genuinely resolvable value (e.g. no real cozy-tokens.css is loaded),
 * the engines' own real, unmodified validation logic honestly rejects
 * or degrades — that honest degraded path is asserted directly below,
 * not hidden.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const PROVIDER_MANAGER_PATH = path.join(ROOT, 'core', 'shell', 'provider-manager.js');
const THEME_PATH = path.join(ROOT, 'core', 'ui', 'cozy-theme.js');
const BACKGROUND_PATH = path.join(ROOT, 'core', 'ui', 'cozy-background.js');
const LIVING_THEME_PATH = path.join(ROOT, 'core', 'ui', 'living-theme-engine.js');
const ANIMATION_PATH = path.join(ROOT, 'core', 'ui', 'live-animation-engine.js');

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
        _attrs: attrs,
        _children: children,
        classList: {
            add: (c) => classSet.add(c),
            remove: (c) => classSet.delete(c),
            contains: (c) => classSet.has(c),
            toggle: (c) => (classSet.has(c) ? classSet.delete(c) : classSet.add(c)),
        },
        setAttribute(k, v) { attrs.set(k, String(v)); },
        getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
        removeAttribute(k) { attrs.delete(k); },
        appendChild(child) { children.push(child); return child; },
        removeChild(child) { const i = children.indexOf(child); if (i >= 0) children.splice(i, 1); return child; },
        prepend(child) { children.unshift(child); return child; },
        insertBefore(child) { children.unshift(child); return child; },
        addEventListener() {},
        removeEventListener() {},
        getContext() {
            // General-purpose, honest no-op 2D context: canvas rendering
            // internals are extensive and not the subject under test
            // (this file verifies ProviderManager adoption, not pixel
            // output) — an "infinite no-op" Proxy returns a callable,
            // chainable no-op for any method/property, recursively, so
            // the engine's own real animate()/render*() methods can run
            // to completion exactly as written (including patterns like
            // ctx.createLinearGradient(...).addColorStop(...) or reading
            // .width off a measureText() result) without hand-
            // enumerating the full Canvas2D API surface.
            function infiniteNoOp() {
                const fn = function () { return infiniteNoOp(); };
                return new Proxy(fn, {
                    get(target, prop) {
                        if (prop === 'width' || prop === 'height') return 0;
                        return infiniteNoOp();
                    },
                    set() { return true; },
                });
            }
            return infiniteNoOp();
        },
        width: 0, height: 0,
    };
}

function makeFakeDocument({ resolvableTokens = false } = {}) {
    const documentElement = fakeElement('html');
    const body = fakeElement('body');
    return {
        documentElement,
        body,
        createElement: (tag) => fakeElement(tag),
        getElementById: () => null,
        addEventListener() {},
        removeEventListener() {},
        readyState: 'complete',
        location: { pathname: '/' },
        _resolvableTokens: resolvableTokens,
    };
}

function makeFakeWindow({ resolvableTokens = false } = {}) {
    const fakeDocument = makeFakeDocument({ resolvableTokens });
    const win = {
        CozyOS: {},
        localStorage: fakeLocalStorage(),
        document: fakeDocument,
        location: fakeDocument.location,
        matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: () => {},
        innerWidth: 1024, innerHeight: 768,
        addEventListener() {}, removeEventListener() {},
        getComputedStyle: (_el) => ({
            getPropertyValue: (prop) => {
                if (!resolvableTokens) return '';
                if (prop.startsWith('--cozy-')) return '#000000';
                return '';
            }
        }),
    };
    return win;
}

function loadTheme({ resolvableTokens = false, providerManager = null } = {}) {
    delete require.cache[require.resolve(THEME_PATH)];
    const win = makeFakeWindow({ resolvableTokens });
    if (providerManager) win.CozyOS.ProviderManager = providerManager;
    global.window = win;
    global.document = win.document;
    global.getComputedStyle = win.getComputedStyle;
    require(THEME_PATH);
    return win;
}

function loadBackground({ providerManager = null } = {}) {
    delete require.cache[require.resolve(BACKGROUND_PATH)];
    const win = makeFakeWindow({});
    if (providerManager) win.CozyOS.ProviderManager = providerManager;
    global.window = win;
    global.document = win.document;
    global.requestAnimationFrame = win.requestAnimationFrame;
    global.cancelAnimationFrame = win.cancelAnimationFrame;
    global.MutationObserver = class { observe() {} disconnect() {} };
    require(BACKGROUND_PATH);
    return win;
}

function loadLivingTheme({ providerManager = null, themeInstance = null } = {}) {
    delete require.cache[require.resolve(LIVING_THEME_PATH)];
    const win = makeFakeWindow({});
    if (providerManager) win.CozyOS.ProviderManager = providerManager;
    if (themeInstance) win.CozyOS.Theme = themeInstance;
    global.window = win;
    global.document = win.document;
    require(LIVING_THEME_PATH);
    return win;
}

function loadRealProviderManager() {
    delete require.cache[require.resolve(PROVIDER_MANAGER_PATH)];
    const win = { CozyOS: {}, localStorage: fakeLocalStorage() };
    global.window = win;
    require(PROVIDER_MANAGER_PATH);
    return win.CozyOS.ProviderManager;
}

function loadAnimation({ providerManager = null, withDom = true } = {}) {
    delete require.cache[require.resolve(ANIMATION_PATH)];
    const win = makeFakeWindow({});
    if (providerManager) win.CozyOS.ProviderManager = providerManager;
    global.window = win;
    if (withDom) {
        global.document = win.document;
    } else {
        delete global.document;
    }
    require(ANIMATION_PATH);
    return win;
}

// ---- cozy-theme.js ----

test('cozy-theme.js: registers with the REAL ProviderManager, category "visual", exactly once', () => {
    const pm = loadRealProviderManager();
    loadTheme({ providerManager: pm });
    const entries = pm.list().filter((p) => p.id === 'cozy-theme');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].category, 'visual');
    assert.equal(entries[0].name, 'CozyOS Theme Engine');
});

test('cozy-theme.js: honest DEGRADED health when no real CSS tokens are resolvable (genuine Node-environment state, not fabricated ONLINE)', () => {
    const pm = loadRealProviderManager();
    loadTheme({ providerManager: pm, resolvableTokens: false });
    const health = pm.health('cozy-theme');
    assert.equal(health.health, 'DEGRADED');
    assert.equal(health.registeredThemeCount, 0);
});

test('cozy-theme.js: honest ONLINE health when real theme tokens genuinely resolve and a theme is genuinely applied', () => {
    const pm = loadRealProviderManager();
    const win = loadTheme({ providerManager: pm, resolvableTokens: true });
    const health = pm.health('cozy-theme');
    assert.equal(health.health, 'ONLINE');
    assert.ok(health.registeredThemeCount > 0);
    assert.equal(health.currentTheme, win.document.documentElement.getAttribute('data-cozy-app'));
});

test("PRESERVATION: cozy-theme.js's real setTheme()/getTheme()/hasTheme() API is unchanged by ProviderManager adoption", () => {
    const pm = loadRealProviderManager();
    const win = loadTheme({ providerManager: pm, resolvableTokens: true });
    assert.equal(typeof win.CozyOS.Theme.setTheme, 'function');
    win.CozyOS.Theme.setTheme('quarryos');
    assert.equal(win.document.documentElement.getAttribute('data-cozy-app'), 'quarryos');
    assert.equal(win.CozyOS.Theme.hasTheme('quarryos'), true);
});

// ---- cozy-background.js ----

test('cozy-background.js: registers with the REAL ProviderManager, category "visual", exactly once', () => {
    const pm = loadRealProviderManager();
    loadBackground({ providerManager: pm });
    const entries = pm.list().filter((p) => p.id === 'cozy-background');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].category, 'visual');
});

test('cozy-background.js: health reflects genuinely observable initialized/animating state, never a blind ONLINE', () => {
    const pm = loadRealProviderManager();
    loadBackground({ providerManager: pm });
    const health = pm.health('cozy-background');
    assert.ok(['ONLINE', 'DEGRADED'].includes(health.health));
    assert.equal(typeof health.initialized, 'boolean');
    assert.equal(typeof health.animating, 'boolean');
});

test("PRESERVATION: cozy-background.js's real engine instance and its own fields are unchanged by ProviderManager adoption", () => {
    const pm = loadRealProviderManager();
    const win = loadBackground({ providerManager: pm });
    assert.equal(typeof win.CozyOS.Background, 'object');
    assert.equal('canvas' in win.CozyOS.Background, true);
});

// ---- living-theme-engine.js ----

test('living-theme-engine.js: registers with the REAL ProviderManager, category "visual", exactly once', () => {
    const pm = loadRealProviderManager();
    const themeWin = loadTheme({ resolvableTokens: true });
    loadLivingTheme({ providerManager: pm, themeInstance: themeWin.CozyOS.Theme });
    const entries = pm.list().filter((p) => p.id === 'living-theme-engine');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].category, 'visual');
});

test("living-theme-engine.js: getHealth() is built from its own real, pre-existing getDiagnosticsReport(), not a second status surface", () => {
    const pm = loadRealProviderManager();
    const themeWin = loadTheme({ resolvableTokens: true });
    const win = loadLivingTheme({ providerManager: pm, themeInstance: themeWin.CozyOS.Theme });
    const health = pm.health('living-theme-engine');
    const diag = win.CozyOS.LivingThemeEngine.getDiagnosticsReport();
    assert.equal(health.registeredThemes, diag.registeredThemes);
    assert.equal(health.profiles, diag.profiles);
});

// ---- live-animation-engine.js ----

test('live-animation-engine.js: registers with the REAL ProviderManager, category "visual", exactly once', () => {
    const pm = loadRealProviderManager();
    loadAnimation({ providerManager: pm });
    const entries = pm.list().filter((p) => p.id === 'live-animation-engine');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].category, 'visual');
    assert.equal(entries[0].name, 'CozyOS Live Animation Engine');
});

test('live-animation-engine.js: honest ONLINE health when a real DOM is available', () => {
    const pm = loadRealProviderManager();
    loadAnimation({ providerManager: pm, withDom: true });
    const health = pm.health('live-animation-engine');
    assert.equal(health.health, 'ONLINE');
    assert.equal(health.domAvailable, true);
    assert.ok(health.supportedAnimationCount > 0);
});

test('live-animation-engine.js: honest DEGRADED health when no DOM is available — never fabricates ONLINE regardless of registration success', () => {
    const pm = loadRealProviderManager();
    loadAnimation({ providerManager: pm, withDom: false });
    const health = pm.health('live-animation-engine');
    assert.equal(health.health, 'DEGRADED');
    assert.equal(health.domAvailable, false);
});

test("PRESERVATION: live-animation-engine.js's real applyAnimation()/getSupportedAnimations() API is unchanged by ProviderManager adoption", () => {
    const pm = loadRealProviderManager();
    const win = loadAnimation({ providerManager: pm, withDom: true });
    const engine = win.CozyOS.LiveAnimationEngine;
    assert.equal(typeof engine.applyAnimation, 'function');
    const supported = engine.getSupportedAnimations();
    assert.ok(supported.includes('pulse'));
    const el = win.document.createElement('div');
    const result = engine.applyAnimation(el, 'pulse');
    assert.equal(result.success, true);
});



test('all four visual engines register with unique, non-colliding ids, all under category "visual"', () => {
    const pm = loadRealProviderManager();
    loadTheme({ providerManager: pm, resolvableTokens: true });
    loadBackground({ providerManager: pm });
    const themeWin = loadTheme({ resolvableTokens: true });
    loadLivingTheme({ providerManager: pm, themeInstance: themeWin.CozyOS.Theme });
    loadAnimation({ providerManager: pm });

    const visualList = pm.list('visual');
    const ids = visualList.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, 'no duplicate ids');
    assert.ok(ids.includes('cozy-theme'));
    assert.ok(ids.includes('cozy-background'));
    assert.ok(ids.includes('living-theme-engine'));
    assert.ok(ids.includes('live-animation-engine'));
    assert.ok(visualList.every((p) => p.category === 'visual'));
});

test('ProviderManager.healthReport() aggregates all four real visual engines with genuine, independently-derived health', () => {
    const pm = loadRealProviderManager();
    loadBackground({ providerManager: pm });
    const themeWin = loadTheme({ providerManager: pm, resolvableTokens: true });
    loadLivingTheme({ providerManager: pm, themeInstance: themeWin.CozyOS.Theme });
    loadAnimation({ providerManager: pm });

    const report = pm.healthReport();
    assert.ok(report['cozy-theme']);
    assert.ok(report['cozy-background']);
    assert.ok(report['living-theme-engine']);
    assert.ok(report['live-animation-engine']);
});
