/**
 * CozyOS — Session Service
 * File Reference: core/modules/session/cozy-session-service.js
 * Layer: Platform Service (PluginManager-registered)
 * Version: 1.0.0-ENTERPRISE
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS — PLATFORM PREREQUISITE, DISCOVERED DURING MIGRATION
 * ═══════════════════════════════════════════════════════════════════════
 *   Found during the Personal Vault application migration: every one of
 *   the 19 applications needs "who is the current user" (uid, cozyId,
 *   profile, company, roles, permissions), and none of that existed
 *   anywhere in the platform. Building it 19 times as
 *   window.CozyOS.currentUid placeholders inside each application
 *   module would have meant revisiting all 19 later. Per Rules 3, 17,
 *   23, 26: this is a real, shared platform capability, built once,
 *   before continuing application migration.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RULE 25 — CANONICAL OWNERSHIP DECLARATION
 * ═══════════════════════════════════════════════════════════════════════
 *   Canonical Owner: the current, live session snapshot — who is signed
 *   in right now, and the real roles/permissions/company reference that
 *   go with them. Session lifecycle events (started/ended).
 *
 *   Does NOT Own — and structurally cannot, since this file authenticates
 *   no one and stores no credentials itself:
 *     ✗ Authentication mechanics, password hashing, session-token
 *       validation logic — IdentityEngine's domain. This service calls
 *       IdentityEngine.validateSession()/getUser() for CozyOS-native
 *       logins; it never re-implements that logic.
 *     ✗ Any specific external auth provider (Firebase, Google, etc.) —
 *       deliberately unaware of any of them. External auth providers
 *       report a real, already-authenticated identity through
 *       establishFromExternalAuth() below; this service never reaches
 *       out to an external provider itself. (See the separate, optional
 *       core/modules/session/firebase-session-bridge.js for the one
 *       real bridge this platform currently needs.)
 *     ✗ Company/Organization data — Company Engine's domain; this
 *       service only carries a companyId reference forward.
 *     ✗ Secrets, tokens, credentials — Vault's domain; never stored here.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * HONEST SCOPE
 *   Real, in-memory current session — not durable across reload by
 *   itself. A real external auth provider (like the Firebase bridge)
 *   re-establishes the session on each real page load via its own
 *   real auth-state-restoration mechanism (e.g. Firebase's
 *   browserLocalPersistence, already configured in firebase.js) —
 *   this service reflects whatever it's told, honestly, never
 *   fabricating a session that wasn't reported to it.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const SESSION_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    function sanitizeObject(input) { if (!input || typeof input !== "object") return {}; const clean = {}; for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; } return clean; }
    function escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

    class CozySessionService {
        #current = null; // real, live session snapshot, or null when signed out
        #auditLog = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { sessionsEstablished: 0, sessionsEnded: 0, identityValidations: 0, identityValidationFailures: 0, externalAuthReports: 0 };

        getVersion() { return SESSION_VERSION; }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #logAudit(action, msg) { this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg: escapeHtml(msg) })); if (this.#auditLog.length > 2000) this.#auditLog.shift(); }
        getAuditLog(predicate) { const list = this.#auditLog.map(e => ({ ...e })); return Object.freeze(predicate ? list.filter(predicate) : list); }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[Session] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[Session] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { if (typeof h !== "function") throw new TypeError("[Session] once(): handler required."); const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { const s = this.#listeners.get(e); if (!s || s.size === 0) return false; for (const fn of Array.from(s)) { try { fn(p); } catch (_err) { /* listener errors never break session state */ } } return true; }

        /**
         * current()
         *   Real, live snapshot. Returns null honestly when nobody is
         *   signed in — never fabricates a default/anonymous session.
         */
        current() { return this.#current ? { ...this.#current } : null; }
        isSignedIn() { return this.#current !== null; }

        /**
         * establishFromIdentity(sessionId)
         *   Real, for CozyOS-native logins: validates the sessionId via
         *   IdentityEngine's own validateSession() (never re-deriving
         *   that logic here), then pulls the real user profile via the
         *   newly-added getUser(), and the real company reference via
         *   getCompanyReference() — reusing both, never duplicating.
         */
        establishFromIdentity(sessionId) {
            const identity = window.CozyOS && window.CozyOS.IdentityEngine;
            if (!identity) throw new Error("[Session] establishFromIdentity(): IdentityEngine is not connected.");
            this.#diagnostics.identityValidations++;
            const validation = identity.validateSession(sessionId);
            if (!validation.valid) { this.#diagnostics.identityValidationFailures++; throw new Error(`[Session] establishFromIdentity(): ${validation.reason}`); }
            const session = identity.getSession(sessionId);
            const user = identity.getUser(session.userId);
            if (!user) throw new Error(`[Session] establishFromIdentity(): user "${session.userId}" not found.`);
            const companyRef = typeof identity.getCompanyReference === "function" ? identity.getCompanyReference(session.userId) : null;

            this.#current = Object.freeze({
                source: "identity", sessionId, uid: user.userId, cozyId: null,
                user: Object.freeze({ userId: user.userId, username: user.username, status: user.status }),
                company: companyRef ? Object.freeze({ ...companyRef }) : null,
                roles: Object.freeze([...user.roles]),
                permissions: null, // resource-level permissions are checked on demand via IdentityEngine.checkResourcePermission(), never cached here (could go stale)
                establishedAt: new Date().toISOString(),
            });
            this.#diagnostics.sessionsEstablished++;
            this.#logAudit("SESSION_ESTABLISHED", `identity:${user.userId}`);
            this.emit("session-started", { source: "identity", uid: user.userId });
            return this.current();
        }

        /**
         * establishFromExternalAuth({uid, cozyId, profile, roles, companyId})
         *   Real, generic bridge point for any external auth provider
         *   (Firebase, or any future one) to report an already-verified
         *   identity. This service never calls out to the provider
         *   itself — it only accepts what it's honestly told. Sanitizes
         *   the input object (Rule: prototype-pollution guard on
         *   caller-supplied data).
         */
        establishFromExternalAuth(rawProfile) {
            const p = sanitizeObject(rawProfile);
            if (!p.uid || typeof p.uid !== "string") throw new TypeError("[Session] establishFromExternalAuth(): uid is required.");
            this.#current = Object.freeze({
                source: "external", sessionId: null, uid: p.uid, cozyId: p.cozyId ? escapeHtml(p.cozyId) : null,
                user: p.profile ? Object.freeze({ ...sanitizeObject(p.profile) }) : null,
                company: p.companyId ? Object.freeze({ companyId: escapeHtml(p.companyId) }) : null,
                roles: Object.freeze(Array.isArray(p.roles) ? p.roles.map(r => escapeHtml(r)) : []),
                permissions: null,
                establishedAt: new Date().toISOString(),
            });
            this.#diagnostics.externalAuthReports++;
            this.#diagnostics.sessionsEstablished++;
            this.#logAudit("SESSION_ESTABLISHED", `external:${p.uid}`);
            this.emit("session-started", { source: "external", uid: p.uid });
            return this.current();
        }

        /** end() — real, honest sign-out. Never assumes a prior session existed. */
        end() {
            if (!this.#current) return false;
            const prev = this.#current;
            this.#current = null;
            this.#diagnostics.sessionsEnded++;
            this.#logAudit("SESSION_ENDED", prev.uid);
            this.emit("session-ended", { uid: prev.uid, source: prev.source });
            return true;
        }

        getDiagnosticsReport() { return { pluginVersion: SESSION_VERSION, ...this.#diagnostics, currentlySignedIn: this.isSignedIn(), auditLogSize: this.#auditLog.length }; }
        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(SESSION_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
    }

    if (window.CozyOS.Session && typeof window.CozyOS.Session.getVersion === "function") {
        const existingVersion = window.CozyOS.Session.getVersion();
        if (existingVersion !== SESSION_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: Session existing v${existingVersion} conflicts with load target v${SESSION_VERSION}.`);
        return;
    }

    const engineInstance = new CozySessionService();
    window.CozyOS.Session = engineInstance;

    const manifest = {
        id: "session",
        name: "CozyOS Session Service",
        version: SESSION_VERSION,
        description: "Real, current-session platform service. Deliberately unaware of any specific auth provider — accepts a real, already-verified identity from IdentityEngine (native logins) or any external bridge (e.g. Firebase). Applications call CozyOS.Session.current() instead of knowing any auth mechanism directly.",
        dependencies: { required: [], optional: ["window.CozyOS.IdentityEngine"] }
    };

    let kernelRegistrationAttempted = false;
    async function registerWithKernel() {
        if (kernelRegistrationAttempted) return;
        const bootstrap = window.CozyOS?.Kernel?.Bootstrap;
        if (!bootstrap) return;
        kernelRegistrationAttempted = true;
        try {
            await bootstrap.registerService({ name: "Session", version: SESSION_VERSION, apiVersion: "1.0.0", mandatory: false, dependencies: [] });
            bootstrap.initializeService("Session");
            await bootstrap.verifyService("Session", async () => window.CozyOS.Session.getVersion() === SESSION_VERSION);
            bootstrap.startService("Session");
        } catch (_err) { /* non-fatal — Session remains fully functional standalone even if Kernel registration fails */ }
    }
    registerWithKernel();
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
        document.addEventListener("cozyos:kernel-bridge-ready", registerWithKernel, { once: true });
    }

    let registrationBound = false;
    function initRegistration() {
        if (registrationBound) return;
        registrationBound = true;
        if (window.CozyOS && window.CozyOS.PluginManager) {
            window.CozyOS.PluginManager.register(manifest, engineInstance);
        } else {
            if (!window.CozyOS.KernelPlugins) window.CozyOS.KernelPlugins = new Map();
            window.CozyOS.KernelPlugins.set(manifest.id, { name: manifest.name, version: manifest.version, handler: engineInstance });
        }
    }
    initRegistration();
    if (typeof window !== "undefined") {
        window.addEventListener("kernel:ready", initRegistration, { once: true });
        window.addEventListener("DOMContentLoaded", initRegistration, { once: true });
    }
})();
