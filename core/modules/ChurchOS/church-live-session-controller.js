/**
 * ChurchOS — Live Session Controller
 * core/modules/ChurchOS/church-live-session-controller.js
 *
 * LIVE INTEGRATION AUDIT — real gap found while implementing the
 * organization-tier ChurchOS workspace: a live worship event today
 * exists as TWO separate, unlinked identifiers —
 *   - an LDCE sessionId (core/modules/communication/ldce-session-
 *     engine.js — the real host/moderator/participant roster,
 *     comments/moderation foundation church-live-moderation.js
 *     composes)
 *   - a ChurchWorshipSession serviceId (core/modules/ChurchOS/church-
 *     worship-session.js — the real transcript/translation/timeline/
 *     scripture foundation living-worship-player.js and CozyAI's
 *     liveSessionId composition read from)
 * — with no existing file anywhere that starts both together for one
 * real event, or lets one id be resolved from the other. Confirmed by
 * reading worship-mode-coordinator.js (only ever calls
 * ChurchWorshipSession.startService(), never LDCESessionEngine) and by
 * grepping the whole repository for anything pairing the two.
 *
 * OWNERSHIP — composes existing engines only, creates no new one:
 *   - core/modules/communication/ldce-session-engine.js —
 *     createSession()/endSession(), unmodified.
 *   - core/modules/ChurchOS/church-worship-session.js —
 *     startService()/endService(), unmodified.
 *   - core/organization/organization-membership.js —
 *     isAuthorized(), the same canonical, org-isolated authority every
 *     other ChurchOS authorization check in this codebase now composes
 *     (see church-live-moderation.js's own comment on the LIVE
 *     INTEGRATION AUDIT canonical-source fix).
 *
 * WHAT THIS FILE OWNS: exactly one new, disclosed responsibility —
 * starting/ending ONE real live worship event as both engines' own
 * session together, org-authorized, and remembering which LDCE
 * sessionId and ChurchWorshipSession serviceId belong to the same real
 * event so other real code (Live Window's getContext(), the
 * organization workspace UI, moderation controls) can resolve one from
 * the other instead of guessing or duplicating state. This mapping is
 * in-memory only (matches ChurchWorshipSession's own #activeServices
 * Map — no new persistence layer).
 *
 * AUTHORIZATION — a Church Administrator's own organization only. A
 * requester must hold LIVE_SESSION_MANAGE_PERMISSION on an ACTIVE
 * OrganizationMembership for the exact orgId requested — the same
 * canonical, structurally org-isolated check OrganizationMembership.
 * isAuthorized() already provides everywhere else (a grant in Church A
 * is invisible when evaluating Church B). Never touches
 * IdentityEngine.isPlatformAdmin — starting/ending a session is
 * ORGANIZATION-tier authority, not PLATFORM-tier.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const VERSION = "1.0.0";
    if (window.CozyOS.Modules["church-live-session-controller"]) return;

    const LIVE_SESSION_MANAGE_PERMISSION = "churchos-live:manage";

    class ChurchLiveSessionController {
        // worshipServiceId -> { worshipServiceId, ldceSessionId, orgId, hostUserId, sourceLanguage, startedAt, endedAt }
        #sessions = new Map();

        getVersion() { return VERSION; }

        #isAuthorized(actorId, orgId) {
            const membership = window.CozyOS.OrganizationMembership;
            if (!membership || typeof membership.isAuthorized !== "function") {
                return { authorized: false, reason: "OrganizationMembership is not loaded — cannot verify authorization." };
            }
            if (!membership.isAuthorized(actorId, orgId, LIVE_SESSION_MANAGE_PERMISSION)) {
                return { authorized: false, reason: `Actor "${actorId}" is not authorized ("${LIVE_SESSION_MANAGE_PERMISSION}") to manage live sessions for organization "${orgId}".` };
            }
            return { authorized: true };
        }

        /**
         * startSession({ orgId, actorId, sourceLanguage })
         *   Real, org-authorized. Creates a real LDCE session (host =
         *   actorId) and a real ChurchWorshipSession service together,
         *   and records the bundle. Never partially succeeds silently:
         *   if ChurchWorshipSession.startService() fails after the LDCE
         *   session was created (e.g. no real SpeechRecognitionAdapter
         *   in this environment), the LDCE session is torn back down
         *   rather than left orphaned.
         */
        async startSession(rawInput = {}) {
            const { orgId, actorId, sourceLanguage } = rawInput;
            if (!orgId) return { success: false, reason: "A real orgId is required." };
            if (!actorId) return { success: false, reason: "A real actorId is required." };

            const authz = this.#isAuthorized(actorId, orgId);
            if (!authz.authorized) return { success: false, reason: authz.reason };

            const ldce = window.CozyOS.LDCESessionEngine;
            if (!ldce || typeof ldce.createSession !== "function") {
                return { success: false, reason: "LDCESessionEngine is not loaded." };
            }
            const worship = window.CozyOS.ChurchWorshipSession;
            if (!worship || typeof worship.startService !== "function") {
                return { success: false, reason: "ChurchWorshipSession is not loaded." };
            }

            const ldceResult = ldce.createSession(actorId, { type: "custom", title: "ChurchOS Live Worship", metadata: { orgId } });
            if (!ldceResult || !ldceResult.success) {
                return { success: false, reason: (ldceResult && ldceResult.reason) || "LDCESessionEngine declined to create a session." };
            }

            const worshipResult = worship.startService(orgId, sourceLanguage);
            if (!worshipResult || !worshipResult.success) {
                // Real, honest rollback — never leave an orphaned LDCE
                // session with no matching worship service behind it.
                if (typeof ldce.cancelSession === "function") {
                    try { ldce.cancelSession(ldceResult.sessionId, actorId); } catch (_err) { /* best-effort cleanup, never masks the real failure below */ }
                }
                return { success: false, reason: (worshipResult && worshipResult.reason) || "ChurchWorshipSession declined to start a service." };
            }

            const bundle = {
                worshipServiceId: worshipResult.serviceId,
                ldceSessionId: ldceResult.sessionId,
                orgId, hostUserId: actorId, sourceLanguage,
                startedAt: new Date().toISOString(), endedAt: null
            };
            this.#sessions.set(worshipResult.serviceId, bundle);
            return { success: true, ...this.#deepClone(bundle) };
        }

        /**
         * endSession({ worshipServiceId, actorId })
         *   Real, org-authorized (or the original host). Ends the real
         *   ChurchWorshipSession service (its own real summary/archival
         *   behavior, unmodified) — the LDCE session itself has no
         *   "end for everyone" concept beyond what its own endSession()
         *   already provides, called here too on a best-effort basis
         *   (its own step-up authorization is respected, never
         *   bypassed; a decline there does not block the worship
         *   service from ending, which is the real, user-visible
         *   lifecycle event).
         */
        async endSession(rawInput = {}) {
            const { worshipServiceId, actorId } = rawInput;
            if (!worshipServiceId) return { success: false, reason: "A real worshipServiceId is required." };
            const bundle = this.#sessions.get(worshipServiceId);
            if (!bundle) return { success: false, reason: `No real, active session bundle for "${worshipServiceId}".` };

            if (actorId !== bundle.hostUserId) {
                const authz = this.#isAuthorized(actorId, bundle.orgId);
                if (!authz.authorized) return { success: false, reason: authz.reason };
            }

            const worship = window.CozyOS.ChurchWorshipSession;
            if (!worship || typeof worship.endService !== "function") {
                return { success: false, reason: "ChurchWorshipSession is not loaded." };
            }
            const worshipResult = worship.endService(worshipServiceId);
            if (!worshipResult || !worshipResult.success) {
                return { success: false, reason: (worshipResult && worshipResult.reason) || "ChurchWorshipSession declined to end the service." };
            }

            const ldce = window.CozyOS.LDCESessionEngine;
            if (ldce && typeof ldce.endSession === "function") {
                try { await ldce.endSession(bundle.ldceSessionId, actorId, { confirm: true }); }
                catch (_err) { /* best-effort — the worship service (the real, user-visible lifecycle) already ended above */ }
            }

            bundle.endedAt = new Date().toISOString();
            this.#sessions.delete(worshipServiceId);
            return { success: true, summary: worshipResult.summary, worshipServiceId, ldceSessionId: bundle.ldceSessionId };
        }

        /** getSessionBundle(worshipServiceId) — real, read-only lookup. Never fabricates a bundle for an id it did not itself create. */
        getSessionBundle(worshipServiceId) {
            const bundle = this.#sessions.get(worshipServiceId);
            return bundle ? this.#deepClone(bundle) : null;
        }

        /** getLdceSessionIdFor(worshipServiceId) — convenience for callers (moderation controls, Live Window) that only need the paired LDCE sessionId. */
        getLdceSessionIdFor(worshipServiceId) {
            const bundle = this.#sessions.get(worshipServiceId);
            return bundle ? bundle.ldceSessionId : null;
        }

        /** listActiveSessions(orgId) — real, org-isolated: never returns another organization's sessions. */
        listActiveSessions(orgId) {
            if (!orgId) return [];
            return Array.from(this.#sessions.values())
                .filter((b) => b.orgId === orgId && !b.endedAt)
                .map((b) => this.#deepClone(b));
        }

        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }

        getDiagnosticsReport() {
            return { moduleVersion: VERSION, activeSessionCount: Array.from(this.#sessions.values()).filter((b) => !b.endedAt).length };
        }
    }

    const instance = new ChurchLiveSessionController();
    instance.LIVE_SESSION_MANAGE_PERMISSION = LIVE_SESSION_MANAGE_PERMISSION;
    window.CozyOS.ChurchLiveSessionController = instance;
    window.CozyOS.Modules["church-live-session-controller"] = Object.freeze({
        version: VERSION,
        description: "Composes LDCESessionEngine + ChurchWorshipSession to start/end one real live worship event as both engines' own session together, org-authorized via the canonical OrganizationMembership.isAuthorized(), and remembers the {ldceSessionId, worshipServiceId} pairing so other real code can resolve one from the other. No new session/live engine — pure orchestration."
    });

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                sourcePath: "core/modules/ChurchOS/church-live-session-controller.js",
                name: "ChurchLiveSessionController", category: "ChurchOS", icon: "video",
                description: "Starts/ends a ChurchOS live worship session (real LDCE + ChurchWorshipSession pairing), org-authorized."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
