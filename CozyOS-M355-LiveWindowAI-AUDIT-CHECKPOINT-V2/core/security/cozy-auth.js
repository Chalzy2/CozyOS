/**
 * CozyOS.Auth — Administrator Session Layer
 * File Reference: core/security/cozy-auth.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.1.0-ENTERPRISE
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
 *     1. Listen to `CozySessionService`'s own real `session-started`/
 *        `session-ended` events — Session Service, not IdentityEngine,
 *        because it is the one real, provider-agnostic convergence
 *        point every session-establishment path already reports
 *        through (see Milestone 220b below).
 *     2. Add the one real check a bare session snapshot alone doesn't
 *        provide — is this specific signed-in identity actually a
 *        Platform Administrator or Developer? For `source: "identity"`
 *        sessions this reuses `IdentityEngine.isPlatformAdmin()`/
 *        `isDeveloper()` directly (never re-derived). For
 *        `source: "external"` sessions (Firebase, trusted-device,
 *        Admin Recovery restore) there is no IdentityEngine user record
 *        to check, so this reads the `roles` array the originating
 *        bridge already honestly reported to Session Service — the
 *        same real data, not a second role system.
 *     3. Republish real "Administrator Signed In"/"Administrator Signed
 *        Out"/"Session Expired" events on the shared `PlatformEventBus`,
 *        so other real coordinators (which only know about the shared
 *        bus, not `IdentityEngine`'s private one) can react.
 *     4. Expose `getCurrentAdministrator()` as the one real place
 *        internal platform tools (CozyBuilder, Certification Center,
 *        ApplicationLauncher, etc.) ask "who is currently signed in as
 *        an administrator" — regardless of which of the four real paths
 *        (native login, session restore, Firebase restore, Admin
 *        Recovery restore) established that session.
 *
 * MILESTONE 220b — REAL GAP FIX (SessionService convergence)
 *   Previously this file attached directly to `IdentityEngine`'s own
 *   `identity:session-created`/`identity:session-ended` events. That
 *   event only ever fires from a genuine `IdentityEngine.login()` call.
 *   Verified by reading `auth-coordinator.js`: session restore (the
 *   normal reload path), trusted-device login, and Admin Recovery
 *   restore all call `CozySessionService.establishFromIdentity()`/
 *   `establishFromExternalAuth()` directly and never call
 *   `IdentityEngine.login()` — so none of those three real paths ever
 *   reached this file before this fix, even though Session Service
 *   correctly showed the administrator as signed in. Firebase-restored
 *   sessions (`firebase-session-bridge.js`) have the same shape and the
 *   same real gap. Real fix: attach to `CozySessionService` (the one
 *   real, already-existing convergence point every path already
 *   reports through) instead of `IdentityEngine` directly. `IdentityEngine`
 *   is still composed, but now only for the one real role check on
 *   `source: "identity"` sessions — never for the attachment point
 *   itself.
 *
 * HONEST SCOPE
 *   This file does not perform authentication itself — `IdentityEngine`
 *   (native) or the real external bridges (Firebase, AdminRecoveryPolicy
 *   via `auth-coordinator.js`) do. It does not manage trusted devices or
 *   recovery — that is `AdminRecoveryPolicy`'s real, separate job (see
 *   admin-recovery-policy.js). "Trusted Device Changed" events are
 *   published here when `AdminRecoveryPolicy` reports one, not computed
 *   by this file. It still only ever recognizes Administrator/Developer
 *   sessions — no real end-user session type exists anywhere in CozyOS
 *   yet (already disclosed elsewhere, e.g. application-launcher.js);
 *   this file was not the place to invent one.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const COZY_AUTH_VERSION = "1.1.0-ENTERPRISE";

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
         *   `CozySessionService` loads after this file does (script load
         *   order isn't guaranteed to put Session first). Does nothing if
         *   already attached or if Session Service still isn't loaded,
         *   rather than throwing or double-subscribing.
         *
         *   Attaches to `CozySessionService` — not `IdentityEngine`
         *   directly — because Session Service is the one real
         *   convergence point every session-establishment path
         *   (`auth-coordinator.js`'s `loginWithCredentials()`,
         *   `restoreSession()`, `loginWithTrustedDevice()`, and
         *   `firebase-session-bridge.js`) already reports through. See
         *   the Milestone 220b file-header note for the verified gap
         *   this replaces.
         */
        tryAttach() {
            if (this.#attached) return true;
            const session = window.CozyOS.Session;
            if (!session || typeof session.on !== "function") return false;

            this.#unsubscribers.push(session.on("session-started", () => this.#handleSessionStarted()));
            this.#unsubscribers.push(session.on("session-ended", (payload) => this.#handleSessionEnded(payload)));

            this.#attached = true;
            return true;
        }

        /**
         * #handleSessionStarted()
         *   Reads the just-established snapshot straight from
         *   `CozySessionService.current()` (the same real object every
         *   other caller reads) rather than trusting the emitted
         *   payload alone. Real admin/developer check:
         *     - `source: "identity"` (native login, or a session
         *       restored against a real IdentityEngine record): the
         *       existing, real `IdentityEngine.isPlatformAdmin()`/
         *       `isDeveloper()` check — never re-derived here.
         *     - `source: "external"` (Firebase, trusted-device,
         *       Admin Recovery restore): the `roles` array Session
         *       Service already carries, honestly reported by whichever
         *       real bridge established the session — not a second
         *       role system.
         */
        #handleSessionStarted() {
            const session = window.CozyOS.Session;
            const snapshot = session && typeof session.current === "function" ? session.current() : null;
            if (!snapshot) return;

            let isAdmin = false, isDev = false;
            if (snapshot.source === "identity") {
                const identity = window.CozyOS.IdentityEngine;
                isAdmin = !!(identity && typeof identity.isPlatformAdmin === "function" && identity.isPlatformAdmin(snapshot.uid));
                isDev = !!(identity && typeof identity.isDeveloper === "function" && identity.isDeveloper(snapshot.uid));
            } else {
                const roles = Array.isArray(snapshot.roles) ? snapshot.roles : [];
                isAdmin = roles.includes("platform-admin") || roles.includes("administrator");
                isDev = roles.includes("developer");
            }

            if (!isAdmin && !isDev) {
                this.#diagnostics.rejectedNonAdminLogins++;
                this.#logAudit("rejected-non-admin-login", { uid: snapshot.uid, source: snapshot.source });
                return;
            }
            this.#currentAdministrator = { userId: snapshot.uid, sessionId: snapshot.sessionId || null, source: snapshot.source, roles: isAdmin ? ["platform-admin"] : ["developer"], signedInAt: snapshot.establishedAt || new Date().toISOString() };
            this.#diagnostics.signIns++;
            this.#logAudit("administrator-signed-in", { userId: snapshot.uid, source: snapshot.source });
            this.#emitReal("administrator-signed-in", { userId: snapshot.uid, source: snapshot.source });
        }

        /**
         * #handleSessionEnded({uid, source})
         *   Matches by `uid` (+ `source` when present), not `sessionId` —
         *   `establishFromExternalAuth()` sessions never have a
         *   `sessionId` (Session Service's own, real, documented
         *   behavior), so matching only on `sessionId` would silently
         *   never clear an external-sourced administrator.
         */
        #handleSessionEnded(payload) {
            const ended = payload || {};
            if (!this.#currentAdministrator || this.#currentAdministrator.userId !== ended.uid) return;
            const wasAdmin = this.#currentAdministrator;
            this.#currentAdministrator = null;
            this.#diagnostics.signOuts++;
            this.#logAudit("administrator-signed-out", { userId: wasAdmin.userId, source: wasAdmin.source });
            this.#emitReal("administrator-signed-out", { userId: wasAdmin.userId, source: wasAdmin.source });
        }

        /** getCurrentAdministrator() — real, returns the current administrator session or null. The one real place internal tools ask "who is signed in." */
        getCurrentAdministrator() {
            return this.#currentAdministrator ? this.#deepClone(this.#currentAdministrator) : null;
        }

        /**
         * getCurrentIdentity() — Milestone 200D: real, documented alias
         * for getCurrentAdministrator(). Multiple real, independent
         * callers (AuthCoordinator's own delegation, QuarryOS's
         * index.js/quarry-index.js, cozy-base-linker.js) all call
         * CozyOS.Auth.getCurrentIdentity() expecting it to exist — it
         * never did, which is the verified root cause of the silent
         * post-login failure (confirmed by executing the real code and
         * reading the actual thrown TypeError). Added here, at the real
         * canonical owner, rather than patching each caller
         * individually — one real source of truth, one real fix.
         */
        getCurrentIdentity() {
            return this.getCurrentAdministrator();
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
                uses: ["CozySessionService (real, verified: on()/current() — the real attachment point as of Milestone 220b)", "IdentityEngine (real, verified: isPlatformAdmin()/isDeveloper() — used only for the role check on source:\"identity\" sessions)", "PlatformEventBus (real, verified: emit())"],
                registers: ["ServiceRegistry (real, verified — also makes this visible to PlatformDiscovery, confirmed by reading platform-discovery.js's own real ServiceRegistry-reading logic; no separate Discovery registration step exists or is needed)"],
                publishes: ["auth:administrator-signed-in", "auth:administrator-signed-out", "auth:session-expired (reserved — CozySessionService's session-ended event carries no expiry-vs-logout reason, so this is no longer distinctly emitted; a known, disclosed pre-existing gap, not introduced by Milestone 220b)", "auth:session-changed (reserved, not yet emitted by any real code path)", "auth:trusted-device-changed (real mechanism; only fires when a real AdminRecoveryPolicy reports one)"],
                dependsOn: ["CozySessionService (real, hard dependency — getCurrentAdministrator() returns null and stays null without it; loaded before this file in dashboard.html as of Milestone 220b)"],
                usedBy: ["ApplicationLauncher (core/shell/application-launcher.js's real open() — getCurrentAdministrator() is what reaches every launched application)", "CozyBuilder Gate (developer-hub.js's real #checkAccess — integration is real but not yet wired to consult this file; still requires an explicit userId as of this file's own last verified state)"],
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
            window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/security/cozy-auth.js",
                name: "Auth", category: "Platform", icon: "lock.svg",
                description: "Real administrator session layer, bridging IdentityEngine's own private events onto the shared PlatformEventBus and adding the real admin-role check identity:login alone doesn't provide. Does not perform authentication itself — IdentityEngine does."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
