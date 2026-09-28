/**
 * CozyOS — Next-Step Action Registry
 * File Reference: core/modules/intelligence/next-step/cozy-next-step-action-registry.js
 *
 * WHAT THIS IS
 *   The ONE real, deterministic map from a suggestion's `action.actionId`
 *   to a real, already-existing, already-authorized application handler.
 *   This file invents NO authorization logic of its own: every
 *   registered action's execute() calls straight into the app's own
 *   real, pre-existing entry point (QuarryOS's handle({route, payload,
 *   authContext}) with its own real roleMatrix/_checkPermission;
 *   ChurchOS's ChurchMembershipBridge.registerMember(); CozyOS's own
 *   ApplicationLauncher.open()) and honestly relays whatever that real
 *   call returns — success, a 403 role-permission denial, or a thrown
 *   validation error. There is no universal "action router" elsewhere
 *   in this repository (confirmed by reading QuarryOS/ChurchOS's own
 *   authorization code before writing this — see the Live Next-Step
 *   Intelligence handoff report for the audit); this file is the thin,
 *   additive dispatch layer the product spec asks to "investigate
 *   whether one should be built" — and it is built exactly this way:
 *   translate an actionId to the right app's own real, already-
 *   authorized function, never a second permission system.
 *
 * REAL, DISCLOSED AUTHORIZATION CEILING PER ACTION (read before adding
 * a new one)
 *   - quarry.* actions call window.CozyOS.Modules.QuarryManager.handle()
 *     directly. That real method independently, freshly checks
 *     `context.authContext.role` (or, if none is supplied,
 *     window.CozyOS.Auth.getCurrentIdentity()) against its own
 *     this.roleMatrix for the exact route — a real role gate. A denied
 *     call returns `{status: 403, responseText: ...}` (never a thrown
 *     error), which execute() below turns into `{success:false,
 *     authorized:false, reason}` — the suggestion tap is honestly
 *     blocked, never silently downgraded to a fake success.
 *   - church.register_member calls window.CozyOS.ChurchMembershipBridge.
 *     registerMember(orgId, profile, actorId) directly. Read before
 *     writing this file: that bridge checks only
 *     OrganizationRegistry.organizationExists(orgId) and a real,
 *     non-empty profile.name — there is NO role-based permission gate
 *     in ChurchMembershipBridge today. This is a real, disclosed gap,
 *     not fabricated: this file does not invent a role check for it
 *     (that would be new authorization logic this task's own
 *     constraints forbid); `authorizationNote` on this action's
 *     registration says so plainly, and the Live Next-Step Intelligence
 *     handoff report repeats it.
 *   - *.open_app actions call window.CozyOS.ApplicationLauncher.open(),
 *     which has its own real IdentityEngine.canAccessApplication() gate
 *     (fails open only when no IdentityEngine is loaded at all — that
 *     file's own documented, pre-existing behavior, unchanged here).
 *   - cozyos.clarify is the one action with NO application/authorization
 *     boundary at all, by design: it never mutates anything or reaches
 *     any application; it only re-submits a real disambiguating option's
 *     text as this same user's own next Live Window turn, through the
 *     SAME real answer pipeline every ordinary typed message already
 *     goes through (see the Live Window UI file). This is registered
 *     here (rather than left implicit) so it is still a real,
 *     `isModeRegistered`-style lookup, and so a caller can list it like
 *     any other action.
 *
 * WHAT THIS FILE DOES NOT DO
 *   Does not read/write CozyMemory or CozyLearn for interaction history,
 *   does not add a second event bus, does not modify QuarryOS/ChurchOS/
 *   ApplicationLauncher. destructive:true actions still execute the
 *   instant execute() is called — the confirm-before-tap gate is a UI
 *   responsibility (cozy-next-step-suggestions-ui.js), not this
 *   registry's; this file only carries the real, disclosed `destructive`
 *   flag so that UI knows to ask first.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const VERSION = "1.0.0";
    if (window.CozyOS.Modules["next-step-action-registry"]) return;

    /** actionId -> { appId, type, destructive, labelKey, fallbackLabel, authorizationNote, execute(payload, authContext) } */
    const actions = new Map();

    function registerAction(actionId, def) {
        if (typeof actionId !== "string" || !actionId.trim()) return { success: false, reason: "A real actionId string is required." };
        if (!def || typeof def.execute !== "function") return { success: false, reason: "def.execute(payload, authContext) is required." };
        actions.set(actionId, {
            actionId,
            appId: def.appId || null,
            type: def.type || "CREATION",
            destructive: !!def.destructive,
            labelKey: def.labelKey || null,
            fallbackLabel: def.fallbackLabel || actionId,
            authorizationNote: def.authorizationNote || "No disclosed authorization ceiling recorded for this action.",
            execute: def.execute
        });
        return { success: true };
    }

    function getAction(actionId) { return actions.get(actionId) || null; }
    function isRegistered(actionId) { return actions.has(actionId); }

    /** listActions({appId}) — real, registered actions only, optionally filtered to one application. An application with none registered returns []. */
    function listActions({ appId = null } = {}) {
        const out = [];
        for (const def of actions.values()) {
            if (appId && def.appId !== appId) continue;
            out.push({ actionId: def.actionId, appId: def.appId, type: def.type, destructive: def.destructive, labelKey: def.labelKey, fallbackLabel: def.fallbackLabel });
        }
        return out;
    }

    /**
     * execute(actionId, payload, authContext)
     *   Real dispatch — never a second authorization system. Any thrown
     *   error from the underlying app handler (e.g. QuarryOS's own
     *   `this._validate()` throwing on a missing required field) is
     *   caught and reported as an honest {success:false} — never
     *   fabricated as success.
     */
    async function execute(actionId, payload, authContext) {
        const def = actions.get(actionId);
        if (!def) return { success: false, reason: `No real action "${actionId}" is registered.` };
        try {
            const result = await def.execute(payload || {}, authContext || null);
            return result && typeof result === "object" ? result : { success: true, result };
        } catch (err) {
            return { success: false, reason: (err && err.message) || "The real action handler threw an error." };
        }
    }

    // -----------------------------------------------------------------
    // REAL ACTION REGISTRATIONS — every execute() below composes an
    // already-existing, unmodified engine. Dependencies are resolved at
    // CALL time (never at registration time), so registering here never
    // requires a particular script load order.
    // -----------------------------------------------------------------

    // --- ChurchOS: Create Member (the directive's own concrete example) ---
    registerAction("church.register_member", {
        appId: "ChurchOS", type: "CREATION", destructive: false,
        labelKey: "next-step:create-member", fallbackLabel: "Create Member",
        authorizationNote: "Real: ChurchMembershipBridge.registerMember() checks OrganizationRegistry.organizationExists(orgId) and a real, non-empty member name. Disclosed gap: no role-based permission gate exists for this action in this repository today — any actorId able to reach the Live Window in a real organization can register a member. Not fabricated as more restrictive than it is.",
        async execute(payload, authContext) {
            const bridge = window.CozyOS && window.CozyOS.ChurchMembershipBridge;
            if (!bridge || typeof bridge.registerMember !== "function") return { success: false, reason: "ChurchMembershipBridge is not loaded in this environment." };
            const orgId = payload && payload.orgId;
            const profile = (payload && payload.profile) || {};
            const actorId = (authContext && authContext.actorId) || "anonymous";
            if (!orgId) return { success: false, reason: "A real orgId is required to create a member." };
            return bridge.registerMember(orgId, profile, actorId);
        }
    });

    // --- ChurchOS: List Members (real, read-only "browse", honestly
    // disclosed as listing — not a full-text search engine, none exists) ---
    registerAction("church.list_members", {
        appId: "ChurchOS", type: "SEARCH", destructive: false,
        labelKey: "next-step:list-members", fallbackLabel: "View Members",
        authorizationNote: "Real: ChurchMembershipBridge.listMembers(orgId) — a real, organization-scoped read. No actor-level filtering beyond organization scope exists (same disclosed ceiling as registerMember above).",
        async execute(payload) {
            const bridge = window.CozyOS && window.CozyOS.ChurchMembershipBridge;
            if (!bridge || typeof bridge.listMembers !== "function") return { success: false, reason: "ChurchMembershipBridge is not loaded in this environment." };
            const orgId = payload && payload.orgId;
            if (!orgId) return { success: false, reason: "A real orgId is required to list members." };
            return bridge.listMembers(orgId);
        }
    });

    // --- QuarryOS: Register Employee (real roleMatrix-authorized route) ---
    registerAction("quarry.register_employee", {
        appId: "QuarryOS", type: "CREATION", destructive: false,
        labelKey: "next-step:register-employee", fallbackLabel: "Register Employee",
        authorizationNote: "Real: QuarryManager.handle() checks authContext.role (or the signed-in administrator identity) against its own roleMatrix for route \"register_employee\" (Administrator/HR Manager). A denied caller receives the real {status:403} this file relays honestly.",
        async execute(payload, authContext) {
            const quarry = window.CozyOS && window.CozyOS.Modules && window.CozyOS.Modules.QuarryManager;
            if (!quarry || typeof quarry.handle !== "function") return { success: false, reason: "QuarryOS (window.CozyOS.Modules.QuarryManager) is not loaded in this environment." };
            const result = await quarry.handle({ route: "register_employee", payload: (payload && payload.employee) || {}, authContext });
            if (result && result.status === 403) return { success: false, authorized: false, reason: result.responseText };
            return { success: !!(result && result.status && result.status < 400), authorized: true, ...result };
        }
    });

    // --- QuarryOS: Terminate Employee — DESTRUCTIVE, real roleMatrix-authorized route ---
    registerAction("quarry.terminate_employee", {
        appId: "QuarryOS", type: "CREATION", destructive: true,
        labelKey: "next-step:terminate-employee", fallbackLabel: "Terminate Employee",
        authorizationNote: "Real: same roleMatrix check as register_employee, for route \"terminate_employee\" (Administrator/HR Manager only). Irreversible in the real employee registry, hence destructive:true — the Live Window UI must confirm before ever calling execute() on this actionId.",
        async execute(payload, authContext) {
            const quarry = window.CozyOS && window.CozyOS.Modules && window.CozyOS.Modules.QuarryManager;
            if (!quarry || typeof quarry.handle !== "function") return { success: false, reason: "QuarryOS (window.CozyOS.Modules.QuarryManager) is not loaded in this environment." };
            const result = await quarry.handle({ route: "terminate_employee", payload: (payload && payload.employee) || {}, authContext });
            if (result && result.status === 403) return { success: false, authorized: false, reason: result.responseText };
            return { success: !!(result && result.status && result.status < 400), authorized: true, ...result };
        }
    });

    // --- QuarryOS: Register Another Employee — CONTINUATION reuse of the same real action ---
    registerAction("quarry.register_another_employee", {
        appId: "QuarryOS", type: "CONTINUATION", destructive: false,
        labelKey: "next-step:register-another-employee", fallbackLabel: "Register Another Employee",
        authorizationNote: "Identical real authorization to quarry.register_employee — this is the same handler, offered again as a continuation after a successful registration.",
        async execute(payload, authContext) {
            return actions.get("quarry.register_employee").execute(payload, authContext);
        }
    });

    // --- Navigation: open a real application via the real ApplicationLauncher ---
    function registerOpenApp(actionId, appId, labelKey, fallbackLabel) {
        registerAction(actionId, {
            appId, type: "NAVIGATION", destructive: false, labelKey, fallbackLabel,
            authorizationNote: "Real: ApplicationLauncher.open() checks IdentityEngine.canAccessApplication() when an IdentityEngine is loaded; fails open (documented, pre-existing) otherwise.",
            async execute(_payload, _authContext) {
                const launcher = window.CozyOS && window.CozyOS.ApplicationLauncher;
                if (!launcher || typeof launcher.open !== "function") return { success: false, reason: "ApplicationLauncher is not loaded in this environment." };
                return launcher.open(appId);
            }
        });
    }
    registerOpenApp("quarry.open_app", "QuarryOS", "next-step:open-quarryos", "Open QuarryOS");
    registerOpenApp("church.open_app", "ChurchOS", "next-step:open-churchos", "Open ChurchOS");

    // --- Clarification: re-submit a disambiguating option as this same
    // user's next turn through the real, existing answer pipeline. No
    // application boundary, no authorization of its own (see header). ---
    registerAction("cozyos.clarify", {
        appId: null, type: "CLARIFICATION", destructive: false,
        labelKey: null, fallbackLabel: "Ask a clarifying question",
        authorizationNote: "None — never mutates state or reaches an application; only re-submits real disambiguating text through the same authenticated user's own Live Window turn.",
        async execute(payload) {
            return { success: true, reask: true, text: (payload && payload.text) || "" };
        }
    });

    const NextStepActionRegistry = Object.freeze({
        registerAction, getAction, isRegistered, listActions, execute, getVersion: () => VERSION
    });
    window.CozyOS.NextStepActionRegistry = NextStepActionRegistry;
    window.CozyOS.Modules["next-step-action-registry"] = Object.freeze({
        version: VERSION,
        description: "Live Next-Step Intelligence — window.CozyOS.NextStepActionRegistry. The one real, deterministic actionId -> real app handler dispatch layer (QuarryOS.handle()'s own roleMatrix, ChurchMembershipBridge, ApplicationLauncher). No new authorization logic anywhere in this file; every action relays its real app's own existing check. Registers church.register_member/church.list_members/quarry.register_employee/quarry.terminate_employee (destructive)/quarry.register_another_employee/quarry.open_app/church.open_app/cozyos.clarify."
    });

    if (typeof module !== "undefined" && module.exports) module.exports = NextStepActionRegistry;
})();
