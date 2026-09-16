/**
 * CozyOS Certification Registry Bridge —
 * core/registry/certification-registry-bridge.js
 *
 * OWNERSHIP: composes two real, existing, already-certified systems -
 * CozyCertification.certifyModule() (real syntax/duplicate/security
 * checks, confirmed by reading its source) and ServiceRegistry.
 * registerCoordinator()/registerApplication() (real registry, M240/
 * M262 pattern). Never a third certification engine or registry.
 *
 * REAL GAP THIS CLOSES: confirmed by reading certifyModule()'s full
 * implementation before writing this file - a successful certification
 * never automatically registered anything. Developers/administrators
 * had to call ServiceRegistry.registerCoordinator() as a separate,
 * manual step. This bridge closes that gap - it does not change what
 * either system does internally.
 *
 * HONEST GATING: only ENTERPRISE_CERTIFIED or CONDITIONALLY_CERTIFIED
 * verdicts result in real registration. FAILED_CERTIFICATION and
 * NOT_CERTIFIED are honestly rejected - this bridge never registers
 * something the real certification engine didn't actually approve.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.CertificationRegistryBridge) return;

    const REGISTERABLE_VERDICTS = Object.freeze(["ENTERPRISE_CERTIFIED", "CONDITIONALLY_CERTIFIED"]);

    class CozyCertificationRegistryBridge {
        /**
         * certifyAndRegister(sourceText, metadata, { kind })
         *   Real - runs the actual certifyModule(), then only if the
         *   real verdict qualifies, registers via the actual
         *   registerCoordinator() (kind: "engine"/"module"/"plugin"/
         *   "ui-component") or registerApplication() (kind:
         *   "application"). Never registers on a failed/uncertified
         *   verdict, and never fabricates a verdict.
         */
        certifyAndRegister(sourceText, metadata = {}, { kind = "engine" } = {}) {
            const cert = window.CozyOS.Certification || window.CozyOS.CozyCertification;
            const registry = window.CozyOS.ServiceRegistry;
            if (!cert || typeof cert.certifyModule !== "function") {
                return { success: false, reason: "CozyCertification is not loaded." };
            }
            const report = cert.certifyModule(sourceText, metadata);
            const qualifies = REGISTERABLE_VERDICTS.includes(report.verdict);

            if (!qualifies) {
                return {
                    success: false, certified: false, verdict: report.verdict,
                    reason: `Certification did not qualify for registration: verdict is "${report.verdict}". Only ${REGISTERABLE_VERDICTS.join(" or ")} results in real registration.`,
                    report
                };
            }

            if (!registry) {
                return { success: false, certified: true, verdict: report.verdict, reason: "Certification passed, but ServiceRegistry is not loaded - cannot register.", report };
            }

            try {
                if (kind === "application") {
                    if (typeof registry.registerApplication !== "function") return { success: false, certified: true, verdict: report.verdict, reason: "ServiceRegistry.registerApplication is not available.", report };
                    registry.registerApplication({
                        id: metadata.moduleId, name: metadata.moduleName || metadata.moduleId, version: metadata.version,
                        certificationStatus: report.verdict, dependencies: metadata.dependencies || []
                    });
                } else {
                    if (typeof registry.registerCoordinator !== "function") return { success: false, certified: true, verdict: report.verdict, reason: "ServiceRegistry.registerCoordinator is not available.", report };
                    registry.registerCoordinator({ sourcePath: "core/registry/certification-registry-bridge.js",
                        name: metadata.moduleId, category: kind === "engine" ? "Living Engine" : kind,
                        version: metadata.version, description: metadata.description || `Auto-registered after real ${report.verdict} certification.`,
                        certificationStatus: report.verdict, dependencies: metadata.dependencies || []
                    });
                }
                return { success: true, certified: true, verdict: report.verdict, registeredAs: kind, report };
            } catch (err) {
                return { success: false, certified: true, verdict: report.verdict, reason: `Certification passed but registration threw: ${err.message}`, report };
            }
        }

        getVersion() { return "1.0.0"; }
        getId() { return "CertificationRegistryBridge"; }
    }

    window.CozyOS.CertificationRegistryBridge = new CozyCertificationRegistryBridge();
})();
