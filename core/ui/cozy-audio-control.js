/**
 * CozyOS — Shared Background Audio Control
 * File Reference: core/ui/cozy-audio-control.js
 *
 * GLOBAL BACKGROUND VISIBILITY + AUDIO CONTROL CORRECTION.
 *
 * OWNERSHIP: this is a VIEW only. It never plays, loads, or manages any
 * sound itself - every real action (mute/unmute/volume) is forwarded to
 * the one, real, existing background-sound engine, window.CozyOS.
 * LivingSounds (core/living/cozy-living-sounds.js), the same single
 * owner core/living/cozy-living-audio.js's own header already documents
 * ("Applications must not embed their own sound systems... this facade
 * IS the single point every application should call"). No second audio
 * engine, no second mute/volume state, no second persistence mechanism
 * - LivingSounds already persists mute (localStorage
 * "cozy.livingSounds.muted") and, as of this same correction, master
 * volume ("cozy.livingSounds.volume") too, so the exact same preference
 * is honored everywhere this control is mounted (User Dashboard,
 * Administrator Dashboard, or any other real page that loads it) simply
 * by both reading the same engine.
 *
 * Self-mounting, matching this directory's own existing convention
 * (core/ui/cozy-background.js, core/ui/cozy-sidebar.js) - include the
 * <script> tag on a page and it attaches itself; no manual init call.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.AudioControl) return; // idempotent, matches every other self-mounting engine in this directory

    const STYLE_ID = "cozy-audio-control-style";

    function injectStyleOnce() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
#cozy-audio-control {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 500000; /* below the Live Window/assistant surfaces (998000-999999) and above ordinary page content, never blocking either */
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(15, 15, 20, 0.55);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    padding: 6px 10px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    transition: background 0.3s ease;
}
#cozy-audio-control-toggle {
    all: unset;
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
}
#cozy-audio-control-toggle:focus-visible {
    outline: 2px solid #38BDF8;
    outline-offset: 2px;
}
#cozy-audio-control-volume {
    width: 0;
    opacity: 0;
    overflow: hidden;
    transition: width 0.25s ease, opacity 0.25s ease, margin 0.25s ease;
    accent-color: #10b981;
    cursor: pointer;
}
#cozy-audio-control.cozy-audio-expanded #cozy-audio-control-volume {
    width: 90px;
    opacity: 1;
}
/* Respect prefers-reduced-motion: no animated expand, just show/hide instantly. */
@media (prefers-reduced-motion: reduce) {
    #cozy-audio-control, #cozy-audio-control-volume { transition: none !important; }
}
/* Mobile: shrink the touch target padding slightly rather than letting the pill collide with narrow status bars. */
@media (max-width: 480px) {
    #cozy-audio-control { top: 10px; right: 10px; padding: 5px 8px; }
    #cozy-audio-control.cozy-audio-expanded #cozy-audio-control-volume { width: 64px; }
}
`;
        document.head.appendChild(style);
    }

    class CozyAudioControl {
        #root = null;
        #toggleBtn = null;
        #volumeSlider = null;
        #expandTimeoutId = null;

        constructor() {
            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", () => this.#mount());
            } else {
                this.#mount();
            }
        }

        #getEngine() {
            return window.CozyOS && window.CozyOS.LivingSounds;
        }

        #mount() {
            if (document.getElementById("cozy-audio-control")) return; // idempotent against a second real call
            injectStyleOnce();

            const engine = this.#getEngine();
            // Honest degrade: if the real engine genuinely isn't loaded on
            // this page, there is nothing real for this control to
            // operate - it does not render a non-functional decoration.
            if (!engine) return;

            const root = document.createElement("div");
            root.id = "cozy-audio-control";

            const toggle = document.createElement("button");
            toggle.id = "cozy-audio-control-toggle";
            toggle.type = "button";

            const slider = document.createElement("input");
            slider.id = "cozy-audio-control-volume";
            slider.type = "range";
            slider.min = "0";
            slider.max = "100";
            slider.step = "5";
            // ACCESSIBILITY — an icon-only control has no accessible name
            // on its own; this explicit label is required, not optional.
            slider.setAttribute("aria-label", "Background volume");
            slider.value = String(Math.round((typeof engine.getMasterVolume === "function" ? engine.getMasterVolume() : 0.6) * 100));

            root.appendChild(toggle);
            root.appendChild(slider);
            document.body.appendChild(root);

            this.#root = root;
            this.#toggleBtn = toggle;
            this.#volumeSlider = slider;

            this.#refreshToggleState();

            toggle.addEventListener("click", () => this.#handleToggleClick());
            slider.addEventListener("input", () => this.#handleVolumeInput());
            // Keep the slider revealed while the user is actively
            // interacting with it (e.g. arrow-key adjustment after tab
            // focus), not just on hover.
            slider.addEventListener("focus", () => this.#expand());
            slider.addEventListener("blur", () => this.#scheduleCollapse());
            root.addEventListener("mouseenter", () => this.#expand());
            root.addEventListener("mouseleave", () => this.#scheduleCollapse());
        }

        #expand() {
            if (this.#expandTimeoutId) { clearTimeout(this.#expandTimeoutId); this.#expandTimeoutId = null; }
            this.#root.classList.add("cozy-audio-expanded");
        }

        #scheduleCollapse() {
            if (this.#expandTimeoutId) clearTimeout(this.#expandTimeoutId);
            this.#expandTimeoutId = setTimeout(() => {
                this.#root.classList.remove("cozy-audio-expanded");
            }, 400);
        }

        #handleToggleClick() {
            const engine = this.#getEngine();
            if (!engine) return;
            if (engine.isMuted()) {
                engine.unmute();
            } else {
                engine.mute();
            }
            this.#refreshToggleState();
            this.#expand();
            this.#scheduleCollapse();
        }

        #handleVolumeInput() {
            const engine = this.#getEngine();
            if (!engine) return;
            const level = Math.max(0, Math.min(100, Number(this.#volumeSlider.value))) / 100;
            engine.setVolume(level);
            // Adjusting volume while muted has no audible effect until
            // unmuted - honest, not a bug - but a real, non-zero level
            // chosen while muted is a real signal the person wants sound
            // back, so this un-mutes at the same time a real physical
            // volume knob would.
            if (level > 0 && engine.isMuted()) engine.unmute();
            this.#refreshToggleState();
        }

        #refreshToggleState() {
            const engine = this.#getEngine();
            if (!engine || !this.#toggleBtn) return;
            const muted = engine.isMuted();
            this.#toggleBtn.textContent = muted ? "\u{1F507}" : "\u{1F50A}"; // 🔇 / 🔊
            // ACCESSIBILITY — the action the button performs when
            // pressed, not merely a static description of the icon,
            // matching this codebase's existing convention for toggle
            // controls (e.g. cozy-toast.js's own labeled actions).
            this.#toggleBtn.setAttribute("aria-label", muted ? "Unmute background sound" : "Mute background sound");
            this.#toggleBtn.setAttribute("aria-pressed", String(muted));
            this.#volumeSlider.disabled = false; // volume remains adjustable while muted, same as a real hardware volume knob
        }
    }

    window.CozyOS.AudioControl = new CozyAudioControl();

    // Engine Ecosystem discovery - real, additive, observational
    // registration (same pattern cozy-background.js/cozy-theme.js
    // already use). Never becomes the owner of audio playback.
    if (window.CozyOS.ProviderManager && typeof window.CozyOS.ProviderManager.register === "function") {
        window.CozyOS.ProviderManager.register({
            id: "cozy-audio-control",
            name: "CozyOS Background Audio Control (UI)",
            category: "visual",
            version: "1.0.0",
            dependencies: ["cozy-living-sounds"],
            getHealth() {
                const mounted = !!document.getElementById("cozy-audio-control");
                const engine = window.CozyOS && window.CozyOS.LivingSounds;
                if (!engine) return { health: "DEGRADED", reason: "LivingSounds engine not present - control did not render.", mounted: false };
                return { health: mounted ? "ONLINE" : "DEGRADED", reason: mounted ? "Mounted and bound to the real LivingSounds engine." : "Engine present but control has not mounted yet.", mounted };
            }
        });
    }
})();
