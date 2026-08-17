/**
 * core/modules/intelligence/language-packs/admin-dashboard/cozy-admin-language-dashboard-domain-community.js
 * Repair: RP-031-B — Admin Language Dashboard + Usage/Research Analytics
 * Milestone: RP-031-B, Increment 3 (Domain & Community Analytics)
 *
 * OWNERSHIP / COMPOSITION
 *   New, additive, standalone file. Composes — never duplicates:
 *     - window.CozyOS.CozyLanguagePacks (RP-030: listPacks, getPack,
 *       listExpressions, listRegionalContexts, getDashboardSnapshot)
 *     - window.CozyOS.CozyKnowledgeCommunity (RP-029-B: listCommunityRecords —
 *       real reviewState/confirmations/disputes, already pseudonymized)
 *     - window.CozyOS.CozyKnowledgeSafetyGate (RP-029-C Phase 4/5: listQuarantined,
 *       read-only here — counts only, never raw evidence/fields)
 *     - window.CozyOS.CozyKnowledgeQuarantineAdmin (RP-029-C Phase 5:
 *       listQuarantine/analytics — same auth pattern, roleInfo threaded through)
 *     - window.CozyOS.Modules["cozy-admin-language-dashboard-core"]
 *       (Increment 1: getMostUsedSummary — reused verbatim, never recomputed)
 *     - window.CozyOS.Modules["cozy-admin-language-dashboard-term-explorer"]
 *       (Increment 2: getResearchPriority — reused per-language, never
 *       reimplemented; a second scoring engine here would be exactly the
 *       kind of duplicated truth this repository's own conventions forbid)
 *   No storage of its own truth for validation/review/quarantine state.
 *   Every number below is computed fresh, on every call, from real records.
 *
 * NO FABRICATION
 *   - No telemetry/usage engine exists in this repository. "Most-used"
 *     is a verbatim passthrough of Increment 1's own
 *     NOT_AVAILABLE_NO_TELEMETRY — never recalculated, never estimated.
 *   - "Domain" (Agriculture/Education/Health/...) is not a field the
 *     RP-030 expression schema tracks. Every domain bucket below reports
 *     an honest DOMAIN_NOT_TRACKED_BY_REGISTRY status with a real count
 *     of 0 rather than inventing a classifier that would silently sort
 *     real records into domains no one actually assigned.
 *   - Word vs. phrase counts ARE derivable from real stored text (a
 *     record with internal whitespace is a phrase, one token is a word)
 *     — this is a disclosed, honest classification of data that already
 *     exists, not an invented field.
 *   - "Released"/historical "rejected" submission TOTALS are honestly
 *     NOT_AVAILABLE_NO_HISTORICAL_AGGREGATE: the real safety gate
 *     (Phase 4/5) deletes a quarantine entry from its store the moment
 *     it is released/rejected/escalated (confirmed by direct source
 *     read of releaseFromQuarantine()'s own quarantineStore.delete(id))
 *     and no aggregate historical counter exists anywhere in this
 *     repository. This file does not invent one. Currently-quarantined
 *     counts (the store's real present contents) ARE reported.
 *   - Cross-language gap detection only ever reports a gap for a term
 *     actually present in the source and actually absent in the real
 *     target records — and always distinguishes "target language/pack
 *     not registered at all" from "registered but this specific term is
 *     genuinely missing" from "registered, zero data of any kind yet."
 *
 * PRIVACY
 *   Every contributor identifier surfaced by this file is already
 *   pseudonymized by the layer that produced it (RP-029-B's own
 *   pseudonymId()) — this file adds no new raw-identifier exposure and
 *   never reads CozyKnowledgeSafetyGate's raw evidence[].contributorId
 *   or fields (the only two places a raw id could otherwise leak);
 *   quarantine-derived counts here are counts only, never itemized with
 *   raw evidence. Community contribution analytics report only
 *   pseudonymous ids and aggregate counts — never a contributor's full
 *   submission history or any field that could re-identify them beyond
 *   what RP-029-B's own toRecord() already discloses.
 *
 * RULE 82
 *   No mutator of any kind. This file cannot promote a language.
 *
 * DOMAIN_REPORTED_TAG
 *   Every domain-adjacent item this file reports is community-sourced,
 *   per RP-030's own schema (no PROFESSIONAL sourceType path exists for
 *   domain-classified knowledge in this repository yet) — so every
 *   domain-analytics row is tagged
 *   COMMUNITY_REPORTED_NOT_PROFESSIONALLY_VERIFIED, matching the same
 *   tag Increment 2's term explorer already applies per-term.
 */
