/**
 * core/modules/communication/ldce-roster-reporter.js
 * CozyOS — Living Direct Communication Engine (LDCE) — Roster Reporter
 * Milestone: R040 Phase 3 (continuation)
 *
 * REAL SCOPE DISCLOSURE
 *   This is the client-side half of the real "in-process/RPC bridge to
 *   a live LDCESessionEngine instance" that session-authority.js and
 *   server/live-relay/README.md named as the next concrete step after
 *   Phase 3E. It runs wherever the real LDCESessionEngine instance
 *   already runs (the host's browser tab) and composes that instance's
 *   OWN real, existing APIs — never a second roster:
 *     - `.on(eventName, handler)` — LDCE's own real event emitter
 *       (participant-joined, participant-left, participant-role-changed,
 *       participant-language-changed, participant-state-changed,
 *       session-ended, session-cancelled — all genuinely emitted by
 *       core/modules/communication/ldce-session-engine.js, not invented
 *       here).
 *     - `.listParticipants(sessionId, requesterId)` — LDCE's own real,
 *       already-shipped, fail-closed roster read.
 *   On any roster-affecting event, this file re-reads the roster via
 *   listParticipants() (never assembles one from event payloads alone,
 *   which would risk drifting from LDCE's own authoritative state) and
 *   hands the result to a caller-supplied `send()` sink. This file
 *   contains zero WebSocket/transport code of its own — the paired
 *   wiring in `core/shell/live/providers/cozy-live-remote-relay-transport-provider.js`
 *   (`reportRoster()`) is the real transport, composed, not duplicated.
 *
 *   WHAT THIS FILE DOES NOT DO
 *   It does not decide who the host is, does not authenticate anyone,
 *   and does not talk to the signaling server's HTTP token endpoint.
 *   Those are the real, separately-disclosed jobs of IdentityEngine,
 *   the session-creation flow, and session-authority.js. This file's
 *   only job is: real LDCE roster change -> real LDCE roster read ->
 *   forward it.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.CozyOS = root.CozyOS || {};
        root.CozyOS.LdceRosterReporter = factory();
    }
})(typeof window !== "undefined" ? window : globalThis, function () {
    "use strict";

    // Every real LDCESessionEngine event that can change what
    // listParticipants() would return. Deliberately excludes
    // signaling-* events (SDP offer/answer exchange) and
    // metadata-changed/translation-session-linked, which never affect
    // roster membership, role, language, mute, or camera state.
    const ROSTER_AFFECTING_EVENTS = Object.freeze([
        "participant-joined",
        "participant-left",
        "participant-role-changed",
        "participant-language-changed",
        "participant-state-changed",
        "session-ended",
        "session-cancelled",
    ]);

    class LdceRosterReporter {
        /**
         * @param {object} opts
         * @param {object} opts.ldce  Real LDCESessionEngine instance — must expose on()/listParticipants(), the same shape ldce-session-engine.js already ships.
         * @param {string} opts.sessionId
         * @param {string} opts.hostId  requesterId passed to listParticipants() — must itself have real join rights on this session (normally the session's host), since listParticipants() is fail-closed for non-participants.
         * @param {function(participants: Array<object>): void} opts.send  Real sink, e.g. `(participants) => transportProvider.reportRoster(sessionId, participants)`. Never called with fabricated data — always LDCE's own listParticipants() output.
         * @param {number} [opts.debounceMs] Coalesce bursts of rapid LDCE events (e.g. several joins in the same tick) into one wire send. Default 0 (send on every event).
         */
        constructor(opts = {}) {
            if (!opts.ldce || typeof opts.ldce.on !== "function" || typeof opts.ldce.listParticipants !== "function") {
                throw new TypeError("[LdceRosterReporter] opts.ldce must be a real LDCESessionEngine instance exposing on()/listParticipants().");
            }
            if (!opts.sessionId) throw new TypeError("[LdceRosterReporter] opts.sessionId is required.");
            if (!opts.hostId) throw new TypeError("[LdceRosterReporter] opts.hostId is required.");
            if (typeof opts.send !== "function") throw new TypeError("[LdceRosterReporter] opts.send(participants) is required.");

            this._ldce = opts.ldce;
            this._sessionId = opts.sessionId;
            this._hostId = opts.hostId;
            this._send = opts.send;
            this._debounceMs = opts.debounceMs || 0;
            this._timer = null;
            this._syncCount = 0;

            this._unsubscribers = ROSTER_AFFECTING_EVENTS.map((eventName) =>
                this._ldce.on(eventName, (detail) => {
                    if (detail && detail.sessionId && detail.sessionId !== this._sessionId) return; // real multi-session isolation — never reports a roster for the wrong session
                    this._scheduleSync();
                })
            );
            this._active = true;
        }

        _scheduleSync() {
            if (!this._debounceMs) { this.syncNow(); return; }
            if (this._timer) return; // already coalescing this burst
            this._timer = setTimeout(() => { this._timer = null; this.syncNow(); }, this._debounceMs);
        }

        /**
         * syncNow() — real, immediate re-read of LDCE's own roster via
         * listParticipants(), then forwarded through send(). Safe to
         * call directly right after createSession()/joinSession() for
         * an initial sync, not only from the event-driven path.
         */
        syncNow() {
            const participants = this._ldce.listParticipants(this._sessionId, this._hostId);
            this._syncCount++;
            this._send(participants);
            return participants;
        }

        /** getSyncCount() — diagnostic helper for tests/telemetry, never used for any authorization decision. */
        getSyncCount() {
            return this._syncCount;
        }

        /** stop() — unsubscribes from every LDCE event this reporter attached. Real cleanup; no dangling listeners survive a session teardown. */
        stop() {
            if (!this._active) return;
            for (const off of this._unsubscribers) { try { off(); } catch (_e) { /* already removed */ } }
            if (this._timer) { clearTimeout(this._timer); this._timer = null; }
            this._active = false;
        }
    }

    return { LdceRosterReporter };
});
