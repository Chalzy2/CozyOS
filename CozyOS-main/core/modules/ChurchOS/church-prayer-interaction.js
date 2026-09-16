/**
 * ChurchOS — Prayer Interaction (RP-035 Phase C, Checkpoint 4)
 * core/modules/ChurchOS/church-prayer-interaction.js
 *
 * RULE 29 OWNERSHIP AUDIT — PERFORMED BEFORE THIS FILE WAS WRITTEN.
 *
 *   Grepped the full repository for: prayer, prayer-request,
 *   prayerRequest, amen, testimony, testimony-request, offering,
 *   altar, prayer-queue, request-prayer, prayer-interaction,
 *   worship-interaction, church-interaction. Also inspected every
 *   ChurchOS module, LDCE, IdentityEngine, OrganizationRole,
 *   ChurchLiveModeration, ChurchLiveModerationControls,
 *   CozyConversation, CozyMemory, ServiceRegistry, and the repository's
 *   offline queue/sync infrastructure.
 *
 *   Confirmed absent, not fabricated as present:
 *     - No prayer-request engine exists anywhere. living-worship-player.js
 *       (C004) explicitly disclosed this already: "no notes engine, no
 *       prayer-request engine, no member-to-member [store]" and lists
 *       "prayer" among DISCLOSED_ABSENT_PANELS. church-worship-session.js
 *       and worship-mode-coordinator.js only use the string "prayer" as
 *       a service-phase label (REAL_SECTION_TYPES / REAL_PHASES) — that
 *       is schedule metadata, not an interaction engine, and is not
 *       touched by this file. PRAYER INTERACTION is therefore genuinely
 *       MISSING / NEW CAPABILITY, not a duplicate.
 *     - No "Amen" or aggregate-reaction concept exists anywhere in the
 *       repository. Genuinely new, disclosed as such.
 *
 *   Real, composed, not duplicated:
 *     - core/modules/communication/ldce-session-engine.js —
 *       getSession(), getParticipant() — the same real roster-membership
 *       facts Checkpoint 1/2 already composed. This file does not
 *       reimplement LDCE's roster or role ladder.
 *     - core/modules/identity/identity-engine.js — getUser(),
 *       isPlatformAdmin() — identical primitives to Checkpoints 1/2/B2.
 *     - core/organization/organization-role.js — listRoles(), reading
 *       each real role's `permissions`/`assignedUserId`, identical
 *       pattern to Checkpoints 1/2/B2.
 *     - core/modules/ChurchOS/church-live-moderation.js (Checkpoint 1)
 *       — its exported MODERATION_MANAGE_PERMISSION constant is reused
 *       as-is for pastor/moderator authorization over prayer requests
 *       (same permission string, same mechanism, not a second
 *       permission engine). church-live-moderation.js itself is not
 *       modified by this file, and its #isAuthorizedModerator/
 *       #isRealSessionMember logic is private to that file — this file
 *       independently recomputes the identical real facts from LDCE/
 *       IdentityEngine/OrganizationRole's own public surfaces, exactly
 *       as Checkpoint 2 already did for its own authorization gate,
 *       rather than reaching into Checkpoint 1's private state.
 *
 *   NOT composed, on purpose: LDCE's forceMuteParticipant()/
 *   leaveSession() (Checkpoint 2's concern, not this file's — a prayer
 *   request is not a participant-control action). CozyMemory is not
 *   loaded anywhere in this repository under that name (grepped) and is
 *   not required for this checkpoint's local-only storage.
 *
 * AUTHORIZATION DESIGN — evidence-based, fail-closed, identical
 * mechanism to Checkpoints 1/2/B2 (never `if (role === "...")`).
 *
 *   SUBMIT / OWN-REQUEST access: a real session member (session host,
 *   or a real "joined" LDCE roster record) — see #isRealSessionMember.
 *
 *   MODERATOR access (pastor/moderator queue, mark-prayed-for, archive,
 *   remove, view requester identity where authorized): at least one of
 *     (a) requesterUserId === session hostId; or
 *     (b) LDCE getParticipant() reports a real "moderator" role; or
 *     (c) IdentityEngine.isPlatformAdmin(requesterUserId) is real and
 *         true; or
 *     (d) requester's real orgId matches the host's real orgId AND a
 *         real, non-archived OrganizationRole assigned to the
 *         requester declares MODERATION_MANAGE_PERMISSION (reused from
 *         Checkpoint 1, not a new permission string).
 *   See #isAuthorizedModerator. Any other requester — including any
 *   ordinary participant, an unknown requester, or a requester from a
 *   different organization — is refused. Missing engines, an unknown
 *   session, or an unrecognized requester all fail closed.
 *
 * PRIVACY. Ordinary participants never receive private analytics.
 * listVisiblePrayerRequests() returns: the caller's own requests at any
 * visibility, plus other participants' SESSION/PUBLIC requests — never
 * another author's PRIVATE or MODERATOR_ONLY requests, never
 * moderationState, never requester identity fields beyond the same
 * `author`/`authorUserId` shape Checkpoint 1's listComments() already
 * exposes for session-visible content. getModerationQueue() is the only
 * surface that returns every request regardless of visibility, and it
 * is authorization-gated identically to church-live-moderation.js's
 * getModerationView().
 *
 * PROPAGATION HONESTY — permanent, matching Checkpoints 1/2. No real
 * transport in this repository can confirm delivery to an arbitrary
 * N-member LDCE roster (BROADCAST_AVAILABLE = CAPABILITY_UNAVAILABLE,
 * repository-wide, deferred to Phase F). Every prayer request and every
 * moderation event this file records therefore always carries
 * `propagationState: "QUEUED"` — never fabricated as "SENT". The local
 * state change (create/transition/Amen) is real and applied immediately
 * to this file's own canonical in-memory store; only the claim of
 * confirmed delivery to other participants is honestly withheld.
 *
 * AMEN — aggregate reaction, honestly local-only. Each Amen press is
 * recorded as `localAmen` against this file's own in-memory store.
 * There is no real cross-client synchronization transport (same
 * CAPABILITY_UNAVAILABLE fact above), so `confirmedAmen` is always 0 —
 * never fabricated as a synchronized global count. Duplicate inflation
 * from the same participant on the same request is prevented via a
 * real per-(requestId, userId) Set — the one place this repository's
 * architecture genuinely supports reliable identity (a real,
 * session-verified userId), so this is enforced, not merely disclosed.
 *
 * OFFLINE-FIRST. submitPrayerRequest() always succeeds locally (subject
 * to real validation/authorization) and always assigns
 * propagationState "QUEUED" — there is no code path that ever writes
 * "SENT", so there is nothing to "go offline" from; the honest state is
 * the only state.
 *
 * NOT ADDED, on purpose, per the PHC4 boundary: offering/giving
 * interaction (explicitly deferred to PHC5, which must perform its own
 * Rule 29 audit first), a second language architecture (this file
 * stores only user-provided `text`/`language` fields — no translation
 * is performed or claimed), a global broadcast of any kind.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["church-prayer-interaction"]) return;

    const REQUEST_STATES = Object.freeze(["QUEUED", "VISIBLE", "IN_REVIEW", "PRAYED_FOR", "ARCHIVED", "REMOVED"]);
    const VISIBILITY_LEVELS = Object.freeze(["PRIVATE", "MODERATOR_ONLY", "SESSION", "PUBLIC"]);
    const DEFAULT_VISIBILITY = "PRIVATE";

    class ChurchPrayerInteraction {
        #requests = new Map();        // sessionId -> Array<request>
        #moderationLog = new Map();   // sessionId -> Array<event>
        #amens = new Map();           // requestId -> Set<userId>  (dedup)
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
        #requireModerationPermission() {
            const mod = window.CozyOS.ChurchLiveModeration;
            return (mod && mod.MODERATION_MANAGE_PERMISSION) || "moderation:comment-manage";
        }
        #freshId(prefix) { return `${prefix}_${Date.now().toString(36)}_${this.#nextSeq++}`; }

        /** Identical real-fact recomputation to Checkpoints 1/2's own
         * private helpers — never reaches into their private state. */
        #isRealSessionMember(ldce, sessionId, hostUserId, userId) {
            if (userId === hostUserId) return true;
            const participant = ldce.getParticipant(sessionId, userId, userId);
            return !!(participant && participant.status === "joined");
        }

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
            const permission = this.#requireModerationPermission();
            const roles = orgRole.listRoles({ orgId });
            const held = roles.some((r) => r.assignedUserId === requesterUserId && Array.isArray(r.permissions) && r.permissions.includes(permission));
            if (!held) return { authorized: false, reason: `No real, active org role assigned to this requester declares the "${permission}" permission.` };
            return { authorized: true, via: "org-role", orgId };
        }

        #recordEvent(sessionId, action, { requestId = null, actorId, reason = null }) {
            if (!this.#moderationLog.has(sessionId)) this.#moderationLog.set(sessionId, []);
            const event = {
                eventId: this.#freshId("prayev"),
                action,
                requestId,
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

        #publicShape(r) {
            return {
                requestId: r.requestId,
                sessionId: r.sessionId,
                authorUserId: r.authorUserId,
                createdAt: r.createdAt,
                status: r.status,
                visibility: r.visibility,
                propagationState: r.propagationState,
                language: r.language,
                category: r.category,
                text: r.text
            };
        }

        /**
         * submitPrayerRequest(sessionId, authorUserId, {text, visibility,
         *   category, language})
         *   Fail-closed: unknown session, or an author who is genuinely
         *   not a real member of this session (not host, not a joined
         *   LDCE participant), are both rejected. visibility defaults to
         *   the privacy-safe "PRIVATE" when not supplied, and must be one
         *   of the four documented VISIBILITY_LEVELS if supplied.
         */
        submitPrayerRequest(sessionId, authorUserId, { text = null, visibility = DEFAULT_VISIBILITY, category = null, language = null } = {}) {
            const ldce = this.#requireLdce();
            if (!ldce) return { status: "UNAVAILABLE", reason: "LDCESessionEngine is not available." };
            const session = ldce.getSession(sessionId);
            if (!session) return { status: "NOT_FOUND", reason: "Unknown LDCE session." };
            if (!authorUserId) return { status: "REJECTED", reason: "A real authorUserId is required." };
            if (!this.#isRealSessionMember(ldce, sessionId, session.hostId, authorUserId)) {
                return { status: "REJECTED", reason: "authorUserId is not a real member of this session (not host, not a joined LDCE participant)." };
            }
            if (!VISIBILITY_LEVELS.includes(visibility)) {
                return { status: "REJECTED", reason: `visibility must be one of ${VISIBILITY_LEVELS.join(", ")}.` };
            }

            const request = {
                requestId: this.#freshId("prayreq"),
                sessionId,
                authorUserId,
                createdAt: new Date().toISOString(),
                status: "QUEUED",
                visibility,
                // See PROPAGATION HONESTY above — a locally stored
                // request is not proof another participant received it.
                propagationState: "QUEUED",
                language,
                category,
                text: (typeof text === "string" && text.trim()) ? text.trim() : null,
                moderationState: "ACTIVE"
            };
            if (!this.#requests.has(sessionId)) this.#requests.set(sessionId, []);
            this.#requests.get(sessionId).push(request);
            return { status: "OK", request: this.#publicShape(request) };
        }

        /**
         * listVisiblePrayerRequests(sessionId, requesterUserId)
         *   The viewer-facing read surface. Fail-closed to real session
         *   members only. Returns the caller's own requests at any
         *   visibility, plus other authors' SESSION/PUBLIC requests —
         *   never another author's PRIVATE/MODERATOR_ONLY requests, and
         *   never REMOVED requests.
         */
        listVisiblePrayerRequests(sessionId, requesterUserId) {
            const ldce = this.#requireLdce();
            if (!ldce) return { status: "UNAVAILABLE", requests: [] };
            const session = ldce.getSession(sessionId);
            if (!session) return { status: "NOT_FOUND", requests: [] };
            if (!this.#isRealSessionMember(ldce, sessionId, session.hostId, requesterUserId)) {
                return { status: "NOT_AUTHORIZED", requests: [] };
            }
            const all = this.#requests.get(sessionId) || [];
            const visible = all.filter((r) => {
                if (r.status === "REMOVED") return false;
                if (r.authorUserId === requesterUserId) return true;
                return r.visibility === "SESSION" || r.visibility === "PUBLIC";
            });
            return { status: "OK", requests: visible.map((r) => this.#publicShape(r)) };
        }

        /**
         * getModerationQueue(sessionId, requesterUserId)
         *   Moderator-only. Every request regardless of visibility or
         *   status, with its real moderationState — fail-closed to the
         *   same authorization gate as the state-transition methods.
         */
        getModerationQueue(sessionId, requesterUserId) {
            const ldce = this.#requireLdce();
            if (!ldce) return { available: false, reason: "LDCESessionEngine is not available." };
            const identity = this.#requireIdentity();
            if (!identity) return { available: false, reason: "IdentityEngine is not available." };
            const session = ldce.getSession(sessionId);
            if (!session) return { available: false, reason: "Unknown LDCE session." };
            const authz = this.#isAuthorizedModerator(ldce, identity, requesterUserId, sessionId, session.hostId);
            if (!authz.authorized) return { available: false, reason: authz.reason };
            const all = (this.#requests.get(sessionId) || []).map((r) => Object.assign({}, r));
            return { available: true, requests: all };
        }

        /** #transition() — shared real implementation for
         * markPrayedFor()/archiveRequest()/removeRequest(); all three
         * are authorization-gated identically and differ only in the
         * target status. */
        #transition(sessionId, actorId, requestId, newStatus, reason) {
            const ldce = this.#requireLdce();
            if (!ldce) return { status: "UNAVAILABLE", reason: "LDCESessionEngine is not available." };
            const identity = this.#requireIdentity();
            if (!identity) return { status: "UNAVAILABLE", reason: "IdentityEngine is not available." };

            const session = ldce.getSession(sessionId);
            if (!session) return { status: "NOT_FOUND", reason: "Unknown LDCE session." };

            const authz = this.#isAuthorizedModerator(ldce, identity, actorId, sessionId, session.hostId);
            if (!authz.authorized) return { status: "NOT_AUTHORIZED", reason: authz.reason };

            const list = this.#requests.get(sessionId) || [];
            const request = list.find((r) => r.requestId === requestId);
            if (!request) return { status: "NOT_FOUND", reason: "Unknown requestId." };

            request.status = newStatus;
            if (newStatus === "REMOVED") request.moderationState = "REMOVED";
            const event = this.#recordEvent(sessionId, newStatus, { requestId, actorId, reason });
            return { status: "OK", request: this.#publicShape(request), event: Object.assign({}, event) };
        }

        markPrayedFor(sessionId, actorId, requestId, reason = null) {
            return this.#transition(sessionId, actorId, requestId, "PRAYED_FOR", reason);
        }
        archiveRequest(sessionId, actorId, requestId, reason = null) {
            return this.#transition(sessionId, actorId, requestId, "ARCHIVED", reason);
        }
        removeRequest(sessionId, actorId, requestId, reason = null) {
            return this.#transition(sessionId, actorId, requestId, "REMOVED", reason);
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

        /**
         * pressAmen(sessionId, userId, requestId)
         *   Real session members only. Records one real, deduplicated
         *   local Amen per (requestId, userId) — see AMEN above.
         *   confirmedAmen is always 0; there is no real cross-client
         *   sync transport to honestly report a confirmed count.
         */
        pressAmen(sessionId, userId, requestId) {
            const ldce = this.#requireLdce();
            if (!ldce) return { status: "UNAVAILABLE", reason: "LDCESessionEngine is not available." };
            const session = ldce.getSession(sessionId);
            if (!session) return { status: "NOT_FOUND", reason: "Unknown LDCE session." };
            if (!this.#isRealSessionMember(ldce, sessionId, session.hostId, userId)) {
                return { status: "NOT_AUTHORIZED", reason: "userId is not a real member of this session." };
            }
            const list = this.#requests.get(sessionId) || [];
            const request = list.find((r) => r.requestId === requestId);
            if (!request) return { status: "NOT_FOUND", reason: "Unknown requestId." };

            if (!this.#amens.has(requestId)) this.#amens.set(requestId, new Set());
            const set = this.#amens.get(requestId);
            if (set.has(userId)) {
                return { status: "DUPLICATE", reason: "This participant has already pressed Amen on this request.", localAmen: set.size, confirmedAmen: 0 };
            }
            set.add(userId);
            return { status: "OK", localAmen: set.size, confirmedAmen: 0 };
        }

        /**
         * getAmenCounts(sessionId, requestId)
         *   Real session members only. Never a fabricated global count
         *   — see AMEN above.
         */
        getAmenCounts(sessionId, requesterUserId, requestId) {
            const ldce = this.#requireLdce();
            if (!ldce) return { available: false, reason: "LDCESessionEngine is not available." };
            const session = ldce.getSession(sessionId);
            if (!session) return { available: false, reason: "Unknown LDCE session." };
            if (!this.#isRealSessionMember(ldce, sessionId, session.hostId, requesterUserId)) {
                return { available: false, reason: "requesterUserId is not a real member of this session." };
            }
            const set = this.#amens.get(requestId);
            return { available: true, localAmen: set ? set.size : 0, confirmedAmen: 0 };
        }

        getVersion() { return MODULE_VERSION; }
    }

    const engineInstance = new ChurchPrayerInteraction();
    window.CozyOS.ChurchPrayerInteraction = engineInstance;
    window.CozyOS.ChurchPrayerInteraction.REQUEST_STATES = REQUEST_STATES;
    window.CozyOS.ChurchPrayerInteraction.VISIBILITY_LEVELS = VISIBILITY_LEVELS;
    window.CozyOS.Modules["church-prayer-interaction"] = Object.freeze({
        version: MODULE_VERSION,
        description: "ChurchOS Prayer Interaction (RP-035 Phase C, Checkpoint 4) — composes LDCESessionEngine's real roster, IdentityEngine's real platform-admin check, OrganizationRole's real permission declarations, and church-live-moderation.js's exported MODERATION_MANAGE_PERMISSION constant (no new permission engine). Adds two genuinely new, disclosed capabilities confirmed absent repository-wide: prayer-request submission/lifecycle (QUEUED/VISIBLE/IN_REVIEW/PRAYED_FOR/ARCHIVED/REMOVED, four-level visibility PRIVATE/MODERATOR_ONLY/SESSION/PUBLIC, privacy-safe default) and an aggregate Amen reaction distinguishing real, deduplicated localAmen from an honestly-always-0 confirmedAmen (no cross-client sync transport exists). Every request and moderation event's propagationState is always \"QUEUED\", never \"SENT\" — no real transport in this repository can confirm delivery to an N-member roster (repository-wide CAPABILITY_UNAVAILABLE, deferred to Phase F)."
    });
})();
