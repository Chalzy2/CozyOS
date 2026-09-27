'use strict';

/**
 * core/modules/intelligence/answer/cozy-answer-security-boundary.js
 *
 * SA-8 PHASE 3 — permanent CozyOS product/security rule, not phase-scoped.
 * A user-facing answer must never expose internal implementation details:
 * source file paths, .js/.html/.css/etc. filenames, internal function-call
 * syntax, or internal architecture class-name vocabulary (Engine/Registry/
 * Adapter/Provider/Coordinator/Contract/Realizer/Planner-suffixed
 * identifiers). This is ONE reusable sanitization boundary —
 * window.CozyOS.AnswerSecurityBoundary — applied once, at the single
 * authoritative final-text choke point (cozy-answer-engine.js's answer()
 * outer wrapper), never duplicated per response path.
 *
 * WHY THIS EXISTS — traced, not assumed
 *   Empirically confirmed against the real dashboard.html (SA-8 Phase 3
 *   audit): APPLICATION_HUMAN_PURPOSE_DATA's own implementedAwaitingConnection/
 *   partiallyImplemented fields (cozy-knowledge-registry.js — authored for
 *   internal audit disclosure, quoted verbatim in this repository's own
 *   *.md audit reports) contain real source file paths and function-call
 *   syntax, e.g. "core/modules/intelligence/media/cozy-media-intelligence.js's
 *   real, working searchByPersonReference()" — and this exact text was
 *   observed reaching a real Live Window answer via the existing
 *   getContext()/synthesizeFromContext() path. This is a real, pre-
 *   existing gap this phase closes, not a hypothetical one.
 *
 * WHAT THIS IS NOT
 *   - Not a rewrite of the evidence store. Those fields remain exactly as
 *     authored — valuable for internal audit/documentation use — this
 *     module only strips developer-facing vocabulary from the copy of the
 *     text on its way OUT to a user, never from the stored evidence.
 *   - Not a second answer pipeline and not an authorization authority.
 *     This never decides WHETHER a user may see some information — that
 *     boundary (IdentityEngine.checkPermission(), OrganizationRegistry
 *     scoping, SA-2's own sensitivity/PUBLIC evidence filtering) remains
 *     entirely upstream and authoritative. This only strips implementation
 *     vocabulary from whatever text has already been cleared to reach the
 *     user — a presentation-layer redaction, never an access decision.
 *   - Not a fluency/grammar repair tool. Redaction correctness (never
 *     leak an identifier) is this function's job; the cleanup pass below
 *     removes only the most common punctuation artifacts a redaction
 *     leaves behind, not a full rewrite of the surrounding sentence.
 */
(function () {
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["answer-security-boundary"]) return;

    // A relative path segment ending in a real source-code/document
    // extension, e.g. "core/modules/intelligence/media/cozy-media-
    // intelligence.js" or a bare "cozy-media-intelligence.js" filename
    // with no path prefix.
    const FILE_PATH_PATTERN = /\b[\w.-]+(?:\/[\w.-]+)*\.(?:js|jsx|ts|tsx|html|htm|css|json|md|py|sql|yml|yaml)\b/gi;

    // A bare identifier immediately followed by an empty function-call
    // parenthesis, e.g. "searchByPersonReference()", "setupChurch()".
    // Deliberately requires LITERAL EMPTY parens directly against the
    // identifier with no space and no content inside — ordinary English/
    // Kiswahili parenthetical asides ("(SFU/CDN)", "(see below)") always
    // have either a space before "(" or real content inside it, so they
    // never match this pattern.
    const FUNCTION_CALL_PATTERN = /\b[A-Za-z_][A-Za-z0-9_]*\(\s*\)/g;

    // Internal architecture/module-identifier vocabulary that sometimes
    // appears in evidence prose written for internal audit purposes —
    // narrow, suffix-based, never a blanket ban on capitalized words
    // (which would wrongly redact real product names like ChurchOS).
    const INTERNAL_CLASS_SUFFIX_PATTERN = /\b[A-Z][A-Za-z0-9]*(?:Engine|Registry|Adapter|Provider|Coordinator|Contract|Realizer|Planner)\b/g;

    const KNOWN_PRODUCT_NAMES = new Set(["ChurchOS", "QuarryOS", "ShopOS", "InterestOS", "MpesaOS", "WholesaleOS", "PharmacyOS", "CozyOS"]);

    function stripInternalIdentifiers(text) {
        let out = text.replace(FILE_PATH_PATTERN, "");
        out = out.replace(FUNCTION_CALL_PATTERN, "");
        out = out.replace(INTERNAL_CLASS_SUFFIX_PATTERN, (match) => (KNOWN_PRODUCT_NAMES.has(match) ? match : ""));
        return out;
    }

    // Cleanup pass: redaction above can leave orphaned punctuation
    // ("setupChurch() — reuses..." -> " — reuses...", "a.js and b.js" ->
    // "a and b" with a double space) — collapse the common artifacts.
    function cleanupPunctuation(text) {
        return text
            .replace(/\s{2,}/g, " ")
            .replace(/\s+([,.;:!?])/g, "$1")
            .replace(/(^|[.;\n])\s*[-—]\s*/g, "$1 ")
            .replace(/[-—]\s*[-—]/g, "—")
            .replace(/^\s*[-—]\s*/g, "")
            .trim();
    }

    function sanitize(text) {
        if (typeof text !== "string" || text.length === 0) return text;
        return cleanupPunctuation(stripInternalIdentifiers(text));
    }

    /**
     * detectLeaks(text) — real, disclosed diagnostic: returns the exact
     * substrings that WOULD be redacted, without redacting them. Used by
     * this module's own tests and by any caller/test that wants to prove
     * a piece of text is already clean, or find out what leaked, without
     * having to diff sanitized vs. unsanitized text itself.
     */
    function detectLeaks(text) {
        if (typeof text !== "string") return [];
        const leaks = [];
        for (const re of [FILE_PATH_PATTERN, FUNCTION_CALL_PATTERN]) {
            const matches = text.match(re);
            if (matches) leaks.push(...matches);
        }
        const classMatches = text.match(INTERNAL_CLASS_SUFFIX_PATTERN);
        if (classMatches) leaks.push(...classMatches.filter((m) => !KNOWN_PRODUCT_NAMES.has(m)));
        return leaks;
    }

    const AnswerSecurityBoundary = Object.freeze({ sanitize, detectLeaks, getVersion: () => "1.0.0" });
    window.CozyOS.AnswerSecurityBoundary = AnswerSecurityBoundary;
    window.CozyOS.Modules["answer-security-boundary"] = Object.freeze({
        version: "1.0.0",
        description: "SA-8 Phase 3 — permanent product/security rule: strips internal file paths, filenames, function-call syntax, and internal architecture class-name vocabulary from any text about to reach a user. Applied once, at cozy-answer-engine.js's answer() outer wrapper. Never an authorization boundary — authorization remains upstream and authoritative; this is presentation-layer redaction only."
    });
})();
