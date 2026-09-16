'use strict';
/**
 * server/ai/gemini-runtime-harness-server.js
 * CozyOS — Phase 10C-3E: Real Gemini Runtime Harness Server
 *
 * WHAT THIS IS
 *   A dev/test-only combined server that (1) serves this repository's
 *   REAL, UNMODIFIED static files (index.html, dashboard.html, every
 *   core/**, assets/**, etc. — read straight off disk, nothing rewritten
 *   or templated) and (2) mounts the REAL, UNMODIFIED Gemini backend
 *   request handler from server/ai/gemini-backend-endpoint.js at
 *   /ai/gemini on that SAME http.Server / port.
 *
 * WHY THIS EXISTS
 *   core/living/providers/gemini-cloud-provider.js's think() calls
 *   fetch('/ai/gemini', ...) — a same-origin relative path. Running the
 *   static site and the Gemini backend as two separate servers (as
 *   server/auth/account-link-server.js and
 *   server/live-relay/live-distribution-signaling-server.js do for their
 *   own concerns) would put them on different origins and require CORS
 *   headers that gemini-backend-endpoint.js deliberately does not send
 *   (it was built same-origin-only, per its own file header). This file
 *   is the minimum real infrastructure needed to let a REAL browser,
 *   loading the REAL index.html/dashboard.html, make a REAL same-origin
 *   fetch('/ai/gemini') exactly the way production is expected to be
 *   deployed (one origin serving both the app and this API route,
 *   e.g. behind one reverse proxy) — without inventing a new frontend
 *   framework or bundler this repo doesn't otherwise use.
 *
 * WHAT THIS FILE DOES NOT DO
 *   - Does not modify, wrap, or duplicate the Gemini request-handling
 *     logic — createGeminiRequestHandler() is required verbatim from
 *     gemini-backend-endpoint.js and invoked directly.
 *   - Does not add authentication, rate limiting, or production
 *     hardening (no HTTPS, no CSRF, no origin allowlist beyond what
 *     gemini-backend-endpoint.js itself already does). Explicitly a
 *     dev/runtime-verification harness, not a deployment artifact — see
 *     Limitations in PHASE10C-3E-GEMINI-RUNTIME-INTEGRATION-REPORT.md.
 *   - Does not read GEMINI_API_KEY itself — it only wires the request
 *     through to the real handler, which reads process.env.GEMINI_API_KEY
 *     exactly as it always has.
 *
 * USAGE
 *   node server/ai/gemini-runtime-harness-server.js [port]
 *   Then open http://127.0.0.1:<port>/index.html in a real browser (or
 *   point Playwright/Puppeteer at it — see
 *   tools/termux/gemini-browser-runtime-probe.js).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { createGeminiRequestHandler, defaultGetApiKey, GENERIC_FAILURE_REASONS } = require('./gemini-backend-endpoint.js');

const REPO_ROOT = path.join(__dirname, '..', '..');
const GEMINI_PATH = '/ai/gemini';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.normalize(path.join(REPO_ROOT, urlPath));
    if (!filePath.startsWith(REPO_ROOT)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found: ' + urlPath);
            return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
    });
}

/**
 * createRuntimeHarnessServer({ getApiKey, fetchImpl, onServerEvent })
 *   Real http.Server composing:
 *     - static file serving of the real repository root
 *     - the real, unmodified Gemini request handler at /ai/gemini
 *   Injectable getApiKey/fetchImpl so tests can run this exact server
 *   with a fake key/fetch (structural) OR with the real
 *   process.env.GEMINI_API_KEY + real global fetch (live, e.g. Termux).
 */
function createRuntimeHarnessServer({ getApiKey = defaultGetApiKey, fetchImpl, onServerEvent } = {}) {
    const handleGeminiRequest = createGeminiRequestHandler({ getApiKey, fetchImpl, onServerEvent });

    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === GEMINI_PATH) {
            handleGeminiRequest(req, res).catch(() => {
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, reason: GENERIC_FAILURE_REASONS.INTERNAL_ERROR }));
                }
            });
            return;
        }
        serveStatic(req, res);
    });

    return {
        listen(port, host) { return new Promise((resolve) => server.listen(port, host, () => resolve(server.address()))); },
        close() { return new Promise((resolve) => server.close(() => resolve())); },
        raw: server,
    };
}

if (require.main === module) {
    const port = Number(process.argv[2]) || 0;
    const harness = createRuntimeHarnessServer({});
    harness.listen(port, '127.0.0.1').then((addr) => {
        console.log(`[gemini-runtime-harness-server] Serving real repo static files + real /ai/gemini at http://127.0.0.1:${addr.port}/`);
        console.log(`[gemini-runtime-harness-server] Open http://127.0.0.1:${addr.port}/index.html or /dashboard.html in a real browser.`);
    }).catch((e) => {
        console.error('[gemini-runtime-harness-server] Failed to start:', e.message);
        process.exit(1);
    });
}

module.exports = { createRuntimeHarnessServer, GEMINI_PATH };
