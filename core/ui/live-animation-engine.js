/**
 * CozyOS Live Animation Engine
 * File Reference: core/ui/live-animation-engine.js
 * Milestone: M206 — Live Animation Engine (scoped extension)
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP (Gate: Integration First)
 *   Before writing this file, verified: LivingMessageEngine (core/ui/
 *   living-message-engine.js) already owns message CRUD, scheduling,
 *   permission checks, and rotation — its `animation` field is a plain
 *   string label, never rendered. cozy-animations.css already defined
 *   two real keyframes (pulse, fade-in), extended this milestone rather
 *   than duplicated. LivingThemeEngine owns theme/color presets;
 *   LanguageEngine owns language. No existing owner does actual DOM
 *   animation rendering — this file is the new, minimal owner of that
 *   one responsibility only.
 *
 * HONEST SCOPE — v1 (this milestone)
 *   Real, tested: showTyping() (incremental reveal + real blinking
 *   cursor), applyAnimation() (real CSS class toggling for pulse,
 *   fade-in, glow x3, bounce, rise), showFromMessageEngine() (composes
 *   LivingMessageEngine.getEligibleMessages()/pickNextMessage() rather
 *   than re-implementing message selection).
 *
 *   NOT built this pass, real and disclosed: ticker/sliding/growing/
 *   floating/rainbow/breathing/rotate/wave animations, the full color/
 *   font/typography configuration system, language-engine/voice
 *   integration (animateTranslation/playVoice), Bible Mode, background
 *   integration, and administrator controls. Each is substantial,
 *   separate work — attempting shallow coverage of all of it would mean
 *   guessing rather than building and testing real behavior.
 *
 * M364.1 ADDITION
 *   "fall-bounce" animation type (cozy-animate-fall-bounce, a new real
 *   keyframe in cozy-animations.css) — added for the startup motto's
 *   per-letter fall/bounce/settle motion, which was incorrectly typing
 *   instead. Composed via applyAnimation(), same as every other
 *   animation type — no second animation mechanism.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.2.0-ENTERPRISE";
    if (window.CozyOS.LiveAnimationEngine) return;

    const REAL_ANIMATION_CLASSES = Object.freeze({
        pulse: "cozy-animate-pulse", "fade-in": "cozy-fade-in", fade: "cozy-fade-in", "glow-emerald": "cozy-glow-emerald",
        "glow-gold": "cozy-glow-gold", "glow-blue": "cozy-glow-blue", bounce: "cozy-animate-bounce", rise: "cozy-animate-rise",
        "fall-bounce": "cozy-animate-fall-bounce"
    });

    class CozyLiveAnimationEngine {
        /**
         * fallBounceText(element, text, splitIndex, options, onComplete)
         *   M364.3 promotion — was a local, launch-sequence.js-only
         *   function (M364.1); promoted here so any real caller (the
         *   shared launch sequence, or login.html's own motto) can reuse
         *   the identical per-letter fall/bounce/settle motion via
         *   applyAnimation()'s existing "fall-bounce" type, rather than
         *   each maintaining its own copy. Behavior for the original
         *   caller is byte-identical (same default stagger/duration and
         *   class names) — this is a relocation, not a rewrite.
         */
        fallBounceText(element, text, splitIndex, options, onComplete) {
            if (typeof options === "function") { onComplete = options; options = {}; }
            options = options || {};
            const greenClass = options.greenClass || "cozy-title-cozy";
            const goldClass = options.goldClass || "cozy-title-os";
            const staggerMs = typeof options.staggerMs === "number" ? options.staggerMs : 45;
            const durationMs = typeof options.durationMs === "number" ? options.durationMs : 550;
            if (!element) return { success: false, reason: "A real DOM element is required." };
            element.innerHTML = "";
            for (let i = 0; i < text.length; i++) {
                const span = document.createElement("span");
                span.textContent = text[i] === " " ? "\u00A0" : text[i];
                span.style.display = "inline-block";
                span.style.animationDelay = `${i * staggerMs}ms`;
                span.className = i < splitIndex ? greenClass : goldClass;
                element.appendChild(span);
                this.applyAnimation(span, "fall-bounce");
            }
            const totalMs = (text.length - 1) * staggerMs + durationMs;
            setTimeout(() => { if (onComplete) onComplete(); }, totalMs);
            return { success: true };
        }

        getVersion() { return VERSION; }
        getSupportedAnimations() { return Object.keys(REAL_ANIMATION_CLASSES); }

        /**
         * applyAnimation(element, animationType)
         *   Real — toggles the real CSS class for a supported animation.
         *   Honestly rejects unsupported types rather than silently
         *   doing nothing or fabricating an animation that doesn't
         *   exist in cozy-animations.css.
         */
        applyAnimation(element, animationType) {
            if (!element || typeof element.classList === "undefined") return { success: false, reason: "A real DOM element is required." };
            const className = REAL_ANIMATION_CLASSES[animationType];
            if (!className) return { success: false, reason: `Unsupported animation type "${animationType}". Supported: ${this.getSupportedAnimations().join(", ")}.` };
            for (const cls of Object.values(REAL_ANIMATION_CLASSES)) element.classList.remove(cls);
            element.classList.add(className);
            return { success: true, className };
        }

        /**
         * showTyping(element, text, { speed, showCursor })
         *   Real — genuine incremental character reveal (not a CSS
         *   trick pretending to type), with a real blinking cursor
         *   element. Returns a real, cancellable handle so callers can
         *   stop it if the text/component changes mid-animation.
         */
        showTyping(element, text, { speed = 40, showCursor = true } = {}) {
            if (!element) return { success: false, reason: "A real DOM element is required." };
            if (typeof text !== "string") return { success: false, reason: "Real text is required." };
            element.textContent = "";
            let index = 0;
            let cancelled = false;
            const cursor = showCursor && typeof document !== "undefined" ? document.createElement("span") : null;
            if (cursor) { cursor.className = "cozy-typing-cursor"; cursor.textContent = "|"; }

            const tick = () => {
                if (cancelled || index >= text.length) {
                    if (cursor && element.appendChild) element.appendChild(cursor);
                    return;
                }
                element.textContent = text.slice(0, index + 1);
                index++;
                setTimeout(tick, speed);
            };
            tick();
            return { success: true, cancel: () => { cancelled = true; } };
        }

        /**
         * showFromMessageEngine(element, { category, mode })
         *   Real — composes the existing LivingMessageEngine for
         *   message selection (never re-implements eligibility/rotation
         *   logic), then applies this file's real rendering for the
         *   message's own recorded animation type.
         */
        showFromMessageEngine(element, { category = null, mode = "sequential" } = {}) {
            const messages = window.CozyOS.LivingMessageEngine;
            if (!messages || typeof messages.pickNextMessage !== "function") {
                return { success: false, reason: "LivingMessageEngine is not loaded." };
            }
            const picked = messages.pickNextMessage({ mode, category });
            if (!picked) return { success: false, reason: "No real, eligible message available right now." };
            element.textContent = picked.text || "";
            const animResult = this.applyAnimation(element, picked.animation || "fade-in");
            if (typeof messages.recordView === "function") messages.recordView(picked.messageId);
            return { success: true, message: picked, animationApplied: animResult.success };
        }
    }

    window.CozyOS.LiveAnimationEngine = new CozyLiveAnimationEngine();
})();
