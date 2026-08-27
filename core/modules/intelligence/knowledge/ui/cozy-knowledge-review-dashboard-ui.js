/**
 * CozyOS — Community Review Dashboard: DOM Layer
 * File Reference: core/modules/intelligence/knowledge/ui/cozy-knowledge-review-dashboard-ui.js
 * Repair: RP-029-C Phase 2 (Review Dashboard UI)
 *
 * OWNERSHIP
 *   New, additive, standalone file. Never duplicates validation/state
 *   logic — every state change goes through
 *   cozy-knowledge-review-dashboard-core.js's authorization-guarded
 *   wrappers, which themselves only compose RP-029-B/RP-029-C Phase 1's
 *   real functions. This file's own job is rendering and event wiring
 *   only.
 *
 * STYLING
 *   Reuses existing CozyOS design tokens/components
 *   (core/ui/cozy-tokens.css, core/ui/cozy-components.css — .cozy-card,
 *   .cozy-btn, .cozy-badge, .cozy-input, .cozy-empty-state) rather than
 *   inventing a parallel design system. review-dashboard.css (same
 *   directory) adds only the additional grid/layout rules those files
 *   don't already provide.
 *
 * PRIVACY (spec §11)
 *   Never renders a field CozyKnowledgeCommunity's own getRecord()
 *   didn't already redact/pseudonymize. Never widens a candidate's
 *   visibility — the visibility badge always reflects the real record,
 *   selecting/opening a candidate does not change it.
 *
 * OFFLINE STATE (spec §13)
 *   Renders exactly what CozyKnowledgeCommunity.getSyncStatus() reports
 *   (always SYNC_PENDING per that module's own honest design — see its
 *   header). Never renders "SYNCED" — that status string does not
 *   exist anywhere in this file.
 */
