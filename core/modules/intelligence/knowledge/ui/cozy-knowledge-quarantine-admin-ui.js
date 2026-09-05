/**
 * CozyOS — Quarantine + Admin Safety Review: DOM Layer
 * File Reference: core/modules/intelligence/knowledge/ui/cozy-knowledge-quarantine-admin-ui.js
 * Repair: RP-029-C Phase 5
 *
 * OWNERSHIP: rendering/event-wiring only. Every state change goes
 * through cozy-knowledge-quarantine-admin-core.js's real, authorization-
 * guarded functions. Reuses core/ui/cozy-tokens.css + cozy-components.css
 * and Phase 2's review-dashboard.css layout classes — no parallel
 * design system.
 *
 * SENSITIVE CONTENT DISPLAY (spec: "do not display prohibited media
 * unnecessarily... show safe metadata and a warning instead")
 *   This repository has no binary media rendering path at all for
 *   these records (fields are text/reference strings only — see
 *   Phase 3/4 headers), so there is no image/audio/video preview to
 *   accidentally render in the first place. For entries flagged
 *   UNSAFE-adjacent categories or MEDIA_NOT_ANALYZED, this file shows
 *   only language/dialect/region/content-type/classification/risk
 *   metadata plus the explicit label "CONTENT INSPECTION UNAVAILABLE"
 *   in place of a content preview — never a fabricated preview.
 */
