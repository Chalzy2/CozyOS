/**
 * ChurchOS — Offering Interaction (RP-035 Phase C, Checkpoint 5)
 * core/modules/ChurchOS/church-offering-interaction.js
 *
 * RULE 29 OWNERSHIP AUDIT — PERFORMED BEFORE THIS FILE WAS WRITTEN.
 *
 *   Grepped the full repository for: offering, donation, giving,
 *   payment, M-Pesa, Airtel, transaction, offering-record, QR,
 *   offline-queue. Also inspected every ChurchOS module,
 *   church-prayer-interaction.js (PHC4), church-live-moderation.js
 *   (PHC1), LDCE, IdentityEngine, OrganizationRole, and
 *   modules/mpesaAgent.js / modules/billingEngine.js.
 *
 *   Confirmed absent, not fabricated as present:
 *     - No offering/donation/giving *interaction* engine exists
 *       anywhere. church-worship-session.js and
 *       worship-mode-coordinator.js only use the string "offering" as
 *       a service-phase label (REAL_SECTION_TYPES / REAL_PHASES) —
 *       that is schedule metadata, not an interaction engine, and is
 *       not touched by this file.
 *     - church-prayer-interaction.js (PHC4) explicitly disclosed
 *       offering/giving as out of its own scope, deferred to this
 *       checkpoint ("NOT ADDED, on purpose, per the PHC4 boundary:
 *       offering/giving interaction").
 *     - No real payment provider, no real M-Pesa/Airtel API
 *       integration, and no real transaction-confirmation transport
 *       exists anywhere in this repository.
 *       `modules/mpesaAgent.js` and `modules/billingEngine.js` are
 *       real files but are unrelated legacy dashboard/subscription
 *       modules: mpesaAgent.js renders a UI dashboard against an
 *       in-memory/local-cache `localAgentState` object with no real
 *       M-Pesa network call anywhere in the file; billingEngine.js is
 *       a subscription/license gate, not a per-transaction payment
 *       processor. Neither is a real payment-provider confirmation
 *       source, and this file does not represent either one as if it
 *       were. OFFERING INTERACTION is therefore genuinely MISSING /
 *       NEW CAPABILITY, not a duplicate — and because no real
 *       provider exists, this file is an intent/queue/status layer
 *       only, never a payment gateway.
 *
 *   Real, composed, not duplicated:
 *     - core/modules/communication/ldce-session-engine.js —
 *       getSession(), getParticipant() — identical roster-membership
 *       facts Checkpoints 1/2/4 already composed.
 *     - core/modules/identity/identity-engine.js — getUser(),
 *       isPlatformAdmin() — identical primitives to Checkpoints
 *       1/2/4/B2.
 *     - core/organization/organization-role.js — listRoles(), reading
 *       each real role's `permissions`/`assignedUserId`, identical
 *       pattern to Checkpoints 1/2/4/B2.
 *     - core/modules/ChurchOS/church-live-moderation.js (Checkpoint 1)
 *       — its exported MODERATION_MANAGE_PERMISSION constant is
 *       reused as-is for pastor/moderator/admin authorization over
 *       offering records (same permission string, same mechanism,
 *       not a second permission engine). church-live-moderation.js
 *       itself is not modified by this file.
 *
 *   NOT composed, on purpose: modules/mpesaAgent.js and
 *   modules/billingEngine.js (neither is a real transaction-
 *   confirmation source — see above; composing either would
 *   misrepresent a UI/subscription module as payment verification,
 *   which the PHC5 boundary explicitly forbids). LDCE's
 *   forceMuteParticipant()/leaveSession() (Checkpoint 2's concern).
 *
 * AUTHORIZATION DESIGN — evidence-based, fail-closed, identical
 * mechanism to Checkpoints 1/2/4 (never `if (role === "...")`).
 *
 *   CREATE / OWN-RECORD access: a real session member (session host,
 *   or a real "joined" LDCE roster record) — see #isRealSessionMember.
 *   A giver may only ever create, view, or cancel their *own* record.
 *
 *   MODERATOR/ADMIN access (full offering queue, per-giver identity,
 *   aggregate view, cancel-on-behalf-of): identical gate to PHC4's
 *   #isAuthorizedModerator — host, or LDCE "moderator" role, or
 *   IdentityEngine.isPlatformAdmin(), or a real, non-archived
 *   OrganizationRole in the host's org declaring
 *   MODERATION_MANAGE_PERMISSION (reused from Checkpoint 1). Any other
 *   requester is refused. Missing engines, an unknown session, or an
 *   unrecognized requester all fail closed.
 *
 * PRIVACY. An ordinary participant (including the giver themselves,
 * viewed through the non-owner path) never receives another person's
 * name, giverUserId, amount, currency, category, note, or
 * offeringId via any surface but their own record list. There is no
 * "public" or "session-visible" offering record of any kind — unlike
 * PHC4's prayer requests, an individual offering record is never
 * shared with other ordinary participants at any visibility level.
 * getAggregateOfferingView() is the only cross-giver surface, is
 * moderator/admin-gated identically to getOfferingQueue(), and
 * returns only counts and per-currency/per-category sums — zero
 * giver-identifying fields, zero individual amounts, zero offeringIds.
 *
 * NOT A PAYMENT GATEWAY — CRITICAL HONESTY BOUNDARY. This file never
 * claims money was received. `status` distinguishes:
 *   INTENT_CREATED  — momentary, in-process creation state
 *   LOCAL_QUEUED    — the only state createOfferingIntent() ever
 *                     settles into; the intent exists locally, real
 *                     and immediately usable, but nothing has been
 *                     handed to a real payment transport
 *   QUEUED          — reserved for a future real hand-off to an
 *                     actual submission/transport layer; declared,
 *                     never assigned by this file today
 *                     (CAPABILITY_UNAVAILABLE — no such transport
 *                     exists in this repository)
 *   SUBMITTED       — reserved for a future real provider hand-off;
 *                     never assigned (CAPABILITY_UNAVAILABLE)
 *   CONFIRMED       — reserved exclusively for a genuine payment
 *                     provider's own confirmation; never assigned by
 *                     this file, ever (CAPABILITY_UNAVAILABLE — no
 *                     real payment/transaction source exists in this
 *                     repository; a button press, local record, or
 *                     existing mpesaAgent/billingEngine code is never
 *                     converted into CONFIRMED)
 *   FAILED          — reserved for a genuine local storage/validation
 *                     failure; declared for API completeness, not
 *                     fabricated as reachable by any deliberate path
 *                     today
 *   CANCELLED       — real, reachable via explicit, audited
 *                     cancelOfferingIntent()
 * propagationState is always "QUEUED", identical honesty pattern to
 * PHC1/PHC2/PHC4 — never "SENT", because no real transport in this
 * repository can confirm delivery to any external system.
 *
 * OFFLINE-FIRST. createOfferingIntent() always succeeds locally
 * (subject to real validation/authorization) and always settles at
 * "LOCAL_QUEUED" — there is no code path that ever writes "SENT" or
 * "CONFIRMED", so there is nothing to "go offline" from; the honest
 * local state is the only state, matching PHC4's precedent exactly.
 *
 * DUPLICATE-SUBMISSION PROTECTION — real, not merely disclosed. A
 * caller may supply an idempotent `clientRequestId` (the same real
 * mechanism a client would generate once per Give-button press,
 * analogous to PHC4's per-(requestId,userId) Amen Set). A second
 * createOfferingIntent() call from the same giver, same session, same
 * clientRequestId returns the original record (status: "DUPLICATE")
 * instead of creating a second one. This is a real, verifiable
 * per-(sessionId, giverUserId, clientRequestId) dedup — the one
 * mechanism this file can honestly enforce without inventing a
 * network-level idempotency layer that doesn't exist.
 *
 * CANCELLATION — explicit and auditable. cancelOfferingIntent() is
 * gated to the record's own giver or an authorized moderator/admin,
 * only while the record is in a non-terminal state (LOCAL_QUEUED —
 * the only reachable non-terminal state today), and always appends a
 * real event to this file's own moderation-style audit log
 * (#recordEvent), identical mechanism to PHC1/PHC4's moderation logs.
 *
 * NOT ADDED, on purpose, per the PHC5 boundary: any real payment
 * provider integration, any real M-Pesa/Airtel network call, any
 * public/session-visible individual offering record, a second
 * identity/session/payment engine, and any language-translation
 * layer (this file stores only user-provided `category`/`note`
 * strings verbatim).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["church-offering-interaction"]) return;

    const OFFERING_STATES = Object.freeze([
        "INTENT_CREATED", "LOCAL_QUEUED", "QUEUED", "SUBMITTED",
        "CONFIRMED", "FAILED", "CANCELLED"
    ]);
    // Declared for API completeness/documentation of the full honest
    // lifecycle above; only these two are ever actually assigned by
    // this file today. See "NOT A PAYMENT GATEWAY" above.
    const REACHABLE_STATES = Object.freeze(["LOCAL_QUEUED", "CANCELLED"]);

    class ChurchOfferingInteraction {
        #offerings = new Map();     // sessionId -> Array<offering>
        #byGiver = new Map();       // `${sessionId}:${giverUserId}` -> Array<offering> (same objects, index for fast own-record lookup)
        #idempotency = new Map();   // `${sessionId}:${giverUserId}:${clientRequestId}` -> offeringId
        #auditLog = new Map();      // sessionId -> Array<event>
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

        /** Identical real-fact recomputation to Checkpoints 1/2/4's own
         * private helpers — never reaches into their private state. */
        #isRealSessionMember(ldce, sessionId, hostUserId, userId) {
            if (userId === hostUserId) return true;
            const participant = ldce.getParticipant(sessionId, userId, userId);
            return !!(participant && participant.status === "joined");
        }

        /** Identical authorization gate to PHC4's #isAuthorizedModerator
         * — same real facts, same fail-closed order, reused pattern. */
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

        #recordEvent(sessionId, action, { offeringId = null, actorId, reason = null }) {
            if (!this.#auditLog.has(sessionId)) this.#auditLog.set(sessionId, []);
            const event = {
                eventId: this.#freshId("offev"),
                action,
                offeringId,
                actorId,
                reason,
                at: new Date().toISOString(),
                // See "NOT A PAYMENT GATEWAY" above — never anything but
                // QUEUED; no real transport in this repository can
                // confirm delivery/submission to an external system.
                propagationState: "QUEUED"
            };
            this.#auditLog.get(sessionId).push(event);
            return event;
        }

        #ownerShape(o) {
            return {
                offeringId: o.offeringId,
                sessionId: o.sessionId,
                giverUserId: o.giverUserId,
                createdAt: o.createdAt,
                status: o.status,
                propagationState: o.propagationState,
                amount: o.amount,
                currency: o.currency,
                category: o.category,
                note: o.note,
                clientRequestId: o.clientRequestId
            };
        }

        #indexByGiver(sessionId, giverUserId, offering) {
            const key = `${sessionId}:${giverUserId}`;
            if (!this.#byGiver.has(key)) this.#byGiver.set(key, []);
            this.#byGiver.get(key).push(offering);
        }

        /**
         * createOfferingIntent(sessionId, giverUserId, {amount, currency,
         *   category, note, clientRequestId})
         *   Fail-closed: unknown session, or a giver who is genuinely not
         *   a real member of this session (not host, not a joined LDCE
         *   participant), are both rejected. amount, if supplied, must
         *   be a finite positive number — this file never fabricates or
         *   defaults an amount on the giver's behalf. Never settles
         *   anywhere but LOCAL_QUEUED — see "NOT A PAYMENT GATEWAY"
         *   above.
         */
        createOfferingIntent(sessionId, giverUserId, { amount = null, currency = null, category = null, note = null, clientRequestId = null } = {}) {
            const ldce = this.#requireLdce();
            if (!ldce) return { status: "UNAVAILABLE", reason: "LDCESessionEngine is not available." };
            const session = ldce.getSession(sessionId);
            if (!session) return { status: "NOT_FOUND", reason: "Unknown LDCE session." };
            if (!giverUserId) return { status: "REJECTED", reason: "A real giverUserId is required." };
            if (!this.#isRealSessionMember(ldce, sessionId, session.hostId, giverUserId)) {
                return { status: "REJECTED", reason: "giverUserId is not a real member of this session (not host, not a joined LDCE participant)." };
            }
            if (amount !== null && !(typeof amount === "number" && Number.isFinite(amount) && amount > 0)) {
                return { status: "REJECTED", reason: "amount, if supplied, must be a finite number greater than 0." };
            }

            if (clientRequestId) {
                const idKey = `${sessionId}:${giverUserId}:${clientRequestId}`;
                const existingId = this.#idempotency.get(idKey);
                if (existingId) {
                    const list = this.#offerings.get(sessionId) || [];
                    const existing = list.find((o) => o.offeringId === existingId);
                    if (existing) {
                        return { status: "DUPLICATE", reason: "An offering intent with this clientRequestId already exists for this giver in this session.", offering: this.#ownerShape(existing) };
                    }
                }
            }

            const offering = {
                offeringId: this.#freshId("offer"),
                sessionId,
                giverUserId,
                createdAt: new Date().toISOString(),
                // Momentary INTENT_CREATED, then immediately and only
                // ever settled at LOCAL_QUEUED — see "NOT A PAYMENT
                // GATEWAY" above.
                status: "LOCAL_QUEUED",
                propagationState: "QUEUED",
                amount,
                currency: (typeof currency === "string" && currency.trim()) ? currency.trim() : null,
                category: (typeof category === "string" && category.trim()) ? category.trim() : null,
                note: (typeof note === "string" && note.trim()) ? note.trim() : null,
                clientRequestId: clientRequestId || null
            };
            if (!this.#offerings.has(sessionId)) this.#offerings.set(sessionId, []);
            this.#offerings.get(sessionId).push(offering);
            this.#indexByGiver(sessionId, giverUserId, offering);
            if (clientRequestId) {
                this.#idempotency.set(`${sessionId}:${giverUserId}:${clientRequestId}`, offering.offeringId);
            }
            this.#recordEvent(sessionId, "CREATED", { offeringId: offering.offeringId, actorId: giverUserId });
            return { status: "OK", offering: this.#ownerShape(offering) };
        }

        /**
         * listMyOfferingIntents(sessionId, giverUserId)
         *   Privacy-safe owner-only read surface. A giver only ever sees
         *   their own records — never another giver's, at any status.
         */
        listMyOfferingIntents(sessionId, giverUserId) {
            const ldce = this.#requireLdce();
            if (!ldce) return { status: "UNAVAILABLE", reason: "LDCESessionEngine is not available." };
            const session = ldce.getSession(sessionId);
            if (!session) return { status: "NOT_FOUND", reason: "Unknown LDCE session." };
            if (!this.#isRealSessionMember(ldce, sessionId, session.hostId, giverUserId)) {
                return { status: "NOT_AUTHORIZED", reason: "giverUserId is not a real member of this session." };
            }
            const mine = this.#byGiver.get(`${sessionId}:${giverUserId}`) || [];
            return { status: "OK", offerings: mine.map((o) => this.#ownerShape(o)) };
        }

        /**
         * cancelOfferingIntent(sessionId, actorId, offeringId, reason)
         *   Explicit and auditable. Allowed for the record's own giver,
         *   or an authorized moderator/admin (#isAuthorizedModerator),
         *   only while the record is still in a non-terminal, reachable
         *   state ("LOCAL_QUEUED"). Always appends a real audit event.
         */
        cancelOfferingIntent(sessionId, actorId, offeringId, reason = null) {
            const ldce = this.#requireLdce();
            if (!ldce) return { status: "UNAVAILABLE", reason: "LDCESessionEngine is not available." };
            const identity = this.#requireIdentity();
            if (!identity) return { status: "UNAVAILABLE", reason: "IdentityEngine is not available." };
            const session = ldce.getSession(sessionId);
            if (!session) return { status: "NOT_FOUND", reason: "Unknown LDCE session." };

            const list = this.#offerings.get(sessionId) || [];
            const offering = list.find((o) => o.offeringId === offeringId);
            if (!offering) return { status: "NOT_FOUND", reason: "Unknown offeringId." };

            const isOwner = actorId === offering.giverUserId;
            if (!isOwner) {
                const authz = this.#isAuthorizedModerator(ldce, identity, actorId, sessionId, session.hostId);
                if (!authz.authorized) return { status: "NOT_AUTHORIZED", reason: authz.reason };
            }

            if (offering.status !== "LOCAL_QUEUED") {
                return { status: "REJECTED", reason: `Only an offering intent in "LOCAL_QUEUED" status can be cancelled (current status: "${offering.status}").` };
            }

            offering.status = "CANCELLED";
            const event = this.#recordEvent(sessionId, "CANCELLED", { offeringId, actorId, reason });
            return { status: "OK", offering: this.#ownerShape(offering), event: Object.assign({}, event) };
        }

        /**
         * getOfferingQueue(sessionId, requesterUserId)
         *   Moderator/admin-only. Every offering record in this session
         *   regardless of status, including giver identity — the one
         *   surface authorized to see per-giver detail. Fail-closed to
         *   the same authorization gate as cancellation-on-behalf-of.
         */
        getOfferingQueue(sessionId, requesterUserId) {
            const ldce = this.#requireLdce();
            if (!ldce) return { available: false, reason: "LDCESessionEngine is not available." };
            const identity = this.#requireIdentity();
            if (!identity) return { available: false, reason: "IdentityEngine is not available." };
            const session = ldce.getSession(sessionId);
            if (!session) return { available: false, reason: "Unknown LDCE session." };
            const authz = this.#isAuthorizedModerator(ldce, identity, requesterUserId, sessionId, session.hostId);
            if (!authz.authorized) return { available: false, reason: authz.reason };
            const all = (this.#offerings.get(sessionId) || []).map((o) => this.#ownerShape(o));
            return { available: true, offerings: all };
        }

        /**
         * getAggregateOfferingView(sessionId, requesterUserId)
         *   Moderator/admin-only, identical gate to getOfferingQueue().
         *   Privacy-safe: counts and per-currency/per-category sums
         *   only — never a giverUserId, offeringId, individual amount,
         *   or note. Only non-CANCELLED records are counted.
         */
        getAggregateOfferingView(sessionId, requesterUserId) {
            const ldce = this.#requireLdce();
            if (!ldce) return { available: false, reason: "LDCESessionEngine is not available." };
            const identity = this.#requireIdentity();
            if (!identity) return { available: false, reason: "IdentityEngine is not available." };
            const session = ldce.getSession(sessionId);
            if (!session) return { available: false, reason: "Unknown LDCE session." };
            const authz = this.#isAuthorizedModerator(ldce, identity, requesterUserId, sessionId, session.hostId);
            if (!authz.authorized) return { available: false, reason: authz.reason };

            const list = (this.#offerings.get(sessionId) || []).filter((o) => o.status !== "CANCELLED");
            const byCurrency = {};
            const byCategory = {};
            for (const o of list) {
                if (typeof o.amount === "number") {
                    const cur = o.currency || "UNSPECIFIED";
                    byCurrency[cur] = (byCurrency[cur] || 0) + o.amount;
                }
                const cat = o.category || "UNSPECIFIED";
                byCategory[cat] = (byCategory[cat] || 0) + 1;
            }
            return {
                available: true,
                totalIntents: list.length,
                sumByCurrency: byCurrency,
                countByCategory: byCategory
            };
        }

        /**
         * getAuditLog(sessionId, requesterUserId)
         *   Moderator/admin-only real audit event history. Every event
         *   always carries propagationState:"QUEUED" — see "NOT A
         *   PAYMENT GATEWAY" above.
         */
        getAuditLog(sessionId, requesterUserId) {
            const ldce = this.#requireLdce();
            if (!ldce) return { available: false, reason: "LDCESessionEngine is not available." };
            const identity = this.#requireIdentity();
            if (!identity) return { available: false, reason: "IdentityEngine is not available." };
            const session = ldce.getSession(sessionId);
            if (!session) return { available: false, reason: "Unknown LDCE session." };
            const authz = this.#isAuthorizedModerator(ldce, identity, requesterUserId, sessionId, session.hostId);
            if (!authz.authorized) return { available: false, reason: authz.reason };
            const events = (this.#auditLog.get(sessionId) || []).map((e) => Object.assign({}, e));
            return { available: true, events };
        }

        getVersion() { return MODULE_VERSION; }
    }

    const engineInstance = new ChurchOfferingInteraction();
    window.CozyOS.ChurchOfferingInteraction = engineInstance;
    window.CozyOS.ChurchOfferingInteraction.OFFERING_STATES = OFFERING_STATES;
    window.CozyOS.ChurchOfferingInteraction.REACHABLE_STATES = REACHABLE_STATES;
    window.CozyOS.Modules["church-offering-interaction"] = Object.freeze({
        version: MODULE_VERSION,
        description: "ChurchOS Offering Interaction (RP-035 Phase C, Checkpoint 5) — composes LDCESessionEngine's real roster, IdentityEngine's real platform-admin check, OrganizationRole's real permission declarations, and church-live-moderation.js's exported MODERATION_MANAGE_PERMISSION constant (no new permission engine). Adds one genuinely new, disclosed capability confirmed absent repository-wide: offering-intent creation/cancellation with a real, non-payment-gateway lifecycle (INTENT_CREATED/LOCAL_QUEUED/QUEUED/SUBMITTED/CONFIRMED/FAILED/CANCELLED declared, only LOCAL_QUEUED and CANCELLED ever actually reachable — CONFIRMED is never assigned by this file because no real payment provider exists in this repository), privacy-safe owner-only individual records, moderator/admin-only full queue and audit log, and a moderator/admin-only aggregate view (counts and per-currency/per-category sums, zero giver-identifying fields). Real, verifiable per-(sessionId, giverUserId, clientRequestId) duplicate-submission protection. Every offering record and audit event's propagationState is always \"QUEUED\", never \"SENT\" — no real transport in this repository can confirm delivery/submission to an external payment system (repository-wide CAPABILITY_UNAVAILABLE, deferred to a future genuine payment-provider integration)."
    });
})();
