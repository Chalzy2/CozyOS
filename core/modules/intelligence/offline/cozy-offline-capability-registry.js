/**
 * core/modules/intelligence/offline/cozy-offline-capability-registry.js
 * CozyOS Vision — "Complete Offline-First & Human-Centered Vision", Section 4
 *
 * MISSION
 *   Section 4 of the CozyOS vision document states: "Every network-related
 *   capability is classified as LOCAL-CAPABLE, OPTIONAL, REQUIRED, or
 *   UNKNOWN. UNKNOWN must never be silently converted into an assumption."
 *
 *   This file is the first real, reusable place in the repository that
 *   implements that exact four-state taxonomy as a small registry other
 *   code can register into and query. It is new and purely additive: it
 *   does not modify, wrap, or replace any existing module, and nothing
 *   existing is required to consume it yet — this is the seed other work
 *   can build on later, per this milestone's own "audit before you build"
 *   discipline.
 *
 * WHAT THIS IS NOT (Rule 29 — read real code before assuming a gap)
 *   This is a DIFFERENT concept from the currentVerifiedCapabilities /
 *   visionCapabilities split found in
 *   core/modules/intelligence/knowledge/cozy-knowledge-registry.js (not
 *   modified here — out of scope for this task). That split answers "is
 *   this feature built yet, or only planned?" (an implementation-status
 *   axis). This registry answers a different question about a feature
 *   that IS built: "does this capability need the network to work at
 *   all?" (a network-dependency axis). A capability can be fully
 *   implemented (currentVerified) and still be LOCAL-CAPABLE, OPTIONAL, or
 *   REQUIRED with respect to network access — the two axes are
 *   orthogonal and this file does not conflate them.
 *
 *   A single, unrelated boolean `OFFLINE_CAPABLE` flag also exists in
 *   core/modules/ChurchOS/live-church-language-orchestrator.js (line
 *   ~361) — a local yes/no flag for that one orchestrator, not a shared
 *   four-state taxonomy other modules can register into. This registry
 *   does not touch that file and is not a replacement for it; a future,
 *   separate, deliberate decision could migrate it to consult this
 *   registry instead, but that is not decided here.
 *
 * HONESTY CONTRACT (mirrors the pattern already established by
 * core/modules/intelligence/language-packs/storage/cozy-storage-provider.js
 * and core/modules/module-registry.js — validate/reject rather than
 * silently coerce; never fabricate a classification):
 *   - classify(name) on a name nobody has registered returns a real,
 *     explicit UNKNOWN entry with registered:false. It never guesses
 *     LOCAL-CAPABLE, OPTIONAL or REQUIRED for something nobody has
 *     actually evidenced.
 *   - register() requires a real evidence citation (file/description) for
 *     every entry — Section 4/30's provenance discipline applied to the
 *     classification itself, not just to community-taught knowledge.
 *   - checkReachability(name) runs the registrant's own `detect` function
 *     (if one was given) and returns exactly what it returns (coerced to
 *     boolean) wrapped in a real try/catch; if no `detect` function was
 *     given, it returns null (indeterminate) rather than defaulting to
 *     true or false — the same "never silently convert UNKNOWN into an
 *     assumption" rule applied to runtime reachability checks.
 *   - register() never overwrites an existing entry silently; re-
 *     registering the same name throws, the same duplicate-rejection
 *     pattern module-registry.js already uses for application manifests.
 *
 * SEED ENTRIES
 *   A handful of REAL capabilities already found and read in this
 *   session's audit are pre-registered below, each with a real file
 *   citation as evidence — not vision-aspirational entries with no code
 *   behind them. Nothing here is invented; every citation was read.
 *
 * LOADING (deliberately a classic script, not an ES module)
 *   This session traced a real, reproduced defect: core/storage.js ends
 *   with `export default CozyStorageGateway;`, so it can only be loaded
 *   via <script type="module">, and Chromium genuinely refuses to fetch
 *   an ES module from a file:// page ("Cross origin requests are only
 *   supported for protocol schemes: chrome, ... http, https...",
 *   independently reproduced this session against
 *   core/tests/browser/fixtures/business-record-engine-fixture.html).
 *   This file is deliberately written as a plain (function(){...})()
 *   classic script with no top-level import/export, confirmed by direct
 *   test in this session to load correctly from a real file:// page —
 *   so a future production page can add a plain <script src="...">
 *   tag for this file with none of that risk. This is not a decision to
 *   convert any EXISTING module's format — that remains a real
 *   architectural choice flagged for the user, not made here.
 */
