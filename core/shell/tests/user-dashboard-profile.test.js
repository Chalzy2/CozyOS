'use strict';

/**
 * core/shell/tests/user-dashboard-profile.test.js
 * User Profile Phase 1 — Profile surface of core/shell/user-dashboard.js
 * driven through the same real-DOM-fragment-parser harness as
 * user-dashboard-level1-slice.test.js (no jsdom in this repository).
 * The real user-dashboard.js, dashboard-profile-core.js and (in the
 * integration tests) the real IdentityEngine run unmodified; only the
 * DOM, URL.createObjectURL and IdentityStorage are faked.
 * Real-browser layout/overflow/persistence coverage lives in
 * profile-phase1-browser.test.js.
 * Run: node core/shell/tests/user-dashboard-profile.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const USER_DASHBOARD_PATH = path.join(__dirname, '..', 'user-dashboard.js');
const PROFILE_CORE_PATH = path.join(__dirname, '..', 'dashboard-profile-core.js');
const IDENTITY_ENGINE_PATH = path.join(__dirname, '..', '..', 'modules', 'identity', 'identity-engine.js');

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
  }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  click() { (this.listeners.click || []).forEach((fn) => fn({ target: this })); }
  get id() { return this.getAttribute('id') || ''; }
  // Mirrors real-browser defaults (as user-dashboard-level1-slice.test.js notes for <select>): an
  // untouched input reports its value attribute, an untouched <select> its selected/first option.
  get value() {
    if (this._valueSet) return this._value;
    if (this.tagName === 'SELECT') {
      const opts = this.querySelectorAll('option');
      const chosen = opts.find((o) => o.hasAttribute('selected')) || opts[0];
      return chosen ? chosen.getAttribute('value') || '' : '';
    }
    const attr = this.getAttribute('value');
    return attr === null ? this._value : attr.replace(/&(quot|amp|lt|gt|#39);/g, (m) => ({ '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&#39;': "'" }[m]));
  }
  set value(v) { this._value = v; this._valueSet = true; }
  get textContent() {
    if (this.children.length === 0) return this._text;
    return this.children.map((c) => c.textContent).join('') + this._text;
  }
  set innerHTML(html) {
    this.children = [];
    const root = parseHtmlFragment(html);
    this._text = root._text; // (the shared harness drops top-level text; plain-text innerHTML must keep it)
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
  let active = 'profile';
  return {
    getSurfaceOrder: () => ['home', 'community', 'ai', 'live-video', 'apps', 'documents', 'calculations', 'requests', 'profile', 'settings'],
    getActiveSurface: () => active,
    switchTo(name) { active = name; },
    onChange() {},
  };
}

/** In-memory engine implementing the getProfile()/updateProfile() CONTRACT (the real engine is exercised separately below). */
function makeFakeEngine(initial = {}, opts = {}) {
  const rec = { firstName: null, lastName: null, country: null, city: null, ...initial };
  const calls = [];
  return {
    calls,
    rec,
    getDashboardConfig: () => ({ available: true, dashboardType: 'user' }),
    getUser: (id) => ({ username: `real-${id}`, status: 'active' }),
    getProfile: () => ({ available: true, ...rec }),
    updateProfile: async (id, changes) => {
      calls.push([id, changes]);
      if (opts.result) return opts.result;
      Object.assign(rec, changes);
      return { available: true, updated: Object.keys(changes), persisted: true };
    },
  };
}