(function () {
    "use strict";
    if (typeof window === "undefined") return;

    function admin() { return window.CozyOS && window.CozyOS.CozyKnowledgeQuarantineAdmin; }

    function el(tag, attrs, children) {
        const node = document.createElement(tag);
        Object.keys(attrs || {}).forEach((k) => {
            if (k === "text") node.textContent = attrs[k];
            else if (k === "class") node.className = attrs[k];
            else if (k.indexOf("on") === 0 && typeof attrs[k] === "function") node.addEventListener(k.slice(2), attrs[k]);
            else node.setAttribute(k, attrs[k]);
        });
        (children || []).forEach((c) => { if (c) node.appendChild(c); });
        return node;
    }
    function badge(text, kind) { return el("span", { class: "cozy-badge cozy-badge-" + (kind || "neutral"), text }); }
    function section(title, contentEl) {
        return el("section", { class: "review-dashboard-section", "aria-label": title }, [el("h3", { class: "cozy-text-label", text: title }), contentEl]);
    }
    function defList(rows) {
        const dl = el("dl", { class: "review-dashboard-deflist" });
        rows.forEach(([k, v]) => { dl.appendChild(el("dt", { text: k })); dl.appendChild(el("dd", { text: v === null || v === undefined || v === "" ? "UNKNOWN" : String(v) })); });
        return dl;
    }

    const RISK_BADGE = { SAFE: "success", UNCERTAIN: "warning", HIGH_RISK: "error", UNSAFE: "error" };

    function init(rootEl, options) {
        const opts = options || {};
        const a = admin();
        if (!a) {
            rootEl.appendChild(el("div", { class: "cozy-empty-state", text: "Required module is not loaded (CozyKnowledgeQuarantineAdmin)." }));
            return null;
        }

        const state = {
            selectedId: null,
            roleInfo: a.resolveRole({ reviewerUserIds: opts.reviewerUserIds }),
            lastFeedback: null
        };

        rootEl.innerHTML = "";
        const banner = el("div", { class: "review-dashboard-role-banner", role: "status" });
        const layout = el("div", { class: "review-dashboard-layout" });
        const listPane = el("div", { class: "review-dashboard-list cozy-card" });
        const detailPane = el("div", { class: "review-dashboard-detail cozy-card" });
        layout.appendChild(listPane);
        layout.appendChild(detailPane);
        rootEl.appendChild(banner);
        rootEl.appendChild(layout);

        function refresh() {
            banner.textContent = "Role: " + state.roleInfo.role + (state.roleInfo.authBackend === "AUTHORIZATION_BACKEND_UNAVAILABLE" ? " (AUTHORIZATION_BACKEND_UNAVAILABLE — view-only)" : "");
            renderList(listPane, state, a, (id) => { state.selectedId = id; state.lastFeedback = null; refresh(); });
            renderDetail(detailPane, state, a, refresh);
        }

        refresh();
        return { refresh, state };
    }

    function renderList(pane, state, a, onSelect) {
        pane.innerHTML = "";
        pane.appendChild(el("h2", { class: "cozy-section-title", text: "Quarantine Review" }));

        const result = a.listQuarantine(state.roleInfo, {});
        if (result.status === "UNAUTHORIZED") {
            pane.appendChild(el("div", { class: "cozy-empty-state", text: "You are not authorized to view quarantined content." }));
            return;
        }
        if (result.status === "AUTHORIZATION_BACKEND_UNAVAILABLE") {
            pane.appendChild(el("div", { class: "cozy-empty-state", text: "AUTHORIZATION_BACKEND_UNAVAILABLE — sign in to view quarantine." }));
            return;
        }
        const items = result.items || [];
        if (items.length === 0) {
            pane.appendChild(el("div", { class: "cozy-empty-state", text: "No quarantined items." }));
            return;
        }
        const analytics = a.analytics(state.roleInfo);
        if (analytics.status === "OK") {
            pane.appendChild(el("div", { class: "review-dashboard-candidate-meta", text: `Total: ${analytics.totalQuarantined} \u00b7 Awaiting: ${analytics.byState.QUARANTINED || 0} \u00b7 Under review: ${analytics.byState.UNDER_REVIEW || 0}` }));
        }

        const list = el("ul", { class: "review-dashboard-candidate-list", role: "list" });
        items.forEach((item) => {
            const card = el("li", {
                class: "cozy-card review-dashboard-candidate-card" + (state.selectedId === item.id ? " selected" : ""),
                tabindex: "0", role: "button", "aria-pressed": state.selectedId === item.id ? "true" : "false",
                onclick: () => onSelect(item.id),
                onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(item.id); } }
            }, [
                el("div", { class: "review-dashboard-candidate-title", text: `${item.contentType || item.contributionType || "TEXT"} \u00b7 ${item.language || "UNKNOWN"}` }),
                el("div", { class: "review-dashboard-candidate-meta", text: `Submitted ${item.at || "UNKNOWN"} \u00b7 ${item.evidence ? item.evidence.length : 1} evidence record(s)` }),
                badge(item.classification, RISK_BADGE[item.classification] || "neutral"),
                badge(item.reviewState, "neutral")
            ]);
            list.appendChild(card);
        });
        pane.appendChild(list);
    }

    function renderDetail(pane, state, a, refresh) {
        pane.innerHTML = "";
        if (!state.selectedId) {
            pane.appendChild(el("div", { class: "cozy-empty-state", text: "Select a quarantined item to inspect it." }));
            return;
        }
        const result = a.inspect(state.selectedId, state.roleInfo);
        if (result.status === "UNAUTHORIZED" || result.status === "AUTHORIZATION_BACKEND_UNAVAILABLE") {
            pane.appendChild(el("div", { class: "cozy-empty-state", text: "Not authorized to inspect quarantined content." }));
            return;
        }
        if (result.status === "NOT_FOUND") {
            pane.appendChild(el("div", { class: "cozy-empty-state", text: "NOT_FOUND \u2014 this quarantine item no longer exists." }));
            return;
        }
        const entry = result.entry;
        pane.appendChild(el("h2", { class: "cozy-section-title", text: "Quarantine " + entry.id }));

        const sensitive = ["UNSAFE", "HIGH_RISK"].indexOf(entry.classification) !== -1 || entry.mediaNotAnalyzed;
        const contentRows = [
            ["Quarantine ID", entry.id],
            ["Language", entry.language],
            ["Dialect / region", (entry.fields && (entry.fields.dialect || entry.fields.region)) || null],
            ["Content type", entry.contributionType],
            ["Safety classification", entry.classification],
            ["Risk reason (category)", entry.category],
            ["Current state", entry.reviewState],
            ["Evidence records", entry.evidence ? entry.evidence.length : 1]
        ];
        pane.appendChild(section("Review Details", defList(contentRows)));

        if (sensitive) {
            pane.appendChild(section("Content", el("div", { class: "cozy-empty-state", text: "CONTENT INSPECTION UNAVAILABLE \u2014 this repository does not render media previews. Metadata above reflects the real record." })));
        } else {
            pane.appendChild(section("Content", defList([
                ["Expression", entry.fields && (entry.fields.expression || entry.fields.statement)],
                ["Meaning", entry.fields && entry.fields.meaning],
                ["Context", entry.fields && entry.fields.context]
            ])));
        }

        const trail = result.auditTrail || [];
        const auditList = trail.length === 0
            ? el("div", { class: "cozy-empty-state", text: "No review actions recorded yet." })
            : el("ol", { class: "review-dashboard-audit-list" }, trail.map((e) => el("li", { text: `${e.timestamp} \u2014 ${e.action} (${e.previousState || "?"} \u2192 ${e.newState || "?"})${e.reason ? ": " + e.reason : ""}` })));
        pane.appendChild(section("Audit Trail", auditList));

        pane.appendChild(actionsSection(entry, state, a, refresh));
    }

    function actionsSection(entry, state, a, refresh) {
        const wrap = el("div", { class: "review-dashboard-actions" });
        const feedback = el("div", { class: "review-dashboard-action-feedback", role: "status", "aria-live": "polite", text: state.lastFeedback || "" });

        function run(label, fn) {
            return el("button", {
                class: "cozy-btn", type: "button", text: label,
                onclick: () => {
                    const result = fn();
                    state.lastFeedback = label + ": " + result.status + (result.reason ? " \u2014 " + result.reason : "");
                    refresh();
                }
            });
        }

        const terminal = ["RELEASED", "REJECTED", "ESCALATED"].indexOf(entry.reviewState) !== -1;
        if (terminal) {
            wrap.appendChild(el("div", { class: "cozy-empty-state", text: "This item has already been reviewed (" + entry.reviewState + ")." }));
            return el("div", {}, [section("Reviewer Decision", wrap), feedback]);
        }

        wrap.appendChild(run("Inspect / Begin Review", () => a.beginReview(entry.id, state.roleInfo, { reviewerId: state.roleInfo.userId })));
        wrap.appendChild(run("Release", () => a.release(entry.id, state.roleInfo, { reviewerId: state.roleInfo.userId })));
        wrap.appendChild(run("Reject", () => a.reject(entry.id, state.roleInfo, { reviewerId: state.roleInfo.userId, reason: "Rejected via admin dashboard." })));
        wrap.appendChild(run("Escalate", () => a.escalate(entry.id, state.roleInfo, { reviewerId: state.roleInfo.userId, reason: "Escalated via admin dashboard." })));

        return el("div", {}, [section("Reviewer Decision", wrap), feedback]);
    }

    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    window.CozyOS.CozyKnowledgeQuarantineAdminUI = Object.freeze({ init });
    window.CozyOS.Modules["cozy-knowledge-quarantine-admin-ui"] = Object.freeze({
        version: "1.0.0",
        description: "RP-029-C Phase 5 — Quarantine + Admin Safety Review DOM layer. Renders real quarantine list/detail/audit-trail data only; every action goes through the authorization-guarded admin-core wrappers. Never renders a media preview (none exists to render) — shows 'CONTENT INSPECTION UNAVAILABLE' plus safe metadata for sensitive/media-referencing entries instead."
    });
})();
