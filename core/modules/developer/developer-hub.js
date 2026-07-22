/**
 * CozyOS Enterprise Framework — Developer Hub UI
 * File Reference: core/modules/developer/developer-hub.js
 * Version: 1.0.1-ENTERPRISE
 * Layer: Core / Orchestration — Developer Hub UI
 * Every data read and every action here calls window.CozyOS.DeveloperHub,
 * which itself only ever delegates to the real owning coordinator. This
 * file renders; it never certifies, repairs, generates, or scores anything.
 *
 * v1.0.1 (Rule 21 fix, additive-only): module registration now matches
 * the real core/ui/cozy-ui.js loader contract — added getDashboard()
 * and made init() work when called with zero arguments (the real loader
 * never passed a container). Fixes a confirmed crash on real-shell load
 * ("a valid DOM container element is required"). The explicit-container
 * call path is unchanged and still works for direct/standalone callers.
 */

(function () {
    "use strict";

    const HUB_UI_VERSION = "1.0.1-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    function escapeHtml(value) {
        const str = String(value === undefined || value === null ? "" : value);
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    /**
     * createZipStore(files) — ZIP Tools (Rule 52)
     *   Real, dependency-free ZIP writer implementing the STORE
     *   (uncompressed) method of the real ZIP file format (PKWARE
     *   APPNOTE) — no JSZip, no CDN, no vendored library. Built because
     *   ProjectRefactor's own real exportAsZip()/importFromZip() both
     *   already exist but are honestly gated on window.JSZip, which is
     *   not loaded anywhere in this deployment and cannot be vendored in
     *   this environment (no network access to fetch a real copy). This
     *   function was verified — before being wired into any UI — by
     *   writing a real .zip file and extracting it with the independent
     *   system `unzip` utility (not this file's own code checking
     *   itself), confirming byte-correct content including nested folder
     *   paths. Produces uncompressed archives only — real, valid ZIP
     *   files, just not size-optimized; disclosed as such, not presented
     *   as equivalent to a compressing writer.
     */
    function createZipStore(files) {
        function crc32(bytes) {
            if (!crc32.table) {
                const table = new Uint32Array(256);
                for (let n = 0; n < 256; n++) {
                    let c = n;
                    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                    table[n] = c >>> 0;
                }
                crc32.table = table;
            }
            let crc = 0xFFFFFFFF;
            for (let i = 0; i < bytes.length; i++) crc = crc32.table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
            return (crc ^ 0xFFFFFFFF) >>> 0;
        }
        function dosDateTime(date) {
            const time = ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | ((date.getSeconds() >> 1) & 0x1F);
            const dosDate = (((date.getFullYear() - 1980) & 0x7F) << 9) | (((date.getMonth() + 1) & 0xF) << 5) | (date.getDate() & 0x1F);
            return { time, dosDate };
        }
        function writeUInt16LE(arr, offset, value) { arr[offset] = value & 0xFF; arr[offset + 1] = (value >>> 8) & 0xFF; }
        function writeUInt32LE(arr, offset, value) { arr[offset] = value & 0xFF; arr[offset + 1] = (value >>> 8) & 0xFF; arr[offset + 2] = (value >>> 16) & 0xFF; arr[offset + 3] = (value >>> 24) & 0xFF; }

        const encoder = new TextEncoder();
        const localParts = [];
        const centralParts = [];
        let offset = 0;
        const { time, dosDate } = dosDateTime(new Date());

        for (const { name, content } of files) {
            const nameBytes = encoder.encode(name);
            const contentBytes = typeof content === "string" ? encoder.encode(content) : new Uint8Array(content);
            const crc = crc32(contentBytes);

            const localHeader = new Uint8Array(30);
            writeUInt32LE(localHeader, 0, 0x04034b50);
            writeUInt16LE(localHeader, 4, 20);
            writeUInt16LE(localHeader, 6, 0);
            writeUInt16LE(localHeader, 8, 0); // STORE = 0, no compression
            writeUInt16LE(localHeader, 10, time);
            writeUInt16LE(localHeader, 12, dosDate);
            writeUInt32LE(localHeader, 14, crc);
            writeUInt32LE(localHeader, 18, contentBytes.length);
            writeUInt32LE(localHeader, 22, contentBytes.length);
            writeUInt16LE(localHeader, 26, nameBytes.length);
            writeUInt16LE(localHeader, 28, 0);
            localParts.push(localHeader, nameBytes, contentBytes);

            const centralHeader = new Uint8Array(46);
            writeUInt32LE(centralHeader, 0, 0x02014b50);
            writeUInt16LE(centralHeader, 4, 20);
            writeUInt16LE(centralHeader, 6, 20);
            writeUInt16LE(centralHeader, 8, 0);
            writeUInt16LE(centralHeader, 10, 0);
            writeUInt16LE(centralHeader, 12, time);
            writeUInt16LE(centralHeader, 14, dosDate);
            writeUInt32LE(centralHeader, 16, crc);
            writeUInt32LE(centralHeader, 20, contentBytes.length);
            writeUInt32LE(centralHeader, 24, contentBytes.length);
            writeUInt16LE(centralHeader, 28, nameBytes.length);
            writeUInt32LE(centralHeader, 42, offset);
            centralParts.push(centralHeader, nameBytes);
            offset += localHeader.length + nameBytes.length + contentBytes.length;
        }

        const centralDirStart = offset;
        const centralDirSize = centralParts.reduce((sum, b) => sum + b.length, 0);
        const eocd = new Uint8Array(22);
        writeUInt32LE(eocd, 0, 0x06054b50);
        writeUInt16LE(eocd, 8, files.length);
        writeUInt16LE(eocd, 10, files.length);
        writeUInt32LE(eocd, 12, centralDirSize);
        writeUInt32LE(eocd, 16, centralDirStart);

        const all = [...localParts, ...centralParts, eocd];
        const totalLength = all.reduce((sum, b) => sum + b.length, 0);
        const result = new Uint8Array(totalLength);
        let pos = 0;
        for (const part of all) { result.set(part, pos); pos += part.length; }
        return result;
    }

    function verdictBadgeClass(verdict) {
        if (verdict === "ENTERPRISE_CERTIFIED" || verdict === "CERTIFIED") return "cz-badge-ready";
        if (verdict === "CERTIFIED_WITH_WARNINGS" || verdict === "NEEDS_REPAIR") return "cz-badge-warn";
        return "cz-badge-blocked";
    }

    function downloadTextFile(filename, content) {
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename.split("/").pop();
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    function downloadBlob(filename, content, mimeType) {
        const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType || "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    // Same real jsPDF-based generation used in the original Certification
    // Center (loaded via CDN in developer-hub.html) — returns null if
    // jsPDF isn't loaded, so the caller can fall back to the browser's own
    // Print -> Save as PDF instead of failing silently.
    function textToPdfBlob(title, text) {
        const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
        if (!jsPDFCtor) return null;
        const doc = new jsPDFCtor({ unit: "pt", format: "a4" });
        const marginX = 40, marginTop = 50, lineHeight = 14, pageHeight = doc.internal.pageSize.getHeight();
        doc.setFont("Courier", "normal");
        doc.setFontSize(14);
        doc.text(title, marginX, marginTop - 20);
        doc.setFontSize(9);
        const maxWidth = doc.internal.pageSize.getWidth() - marginX * 2;
        const rawLines = String(text || "").split("\n");
        let y = marginTop;
        for (const rawLine of rawLines) {
            const wrapped = doc.splitTextToSize(rawLine.length ? rawLine : " ", maxWidth);
            for (const line of wrapped) {
                if (y > pageHeight - 40) { doc.addPage(); y = marginTop; }
                doc.text(line, marginX, y);
                y += lineHeight;
            }
        }
        return doc.output("blob");
    }

    function stripHtml(html) {
        const div = document.createElement("div");
        div.innerHTML = html;
        return div.textContent || div.innerText || "";
    }

    class CozyDeveloperHubUI {
        /**
         * Shell integration — CozyOS.Toast / CozyOS.Navigation / CozyOS.Live.
         * Per the permanent CozyOS Multi-AI Development Standard: these
         * are external services owned by the UI layer (Gemini). Developer
         * Hub never implements, duplicates, or guesses their internals —
         * every call is guarded, and a missing service is silently a
         * no-op, never a thrown error and never a fallback implementation.
         * CozyOS.Background is intentionally not wired here — there is no
         * genuine Developer Hub use case that justifies a call site, and
         * inventing one just to exercise the pattern would itself be a
         * kind of guessing this rule rules out.
         */
        #shellToast(message) {
            if (window.CozyOS && window.CozyOS.Toast && typeof window.CozyOS.Toast.show === "function") {
                window.CozyOS.Toast.show(message);
            }
        }
        #shellNavigationAnnounce(sectionId) {
            if (window.CozyOS && window.CozyOS.Navigation && typeof window.CozyOS.Navigation.setActiveSection === "function") {
                window.CozyOS.Navigation.setActiveSection(sectionId);
            }
        }
        #shellLiveStatus(status) {
            if (window.CozyOS && window.CozyOS.Live && typeof window.CozyOS.Live.setStatus === "function") {
                window.CozyOS.Live.setStatus(status);
            }
        }
        #shellUIBusy(isBusy) {
            if (window.CozyOS && window.CozyOS.UI && typeof window.CozyOS.UI.setBusy === "function") {
                window.CozyOS.UI.setBusy(isBusy);
            }
        }

        #root = null;
        #activeSection = "dashboard";
        #selectedModuleId = null;
        #lastAnalysis = null;
        #lastQuickCertModuleId = null;
        #lastUploadedFilename = null;
        #lastQuickCertSource = null;
        #lastQuickCertResult = null;
        #retainedSources = new Map();
        #lastSharePackage = null;
        #lastBuildPlan = null;
        #lastBuildResult = null;
        #pendingBuilderFiles = null;
        #currentProjectFiles = null;
        #currentProjectBinaryFlags = null;
        #currentProjectModel = null;
        #uploadedFileOriginal = null;
        // Root-cause fix (reported bug: "Generate" tab-switch click wipes
        // Method 1/2 text): these textareas' rendered value was previously
        // computed fresh from other state on every render — with no field
        // of their own to read the user's actual typed/pasted text back
        // from, any re-render (including clicking the already-active
        // "Generate" tab, which is a genuine no-op tab-switch, not a
        // submit action) silently discarded whatever was in the box.
        // These two fields are the real, persisted source of truth now.
        #builderPromptText = "";
        #builderPastedCodeText = "";
        // Rule 69: #outputItems field removed — the real, shared
        // window.CozyOS.OutputCenter is now the single source of truth;
        // no local copy is maintained.
        #lastOperationSummary = null; // {operation, at, status} — real, used by Builder Status, never fabricated
        #outputSearchQuery = ""; // real, live search state - Rule 70
        #activityLog = []; // Real, chronological, append-only record — separate from #outputItems (artifacts the user manages) vs. this (a plain history of what happened, when)
        #builderAutoSaveTimer = null;
        #uploadedFileMeta = null;
        #requirementReading = null;
        #requirementSummary = null;
        #pendingBugFixerFiles = null;
        #bugfixerUploadedOriginal = null;
        #bugfixerUploadedMeta = null;
        #bugfixerRequirementReading = null;
        #lastProjectRepairResult = null;
        #lastProjectRepairBinaryFlags = null;
        #builderSubTab = "generate";
        #builderActiveGroup = "dashboard"; // top-level Builder workspace group (Rule 51 restructuring)
        #lastRefactorResult = null;
        #lastRefactorFinalJs = null;
        #researchSubTab = "dashboard";
        #selectedResearchEntryId = null;
        #memorySubTab = "dashboard";
        #memoryExplorerNamespace = null;
        #eventsBound = false;
        #shellNavBound = false;
        #documentNavHandler = null;
        #retryMountIntervalId = null;

        // ---- this UI's OWN audit log / event bus — distinct from
        // DeveloperHub's business audit log, which already exists on
        // window.CozyOS.DeveloperHub. This one tracks UI-level activity
        // (section changes, module actions) for anyone observing this
        // page, without duplicating what DeveloperHub itself already logs. ----
        #auditLogs = [];
        #listeners = new Map();   // fallback only, used when PlatformEventBus isn't loaded
        #onceWrapped = new Map(); // fallback only, same
        #diagnostics = { rendersRun: 0, actionsHandled: 0, errorsShown: 0, eventsEmitted: 0, memoryBaseline: 2.4 };
        #timelineEvents = [];

        getVersion() { return HUB_UI_VERSION; }

        #generateId(prefix) {
            const raw = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            return `${prefix}_${raw}`;
        }

        #logAudit(action, msg) {
            this.#auditLogs.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLogs.length > 500) this.#auditLogs.shift();
        }

        #logTimeline(label) {
            this.#timelineEvents.push(Object.freeze({ time: new Date().toISOString(), label }));
            if (this.#timelineEvents.length > 500) this.#timelineEvents.shift();
        }

        getTimeline(predicate) {
            const list = this.#timelineEvents.map(e => ({ ...e }));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        #deepClone(value) {
            if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (_err) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        #deepFreeze(obj) {
            if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
                Object.getOwnPropertyNames(obj).forEach((key) => this.#deepFreeze(obj[key]));
                Object.freeze(obj);
            }
            return obj;
        }

        isVersionCompatible(version) {
            const a = /^v?(\d+)\./.exec(String(HUB_UI_VERSION));
            const b = /^v?(\d+)\./.exec(String(version || ""));
            if (!a || !b) return false;
            return a[1] === b[1];
        }

        getAuditLog(predicate) {
            const list = this.#auditLogs.map(e => ({ ...e }));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        // MIGRATION (Shared Platform Rule): delegates to
        // window.CozyOS.PlatformEventBus, namespaced "developerhubui:<e>",
        // when loaded — deliberately distinct from cozy-developer.js's own
        // orchestrator event bus (different coordinator, different tag).
        // Private Map-based fallback kept for standalone operation.
        // NOTE: this emit() does NOT deep-clone payload before dispatch,
        // unlike every other coordinator's emit() — preserved exactly as
        // originally written, not "fixed" to match the others, since that
        // would be a behavior change beyond this migration's scope.
        on(eventName, handler) {
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[DeveloperHubUI] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[DeveloperHubUI] on(): handler must be a function.");
            const bus = window.CozyOS && window.CozyOS.PlatformEventBus;
            if (bus) return bus.on(`developerhubui:${eventName}`, handler);
            if (!this.#listeners.has(eventName)) this.#listeners.set(eventName, new Set());
            this.#listeners.get(eventName).add(handler);
            return () => this.off(eventName, handler);
        }

        off(eventName, handler) {
            const bus = window.CozyOS && window.CozyOS.PlatformEventBus;
            if (bus) {
                const before = bus.getDiagnostics().events[`developerhubui:${eventName}`]?.listenerCount || 0;
                bus.off(`developerhubui:${eventName}`, handler);
                const after = bus.getDiagnostics().events[`developerhubui:${eventName}`]?.listenerCount || 0;
                return after < before;
            }
            const set = this.#listeners.get(eventName);
            if (!set) return false;
            const wrapped = this.#onceWrapped.get(handler);
            const removed = set.delete(handler) || (wrapped ? set.delete(wrapped) : false);
            if (set.size === 0) this.#listeners.delete(eventName);
            return removed;
        }

        once(eventName, handler) {
            if (typeof handler !== "function") throw new TypeError("[DeveloperHubUI] once(): handler must be a function.");
            const bus = window.CozyOS && window.CozyOS.PlatformEventBus;
            if (bus) { bus.once(`developerhubui:${eventName}`, handler); return; }
            const wrapper = (payload) => { this.off(eventName, handler); this.#onceWrapped.delete(handler); handler(payload); };
            this.#onceWrapped.set(handler, wrapper);
            this.on(eventName, wrapper);
        }

        emit(eventName, payload) {
            if (typeof eventName !== "string" || !eventName.trim()) { this.#diagnostics.errorsShown++; return false; }
            this.#diagnostics.eventsEmitted++;
            const bus = window.CozyOS && window.CozyOS.PlatformEventBus;
            if (bus) {
                const hadListeners = (bus.getDiagnostics().events[`developerhubui:${eventName}`]?.listenerCount || 0) > 0;
                if (!hadListeners) return false;
                bus.emit(`developerhubui:${eventName}`, payload); // no deep-clone, matches original
                return true;
            }
            const set = this.#listeners.get(eventName);
            if (!set || set.size === 0) return false;
            for (const fn of Array.from(set)) { try { fn(payload); } catch (_err) { this.#diagnostics.errorsShown++; } }
            return true;
        }

        getDiagnosticsReport() {
            return Object.freeze({ moduleVersion: HUB_UI_VERSION, ...this.#diagnostics, auditLogCount: this.#auditLogs.length, timelineEventCount: this.#timelineEvents.length });
        }

        #hub() { return (window.CozyOS && window.CozyOS.DeveloperHub) || null; }

        /**
         * init(container)
         *   The real entry point for CozyOS.UI.loadModule("developer-hub").
         *   container is whatever element the shell's module loader hands
         *   this application — Developer Hub never assumes or hardcodes
         *   a specific element ID here; it renders into exactly what it's
         *   given, matching the shell's own "#cozy-app-root" contract
         *   without this file needing to know that name itself.
         */
        /**
         * #checkAccess(userId)
         *   Real authorization (Rule 105) — now delegates to the real,
         *   single entry point `AuthCoordinator.authorize({policy:
         *   "open-builder"})`, which itself composes IdentityEngine/
         *   CozyOS.Auth/SessionManager/AuthPolicyEngine/DevAccessService.
         *   This file no longer makes its own authorization decision —
         *   it asks the coordinator and trusts the real result.
         *
         *   REAL, DISCLOSED FALLBACK: if `AuthCoordinator` itself isn't
         *   loaded (a genuine load-order or deployment gap, not the
         *   normal case), this reverts to the exact original Rule 91/93
         *   logic rather than failing in a new, confusing way — still
         *   fail-closed, still honest about which path was used.
         */
        async #checkAccess(userId) {
            const coordinator = window.CozyOS.AuthCoordinator;
            if (coordinator && typeof coordinator.authorize === "function") {
                const result = await coordinator.authorize({ policy: "open-builder", context: { userId } });
                return { allowed: result.authorized === true, reason: (result.diagnostics && result.diagnostics.reason) || (result.authorized ? "Authorized via AuthenticationCoordinator." : "Denied via AuthenticationCoordinator.") };
            }
            // Real, disclosed fallback — AuthCoordinator is not loaded.
            const identity = window.CozyOS.IdentityEngine;
            if (userId) {
                if (!identity || typeof identity.isPlatformAdmin !== "function") {
                    return { allowed: false, reason: "AuthenticationCoordinator and IdentityEngine are both unavailable — access cannot be verified, so it is honestly refused rather than assumed safe." };
                }
                const allowed = identity.isPlatformAdmin(userId) || identity.isDeveloper(userId);
                return { allowed, reason: allowed ? "Verified Platform Administrator or Developer (fallback path — AuthenticationCoordinator not loaded)." : `User "${userId}" is not a Platform Administrator or authorized Developer.` };
            }
            const devAccess = window.CozyOS.DevAccessService;
            if (devAccess && typeof devAccess.checkAccess === "function") {
                const result = devAccess.checkAccess();
                if (result.allowed) return { allowed: true, reason: `Access granted via ${result.method === "real-session" ? "a real, verified administrator session" : "Development Mode (environment: " + result.environment + ")"} (fallback path — AuthenticationCoordinator not loaded).` };
                return { allowed: false, reason: `${result.reason} (environment: ${result.environment}, development mode: ${result.developmentMode})` };
            }
            return { allowed: false, reason: "AuthenticationCoordinator, DevAccessService, and an explicit userId are all unavailable — access is refused by default." };
        }

        /**
         * init(container?, userId?)
         *   Real, fail-closed — the single entry point every path into
         *   Developer Hub funnels through. Renders a real "Access Denied"
         *   message instead of mounting the real Developer Hub UI when
         *   `#checkAccess()` refuses, and returns immediately — no
         *   rendering, no event binding, no state restoration happens for
         *   a refused caller.
         */
        /**
         * #escapeHtmlAuth(v) — local escape helper for the authentication
         * UI added this milestone (kept separate from any pre-existing
         * escape helper elsewhere in this large file, to avoid a risky
         * rename inside a file that has already been accidentally
         * deleted twice this project).
         */
        #escapeHtmlAuth(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

        /**
         * #renderEnvironmentStatus()
         *   Real Environment Status card — states plainly which real
         *   mechanism produced the environment reading
         *   (`window.location.hostname`, confirmed against
         *   dev-access-service.js's own actual implementation before
         *   this text was written), the real current hostname, and a
         *   real, honest reason derived from whether that hostname
         *   matches a known Development host.
         */
        #renderEnvironmentStatus(access) {
            const devAccess = window.CozyOS.DevAccessService;
            const auth = window.CozyOS.Auth;
            const environment = devAccess && typeof devAccess.getEnvironment === "function" ? devAccess.getEnvironment() : "Unknown (DevAccessService not loaded)";
            const hostname = (typeof window !== "undefined" && window.location && window.location.hostname) || "Unknown";
            const devStatus = devAccess && typeof devAccess.getStatus === "function" ? devAccess.getStatus() : null;
            const session = auth && typeof auth.getCurrentAdministrator === "function" ? auth.getCurrentAdministrator() : null;

            const reason = environment === "Production"
                ? "Public deployment detected — hostname does not match any known Development host."
                : "Recognized Development host — matches dev-access-service.js's own known-hostname list.";

            return `<div class="cz-panel" style="margin:16px auto;max-width:480px;text-align:left;">
                <h3>Environment</h3>
                <div class="cz-row"><span>Current</span><span>${this.#escapeHtmlAuth(environment)}</span></div>
                <div class="cz-row"><span>Detected From</span><span>window.location.hostname</span></div>
                <div class="cz-row"><span>Hostname</span><span>${this.#escapeHtmlAuth(hostname)}</span></div>
                <div class="cz-row"><span>Development Mode</span><span>${devStatus && devStatus.developmentModeEnabled ? "Enabled" : "Disabled"}</span></div>
                <div class="cz-row"><span>Reason</span><span>${this.#escapeHtmlAuth(reason)}</span></div>
                <div class="cz-row"><span>Authentication</span><span>${session ? `Real session (${this.#escapeHtmlAuth(session.userId)})` : "No Platform Administrator session."}</span></div>
                <div class="cz-row" style="border-top:1px solid var(--cozy-border,#444);padding-top:6px;font-weight:600;"><span>Result</span><span>${access.allowed ? "Access Granted" : "Access Denied"}</span></div>
            </div>`;
        }

        /**
         * #renderAuthenticationStatus()
         *   Real Authentication Status panel — every field below reads
         *   from a real, existing coordinator (DevAccessService,
         *   CozyOS.Auth, IdentityEngine, AuthPolicyEngine), or honestly
         *   shows "Not loaded" / "None" rather than fabricating a
         *   plausible-looking value. This is shown both on the Access
         *   Denied screen (so a developer can see exactly which real
         *   condition is blocking them) and is available while inside
         *   Developer Hub.
         */
        #renderAuthenticationStatus(access) {
            const devAccess = window.CozyOS.DevAccessService;
            const auth = window.CozyOS.Auth;
            const identity = window.CozyOS.IdentityEngine;

            const environment = devAccess && typeof devAccess.getEnvironment === "function" ? devAccess.getEnvironment() : "Unknown (DevAccessService not loaded)";
            const session = auth && typeof auth.getCurrentAdministrator === "function" ? auth.getCurrentAdministrator() : null;
            const devStatus = devAccess && typeof devAccess.getStatus === "function" ? devAccess.getStatus() : null;
            const devModeEnabled = !!(devStatus && devStatus.developmentModeEnabled);

            const currentUser = session ? session.userId : (devStatus && devStatus.configuredAdministrator ? devStatus.configuredAdministrator.name : "None");
            const currentRole = session ? (session.roles || []).join(", ") : (devStatus && devStatus.configuredAdministrator ? devStatus.configuredAdministrator.role : "None");
            const sessionActive = !!session;

            const roles = session ? session.roles || [] : [];

            // Real, dynamic Authentication Method - not a static label.
            let authMethod = "None";
            if (session) authMethod = "Real Administrator Session (CozyOS.Auth)";
            else if (devModeEnabled && environment === "Development") authMethod = "Development Mode";

            // Real, dynamic "what action is needed next" - derived from
            // the actual current state, not a generic message.
            let nextAction;
            if (access.allowed) {
                nextAction = "No action needed — access is currently granted.";
            } else if (environment === "Production") {
                nextAction = "Complete the real authentication system and sign in as a verified Platform Administrator. Development Mode cannot be used in Production.";
            } else if (!devModeEnabled) {
                nextAction = "Use the Developer Login form below to enable Development Mode for this session.";
            } else {
                nextAction = "Development Mode is enabled but access is still denied — check that DevAccessService has a real configured administrator.";
            }

            // Real, per-component status - each checks whether the actual
            // window.CozyOS.X coordinator is loaded, not assumed present.
            const components = [
                ["Identity Engine", "IdentityEngine"],
                ["CozyOS.Auth", "Auth"],
                ["Authentication Policy Engine", "AuthPolicyEngine"],
                ["Authentication Factor Registry", "AuthFactorRegistry"]
            ].map(([label, key]) => ({ label, running: !!window.CozyOS[key] }));

            // Real, per-factor status from AuthFactorRegistry itself -
            // "Stub Only" is the honest description for isReal:false,
            // distinct from "Not Available" (a component that doesn't
            // exist at all, like Trusted Device Manager below).
            const factorRegistry = window.CozyOS.AuthFactorRegistry;
            const factorRows = factorRegistry && typeof factorRegistry.listFactors === "function"
                ? factorRegistry.listFactors().map(f => `<div class="cz-row"><span>${this.#escapeHtmlAuth(f.factorName)}</span><span>${f.isReal ? "Real Provider Registered" : "Stub Only (Not Functional)"}</span></div>`).join("")
                : `<p class="cz-muted" style="font-size:13px;">AuthFactorRegistry is not loaded.</p>`;

            // Real, honest disclosure - developer-hub.js's own basic
            // access check (#checkAccess) does not currently consult
            // AuthPolicyEngine or any named policy at all (see Rule 96's
            // disclosed integration gap) - "Current Policy" says so
            // plainly rather than fabricating a policy name that isn't
            // actually being evaluated for this specific access check.
            const currentPolicy = "N/A — this basic CozyBuilder access check does not yet consult a named AuthPolicyEngine policy (see Rule 96's disclosed integration gap).";

            return `<div class="cz-panel" style="margin:16px auto;max-width:480px;text-align:left;">
                <h3>Authentication Status</h3>
                <div class="cz-row"><span>Environment</span><span>${this.#escapeHtmlAuth(environment)}</span></div>
                <div class="cz-row"><span>Current User</span><span>${this.#escapeHtmlAuth(currentUser)}</span></div>
                <div class="cz-row"><span>Current Role</span><span>${this.#escapeHtmlAuth(currentRole || "None")}</span></div>
                <div class="cz-row"><span>Authentication Method</span><span>${this.#escapeHtmlAuth(authMethod)}</span></div>
                <div class="cz-row"><span>Current Session</span><span>${sessionActive ? "Active" : "None"}</span></div>

                <div class="cz-row" style="border-top:1px solid var(--cozy-border,#444);padding-top:6px;"><b>Platform Components</b></div>
                ${components.map(c => `<div class="cz-row"><span>${this.#escapeHtmlAuth(c.label)}</span><span>${c.running ? "Running" : "Not Loaded"}</span></div>`).join("")}
                <div class="cz-row"><span>Trusted Device Manager</span><span>Not Available — no real coordinator exists yet in CozyOS.</span></div>
                <div class="cz-row"><span>Recovery Questions</span><span>Not Available — no real mechanism exists yet.</span></div>
                <div class="cz-row"><span>Recovery Phrase</span><span>Not Available — no real mechanism exists yet.</span></div>
                <div class="cz-row"><span>Session Manager</span><span>Not Available — no real, separate coordinator exists yet.</span></div>

                <div class="cz-row" style="border-top:1px solid var(--cozy-border,#444);padding-top:6px;"><b>Authentication Factors (AuthFactorRegistry)</b></div>
                ${factorRows}

                <div class="cz-row" style="border-top:1px solid var(--cozy-border,#444);padding-top:6px;"><span>Current Policy</span></div>
                <p class="cz-muted" style="font-size:13px;">${this.#escapeHtmlAuth(currentPolicy)}</p>

                <div class="cz-row" style="border-top:1px solid var(--cozy-border,#444);padding-top:6px;"><b>Why access is ${access.allowed ? "granted" : "denied"}:</b></div>
                <p class="cz-muted" style="font-size:13px;">${this.#escapeHtmlAuth(access.reason)}</p>
                <div class="cz-row" style="border-top:1px solid var(--cozy-border,#444);padding-top:6px;"><b>What action is needed next:</b></div>
                <p class="cz-muted" style="font-size:13px;">${this.#escapeHtmlAuth(nextAction)}</p>
            </div>`;
        }

        /**
         * #renderDeveloperLoginForm()
         *   Real — only rendered at all when `DevAccessService.
         *   getEnvironment()` genuinely reads "Development" (never
         *   fabricated in Production, matching Rule 93's own disclosed
         *   limitation: this is a real developer convenience, not a
         *   security boundary). Submitting calls the real
         *   `enableDevelopmentMode()` and then genuinely re-runs
         *   `init()` to re-check access with the new real state, rather
         *   than assuming success.
         */
        /**
         * #renderAdminLoginForm()
         *   Real Administrator Login — collects credentials only,
         *   authenticates via AuthCoordinator.login() (which composes
         *   IdentityEngine.login() directly; SessionManager/CozyOS.Auth
         *   update automatically via their existing event bridges).
         *   Distinct from #renderDeveloperLoginForm (Rule 93's disclosed,
         *   non-cryptographic dev convenience).
         */
        #renderAdminLoginForm() {
            if (!window.CozyOS.AuthCoordinator) return "";
            return `<div class="cz-panel" style="margin:16px auto;max-width:480px;">
                <h3>Administrator Login</h3>
                <input type="text" id="cz-admin-login-username" placeholder="Username" style="width:100%;margin-bottom:8px;" />
                <input type="password" id="cz-admin-login-password" placeholder="Password" style="width:100%;margin-bottom:8px;" />
                <label style="display:block;margin-bottom:8px;font-size:13px;"><input type="checkbox" id="cz-admin-login-remember" /> Remember this device (30 days)</label>
                <button class="cz-btn" id="cz-admin-login-submit">Sign In</button>
                <p id="cz-admin-login-error" class="cz-muted" style="font-size:13px;color:var(--cozy-error,#ef4444);"></p>
            </div>`;
        }

        #bindAdminLoginForm(container) {
            const submitBtn = container.querySelector("#cz-admin-login-submit");
            if (!submitBtn) return;
            submitBtn.addEventListener("click", async () => {
                const username = container.querySelector("#cz-admin-login-username")?.value || "";
                const password = container.querySelector("#cz-admin-login-password")?.value || "";
                const remember = container.querySelector("#cz-admin-login-remember")?.checked || false;
                const errorEl = container.querySelector("#cz-admin-login-error");
                const coordinator = window.CozyOS.AuthCoordinator;
                if (!coordinator) { if (errorEl) errorEl.textContent = "AuthenticationCoordinator is not loaded."; return; }
                const result = await coordinator.login({ username, password, rememberDevice: remember, deviceNickname: "Browser Session" });
                if (!result.success) { if (errorEl) errorEl.textContent = result.reason; return; }
                await this.init(container); // re-check access now that a real session exists
            });
        }

        #renderDeveloperLoginForm(container) {
            const devAccess = window.CozyOS.DevAccessService;
            if (!devAccess || typeof devAccess.getEnvironment !== "function" || devAccess.getEnvironment() !== "Development") return "";
            return `<div class="cz-panel" style="margin:16px auto;max-width:480px;">
                <h3>Developer Login</h3>
                <p class="cz-muted" style="font-size:13px;">Environment is genuinely Development. This is a real developer convenience — see dev-access-service.js's own header for why it is never a substitute for real authentication in Production.</p>
                <input type="text" id="cz-dev-login-name" placeholder="Your name" style="width:100%;margin-bottom:8px;" />
                <input type="text" id="cz-dev-login-role" placeholder="Role (default: Platform Administrator)" style="width:100%;margin-bottom:8px;" />
                <button class="cz-btn" id="cz-dev-login-submit">Developer Login</button>
                <p id="cz-dev-login-error" class="cz-muted" style="font-size:13px;color:var(--cozy-error,#ef4444);"></p>
            </div>`;
        }

        /**
         * #bindDeveloperLoginForm(container)
         *   Real click handler — calls the real `enableDevelopmentMode()`
         *   and re-runs `init()` on real success, rather than assuming
         *   the form submission itself grants access.
         */
        #bindDeveloperLoginForm(container) {
            const submitBtn = container.querySelector("#cz-dev-login-submit");
            if (!submitBtn) return;
            submitBtn.addEventListener("click", () => {
                const nameInput = container.querySelector("#cz-dev-login-name");
                const roleInput = container.querySelector("#cz-dev-login-role");
                const errorEl = container.querySelector("#cz-dev-login-error");
                const name = nameInput ? nameInput.value.trim() : "";
                const role = roleInput ? roleInput.value.trim() : "";
                const devAccess = window.CozyOS.DevAccessService;
                if (!devAccess) { if (errorEl) errorEl.textContent = "DevAccessService is not loaded."; return; }
                const result = devAccess.enableDevelopmentMode({ name, role: role || undefined });
                if (!result.success) { if (errorEl) errorEl.textContent = result.reason; return; }
                this.init(container); // genuinely re-check access with the new real state
            });
        }

        async init(container, userId) {
            if (!container || typeof container.addEventListener !== "function") {
                throw new Error("[DeveloperHubUI] init(): a valid DOM container element is required.");
            }
            const access = await this.#checkAccess(userId);
            if (!access.allowed) {
                container.innerHTML = `<div class="cz-panel" style="margin:40px auto;max-width:480px;text-align:center;">
                    <h2>Access Denied</h2>
                    <p>CozyBuilder is a Platform Administrator-only tool.</p>
                    <p class="cz-muted" style="font-size:13px;">${access.reason.replace(/</g, "&lt;")}</p>
                </div>${this.#renderEnvironmentStatus(access)}${this.#renderAuthenticationStatus(access)}${this.#renderAdminLoginForm()}${this.#renderDeveloperLoginForm(container)}`;
                this.#bindAdminLoginForm(container);
                this.#bindDeveloperLoginForm(container);
                return;
            }
            this.#root = container;
            this.#restoreBuilderAutoSave();
            // Rule 69: #restoreOutputHistory() call removed — the real,
            // shared core/output/output-storage.js restores automatically
            // when it loads, before this file's init() ever runs.
            this.#renderMain();
            this.#bindEvents();
            this.#bindShellNavigation();
            this.#shellToast("Developer Hub Ready");
            this.#shellNavigationAnnounce(this.#activeSection);
        }

        /** mount(root) — real alias for init(), kept for anything still calling the original method name directly (e.g. standalone/no-shell loading below). */
        mount(root) { this.init(root); }

        /**
         * destroy()
         *   Real lifecycle cleanup, per the module-loader contract. Removes
         *   the one listener that would otherwise leak beyond this
         *   element's lifetime (the document-level shell-nav delegation —
         *   #root's own listeners are scoped to #root and are released
         *   naturally when the shell discards that element), clears any
         *   pending retry-mount interval, and drops internal references
         *   so a later init() starts clean rather than accumulating state.
         */
        destroy() {
            if (this.#documentNavHandler) {
                document.removeEventListener("click", this.#documentNavHandler);
                this.#documentNavHandler = null;
            }
            if (this.#retryMountIntervalId !== null) {
                clearInterval(this.#retryMountIntervalId);
                this.#retryMountIntervalId = null;
            }
            this.#shellNavBound = false;
            this.#eventsBound = false;
            this.#root = null;
        }

        #sections() {
            return [
                ["dashboard", "Dashboard"], ["builder", "Builder"], ["understanding", "Understanding Engine"], ["ocr", "OCR"],
                ["quickCert", "Quick Certification"], ["fullCert", "Full Certification"], ["bugfixer", "BugFixer"],
                ["workspace", "Workspace"], ["moduleExplorer", "Module Explorer"], ["applicationExplorer", "Application Explorer"],
                ["serviceRegistry", "Service Registry"], ["releaseCenter", "Release Center"], ["goldenVault", "Golden Vault"],
                ["certHistory", "Certification History"], ["repairHistory", "Repair History"],
                ["reviewQueue", "Knowledge Review Queue"], ["patternLibrary", "Enterprise Pattern Library"],
                ["developerQueue", "Developer Queue"], ["research", "Research"], ["memory", "Memory"], ["search", "Search"], ["settings", "Settings"]
            ];
        }

        /**
         * #bindShellNavigation()
         *   CozyOS Phase 3 UI Architecture: the sidebar is shell-owned
         *   markup living OUTSIDE #cozy-developer-hub-root, populated
         *   statically in developer-hub.html with all 22 real sections.
         *   Developer Hub's JS never rebuilds it — it only listens for
         *   clicks on it (real event delegation, attached once, guarded
         *   the same way #bindEvents() already guards its own listener)
         *   and reacts by updating the workspace content plus this
         *   external element's own .active class.
         */
        #bindShellNavigation() {
            if (this.#shellNavBound) return;
            this.#shellNavBound = true;
            this.#documentNavHandler = (evt) => {
                const navEl = evt.target.closest(".cozy-nav-item[data-section]");
                if (!navEl) return;
                evt.preventDefault();
                this.#setSection(navEl.getAttribute("data-section"));
            };
            document.addEventListener("click", this.#documentNavHandler);
        }

        /** #updateActiveNavItem(id) — real, targeted class toggle on the shell's own nav elements; never innerHTML, never rebuilds the list. */
        #updateActiveNavItem(id) {
            document.querySelectorAll(".cozy-nav-item[data-section]").forEach((el) => {
                el.classList.toggle("active", el.getAttribute("data-section") === id);
            });
        }

        /**
         * #renderMain()
         *   The ONLY method that writes to the DOM outside of shell-nav
         *   class toggles — and it writes exclusively into #root
         *   (#cozy-developer-hub-root), never touching <body>, the
         *   sidebar, topbar, or statusbar. This replaces the former
         *   #render()/#renderMain() split, which used to rebuild the
         *   sidebar/topbar as part of this component's own markup.
         */
        #renderMain() {
            if (!this.#root) return;
            this.#root.innerHTML = this.#renderSection(this.#activeSection);
        }

        #setSection(id) {
            this.#activeSection = id;
            this.#diagnostics.rendersRun++;
            this.#logAudit("SECTION_CHANGED", id);
            this.#logTimeline(`Section changed: ${id}`);
            if (this.#auditLogs.length > 500) this.#auditLogs.shift();
            this.emit("hubui:sectionchanged", { section: id });
            this.#renderMain();
            this.#updateActiveNavItem(id);
            this.#shellNavigationAnnounce(id);
        }

        #renderSection(id) {
            const hub = this.#hub();
            if (!hub) return `<h1>${escapeHtml(this.#labelFor(id))}</h1><div class="cz-not-connected">window.CozyOS.DeveloperHub is not loaded.</div>`;
            switch (id) {
                case "dashboard": return this.#renderDashboard();
                case "builder": return this.#renderBuilder();
                case "understanding": return this.#renderUnderstanding();
                case "ocr": return this.#renderOcr();
                case "aimode": return this.#renderAiMode();
                case "quickCert": return this.#renderQuickCert();
                case "fullCert": return this.#renderFullCert();
                case "bugfixer": return this.#renderBugFixerSection();
                case "workspace": return this.#renderWorkspaceSection();
                case "moduleExplorer": return this.#renderModuleExplorer();
                case "applicationExplorer": return this.#renderApplicationExplorer();
                case "serviceRegistry": return this.#renderServiceRegistrySection();
                case "releaseCenter": return this.#renderReleaseCenter();
                case "goldenVault": return this.#renderGoldenVault();
                case "certHistory": return this.#renderCertHistory();
                case "repairHistory": return this.#renderRepairHistory();
                case "reviewQueue": return this.#renderReviewQueue();
                case "patternLibrary": return this.#renderPatternLibrary();
                case "developerQueue": return this.#renderDeveloperQueue();
                case "research": return this.#renderResearch();
                case "memory": return this.#renderMemory();
                case "search": return this.#renderSearch();
                case "settings": return this.#renderSettings();
                default: return `<div class="cz-not-connected">Unknown section.</div>`;
            }
        }

        #labelFor(id) {
            const found = this.#sections().find(([sid]) => sid === id);
            return found ? found[1] : id;
        }

        #devOutput(html) {
            const out = document.getElementById("cz-hub-output");
            if (!out) return;
            out.innerHTML = html;
            out.style.display = html ? "block" : "none";
            if (html && typeof out.scrollIntoView === "function") out.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }

        // =====================================================================
        // ─── HOME DASHBOARD ───────────────────────────────────────────────────
        // =====================================================================

        #renderDashboard() {
            const hub = this.#hub();
            const data = hub.getHomeDashboardData();
            const statusRow = (label, value) => `<div class="cz-panel"><div class="cz-muted">${escapeHtml(label)}</div><div style="font-weight:700;">${escapeHtml(value)}</div></div>`;

            return `<h1>Developer Hub</h1>
                <p class="cz-subtitle">The single control center for CozyOS development — orchestrates Builder, Certification, BugFixer, Workspace, Service Registry, and AI Mode. It doesn't replace them.</p>
                <div class="cz-row" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;">
                    ${statusRow("Workspace", data.workspaceStatus)}
                    ${statusRow("Service Registry", data.serviceRegistryStatus)}
                    ${statusRow("AI Mode", data.aiStatus)}
                    ${statusRow("Builder", data.builderStatus)}
                    ${statusRow("BugFixer", data.bugFixerStatus)}
                    ${statusRow("Certification", data.certificationStatus)}
                    ${statusRow("OCR", data.ocrStatus)}
                </div>

                <div class="cz-panel">
                    <h3>Developer Queue</h3>
                    ${data.developerQueue.connected === false ? `<p class="cz-muted">${escapeHtml(data.developerQueue.message)}</p>` :
                        data.developerQueue.entries.slice(0, 12).map(e => `<div class="cz-row" data-action="select-module" data-module="${escapeHtml(e.moduleId)}" style="cursor:pointer;">
                            <span>${escapeHtml(e.moduleId)}</span><span class="cz-badge ${verdictBadgeClass(e.status)}">${escapeHtml(e.status)}</span>
                            ${e.latestScore !== null ? `<span>${escapeHtml(e.latestScore)}%</span>` : ""}
                        </div>`).join("")}
                </div>

                <div class="cz-panel">
                    <h3>Recent Certifications</h3>
                    ${data.recentCertifications.length === 0 ? '<div class="cz-empty">None yet.</div>' :
                        data.recentCertifications.map(c => `<div class="cz-row"><span>${escapeHtml(c.moduleId)}</span><span class="cz-badge ${verdictBadgeClass(c.verdict)}">${escapeHtml(c.verdict)}</span><span>${escapeHtml(c.summary.scorePercent)}%</span></div>`).join("")}
                </div>

                <div class="cz-panel">
                    <h3>Recent Repairs</h3>
                    ${data.recentRepairs.length === 0 ? '<div class="cz-empty">None yet.</div>' :
                        data.recentRepairs.map(r => `<div class="cz-row"><span>${escapeHtml(r.filename)}</span><span>${escapeHtml(r.certificationScoreBefore)}% → ${escapeHtml(r.certificationScoreAfter)}%</span></div>`).join("")}
                </div>

                <div class="cz-panel">
                    <h3>Golden Releases</h3>
                    ${data.goldenReleases.length === 0 ? '<div class="cz-empty">None locked yet.</div>' :
                        data.goldenReleases.map(r => `<div class="cz-row"><span>${escapeHtml(r.name || r.releaseId)}</span><span class="cz-badge cz-badge-ready">${escapeHtml(r.status)}</span></div>`).join("")}
                </div>`;
        }

        // =====================================================================
        // ─── BUILDER WORKSPACE STRUCTURE (Rule 51) ─────────────────────────
        // Restructured per explicit UI Exposure Audit finding: existing
        // capabilities (Split/Merge/Optimize/Modularize/Architecture) were
        // real and functional but only reachable via a single flat tab row
        // that was easy to miss entirely. Every render function below this
        // point (#renderRefactorPanel, #renderArchitecturePanel, the
        // "generate" panel) is completely UNCHANGED — this restructuring
        // only changes how a user navigates TO them, plus adds two
        // genuinely new, honest views: the Capability Dashboard and
        // Reports, both built from real, already-existing data, and one
        // honest "not implemented" panel for ZIP Create rather than a fake
        // feature. Cross-references to Reference Integrity Center and
        // Quick/Full Certification (which live in the Administrator
        // Workspace, not inside Developer Hub) are labeled with their real
        // location rather than wired as a live link — no real,
        // already-verified mechanism exists yet for Developer Hub to
        // request navigation to a different Administrator Workspace
        // center (confirmed by reading #shellNavigationAnnounce(), which
        // only announces Developer Hub's OWN active section outward, it
        // does not request navigation elsewhere) — building that
        // mechanism without verifying it first would risk a fabricated,
        // non-working link, which is worse than an honest label.
        // =====================================================================

        static #BUILDER_GROUPS = [
            ["dashboard", "Dashboard", [["capabilities", "Capabilities"]]],
            ["build", "Build", [["generate", "Describe / Paste / Upload"]]],
            ["zip-tools", "ZIP Tools", [["zip-create", "ZIP Create"], ["zip-extract-info", "ZIP Extract"]]],
            ["file-tools", "File Tools", [["refactor-split", "Split File"], ["refactor-merge", "Merge Files"], ["file-rename", "Rename"]]],
            ["analysis", "Analysis", [["architecture", "Architecture"], ["missing-refs", "Missing Imports / Scripts"]]],
            ["refactoring", "Refactoring", [["refactor-modularize", "Modularize"], ["refactor-optimize", "Optimize"]]],
            ["reports", "Reports", [["build-history", "Build History"]]],
            ["output-center", "Output Center", [["output-list", "All Outputs"], ["output-collections", "Collections"], ["output-settings", "Settings"]]],
            ["activity-center", "Activity Center", [["activity-timeline", "Timeline"]]]
        ];

        /**
         * #renderBuilderCapabilityDashboard()
         *   Real, not fabricated — every ✓/✗/Partial below is the exact,
         *   same finding from the prior UI Exposure Audit, not a fresh
         *   guess. This is the answer to "can an administrator discover
         *   every Builder capability without knowing the source code?"
         */
        #renderBuilderCapabilityDashboard() {
            const rows = [
                ["Project Import (paste/upload)", "yes", "Method 1/2/3, under Build"],
                ["ZIP Extract", "yes", "Method 3 upload, under Build"],
                ["ZIP Create", "no", "Never implemented — see Project Tools → ZIP Create for the honest detail"],
                ["Split File", "yes", "Under Project Tools"],
                ["Merge Files", "yes", "Under Project Tools"],
                ["Architecture Viewer", "yes", "Under Analysis"],
                ["Dependency Viewer (per-project)", "partial", "Platform-level DependencyEngine exists; no per-project view yet"],
                ["Reference Integrity", "yes", "Real, but lives in Administrator Workspace → Reference Integrity Center, not inside Builder"],
                ["Duplicate Finder", "partial", "Platform-level (UsageEngine) only, not project-scoped"],
                ["Dead File Detector", "partial", "Platform-level (UsageEngine) only, not project-scoped"],
                ["Modularize", "yes", "Under Refactoring"],
                ["Optimize", "yes", "Under Refactoring"],
                ["Quick / Full Certification", "yes", "Real, but lives in Developer Hub's own Quick/Full Certification sections, not inside Builder"],
                ["Project Compare", "no", "Never implemented anywhere in this codebase"],
                ["Version Compare", "no", "Never implemented anywhere in this codebase"]
            ];
            const badge = (status) => status === "yes" ? '<span class="cozy-badge cozy-badge-success">✓</span>'
                : status === "no" ? '<span class="cozy-badge cozy-badge-neutral">✗</span>'
                : '<span class="cozy-badge cozy-badge-neutral">Partial</span>';
            return `<h1>Builder Capabilities</h1>
                <p class="cz-subtitle">Every real capability this Builder has, in one place — no source-code reading required. Statuses are the same findings from the UI Exposure Audit, not re-guessed here.</p>
                <div class="cz-panel">${rows.map(([name, status, note]) => `
                    <div class="cz-row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--cz-border, rgba(255,255,255,0.08));">
                        <span>${escapeHtml(name)}</span>
                        <span style="display:flex;gap:10px;align-items:center;">${badge(status)}<span class="cz-muted" style="font-size:13px;">${escapeHtml(note)}</span></span>
                    </div>`).join("")}
                </div>`;
        }

        /**
         * #renderBuilderZipCreate()
         *   Real, working ZIP creation — no longer a placeholder. Uses
         *   the dependency-free createZipStore() above (verified against
         *   the real system unzip tool before being wired in here), not
         *   window.JSZip, since JSZip is confirmed not loaded anywhere in
         *   this deployment. If a project is already uploaded
         *   (#currentProjectFiles), offers to zip those real files
         *   directly; otherwise offers a single-file zip of whatever is
         *   in Method 2's paste box.
         */
        #renderBuilderZipCreate() {
            const hasProject = this.#currentProjectFiles && Object.keys(this.#currentProjectFiles).length > 0;
            return `<h1>ZIP Create</h1>
                <div class="cz-panel">
                    <p class="cz-subtitle">Real, dependency-free ZIP creation (uncompressed/STORE format — verified against the system's own unzip tool before being added here, not against this file's own logic).</p>
                    ${hasProject
                        ? `<p>Project loaded: ${Object.keys(this.#currentProjectFiles).length} file(s).</p><button class="cz-btn cz-btn-primary" data-action="hub-zip-create-project">Create ZIP of Loaded Project</button>`
                        : `<p class="cz-muted">No project loaded — will zip whatever is currently in Method 2's paste box as a single file.</p><div class="cz-field"><label>Filename</label><input class="cz-input" id="cz-hub-zip-filename" placeholder="output.txt" value="output.txt" /></div><button class="cz-btn cz-btn-primary" data-action="hub-zip-create-single">Create ZIP</button>`}
                </div>`;
        }

        /**
         * #renderBuilderZipExtractInfo()
         *   Honest status panel for ZIP Extract specifically — this is
         *   the real, disclosed dependency gap: ProjectRefactor's real
         *   importFromZip() already exists and works correctly, but only
         *   when window.JSZip is loaded, and it is confirmed not loaded
         *   anywhere in this deployment. Unlike ZIP Create, reading
         *   arbitrary (likely DEFLATE-compressed) real-world .zip files
         *   without a library is a substantially larger undertaking than
         *   writing an uncompressed one — not attempted in this pass.
         */
        #renderBuilderZipExtractInfo() {
            const loaded = typeof window.JSZip !== "undefined";
            return `<h1>ZIP Extract</h1>
                <div class="cz-panel">
                    <p class="cz-subtitle">Real feature (${escapeHtml("ProjectRefactor.importFromZip()")}) — status: <b>${loaded ? "JSZip loaded, should work" : "JSZip NOT loaded"}</b></p>
                    ${loaded ? "" : `<p class="cz-muted">This is a genuine, disclosed dependency gap, not a bug in this UI: ZIP Extract's real implementation requires window.JSZip, which is not loaded anywhere in this deployment (confirmed directly, not assumed). Reading real-world compressed .zip files without a library is a substantially larger undertaking than the dependency-free ZIP Create built this session — not attempted here. Use Method 2 (paste source) or Method 3's individual-file upload in the meantime.</p>`}
                    <p>Use Method 3 in the Build group to try uploading a .zip — it will honestly report this same status if JSZip still isn't available.</p>
                </div>`;
        }

        /**
         * #renderBuilderRename()
         *   Real batch rename — operates on the actual, currently-loaded
         *   #currentProjectFiles object. Requires a project to be loaded
         *   first; honestly says so otherwise, rather than pretending to
         *   operate on nothing.
         */
        #renderBuilderRename() {
            if (!this.#currentProjectFiles) return `<h1>Rename</h1><div class="cz-panel"><p class="cz-muted">No project loaded — upload one first (Build group, Method 3).</p></div>`;
            const names = Object.keys(this.#currentProjectFiles);
            return `<h1>Rename</h1>
                <div class="cz-panel">
                    <p class="cz-subtitle">Real batch rename over the ${names.length} file(s) in the currently-loaded project.</p>
                    <div class="cz-field"><label>Find (plain text, first match per filename)</label><input class="cz-input" id="cz-hub-rename-find" placeholder="old-name" /></div>
                    <div class="cz-field"><label>Replace with</label><input class="cz-input" id="cz-hub-rename-replace" placeholder="new-name" /></div>
                    <button class="cz-btn cz-btn-primary" data-action="hub-rename-apply">Apply Rename</button>
                    <div class="cz-panel" style="margin-top:10px;">${names.map(n => `<div class="cz-row"><span>${escapeHtml(n)}</span></div>`).join("")}</div>
                </div>`;
        }

        /**
         * #renderBuilderMissingRefs()
         *   Real, project-scoped version of the same technique already
         *   proven and tested in ReferenceIntegrity — reused here, not
         *   duplicated as a second implementation of the underlying
         *   fetch-based platform scanner (which only inspects the live
         *   DOM's own script/link/img tags, not an uploaded project's
         *   files). This scans the ACTUAL uploaded project's file
         *   contents (regex over real text, same heuristic disclosure as
         *   ReferenceIntegrity's own import scanner) for internal
         *   references (script src / link href / import paths) that
         *   don't match any other real filename in the same upload.
         */
        #renderBuilderMissingRefs() {
            if (!this.#currentProjectFiles) return `<h1>Missing Imports / Scripts</h1><div class="cz-panel"><p class="cz-muted">No project loaded — upload one first (Build group, Method 3).</p></div>`;
            const files = this.#currentProjectFiles;
            const names = new Set(Object.keys(files));
            const missing = [];
            const refPattern = /(?:src|href)\s*=\s*["']([^"']+)["']|import\s+(?:[\w{}*\s,]+\s+from\s+)?["']([^"']+)["']/g;
            for (const [name, content] of Object.entries(files)) {
                if (typeof content !== "string") continue;
                let m;
                refPattern.lastIndex = 0;
                while ((m = refPattern.exec(content)) !== null) {
                    const ref = m[1] || m[2];
                    if (!ref || ref.startsWith("http://") || ref.startsWith("https://") || ref.startsWith("//")) continue;
                    const normalized = ref.replace(/^\.?\//, "");
                    if (!names.has(normalized) && !names.has(ref)) missing.push({ fromFile: name, ref });
                }
            }
            return `<h1>Missing Imports / Scripts</h1>
                <div class="cz-panel">
                    <p class="cz-subtitle">Real, heuristic regex scan (same disclosed approach as the platform-level Reference Integrity Engine, applied here to the ${Object.keys(files).length} file(s) in the currently-loaded project instead of the live page).</p>
                    ${missing.length
                        ? missing.map(m => `<div class="cz-row"><span>${escapeHtml(m.fromFile)} → ${escapeHtml(m.ref)}</span></div>`).join("")
                        : `<p class="cz-muted">No unresolved internal script/link/import references found among this project's own files.</p>`}
                </div>`;
        }

        /**
         * #addOutputItem({name, category, content, mimeType, sourceOperation, status})
         *   Output Center (Rule 53/54) — the real, permanent fix for "I
         *   press Generate, then everything disappears." Every operation
         *   that previously only wrote to the ephemeral #cz-hub-output div
         *   (lost on the next re-render, the exact same root-cause class
         *   as the earlier Method 1/2 text-loss bug) now also calls this,
         *   which appends to the real, persistent #outputItems array.
         *   Content is kept as either a string (code/reports) or
         *   Uint8Array (zips) — never re-encoded speculatively. Size and
         *   extension are computed from the real content/name, never
         *   guessed. status defaults to "success" — only set to "error" by
         *   a caller that genuinely caught a failure, never fabricated.
         */
        /**
         * #addOutputItem(...)
         *   Rule 69 — full migration complete. This is now a thin
         *   wrapper over the real, shared `OutputCenter.publish()` — no
         *   local `#outputItems` array remains. Returns the real
         *   artifactId from the shared engine; every caller in this file
         *   already treated the return value as an opaque id, so nothing
         *   downstream needed to change for this.
         */
        #addOutputItem({ name, category, content, mimeType, sourceOperation, status }) {
            const outputCenter = window.CozyOS.OutputCenter;
            if (!outputCenter) {
                this.#devOutput('<p class="cz-muted">OutputCenter is not loaded — this result could not be saved anywhere.</p>');
                return null;
            }
            const result = outputCenter.publish({
                name, category, content, mimeType: mimeType || "text/plain",
                sourceApplication: "Developer Hub", sourceEngine: "Builder", sourceOperation, status: status || "success"
            });
            if (!result.success) { this.#devOutput(`<p class="cz-muted">${escapeHtml(result.reason)}</p>`); return null; }
            this.#lastOperationSummary = { operation: sourceOperation, at: result.createdAt, status: result.status };
            this.#logActivity({ category, operation: sourceOperation, status: result.status, outputItemId: result.artifactId });
            return result.artifactId;
        }

        /**
         * #logActivity({category, operation, status, outputItemId})
         *   Real, append-only chronological record — the same real data
         *   this session's ".log" export and Activity Timeline both read
         *   from, never duplicated as two separate tracking mechanisms.
         *   Every entry that has a real produced artifact carries
         *   outputItemId, so the Activity Timeline can link an entry
         *   directly back to the real item in the Output Center.
         */
        #logActivity({ category, operation, status, outputItemId }) {
            this.#activityLog.push({ timestamp: new Date().toISOString(), category, operation, status: status || "success", outputItemId: outputItemId || null });
            if (this.#activityLog.length > 500) this.#activityLog.shift(); // real, bounded — same cap already used elsewhere in this project for history arrays
        }

        /**
         * #formatActivityLogAsText()
         *   Real ".log" chronological format, matching exactly:
         *   [timestamp]
         *   Category
         *   Operation
         *   STATUS
         *   — built from the real #activityLog, never a fabricated
         *   snapshot.
         */
        #formatActivityLogAsText() {
            return this.#activityLog.map(e => `[${e.timestamp}]\n${e.category}\n${e.operation}\n${e.status.toUpperCase()}\n`).join("\n");
        }

        // Rule 69: #persistOutputHistory()/#restoreOutputHistory() removed
        // entirely — persistence now lives in exactly one real place,
        // core/output/output-storage.js, used automatically by every
        // application that publishes through the shared OutputCenter,
        // not duplicated per-application.

        /**
         * #renderOutputCenter()
         *   Real list of every item actually produced this session — never
         *   a fabricated placeholder list. Preview/Copy/Download/Rename/
         *   Delete all operate on the real, same #outputItems entries.
         */
        /**
         * #listOutputItems(filter)
         *   Reads from the real, shared OutputCenter (Rule 69 — Developer
         *   Hub is now a pure consumer, no local array remains).
         *   Normalizes at this one boundary: `artifactId` -> `id`,
         *   `collections` -> `collectionNames`, matching the field names
         *   this file's render/handler code has used since Rule 55/67,
         *   rather than renaming every reference across many methods for
         *   a rename that means the same thing either way.
         */
        #listOutputItems(filter) {
            if (!window.CozyOS.OutputCenter) return [];
            return window.CozyOS.OutputCenter.list(filter).map(a => ({ ...a, id: a.artifactId, collectionNames: a.collections }));
        }

        #renderOutputCenter() {
            const outputCenter = window.CozyOS.OutputCenter;
            const folders = outputCenter ? outputCenter.listCategories() : [];
            const searchQuery = this.#outputSearchQuery || "";
            const items = searchQuery && outputCenter
                ? outputCenter.search(searchQuery).map(a => ({ ...a, id: a.artifactId, collectionNames: a.collections }))
                : this.#listOutputItems();
            const formatSize = (bytes) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
            const searchBox = `<div class="cz-field" style="margin-bottom:10px;"><input class="cz-input" id="cz-output-search" placeholder="Search by name, tag, application, extension, or collection…" value="${escapeHtml(searchQuery)}" /></div>`;
            if (items.length === 0) {
                return `<h1>Output Center</h1>${searchBox}<div class="cz-panel"><p class="cz-muted">${searchQuery ? `No real artifacts match "${escapeHtml(searchQuery)}".` : "Nothing generated yet this session. Results from ZIP Create, Split/Merge, Architecture, OCR, Certification, and other Builder tools will appear here automatically."}</p>
                    <p class="cz-muted" style="font-size:12px;">Categories appear only once a real artifact exists in them.</p></div>`;
            }
            return `<h1>Output Center</h1>${searchBox}
                <p class="cz-subtitle">${items.length} item(s)${searchQuery ? ` matching "${escapeHtml(searchQuery)}"` : ` across ${folders.length} categories`} — read live from the shared platform Output Center, the same store every CozyOS application publishes to. Nothing here disappears until you explicitly delete it.</p>
                ${folders.map(cat => {
                    const catItems = items.filter(i => i.category === cat);
                    if (catItems.length === 0) return `<h3>${escapeHtml(cat)} (0)</h3><p class="cz-muted" style="font-size:12px;">Empty.</p>`;
                    return `<h3>${escapeHtml(cat)} (${catItems.length})</h3>
                    ${catItems.map(item => `
                        <div class="cz-panel" style="margin-bottom:10px;">
                            <div class="cz-row" style="justify-content:space-between;">
                                <b>${escapeHtml(item.name)}</b>
                                <span class="cz-badge ${item.status === "error" ? "cz-badge-blocked" : "cz-badge-ready"}">${escapeHtml(item.status)}</span>
                            </div>
                            <div class="cz-row" style="justify-content:space-between;">
                                <span class="cz-muted" style="font-size:12px;">${escapeHtml(item.createdAt)} — from ${escapeHtml(item.sourceApplication)}${item.sourceOperation ? ` (${escapeHtml(item.sourceOperation)})` : ""}</span>
                                <span class="cz-muted" style="font-size:12px;">${escapeHtml(item.extension || "—")} · ${formatSize(item.sizeBytes)}</span>
                            </div>
                            <div class="cz-row" style="gap:6px;flex-wrap:wrap;margin-top:6px;">
                                <button class="cz-btn" data-action="hub-output-preview" data-output-id="${item.id}" ${item.isBinary ? "disabled title=\"Not applicable to binary content\"" : ""}>Preview</button>
                                <button class="cz-btn" data-action="hub-output-open" data-output-id="${item.id}" ${item.isBinary ? "disabled title=\"Not applicable to binary content\"" : ""}>Open</button>
                                <button class="cz-btn" data-action="hub-output-copy" data-output-id="${item.id}" ${item.isBinary ? "disabled title=\"Not applicable to binary content\"" : ""}>Copy</button>
                                <button class="cz-btn" data-action="hub-output-download" data-output-id="${item.id}">Download</button>
                                <button class="cz-btn" data-action="hub-output-export-zip" data-output-id="${item.id}">${item.isBinary ? "Export ZIP (download)" : "Compress / Export ZIP"}</button>
                                <button class="cz-btn" data-action="hub-output-duplicate" data-output-id="${item.id}">Duplicate</button>
                                <button class="cz-btn" data-action="hub-output-add-to-collection" data-output-id="${item.id}">${item.collectionNames.length ? `Collections: ${item.collectionNames.map(escapeHtml).join(", ")}` : "Add to Collection"}</button>
                                <button class="cz-btn" data-action="hub-output-move" data-output-id="${item.id}">Move to Folder</button>
                                <button class="cz-btn" data-action="hub-output-rename" data-output-id="${item.id}">Rename</button>
                                ${item.category === "Trash" ? `<button class="cz-btn" data-action="hub-output-restore" data-output-id="${item.id}">Restore</button>` : ""}
                                <button class="cz-btn cz-btn-danger" data-action="hub-output-delete" data-output-id="${item.id}">${item.category === "Trash" ? "Delete Permanently" : "Delete"}</button>
                            </div>
                            <div id="cz-output-preview-${item.id}"></div>
                        </div>`).join("")}`;
                }).join("")}`;
        }

        /**
         * #renderActivityTimeline()
         *   Real chronological history from the same #activityLog every
         *   .log export reads from — not a second, separate tracking
         *   mechanism. Entries with a real linked output item are
         *   clickable and jump straight to Output Center, matching the
         *   real request "clicking any entry would open the corresponding
         *   artifact." Entries without one (e.g. a failed operation that
         *   never produced an artifact) are shown as plain, non-clickable
         *   text — never a fake link to nothing.
         */
        #renderActivityTimeline() {
            if (this.#activityLog.length === 0) {
                return `<h1>Activity Center</h1><div class="cz-panel"><p class="cz-muted">No activity recorded yet this session.</p></div>`;
            }
            const formatTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            return `<h1>Activity Center</h1>
                <p class="cz-subtitle">${this.#activityLog.length} real event(s), most recent first.</p>
                <button class="cz-btn" data-action="hub-export-builder-log">Export as .log</button>
                <div class="cz-panel">
                    ${this.#activityLog.slice().reverse().map(e => e.outputItemId
                        ? `<div class="cz-row" style="cursor:pointer;" data-action="hub-timeline-open" data-output-id="${e.outputItemId}"><span class="cz-muted">${escapeHtml(formatTime(e.timestamp))}</span><span>${escapeHtml(e.operation)}</span><span class="cz-badge ${e.status === "error" ? "cz-badge-blocked" : "cz-badge-ready"}">${escapeHtml(e.status)}</span></div>`
                        : `<div class="cz-row"><span class="cz-muted">${escapeHtml(formatTime(e.timestamp))}</span><span>${escapeHtml(e.operation)}</span><span class="cz-badge ${e.status === "error" ? "cz-badge-blocked" : "cz-badge-ready"}">${escapeHtml(e.status)}</span></div>`
                    ).join("")}
                </div>`;
        }

        /**
         * #renderBuilderStatusHeader()
         *   Real state only — every line reflects actual current fields
         *   (#currentProjectFiles, #lastAnalysis, #currentProjectModel).
         *   Never a fabricated "Ready" state.
         */
        #renderBuilderStatusHeader() {
            const outputCount = this.#listOutputItems().length;
            const lastOp = this.#lastOperationSummary
                ? `${escapeHtml(this.#lastOperationSummary.operation)} (${escapeHtml(this.#lastOperationSummary.status)}) at ${escapeHtml(this.#lastOperationSummary.at)}`
                : "None yet this session";
            // Real state only — "Ready"/"Error" reflect the last real
            // operation's actual recorded status; never a fabricated
            // "Busy" (no real in-flight-operation tracking exists to
            // report that state honestly, so it is not shown).
            const readyState = this.#lastOperationSummary?.status === "error" ? "Error" : "Ready";

            const hasProject = !!this.#currentProjectFiles;
            if (!hasProject) {
                return `<div class="cz-panel" style="margin-bottom:12px;">
                    <p class="cz-muted">No project loaded. Upload a project or describe one.</p>
                    <p class="cz-muted" style="font-size:12px;">Outputs: ${outputCount} · Last operation: ${lastOp} · Status: ${readyState}</p>
                </div>`;
            }
            const fileCount = Object.keys(this.#currentProjectFiles).length;
            const hasArchitecture = !!this.#lastBuildResult;
            const hasDeps = !!this.#currentProjectModel;
            return `<div class="cz-panel" style="margin-bottom:12px;">
                <p><b>Builder Status</b></p>
                <p>✓ Project Loaded</p>
                <p>✓ ${fileCount} File${fileCount === 1 ? "" : "s"}</p>
                <p>${hasArchitecture ? "✓" : "○"} Architecture Parsed</p>
                <p>${hasDeps ? "✓" : "○"} Project Model Built</p>
                <p>${outputCount > 0 ? "✓" : "○"} ${outputCount} Output${outputCount === 1 ? "" : "s"} Generated</p>
                <p class="cz-muted" style="font-size:12px;">Last operation: ${lastOp} · Status: ${readyState}</p>
            </div>`;
        }

        /**
         * #renderBuilderReports()
         *   Real data only — build history from Builder's own real
         *   getBuildHistory()/getTimeline()/getAuditLog(), not fabricated
         *   report content.
         */
        #renderBuilderReports() {
            const builder = window.CozyOS.Builder;
            if (!builder) return `<h1>Reports</h1><div class="cz-panel"><p class="cz-muted">Builder coordinator is not connected.</p></div>`;
            const history = typeof builder.getBuildHistory === "function" ? builder.getBuildHistory() : [];
            const timeline = typeof builder.getTimeline === "function" ? builder.getTimeline() : [];
            return `<h1>Reports</h1>
                <button class="cz-btn cz-btn-primary" data-action="hub-export-builder-log">Export Builder Log to Output Center</button>
                <div class="cz-panel">
                    <h3>Build History (${history.length})</h3>
                    ${history.length ? history.map(h => `<div class="cz-row"><span>${escapeHtml(h.mode || h.id || "build")}</span><span class="cz-muted">${escapeHtml(h.timestamp || "")}</span></div>`).join("") : '<p class="cz-muted">No builds recorded yet this session.</p>'}
                </div>
                <div class="cz-panel">
                    <h3>Timeline (${timeline.length})</h3>
                    ${timeline.length ? timeline.slice(-20).reverse().map(t => `<div class="cz-row"><span>${escapeHtml(t.event || t.type || "event")}</span><span class="cz-muted">${escapeHtml(t.timestamp || "")}</span></div>`).join("") : '<p class="cz-muted">No timeline events recorded yet this session.</p>'}
                </div>`;
        }

        /**
         * #hubExportBuilderLog()
         *   Real, honest "Logs" folder population — exports Builder's own
         *   actual getBuildHistory()/getTimeline() data (the same real
         *   data already shown in the Reports view above, not
         *   re-fabricated) as one snapshot file in the Output Center.
         */
        #hubExportBuilderLog() {
            if (this.#activityLog.length === 0) { this.#devOutput('<p class="cz-muted">No activity recorded yet this session.</p>'); return; }
            const logText = this.#formatActivityLogAsText();
            this.#addOutputItem({ name: `builder-${Date.now()}.log`, category: "Logs", content: logText, mimeType: "text/plain", sourceOperation: "Export Builder Log" });
            this.#devOutput(`<p>Exported ${this.#activityLog.length} activity record(s) to Output Center as a real .log file.</p>`);
        }

        // =====================================================================
        // ─── BUILDER ──────────────────────────────────────────────────────────
        // Delegates entirely to hub.analyzeRequirement()/openWithBuilder()/
        // buildFromPlan() — same real UnderstandingEngine/CozyBuilder calls
        // used elsewhere, exposed here without a second upload: if a module
        // is already selected, its known metadata seeds the description.
        // =====================================================================

        #renderBuilder() {
            const selected = this.#selectedModuleId;
            const groups = CozyDeveloperHubUI.#BUILDER_GROUPS;
            const activeGroup = groups.find(([id]) => id === this.#builderActiveGroup) || groups[0];
            const subTab = this.#builderSubTab || activeGroup[2][0][0];

            const groupNav = `<div class="cz-row" style="flex-wrap:wrap;gap:6px;margin-bottom:8px;">
                ${groups.map(([id, label]) => `<button class="cz-btn${activeGroup[0] === id ? " cz-btn-primary" : ""}" data-action="hub-builder-group" data-group="${id}">${escapeHtml(label)}</button>`).join("")}
            </div>`;
            const subNav = activeGroup[2].length > 1 ? `<div class="cz-row" style="flex-wrap:wrap;gap:6px;margin-bottom:10px;">
                ${activeGroup[2].map(([id, label]) => `<button class="cz-btn${subTab === id ? " cz-btn-primary" : ""}" data-action="hub-builder-subtab" data-tab="${id}">${escapeHtml(label)}</button>`).join("")}
            </div>` : "";
            const nav = `${groupNav}${subNav}`;

            const status = this.#renderBuilderStatusHeader();
            if (subTab === "capabilities") return `${nav}${status}${this.#renderBuilderCapabilityDashboard()}`;
            if (subTab === "build-history") return `${nav}${status}${this.#renderBuilderReports()}`;
            if (subTab === "zip-create") return `${nav}${status}${this.#renderBuilderZipCreate()}`;
            if (subTab === "zip-extract-info") return `${nav}${status}${this.#renderBuilderZipExtractInfo()}`;
            if (subTab === "file-rename") return `${nav}${status}${this.#renderBuilderRename()}`;
            if (subTab === "missing-refs") return `${nav}${status}${this.#renderBuilderMissingRefs()}`;
            if (subTab === "output-list") return `${nav}${status}${this.#renderOutputCenter()}`;
            if (subTab === "output-collections") return `${nav}${status}${this.#renderOutputCollections()}`;
            if (subTab === "output-settings") return `${nav}${status}${this.#renderOutputSettings()}`;
            if (subTab === "activity-timeline") return `${nav}${status}${this.#renderActivityTimeline()}`;
            if (subTab === "architecture") return `${nav}${status}<h1>Builder — Architecture Viewer</h1>${this.#renderArchitecturePanel()}`;
            if (subTab !== "generate") return `${nav}${status}<h1>Builder — Refactor Existing Project</h1>${this.#renderRefactorPanel(subTab)}`;

            return `${nav}${status}<h1>Builder</h1>
                <p class="cz-subtitle">${selected ? `Opened with "${escapeHtml(selected)}" already loaded — no re-upload.` : "Describe what you want to build, paste existing source, or upload existing files — whichever you already have."}</p>
                <div class="cz-panel">
                    <div class="cz-field"><label>Method 1 — Describe what you want to build</label>
                        <textarea class="cz-input" id="cz-hub-builder-prompt" rows="3" placeholder="Describe what you want to build...">${escapeHtml(this.#builderPromptText || (selected ? `Build ${selected} Coordinator` : ""))}</textarea>
                    </div>
                    <div class="cz-field"><label>Method 2 — Paste existing source code</label>
                        <textarea class="cz-input" id="cz-hub-builder-code-paste" rows="${this.#uploadedFileOriginal ? 14 : 4}" placeholder="Paste existing JS/HTML/CSS/JSON/Markdown/TXT source here — Builder reads it instead of asking you to describe it.">${escapeHtml(this.#builderPastedCodeText || (this.#uploadedFileOriginal ? this.#uploadedFileOriginal.text : ""))}</textarea>
                    </div>
                    <div class="cz-field"><label>Method 3 — Upload existing file(s)</label>
                        <div class="cz-dropzone" id="cz-hub-builder-dropzone">
                            <p>Drag &amp; drop file(s) here (.js, .html, .css, .json, .md, .txt) — multiple files supported — or a single .zip project archive, which extracts with its real folder structure preserved. The first file's content loads directly into Method 2's editor above.</p>
                            <input type="file" id="cz-hub-builder-files" accept=".js,.html,.css,.json,.md,.txt,.zip" multiple />
                        </div>
                        <div id="cz-hub-builder-attachment-summary" class="cz-muted"></div>
                    </div>
                    ${this.#renderUploadConfirmation()}
                    ${this.#requirementSummary ? `<div class="cz-field"><label>Requirement Summary (from RequirementReader — editable before Build)</label>
                        <textarea class="cz-input" id="cz-hub-requirement-summary" rows="10">${escapeHtml(this.#requirementSummary)}</textarea>
                    </div>` : ""}
                    <button class="cz-btn cz-btn-primary" data-action="hub-analyze">Analyze</button>
                </div>
                ${this.#currentProjectFiles ? this.#renderProjectExplorer() : ""}
                ${this.#lastAnalysis ? this.#renderAnalysisResult(this.#lastAnalysis) : ""}
                ${this.#lastBuildResult ? this.#renderBuildResult(this.#lastBuildResult) : ""}
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        /**
         * #renderRefactorPanel(subTab)
         *   Every action here calls the real window.CozyOS.ProjectRefactor
         *   methods (splitSingleFile/mergeProject/modularizeProject/
         *   refactorAndCertify) — this file adds no refactoring logic of
         *   its own, only the upload/paste UI and result display.
         */
        #renderRefactorPanel(subTab) {
            const refactor = window.CozyOS.ProjectRefactor;
            if (!refactor) return `<div class="cz-panel"><p class="cz-muted">ProjectRefactor is not connected.</p></div>`;

            if (subTab === "refactor-split") {
                return `<div class="cz-panel">
                    <div class="cz-field"><label>HTML to split (paste, or drop a file)</label>
                        <div class="cz-dropzone" id="cz-hub-refactor-dropzone"><p>Drag &amp; drop an .html file here, or paste below.</p><input type="file" id="cz-hub-refactor-file" accept=".html,.htm" /></div>
                        <textarea class="cz-input" id="cz-hub-refactor-html" rows="10" placeholder="Paste the HTML file to split..."></textarea>
                    </div>
                    <div class="cz-field"><label>Base filename</label><input class="cz-input" id="cz-hub-refactor-basename" placeholder="page" value="page" /></div>
                    <button class="cz-btn cz-btn-primary" data-action="hub-refactor-split">Split File</button>
                </div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
            }
            if (subTab === "refactor-merge") {
                return `<div class="cz-panel">
                    <div class="cz-field"><label>HTML (with &lt;link&gt;/&lt;script src&gt; references)</label><textarea class="cz-input" id="cz-hub-merge-html" rows="8" placeholder="Paste the HTML..."></textarea></div>
                    <div class="cz-field"><label>CSS to inline</label><textarea class="cz-input" id="cz-hub-merge-css" rows="4" placeholder="Paste the CSS..."></textarea></div>
                    <div class="cz-field"><label>JS to inline</label><textarea class="cz-input" id="cz-hub-merge-js" rows="4" placeholder="Paste the JS..."></textarea></div>
                    <button class="cz-btn cz-btn-primary" data-action="hub-refactor-merge">Merge into One File</button>
                </div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
            }
            if (subTab === "refactor-modularize") {
                return `<div class="cz-panel">
                    <div class="cz-field"><label>Module name</label><input class="cz-input" id="cz-hub-modularize-name" placeholder="MyModule" /></div>
                    <div class="cz-field"><label>JavaScript</label><textarea class="cz-input" id="cz-hub-modularize-js" rows="8" placeholder="Paste the JS to modularize..."></textarea></div>
                    <div class="cz-field"><label>HTML (optional, for compatibility scanning)</label><textarea class="cz-input" id="cz-hub-modularize-html" rows="4" placeholder="Paste the HTML, if any..."></textarea></div>
                    <button class="cz-btn cz-btn-primary" data-action="hub-refactor-modularize">Convert to CozyOS Module</button>
                </div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
            }
            // refactor-optimize
            return `<div class="cz-panel">
                <p class="cz-subtitle">Runs the full pipeline on existing JS: Quick Certification → BugFixer → Re-Certification.</p>
                <div class="cz-field"><label>Module ID</label><input class="cz-input" id="cz-hub-optimize-moduleid" placeholder="MyModule" /></div>
                <div class="cz-field"><label>JavaScript</label><textarea class="cz-input" id="cz-hub-optimize-js" rows="10" placeholder="Paste the JS to optimize..."></textarea></div>
                <button class="cz-btn cz-btn-primary" data-action="hub-refactor-optimize">Optimize</button>
            </div>
            <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        /**
         * #renderArchitecturePanel()
         *   Restoration fix, not a new feature: window.CozyOS.ArchitectureEngine
         *   (generateBlueprint()/listBlueprints()/getBlueprint()) has been
         *   real and connected since Milestone 30 — this was the only real
         *   gap found in Phase 1 of the Functional Workspace Restoration
         *   audit: the coordinator existed, nothing in this UI called it.
         *   This panel adds no analysis logic of its own — it only calls
         *   the real, existing methods and displays their real output.
         */
        #renderArchitecturePanel() {
            const engine = window.CozyOS.ArchitectureEngine;
            if (!engine) return `<div class="cz-panel"><p class="cz-muted">ArchitectureEngine is not connected.</p></div>`;
            const blueprints = typeof engine.listBlueprints === "function" ? engine.listBlueprints() : [];
            return `<div class="cz-panel">
                <p class="cz-subtitle">Generates a real architecture blueprint from the current project files (Method 2/3 in Generate) via ArchitectureEngine — nothing here is invented by this panel.</p>
                <button class="cz-btn cz-btn-primary" data-action="hub-generate-blueprint">Generate Blueprint</button>
                ${blueprints.length ? `<h3>Existing Blueprints</h3>${blueprints.map(b => `<div class="cz-row"><span>${escapeHtml(b.id || b.name)}</span><button class="cz-btn" data-action="hub-view-blueprint" data-blueprint-id="${escapeHtml(b.id)}">View</button></div>`).join("")}` : `<p class="cz-muted">No blueprints generated yet this session.</p>`}
            </div>
            <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        /**
         * #routeForIntent(type)
         *   Routing table only — classification (classifyIntent) and
         *   routing are deliberately separate, so adding a future intent
         *   type never requires touching BuilderAI again. destination
         *   is a real, honest label; setSectionAction is only present
         *   when a genuine navigation target exists in this UI today —
         *   otherwise the panel discloses that no automatic handoff is
         *   wired yet rather than pretending one does.
         */
        #routeForIntent(type) {
            const TABLE = {
                BUSINESS_REQUIREMENTS: { destination: "Requirement Analyzer", note: "Prose requirements text — analyzed by RequirementAnalyzer, not RequirementReader (which reads existing code files). Not yet wired to a Developer Hub section." },
                USER_STORY: { destination: "Requirement Analyzer", note: "Same as Business Requirements — RequirementAnalyzer is built for this, not yet wired to a section here." },
                ARCHITECTURE: { destination: "Understanding Engine", section: "understanding" },
                SOURCE_CODE: { destination: "Builder Analysis (Method 2/3)", note: "Already the default path when code is pasted/uploaded — no extra routing needed." },
                BUG_REPORT: { destination: "BugFixer", section: "bugfixer" },
                CERTIFICATION_REPORT: { destination: "Certification", section: "quickCert" },
                REFACTOR_REQUEST: { destination: "Project Refactor", note: "Builder's own Split/Merge/Convert/Optimize sub-tabs — use Method 2/3 there directly." },
                BUILD_REQUEST: { destination: "Builder", note: "This screen — no redirect needed." },
                PROJECT_SPECIFICATION: { destination: "Requirement Analyzer", note: "Same as Business Requirements — a structured spec still describes requirements, not finished code." },
                UNKNOWN: { destination: "Show analysis only", note: "Confidence too low to route automatically — review the Understanding Preview below and decide manually." }
            };
            return TABLE[type] || TABLE.UNKNOWN;
        }

        /** #intentLabel(type) — pure display label derived from the already-frozen classifyIntent() enum. Not a new classification. */
        #intentLabel(type) {
            const LABELS = {
                BUSINESS_REQUIREMENTS: "Requirements Discovery", USER_STORY: "Requirements Discovery",
                PROJECT_SPECIFICATION: "Requirements Discovery", ARCHITECTURE: "Architecture Review",
                SOURCE_CODE: "Code Analysis", BUG_REPORT: "Defect Resolution",
                CERTIFICATION_REPORT: "Certification Review", REFACTOR_REQUEST: "Refactor Request",
                BUILD_REQUEST: "Code Generation", UNKNOWN: "Unclassified"
            };
            return LABELS[type] || "Unclassified";
        }

        /** #phaseLabel(type) — pure display label; a real, deterministic mapping from intent.type, not a new tracked project-phase field. */
        #phaseLabel(type) {
            if (["BUSINESS_REQUIREMENTS", "USER_STORY", "PROJECT_SPECIFICATION"].includes(type)) return "Phase 1 — Discovery";
            if (type === "ARCHITECTURE") return "Phase 2 — Architecture";
            if (["BUILD_REQUEST", "SOURCE_CODE"].includes(type)) return "Phase 3 — Implementation";
            if (["BUG_REPORT", "REFACTOR_REQUEST"].includes(type)) return "Maintenance";
            if (type === "CERTIFICATION_REPORT") return "Verification";
            return "Unclassified";
        }

        /** #actionButtonsForIntent(type) — real, adapted buttons per intent, matching the requested examples exactly. Routing destinations still come from the existing, untouched #routeForIntent(). */
        #actionButtonsForIntent(type) {
            const route = this.#routeForIntent(type);
            const goto = route.section ? `<button class="cz-btn cz-btn-primary" data-action="hub-goto-section" data-section-target="${escapeHtml(route.section)}">Open ${escapeHtml(route.destination)}</button>` : "";
            switch (type) {
                case "BUSINESS_REQUIREMENTS": case "USER_STORY": case "PROJECT_SPECIFICATION":
                    return `${goto || `<button class="cz-btn cz-btn-primary" data-action="hub-goto-section" data-section-target="understanding">Proceed to Architecture</button>`}
                        <button class="cz-btn" data-action="hub-build-plan">Generate Code Anyway</button>`;
                case "SOURCE_CODE": return `<button class="cz-btn cz-btn-primary" data-action="hub-build-plan">Continue to Builder</button>`;
                case "BUG_REPORT": return goto || `<button class="cz-btn cz-btn-primary" data-action="hub-build-plan">Generate Anyway</button>`;
                case "CERTIFICATION_REPORT": return goto || `<button class="cz-btn cz-btn-primary" data-action="hub-build-plan">Generate Anyway</button>`;
                case "REFACTOR_REQUEST": return `<button class="cz-btn cz-btn-primary" data-action="hub-builder-subtab" data-tab="refactor-split">Open Project Refactor</button><button class="cz-btn" data-action="hub-build-plan">Generate Anyway</button>`;
                case "BUILD_REQUEST": return `<button class="cz-btn cz-btn-primary" data-action="hub-build-plan">Continue → Generate</button>`;
                default: return `<button class="cz-btn" data-action="hub-build-plan">Generate Anyway</button>`;
            }
        }

        #renderAnalysisResult(a) {
            const intent = a.intent;
            const isBuildReady = intent && (intent.type === "BUILD_REQUEST" || intent.type === "SOURCE_CODE");
            const applicationName = a.understanding?.plan?.exportName || "Not detected";
            const classificationPanel = intent && intent.type !== "UNKNOWN" ? (() => {
                const route = this.#routeForIntent(intent.type);
                return `<div class="cz-panel" style="border-left:3px solid ${isBuildReady ? "#16a34a" : "#d97706"};">
                    <h3>Input Classification</h3>
                    <p><b>Input Type:</b> ${escapeHtml(intent.type)}</p>
                    <p><b>Intent:</b> ${escapeHtml(this.#intentLabel(intent.type))}</p>
                    <p><b>Application Name:</b> ${escapeHtml(applicationName)}</p>
                    <p><b>Current Phase:</b> ${escapeHtml(this.#phaseLabel(intent.type))}</p>
                    <p><b>Expected Output:</b> ${escapeHtml(route.destination)}</p>
                    <p><b>Recommended Next Action:</b> ${escapeHtml(isBuildReady ? "Proceed with generation." : `Review with ${route.destination} before generating code.`)}</p>
                    <p class="cz-muted">Detected from: ${escapeHtml(intent.signals.join("; ") || "no strong signal")}</p>
                    <div class="cz-row">${this.#actionButtonsForIntent(intent.type)}</div>
                </div>`;
            })() : "";
            return `${classificationPanel}<div class="cz-panel">
                <h3>Understanding Preview</h3>
                <p><b>Application Type:</b> ${escapeHtml(a.understanding.applicationType)}</p>
                <p><b>Detected Features:</b> ${escapeHtml((a.understanding.detectedFeatures || []).join(", ") || "none")}</p>
                <p><b>Missing (Gap Detector):</b> ${escapeHtml(a.gaps.missing.map(g => g.label).join(", ") || "none")}</p>
                ${!intent || intent.type === "UNKNOWN" ? `<button class="cz-btn ${isBuildReady ? "cz-btn-primary" : ""}" data-action="hub-build-plan">${isBuildReady ? "Continue → Generate" : "Generate Anyway"}</button>` : ""}
            </div>`;
        }

        #renderBuildResult(result) {
            if (result.blocked) {
                return `<div class="cz-panel" style="border-left:3px solid #d97706;">
                    <h3>Build Blocked — Existing Module Found</h3>
                    <p>${escapeHtml(result.message)}</p>
                    ${result.discovery.liveModuleMatches.length ? `<p class="cz-muted">Matches: ${escapeHtml(result.discovery.liveModuleMatches.join(", "))}</p>` : ""}
                    <button class="cz-btn cz-btn-primary" data-action="hub-force-generate">Generate Anyway</button>
                </div>`;
            }
            const files = Object.keys(result.files);
            const cp = result.certificationPreview;
            return `<div class="cz-panel">
                <h3>Certification Preview</h3>
                ${cp.available !== false ? `<div class="cz-row"><span class="cz-badge ${verdictBadgeClass(cp.verdict)}">${escapeHtml(cp.verdict)}</span><span>${escapeHtml(cp.scorePercent)}%</span></div>` : `<p class="cz-muted">${escapeHtml(cp.message)}</p>`}
                <h3>Generated Files</h3>
                ${files.map(name => `<div class="cz-row"><span>${escapeHtml(name)}</span><button class="cz-btn" data-action="hub-download-file" data-file="${escapeHtml(name)}">Download</button></div>`).join("")}
            </div>`;
        }

        /**
         * #hubAnalyze()
         *   Never forces retyping a requirement when code already exists:
         *   if pasted code and/or uploaded files are present, this runs
         *   UnderstandingEngine.analyzeCode() on each and uses that —
         *   the plain-language description is only required when neither
         *   of the other two methods provided anything.
         */
        async #hubAnalyze() {
            const hub = this.#hub();
            const ue = window.CozyOS.UnderstandingEngine;
            const text = document.getElementById("cz-hub-builder-prompt")?.value.trim();
            const pastedCode = document.getElementById("cz-hub-builder-code-paste")?.value.trim();
            const requirementSummaryEl = document.getElementById("cz-hub-requirement-summary");
            const editedRequirementSummary = requirementSummaryEl?.value.trim();
            // If the user edited the RequirementReader-generated summary,
            // that edited version is what drives Analyze — RequirementReader
            // stays the source of truth, but the summary remains genuinely
            // editable before Build as required.
            if (editedRequirementSummary && editedRequirementSummary !== this.#requirementSummary) {
                try {
                    this.#lastAnalysis = await hub.analyzeRequirement(editedRequirementSummary);
                    this.#lastAnalysis.requirementReaderUsed = true;
                    this.#requirementSummary = editedRequirementSummary;
                    this.#lastBuildPlan = null; this.#lastBuildResult = null;
                    this.#renderMain();
                    return;
                } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); return; }
            }
            // The primary uploaded file's content is auto-loaded into the
            // editor (pastedCode) — skip it here to avoid analyzing it
            // twice; only additional uploaded files (multi-file uploads)
            // are analyzed separately.
            const additionalUploaded = (this.#pendingBuilderFiles || []).slice(1);

            try {
                const codeAnalyses = [];
                if (ue) {
                    // Priority: uploaded/pasted source (unified in the
                    // editor) always wins over the written requirement —
                    // the user never has to re-describe something already
                    // loaded as real code.
                    if (pastedCode) { try { codeAnalyses.push(ue.analyzeCode(pastedCode)); } catch (_err) { /* not parseable as code */ } }
                    for (const f of additionalUploaded) { try { codeAnalyses.push(ue.analyzeCode(f.text)); } catch (_err) { /* skip unparseable file */ } }
                }

                if (codeAnalyses.length > 0) {
                    const primary = codeAnalyses[0];
                    const description = text || `Build ${primary.className || "Module"} Coordinator`;
                    this.#lastAnalysis = await hub.analyzeRequirement(description);
                    this.#lastAnalysis.codeAnalyses = codeAnalyses;
                } else if (text) {
                    // Real, deterministic intent classification — root-cause
                    // fix for a requirements/planning document being silently
                    // treated as a build request. Never blocks; surfaces the
                    // classification so the developer can make an informed
                    // choice, same "always allow override" pattern as Rule 16.
                    const ai = window.CozyOS.BuilderAI;
                    const intent = ai && typeof ai.classifyIntent === "function" ? ai.classifyIntent(text) : null;
                    this.#lastAnalysis = await hub.analyzeRequirement(text);
                    this.#lastAnalysis.intent = intent;
                } else {
                    this.#devOutput('<p class="cz-muted">Describe what you want, paste existing code, or upload a file first.</p>');
                    return;
                }
                this.#lastBuildPlan = null; this.#lastBuildResult = null;
                this.#renderMain();
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        /** Handles file(s) dropped or picked for Builder's Method 3 — reads each as text, no upload limit beyond the accepted extensions. */
        async #handleBuilderFilesSelected(fileList) {
            const files = Array.from(fileList);

            // A ZIP upload is a project, not a text file — must be read as
            // binary (ArrayBuffer) and routed through the real
            // importFromZip()/buildProjectModel() path, never through the
            // text-reading path below (which would corrupt binary content).
            if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
                await this.#handleZipProjectUpload(files[0]);
                return;
            }

            const read = await Promise.all(files.map(async f => ({ name: f.name, text: await this.#readFileAsText(f) })));
            this.#pendingBuilderFiles = read;

            // Auto-load: the first file's real content goes straight into
            // the paste editor, unedited — this is what actually fixes the
            // Analyze bug, since Analyze already reliably reads from this
            // editor regardless of any separate upload-tracking state.
            const primary = read[0];
            if (primary) {
                const pasteEl = document.getElementById("cz-hub-builder-code-paste");
                if (pasteEl) pasteEl.value = primary.text;
                this.#uploadedFileOriginal = { name: primary.name, text: primary.text, loadedAt: new Date().toISOString() };
                this.#uploadedFileMeta = this.#detectFileMetadata(primary.name, primary.text);
            }

            // RequirementReader is the single source of truth for uploaded
            // analysis when connected — populates identity/purpose/public
            // interface/dependencies/quality/summary automatically, and
            // pre-fills lastAnalysis so Builder is ready without a second
            // Analyze click. Falls back to the existing #detectFileMetadata
            // regex path (above) when RequirementReader isn't connected —
            // nothing is removed, only preferred when available.
            await this.#runRequirementReaderOnUpload(read);

            this.#renderMain();
        }

        /**
         * #runRequirementReaderOnUpload(files)
         *   RequirementReader is the single source of truth for uploaded-
         *   file analysis when connected — this never re-implements its
         *   extraction. For multiple files, every supported one is read
         *   and their summaries combined into one project requirement
         *   (per the Project Upload rule); for one file, its own summary
         *   becomes the requirement. Silently no-ops (existing regex path
         *   still applies) if RequirementReader isn't connected.
         */
        async #runRequirementReaderOnUpload(files) {
            const rr = window.CozyOS.RequirementReader;
            const hub = this.#hub();
            if (!rr || !hub || !files.length) return;
            try {
                const readings = [];
                for (const f of files) {
                    try { readings.push(rr.readFile(f.name, f.text)); } catch (_err) { /* unsupported/unparseable file — skip, other files still processed */ }
                }
                if (readings.length === 0) { this.#requirementReading = null; this.#requirementSummary = null; return; }

                if (readings.length === 1) {
                    this.#requirementReading = readings[0];
                    this.#requirementSummary = rr.generateRequirementSummary(readings[0].id);
                } else {
                    // Real cross-file project synthesis — coordinators,
                    // shared utilities, missing modules, entry points —
                    // never plain per-file concatenation.
                    this.#requirementReading = { project: true, readings, synthesis: rr.synthesizeProjectRequirement(readings) };
                    this.#requirementSummary = rr.generateProjectRequirementSummary(readings);
                }

                // Pre-fill lastAnalysis from the real summary — no second
                // Analyze click required. The Analyze button remains fully
                // functional and re-runs this same real path if clicked.
                this.#lastAnalysis = await hub.analyzeRequirement(this.#requirementSummary);
                this.#lastAnalysis.requirementReaderUsed = true;

                // RequirementReader already extracted an exact, unambiguous
                // className — BuilderAI's word-extraction is tuned for
                // natural-language prose ("Build X Coordinator"), not the
                // structured "Module: X" summary format, and can otherwise
                // pick up the literal label text. The real, clean identity
                // always wins here.
                const primaryIdentity = readings.length === 1 ? readings[0].identity : readings[0].identity;
                if (primaryIdentity && primaryIdentity.className && this.#lastAnalysis.understanding && this.#lastAnalysis.understanding.plan) {
                    this.#lastAnalysis.understanding.plan.exportName = primaryIdentity.className;
                    this.#lastAnalysis.understanding.plan.folder = `core/modules/${primaryIdentity.className.toLowerCase()}`;
                }
            } catch (err) { this.#devOutput(`<p class="cz-muted">RequirementReader: ${escapeHtml(err.message)}</p>`); }
        }

        #hubSetBuilderSubTab(tab) { this.#builderSubTab = tab; this.#renderMain(); }
        #hubSetBuilderGroup(group) {
            this.#builderActiveGroup = group;
            const groupDef = CozyDeveloperHubUI.#BUILDER_GROUPS.find(([id]) => id === group);
            this.#builderSubTab = groupDef ? groupDef[2][0][0] : "generate"; // real default: the new group's first real item, never a stale subTab from a different group
            this.#renderMain();
        }

        /**
         * #hubZipCreateProject() / #hubZipCreateSingle()
         *   Real ZIP creation using createZipStore() (module-level,
         *   verified against the system unzip tool), downloaded via the
         *   existing real downloadBlob() helper — no new download
         *   mechanism invented.
         */
        #hubZipCreateProject() {
            if (!this.#currentProjectFiles) { this.#devOutput('<p class="cz-muted">No project loaded.</p>'); return; }
            try {
                const files = Object.entries(this.#currentProjectFiles).map(([name, content]) => ({ name, content }));
                const zipBytes = createZipStore(files);
                downloadBlob("project.zip", zipBytes, "application/zip");
                this.#addOutputItem({ name: "project.zip", category: "ZIP Packages", content: zipBytes, mimeType: "application/zip", sourceOperation: "ZIP Create" });
                this.#devOutput(`<p>Created project.zip — ${files.length} file(s), ${zipBytes.length} bytes (uncompressed). Saved to Output Center.</p>`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }
        #hubZipCreateSingle() {
            const filename = document.getElementById("cz-hub-zip-filename")?.value.trim() || "output.txt";
            const content = document.getElementById("cz-hub-builder-code-paste")?.value || this.#builderPastedCodeText || "";
            if (!content) { this.#devOutput('<p class="cz-muted">Nothing in Method 2\'s paste box to zip.</p>'); return; }
            try {
                const zipBytes = createZipStore([{ name: filename, content }]);
                const zipName = `${filename.replace(/\.[^.]+$/, "")}.zip`;
                downloadBlob(zipName, zipBytes, "application/zip");
                this.#addOutputItem({ name: zipName, category: "ZIP Packages", content: zipBytes, mimeType: "application/zip", sourceOperation: "ZIP Create" });
                this.#devOutput(`<p>Created a ${zipBytes.length}-byte ZIP containing ${escapeHtml(filename)}. Saved to Output Center.</p>`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        /**
         * #hubRenameApply()
         *   Real batch rename — mutates the actual, currently-loaded
         *   #currentProjectFiles object (a real find/replace over each
         *   real filename), not a simulated preview.
         */
        #hubRenameApply() {
            if (!this.#currentProjectFiles) { this.#devOutput('<p class="cz-muted">No project loaded.</p>'); return; }
            const find = document.getElementById("cz-hub-rename-find")?.value;
            const replace = document.getElementById("cz-hub-rename-replace")?.value ?? "";
            if (!find) { this.#devOutput('<p class="cz-muted">Enter text to find first.</p>'); return; }
            const renamed = {};
            let count = 0;
            for (const [name, content] of Object.entries(this.#currentProjectFiles)) {
                const newName = name.includes(find) ? name.replace(find, replace) : name;
                if (newName !== name) count++;
                renamed[newName] = content;
            }
            this.#currentProjectFiles = renamed;
            this.#devOutput(`<p>Renamed ${count} file(s).</p>`);
            // Permanent rule (Rule 66): Rename modifies in-memory project
            // state, it does not produce a downloadable file — so no real
            // #addOutputItem() call would be honest here. Per the rule,
            // the real operation result is recorded instead of silently
            // doing nothing, using the same real activity log every other
            // operation's real outcome already flows through.
            this.#logActivity({ category: "Generated Code", operation: `Rename (${count} file(s) affected)`, status: "success" });
            this.#renderMain();
        }

        /**
         * Output Center actions (Rule 53) — operate on the same real
         * #outputItems entries the render method lists; nothing here
         * recomputes or fabricates content.
         */
        /**
         * #findOutputItem(id)
         *   Reads from the real, shared OutputCenter. Normalizes the
         *   platform's real `artifactId` field to `id` here, at the
         *   consumer boundary — the rest of this file's render/handler
         *   code (dozens of references to `item.id`, built up across
         *   Rules 53-67) is left unchanged rather than risking a large,
         *   error-prone rename across many methods for a field that means
         *   the same thing either way.
         */
        #findOutputItem(id) {
            if (!window.CozyOS.OutputCenter) return null;
            const a = window.CozyOS.OutputCenter.get(id);
            return a ? { ...a, id: a.artifactId } : null;
        }

        /**
         * #hubOutputPreview(id)
         *   Real, type-aware preview (Rule 71). Every format below is
         *   either genuinely supported or explicitly disclosed as not —
         *   nothing here fakes a rendering capability that doesn't exist.
         *     - image/* binary content: real, via a real Blob URL and an
         *       actual <img> tag — achievable generically, does not
         *       require Image Studio to exist, only that SOME artifact
         *       carries a real image mimeType.
         *     - application/json or .json: real pretty-print via
         *       JSON.parse/stringify — if parsing fails, falls back to
         *       plain text honestly rather than showing broken JSON as
         *       if it were valid.
         *     - text/html or .html: real, rendered in a real sandboxed
         *       iframe (srcdoc) — genuine rendering, not a screenshot or
         *       simulation.
         *     - .md: a real, but minimal, disclosed-as-partial Markdown
         *       transform (headers/bold/italic/lists only) — this is not
         *       a full CommonMark parser, and the preview says so.
         *     - PDF, ZIP contents listing: NOT supported — no PDF-reading
         *       vendor is loaded (Rule 57-62's vendor system confirms
         *       none are), and no real ZIP-reading capability exists in
         *       this codebase (only a ZIP writer was ever built and
         *       verified). Both honestly disabled rather than faked.
         */
        #hubOutputPreview(id) {
            const item = this.#findOutputItem(id);
            const container = this.#root.querySelector(`#cz-output-preview-${id}`);
            if (!item || !container) return;
            if (container.dataset.open === "true") { container.innerHTML = ""; container.dataset.open = "false"; return; }

            if (item.isBinary && item.mimeType && item.mimeType.startsWith("image/")) {
                try {
                    const blob = new Blob([item.content], { type: item.mimeType });
                    const url = URL.createObjectURL(blob);
                    container.innerHTML = `<img src="${url}" style="max-width:100%;margin-top:8px;" alt="${escapeHtml(item.name)}" />`;
                    container.dataset.open = "true";
                    return;
                } catch (_err) { /* fall through to the generic binary message below */ }
            }
            if (item.isBinary) {
                if (item.extension === "pdf") {
                    container.innerHTML = `<p class="cz-muted">PDF preview is not available — no PDF-reading vendor is loaded (confirmed via the Vendor Status system). Use Download.</p>`;
                } else if (item.extension === "zip") {
                    container.innerHTML = `<p class="cz-muted">ZIP contents listing is not available — no real ZIP-reading capability exists in this codebase (only ZIP creation was built and verified). Use Download.</p>`;
                } else {
                    container.innerHTML = `<p class="cz-muted">Binary content (${item.sizeBytes} bytes) — preview not applicable, use Download.</p>`;
                }
                container.dataset.open = "true";
                return;
            }

            if (item.extension === "json" || item.mimeType === "application/json") {
                try {
                    const pretty = JSON.stringify(JSON.parse(item.content), null, 2);
                    container.innerHTML = `<textarea class="cz-input" rows="14" readonly style="margin-top:8px;font-family:monospace;">${escapeHtml(pretty)}</textarea>`;
                } catch (_err) {
                    container.innerHTML = `<p class="cz-muted">Content has a .json name/type but is not valid JSON — showing raw text instead.</p><textarea class="cz-input" rows="10" readonly>${escapeHtml(item.content)}</textarea>`;
                }
            } else if (item.extension === "html" || item.mimeType === "text/html") {
                container.innerHTML = `<p class="cz-muted" style="font-size:12px;">Real, sandboxed HTML preview.</p><iframe sandbox="" srcdoc="${escapeHtml(item.content)}" style="width:100%;height:300px;border:1px solid var(--cz-border, #444);margin-top:4px;"></iframe>`;
            } else if (item.extension === "md") {
                const html = escapeHtml(item.content)
                    .replace(/^### (.*)$/gm, "<h3>$1</h3>").replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>")
                    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>")
                    .replace(/^- (.*)$/gm, "<li>$1</li>").replace(/\n/g, "<br>");
                container.innerHTML = `<p class="cz-muted" style="font-size:12px;">Minimal Markdown rendering (headers/bold/italic/lists only) — not a full parser.</p><div class="cz-panel" style="margin-top:4px;">${html}</div>`;
            } else {
                container.innerHTML = `<textarea class="cz-input" rows="10" readonly style="margin-top:8px;">${escapeHtml(item.content)}</textarea>`;
            }
            container.dataset.open = "true";
        }

        async #hubOutputCopy(id) {
            const item = this.#findOutputItem(id);
            if (!item) return;
            if (item.isBinary) { this.#shellToast("Binary content can't be copied as text — use Download."); return; }
            try {
                await navigator.clipboard.writeText(item.content);
                this.#shellToast(`Copied ${item.name}`);
            } catch (_err) {
                this.#shellToast("Clipboard access was denied by the browser.");
            }
        }

        #hubOutputDownload(id) {
            const item = this.#findOutputItem(id);
            if (!item) return;
            downloadBlob(item.name, item.content, item.mimeType);
        }

        /**
         * #hubOutputExportZip(id)
         *   Real per-item ZIP export — now delegates to the shared
         *   platform `OutputExport.exportArtifactsAsZip()` (Rule 68/69)
         *   rather than calling the local `createZipStore()` directly,
         *   since the real, single implementation now lives in
         *   core/output/output-export.js.
         */
        #hubOutputExportZip(id) {
            const item = this.#findOutputItem(id);
            if (!item) return;
            if (item.isBinary) { this.#hubOutputDownload(id); return; }
            const exportEngine = window.CozyOS.OutputExport;
            if (!exportEngine) { this.#devOutput('<p class="cz-muted">OutputExport is not loaded.</p>'); return; }
            const result = exportEngine.exportArtifactsAsZip([id]);
            if (!result.success) { this.#devOutput(`<p class="cz-muted">${escapeHtml(result.reason)}</p>`); return; }
            const zipName = `${item.name.replace(/\.[^.]+$/, "")}.zip`;
            downloadBlob(zipName, result.zipBytes, "application/zip");
            this.#addOutputItem({ name: zipName, category: "ZIP Packages", content: result.zipBytes, mimeType: "application/zip", sourceOperation: `Export ZIP (${item.name})` });
        }

        /** #hubOutputRename(id) — real, delegates to the shared OutputCenter.rename(), which handles persistence and the real artifact-renamed event itself. */
        #hubOutputRename(id) {
            const item = this.#findOutputItem(id);
            if (!item) return;
            const newName = window.prompt("Rename output:", item.name);
            if (newName && newName.trim() && window.CozyOS.OutputCenter) {
                window.CozyOS.OutputCenter.rename(id, newName.trim());
                this.#renderMain();
            }
        }

        /**
         * #hubOutputDelete(id)
         *   Real, delegates entirely to the shared OutputCenter.delete()
         *   (Rule 68/69) — the real two-stage Trash lifecycle (soft-
         *   delete, then permanent on a second call) now lives in exactly
         *   one place instead of being duplicated per-application.
         */
        #hubOutputDelete(id) {
            if (window.CozyOS.OutputCenter) window.CozyOS.OutputCenter.delete(id);
            this.#renderMain();
        }

        /** #hubOutputRestore(id) — real, delegates to the shared OutputCenter.restore(). */
        #hubOutputRestore(id) {
            if (window.CozyOS.OutputCenter) window.CozyOS.OutputCenter.restore(id);
            this.#renderMain();
        }

        // Rule 69: #getVisibleOutputFolders() removed — dynamic category
        // computation (Rule 66's principle) now lives in exactly one real
        // place, window.CozyOS.OutputCenter.listCategories(), used
        // directly wherever this file previously called the local method.

        /**
         * #renderOutputCollections()
         *   Real grouping — reads each item's own `collectionNames` array
         *   (set via #hubOutputAddToCollection()). Since an item can
         *   genuinely belong to more than one collection, it appears
         *   under every real collection heading it's a member of — this
         *   is what "the same file can remain in Generated Code while
         *   also belonging to a build collection" actually means: real,
         *   independent membership, not a move.
         */
        #renderOutputCollections() {
            const collections = window.CozyOS.OutputCollections;
            if (!collections) return `<h1>Collections</h1><div class="cz-panel"><p class="cz-muted">OutputCollections is not loaded.</p></div>`;
            const result = collections.listCollections();
            if (!result.available || Object.keys(result.collections).length === 0) return `<h1>Collections</h1><div class="cz-panel"><p class="cz-muted">Nothing generated yet this session.</p></div>`;
            return `<h1>Collections</h1>
                ${Object.entries(result.collections).map(([name, groupItems]) => `
                    <div class="cz-panel" style="margin-bottom:10px;">
                        <div class="cz-row" style="justify-content:space-between;">
                            <b>${escapeHtml(name)}</b>
                            ${name !== "Ungrouped" ? `<button class="cz-btn" data-action="hub-collection-download" data-collection-name="${escapeHtml(name)}">Download Collection as ZIP</button>` : ""}
                        </div>
                        ${groupItems.map(i => `<div class="cz-row"><span>${escapeHtml(i.name)}</span><span class="cz-muted">${escapeHtml(i.category)} — ${escapeHtml(i.sourceApplication)}</span></div>`).join("")}
                    </div>`).join("")}`;
        }

        /**
         * #renderOutputSettings()
         *   Real stats only — every number computed live from the real,
         *   shared OutputCenter.list(), never a placeholder.
         */
        #renderOutputSettings() {
            const items = this.#listOutputItems();
            const folders = window.CozyOS.OutputCenter ? window.CozyOS.OutputCenter.listCategories() : [];
            const total = items.length;
            const trashCount = items.filter(i => i.category === "Trash").length;
            const totalBytes = items.reduce((sum, i) => sum + (i.sizeBytes || 0), 0);
            const formatSize = (bytes) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
            const folderCounts = folders.map(f => `${escapeHtml(f)}: ${items.filter(i => i.category === f).length}`).join(" · ");
            return `<h1>Output Settings</h1>
                <div class="cz-panel">
                    <p><b>${total}</b> total item(s), <b>${formatSize(totalBytes)}</b> total.</p>
                    <p class="cz-muted">${folderCounts}</p>
                    <p><b>${trashCount}</b> item(s) in Trash.</p>
                    <button class="cz-btn cz-btn-danger" data-action="hub-empty-trash" ${trashCount === 0 ? "disabled" : ""}>Empty Trash Now (permanent)</button>
                </div>`;
        }

        /** #hubOutputAddToCollection(id) — real, delegates to the shared OutputCollections.addToCollection(). */
        #hubOutputAddToCollection(id) {
            const name = window.prompt("Add to collection (existing or new name):", "");
            if (name && name.trim() && window.CozyOS.OutputCollections) {
                window.CozyOS.OutputCollections.addToCollection(id, name.trim());
                this.#renderMain();
            }
        }

        /** #hubCollectionDownload(name) — real, delegates to the shared OutputExport for every real artifact in the named collection. */
        #hubCollectionDownload(name) {
            const items = this.#listOutputItems({ collection: name }).filter(i => i.category !== "Trash");
            const exportEngine = window.CozyOS.OutputExport;
            if (!exportEngine || items.length === 0) { this.#devOutput('<p class="cz-muted">No downloadable items in this collection.</p>'); return; }
            const result = exportEngine.exportArtifactsAsZip(items.map(i => i.id));
            if (!result.success) { this.#devOutput(`<p class="cz-muted">${escapeHtml(result.reason)}</p>`); return; }
            downloadBlob(`${name}.zip`, result.zipBytes, "application/zip");
        }

        /** #hubEmptyTrash() — real, delegates to the shared OutputCenter.delete() for every real item currently in Trash (each call is genuinely permanent, since they're already in Trash). */
        #hubEmptyTrash() {
            if (!window.CozyOS.OutputCenter) return;
            this.#listOutputItems({ category: "Trash" }).forEach(i => window.CozyOS.OutputCenter.delete(i.id));
            this.#renderMain();
        }

        /**
         * #hubOutputOpen(id)
         *   Real "Open" — for text content, opens a real Blob URL in a new
         *   browser tab (the closest real equivalent to "open" in a
         *   sandboxed web context; there is no real OS-level file-open
         *   available). For binary content, falls back to Download with a
         *   real, disclosed reason rather than opening raw bytes as if
         *   they were text.
         */
        #hubOutputOpen(id) {
            const item = this.#findOutputItem(id);
            if (!item) return;
            if (item.isBinary) { this.#shellToast("Binary content — opening isn't meaningful in-browser, use Download instead."); return; }
            const blob = new Blob([item.content], { type: item.mimeType });
            const url = URL.createObjectURL(blob);
            window.open(url, "_blank");
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        }

        /** #hubOutputDuplicate(id) — real, delegates to the shared OutputCenter.duplicate(). */
        #hubOutputDuplicate(id) {
            if (window.CozyOS.OutputCenter) window.CozyOS.OutputCenter.duplicate(id);
            this.#renderMain();
        }

        /** #hubOutputMove(id) — real, delegates to the shared OutputCenter.move(), listing the real, currently-visible categories. */
        #hubOutputMove(id) {
            const item = this.#findOutputItem(id);
            if (!item || !window.CozyOS.OutputCenter) return;
            const folders = window.CozyOS.OutputCenter.listCategories();
            const choice = window.prompt(`Move "${item.name}" to which folder?\n${folders.map((f, i) => `${i + 1}. ${f}`).join("\n")}`, String(folders.indexOf(item.category) + 1 || 1));
            const idx = parseInt(choice, 10) - 1;
            if (idx >= 0 && idx < folders.length) { window.CozyOS.OutputCenter.move(id, folders[idx]); this.#renderMain(); }
        }

        /**
         * #scheduleBuilderAutoSave()
         *   Real, debounced (2s after the last keystroke, not on every
         *   single one) localStorage write — the explicitly requested
         *   enhancement, separate from the immediate in-memory fix above.
         *   This is what survives an actual page reload, not just a
         *   same-session re-render. Wrapped in try/catch since
         *   localStorage can throw (private browsing, quota) — auto-save
         *   failing silently is acceptable; it must never block typing.
         */
        #scheduleBuilderAutoSave() {
            if (this.#builderAutoSaveTimer) clearTimeout(this.#builderAutoSaveTimer);
            this.#builderAutoSaveTimer = setTimeout(() => {
                try {
                    window.localStorage.setItem("cozyos.builder.autosave", JSON.stringify({
                        promptText: this.#builderPromptText,
                        pastedCodeText: this.#builderPastedCodeText,
                        savedAt: new Date().toISOString()
                    }));
                } catch (_err) { /* non-fatal — auto-save is best-effort, never blocks typing */ }
            }, 2000);
        }

        /**
         * #restoreBuilderAutoSave()
         *   Real restore, called once when Developer Hub initializes —
         *   never overwrites text the user is actively typing (only
         *   applied if both fields are still at their real, empty default).
         */
        #restoreBuilderAutoSave() {
            if (this.#builderPromptText || this.#builderPastedCodeText) return; // already has real content this session — never overwrite it
            try {
                const raw = window.localStorage.getItem("cozyos.builder.autosave");
                if (!raw) return;
                const saved = JSON.parse(raw);
                this.#builderPromptText = saved.promptText || "";
                this.#builderPastedCodeText = saved.pastedCodeText || "";
            } catch (_err) { /* non-fatal — no real saved state to restore, or it's corrupted; start empty, never throw */ }
        }

        /** Real compare: is the editor's current content still exactly what was uploaded? */
        #isBuilderSourceModified() {
            if (!this.#uploadedFileOriginal) return false;
            const current = document.getElementById("cz-hub-builder-code-paste")?.value ?? "";
            return current !== this.#uploadedFileOriginal.text;
        }

        #renderUploadConfirmation() {
            if (!this.#uploadedFileOriginal) return "";
            const lang = { js: "JavaScript", html: "HTML", css: "CSS", json: "JSON", md: "Markdown" }[this.#uploadedFileOriginal.name.split(".").pop().toLowerCase()] || "Unknown";
            const current = document.getElementById("cz-hub-builder-code-paste")?.value ?? this.#uploadedFileOriginal.text;
            const modified = this.#isBuilderSourceModified();
            const lines = current.split("\n").length;
            const sizeKb = (new Blob([current]).size / 1024).toFixed(1);
            return `<div class="cz-panel" style="border-left:3px solid ${modified ? "#d97706" : "#16a34a"};">
                <p>✅ File loaded successfully</p>
                ${this.#renderKeyValueTable({
                    "Filename": this.#uploadedFileOriginal.name, "Size": `${sizeKb} KB`, "Lines": lines, "Language": lang,
                    "Module ID": this.#uploadedFileMeta?.moduleId || "—", "Version": this.#uploadedFileMeta?.version || "—"
                })}
                <p>Status: <b data-upload-status>${modified ? "Modified (Unsaved)" : "Unchanged"}</b></p>
                ${modified ? '<p class="cz-muted">Changes detected — editor differs from the original uploaded file.</p>' : ""}
            </div>`;
        }

        async #handleRefactorFileSelected(file) {
            const text = await this.#readFileAsText(file);
            const el = document.getElementById("cz-hub-refactor-html");
            if (el) el.value = text;
        }

        /**
         * #hubGenerateBlueprint()
         *   Real 2-step chain, no shortcuts invented: ArchitectureEngine.
         *   generateBlueprint(analysisId) requires a real analysisId from
         *   RequirementAnalyzer — reuses whatever text is already in the
         *   Generate tab's prompt/paste fields rather than asking for a
         *   duplicate description.
         */
        #hubGenerateBlueprint() {
            const analyzer = window.CozyOS.RequirementAnalyzer;
            const engine = window.CozyOS.ArchitectureEngine;
            if (!analyzer || !engine) { this.#devOutput('<p class="cz-muted">RequirementAnalyzer and ArchitectureEngine are both required.</p>'); return; }
            const text = (document.getElementById("cz-hub-builder-prompt")?.value || document.getElementById("cz-hub-builder-code-paste")?.value || "").trim();
            if (!text) { this.#devOutput('<p class="cz-muted">Enter a description or paste/upload source on the Generate tab first — Architecture Viewer analyzes the same input.</p>'); return; }
            try {
                const analysis = analyzer.analyzeRequirement(text);
                const blueprint = engine.generateBlueprint(analysis.id || analysis.analysisId);
                const blueprintJson = JSON.stringify(blueprint, null, 2);
                this.#devOutput(`<h3>Blueprint Generated</h3><pre class="cz-code-block">${escapeHtml(blueprintJson)}</pre>`);
                const architectureMarkdown = `# Architecture Blueprint\n\n**Analysis ID:** ${analysis.id || analysis.analysisId}\n\n\`\`\`json\n${blueprintJson}\n\`\`\`\n`;
                this.#addOutputItem({ name: `architecture-blueprint-${analysis.id || analysis.analysisId}.md`, category: "Architecture", content: architectureMarkdown, mimeType: "text/markdown", sourceOperation: "Architecture Analysis" });
            } catch (err) {
                this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`);
                this.#addOutputItem({ name: "architecture-blueprint-error.md", category: "Architecture", content: `# Architecture Blueprint — Error\n\n${err.message}`, mimeType: "text/markdown", sourceOperation: "Architecture Analysis", status: "error" });
            }
        }
        #hubViewBlueprint(blueprintId) {
            const engine = window.CozyOS.ArchitectureEngine;
            if (!engine || typeof engine.getBlueprint !== "function") { this.#devOutput('<p class="cz-muted">ArchitectureEngine is not connected.</p>'); return; }
            try {
                const blueprint = engine.getBlueprint(blueprintId);
                this.#devOutput(blueprint ? `<h3>Blueprint: ${escapeHtml(blueprintId)}</h3><pre class="cz-code-block">${escapeHtml(JSON.stringify(blueprint, null, 2))}</pre>` : '<p class="cz-muted">Blueprint not found.</p>');
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        /**
         * #hubOcrParse()
         *   Real: passes the uploaded File directly to Tesseract.js via
         *   CozyOCR.parseReceipt() (Tesseract.recognize() accepts a File
         *   object natively). Real limitation disclosed, not worked
         *   around: this coordinator's current API has no incremental
         *   progress callback, so this shows a simple "processing…" state
         *   for the real await, not a fabricated progress bar.
         */
        #hubAiModeSetMode() {
            const ai = window.CozyOS.AIMode;
            const mode = document.getElementById("cz-hub-aimode-mode")?.value;
            if (!ai || !mode) return;
            try { ai.setMode(mode); this.#devOutput(`<p>Mode switched to ${escapeHtml(mode)}.</p>`); this.#renderMain(); }
            catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        /**
         * #hubAiModeSend()
         *   Real: calls the actual requestAssistance(task, payload) gateway
         *   with exactly what the user entered — no task name or payload
         *   invented. Displays the REAL result, including the honest
         *   {handled:false, reason:...} case, which is the expected result
         *   today since no provider is registered anywhere (see this
         *   section's own disclosure note).
         */
        async #hubAiModeSend() {
            const ai = window.CozyOS.AIMode;
            const task = document.getElementById("cz-hub-aimode-task")?.value.trim();
            const payloadText = document.getElementById("cz-hub-aimode-payload")?.value.trim();
            if (!ai || !task) { this.#devOutput('<p class="cz-muted">Enter a task name first.</p>'); return; }
            let payload = {};
            if (payloadText) {
                try { payload = JSON.parse(payloadText); }
                catch (_err) { this.#devOutput('<p class="cz-muted">Payload must be valid JSON.</p>'); return; }
            }
            try {
                const result = await ai.requestAssistance(task, payload);
                this.#devOutput(result.handled
                    ? `<h3>Handled by ${escapeHtml(result.provider)}</h3><pre class="cz-code-block">${escapeHtml(JSON.stringify(result.result, null, 2))}</pre>`
                    : `<p class="cz-muted">Not handled: ${escapeHtml(result.reason)}</p>`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        async #hubOcrParse() {
            const ocr = window.CozyOS.OCR;
            const fileInput = document.getElementById("cz-hub-ocr-file");
            const lang = document.getElementById("cz-hub-ocr-lang")?.value || "eng";
            const progressEl = document.getElementById("cz-hub-ocr-progress");
            const file = fileInput?.files?.[0];
            if (!file) { this.#devOutput('<p class="cz-muted">Choose an image file first.</p>'); return; }
            if (progressEl) progressEl.textContent = "Processing…";
            try {
                const result = await ocr.parseReceipt(file, { lang });
                if (progressEl) progressEl.textContent = "";
                if (!result.available) { this.#devOutput(`<p class="cz-muted">${escapeHtml(result.reason)}</p>`); return; }
                this.#devOutput(`<h3>Parsed Receipt</h3>${this.#renderKeyValueTable({
                    merchant: result.merchantName, total: result.fields?.total, receiptNumber: result.receiptNumber,
                    confidence: result.confidence
                })}<p class="cz-muted">Heuristic extraction — review before saving.</p>`);
                this.#addOutputItem({ name: `ocr-result-${Date.now()}.json`, category: "OCR", content: JSON.stringify(result, null, 2), sourceOperation: "OCR" });
            } catch (err) {
                if (progressEl) progressEl.textContent = "";
                this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`);
                this.#addOutputItem({ name: "ocr-error.txt", category: "OCR", content: err.message, sourceOperation: "OCR", status: "error" });
            }
        }

        #hubRefactorSplit() {
            const refactor = window.CozyOS.ProjectRefactor;
            const html = document.getElementById("cz-hub-refactor-html")?.value;
            const baseName = document.getElementById("cz-hub-refactor-basename")?.value.trim() || "page";
            if (!html || !html.trim()) { this.#devOutput('<p class="cz-muted">Paste or drop an HTML file first.</p>'); return; }
            try {
                const result = refactor.splitSingleFile(html, baseName);
                this.#lastRefactorResult = result;
                this.#devOutput(`
                    <h3>Split Result</h3>
                    <p>${escapeHtml(result.detected.cssBlocksExtracted)} CSS block(s), ${escapeHtml(result.detected.jsBlocksExtracted)} JS block(s) extracted.</p>
                    ${result.warnings.map(w => `<p class="cz-muted">⚠ ${escapeHtml(w)}</p>`).join("")}
                    <div class="cz-row">
                        <button class="cz-btn" data-action="hub-download-refactor" data-part="html" data-name="${escapeHtml(baseName)}.html">Download ${escapeHtml(baseName)}.html</button>
                        ${result.css ? `<button class="cz-btn" data-action="hub-download-refactor" data-part="css" data-name="${escapeHtml(baseName)}.css">Download ${escapeHtml(baseName)}.css</button>` : ""}
                        ${result.js ? `<button class="cz-btn" data-action="hub-download-refactor" data-part="js" data-name="${escapeHtml(baseName)}.js">Download ${escapeHtml(baseName)}.js</button>` : ""}
                    </div>
                    ${result.js ? `<button class="cz-btn cz-btn-primary" data-action="hub-refactor-certify">Certify Extracted JS</button>` : ""}`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        #hubDownloadRefactor(part, name) {
            if (!this.#lastRefactorResult) return;
            const content = this.#lastRefactorResult[part];
            if (!content) return;
            downloadTextFile(name, content);
            this.#addOutputItem({ name, category: this.#builderSubTab === "refactor-merge" ? "Merged Files" : "Split Files", content, sourceOperation: this.#builderSubTab === "refactor-merge" ? "Merge Files" : "Split File" });
        }

        async #hubRefactorCertify() {
            const refactor = window.CozyOS.ProjectRefactor;
            if (!this.#lastRefactorResult || !this.#lastRefactorResult.js) { this.#devOutput('<p class="cz-muted">Nothing to certify.</p>'); return; }
            try {
                const result = await refactor.refactorAndCertify(this.#lastRefactorResult.js, { moduleId: "RefactoredModule", autoRepair: true });
                this.#devOutput(`
                    <h3>Certification</h3>
                    <p>Quick: <span class="cz-badge ${verdictBadgeClass(result.quickResult.verdict)}">${escapeHtml(result.quickResult.verdict)}</span> ${escapeHtml(result.quickResult.summary.scorePercent)}%</p>
                    ${result.recertifyResult ? `<p>Re-certified after repair: <span class="cz-badge ${verdictBadgeClass(result.recertifyResult.verdict)}">${escapeHtml(result.recertifyResult.verdict)}</span> ${escapeHtml(result.recertifyResult.summary.scorePercent)}%</p>` : ""}
                    <button class="cz-btn" data-action="hub-download-refactor-final">Download Final JS</button>`);
                this.#lastRefactorFinalJs = result.finalSource;
                const cert = result.quickResult;
                const certMarkdown = `# Certification Report

**Module:** ${cert.moduleId}
**Verdict:** ${cert.quickVerdict} (${cert.verdict})
**Score:** ${cert.summary.scorePercent}%

## Summary
| Metric | Count |
|---|---|
| Total Checks | ${cert.summary.totalChecks} |
| Passed | ${cert.summary.passed} |
| Failed | ${cert.summary.failed} |
| Warnings | ${cert.summary.warnings} |

## Defects
${(cert.defects && cert.defects.length) ? cert.defects.map(d => `- **${d.ruleId || "defect"}**: ${d.message || JSON.stringify(d)}`).join("\n") : "None."}

${result.recertifyResult ? `## Re-certification After Repair\n**Verdict:** ${result.recertifyResult.quickVerdict} — **Score:** ${result.recertifyResult.summary.scorePercent}%` : ""}
`;
                this.#addOutputItem({ name: "certification-report.md", category: "Certifications", content: certMarkdown, mimeType: "text/markdown", sourceOperation: "Quick Certification" });
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        #hubDownloadRefactorFinal() {
            if (!this.#lastRefactorFinalJs) return;
            downloadTextFile("refactored-module.js", this.#lastRefactorFinalJs);
            this.#addOutputItem({ name: "refactored-module.js", category: "Generated Code", content: this.#lastRefactorFinalJs, sourceOperation: "Certification Repair" });
        }

        #hubRefactorMerge() {
            const refactor = window.CozyOS.ProjectRefactor;
            const html = document.getElementById("cz-hub-merge-html")?.value;
            const css = document.getElementById("cz-hub-merge-css")?.value || null;
            const js = document.getElementById("cz-hub-merge-js")?.value || null;
            if (!html || !html.trim()) { this.#devOutput('<p class="cz-muted">Paste the HTML first.</p>'); return; }
            try {
                const result = refactor.mergeProject({ html, css, js });
                this.#lastRefactorResult = { html: result.html };
                this.#devOutput(`
                    <h3>Merged File</h3>
                    ${result.notes.map(n => `<p class="cz-muted">${escapeHtml(n)}</p>`).join("")}
                    <textarea class="cz-input" rows="10" readonly>${escapeHtml(result.html)}</textarea>
                    <button class="cz-btn cz-btn-primary" data-action="hub-download-refactor" data-part="html" data-name="merged.html">Download merged.html</button>`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        #hubRefactorModularize() {
            const refactor = window.CozyOS.ProjectRefactor;
            const moduleName = document.getElementById("cz-hub-modularize-name")?.value.trim() || "Module";
            const js = document.getElementById("cz-hub-modularize-js")?.value;
            const html = document.getElementById("cz-hub-modularize-html")?.value || null;
            if (!js || !js.trim()) { this.#devOutput('<p class="cz-muted">Paste the JavaScript first.</p>'); return; }
            try {
                const result = refactor.modularizeProject({ html, js }, moduleName);
                this.#lastRefactorResult = { js: result.js };
                this.#devOutput(`
                    <h3>Modularized: ${escapeHtml(result.filename)}</h3>
                    ${result.compatibilityWarnings.map(w => `<p class="cz-muted">⚠ ${escapeHtml(w)}</p>`).join("") || '<p class="cz-muted">No compatibility warnings.</p>'}
                    <button class="cz-btn cz-btn-primary" data-action="hub-download-refactor" data-part="js" data-name="${escapeHtml(result.filename)}">Download ${escapeHtml(result.filename)}</button>
                    <button class="cz-btn" data-action="hub-refactor-certify">Certify</button>`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        async #hubRefactorOptimize() {
            const refactor = window.CozyOS.ProjectRefactor;
            const moduleId = document.getElementById("cz-hub-optimize-moduleid")?.value.trim() || "OptimizedModule";
            const js = document.getElementById("cz-hub-optimize-js")?.value;
            if (!js || !js.trim()) { this.#devOutput('<p class="cz-muted">Paste the JavaScript first.</p>'); return; }
            try {
                const result = await refactor.refactorAndCertify(js, { moduleId, autoRepair: true });
                this.#lastRefactorFinalJs = result.finalSource;
                this.#devOutput(`
                    <h3>Optimize Result: ${escapeHtml(moduleId)}</h3>
                    <p>Before: <span class="cz-badge ${verdictBadgeClass(result.quickResult.verdict)}">${escapeHtml(result.quickResult.verdict)}</span> ${escapeHtml(result.quickResult.summary.scorePercent)}%</p>
                    ${result.recertifyResult ? `<p>After repair: <span class="cz-badge ${verdictBadgeClass(result.recertifyResult.verdict)}">${escapeHtml(result.recertifyResult.verdict)}</span> ${escapeHtml(result.recertifyResult.summary.scorePercent)}%</p>` : '<p class="cz-muted">No deterministically-fixable findings.</p>'}
                    <button class="cz-btn cz-btn-primary" data-action="hub-download-refactor-final">Download Optimized JS</button>`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        async #hubBuildPlan(forceGenerate = false) {
            const hub = this.#hub();
            const text = document.getElementById("cz-hub-builder-prompt")?.value.trim();
            this.#shellLiveStatus("busy");
            this.#shellUIBusy(true);
            try {
                const plan = this.#lastAnalysis?.understanding?.plan || (await hub.openWithBuilder((text || "Module").replace(/^build\s+/i, "").replace(/\s+coordinator$/i, "")));

                // Identity preservation: if a real existing file was
                // uploaded (Method 3), its actual module identity
                // overrides whatever the heuristic plan invented — this is
                // what makes "improve/bugfix/certify this file" target the
                // SAME file rather than generating a new one. Only applied
                // when it actually differs (case-insensitively) from what
                // real class-name analysis already produced — filename
                // casing is a cruder signal than a real detected class
                // name, so it never clobbers a more accurate identity.
                if (this.#pendingBuilderFiles && this.#pendingBuilderFiles.length > 0) {
                    const uploaded = this.#pendingBuilderFiles[0];
                    const realModuleId = this.#deriveModuleIdFromFilename(uploaded.name);
                    if (realModuleId && (!plan.exportName || plan.exportName.toLowerCase() !== realModuleId.toLowerCase())) {
                        plan.exportName = realModuleId;
                        plan.folder = `core/modules/${realModuleId.toLowerCase()}`;
                    }
                }

                this.#lastBuildResult = await hub.buildFromPlan(plan, "coordinator", { forceGenerate });
                this.#renderMain();
                this.#shellToast("Build complete");
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
            finally { this.#shellLiveStatus("idle"); this.#shellUIBusy(false); }
        }

        #hubDownloadFile(filename) {
            if (!this.#lastBuildResult || !this.#lastBuildResult.files[filename]) return;
            const content = this.#lastBuildResult.files[filename];
            downloadTextFile(filename, content);
            this.#addOutputItem({ name: filename, category: "Generated Code", content, sourceOperation: "Generate Code" });
        }

        // =====================================================================
        // ─── UNDERSTANDING ENGINE / OCR ────────────────────────────────────────
        // =====================================================================

        #renderUnderstanding() {
            const ue = window.CozyOS.UnderstandingEngine;
            if (!ue) return `<h1>Understanding Engine</h1><div class="cz-not-connected">Not connected.</div>`;
            const p = ue.listProviders();
            const row = (label, info) => `<div class="cz-row"><span>${escapeHtml(label)}</span><span class="cz-badge ${info.available ? "cz-badge-ready" : "cz-badge-neutral"}">${info.available ? "Ready" : "Not installed"}</span><span class="cz-muted">${escapeHtml(info.note)}</span></div>`;

            // Language Engine — real status card. Every value below is read
            // directly from the live LanguageEngine, never fabricated: real
            // count of loaded languages, the real current default, and a
            // real check of whether any loaded language is actually RTL
            // (not just whether the isRTL() method exists).
            const lang = window.CozyOS.LanguageEngine;
            const languageCard = lang ? (() => {
                const languages = lang.listLanguages();
                const currentCode = lang.getCurrentLanguage();
                const current = languages.find(l => l.code === currentCode);
                const rtlSupported = languages.some(l => l.rtl);
                return `<div class="cz-panel">
                    <div class="cz-row"><span>Language Engine</span><span class="cz-badge cz-badge-ready">Ready</span><span class="cz-muted">${escapeHtml(lang.getVersion())}</span></div>
                    <div class="cz-row"><span>Languages Loaded</span><span>${languages.length}</span><span class="cz-muted">${escapeHtml(languages.map(l => l.name).join(", "))}</span></div>
                    <div class="cz-row"><span>Default Language</span><span>${escapeHtml(current ? current.name : currentCode)}</span></div>
                    <div class="cz-row"><span>RTL Support</span><span class="cz-badge ${rtlSupported ? "cz-badge-ready" : "cz-badge-neutral"}">${rtlSupported ? "Ready" : "None loaded"}</span></div>
                </div>`;
            })() : `<div class="cz-panel"><div class="cz-row"><span>Language Engine</span><span class="cz-badge cz-badge-neutral">Not installed</span></div></div>`;

            return `<h1>Understanding Engine</h1>
                <div class="cz-panel">
                    ${row("Text Analyzer", p.textAnalyzer)}
                    ${row("Code Analyzer", p.codeAnalyzer)}
                    ${row("PDF Analyzer", p.pdfAnalyzer)}
                    ${row("Image Analyzer", p.imageAnalyzer)}
                    ${row("OCR Engine", p.ocrEngine)}
                </div>
                ${languageCard}
                <div class="cz-panel">
                    <h3>Requirement Gap Checklist</h3>
                    ${ue.listChecklist().map(c => `<span class="cz-badge cz-badge-neutral">${escapeHtml(c.label)}</span>`).join(" ")}
                </div>`;
        }

        #renderOcr() {
            const ocr = window.CozyOS.OCR;
            if (!ocr) return `<h1>OCR</h1><div class="cz-not-connected">Not connected.</div>`;
            const status = ocr.getProviderStatus();
            // Restoration fix: parseReceipt(imageSource, {lang}) has always
            // supported a real lang parameter — this UI previously exposed
            // none of it (no upload, no language choice, no result display).
            // Language codes below are real Tesseract codes; the 5
            // requested (English/Swahili/Somali/Arabic/French) map to
            // eng/swa/som/ara/fra — no 6th language invented, no claim
            // beyond what these 5 real codes represent.
            const languages = [["eng", "English"], ["swa", "Swahili"], ["som", "Somali"], ["ara", "Arabic"], ["fra", "French"]];
            return `<h1>OCR</h1>
                <div class="cz-panel">
                    <div class="cz-row"><span class="cz-badge ${status.available ? "cz-badge-ready" : "cz-badge-neutral"}">${status.available ? "Ready" : "No provider loaded"}</span><span>${escapeHtml(status.note)}</span></div>
                </div>
                <div class="cz-panel">
                    <div class="cz-field"><label>Language</label>
                        <select class="cz-input" id="cz-hub-ocr-lang">${languages.map(([code, label]) => `<option value="${code}">${escapeHtml(label)}</option>`).join("")}</select>
                    </div>
                    <div class="cz-field"><label>Receipt / Document Image</label>
                        <input type="file" id="cz-hub-ocr-file" accept="image/*" />
                    </div>
                    <button class="cz-btn cz-btn-primary" data-action="hub-ocr-parse" ${status.available ? "" : "disabled"}>Parse Receipt</button>
                    <div id="cz-hub-ocr-progress" class="cz-muted"></div>
                </div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>
                <div class="cz-panel">${this.#renderKeyValueTable(ocr.getDiagnosticsReport())}</div>`;
        }

        /**
         * #renderAiMode()
         *   AI Mode — Enterprise Intelligence Center.
         *   HONEST SCOPE: window.CozyOS.AIMode.requestAssistance(task,
         *   payload) is a real task-dispatch gateway, not a free-form
         *   conversational engine — and as of this version, ZERO providers
         *   are registered anywhere in this codebase (verified by
         *   repo-wide search before writing this panel). Every real
         *   request will honestly return {handled:false, reason:"No
         *   adapter registered..."} right now. This panel shows that real
         *   state plainly — a "Send" button that calls the real gateway
         *   and displays its real (currently-always-unhandled) result — 
         *   rather than fabricating a working chat experience. No
         *   conversation history/session management is built here: saving
         *   a history of exchanges that can never succeed would imply a
         *   working AI backend that doesn't exist yet. That is deferred
         *   until a real provider is registered, not faked now.
         */
        #renderAiMode() {
            const ai = window.CozyOS.AIMode;
            if (!ai) return `<h1>AI Mode</h1><div class="cz-not-connected">Not connected.</div>`;
            const mode = ai.getMode();
            const offline = ai.isOfflineMode();
            const registry = ai.getProviderRegistry();
            const diagnostics = ai.getDiagnosticsReport();

            return `<h1>AI Mode <span class="cz-subtitle">— Enterprise Intelligence Center</span></h1>
                <p class="cz-disclosure-note">Task-dispatch gateway, not a chat engine. ${registry.length === 0 ? "No AI provider is registered anywhere in this platform right now — every request below will honestly report as unhandled." : `${registry.length} provider(s) registered.`}</p>
                <div class="cz-panel">
                    <h3>Provider Status</h3>
                    ${this.#renderKeyValueTable({ currentMode: mode, offlineMode: offline, registeredProviders: registry.length })}
                    <div class="cz-field"><label>Mode</label>
                        <select class="cz-input" id="cz-hub-aimode-mode">${ai.listModes().map(m => `<option value="${escapeHtml(m)}" ${m === mode ? "selected" : ""}>${escapeHtml(m)}</option>`).join("")}</select>
                        <button class="cz-btn" data-action="hub-aimode-set-mode">Switch Mode</button>
                    </div>
                </div>
                <div class="cz-panel">
                    <h3>Capabilities</h3>
                    ${Array.isArray(ai.capabilities) && ai.capabilities.length ? this.#renderKeyValueTable(Object.fromEntries(ai.capabilities.map(c => [c.id, c.category]))) : `<p class="cz-muted">No capabilities advertised.</p>`}
                </div>
                <div class="cz-panel">
                    <h3>Request Composer</h3>
                    <div class="cz-field"><label>Task</label><input class="cz-input" id="cz-hub-aimode-task" placeholder="e.g. plan-build" /></div>
                    <div class="cz-field"><label>Payload (JSON)</label><textarea class="cz-input" id="cz-hub-aimode-payload" rows="4" placeholder='{"description": "..."}'></textarea></div>
                    <button class="cz-btn cz-btn-primary" data-action="hub-aimode-send">Send</button>
                </div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>
                <div class="cz-panel"><h3>Diagnostics</h3>${this.#renderKeyValueTable(diagnostics)}</div>`;
        }

        #renderKeyValueTable(obj) {
            return `<table class="cz-table"><tbody>${Object.entries(obj).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(typeof v === "object" ? JSON.stringify(v) : v)}</td></tr>`).join("")}</tbody></table>`;
        }

        // =====================================================================
        // ─── QUICK / FULL CERTIFICATION ────────────────────────────────────────
        // Same real CozyCertification calls used elsewhere in CozyOS,
        // reached through hub.quickCertifyModule()/fullCertification().
        // =====================================================================

        #renderQuickCert() {
            const workspace = window.CozyOS.WorkspaceShell;
            const files = workspace ? workspace.listFiles() : [];
            return `<h1>Quick Certification</h1>
                <p class="cz-subtitle">Drag a file in, pick it, load one already uploaded elsewhere in CozyOS, or paste source. Nothing here is ever executed; the text goes straight to CozyCertification.quickCertification().</p>
                <div class="cz-panel">
                    ${files.length > 0 ? `
                    <div class="cz-field">
                        <label>Load a file already uploaded to Workspace (from Builder, BugFixer, or a prior registration — no re-upload)</label>
                        <div class="cz-row">
                            <select class="cz-input" id="cz-hub-qc-existing-file">
                                <option value="">— Select a file —</option>
                                ${files.map(f => `<option value="${escapeHtml(f.fileId)}">${escapeHtml(f.filename)}${f.coordinator ? ` (${escapeHtml(f.coordinator)})` : ""}</option>`).join("")}
                            </select>
                            <button class="cz-btn" data-action="hub-load-existing-file">Load</button>
                        </div>
                    </div>` : ""}
                    <div class="cz-dropzone" id="cz-hub-qc-dropzone">
                        <p>Drag &amp; drop a file here (.js, .html, .css, .json, .md, .txt) — or use the picker below.</p>
                        <input type="file" id="cz-hub-qc-file" accept=".js,.html,.css,.json,.md,.txt" multiple />
                    </div>
                    <div id="cz-hub-qc-detected" class="cz-muted"></div>
                    <div class="cz-field"><label>Module ID</label><input class="cz-input" id="cz-hub-qc-moduleid" placeholder="e.g. CozySpeech" /></div>
                    <div class="cz-field"><label>Version</label><input class="cz-input" id="cz-hub-qc-version" placeholder="1.0.0" /></div>
                    <div class="cz-field"><label>Or paste source</label><textarea class="cz-input" id="cz-hub-qc-source" placeholder="Paste source, drag a file above, or load an already-uploaded file..."></textarea></div>
                    <button class="cz-btn cz-btn-primary" data-action="hub-quick-cert">Run Quick Certification</button>
                </div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        /**
         * #detectFileMetadata(filename, sourceText)
         *   Same real, regex-based extraction used throughout CozyOS —
         *   the file's own header (Version:, File Reference:, Layer:) and
         *   the "cozy-<kebab-case>.js" filename convention. Never
         *   fabricates a field it can't actually find in the text.
         */
        /** Derives a real moduleId from an actual filename — the SAME convention WorkspaceShell uses, so identity stays consistent across the pipeline. Returns null (never a fabricated name) if there's nothing real to derive from. */
        #deriveModuleIdFromFilename(filename) {
            if (!filename) return null;
            const m = /^cozy-([a-z0-9-]+)\.(js|html|css)$/i.exec(filename);
            if (m) return m[1].split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");
            const bare = filename.replace(/\.[^.]+$/, "");
            return bare || null;
        }

        #detectFileMetadata(filename, sourceText) {
            const versionMatch = /^\s*\*\s*Version:\s*(.+)$/m.exec(sourceText);
            const fileRefMatch = /^\s*\*\s*File Reference:\s*(.+)$/m.exec(sourceText);
            const layerMatch = /^\s*\*\s*Layer:\s*(.+)$/m.exec(sourceText);
            const nameMatch = /^\s*\*\s*CozyOS Enterprise Framework\s*[—-]\s*(.+)$/m.exec(sourceText);
            const kebabMatch = /^cozy-([a-z0-9-]+)\.(js|html|css)$/i.exec(filename);
            const moduleIdFromFilename = kebabMatch ? kebabMatch[1].split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("") : null;
            const ext = (filename.split(".").pop() || "").toLowerCase();
            const extToCategory = { js: "javascript", html: "html", css: "css", json: "json", md: "markdown", txt: "text" };
            return {
                moduleId: moduleIdFromFilename || (nameMatch ? nameMatch[1].replace(/\s+/g, "") : null),
                version: versionMatch ? versionMatch[1].trim() : null,
                filePath: fileRefMatch ? fileRefMatch[1].trim() : filename,
                layer: layerMatch ? layerMatch[1].trim() : null,
                category: extToCategory[ext] || "unknown",
                extension: ext
            };
        }

        #readFileAsText(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsText(file);
            });
        }

        #readFileAsArrayBuffer(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsArrayBuffer(file);
            });
        }

        /**
         * #handleZipProjectUpload(file)
         *   Real ZIP extraction via ProjectRefactor.importFromZip() (real
         *   JSZip, honestly unavailable if the library isn't loaded) +
         *   buildProjectModel() (real categorization/folder structure/
         *   RequirementReader analysis) — original paths and filenames
         *   preserved exactly, never flattened, never renamed.
         */
        /**
         * #renderProjectExplorer()
         *   Minimal, reproduced-defect fix: after a ZIP upload,
         *   #currentProjectFiles/#currentProjectModel were already being
         *   stored in memory but nothing let the user see, open, preview,
         *   or download an individual extracted file. This renders that
         *   real, already-extracted data — no new extraction logic, no
         *   duplicated ZIP handling. Deliberately minimal: Open/Preview/
         *   Download only. No bookmarks, tags, compare, rename, or
         *   history — those aren't justified by this reproduction.
         */
        #renderProjectExplorer() {
            const model = this.#currentProjectModel;
            if (!model) return "";
            const byFolder = new Map();
            for (const f of model.files) { const key = f.folder || "(root)"; if (!byFolder.has(key)) byFolder.set(key, []); byFolder.get(key).push(f); }
            const TEXT_CATEGORIES = new Set(["markup", "style", "script", "data", "documentation"]);

            return `<div class="cz-panel">
                <h3>Project Explorer</h3>
                <p class="cz-muted">${model.fileCount} file(s) across ${model.folderStructure.length} folder(s)</p>
                ${Array.from(byFolder.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([folder, files]) => `
                    <div class="cz-row"><b>📁 ${escapeHtml(folder)}</b></div>
                    ${files.map(f => `<div class="cz-row" style="padding-left:1.5em;">
                        <span>📄 ${escapeHtml(f.filename)}</span>
                        <span class="cz-muted">${escapeHtml(f.category)}</span>
                        <button class="cz-btn" data-action="hub-project-file-open" data-path="${escapeHtml(f.path)}">Open</button>
                        ${TEXT_CATEGORIES.has(f.category) ? `<button class="cz-btn" data-action="hub-project-file-preview" data-path="${escapeHtml(f.path)}">Preview</button>` : ""}
                        <button class="cz-btn" data-action="hub-project-file-download" data-path="${escapeHtml(f.path)}">Download</button>
                    </div>`).join("")}
                `).join("")}
            </div>`;
        }

        /** Open — loads the selected file's real content into Method 2's editor, so every existing single-file Builder tool (Split/Merge/Convert/Optimize, Analyze) works on it, same as any other upload. */
        #hubProjectFileOpen(path) {
            const content = this.#currentProjectFiles?.[path];
            if (content === undefined) { this.#devOutput('<p class="cz-muted">File not found in the loaded project.</p>'); return; }
            const pasteEl = document.getElementById("cz-hub-builder-code-paste");
            if (pasteEl) pasteEl.value = content;
            this.#uploadedFileOriginal = { name: path.split("/").pop(), text: content, loadedAt: new Date().toISOString() };
            this.#uploadedFileMeta = this.#detectFileMetadata(path.split("/").pop(), content);
            this.#devOutput(`<p>Loaded <b>${escapeHtml(path)}</b> into the editor above.</p>`);
            this.#renderMain();
        }

        /** Preview — real, read-only content display. Binary files are never previewed as text (they were already excluded from the button per category above). */
        #hubProjectFilePreview(path) {
            const content = this.#currentProjectFiles?.[path];
            if (content === undefined) { this.#devOutput('<p class="cz-muted">File not found in the loaded project.</p>'); return; }
            this.#devOutput(`<h3>${escapeHtml(path)}</h3><textarea class="cz-input" rows="16" readonly>${escapeHtml(content)}</textarea>`);
        }

        /** Download — real, individual file download, reusing the same established downloadTextFile()/downloadBlob() utility used everywhere else in this file. */
        #hubProjectFileDownload(path) {
            const content = this.#currentProjectFiles?.[path];
            if (content === undefined) { this.#devOutput('<p class="cz-muted">File not found in the loaded project.</p>'); return; }
            const filename = path.split("/").pop();
            if (this.#currentProjectBinaryFlags?.[path]) {
                // Real binary content — decode the base64 back to actual
                // bytes rather than saving the base64 text itself.
                const binaryString = atob(content);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
                downloadBlob(filename, bytes, "application/octet-stream");
            } else {
                downloadTextFile(filename, content);
            }
        }

        async #handleZipProjectUpload(file) {
            const refactor = window.CozyOS.ProjectRefactor;
            if (!refactor) { this.#devOutput('<p class="cz-muted">ProjectRefactor is not connected.</p>'); return; }
            try {
                const arrayBuffer = await this.#readFileAsArrayBuffer(file);
                const imported = await refactor.importFromZip(arrayBuffer);
                if (!imported.available) { this.#devOutput(`<p class="cz-muted">${escapeHtml(imported.reason)}</p>`); return; }

                const model = refactor.buildProjectModel(imported.files);
                this.#currentProjectFiles = imported.files;
                this.#currentProjectBinaryFlags = imported.binaryFlags || {};
                this.#currentProjectModel = model;

                if (model.requirementSummary) {
                    this.#requirementSummary = model.requirementSummary;
                    const hub = this.#hub();
                    this.#lastAnalysis = await hub.analyzeRequirement(model.requirementSummary);
                    this.#lastAnalysis.requirementReaderUsed = true;
                }

                this.#devOutput(`
                    <h3>Project loaded: ${escapeHtml(file.name)}</h3>
                    <p>${model.fileCount} file(s) across ${model.folderStructure.length} folder(s): ${escapeHtml(model.folderStructure.join(", ") || "(root only)")}</p>
                    ${Object.entries(model.byCategory).map(([cat, paths]) => `<p class="cz-muted">${escapeHtml(cat)}: ${escapeHtml(paths.join(", "))}</p>`).join("")}
                `);
                this.#renderMain();
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        /** Handles a file dropped or picked for Quick Certification — reads it, auto-detects metadata, and remembers its source so later Developer Actions never need it pasted again. */
        async #handleQuickFileSelected(fileOrList) {
            const files = Array.isArray(fileOrList) || (fileOrList && typeof fileOrList.length === "number" && !fileOrList.name)
                ? Array.from(fileOrList) : [fileOrList];
            if (files.length === 0 || !files[0]) return;

            const [firstFile, ...restFiles] = files;
            const sourceText = await this.#readFileAsText(firstFile);
            const meta = this.#detectFileMetadata(firstFile.name, sourceText);
            const rr = window.CozyOS.RequirementReader;
            if (rr) {
                try {
                    const reading = rr.readFile(firstFile.name, sourceText);
                    if (reading.identity.className) meta.moduleId = reading.identity.className;
                    if (reading.identity.version) meta.version = reading.identity.version;
                } catch (_err) { /* RequirementReader couldn't parse this file — existing regex-based meta above still applies */ }
            }
            this.#lastUploadedFilename = firstFile.name;
            const moduleIdEl = document.getElementById("cz-hub-qc-moduleid");
            const versionEl = document.getElementById("cz-hub-qc-version");
            const sourceEl = document.getElementById("cz-hub-qc-source");
            if (moduleIdEl && meta.moduleId) moduleIdEl.value = meta.moduleId;
            if (versionEl && meta.version) versionEl.value = meta.version;
            if (sourceEl) sourceEl.value = sourceText;

            const hub = this.#hub();
            const existing = meta.moduleId && hub ? (() => { try { return hub.getModuleCard(meta.moduleId); } catch (_err) { return null; } })() : null;
            const detectedEl = document.getElementById("cz-hub-qc-detected");
            let extraHtml = "";
            if (restFiles.length > 0 && hub) {
                const results = [];
                for (const f of restFiles) {
                    try {
                        const text = await this.#readFileAsText(f);
                        const m = this.#detectFileMetadata(f.name, text);
                        const id = m.moduleId || f.name.replace(/\.[^.]+$/, "");
                        const r = hub.quickCertifyModule(id, text, m.version || "0.0.0");
                        results.push({ name: f.name, moduleId: id, verdict: r.verdict, score: r.summary.scorePercent });
                    } catch (err) { results.push({ name: f.name, error: err.message }); }
                }
                extraHtml = `<br>Also certified: ${results.map(r => r.error ? `${escapeHtml(r.name)} (failed: ${escapeHtml(r.error)})` : `${escapeHtml(r.name)} → ${escapeHtml(r.moduleId)}: ${escapeHtml(r.verdict)} (${escapeHtml(r.score)}%)`).join("; ")}`;
            }
            if (detectedEl) {
                detectedEl.innerHTML = `Detected: <b>${escapeHtml(meta.moduleId || "unknown")}</b>
                    ${meta.version ? ` · v${escapeHtml(meta.version)}` : ""}
                    ${meta.layer ? ` · ${escapeHtml(meta.layer)}` : ""}
                    · ${escapeHtml(meta.category)} · path: ${escapeHtml(meta.filePath)}
                    ${existing && existing.goldenVersion ? ` · <b>Existing file found</b> (Golden v${escapeHtml(existing.goldenVersion)})` : ""}${extraHtml}`;
            }
        }

        /** Loads a file already registered in Workspace's file registry directly into the Quick Certification form — its real stored source, never a re-upload prompt. */
        #hubLoadExistingFile() {
            const workspace = window.CozyOS.WorkspaceShell;
            const fileId = document.getElementById("cz-hub-qc-existing-file")?.value;
            if (!workspace || !fileId) return;
            const file = workspace.getFile(fileId);
            if (!file) { this.#devOutput('<p class="cz-muted">That file is no longer registered.</p>'); return; }
            if (!file.source) {
                this.#devOutput('<p class="cz-muted">This entry has no text source on file (it was registered as a handle-only reference) — open it with CozyBugFixer\'s Edit action to read its current on-disk content first.</p>');
                return;
            }
            const moduleIdEl = document.getElementById("cz-hub-qc-moduleid");
            const versionEl = document.getElementById("cz-hub-qc-version");
            const sourceEl = document.getElementById("cz-hub-qc-source");
            if (moduleIdEl) moduleIdEl.value = file.coordinator || file.filename.replace(/\.[^.]+$/, "");
            if (versionEl) versionEl.value = file.builderVersion || versionEl.value || "";
            if (sourceEl) sourceEl.value = file.source;

            // Same RequirementReader path uploads use — a file opened from
            // Workspace is analyzed exactly like an uploaded one, and the
            // result is shared with Builder (#requirementReading/#requirementSummary)
            // and BugFixer (#bugfixerRequirementReading), so the user never
            // has to upload the same file again to use those tools.
            const rr = window.CozyOS.RequirementReader;
            if (rr) {
                try {
                    const reading = rr.readFile(file.filename, file.source);
                    this.#requirementReading = reading;
                    this.#requirementSummary = rr.generateRequirementSummary(reading.id);
                    this.#bugfixerRequirementReading = reading;
                    this.#uploadedFileOriginal = { name: file.filename, text: file.source, loadedAt: new Date().toISOString() };
                    this.#bugfixerUploadedOriginal = { name: file.filename, text: file.source, loadedAt: new Date().toISOString() };
                } catch (_err) { /* file didn't parse as code — Certification fields above are still populated */ }
            }
            this.#devOutput(`<p>Loaded <b>${escapeHtml(file.filename)}</b> (${escapeHtml(file.source.length)} characters) from Workspace.</p>`);
        }

        /**
         * #hubQuickCert()
         *   Runs the real quickCertifyModule() call, then shows the six
         *   requested Developer Actions directly below the result — every
         *   one of them reuses the source already captured here (upload,
         *   drag-drop, or existing-file load), auto-registering to
         *   Workspace first if needed, so nothing downstream ever needs
         *   the source pasted a second time.
         */
        #hubQuickCert() {
            const hub = this.#hub();
            const moduleId = document.getElementById("cz-hub-qc-moduleid")?.value.trim() || this.#deriveModuleIdFromFilename(this.#lastUploadedFilename) || "untitled_module";
            const version = document.getElementById("cz-hub-qc-version")?.value.trim() || "0.0.0";
            const source = document.getElementById("cz-hub-qc-source")?.value || "";
            try {
                const result = hub.quickCertifyModule(moduleId, source, version);
                this.#lastQuickCertModuleId = moduleId;
                this.#lastQuickCertSource = source;
                this.#retainedSources.set(moduleId, source);
                this.#lastQuickCertResult = result;
                this.#devOutput(`
                    <div class="cz-row"><span class="cz-badge ${verdictBadgeClass(result.verdict)}">${escapeHtml(result.verdict)}</span><span>${escapeHtml(result.summary.scorePercent)}%</span><span>Grade ${escapeHtml(result.overallGrade)}</span></div>
                    <div class="cz-row" style="flex-wrap:wrap;gap:6px;">
                        <button class="cz-btn" data-action="hub-export-qc" data-format="html">Export HTML</button>
                        <button class="cz-btn" data-action="hub-export-qc" data-format="markdown">Export Markdown</button>
                        <button class="cz-btn" data-action="hub-export-qc" data-format="json">Export JSON</button>
                        <button class="cz-btn" data-action="hub-export-qc" data-format="csv">Export CSV</button>
                        <button class="cz-btn" data-action="hub-export-qc" data-format="text">Export TXT</button>
                        <button class="cz-btn" data-action="hub-export-qc" data-format="pdf">Export PDF</button>
                    </div>
                    ${this.#renderQuickCertDeveloperActions(moduleId)}`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        /** Exports the last Quick Certification result — same real cert.exportReport() call and PDF pipeline as the original Certification Center. */
        /**
         * #getRetainedSource(moduleId)
         *   Tries WorkspaceShell first (the richer, authoritative source
         *   when it's connected and knows this module), then falls back to
         *   this UI's own retained-source cache — populated by every
         *   Quick Certification, Builder generation, or upload this
         *   session. Never requires WorkspaceShell to find source text.
         */
        #getRetainedSource(moduleId) {
            const cached = this.#retainedSources.get(moduleId);
            if (cached) return cached;
            const hub = this.#hub();
            if (hub) { try { const s = hub.getModuleSource(moduleId); if (s) return s; } catch (_err) { /* Workspace not connected or module not registered there — fall through */ } }
            return null;
        }

        #hubExportQuickCert(format) {
            const cert = window.CozyOS.Certification;
            if (!cert || !this.#lastQuickCertResult) { this.#devOutput('<p class="cz-muted">Nothing to export yet — run Quick Certification first.</p>'); return; }
            const filenameBase = this.#lastQuickCertModuleId || "cozyos-report";
            const content = cert.exportReport(this.#lastQuickCertResult, format === "pdf" ? "html" : format);
            if (format === "pdf") {
                const pdfBlob = textToPdfBlob(`CozyOS Certification Report — ${filenameBase}`, stripHtml(content));
                if (pdfBlob) { downloadBlob(`${filenameBase}.pdf`, pdfBlob, "application/pdf"); return; }
                const blob = new Blob([content], { type: "text/html" });
                const blobUrl = URL.createObjectURL(blob);
                const win = window.open(blobUrl, "_blank");
                if (win) { win.addEventListener ? win.addEventListener("load", () => win.print()) : setTimeout(() => win.print(), 300); }
                else window.alert("PDF library unavailable and popup blocked — could not export.");
                setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
                return;
            }
            const mimeMap = { json: "application/json", csv: "text/csv", html: "text/html", markdown: "text/markdown", text: "text/plain" };
            const extMap = { json: "json", csv: "csv", html: "html", markdown: "md", text: "txt" };
            downloadBlob(`${filenameBase}.${extMap[format] || "txt"}`, content, mimeMap[format] || "text/plain");
        }

        #renderQuickCertDeveloperActions(moduleId) {
            const actions = [
                ["hub-qc-repair", "🛠 Repair with CozyBugFixer"], ["hub-qc-open-bugfixer", "📂 Open with CozyBugFixer"],
                ["hub-qc-open-builder", "🏗 Open with CozyBuilder"], ["hub-qc-register-workspace", "📋 Register to Workspace"],
                ["hub-qc-register-registry", "📦 Register to Service Registry"], ["hub-qc-lock-release", "🔒 Lock Release"]
            ];
            return `<div class="cz-panel cz-dev-actions">
                <h3>Developer Actions</h3>
                <div class="cz-row" style="flex-wrap:wrap;gap:6px;">
                    ${actions.map(([action, label]) => `<button class="cz-btn" data-action="${action}" data-module="${escapeHtml(moduleId)}">${escapeHtml(label)}</button>`).join("")}
                </div>
            </div>`;
        }

        /** Ensures the just-certified module has a real Workspace registration, using the source already captured by Quick Certification — never re-prompts for it. */
        #ensureQuickCertWorkspaceFile(moduleId) {
            const hub = this.#hub();
            const workspace = window.CozyOS.WorkspaceShell;
            if (!workspace) throw new Error("WorkspaceShell is not connected.");
            const existing = workspace.listFiles({ coordinator: moduleId })[0];
            if (existing) return existing.fileId;
            if (moduleId !== this.#lastQuickCertModuleId || !this.#lastQuickCertSource) {
                throw new Error(`No captured source for "${moduleId}" — run Quick Certification on it first.`);
            }
            const filename = /^cozy-[a-z0-9-]+\.js$/i.test(moduleId) ? moduleId : `cozy-${moduleId.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}.js`;
            return hub.registerToWorkspace({ filename, source: this.#lastQuickCertSource });
        }

        async #hubQuickCertAction(action, moduleId) {
            const hub = this.#hub();
            try {
                switch (action) {
                    case "hub-qc-repair": {
                        const sourceText = this.#getRetainedSource(moduleId);
                        const preview = await hub.repairModule(moduleId, { approve: false, sourceText });
                        this.#renderRepairPreview(moduleId, preview);
                        break;
                    }
                    case "hub-qc-open-bugfixer": {
                        const sourceText = this.#getRetainedSource(moduleId);
                        const result = await hub.openWithBugFixer(moduleId, sourceText);
                        this.#renderOpenBugFixerResult(moduleId, result);
                        break;
                    }
                    case "hub-qc-open-builder": {
                        const plan = await hub.openWithBuilder(moduleId);
                        this.#devOutput(`<p>Plan ready: ${escapeHtml(plan.exportName)}. Visit Builder to generate.</p>`);
                        break;
                    }
                    case "hub-qc-register-workspace": {
                        const fileId = this.#ensureQuickCertWorkspaceFile(moduleId);
                        this.#devOutput(`<p>Registered to Workspace (fileId ${escapeHtml(fileId)}).</p>`);
                        break;
                    }
                    case "hub-qc-register-registry": {
                        hub.registerToServiceRegistry(moduleId);
                        this.#devOutput("<p>Registered to Service Registry.</p>");
                        break;
                    }
                    case "hub-qc-lock-release": this.#setSection("releaseCenter"); return;
                }
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        // Shared rendering for a repair preview, whether it came from
        // Workspace's richer flow or CozyBugFixer running standalone.
        #renderRepairPreview(moduleId, preview) {
            const standaloneNotice = preview.standalone
                ? `<div class="cz-panel" style="border-left:3px solid #d97706;"><p class="cz-muted">Workspace not connected. Running in standalone mode.</p></div>` : "";
            if (!preview.changed) { this.#devOutput(`${standaloneNotice}<p>No deterministically-fixable findings.</p>`); return; }
            const before = preview.preview ? preview.preview.beforeCertification : null;
            const after = preview.preview ? preview.preview.afterCertification : null;
            this.#devOutput(`${standaloneNotice}
                <p>Before: ${before ? escapeHtml(before.scorePercent) : "?"}% → After: ${after && after.available ? escapeHtml(after.scorePercent) : "?"}%</p>
                <button class="cz-btn cz-btn-primary" data-action="hub-confirm-repair" data-module="${escapeHtml(moduleId)}">Confirm &amp; Save</button>`);
        }

        #renderOpenBugFixerResult(moduleId, result) {
            const standaloneNotice = result.standalone
                ? `<div class="cz-panel" style="border-left:3px solid #d97706;"><p class="cz-muted">Workspace not connected. Running in standalone mode.</p></div>` : "";
            this.#devOutput(`${standaloneNotice}<p>Loaded into CozyBugFixer (fileId ${escapeHtml(result.bfFileId)}).</p>
                <div class="cz-row">
                    <button class="cz-btn" data-action="hub-qc-repair" data-module="${escapeHtml(moduleId)}">Repair</button>
                </div>`);
        }



        #renderFullCert() {
            return `<h1>Full Certification</h1>
                <div class="cz-panel"><button class="cz-btn cz-btn-primary" data-action="hub-full-cert">Run Full Certification</button></div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #hubFullCert() {
            const hub = this.#hub();
            try {
                const result = hub.fullCertification();
                const pr = result.platformReport;
                this.#devOutput(`<div class="cz-row"><span class="cz-badge ${verdictBadgeClass(pr.enterpriseVerdict)}">${escapeHtml(pr.enterpriseVerdictLabel)}</span><span>${escapeHtml(pr.overallPlatformScore)}%</span></div>
                    <table class="cz-table"><thead><tr><th>Module</th><th>Verdict</th><th>Score</th></tr></thead><tbody>
                    ${pr.coreModules.map(m => `<tr><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.verdict)}</td><td>${escapeHtml(m.score)}%</td></tr>`).join("")}
                    </tbody></table>`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        // =====================================================================
        // ─── BUGFIXER ─────────────────────────────────────────────────────────
        // =====================================================================

        #renderBugFixerSection() {
            const selected = this.#selectedModuleId;
            if (selected) {
                return `<h1>BugFixer: ${escapeHtml(selected)}</h1>
                    <div class="cz-panel">
                        <p class="cz-subtitle">Method 1 — Received from Builder / Module Explorer.</p>
                        <button class="cz-btn" data-action="hub-open-bugfixer" data-module="${escapeHtml(selected)}">Open with CozyBugFixer</button>
                        <button class="cz-btn cz-btn-primary" data-action="hub-repair" data-module="${escapeHtml(selected)}">Repair with CozyBugFixer</button>
                    </div>
                    <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
            }
            return `<h1>BugFixer</h1>
                <p class="cz-subtitle">No module selected via Builder/Module Explorer — use Method 2 or Method 3 below, matching Builder exactly.</p>
                <div class="cz-panel">
                    <div class="cz-field"><label>Method 2 — Paste source code</label>
                        <textarea class="cz-input" id="cz-hub-bugfixer-code-paste" rows="${this.#bugfixerUploadedOriginal ? 14 : 4}" placeholder="Paste existing JS/HTML/CSS/JSON/Markdown/TXT source here...">${this.#bugfixerUploadedOriginal ? escapeHtml(this.#bugfixerUploadedOriginal.text) : ""}</textarea>
                    </div>
                    <div class="cz-field"><label>Method 3 — Upload existing file(s)</label>
                        <div class="cz-dropzone" id="cz-hub-bugfixer-dropzone">
                            <p>Drag &amp; drop a file here (.js, .html, .css, .json, .md, .txt), or use the picker — content loads directly into Method 2's editor above.</p>
                            <input type="file" id="cz-hub-bugfixer-files" accept=".js,.html,.css,.json,.md,.txt,.zip" multiple />
                        </div>
                    </div>
                    ${this.#renderBugFixerUploadConfirmation()}
                    <button class="cz-btn cz-btn-primary" data-action="hub-bugfixer-repair-pasted">Repair</button>
                </div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #renderBugFixerUploadConfirmation() {
            if (!this.#bugfixerUploadedOriginal) return "";
            const lang = { js: "JavaScript", html: "HTML", css: "CSS", json: "JSON", md: "Markdown" }[this.#bugfixerUploadedOriginal.name.split(".").pop().toLowerCase()] || "Unknown";
            const current = document.getElementById("cz-hub-bugfixer-code-paste")?.value ?? this.#bugfixerUploadedOriginal.text;
            const modified = current !== this.#bugfixerUploadedOriginal.text;
            const lines = current.split("\n").length;
            const sizeKb = (new Blob([current]).size / 1024).toFixed(1);
            return `<div class="cz-panel" style="border-left:3px solid ${modified ? "#d97706" : "#16a34a"};">
                <p>✅ File loaded successfully</p>
                ${this.#renderKeyValueTable({
                    "Filename": this.#bugfixerUploadedOriginal.name, "Size": `${sizeKb} KB`, "Lines": lines, "Language": lang,
                    "Module ID": this.#bugfixerUploadedMeta?.moduleId || "—", "Version": this.#bugfixerUploadedMeta?.version || "—"
                })}
                <p>Status: <b data-bugfixer-upload-status>${modified ? "Modified (Unsaved)" : "Unchanged"}</b></p>
            </div>`;
        }

        async #handleBugFixerFilesSelected(fileList) {
            const files = Array.from(fileList);

            if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
                await this.#handleZipProjectRepair(files[0]);
                return;
            }

            const read = await Promise.all(files.map(async f => ({ name: f.name, text: await this.#readFileAsText(f) })));
            this.#pendingBugFixerFiles = read;
            const primary = read[0];
            if (primary) {
                const pasteEl = document.getElementById("cz-hub-bugfixer-code-paste");
                if (pasteEl) pasteEl.value = primary.text;
                this.#bugfixerUploadedOriginal = { name: primary.name, text: primary.text, loadedAt: new Date().toISOString() };
                this.#bugfixerUploadedMeta = this.#detectFileMetadata(primary.name, primary.text);
            }
            // Same RequirementReader path Builder uses — no duplicate
            // parsing. BugFixer gets real identity/dependencies/quality
            // features already extracted, not re-derived.
            const rr = window.CozyOS.RequirementReader;
            if (rr && primary) {
                try { this.#bugfixerRequirementReading = rr.readFile(primary.name, primary.text); } catch (_err) { this.#bugfixerRequirementReading = null; }
            }
            this.#renderMain();
        }

        /**
         * #handleZipProjectRepair(file)
         *   Phase 2 — BugFixer Project Mode. Reuses ProjectRefactor's
         *   exact same real importFromZip()/exportProjectAsZip() path
         *   Phase 1 established (no duplicated ZIP logic), and
         *   CozyBugFixer's new real repairProject() — never a separate
         *   repair engine. Shows exactly which files changed, offers the
         *   repaired project back as a real downloadable ZIP.
         */
        async #handleZipProjectRepair(file) {
            const refactor = window.CozyOS.ProjectRefactor;
            const bugfixer = window.CozyOS.BugFixer;
            if (!refactor) { this.#devOutput('<p class="cz-muted">ProjectRefactor is not connected.</p>'); return; }
            if (!bugfixer) { this.#devOutput('<p class="cz-muted">CozyBugFixer is not connected.</p>'); return; }
            try {
                const arrayBuffer = await this.#readFileAsArrayBuffer(file);
                const imported = await refactor.importFromZip(arrayBuffer);
                if (!imported.available) { this.#devOutput(`<p class="cz-muted">${escapeHtml(imported.reason)}</p>`); return; }

                const result = await bugfixer.repairProject(imported.files);
                this.#lastProjectRepairResult = result;
                this.#lastProjectRepairBinaryFlags = imported.binaryFlags || {};

                const changedList = Object.entries(result.report).filter(([, r]) => r.changed).map(([path]) => path);
                const unchangedList = Object.entries(result.report).filter(([, r]) => !r.changed && !r.error).map(([path]) => path);

                this.#devOutput(`
                    <h3>Project Repair: ${escapeHtml(file.name)}</h3>
                    <p>${result.fileCount} file(s) total — ${result.modifiedCount} modified, ${result.unchangedCount} unchanged, ${result.skippedCount} non-JS preserved as-is.</p>
                    ${changedList.length ? `<p><b>Changed:</b> ${escapeHtml(changedList.join(", "))}</p>` : "<p class=\"cz-muted\">No files required changes.</p>"}
                    ${unchangedList.length ? `<p class="cz-muted"><b>Unchanged:</b> ${escapeHtml(unchangedList.join(", "))}</p>` : ""}
                    <button class="cz-btn cz-btn-primary" data-action="hub-download-repaired-project">Download repaired project ZIP</button>
                `);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        async #hubDownloadRepairedProjectZip() {
            const refactor = window.CozyOS.ProjectRefactor;
            if (!refactor || !this.#lastProjectRepairResult) return;
            const exported = await refactor.exportProjectAsZip(this.#lastProjectRepairResult.files, this.#lastProjectRepairBinaryFlags || {});
            if (!exported.available) { this.#devOutput(`<p class="cz-muted">${escapeHtml(exported.reason)}</p>`); return; }
            downloadBlob("repaired-project.zip", exported.blob, "application/zip");
            this.#addOutputItem({ name: "repaired-project.zip", category: "BugFixes", content: exported.blob, mimeType: "application/zip", sourceOperation: "BugFixer" });
        }

        /** Repairs pasted/uploaded source directly — reuses CozyBugFixer's real standalone path (registerSourceText + repair), same as Builder's identity-preservation approach. */
        async #hubBugFixerRepairPasted() {
            const hub = this.#hub();
            const pastedCode = document.getElementById("cz-hub-bugfixer-code-paste")?.value.trim();
            if (!pastedCode) { this.#devOutput('<p class="cz-muted">Paste source or upload a file first.</p>'); return; }
            const meta = this.#bugfixerUploadedMeta || this.#detectFileMetadata(this.#bugfixerUploadedOriginal?.name || "untitled.js", pastedCode);
            const moduleId = meta.moduleId || this.#deriveModuleIdFromFilename(this.#bugfixerUploadedOriginal?.name) || "PastedModule";
            try {
                const preview = await hub.repairModule(moduleId, { approve: false, sourceText: pastedCode });
                this.#retainedSources.set(moduleId, pastedCode);
                this.#renderRepairPreview(moduleId, preview);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        async #hubOpenBugFixer(moduleId) {
            const hub = this.#hub();
            try {
                const sourceText = this.#getRetainedSource(moduleId);
                const result = await hub.openWithBugFixer(moduleId, sourceText);
                this.#renderOpenBugFixerResult(moduleId, result);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        async #hubRepair(moduleId) {
            const hub = this.#hub();
            this.#shellLiveStatus("busy");
            this.#shellUIBusy(true);
            try {
                const sourceText = this.#getRetainedSource(moduleId);
                const preview = await hub.repairModule(moduleId, { approve: false, sourceText });
                this.#renderRepairPreview(moduleId, preview);
                this.#shellToast("Repair complete");
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
            finally { this.#shellLiveStatus("idle"); this.#shellUIBusy(false); }
        }

        async #hubConfirmRepair(moduleId) {
            const hub = this.#hub();
            try {
                const sourceText = this.#getRetainedSource(moduleId);
                const result = await hub.repairModule(moduleId, { approve: true, sourceText });
                const standaloneNotice = result.standalone
                    ? `<div class="cz-panel" style="border-left:3px solid #d97706;"><p class="cz-muted">Workspace not connected. Running in standalone mode.</p></div>` : "";
                if (result.standalone && result.repairedSource) {
                    this.#retainedSources.set(moduleId, result.repairedSource);
                    this.#devOutput(`${standaloneNotice}
                        <p>Repaired. New certification: ${result.certResult ? escapeHtml(result.certResult.verdict) : "n/a"}.</p>
                        <button class="cz-btn cz-btn-primary" data-action="hub-download-repaired" data-module="${escapeHtml(moduleId)}" data-filename="${escapeHtml(result.repairedFilename)}">Download repaired file</button>`);
                } else {
                    this.#devOutput(`${standaloneNotice}<p>Saved. New certification: ${result.certResult ? escapeHtml(result.certResult.verdict) : "n/a"}.</p>`);
                }
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        #hubDownloadRepaired(moduleId, filename) {
            const source = this.#retainedSources.get(moduleId);
            if (!source) { this.#devOutput('<p class="cz-muted">No repaired source retained for this module.</p>'); return; }
            downloadTextFile(filename || `cozy-${moduleId.toLowerCase()}.js`, source);
        }

        // =====================================================================
        // ─── SHARE TO CLAUDE / GEMINI / CHATGPT ────────────────────────────────
        // Every field is gathered from real state already in this session —
        // the last Understanding/Build result if it matches this module, the
        // requirement text still in the Builder form, and CozyDeveloperHub's
        // own real getBuildPackageData(). Nothing here is invented, and
        // nothing pasted back is ever trusted without re-certification.
        // =====================================================================

        #hubShareClaude(moduleId) {
            const hub = this.#hub();
            try {
                const context = {};
                if (this.#lastAnalysis && this.#lastAnalysis.understanding) context.understanding = this.#lastAnalysis.understanding;
                if (this.#lastBuildResult && this.#lastBuildResult.plan && this.#lastBuildResult.plan.exportName === moduleId) {
                    context.generatedFiles = this.#lastBuildResult.files;
                }
                const promptText = document.getElementById("cz-hub-builder-prompt")?.value?.trim();
                if (promptText) context.requirement = promptText;
                const retained = this.#getRetainedSource(moduleId);
                if (retained && !context.generatedFiles) context.generatedFiles = { [`cozy-${moduleId.toLowerCase()}.js`]: retained };

                this.#lastSharePackage = { moduleId, context };
                const text = hub.generateBuildPackage(moduleId, context);

                this.#devOutput(`
                    <h3>Build Package: ${escapeHtml(moduleId)}</h3>
                    <textarea class="cz-input" id="cz-hub-share-preview" rows="14" readonly>${escapeHtml(text)}</textarea>
                    <div class="cz-row" style="flex-wrap:wrap;gap:6px;">
                        <button class="cz-btn cz-btn-primary" data-action="hub-copy-package">Copy Prompt</button>
                        <button class="cz-btn" data-action="hub-download-package" data-format="markdown">Download Markdown</button>
                        <button class="cz-btn" data-action="hub-download-package" data-format="text">Download TXT</button>
                        <button class="cz-btn" data-action="hub-download-package" data-format="json">Download JSON</button>
                    </div>
                    <div class="cz-field" style="margin-top:12px;">
                        <label>Paste back the improved file from Claude / Gemini / ChatGPT</label>
                        <textarea class="cz-input" id="cz-hub-import-source" rows="8" placeholder="Paste the improved source code here..."></textarea>
                        <button class="cz-btn cz-btn-primary" data-action="hub-import-improved" data-module="${escapeHtml(moduleId)}">Re-certify &amp; Compare</button>
                    </div>`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        #hubCopyPackage() {
            if (!this.#lastSharePackage) return;
            const hub = this.#hub();
            const text = hub.generateBuildPackage(this.#lastSharePackage.moduleId, this.#lastSharePackage.context);
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text)
                    .then(() => this.#devOutput('<p>Copied to clipboard.</p>'))
                    .catch(() => this.#devOutput('<p class="cz-muted">Could not copy automatically — select the text above and copy manually.</p>'));
            } else {
                const el = document.getElementById("cz-hub-share-preview");
                if (el && el.select) { el.select(); this.#devOutput('<p>Selected — press Ctrl/Cmd+C to copy.</p>'); }
            }
        }

        #hubDownloadPackage(format) {
            if (!this.#lastSharePackage) return;
            const hub = this.#hub();
            const { moduleId, context } = this.#lastSharePackage;
            if (format === "markdown") downloadBlob(`${moduleId}-build-package.md`, hub.generateBuildPackageMarkdown(moduleId, context), "text/markdown");
            else if (format === "json") downloadBlob(`${moduleId}-build-package.json`, hub.generateBuildPackageJSON(moduleId, context), "application/json");
            else downloadBlob(`${moduleId}-build-package.txt`, hub.generateBuildPackage(moduleId, context), "text/plain");
        }

        /**
         * #hubImportImproved(moduleId)
         *   Runs the pasted-back text through real quickCertification()
         *   only — never saves, registers, or locks anything by itself.
         *   Shows a before/after comparison; the human decides whether to
         *   proceed with Save/Register/Repair from there.
         */
        async #hubImportImproved(moduleId) {
            const hub = this.#hub();
            const improvedSource = document.getElementById("cz-hub-import-source")?.value;
            if (!improvedSource || !improvedSource.trim()) { this.#devOutput('<p class="cz-muted">Paste the improved source first.</p>'); return; }
            try {
                const result = hub.importImprovedFile(moduleId, improvedSource);
                this.#retainedSources.set(moduleId, improvedSource);
                this.#devOutput(`
                    <h3>Imported Improvement: ${escapeHtml(moduleId)}</h3>
                    <div class="cz-row">
                        <span>Before: ${result.beforeScore !== null ? escapeHtml(result.beforeScore) + "%" : "not previously certified"}</span>
                        <span>After: <b>${escapeHtml(result.afterScore)}%</b></span>
                        <span class="cz-badge ${verdictBadgeClass(result.afterVerdict)}">${escapeHtml(result.afterVerdict)}</span>
                        ${result.scoreDelta !== null ? `<span>Δ ${result.scoreDelta >= 0 ? "+" : ""}${escapeHtml(result.scoreDelta)}%</span>` : ""}
                    </div>
                    <p class="cz-muted">This is only certified, not saved. Use Save / Register to Workspace / Lock Release below to proceed, or discard it.</p>
                    <div class="cz-row">
                        <button class="cz-btn cz-btn-primary" data-action="hub-register-workspace" data-module="${escapeHtml(moduleId)}">Register to Workspace</button>
                        <button class="cz-btn" data-action="hub-save" data-module="${escapeHtml(moduleId)}">Save</button>
                    </div>`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }



        #renderWorkspaceSection() {
            const workspace = window.CozyOS.WorkspaceShell;
            if (!workspace) return `<h1>Workspace</h1><div class="cz-not-connected">Not connected.</div>`;
            const files = workspace.listFiles();
            return `<h1>Workspace</h1>
                <div class="cz-panel">
                    <table class="cz-table"><thead><tr><th>File</th><th>Coordinator</th><th>Status</th><th>Checksum</th></tr></thead><tbody>
                    ${files.map(f => `<tr><td>${escapeHtml(f.filename)}</td><td>${escapeHtml(f.coordinator || "—")}</td><td>${escapeHtml(f.workspaceStatus)}</td><td>${escapeHtml(f.sha256Checksum ? f.sha256Checksum.slice(0, 8) + "…" : "—")}</td></tr>`).join("") || '<tr><td colspan="4">No files registered.</td></tr>'}
                    </tbody></table>
                </div>`;
        }

        // =====================================================================
        // ─── MODULE EXPLORER / MODULE CARD ─────────────────────────────────────
        // Every field on a Module Card, and every action button, delegates
        // to hub.getModuleCard()/hub's action methods — no independent
        // scoring or state here.
        // =====================================================================

        #renderModuleExplorer() {
            const hub = this.#hub();
            const workspace = window.CozyOS.WorkspaceShell;
            const moduleIds = workspace ? Array.from(new Set(workspace.listFiles().map(f => f.coordinator).filter(Boolean))) : [];
            if (this.#selectedModuleId) return this.#renderModuleCard(this.#selectedModuleId);
            return `<h1>Module Explorer</h1>
                <div class="cz-panel">
                    <table class="cz-table"><thead><tr><th>Module</th><th></th></tr></thead><tbody>
                    ${moduleIds.map(id => `<tr><td>${escapeHtml(id)}</td><td><button class="cz-btn" data-action="select-module" data-module="${escapeHtml(id)}">Open</button></td></tr>`).join("") || '<tr><td colspan="2">No modules registered to Workspace yet.</td></tr>'}
                    </tbody></table>
                </div>`;
        }

        #renderModuleCard(moduleId) {
            const hub = this.#hub();
            let card;
            try { card = hub.getModuleCard(moduleId); } catch (err) { return `<h1>${escapeHtml(moduleId)}</h1><div class="cz-panel"><p class="cz-muted">${escapeHtml(err.message)}</p></div>`; }

            const actions = [
                ["hub-analyze-module", "Analyze"], ["hub-open-builder", "Open with CozyBuilder"], ["hub-quick-cert-module", "Quick Certification"],
                ["hub-full-cert", "Full Certification"], ["hub-repair", "Repair with CozyBugFixer"], ["hub-open-bugfixer", "Open with CozyBugFixer"],
                ["hub-compare", "Compare Versions"], ["hub-cert-history", "Certification History"], ["hub-repair-history", "Repair History"],
                ["hub-view-source", "View Source"], ["hub-save", "Save"], ["hub-save-as", "Save As"], ["hub-duplicate", "Duplicate"],
                ["hub-rename", "Rename"], ["hub-move", "Move"], ["hub-export", "Export"], ["hub-register-workspace", "Register Workspace"],
                ["hub-register-registry", "Register Service Registry"], ["hub-lock-release", "Lock Release"], ["hub-rollback-golden", "Rollback Golden"],
                ["hub-delete-registration", "Delete Registration"], ["hub-share-claude", "🤖 Share to Claude / Gemini / ChatGPT"]
            ];

            return `<h1>${escapeHtml(moduleId)}</h1>
                <button class="cz-btn" data-action="select-module" data-module="">← Back to Module Explorer</button>
                <div class="cz-panel">
                    ${this.#renderKeyValueTable({
                        "Category": card.category || "n/a", "File Path": card.filePath || "n/a", "Workspace Status": card.workspaceStatus,
                        "Certification Score": card.certificationScore !== null ? card.certificationScore + "%" : "n/a",
                        "Certification Grade": card.certificationGrade || "n/a", "Golden Version": card.goldenVersion || "n/a",
                        "Latest Version": card.latestVersion || "n/a", "Production Version": card.productionVersion || "n/a",
                        "Repair Status": card.repairStatus || "n/a", "Builder Version": card.builderVersion || "n/a",
                        "BugFixer Version": card.bugFixerVersion || "n/a", "Last Certified": card.lastCertified || "n/a",
                        "Last Repaired": card.lastRepaired || "n/a", "Dependencies": (card.dependencies || []).join(", ") || "none",
                        "Registered to Service Registry": card.registeredToServiceRegistry ? "Yes" : "No", "Status": card.status
                    })}
                </div>
                <div class="cz-panel cz-dev-actions">
                    <div class="cz-row" style="flex-wrap:wrap;gap:6px;">
                        ${actions.map(([action, label]) => {
                            const workspaceOnlyActions = ["hub-register-workspace", "hub-save", "hub-save-as", "hub-duplicate", "hub-rename", "hub-move", "hub-compare", "hub-rollback-golden"];
                            const workspaceUnavailable = workspaceOnlyActions.includes(action) && !window.CozyOS.WorkspaceShell;
                            const title = workspaceUnavailable ? "Workspace not connected. This action becomes available once WorkspaceShell is loaded." : "";
                            return `<button class="cz-btn" data-action="${action}" data-module="${escapeHtml(moduleId)}"${workspaceUnavailable ? ` disabled title="${escapeHtml(title)}"` : ""}>${escapeHtml(label)}</button>`;
                        }).join("")}
                    </div>
                </div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #selectModule(moduleId) { this.#selectedModuleId = moduleId || null; this.#setSection("moduleExplorer"); }

        // Generic module-action dispatcher — every case calls exactly one
        // real hub method; this function adds no scoring/repair logic.
        async #moduleAction(action, moduleId) {
            const hub = this.#hub();
            if (FORBIDDEN_KEYS.has(moduleId)) { this.#devOutput('<p class="cz-muted">Rejected module id.</p>'); return; }
            this.#diagnostics.actionsHandled++;
            this.#logAudit("MODULE_ACTION", `${action}: ${moduleId}`);
            this.emit("hubui:moduleaction", { action, moduleId });
            try {
                switch (action) {
                    case "hub-analyze-module": {
                        const src = hub.getModuleSource(moduleId);
                        const { understanding, gaps } = await hub.analyzeRequirement(src || moduleId);
                        this.#devOutput(`<p>${escapeHtml(understanding.applicationType)} — missing: ${escapeHtml(gaps.missing.map(g => g.label).join(", ") || "none")}</p>`);
                        break;
                    }
                    case "hub-open-builder": { const plan = await hub.openWithBuilder(moduleId); this.#devOutput(`<p>Plan ready: ${escapeHtml(plan.exportName)}. Visit Builder to generate.</p>`); break; }
                    case "hub-quick-cert-module": {
                        const src = hub.getModuleSource(moduleId);
                        if (!src) { this.#devOutput('<p class="cz-muted">No source on file for this module.</p>'); break; }
                        const result = hub.quickCertifyModule(moduleId, src, "workspace-triggered");
                        this.#devOutput(`<div class="cz-row"><span class="cz-badge ${verdictBadgeClass(result.verdict)}">${escapeHtml(result.verdict)}</span><span>${escapeHtml(result.summary.scorePercent)}%</span></div>`);
                        break;
                    }
                    case "hub-full-cert": this.#hubFullCert(); break;
                    case "hub-repair": await this.#hubRepair(moduleId); break;
                    case "hub-open-bugfixer": await this.#hubOpenBugFixer(moduleId); break;
                    case "hub-compare": { const cmp = hub.compareVersions(moduleId); this.#devOutput(`<p>v${escapeHtml(cmp.from.version)} (${escapeHtml(cmp.from.score)}%) → v${escapeHtml(cmp.to.version)} (${escapeHtml(cmp.to.score)}%). Fixed: ${escapeHtml(cmp.rulesFixed.join(", ") || "none")}. Regressions: ${escapeHtml(cmp.newRegressions.join(", ") || "none")}.</p>`); break; }
                    case "hub-cert-history": { const h = hub.viewCertificationHistory(moduleId); this.#devOutput(`<p>${h.length} certification record(s). Latest: ${h.length ? escapeHtml(h[h.length - 1].verdict) : "none"}.</p>`); break; }
                    case "hub-repair-history": { const h = hub.viewRepairHistory(moduleId); this.#devOutput(`<p>${h.length} repair record(s).</p>`); break; }
                    case "hub-view-source": { const src = hub.getModuleSource(moduleId); this.#devOutput(src ? `<pre style="max-height:400px;overflow:auto;">${escapeHtml(src)}</pre>` : '<p class="cz-muted">No source on file.</p>'); break; }
                    case "hub-save": { const src = this.#getRetainedSource(moduleId); if (!src) throw new Error(`No source available for "${moduleId}".`); const result = await hub.saveModule(moduleId, src); this.#devOutput(`<p>Saved. Checksum → ${escapeHtml(result.newHash.slice(0, 8))}….</p>`); break; }
                    case "hub-save-as": {
                        if (typeof window.showSaveFilePicker !== "function") { this.#devOutput('<p class="cz-muted">Save As needs the File System Access API (not available in this browser). Use Export instead.</p>'); break; }
                        const src = hub.getModuleSource(moduleId);
                        const handle = await window.showSaveFilePicker({ suggestedName: `cozy-${moduleId.toLowerCase()}.js` });
                        const writable = await handle.createWritable(); await writable.write(src); await writable.close();
                        hub.registerToWorkspace({ filename: handle.name, source: src, handle });
                        this.#devOutput(`<p>Saved as ${escapeHtml(handle.name)}.</p>`);
                        break;
                    }
                    case "hub-duplicate": { const name = window.prompt("New filename for the duplicate:", `cozy-${moduleId.toLowerCase()}-copy.js`); if (name) { hub.duplicateModule(moduleId, name); this.#devOutput(`<p>Duplicated as ${escapeHtml(name)}.</p>`); } break; }
                    case "hub-rename": { const name = window.prompt("New filename:"); if (name) { const r = hub.renameModule(moduleId, name); this.#devOutput(`<p>Renamed to ${escapeHtml(r.filename)}.</p>`); this.#selectedModuleId = r.coordinator; } break; }
                    case "hub-move": { const folder = window.prompt("New folder path:", "core/modules/"); if (folder) { const r = hub.moveModule(moduleId, folder); this.#devOutput(`<p>Moved to ${escapeHtml(r.filePath)}.</p>`); } break; }
                    case "hub-export": { const exported = hub.exportModule(moduleId); downloadTextFile(exported.filename, exported.source); this.#devOutput(`<p>Exported ${escapeHtml(exported.filename)}.</p>`); break; }
                    case "hub-register-workspace": { const src = hub.getModuleSource(moduleId); this.#devOutput(src ? "<p>Already registered to Workspace.</p>" : '<p class="cz-muted">No source to register.</p>'); break; }
                    case "hub-register-registry": { hub.registerToServiceRegistry(moduleId); this.#devOutput("<p>Registered to Service Registry.</p>"); break; }
                    case "hub-lock-release": this.#setSection("releaseCenter"); return;
                    case "hub-rollback-golden": {
                        const ok = window.confirm(`Roll back "${moduleId}" to its Golden version? This restores an earlier backup and cannot be undone.`);
                        if (!ok) break;
                        const result = await hub.rollbackGolden(moduleId);
                        this.#devOutput(`<p>Rolled back to backup from ${escapeHtml(result.restoredFromTimestamp)} — targeting Golden v${escapeHtml(result.targetGoldenVersion)} (${escapeHtml(result.targetGoldenScore)}%).</p><p class="cz-muted">${escapeHtml(result.matchConfidence)}</p>`);
                        break;
                    }
                    case "hub-delete-registration": { const ok = window.confirm(`Delete "${moduleId}"'s Service Registry registration? This cannot be undone.`); if (ok) { hub.deleteRegistration(moduleId); this.#devOutput("<p>Registration deleted.</p>"); } break; }
                    case "hub-share-claude": this.#hubShareClaude(moduleId); break;
                    default: this.#devOutput(`<p class="cz-muted">Unknown action "${escapeHtml(action)}".</p>`);
                }
            } catch (err) { this.#diagnostics.errorsShown++; this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        // =====================================================================
        // ─── APPLICATION EXPLORER / SERVICE REGISTRY / RELEASE CENTER ─────────
        // =====================================================================

        #renderApplicationExplorer() {
            const registry = window.CozyOS.ServiceRegistry;
            if (!registry || typeof registry.listApplications !== "function") return `<h1>Application Explorer</h1><div class="cz-not-connected">ServiceRegistry not connected.</div>`;
            const apps = registry.listApplications();
            return `<h1>Application Explorer</h1><div class="cz-panel">
                ${apps.length === 0 ? '<div class="cz-empty">No applications registered.</div>' : apps.map(a => `<div class="cz-row"><span>${escapeHtml(a.name)}</span><span class="cz-muted">${escapeHtml(a.category || "")}</span></div>`).join("")}
            </div>`;
        }

        #renderServiceRegistrySection() {
            const registry = window.CozyOS.ServiceRegistry;
            if (!registry) return `<h1>Service Registry</h1><div class="cz-not-connected">Not connected.</div>`;
            const coords = registry.listCoordinators();
            const apps = typeof registry.listApplications === "function" ? registry.listApplications() : [];
            return `<h1>Service Registry</h1>
                <div class="cz-panel">${this.#renderKeyValueTable({ "Registered Coordinators": coords.length, "Registered Applications": apps.length })}</div>
                <div class="cz-panel"><h3>Coordinators</h3>${coords.map(c => `<div class="cz-row"><span>${escapeHtml(c.name)}</span><span class="cz-muted">${escapeHtml(c.category)}</span></div>`).join("")}</div>`;
        }

        #renderReleaseCenter() {
            const cert = window.CozyOS.Certification;
            if (!cert || typeof cert.listReleases !== "function") return `<h1>Release Center</h1><div class="cz-not-connected">Not connected.</div>`;
            const releases = cert.listReleases();
            return `<h1>Release Center</h1><div class="cz-panel">
                <table class="cz-table"><thead><tr><th>Release</th><th>Status</th></tr></thead><tbody>
                ${releases.map(r => `<tr><td>${escapeHtml(r.name || r.releaseId)}</td><td>${escapeHtml(r.status)}</td></tr>`).join("") || '<tr><td colspan="2">No releases.</td></tr>'}
                </tbody></table>
            </div>`;
        }

        #renderGoldenVault() {
            const cert = window.CozyOS.Certification;
            const workspace = window.CozyOS.WorkspaceShell;
            if (!cert || !workspace) return `<h1>Golden Vault</h1><div class="cz-not-connected">Needs both Certification and Workspace connected.</div>`;
            const moduleIds = Array.from(new Set(workspace.listFiles().map(f => f.coordinator).filter(Boolean)));
            const rows = moduleIds.map(id => { const h = cert.listRecords(id); if (!h.length) return null; const golden = h.reduce((b, r) => r.summary.scorePercent > b.summary.scorePercent ? r : b, h[0]); return { id, golden }; }).filter(Boolean);
            return `<h1>Golden Vault</h1><div class="cz-panel">
                <table class="cz-table"><thead><tr><th>Module</th><th>Golden Version</th><th>Score</th></tr></thead><tbody>
                ${rows.map(r => `<tr><td>${escapeHtml(r.id)}</td><td>${escapeHtml(r.golden.version)}</td><td>${escapeHtml(r.golden.summary.scorePercent)}%</td></tr>`).join("") || '<tr><td colspan="3">No certified modules yet.</td></tr>'}
                </tbody></table>
            </div>`;
        }

        #renderCertHistory() {
            const selected = this.#selectedModuleId;
            const cert = window.CozyOS.Certification;
            if (!cert) return `<h1>Certification History</h1><div class="cz-not-connected">Not connected.</div>`;
            if (!selected) return `<h1>Certification History</h1><div class="cz-panel">Select a module from Module Explorer first.</div>`;
            const history = cert.listRecords(selected);
            return `<h1>Certification History: ${escapeHtml(selected)}</h1><div class="cz-panel">
                ${history.map(r => `<div class="cz-row"><span>${escapeHtml(r.timestamp)}</span><span class="cz-badge ${verdictBadgeClass(r.verdict)}">${escapeHtml(r.verdict)}</span><span>${escapeHtml(r.summary.scorePercent)}%</span></div>`).join("") || '<div class="cz-empty">No history.</div>'}
            </div>`;
        }

        #renderRepairHistory() {
            const bugfixer = window.CozyOS.BugFixer;
            if (!bugfixer) return `<h1>Repair History</h1><div class="cz-not-connected">Not connected.</div>`;
            const log = bugfixer.getRepairLog().slice().reverse();
            return `<h1>Repair History</h1><div class="cz-panel">
                ${log.map(r => `<div class="cz-row"><span>${escapeHtml(r.filename)}</span><span>${escapeHtml(r.certificationScoreBefore)}% → ${escapeHtml(r.certificationScoreAfter)}%</span><span class="cz-muted">${escapeHtml(r.timestamp)}</span></div>`).join("") || '<div class="cz-empty">No repairs yet.</div>'}
            </div>`;
        }

        // =====================================================================
        // ─── KNOWLEDGE REVIEW QUEUE / ENTERPRISE PATTERN LIBRARY ──────────────
        // =====================================================================

        #renderReviewQueue() {
            const ue = window.CozyOS.UnderstandingEngine;
            if (!ue) return `<h1>Knowledge Review Queue</h1><div class="cz-not-connected">Not connected.</div>`;
            const pending = ue.listCandidatePatterns(c => c.status === "PENDING_REVIEW");
            const rejected = ue.listCandidatePatterns(c => c.status === "REJECTED" || c.status === "REJECTED_NOT_LEARNED");
            return `<h1>Knowledge Review Queue</h1>
                <div class="cz-panel"><h3>Pending Review</h3>
                ${pending.map(c => `<div class="cz-panel">
                    <b>${escapeHtml(c.moduleId)}</b>
                    ${this.#renderKeyValueTable({ "Security Score": c.securityScore + "%", "Architecture Score": c.architectureScore + "%", "Performance Score": c.performanceScore + "%", "Similarity Score": c.similarityScore + "%" })}
                    <button class="cz-btn cz-btn-primary" data-action="hub-approve-pattern" data-id="${escapeHtml(c.id)}">Approve</button>
                    <button class="cz-btn" data-action="hub-reject-pattern" data-id="${escapeHtml(c.id)}">Reject</button>
                </div>`).join("") || '<div class="cz-empty">Nothing pending.</div>'}
                </div>
                <div class="cz-panel"><h3>Rejected (${rejected.length})</h3>${rejected.map(c => `<div class="cz-row">${escapeHtml(c.moduleId)}</div>`).join("") || '<div class="cz-empty">None.</div>'}</div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #renderPatternLibrary() {
            const ue = window.CozyOS.UnderstandingEngine;
            if (!ue) return `<h1>Enterprise Pattern Library</h1><div class="cz-not-connected">Not connected.</div>`;
            const library = ue.listEnterprisePatternLibrary();
            return `<h1>Enterprise Pattern Library</h1><div class="cz-panel">
                ${library.map(p => `<div class="cz-row"><b>${escapeHtml(p.moduleId)}</b><span>${escapeHtml(p.overallScore)}%</span><span class="cz-muted">approved ${escapeHtml(p.approvedAt)}</span></div>`).join("") || '<div class="cz-empty">Empty until a candidate is explicitly approved.</div>'}
            </div>`;
        }

        // =====================================================================
        // ─── DEVELOPER QUEUE / SEARCH / SETTINGS ──────────────────────────────
        // =====================================================================

        #renderDeveloperQueue() {
            const hub = this.#hub();
            const queue = hub.getDeveloperQueue();
            if (queue.connected === false) return `<h1>Developer Queue</h1><div class="cz-not-connected">${escapeHtml(queue.message)}</div>`;
            const buckets = { NEEDS_BUILD: [], AWAITING_CERTIFICATION: [], NEEDS_REPAIR: [], CERTIFIED: [], FAILED_CERTIFICATION: [], IN_BUILDER: [] };
            for (const e of queue.entries) (buckets[e.status] || (buckets[e.status] = [])).push(e);
            return `<h1>Developer Queue</h1>${Object.entries(buckets).filter(([, list]) => list.length).map(([status, list]) => `
                <div class="cz-panel"><h3>${escapeHtml(status)} (${list.length})</h3>
                ${list.map(e => `<div class="cz-row" data-action="select-module" data-module="${escapeHtml(e.moduleId)}" style="cursor:pointer;"><span>${escapeHtml(e.moduleId)}</span>${e.latestScore !== null ? `<span>${escapeHtml(e.latestScore)}%</span>` : ""}</div>`).join("")}
                </div>`).join("")}`;
        }

        // =====================================================================
        // ─── RESEARCH WORKSPACE ────────────────────────────────────────────────
        // Every action here calls the real window.CozyOS.ResearchEngine — this
        // file adds no ingestion, indexing, or analysis logic of its own.
        // =====================================================================

        #renderResearch() {
            const re = window.CozyOS.ResearchEngine;
            if (!re) return `<h1>Research</h1><div class="cz-not-connected">ResearchEngine is not connected.</div>`;
            const tab = this.#researchSubTab || "dashboard";
            const selectedEntry = this.#selectedResearchEntryId;
            const tabs = [["dashboard", "Dashboard"], ["new", "New Research"], ["browse", "Browse / Search"]];
            const nav = `<div class="cz-row" style="flex-wrap:wrap;gap:6px;margin-bottom:10px;">
                ${tabs.map(([id, label]) => `<button class="cz-btn${tab === id ? " cz-btn-primary" : ""}" data-action="hub-research-subtab" data-tab="${id}">${escapeHtml(label)}</button>`).join("")}
            </div>`;

            if (selectedEntry) return `<h1>Research</h1>${nav}${this.#renderResearchEntryDetail(selectedEntry)}`;
            if (tab === "new") return `<h1>Research — New Research</h1>${nav}${this.#renderResearchUpload()}`;
            if (tab === "browse") return `<h1>Research — Browse / Search</h1>${nav}${this.#renderResearchBrowse()}`;
            return `<h1>Research</h1>${nav}${this.#renderResearchDashboard()}`;
        }

        #renderResearchDashboard() {
            const re = window.CozyOS.ResearchEngine;
            const kb = re.getKnowledgeBase();
            const projects = re.listProjects();
            const tags = re.listTags();
            const types = re.listAvailableIngestTypes();
            const availRow = (label, info) => `<span class="cz-badge ${info.available ? "cz-badge-ready" : "cz-badge-neutral"}">${escapeHtml(label)}: ${info.available ? "Ready" : "Unavailable"}</span>`;
            return `
                <div class="cz-panel">
                    <h3>Ingestion Providers</h3>
                    <div class="cz-row" style="flex-wrap:wrap;">
                        ${availRow("Text", types.text)}${availRow("Code", types.code)}${availRow("PDF", types.pdf)}${availRow("Screenshot", types.screenshot)}${availRow("Video", types.video)}${availRow("Book", types.book)}
                    </div>
                </div>
                <div class="cz-panel">${this.#renderKeyValueTable({ "Knowledge Base Entries": kb.length, "Projects": projects.length, "Distinct Tags": tags.length })}</div>
                <div class="cz-panel"><h3>Projects</h3>
                    ${projects.map(p => `<div class="cz-row"><span>${escapeHtml(p.name)}</span><span class="cz-muted">${escapeHtml(p.entryIds.length)} document(s)</span></div>`).join("") || '<div class="cz-empty">No projects yet.</div>'}
                    <div class="cz-row" style="margin-top:8px;"><input class="cz-input" id="cz-hub-research-new-project" placeholder="New project name" /><button class="cz-btn" data-action="hub-research-create-project">Create Project</button></div>
                </div>
                <div class="cz-panel"><h3>Recent Documents</h3>
                    ${kb.slice(-8).reverse().map(e => `<div class="cz-row" data-action="hub-research-select" data-entry="${escapeHtml(e.id)}" style="cursor:pointer;"><span>${escapeHtml(e.title)}</span><span class="cz-muted">${escapeHtml(e.type)}</span></div>`).join("") || '<div class="cz-empty">Nothing ingested yet.</div>'}
                </div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #renderResearchUpload() {
            return `<div class="cz-panel">
                <div class="cz-field"><label>Title</label><input class="cz-input" id="cz-hub-research-title" placeholder="Document title" /></div>
                <div class="cz-field"><label>Tags (comma-separated)</label><input class="cz-input" id="cz-hub-research-tags" placeholder="requirements, church" /></div>
                <div class="cz-field"><label>Paste text or code</label><textarea class="cz-input" id="cz-hub-research-text" rows="6" placeholder="Paste plain-language requirements or source code..."></textarea>
                    <div class="cz-row"><label><input type="radio" name="cz-hub-research-kind" value="text" checked /> Text</label><label><input type="radio" name="cz-hub-research-kind" value="code" /> Code</label></div>
                    <button class="cz-btn cz-btn-primary" data-action="hub-research-ingest-text">Ingest Text/Code</button>
                </div>
                <div class="cz-field"><label>Upload a PDF</label>
                    <input type="file" id="cz-hub-research-pdf" accept=".pdf" />
                    <button class="cz-btn" data-action="hub-research-ingest-pdf">Ingest PDF</button>
                </div>
                <div class="cz-field"><label>Upload a screenshot</label>
                    <input type="file" id="cz-hub-research-screenshot" accept="image/*" />
                    <button class="cz-btn" data-action="hub-research-ingest-screenshot">Ingest Screenshot</button>
                </div>
            </div>
            <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #renderResearchBrowse() {
            const re = window.CozyOS.ResearchEngine;
            const kb = re.getKnowledgeBase();
            return `<div class="cz-panel">
                <div class="cz-row"><input class="cz-input" id="cz-hub-research-search" placeholder="Search knowledge base..." /><button class="cz-btn cz-btn-primary" data-action="hub-research-search">Search</button></div>
            </div>
            <div class="cz-panel"><h3>All Documents (${kb.length})</h3>
                ${kb.map(e => `<div class="cz-row" data-action="hub-research-select" data-entry="${escapeHtml(e.id)}" style="cursor:pointer;">
                    <span>${escapeHtml(e.title)}</span><span class="cz-muted">${escapeHtml(e.type)}</span>${e.tags.length ? `<span class="cz-muted">${e.tags.map(escapeHtml).join(", ")}</span>` : ""}
                </div>`).join("") || '<div class="cz-empty">Nothing ingested yet.</div>'}
            </div>
            <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #renderResearchEntryDetail(entryId) {
            const re = window.CozyOS.ResearchEngine;
            const entry = re.getEntry(entryId);
            if (!entry) { this.#selectedResearchEntryId = null; return '<div class="cz-panel">That document no longer exists.</div>'; }
            return `<button class="cz-btn" data-action="hub-research-deselect">← Back</button>
                <div class="cz-panel">
                    ${this.#renderKeyValueTable({
                        "Title": entry.title, "Type": entry.type, "Ingested": entry.ingestedAt,
                        "Detected Features": entry.detectedFeatures.join(", ") || "none",
                        "Principles": entry.principles.join(", ") || "none extracted yet",
                        "Tags": entry.tags.join(", ") || "none"
                    })}
                    <div class="cz-row" style="flex-wrap:wrap;gap:6px;">
                        <button class="cz-btn" data-action="hub-research-extract-principles" data-entry="${escapeHtml(entryId)}">Extract Principles</button>
                        <button class="cz-btn" data-action="hub-research-summarize" data-entry="${escapeHtml(entryId)}">Generate Summary</button>
                        <button class="cz-btn" data-action="hub-research-send-builder" data-entry="${escapeHtml(entryId)}">Send to Builder</button>
                        ${entry.type === "code" ? `<button class="cz-btn" data-action="hub-research-send-bugfixer" data-entry="${escapeHtml(entryId)}">Send to BugFixer</button>
                        <button class="cz-btn" data-action="hub-research-send-cert" data-entry="${escapeHtml(entryId)}">Send to Certification</button>` : ""}
                    </div>
                </div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #hubSetResearchSubTab(tab) { this.#researchSubTab = tab; this.#selectedResearchEntryId = null; this.#renderMain(); }
        #hubResearchSelect(entryId) { this.#selectedResearchEntryId = entryId; this.#renderMain(); }
        #hubResearchDeselect() { this.#selectedResearchEntryId = null; this.#renderMain(); }

        #hubResearchCreateProject() {
            const re = window.CozyOS.ResearchEngine;
            const name = document.getElementById("cz-hub-research-new-project")?.value.trim();
            if (!name) return;
            re.createProject(name);
            this.#renderMain();
        }

        async #hubResearchIngestText() {
            const re = window.CozyOS.ResearchEngine;
            const title = document.getElementById("cz-hub-research-title")?.value.trim() || null;
            const tags = (document.getElementById("cz-hub-research-tags")?.value || "").split(",").map(t => t.trim()).filter(Boolean);
            const text = document.getElementById("cz-hub-research-text")?.value;
            const kind = this.#root.querySelector('input[name="cz-hub-research-kind"]:checked')?.value || "text";
            if (!text || !text.trim()) { this.#devOutput('<p class="cz-muted">Paste something first.</p>'); return; }
            const result = await re.ingestDocument({ type: kind, content: text, title, tags });
            this.#devOutput(result.ingested ? `<p>Ingested. Summary: ${escapeHtml(result.summary || "n/a")}.</p>` : `<p class="cz-muted">${escapeHtml(result.reason)}</p>`);
            if (result.ingested) this.#renderMain();
        }

        async #hubResearchIngestPdf() {
            const re = window.CozyOS.ResearchEngine;
            const fileEl = document.getElementById("cz-hub-research-pdf");
            const title = document.getElementById("cz-hub-research-title")?.value.trim() || null;
            if (!fileEl || !fileEl.files[0]) { this.#devOutput('<p class="cz-muted">Choose a PDF file first.</p>'); return; }
            const buffer = await fileEl.files[0].arrayBuffer();
            const result = await re.ingestDocument({ type: "pdf", content: buffer, title: title || fileEl.files[0].name });
            this.#devOutput(result.ingested ? `<p>Ingested.</p>` : `<p class="cz-muted">${escapeHtml(result.reason)}</p>`);
            if (result.ingested) this.#renderMain();
        }

        async #hubResearchIngestScreenshot() {
            const re = window.CozyOS.ResearchEngine;
            const fileEl = document.getElementById("cz-hub-research-screenshot");
            const title = document.getElementById("cz-hub-research-title")?.value.trim() || null;
            if (!fileEl || !fileEl.files[0]) { this.#devOutput('<p class="cz-muted">Choose an image first.</p>'); return; }
            const dataUrl = await this.#readFileAsDataUrl(fileEl.files[0]);
            const result = await re.ingestDocument({ type: "screenshot", content: dataUrl, title: title || fileEl.files[0].name });
            this.#devOutput(result.ingested ? `<p>Ingested.</p>` : `<p class="cz-muted">${escapeHtml(result.reason)}</p>`);
            if (result.ingested) this.#renderMain();
        }

        #readFileAsDataUrl(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(file);
            });
        }

        #hubResearchSearch() {
            const re = window.CozyOS.ResearchEngine;
            const query = document.getElementById("cz-hub-research-search")?.value.trim();
            if (!query) return;
            const results = re.searchKnowledgeBase(query);
            this.#devOutput(results.length
                ? results.map(r => `<div class="cz-row" data-action="hub-research-select" data-entry="${escapeHtml(r.entry.id)}" style="cursor:pointer;"><span>${escapeHtml(r.entry.title)}</span><span class="cz-muted">${escapeHtml(r.matchCount)} match(es)</span></div>`).join("")
                : '<p class="cz-muted">No matches.</p>');
        }

        async #hubResearchAction(action, entryId) {
            const re = window.CozyOS.ResearchEngine;
            try {
                switch (action) {
                    case "hub-research-extract-principles": {
                        const r = re.extractPrinciples(entryId);
                        this.#devOutput(`<p>Principles: ${escapeHtml(r.principles.join(", ") || "none found")}.</p>`);
                        this.#renderMain();
                        break;
                    }
                    case "hub-research-summarize": {
                        const r = await re.generateSummary(entryId);
                        this.#devOutput(`<p><b>Source:</b> ${escapeHtml(r.source)}</p><p>${escapeHtml(r.summary)}</p>`);
                        break;
                    }
                    case "hub-research-send-builder": {
                        const plan = re.sendToBuilder(entryId);
                        this.#devOutput(`<p>Plan ready: ${escapeHtml(plan.exportName)}. Visit Builder to generate.</p>`);
                        break;
                    }
                    case "hub-research-send-bugfixer": {
                        const bfFileId = await re.sendToBugFixer(entryId);
                        this.#devOutput(`<p>Loaded into CozyBugFixer (fileId ${escapeHtml(bfFileId)}).</p>`);
                        break;
                    }
                    case "hub-research-send-cert": {
                        const r = re.sendToCertification(entryId, entryId);
                        this.#devOutput(`<div class="cz-row"><span class="cz-badge ${verdictBadgeClass(r.verdict)}">${escapeHtml(r.verdict)}</span><span>${escapeHtml(r.summary.scorePercent)}%</span></div>`);
                        break;
                    }
                }
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        // =====================================================================
        // ─── MEMORY INTELLIGENCE CENTER ────────────────────────────────────────
        // Every figure and record here comes from real window.CozyOS.CozyMemory
        // calls — this file adds no storage, search, or comparison logic of
        // its own. Semantic search / embeddings / graph / vector DB are real,
        // disclosed extension points, not simulated.
        // =====================================================================

        #renderMemory() {
            const mem = window.CozyOS.CozyMemory;
            if (!mem) return `<h1>Memory</h1><div class="cz-not-connected">CozyMemory is not connected.</div>`;
            const tab = this.#memorySubTab || "dashboard";
            const tabs = [["dashboard", "Dashboard"], ["search", "Search"], ["timeline", "Timeline"], ["graph", "Dependency Graph"], ["compare", "Compare"], ["explorer", "Memory Explorer"], ["future", "Future Ready"]];
            const nav = `<div class="cz-row" style="flex-wrap:wrap;gap:6px;margin-bottom:10px;">
                ${tabs.map(([id, label]) => `<button class="cz-btn${tab === id ? " cz-btn-primary" : ""}" data-action="hub-memory-subtab" data-tab="${id}">${escapeHtml(label)}</button>`).join("")}
            </div>`;
            const renderers = {
                dashboard: () => this.#renderMemoryDashboard(), search: () => this.#renderMemorySearch(),
                timeline: () => this.#renderMemoryTimeline(), graph: () => this.#renderMemoryGraph(),
                compare: () => this.#renderMemoryCompare(), explorer: () => this.#renderMemoryExplorer(),
                future: () => this.#renderMemoryFuture()
            };
            return `<h1>Memory Intelligence Center</h1>${nav}${(renderers[tab] || renderers.dashboard)()}`;
        }

        #renderMemoryDashboard() {
            const mem = window.CozyOS.CozyMemory;
            const namespaces = mem.listNamespaces();
            const totalEntries = namespaces.reduce((sum, n) => sum + n.entryCount, 0);
            const recent = namespaces.flatMap(n => mem.listKeys(n.name).map(e => ({ ...e, namespace: n.name })))
                .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt)).slice(0, 10);
            const certHistory = mem.listKeys("Project", e => e.key.startsWith("certification-"));
            const builderHistory = mem.listKeys("Builder", e => e.key.startsWith("build-"));

            return `
                <div class="cz-panel">${this.#renderKeyValueTable({ "Total Memories": totalEntries, "Namespaces": namespaces.length })}</div>
                <div class="cz-panel"><h3>Memory by Namespace</h3>
                    ${namespaces.map(n => `<div class="cz-row"><span>${escapeHtml(n.label)}</span><span class="cz-muted">${escapeHtml(n.entryCount)} entries</span></div>`).join("") || '<div class="cz-empty">Nothing recorded yet.</div>'}
                </div>
                <div class="cz-panel"><h3>Recently Learned / Changed</h3>
                    ${recent.map(e => `<div class="cz-row"><span>${escapeHtml(e.namespace)}/${escapeHtml(e.key)}</span><span class="cz-muted">v${escapeHtml(e.versionNumber)} · ${escapeHtml(e.savedAt)}</span></div>`).join("") || '<div class="cz-empty">Nothing yet.</div>'}
                </div>
                <div class="cz-panel"><h3>Certification History (${certHistory.length})</h3>
                    ${certHistory.slice(-5).reverse().map(e => `<div class="cz-row"><span>${escapeHtml(e.value.moduleId)}</span><span class="cz-badge ${verdictBadgeClass(e.value.verdict)}">${escapeHtml(e.value.verdict)}</span></div>`).join("") || '<div class="cz-empty">None yet.</div>'}
                </div>
                <div class="cz-panel"><h3>Builder History (${builderHistory.length})</h3>
                    ${builderHistory.slice(-5).reverse().map(e => `<div class="cz-row"><span>${escapeHtml(e.value.plan ? e.value.plan.exportName : e.key)}</span><span class="cz-muted">${escapeHtml(e.value.mode)}</span></div>`).join("") || '<div class="cz-empty">None yet.</div>'}
                </div>`;
        }

        #renderMemorySearch() {
            return `<div class="cz-panel">
                <div class="cz-row">
                    <input class="cz-input" id="cz-hub-memory-search" placeholder="Full text..." />
                    <input class="cz-input" id="cz-hub-memory-search-ns" placeholder="Namespace (optional)" />
                    <button class="cz-btn cz-btn-primary" data-action="hub-memory-search">Search</button>
                </div>
                <p class="cz-muted">Searches full text and tags across the given namespace, or every namespace if left blank. Date/Project/Engine filtering can be done by searching those terms directly — there is no separate faceted index yet.</p>
            </div>
            <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #renderMemoryTimeline() {
            const mem = window.CozyOS.CozyMemory;
            const events = mem.getTimeline().slice(-30).reverse();
            return `<div class="cz-panel"><h3>Visual History</h3>
                ${events.map(e => `<div class="cz-row"><span>⬤</span><span>${escapeHtml(e.label)}</span><span class="cz-muted">${escapeHtml(e.time)}</span></div>`).join("") || '<div class="cz-empty">No timeline events yet.</div>'}
            </div>`;
        }

        #renderMemoryGraph() {
            const workspace = window.CozyOS.WorkspaceShell;
            const moduleIds = workspace ? Array.from(new Set(workspace.listFiles().map(f => f.coordinator).filter(Boolean))) : [];
            return `<div class="cz-panel">
                <div class="cz-field"><label>Module</label>
                    <select class="cz-input" id="cz-hub-memory-graph-module">
                        <option value="">— Select —</option>
                        ${moduleIds.map(id => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join("")}
                    </select>
                    <button class="cz-btn cz-btn-primary" data-action="hub-memory-graph">Show Pipeline</button>
                </div>
                <p class="cz-muted">Traces the real pipeline stages actually recorded in Memory for this module — Research → Requirement → Builder → Certification. A stage is only shown if a real record exists; nothing here is inferred.</p>
            </div>
            <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #renderMemoryCompare() {
            return `<div class="cz-panel">
                <div class="cz-field"><label>Namespace</label><input class="cz-input" id="cz-hub-memory-compare-ns" placeholder="Builder" /></div>
                <div class="cz-row">
                    <input class="cz-input" id="cz-hub-memory-compare-a" placeholder="Key A (or key + version A)" />
                    <input class="cz-input" id="cz-hub-memory-compare-b" placeholder="Key B (or version B)" />
                </div>
                <div class="cz-row">
                    <button class="cz-btn" data-action="hub-memory-compare-keys">Compare Two Memories</button>
                    <button class="cz-btn" data-action="hub-memory-compare-versions">Compare Two Versions (same key)</button>
                </div>
            </div>
            <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #renderMemoryExplorer() {
            const mem = window.CozyOS.CozyMemory;
            const namespaces = mem.listNamespaces();
            const active = this.#memoryExplorerNamespace || (namespaces[0] && namespaces[0].name);
            return `<div class="cz-panel">
                <div class="cz-row" style="flex-wrap:wrap;gap:6px;">
                    ${namespaces.map(n => `<button class="cz-btn${active === n.name ? " cz-btn-primary" : ""}" data-action="hub-memory-explore-ns" data-ns="${escapeHtml(n.name)}">${escapeHtml(n.label)} (${n.entryCount})</button>`).join("") || '<span class="cz-muted">No namespaces yet.</span>'}
                </div>
            </div>
            ${active ? `<div class="cz-panel"><h3>${escapeHtml(active)}</h3>
                ${mem.listKeys(active).map(e => `<div class="cz-row"><span>${escapeHtml(e.key)}</span><span class="cz-muted">v${escapeHtml(e.versionNumber)}</span><span class="cz-muted">${escapeHtml((e.tags || []).join(", "))}</span></div>`).join("") || '<div class="cz-empty">Empty.</div>'}
            </div>` : ""}`;
        }

        #renderMemoryFuture() {
            return `<div class="cz-panel">
                <h3>Future-Ready Extension Points</h3>
                <p class="cz-muted">These are real, currently-empty extension points — not simulated capability.</p>
                ${["Semantic search (needs an embedding model — none exists here)", "AI embeddings storage (needs an embedding model)", "Graph database backing (currently a flat namespaced Map)", "Vector database backing (needs a vector index)"].map(f => `<div class="cz-row">○ ${escapeHtml(f)}</div>`).join("")}
            </div>`;
        }

        #hubSetMemorySubTab(tab) { this.#memorySubTab = tab; this.#renderMain(); }
        #hubMemoryExploreNamespace(ns) { this.#memoryExplorerNamespace = ns; this.#renderMain(); }

        #hubMemorySearch() {
            const mem = window.CozyOS.CozyMemory;
            const query = document.getElementById("cz-hub-memory-search")?.value.trim();
            const ns = document.getElementById("cz-hub-memory-search-ns")?.value.trim();
            if (!query) { this.#devOutput('<p class="cz-muted">Type something to search.</p>'); return; }
            try {
                const results = ns ? mem.searchMemory(ns, query).map(r => ({ namespace: ns, ...r })) : mem.searchAllNamespaces(query);
                this.#devOutput(results.length
                    ? results.map(r => `<div class="cz-row"><span>${escapeHtml(r.namespace)}/${escapeHtml(r.key)}</span><span class="cz-muted">${escapeHtml(r.matchCount)} match(es)</span></div>`).join("")
                    : '<p class="cz-muted">No matches.</p>');
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        #hubMemoryGraph() {
            const mem = window.CozyOS.CozyMemory;
            const moduleId = document.getElementById("cz-hub-memory-graph-module")?.value;
            if (!moduleId) { this.#devOutput('<p class="cz-muted">Select a module first.</p>'); return; }
            const stages = [];
            const research = mem.searchMemory("Research", moduleId);
            if (research.length) stages.push(`Research Added (${research.length} document(s))`);
            const requirement = mem.searchMemory("Project", moduleId).filter(r => r.key.startsWith("requirement-"));
            if (requirement.length) stages.push("Requirement Generated");
            const build = mem.listKeys("Builder", e => e.key.startsWith("build-") && e.value.plan && e.value.plan.exportName === moduleId);
            if (build.length) stages.push(`Builder Generated Code (${build.length} build(s))`);
            const repairs = mem.listKeys("Builder", e => e.key.startsWith("repair-") && e.value.filename && e.value.filename.includes(moduleId.toLowerCase()));
            if (repairs.length) stages.push(`Bug Fixed (${repairs.length} repair(s))`);
            const cert = mem.listKeys("Project", e => e.key === `certification-${moduleId}`);
            if (cert.length) stages.push(`Certified (${cert[0].value.verdict})`);
            this.#devOutput(stages.length
                ? stages.map((s, i) => `<div class="cz-row">${i > 0 ? "↓" : ""} ${escapeHtml(s)}</div>`).join("")
                : '<p class="cz-muted">No real pipeline stages recorded for this module yet.</p>');
        }

        #hubMemoryCompareKeys() {
            const mem = window.CozyOS.CozyMemory;
            const ns = document.getElementById("cz-hub-memory-compare-ns")?.value.trim() || "Builder";
            const a = document.getElementById("cz-hub-memory-compare-a")?.value.trim();
            const b = document.getElementById("cz-hub-memory-compare-b")?.value.trim();
            if (!a || !b) { this.#devOutput('<p class="cz-muted">Enter both keys.</p>'); return; }
            try {
                const r = mem.compareMemory(ns, a, b);
                this.#devOutput(`<p>Identical: ${r.identical}</p>${r.addedKeys ? `<p>Added: ${escapeHtml(r.addedKeys.join(", ") || "none")}</p><p>Removed: ${escapeHtml(r.removedKeys.join(", ") || "none")}</p><p>Changed: ${escapeHtml(r.changedKeys.join(", ") || "none")}</p>` : ""}`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        #hubMemoryCompareVersions() {
            const mem = window.CozyOS.CozyMemory;
            const ns = document.getElementById("cz-hub-memory-compare-ns")?.value.trim() || "Builder";
            const key = document.getElementById("cz-hub-memory-compare-a")?.value.trim();
            const versions = document.getElementById("cz-hub-memory-compare-b")?.value.trim();
            const [vA, vB] = (versions || "").split(",").map(v => parseInt(v.trim(), 10));
            if (!key || !vA || !vB) { this.#devOutput('<p class="cz-muted">Enter a key in field A and "v1,v2" in field B.</p>'); return; }
            try {
                const r = mem.compareVersions(ns, key, vA, vB);
                this.#devOutput(`<p>Identical: ${r.identical}</p><p>v${vA} saved ${escapeHtml(r.savedAtA)} → v${vB} saved ${escapeHtml(r.savedAtB)}</p>`);
            } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); }
        }

        #renderSearch() {
            return `<h1>Search</h1>
                <div class="cz-panel"><input class="cz-input" id="cz-hub-search-input" placeholder="Search everything..." /><button class="cz-btn cz-btn-primary" data-action="hub-search">Search</button></div>
                <div class="cz-panel cz-dev-action-output-panel" id="cz-hub-output"></div>`;
        }

        #hubSearch(query) {
            const hub = this.#hub();
            if (!query) return;
            const r = hub.globalSearch(query);
            this.#devOutput(`
                <p><b>Modules:</b> ${escapeHtml(r.modules.join(", ") || "none")}</p>
                <p><b>Applications:</b> ${escapeHtml(r.applications.map(a => a.name).join(", ") || "none")}</p>
                <p><b>Repairs:</b> ${escapeHtml(r.repairs.map(x => x.filename).join(", ") || "none")}</p>
                <p><b>Releases:</b> ${escapeHtml(r.releases.map(x => x.name || x.releaseId).join(", ") || "none")}</p>
                <p><b>Pattern Library:</b> ${escapeHtml(r.patternLibrary.map(x => x.moduleId).join(", ") || "none")}</p>`);
        }

        #renderSettings() {
            const hub = this.#hub();
            return `<h1>Settings</h1><div class="cz-panel">${this.#renderKeyValueTable(hub.getDiagnosticsReport())}</div>`;
        }

        // =====================================================================
        // ─── EVENTS ───────────────────────────────────────────────────────────
        // =====================================================================

        #bindEvents() {
            if (this.#eventsBound) return;
            this.#eventsBound = true;
            this.#root.addEventListener("click", (evt) => this.#handleClick(evt));
            this.#root.addEventListener("input", (evt) => {
                if (evt.target.id === "cz-output-search") {
                    this.#outputSearchQuery = evt.target.value;
                    this.#renderMain();
                    const refocused = this.#root.querySelector("#cz-output-search");
                    if (refocused) { refocused.focus(); refocused.setSelectionRange(refocused.value.length, refocused.value.length); }
                    return;
                }
                if (evt.target.id === "cz-hub-builder-prompt") {
                    // Root-cause fix: this is what was missing entirely —
                    // capture every keystroke into a real field the
                    // render template actually reads back, so a re-render
                    // (including the "Generate" tab-switch, which was
                    // never a submit action) never silently discards it.
                    this.#builderPromptText = evt.target.value;
                    this.#scheduleBuilderAutoSave();
                }
                if (evt.target.id === "cz-hub-builder-code-paste") {
                    this.#builderPastedCodeText = evt.target.value;
                    this.#scheduleBuilderAutoSave();
                    if (this.#uploadedFileOriginal) {
                        const modified = this.#isBuilderSourceModified();
                        const statusCell = this.#root.querySelector("[data-upload-status]");
                        if (statusCell) statusCell.textContent = modified ? "Modified (Unsaved)" : "Unchanged";
                    }
                }
                if (evt.target.id === "cz-hub-bugfixer-code-paste" && this.#bugfixerUploadedOriginal) {
                    const modified = evt.target.value !== this.#bugfixerUploadedOriginal.text;
                    const statusCell = this.#root.querySelector("[data-bugfixer-upload-status]");
                    if (statusCell) statusCell.textContent = modified ? "Modified (Unsaved)" : "Unchanged";
                }
            });
            this.#root.addEventListener("change", (evt) => {
                if (evt.target.id === "cz-hub-qc-file" && evt.target.files && evt.target.files.length > 0) {
                    this.#handleQuickFileSelected(evt.target.files);
                }
                if (evt.target.id === "cz-hub-builder-files" && evt.target.files && evt.target.files.length > 0) {
                    this.#handleBuilderFilesSelected(evt.target.files);
                }
                if (evt.target.id === "cz-hub-bugfixer-files" && evt.target.files && evt.target.files.length > 0) {
                    this.#handleBugFixerFilesSelected(evt.target.files);
                }
                if (evt.target.id === "cz-hub-refactor-file" && evt.target.files && evt.target.files[0]) {
                    this.#handleRefactorFileSelected(evt.target.files[0]);
                }
            });
            this.#root.addEventListener("dragover", (evt) => {
                const zone = evt.target.closest("#cz-hub-qc-dropzone, #cz-hub-builder-dropzone, #cz-hub-refactor-dropzone, #cz-hub-bugfixer-dropzone");
                if (zone) { evt.preventDefault(); zone.classList.add("cz-dropzone-active"); }
            });
            this.#root.addEventListener("dragleave", (evt) => {
                const zone = evt.target.closest("#cz-hub-qc-dropzone, #cz-hub-builder-dropzone, #cz-hub-refactor-dropzone, #cz-hub-bugfixer-dropzone");
                if (zone) zone.classList.remove("cz-dropzone-active");
            });
            this.#root.addEventListener("drop", (evt) => {
                const qcZone = evt.target.closest("#cz-hub-qc-dropzone");
                const builderZone = evt.target.closest("#cz-hub-builder-dropzone");
                const refactorZone = evt.target.closest("#cz-hub-refactor-dropzone");
                const bugfixerZone = evt.target.closest("#cz-hub-bugfixer-dropzone");
                if (!qcZone && !builderZone && !refactorZone && !bugfixerZone) return;
                evt.preventDefault();
                (qcZone || builderZone || refactorZone || bugfixerZone).classList.remove("cz-dropzone-active");
                const droppedFiles = evt.dataTransfer && evt.dataTransfer.files;
                if (!droppedFiles || droppedFiles.length === 0) return;
                if (qcZone) this.#handleQuickFileSelected(droppedFiles);
                else if (builderZone) this.#handleBuilderFilesSelected(droppedFiles);
                else if (bugfixerZone) this.#handleBugFixerFilesSelected(droppedFiles);
                else this.#handleRefactorFileSelected(droppedFiles[0]);
            });
        }

        #handleClick(evt) {
            const navEl = evt.target.closest("[data-section]");
            if (navEl) { this.#setSection(navEl.getAttribute("data-section")); return; }

            const actionEl = evt.target.closest("[data-action]");
            if (!actionEl) return;
            const action = actionEl.getAttribute("data-action");
            const moduleId = actionEl.getAttribute("data-module");

            switch (action) {
                case "select-module": this.#selectModule(moduleId); return;
                case "hub-analyze": this.#hubAnalyze(); return;
                case "hub-build-plan": this.#hubBuildPlan(); return;
                case "hub-goto-section": this.#setSection(actionEl.getAttribute("data-section-target")); return;
                case "hub-force-generate": this.#hubBuildPlan(true); return;
                case "hub-download-file": this.#hubDownloadFile(actionEl.getAttribute("data-file")); return;
                case "hub-builder-subtab": this.#hubSetBuilderSubTab(actionEl.getAttribute("data-tab")); return;
                case "hub-builder-group": this.#hubSetBuilderGroup(actionEl.getAttribute("data-group")); return;
                case "hub-zip-create-project": this.#hubZipCreateProject(); return;
                case "hub-zip-create-single": this.#hubZipCreateSingle(); return;
                case "hub-rename-apply": this.#hubRenameApply(); return;
                case "hub-output-preview": this.#hubOutputPreview(actionEl.getAttribute("data-output-id")); return;
                case "hub-output-copy": this.#hubOutputCopy(actionEl.getAttribute("data-output-id")); return;
                case "hub-output-download": this.#hubOutputDownload(actionEl.getAttribute("data-output-id")); return;
                case "hub-output-rename": this.#hubOutputRename(actionEl.getAttribute("data-output-id")); return;
                case "hub-output-delete": this.#hubOutputDelete(actionEl.getAttribute("data-output-id")); return;
                case "hub-output-restore": this.#hubOutputRestore(actionEl.getAttribute("data-output-id")); return;
                case "hub-output-export-zip": this.#hubOutputExportZip(actionEl.getAttribute("data-output-id")); return;
                case "hub-output-add-to-collection": this.#hubOutputAddToCollection(actionEl.getAttribute("data-output-id")); return;
                case "hub-collection-download": this.#hubCollectionDownload(actionEl.getAttribute("data-collection-name")); return;
                case "hub-empty-trash": this.#hubEmptyTrash(); return;
                case "hub-output-open": this.#hubOutputOpen(actionEl.getAttribute("data-output-id")); return;
                case "hub-output-duplicate": this.#hubOutputDuplicate(actionEl.getAttribute("data-output-id")); return;
                case "hub-output-move": this.#hubOutputMove(actionEl.getAttribute("data-output-id")); return;
                case "hub-export-builder-log": this.#hubExportBuilderLog(); return;
                case "hub-timeline-open": {
                    const outputId = actionEl.getAttribute("data-output-id");
                    const item = this.#findOutputItem(outputId);
                    if (item) {
                        this.#builderActiveGroup = "output-center";
                        this.#builderSubTab = "output-list";
                        this.#renderMain();
                        // Real jump-to-item: after the Output Center re-renders,
                        // scroll the real, matching item into view and open its
                        // real preview if it's text — not a fabricated deep link.
                        requestAnimationFrame(() => {
                            const el = this.#root.querySelector(`[data-output-id="${outputId}"]`)?.closest(".cz-panel");
                            if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); if (!item.isBinary) this.#hubOutputPreview(outputId); }
                        });
                    }
                    return;
                }
                case "hub-refactor-split": this.#hubRefactorSplit(); return;
                case "hub-generate-blueprint": this.#hubGenerateBlueprint(); return;
                case "hub-ocr-parse": this.#hubOcrParse(); return;
                case "hub-aimode-set-mode": this.#hubAiModeSetMode(); return;
                case "hub-aimode-send": this.#hubAiModeSend(); return;
                case "hub-view-blueprint": this.#hubViewBlueprint(evt.target.getAttribute("data-blueprint-id")); return;
                case "hub-download-refactor": this.#hubDownloadRefactor(actionEl.getAttribute("data-part"), actionEl.getAttribute("data-name")); return;
                case "hub-refactor-certify": this.#hubRefactorCertify(); return;
                case "hub-download-refactor-final": this.#hubDownloadRefactorFinal(); return;
                case "hub-refactor-merge": this.#hubRefactorMerge(); return;
                case "hub-refactor-modularize": this.#hubRefactorModularize(); return;
                case "hub-refactor-optimize": this.#hubRefactorOptimize(); return;
                case "hub-research-subtab": this.#hubSetResearchSubTab(actionEl.getAttribute("data-tab")); return;
                case "hub-research-select": this.#hubResearchSelect(actionEl.getAttribute("data-entry")); return;
                case "hub-research-deselect": this.#hubResearchDeselect(); return;
                case "hub-research-create-project": this.#hubResearchCreateProject(); return;
                case "hub-research-ingest-text": this.#hubResearchIngestText(); return;
                case "hub-research-ingest-pdf": this.#hubResearchIngestPdf(); return;
                case "hub-research-ingest-screenshot": this.#hubResearchIngestScreenshot(); return;
                case "hub-research-search": this.#hubResearchSearch(); return;
                case "hub-research-extract-principles": case "hub-research-summarize": case "hub-research-send-builder":
                case "hub-research-send-bugfixer": case "hub-research-send-cert":
                    this.#hubResearchAction(action, actionEl.getAttribute("data-entry")); return;
                case "hub-memory-subtab": this.#hubSetMemorySubTab(actionEl.getAttribute("data-tab")); return;
                case "hub-memory-search": this.#hubMemorySearch(); return;
                case "hub-memory-graph": this.#hubMemoryGraph(); return;
                case "hub-memory-compare-keys": this.#hubMemoryCompareKeys(); return;
                case "hub-memory-compare-versions": this.#hubMemoryCompareVersions(); return;
                case "hub-memory-explore-ns": this.#hubMemoryExploreNamespace(actionEl.getAttribute("data-ns")); return;
                case "hub-quick-cert": this.#hubQuickCert(); return;
                case "hub-load-existing-file": this.#hubLoadExistingFile(); return;
                case "hub-export-qc": this.#hubExportQuickCert(actionEl.getAttribute("data-format")); return;
                case "hub-qc-repair": case "hub-qc-open-bugfixer": case "hub-qc-open-builder":
                case "hub-qc-register-workspace": case "hub-qc-register-registry": case "hub-qc-lock-release":
                    this.#hubQuickCertAction(action, moduleId); return;
                case "hub-confirm-repair": this.#hubConfirmRepair(moduleId); return;
                case "hub-full-cert": this.#hubFullCert(); return;
                case "hub-open-bugfixer": this.#hubOpenBugFixer(moduleId); return;
                case "hub-repair": this.#hubRepair(moduleId); return;
                case "hub-download-repaired-project": this.#hubDownloadRepairedProjectZip(); return;
                case "hub-project-file-open": this.#hubProjectFileOpen(actionEl.getAttribute("data-path")); return;
                case "hub-project-file-preview": this.#hubProjectFilePreview(actionEl.getAttribute("data-path")); return;
                case "hub-project-file-download": this.#hubProjectFileDownload(actionEl.getAttribute("data-path")); return;
                case "hub-bugfixer-repair-pasted": this.#hubBugFixerRepairPasted(); return;
                case "hub-download-repaired": this.#hubDownloadRepaired(moduleId, actionEl.getAttribute("data-filename")); return;
                case "hub-copy-package": this.#hubCopyPackage(); return;
                case "hub-download-package": this.#hubDownloadPackage(actionEl.getAttribute("data-format")); return;
                case "hub-import-improved": this.#hubImportImproved(moduleId); return;
                case "hub-approve-pattern": { try { window.CozyOS.UnderstandingEngine.approveCandidatePattern(actionEl.getAttribute("data-id")); this.#renderMain(); } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); } return; }
                case "hub-reject-pattern": { try { window.CozyOS.UnderstandingEngine.rejectCandidatePattern(actionEl.getAttribute("data-id"), "Rejected from Knowledge Review Queue."); this.#renderMain(); } catch (err) { this.#devOutput(`<p class="cz-muted">${escapeHtml(err.message)}</p>`); } return; }
                case "hub-search": this.#hubSearch(document.getElementById("cz-hub-search-input")?.value.trim()); return;
                default:
                    if (action.startsWith("hub-")) { this.#moduleAction(action, moduleId); return; }
            }
        }
    }

    /**
     * initMount()
     *   Real compatibility fix for CozyOS shell integration: Developer
     *   Hub may now be loaded by core/ui/cozy-shell.html dynamically
     *   (a script inserted into an already-loaded page), not just as a
     *   traditional full-page load. A DOMContentLoaded-only listener
     *   would silently never fire in that case, since the event has
     *   already passed by the time this script runs — the same real
     *   risk already guarded against in mpesaOS.js's own shell script.
     *   A bounded retry additionally covers the case where the shell
     *   hasn't yet inserted #cozy-developer-hub-root into the DOM at
     *   the moment this script executes (the same retry convention
     *   already used for registerCoordinator() elsewhere in CozyOS).
     *   This assumes no shell API beyond the one documented workspace
     *   div ID — nothing here invents or duplicates shell behavior.
     */
    /**
     * Module registration for CozyOS.UI.loadModule("developer-hub").
     *
     * HONEST DISCLOSURE: the exact contract loadModule() expects is not
     * available to this file (cozy-ui.js is Gemini-owned and was not
     * provided). This registration shape — a singleton exposing
     * init(container)/destroy() under window.CozyOS.Modules["developer-hub"]
     * — is the most reasonable, standard module-loader convention given
     * the evidence: the explicit init()/destroy() lifecycle requirement,
     * and the observed "System Alert: undefined" symptom, which is
     * consistent with the loader looking up a registered module by name
     * and finding nothing there.
     *
     * RULE 21 UPDATE — real contract now verified against the actual
     * core/ui/cozy-ui.js (previously unavailable, so the shape below was
     * a disclosed guess; it is no longer a guess):
     *   const app = window.CozyOS.Modules?.[moduleName];
     *   ...
     *   root.innerHTML = app.getDashboard?.() || "";
     *   if (app.init) app.init();
     * Two real mismatches existed and are fixed below:
     *   1. The loader calls init() with ZERO arguments, not init(container).
     *      The old init(container) threw "a valid DOM container element is
     *      required" every time, since container was always undefined —
     *      this was the exact cause of the "System Alert: undefined"
     *      symptom this file already anticipated.
     *   2. The loader requires a getDashboard() method, which did not
     *      exist here, so root.innerHTML was cleared to "" before init()
     *      ever ran.
     */
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};

    if (window.CozyOS.Modules["developer-hub"] && window.CozyOS.Modules["developer-hub"].version) {
        const existingVersion = window.CozyOS.Modules["developer-hub"].version;
        if (existingVersion !== HUB_UI_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: developer-hub module existing v${existingVersion} conflicts with load target v${HUB_UI_VERSION}.`);
        }
        return;
    }

    let singletonInstance = null;
    window.CozyOS.Modules["developer-hub"] = {
        version: HUB_UI_VERSION,
        /**
         * files — a real, self-declared manifest of Developer Hub's own
         * asset paths, relative to core/modules/. Any loader (the shell's
         * or otherwise) can read this instead of assuming a naming
         * convention like `./core/modules/${moduleName}/${moduleName}.js`
         * — which breaks the moment a module's folder name doesn't match
         * its registered name (as already happened here: this module is
         * named "developer-hub" but its real folder is "developer", not
         * "developer-hub"). Only Developer Hub's own files are declared
         * here — this is not a shell-wide module registry, since this
         * file has no real knowledge of ShopOS, QuarryOS, or any other
         * application's actual file locations.
         */
        files: { folder: "developer", html: "developer-hub.html", css: "developer-hub.css", js: "developer-hub.js" },
        /**
         * getDashboard() — required by the real cozy-ui.js contract:
         * `root.innerHTML = app.getDashboard?.() || ""` runs BEFORE
         * init(). This returns one empty wrapper div only; #renderMain()
         * still owns all real content, exactly as before this fix — no
         * markup or business logic is duplicated here.
         */
        getDashboard() {
            return '<div id="cozy-developer-hub-root" class="cozy-developer-hub-shell"></div>';
        },
        /**
         * init(container?) — dual contract, kept backward compatible:
         *   - The real loader (cozy-ui.js) calls this with ZERO
         *     arguments, after already injecting the div from
         *     getDashboard() above into #cozy-app-root. In that case we
         *     resolve our own container by id.
         *   - Any existing direct caller — including this file's own
         *     standalone fallback below — may still pass an explicit
         *     container element; that path is unchanged from before.
         */
        async init(container, userId) {
            const resolvedContainer = container
                || document.getElementById("cozy-developer-hub-root")
                || document.getElementById("cozy-app-root");
            if (!singletonInstance) singletonInstance = new CozyDeveloperHubUI();
            await singletonInstance.init(resolvedContainer, userId);
            window.CozyDeveloperHubUI = singletonInstance; // preserved for any existing code that reads this directly
            return singletonInstance;
        },
        destroy() {
            if (singletonInstance) { singletonInstance.destroy(); singletonInstance = null; }
            window.CozyDeveloperHubUI = null;
        }
    };

    /**
     * Standalone fallback — only relevant when Developer Hub is opened
     * directly (developer-hub.html on its own, without cozy-shell.html).
     * Looks for either the current shell's real container ID
     * ("cozy-app-root") or the original standalone root
     * ("cozy-developer-hub-root"), so existing direct-load testing keeps
     * working exactly as before. Never runs if the module was already
     * mounted via the loadModule() path above.
     */
    function initStandaloneMount() {
        if (singletonInstance) return true;
        const root = document.getElementById("cozy-app-root") || document.getElementById("cozy-developer-hub-root");
        if (!root) return false;
        window.CozyOS.Modules["developer-hub"].init(root);
        return true;
    }

    if (!initStandaloneMount()) {
        if (document.readyState === "complete" || document.readyState === "interactive") {
            let attempts = 0;
            const intervalId = setInterval(() => {
                attempts++;
                if (initStandaloneMount() || attempts >= 40) clearInterval(intervalId);
            }, 250);
        } else {
            window.addEventListener("DOMContentLoaded", () => { initStandaloneMount(); });
        }
    }
})();
