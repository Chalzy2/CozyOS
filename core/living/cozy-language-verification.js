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
         * submitObservation(termId, meaning, { region, context, submittedBy })
         *   Real - records one real, caller-supplied observation.
         *   Honest limitation stated in the file header: this does not
         *   itself verify the submitter is a real distinct speaker
         *   from the claimed region.
         */
        submitObservation(termId, meaning, { region, context = null, submittedBy = null } = {}) {
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
            // submitted this exact (meaning, region, context) combination.
            // Rejects the resubmission rather than letting it inflate the
            // count - the only anti-spam check this runtime can genuinely
            // perform without a real backend identity system.
            const isDuplicate = observations.some(o => o.submittedBy === submittedBy && o.meaning === meaning && o.region === region && o.context === context);
            if (isDuplicate) return { success: false, reason: "This exact contributor already submitted this exact meaning/region/context combination - rejected to prevent inflating confidence." };
            observations.push({ meaning, region, context, submittedBy, at: new Date().toISOString() });
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
            memory.saveMemory(NAMESPACE, `${termId}:recommended`, { meaning, confidence: confidence.confidence, level: confidence.level, approvedBy, updatedAt: new Date().toISOString() }, { owner: "system", actorId: "system", visibility: "public" });
            return { success: true, meaning, confidence };
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
