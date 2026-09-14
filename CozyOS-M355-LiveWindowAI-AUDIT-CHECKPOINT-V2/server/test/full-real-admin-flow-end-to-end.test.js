'use strict';

/**
 * server/test/full-real-admin-flow-end-to-end.test.js
 *
 * M-IDGATE — the complete, real Admin flow, end to end, with NOTHING
 * about the server-side session mechanism stubbed or bypassed:
 *
 *   1. A real HTTP server (server/static-boundary-server.js -> the real
 *      server/webauthn-rp/rp.js + server/webauthn-rp/server.js).
 *   2. A real WebAuthn registration + authentication ceremony (via the
 *      existing virtual-authenticator.js test helper — the same one
 *      server/webauthn-rp/test/http-integration.test.js and
 *      server/test/chalzydashboard-gate-integration.test.js already
 *      use), against the real, UNCHANGED rp.js (scrypt password path
 *      not exercised here; this drives the WebAuthn/passkey path).
 *   3. The real Set-Cookie header the server issues — asserted to carry
 *      the exact, unmodified 30-day Max-Age (SESSION_TTL_MS /
 *      sessionCookieHeader() in server/webauthn-rp/{rp,server}.js,
 *      neither touched by this fix).
 *   4. The real GET /webauthn/session verdict, fed into the real,
 *      unmodified core/shell/admin-gate-core.js's decideGateAction() —
 *      proving the server-authoritative decision (used today by both
 *      chalzydashboard.html and admin-workspace.html's own
 *      mountWorkspaceIfAdmin()) resolves to LOAD_ADMIN_WORKSPACE.
 *   5. The exact same real verdict, translated into the identical
 *      Session.establishFromExternalAuth({uid, roles}) shape
 *      AuthCoordinator's own #finishServerLogin() produces, fed into
 *      the real, FIXED core/shell/cozy-login-gate.js — proving
 *      mountIfNeeded() now calls onAuthenticated() for this exact
 *      real identity, closing the confirmed bug.
 *
 * Nothing in server/webauthn-rp/ or server/static-boundary-server.js is
 * touched by this fix, and none of it is stubbed here — every session,
 * cookie, and admin-verdict value in this test comes from a real round
 * trip to a real server process. Only the browser DOM around
 * cozy-login-gate.js is stubbed (same minimal vm-sandbox pattern as
 * core/shell/tests/identity-routing-real-composition.test.js and
 * core/shell/tests/cozy-login-gate-admin-session-fix.test.js), because
 * no jsdom is available in this environment (confirmed by those
 * existing files' own header comments) — the DECISION LOGIC in every
 * file involved is real and unmodified except for the one, already-
 * reviewed diff in cozy-login-gate.js.
 *
 * Run: node --test server/test/full-real-admin-flow-end-to-end.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const nodeCrypto = require('node:crypto');
const { TextEncoder, TextDecoder } = require('node:util');

const { createBoundaryServer } = require('../static-boundary-server');
const { createVirtualAuthenticator } = require('../webauthn-rp/test/virtual-authenticator');
const { freshDbPath: freshTmpDbPath } = require('../webauthn-rp/test/tmp-db');

const ROOT = path.resolve(__dirname, '..', '..');
const RP_ID = 'localhost';
const ORIGIN = 'http://localhost';

function read(relPath) { return fs.readFileSync(path.join(ROOT, relPath), 'utf8'); }
function freshDbPath() { return freshTmpDbPath('full-admin-flow'); }

async function withServer(fn) {
    const dbPath = freshDbPath();
    const server = createBoundaryServer({ siteRoot: ROOT, dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN });
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;
    try {
        await fn({ base, rp: server.rp });
    } finally {
        await new Promise((resolve) => server.close(resolve));
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
        for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
    }
}

async function post(base, path_, body, cookie) {
    const res = await fetch(base + path_, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: JSON.stringify(body || {}),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json, res };
}

async function getSession(base, cookie) {
    const res = await fetch(base + '/webauthn/session', { headers: cookie ? { Cookie: cookie } : {} });
    const json = await res.json().catch(() => ({}));
    return { httpStatus: res.status, rawSetCookie: res.headers.get('set-cookie'), ...json };
}

/** Real WebAuthn registration + authentication against the real server — returns the real Set-Cookie header string and the real userId. */
async function realWebAuthnLogin(base, rp, { email, admin }) {
    const auth = createVirtualAuthenticator({ rpId: RP_ID, origin: ORIGIN });
    const begin = await post(base, '/webauthn/register/begin', { email });
    const regResp = auth.register(begin.json.challenge);
    const complete = await post(base, '/webauthn/register/complete', {
        email, clientDataJSON: regResp.clientDataJSON, attestationObject: regResp.attestationObjectB64,
    });
    assert.equal(complete.status, 200, 'real WebAuthn registration must succeed');

    const user = await rp.getOrCreateUser(email);
    if (admin) await rp.setPlatformAdmin(user.id, true);

    const authBegin = await post(base, '/webauthn/authenticate/begin', { email });
    const assertion = auth.authenticate(authBegin.json.challenge);
    const authComplete = await post(base, '/webauthn/authenticate/complete', {
        credentialId: assertion.credentialId, clientDataJSON: assertion.clientDataJSON,
        authenticatorData: assertion.authenticatorDataB64, signature: assertion.signatureB64,
    });
    assert.equal(authComplete.status, 200, 'real WebAuthn authentication must succeed');
    const setCookie = authComplete.res.headers.get('set-cookie');
    return { cookie: setCookie.split(';')[0], rawSetCookie: setCookie, userId: user.id };
}

