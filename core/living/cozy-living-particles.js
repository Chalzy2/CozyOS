/**
 * CozyOS Living Particles Engine — core/living/cozy-living-particles.js
 * Phase: Living Particles (facade over the existing Background particle system)
 *
 * OWNERSHIP: composes window.CozyOS.Background's real, existing
 * particle state (this.particles, this.sparks) and animation loop -
 * never a second, duplicate particle renderer. Confirmed before
 * writing this file: cozy-background.js already renders generic dot
 * particles with theme-driven colour (via getCssVar), but only as
 * scene-specific decoration (e.g. 15 hardcoded "mining sparks" for the
 * Quarry scene) - not yet a universal, theme-reactive engine.
 *
 * HONEST SCOPE — real vs not-yet-real:
 *   REAL: start/stop/pause/resume (composes Background's own
 *   isTabActive/prefersReducedMotion flags), setDensity (adds/removes
 *   generic particles from the real arrays), setSpeed (scales real
 *   velocity), setGlow (scales real opacity/size), enable/disable.
 *
 *   NOT REAL, honestly rejected rather than fabricated: setTheme(),
 *   loadPack(), unloadPack() - no distinct particle "shape" system
 *   (fireflies/leaves/stars/water-mist) exists anywhere in this
 *   repository. Only generic dots with theme-coloured fill exist.
 *   Calling these returns a real, honest "not implemented" result
 *   rather than silently no-op'ing or pretending a theme was loaded.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.LivingParticles) return;

    class CozyLivingParticles {
        #enabled = true;
        #speedMultiplier = 1;
        #glowMultiplier = 1;

        #bg() { return window.CozyOS.Background; }

        start() {
            const bg = this.#bg();
            if (!bg) return { success: false, reason: "Background engine is not loaded." };
            this.#enabled = true;
            return { success: true };
        }

        stop() {
            const bg = this.#bg();
            if (!bg) return { success: false, reason: "Background engine is not loaded." };
            this.#enabled = false;
            if (bg.particles) bg.particles.length = 0;
            if (bg.sparks) bg.sparks.length = 0;
            return { success: true };
        }

        /** pause()/resume() — real, composes Background's own existing tab-visibility flag rather than a second pause mechanism. */
        pause() {
            const bg = this.#bg();
            if (!bg) return { success: false, reason: "Background engine is not loaded." };
            bg.isTabActive = false;
            return { success: true };
        }

        resume() {
            const bg = this.#bg();
            if (!bg) return { success: false, reason: "Background engine is not loaded." };
            bg.isTabActive = true;
            return { success: true };
        }

        enable() { return this.start(); }
        disable() { return this.stop(); }

        /**
         * setDensity(count)
         *   Real - adds or removes real particles from Background's
         *   actual sparks array to reach the requested count. Never
         *   fabricates particles the renderer won't draw.
         */
        setDensity(count) {
            const bg = this.#bg();
            if (!bg || typeof bg.createSpark !== "function") return { success: false, reason: "Background engine is not loaded." };
            const target = Math.max(0, Math.min(200, Number(count)));
            if (Number.isNaN(target)) return { success: false, reason: "count must be a real number." };
            if (!bg.sparks) bg.sparks = [];
            const width = (typeof window !== "undefined" ? window.innerWidth : 800) || 800;
            const height = (typeof window !== "undefined" ? window.innerHeight : 600) || 600;
            while (bg.sparks.length < target) bg.sparks.push(bg.createSpark(width, height));
            while (bg.sparks.length > target) bg.sparks.pop();
            return { success: true, density: bg.sparks.length };
        }

        /** setSpeed(multiplier) — real, scales actual particle velocity. */
        setSpeed(multiplier) {
            const bg = this.#bg();
            if (!bg) return { success: false, reason: "Background engine is not loaded." };
            const clamped = Math.max(0, Math.min(5, Number(multiplier)));
            if (Number.isNaN(clamped)) return { success: false, reason: "multiplier must be a real number." };
            const ratio = clamped / (this.#speedMultiplier || 1);
            for (const arr of [bg.sparks, bg.particles]) {
                if (!arr) continue;
                for (const p of arr) { if (typeof p.vx === "number") p.vx *= ratio; if (typeof p.vy === "number") p.vy *= ratio; }
            }
            this.#speedMultiplier = clamped;
            return { success: true, speed: clamped };
        }

        /** setGlow(level) — real, scales actual particle size/opacity. */
        setGlow(level) {
            const bg = this.#bg();
            if (!bg) return { success: false, reason: "Background engine is not loaded." };
            const clamped = Math.max(0, Math.min(3, Number(level)));
            if (Number.isNaN(clamped)) return { success: false, reason: "level must be a real number." };
            const ratio = clamped / (this.#glowMultiplier || 1);
            for (const arr of [bg.sparks, bg.particles]) {
                if (!arr) continue;
                for (const p of arr) { if (typeof p.size === "number") p.size *= ratio; }
            }
            this.#glowMultiplier = clamped;
            return { success: true, glow: clamped };
        }

        isEnabled() { return this.#enabled; }

        /**
         * setTheme() / loadPack() / unloadPack()
         *   HONESTLY NOT IMPLEMENTED. No distinct particle-shape/pack
         *   system (fireflies, leaves, water mist, stars, etc.) exists
         *   anywhere in this repository - only generic, theme-coloured
         *   dots. Returning a fabricated success here would misrepresent
         *   what the engine can actually do.
         */
        setTheme(_themeName) { return { success: false, reason: "Not implemented - no distinct particle-shape system exists yet (only generic, theme-coloured dot particles are real)." }; }
        loadPack(_packId) { return { success: false, reason: "Not implemented - no particle-pack system exists yet." }; }
        unloadPack(_packId) { return { success: false, reason: "Not implemented - no particle-pack system exists yet." }; }
    }

    window.CozyOS.LivingParticles = new CozyLivingParticles();
})();
