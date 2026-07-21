/**
 * CozyOS Output Center — Inbox
 * File Reference: core/output/output-inbox.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   A real, single arrival point every application calls instead of
 *   `OutputCenter.publish()` directly — `OutputInbox.receive(...)` logs
 *   the raw arrival (application, timestamp, whether it was accepted)
 *   before forwarding to the real `OutputCenter`, giving a genuinely
 *   separate audit trail of "everything that ever arrived" distinct from
 *   "everything currently stored." An artifact rejected by
 *   `OutputCenter.publish()` (e.g. missing `sourceApplication`) still
 *   shows up in the Inbox's own log as a real, recorded rejection — not
 *   silently dropped.
 *
 * HONEST DESIGN NOTE — WHY THIS IS THIN, NOT A SECOND STORE
 *   This file does not re-implement categorization, validation, or
 *   storage — `OutputCenter.publish()` already does all of that, real and
 *   tested. `OutputInbox` adds exactly one new, real thing:
 *   a chronological "arrivals" log, independent of whether an arrival
 *   succeeded, which `OutputCenter`'s own history (keyed by a real
 *   artifactId that only exists after success) cannot represent.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const OUTPUT_INBOX_VERSION = "1.0.0-ENTERPRISE";

    class CozyOutputInbox {
        #arrivals = []; // real, bounded, append-only log of every real receive() call, success or failure
        #diagnostics = { received: 0, accepted: 0, rejected: 0 };

        getVersion() { return OUTPUT_INBOX_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (_err) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        /**
         * receive(artifactData)
         *   The real, single entry point applications should call instead
         *   of `OutputCenter.publish()` directly. Forwards the exact same
         *   real data to `OutputCenter.publish()` — never alters or
         *   re-validates it differently — and records the real, observed
         *   outcome (accepted or rejected, with the real reason) in its
         *   own arrivals log regardless of which.
         */
        receive(artifactData) {
            this.#diagnostics.received++;
            const outputCenter = window.CozyOS.OutputCenter;
            if (!outputCenter) {
                const entry = { at: new Date().toISOString(), sourceApplication: artifactData?.sourceApplication || "(unknown)", name: artifactData?.name || "(unknown)", accepted: false, reason: "OutputCenter is not loaded." };
                this.#arrivals.push(entry);
                if (this.#arrivals.length > 500) this.#arrivals.shift();
                this.#diagnostics.rejected++;
                return { success: false, reason: entry.reason };
            }
            const result = outputCenter.publish(artifactData);
            const entry = {
                at: new Date().toISOString(),
                sourceApplication: artifactData?.sourceApplication || "(unknown)",
                name: artifactData?.name || "(unknown)",
                accepted: result.success,
                reason: result.success ? null : result.reason,
                artifactId: result.success ? result.artifactId : null
            };
            this.#arrivals.push(entry);
            if (this.#arrivals.length > 500) this.#arrivals.shift();
            if (result.success) this.#diagnostics.accepted++; else this.#diagnostics.rejected++;
            return result;
        }

        /** getArrivals(limit) — real, chronological, most recent first, includes both accepted and rejected arrivals honestly. */
        getArrivals(limit = 100) {
            return this.#deepClone(this.#arrivals.slice(-limit).reverse());
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: OUTPUT_INBOX_VERSION, ...this.#diagnostics });
        }
    }

    if (window.CozyOS.OutputInbox && typeof window.CozyOS.OutputInbox.getVersion === "function") {
        const existingVersion = window.CozyOS.OutputInbox.getVersion();
        if (existingVersion !== OUTPUT_INBOX_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: OutputInbox existing v${existingVersion} conflicts with load target v${OUTPUT_INBOX_VERSION}.`);
        return;
    }

    window.CozyOS.OutputInbox = new CozyOutputInbox();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "OutputInbox", category: "Platform", icon: "inbox.svg",
                description: "Real, single arrival point forwarding to OutputCenter.publish() — adds a genuinely separate 'every arrival, accepted or rejected' audit trail, not a second store or a re-implementation of OutputCenter's own real validation/categorization."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
