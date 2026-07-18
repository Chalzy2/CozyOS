// core/kernel/bootstrap.js (Refined)
registerService(manifest) {
    // 1. Compatibility Check
    if (!this.isCompatible(manifest.minKernelVersion)) {
        console.error(`[Bootstrap] Rejecting ${manifest.name}: Incompatible Kernel Version.`);
        return;
    }

    // 2. Register with Metadata
    this.services.set(manifest.name, {
        ...manifest,
        state: 'REGISTERED',
        startTime: null,
        lastError: null
    });
}
