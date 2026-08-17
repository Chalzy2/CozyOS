(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.BuilderRuntime) return;

    function realOrGap(obj, gapReason) {
        return obj || { __gap: true, reason: gapReason };
    }

    const DIRECT_MAP = Object.freeze({
        memory: ["CozyMemory", "CozyMemory is not loaded."],
        modules: ["ModuleRegistry", "ModuleRegistry is not loaded."],
        services: ["ServiceRegistry", "ServiceRegistry is not loaded."],
        events: ["PlatformEventBus", "PlatformEventBus is not loaded."],
        identity: ["IdentityEngine", "IdentityEngine is not loaded."],
        developer: ["DeveloperHub", "DeveloperHub is not loaded."],
        company: ["CozyCompany", "CozyCompany is not loaded."],
        sensing: ["CozySense", "CozySense is not loaded."],
        thinking: ["CozyThinking", "CozyThinking is not loaded."],
        reasoning: ["CozyReasoning", "CozyReasoning is not loaded."],
        intelligence: ["CozyIntelligence", "CozyIntelligence is not loaded."],
        ai: ["LivingAI", "LivingAI is not loaded."],
        learning: ["LivingLearning", "LivingLearning is not loaded."],
        planning: ["LivePlanningEngine", "LivePlanningEngine is not loaded."],
        workspace: ["WorkspaceShell", "WorkspaceShell is not loaded."],
        files: ["UniversalFileEngine", "UniversalFileEngine is not loaded."],
        deployment: ["DeploymentValidator", "DeploymentValidator is not loaded."],
        diagnostics: ["CozyAuditor", "CozyAuditor is not loaded."]
    });

    class CozyBuilderRuntime {
        #direct(propertyName) {
            const [globalName, reason] = DIRECT_MAP[propertyName];
            return realOrGap(window.CozyOS[globalName], reason);
        }
        #resolve(propertyName) {
            const living = window.CozyOS.Living;
            if (living && typeof living.isReal === "function" && living.isReal(propertyName)) return living[propertyName];
            return this.#direct(propertyName);
        }

        get memory() { return this.#resolve("memory"); }
        get modules() { return this.#resolve("modules"); }
        get services() { return this.#resolve("services"); }
        get events() { return this.#resolve("events"); }
        get identity() { return this.#resolve("identity"); }
        get certification() { const living = window.CozyOS.Living; if (living && living.isReal("certification")) return living.certification; return realOrGap(window.CozyOS.Certification || window.CozyOS.CozyCertification, "Certification is not loaded."); }
        get developer() { return this.#resolve("developer"); }
        get company() { return this.#resolve("company"); }
        get sensing() { return this.#resolve("sensing"); }
        get thinking() { return this.#resolve("thinking"); }
        get reasoning() { return this.#resolve("reasoning"); }
        get intelligence() { return this.#resolve("intelligence"); }
        get ai() { return this.#resolve("ai"); }
        get learning() { return this.#resolve("learning"); }
        get planning() { return this.#resolve("planning"); }
        get workspace() { return this.#resolve("workspace"); }
        get files() { return this.#resolve("files"); }
        get deployment() { return this.#resolve("deployment"); }
        get diagnostics() { return this.#resolve("diagnostics"); }

        get kernel() { return { __gap: true, reason: "No real kernel subsystem exists in this repository — core/core/kernel/ was confirmed dead and removed from the discovery manifest in M288. Document this gap rather than fabricate a facade over it." }; }

        isReal(propertyName) {
            const value = this[propertyName];
            return !!value && value.__gap !== true;
        }

        getGapReport() {
            const props = ["memory", "modules", "services", "events", "identity", "certification", "developer", "company", "sensing", "thinking", "reasoning", "intelligence", "ai", "learning", "planning", "workspace", "files", "deployment", "diagnostics", "kernel"];
            const gaps = {};
            for (const p of props) { if (!this.isReal(p)) gaps[p] = this[p].reason; }
            return gaps;
        }

        getVersion() { return "1.1.0"; }
        getId() { return "BuilderRuntime"; }
    }

    window.CozyOS.BuilderRuntime = new CozyBuilderRuntime();
})();
