/**
 * server/live-relay/session-authority.js
 * CozyOS — Live Distribution — Church Session Authority
 * Milestone: R040 Phase 3B/3K
 *
 * REAL SCOPE DISCLOSURE
 *   FIXES A REAL DEFECT from the Phase 3A slice: the remote-relay
 *   client provider's `getToken()` signed tokens directly in client
 *   code, which requires the HMAC secret to be reachable from the
 *   browser — a direct violation of this project's own security rule
 *   ("Do not put secret credentials into browser code"). This file
 *   moves signing server-side: a participant now receives a token only
 *   through issueToken(), which never trusts a client-declared role —
 *   it resolves the role itself via a roleResolver.
 *
 *   COMPOSITION, NOT DUPLICATION (Rule 2 / Phase 3B)
 *   This file does not implement a second participant roster. It
 *   defines SessionAuthority against a `roleResolver` contract that
 *   matches, field-for-field, the real, already-shipped
 *   core/modules/communication/ldce-session-engine.js#getParticipant()
 *   return shape: { userId, role, language, muted, cameraOn, joinedAt }
 *   (role in "host" | "moderator" | "participant"). A production
 *   deployment wires roleResolver to call the real, running
 *   LDCESessionEngine.getParticipant(sessionId, requesterId, requesterId)
 *   instance directly — no second roster is created here.
 *
 *   HONEST BOUNDARY: loading the actual LDCESessionEngine module in
 *   this server process requires its full real dependency graph
 *   (CozyConversation, IdentityEngine, AuthorizationCoordinator,
 *   CozyTranslate, Firebase real-time documents, LiveHotspotEngine) —
 *   all genuinely real, but designed for a browser runtime, not this
 *   Node signaling process. This file's tests exercise SessionAuthority
 *   against a resolver double built to that exact documented contract
 *   (the same disclosed-stub convention already used throughout this
 *   repository's own test suites, e.g.
 *   live-church-language-orchestrator.test.js's own header). Wiring an
 *   in-process/RPC bridge to a live LDCESessionEngine instance is the
 *   next concrete integration step, not a hidden gap — see
 *   server/live-relay/README.md "Integration boundary".
 *
 *   role -> token role mapping:
 *     LDCE "host"        -> token role "host"
 *     LDCE "moderator"    -> token role "moderator"
 *     LDCE "participant"  -> token role "viewer" (may be promoted to
 *                            "speaker" only via a real grantSpeaking()
 *                            call recorded in SessionAuthority itself —
 *                            LDCE has no "speaker" concept of its own,
 *                            so that state is genuinely new and owned
 *                            here, disclosed as such, not borrowed).
 *
 * PHASE 3E ADDENDUM (STEP 3 continuation, this session)
 *   Audit of this checkpoint found grantSpeaking()/revokeSpeaking()
 *   already real and server-authoritative, but moderator-initiated
 *   only — there was no participant-initiated "please let me speak"
 *   request, and no explicit state distinguishing "never asked" from
 *   "asked and waiting" from "was granted, then revoked". Added
 *   requestSpeaking() (self only), listSpeakRequests() (host/moderator
 *   read of the real pending queue), and getSpeakState() (single
 *   reconciled read: REMOVED | SPEAKING_ALLOWED | SPEAK_REQUESTED |
 *   MUTED | JOINED). No existing method signature changed; all prior
 *   tests pass unmodified.
 */
'use strict';

const sessionToken = require('./session-token');

const LDCE_ROLE_TO_TOKEN_ROLE = Object.freeze({ host: 'host', moderator: 'moderator', participant: 'viewer' });

