/**
 * CozyOS — SpiritualOS Live Window Mode
 * File Reference: core/living/spiritual-live-window-mode.js
 *
 * PURPOSE
 *   Registers "spiritual" with the ONE universal window.CozyOS.LiveWindow
 *   (core/shell/live-window-controller.js), following the exact pattern
 *   ChurchOS's worship-live-window-mode.js established.
 *
 * WHY THIS FILE EXISTS (decision, not guessed)
 *   SpiritualOS has no applications/SpiritualOS/ page and no standalone
 *   application — it is an additive capability, spiritual-capability.js
 *   (real handlePersonalPrayer/handlePersonalScripture/
 *   handlePersonalDevotional/handlePersonalWorshipInfo functions) plus
 *   spiritual-intent-router.js's dispatch(). Reading both files' own
 *   headers before writing this one found spiritual-intent-router.js
 *   explicitly documents that dispatch() is "fully real, fully tested,
 *   and callable today... it is simply not yet wired into" rule-based-
 *   conversational-provider.js's live intent chain — "pending the
 *   user's explicit approval." That means SpiritualOS's "existing
 *   conversational routing" does NOT yet reach a real user through
 *   ordinary chat at all today; it would be inaccurate to say a mode is
 *   redundant with something not actually wired in. Since
 *   rule-based-conversational-provider.js is diff-guarded (this project's
 *   own explicit protection) and wiring dispatch() into it requires
 *   explicit approval this pass was not given, that path stays untouched
 *   here. A Live Window MODE is a genuinely different, real integration
 *   path that does not touch that file at all — exactly like every
 *   other mode in this pass, it calls spiritual-capability.js's real,
 *   already-tested functions directly from activate(). This file
 *   therefore DOES register a mode, so SpiritualOS gets a real Live
 *   Window presence today rather than waiting on a separate, unrelated
 *   approval.
 *
 * COMPOSED, NOT DUPLICATED (every method below already existed before
 * this file was written; none is modified by this file):
 *   - window.CozyOS.SpiritualCapability.handlePersonalPrayer(request) —
 *     real, deterministic, offline structural prayer aid (§3: never
 *     fabricated as divinely inspired).
 *   - handlePersonalScripture(request) — real, composes the existing
 *     window.CozyOS.Living.scripture gateway; honestly reports
 *     capabilityState "not_installed"/"unsupported" (with its own
 *     already-written disclosure text in .content) rather than
 *     inventing verse wording — this file renders that .content
 *     verbatim, never overriding it.
 *   - handlePersonalDevotional(request) — real, disclosed-as-CozyOS's-
 *     own-structure devotional framework, not Scripture.
 *   - handlePersonalWorshipInfo(request) — real, general/disclosed
 *     worship overview (Phase 1 scope only; never a specific
 *     congregation's live schedule — that stays ChurchOS's job).
 *   Every one of the four returns the SAME real envelope shape
 *   ({ capability, intent, owner, capabilityState, language, source,
 *   content }) — this file only reads `.content` for display, never
 *   reinterprets `.capabilityState`/`.source` into its own wording.
 *
 * HONEST SCOPE (disclosed, not fabricated)
 *   Only spiritual-capability.js's PERSONAL path is composed here
 *   (owner:"personal" in the real §1b OWNER_TABLE) — the CHURCH path for
 *   these same four intents is already ChurchOS's own job (worship,
 *   prayer-interaction, etc. — see worship-live-window-mode.js's own
 *   "worship" mode) and is not re-entered from here, matching
 *   spiritual-intent-router.js's own dispatch() boundary.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["spiritual-live-window-mode"]) return;

    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function resolveCapability() {
        return (window.CozyOS && window.CozyOS.SpiritualCapability) || null;
    }

    function renderAction(container, title, placeholder, run) {
        const wrap = document.createElement("div");
        wrap.className = "cozy-living-card cozy-live-window-spiritual-section";
        wrap.innerHTML = `
            <h4>${escapeHtml(title)}</h4>
            ${placeholder !== null ? `<form style="display:flex;gap:6px;">
                <input type="text" class="cozy-living-input" placeholder="${escapeHtml(placeholder)}" autocomplete="off">
                <button type="submit" class="cozy-btn">Go</button>
            </form>` : `<button type="button" class="cozy-btn">Show</button>`}
            <pre class="cozy-disclosure-note cozy-live-window-spiritual-result" style="white-space:pre-wrap;font-family:inherit;"></pre>
        `;
        container.appendChild(wrap);
        const resultEl = wrap.querySelector(".cozy-live-window-spiritual-result");
        const trigger = placeholder !== null ? wrap.querySelector("form") : wrap.querySelector("button");
        const eventName = placeholder !== null ? "submit" : "click";
        trigger.addEventListener(eventName, (evt) => {
            if (evt.preventDefault) evt.preventDefault();
            const input = placeholder !== null ? wrap.querySelector("input") : null;
            try {
                const envelope = run(input ? input.value.trim() : null);
                resultEl.textContent = (envelope && envelope.content) || "No response.";
            } catch (err) {
                resultEl.textContent = "This is not available right now.";
                console.warn(`[SpiritualLiveWindowMode] "${title}" failed:`, err && err.message);
            }
        });
    }

    function activateSpiritual(container, context) {
        context = context || {};
        const language = context.language === "sw" ? "sw" : "en";
        const capability = resolveCapability();

        const header = document.createElement("div");
        header.className = "cozy-live-window-spiritual-header";
        header.innerHTML = `<p class="cozy-disclosure-note"><strong>Context: SpiritualOS (personal)</strong></p>`;
        container.appendChild(header);

        if (!capability) {
            const note = document.createElement("p");
            note.className = "cozy-disclosure-note";
            note.textContent = "SpiritualOS is not connected on this page.";
            container.appendChild(note);
            return;
        }

        renderAction(container, "Prayer", "Topic (optional)", (topic) => capability.handlePersonalPrayer({ topic, language }));
        renderAction(container, "Scripture Lookup", "e.g. John 3:16", (text) => capability.handlePersonalScripture({ text, language }));
        renderAction(container, "Devotional", null, () => capability.handlePersonalDevotional({ language }));
        renderAction(container, "Worship Info", null, () => capability.handlePersonalWorshipInfo({ language }));

        const speakHint = document.createElement("p");
        speakHint.className = "cozy-disclosure-note";
        speakHint.textContent = "Speak, type, or reply using the CozyOS Live controls below.";
        container.appendChild(speakHint);
    }

    function deactivateSpiritual(container) {
        if (container) container.innerHTML = "";
    }

    function register() {
        const liveWindow = window.CozyOS && window.CozyOS.LiveWindow;
        if (!liveWindow || typeof liveWindow.registerMode !== "function") return false;
        liveWindow.registerMode("spiritual", { label: "SpiritualOS", activate: activateSpiritual, deactivate: deactivateSpiritual });
        return true;
    }

    if (!register()) {
        let attempts = 0;
        const retry = () => { if (!register() && ++attempts < 40) setTimeout(retry, 250); };
        retry();
    }

    window.CozyOS.Modules["spiritual-live-window-mode"] = Object.freeze({
        version: VERSION,
        description: "Registers SpiritualOS's 'spiritual' mode with the universal window.CozyOS.LiveWindow — real personal-path prayer/scripture/devotional/worship-info structural aids (window.CozyOS.SpiritualCapability), rendering each function's own real, already-disclosed content verbatim. Does not touch rule-based-conversational-provider.js (diff-guarded, and dispatch() wiring into it remains a separate, unapproved decision). Speak/Type/Reply reuses the Live Window's own existing chat form, never duplicated."
    });
})();
