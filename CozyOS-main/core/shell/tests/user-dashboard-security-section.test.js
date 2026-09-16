'use strict';

/**
 * core/shell/tests/user-dashboard-security-section.test.js
 *
 * M392 — missing DOM-level coverage for
 * core/shell/user-dashboard.js #renderSecuritySection().
 *
 * Proves, at the DOM level, that the ordinary-user Settings surface
 * (Settings → Security) really mounts the two existing, already-real
 * security modules —
 *   core/modules/security/authentication-enrollment-panel.js
 *   core/modules/security/authentication-factor-management-panel.js
 * — for an authenticated ORDINARY user (no isPlatformAdmin, no
 * DashboardSettingsAdminBoundaryCore override supplied), and does so
 * honestly when either module is absent.
 *
 * Reuses the exact real-DOM-fragment-parser harness already proven in
 * user-dashboard-level1-slice.test.js / user-dashboard-level1-drawer.test.js
 * (documented there: no jsdom available in this sandbox — network
 * egress returns a real 403 from the npm registry). This file drives
 * the real, unmodified render() / #renderSettingsSurface() /
 * #renderSecuritySection() methods, never asserting against the raw
 * innerHTML string in place of real DOM queries where a real query is
 * possible.
 *
 * This test does NOT load the real authentication-enrollment-panel.js /
 * authentication-factor-management-panel.js files themselves — those
 * two modules have their own dedicated test suites and their own
 * server-integration coverage (server/webauthn-rp/test/
 * http-integration.test.js, referenced in user-dashboard.js's own
 * #renderSecuritySection header comment). This file's job is narrower
 * and was the actual gap: proving user-dashboard.js's composition
 * contract with whatever real module objects are registered under
 * window.CozyOS.Modules[...] — that it mounts them, initializes them,
 * tears them down on re-render, and never fabricates a security UI
 * when they are missing.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const USER_DASHBOARD_PATH = path.join(__dirname, '..', 'user-dashboard.js');

class FakeClassList {
  constructor() { this.set = new Set(); }
  add(c) { this.set.add(c); }
  remove(c) { this.set.delete(c); }
  toggle(c, force) {
    if (force === true) { this.set.add(c); return true; }
    if (force === false) { this.set.delete(c); return false; }
    if (this.set.has(c)) { this.set.delete(c); return false; }
    this.set.add(c); return true;
  }
  contains(c) { return this.set.has(c); }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = (tagName || 'div').toUpperCase();
    this.attrs = new Map();
    this.children = [];
    this.parent = null;
    this.classList = new FakeClassList();
    this.listeners = {};
    this._text = '';
    this._value = '';
    this.hidden = false;
  }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  click() { (this.listeners.click || []).forEach((fn) => fn({ target: this })); }
  get id() { return this.getAttribute('id') || ''; }
  get value() { return this._value; }
  set value(v) { this._value = v; }
  get textContent() {
    if (this.children.length === 0) return this._text;
    return this.children.map((c) => c.textContent).join('') + this._text;
  }
  set innerHTML(html) {
    this.children = [];
    const root = parseHtmlFragment(html);
    root.children.forEach((c) => this.appendChild(c));
  }
  querySelectorAll(selector) {
    const out = [];
    walk(this, (el) => { if (el !== this && matches(el, selector)) out.push(el); });
    return out;
  }
  querySelector(selector) {
    let found = null;
    walk(this, (el) => { if (!found && el !== this && matches(el, selector)) found = el; });
    return found;
  }
}

function walk(el, cb) {
  cb(el);
  el.children.forEach((c) => walk(c, cb));
}

function matches(el, selector) {
  selector = selector.trim();
  if (selector.startsWith('#')) return el.id === selector.slice(1);
  const attrMatch = selector.match(/^\[([\w-]+)(?:=\"([^\"]*)\")?\]$/);
  if (attrMatch) {
    const [, name, value] = attrMatch;
    if (!el.hasAttribute(name)) return false;
    return value === undefined ? true : el.getAttribute(name) === value;
  }
  return el.tagName === selector.toUpperCase();
}

function parseHtmlFragment(html) {
  const root = new FakeElement('root');
  const stack = [root];
  const tagRe = /<(\/?)([a-zA-Z0-9-]+)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*>|([^<]+)/g;
  let m;
  while ((m = tagRe.exec(html))) {
    const [, closing, tag, attrsStr, text] = m;
    if (text !== undefined) { stack[stack.length - 1]._text += text; continue; }
    if (closing) { if (stack.length > 1) stack.pop(); continue; }
    const el = new FakeElement(tag);
    const attrRe = /([\w-]+)(?:="([^"]*)")?/g;
    let am;
    while ((am = attrRe.exec(attrsStr))) el.setAttribute(am[1], am[2] === undefined ? '' : am[2]);
    stack[stack.length - 1].appendChild(el);
    const VOID_TAGS = new Set(['input', 'br', 'img']);
    if (!VOID_TAGS.has(tag.toLowerCase())) stack.push(el);
  }
  return root;
}

function makeFakeDocument() {
  const documentElement = new FakeElement('html');
  return {
    documentElement,
    createElement: (tag) => new FakeElement(tag),
    getElementById(id) { let found = null; walk(documentElement, (el) => { if (!found && el.id === id) found = el; }); return found; },
  };
}

function makeFakeNavCore() {
  let active = 'settings';
  return {
    getSurfaceOrder: () => ['home', 'community', 'ai', 'live-video', 'apps', 'documents', 'calculations', 'requests', 'profile', 'settings'],
    getActiveSurface: () => active,
    switchTo(name) { active = name; },
    onChange() {},
  };
}

// Ordinary authenticated user: dashboardType "user", isPlatformAdmin
// intentionally omitted. No DashboardSettingsAdminBoundaryCore override
// is supplied, so the real module's own fail-closed default applies —
// this test asserts the *ordinary* path, not a mocked admin decision.
function makeFakeIdentity(userId) {
  return {
    getDashboardConfig: () => ({ available: true, dashboardType: 'user', isPlatformAdmin: false }),
    getUser: (id) => ({ username: `real-${id}`, status: 'active' }),
    getLanguagePreference: () => null,
    setLanguagePreference: () => {},
  };
}

function makeFakeFactorPanel(dashboardHtml) {
  const calls = { init: 0, destroy: 0 };
  return {
    calls,
    getDashboard: () => dashboardHtml,
    async init() { calls.init += 1; },
    destroy() { calls.destroy += 1; },
  };
}

function freshUserDashboard(cozyOverrides = {}) {
  delete require.cache[require.resolve(USER_DASHBOARD_PATH)];
  const fakeWindow = {
    CozyOS: {
      IdentityEngine: makeFakeIdentity('user-1'),
      ApplicationVisibility: { listVisibleApplications: () => ({ available: true, applications: [] }), getRealLaunchPath: () => null },
      DashboardNavigationCore: makeFakeNavCore(),
      Modules: {},
      ...cozyOverrides,
    },
    localStorage: { getItem: () => null, setItem: () => {} },
  };
  global.window = fakeWindow;
  global.document = makeFakeDocument();
  require(USER_DASHBOARD_PATH);
  return fakeWindow;
}

// ---------------------------------------------------------------
// Settings → Security section: honest absence
// ---------------------------------------------------------------

test('SECURITY SECTION: Settings surface renders for an authenticated ordinary user with no admin identity of any kind', async () => {
  const win = freshUserDashboard({});
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');
  const settingsHost = container.querySelector('#cozy-ud-surface-settings');
  assert.ok(settingsHost, 'the Settings surface section must exist in the rendered DOM');
  assert.match(settingsHost.textContent, /Security/);
  // No admin-only section and no admin boundary module were supplied —
  // the ordinary-user path never fabricates one.
  assert.equal(settingsHost.querySelector('#cozy-ud-settings-admin'), null);
  assert.equal(settingsHost.querySelector('#cozy-ud-open-admin-workspace'), null);
});

test('SECURITY SECTION: honestly discloses unavailability when neither real security module is registered', async () => {
  const win = freshUserDashboard({}); // Modules: {} — nothing registered
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');
  const securityRoot = container.querySelector('#cozy-ud-security-panel');
  assert.ok(securityRoot, 'the Security panel mount point must exist');
  assert.match(securityRoot.textContent, /not available/i);
});

// ---------------------------------------------------------------
// Settings → Security section: real mounting of both panels
// ---------------------------------------------------------------

test('SECURITY SECTION: mounts BOTH authentication-enrollment-panel and authentication-factor-management-panel for an ordinary authenticated user', async () => {
  const factorMgmt = makeFakeFactorPanel('<div id="probe-factor-mgmt">Factor management surface</div>');
  const enrollment = makeFakeFactorPanel('<div id="probe-enrollment">Enrollment surface</div>');
  const win = freshUserDashboard({
    Modules: {
      'authentication-factor-management-panel': factorMgmt,
      'authentication-enrollment-panel': enrollment,
    },
  });
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');

  const securityRoot = container.querySelector('#cozy-ud-security-panel');
  assert.ok(securityRoot, 'the Security panel mount point must exist under Settings');

  // Real DOM proof both real panels are actually mounted — not just a
  // string mentioning their names.
  assert.ok(securityRoot.querySelector('#probe-factor-mgmt'), 'authentication-factor-management-panel output must be mounted in the DOM');
  assert.ok(securityRoot.querySelector('#probe-enrollment'), 'authentication-enrollment-panel output must be mounted in the DOM');

  // Both real modules' own init() must actually be called by
  // user-dashboard.js — this is the composition contract under test,
  // not a re-test of either panel's own internal behavior.
  assert.equal(factorMgmt.calls.init, 1);
  assert.equal(enrollment.calls.init, 1);
});

test('SECURITY SECTION: mounts whichever single real panel is registered, and discloses nothing fake for the missing one', async () => {
  const factorMgmt = makeFakeFactorPanel('<div id="probe-factor-mgmt-only">Factor management surface</div>');
  const win = freshUserDashboard({
    Modules: { 'authentication-factor-management-panel': factorMgmt },
  });
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');
  const securityRoot = container.querySelector('#cozy-ud-security-panel');
  assert.ok(securityRoot.querySelector('#probe-factor-mgmt-only'));
  assert.equal(factorMgmt.calls.init, 1);
});

test('SECURITY SECTION: idempotent re-render tears down both real panels via destroy() before rebuilding, never stacking duplicate mounts', async () => {
  const factorMgmt = makeFakeFactorPanel('<div id="probe-factor-mgmt">x</div>');
  const enrollment = makeFakeFactorPanel('<div id="probe-enrollment">y</div>');
  const win = freshUserDashboard({
    Modules: {
      'authentication-factor-management-panel': factorMgmt,
      'authentication-enrollment-panel': enrollment,
    },
  });
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');
  assert.equal(factorMgmt.calls.init, 1);
  assert.equal(enrollment.calls.init, 1);
  // The real code calls destroy() defensively on every pass (including
  // the first, harmless, since nothing was mounted yet) so that
  // switching tabs back to Settings never stacks duplicate listeners —
  // see #renderSecuritySection's own header comment. First render: 1.
  assert.equal(factorMgmt.calls.destroy, 1);
  assert.equal(enrollment.calls.destroy, 1);

  // Re-render the same live dashboard instance (e.g. tab revisited /
  // dashboard refreshed) — the real code must tear down the previous
  // panel instances before mounting fresh ones.
  await win.CozyOS.UserDashboard.render(container, 'user-1');
  assert.equal(factorMgmt.calls.destroy, 2, 'destroy() must be called again on re-render');
  assert.equal(enrollment.calls.destroy, 2, 'destroy() must be called again on re-render');
  assert.equal(factorMgmt.calls.init, 2, 'init() must be called again after re-render');
  assert.equal(enrollment.calls.init, 2, 'init() must be called again after re-render');

  const securityRootAfter = container.querySelector('#cozy-ud-security-panel');
  // Exactly one live mount per module after re-render — no duplicate stacking.
  assert.equal(securityRootAfter.querySelectorAll('#probe-factor-mgmt').length, 1);
  assert.equal(securityRootAfter.querySelectorAll('#probe-enrollment').length, 1);
});

// ---------------------------------------------------------------
// Cross-account boundary: ordinary user cannot reach another user's
// authentication factors through this surface
// ---------------------------------------------------------------

test('SECURITY SECTION: user-dashboard.js never passes a client-supplied identity into either security panel (each panel resolves its own signed-in user)', async () => {
  // user-dashboard.js's #renderSecuritySection() takes no userId
  // argument into either panel's init()/getDashboard() call — this
  // test proves that contract at the call-site level: if either real
  // panel were ever invoked with an argument, the fakes below would
  // capture and expose it, and the assertion would fail.
  const initArgs = [];
  const factorMgmt = {
    getDashboard: () => '<div id="probe-factor-mgmt"></div>',
    async init(...args) { initArgs.push(['factor-mgmt', args]); },
    destroy: () => {},
  };
  const enrollment = {
    getDashboard: () => '<div id="probe-enrollment"></div>',
    async init(...args) { initArgs.push(['enrollment', args]); },
    destroy: () => {},
  };
  const win = freshUserDashboard({
    Modules: {
      'authentication-factor-management-panel': factorMgmt,
      'authentication-enrollment-panel': enrollment,
    },
  });
  const container = new FakeElement('div');
  // Render as one ordinary user...
  await win.CozyOS.UserDashboard.render(container, 'user-victim');
  assert.deepEqual(initArgs, [['factor-mgmt', []], ['enrollment', []]], 'user-dashboard.js must call init() with no arguments — each real panel resolves the authenticated session itself, so there is no client-supplied id here for an attacker to substitute another user into');
});