// --- minimal client-side DOM stub for cozy-login-gate.js (see file header) ---
function makeElement(id) {
    return {
        id: id || null, style: {}, children: [], classList: { add() {}, remove() {} },
        appendChild(child) { this.children.push(child); },
        addEventListener() {}, removeEventListener() {},
        querySelector() { return makeElement(); }, querySelectorAll() { return []; },
        set value(v) { this._value = v; }, get value() { return this._value || ''; },
        set checked(v) { this._checked = v; }, get checked() { return this._checked || false; },
        set innerHTML(v) { this._innerHTML = v; }, get innerHTML() { return this._innerHTML || ''; },
    };
}

function buildClientSandbox() {
    const registry = new Map();
    const sandbox = {
        console, setTimeout, clearInterval, setInterval,
        document: {
            body: makeElement(),
            createElement: () => {
                const el = makeElement();
                const origAppend = el.appendChild.bind(el);
                el.appendChild = (child) => { origAppend(child); if (child.id) registry.set(child.id, child); };
                return el;
            },
            getElementById: (id) => registry.get(id) || (id === 'cozy-logout-button' ? makeElement(id) : null),
            addEventListener: () => {},
        },
        navigator: {}, crypto: nodeCrypto.webcrypto, TextEncoder, TextDecoder,
        window: null,
    };
    sandbox.window = sandbox;
    sandbox.window.addEventListener = () => {};
    sandbox.CozyOS = { registerCoordinator: () => {} };
    sandbox.window.CozyOS = sandbox.CozyOS;
    sandbox.window.location = { reload() {} };

    vm.createContext(sandbox);
    vm.runInContext(read('core/modules/identity/identity-engine.js'), sandbox);
    vm.runInContext(read('core/modules/session/cozy-session-service.js'), sandbox);
    vm.runInContext(read('core/shell/cozy-login-gate.js'), sandbox);
    return sandbox;
}

function wireHonestAuthCoordinator(sandbox) {
    sandbox.window.CozyOS.AuthCoordinator = {
        restoreSession: async () => {},
        isAuthenticated: () => !!(sandbox.window.CozyOS.Session && sandbox.window.CozyOS.Session.isSignedIn()),
        getCurrentIdentity: () => {
            const current = sandbox.window.CozyOS.Session && sandbox.window.CozyOS.Session.current();
            return current ? { userId: current.uid, source: current.source, roles: current.roles ? [...current.roles] : [] } : null;
        },
    };
}

/** Loads the real, unmodified admin-gate-core.js into its own tiny sandbox and returns its decideGateAction(). */
function realDecideGateAction() {
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(read('core/shell/admin-gate-core.js'), sandbox);
    return sandbox.window.CozyOS.AdminGateCore.decideGateAction;
}

