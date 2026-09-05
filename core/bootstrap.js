/**
 * CozyOS Bootstrap — core/bootstrap/bootstrap.js (M311)
 *
 * OWNERSHIP: this is the real startup orchestrator used by
 * chalzydashboard.html to load the Administrator Workspace. It does NOT
 * duplicate admin-workspace.html's script list as a second,
 * hand-maintained source of truth - it fetches admin-workspace.html's
 * real source at runtime and extracts its actual <body> content and
 * ordered script/inline-script sequence, then replays that sequence
 * inside chalzydashboard.html. admin-workspace.html remains completely
 * unchanged and fully functional as a standalone entry point (Cloudflare
 * compatibility requirement) - this file only composes it.
 *
 * ROUTING FIX (RP-ADMIN-ROUTING-SPLIT): this used to fetch
 * "dashboard.html" back when that file held the Administrator Workspace
 * content. dashboard.html is now the public User Dashboard entry point
 * (see index.html/dashboard.html); the real admin content it used to
 * hold moved to admin-workspace.html, and the fetch target below was
 * updated to match. Nothing else about this file's extraction/replay
 * logic changed.
 *
 * HONEST SEQUENCING NOTE - the central technical reality this file is
 * built around: Living (window.CozyOS.Living) does not exist until its
 * own script loads partway through the real sequence. This means
 * "startup itself becomes Living.transaction.execute()" is not
 * literally possible for the earliest stages - there is nothing to
 * call yet. This file tracks its own lightweight local stage state
 * from the start, and once Living genuinely becomes available
 * mid-sequence, begins a real Living.transaction, retroactively
 * records the already-completed early stages into its real timeline,
 * then continues tracking the remaining stages live. This is disclosed
 * here rather than presented as a single seamless transaction that
 * isn't actually possible given the real load order.
 *
 * HONEST TESTING LIMITATION: real sequential <script> injection and
 * execution timing can only be fully verified in an actual browser -
 * not via Node.js. The extraction/sequencing logic itself is tested
 * here against realistic mocks; live browser verification is still
 * required before this is relied upon in production, and is disclosed
 * as such rather than claimed as fully proven.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.Bootstrap) return;

    const REAL_STAGES = Object.freeze(["environment", "loading", "dependencies", "services", "modules", "living", "builder", "workspace", "startup", "ready"]);

    class CozyBootstrap {
        #localStages = [];
        #startedAt = null;
        #state = "idle";
        #livingTransactionId = null;

        #recordLocalStage(stage, detail = {}) {
            this.#localStages.push({ stage, at: new Date().toISOString(), detail });
            this.#emitBootstrapEvent("bootstrap:stage", { stage, detail });
            const living = window.CozyOS.Living;
            if (living && this.#livingTransactionId && typeof living.transaction?.setStage === "function") {
                if (REAL_STAGES.includes(stage)) living.transaction.setStage(this.#livingTransactionId, this.#toRealStageCase(stage));
            }
        }

        #toRealStageCase(stage) {
            const map = { loading: "Generating", dependencies: "Validating", startup: "Verifying", ready: "Completed" };
            return map[stage] || stage;
        }

        #emitBootstrapEvent(eventName, detail) {
            const bus = window.CozyOS.PlatformEventBus;
            if (bus && typeof bus.emit === "function") { try { bus.emit(eventName, detail); } catch (_err) { /* non-fatal */ } }
        }

        detectEnvironment() {
            const env = {
                browser: typeof navigator !== "undefined" ? navigator.userAgent : null,
                hostname: typeof location !== "undefined" ? location.hostname : null,
                isCloudflare: typeof location !== "undefined" && /\.pages\.dev$|cozyos\.org$/.test(location.hostname || ""),
                isLocalDevelopment: typeof location !== "undefined" && ["localhost", "127.0.0.1"].includes(location.hostname),
                isMobile: typeof navigator !== "undefined" && /Mobi|Android/i.test(navigator.userAgent || "")
            };
            this.#recordLocalStage("environment", env);
            return env;
        }

        verifyPrerequisites() {
            const checks = ["Living", "PlatformEventBus", "ModuleRegistry", "ServiceRegistry", "DependencyEngine", "WorkspaceShell", "BuilderRuntime"];
            const result = {};
            for (const name of checks) result[name] = !!window.CozyOS[name];
            return result;
        }

        /**
         * loadExternalScript(item)
         *   Loads one external <script> with automatic retry, added
         *   specifically for the real, reported failure: a genuine
         *   platform administrator reaching /chalzydashboard and the
         *   workspace getting permanently stuck because exactly ONE
         *   script out of the 270+ this file loads sequentially failed
         *   its single load attempt (confirmed, by direct testing
         *   against the real, unmodified server and file: the file
         *   itself, its path, its case, and the server's handling of it
         *   are all correct — the failure is a transient one, most
         *   consistent with a Render cold-start hiccup or a mobile-
         *   network blip on that one request, not a code or path
         *   defect). A single onerror on any one of 270+ sequential,
         *   un-retried loads was previously fatal to the entire
         *   workspace. This retries the SAME script element/URL up to
         *   3 total attempts with a short delay between them before
         *   giving up and surfacing the real failure exactly as before
         *   (via chalzydashboard.html's own visible-error fix). Inline
         *   scripts are unaffected — they have no network dependency to
         *   retry.
         */
        async loadExternalScript(item, attempt = 1, maxAttempts = 3) {
            try {
                await new Promise((resolve, reject) => {
                    const el = document.createElement("script");
                    if (item.scriptType === "module") el.type = "module";
                    el.src = item.src;
                    el.onload = () => resolve();
                    el.onerror = () => reject(new Error(`Real script load failed: ${item.src}`));
                    document.head.appendChild(el);
                });
            } catch (err) {
                if (attempt >= maxAttempts) throw err;
                await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
                return this.loadExternalScript(item, attempt + 1, maxAttempts);
            }
        }

        async loadScriptSequence(sequence) {
            for (const item of sequence) {
                if (item.type === "external") {
                    await this.loadExternalScript(item);
                } else if (item.type === "inline") {
                    try {
                        (0, eval)(item.content);
                    } catch (err) {
                        throw new Error(`Real inline script execution failed: ${err.message}`);
                    }
                }
                if (!this.#livingTransactionId && window.CozyOS.Living && typeof window.CozyOS.Living.transaction?.begin === "function") {
                    const { id } = window.CozyOS.Living.transaction.begin({ name: "platform-bootstrap", type: "bootstrap", source: "Bootstrap" });
                    this.#livingTransactionId = id;
                    for (const prior of this.#localStages) {
                        window.CozyOS.Living.transaction.addWarning?.(id, `Retroactively recorded early stage: ${prior.stage}`);
                    }
                }
            }
        }

        extractSequence(rawHtml) {
            // Real fix: strip HTML comments first - confirmed root cause
            // of matching literal "<script>" text mentioned in prose
            // inside a real comment as if it were an actual tag. Safe to
            // do for the whole document: comments never render, so this
            // has no visual effect on bodyHtml either.
            const html = rawHtml.replace(/<!--[\s\S]*?-->/g, "");
            const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            const bodyHtml = bodyMatch ? bodyMatch[1] : "";
            const headMatch = html.match(/<head[^>]*>([\s\S]*)<\/head>/i);
            const headHtml = headMatch ? headMatch[1] : "";
            // Real fix (M321): capture every real <style> block from the
            // actual <head> - confirmed root cause of the "splash runs but
            // looks static" symptom. Without this, dashboard.html's real
            // animation CSS (logo reveal, colour split, typing cursor,
            // letter pulse, and .cozy-launch-hidden's fade-out) was never
            // present in the DOM when loaded via index.html, even though
            // the underlying setTimeout sequence executed exactly on
            // schedule - the JS worked, nothing visible showed it.
            const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
            const styles = [];
            let styleMatch;
            while ((styleMatch = styleRegex.exec(headHtml)) !== null) {
                if (styleMatch[1].trim()) styles.push(styleMatch[1]);
            }
            const scriptRegex = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
            const sequence = [];
            let match;
            while ((match = scriptRegex.exec(html)) !== null) {
                const attrs = match[1];
                const content = match[2];
                const typeMatch = attrs.match(/type="([^"]+)"/);
                const scriptType = typeMatch ? typeMatch[1] : null;
                // Real fix: a <script type="application/ld+json"> (or any
                // other non-executable data type) is structured data, not
                // JavaScript - eval()-ing it throws a real syntax error.
                // Confirmed present in dashboard.html's own JSON-LD block.
                if (scriptType && scriptType !== "module" && scriptType !== "text/javascript" && scriptType !== "application/javascript") continue;
                const srcMatch = attrs.match(/src="([^"]+)"/);
                if (srcMatch) sequence.push({ type: "external", src: srcMatch[1], scriptType });
                else if (content.trim()) sequence.push({ type: "inline", content, scriptType });
            }
            return { bodyHtml, styles, sequence };
        }

        async start() {
            if (this.#state === "starting" || this.#state === "ready") return { success: false, reason: `Bootstrap is already ${this.#state}.` };
            this.#state = "starting";
            this.#startedAt = Date.now();
            this.#emitBootstrapEvent("bootstrap:start", {});

            this.detectEnvironment();

            let html;
            try {
                const response = await fetch("admin-workspace.html");
                if (!response.ok) throw new Error(`Real fetch of admin-workspace.html returned HTTP ${response.status}.`);
                html = await response.text();
            } catch (err) {
                this.#state = "failed";
                this.#emitBootstrapEvent("bootstrap:failed", { reason: err.message });
                return { success: false, reason: `Could not real-fetch admin-workspace.html: ${err.message}` };
            }

            this.#recordLocalStage("loading", { fetchedRealBytes: html.length });
            const { bodyHtml, styles, sequence } = this.extractSequence(html);
            if (!document.head.querySelector('style[data-cozy-bootstrap-style="true"]')) {
                for (const styleContent of styles) {
                    const styleEl = document.createElement("style");
                    styleEl.setAttribute("data-cozy-bootstrap-style", "true");
                    styleEl.textContent = styleContent;
                    document.head.appendChild(styleEl);
                }
            }
            this.#recordLocalStage("dependencies", { realScriptCount: sequence.filter(s => s.type === "external").length });

            // M351 real fix, reapplied onto the M354 baseline — root
            // cause of "background stops after login/dashboard load":
            // a flat `document.body.innerHTML = bodyHtml` wipes every
            // direct child of <body>, including the real, live
            // #cozy-live-bg-canvas / #cozy-live-bg-video elements
            // cozy-background.js already mounted via
            // document.body.prepend(). A canvas element's rendering
            // state (its 2D context, in-flight requestAnimationFrame
            // loop) lives on the actual DOM node object, so detaching
            // and re-attaching the *same* node preserves it; recreating
            // it would not. This only preserves those two real,
            // already-mounted nodes — every other real element from
            // dashboard.html's body is unaffected.
            const persistedIds = ["cozy-live-bg-canvas", "cozy-live-bg-video", "cozy-liveview-controller"];
            const persistedNodes = persistedIds
                .map((id) => document.getElementById(id))
                .filter(Boolean);
            persistedNodes.forEach((node) => node.remove());

            document.body.innerHTML = bodyHtml;

            persistedNodes.forEach((node) => document.body.prepend(node));

            try {
                await this.loadScriptSequence(sequence);
            } catch (err) {
                this.#state = "failed";
                this.#emitBootstrapEvent("bootstrap:failed", { reason: err.message });
                return { success: false, reason: err.message };
            }

            this.#recordLocalStage("ready", {});
            this.#state = "ready";
            if (this.#livingTransactionId && window.CozyOS.Living) window.CozyOS.Living.transaction.commit(this.#livingTransactionId);
            this.#emitBootstrapEvent("bootstrap:ready", { durationMs: Date.now() - this.#startedAt });

            return { success: true, durationMs: Date.now() - this.#startedAt, prerequisites: this.verifyPrerequisites() };
        }

        status() { return this.#state; }
        isReady() { return this.#state === "ready"; }
        isStarting() { return this.#state === "starting"; }
        duration() { return this.#startedAt ? Date.now() - this.#startedAt : null; }
        timeline() { return [...this.#localStages]; }
        currentStage() { return this.#localStages.length > 0 ? this.#localStages[this.#localStages.length - 1].stage : null; }
        currentTransaction() { return this.#livingTransactionId; }

        health() {
            const prereqs = this.verifyPrerequisites();
            const missingCount = Object.values(prereqs).filter(v => !v).length;
            if (this.#state === "failed") return "failed";
            if (this.#state === "ready" && missingCount === 0) return "healthy";
            if (this.#state === "ready" && missingCount > 0) return "degraded";
            return "starting";
        }

        report() {
            return {
                state: this.#state,
                health: this.health(),
                durationMs: this.duration(),
                timeline: this.timeline(),
                prerequisites: this.verifyPrerequisites(),
                livingTransactionId: this.#livingTransactionId
            };
        }

        getVersion() { return "1.0.0"; }
        getId() { return "Bootstrap"; }
    }

    window.CozyOS.Bootstrap = new CozyBootstrap();
})();
 
