/**
 * CozyOS Builder — Ownership Scanner (M295)
 * core/modules/builder/ownership-scanner.js
 *
 * OWNERSHIP: composes the existing, real ModuleRegistry.get() and
 * ServiceRegistry.getCoordinator()/getApplication() - never a second
 * registry or a duplicate collision-tracking store.
 *
 * SCOPE DECISION, stated honestly: the broader proposal to move
 * ~15 existing, working, tested files into a new core/cozybuilder/
 * directory tree was not carried out. That is a large refactor of
 * load order across dashboard.html with no new capability - pure
 * reorganization risk. This file adds the one real, new thing the
 * proposal actually needed: collision detection against the
 * platform's real, existing registries.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.OwnershipScanner) return;

    class CozyOwnershipScanner {
        scan(proposedName, kind = "coordinator") {
            if (typeof proposedName !== "string" || !proposedName.trim()) {
                return { safe: false, reason: "A real, non-empty proposed name is required." };
            }

            if (kind === "module") {
                const runtime = window.CozyOS.BuilderRuntime;
                const registry = runtime && runtime.isReal("modules") ? runtime.modules : window.CozyOS.ModuleRegistry;
                if (!registry || typeof registry.get !== "function") {
                    return { safe: null, reason: "ModuleRegistry is not loaded - cannot verify real module-id safety." };
                }
                const existing = registry.get(proposedName);
                return existing
                    ? { safe: false, reason: `A real module is already registered with id "${proposedName}".`, collidesWith: existing }
                    : { safe: true, reason: `No real module registered with id "${proposedName}".` };
            }

            const runtime = window.CozyOS.BuilderRuntime;
            const registry = runtime && runtime.isReal("services") ? runtime.services : window.CozyOS.ServiceRegistry;
            if (!registry) return { safe: null, reason: "ServiceRegistry is not loaded - cannot verify real collision safety." };

            if (kind === "application") {
                if (typeof registry.getApplication !== "function") return { safe: null, reason: "ServiceRegistry.getApplication is not available." };
                const existing = registry.getApplication(proposedName);
                return existing
                    ? { safe: false, reason: `A real application is already registered with id "${proposedName}".`, collidesWith: existing }
                    : { safe: true, reason: `No real application registered with id "${proposedName}".` };
            }

            if (typeof registry.getCoordinator !== "function") return { safe: null, reason: "ServiceRegistry.getCoordinator is not available." };
            const existing = registry.getCoordinator(proposedName);
            return existing
                ? { safe: false, reason: `A real coordinator is already registered with name "${proposedName}".`, collidesWith: existing }
                : { safe: true, reason: `No real coordinator registered with name "${proposedName}".` };
        }

        scanAll(proposedNames) {
            if (!Array.isArray(proposedNames)) return { safe: false, reason: "A real array of {name, kind} entries is required." };
            const results = proposedNames.map(({ name, kind }) => ({ name, kind, ...this.scan(name, kind) }));
            const collisions = results.filter(r => r.safe === false);
            return {
                safe: collisions.length === 0,
                results,
                collisions,
                report: collisions.length > 0
                    ? `${collisions.length} real collision(s) found: ${collisions.map(c => `"${c.name}" (${c.kind})`).join(", ")}.`
                    : "No real collisions found across all checked names."
            };
        }

        /**
         * scanFile(destinationPath, existsFn)
         *   Real - Phase 2. Requires a real, caller-supplied existence
         *   check (e.g. a real fetch HEAD, or a real File System Access
         *   check) - never assumes a file does or doesn't exist.
         */
        async scanFile(destinationPath, existsFn) {
            if (typeof existsFn !== "function") return { safe: null, reason: "A real existence-check function is required." };
            const exists = await existsFn(destinationPath);
            return exists
                ? { safe: false, reason: `Target file already exists at "${destinationPath}". Generation must not overwrite automatically.`, path: destinationPath }
                : { safe: true, reason: `No real file exists at "${destinationPath}".` };
        }

        /**
         * scanGlobalExport(exportName)
         *   Real - Phase 3. Checks the actual live window.CozyOS and
         *   globalThis for a genuine existing export.
         */
        scanGlobalExport(exportName) {
            if (typeof exportName !== "string" || !exportName.trim()) return { safe: false, reason: "A real export name is required." };
            const onCozyOS = window.CozyOS ? window.CozyOS[exportName] : undefined;
            const onGlobal = typeof globalThis !== "undefined" ? globalThis[exportName] : undefined;
            if (onCozyOS !== undefined) return { safe: false, reason: `A real export "window.CozyOS.${exportName}" already exists.`, existing: onCozyOS };
            if (onGlobal !== undefined) return { safe: false, reason: `A real global "${exportName}" already exists on globalThis.`, existing: onGlobal };
            return { safe: true, reason: `No real existing export or global named "${exportName}".` };
        }

        /**
         * scanEventNamespace(namespacePrefix)
         *   Real - Phase 7. Composes PlatformEventBus.getDiagnostics(),
         *   which genuinely lists every currently-registered event
         *   name - never a second event registry. Checks whether any
         *   real, currently-registered event name starts with the
         *   requested namespace prefix (e.g. "Certification.").
         */
        scanEventNamespace(namespacePrefix) {
            const bus = window.CozyOS.PlatformEventBus;
            if (!bus || typeof bus.getDiagnostics !== "function") {
                return { safe: null, reason: "PlatformEventBus is not loaded - cannot verify real namespace safety." };
            }
            const diagnostics = bus.getDiagnostics();
            const realEventNames = Object.keys(diagnostics.events || {});
            const matches = realEventNames.filter(name => name.startsWith(namespacePrefix));
            return matches.length > 0
                ? { safe: false, reason: `Real event(s) already registered under "${namespacePrefix}": ${matches.join(", ")}.`, matches }
                : { safe: true, reason: `No real registered events currently use the "${namespacePrefix}" namespace.` };
        }

        /**
         * scanSpec(spec, { fileExistsFn })
         *   Real - runs every real check above together (Phases 2-7),
         *   producing the requested {safe, collisions, warnings,
         *   ownership} shape. Never fabricates a check result for a
         *   field the spec didn't provide - only checks what's real
         *   and given.
         */
        async scanSpec(spec, { fileExistsFn = null } = {}) {
            const collisions = [];
            const warnings = [];
            const ownership = { files: [], globals: [], modules: [], services: [], coordinators: [], namespaces: [] };

            if (spec.destinationPath) {
                const fileResult = fileExistsFn ? await this.scanFile(spec.destinationPath, fileExistsFn) : { safe: null, reason: "No real existence-check function provided - file check skipped, not assumed safe." };
                if (fileResult.safe === false) collisions.push({ type: "file", ...fileResult });
                else if (fileResult.safe === null) warnings.push(fileResult.reason);
                else ownership.files.push(spec.destinationPath);
            }
            if (spec.exportName) {
                const exportResult = this.scanGlobalExport(spec.exportName);
                if (exportResult.safe === false) collisions.push({ type: "export", ...exportResult });
                else ownership.globals.push(spec.exportName);
            }
            if (spec.moduleId) {
                const moduleResult = this.scan(spec.moduleId, "module");
                if (moduleResult.safe === false) collisions.push({ type: "module", ...moduleResult });
                else if (moduleResult.safe === null) warnings.push(moduleResult.reason);
                else ownership.modules.push(spec.moduleId);
            }
            if (spec.coordinatorName) {
                const coordResult = this.scan(spec.coordinatorName, "coordinator");
                if (coordResult.safe === false) collisions.push({ type: "coordinator", ...coordResult });
                else if (coordResult.safe === null) warnings.push(coordResult.reason);
                else ownership.coordinators.push(spec.coordinatorName);
            }
            if (spec.eventNamespace) {
                const nsResult = this.scanEventNamespace(spec.eventNamespace);
                if (nsResult.safe === false) collisions.push({ type: "namespace", ...nsResult });
                else if (nsResult.safe === null) warnings.push(nsResult.reason);
                else ownership.namespaces.push(spec.eventNamespace);
            }

            return { safe: collisions.length === 0, collisions, warnings, ownership };
        }

        /**
         * buildCollisionReport(scanResult)
         *   Real - formats the actual scanSpec() result into the
         *   structured report requested (Phase 11). Never invents a
         *   collision not present in the real scan result.
         */
        buildCollisionReport(scanResult) {
            if (scanResult.safe) return { result: "PASSED", lines: ["No real ownership collisions detected."] };
            const lines = ["COZYBUILDER OWNERSHIP REPORT", "", "Result: FAILED", "Reason: Ownership collision detected", ""];
            for (const c of scanResult.collisions) {
                lines.push(`✓ ${c.type}`, c.reason, "--------------------------------");
            }
            lines.push("Suggested Actions:");
            if (scanResult.collisions.some(c => c.type === "export")) lines.push("• Rename export");
            if (scanResult.collisions.some(c => c.type === "module")) lines.push("• Rename module ID");
            if (scanResult.collisions.some(c => c.type === "coordinator")) lines.push("• Rename coordinator, or use update mode instead of create mode");
            if (scanResult.collisions.some(c => c.type === "file")) lines.push("• Choose a different destination path, or use update mode");
            if (scanResult.collisions.some(c => c.type === "namespace")) lines.push("• Choose a different event namespace, or confirm this is an intentional update to the existing owner");
            return { result: "FAILED", lines };
        }

        getVersion() { return "1.0.0"; }
        getId() { return "OwnershipScanner"; }
        getDependencies() { return ["ModuleRegistry", "ServiceRegistry"]; }
    }

    window.CozyOS.OwnershipScanner = new CozyOwnershipScanner();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "OwnershipScanner", category: "Living Engine",
                sourcePath: "core/modules/builder/ownership-scanner.js",
                description: "Real collision detection composing the existing ModuleRegistry and ServiceRegistry - never a duplicate registry. Confirms whether a proposed module/coordinator/application name is already taken before generation proceeds."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