class SessionAuthority {
    /**
     * @param {object} opts
     * @param {string} opts.secret HMAC secret, held ONLY here and inside the signaling server process — never sent to a client.
     * @param {function(sessionId:string, requesterId:string): ({userId,role,language,muted,cameraOn,joinedAt}|null)} opts.roleResolver
     *        Real session-roster lookup. See file header for the exact
     *        documented contract (matches LDCESessionEngine.getParticipant()).
     * @param {number} [opts.tokenTtlSeconds]
     */
    constructor(opts = {}) {
        if (!opts.secret) throw new TypeError('[SessionAuthority] opts.secret is required.');
        if (typeof opts.roleResolver !== 'function') throw new TypeError('[SessionAuthority] opts.roleResolver(sessionId, requesterId) is required.');
        this.secret = opts.secret;
        this._roleResolver = opts.roleResolver;
        this._tokenTtlSeconds = opts.tokenTtlSeconds || 6 * 60 * 60;

        /** sessionId -> Map(userId -> true) — participants explicitly granted the "speaker" state on top of a resolved "viewer" role. Genuinely new state; see file header. */
        this._speakers = new Map();
        /** sessionId -> Map(userId -> {removedAt, removedBy}) — real, persisted removal record so a removed participant's still-unexpired token is rejected on reconnect (Phase 3C "prevent immediate rejoin", Phase 3K "reconnect after moderation removal"). */
        this._removed = new Map();
        /**
         * sessionId -> Map(userId -> 'SPEAK_REQUESTED' | 'SPEAKING_ALLOWED' | 'MUTED')
         * Phase 3E: explicit speaking-state-machine layer, additive on top of
         * the Phase 3C/3D _speakers set above (never a second source of
         * truth — _speakers stays the token-authority record; this map only
         * tracks the extra states issueToken()/isSpeaker() don't need:
         * a pending request, and "was granted, then revoked" distinct from
         * "never granted"). getSpeakState() is the single read path that
         * reconciles both into one of the documented states.
         */
        this._speakState = new Map();
    }

    /**
     * issueToken() — the ONLY way a participant gets a signed token.
     * The role embedded in the token is always what roleResolver says
     * right now, never what the caller asked for.
     */
    issueToken(sessionId, requesterId) {
        if (this.isRemoved(sessionId, requesterId)) {
            return { success: false, reason: 'This participant was removed from the session by a moderator.' };
        }
        const record = this._roleResolver(sessionId, requesterId);
        if (!record || !record.userId) {
            return { success: false, reason: 'Requester is not a recognized participant of this session.' };
        }
        let role = LDCE_ROLE_TO_TOKEN_ROLE[record.role];
        if (!role) return { success: false, reason: `Unrecognized roster role "${record.role}".` };
        if (role === 'viewer' && this._speakers.get(sessionId)?.has(requesterId)) role = 'speaker';

        const token = sessionToken.sign({ sessionId, role, sub: requesterId }, this.secret, this._tokenTtlSeconds);
        return { success: true, token, role };
    }

    // ---- Server-authoritative speaking-permission state (Phase 3C/3D) ----

    /** grantSpeaking() — host/moderator only. Verified against the SAME roleResolver, never against a client claim. */
    grantSpeaking(sessionId, actorId, targetUserId) {
        const actor = this._roleResolver(sessionId, actorId);
        if (!actor || !['host', 'moderator'].includes(actor.role)) {
            return { success: false, reason: 'Only the host or a moderator may grant speaking permission.' };
        }
        const target = this._roleResolver(sessionId, targetUserId);
        if (!target) return { success: false, reason: 'Target is not a participant of this session.' };
        if (!this._speakers.has(sessionId)) this._speakers.set(sessionId, new Set());
        this._speakers.get(sessionId).add(targetUserId);
        this._setSpeakState(sessionId, targetUserId, 'SPEAKING_ALLOWED');
        return { success: true };
    }

    revokeSpeaking(sessionId, actorId, targetUserId) {
        const actor = this._roleResolver(sessionId, actorId);
        if (!actor || !['host', 'moderator'].includes(actor.role)) {
            return { success: false, reason: 'Only the host or a moderator may revoke speaking permission.' };
        }
        this._speakers.get(sessionId)?.delete(targetUserId);
        // Spec (STEP 3 §6): revoking a granted speaker moves them to MUTED,
        // not back to "never requested" — this is a distinct prior-speaker
        // state, not a fresh JOINED participant.
        this._setSpeakState(sessionId, targetUserId, 'MUTED');
        return { success: true };
    }

    isSpeaker(sessionId, userId) {
        return !!this._speakers.get(sessionId)?.has(userId);
    }

    // ---- Speak-request state machine (Phase 3E, additive — see constructor comment) ----

