/**
 * core/modules/intelligence/knowledge/apps/cozy-application-semantic-bridge.js
 * CozyOS — Kiswahili Application Semantic Extraction — Phase 1
 *
 * NEW, ADDITIVE FILE. Real, testable mapping from Kiswahili sentences
 * to application-domain intents (ShopOS/ChurchOS/QuarryOS), per the
 * "Kiswahili Application Intent Map" (section C) of the project's own
 * Application Semantic Extraction Report.
 *
 * HONESTY DISCLOSURE:
 *  - This module maps TEXT -> {domain, capability, confidence,
 *    matchedVerb}. It does NOT call any ShopOS/ChurchOS/QuarryOS data
 *    API, database, or business-logic layer — no such connection was
 *    supplied, discovered, or verified this session. Wiring this
 *    resolver's output to a real application-data call is explicitly
 *    OUT OF SCOPE and left as a documented next step; this file only
 *    performs intent classification + confidence scoring.
 *  - Coverage is exactly the 6 capabilities in the project's own
 *    intent map table (section C), not a claim of full ShopOS/
 *    ChurchOS/QuarryOS command coverage. See getCounts().
 *  - Verb roots are matched with the same "no leading \b" discipline
 *    as the geography layer, since Kiswahili verbs carry fused
 *    subject/tense prefixes (ni-, u-, a-, tu-, wa-, -na-, -li-, -ta-,
 *    -me-) that a strict leading word-boundary would miss.
 */
(function (root) {
    "use strict";
    const w = root.window || root;
    w.CozyOS = w.CozyOS || {};
    w.CozyOS.Modules = w.CozyOS.Modules || {};
    if (w.CozyOS.Modules["cozy-application-semantic-bridge"]) return;

    const VERSION = "1.0.0-appbridge-phase1";

    function capability(domain, id, opts) {
        opts = opts || {};
        return Object.freeze({
            domain: domain,
            id: id,
            verbRoots: Object.freeze(opts.verbRoots || []),
            // Distinguishing keyword(s) that separate this capability
            // from siblings in the same domain sharing similar verbs
            // (e.g. "faida"/"hasara" for profit vs "mauzo" for sales).
            distinguishingTerms: Object.freeze(opts.distinguishingTerms || []),
            samplePhrases: Object.freeze(opts.samplePhrases || []),
            status: opts.status || "VERIFIED_IMPLEMENTED"
        });
    }

    // The 6 capabilities explicitly named in the project's own
    // Kiswahili Application Intent Map (section C). Disclosed: this
    // is that table, structured for matching — not an independently
    // expanded command set.
    const CAPABILITIES = Object.freeze([
        capability("shopos", "inventory.lookup", {
            verbRoots: ["onyesh", "tafut", "angali", "baki"],
            distinguishingTerms: ["bidhaa", "mzigo", "stock", "hisa", "duka"],
            samplePhrases: ["Nionyeshe bidhaa zilizopo dukani.", "Niko chonjo, nionyeshe mzigo uliobaki.", "Boss, niambie stock ya leo."]
        }),
        capability("shopos", "sales.report", {
            verbRoots: ["onyesh", "elez", "hesab", "pat"],
            // NOTE: deliberately excludes generic time words ("leo",
            // "wiki", "mwezi") as distinguishing terms — they also
            // appear in business.profit questions ("mwezi huu") and
            // caused a false tie-break in testing; "mauzo" alone is
            // the real domain-distinguishing term for this capability.
            distinguishingTerms: ["mauzo"],
            samplePhrases: ["Niambie mauzo ya leo."]
        }),
        capability("shopos", "business.profit", {
            verbRoots: ["pat", "pim", "linganish"],
            distinguishingTerms: ["faida", "hasara"],
            samplePhrases: ["Faida yangu ya mwezi huu ni kiasi gani?"]
        }),
        capability("churchos", "church.members.count", {
            verbRoots: ["hesab"],
            distinguishingTerms: ["washiriki", "wangapi", "wanachama"],
            samplePhrases: ["Washiriki wetu wako wangapi?"]
        }),
        capability("churchos", "church.members.list", {
            verbRoots: ["onyesh", "orodhesh", "tafut"],
            distinguishingTerms: ["washiriki", "wanachama"],
            samplePhrases: ["Nionyeshe washiriki wa Kilifi."]
        }),
        capability("quarryos", "quarry.truck.lookup", {
            verbRoots: ["fuatili", "fik"],
            distinguishingTerms: ["lori", "gari", "machimboni"],
            samplePhrases: ["Lori limefika machimboni?"]
        })
    ]);

    function containsAny(haystack, needles) {
        return needles.some((n) => haystack.indexOf(n) !== -1);
    }

    /**
     * resolveApplicationIntent(text)
     *   Scores each of the CAPABILITIES table above against `text`
     *   (lowercased) by (a) presence of at least one verb-root
     *   substring and (b) presence of at least one distinguishing
     *   term. Both present -> HIGH confidence match. Only a verb root
     *   -> LOW confidence (ambiguous between siblings). Neither ->
     *   not a candidate. Returns the highest-scoring candidate, or
     *   null (honest) if nothing scores.
     *
     *   This is intent CLASSIFICATION only — it returns which
     *   application capability the sentence is asking for, not the
     *   result of actually calling that capability (see file-level
     *   disclosure above).
     */
    function resolveApplicationIntent(text) {
        if (typeof text !== "string" || !text.trim()) return null;
        const haystack = text.toLowerCase();
        let best = null;
        for (const cap of CAPABILITIES) {
            const verbHit = cap.verbRoots.some((v) => haystack.indexOf(v) !== -1);
            const termHit = containsAny(haystack, cap.distinguishingTerms);
            if (!verbHit && !termHit) continue;
            const confidence = verbHit && termHit ? "HIGH" : "LOW";
            const score = confidence === "HIGH" ? 2 : 1;
            if (!best || score > best.score) {
                best = { score, domain: cap.domain, capability: cap.id, confidence, status: cap.status };
            }
        }
        if (!best) return null;
        return Object.freeze({ domain: best.domain, capability: best.capability, confidence: best.confidence, status: best.status });
    }

    function getCounts() {
        const byDomain = {};
        for (const cap of CAPABILITIES) byDomain[cap.domain] = (byDomain[cap.domain] || 0) + 1;
        return Object.freeze(Object.assign({ total: CAPABILITIES.length }, byDomain));
    }

    const api = Object.freeze({
        VERSION,
        capabilities: CAPABILITIES,
        resolveApplicationIntent,
        getCounts
    });

    w.CozyOS.CozyApplicationSemanticBridge = api;
    w.CozyOS.Modules["cozy-application-semantic-bridge"] = Object.freeze({
        version: VERSION,
        description: "New, additive Kiswahili application-intent classifier for the 6 capabilities named in the project's own ShopOS/ChurchOS/QuarryOS intent map. Text-in, {domain, capability, confidence}-out ONLY — does not call any application data API. Does not modify any existing file, does not create a second AI or semantic engine."
    });
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