(function () {
    "use strict";
    if (typeof window === "undefined") return; // DOM-only file

    function community() { return window.CozyOS && window.CozyOS.CozyKnowledgeCommunity; }
    function reviewMod() { return window.CozyOS && window.CozyOS.CozyKnowledgeReview; }
    function core() { return window.CozyOS && window.CozyOS.CozyKnowledgeReviewDashboardCore; }

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

    function badge(text, kind) {
        return el("span", { class: "cozy-badge cozy-badge-" + (kind || "neutral"), text });
    }

    // Maps a display state to a badge kind — presentation only.
    function badgeKindForDisplayState(state) {
        const map = {
            PROMOTED: "success", PROMOTION_ELIGIBLE: "success", VERIFIED: "success",
            COMMUNITY_REVIEW: "info", EMERGING: "info",
            NEEDS_CLARIFICATION: "warning",
            DISPUTED: "error", REJECTED: "error",
            PRIVATE: "neutral", CANDIDATE: "neutral"
        };
        return map[state] || "neutral";
    }

    /**
     * CozyKnowledgeReviewDashboard.init(rootEl, options)
     *   options:
     *     reviewerUserIds: string[] — see core file's disclosed
     *       REVIEWER-designation limitation.
     *     seedDemoData: boolean — creates a handful of real candidates
     *       via CozyKnowledgeCommunity.submitContribution() (a real,
     *       existing function) purely so the dashboard has something to
     *       show in a fresh session/demo/test. Never fabricates a
     *       record outside that real API. Off by default.
     */
    function init(rootEl, options) {
        const opts = options || {};
        const c = community();
        const r = reviewMod();
        const dc = core();
        if (!c || !r || !dc) {
            rootEl.appendChild(el("div", { class: "cozy-empty-state", text: "Required modules are not loaded (CozyKnowledgeCommunity / CozyKnowledgeReview / dashboard core)." }));
            return null;
        }

        const state = {
            filters: { query: "", language: "", dialect: "", reviewState: "", disputedOnly: false, sort: "newest" },
            selectedId: null,
            roleInfo: dc.resolveRole({ reviewerUserIds: opts.reviewerUserIds })
        };

        if (opts.seedDemoData) seedDemoData(c);

        rootEl.innerHTML = "";
        const layout = el("div", { class: "review-dashboard-layout" });
        const listPane = el("div", { class: "review-dashboard-list cozy-card" });
        const detailPane = el("div", { class: "review-dashboard-detail cozy-card" });
        layout.appendChild(listPane);
        layout.appendChild(detailPane);
        rootEl.appendChild(roleBanner(state));
        rootEl.appendChild(layout);

        function refresh() {
            renderList(listPane, state, c, dc, (id) => { state.selectedId = id; state.lastFeedback = null; refresh(); });
            renderDetail(detailPane, state, c, r, dc, refresh);
        }

        // Cozy Offline Hotspot composition (real LiveHotspotEngine only —
        // see cozy-knowledge-review-hotspot-bridge.js header). Any
        // candidate received from a connected peer lands as an ordinary
        // new local candidate via the real ingestion path, so a refresh
        // is all that's needed here — no separate receive-side UI state.
        const bridge = window.CozyOS && window.CozyOS.CozyKnowledgeReviewHotspotBridge;
        if (bridge) bridge.wireReceiver(() => refresh());

        refresh();
        return { refresh, state };
    }

    function seedDemoData(c) {
        // Real calls to the real API — demo/test seed only, clearly
        // labeled, never a fabricated shortcut around it.
        const samples = [
            { contributionType: "PHRASE", statement: "Onge wach", contributorId: "demo-contributor-1", language: "luo", meaning: "No problem", context: "Casual reassurance" },
            { contributionType: "WORD", statement: "Sasa", contributorId: "demo-contributor-2", language: "sw", meaning: "What's up (informal)", context: "Youth greeting" },
            { contributionType: "PHRASE", statement: "Nyathi ma ok winj wach wuon gi min", contributorId: "demo-contributor-3", language: "luo", meaning: "A child who does not heed parental advice", context: "Traditional proverb" }
        ];
        samples.forEach((s) => c.submitContribution(s));
    }

    function roleBanner(state) {
        const info = state.roleInfo;
        const text = "Role: " + info.role + (info.authBackend === "AUTHORIZATION_BACKEND_UNAVAILABLE" ? " (AUTHORIZATION_BACKEND_UNAVAILABLE — AuthCoordinator not loaded, defaulting to view-only)" : "");
        return el("div", { class: "review-dashboard-role-banner", role: "status", text });
    }

    // -----------------------------------------------------------------
    // LIST PANE
    // -----------------------------------------------------------------

    function renderList(pane, state, c, dc, onSelect) {
        pane.innerHTML = "";
        pane.appendChild(el("h2", { class: "cozy-section-title", text: "Candidates" }));

        const searchInput = el("input", {
            class: "cozy-input", type: "search", "aria-label": "Search candidates",
            placeholder: "Search expression or meaning\u2026", value: state.filters.query,
            oninput: (e) => { state.filters.query = e.target.value; onSelect(state.selectedId); }
        });
        const langSelect = filterSelect("Language", state.filters.language, ["", "en", "sw", "fr", "ar", "so", "luo", "ki", "kam", "zu", "lg", "ig"], (v) => { state.filters.language = v; onSelect(state.selectedId); });
        const stateSelect = filterSelect("Status", state.filters.reviewState, ["", "CANDIDATE", "UNDER_REVIEW", "CONFIRMED", "DISPUTED", "REJECTED", "UNRESOLVED"], (v) => { state.filters.reviewState = v; onSelect(state.selectedId); });
        const sortSelect = filterSelect("Sort", state.filters.sort, ["newest", "oldest", "mostConfirmed"], (v) => { state.filters.sort = v; onSelect(state.selectedId); });
        const disputedToggle = el("label", { class: "review-dashboard-toggle" }, [
            el("input", {
                type: "checkbox", "aria-label": "Disputed only", ...(state.filters.disputedOnly ? { checked: "checked" } : {}),
                onchange: (e) => { state.filters.disputedOnly = e.target.checked; onSelect(state.selectedId); }
            }),
            document.createTextNode(" Disputed only")
        ]);

        pane.appendChild(el("div", { class: "review-dashboard-filters" }, [searchInput, langSelect, stateSelect, sortSelect, disputedToggle]));

        const records = c.listCommunityRecords({});
        const filtered = dc.searchAndFilter(records, state.filters);

        if (filtered.length === 0) {
            pane.appendChild(el("div", { class: "cozy-empty-state", text: "No candidates match these filters." }));
            return;
        }

        const list = el("ul", { class: "review-dashboard-candidate-list", role: "list" });
        filtered.forEach((rec) => list.appendChild(candidateCard(rec, state, onSelect)));
        pane.appendChild(list);
    }

    function filterSelect(label, value, options, onChange) {
        const select = el("select", {
            class: "cozy-input", "aria-label": label,
            onchange: (e) => onChange(e.target.value)
        }, options.map((o) => el("option", { value: o, text: o || "(any)", ...(o === value ? { selected: "selected" } : {}) })));
        return select;
    }

    function candidateCard(rec, state, onSelect) {
        const ext = rec.communityExtensions || {};
        const displayState = (reviewMod() && reviewMod().computeDisplayState) ? reviewMod().computeDisplayState(rec) : ext.reviewState;
        const card = el("li", {
            class: "cozy-card review-dashboard-candidate-card" + (state.selectedId === rec.id ? " selected" : ""),
            tabindex: "0", role: "button", "aria-pressed": state.selectedId === rec.id ? "true" : "false",
            onclick: () => onSelect(rec.id),
            onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(rec.id); } }
        }, [
            el("div", { class: "review-dashboard-candidate-title", text: rec.claim || "(no expression)" }),
            el("div", { class: "review-dashboard-candidate-meta", text: [(rec.language && rec.language.code) || "unknown language", ext.variant || null, rec.visibility].filter(Boolean).join(" \u00b7 ") }),
            badge(displayState, badgeKindForDisplayState(displayState)),
            el("span", { class: "review-dashboard-confirm-count", text: (rec.independentConfirmations || 0) + " confirmation(s)" })
        ]);
        return card;
    }

    // -----------------------------------------------------------------
    // DETAIL PANE
    // -----------------------------------------------------------------

    function renderDetail(pane, state, c, r, dc, refresh) {
        pane.innerHTML = "";
        if (!state.selectedId) {
            pane.appendChild(el("div", { class: "cozy-empty-state", text: "Select a candidate to review it." }));
            return;
        }
        const rec = c.getRecord(state.selectedId);
        if (!rec) {
            pane.appendChild(el("div", { class: "cozy-empty-state", text: "NOT_FOUND \u2014 this candidate no longer exists." }));
            return;
        }
        const ext = rec.communityExtensions || {};

        pane.appendChild(el("h2", { class: "cozy-section-title", text: rec.claim || "(no expression)" }));
        pane.appendChild(evidenceSection(rec, ext, r));
        pane.appendChild(confidenceSection(rec, c));
        pane.appendChild(disputeSection(rec, ext));
        pane.appendChild(provenanceSection(rec));
        pane.appendChild(privacySection(rec));
        pane.appendChild(offlineSection(rec, c));
        pane.appendChild(rule82Section(rec, r));
        pane.appendChild(actionsSection(rec, state, dc, refresh));
        pane.appendChild(auditSection(rec, r));
    }

    function section(title, contentEl) {
        return el("section", { class: "review-dashboard-section", "aria-label": title }, [
            el("h3", { class: "cozy-text-label", text: title }),
            contentEl
        ]);
    }

    function evidenceSection(rec, ext, r) {
        const rows = [
            ["Language", (rec.language && rec.language.code) || "UNKNOWN"],
            ["Region", rec.region || "UNKNOWN"],
            ["Dialect", ext.variant || rec.dialect || "UNKNOWN"],
            ["Meaning", rec.meaning || "UNKNOWN"],
            ["Context", rec.context || "UNKNOWN"],
            ["Source type", (rec.provenance && rec.provenance.sourceType) || "UNKNOWN"],
            ["Contributor status", rec.provenance && rec.provenance.sourceId ? "Pseudonymized" : "UNKNOWN"]
        ];
        return section("Evidence", defList(rows));
    }

    function confidenceSection(rec, c) {
        const conf = c.describeConfidence(rec.id) || {};
        const rows = Object.keys(conf).filter((k) => k !== "raw").map((k) => [k, conf[k]]);
        return section("Confidence", defList(rows));
    }

    function disputeSection(rec, ext) {
        const disputes = ext.disputes || [];
        if (disputes.length === 0) return section("Disputes", el("div", { class: "cozy-empty-state", text: "No disputes recorded." }));
        const list = el("ul", {}, disputes.map((d) => el("li", { text: (d.reason || "(no reason given)") + " \u2014 " + (d.at || "") })));
        return section("Disputes", list);
    }

    function provenanceSection(rec) {
        const rows = [
            ["Source", (rec.provenance && rec.provenance.sourceType) || "UNKNOWN"],
            ["Validation", (rec.independentConfirmations || 0) + " independent confirmation(s)"],
            ["Review state", (rec.communityExtensions && rec.communityExtensions.reviewState) || "UNKNOWN"]
        ];
        return section("Provenance", defList(rows));
    }

    function privacySection(rec) {
        // Reflects the real record only — never escalates visibility.
        return section("Privacy", badge(rec.visibility || "UNKNOWN", rec.visibility === "PUBLIC" ? "success" : rec.visibility === "COMMUNITY" ? "info" : "neutral"));
    }

    function offlineSection(rec, c) {
        const sync = c.getSyncStatus(rec.id) || { status: "UNKNOWN" };
        const bridge = window.CozyOS && window.CozyOS.CozyKnowledgeReviewHotspotBridge;
        const hotspotInfo = bridge ? bridge.listActiveConnections() : { available: false, connections: [] };
        const rows = [
            ["Sync status", sync.status],
            ["Cozy Offline Hotspot", hotspotInfo.available ? hotspotInfo.connections.length + " device(s) connected" : "Not loaded"]
        ];
        return section("Sync Status", defList(rows));
    }

    function rule82Section(rec, r) {
        const languageCode = (rec.language && rec.language.code) || null;
        const gate = r.evaluateRule82Gate(languageCode);
        const rows = [
            ["Real resources", gate.requirements.realLanguageResourcesExist.state],
            ["Intent templates", gate.requirements.templatesWrittenAndCommitted.state],
            ["Translation control", gate.requirements.noUncontrolledTranslation.state],
            ["Language tests", gate.requirements.testsExistAndPass.state],
            ["Runtime observation", gate.requirements.runtimeBehaviorObserved.state]
        ];
        const lock = badge(gate.promotion === "ELIGIBLE" ? "\ud83d\udd13 ELIGIBLE" : "\ud83d\udd12 LOCKED", gate.promotion === "ELIGIBLE" ? "success" : "error");
        return section("Rule 82 \u2014 " + (languageCode || "UNKNOWN"), el("div", {}, [defList(rows), lock]));
    }

    function defList(rows) {
        const dl = el("dl", { class: "review-dashboard-deflist" });
        rows.forEach(([k, v]) => {
            dl.appendChild(el("dt", { text: k }));
            dl.appendChild(el("dd", { text: v === null || v === undefined || v === "" ? "UNKNOWN" : String(v) }));
        });
        return dl;
    }

    function auditSection(rec, r) {
        const trail = r.getAuditTrail(rec.id);
        if (trail.length === 0) return section("Audit Trail", el("div", { class: "cozy-empty-state", text: "No reviewer actions recorded yet." }));
        const list = el("ol", { class: "review-dashboard-audit-list" }, trail.map((entry) =>
            el("li", { text: `${entry.at} \u2014 ${entry.action} (${entry.previousState || "?"} \u2192 ${entry.resultingState || "?"})${entry.reason ? ": " + entry.reason : ""}` })
        ));
        return section("Audit Trail", list);
    }

    function actionsSection(rec, state, dc, refresh) {
        const wrap = el("div", { class: "review-dashboard-actions" });
        const feedback = el("div", { class: "review-dashboard-action-feedback", role: "status", "aria-live": "polite", text: state.lastFeedback || "" });

        function run(label, fn) {
            return el("button", {
                class: "cozy-btn", type: "button", text: label,
                onclick: () => {
                    const result = fn();
                    // refresh() below tears down and rebuilds this whole
                    // pane (including this feedback node), so the message
                    // is persisted on shared `state` and re-rendered by
                    // the next actionsSection() call rather than written
                    // to a DOM node that is about to be discarded.
                    state.lastFeedback = label + ": " + result.status + (result.reason ? " \u2014 " + result.reason : "");
                    refresh();
                }
            });
        }

        wrap.appendChild(run("Confirm", () => dc.dashboardConfirm(rec.id, state.roleInfo, { contributorId: state.roleInfo.userId, sourceId: "ui:" + Date.now() })));
        wrap.appendChild(run("Partial Confirm", () => dc.dashboardPartialConfirm(rec.id, state.roleInfo, { confirms: ["expression"], disputes: ["translation"] })));
        wrap.appendChild(run("Request Clarification", () => dc.dashboardRequestClarification(rec.id, state.roleInfo, { reason: "More community input requested via dashboard." })));
        wrap.appendChild(run("Challenge", () => dc.dashboardChallenge(rec.id, state.roleInfo, { reason: "Disputed via dashboard." })));
        wrap.appendChild(run("Reject", () => dc.dashboardReject(rec.id, state.roleInfo, { reason: "Rejected via dashboard." })));
        wrap.appendChild(run("Promote \u2192 Community", () => dc.dashboardPromote(rec.id, "COMMUNITY", state.roleInfo, {})));
        wrap.appendChild(run("Promote \u2192 Public", () => dc.dashboardPromote(rec.id, "PUBLIC", state.roleInfo, {})));

        const bridge = window.CozyOS && window.CozyOS.CozyKnowledgeReviewHotspotBridge;
        if (bridge) {
            wrap.appendChild(el("button", {
                class: "cozy-btn", type: "button", text: "Share via Nearby Device",
                onclick: () => {
                    const result = bridge.shareCandidate(rec);
                    state.lastFeedback = "Share via Nearby Device: " + result.status + (result.sentTo !== undefined ? ` (${result.sentTo} device(s))` : "");
                    refresh();
                }
            }));
        }

        return el("div", {}, [section("Review Decision", wrap), feedback]);
    }

    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    window.CozyOS.CozyKnowledgeReviewDashboard = Object.freeze({ init });
    window.CozyOS.Modules["cozy-knowledge-review-dashboard-ui"] = Object.freeze({
        version: "1.0.0",
        description: "RP-029-C Phase 2 — Review Dashboard DOM layer. Renders candidates/evidence/confidence/disputes/provenance/privacy/sync/Rule-82/audit trail from real CozyKnowledgeCommunity + CozyKnowledgeReview data only; every reviewer/community action goes through the authorization-guarded dashboard-core wrappers, never a direct state mutation from this file."
    });
})();
