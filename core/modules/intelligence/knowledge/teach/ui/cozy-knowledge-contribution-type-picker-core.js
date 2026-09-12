/**
 * CozyOS — Community Contribution-Type Picker (pure logic)
 * File Reference: core/modules/intelligence/knowledge/teach/ui/cozy-knowledge-contribution-type-picker-core.js
 * Repair: Dashboard Prompt 2 §7 (Community Contribution-Type Picker)
 *
 * MISSION
 *   Let a user choose, in plain language, what kind of knowledge they
 *   want to teach CozyAI, then hand off to the real, existing, unmodified
 *   contribution/teach pipeline. This file invents no new contribution
 *   engine, no new schema, and no new submission path.
 *
 * REAL SCHEMA SOURCE (inspected before writing this file)
 *   window.CozyOS.CozyTeachCozyAIRouting.TEACH_KNOWLEDGE_TYPES (RP-031
 *   Phase 2A, core/modules/intelligence/knowledge/teach/
 *   cozy-teach-cozyai-routing-core.js) is the ONE real, accepted
 *   contribution-type vocabulary a user can submit through — it is
 *   itself already a composed, non-duplicated mapping onto:
 *     - CozyKnowledgeContributionCore.CONTRIBUTION_TYPES (RP-029-C
 *       Phase 3) via KNOWLEDGE_TYPE_TO_CORE
 *     - CozyKnowledgeCommunity's own CONTRIBUTION_TYPES (RP-029-B) via
 *       that file's own TYPE_TO_RP029B table.
 *   This picker reads TEACH_KNOWLEDGE_TYPES dynamically — it never
 *   hardcodes a duplicate list of "real" types, and it never invents a
 *   type (e.g. AUDIO/VIDEO/CULTURE/LANGUAGE) that the real engine does
 *   not itself accept. If the real module is not loaded, every function
 *   below fails closed with CAPABILITY_UNAVAILABLE rather than
 *   fabricating a type list.
 *
 * FRIENDLY LABELS
 *   FRIENDLY_LABELS below is a pure presentation layer: friendly text
 *   for a real engine value, never a value of its own. getPickerOptions()
 *   always returns the routing engine's real internal value under
 *   `value`, and only ever includes a knowledgeType that is genuinely
 *   present in TEACH_KNOWLEDGE_TYPES at call time (so if that array
 *   ever changes upstream, this file does not go stale or invent a
 *   default). Any real type missing a curated label still appears,
 *   using a mechanically title-cased fallback — never silently hidden.
 *
 * LANGUAGE (spec section 7)
 *   No general dashboard-shell UI-string translation/localization
 *   mechanism exists anywhere in this repository today (RP-027's
 *   CozyLanguageRegistry/cozy-language-templates.js localize CozyAI's
 *   own conversational replies only — a separate, narrower system,
 *   confirmed by direct inspection). core/shell/user-dashboard.js's own
 *   Community/Home/AI/Apps/Settings surface text is English-only by the
 *   same, already-established convention. This file honestly follows
 *   that existing convention rather than inventing a second, competing
 *   language registry for picker labels — disclosed here, not silently
 *   changed.
 *
 * ADMIN BOUNDARY (spec section 11)
 *   This file has no authorization/role concept and grants no
 *   privilege of any kind — it is a pure type→label→route mapping. It
 *   never distinguishes an admin from an ordinary contributor and
 *   cannot be used to acquire moderation/admin authority.
 *
 * PRIVACY (spec section 10)
 *   This file stores no state and reads no user identity, contribution
 *   history, or private data of any kind.
 */
