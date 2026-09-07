'use strict';

/**
 * core/shell/tests/user-dashboard-level1-drawer.test.js
 *
 * Level 1 master drawer — real regression coverage for the new drawer
 * added to core/shell/user-dashboard.js.
 *
 * ENVIRONMENT DISCLOSURE: no jsdom/htmlparser2/node-html-parser is
 * available in this sandbox (confirmed: npm install returns a real
 * 403 from the registry — the same network-egress restriction already
 * documented elsewhere in this project). The tests below drive the
 * REAL, unmodified render()/#wireDrawer()/#renderDrawerApps() methods
 * against a small, genuine (not fabricated) HTML-fragment parser and
 * DOM implementation built for this file — createElement/appendChild/
 * classList/getAttribute/querySelector(All)/getElementById/
 * addEventListener all behave as real DOM operations, parsing the
 * REAL innerHTML string render() actually produces, rather than
 * asserting against that string directly. This is the same "prove it
 * against the real component" discipline used throughout this project,
 * adapted to a real HTML-parsing gap this sandbox has no library for.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const USER_DASHBOARD_PATH = path.join(__dirname, '..', 'user-dashboard.js');

class FakeClassList {
  constructor(el) { this.el = el; this.set = new Set(); }
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
    this.classList = new FakeClassList(this);
    this.listeners = {};
    this.style = {};
    this._text = '';
  }
  setAttribute(k, v) { this.attrs.set(k, String(v)); if (k === 'class') { this.classList.set = new Set(String(v).split(/\s+/).filter(Boolean)); } }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  hasAttribute(k) { return this.attrs.has(k); }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn) { if (this.listeners[type]) this.listeners[type] = this.listeners[type].filter((f) => f !== fn); }
  click() { (this.listeners.click || []).forEach((fn) => fn({ target: this })); }
  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', v); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(v) { v ? this.setAttribute('hidden', '') : this.removeAttribute('hidden'); }

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
  if (selector.startsWith('.')) return el.classList.contains(selector.slice(1));
  const attrMatch = selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
  if (attrMatch) {
    const [, name, value] = attrMatch;
    if (!el.hasAttribute(name)) return false;
    return value === undefined ? true : el.getAttribute(name) === value;
  }
  const tagAttrMatch = selector.match(/^([\w-]+)\[([\w-]+)(?:="([^"]*)")?\]$/);
  if (tagAttrMatch) {
    const [, tag, name, value] = tagAttrMatch;
    if (el.tagName !== tag.toUpperCase()) return false;
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
    if (text !== undefined) {
      const parent = stack[stack.length - 1];
      parent._text += text;
      continue;
    }
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const el = new FakeElement(tag);
    const attrRe = /([\w-]+)(?:="([^"]*)")?/g;
    let am;
    while ((am = attrRe.exec(attrsStr))) {
      el.setAttribute(am[1], am[2] === undefined ? '' : am[2]);
    }
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
    getElementById(id) {
      let found = null;
      walk(documentElement, (el) => { if (!found && el.id === id) found = el; });
      return found;
    },
  };
}

function makeFakeNavCore() {
  let active = 'home';
  const listeners = [];
  return {
    getSurfaceOrder: () => ['home', 'community', 'ai', 'apps', 'settings'],
    getActiveSurface: () => active,
    switchTo(name) { active = name; listeners.forEach((fn) => fn()); },
    onChange(fn) { listeners.push(fn); },
  };
}

function freshUserDashboard({ visibleApps, applicationLauncher } = {}) {
  delete require.cache[require.resolve(USER_DASHBOARD_PATH)];
  const fakeWindow = {
    CozyOS: {
      IdentityEngine: { getDashboardConfig: () => ({ available: true, dashboardType: 'user' }) },
      ApplicationVisibility: {
        listVisibleApplications: () => visibleApps,
        getRealLaunchPath: () => null,
      },
      DashboardNavigationCore: makeFakeNavCore(),
      ApplicationLauncher: applicationLauncher,
    },
    localStorage: { getItem: () => null, setItem: () => {} },
  };
  global.window = fakeWindow;
  global.document = makeFakeDocument();
  require(USER_DASHBOARD_PATH);
  return fakeWindow;
}

const AUTHORIZED_APPS = { available: true, applications: [{ appId: 'quarryos', name: 'QuarryOS', kind: 'application' }] };

function makeFakeLauncher(overrides = {}) {
  const openIds = new Set();
  const calls = { open: [], close: [] };
  return {
    calls,
    open(appId) { calls.open.push(appId); openIds.add(appId); return Promise.resolve({ success: true }); },
    close(appId) { calls.close.push(appId); openIds.delete(appId); },
    isOpen(appId) { return openIds.has(appId); },
    listOpen() { return Array.from(openIds); },
    ...overrides,
  };
}

test('render() produces a real menu button, drawer, overlay, and #cozy-workspace-root mount point', async () => {
  const win = freshUserDashboard({ visibleApps: AUTHORIZED_APPS });
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');

  assert.ok(container.querySelector('#cozy-ud-menu-btn'), 'a real menu button must exist');
  assert.ok(container.querySelector('#cozy-ud-drawer'), 'a real drawer element must exist');
  assert.ok(container.querySelector('#cozy-ud-drawer-overlay'), 'a real overlay element must exist');
  assert.ok(container.querySelector('#cozy-workspace-root'), 'the real ApplicationLauncher mount point must exist');
});

test('clicking the menu button opens the drawer (adds cozy-ud-drawer-open); clicking again closes it', async () => {
  const win = freshUserDashboard({ visibleApps: AUTHORIZED_APPS });
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');

  const menuBtn = container.querySelector('#cozy-ud-menu-btn');
  const shell = container.querySelector('#cozy-user-dashboard');
  assert.equal(shell.classList.contains('cozy-ud-drawer-open'), false);

  menuBtn.click();
  assert.equal(shell.classList.contains('cozy-ud-drawer-open'), true);
  assert.equal(menuBtn.getAttribute('aria-expanded'), 'true');

  menuBtn.click();
  assert.equal(shell.classList.contains('cozy-ud-drawer-open'), false);
  assert.equal(menuBtn.getAttribute('aria-expanded'), 'false');
});

test('clicking the overlay closes the drawer', async () => {
  const win = freshUserDashboard({ visibleApps: AUTHORIZED_APPS });
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');

  const menuBtn = container.querySelector('#cozy-ud-menu-btn');
  const overlay = container.querySelector('#cozy-ud-drawer-overlay');
  const shell = container.querySelector('#cozy-user-dashboard');

  menuBtn.click();
  assert.equal(shell.classList.contains('cozy-ud-drawer-open'), true);
  overlay.click();
  assert.equal(shell.classList.contains('cozy-ud-drawer-open'), false);
});

test('selecting a CozyOS surface link inside the drawer switches surfaces (reusing the existing [data-nav-surface] wiring) and closes the drawer', async () => {
  const win = freshUserDashboard({ visibleApps: AUTHORIZED_APPS });
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');

  const menuBtn = container.querySelector('#cozy-ud-menu-btn');
  const shell = container.querySelector('#cozy-user-dashboard');
  menuBtn.click();

  const drawer = container.querySelector('#cozy-ud-drawer');
  const settingsLink = drawer.querySelectorAll('[data-nav-surface="settings"]')[0];
  assert.ok(settingsLink, 'a drawer link for the settings surface must exist');
  settingsLink.click();

  assert.equal(win.CozyOS.DashboardNavigationCore.getActiveSurface(), 'settings');
  assert.equal(shell.classList.contains('cozy-ud-drawer-open'), false, 'selecting a surface must close the drawer');
});

test("an authorized application appears in the drawer's application list", async () => {
  const win = freshUserDashboard({ visibleApps: AUTHORIZED_APPS });
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');

  const list = container.querySelector('#cozy-ud-drawer-apps-list');
  const entries = list.querySelectorAll('[data-drawer-open-app]');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].getAttribute('data-drawer-open-app'), 'quarryos');
});

test('an application NOT returned by ApplicationVisibility.listVisibleApplications() never appears in the drawer (no fabricated entries)', async () => {
  const win = freshUserDashboard({ visibleApps: { available: true, applications: [] } });
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');

  const list = container.querySelector('#cozy-ud-drawer-apps-list');
  const entries = list.querySelectorAll('[data-drawer-open-app]');
  assert.equal(entries.length, 0, 'no application should be exposed when the real authorization source returns none');
  assert.match(list.textContent, /No applications have been assigned/i);
});

test('when ApplicationVisibility itself reports unavailable, the drawer shows the real honest reason, never a fabricated app list', async () => {
  const win = freshUserDashboard({ visibleApps: { available: false, reason: 'ApplicationVisibility is not loaded.' } });
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');

  const list = container.querySelector('#cozy-ud-drawer-apps-list');
  assert.match(list.textContent, /ApplicationVisibility is not loaded/);
  assert.equal(list.querySelectorAll('[data-drawer-open-app]').length, 0);
});

test('clicking an application entry calls the real, canonical window.CozyOS.ApplicationLauncher.open() with the correct appId', async () => {
  const calls = [];
  const fakeLauncher = { open: (appId) => { calls.push(appId); return Promise.resolve({ success: true }); } };
  const win = freshUserDashboard({ visibleApps: AUTHORIZED_APPS, applicationLauncher: fakeLauncher });
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');

  const entry = container.querySelector('[data-drawer-open-app="quarryos"]');
  entry.click();

  assert.deepEqual(calls, ['quarryos']);
});

test('clicking an application entry also closes the drawer', async () => {
  const fakeLauncher = { open: () => Promise.resolve({ success: true }) };
  const win = freshUserDashboard({ visibleApps: AUTHORIZED_APPS, applicationLauncher: fakeLauncher });
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');

  const menuBtn = container.querySelector('#cozy-ud-menu-btn');
  const shell = container.querySelector('#cozy-user-dashboard');
  menuBtn.click();
  assert.equal(shell.classList.contains('cozy-ud-drawer-open'), true);

  container.querySelector('[data-drawer-open-app="quarryos"]').click();
  assert.equal(shell.classList.contains('cozy-ud-drawer-open'), false);
});

test('if ApplicationLauncher is not loaded, clicking an application entry does not throw (honest no-op, never a fabricated launch)', async () => {
  const win = freshUserDashboard({ visibleApps: AUTHORIZED_APPS, applicationLauncher: undefined });
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');

  const entry = container.querySelector('[data-drawer-open-app="quarryos"]');
  assert.doesNotThrow(() => entry.click());
});

test('SOURCE CHECK: this change never calls into or requires cozy-workspace.js — the Administrator Workspace remains a separate file, untouched by this change (pre-existing historical comments about it are unaffected)', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(USER_DASHBOARD_PATH, 'utf8');
  assert.doesNotMatch(src, /require\(['"].*cozy-workspace\.js['"]\)/);
  assert.doesNotMatch(src, /window\.CozyOS\.WorkspaceShell\.render/);
});

function flushMicrotasks() { return new Promise((resolve) => setTimeout(resolve, 0)); }

// ---- Level 2: application-specific expandable navigation ----

test('LEVEL 2: an application row starts collapsed (panel hidden, arrow not expanded)', async () => {
  const win = freshUserDashboard({ visibleApps: AUTHORIZED_APPS, applicationLauncher: makeFakeLauncher() });
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');

  const panel = container.querySelector('[data-drawer-app-panel="quarryos"]');
  const toggle = container.querySelector('[data-drawer-toggle-app="quarryos"]');
  assert.equal(panel.hidden, true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

test('LEVEL 2: clicking the app row toggle expands it (panel visible, arrow expanded) without launching or closing the app', async () => {
  const launcher = makeFakeLauncher();
  const win = freshUserDashboard({ visibleApps: AUTHORIZED_APPS, applicationLauncher: launcher });
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');

  container.querySelector('[data-drawer-toggle-app="quarryos"]').click();

  const panel = container.querySelector('[data-drawer-app-panel="quarryos"]');
  const toggle = container.querySelector('[data-drawer-toggle-app="quarryos"]');
  assert.equal(panel.hidden, false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(launcher.calls.open, [], 'expanding must never call ApplicationLauncher.open()');
  assert.deepEqual(launcher.calls.close, [], 'expanding must never call ApplicationLauncher.close()');
});

test('LEVEL 2: clicking the toggle again collapses it back', async () => {
  const win = freshUserDashboard({ visibleApps: AUTHORIZED_APPS, applicationLauncher: makeFakeLauncher() });
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');

  const toggle = container.querySelector('[data-drawer-toggle-app="quarryos"]');
  toggle.click();
  assert.equal(container.querySelector('[data-drawer-app-panel="quarryos"]').hidden, false);
  toggle.click();
  assert.equal(container.querySelector('[data-drawer-app-panel="quarryos"]').hidden, true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

test('LEVEL 2: expanding/collapsing never touches Level 1 drawer open/close state (independent controls)', async () => {
  const win = freshUserDashboard({ visibleApps: AUTHORIZED_APPS, applicationLauncher: makeFakeLauncher() });
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');

  const menuBtn = container.querySelector('#cozy-ud-menu-btn');
  const shell = container.querySelector('#cozy-user-dashboard');
  menuBtn.click(); // open Level 1 drawer
  assert.equal(shell.classList.contains('cozy-ud-drawer-open'), true);

  container.querySelector('[data-drawer-toggle-app="quarryos"]').click(); // Level 2 expand
  assert.equal(shell.classList.contains('cozy-ud-drawer-open'), true, 'Level 1 drawer must remain open after a Level 2 expand');
});

test('LEVEL 1 REGRESSION: the drawer still opens/closes normally with Level 2 present', async () => {
  const win = freshUserDashboard({ visibleApps: AUTHORIZED_APPS, applicationLauncher: makeFakeLauncher() });
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');

  const menuBtn = container.querySelector('#cozy-ud-menu-btn');
  const shell = container.querySelector('#cozy-user-dashboard');
  menuBtn.click();
  assert.equal(shell.classList.contains('cozy-ud-drawer-open'), true);
  menuBtn.click();
  assert.equal(shell.classList.contains('cozy-ud-drawer-open'), false);
});

test('LEVEL 2: the nested "Open" sub-link calls the real, canonical ApplicationLauncher.open() with the correct appId', async () => {
  const launcher = makeFakeLauncher();
  const win = freshUserDashboard({ visibleApps: AUTHORIZED_APPS, applicationLauncher: launcher });
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');

  container.querySelector('[data-drawer-toggle-app="quarryos"]').click();
  container.querySelector('[data-drawer-open-app="quarryos"]').click();
  await flushMicrotasks();

  assert.deepEqual(launcher.calls.open, ['quarryos']);
});

test('LEVEL 2: "Close" is hidden until the app is genuinely open (ApplicationLauncher.isOpen()), then appears after Open, then hides again after Close', async () => {
  const launcher = makeFakeLauncher();
  const win = freshUserDashboard({ visibleApps: AUTHORIZED_APPS, applicationLauncher: launcher });
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');

  container.querySelector('[data-drawer-toggle-app="quarryos"]').click();
  let closeBtn = container.querySelector('[data-drawer-close-app="quarryos"]');
  assert.equal(closeBtn.hidden, true, 'Close must be hidden before the app is genuinely open');

  container.querySelector('[data-drawer-open-app="quarryos"]').click();
  await flushMicrotasks();

  closeBtn = container.querySelector('[data-drawer-close-app="quarryos"]');
  assert.equal(closeBtn.hidden, false, 'Close must appear once ApplicationLauncher.isOpen() genuinely reports true');

  closeBtn.click();
  const closeBtnAfter = container.querySelector('[data-drawer-close-app="quarryos"]');
  assert.deepEqual(launcher.calls.close, ['quarryos']);
  assert.equal(closeBtnAfter.hidden, true, 'Close must hide again once the app is genuinely closed');
});

test('LEVEL 2: an unauthorized application never has ANY nested destination exposed (no row exists at all)', async () => {
  const win = freshUserDashboard({ visibleApps: { available: true, applications: [] }, applicationLauncher: makeFakeLauncher() });
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-1');

  assert.equal(container.querySelector('[data-drawer-toggle-app="developer-hub"]'), null);
  assert.equal(container.querySelector('[data-drawer-open-app="developer-hub"]'), null);
});


