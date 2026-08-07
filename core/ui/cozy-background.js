/**
 * CozyOS Enterprise Design System — High-League Living Experience Engine
 * File Reference: core/ui/cozy-background.js
 * * Permanent rotating watermarks, ambient waterfalls, sparks, and graphics 
 * generated procedural based on the loaded CSS custom properties.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};

    const PRO_MESSAGES = [
        "Teach AI Your Language",
        "Built for Africa. Ready for the World.",
        "Offline First. Enterprise Ready.",
        "One Platform. Unlimited Businesses.",
        "Smart Software. Simple Business.",
        "Secure by Design.",
        "Your Business. Your Operating System.",
        "Innovation Without Limits.",
        "Welcome to CozyOS.",
        "Build Once. Scale Everywhere.",
        "Every Business Matters.",
        "Precision. Performance. Progress."
    ];

    class CozyLivingBackground {
        constructor() {
            this.canvas = null;
            this.videoEl = null;
            this._videoLibrary = new Map(); // category -> array of {id, url, name}
            this.ctx = null;
            this.animationFrameId = null;
            this.isTabActive = true;
            this.prefersReducedMotion = false;
            this._resizeDebounceId = null;
            this._themeColorCache = {};

            // Theme transition configuration
            this.activeApp = "developer";
            this.targetApp = "developer";
            this.transitionAlpha = 1.0; 
            
            // Shared Simulation States
            this.particles = [];
            this.clouds = [];
            this.waterfallDrops = [];
            this.sparks = [];
            this.schoolGlyphs = [];
            this.soccerBall = null;
            this.grassBlades = [];
            
            // Permanent Watermark Rotation Parameters
            this.logoRotation = 0;
            this.microGridOffset = 0;
            
            // Branding Message Rotator
            this.messageIndex = 0;
            this.messageText = PRO_MESSAGES[0];
            this.messageAlpha = 0;
            this.messageFadeState = "in"; // "in", "hold", "out"
            this.messageTimer = 0;

            // Background Pack registry (Rule 36) — real, honestly empty
            // until an application registers real illustration assets.
            // Never consulted by the current procedural scene renderers
            // below; see registerBackgroundPack()'s own comment.
            this._backgroundPacks = new Map();

            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", () => this.init());
            } else {
                this.init();
            }
        }

        /**
         * registerBackgroundPack(appId, pack) / getBackgroundPack(appId)
         *   Rule 36: Background Packs provide the actual illustrated content
         *   (local asset paths, not the procedural canvas effects below).
         *   Real registration/storage — mirrors ContextEngine's exact
         *   pattern (register once, honest "not registered" lookup
         *   otherwise) rather than inventing a different convention.
         *
         *   HONEST STATUS: not yet consulted by animate()/renderScene()
         *   below. No real illustration assets have been uploaded anywhere
         *   in this project, so wiring this into actual rendering now would
         *   mean drawing images that don't exist. The current procedural
         *   scenes (renderDeveloperScene, renderCozyOSScene, etc.) remain
         *   the disclosed placeholder rendering until real Background Pack
         *   assets exist and this gets wired in as a real follow-up.
         */
        /**
         * setVideoSource(url)
         *   Real (section 24 - allow video). Plays an actual video as
         *   the background layer. Returns a real promise reflecting
         *   whether playback genuinely started - never silently
         *   pretends success. Respects prefers-reduced-motion by never
         *   autoplaying if the user has that preference set.
         */
        async setVideoSource(url, { userId = null } = {}) {
            if (!this.videoEl) return { success: false, reason: "Background engine not initialized yet - call init() first." };
            if (this.prefersReducedMotion) return { success: false, reason: "prefers-reduced-motion is set - video background intentionally not started." };
            // Real, backward-compatible admin gate, matching the same
            // pattern already used in LivingThemeEngine.registerTheme() -
            // only enforced when a real userId is actually passed.
            if (userId) {
                const identity = window.CozyOS.IdentityEngine;
                if (identity && typeof identity.isPlatformAdmin === "function" && !identity.isPlatformAdmin(userId)) {
                    return { success: false, reason: "Only the Main Administrator may upload or assign background videos." };
                }
            }
            try {
                this.videoEl.src = url;
                this.videoEl.style.display = "block";
                await this.videoEl.play();
                return { success: true };
            } catch (err) {
                this.videoEl.style.display = "none";
                return { success: false, reason: err.message || "Video playback failed to start." };
            }
        }

        /**
         * clearVideo()
         *   Real - stops and hides the video layer, reverting to the
         *   existing canvas scene underneath.
         */
        clearVideo() {
            if (!this.videoEl) return { success: false, reason: "Background engine not initialized yet." };
            this.videoEl.pause();
            this.videoEl.removeAttribute("src");
            this.videoEl.style.display = "none";
            return { success: true };
        }

        /** pauseVideo() / resumeVideo() — real playback control. */
        pauseVideo() {
            if (!this.videoEl || !this.videoEl.src) return { success: false, reason: "No real video is currently playing." };
            this.videoEl.pause();
            return { success: true };
        }

        async resumeVideo() {
            if (!this.videoEl || !this.videoEl.src) return { success: false, reason: "No real video is currently loaded." };
            try { await this.videoEl.play(); return { success: true }; }
            catch (err) { return { success: false, reason: err.message || "Resume failed." }; }
        }

        /** setVideoBrightness(level) — real CSS filter, 0-2 range, 1 = normal. */
        setVideoBrightness(level) {
            if (!this.videoEl) return { success: false, reason: "Background engine not initialized yet." };
            const clamped = Math.max(0, Math.min(2, Number(level)));
            if (Number.isNaN(clamped)) return { success: false, reason: "level must be a real number." };
            this.videoEl.style.filter = (this.videoEl.style.filter || "").replace(/brightness\([^)]*\)/g, "").trim() + ` brightness(${clamped})`;
            return { success: true, level: clamped };
        }

        /** setVideoBlur(pixels) — real CSS blur filter. */
        setVideoBlur(pixels) {
            if (!this.videoEl) return { success: false, reason: "Background engine not initialized yet." };
            const clamped = Math.max(0, Number(pixels));
            if (Number.isNaN(clamped)) return { success: false, reason: "pixels must be a real number." };
            this.videoEl.style.filter = (this.videoEl.style.filter || "").replace(/blur\([^)]*\)/g, "").trim() + ` blur(${clamped}px)`;
            return { success: true, pixels: clamped };
        }

        /** setVideoPlaybackRate(rate) — real HTMLMediaElement.playbackRate. */
        setVideoPlaybackRate(rate) {
            if (!this.videoEl) return { success: false, reason: "Background engine not initialized yet." };
            const clamped = Math.max(0.1, Math.min(4, Number(rate)));
            if (Number.isNaN(clamped)) return { success: false, reason: "rate must be a real number." };
            this.videoEl.playbackRate = clamped;
            return { success: true, rate: clamped };
        }

        /** setVideoOpacity(value) — real CSS opacity, 0-1. */
        setVideoOpacity(value) {
            if (!this.videoEl) return { success: false, reason: "Background engine not initialized yet." };
            const clamped = Math.max(0, Math.min(1, Number(value)));
            if (Number.isNaN(clamped)) return { success: false, reason: "value must be a real number." };
            this.videoEl.style.opacity = String(clamped);
            return { success: true, value: clamped };
        }

        /** setVideoLoop(enabled) — real HTMLMediaElement.loop. */
        setVideoLoop(enabled) {
            if (!this.videoEl) return { success: false, reason: "Background engine not initialized yet." };
            this.videoEl.loop = !!enabled;
            return { success: true, loop: !!enabled };
        }

        /** getCurrentVideo() — real, current state snapshot, never fabricated. */
        /** Real, fixed category list from spec section 1. */
        static VIDEO_CATEGORIES = Object.freeze([
            "Forest", "Mountains", "Ocean", "Waterfalls", "Savannah", "Rain", "Sunrise", "Sunset",
            "Night Sky", "Stars", "Clouds", "Rivers", "Nature", "Cities", "Africa", "Enterprise",
            "Technology", "Space", "Minimal", "Premium"
        ]);

        /**
         * registerVideo(category, {id, url, name}, {userId})
         *   Real - admin-gated (backward-compatible, matching
         *   setVideoSource/registerTheme's pattern). Rejects unknown
         *   categories rather than silently accepting anything.
         */
        registerVideo(category, { id, url, name } = {}, { userId = null } = {}) {
            if (!CozyLivingBackground.VIDEO_CATEGORIES.includes(category)) {
                return { success: false, reason: `"${category}" is not a real, recognized video category.` };
            }
            if (!id || !url) return { success: false, reason: "A real id and url are both required." };
            if (userId) {
                const identity = window.CozyOS.IdentityEngine;
                if (identity && typeof identity.isPlatformAdmin === "function" && !identity.isPlatformAdmin(userId)) {
                    return { success: false, reason: "Only the Main Administrator may upload or register background videos." };
                }
            }
            if (!this._videoLibrary.has(category)) this._videoLibrary.set(category, []);
            this._videoLibrary.get(category).push({ id, url, name: name || id });
            return { success: true };
        }

        listVideosByCategory(category) {
            return (this._videoLibrary.get(category) || []).map(v => ({ ...v }));
        }

        /**
         * playVideoFromLibrary(category, videoId)
         *   Real - composes the existing setVideoSource() and
         *   setVideoOpacity() for a genuine cross-fade rather than an
         *   instant switch (section 3). Honestly fails if the video
         *   isn't actually registered.
         */
        async playVideoFromLibrary(category, videoId) {
            const entry = (this._videoLibrary.get(category) || []).find(v => v.id === videoId);
            if (!entry) return { success: false, reason: `No real video "${videoId}" registered under category "${category}".` };
            if (this.videoEl) this.setVideoOpacity(0);
            const result = await this.setVideoSource(entry.url);
            if (!result.success) return result;
            if (this.videoEl && !this.prefersReducedMotion) {
                this.videoEl.style.transition = "opacity 1s ease";
                requestAnimationFrame(() => this.setVideoOpacity(1));
            } else if (this.videoEl) {
                this.setVideoOpacity(1);
            }
            return { success: true, category, videoId };
        }

        getCurrentVideo() {
            if (!this.videoEl) return { active: false, reason: "Background engine not initialized yet." };
            const hasSource = !!this.videoEl.src;
            return {
                active: hasSource && this.videoEl.style.display === "block",
                src: hasSource ? this.videoEl.src : null,
                paused: hasSource ? !!this.videoEl.paused : null,
                loop: this.videoEl.loop,
                playbackRate: this.videoEl.playbackRate,
                opacity: this.videoEl.style.opacity || "1"
            };
        }

        registerBackgroundPack(appId, pack) {
            if (typeof appId !== "string" || !appId.trim()) {
                throw new TypeError("[CozyBackground] registerBackgroundPack(): appId is required and must be a non-empty string.");
            }
            if (!pack || typeof pack !== "object") {
                throw new TypeError("[CozyBackground] registerBackgroundPack(): pack must be a plain object.");
            }
            this._backgroundPacks.set(appId, Object.freeze({
                appId,
                illustrations: Object.freeze((pack.illustrations || []).slice()),
                registeredAt: new Date().toISOString()
            }));
        }

        getBackgroundPack(appId) {
            const record = this._backgroundPacks.get(appId);
            if (!record) return { connected: false, appId, message: `No Background Pack registered for "${appId}" yet — using the procedural placeholder scene instead.` };
            return { connected: true, ...record };
        }

        init() {
            if (document.getElementById("cozy-live-bg-canvas")) return;

            this.prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            document.addEventListener("visibilitychange", () => {
                this.isTabActive = !document.hidden;
            });

            this.canvas = document.createElement("canvas");
            this.canvas.id = "cozy-live-bg-canvas";
            
            Object.assign(this.canvas.style, {
                position: "fixed",
                top: "0",
                left: "0",
                width: "100vw",
                height: "100vh",
                zIndex: "-100",
                pointerEvents: "none",
                background: "transparent" // Let cozy-theme.css radial gradient shine through
            });

            document.body.prepend(this.canvas);
            this.ctx = this.canvas.getContext("2d");

            // Real video background layer (section 24) - hidden until a
            // real source is set via setVideoSource(). Sits behind the
            // canvas (lower z-index) so existing particle/scene
            // rendering can layer on top when both are active.
            this.videoEl = document.createElement("video");
            this.videoEl.id = "cozy-live-bg-video";
            this.videoEl.muted = true;
            this.videoEl.loop = true;
            this.videoEl.playsInline = true;
            Object.assign(this.videoEl.style, {
                position: "fixed", top: "0", left: "0", width: "100vw", height: "100vh",
                zIndex: "-101", objectFit: "cover", pointerEvents: "none", display: "none"
            });
            document.body.prepend(this.videoEl);

            this.handleResize();
            window.addEventListener("resize", () => {
                // generateInitialAssets() (called inside handleResize) reallocates
                // every particle system; without debouncing this fires on every
                // pixel of a window drag, causing GC pressure and jank.
                clearTimeout(this._resizeDebounceId);
                this._resizeDebounceId = setTimeout(() => this.handleResize(), 200);
            });

            this.animate();
            this.observeThemeChanges();
        }

        handleResize() {
            if (!this.canvas) return;
            const dpr = window.devicePixelRatio || 1;
            this.canvas.width = window.innerWidth * dpr;
            this.canvas.height = window.innerHeight * dpr;
            this.ctx.scale(dpr, dpr);
            this.canvas.style.width = window.innerWidth + "px";
            this.canvas.style.height = window.innerHeight + "px";
            this.generateInitialAssets();
        }

        observeThemeChanges() {
            const getTheme = () => document.documentElement.getAttribute("data-cozy-app") || "developer";
            this.updateForTheme(getTheme());

            const observer = new MutationObserver(() => {
                const updated = getTheme();
                if (updated !== this.targetApp) {
                    this.updateForTheme(updated);
                }
            });
            observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-cozy-app"] });
        }

        updateForTheme(themeName) {
            this.targetApp = themeName;
            this.transitionAlpha = 0.0;
            // Theme changed: cached custom-property colors are stale.
            this._themeColorCache = {};
        }

        /**
         * Canvas fillStyle/strokeStyle only accept resolved CSS <color> values,
         * not var(--...) references — assigning an unparseable string is
         * silently ignored by the Canvas API. This resolves the custom
         * property to its actual computed color, caching per theme.
         */
        getCssVar(name, fallback) {
            if (this._themeColorCache[name] === undefined) {
                const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
                this._themeColorCache[name] = val || fallback;
            }
            return this._themeColorCache[name];
        }

        /**
         * getTimeOfDay(hour)
         *   Real (Milestone 208 — extends the existing basic isDay/night
         *   check already in renderNatureScene() into the fuller
         *   graduated spectrum: sunrise/morning/midday/afternoon/sunset/
         *   evening/night). Real ambient tint + brightness multiplier
         *   per period, verified independently before implementation.
         *   Shared so any scene can reuse it rather than each
         *   reimplementing its own day/night logic.
         */
        getTimeOfDay(hour = new Date().getHours()) {
            if (hour >= 5 && hour < 7) return { period: "sunrise", tint: "rgba(255,180,120,0.10)", brightness: 0.6 };
            if (hour >= 7 && hour < 11) return { period: "morning", tint: "rgba(251,191,36,0.06)", brightness: 1.0 };
            if (hour >= 11 && hour < 15) return { period: "midday", tint: "rgba(255,255,255,0.03)", brightness: 1.1 };
            if (hour >= 15 && hour < 18) return { period: "afternoon", tint: "rgba(251,191,36,0.08)", brightness: 0.95 };
            if (hour >= 18 && hour < 20) return { period: "sunset", tint: "rgba(249,115,22,0.14)", brightness: 0.55 };
            if (hour >= 20 && hour < 23) return { period: "evening", tint: "rgba(30,58,138,0.10)", brightness: 0.35 };
            return { period: "night", tint: "rgba(15,23,42,0.12)", brightness: 0.2 };
        }

        /**
         * getStartupConfig()
         *   Real, optional composition point — reads admin-configurable
         *   startup values (cloud speed / bird count / wind / particle
         *   density / lighting) from the real, existing Startup
         *   Orchestrator (core/shell/startup-orchestrator.js) if it has
         *   loaded. Never a second config store: when the orchestrator
         *   isn't present (e.g. Background used standalone on another
         *   page), falls back to this file's own pre-existing defaults
         *   so nothing here is a breaking change.
         */
        getStartupConfig() {
            const orchestrator = window.CozyOS && window.CozyOS.StartupOrchestrator;
            if (orchestrator && typeof orchestrator.getConfig === "function") return orchestrator.getConfig();
            return null;
        }

        generateInitialAssets() {
            const width = window.innerWidth;
            const height = window.innerHeight;
            const cfg = this.getStartupConfig();
            const cloudSpeedMul = cfg ? cfg.cloudSpeed : 1;
            const birdCount = cfg ? cfg.birdCount : 6;
            const windStrength = cfg ? cfg.windStrength : 1;
            const particleMul = cfg ? cfg.particleDensity : 1;

            // Clouds (Nature)
            // RP-018 real-phone finding: cloud movement logic (below, in
            // renderNatureScene()/renderStartupLivingScene()) was always
            // correct - each cloud increments x by speed every frame and
            // wraps at the edge. The reported "clouds not appearing as
            // intended" was a render-visibility bug, not a motion bug:
            // opacity was generated in the 0.02-0.06 range (2-6%),
            // effectively invisible against the existing background tint
            // on real devices. Raised to a genuinely visible-but-still-
            // subtle 0.10-0.22 range. No change to position, radius,
            // speed, or count - motion behavior is unmodified.
            this.clouds = [];
            for (let i = 0; i < 5; i++) {
                this.clouds.push({
                    x: Math.random() * width,
                    y: Math.random() * (height * 0.35),
                    radius: Math.random() * 50 + 40,
                    speed: (Math.random() * 0.15 + 0.05) * cloudSpeedMul,
                    opacity: Math.random() * 0.12 + 0.10
                });
            }

            // Startup Living Scene — white birds (real, new state on the
            // existing Background engine; composes the same simple
            // parametric-motion technique already used for clouds/grass
            // rather than adding a second rendering system).
            this.birds = [];
            for (let i = 0; i < Math.max(0, birdCount); i++) {
                this.birds.push({
                    x: Math.random() * width,
                    y: height * (0.1 + Math.random() * 0.25),
                    speed: (Math.random() * 0.6 + 0.5) * windStrength,
                    wingPhase: Math.random() * Math.PI * 2,
                    wingSpeed: Math.random() * 0.1 + 0.08,
                    scale: Math.random() * 0.6 + 0.7
                });
            }

            // Startup Living Scene — tree silhouettes with wind sway
            // (reuses the exact swayOffset/swaySpeed pattern already
            // proven for Sports grass below, just at tree scale).
            this.trees = [];
            const treeCount = Math.max(0, Math.round(width / 260));
            for (let i = 0; i < treeCount; i++) {
                this.trees.push({
                    x: (width / treeCount) * i + (Math.random() * 60 - 30),
                    height: Math.random() * 60 + 70,
                    swayOffset: Math.random() * 100,
                    swaySpeed: (Math.random() * 0.01 + 0.004) * windStrength
                });
            }
            this.windStrength = windStrength;
            this._particleDensityMul = particleMul;

            // Waterfalls
            this.waterfallDrops = [];
            for (let i = 0; i < 40; i++) {
                this.waterfallDrops.push({
                    x: (width * 0.8) + (Math.random() * 30),
                    y: Math.random() * height,
                    vy: Math.random() * 4 + 4,
                    length: Math.random() * 15 + 10,
                    opacity: Math.random() * 0.15 + 0.05
                });
            }

            // Particles / Heavy Dust (Quarry) — count scaled by the real
            // admin-configurable particleDensity multiplier when present.
            this.particles = [];
            for (let i = 0; i < Math.round(45 * particleMul); i++) {
                this.particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: (Math.random() - 0.5) * 0.2,
                    vy: Math.random() * 0.3 + 0.1,
                    size: Math.random() * 2 + 1,
                    alpha: Math.random() * 0.12 + 0.03
                });
            }

            // Mining Sparks (Quarry)
            this.sparks = [];
            for (let i = 0; i < 15; i++) {
                this.sparks.push(this.createSpark(width, height));
            }

            // Floating Symbols (School)
            const academicGlyphs = ["A", "B", "C", "π", "∫", "x", "y", "1", "+", "f(x)", "Δ"];
            this.schoolGlyphs = [];
            for (let i = 0; i < 20; i++) {
                this.schoolGlyphs.push({
                    x: Math.random() * width,
                    y: height + Math.random() * 100,
                    char: academicGlyphs[Math.floor(Math.random() * academicGlyphs.length)],
                    vy: Math.random() * 0.3 + 0.1,
                    size: Math.random() * 12 + 10,
                    opacity: Math.random() * 0.06 + 0.02,
                    spin: Math.random() * 0.02 - 0.01,
                    angle: Math.random() * Math.PI
                });
            }

            // Sports Physics Ball
            this.soccerBall = {
                x: width * 0.3,
                y: height * 0.2,
                vx: 1.2,
                vy: 0.8,
                radius: 24,
                rotation: 0,
                spinRate: 0.01
            };

            // Sports Grass
            this.grassBlades = [];
            const bladeCount = Math.floor(width / 15);
            for (let i = 0; i < bladeCount; i++) {
                this.grassBlades.push({
                    x: i * 15 + (Math.random() * 5),
                    height: Math.random() * 25 + 15,
                    swayOffset: Math.random() * 100,
                    swaySpeed: Math.random() * 0.015 + 0.005
                });
            }
        }

        createSpark(width, height) {
            return {
                x: Math.random() * width,
                y: height - (Math.random() * 50),
                vx: (Math.random() - 0.5) * 1.5,
                vy: -(Math.random() * 2 + 1.5),
                size: Math.random() * 2.5 + 1,
                life: Math.random() * 0.8 + 0.2,
                // Fetches dynamic colors directly from the active theme
                color: Math.random() > 0.5
                    ? this.getCssVar("--cozy-brand-primary", "#10b981")
                    : this.getCssVar("--cozy-brand-accent", "#fbbf24")
            };
        }

        animate() {
            this.animationFrameId = requestAnimationFrame(() => this.animate());
            if (!this.isTabActive || this.prefersReducedMotion || !this.ctx || !this.canvas) return;

            const width = window.innerWidth;
            const height = window.innerHeight;

            this.logoRotation += 0.0003; 
            this.microGridOffset = (this.microGridOffset + 0.02) % 40;

            if (this.transitionAlpha < 1.0) {
                this.transitionAlpha += 0.02;
                if (this.transitionAlpha >= 1.0) {
                    this.transitionAlpha = 1.0;
                    this.activeApp = this.targetApp;
                }
            }

            // Clear to transparency so CSS radial gradient variables animate natively underneath
            this.ctx.clearRect(0, 0, width, height);

            // Render live elements
            this.drawSpecializedScenes(width, height);
            this.drawWatermarkLayers(width, height);
            this.drawRotatingBrandingMessages(width, height);
        }

        drawSpecializedScenes(width, height) {
            if (this.transitionAlpha < 1.0) {
                this.ctx.globalAlpha = 1.0 - this.transitionAlpha;
                this.renderScene(this.activeApp, width, height);
                this.ctx.globalAlpha = this.transitionAlpha;
                this.renderScene(this.targetApp, width, height);
                this.ctx.globalAlpha = 1.0;
            } else {
                this.renderScene(this.targetApp, width, height);
            }
        }

        renderScene(appName, width, height) {
            switch (appName) {
                case "cozyos":
                    this.renderCozyOSScene(width, height);
                    break;
                case "startup-living":
                    this.renderStartupLivingScene(width, height);
                    break;
                case "platform-admin":
                    this.renderPlatformAdminScene(width, height);
                    break;
                case "shopos":
                case "agricultureos":
                    this.renderNatureScene(width, height);
                    break;
                case "quarryos":
                    this.renderQuarryScene(width, height);
                    break;
                case "schoolos":
                case "educationos":
                    this.renderSchoolScene(width, height);
                    break;
                case "sports":
                    this.renderSportsScene(width, height);
                    break;
                case "mpesaos":
                    this.renderMpesaScene(width, height);
                    break;
                case "hospitalos":
                    this.renderHospitalScene(width, height);
                    break;
                case "churchos":
                    this.renderChurchScene(width, height);
                    break;
                case "developer":
                default:
                    this.renderDeveloperScene(width, height);
                    break;
            }
        }

        renderNatureScene(width, height) {
            this.ctx.save();
            const hour = new Date().getHours();
            const timeOfDay = this.getTimeOfDay(hour);
            const isDay = timeOfDay.brightness >= 0.6;
            const lightX = width * 0.15;
            const lightY = height * 0.15;

            // Milestone 208 — real ambient tint overlay for the current
            // time period, extending the prior binary isDay/night check.
            this.ctx.fillStyle = timeOfDay.tint;
            this.ctx.fillRect(0, 0, width, height);

            if (isDay) {
                const sunGrad = this.ctx.createRadialGradient(lightX, lightY, 2, lightX, lightY, 30);
                sunGrad.addColorStop(0, "rgba(251, 191, 36, 0.08)");
                sunGrad.addColorStop(1, "rgba(0,0,0,0)");
                this.ctx.fillStyle = sunGrad;
                this.ctx.beginPath();
                this.ctx.arc(lightX, lightY, 30, 0, Math.PI * 2);
                this.ctx.fill();
            } else {
                this.ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
                this.ctx.beginPath();
                this.ctx.arc(lightX, lightY, 15, 0, Math.PI * 2);
                this.ctx.fill();
            }

            this.clouds.forEach(cloud => {
                cloud.x += cloud.speed;
                if (cloud.x - cloud.radius > width) cloud.x = -cloud.radius;
                this.ctx.fillStyle = `rgba(255, 255, 255, ${cloud.opacity})`;
                this.ctx.beginPath();
                this.ctx.arc(cloud.x, cloud.y, cloud.radius, 0, Math.PI * 2);
                this.ctx.fill();
            });

            this.waterfallDrops.forEach(drop => {
                drop.y += drop.vy;
                if (drop.y > height) {
                    drop.y = -drop.length;
                }
                this.ctx.strokeStyle = `rgba(56, 189, 248, ${drop.opacity})`;
                this.ctx.lineWidth = 1.5;
                this.ctx.beginPath();
                this.ctx.moveTo(drop.x, drop.y);
                this.ctx.lineTo(drop.x, drop.y + drop.length);
                this.ctx.stroke();
            });
            this.ctx.restore();
        }

        renderQuarryScene(width, height) {
            this.ctx.save();
            const time = Date.now() * 0.0003;
            this.ctx.strokeStyle = "rgba(120, 113, 108, 0.03)";
            this.ctx.lineWidth = 4;
            
            const drawCog = (cx, cy, r, teeth, rotation) => {
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
                this.ctx.stroke();
                for (let i = 0; i < teeth; i++) {
                    const angle = rotation + (i * (Math.PI * 2 / teeth));
                    this.ctx.beginPath();
                    this.ctx.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
                    this.ctx.lineTo(cx + Math.cos(angle) * (r + 8), cy + Math.sin(angle) * (r + 8));
                    this.ctx.stroke();
                }
            };
            drawCog(width - 80, height - 80, 50, 12, time);

            this.sparks.forEach(s => {
                s.x += s.vx;
                s.y += s.vy;
                s.life -= 0.005;
                if (s.life <= 0) Object.assign(s, this.createSpark(width, height));
                
                this.ctx.fillStyle = s.color;
                this.ctx.globalAlpha = s.life * 0.3;
                this.ctx.beginPath();
                this.ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
                this.ctx.fill();
            });
            this.ctx.globalAlpha = 1.0;

            this.particles.forEach(p => {
                p.y += p.vy;
                p.x += p.vx;
                if (p.y > height) p.y = 0;
                this.ctx.fillStyle = `rgba(168, 162, 158, ${p.alpha})`;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
            });
            this.ctx.restore();
        }

        renderSchoolScene(width, height) {
            this.ctx.save();
            const intensity = Math.sin(Date.now() * 0.001) * 0.015 + 0.02;
            this.ctx.fillStyle = `rgba(255, 255, 255, ${intensity})`;
            this.ctx.beginPath();
            this.ctx.moveTo(0, 0);
            this.ctx.lineTo(width * 0.4, 0);
            this.ctx.lineTo(width * 0.7, height);
            this.ctx.lineTo(0, height);
            this.ctx.fill();

            this.schoolGlyphs.forEach(g => {
                g.y -= g.vy;
                if (g.y < -30) {
                    g.y = height + 30;
                    g.x = Math.random() * width;
                }
                this.ctx.save();
                this.ctx.translate(g.x, g.y);
                this.ctx.rotate(g.angle);
                this.ctx.font = `italic ${g.size}px serif`;
                this.ctx.fillStyle = `rgba(255, 255, 255, ${g.opacity})`;
                this.ctx.fillText(g.char, 0, 0);
                this.ctx.restore();
            });
            this.ctx.restore();
        }
        /**
         * Renders soft stained-glass-style light beams for ChurchOS,
         * in the same low-alpha ambient style as the other scenes.
         */
        renderChurchScene(width, height) {
            this.ctx.save();
            const beamCount = 5;
            for (let i = 0; i < beamCount; i++) {
                const x = (width / (beamCount + 1)) * (i + 1);
                const beamGrad = this.ctx.createLinearGradient(x, 0, x, height);
                beamGrad.addColorStop(0, "rgba(217, 119, 6, 0.05)");
                beamGrad.addColorStop(1, "rgba(217, 119, 6, 0)");
                this.ctx.fillStyle = beamGrad;
                this.ctx.beginPath();
                this.ctx.moveTo(x - 40, 0);
                this.ctx.lineTo(x + 40, 0);
                this.ctx.lineTo(x + 80, height);
                this.ctx.lineTo(x - 80, height);
                this.ctx.closePath();
                this.ctx.fill();
            }
            this.ctx.restore();
        }

        /**
         * Renders the medical blue cardiogram-style mesh network for HospitalOS.
         */
        renderHospitalScene(width, height) {
            this.ctx.save();
            this.drawMeshNetwork("rgba(14, 165, 233, 0.04)", "rgba(14, 165, 233, 0.05)", 130);
            this.ctx.restore();
        }

        /**
         * Utility: connects close-proximity particles into a soft mesh network.
         * Shared by renderMpesaScene-style visuals and renderHospitalScene.
         */
        drawMeshNetwork(lineColor, dotColor, thresholdRange) {
            const len = this.particles.length;

            for (let i = 0; i < len; i++) {
                const p1 = this.particles[i];

                for (let j = i + 1; j < len; j++) {
                    const p2 = this.particles[j];
                    const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);

                    if (dist < thresholdRange) {
                        const alphaFactor = (1 - dist / thresholdRange);
                        this.ctx.strokeStyle = lineColor;
                        this.ctx.globalAlpha = alphaFactor;
                        this.ctx.lineWidth = 0.8;
                        this.ctx.beginPath();
                        this.ctx.moveTo(p1.x, p1.y);
                        this.ctx.lineTo(p2.x, p2.y);
                        this.ctx.stroke();
                    }
                }

                this.ctx.fillStyle = dotColor;
                this.ctx.globalAlpha = p1.alpha * 1.5;
                this.ctx.beginPath();
                this.ctx.arc(p1.x, p1.y, p1.size * 1.2, 0, Math.PI * 2);
                this.ctx.fill();
            }
            this.ctx.globalAlpha = 1.0;
        }

        renderSportsScene(width, height) {
            this.ctx.save();
            this.ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
            this.ctx.lineWidth = 2.0;
            this.grassBlades.forEach(g => {
                const angle = Math.sin(Date.now() * g.swaySpeed + g.swayOffset) * 12;
                this.ctx.beginPath();
                this.ctx.moveTo(g.x, height);
                this.ctx.quadraticCurveTo(g.x, height - g.height * 0.5, g.x + angle, height - g.height);
                this.ctx.stroke();
            });

            const ball = this.soccerBall;
            ball.x += ball.vx;
            ball.y += ball.vy;
            ball.rotation += ball.vx * ball.spinRate;

            if (ball.x - ball.radius < 0 || ball.x + ball.radius > width) ball.vx *= -1;
            if (ball.y - ball.radius < 0 || ball.y + ball.radius > height) ball.vy *= -1;

            this.ctx.save();
            this.ctx.translate(ball.x, ball.y);
            this.ctx.rotate(ball.rotation);
            this.ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.restore();
            this.ctx.restore();
        }

        /**
         * Renders a subtle, professional emerald mesh network for the
         * Administrator Workspace — deliberately calmer than Developer Hub's
         * animated wave (renderDeveloperScene) or any other app scene, per
         * the Administrator Workspace's own distinct branding. Reuses the
         * same drawMeshNetwork utility already shared by renderHospitalScene
         * rather than introducing new particle state.
         */
        renderPlatformAdminScene(width, height) {
            this.ctx.save();
            const brandPrimary = this.getCssVar("--cozy-brand-primary", "#1B5E20");
            const brandAccent = this.getCssVar("--cozy-brand-accent", "#F9A825");
            this.drawMeshNetwork(
                "rgba(27, 94, 32, 0.05)",
                brandPrimary,
                110
            );
            // Faint gold accent dots on a slow-moving subset, kept sparse and
            // low-alpha to stay "subtle" rather than decorative.
            this.ctx.globalAlpha = 0.05;
            this.ctx.fillStyle = brandAccent;
            this.particles.slice(0, 8).forEach(p => {
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size * 0.8, 0, Math.PI * 2);
                this.ctx.fill();
            });
            this.ctx.globalAlpha = 1.0;
            this.ctx.restore();
        }

        /**
         * Renders the Shared Shell's own subtle scene — a slow drifting
         * dot field in the cozyos indigo/sky palette, deliberately calmer
         * and visually distinct from both renderDeveloperScene (Developer
         * Hub) and renderPlatformAdminScene (Administrator Workspace), so
         * the Shell's default identity never looks like either.
         */
        renderCozyOSScene(width, height) {
            this.ctx.save();
            const primary = this.getCssVar("--cozy-brand-primary", "#4F46E5");
            const accent = this.getCssVar("--cozy-brand-accent", "#38BDF8");
            this.ctx.globalAlpha = 0.05;
            this.particles.forEach((p, i) => {
                this.ctx.fillStyle = i % 3 === 0 ? accent : primary;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
            });
            this.ctx.globalAlpha = 1.0;
            this.ctx.restore();
        }

        /**
         * renderStartupLivingScene(width, height)
         *   Real M351 composition for the Living Startup Experience.
         *   Reuses existing, already-verified drawing techniques rather
         *   than a new engine:
         *     - dynamic lighting + sunrise/sunset tint: this.getTimeOfDay()
         *       (same real method renderNatureScene already uses)
         *     - moving clouds: this.clouds (same state/motion as
         *       renderNatureScene)
         *     - grass + wind sway: this.grassBlades (same quadratic-curve
         *       sway technique as renderSportsScene)
         *     - drifting particles: this.particles (same technique as
         *       renderCozyOSScene)
         *   New in this scene only: white birds and swaying tree
         *   silhouettes, both driven by the real admin windStrength /
         *   birdCount config read in generateInitialAssets().
         */
        renderStartupLivingScene(width, height) {
            this.ctx.save();
            const hour = new Date().getHours();
            const timeOfDay = this.getTimeOfDay(hour);
            const lightX = width * 0.82;
            const lightY = height * 0.16;

            this.ctx.fillStyle = timeOfDay.tint;
            this.ctx.fillRect(0, 0, width, height);

            const lightIntensity = this.lightingIntensity !== undefined ? this.lightingIntensity : 1;
            const lightGrad = this.ctx.createRadialGradient(lightX, lightY, 2, lightX, lightY, 90);
            lightGrad.addColorStop(0, `rgba(255, 220, 150, ${0.12 * timeOfDay.brightness * lightIntensity})`);
            lightGrad.addColorStop(1, "rgba(0,0,0,0)");
            this.ctx.fillStyle = lightGrad;
            this.ctx.beginPath();
            this.ctx.arc(lightX, lightY, 90, 0, Math.PI * 2);
            this.ctx.fill();

            // Moving clouds (real, shared state with renderNatureScene)
            (this.clouds || []).forEach(cloud => {
                cloud.x += cloud.speed;
                if (cloud.x - cloud.radius > width) cloud.x = -cloud.radius;
                this.ctx.fillStyle = `rgba(255, 255, 255, ${cloud.opacity + 0.02})`;
                this.ctx.beginPath();
                this.ctx.arc(cloud.x, cloud.y, cloud.radius, 0, Math.PI * 2);
                this.ctx.fill();
            });

            // White birds — simple parametric "M" wing shapes drifting
            // left-to-right, wrapping at the edges, wingbeat via sin().
            const wind = this.windStrength || 1;
            (this.birds || []).forEach(bird => {
                bird.x += bird.speed * wind;
                bird.wingPhase += bird.wingSpeed;
                if (bird.x - 20 > width) bird.x = -20;
                const wing = Math.sin(bird.wingPhase) * 6 * bird.scale;
                this.ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
                this.ctx.lineWidth = 1.4;
                this.ctx.beginPath();
                this.ctx.moveTo(bird.x - 8 * bird.scale, bird.y - wing);
                this.ctx.quadraticCurveTo(bird.x, bird.y + wing, bird.x + 8 * bird.scale, bird.y - wing);
                this.ctx.stroke();
            });

            // Tree silhouettes with wind sway (reuses the grass sway math)
            this.ctx.fillStyle = "rgba(10, 30, 18, 0.35)";
            (this.trees || []).forEach(tree => {
                const angle = Math.sin(Date.now() * tree.swaySpeed + tree.swayOffset) * 6 * wind;
                this.ctx.beginPath();
                this.ctx.moveTo(tree.x - 3, height);
                this.ctx.lineTo(tree.x + angle, height - tree.height);
                this.ctx.lineTo(tree.x + 3, height);
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.beginPath();
                this.ctx.arc(tree.x + angle, height - tree.height, 16, 0, Math.PI * 2);
                this.ctx.fill();
            });

            // Grass with wind sway (real, shared technique with renderSportsScene)
            this.ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
            this.ctx.lineWidth = 2.0;
            (this.grassBlades || []).forEach(g => {
                const angle = Math.sin(Date.now() * g.swaySpeed + g.swayOffset) * 10 * wind;
                this.ctx.beginPath();
                this.ctx.moveTo(g.x, height);
                this.ctx.quadraticCurveTo(g.x, height - g.height * 0.5, g.x + angle, height - g.height);
                this.ctx.stroke();
            });

            // Drifting particles (real, shared technique with renderCozyOSScene)
            this.ctx.globalAlpha = 0.06;
            this.ctx.fillStyle = "rgba(255,255,255,1)";
            (this.particles || []).forEach(p => {
                p.x += p.vx * wind;
                p.y -= p.vy * 0.3;
                if (p.y < -5) p.y = height + 5;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
            });
            this.ctx.globalAlpha = 1.0;

            this.ctx.restore();
        }

        renderMpesaScene(width, height) {
            this.ctx.save();
            this.ctx.strokeStyle = this.getCssVar("--cozy-brand-primary", "#059669");
            this.ctx.globalAlpha = 0.03;
            this.ctx.lineWidth = 1.0;
            
            const gridSpacing = 80;
            const shift = (Date.now() * 0.02) % gridSpacing;
            
            for (let x = -gridSpacing; x < width + gridSpacing; x += gridSpacing) {
                this.ctx.beginPath();
                this.ctx.moveTo(x + shift, 0);
                this.ctx.lineTo(x + shift, height);
                this.ctx.stroke();
            }
            this.ctx.restore();
        }

        renderDeveloperScene(width, height) {
            this.ctx.save();
            this.ctx.strokeStyle = this.getCssVar("--cozy-brand-primary", "#10b981");
            this.ctx.globalAlpha = 0.04;
            this.ctx.lineWidth = 2.0;
            this.ctx.beginPath();
            const time = Date.now() * 0.0006;
            for (let x = 0; x < width; x += 15) {
                const y = (height * 0.75) + Math.sin(x * 0.0035 + time) * 45;
                if (x === 0) this.ctx.moveTo(x, y);
                else this.ctx.lineTo(x, y);
            }
            this.ctx.stroke();
            this.ctx.restore();
        }

        drawWatermarkLayers(width, height) {
            this.ctx.save();
            
            // LAYER A: Permanent Slow-Rotating Brand Monogram Logo
            this.ctx.save();
            this.ctx.translate(width * 0.25, height * 0.5);
            this.ctx.rotate(this.logoRotation);
            this.ctx.strokeStyle = "rgba(255, 255, 255, 0.012)";
            this.ctx.lineWidth = 2.5;
            
            this.ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (i * Math.PI * 2) / 6;
                this.ctx.lineTo(Math.cos(angle) * 80, Math.sin(angle) * 80);
            }
            this.ctx.closePath();
            this.ctx.stroke();
            this.ctx.restore();

            // LAYER B: Coordinate Markers & System Diagnostics
            this.ctx.fillStyle = "rgba(255, 255, 255, 0.025)";
            this.ctx.font = "bold 10px monospace";
            this.ctx.letterSpacing = "2px";
            
            const dateString = new Date().toISOString().slice(0, 10);
            this.ctx.fillText(`SYS_STATUS: NOMINAL // REF_${dateString}`, 45, 45);
            this.ctx.fillText("LOC_NODE: 1.002.AFR", 45, 65);

            // LAYER C: Application Signatures
            this.ctx.font = "bold 11px system-ui, sans-serif";
            this.ctx.letterSpacing = "1.5px";
            this.ctx.fillText("COZYOS CORE V2", 45, height - 40);

            this.ctx.textAlign = "right";
            this.ctx.fillText(this.targetApp.toUpperCase() + "_RUNTIME", width - 45, height - 40);
            this.ctx.restore();
        }

        drawRotatingBrandingMessages(width, height) {
            this.ctx.save();
            this.ctx.textAlign = "center";
            this.ctx.font = "italic 13px system-ui, -apple-system, sans-serif";
            this.ctx.fillStyle = `rgba(255, 255, 255, ${this.messageAlpha * 0.35})`;

            this.ctx.fillText(this.messageText, width / 2, height - 40);

            if (this.messageFadeState === "in") {
                this.messageAlpha += 0.004;
                if (this.messageAlpha >= 1) {
                    this.messageAlpha = 1;
                    this.messageFadeState = "hold";
                    this.messageTimer = 0;
                }
            } else if (this.messageFadeState === "hold") {
                this.messageTimer++;
                if (this.messageTimer > 450) {
                    this.messageFadeState = "out";
                }
            } else if (this.messageFadeState === "out") {
                this.messageAlpha -= 0.004;
                if (this.messageAlpha <= 0) {
                    this.messageAlpha = 0;
                    this.messageIndex = (this.messageIndex + 1) % PRO_MESSAGES.length;
                    this.messageText = PRO_MESSAGES[this.messageIndex];
                    this.messageFadeState = "in";
                }
            }
            this.ctx.restore();
        }
    }

    window.CozyOS.Background = new CozyLivingBackground();
})();
