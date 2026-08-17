export default {
    metrics: { syncQueueDepth: 0, firebaseLatencyMs: 0, networkStatus: "online" },
    updateMetrics(mutatorObject) {
        Object.assign(this.metrics, mutatorObject);
        const el = document.getElementById("osDbTelemetry");
        if (el) {
            el.innerText = `IDB Alloc: Bound | Queue: ${this.metrics.syncQueueDepth} Pnd | Link: ${navigator.onLine ? 'Optimal' : 'Severed'}`;
        }
    }
};
