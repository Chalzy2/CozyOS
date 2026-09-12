/**
 * core/modules/intelligence/language-packs/admin-dashboard/cozy-admin-language-dashboard-term-explorer.js
 * Repair: RP-031-B — Admin Language Dashboard + Usage/Research Analytics
 * Milestone: RP-031-B, Increment 2 (Term Explorer + Research Priority Engine)
 *
 * OWNERSHIP / COMPOSITION
 *   New, additive file. Composes — never duplicates:
 *     - window.CozyOS.CozyLanguagePacks (RP-030: listPacks, listExpressions,
 *       getExpression, detectLanguagePack)
 *     - window.CozyOS.CozyKnowledgeSafetyGate (RP-029-C: listQuarantined) —
 *       read-only, never mutated here
 *     - window.CozyOS.Modules["cozy-admin-language-dashboard-core"]
 *       (RP-031-B Increment 1: resolveLanguagePackRouting) for
 *       language-aware routing, so routing logic is written exactly once.
 *   No storage of its own truth. Search and priority are both computed
 *   fresh from real records on every call — nothing cached or invented.
 *
 * NO FABRICATION
 *   - Search never returns a result the underlying registry doesn't hold.
 *   - "domain" is not a field the RP-030 expression schema tracks today;
 *     if a caller filters by domain this file says so honestly
 *     (DOMAIN_NOT_TRACKED_BY_REGISTRY) rather than silently dropping or
 *     silently ignoring the filter.
 *   - "translation" text is likewise not stored by RP-030 (only a
 *     translationConfidence score) — reported honestly per term.
 *   - Research priority is computed only from real, counted evidence
 *     (confidence scores, quarantine/rejection counts, licensing
 *     problems, missing-field counts). No usage/demand signal is used
 *     because no telemetry engine exists — that dimension is always
 *     reported as NOT_AVAILABLE_NO_TELEMETRY, never estimated.
 */
