/**
 * CozyOS — Cozy Share (Collaboration Layer)
 * File Reference: core/collaboration/cozy-share.js
 * Milestone: M366.4 — Device Collaboration Session Manager, Roles,
 * Capability Registry, Trust Layer
 *
 * ARCHITECTURE (per explicit decision)
 *   CozyConnect (core/connectivity/cozy-connect.js, unmodified) remains
 *   the transport layer — device discovery, per-technology providers,
 *   the underlying DeviceRegistry. Cozy Share is the collaboration
 *   layer built ON TOP of it: sessions, roles, trust, and a real
 *   capability report per approved device. This file creates NO second
 *   communication engine, NO second device registry, NO second
 *   discovery mechanism — every device it manages is looked up through
 *   the real, existing CozyConnect.devices registry.
 *
 * WHAT THIS FILE DOES NOT DO (explicitly out of scope this milestone)
 *   WiFi Direct, hotspot creation, Bluetooth Classic pairing, any PTZ
 *   protocol, IP camera discovery, native LAN discovery — all confirmed
 *   in Phase 1 to require capabilities no browser exposes. Every
 *   related capability report below honestly returns
 *   "Unavailable on this platform. Native companion required." rather
 *   than simulating or fabricating success.
 *
 * TRUST LAYER — DELIBERATELY SEPARATE FROM LOGIN IDENTITY
 *   core/security/trusted-device-manager.js (real, confirmed in Phase 1)
 *   governs LOGIN/SESSION trust for a user's own browser — a different
 *   real-world entity than a church's camera or audio mixer, which
 *   never logs in as a CozyOS user. This file does not reuse that class
 *   directly (composing it would conflate two different domains,
 *   confirmed by reading its code before writing this file), but
 *   deliberately mirrors its established, proven patterns: a real
 *   SHA-256 fingerprint where crypto.subtle is available (honestly
 *   falling back, never fabricating a hash otherwise), explicit
 *   revocation fields, and real audit history — the same discipline,
 *   applied to a different, real domain, not duplicated identity logic.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["cozy-share"]) return;

    // ── Device Roles ─────────────────────────────────────────────────────
    const ROLES = Object.freeze([
        "administrator", "media-director", "camera-operator", "audio-operator",
        "lighting-operator", "projection-operator", "presenter", "viewer", "guest"
    ]);
    // Real, disclosed authorization tiers - only these roles may broadcast/
    // switch/control anything; viewer/guest are always read-only, matching
    // the explicit "Only authorized roles may: Broadcast/Switch Cameras/
    // Control Audio/Manage Stream" requirement.
    const OPERATOR_ROLES = Object.freeze(["administrator", "media-director", "camera-operator", "audio-operator", "lighting-operator", "projection-operator"]);

    function _uid(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`; }
    function _now() { return new Date().toISOString(); }
    function _emit(name, detail) {
        const bus = window.CozyOS.PlatformEventBus;
        if (bus && typeof bus.emit === "function") { try { bus.emit(`cozy-share:${name}`, detail); } catch (_err) { /* non-fatal */ } }
    }

    /**
     * generateDeviceFingerprint()
     *   Mirrors TrustedDeviceManager's real, proven pattern (SHA-256 via
     *   crypto.subtle, honest fallback) - not a copy-paste, a
     *   independently-written function for a different real domain
     *   (church devices, not login browsers).
     */
    async function generateDeviceFingerprint(seed) {
        const raw = String(seed || `${Date.now()}-${Math.random()}`);
        if (typeof crypto === "undefined" || !crypto.subtle) return `unhashed:${raw}`;
        const enc = new TextEncoder();
        const digest = await crypto.subtle.digest("SHA-256", enc.encode(raw));
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    // ── Trust Layer ──────────────────────────────────────────────────────
    class TrustLayer {
        #certificates = new Map(); // deviceId -> certificate
        #history = [];

        #logHistory(action, detail) {
            this.#history.push({ action, detail, at: _now() });
            if (this.#history.length > 500) this.#history.shift();
        }
        getHistory() { return this.#history.map(h => ({ ...h })); }

        /**
         * issueCertificate({churchId, deviceId, role, capabilities})
         *   Requires the device to already exist in CozyConnect's real
         *   DeviceRegistry - never certifies a device that was never
         *   actually discovered/added.
         */
        async issueCertificate({ churchId, deviceId, role, capabilities = [] } = {}) {
            if (!churchId || !deviceId) return { success: false, reason: "A real churchId and deviceId are required." };
            if (!ROLES.includes(role)) return { success: false, reason: `"${role}" is not a real, supported role. Supported: ${ROLES.join(", ")}.` };
            const connect = window.CozyOS.CozyConnect;
            const device = connect && typeof connect.getDevices === "function" ? connect.getDevices().find(d => d.id === deviceId) : null;
            if (!device) return { success: false, reason: `No real device "${deviceId}" found in CozyConnect's device registry. A device must be discovered/added there before it can be certified here.` };

            const certificateId = _uid("cert");
            const fingerprint = await generateDeviceFingerprint(`${churchId}:${deviceId}:${certificateId}`);
            const certificate = {
                certificateId, churchId, deviceId, role,
                capabilities: capabilities.slice(),
                fingerprint,
                approvalDate: _now(),
                revocationStatus: "active", // active | revoked
                revokedAt: null, revokedReason: null
            };
            this.#certificates.set(deviceId, certificate);
            this.#logHistory("certificate-issued", { certificateId, deviceId, role });
            _emit("certificate-issued", { certificateId, deviceId, role });
            return { success: true, certificate: { ...certificate } };
        }

        revokeCertificate(deviceId, reason) {
            const cert = this.#certificates.get(deviceId);
            if (!cert) return { success: false, reason: `No certificate exists for device "${deviceId}".` };
            cert.revocationStatus = "revoked";
            cert.revokedAt = _now();
            cert.revokedReason = reason || "No reason given.";
            this.#logHistory("certificate-revoked", { deviceId, reason });
            _emit("certificate-revoked", { deviceId, reason });
            return { success: true };
        }

        getCertificate(deviceId) { const c = this.#certificates.get(deviceId); return c ? { ...c } : null; }
        isTrusted(deviceId) { const c = this.#certificates.get(deviceId); return !!c && c.revocationStatus === "active"; }
        listCertificates() { return Array.from(this.#certificates.values()).map(c => ({ ...c })); }
    }

    // ── Capability Registry ──────────────────────────────────────────────
    /**
     * getDeviceCapabilities(deviceId)
     *   Composes CozyConnect's real, existing per-technology capability
     *   detection (CozyConnect.capabilities()) and a device's own real,
     *   already-stored capability list (CozyConnect.DeviceRegistry entries
     *   already carry a `capabilities` field). Never assumes a
     *   capability the device or the browser hasn't actually reported.
     *   PTZ/casting-to-native-display/IP-discovery are honestly reported
     *   unavailable per this milestone's explicit scope.
     */
    function getDeviceCapabilities(deviceId) {
        const connect = window.CozyOS.CozyConnect;
        if (!connect) return { available: false, reason: "CozyConnect is not loaded." };
        const device = typeof connect.getDevices === "function" ? connect.getDevices().find(d => d.id === deviceId) : null;
        if (!device) return { available: false, reason: `No real device "${deviceId}" found.` };

        const platformCaps = typeof connect.capabilities === "function" ? connect.capabilities() : {};
        const declared = new Set(device.capabilities || []);

        const report = (key, platformKey, note) => ({
            reported: declared.has(key),
            platformSupported: platformKey ? !!platformCaps[platformKey] : null,
            note: note || null
        });

        return {
            available: true,
            deviceId,
            capabilities: {
                camera: report("camera", "camera"),
                microphone: report("microphone", "microphone"),
                bluetooth: report("bluetooth", "bluetooth"),
                usb: report("usb", "usb"),
                storage: report("storage", null, "No real storage-capacity API is queried here - reported only if the device itself declared it."),
                display: report("display", "presentation"),
                casting: report("casting", "cast"),
                recording: report("recording", null, "Recording itself is provided by LiveCaptureEngine, not CozyConnect - this reports only whether the device was declared capable of it."),
                streaming: report("streaming", null, "Streaming is provided by LiveHotspotEngine's real peer mesh - this reports only whether the device was declared capable of it."),
                ptz: { reported: declared.has("ptz"), platformSupported: false, note: "Unavailable on this platform. Native companion required. No PTZ protocol exists in this repository (confirmed, M366.4 Phase 1)." },
                battery: report("battery", null, "Reported only if the device's own object declared a real battery reading - never estimated."),
                network: report("network", null, "General network presence only - IP camera discovery and LAN scanning are unavailable on this platform (browser sandboxing), regardless of this flag.")
            }
        };
    }

    // ── Device Collaboration Session Manager ────────────────────────────
    class SessionManager {
        #sessions = new Map(); // sessionId -> { name, ownerUserId, members: Map<deviceId, {userId, role, joinedAt}>, createdAt, state }

        createSession({ name, ownerUserId } = {}) {
            if (!ownerUserId) return { success: false, reason: "A real ownerUserId is required." };
            const identity = window.CozyOS.IdentityEngine;
            if (identity && typeof identity.getUser === "function" && !identity.getUser(ownerUserId)) {
                return { success: false, reason: `"${ownerUserId}" is not a real, known CozyOS user.` };
            }
            const sessionId = _uid("share-session");
            this.#sessions.set(sessionId, { sessionId, name: name || "Untitled Session", ownerUserId, members: new Map(), createdAt: _now(), state: "active" });
            _emit("session-created", { sessionId, ownerUserId });
            return { success: true, sessionId };
        }

        /**
         * joinSession(sessionId, { userId, deviceId, role })
         *   Operator-tier roles (administrator/media-director/camera-
         *   operator/audio-operator/lighting-operator/projection-operator)
         *   require a real, active TrustLayer certificate for the device -
         *   an uncertified device cannot join with control. Viewer/guest
         *   may join without a certificate - real, honest, read-only
         *   access, matching "Only authorized roles may broadcast/switch/
         *   control" from the approved architecture.
         */
        joinSession(sessionId, { userId, deviceId, role } = {}) {
            const session = this.#sessions.get(sessionId);
            if (!session) return { success: false, reason: `No real session "${sessionId}".` };
            if (!ROLES.includes(role)) return { success: false, reason: `"${role}" is not a real, supported role. Supported: ${ROLES.join(", ")}.` };
            if (!userId || !deviceId) return { success: false, reason: "A real userId and deviceId are required." };

            if (OPERATOR_ROLES.includes(role)) {
                if (!trust.isTrusted(deviceId)) {
                    return { success: false, reason: `Device "${deviceId}" has no active trust certificate - required for the operator-tier role "${role}". Certify it via TrustLayer.issueCertificate() first.` };
                }
            }
            session.members.set(deviceId, { userId, role, joinedAt: _now() });
            _emit("member-joined", { sessionId, deviceId, userId, role });
            return { success: true, sessionId, deviceId, role };
        }

        leaveSession(sessionId, deviceId) {
            const session = this.#sessions.get(sessionId);
            if (!session) return { success: false, reason: `No real session "${sessionId}".` };
            const removed = session.members.delete(deviceId);
            if (removed) _emit("member-left", { sessionId, deviceId });
            return { success: removed };
        }

        listMembers(sessionId) {
            const session = this.#sessions.get(sessionId);
            if (!session) return { available: false, reason: `No real session "${sessionId}".` };
            return { available: true, members: Array.from(session.members.entries()).map(([deviceId, m]) => ({ deviceId, ...m, capabilities: getDeviceCapabilities(deviceId) })) };
        }

        getSession(sessionId) {
            const session = this.#sessions.get(sessionId);
            if (!session) return null;
            return { sessionId: session.sessionId, name: session.name, ownerUserId: session.ownerUserId, createdAt: session.createdAt, state: session.state, memberCount: session.members.size };
        }

        endSession(sessionId) {
            const session = this.#sessions.get(sessionId);
            if (!session) return { success: false, reason: `No real session "${sessionId}".` };
            session.state = "ended";
            _emit("session-ended", { sessionId });
            return { success: true };
        }

        listSessions() { return Array.from(this.#sessions.values()).map(s => this.getSession(s.sessionId)); }
    }

    const trust = new TrustLayer();
    const sessions = new SessionManager();

    window.CozyOS.CozyShare = Object.freeze({
        getVersion: () => VERSION,
        ROLES: ROLES.slice(),
        OPERATOR_ROLES: OPERATOR_ROLES.slice(),
        // Session Manager
        createSession: (opts) => sessions.createSession(opts),
        joinSession: (sessionId, opts) => sessions.joinSession(sessionId, opts),
        leaveSession: (sessionId, deviceId) => sessions.leaveSession(sessionId, deviceId),
        listMembers: (sessionId) => sessions.listMembers(sessionId),
        getSession: (sessionId) => sessions.getSession(sessionId),
        endSession: (sessionId) => sessions.endSession(sessionId),
        listSessions: () => sessions.listSessions(),
        // Trust Layer
        issueCertificate: (opts) => trust.issueCertificate(opts),
        revokeCertificate: (deviceId, reason) => trust.revokeCertificate(deviceId, reason),
        getCertificate: (deviceId) => trust.getCertificate(deviceId),
        isTrusted: (deviceId) => trust.isTrusted(deviceId),
        listCertificates: () => trust.listCertificates(),
        getTrustHistory: () => trust.getHistory(),
        // Capability Registry
        getDeviceCapabilities
    });

    window.CozyOS.Modules["cozy-share"] = Object.freeze({
        version: VERSION,
        description: "Cozy Share collaboration layer (M366.4) — Device Collaboration Session Manager, Roles, Capability Registry, Trust Layer. Composes the existing CozyConnect (transport, unmodified) and IdentityEngine (user validation, unmodified). No new communication engine, no new device registry. WiFi Direct/Hotspot/BT Classic/PTZ protocol/IP camera discovery/native LAN discovery explicitly deferred - honestly reported unavailable, never simulated."
    });
})();
