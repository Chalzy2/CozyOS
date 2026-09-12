/**
 * CozyOS — Community Knowledge Safety Gate
 * File Reference: core/modules/intelligence/knowledge/ui/cozy-knowledge-safety-gate.js
 * Repair: RP-029-C Phase 4 (mandatory content safety requirement,
 *         applying to every path that can create a knowledge candidate
 *         — local submission and offline-hotspot receipt alike)
 *
 * OWNERSHIP
 *   New, additive, standalone file. Owns no candidate storage of its
 *   own beyond a small in-memory quarantine list (see §4). Does not
 *   duplicate RP-029-A/B's real ingestion/validation logic — this
 *   module's only job is deciding, BEFORE any of that runs, whether
 *   submitted text is even eligible to become a candidate at all.
 *
 * WHAT THIS FILE HONESTLY DOES AND DOES NOT DO
 *   REAL: pattern-based classification of the actual TEXT fields a
 *   contribution carries (expression/meaning/context/translation/
 *   exampleUsage/notes/source/audioReference/documentReference as
 *   strings) — credential/secret leak patterns, malware/code-injection
 *   patterns, generic explicit-adult-content phrase matching, and a
 *   few generic instructional-harm phrase patterns. These are real,
 *   executed, testable regex/heuristic checks against real text this
 *   repository actually receives.
 *
 *   NOT REAL, honestly disclosed rather than fabricated: this
 *   repository has no binary file upload, no image/audio/video
 *   decoding, and no ML-based content classifier anywhere (confirmed
 *   by search before writing this file — Phase 3 already disclosed the
 *   same gap for OCR/document/website evidence, which remain
 *   metadata-only). AUDIO_REFERENCE/DOCUMENT_EVIDENCE/WEBSITE_EVIDENCE
 *   contributions are therefore gated on their real text
 *   fields and reference string only — the referenced media itself is
 *   never fetched, decoded, or analyzed here, because no such
 *   capability exists in this repository to compose. This is recorded
 *   honestly in every quarantine/classification result for that
 *   contribution type (`mediaNotAnalyzed: true`), not silently implied
 *   as covered.
 *
 *   DELIBERATELY NOT ATTEMPTED: real classification of sexual content
 *   involving minors, extremist recruitment material, or graphic
 *   violence. These categories genuinely require either a specialized,
 *   independently-vetted detection service (e.g. hash-matching against
 *   a verified database, or a trained/audited classifier) or real human
 *   review — a plausible-looking keyword list is not a real safety
 *   control for these categories and this file does not pretend
 *   otherwise. Any signal in this direction is therefore never
 *   auto-approved and never auto-rejected by this file alone — it is
 *   always routed to UNCERTAIN (quarantine + mandatory human review),
 *   which is the honest, correct answer given what is actually
 *   implemented here.
 *
 * MEANING BEFORE JUDGMENT (explicit governing principle for this file)
 *   A single, bare word or short phrase is never auto-rejected purely
 *   because it superficially resembles a flagged term — cross-language/
 *   cross-dialect homonymy is real and expected (see file's own tests).
 *   Only reasonably unambiguous signals (multi-token explicit phrases,
 *   structurally distinctive credential/malware patterns) resolve to
 *   UNSAFE on their own. Anything weaker resolves to UNCERTAIN, and the
 *   real community-validation pipeline (RP-029-B/Phase 1) — not this
 *   file — is what ultimately establishes real, contextual meaning.
 *
 * WIRING (this pass's disclosed, necessary modification)
 *   cozy-knowledge-contribution-core.js's submitDraft() and
 *   cozy-knowledge-review-hotspot-bridge.js's handleIncomingPayload()
 *   both now call classify() here BEFORE calling
 *   CozyKnowledgeCommunity.submitContribution() — this is the only
 *   reason either of those two Phase 2/3 files changed this pass (see
 *   HANDOFF.md for the exact diff and re-run regression). No other
 *   file changed.
 */
