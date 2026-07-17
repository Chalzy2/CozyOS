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
         * getDashboardConfig(userId)
         *   The one real method the shell should call to decide what to
         *   render — never a hardcoded per-app condition in shell code.
         */
        getDashboardConfig(userId) {
            const user = this.#users.get(userId);
            if (!user) return { available: false, reason: `Unknown userId "${userId}".` };
            const DEVELOPER_APPLICATIONS = ["developer-hub"]; // only what's actually built today — see note above
            return {
                available: true,
                isDeveloper: this.isDeveloper(userId),
                developerApplications: this.isDeveloper(userId) ? DEVELOPER_APPLICATIONS : [],
                assignedApplications: this.listAssignedApplications(userId)
            };
        }

        /** registerIdentityProvider() — real, empty extension point for OAuth/SSO/LDAP/cloud identity. Never fabricates a working provider. */
        registerIdentityProvider(name, adapterFn) {
            if (typeof adapterFn !== "function") throw new TypeError("[Identity] registerIdentityProvider(): adapterFn must be a function.");
            this.#externalProviders.set(name, adapterFn);
            this.#logAudit("PROVIDER_REGISTERED", name);
            return true;
        }
        listIdentityProviders() { return Array.from(this.#externalProviders.keys()); }

        isVersionCompatible(v) { const a = /^v?(\d+)\./.exec(IE_VERSION), b = /^v?(\d+)\./.exec(String(v || "")); return !!(a && b && a[1] === b[1]); }
        getDiagnosticsReport() { return this.#deepClone({ moduleVersion: IE_VERSION, ...this.#diagnostics, userCount: this.#users.size, sessionCount: this.#sessions.size, orgCount: this.#orgs.size, applicationAssignmentCount: this.#applicationAssignments.size }); }
        exportSnapshot() { return this.#deepClone({ version: IE_VERSION, exportedAt: new Date().toISOString(), users: Array.from(this.#users.values()), orgs: Array.from(this.#orgs.values()), applicationAssignments: Array.from(this.#applicationAssignments.entries()).map(([userId, apps]) => [userId, Array.from(apps)]) }); }
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
