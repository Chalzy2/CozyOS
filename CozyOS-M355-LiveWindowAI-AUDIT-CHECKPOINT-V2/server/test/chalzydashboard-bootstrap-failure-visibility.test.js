
'use strict';
/**
 * server/test/chalzydashboard-bootstrap-failure-visibility.test.js
 *
 * Real regression test for the reported bug: a genuine platform
 * administrator's login succeeds and the browser reaches
 * /chalzydashboard, but the page appears permanently stuck showing
 * only admin-workspace.html's static branding, with no visible error
 * at all.
 *
 * ROOT CAUSE, confirmed by tracing chalzydashboard.html together with
 * core/bootstrap/bootstrap.js: Bootstrap.start() unconditionally
 * replaces document.body's entire innerHTML with admin-workspace.html's
 * own body BEFORE running that file's real script sequence. If the
 * script sequence itself then fails, chalzydashboard.html's own
 * pre-existing statusEl reference (captured from ITS OWN original body,
 * before the replacement) is by then a detached DOM node - writing to
 * its textContent has no visible effect. The user is left staring at
 * whatever static markup happened to be in admin-workspace.html's body
 * (its branding header, in the real reported case) with zero
 * indication anything went wrong.
 *
 * This test runs the ACTUAL, unmodified inline script extracted from
 * chalzydashboard.html against a minimal, hand-rolled DOM shim -
 * covering only the real APIs that code path touches
 * (getElementById/createElement/body.contains/body.prepend/
 * textContent/style/setAttribute) - with a stubbed Bootstrap.start()
 * that reproduces the exact real-world failure sequence: replace the
 * body, THEN report failure. It proves the real, shipped fix code,
 * not a reimplementation of it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CHALZY_PATH = path.join(__dirname, '..', '..', 'chalzydashboard.html');

function extractInlineScript(html) {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  const match = withoutComments.match(/<script>([\s\S]*?cozy-admin-gate-status[\s\S]*?)<\/script>/);
  if (!match) throw new Error('Could not locate the real gate/bootstrap inline script in chalzydashboard.html');
  return match[1];
}

/** A minimal, real DOM element shim - only the surface this code path actually touches. */
function makeElement(tag) {
  const el = {
    tagName: tag,
    id: '',
    _children: [],
    _parent: null,
    style: {},
    _attrs: {},
    textContent: '',
    setAttribute(name, value) { this._attrs[name] = value; },
    getAttribute(name) { return this._attrs[name]; },
  };
  return el;
}

function makeBody() {
  const body = makeElement('body');
  body.contains = (node) => body._children.includes(node);
  body.prepend = (node) => { body._children.unshift(node); node._parent = body; };
  Object.defineProperty(body, 'innerHTML', {
    get() { return '<!-- shimmed -->'; },
    set(_html) {
      // Real behavior under test: replacing innerHTML detaches every
      // existing child - exactly what document.body.innerHTML = bodyHtml
      // does in core/bootstrap/bootstrap.js.
      body._children.forEach((c) => { c._parent = null; });
      body._children = [];
    },
  });
  return body;
}

function withShimmedDom({ bootstrapResult, replaceBodyBeforeFailing = true }, run) {
  const registry = new Map();
  const body = makeBody();
  const statusEl = makeElement('div');
  statusEl.id = 'cozy-admin-gate-status';
  body._children.push(statusEl);
  statusEl._parent = body;
  registry.set('cozy-admin-gate-status', statusEl);

  const deniedEl = makeElement('div');
  deniedEl.id = 'cozy-admin-denied';
  registry.set('cozy-admin-denied', deniedEl);

  const createdElements = [];
  const document_ = {
    body,
    getElementById: (id) => registry.get(id) || null,
    createElement: (tag) => { const el = makeElement(tag); createdElements.push(el); return el; },
  };

  const bootstrapStarted = { called: false };
  const window_ = {
    CozyOS: {
      AdminGateCore: {
        decideGateAction: () => ({ verdict: 'stub' }),
        resolveWorkspaceRoute: () => ({ route: 'PLATFORM' }),
        WORKSPACE_ROUTE: { LOGIN: 'LOGIN', DENIED: 'DENIED', ERROR: 'ERROR', PLATFORM: 'PLATFORM', ORGANIZATION: 'ORGANIZATION', WORKER: 'WORKER' },
      },
      Bootstrap: {
        async start() {
          bootstrapStarted.called = true;
          // Reproduces the two real, distinct scenarios in
          // core/bootstrap/bootstrap.js: a script-sequence failure
          // happens AFTER document.body.innerHTML has already been
          // replaced; a real-fetch failure (network error fetching
          // admin-workspace.html itself) happens BEFORE any DOM
          // mutation at all.
          if (replaceBodyBeforeFailing) {
            document_.body.innerHTML = '<div>admin-workspace.html branding</div>';
          }
          return bootstrapResult;
        },
      },
      ReturnDestinationCore: { resolveReturnDestination: () => null },
    },
    location: { pathname: '/chalzydashboard' },
  };

  global.document = document_;
  global.window = window_;
  global.fetch = async () => ({ status: 200, json: async () => ({ authenticated: true, isPlatformAdmin: true }) });

  const script = extractInlineScript(fs.readFileSync(CHALZY_PATH, 'utf8'));
  // eslint-disable-next-line no-eval
  (0, eval)(script);

  return run({ document: document_, statusEl, createdElements, bootstrapStarted });
}

test('when Bootstrap.start() fails AFTER already replacing document.body, a new, visible error element is created instead of writing to the stale, detached statusEl', async () => {
  await withShimmedDom({ bootstrapResult: { success: false, reason: 'Real inline script execution failed: something broke' } }, async ({ document, statusEl, createdElements }) => {
    // checkAndProceed() runs as an IIFE tail call inside the script;
    // give its internal awaits a turn to settle.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(document.body.contains(statusEl), false, 'sanity check: statusEl must genuinely be detached after the body replacement, matching the real bug scenario');

    const errorEl = createdElements.find((el) => el.id === 'cozy-admin-workspace-load-error');
    assert.ok(errorEl, 'a new, real error element must be created when the original status element is no longer attached');
    assert.match(errorEl.textContent, /something broke/, 'the real failure reason must be visible in the new error element, not swallowed');
    assert.equal(errorEl.getAttribute('role'), 'alert');
    assert.equal(document.body.contains(errorEl), true, 'the new error element must actually be attached to the live document body, not just created');
  });
});

test('when Bootstrap.start() fails WITHOUT ever replacing the body (e.g. a real network failure fetching admin-workspace.html itself, before any DOM mutation), the original statusEl is used directly - no extra element created', async () => {
  await withShimmedDom({ bootstrapResult: { success: false, reason: 'Could not real-fetch admin-workspace.html: network error' }, replaceBodyBeforeFailing: false }, async ({ document, statusEl, createdElements }) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(document.body.contains(statusEl), true, 'sanity check: statusEl must still be attached in this scenario');
    assert.match(statusEl.textContent, /Could not real-fetch admin-workspace\.html: network error/, 'the real failure reason must be written to the original status element when it is still visible');
    const errorEl = createdElements.find((el) => el.id === 'cozy-admin-workspace-load-error');
    assert.equal(errorEl, undefined, 'no extra error element should be created when the original one is still perfectly usable');
  });
});
