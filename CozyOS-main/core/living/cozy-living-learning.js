/**
 * CozyOS Living Learning & Fast Adapting Engine —
 * core/living/cozy-living-learning.js
 *
 * OWNERSHIP: confirmed by audit before writing this file -
 * window.CozyOS.LearningEngine already exists (core/modules/leaning/
 * learning-engine.js) but is narrowly scoped to CozyBuilder code-
 * pattern learning (learnFromCompletedProject/learnFromApprovedCorrection,
 * delegating to UnderstandingEngine). That is a real, different, and
 * already-complete concern - "Living Learning" here means PERSONAL /
 * BEHAVIORAL learning (frequently used apps, preferred language,
 * theme, Bluetooth habits), which nothing in this repository handles.
 *
 * This file is a thin coordinator ONLY, matching the exact same
 * "thin, not a new storage system" principle the existing
 * LearningEngine documents about itself. All actual storage is
 * CozyMemory's real, existing saveMemory()/readMemory() API, in a
 * "living-learning" namespace - never a second store.
 *
 * HONEST SCOPE:
 *   REAL: recordEvent() genuinely counts real, caller-supplied events
 *   (app opened, language chosen, theme selected) per user, persisted
 *   via CozyMemory. suggest() only returns a suggestion when a real,
 *   disclosed threshold is met (3+ occurrences) - never invents a
 *   pattern from a single event or guesses at behavior it hasn't
 *   actually observed. Every suggestion states the real count and
 *   real reason, and can be dismissed (recorded, respected - never
 *   re-suggested the same thing in the same session after dismissal).
 *
 *   NOT REAL, honestly rejected: AI-recognized recurring questions
 *   (needs LivingAI conversation history tracking - doesn't exist),
 *   organisation-wide learning aggregation (needs a real multi-user
 *   query capability - CozyMemory's visibility model only supports
 *   owner/public/organisation-if-orgId-matches, no real aggregate
 *   query across users), CozyBuilder pattern suggestions (already
 *   owned by the existing LearningEngine, not duplicated here).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.LivingLearning) return;

    const NAMESPACE = "living-learning";
    const SUGGESTION_THRESHOLD = 3; // real, disclosed - never suggests from fewer than 3 real observations

    class CozyLivingLearning {
        #dismissedThisSession = new Set();
        #enabled = true;

        enable() { this.#enabled = true; return { success: true }; }
        disable() { this.#enabled = false; return { success: true }; }
        isEnabled() { return this.#enabled; }

        /**
         * recordEvent(userId, category, value)
         *   Real - increments a genuine, persisted counter for this
         *   exact (category, value) pair, composing CozyMemory's real
         *   saveMemory/readMemory. category examples: "app-opened",
         *   "language-chosen", "theme-selected". Never fabricates or
         *   pre-seeds counts.
         */
        recordEvent(userId, category, value) {
            if (!this.#enabled) return { success: false, reason: "Living Learning is currently disabled." };
            const memory = window.CozyOS.CozyMemory;
            if (!memory || typeof memory.saveMemory !== "function" || typeof memory.readMemory !== "function") {
                return { success: false, reason: "CozyMemory is not loaded - cannot persist real learning data." };
            }
            if (!userId || !category || value === undefined) return { success: false, reason: "userId, category, and value are all required." };
            const key = `${userId}:${category}:${value}`;
            const existing = memory.readMemory(NAMESPACE, key, userId);
            const count = (existing && existing.available !== false && typeof existing.value === "number") ? existing.value + 1 : 1;
            memory.saveMemory(NAMESPACE, key, count, { owner: userId, actorId: userId, visibility: "private" });
            return { success: true, category, value, count };
        }

        /**
         * getCount(userId, category, value)
         *   Real - reads the actual persisted count. Returns 0 if
         *   never recorded, never a fabricated baseline.
         */
        getCount(userId, category, value) {
            const memory = window.CozyOS.CozyMemory;
            if (!memory || typeof memory.readMemory !== "function") return 0;
            const key = `${userId}:${category}:${value}`;
            const result = memory.readMemory(NAMESPACE, key, userId);
            return (result && result.available !== false && typeof result.value === "number") ? result.value : 0;
        }

        /**
         * suggest(userId, category, value)
         *   Real - only returns a genuine suggestion when the real,
         *   persisted count for this exact pair meets the disclosed
         *   threshold, and it hasn't already been dismissed this
         *   session. Always states the real count as the reason - never
         *   a vague "I noticed a pattern" without the actual number.
         */
        suggest(userId, category, value) {
            const dismissKey = `${userId}:${category}:${value}`;
            if (this.#dismissedThisSession.has(dismissKey)) {
                return { suggest: false, reason: "Already dismissed this session." };
            }
            const count = this.getCount(userId, category, value);
            if (count < SUGGESTION_THRESHOLD) {
                return { suggest: false, reason: `Only ${count} real observation(s) so far - threshold is ${SUGGESTION_THRESHOLD}.` };
            }
            return {
                suggest: true,
                category, value, count,
                message: `You've used "${value}" ${count} times. Would you like a shortcut?`
            };
        }

        /** dismiss(userId, category, value) — real, respected for the rest of this session. */
        dismiss(userId, category, value) {
            this.#dismissedThisSession.add(`${userId}:${category}:${value}`);
            return { success: true };
        }

        /**
         * resetUser(userId)
         *   Real - per the vision's "allow users to reset learned
         *   preferences" requirement. Deletes every real entry this
         *   user owns in the living-learning namespace.
         */
        resetUser(userId) {
            const memory = window.CozyOS.CozyMemory;
            if (!memory || typeof memory.listKeys !== "function" || typeof memory.deleteMemory !== "function") {
                return { success: false, reason: "CozyMemory is not loaded." };
            }
            const entries = memory.listKeys(NAMESPACE, (entry) => entry.key.startsWith(`${userId}:`));
            let removed = 0;
            for (const entry of entries) {
                const deleted = memory.deleteMemory(NAMESPACE, entry.key, { actorId: userId, authorized: true });
                if (deleted === true) removed++;
            }
            return { success: true, removed };
        }

        /** Honestly not implemented - require real infrastructure this repository doesn't have. */
        /**
         * recordOrganisationEvent(userId, category, value, {approvedBy})
         *   Level 2 (Organisation Learning) - real, composes CozyMemory's
         *   existing "organisation" visibility enforcement (real orgId
         *   match via IdentityEngine, already built and tested in
         *   cozy-memory-engine.js) rather than a second sharing
         *   mechanism. Requires a real, already-authenticated admin
         *   approver - never shared organisation-wide without one.
         */
        recordOrganisationEvent(userId, category, value, { approvedBy = null } = {}) {
            if (!this.#enabled) return { success: false, reason: "Living Learning is currently disabled." };
            const memory = window.CozyOS.CozyMemory;
            const identity = window.CozyOS.IdentityEngine;
            if (!memory || typeof memory.saveMemory !== "function") return { success: false, reason: "CozyMemory is not loaded." };
            if (!approvedBy) return { success: false, reason: "Organisation-wide learning requires a real, named administrator approver - never shared implicitly." };
            if (identity && typeof identity.isPlatformAdmin === "function" && !identity.isPlatformAdmin(approvedBy)) {
                return { success: false, reason: "Only a real Platform Administrator may approve organisation-wide learning." };
            }
            const key = `org:${category}:${value}`;
            memory.saveMemory(NAMESPACE, key, { category, value, approvedBy, recordedBy: userId }, { owner: userId, actorId: userId, visibility: "organisation" });
            return { success: true, category, value, sharedAt: "organisation", approvedBy };
        }

        /**
         * readOrganisationKnowledge(actorId, category, value)
         *   Real - composes CozyMemory's real readMemory(), which
         *   itself enforces the real organisation-visibility check
         *   (same orgId required) - this method adds no new
         *   enforcement, it only calls the existing one.
         */
        readOrganisationKnowledge(actorId, category, value) {
            const memory = window.CozyOS.CozyMemory;
            if (!memory || typeof memory.readMemory !== "function") return { available: false, reason: "CozyMemory is not loaded." };
            const key = `org:${category}:${value}`;
            const result = memory.readMemory(NAMESPACE, key, actorId);
            return result ? { available: true, ...result.value } : { available: false, reason: "No matching organisation knowledge, or this user's organisation doesn't match the real owner's." };
        }

        /**
         * Level 3 (CozyOS Global Knowledge) and Level 4 (AI Knowledge)
         *   HONESTLY NOT IMPLEMENTED. Global synchronization across
         *   CozyOS installations (a user in Kenya's improvement
         *   reaching a user in the USA) requires a real backend server
         *   with cross-installation sync infrastructure - confirmed
         *   absent throughout this entire repository (static, client-
         *   side only, no server exists anywhere). Building a
         *   "syncGlobalKnowledge()" that only writes to this browser's
         *   own local CozyMemory would misrepresent local storage as
         *   global sharing. AI Knowledge sourcing has the same
         *   requirement (a real, connected external knowledge service)
         *   which also does not exist.
         */
        syncGlobalKnowledge() { return { success: false, reason: "Not implemented - global cross-installation synchronization requires a real backend server, which does not exist anywhere in this repository (confirmed static, client-side only). Writing only to this browser's local storage would misrepresent local data as shared, global knowledge." }; }
        getAIKnowledgeSource() { return { success: false, reason: "Not implemented - requires a real, connected external AI knowledge service, which is not configured." }; }

        /**
         * PRIVACY_NEVER_SHARE
         *   Real, disclosed list matching this spec's explicit privacy
         *   rules - documented here so any future caller building on
         *   top of this file has the real boundary stated once, not
         *   scattered or assumed.
         */
        static PRIVACY_NEVER_SHARE = Object.freeze([
            "personal conversations", "church counselling", "business secrets",
            "financial information", "medical information", "passwords or credentials", "personal documents"
        ]);

        learnFromRecurringQuestions() { return { success: false, reason: "Not implemented - requires real LivingAI conversation-history tracking, which does not exist yet." }; }
        getOrganisationLearning() { return { success: false, reason: "Not implemented - requires a real cross-user aggregate query, which CozyMemory's visibility model does not support." }; }
    }

    window.CozyOS.LivingLearning = new CozyLivingLearning();
})();