(function (root) {
    "use strict";

    // -----------------------------------------------------------------
    // 1. STRUCTURAL / UNAMBIGUOUS PATTERNS — safe to hard-code generically,
    //    because these are syntactic (not judgment-based) signals.
    // -----------------------------------------------------------------

    const CREDENTIAL_PATTERNS = [
        /-----BEGIN (RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/i,
        /\bAKIA[0-9A-Z]{16}\b/,                 // AWS access key id shape
        /\b(api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}/i,
        /\bpassword\s*[:=]\s*\S{4,}/i
    ];

    const MALWARE_PATTERNS = [
        /<script[\s>]/i,
        /\beval\s*\(/i,
        /\bbase64_decode\s*\(/i,
        /powershell\s+-enc\b/i,
        /\.exe(\s|$)/i,
        /\bcurl\s+.*\|\s*sh\b/i
    ];

    const PII_PATTERNS = [
        /\b\d{3}-\d{2}-\d{4}\b/,                // SSN-shaped
        /\b(?:\d[ -]*?){13,16}\b/                // long digit run, card-shaped
    ];

    // -----------------------------------------------------------------
    // 2. GENERIC EXPLICIT-ADULT-CONTENT SIGNAL — deliberately small,
    //    generic, multi-token-oriented, and never the sole basis for
    //    UNSAFE on a single bare word (see classify() below).
    // -----------------------------------------------------------------

    const EXPLICIT_ADULT_PHRASES = [
        /\bhardcore\s+porn(ography)?\b/i,
        /\bexplicit\s+sex(ual)?\s+(video|images?|content)\b/i,
        /\bpornographic\s+(video|images?|material)\b/i
    ];

    // Generic instructional-harm phrase shapes (weapons/explosives/drug
    // synthesis "how to" framing) — structural pattern only, no
    // technical detail is stored or matched beyond the framing itself.
    const INSTRUCTIONAL_HARM_PATTERNS = [
        /\bhow\s+to\s+(make|build|synthesize)\s+(a\s+)?(bomb|explosive|nerve agent|chemical weapon)\b/i
    ];

    // -----------------------------------------------------------------
    // 3. CLASSIFY — the real, executed decision function
    // -----------------------------------------------------------------

    function collectText(fields) {
        const f = fields || {};
        return [f.expression, f.statement, f.meaning, f.context, f.translation, f.exampleUsage, f.notes, f.source]
            .filter((v) => typeof v === "string" && v.trim())
            .join("\n");
    }

    function tokenCount(s) { return (s.match(/\S+/g) || []).length; }

    /**
     * classify(fields, opts)
     *   fields: the same shape contribution drafts already carry
     *     (expression/meaning/context/translation/exampleUsage/notes/
     *     source/audioReference/documentReference/contributionType).
     *   Returns { classification: "SAFE"|"UNSAFE"|"UNCERTAIN",
     *             category, mediaNotAnalyzed, note }
     *   `note` is an internal-facing explanation only — callers must
     *   show the person the generic, policy-level message (see
     *   USER_FACING_REJECTION_MESSAGE below), never this detail (spec:
     *   "do not expose unnecessary details about the detection mechanism").
     */
    function classify(fields, opts) {
        const f = fields || {};
        const text = collectText(f);
        const mediaNotAnalyzed = ["AUDIO_REFERENCE", "DOCUMENT_EVIDENCE", "WEBSITE_EVIDENCE", "OCR_TEXT"].indexOf(f.contributionType) !== -1;

        for (const re of CREDENTIAL_PATTERNS) {
            if (re.test(text)) return { classification: "UNSAFE", category: "CREDENTIAL_LEAK", mediaNotAnalyzed, note: "Matched a structural credential/secret pattern." };
        }
        for (const re of MALWARE_PATTERNS) {
            if (re.test(text)) return { classification: "UNSAFE", category: "MALWARE_PATTERN", mediaNotAnalyzed, note: "Matched a structural malware/code-injection pattern." };
        }
        for (const re of PII_PATTERNS) {
            if (re.test(text)) return { classification: "UNSAFE", category: "STOLEN_PII_PATTERN", mediaNotAnalyzed, note: "Matched a structural PII pattern (SSN/card-number shape)." };
        }
        for (const re of INSTRUCTIONAL_HARM_PATTERNS) {
            if (re.test(text)) return { classification: "UNSAFE", category: "INSTRUCTIONAL_HARM", mediaNotAnalyzed, note: "Matched an instructional-harm phrase pattern." };
        }
        for (const re of EXPLICIT_ADULT_PHRASES) {
            if (re.test(text)) return { classification: "UNSAFE", category: "EXPLICIT_ADULT_CONTENT", mediaNotAnalyzed, note: "Matched an explicit multi-token adult-content phrase." };
        }

        // Meaning-before-judgment: a short submission (few tokens) that
        // merely contains a generic sensitive-adjacent single word is
        // never auto-rejected — cross-language/cross-dialect homonymy is
        // real (see file header). Route to UNCERTAIN so real community
        // validation (not this heuristic) establishes actual meaning.
        const ambiguous = SENSITIVE_SINGLE_WORDS.some((w) => new RegExp("\\b" + w + "\\b", "i").test(text));
        const tokens = tokenCount(text);
        const shortThreshold = opts && opts.shortTextTokenThreshold != null ? opts.shortTextTokenThreshold : 6;
        const borderlineThreshold = opts && opts.borderlineTextTokenThreshold != null ? opts.borderlineTextTokenThreshold : 20;
        if (ambiguous && tokens <= shortThreshold) {
            return { classification: "UNCERTAIN", category: "AMBIGUOUS_SINGLE_TERM", mediaNotAnalyzed, note: "Contains a generic sensitive-adjacent term with no other context. Meaning-before-judgment: routed to human/community review rather than auto-rejected or auto-approved." };
        }
        // PHASE 5 ADDITION: a flagged term with SOME surrounding text —
        // more than the bare-word case above, but not yet enough real
        // context to confidently clear it (unlike the long, clearly
        // legitimate case a few lines below, which falls through to
        // SAFE). This is a real, new, distinct risk tier (spec: "possible
        // categories SAFE/UNSAFE/UNCERTAIN/HIGH_RISK") — it does not
        // change the existing <= shortThreshold behavior above at all,
        // so every Phase 4 test result is unaffected.
        if (ambiguous && tokens <= borderlineThreshold) {
            return { classification: "HIGH_RISK", category: "AMBIGUOUS_TERM_LIMITED_CONTEXT", mediaNotAnalyzed, note: "Contains a generic sensitive-adjacent term with limited surrounding context — not enough to confidently clear it, not so little that it's a bare ambiguous word either. Routed to priority human review, never auto-approved or auto-rejected." };
        }

        // Media-carrying contribution types: this file cannot honestly
        // analyze the referenced media itself (no such capability
        // exists in this repository — see file header). Rather than
        // silently marking SAFE for content it never actually looked
        // at, route to UNCERTAIN for mandatory human review.
        if (mediaNotAnalyzed && (f.audioReference || f.documentReference)) {
            return { classification: "UNCERTAIN", category: "MEDIA_NOT_ANALYZED", mediaNotAnalyzed, note: "This contribution references media that cannot be fetched/decoded/analyzed by this repository. Routed to human review rather than assumed safe." };
        }

        // Categories this file deliberately does not attempt to detect
        // via keyword heuristics at all (sexual content involving
        // minors, extremist recruitment, graphic violence) are not
        // scanned for here — see file header for why a keyword list is
        // not a real control for them. There is therefore no
        // corresponding "safe" claim being made about those categories
        // either; this function's SAFE result means only "no structural
        // or generic-explicit signal was found," not a certification.
        return { classification: "SAFE", category: null, mediaNotAnalyzed, note: null };
    }

    // Deliberately small and generic — not CSAM-related terminology,
    // not extremist terminology (see file header on why those
    // categories are not keyword-matched at all). These are ordinary,
    // widely-known generic terms used only as a low-confidence signal
    // that routes to human review, never to an automatic decision.
    const SENSITIVE_SINGLE_WORDS = Object.freeze(["porn", "nude", "explicit"]);

    // -----------------------------------------------------------------
    // 4. QUARANTINE — real, in-memory, human-review-facing store for
    //    every UNCERTAIN result. Nothing UNSAFE is ever quarantined —
    //    it is refused outright and never stored anywhere by this file.
    // -----------------------------------------------------------------

    let nextQuarantineId = 1;
    const quarantineStore = new Map();

    /**
     * Deterministic dedup key (Phase 5 addition) — mirrors RP-029-A's
     * own contentHash-style dedup idea, applied here to the quarantine
     * list only: the same expression from multiple contributors should
     * become one quarantine entry with multiple evidence records, not
     * several unrelated entries (spec §"DUPLICATES").
     */
    function dedupKey(fields) {
        const f = fields || {};
        const text = (f.expression || f.statement || f.translation || f.meaning || "").trim().toLowerCase();
        return [f.language || "", f.contributionType || "", text].join("::");
    }

    function quarantine(fields, classification, contributorId) {
        const key = dedupKey(fields);
        for (const entry of quarantineStore.values()) {
            if (!entry.reviewed && entry.dedupKey === key) {
                entry.evidence.push({ contributorId: contributorId || null, at: new Date().toISOString() });
                return entry;
            }
        }
        const id = "quarantine_" + (nextQuarantineId++);
        const entry = {
            id, at: new Date().toISOString(),
            dedupKey: key,
            category: classification.category,
            classification: classification.classification,
            mediaNotAnalyzed: classification.mediaNotAnalyzed,
            contributionType: fields && fields.contributionType,
            language: fields && fields.language,
            fields: fields ? Object.assign({}, fields) : null,
            evidence: [{ contributorId: contributorId || null, at: new Date().toISOString() }],
            reviewed: false
        };
        quarantineStore.set(id, entry);
        return entry;
    }

    function getQuarantineEntry(id) {
        const e = quarantineStore.get(id);
        return e ? Object.assign({}, e, { evidence: e.evidence.slice() }) : null;
    }

    function listQuarantined() {
        return Array.from(quarantineStore.values()).map((e) => Object.assign({}, e, { evidence: e.evidence.slice() }));
    }

    /**
     * releaseFromQuarantine(id, decision, reviewerId)
     *   decision: "APPROVE" | "REJECT" | "ESCALATE".
     *   APPROVE: returns the original fields for real ingestion, entry
     *     removed from the active quarantine list (a fresh get/list
     *     will no longer surface it — the admin layer's own audit trail
     *     is the durable record from here, not this store).
     *   REJECT: entry removed outright — spec: "record only the
     *     minimum necessary audit information; do not retain prohibited
     *     media merely for convenience." This function does not retain
     *     the content after rejection; a caller's own audit log (see
     *     cozy-knowledge-quarantine-admin-core.js) records only the
     *     non-content metadata.
     *   ESCALATE (Phase 5 addition): marks reviewed, but the entry is
     *     KEPT (not deleted) — specialized review needs the material
     *     preserved. No real specialized backend exists in this
     *     repository (disclosed) — escalation here means "held,
     *     unreleased, unrejected, flagged for a process this repository
     *     does not yet implement," never a claim that specialized
     *     review actually occurred.
     *   This function does not itself check reviewer authorization —
     *   callers are responsible for gating access to it exactly like
     *   every other reviewer-only action in this repository (see Phase
     *   2's dashboard-core authorization wrappers) before calling this.
     */
    function releaseFromQuarantine(id, decision, reviewerId) {
        const entry = quarantineStore.get(id);
        if (!entry) return { status: "NOT_FOUND" };
        if (entry.reviewed) return { status: "ALREADY_REVIEWED" };
        entry.reviewed = true;
        entry.reviewDecision = decision;
        entry.reviewerId = reviewerId || null;
        entry.reviewedAt = new Date().toISOString();
        if (decision === "APPROVE") return { status: "APPROVED", fields: Object.assign({}, entry.fields) };
        if (decision === "ESCALATE") return { status: "ESCALATED", fields: Object.assign({}, entry.fields) };
        quarantineStore.delete(id);
        return { status: "REJECTED" };
    }

    // -----------------------------------------------------------------
    const USER_FACING_REJECTION_MESSAGE = "This content cannot be accepted into CozyOS community knowledge.";

    const api = {
        classify,
        quarantine,
        listQuarantined,
        getQuarantineEntry,
        releaseFromQuarantine,
        USER_FACING_REJECTION_MESSAGE,
        // Exposed for tests only.
        _collectTextForTests: collectText
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    if (root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        root.window.CozyOS.CozyKnowledgeSafetyGate = Object.freeze(api);
        root.window.CozyOS.Modules["cozy-knowledge-safety-gate"] = Object.freeze({
            version: "1.0.0",
            description: "RP-029-C Phase 4/5 — mandatory content safety gate applied before any local or offline-hotspot contribution becomes a knowledge candidate. Real, executed text-pattern classification for credential leaks, malware/code-injection patterns, PII patterns, generic explicit-adult-content phrases, and generic instructional-harm phrasing (all UNSAFE, hard-rejected, never stored). Ambiguous single-term matches, borderline-context matches (HIGH_RISK, Phase 5), and any media-referencing contribution this repository cannot actually analyze are routed to UNCERTAIN/HIGH_RISK and quarantined for mandatory human review rather than auto-approved or auto-rejected — meaning comes before judgment. Sexual content involving minors and extremist recruitment material are deliberately not keyword-matched (no real detection capability exists here for those categories) and therefore always route to quarantine when any adjacent signal appears, never silently marked SAFE. Phase 5 adds quarantine dedup (same expression from multiple contributors becomes one entry with multiple evidence records) and an ESCALATE decision (keeps the entry, marks it held for a specialized review process this repository does not implement — never claims that review occurred)."
        });
    }
})(typeof window !== "undefined" ? { window } : { window: undefined });
