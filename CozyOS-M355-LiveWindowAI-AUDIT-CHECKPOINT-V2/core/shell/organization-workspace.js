/**
 * CozyOS — Organization Workspace (DOM/controller)
 * File Reference: core/shell/organization-workspace.js
 *
 * OWNERSHIP AUDIT (performed before writing this file)
 *   core/shell/organization-workspace-core.js already owns every
 *   presentation DECISION (section visibility, workforce/application
 *   control gating, function entitlement) - this file owns none of
 *   that logic itself, it only calls into that module and renders the
 *   result. server/webauthn-rp/server.js already owns every
 *   AUTHORIZATION decision (POST /organizations/context,
 *   GET /webauthn/session, POST /organizations/members/list) - this
 *   file never re-derives a permission, it only requests the server's
 *   verdict and renders it. No new authority is created here.
 *   admin-gate-core.js/chalzydashboard.html already own the
 *   PLATFORM/ORGANIZATION/WORKER/NONE gate decision and only invoke
 *   this file's mount() after the server has already verified an
 *   ORGANIZATION or WORKER session - this file does not re-check that
 *   tier itself, and never renders Builder/platform controls (it has
 *   no code path that could).
 *
 * WHAT THIS FILE OWNS
 * ---------------------
 *   - A small set of pure, Node-testable decision helpers (no DOM):
 *     selectDefaultOrganization(), planSwitch(), interpretContextResponse().
 *     These are exported alongside the DOM class specifically so the
 *     organization-switch DECISION logic can be regression-tested
 *     without a real browser - see core/shell/tests/
 *     organization-workspace.test.js.
 *   - The OrganizationWorkspace DOM controller: mounts into
 *     document.body (same pattern Bootstrap.start() uses for the
 *     platform workspace), renders the organization switcher, section
 *     navigation, and each visible section's content, and re-requests
 *     server context on every switch.
 *
 * SECURITY — SERVER REMAINS AUTHORITATIVE (checkpoint §14)
 *   This file never trusts window.userId / window.organizationId /
 *   window.role / window.permissions / window.isPlatformAdmin, and
 *   never sets any of them. Every rendered fact (organization identity,
 *   role, applications, permissions, isOrgAdmin, capability flags)
 *   comes from the literal, parsed JSON body of a same-origin
 *   POST /organizations/context or GET /webauthn/session call this
 *   turn - never from a cached/mutable local variable trusted across
 *   turns without re-verification, and never from anything a page
 *   script could have overwritten. If the server denies a request,
 *   this file removes the previously-rendered organization state
 *   rather than degrading it gracefully — see switchTo()'s failure
 *   path.
 *
 * DISCLOSED LIMITATION — BUSINESS / INTELLIGENCE / ADMINISTRATIVE
 * REQUESTS / ENTITLEMENT ENGINE WIRING
 *   This milestone's stop condition (per the current prompt) is the
 *   organization workspace + switcher + section visibility + worker/
 *   org-admin surface, on top of the real server context. Deep wiring
 *   of BusinessRecordEngine / BusinessActivityIntelligence /
 *   AdministrativeRequestPanel / the legacy client-side EntitlementEngine
 *   is real, separate work this file does not attempt to fake:
 *     - BusinessRecordEngine/BusinessActivityIntelligence/
 *       AdministrativeRequestPanel are keyed by concepts (storage
 *       scoping, request lifecycle wiring) this milestone's server
 *       surface does not yet expose an organization-scoped bridge for
 *       - inventing one here would be exactly the kind of undisclosed
 *       new authority the checkpoint prohibits.
 *     - core/modules/entitlement/entitlement-engine.js is a real,
 *       separate authority keyed by IdentityEngine.checkPermission()
 *       (platform-app/feature entitlement) — a different identity/
 *       authorization model than the OrganizationRegistry-backed
 *       membership system this workspace is built on. Merging them is
 *       real design work, not a two-line composition, and is not done
 *       here.
 *   Sections BUSINESS, INTELLIGENCE, and ADMINISTRATIVE_REQUESTS are
 *   still rendered (so an authorized org admin sees they exist and are
 *   authorized for their organization — organization-workspace-core.js
 *   already computed that correctly) with an honest "not yet wired"
 *   notice, rather than either hiding them (which would misrepresent
 *   what organization-workspace-core.js authorized) or fabricating
 *   business data (which the checkpoint explicitly forbids: "do not
 *   invent data").
 *   ENTITLEMENTS section shows the real, raw permissions array
 *   POST /organizations/context already returned — no client
 *   entitlement calculation is performed.
 *   APPLICATIONS section's function catalog (KNOWN_APPLICATION_FUNCTIONS
 *   below) is a small, disclosed, hardcoded list for the one
 *   application (MpesaOS) the checkpoint's own examples name — not a
 *   platform-wide application/feature registry, which does not yet
 *   exist as a queryable server route this file could compose instead.
 */
