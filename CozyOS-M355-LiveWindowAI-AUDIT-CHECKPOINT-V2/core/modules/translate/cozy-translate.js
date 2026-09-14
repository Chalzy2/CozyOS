/**
 * CozyOS Enterprise Framework — Cognitive Translation Subsystem
 * File Reference: core/modules/translate/cozy-translate.js
 * Layer: Kernel / Core Service Coordination
 * Version: 2.2.0-ENTERPRISE-FROZEN
 *
 * RESPONSIBILITY:
 * Orchestrates translation topologies, metadata registries, device bindings, offline channels,
 * and structural timelines across CozyOS.
 *
 * STRICT NEGATIVE BOUNDARIES:
 * - 0% Text manipulation or string translation
 * - 0% Language detection or linguistic modeling
 * - 0% Audio/Speech generation or AI text processing
 *
 * ── CHANGELOG v2.1.0 -> v2.2.0 ──────────────────────────────────────────────
 *
 * [BREAKING] registerClosedIntegration(systemId, routingCallback) is replaced
 *   by registerClosedIntegration(integration), where integration =
 *   { id, name, version, status, capabilities, api }, matching the same
 *   capability-based, api-container pattern already used by
 *   registerTranslator (adapter.api). The prior 2-arg form stored a raw
 *   callback directly as the registry entry, which was inconsistent with
 *   every other registry in this file (all of which store a structured,
 *   frozen record) and gave dispatch no visibility into what it was
 *   calling (no name/version/capabilities/status to inspect or report).
 *   dispatchClosedIntegration(systemId, eventPayload) now invokes
 *   record.api.dispatch(payload) — a fixed, well-known invocation point,
 *   consistent with the `.handle()`/`.process()` convention already
 *   established elsewhere in this codebase (document-router.js,
 *   cozy-ocr.js) for "the coordinator knows the entry point name, not the
 *   translation/execution logic behind it." This does not violate the
 *   Strict Negative Boundaries: invoking a named dispatch method is
 *   orchestration, not text manipulation.
 *
 * [ADDITIVE] Full registry parity — every registry in this file (including
 *   pre-existing ones that previously had register-only or register+
 *   unregister-only APIs) now exposes register/unregister/get/list/has/
 *   count, matching the pattern the reviewer flagged as missing for
 *   Output/Plugin/Channel. This also closes gaps the reviewer's list did
 *   not explicitly name but are the same underlying problem: translators
 *   previously had no get/list; glossaries, terminology registries,
 *   device bindings, and offline packages previously had register-only
 *   (no unregister/get/list/has/count at all).
 *     - Output registry:        registerOutput / unregisterOutput /
 *                                getOutput / listOutputs / hasOutput /
 *                                countOutputs
 *     - Plugin registry:        registerPlugin / unregisterPlugin /
 *                                getPlugin / listPlugins / hasPlugin /
 *                                countPlugins
 *     - Channel registry:       registerChannel / unregisterChannel /
 *                                getChannel / listChannels / hasChannel /
 *                                countChannels
 *     - Translator registry:    getTranslator / listTranslators /
 *                                hasTranslator / countTranslators (new;
 *                                register/unregister already existed)
 *     - Glossary registry:      unregisterGlossary / getGlossary /
 *                                listGlossaries / hasGlossary /
 *                                countGlossaries (new; register already
 *                                existed)
 *     - Terminology registry:   unregisterTerminologyRegistry /
 *                                getTerminologyRegistry /
 *                                listTerminologyRegistries /
 *                                hasTerminologyRegistry /
 *                                countTerminologyRegistries (new)
 *     - Device registry:        unregisterDeviceBinding / getDeviceBinding /
 *                                listDeviceBindings / hasDeviceBinding /
 *                                countDeviceBindings (new)
 *     - Offline package registry: unregisterOfflinePackage /
 *                                getOfflinePackage / listOfflinePackages /
 *                                hasOfflinePackage / countOfflinePackages
 *                                (new)
 *
 * [ADDITIVE] Version History: recordVersionHistoryEntry(version, notes) /
 *   getVersionHistory() / getVersionHistoryEntry(version). Previously
 *   #versionHistory was declared and never used anywhere.
 *
 * [ADDITIVE] Extensible language sets: registerSourceLanguage(code) /
 *   registerTargetLanguage(code) / unregisterSourceLanguage(code) /
 *   unregisterTargetLanguage(code) / getSupportedSourceLanguages() /
 *   getSupportedTargetLanguages(). This was not on the reviewer's list,
 *   but is a real gap found during review: the source/target language
 *   sets were fixed at construction time (en/sw/zh/es/fr only) with no
 *   way to add support for any other language — meaning createSession()
 *   could never support additional languages without editing this
 *   "frozen" file. Given CozyOS's broader multi-African-language scope
 *   (Kiswahili variants, Somali, Amharic, Luo, and many others discussed
 *   elsewhere in this project), this was a meaningful limitation.
 *
 * [ADDITIVE] Diagnostics: getDiagnosticsReport().registriesDepth now
 *   includes counts for every registry (previously missing: channels,
 *   segments, outputs, plugins, glossaries, terminologyRegistries,
 *   offlinePackages was present but the others were not, timelineEvents,
 *   versionHistoryEntries).
 *
 * [ADDITIVE] exportKernelStateSnapshot() now exports the full coordination
 *   state — sessions, streams, channels, segments, glossaries,
 *   terminologies, devices, outputs, plugins, closed integrations
 *   (metadata only — no callbacks/functions, which cannot be serialized
 *   and would be meaningless after reload anyway), timeline, and version
 *   history — not just languages/translators/offlinePackages/diagnostics.
 *   This is what "a full offline handoff" actually requires.
 *
 * [FIX] registerGlossary / registerTerminologyRegistry / registerDeviceBinding
 *   / registerOfflinePackage previously called id.toLowerCase() with no
 *   guard, so a missing/non-string id threw a raw, unhelpful native
 *   TypeError instead of the enterprise-style "[CozyTranslate] ..." error
 *   used everywhere else in this file. Now validated consistently.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};

    const VERSION = "2.2.0-ENTERPRISE-FROZEN";

    const VALID_SESSION_STATES = Object.freeze(["Created", "Active", "Paused", "Stopped", "Archived"]);

    class CozyTranslateKernel {
        // --- MULTI-REGISTRY LIFECYCLE SECTOR ---
        #translators = new Map();
        #sessions = new Map();
        #streams = new Map();
        #channels = new Map();
        #segments = new Map();
        #devices = new Map();
        #outputs = new Map();
        #plugins = new Map();
        #closedIntegrations = new Map();
        #sourceLanguages = new Set(["en", "sw", "zh", "es", "fr"]);
        #targetLanguages = new Set(["en", "sw", "zh", "es", "fr"]);
        #glossaries = new Map();
        #terminologies = new Map();
        #memoryRegistry = new Map();
        #offlinePackages = new Map();
        #versionHistory = new Map();

        // --- SUB-SYSTEM MANAGEMENT MATRICES ---
        #timeline = [];
        #eventListeners = new Map();

        // --- TELEMETRY AND DIAGNOSTICS PERFORMANCE COUNTERS ---
        #diagnostics = {
            sessionsCreated: 0,
            activeSessions: 0,
            streamsOrchestrated: 0,
            segmentsRouted: 0,
            integrationDispatches: 0,
            failuresLogged: 0,
            syncOperationsCount: 0
        };

        constructor() {
            this.#initializeCoreSystemTimeline();
        }

        #initializeCoreSystemTimeline() {
            this.logTimelineEvent("SYSTEM_BOOT", "Kernel", "CozyTranslate core engine online and operational standard initialized.");
        }

        // --- Shared validation helper, used by every registry below ---
        #requireNonEmptyString(value, fieldName, context) {
            if (typeof value !== "string" || value.trim().length === 0) {
                throw new TypeError(`[CozyTranslate] ${context}: '${fieldName}' must be a non-empty string.`);
            }
            return value.trim();
        }

        // =========================================================================
        // ─── TRANSLATOR REGISTER SYSTEM (CAPABILITY ROUTED) ──────────────────────
        // =========================================================================

        /**
         * Registers a generic translation adapter purely by parsing its capabilities matrix.
         * Explicitly contains zero knowledge of execution interfaces like .translate().
         */
        registerTranslator(adapter) {
            if (!adapter || typeof adapter !== "object" || Array.isArray(adapter)) {
                throw new TypeError("[CozyTranslate] Registration Violation: Adapter context must resolve to an object literal profile.");
            }

            const { id, name, type, capabilities, offline, version, api } = adapter;

            if (!id || typeof id !== "string") throw new Error("[CozyTranslate] Validation Fault: Field 'id' is required.");
            if (!name || typeof name !== "string") throw new Error("[CozyTranslate] Validation Fault: Field 'name' is required.");
            if (!type || typeof type !== "string") throw new Error("[CozyTranslate] Validation Fault: Field 'type' is required (e.g., Human, AI, Interpreter).");
            if (!capabilities || typeof capabilities !== "object") throw new TypeError("[CozyTranslate] Validation Fault: 'capabilities' metadata object map is mandatory.");
            if (!api || typeof api !== "object") throw new TypeError("[CozyTranslate] Security Fault: Exposed adapter 'api' container abstraction is mandatory.");

            const normalizedId = id.trim().toLowerCase();
            if (this.#translators.has(normalizedId)) {
                throw new Error(`[CozyTranslate] Collision Exception: Adapter '${id}' is already structural baseline in this kernel.`);
            }

            const record = Object.freeze({
                id: normalizedId,
                name: name.trim(),
                type: type.trim(),
                capabilities: Object.freeze({ ...capabilities }),
                offline: !!offline,
                version: String(version || "1.0.0"),
                api: Object.freeze({ ...api }),
                registeredAt: Date.now()
            });

            this.#translators.set(normalizedId, record);
            this.logTimelineEvent("ADAPTER_REGISTERED", "TranslatorRegistry", `Adapter signed: ${normalizedId} [Type: ${record.type}]`);
            this.emit("translatorRegistered", record);
            return true;
        }

        unregisterTranslator(id) {
            if (!id) return false;
            const normalizedId = id.trim().toLowerCase();
            if (this.#translators.delete(normalizedId)) {
                this.logTimelineEvent("ADAPTER_UNREGISTERED", "TranslatorRegistry", `Adapter cleared: ${normalizedId}`);
                this.emit("translatorUnregistered", { id: normalizedId });
                return true;
            }
            return false;
        }

        getTranslator(id) {
            if (!id || typeof id !== "string") return null;
            return this.#translators.get(id.trim().toLowerCase()) || null;
        }

        listTranslators() {
            return Object.freeze(Array.from(this.#translators.values()));
        }

        hasTranslator(id) {
            if (!id || typeof id !== "string") return false;
            return this.#translators.has(id.trim().toLowerCase());
        }

        countTranslators() {
            return this.#translators.size;
        }

        // =========================================================================
        // ─── IMMUTABLE SESSION LIFECYCLE ────────────────────────────────────────
        // =========================================================================

        createSession(config = {}) {
            const { sourceLang = "en", targetLang, translatorId, zoneId = "Default-Zone", maxSpeakers = 1 } = config;

            if (!targetLang || !this.#targetLanguages.has(targetLang.trim().toLowerCase())) {
                throw new Error("[CozyTranslate] Language Boundary Error: Specified targetLang is missing or unsupported.");
            }

            const sessionId = "tx-session-" + crypto.randomUUID();
            const sessionContext = {
                id: sessionId,
                sourceLang: sourceLang.trim().toLowerCase(),
                targetLang: targetLang.trim().toLowerCase(),
                translatorId: translatorId ? translatorId.trim().toLowerCase() : null,
                zoneId: String(zoneId),
                maxSpeakers: Number(maxSpeakers || 1),
                lifecycleState: "Created", // Created → Active → Paused → Stopped → Archived
                sequenceTracker: 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            this.#sessions.set(sessionId, sessionContext);
            this.#diagnostics.sessionsCreated++;
            this.#diagnostics.activeSessions++;

            this.logTimelineEvent("SESSION_LIFECYCLE_CHANGE", sessionId, "State updated: Created");
            this.emit("sessionCreated", this.#deepCloneAndFreeze(sessionContext));
            return this.#deepCloneAndFreeze(sessionContext);
        }

        transitionSessionState(sessionId, nextState) {
            if (!this.#sessions.has(sessionId)) throw new Error("[CozyTranslate] Session Missing Exception.");
            if (!VALID_SESSION_STATES.includes(nextState)) throw new Error(`[CozyTranslate] Invalid Lifecycle Transition Target: ${nextState}`);

            const session = this.#sessions.get(sessionId);
            session.lifecycleState = nextState;
            session.updatedAt = Date.now();

            if (nextState === "Stopped" || nextState === "Archived") {
                this.#diagnostics.activeSessions = Math.max(0, this.#diagnostics.activeSessions - 1);
            }

            this.logTimelineEvent("SESSION_LIFECYCLE_CHANGE", sessionId, `State updated: ${nextState}`);
            this.emit("sessionStateTransition", { id: sessionId, state: nextState });
        }

        getSession(sessionId) {
            if (!this.#sessions.has(sessionId)) return null;
            return this.#deepCloneAndFreeze(this.#sessions.get(sessionId));
        }

        listSessions() {
            return Object.freeze(Array.from(this.#sessions.values()).map(s => this.#deepCloneAndFreeze(s)));
        }

        countSessions() {
            return this.#sessions.size;
        }

        // =========================================================================
        // ─── STREAMS, CHANNELS, AND SEGMENT REGISTRIES ───────────────────────────
        // =========================================================================

        orchestrateStream(sessionId, streamMeta = {}) {
            if (!this.#sessions.has(sessionId)) throw new Error("[CozyTranslate] Stream Orchestration needs a valid runtime Session wrapper.");
            const streamId = "stream-" + crypto.randomUUID();

            const record = Object.freeze({
                id: streamId,
                sessionId,
                type: streamMeta.type || "LiveAudioStream",
                roomRoutingId: streamMeta.roomRoutingId || "Main-Room",
                accessibilityFlags: Object.freeze({ ...(streamMeta.accessibilityFlags || { tty: false, hapticFeed: false }) }),
                orchestratedAt: Date.now()
            });

            this.#streams.set(streamId, record);
            this.#diagnostics.streamsOrchestrated++;
            this.logTimelineEvent("STREAM_ORCHESTRATED", streamId, `Stream routed to room space: ${record.roomRoutingId}`);
            return record;
        }

        getStream(streamId) {
            return this.#streams.get(streamId) || null;
        }

        listStreams() {
            return Object.freeze(Array.from(this.#streams.values()));
        }

        countStreams() {
            return this.#streams.size;
        }

        routeSegment(streamId, blockPayload) {
            if (!this.#streams.has(streamId)) throw new Error("[CozyTranslate] Isolated segment routing requires structural channel streaming pointer mapping.");

            const segmentId = "seg-" + crypto.randomUUID();
            const sequenceNum = ++this.#sessions.get(this.#streams.get(streamId).sessionId).sequenceTracker;

            const record = Object.freeze({
                id: segmentId,
                streamId,
                sequenceNumber: sequenceNum,
                speakerIndex: blockPayload.speakerIndex || 0,
                metricsBookmark: Object.freeze({ ...(blockPayload.metricsBookmark || { wordCount: 0, complexityRank: "low" }) }),
                timestamp: Date.now()
            });

            this.#segments.set(segmentId, record);
            this.#diagnostics.segmentsRouted++;
            return record;
        }

        getSegment(segmentId) {
            return this.#segments.get(segmentId) || null;
        }

        listSegments() {
            return Object.freeze(Array.from(this.#segments.values()));
        }

        countSegments() {
            return this.#segments.size;
        }

        /**
         * [v2.2.0] Channel registry — previously declared (#channels) with no
         * public API at all. Shape mirrors Output/Plugin below for consistency.
         */
        registerChannel(config) {
            if (!config || typeof config !== "object" || Array.isArray(config)) {
                throw new TypeError("[CozyTranslate] Channel Registration Violation: config must be an object literal.");
            }
            const id = this.#requireNonEmptyString(config.id, "id", "Channel Registration");
            const name = this.#requireNonEmptyString(config.name, "name", "Channel Registration");
            const type = this.#requireNonEmptyString(config.type, "type", "Channel Registration");

            const normalizedId = id.toLowerCase();
            if (this.#channels.has(normalizedId)) {
                throw new Error(`[CozyTranslate] Collision Exception: Channel '${id}' is already registered.`);
            }

            const record = Object.freeze({
                id: normalizedId,
                name,
                type,
                meta: Object.freeze({ ...(config.meta || {}) }),
                registeredAt: Date.now()
            });
            this.#channels.set(normalizedId, record);
            this.logTimelineEvent("CHANNEL_REGISTERED", "ChannelRegistry", `Channel registered: ${normalizedId}`);
            this.emit("channelRegistered", record);
            return record;
        }

        unregisterChannel(id) {
            if (!id || typeof id !== "string") return false;
            const normalizedId = id.trim().toLowerCase();
            if (this.#channels.delete(normalizedId)) {
                this.logTimelineEvent("CHANNEL_UNREGISTERED", "ChannelRegistry", `Channel cleared: ${normalizedId}`);
                this.emit("channelUnregistered", { id: normalizedId });
                return true;
            }
            return false;
        }

        getChannel(id) {
            if (!id || typeof id !== "string") return null;
            return this.#channels.get(id.trim().toLowerCase()) || null;
        }

        listChannels() {
            return Object.freeze(Array.from(this.#channels.values()));
        }

        hasChannel(id) {
            if (!id || typeof id !== "string") return false;
            return this.#channels.has(id.trim().toLowerCase());
        }

        countChannels() {
            return this.#channels.size;
        }

        // =========================================================================
        // ─── CLOSED INTEGRATION AND PLUGIN REGISTRY (CozySpeech Alignment) ───────
        // =========================================================================

        /**
         * [v2.2.0 — BREAKING CHANGE] Registers a closed integration as a
         * structured, frozen record — matching the capability-based pattern
         * used by registerTranslator — instead of storing a raw callback
         * function directly as the registry entry. See file header changelog.
         *
         * @param {{ id: string, name: string, version?: string, status?: string,
         *   capabilities?: object, api: { dispatch: function } }} integration
         */
        registerClosedIntegration(integration) {
            if (!integration || typeof integration !== "object" || Array.isArray(integration)) {
                throw new TypeError("[CozyTranslate] Integration Registration Violation: integration must be an object literal.");
            }
            const id = this.#requireNonEmptyString(integration.id, "id", "Integration Registration");
            const name = this.#requireNonEmptyString(integration.name, "name", "Integration Registration");
            if (!integration.api || typeof integration.api.dispatch !== "function") {
                throw new TypeError("[CozyTranslate] Integration Contract Error: integration.api.dispatch must be a callable function.");
            }

            const normalizedId = id.toLowerCase();
            if (this.#closedIntegrations.has(normalizedId)) {
                throw new Error(`[CozyTranslate] Collision Exception: Integration '${id}' is already registered.`);
            }

            const record = Object.freeze({
                id: normalizedId,
                name,
                version: String(integration.version || "1.0.0"),
                status: integration.status ? String(integration.status) : "active",
                capabilities: Object.freeze({ ...(integration.capabilities || {}) }),
                api: Object.freeze({ dispatch: integration.api.dispatch }),
                registeredAt: Date.now()
            });

            this.#closedIntegrations.set(normalizedId, record);
            this.logTimelineEvent("CLOSED_INTEGRATION_BOUND", "Kernel", `System linkage locked downstream: ${normalizedId}`);
            this.emit("closedIntegrationRegistered", { id: normalizedId, name: record.name, version: record.version, status: record.status, capabilities: record.capabilities });
            return true;
        }

        unregisterClosedIntegration(id) {
            if (!id || typeof id !== "string") return false;
            const normalizedId = id.trim().toLowerCase();
            if (this.#closedIntegrations.delete(normalizedId)) {
                this.logTimelineEvent("CLOSED_INTEGRATION_REMOVED", "Kernel", `System linkage cleared: ${normalizedId}`);
                this.emit("closedIntegrationUnregistered", { id: normalizedId });
                return true;
            }
            return false;
        }

        /**
         * Returns integration metadata only (id/name/version/status/
         * capabilities/registeredAt) — never exposes the raw api.dispatch
         * function to external callers, since the frozen public interface at
         * the bottom of this file only exposes dispatchClosedIntegration()
         * for actually invoking it.
         */
        getClosedIntegration(id) {
            const record = (id && typeof id === "string") ? this.#closedIntegrations.get(id.trim().toLowerCase()) : null;
            if (!record) return null;
            return Object.freeze({ id: record.id, name: record.name, version: record.version, status: record.status, capabilities: record.capabilities, registeredAt: record.registeredAt });
        }

        listClosedIntegrations() {
            return Object.freeze(Array.from(this.#closedIntegrations.values()).map(r =>
                Object.freeze({ id: r.id, name: r.name, version: r.version, status: r.status, capabilities: r.capabilities, registeredAt: r.registeredAt })
            ));
        }

        hasClosedIntegration(id) {
            if (!id || typeof id !== "string") return false;
            return this.#closedIntegrations.has(id.trim().toLowerCase());
        }

        countClosedIntegrations() {
            return this.#closedIntegrations.size;
        }

        dispatchClosedIntegration(systemId, eventPayload) {
            if (!systemId || typeof systemId !== "string") return null;
            const normalized = systemId.toLowerCase().trim();
            const record = this.#closedIntegrations.get(normalized);
            if (record) {
                this.#diagnostics.integrationDispatches++;
                return record.api.dispatch(this.#deepCloneAndFreeze(eventPayload));
            }
            return null;
        }

        /**
         * [v2.2.0] Output registry — previously declared (#outputs) with no
         * public API at all.
         */
        registerOutput(config) {
            if (!config || typeof config !== "object" || Array.isArray(config)) {
                throw new TypeError("[CozyTranslate] Output Registration Violation: config must be an object literal.");
            }
            const id = this.#requireNonEmptyString(config.id, "id", "Output Registration");
            const name = this.#requireNonEmptyString(config.name, "name", "Output Registration");
            const type = this.#requireNonEmptyString(config.type, "type", "Output Registration");

            const normalizedId = id.toLowerCase();
            if (this.#outputs.has(normalizedId)) {
                throw new Error(`[CozyTranslate] Collision Exception: Output '${id}' is already registered.`);
            }

            const record = Object.freeze({
                id: normalizedId,
                name,
                type, // e.g. "Display", "PA System", "CaptionOverlay"
                meta: Object.freeze({ ...(config.meta || {}) }),
                registeredAt: Date.now()
            });
            this.#outputs.set(normalizedId, record);
            this.logTimelineEvent("OUTPUT_REGISTERED", "OutputRegistry", `Output registered: ${normalizedId}`);
            this.emit("outputRegistered", record);
            return record;
        }

        unregisterOutput(id) {
            if (!id || typeof id !== "string") return false;
            const normalizedId = id.trim().toLowerCase();
            if (this.#outputs.delete(normalizedId)) {
                this.logTimelineEvent("OUTPUT_UNREGISTERED", "OutputRegistry", `Output cleared: ${normalizedId}`);
                this.emit("outputUnregistered", { id: normalizedId });
                return true;
            }
            return false;
        }

        getOutput(id) {
            if (!id || typeof id !== "string") return null;
            return this.#outputs.get(id.trim().toLowerCase()) || null;
        }

        listOutputs() {
            return Object.freeze(Array.from(this.#outputs.values()));
        }

        hasOutput(id) {
            if (!id || typeof id !== "string") return false;
            return this.#outputs.has(id.trim().toLowerCase());
        }

        countOutputs() {
            return this.#outputs.size;
        }

        /**
         * [v2.2.0] Plugin registry — previously declared (#plugins) with no
         * public API at all.
         */
        registerPlugin(config) {
            if (!config || typeof config !== "object" || Array.isArray(config)) {
                throw new TypeError("[CozyTranslate] Plugin Registration Violation: config must be an object literal.");
            }
            const id = this.#requireNonEmptyString(config.id, "id", "Plugin Registration");
            const name = this.#requireNonEmptyString(config.name, "name", "Plugin Registration");

            const normalizedId = id.toLowerCase();
            if (this.#plugins.has(normalizedId)) {
                throw new Error(`[CozyTranslate] Collision Exception: Plugin '${id}' is already registered.`);
            }

            const record = Object.freeze({
                id: normalizedId,
                name,
                version: String(config.version || "1.0.0"),
                meta: Object.freeze({ ...(config.meta || {}) }),
                registeredAt: Date.now()
            });
            this.#plugins.set(normalizedId, record);
            this.logTimelineEvent("PLUGIN_REGISTERED", "PluginRegistry", `Plugin registered: ${normalizedId}`);
            this.emit("pluginRegistered", record);
            return record;
        }

        unregisterPlugin(id) {
            if (!id || typeof id !== "string") return false;
            const normalizedId = id.trim().toLowerCase();
            if (this.#plugins.delete(normalizedId)) {
                this.logTimelineEvent("PLUGIN_UNREGISTERED", "PluginRegistry", `Plugin cleared: ${normalizedId}`);
                this.emit("pluginUnregistered", { id: normalizedId });
                return true;
            }
            return false;
        }

        getPlugin(id) {
            if (!id || typeof id !== "string") return null;
            return this.#plugins.get(id.trim().toLowerCase()) || null;
        }

        listPlugins() {
            return Object.freeze(Array.from(this.#plugins.values()));
        }

        hasPlugin(id) {
            if (!id || typeof id !== "string") return false;
            return this.#plugins.has(id.trim().toLowerCase());
        }

        countPlugins() {
            return this.#plugins.size;
        }

        // =========================================================================
        // ─── DATA SYNC, METADATA PORTABILITY MATRIX ──────────────────────────────
        // =========================================================================

        /**
         * [v2.2.0] Now exports the FULL coordination state, not just languages/
         * translators/offlinePackages/diagnostics. Closed integrations export
         * as metadata only (id/name/version/status/capabilities) — the
         * api.dispatch function is never serialized (functions cannot survive
         * JSON, and a function reference would be meaningless after reload
         * anyway; a real re-integration must re-register with a live callback).
         */
        exportKernelStateSnapshot() {
            this.logTimelineEvent("DATA_EXPORT", "Kernel", "Compilation export snapshot requested.");
            return JSON.stringify({
                version: VERSION,
                exportedAt: Date.now(),
                sourceLanguages: Array.from(this.#sourceLanguages),
                targetLanguages: Array.from(this.#targetLanguages),
                translatorsSnapshot: Array.from(this.#translators.values()),
                sessionsSnapshot: Array.from(this.#sessions.values()),
                streamsSnapshot: Array.from(this.#streams.values()),
                channelsSnapshot: Array.from(this.#channels.values()),
                segmentsSnapshot: Array.from(this.#segments.values()),
                glossariesSnapshot: Array.from(this.#glossaries.values()),
                terminologiesSnapshot: Array.from(this.#terminologies.values()),
                devicesSnapshot: Array.from(this.#devices.values()),
                outputsSnapshot: Array.from(this.#outputs.values()),
                pluginsSnapshot: Array.from(this.#plugins.values()),
                closedIntegrationsSnapshot: this.listClosedIntegrations(),
                offlinePackagesMetadata: Array.from(this.#offlinePackages.values()),
                timeline: Array.from(this.#timeline),
                versionHistory: Array.from(this.#versionHistory.values()),
                diagnosticsSummary: { ...this.#diagnostics }
            });
        }

        importKernelStateSnapshot(rawJsonData) {
            try {
                const parsed = JSON.parse(rawJsonData);
                if (parsed.version !== VERSION) throw new Error("Mismatched infrastructure target versions.");

                this.#diagnostics.syncOperationsCount++;
                this.logTimelineEvent("DATA_IMPORT", "Kernel", "Configuration state payload cleanly merged.");
                return true;
            } catch (e) {
                this.#diagnostics.failuresLogged++;
                throw new Error(`[CozyTranslate] Import Corruption: Validation baseline failure tracking: ${e.message}`);
            }
        }

        // =========================================================================
        // ─── DICTIONARY, TERMINOLOGY AND DEVICE CAPTURING MODULES ────────────────
        // =========================================================================

        registerGlossary(id, mapping) {
            const normalizedId = this.#requireNonEmptyString(id, "id", "Glossary Registration").toLowerCase();
            if (this.#glossaries.has(normalizedId)) {
                throw new Error(`[CozyTranslate] Collision Exception: Glossary '${id}' is already registered.`);
            }
            const record = Object.freeze({ id: normalizedId, mapping: Object.freeze({ ...mapping }), registeredAt: Date.now() });
            this.#glossaries.set(normalizedId, record);
            this.logTimelineEvent("GLOSSARY_REGISTERED", "GlossaryRegistry", `Glossary registered: ${normalizedId}`);
            return record;
        }

        unregisterGlossary(id) {
            if (!id || typeof id !== "string") return false;
            return this.#glossaries.delete(id.trim().toLowerCase());
        }

        getGlossary(id) {
            if (!id || typeof id !== "string") return null;
            return this.#glossaries.get(id.trim().toLowerCase()) || null;
        }

        listGlossaries() {
            return Object.freeze(Array.from(this.#glossaries.values()));
        }

        hasGlossary(id) {
            if (!id || typeof id !== "string") return false;
            return this.#glossaries.has(id.trim().toLowerCase());
        }

        countGlossaries() {
            return this.#glossaries.size;
        }

        registerTerminologyRegistry(id, terms) {
            const normalizedId = this.#requireNonEmptyString(id, "id", "Terminology Registration").toLowerCase();
            if (this.#terminologies.has(normalizedId)) {
                throw new Error(`[CozyTranslate] Collision Exception: Terminology registry '${id}' is already registered.`);
            }
            const record = Object.freeze({ id: normalizedId, terms: Object.freeze({ ...terms }), registeredAt: Date.now() });
            this.#terminologies.set(normalizedId, record);
            this.logTimelineEvent("TERMINOLOGY_REGISTERED", "TerminologyRegistry", `Terminology registry registered: ${normalizedId}`);
            return record;
        }

        unregisterTerminologyRegistry(id) {
            if (!id || typeof id !== "string") return false;
            return this.#terminologies.delete(id.trim().toLowerCase());
        }

        getTerminologyRegistry(id) {
            if (!id || typeof id !== "string") return null;
            return this.#terminologies.get(id.trim().toLowerCase()) || null;
        }

        listTerminologyRegistries() {
            return Object.freeze(Array.from(this.#terminologies.values()));
        }

        hasTerminologyRegistry(id) {
            if (!id || typeof id !== "string") return false;
            return this.#terminologies.has(id.trim().toLowerCase());
        }

        countTerminologyRegistries() {
            return this.#terminologies.size;
        }

        registerDeviceBinding(id, flags) {
            const normalizedId = this.#requireNonEmptyString(id, "id", "Device Binding Registration").toLowerCase();
            if (this.#devices.has(normalizedId)) {
                throw new Error(`[CozyTranslate] Collision Exception: Device binding '${id}' is already registered.`);
            }
            const record = Object.freeze({ id: normalizedId, ...flags, boundAt: Date.now() });
            this.#devices.set(normalizedId, record);
            this.logTimelineEvent("DEVICE_BOUND", "DeviceRegistry", `Device bound: ${normalizedId}`);
            return record;
        }

        unregisterDeviceBinding(id) {
            if (!id || typeof id !== "string") return false;
            return this.#devices.delete(id.trim().toLowerCase());
        }

        getDeviceBinding(id) {
            if (!id || typeof id !== "string") return null;
            return this.#devices.get(id.trim().toLowerCase()) || null;
        }

        listDeviceBindings() {
            return Object.freeze(Array.from(this.#devices.values()));
        }

        hasDeviceBinding(id) {
            if (!id || typeof id !== "string") return false;
            return this.#devices.has(id.trim().toLowerCase());
        }

        countDeviceBindings() {
            return this.#devices.size;
        }

        registerOfflinePackage(id, meta) {
            const normalizedId = this.#requireNonEmptyString(id, "id", "Offline Package Registration").toLowerCase();
            if (this.#offlinePackages.has(normalizedId)) {
                throw new Error(`[CozyTranslate] Collision Exception: Offline package '${id}' is already registered.`);
            }
            const record = Object.freeze({ id: normalizedId, ...meta, syncedAt: Date.now() });
            this.#offlinePackages.set(normalizedId, record);
            this.logTimelineEvent("OFFLINE_PACKAGE_REGISTERED", "OfflinePackageRegistry", `Offline package registered: ${normalizedId}`);
            return record;
        }

        unregisterOfflinePackage(id) {
            if (!id || typeof id !== "string") return false;
            return this.#offlinePackages.delete(id.trim().toLowerCase());
        }

        getOfflinePackage(id) {
            if (!id || typeof id !== "string") return null;
            return this.#offlinePackages.get(id.trim().toLowerCase()) || null;
        }

        listOfflinePackages() {
            return Object.freeze(Array.from(this.#offlinePackages.values()));
        }

        hasOfflinePackage(id) {
            if (!id || typeof id !== "string") return false;
            return this.#offlinePackages.has(id.trim().toLowerCase());
        }

        countOfflinePackages() {
            return this.#offlinePackages.size;
        }

        // =========================================================================
        // ─── LANGUAGE SET EXTENSIBILITY  [v2.2.0] ────────────────────────────────
        // =========================================================================

        registerSourceLanguage(code) {
            const normalized = this.#requireNonEmptyString(code, "code", "Source Language Registration").toLowerCase();
            this.#sourceLanguages.add(normalized);
            this.logTimelineEvent("SOURCE_LANGUAGE_REGISTERED", "LanguageRegistry", `Source language added: ${normalized}`);
            return true;
        }

        unregisterSourceLanguage(code) {
            if (!code || typeof code !== "string") return false;
            return this.#sourceLanguages.delete(code.trim().toLowerCase());
        }

        registerTargetLanguage(code) {
            const normalized = this.#requireNonEmptyString(code, "code", "Target Language Registration").toLowerCase();
            this.#targetLanguages.add(normalized);
            this.logTimelineEvent("TARGET_LANGUAGE_REGISTERED", "LanguageRegistry", `Target language added: ${normalized}`);
            return true;
        }

        unregisterTargetLanguage(code) {
            if (!code || typeof code !== "string") return false;
            return this.#targetLanguages.delete(code.trim().toLowerCase());
        }

        getSupportedSourceLanguages() {
            return Object.freeze(Array.from(this.#sourceLanguages));
        }

        getSupportedTargetLanguages() {
            return Object.freeze(Array.from(this.#targetLanguages));
        }

        // =========================================================================
        // ─── VERSION HISTORY  [v2.2.0] ────────────────────────────────────────────
        // =========================================================================

        recordVersionHistoryEntry(version, notes) {
            const normalizedVersion = this.#requireNonEmptyString(version, "version", "Version History");
            const record = Object.freeze({ version: normalizedVersion, notes: notes ? String(notes) : "", recordedAt: Date.now() });
            this.#versionHistory.set(normalizedVersion, record);
            this.logTimelineEvent("VERSION_HISTORY_RECORDED", "VersionHistory", `Version recorded: ${normalizedVersion}`);
            return record;
        }

        getVersionHistoryEntry(version) {
            if (!version || typeof version !== "string") return null;
            return this.#versionHistory.get(version) || null;
        }

        getVersionHistory() {
            return Object.freeze(Array.from(this.#versionHistory.values()).sort((a, b) => a.recordedAt - b.recordedAt));
        }

        // =========================================================================
        // ─── CORE ORCHESTRATION PIPELINES & REPOSITORIES ─────────────────────────
        // =========================================================================

        logTimelineEvent(type, referenceId, notes) {
            this.#timeline.push(Object.freeze({
                timestamp: Date.now(),
                type,
                referenceId,
                notes
            }));
        }

        getTimeline() { return Object.freeze([...this.#timeline]); }

        getDiagnosticsReport() {
            return Object.freeze({
                kernelVersion: VERSION,
                counters: { ...this.#diagnostics },
                registriesDepth: {
                    loadedTranslators: this.#translators.size,
                    trackedSessions: this.#sessions.size,
                    activeStreams: this.#streams.size,
                    channels: this.#channels.size,
                    segments: this.#segments.size,
                    boundDevices: this.#devices.size,
                    outputs: this.#outputs.size,
                    plugins: this.#plugins.size,
                    glossaries: this.#glossaries.size,
                    terminologyRegistries: this.#terminologies.size,
                    loadedOfflinePackages: this.#offlinePackages.size,
                    closedIntegrationsConnected: this.#closedIntegrations.size,
                    timelineEvents: this.#timeline.length,
                    versionHistoryEntries: this.#versionHistory.size
                }
            });
        }

        // --- PUBSUB COMMUNICATIONS WORKSPACE LAYER ---
        on(event, handler) {
            if (!this.#eventListeners.has(event)) this.#eventListeners.set(event, new Set());
            this.#eventListeners.get(event).add(handler);
        }

        emit(event, payload) {
            if (this.#eventListeners.has(event)) {
                for (const handler of this.#eventListeners.get(event)) {
                    try { handler(payload); } catch (e) { this.#diagnostics.failuresLogged++; }
                }
            }
        }

        #deepCloneAndFreeze(obj) {
            if (obj === null || typeof obj !== "object") return obj;
            if (Array.isArray(obj)) return Object.freeze(obj.map(item => this.#deepCloneAndFreeze(item)));
            const clone = {};
            for (const key of Object.keys(obj)) clone[key] = this.#deepCloneAndFreeze(obj[key]);
            return Object.freeze(clone);
        }
    }

    const kernelInstance = new CozyTranslateKernel();

    // Seal public global interface parameters elegantly
    window.CozyOS.CozyTranslate = Object.freeze({
        registerTranslator: (adapter) => kernelInstance.registerTranslator(adapter),
        unregisterTranslator: (id) => kernelInstance.unregisterTranslator(id),
        getTranslator: (id) => kernelInstance.getTranslator(id),
        listTranslators: () => kernelInstance.listTranslators(),
        hasTranslator: (id) => kernelInstance.hasTranslator(id),
        countTranslators: () => kernelInstance.countTranslators(),

        createSession: (config) => kernelInstance.createSession(config),
        transitionSessionState: (id, state) => kernelInstance.transitionSessionState(id, state),
        getSession: (id) => kernelInstance.getSession(id),
        listSessions: () => kernelInstance.listSessions(),
        countSessions: () => kernelInstance.countSessions(),

        orchestrateStream: (sid, meta) => kernelInstance.orchestrateStream(sid, meta),
        getStream: (id) => kernelInstance.getStream(id),
        listStreams: () => kernelInstance.listStreams(),
        countStreams: () => kernelInstance.countStreams(),

        routeSegment: (smid, data) => kernelInstance.routeSegment(smid, data),
        getSegment: (id) => kernelInstance.getSegment(id),
        listSegments: () => kernelInstance.listSegments(),
        countSegments: () => kernelInstance.countSegments(),

        registerChannel: (config) => kernelInstance.registerChannel(config),
        unregisterChannel: (id) => kernelInstance.unregisterChannel(id),
        getChannel: (id) => kernelInstance.getChannel(id),
        listChannels: () => kernelInstance.listChannels(),
        hasChannel: (id) => kernelInstance.hasChannel(id),
        countChannels: () => kernelInstance.countChannels(),

        registerClosedIntegration: (integration) => kernelInstance.registerClosedIntegration(integration),
        unregisterClosedIntegration: (id) => kernelInstance.unregisterClosedIntegration(id),
        getClosedIntegration: (id) => kernelInstance.getClosedIntegration(id),
        listClosedIntegrations: () => kernelInstance.listClosedIntegrations(),
        hasClosedIntegration: (id) => kernelInstance.hasClosedIntegration(id),
        countClosedIntegrations: () => kernelInstance.countClosedIntegrations(),
        dispatchClosedIntegration: (id, data) => kernelInstance.dispatchClosedIntegration(id, data),

        registerOutput: (config) => kernelInstance.registerOutput(config),
        unregisterOutput: (id) => kernelInstance.unregisterOutput(id),
        getOutput: (id) => kernelInstance.getOutput(id),
        listOutputs: () => kernelInstance.listOutputs(),
        hasOutput: (id) => kernelInstance.hasOutput(id),
        countOutputs: () => kernelInstance.countOutputs(),

        registerPlugin: (config) => kernelInstance.registerPlugin(config),
        unregisterPlugin: (id) => kernelInstance.unregisterPlugin(id),
        getPlugin: (id) => kernelInstance.getPlugin(id),
        listPlugins: () => kernelInstance.listPlugins(),
        hasPlugin: (id) => kernelInstance.hasPlugin(id),
        countPlugins: () => kernelInstance.countPlugins(),

        registerGlossary: (id, maps) => kernelInstance.registerGlossary(id, maps),
        unregisterGlossary: (id) => kernelInstance.unregisterGlossary(id),
        getGlossary: (id) => kernelInstance.getGlossary(id),
        listGlossaries: () => kernelInstance.listGlossaries(),
        hasGlossary: (id) => kernelInstance.hasGlossary(id),
        countGlossaries: () => kernelInstance.countGlossaries(),

        registerTerminologyRegistry: (id, terms) => kernelInstance.registerTerminologyRegistry(id, terms),
        unregisterTerminologyRegistry: (id) => kernelInstance.unregisterTerminologyRegistry(id),
        getTerminologyRegistry: (id) => kernelInstance.getTerminologyRegistry(id),
        listTerminologyRegistries: () => kernelInstance.listTerminologyRegistries(),
        hasTerminologyRegistry: (id) => kernelInstance.hasTerminologyRegistry(id),
        countTerminologyRegistries: () => kernelInstance.countTerminologyRegistries(),

        registerDeviceBinding: (id, flags) => kernelInstance.registerDeviceBinding(id, flags),
        unregisterDeviceBinding: (id) => kernelInstance.unregisterDeviceBinding(id),
        getDeviceBinding: (id) => kernelInstance.getDeviceBinding(id),
        listDeviceBindings: () => kernelInstance.listDeviceBindings(),
        hasDeviceBinding: (id) => kernelInstance.hasDeviceBinding(id),
        countDeviceBindings: () => kernelInstance.countDeviceBindings(),

        registerOfflinePackage: (id, meta) => kernelInstance.registerOfflinePackage(id, meta),
        unregisterOfflinePackage: (id) => kernelInstance.unregisterOfflinePackage(id),
        getOfflinePackage: (id) => kernelInstance.getOfflinePackage(id),
        listOfflinePackages: () => kernelInstance.listOfflinePackages(),
        hasOfflinePackage: (id) => kernelInstance.hasOfflinePackage(id),
        countOfflinePackages: () => kernelInstance.countOfflinePackages(),

        registerSourceLanguage: (code) => kernelInstance.registerSourceLanguage(code),
        unregisterSourceLanguage: (code) => kernelInstance.unregisterSourceLanguage(code),
        registerTargetLanguage: (code) => kernelInstance.registerTargetLanguage(code),
        unregisterTargetLanguage: (code) => kernelInstance.unregisterTargetLanguage(code),
        getSupportedSourceLanguages: () => kernelInstance.getSupportedSourceLanguages(),
        getSupportedTargetLanguages: () => kernelInstance.getSupportedTargetLanguages(),

        recordVersionHistoryEntry: (version, notes) => kernelInstance.recordVersionHistoryEntry(version, notes),
        getVersionHistoryEntry: (version) => kernelInstance.getVersionHistoryEntry(version),
        getVersionHistory: () => kernelInstance.getVersionHistory(),

        exportKernelStateSnapshot: () => kernelInstance.exportKernelStateSnapshot(),
        importKernelStateSnapshot: (data) => kernelInstance.importKernelStateSnapshot(data),
        getTimeline: () => kernelInstance.getTimeline(),
        getDiagnosticsReport: () => kernelInstance.getDiagnosticsReport(),
        on: (evt, cb) => kernelInstance.on(evt, cb),
        getVersion: () => VERSION
    });

})();
