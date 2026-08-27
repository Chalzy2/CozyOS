/**
 * CozyOS Bible Interface Module (M339)
 * core/modules/ChurchOS/bible-interface-module.js
 *
 * OWNERSHIP: JS-module-driven native CozyOS module, matching the
 * established window.CozyOS.Modules["..."] convention (Developer Hub,
 * Authenticator - M319). init() takes no real parameter, since
 * ApplicationLauncher genuinely calls init() with no argument
 * (confirmed by reading its source) - this module finds its own root
 * by the real, specific id getDashboard() rendered, matching
 * authenticator.js's own established real fallback pattern.
 *
 * Preserves the exact approved CSS/HTML/animations byte-for-byte -
 * only the *intelligence* layer was converted from standalone browser
 * calls to real CozyOS engines:
 *
 *   fetch('/api/lookup-verse')  -> Living.scripture.parseReference() +
 *                                  Living.scripture.lookup() (M340
 *                                  gateway; M342 routed through it -
 *                                  same real BibleEngine, M337/M338,
 *                                  underneath - no server round-trip)
 *   window.speechSynthesis      -> Living.scripture.readAloud() (M342
 *                                  gateway swap; same real
 *                                  CozyTTSBrowserAdapter.speakPreview()
 *                                  underneath)
 *
 * Live Church Mode's automatic push-to-listeners (M342): this module
 * now subscribes to the real, existing `living:scripture-detected`
 * PlatformEventBus event and renders through the same shared card
 * markup as a manual lookup, tagged with a LIVE badge - the gap
 * disclosed through M339-M341 is closed.
 *
 * HONEST GAPS, not fabricated: AI Search / Conversation Mode (no real
 * semantic-search/NLU engine exists), first-run language preference is
 * in-memory only for this session (no real per-user language field
 * confirmed on IdentityEngine to persist it).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["bible-interface"] && window.CozyOS.Modules["bible-interface"].version) return;

    const MODULE_VERSION = "1.1.0";
    let container = null;
    let lastSpokenText = null;
    let preferredLanguage = null;

    function getDashboard() {
        return `
        <style>
            #cozy-bible-root {
                --cozy-green: #00C853;
                --cozy-gold: #FFD700;
                --cozy-dark: #0A0A0A;
                --cozy-card-bg: #141414;
                --cozy-border: #222222;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background-color: var(--cozy-dark);
                color: #ffffff;
                padding: 20px;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100%;
            }
            #cozy-bible-root .cozy-container {
                width: 100%;
                max-width: 800px;
                background: var(--cozy-card-bg);
                border: 2px solid var(--cozy-border);
                border-radius: 12px;
                padding: 30px;
                box-shadow: 0 10px 30px rgba(0, 200, 83, 0.15);
                animation: cozyBibleFadeIn 0.8s ease-in-out;
            }
            #cozy-bible-root h2 {
                color: var(--cozy-gold);
                text-align: center;
                text-transform: uppercase;
                letter-spacing: 2px;
                margin-bottom: 5px;
            }
            #cozy-bible-root p.subtitle { text-align: center; color: #aaaaaa; font-size: 14px; margin-bottom: 25px; }
            #cozy-bible-root .search-box { display: flex; gap: 12px; margin-bottom: 25px; }
            #cozy-bible-root input {
                flex: 1; padding: 14px; font-size: 16px; background: #1f1f1f;
                border: 1px solid var(--cozy-border); border-radius: 6px; color: #ffffff;
                outline: none; transition: border-color 0.3s;
            }
            #cozy-bible-root input:focus { border-color: var(--cozy-green); }
            #cozy-bible-root button {
                padding: 14px 24px; background: linear-gradient(135deg, var(--cozy-green), #009624);
                color: var(--cozy-dark); font-weight: bold; border: none; border-radius: 6px;
                font-size: 16px; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;
            }
            #cozy-bible-root button:hover { transform: translateY(-2px); box-shadow: 0 4px 15px rgba(0, 200, 83, 0.4); }
            #cozy-bible-root .audio-controls {
                display: flex; justify-content: space-between; align-items: center;
                background: #1a1a1a; padding: 10px 15px; border-radius: 6px;
                margin-bottom: 20px; border: 1px solid var(--cozy-border);
            }
            #cozy-bible-root .audio-btn {
                background: transparent; border: 1px solid var(--cozy-gold); color: var(--cozy-gold);
                padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;
            }
            #cozy-bible-root .audio-btn:hover { background: var(--cozy-gold); color: var(--cozy-dark); }
            #cozy-bible-root .results-container { display: grid; gap: 15px; max-height: 500px; overflow-y: auto; padding-right: 5px; }
            #cozy-bible-root .verse-card {
                background: #181818; border-left: 4px solid var(--cozy-green); padding: 15px;
                border-radius: 0 8px 8px 0; animation: cozyBibleSlideUp 0.5s ease forwards;
                opacity: 0; transform: translateY(20px);
            }
            #cozy-bible-root .verse-card:nth-child(even) { border-left-color: var(--cozy-gold); }
            #cozy-bible-root .lang-title {
                font-weight: bold; color: var(--cozy-gold); font-size: 12px; letter-spacing: 1px;
                text-transform: uppercase; margin-bottom: 6px; display: flex; justify-content: space-between;
            }
            #cozy-bible-root .verse-text { font-size: 16px; line-height: 1.5; color: #e0e0e0; }
            #cozy-bible-root .error { color: #ff5252; text-align: center; font-weight: bold; }
            @keyframes cozyBibleFadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
            @keyframes cozyBibleSlideUp { to { opacity: 1; transform: translateY(0); } }
        </style>
        <div id="cozy-bible-root">
            <div class="cozy-container">
                <h2>CozyOS Church Interpreter</h2>
                <p class="subtitle">Smart Living Scriptural Engine — Built for Africa, Ready for the World</p>
                <div class="search-box">
                    <input type="text" id="cozy-bible-verse-input" placeholder="Enter reference (e.g. John 3:16 or Genesis 5:7)" />
                    <button id="cozy-bible-lookup-btn" type="button">Interpret</button>
                </div>
                <div class="audio-controls" id="cozy-bible-audio-bar" style="display:none;">
                    <span id="cozy-bible-audio-status" style="font-size: 13px; color: var(--cozy-green);">● Live Audio Ready</span>
                    <button class="audio-btn" id="cozy-bible-speak-btn" type="button">🔊 Read Aloud</button>
                </div>
                <div id="cozy-bible-loading" style="display:none; text-align:center; color: var(--cozy-gold); margin: 20px 0;">
                    Searching the installed Bible packages...
                </div>
                <div id="cozy-bible-results" class="results-container"></div>
            </div>
        </div>`;
    }

    /**
     * renderVerseResult(result, options) (M342)
     *   Real, additive: extracted from lookupVerse() so the exact same,
     *   unchanged card markup/animation is reused for both a manual
     *   lookup and a real live-service push - never a second render
     *   path. `options.liveBadge` adds a small "LIVE" label so a
     *   pushed verse is visibly distinguishable from a manual search,
     *   without altering the existing card CSS/animation.
     */
    function renderVerseResult(result, options = {}) {
        const resultsDiv = container.querySelector("#cozy-bible-results");
        const audioBar = container.querySelector("#cozy-bible-audio-bar");
        if (!resultsDiv || !audioBar) return;

        const bible = window.CozyOS.BibleEngine;
        const installed = bible && typeof bible.listInstalledTranslations === "function" ? bible.listInstalledTranslations() : [];
        const translationLanguage = {};
        for (const t of installed) translationLanguage[t.translation] = t.language;

        const liveBadge = options.liveBadge
            ? `<span style="background:var(--cozy-green);color:#000;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;margin-left:8px;vertical-align:middle;">LIVE</span>`
            : "";
        let html = `<h3 style="color:var(--cozy-green); margin-top:0; border-bottom: 1px solid #222; padding-bottom: 10px;">${result.reference}${liveBadge}</h3>`;
        let cardDelay = 0;
        lastSpokenText = null;

        for (const [translationCode, verseRecord] of Object.entries(result.translations)) {
            const realLanguage = translationLanguage[translationCode];
            const label = (realLanguage || translationCode).toUpperCase();
            if (preferredLanguage && realLanguage && realLanguage.toLowerCase() === preferredLanguage.toLowerCase()) {
                lastSpokenText = verseRecord.text;
            } else if (!preferredLanguage && !lastSpokenText) {
                lastSpokenText = verseRecord.text;
            }
            html += `
                <div class="verse-card" style="animation-delay: ${cardDelay}s;">
                    <div class="lang-title"><span>${label}</span><span>${translationCode}</span></div>
                    <div class="verse-text">${verseRecord.text}</div>
                </div>`;
            cardDelay += 0.1;
        }

        resultsDiv.innerHTML = html;
        audioBar.style.display = "flex";
    }

    /**
     * lookupVerse(rawInput) (M342 update)
     *   Real gateway swap: now composes Living.scripture.parseReference()
     *   / Living.scripture.lookup() (M340) instead of calling
     *   BibleEngine directly - same real BibleEngine underneath, one
     *   governed entry point. Rendering delegates to the shared
     *   renderVerseResult() above.
     */
    async function lookupVerse(rawInput) {
        const resultsDiv = container.querySelector("#cozy-bible-results");
        const loadingDiv = container.querySelector("#cozy-bible-loading");
        const audioBar = container.querySelector("#cozy-bible-audio-bar");

        resultsDiv.innerHTML = "";
        audioBar.style.display = "none";

        const living = window.CozyOS.Living;
        if (!living || !living.scripture) { resultsDiv.innerHTML = '<p class="error">Living.scripture is not loaded.</p>'; return; }

        const parsed = living.scripture.parseReference(rawInput.trim());
        if (!parsed) { resultsDiv.innerHTML = '<p class="error">Please enter a valid reference, e.g., John 3:16.</p>'; return; }
        if (parsed.wholeChapter) { resultsDiv.innerHTML = '<p class="error">Whole-chapter display is not yet supported here - please specify a verse.</p>'; return; }

        loadingDiv.style.display = "block";
        const result = living.scripture.lookup(parsed.book, parsed.chapter, parsed.verse);
        loadingDiv.style.display = "none";

        if (!result.available) { resultsDiv.innerHTML = `<p class="error">${result.reason || "No real verse found."}</p>`; return; }
        renderVerseResult(result);
    }

    /**
     * onLiveScriptureDetected(detail) (M342)
     *   Real, new: the previously disclosed gap ("Live Church Mode's
     *   automatic push-to-listeners... this module doesn't yet
     *   subscribe to it") closed by subscribing to the real, existing
     *   `living:scripture-detected` PlatformEventBus event - the same
     *   real event ChurchWorshipSession.deliverSpokenText() (M342) now
     *   emits via Living.scripture.notifySubscribers(). Renders through
     *   the same shared card markup as a manual lookup - never a
     *   second UI path - with a LIVE badge so it's honestly
     *   distinguishable from a manual search a user is mid-typing.
     */
    function onLiveScriptureDetected(detail) {
        if (!container || !detail || !detail.lookupResult || !detail.lookupResult.available) return;
        renderVerseResult(detail.lookupResult, { liveBadge: true });
    }

    /**
     * speakVerse() (M342 update)
     *   Real gateway swap: now composes Living.scripture.readAloud()
     *   (M340), which itself composes the same, real
     *   CozyTTSBrowserAdapter.speakPreview() this method called
     *   directly before - same real audio path, one governed entry
     *   point.
     */
    async function speakVerse() {
        if (!lastSpokenText) return;
        const statusEl = container.querySelector("#cozy-bible-audio-status");
        const living = window.CozyOS.Living;
        if (!living || !living.scripture || typeof living.scripture.readAloud !== "function") {
            statusEl.innerText = "Live audio is not available.";
            return;
        }
        statusEl.innerText = "🔊 Speaking live...";
        const result = await living.scripture.readAloud(lastSpokenText);
        statusEl.innerText = result.played ? "● Live Audio Ready" : `Audio unavailable: ${result.reason}`;
    }

    function setPreferredLanguage(language) { preferredLanguage = language; }

    function wireEvents() {
        const lookupBtn = container.querySelector("#cozy-bible-lookup-btn");
        const speakBtn = container.querySelector("#cozy-bible-speak-btn");
        const input = container.querySelector("#cozy-bible-verse-input");
        lookupBtn.addEventListener("click", () => lookupVerse(input.value));
        input.addEventListener("keydown", (evt) => { if (evt.key === "Enter") lookupVerse(input.value); });
        speakBtn.addEventListener("click", () => speakVerse());
    }

    window.CozyOS.Modules["bible-interface"] = {
        version: MODULE_VERSION,
        getDashboard,
        /**
         * init()
         *   Real - matches the established, confirmed pattern:
         *   ApplicationLauncher calls this with no argument, so this
         *   finds its own real root by the specific id getDashboard()
         *   rendered, exactly like authenticator.js's own real
         *   fallback (container || document.getElementById(ownId)).
         */
        async init() {
            container = document.getElementById("cozy-bible-root")?.parentElement || document;
            wireEvents();
            // Real (M342): subscribe to the real, existing PlatformEventBus
            // event Living.scripture.notifySubscribers()/ChurchWorshipSession
            // already emit - closes the previously disclosed live-push gap.
            const bus = window.CozyOS.PlatformEventBus;
            if (bus && typeof bus.on === "function") bus.on("living:scripture-detected", onLiveScriptureDetected);
        },
        destroy() {
            const bus = window.CozyOS.PlatformEventBus;
            if (bus && typeof bus.off === "function") bus.off("living:scripture-detected", onLiveScriptureDetected);
            container = null;
        },
        setPreferredLanguage,
        getVersion() { return MODULE_VERSION; }
    };
})();
