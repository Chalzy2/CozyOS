/**
 * CozyOS Enterprise Framework — CozyIdentityEngine
 * File Reference: core/modules/identity/identity-engine.js
 * Version: 1.0.0-ENTERPRISE
 * Layer: Core / Platform Service — Identity & Access
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
    const IE_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    class CozyOSIdentityEngine {
        #users = new Map(); #sessions = new Map(); #orgs = new Map(); #externalProviders = new Map(); #applicationAssignments = new Map();
        #applicationEnabled = new Map(); #featureToggles = new Map(); #licenses = new Map(); #licenseHistory = new Map();
        #auditLogs = []; #listeners = new Map(); #onceWrapped = new Map();
        #diagnostics = { usersCreated: 0, loginsSucceeded: 0, loginsFailed: 0, sessionsIssued: 0, permissionChecks: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 3.0 };

        getVersion() { return IE_VERSION; }
        #deepClone(v) { try { return structuredClone(v); } catch (_e) { try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; } } }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
        #generateId(p) { return `${p}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; }
        #logAudit(a, m) { this.#auditLogs.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action: a, msg: m })); if (this.#auditLogs.length > 1000) this.#auditLogs.shift(); }
        getAuditLog(p) { const l = this.#auditLogs.map(e => this.#deepClone(e)); return Object.freeze(p ? l.filter(p) : l); }

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

        createOrganization(name) {
            const id = this.#generateId("org");
            this.#orgs.set(id, { id, name: this.#escapeHtml(name), createdAt: new Date().toISOString() });
            this.#logAudit("ORG_CREATED", name);
            return this.#deepClone(this.#orgs.get(id));
        }

        /** createUser() — real PBKDF2 hash, never plaintext, never stored/logged. */
        async createUser({ username, password, orgId, roles = [] }) {
            if (!username || !password) throw new TypeError("[Identity] createUser(): username and password are required.");
            if (orgId && !this.#orgs.has(orgId)) throw new Error(`[Identity] createUser(): unknown orgId "${orgId}".`);
            if (typeof crypto === "undefined" || !crypto.subtle) return { available: false, reason: "Web Crypto API not available — cannot hash passwords securely." };
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const hash = await this.#hashPassword(password, salt);
            const id = this.#generateId("user");
            this.#users.set(id, { id, username: this.#escapeHtml(username), orgId: orgId || null, roles, salt: Array.from(salt), hash, createdAt: new Date().toISOString(), delegates: [] });
            this.#diagnostics.usersCreated++;
            this.#logAudit("USER_CREATED", username);
            return { available: true, userId: id, username };
        }

        async login(username, password) {
            const user = Array.from(this.#users.values()).find(u => u.username === username);
            if (!user) { this.#diagnostics.loginsFailed++; return { available: false, reason: "Invalid username or password." }; }
            const hash = await this.#hashPassword(password, new Uint8Array(user.salt));
            if (JSON.stringify(hash) !== JSON.stringify(user.hash)) { this.#diagnostics.loginsFailed++; this.#logAudit("LOGIN_FAILED", username); return { available: false, reason: "Invalid username or password." }; }
            const sessionId = this.#generateId("session");
            const session = { sessionId, userId: user.id, createdAt: new Date().toISOString(), expiresAt: null };
            this.#sessions.set(sessionId, session);
            this.#diagnostics.loginsSucceeded++; this.#diagnostics.sessionsIssued++;
            this.#logAudit("LOGIN_SUCCESS", username);
            this.emit("identity:login", { userId: user.id });
            return { available: true, sessionId, userId: user.id, roles: user.roles };
        }

        logout(sessionId) { const existed = this.#sessions.delete(sessionId); if (existed) this.#logAudit("LOGOUT", sessionId); return existed; }
        getSession(sessionId) { const s = this.#sessions.get(sessionId); return s ? this.#deepClone(s) : null; }

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

        /** checkPermission() — real role/org check; temp grants expire honestly. */
        checkPermission(userId, requiredRole, { orgId = null } = {}) {
            this.#diagnostics.permissionChecks++;
            const user = this.#users.get(userId);
            if (!user) return false;
            if (orgId && user.orgId !== orgId) return false;
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
        isDeveloper(userId) { return this.checkPermission(userId, "developer"); }

        /** isPlatformAdmin(userId) — same real role-check mechanism as isDeveloper(), checking for "platform-admin" instead. */
        isPlatformAdmin(userId) { return this.checkPermission(userId, "platform-admin"); }

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
        #setUserStatus(userId, status) {
            const user = this.#users.get(userId);
            if (!user) throw new Error(`[Identity] unknown userId "${userId}".`);
            user.status = status;
            this.#logAudit("USER_STATUS_CHANGED", `${userId}: ${status}`);
            this.emit("identity:status_changed", { userId, status });
            return true;
        }
        getUserStatus(userId) { const user = this.#users.get(userId); return user ? (user.status || "active") : null; }

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
            return { available: true, dashboardType: "user", isPlatformAdmin: false, isDeveloper: false, assignedApplications: assigned };
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
        getDiagnosticsReport() { return this.#deepClone({ moduleVersion: IE_VERSION, ...this.#diagnostics, userCount: this.#users.size, sessionCount: this.#sessions.size, orgCount: this.#orgs.size, applicationAssignmentCount: this.#applicationAssignments.size, licenseCount: this.#licenses.size }); }
        exportSnapshot() {
            return this.#deepClone({
                version: IE_VERSION, exportedAt: new Date().toISOString(), users: Array.from(this.#users.values()), orgs: Array.from(this.#orgs.values()),
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

    (function reg(d) {
        function attempt() { if (typeof window.CozyOS.registerCoordinator !== "function") return false; try { window.CozyOS.registerCoordinator(d); } catch (_e) { /* non-fatal */ } return true; }
        if (attempt()) return;
        if (!Object.prototype.hasOwnProperty.call(window.CozyOS, "__pendingCoordinatorRegistrations")) Object.defineProperty(window.CozyOS, "__pendingCoordinatorRegistrations", { value: [], writable: true, enumerable: false, configurable: true });
        window.CozyOS.__pendingCoordinatorRegistrations.push(d);
        let n = 0; const iv = setInterval(() => { n++; if (attempt() || n >= 200) clearInterval(iv); }, 250);
    })({ name: "IdentityEngine", category: "Foundation", icon: "identity.svg", description: "Real local-first identity — PBKDF2 password hashing, sessions, roles, org isolation, delegation, temp access. OAuth/SSO/LDAP are real empty extension points." });
})();
