/**
 * core/living/cozy-teach-flow.js
 * PHASE 3 — Teach Cozy / Governed Learning: Live Window conversational
 * orchestrator.
 *
 * WHAT THIS IS
 *   The ONE new file that lets a user teach CozyAI something by talking
 *   to the EXISTING Live Window, through the EXISTING CozyAI/CozyLearn
 *   pipeline. It creates NO new chat surface, NO new AI, NO new
 *   governance state machine, and NO new persistence store:
 *
 *     - Detects explicit teaching intent via the real, disclosed
 *       window.CozyOS.CozyTeachIntent.detectTeachingIntent() classifier.
 *     - Resolves an optional "subject" (a real, known application name)
 *       the SAME way cozy-ai.js's own _resolveNamedApplication() does —
 *       via window.CozyOS.listApplications() (the same real registry
 *       facade), never a second application inventory.
 *     - Checks for conflict with existing verified knowledge via the
 *       real, disclosed window.CozyOS.CozyLearn.checkConflict().
 *     - Creates/confirms/promotes candidates through CozyLearn's own
 *       real, existing OBSERVED -> CANDIDATE -> USER_CONFIRMED -> TRUSTED
 *       state machine — never reimplemented here.
 *
 * GOVERNANCE DISCIPLINE
 *   - A candidate is NEVER created for a conflicting claim — the user is
 *     told about the existing verified fact instead, and nothing is
 *     recorded. This is a disclosed, intentionally conservative choice:
 *     resolving a genuine conflict between a user's claim and existing
 *     verified knowledge is a human decision this phase does not
 *     automate.
 *   - A candidate is NEVER auto-promoted to TRUSTED without the SAME
 *     user's own explicit confirmation in the NEXT turn (yes/no,
 *     interpreted via CozyLearn's own interpretConfirmationResponse() —
 *     never assumed from an ambiguous reply).
 *   - Self-teaching (through this conversational flow) only ever
 *     confirms/promotes at the candidate's own scope as created — always
 *     "USER" here (this actor's own private scope). Widening a taught
 *     candidate to COMMUNITY/ORGANIZATION/GLOBAL is a separate,
 *     out-of-scope admin action this phase does not build.
 *
 * CONVERSATION STATE
 *   `teachConversationState` carries { pendingCandidateId } across turns
 *   — the exact same "small, disclosed, caller-carried state object"
 *   pattern businessConversationState already established (Phase 2). It
 *   is threaded through cozy-ai.js/cozy-answer-engine.js/
 *   cozy-living-assistant.js the same way.
 */