(function (root) {
    "use strict";

    function cozyOS() {
        return (root && root.window && root.window.CozyOS) || (typeof window !== "undefined" ? window.CozyOS : null);
    }
    function teachRouting() {
        const c = cozyOS();
        return c && c.CozyTeachCozyAIRouting ? c.CozyTeachCozyAIRouting : null;
    }

    // -----------------------------------------------------------------
    // Presentation-only friendly labels for the real, existing
    // TEACH_KNOWLEDGE_TYPES values. Every key here MUST correspond to a
    // real value in that array — this table adds no new type.
    // -----------------------------------------------------------------
    const FRIENDLY_LABELS = Object.freeze({
        WORD: { label: "A word", hint: "Teach CozyAI a word in your language." },
        PHRASE: { label: "A phrase", hint: "A short group of words used together." },
        SENTENCE: { label: "A sentence", hint: "A full sentence, as it's really spoken." },
        DEFINITION: { label: "A definition", hint: "What a word or phrase means." },
        LITERAL_MEANING: { label: "Literal meaning", hint: "What it means word-for-word." },
        CONTEXTUAL_MEANING: { label: "Meaning in context", hint: "What it means the way people actually use it." },
        PRONUNCIATION: { label: "Pronunciation", hint: "How something is said out loud. Spelling is never required." },
        DIALECT_VARIANT: { label: "A local variation", hint: "How this differs in your own area or dialect." },
        EXAMPLE_USAGE: { label: "An example sentence", hint: "Show CozyAI a real example of it being used." },
        TRANSLATION: { label: "A translation", hint: "How to say this in another language." },
        CULTURAL_NOTE: { label: "Cultural knowledge", hint: "A custom, tradition, or cultural note." },
        AGRICULTURE: { label: "Farming knowledge", hint: "Community-reported, not professional agricultural advice." },
        EDUCATION: { label: "Education knowledge", hint: "Community-reported local education knowledge." },
        BUSINESS: { label: "Business knowledge", hint: "Community-reported local business knowledge." },
        COMMUNITY_LIFE: { label: "Community life", hint: "Church, community, or daily-life knowledge." },
        OTHER_DOMAIN: { label: "Something else", hint: "Other local, community-reported knowledge." }
    });

    function titleCaseFallback(rawType) {
        return String(rawType || "")
            .toLowerCase()
            .split("_")
            .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
            .join(" ");
    }

    /**
     * getPickerOptions()
     *   Returns the real, currently-accepted contribution types, each
     *   with a friendly label, ready to render as a picker. Never
     *   invents a type; never omits a real one for lack of a curated
     *   label (falls back to a mechanical title-case of the real
     *   value, and discloses that it did so via `labelSource`).
     */
    function getPickerOptions() {
        const routing = teachRouting();
        if (!routing || !Array.isArray(routing.TEACH_KNOWLEDGE_TYPES)) {
            return { available: false, reason: "CAPABILITY_UNAVAILABLE", options: [] };
        }
        const domainTypes = Array.isArray(routing.DOMAIN_TYPES) ? routing.DOMAIN_TYPES : [];
        const oralTypes = Array.isArray(routing.ORAL_KNOWLEDGE_TYPES) ? routing.ORAL_KNOWLEDGE_TYPES : [];

        const options = routing.TEACH_KNOWLEDGE_TYPES.map((realType) => {
            const curated = FRIENDLY_LABELS[realType];
            return {
                value: realType,
                label: curated ? curated.label : titleCaseFallback(realType),
                hint: curated ? curated.hint : null,
                labelSource: curated ? "CURATED" : "FALLBACK_TITLE_CASE",
                isOral: oralTypes.indexOf(realType) !== -1,
                isDomain: domainTypes.indexOf(realType) !== -1
            };
        });

        return { available: true, options };
    }

    /**
     * isRealContributionType(candidate)
     *   Strict membership check against the real engine's own current
     *   list — used both by the UI (disable/hide anything not real)
     *   and by tests (confirm fake types like "VIDEO"/"CULTURE" are
     *   rejected).
     */
    function isRealContributionType(candidate) {
        const routing = teachRouting();
        if (!routing || !Array.isArray(routing.TEACH_KNOWLEDGE_TYPES)) return false;
        return routing.TEACH_KNOWLEDGE_TYPES.indexOf(candidate) !== -1;
    }

    /**
     * selectContributionType(candidate)
     *   The picker's own tiny selection state-machine. Never mutates
     *   any real engine state — this only decides whether a proposed
     *   selection is legal and what the resulting form-routing
     *   descriptor looks like (which the real, existing
     *   CozyTeachCozyAIRouting.describeContributionForm() already
     *   supplies — never re-derived here).
     */
    function selectContributionType(candidate) {
        if (candidate === undefined || candidate === null || String(candidate).trim() === "") {
            return { selected: false, reason: "NO_TYPE_SELECTED" };
        }
        const routing = teachRouting();
        if (!routing) {
            return { selected: false, reason: "CAPABILITY_UNAVAILABLE" };
        }
        if (!isRealContributionType(candidate)) {
            return { selected: false, reason: "UNKNOWN_KNOWLEDGE_TYPE", candidate };
        }
        const formDescriptor = routing.describeContributionForm(candidate);
        return {
            selected: true,
            knowledgeType: candidate,
            formDescriptor
        };
    }

    // -----------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------
    const api = Object.freeze({
        FRIENDLY_LABELS,
        getPickerOptions,
        isRealContributionType,
        selectContributionType
    });

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    if (root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        root.window.CozyOS.CozyKnowledgeContributionTypePicker = api;
        root.window.CozyOS.Modules["cozy-knowledge-contribution-type-picker-core"] = Object.freeze({
            version: "1.0.0",
            description: "Dashboard Prompt 2 \u00a77 \u2014 Community contribution-type picker (pure logic). Presents friendly labels over the real, existing CozyTeachCozyAIRouting.TEACH_KNOWLEDGE_TYPES schema only \u2014 never invents a type, never duplicates the review/ingestion pipeline. Fails closed to CAPABILITY_UNAVAILABLE if the real routing module is not loaded."
        });
    }
})(typeof window !== "undefined" ? { window } : { window: (typeof global !== "undefined" ? (global.window = global.window || {}) : {}) });