(function (root) {
    "use strict";

    const VERSION = "0.1.0";

    const COMMUNITY_TAG = "COMMUNITY_REPORTED_NOT_PROFESSIONALLY_VERIFIED";

    const DOMAINS = Object.freeze([
        "Agriculture", "Education", "Health", "Religion", "Business",
        "Culture", "Environment", "Technology", "General"
    ]);

    function cozyOS() {
        return (root.window && root.window.CozyOS) || null;
    }
    function packsApi() {
        const c = cozyOS();
        return c && c.CozyLanguagePacks ? c.CozyLanguagePacks : null;
    }
    function communityApi() {
        const c = cozyOS();
        return c && c.CozyKnowledgeCommunity ? c.CozyKnowledgeCommunity : null;
    }
    function safetyGate() {
        const c = cozyOS();
        return c && c.CozyKnowledgeSafetyGate ? c.CozyKnowledgeSafetyGate : null;
    }
    function quarantineAdmin() {
        const c = cozyOS();
        return c && c.CozyKnowledgeQuarantineAdmin ? c.CozyKnowledgeQuarantineAdmin : null;
    }
    function dashboardCore() {
        const c = cozyOS();
        return c && c.Modules && c.Modules["cozy-admin-language-dashboard-core"]
            ? c.Modules["cozy-admin-language-dashboard-core"].api
            : null;
    }
    function termExplorer() {
        const c = cozyOS();
        return c && c.Modules && c.Modules["cozy-admin-language-dashboard-term-explorer"]
            ? c.Modules["cozy-admin-language-dashboard-term-explorer"].api
            : null;
    }

    function normalize(s) { return String(s || "").trim().toLowerCase(); }

    // -----------------------------------------------------------------
    // 1. LANGUAGE ACTIVITY (spec section 1)
    // -----------------------------------------------------------------

    /**
     * classifyWordOrPhrase(record)
     *   Derived honestly from the real submitted expression text.
     *   Records with no expression text at all (audio-only, oral
     *   language support) are neither — reported as ORAL_ONLY_NO_TEXT,
     *   never guessed at.
     */
    function classifyWordOrPhrase(record) {
        if (!record.expression) return "ORAL_ONLY_NO_TEXT";
        return /\s/.test(record.expression.trim()) ? "PHRASE" : "WORD";
    }

    function averageConfidence(record) {
        const vals = Object.values(record.confidence || {}).filter((v) => typeof v === "number");
        if (vals.length === 0) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
    }

    /**
     * getLanguageActivity(languageId)
     *   One row per real region/dialect context this language has
     *   actually been given evidence for (registerRegionalContext), plus
     *   one "UNASSIGNED" row for real records that carry no region at
     *   all yet. Every count is computed fresh from real expression
     *   records and real RP-029-B community records — nothing invented.
     */
    function getLanguageActivity(languageId) {
        const api = packsApi();
        if (!api) return { capability: "CAPABILITY_UNAVAILABLE", reason: "LANGUAGE_PACK_REGISTRY_ABSENT" };
        const id = normalize(languageId);
        const pack = api.getPack(id);
        if (!pack) return { capability: "AVAILABLE", status: "UNREGISTERED_LANGUAGE" };

        const allRecords = api.listExpressions({ languageId: id });
        const contexts = api.listRegionalContexts(id);
        const commAll = communityApi() ? communityApi().listCommunityRecords({ language: id }) : [];

        function disagreementCount(region, dialect) {
            return commAll.filter((r) => r.communityExtensions && r.communityExtensions.reviewState === "DISPUTED"
                && (!region || r.region === region) && (!dialect || r.dialect === dialect)).length;
        }
        function confirmationCount(region, dialect) {
            return commAll.filter((r) => r.communityExtensions && r.communityExtensions.reviewState === "CONFIRMED"
                && (!region || r.region === region) && (!dialect || r.dialect === dialect)).length;
        }

        function rowFor(country, region, dialect, records) {
            const words = records.filter((r) => classifyWordOrPhrase(r) === "WORD").length;
            const phrases = records.filter((r) => classifyWordOrPhrase(r) === "PHRASE").length;
            const oralOnly = records.filter((r) => classifyWordOrPhrase(r) === "ORAL_ONLY_NO_TEXT").length;
            const knowledgeCandidates = records.filter((r) => r.validationState === "CANDIDATE").length;
            const confAvgs = records.map(averageConfidence).filter((v) => v !== null);
            return {
                language: pack.identity.name,
                languageId: id,
                country: country || null,
                region: region || null,
                community: pack.identity.name, // no separate "community" field is tracked distinct from language/region today
                dialect: dialect || null,
                words,
                phrases,
                oralOnlyNoText: oralOnly,
                knowledgeCandidates,
                confirmations: confirmationCount(region, dialect),
                disagreements: disagreementCount(region, dialect),
                confidence: confAvgs.length > 0
                    ? { average: confAvgs.reduce((a, b) => a + b, 0) / confAvgs.length, sampleSize: confAvgs.length }
                    : { average: null, sampleSize: 0, note: "NO_CONFIDENCE_EVIDENCE_RECORDED" },
                tag: COMMUNITY_TAG
            };
        }

        const rows = contexts.map((ctx) => {
            const records = allRecords.filter((r) => (!ctx.region || r.region === ctx.region) && (!ctx.dialect || r.dialect === ctx.dialect));
            return rowFor(ctx.country, ctx.region, ctx.dialect, records);
        });

        const unassigned = allRecords.filter((r) => !r.region && !r.dialect);
        if (unassigned.length > 0 || rows.length === 0) {
            rows.push(rowFor(null, null, null, unassigned.length > 0 ? unassigned : allRecords.length === 0 ? [] : allRecords.filter((r) => !contexts.some((c) => c.region === r.region && c.dialect === r.dialect))));
        }

        const te = termExplorer();
        const researchPriority = te ? te.getResearchPriority(id) : { capability: "CAPABILITY_UNAVAILABLE", reason: "TERM_EXPLORER_ABSENT" };

        return { capability: "AVAILABLE", languageId: id, rows, researchPriority };
    }

    function listLanguageActivity() {
        const api = packsApi();
        if (!api) return { capability: "CAPABILITY_UNAVAILABLE", reason: "LANGUAGE_PACK_REGISTRY_ABSENT" };
        return { capability: "AVAILABLE", languages: api.listPacks().map((p) => getLanguageActivity(p.identity.languageId)) };
    }

    // -----------------------------------------------------------------
    // 2. DOMAIN ANALYTICS (spec section 2)
    // -----------------------------------------------------------------

    /**
     * getDomainAnalytics()
     *   Honest by construction: RP-030's expression schema has no domain
     *   field, so every domain bucket reports a real 0 with an explicit
     *   DOMAIN_NOT_TRACKED_BY_REGISTRY status rather than a fabricated
     *   classification. totalUnclassifiedExpressions is the one real
     *   number available today — every real record, unclassified by
     *   domain, tagged per the community-vs-professional convention.
     */
    function getDomainAnalytics() {
        const api = packsApi();
        if (!api) return { capability: "CAPABILITY_UNAVAILABLE", reason: "LANGUAGE_PACK_REGISTRY_ABSENT" };
        const allRecords = api.listPacks().reduce((acc, p) => acc.concat(api.listExpressions({ languageId: p.identity.languageId })), []);
        const domains = DOMAINS.map((name) => ({
            domain: name,
            count: 0,
            status: "DOMAIN_NOT_TRACKED_BY_REGISTRY",
            tag: COMMUNITY_TAG
        }));
        return {
            capability: "AVAILABLE",
            domains,
            totalUnclassifiedExpressions: allRecords.length,
            note: "No domain field exists on RP-030 expression records today. Every domain count is honestly 0 rather than inferred from text. This structure is ready to populate the moment a real domain field/classification path exists."
        };
    }

    // -----------------------------------------------------------------
    // 3. COMMUNITY CONTRIBUTION ANALYTICS (spec section 3)
    // -----------------------------------------------------------------

    /**
     * getCommunityContributionAnalytics()
     *   Contributors are counted as distinct pseudonymous ids only
     *   (RP-029-B's own pseudonymId(), already applied before this file
     *   ever sees the data) — never raw identity. "Released"/historical
     *   "rejected" totals are honestly reported as unavailable (see file
     *   header) rather than derived from a store that has already
     *   deleted the evidence.
     */
    function getCommunityContributionAnalytics() {
        const community = communityApi();
        const api = packsApi();
        const gate = safetyGate();
        if (!community || !api) {
            return { capability: "CAPABILITY_UNAVAILABLE", reason: "COMMUNITY_OR_REGISTRY_ABSENT" };
        }
        const records = community.listCommunityRecords({});
        const contributorIds = new Set();
        records.forEach((r) => {
            const ext = r.communityExtensions || {};
            (ext.reviewHistory || []).forEach((h) => { if (h.contributorPseudId) contributorIds.add(h.contributorPseudId); });
            (ext.confirmations || []).forEach((c) => { if (c.contributorPseudId) contributorIds.add(c.contributorPseudId); });
        });

        const byState = {};
        records.forEach((r) => {
            const st = (r.communityExtensions && r.communityExtensions.reviewState) || "UNKNOWN";
            byState[st] = (byState[st] || 0) + 1;
        });

        const safetyRejectedAtSubmission = api.listPacks().reduce((sum, p) => sum + (p.counts.rejected || 0), 0);
        const currentlyQuarantined = gate ? gate.listQuarantined().length : "CAPABILITY_UNAVAILABLE_SAFETY_GATE_ABSENT";

        return {
            capability: "AVAILABLE",
            contributors: contributorIds.size,
            submissions: records.length,
            confirmedCandidates: byState.CONFIRMED || 0,
            disputedCandidates: byState.DISPUTED || 0,
            clarificationRequests: byState.UNRESOLVED || 0,
            quarantinedSubmissions: currentlyQuarantined,
            releasedSubmissions: "NOT_AVAILABLE_NO_HISTORICAL_AGGREGATE",
            rejectedSubmissions: {
                atSafetyGateOnSubmission: safetyRejectedAtSubmission,
                atCommunityReview: byState.REJECTED || 0,
                afterQuarantineReview: "NOT_AVAILABLE_NO_HISTORICAL_AGGREGATE"
            },
            byReviewState: byState,
            note: "Contributor counts are distinct pseudonymous identifiers only (RP-029-B pseudonymId), never raw identity. Released/post-quarantine-rejected totals are honestly unavailable: the real safety gate deletes a quarantine entry from its store upon release/reject/escalate and no historical aggregate counter exists anywhere in this repository."
        };
    }

    /**
     * redactQuarantineItem(item)
     *   RP-029-C Phase 5's own listQuarantine() spreads its underlying
     *   quarantine-store entry verbatim (confirmed by direct source
     *   read), which still carries raw evidence[].contributorId and the
     *   raw submitted `fields` — the same two leak points Increment 2's
     *   getQuarantineSummary() already deliberately omits. This file
     *   does not touch or weaken cozy-knowledge-quarantine-admin-core.js
     *   itself (a locked, existing safety surface); it redacts on this
     *   layer's own way out instead, the same boundary Increment 2 drew.
     */
    function redactQuarantineItem(item) {
        if (!item) return item;
        const clean = Object.assign({}, item);
        delete clean.fields;
        delete clean.evidence;
        clean.evidenceCount = Array.isArray(item.evidence) ? item.evidence.length : 0;
        return clean;
    }

    /**
     * getQuarantineIntegration(roleInfo)
     *   Composes RP-029-C Phase 5's real, authorization-guarded
     *   quarantine-admin layer exactly as its own dashboard would —
     *   this file adds no second authorization system and never
     *   bypasses REVIEWER+-only access to itemized quarantine content.
     *   Without a valid authorized roleInfo this returns the same
     *   UNAUTHORIZED/AUTHORIZATION_BACKEND_UNAVAILABLE result the real
     *   layer itself returns — never a fabricated partial view. Every
     *   item returned is redacted (see redactQuarantineItem) before it
     *   ever leaves this function, regardless of what the underlying
     *   layer included.
     */
    function getQuarantineIntegration(roleInfo) {
        const qa = quarantineAdmin();
        if (!qa) return { capability: "CAPABILITY_UNAVAILABLE", reason: "QUARANTINE_ADMIN_ABSENT" };
        const info = roleInfo || qa.resolveRole();
        const rawListing = qa.listQuarantine(info, {});
        const listing = rawListing && rawListing.status === "OK"
            ? Object.assign({}, rawListing, { items: rawListing.items.map(redactQuarantineItem) })
            : rawListing;
        const stats = qa.analytics(info);
        return { capability: "AVAILABLE", listing, stats };
    }

    // -----------------------------------------------------------------
    // 4. REGIONAL KNOWLEDGE MAP (spec section 4)
    // -----------------------------------------------------------------

    /**
     * getRegionalKnowledgeMap()
     *   Country -> region -> { languages: [{languageId, dialect,
     *   vocabulary, researchPriority}] }, built only from real
     *   registerRegionalContext() calls already recorded across every
     *   registered pack. A country/region with zero real contexts
     *   registered simply does not appear — never a placeholder entry
     *   for an unregistered region.
     */
    function getRegionalKnowledgeMap() {
        const api = packsApi();
        if (!api) return { capability: "CAPABILITY_UNAVAILABLE", reason: "LANGUAGE_PACK_REGISTRY_ABSENT" };
        const tree = {};
        api.listPacks().forEach((p) => {
            const id = p.identity.languageId;
            api.listRegionalContexts(id).forEach((ctx) => {
                if (!ctx.country) return;
                tree[ctx.country] = tree[ctx.country] || {};
                const regionKey = ctx.region || "UNSPECIFIED_REGION";
                tree[ctx.country][regionKey] = tree[ctx.country][regionKey] || { languages: [] };
                const vocabulary = api.listExpressions({ languageId: id, region: ctx.region, dialect: ctx.dialect }).length;
                tree[ctx.country][regionKey].languages.push({
                    languageId: id,
                    name: p.identity.name,
                    dialect: ctx.dialect || null,
                    vocabulary,
                    tag: COMMUNITY_TAG
                });
            });
        });
        return { capability: "AVAILABLE", tree };
    }

    // -----------------------------------------------------------------
    // 5. MOST-USED — verbatim passthrough of Increment 1 (spec section 5)
    // -----------------------------------------------------------------

    function getMostUsedSummary() {
        const core = dashboardCore();
        if (!core) return { capability: "CAPABILITY_UNAVAILABLE", reason: "DASHBOARD_CORE_ABSENT" };
        return core.getMostUsedSummary();
    }

    // -----------------------------------------------------------------
    // 6. RESEARCH DASHBOARD (spec section 6)
    //    Aggregates Increment 2's own getResearchPriority() per language
    //    — never a second scoring engine.
    // -----------------------------------------------------------------

    function getResearchDashboard() {
        const api = packsApi();
        const te = termExplorer();
        if (!api || !te) return { capability: "CAPABILITY_UNAVAILABLE", reason: "REGISTRY_OR_TERM_EXPLORER_ABSENT" };

        const perLanguage = api.listPacks().map((p) => te.getResearchPriority(p.identity.languageId));
        const tally = { LOW: 0, MEDIUM: 0, HIGH: 0, URGENT_REVIEW: 0 };
        perLanguage.forEach((lp) => {
            if (lp.capability !== "AVAILABLE" || !lp.terms) return;
            lp.terms.forEach((t) => { tally[t.priority] = (tally[t.priority] || 0) + 1; });
            if (lp.reviewBacklog && lp.reviewBacklog.backlogPriority) {
                tally[lp.reviewBacklog.backlogPriority] = (tally[lp.reviewBacklog.backlogPriority] || 0) + 1;
            }
        });

        // Flatten every term across every language, ranked highest-first,
        // real scores only — no re-derived weighting beyond Increment 2's own.
        const allTerms = [];
        perLanguage.forEach((lp) => {
            if (lp.capability !== "AVAILABLE" || !lp.terms) return;
            lp.terms.forEach((t) => allTerms.push(Object.assign({ languageId: lp.languageId }, t)));
        });
        allTerms.sort((a, b) => b.score - a.score);

        return {
            capability: "AVAILABLE",
            tallyByPriority: tally,
            topTerms: allTerms,
            perLanguage,
            note: "Every ranking here is Increment 2's own getResearchPriority() output, aggregated — not recomputed. No usage/demand signal is included because no telemetry engine exists."
        };
    }

    // -----------------------------------------------------------------
    // 7. CROSS-LANGUAGE KNOWLEDGE GAPS (spec section 7)
    // -----------------------------------------------------------------

    /**
     * detectCrossLanguageGap({ sourceLanguageId, sourceRegion, sourceDialect,
     *                           targetLanguageId, targetRegion, targetDialect })
     *   Compares real meaning-keyed expression sets between a source and
     *   a target language/region. Always distinguishes:
     *     LANGUAGE_NOT_SUPPORTED     — target languageId is not even a
     *                                  registered pack.
     *     LANGUAGE_REGISTERED_NO_DATA — target pack exists but has zero
     *                                  expression records anywhere yet
     *                                  (region-scoped or not) — this is
     *                                  a data gap, not a support gap.
     *     GAPS_FOUND / NO_GAPS_FOUND_IN_SAMPLE — real per-term comparison
     *                                  over whatever records exist today.
     *   Comparison key is the real `meaning` field (normalized) — the
     *   only cross-language semantic anchor RP-030 actually stores.
     *   Records with no meaning recorded are excluded from comparison
     *   (there is nothing real to match them on) rather than guessed.
     */
    function detectCrossLanguageGap(params) {
        const api = packsApi();
        if (!api) return { capability: "CAPABILITY_UNAVAILABLE", reason: "LANGUAGE_PACK_REGISTRY_ABSENT" };
        const p = params || {};
        const sourceId = normalize(p.sourceLanguageId);
        const targetId = normalize(p.targetLanguageId);

        const sourcePack = api.getPack(sourceId);
        const targetPack = api.getPack(targetId);
        if (!sourcePack) return { capability: "AVAILABLE", status: "SOURCE_LANGUAGE_NOT_SUPPORTED" };
        if (!targetPack) return { capability: "AVAILABLE", status: "LANGUAGE_NOT_SUPPORTED", languageId: targetId };

        const targetAllRecords = api.listExpressions({ languageId: targetId });
        if (targetAllRecords.length === 0) {
            return { capability: "AVAILABLE", status: "LANGUAGE_REGISTERED_NO_DATA", languageId: targetId };
        }

        const sourceRecords = api.listExpressions({ languageId: sourceId, region: p.sourceRegion, dialect: p.sourceDialect })
            .filter((r) => !!r.meaning);
        const targetRecords = api.listExpressions({ languageId: targetId, region: p.targetRegion, dialect: p.targetDialect })
            .filter((r) => !!r.meaning);

        const targetMeanings = new Set(targetRecords.map((r) => normalize(r.meaning)));
        const gaps = sourceRecords
            .filter((r) => !targetMeanings.has(normalize(r.meaning)))
            .map((r) => ({ meaning: r.meaning, knownExpression: r.expression, sourceRecordId: r.recordId }));

        return {
            capability: "AVAILABLE",
            status: gaps.length > 0 ? "GAPS_FOUND" : "NO_GAPS_FOUND_IN_SAMPLE",
            source: { languageId: sourceId, region: p.sourceRegion || null, dialect: p.sourceDialect || null, comparableRecordCount: sourceRecords.length },
            target: { languageId: targetId, region: p.targetRegion || null, dialect: p.targetDialect || null, comparableRecordCount: targetRecords.length },
            gaps,
            note: "Comparison is over real, currently-submitted records with a real meaning field only — not exhaustive vocabulary coverage. A NO_GAPS_FOUND_IN_SAMPLE result reflects the current sample, not a claim of complete parity."
        };
    }

    // -----------------------------------------------------------------
    // PUBLIC API
    // -----------------------------------------------------------------

    const api = Object.freeze({
        VERSION,
        DOMAINS,
        getLanguageActivity,
        listLanguageActivity,
        getDomainAnalytics,
        getCommunityContributionAnalytics,
        getQuarantineIntegration,
        getRegionalKnowledgeMap,
        getMostUsedSummary,
        getResearchDashboard,
        detectCrossLanguageGap
    });

    root.window.CozyOS = root.window.CozyOS || {};
    root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
    root.window.CozyOS.Modules["cozy-admin-language-dashboard-domain-community"] = Object.freeze({ version: VERSION, api });
}(typeof window !== "undefined" ? { window } : { window: (global.window = global.window || {}) }));
