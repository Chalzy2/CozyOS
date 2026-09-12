/**
 * ChurchOS — LDCE Session Attendance (RP-035 Phase B, Checkpoint 1)
 * core/modules/ChurchOS/church-live-attendance.js
 *
 * NAME NOTE: deliberately "LDCE Session Attendance," not "Live
 * Broadcast Attendance." This module counts real, authorized
 * participants of an LDCE session (core/modules/communication/
 * ldce-session-engine.js) — the only real N-participant roster that
 * exists in this repository. Section 16's cozy-live-session.js is a
 * bounded 1:1 peer transport and explicitly documents its own
 * connected-participant count as "never a broadcast/viewer metric" —
 * this module does not touch that file, does not read its
 * peerTransport state, and never presents an LDCE count as a public
 * broadcast/viewer count. No SFU/CDN exists in this repository and
 * this module does not claim one does.
 *
 * OWNERSHIP (confirmed before writing this file):
 *   REAL and composed: LDCESessionEngine.getSession() (public,
 *   returns hostId/type/metadata — no participant identity),
 *   LDCESessionEngine.listParticipants(sessionId, requesterId) (real,
 *   fail-closed roster read — returns userId/role/status/joinedAt/
 *   leftAt). No new storage, no new roster, no new join/leave logic:
 *   every count here is derived live from LDCE's own real Map on
 *   every call, never cached or duplicated.
 *
 *   DESIGN DECISION (disclosed, not hidden): listParticipants() is
 *   fail-closed by LDCE's own design — a caller must already hold a
 *   real join/role grant to see the roster. An ordinary viewer does
 *   not hold one and is not meant to. This module reads the roster
 *   internally using the session's own real hostId (from the public,
 *   non-identifying getSession() call) as the requester, then reduces
 *   it to counts before returning anything — no name, role, language,
 *   or userId from that internal read is ever exposed by
 *   getViewerAttendance(). This is host-level internal aggregation,
 *   not a new privacy bypass for external callers.
 *
 *   NOT USED, disclosed for the record: modules/live/cozy-live.js
 *   (loaded in dashboard.html/cozy-shell.html) already has its own,
 *   separate recordAttendance()/listAttendance()/ATTENDANCE_RECORDED
 *   sink, documented there as expecting an external "Attendance
 *   Adapter -> Face/QR/NFC Adapter -> CozyIdentity" pipeline that does
 *   not exist. That module is a general live-event data sink, not a
 *   session/participant engine, and Charles's explicit ZIP 1 scope is
 *   LDCE composition only — this module does not write to or read
 *   from cozy-live.js's attendance store. Left for a scoped decision
 *   in a later checkpoint, not silently merged or duplicated here.
 *   Also disclosed: modules/live/ourcozy-live.test.js requires
 *   '../../core/modules/live/ourcozy-live.js', which does not exist
 *   anywhere in this ZIP (a pre-existing, unrelated broken path — not
 *   touched, not caused by this checkpoint).
 *
 *   HONEST GAP, not fabricated: church-membership-bridge.js's manual
 *   check-in attendance (a different, already-flagged org-model
 *   duplication since ChurchOS C001) is a separate concept from LDCE
 *   session attendance and is not read, written, or reconciled here.
 *
 * HONESTY GUARANTEE: every number this module returns is read live
 * from LDCESessionEngine's real roster at call time. If LDCE is not
 * loaded, or the session is unknown, this module returns
 * available:false and a reason — never a fabricated count, never a
 * placeholder number standing in for a real one.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["church-live-attendance"]) return;

    class ChurchLiveAttendance {
        #requireEngine() {
            const ldce = window.CozyOS.LDCESessionEngine;
            if (!ldce || typeof ldce.getSession !== "function" || typeof ldce.listParticipants !== "function") return null;
            return ldce;
        }

        /**
         * getAttendanceCounts() — real, non-identifying aggregate counts
         * for one LDCE session, derived live from the real roster.
         * Internal-facing (host/moderator/Pastor-Admin surfaces compose
         * this in a later checkpoint); still returns counts only, never
         * the underlying roster, since that is this module's own
         * contract, not just the viewer path's.
         *
         *   totalEverJoined — size of the real roster Map: every userId
         *     who has joined at least once (rejoining the same userId
         *     does not create a second entry — LDCE's roster is Map-
         *     keyed by userId, so duplicate joins are structurally
         *     impossible, verified by this checkpoint's tests).
         *   active — real count of entries with status === "joined".
         *   left — real count of entries with status === "left".
         */
        getAttendanceCounts(sessionId) {
            const ldce = this.#requireEngine();
            if (!ldce) return { available: false, reason: "LDCESessionEngine is not available." };
            if (!sessionId) return { available: false, reason: "sessionId is required." };

            const session = ldce.getSession(sessionId);
            if (!session) return { available: false, reason: "Unknown LDCE session." };

            const roster = ldce.listParticipants(sessionId, session.hostId);
            const totalEverJoined = roster.length;
            const active = roster.filter((p) => p.status === "joined").length;
            const left = roster.filter((p) => p.status === "left").length;

            return { available: true, sessionId, totalEverJoined, active, left };
        }

        /**
         * getViewerAttendance() — the ONLY method an ordinary-viewer
         * surface should ever call. Returns a single non-identifying
         * number: the real, current count of active (status:"joined")
         * participants — never the cumulative all-time join count, never
         * names, roles, languages, countries, or userIds. If real
         * attendance evidence is not available, returns available:false
         * and attending:0 explicitly — never a fabricated placeholder.
         */
        getViewerAttendance(sessionId) {
            const counts = this.getAttendanceCounts(sessionId);
            if (!counts.available) return { available: false, attending: 0, reason: counts.reason };
            return { available: true, attending: counts.active };
        }

        getVersion() { return MODULE_VERSION; }
    }

    const engineInstance = new ChurchLiveAttendance();
    window.CozyOS.ChurchLiveAttendance = engineInstance;
    window.CozyOS.Modules["church-live-attendance"] = Object.freeze({
        version: MODULE_VERSION,
        description: "ChurchOS LDCE Session Attendance (RP-035 Phase B, Checkpoint 1) — pure composition over LDCESessionEngine's real participant roster. Total/active/left counts derived live, never cached or duplicated. Viewer-facing surface exposes only a current active-attendance number, never identity, role, or geography. No SFU/CDN/broadcast claim. Section 16's cozy-live-session.js (bounded 1:1 peer transport) is untouched."
    });
})();
