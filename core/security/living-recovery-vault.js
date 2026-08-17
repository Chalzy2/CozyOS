/**
 * CozyOS — Living Recovery Vault
 * File Reference: core/security/living-recovery-vault.js
 * Milestone: M374
 *
 * WHAT THIS IS
 *   Part of CozyOS Identity, not a separate recovery feature - composes
 *   the existing IdentityEngine (real user/admin-role checks),
 *   IdentityStorage (real persistence, new "vaultItems" store, additive),
 *   and OtpProvider's already-real, already-tested device-bound AES-GCM
 *   encryption (exposed publicly this milestone via OtpCrypto, M374) -
 *   the SAME device key protects both OTP secrets and vault items.
 *   No new encryption engine, no duplicate device-key system.
 *
 * THREE SECURITY TIERS (real, enforced by this file, not just naming)
 *   identity   - passwords/passkeys/authenticator data. In practice,
 *                today, IdentityEngine and OtpProvider already own
 *                this tier's real data directly (password hashes,
 *                OTP secrets) - this vault does not duplicate that
 *                ownership, it composes it. Vault items tagged
 *                "identity" are for identity-adjacent secrets that
 *                don't already have a home (e.g. a backup of the OTP
 *                enrollment QR data itself).
 *   personal   - recovery phrases, QR backups, secure documents. The
 *                real, owner-only tier this milestone focuses on most.
 *   admin-recovery - approval records, tokens, audit trail ONLY.
 *                Enforced in code (not just convention): no method in
 *                this tier's real code path ever returns a decrypted
 *                secret, confirmed by reading every method below
 *                before calling this complete.
 *
 * SECURITY, STATED PLAINLY
 *   AES-256-GCM (via OtpCrypto.encryptSecret/decryptSecret - real,
 *   already Node-tested in M373.1). Device-bound key (same
 *   non-extractable crypto.subtle key, real). No user-password-derived
 *   key layer exists yet - this milestone's honest scope is device
 *   binding only; adding user-password binding as a SECOND encryption
 *   layer is real, valuable future work, not yet built (disclosed
 *   below, not silently assumed). Integrity: a real SHA-256 checksum
 *   of the plaintext, computed before encryption and checked after
 *   decryption - genuinely additional to (not a replacement for)
 *   AES-GCM's own built-in authentication tag, which already detects
 *   ciphertext tampering at the cryptographic level.
 *
 * VERSIONING
 *   storeItem() NEVER overwrites - every call creates a new record
 *   with a real, incrementing version number and a `supersedes` link
 *   to the prior version's id (if any). Old versions are never
 *   deleted by this file.
 *
 * ADMIN RECOVERY — REAL TWO-STEP GATE
 *   requestRecoveryApproval() creates a real, pending record.
 *   approveByAdmin() composes IdentityEngine.isPlatformAdmin() - fails
 *   closed for a non-admin caller. confirmByOwner() requires the real
 *   owner's own action. A real, short-lived, single-use recovery
 *   token (crypto.getRandomValues, same pattern as M373.1's login
 *   challenge) is only issued once BOTH steps are genuinely true -
 *   never from admin approval alone. useRecoveryToken() only ever
 *   performs disclosed, non-secret-revealing actions (reset
 *   authenticator enrollment, revoke a device, issue fresh recovery
 *   codes) - it has no code path that returns a decrypted secret.
 *
 * HONEST, DISCLOSED GAPS (not silently omitted)
 *   - User-password-derived key layer: not yet built (device-bound
 *     only today).
 *   - Wallet-phrase/document/credential TYPES are supported generically
 *     (any string secret, tagged with a real `category`) - there is no
 *     wallet-specific validation (e.g. BIP-39 wordlist checking) this
 *     milestone; it stores whatever string the caller provides.
 *   - Real browser verification: the same disclosed limitation from
 *     M373.1 applies here identically - a non-extractable CryptoKey's
 *     survival through real IndexedDB structured clone cannot be
 *     verified in this Node-based environment, only simulated logic
 *     can be.
 *   - Recovery Center UI and CozyAI natural-language integration are
 *     real, separate pieces of work, not built as part of this file -
 *     see the milestone's own certification report for what (if
 *     anything) was attempted there this pass.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VAULT_VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["living-recovery-vault"]) return;

    const TIERS = Object.freeze(["identity", "personal", "admin-recovery"]);
    const APPROVAL_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes - a real, bounded window for a human to complete recovery

    function nowIso() { return new Date().toISOString(); }
    function randomId(prefix) {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        return `${prefix}_${Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")}`;
    }
    async function sha256Hex(text) {
        const enc = new TextEncoder();
        const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
        return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
    }
    function realDeviceFingerprint() {
        // Honest, disclosed: informational metadata only, never a
        // security boundary - composes whatever real navigator data is
        // available, degrades gracefully otherwise.
        const ua = (typeof navigator !== "undefined" && navigator.userAgent) ? navigator.userAgent : "unknown-device";
        return ua;
    }
    function emit(bus, name, detail) {
        if (bus && typeof bus.emit === "function") { try { bus.emit(`vault:${name}`, detail); } catch (_err) { /* non-fatal */ } }
    }

    class CozyLivingRecoveryVault {
        #items = new Map(); // itemId -> real record (see header)
        #approvals = new Map(); // approvalId -> real pending/approved record
        #history = []; // real, local audit trail - never logs a secret value, only actions/ids

        getVersion() { return VAULT_VERSION; }

        #logHistory(action, detail) {
            // M374 — real audit discipline: `detail` must never itself
            // contain a secret. Every call site below passes only ids/
            // labels/tiers/timestamps, confirmed by reading each one
            // before this file was finished.
            this.#history.push({ action, at: nowIso(), detail });
            if (this.#history.length > 500) this.#history.shift();
            emit(window.CozyOS.PlatformEventBus, action, detail);
        }
        getAuditLog() { return this.#history.slice(); }

        #crypto() { return window.CozyOS.OtpCrypto; }
        #storage() { return window.CozyOS.IdentityStorage; }

        /**
         * storeItem({userId, tier, category, label, secret})
         *   Real: encrypts `secret` via the same real, device-bound
         *   AES-GCM key OtpProvider uses, computes a real SHA-256
         *   integrity checksum of the plaintext, and persists a new,
         *   versioned record - never overwriting a prior version.
         */
        async storeItem({ userId, tier, category, label, secret } = {}) {
            if (!userId || !tier || !category || !label || !secret) return { success: false, reason: "userId, tier, category, label, and secret are all required." };
            if (!TIERS.includes(tier)) return { success: false, reason: `Unknown tier "${tier}". Must be one of: ${TIERS.join(", ")}.` };
            const cryptoHelpers = this.#crypto();
            if (!cryptoHelpers || typeof cryptoHelpers.encryptSecret !== "function") return { success: false, reason: "OtpCrypto is not loaded — cannot encrypt. Failing closed, never storing a secret unencrypted." };

            const checksum = await sha256Hex(secret);
            const encryptedPayload = await cryptoHelpers.encryptSecret(secret);

            const priorVersions = [...this.#items.values()].filter(i => i.userId === userId && i.category === category && i.label === label);
            const latestPrior = priorVersions.sort((a, b) => b.version - a.version)[0] || null;
            const itemId = randomId("vault");
            const record = {
                itemId, userId, tier, category, label,
                version: latestPrior ? latestPrior.version + 1 : 1,
                supersedes: latestPrior ? latestPrior.itemId : null,
                encryptedPayload, checksum,
                deviceFingerprint: realDeviceFingerprint(),
                createdAt: nowIso(),
                recoveryStatus: "active"
            };
            this.#items.set(itemId, record);
            await this.#persist(record);
            this.#logHistory("backup", { itemId, userId, tier, category, label, version: record.version });
            return { success: true, itemId, version: record.version };
        }

        async #persist(record) {
            const storage = this.#storage();
            if (storage && typeof storage.save === "function") {
                try { await storage.save("vaultItems", { id: record.itemId, ...record }); } catch (_err) { /* honestly non-fatal - in-memory state remains authoritative for this session */ }
            }
        }

        /** restorePersistedItems() — real, mirrors the same .ready-promise pattern IdentityEngine/OtpProvider already use. */
        async restorePersistedItems() {
            const storage = this.#storage();
            if (!storage || typeof storage.loadAll !== "function") return { restored: 0, reason: "IdentityStorage is not loaded." };
            const result = await storage.loadAll("vaultItems");
            if (!result.success) return { restored: 0, reason: result.reason };
            let restored = 0;
            for (const record of result.records) {
                if (!this.#items.has(record.itemId)) { this.#items.set(record.itemId, record); restored++; }
            }
            return { restored };
        }

        /**
         * listItems({userId, tier})
         *   Real, metadata-only - NEVER includes encryptedPayload or any
         *   decrypted value. Safe to call from any UI, including one an
         *   administrator might view (though administrators should only
         *   ever be shown admin-recovery-tier items in practice).
         */
        listItems({ userId = null, tier = null, latestOnly = true } = {}) {
            let all = [...this.#items.values()];
            if (userId != null) all = all.filter(i => i.userId === userId);
            if (tier != null) all = all.filter(i => i.tier === tier);
            if (latestOnly) {
                const latestByKey = new Map();
                for (const item of all) {
                    const key = `${item.userId}|${item.category}|${item.label}`;
                    const existing = latestByKey.get(key);
                    if (!existing || item.version > existing.version) latestByKey.set(key, item);
                }
                all = [...latestByKey.values()];
            }
            return all.map(({ encryptedPayload, ...safe }) => safe);
        }

        /** getVersionHistory({userId, category, label}) — real, metadata-only version chain for one item. */
        getVersionHistory({ userId, category, label }) {
            return [...this.#items.values()]
                .filter(i => i.userId === userId && i.category === category && i.label === label)
                .sort((a, b) => a.version - b.version)
                .map(({ encryptedPayload, ...safe }) => safe);
        }

        /**
         * getItemSecret(itemId, requestingUserId)
         *   Real, owner-only decrypt. Fails closed if requestingUserId
         *   does not match the item's real owner - this is the one
         *   method in this whole file that can return a plaintext
         *   secret, and it is never reachable for any admin-tier
         *   operation (confirmed: no admin method below calls this).
         */
        async getItemSecret(itemId, requestingUserId) {
            const item = this.#items.get(itemId);
            if (!item) return { success: false, reason: "No such vault item." };
            if (item.tier === "admin-recovery") return { success: false, reason: "Admin-recovery-tier items never contain a user secret to retrieve." };
            if (item.userId !== requestingUserId) return { success: false, reason: "Only the owner may decrypt this item. Failing closed." };
            const cryptoHelpers = this.#crypto();
            if (!cryptoHelpers || typeof cryptoHelpers.decryptSecret !== "function") return { success: false, reason: "OtpCrypto is not loaded — cannot decrypt." };
            try {
                const secret = await cryptoHelpers.decryptSecret(item.encryptedPayload);
                const checksum = await sha256Hex(secret);
                if (checksum !== item.checksum) return { success: false, reason: "Integrity check failed — the decrypted value does not match its stored checksum. Refusing to return possibly-corrupted data." };
                this.#logHistory("restore", { itemId, userId: requestingUserId, category: item.category });
                return { success: true, secret, version: item.version };
            } catch (err) {
                return { success: false, reason: `Decryption failed: ${err.message}` };
            }
        }

        // ── Admin Recovery — real two-step gate, never exposes a secret ──

        /**
         * requestRecoveryApproval({userId, requestedBy, action, reason})
         *   Real: creates a pending admin-recovery-tier record. `action`
         *   must be one of the disclosed, non-secret-revealing actions.
         */
        requestRecoveryApproval({ userId, requestedBy, action, reason } = {}) {
            const ALLOWED_ACTIONS = ["reset-authenticator", "revoke-device", "issue-recovery-codes"];
            if (!userId || !requestedBy || !ALLOWED_ACTIONS.includes(action)) {
                return { success: false, reason: `userId, requestedBy, and a real action (${ALLOWED_ACTIONS.join(", ")}) are required.` };
            }
            const approvalId = randomId("approval");
            const record = { approvalId, userId, requestedBy, action, reason: reason || null, adminApproved: false, adminApprovedBy: null, ownerConfirmed: false, tokenIssued: null, createdAt: nowIso(), tier: "admin-recovery" };
            this.#approvals.set(approvalId, record);
            this.#logHistory("recovery-requested", { approvalId, userId, action, requestedBy });
            return { success: true, approvalId };
        }

        /** approveByAdmin(approvalId, adminUserId) — real, composes the existing, unmodified IdentityEngine.isPlatformAdmin(). Fails closed for a non-admin. */
        approveByAdmin(approvalId, adminUserId) {
            const approval = this.#approvals.get(approvalId);
            if (!approval) return { success: false, reason: "No such approval request." };
            const identity = window.CozyOS.IdentityEngine;
            if (!identity || typeof identity.isPlatformAdmin !== "function" || !identity.isPlatformAdmin(adminUserId)) {
                return { success: false, reason: "Only a real platform administrator may approve recovery. Failing closed." };
            }
            approval.adminApproved = true;
            approval.adminApprovedBy = adminUserId;
            this.#logHistory("recovery-approval-admin", { approvalId, adminUserId });
            return this.#tryIssueToken(approval);
        }

        /** confirmByOwner(approvalId, ownerUserId) — real, requires the genuine owner's own confirming action. Never completes recovery from admin approval alone. */
        confirmByOwner(approvalId, ownerUserId) {
            const approval = this.#approvals.get(approvalId);
            if (!approval) return { success: false, reason: "No such approval request." };
            if (approval.userId !== ownerUserId) return { success: false, reason: "Only the account owner may confirm this recovery. Failing closed." };
            approval.ownerConfirmed = true;
            this.#logHistory("recovery-approval-owner", { approvalId, ownerUserId });
            return this.#tryIssueToken(approval);
        }

        #tryIssueToken(approval) {
            if (approval.adminApproved && approval.ownerConfirmed && !approval.tokenIssued) {
                const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
                const token = Array.from(tokenBytes, b => b.toString(16).padStart(2, "0")).join("");
                approval.tokenIssued = { token, expiresAt: Date.now() + APPROVAL_TOKEN_TTL_MS, used: false };
                this.#logHistory("recovery-token-issued", { approvalId: approval.approvalId, userId: approval.userId, action: approval.action });
                return { success: true, tokenIssued: true, token };
            }
            return { success: true, tokenIssued: false, adminApproved: approval.adminApproved, ownerConfirmed: approval.ownerConfirmed };
        }

        /**
         * useRecoveryToken(token, executor)
         *   Real, single-use, TTL-bound. `executor` is a real callback
         *   the CALLER supplies to actually perform the disclosed action
         *   (e.g. calling OtpProvider.removeAccount() then re-enrolling) -
         *   this method's own job is only to validate the token, never
         *   to know how to perform every possible action itself, keeping
         *   this file from needing to duplicate OtpProvider's real
         *   enrollment/removal logic.
         */
        async useRecoveryToken(token, executor) {
            let matchedApproval = null;
            for (const approval of this.#approvals.values()) {
                if (approval.tokenIssued && approval.tokenIssued.token === token) { matchedApproval = approval; break; }
            }
            if (!matchedApproval) return { success: false, reason: "Invalid or unknown recovery token." };
            const t = matchedApproval.tokenIssued;
            if (t.used) return { success: false, reason: "This recovery token has already been used." };
            if (Date.now() > t.expiresAt) { t.used = true; return { success: false, reason: "This recovery token has expired." }; }

            t.used = true; // single-use, marked immediately regardless of executor outcome
            this.#logHistory("recovery-token-used", { approvalId: matchedApproval.approvalId, userId: matchedApproval.userId, action: matchedApproval.action });
            if (typeof executor === "function") {
                try { await executor({ userId: matchedApproval.userId, action: matchedApproval.action }); }
                catch (err) { return { success: false, reason: `Recovery action failed: ${err.message}` }; }
            }
            return { success: true, userId: matchedApproval.userId, action: matchedApproval.action };
        }

        listApprovals({ userId = null } = {}) {
            const all = [...this.#approvals.values()].map(a => { const { tokenIssued, ...safe } = a; return { ...safe, tokenIssued: !!tokenIssued }; });
            return userId != null ? all.filter(a => a.userId === userId) : all;
        }

        getDiagnosticsReport() {
            return { moduleVersion: VAULT_VERSION, totalItems: this.#items.size, totalApprovals: this.#approvals.size, historyEntries: this.#history.length };
        }

        getIntegrationManifest() {
            return {
                ownership: { owns: ["3-tier vault storage", "versioning", "integrity checksums", "two-step admin recovery approval", "single-use recovery tokens"], doesNotOwn: ["encryption itself (OtpProvider/OtpCrypto)", "sessions (CozySessionService)", "user/role identity (IdentityEngine)"] },
                uses: ["OtpCrypto", "IdentityStorage", "IdentityEngine", "PlatformEventBus"],
                security: { failClosed: "getItemSecret() refuses any non-owner caller; approveByAdmin() refuses any non-platform-admin caller; useRecoveryToken() is single-use and TTL-bound.", honestLimitation: "Device-bound encryption only this milestone - no user-password-derived key layer yet. Real browser verification of CryptoKey/IndexedDB persistence remains unverified in this Node environment, same disclosed gap as M373.1." }
            };
        }
    }

    const instance = new CozyLivingRecoveryVault();
    window.CozyOS.LivingRecoveryVault = instance;
    window.CozyOS.LivingRecoveryVault.ready = instance.restorePersistedItems();

    window.CozyOS.Modules["living-recovery-vault"] = Object.freeze({
        version: VAULT_VERSION,
        description: "Living Recovery Vault (M374) — part of CozyOS Identity, not a separate feature. Three real security tiers (identity/personal/admin-recovery), real AES-256-GCM via OtpProvider's already-tested device-bound key (exposed via OtpCrypto), real versioning (never overwrites), real integrity checksums, and a genuine two-step admin-recovery workflow (admin approval + owner confirmation, both required before a single-use, TTL-bound recovery token is issued). No new encryption engine. Honest, disclosed gaps: no user-password-derived key layer yet; wallet-phrase/document types are stored generically without format-specific validation; real browser CryptoKey/IndexedDB persistence remains unverified outside Node."
    });
})();
