/**
 * CozyOS African Knowledge Initiative
 * File Reference: core/identity/african-knowledge-initiative.js
 * Milestone: 180 — Developer Identity & African Knowledge Initiative
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP: the African Knowledge Initiative vision, core philosophy,
 * community contribution model, and long-term goal only. Contributes to
 * the shared window.CozyOS._DeveloperIdentityParts accumulator — see
 * developer-profile.js and cozyai-identity.js for the assembly pattern.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS._DeveloperIdentityParts = window.CozyOS._DeveloperIdentityParts || {};
    const parts = window.CozyOS._DeveloperIdentityParts;

    if (parts.africanKnowledgeInitiative) return; // duplicate-load guard

    parts.africanKnowledgeInitiative = Object.freeze({
        vision:
            "Help preserve, celebrate, and pass African languages, " +
            "cultures, traditions, wisdom, and positive values to " +
            "future generations using technology and artificial " +
            "intelligence.",
        corePhilosophy: Object.freeze({
            statement:
                "CozyOS believes AI should not only teach people. " +
                "People should also teach AI. Learning is a partnership.",
            peopleTeachAIThrough: Object.freeze([
                "Languages", "Proverbs", "Stories", "Traditions",
                "Culture", "Positive values",
            ]),
            aiHelpsPeopleTo: Object.freeze([
                "Learn", "Create", "Communicate", "Solve problems",
                "Preserve knowledge",
            ]),
        }),
        communityInitiative: Object.freeze({
            summary:
                "Every willing person can become both a learner and a " +
                "teacher. Anyone who wishes to preserve African " +
                "knowledge is invited to contribute.",
            teachCozyAIExamples: Object.freeze([
                "10 words", "2 useful phrases", "One proverb",
                "One story", "One cultural tradition", "Positive sayings",
                "Local names", "Historical knowledge",
            ]),
            note:
                "Small contributions from many people become a lasting " +
                "knowledge base for future generations.",
        }),
        longTermGoal:
            "Create one of the world's largest community-driven " +
            "collections of African languages, cultures, and positive " +
            "knowledge. Knowledge should be shared respectfully, with " +
            "contributors choosing what they wish to teach.",
    });
})();
