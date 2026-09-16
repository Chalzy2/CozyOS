/**
 * CozyOS Developer Profile
 * File Reference: core/identity/developer-profile.js
 * Milestone: 180 — Developer Identity & African Knowledge Initiative
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP: the public developer/founder profile only (name, known-as
 * aliases, roles, country) and the list of fields that must never be
 * exposed. Does NOT own user/trust identity — that remains
 * core/modules/identity/ (IdentityEngine, AuthCoordinator,
 * IdentityStorage), an unrelated subsystem. [Corrected M379/RP-006:
 * previously named "(CozyIdentity)" here — core/modules/identity/
 * cozy-identity.js was archived, not integrated, per
 * docs/builder/knowledge/duplicate-consolidation-registry.md DC-002;
 * the real, live subsystem in that directory is IdentityEngine and
 * its companions. This comment named the wrong, superseded file.]
 *
 * This file does not register anything on window.CozyOS directly. It
 * contributes its part to the shared, internal
 * window.CozyOS._DeveloperIdentityParts accumulator. The single public
 * object, window.CozyOS.DeveloperIdentity, is assembled and frozen by
 * cozyai-identity.js only after all four core/identity/ files have
 * contributed — see that file for the assembly/fail-closed logic.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS._DeveloperIdentityParts = window.CozyOS._DeveloperIdentityParts || {};
    const parts = window.CozyOS._DeveloperIdentityParts;

    if (parts.profile) return; // duplicate-load guard

    parts.profile = Object.freeze({
        officialName: "Charles Owuor",
        knownAs: Object.freeze(["Chalz Cozy", "Charles Cozy"]),
        roles: Object.freeze([
            "Founder of CozyOS",
            "Founder of CozyAI",
            "Lead Software Architect",
            "Lead Software Developer",
        ]),
        country: "Kenya",
    });

    // Fields that must never be exposed through the public
    // DeveloperIdentity API, per the Milestone 180 spec's Private
    // Profile section. Listed here (co-located with the profile it
    // guards) purely as documentation of intent — the actual public API
    // surface in cozyai-identity.js simply never reads or exposes any
    // of these, since no data source for them exists anywhere in this
    // module or the repository.
    parts.privateFieldsNeverExposed = Object.freeze([
        "parents", "brothers", "sisters", "nationalId", "phoneNumbers",
        "homeAddress", "passwords", "financialInformation",
        "recoveryInformation", "privateFamilyInformation",
    ]);
})();
