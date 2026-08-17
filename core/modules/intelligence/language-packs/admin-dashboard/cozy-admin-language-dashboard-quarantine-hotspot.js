/**
 * core/modules/intelligence/language-packs/admin-dashboard/cozy-admin-language-dashboard-quarantine-hotspot.js
 * Repair: RP-031-B — Admin Language Dashboard + Usage/Research Analytics
 * Milestone: RP-031-B, Increment 4 (Quarantine + Cozy Offline Hotspot
 * Dashboard Views)
 *
 * OWNERSHIP / COMPOSITION
 *   New, additive, standalone file. Composes — never duplicates:
 *     - window.CozyOS.CozyLanguagePacks (RP-030)
 *     - window.CozyOS.CozyKnowledgeSafetyGate (RP-029-C Phase 4/5:
 *       listQuarantined() — read-only, counts/redacted fields only)
 *     - window.CozyOS.CozyKnowledgeQuarantineAdmin (RP-029-C Phase 5:
 *       resolveRole/isAuthorized/listQuarantine/analytics/getAuditTrail
 *       — same authorization pattern threaded through, never bypassed)
 *     - window.CozyOS.CozyKnowledgeReview (RP-029-C Phase 1:
 *       evaluateRule82Gate() — the one real, existing Rule 82 gate;
 *       this file adds no second evaluator and no mutator)
 *     - window.CozyOS.CozyKnowledgeReviewHotspotBridge (RP-029-C Phase 2:
 *       listActiveConnections/shareCandidate/_handleIncomingPayloadForTests
 *       — the one real Cozy Offline Hotspot composition in this
 *       repository; this file builds no second transport)
 *     - window.CozyOS.Modules["cozy-admin-language-dashboard-domain-community"]
 *       (Increment 3: getCommunityContributionAnalytics, getDomainAnalytics
 *       — reused verbatim, never recomputed)
 *   No storage of its own truth for quarantine/review/transport state.
 *
 * RULE 82 — BINDING
 *   This file has no mutator anywhere. It reads
 *   CozyKnowledgeReview.evaluateRule82Gate() and reshapes its real
 *   ELIGIBLE/LOCKED output for dashboard display only. It never calls a
 *   promotion function, never sets a pack's resourceState/status, and
 *   never claims a language is AVAILABLE.
 *
 * HOTSPOT HONESTY
 *   The real Cozy Offline Hotspot transport (core/engines/collaboration/
 *   live-hotspot-engine.js, composed via the Phase 2 bridge) has no
 *   QUEUED/SYNCING/SYNCED/CONFLICT concept at all — confirmed by direct
 *   source read: outgoing sends are synchronous
 *   (SENT/SEND_FAILED/NO_ACTIVE_HOTSPOT_CONNECTION), and incoming
 *   payloads are validated and ingested immediately
 *   (SUBMITTED/QUARANTINED/REJECTED_UNSAFE/IGNORED_*). This file reports
 *   those REAL status strings verbatim rather than renaming them to
 *   match a status vocabulary the transport doesn't actually have.
 *   SYNCING/SYNCED/CONFLICT are honestly reported
 *   NOT_SUPPORTED_BY_TRANSPORT — never fabricated, never silently
 *   mapped from a different real status.
 *
 *   This file's own hotspot activity ledger (see section 3 below)
 *   records only events actually observed through THIS file's own
 *   wrapper calls (shareViaHotspot/receiveHotspotPayload) — it does
 *   NOT intercept the real production wireReceiver() event listener
 *   (registering a second listener there would risk double-processing
 *   a real incoming payload). Any hotspot traffic that flows through
 *   the bridge's own wireReceiver() directly, outside this dashboard,
 *   is honestly invisible to this ledger — disclosed here and in every
 *   function that reads it, never silently assumed complete.
 *
 * PRIVACY
 *   Quarantine items are always redacted (fields/evidence stripped)
 *   before leaving this file, the same boundary Increment 2/3 already
 *   drew. Region aggregation reads only the single `region` key out of
 *   a quarantine entry's raw `fields` (a geographic claim about
 *   content, not personal identity) — never the full fields object,
 *   never expression/meaning/evidence text.
 */