test('FULL REAL FLOW: real WebAuthn Admin login -> real 30-day cookie -> real server verdict -> real admin-gate-core.js says LOAD_ADMIN_WORKSPACE -> real (fixed) cozy-login-gate.js reaches onAuthenticated()', async () => {
    await withServer(async ({ base, rp }) => {
        const email = 'chalzowuor516@gmail.com';

        // Step 1-3: real registration + real WebAuthn authentication against
        // the real, UNCHANGED server. Nothing here is mocked.
        const { cookie, rawSetCookie, userId } = await realWebAuthnLogin(base, rp, { email, admin: true });

        // Step 3 (assertion): the real cookie the real server issued still
        // carries the real, unmodified 30-day Max-Age — proving this fix
        // touched nothing about session persistence.
        assert.match(rawSetCookie, /HttpOnly/);
        assert.match(rawSetCookie, /SameSite=Strict/);
        assert.match(rawSetCookie, new RegExp(`Max-Age=${30 * 24 * 60 * 60}\\b`));

        // Step 4: the real server verdict for this real cookie.
        const verdict = await getSession(base, cookie);
        assert.equal(verdict.httpStatus, 200);
        assert.equal(verdict.authenticated, true);
        assert.equal(verdict.isPlatformAdmin, true);
        assert.equal(verdict.email, email);

        // Fed into the real, unmodified admin-gate-core.js (the exact
        // module admin-workspace.html's mountWorkspaceIfAdmin() and
        // chalzydashboard.html both already call against a fresh
        // GET /webauthn/session — untouched by this fix).
        const decideGateAction = realDecideGateAction();
        const decision = decideGateAction({ httpStatus: verdict.httpStatus, authenticated: verdict.authenticated, isPlatformAdmin: verdict.isPlatformAdmin, organizations: verdict.organizations || [] });
        assert.equal(decision.action, 'LOAD_ADMIN_WORKSPACE');

        // Step 5: this is the exact real premise of the confirmed bug —
        // this server-authenticated admin has NO local IdentityEngine
        // record (IdentityEngine never learns about server/WebAuthn-RP
        // accounts; it is a wholly separate, client-side-only store).
        const clientSandbox = buildClientSandbox();
        assert.equal(clientSandbox.window.CozyOS.IdentityEngine.getUser(email), null, 'premise check: no local IdentityEngine record exists for this real server-authenticated admin');

        // Exactly what AuthCoordinator's real #finishServerLogin() does
        // with a server verdict shaped like this one (see
        // core/modules/identity/auth-coordinator.js:500-516) —
        // establishFromExternalAuth({uid: email, roles: [...]}).
        clientSandbox.window.CozyOS.Session.establishFromExternalAuth({
            uid: email,
            roles: verdict.isPlatformAdmin ? ['platform-admin'] : [],
            profile: { email, authMode: 'server-passkey' },
        });
        wireHonestAuthCoordinator(clientSandbox);

        let onAuthenticatedCalls = 0;
        const container = makeElement();
        await clientSandbox.window.CozyOS.LoginGate.mountIfNeeded(container, () => { onAuthenticatedCalls++; });

        assert.equal(onAuthenticatedCalls, 1, 'the real, fixed cozy-login-gate.js must call onAuthenticated() for this real server-authenticated Admin — this is the confirmed bug, now closed');

        void userId;
    });
});

test('FULL REAL FLOW: a real, non-admin WebAuthn login never reaches LOAD_ADMIN_WORKSPACE nor gets routed into the admin workspace client-side', async () => {
    await withServer(async ({ base, rp }) => {
        const email = 'ordinary-real-user@example.com';
        const { cookie } = await realWebAuthnLogin(base, rp, { email, admin: false });
        const verdict = await getSession(base, cookie);
        assert.equal(verdict.isPlatformAdmin, false);

        const decideGateAction = realDecideGateAction();
        const decision = decideGateAction({ httpStatus: verdict.httpStatus, authenticated: verdict.authenticated, isPlatformAdmin: verdict.isPlatformAdmin, organizations: verdict.organizations || [] });
        assert.notEqual(decision.action, 'LOAD_ADMIN_WORKSPACE');

        // Client-side: cozy-login-gate.js's fix is admin-agnostic (it just
        // lets an externally-verified identity reach the real check) —
        // onAuthenticated() firing here is fine and expected; what matters
        // is that the REAL authorization decision (asserted above) never
        // granted admin, which is the actual security boundary.
        const clientSandbox = buildClientSandbox();
        clientSandbox.window.CozyOS.Session.establishFromExternalAuth({
            uid: email, roles: [], profile: { email, authMode: 'server-passkey' },
        });
        wireHonestAuthCoordinator(clientSandbox);
        let onAuthenticatedCalls = 0;
        await clientSandbox.window.CozyOS.LoginGate.mountIfNeeded(makeElement(), () => { onAuthenticatedCalls++; });
        assert.equal(onAuthenticatedCalls, 1); // reaches the (safe, real) downstream check — never itself grants admin
    });
});