let objectUrls;
function setup(engine, { withCore = true, cozy = {} } = {}) {
  delete require.cache[require.resolve(USER_DASHBOARD_PATH)];
  delete require.cache[require.resolve(PROFILE_CORE_PATH)];
  const storageWrites = [];
  const fakeWindow = {
    CozyOS: {
      IdentityEngine: engine,
      ApplicationVisibility: { listVisibleApplications: () => ({ available: true, applications: [] }), getRealLaunchPath: () => null },
      DashboardNavigationCore: makeFakeNavCore(),
      ...cozy,
    },
    localStorage: { getItem: () => null, setItem: (k, v) => storageWrites.push([k, v]) },
  };
  global.window = fakeWindow;
  global.document = makeFakeDocument();
  objectUrls = { created: [], revoked: [] };
  global.URL = { createObjectURL: (f) => { const u = `blob:test/${objectUrls.created.length + 1}`; objectUrls.created.push([u, f]); return u; }, revokeObjectURL: (u) => objectUrls.revoked.push(u) };
  if (withCore) require(PROFILE_CORE_PATH);
  require(USER_DASHBOARD_PATH);
  fakeWindow.__storageWrites = storageWrites;
  return fakeWindow;
}

async function mount(engine, opts) {
  const win = setup(engine, opts);
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, 'user-7');
  const host = container.querySelector('#cozy-ud-surface-profile');
  const q = (sel) => host.querySelector(sel);
  return { win, container, host, q };
}

const fillAndSave = async (q, { name, country, city }) => {
  if (name !== undefined) q('#cozy-ud-profile-fullname').value = name;
  if (country !== undefined) q('#cozy-ud-profile-country').value = country;
  if (city !== undefined) q('#cozy-ud-profile-city').value = city;
  q('#cozy-ud-profile-save').click();
  await new Promise((r) => setImmediate(r));
};

// ------------------------------------------------------------------ loads / layout
test('LOADS: profile surface renders picture block, Full Name, Country, City and Save, plus the read-only Account lines', async () => {
  const { host, q } = await mount(makeFakeEngine({ firstName: 'Charles', lastName: 'Owuor', country: 'Kenya', city: 'Mombasa' }));
  assert.ok(q('#cozy-ud-profile-picture'));
  assert.ok(q('#cozy-ud-profile-fullname'));
  assert.ok(q('#cozy-ud-profile-country'));
  assert.ok(q('#cozy-ud-profile-city'));
  assert.ok(q('#cozy-ud-profile-save'));
  assert.match(host.textContent, /Full Name/);
  assert.match(host.textContent, /Country/);
  assert.match(host.textContent, /City/);
  assert.match(host.textContent, /Save Profile/);
  assert.match(host.textContent, /real-user-7/);
  assert.match(host.textContent, /active/i);
});

test('LOADS: the fields are pre-filled from the stored profile', async () => {
  const { q } = await mount(makeFakeEngine({ firstName: 'Charles', lastName: 'Owuor', country: 'Kenya', city: 'Mombasa' }));
  assert.equal(q('#cozy-ud-profile-fullname').getAttribute('value'), 'Charles Owuor');
  assert.equal(q('#cozy-ud-profile-city').getAttribute('value'), 'Mombasa');
  const selected = q('#cozy-ud-profile-country').querySelectorAll('option').filter(o => o.hasAttribute('selected'));
  assert.equal(selected.length, 1);
  assert.equal(selected[0].getAttribute('value'), 'KE');
});

test('COUNTRY: the picker offers all 249 countries plus a blank; with no stored country NOTHING (not Kenya) is preselected', async () => {
  const { q } = await mount(makeFakeEngine());
  const options = q('#cozy-ud-profile-country').querySelectorAll('option');
  assert.equal(options.length, 250);
  const selected = options.filter(o => o.hasAttribute('selected'));
  assert.equal(selected.length, 1);
  assert.equal(selected[0].getAttribute('value'), '');
  const uganda = await mount(makeFakeEngine({ country: 'Uganda' }));
  assert.equal(uganda.q('#cozy-ud-profile-country').querySelectorAll('option').filter(o => o.hasAttribute('selected'))[0].getAttribute('value'), 'UG');
});

