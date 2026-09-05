/**
 * CozyOS — Durable (Server-Backed) Document Storage Provider
 * File Reference: core/modules/documents/cozy-document-durable-storage-provider.js
 * Layer: Platform Service (opt-in, NOT auto-registered)
 * Version: 1.0.0
 *
 * CozyOS File Phase 1, Step 5.
 *
 * RESPONSIBILITY
 *   Implements the exact same five-method contract
 *   (save/load/delete/archive/restore) that DocumentEngine's
 *   registerStorageProvider() already requires — the identical
 *   contract the existing in-memory reference provider
 *   (cozy-document-storage-provider.js) implements — except this one
 *   persists durably via the real server routes added this phase
 *   (server/webauthn-rp/server.js's /documents/* routes, backed by
 *   server/webauthn-rp/document-storage.js). DocumentEngine itself is
 *   never modified and never becomes aware this file exists.
 *
 * NOT AUTO-REGISTERED — OFFLINE-FIRST BOUNDARY
 *   Unlike the in-memory provider, this file does NOT register itself
 *   into DocumentEngine on load. This is deliberate: DocumentEngine's
 *   safe, always-available default must remain the in-memory provider
 *   (or whatever an application has already chosen) unless an
 *   application explicitly opts into network-dependent, durable
 *   storage by calling registerAsDocumentStorageProvider() itself, once
 *   it knows a real server is actually reachable. Auto-registering a
 *   network-dependent provider as the silent default would let a
 *   network outage break document storage for applications that never
 *   asked for network dependency in the first place — a direct
 *   violation of CozyOS's offline-first Core principle.
 *
 * FAILURE ISOLATION
 *   Every method below fails closed and returns the exact same
 *   {available:false, reason} shape the in-memory provider already
 *   uses for its own failure cases — a network failure here is
 *   indistinguishable, from DocumentEngine's point of view, from "the
 *   document wasn't found" or "permission denied" in the in-memory
 *   provider. It never throws for a network-level failure (only for
 *   genuine programmer errors, matching the in-memory provider's own
 *   TypeError-on-missing-documentId behavior). This is a real, network-
 *   dependent capability, and is never described as offline-capable.
 *
 * ORGANIZATION IDENTITY
 *   The server's real, authoritative isolation column is
 *   organization_id (matching every other CozyOS registry since
 *   Phase 2: OrganizationRegistry, BillingRegistry, KnowledgeRegistry).
 *   The Standard Document Record's own companyId field (DocumentEngine's
 *   real, existing field name — confirmed by direct inspection this
 *   phase) is passed through completely unchanged inside the record
 *   body; this file only additionally requires the caller to supply
 *   which real organizationId the request is scoped to, matching the
 *   server route's own required parameter. It does not rename or
 *   reinterpret companyId in any way.
 */
(function () {
  "use strict";
  window.CozyOS = window.CozyOS || {};

  const PROVIDER_VERSION = "1.0.0";

  class CozyDocumentDurableStorageProvider {
    #baseUrl;
    #organizationId;

    /**
     * constructor({baseUrl, organizationId})
     *   organizationId is required up front — this provider is always
     *   scoped to one real organization for its lifetime, matching how
     *   an application would naturally hold one active organization
     *   context at a time. baseUrl defaults to same-origin (empty
     *   string), matching how the rest of CozyOS's fetch() calls to
     *   /webauthn/* already work.
     */
    constructor({ baseUrl = "", organizationId } = {}) {
      if (!organizationId) throw new TypeError("[DurableDocStorage] organizationId is required.");
      this.#baseUrl = baseUrl;
      this.#organizationId = organizationId;
    }

    getVersion() { return PROVIDER_VERSION; }

    async #post(path, body) {
      try {
        const response = await fetch(`${this.#baseUrl}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(body)
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          // Matches the in-memory provider's own {available:false, reason}
          // shape exactly — a network/auth/authorization failure here
          // must look identical to DocumentEngine as any other honest
          // "this operation did not succeed" result.
          return { available: false, reason: json.error || `Request failed (${response.status}).`, httpStatus: response.status };
        }
        return json;
      } catch (err) {
        // Real network failure (server unreachable, DNS failure, offline,
        // etc.) - fails closed, never throws, never fabricates success.
        return { available: false, reason: "Durable storage is unreachable.", networkError: true, detail: err && err.message };
      }
    }

    /** save(record) - the exact method DocumentEngine.saveDocument() calls. */
    async save(record) {
      return this.#post("/documents", { organizationId: this.#organizationId, record: record || {} });
    }

    /** load(documentId) - the exact method DocumentEngine.getDocument() calls. */
    async load(documentId) {
      return this.#post("/documents/load", { organizationId: this.#organizationId, documentId });
    }

    /** delete(documentId) - real soft delete via the durable backend, matching the in-memory provider's own soft-delete semantics exactly. */
    async delete(documentId) {
      return this.#post("/documents/delete", { organizationId: this.#organizationId, documentId });
    }

    /** archive(documentId) */
    async archive(documentId) {
      return this.#post("/documents/archive", { organizationId: this.#organizationId, documentId });
    }

    /** restore(documentId) */
    async restore(documentId) {
      return this.#post("/documents/restore", { organizationId: this.#organizationId, documentId });
    }

    /** getDocumentVersions(documentId) - real version history from the durable backend, matching the in-memory provider's own method name and shape. */
    async getDocumentVersions(documentId) {
      const result = await this.#post("/documents/versions", { organizationId: this.#organizationId, documentId });
      return result.available ? result.versions : [];
    }

    /** searchDocuments(filters) - matches the in-memory provider's own method name; returns a plain array, honestly empty on failure rather than throwing. */
    async searchDocuments(filters = {}) {
      const result = await this.#post("/documents/search", { organizationId: this.#organizationId, filters });
      return result.available ? result.documents : [];
    }

    getDiagnosticsReport() {
      return {
        pluginVersion: PROVIDER_VERSION,
        backendType: "durable-server",
        durableAcrossReload: true,
        durableAcrossRestart: true,
        organizationId: this.#organizationId,
        networkDependent: true,
        offlineCapable: false
      };
    }
  }

  /**
   * registerAsDocumentStorageProvider({baseUrl, organizationId})
   *   The explicit, deliberate opt-in point. An application calls this
   *   itself, once it knows an organization context and a real server
   *   are both actually available - never called automatically by this
   *   file's own load.
   */
  function registerAsDocumentStorageProvider(options) {
    const provider = new CozyDocumentDurableStorageProvider(options);
    if (!window.CozyOS.DocumentEngine || typeof window.CozyOS.DocumentEngine.registerStorageProvider !== "function") {
      throw new Error("[DurableDocStorage] window.CozyOS.DocumentEngine.registerStorageProvider() is not available - DocumentEngine must be loaded first.");
    }
    window.CozyOS.DocumentEngine.registerStorageProvider({
      save: (record) => provider.save(record),
      load: (documentId) => provider.load(documentId),
      delete: (documentId) => provider.delete(documentId),
      archive: (documentId) => provider.archive(documentId),
      restore: (documentId) => provider.restore(documentId)
    });
    return provider;
  }

  window.CozyOS.DocumentDurableStorageProvider = Object.freeze({
    create: (options) => new CozyDocumentDurableStorageProvider(options),
    registerAsDocumentStorageProvider,
    getVersion: () => PROVIDER_VERSION
  });
})();
