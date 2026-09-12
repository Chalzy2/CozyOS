/**
 * ChurchOS — Live Moderation Foundation (RP-035 Phase C, Checkpoint 1)
 * core/modules/ChurchOS/church-live-moderation.js
 *
 * RULE 29 OWNERSHIP AUDIT — PERFORMED BEFORE THIS FILE WAS WRITTEN.
 *
 *   Real, composed, not duplicated:
 *     - core/modules/communication/ldce-session-engine.js — already
 *       owns a real host/moderator/participant role ladder
 *       (ROLE_RANK, #actorRank), real role promotion
 *       (setParticipantRole), real moderator-gated participant removal
 *       (leaveSession with a distinct actorId), and real
 *       moderator-gated force-mute (forceMuteParticipant). This file
 *       reads that same real role information from the outside via
 *       LDCE's own public getSession()/getParticipant() — it does not
 *       reimplement, wrap, or shadow LDCE's private #actorRank logic;
 *       it recomputes the identical real facts (session.hostId,
 *       participant.role) from LDCE's already-public surface.
 *     - core/modules/identity/identity-engine.js — isPlatformAdmin(),
 *       the same real check church-attendance-geography.js (Checkpoint
 *       B2) already established as this repository's one real
 *       platform-admin authorization primitive.
 *     - core/organization/organization-role.js — listRoles(), reading
 *       each real role's `permissions` array and `assignedUserId`,
 *       the identical pattern Checkpoint B2 established. This file
 *       adds one new permission string
 *       (MODERATION_MANAGE_PERMISSION) to that same real, existing
 *       mechanism — it does not create a new permission engine.
 *
 *   Confirmed absent, not fabricated as present:
 *     - No comment/chat capability exists anywhere on LDCE's
 *       multi-participant roster (grepped: LDCE has no addComment,
 *       postComment, or message method of any kind). A real comment
 *       engine does exist, but only on
 *       core/shell/live/cozy-live-session.js (Section 16) — and that
 *       engine is explicitly scoped to Section 16's bounded 1:1 peer
 *       session model (its own getParticipantCount() comment: "Real
 *       bounded-peer participant count only — never a broadcast/
 *       viewer metric"). ChurchOS's live attendance and analytics
 *       (Checkpoints B1/B2) compose LDCE's roster, not Section 16's
 *       session — the two are separate session-id namespaces with
 *       separate participant models (bounded-1:1 vs. real N-member
 *       roster). Reusing Section 16's comment store for ChurchOS live
 *       moderation would misrepresent which session's comments are
 *       actually being moderated. This file therefore adds one
 *       genuinely new, disclosed capability — a comment store scoped
 *       to LDCE sessionIds — rather than either duplicating a second
 *       comment engine's state machine or misapplying the wrong one.
 *     - No real, N-participant broadcast delivery-confirmation
 *       transport exists anywhere in this repository (confirmed by
 *       the same disclosed capability registry Section 16 itself
 *       maintains — broadcastAvailable/sfuAvailable/cdnAvailable are
 *       all permanently CAPABILITY_UNAVAILABLE). This matters
 *       directly for moderation-event honesty — see PROPAGATION
 *       HONESTY below.
 *
 * AUTHORIZATION DESIGN — evidence-based, not `if (role === "admin")`.
 *   A requester is treated as authorized to moderate a given LDCE
 *   session's comments if, and only if, at least one real fact holds:
 *     (a) requesterUserId === the session's real hostId (LDCE
 *         getSession().hostId); or
 *     (b) LDCE's own getParticipant(sessionId, requesterUserId,
 *         requesterUserId) returns a real roster record whose `role`
 *         is "moderator" (i.e. the host already promoted them via
 *         LDCE's own real setParticipantRole()); or
 *     (c) IdentityEngine.isPlatformAdmin(requesterUserId) is real and
 *         true; or
 *     (d) the requester's own IdentityEngine.getUser().orgId matches
 *         the session host's orgId, AND a real, non-archived
 *         OrganizationRole assigned to the requester declares
 *         MODERATION_MANAGE_PERMISSION — identical mechanism to
 *         Checkpoint B2's Pastor/Admin analytics gate, one new
 *         permission string.
 *   Any other requester — including any ordinary "participant"-role
 *   LDCE member — is refused. Missing engines, an unknown session, or
 *   an unrecognized requester all fail closed, never open.
 *
 * COMMENT OWNERSHIP. Every comment's `authorUserId` is the real caller
 * who posted it — never inferred, never reassignable by a moderation
 * action. Hiding or removing a comment changes only its
 * `moderationState`; `authorUserId` is immutable history.
 *
 * PROPAGATION HONESTY — the direct reason "offline moderation must
 * report QUEUED, never SENT" is not merely a policy choice here, it
 * is the only honest option: no real transport in this repository can
 * confirm delivery of a moderation action to an arbitrary N-member
 * LDCE roster (that capability is explicitly CAPABILITY_UNAVAILABLE
 * repository-wide, deferred to Phase F). Every moderation event this
 * file records therefore always carries `propagationState: "QUEUED"`
 * — never fabricated as "SENT" to other participants' clients,
 * regardless of whether the acting moderator is online or offline.
 * The *local* moderation state change (hide/remove) is real and
 * applied immediately to this file's own canonical store — only the
 * claim of confirmed delivery elsewhere is honestly withheld.
 *
 * VIEWER PATH. listComments() is the only viewer-facing read surface.
 * It returns only comments whose moderationState is "VISIBLE" —
 * hidden and removed comments are excluded entirely, not returned
 * with a "hidden" flag (no leakage of moderation activity to ordinary
 * viewers). getModerationView()/getModerationLog() are the
 * moderator-only surfaces that show full state and history, fail-
 * closed to unauthorized callers exactly like getPastorAdminAnalytics().
 *
 * NOT ADDED, on purpose, per the Checkpoint 1 boundary: mute
 * participant, remove participant, slow mode, moderator messages,
 * trusted-member designation, restore/unmute — all explicitly
 * deferred to Checkpoint 2. No new authentication engine. No new
 * session engine. Section 16's cozy-live-session.js and Checkpoint
 * B1/B2's ChurchOS files are not modified by this file.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["church-live-moderation"]) return;

    /** The one new real permission string this file checks for. An
     * organization grants it to a real OrganizationRole (e.g. a
     * "Moderator" or "Pastor" role) through the existing, unmodified
     * Organization Builder — this file never grants it itself. */
    const MODERATION_MANAGE_PERMISSION = "moderation:comment-manage";

    const COMMENT_STATES = Object.freeze(["VISIBLE", "HIDDEN", "REMOVED"]);

    class ChurchLiveModeration {
        #comments = new Map();       // sessionId -> Array<comment>
        #moderationLog = new Map();  // sessionId -> Array<event>
        #nextSeq = 1;

        #requireLdce() {
            const ldce = window.CozyOS.LDCESessionEngine;
            if (!ldce || typeof ldce.getSession !== "function" || typeof ldce.getParticipant !== "function") return null;
            return ldce;
        }
        #requireIdentity() {
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.getUser !== "function") return null;
            return identity;
        }
        #freshId(prefix) { return `${prefix}_${Date.now().toString(36)}_${this.#nextSeq++}`; }

        /**
         * #isAuthorizedModerator() — see AUTHORIZATION DESIGN above.
         * Real, evidence-based, fail-closed. Never grants a permission
         * itself; only reads facts LDCE/IdentityEngine/OrganizationRole
         * already own.
         */
        #isAuthorizedModerator(ldce, identity, requesterUserId, sessionId, hostUserId) {
            if (!requesterUserId) return { authorized: false, reason: "A real requesterUserId is required." };
            if (requesterUserId === hostUserId) return { authorized: true, via: "host" };

            const participant = ldce.getParticipant(sessionId, requesterUserId, requesterUserId);
            if (participant && participant.role === "moderator") {
                return { authorized: true, via: "ldce-moderator" };
            }

            if (typeof identity.isPlatformAdmin === "function" && identity.isPlatformAdmin(requesterUserId)) {
                return { authorized: true, via: "platform-admin" };
            }

            const orgRole = window.CozyOS.OrganizationRole;
            if (!orgRole || typeof orgRole.listRoles !== "function") {
                return { authorized: false, reason: "Not the host, not an LDCE moderator, not a platform-admin, and OrganizationRole is not loaded to evaluate org-level authorization." };
            }
            const hostUser = hostUserId ? identity.getUser(hostUserId) : null;
            const requesterUser = identity.getUser(requesterUserId);
            const orgId = hostUser ? hostUser.orgId : null;
            if (!orgId) return { authorized: false, reason: "The session host has no orgId on file — cannot evaluate org-level authorization for this session." };
            if (!requesterUser || requesterUser.orgId !== orgId) {
                return { authorized: false, reason: "The requester is not the host, not an LDCE moderator, not a platform-admin, and not a member of the session host's organization." };
            }
            const roles = orgRole.listRoles({ orgId });
            const held = roles.some((r) => r.assignedUserId === requesterUserId && Array.isArray(r.permissions) && r.permissions.includes(MODERATION_MANAGE_PERMISSION));
            if (!held) return { authorized: false, reason: `No real, active org role assigned to this requester declares the "${MODERATION_MANAGE_PERMISSION}" permission.` };
            return { authorized: true, via: "org-role", orgId };
        }

        /** Real, fail-closed check that a poster is a genuine session
         * member (the host, or a real "joined" LDCE roster record) —
         * never allows a fabricated authorUserId with no session tie. */
        #isRealSessionMember(ldce, sessionId, hostUserId, userId) {
            if (userId === hostUserId) return true;
            const participant = ldce.getParticipant(sessionId, userId, userId);
            return !!(participant && participant.status === "joined");
        }

        #recordEvent(sessionId, action, { commentId = null, actorId, reason = null }) {
            if (!this.#moderationLog.has(sessionId)) this.#moderationLog.set(sessionId, []);
            const event = {
                eventId: this.#freshId("modev"),
                action,
                commentId,
                actorId,
                reason,
                at: new Date().toISOString(),
                // See PROPAGATION HONESTY above — never anything but
                // QUEUED; no real transport can confirm delivery of a
                // moderation action to an N-member LDCE roster.
                propagationState: "QUEUED"
            };
            this.#moderationLog.get(sessionId).push(event);
            return event;
        }

        /**
         * postComment(sessionId, authorUserId, text)
         *   Fail-closed: unknown session, empty text, or a poster who
         *   is genuinely not a member of this session (not host, not a
         *   real joined LDCE participant) are all rejected — no
         *   fabricated authorship.
         */
        postComment(sessionId, authorUserId, text) {
            const ldce = this.#requireLdce();
            if (!ldce) return { status: "UNAVAILABLE", reason: "LDCESessionEngine is not available." };
            const identity = this.#requireIdentity();
            if (!identity) return { status: "UNAVAILABLE", reason: "IdentityEngine is not available." };

            const session = ldce.getSession(sessionId);
            if (!session) return { status: "NOT_FOUND", reason: "Unknown LDCE session." };
            if (!text || !text.trim()) return { status: "REJECTED", reason: "Empty comment." };
            if (!this.#isRealSessionMember(ldce, sessionId, session.hostId, authorUserId)) {
                return { status: "REJECTED", reason: "authorUserId is not a real member of this session (not host, not a joined LDCE participant)." };
            }

            const user = identity.getUser(authorUserId);
            const comment = {
                commentId: this.#freshId("cmt"),
                authorUserId,
                author: (user && user.username) || authorUserId,
                text: text.trim(),
                timestamp: new Date().toISOString(),
                moderationState: "VISIBLE"
            };
            if (!this.#comments.has(sessionId)) this.#comments.set(sessionId, []);
            this.#comments.get(sessionId).push(comment);
            return { status: "OK", comment: Object.assign({}, comment) };
        }

        /**
         * listComments(sessionId, requesterUserId)
         *   The one viewer-facing read surface. Fail-closed to real
         *   session members only (host or a joined LDCE participant) —
         *   returns only VISIBLE comments, never hidden/removed ones,
         *   and never a moderation-state or moderation-log field.
         */
        listComments(sessionId, requesterUserId) {
            const ldce = this.#requireLdce();
            if (!ldce) return { status: "UNAVAILABLE", comments: [] };
            const session = ldce.getSession(sessionId);
            if (!session) return { status: "NOT_FOUND", comments: [] };
            if (!this.#isRealSessionMember(ldce, sessionId, session.hostId, requesterUserId)) {
                return { status: "NOT_AUTHORIZED", comments: [] };
            }
            const all = this.#comments.get(sessionId) || [];
            const visible = all
                .filter((c) => c.moderationState === "VISIBLE")
                .map((c) => ({ commentId: c.commentId, author: c.author, authorUserId: c.authorUserId, text: c.text, timestamp: c.timestamp }));
            return { status: "OK", comments: visible };
        }

        /** #setCommentState() — shared real implementation for
         * hideComment()/removeComment(); both are authorization-gated
         * identically and differ only in the target moderationState. */
        #setCommentState(sessionId, actorId, commentId, newState, reason) {
            const ldce = this.#requireLdce();
            if (!ldce) return { status: "UNAVAILABLE", reason: "LDCESessionEngine is not available." };
            const identity = this.#requireIdentity();
            if (!identity) return { status: "UNAVAILABLE", reason: "IdentityEngine is not available." };

            const session = ldce.getSession(sessionId);
            if (!session) return { status: "NOT_FOUND", reason: "Unknown LDCE session." };

            const authz = this.#isAuthorizedModerator(ldce, identity, actorId, sessionId, session.hostId);
            if (!authz.authorized) return { status: "NOT_AUTHORIZED", reason: authz.reason };

            const list = this.#comments.get(sessionId) || [];
            const comment = list.find((c) => c.commentId === commentId);
            if (!comment) return { status: "NOT_FOUND", reason: "Unknown commentId." };

            comment.moderationState = newState;
            const event = this.#recordEvent(sessionId, newState === "HIDDEN" ? "HIDE" : "REMOVE", { commentId, actorId, reason });
            return { status: "OK", comment: Object.assign({}, comment), event: Object.assign({}, event) };
        }

        hideComment(sessionId, actorId, commentId, reason = null) {
            return this.#setCommentState(sessionId, actorId, commentId, "HIDDEN", reason);
        }

        removeComment(sessionId, actorId, commentId, reason = null) {
            return this.#setCommentState(sessionId, actorId, commentId, "REMOVED", reason);
        }

        /**
         * getModerationView(sessionId, requesterUserId)
         *   Moderator-only. Every comment regardless of state, with
         *   its real moderationState — fail-closed to the same
         *   authorization gate as hide/remove.
         */
        getModerationView(sessionId, requesterUserId) {
            const ldce = this.#requireLdce();
            if (!ldce) return { available: false, reason: "LDCESessionEngine is not available." };
            const identity = this.#requireIdentity();
            if (!identity) return { available: false, reason: "IdentityEngine is not available." };
            const session = ldce.getSession(sessionId);
            if (!session) return { available: false, reason: "Unknown LDCE session." };
            const authz = this.#isAuthorizedModerator(ldce, identity, requesterUserId, sessionId, session.hostId);
            if (!authz.authorized) return { available: false, reason: authz.reason };
            const all = (this.#comments.get(sessionId) || []).map((c) => Object.assign({}, c));
            return { available: true, comments: all };
        }

        /**
         * getModerationLog(sessionId, requesterUserId)
         *   Moderator-only real moderation event history. Every event
         *   always carries propagationState:"QUEUED" — see PROPAGATION
         *   HONESTY above.
         */
        getModerationLog(sessionId, requesterUserId) {
            const ldce = this.#requireLdce();
            if (!ldce) return { available: false, reason: "LDCESessionEngine is not available." };
            const identity = this.#requireIdentity();
            if (!identity) return { available: false, reason: "IdentityEngine is not available." };
            const session = ldce.getSession(sessionId);
            if (!session) return { available: false, reason: "Unknown LDCE session." };
            const authz = this.#isAuthorizedModerator(ldce, identity, requesterUserId, sessionId, session.hostId);
            if (!authz.authorized) return { available: false, reason: authz.reason };
            const events = (this.#moderationLog.get(sessionId) || []).map((e) => Object.assign({}, e));
            return { available: true, events };
        }

        getVersion() { return MODULE_VERSION; }
    }

    const engineInstance = new ChurchLiveModeration();
    window.CozyOS.ChurchLiveModeration = engineInstance;
    window.CozyOS.ChurchLiveModeration.MODERATION_MANAGE_PERMISSION = MODERATION_MANAGE_PERMISSION;
    window.CozyOS.ChurchLiveModeration.COMMENT_STATES = COMMENT_STATES;
    window.CozyOS.Modules["church-live-moderation"] = Object.freeze({
        version: MODULE_VERSION,
        description: "ChurchOS Live Moderation Foundation (RP-035 Phase C, Checkpoint 1) — composes LDCESessionEngine's real host/moderator role ladder, IdentityEngine's real platform-admin check, and OrganizationRole's real permission declarations (new permission string \"moderation:comment-manage\", same mechanism as Checkpoint B2). Adds one genuinely new, disclosed capability: a comment store scoped to LDCE sessionIds, since no comment engine previously existed on LDCE's multi-participant roster (Section 16's comment engine is a separate, bounded-1:1-only store). Comment ownership (authorUserId) is immutable; hide/remove only change moderationState. Viewer-facing listComments() returns VISIBLE comments only. Every moderation event's propagationState is always \"QUEUED\", never \"SENT\" — no real transport in this repository can confirm delivery to an N-member roster (repository-wide CAPABILITY_UNAVAILABLE, deferred to Phase F)."
    });
})();