(function (root) {
    "use strict";
    const w = root.window || root;
    w.CozyOS = w.CozyOS || {};
    w.CozyOS.Modules = w.CozyOS.Modules || {};
    if (w.CozyOS.Modules["cozy-offline-capability-registry"]) return;

    const VERSION = "1.0.0";

    // The exact four states named in Section 4 of the vision document.
    const CLASSIFICATIONS = Object.freeze(["LOCAL-CAPABLE", "OPTIONAL", "REQUIRED", "UNKNOWN"]);
    const CLASSIFICATION_SET = new Set(CLASSIFICATIONS);

    const registrations = new Map(); // name -> frozen entry
    const auditLog = [];

    function logAudit(action, name, detail) {
        auditLog.push(Object.freeze({
            id: `oc_${auditLog.length + 1}_${Date.now()}`,
            timestamp: new Date().toISOString(),
            action,
            name: String(name),
            detail: detail === undefined ? null : detail
        }));
        if (auditLog.length > 500) auditLog.shift();
    }

    function deepFreezeClone(entry) {
        // Shallow-safe clone: entries here only ever hold plain
        // strings/booleans/functions, never nested mutable state, so a
        // shallow clone plus Object.freeze is sufficient to guarantee a
        // caller mutating the returned object never touches the registry.
        return Object.freeze({ ...entry });
    }

    /**
     * register(name, definition)
     *   definition: {
     *     classification: one of CLASSIFICATIONS (required),
     *     description:   human-readable, what the capability actually is (required, non-empty),
     *     evidence:       a real file/line citation backing this classification (required, non-empty —
     *                     Section 4 must never be a guess, and this mirrors Section 7's
     *                     provenance requirement for community-taught knowledge),
     *     detect:         optional () => boolean|Promise<boolean> feature-detection function.
     *                     Never required — a capability may be legitimately UNKNOWN with no
     *                     detector yet.
     *     operationalNote: optional string for a known caveat that is NOT part of the
     *                     classification itself (e.g. "this local-capable gateway is currently
     *                     unreachable from file:// pages for an unrelated ES-module loading
     *                     reason" — the classification answers "does this NEED network", the
     *                     operational note answers "is there a separate, unrelated defect
     *                     blocking it today"; conflating the two would misclassify a
     *                     capability because of a bug rather than because of what it is).
     *   }
     *   Throws (does not silently coerce) on: missing/invalid name, invalid classification,
     *   missing description/evidence, or re-registering an existing name.
     */
    function register(name, definition) {
        if (typeof name !== "string" || !name.trim()) {
            throw new TypeError("[OfflineCapabilityRegistry] register(): name must be a non-empty string.");
        }
        if (registrations.has(name)) {
            throw new Error(`[OfflineCapabilityRegistry] register(): "${name}" is already registered — call unregister() first if this is deliberate, or pick a distinct name. This registry never silently overwrites a classification.`);
        }
        const def = definition && typeof definition === "object" ? definition : {};
        if (!CLASSIFICATION_SET.has(def.classification)) {
            throw new TypeError(`[OfflineCapabilityRegistry] register("${name}"): classification must be one of ${CLASSIFICATIONS.join(", ")} — got ${JSON.stringify(def.classification)}.`);
        }
        if (typeof def.description !== "string" || !def.description.trim()) {
            throw new TypeError(`[OfflineCapabilityRegistry] register("${name}"): description is required and must be a non-empty string.`);
        }
        if (typeof def.evidence !== "string" || !def.evidence.trim()) {
            throw new TypeError(`[OfflineCapabilityRegistry] register("${name}"): evidence (a real file/line citation) is required — this registry never records an unevidenced classification.`);
        }
        if (def.detect !== undefined && typeof def.detect !== "function") {
            throw new TypeError(`[OfflineCapabilityRegistry] register("${name}"): detect, if provided, must be a function.`);
        }
        if (def.operationalNote !== undefined && typeof def.operationalNote !== "string") {
            throw new TypeError(`[OfflineCapabilityRegistry] register("${name}"): operationalNote, if provided, must be a string.`);
        }

        const entry = deepFreezeClone({
            name,
            classification: def.classification,
            description: def.description,
            evidence: def.evidence,
            operationalNote: def.operationalNote || null,
            detect: def.detect || null,
            registeredAt: new Date().toISOString()
        });
        registrations.set(name, entry);
        logAudit("register", name, def.classification);
        return classify(name);
    }

    /** unregister(name) — explicit removal only; register() itself never overwrites. */
    function unregister(name) {
        const existed = registrations.delete(name);
        if (existed) logAudit("unregister", name);
        return existed;
    }

    /**
     * classify(name)
     *   Returns the registered entry (without its internal `detect` function —
     *   use checkReachability() to actually run it) or, for any name nobody
     *   has registered, a real, explicit, honestly-UNKNOWN entry. This is
     *   the function that makes Section 4's "UNKNOWN must never be silently
     *   converted into an assumption" concrete: callers get UNKNOWN with
     *   registered:false, never a fabricated default of LOCAL-CAPABLE,
     *   OPTIONAL or REQUIRED.
     */
    function classify(name) {
        const entry = registrations.get(name);
        if (!entry) {
            return Object.freeze({
                name: String(name),
                classification: "UNKNOWN",
                description: "Not yet registered with the OfflineCapabilityRegistry — no evidence has been recorded for this capability.",
                evidence: null,
                operationalNote: null,
                registered: false
            });
        }
        return Object.freeze({
            name: entry.name,
            classification: entry.classification,
            description: entry.description,
            evidence: entry.evidence,
            operationalNote: entry.operationalNote,
            registered: true
        });
    }

    /**
     * checkReachability(name)
     *   Runs the registrant's own detect() function, if one exists, inside
     *   a try/catch, and returns a real boolean. Returns null — never
     *   true or false — when no detector exists or the name is
     *   unregistered, because "we do not know" is a real, distinct answer
     *   this function must not paper over.
     */
    async function checkReachability(name) {
        const entry = registrations.get(name);
        if (!entry || typeof entry.detect !== "function") return null;
        try {
            const result = await entry.detect();
            return !!result;
        } catch (err) {
            logAudit("detect-error", name, String(err && err.message || err));
            return null;
        }
    }

    /** list() — every registered entry (frozen clones; detect functions omitted). */
    function list() {
        return Object.freeze(Array.from(registrations.keys()).map(classify));
    }

    /** listByClassification(classification) — filtered convenience view. */
    function listByClassification(classification) {
        if (!CLASSIFICATION_SET.has(classification)) {
            throw new TypeError(`[OfflineCapabilityRegistry] listByClassification(): must be one of ${CLASSIFICATIONS.join(", ")}.`);
        }
        return Object.freeze(list().filter((e) => e.classification === classification));
    }

    function getAuditLog() {
        return Object.freeze(auditLog.map((e) => Object.freeze({ ...e })));
    }

    const api = Object.freeze({
        VERSION,
        CLASSIFICATIONS,
        register,
        unregister,
        classify,
        checkReachability,
        list,
        listByClassification,
        getAuditLog
    });

    w.CozyOS.OfflineCapabilityRegistry = api;
    w.CozyOS.Modules["cozy-offline-capability-registry"] = Object.freeze({
        version: VERSION,
        api,
        description: "Vision Section 4 — LOCAL-CAPABLE/OPTIONAL/REQUIRED/UNKNOWN offline-capability classification registry. New and additive; registers no consumers of its own yet."
    });

    // ---------------------------------------------------------------
    // Seed entries — real capabilities read and cited during this
    // session's audit. Each evidence string names a real file this
    // session actually opened and read.
    // ---------------------------------------------------------------
    try {
        register("storage-gateway-indexeddb", {
            classification: "LOCAL-CAPABLE",
            description: "The core/storage.js universal IndexedDB gateway (save/get/update/delete/list/count/search/backup/restore) — every one of its data operations reads/writes only the browser's local IndexedDB and makes no network call.",
            evidence: "core/storage.js:33 (SCHEMA_META IndexedDB open), lines ~155-500 (save/get/update/delete/list/count/search — no fetch/XHR in any of them)",
            operationalNote: "Reachability caveat, NOT part of this classification: core/storage.js is an ES module (`export default CozyStorageGateway;`), and no production HTML page in this repository currently loads it with a <script> tag of any kind. When it IS given a plain <script type=\"module\"> tag, real headless-Chromium testing this session confirmed that tag genuinely fails to load a page opened via the file:// origin (CORS error: \"Cross origin requests are only supported for protocol schemes: chrome, ... http, https...\"), even though the capability itself needs no network. This is a loading-mechanism defect, not a network dependency — do not read this operational note as changing the classification above.",
            detect: () => !!(w.CozyOS && w.CozyOS.Storage) || !!w.CozyStorage
        });

        register("cloud-mutation-sync", {
            classification: "OPTIONAL",
            description: "core/storage.js's own sync() method (pushes queued mutations to a remote endpoint) and core/sync.js's flushOfflineMutationQueue() (pushes a separate mutation_queue IndexedDB store to Firebase) both explicitly check connectivity/queue state first and degrade to \"stay queued locally\" rather than failing when offline.",
            evidence: "core/storage.js:515 sync(tenantId) [F-04 idempotency-key sync queue]; core/sync.js:76-115 flushOfflineMutationQueue() (`if (!navigator.onLine || !indexedDBInstance) return;`)",
            operationalNote: "core/sync.js is itself a SEPARATE IndexedDB database (\"CozyOS_Kernel_Cache\", mutation_queue store) from core/storage.js's own sync queue and from core/business/offline.js's \"CozyOS_Retail_Offline_DB\" — a real, separate Section 24 (\"one storage authority\") gap this audit traced but does not fix here.",
            detect: () => typeof navigator !== "undefined" ? !!navigator.onLine : null
        });

        register("payment-confirmation-mpesa", {
            classification: "REQUIRED",
            description: "M-Pesa/MpesaOS payment confirmation (core/plugins/mpesaOS.js, core/plugins/mpesaOS-engine.js) — an actual money-moved confirmation cannot be produced locally; it requires the payment provider's real network response, matching vision Section 17 (\"CozyOS must never claim that money moved until the payment provider confirms the transaction\").",
            evidence: "core/plugins/mpesaOS.js:138-168 (storage-dependent contribution/record path, required: window.CozyStorage/Company/PaymentChannel) and its sibling core/plugins/mpesaOS-engine.js — both explicitly separate a locally-stored contribution *intention* from a confirmed payment"
        });

        register("language-pack-teach-capture", {
            classification: "LOCAL-CAPABLE",
            description: "CozyLearn's teach/capture step for community language packs — cozy-language-pack-persistence.js persists taught words/phrases into the same local IndexedDB gateway pattern (window.CozyStorage), with no network call in the capture path itself.",
            evidence: "core/modules/intelligence/language-packs/cozy-language-pack-persistence.js:9-28 (consumes window.CozyStorage the same way core/ai.js/core/languageImporter.js do; \"getStorageState() NEVER reports PERSISTENT unless window.CozyStorage ... is genuinely reachable\")"
        });
    } catch (seedErr) {
        // A seeding failure (e.g. this file being loaded twice under a
        // stale cache) must never crash the host page — log it honestly
        // and continue with whatever registered successfully.
        logAudit("seed-error", "__seed__", String(seedErr && seedErr.message || seedErr));
    }

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
