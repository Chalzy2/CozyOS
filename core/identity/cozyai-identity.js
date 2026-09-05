/**
 * CozyOS / CozyAI Developer Identity — Public API
 * File Reference: core/identity/cozyai-identity.js
 * Milestone: 180 — Developer Identity & African Knowledge Initiative
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP: this file is the sole place that reads
 * window.CozyOS._DeveloperIdentityParts (populated by
 * developer-profile.js, project-history.js, and
 * african-knowledge-initiative.js) and assembles the single public,
 * frozen object at window.CozyOS.DeveloperIdentity. No other file
 * writes to that name — per spec, "no other module should own
 * developer identity."
 *
 * FAIL-CLOSED: if any of the three required parts did not load (e.g. a
 * script tag was removed, or load order was broken), this file does
 * NOT register window.CozyOS.DeveloperIdentity at all, and logs a
 * console warning naming the missing part(s), rather than registering a
 * partial or fabricated object. This mirrors Engineering Governance
 * principle 10 ("If evidence is missing, fail closed rather than
 * infer").
 *
 * This is also the file CozyAI (core/ai.js) or any other consumer
 * should call for "who created you" / "why were you created" / "why
 * does CozyOS focus on Africa" style questions. core/ai.js itself is
 * NOT modified by this milestone (see Milestone-180-Gate1.md) — this
 * file only exposes the contract for that future, separately-reviewed
 * wiring.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.DeveloperIdentity) return; // duplicate-load guard

    const VERSION = "1.0.0-ENTERPRISE";
    const parts = window.CozyOS._DeveloperIdentityParts || {};
    const REQUIRED_PARTS = ["profile", "projectHistory", "africanKnowledgeInitiative"];
    const missing = REQUIRED_PARTS.filter((key) => !parts[key]);

    if (missing.length > 0) {
        if (typeof console !== "undefined" && console.warn) {
            console.warn(
                `[DeveloperIdentity] Not registering window.CozyOS.DeveloperIdentity — ` +
                `missing required part(s): ${missing.join(", ")}. ` +
                `Ensure developer-profile.js, project-history.js, and ` +
                `african-knowledge-initiative.js all load before this file.`
            );
        }
        return; // fail closed — do not register a partial/fabricated object
    }

    const { profile, projectHistory, africanKnowledgeInitiative } = parts;

    // Real, human-authored Kiswahili translations of profile.roles —
    // NOT a runtime/machine translation call (this file never performs
    // one, per its own "no LLM/neural capability" convention elsewhere
    // in this repository). Keyed by the exact English role string so a
    // future added role that has no Kiswahili entry yet honestly falls
    // back to its own English text via `ROLE_SW[r] || r` below, rather
    // than throwing or showing "undefined".
    const ROLE_SW = Object.freeze({
        "Founder of CozyOS": "Mwanzilishi wa CozyOS",
        "Founder of CozyAI": "Mwanzilishi wa CozyAI",
        "Lead Software Architect": "Mbunifu Mkuu wa Programu",
        "Lead Software Developer": "Msanidi Mkuu wa Programu",
    });

    /**
     * Honest "I don't know" response for anything not covered by the
     * canonical data above. Consumers (CozyAI or otherwise) should
     * prefer this over inventing an answer.
     */
    function unknown(topic) {
        return {
            known: false,
            answer: `I don't have that information${topic ? ` about "${topic}"` : ""}.`,
        };
    }

    const DeveloperIdentity = {
        getVersion() { return VERSION; },

        // ── Profile ──────────────────────────────────────────────────
        getProfile() { return profile; },
        getOfficialName() { return profile.officialName; },
        getKnownAs() { return profile.knownAs; },
        getRoles() { return profile.roles; },
        getCountry() { return profile.country; },

        // ── Project history / mission ───────────────────────────────
        getProjectHistory() { return projectHistory; },
        getMission() { return projectHistory.whyCozyOSExists; },
        getDesignPrinciples() { return projectHistory.designPrinciples; },

        // ── African Knowledge Initiative ────────────────────────────
        getAfricanKnowledgeInitiative() { return africanKnowledgeInitiative; },
        getVision() { return africanKnowledgeInitiative.vision; },
        getCorePhilosophy() { return africanKnowledgeInitiative.corePhilosophy; },
        getCommunityInitiative() { return africanKnowledgeInitiative.communityInitiative; },
        getLongTermGoal() { return africanKnowledgeInitiative.longTermGoal; },

        // ── Canonical public Q&A contract ───────────────────────────
        // Matches the Milestone 180 "Public Answers" section: each
        // named question is answered from exactly one canonical part.
        answerWhoCreatedYou(lang) {
            if (lang === "sw") {
                const rolesSw = profile.roles.map((r) => ROLE_SW[r] || r);
                return {
                    known: true,
                    answer:
                        `CozyOS na CozyAI vilianzishwa na ${profile.officialName} ` +
                        `(anayejulikana pia kama ${profile.knownAs.join(" / ")}) kutoka ${profile.country}, ` +
                        `ambaye ni ${rolesSw.join(", ")}.`,
                    source: "profile",
                };
            }
            return {
                known: true,
                answer:
                    `CozyOS and CozyAI were founded by ${profile.officialName} ` +
                    `(also known as ${profile.knownAs.join(" / ")}) from ${profile.country}, ` +
                    `who serves as ${profile.roles.join(", ")}.`,
                source: "profile",
            };
        },
        answerWhyCreated() {
            return { known: true, answer: projectHistory.background, source: "projectHistory" };
        },
        answerWhyAfricaFocus() {
            return { known: true, answer: africanKnowledgeInitiative.vision, source: "africanKnowledgeInitiative" };
        },

        /**
         * Generic lookup for any other question. Only resolves the
         * three canonical topics above by exact key; everything else
         * returns an honest "I don't have that information" rather
         * than guessing. This is the fallback CozyAI (or any consumer)
         * should call for phrasing this module doesn't special-case.
         */
        query(topic) {
            switch (topic) {
                case "who-created-you":
                case "creator":
                case "founder":
                    return this.answerWhoCreatedYou();
                case "why-created":
                case "why-cozyos-exists":
                case "mission":
                    return this.answerWhyCreated();
                case "why-africa-focus":
                case "african-knowledge-initiative":
                case "vision":
                    return this.answerWhyAfricaFocus();
                default:
                    return unknown(topic);
            }
        },

        // ── Privacy guard ────────────────────────────────────────────
        // No data source for any of these fields exists anywhere in
        // this module or the wider repository. This method exists so a
        // consumer that mistakenly asks for one gets an explicit,
        // honest refusal instead of `undefined` silently propagating.
        getPrivateInfo(_field) {
            return {
                known: false,
                answer: "This information is private and is not exposed by CozyOS.",
            };
        },

        getIntegrationManifest() {
            return {
                owns: ["developer profile", "project history", "African Knowledge Initiative", "public identity Q&A contract"],
                doesNotOwn: ["user/trust identity (CozyIdentity)", "CozyAI routing/inference (core/ai.js)"],
                consumerContract: ["window.CozyOS.DeveloperIdentity.query(topic)", "answerWhoCreatedYou()", "answerWhyCreated()", "answerWhyAfricaFocus()"],
                note: "core/ai.js is not wired to this module in Milestone 180 — see Milestone-180-Gate1.md.",
            };
        },
    };

    window.CozyOS.DeveloperIdentity = Object.freeze(DeveloperIdentity);
})();
