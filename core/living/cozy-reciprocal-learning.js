/**
 * core/living/cozy-reciprocal-learning.js
 * PHASE 4 — Universal Language Capability: reciprocal learning.
 *
 * WHAT THIS IS
 *   Composes THREE real, existing, unmodified authorities — never a
 *   new AI, never a second learning/profile/language database:
 *     - window.CozyOS.IdentityEngine.getProfile(actorId) — the real,
 *       existing Phase 4 languageRoles field (see identity-engine.js).
 *     - window.CozyOS.CozyAfricanLanguageIntelligence.checkVerifiedGap()
 *       — the real, existing verified-gap classifier composing RP-030's
 *       own listExpressions()/evidenceBand().
 *   Finds, at most, ONE genuine, real, disclosed opportunity: a
 *   language the actor is a CONSENTING, CONTRIBUTOR-role speaker of
 *   (excluding whatever language they are currently learning), where a
 *   real, already-partially-evidenced expression genuinely needs
 *   strengthening (never a language with zero data, and never a
 *   VERIFIED one — those are never re-asked, per your spec's own
 *   explicit rule).
 *
 * WHY listExpressions() FOR CANDIDATE TERMS, NOT A NEW "WHAT SHOULD
 * EXIST" REGISTRY
 *   No canonical "list of concepts a language should cover" exists
 *   anywhere in this repository, and inventing one would itself
 *   fabricate an authority this codebase does not have. Instead, the
 *   real, honest gap source used here is expressions ALREADY submitted
 *   (by anyone) that have not yet reached strong evidence — a real,
 *   disclosed "needs strengthening" signal, never an invented one.
 */
(function (root) {
    "use strict";

    function cozyOS() {
        return (root && root.window && root.window.CozyOS) || (typeof window !== "undefined" ? window.CozyOS : null);
    }
    function identity() { const c = cozyOS(); return c && c.IdentityEngine; }
    function africanIntel() { const c = cozyOS(); return c && c.CozyAfricanLanguageIntelligence; }
    function languagePacks() { const c = cozyOS(); return c && c.CozyLanguagePacks; }

    /**
     * findReciprocalOpportunity({ actorId, excludeLanguage })
     *   Returns null (the honest, true no-op — no qualified contributor
     *   role, no consent, or no genuine gap found) or:
     *   { language, expression, meaning, status, recordIds }
     */
    function findReciprocalOpportunity(options) {
        const opts = options || {};
        const actorId = opts.actorId || null;
        const excludeLanguage = opts.excludeLanguage ? String(opts.excludeLanguage).toLowerCase() : null;
        const idEngine = identity();
        const intel = africanIntel();
        const packs = languagePacks();
        if (!actorId || !idEngine || !intel || !packs) return null;

        let profile = null;
        try { profile = idEngine.getProfile(actorId); } catch (_err) { return null; }
        if (!profile || !profile.available || !Array.isArray(profile.languageRoles)) return null;

        const qualifying = profile.languageRoles.filter((r) =>
            r.language !== excludeLanguage &&
            r.consent === true &&
            Array.isArray(r.roles) && r.roles.includes("CONTRIBUTOR")
        );

        for (const role of qualifying) {
            let expressions = [];
            try { expressions = packs.listExpressions({ languageId: role.language }) || []; } catch (_err) { expressions = []; }
            for (const expr of expressions) {
                if (!expr || !expr.expression) continue;
                const gap = intel.checkVerifiedGap({ languageId: role.language, expression: expr.expression, region: expr.region, dialect: expr.dialect });
                if (gap.status === "PARTIAL" || gap.status === "UNVERIFIED") {
                    return {
                        language: role.language,
                        expression: expr.expression,
                        meaning: expr.meaning || null,
                        status: gap.status,
                        recordIds: gap.recordIds || []
                    };
                }
            }
        }
        return null;
    }

    const api = Object.freeze({ findReciprocalOpportunity });

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    if (root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        root.window.CozyOS.CozyReciprocalLearning = api;
        root.window.CozyOS.Modules["cozy-reciprocal-learning"] = Object.freeze({
            version: "1.0.0",
            description: "PHASE 4 — Universal Language Capability: reciprocal learning. Composes the real IdentityEngine.getProfile() languageRoles field + CozyAfricanLanguageIntelligence.checkVerifiedGap() to find at most one genuine, real, disclosed contribution opportunity — never a new AI, database, or gap-discovery registry."
        });
    }
})(typeof window !== "undefined" ? { window } : { window: (typeof global !== "undefined" ? (global.window = global.window || {}) : {}) });