test('COUNTRY: a stored country outside the ISO list stays selectable as "(current)" and is not erased by an unrelated save', async () => {
  const engine = makeFakeEngine({ firstName: 'Ada', lastName: 'Lovelace', country: 'Somaliland' });
  const { q } = await mount(engine);
  const keep = q('#cozy-ud-profile-country').querySelectorAll('option').filter(o => o.hasAttribute('selected'))[0];
  assert.match(keep.textContent, /Somaliland \(current\)/);
  await fillAndSave(q, { name: 'Ada Lovelace', country: keep.getAttribute('value'), city: 'Hargeisa' });
  assert.deepEqual(engine.calls[0][1], { city: 'Hargeisa' });
  assert.equal(engine.rec.country, 'Somaliland');
});

test('NO GPS/INFERENCE: nothing on the surface reads geolocation, and empty city/country stay empty', async () => {
  let geo = 0;
  const win = setup(makeFakeEngine());
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { geolocation: { getCurrentPosition: () => { geo++; }, watchPosition: () => { geo++; } } }, configurable: true });
  try {
    const container = new FakeElement('div');
    await win.CozyOS.UserDashboard.render(container, 'user-7');
    const host = container.querySelector('#cozy-ud-surface-profile');
    assert.equal(geo, 0);
    assert.equal(host.querySelector('#cozy-ud-profile-city').getAttribute('value'), '');
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original); else delete globalThis.navigator;
  }
});

// ------------------------------------------------------------------ save: name / country / city
test('SAVE: changing name, country and city calls updateProfile with exactly those fields and confirms', async () => {
  const engine = makeFakeEngine({ firstName: 'Ada', lastName: 'Lovelace' });
  const { q } = await mount(engine);
  await fillAndSave(q, { name: 'Charles Owuor', country: 'KE', city: 'Mombasa' });
  assert.equal(engine.calls.length, 1);
  assert.equal(engine.calls[0][0], 'user-7');
  assert.deepEqual(engine.calls[0][1], { firstName: 'Charles', lastName: 'Owuor', country: 'Kenya', city: 'Mombasa' });
  assert.match(q('#cozy-ud-profile-status').textContent, /Profile saved/);
  assert.equal(q('#cozy-ud-profile-save').disabled, false);
});

test('SAVE: a second save after the first only sends what changed since (baseline refreshes)', async () => {
  const engine = makeFakeEngine({ firstName: 'Ada', lastName: 'Lovelace' });
  const { q } = await mount(engine);
  await fillAndSave(q, { name: 'Charles Owuor', country: 'KE', city: 'Mombasa' });
  await fillAndSave(q, { city: 'Kisumu' });
  assert.deepEqual(engine.calls[1][1], { city: 'Kisumu' });
});

test('SAVE: nothing changed -> "No changes to save.", updateProfile never called', async () => {
  const engine = makeFakeEngine({ firstName: 'Ada', lastName: 'Lovelace', country: 'Kenya', city: 'Mombasa' });
  const { q } = await mount(engine);
  await fillAndSave(q, { name: 'Ada Lovelace', country: 'KE', city: 'Mombasa' });
  assert.equal(engine.calls.length, 0);
  assert.match(q('#cozy-ud-profile-status').textContent, /No changes/);
});

test('SAVE: a city-only edit never re-splits a stored multi-word firstName', async () => {
  const engine = makeFakeEngine({ firstName: 'Mary Anne', lastName: 'Kamau' });
  const { q } = await mount(engine);
  await fillAndSave(q, { name: 'Mary Anne Kamau', city: 'Nairobi' });
  assert.deepEqual(engine.calls[0][1], { city: 'Nairobi' });
});

