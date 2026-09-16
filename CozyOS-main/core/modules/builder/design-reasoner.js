/**
 * CozyOS Builder — Design Reasoner (M294)
 * core/modules/builder/design-reasoner.js
 *
 * OWNERSHIP: composes the existing, real ServiceRegistry.listCoordinators()
 * - never a second registry.
 *
 * HONEST CAPABILITY RULE (matching ArchitectureEngine's own established
 * disclosure): this file provides real, deterministic, rule-based
 * heuristics grounded in actual repository signals (does a similarly-
 * named coordinator already exist, how many distinct requirements were
 * actually extracted, how many required integrations were actually
 * named). It does NOT perform genuine architectural reasoning. Every
 * recommendation states the real signal it was based on, and states
 * plainly when a question genuinely requires human judgment beyond
 * what these signals can settle.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.DesignReasoner) return;

    class CozyDesignReasoner {
        shouldReuseExisting(entityName) {
            const registry = window.CozyOS.ServiceRegistry;
            if (!registry || typeof registry.listCoordinators !== "function") {
                return { decision: "unknown", reason: "ServiceRegistry is not loaded - cannot check for a real, existing coordinator." };
            }
            const normalized = entityName.toLowerCase().replace(/[-_\s]/g, "");
            const coordinators = registry.listCoordinators();
            const match = coordinators.find(c => c.name.toLowerCase().replace(/[-_\s]/g, "") === normalized);
            if (match) {
                return { decision: "reuse", reason: `A real coordinator named "${match.name}" is already registered - extend it rather than generating a duplicate.`, existingCoordinator: match.name };
            }
            return { decision: "generate", reason: `No real, currently-registered coordinator matches "${entityName}".` };
        }

        shouldSplitIntoMultiple(analysis) {
            if (!analysis || !Array.isArray(analysis.functionalRequirements) || !Array.isArray(analysis.databaseEntities)) {
                return { decision: "unknown", reason: "A real analysis object with functionalRequirements and databaseEntities is required." };
            }
            const entityCount = analysis.databaseEntities.length;
            const requirementCount = analysis.functionalRequirements.length;
            if (entityCount >= 3) {
                return {
                    decision: "split", suggestedCount: entityCount,
                    reason: `${entityCount} real, distinct database entities were extracted - a heuristic rule of thumb (not genuine architectural judgment) suggests one coordinator per entity rather than one large coordinator. A human should confirm whether these entities are actually independent.`
                };
            }
            return { decision: "single", reason: `Only ${entityCount} real distinct entit${entityCount === 1 ? "y" : "ies"} and ${requirementCount} requirement(s) found - a single coordinator is the simpler default; no strong signal for splitting.` };
        }

        shouldPublishEvents(analysis) {
            if (!analysis || !Array.isArray(analysis.requiredIntegrations)) {
                return { decision: "unknown", reason: "A real analysis object with requiredIntegrations is required." };
            }
            if (analysis.requiredIntegrations.length > 0) {
                return { decision: "yes", reason: `${analysis.requiredIntegrations.length} real required integration(s) were named (${analysis.requiredIntegrations.join(", ")}) - other modules likely need to react to this one's state changes, so publishing real events (matching PlatformEventBus's existing pattern) is recommended.` };
            }
            return { decision: "no", reason: "No real cross-module integrations were named in the analysis - no evidence yet that anything else needs to react to this module." };
        }

        shouldExtendVsGenerate(entityName) {
            const reuseResult = this.shouldReuseExisting(entityName);
            return { decision: reuseResult.decision === "reuse" ? "extend" : reuseResult.decision, reason: reuseResult.reason };
        }

        shouldBeServiceOrModule() {
            return { decision: "ask-human", reason: "This distinction depends on intended reuse scope and organizational convention, not something detectable from real repository signals alone - a genuine architectural judgment call, not fabricated here." };
        }

        getVersion() { return "1.0.0"; }
        getId() { return "DesignReasoner"; }
        getDependencies() { return ["ServiceRegistry"]; }
    }

    window.CozyOS.DesignReasoner = new CozyDesignReasoner();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "DesignReasoner", category: "Living Engine",
                sourcePath: "core/modules/builder/design-reasoner.js",
                description: "Real, disclosed heuristics for design questions (reuse vs generate, split vs single coordinator, publish events), grounded in actual ServiceRegistry/analysis signals. Not genuine architectural reasoning - every recommendation states its real basis; questions with no real signal to answer them honestly defer to a human."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