(function (root) {
    "use strict";

    const VERSION = "0.1.0";

    function cozyOS() {
        return (root.window && root.window.CozyOS) || null;
    }
    function packsApi() {
        const c = cozyOS();
        return c && c.CozyLanguagePacks ? c.CozyLanguagePacks : null;
    }
    function safetyGate() {
        const c = cozyOS();
        return c && c.CozyKnowledgeSafetyGate ? c.CozyKnowledgeSafetyGate : null;
    }
    function dashboardCore() {
        const c = cozyOS();
        return c && c.Modules && c.Modules["cozy-admin-language-dashboard-core"]
            ? c.Modules["cozy-admin-language-dashboard-core"].api
            : null;
    }

    // -----------------------------------------------------------------
    // 1. TERM EXPLORER
    // -----------------------------------------------------------------

    function normalize(s) {
        return String(s || "").trim().toLowerCase();
    }

    /**
     * classifyMatch(query, record)
     *   Compares the query against the record's real expression + meaning
     *   text only (the only text fields RP-030 actually stores). Returns
     *   the single best match type found; never returns a type not
     *   justified by an actual substring/equality check.
     */
    function classifyMatch(query, record) {
        const q = normalize(query);
        const fields = [record.expression, record.meaning, record.literalMeaning].filter(Boolean).map(normalize);
        if (fields.some((f) => f === q)) return "EXACT_MATCH";
        if (fields.some((f) => f.indexOf(q) === 0)) return "PREFIX_MATCH";
        if (fields.some((f) => f.indexOf(q) !== -1)) return "RELATED_MATCH";
        return "NO_MATCH";
    }

    /**
     * describeCommunityVsProfessional(record)
     *   Derived strictly from the record's real provenanceLog sourceType
     *   entries. Community-sourced knowledge is never upgraded to
     *   professional status by this file — only an actual PROFESSIONAL
     *   sourceType entry in the log (written elsewhere, by a real
     *   professional-evidence contribution path) can do that, and even
     *   then only if validationState is VALIDATED.
     */
    function describeCommunityVsProfessional(record) {
        const sourceTypes = (record.provenanceLog || []).map((p) => p.sourceType);
        const hasProfessional = sourceTypes.indexOf("PROFESSIONAL") !== -1;
        if (hasProfessional && record.validationState === "VALIDATED") {
            return "PROFESSIONALLY_VERIFIED";
        }
        return "COMMUNITY_REPORTED_NOT_PROFESSIONALLY_VERIFIED";
    }

    function toTermRow(record, matchType) {
        return {
            recordId: record.recordId,
            languageId: record.languageId,
            region: record.region,
            dialect: record.dialect,
            word: record.expression,
            meaning: record.meaning,
            literalMeaning: record.literalMeaning,
            context: record.context,
            translation: {
                text: "NOT_TRACKED_BY_REGISTRY",
                confidence: record.confidence.translationConfidence
            },
            pronunciation: {
                audioReference: record.audioReference,
                confidence: record.confidence.pronunciationConfidence
            },
            confidence: record.confidence,
            validationState: record.validationState,
            evidenceCount: record.evidenceCount,
            licensing: record.licensing,
            provenance: record.provenanceLog,
            communityVsProfessional: describeCommunityVsProfessional(record),
            safetyStatus: "SAFE",
            safetyNote: "Only records that passed RP-029-C's safety gate become searchable expression records; quarantined/rejected material is tracked separately (see getQuarantineSummary).",
            matchType
        };
    }

    /**
     * searchTerms({ query, languageId, region, dialect, domain })
     *   query is required — this is a search function, not a browse
     *   listing (browsing all knowledge belongs to the Language Overview
     *   view, not here).
     */
    function searchTerms(params) {
        const api = packsApi();
        if (!api) {
            return { capability: "CAPABILITY_UNAVAILABLE", reason: "LANGUAGE_PACK_REGISTRY_ABSENT" };
        }
        const p = params || {};
        if (!p.query || !normalize(p.query)) {
            return { status: "QUERY_REQUIRED" };
        }

        let domainNote = null;
        if (p.domain) {
            domainNote = "DOMAIN_NOT_TRACKED_BY_REGISTRY — filter not applied; RP-030 expression records carry no domain field today.";
        }

        const languageIds = p.languageId ? [normalize(p.languageId)] : api.listPacks().map((pk) => pk.identity.languageId);

        const rows = [];
        languageIds.forEach((languageId) => {
            const records = api.listExpressions({ languageId, region: p.region, dialect: p.dialect });
            records.forEach((record) => {
                const matchType = classifyMatch(p.query, record);
                if (matchType !== "NO_MATCH") {
                    rows.push(toTermRow(record, matchType));
                }
            });
        });

        // Best match type first: EXACT, then PREFIX, then RELATED.
        const rank = { EXACT_MATCH: 0, PREFIX_MATCH: 1, RELATED_MATCH: 2 };
        rows.sort((a, b) => rank[a.matchType] - rank[b.matchType]);

        return {
            capability: "AVAILABLE",
            status: rows.length > 0 ? "MATCHES_FOUND" : "NO_MATCH",
            query: p.query,
            domainNote,
            results: rows
        };
    }

    function getTermDetail(languageId, recordId) {
        const api = packsApi();
        if (!api) {
            return { capability: "CAPABILITY_UNAVAILABLE", reason: "LANGUAGE_PACK_REGISTRY_ABSENT" };
        }
        const record = api.getExpression(recordId);
        if (!record || record.languageId !== normalize(languageId)) {
            return { capability: "AVAILABLE", status: "NOT_FOUND" };
        }
        return { capability: "AVAILABLE", status: "FOUND", term: toTermRow(record, "DIRECT_LOOKUP") };
    }

    // -----------------------------------------------------------------
    // 2. LANGUAGE-AWARE ROUTED SEARCH
    //    Composes Increment 1's resolveLanguagePackRouting() exactly —
    //    routing logic lives in one place only.
    // -----------------------------------------------------------------

    function routeAndSearchTerms(evidence, candidateLanguageIds, query) {
        const core = dashboardCore();
        if (!core) {
            return { capability: "CAPABILITY_UNAVAILABLE", reason: "DASHBOARD_CORE_ABSENT" };
        }
        const routing = core.resolveLanguagePackRouting(evidence, candidateLanguageIds);
        if (routing.capability !== "AVAILABLE") return routing;
        if (routing.status === "LANGUAGE_UNCERTAIN" || routing.status === "AMBIGUOUS_LANGUAGE") {
            return routing; // never silently choose a language
        }
        // status === "RESOLVED"
        const search = searchTerms({
            query,
            languageId: routing.match.languageId,
            region: routing.match.region,
            dialect: routing.match.dialect
        });
        return Object.assign({ routing }, search);
    }

    // -----------------------------------------------------------------
    // 3. QUARANTINE / SAFETY VISIBILITY (supports research priority)
    // -----------------------------------------------------------------

    function getQuarantineSummary(languageId) {
        const gate = safetyGate();
        if (!gate) {
            return { capability: "CAPABILITY_UNAVAILABLE", reason: "SAFETY_GATE_ABSENT" };
        }
        const all = gate.listQuarantined();
        const filtered = languageId ? all.filter((e) => normalize(e.language) === normalize(languageId)) : all;
        return {
            capability: "AVAILABLE",
            count: filtered.length,
            items: filtered.map((e) => ({
                id: e.id,
                at: e.at,
                category: e.category,
                classification: e.classification,
                language: e.language,
                reviewed: e.reviewed
                // deliberately omit `fields` (raw submitted content) from this summary view
            }))
        };
    }

    // -----------------------------------------------------------------
    // 4. RESEARCH PRIORITY ENGINE
    //    Computed only from real, counted evidence. No usage/demand
    //    signal is available in this repository (no telemetry engine),
    //    so that dimension is always reported as unavailable rather
    //    than estimated.
    // -----------------------------------------------------------------

    function averageKnownConfidence(record) {
        const vals = Object.values(record.confidence || {}).filter((v) => typeof v === "number");
        if (vals.length === 0) return null; // no confidence evidence at all — distinct from "low confidence"
        return vals.reduce((a, b) => a + b, 0) / vals.length;
    }

    /**
     * scoreRecord(record)
     *   Every point on this score is traceable to a real field on the
     *   record — no synthetic weighting beyond simple, disclosed sums.
     */
    function scoreRecord(record) {
        let score = 0;
        const reasons = [];

        const avgConf = averageKnownConfidence(record);
        if (avgConf === null) {
            score += 2;
            reasons.push("NO_CONFIDENCE_EVIDENCE_RECORDED");
        } else if (avgConf < 0.4) {
            score += 2;
            reasons.push("LOW_CONFIDENCE");
        } else if (avgConf < 0.7) {
            score += 1;
            reasons.push("MEDIUM_CONFIDENCE");
        }

        if (!record.meaning) {
            score += 2;
            reasons.push("MISSING_MEANING");
        }
        if (record.confidence.translationConfidence == null) {
            score += 1;
            reasons.push("MISSING_TRANSLATION_EVIDENCE");
        }
        if (record.confidence.pronunciationConfidence == null) {
            score += 1;
            reasons.push("MISSING_PRONUNCIATION_EVIDENCE");
        }
        if (record.licensing === "LICENSE_UNKNOWN") {
            score += 1;
            reasons.push("LICENSING_UNKNOWN");
        }
        if (record.evidenceCount === 1) {
            score += 1;
            reasons.push("SINGLE_UNCONFIRMED_SOURCE");
        }

        return { score, reasons };
    }

    function classifyPriority(score) {
        if (score >= 6) return "URGENT_REVIEW";
        if (score >= 4) return "HIGH";
        if (score >= 2) return "MEDIUM";
        return "LOW";
    }

    /**
     * getResearchPriority(languageId)
     *   Ranks that language's real expression records by disclosed score.
     *   Also folds in the language's quarantine/rejection backlog as a
     *   language-level (not per-term) urgency signal.
     */
    function getResearchPriority(languageId) {
        const api = packsApi();
        if (!api) {
            return { capability: "CAPABILITY_UNAVAILABLE", reason: "LANGUAGE_PACK_REGISTRY_ABSENT" };
        }
        const id = normalize(languageId);
        const pack = api.getPack(id);
        if (!pack) {
            return { capability: "AVAILABLE", status: "UNREGISTERED_LANGUAGE" };
        }
        const records = api.listExpressions({ languageId: id });
        const items = records.map((r) => {
            const { score, reasons } = scoreRecord(r);
            return {
                recordId: r.recordId,
                expression: r.expression,
                meaning: r.meaning,
                score,
                priority: classifyPriority(score),
                reasons
            };
        }).sort((a, b) => b.score - a.score);

        const quarantine = getQuarantineSummary(id);
        const backlogCount = pack.counts.quarantined + pack.counts.rejected;

        return {
            capability: "AVAILABLE",
            languageId: id,
            usageEvidence: "NOT_AVAILABLE_NO_TELEMETRY",
            communityRequestEvidence: "NOT_AVAILABLE_NO_TELEMETRY",
            reviewBacklog: {
                quarantined: pack.counts.quarantined,
                rejected: pack.counts.rejected,
                backlogPriority: backlogCount >= 5 ? "URGENT_REVIEW" : backlogCount > 0 ? "HIGH" : "LOW"
            },
            terms: items,
            note: "Priority is derived only from real confidence/completeness/backlog evidence already recorded. No usage or demand statistic is estimated because no telemetry engine exists in this repository."
        };
    }

    // -----------------------------------------------------------------
    // PUBLIC API
    // -----------------------------------------------------------------

    const api = Object.freeze({
        VERSION,
        searchTerms,
        getTermDetail,
        routeAndSearchTerms,
        getQuarantineSummary,
        getResearchPriority
    });

    root.window.CozyOS = root.window.CozyOS || {};
    root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
    root.window.CozyOS.Modules["cozy-admin-language-dashboard-term-explorer"] = Object.freeze({ version: VERSION, api });
}(typeof window !== "undefined" ? { window } : { window: (global.window = global.window || {}) }));
