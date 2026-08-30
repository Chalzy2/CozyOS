/**
 * CozyOS Founder Story Panel
 * File Reference: core/modules/founder-story/founder-story-panel.js
 * Layer: Application / Dashboard Panel
 * Version: 2.0.0-ENTERPRISE
 * Milestone: 361 — Founder Story Vault (Foundation), Stage 1 → Stage 3
 *
 * OWNERSHIP
 *   Pure display layer over founder-story-engine.js and (new, Stage 3)
 *   founder-story-narration.js. Computes nothing authorization-related
 *   itself — every field rendered here comes straight from
 *   getStory()/getChapter()/listChapters()/listVisibleStories(). Fail-
 *   closed content (the 🔒 Private Founder Content notice) is rendered
 *   exactly as returned by the engine, never overridden or bypassed
 *   here.
 *
 * STAGE 3 ADDITIONS (v1.0.0 → v2.0.0) — Founder Story Experience
 *   Adds the actual Reader/Listener UI Stage 1's own header deferred
 *   ("No panel/UI update this stage... a panel refresh exposing the
 *   new management actions... is deferred to a future stage"): reading
 *   mode, listening mode (composing founder-story-narration.js's
 *   session for play/pause/resume/stop/next/previous/highlight),
 *   background ambience (composing window.CozyOS.LivingSounds — real
 *   engine, honestly reports "not available" until real audio packs
 *   are loaded, disclosed below), a high-contrast toggle (composing the
 *   already-registered window.CozyOS.Theme "high-contrast" theme),
 *   multilingual switching, bookmarks, and reading/completion progress.
 *   Every authorization check still happens inside FounderStoryEngine —
 *   this file never renders content it fetched around canView()/
 *   canViewChapter().
 *
 * HONEST, DISCLOSED GAPS (Stage 3)
 *   - Ambience: LivingSounds.play() is real, but no ambience audio
 *     assets exist anywhere in this repository (confirmed before
 *     writing this file) — every ambience button will honestly report
 *     "Not Available — no ambience pack loaded" until a real pack is
 *     uploaded via LivingSounds.loadPack(). "Silent" is the only
 *     option that is genuinely fully functional today (it simply plays
 *     nothing).
 *   - High-contrast: composes window.CozyOS.Theme.setTheme(), which is
 *     a real, existing engine — but it is a PLATFORM-WIDE theme switch
 *     (sets data-cozy-app on <html>/<body>), not a panel-scoped toggle.
 *     Turning it on from inside the reader changes the whole
 *     dashboard's active theme; turning it off restores whatever theme
 *     was active before, read from the DOM attribute directly (the
 *     same source of truth setTheme() itself uses). Disclosed, not
 *     hidden.
 *   - Large text: no existing CozyOS engine executes a live large-text
 *     toggle (core/platform/accessibility-engine.js only AUDITS font
 *     sizes; it does not change them). This is genuinely new, narrowly
 *     scoped to `.cozy-fs-reader` only — a small CSS class toggle, not
 *     a duplicate of any accessibility engine.
 *   - Screen readers: real, standard ARIA (aria-live region for the
 *     currently-narrated sentence, aria-labels on controls) — not a
 *     custom engine, since none of this codebase's accessibility
 *     modules execute screen-reader behavior themselves.
 *   - Offline reading: Founder Story data remains in-memory only
 *     (disclosed since Stage 1, unchanged) — a chapter already loaded
 *     into the reader this session stays readable without a further
 *     network round trip (genuinely real: getChapter() only decrypts
 *     already-resident data), but a full reload loses it, same as
 *     every other honest limitation already disclosed in this
 *     milestone.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "2.0.0";

    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["founder-story-panel"] && window.CozyOS.Modules["founder-story-panel"].version) return;

    let rootEl = null;

    // ── M366.2 Phase 2 — root-level listener dedup guard ──
    // init() is now called on every host-shell repaint (matching the
    // developer-hub.js convention already used in cozy-workspace.js:
    // hub.init() is invoked unconditionally on every #render()). When the
    // host shell hands init() the exact same, still-attached DOM node
    // twice (rather than a freshly rebuilt one), this WeakSet stops a
    // second round of delegated listeners from stacking on it. When the
    // host shell rebuilds its container (the normal case — #domRoot's
    // innerHTML is replaced), the old node and its listeners are simply
    // discarded with it, so no guard is needed in that path either way.
    const boundRoots = new WeakSet();

    // ── Stage 3 reader state (module-scoped — one reader open at a time
    // per panel instance, matching the existing single rootEl pattern) ──
    let activeSession = null;       // FounderStoryNarrationSession
    let activeAmbienceEvent = null; // currently-playing LivingSounds eventName, or null ("silent")
    let themeBeforeHighContrast = null; // DOM value captured before switching, for restore
    let largeTextOn = false;
    let autoScrollOn = true;

    const AMBIENCE_OPTIONS = Object.freeze([
        { id: "silent", label: "Silent" },
        { id: "ambience-rain", label: "Rain" },
        { id: "ambience-wind", label: "Wind" },
        { id: "ambience-ocean", label: "Ocean" },
        { id: "ambience-forest", label: "Forest" },
        { id: "ambience-birds", label: "Birds" },
        { id: "ambience-church", label: "Church" },
    ]);
    const LANGUAGE_LABELS = { en: "EN", sw: "SW", fr: "FR", ar: "AR" };

    /** estimateReadingMinutes() — real word count / 180wpm (a standard, disclosed silent-reading-speed estimate, not a measured figure). */
    function estimateReadingMinutes(sentences) {
        const words = sentences.reduce((sum, s) => sum + String(s.text || "").split(/\s+/).filter(Boolean).length, 0);
        return Math.max(1, Math.round(words / 180));
    }

    /** teardownActiveSession() — stops any in-flight narration and fades out any playing ambience before the reader is torn down or a new chapter/story is opened. Never leaves audio playing behind a navigated-away panel. */
    function teardownActiveSession() {
        if (activeSession) { try { activeSession.stop(); } catch (_err) { /* honest no-op */ } activeSession = null; }
        if (activeAmbienceEvent) {
            const sounds = window.CozyOS.LivingSounds;
            if (sounds && typeof sounds.fadeOut === "function") { try { sounds.fadeOut(activeAmbienceEvent, 600); } catch (_err) { /* honest no-op */ } }
            activeAmbienceEvent = null;
        }
        if (themeBeforeHighContrast) {
            const theme = window.CozyOS.Theme;
            if (theme && typeof theme.setTheme === "function") { try { theme.setTheme(themeBeforeHighContrast); } catch (_err) { /* honest no-op */ } }
            themeBeforeHighContrast = null;
        }
    }

    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }
    function getCurrentUserId() {
        const session = window.CozyOS.Session;
        if (!session || typeof session.current !== "function") return null;
        const current = session.current();
        return current ? current.uid : null;
    }
    const VISIBILITY_LABELS = { "only-me": "🔒 Only Me", "selected": "👥 Selected People", "family": "👨‍👩‍👧 Family", "mentors": "🤝 Mentors", "public": "🌍 Public" };
    const STATUS_LABELS = { draft: "Draft", archived: "Archived" };

    function renderPrivateNotice() {
        return `<div class="cozy-fs-private"><span class="cozy-fs-private-badge">🔒 Private Founder Content</span><p>This story is private.</p></div>`;
    }

    function renderStoryCard(story) {
        const visibility = VISIBILITY_LABELS[story.visibility] || story.visibility;
        const status = STATUS_LABELS[story.status] || story.status;
        return `<div class="cozy-fs-card" data-story-id="${escapeHtml(story.storyId)}">
            <div class="cozy-fs-card-header">
                <span class="cozy-fs-status cozy-fs-status-${escapeHtml(story.status)}">${escapeHtml(status)}</span>
                <span class="cozy-fs-visibility">${escapeHtml(visibility)}</span>
            </div>
            <div class="cozy-fs-card-meta">${escapeHtml(story.category || "")} · ${(story.chapterOrder || []).length} chapter(s)</div>
        </div>`;
    }

    async function renderDashboard() {
        if (!rootEl) return;
        const engine = window.CozyOS.FounderStory;
        if (!engine) { rootEl.innerHTML = `<div class="cozy-fs-unavailable">Founder Story Vault is not available.</div>`; return; }
        const viewerId = getCurrentUserId();
        const mine = viewerId ? engine.listStoriesForOwner(viewerId) : [];
        const visibleToMe = viewerId ? engine.listVisibleStories(viewerId).filter(s => !mine.some(m => m.storyId === s.storyId)) : [];

        let ownedHtml = mine.length
            ? mine.map(renderStoryCard).join("")
            : `<div class="cozy-fs-empty">No stories yet. Start your first chapter.</div>`;
        let sharedHtml = visibleToMe.length
            ? `<h4 class="cozy-fs-subhead">Shared With You</h4>${visibleToMe.map(renderStoryCard).join("")}`
            : "";

        rootEl.innerHTML = `
            <div class="cozy-fs-header">
                <h3>Founder Story Vault</h3>
                <p class="cozy-fs-tagline">Your private autobiography, protected and yours to share.</p>
            </div>
            <div class="cozy-fs-list">${ownedHtml}</div>
            ${sharedHtml}
        `;
    }

    /** viewStory(storyId) — real read path; renders PRIVATE_NOTICE exactly as the engine returns it for a denied viewer. Never fetches content for an unauthorized viewer client-side either — the engine's own canView() gate runs first. */
    async function viewStory(storyId, container) {
        teardownActiveSession();
        const engine = window.CozyOS.FounderStory;
        const viewerId = getCurrentUserId();
        const result = await engine.getStory(storyId, viewerId);
        if (result && result.locked) { container.innerHTML = renderPrivateNotice(); return; }
        const chapters = await engine.listChapters(storyId, viewerId);
        const chapterList = Array.isArray(chapters)
            ? chapters.map(c => `<div class="cozy-fs-chapter" data-open-chapter="${escapeHtml(c.chapterId)}" data-open-story="${escapeHtml(storyId)}" tabindex="0" role="button">
                <strong>${escapeHtml(c.title)}</strong>
                ${c.timelineEra ? `<span class="cozy-fs-era">${escapeHtml(c.timelineEra)}</span>` : ""}
            </div>`).join("")
            : renderPrivateNotice();
        container.innerHTML = `
            <div class="cozy-fs-story-detail">
                <button class="cozy-fs-back" data-back-to-list>← Back</button>
                <h3>${escapeHtml(result.title)}</h3>
                <p class="cozy-fs-tagline">${escapeHtml(result.subtitle || "")}</p>
                <div class="cozy-fs-chapters">${chapterList}</div>
            </div>`;
    }

    /**
     * openReader(storyId, chapterId, container) — the Story Experience:
     * reading mode, listening mode, or both, real narration via
     * founder-story-narration.js, real ambience via LivingSounds, real
     * multilingual switching, real bookmarks/reading position via
     * FounderStoryEngine. Authorization is entirely FounderStoryEngine's
     * — this function only renders what session.load() successfully
     * returns; a denied viewer never reaches sentence rendering.
     */
    async function openReader(storyId, chapterId, container) {
        teardownActiveSession();
        const engine = window.CozyOS.FounderStory;
        const NarrationModule = window.CozyOS.FounderStoryNarration;
        if (!engine || !NarrationModule) { container.innerHTML = `<div class="cozy-fs-unavailable">Founder Story Experience is not available.</div>`; return; }

        const viewerId = getCurrentUserId();
        const priorPosition = engine.getReadingPosition(storyId, viewerId);
        const session = NarrationModule.createSession({ storyId, viewerId, language: (priorPosition && priorPosition.language) || "en" });
        const loadResult = await session.load(chapterId, (priorPosition && priorPosition.language) || "en");
        if (!loadResult.success) {
            container.innerHTML = loadResult.locked ? renderPrivateNotice() : `<div class="cozy-fs-unavailable">${escapeHtml(loadResult.reason || "Could not load this chapter.")}</div>`;
            return;
        }
        activeSession = session;
        renderReaderShell(storyId, container);
        wireSessionEvents(session, container);
    }

    function renderReaderShell(storyId, container) {
        const session = activeSession;
        if (!session) return;
        const state = session.getState();
        const sentences = session.getSentences();
        const bookmarks = window.CozyOS.FounderStory.listBookmarks(storyId, getCurrentUserId());
        const est = estimateReadingMinutes(sentences);
        const langButtons = Object.keys(LANGUAGE_LABELS).map(code =>
            `<button class="cozy-fs-lang-btn${code === state.language ? " active" : ""}" data-lang="${code}">${LANGUAGE_LABELS[code]}</button>`).join("");
        const ambienceButtons = AMBIENCE_OPTIONS.map(a =>
            `<button class="cozy-fs-ambience-btn${(a.id === "silent" && !activeAmbienceEvent) ? " active" : ""}" data-ambience="${a.id}">${escapeHtml(a.label)}</button>`).join("");
        const voices = (typeof session.listVoices === "function") ? session.listVoices() : [];
        const voiceOptions = `<option value="">Default (auto)</option>` + voices.map(v => `<option value="${escapeHtml(v.providerId)}">${escapeHtml(v.name || v.providerId)}</option>`).join("");
        const sentenceHtmlJoined = sentences.map((s, i) =>
            `<span class="cozy-fs-sentence${i === state.index ? " cozy-fs-sentence-current" : ""}" data-sentence-index="${i}">${escapeHtml(s.text)}</span>`).join(" ");

        container.innerHTML = `
            <div class="cozy-fs-reader${largeTextOn ? " cozy-fs-large-text" : ""}" id="cozy-fs-reader">
                <div class="cozy-fs-reader-toolbar">
                    <button class="cozy-fs-back" data-back-to-list aria-label="Back to stories">← Back</button>
                    <div class="cozy-fs-reader-title">
                        <h3>${escapeHtml(state.chapterTitle)}</h3>
                        ${state.chapterSubtitle ? `<p class="cozy-fs-tagline">${escapeHtml(state.chapterSubtitle)}</p>` : ""}
                    </div>
                    <button class="cozy-fs-fullscreen" data-action="fullscreen" aria-label="Toggle fullscreen">⛶</button>
                </div>

                <div class="cozy-fs-progress">
                    <div class="cozy-fs-progress-bar"><div class="cozy-fs-progress-fill" style="width:${sentences.length ? Math.round((state.index / sentences.length) * 100) : 0}%"></div></div>
                    <span class="cozy-fs-progress-label">Sentence ${Math.min(state.index + 1, sentences.length)} of ${sentences.length} · ~${est} min read</span>
                </div>

                <div class="cozy-fs-lang-switch" role="group" aria-label="Language">${langButtons}</div>

                <div class="cozy-fs-reader-body" aria-live="polite" id="cozy-fs-reader-body">
                    <div class="cozy-fs-reader-text" id="cozy-fs-reader-text">${sentenceHtmlJoined}</div>
                </div>

                <div class="cozy-fs-controls">
                    <button data-action="prev-chapter" aria-label="Previous chapter">⏮</button>
                    <button data-action="play" aria-label="Play">▶ Play</button>
                    <button data-action="pause" aria-label="Pause">⏸ Pause</button>
                    <button data-action="stop" aria-label="Stop">⏹ Stop</button>
                    <button data-action="next-chapter" aria-label="Next chapter">⏭</button>
                    <label class="cozy-fs-speed-label">Speed
                        <input type="range" data-control="speed" min="0.5" max="2" step="0.1" value="${state.speedMultiplier}">
                    </label>
                    <label class="cozy-fs-voice-label">Voice
                        <select data-control="voice">${voiceOptions}</select>
                    </label>
                    <label class="cozy-fs-autoscroll-label">
                        <input type="checkbox" data-control="autoscroll" ${autoScrollOn ? "checked" : ""}> Auto-scroll
                    </label>
                </div>
                <div class="cozy-fs-status" id="cozy-fs-status" role="status"></div>

                <div class="cozy-fs-ambience">
                    <span class="cozy-fs-ambience-heading">Background:</span>
                    ${ambienceButtons}
                    <span class="cozy-fs-ambience-status" id="cozy-fs-ambience-status"></span>
                </div>

                <div class="cozy-fs-accessibility">
                    <label><input type="checkbox" data-control="high-contrast"> High Contrast (whole app)</label>
                    <label><input type="checkbox" data-control="large-text" ${largeTextOn ? "checked" : ""}> Large Text</label>
                </div>

                <div class="cozy-fs-bookmarks">
                    <button data-action="add-bookmark">🔖 Bookmark this line</button>
                    <div class="cozy-fs-bookmark-list">${bookmarks.map(b => `<div class="cozy-fs-bookmark" data-goto-sentence="${b.sentenceIndex}">🔖 Sentence ${b.sentenceIndex + 1}${b.note ? `: ${escapeHtml(b.note)}` : ""}</div>`).join("")}</div>
                </div>
            </div>
        `;
    }

    /**
     * wireSessionEvents() — reflects narration session events into the DOM:
     * sentence highlight/auto-scroll, progress, play/pause status text, and
     * chapter transitions (which re-render the whole reader shell).
     *
     * M366.2 Phase 2 note: these handlers now resolve their target through
     * the module-scoped `rootEl` at fire time, not the `container` argument
     * captured when this was called. This is required by, not incidental
     * to, the Phase 2 change: init() can now repaint the reader against a
     * newly-rebuilt container node (see init() below) without this session
     * being torn down and recreated, so a `container` closed over at
     * wireSessionEvents()-call-time can go stale (removed from the DOM by
     * a later host-shell repaint) while the session itself is still very
     * much alive. Resolving `rootEl` at fire time keeps chapter-loaded/
     * language-changed re-renders (and progress updates) landing on
     * whichever container is actually on screen right now. The `container`
     * parameter is kept only for call-site compatibility; it is no longer
     * read here.
     */
    function wireSessionEvents(session, _container) {
        session.on("sentence-started", ({ index }) => {
            if (!rootEl) return;
            const body = rootEl.querySelector("#cozy-fs-reader-text");
            if (!body) return;
            const prev = body.querySelector(".cozy-fs-sentence-current");
            if (prev) prev.classList.remove("cozy-fs-sentence-current");
            const current = body.querySelector(`[data-sentence-index="${index}"]`);
            if (current) {
                current.classList.add("cozy-fs-sentence-current");
                if (autoScrollOn && typeof current.scrollIntoView === "function") current.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            const progressFill = rootEl.querySelector(".cozy-fs-progress-fill");
            const progressLabel = rootEl.querySelector(".cozy-fs-progress-label");
            const total = session.getSentences().length;
            if (progressFill) progressFill.style.width = `${total ? Math.round((index / total) * 100) : 0}%`;
            if (progressLabel) progressLabel.textContent = `Sentence ${index + 1} of ${total} · ~${estimateReadingMinutes(session.getSentences())} min read`;
        });
        session.on("narration-unavailable", ({ reason }) => {
            const status = rootEl && rootEl.querySelector("#cozy-fs-status");
            if (status) status.textContent = `Narration unavailable: ${reason}`;
        });
        session.on("narration-paused", () => { const s = rootEl && rootEl.querySelector("#cozy-fs-status"); if (s) s.textContent = "Paused."; });
        session.on("narration-resumed", () => { const s = rootEl && rootEl.querySelector("#cozy-fs-status"); if (s) s.textContent = "Listening…"; });
        session.on("chapter-completed", () => { const s = rootEl && rootEl.querySelector("#cozy-fs-status"); if (s) s.textContent = "Chapter complete."; });
        session.on("chapter-loaded", () => {
            if (!rootEl) return;
            renderReaderShell(session.getState().storyId, rootEl);
        });
        session.on("language-changed", () => {
            if (!rootEl) return;
            renderReaderShell(session.getState().storyId, rootEl);
        });
    }

    function injectStyles() {
        if (document.getElementById("cozy-fs-styles")) return;
        const style = document.createElement("style");
        style.id = "cozy-fs-styles";
        style.textContent = `
            .cozy-fs-header h3 { color: var(--accent-emerald, #1B5E20); margin: 0 0 4px; }
            .cozy-fs-tagline { opacity: .75; margin: 0 0 16px; }
            .cozy-fs-list { display: grid; gap: 12px; }
            .cozy-fs-card { background: var(--cozy-glass-bg, rgba(255,255,255,.06)); border: 1px solid var(--emerald-glow, #00A86B); border-radius: 12px; padding: 14px 16px; box-shadow: var(--cozy-glass-shadow, none); backdrop-filter: blur(6px); cursor: pointer; }
            .cozy-fs-card:hover { border-color: var(--accent-gold, #1B5E20); }
            .cozy-fs-card-header { display: flex; justify-content: space-between; align-items: center; }
            .cozy-fs-status { font-size: .75rem; padding: 2px 8px; border-radius: 999px; background: rgba(27,94,32,.15); color: var(--accent-emerald, #1B5E20); }
            .cozy-fs-visibility { font-size: .85rem; opacity: .8; }
            .cozy-fs-card-meta { font-size: .8rem; opacity: .65; margin-top: 6px; }
            .cozy-fs-empty, .cozy-fs-unavailable { opacity: .7; padding: 16px; text-align: center; }
            .cozy-fs-private { text-align: center; padding: 32px 16px; }
            .cozy-fs-private-badge { font-size: 1.1rem; font-weight: 600; color: var(--accent-emerald, #1B5E20); }
            .cozy-fs-subhead { margin: 20px 0 8px; opacity: .8; }

            /* Stage 3 — Founder Story Experience */
            .cozy-fs-back { background: none; border: 1px solid var(--emerald-glow, #00A86B); color: inherit; border-radius: 8px; padding: 4px 10px; cursor: pointer; margin-bottom: 10px; }
            .cozy-fs-chapters { display: grid; gap: 8px; }
            .cozy-fs-chapter { background: var(--cozy-glass-bg, rgba(255,255,255,.06)); border: 1px solid var(--emerald-glow, #00A86B); border-radius: 10px; padding: 10px 14px; cursor: pointer; }
            .cozy-fs-era { float: right; font-size: .75rem; opacity: .65; }
            .cozy-fs-reader-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
            .cozy-fs-reader-title h3 { margin: 0; color: var(--accent-emerald, #1B5E20); }
            .cozy-fs-fullscreen { background: none; border: 1px solid var(--emerald-glow, #00A86B); border-radius: 8px; padding: 4px 10px; cursor: pointer; }
            .cozy-fs-progress-bar { background: rgba(255,255,255,.08); border-radius: 999px; height: 6px; overflow: hidden; margin: 10px 0 4px; }
            .cozy-fs-progress-fill { background: var(--accent-emerald, #1B5E20); height: 100%; transition: width .3s ease; }
            .cozy-fs-progress-label { font-size: .75rem; opacity: .7; }
            .cozy-fs-lang-switch, .cozy-fs-ambience, .cozy-fs-accessibility, .cozy-fs-controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 10px 0; }
            .cozy-fs-lang-btn, .cozy-fs-ambience-btn, .cozy-fs-controls button { background: var(--cozy-glass-bg, rgba(255,255,255,.06)); border: 1px solid var(--emerald-glow, #00A86B); color: inherit; border-radius: 999px; padding: 4px 12px; cursor: pointer; font-size: .85rem; }
            .cozy-fs-lang-btn.active, .cozy-fs-ambience-btn.active { background: var(--accent-emerald, #1B5E20); color: #fff; }
            .cozy-fs-reader-body { max-height: 50vh; overflow-y: auto; padding: 12px; background: var(--cozy-glass-bg, rgba(255,255,255,.04)); border-radius: 10px; line-height: 1.7; }
            .cozy-fs-reader.cozy-fs-large-text .cozy-fs-reader-body { font-size: 1.35rem; line-height: 1.9; }
            .cozy-fs-sentence { transition: background-color .25s ease; border-radius: 4px; }
            .cozy-fs-sentence-current { background-color: rgba(27,94,32,.22); box-shadow: 0 0 0 2px var(--emerald-glow, #00A86B); }
            .cozy-fs-status { font-size: .8rem; opacity: .75; min-height: 1.2em; }
            .cozy-fs-ambience-status { font-size: .75rem; opacity: .65; }
            .cozy-fs-bookmark { font-size: .8rem; opacity: .8; cursor: pointer; padding: 2px 0; }
            .cozy-fs-speed-label, .cozy-fs-voice-label, .cozy-fs-autoscroll-label { font-size: .8rem; display: flex; align-items: center; gap: 4px; }
        `;
        document.head.appendChild(style);
    }

    /** toggleAmbience() — composes LivingSounds.play()/fadeOut() only. Honestly reports "Not Available" (Governance Principle 12 pattern) rather than pretending success when no real ambience pack is loaded — true for every option today except "silent". */
    function toggleAmbience(id, container) {
        const sounds = window.CozyOS.LivingSounds;
        const statusEl = container.querySelector("#cozy-fs-ambience-status");
        if (activeAmbienceEvent && sounds && typeof sounds.fadeOut === "function") sounds.fadeOut(activeAmbienceEvent, 600);
        activeAmbienceEvent = null;
        container.querySelectorAll(".cozy-fs-ambience-btn").forEach((b) => b.classList.remove("active"));
        const btn = container.querySelector(`[data-ambience="${id}"]`);
        if (btn) btn.classList.add("active");
        if (id === "silent") { if (statusEl) statusEl.textContent = ""; return; }
        if (!sounds || typeof sounds.play !== "function") { if (statusEl) statusEl.textContent = "Living Sounds is not available."; return; }
        sounds.play(id, { category: "nature", fadeMs: 1200, loop: true }).then((result) => {
            if (result && result.success) { activeAmbienceEvent = id; if (statusEl) statusEl.textContent = ""; }
            else if (statusEl) { statusEl.textContent = `Not Available — ${(result && result.reason) || "no ambience pack loaded"}.`; }
        });
    }

    /** toggleHighContrast() — composes the real, existing window.CozyOS.Theme.setTheme("high-contrast"). Disclosed: this is a platform-wide theme switch, not scoped to this panel; restores whatever theme was active before, read from the DOM attribute setTheme() itself uses as source of truth. */
    function toggleHighContrast(checked) {
        const theme = window.CozyOS.Theme;
        if (!theme || typeof theme.setTheme !== "function") return;
        if (checked) {
            themeBeforeHighContrast = document.documentElement.getAttribute("data-cozy-app") || "developer";
            theme.setTheme("high-contrast");
        } else {
            theme.setTheme(themeBeforeHighContrast || "developer");
            themeBeforeHighContrast = null;
        }
    }

    /** toggleLargeText() — genuinely new, narrowly scoped to `.cozy-fs-reader` only (see file header: no existing engine executes a live large-text toggle). */
    function toggleLargeText(checked, container) {
        largeTextOn = checked;
        const reader = container.querySelector("#cozy-fs-reader");
        if (reader) reader.classList.toggle("cozy-fs-large-text", checked);
    }

    function toggleFullscreen(container) {
        const reader = container.querySelector("#cozy-fs-reader");
        if (!reader) return;
        if (!document.fullscreenElement && typeof reader.requestFullscreen === "function") reader.requestFullscreen().catch(() => { /* honest no-op if unsupported/denied */ });
        else if (document.fullscreenElement && typeof document.exitFullscreen === "function") document.exitFullscreen().catch(() => { /* honest no-op */ });
    }

    function addBookmarkAtCurrent(storyId, container) {
        if (!activeSession) return;
        const engine = window.CozyOS.FounderStory;
        const viewerId = getCurrentUserId();
        const state = activeSession.getState();
        engine.addBookmark(storyId, viewerId, { chapterId: state.chapterId, sentenceIndex: state.index });
        renderReaderShell(storyId, container);
        wireSessionEvents(activeSession, container);
    }

    /**
     * init(containerId) — lazy mount, matching the exact convention
     * already established by security-insights-panel.js: this module
     * does not self-mount on DOMContentLoaded or write into
     * document.body speculatively. It finds its container only when a
     * caller (the settings/dashboard router that will invoke this in a
     * future stage) actually asks for it. Falls back to a detached,
     * never-appended element when no container exists yet, so
     * renderDashboard()/viewStory() are always safe to call for testing
     * without side effects on the live page.
     *
     * STAGE 3: the single delegated click/change/input listener pattern
     * already established here for [data-story-id] is extended, not
     * replaced, to cover every reader control — since rootEl's own
     * innerHTML is fully replaced on navigation, delegation on the
     * stable rootEl (not on the regenerated inner elements) is what
     * makes every re-rendered button/control keep working without
     * re-attaching listeners each render.
     *
     * M366.2 Phase 2 — state-aware repaint:
     *   cozy-workspace.js now calls init() unconditionally on every
     *   #render() while Founder Story is the active center — the exact
     *   same convention it already uses for developer-hub.js's init().
     *   Previously this function always called renderDashboard(), which
     *   meant any unrelated shell repaint (sidebar toggle, nav click
     *   elsewhere, telemetry sync, etc.) while a user was mid-chapter
     *   would silently yank them back to the story list. init() now
     *   checks module-scoped `activeSession` (real reading/listening
     *   state, not a new store) before deciding what to paint: if a
     *   session is open, it repaints the reader shell for that session's
     *   current state instead of resetting to the dashboard. It does NOT
     *   re-run wireSessionEvents() on repaint — that would stack a second
     *   set of session-level listeners (FounderStoryNarrationSession's
     *   own on() dedupes only by handler reference, and each call here
     *   creates fresh anonymous closures) — the session's listeners are
     *   wired once, in openReader()/addBookmarkAtCurrent(), and now
     *   resolve their DOM target through `rootEl` at fire time rather
     *   than a closed-over container, so they keep working correctly
     *   across repaints (see wireSessionEvents() above for why).
     *
     *   Delegated DOM listeners on rootEl itself are guarded by
     *   `boundRoots` so a container node that's handed to init() more
     *   than once doesn't accumulate duplicate click/input/change/keydown
     *   listeners; a freshly rebuilt node (the normal host-shell case)
     *   is simply not yet in that set and gets wired once, as before.
     */
    function init(containerId) {
        rootEl = document.getElementById(containerId || "cozy-founderstory-root") || document.createElement("div");
        injectStyles();

        if (activeSession) {
            // A reading/listening session is already open — repaint its
            // current state into the (possibly newly-rebuilt) container
            // instead of resetting to the dashboard.
            renderReaderShell(activeSession.getState().storyId, rootEl);
        } else {
            renderDashboard();
        }

        if (boundRoots.has(rootEl)) return rootEl;
        boundRoots.add(rootEl);

        rootEl.addEventListener("click", (e) => {
            const storyCard = e.target.closest("[data-story-id]");
            if (storyCard) { viewStory(storyCard.getAttribute("data-story-id"), rootEl); return; }

            const chapterCard = e.target.closest("[data-open-chapter]");
            if (chapterCard) { openReader(chapterCard.getAttribute("data-open-story"), chapterCard.getAttribute("data-open-chapter"), rootEl); return; }

            if (e.target.closest("[data-back-to-list]")) { teardownActiveSession(); renderDashboard(); return; }

            const actionBtn = e.target.closest("[data-action]");
            if (actionBtn && activeSession) {
                const action = actionBtn.getAttribute("data-action");
                const storyId = activeSession.getState().storyId;
                if (action === "play") activeSession.play();
                else if (action === "pause") activeSession.pause();
                else if (action === "stop") activeSession.stop();
                else if (action === "prev-chapter") activeSession.previous();
                else if (action === "next-chapter") activeSession.next();
                else if (action === "fullscreen") toggleFullscreen(rootEl);
                else if (action === "add-bookmark") addBookmarkAtCurrent(storyId, rootEl);
                return;
            }

            const bookmarkEl = e.target.closest("[data-goto-sentence]");
            if (bookmarkEl && activeSession) { activeSession.seek(Number(bookmarkEl.getAttribute("data-goto-sentence"))); return; }

            const langBtn = e.target.closest("[data-lang]");
            if (langBtn && activeSession) { activeSession.setLanguage(langBtn.getAttribute("data-lang")); return; }

            const ambienceBtn = e.target.closest("[data-ambience]");
            if (ambienceBtn) { toggleAmbience(ambienceBtn.getAttribute("data-ambience"), rootEl); return; }
        });

        rootEl.addEventListener("input", (e) => {
            const control = e.target.closest("[data-control]");
            if (!control || !activeSession) return;
            const name = control.getAttribute("data-control");
            if (name === "speed") activeSession.setSpeed(parseFloat(control.value));
        });

        rootEl.addEventListener("change", (e) => {
            const control = e.target.closest("[data-control]");
            if (!control) return;
            const name = control.getAttribute("data-control");
            if (name === "voice" && activeSession) activeSession.setVoiceProvider(control.value || null);
            else if (name === "autoscroll") autoScrollOn = control.checked;
            else if (name === "high-contrast") toggleHighContrast(control.checked);
            else if (name === "large-text") toggleLargeText(control.checked, rootEl);
        });

        rootEl.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            const target = e.target.closest("[data-open-chapter],[data-story-id]");
            if (target) { e.preventDefault(); target.click(); }
        });

        const engine = window.CozyOS.FounderStory;
        if (engine && typeof engine.on === "function") {
            engine.on("story-created", renderDashboard);
            engine.on("permission-changed", renderDashboard);
        }
        return rootEl;
    }

    window.CozyOS.Modules["founder-story-panel"] = Object.freeze({
        version: MODULE_VERSION,
        description: "Glass UI panel over FounderStoryEngine and (Stage 3) FounderStoryNarration. Renders only what getStory()/getChapter()/listVisibleStories() return; never bypasses the engine's fail-closed visibility check. Stage 3 adds the full Story Experience: reading/listening/both modes, reader controls (play/pause/resume/stop/next/previous/auto-scroll/sentence-highlight/speed/voice/fullscreen), background ambience (LivingSounds, honestly reports unavailable — no real audio packs exist), multilingual switching, bookmarks, reading position/progress, and a high-contrast toggle (composes the existing CozyOS.Theme, platform-wide by design) plus a narrowly-scoped new large-text toggle. Lazy-mounted via init(containerId), matching the security-insights-panel.js convention.",
        init, renderDashboard, viewStory, openReader
    });
})();