(function () {
    'use strict';
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};

    const VERSION = '1.0.0';

    // ------------------------------------------------------------------
    // Pure decision helpers - no DOM, no fetch. Node-testable directly.
    // ------------------------------------------------------------------

    /**
     * Picks the organization to load on first mount: the first ACTIVE
     * entry of GET /webauthn/session's own `organizations` array (the
     * same array admin-gate-core.js already trusts for ORGANIZATION/
     * WORKER tier). Returns null when there is nothing active to show -
     * callers must render a safe empty state, never guess.
     */
    function selectDefaultOrganization(sessionOrganizations) {
        const list = Array.isArray(sessionOrganizations) ? sessionOrganizations : [];
        const active = list.filter((o) => o && o.status === 'active');
        return active.length > 0 ? active[0] : null;
    }

    /**
     * Client-side PRE-CHECK for a requested switch target, using the
     * already-fetched session organizations list (never itself
     * authority - see organization-workspace-core.js's
     * canAttemptOrganizationSwitch(), which this composes).
     */
    function planSwitch(currentOrganizationId, targetMembership) {
        if (!targetMembership || typeof targetMembership !== 'object') {
            return { allowed: false, reason: 'invalid_target' };
        }
        const core = window.CozyOS && window.CozyOS.OrganizationWorkspaceCore;
        if (!core || typeof core.canAttemptOrganizationSwitch !== 'function') {
            return { allowed: false, reason: 'workspace_core_unavailable' };
        }
        if (!core.canAttemptOrganizationSwitch(targetMembership)) {
            return { allowed: false, reason: 'membership_not_active' };
        }
        if (targetMembership.organizationId === currentOrganizationId) {
            return { allowed: false, reason: 'already_active' };
        }
        return { allowed: true, reason: 'pre_check_passed' };
    }

    /**
     * Turns a raw POST /organizations/context HTTP response into a
     * verified/denied verdict. httpStatus !== 200 or a missing/false
     * `ok` field fails closed - never treated as an implicit grant, and
     * never partially trusted (e.g. a 403 body that happens to also
     * carry stray fields is still treated as fully denied).
     */
    function interpretContextResponse(httpStatus, body) {
        if (httpStatus !== 200 || !body || typeof body !== 'object' || body.ok !== true) {
            const reason = (body && typeof body === 'object' && body.error) ? body.error : 'context_request_failed';
            return { ok: false, context: null, reason };
        }
        return { ok: true, context: body, reason: 'verified' };
    }

    // Disclosed, hardcoded function catalog for the APPLICATIONS section
    // - see file header "DISCLOSED LIMITATION". Not a permission source
    // (organization-workspace-core.js's isFunctionEnabled() against the
    // real context.permissions array is still what decides ENABLED/
    // DENIED for each function listed here) - only which function names
    // to ask about for a given application.
    const KNOWN_APPLICATION_FUNCTIONS = Object.freeze({
        MpesaOS: Object.freeze(['Transactions', 'Receipts', 'Reports', 'Float', 'Till', 'Paybill']),
    });

    function resolveFunctionsForApplication(applicationId) {
        const known = KNOWN_APPLICATION_FUNCTIONS[applicationId];
        return known ? known.slice() : [];
    }

    // ------------------------------------------------------------------
    // DOM controller
    // ------------------------------------------------------------------

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    class OrganizationWorkspace {
        #fetchImpl = null;
        #root = null;
        #activeRequestToken = null;
        #state = { sessionOrganizations: [], activeOrganizationId: null, context: null, members: null, error: null };

        constructor({ fetchImpl } = {}) {
            this.#fetchImpl = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(typeof window !== 'undefined' ? window : undefined) : null);
        }

        async #fetchSessionOrganizations() {
            const res = await this.#fetchImpl('/webauthn/session', { credentials: 'include' });
            const body = await res.json().catch(() => ({}));
            if (res.status !== 200 || body.authenticated !== true) return [];
            return Array.isArray(body.organizations) ? body.organizations : [];
        }

        async #fetchContext(organizationId) {
            const res = await this.#fetchImpl('/organizations/context', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ organizationId }),
            });
            const body = await res.json().catch(() => ({}));
            return interpretContextResponse(res.status, body);
        }

        async #fetchMembersIfAuthorized(organizationId, presentation) {
            if (!presentation.workforce.canView) return null;
            try {
                const res = await this.#fetchImpl('/organizations/members/list', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ organizationId, status: 'active' }),
                });
                const body = await res.json().catch(() => ({}));
                if (res.status !== 200 || !Array.isArray(body.members)) return null;
                return body.members;
            } catch (_err) {
                return null;
            }
        }

        async mount() {
            if (!this.#fetchImpl) return { success: false, reason: 'fetch_unavailable' };
            if (typeof document === 'undefined') return { success: false, reason: 'dom_unavailable' };
            this.#ensureRoot();
            this.#renderStatus('Loading your organizations…');

            const sessionOrganizations = await this.#fetchSessionOrganizations();
            this.#state.sessionOrganizations = sessionOrganizations;

            const initial = selectDefaultOrganization(sessionOrganizations);
            if (!initial) {
                this.#renderEmpty('No active organization membership was found for this session.');
                return { success: true, reason: 'no_active_organization' };
            }

            return this.switchTo(initial.organizationId);
        }

        async switchTo(organizationId) {
            const target = this.#state.sessionOrganizations.find((o) => o && o.organizationId === organizationId);
            if (!target) {
                this.#renderStatus('That organization is not part of your authenticated session.');
                return { success: false, reason: 'not_in_session' };
            }
            const plan = planSwitch(this.#state.activeOrganizationId, target);
            if (!plan.allowed && plan.reason === 'membership_not_active') {
                this.#renderStatus('That organization membership is no longer active.');
                return { success: false, reason: plan.reason };
            }
            if (!plan.allowed && plan.reason === 'already_active') {
                return { success: true, reason: 'already_active' };
            }

            // 1. prevent stale actions: any in-flight switch that resolves
            // after a newer one has started is dropped, never rendered.
            const requestToken = Symbol('switch');
            this.#activeRequestToken = requestToken;

            // 2/3. clear stale organization-specific state + rendered
            // data BEFORE the new request resolves, so a slow or failed
            // request can never leave a mixed old+new render on screen.
            this.#state.context = null;
            this.#state.members = null;
            this.#renderStatus('Loading organization…');

            const result = await this.#fetchContext(organizationId);
            if (this.#activeRequestToken !== requestToken) {
                return { success: false, reason: 'superseded' };
            }

            if (!result.ok) {
                // Failed validation: retain no unauthorized data, return
                // to a safe state - never render the failed org's data,
                // and never keep the previous org's data either.
                this.#state.activeOrganizationId = null;
                this.#state.context = null;
                this.#state.members = null;
                this.#renderStatus('Could not verify access to that organization (' + result.reason + ').');
                return { success: false, reason: result.reason };
            }

            const core = window.CozyOS.OrganizationWorkspaceCore;
            const presentation = core.resolveWorkspacePresentation(result.context);
            const members = await this.#fetchMembersIfAuthorized(organizationId, presentation);
            if (this.#activeRequestToken !== requestToken) {
                return { success: false, reason: 'superseded' };
            }

            this.#state.activeOrganizationId = organizationId;
            this.#state.context = result.context;
            this.#state.members = members;
            this.#render(presentation);
            return { success: true };
        }

        // ---------------- rendering ----------------

        #ensureRoot() {
            let root = document.getElementById('cozy-org-workspace-root');
            if (!root) {
                root = document.createElement('div');
                root.id = 'cozy-org-workspace-root';
                document.body.innerHTML = '';
                document.body.appendChild(root);
            }
            this.#root = root;
        }

        #renderStatus(message) {
            if (!this.#root) return;
            this.#root.innerHTML =
                '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;' +
                'background:#011c15;color:#9fd6ae;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;">' +
                '<p>' + escapeHtml(message) + '</p></div>';
        }

        #renderEmpty(message) {
            if (!this.#root) return;
            this.#root.innerHTML =
                '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;' +
                'background:#011c15;color:#eaf5ee;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;text-align:center;padding:24px;">' +
                '<div><h2 style="margin:0 0 8px 0;">No Organization Access</h2><p style="color:#94a3b8;font-size:13px;">' +
                escapeHtml(message) + '</p><a href="index.html" style="color:#81C784;">Return to CozyOS</a></div></div>';
        }

        #render(presentation) {
            if (!this.#root) return;
            const ctx = this.#state.context;
            const sections = presentation.sections;

            const switcherHtml = this.#state.sessionOrganizations.map((o) => {
                const isActive = o.organizationId === this.#state.activeOrganizationId;
                return '<button data-cozy-org-switch="' + escapeHtml(o.organizationId) + '" ' +
                    'style="display:block;width:100%;text-align:left;padding:8px 12px;margin-bottom:4px;border:none;border-radius:6px;cursor:pointer;' +
                    'background:' + (isActive ? '#0f3d2c' : 'transparent') + ';color:' + (isActive ? '#fff' : '#9fd6ae') + ';">' +
                    escapeHtml(o.name || o.organizationId) + '</button>';
            }).join('');

            const navHtml = sections.map((s) =>
                '<button data-cozy-org-section="' + s + '" style="padding:6px 10px;margin-right:6px;margin-bottom:6px;border:1px solid #0f3d2c;border-radius:6px;background:transparent;color:#eaf5ee;cursor:pointer;">' + s + '</button>'
            ).join('');

            this.#root.innerHTML =
                '<div style="min-height:100vh;background:#011c15;color:#eaf5ee;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;display:flex;">' +
                '<nav style="width:220px;padding:16px;border-right:1px solid #0f3d2c;">' +
                '<div style="font-size:12px;color:#94a3b8;margin-bottom:8px;">ORGANIZATIONS</div>' +
                switcherHtml +
                '</nav>' +
                '<main style="flex:1;padding:16px;">' +
                '<h1 style="margin:0 0 4px 0;font-size:20px;">' + escapeHtml(presentation.organizationName) + '</h1>' +
                '<p style="margin:0 0 16px 0;color:#94a3b8;font-size:13px;">' + (presentation.isOrgAdmin ? 'Organization Administrator' : 'Worker') + '</p>' +
                '<div id="cozy-org-section-nav" style="margin-bottom:16px;">' + navHtml + '</div>' +
                '<div id="cozy-org-section-content"></div>' +
                '</main></div>';

            this.#root.querySelectorAll('[data-cozy-org-switch]').forEach((btn) => {
                btn.addEventListener('click', () => this.switchTo(btn.getAttribute('data-cozy-org-switch')));
            });

            const contentEl = this.#root.querySelector('#cozy-org-section-content');
            const renderSection = (sectionKey) => { contentEl.innerHTML = this.#renderSectionContent(sectionKey, presentation, ctx); };
            this.#root.querySelectorAll('[data-cozy-org-section]').forEach((btn) => {
                btn.addEventListener('click', () => renderSection(btn.getAttribute('data-cozy-org-section')));
            });

            // An org admin lands on the first authorized section. Never
            // defaults to a section the presentation didn't authorize.
            if (sections.length > 0) {
                renderSection(sections[0]);
            } else {
                contentEl.innerHTML = '<p style="color:#94a3b8;font-size:13px;">Your assigned applications:</p>' + this.#renderApplicationsSection(presentation, ctx);
            }
        }

        #renderSectionContent(sectionKey, presentation, ctx) {
            const core = window.CozyOS.OrganizationWorkspaceCore;
            switch (sectionKey) {
                case core.SECTION.WORKFORCE:
                    return this.#renderWorkforceSection(presentation);
                case core.SECTION.APPLICATIONS:
                    return this.#renderApplicationsSection(presentation, ctx);
                case core.SECTION.ENTITLEMENTS:
                    return this.#renderEntitlementsSection(ctx);
                case core.SECTION.BUSINESS:
                case core.SECTION.INTELLIGENCE:
                case core.SECTION.ADMINISTRATIVE_REQUESTS:
                    return '<p style="color:#94a3b8;font-size:13px;">' + escapeHtml(sectionKey) +
                        ' is authorized for this organization. Its real data wiring is not part of this milestone - see this file\'s header.</p>';
                default:
                    return '';
            }
        }

        #renderWorkforceSection(presentation) {
            if (!presentation.workforce.canView) return '<p style="color:#94a3b8;font-size:13px;">Not authorized.</p>';
            const members = this.#state.members;
            if (!Array.isArray(members)) return '<p style="color:#94a3b8;font-size:13px;">Workforce roster unavailable.</p>';
            const rows = members.map((m) =>
                '<li>' + escapeHtml(m.userId) + ' — ' + escapeHtml((m.roles || []).join(', ') || 'no role') + '</li>'
            ).join('');
            return '<ul style="font-size:13px;color:#eaf5ee;">' + rows + '</ul>';
        }

        #renderApplicationsSection(presentation, ctx) {
            const core = window.CozyOS.OrganizationWorkspaceCore;
            const apps = presentation.applicationControls.assignedApplications;
            if (apps.length === 0) return '<p style="color:#94a3b8;font-size:13px;">No applications assigned.</p>';
            return apps.map((appId) => {
                const fns = resolveFunctionsForApplication(appId).map((fnId) => {
                    const enabled = core.isFunctionEnabled(ctx, appId, fnId);
                    return '<li style="color:' + (enabled ? '#eaf5ee' : '#5a6b63') + ';">' + escapeHtml(fnId) + ' — ' + (enabled ? 'ENABLED' : 'DENIED') + '</li>';
                }).join('');
                return '<div style="margin-bottom:12px;"><strong>' + escapeHtml(appId) + '</strong><ul style="font-size:13px;">' + fns + '</ul></div>';
            }).join('');
        }

        #renderEntitlementsSection(ctx) {
            const perms = Array.isArray(ctx.permissions) ? ctx.permissions : [];
            if (perms.length === 0) return '<p style="color:#94a3b8;font-size:13px;">No explicit permission entries for this membership.</p>';
            const rows = perms.map((p) => '<li>' + escapeHtml(p.name) + ' — ' + escapeHtml(p.effect) + '</li>').join('');
            return '<ul style="font-size:13px;">' + rows + '</ul>';
        }
    }

    function mount(options) {
        const instance = new OrganizationWorkspace(options);
        window.CozyOS.__organizationWorkspaceInstance = instance;
        return instance.mount();
    }

    window.CozyOS.OrganizationWorkspace = Object.freeze({
        mount,
        OrganizationWorkspace,
        selectDefaultOrganization,
        planSwitch,
        interpretContextResponse,
        resolveFunctionsForApplication,
        version: VERSION,
    });
    window.CozyOS.Modules['organization-workspace'] = Object.freeze({
        version: VERSION,
        description: 'DOM/controller for the organization workspace + organization switcher. Composes organization-workspace-core.js for presentation decisions and POST /organizations/context / GET /webauthn/session / POST /organizations/members/list for real server data. Never itself an authorization authority.',
    });
})();