(function (root) {
    "use strict";

    function cozyOS() {
        return (root && root.window && root.window.CozyOS) || (typeof window !== "undefined" ? window.CozyOS : null);
    }
    function teachIntent() { const c = cozyOS(); return c && c.CozyTeachIntent; }
    function cozyLearn() { const c = cozyOS(); return c && c.CozyLearn; }

    /**
     * resolveSubject(text) — same two-source lookup, same exact-
     * substring pass, as cozy-ai.js's own _resolveNamedApplication()
     * first pass (never the fuzzy/Levenshtein second pass here — a
     * teaching claim's subject must be unambiguous, not guessed).
     */
    function resolveSubject(text) {
        const c = cozyOS();
        if (!c) return null;
        let apps = [];
        if (typeof c.listApplications === "function") {
            try { apps = c.listApplications() || []; } catch (_err) { apps = []; }
        } else if (c.ServiceRegistry && typeof c.ServiceRegistry.listApplications === "function") {
            try { apps = c.ServiceRegistry.listApplications() || []; } catch (_err) { apps = []; }
        }
        const validApps = apps.filter((a) => a && typeof a.name === "string" && a.name.trim().length > 0);
        const q = String(text || "").toLowerCase().replace(/\s+/g, "");
        const exact = validApps.find((a) => q.includes(a.name.toLowerCase().replace(/\s+/g, "")));
        return exact ? exact.name : null;
    }

    function buildConfirmPrompt(claim, subject, language) {
        const subjectPhrase = subject ? (language === "sw" ? ` kuhusu ${subject}` : ` about ${subject}`) : "";
        return language === "sw"
            ? `Nimeelewa - unanifundisha${subjectPhrase}: "${claim}". Je, hii ni sahihi? (ndiyo/hapana)`
            : `Got it - you're teaching me${subjectPhrase}: "${claim}". Is that correct? (yes/no)`;
    }

    function buildConflictPrompt(claim, existingFact, language) {
        return language === "sw"
            ? `Ninalo tayari jibu lililothibitishwa kuhusu hili ambalo linapingana na ulichosema: "${existingFact}". Sikuweza kurekodi "${claim}" kama ilivyo kwa sasa.`
            : `I already have a verified answer about this that conflicts with what you said: "${existingFact}". I have not recorded "${claim}" as-is.`;
    }

    function buildTrustedPrompt(language) {
        return language === "sw"
            ? "Asante - nimehifadhi hili. Nitalitumia ninapojibu maswali yanayohusiana."
            : "Thank you - I've saved that. I'll use it when answering related questions.";
    }

    function buildRejectedPrompt(language) {
        return language === "sw" ? "Sawa, sitalikumbuka hilo." : "Okay, I won't remember that.";
    }

    function buildUnclearPrompt(claim, language) {
        return language === "sw"
            ? `Samahani, sikuelewa. Je, "${claim}" ni sahihi? Tafadhali jibu ndiyo au hapana.`
            : `Sorry, I didn't understand. Is "${claim}" correct? Please answer yes or no.`;
    }

    /**
     * processTurn(question, { actorId, language, teachConversationState })
     *   Returns { matched: false } when this turn has nothing to do with
     *   teaching (the honest no-op — the rest of the answer chain
     *   proceeds exactly as before this phase), or
     *   { matched: true, content, evidence, updatedConversationState }
     *   when it does. `content` is real, final reply text — never
     *   further summarized by a caller.
     */
    function processTurn(question, options) {
        const opts = options || {};
        const language = opts.language === "sw" ? "sw" : "en";
        const actorId = opts.actorId || null;
        const learn = cozyLearn();
        if (!learn) return { matched: false };

        // --- Turn 2+: awaiting this same user's confirm/reject reply ---
        if (opts.teachConversationState && opts.teachConversationState.pendingCandidateId) {
            const candidateId = opts.teachConversationState.pendingCandidateId;
            const pendingClaim = opts.teachConversationState.pendingClaim || "";
            const pendingLanguage = opts.teachConversationState.pendingLanguage || language;
            const decision = learn.interpretConfirmationResponse(question);

            if (decision === "CONFIRM") {
                const confirmResult = learn.confirmCandidate(candidateId, { actorId, confirmedBy: actorId });
                if (!confirmResult.success) {
                    return { matched: true, content: buildRejectedPrompt(pendingLanguage), evidence: "REJECTED", updatedConversationState: null };
                }
                const promoteResult = learn.promoteCandidate(candidateId, { actorId, validatedBy: actorId, scope: confirmResult.candidate.scope });
                return {
                    matched: true,
                    content: buildTrustedPrompt(pendingLanguage),
                    evidence: promoteResult.success ? "TRUSTED" : "USER_CONFIRMED",
                    updatedConversationState: null
                };
            }
            if (decision === "REJECT") {
                learn.rejectCandidate(candidateId, { actorId, reason: "user-declined-confirmation" });
                return { matched: true, content: buildRejectedPrompt(pendingLanguage), evidence: "REJECTED", updatedConversationState: null };
            }
            // UNCLEAR — ask again, keep the SAME pending state (never
            // silently drop a real pending candidate on an ambiguous reply).
            return {
                matched: true,
                content: buildUnclearPrompt(pendingClaim, pendingLanguage),
                evidence: "CANDIDATE_PENDING",
                updatedConversationState: opts.teachConversationState
            };
        }

        // --- Turn 1: is this an explicit teaching statement at all? ---
        const intent = teachIntent();
        if (!intent) return { matched: false };
        const detected = intent.detectTeachingIntent(question, language);
        if (!detected.isTeaching) return { matched: false };

        const claim = detected.claim;
        const detectedLanguage = detected.language || language;
        const subject = resolveSubject(claim) || resolveSubject(question);

        if (subject) {
            const conflict = learn.checkConflict({ subject, claim, language: detectedLanguage });
            if (conflict.conflict) {
                return {
                    matched: true,
                    content: buildConflictPrompt(claim, conflict.existingFact, detectedLanguage),
                    evidence: "CONFLICT_DETECTED",
                    updatedConversationState: null
                };
            }
        }

        const candidate = learn.createCandidate({
            observedForm: subject || claim.slice(0, 60),
            subject,
            claim,
            language: detectedLanguage,
            category: "TAUGHT_FACT",
            scope: "USER",
            actorId,
            source: "live-window-teach",
            provenance: { capturedVia: "live-window-teach" }
        });

        return {
            matched: true,
            content: buildConfirmPrompt(claim, subject, detectedLanguage),
            evidence: "CANDIDATE_PENDING",
            updatedConversationState: { pendingCandidateId: candidate.candidateId, pendingClaim: claim, pendingLanguage: detectedLanguage }
        };
    }

    /**
     * answerFromTrustedTeaching(subject, { actorId, language, scopes })
     *   Composes CozyLearn.getTrustedTeachings() so a LATER question
     *   (not a teaching statement itself) can be answered from a
     *   previously TRUSTED taught claim about a known subject — the
     *   "EXISTING COZYAI USES APPROVED KNOWLEDGE" requirement. Returns
     *   null (honest no-op) when nothing TRUSTED matches. Defaults to
     *   ["USER", "GLOBAL"] — this actor's own taught facts plus any
     *   GLOBAL ones — never a wider scope unless the caller explicitly
     *   asks; CozyLearn.getTrustedTeachings() itself fails closed on any
     *   USER-scope entry whose actorId does not match.
     */
    function answerFromTrustedTeaching(subject, options) {
        const opts = options || {};
        const learn = cozyLearn();
        if (!learn || !subject) return null;
        const scopes = Array.isArray(opts.scopes) ? opts.scopes : ["USER", "GLOBAL"];
        const matches = learn.getTrustedTeachings(subject, { language: opts.language, scopes, actorId: opts.actorId || null });
        if (!matches || matches.length === 0) return null;
        const best = matches[matches.length - 1]; // most recently promoted
        const prefix = opts.language === "sw" ? "Ulichonifundisha: " : "What you taught me: ";
        return { claim: best.claim, content: prefix + best.claim, scope: best.scope, candidateId: best.candidateId };
    }

    const api = Object.freeze({ processTurn, answerFromTrustedTeaching });

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    if (root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        root.window.CozyOS.CozyTeachFlow = api;
        root.window.CozyOS.Modules["cozy-teach-flow"] = Object.freeze({
            version: "1.0.0",
            description: "PHASE 3 — Teach Cozy / Governed Learning: Live Window conversational orchestrator. Composes CozyTeachIntent (marker detection) + CozyLearn (real OBSERVED/CANDIDATE/USER_CONFIRMED/TRUSTED state machine + checkConflict) + the real application registry (subject resolution). Creates no new AI, no new chat surface, no new governance engine, no new persistence store."
        });
    }
})(typeof window !== "undefined" ? { window } : { window: (typeof global !== "undefined" ? (global.window = global.window || {}) : {}) });
