/**
 * CozyOS Platform Audit Engine
 * File Reference: core/platform/audit-engine.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Answers diagnostic questions ("why isn't Builder opening?", "which
 *   dependency failed?", "which application is orphaned?") by correlating
 *   the REAL outputs of the engines that already exist — it discovers
 *   nothing itself (Rule 1 — Single Responsibility). If a question can be
 *   answered by an existing engine directly, this file delegates to that
 *   engine rather than recomputing the answer.
 *
 *   Discovery (Runtime + Manifest) → Dependency → Usage → Health →
 *   ServiceRegistry/ModuleRegistry → THIS ENGINE. Nothing below this
 *   engine in that chain reads from it — it is a pure consumer, at the
 *   top, never a data source for anything else.
 *
 * HONEST SCOPE — READ BEFORE EXTENDING
 *   - whyNotConnected(name): real, combines PlatformDiscovery's Runtime/
 *     Manifest data with DependencyEngine's missing-dependency check and
 *     scanSources()'s duplicate-assignment data for one named coordinator.
 *     Only as complete as those underlying engines' own data — if a scan
 *     hasn't been run, this says so rather than guessing.
 *   - getFailureTimeline(): REAL but PARTIAL. Only coordinators that expose
 *     a public getAuditLog() method can contribute — not every real
 *     coordinator does (checked directly: CozyCertification and
 *     ServiceRegistry keep a private audit log with no public accessor).
 *     Entries are included via a heuristic action-name match
 *     (FAILED/ERROR/DENIED/REJECTED/BROKEN) — this is pattern matching on
 *     existing real log text, not a true unified exception/crash tracker.
 *     Always reports which coordinators it could and couldn't read from.
 *   - whatChangedThisSession(): real diff between the first scan() this
 *     browser session and the latest one. Explicitly NOT "since yesterday"
 *     — there is no persistence layer anywhere in CozyOS (session-only
 *     in-memory state is the established convention throughout this
 *     platform); "since yesterday" would require real storage that doesn't
 *     exist, and is not faked here by pretending session-start means
 *     yesterday.
 *   - listMissingModules(): real, new reconciliation this engine adds —
 *     ModuleRegistry's declared modules cross-referenced against whether
 *     each one's folder appears in FileRegistry (Manifest Provider) or has
 *     a live corresponding coordinator (Runtime Provider). Neither existing
 *     engine did this specific cross-reference before.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const AUDIT_VERSION = "1.0.0-ENTERPRISE";
    const FAILURE_PATTERN = /FAILED|ERROR|DENIED|REJECTED|BROKEN/i;

    class CozyPlatformAudit {
        #firstScanThisSession = null;
        #diagnostics = { queriesServed: 0, errorsHidden: 0 };

        getVersion() { return AUDIT_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (_err) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        #discovery() { return window.CozyOS.PlatformDiscovery || null; }
        #dependency() { return window.CozyOS.DependencyEngine || null; }
        #usage() { return window.CozyOS.UsageEngine || null; }
        #health() { return window.CozyOS.HealthEngine || null; }
        #fileRegistry() { return window.CozyOS.FileRegistry || null; }
        #moduleRegistry() { return window.CozyOS.ModuleRegistry || null; }
        #serviceRegistry() { return window.CozyOS.ServiceRegistry || null; }

        /**
         * whyNotConnected(name)
         *   Real, combined diagnosis for one named coordinator — the
         *   direct answer to "why isn't Builder opening?" Every field below
         *   is read from an existing engine's real, current data; nothing
         *   is inferred beyond what those engines already report.
         */
        whyNotConnected(name) {
            this.#diagnostics.queriesServed++;
            const disc = this.#discovery();
            if (!disc) return { available: false, reason: "PlatformDiscovery is not loaded — cannot diagnose anything." };

            const report = disc.getReport();
            if (!report.available) return { available: false, reason: "No scan has been run yet. Call PlatformDiscovery.scan() first." };

            const isLiveNow = report.runtime.live.names.includes(name);
            const isDeclaredButMissing = report.runtime.coordinators.declaredButMissing.includes(name);
            const fileRegistryRecord = this.#fileRegistry() ? this.#fileRegistry().list().find(r => r.application === name || (r.exports || []).includes(name)) : null;

            const duplicates = report.sourceAnalysis ? report.sourceAnalysis.duplicateAssignments.filter(d => d.name === name) : [];
            const missingDeps = report.dependency && fileRegistryRecord ? report.dependency.missing.missing.filter(m => m.path === fileRegistryRecord.path) : [];

            let diagnosis;
            if (isLiveNow) {
                diagnosis = "This coordinator IS currently live on window.CozyOS. If an application built on top of it still isn't opening, the problem is downstream of this coordinator, not the coordinator itself.";
            } else if (duplicates.length > 0) {
                diagnosis = `Real duplicate registration found: "${name}" is assigned in ${duplicates[0].files.length} different script files (${duplicates[0].files.join(", ")}). Whichever loads last silently wins — this is very likely the actual cause.`;
            } else if (missingDeps.length > 0) {
                diagnosis = `Real missing dependency found: ${fileRegistryRecord.path} imports ${missingDeps.map(m => m.dependency).join(", ")}, which ${missingDeps.length === 1 ? "doesn't" : "don't"} resolve to any known file. If that import throws at load time, this coordinator's own registration code would never run.`;
            } else if (fileRegistryRecord && !fileRegistryRecord.loaded) {
                diagnosis = `The Manifest Provider knows this file exists (${fileRegistryRecord.path}) but it's not cross-referenced as loaded by any live registry. Likely cause: the file's <script> tag was never added to the page, or it failed to load (network/404/syntax error) — this engine cannot distinguish those from here; check the browser console directly for the real error.`;
            } else if (isDeclaredButMissing) {
                diagnosis = `ServiceRegistry has coordinator metadata for "${name}" but nothing by that name is live on window.CozyOS right now. The registration metadata may be stale, or the coordinator failed after registering its metadata but before completing its own window.CozyOS.${name} = ... assignment.`;
            } else {
                diagnosis = `No record of "${name}" found in any connected engine (Runtime, Manifest, or duplicate/dependency analysis). Either the name is misspelled, the relevant script was never included on this page at all, or a scan hasn't been run since it was added.`;
            }

            return {
                available: true, name, isLiveNow, isDeclaredButMissing,
                fileRegistryRecord: fileRegistryRecord || null,
                duplicateRegistrations: duplicates,
                missingDependencies: missingDeps,
                diagnosis
            };
        }

        /** listOrphanedApplications() — delegates to UsageEngine, never recomputes. */
        listOrphanedApplications() {
            const engine = this.#usage();
            if (!engine) return { available: false, reason: "UsageEngine is not loaded." };
            return { available: true, orphans: engine.listLoadedOrphans() };
        }

        /** listDeadFiles() — delegates to UsageEngine. */
        listDeadFiles() {
            const engine = this.#usage();
            if (!engine) return { available: false, reason: "UsageEngine is not loaded." };
            return { available: true, deadFiles: engine.listDeadFiles() };
        }

        /** listDuplicateRegistrations() — combines UsageEngine's duplicate-filename signal with PlatformDiscovery's duplicate-assignment signal (two different real detections, both surfaced, not merged into one number). */
        listDuplicateRegistrations() {
            const usage = this.#usage();
            const disc = this.#discovery();
            const report = disc ? disc.getReport() : { available: false };
            return {
                duplicateFilenames: usage ? usage.listDuplicateCandidates() : { available: false, reason: "UsageEngine is not loaded." },
                duplicateGlobalAssignments: (report.available && report.sourceAnalysis) ? report.sourceAnalysis.duplicateAssignments : { available: false, reason: "PlatformDiscovery.scanSources() hasn't been run yet." }
            };
        }

        /** listMissingDependencies() / listCircularDependencies() — delegate to DependencyEngine. */
        listMissingDependencies() {
            const engine = this.#dependency();
            if (!engine) return { available: false, reason: "DependencyEngine is not loaded." };
            return { available: true, ...engine.detectMissingDependencies() };
        }
        listCircularDependencies() {
            const engine = this.#dependency();
            if (!engine) return { available: false, reason: "DependencyEngine is not loaded." };
            return { available: true, ...engine.detectCircular() };
        }

        /**
         * listMissingModules()
         *   Real, new reconciliation — ModuleRegistry's declared modules
         *   against whether each one's folder actually shows up anywhere in
         *   the Manifest Provider's FileRegistry records, OR has a live
         *   corresponding coordinator right now. Neither existing engine
         *   did this specific cross-reference; it's a genuine, non-
         *   duplicated addition, not a re-implementation of either.
         */
        listMissingModules() {
            const moduleRegistry = this.#moduleRegistry();
            if (!moduleRegistry || typeof moduleRegistry.list !== "function") return { available: false, reason: "ModuleRegistry is not loaded." };
            const fileRegistry = this.#fileRegistry();
            const disc = this.#discovery();
            const runtimeReport = disc ? disc.getReport() : { available: false };

            const declaredModules = moduleRegistry.list({ includeDisabled: true });
            const fileRecords = fileRegistry ? fileRegistry.list() : [];
            const liveNames = (runtimeReport.available) ? new Set(runtimeReport.runtime.live.names) : new Set();

            const missing = declaredModules.filter(m => {
                const hasFileRecord = fileRecords.some(r => r.path.includes(m.folder || "\u0000"));
                const hasLiveCoordinator = liveNames.has(m.id) || liveNames.has(m.theme);
                return !hasFileRecord && !hasLiveCoordinator;
            });

            return { available: true, checkedCount: declaredModules.length, missing, comparisonBasis: { fileRegistryChecked: !!fileRegistry, runtimeChecked: runtimeReport.available } };
        }

        /** listDisconnectedServices() — delegates directly to PlatformDiscovery's Runtime Provider reconciliation, never recomputed. */
        listDisconnectedServices() {
            const disc = this.#discovery();
            if (!disc) return { available: false, reason: "PlatformDiscovery is not loaded." };
            const report = disc.getReport();
            if (!report.available) return { available: false, reason: "No scan has been run yet." };
            return { available: true, disconnected: report.runtime.coordinators.declaredButMissing };
        }

        /**
         * getFailureTimeline()
         *   Real but partial — see the file header's honest disclosure.
         *   Merges every reachable coordinator's own real getAuditLog()
         *   entries, filters for a failure-shaped action name, sorts by
         *   real timestamp. Explicitly reports which coordinators it could
         *   and couldn't read from, rather than silently only covering some.
         */
        getFailureTimeline() {
            const candidateNames = Object.keys(window.CozyOS).filter(k => {
                const obj = window.CozyOS[k];
                return obj && typeof obj === "object" && typeof obj.getAuditLog === "function";
            });
            const unreadable = [];
            const entries = [];
            candidateNames.forEach(name => {
                try {
                    const log = window.CozyOS[name].getAuditLog();
                    (log || []).forEach(entry => {
                        const actionText = `${entry.action || ""} ${entry.msg || ""}`;
                        if (FAILURE_PATTERN.test(actionText)) {
                            entries.push({ source: name, ...entry });
                        }
                    });
                } catch (_err) {
                    this.#diagnostics.errorsHidden++;
                    unreadable.push(name);
                }
            });
            entries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            return {
                available: true,
                coordinatorsChecked: candidateNames,
                coordinatorsUnreadable: unreadable,
                bestEffort: true,
                note: "Only coordinators with a public getAuditLog() method are included — some real coordinators (e.g. CozyCertification, ServiceRegistry) keep a private audit log with no public accessor and cannot contribute here.",
                timeline: entries
            };
        }

        /**
         * whatChangedThisSession()
         *   Real diff between the first scan() this session and the most
         *   recent one. NOT "since yesterday" — no persistence layer exists
         *   anywhere in CozyOS to know what "yesterday" even was.
         */
        recordScanForSessionComparison(report) {
            if (!this.#firstScanThisSession) this.#firstScanThisSession = this.#deepClone(report);
        }
        whatChangedThisSession() {
            const disc = this.#discovery();
            if (!disc) return { available: false, reason: "PlatformDiscovery is not loaded." };
            const latest = disc.getReport();
            if (!latest.available) return { available: false, reason: "No scan has been run yet." };
            if (!this.#firstScanThisSession) return { available: false, reason: "Only one scan has been recorded this session so far — nothing to compare against yet. Run scan() again after this to compare." };

            const firstNames = new Set(this.#firstScanThisSession.runtime.live.names);
            const latestNames = new Set(latest.runtime.live.names);
            return {
                available: true,
                scope: "This browser session only — no cross-session persistence exists in CozyOS.",
                firstScanAt: this.#firstScanThisSession.scannedAt,
                latestScanAt: latest.scannedAt,
                newlyLive: [...latestNames].filter(n => !firstNames.has(n)),
                noLongerLive: [...firstNames].filter(n => !latestNames.has(n))
            };
        }

        /**
         * getFullAuditReport()
         *   Combines every method above into one structured report.
         *   Degrades honestly per missing engine — never fabricates a
         *   section for an engine that isn't loaded.
         */
        getFullAuditReport() {
            return this.#deepClone({
                generatedAt: new Date().toISOString(),
                orphanedApplications: this.listOrphanedApplications(),
                deadFiles: this.listDeadFiles(),
                duplicateRegistrations: this.listDuplicateRegistrations(),
                missingDependencies: this.listMissingDependencies(),
                circularDependencies: this.listCircularDependencies(),
                missingModules: this.listMissingModules(),
                disconnectedServices: this.listDisconnectedServices(),
                failureTimeline: this.getFailureTimeline(),
                sessionChanges: this.whatChangedThisSession(),
                health: this.#health() ? this.#health().report() : { available: false, reason: "HealthEngine is not loaded." }
            });
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: AUDIT_VERSION, ...this.#diagnostics });
        }
    }

    if (window.CozyOS.PlatformAudit && typeof window.CozyOS.PlatformAudit.getVersion === "function") {
        const existingVersion = window.CozyOS.PlatformAudit.getVersion();
        if (existingVersion !== AUDIT_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: PlatformAudit existing v${existingVersion} conflicts with load target v${AUDIT_VERSION}.`);
        return;
    }

    window.CozyOS.PlatformAudit = new CozyPlatformAudit();

    // Real, additive hook: whenever PlatformDiscovery finishes a scan, feed
    // it to the Audit Engine's session-comparison baseline. Uses
    // PlatformEventBus if present (already the real, shared bus every
    // migrated coordinator uses) — never a private bus, never a polling loop.
    if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.on === "function") {
        window.CozyOS.PlatformEventBus.on("discovery:scanned", (report) => {
            try { window.CozyOS.PlatformAudit.recordScanForSessionComparison(report); } catch (_err) { /* non-fatal */ }
        });
    }

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "PlatformAudit", category: "Platform", icon: "search-check",
                description: "Consumes Discovery/Dependency/Usage/Health/Registry outputs to answer diagnostic questions (why isn't X connected, what's orphaned/dead/duplicated/missing). Discovers nothing itself."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
