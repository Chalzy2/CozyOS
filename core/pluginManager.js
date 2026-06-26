// Inside _runCapabilityValidation(manifest) matrix layer:
if (manifest.dependsOn && Array.isArray(manifest.dependsOn)) {
    for (const dependency of manifest.dependsOn) {
        // Syntax format: "PluginID@RequiredVersion" (e.g., "PaymentsSDK@1.2.0")
        const [depId, requiredVersion] = dependency.split('@');
        const activeMeta = window.CozyOS.PluginMetadata.get(depId.toLowerCase());

        if (!activeMeta || activeMeta.status !== 'enabled') {
            throw new Error(`Dependency Missing: Plugin requires [${depId}] to be installed and enabled first.`);
        }

        if (this._compareVersions(activeMeta.version, requiredVersion) < 0) {
            throw new Error(`Version Mismatch: Required dependency [${depId}] is on version v${activeMeta.version}. Version v${requiredVersion} or higher is required.`);
        }
    }
}
