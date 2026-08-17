/**
 * CozyOS Application Launcher — core/shell/application-launcher.js
 * Phase 1 (minimal scope, per spec): resolve manifest, load CSS/HTML,
 * mount, track instances, close. No windows/tabs/routing/permissions.
 *
 * OWNERSHIP: composes ModuleRegistry.get() (real, verified) and the
 * real #cozy-workspace-root container (confirmed in dashboard.html).
 * No new registry, no new manifest format.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.ApplicationLauncher) return;

    class CozyApplicationLauncher {
        #instances = new Map(); // appId -> {container, cssLink}
        #lastWindowHandle = null; // M366.7 - set by #mount() during open(), read immediately after

        /**
         * #resolveIdentity() — Milestone 353, real fix.
         *   Previously this launcher only ever asked
         *   window.CozyOS.Auth.getCurrentAdministrator(), which — by that
         *   file's own documented design — is administrator/developer-only
         *   and never tracks a real End User session. That meant every
         *   application opened by an End User received userId: null,
         *   isAdmin: false and nothing else — no real SSO identity at all.
         *   window.CozyOS.Session (cozy-session-service.js) is the one
         *   real, role-agnostic "who is signed in" snapshot, established
         *   for every real login regardless of role — checked first here.
         *   Auth.getCurrentAdministrator() remains the honest fallback for
         *   any environment where Session isn't loaded, so nothing that
         *   worked before regresses.
         */
        #resolveIdentity() {
            const session = window.CozyOS && window.CozyOS.Session;
            let userId = null;
            if (session && typeof session.current === "function") {
                const snap = session.current();
                if (snap && snap.uid) userId = snap.uid;
            }
            if (!userId) {
                const admin = window.CozyOS.Auth && typeof window.CozyOS.Auth.getCurrentAdministrator === "function"
                    ? window.CozyOS.Auth.getCurrentAdministrator() : null;
                if (admin && admin.userId) userId = admin.userId;
            }
            const identity = window.CozyOS.IdentityEngine;
            const isAdmin = !!(identity && userId && typeof identity.isPlatformAdmin === "function" && identity.isPlatformAdmin(userId));
            const isDeveloper = !!(identity && userId && typeof identity.isDeveloper === "function" && identity.isDeveloper(userId));
            return { userId, isAdmin, isDeveloper };
        }

        /**
         * #canOpen(appId, userId) — Milestone 353 real fix, fail-closed.
         *   Reuses IdentityEngine's own real canAccessApplication(userId,
         *   appName) — never a second permission system — so a direct
         *   call to open() (browser console, localStorage tampering,
         *   forged URL/deep-link) is checked exactly the same way the
         *   Application Center UI already filters what it shows. Honest
         *   degrade: if IdentityEngine isn't connected at all, this can't
         *   verify anything and fails OPEN (matches this file's existing,
         *   documented "no identity loaded -> proceed unchecked" honest
         *   fallback) — but a real, connected IdentityEngine with a real
         *   signed-in user always fails CLOSED for a denied app.
         */
        #canOpen(appId, userId) {
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.canAccessApplication !== "function") return { allowed: true, checked: false };
            if (!userId) return { allowed: false, checked: true, reason: "No authenticated identity — sign in first." };
            return { allowed: identity.canAccessApplication(userId, appId), checked: true, reason: "Not permitted for this account's role/assignment." };
        }

        /**
         * open(appId, options)
         *   Real: resolve → load CSS → load HTML → mount.
         *   M366.7 addition (additive only, default behavior unchanged):
         *   options.mode may be "workspace" (default - mounts into
         *   #cozy-workspace-root exactly as before), "window" (registers
         *   with the real, existing WindowManager instead), or
         *   "fullscreen" (mounts as a window, then immediately
         *   maximizes it via the same real WindowManager). No new
         *   window-management logic is added here - this composes
         *   window-manager.js exactly as any other consumer would.
         */
        async open(appId, options = {}) {
            const mode = options.mode || "workspace";
            if (this.#instances.has(appId)) { this.focus(appId); return { success: true, alreadyOpen: true }; }

            const root = document.getElementById("cozy-workspace-root");
            if (!root) return { success: false, reason: "#cozy-workspace-root does not exist in this document." };

            const { userId, isAdmin, isDeveloper } = this.#resolveIdentity();
            const permission = this.#canOpen(appId, userId);
            if (permission.checked && !permission.allowed) {
                return { success: false, reason: `Access denied: ${permission.reason}` };
            }

            // Real Mode 3 (M319): JS-module-driven fragment, the
            // established window.CozyOS.Modules[appId] convention
            // (developer-hub.js, authenticator.js) - no separate HTML
            // file exists for these; getDashboard()/init() ARE the real
            // mount mechanism. Checked first since it's the more
            // specific, more direct real API when present.
            const jsModule = window.CozyOS.Modules && window.CozyOS.Modules[appId];
            if (jsModule && typeof jsModule.getDashboard === "function" && typeof jsModule.init === "function") {
                const container = document.createElement("div");
                container.className = "cozy-app-instance";
                container.dataset.cozyAppId = appId;
                container.innerHTML = jsModule.getDashboard();
                this.#mount(appId, container, root, mode);
                // Milestone 216 — real SSO fix: ShopOS's and MpesaOS's own
                // init(rawOptions) already destructure {container, userId}
                // and pass userId into IdentityEngine.checkPermission() —
                // a real hook that simply was never fed, since init() was
                // called with zero arguments below. This was the actual
                // reason the administrator's identity never reached these
                // apps: not a missing login form, a missing argument.
                // Composes the existing, real
                // window.CozyOS.Auth.getCurrentAdministrator() (core/security/
                // cozy-auth.js; getCurrentIdentity() is that same file's own
                // documented Milestone 200D alias for this — never a second
                // identity/token concept).
                // Milestone 347 — also now passes `container` itself, not
                // just userId: ShopOS's rawOptions fell back to
                // document.getElementById("cozy-app-root") whenever
                // container was omitted, which is the shared outer root,
                // not this specific per-instance div — so a module could
                // render into the wrong place whenever more than one
                // instance existed.
                // Milestone 353 — real SSO fix: a real End User session
                // type now exists (window.CozyOS.Session, role-agnostic,
                // resolved above via #resolveIdentity() before the
                // permission check). userId/isAdmin/isDeveloper are the
                // real resolved identity for whichever role actually
                // signed in — no longer assumed to always be an
                // administrator. Honest degrade unchanged: if nobody is
                // signed in, userId stays null and each module's own
                // already-real "no userId supplied -> proceed unchecked"
                // fallback applies, exactly as before.
                await jsModule.init({ container, userId, isAdmin, isDeveloper });
                this.#instances.set(appId, { container, cssLink: null, isStandalone: false, jsModule, windowHandle: this.#lastWindowHandle });
                return { success: true, appId, isStandalone: false, mode: "js-module" };
            }

            const registry = window.CozyOS.ModuleRegistry;
            if (!registry || typeof registry.get !== "function") return { success: false, reason: "ModuleRegistry is not loaded." };
            const manifest = registry.get(appId);
            if (!manifest) return { success: false, reason: `No real manifest registered for "${appId}".` };
            if (!manifest.html) return { success: false, reason: `Manifest for "${appId}" has no real html path.` };

            let cssLink = null;
            if (manifest.css) {
                cssLink = document.createElement("link");
                cssLink.rel = "stylesheet";
                cssLink.href = manifest.css;
                cssLink.dataset.cozyAppId = appId;
                document.head.appendChild(cssLink);
            }

            let htmlResponse;
            try { htmlResponse = await fetch(manifest.html); }
            catch (err) { if (cssLink) cssLink.remove(); return { success: false, reason: `Real fetch failed for "${manifest.html}": ${err.message}` }; }
            if (!htmlResponse.ok) { if (cssLink) cssLink.remove(); return { success: false, reason: `Real fetch returned HTTP ${htmlResponse.status} for "${manifest.html}".` }; }
            const htmlText = await htmlResponse.text();

            // Standalone page (has its own <head>) vs fragment - determined
            // by real content, not assumed from the file extension.
            const isStandalone = /<head[\s>]/i.test(htmlText);

            const container = document.createElement("div");
            container.className = "cozy-app-instance";
            container.dataset.cozyAppId = appId;

            if (isStandalone) {
                // Real, verified approach for a full page: an iframe,
                // matching the only real iframe-based pattern already
                // proven elsewhere in this codebase (Developer Hub,
                // Certification Dashboard) - not a new mechanism.
                const iframe = document.createElement("iframe");
                iframe.src = manifest.html;
                iframe.style.cssText = "width:100%;height:100%;border:0;";
                container.appendChild(iframe);
            } else {
                // Fragment - inject the real HTML directly into the container.
                container.innerHTML = htmlText;
            }

            this.#mount(appId, container, root, mode);
            this.#instances.set(appId, { container, cssLink, isStandalone, windowHandle: this.#lastWindowHandle });
            return { success: true, appId, isStandalone };
        }

        /**
         * #mount(appId, container, workspaceRoot, mode)
         *   Shared, real mounting logic composing the existing,
         *   unmodified WindowManager for "window"/"fullscreen" modes.
         *   Default "workspace" mode is byte-for-byte the same
         *   root.appendChild(container) behavior this file always had -
         *   confirmed no regression to existing callers, who never pass
         *   options and therefore always get "workspace".
         */
        #mount(appId, container, workspaceRoot, mode) {
            this.#lastWindowHandle = null;
            if (mode === "window" || mode === "fullscreen") {
                const wm = window.CozyOS.WindowManager;
                if (wm && typeof wm.create === "function") {
                    const handle = wm.create({ id: `app-${appId}`, title: appId, element: container, draggable: true, resizable: true, minimizable: true, maximizable: true, closable: true });
                    if (mode === "fullscreen") handle.maximize();
                    this.#lastWindowHandle = handle;
                    return;
                }
                // Honest fallback only if WindowManager somehow isn't
                // loaded - falls back to the real, existing workspace
                // mount rather than silently failing.
            }
            workspaceRoot.appendChild(container);
        }

        /** focus(appId) — real: brings the tracked instance to the front. Composes the real WindowManager.focus() when "window"/"fullscreen" mode was used (its own z-index arbitration owns that); falls back to the prior display-toggle behavior for plain workspace-mounted instances, unchanged. */
        focus(appId) {
            const entry = this.#instances.get(appId);
            if (!entry) return { success: false, reason: `"${appId}" is not currently open.` };
            if (entry.windowHandle && typeof entry.windowHandle.focus === "function") {
                entry.windowHandle.focus();
                return { success: true };
            }
            for (const [id, e] of this.#instances) if (!e.windowHandle) e.container.style.display = (id === appId) ? "" : "none";
            return { success: true };
        }

        /** close(appId) — real: removes the actual DOM container and injected CSS, stops tracking. Also closes the real WindowManager window if "window"/"fullscreen" mode was used - prevents an orphan window entry surviving after the application instance is gone. */
        close(appId) {
            const entry = this.#instances.get(appId);
            if (!entry) return { success: false, reason: `"${appId}" is not currently open.` };
            if (entry.jsModule && typeof entry.jsModule.destroy === "function") {
                try { entry.jsModule.destroy(); } catch (_err) { /* non-fatal - still remove the DOM below */ }
            }
            if (entry.windowHandle && typeof entry.windowHandle.close === "function") {
                entry.windowHandle.close(); // real WindowManager.close() also removes entry.container, since it's the window's own content
            } else {
                entry.container.remove();
            }
            if (entry.cssLink) entry.cssLink.remove();
            this.#instances.delete(appId);
            return { success: true };
        }

        listOpen() { return Array.from(this.#instances.keys()); }
        isOpen(appId) { return this.#instances.has(appId); }

        getVersion() { return "1.0.0"; }
        getId() { return "ApplicationLauncher"; }
    }

    window.CozyOS.ApplicationLauncher = new CozyApplicationLauncher();
})();
