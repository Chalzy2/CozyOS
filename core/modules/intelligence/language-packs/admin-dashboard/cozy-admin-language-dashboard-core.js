/**
 * core/modules/intelligence/language-packs/admin-dashboard/cozy-admin-language-dashboard-core.js
 * Repair: RP-031-B — Admin Language Dashboard + Usage/Research Analytics
 * Milestone: RP-031-B, Increment 1 (Language Overview + Pack Routing + Most-Used passthrough)
 *
 * OWNERSHIP / COMPOSITION
 *   This file is new and additive. It composes — never duplicates — the
 *   real, frozen public API at window.CozyOS.CozyLanguagePacks (RP-030,
 *   cozy-language-pack-registry.js). It adds no storage of its own truth
 *   for validation state, pack status, or geography; it only reshapes
 *   what RP-030 already reports for admin consumption.
 *
 * RULE 82
 *   This file has no mutator. It cannot promote a language and never
 *   claims one is AVAILABLE beyond what RP-030's own pack.status says.
 *
 * NO FABRICATION
 *   - mostUsed is passed through verbatim from RP-030
 *     (NOT_AVAILABLE_NO_TELEMETRY) — never recalculated or invented here.
 *   - detectLanguagePack() calls are passed through verbatim; this file
 *     adds an AMBIGUOUS_LANGUAGE classification only when the CALLER
 *     supplies more than one literal candidate languageId to resolve
 *     against (e.g. an admin doing manual disambiguation) — it never
 *     invents ambiguity or resolves it automatically.
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

    // -----------------------------------------------------------------
    // 1. LANGUAGE OVERVIEW (spec section 1 / RP-031-B section 1)
    // -----------------------------------------------------------------

    /**
     * getLanguageOverview()
     *   Reshapes RP-030's getDashboardSnapshot() into the admin overview
     *   shape: one row per registered language, with geography resolved
     *   via listRegionalContexts() (country -> region -> dialect), and
     *   an explicit displayStatus that never says "Supported" for a
     *   pack that is only REGISTERED/NOT_READY.
     */
    function getLanguageOverview() {
        const api = packsApi();
        if (!api) {
            return { capability: "CAPABILITY_UNAVAILABLE", reason: "LANGUAGE_PACK_REGISTRY_ABSENT", languages: [] };
        }
        const snapshot = api.getDashboardSnapshot();
        const languages = snapshot.packs.map((row) => {
            const contexts = api.listRegionalContexts(row.languageId);
            return {
                languageId: row.languageId,
                name: row.name,
                packStatus: row.status,          // REGISTERED / (future states from RP-030)
                resourceState: row.resourceState, // NOT_READY / etc — RP-030 owned
                displayStatus: describeStatus(row.status, row.resourceState),
                geography: {
                    countries: uniqueFrom(contexts, "country"),
                    regions: uniqueFrom(contexts, "region"),
                    dialects: uniqueFrom(contexts, "dialect"),
                    fullContexts: contexts // country/region/dialect triples, as RP-030 recorded them
                },
                knowledge: {
                    submitted: row.submitted,
                    validated: row.validated,
                    quarantined: row.quarantined,
                    rejected: row.rejected,
                    licensingProblems: row.licensingProblems
                },
                mostUsed: row.mostUsed // pass-through, e.g. "NOT_AVAILABLE_NO_TELEMETRY"
            };
        });
        return {
            capability: "AVAILABLE",
            languages,
            note: snapshot.note
        };
    }

    /**
     * describeStatus(packStatus, resourceState)
     *   Rule 82 guard, spelled out in the UI copy itself: never returns
     *   "Supported" for a pack that is merely registered. This function
     *   has no access to a promotion mutator, so it cannot drift from
     *   RP-030's real status even if someone edits this string table.
     */
    function describeStatus(packStatus, resourceState) {
        if (packStatus !== "REGISTERED" && packStatus !== "AVAILABLE") {
            return "Unrecognized pack state: " + String(packStatus);
        }
        if (packStatus === "AVAILABLE") {
            return "Available";
        }
        // packStatus === "REGISTERED" — the only state RP-030 currently issues.
        if (resourceState === "NOT_READY") {
            return "Recognized / knowledge limited";
        }
        return "Recognized / " + String(resourceState).toLowerCase();
    }

    function uniqueFrom(contexts, field) {
        const seen = new Set();
        contexts.forEach((c) => {
            if (c[field]) seen.add(c[field]);
        });
        return Array.from(seen);
    }

    // -----------------------------------------------------------------
    // 2. LANGUAGE PACK ROUTING VIEW (spec section 2)
    // -----------------------------------------------------------------

    /**
     * resolveLanguagePackRouting(evidence, candidateLanguageIds)
     *   Default path: single candidate -> passes straight through to
     *   RP-030's real detectLanguagePack(), unmodified.
     *   Disambiguation path: caller supplies 2+ literal candidate
     *   languageIds it wants checked against the SAME evidence (e.g. an
     *   admin manually comparing "could this be Kikuyu or Kikamba?").
     *   This file never invents which candidates to compare — it only
     *   reports AMBIGUOUS_LANGUAGE when the caller-supplied set yields
     *   more than one real match from RP-030.
     */
    function resolveLanguagePackRouting(evidence, candidateLanguageIds) {
        const api = packsApi();
        if (!api) {
            return { capability: "CAPABILITY_UNAVAILABLE", reason: "LANGUAGE_PACK_REGISTRY_ABSENT" };
        }
        const candidates = Array.isArray(candidateLanguageIds) && candidateLanguageIds.length > 0
            ? candidateLanguageIds
            : [(evidence && evidence.languageId) || null];

        const results = candidates
            .filter((id) => id != null)
            .map((id) => api.detectLanguagePack(Object.assign({}, evidence, { languageId: id })));

        const matches = results.filter((r) => r.matched);

        if (matches.length === 0) {
            return {
                capability: "AVAILABLE",
                status: "LANGUAGE_UNCERTAIN",
                reason: results[0] ? results[0].reason : "NO_LANGUAGE_EVIDENCE_OR_UNREGISTERED",
                candidatesChecked: results
            };
        }
        if (matches.length > 1) {
            return {
                capability: "AVAILABLE",
                status: "AMBIGUOUS_LANGUAGE",
                candidates: matches,
                note: "Multiple candidate language packs matched the same evidence. Requires clarification; no automatic selection is made."
            };
        }
        return {
            capability: "AVAILABLE",
            status: "RESOLVED",
            match: matches[0]
        };
    }

    // -----------------------------------------------------------------
    // 3. MOST USED — passthrough only (spec section 3)
    // -----------------------------------------------------------------

    /**
     * getMostUsedSummary()
     *   No telemetry engine exists in this repository. This function
     *   never calculates or invents usage numbers; it reports RP-030's
     *   own submitted/validated counts (real, counted) as
     *   "mostSubmitted"/"mostValidated" and explicitly labels true
     *   usage-based ranking as unavailable.
     */
    function getMostUsedSummary() {
        const api = packsApi();
        if (!api) {
            return { capability: "CAPABILITY_UNAVAILABLE", reason: "LANGUAGE_PACK_REGISTRY_ABSENT" };
        }
        const snapshot = api.getDashboardSnapshot();
        return {
            capability: "AVAILABLE",
            mostUsedWords: "NOT_AVAILABLE_NO_TELEMETRY",
            mostUsedPhrases: "NOT_AVAILABLE_NO_TELEMETRY",
            mostSubmitted: snapshot.mostSubmitted,
            mostValidated: snapshot.mostValidated,
            note: snapshot.note
        };
    }

    // -----------------------------------------------------------------
    // PUBLIC API
    // -----------------------------------------------------------------

    const api = Object.freeze({
        VERSION,
        getLanguageOverview,
        resolveLanguagePackRouting,
        getMostUsedSummary
    });

    root.window.CozyOS = root.window.CozyOS || {};
    root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
    root.window.CozyOS.Modules["cozy-admin-language-dashboard-core"] = Object.freeze({ version: VERSION, api });
}(typeof window !== "undefined" ? { window } : { window: (global.window = global.window || {}) }));
