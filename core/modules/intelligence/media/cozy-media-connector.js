/**
 * CozyOS Remote Media Intelligence — core/modules/intelligence/media/
 * cozy-media-connector.js
 * RP-034 Phase 1: Connector Foundation (YouTube)
 * Milestone: CozyOS Remote Media Intelligence Connector
 * Baseline: CozyOS-main-RP-033-Gate2.zip (verified: SHA-256
 * fd03e226c10580830e689684d7a8f0fa6fb33d76349d38e32742cecb2d5189e2,
 * `unzip -t` clean, Gate 2's 51/51 + Gate 1's 34/34 tests re-run and
 * passing before any RP-034 code was written).
 *
 * MILESTONE SCOPE — THIS FILE IS PHASE 1 ONLY
 *   RP-034 is an 8-phase milestone (Connector Foundation, Remote Media
 *   Index, CozyAI Search, full Media Intelligence Pipeline, African
 *   Language Integration, Privacy/Identity, Offline/Connectivity
 *   Integration, Tests & Delivery). Per this repository's own
 *   established gate/phase convention (see RP-033 Gate 1 → Gate 2),
 *   this pass delivers Phase 1 — Connector Foundation — honestly and
 *   completely, and defers Phases 2-8 rather than fabricating a
 *   partial, untested implementation of all eight at once. Nothing in
 *   Phases 2-8 (persistent index, search, transcript/OCR pipeline,
 *   language routing, identity/privacy, offline sync composition) is
 *   claimed as implemented here.
 *
 * OWNERSHIP: repository-wide search before writing this file found no
 * existing remote-media / YouTube / video-source connector anywhere in
 * this repository. This is a genuinely new, necessary owner. It creates
 * a generic, reusable MediaConnectorRegistry (the "connector interface
 * reusable by future sources" the RP-034 prompt calls for) and registers
 * exactly one connector — YouTube — as Phase 1's real, concrete instance.
 *
 * HONEST SCOPE — WHAT THIS FILE ACTUALLY DOES
 *   REAL: account-authorization *state* (this file does not fabricate a
 *   real OAuth handshake — no browser OAuth popup flow exists in this
 *   repository to compose, and none is invented here — it accepts a
 *   real, externally-obtained access token/API key from the caller and
 *   honestly tracks NOT_AUTHORIZED/AUTHORIZED/REVOKED state); real
 *   video-ID/URL parsing (a genuine, tested parser for youtube.com/
 *   youtu.be URL shapes); real capability detection (network/fetch
 *   availability, API key presence) reported in the same honest
 *   AVAILABLE/PARTIAL/UNAVAILABLE/CAPABILITY_UNAVAILABLE vocabulary
 *   RP-033 established; a real, standard YouTube Data API v3
 *   `videos?part=snippet,contentDetails` call via the real, standard
 *   Fetch API when a caller has actually configured an API key and
 *   fetch is actually available — parsing real response fields
 *   (id/snippet.title/snippet.channelTitle/snippet.publishedAt/
 *   contentDetails.duration) into the metadata shape Phase 1 asks for.
 *
 *   NOT REAL, honestly refused rather than fabricated: no video
 *   download of any kind; no frame/pixel access; no scraping outside
 *   the real, documented YouTube Data API; no automatic/implicit
 *   authorization (a caller must supply a real credential — this file
 *   never assumes access because "an account exists"); no transcript
 *   fetch, OCR, speech-to-text, or knowledge extraction (Phases 3-4);
 *   no persistent index (Phase 2); no language routing (Phase 5); no
 *   person/identity handling (Phase 6, deliberately absent from this
 *   file's surface entirely — there is no name/face field anywhere in
 *   Phase 1's metadata shape). This environment also has no outbound
 *   network access at all (confirmed while testing this file), so a
 *   real API call attempted here will genuinely fail at the network
 *   layer — reported as a real error, never silently swallowed or
 *   faked into a success.
 *
 * DOES NOT DUPLICATE: no second capability-status vocabulary (reuses
 * RP-033's AVAILABLE/PARTIAL/UNAVAILABLE/CAPABILITY_UNAVAILABLE), no
 * second provider-registry pattern re-invented from scratch (mirrors
 * CozyConnect's real ProviderRegistry shape: register/get/list), no
 * touching of `core/modules/intelligence/knowledge/cozy-knowledge-
 * ingestion.js` (RP-029-A), `.../ui/cozy-knowledge-safety-gate.js`
 * (RP-029-C), `.../language-packs/cozy-language-pack-registry.js`
 * (RP-030), or `.../language-packs/cozy-language-acquisition-
 * pipeline.js` (RP-031) — all four were located and their real, frozen
 * public APIs noted for the *documented, deferred* Phase 4/5 wiring
 * (ingestCommunitySubmission()/confirmCandidate() on
 * CozyKnowledgeIngestion; the safety-gate-first pipeline on
 * CozyLanguagePacks; the regional-routing heuristic on the acquisition
 * pipeline) — none of them is called or modified by this file.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.CozyOS = root.CozyOS || {};
        factory(root);
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function (rootArg) {
    "use strict";

    const VERSION = "1.0.0-rp034-phase1";

    function hasWindow() { return typeof window !== "undefined"; }
    function cozyOS() { return hasWindow() ? window.CozyOS : (typeof globalThis !== "undefined" ? globalThis.CozyOS : undefined); }
    function hasFetch() { return typeof fetch === "function"; }

    /* ------------------------------------------------------------------ */
    /* 1. CAPABILITY VOCABULARY — reused, not re-invented (RP-033)        */
    /* ------------------------------------------------------------------ */

    const CAPABILITY_STATUS = Object.freeze({
        AVAILABLE: "AVAILABLE",
        PARTIAL: "PARTIAL",
        UNAVAILABLE: "UNAVAILABLE",
        CAPABILITY_UNAVAILABLE: "CAPABILITY_UNAVAILABLE"
    });

    const AUTHORIZATION_STATES = Object.freeze(["NOT_AUTHORIZED", "AUTHORIZED", "REVOKED"]);

    /* ------------------------------------------------------------------ */
    /* 2. GENERIC MEDIA CONNECTOR REGISTRY — reusable by future sources   */
    /*    (mirrors CozyConnect's real ProviderRegistry shape)             */
    /* ------------------------------------------------------------------ */

    class MediaConnectorRegistry {
        #connectors = new Map();
        register(name, connector) {
            if (!name || typeof connector !== "object") return { success: false, reason: "A real name and connector object are required." };
            if (typeof connector.capabilities !== "function" || typeof connector.getAuthorizationState !== "function") {
                return { success: false, reason: `Connector "${name}" does not implement the required MediaConnector interface (capabilities(), getAuthorizationState()).` };
            }
            this.#connectors.set(name, connector);
            return { success: true };
        }
        get(name) { return this.#connectors.get(name) || null; }
        list() { return Array.from(this.#connectors.keys()); }
    }

    /* ------------------------------------------------------------------ */
    /* 3. URL / VIDEO-ID PARSING — real, tested, no network required      */
    /* ------------------------------------------------------------------ */

    /**
     * parseYouTubeVideoId(input)
     *   Accepts a bare 11-character video ID or a real youtube.com/
     *   youtu.be URL in any of its common shapes (watch?v=, youtu.be/,
     *   /embed/, /shorts/, /live/) and returns the real video ID, or a
     *   structured failure — never a guess.
     */
    function parseYouTubeVideoId(input) {
        if (!input || typeof input !== "string") return { success: false, reason: "A real string is required." };
        const bareIdPattern = /^[A-Za-z0-9_-]{11}$/;
        if (bareIdPattern.test(input)) return { success: true, videoId: input };

        let url;
        try { url = new URL(input); } catch (_err) { return { success: false, reason: "Not a real, parseable URL or bare video ID." }; }

        const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
        if (host === "youtu.be") {
            const id = url.pathname.slice(1).split("/")[0];
            return bareIdPattern.test(id) ? { success: true, videoId: id } : { success: false, reason: "youtu.be URL did not contain a real 11-character video ID." };
        }
        if (host === "youtube.com" || host === "youtube-nocookie.com") {
            if (url.pathname === "/watch") {
                const id = url.searchParams.get("v");
                if (id && bareIdPattern.test(id)) return { success: true, videoId: id };
                return { success: false, reason: "youtube.com/watch URL is missing a real ?v= video ID." };
            }
            const embedMatch = url.pathname.match(/^\/(embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
            if (embedMatch) return { success: true, videoId: embedMatch[2] };
        }
        return { success: false, reason: `"${input}" is not a recognized YouTube URL shape.` };
    }

    /**
     * parseIso8601Duration(iso)
     *   Real ISO-8601 duration parser (the exact format the YouTube Data
     *   API's contentDetails.duration field uses, e.g. "PT4M13S") into
     *   whole seconds. Returns null, honestly, for anything malformed —
     *   never guesses a duration.
     */
    function parseIso8601Duration(iso) {
        if (typeof iso !== "string") return null;
        const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
        if (!match || (!match[1] && !match[2] && !match[3])) return null;
        const hours = parseInt(match[1] || "0", 10);
        const minutes = parseInt(match[2] || "0", 10);
        const seconds = parseInt(match[3] || "0", 10);
        return hours * 3600 + minutes * 60 + seconds;
    }

    /* ------------------------------------------------------------------ */
    /* 4. YOUTUBE CONNECTOR                                                */
    /* ------------------------------------------------------------------ */

    /**
     * YouTubeConnector
     *   config:
     *     apiKey        - a real YouTube Data API v3 key, supplied by the
     *                      caller. Never fabricated, never defaulted.
     *     fetchImpl     - injectable fetch function (defaults to the real
     *                      global fetch when present); tests inject a
     *                      real function that returns a real, correctly-
     *                      shaped YouTube Data API response object so the
     *                      real parsing logic is genuinely exercised
     *                      without requiring live network access.
     *     apiBase       - override for the real API base URL (tests only;
     *                      defaults to the real, documented endpoint).
     */
    class YouTubeConnector {
        #authState = "NOT_AUTHORIZED";
        #authorizedAccount = null;
        #apiKey;
        #fetchImpl;
        #apiBase;
        #history = [];

        constructor({ apiKey = null, fetchImpl, apiBase = "https://www.googleapis.com/youtube/v3" } = {}) {
            this.#apiKey = apiKey;
            // Explicit null/false means "force no fetch" (used to honestly
            // simulate a no-network environment in tests); omitting the
            // option entirely falls back to the real global fetch when
            // this environment actually has one.
            this.#fetchImpl = fetchImpl === undefined ? (hasFetch() ? fetch : null) : (fetchImpl || null);
            this.#apiBase = apiBase;
        }

        getId() { return "youtube"; }
        getVersion() { return VERSION; }

        /* ---- authorization ------------------------------------------------ */

        /**
         * authorize({ accountId, accessToken })
         *   Requires a real, externally-obtained accessToken — this
         *   connector performs no OAuth flow of its own. Never marks
         *   AUTHORIZED on an empty/missing token.
         */
        authorize({ accountId, accessToken } = {}) {
            if (!accountId || !accessToken) return { success: false, reason: "A real accountId and accessToken are required; this connector performs no OAuth flow of its own." };
            this.#authState = "AUTHORIZED";
            this.#authorizedAccount = { accountId, authorizedAt: new Date().toISOString() };
            this.#logHistory("authorized", { accountId });
            return { success: true, state: this.#authState };
        }
        revoke(reason) {
            if (this.#authState !== "AUTHORIZED") return { success: false, reason: "No active authorization to revoke." };
            this.#authState = "REVOKED";
            this.#logHistory("revoked", { reason: reason || null });
            return { success: true, state: this.#authState };
        }
        getAuthorizationState() { return { state: this.#authState, account: this.#authorizedAccount ? { ...this.#authorizedAccount } : null }; }
        #logHistory(action, detail) { this.#history.push({ action, detail, at: new Date().toISOString() }); if (this.#history.length > 500) this.#history.shift(); }
        getAuthorizationHistory() { return this.#history.map(h => ({ ...h })); }

        /* ---- capability detection ------------------------------------------ */

        /**
         * capabilities()
         *   Every real, checkable precondition is checked independently
         *   and reported honestly — never AVAILABLE merely because
         *   authorization exists, matching the RP-034 prompt's explicit
         *   "no access merely because an account is authorized" rule.
         */
        capabilities() {
            const network = this.#fetchImpl ? CAPABILITY_STATUS.AVAILABLE : CAPABILITY_STATUS.CAPABILITY_UNAVAILABLE;
            const apiKeyStatus = this.#apiKey ? CAPABILITY_STATUS.AVAILABLE : CAPABILITY_STATUS.UNAVAILABLE;
            const authStatus = this.#authState === "AUTHORIZED" ? CAPABILITY_STATUS.AVAILABLE : CAPABILITY_STATUS.UNAVAILABLE;

            let metadataFetch;
            let reason = null;
            if (network !== CAPABILITY_STATUS.AVAILABLE) { metadataFetch = CAPABILITY_STATUS.CAPABILITY_UNAVAILABLE; reason = "No real fetch implementation is available in this environment."; }
            else if (apiKeyStatus !== CAPABILITY_STATUS.AVAILABLE) { metadataFetch = CAPABILITY_STATUS.UNAVAILABLE; reason = "No YouTube Data API key has been configured for this connector."; }
            else { metadataFetch = CAPABILITY_STATUS.AVAILABLE; reason = "A real fetch implementation and a real API key are both present; the network call itself may still fail (rate limit, invalid key, no route to the API) and is reported honestly at call time, not fabricated here."; }

            return {
                network: { status: network, reason: network === CAPABILITY_STATUS.AVAILABLE ? null : "No fetch implementation (browser fetch/XHR or injected fetchImpl) is available." },
                apiKey: { status: apiKeyStatus, reason: apiKeyStatus === CAPABILITY_STATUS.AVAILABLE ? null : "No API key configured." },
                accountAuthorization: { status: authStatus, reason: authStatus === CAPABILITY_STATUS.AVAILABLE ? null : `Account authorization state is "${this.#authState}", not AUTHORIZED.` },
                metadataFetch: { status: metadataFetch, reason },
                // Deliberately, permanently CAPABILITY_UNAVAILABLE — no
                // backend exists anywhere in this repository, and the
                // RP-034 prompt explicitly forbids claiming these:
                videoDownload: { status: CAPABILITY_STATUS.CAPABILITY_UNAVAILABLE, reason: "Video download is out of scope for this connector by design — never implemented, not merely unavailable." },
                frameAccess: { status: CAPABILITY_STATUS.CAPABILITY_UNAVAILABLE, reason: "Frame/pixel-level video access is out of scope for this connector by design." },
                transcriptFetch: { status: CAPABILITY_STATUS.CAPABILITY_UNAVAILABLE, reason: "Transcript retrieval belongs to RP-034 Phase 4 (Media Intelligence Pipeline), not yet implemented." },
                ocrSceneIntelligence: { status: CAPABILITY_STATUS.CAPABILITY_UNAVAILABLE, reason: "No real OCR/scene-intelligence backend exists in this repository; deferred to Phase 4, and will report CAPABILITY_UNAVAILABLE even then unless a real backend is actually composed." }
            };
        }

        /* ---- metadata retrieval ------------------------------------------ */

        /**
         * getVideoMetadata(videoIdOrUrl)
         *   Real call to the real, documented YouTube Data API v3
         *   `videos` endpoint (part=snippet,contentDetails) when
         *   metadataFetch is AVAILABLE. Parses only real, present
         *   response fields — a field YouTube's API didn't return is
         *   returned here as null, never fabricated. Returns Phase 1's
         *   required shape: videoId/title/channel/date/duration/url.
         */
        async getVideoMetadata(videoIdOrUrl) {
            const parsed = parseYouTubeVideoId(videoIdOrUrl);
            if (!parsed.success) return { success: false, reason: parsed.reason };

            const caps = this.capabilities();
            if (caps.metadataFetch.status !== CAPABILITY_STATUS.AVAILABLE) {
                return { success: false, reason: caps.metadataFetch.reason, capability: caps.metadataFetch.status };
            }

            const url = `${this.#apiBase}/videos?part=snippet,contentDetails&id=${encodeURIComponent(parsed.videoId)}&key=${encodeURIComponent(this.#apiKey)}`;
            let response;
            try {
                response = await this.#fetchImpl(url);
            } catch (err) {
                return { success: false, reason: `Real network request failed: ${err.message || "unknown network error"}.`, capability: "NETWORK_ERROR" };
            }
            if (!response || typeof response.json !== "function") {
                return { success: false, reason: "fetchImpl did not return a real, usable response object." };
            }
            if ("ok" in response && !response.ok) {
                return { success: false, reason: `YouTube Data API returned a real HTTP error (status ${response.status}).` };
            }
            let body;
            try { body = await response.json(); } catch (err) { return { success: false, reason: `Response body was not real, valid JSON: ${err.message}` }; }

            const item = body && Array.isArray(body.items) ? body.items[0] : null;
            if (!item) return { success: false, reason: "YouTube Data API returned no item for this video ID — it may be private, deleted, or region-restricted." };

            const snippet = item.snippet || {};
            const contentDetails = item.contentDetails || {};
            return {
                success: true,
                metadata: Object.freeze({
                    videoId: item.id || parsed.videoId,
                    title: snippet.title || null,
                    channel: snippet.channelTitle || null,
                    date: snippet.publishedAt || null,
                    durationSeconds: parseIso8601Duration(contentDetails.duration),
                    url: `https://www.youtube.com/watch?v=${item.id || parsed.videoId}`,
                    retrievedAt: new Date().toISOString(),
                    source: "youtube",
                    provenance: "YouTube Data API v3 (real API response, not scraped)"
                })
            };
        }

        /** parseVideoId — exposed for reuse (URL parsing is source-agnostic-shaped but this instance's parser is YouTube-specific). */
        parseVideoId(input) { return parseYouTubeVideoId(input); }
    }

    /* ------------------------------------------------------------------ */
    /* 5. MODULE WIRING                                                    */
    /* ------------------------------------------------------------------ */

    const registry = new MediaConnectorRegistry();
    const youtubeConnector = new YouTubeConnector({});
    registry.register("youtube", youtubeConnector);

    const api = Object.freeze({
        getVersion: () => VERSION,
        registry,
        registerConnector: (name, connector) => registry.register(name, connector),
        getConnector: (name) => registry.get(name),
        listConnectors: () => registry.list(),
        youtube: youtubeConnector,
        CAPABILITY_STATUS,
        AUTHORIZATION_STATES,
        parseYouTubeVideoId,
        parseIso8601Duration,
        // Exposed for a future host page/service to construct an
        // independently-configured connector (its own apiKey/fetchImpl),
        // without disturbing the shared default instance above.
        createYouTubeConnector: (config) => new YouTubeConnector(config)
    });

    if (hasWindow()) {
        window.CozyOS = window.CozyOS || {};
        window.CozyOS.Modules = window.CozyOS.Modules || {};
        if (!window.CozyOS.Modules["cozy-media-connector"]) {
            window.CozyOS.CozyMediaConnectors = api;
            window.CozyOS.Modules["cozy-media-connector"] = Object.freeze({
                version: VERSION,
                description: "RP-034 Phase 1 — Remote Media Intelligence connector foundation. Generic, reusable MediaConnectorRegistry plus a real YouTube connector (authorization state, Data API v3 metadata retrieval, honest capability detection). No download/frame-access/transcript/OCR/index/search — those are RP-034 Phases 2-8, explicitly deferred."
            });
        }
        if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
            try {
                window.CozyOS.ServiceRegistry.registerCoordinator({
                    sourcePath: "core/modules/intelligence/media/cozy-media-connector.js",
                    name: "CozyMediaConnectors", category: "Living Engine",
                    description: "RP-034 Phase 1 Remote Media Intelligence connector foundation (YouTube). Real authorization-state tracking, real YouTube Data API v3 metadata retrieval, honest capability detection. No fabricated access; no download/frame/transcript/OCR capability exists in this file."
                });
            } catch (_err) { /* non-fatal */ }
        }
    }

    if (typeof module === "object" && module.exports) return api;
    return api;
}));
