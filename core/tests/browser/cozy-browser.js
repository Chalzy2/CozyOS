/**
 * core/tests/browser/cozy-browser.js
 *
 * CozyBrowser — reusable REAL-browser verification harness.
 *
 * WHAT THIS IS
 *   A small library that *-browser.test.js files (this milestone's, and
 *   future ones') require() to get: a static file server rooted at the
 *   real repository tree, a real Playwright Chromium launch (reusing the
 *   existing server/webauthn-rp/test/browser-launch.js Chromium-discovery
 *   helper so there is exactly one place that knows how to find a real
 *   browser binary on this machine), console/pageerror/requestfailed
 *   collection, and a tiny dependency-chain reporter. It follows the same
 *   pattern already established by the repository's existing
 *   *-browser.test.js suites (see e.g.
 *   core/connectivity/ui/tests/cozy-live-connectivity-dashboard-browser.test.js):
 *   a self-contained script, no external test framework, a
 *   `BROWSER_TEST = PASS|RAN_WITH_FAILURES|NOT_RUN` line at the end so a
 *   caller (human or CI) can tell real browser execution from a graceful
 *   skip without parsing prose.
 *
 * WHAT THIS IS NOT (see NEXT MILESTONE section 3)
 *   Not an authentication authority, not an authorization authority, not
 *   an entitlement engine, not an application registry, not a workflow
 *   engine. It never decides what a user may do — it only loads real
 *   pages/scripts in a real browser and reports what actually happened.
 *   It duplicates zero business logic from IdentityEngine,
 *   EntitlementEngine, OrganizationMembership, PolicyEngine, or
 *   WorkflowRuntime.
 *
 * USAGE
 *   const { withBrowser, test, report, REPO_ROOT } = require('./cozy-browser');
 *   await withBrowser(async ({ browser, openPage, serverURL }) => {
 *     const { page, consoleErrors, pageErrors, failedRequests } = await openPage();
 *     await page.goto(serverURL('/admin-workspace.html'));
 *     ...
 *   });
 *
 * If no real browser binary can be launched, `withBrowser` never silently
 * fabricates success: it throws a clearly-labeled error and callers are
 * expected to catch it, print `BROWSER_TEST = NOT_RUN (<reason>)`, and
 * exit 0 (a missing browser is an environment fact, not a test failure —
 * see NEXT MILESTONE section 13).
 */

'use strict';

const path = require('path');
const http = require('http');
const fs = require('fs');

const REPO_ROOT = path.join(__dirname, '..', '..', '..');

// Reuse the one existing Chromium-discovery helper in the repo instead of
// re-implementing browser-launch logic here (NEXT MILESTONE section 3:
// do not create a second authority — that applies to infra helpers too).
const BROWSER_LAUNCH_PATH = path.join(REPO_ROOT, 'server', 'webauthn-rp', 'test', 'browser-launch.js');
let resolveLaunchOptions = (opts) => opts; // fallback if the helper ever moves
try {
  ({ resolveLaunchOptions } = require(BROWSER_LAUNCH_PATH));
} catch (_e) {
  // Helper not found — fall back to Playwright's own managed browser
  // resolution. Not fatal: withBrowser() below will still report a real
  // launch failure honestly if Chromium truly is not available.
}

function contentType(p) {
  if (p.endsWith('.html')) return 'text/html';
  if (p.endsWith('.js')) return 'application/javascript';
  if (p.endsWith('.mjs')) return 'application/javascript';
  if (p.endsWith('.css')) return 'text/css';
  if (p.endsWith('.json')) return 'application/json';
  if (p.endsWith('.svg')) return 'image/svg+xml';
  if (p.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

/** Starts a static file server rooted at the real repo tree (REPO_ROOT). */
function startStaticServer(root = REPO_ROOT) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(root, urlPath);
      // Refuse to serve outside root — this is a test-harness convenience
      // server, not a hardened static host, but it should not become a
      // path-traversal toy either.
      if (!filePath.startsWith(root)) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('not found: ' + filePath);
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType(filePath) });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/**
 * withBrowser(fn) — launches a real Chromium, starts the static server,
 * hands fn() an { browser, openPage, serverURL } context, then tears both
 * down. Throws (does not swallow) if a real browser cannot be launched —
 * callers decide how to report that (see NOT_RUN convention above).
 */
async function withBrowser(fn) {
  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    const err = new Error('playwright module not resolvable: ' + e.message);
    err.code = 'NO_PLAYWRIGHT';
    throw err;
  }

  const server = await startStaticServer();
  const port = server.address().port;
  const serverURL = (urlPath) => `http://127.0.0.1:${port}${urlPath.startsWith('/') ? '' : '/'}${urlPath}`;

  let browser;
  try {
    browser = await playwright.chromium.launch(resolveLaunchOptions({ headless: true }));
  } catch (e) {
    server.close();
    const err = new Error('no real Chromium binary could be launched: ' + e.message);
    err.code = 'NO_BROWSER';
    throw err;
  }

  async function openPage() {
    const page = await browser.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('requestfailed', (req) => {
      failedRequests.push({ url: req.url(), failure: req.failure() && req.failure().errorText });
    });
    return { page, consoleErrors, pageErrors, failedRequests };
  }

  try {
    return await fn({ browser, openPage, serverURL, server });
  } finally {
    await browser.close();
    server.close();
  }
}

/** Tiny self-contained test runner matching the repo's existing *-browser.test.js convention. */
function makeRunner() {
  const results = [];
  async function test(name, runFn) {
    const start = Date.now();
    try {
      await runFn();
      results.push({ name, pass: true, ms: Date.now() - start });
      console.log(`  \u2713 ${name}`);
    } catch (err) {
      results.push({ name, pass: false, ms: Date.now() - start, error: err.message });
      console.log(`  \u2717 ${name}`);
      console.log(`      ${err.message}`);
    }
  }
  function summary() {
    const passed = results.filter((r) => r.pass).length;
    const failed = results.length - passed;
    return { passed, failed, results };
  }
  return { test, summary };
}

/**
 * inspectDependencyChain(page, names) — evaluates window.CozyOS[name] for
 * each expected authority and returns the {name, loaded, registered,
 * version, error} shape NEXT MILESTONE section 5 asks for. "loaded" means
 * some non-undefined value is registered; "registered" additionally
 * requires it look like a real object (not a bare boolean/string stub).
 */
async function inspectDependencyChain(page, names) {
  return page.evaluate((names) => {
    const out = [];
    const cozy = window.CozyOS || {};
    for (const name of names) {
      const entry = cozy[name];
      const loaded = typeof entry !== 'undefined';
      const registered = loaded && typeof entry === 'object' && entry !== null;
      let version = null;
      try {
        version = (entry && (entry.VERSION || entry.version)) || null;
      } catch (_e) {
        version = null;
      }
      out.push({ name, loaded, registered, version, error: loaded ? null : 'not present on window.CozyOS' });
    }
    return out;
  }, names);
}

module.exports = { REPO_ROOT, startStaticServer, withBrowser, makeRunner, inspectDependencyChain };
