/**
 * ChurchOS — Live Moderation Controls (RP-035 Phase C, Checkpoint 2)
 * core/modules/ChurchOS/church-live-moderation-controls.js
 *
 * RULE 29 OWNERSHIP AUDIT — PERFORMED BEFORE THIS FILE WAS WRITTEN.
 *
 * BUILDER AUDIT CORRECTION (disclosed, not erased): the first pass of
 * this checkpoint's planning searched core/modules/live/cozy-live.js
 * and incorrectly reported that forceMuteParticipant() and an
 * actor-checked leaveSession() did not exist anywhere in the
 * repository. That was wrong — it was the wrong file. The real
 * COS-RP035 lineage is core/modules/ChurchOS/church-live-moderation.js
 * (Checkpoint 1) composing core/modules/communication/
 * ldce-session-engine.js, and both capabilities are real there. This
 * header records that correction rather than quietly rewriting the
 * earlier (wrong) audit out of the project history.
 *
 *   Real, composed, not duplicated:
 *     - core/modules/communication/ldce-session-engine.js —
 *       forceMuteParticipant(sessionId, actorId, targetUserId), real,
 *       moderator/host-rank gated. leaveSession(sessionId, userId,
 *       { actorId }), real, actor-checked (self-leave when
 *       actorId===userId, moderator-rank-checked removal otherwise).
 *       getParticipant(sessionId, requesterId, userId), real roster
 *       read. This file calls these directly; it does not reimplement
 *       LDCE's #actorRank logic.
 *     - core/modules/identity/identity-engine.js — isPlatformAdmin(),
 *       getUser(). Same real primitives Checkpoint 1 already used.
 *     - core/organization/organization-role.js — listRoles(), reading
 *       each real role's `permissions` array and `assignedUserId`.
 *     - core/modules/ChurchOS/church-live-moderation.js (Checkpoint 1)
 *       — its exported MODERATION_MANAGE_PERMISSION constant is reused
 *       as-is (same permission string, same authorization mechanism,
 *       not a second permission engine). Its listComments() is called
 *       directly to build a merged viewer feed rather than this file
 *       re-reading or shadowing Checkpoint 1's private #comments store.
 *       church-live-moderation.js itself is not modified by this file.
 *
 *   Confirmed absent, not fabricated as present:
 *     - No moderator-driven unmute of another participant exists
 *       anywhere in this repository. LDCE's own
 *       setParticipantState(sessionId, userId, { muted }) is explicitly
 *       documented as self-only ("A participant may only change their
 *       own state, never another's — forceMuteParticipant() below is
 *       the separate, explicitly moderator-gated action for that").
 *       forceMuteParticipant() itself is one-way by explicit design
 *       (mutes only; "never unmutes on someone else's behalf"). This
 *       file does not call setParticipantState on a target's behalf
 *       (that would misuse a documented self-only primitive) and does
 *       not modify ldce-session-engine.js. See MODERATOR-UNMUTE DESIGN
 *       below for what it does instead.
 *     - No slow-mode, moderator-message, or trusted-member concept
 *       exists anywhere in LDCE, Checkpoint 1, or elsewhere in this
 *       repository (grepped). All three are genuinely new state,
 *       disclosed as such, added only in this file.
 *     - No real N-participant delivery-confirmation transport exists
 *       anywhere in this repository — the same fact Checkpoint 1
 *       already disclosed (broadcastAvailable/sfuAvailable/cdnAvailable
 *       are permanently CAPABILITY_UNAVAILABLE). Every event this file
 *       records therefore carries propagationState: "QUEUED", exactly
 *       matching Checkpoint 1's own precedent — never "SENT".
 *
 * MODERATOR-UNMUTE DESIGN — a new authorization path, explicitly NOT a
 * change to forceMuteParticipant()'s behavior.
 *   forceMuteParticipant() remains exactly as Checkpoint 1 / LDCE left
 *   it: one-way, moderator-gated, mutes only. This file adds a second,
 *   separately authorized capability — moderatorUnmute() — that records
 *   a real, persisted ChurchOS-level restriction-lift, gated by the
 *   same moderator-authorization check as every other action in this
 *   file. It does not, and architecturally cannot, force LDCE's own
 *   `muted` roster flag back to false on someone else's behalf, because
 *   the only real primitive that flips that specific flag
 *   (setParticipantState) is deliberately self-only. Concretely:
 *     PHC1:  forceMuteParticipant() -> LDCE.muted = true (real)
 *     PHC1:  participant's own setParticipantState() -> LDCE.muted =
 *            false (real, self-only, unchanged, always available)
 *     PHC2:  moderatorUnmute() -> this file's own restriction record
 *            set to ACTIVE (lifted) (real, persisted, newly authorized)
 *   getMuteStatus() reports BOTH facts side by side —
 *   `moderationRestriction` (this file's record of whether a moderator
 *   has muted/lifted the restriction) and `ldceMuted` (LDCE's own real
 *   roster flag) — rather than collapsing them into one value that
 *   would either overstate what moderatorUnmute actually changed, or
 *   hide a live self-service mute/unmute LDCE already tracks correctly
 *   on its own. Nothing here is UI-only: every field returned is a real
 *   stored fact, not a value invented to make a button look like it did
 *   something.
 *
 * AUTHORIZATION — two distinct, disclosed gates, not one uniform check:
 *
 *   1. Actions with a real LDCE-native primitive (mute, kick) are
 *      authorized ENTIRELY by that primitive's own internal rank check
 *      — host, or a participant LDCE itself promoted to "moderator" via
 *      setParticipantRole. This file does not run a broader pre-check
 *      for these two actions and does not claim a second opinion on an
 *      authorization LDCE already owns. Concretely, this means a
 *      platform-admin or an org-role holder who was never made an LDCE
 *      moderator CANNOT mute or kick — verified by test, not assumed.
 *
 *   2. Actions with no LDCE-native equivalent (moderator-unmute, slow
 *      mode, moderator messages, trusted-member, and the moderator-only
 *      read surfaces) reuse Checkpoint 1's own broader, four-path
 *      authorization check (same exported MODERATION_MANAGE_PERMISSION
 *      constant, not a new engine):
 *        (a) requesterUserId === session hostId; or
 *        (b) LDCE getParticipant() reports the requester's role as
 *            "moderator"; or
 *        (c) IdentityEngine.isPlatformAdmin(requesterUserId); or
 *        (d) requester shares the host's orgId AND holds a real, active
 *            OrganizationRole declaring MODERATION_MANAGE_PERMISSION.
 *
 *   This asymmetry is a real, load-bearing fact about the composed
 *   system, not an inconsistency to be smoothed over: it exists because
 *   gate 1 is inherited, unmodified LDCE behavior, while gate 2 governs
 *   capabilities that only ever existed in ChurchOS's own layer.
 *
 * TRUSTED MEMBER != MODERATOR. Trusted status is tracked in its own
 * set, confers no rank in LDCE's #actorRank ladder, and is never
 * consulted by this file's own #isAuthorizedModerator check.
 *
 * PRIVACY. getViewerFeed() is the only ordinary-participant-facing
 * surface: merged ordinary comments (via Checkpoint 1's real
 * listComments()) and official moderator messages, distinguishable by
 * `kind`/`official`, with no restriction data, reasons, or history.
 * getModerationHistory() / getMuteStatus() (moderator branch) are
 * fail-closed to the same authorization gate as every mutating action
 * — moderator-only data never leaks into a viewer's response.
 *
 * NOT MODIFIED by this file: ldce-session-engine.js,
 * church-live-moderation.js, identity-engine.js, organization-role.js,
 * or anything in Section 13-16 / PHB1-3 / CozyAI Knowledge.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["church-live-moderation-controls"]) return;

    const RESTRICTION_STATES = Object.freeze(["ACTIVE", "MUTED"]);

    class ChurchLiveModerationControls {
        #restrictions = new Map();     // sessionId -> Map<userId, {state, mutedAt, mutedBy, mutedReason, unmutedAt, unmutedBy, unmutedReason}>
        #trusted = new Map();          // sessionId -> Set<userId>
        #slowMode = new Map();         // sessionId -> { intervalMs, setBy, setAt }
        #lastCommentAt = new Map();    // sessionId -> Map<userId, timestamp ms>
        #messages = new Map();         // sessionId -> Array<official moderator message>
        #history = new Map();          // sessionId -> Array<event>
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
        #requireChurch1() {
            const c1 = window.CozyOS.ChurchLiveModeration;
            if (!c1 || typeof c1.listComments !== "function") return null;
            return c1;
        }
        #permission() {
            const c1 = window.CozyOS.ChurchLiveModeration;
            return (c1 && c1.MODERATION_MANAGE_PERMISSION) || "moderation:comment-manage";
        }
        #freshId(prefix) { return `${prefix}_${Date.now().toString(36)}_${this.#nextSeq++}`; }

        #ensureSession(sessionId) {
            if (!this.#restrictions.has(sessionId)) this.#restrictions.set(sessionId, new Map());
            if (!this.#trusted.has(sessionId)) this.#trusted.set(sessionId, new Set());
            if (!this.#lastCommentAt.has(sessionId)) this.#lastCommentAt.set(sessionId, new Map());
            if (!this.#messages.has(sessionId)) this.#messages.set(sessionId, []);
            if (!this.#history.has(sessionId)) this.#history.set(sessionId, []);
        }

        /**
         * #isAuthorizedModerator() — recomputes the identical real facts
         * Checkpoint 1 already established (same permission string, same
         * public LDCE/IdentityEngine/OrganizationRole surfaces). Not a
         * second authorization engine; a second read of the same real
         * evidence, same as Checkpoint 1's own precedent for reading
         * LDCE's public role facts from the outside.
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
            const permission = this.#permission();
            const roles = orgRole.listRoles({ orgId });
            const held = roles.some((r) => r.assignedUserId === requesterUserId && Array.isArray(r.permissions) && r.permissions.includes(permission));
            if (!held) return { authorized: false, reason: `No real, active org role assigned to this requester declares the "${permission}" permission.` };
            return { authorized: true, via: "org-role", orgId };
        }

        #recordEvent(sessionId, action, { targetUserId = null, actorId, reason = null, meta = null }) {
            this.#ensureSession(sessionId);
            const event = {
                eventId: this.#freshId("modctl"),
                action,
                targetUserId,
                actorId,
                reason,
                meta,
                at: new Date().toISOString(),
                // Repository-wide fact (see Checkpoint 1's own disclosure):
                // no real transport can confirm delivery to an N-member
                // LDCE roster. Always QUEUED, never fabricated as SENT.
                propagationState: "QUEUED"
            };
            this.#history.get(sessionId).push(event);
            return event;
        }

        /* ============================================================= *
         * MUTE (real, composes forceMuteParticipant) / MODERATOR-UNMUTE (new)
         * ============================================================= */

        /**
         * muteParticipant() — thin, disclosed wrapper. Does NOT run this
         * file's own broader #isAuthorizedModerator check first: LDCE's
         * real forceMuteParticipant() has its own internal rank gate
         * (host, or a participant LDCE itself promoted to "moderator"
         * via setParticipantRole) that is narrower than — and does not
         * recognize — platform-admin or org-role authorization. Running
         * our broader pre-check first would let a platform-admin or
         * org-role holder appear "authorized" only to be rejected one
         * line later by the real primitive for a reason our own check
         * can't see. So this composes the real primitive directly and
         * is honest about its actual, narrower gate. (Contrast with
         * moderatorUnmute/setSlowMode/postModeratorMessage/assignTrusted
         * below, which have no LDCE-native equivalent and so correctly
         * use this file's own broader check, same as Checkpoint 1's own
         * comment moderation does for its own new capabilities.)
         * On success, records the restriction as MUTED in this file's
         * own store (used for history and for the moderationRestriction
         * half of getMuteStatus()).
         */
        muteParticipant(sessionId, actorId, targetUserId, reason = null) {
            const ldce = this.#requireLdce();
            if (!ldce) return { status: "UNAVAILABLE", reason: "LDCESessionEngine is not available." };
            const session = ldce.getSession(sessionId);
            if (!session) return { status: "NOT_FOUND", reason: "Unknown LDCE session." };

            const result = ldce.forceMuteParticipant(sessionId, actorId, targetUserId);
            if (!result || result.success !== true) {
                const reasonText = (result && result.reason) || "forceMuteParticipant declined.";
                const status = reasonText.indexOf("Only the host or a moderator") === 0 ? "NOT_AUTHORIZED" : "REJECTED";
                if (status === "NOT_AUTHORIZED") this.#recordEvent(sessionId, "MUTE_DENIED", { targetUserId, actorId, reason: reasonText });
                return { status, reason: reasonText };
            }
            this.#ensureSession(sessionId);
            this.#restrictions.get(sessionId).set(targetUserId, {
                state: "MUTED", mutedAt: new Date().toISOString(), mutedBy: actorId, mutedReason: reason,
                unmutedAt: null, unmutedBy: null, unmutedReason: null
            });
            const event = this.#recordEvent(sessionId, "MUTE", { targetUserId, actorId, reason });
            return { status: "OK", event: Object.assign({}, event) };
        }

        /**
         * moderatorUnmute() — NEW authorization path (see
         * MODERATOR-UNMUTE DESIGN above). Requires a currently-MUTED
         * restriction on record in THIS file's store — reversing a
         * restriction that was never recorded here is refused with
         * NOT_FOUND rather than silently treated as a no-op success.
         * Does not call setParticipantState or forceMuteParticipant.
         */
        moderatorUnmute(sessionId, actorId, targetUserId, reason = null) {
            const ldce = this.#requireLdce();
            if (!ldce) return { status: "UNAVAILABLE", reason: "LDCESessionEngine is not available." };
            const identity = this.#requireIdentity();
            if (!identity) return { status: "UNAVAILABLE", reason: "IdentityEngine is not available." };
            const session = ldce.getSession(sessionId);
            if (!session) return { status: "NOT_FOUND", reason: "Unknown LDCE session." };

            const authz = this.#isAuthorizedModerator(ldce, identity, actorId, sessionId, session.hostId);
            if (!authz.authorized) return { status: "NOT_AUTHORIZED", reason: authz.reason };

            this.#ensureSession(sessionId);
            const record = this.#restrictions.get(sessionId).get(targetUserId);
            if (!record || record.state !== "MUTED") {
                return { status: "NOT_FOUND", reason: "No active moderator-imposed mute restriction is on record for this participant." };
            }
            record.state = "ACTIVE";
            record.unmutedAt = new Date().toISOString();
            record.unmutedBy = actorId;
            record.unmutedReason = reason;
            const event = this.#recordEvent(sessionId, "MODERATOR_UNMUTE", { targetUserId, actorId, reason });
            return { status: "OK", event: Object.assign({}, event) };
        }

        /**
         * getMuteStatus() — moderator-only. Reports the two real facts
         * side by side rather than merging them into one value:
         *   moderationRestriction: this file's own record ("ACTIVE" =
         *     no moderator restriction on record, or lifted;
         *     "MUTED" = a moderator-imposed restriction is on record)
         *   ldceMuted: LDCE's own real, current roster `muted` flag
         *     (reflects self-service state directly and honestly)
         */
        getMuteStatus(sessionId, requesterUserId, targetUserId) {
            const ldce = this.#requireLdce();
            if (!ldce) return { available: false, reason: "LDCESessionEngine is not available." };
            const identity = this.#requireIdentity();
            if (!identity) return { available: false, reason: "IdentityEngine is not available." };
            const session = ldce.getSession(sessionId);
            if (!session) return { available: false, reason: "Unknown LDCE session." };
            const authz = this.#isAuthorizedModerator(ldce, identity, requesterUserId, sessionId, session.hostId);
            if (!authz.authorized) return { available: false, reason: authz.reason };

            const participant = ldce.getParticipant(sessionId, requesterUserId, targetUserId);
            if (!participant) return { available: false, reason: "Unknown participant." };
            this.#ensureSession(sessionId);
            const record = this.#restrictions.get(sessionId).get(targetUserId) || null;
            return {
                available: true,
                targetUserId,
                moderationRestriction: record ? record.state : "ACTIVE",
                ldceMuted: participant.muted === true,
                record: record ? Object.assign({}, record) : null
            };
        }

        /* ============================================================= *
         * KICK — authorized entirely by LDCE's own real leaveSession()
         * ============================================================= */

        /**
         * kickParticipant() — does not re-check authorization itself;
         * LDCE's leaveSession({ actorId }) already performs the real,
         * moderator-rank check when actorId !== userId. This file only
         * adds a `reason` and a persisted history record — the one
         * thing leaveSession() itself has no concept of.
         */
        kickParticipant(sessionId, actorId, targetUserId, reason = null) {
            const ldce = this.#requireLdce();
            if (!ldce) return { status: "UNAVAILABLE", reason: "LDCESessionEngine is not available." };
            const session = ldce.getSession(sessionId);
            if (!session) return { status: "NOT_FOUND", reason: "Unknown LDCE session." };

            const result = ldce.leaveSession(sessionId, targetUserId, { actorId });
            if (!result || result.success !== true) {
                const reasonText = (result && result.reason) || "leaveSession declined.";
                const status = reasonText.indexOf("Only the host or a moderator") === 0 ? "NOT_AUTHORIZED" : "REJECTED";
                if (status === "NOT_AUTHORIZED") this.#recordEvent(sessionId, "KICK_DENIED", { targetUserId, actorId, reason: reasonText });
                return { status, reason: reasonText };
            }
            this.#ensureSession(sessionId);
            this.#restrictions.get(sessionId).delete(targetUserId);
            this.#trusted.get(sessionId).delete(targetUserId);
            this.#lastCommentAt.get(sessionId).delete(targetUserId);
            const event = this.#recordEvent(sessionId, "KICK", { targetUserId, actorId, reason });
            return { status: "OK", event: Object.assign({}, event) };
        }

        /* ============================================================= *
         * SLOW MODE (new, session-scoped)
         * ============================================================= */

        setSlowMode(sessionId, actorId, intervalMs) {
            const ldce = this.#requireLdce();
            if (!ldce) return { status: "UNAVAILABLE", reason: "LDCESessionEngine is not available." };
            const identity = this.#requireIdentity();
            if (!identity) return { status: "UNAVAILABLE", reason: "IdentityEngine is not available." };
            const session = ldce.getSession(sessionId);
            if (!session) return { status: "NOT_FOUND", reason: "Unknown LDCE session." };
            const authz = this.#isAuthorizedModerator(ldce, identity, actorId, sessionId, session.hostId);
            if (!authz.authorized) return { status: "NOT_AUTHORIZED", reason: authz.reason };
            if (typeof intervalMs !== "number" || !Number.isFinite(intervalMs) || intervalMs < 0) {
                return { status: "REJECTED", reason: "intervalMs must be a non-negative finite number." };
            }
            this.#ensureSession(sessionId);
            const record = { intervalMs, setBy: actorId, setAt: new Date().toISOString() };
            this.#slowMode.set(sessionId, record);
            const event = this.#recordEvent(sessionId, "SLOW_MODE_SET", { actorId, meta: { intervalMs } });
            return { status: "OK", slowMode: Object.assign({}, record), event: Object.assign({}, event) };
        }

        getSlowMode(sessionId) {
            const record = this.#slowMode.get(sessionId);
            return record ? Object.assign({ sessionId }, record) : { sessionId, intervalMs: 0, setBy: null, setAt: null };
        }

        /* ============================================================= *
         * COMMENTS — slow-mode + mute gate, composes Checkpoint 1's
         * real postComment() for the actual authorship/storage.
         * ============================================================= */

        /**
         * submitComment() — checks this file's own restriction record
         * (a moderator-imposed mute blocks new comments even though
         * LDCE's raw flag is not this file's to change) and slow mode,
         * then delegates real posting to Checkpoint 1's postComment()
         * rather than keeping a second comment store.
         */
        submitComment(sessionId, authorUserId, text) {
            const c1 = this.#requireChurch1();
            if (!c1) return { status: "UNAVAILABLE", reason: "church-live-moderation.js (Checkpoint 1) is not available." };
            this.#ensureSession(sessionId);

            const restriction = this.#restrictions.get(sessionId).get(authorUserId);
            if (restriction && restriction.state === "MUTED") {
                return { status: "REJECTED", reason: "Participant is currently muted by a moderator." };
            }
            const policy = this.#slowMode.get(sessionId);
            const interval = policy ? policy.intervalMs : 0;
            const lastMap = this.#lastCommentAt.get(sessionId);
            const last = lastMap.get(authorUserId);
            const now = Date.now();
            if (interval > 0 && typeof last === "number" && now - last < interval) {
                return { status: "RATE_LIMITED", retryAfterMs: interval - (now - last) };
            }
            const result = c1.postComment(sessionId, authorUserId, text);
            if (result.status === "OK") lastMap.set(authorUserId, now);
            return result;
        }

        /* ============================================================= *
         * MODERATOR / OFFICIAL MESSAGES (new)
         * ============================================================= */

        /**
         * postModeratorMessage() — an official message, tracked in this
         * file's own store (kind: "MODERATOR_MESSAGE", official: true),
         * separate from Checkpoint 1's ordinary comment store so an
         * official message can never be silently hidden/removed by
         * Checkpoint 1's comment-moderation surface, and so it is always
         * clearly distinguishable from an ordinary comment in the merged
         * viewer feed below. authorUserId is the real acting moderator —
         * never anonymized, never reassignable.
         */
        postModeratorMessage(sessionId, actorId, text) {
            const ldce = this.#requireLdce();
            if (!ldce) return { status: "UNAVAILABLE", reason: "LDCESessionEngine is not available." };
            const identity = this.#requireIdentity();
            if (!identity) return { status: "UNAVAILABLE", reason: "IdentityEngine is not available." };
            const session = ldce.getSession(sessionId);
            if (!session) return { status: "NOT_FOUND", reason: "Unknown LDCE session." };
            if (!text || !text.trim()) return { status: "REJECTED", reason: "Empty message." };
            const authz = this.#isAuthorizedModerator(ldce, identity, actorId, sessionId, session.hostId);
            if (!authz.authorized) return { status: "NOT_AUTHORIZED", reason: authz.reason };

            const user = identity.getUser(actorId);
            this.#ensureSession(sessionId);
            const message = {
                messageId: this.#freshId("modmsg"),
                authorUserId: actorId,
                author: (user && user.username) || actorId,
                text: text.trim(),
                kind: "MODERATOR_MESSAGE",
                official: true,
                timestamp: new Date().toISOString()
            };
            this.#messages.get(sessionId).push(message);
            const event = this.#recordEvent(sessionId, "MODERATOR_MESSAGE", { actorId, meta: { messageId: message.messageId } });
            return { status: "OK", message: Object.assign({}, message), event: Object.assign({}, event) };
        }

        /* ============================================================= *
         * TRUSTED MEMBERS (new, explicitly not moderator status)
         * ============================================================= */

        assignTrusted(sessionId, actorId, targetUserId, reason = null) {
            const ldce = this.#requireLdce();
            if (!ldce) return { status: "UNAVAILABLE", reason: "LDCESessionEngine is not available." };
            const identity = this.#requireIdentity();
            if (!identity) return { status: "UNAVAILABLE", reason: "IdentityEngine is not available." };
            const session = ldce.getSession(sessionId);
            if (!session) return { status: "NOT_FOUND", reason: "Unknown LDCE session." };
            const authz = this.#isAuthorizedModerator(ldce, identity, actorId, sessionId, session.hostId);
            if (!authz.authorized) return { status: "NOT_AUTHORIZED", reason: authz.reason };
            const participant = ldce.getParticipant(sessionId, actorId, targetUserId);
            if (!participant) return { status: "NOT_FOUND", reason: "Unknown participant." };
            this.#ensureSession(sessionId);
            this.#trusted.get(sessionId).add(targetUserId);
            const event = this.#recordEvent(sessionId, "TRUSTED_ASSIGNED", { targetUserId, actorId, reason });
            return { status: "OK", event: Object.assign({}, event) };
        }

        revokeTrusted(sessionId, actorId, targetUserId, reason = null) {
            const ldce = this.#requireLdce();
            if (!ldce) return { status: "UNAVAILABLE", reason: "LDCESessionEngine is not available." };
            const identity = this.#requireIdentity();
            if (!identity) return { status: "UNAVAILABLE", reason: "IdentityEngine is not available." };
            const session = ldce.getSession(sessionId);
            if (!session) return { status: "NOT_FOUND", reason: "Unknown LDCE session." };
            const authz = this.#isAuthorizedModerator(ldce, identity, actorId, sessionId, session.hostId);
            if (!authz.authorized) return { status: "NOT_AUTHORIZED", reason: authz.reason };
            this.#ensureSession(sessionId);
            this.#trusted.get(sessionId).delete(targetUserId);
            const event = this.#recordEvent(sessionId, "TRUSTED_REVOKED", { targetUserId, actorId, reason });
            return { status: "OK", event: Object.assign({}, event) };
        }

        isTrusted(sessionId, targetUserId) {
            this.#ensureSession(sessionId);
            return this.#trusted.get(sessionId).has(targetUserId);
        }

        /* ============================================================= *
         * VIEWER FEED (privacy-scoped) / MODERATOR HISTORY
         * ============================================================= */

        /**
         * getViewerFeed() — the ordinary-participant-facing surface.
         * Merges Checkpoint 1's real listComments() (already fail-closed
         * to real session members, already VISIBLE-only) with this
         * file's official messages. No restriction data, no reasons, no
         * actorIds for restrictions, no moderation history — only what a
         * viewer is allowed to see.
         */
        getViewerFeed(sessionId, requesterUserId) {
            const c1 = this.#requireChurch1();
            if (!c1) return { status: "UNAVAILABLE", items: [] };
            const commentsResult = c1.listComments(sessionId, requesterUserId);
            if (commentsResult.status !== "OK") return { status: commentsResult.status, items: [] };
            this.#ensureSession(sessionId);
            const comments = commentsResult.comments.map((c) => ({
                id: c.commentId, authorUserId: c.authorUserId, author: c.author, text: c.text,
                kind: "COMMENT", official: false, timestamp: c.timestamp
            }));
            const messages = this.#messages.get(sessionId).map((m) => ({
                id: m.messageId, authorUserId: m.authorUserId, author: m.author, text: m.text,
                kind: m.kind, official: m.official, timestamp: m.timestamp
            }));
            const items = comments.concat(messages).sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
            return { status: "OK", items };
        }

        /**
         * getModerationHistory() — moderator-only. Covers this file's
         * own actions (mute/unmute/kick/slow-mode/messages/trusted).
         * Checkpoint 1's own getModerationLog() remains the separate,
         * unmodified record of comment hide/remove events.
         */
        getModerationHistory(sessionId, requesterUserId) {
            const ldce = this.#requireLdce();
            if (!ldce) return { available: false, reason: "LDCESessionEngine is not available." };
            const identity = this.#requireIdentity();
            if (!identity) return { available: false, reason: "IdentityEngine is not available." };
            const session = ldce.getSession(sessionId);
            if (!session) return { available: false, reason: "Unknown LDCE session." };
            const authz = this.#isAuthorizedModerator(ldce, identity, requesterUserId, sessionId, session.hostId);
            if (!authz.authorized) return { available: false, reason: authz.reason };
            this.#ensureSession(sessionId);
            const events = this.#history.get(sessionId).map((e) => Object.assign({}, e));
            return { available: true, events };
        }

        getVersion() { return MODULE_VERSION; }
    }

    const engineInstance = new ChurchLiveModerationControls();
    window.CozyOS.ChurchLiveModerationControls = engineInstance;
    window.CozyOS.ChurchLiveModerationControls.RESTRICTION_STATES = RESTRICTION_STATES;
    window.CozyOS.Modules["church-live-moderation-controls"] = Object.freeze({
        version: MODULE_VERSION,
        description: "ChurchOS Live Moderation Controls (RP-035 Phase C, Checkpoint 2) — additive to church-live-moderation.js (Checkpoint 1). Composes the real forceMuteParticipant() and actor-checked leaveSession() from ldce-session-engine.js, the real IdentityEngine.isPlatformAdmin(), and the real OrganizationRole permission mechanism (reusing Checkpoint 1's MODERATION_MANAGE_PERMISSION string). Adds five genuinely new, disclosed capabilities: a separately-authorized moderator-unmute path layered on LDCE's intentionally one-way forceMuteParticipant() (original behavior unchanged), session-scoped slow mode, official moderator messages, trusted-member status (explicitly distinct from moderator rank), and a moderation history log. Every event's propagationState is always \"QUEUED\", matching Checkpoint 1's own disclosed repository-wide transport limitation — never fabricated as \"SENT\"."
    });
})();
