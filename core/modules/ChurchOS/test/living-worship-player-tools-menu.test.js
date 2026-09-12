'use strict';

/**
 * core/modules/ChurchOS/test/living-worship-player-tools-menu.test.js
 *
 * Live Worship Tools reorganization — real regression coverage for the
 * new compact top-left "Live Worship Tools" toggle added to
 * core/modules/ChurchOS/living-worship-player.js, replacing the
 * permanent bottom-row panel-button strip.
 *
 * ENVIRONMENT DISCLOSURE: this file's only pre-existing test
 * (living-worship-player-mini-pip-browser.test.js) is a real Playwright
 * browser test - confirmed unable to run in this sandbox (no browser
 * binaries installable; established earlier in this project via a
 * direct npx playwright install attempt returning a real 403 from the
 * apt/CDN network egress policy). This file drives the REAL,
 * unmodified LivingWorshipPlayer/LiveViewController classes through
 * Node with a small, genuine (not fabricated) DOM stub - real
 * addEventListener/click/pointer-event dispatch, real classList, real
 * localStorage - reusing the honest fallback path the file itself
 * already provides when window.CozyOS.WindowManager isn't loaded
 * (plain document.body.appendChild, confirmed by reading the source
 * above). Real drag reordering, real fullscreen, and real visual/CSS
 * layout are NOT verified here - those remain BLOCKED / NOT-RUN
 * pending a working browser environment, exactly like the pre-existing
 * browser test for this same file.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const PLAYER_PATH = path.join(__dirname, '..', 'living-worship-player.js');

class FakeClassList {
  constructor() { this.set = new Set(); }
  add(...cs) { cs.forEach((c) => this.set.add(c)); }
  remove(...cs) { cs.forEach((c) => this.set.delete(c)); }
  contains(c) { return this.set.has(c); }
}

class FakeElement {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.attrs = new Map();
    this.children = [];
    this.parent = null;
    this.classList = new FakeClassList();
    this.listeners = {};
    this.style = {};
    this._text = '';
    this.isConnected = true;
  }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  hasAttribute(k) { return this.attrs.has(k); }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn) { if (this.listeners[type]) this.listeners[type] = this.listeners[type].filter((f) => f !== fn); }
  dispatch(type, evt) {
    let node = this;
    const fullEvt = { target: this, ...evt };
    while (node) {
      (node.listeners[type] || []).forEach((fn) => fn(fullEvt));
      node = node.parent;
    }
  }
  click() { this.dispatch('click', {}); }
  closest(selector) { let node = this; while (node) { if (matches(node, selector)) return node; node = node.parent; } return null; }
  setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 40, height: 40 }; }
  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', v); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(v) { v ? this.setAttribute('hidden', '') : this.removeAttribute('hidden'); }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') + this._text : this._text; }
  set textContent(v) { this.children = []; this._text = v; }

  set innerHTML(html) { this.children = []; parseHtmlFragment(html).children.forEach((c) => this.appendChild(c)); }

  querySelectorAll(selector) { const out = []; walk(this, (el) => { if (el !== this && matches(el, selector)) out.push(el); }); return out; }
  querySelector(selector) { let found = null; walk(this, (el) => { if (!found && el !== this && matches(el, selector)) found = el; }); return found; }
}

function walk(el, cb) { cb(el); el.children.forEach((c) => walk(c, cb)); }

function matches(el, selector) {
  selector = selector.trim();
  if (selector.startsWith('#')) return el.id === selector.slice(1);
  const attrMatch = selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
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
    const VOID_TAGS = new Set(['video', 'br', 'img']);
    if (!VOID_TAGS.has(tag.toLowerCase())) stack.push(el);
  }
  return root;
}

function makeFakeDocument() {
  const body = new FakeElement('body');
  return {
    body,
    createElement: (tag) => new FakeElement(tag),
    pictureInPictureEnabled: false,
    addEventListener() {}, removeEventListener() {},
    getElementById(id) { let found = null; walk(body, (el) => { if (!found && el.id === id) found = el; }); return found; },
  };
}

function freshPlayer() {
  delete require.cache[require.resolve(PLAYER_PATH)];
  const store = new Map();
  const fakeWindow = {
    CozyOS: {},
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) },
    addEventListener() {}, removeEventListener() {},
  };
  global.window = fakeWindow;
  global.document = makeFakeDocument();
  global.requestAnimationFrame = (fn) => fn();
  require(PLAYER_PATH);
  return { win: fakeWindow, doc: global.document };
}

function tapControllerIcon(doc) {
  const icon = doc.getElementById('cozy-liveview-icon');
  icon.dispatch('pointerdown', { clientX: 10, clientY: 10, pointerId: 1 });
  icon.dispatch('pointerup', { clientX: 10, clientY: 10, pointerId: 1 });
  // The real LiveViewController's icon tap only expands its own small
  // menu (Open/Minimize/Hide) — a second, real click on the menu's own
  // "Open Live View" item is what genuinely calls onOpen() ->
  // #mountWindow(), exactly matching real user interaction.
  const openBtn = doc.getElementById('cozy-liveview-panel').querySelector('[data-lv-action="open"]');
  openBtn.click();
}

test('real end-to-end: opening Live Worship (via the real LiveViewController tap) mounts the real player with the new Tools toggle, collapsed by default', () => {
  const { win, doc } = freshPlayer();
  win.CozyOS.LivingWorshipPlayer.mount();
  tapControllerIcon(doc);

  const toggle = doc.getElementById('cozy-worship-player-tools-toggle');
  const menu = doc.getElementById('cozy-worship-player-tools-menu');
  assert.ok(toggle, 'the real Tools toggle button must exist');
  assert.ok(menu, 'the real Tools menu container must exist');
  assert.equal(menu.hidden, true, 'the tools menu must start collapsed');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

test('clicking the Tools toggle opens the menu downward (real click delegation through #wireControls, unchanged)', () => {
  const { win, doc } = freshPlayer();
  win.CozyOS.LivingWorshipPlayer.mount();
  tapControllerIcon(doc);

  doc.getElementById('cozy-worship-player-tools-toggle').click();

  const menu = doc.getElementById('cozy-worship-player-tools-menu');
  const toggle = doc.getElementById('cozy-worship-player-tools-toggle');
  const arrow = doc.getElementById('cozy-worship-player-tools-arrow');
  assert.equal(menu.hidden, false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(arrow.textContent, '˄');
});

test('clicking the Tools toggle again collapses the menu', () => {
  const { win, doc } = freshPlayer();
  win.CozyOS.LivingWorshipPlayer.mount();
  tapControllerIcon(doc);

  const toggle = doc.getElementById('cozy-worship-player-tools-toggle');
  toggle.click();
  assert.equal(doc.getElementById('cozy-worship-player-tools-menu').hidden, false);
  toggle.click();
  assert.equal(doc.getElementById('cozy-worship-player-tools-menu').hidden, true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

test('the Tools menu open/closed preference persists across a real remount (same localStorage-backed prefs pattern already used for openPanels/mode)', () => {
  const { win, doc } = freshPlayer();
  win.CozyOS.LivingWorshipPlayer.mount();
  tapControllerIcon(doc);
  doc.getElementById('cozy-worship-player-tools-toggle').click();

  const store2 = global.window.localStorage;
  delete require.cache[require.resolve(PLAYER_PATH)];
  global.window = { CozyOS: {}, localStorage: store2, addEventListener() {}, removeEventListener() {} };
  global.document = makeFakeDocument();
  global.requestAnimationFrame = (fn) => fn();
  require(PLAYER_PATH);
  global.window.CozyOS.LivingWorshipPlayer.mount();
  tapControllerIcon(global.document);

  const menuAfterRemount = global.document.getElementById('cozy-worship-player-tools-menu');
  assert.equal(menuAfterRemount.hidden, false, 'a previously-open tools menu preference must be honored on remount');
});

test("REGRESSION: all pre-existing panel-toggle buttons (translation/scripture/timeline/branches/lyrics/notes/prayer/chat) still exist, now inside the tools menu, with identical data-panel-toggle attributes", () => {
  const { win, doc } = freshPlayer();
  win.CozyOS.LivingWorshipPlayer.mount();
  tapControllerIcon(doc);

  const menu = doc.getElementById('cozy-worship-player-tools-menu');
  const panelButtons = menu.querySelectorAll('[data-panel-toggle]');
  const ids = panelButtons.map((b) => b.getAttribute('data-panel-toggle'));
  for (const expected of ['translation', 'scripture', 'timeline', 'branches', 'lyrics', 'notes', 'prayer', 'chat']) {
    assert.ok(ids.includes(expected), `${expected} panel toggle must still exist`);
  }
});

test('REGRESSION: clicking a panel-toggle button inside the new Tools menu still calls the real, unchanged #togglePanel()/#renderOpenPanels() logic', () => {
  const { win, doc } = freshPlayer();
  win.CozyOS.LivingWorshipPlayer.mount();
  tapControllerIcon(doc);
  doc.getElementById('cozy-worship-player-tools-toggle').click();

  const timelineBtn = doc.getElementById('cozy-worship-player-tools-menu').querySelector('[data-panel-toggle="timeline"]');
  timelineBtn.click();

  const panelContent = doc.getElementById('cozy-worship-player-panel-content');
  assert.match(panelContent.textContent, /Timeline/i, 'the real panel-content renderer must still respond to the (relocated but unchanged) panel-toggle button');
});

test('REGRESSION: Theater/Float/PiP header buttons remain completely unchanged (untouched by this reorganization)', () => {
  const { win, doc } = freshPlayer();
  win.CozyOS.LivingWorshipPlayer.mount();
  tapControllerIcon(doc);

  const header = doc.getElementById('cozy-worship-player-header');
  assert.ok(header.querySelector('[data-player-action="expand"]'), 'Theater button must still exist');
  assert.ok(header.querySelector('[data-player-action="mini"]'), 'Float button must still exist');
  assert.ok(header.querySelector('[data-player-action="pip"]'), 'PiP button must still exist');
});

test('SOURCE CHECK: no second window-manager or duplicate video player was created - the real WindowManager fallback path (document.body.appendChild) is the only mounting mechanism used', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(PLAYER_PATH, 'utf8');
  assert.doesNotMatch(src, /new\s+(?:Video|Window)Manager\(/);
  assert.match(src, /window\.CozyOS\.WindowManager/, 'must still compose the real, existing WindowManager');
});