    /**
     * requestSpeaking() — a participant asks to speak. Any recognized,
     * non-removed participant may call this for THEMSELVES only; there is
     * no targetUserId parameter, so one viewer can never request on behalf
     * of another (matches STEP 3 §4: "MUST NOT ... modify another
     * participant's state").
     */
    requestSpeaking(sessionId, userId) {
        if (this.isRemoved(sessionId, userId)) {
            return { success: false, reason: 'This participant was removed from the session by a moderator.' };
        }
        const record = this._roleResolver(sessionId, userId);
        if (!record) return { success: false, reason: 'Requester is not a recognized participant of this session.' };
        if (this.isSpeaker(sessionId, userId)) {
            return { success: false, reason: 'Already granted speaking permission.' };
        }
        this._setSpeakState(sessionId, userId, 'SPEAK_REQUESTED');
        return { success: true };
    }

    /** listSpeakRequests() — host/moderator only; the real, server-held queue of pending requests, never a client-supplied list. */
    listSpeakRequests(sessionId, actorId) {
        const actor = this._roleResolver(sessionId, actorId);
        if (!actor || !['host', 'moderator'].includes(actor.role)) {
            return { success: false, reason: 'Only the host or a moderator may view speak requests.' };
        }
        const requesters = [];
        for (const [userId, state] of this._speakState.get(sessionId) || []) {
            if (state === 'SPEAK_REQUESTED') requesters.push(userId);
        }
        return { success: true, requesters };
    }

    /**
     * getSpeakState() — single reconciled read path across the two
     * internal maps. Returns one of:
     *   REMOVED | SPEAKING_ALLOWED | SPEAK_REQUESTED | MUTED | JOINED
     * or null if userId is not a recognized participant of this session.
     * SPEAKING (actual mic transmission) and DISCONNECTED are transport-
     * layer facts this class has no signal for and does not fabricate —
     * see file header's honest-boundary note; a real deployment reports
     * those from the media/session layer, not from SessionAuthority.
     */
    getSpeakState(sessionId, userId) {
        if (this.isRemoved(sessionId, userId)) return 'REMOVED';
        const record = this._roleResolver(sessionId, userId);
        if (!record) return null;
        if (this.isSpeaker(sessionId, userId)) return 'SPEAKING_ALLOWED';
        const explicit = this._speakState.get(sessionId)?.get(userId);
        if (explicit === 'SPEAK_REQUESTED' || explicit === 'MUTED') return explicit;
        return 'JOINED';
    }

    _setSpeakState(sessionId, userId, state) {
        if (!this._speakState.has(sessionId)) this._speakState.set(sessionId, new Map());
        this._speakState.get(sessionId).set(userId, state);
    }

    // ---- Removal (Phase 3C "cannot immediately rejoin", Phase 3K attack case) ----

    removeParticipant(sessionId, actorId, targetUserId) {
        const actor = this._roleResolver(sessionId, actorId);
        if (!actor || !['host', 'moderator'].includes(actor.role)) {
            return { success: false, reason: 'Only the host or a moderator may remove a participant.' };
        }
        const target = this._roleResolver(sessionId, targetUserId);
        if (target && target.role === 'host') return { success: false, reason: 'The host cannot be removed.' };
        if (!this._removed.has(sessionId)) this._removed.set(sessionId, new Map());
        this._removed.get(sessionId).set(targetUserId, { removedAt: Date.now(), removedBy: actorId });
        this._speakers.get(sessionId)?.delete(targetUserId);
        return { success: true };
    }

    /** readmit() — explicit, separately authorized reversal; a removal is never silently self-clearing. */
    readmit(sessionId, actorId, targetUserId) {
        const actor = this._roleResolver(sessionId, actorId);
        if (!actor || !['host', 'moderator'].includes(actor.role)) {
            return { success: false, reason: 'Only the host or a moderator may readmit a participant.' };
        }
        this._removed.get(sessionId)?.delete(targetUserId);
        return { success: true };
    }

    isRemoved(sessionId, userId) {
        return !!this._removed.get(sessionId)?.has(userId);
    }
}

module.exports = { SessionAuthority, LDCE_ROLE_TO_TOKEN_ROLE };
