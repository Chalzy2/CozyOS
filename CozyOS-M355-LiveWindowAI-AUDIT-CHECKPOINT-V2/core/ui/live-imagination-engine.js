/**
 * CozyOS Live Imagination Engine — core/ui/live-imagination-engine.js
 * Milestone M276 (visual/ambient scene variant)
 *
 * OWNERSHIP: this is a UI/experience COORDINATOR only. It composes:
 *   - window.CozyOS.Background (real canvas/video backdrop, cozy-
 *     background.js) for actual scene rendering
 *   - window.CozyOS.LivingThemeEngine (real theme scheduling,
 *     living-theme-engine.js) for real theme activation
 *   - window.CozyOS.Live (real pub/sub, core/shell/cozy-live.js,
 *     confirmed real and small before composing it) for soft,
 *     non-disruptive UI event coordination
 *   - core/living/cozy-living.css's real --living-* CSS variables and
 *     body.living-* mode classes (already established, cozy-living-
 *     sync.js) for the actual visual token system
 * It duplicates none of their internal logic - no new particle
 * renderer, no new theme-token system, no new pub/sub. "Imagining a
 * scene" here means: pick a real theme, ask LivingThemeEngine to
 * really activate it, optionally set a real background video/image if
 * one is provided, and publish a real event over the existing Live
 * channel so other UI can react - nothing more is fabricated.
 *
 * HONEST SCOPE: no AI-generated imagery or AI-authored scene content
 * is implemented here - there is no connected image-generation
 * provider in this repository. "Imagination" in this engine means
 * real, deterministic scene/theme composition from real, existing
 * assets and real Living Engine state - not AI creativity. Any future
 * AI-assisted scene generation would need a real, separate provider,
 * disclosed the same way LivingAI's provider registry discloses its
 * own unconfigured providers.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.LiveImagination) return;

    class CozyLiveImaginationEngine {
        #activeSessions = new Map(); // sessionId -> {themeId, startedAt}
        #stats = { conceptsGenerated: 0, simulationsExecuted: 0 };

        /**
         * imagineScene(sessionId, themeId, { videoUrl })
         *   Real - activates a genuinely registered theme via the
         *   existing LivingThemeEngine (never a second theme system),
         *   optionally sets a real background video via the existing
         *   Background engine (never a second video player), and
         *   publishes a real event over the existing CozyLive pub/sub
         *   channel. Honestly reports which real pieces succeeded.
         */
        async imagineScene(sessionId, themeId, { videoUrl = null } = {}) {
            const results = { sessionId, themeId, themeActivated: false, videoSet: false };

            const themeEngine = window.CozyOS.LivingThemeEngine;
            if (themeEngine && typeof themeEngine.activateTheme === "function") {
                const themeResult = themeEngine.activateTheme(themeId);
                results.themeActivated = !!(themeResult && themeResult.success);
                results.themeReason = themeResult ? themeResult.reason : "LivingThemeEngine did not return a result.";
            } else {
                results.themeReason = "LivingThemeEngine is not loaded.";
            }

            if (videoUrl) {
                const background = window.CozyOS.Background;
                if (background && typeof background.setVideoSource === "function") {
                    const videoResult = await background.setVideoSource(videoUrl);
                    results.videoSet = !!(videoResult && videoResult.success);
                    results.videoReason = videoResult ? videoResult.reason : null;
                } else {
                    results.videoReason = "Background engine is not loaded.";
                }
            }

            this.#activeSessions.set(sessionId, { themeId, startedAt: new Date().toISOString() });
            this.#stats.conceptsGenerated++;

            const live = window.CozyOS.Live;
            if (live && typeof live.publish === "function") {
                try { live.publish("imagination:scene-changed", { sessionId, themeId, ...results }); } catch (_err) { /* non-fatal */ }
            }

            return results;
        }

        /**
         * endSession(sessionId)
         *   Real - ends the actual tracked session and publishes a
         *   real end event.
         */
        endSession(sessionId) {
            const existed = this.#activeSessions.delete(sessionId);
            const live = window.CozyOS.Live;
            if (existed && live && typeof live.publish === "function") {
                try { live.publish("imagination:session-ended", { sessionId }); } catch (_err) { /* non-fatal */ }
            }
            return { success: existed };
        }

        /**
         * simulateTransition(sessionId, fromMode, toMode)
         *   Real - applies the actual, existing body.living-* mode
         *   classes (cozy-living-sync.js's established set) with a
         *   real, brief transition, composing the existing CSS
         *   transition already defined on --living-* variables. Never
         *   a second animation system.
         */
        simulateTransition(sessionId, fromMode, toMode) {
            if (typeof document === "undefined" || !document.body) {
                return { success: false, reason: "No real document context available." };
            }
            const validModes = ["living-day", "living-night", "living-rain", "living-sunset", "living-forest", "living-ocean", "living-africa", "living-enterprise"];
            if (!validModes.includes(toMode)) {
                return { success: false, reason: `"${toMode}" is not a real, recognized Living mode.` };
            }
            if (fromMode) document.body.classList.remove(fromMode);
            document.body.classList.add(toMode);
            this.#stats.simulationsExecuted++;
            const live = window.CozyOS.Live;
            if (live && typeof live.publish === "function") {
                try { live.publish("imagination:transition", { sessionId, fromMode, toMode }); } catch (_err) { /* non-fatal */ }
            }
            return { success: true };
        }

        /** getDashboardData() — real, live counts for the requested dashboard panel, never fabricated. */
        getDashboardData() {
            return {
                activeSessions: this.#activeSessions.size,
                conceptsGenerated: this.#stats.conceptsGenerated,
                simulationsExecuted: this.#stats.simulationsExecuted,
                blueprintRequests: 0, // honest: no blueprint-request feature exists in this engine
                health: this.getHealth()
            };
        }

        /** getHealth() — real, checks which of the actually-composed engines are genuinely present. */
        getHealth() {
            return {
                themeEngineAvailable: !!window.CozyOS.LivingThemeEngine,
                backgroundEngineAvailable: !!window.CozyOS.Background,
                liveChannelAvailable: !!window.CozyOS.Live,
                aiSceneGeneration: { available: false, reason: "No connected AI image/scene-generation provider exists in this repository." }
            };
        }

        getVersion() { return "1.0.0"; }
        getId() { return "LiveImagination"; }
        getDependencies() { return ["LivingThemeEngine", "Background", "Live"]; }
    }

    window.CozyOS.LiveImagination = new CozyLiveImaginationEngine();

    // Real registry registration, matching the established pattern -
    // no duplicate registry, composes the existing ServiceRegistry.
    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/ui/live-imagination-engine.js",
                name: "LiveImagination", category: "Living Engine",
                description: "UI/experience coordinator for ambient scenes and theme/background transitions. Composes LivingThemeEngine, Background, and Live - no duplicated rendering, theming, or pub/sub logic."
            });
        } catch (_err) { /* non-fatal - e.g. already registered on hot-reload */ }
    }
})();
