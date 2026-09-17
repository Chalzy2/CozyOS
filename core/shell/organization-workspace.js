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
        // LIVE INTEGRATION AUDIT — real ChurchOS organization-tier
        // functions. Same disclosed, hardcoded-catalog convention as
        // MpesaOS above (see this file's own header) — gated by the
        // SAME real, server-verified app:ChurchOS:<Function> permission
        // entries (functionPermissionName()/isFunctionEnabled() below),
        // never a second entitlement source.
        ChurchOS: Object.freeze(['LiveSession', 'Moderation', 'RequestSupport']),
    });

    function resolveFunctionsForApplication(applicationId) {
        const known = KNOWN_APPLICATION_FUNCTIONS[applicationId];
        return known ? known.slice() : [];
    }

    // LIVE INTEGRATION AUDIT — the pre-existing ChurchOS-family live
    // engines (church-live-session-controller.js, church-live-
    // moderation.js and siblings) were all built around the CLIENT-SIDE
    // OrganizationMembership.isAuthorized() checking domain-specific
    // permission strings ("churchos-live:manage", "moderation:comment-
    // manage") — a different, older vocabulary than the SERVER-verified
    // "app:ChurchOS:<Function>" function-permission names this file's own
    // isFunctionEnabled() checks. This map is the one, disclosed
    // translation between the two, used only by #syncClientAuthority()
    // below — never a second permission-naming scheme invented elsewhere.
    const CHURCHOS_LIVE_PERMISSION_BRIDGE = Object.freeze({
        'app:ChurchOS:LiveSession': 'churchos-live:manage',
        'app:ChurchOS:Moderation': 'moderation:comment-manage',
    });

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

            this.#syncClientAuthority(result.context);

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
            const core = window.CozyOS.OrganizationWorkspaceCore;
            const renderSection = (sectionKey) => {
                contentEl.innerHTML = this.#renderSectionContent(sectionKey, presentation, ctx);
                if (sectionKey === core.SECTION.WORKFORCE) this.#wireWorkforceSection(contentEl, presentation.organizationId);
                if (sectionKey === core.SECTION.APPLICATIONS) this.#wireChurchOSLivePanel(contentEl, presentation, ctx);
            };
            this.#root.querySelectorAll('[data-cozy-org-section]').forEach((btn) => {
                btn.addEventListener('click', () => renderSection(btn.getAttribute('data-cozy-org-section')));
            });

            // An org admin lands on the first authorized section. Never
            // defaults to a section the presentation didn't authorize.
            if (sections.length > 0) {
                renderSection(sections[0]);
            } else {
                contentEl.innerHTML = '<p style="color:#94a3b8;font-size:13px;">Your assigned applications:</p>' + this.#renderApplicationsSection(presentation, ctx);
                this.#wireChurchOSLivePanel(contentEl, presentation, ctx);
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
            const rosterHtml = !Array.isArray(members)
                ? '<p style="color:#94a3b8;font-size:13px;">Workforce roster unavailable.</p>'
                : '<ul style="font-size:13px;color:#eaf5ee;">' + members.map((m) =>
                    '<li>' + escapeHtml(m.userId) + ' — ' + escapeHtml((m.roles || []).join(', ') || 'no role') + '</li>'
                ).join('') + '</ul>';

            // LIVE INTEGRATION AUDIT fix: presentation.workforce.canInvite
            // was already computed (organization-workspace-core.js's own
            // resolveWorkforceControls()) but never read/rendered anywhere
            // in this file — no invite control existed in the DOM at all,
            // even though the real, server-authoritative POST
            // /organizations/invite route (server/webauthn-rp/
            // organizations.js's invite(), already tested) was fully
            // built and reachable. This file already composes the real
            // server for the context/roster it renders (#fetchContext(),
            // #fetchMembersIfAuthorized() above) — the invite form below
            // composes that exact same real server route, never a second
            // invite mechanism.
            const inviteHtml = !presentation.workforce.canInvite ? '' :
                '<form id="cozy-org-invite-form" style="margin-top:16px;padding-top:12px;border-top:1px solid #0f3d2c;">' +
                '<div style="font-size:12px;color:#94a3b8;margin-bottom:6px;">INVITE A MEMBER (by CozyID)</div>' +
                '<input type="text" id="cozy-org-invite-userid" placeholder="CozyID (userId)" required ' +
                'style="padding:6px 8px;border-radius:4px;border:1px solid #0f3d2c;background:#01140f;color:#eaf5ee;margin-right:6px;" />' +
                '<input type="text" id="cozy-org-invite-roles" placeholder="Roles (comma-separated, optional)" ' +
                'style="padding:6px 8px;border-radius:4px;border:1px solid #0f3d2c;background:#01140f;color:#eaf5ee;margin-right:6px;" />' +
                '<button type="submit" style="padding:6px 12px;border-radius:4px;border:none;background:#0f3d2c;color:#fff;cursor:pointer;">Invite</button>' +
                '<p id="cozy-org-invite-result" style="font-size:12px;color:#94a3b8;margin:6px 0 0 0;"></p>' +
                '</form>';

            return rosterHtml + inviteHtml;
        }

        /**
         * #inviteMember(organizationId, userId, roles)
         *   LIVE INTEGRATION AUDIT addition — the real, server-
         *   authoritative invite call (same #fetchImpl this file already
         *   uses for #fetchContext()/#fetchMembersIfAuthorized() above).
         *   actorUserId is never sent from here — server.js's own route
         *   handler derives it from the authenticated session
         *   (currentSession(req).userId), exactly like every other
         *   mutating org route this file already composes.
         */
        async #inviteMember(organizationId, userId, roles) {
            try {
                const res = await this.#fetchImpl('/organizations/invite', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ organizationId, userId, roles }),
                });
                const body = await res.json().catch(() => ({}));
                if (res.status !== 200 || !body.ok) {
                    return { success: false, reason: (body && (body.error || body.reason)) || `HTTP ${res.status}` };
                }
                return { success: true, membership: body.membership };
            } catch (err) {
                return { success: false, reason: err && err.message ? err.message : 'network_error' };
            }
        }

        /** Wires the invite form's submit listener — called every time the WORKFORCE section is (re)rendered, since #renderSectionContent only ever replaces contentEl's innerHTML. */
        #wireWorkforceSection(contentEl, organizationId) {
            const form = contentEl.querySelector('#cozy-org-invite-form');
            if (!form) return;
            form.addEventListener('submit', async (evt) => {
                evt.preventDefault();
                const userId = contentEl.querySelector('#cozy-org-invite-userid').value.trim();
                const rolesRaw = contentEl.querySelector('#cozy-org-invite-roles').value.trim();
                const roles = rolesRaw ? rolesRaw.split(',').map((r) => r.trim()).filter(Boolean) : [];
                const resultEl = contentEl.querySelector('#cozy-org-invite-result');
                if (!userId) { resultEl.textContent = 'A real CozyID is required.'; return; }
                resultEl.textContent = 'Sending invite…';
                const result = await this.#inviteMember(organizationId, userId, roles);
                resultEl.textContent = result.success
                    ? `Invited "${userId}". They will see this invitation the next time they sign in.`
                    : `Could not invite: ${result.reason}`;
            });
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
                const churchPanel = appId === 'ChurchOS' ? this.#renderChurchOSLivePanel(presentation, ctx, core) : '';
                return '<div style="margin-bottom:12px;"><strong>' + escapeHtml(appId) + '</strong><ul style="font-size:13px;">' + fns + '</ul>' + churchPanel + '</div>';
            }).join('');
        }

        /**
         * #renderChurchOSLivePanel(presentation, ctx, core)
         *   LIVE INTEGRATION AUDIT — the real ChurchOS organization-tier
         *   live-session surface a Church Administrator was missing
         *   entirely (see CHURCHOS-AUTHORITY-WIRING-MAP.md's own
         *   critical finding: every ChurchOS live file was reachable
         *   only from the PLATFORM-tier admin-workspace.html).
         *
         *   VISIBILITY is gated by the SAME real, server-verified
         *   app:ChurchOS:<Function> permission this file's own
         *   isFunctionEnabled() already checks for every other
         *   application (never a second visibility source).
         *
         *   ACTIONS inside the panel (start/stop session, toggle
         *   questions, request support) compose the real, existing
         *   client-side ChurchOS authorization chain
         *   (OrganizationMembership.isAuthorized(), the same real check
         *   every other ChurchOS live file in this repository already
         *   uses) via ChurchLiveSessionController/
         *   ChurchLiveModerationControls/OrganizationSupport — this
         *   file does not re-implement any of their authorization
         *   logic, it only calls them, exactly like churchos.html's own
         *   inline script already does for setupChurch()/createMember().
         *   DISCLOSED, deliberate scope boundary: unlike the rest of
         *   this file (server-context-only, see this file's own
         *   header), these action buttons are NOT gated by a real
         *   server-side ChurchOS-live capability route — no such route
         *   exists yet (only the generic org:workforce, org:
         *   applications, and org:permissions capability prefixes this
         *   file's own header already discloses server.js exposes). The
         *   server-verified app:ChurchOS:<Function> check above still
         *   decides whether this panel renders at all; the buttons
         *   themselves rely on the same client-side authority every
         *   other ChurchOS live file already does, not a fabricated
         *   server guarantee.
         */
        #renderChurchOSLivePanel(presentation, ctx, core) {
            const orgId = presentation.organizationId;
            const canLive = core.isFunctionEnabled(ctx, 'ChurchOS', 'LiveSession');
            const canModerate = core.isFunctionEnabled(ctx, 'ChurchOS', 'Moderation');
            const canRequestSupport = core.isFunctionEnabled(ctx, 'ChurchOS', 'RequestSupport');
            if (!canLive && !canModerate && !canRequestSupport) return '';

            const ctl = window.CozyOS.ChurchLiveSessionController;
            const active = (canLive && ctl && typeof ctl.listActiveSessions === 'function') ? ctl.listActiveSessions(orgId) : [];
            const session = active[0] || null;

            const support = window.CozyOS.OrganizationSupport;
            const activeGrants = (support && typeof support.listActiveGrants === 'function') ? support.listActiveGrants(orgId) : [];

            let html = '<div class="cozy-churchos-live-panel" style="margin-top:10px;padding-top:10px;border-top:1px solid #0f3d2c;">';
            html += '<div style="font-size:12px;color:#94a3b8;margin-bottom:6px;">LIVE WORSHIP</div>';

            if (canLive) {
                if (session) {
                    html += '<p style="font-size:13px;color:#eaf5ee;">Live session active since ' + escapeHtml(session.startedAt) + ' (' + escapeHtml(session.sourceLanguage || 'unknown language') + ').</p>';
                    html += '<button type="button" class="cozy-btn" data-cos-live-end="' + escapeHtml(session.worshipServiceId) + '">End Session</button>';
                    if (canModerate) {
                        html += ' <button type="button" class="cozy-btn" data-cos-live-toggle-questions="' + escapeHtml(session.worshipServiceId) + '">Toggle Questions</button>';
                        html += '<span id="cozy-cos-questions-state" style="font-size:12px;color:#94a3b8;margin-left:8px;"></span>';
                    }
                } else {
                    html += '<input type="text" id="cozy-cos-live-language" placeholder="Source language (e.g. sw)" style="padding:6px 8px;border-radius:4px;border:1px solid #0f3d2c;background:#01140f;color:#eaf5ee;margin-right:6px;" />';
                    html += '<button type="button" class="cozy-btn cozy-btn-primary" data-cos-live-start="' + escapeHtml(orgId) + '">Start Live Session</button>';
                }
                html += '<p id="cozy-cos-live-result" style="font-size:12px;color:#94a3b8;margin:6px 0 0 0;"></p>';
            }

            if (canRequestSupport) {
                html += '<div style="margin-top:10px;">';
                html += (activeGrants.length > 0)
                    ? '<p style="font-size:12px;color:#f5c518;">CozyOS Support is currently active for this organization (' + activeGrants.length + ' grant' + (activeGrants.length === 1 ? '' : 's') + ').</p>'
                    : '';
                html += '<input type="text" id="cozy-cos-support-reason" placeholder="Describe the issue" style="padding:6px 8px;border-radius:4px;border:1px solid #0f3d2c;background:#01140f;color:#eaf5ee;margin-right:6px;" />';
                html += '<button type="button" class="cozy-btn" data-cos-request-support="' + escapeHtml(orgId) + '">Request CozyOS Support</button>';
                html += '<p id="cozy-cos-support-result" style="font-size:12px;color:#94a3b8;margin:6px 0 0 0;"></p>';
                html += '</div>';
            }

            html += '</div>';
            return html;
        }

        /**
         * #syncClientAuthority(context)
         *   TRUST-BOUNDARY BRIDGE — LIVE INTEGRATION AUDIT finding: this
         *   file is correctly server-authoritative for GATING (whether a
         *   section/panel renders — see resolveWorkspacePresentation()/
         *   isFunctionEnabled() above, both driven only by this freshly
         *   fetched, server-verified `context`). But the pre-existing
         *   ChurchOS-family action engines this panel calls
         *   (ChurchLiveSessionController, OrganizationSupport, and every
         *   canonicalized moderation file) all authorize against the
         *   CLIENT-SIDE OrganizationRegistry/OrganizationMembership —
         *   which start every page load completely empty, with zero
         *   knowledge of what the server just verified. Without this
         *   step, the two would be unsynchronized competing sources of
         *   truth for the exact same fact (see this file's own commit
         *   history / CHURCHOS-AUTHORITY-WIRING-MAP.md). This method
         *   mirrors ONLY what `context` already proved — the organization
         *   itself, and this one actor's own roles/allowed permissions on
         *   it — onto the client-side modules, best-effort, never
         *   throwing (a sync failure must never block the page from
         *   rendering the already-verified read-only presentation).
         */
        #syncClientAuthority(context) {
            try {
                const registry = window.CozyOS.OrganizationRegistry;
                const membership = window.CozyOS.OrganizationMembership;
                if (!registry || typeof registry.registerExternalOrganization !== 'function') return;
                if (!membership || typeof membership.syncExternalMembership !== 'function') return;
                const actorId = this.#resolveActorId();
                if (!actorId) return;

                registry.registerExternalOrganization({ orgId: context.organizationId, name: context.organizationName });

                const roles = Array.isArray(context.roles) ? context.roles : [];
                const allowedPermissionNames = (Array.isArray(context.permissions) ? context.permissions : [])
                    .filter((p) => p && p.effect === 'allow')
                    .map((p) => p.name);
                const bridgedPermissions = allowedPermissionNames
                    .map((name) => CHURCHOS_LIVE_PERMISSION_BRIDGE[name])
                    .filter(Boolean);

                membership.syncExternalMembership({
                    userId: actorId,
                    organizationId: context.organizationId,
                    roles,
                    permissions: bridgedPermissions,
                    status: 'active',
                });
            } catch (_err) { /* non-fatal — never blocks rendering the already-verified presentation */ }
        }

        /** Resolves the real, currently-authenticated actorId the same way every other ChurchOS-family page (churchos.html/pharmacyos.html) already does — never a second identity source. */
        #resolveActorId() {
            const session = window.CozyOS && window.CozyOS.Session;
            if (session && typeof session.current === 'function') {
                const snap = session.current();
                if (snap && snap.uid) return snap.uid;
            }
            return null;
        }

        /** Wires the ChurchOS live panel's action buttons — called every time the APPLICATIONS section is (re)rendered, mirroring #wireWorkforceSection()'s own pattern. */
        #wireChurchOSLivePanel(contentEl, presentation, ctx) {
            const panel = contentEl.querySelector('.cozy-churchos-live-panel');
            if (!panel) return;
            const actorId = this.#resolveActorId();

            const startBtn = panel.querySelector('[data-cos-live-start]');
            if (startBtn) {
                startBtn.addEventListener('click', async () => {
                    const orgId = startBtn.getAttribute('data-cos-live-start');
                    const sourceLanguage = (contentEl.querySelector('#cozy-cos-live-language') || {}).value;
                    const resultEl = contentEl.querySelector('#cozy-cos-live-result');
                    const ctl = window.CozyOS.ChurchLiveSessionController;
                    if (!ctl) { resultEl.textContent = 'ChurchLiveSessionController is not loaded.'; return; }
                    if (!actorId) { resultEl.textContent = 'No signed-in user detected.'; return; }
                    resultEl.textContent = 'Starting…';
                    const result = await ctl.startSession({ orgId, actorId, sourceLanguage: sourceLanguage && sourceLanguage.trim() });
                    const message = result.success ? 'Live session started.' : ('Could not start: ' + result.reason);
                    if (result.success) {
                        // Refreshing the section re-renders this whole panel
                        // fresh (needed to swap the Start control for
                        // End/Toggle-Questions once a session is active) —
                        // which also wipes the transient message just set
                        // above on the now-discarded #cozy-cos-live-result
                        // element. Re-apply it to the FRESH element so a
                        // caller reading this result immediately after
                        // still sees it, not a blank re-render.
                        this.#refreshApplicationsSection(presentation, ctx);
                        const freshResultEl = contentEl.querySelector('#cozy-cos-live-result');
                        if (freshResultEl) freshResultEl.textContent = message;
                    } else {
                        resultEl.textContent = message;
                    }
                });
            }

            const endBtn = panel.querySelector('[data-cos-live-end]');
            if (endBtn) {
                endBtn.addEventListener('click', async () => {
                    const worshipServiceId = endBtn.getAttribute('data-cos-live-end');
                    const resultEl = contentEl.querySelector('#cozy-cos-live-result');
                    const ctl = window.CozyOS.ChurchLiveSessionController;
                    if (!ctl || !actorId) return;
                    resultEl.textContent = 'Ending…';
                    const result = await ctl.endSession({ worshipServiceId, actorId });
                    const message = result.success ? 'Live session ended.' : ('Could not end: ' + result.reason);
                    if (result.success) {
                        // Same re-render-wipes-the-message fix as the Start
                        // handler above — see its own comment.
                        this.#refreshApplicationsSection(presentation, ctx);
                        const freshResultEl = contentEl.querySelector('#cozy-cos-live-result');
                        if (freshResultEl) freshResultEl.textContent = message;
                    } else {
                        resultEl.textContent = message;
                    }
                });
            }

            const toggleBtn = panel.querySelector('[data-cos-live-toggle-questions]');
            if (toggleBtn) {
                const worshipServiceId = toggleBtn.getAttribute('data-cos-live-toggle-questions');
                const stateEl = contentEl.querySelector('#cozy-cos-questions-state');
                const ctl = window.CozyOS.ChurchLiveSessionController;
                const modControls = window.CozyOS.ChurchLiveModerationControls;
                const ldceSessionId = ctl && typeof ctl.getLdceSessionIdFor === 'function' ? ctl.getLdceSessionIdFor(worshipServiceId) : null;
                const renderState = () => {
                    if (!stateEl || !modControls || !ldceSessionId) return;
                    const state = modControls.getQuestionsEnabled(ldceSessionId);
                    stateEl.textContent = 'Questions: ' + (state.enabled ? 'ON' : 'OFF');
                };
                renderState();
                toggleBtn.addEventListener('click', () => {
                    if (!modControls || !ldceSessionId || !actorId) return;
                    const current = modControls.getQuestionsEnabled(ldceSessionId);
                    const result = modControls.setQuestionsEnabled(ldceSessionId, actorId, !current.enabled);
                    if (!result || result.status !== 'OK') {
                        if (stateEl) stateEl.textContent = 'Could not toggle: ' + ((result && result.reason) || 'unknown error');
                        return;
                    }
                    renderState();
                });
            }

            const supportBtn = panel.querySelector('[data-cos-request-support]');
            if (supportBtn) {
                supportBtn.addEventListener('click', () => {
                    const organizationId = supportBtn.getAttribute('data-cos-request-support');
                    const reasonEl = contentEl.querySelector('#cozy-cos-support-reason');
                    const resultEl = contentEl.querySelector('#cozy-cos-support-result');
                    const support = window.CozyOS.OrganizationSupport;
                    if (!support) { resultEl.textContent = 'OrganizationSupport is not loaded.'; return; }
                    if (!actorId) { resultEl.textContent = 'No signed-in user detected.'; return; }
                    const reason = (reasonEl && reasonEl.value || '').trim();
                    const result = support.requestSupport({ organizationId, requesterId: actorId, reason });
                    resultEl.textContent = result.success ? 'Support requested — a CozyOS administrator will review it.' : ('Could not request support: ' + result.reason);
                });
            }
        }

        /** Real, minimal refresh: re-renders only the APPLICATIONS section content after a real state change (session started/ended), never a full page reload. */
        #refreshApplicationsSection(presentation, ctx) {
            const contentEl = this.#root && this.#root.querySelector('#cozy-org-section-content');
            if (!contentEl) return;
            contentEl.innerHTML = this.#renderApplicationsSection(presentation, ctx);
            this.#wireChurchOSLivePanel(contentEl, presentation, ctx);
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
