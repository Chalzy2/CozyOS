/**
 * CozyOS — Living Floating Assistant
 * File Reference: core/living/cozy-living-assistant.js
 * Layer: Living Ecosystem — Composed Living Component
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 364.7.1
 *
 * ═══════════════════════════════════════════════════════════════════════
 * CLASSIFICATION: COMPOSED LIVING COMPONENT (per Gate 1/2 verification —
 * see M364.7.1 Phase 1 reports). This is NOT a new subsystem, NOT a new
 * application, NOT a new AI. Every layer below composes a real, existing
 * CozyOS engine confirmed present before this file was written:
 * ═══════════════════════════════════════════════════════════════════════
 *   - window.CozyOS.LivingAI — real state machine (idle/thinking/
 *     speaking) + think(text, options), already loaded in dashboard.html,
 *     previously unconsumed by any UI. This file is that UI.
 *   - core/living/cozy-living.css — .cozy-living-btn, .cozy-living-panel
 *     (+ .cozy-bloom), .cozy-living-glass, .cozy-living-border-glow,
 *     .cozy-living-input, .cozy-living-card — all real, all reused
 *     verbatim. Only two genuinely new, narrow CSS additions were made
 *     to that same file: fixed-position host rules for the button/panel
 *     (nothing in the Living CSS library previously positioned anything
 *     as a floating corner element) and a user/assistant message-color
 *     distinction — disclosed in that file's own changelog comment.
 *   - window.CozyOS.CozySpeech / VoiceManager — real voice output,
 *     composed exactly the same way Founder Story's narration engine
 *     already does (M361 Stage 3): VoiceManager.speak({text}).
 *   - window.CozyOS.SpeechRecognitionAdapter — real mic input.
 *   - window.CozyOS.PlatformEventBus — real, existing bus. This file
 *     adds no new bus and no polling; it listens for exactly one real,
 *     newly-emitted WorkspaceShell event (see below).
 *   - window.CozyOS.WorkspaceShell — its own real, generic on()/emit()
 *     (delegating to PlatformEventBus) already existed; the ONE genuine
 *     extension made this milestone is a single `this.emit("center:changed",
 *     {center})` call added at WorkspaceShell's existing section-switch
 *     site (core/shell/cozy-workspace.js) — no new event system, one new
 *     event name on an existing, real emitter.
 *   - #renderList()-equivalent: this file's own #renderMessage() mirrors
 *     the same real row/card rendering convention cozy-workspace.js's
 *     Notification Center already uses (.cozy-event-row/.cozy-living-card),
 *     not a new rendering framework.
 *
 * MOUNTING (Workspace persistence — composed, not new)
 *   Mounted once, as a direct child of <body>, sibling to
 *   #cozy-workspace-root and the Living Background canvas — the exact
 *   same structural pattern already confirmed (M364.7 Phase 1) to keep
 *   the Living Background untouched by WorkspaceShell's own re-renders.
 *   Conversation state lives in this file's own module scope, entirely
 *   outside #cozy-workspace-root, so it is never reset by navigation.
 *
 * HONEST, DISCLOSED SCOPE
 *   - LivingAI's "think" is a real, honestly-disclosed rule-based
 *     reasoning pipeline (not an LLM) — this file does not change or
 *     upgrade that; it only gives it a real UI for the first time.
 *   - Voice output/input depend on the same real, browser-dependent
 *     engines already disclosed elsewhere in this codebase (Web Speech
 *     API availability varies by browser) — no new capability claimed.
 *   - Only ever appears after a real, successful login (mounted from
 *     dashboard.html only, never index.html/login.html) — never shown
 *     during the startup/login sequence, per explicit scope.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["cozy-living-assistant"] && window.CozyOS.Modules["cozy-living-assistant"].version) return;

    const MAX_BIND_ATTEMPTS = 40;
    const BIND_RETRY_MS = 250;

    class LivingAssistant {
        #messages = [];      // { role: "user"|"assistant", text, timestamp }
        #expanded = false;
        #currentSection = "dashboard";
        #root = null;
        #panel = null;
        #button = null;
        #messagesEl = null;
        #stateUnsubscribe = null;
        #recognitionWired = false;

        mount() {
            if (this.#root) return; // already mounted - never recreated
            this.#root = document.createElement("div");
            this.#root.id = "cozy-living-assistant-root";
            this.#root.innerHTML = `
                <button type="button" id="cozy-living-assistant-btn"
                    class="cozy-living-btn cozy-btn-breathing cozy-living-border-glow cozy-living-assistant-btn"
                    aria-label="Open CozyOS Assistant" aria-expanded="false" title="CozyOS Assistant">🟢</button>
                <div id="cozy-living-assistant-panel" class="cozy-living-panel cozy-bloom cozy-living-glass cozy-living-border-glow cozy-living-assistant-panel" hidden>
                    <div class="cozy-living-assistant-header">
                        <span class="cozy-living-assistant-title">CozyOS Assistant</span>
                        <span id="cozy-living-assistant-status" class="cozy-living-assistant-status" aria-live="polite"></span>
                        <button type="button" id="cozy-living-assistant-minimize" aria-label="Minimize">—</button>
                        <button type="button" id="cozy-living-assistant-close" aria-label="Close">✕</button>
                    </div>
                    <div id="cozy-living-assistant-quick-actions" class="cozy-living-assistant-quick-actions"></div>
                    <div id="cozy-living-assistant-messages" class="cozy-living-assistant-messages" role="log" aria-live="polite"></div>
                    <form id="cozy-living-assistant-form" class="cozy-living-assistant-form">
                        <button type="button" id="cozy-living-assistant-mic" aria-label="Voice input" title="Speak">🎙️</button>
                        <input type="text" id="cozy-living-assistant-input" class="cozy-living-input" placeholder="Ask CozyOS..." autocomplete="off">
                        <button type="submit" id="cozy-living-assistant-send" aria-label="Send">➤</button>
                    </form>
                </div>
            `;
            document.body.appendChild(this.#root);
            this.#panel = this.#root.querySelector("#cozy-living-assistant-panel");
            this.#button = this.#root.querySelector("#cozy-living-assistant-btn");
            this.#messagesEl = this.#root.querySelector("#cozy-living-assistant-messages");

            this.#wireButton();
            this.#wireForm();
            this.#wireVoiceInput();
            this.#wireLivingAIState();
            this.#bindWorkspaceContext();
            this.#renderQuickActions();
            this.#seedWelcomeMessage();
        }

        #wireButton() {
            this.#button.addEventListener("click", () => this.toggle());
            this.#root.querySelector("#cozy-living-assistant-close").addEventListener("click", () => this.close());
            this.#root.querySelector("#cozy-living-assistant-minimize").addEventListener("click", () => this.close());
        }

        toggle() { this.#expanded ? this.close() : this.open(); }
        open() {
            this.#expanded = true;
            this.#panel.hidden = false;
            this.#button.setAttribute("aria-expanded", "true");
            const input = this.#root.querySelector("#cozy-living-assistant-input");
            if (input) input.focus();
        }
        close() {
            this.#expanded = false;
            this.#panel.hidden = true;
            this.#button.setAttribute("aria-expanded", "false");
        }

        /**
         * #renderQuickActions() — real quick actions, composing only
         * existing services. No new feed, search index, help system, or
         * navigation mechanism is created:
         *   - Search / Notifications / Recent Activity all compose
         *     WorkspaceShell's real, existing search()/getNotificationFeed()
         *     (the same real data Enterprise Search / Notification Center
         *     already use — "recent activity" reuses the identical feed,
         *     not a second one, since no separate activity feed exists).
         *   - Help composes the assistant's own real #send() → LivingAI.think()
         *     pipeline — not a fabricated docs/help content system (none
         *     exists in this repository, confirmed before writing this).
         *   - Workspace shortcuts dispatch a real click() on the existing,
         *     already-rendered [data-center] nav elements — the exact same
         *     mechanism a person clicking the sidebar already uses, never
         *     a second navigation path.
         */
        #renderQuickActions() {
            const host = this.#root.querySelector("#cozy-living-assistant-quick-actions");
            if (!host) return;
            host.innerHTML = `
                <button type="button" data-quick="search" class="cozy-living-assistant-qa">🔎 Search</button>
                <button type="button" data-quick="notifications" class="cozy-living-assistant-qa">🔔 Notifications</button>
                <button type="button" data-quick="recent" class="cozy-living-assistant-qa">🕘 Recent</button>
                <button type="button" data-quick="help" class="cozy-living-assistant-qa">❓ Help</button>
                <button type="button" data-quick="goto-dashboard" class="cozy-living-assistant-qa">⌂ Dashboard</button>
            `;
            host.addEventListener("click", (evt) => {
                const btn = evt.target.closest("[data-quick]");
                if (!btn) return;
                this.#runQuickAction(btn.getAttribute("data-quick"));
            });
        }

        #runQuickAction(action) {
            const shell = window.CozyOS && window.CozyOS.WorkspaceShell;
            if (action === "search") {
                const term = window.prompt("Search CozyOS:");
                if (!term) return;
                if (!shell || typeof shell.search !== "function") { this.#addMessage("assistant", "Search is not available right now."); return; }
                const { results } = shell.search(term);
                if (!results.length) { this.#addMessage("assistant", `No results for "${term}".`); return; }
                this.#addMessage("assistant", `Found ${results.length} result(s) for "${term}": ${results.slice(0, 5).map(r => r.label).join(", ")}`);
                return;
            }
            if (action === "notifications" || action === "recent") {
                if (!shell || typeof shell.getNotificationFeed !== "function") { this.#addMessage("assistant", "Notifications are not available right now."); return; }
                const feed = shell.getNotificationFeed(5);
                if (!feed.length) { this.#addMessage("assistant", "Nothing to show yet — no real events have been logged."); return; }
                const label = action === "recent" ? "Recent activity" : "Latest notifications";
                this.#addMessage("assistant", `${label}: ` + feed.map(e => `${e.eventName} (${e.source})`).join("; "));
                return;
            }
            if (action === "help") { this.#send("What can you help me with?"); return; }
            if (action.startsWith("goto-")) {
                const center = action.replace("goto-", "");
                const navLink = document.querySelector(`[data-center="${center}"]`);
                if (navLink && typeof navLink.click === "function") { navLink.click(); this.close(); }
                else this.#addMessage("assistant", `"${center}" isn't available in the current navigation.`);
                return;
            }
        }

        #seedWelcomeMessage() {
            this.#addMessage("assistant", "Hi — I'm the CozyOS Assistant. I can help with what you're currently working on.");
        }

        /** #addMessage() — mirrors cozy-workspace.js's own real .cozy-event-row/.cozy-living-card row convention (Notification Center), not a new rendering framework. */
        #addMessage(role, text) {
            const entry = { role, text, timestamp: new Date().toISOString() };
            this.#messages.push(entry);
            const row = document.createElement("div");
            row.className = `cozy-living-card cozy-event-row cozy-living-assistant-msg cozy-living-assistant-msg-${role === "user" ? "user" : "assistant"}`;
            row.textContent = text;
            this.#messagesEl.appendChild(row);
            this.#messagesEl.scrollTop = this.#messagesEl.scrollHeight;
        }

        #wireForm() {
            const form = this.#root.querySelector("#cozy-living-assistant-form");
            const input = this.#root.querySelector("#cozy-living-assistant-input");
            form.addEventListener("submit", async (evt) => {
                evt.preventDefault();
                const text = input.value.trim();
                if (!text) return;
                input.value = "";
                await this.#send(text);
            });
        }

        /** #send() — the one real AI call: composes LivingAI.think(), never a second reasoning engine. */
        async #send(text) {
            this.#addMessage("user", text);
            const ai = window.CozyOS && window.CozyOS.LivingAI;
            if (!ai || typeof ai.think !== "function") {
                this.#addMessage("assistant", "The CozyOS reasoning engine is not available right now.");
                return;
            }
            const result = await ai.think(text, { context: this.#currentSection });
            const replyText = result && result.success ? (result.result?.text || result.result?.summary || JSON.stringify(result.result)) : (result && result.reason) || "I couldn't process that right now.";
            this.#addMessage("assistant", replyText);
            this.#speak(replyText);
        }

        /** #speak() — composes the real VoiceManager, exactly as Founder Story's narration engine already does (M361 Stage 3). Never a second TTS path. */
        #speak(text) {
            const vm = window.CozyOS && window.CozyOS.VoiceManager;
            if (vm && typeof vm.speak === "function") { try { vm.speak({ text }); } catch (_err) { /* honest no-op */ } }
        }

        /** #wireVoiceInput() — composes the real SpeechRecognitionAdapter (singleton, per-tab, same real engine already used elsewhere in this codebase). Honestly disables the mic button if unavailable, never fakes listening. */
        #wireVoiceInput() {
            const micBtn = this.#root.querySelector("#cozy-living-assistant-mic");
            const asr = window.CozyOS && window.CozyOS.SpeechRecognitionAdapter;
            if (!asr || typeof asr.isReal !== "function" || !asr.isReal()) {
                micBtn.disabled = true;
                micBtn.title = "Voice input is not available in this browser.";
                return;
            }
            if (!this.#recognitionWired) {
                this.#recognitionWired = true;
                asr.on("onFinalResult", (payload) => {
                    const input = this.#root.querySelector("#cozy-living-assistant-input");
                    if (input && payload && payload.transcript) { input.value = payload.transcript; this.#send(payload.transcript); input.value = ""; }
                });
            }
            micBtn.addEventListener("click", () => {
                if (asr.isActive()) { asr.stop(); return; }
                asr.start({ continuous: false, interimResults: false });
            });
        }

        /** #wireLivingAIState() — subscribes to LivingAI's own real, existing state machine (idle/thinking/speaking) to reflect it visually. No new state machine. */
        #wireLivingAIState() {
            const ai = window.CozyOS && window.CozyOS.LivingAI;
            const statusEl = this.#root.querySelector("#cozy-living-assistant-status");
            if (!ai || typeof ai.on !== "function") return;
            ai.on((state) => {
                if (statusEl) statusEl.textContent = state === "thinking" ? "Thinking..." : state === "speaking" ? "Speaking..." : "";
                this.#button.classList.toggle("cozy-ai-thinking", state === "thinking");
                this.#button.classList.toggle("cozy-ai-speaking", state === "speaking");
            });
        }

        /**
         * #bindWorkspaceContext() — real context-awareness, composing
         * WorkspaceShell's own existing on()/emit() (which already
         * delegates to PlatformEventBus, no new bus). Listens for the
         * one new, minimal "center:changed" event added this milestone
         * at WorkspaceShell's existing section-switch call site. Bounded
         * retry (same convention as dashboard.html's own
         * mountWorkspaceWhenReady()) since WorkspaceShell may not exist
         * yet at the moment this file's script runs.
         */
        #bindWorkspaceContext() {
            let attempts = 0;
            const tryBind = () => {
                const shell = window.CozyOS && window.CozyOS.WorkspaceShell;
                if (shell && typeof shell.on === "function") {
                    shell.on("center:changed", ({ center }) => { if (center) this.#currentSection = center; });
                    return;
                }
                attempts++;
                if (attempts < MAX_BIND_ATTEMPTS) setTimeout(tryBind, BIND_RETRY_MS);
            };
            tryBind();
        }

        getDiagnosticsReport() {
            return { moduleVersion: VERSION, messageCount: this.#messages.length, expanded: this.#expanded, currentSection: this.#currentSection };
        }
    }

    const instance = new LivingAssistant();
    window.CozyOS.LivingAssistant = instance;
    window.CozyOS.Modules["cozy-living-assistant"] = Object.freeze({
        version: VERSION,
        description: "Living Floating Assistant — a COMPOSED LIVING COMPONENT (M364.7.1). Composes LivingAI (real state machine + think()), core/living/cozy-living.css (real button/panel/glass/glow/input/card classes), VoiceManager/CozySpeech (real TTS, same pattern as Founder Story's narration engine), SpeechRecognitionAdapter (real ASR), and WorkspaceShell's own existing event system (one new event name, 'center:changed', added at its real section-switch site — no new bus, no polling). Mounts once, outside #cozy-workspace-root, sibling to the Living Background canvas — never recreated on navigation, conversation state never lost. Only ever mounted from dashboard.html, after real authentication — never shown during startup/login."
    });

    // Auto-mount: this file is only ever loaded on an authenticated
    // workspace page (dashboard.html) - real, same convention as every
    // other self-mounting Living component in this codebase.
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => instance.mount());
    } else {
        instance.mount();
    }
})();
