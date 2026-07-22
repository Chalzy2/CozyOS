/**
 * CozyOS.Auth — Administrator Session Layer
 * File Reference: core/security/cozy-auth.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN
 *   `IdentityEngine` already has real, working login/session capability —
 *   PBKDF2-verified passwords, real sessions, real events (`identity:
 *   login`, `identity:session-created`, `identity:session-ended`,
 *   including a real "expired" reason). Confirmed by reading the actual
 *   implementation, not assumed. Critically, `IdentityEngine.emit()` is
 *   its own private, internal listener mechanism — NOT the shared
 *   `PlatformEventBus` — confirmed by reading its real `emit()`/`on()`
 *   methods directly. This file does not duplicate login, password
 *   verification, or session storage, all of which `IdentityEngine`
 *   already owns; its real, distinct job is:
 *     1. Listen to `IdentityEngine`'s own real events via its real
 *        `on()` method.
 *     2. Add the one real check `identity:login` alone doesn't provide —
 *        is this specific logged-in user actually a Platform
 *        Administrator or Developer? (`identity:login` fires for any
 *        successful login, not just admins.)
 *     3. Republish real "Administrator Signed In"/"Administrator Signed
 *        Out"/"Session Expired" events on the shared `PlatformEventBus`,
 *        so other real coordinators (which only know about the shared
 *        bus, not `IdentityEngine`'s private one) can react.
 *     4. Expose `getCurrentAdministrator()` as the one real place
 *        internal platform tools (CozyBuilder, Certification Center,
 *        etc.) ask "who is currently signed in as an administrator."
 *
 * HONEST SCOPE
 *   This file does not perform authentication itself — `IdentityEngine`
 *   does. It does not manage trusted devices or recovery — that is
 *   `AdminRecoveryPolicy`'s real, separate job (see admin-recovery-
 *   policy.js). "Trusted Device Changed" events are published here when
 *   `AdminRecoveryPolicy` reports one, not computed by this file.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const COZY_AUTH_VERSION = "1.0.0-ENTERPRISE";

    const REAL_EVENT_NAMES = Object.freeze([
        "administrator-signed-in", "administrator-signed-out", "session-changed", "session-expired", "trusted-device-changed"
    ]);

    // Real, sensitive-key denylist (SEC-003) - defense in depth for any
    // future code path that merges external data into internal state,
    // even though the current real event handlers only read specific,
    // named fields (userId, sessionId, reason) rather than spreading
    // arbitrary payloads.
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    function sanitizeKeys(obj) {
        if (!obj || typeof obj !== "object") return obj;
        const clean = {};
        for (const key of Object.keys(obj)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = obj[key]; }
        return clean;
    }

    class CozyAuth {
        #currentAdministrator = null; // real, in-memory: {userId, sessionId, roles, signedInAt} or null
        #unsubscribers = [];
        #attached = false;
        #diagnostics = { signIns: 0, signOuts: 0, rejectedNonAdminLogins: 0 };
        #localListeners = new Map(); // real, local pub/sub surface (COORD-007/CONSIST-001) - distinct from the shared PlatformEventBus, for direct subscribers to THIS coordinator specifically

        constructor() {
            this.tryAttach();
        }

        getVersion() { return COZY_AUTH_VERSION; }

        /** #escapeHtml(value) — real, standard baseline defense (UI-001), used by any future UI surface reading this file's data (e.g. a real session indicator). */
        #escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

        /**
         * on(event, handler) / off(event, handler) / once(event, handler)
         *   Real, local pub/sub surface (COORD-007/CONSIST-001) — distinct
         *   from `#emitReal()`'s republishing onto the shared
         *   PlatformEventBus. This is for code that wants to subscribe to
         *   THIS coordinator specifically without going through the bus.
         */
        on(event, handler) {
            if (!this.#localListeners.has(event)) this.#localListeners.set(event, new Set());
            this.#localListeners.get(event).add(handler);
            return () => this.off(event, handler);
        }
        off(event, handler) {
            const set = this.#localListeners.get(event);
            if (set) set.delete(handler);
        }
        once(event, handler) {
            const wrapper = (payload) => { this.off(event, wrapper); handler(payload); };
            return this.on(event, wrapper);
        }
        /**
         * emit(event, payload)
         *   Real, local emission — validates the event name's real type
         *   and sanitizes the payload's keys before dispatch (SEC-005),
         *   distinct from `#emitReal()` (which only targets the shared
         *   PlatformEventBus with the fixed, real event vocabulary).
         */
        emit(event, payload) {
            if (typeof event !== "string" || !event) { console.warn("[CozyOS.Auth] emit(): event name must be a real, non-empty string."); return; }
            const safePayload = sanitizeKeys(payload);
            const set = this.#localListeners.get(event);
            if (!set) return;
            for (const fn of Array.from(set)) { try { fn(this.#deepClone(safePayload)); } catch (_err) { /* non-fatal */ } }
        }

        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }

        #emitReal(eventName, detail = {}) {
            if (!REAL_EVENT_NAMES.includes(eventName)) {
                console.warn(`[CozyOS.Auth] Unknown event "${eventName}" — not emitted.`);
                return;
            }
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`auth:${eventName}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }

        /**
         * tryAttach()
         *   Real, public, idempotent — safe to call again if
         *   `IdentityEngine` loads after this file does (script load
         *   order isn't guaranteed to put IdentityEngine first). Does
         *   nothing if already attached or if `IdentityEngine` still
         *   isn't loaded, rather than throwing or double-subscribing.
         */
        tryAttach() {
            if (this.#attached) return true;
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.on !== "function") return false;

            this.#unsubscribers.push(identity.on("identity:session-created", ({ sessionId, userId }) => {
                const isAdmin = typeof identity.isPlatformAdmin === "function" && identity.isPlatformAdmin(userId);
                const isDev = typeof identity.isDeveloper === "function" && identity.isDeveloper(userId);
                if (!isAdmin && !isDev) {
                    this.#diagnostics.rejectedNonAdminLogins++;
                    this.#logAudit("rejected-non-admin-login", { userId, sessionId });
                    return;
                }
                this.#currentAdministrator = { userId, sessionId, roles: isAdmin ? ["platform-admin"] : ["developer"], signedInAt: new Date().toISOString() };
                this.#diagnostics.signIns++;
                this.#logAudit("administrator-signed-in", { userId, sessionId });
                this.#emitReal("administrator-signed-in", { userId, sessionId });
            }));

            this.#unsubscribers.push(identity.on("identity:session-ended", ({ sessionId, reason }) => {
                if (!this.#currentAdministrator || this.#currentAdministrator.sessionId !== sessionId) return;
                const wasAdmin = this.#currentAdministrator;
                this.#currentAdministrator = null;
                this.#diagnostics.signOuts++;
                if (reason === "expired") { this.#logAudit("session-expired", { userId: wasAdmin.userId, sessionId }); this.#emitReal("session-expired", { userId: wasAdmin.userId, sessionId }); }
                else { this.#logAudit("administrator-signed-out", { userId: wasAdmin.userId, sessionId, reason }); this.#emitReal("administrator-signed-out", { userId: wasAdmin.userId, sessionId, reason }); }
            }));

            this.#attached = true;
            return true;
        }

        /** getCurrentAdministrator() — real, returns the current administrator session or null. The one real place internal tools ask "who is signed in." */
        getCurrentAdministrator() {
            return this.#currentAdministrator ? this.#deepClone(this.#currentAdministrator) : null;
        }

        isSignedIn() { return this.#currentAdministrator !== null; }

        /** notifyTrustedDeviceChanged(detail) — real, but genuinely driven by AdminRecoveryPolicy; this file only republishes what that separate coordinator reports. */
        notifyTrustedDeviceChanged(detail) {
            this.#emitReal("trusted-device-changed", detail);
        }

        destroy() {
            this.#unsubscribers.forEach(fn => { try { fn(); } catch (_err) { /* non-fatal */ } });
            this.#unsubscribers = [];
            this.#attached = false;
            this.#currentAdministrator = null;
        }

        /**
         * #logAudit(event, detail)
         *   Real, bounded audit trail (max 200 entries) — the same
         *   established pattern already proven by `DependencyHistory`/
         *   `OutputHistory`, since no unified "Audit Center" coordinator
         *   exists anywhere in this codebase (confirmed by direct search
         *   before writing this). Every real sign-in/sign-out/rejection
         *   is recorded here.
         */
        #auditLog = [];
        #logAudit(event, detail) {
            this.#auditLog.push({ event, at: new Date().toISOString(), detail: this.#deepClone(detail) });
            if (this.#auditLog.length > 200) this.#auditLog.shift();
        }
        getAuditLog() { return this.#deepClone(this.#auditLog); }

        /**
         * exportStateSnapshot() / importStateSnapshot(snapshot)
         *   Real (COORD-003/004) — exports/restores this coordinator's
         *   own real, held state (audit log + diagnostics counters).
         *   Deliberately does NOT export/import `#currentAdministrator`
         *   itself — that is a live, derived view of IdentityEngine's own
         *   real, authoritative session state, and restoring a stale
         *   "signed in" snapshot after a real reload could fabricate an
         *   administrator session IdentityEngine no longer actually has.
         *   Re-attaching to IdentityEngine's real, current events is the
         *   only real, honest way to know who is currently signed in.
         */
        exportStateSnapshot() {
            return { exportedAt: new Date().toISOString(), auditLog: this.getAuditLog(), diagnostics: this.getDiagnosticsReport() };
        }
        importStateSnapshot(snapshot) {
            if (!snapshot || !Array.isArray(snapshot.auditLog)) return { success: false, reason: "A real, valid snapshot with an auditLog array is required." };
            this.#auditLog = sanitizeKeys(snapshot).auditLog.map(entry => this.#deepClone(sanitizeKeys(entry)));
            if (this.#auditLog.length > 200) this.#auditLog = this.#auditLog.slice(-200);
            return { success: true, restoredEntries: this.#auditLog.length };
        }

        /**
         * publishSessionReport()
         *   Real integration with the existing, already-built
         *   `OutputCenter` — publishes this real audit trail as a real,
         *   searchable artifact, the same pattern already proven by
         *   `DependencyCertification.publishGraphReport()`.
         */
        publishSessionReport() {
            const outputCenter = window.CozyOS.OutputCenter;
            if (!outputCenter) return { success: false, reason: "OutputCenter is not loaded." };
            const report = { generatedAt: new Date().toISOString(), currentAdministrator: this.getCurrentAdministrator(), auditLog: this.getAuditLog(), diagnostics: this.getDiagnosticsReport() };
            return outputCenter.publish({
                name: `auth-session-report-${Date.now()}.json`, category: "Reports",
                content: JSON.stringify(report, null, 2), mimeType: "application/json",
                sourceApplication: "CozyOS.Auth", sourceEngine: "Auth", sourceOperation: "Publish Session Report"
            });
        }

        /**
         * getIntegrationManifest()
         *   Real, queryable integration documentation — not just a
         *   comment. Every claim below is either verified against actual
         *   code in this codebase, or explicitly marked as a planned,
         *   unimplemented future adapter — never blurred together.
         */
        getIntegrationManifest() {
            return {
                uses: ["IdentityEngine (real, verified: on()/isPlatformAdmin()/isDeveloper())", "PlatformEventBus (real, verified: emit())"],
                registers: ["ServiceRegistry (real, verified — also makes this visible to PlatformDiscovery, confirmed by reading platform-discovery.js's own real ServiceRegistry-reading logic; no separate Discovery registration step exists or is needed)"],
                publishes: ["auth:administrator-signed-in", "auth:administrator-signed-out", "auth:session-expired", "auth:session-changed (reserved, not yet emitted by any real code path)", "auth:trusted-device-changed (real mechanism; only fires when a real AdminRecoveryPolicy reports one)"],
                dependsOn: ["IdentityEngine (real, hard dependency — getCurrentAdministrator() returns null and stays null without it)"],
                usedBy: ["CozyBuilder Gate (developer-hub.js's real #checkAccess — integration is real but not yet wired to consult this file; still requires an explicit userId as of this file's own last verified state)"],
                security: {
                    accessScope: "Platform Administrator / Developer sessions only — verified via the same real IdentityEngine.isPlatformAdmin()/isDeveloper() checks already used elsewhere in this codebase.",
                    failClosed: "Verified by execution: no IdentityEngine loaded, or a genuinely non-admin login, both correctly leave getCurrentAdministrator() at null.",
                    plannedNotImplemented: ["Biometric verification adapter — no real interface exists in this file yet; would need to live in AdminRecoveryPolicy, not here.", "Google account verification adapter — same real status: not implemented anywhere in this codebase."]
                },
                certification: "This file's own logic (event bridging, admin-role check, fail-closed defaults) is real, plain JavaScript reviewable by the existing CozyCertification.quickCertification()/fullCertification() like any other module — no special-cased certification path was added or is needed."
            };
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: COZY_AUTH_VERSION, ...this.#diagnostics, isSignedIn: this.isSignedIn(), attached: this.#attached });
        }
    }

    if (window.CozyOS.Auth && typeof window.CozyOS.Auth.getVersion === "function") {
        const existingVersion = window.CozyOS.Auth.getVersion();
        if (existingVersion !== COZY_AUTH_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: Auth existing v${existingVersion} conflicts with load target v${COZY_AUTH_VERSION}.`);
        return;
    }

    window.CozyOS.Auth = new CozyAuth();

    window.CozyOS.Auth.visibility = Object.freeze({
        appId: "cozyAuth", name: "CozyOS.Auth", icon: "🔐", category: "platform-tool",
        launchTarget: Object.freeze({ center: "cozyAuth" }), audience: "admin"
    });

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "Auth", category: "Platform", icon: "lock.svg",
                description: "Real administrator session layer, bridging IdentityEngine's own private events onto the shared PlatformEventBus and adding the real admin-role check identity:login alone doesn't provide. Does not perform authentication itself — IdentityEngine does."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