test('VALIDATION: empty name / bad country / over-long city show field errors and never call the engine', async () => {
  const engine = makeFakeEngine({ firstName: 'Ada', lastName: 'Lovelace' });
  const { q } = await mount(engine);
  await fillAndSave(q, { name: '   ', country: 'ZZ', city: 'x'.repeat(81) });
  assert.equal(engine.calls.length, 0);
  assert.match(q('#cozy-ud-profile-fullname-error').textContent, /cannot be empty/i);
  assert.match(q('#cozy-ud-profile-country-error').textContent, /Choose a country/i);
  assert.match(q('#cozy-ud-profile-city-error').textContent, /80 characters/);
  await fillAndSave(q, { name: 'Ada Lovelace', country: '', city: '' });
  assert.equal(q('#cozy-ud-profile-fullname-error').textContent, '');
});

test('REJECTION: when the engine rejects the update the UI reports it (escaped), keeps the form, and does not claim success', async () => {
  const engine = makeFakeEngine({ firstName: 'Ada', lastName: 'Lovelace' }, { result: { available: false, reason: 'No real user found <script>x</script>' } });
  const { q } = await mount(engine);
  await fillAndSave(q, { city: 'Mombasa' });
  const status = q('#cozy-ud-profile-status');
  assert.match(status.textContent, /Could not save/);
  assert.doesNotMatch(status.textContent, /Profile saved/);
  assert.equal(status.querySelector('script'), null);
  assert.equal(q('#cozy-ud-profile-save').disabled, false);
});

test('REJECTION: an engine that throws is handled honestly, the button is re-enabled', async () => {
  const engine = makeFakeEngine({ firstName: 'Ada', lastName: 'Lovelace' });
  engine.updateProfile = async () => { throw new Error('boom'); };
  const { q } = await mount(engine);
  await fillAndSave(q, { city: 'Mombasa' });
  assert.match(q('#cozy-ud-profile-status').textContent, /Could not save.*boom/);
  assert.equal(q('#cozy-ud-profile-save').disabled, false);
});

test('HONESTY: persisted:false is reported as session-only, not as saved', async () => {
  const engine = makeFakeEngine({ firstName: 'Ada', lastName: 'Lovelace' }, { result: { available: true, updated: ['city'], persisted: false, persistReason: 'quota exceeded' } });
  const { q } = await mount(engine);
  await fillAndSave(q, { city: 'Mombasa' });
  const text = q('#cozy-ud-profile-status').textContent;
  assert.match(text, /this session only/i);
  assert.match(text, /quota exceeded/);
  assert.doesNotMatch(text, /^Profile saved/);
});

test('SAFETY: stored text with markup is rendered inert (attribute-escaped), never as elements', async () => {
  const { q, host } = await mount(makeFakeEngine({ firstName: '"><img src=x onerror=alert(1)>', lastName: 'A', city: '<b>x</b>' }));
  assert.equal(host.querySelector('img'), null);
  assert.equal(host.querySelector('b'), null);
  assert.match(q('#cozy-ud-profile-fullname').getAttribute('value'), /&quot;&gt;&lt;img/);
});

test('SAFETY: only whitelisted profile keys can ever reach the engine (never username/email/roles)', async () => {
  const engine = makeFakeEngine({ firstName: 'Ada', lastName: 'Lovelace' });
  const { q } = await mount(engine);
  await fillAndSave(q, { name: 'Bob Marley', country: 'JM', city: 'Kingston' });
  assert.deepEqual(Object.keys(engine.calls[0][1]).sort(), ['city', 'country', 'firstName', 'lastName']);
});

// ------------------------------------------------------------------ picture
const png = (over = {}) => ({ name: 'me.png', type: 'image/png', size: 2048, ...over });
async function choose(q, file) { const input = q('#cozy-ud-avatar-file'); input.files = [file]; (input.listeners.change || []).forEach(fn => fn({ target: input })); }

test('PICTURE: initially shows initials (or a generic glyph), Choose visible, Replace/Remove hidden', async () => {
  const { q } = await mount(makeFakeEngine({ firstName: 'Charles', lastName: 'Owuor' }));
  assert.equal(q('#cozy-ud-avatar').textContent, 'CO');
  assert.equal(q('#cozy-ud-avatar-choose').hidden, false);
  assert.equal(q('#cozy-ud-avatar-replace').hidden, true);
  assert.equal(q('#cozy-ud-avatar-remove').hidden, true);
  assert.equal((await mount(makeFakeEngine())).q('#cozy-ud-avatar').textContent, '\u{1F464}');
});

