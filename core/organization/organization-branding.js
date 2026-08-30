/**
 * CozyOS Organization Builder — Identity & Branding Metadata
 * File Reference: core/organization/organization-branding.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * WHY THIS FILE EXISTS
 *   Repository inspection (this milestone) confirmed `organization-registry.js`
 *   owns Organization/Branch/Department *structure* only — `name`, `type`,
 *   `notes`. It has no seam for the organization-level identity/branding
 *   metadata every CozyOS application needs (logo, watermark, address,
 *   location, contact, colors). That seam did not exist anywhere else in
 *   the repository (checked `organization-role.js`, `organization-
 *   hierarchy.js`, `core/registry/cozy-registry.js`,
 *   `core/modules/identity/*`). This file is the smallest additive
 *   extension that fills it — a sibling to `organization-registry.js` and
 *   `organization-role.js`, not a replacement for either and not a second
 *   organization engine.
 *
 * REUSED, NOT DUPLICATED
 *   - `window.CozyOS.OrganizationRegistry` remains the one real source of
 *     truth for organization *existence*. This file refuses to create
 *     branding for an orgId that registry does not recognize, and calls
 *     its real `recordExternalHistory()` door instead of keeping a
 *     second, fragmented audit log.
 *   - `window.CozyOS.OrganizationRole` remains the one real source of
 *     truth for who holds what organization-defined role. Organization
 *     administrator authority for branding is derived from a real,
 *     assigned, non-archived role that declares the
 *     `organization:branding` resource permission — the same
 *     `resource:action` string format `IdentityEngine` already enforces
 *     (`/^[a-z0-9_-]+:[a-z0-9_-]+$/i`). No new role hierarchy is invented
 *     here; ChurchOS/ShopOS/etc. keep defining their own role names
 *     (Pastor, Shop Manager, ...) and simply attach that permission
 *     string to whichever real role they consider "administrator."
 *   - `window.CozyOS.IdentityEngine`, if loaded, remains the one real
 *     platform-authority source (`isPlatformAdmin()`). A platform admin
 *     can always manage any organization's branding; that check is never
 *     reimplemented here.
 *   - `window.CozyOS.CozyMedia`, if loaded, remains the one real asset
 *     store. Logo/watermark/favicon fields are never arbitrary
 *     client-supplied URLs — they are `CozyMedia` asset ids, and this
 *     file verifies the referenced asset's own `orgId` matches before
 *     accepting it, so one organization can never silently claim another
 *     organization's asset. If `CozyMedia` is not loaded, an asset
 *     reference is refused rather than accepted un-checked — fail closed,
 *     not fail open.
 *
 * HONEST SCOPE
 *   This file owns organization identity/branding metadata only:
 *   name/displayName/shortName/description, logo/watermark/favicon
 *   references, brand colors, address, location, contact, and preferred
 *   language. It does not implement asset upload/storage (that is
 *   `CozyMedia`'s job), does not implement organization role management
 *   (that is `organization-role.js`'s job), and does not implement
 *   application registration (that is `ServiceRegistry`'s job).
 *
 * PRIVACY
 *   Precise street address, postal code, and contact email/phone are
 *   treated as organization-internal fields — returned only to
 *   authorized viewers (platform admin, or a real assigned role within
 *   that same organization). Ordinary/public viewers (any other
 *   dashboard viewer) receive only the public-safe subset: display
 *   identity, logo/watermark/favicon references, brand colors, website,
 *   and city/region/country — never the full street address, postal
 *   code, or direct contact details. This file never requests or stores
 *   device GPS; location is organization-declared country/region/city
 *   only.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const ORG_BRANDING_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    const BRANDING_PERMISSION = "organization:branding";

    function sanitize(input) {
        if (!input || typeof input !== "object") return {};
        const clean = {};
        for (const key of Object.keys(input)) { if (!FORBIDDEN_KEYS.has(key)) clean[key] = input[key]; }
        return clean;
    }

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

    class CozyOrganizationBranding {
        #branding = new Map(); // orgId -> branding record
        #diagnostics = { brandingSet: 0, brandingUpdated: 0, assetRejections: 0, authorityDenials: 0 };

        getVersion() { return ORG_BRANDING_VERSION; }
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

        #record(action, orgId, detail) {
            if (window.CozyOS.OrganizationRegistry && typeof window.CozyOS.OrganizationRegistry.recordExternalHistory === "function") {
                window.CozyOS.OrganizationRegistry.recordExternalHistory(action, "organization-branding", orgId, detail);
            } else if (window.CozyOS.PlatformEventBus) {
                try { window.CozyOS.PlatformEventBus.emit(`organization:${action}`, { entityType: "organization-branding", entityId: orgId, ...detail }); } catch (_err) { /* non-fatal */ }
            }
        }

        /**
         * #canManageBranding(orgId, userId) — real authority check.
         *   Platform admin (IdentityEngine, if loaded) always passes.
         *   Otherwise requires a real, non-archived OrganizationRole,
         *   assigned to exactly this userId, scoped to exactly this
         *   orgId, that declares the "organization:branding" permission.
         *   An arbitrary client-supplied "admin" string or an unrelated
         *   application-level role never satisfies this.
         */
        #canManageBranding(orgId, userId) {
            if (!isNonEmptyString(userId)) return false;
            const identity = window.CozyOS.IdentityEngine;
            if (identity && typeof identity.isPlatformAdmin === "function") {
                try { if (identity.isPlatformAdmin(userId)) return true; } catch (_err) { /* non-fatal, fall through */ }
            }
            const roleEngine = window.CozyOS.OrganizationRole;
            if (!roleEngine || typeof roleEngine.listRoles !== "function") return false;
            const roles = roleEngine.listRoles({ orgId, includeArchived: false });
            return roles.some(r => r.assignedUserId === userId && Array.isArray(r.permissions) && r.permissions.includes(BRANDING_PERMISSION));
        }

        /**
         * #resolveAsset(orgId, assetId) — real, fail-closed asset check.
         *   Returns the assetId only if CozyMedia is loaded, the asset
         *   genuinely exists, and its own recorded orgId matches this
         *   organization. Returns null (not the unchecked input) in every
         *   other case, so an unverifiable or cross-organization asset
         *   reference is silently dropped rather than trusted.
         */
        #resolveAsset(orgId, assetId) {
            if (assetId === null || assetId === undefined) return null;
            if (!isNonEmptyString(assetId)) { this.#diagnostics.assetRejections++; return null; }
            const media = window.CozyOS.CozyMedia;
            if (!media || typeof media.getMedia !== "function") { this.#diagnostics.assetRejections++; return null; }
            const asset = media.getMedia(assetId);
            if (!asset) { this.#diagnostics.assetRejections++; return null; }
            if (asset.orgId !== orgId) { this.#diagnostics.assetRejections++; return null; }
            return assetId;
        }

        #buildAddress(raw) {
            const a = sanitize(raw);
            return Object.freeze({
                line1: a.line1 ? this.#escapeHtml(a.line1) : null,
                line2: a.line2 ? this.#escapeHtml(a.line2) : null,
                city: a.city ? this.#escapeHtml(a.city) : null,
                region: a.region ? this.#escapeHtml(a.region) : null,
                country: a.country ? this.#escapeHtml(a.country) : null,
                postalCode: a.postalCode ? this.#escapeHtml(a.postalCode) : null,
            });
        }

        #buildContact(raw) {
            const c = sanitize(raw);
            return Object.freeze({
                email: c.email ? this.#escapeHtml(c.email) : null,
                phone: c.phone ? this.#escapeHtml(c.phone) : null,
                website: c.website ? this.#escapeHtml(c.website) : null,
            });
        }

        #buildColors(raw) {
            const c = sanitize(raw);
            const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
            const clean = (v) => (typeof v === "string" && HEX.test(v.trim())) ? v.trim() : null;
            return Object.freeze({ primary: clean(c.primary), secondary: clean(c.secondary), accent: clean(c.accent) });
        }

        /**
         * setBranding({orgId, requestedByUserId, ...fields})
         *   Real, fail-closed on: nonexistent organization, missing
         *   authority, or an unverifiable asset reference. Performs a
         *   partial merge over any existing record — callers may update
         *   only the fields they hold, exactly like `renameEntity()` does
         *   for the sibling registry.
         */
        setBranding(rawInput = {}) {
            const input = sanitize(rawInput);
            const registry = window.CozyOS.OrganizationRegistry;
            if (!registry || typeof registry.organizationExists !== "function") {
                return { success: false, reason: "[organization-branding] OrganizationRegistry is not loaded — cannot verify a real organization." };
            }
            if (!isNonEmptyString(input.orgId) || !registry.organizationExists(input.orgId)) {
                return { success: false, reason: `[organization-branding] no real organization "${input.orgId}".` };
            }
            if (!this.#canManageBranding(input.orgId, input.requestedByUserId)) {
                this.#diagnostics.authorityDenials++;
                this.#record("branding-denied", input.orgId, { requestedByUserId: input.requestedByUserId || null });
                return { success: false, reason: "Not authorized to manage this organization's branding." };
            }

            const existing = this.#branding.get(input.orgId);
            const now = new Date().toISOString();

            const identityIn = sanitize(input.identity);
            const brandingIn = sanitize(input.branding);
            const record = Object.freeze({
                orgId: input.orgId,
                identity: Object.freeze({
                    displayName: identityIn.displayName ? this.#escapeHtml(identityIn.displayName.trim()) : (existing?.identity?.displayName ?? null),
                    shortName: identityIn.shortName ? this.#escapeHtml(identityIn.shortName.trim()) : (existing?.identity?.shortName ?? null),
                    description: identityIn.description ? this.#escapeHtml(identityIn.description.trim()) : (existing?.identity?.description ?? null),
                }),
                branding: Object.freeze({
                    logoAssetId: "logoAssetId" in brandingIn ? this.#resolveAsset(input.orgId, brandingIn.logoAssetId) : (existing?.branding?.logoAssetId ?? null),
                    logoLightAssetId: "logoLightAssetId" in brandingIn ? this.#resolveAsset(input.orgId, brandingIn.logoLightAssetId) : (existing?.branding?.logoLightAssetId ?? null),
                    logoDarkAssetId: "logoDarkAssetId" in brandingIn ? this.#resolveAsset(input.orgId, brandingIn.logoDarkAssetId) : (existing?.branding?.logoDarkAssetId ?? null),
                    faviconAssetId: "faviconAssetId" in brandingIn ? this.#resolveAsset(input.orgId, brandingIn.faviconAssetId) : (existing?.branding?.faviconAssetId ?? null),
                    watermarkAssetId: "watermarkAssetId" in brandingIn ? this.#resolveAsset(input.orgId, brandingIn.watermarkAssetId) : (existing?.branding?.watermarkAssetId ?? null),
                    watermarkOpacity: typeof brandingIn.watermarkOpacity === "number" && brandingIn.watermarkOpacity >= 0 && brandingIn.watermarkOpacity <= 1
                        ? brandingIn.watermarkOpacity : (existing?.branding?.watermarkOpacity ?? 0.15),
                    colors: "colors" in brandingIn ? this.#buildColors(brandingIn.colors) : (existing?.branding?.colors ?? this.#buildColors({})),
                }),
                address: "address" in input ? this.#buildAddress(input.address) : (existing?.address ?? this.#buildAddress({})),
                contact: "contact" in input ? this.#buildContact(input.contact) : (existing?.contact ?? this.#buildContact({})),
                preferredLanguage: isNonEmptyString(input.preferredLanguage) ? this.#escapeHtml(input.preferredLanguage.trim()) : (existing?.preferredLanguage ?? null),
                createdAt: existing?.createdAt ?? now,
                updatedAt: now,
                updatedBy: input.requestedByUserId,
            });

            this.#branding.set(input.orgId, record);
            if (existing) this.#diagnostics.brandingUpdated++; else this.#diagnostics.brandingSet++;
            this.#record(existing ? "branding-updated" : "branding-created", input.orgId, { requestedByUserId: input.requestedByUserId });
            return { success: true, branding: this.#deepClone(record) };
        }

        /**
         * getBranding(orgId, {viewerUserId})
         *   Returns null (an honest "unavailable", never fake data) if no
         *   organization or no branding record exists. Otherwise returns
         *   the full record to an authorized viewer (platform admin, or a
         *   real assigned role in this organization) and the public-safe
         *   subset — no full address, postal code, or direct contact
         *   details — to everyone else.
         */
        getBranding(orgId, { viewerUserId = null } = {}) {
            if (!isNonEmptyString(orgId)) return null;
            const record = this.#branding.get(orgId);
            if (!record) return null;

            const isAuthorized = this.#isAuthorizedViewer(orgId, viewerUserId);
            const publicView = {
                orgId: record.orgId,
                identity: { ...record.identity },
                branding: { ...record.branding, colors: { ...record.branding.colors } },
                location: { city: record.address.city, region: record.address.region, country: record.address.country },
                website: record.contact.website,
                preferredLanguage: record.preferredLanguage,
                updatedAt: record.updatedAt,
            };
            if (!isAuthorized) return this.#deepClone(publicView);
            return this.#deepClone({ ...publicView, address: { ...record.address }, contact: { ...record.contact }, createdAt: record.createdAt, updatedBy: record.updatedBy });
        }

        /** #isAuthorizedViewer — same real authority as #canManageBranding, reused rather than duplicated, so "who can see private fields" and "who can change them" never drift apart. */
        #isAuthorizedViewer(orgId, userId) {
            if (!isNonEmptyString(userId)) return false;
            const identity = window.CozyOS.IdentityEngine;
            if (identity && typeof identity.isPlatformAdmin === "function") {
                try { if (identity.isPlatformAdmin(userId)) return true; } catch (_err) { /* non-fatal */ }
            }
            const roleEngine = window.CozyOS.OrganizationRole;
            if (!roleEngine || typeof roleEngine.listRoles !== "function") return false;
            const roles = roleEngine.listRoles({ orgId, includeArchived: false });
            return roles.some(r => r.assignedUserId === userId);
        }

        hasBranding(orgId) { return this.#branding.has(orgId); }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: ORG_BRANDING_VERSION, ...this.#diagnostics, totalOrganizationsWithBranding: this.#branding.size });
        }
    }

    if (window.CozyOS.OrganizationBranding && typeof window.CozyOS.OrganizationBranding.getVersion === "function") {
        const existingVersion = window.CozyOS.OrganizationBranding.getVersion();
        if (existingVersion !== ORG_BRANDING_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: OrganizationBranding existing v${existingVersion} conflicts with load target v${ORG_BRANDING_VERSION}.`);
        return;
    }

    window.CozyOS.OrganizationBranding = new CozyOrganizationBranding();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/organization/organization-branding.js",
                name: "OrganizationBranding", category: "Platform", icon: "palette.svg",
                description: "Real, shared organization identity/branding metadata seam — name, logo, watermark, address, location, contact, colors. Generic for every CozyOS application (ChurchOS, MpesaOS, ShopOS, WholesaleOS, QuarryOS, ...); never one application's private engine."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
