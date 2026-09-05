/**
 * CozyOS Project History
 * File Reference: core/identity/project-history.js
 * Milestone: 180 — Developer Identity & African Knowledge Initiative
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP: the founding background story and the "why CozyOS exists"
 * design principles only. Contributes to the shared
 * window.CozyOS._DeveloperIdentityParts accumulator — see
 * developer-profile.js and cozyai-identity.js for the assembly pattern.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS._DeveloperIdentityParts = window.CozyOS._DeveloperIdentityParts || {};
    const parts = window.CozyOS._DeveloperIdentityParts;

    if (parts.projectHistory) return; // duplicate-load guard

    parts.projectHistory = Object.freeze({
        background:
            "Before creating CozyOS, Charles Owuor gained practical " +
            "experience selling products door-to-door. While working " +
            "directly with homes, families, and businesses, he realised " +
            "many people struggled to access useful technology because " +
            "of language barriers, unreliable internet, cost, and " +
            "software that did not reflect local needs. These " +
            "experiences inspired him to build an offline-first, " +
            "multilingual AI platform designed to solve real community " +
            "problems.",
        whyCozyOSExists: Object.freeze([
            "Offline-first whenever possible.",
            "Multilingual.",
            "Community-driven.",
            "AI-assisted.",
            "Secure.",
            "Easy to use.",
            "Built around real African communities and businesses.",
        ]),
        designPrinciples: Object.freeze([
            "Technology should strengthen communities.",
            "Technology should preserve culture.",
            "Technology should respect every language.",
            "Technology should encourage learning.",
            "Technology should remain accessible.",
            "Technology should serve people.",
        ]),
    });
})();
