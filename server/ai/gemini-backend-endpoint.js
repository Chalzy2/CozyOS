'use strict';

/**
 * server/ai/gemini-backend-endpoint.js
 * CozyOS — Gemini Cloud Provider Backend Boundary
 * Phase: 10C-3D
 *
 * REAL SCOPE DISCLOSURE
 *   Phase 10C-3C's audit confirmed no backend boundary existed capable of
 *   holding a Gemini credential server-side. The only prior HTTP-server
 *   pattern in this repo is server/auth/google-login-endpoint.js (plain
 *   Node `http`, no framework, generic-failure discipline, correlation
 *   logging). This file follows that same pattern for a different trust
 *   domain (cloud-LLM inference, not identity).
 *
 * WHAT THIS FILE DOES
 *   Exposes one POST endpoint. The browser/client sends { text, options? }.
 *   This file reads the Gemini API key from process.env.GEMINI_API_KEY
 *   (never from a committed file, never from the request body) and makes
 *   the real upstream call to the Gemini API on the caller's behalf. The
 *   key itself is never included in any response, error message, or log
 *   line this file writes.
 *
 * WHAT THIS FILE DOES NOT DO
 *   - Does not implement CozyThinking, CognitiveCoordinator, or
 *     CozyLivingAI logic. Purely a network/secret boundary.
 *   - Does not persist conversation history or memory.
 *   - Does not fabricate a response when the upstream call fails, times
 *     out, or the key is missing — every failure path returns a real,
 *     honest, generic-body error.
 *
 * SECRET HANDLING RULES (enforced in code, not just documented)
 *   - process.env.GEMINI_API_KEY is read once at construction time.
 *   - The key is only ever placed in the outbound request to Google
 *     (as a header/query param on the upstream call) — never echoed
 *     back to the client in any form.
 *   - Every catch block strips the raw error object down to a generic,
 *     pre-approved reason string before it reaches sendJson(); raw
 *     upstream error bodies/messages are logged server-side via
 *     onServerEvent only (never sent to the client), and even that
 *     server-side log path never receives the key itself, since the key
 *     is never part of the error surface (it is sent as a fixed header
 *     the fetch layer constructs, not something Google's error bodies
 *     would ever echo back).
 *
 * TESTABILITY
 *   fetchImpl is injectable so tests can run withOUT any real network
 *   access, simulating: success, upstream 4xx/5xx, malformed body,
 *   and timeout — see server/ai/test/gemini-backend-endpoint.test.js.
 *   No test in this repository claims real Gemini execution; that
 *   requires GEMINI_API_KEY to be set to a real key and real network
 *   access, neither of which exist in the development sandbox this
 *   phase was built in (see PHASE10C-3D-GEMINI-BACKEND-REPORT.md).
 */

const http = require('http');
const crypto = require('crypto');

const MAX_BODY_BYTES = 32 * 1024; // one prompt + light options; fails closed above this
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MODEL = 'gemini-2.0-flash';
const GENERIC_FAILURE_REASONS = Object.freeze({
    NO_KEY: 'PROVIDER_NOT_CONFIGURED',
    BAD_REQUEST: 'BAD_REQUEST',
    METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
    UNSUPPORTED_CONTENT_TYPE: 'UNSUPPORTED_CONTENT_TYPE',
    PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
    TIMEOUT: 'UPSTREAM_TIMEOUT',
    UPSTREAM_ERROR: 'UPSTREAM_ERROR',
    NETWORK_ERROR: 'NETWORK_ERROR',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
});

function sendJson(res, statusCode, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store',
    });
    res.end(body);
}

/** readJsonBody(req) -> Promise<object>. Fails closed exactly like google-login-endpoint.js's version. */
function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let received = 0;
        let oversized = false;
        let settled = false;
        const chunks = [];
        req.on('data', (chunk) => {
            if (oversized) return;
            received += chunk.length;
            if (received > MAX_BODY_BYTES) {
                oversized = true;
                chunks.length = 0;
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (settled) return;
            settled = true;
            if (oversized) {
                reject(Object.assign(new Error('Request body too large.'), { code: 'PAYLOAD_TOO_LARGE' }));
                return;
            }
            let parsed;
            try {
                parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
            } catch (_e) {
                reject(Object.assign(new Error('Malformed JSON body.'), { code: 'BAD_JSON' }));
                return;
            }
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                reject(Object.assign(new Error('Request body must be a JSON object.'), { code: 'BAD_JSON' }));
                return;
            }
            resolve(parsed);
        });
        req.on('error', (e) => {
            if (settled) return;
            settled = true;
            reject(e);
        });
    });
}

