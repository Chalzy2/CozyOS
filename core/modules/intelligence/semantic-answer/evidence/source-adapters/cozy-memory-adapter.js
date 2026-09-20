/**
 * CozyAI — CozyMemory Evidence Adapter (SA-2)
 * File Reference: core/modules/intelligence/semantic-answer/evidence/source-adapters/cozy-memory-adapter.js
 *
 * WHAT THIS IS
 *   Converts real, already-authorized window.CozyOS.CozyMemory entries
 *   into normalized cozy.verified-evidence.v1 records. Read-only: only
 *   ever calls CozyMemory.readMemory()/searchMemory()/searchAllNamespaces()
 *   (real, existing methods — never a mutator), and never rewrites or
 *   deletes a source entry.
 *
 * AUTHORIZATION — REUSES THE EXISTING BOUNDARY, NEVER A NEW ONE
 *   CozyMemory's own real #checkReadVisibility() (core/modules/memory/
 *   cozy-memory-engine.js) already enforces: an entry with no owner is
 *   open to anyone; an entry with an owner is visible to that owner (or
 *   actorId "system"); "public"-visibility entries are visible to
 *   anyone; "organisation"-visibility entries are visible only to an
 *   actor sharing the real owner's IdentityEngine.getUser().orgId.
 *   "team"/"department"/"family" are CozyMemory's own honestly-
 *   unenforced values, treated identically to "private" by that engine
 *   itself (its own header discloses this — not something this file
 *   invents or changes).
 *
 *   This adapter passes accessContext.actorId straight through to those
 *   real methods and trusts their own real enforcement completely —
 *   it never re-implements or second-guesses CozyMemory's own owner/
 *   visibility check.
 *
 * THE ONE ADDITIONAL, REAL PATH THIS ADAPTER ADDS: PLATFORM SUPPORT
 *   CozyMemory itself has no concept of CozyOS platform support at all
 *   (confirmed by reading #checkReadVisibility() — it only ever checks
 *   owner/system/public/organisation). The recent ChurchOS work
 *   established a real, generic, scoped, time-boxed, auditable
 *   OrganizationSupport authority (core/organization/organization-
 *   support.js) for exactly this kind of "a CozyOS platform admin may
 *   see organization-scoped material only under a real, active grant"
 *   need — this file composes that SAME real authority, the same
 *   pattern already used by church-live-moderation.js and its siblings
 *   (derive isPlatformAdmin fresh from IdentityEngine, then check a
 *   real, active, correctly-scoped grant — never a trusted client
 *   flag), rather than inventing a second support/elevation mechanism.
 *
 *   When accessContext.organizationId is given AND the real
 *   IdentityEngine confirms accessContext.actorId is a genuine platform
 *   admin AND OrganizationSupport.isSupportActive(organizationId,
 *   actorId, {requiredScope:"view-organization-knowledge"}) reports a
 *   real, live grant, this adapter queries CozyMemory using the
 *   effective actorId "system" (CozyMemory's OWN existing bypass
 *   identity — not a new one) FOR THIS QUERY ONLY, then immediately,
 *   structurally restricts the results it will ever turn into evidence
 *   to entries whose real visibility is "organisation" — "private" (and
 *   the honestly-private team/department/family values) are NEVER
 *   exposed via this path, regardless of who owns them, so an
 *   authorized support grant can never be used to read an unrelated
 *   user's private memory. Every use of this path is recorded via
 *   OrganizationSupport.recordSupportAction() for the same real audit
 *   trail every other support-gated action in this repository already
 *   uses. Without a real, active, correctly-scoped grant, this file
 *   falls straight back to CozyMemory's own real, unmodified actorId-
 *   based check — never an implicit `isAuthenticated === true` shortcut,
 *   and never a trust of any isPlatformAdmin/organizationId/role value
 *   the caller's accessContext claims — every fact is independently
 *   re-derived from the real IdentityEngine/OrganizationSupport
 *   authorities on every call.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-sa2";
    if (window.CozyOS.Modules["cozy-memory-evidence-adapter"]) return;

    const SOURCE_TYPE = Object.freeze({
        USER_MEMORY: "USER_MEMORY",
        ORGANIZATION_KNOWLEDGE: "ORGANIZATION_KNOWLEDGE",
        PUBLIC_KNOWLEDGE: "PUBLIC_KNOWLEDGE",
    });

    // The real requiredScope this adapter checks for the platform-
    // support elevation path (see this file's own header). Not yet
    // offered as a checkbox in organization-support-panel.js's own
    // KNOWN_SCOPES catalog (a UI-only list — grantSupport() itself
    // never validates scope names against it, per that file's own
    // comment) — a real grant can already be issued with this scope
    // programmatically; adding the UI checkbox is a disclosed, separate,
    // later follow-up, not required for this adapter to work correctly.
    const SUPPORT_SCOPE = "view-organization-knowledge";

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

    function sensitivityForVisibility(visibility) {
        if (visibility === "public") return "PUBLIC";
        if (visibility === "organisation") return "ORGANIZATION";
        // "private" and CozyMemory's own honestly-unenforced "team"/
        // "department"/"family" values (see this file's own header) —
        // all real, all treated as PRIVATE here, matching CozyMemory's
        // own disclosed rule rather than inventing a wider category.
        return "PRIVATE";
    }

    function sourceTypeForVisibility(visibility) {
        if (visibility === "public") return SOURCE_TYPE.PUBLIC_KNOWLEDGE;
        if (visibility === "organisation") return SOURCE_TYPE.ORGANIZATION_KNOWLEDGE;
        return SOURCE_TYPE.USER_MEMORY;
    }

    /**
     * #resolveEffectiveActorId(accessContext)
     *   Real. Returns {actorId, elevated, grantId}. Never trusts a
     *   caller-supplied isPlatformAdmin/role flag — isPlatformAdmin is
     *   independently re-derived from the real, loaded IdentityEngine
     *   every call, and the support grant is independently re-verified
     *   from the real, loaded OrganizationSupport every call. Degrades
     *   to the plain, unelevated actorId whenever any real authority is
     *   missing or reports no active grant — never assumes elevation by
     *   default.
     */
    function resolveEffectiveActorId(accessContext) {
        const actorId = accessContext && accessContext.actorId;
        const organizationId = accessContext && accessContext.organizationId;
        if (!organizationId) return { actorId, elevated: false, grantId: null };

        const identity = window.CozyOS.IdentityEngine;
        const support = window.CozyOS.OrganizationSupport;
        if (!identity || typeof identity.isPlatformAdmin !== "function" || !actorId || !identity.isPlatformAdmin(actorId)) {
            return { actorId, elevated: false, grantId: null };
        }
        if (!support || typeof support.isSupportActive !== "function") return { actorId, elevated: false, grantId: null };

        const grant = support.isSupportActive(organizationId, actorId, { requiredScope: SUPPORT_SCOPE });
        if (!grant || !grant.active) return { actorId, elevated: false, grantId: null };

        if (typeof support.recordSupportAction === "function") {
            try { support.recordSupportAction(grant.grantId, "evidence-adapter-organization-knowledge-accessed", { organizationId }); } catch (_err) { /* non-fatal — never blocks a real, already-authorized read */ }
        }
        return { actorId: "system", elevated: true, grantId: grant.grantId };
    }

    function buildEvidenceFromEntry({ namespace, key, entry, elevated, evidenceContract }) {
        const visibility = entry.visibility || "private";
        // Structural isolation guarantee for the elevated (platform-
        // support) path — see this file's own header. A private/
        // honestly-unenforced-category entry is NEVER turned into
        // evidence when the query only succeeded because of elevation.
        if (elevated && visibility !== "organisation") return null;

        const claim = isNonEmptyString(entry.value) ? entry.value : JSON.stringify(entry.value);
        if (!isNonEmptyString(claim)) return null;

        const fields = {
            id: `memory:${namespace}:${key}:${entry.versionNumber}`,
            claim,
            source: Object.freeze({ type: sourceTypeForVisibility(visibility), id: `${namespace}:${key}` }),
            verification: Object.freeze({ status: "CURATED", confidence: "MEDIUM" }),
            sensitivity: sensitivityForVisibility(visibility),
            provenance: "window.CozyOS.CozyMemory",
        };
        const built = evidenceContract && typeof evidenceContract.create === "function" ? evidenceContract.create(fields) : { success: true, evidence: Object.assign({ schemaVersion: "cozy.verified-evidence.v1" }, fields) };
        return built.success ? built.evidence : null;
    }

    /**
     * adaptFromSearch({namespace, query, accessContext})
     *   Real. namespace is optional — omitted, this searches every real
     *   namespace (CozyMemory.searchAllNamespaces()); given, scopes to
     *   that one real namespace (CozyMemory.searchMemory()). Every
     *   result CozyMemory itself already authorized for the effective
     *   actorId is turned into evidence; nothing else is ever seen.
     */
    function adaptFromSearch({ namespace = null, query, accessContext = {} } = {}) {
        const memory = window.CozyOS.CozyMemory;
        const evidenceContract = window.CozyOS.VerifiedEvidenceContract;
        if (!memory) return { success: false, evidence: [], errors: ["window.CozyOS.CozyMemory is not loaded."] };
        if (!isNonEmptyString(query)) return { success: false, evidence: [], errors: ["A real, non-empty query is required."] };

        const { actorId: effectiveActorId, elevated } = resolveEffectiveActorId(accessContext);
        let hits;
        try {
            hits = namespace ? memory.searchMemory(namespace, query, effectiveActorId).map((h) => ({ namespace, ...h })) : memory.searchAllNamespaces(query, effectiveActorId);
        } catch (err) {
            return { success: false, evidence: [], errors: [`CozyMemory search failed: ${err.message}`] };
        }

        const evidence = [];
        for (const hit of hits) {
            const rec = buildEvidenceFromEntry({ namespace: hit.namespace, key: hit.key, entry: hit.entry, elevated, evidenceContract });
            if (rec) evidence.push(rec);
        }
        return { success: true, evidence, errors: [] };
    }

    /** adaptFromRead({namespace, key, accessContext}) — real, single-entry counterpart to adaptFromSearch(), via CozyMemory.readMemory(). */
    function adaptFromRead({ namespace, key, accessContext = {} } = {}) {
        const memory = window.CozyOS.CozyMemory;
        const evidenceContract = window.CozyOS.VerifiedEvidenceContract;
        if (!memory || typeof memory.readMemory !== "function") return { success: false, evidence: [], errors: ["window.CozyOS.CozyMemory is not loaded."] };
        if (!isNonEmptyString(namespace) || !isNonEmptyString(key)) return { success: false, evidence: [], errors: ["A real, non-empty namespace and key are required."] };

        const { actorId: effectiveActorId, elevated } = resolveEffectiveActorId(accessContext);
        const entry = memory.readMemory(namespace, key, effectiveActorId);
        if (!entry) return { success: false, evidence: [], errors: [`No real, authorized memory entry at "${namespace}/${key}" for this access context.`] };

        const rec = buildEvidenceFromEntry({ namespace, key, entry, elevated, evidenceContract });
        return rec ? { success: true, evidence: [rec], errors: [] } : { success: false, evidence: [], errors: ["The real entry exists but was excluded by this adapter's own isolation rule (see this file's own header)."] };
    }

    const CozyMemoryEvidenceAdapter = Object.freeze({
        SOURCE_TYPE, SUPPORT_SCOPE, adaptFromSearch, adaptFromRead, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.CozyMemoryEvidenceAdapter = CozyMemoryEvidenceAdapter;
    window.CozyOS.Modules["cozy-memory-evidence-adapter"] = Object.freeze({
        version: MODULE_VERSION,
        description: "SA-2 — CozyMemory Evidence Adapter. Converts already-authorized CozyMemory entries into VerifiedEvidence records, reusing CozyMemory's own real visibility enforcement plus one additional, real, audited platform-support path (OrganizationSupport) scoped to organisation-visibility entries only. Read-only; never mutates CozyMemory."
    });
})();