test('PICTURE: choosing a valid image previews it via a local blob: URL; Replace/Remove appear, Choose hides', async () => {
  const { q } = await mount(makeFakeEngine({ firstName: 'Charles', lastName: 'Owuor' }));
  await choose(q, png());
  const img = q('#cozy-ud-avatar').querySelector('img');
  assert.ok(img);
  assert.equal(img.getAttribute('src'), 'blob:test/1');
  assert.equal(q('#cozy-ud-avatar-choose').hidden, true);
  assert.equal(q('#cozy-ud-avatar-replace').hidden, false);
  assert.equal(q('#cozy-ud-avatar-remove').hidden, false);
  assert.equal(q('#cozy-ud-avatar-error').textContent, '');
});

test('PICTURE: replacing revokes the previous blob URL; removing revokes it and restores the initials', async () => {
  const { q } = await mount(makeFakeEngine({ firstName: 'Charles', lastName: 'Owuor' }));
  await choose(q, png({ name: 'a.png' }));
  await choose(q, png({ name: 'b.jpg', type: 'image/jpeg' }));
  assert.deepEqual(objectUrls.revoked, ['blob:test/1']);
  assert.equal(q('#cozy-ud-avatar').querySelector('img').getAttribute('src'), 'blob:test/2');
  q('#cozy-ud-avatar-remove').click();
  assert.deepEqual(objectUrls.revoked, ['blob:test/1', 'blob:test/2']);
  assert.equal(q('#cozy-ud-avatar').querySelector('img'), null);
  assert.equal(q('#cozy-ud-avatar').textContent, 'CO');
  assert.equal(q('#cozy-ud-avatar-choose').hidden, false);
  assert.equal(q('#cozy-ud-avatar-remove').hidden, true);
});

test('PICTURE VALIDATION: SVG / GIF / PDF / oversize / empty are refused with a message and no preview or blob URL is created', async () => {
  const { q } = await mount(makeFakeEngine({ firstName: 'Charles', lastName: 'Owuor' }));
  for (const bad of [png({ type: 'image/svg+xml', name: 'x.svg' }), png({ type: 'image/gif' }), png({ type: 'application/pdf' }), png({ size: 6 * 1024 * 1024 }), png({ size: 0 })]) {
    await choose(q, bad);
    assert.ok(q('#cozy-ud-avatar-error').textContent.length > 0, JSON.stringify(bad));
    assert.equal(q('#cozy-ud-avatar').querySelector('img'), null);
  }
  assert.equal(objectUrls.created.length, 0);
});

test('PICTURE SAFETY: a preview is never persisted — no updateProfile call, no localStorage write, and Save sends no picture data', async () => {
  const engine = makeFakeEngine({ firstName: 'Ada', lastName: 'Lovelace' });
  const { q, win } = await mount(engine);
  await choose(q, png());
  assert.equal(engine.calls.length, 0);
  assert.equal(win.__storageWrites.length, 0);
  await fillAndSave(q, { city: 'Mombasa' });
  assert.deepEqual(engine.calls[0][1], { city: 'Mombasa' });
  assert.equal(JSON.stringify(engine.calls).includes('blob:'), false);
});

test('PICTURE HONESTY: the surface always says "Not implemented" and names Profile Phase 2 (no fabricated storage claim)', async () => {
  const { host } = await mount(makeFakeEngine());
  assert.match(host.textContent, /Not implemented/);
  assert.match(host.textContent, /Profile Phase 2/);
  assert.match(host.textContent, /not saved/i);
});