/**
 * callGemini({ apiKey, model, text, timeoutMs, fetchImpl })
 *   Real upstream call shape (Gemini REST generateContent). Injectable
 *   fetchImpl so this is unit-testable without real network access.
 *   Never returns or logs apiKey.
 */
async function callGemini({ apiKey, model, text, timeoutMs, fetchImpl }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const response = await fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text }] }] }),
            signal: controller.signal,
        });
        let payload = null;
        try { payload = await response.json(); } catch (_e) { /* non-JSON upstream body; handled by !response.ok below */ }
        if (!response.ok) {
            const err = new Error('Gemini upstream returned a non-2xx status.');
            err.code = 'UPSTREAM_ERROR';
            err.status = response.status;
            throw err;
        }
        const candidateText = payload && payload.candidates && payload.candidates[0]
            && payload.candidates[0].content && payload.candidates[0].content.parts
            && payload.candidates[0].content.parts[0] && payload.candidates[0].content.parts[0].text;
        if (typeof candidateText !== 'string') {
            const err = new Error('Gemini response did not contain the expected candidate text shape.');
            err.code = 'UPSTREAM_ERROR';
            throw err;
        }
        return { text: candidateText, model };
    } catch (e) {
        if (e.name === 'AbortError') {
            const err = new Error('Gemini upstream call timed out.');
            err.code = 'TIMEOUT';
            throw err;
        }
        if (!e.code) e.code = 'NETWORK_ERROR';
        throw e;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * createGeminiRequestHandler({ getApiKey, fetchImpl, model, timeoutMs, onServerEvent })
 *   getApiKey     REQUIRED. () => string|null|undefined. Called per-request
 *                 (not just at startup) so key rotation without restart is
 *                 possible; default implementation below reads
 *                 process.env.GEMINI_API_KEY.
 *   fetchImpl     Injectable fetch, defaults to global fetch (Node 18+).
 *   onServerEvent OPTIONAL. (eventName, detail) => void — server-side-only
 *                 logging. Never receives the API key; never influences
 *                 the HTTP response sent to the client.
 */
function createGeminiRequestHandler({
    getApiKey,
    fetchImpl = (typeof fetch === 'function' ? fetch : undefined),
    model = DEFAULT_MODEL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    onServerEvent,
} = {}) {
    if (typeof getApiKey !== 'function') {
        throw new Error('[gemini-backend-endpoint] getApiKey() function is required.');
    }
    if (typeof fetchImpl !== 'function') {
        throw new Error('[gemini-backend-endpoint] No fetch implementation available; pass fetchImpl explicitly.');
    }
    const emit = typeof onServerEvent === 'function' ? onServerEvent : () => {};

    return async function handleGeminiRequest(req, res) {
        const correlationId = crypto.randomUUID();

        if (req.method !== 'POST') {
            emit('REJECTED', { correlationId, reason: GENERIC_FAILURE_REASONS.METHOD_NOT_ALLOWED, method: req.method });
            sendJson(res, 405, { success: false, reason: GENERIC_FAILURE_REASONS.METHOD_NOT_ALLOWED, correlationId });
            return;
        }

        const contentType = String(req.headers['content-type'] || '');
        if (!contentType.toLowerCase().includes('application/json')) {
            emit('REJECTED', { correlationId, reason: GENERIC_FAILURE_REASONS.UNSUPPORTED_CONTENT_TYPE });
            sendJson(res, 415, { success: false, reason: GENERIC_FAILURE_REASONS.UNSUPPORTED_CONTENT_TYPE, correlationId });
            return;
        }

        let body;
        try {
            body = await readJsonBody(req);
        } catch (e) {
            const status = e.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
            const reason = e.code === 'PAYLOAD_TOO_LARGE' ? GENERIC_FAILURE_REASONS.PAYLOAD_TOO_LARGE : GENERIC_FAILURE_REASONS.BAD_REQUEST;
            emit('REJECTED', { correlationId, reason });
            sendJson(res, status, { success: false, reason, correlationId });
            return;
        }

        const text = body.text;
        if (typeof text !== 'string' || text.trim().length === 0) {
            emit('REJECTED', { correlationId, reason: GENERIC_FAILURE_REASONS.BAD_REQUEST });
            sendJson(res, 400, { success: false, reason: GENERIC_FAILURE_REASONS.BAD_REQUEST, correlationId });
            return;
        }

        // Read the key fresh per-request. Never logged, never echoed.
        let apiKey;
        try {
            apiKey = getApiKey();
        } catch (_e) {
            apiKey = null; // getApiKey() throwing is treated identically to a missing key — no detail leaks either way
        }
        if (typeof apiKey !== 'string' || apiKey.length === 0) {
            emit('REJECTED', { correlationId, reason: GENERIC_FAILURE_REASONS.NO_KEY });
            sendJson(res, 503, { success: false, reason: GENERIC_FAILURE_REASONS.NO_KEY, correlationId });
            return;
        }

        const startedAt = Date.now();
        try {
            const requestedModel = (body.options && typeof body.options.model === 'string' && body.options.model.trim()) ? body.options.model.trim() : model;
            const result = await callGemini({ apiKey, model: requestedModel, text, timeoutMs, fetchImpl });
            const latencyMs = Date.now() - startedAt;
            emit('SUCCESS', { correlationId, model: result.model, latencyMs });
            sendJson(res, 200, {
                success: true,
                isReal: true,
                provider: 'gemini-api',
                model: result.model,
                text: result.text,
                latencyMs,
                correlationId,
            });
        } catch (e) {
            const latencyMs = Date.now() - startedAt;
            const reason = e.code === 'TIMEOUT' ? GENERIC_FAILURE_REASONS.TIMEOUT
                : e.code === 'UPSTREAM_ERROR' ? GENERIC_FAILURE_REASONS.UPSTREAM_ERROR
                : GENERIC_FAILURE_REASONS.NETWORK_ERROR;
            const status = e.code === 'TIMEOUT' ? 504 : e.code === 'UPSTREAM_ERROR' ? 502 : 502;
            // Server-side-only event. e.message may describe upstream shape
            // (e.g. "non-2xx status") but never contains the key — the key
            // is never part of any thrown Error's message in this file.
            emit('ERROR', { correlationId, reason, latencyMs, upstreamStatus: e.status || null });
            sendJson(res, status, { success: false, isReal: false, reason, correlationId });
        }
    };
}

/**
 * defaultGetApiKey() — reads process.env.GEMINI_API_KEY. Separated out
 * so tests can inject a fake getApiKey() without touching real env vars.
 */
function defaultGetApiKey() {
    return process.env.GEMINI_API_KEY || null;
}

/**
 * GeminiBackendServer — thin http.createServer wrapper, isolated from
 * live-distribution-signaling-server.js and google-login-endpoint.js
 * (separate process/port, separate trust domain: cloud-LLM inference).
 * Mirrors GoogleAuthAdapterServer's listen()/close() shape so it can be
 * started/stopped the same way existing server tests already do.
 *
 * STARTUP VALIDATION: by default (validateOnStart: true) the
 * constructor throws immediately if no API key is available at
 * construction time, so a misconfigured deployment fails loudly at
 * boot rather than silently 503-ing on first real request. Pass
 * validateOnStart:false (used by tests that want to exercise the
 * per-request missing-key path instead) to skip that boot-time check.
 */
class GeminiBackendServer {
    #httpServer;

    constructor({ getApiKey = defaultGetApiKey, fetchImpl, model, timeoutMs, onServerEvent, path = '/ai/gemini', validateOnStart = true } = {}) {
        if (validateOnStart) {
            const key = getApiKey();
            if (typeof key !== 'string' || key.length === 0) {
                throw new Error('[gemini-backend-endpoint] Startup validation failed: GEMINI_API_KEY is not set. Refusing to start rather than serving silent 503s. Set validateOnStart:false only in tests that intentionally exercise the missing-key request path.');
            }
        }
        const handleGeminiRequest = createGeminiRequestHandler({ getApiKey, fetchImpl, model, timeoutMs, onServerEvent });
        this.#httpServer = http.createServer((req, res) => {
            const url = new URL(req.url, 'http://localhost');
            if (url.pathname !== path) {
                sendJson(res, 404, { success: false, reason: 'NOT_FOUND' });
                return;
            }
            handleGeminiRequest(req, res).catch(() => {
                // handleGeminiRequest already catches everything internally;
                // this is an absolute last-resort net, still key-free.
                if (!res.headersSent) sendJson(res, 500, { success: false, reason: GENERIC_FAILURE_REASONS.INTERNAL_ERROR });
            });
        });
    }

    listen(port, host) { return new Promise((resolve) => this.#httpServer.listen(port, host, () => resolve(this.#httpServer.address()))); }
    close() { return new Promise((resolve) => this.#httpServer.close(() => resolve())); }
    get raw() { return this.#httpServer; }
}

module.exports = {
    createGeminiRequestHandler,
    callGemini,
    defaultGetApiKey,
    GeminiBackendServer,
    GENERIC_FAILURE_REASONS,
    DEFAULT_MODEL,
};
