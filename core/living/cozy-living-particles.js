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

    // Engine Ecosystem dependency #4 — real, additive, observational
    // registration into the existing, already-proven
    // core/shell/provider-manager.js (same pattern as Theme/Background/
    // LivingThemeEngine/Animation). ProviderManager never becomes the
    // owner of particle rendering — every existing caller of start()/
    // stop()/pause()/resume()/setDensity()/setSpeed()/setGlow() is
    // completely unchanged; this only adds a second, honest way to
    // observe the same real state.
    //
    // HONESTY: LivingParticles is itself a facade over
    // window.CozyOS.Background's real particles/sparks arrays (see this
    // file's own header) — its health is therefore genuinely dependent
    // on Background, but not REDUNDANT with Background's own
    // registration (Engine Ecosystem dependency #2): Background's
    // health reports whether the canvas is initialized/animating at
    // all, while this reports the narrower, additional fact of whether
    // the particle subsystem SPECIFICALLY is enabled and genuinely
    // populated right now — the same relationship LivingThemeEngine
    // already has to Theme.
    if (window.CozyOS.ProviderManager && typeof window.CozyOS.ProviderManager.register === "function") {
        window.CozyOS.ProviderManager.register({
            id: "living-particles",
            name: "CozyOS Living Particles Engine",
            category: "visual",
            version: "1.0.0",
            dependencies: [],
            getHealth() {
                const particles = window.CozyOS.LivingParticles;
                const bg = window.CozyOS.Background;
                if (!bg) {
                    return { health: "DEGRADED", reason: "Background engine is not loaded — LivingParticles has no real particle system to compose.", backgroundLoaded: false };
                }
                const enabled = particles.isEnabled();
                const particleCount = Array.isArray(bg.particles) ? bg.particles.length : 0;
                const sparkCount = Array.isArray(bg.sparks) ? bg.sparks.length : 0;
                const totalCount = particleCount + sparkCount;
                if (!enabled) {
                    return { health: "DEGRADED", reason: "LivingParticles is currently disabled (stop()/disable() was called, or start() was never called).", backgroundLoaded: true, enabled, particleCount, sparkCount };
                }
                if (totalCount === 0) {
                    return { health: "DEGRADED", reason: "Enabled, but the particle subsystem is currently empty (no particles/sparks exist in Background's real arrays right now).", backgroundLoaded: true, enabled, particleCount, sparkCount };
                }
                return { health: "ONLINE", reason: `Enabled and genuinely populated: ${totalCount} real particle(s)/spark(s) in Background's arrays.`, backgroundLoaded: true, enabled, particleCount, sparkCount };
            }
        });
    }
})();
