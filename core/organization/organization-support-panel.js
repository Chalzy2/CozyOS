/**
 * CozyOS — Organization Support Panel (PLATFORM-tier UI)
 * File Reference: core/organization/organization-support-panel.js
 *
 * LIVE INTEGRATION AUDIT — the CozyOS Platform Support capability
 * (core/organization/organization-support.js) had a real, working,
 * fully-tested authority engine with no UI anywhere for a real CozyOS
 * platform administrator to actually see a pending support request or
 * grant one. This file is that UI ONLY — it creates no new authority,
 * no new state, and no new permission model. Every action here composes
 * the existing, real methods on window.CozyOS.OrganizationSupport
 * exactly as already tested; this file only renders them and wires real
 * DOM events to real method calls.
 *
 * OWNERSHIP — composes existing engines only:
 *   - core/organization/organization-support.js — requestSupport()/
 *     grantSupport()/isSupportActive()/revokeSupport()/
 *     listPendingRequests()/listAllActiveGrants() (this file's own
 *     small addition, same "never org-filtered" reasoning
 *     listPendingRequests() already documents — a platform admin
 *     triaging support needs to see every organization's requests/
 *     grants, not one at a time).
 *   - core/organization/organization-registry.js — getOrganization(),
 *     read-only, only to show a human-readable organization name next
 *     to each request/grant instead of a bare id.
 *   - core/modules/identity/identity-engine.js — isPlatformAdmin() — the
 *     one real platform-authority primitive this codebase already has.
 *     This panel renders NOTHING for anyone it is not true for; a
 *     missing/failed check renders an empty panel, never a fallback
 *     "assume admin" state.
 *
 * ACTOR RESOLUTION — same window.CozyOS.Session.current().uid pattern
 * already established by churchos.html/pharmacyos.html and
 * organization-workspace.js's own #resolveActorId() — never a second
 * identity source.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.OrganizationSupportPanel) return;

    const VERSION = "1.0.0";

    // Disclosed, hardcoded catalog of the real scope strings this
    // repository's own support-gated call sites already check (see
    // church-live-moderation.js/church-live-moderation-controls.js/
    // church-attendance-geography.js/church-offering-interaction.js/
    // church-prayer-interaction.js's own requiredScope literals) — not a
    // second scope registry, only which checkboxes to offer an operator
    // granting support. grantSupport() itself never validates scope
    // names against this list; it stores whatever real, non-empty array
    // it is given.
    const KNOWN_SCOPES = Object.freeze([
        "moderate-live-session",
        "view-attendance-analytics",
        "view-offerings",
        "moderate-prayer-requests",
    ]);

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function resolveActorId() {
        const session = window.CozyOS && window.CozyOS.Session;
        if (session && typeof session.current === "function") {
            const snap = session.current();
            if (snap && snap.uid) return snap.uid;
        }
        return null;
    }

    class OrganizationSupportPanel {
        #root = null;
        #actorId = null;

        getVersion() { return VERSION; }

        #ensureRoot() {
            let el = document.getElementById("cozy-support-inbox-root");
            if (!el) {
                el = document.createElement("div");
                el.id = "cozy-support-inbox-root";
                document.body.appendChild(el);
            }
            return el;
        }

        /** mount(root) — real, idempotent. Safe to call unconditionally: renders nothing for anyone who is not a real, verified platform admin. */
        mount(root) {
            this.#root = root || this.#ensureRoot();
            this.#actorId = resolveActorId();
            this.#render();
            return { success: true };
        }

        #orgLabel(orgId) {
            const registry = window.CozyOS.OrganizationRegistry;
            if (!registry || typeof registry.getOrganization !== "function") return orgId;
            const org = registry.getOrganization(orgId);
            return org ? org.name : orgId;
        }

        #render() {
            if (!this.#root) return;
            const identity = window.CozyOS.IdentityEngine;
            const isAdmin = !!(identity && typeof identity.isPlatformAdmin === "function" &&
                this.#actorId && identity.isPlatformAdmin(this.#actorId));
            if (!isAdmin) {
                this.#root.innerHTML = "";
                return;
            }

            const support = window.CozyOS.OrganizationSupport;
            if (!support) {
                this.#root.innerHTML = '<p style="color:#f87171;">OrganizationSupport is not loaded.</p>';
                return;
            }

            const pending = support.listPendingRequests();
            const activeGrants = typeof support.listAllActiveGrants === "function" ? support.listAllActiveGrants() : [];

            let html = '<div class="cozy-support-inbox" style="max-width:960px;margin:24px auto;padding:16px 20px;border:1px solid #0f3d2c;border-radius:8px;background:#01140f;color:#eaf5ee;font-family:system-ui,sans-serif;">';
            html += '<h2 style="margin-top:0;">CozyOS Platform Support Inbox</h2>';
            html += '<p style="font-size:12px;color:#94a3b8;">Every organization\'s support requests and active grants — scoped, time-boxed, auditable. Granting support never makes you that organization\'s administrator.</p>';

            html += '<h3 style="margin-bottom:6px;">Pending Requests (' + pending.length + ')</h3>';
            html += pending.length === 0
                ? '<p style="color:#94a3b8;font-size:13px;">No pending support requests.</p>'
                : pending.map((r) => this.#renderPendingRequest(r)).join("");

            html += '<h3 style="margin-bottom:6px;">Active Support Grants (' + activeGrants.length + ')</h3>';
            html += activeGrants.length === 0
                ? '<p style="color:#94a3b8;font-size:13px;">No active support grants.</p>'
                : activeGrants.map((g) => this.#renderActiveGrant(g)).join("");

            html += '<button type="button" id="cozy-support-inbox-refresh" class="cozy-btn" style="margin-top:10px;">Refresh</button>';
            html += '<p id="cozy-support-inbox-result" style="font-size:12px;color:#94a3b8;margin-top:8px;"></p>';
            html += "</div>";

            this.#root.innerHTML = html;
            this.#wire();
        }

        #renderPendingRequest(r) {
            const scopeCheckboxes = KNOWN_SCOPES.map((s) =>
                '<label style="margin-right:10px;font-size:12px;"><input type="checkbox" class="cozy-support-scope" value="' + escapeHtml(s) + '"> ' + escapeHtml(s) + "</label>"
            ).join("");
            return '<div class="cozy-support-request" data-request-id="' + escapeHtml(r.requestId) + '" style="border-top:1px solid #0f3d2c;padding:10px 0;">' +
                '<p style="margin:0 0 4px 0;"><strong>' + escapeHtml(this.#orgLabel(r.organizationId)) + '</strong> — requested by ' + escapeHtml(r.requesterId) + " at " + escapeHtml(r.requestedAt) + "</p>" +
                '<p style="margin:0 0 6px 0;font-size:13px;color:#cbd5e1;">&quot;' + escapeHtml(r.reason) + '&quot;' + (r.liveSessionId ? ' (live session: ' + escapeHtml(r.liveSessionId) + ')' : '') + "</p>" +
                '<div style="margin-bottom:6px;">' + scopeCheckboxes + "</div>" +
                '<input type="text" class="cozy-support-grant-reason" placeholder="Reason for granting" style="padding:4px 6px;margin-right:6px;background:#01140f;color:#eaf5ee;border:1px solid #0f3d2c;border-radius:4px;" />' +
                '<input type="number" class="cozy-support-grant-duration" placeholder="Duration (hours, default 4)" style="padding:4px 6px;width:190px;margin-right:6px;background:#01140f;color:#eaf5ee;border:1px solid #0f3d2c;border-radius:4px;" />' +
                '<button type="button" class="cozy-btn cozy-btn-primary cozy-support-grant-btn" data-request-id="' + escapeHtml(r.requestId) + '" data-organization-id="' + escapeHtml(r.organizationId) + '">Grant Support</button>' +
                "</div>";
        }

        #renderActiveGrant(g) {
            return '<div class="cozy-support-grant" data-grant-id="' + escapeHtml(g.grantId) + '" style="border-top:1px solid #0f3d2c;padding:10px 0;">' +
                '<p style="margin:0 0 4px 0;"><strong>' + escapeHtml(this.#orgLabel(g.organizationId)) + '</strong> — operator ' + escapeHtml(g.operatorId) + ", scope: " + escapeHtml(g.scope.join(", ")) + "</p>" +
                '<p style="margin:0 0 6px 0;font-size:12px;color:#94a3b8;">Authorized ' + escapeHtml(g.authorizedAt) + " — expires " + escapeHtml(g.expiresAt) + "</p>" +
                '<button type="button" class="cozy-btn cozy-support-revoke-btn" data-grant-id="' + escapeHtml(g.grantId) + '">Revoke</button>' +
                "</div>";
        }

        #wire() {
            const support = window.CozyOS.OrganizationSupport;
            const resultEl = this.#root.querySelector("#cozy-support-inbox-result");

            const refreshBtn = this.#root.querySelector("#cozy-support-inbox-refresh");
            if (refreshBtn) refreshBtn.addEventListener("click", () => this.#render());

            this.#root.querySelectorAll(".cozy-support-grant-btn").forEach((btn) => {
                btn.addEventListener("click", () => {
                    const requestId = btn.getAttribute("data-request-id");
                    const organizationId = btn.getAttribute("data-organization-id");
                    const card = btn.closest(".cozy-support-request");
                    const scope = Array.from(card.querySelectorAll(".cozy-support-scope:checked")).map((cb) => cb.value);
                    const reasonInput = card.querySelector(".cozy-support-grant-reason");
                    const durationInput = card.querySelector(".cozy-support-grant-duration");
                    const reason = reasonInput ? reasonInput.value : "";
                    const durationHours = durationInput ? parseFloat(durationInput.value) : NaN;
                    const grantArgs = { requestId, organizationId, operatorId: this.#actorId, reason, scope };
                    if (!isNaN(durationHours) && durationHours > 0) grantArgs.durationMs = durationHours * 60 * 60 * 1000;

                    const result = support.grantSupport(grantArgs);
                    const message = result.success ? "Support granted." : ("Could not grant: " + result.reason);
                    if (result.success) {
                        // #render() rebuilds this whole panel fresh (the
                        // granted request must move out of Pending and
                        // the new grant must appear under Active) — which
                        // discards the transient message just set on the
                        // now-replaced #cozy-support-inbox-result element.
                        // Re-apply it to the FRESH element so a caller
                        // reading this result immediately after still
                        // sees it, not a blank re-render.
                        this.#render();
                        const freshResultEl = this.#root.querySelector("#cozy-support-inbox-result");
                        if (freshResultEl) freshResultEl.textContent = message;
                    } else if (resultEl) {
                        resultEl.textContent = message;
                    }
                });
            });

            this.#root.querySelectorAll(".cozy-support-revoke-btn").forEach((btn) => {
                btn.addEventListener("click", () => {
                    const grantId = btn.getAttribute("data-grant-id");
                    const result = support.revokeSupport(grantId, this.#actorId, "Revoked from CozyOS Support Inbox.");
                    const message = result.success ? "Grant revoked." : ("Could not revoke: " + result.reason);
                    if (result.success) {
                        // Same re-render-wipes-the-message fix as the
                        // Grant handler above — see its own comment.
                        this.#render();
                        const freshResultEl = this.#root.querySelector("#cozy-support-inbox-result");
                        if (freshResultEl) freshResultEl.textContent = message;
                    } else if (resultEl) {
                        resultEl.textContent = message;
                    }
                });
            });
        }
    }

    window.CozyOS.OrganizationSupportPanel = new OrganizationSupportPanel();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                sourcePath: "core/organization/organization-support-panel.js",
                name: "OrganizationSupportPanel", category: "Platform", icon: "life-buoy",
                description: "PLATFORM-tier UI for OrganizationSupport — a real support inbox (pending requests, active grants, grant/revoke) for a verified CozyOS platform administrator. Creates no new authority; composes OrganizationSupport/OrganizationRegistry/IdentityEngine only."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
