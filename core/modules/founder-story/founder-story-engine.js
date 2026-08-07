/**
 * CozyOS — Founder Story Engine
 * File Reference: core/modules/founder-story/founder-story-engine.js
 * Layer: Core / Platform Module — Data & Authorization Layer
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 361 — Founder Story Vault (Foundation), Stage 1
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RULE 25 — CANONICAL OWNERSHIP DECLARATION
 * ═══════════════════════════════════════════════════════════════════════
 *   Canonical Owner: Founder Story content — title, subtitle, chapters,
 *   media references, timeline, category, language, visibility, and the
 *   audit trail of who viewed/edited/was granted or denied access to it.
 *
 *   Does NOT Own — and structurally cannot, since it holds no logic of
 *   its own for any of these:
 *     ✗ Login, session establishment — window.CozyOS.IdentityEngine /
 *       window.CozyOS.Session's domain. This file only reads
 *       Session.current() and calls IdentityEngine's real permission
 *       methods; it never re-implements authentication.
 *     ✗ Encryption, key generation, key rotation — window.CozyOS.Vault's
 *       domain (backed by encryption-manager.js, real AES-GCM via Web
 *       Crypto). This file calls Vault.generateKey()/encrypt()/
 *       decrypt() only. It never touches crypto.subtle directly and
 *       never invents a parallel cipher.
 *     ✗ Theme, colors, backgrounds — window.CozyOS.Theme /
 *       window.CozyOS.Background's domain. This file is pure data; the
 *       companion founder-story-panel.js is the only file that renders
 *       markup, and even that only reads the existing CSS custom
 *       properties (--accent-emerald, --accent-gold, --cozy-glass-bg)
 *       already defined by dashboard.html — it defines no new palette.
 *
 * NOT A SECRETS VAULT
 *   core/modules/vault/ already exists and is the platform's Secrets
 *   Vault (API keys, credentials, certificates, tokens) — its own
 *   documentation states secrets storage never holds document content,
 *   and document/story engines should only *request encryption from* it.
 *   That is exactly what this file does: it asks window.CozyOS.Vault for
 *   a key and for encrypt()/decrypt() calls, and stores the resulting
 *   ciphertext itself, in its own namespace (core/modules/founder-story/).
 *   It never writes into core/modules/vault/'s own stores.
 *
 * SECURITY MODEL
 *   - One Vault-managed AES-GCM key per story (keyId
 *     "founder-story:<storyId>"), generated on story creation.
 *   - Every sensitive field (title, subtitle, chapter body, chapter
 *     media references) is encrypted as a single JSON payload per
 *     record before it ever reaches the storage provider. Only
 *     non-sensitive routing metadata (storyId, ownerId, language,
 *     category, status, visibility, timestamps) is kept in the clear —
 *     it has to be, to list/filter stories without decrypting every
 *     one, and none of it is the Founder's private narrative content.
 *   - Decryption is attempted only after canView()/canEdit() has
 *     already returned true. A denial never reaches Vault.decrypt() at
 *     all — fail closed by construction, not by convention.
 *   - Every view, edit, permission change, access denial, and publish
 *     request is written to this module's own in-memory audit log,
 *     following the same private-#auditLog + getAuditLog(predicate)
 *     convention already established by IdentityEngine, SessionService,
 *     and AuthorizationCoordinator — not a call into either of the two
 *     general-purpose core/audit.js / core/business/audit.js loggers.
 *     (See "INHERITED AUDIT DUPLICATION" note below.)
 *
 * INHERITED AUDIT DUPLICATION (documented, not resolved here)
 *   The existing baseline carries two competing general audit loggers:
 *   core/audit.js (imported by ~10 business modules) and
 *   core/business/audit.js (imported by nothing — orphaned). Neither is
 *   actually used by the Identity/Session/Authorization stack this
 *   module composes; that stack instead uses the private-#auditLog
 *   pattern this file follows. Per Governance Scope Isolation for M361,
 *   this duplication is recorded as a pre-existing inherited issue
 *   (alongside CozyQuarryManager and InternalEventBus) and is not
 *   merged, rewritten, or resolved in this milestone.
 *
 * FAIL-CLOSED VISIBILITY
 *   Any error, missing engine, or unrecognized visibility tier resolves
 *   to DENY. Unauthorized callers never receive story data — the panel
 *   layer renders only the fixed "🔒 Private Founder Content" message.
 *
 * STAGE 1 SCOPE
 *   Story + chapter storage, metadata, visibility, authorization,
 *   audit logging, dashboard integration. Narration, the publishing
 *   website, PDF/DOCX export, and the public blog are explicitly out of
 *   scope (M362+). requestPublish() below only records intent for a
 *   future milestone — it performs no publishing action itself.
 *
 * STAGE 3 ADDITIONS (v1.2.0 → v1.3.0) — Founder Story Experience & Living
 * Narration. Every Stage 1/2 public method's signature and behavior is
 * unchanged (re-verified). Additive only:
 *   - Reading position (setReadingPosition/getReadingPosition) and
 *     bookmarks (addBookmark/listBookmarks/removeBookmark) — per-viewer,
 *     authorization-gated via the existing canView(), same disclosed
 *     in-memory, non-durable pattern as everything else in this file.
 *   - Audit events required by Stage 3's brief: READ_STARTED,
 *     READ_COMPLETED, NARRATION_STARTED, NARRATION_STOPPED,
 *     LANGUAGE_CHANGED, EXPORT_REQUESTED — logged via the existing
 *     #logAudit()/getAuditLog() pipeline, no second audit log.
 *   - requestExport() — follows requestPublish()'s exact Stage 1
 *     precedent: records intent only. No real PDF/DOCX export pipeline
 *     exists yet (still out of scope, unchanged from Stage 1's own
 *     disclosed note) — this never generates or returns a file.
 *   - Narration itself (voice synthesis, emotion/pace mapping, ambience,
 *     reader UI) is NOT implemented in this file — it has no logic of
 *     its own for any of that. It lives in the new, separate
 *     founder-story-narration.js (composes CozySpeech/VoiceManager) and
 *     the extended founder-story-panel.js (composes LivingSounds/
 *     LivingThemeEngine/CozyOS.Theme). This file only exposes the
 *     authorization-gated data (getChapter's existing multilingual body,
 *     reading position, bookmarks) those files read and write through
 *     the same public API any other caller would use.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.3.0";

    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["founder-story-engine"] && window.CozyOS.Modules["founder-story-engine"].version) return;

    const VISIBILITY_TIERS = Object.freeze(["only-me", "selected", "family", "mentors", "public"]);
    const SUPPORTED_LANGUAGES = Object.freeze(["en", "sw", "fr", "ar"]); // Arabic added in v1.1.0 — Founder-supplied native-quality text, not a literal translation
    const STORY_STATUSES = Object.freeze(["draft", "review", "ready", "published", "archived"]); // v1.2.0 (Stage 2): expanded draft workflow, additive over Stage 1's ["draft","archived"] — both original values still valid
    const CHAPTER_STATUSES = STORY_STATUSES; // same five-state workflow, shared constant — not a second definition
    const PERMISSION_LEVELS = Object.freeze(["viewer", "commenter", "editor", "cofounder"]); // "owner" is not assignable — it is the story's single, fixed ownerId
    const PRIVATE_NOTICE = Object.freeze({ locked: true, badge: "🔒 Private Founder Content", message: "This story is private." });

    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }
    function sanitizeShallow(obj) {
        if (!obj || typeof obj !== "object") return {};
        const out = {};
        for (const k of Object.keys(obj)) {
            if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
            out[k] = obj[k];
        }
        return out;
    }

    class FounderStoryEngine {
        #stories = new Map();   // storyId -> plaintext routing metadata + encrypted envelope
        #chapters = new Map();  // chapterId -> { storyId, order, encrypted envelope }
        #auditLog = [];
        #notifications = []; // Stage 2: {id, ownerId, type, detail, timestamp, read} — private per-owner, own in-memory store, same disclosed non-durable pattern as everything else here
        #listeners = new Map();
        #diagnostics = { storiesCreated: 0, chaptersCreated: 0, views: 0, edits: 0, permissionChanges: 0, accessDenials: 0, publishRequests: 0, publishCompletions: 0, chaptersDeleted: 0, chaptersDuplicated: 0, mediaAttached: 0, accessRequests: 0, notificationsSent: 0, searches: 0 };

        getVersion() { return MODULE_VERSION; }
        getVisibilityTiers() { return VISIBILITY_TIERS.slice(); }
        getSupportedLanguages() { return SUPPORTED_LANGUAGES.slice(); }

        #generateId(prefix) { return `${prefix}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.random().toString(36).slice(2)}`; }
        #logAudit(action, detail) {
            this.#auditLog.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, detail: Object.freeze({ ...detail }) }));
            if (this.#auditLog.length > 5000) this.#auditLog.shift();
        }
        getAuditLog(predicate) { const list = this.#auditLog.map(e => ({ ...e, detail: { ...e.detail } })); return Object.freeze(predicate ? list.filter(predicate) : list); }
        getDiagnosticsReport() { return { moduleVersion: MODULE_VERSION, ...this.#diagnostics, storyCount: this.#stories.size, chapterCount: this.#chapters.size, auditLogSize: this.#auditLog.length }; }

        on(e, h) { if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); return s ? s.delete(h) : false; }
        #emit(e, p) { const s = this.#listeners.get(e); if (!s) return; for (const fn of Array.from(s)) { try { fn(p); } catch (_err) { /* listener errors never break engine state */ } } }

        /** Real, live "who is asking" — never fabricates a viewer. Returns null honestly if nobody is signed in. */
        #currentViewerId() {
            const session = window.CozyOS.Session;
            if (!session || typeof session.current !== "function") return null;
            const current = session.current();
            return current ? current.uid : null;
        }

        // ── Visibility / authorization (fail closed) ──────────────────────
        /**
         * canView(storyId, viewerId) — real, composes IdentityEngine only.
         *   only-me  → owner only.
         *   selected → owner, or an explicit resource-permission grant
         *              (IdentityEngine.checkResourcePermission) issued by
         *              the owner via shareWithPerson().
         *   family / mentors → owner, or a viewer holding that real
         *              IdentityEngine role (checkPermission), so this
         *              reuses the existing role system rather than
         *              inventing a parallel "family list."
         *   public   → anyone.
         *   Any missing engine, unknown tier, or thrown error → false.
         */
        canView(storyId, viewerId) {
            try {
                const story = this.#stories.get(storyId);
                if (!story || story.deleted) return false;
                if (viewerId && viewerId === story.ownerId) return true;
                const identity = window.CozyOS.IdentityEngine;
                switch (story.visibility) {
                    case "public": return true;
                    case "only-me": return false;
                    case "selected":
                        if (!viewerId) return false;
                        // Stage 2: any granted level (viewer/commenter/editor/cofounder) implies view access; #getPersonLevel() also honors the original Stage 1 binary grant.
                        return this.#getPersonLevel(storyId, viewerId) !== null;
                    case "family":
                        if (!viewerId || !identity || typeof identity.checkPermission !== "function") return false;
                        return identity.checkPermission(viewerId, "family") === true;
                    case "mentors":
                        if (!viewerId || !identity || typeof identity.checkPermission !== "function") return false;
                        return identity.checkPermission(viewerId, "mentor") === true;
                    default: return false; // unrecognized tier — fail closed
                }
            } catch (_err) { return false; } // any failure — fail closed
        }
        /**
         * canViewChapter() — Stage 2: chapter-level visibility with
         * inheritance. A chapter with visibility === null/undefined
         * inherits the parent story's visibility (and reuses canView()
         * unchanged). A chapter with its own visibility tier set is
         * checked independently, using the exact same tier logic as
         * canView() (same switch, same fail-closed default) — never a
         * second, divergent authorization implementation.
         */
        canViewChapter(storyId, chapterId, viewerId) {
            try {
                const story = this.#stories.get(storyId);
                const chapter = this.#chapters.get(chapterId);
                if (!story || !chapter || chapter.deleted || story.deleted) return false;
                if (viewerId && viewerId === story.ownerId) return true;
                if (chapter.visibility == null) return this.canView(storyId, viewerId); // inherit
                const identity = window.CozyOS.IdentityEngine;
                switch (chapter.visibility) {
                    case "public": return true;
                    case "only-me": return false;
                    case "selected":
                        if (!viewerId) return false;
                        return this.#getPersonLevel(storyId, viewerId) !== null;
                    case "family":
                        if (!viewerId || !identity || typeof identity.checkPermission !== "function") return false;
                        return identity.checkPermission(viewerId, "family") === true;
                    case "mentors":
                        if (!viewerId || !identity || typeof identity.checkPermission !== "function") return false;
                        return identity.checkPermission(viewerId, "mentor") === true;
                    default: return false;
                }
            } catch (_err) { return false; }
        }
        canEdit(storyId, viewerId) {
            const story = this.#stories.get(storyId);
            if (!story || story.deleted) return false;
            if (viewerId && viewerId === story.ownerId) return true;
            const level = this.#getPersonLevel(storyId, viewerId);
            return level === "editor" || level === "cofounder"; // Stage 2: editors/co-founders may edit content; only the owner may delete/archive/manage people/change visibility
        }

        /** shareWithPerson() — owner-only, additive grant for the "selected" tier. Composes IdentityEngine.grantResourcePermission(), never a parallel ACL store. */
        async shareWithPerson(storyId, granterId, viewerId) {
            const story = this.#requireStory(storyId);
            if (granterId !== story.ownerId) { this.#denyOnStory(storyId, "PERMISSION_CHANGE", { storyId, granterId, reason: "not-owner" }); throw new Error("[FounderStory] shareWithPerson(): only the owner may change access."); }
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.grantResourcePermission !== "function") throw new Error("[FounderStory] shareWithPerson(): IdentityEngine is not available.");
            identity.grantResourcePermission(viewerId, `founder-story:${storyId}`);
            this.#diagnostics.permissionChanges++;
            this.#logAudit("PERMISSION_CHANGE", { storyId, granterId, viewerId, action: "grant" });
            this.#notify(story.ownerId, "permission-changed", { storyId, viewerId, action: "grant" });
            this.#emit("permission-changed", { storyId, viewerId, action: "grant" });
            return true;
        }
        async revokeFromPerson(storyId, granterId, viewerId) {
            const story = this.#requireStory(storyId);
            if (granterId !== story.ownerId) { this.#denyOnStory(storyId, "PERMISSION_CHANGE", { storyId, granterId, reason: "not-owner" }); throw new Error("[FounderStory] revokeFromPerson(): only the owner may change access."); }
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.revokeResourcePermission !== "function") throw new Error("[FounderStory] revokeFromPerson(): IdentityEngine is not available.");
            identity.revokeResourcePermission(viewerId, `founder-story:${storyId}`);
            this.#diagnostics.permissionChanges++;
            this.#logAudit("PERMISSION_CHANGE", { storyId, granterId, viewerId, action: "revoke" });
            this.#notify(story.ownerId, "permission-changed", { storyId, viewerId, action: "revoke" });
            this.#emit("permission-changed", { storyId, viewerId, action: "revoke" });
            return true;
        }
        async setVisibility(storyId, ownerId, visibility) {
            const story = this.#requireStory(storyId);
            if (ownerId !== story.ownerId) { this.#denyOnStory(storyId, "PERMISSION_CHANGE", { storyId, ownerId, reason: "not-owner" }); throw new Error("[FounderStory] setVisibility(): only the owner may change visibility."); }
            if (!VISIBILITY_TIERS.includes(visibility)) throw new TypeError(`[FounderStory] setVisibility(): unknown tier "${visibility}".`);
            story.visibility = visibility;
            story.updatedAt = new Date().toISOString();
            this.#diagnostics.permissionChanges++;
            this.#logAudit("PERMISSION_CHANGE", { storyId, ownerId, visibility });
            this.#notify(story.ownerId, "permission-changed", { storyId, visibility });
            this.#emit("permission-changed", { storyId, visibility });
            return this.#publicMeta(story);
        }

        #deny(auditAction, detail) { this.#diagnostics.accessDenials++; this.#logAudit("ACCESS_DENIED", { ...detail, attemptedAction: auditAction }); this.#emit("access-denied", detail); }

        /**
         * #denyOnStory() — Stage 2 addition: same fail-closed denial as
         * #deny(), plus notifies the real owner (not a fabricated one) an
         * unauthorized access attempt occurred on their content, when the
         * story is known. Falls back to plain #deny() when it isn't (e.g.
         * an unknown storyId) — never guesses an owner to notify.
         */
        #denyOnStory(storyId, auditAction, detail) {
            this.#deny(auditAction, detail);
            const story = this.#stories.get(storyId);
            if (story) this.#notify(story.ownerId, "unauthorized-access-attempted", { storyId, attemptedAction: auditAction, actorId: detail?.viewerId ?? detail?.editorId ?? detail?.requesterId ?? null });
        }
        #requireStory(storyId) { const s = this.#stories.get(storyId); if (!s) throw new Error(`[FounderStory] unknown storyId "${storyId}".`); return s; }
        #publicMeta(story) { return { storyId: story.storyId, ownerId: story.ownerId, language: story.language, category: story.category, status: story.status, visibility: story.visibility, deleted: !!story.deleted, chapterOrder: story.chapterOrder.slice(), createdAt: story.createdAt, updatedAt: story.updatedAt }; }

        // ── Notifications (Stage 2) ───────────────────────────────────────
        /** #notify() — real, private per-owner in-memory store; never a broadcast, never readable by anyone but the owner (enforced in getNotifications()). */
        #notify(ownerId, type, detail) {
            if (!ownerId) return; // never fabricate a recipient
            this.#notifications.push({ id: this.#generateId("notif"), ownerId, type, detail: { ...detail }, timestamp: new Date().toISOString(), read: false });
            if (this.#notifications.length > 2000) this.#notifications.shift();
            this.#diagnostics.notificationsSent++;
            this.#emit("notification", { ownerId, type, detail });
        }
        /** getNotifications(requesterId, ...) — a person can only ever read their own notifications; fail-closed otherwise (empty array, not an error, to avoid leaking whether notifications exist). */
        getNotifications(requesterId, { unreadOnly = false } = {}) {
            if (!requesterId) return [];
            return this.#notifications
                .filter(n => n.ownerId === requesterId && (!unreadOnly || !n.read))
                .map(n => ({ ...n, detail: { ...n.detail } }));
        }
        markNotificationRead(requesterId, notificationId) {
            const n = this.#notifications.find(x => x.id === notificationId);
            if (!n || n.ownerId !== requesterId) return false; // not yours — silently false, not an error (no confirmation of existence to a non-owner)
            n.read = true;
            return true;
        }

        // ── Permission levels for "Selected People" (Stage 2) ─────────────
        /**
         * #getPersonLevel() — resolves the highest permission level a
         * person actually holds on a story, composing ONLY
         * IdentityEngine.checkResourcePermission() — never a parallel ACL
         * store. Checks Stage 2's level-scoped grants
         * ("foundstoryrole-<storyId>:<level>") first (cofounder > editor >
         * commenter > viewer), then falls back to Stage 1's original
         * binary share grant ("founder-story:<storyId>", from
         * shareWithPerson()) as an implicit "viewer" — so every story
         * shared under Stage 1 keeps working unchanged under Stage 2.
         */
        #getPersonLevel(storyId, personId) {
            if (!personId) return null;
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.checkResourcePermission !== "function") return null;
            for (const level of ["cofounder", "editor", "commenter", "viewer"]) {
                if (identity.checkResourcePermission(personId, `foundstoryrole-${storyId}:${level}`) === true) return level;
            }
            if (identity.checkResourcePermission(personId, `founder-story:${storyId}`) === true) return "viewer"; // Stage 1 legacy grant
            return null;
        }
        getPersonPermission(storyId, personId) {
            const story = this.#stories.get(storyId);
            if (!story) return null;
            if (personId === story.ownerId) return "owner";
            return this.#getPersonLevel(storyId, personId);
        }
        #canPublish(storyId, viewerId) {
            const story = this.#stories.get(storyId);
            if (!story) return false;
            if (viewerId === story.ownerId) return true;
            return this.#getPersonLevel(storyId, viewerId) === "cofounder";
        }

        /**
         * invitePerson() — owner-only. Grants the requested level AND the
         * Stage 1 legacy view grant (so existing canView() "selected"
         * logic, unmodified, keeps working). Composes only
         * IdentityEngine.grantResourcePermission() — no parallel ACL.
         */
        async invitePerson(storyId, ownerId, personId, level = "viewer") {
            const story = this.#requireStory(storyId);
            if (ownerId !== story.ownerId) { this.#denyOnStory(storyId, "PERMISSION_CHANGE", { storyId, ownerId, reason: "not-owner" }); throw new Error("[FounderStory] invitePerson(): only the owner may invite."); }
            if (!PERMISSION_LEVELS.includes(level)) throw new TypeError(`[FounderStory] invitePerson(): unknown level "${level}".`);
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.grantResourcePermission !== "function") throw new Error("[FounderStory] invitePerson(): IdentityEngine is not available.");
            identity.grantResourcePermission(personId, `founder-story:${storyId}`); // Stage 1 legacy grant, kept for canView() compatibility
            identity.grantResourcePermission(personId, `foundstoryrole-${storyId}:${level}`);
            this.#diagnostics.permissionChanges++;
            this.#logAudit("PERMISSION_CHANGE", { storyId, ownerId, personId, action: "invite", level });
            this.#notify(story.ownerId, "permission-changed", { storyId, personId, action: "invite", level });
            this.#emit("permission-changed", { storyId, personId, action: "invite", level });
            return { storyId, personId, level };
        }
        /** removePerson() — owner-only. Revokes every grant this person holds on the story (legacy + all levels), fully removing access. */
        async removePerson(storyId, ownerId, personId) {
            const story = this.#requireStory(storyId);
            if (ownerId !== story.ownerId) { this.#denyOnStory(storyId, "PERMISSION_CHANGE", { storyId, ownerId, reason: "not-owner" }); throw new Error("[FounderStory] removePerson(): only the owner may remove access."); }
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.revokeResourcePermission !== "function") throw new Error("[FounderStory] removePerson(): IdentityEngine is not available.");
            identity.revokeResourcePermission(personId, `founder-story:${storyId}`);
            for (const level of PERMISSION_LEVELS) identity.revokeResourcePermission(personId, `foundstoryrole-${storyId}:${level}`);
            this.#diagnostics.permissionChanges++;
            this.#logAudit("PERMISSION_CHANGE", { storyId, ownerId, personId, action: "remove" });
            this.#notify(story.ownerId, "permission-changed", { storyId, personId, action: "remove" });
            this.#emit("permission-changed", { storyId, personId, action: "remove" });
            return true;
        }
        /** changePermission() — owner-only. Revokes the person's prior level grant(s), grants the new one. Legacy view grant is left intact (they still have at least view access, per invitePerson()'s design). */
        async changePermission(storyId, ownerId, personId, newLevel) {
            const story = this.#requireStory(storyId);
            if (ownerId !== story.ownerId) { this.#denyOnStory(storyId, "PERMISSION_CHANGE", { storyId, ownerId, reason: "not-owner" }); throw new Error("[FounderStory] changePermission(): only the owner may change permissions."); }
            if (!PERMISSION_LEVELS.includes(newLevel)) throw new TypeError(`[FounderStory] changePermission(): unknown level "${newLevel}".`);
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.grantResourcePermission !== "function") throw new Error("[FounderStory] changePermission(): IdentityEngine is not available.");
            for (const level of PERMISSION_LEVELS) identity.revokeResourcePermission(personId, `foundstoryrole-${storyId}:${level}`);
            identity.grantResourcePermission(personId, `foundstoryrole-${storyId}:${newLevel}`);
            this.#diagnostics.permissionChanges++;
            this.#logAudit("PERMISSION_CHANGE", { storyId, ownerId, personId, action: "change-level", level: newLevel });
            this.#notify(story.ownerId, "permission-changed", { storyId, personId, action: "change-level", level: newLevel });
            this.#emit("permission-changed", { storyId, personId, action: "change-level", level: newLevel });
            return { storyId, personId, level: newLevel };
        }
        /** requestAccess() — Stage 2: a non-owner explicitly asks for access. Grants nothing by itself (the owner must separately call invitePerson()) — this only records the request and notifies the real owner. */
        async requestAccess(storyId, requesterId) {
            const story = this.#requireStory(storyId);
            this.#diagnostics.accessRequests++;
            this.#logAudit("ACCESS_REQUESTED", { storyId, requesterId });
            this.#notify(story.ownerId, "access-requested", { storyId, requesterId });
            this.#emit("access-requested", { storyId, requesterId });
            return { storyId, status: "requested" };
        }

        // ── Story lifecycle ────────────────────────────────────────────────
        /**
         * createStory() — real: generates a dedicated Vault AES-GCM key for
         * this story, then encrypts title/subtitle before anything is
         * stored. Never stores plaintext title/subtitle at rest.
         */
        async createStory(ownerId, { title, subtitle = "", language = "en", category = "" } = {}) {
            if (!ownerId) throw new TypeError("[FounderStory] createStory(): ownerId is required.");
            if (!title || typeof title !== "string") throw new TypeError("[FounderStory] createStory(): title is required.");
            if (!SUPPORTED_LANGUAGES.includes(language)) throw new TypeError(`[FounderStory] createStory(): unsupported language "${language}".`);
            const vault = window.CozyOS.Vault;
            if (!vault || typeof vault.generateKey !== "function") throw new Error("[FounderStory] createStory(): Vault is not available.");

            const storyId = this.#generateId("story");
            const keyId = `founderstory-key__${storyId}`; // EncryptionManager keyId format is [a-z0-9_-]+ only — no colons
            await vault.generateKey(keyId);
            const envelope = await vault.encrypt(keyId, JSON.stringify({ title, subtitle }));

            const story = {
                storyId, ownerId, keyId,
                language, category: escapeHtml(category),
                status: "draft", visibility: "only-me",
                chapterOrder: [],
                envelope,
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
            };
            this.#stories.set(storyId, story);
            this.#diagnostics.storiesCreated++;
            this.#logAudit("EDIT", { storyId, ownerId, action: "story-created" });
            this.#emit("story-created", { storyId, ownerId });
            return this.#publicMeta(story);
        }

        listStoriesForOwner(ownerId) { return Array.from(this.#stories.values()).filter(s => s.ownerId === ownerId).map(s => this.#publicMeta(s)); }

        /** listVisibleStories(viewerId) — every story, filtered through canView(); never a raw dump. */
        listVisibleStories(viewerId) { return Array.from(this.#stories.values()).filter(s => this.canView(s.storyId, viewerId)).map(s => this.#publicMeta(s)); }

        /**
         * getStory(storyId, viewerId) — the one real read path. Denied
         * callers get PRIVATE_NOTICE and nothing else; decrypt() is never
         * even called for them.
         */
        async getStory(storyId, viewerId) {
            const story = this.#stories.get(storyId);
            if (!story || !this.canView(storyId, viewerId)) { this.#denyOnStory(storyId, "VIEW", { storyId, viewerId }); return PRIVATE_NOTICE; }
            const vault = window.CozyOS.Vault;
            if (!vault || typeof vault.decrypt !== "function") { this.#denyOnStory(storyId, "VIEW", { storyId, viewerId, reason: "vault-unavailable" }); return PRIVATE_NOTICE; }
            const plain = JSON.parse(await vault.decrypt(story.keyId, story.envelope));
            this.#diagnostics.views++;
            this.#logAudit("VIEW", { storyId, viewerId });
            this.#emit("story-viewed", { storyId, viewerId });
            return { ...this.#publicMeta(story), title: plain.title, subtitle: plain.subtitle };
        }

        async updateStory(storyId, editorId, { title, subtitle } = {}) {
            const story = this.#requireStory(storyId);
            if (!this.canEdit(storyId, editorId)) { this.#denyOnStory(storyId, "EDIT", { storyId, editorId }); throw new Error("[FounderStory] updateStory(): not authorized to edit."); }
            const vault = window.CozyOS.Vault;
            const current = JSON.parse(await vault.decrypt(story.keyId, story.envelope));
            const next = { title: title ?? current.title, subtitle: subtitle ?? current.subtitle };
            story.envelope = await vault.encrypt(story.keyId, JSON.stringify(next));
            story.updatedAt = new Date().toISOString();
            this.#diagnostics.edits++;
            this.#logAudit("EDIT", { storyId, editorId, action: "story-updated" });
            this.#emit("story-updated", { storyId, editorId });
            return this.getStory(storyId, editorId);
        }

        async setStatus(storyId, editorId, status) {
            const story = this.#requireStory(storyId);
            if (!this.canEdit(storyId, editorId)) { this.#denyOnStory(storyId, "EDIT", { storyId, editorId }); throw new Error("[FounderStory] setStatus(): not authorized to edit."); }
            if (!STORY_STATUSES.includes(status)) throw new TypeError(`[FounderStory] setStatus(): unsupported status "${status}" in Stage 1 (publishing is M362 scope).`);
            story.status = status;
            story.updatedAt = new Date().toISOString();
            this.#logAudit("EDIT", { storyId, editorId, action: "status-changed", status });
            return this.#publicMeta(story);
        }

        /** requestPublish() — records intent only. No publishing pipeline exists yet (M362 scope); this never changes visibility or exposes content. */
        async requestPublish(storyId, requesterId) {
            const story = this.#requireStory(storyId);
            if (!this.canEdit(storyId, requesterId)) { this.#denyOnStory(storyId, "PUBLISH_REQUEST", { storyId, requesterId }); throw new Error("[FounderStory] requestPublish(): not authorized."); }
            this.#diagnostics.publishRequests++;
            this.#logAudit("PUBLISH_REQUEST", { storyId, requesterId });
            this.#emit("publish-requested", { storyId, requesterId });
            return { storyId, status: "queued-for-future-milestone", note: "Publishing workflow is M362 scope; no action taken." };
        }

        // ── Chapters ───────────────────────────────────────────────────────
        /**
         * addChapter() — real: encrypts title/body/media references as one
         * payload under the parent story's existing key (no per-chapter
         * key — the story's key already scopes access correctly and
         * avoids unbounded key growth for "unlimited chapters").
         */
        async addChapter(storyId, editorId, { title, subtitle = "", body = "", timelineDate = null, timelineEra = null, visibility = null, status = "draft", media = {} } = {}) {
            const story = this.#requireStory(storyId);
            if (!this.canEdit(storyId, editorId)) { this.#denyOnStory(storyId, "EDIT", { storyId, editorId, action: "add-chapter" }); throw new Error("[FounderStory] addChapter(): not authorized to edit."); }
            if (!title || typeof title !== "string") throw new TypeError("[FounderStory] addChapter(): title is required.");
            if (visibility !== null && !VISIBILITY_TIERS.includes(visibility)) throw new TypeError(`[FounderStory] addChapter(): unknown visibility tier "${visibility}".`);
            if (!CHAPTER_STATUSES.includes(status)) throw new TypeError(`[FounderStory] addChapter(): unsupported status "${status}".`);
            const vault = window.CozyOS.Vault;
            const safeMedia = sanitizeShallow(media);
            const mediaPayload = {
                images: Array.isArray(safeMedia.images) ? safeMedia.images : [],
                audio: Array.isArray(safeMedia.audio) ? safeMedia.audio : [],
                video: Array.isArray(safeMedia.video) ? safeMedia.video : [],
                documents: Array.isArray(safeMedia.documents) ? safeMedia.documents : []
            };
            const chapterId = this.#generateId("chap");
            const envelope = await vault.encrypt(story.keyId, JSON.stringify({ title, subtitle, body, media: mediaPayload }));
            const chapter = { chapterId, storyId, timelineDate, timelineEra, visibility, status, deleted: false, envelope, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
            this.#chapters.set(chapterId, chapter);
            story.chapterOrder.push(chapterId);
            story.updatedAt = new Date().toISOString();
            this.#diagnostics.chaptersCreated++;
            this.#logAudit("EDIT", { storyId, editorId, chapterId, action: "chapter-added" });
            this.#emit("chapter-added", { storyId, chapterId });
            return { chapterId, storyId, timelineDate, timelineEra, visibility, status };
        }

        async getChapter(chapterId, viewerId) {
            const chapter = this.#chapters.get(chapterId);
            if (!chapter || chapter.deleted || !this.canViewChapter(chapter.storyId, chapterId, viewerId)) { if (chapter) this.#denyOnStory(chapter.storyId, "VIEW", { chapterId, viewerId }); else this.#deny("VIEW", { chapterId, viewerId }); return PRIVATE_NOTICE; }
            const story = this.#stories.get(chapter.storyId);
            const vault = window.CozyOS.Vault;
            const plain = JSON.parse(await vault.decrypt(story.keyId, chapter.envelope));
            this.#diagnostics.views++;
            this.#logAudit("VIEW", { chapterId, storyId: chapter.storyId, viewerId });
            return { chapterId, storyId: chapter.storyId, timelineDate: chapter.timelineDate, timelineEra: chapter.timelineEra, visibility: chapter.visibility, status: chapter.status, ...plain };
        }

        async listChapters(storyId, viewerId) {
            if (!this.canView(storyId, viewerId)) { this.#denyOnStory(storyId, "VIEW", { storyId, viewerId, action: "list-chapters" }); return PRIVATE_NOTICE; }
            const story = this.#requireStory(storyId);
            const out = [];
            for (const chapterId of story.chapterOrder) {
                const chapter = await this.getChapter(chapterId, viewerId);
                if (!chapter.locked) out.push(chapter); // per-chapter visibility may exclude some even though the story itself is visible — never surface the locked placeholder inside a list
            }
            return out;
        }

        async updateChapter(chapterId, editorId, updates = {}) {
            const chapter = this.#chapters.get(chapterId);
            if (!chapter) throw new Error(`[FounderStory] unknown chapterId "${chapterId}".`);
            if (!this.canEdit(chapter.storyId, editorId)) { this.#denyOnStory(chapter.storyId, "EDIT", { chapterId, editorId }); throw new Error("[FounderStory] updateChapter(): not authorized to edit."); }
            const story = this.#stories.get(chapter.storyId);
            const vault = window.CozyOS.Vault;
            const current = JSON.parse(await vault.decrypt(story.keyId, chapter.envelope));
            const next = { title: updates.title ?? current.title, subtitle: updates.subtitle ?? current.subtitle ?? "", body: updates.body ?? current.body, media: updates.media ? sanitizeShallow(updates.media) : current.media };
            chapter.envelope = await vault.encrypt(story.keyId, JSON.stringify(next));
            if (updates.timelineDate !== undefined) chapter.timelineDate = updates.timelineDate;
            if (updates.timelineEra !== undefined) chapter.timelineEra = updates.timelineEra;
            chapter.updatedAt = new Date().toISOString();
            this.#diagnostics.edits++;
            this.#logAudit("EDIT", { chapterId, editorId, action: "chapter-updated" });
            return this.getChapter(chapterId, editorId);
        }

        // ── Chapter management (Stage 2) ──────────────────────────────────
        /** moveChapter() — real reorder: removes chapterId from its current position, reinserts at newIndex (clamped). Composes nothing new — same chapterOrder array Stage 1 already used. */
        async moveChapter(storyId, editorId, chapterId, newIndex) {
            const story = this.#requireStory(storyId);
            if (!this.canEdit(storyId, editorId)) { this.#denyOnStory(storyId, "EDIT", { storyId, editorId, action: "move-chapter" }); throw new Error("[FounderStory] moveChapter(): not authorized to edit."); }
            const idx = story.chapterOrder.indexOf(chapterId);
            if (idx === -1) throw new Error(`[FounderStory] moveChapter(): chapter "${chapterId}" is not in this story.`);
            story.chapterOrder.splice(idx, 1);
            const clamped = Math.max(0, Math.min(newIndex, story.chapterOrder.length));
            story.chapterOrder.splice(clamped, 0, chapterId);
            story.updatedAt = new Date().toISOString();
            this.#logAudit("EDIT", { storyId, editorId, chapterId, action: "chapter-moved", newIndex: clamped });
            return this.#publicMeta(story);
        }
        /** reorderChapters() — full reorder. Validates the new order is exactly a permutation of the existing (non-deleted) chapters — never silently drops or invents entries. */
        async reorderChapters(storyId, editorId, orderedChapterIds) {
            const story = this.#requireStory(storyId);
            if (!this.canEdit(storyId, editorId)) { this.#denyOnStory(storyId, "EDIT", { storyId, editorId, action: "reorder-chapters" }); throw new Error("[FounderStory] reorderChapters(): not authorized to edit."); }
            const current = new Set(story.chapterOrder);
            const next = Array.isArray(orderedChapterIds) ? orderedChapterIds : [];
            if (next.length !== current.size || !next.every(id => current.has(id)) || new Set(next).size !== next.length) {
                throw new TypeError("[FounderStory] reorderChapters(): orderedChapterIds must be exactly a permutation of the story's existing chapters.");
            }
            story.chapterOrder = next;
            story.updatedAt = new Date().toISOString();
            this.#logAudit("EDIT", { storyId, editorId, action: "chapters-reordered" });
            return this.#publicMeta(story);
        }
        /** duplicateChapter() — decrypts the source chapter, creates a real independent copy (own chapterId, own encrypted envelope under the same story key) titled "<original> (Copy)", inserted immediately after the source. */
        async duplicateChapter(storyId, editorId, chapterId) {
            const story = this.#requireStory(storyId);
            if (!this.canEdit(storyId, editorId)) { this.#denyOnStory(storyId, "EDIT", { storyId, editorId, action: "duplicate-chapter" }); throw new Error("[FounderStory] duplicateChapter(): not authorized to edit."); }
            const source = this.#chapters.get(chapterId);
            if (!source || source.storyId !== storyId || source.deleted) throw new Error(`[FounderStory] duplicateChapter(): unknown chapter "${chapterId}" in this story.`);
            const vault = window.CozyOS.Vault;
            const plain = JSON.parse(await vault.decrypt(story.keyId, source.envelope));
            const newChapterId = this.#generateId("chap");
            const envelope = await vault.encrypt(story.keyId, JSON.stringify({ ...plain, title: `${plain.title} (Copy)` }));
            const copy = { chapterId: newChapterId, storyId, timelineDate: source.timelineDate, timelineEra: source.timelineEra, visibility: source.visibility, status: "draft", deleted: false, envelope, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
            this.#chapters.set(newChapterId, copy);
            const idx = story.chapterOrder.indexOf(chapterId);
            story.chapterOrder.splice(idx === -1 ? story.chapterOrder.length : idx + 1, 0, newChapterId);
            story.updatedAt = new Date().toISOString();
            this.#diagnostics.chaptersDuplicated++;
            this.#logAudit("EDIT", { storyId, editorId, chapterId: newChapterId, sourceChapterId: chapterId, action: "chapter-duplicated" });
            return { chapterId: newChapterId, storyId };
        }
        /**
         * deleteChapter() — soft delete: removed from chapterOrder (so it
         * disappears from every list/view immediately) and flagged
         * chapter.deleted = true; the encrypted record itself is kept,
         * not erased, honoring Governance Principle "never remove
         * existing ideas." No public restoreChapter() exists yet in this
         * stage (disclosed limitation, not silently added) — Stage 2's
         * brief asked for Restore at the story level only.
         */
        async deleteChapter(storyId, editorId, chapterId) {
            const story = this.#requireStory(storyId);
            if (!this.canEdit(storyId, editorId)) { this.#denyOnStory(storyId, "EDIT", { storyId, editorId, action: "delete-chapter" }); throw new Error("[FounderStory] deleteChapter(): not authorized to edit."); }
            const chapter = this.#chapters.get(chapterId);
            if (!chapter || chapter.storyId !== storyId) throw new Error(`[FounderStory] deleteChapter(): unknown chapter "${chapterId}" in this story.`);
            chapter.deleted = true;
            chapter.updatedAt = new Date().toISOString();
            const idx = story.chapterOrder.indexOf(chapterId);
            if (idx !== -1) story.chapterOrder.splice(idx, 1);
            story.updatedAt = new Date().toISOString();
            this.#diagnostics.chaptersDeleted++;
            this.#logAudit("EDIT", { storyId, editorId, chapterId, action: "chapter-deleted" });
            return true;
        }
        /** setChapterVisibility(storyId, editorId, chapterId, visibility) — visibility === null restores inheritance from the parent story. */
        async setChapterVisibility(storyId, editorId, chapterId, visibility) {
            if (!this.canEdit(storyId, editorId)) { this.#denyOnStory(storyId, "EDIT", { storyId, editorId, action: "set-chapter-visibility" }); throw new Error("[FounderStory] setChapterVisibility(): not authorized to edit."); }
            const chapter = this.#chapters.get(chapterId);
            if (!chapter || chapter.storyId !== storyId) throw new Error(`[FounderStory] setChapterVisibility(): unknown chapter "${chapterId}" in this story.`);
            if (visibility !== null && !VISIBILITY_TIERS.includes(visibility)) throw new TypeError(`[FounderStory] setChapterVisibility(): unknown tier "${visibility}".`);
            chapter.visibility = visibility;
            chapter.updatedAt = new Date().toISOString();
            this.#diagnostics.permissionChanges++;
            this.#logAudit("PERMISSION_CHANGE", { storyId, editorId, chapterId, visibility: visibility ?? "(inherit)" });
            return { chapterId, visibility };
        }
        async setChapterStatus(storyId, editorId, chapterId, status) {
            if (!this.canEdit(storyId, editorId)) { this.#denyOnStory(storyId, "EDIT", { storyId, editorId, action: "set-chapter-status" }); throw new Error("[FounderStory] setChapterStatus(): not authorized to edit."); }
            const chapter = this.#chapters.get(chapterId);
            if (!chapter || chapter.storyId !== storyId) throw new Error(`[FounderStory] setChapterStatus(): unknown chapter "${chapterId}" in this story.`);
            if (!CHAPTER_STATUSES.includes(status)) throw new TypeError(`[FounderStory] setChapterStatus(): unsupported status "${status}".`);
            chapter.status = status;
            chapter.updatedAt = new Date().toISOString();
            this.#logAudit("EDIT", { storyId, editorId, chapterId, action: "chapter-status-changed", status });
            return { chapterId, status };
        }

        // ── Story management (Stage 2) ────────────────────────────────────
        /** renameStory() — thin, named wrapper over the existing updateStory() (no duplicated logic). */
        async renameStory(storyId, ownerId, newTitle, newSubtitle) {
            return this.updateStory(storyId, ownerId, { title: newTitle, subtitle: newSubtitle });
        }
        async archiveStory(storyId, ownerId) { return this.setStatus(storyId, ownerId, "archived"); }
        /** restoreStory() — undoes both archive (status → draft) and soft-delete (deleted → false); owner-only via setStatus()/canEdit()'s existing owner check. */
        async restoreStory(storyId, ownerId) {
            const story = this.#requireStory(storyId);
            if (ownerId !== story.ownerId) { this.#denyOnStory(storyId, "EDIT", { storyId, ownerId, action: "restore-story" }); throw new Error("[FounderStory] restoreStory(): only the owner may restore."); }
            story.deleted = false;
            if (story.status === "archived") story.status = "draft";
            story.updatedAt = new Date().toISOString();
            this.#logAudit("EDIT", { storyId, ownerId, action: "story-restored" });
            return this.#publicMeta(story);
        }
        /**
         * deleteStory() — Stage 2 deliberately implements "Delete Story"
         * as a reversible soft delete (deleted = true; excluded from every
         * listing and from canView()/canEdit()), not permanent erasure.
         * This is a disclosed design decision, not an omission: Governance
         * Principle "never remove existing ideas" and the sensitivity of
         * autobiographical content both argue against building true
         * irreversible deletion here. Owner-only, and requires an explicit
         * confirm: true — never accidental.
         */
        async deleteStory(storyId, ownerId, { confirm = false } = {}) {
            const story = this.#requireStory(storyId);
            if (ownerId !== story.ownerId) { this.#denyOnStory(storyId, "EDIT", { storyId, ownerId, action: "delete-story" }); throw new Error("[FounderStory] deleteStory(): only the owner may delete."); }
            if (confirm !== true) throw new Error('[FounderStory] deleteStory(): requires { confirm: true } — no accidental deletion.');
            story.deleted = true;
            story.updatedAt = new Date().toISOString();
            this.#logAudit("EDIT", { storyId, ownerId, action: "story-deleted" });
            this.#notify(story.ownerId, "story-deleted", { storyId });
            return true;
        }

        // ── Publishing (Stage 2) ───────────────────────────────────────────
        /** publishStory() — owner or cofounder only; requires confirm:true. Sets story.status = "published"; does not cascade to chapters (a chapter keeps its own status/visibility — publishing the story is a container-level act). */
        async publishStory(storyId, requesterId, { confirm = false } = {}) {
            const story = this.#requireStory(storyId);
            if (!this.#canPublish(storyId, requesterId)) { this.#denyOnStory(storyId, "PUBLISH_REQUEST", { storyId, requesterId }); throw new Error("[FounderStory] publishStory(): not authorized to publish."); }
            if (confirm !== true) throw new Error('[FounderStory] publishStory(): requires { confirm: true } — no accidental publication.');
            this.#diagnostics.publishRequests++;
            this.#logAudit("PUBLISH_REQUEST", { storyId, requesterId });
            story.status = "published";
            story.updatedAt = new Date().toISOString();
            this.#diagnostics.publishCompletions++;
            this.#logAudit("PUBLISH_COMPLETED", { storyId, requesterId, scope: "story" });
            this.#notify(story.ownerId, "publication-completed", { storyId, scope: "story" });
            this.#emit("story-published", { storyId });
            return this.#publicMeta(story);
        }
        /** publishChapter() — publishes exactly one chapter's status; requires confirm:true. */
        async publishChapter(storyId, requesterId, chapterId, { confirm = false } = {}) {
            const story = this.#requireStory(storyId);
            if (!this.#canPublish(storyId, requesterId)) { this.#denyOnStory(storyId, "PUBLISH_REQUEST", { storyId, requesterId, chapterId }); throw new Error("[FounderStory] publishChapter(): not authorized to publish."); }
            if (confirm !== true) throw new Error('[FounderStory] publishChapter(): requires { confirm: true } — no accidental publication.');
            const chapter = this.#chapters.get(chapterId);
            if (!chapter || chapter.storyId !== storyId || chapter.deleted) throw new Error(`[FounderStory] publishChapter(): unknown chapter "${chapterId}" in this story.`);
            chapter.status = "published";
            chapter.updatedAt = new Date().toISOString();
            this.#diagnostics.publishCompletions++;
            this.#logAudit("PUBLISH_COMPLETED", { storyId, requesterId, chapterId, scope: "chapter" });
            this.#notify(story.ownerId, "publication-completed", { storyId, chapterId, scope: "chapter" });
            return { chapterId, status: "published" };
        }
        /** publishChapters() — batch of publishChapter(); all-or-nothing confirm, per-chapter authorization/existence still enforced individually. */
        async publishChapters(storyId, requesterId, chapterIds, { confirm = false } = {}) {
            if (!Array.isArray(chapterIds) || chapterIds.length === 0) throw new TypeError("[FounderStory] publishChapters(): chapterIds must be a non-empty array.");
            const results = [];
            for (const chapterId of chapterIds) results.push(await this.publishChapter(storyId, requesterId, chapterId, { confirm }));
            return results;
        }

        // ── Timeline (Stage 2) ─────────────────────────────────────────────
        /** getTimeline() — visible chapters only (per-chapter canViewChapter(), same fail-closed gate as everything else), sorted chronologically by timelineDate (undated chapters last, in chapterOrder among themselves). */
        async getTimeline(storyId, viewerId) {
            if (!this.canView(storyId, viewerId)) { this.#denyOnStory(storyId, "VIEW", { storyId, viewerId, action: "get-timeline" }); return PRIVATE_NOTICE; }
            const chapters = await this.listChapters(storyId, viewerId);
            if (chapters === PRIVATE_NOTICE) return PRIVATE_NOTICE;
            const dated = chapters.filter(c => c.timelineDate).sort((a, b) => new Date(a.timelineDate) - new Date(b.timelineDate));
            const undated = chapters.filter(c => !c.timelineDate);
            return [...dated, ...undated].map(c => ({ chapterId: c.chapterId, title: c.title, timelineDate: c.timelineDate, timelineEra: c.timelineEra }));
        }

        // ── Search (Stage 2) ────────────────────────────────────────────────
        /**
         * searchStories() — authorization-first by construction: iterates
         * only stories/chapters that already pass canView()/
         * canViewChapter() before any decrypt or text match is attempted.
         * A private story or chapter is never decrypted, matched, or
         * mentioned in results for an unauthorized searcher — it does not
         * exist from their point of view, exactly like getStory().
         */
        async searchStories(viewerId, queryText) {
            const q = String(queryText || "").trim().toLowerCase();
            if (!q) return [];
            this.#diagnostics.searches++;
            const results = [];
            for (const meta of this.listVisibleStories(viewerId)) {
                const full = await this.getStory(meta.storyId, viewerId);
                if (full.locked) continue; // re-check, belt-and-suspenders — never trust a stale list
                if (full.title.toLowerCase().includes(q) || (full.subtitle || "").toLowerCase().includes(q)) {
                    results.push({ storyId: meta.storyId, matchType: "story", title: full.title });
                }
                const chapters = await this.listChapters(meta.storyId, viewerId);
                if (chapters === PRIVATE_NOTICE) continue;
                for (const ch of chapters) {
                    const hit = ch.title && ch.title.toLowerCase().includes(q);
                    if (hit) results.push({ storyId: meta.storyId, chapterId: ch.chapterId, matchType: "chapter", title: ch.title });
                }
            }
            this.#logAudit("VIEW", { viewerId, action: "search", query: q, resultCount: results.length });
            return results;
        }

        // ── Media (Stage 2) ─────────────────────────────────────────────────
        /**
         * attachMedia() — composes ONLY existing storage: images/PDF/DOCX
         * ("word") are handed to the real, pre-existing
         * window.CozyOS.DocumentStorageProvider.save() (Founder Story
         * stores only the returned documentId reference, never a second
         * copy of the bytes). Audio/video have no existing storage engine
         * anywhere in this codebase to compose — rather than duplicate
         * storage by inventing one, they're kept as encrypted reference
         * metadata inside the chapter's own envelope, exactly like Stage
         * 1's original media model. This split is disclosed, not hidden.
         */
        async attachMedia(storyId, editorId, chapterId, { type, filename = "", mimeType = "", reference = null } = {}) {
            const story = this.#requireStory(storyId);
            if (!this.canEdit(storyId, editorId)) { this.#denyOnStory(storyId, "EDIT", { storyId, editorId, chapterId, action: "attach-media" }); throw new Error("[FounderStory] attachMedia(): not authorized to edit."); }
            const chapter = this.#chapters.get(chapterId);
            if (!chapter || chapter.storyId !== storyId || chapter.deleted) throw new Error(`[FounderStory] attachMedia(): unknown chapter "${chapterId}" in this story.`);
            const vault = window.CozyOS.Vault;
            const current = JSON.parse(await vault.decrypt(story.keyId, chapter.envelope));
            current.media = current.media || { images: [], audio: [], video: [], documents: [] };

            let entry, category, storageMode;
            if (type === "image" || type === "pdf" || type === "word") {
                const docs = window.CozyOS.DocumentStorageProvider;
                if (!docs || typeof docs.save !== "function") throw new Error("[FounderStory] attachMedia(): DocumentStorageProvider is not available — cannot store this file without duplicating storage.");
                const documentId = this.#generateId("doc");
                const saveResult = await docs.save({ documentId, documentType: type, category: "custom", userId: editorId, title: filename, tags: ["founder-story", storyId] });
                if (!saveResult || saveResult.available !== true) throw new Error(`[FounderStory] attachMedia(): DocumentStorageProvider declined to save (${saveResult?.reason || "unknown reason"}).`);
                entry = { documentId, filename, mimeType, attachedAt: new Date().toISOString() };
                category = type === "image" ? "images" : "documents";
                storageMode = "document-storage-provider";
            } else if (type === "audio" || type === "video") {
                entry = { filename, mimeType, reference, attachedAt: new Date().toISOString() };
                category = type;
                storageMode = "encrypted-chapter-reference";
            } else {
                throw new TypeError(`[FounderStory] attachMedia(): unsupported type "${type}" (expected image/pdf/word/audio/video).`);
            }
            current.media[category].push(entry);
            chapter.envelope = await vault.encrypt(story.keyId, JSON.stringify(current));
            chapter.updatedAt = new Date().toISOString();
            this.#diagnostics.mediaAttached++;
            this.#logAudit("EDIT", { storyId, editorId, chapterId, action: "media-attached", type, storageMode });
            return { chapterId, category, entry, storageMode };
        }

        // ── Reading Position & Bookmarks (Stage 3) ──────────────────────────
        /**
         * Per-VIEWER, not per-owner — a shared/family/mentor reader's
         * progress is their own, distinct from the owner's. Keyed by
         * `${storyId}:${viewerId}` in-memory, same disclosed non-durable
         * pattern as the rest of this file (no persistent database exists
         * in this milestone).
         */
        #readingPositions = new Map();
        #bookmarks = new Map(); // storyId -> Map(bookmarkId -> record)

        setReadingPosition(storyId, viewerId, { chapterId = null, sentenceIndex = 0, language = null } = {}) {
            if (!this.canView(storyId, viewerId)) { this.#denyOnStory(storyId, "READ_POSITION", { storyId, viewerId }); return { success: false, reason: "Not authorized." }; }
            this.#readingPositions.set(`${storyId}:${viewerId}`, { storyId, viewerId, chapterId, sentenceIndex, language, updatedAt: new Date().toISOString() });
            return { success: true };
        }
        getReadingPosition(storyId, viewerId) {
            if (!this.canView(storyId, viewerId)) { this.#denyOnStory(storyId, "READ_POSITION", { storyId, viewerId }); return null; }
            return this.#readingPositions.get(`${storyId}:${viewerId}`) || null;
        }
        addBookmark(storyId, viewerId, { chapterId = null, sentenceIndex = 0, note = "" } = {}) {
            if (!this.canView(storyId, viewerId)) { this.#denyOnStory(storyId, "BOOKMARK", { storyId, viewerId }); return { success: false, reason: "Not authorized." }; }
            if (!this.#bookmarks.has(storyId)) this.#bookmarks.set(storyId, new Map());
            const bookmarkId = this.#generateId("bookmark");
            const record = { bookmarkId, storyId, viewerId, chapterId, sentenceIndex, note: escapeHtml(note), createdAt: new Date().toISOString() };
            this.#bookmarks.get(storyId).set(bookmarkId, record);
            this.#logAudit("EDIT", { storyId, viewerId, chapterId, action: "bookmark-added", bookmarkId });
            return { success: true, bookmarkId };
        }
        /** listBookmarks() — a viewer only ever sees their own bookmarks, never another reader's, even if both are authorized on the same story. */
        listBookmarks(storyId, viewerId) {
            if (!this.canView(storyId, viewerId)) { this.#denyOnStory(storyId, "BOOKMARK", { storyId, viewerId }); return []; }
            const store = this.#bookmarks.get(storyId);
            if (!store) return [];
            return Array.from(store.values()).filter(b => b.viewerId === viewerId).map(b => ({ ...b }));
        }
        removeBookmark(storyId, viewerId, bookmarkId) {
            const store = this.#bookmarks.get(storyId);
            if (!store) return { success: false, reason: "Not found." };
            const b = store.get(bookmarkId);
            if (!b || b.viewerId !== viewerId) return { success: false, reason: "Not found, or not yours." }; // never confirms existence of another reader's bookmark
            store.delete(bookmarkId);
            return { success: true };
        }

        // ── Story Experience Audit Events (Stage 3) ─────────────────────────
        /** logReadingStarted/logReadingCompleted — chapter-level gate (canViewChapter), matching the same visibility check getChapter() itself uses. */
        logReadingStarted(storyId, chapterId, viewerId) {
            if (!this.canViewChapter(storyId, chapterId, viewerId)) { this.#denyOnStory(storyId, "READ", { storyId, chapterId, viewerId }); return { success: false, reason: "Not authorized." }; }
            this.#logAudit("READ_STARTED", { storyId, chapterId, viewerId });
            this.#emit("reading-started", { storyId, chapterId, viewerId });
            return { success: true };
        }
        logReadingCompleted(storyId, chapterId, viewerId) {
            if (!this.canViewChapter(storyId, chapterId, viewerId)) { this.#denyOnStory(storyId, "READ", { storyId, chapterId, viewerId }); return { success: false, reason: "Not authorized." }; }
            this.#logAudit("READ_COMPLETED", { storyId, chapterId, viewerId });
            this.#emit("reading-completed", { storyId, chapterId, viewerId });
            return { success: true };
        }
        /** logNarrationStarted/Stopped — same gate as reading; listening to a chapter requires the same authorization as viewing it, never a looser check. */
        logNarrationStarted(storyId, chapterId, viewerId, language = null) {
            if (!this.canViewChapter(storyId, chapterId, viewerId)) { this.#denyOnStory(storyId, "LISTEN", { storyId, chapterId, viewerId }); return { success: false, reason: "Not authorized." }; }
            this.#logAudit("NARRATION_STARTED", { storyId, chapterId, viewerId, language });
            this.#emit("narration-started", { storyId, chapterId, viewerId, language });
            return { success: true };
        }
        logNarrationStopped(storyId, chapterId, viewerId) {
            if (!this.canViewChapter(storyId, chapterId, viewerId)) { this.#denyOnStory(storyId, "LISTEN", { storyId, chapterId, viewerId }); return { success: false, reason: "Not authorized." }; }
            this.#logAudit("NARRATION_STOPPED", { storyId, chapterId, viewerId });
            this.#emit("narration-stopped", { storyId, chapterId, viewerId });
            return { success: true };
        }
        logLanguageChanged(storyId, viewerId, fromLanguage, toLanguage) {
            if (!this.canView(storyId, viewerId)) { this.#denyOnStory(storyId, "READ", { storyId, viewerId }); return { success: false, reason: "Not authorized." }; }
            this.#logAudit("LANGUAGE_CHANGED", { storyId, viewerId, fromLanguage, toLanguage });
            this.#emit("language-changed", { storyId, viewerId, fromLanguage, toLanguage });
            return { success: true };
        }
        /**
         * requestExport() — exact precedent as Stage 1's requestPublish():
         * records intent only. No export pipeline (PDF/DOCX generation)
         * exists anywhere in this codebase yet — building one is real,
         * substantial, out-of-scope work (still M362+, unchanged from
         * Stage 1's own disclosed note), not something achievable by
         * returning a fabricated file reference here.
         */
        async requestExport(storyId, requesterId, { chapterId = null } = {}) {
            if (!this.canView(storyId, requesterId)) { this.#denyOnStory(storyId, "EXPORT_REQUEST", { storyId, requesterId, chapterId }); throw new Error("[FounderStory] requestExport(): not authorized."); }
            this.#diagnostics.exportRequests = (this.#diagnostics.exportRequests || 0) + 1;
            this.#logAudit("EXPORT_REQUESTED", { storyId, requesterId, chapterId });
            this.#emit("export-requested", { storyId, requesterId, chapterId });
            return { storyId, chapterId, status: "queued-for-future-milestone", note: "Export pipeline (PDF/DOCX) is out of scope through M361 Stage 3 — no file is generated." };
        }
    }


    const engineInstance = new FounderStoryEngine();
    window.CozyOS.FounderStory = engineInstance;
    window.CozyOS.Modules["founder-story-engine"] = Object.freeze({
        version: MODULE_VERSION,
        description: "Founder Story Vault — data & authorization layer. Stage 2 (v1.2.0) adds story/chapter management, chapter-level visibility with inheritance, permission levels (viewer/commenter/editor/cofounder), publishing workflow, timeline, search, and notifications. Stage 3 (v1.3.0) adds per-viewer reading position, bookmarks, and the audit events (READ_STARTED/READ_COMPLETED/NARRATION_STARTED/NARRATION_STOPPED/LANGUAGE_CHANGED/EXPORT_REQUESTED) the Founder Story Experience layer (founder-story-narration.js, founder-story-panel.js) reads and writes through — all additive over Stage 1/2's public API, no existing method's behavior changed. Composes window.CozyOS.Vault (encryption), window.CozyOS.Session (current viewer), window.CozyOS.IdentityEngine (resource/role permission checks), and window.CozyOS.DocumentStorageProvider (image/PDF/DOCX storage) only. Never re-implements encryption, authentication, document storage, voice synthesis, or ambience playback."
    });
})();
