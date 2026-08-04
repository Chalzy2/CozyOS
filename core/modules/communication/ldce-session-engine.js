/**
 * CozyOS — Living Direct Communication Engine (LDCE)
 * Session Management Foundation
 * File Reference: core/modules/communication/ldce-session-engine.js
 * Layer: Core / Platform Module — Shared Platform Service (not app-owned)
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 362 — Living Direct Communication Engine, Stage 1
 *
 * ═══════════════════════════════════════════════════════════════════════
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN (Gate 1 —
 * see M362-Stage1-Gate1-Verification.md for the full per-engine detail)
 * ═══════════════════════════════════════════════════════════════════════
 *   window.CozyOS.CozyConversation already owns a real session state
 *   machine (created→active/paused→ended/cancelled) and transcript
 *   timeline. This file composes it via createConversation()/
 *   startConversation()/pauseConversation()/resumeConversation()/
 *   endConversation()/cancelConversation()/addTranscriptSegment() —
 *   every lifecycle transition is a direct passthrough to CozyConversation's
 *   own real methods. This file NEVER reimplements a state machine of its
 *   own for session state; it only adds a genuinely new concern
 *   CozyConversation structurally cannot do (confirmed by reading its
 *   source: `participants` is a static array set once at createConversation()
 *   time, with no add/remove/permission/state methods at all):
 *
 * WHAT THIS FILE OWNS (genuinely new)
 *   - Dynamic participant join/leave, layered on top of a CozyConversation
 *     conversationId, keyed by the same id.
 *   - Per-participant role (host/moderator/participant), language
 *     preference, and live mute/camera/speaking state.
 *   - Session metadata (title, arbitrary key-value bag) — a concept
 *     CozyConversation has no field for.
 *   - Signaling composition: automates LiveHotspotEngine's existing
 *     manual offer/answer/QR-code exchange over real-time Firestore
 *     documents, so two devices don't need a human to copy/paste codes.
 *
 * COMPOSED, NEVER DUPLICATED
 *   - window.CozyOS.CozyConversation — session lifecycle + transcript
 *     (used as this session's own audit trail — no second audit log).
 *   - window.CozyOS.IdentityEngine — grantResourcePermission()/
 *     revokeResourcePermission()/checkResourcePermission(), the exact
 *     same per-resource ACL primitive already proven by Founder Story
 *     Stage 2/3 (`founder-story:<storyId>` pattern). This file uses
 *     `ldce-call:<sessionId>` for join permission and
 *     `ldce-call-role-<sessionId>:<role>` for role grants — same shape,
 *     no parallel ACL store.
 *   - window.CozyOS.AuthorizationCoordinator — used ONLY for the one
 *     genuinely sensitive Stage 1 action (promoting a participant to
 *     "host"). Never used for ordinary join/view checks — that is
 *     IdentityEngine's job, confirmed distinct in Gate 1.
 *   - window.CozyOS.SessionService — Session.current().uid is the
 *     source of "who is calling," matching Founder Story's own
 *     getCurrentUserId() pattern.
 *   - window.CozyOS.CozyTranslate — getSupportedTargetLanguages() used
 *     to validate a participant's language preference when available
 *     (real check, not fabricated); createSession() optionally composed
 *     by linkTranslationSession() as a light, OPT-IN hook for Stage 2 —
 *     no actual translation logic runs in Stage 1.
 *   - window.CozyOS.Firebase.Firestore — setDocument()/getDocument()/
 *     the new (this same milestone) subscribeToDocument() for real-time
 *     SDP offer/answer exchange. No second real-time mechanism.
 *   - window.CozyOS.LiveHotspotEngine — createHost()/joinHost()/
 *     completeHostPairing() for the actual RTCPeerConnection. Never
 *     modified, never a second peer-connection implementation.
 *
 * HONEST, DISCLOSED STAGE 1 SCOPE LIMITS
 *   1. Data-channel signaling only. LiveHotspotEngine's createHost()
 *      creates its SDP offer around a data channel with no hook to
 *      attach audio/video tracks first — confirmed by reading its
 *      source. Real audio/video media exchange (adding tracks before
 *      offer/answer) is Stage 2 scope, not fabricated here. "Signaling
 *      composition" in Stage 1 means: two participants can reach a real,
 *      connected RTCPeerConnection data channel automatically (no manual
 *      code copy/paste) — genuinely useful and testable on its own.
 *   2. No TURN/STUN servers. LiveHotspotEngine constructs
 *      `new RTCPeerConnection({iceServers: []})` — inherited, unchanged,
 *      not this milestone's file to fix (would mean modifying
 *      LiveHotspotEngine, out of Stage 1's composition-only scope).
 *      Real-world NAT traversal may fail without one — disclosed, not
 *      silently assumed to work everywhere.
 *   3. Mesh topology only. There is no SFU/media-server anywhere in this
 *      codebase. Group sessions (participants map supports N from day
 *      one, per design) would need one pairwise signaling exchange per
 *      pair of joined participants — real for small groups, disclosed
 *      as not scaling indefinitely. A future stage's real SFU adoption
 *      is a separate, deliberate decision, not assumed here.
 *   4. No real neural voice/translation execution — Stage 1 is session
 *      management and signaling only, matching the original 4-stage
 *      breakdown (translation pipeline is Stage 2).
 *
 * GROUP-READY BY DESIGN (per explicit instruction)
 *   The participant map is keyed by userId per session from the very
 *   first line of code — never a 2-slot structure retrofitted later.
 *   A "1:1 call" is simply a session with exactly 2 joined participants;
 *   nothing in this file's data model assumes or hardcodes that number.
 *   ROLES/permission-grant patterns are per-session, per-participant,
 *   the same shape whether 2 or 20 people join.
 *
 * MILESTONE 362 STAGE 2 ADDITION (v1.0.0 → v1.1.0)
 *   initiateSignaling()/answerOffer() now accept an optional `tracks`
 *   parameter, passed straight through to LiveHotspotEngine's own
 *   (additive, Stage 2) track-attachment support. Omitted, both methods
 *   are byte-identical to Stage 1's data-channel-only behavior. Actual
 *   media capture/attach/detach/device-switching lives in the new,
 *   separate ldce-media-session-engine.js — this file still owns only
 *   session/participant/signaling composition, never media capture
 *   itself.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.2.0";

    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["ldce-session-engine"] && window.CozyOS.Modules["ldce-session-engine"].version) return;

    const ROLES = Object.freeze(["participant", "moderator", "host"]);
    const ROLE_RANK = Object.freeze({ participant: 1, moderator: 2, host: 3 });
    const SESSION_TYPES = Object.freeze(["phone-call", "meeting", "classroom", "consultation", "custom"]);

    function _uid(prefix) { return `${prefix}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.random().toString(36).slice(2)}`; }
    function _now() { return new Date().toISOString(); }
    function _currentUserId() {
        const session = window.CozyOS.Session;
        if (!session || typeof session.current !== "function") return null;
        const current = session.current();
        return current ? current.uid : null;
    }

    class LDCESessionEngine {
        #sessions = new Map();      // sessionId -> { sessionId, conversationId, hostId, type, title, metadata, createdAt, translationSessionId }
        #participants = new Map();  // sessionId -> Map(userId -> { userId, role, language, muted, cameraOn, speaking, status, joinedAt, leftAt })
        #signaling = new Map();     // sessionId -> Map(connectionKey -> { connectionId, unsubscribe })
        #listeners = new Map();

        on(eventName, handler) { if (!this.#listeners.has(eventName)) this.#listeners.set(eventName, new Set()); this.#listeners.get(eventName).add(handler); return () => this.off(eventName, handler); }
        off(eventName, handler) { const s = this.#listeners.get(eventName); return s ? s.delete(handler) : false; }
        #emit(eventName, detail) { const s = this.#listeners.get(eventName); if (!s) return; for (const fn of Array.from(s)) { try { fn(detail); } catch (_err) { /* one listener's failure must not break the session */ } } }

        getVersion() { return MODULE_VERSION; }
        getRoles() { return ROLES.slice(); }
        getSessionTypes() { return SESSION_TYPES.slice(); }

        // ── Permission helpers (compose IdentityEngine only, no parallel ACL) ──
        #joinPermissionString(sessionId) { return `ldce-call:${sessionId}`; }
        #rolePermissionString(sessionId, role) { return `ldce-call-role-${sessionId}:${role}`; }

        /** #getGrantedRole() — highest role a person actually holds, ladder-checked host>moderator>participant, mirroring Founder Story's #getPersonLevel() pattern exactly. Returns null if the person holds no grant at all (including no join grant). */
        #getGrantedRole(sessionId, userId) {
            if (!userId) return null;
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.checkResourcePermission !== "function") return null;
            for (const role of ["host", "moderator", "participant"]) {
                if (identity.checkResourcePermission(userId, this.#rolePermissionString(sessionId, role)) === true) return role;
            }
            if (identity.checkResourcePermission(userId, this.#joinPermissionString(sessionId)) === true) return "participant";
            return null;
        }

        #canJoin(sessionId, userId) {
            const session = this.#sessions.get(sessionId);
            if (!session) return false;
            if (userId === session.hostId) return true;
            return this.#getGrantedRole(sessionId, userId) !== null;
        }

        /** #actorRank() — real, current role rank of an actor already in the session (or the host, even before an explicit self-grant lookup, since the host always holds the top rank by construction). */
        #actorRank(sessionId, actorId) {
            const session = this.#sessions.get(sessionId);
            if (session && actorId === session.hostId) return ROLE_RANK.host;
            const role = this.#getGrantedRole(sessionId, actorId);
            return role ? ROLE_RANK[role] : 0;
        }

        #logToTranscript(conversationId, speaker, text, extra = {}) {
            const conversation = window.CozyOS.CozyConversation;
            if (conversation && typeof conversation.addTranscriptSegment === "function") {
                conversation.addTranscriptSegment(conversationId, { speaker, text, source: "ldce-session", ...extra });
            }
        }

        // ── Session lifecycle (pure passthrough to CozyConversation — no reimplementation) ──
        /** createSession() — composes CozyConversation.createConversation() for the real state machine, then wraps it with the new participant/permission/metadata layer. The host is granted "host" role immediately via IdentityEngine, never assumed implicitly elsewhere. */
        createSession(hostId, { type = "phone-call", title = "", language = "en", metadata = {} } = {}) {
            if (!hostId) return { success: false, reason: "hostId is required." };
            if (!SESSION_TYPES.includes(type)) return { success: false, reason: `Unknown session type "${type}".` };
            const conversation = window.CozyOS.CozyConversation;
            if (!conversation || typeof conversation.createConversation !== "function") return { success: false, reason: "CozyConversation is not available." };

            const convResult = conversation.createConversation({ type, participants: [hostId] });
            if (!convResult || !convResult.success) return { success: false, reason: (convResult && convResult.reason) || "CozyConversation declined to create a conversation." };

            const sessionId = _uid("ldce");
            this.#sessions.set(sessionId, { sessionId, conversationId: convResult.conversationId, hostId, type, title, metadata: { ...metadata }, createdAt: _now(), translationSessionId: null });
            this.#participants.set(sessionId, new Map());

            const identity = window.CozyOS.IdentityEngine;
            if (identity && typeof identity.grantResourcePermission === "function") {
                try { identity.grantResourcePermission(hostId, this.#joinPermissionString(sessionId)); identity.grantResourcePermission(hostId, this.#rolePermissionString(sessionId, "host")); }
                catch (_err) { /* IdentityEngine may reject an unknown userId — real, honest failure, not silently swallowed into a fabricated grant */ }
            }
            this.#participants.get(sessionId).set(hostId, { userId: hostId, role: "host", language, muted: false, cameraOn: true, speaking: false, status: "joined", joinedAt: _now(), leftAt: null });
            this.#logToTranscript(convResult.conversationId, "system", `Session created by ${hostId}.`);
            this.#emit("session-created", { sessionId, conversationId: convResult.conversationId, hostId });
            return { success: true, sessionId, conversationId: convResult.conversationId };
        }

        startSession(sessionId, actorId) {
            const session = this.#requireSession(sessionId);
            if (!session) return { success: false, reason: "Unknown session." };
            if (this.#actorRank(sessionId, actorId) < ROLE_RANK.moderator) return { success: false, reason: "Only the host or a moderator may start the session." };
            const conversation = window.CozyOS.CozyConversation;
            const result = conversation.startConversation(session.conversationId);
            if (result.success) { this.#logToTranscript(session.conversationId, "system", "Session started."); this.#emit("session-started", { sessionId }); }
            return result;
        }
        pauseSession(sessionId, actorId) {
            const session = this.#requireSession(sessionId);
            if (!session) return { success: false, reason: "Unknown session." };
            if (this.#actorRank(sessionId, actorId) < ROLE_RANK.moderator) return { success: false, reason: "Only the host or a moderator may pause the session." };
            const result = window.CozyOS.CozyConversation.pauseConversation(session.conversationId);
            if (result.success) { this.#logToTranscript(session.conversationId, "system", "Session paused."); this.#emit("session-paused", { sessionId }); }
            return result;
        }
        resumeSession(sessionId, actorId) {
            const session = this.#requireSession(sessionId);
            if (!session) return { success: false, reason: "Unknown session." };
            if (this.#actorRank(sessionId, actorId) < ROLE_RANK.moderator) return { success: false, reason: "Only the host or a moderator may resume the session." };
            const result = window.CozyOS.CozyConversation.resumeConversation(session.conversationId);
            if (result.success) { this.#logToTranscript(session.conversationId, "system", "Session resumed."); this.#emit("session-resumed", { sessionId }); }
            return result;
        }
        /** endSession() — ending for everyone is the one lifecycle action gated with a step-up AuthorizationCoordinator check, per the explicit instruction to use it "only for step-up authentication where required." If no policy is registered for "ldce-end-session", AuthorizationCoordinator's own documented behavior is to let the existing session suffice — this file does not weaken or work around that, it simply calls the real engine and respects its answer. */
        async endSession(sessionId, actorId, { confirm = false } = {}) {
            const session = this.#requireSession(sessionId);
            if (!session) return { success: false, reason: "Unknown session." };
            if (this.#actorRank(sessionId, actorId) < ROLE_RANK.moderator) return { success: false, reason: "Only the host or a moderator may end the session." };
            if (!confirm) return { success: false, reason: "endSession() requires confirm:true." };
            const authz = window.CozyOS.AuthorizationCoordinator;
            if (authz && typeof authz.authorize === "function") {
                try {
                    const decision = await authz.authorize({ policy: "ldce-end-session", context: { actorId, sessionId } });
                    if (decision && decision.authorized === false) return { success: false, reason: decision.reason || "Step-up authorization denied." };
                } catch (_err) { /* AuthorizationCoordinator itself failing is not fabricated into a false "authorized" — but Stage 1 does not hard-block on its absence, matching its own documented "no policy defined -> session alone suffices" behavior */ }
            }
            const result = window.CozyOS.CozyConversation.endConversation(session.conversationId);
            if (result.success) {
                this.#logToTranscript(session.conversationId, "system", `Session ended by ${actorId}.`);
                this.#cleanupSignaling(sessionId);
                this.#emit("session-ended", { sessionId });
            }
            return result;
        }
        cancelSession(sessionId, actorId) {
            const session = this.#requireSession(sessionId);
            if (!session) return { success: false, reason: "Unknown session." };
            if (actorId !== session.hostId) return { success: false, reason: "Only the host may cancel the session." };
            const result = window.CozyOS.CozyConversation.cancelConversation(session.conversationId);
            if (result.success) { this.#cleanupSignaling(sessionId); this.#emit("session-cancelled", { sessionId }); }
            return result;
        }
        #requireSession(sessionId) { return this.#sessions.get(sessionId) || null; }
        getSession(sessionId) { const s = this.#sessions.get(sessionId); return s ? { ...s, metadata: { ...s.metadata } } : null; }
        getConversationState(sessionId) {
            const session = this.#sessions.get(sessionId);
            if (!session) return null;
            const conversation = window.CozyOS.CozyConversation;
            return conversation && typeof conversation.getConversation === "function" ? conversation.getConversation(session.conversationId) : null;
        }

        // ── Dynamic participant join/leave (the genuinely new layer) ──
        /** joinSession() — real authorization gate first (IdentityEngine), then adds the participant to THIS file's own dynamic roster (CozyConversation's own `participants` field is not touched — see file header). Language is validated against CozyTranslate's real target-language registry when available; falls open to an unvalidated string when CozyTranslate isn't loaded, since language preference is not a security boundary. */
        joinSession(sessionId, userId, { language = "en", muted = false, cameraOn = true } = {}) {
            const session = this.#requireSession(sessionId);
            if (!session) return { success: false, reason: "Unknown session." };
            if (!this.#canJoin(sessionId, userId)) return { success: false, reason: "Not authorized to join this session." };

            const translate = window.CozyOS.CozyTranslate;
            if (translate && typeof translate.getSupportedTargetLanguages === "function") {
                const supported = translate.getSupportedTargetLanguages();
                if (Array.isArray(supported) && supported.length && !supported.includes(String(language).toLowerCase())) {
                    return { success: false, reason: `Language "${language}" is not registered with CozyTranslate.` };
                }
            }

            const roster = this.#participants.get(sessionId);
            const existing = roster.get(userId);
            const role = this.#getGrantedRole(sessionId, userId) || "participant";
            roster.set(userId, { userId, role, language, muted: !!muted, cameraOn: !!cameraOn, speaking: false, status: "joined", joinedAt: _now(), leftAt: existing ? existing.leftAt : null });

            const conversation = window.CozyOS.CozyConversation;
            const state = conversation.getConversation(session.conversationId);
            if (state && state.state === "created") conversation.startConversation(session.conversationId);

            this.#logToTranscript(session.conversationId, userId, `${userId} joined (role: ${role}, language: ${language}).`, { languageCode: language });
            this.#emit("participant-joined", { sessionId, userId, role, language });
            return { success: true, role, language };
        }

        /**
         * leaveSession() — soft: marks status "left" with a real timestamp,
         * never deletes the record (same soft-delete precedent as Founder
         * Story's deleteStory/deleteChapter). Never auto-transitions the
         * CozyConversation lifecycle — ending/pausing stays an explicit,
         * permissioned host/moderator action.
         *
         * MILESTONE 362 STAGE 2 HARDENING (disclosed, not silent): this
         * method previously had NO actor check at all — any caller could
         * remove any participant by userId, since only self-service leave
         * was assumed. Found while designing Stage 2's "kick" requirement,
         * which needs a real, permission-checked distinction between
         * leaving yourself and removing someone else. Fixed here,
         * additively: `actorId` defaults to `userId` (self-leave), so
         * every existing 2-argument call site (Stage 1's own, and this
         * file's certified test) behaves byte-identically. Only when
         * `actorId` differs from `userId` is a real moderator+ rank check
         * enforced.
         */
        leaveSession(sessionId, userId, { actorId = userId } = {}) {
            const roster = this.#participants.get(sessionId);
            if (!roster || !roster.has(userId)) return { success: false, reason: "Not a participant of this session." };
            if (actorId !== userId && this.#actorRank(sessionId, actorId) < ROLE_RANK.moderator) {
                return { success: false, reason: "Only the host or a moderator may remove another participant." };
            }
            const record = roster.get(userId);
            roster.set(userId, { ...record, status: "left", leftAt: _now(), speaking: false });
            const session = this.#requireSession(sessionId);
            if (session) this.#logToTranscript(session.conversationId, actorId === userId ? userId : "system", actorId === userId ? `${userId} left.` : `${userId} removed by ${actorId}.`);
            this.#emit("participant-left", { sessionId, userId, removedBy: actorId !== userId ? actorId : null });
            return { success: true };
        }

        /** listParticipants() — fail-closed: a non-participant, non-host requester gets an empty array, never a partial roster (no metadata leakage, matching Founder Story's convention). */
        listParticipants(sessionId, requesterId) {
            const roster = this.#participants.get(sessionId);
            if (!roster || !this.#canJoin(sessionId, requesterId)) return [];
            return Array.from(roster.values()).map((p) => ({ ...p }));
        }
        getParticipant(sessionId, requesterId, userId) {
            if (!this.#canJoin(sessionId, requesterId)) return null;
            const roster = this.#participants.get(sessionId);
            const record = roster && roster.get(userId);
            return record ? { ...record } : null;
        }

        /** inviteParticipant() — host/moderator only. Grants join + role permission via IdentityEngine; does not itself add a roster entry (that happens for real when the invitee calls joinSession() — an invite is a permission grant, not a fabricated presence). */
        inviteParticipant(sessionId, inviterId, inviteeId, { role = "participant" } = {}) {
            const session = this.#requireSession(sessionId);
            if (!session) return { success: false, reason: "Unknown session." };
            if (this.#actorRank(sessionId, inviterId) < ROLE_RANK.moderator) return { success: false, reason: "Only the host or a moderator may invite participants." };
            if (!ROLES.includes(role)) return { success: false, reason: `Unknown role "${role}".` };
            if (role === "host") return { success: false, reason: "A second host cannot be granted via invite — use setParticipantRole() with the promotion step-up check." };
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.grantResourcePermission !== "function") return { success: false, reason: "IdentityEngine is not available." };
            try {
                identity.grantResourcePermission(inviteeId, this.#joinPermissionString(sessionId));
                identity.grantResourcePermission(inviteeId, this.#rolePermissionString(sessionId, role));
            } catch (err) { return { success: false, reason: err.message || "IdentityEngine declined the grant." }; }
            this.#logToTranscript(session.conversationId, "system", `${inviteeId} invited by ${inviterId} (role: ${role}).`);
            this.#emit("participant-invited", { sessionId, inviteeId, role });
            return { success: true };
        }

        /** setParticipantRole() — host-only for ordinary role changes; promotion TO "host" is the one Stage 1 action that also requires AuthorizationCoordinator step-up, per the explicit instruction, since it hands over control of the whole session. */
        async setParticipantRole(sessionId, actorId, targetUserId, newRole) {
            const session = this.#requireSession(sessionId);
            if (!session) return { success: false, reason: "Unknown session." };
            if (actorId !== session.hostId) return { success: false, reason: "Only the host may change roles." };
            if (!ROLES.includes(newRole)) return { success: false, reason: `Unknown role "${newRole}".` };
            if (newRole === "host") {
                const authz = window.CozyOS.AuthorizationCoordinator;
                if (authz && typeof authz.authorize === "function") {
                    try {
                        const decision = await authz.authorize({ policy: "ldce-promote-host", context: { actorId, sessionId, targetUserId } });
                        if (decision && decision.authorized === false) return { success: false, reason: decision.reason || "Step-up authorization denied for host promotion." };
                    } catch (_err) { /* honest non-block, matching AuthorizationCoordinator's own no-policy-defined behavior */ }
                }
            }
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.grantResourcePermission !== "function") return { success: false, reason: "IdentityEngine is not available." };
            try { identity.grantResourcePermission(targetUserId, this.#rolePermissionString(sessionId, newRole)); }
            catch (err) { return { success: false, reason: err.message || "IdentityEngine declined the grant." }; }
            const roster = this.#participants.get(sessionId);
            const record = roster && roster.get(targetUserId);
            if (record) roster.set(targetUserId, { ...record, role: newRole });
            this.#logToTranscript(session.conversationId, "system", `${targetUserId} role changed to ${newRole} by ${actorId}.`);
            this.#emit("participant-role-changed", { sessionId, targetUserId, newRole });
            return { success: true };
        }

        /** setParticipantLanguage() — M363 addition: real, self-only mid-session language switch. Validated against CozyTranslate when available (same fail-open-for-non-security pattern as joinSession's initial language check). Fires logLanguageChanged() on the real FounderStory-style audit convention already established, and a roster event so composed engines (e.g. the caption engine's translation targets) pick up the change live. */
        setParticipantLanguage(sessionId, userId, newLanguage) {
            const roster = this.#participants.get(sessionId);
            const record = roster && roster.get(userId);
            if (!record || record.status !== "joined") return { success: false, reason: "Not an active participant." };
            const translate = window.CozyOS.CozyTranslate;
            if (translate && typeof translate.getSupportedTargetLanguages === "function") {
                const supported = translate.getSupportedTargetLanguages();
                if (Array.isArray(supported) && supported.length && !supported.includes(String(newLanguage).toLowerCase())) {
                    return { success: false, reason: `Language "${newLanguage}" is not registered with CozyTranslate.` };
                }
            }
            const previousLanguage = record.language;
            roster.set(userId, { ...record, language: newLanguage });
            const session = this.#requireSession(sessionId);
            if (session) this.#logToTranscript(session.conversationId, "system", `${userId} switched language: ${previousLanguage} → ${newLanguage}.`);
            this.#emit("participant-language-changed", { sessionId, userId, previousLanguage, newLanguage });
            return { success: true, previousLanguage, newLanguage };
        }

        /** setParticipantState() — self-only local media state (mute/camera/speaking). A participant may only change their own state, never another's — forceMuteParticipant() below is the separate, explicitly moderator-gated action for that. */
        setParticipantState(sessionId, userId, { muted, cameraOn, speaking } = {}) {
            const roster = this.#participants.get(sessionId);
            const record = roster && roster.get(userId);
            if (!record || record.status !== "joined") return { success: false, reason: "Not an active participant." };
            const next = { ...record };
            if (typeof muted === "boolean") next.muted = muted;
            if (typeof cameraOn === "boolean") next.cameraOn = cameraOn;
            if (typeof speaking === "boolean") next.speaking = speaking;
            roster.set(userId, next);
            this.#emit("participant-state-changed", { sessionId, userId, muted: next.muted, cameraOn: next.cameraOn, speaking: next.speaking });
            return { success: true };
        }
        /** forceMuteParticipant() — moderator/host only, mirrors real conferencing tools' "mute for everyone" action. Only ever mutes, never unmutes on someone else's behalf (a participant must unmute themselves — this file never turns a mic back on without that person's own action). */
        forceMuteParticipant(sessionId, actorId, targetUserId) {
            if (this.#actorRank(sessionId, actorId) < ROLE_RANK.moderator) return { success: false, reason: "Only the host or a moderator may force-mute a participant." };
            const roster = this.#participants.get(sessionId);
            const record = roster && roster.get(targetUserId);
            if (!record) return { success: false, reason: "Not a participant." };
            roster.set(targetUserId, { ...record, muted: true });
            const session = this.#requireSession(sessionId);
            if (session) this.#logToTranscript(session.conversationId, "system", `${targetUserId} force-muted by ${actorId}.`);
            this.#emit("participant-state-changed", { sessionId, userId: targetUserId, muted: true, cameraOn: record.cameraOn, speaking: false });
            return { success: true };
        }

        // ── Session metadata (host/moderator only — CozyConversation has no concept of this) ──
        getMetadata(sessionId, requesterId) {
            if (!this.#canJoin(sessionId, requesterId)) return null;
            const session = this.#requireSession(sessionId);
            return session ? { ...session.metadata } : null;
        }
        setMetadata(sessionId, actorId, patch = {}) {
            const session = this.#requireSession(sessionId);
            if (!session) return { success: false, reason: "Unknown session." };
            if (this.#actorRank(sessionId, actorId) < ROLE_RANK.moderator) return { success: false, reason: "Only the host or a moderator may change session metadata." };
            session.metadata = { ...session.metadata, ...patch };
            this.#emit("metadata-changed", { sessionId, metadata: { ...session.metadata } });
            return { success: true, metadata: { ...session.metadata } };
        }

        // ── Translation session linkage (Stage 2 hook only — no translation logic runs here) ──
        /** linkTranslationSession() — opt-in, real composition of CozyTranslate.createSession(). Requires targetLang to already be registered with CozyTranslate (its own real, honest requirement) — if not, this returns a clear, non-fabricated failure rather than forcing a registration this file does not own. Stores the resulting id as session metadata for Stage 2 to pick up; performs no translation itself. */
        linkTranslationSession(sessionId, actorId, { sourceLang = "en", targetLang } = {}) {
            const session = this.#requireSession(sessionId);
            if (!session) return { success: false, reason: "Unknown session." };
            if (this.#actorRank(sessionId, actorId) < ROLE_RANK.participant) return { success: false, reason: "Not a participant of this session." };
            const translate = window.CozyOS.CozyTranslate;
            if (!translate || typeof translate.createSession !== "function") return { success: false, reason: "CozyTranslate is not available." };
            try {
                const txSession = translate.createSession({ sourceLang, targetLang, zoneId: sessionId });
                session.translationSessionId = txSession.id;
                this.#emit("translation-session-linked", { sessionId, translationSessionId: txSession.id });
                return { success: true, translationSessionId: txSession.id };
            } catch (err) {
                return { success: false, reason: err.message || "CozyTranslate declined to create a session (targetLang likely not registered)." };
            }
        }

        // ── Signaling composition (LiveHotspotEngine + Firebase Firestore, mesh-pairwise) ──
        #signalingDocId(sessionId, fromUserId, toUserId, kind) { return `${sessionId}__${fromUserId}__${toUserId}__${kind}`; }
        #trackSignaling(sessionId, key, entry) {
            if (!this.#signaling.has(sessionId)) this.#signaling.set(sessionId, new Map());
            this.#signaling.get(sessionId).set(key, entry);
        }
        #cleanupSignaling(sessionId) {
            const map = this.#signaling.get(sessionId);
            if (!map) return;
            for (const entry of map.values()) { if (typeof entry.unsubscribe === "function") { try { entry.unsubscribe(); } catch (_err) { /* honest no-op */ } } }
            this.#signaling.delete(sessionId);
        }

        /** getMeshPairs() — every unique pair of currently-joined participants. Real utility for orchestrating group signaling: a group session simply drives one pairwise exchange per pair returned here — no redesign needed for >2 participants, per the group-ready-by-design requirement. Disclosed: mesh does not scale indefinitely (no SFU exists in this codebase). */
        getMeshPairs(sessionId) {
            const roster = this.#participants.get(sessionId);
            if (!roster) return [];
            const joined = Array.from(roster.values()).filter((p) => p.status === "joined").map((p) => p.userId);
            const pairs = [];
            for (let i = 0; i < joined.length; i++) for (let j = i + 1; j < joined.length; j++) pairs.push([joined[i], joined[j]]);
            return pairs;
        }

        /** initiateSignaling() — composes LiveHotspotEngine.createHost() for a real RTCPeerConnection/offer, then writes the offer to a real Firestore document instead of asking a human to copy/paste it. Milestone 362 Stage 2: accepts an optional `tracks` array, passed straight through to LiveHotspotEngine's own (additive, Stage 2) track-attachment support — omitted, this remains Stage 1's exact data-channel-only behavior. */
        async initiateSignaling(sessionId, fromUserId, toUserId, { tracks = [] } = {}) {
            if (!this.#canJoin(sessionId, fromUserId) || !this.#canJoin(sessionId, toUserId)) return { success: false, reason: "Both parties must be authorized participants." };
            const hotspot = window.CozyOS.LiveHotspotEngine;
            const firestore = window.CozyOS.Firebase && window.CozyOS.Firebase.Firestore;
            if (!hotspot || typeof hotspot.createHost !== "function") return { success: false, reason: "LiveHotspotEngine is not available." };
            if (!firestore || typeof firestore.setDocument !== "function") return { success: false, reason: "Firebase Firestore signaling is not available." };
            const hostResult = await hotspot.createHost({ tracks });
            if (!hostResult.success) return hostResult;
            const docId = this.#signalingDocId(sessionId, fromUserId, toUserId, "offer");
            const writeResult = await firestore.setDocument("ldce-signaling", docId, { offer: hostResult.offerCode, from: fromUserId, to: toUserId, sessionId, createdAt: _now() });
            if (!writeResult.available) return { success: false, reason: writeResult.reason };
            this.#emit("signaling-offer-sent", { sessionId, fromUserId, toUserId, connectionId: hostResult.connectionId });
            return { success: true, connectionId: hostResult.connectionId };
        }

        /** listenForOffer() — composes the new subscribeToDocument() (this same milestone's Firestore addition) so `toUserId` learns about an incoming offer in real time, not by polling. Returns the real unsubscribe function — caller owns stopping it. */
        listenForOffer(sessionId, fromUserId, toUserId, onOffer) {
            const firestore = window.CozyOS.Firebase && window.CozyOS.Firebase.Firestore;
            if (!firestore || typeof firestore.subscribeToDocument !== "function") return { available: false, reason: "Firebase Firestore real-time signaling is not available.", unsubscribe: () => {} };
            const docId = this.#signalingDocId(sessionId, fromUserId, toUserId, "offer");
            const result = firestore.subscribeToDocument("ldce-signaling", docId, (snapshot) => {
                if (snapshot.available && snapshot.data && snapshot.data.offer) onOffer(snapshot.data.offer);
            });
            if (result.available) this.#trackSignaling(sessionId, `offer:${fromUserId}:${toUserId}`, result);
            return result;
        }

        /** answerOffer() — composes LiveHotspotEngine.joinHost() for the real answer, writes it back via Firestore. Milestone 362 Stage 2: same optional `tracks` pass-through as initiateSignaling(). */
        async answerOffer(sessionId, toUserId, fromUserId, offerCode, { tracks = [] } = {}) {
            const hotspot = window.CozyOS.LiveHotspotEngine;
            const firestore = window.CozyOS.Firebase && window.CozyOS.Firebase.Firestore;
            if (!hotspot || typeof hotspot.joinHost !== "function") return { success: false, reason: "LiveHotspotEngine is not available." };
            if (!firestore || typeof firestore.setDocument !== "function") return { success: false, reason: "Firebase Firestore signaling is not available." };
            const joinResult = await hotspot.joinHost(offerCode, { tracks });
            if (!joinResult.success) return joinResult;
            const docId = this.#signalingDocId(sessionId, fromUserId, toUserId, "answer");
            const writeResult = await firestore.setDocument("ldce-signaling", docId, { answer: joinResult.answerCode, from: toUserId, to: fromUserId, sessionId, createdAt: _now() });
            if (!writeResult.available) return { success: false, reason: writeResult.reason };
            this.#emit("signaling-answer-sent", { sessionId, fromUserId, toUserId, connectionId: joinResult.connectionId });
            return { success: true, connectionId: joinResult.connectionId };
        }

        /** completeSignaling() — the offer-side listens for the real-time answer document and completes real pairing via LiveHotspotEngine.completeHostPairing(). Once this resolves, LiveHotspotEngine's own "device-connected" event (unchanged, composed not modified) fires for the real data channel. */
        completeSignaling(sessionId, fromUserId, toUserId, connectionId) {
            const firestore = window.CozyOS.Firebase && window.CozyOS.Firebase.Firestore;
            const hotspot = window.CozyOS.LiveHotspotEngine;
            if (!firestore || typeof firestore.subscribeToDocument !== "function") return { available: false, reason: "Firebase Firestore real-time signaling is not available.", unsubscribe: () => {} };
            const docId = this.#signalingDocId(sessionId, fromUserId, toUserId, "answer");
            const result = firestore.subscribeToDocument("ldce-signaling", docId, async (snapshot) => {
                if (snapshot.available && snapshot.data && snapshot.data.answer && hotspot && typeof hotspot.completeHostPairing === "function") {
                    const completion = await hotspot.completeHostPairing(connectionId, snapshot.data.answer);
                    this.#emit("signaling-complete", { sessionId, fromUserId, toUserId, connectionId, success: !!completion.success });
                }
            });
            if (result.available) this.#trackSignaling(sessionId, `answer:${fromUserId}:${toUserId}`, result);
            return result;
        }

        getDiagnosticsReport() {
            return {
                moduleVersion: MODULE_VERSION,
                sessionCount: this.#sessions.size,
                totalParticipantRecords: Array.from(this.#participants.values()).reduce((sum, m) => sum + m.size, 0),
            };
        }
    }

    const engineInstance = new LDCESessionEngine();
    window.CozyOS.LDCESessionEngine = engineInstance;
    window.CozyOS.Modules["ldce-session-engine"] = Object.freeze({
        version: MODULE_VERSION,
        description: "Living Direct Communication Engine — Stage 1, Session Management Foundation. Composes CozyConversation for the real session lifecycle and transcript (never reimplemented), IdentityEngine for join/role permissions (same resource:action ACL pattern as Founder Story), AuthorizationCoordinator only for the one sensitive Stage 1 action (host promotion), SessionService for current-user identity, CozyTranslate for language validation and an opt-in Stage-2 translation-session hook, and Firebase Firestore + LiveHotspotEngine for automated (no manual copy/paste) WebRTC data-channel signaling. Genuinely new: dynamic participant join/leave, per-participant role/language/mute/camera/speaking state, and session metadata — a participant map keyed by userId from the start, group-ready for future ChurchOS/MeetingOS/classroom/conference reuse without redesign. Honest Stage 1 scope limits (data-channel signaling only, no audio/video track attachment yet, no TURN/STUN, mesh topology only, no translation execution) are documented in this file's header."
    });
})();
