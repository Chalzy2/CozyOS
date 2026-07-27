/**
 * CozyOS Search Engine
 * File Reference: core/engines/search/search-engine.js
 * Milestone: 180C — Developer Identity Search Integration (new capability,
 * no existing owner — same justification pattern as WakeWordEngine,
 * Milestone 179, and VoiceEngine, Milestone 180B)
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP (scoped honestly to what this milestone actually builds):
 *   Owns: recognizing when a free-text search query is a developer/
 *   project-identity question ("who created CozyOS", "who developed
 *   CozyAI", "why was CozyOS created", "what is the African Knowledge
 *   Initiative"), delegating it to the single canonical owner
 *   (window.CozyOS.DeveloperIdentity, core/identity/), and formatting the
 *   result as a search-result payload.
 *
 *   Does NOT own: general-purpose search over CozyOS content. No such
 *   surface exists anywhere in this repository to integrate with —
 *   `core/modules/research/cozy-research-engine.js` (window.CozyOS.
 *   ResearchEngine) is a document/research-notes tool, and
 *   `core/plugins/shopOS-search.js` (window.CozyOS.ShopSearch) is
 *   ShopOS's product search — neither answers "who created CozyOS"
 *   style questions, and neither is modified or duplicated here. This
 *   file does NOT fabricate a general search index over app content;
 *   it only ever resolves the three canonical DeveloperIdentity topics,
 *   honestly reporting no match for anything else (see Gate 1/Gate 4 of
 *   Milestone-180C-Continuation.md).
 *
 * Flow implemented (per spec): User Search -> SearchEngine ->
 * DeveloperIdentity.query() -> canonical answer -> search results.
 * Never answers directly; never stores a copy of any developer/project
 * fact — every answer is read fresh from
 * window.CozyOS.DeveloperIdentity.query() at the moment it's needed.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.SearchEngine) return; // duplicate-load guard

    class SearchEngine {
        #stats = { searchesReceived: 0, delegated: 0, notMatched: 0 };
        #lastResult = null;

        getVersion() { return VERSION; }

        #emit(event, detail) {
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`search:${event}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }

        /**
         * [Milestone 180C] Pure pattern match against the three canonical
         * topics window.CozyOS.DeveloperIdentity.query() understands.
         * Matches text only — carries no developer/project data itself.
         * Kept as its own local copy (same logic as core/ai.js's M180A
         * version and voice-engine.js's M180B version) so this engine
         * delegates directly to DeveloperIdentity.query() per the spec,
         * rather than routing through CozyAI or Voice.
         * @returns {string|null}
         */
        _matchDeveloperIdentityTopic(queryText) {
            const q = String(queryText || "").toLowerCase();
            if (/who\s+(created|developed|built|made|founded)\s+(you|cozyai|cozyos)/.test(q) ||
                /who\s+is\s+(chalz\s+cozy|charles\s+cozy|charles\s+owuor)/.test(q) ||
                /(your|cozyos'?s?|cozyai'?s?)\s+(creator|founder|developer)\b/.test(q)) {
                return "who-created-you";
            }
            if (/why\s+(were\s+you|was\s+cozyos|was\s+cozyai)\s+(built|created|made)/.test(q) ||
                /why\s+(does\s+)?cozyos\s+exist/.test(q)) {
                return "why-created";
            }
            if (/why\s+africa/.test(q) || /african\s+knowledge\s+initiative/.test(q)) {
                return "why-africa-focus";
            }
            return null;
        }

        /**
         * Runs a user search query. Never answers directly — only
         * resolves the three canonical DeveloperIdentity topics; anything
         * else is honestly reported as no match, not guessed at, since
         * no general-purpose content index exists in this repository to
         * search over.
         * @param {string} queryText
         * @returns {{matched:boolean, answered:boolean, results:Array<object>, source:string}}
         */
        search(queryText) {
            this.#stats.searchesReceived++;
            const topic = this._matchDeveloperIdentityTopic(queryText);

            if (!topic) {
                this.#stats.notMatched++;
                const outcome = { matched: false, answered: false, results: [], source: "none" };
                this.#lastResult = outcome;
                return outcome;
            }

            // SearchEngine SHALL NOT answer — delegate to the single canonical owner.
            const identity = window.CozyOS.DeveloperIdentity;
            let outcome;

            if (!identity || typeof identity.query !== "function") {
                // Graceful degradation — honest, never fabricated.
                outcome = {
                    matched: true, answered: false,
                    results: [{
                        title: "Developer identity unavailable",
                        snippet: "I don't have developer identity information available.",
                        source: "DeveloperIdentity",
                    }],
                    source: "DeveloperIdentity",
                };
                this.#emit("developer-identity-unavailable", { topic });
            } else {
                const result = identity.query(topic);
                outcome = {
                    matched: true, answered: !!result.known,
                    results: [{
                        title: this.#titleForTopic(topic),
                        snippet: result.answer,
                        source: "DeveloperIdentity",
                    }],
                    source: "DeveloperIdentity",
                };
                this.#stats.delegated++;
                this.#emit("developer-identity-delegated", { topic, known: outcome.answered });
            }

            this.#lastResult = outcome;
            return outcome;
        }

        #titleForTopic(topic) {
            switch (topic) {
                case "who-created-you": return "Who created CozyOS / CozyAI?";
                case "why-created": return "Why was CozyOS created?";
                case "why-africa-focus": return "African Knowledge Initiative";
                default: return "Developer Identity";
            }
        }

        // ── Diagnostics — existing repository diagnostics pattern ──

        available() {
            return !!(window.CozyOS.DeveloperIdentity && typeof window.CozyOS.DeveloperIdentity.query === "function");
        }

        dependencies() {
            return Object.freeze({
                DeveloperIdentity: !!window.CozyOS.DeveloperIdentity,
                PlatformEventBus: !!window.CozyOS.PlatformEventBus,
            });
        }

        delegationStatus() {
            return Object.freeze({
                delegatesTo: "window.CozyOS.DeveloperIdentity.query()",
                storesOwnCopy: false,
                lastResult: this.#lastResult,
            });
        }

        health() {
            return Object.freeze({
                available: this.available(),
                stats: { ...this.#stats },
            });
        }

        capabilities() {
            return Object.freeze([
                "developer-identity-question-detection",
                "developer-identity-delegation",
                "search-result-formatting",
            ]);
        }

        getIntegrationManifest() {
            return {
                owns: ["recognizing developer/project-identity questions in a search query", "delegating them to DeveloperIdentity", "formatting the answer as a search result"],
                doesNotOwn: ["general-purpose content search (does not exist in this repository)", "ShopOS product search (ShopSearch)", "research/document search (ResearchEngine)", "developer/project facts (DeveloperIdentity)"],
                consumerContract: ["search(queryText)", "search:developer-identity-delegated (PlatformEventBus)", "search:developer-identity-unavailable (PlatformEventBus)"],
                gracefulDegradation: "I don't have developer identity information available.",
            };
        }
    }

    window.CozyOS.SearchEngine = new SearchEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "SearchEngine", category: "Platform", icon: "search.svg",
                description: "Delegates developer/project-identity search queries to DeveloperIdentity and formats the answer as a search result. Owns no developer data and no general-purpose content search — see getIntegrationManifest()."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
