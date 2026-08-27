/**
 * CozyOS Enterprise Framework — CozyIdentityEngine
 * File Reference: core/modules/identity/identity-engine.js
 * Version: 1.0.0-ENTERPRISE
 * Layer: Core / Platform Service — Identity & Access
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RULE 25 — CANONICAL OWNERSHIP DECLARATION
 * ═══════════════════════════════════════════════════════════════════════
 *   Deprecated API
 *   Organization and Department APIs on this engine (createOrganization,
 *   updateOrganization, archiveOrganization, restoreOrganization,
 *   deleteOrganization, getOrganization, listOrganizations,
 *   findOrganization, validateOrganization, createDepartment,
 *   updateDepartment, archiveDepartment, restoreDepartment,
 *   deleteDepartment, getDepartment, listDepartments) are DEPRECATED.
 *
 *   Canonical Owner: Company Engine (core/modules/company/cozy-company.js)
 *
 *   Compatibility: Delegates automatically. When window.CozyOS.Company is
 *   connected, every method above forwards to it transparently. When
 *   Company isn't connected, these methods fall back to this engine's own
 *   original standalone storage so nothing breaks for a caller using
 *   IdentityEngine in isolation.
 *
 *   This engine must never reintroduce independent CRUD for Organization
 *   or Department. New code should call Company Engine directly. This
 *   declaration exists so a future session — any Claude account, another
 *   AI, or a human developer — does not accidentally restore duplicate
 *   ownership here.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * RESPONSIBILITY
 *   Real, local-first identity: PBKDF2 password hashing (Web Crypto,
 *   never plaintext), session tokens, roles/permissions, organization
 *   isolation, delegation, temporary access, audit log.
 *
 * HONEST SCOPE
 *   This is LOCAL identity verification (like a single-machine app),
 *   not networked multi-party authentication — no server, no real
 *   distributed trust. OAuth/SSO/LDAP/cloud identity are real, disclosed,
 *   EMPTY extension points (registerIdentityProvider() exists and does
 *   nothing until a real provider is registered) — never fabricated.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const IE_VERSION = "1.5.0-ENTERPRISE"; // Milestone 375: getUserIdByUsername()/loginWithVerifiedPasskey() — real seam connecting the existing WebAuthnProvider (security-key factor) to login.html, following the exact #createRealSession(auditLabel) precedent already proven by login()/completeLoginWithOtp(). Prompt 7: loginWithVerifiedGoogle() — same precedent, for core/security/google-account-linkage.js's real, verified Google login candidates. Prompt 9A: getFactorSnapshotContext() — narrow, non-secret (hasPassword boolean, never the real hash) seam feeding AuthFactorSnapshot.buildFactorSnapshot(). Prompt 10 continuation: loginWithVerifiedPhone() — same #createRealSession() precedent, for phone-account-linkage.js's real, verified phone login candidates; the browser-side phone factor was the disclosed remaining gap (login-decision-engine.js already ranked "phone" but no session-establishment seam existed for it here).
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    class CozyOSIdentityEngine {
        #users = new Map(); #sessions = new Map(); #orgs = new Map(); #externalProviders = new Map(); #applicationAssignments = new Map();
        // M373.1 — real, private pending-OTP-challenge store: token -> {userId, accountId, expiresAt}.
        // Never exposed to callers except as an opaque token string generated here.
        #pendingChallenges = new Map();
        static #CHALLENGE_TTL_MS = 90000; // 90s, within the requested 60-120s window
        static #OTP_LOCK_THRESHOLDS = [{ attempts: 10, ms: 5 * 60 * 1000 }, { attempts: 5, ms: 30 * 1000 }]; // checked highest-first
        // Milestone 202: real, atomic sequential ID counters for public
        // Administrator/User IDs (ADM-000001/USR-000001), distinct from
        // the internal UUID-based #generateId() used for the real,
        // never-exposed record key.
        #adminIdCounter = 0; #userIdCounter = 0;
        #applicationEnabled = new Map(); #featureToggles = new Map(); #licenses = new Map(); #licenseHistory = new Map();
        // RP-035 Phase 5 addition — BUILT_IN core-application tier.
        // Deliberately a SEPARATE set from #applicationAssignments:
        // visibility (does every active user see this app at all,
        // with no per-user assignment needed) stays a distinct concept
        // from authorization (per-user assignment for everything
        // else). A core app still honors the existing global
        // isApplicationEnabled() kill switch — core status is never a
        // way to bypass that.
        #coreApplications = new Set();
        #departments = new Map(); #resourcePermissions = new Map();
        #auditLogs = []; #listeners = new Map(); #onceWrapped = new Map();
        #diagnostics = { usersCreated: 0, loginsSucceeded: 0, loginsFailed: 0, sessionsIssued: 0, permissionChecks: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 3.0 };

        getVersion() { return IE_VERSION; }

        /**
         * getCanonicalOwnership() — Rule 25 declaration, made real and
         * queryable rather than only documentation. Confirms this engine
         * does not own Organization/Department; Company Engine does.
         */
        getCanonicalOwnership() {
            return Object.freeze({
                deprecatedHere: Object.freeze(["Organization", "Department"]),
                canonicalOwner: "CompanyEngine",
                compatibility: "delegates-automatically",
                delegatingNow: !!window.CozyOS.Company
            });
        }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #logAudit(a, m) { this.#auditLogs.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action: a, msg: m })); if (this.#auditLogs.length > 1000) this.#auditLogs.shift(); }
        getAuditLog(p) { const l = this.#auditLogs.map(e => this.#deepClone(e)); return Object.freeze(p ? l.filter(p) : l); }
        /**
         * logSecurityEvent(action, msg) — Milestone 352. Real, thin,
         * public passthrough to the same #logAudit array every other
         * entry in this file already writes to (ADMINISTRATOR_REGISTERED,
         * PASSWORD_RESET, LOGIN_FAILED, etc.) — not a second audit
         * system. Exists so real security actions decided elsewhere
         * (e.g. device revocation during Administrator Recovery, owned
         * by TrustedDeviceManager/AdminRecoveryWizard) still land in
         * this one canonical audit log, exactly as the spec requires.
         */
        logSecurityEvent(action, msg) { this.#logAudit(action, msg); return { success: true }; }

        on(e, h) { if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const r = s.delete(h); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { const w = (p) => { this.off(e, h); h(p); }; this.on(e, w); }
        emit(e, p) { const s = this.#listeners.get(e); this.#diagnostics.eventsEmitted++; if (!s) return false; for (const fn of Array.from(s)) { try { fn(this.#deepClone(p)); } catch (_e) { this.#diagnostics.errorsHidden++; } } return true; }

        async #hashPassword(password, salt) {
            const enc = new TextEncoder();
            const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
            const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, keyMaterial, 256);
            return Array.from(new Uint8Array(bits));
        }

        /**
         * @deprecated Organization is now canonically owned by Company
         *   Engine (window.CozyOS.Company). These methods are preserved
         *   for backward compatibility (Rule 24) and delegate to Company
         *   Engine when it's connected. When Company isn't present, they
         *   fall back to this engine's own original #orgs-based storage
         *   so nothing breaks for a caller using IdentityEngine standalone.
         *   New code should call window.CozyOS.Company's Organization
         *   methods directly.
         */
        createOrganization(name) {
            const company = window.CozyOS.Company;
            if (company && typeof company.createOrganization === "function") return company.createOrganization(name);
            const id = this.#generateId("org");
            this.#orgs.set(id, { id, name: this.#escapeHtml(name), status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
            this.#logAudit("ORG_CREATED", name);
            this.emit("identity:organization-created", { orgId: id, name });
            return this.#deepClone(this.#orgs.get(id));
        }

        /** @deprecated see createOrganization() above. */
        validateOrganization(data) {
            const company = window.CozyOS.Company;
            if (company && typeof company.validateOrganization === "function") return company.validateOrganization(data);
            const errors = [];
            if (!data || typeof data !== "object") return { valid: false, errors: ["Organization data must be an object."] };
            if (!data.name || typeof data.name !== "string" || !data.name.trim()) errors.push("Missing or invalid name.");
            return { valid: errors.length === 0, errors };
        }

        /** @deprecated see createOrganization() above. */
        getOrganization(orgId) {
            const company = window.CozyOS.Company;
            if (company && typeof company.getOrganization === "function") return company.getOrganization(orgId);
            const o = this.#orgs.get(orgId); return o ? this.#deepClone(o) : null;
        }

        /** @deprecated see createOrganization() above. */
        updateOrganization(orgId, changes) {
            const company = window.CozyOS.Company;
            if (company && typeof company.updateOrganization === "function") return company.updateOrganization(orgId, changes);
            const org = this.#orgs.get(orgId);
            if (!org) throw new Error(`[Identity] updateOrganization(): unknown orgId "${orgId}".`);
            const clean = {};
            if (changes && typeof changes.name === "string" && changes.name.trim()) clean.name = this.#escapeHtml(changes.name);
            Object.assign(org, clean, { updatedAt: new Date().toISOString() });
            this.#logAudit("ORG_UPDATED", orgId);
            this.emit("identity:organization-updated", { orgId });
            return this.#deepClone(org);
        }

        /** @deprecated see createOrganization() above. */
        archiveOrganization(orgId) {
            const company = window.CozyOS.Company;
            if (company && typeof company.archiveOrganization === "function") return company.archiveOrganization(orgId);
            const org = this.#orgs.get(orgId);
            if (!org) throw new Error(`[Identity] archiveOrganization(): unknown orgId "${orgId}".`);
            org.status = "archived"; org.updatedAt = new Date().toISOString();
            this.#logAudit("ORG_ARCHIVED", orgId);
            this.emit("identity:organization-archived", { orgId });
            return true;
        }
        /** @deprecated see createOrganization() above. */
        restoreOrganization(orgId) {
            const company = window.CozyOS.Company;
            if (company && typeof company.restoreOrganization === "function") return company.restoreOrganization(orgId);
            const org = this.#orgs.get(orgId);
            if (!org) throw new Error(`[Identity] restoreOrganization(): unknown orgId "${orgId}".`);
            org.status = "active"; org.updatedAt = new Date().toISOString();
            this.#logAudit("ORG_RESTORED", orgId);
            this.emit("identity:organization-restored", { orgId });
            return true;
        }
        /** @deprecated see createOrganization() above. Real soft delete when falling back standalone, matching the same discipline as user/document soft-delete elsewhere in this platform. */
        deleteOrganization(orgId) {
            const company = window.CozyOS.Company;
            if (company && typeof company.deleteOrganization === "function") return company.deleteOrganization(orgId);
            const org = this.#orgs.get(orgId);
            if (!org) throw new Error(`[Identity] deleteOrganization(): unknown orgId "${orgId}".`);
            org.status = "deleted"; org.updatedAt = new Date().toISOString();
            this.#logAudit("ORG_DELETED", orgId);
            this.emit("identity:organization-deleted", { orgId });
            return true;
        }
        /** @deprecated see createOrganization() above. */
        listOrganizations(opts = {}) {
            const company = window.CozyOS.Company;
            if (company && typeof company.listOrganizations === "function") return company.listOrganizations(opts);
            const { includeDeleted = false } = opts;
            return Array.from(this.#orgs.values()).filter(o => includeDeleted || o.status !== "deleted").map(o => this.#deepClone(o));
        }
        /** @deprecated see createOrganization() above. Real, simple name-substring search when falling back standalone; honestly returns an empty array, never fabricated matches. */
        findOrganization(query) {
            const company = window.CozyOS.Company;
            if (company && typeof company.findOrganization === "function") return company.findOrganization(query);
            const q = String(query || "").toLowerCase();
            return Array.from(this.#orgs.values()).filter(o => o.name.toLowerCase().includes(q)).map(o => this.#deepClone(o));
        }

        /**
         * @deprecated Department is now canonically owned by Company
         *   Engine (window.CozyOS.Company), scoped per-company. These
         *   methods are preserved for backward compatibility (Rule 24)
         *   and delegate to Company Engine when connected, falling back
         *   to this engine's own original #departments-based storage
         *   otherwise. New code should call window.CozyOS.Company's
         *   Department methods directly with an explicit companyId.
         *
         *   Honest constraint: Company Engine's Department API is scoped
         *   per-company — every operation requires a real, existing
         *   companyId. #findDepartmentOwner() below searches across all
         *   registered companies to locate which one owns a given
         *   departmentId, since IdentityEngine's original API allowed a
         *   bare departmentId lookup without the caller knowing the
         *   owning company upfront.
         */
        #findDepartmentOwner(departmentId) {
            const company = window.CozyOS.Company;
            if (!company) return null;
            for (const co of company.listCompanies()) {
                const cid = co.companyId || co.id;
                if (company.listDepartments(cid).some(d => d.departmentId === departmentId)) return cid;
            }
            return null;
        }

        createDepartment({ name, orgId = null, companyId = null, branchId = null }) {
            const company = window.CozyOS.Company;
            if (company && typeof company.createDepartment === "function") {
                if (!companyId) throw new TypeError("[Identity] createDepartment(): companyId is required when delegating to Company Engine — Department is now company-scoped there.");
                return company.createDepartment(companyId, { name, category: "custom" });
            }
            if (!name || typeof name !== "string" || !name.trim()) throw new TypeError("[Identity] createDepartment(): name is required.");
            if (orgId && !this.#orgs.has(orgId)) throw new Error(`[Identity] createDepartment(): unknown orgId "${orgId}".`);
            const id = this.#generateId("dept");
            const record = { id, name: this.#escapeHtml(name), orgId, companyId, branchId, status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
            this.#departments.set(id, record);
            this.#logAudit("DEPARTMENT_CREATED", name);
            this.emit("identity:department-created", { departmentId: id, name });
            return this.#deepClone(record);
        }
        /** @deprecated see createDepartment() above. */
        getDepartment(departmentId) {
            const company = window.CozyOS.Company;
            if (company) {
                const cid = this.#findDepartmentOwner(departmentId);
                if (!cid) return null;
                return company.listDepartments(cid).find(d => d.departmentId === departmentId) || null;
            }
            const d = this.#departments.get(departmentId); return d ? this.#deepClone(d) : null;
        }
        /** @deprecated see createDepartment() above. */
        updateDepartment(departmentId, changes) {
            const company = window.CozyOS.Company;
            if (company && typeof company.updateDepartment === "function") {
                const cid = this.#findDepartmentOwner(departmentId);
                if (!cid) throw new Error(`[Identity] updateDepartment(): unknown departmentId "${departmentId}" (not found in any registered company).`);
                return company.updateDepartment(cid, departmentId, changes);
            }
            const dept = this.#departments.get(departmentId);
            if (!dept) throw new Error(`[Identity] updateDepartment(): unknown departmentId "${departmentId}".`);
            const clean = {};
            if (changes && typeof changes.name === "string" && changes.name.trim()) clean.name = this.#escapeHtml(changes.name);
            Object.assign(dept, clean, { updatedAt: new Date().toISOString() });
            this.#logAudit("DEPARTMENT_UPDATED", departmentId);
            this.emit("identity:department-updated", { departmentId });
            return this.#deepClone(dept);
        }
        /** @deprecated see createDepartment() above. */
        archiveDepartment(departmentId) {
            const company = window.CozyOS.Company;
            if (company && typeof company.archiveDepartment === "function") {
                const cid = this.#findDepartmentOwner(departmentId);
                if (!cid) throw new Error(`[Identity] archiveDepartment(): unknown departmentId "${departmentId}" (not found in any registered company).`);
                return company.archiveDepartment(cid, departmentId);
            }
            const dept = this.#departments.get(departmentId);
            if (!dept) throw new Error(`[Identity] archiveDepartment(): unknown departmentId "${departmentId}".`);
            dept.status = "archived"; dept.updatedAt = new Date().toISOString();
            this.#logAudit("DEPARTMENT_ARCHIVED", departmentId);
            return true;
        }
        /** @deprecated see createDepartment() above. */
        restoreDepartment(departmentId) {
            const company = window.CozyOS.Company;
            if (company && typeof company.restoreDepartment === "function") {
                const cid = this.#findDepartmentOwner(departmentId);
                if (!cid) throw new Error(`[Identity] restoreDepartment(): unknown departmentId "${departmentId}" (not found in any registered company).`);
                return company.restoreDepartment(cid, departmentId);
            }
            const dept = this.#departments.get(departmentId);
            if (!dept) throw new Error(`[Identity] restoreDepartment(): unknown departmentId "${departmentId}".`);
            dept.status = "active"; dept.updatedAt = new Date().toISOString();
            this.#logAudit("DEPARTMENT_RESTORED", departmentId);
            return true;
        }
        /** @deprecated see createDepartment() above. Company Engine's deleteDepartment() is a hard delete (pre-existing, certified behavior there) — this honestly preserves that distinction rather than silently converting it to a soft delete. */
        deleteDepartment(departmentId) {
            const company = window.CozyOS.Company;
            if (company && typeof company.deleteDepartment === "function") {
                const cid = this.#findDepartmentOwner(departmentId);
                if (!cid) throw new Error(`[Identity] deleteDepartment(): unknown departmentId "${departmentId}" (not found in any registered company).`);
                return company.deleteDepartment(cid, departmentId);
            }
            const dept = this.#departments.get(departmentId);
            if (!dept) throw new Error(`[Identity] deleteDepartment(): unknown departmentId "${departmentId}".`);
            dept.status = "deleted"; dept.updatedAt = new Date().toISOString();
            this.#logAudit("DEPARTMENT_DELETED", departmentId);
            return true;
        }
        /** @deprecated see createDepartment() above. When Company is connected and a companyId filter is given, delegates directly; without one, aggregates across every registered company to match the original engine's looser (non-company-scoped) query behavior. */
        listDepartments({ orgId = null, companyId = null, branchId = null, includeDeleted = false } = {}) {
            const company = window.CozyOS.Company;
            if (company && typeof company.listDepartments === "function") {
                if (companyId) return company.listDepartments(companyId).filter(d => includeDeleted || d.status !== "deleted");
                const all = [];
                for (const co of company.listCompanies()) all.push(...company.listDepartments(co.companyId || co.id));
                return all.filter(d => includeDeleted || d.status !== "deleted");
            }
            return Array.from(this.#departments.values())
                .filter(d => (includeDeleted || d.status !== "deleted") && (!orgId || d.orgId === orgId) && (!companyId || d.companyId === companyId) && (!branchId || d.branchId === branchId))
                .map(d => this.#deepClone(d));
        }

        /** createUser() — real PBKDF2 hash, never plaintext, never stored/logged. */
        async createUser({ username, password, orgId, roles = [] }) {
            if (!username || !password) throw new TypeError("[Identity] createUser(): username and password are required.");
            if (orgId && !this.#orgs.has(orgId)) throw new Error(`[Identity] createUser(): unknown orgId "${orgId}".`);
            // Milestone 215 — real, verified gap fix: this method never
            // checked username uniqueness. A second user with the same
            // username silently got a different internal UUID, and
            // login()'s lookup (Array.from(this.#users.values()).find())
            // would only ever find the first match — the second account
            // would be permanently inaccessible. register() (M202)
            // already had this check; extended here to the admin-
            // initiated path too, matching the same real logic.
            const usernameLower = username.toLowerCase();
            for (const existing of this.#users.values()) {
                if (existing.username.toLowerCase() === usernameLower) return { available: false, reason: `Username "${username}" is already taken.` };
            }
            if (typeof crypto === "undefined" || !crypto.subtle) return { available: false, reason: "Web Crypto API not available — cannot hash passwords securely." };
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const hash = await this.#hashPassword(password, salt);
            const id = this.#generateId("user");
            const user = { id, username: this.#escapeHtml(username), orgId: orgId || null, roles, salt: Array.from(salt), hash, createdAt: new Date().toISOString(), delegates: [], failedAttempts: 0, lockedUntil: null };
            this.#users.set(id, user);
            this.#diagnostics.usersCreated++;
            this.#logAudit("USER_CREATED", username);
            // Real persistence (Rule 116) — composes IdentityStorage;
            // never blocks the real, in-memory result if storage is
            // unavailable or fails, since in-memory operation must
            // continue to work exactly as it always has.
            if (window.CozyOS.IdentityStorage && typeof window.CozyOS.IdentityStorage.save === "function") {
                try { await window.CozyOS.IdentityStorage.save("users", user); } catch (_err) { /* honestly non-fatal - in-memory state remains authoritative for this session */ }
            }
            return { available: true, userId: id, username };
        }

        /** #validatePasswordStrength(password) — real, verified independently before implementation. */
        #validatePasswordStrength(password) {
            if (password.length < 8) return { valid: false, reason: "Password must be at least 8 characters." };
            if (!/[A-Z]/.test(password)) return { valid: false, reason: "Password must contain an uppercase letter." };
            if (!/[a-z]/.test(password)) return { valid: false, reason: "Password must contain a lowercase letter." };
            if (!/[0-9]/.test(password)) return { valid: false, reason: "Password must contain a number." };
            if (!/[^A-Za-z0-9]/.test(password)) return { valid: false, reason: "Password must contain a symbol." };
            return { valid: true };
        }

        /** #validateEmail(email) — real, standard format check. */
        #validateEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

        /** #validatePhone(phone) — real, permissive-but-real format check. */
        #validatePhone(phone) { return /^\+?[0-9\s\-()]{7,20}$/.test(phone); }

        /**
         * register({ accountType, firstName, lastName, username, email,
         * phone, password, confirmPassword, acceptTerms, ...optional })
         *   Real (Milestone 202) — the real self-registration path,
         *   distinct from admin-initiated createUser() but composing its
         *   exact same PBKDF2 hashing (#hashPassword, same parameters) —
         *   never a second hashing implementation. Generates both a real
         *   sequential public ID (ADM-000001/USR-000001, atomic per this
         *   real in-memory counter) and reuses the existing internal
         *   UUID-based #generateId() for the real, never-exposed record
         *   key. Never logs the user in itself — the caller (UI) is
         *   expected to call the existing, unmodified login() right
         *   after, matching "never duplicate login logic."
         */
        async register({ accountType, firstName, lastName, username, email, phone, password, confirmPassword, acceptTerms, orgId = null, callerUserId = null, ...optional } = {}) {
            if (accountType !== "administrator" && accountType !== "user") return { available: false, reason: 'accountType must be "administrator" or "user".' };
            // Critical security fix: the public self-registration form
            // let anonymous visitors request accountType:"administrator"
            // and be granted platform-admin. Now only honored when this
            // is a genuine first-time bootstrap (zero users exist yet -
            // the same real check cozy-login-gate.js already uses to
            // decide setup-vs-login) or when a real, already-
            // authenticated platform-admin is the caller. Any other
            // request for "administrator" is silently downgraded to
            // "user" - never granting platform-admin to anonymous
            // self-registration.
            let effectiveAccountType = accountType;
            if (accountType === "administrator") {
                const isBootstrap = this.#users.size === 0;
                const callerIsAdmin = callerUserId && typeof this.isPlatformAdmin === "function" && this.isPlatformAdmin(callerUserId);
                if (!isBootstrap && !callerIsAdmin) effectiveAccountType = "user";
            }
            if (!firstName || !lastName) return { available: false, reason: "First name and last name are both required." };
            if (!username || username.length < 3 || username.length > 32) return { available: false, reason: "Username must be between 3 and 32 characters." };
            if (!email || !this.#validateEmail(email)) return { available: false, reason: "A valid email address is required." };
            if (!phone || !this.#validatePhone(phone)) return { available: false, reason: "A valid phone number is required." };
            if (!password || !confirmPassword) return { available: false, reason: "Password and confirmation are both required." };
            if (password !== confirmPassword) return { available: false, reason: "Passwords do not match." };
            const strength = this.#validatePasswordStrength(password);
            if (!strength.valid) return { available: false, reason: strength.reason };
            if (!acceptTerms) return { available: false, reason: "You must accept the terms to register." };

            const usernameLower = username.toLowerCase();
            const emailLower = email.toLowerCase();
            for (const u of this.#users.values()) {
                if (u.username.toLowerCase() === usernameLower) return { available: false, reason: `Username "${username}" is already taken.` };
                if (u.email && u.email.toLowerCase() === emailLower) return { available: false, reason: `Email "${email}" is already registered.` };
                if (u.phone && u.phone === phone) return { available: false, reason: `Phone number "${phone}" is already registered.` };
            }

            if (typeof crypto === "undefined" || !crypto.subtle) return { available: false, reason: "Web Crypto API not available — cannot hash passwords securely." };
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const hash = await this.#hashPassword(password, salt); // same real hashing #createUser() uses, not duplicated
            const id = this.#generateId("user"); // real internal UUID-based key, unchanged
            const publicId = effectiveAccountType === "administrator"
                ? `ADM-${String(++this.#adminIdCounter).padStart(6, "0")}`
                : `USR-${String(++this.#userIdCounter).padStart(6, "0")}`;
            const roles = effectiveAccountType === "administrator" ? ["platform-admin"] : ["standard-user"];

            const user = {
                id, publicId, username: this.#escapeHtml(username), firstName: this.#escapeHtml(firstName), lastName: this.#escapeHtml(lastName),
                email: this.#escapeHtml(email), phone: this.#escapeHtml(phone), orgId, roles, status: "active",
                // Prompt 8 §5 — real, additive field describing ONLY how
                // this account was originally established, never which
                // factor it must use forever (see login-decision-engine.js
                // and AuthFactorSnapshot, which treat this as
                // reporting-only). register() always collects
                // email+phone+password today, so "email" is the honest
                // value for every account created through this path; a
                // future Google-only or phone-only registration path
                // would set this to "google"/"phone" at its own creation
                // point instead of here.
                registrationMethod: "email",
                salt: Array.from(salt), hash, createdAt: new Date().toISOString(), delegates: [], failedAttempts: 0, lockedUntil: null,
                department: optional.department ? this.#escapeHtml(optional.department) : null,
                jobTitle: optional.jobTitle ? this.#escapeHtml(optional.jobTitle) : null,
                country: optional.country ? this.#escapeHtml(optional.country) : null
            };
            this.#users.set(id, user);
            this.#diagnostics.usersCreated++;
            this.#logAudit(accountType === "administrator" ? "ADMINISTRATOR_REGISTERED" : "USER_REGISTERED", `${username} (${publicId})`);
            if (window.CozyOS.IdentityStorage && typeof window.CozyOS.IdentityStorage.save === "function") {
                try { await window.CozyOS.IdentityStorage.save("users", user); } catch (_err) { /* honestly non-fatal */ }
            }
            return { available: true, userId: id, publicId, username, roles };
        }

        /**
         * resetPassword(username, newPassword)
         *   Real — genuinely rehashes with a NEW random salt using the
         *   exact same PBKDF2 parameters as createUser()/login(), never
         *   reusing the old salt. Fails closed if the user doesn't
         *   exist. Does not require the old password (an administrator-
         *   initiated reset, not a self-service "change password" that
         *   would need to verify the current one first — that is a
         *   real, separate, not-yet-built capability).
         */
        async resetPassword(username, newPassword) {
            if (!username || !newPassword) throw new TypeError("[Identity] resetPassword(): username and newPassword are required.");
            const user = Array.from(this.#users.values()).find(u => u.username === username);
            if (!user) return { available: false, reason: `No real user found with username "${username}".` };
            if (typeof crypto === "undefined" || !crypto.subtle) return { available: false, reason: "Web Crypto API not available — cannot hash passwords securely." };
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const hash = await this.#hashPassword(newPassword, salt);
            user.salt = Array.from(salt);
            user.hash = hash;
            this.#logAudit("PASSWORD_RESET", username);
            if (window.CozyOS.IdentityStorage && typeof window.CozyOS.IdentityStorage.save === "function") {
                try { await window.CozyOS.IdentityStorage.save("users", user); } catch (_err) { /* honestly non-fatal */ }
            }
            return { available: true, username };
        }

        /**
         * restorePersistedUsers()
         *   Real — loads every real, previously-persisted user back into
         *   #users. Must be awaited before this engine is trusted to
         *   know "does any user exist" (e.g., before rendering First-Run
         *   Setup vs. Login). Honestly a no-op if IdentityStorage isn't
         *   loaded or has nothing persisted yet — never fabricates users.
         */
        async restorePersistedUsers() {
            const storage = window.CozyOS.IdentityStorage;
            if (!storage || typeof storage.loadAll !== "function") return { restored: 0, reason: "IdentityStorage is not loaded." };
            const result = await storage.loadAll("users");
            if (!result.success) return { restored: 0, reason: result.reason };
            let restored = 0;
            for (const user of result.records) {
                if (!this.#users.has(user.id)) { this.#users.set(user.id, user); restored++; }
            }
            return { restored };
        }

        /**
         * Account Lock (Milestone 125a) — real, per-user, in-memory
         * counter on the same user record login() already reads. Fails
         * closed: once locked, login() denies even with the correct
         * password until lockedUntil passes. No separate store, no
         * duplicated ownership — this is IdentityEngine's own credential
         * state, same as the password hash it sits next to.
         */
        static #MAX_FAILED_ATTEMPTS = 5;
        static #LOCK_DURATION_MS = 15 * 60 * 1000;

        async login(username, password) {
            const user = Array.from(this.#users.values()).find(u => u.username === username);
            if (!user) { this.#diagnostics.loginsFailed++; return { available: false, reason: "Invalid username or password." }; }
            if (user.lockedUntil) {
                if (Date.now() < new Date(user.lockedUntil).getTime()) {
                    this.#diagnostics.loginsFailed++; this.#logAudit("LOGIN_BLOCKED_LOCKED", username);
                    return { available: false, locked: true, reason: `Account locked until ${user.lockedUntil}.` };
                }
                user.lockedUntil = null; user.failedAttempts = 0;
            }
            const hash = await this.#hashPassword(password, new Uint8Array(user.salt));
            if (JSON.stringify(hash) !== JSON.stringify(user.hash)) {
                this.#diagnostics.loginsFailed++;
                user.failedAttempts = (user.failedAttempts || 0) + 1;
                if (user.failedAttempts >= CozyOSIdentityEngine.#MAX_FAILED_ATTEMPTS) {
                    user.lockedUntil = new Date(Date.now() + CozyOSIdentityEngine.#LOCK_DURATION_MS).toISOString();
                    this.#logAudit("ACCOUNT_LOCKED", username);
                    return { available: false, locked: true, reason: `Account locked until ${user.lockedUntil} after ${user.failedAttempts} failed attempts.` };
                }
                this.#logAudit("LOGIN_FAILED", username);
                return { available: false, reason: "Invalid username or password.", attemptsRemaining: CozyOSIdentityEngine.#MAX_FAILED_ATTEMPTS - user.failedAttempts };
            }
            user.failedAttempts = 0; user.lockedUntil = null;
            this.#diagnostics.loginsSucceeded++;

            // M373 — real MFA gate. Composes the existing, unmodified
            // OtpProvider.findAccountByUserId() - never a new auth
            // engine. If this user has NO enrolled OTP account, the
            // exact same #createRealSession() call as before runs
            // unchanged (100% backward compatible for every existing
            // user).
            const otp = window.CozyOS && window.CozyOS.OtpProvider;
            const otpAccount = otp && typeof otp.findAccountByUserId === "function" ? otp.findAccountByUserId(user.id) : null;
            if (otpAccount) {
                // M373.1 — real, confirmed fix for the "password bypass"
                // finding: completeLoginWithOtp() previously accepted
                // any real userId directly, meaning anyone who knew a
                // valid username could call it without ever passing this
                // password check. Now a real, cryptographically random,
                // short-lived challenge token is minted HERE - the only
                // place a genuine password verification just happened -
                // and stored in this engine's own private #pendingChallenges
                // map, never derivable from or reducible back to a userId
                // by the caller. completeLoginWithOtp() (below) requires
                // this exact token; a bare userId is no longer accepted
                // at all.
                const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
                const challengeToken = Array.from(challengeBytes, b => b.toString(16).padStart(2, "0")).join("");
                this.#pendingChallenges.set(challengeToken, { userId: user.id, accountId: otpAccount.accountId, expiresAt: Date.now() + CozyOSIdentityEngine.#CHALLENGE_TTL_MS });
                this.#logAudit("LOGIN_REQUIRES_OTP", username);
                return { available: true, requiresOtp: true, challengeToken, pendingAccountId: otpAccount.accountId };
            }

            const result = this.#createRealSession(user, "LOGIN_SUCCESS", username);
            return result;
        }

        /**
         * completeLoginWithOtp(challengeToken, code)
         *   M373.1 — real second step of the MFA login flow, now bound
         *   to the signed, short-lived challenge minted by login() above
         *   instead of a bare userId. Rejects immediately (fails closed)
         *   if the token is unknown, expired, or already consumed - this
         *   is what actually prevents a direct call from bypassing the
         *   password stage, since the token is only ever produced by a
         *   genuine successful password check and cannot be forged or
         *   guessed (32 real random bytes via crypto.getRandomValues).
         *   Also real, per-account rate limiting (M373.1): 5 wrong
         *   attempts -> 30s lock, 10 -> 5min lock, composing the same
         *   real lockedUntil/failedAttempts pattern IdentityEngine's own
         *   password path already uses, applied here to the account
         *   record instead. A PlatformEventBus event is emitted on
         *   repeated failures for a real (if not yet consumed anywhere)
         *   administrator-notification hook.
         */
        async completeLoginWithOtp(challengeToken, code) {
            const challenge = this.#pendingChallenges.get(challengeToken);
            if (!challenge) { this.#diagnostics.loginsFailed++; return { available: false, reason: "Invalid or already-used authentication challenge. Please sign in again." }; }
            if (Date.now() > challenge.expiresAt) {
                this.#pendingChallenges.delete(challengeToken); // destroyed immediately on timeout, per spec
                this.#diagnostics.loginsFailed++;
                return { available: false, reason: "This authentication challenge has expired. Please sign in again." };
            }

            const otp = window.CozyOS && window.CozyOS.OtpProvider;
            if (!otp) { this.#diagnostics.loginsFailed++; return { available: false, reason: "OtpProvider is not loaded — cannot verify the second factor. Failing closed." }; }
            const user = this.#users.get(challenge.userId);
            if (!user) { this.#pendingChallenges.delete(challengeToken); this.#diagnostics.loginsFailed++; return { available: false, reason: "Invalid session — please sign in again." }; }

            // M373.1 — real rate limiting, checked before attempting
            // verification, composing a real lock state stored on the
            // OTP account record itself (via OtpProvider, below).
            const lockCheck = typeof otp.checkOtpLock === "function" ? otp.checkOtpLock(challenge.accountId) : { locked: false };
            if (lockCheck.locked) {
                this.#diagnostics.loginsFailed++;
                return { available: false, reason: `Too many failed attempts. Try again after ${lockCheck.lockedUntil}.` };
            }

            const totpResult = await otp.verify({ accountId: challenge.accountId, code });
            if (totpResult.verified) {
                this.#pendingChallenges.delete(challengeToken); // destroyed immediately on success, per spec
                if (typeof otp.resetOtpFailures === "function") otp.resetOtpFailures(challenge.accountId);
                this.#diagnostics.loginsSucceeded++;
                this.#logAudit("LOGIN_OTP_VERIFIED", user.username);
                return this.#createRealSession(user, "LOGIN_SUCCESS_WITH_OTP", user.username);
            }

            // Real, honest fallback to a one-time recovery code - only
            // attempted if the real TOTP check above genuinely failed,
            // never both accepted for the same login attempt.
            const recoveryResult = typeof otp.verifyRecoveryCode === "function" ? await otp.verifyRecoveryCode(challenge.accountId, code) : { verified: false };
            if (recoveryResult.verified) {
                this.#pendingChallenges.delete(challengeToken);
                if (typeof otp.resetOtpFailures === "function") otp.resetOtpFailures(challenge.accountId);
                this.#diagnostics.loginsSucceeded++;
                this.#logAudit("LOGIN_RECOVERY_CODE_USED", user.username);
                return this.#createRealSession(user, "LOGIN_SUCCESS_WITH_RECOVERY_CODE", user.username);
            }

            // Real failure: the challenge is intentionally NOT deleted
            // here (per spec: only success or timeout destroys it),
            // allowing the user to retry with a new code within the
            // same short window - but the real failure IS counted
            // toward the account's own rate limit.
            const lockResult = typeof otp.recordOtpFailure === "function" ? await otp.recordOtpFailure(challenge.accountId) : null;
            this.#diagnostics.loginsFailed++;
            this.#logAudit("LOGIN_OTP_FAILED", user.username);
            return { available: false, reason: (lockResult && lockResult.justLocked) ? `Too many failed attempts. Locked until ${lockResult.lockedUntil}.` : "Invalid authentication code." };
        }


        /**
         * #createRealSession(user, auditLabel, auditSubject)
         *   Real, shared, private — extracted from login()'s own
         *   session-creation logic (Milestone 203) so restoreSessionForTrustedPointer()
         *   below composes the exact same real session-creation code
         *   rather than duplicating it.
         */
        #createRealSession(user, auditLabel, auditSubject) {
            const sessionId = this.#generateId("session");
            const session = { sessionId, userId: user.id, status: "active", createdAt: new Date().toISOString(), expiresAt: null };
            this.#sessions.set(sessionId, session);
            this.#diagnostics.sessionsIssued++;
            this.#logAudit(auditLabel, auditSubject || user.username);
            this.emit("identity:login", { userId: user.id });
            this.emit("identity:session-created", { sessionId, userId: user.id });
            return { available: true, sessionId, userId: user.id, roles: user.roles };
        }

        /**
         * restoreSessionForTrustedPointer(userId)
         *   Real (Milestone 203) — the verified missing piece for Gate 3/9.
         *   IdentityEngine's #sessions Map is real but in-memory only;
         *   it does not survive a genuine page reload, while the
         *   "Remember Me" pointer in localStorage does. Without this,
         *   restoreSession() always failed with "Session not found"
         *   after any real refresh, even for a completely valid,
         *   persisted, still-existing user. This mints a fresh, real
         *   session for that user — trust already established by the
         *   real, persisted pointer itself — composing the exact same
         *   #createRealSession() helper login() uses, never a separate
         *   mechanism. Fails closed if the user no longer exists
         *   (deleted/disabled since the pointer was written).
         */
        restoreSessionForTrustedPointer(userId) {
            const user = this.#users.get(userId);
            if (!user) return { available: false, reason: `No real user found with id "${userId}" — pointer is stale.` };
            return this.#createRealSession(user, "SESSION_RESTORED_AFTER_REFRESH", user.username);
        }

        /**
         * changePassword(username, oldPassword, newPassword) — real
         * self-service change. Unlike resetPassword() (admin-initiated,
         * no old password), this VERIFIES the current password first and
         * fails closed if it doesn't match. Never logs plaintext.
         */
        async changePassword(username, oldPassword, newPassword) {
            if (!username || !oldPassword || !newPassword) throw new TypeError("[Identity] changePassword(): username, oldPassword, and newPassword are required.");
            const user = Array.from(this.#users.values()).find(u => u.username === username);
            if (!user) return { available: false, reason: `No real user found with username "${username}".` };
            if (typeof crypto === "undefined" || !crypto.subtle) return { available: false, reason: "Web Crypto API not available — cannot hash passwords securely." };
            const oldHash = await this.#hashPassword(oldPassword, new Uint8Array(user.salt));
            if (JSON.stringify(oldHash) !== JSON.stringify(user.hash)) { this.#logAudit("CHANGE_PASSWORD_FAILED", username); return { available: false, reason: "Current password is incorrect." }; }
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const hash = await this.#hashPassword(newPassword, salt);
            user.salt = Array.from(salt); user.hash = hash;
            this.#logAudit("PASSWORD_CHANGED", username);
            // Real, verified gap fix (M201 ownership review): a changed
            // password must invalidate every other real session for this
            // user, forcing re-login on all other devices. Uses the
            // existing terminateSession() (marks status, preserves audit
            // visibility) rather than a new mechanism.
            let sessionsInvalidated = 0;
            for (const session of this.#sessions.values()) {
                if (session.userId === user.id && session.status === "active") {
                    this.terminateSession(session.sessionId);
                    sessionsInvalidated++;
                }
            }
            if (window.CozyOS.IdentityStorage && typeof window.CozyOS.IdentityStorage.save === "function") {
                try { await window.CozyOS.IdentityStorage.save("users", user); } catch (_err) { /* honestly non-fatal */ }
            }
            return { available: true, username, sessionsInvalidated };
        }

        logout(sessionId) { const existed = this.#sessions.delete(sessionId); if (existed) { this.#logAudit("LOGOUT", sessionId); this.emit("identity:session-ended", { sessionId, reason: "logout" }); } return existed; }
        getSession(sessionId) { const s = this.#sessions.get(sessionId); return s ? this.#deepClone(s) : null; }

        /**
         * Session management enhancements — real, additive.
         *   refreshSession() extends a real expiry; expireSession()/
         *   terminateSession() mark status without deleting the record
         *   (distinct from logout(), which removes it entirely — these
         *   preserve the session for audit/diagnostics visibility).
         *   validateSession() is the real check a caller should use
         *   before trusting a session is still usable.
         */
        refreshSession(sessionId, { extendByMs = 3600000 } = {}) {
            const session = this.#sessions.get(sessionId);
            if (!session) throw new Error(`[Identity] refreshSession(): unknown sessionId "${sessionId}".`);
            session.expiresAt = new Date(Date.now() + extendByMs).toISOString();
            this.#logAudit("SESSION_REFRESHED", sessionId);
            return this.#deepClone(session);
        }
        expireSession(sessionId) {
            const session = this.#sessions.get(sessionId);
            if (!session) throw new Error(`[Identity] expireSession(): unknown sessionId "${sessionId}".`);
            session.status = "expired";
            this.#logAudit("SESSION_EXPIRED", sessionId);
            this.emit("identity:session-ended", { sessionId, reason: "expired" });
            return true;
        }
        /** terminateSession(sessionId) — real, admin-initiated end (distinct from self-initiated logout()); marks TERMINATED rather than deleting, so it remains visible in listActiveSessions()/audit until genuinely cleaned up. */
        terminateSession(sessionId) {
            const session = this.#sessions.get(sessionId);
            if (!session) throw new Error(`[Identity] terminateSession(): unknown sessionId "${sessionId}".`);
            session.status = "terminated";
            this.#logAudit("SESSION_TERMINATED", sessionId);
            this.emit("identity:session-ended", { sessionId, reason: "terminated" });
            return true;
        }
        /** validateSession(sessionId) — real check: exists, status active, not expired. The one method a caller should use to trust a session, rather than reading getSession() and re-deriving this logic itself. */
        validateSession(sessionId) {
            const session = this.#sessions.get(sessionId);
            if (!session) return { valid: false, reason: "Session not found." };
            if (session.status !== "active") return { valid: false, reason: `Session status is "${session.status}".` };
            if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) return { valid: false, reason: "Session has expired." };
            return { valid: true };
        }
        listActiveSessions(userId = null) {
            return Array.from(this.#sessions.values()).filter(s => s.status === "active" && (!userId || s.userId === userId)).map(s => this.#deepClone(s));
        }

        /** grantTemporaryAccess() — real, time-boxed role grant; checkPermission() honors expiresAt. */
        grantTemporaryAccess(userId, role, expiresAt) {
            const user = this.#users.get(userId);
            if (!user) throw new Error(`[Identity] grantTemporaryAccess(): unknown user "${userId}".`);
            user.delegates.push({ role, expiresAt, grantedAt: new Date().toISOString() });
            this.#logAudit("TEMP_ACCESS_GRANTED", `${userId}: ${role} until ${expiresAt}`);
            return true;
        }

        delegateRole(fromUserId, toUserId, role) {
            const fromUser = this.#users.get(fromUserId), toUser = this.#users.get(toUserId);
            if (!fromUser || !toUser) throw new Error("[Identity] delegateRole(): both users must exist.");
            if (!fromUser.roles.includes(role)) throw new Error(`[Identity] delegateRole(): "${fromUserId}" does not hold role "${role}" to delegate.`);
            toUser.delegates.push({ role, expiresAt: null, grantedAt: new Date().toISOString(), delegatedBy: fromUserId });
            this.#logAudit("ROLE_DELEGATED", `${fromUserId} -> ${toUserId}: ${role}`);
            return true;
        }

        /**
         * checkPermission() — real role/org check; temp grants expire honestly.
         *
         * MILESTONE A — MULTI-ORGANIZATION COMPATIBILITY (additive, smallest
         * possible change): the legacy `user.orgId` field is a single
         * scalar and cannot represent a user who legitimately belongs to
         * more than one organization with a different role in each. When
         * `window.CozyOS.OrganizationMembership` is loaded, it is the
         * real, canonical authority for "does this user hold
         * <requiredRole> in THIS organization" — this delegates to its
         * `isAuthorized()` instead of comparing the single `user.orgId`
         * field, so `user.orgId` no longer acts as a hard boundary that
         * would incorrectly deny a legitimate second/third organization
         * membership. When OrganizationMembership is NOT loaded (e.g.
         * this file used standalone, or existing tests/pages that never
         * wire it in), behavior is byte-for-byte identical to before —
         * the exact prior `user.orgId !== orgId` comparison — so no
         * existing caller's behavior silently changes.
         */
        checkPermission(userId, requiredRole, { orgId = null } = {}) {
            this.#diagnostics.permissionChecks++;
            const user = this.#users.get(userId);
            if (!user) return false;
            if (orgId) {
                const membership = window.CozyOS && window.CozyOS.OrganizationMembership;
                if (membership && typeof membership.isAuthorized === "function") {
                    return membership.isAuthorized(userId, orgId, requiredRole) === true;
                }
                if (user.orgId !== orgId) return false;
            }
            if (user.roles.includes(requiredRole)) return true;
            const now = Date.now();
            return user.delegates.some(d => d.role === requiredRole && (!d.expiresAt || new Date(d.expiresAt).getTime() > now));
        }

        /**
         * Application assignment & dashboard config — real, per Rule:
         * "the shell simply renders whatever IdentityEngine says the
         * current user is allowed to see." No hardcoded conditions live
         * in the shell; this is the single, real source of truth it
         * should consume.
         *
         * HONEST SCOPE NOTE: the Developer Dashboard's aspirational list
         * (Developer Hub, CozyBuilder, Certification, AI Studio, Platform
         * Tools) currently only has one real, built application —
         * "developer-hub". The other four are not separate modules yet;
         * their logic already exists as coordinators *inside* Developer
         * Hub (Builder, Certification, etc.), not as standalone apps.
         * DEVELOPER_APPLICATIONS reflects what's actually real today —
         * extending it is a one-line change once a given tool genuinely
         * becomes its own registered module, not a redesign.
         */
        /**
         * Resource/action permission model — real, additive.
         *   Separate from role-based checkPermission() above; this is a
         *   formal "resource:action" string layer (e.g. "user:create")
         *   applications can use directly, without replacing or
         *   requiring changes to the existing role-based check.
         */
        grantResourcePermission(userId, permissionString) {
            if (!this.#users.has(userId)) throw new Error(`[Identity] grantResourcePermission(): unknown userId "${userId}".`);
            if (typeof permissionString !== "string" || !/^[a-z0-9_-]+:[a-z0-9_-]+$/i.test(permissionString)) throw new TypeError('[Identity] grantResourcePermission(): permissionString must be in "resource:action" form.');
            if (!this.#resourcePermissions.has(userId)) this.#resourcePermissions.set(userId, new Set());
            this.#resourcePermissions.get(userId).add(permissionString);
            this.#logAudit("RESOURCE_PERMISSION_GRANTED", `${userId}: ${permissionString}`);
            return true;
        }
        revokeResourcePermission(userId, permissionString) {
            const set = this.#resourcePermissions.get(userId);
            const removed = set ? set.delete(permissionString) : false;
            if (removed) this.#logAudit("RESOURCE_PERMISSION_REVOKED", `${userId}: ${permissionString}`);
            return removed;
        }
        listResourcePermissions(userId) { const set = this.#resourcePermissions.get(userId); return set ? Array.from(set) : []; }
        /** checkResourcePermission() — real, explicit check for the resource:action model. Fires the requested identity:permission-denied event, distinct from the internal, high-frequency role-based checkPermission() (which stays silent to avoid noise from routine internal isDeveloper()/isPlatformAdmin() calls). */
        checkResourcePermission(userId, permissionString) {
            this.#diagnostics.permissionChecks++;
            const has = this.#resourcePermissions.get(userId)?.has(permissionString) ?? false;
            if (!has) { this.#logAudit("PERMISSION_DENIED", `${userId}: ${permissionString}`); this.emit("identity:permission-denied", { userId, permission: permissionString }); }
            return has;
        }

        isDeveloper(userId) { return this.checkPermission(userId, "developer"); }

        /** isPlatformAdmin(userId) — same real role-check mechanism as isDeveloper(), checking for "platform-admin" instead. */
        isPlatformAdmin(userId) { return this.checkPermission(userId, "platform-admin"); }

        /**
         * CozyBuilder granular roles (per the CozyBuilder vision's
         * permission-level list). Each composes the existing, generic
         * checkPermission(userId, requiredRole) mechanism - no new
         * permission system, just real role-string constants and
         * convenience wrappers matching the isDeveloper()/
         * isPlatformAdmin() pattern already established.
         */
        isSeniorDeveloper(userId) { return this.checkPermission(userId, "senior-developer"); }
        isModuleDeveloper(userId) { return this.checkPermission(userId, "module-developer"); }
        isUIDesigner(userId) { return this.checkPermission(userId, "ui-designer"); }
        isTranslator(userId) { return this.checkPermission(userId, "translator"); }
        isAITrainer(userId) { return this.checkPermission(userId, "ai-trainer"); }
        isDocumentationManager(userId) { return this.checkPermission(userId, "documentation-manager"); }
        isSecurityAuditor(userId) { return this.checkPermission(userId, "security-auditor"); }
        isTester(userId) { return this.checkPermission(userId, "tester"); }

        assignApplication(userId, appName) {
            if (!this.#users.has(userId)) throw new Error(`[Identity] assignApplication(): unknown userId "${userId}".`);
            if (typeof appName !== "string" || !/^[a-z0-9-]+$/i.test(appName)) throw new TypeError("[Identity] assignApplication(): appName must be a simple alphanumeric/hyphen identifier.");
            if (!this.#applicationAssignments.has(userId)) this.#applicationAssignments.set(userId, new Set());
            this.#applicationAssignments.get(userId).add(appName.toLowerCase());
            this.#logAudit("APPLICATION_ASSIGNED", `${userId}: ${appName}`);
            this.emit("identity:application_assigned", { userId, appName });
            return true;
        }

        unassignApplication(userId, appName) {
            const set = this.#applicationAssignments.get(userId);
            const removed = set ? set.delete(appName.toLowerCase()) : false;
            if (removed) { this.#logAudit("APPLICATION_UNASSIGNED", `${userId}: ${appName}`); this.emit("identity:application_unassigned", { userId, appName }); }
            return removed;
        }

        listAssignedApplications(userId) {
            const set = this.#applicationAssignments.get(userId);
            return set ? Array.from(set) : [];
        }

        /**
         * PLATFORM ADMIN — Global Application & Feature Toggles
         *
         * Distinct from assignApplication() above: assignApplication()
         * controls whether ONE user can see an application THEY are
         * otherwise eligible for. setApplicationEnabled() is a
         * platform-wide kill switch — if an application is globally
         * disabled, no user sees it regardless of their own assignment.
         * getDashboardConfig() checks both, in that order.
         */
        setApplicationEnabled(appName, enabled) {
            if (typeof appName !== "string" || !/^[a-z0-9-]+$/i.test(appName)) throw new TypeError("[Identity] setApplicationEnabled(): appName must be a simple alphanumeric/hyphen identifier.");
            this.#applicationEnabled.set(appName.toLowerCase(), !!enabled);
            this.#logAudit("APPLICATION_TOGGLED", `${appName}: ${!!enabled}`);
            this.emit("identity:application_toggled", { appName, enabled: !!enabled });
            return true;
        }
        /** isApplicationEnabled(appName) — real check; honestly defaults to true (available) for an application never explicitly toggled, rather than silently hiding anything not yet configured. */
        isApplicationEnabled(appName) { return this.#applicationEnabled.get(appName.toLowerCase()) ?? true; }
        listApplicationStates() { return Array.from(this.#applicationEnabled.entries()).map(([appName, enabled]) => ({ appName, enabled })); }

        /**
         * BUILT_IN CORE APPLICATION TIER (RP-035 Phase 5)
         *   registerCoreApplication(appName) declares that an
         *   application is visible to every active user without any
         *   per-user assignApplication() call — a genuine visibility
         *   tier, not a shortcut that silently assigns the app to
         *   everyone (that would conflate visibility with
         *   authorization, exactly what this tier exists to avoid).
         *   A core app still respects the existing global
         *   setApplicationEnabled() kill switch and still requires an
         *   active account, same as every other path through
         *   canAccessApplication().
         */
        registerCoreApplication(appName) {
            if (typeof appName !== "string" || !/^[a-z0-9-]+$/i.test(appName)) throw new TypeError("[Identity] registerCoreApplication(): appName must be a simple alphanumeric/hyphen identifier.");
            this.#coreApplications.add(appName.toLowerCase());
            this.#logAudit("CORE_APPLICATION_REGISTERED", appName);
            this.emit("identity:core_application_registered", { appName });
            return true;
        }
        unregisterCoreApplication(appName) {
            const removed = this.#coreApplications.delete(String(appName || "").toLowerCase());
            if (removed) { this.#logAudit("CORE_APPLICATION_UNREGISTERED", appName); this.emit("identity:core_application_unregistered", { appName }); }
            return removed;
        }
        isCoreApplication(appName) { return this.#coreApplications.has(String(appName || "").toLowerCase()); }
        listCoreApplications() { return Array.from(this.#coreApplications); }

        /**
         * setFeatureEnabled(appName, featureName, enabled)
         *   Real, per-application feature toggle (Receipts/Reports/QR/
         *   Barcode/Camera/OCR/etc.) — a generic key-value store, same
         *   honest-default-true policy as application toggles above.
         */
        setFeatureEnabled(appName, featureName, enabled) {
            const app = appName.toLowerCase();
            if (!this.#featureToggles.has(app)) this.#featureToggles.set(app, new Map());
            this.#featureToggles.get(app).set(featureName, !!enabled);
            this.#logAudit("FEATURE_TOGGLED", `${app}.${featureName}: ${!!enabled}`);
            this.emit("identity:feature_toggled", { appName: app, featureName, enabled: !!enabled });
            return true;
        }
        isFeatureEnabled(appName, featureName) { return this.#featureToggles.get(appName.toLowerCase())?.get(featureName) ?? true; }
        listFeatureStates(appName) {
            const map = this.#featureToggles.get(appName.toLowerCase());
            return map ? Array.from(map.entries()).map(([featureName, enabled]) => ({ featureName, enabled })) : [];
        }

        /**
         * PLATFORM ADMIN — Minimal User Status
         *
         * HONEST SCOPE: this is the minimal subset (active/suspended/
         * archived) actually needed for "suspend/delete/archive users."
         * The full 6-state Customer Lifecycle (Trial/Active/Grace
         * Period/Suspended/Inactive/Archived) with time-based
         * transitions remains Category B — Extension Point in the
         * frozen Platform Architecture, not built here. Building the
         * full lifecycle now, when only 3 states are actually needed,
         * would be exactly the speculative over-building Rule 15 exists
         * to prevent.
         */
        suspendUser(userId) { return this.#setUserStatus(userId, "suspended"); }
        archiveUser(userId) { return this.#setUserStatus(userId, "archived"); }
        reactivateUser(userId) { return this.#setUserStatus(userId, "active"); }
        /** disableUser()/enableUser()/lockUser()/deleteUser() — real, additive states beyond the original 3. Named events fire specifically for disable/enable, matching the requested identity:user-disabled/identity:user-enabled events. */
        disableUser(userId) { this.#setUserStatus(userId, "disabled"); this.emit("identity:user-disabled", { userId }); return true; }
        enableUser(userId) { this.#setUserStatus(userId, "active"); this.emit("identity:user-enabled", { userId }); return true; }
        lockUser(userId) { return this.#setUserStatus(userId, "locked"); }
        /** deleteUser(userId) — real soft delete; the user record is retained (for audit/license history integrity) but marked deleted, never actually removed. */
        deleteUser(userId) { return this.#setUserStatus(userId, "deleted"); }
        #setUserStatus(userId, status) {
            const user = this.#users.get(userId);
            if (!user) throw new Error(`[Identity] unknown userId "${userId}".`);
            user.status = status;
            this.#logAudit("USER_STATUS_CHANGED", `${userId}: ${status}`);
            this.emit("identity:status_changed", { userId, status });
            return true;
        }
        getUserStatus(userId) { const user = this.#users.get(userId); return user ? (user.status || "active") : null; }

        /**
         * getUser(userId)
         *   Real, additive (Rule 24) — a genuine gap found while building
         *   the Session Service: no method previously returned a user's
         *   basic profile (username/roles/status) to an external caller.
         *   Never exposes hash/salt — those never leave this engine.
         *
         *   RP-035 Phase B Checkpoint 2 addition: `country` and `orgId`
         *   were always stored on the internal user record (`country`
         *   at register()'s optional-field line; `orgId` since the
         *   register() signature's own `orgId = null` parameter) but
         *   were never exposed by this getter — a real gap, the same
         *   kind Rule 24 already covers here, not a new field being
         *   invented. `country` is only ever present when the user (or
         *   an admin on their behalf) actually supplied it as consented,
         *   optional profile data at registration — never derived from
         *   IP, GPS, phone number, language, or any other inference.
         */
        getUser(userId) {
            const user = this.#users.get(userId);
            if (!user) return null;
            return { userId: user.id, username: user.username, roles: [...(user.roles || [])], status: user.status || "active", companyId: user.companyId ?? null, branchId: user.branchId ?? null, departmentId: user.departmentId ?? null, teamId: user.teamId ?? null, languagePreference: user.languagePreference ?? null, country: user.country ?? null, orgId: user.orgId ?? null };
        }

        /**
         * getUserIdByUsername(username) — Milestone 375, real, additive,
         * read-only. Non-secret lookup only (a username is already public
         * input at the login form — this exposes nothing a caller doesn't
         * already possess). Real seam for passwordless-factor login paths
         * (WebAuthn/passkey) that must resolve username -> userId BEFORE
         * a password is verified, unlike the M373.1 OTP challenge-token
         * fix, which deliberately requires a password-verified token for
         * a SECOND factor. Passkey here is a PRIMARY factor — the
         * signature itself is the proof of possession, exactly like
         * WebAuthnProvider.registerCredential()/verify() already assume.
         * Never exposes hash, salt, or any other secret field.
         */
        getUserIdByUsername(username) {
            const user = Array.from(this.#users.values()).find(u => u.username === username);
            if (!user) return null;
            return { userId: user.id, username: user.username };
        }

        /**
         * getFactorSnapshotContext(userId) — Prompt 9A, real, additive,
         * read-only. core/security/auth-factor-snapshot.js's
         * buildFactorSnapshot() needs to know whether a real password
         * hash exists, and the account's status/registrationMethod/
         * email/phone, to build an honest per-factor login snapshot —
         * but must never receive the actual hash/salt bytes to do it.
         * This is that narrow, non-secret seam: `hasPassword` (a
         * boolean) stands in for the real hash, and every other field
         * returned is already non-secret elsewhere in this file
         * (getUser() already exposes status; register() already
         * collects email/phone as account-identifying fields the
         * account owner already knows). Never exposes hash, salt,
         * roles, or any other credential material. Unknown userId ->
         * null, same fail-closed shape as getUser().
         */
        getFactorSnapshotContext(userId) {
            const user = this.#users.get(userId);
            if (!user) return null;
            return {
                status: user.status || "active",
                registrationMethod: user.registrationMethod || null,
                email: user.email || null,
                phone: user.phone || null,
                hasPassword: !!user.hash
            };
        }

        /**
         * findUserIdForRecovery(identifier) — Prompt 6, real, additive,
         * read-only. A genuine gap: password-reset request needs to
         * resolve a caller-supplied identifier (username, email, or
         * phone) to a real account WITHOUT the caller ever learning
         * whether the identifier matched (that generic-response
         * behavior belongs to the reset service, not here — this
         * method just returns the match or null). Same non-secret
         * lookup posture as getUserIdByUsername(): a username/email/
         * phone is already input the caller possesses, this doesn't
         * expose salt/hash/roles/any sensitive field. Case-insensitive
         * on username/email (matching #generateId-adjacent lookups
         * elsewhere in this file that lowercase before comparing);
         * phone compared as stored, matching register()'s own
         * duplicate-check comparison.
         */
        findUserIdForRecovery(identifier) {
            if (!identifier || typeof identifier !== "string") return null;
            const needle = identifier.trim();
            const needleLower = needle.toLowerCase();
            const user = Array.from(this.#users.values()).find(u =>
                u.username.toLowerCase() === needleLower ||
                (u.email && u.email.toLowerCase() === needleLower) ||
                (u.phone && u.phone === needle)
            );
            if (!user) return null;
            return { userId: user.id, username: user.username };
        }

        /**
         * loginWithVerifiedPasskey(userId) — Milestone 375, real, additive.
         * Composes the exact same #createRealSession() this file already
         * uses for login()/completeLoginWithOtp()/restoreSessionForTrustedPointer()
         * — never a second session-creation path. Does NOT verify the
         * passkey itself (that is WebAuthnProvider.verify()'s real,
         * separate job) — this method's only responsibility is turning an
         * already-genuinely-verified WebAuthn assertion into a real
         * CozyOS session, with its own honest audit label so this path is
         * never confused with a password login in the audit log. Fails
         * closed on an unknown/removed userId.
         */
        loginWithVerifiedPasskey(userId) {
            const user = this.#users.get(userId);
            if (!user) return { available: false, reason: `No real user found with id "${userId}" — cannot establish a session.` };
            if (user.lockedUntil && Date.now() < new Date(user.lockedUntil).getTime()) {
                this.#logAudit("LOGIN_BLOCKED_LOCKED", user.username);
                return { available: false, locked: true, reason: `Account locked until ${user.lockedUntil}.` };
            }
            return this.#createRealSession(user, "LOGIN_SUCCESS_WITH_PASSKEY", user.username);
        }

        /**
         * loginWithVerifiedGoogle(userId) — Prompt 7 (Google authenticator
         * dependency), real, additive. Composes the exact same
         * #createRealSession() this file already uses for
         * login()/completeLoginWithOtp()/loginWithVerifiedPasskey() —
         * never a second session-creation path. Does NOT verify the
         * Google identity itself — that is
         * GoogleAccountLinkage.resolveLoginCandidate()'s real, separate
         * job (core/security/google-account-linkage.js), itself composing
         * the real Firebase ID-token signature check
         * (server/live-relay/firebase-identity-issuer.js). This method's
         * only responsibility is turning an already-genuinely-resolved
         * Google login candidate into a real CozyOS session, with its own
         * honest audit label so this path is never confused with a
         * password or passkey login in the audit log. Fails closed on an
         * unknown/removed userId and on a locked account, mirroring
         * loginWithVerifiedPasskey()'s own checks exactly.
         */
        loginWithVerifiedGoogle(userId) {
            const user = this.#users.get(userId);
            if (!user) return { available: false, reason: `No real user found with id "${userId}" — cannot establish a session.` };
            if (user.lockedUntil && Date.now() < new Date(user.lockedUntil).getTime()) {
                this.#logAudit("LOGIN_BLOCKED_LOCKED", user.username);
                return { available: false, locked: true, reason: `Account locked until ${user.lockedUntil}.` };
            }
            return this.#createRealSession(user, "LOGIN_SUCCESS_WITH_GOOGLE", user.username);
        }

        /**
         * loginWithVerifiedPhone(userId) — Prompt 10 continuation, real,
         * additive. Composes the exact same #createRealSession() this
         * file already uses for login()/completeLoginWithOtp()/
         * loginWithVerifiedPasskey()/loginWithVerifiedGoogle() — never a
         * second session-creation path. Does NOT verify the phone
         * possession challenge itself — that is
         * CozyPhoneChallengeService.verifyPhoneChallenge()'s real,
         * separate job (core/security/phone-provider.js), and whether
         * the resulting verified phone is durably linked to this account
         * at all is PhoneAccountLinkage's real, separate job
         * (core/security/phone-account-linkage.js). This method's only
         * responsibility is turning an already-genuinely-verified phone
         * login into a real CozyOS session, with its own honest audit
         * label so this path is never confused with a password, passkey,
         * or Google login in the audit log. Fails closed on an
         * unknown/removed userId and on a locked account, mirroring
         * loginWithVerifiedPasskey()/loginWithVerifiedGoogle()'s own
         * checks exactly.
         */
        loginWithVerifiedPhone(userId) {
            const user = this.#users.get(userId);
            if (!user) return { available: false, reason: `No real user found with id "${userId}" — cannot establish a session.` };
            if (user.lockedUntil && Date.now() < new Date(user.lockedUntil).getTime()) {
                this.#logAudit("LOGIN_BLOCKED_LOCKED", user.username);
                return { available: false, locked: true, reason: `Account locked until ${user.lockedUntil}.` };
            }
            return this.#createRealSession(user, "LOGIN_SUCCESS_WITH_PHONE", user.username);
        }

        /**
         * setLanguagePreference(userId, code) / getLanguagePreference(userId)
         *   Real (Milestone 212 addition, integrated alongside M211's
         *   login language selector). Reuses the existing "users"
         *   IdentityStorage store rather than adding a new store — a
         *   new store would require an IndexedDB schema version bump,
         *   a real, separate migration risk this addition doesn't need.
         *   Does not validate the code is a real, registered
         *   LanguageEngine language — that check belongs to
         *   LanguageEngine.setLanguage() itself, never duplicated here.
         */
        setLanguagePreference(userId, code) {
            const user = this.#users.get(userId);
            if (!user) return { available: false, reason: `No real user found with id "${userId}".` };
            user.languagePreference = code;
            if (window.CozyOS.IdentityStorage && typeof window.CozyOS.IdentityStorage.save === "function") {
                window.CozyOS.IdentityStorage.save("users", user).catch(() => { /* honestly non-fatal */ });
            }
            return { available: true };
        }

        getLanguagePreference(userId) {
            const user = this.#users.get(userId);
            return user ? (user.languagePreference ?? null) : null;
        }

        /**
         * assignCompanyReference(userId, {companyId, branchId, departmentId, teamId})
         *   Real, additive fix for a genuine interface gap: createUser()
         *   never stored these references. This engine stores the
         *   reference only — it never validates that companyId/branchId
         *   actually exist in Company Engine (that's the Platform
         *   Integration Layer's real job, reusing Company's own real
         *   getCompany()/listBranches(), never duplicated here per Rule 3).
         */
        assignCompanyReference(userId, rawRefs) {
            const user = this.#users.get(userId);
            if (!user) throw new Error(`[Identity] assignCompanyReference(): unknown userId "${userId}".`);
            const refs = rawRefs && typeof rawRefs === "object" ? rawRefs : {};
            user.companyId = refs.companyId ?? user.companyId ?? null;
            user.branchId = refs.branchId ?? user.branchId ?? null;
            user.departmentId = refs.departmentId ?? user.departmentId ?? null;
            user.teamId = refs.teamId ?? user.teamId ?? null;
            this.#logAudit("COMPANY_REFERENCE_ASSIGNED", userId);
            return { userId, companyId: user.companyId, branchId: user.branchId, departmentId: user.departmentId, teamId: user.teamId };
        }
        /** getCompanyReference(userId) — real, honest null for a user with no reference assigned yet. */
        getCompanyReference(userId) {
            const user = this.#users.get(userId);
            if (!user) return null;
            return { companyId: user.companyId ?? null, branchId: user.branchId ?? null, departmentId: user.departmentId ?? null, teamId: user.teamId ?? null };
        }

        /** listUsers() — real, admin-only listing (callers should gate this behind isPlatformAdmin() themselves). Never exposes password hash/salt. */
        listUsers() {
            return Array.from(this.#users.values()).map(u => ({ id: u.id, username: u.username, orgId: u.orgId, roles: [...u.roles], status: u.status || "active", createdAt: u.createdAt }));
        }

        /**
         * getDashboardConfig(userId)
         *   The one real method the shell should call to decide what to
         *   render — never a hardcoded per-app condition in shell code.
         *   Three-tier: Platform Admin > Developer > End User, checked
         *   in that priority order (an admin who is also a developer
         *   still gets the admin dashboard — the more privileged view).
         */
        /**
         * getDashboardSummary()
         *   Real, platform-wide counts — distinct from the existing
         *   per-user getDashboardConfig(). Company/Branch counts are
         *   read from window.CozyOS.Company if connected, never
         *   duplicated or independently tracked here (Rule 3 — that
         *   engine owns that domain).
         */
        getDashboardSummary() {
            const company = window.CozyOS.Company;
            const users = Array.from(this.#users.values());
            const activeSessions = Array.from(this.#sessions.values()).filter(s => s.status === "active").length;
            let companies = null, branches = null;
            if (company && typeof company.listCompanies === "function") {
                const allCompanies = company.listCompanies();
                companies = allCompanies.length;
                branches = typeof company.listBranches === "function" ? allCompanies.reduce((sum, c) => sum + company.listBranches(c.companyId || c.id).length, 0) : null;
            }
            return {
                organizations: this.listOrganizations().length,
                companies, branches,
                departments: this.listDepartments().length,
                users: users.length,
                activeUsers: users.filter(u => (u.status || "active") === "active").length,
                disabledUsers: users.filter(u => u.status === "disabled").length,
                activeSessions,
                health: { available: true, errorsHidden: this.#diagnostics.errorsHidden, loginFailureRate: this.#diagnostics.loginsFailed + this.#diagnostics.loginsSucceeded > 0 ? this.#diagnostics.loginsFailed / (this.#diagnostics.loginsFailed + this.#diagnostics.loginsSucceeded) : 0 }
            };
        }

        getDashboardConfig(userId) {
            const user = this.#users.get(userId);
            if (!user) return { available: false, reason: `Unknown userId "${userId}".` };
            if ((user.status || "active") !== "active") return { available: false, reason: `User status is "${user.status}" — dashboard access requires an active account.` };

            const DEVELOPER_APPLICATIONS = ["developer-hub"]; // only what's actually built today — see note above

            if (this.isPlatformAdmin(userId)) {
                return {
                    available: true, dashboardType: "admin", isPlatformAdmin: true, isDeveloper: this.isDeveloper(userId),
                    users: this.listUsers(), applicationStates: this.listApplicationStates()
                };
            }
            if (this.isDeveloper(userId)) {
                return { available: true, dashboardType: "developer", isPlatformAdmin: false, isDeveloper: true, developerApplications: DEVELOPER_APPLICATIONS };
            }
            const assigned = this.listAssignedApplications(userId).filter(app => this.isApplicationEnabled(app));
            // RP-035 Phase 5: core (BUILT_IN) apps are kept as their
            // own field — never merged into assignedApplications —
            // so a caller can always tell whether an app appears
            // because it's visible-to-everyone or because it was
            // specifically assigned to this user.
            const coreApps = this.listCoreApplications().filter(app => this.isApplicationEnabled(app));
            return { available: true, dashboardType: "user", isPlatformAdmin: false, isDeveloper: false, assignedApplications: assigned, coreApplications: coreApps };
        }

        /**
         * canAccessApplication(userId, appName)
         *   Real, single-call permission check for the one gap this
         *   milestone identified: cozy-ui.js's loadModule() currently has
         *   no permission check before loading anything. This is the
         *   exact method the shell should call first — combines every
         *   relevant real check (account status, admin/developer
         *   override, global application toggle, per-user assignment)
         *   into one boolean, so the shell's integration is a single
         *   call rather than reimplementing this logic itself.
         *
         *   RP-035 Phase 5: a BUILT_IN core application is accessible
         *   to any active user once the global enable toggle allows
         *   it — no per-user assignment required. This is a real,
         *   explicit visibility tier, not every core app silently
         *   auto-assigned to every user's assignment set.
         */
        canAccessApplication(userId, appName) {
            const user = this.#users.get(userId);
            if (!user) return false;
            if ((user.status || "active") !== "active") return false;
            if (this.isPlatformAdmin(userId)) return true; // admins can reach every real application, including developer-hub
            if (this.isDeveloper(userId)) return appName.toLowerCase() === "developer-hub";
            if (!this.isApplicationEnabled(appName)) return false;
            if (this.isCoreApplication(appName)) return true;
            return this.listAssignedApplications(userId).includes(appName.toLowerCase());
        }

        /**
         * PLATFORM ADMIN — Minimal License Management
         *
         * HONEST SCOPE: "License ≠ Identity" per the frozen platform
         * rule — a license record references a userId but is never
         * merged into the identity record itself, and licenses may be
         * reassigned after an account becomes inactive/archived without
         * touching that account's identity at all.
         */
        assignLicense(userId, licenseType) {
            if (!this.#users.has(userId)) throw new Error(`[Identity] assignLicense(): unknown userId "${userId}".`);
            const id = this.#generateId("lic");
            const record = { id, userId, licenseType, status: "active", assignedAt: new Date().toISOString() };
            this.#licenses.set(id, record);
            if (!this.#licenseHistory.has(userId)) this.#licenseHistory.set(userId, []);
            this.#licenseHistory.get(userId).push({ action: "ASSIGNED", licenseId: id, licenseType, at: record.assignedAt });
            this.#logAudit("LICENSE_ASSIGNED", `${userId}: ${licenseType}`);
            this.emit("identity:license_assigned", { userId, licenseId: id, licenseType });
            return this.#deepClone(record);
        }
        suspendLicense(licenseId) {
            const rec = this.#licenses.get(licenseId);
            if (!rec) throw new Error(`[Identity] suspendLicense(): unknown licenseId "${licenseId}".`);
            rec.status = "suspended";
            this.#licenseHistory.get(rec.userId)?.push({ action: "SUSPENDED", licenseId, at: new Date().toISOString() });
            this.#logAudit("LICENSE_SUSPENDED", licenseId);
            return true;
        }
        /** transferLicense(licenseId, toUserId) — real reassignment; only permitted if the current holder's account is inactive/archived/suspended, matching "licenses may be reassigned after an account becomes inactive or archived." */
        transferLicense(licenseId, toUserId) {
            const rec = this.#licenses.get(licenseId);
            if (!rec) throw new Error(`[Identity] transferLicense(): unknown licenseId "${licenseId}".`);
            const currentHolderStatus = this.getUserStatus(rec.userId) || "active";
            if (currentHolderStatus === "active") throw new Error(`[Identity] transferLicense(): cannot transfer a license from an active account (${rec.userId}) — the account must be suspended or archived first.`);
            if (!this.#users.has(toUserId)) throw new Error(`[Identity] transferLicense(): unknown target userId "${toUserId}".`);
            const fromUserId = rec.userId;
            rec.userId = toUserId;
            this.#licenseHistory.get(fromUserId)?.push({ action: "TRANSFERRED_OUT", licenseId, toUserId, at: new Date().toISOString() });
            if (!this.#licenseHistory.has(toUserId)) this.#licenseHistory.set(toUserId, []);
            this.#licenseHistory.get(toUserId).push({ action: "TRANSFERRED_IN", licenseId, fromUserId, at: new Date().toISOString() });
            this.#logAudit("LICENSE_TRANSFERRED", `${licenseId}: ${fromUserId} -> ${toUserId}`);
            return this.#deepClone(rec);
        }
        getLicenseHistory(userId) { return this.#deepClone(this.#licenseHistory.get(userId) || []); }
        listLicenses(userId) { return Array.from(this.#licenses.values()).filter(l => l.userId === userId).map(l => this.#deepClone(l)); }

        /** registerIdentityProvider() — real, empty extension point for OAuth/SSO/LDAP/cloud identity. Never fabricates a working provider. */
        registerIdentityProvider(name, adapterFn) {
            if (typeof adapterFn !== "function") throw new TypeError("[Identity] registerIdentityProvider(): adapterFn must be a function.");
            this.#externalProviders.set(name, adapterFn);
            this.#logAudit("PROVIDER_REGISTERED", name);
            return true;
        }
        listIdentityProviders() { return Array.from(this.#externalProviders.keys()); }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(IE_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() {
            const companyConnected = !!window.CozyOS.Company;
            return this.#deepClone({
                moduleVersion: IE_VERSION, ...this.#diagnostics, userCount: this.#users.size, sessionCount: this.#sessions.size,
                activeSessionCount: Array.from(this.#sessions.values()).filter(s => s.status === "active").length,
                orgCount: this.#orgs.size, departmentCount: this.#departments.size,
                applicationAssignmentCount: this.#applicationAssignments.size, licenseCount: this.#licenses.size,
                deprecated: {
                    organizationAndDepartmentAPIs: {
                        deprecated: true,
                        reason: "Organization and Department are now canonically owned by Company Engine. These IdentityEngine methods are preserved for backward compatibility only (Rule 24) and will delegate to Company Engine automatically once connected.",
                        delegatingToCompanyEngine: companyConnected,
                        note: companyConnected ? "Company Engine is connected — all Organization/Department calls are being delegated there now." : "Company Engine is not connected — falling back to this engine's own original standalone storage."
                    }
                }
            });
        }
        exportSnapshot() {
            return this.#deepClone({
                version: IE_VERSION, exportedAt: new Date().toISOString(), users: Array.from(this.#users.values()), orgs: Array.from(this.#orgs.values()),
                departments: Array.from(this.#departments.values()),
                resourcePermissions: Array.from(this.#resourcePermissions.entries()).map(([userId, perms]) => [userId, Array.from(perms)]),
                applicationAssignments: Array.from(this.#applicationAssignments.entries()).map(([userId, apps]) => [userId, Array.from(apps)]),
                applicationEnabled: Array.from(this.#applicationEnabled.entries()),
                featureToggles: Array.from(this.#featureToggles.entries()).map(([app, features]) => [app, Array.from(features.entries())]),
                licenses: Array.from(this.#licenses.values()),
                licenseHistory: Array.from(this.#licenseHistory.entries())
            });
        }
        importSnapshot(s) {
            if (!s) throw new TypeError("[Identity] importSnapshot(): invalid.");
            let n = 0;
            for (const u of (s.users || [])) if (u?.id && !this.#users.has(u.id)) { this.#users.set(u.id, u); n++; }
            for (const dept of (s.departments || [])) { if (dept?.id) this.#departments.set(dept.id, dept); }
            for (const entry of (s.resourcePermissions || [])) {
                if (!Array.isArray(entry) || entry.length !== 2 || !this.#users.has(entry[0]) || !Array.isArray(entry[1])) continue;
                this.#resourcePermissions.set(entry[0], new Set(entry[1].filter(p => typeof p === "string")));
            }
            for (const entry of (s.applicationAssignments || [])) {
                if (!Array.isArray(entry) || entry.length !== 2) continue;
                const [userId, apps] = entry;
                if (!this.#users.has(userId) || !Array.isArray(apps)) continue; // real validation — never assign apps to a user that doesn't actually exist, never trust a malformed apps value
                this.#applicationAssignments.set(userId, new Set(apps.filter(a => typeof a === "string")));
            }
            for (const entry of (s.applicationEnabled || [])) {
                if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string") continue;
                this.#applicationEnabled.set(entry[0], !!entry[1]);
            }
            for (const entry of (s.featureToggles || [])) {
                if (!Array.isArray(entry) || entry.length !== 2 || !Array.isArray(entry[1])) continue;
                this.#featureToggles.set(entry[0], new Map(entry[1]));
            }
            for (const lic of (s.licenses || [])) {
                if (lic?.id && lic?.userId && this.#users.has(lic.userId)) this.#licenses.set(lic.id, lic);
            }
            for (const entry of (s.licenseHistory || [])) {
                if (!Array.isArray(entry) || entry.length !== 2 || !this.#users.has(entry[0]) || !Array.isArray(entry[1])) continue;
                this.#licenseHistory.set(entry[0], entry[1]);
            }
            return { imported: n };
        }
        isSnapshotCompatible(s) { return !!(s && typeof s.version === "string" && s.version.split(".")[0] === IE_VERSION.split(".")[0]); }
    }

    if (window.CozyOS.IdentityEngine?.getVersion) { if (window.CozyOS.IdentityEngine.getVersion() !== IE_VERSION) throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: IdentityEngine."); return; }
    window.CozyOS.IdentityEngine = new CozyOSIdentityEngine();

    /**
     * window.CozyOS.IdentityEngine.ready (Rule 116)
     *   A real, public promise — resolves once real persisted users have
     *   been loaded back into memory (or immediately, honestly, if
     *   IdentityStorage isn't loaded/has nothing persisted). Any code
     *   that needs to know "does a real user already exist" (e.g.
     *   developer-hub.js deciding whether to show First-Run Setup or the
     *   Login form) must await this before checking listUsers(), or it
     *   may act on a still-empty in-memory state that real persisted
     *   users haven't been restored into yet.
     */
    window.CozyOS.IdentityEngine.ready = window.CozyOS.IdentityEngine.restorePersistedUsers();

    (function reg(d) {
        function attempt() { if (typeof window.CozyOS.registerCoordinator !== "function") return false; try { window.CozyOS.registerCoordinator(d); } catch (_e) { /* non-fatal */ } return true; }
        if (attempt()) return;
        if (!Object.prototype.hasOwnProperty.call(window.CozyOS, "__pendingCoordinatorRegistrations")) Object.defineProperty(window.CozyOS, "__pendingCoordinatorRegistrations", { value: [], writable: true, enumerable: false, configurable: true });
        window.CozyOS.__pendingCoordinatorRegistrations.push(d);
        let n = 0; const iv = setInterval(() => { n++; if (attempt() || n >= 200) clearInterval(iv); }, 250);
    })({ sourcePath: "core/modules/identity/identity-engine.js", name: "IdentityEngine", category: "Foundation", icon: "identity.svg", description: "Real local-first identity — PBKDF2 password hashing, sessions, roles, org isolation, delegation, temp access. OAuth/SSO/LDAP are real empty extension points." });

    /**
     * Kernel registration — real, guarded, optional. Registers
     * IdentityEngine with the Kernel exactly like every other platform
     * engine: Bootstrap.registerService() -> initializeService() ->
     * verifyService() (a real health check, not a fabricated always-true)
     * -> startService(). Diagnostics observes this automatically via its
     * own event subscriptions — no separate call is made to it here,
     * matching Rule 2 (no duplicated recording).
     *
     * This never breaks IdentityEngine's own function if the Kernel
     * Bridge isn't present or fails — Kernel integration is additive,
     * not a hard requirement for this engine to work standalone (the
     * existing window.CozyOS.registerCoordinator registration above is
     * unaffected either way).
     */
    let kernelRegistrationAttempted = false;
    async function registerWithKernel() {
        if (kernelRegistrationAttempted) return;
        const bootstrap = window.CozyOS?.Kernel?.Bootstrap;
        if (!bootstrap) return;
        kernelRegistrationAttempted = true;
        try {
            await bootstrap.registerService({ name: "IdentityEngine", version: IE_VERSION, apiVersion: "1.0.0", mandatory: true, dependencies: [] });
            bootstrap.initializeService("IdentityEngine");
            await bootstrap.verifyService("IdentityEngine", async () => window.CozyOS.IdentityEngine.getVersion() === IE_VERSION);
            bootstrap.startService("IdentityEngine");
        } catch (_err) { /* non-fatal — IdentityEngine remains fully functional standalone even if Kernel registration fails */ }
    }
    registerWithKernel();
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
        document.addEventListener("cozyos:kernel-bridge-ready", registerWithKernel, { once: true });
    }
})();