// ------------------------------------------------------------------ degradation + scope
test('DEGRADES: without the profile core -> honest "editing not available", read-only account lines, "Not implemented" picture note, no form', async () => {
  const { host } = await mount(makeFakeEngine(), { withCore: false });
  assert.match(host.textContent, /Profile editing is not available/);
  assert.match(host.textContent, /Not implemented/);
  assert.match(host.textContent, /real-user-7/);
  assert.equal(host.querySelector('#cozy-ud-profile-save'), null);
});

test('DEGRADES: an engine without getProfile()/updateProfile() -> same honest state (existing IdentityEngine mocks keep working)', async () => {
  const legacy = { getDashboardConfig: () => ({ available: true, dashboardType: 'user' }), getUser: (id) => ({ username: `real-${id}`, status: 'active' }) };
  const { host } = await mount(legacy);
  assert.match(host.textContent, /Profile editing is not available/);
  assert.equal(host.querySelector('#cozy-ud-profile-save'), null);
  const bare = await mount({ getDashboardConfig: () => ({ available: true, dashboardType: 'user' }) });
  assert.match(bare.host.textContent, /Profile data is not available/);
  assert.match(bare.host.textContent, /Not implemented/);
});

test('SCOPE: the Profile surface has NO mother-language, languages-spoken, Teach CozyAI, security or privacy controls (separate phases)', async () => {
  const { host } = await mount(makeFakeEngine({ firstName: 'Charles', lastName: 'Owuor' }));
  assert.doesNotMatch(host.textContent, /mother language|languages? (i know|spoken)|teach cozy ?ai|password|passkey|2fa|two-factor|trusted device|active sessions?|manage devices|privacy/i);
});

// ------------------------------------------------------------------ real engine integration
test('INTEGRATION (real IdentityEngine): edit + Save persists to the "users" store and getProfile() reads it back; login is unaffected', async () => {
  delete require.cache[require.resolve(IDENTITY_ENGINE_PATH)];
  const saves = [];
  const win = setup(null, { cozy: { registerCoordinator: () => {}, IdentityStorage: { save: async (s, r) => { saves.push([s, r.id]); return { success: true }; } } } });
  require(IDENTITY_ENGINE_PATH);
  const IE = win.CozyOS.IdentityEngine;
  const reg = await IE.register({ accountType: 'user', firstName: 'Ada', lastName: 'Lovelace', username: 'integ1', email: 'integ1@example.com', phone: '+254700000099', password: 'Str0ng!Passw0rd', confirmPassword: 'Str0ng!Passw0rd', acceptTerms: true });
  saves.length = 0;
  const container = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(container, reg.userId);
  const q = (s) => container.querySelector('#cozy-ud-surface-profile').querySelector(s);
  assert.equal(q('#cozy-ud-profile-fullname').getAttribute('value'), 'Ada Lovelace');
  await fillAndSave(q, { name: "Se\u00e1n O'Brien", country: 'IE', city: 'Cork' });
  assert.match(q('#cozy-ud-profile-status').textContent, /Profile saved/);
  assert.deepEqual(IE.getProfile(reg.userId), { available: true, firstName: 'Se\u00e1n', lastName: 'O&#39;Brien', country: 'Ireland', city: 'Cork', motherLanguages: [], languagesKnown: [], languageRoles: [] }); // 2A-3: getProfile() also returns the two language lists ([] for a record that never had them); PHASE 4: languageRoles (also [] for a record that never had it)
  assert.deepEqual(saves, [['users', reg.userId]]);
  assert.equal((await IE.login('integ1', 'Str0ng!Passw0rd')).available, true);
  // re-render: the stored (escaped) apostrophe is shown decoded, not double-escaped
  const again = new FakeElement('div');
  await win.CozyOS.UserDashboard.render(again, reg.userId);
  assert.equal(again.querySelector('#cozy-ud-profile-fullname').getAttribute('value'), "Se\u00e1n O&#39;Brien");
});