(function (root) {
    "use strict";

    const VERSION = "0.1.0";
    const COMMUNITY_TAG = "COMMUNITY_REPORTED_NOT_PROFESSIONALLY_VERIFIED";

    function cozyOS() { return (root.window && root.window.CozyOS) || null; }
    function packsApi() { const c = cozyOS(); return c && c.CozyLanguagePacks ? c.CozyLanguagePacks : null; }
    function safetyGate() { const c = cozyOS(); return c && c.CozyKnowledgeSafetyGate ? c.CozyKnowledgeSafetyGate : null; }
    function quarantineAdmin() { const c = cozyOS(); return c && c.CozyKnowledgeQuarantineAdmin ? c.CozyKnowledgeQuarantineAdmin : null; }
    function reviewApi() { const c = cozyOS(); return c && c.CozyKnowledgeReview ? c.CozyKnowledgeReview : null; }
    function hotspotBridge() { const c = cozyOS(); return c && c.CozyKnowledgeReviewHotspotBridge ? c.CozyKnowledgeReviewHotspotBridge : null; }
    function domainCommunity() {
        const c = cozyOS();
        return c && c.Modules && c.Modules["cozy-admin-language-dashboard-domain-community"]
            ? c.Modules["cozy-admin-language-dashboard-domain-community"].api
            : null;
    }

    function normalize(s) { return String(s || "").trim().toLowerCase(); }

    // -----------------------------------------------------------------
    // REDACTION (same boundary Increment 2/3 already drew)
    // -----------------------------------------------------------------

    function redactQuarantineItem(item) {
        if (!item) return item;
        const clean = Object.assign({}, item);
        // Extract only the non-identifying `region` key from raw fields
        // for aggregation — never the rest of the raw submitted content.
        const region = item.fields && item.fields.region ? item.fields.region : null;
        delete clean.fields;
        delete clean.evidence;
        clean.evidenceCount = Array.isArray(item.evidence) ? item.evidence.length : 0;
        clean.region = region;
        return clean;
    }

    // -----------------------------------------------------------------
    // 1. QUARANTINE OVERVIEW (spec sections 4–7)
    // -----------------------------------------------------------------

    /**
     * getQuarantineOverview(roleInfo)
     *   Authorization-guarded exactly like RP-029-C Phase 5's own
     *   dashboard (REVIEWER+). Every count below is derived from the
     *   real, currently-open quarantine store plus Increment 3's own
     *   real submission-time safety-rejection counts — never a second
     *   historical counter.
     */
    function getQuarantineOverview(roleInfo) {
        const qa = quarantineAdmin();
        const gate = safetyGate();
        const dc = domainCommunity();
        if (!qa || !gate) return { capability: "CAPABILITY_UNAVAILABLE", reason: "QUARANTINE_LAYER_ABSENT" };

        const info = roleInfo || qa.resolveRole();
        const rawListing = qa.listQuarantine(info, {});
        if (rawListing.status !== "OK") {
            return { capability: "AVAILABLE", status: rawListing.status, note: "Authorization required (REVIEWER+) to view quarantine detail. See resolveRole()/isAuthorized() for the real authorization path this file composes." };
        }
        const items = rawListing.items.map(redactQuarantineItem);

        const byLanguage = {};
        const byRegion = {};
        const byContributionType = {};
        const byClassification = {};
        let highRiskCount = 0;

        items.forEach((it) => {
            const lang = it.language || "UNKNOWN";
            byLanguage[lang] = (byLanguage[lang] || 0) + 1;
            const region = it.region || "UNSPECIFIED_REGION";
            byRegion[region] = (byRegion[region] || 0) + 1;
            const ct = it.contributionType || "UNKNOWN";
            byContributionType[ct] = (byContributionType[ct] || 0) + 1;
            byClassification[it.classification] = (byClassification[it.classification] || 0) + 1;
            if (it.classification === "HIGH_RISK") highRiskCount++;
        });

        const byState = { QUARANTINED: 0, UNDER_REVIEW: 0 };
        items.forEach((it) => { byState[it.reviewState] = (byState[it.reviewState] || 0) + 1; });

        const stats = qa.analytics(info);
        const communityAnalytics = dc ? dc.getCommunityContributionAnalytics() : null;

        // Recent activity: real audit-trail events for CURRENTLY-open
        // items only (RELEASED/REJECTED/ESCALATED items are removed
        // from the real store on transition — their audit events are
        // therefore no longer reachable via any current listing; see
        // Increment 3's own disclosed NOT_AVAILABLE_NO_HISTORICAL_AGGREGATE
        // finding, unchanged here, not re-solved by this file).
        const recentActivity = [];
        items.forEach((it) => {
            const trail = qa.getAuditTrail(it.id);
            trail.forEach((ev) => recentActivity.push({ quarantineId: it.id, action: ev.action, at: ev.timestamp, actor: ev.actor }));
        });
        recentActivity.sort((a, b) => (a.at < b.at ? 1 : -1));

        return {
            capability: "AVAILABLE",
            currentQuarantined: byState.QUARANTINED || 0,
            underReview: byState.UNDER_REVIEW || 0,
            released: "NOT_AVAILABLE_NO_HISTORICAL_AGGREGATE",
            rejected: "NOT_AVAILABLE_NO_HISTORICAL_AGGREGATE",
            escalated: "NOT_AVAILABLE_NO_HISTORICAL_AGGREGATE",
            highRiskCount,
            safetyGatedAtSubmission: communityAnalytics && communityAnalytics.capability === "AVAILABLE"
                ? communityAnalytics.rejectedSubmissions.atSafetyGateOnSubmission
                : "CAPABILITY_UNAVAILABLE",
            byLanguage,
            byRegion,
            byContributionType,
            byDomain: { status: "DOMAIN_NOT_TRACKED_BY_REGISTRY", tag: COMMUNITY_TAG },
            byClassification,
            unresolvedReviewCount: communityAnalytics && communityAnalytics.capability === "AVAILABLE"
                ? communityAnalytics.clarificationRequests
                : "CAPABILITY_UNAVAILABLE",
            recentActivity: recentActivity.slice(0, 25),
            realtimeStats: stats,
            note: "released/rejected/escalated are honestly unavailable as historical totals: the real safety gate deletes a quarantine entry from its store on any terminal transition, and no aggregate historical counter exists anywhere in this repository (same finding as RP-031-B Increment 3)."
        };
    }

    // -----------------------------------------------------------------
    // 2. RULE 82 VISIBILITY (spec section 7)
    // -----------------------------------------------------------------

    /**
     * getRule82Visibility(languageId)
     *   Reshapes CozyKnowledgeReview's real evaluateRule82Gate() output
     *   only — no second gate, no mutator, never AVAILABLE. Note: the
     *   real gate evaluates against window.CozyOS.CozyLanguageRegistry
     *   (RP-027's narrower chat-template registry), a genuinely
     *   different, smaller registry than RP-030's 17-language pack
     *   registry this dashboard otherwise reads from — an honest scope
     *   mismatch this function surfaces (registryState: "UNREGISTERED")
     *   rather than papering over.
     */
    function getRule82Visibility(languageId) {
        const api = packsApi();
        if (!api) return { capability: "CAPABILITY_UNAVAILABLE", reason: "LANGUAGE_PACK_REGISTRY_ABSENT" };
        const id = normalize(languageId);
        const pack = api.getPack(id);
        if (!pack) return { capability: "AVAILABLE", status: "BLOCKED", reason: "UNREGISTERED_LANGUAGE_PACK" };

        const review = reviewApi();
        if (!review || typeof review.evaluateRule82Gate !== "function") {
            return {
                capability: "AVAILABLE",
                status: pack.resourceState === "NOT_READY" ? "NOT_READY" : "LOCKED",
                rule82Gate: "CAPABILITY_UNAVAILABLE",
                packResourceState: pack.resourceState
            };
        }
        const gate = review.evaluateRule82Gate(id);
        const status = gate.promotion === "ELIGIBLE"
            ? "READY_FOR_REVIEW"
            : (pack.resourceState === "NOT_READY" ? "NOT_READY" : "LOCKED");

        return {
            capability: "AVAILABLE",
            status,
            packResourceState: pack.resourceState,
            rule82Gate: gate,
            note: "READY_FOR_REVIEW reflects the gate's own real ELIGIBLE evaluation only — it is not promotion. This file has no mutator and never sets any pack to AVAILABLE."
        };
    }

    // -----------------------------------------------------------------
    // 3. HOTSPOT DASHBOARD (spec sections 8–10)
    // -----------------------------------------------------------------

    // Real, observed-events-only ledger. See file header: only records
    // events that flow through this file's own wrapper calls below.
    const hotspotLedger = [];

    /**
     * shareViaHotspot(candidateRecord)
     *   Thin, logged wrapper over the real bridge's real shareCandidate().
     *   Never invents a status beyond what the bridge itself returns.
     */
    function shareViaHotspot(candidateRecord) {
        const bridge = hotspotBridge();
        if (!bridge) return { capability: "CAPABILITY_UNAVAILABLE", reason: "HOTSPOT_BRIDGE_ABSENT" };
        const result = bridge.shareCandidate(candidateRecord);
        hotspotLedger.push({ direction: "OUTGOING", status: result.status, at: new Date().toISOString() });
        return Object.assign({ capability: "AVAILABLE" }, result);
    }

    /**
     * receiveHotspotPayload(rawData, connectionId)
     *   Thin, logged wrapper over the real bridge's real
     *   handleIncomingPayload() test hook (the exact same logic
     *   wireReceiver() calls from the live "message-received" event —
     *   not a parallel implementation). Intended for dashboard-driven
     *   or test-driven observation, not as a replacement for the real
     *   production wireReceiver() registration.
     */
    function receiveHotspotPayload(rawData, connectionId) {
        const bridge = hotspotBridge();
        if (!bridge || typeof bridge._handleIncomingPayloadForTests !== "function") {
            return { capability: "CAPABILITY_UNAVAILABLE", reason: "HOTSPOT_BRIDGE_ABSENT" };
        }
        const result = bridge._handleIncomingPayloadForTests(rawData, connectionId);
        hotspotLedger.push({ direction: "INCOMING", status: result.status, at: new Date().toISOString() });
        return Object.assign({ capability: "AVAILABLE" }, result);
    }

    /**
     * getHotspotOverview()
     *   Real connection snapshot from the real bridge + real ledger
     *   tallies. SYNCING/SYNCED/CONFLICT are honestly
     *   NOT_SUPPORTED_BY_TRANSPORT — the real transport has no such
     *   states (confirmed by direct source read of both the bridge and
     *   the underlying LiveHotspotEngine).
     */
    function getHotspotOverview() {
        const bridge = hotspotBridge();
        if (!bridge) return { capability: "CAPABILITY_UNAVAILABLE", reason: "HOTSPOT_BRIDGE_ABSENT" };

        const conn = bridge.listActiveConnections();
        const outgoing = { SENT: 0, SEND_FAILED: 0, NO_ACTIVE_HOTSPOT_CONNECTION: 0, REJECTED: 0 };
        const incoming = { SUBMITTED: 0, QUARANTINED: 0, REJECTED_UNSAFE: 0, REJECTED: 0, IGNORED_UNPARSEABLE: 0, IGNORED_NOT_OWN_TYPE: 0 };
        hotspotLedger.forEach((e) => {
            if (e.direction === "OUTGOING") outgoing[e.status] = (outgoing[e.status] || 0) + 1;
            else incoming[e.status] = (incoming[e.status] || 0) + 1;
        });

        return {
            capability: "AVAILABLE",
            connectionStatus: conn.available ? "AVAILABLE" : "CAPABILITY_UNAVAILABLE",
            activeConnectionCount: conn.available ? conn.connections.length : "CAPABILITY_UNAVAILABLE",
            outgoing,
            incoming,
            syncing: "NOT_SUPPORTED_BY_TRANSPORT",
            synced: "NOT_SUPPORTED_BY_TRANSPORT",
            conflict: "NOT_SUPPORTED_BY_TRANSPORT",
            failed: outgoing.SEND_FAILED,
            unavailableTransport: conn.available ? 0 : "CAPABILITY_UNAVAILABLE",
            lastObservedEvent: hotspotLedger.length > 0 ? hotspotLedger[hotspotLedger.length - 1] : "NOT_AVAILABLE_NO_TELEMETRY",
            note: "Counts reflect only events observed through this dashboard's own shareViaHotspot()/receiveHotspotPayload() wrapper calls — traffic that flows through the bridge's own production wireReceiver() listener directly is not captured here (disclosed limitation, not a fabricated completeness claim). The real transport has no QUEUED/SYNCING/SYNCED/CONFLICT concept at all; those three are honestly NOT_SUPPORTED_BY_TRANSPORT rather than renamed from a different real status."
        };
    }

    // -----------------------------------------------------------------
    // 4. LANGUAGE ROUTING VIA HOTSPOT (spec section 10)
    // -----------------------------------------------------------------

    /**
     * describeHotspotRouting(evidence, candidateLanguageIds)
     *   Composes the real Increment 1 routing (never a second
     *   implementation) to describe where a hotspot-originated
     *   candidate's language evidence points, before/alongside a real
     *   transport status. Never guesses a language from geography
     *   alone — routing always comes from the real pack/routing layer.
     */
    function describeHotspotRouting(evidence, candidateLanguageIds, transportStatus) {
        const c = cozyOS();
        const core = c && c.Modules && c.Modules["cozy-admin-language-dashboard-core"]
            ? c.Modules["cozy-admin-language-dashboard-core"].api : null;
        if (!core) return { capability: "CAPABILITY_UNAVAILABLE", reason: "DASHBOARD_CORE_ABSENT" };
        const routing = core.resolveLanguagePackRouting(evidence, candidateLanguageIds);
        return Object.assign({ transportStatus: transportStatus || "UNKNOWN" }, routing);
    }

    // -----------------------------------------------------------------
    // 5. CROSS-LANGUAGE SAFETY VIEW (spec section 11)
    // -----------------------------------------------------------------

    /**
     * getLanguageSafetySummary()
     *   Per-language real counts only. A language is never itself
     *   labelled unsafe — quarantine/high-risk counts describe specific
     *   content items, not the language as a whole.
     */
    function getLanguageSafetySummary() {
        const api = packsApi();
        const gate = safetyGate();
        if (!api) return { capability: "CAPABILITY_UNAVAILABLE", reason: "LANGUAGE_PACK_REGISTRY_ABSENT" };

        const quarantineItems = gate ? gate.listQuarantined() : [];
        const perLanguage = api.listPacks().map((p) => {
            const id = p.identity.languageId;
            const exprs = api.listExpressions({ languageId: id });
            const safeCandidates = exprs.filter((r) => r.validationState === "CANDIDATE" || r.validationState === "VALIDATED").length;
            const q = quarantineItems.filter((it) => it.language === id);
            return {
                languageId: id,
                name: p.identity.name,
                safeCandidates,
                validated: exprs.filter((r) => r.validationState === "VALIDATED").length,
                quarantined: q.length,
                highRisk: q.filter((it) => it.classification === "HIGH_RISK").length,
                rejectedAtSubmission: p.counts.rejected,
                tag: COMMUNITY_TAG
            };
        });
        return { capability: "AVAILABLE", languages: perLanguage, note: "Quarantine/high-risk counts describe specific flagged content items for this language, not a judgment on the language itself." };
    }

    // -----------------------------------------------------------------
    // 6. COMMUNITY VIEW (spec section 12) — reuses Increment 3 verbatim
    // -----------------------------------------------------------------

    function getCommunityView() {
        const dc = domainCommunity();
        if (!dc) return { capability: "CAPABILITY_UNAVAILABLE", reason: "INCREMENT_3_MODULE_ABSENT" };
        return dc.getCommunityContributionAnalytics();
    }

    // -----------------------------------------------------------------
    // 7. DOMAIN SAFETY (spec section 13) — reuses Increment 3 verbatim
    // -----------------------------------------------------------------

    function getDomainSafetyView() {
        const dc = domainCommunity();
        if (!dc) return { capability: "CAPABILITY_UNAVAILABLE", reason: "INCREMENT_3_MODULE_ABSENT" };
        return dc.getDomainAnalytics();
    }

    // -----------------------------------------------------------------
    // 8. AUTHORIZATION (composed, not reinvented)
    // -----------------------------------------------------------------

    function resolveAuthorization(config) {
        const qa = quarantineAdmin();
        if (!qa) return { role: "ANONYMOUS", userId: null, authBackend: "AUTHORIZATION_BACKEND_UNAVAILABLE" };
        return qa.resolveRole(config);
    }

    // -----------------------------------------------------------------
    // 9. COMBINED VIEW MODEL (spec section 15)
    // -----------------------------------------------------------------

    /**
     * getDashboardViewModel(roleInfo, languageId)
     *   Assembles the full { quarantine, hotspot, safety, languages,
     *   community, rule82, authorization, telemetry } shape from the
     *   real functions above only — no new data invented at this layer.
     */
    function getDashboardViewModel(roleInfo, languageId) {
        const info = roleInfo || resolveAuthorization();
        return {
            quarantine: getQuarantineOverview(info),
            hotspot: getHotspotOverview(),
            safety: getLanguageSafetySummary(),
            languages: languageId ? { requested: getRule82Visibility(languageId) } : { note: "Pass a languageId to include a specific language's Rule 82 visibility here." },
            community: getCommunityView(),
            rule82: languageId ? getRule82Visibility(languageId) : { note: "Pass a languageId to evaluate Rule 82 visibility for a specific language." },
            authorization: info,
            telemetry: { mostUsed: "NOT_AVAILABLE_NO_TELEMETRY", hotspotHistorical: "NOT_AVAILABLE_NO_TELEMETRY" }
        };
    }

    // -----------------------------------------------------------------
    // PUBLIC API
    // -----------------------------------------------------------------

    const api = Object.freeze({
        VERSION,
        getQuarantineOverview,
        getRule82Visibility,
        shareViaHotspot,
        receiveHotspotPayload,
        getHotspotOverview,
        describeHotspotRouting,
        getLanguageSafetySummary,
        getCommunityView,
        getDomainSafetyView,
        resolveAuthorization,
        getDashboardViewModel,
        // Exposed for tests only — real, observed-events ledger, never
        // a fabricated historical store.
        _hotspotLedgerForTests: hotspotLedger
    });

    root.window.CozyOS = root.window.CozyOS || {};
    root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
    root.window.CozyOS.Modules["cozy-admin-language-dashboard-quarantine-hotspot"] = Object.freeze({ version: VERSION, api });
}(typeof window !== "undefined" ? { window } : { window: (global.window = global.window || {}) }));
