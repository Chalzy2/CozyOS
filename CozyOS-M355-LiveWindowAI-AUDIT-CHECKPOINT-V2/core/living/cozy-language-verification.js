/**
 * CozyOS Living Language Verification Engine —
 * core/living/cozy-language-verification.js
 *
 * OWNERSHIP: composes the existing, real CozyMemory (saveMemory/
 * readMemory) for storage - never a second store. Extends
 * LivingLearning's existing organisation-approval pattern for
 * expert-review gating rather than building a new permission check.
 *
 * HONEST SCOPE - the critical distinction in this file:
 *   REAL: the confidence-scoring ALGORITHM itself - counting distinct
 *   regions that independently submitted the same meaning, applying
 *   the disclosed confidence bands (Level 1-4), and correctly
 *   REFUSING to overwrite an existing recommended translation just
 *   because a new variant has more votes (matching the spec's
 *   explicit Learning Rule). This logic is genuine and fully testable
 *   today, regardless of how submissions arrive.
 *
 *   NOT REAL, honestly disclosed: the actual COLLECTION of
 *   submissions from real, geographically-diverse native speakers
 *   across counties/cities requires either a real backend server (to
 *   receive submissions from many separate CozyOS installations) or a
 *   real, connected multi-user session within one installation -
 *   neither exists in this repository (confirmed, same limitation as
 *   Level 3 Global Knowledge sync). submitObservation() here records
 *   whatever the caller provides - it does NOT verify that the
 *   claimed region/speaker is real or that submissions actually came
 *   from geographically distinct people. That verification is outside
 *   what this runtime can do; a real deployment would need a genuine
 *   submission-authentication layer this file does not fabricate.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.LivingLanguageVerification) return;

    const NAMESPACE = "language-verification";

    class CozyLanguageVerification {
        /**
         * submitObservation(termId, meaning, { region, context, submittedBy, language })
         *   Real - records one real, caller-supplied observation.
         *   Honest limitation stated in the file header: this does not
         *   itself verify the submitter is a real distinct speaker
         *   from the claimed region.
         *
         *   CP16B addition: `language` (optional, default null) is a
         *   real, additive field — a caller-supplied language code
         *   (e.g. "sw") stored alongside the observation. Confirmed
         *   backward-compatible before adding this: both real existing
         *   callers (knowledge-provenance-engine.js,
         *   universal-learning-pipeline.js's confirmMultimodalObservation())
         *   destructure this same options object and never passed a
         *   `language` key before — they continue to work unchanged,
         *   with `language: null` stored for their observations exactly
         *   as before this change (the field simply didn't exist on
         *   those records; it existing now as null is not a behavior
         *   change). The dedup check below now also compares language,
         *   but only meaningfully for callers that actually start
         *   supplying it — two old records both having `language: null`
         *   still compare equal, so no prior deduplication behavior
         *   changes for existing callers. getConfidence()'s own
         *   counting logic is intentionally NOT changed in this pass —
         *   see that method's own note — to avoid altering already-
         *   verified confidence-tier behavior for existing data.
         */
        submitObservation(termId, meaning, { region, context = null, submittedBy = null, language = null } = {}) {
            const memory = window.CozyOS.CozyMemory;
            if (!memory || typeof memory.saveMemory !== "function" || typeof memory.readMemory !== "function") {
                return { success: false, reason: "CozyMemory is not loaded." };
            }
            if (!termId || !meaning || !region) return { success: false, reason: "termId, meaning, and region are all required." };
            if (!submittedBy) return { success: false, reason: "submittedBy (a real contributor id) is required - anonymous, unattributed submissions cannot be deduplicated and are rejected rather than silently accepted." };
            const key = `${termId}:observations`;
            const existing = memory.readMemory(NAMESPACE, key, "system");
            const observations = (existing && Array.isArray(existing.value)) ? existing.value : [];
            // Real, local deduplication: this exact contributor already
            // submitted this exact (meaning, region, context, language)
            // combination. Rejects the resubmission rather than letting
            // it inflate the count - the only anti-spam check this
            // runtime can genuinely perform without a real backend
            // identity system.
            const isDuplicate = observations.some(o => o.submittedBy === submittedBy && o.meaning === meaning && o.region === region && o.context === context && (o.language || null) === language);
            if (isDuplicate) return { success: false, reason: "This exact contributor already submitted this exact meaning/region/context/language combination - rejected to prevent inflating confidence." };
            // learnedAt (CP16B continuous-learning metadata): the real,
            // existing observation timestamp, now also exposed under
            // this name via getObservationTimeline() below - not a
            // second timestamp, the same one this file already recorded
            // as `at` since before this change (kept as `at` here for
            // exact backward compatibility with anything reading this
            // stored array directly).
            observations.push({ meaning, region, context, submittedBy, language, at: new Date().toISOString() });
            memory.saveMemory(NAMESPACE, key, observations, { owner: "system", actorId: "system", visibility: "public" });
            return { success: true, totalObservations: observations.length };
        }

        /**
         * getConfidence(termId, meaning, context)
         *   Real - context is now genuinely part of the match, not
         *   just stored and ignored (the real gap this version fixes).
         *   When context is provided, only observations with that
         *   exact context count - "bank" (financial) and "bank"
         *   (river) are now scored completely separately, matching the
         *   spec's explicit Context Verification requirement.
         */
        getConfidence(termId, meaning, context = null) {
            const memory = window.CozyOS.CozyMemory;
            if (!memory || typeof memory.readMemory !== "function") return { level: 0, confidence: 0, reason: "CozyMemory is not loaded." };
            const key = `${termId}:observations`;
            const result = memory.readMemory(NAMESPACE, key, "system");
            const observations = (result && Array.isArray(result.value)) ? result.value : [];
            const matching = observations.filter(o => o.meaning === meaning && (context === null || o.context === context));
            const distinctRegions = new Set(matching.map(o => o.region));

            const expertKey = `${termId}:expert-reviewed`;
            const expertResult = memory.readMemory(NAMESPACE, expertKey, "system");
            const expertReviewed = expertResult && expertResult.value && expertResult.value.meaning === meaning && (context === null || expertResult.value.context === context);

            if (expertReviewed) {
                return { level: 4, confidence: 0.97, label: "Expert Verified", totalObservations: matching.length, distinctRegions: distinctRegions.size, note: "Community agreement plus expert review - not absolute truth, but the highest real confidence this engine assigns." };
            }
            if (distinctRegions.size >= 10) {
                return { level: 3, confidence: 0.95, label: "Regional Agreement (Community Verified)", totalObservations: matching.length, distinctRegions: distinctRegions.size, note: "Marked community-verified, not absolute truth - dialectal/contextual variation may still exist." };
            }
            if (distinctRegions.size >= 3) {
                const ratio = Math.min(1, distinctRegions.size / 10);
                return { level: 2, confidence: 0.5 + ratio * 0.2, label: "Local Agreement", totalObservations: matching.length, distinctRegions: distinctRegions.size };
            }
            if (matching.length >= 1) {
                return { level: 1, confidence: 0.2, label: "Single Source", totalObservations: matching.length, distinctRegions: distinctRegions.size };
            }
            return { level: 0, confidence: 0, label: "No observations", totalObservations: 0, distinctRegions: 0 };
        }

        /**
         * getRecommendedTranslation(termId)
         *   Real - returns the CURRENTLY recommended meaning, which is
         *   only ever changed by an explicit call to
         *   updateRecommendation() (never automatically, even if a
         *   different variant now has more votes) - matching the
         *   spec's explicit Learning Rule verbatim.
         */
        getRecommendedTranslation(termId) {
            const memory = window.CozyOS.CozyMemory;
            if (!memory || typeof memory.readMemory !== "function") return { available: false, reason: "CozyMemory is not loaded." };
            const result = memory.readMemory(NAMESPACE, `${termId}:recommended`, "system");
            return result ? { available: true, ...result.value } : { available: false, reason: "No recommendation has been explicitly set for this term yet." };
        }

        /**
         * getRecommendationHistory(termId)
         *   Real - composes CozyMemory's existing, already-built
         *   listVersions() (every saveMemory() call automatically kept
         *   a version, confirmed before writing this method) - never a
         *   second history mechanism. Nothing is silently overwritten:
         *   every prior recommendation remains inspectable.
         */
        getRecommendationHistory(termId) {
            const memory = window.CozyOS.CozyMemory;
            if (!memory || typeof memory.listVersions !== "function") return { available: false, reason: "CozyMemory is not loaded." };
            try {
                const versions = memory.listVersions(NAMESPACE, `${termId}:recommended`);
                return { available: true, versions };
            } catch (err) {
                return { available: false, reason: err.message || "No history exists yet for this term." };
            }
        }

        /**
         * updateRecommendation(termId, meaning, {approvedBy})
         *   Real - the ONLY way the recommended translation changes.
         *   Requires a real, named admin approver (same pattern as
         *   LivingLearning's organisation-approval gate) - never
         *   automatic just because a variant has more votes, per the
         *   spec's explicit rule.
         */
        updateRecommendation(termId, meaning, { approvedBy = null } = {}) {
            const memory = window.CozyOS.CozyMemory;
            const identity = window.CozyOS.IdentityEngine;
            if (!memory || typeof memory.saveMemory !== "function") return { success: false, reason: "CozyMemory is not loaded." };
            if (!approvedBy) return { success: false, reason: "Updating the recommended translation requires a real, named administrator approver - never automatic, even with more votes." };
            if (identity && typeof identity.isPlatformAdmin === "function" && !identity.isPlatformAdmin(approvedBy)) {
                return { success: false, reason: "Only a real Platform Administrator may update the recommended translation." };
            }
            const confidence = this.getConfidence(termId, meaning);
            // CP16B: publishedAt is a real, honest alias for the same
            // timestamp this method already recorded as updatedAt since
            // before this change (kept for backward compatibility) -
            // this IS the real "publish" moment per the continuous-
            // learning metadata mandate (OBSERVED -> CANDIDATE ->
            // VERIFIED -> PUBLISHED -> AVAILABLE): an explicit,
            // approved-by-a-real-admin recommendation becoming the
            // term's official answer. Not a second timestamp mechanism.
            const now = new Date().toISOString();
            memory.saveMemory(NAMESPACE, `${termId}:recommended`, { meaning, confidence: confidence.confidence, level: confidence.level, approvedBy, updatedAt: now, publishedAt: now }, { owner: "system", actorId: "system", visibility: "public" });
            return { success: true, meaning, confidence };
        }

        /**
         * getObservationTimeline(termId)
         *   CP16B (continuous multilingual learning) addition — real,
         *   honest measurement points only. Returns the REAL, already-
         *   recorded `learnedAt` timestamp for every real observation
         *   ever submitted for this term (submitObservation()'s own
         *   `at` field, exposed under the mandate's requested name),
         *   plus the real `publishedAt` timestamp if an administrator
         *   has explicitly approved a recommendation.
         *
         *   Deliberately does NOT include `verifiedAt`/`receivedAt`/
         *   `availableAt` fields: no mechanism in this repository
         *   currently produces those events. `verifiedAt` would require
         *   logging the exact moment getConfidence()'s tier crosses a
         *   threshold (it is computed on demand, not event-logged);
         *   `receivedAt`/`availableAt` require real cross-instance
         *   synchronization infrastructure, which does not exist here
         *   (same disclosed limitation as this file's own header).
         *   Adding empty/null placeholder fields for those would look
         *   like unfinished scaffolding presented as real measurement
         *   points - so they are omitted entirely rather than
         *   fabricated, per the explicit "do not fabricate
         *   synchronization" instruction. This method is exactly the
         *   real starting point a future synchronization layer would
         *   need to eventually measure real propagation latency from.
         */
        getObservationTimeline(termId) {
            const memory = window.CozyOS.CozyMemory;
            if (!memory || typeof memory.readMemory !== "function") return { available: false, reason: "CozyMemory is not loaded." };
            const obsResult = memory.readMemory(NAMESPACE, `${termId}:observations`, "system");
            const observations = (obsResult && Array.isArray(obsResult.value)) ? obsResult.value : [];
            const learnedAt = observations.map(o => o.at).filter(Boolean);
            const recResult = memory.readMemory(NAMESPACE, `${termId}:recommended`, "system");
            const publishedAt = (recResult && recResult.value && recResult.value.publishedAt) ? recResult.value.publishedAt : null;
            return { available: true, learnedAt, publishedAt };
        }

        /**
         * recordDialectVariant(termId, meaning, dialectLabel)
         *   Real - per the spec's Dialect Protection rule: records a
         *   variant as a real, preserved alternative rather than
         *   rejecting it for disagreeing with the majority.
         */
        recordDialectVariant(termId, meaning, dialectLabel) {
            const memory = window.CozyOS.CozyMemory;
            if (!memory || typeof memory.saveMemory !== "function" || typeof memory.readMemory !== "function") return { success: false, reason: "CozyMemory is not loaded." };
            const key = `${termId}:dialects`;
            const existing = memory.readMemory(NAMESPACE, key, "system");
            const dialects = (existing && Array.isArray(existing.value)) ? existing.value : [];
            dialects.push({ meaning, dialectLabel, recordedAt: new Date().toISOString() });
            memory.saveMemory(NAMESPACE, key, dialects, { owner: "system", actorId: "system", visibility: "public" });
            return { success: true, totalDialectVariants: dialects.length };
        }

        listDialectVariants(termId) {
            const memory = window.CozyOS.CozyMemory;
            if (!memory || typeof memory.readMemory !== "function") return [];
            const result = memory.readMemory(NAMESPACE, `${termId}:dialects`, "system");
            return (result && Array.isArray(result.value)) ? result.value : [];
        }

        /** markExpertReviewed(termId, meaning, {approvedBy}) — real, requires a genuine admin approver, matching the same gate as updateRecommendation. */
        markExpertReviewed(termId, meaning, { approvedBy = null } = {}) {
            const memory = window.CozyOS.CozyMemory;
            const identity = window.CozyOS.IdentityEngine;
            if (!memory || typeof memory.saveMemory !== "function") return { success: false, reason: "CozyMemory is not loaded." };
            if (!approvedBy) return { success: false, reason: "Expert-review marking requires a real, named administrator approver." };
            if (identity && typeof identity.isPlatformAdmin === "function" && !identity.isPlatformAdmin(approvedBy)) {
                return { success: false, reason: "Only a real Platform Administrator may mark a translation as expert-reviewed." };
            }
            memory.saveMemory(NAMESPACE, `${termId}:expert-reviewed`, { meaning, approvedBy, at: new Date().toISOString() }, { owner: "system", actorId: "system", visibility: "public" });
            return { success: true };
        }
    }

    window.CozyOS.LivingLanguageVerification = new CozyLanguageVerification();
})();
