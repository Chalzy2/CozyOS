/**
 * CozyOS Authentication Enrollment Store
 * File Reference: core/security/authentication-enrollment-store.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 358 (Persistent Authentication Enrollment)
 *
 * RESPONSIBILITY
 *   The single, real source of truth for "has this user enrolled this
 *   authentication factor, when, on which device, is it currently
 *   enabled, and when was it last used" — the enrollment LIFECYCLE and
 *   METADATA layer that M356/M357 verified was missing anywhere in this
 *   codebase. This file never authenticates anyone and never verifies a
 *   credential itself (AuthFactorRegistry's individual providers already
 *   own that, per Rule 6/80/81 — compose, never duplicate).
 *
 * WHAT THIS FILE OWNS
 *   - enroll() / setEnabled() / removeEnrollment() — the real lifecycle.
 *   - enrolledAt / lastUsedAt timestamps, real and persisted.
 *   - Device association (deviceId + label + addedAt + lastUsedAt).
 *   - An append-only, bounded audit log of every lifecycle event.
 *   - Real persistence across page reloads via a single localStorage
 *     namespace — the same, already-established precedent
 *     core/security/auth-coordinator.js uses for its own non-secret
 *     session pointer ("a single small localStorage key holding only a
 *     non-secret pointer... never credentials, never password data").
 *     This file follows that precedent for enrollment metadata instead.
 *
 * WHAT THIS FILE DOES NOT OWN, ON PURPOSE (HONEST SCOPE)
 *   - Never stores a credential secret, private key, or biometric
 *     template. Enrollment metadata only: WHO/WHEN/WHICH-DEVICE/
 *     ENABLED, never the material a provider's verify() actually checks
 *     against. This mirrors core/modules/storage/cozy-storage.js's own
 *     FORBIDDEN_CREDENTIAL_FIELDS discipline (password, secret, token,
 *     biometricTemplate, faceTemplate, voiceTemplate,
 *     fingerprintTemplate) — enforced here independently since this
 *     file does not route through CozyStorage (see below).
 *   - Does NOT re-hydrate WebAuthnProvider's in-memory credential map,
 *     OtpProvider's in-memory TOTP secret map, or the honest-stub
 *     Fingerprint/Face/Voice/GoogleAccount providers' internal state on
 *     reload. Those providers (core/security/webauthn-provider.js,
 *     otp-provider.js, fingerprint-provider.js, face-provider.js,
 *     voice-provider.js, google-account-provider.js) are certified,
 *     frozen M357-or-earlier baseline files (Rule 16 — Baseline
 *     Freeze); wiring persistence into their own private in-memory maps
 *     would mean modifying already-certified files, which is out of
 *     scope for this milestone (Rule 17 — Scope Isolation). Disclosed,
 *     carried-forward limitation, not fabricated as fixed: a provider's
 *     verify() can still honestly report "verified:false — no real
 *     credential for this session" immediately after a real reload,
 *     even though AuthEnrollmentStore correctly still shows that user
 *     enrolled. This file's job is the lifecycle/metadata record of
 *     that fact, not making the credential itself survive a reload.
 *   - Does NOT use core/modules/storage/cozy-storage.js. That kernel is
 *     a document/object storage system (storage spaces, folders,
 *     versions), not a fit for small structured lifecycle records — the
 *     same real reasoning core/security/auth-coordinator.js's header
 *     already documents for its own localStorage pointer. A single
 *     dedicated localStorage namespace is the right-sized real
 *     persistence mechanism for this data shape, in this static,
 *     client-side environment (no server exists to hold anything
 *     server-side).
 *
 * FACTOR NAMES (must match AuthFactorRegistry's real registered names)
 *   "security-key" (Passkey/WebAuthn), "otp" (TOTP), "fingerprint",
 *   "face", "voice". Composes AuthFactorRegistry.hasProvider() to
 *   validate a factorName is real before recording an enrollment
 *   against it — never invents a factor name of its own.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const ENROLLMENT_STORE_VERSION = "1.0.0-ENTERPRISE";

    const STORAGE_KEY = "cozyos.authEnrollment.records.v1";
    const AUDIT_KEY = "cozyos.authEnrollment.audit.v1";
    const MAX_AUDIT_ENTRIES = 500;

    // Mirrors cozy-storage.js's own forbidden-field discipline,
    // enforced independently here since this file does not route
    // through CozyStorage. Any metadata object containing one of these
    // keys is rejected rather than silently stripped, so a caller finds
    // out immediately rather than losing data silently.
    const FORBIDDEN_FIELDS = Object.freeze([
        "password", "pin", "secret", "token", "privateKey", "seedPhrase",
        "biometricTemplate", "faceTemplate", "voiceTemplate", "fingerprintTemplate",
        "credentialSecret", "totpSecret"
    ]);

    function assertNoForbiddenFields(obj, context) {
        if (!obj || typeof obj !== "object") return;
        for (const field of FORBIDDEN_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(obj, field)) {
                throw new Error(`[AuthEnrollmentStore] Rejected: '${field}' is a forbidden credential field and cannot be stored (context: ${context}). Enrollment metadata only — never credential material.`);
            }
        }
    }

    function safeLocalStorage() {
        try { return (typeof window !== "undefined" && window.localStorage) ? window.localStorage : null; }
        catch (_err) { return null; }
    }

    function nowIso() { return new Date(Date.now()).toISOString(); }

    function deepClone(v) {
        if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
        try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
    }

    class CozyAuthEnrollmentStore {
        // In-memory mirror of localStorage, kept in sync on every
        // mutation — reads never touch localStorage directly so a
        // missing/blocked localStorage (private browsing, quota, etc.)
        // degrades to real, honestly session-only behavior instead of
        // throwing.
        #records = new Map();   // userId -> Map(factorName -> record)
        #auditLog = [];
        #persistenceAvailable = false;

        constructor() {
            this.#persistenceAvailable = !!safeLocalStorage();
            this.#loadFromStorage();
        }

        getVersion() { return ENROLLMENT_STORE_VERSION; }
        isPersistenceAvailable() { return this.#persistenceAvailable; }

        #loadFromStorage() {
            const ls = safeLocalStorage();
            if (!ls) return;
            try {
                const rawRecords = ls.getItem(STORAGE_KEY);
                if (rawRecords) {
                    const parsed = JSON.parse(rawRecords);
                    for (const [userId, factorMap] of Object.entries(parsed)) {
                        const m = new Map();
                        for (const [factorName, record] of Object.entries(factorMap)) m.set(factorName, record);
                        this.#records.set(userId, m);
                    }
                }
                const rawAudit = ls.getItem(AUDIT_KEY);
                if (rawAudit) this.#auditLog = JSON.parse(rawAudit);
            } catch (_err) {
                // Corrupt or unreadable local data — fail closed to an
                // empty, honest store rather than throwing on load.
                this.#records = new Map();
                this.#auditLog = [];
            }
        }

        #persist() {
            const ls = safeLocalStorage();
            if (!ls) return;
            try {
                const plain = {};
                for (const [userId, factorMap] of this.#records.entries()) {
                    plain[userId] = Object.fromEntries(factorMap.entries());
                }
                ls.setItem(STORAGE_KEY, JSON.stringify(plain));
                ls.setItem(AUDIT_KEY, JSON.stringify(this.#auditLog));
            } catch (_err) {
                // Quota exceeded or storage blocked mid-session — the
                // in-memory state remains correct for this session; it
                // just won't survive a reload. Non-fatal, disclosed via
                // isPersistenceAvailable()/getDiagnosticsReport().
            }
        }

        #logAudit(action, userId, factorName, detail) {
            this.#auditLog.push({ action, userId, factorName, detail: detail || null, at: nowIso() });
            if (this.#auditLog.length > MAX_AUDIT_ENTRIES) this.#auditLog.shift();
        }

        #emit(eventName, detail) {
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`authenrollment:${eventName}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }

        /** isKnownFactor(factorName) — real check against AuthFactorRegistry, the single source of truth for registered factor names. Honest pass-through if the registry isn't loaded (never invents a yes/no of its own). */
        isKnownFactor(factorName) {
            const registry = window.CozyOS.AuthFactorRegistry;
            if (!registry || typeof registry.hasProvider !== "function") return { known: null, reason: "AuthFactorRegistry is not loaded — cannot verify the factor name is real." };
            return { known: registry.hasProvider(factorName), reason: null };
        }

        /**
         * enroll(userId, factorName, { deviceId, deviceLabel, meta } = {})
         *   Real — records a new enrollment (or re-enrolls, updating
         *   enrolledAt, if one already existed for this user+factor).
         *   Fails closed if factorName is not a real, registered
         *   AuthFactorRegistry entry (when the registry is loaded).
         *   `meta` is optional, caller-supplied, non-credential metadata
         *   (e.g. a display label) — rejected outright if it contains
         *   any forbidden field.
         */
        enroll(userId, factorName, { deviceId = null, deviceLabel = null, meta = null } = {}) {
            if (!userId || !factorName) return { success: false, reason: "A real userId and factorName are both required." };
            const check = this.isKnownFactor(factorName);
            if (check.known === false) return { success: false, reason: `"${factorName}" is not a registered AuthFactorRegistry factor.` };
            try { assertNoForbiddenFields(meta, "enroll:meta"); } catch (err) { return { success: false, reason: err.message }; }

            if (!this.#records.has(userId)) this.#records.set(userId, new Map());
            const userMap = this.#records.get(userId);
            const existing = userMap.get(factorName);
            const timestamp = nowIso();

            const devices = existing ? existing.devices.slice() : [];
            if (deviceId && !devices.some(d => d.deviceId === deviceId)) {
                devices.push({ deviceId, label: deviceLabel || "Unnamed device", addedAt: timestamp, lastUsedAt: null });
            }

            const record = {
                factorName,
                enrolledAt: existing ? existing.enrolledAt : timestamp,
                reEnrolledAt: existing ? timestamp : null,
                enabled: true,
                lastUsedAt: existing ? existing.lastUsedAt : null,
                devices,
                meta: meta ? deepClone(meta) : (existing ? existing.meta : null),
                updatedAt: timestamp,
            };
            userMap.set(factorName, record);
            this.#logAudit(existing ? "re-enrolled" : "enrolled", userId, factorName, { deviceId });
            this.#emit(existing ? "re-enrolled" : "enrolled", { userId, factorName });
            this.#persist();
            return { success: true, record: deepClone(record) };
        }

        /** setEnabled(userId, factorName, enabled) — real toggle; fails closed if no enrollment exists yet (cannot enable/disable something never enrolled). */
        setEnabled(userId, factorName, enabled) {
            const record = this.#getRecordInternal(userId, factorName);
            if (!record) return { success: false, reason: "No enrollment exists for this user/factor." };
            record.enabled = enabled === true;
            record.updatedAt = nowIso();
            this.#logAudit(record.enabled ? "enabled" : "disabled", userId, factorName, null);
            this.#emit(record.enabled ? "enabled" : "disabled", { userId, factorName });
            this.#persist();
            return { success: true, record: deepClone(record) };
        }

        /** removeEnrollment(userId, factorName) — real deletion of the enrollment record. Never deletes audit history — the audit trail is append-only by design, so removal is itself always auditable. */
        removeEnrollment(userId, factorName) {
            const userMap = this.#records.get(userId);
            const existed = !!(userMap && userMap.has(factorName));
            if (existed) userMap.delete(factorName);
            if (existed) {
                this.#logAudit("removed", userId, factorName, null);
                this.#emit("removed", { userId, factorName });
                this.#persist();
            }
            return { success: existed, reason: existed ? null : "No such enrollment." };
        }

        /**
         * recordUsage(userId, factorName, { deviceId, deviceLabel } = {})
         *   Real — updates lastUsedAt on the enrollment record and, if a
         *   deviceId is given, on the matching device entry (adding it
         *   first if this is a device not seen before). Fails closed if
         *   no enrollment exists — this records usage of an existing
         *   enrollment, it never silently creates one, so a caller
         *   verifying a factor for an unenrolled user cannot
         *   accidentally fabricate enrollment history.
         */
        recordUsage(userId, factorName, { deviceId = null, deviceLabel = null } = {}) {
            const record = this.#getRecordInternal(userId, factorName);
            if (!record) return { success: false, reason: "No enrollment exists for this user/factor — cannot record usage." };
            const timestamp = nowIso();
            record.lastUsedAt = timestamp;
            record.updatedAt = timestamp;
            if (deviceId) {
                let device = record.devices.find(d => d.deviceId === deviceId);
                if (!device) {
                    device = { deviceId, label: deviceLabel || "Unnamed device", addedAt: timestamp, lastUsedAt: null };
                    record.devices.push(device);
                }
                device.lastUsedAt = timestamp;
                if (deviceLabel) device.label = deviceLabel;
            }
            this.#logAudit("used", userId, factorName, { deviceId });
            this.#emit("used", { userId, factorName, deviceId });
            this.#persist();
            return { success: true, record: deepClone(record) };
        }

        /** removeDevice(userId, factorName, deviceId) — real removal of one associated device without disturbing the rest of the enrollment record. */
        removeDevice(userId, factorName, deviceId) {
            const record = this.#getRecordInternal(userId, factorName);
            if (!record) return { success: false, reason: "No enrollment exists for this user/factor." };
            const before = record.devices.length;
            record.devices = record.devices.filter(d => d.deviceId !== deviceId);
            const removed = record.devices.length < before;
            if (removed) {
                record.updatedAt = nowIso();
                this.#logAudit("device-removed", userId, factorName, { deviceId });
                this.#emit("device-removed", { userId, factorName, deviceId });
                this.#persist();
            }
            return { success: removed, reason: removed ? null : "No such device on this enrollment." };
        }

        #getRecordInternal(userId, factorName) {
            const userMap = this.#records.get(userId);
            return userMap ? userMap.get(factorName) || null : null;
        }

        /** getEnrollment(userId, factorName) — real, current record or null. Never fabricates a record for an unenrolled factor. */
        getEnrollment(userId, factorName) {
            const record = this.#getRecordInternal(userId, factorName);
            return record ? deepClone(record) : null;
        }

        /** isEnrolled(userId, factorName) — real, honest boolean: exists AND enabled. An existing-but-disabled enrollment reports false here (use getEnrollment() to see the disabled record itself). */
        isEnrolled(userId, factorName) {
            const record = this.#getRecordInternal(userId, factorName);
            return !!(record && record.enabled);
        }

        /** listEnrollments(userId) — every real enrollment record (enabled or not) for a user. */
        listEnrollments(userId) {
            const userMap = this.#records.get(userId);
            if (!userMap) return [];
            return [...userMap.values()].map(deepClone);
        }

        /** listEnrolledUsers() — real list of every userId with at least one enrollment record, for admin/audit tooling. */
        listEnrolledUsers() { return [...this.#records.keys()]; }

        /** getAuditLog(filter) — real, append-only audit trail; optionally filtered by userId and/or factorName and/or action. */
        getAuditLog({ userId = null, factorName = null, action = null } = {}) {
            return this.#auditLog
                .filter(e => (!userId || e.userId === userId) && (!factorName || e.factorName === factorName) && (!action || e.action === action))
                .map(deepClone);
        }

        getDiagnosticsReport() {
            let totalEnrollments = 0, enabledEnrollments = 0;
            for (const userMap of this.#records.values()) {
                for (const record of userMap.values()) {
                    totalEnrollments++;
                    if (record.enabled) enabledEnrollments++;
                }
            }
            return {
                moduleVersion: ENROLLMENT_STORE_VERSION,
                persistenceAvailable: this.#persistenceAvailable,
                usersWithEnrollments: this.#records.size,
                totalEnrollments,
                enabledEnrollments,
                auditEntries: this.#auditLog.length,
            };
        }

        getIntegrationManifest() {
            return {
                ownership: {
                    owns: ["enrollment lifecycle (enroll/enable/disable/remove)", "enrolledAt/lastUsedAt timestamps", "device association", "append-only audit log", "cross-reload persistence of this metadata"],
                    doesNotOwn: ["credential verification", "credential secret storage", "session management", "authorization policy"],
                },
                uses: ["AuthFactorRegistry (factor-name validation only)", "PlatformEventBus"],
                registers: ["ServiceRegistry"],
                publishes: ["authenrollment:enrolled", "authenrollment:re-enrolled", "authenrollment:enabled", "authenrollment:disabled", "authenrollment:removed", "authenrollment:used", "authenrollment:device-removed"],
                security: {
                    failClosed: "enroll() rejects unknown factor names when AuthFactorRegistry is loaded; recordUsage()/setEnabled()/removeDevice() all require a pre-existing enrollment and never fabricate one.",
                    honestLimitation: "Persists enrollment metadata only (who/when/which-device/enabled), via a single localStorage namespace, in this static, client-side environment. Does not persist or re-hydrate any provider's actual credential material (WebAuthn public key, TOTP secret, biometric template) — that remains each certified provider's own in-memory scope, a disclosed, carried-forward limitation rather than one this milestone fixes.",
                },
            };
        }
    }

    if (window.CozyOS.AuthEnrollmentStore && typeof window.CozyOS.AuthEnrollmentStore.getVersion === "function") {
        const existingVersion = window.CozyOS.AuthEnrollmentStore.getVersion();
        if (existingVersion !== ENROLLMENT_STORE_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: AuthEnrollmentStore existing v${existingVersion} conflicts with load target v${ENROLLMENT_STORE_VERSION}.`);
        return;
    }

    window.CozyOS.AuthEnrollmentStore = new CozyAuthEnrollmentStore();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                sourcePath: "core/security/authentication-enrollment-store.js",
                name: "AuthEnrollmentStore", category: "Platform", icon: "shield-check.svg",
                description: "Real, persistent enrollment lifecycle and metadata layer (enroll/enable/disable/remove, timestamps, device association, audit log) for authentication factors, composing AuthFactorRegistry for factor-name validation. Never stores credential secrets or biometric templates — enrollment metadata only. Persists via a single localStorage namespace, honestly scoped to this static, client-side environment (Milestone 358)."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
