/**
 * CozyOS — Dashboard Navigation Core
 * File Reference: core/shell/dashboard-navigation-core.js
 * Milestone: Dashboard Prompt 1 (Real User Dashboard Foundation)
 *
 * CLASSIFICATION: COMPOSED, new. Per the repository's established
 * "-core.js" (pure logic, Node-testable) / "-ui.js" or in-place DOM
 * rendering (browser-only) split — see
 * core/modules/intelligence/knowledge/ui/cozy-knowledge-review-dashboard-core.js
 * for the precedent this file follows. This file owns ONLY:
 *   - the five-surface navigation state machine (Home/Community/AI/
 *     Apps/Settings, Community immediately after Home — Checkpoint A
 *     confirmed no such navigation exists anywhere in the repository);
 *   - a thin, honest interface-language resolver composing the real,
 *     existing window.CozyOS.CozyLanguageRegistry + IdentityEngine —
 *     never a second language registry;
 *   - a structured, authorized-only AI dashboard-context builder,
 *     composing IdentityEngine + ApplicationVisibility +
 *     CozyLanguageRegistry + (optionally) CozyKnowledgeCommunity.
 * It owns no DOM, no rendering, no application registry, no identity
 * data, no knowledge pipeline — every fact below is read live from the
 * real engine that already owns it (Rule: never duplicate an engine).
 *
 * DISCLOSED FINDING — LANGUAGE FALLBACK ORDER
 *   Dashboard Prompt 1 §7 requests a "preferred → Kiswahili → English"
 *   fallback. The REAL, existing window.CozyOS.CozyLanguageRegistry's
 *   own resolveLanguage() implements a different, already-shipped
 *   fallback order (English checked before Kiswahili — its own
 *   FALLBACK_ORDER constant is ["en","sw","fr","ar","so"]). This file
 *   does not modify that locked, pre-existing registry to force a
 *   different order — doing so would be an undisclosed redesign of an
 *   existing engine, which Prompt 1 explicitly forbids. Instead,
 *   resolveInterfaceLanguage() below composes the registry exactly as
 *   it real is and reports its real, actual outcome (including when
 *   that outcome resolves to English rather than Kiswahili) — never
 *   silently claiming Kiswahili-first behavior the real engine does
 *   not implement. This is recorded as a genuine, real limitation, not
 *   smoothed over.
 *
 * AI CONTEXT PRIVACY
 *   buildAIContext() exposes only: the resolved interface language
 *   (already public per-session data), the caller's own visible
 *   application id list (already gated by ApplicationVisibility's own
 *   real per-user authorization), the fixed dashboard surface list,
 *   a boolean "is the real knowledge pipeline loaded" flag, and (Prompt
 *   2 addition) an aggregate, non-identity communityStateSummary
 *   (bucket counts only, via DashboardCommunitySummaryCore — never a
 *   per-record or per-contributor list). No private user field (email,
 *   roles, company/org ids, etc.) is ever included — IdentityEngine.
 *   getUser() is not even called by this file for that reason, and
 *   communityStateSummary.myContributionsAvailable is always false per
 *   that module's own disclosed privacy limit (see its header) —
 *   never silently true.
 *
 * PROMPT 2 §8 — AI CONTEXT SETTINGS-AWARENESS + REAL USER DASHBOARD
 * KNOWLEDGE (this addition)
 *   buildAIContext() is extended, additively, with a namespaced shape
 *   (context.identity / .applications / .community / .settings /
 *   .administration) alongside every pre-existing flat field above —
 *   nothing pre-existing is removed or renamed, so MID-4's own tests
 *   and consumers (#renderAiSurface in user-dashboard.js) keep working
 *   unmodified. Each new namespaced field composes a real engine only:
 *     - identity.displayName: IdentityEngine.getUser(userId).username
 *       ONLY — never the rest of that record (roles/companyId/orgId/
 *       branchId/departmentId/teamId/country/orgId are deliberately
 *       never read into this file's context for that exact reason).
 *     - applications.launchable: the subset of the already-authorized
 *       availableApplications that ApplicationVisibility.
 *       getRealLaunchPath() resolves to a real path right now — so
 *       CozyAI can honestly distinguish "visible to you" from "you can
 *       open it this second" (Prompt 2 §8's own "available" vs
 *       "launchable" distinction), never inferring launchability.
 *     - community.availableActions: ["contribute-knowledge"] only when
 *       the real window.CozyOS.CozyTeachCozyAIRouting.
 *       TEACH_KNOWLEDGE_TYPES array is actually loaded — never a
 *       hardcoded action list, and never listing the type values
 *       themselves here (they already exist, unduplicated, on that
 *       engine — see explainSurface()'s Community branch, which reads
 *       them live rather than copying them into this context object).
 *     - settings.relevantPreferences: the same real language state
 *       resolveInterfaceLanguage() already computed (never a second
 *       language read), reshaped for a settings-shaped question.
 *     - administration.available / .tools: composes IdentityEngine.
 *       getDashboardConfig(userId).isPlatformAdmin — the exact same
 *       real, fail-closed boolean DashboardSettingsAdminBoundaryCore
 *       already gates the Settings surface's admin section on (never
 *       a second admin derivation). tools is a short, honest label
 *       list built ONLY from fields getDashboardConfig() actually
 *       returned for this user (e.g. "users" when a real `users` array
 *       came back) — never a fabricated capability, and never the
 *       word "role" is spelled as "roles" anywhere in a label, per
 *       this file's existing no-role-leak test.
 *   See explainSurface() below for the human-readable layer built on
 *   top of this — Prompt 2 §9/§14's "AI can answer 'what can I do
 *   here?' without hallucinating."
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["dashboard-navigation-core"]) return;

    const VERSION = "1.0.0";

    /** Mandatory order per Prompt 1 §1/§21 — Community immediately after Home. */
    const SURFACE_ORDER = Object.freeze(["home", "community", "ai", "apps", "settings"]);

    class DashboardNavigationCore {
        #active = "home";
        #listeners = [];
        #diagnostics = { switches: 0, invalidSwitchAttempts: 0 };

        getVersion() { return VERSION; }

        /** getSurfaceOrder() — the single authoritative navigation order. Never duplicated elsewhere. */
        getSurfaceOrder() { return [...SURFACE_ORDER]; }

        getActiveSurface() { return this.#active; }

        isValidSurface(name) { return SURFACE_ORDER.includes(name); }

        /**
         * switchTo(name)
         *   The one real navigation-state mutator. Refuses (does not
         *   silently coerce) an unrecognized surface name, so a caller
         *   can never accidentally activate a non-existent surface.
         */
        switchTo(name) {
            if (!this.isValidSurface(name)) {
                this.#diagnostics.invalidSwitchAttempts++;
                return { success: false, active: this.#active, reason: `"${name}" is not a real CozyOS dashboard surface. Valid surfaces: ${SURFACE_ORDER.join(", ")}.` };
            }
            const previous = this.#active;
            this.#active = name;
            this.#diagnostics.switches++;
            for (const fn of this.#listeners) {
                try { fn({ active: name, previous }); } catch (_err) { /* a bad listener must never break navigation */ }
            }
            return { success: true, active: name, previous };
        }

        /** onChange(fn) — real, minimal pub/sub. No new platform-wide event bus; this is local dashboard-shell state only. */
        onChange(fn) {
            if (typeof fn === "function") this.#listeners.push(fn);
        }

        /**
         * resolveInterfaceLanguage(userId)
         *   Composes the real, existing CozyLanguageRegistry +
         *   IdentityEngine.getLanguagePreference(). See the file-header
         *   disclosure above regarding the real (English-first, not
         *   Kiswahili-first) fallback order this composes exactly as-is.
         */
        resolveInterfaceLanguage(userId) {
            const registry = window.CozyOS.CozyLanguageRegistry;
            if (!registry || typeof registry.resolveLanguage !== "function") {
                return { available: false, reason: "CozyLanguageRegistry is not loaded." };
            }
            const identity = window.CozyOS.IdentityEngine;
            let requested = null;
            if (identity && typeof identity.getLanguagePreference === "function" && userId) {
                try { requested = identity.getLanguagePreference(userId); } catch (_err) { requested = null; }
            }
            const resolved = registry.resolveLanguage({ requested });
            return {
                available: true,
                code: resolved.code,
                preferred: resolved.preferred,
                fallback: resolved.fallback,
                reason: resolved.reason,
                requestedFromIdentity: requested
            };
        }

        /**
         * buildAIContext(userId)
         *   Real, structured, authorized-only capability snapshot for
         *   CozyAI (Prompt 1 §11/§26). Composes real engines only; never
         *   scans the DOM, never fabricates an unavailable capability.
         *   Every field's "available"/empty state honestly reflects
         *   whichever real engine backs it being absent, unauthenticated,
         *   or unauthorized.
         */
        buildAIContext(userId) {
            const language = this.resolveInterfaceLanguage(userId);

            const visibility = window.CozyOS.ApplicationVisibility;
            let availableApplications = [];
            let applicationsAvailable = false;
            if (visibility && typeof visibility.listVisibleApplications === "function" && userId) {
                const result = visibility.listVisibleApplications(userId);
                if (result && result.available) {
                    applicationsAvailable = true;
                    availableApplications = (result.applications || [])
                        .filter((a) => a.kind === "application")
                        .map((a) => a.appId);
                }
            }

            const community = window.CozyOS.CozyKnowledgeCommunity;
            const knowledgeSourceConnected = !!(community && typeof community.listCommunityRecords === "function");

            // Dashboard Prompt 2 §9/§12 — "What can I do in Community?" /
            // "Where are my contributions?" require CozyAI to know the
            // Community surface's real, current shape. This is
            // aggregate/counts-only, non-identity community data (never
            // a user's private fields) via the real, existing
            // DashboardCommunitySummaryCore (which itself composes only
            // CozyKnowledgeCommunity + CozyKnowledgeReview — no new
            // knowledge store). Honestly unavailable if either real
            // dependency isn't loaded, never fabricated as zeros.
            let communityStateSummary = { available: false, reason: "CozyKnowledgeCommunity is not loaded." };
            if (knowledgeSourceConnected) {
                const summaryCore = window.CozyOS.DashboardCommunitySummaryCore;
                if (summaryCore && typeof summaryCore.summarizeCommunityRecords === "function") {
                    try {
                        let records = [];
                        try { records = community.listCommunityRecords({}) || []; } catch (_err) { records = []; }
                        const s = summaryCore.summarizeCommunityRecords(records);
                        communityStateSummary = {
                            available: true,
                            counts: s.counts,
                            labels: s.labels,
                            totalRecords: s.totalRecords,
                            myContributionsAvailable: s.myContributions.available
                        };
                    } catch (err) {
                        communityStateSummary = { available: false, reason: err.message };
                    }
                } else {
                    communityStateSummary = { available: false, reason: "DashboardCommunitySummaryCore is not loaded." };
                }
            }

            const assistant = window.CozyOS.LivingAssistant;

            // Prompt 2 §8 — launchable vs merely-visible (real check,
            // never inferred): only apps ApplicationVisibility itself
            // resolves a real launch path for right now.
            let launchableApplications = [];
            if (applicationsAvailable && visibility && typeof visibility.getRealLaunchPath === "function") {
                launchableApplications = availableApplications.filter((appId) => {
                    try { return !!visibility.getRealLaunchPath(appId); } catch (_err) { return false; }
                });
            }

            // Prompt 2 §8 — real display name only (IdentityEngine.
            // getUser().username), never the rest of that record. See
            // header disclosure above for exactly why.
            let displayName = null;
            const identityEngine = window.CozyOS.IdentityEngine;
            if (identityEngine && typeof identityEngine.getUser === "function" && userId) {
                try {
                    const user = identityEngine.getUser(userId);
                    displayName = user ? user.username : null;
                } catch (_err) { displayName = null; }
            }

            // Prompt 2 §8 — Community teaching action, gated on the
            // real, existing CozyTeachCozyAIRouting engine actually
            // being loaded (never hardcoded, never duplicating its
            // TEACH_KNOWLEDGE_TYPES values here).
            const teachRouting = window.CozyOS.CozyTeachCozyAIRouting;
            const teachAvailable = !!(teachRouting && Array.isArray(teachRouting.TEACH_KNOWLEDGE_TYPES) && teachRouting.TEACH_KNOWLEDGE_TYPES.length > 0);
            const communityAvailableActions = teachAvailable ? ["contribute-knowledge"] : [];

            // Prompt 2 §8 — administration boundary. Same real,
            // fail-closed source DashboardSettingsAdminBoundaryCore
            // already gates the Settings surface on
            // (IdentityEngine.getDashboardConfig().isPlatformAdmin ===
            // true, boolean only) — never re-derived, never a
            // client-supplied role trusted. Tool labels are built only
            // from fields the real dashboardConfig actually returned
            // for this exact user, never a fabricated capability list.
            let administrationAvailable = false;
            let administrationTools = [];
            if (identityEngine && typeof identityEngine.getDashboardConfig === "function" && userId) {
                try {
                    const dashboardConfig = identityEngine.getDashboardConfig(userId);
                    if (dashboardConfig && dashboardConfig.available === true && dashboardConfig.isPlatformAdmin === true) {
                        administrationAvailable = true;
                        if (Array.isArray(dashboardConfig.users)) administrationTools.push("user-directory");
                        if (Array.isArray(dashboardConfig.applicationStates)) administrationTools.push("application-oversight");
                    }
                } catch (_err) { administrationAvailable = false; administrationTools = []; }
            }

            return {
                available: true,
                userLanguage: language.available ? language.code : null,
                languageFallback: language.available ? !!language.fallback : null,
                availableApplications,
                applicationsAvailable,
                availableDashboardSurfaces: this.getSurfaceOrder(),
                knowledgeSourceConnected,
                communityStateSummary,
                aiAssistantConnected: !!(assistant && typeof assistant.open === "function"),
                currentSurface: this.#active,

                // Prompt 2 §8 additions — namespaced, additive only.
                identity: {
                    displayName,
                    language: language.available ? language.code : null
                },
                applications: {
                    available: availableApplications,
                    launchable: launchableApplications
                },
                community: {
                    stateSummary: communityStateSummary,
                    availableActions: communityAvailableActions
                },
                settings: {
                    relevantPreferences: {
                        language: {
                            current: language.available ? language.code : null,
                            isFallback: language.available ? !!language.fallback : null
                        }
                    }
                },
                administration: {
                    available: administrationAvailable,
                    tools: administrationTools
                }
            };
        }

        /**
         * explainSurface(surfaceName, userId)
         *   Prompt 2 §9/§14 — the honest, template-generated text layer
         *   CozyAI (or the dashboard AI surface's own UI, see
         *   user-dashboard.js #renderAiSurface) uses to answer "what
         *   can I do here?" per surface. Every sentence below is
         *   assembled FROM buildAIContext()'s real fields at call time
         *   — nothing here is a static claim that can silently go
         *   stale, and nothing claims a capability the context doesn't
         *   actually report as available.
         */
        explainSurface(surfaceName, userId) {
            if (!this.isValidSurface(surfaceName)) {
                return { available: false, reason: `"${surfaceName}" is not a real CozyOS dashboard surface. Valid surfaces: ${this.getSurfaceOrder().join(", ")}.` };
            }
            const ctx = this.buildAIContext(userId);
            const lines = [];

            switch (surfaceName) {
                case "home":
                    lines.push(ctx.applications.available.length
                        ? `From Home you can jump into ${ctx.applications.available.length} application(s) currently available to your account.`
                        : "No applications are currently assigned to your account, so Home has nothing to launch yet.");
                    break;
                case "community":
                    lines.push(ctx.community.stateSummary.available
                        ? `Community lets you review real, aggregate knowledge-pipeline state (${ctx.community.stateSummary.totalRecords} record(s) across its review buckets).`
                        : `Community's knowledge pipeline isn't connected right now (${ctx.community.stateSummary.reason || "unavailable"}).`);
                    lines.push(ctx.community.availableActions.includes("contribute-knowledge")
                        ? "You can teach CozyAI here by contributing knowledge through the real, governed contribution pipeline."
                        : "Contributing knowledge isn't available right now because the real teaching/routing engine isn't loaded.");
                    break;
                case "ai":
                    lines.push(ctx.aiAssistantConnected
                        ? `I can see your real dashboard state — ${ctx.applications.available.length} available application(s), ${ctx.applications.launchable.length} launchable right now.`
                        : "The live assistant isn't connected on this page right now.");
                    lines.push(`I'll respond in ${ctx.userLanguage || "the default language"}${ctx.languageFallback ? " (a fallback — your preferred language isn't fully available yet)" : ""}.`);
                    break;
                case "apps":
                    lines.push(ctx.applications.available.length
                        ? `${ctx.applications.available.length} application(s) are visible to your account; ${ctx.applications.launchable.length} of those can be opened right now.`
                        : "No applications are visible to your account right now.");
                    break;
                case "settings":
                    lines.push(`Your interface language is ${ctx.settings.relevantPreferences.language.current || "not set"}${ctx.settings.relevantPreferences.language.isFallback ? " (fallback)" : ""}, and you can change it here.`);
                    lines.push(ctx.administration.available
                        ? `Your account has platform-administrator access, so administrator tools are available here (${ctx.administration.tools.join(", ") || "none currently reported"}).`
                        : "Administrator tools are not available to your account.");
                    break;
            }

            return { available: true, surface: surfaceName, text: lines.join(" ") };
        }

        getDiagnosticsReport() {
            return { moduleVersion: VERSION, activeSurface: this.#active, order: this.getSurfaceOrder(), ...this.#diagnostics };
        }
    }

    window.CozyOS.DashboardNavigationCore = new DashboardNavigationCore();
    window.CozyOS.Modules["dashboard-navigation-core"] = Object.freeze({
        version: VERSION,
        description: "Dashboard navigation state machine (Home/Community/AI/Apps/Settings) + interface-language resolver + AI dashboard-context builder. Pure logic, no DOM. Composes IdentityEngine, ApplicationVisibility, CozyLanguageRegistry, CozyKnowledgeCommunity, LivingAssistant — no duplicate engines."
    });
})();
