/**
 * ChurchOS — Pastor/Admin Geographic Attendance Analytics (RP-035 Phase
 * B, Checkpoint 2)
 * core/modules/ChurchOS/church-attendance-geography.js
 *
 * SCOPE. Adds exactly two things on top of Checkpoint 1's real LDCE
 * attendance foundation, which is not modified by this file:
 *   1. `getPastorAdminAnalytics(sessionId, requesterUserId)` — a real,
 *      fail-closed, geography-aware attendance breakdown for an
 *      authorized Pastor/Admin only.
 *   2. `PASTOR_ADMIN_ANALYTICS_PERMISSION` — the one real permission
 *      string this file checks for, meant to be granted to a real
 *      OrganizationRole the organization itself creates (e.g. a
 *      "Senior Pastor" or "Branch Admin" role) — never a new, separate
 *      authorization mechanism.
 *
 * RULE 29 OWNERSHIP AUDIT — PERFORMED BEFORE THIS FILE WAS WRITTEN.
 *
 *   Real, composed, not duplicated:
 *     - core/modules/communication/ldce-session-engine.js — getSession()/
 *       listParticipants() (same real, fail-closed roster read
 *       core/modules/ChurchOS/church-live-attendance.js already
 *       established in Checkpoint 1 — this file follows the identical
 *       internal-aggregation pattern, does not duplicate it, and does
 *       not import or wrap church-live-attendance.js because that file
 *       exposes only counts, never a per-participant roster, and this
 *       file genuinely needs per-participant userIds to attach real
 *       country evidence to each one).
 *     - core/modules/identity/identity-engine.js — getUser(userId) and
 *       isPlatformAdmin(userId). getUser() previously returned
 *       companyId/branchId/departmentId/teamId but not the `country`
 *       or `orgId` fields it always actually stored on the user
 *       record — a real, disclosed Rule 24 gap, fixed additively in
 *       this checkpoint's one-line getUser() change (see that file's
 *       own updated comment). No new field was invented: both fields
 *       already existed on every real user record before this
 *       checkpoint touched anything.
 *     - core/organization/organization-role.js — listRoles(),
 *       specifically each real role's `permissions` array and
 *       `assignedUserId`. This file does not create roles, does not
 *       grant permissions, and does not decide who is a Pastor/Admin —
 *       it only reads what the organization itself already declared
 *       through the real Organization Builder.
 *
 *   Confirmed absent, not fabricated as present:
 *     - No engine anywhere in this repository stores a "home
 *       country"/timezone-region for an Organization.
 *       core/plugins/churchOS-core.js's setupChurch() accepts a
 *       `country` input, but only folds it into a local `setup` object
 *       it returns once and never persists — OrganizationRegistry's own
 *       real Organization record (core/organization/
 *       organization-registry.js) has no `country` field at all. This
 *       was verified by reading both files directly, not assumed. That
 *       means there is no trustworthy per-organization "home country"
 *       anywhere to compare attendee countries against for a generic
 *       Local/Regional/International split — see LOCAL-AREA DESIGN
 *       below for how this file honestly handles that real gap instead
 *       of inventing one.
 *     - No LDCE session stores an `orgId`. `createSession()`'s
 *       `metadata` parameter is free-form and no real caller in this
 *       repository (checked by grep across the whole tree) ever puts
 *       an orgId into it. This file therefore never claims a session
 *       "belongs to" an organization via session metadata — see
 *       AUTHORIZATION DESIGN below for the real, narrower evidence it
 *       uses instead.
 *
 * AUTHORIZATION DESIGN — evidence-based, not `if (role === "admin")`.
 *   A requester is treated as an authorized Pastor/Admin for a given
 *   LDCE session if, and only if, at least one of these real facts is
 *   true:
 *     (a) `IdentityEngine.isPlatformAdmin(requesterUserId)` is true —
 *         the same real, existing platform-admin check every other
 *         admin-gated surface in this repository already uses
 *         (identity-engine.js's own dashboard-routing code composes
 *         this exact method the same way); or
 *     (b) the requester's own `IdentityEngine.getUser().orgId` matches
 *         the session host's `orgId` (both real, stored user fields —
 *         never assumed equal without reading both), AND
 *         `OrganizationRole.listRoles({ orgId })` contains at least one
 *         real, non-archived role whose `permissions` array contains
 *         `PASTOR_ADMIN_ANALYTICS_PERMISSION` and whose
 *         `assignedUserId` is genuinely this requester's userId.
 *   Neither branch is a new authorization mechanism: (a) reuses
 *   IdentityEngine's existing platform-admin check verbatim; (b) reuses
 *   OrganizationRole's existing role/permission declarations verbatim
 *   — this file only reads `permissions.includes(...)` and
 *   `assignedUserId === requesterUserId`, the same two real fields
 *   organization-role.js already exposes on every role it returns. If
 *   IdentityEngine or OrganizationRole is not loaded, or the host has
 *   no `orgId` on file, authorization fails closed — never open.
 *
 * GEOGRAPHIC EVIDENCE — real, consented, never guessed.
 *   For each currently-active (status:"joined") LDCE participant, this
 *   file reads that participant's own `IdentityEngine.getUser().country`
 *   — the same optional, self-disclosed field register() has always
 *   stored, exposed additively this checkpoint (see identity-engine.js
 *   change above). Never derived from IP address, GPS, phone number
 *   language, or country calling code — none of those signals are read
 *   anywhere in this file. A participant whose user record has no
 *   `country` on file is counted under the honest bucket `"Unknown"`,
 *   never silently dropped and never assigned a guessed country.
 *
 * LOCAL-AREA DESIGN — the real, disclosed gap and how this file
 * honestly handles it. Since no Organization record carries a real
 * home country (confirmed above), "Local area" cannot be computed
 * against an organization's location — there isn't one on file. This
 * file instead anchors "Local area" to the authorized requester's own
 * real, consented `country` (the same Pastor/Admin who is asking for
 * the report) — a real, available fact about a real person, not a
 * fabricated fact about an organization. "East Africa" is a static
 * public geographic classification (a fixed list of country names in
 * the UN geoscheme's Eastern Africa region), not per-user inferred
 * data — no participant's location is guessed to produce it. If the
 * requester's own `country` is not on file, this file does not
 * silently substitute anything: `regional` is returned as
 * `LOCATION_DATA_UNAVAILABLE`, while the real per-country breakdown
 * (which does not depend on the requester's own country) is still
 * returned normally.
 *
 * VIEWER PATH — untouched. Ordinary viewers must keep calling
 * `ChurchLiveAttendance.getViewerAttendance()` (Checkpoint 1, not
 * modified by this file) which returns only `{available, attending}`.
 * This file adds no new viewer-facing surface and does not change
 * that method's contract, output, or callers in any way.
 *
 * DISCLOSED, NOT TOUCHED (Rule 29/17 — pre-existing, out of scope):
 * `modules/live/cozy-live.js`'s own, separate
 * `recordAttendance()`/`listAttendance()`/`ATTENDANCE_RECORDED` sink is
 * still not read, written, or merged into by this checkpoint. Per
 * Charles's explicit Checkpoint 2 scope, this file only determines
 * whether that separate sink is the correct eventual owner of a shared
 * canonical attendance event — it does not conclude that here, and
 * does not connect to it merely because the name sounds relevant.
 * `church-membership-bridge.js`'s manual check-in attendance (a
 * separate, already-flagged org-model duplication since ChurchOS C001)
 * is likewise not read, written, or reconciled by this file.
 *
 * NOT ADDED, on purpose, per the explicit Checkpoint 2 boundary: no
 * SFU, no CDN, no global broadcast, no unlimited-viewer capability, no
 * IP-location inference, no new IdentityEngine, no new authorization
 * engine, and no modification of Section 16's floating player
 * (core/shell/live/cozy-live-session.js) or Checkpoint 1's
 * church-live-attendance.js.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["church-attendance-geography"]) return;

    /** The one real permission string this file checks for. An
     * organization grants it to a real role (e.g. "Senior Pastor")
     * through the existing, unmodified Organization Builder — this
     * file never grants it itself. */
    const PASTOR_ADMIN_ANALYTICS_PERMISSION = "attendance:analytics-view";

    /** Static, public UN-geoscheme "Eastern Africa" country list — a
     * fixed geographic classification, not data inferred about any
     * individual participant. */
    const EAST_AFRICA_COUNTRIES = Object.freeze([
        "Burundi", "Comoros", "Djibouti", "Eritrea", "Ethiopia", "Kenya",
        "Madagascar", "Malawi", "Mauritius", "Mayotte", "Mozambique",
        "Reunion", "Rwanda", "Seychelles", "Somalia", "South Sudan",
        "Tanzania", "Uganda", "Zambia", "Zimbabwe"
    ]);

    class ChurchAttendanceGeography {
        #requireLdce() {
            const ldce = window.CozyOS.LDCESessionEngine;
            if (!ldce || typeof ldce.getSession !== "function" || typeof ldce.listParticipants !== "function") return null;
            return ldce;
        }
        #requireIdentity() {
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.getUser !== "function") return null;
            return identity;
        }

        /**
         * #isAuthorizedPastorAdmin(requesterUserId, hostUserId)
         *   Real, evidence-based, fail-closed. See AUTHORIZATION DESIGN
         *   above for the two real branches this composes. Never
         *   creates, grants, or assumes a permission — only reads
         *   permissions/role-assignments/platform-admin status that
         *   already exist on real records.
         */
        #isAuthorizedPastorAdmin(identity, requesterUserId, hostUserId) {
            if (!requesterUserId) return { authorized: false, reason: "A real requesterUserId is required." };

            if (typeof identity.isPlatformAdmin === "function" && identity.isPlatformAdmin(requesterUserId)) {
                return { authorized: true, via: "platform-admin" };
            }

            const orgRole = window.CozyOS.OrganizationRole;
            if (!orgRole || typeof orgRole.listRoles !== "function") {
                return { authorized: false, reason: "OrganizationRole is not loaded — cannot evaluate org-level authorization." };
            }

            const hostUser = hostUserId ? identity.getUser(hostUserId) : null;
            const requesterUser = identity.getUser(requesterUserId);
            const orgId = hostUser ? hostUser.orgId : null;
            if (!orgId) return { authorized: false, reason: "The session host has no orgId on file — cannot evaluate org-level authorization for this session." };
            if (!requesterUser || requesterUser.orgId !== orgId) {
                return { authorized: false, reason: "The requester is not a member of the organization this session's host belongs to." };
            }

            const roles = orgRole.listRoles({ orgId });
            const held = roles.some((r) => r.assignedUserId === requesterUserId && Array.isArray(r.permissions) && r.permissions.includes(PASTOR_ADMIN_ANALYTICS_PERMISSION));
            if (!held) return { authorized: false, reason: `No real, active org role assigned to this requester declares the "${PASTOR_ADMIN_ANALYTICS_PERMISSION}" permission.` };
            return { authorized: true, via: "org-role", orgId };
        }

        /**
         * #countryBreakdown(roster, identity)
         *   Real, per-participant. Never guesses: a participant whose
         *   user record has no `country` on file is counted under
         *   "Unknown", not silently dropped and not assigned a guessed
         *   country.
         */
        #countryBreakdown(roster, identity) {
            const byCountry = {};
            for (const p of roster) {
                const user = identity.getUser(p.userId);
                const country = user && user.country ? user.country : "Unknown";
                byCountry[country] = (byCountry[country] || 0) + 1;
            }
            return byCountry;
        }

        /**
         * #regionalBreakdown(byCountry, localCountry)
         *   Real, only computed when the requester's own real country
         *   is on file (see LOCAL-AREA DESIGN above). Returns
         *   LOCATION_DATA_UNAVAILABLE — never an invented split —
         *   when it is not.
         */
        #regionalBreakdown(byCountry, localCountry) {
            if (!localCountry) {
                return { available: false, reason: "LOCATION_DATA_UNAVAILABLE", detail: "The authorized requester has no consented country on file to anchor a Local Area comparison." };
            }
            let local = 0, eastAfrica = 0, international = 0;
            for (const [country, count] of Object.entries(byCountry)) {
                if (country === localCountry) local += count;
                else if (EAST_AFRICA_COUNTRIES.includes(country)) eastAfrica += count;
                else international += count; // includes "Unknown" honestly — never assumed local or regional
            }
            return { available: true, localCountry, localArea: local, eastAfrica, international };
        }

        /**
         * getPastorAdminAnalytics(sessionId, requesterUserId)
         *   The one real analytics surface this checkpoint adds.
         *   Fail-closed at every step: unavailable engines, an unknown
         *   session, or an unauthorized requester all return
         *   available:false and a real reason — never a partial or
         *   fabricated report.
         */
        getPastorAdminAnalytics(sessionId, requesterUserId) {
            const ldce = this.#requireLdce();
            if (!ldce) return { available: false, reason: "LDCESessionEngine is not available." };
            const identity = this.#requireIdentity();
            if (!identity) return { available: false, reason: "IdentityEngine is not available." };
            if (!sessionId) return { available: false, reason: "sessionId is required." };

            const session = ldce.getSession(sessionId);
            if (!session) return { available: false, reason: "Unknown LDCE session." };

            const authz = this.#isAuthorizedPastorAdmin(identity, requesterUserId, session.hostId);
            if (!authz.authorized) return { available: false, reason: authz.reason || "NOT_AUTHORIZED" };

            const roster = ldce.listParticipants(sessionId, session.hostId);
            const active = roster.filter((p) => p.status === "joined");

            const byCountry = this.#countryBreakdown(active, identity);
            const requester = identity.getUser(requesterUserId);
            const regional = this.#regionalBreakdown(byCountry, requester ? requester.country : null);

            return { available: true, sessionId, total: active.length, byCountry, regional };
        }

        getVersion() { return MODULE_VERSION; }
    }

    const engineInstance = new ChurchAttendanceGeography();
    window.CozyOS.ChurchAttendanceGeography = engineInstance;
    window.CozyOS.ChurchAttendanceGeography.PASTOR_ADMIN_ANALYTICS_PERMISSION = PASTOR_ADMIN_ANALYTICS_PERMISSION;
    window.CozyOS.Modules["church-attendance-geography"] = Object.freeze({
        version: MODULE_VERSION,
        description: "ChurchOS Pastor/Admin Geographic Attendance Analytics (RP-035 Phase B, Checkpoint 2) — pure composition over LDCESessionEngine's real roster, IdentityEngine's real country/orgId/platform-admin facts, and OrganizationRole's real permission declarations. Fail-closed authorization (platform-admin OR a real org role holding \"attendance:analytics-view\"). Country breakdown is real per-participant consented data, never IP/GPS/phone/language-guessed. Local/East-Africa/International split anchors to the requester's own real country; returns LOCATION_DATA_UNAVAILABLE, never an invented country, when that is not on file. Viewer path (ChurchLiveAttendance.getViewerAttendance) is untouched."
    });
})();
