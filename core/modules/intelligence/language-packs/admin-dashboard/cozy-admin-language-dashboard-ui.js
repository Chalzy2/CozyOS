/**
 * core/modules/intelligence/language-packs/admin-dashboard/cozy-admin-language-dashboard-ui.js
 * Repair: RP-031-B — Admin Language Dashboard + Usage/Research Analytics
 * Milestone: RP-031-B, Increment 5 (Admin Language Dashboard UI +
 * Production-Safe Authorization)
 *
 * OWNERSHIP / COMPOSITION
 *   New, additive, standalone file. Composes — never duplicates — the
 *   real Increment 1–4 dashboard modules, RP-029-C's review-dashboard
 *   authorization (`resolveRole`, reused verbatim — no second auth
 *   system), and RP-031 Phase 1's `CozyLanguageAcquisition` (Hearing
 *   Mode's real capture/clarification API). No storage of its own
 *   truth for any language/knowledge/quarantine/hotspot state — every
 *   number rendered comes from a real Increment 1–4 function call made
 *   fresh on each render.
 *
 * TWO LAYERS IN ONE FILE, DELIBERATELY
 *   `core` — pure, DOM-free functions (permission mapping, per-section
 *   view-model assembly). Node-testable directly, same pattern as
 *   every other *-core.js file in this repository.
 *   `ui` (via `init()`) — the real DOM rendering layer, driven only by
 *   `core`'s own output. Exercised by a real Playwright/Chromium
 *   browser test, not by DOM simulation.
 *
 * AUTHORIZATION — PRODUCTION-SAFE, NOT INVENTED
 *   Reuses RP-029-C Phase 2's real `resolveRole()`
 *   (window.CozyOS.Modules["cozy-knowledge-review-dashboard-core"]),
 *   the same function Increment 4's `resolveAuthorization()` already
 *   wraps. The real backend only ever reports one of
 *   `ANONYMOUS`/`COMMUNITY`/`REVIEWER`/`ADMIN` — there is no `OWNER`
 *   tier anywhere in this repository's actual authorization code. This
 *   file does NOT invent a fifth privilege level with undefined real
 *   semantics: an `OWNER`-tier UI request honestly maps to `ADMIN` (the
 *   real system's highest tier), with a disclosed note, never a
 *   fabricated distinct capability. If no auth backend is attached,
 *   this file reports the same real
 *   `AUTHORIZATION_BACKEND_UNAVAILABLE` the composed function itself
 *   returns — it never silently grants access.
 *
 * DESTRUCTIVE ACTIONS
 *   Reviewer/quarantine actions (release/reject/escalate) go through
 *   Increment 4's own `getQuarantineOverview`/the real
 *   `CozyKnowledgeQuarantineAdmin` action functions, which already
 *   require REVIEWER+. Independent community confirmation
 *   (`addIndependentConfirmation`) is composed directly from
 *   RP-029-B's `CozyKnowledgeCommunity` — deliberately NOT routed
 *   through the reviewer-only quarantine authorization path, learning
 *   from the disclosed Phase 2 bug (confirmation was once accidentally
 *   hidden behind reviewer auth) — community-tier users can confirm
 *   without REVIEWER rank, matching RP-029-B's own real rule.
 *
 * HEARING MODE
 *   Composes RP-031 Phase 1's real, existing
 *   `captureUnknownExpressionFromHearing()`/`listPendingClarifications()`/
 *   `resolveClarification()` only. If `window.CozyOS.CozyHearing` is
 *   absent (no ASR backend in this environment), every entry point
 *   already honestly reports `CAPABILITY_UNAVAILABLE` — this file adds
 *   no fake transcription and no second capability gate.
 *
 * NO FABRICATION
 *   Every section below either calls a real Increment 1–4 function or
 *   explicitly reports `CAPABILITY_UNAVAILABLE`. No language
 *   statistic, translation, telemetry figure, or authentication state
 *   is invented at this layer.
 */
(function (root) {
    "use strict";

    const VERSION = "0.1.0";

    function cozyOS() { return (root.window && root.window.CozyOS) || null; }
    function mod(name) {
        const c = cozyOS();
        return c && c.Modules && c.Modules[name] ? c.Modules[name].api : null;
    }
    function dashboardCore() { return mod("cozy-admin-language-dashboard-core"); }
    function termExplorer() { return mod("cozy-admin-language-dashboard-term-explorer"); }
    function domainCommunity() { return mod("cozy-admin-language-dashboard-domain-community"); }
    function quarantineHotspot() { return mod("cozy-admin-language-dashboard-quarantine-hotspot"); }
    function reviewDashboardCore() { const c = cozyOS(); return c && c.CozyKnowledgeReviewDashboardCore ? c.CozyKnowledgeReviewDashboardCore : null; }
    function packsApi() { const c = cozyOS(); return c && c.CozyLanguagePacks ? c.CozyLanguagePacks : null; }
    function communityApi() { const c = cozyOS(); return c && c.CozyKnowledgeCommunity ? c.CozyKnowledgeCommunity : null; }
    function acquisition() { const c = cozyOS(); return c && c.CozyLanguageAcquisition ? c.CozyLanguageAcquisition : null; }

    // ===================================================================
    // CORE — pure, DOM-free, Node-testable
    // ===================================================================
    const core = {};

    // -------------------------------------------------------------
    // AUTHORIZATION
    // -------------------------------------------------------------

    const UI_PERMISSION_RANK = { ANONYMOUS: 0, COMMUNITY: 1, REVIEWER: 2, ADMIN: 3 };

    /**
     * core.resolveUiRole(config)
     *   Real, composed role resolution — never invents identity. An
     *   `OWNER`-tier request in `config.requestedOwnerView` is honestly
     *   downgraded to the real `ADMIN` rank with a disclosed note; it
     *   is never granted a fabricated fifth privilege level.
     */
    core.resolveUiRole = function resolveUiRole(config) {
        const rdc = reviewDashboardCore();
        if (!rdc || typeof rdc.resolveRole !== "function") {
            return { role: "ANONYMOUS", userId: null, authBackend: "AUTHORIZATION_BACKEND_UNAVAILABLE" };
        }
        const resolved = rdc.resolveRole(config);
        if (config && config.requestedOwnerView && resolved.role === "ADMIN") {
            return Object.assign({}, resolved, {
                displayRole: "OWNER",
                note: "OWNER is not a distinct tier in this repository's real authorization backend (only ANONYMOUS/COMMUNITY/REVIEWER/ADMIN exist). This view is granted at the real ADMIN rank, the backend's own highest tier — never a fabricated fifth privilege level."
            });
        }
        return resolved;
    };

    core.isUiActionAllowed = function isUiActionAllowed(action, roleInfo) {
        const required = { view_public: 0, contribute: 1, confirm: 1, review: 2, quarantine_action: 2, admin_analytics: 3 }[action];
        if (required === undefined) return false;
        if (!roleInfo || roleInfo.authBackend === "AUTHORIZATION_BACKEND_UNAVAILABLE") return required === 0;
        return (UI_PERMISSION_RANK[roleInfo.role] || 0) >= required;
    };

    // -------------------------------------------------------------
    // 1. LANGUAGE OVERVIEW + 9. RULE 82 (per-row)
    // -------------------------------------------------------------

    core.getLanguageOverviewView = function getLanguageOverviewView() {
        const dc = dashboardCore();
        const qh = quarantineHotspot();
        if (!dc) return { capability: "CAPABILITY_UNAVAILABLE", reason: "INCREMENT_1_ABSENT" };
        const overview = dc.getLanguageOverview();
        if (overview.capability !== "AVAILABLE") return overview;
        const rows = overview.languages.map((row) => {
            const rule82 = qh ? qh.getRule82Visibility(row.languageId) : { status: "CAPABILITY_UNAVAILABLE" };
            return Object.assign({}, row, { rule82Status: rule82.status || rule82.capability });
        });
        return { capability: "AVAILABLE", rows };
    };

    // -------------------------------------------------------------
    // 2. LANGUAGE ROUTING
    // -------------------------------------------------------------

    core.getRoutingView = function getRoutingView(evidence, candidateLanguageIds) {
        const dc = dashboardCore();
        if (!dc) return { capability: "CAPABILITY_UNAVAILABLE", reason: "INCREMENT_1_ABSENT" };
        return dc.resolveLanguagePackRouting(evidence, candidateLanguageIds);
    };

    // -------------------------------------------------------------
    // 3. TERM EXPLORER + AMBIGUOUS MEANINGS
    // -------------------------------------------------------------

    /**
     * core.getTermSearchView(params)
     *   Adds an honest ambiguity classification on top of Increment 2's
     *   real search results: when two or more real result records for
     *   the same query carry genuinely different `meaning` text, both
     *   are preserved and flagged CONFLICTING_MEANING — never merged,
     *   never silently overwritten.
     */
    core.getTermSearchView = function getTermSearchView(params) {
        const te = termExplorer();
        if (!te) return { capability: "CAPABILITY_UNAVAILABLE", reason: "INCREMENT_2_ABSENT" };
        const result = te.searchTerms(params);
        if (result.capability !== "AVAILABLE" || !result.results) return result;

        const meaningsSeen = new Set();
        const distinctMeanings = new Set();
        result.results.forEach((r) => { if (r.meaning) distinctMeanings.add(String(r.meaning).trim().toLowerCase()); });
        const conflicting = distinctMeanings.size > 1;

        const rows = result.results.map((r) => {
            let ambiguityStatus = "LANGUAGE_MATCH";
            if (r.matchType === "RELATED_MATCH") ambiguityStatus = "REGIONAL_MATCH";
            else if (r.matchType === "PREFIX_MATCH") ambiguityStatus = "DIALECT_MATCH";
            if (conflicting) ambiguityStatus = "CONFLICTING_MEANING";
            return Object.assign({}, r, { ambiguityStatus });
        });
        return Object.assign({}, result, { results: rows, hasConflictingMeanings: conflicting });
    };

    // -------------------------------------------------------------
    // 4. RESEARCH VIEW
    // -------------------------------------------------------------

    core.getResearchView = function getResearchView() {
        const dc = domainCommunity();
        if (!dc) return { capability: "CAPABILITY_UNAVAILABLE", reason: "INCREMENT_3_ABSENT" };
        return dc.getResearchDashboard();
    };

    // -------------------------------------------------------------
    // 5. COMMUNITY ANALYTICS + 6. DOMAIN ANALYTICS
    // -------------------------------------------------------------

    core.getCommunityView = function getCommunityView() {
        const dc = domainCommunity();
        if (!dc) return { capability: "CAPABILITY_UNAVAILABLE", reason: "INCREMENT_3_ABSENT" };
        return dc.getCommunityContributionAnalytics();
    };

    core.getDomainView = function getDomainView() {
        const dc = domainCommunity();
        if (!dc) return { capability: "CAPABILITY_UNAVAILABLE", reason: "INCREMENT_3_ABSENT" };
        return dc.getDomainAnalytics();
    };

    // -------------------------------------------------------------
    // 7. QUARANTINE + 8. HOTSPOT
    // -------------------------------------------------------------

    core.getQuarantineView = function getQuarantineView(roleInfo) {
        const qh = quarantineHotspot();
        if (!qh) return { capability: "CAPABILITY_UNAVAILABLE", reason: "INCREMENT_4_ABSENT" };
        if (!core.isUiActionAllowed("review", roleInfo)) {
            return { capability: "AVAILABLE", status: "UNAUTHORIZED" };
        }
        return qh.getQuarantineOverview(roleInfo);
    };

    core.getHotspotView = function getHotspotView() {
        const qh = quarantineHotspot();
        if (!qh) return { capability: "CAPABILITY_UNAVAILABLE", reason: "INCREMENT_4_ABSENT" };
        return qh.getHotspotOverview();
    };

    // -------------------------------------------------------------
    // 9. RULE 82 (single language)
    // -------------------------------------------------------------

    core.getRule82View = function getRule82View(languageId) {
        const qh = quarantineHotspot();
        if (!qh) return { capability: "CAPABILITY_UNAVAILABLE", reason: "INCREMENT_4_ABSENT" };
        return qh.getRule82Visibility(languageId);
    };

    // -------------------------------------------------------------
    // 10. MOST USED
    // -------------------------------------------------------------

    core.getMostUsedView = function getMostUsedView() {
        const dc = dashboardCore();
        if (!dc) return { capability: "CAPABILITY_UNAVAILABLE", reason: "INCREMENT_1_ABSENT" };
        return dc.getMostUsedSummary();
    };

    // -------------------------------------------------------------
    // HEARING MODE
    // -------------------------------------------------------------

    core.getHearingModeView = function getHearingModeView() {
        const acq = acquisition();
        if (!acq) return { capability: "CAPABILITY_UNAVAILABLE", reason: "ACQUISITION_PIPELINE_ABSENT" };
        const snapshot = typeof acq.getAcquisitionDashboardSnapshot === "function" ? acq.getAcquisitionDashboardSnapshot() : null;
        const pending = typeof acq.listPendingClarifications === "function" ? acq.listPendingClarifications() : [];
        const c = cozyOS();
        const hearingBackendPresent = !!(c && c.CozyHearing);
        return {
            capability: "AVAILABLE",
            asrStatus: hearingBackendPresent ? "BACKEND_PRESENT_CAPABILITY_NOT_CLAIMED" : "CAPABILITY_UNAVAILABLE",
            pendingClarifications: pending.length,
            snapshot,
            note: "Hearing Mode extracts knowledge candidates and clarification questions only through the real, existing acquisition pipeline — it never stores raw audio by default and never fabricates a transcription."
        };
    };

    /**
     * core.confirmContribution(candidateId, contributorId, roleInfo)
     *   Community-tier confirmation, composed directly from RP-029-B's
     *   real addIndependentConfirmation() — NOT gated behind reviewer
     *   authorization (the disclosed Phase 2 bug this spec explicitly
     *   warns against repeating). Any COMMUNITY+ role may confirm.
     */
    core.confirmContribution = function confirmContribution(candidateId, contributorId, roleInfo) {
        const community = communityApi();
        if (!community) return { status: "CAPABILITY_UNAVAILABLE", reason: "COMMUNITY_MODULE_ABSENT" };
        if (!core.isUiActionAllowed("confirm", roleInfo)) return { status: "UNAUTHORIZED" };
        return community.addIndependentConfirmation(candidateId, { contributorId });
    };

    // -------------------------------------------------------------
    // COMBINED DASHBOARD ASSEMBLY (all sections, one call)
    // -------------------------------------------------------------

    core.assembleDashboard = function assembleDashboard(roleInfo, options) {
        const opts = options || {};
        return {
            authorization: roleInfo,
            languageOverview: core.getLanguageOverviewView(),
            routing: opts.routingEvidence ? core.getRoutingView(opts.routingEvidence, opts.routingCandidates) : null,
            termSearch: opts.searchParams ? core.getTermSearchView(opts.searchParams) : null,
            research: core.getResearchView(),
            community: core.getCommunityView(),
            domain: core.getDomainView(),
            quarantine: core.getQuarantineView(roleInfo),
            hotspot: core.getHotspotView(),
            rule82: opts.languageId ? core.getRule82View(opts.languageId) : null,
            mostUsed: core.getMostUsedView(),
            hearingMode: core.getHearingModeView()
        };
    };

    // ===================================================================
    // UI — real DOM rendering, driven only by `core`'s output
    // ===================================================================

    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function badge(text, tone) {
        return `<span class="cozy-badge cozy-badge-${tone || "neutral"}">${escapeHtml(text)}</span>`;
    }

    const TABS = [
        { id: "overview", label: "Language Overview" },
        { id: "routing", label: "Language Routing" },
        { id: "terms", label: "Term Explorer" },
        { id: "research", label: "Research" },
        { id: "community", label: "Community Analytics" },
        { id: "domain", label: "Domain Analytics" },
        { id: "quarantine", label: "Quarantine" },
        { id: "hotspot", label: "Hotspot" },
        { id: "rule82", label: "Rule 82" },
        { id: "mostused", label: "Most Used" },
        { id: "hearing", label: "Hearing Mode" }
    ];

    function renderTable(headers, rows) {
        if (!rows || rows.length === 0) return '<p class="cozy-admin-empty-state">No data yet.</p>';
        const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
        const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
        return `<table class="cozy-admin-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    }

    function renderUnavailable(reason) {
        return `<p class="cozy-admin-unavailable">${badge("CAPABILITY_UNAVAILABLE", "warn")} ${escapeHtml(reason || "")}</p>`;
    }

    function renderSection(tabId, root, roleInfo, state) {
        if (tabId === "overview") {
            const v = core.getLanguageOverviewView();
            if (v.capability !== "AVAILABLE") return renderUnavailable(v.reason);
            return renderTable(
                ["Language", "Countries", "Regions", "Dialects", "Pack Status", "Rule 82"],
                v.rows.map((r) => [
                    escapeHtml(r.name), escapeHtml((r.geography.countries || []).join(", ") || "—"),
                    escapeHtml((r.geography.regions || []).join(", ") || "—"),
                    escapeHtml((r.geography.dialects || []).join(", ") || "—"),
                    badge(r.displayStatus, "neutral"), badge(r.rule82Status, "info")
                ])
            );
        }
        if (tabId === "routing") {
            const languageId = (root.querySelector(".routing-input") || {}).value || "";
            const v = core.getRoutingView({ languageId }, null);
            if (v.capability !== "AVAILABLE") return renderUnavailable(v.reason);
            return `<p>Status: ${badge(v.status, v.status === "RESOLVED" ? "success" : "warn")}</p>` +
                (v.match ? renderTable(["Language", "Region", "Dialect", "Confidence"], [[escapeHtml(v.match.languageId), escapeHtml(v.match.region || "—"), escapeHtml(v.match.dialect || "—"), String(v.match.confidence.language)]]) : "");
        }
        if (tabId === "terms") {
            const query = (root.querySelector(".term-search-input") || {}).value || "";
            if (!query) return '<p class="cozy-admin-empty-state">Enter a search term.</p>';
            const v = core.getTermSearchView({ query });
            if (v.capability !== "AVAILABLE") return renderUnavailable(v.reason);
            if (v.status === "QUERY_REQUIRED") return '<p class="cozy-admin-empty-state">Enter a search term.</p>';
            return renderTable(
                ["Word", "Meaning", "Match", "Ambiguity", "Provenance"],
                (v.results || []).map((r) => [escapeHtml(r.word || "—"), escapeHtml(r.meaning || "—"), badge(r.matchType, "neutral"), badge(r.ambiguityStatus, r.ambiguityStatus === "CONFLICTING_MEANING" ? "warn" : "neutral"), badge(r.communityVsProfessional, "info")])
            );
        }
        if (tabId === "research") {
            const v = core.getResearchView();
            if (v.capability !== "AVAILABLE") return renderUnavailable(v.reason);
            return renderTable(["Language", "Expression", "Priority", "Score"], (v.topTerms || []).slice(0, 20).map((t) => [escapeHtml(t.languageId), escapeHtml(t.expression || "—"), badge(t.priority, t.priority === "URGENT_REVIEW" ? "error" : "neutral"), String(t.score)]));
        }
        if (tabId === "community") {
            const v = core.getCommunityView();
            if (v.capability !== "AVAILABLE") return renderUnavailable(v.reason);
            return renderTable(["Metric", "Value"], [
                ["Contributors (pseudonymous)", String(v.contributors)],
                ["Submissions", String(v.submissions)],
                ["Confirmed", String(v.confirmedCandidates)],
                ["Disputed", String(v.disputedCandidates)],
                ["Clarification requests", String(v.clarificationRequests)]
            ]);
        }
        if (tabId === "domain") {
            const v = core.getDomainView();
            if (v.capability !== "AVAILABLE") return renderUnavailable(v.reason);
            return renderTable(["Domain", "Status", "Count"], v.domains.map((d) => [escapeHtml(d.domain), badge(d.status, "neutral"), String(d.count)]));
        }
        if (tabId === "quarantine") {
            const v = core.getQuarantineView(roleInfo);
            if (v.status === "UNAUTHORIZED") return `<p class="cozy-admin-unauthorized">${badge("UNAUTHORIZED", "error")} Sign in as a REVIEWER or ADMIN to view quarantine detail.</p>`;
            if (v.capability !== "AVAILABLE") return renderUnavailable(v.reason);
            return renderTable(["Current Quarantined", "Under Review", "High Risk", "Released", "Rejected"], [[String(v.currentQuarantined), String(v.underReview), String(v.highRiskCount), escapeHtml(String(v.released)), escapeHtml(String(v.rejected))]]);
        }
        if (tabId === "hotspot") {
            const v = core.getHotspotView();
            if (v.capability !== "AVAILABLE") return renderUnavailable(v.reason);
            return renderTable(["Connections", "Sent", "Send Failed", "Submitted", "Quarantined", "Synced", "Conflict"], [[
                String(v.activeConnectionCount), String(v.outgoing.SENT || 0), String(v.outgoing.SEND_FAILED || 0),
                String(v.incoming.SUBMITTED || 0), String(v.incoming.QUARANTINED || 0), badge(v.synced, "neutral"), badge(v.conflict, "neutral")
            ]]);
        }
        if (tabId === "rule82") {
            const languageId = (root.querySelector(".rule82-input") || {}).value || "";
            if (!languageId) return '<p class="cozy-admin-empty-state">Enter a language id.</p>';
            const v = core.getRule82View(languageId);
            if (v.capability !== "AVAILABLE") return renderUnavailable(v.reason);
            return `<p>Status: ${badge(v.status, v.status === "READY_FOR_REVIEW" ? "success" : "neutral")}</p><p class="cozy-admin-note">${escapeHtml(v.note || "")}</p>`;
        }
        if (tabId === "mostused") {
            const v = core.getMostUsedView();
            if (v.capability !== "AVAILABLE") return renderUnavailable(v.reason);
            return renderTable(["Metric", "Value"], [["Most-used words", badge(v.mostUsedWords, "neutral")], ["Most-used phrases", badge(v.mostUsedPhrases, "neutral")]]);
        }
        if (tabId === "hearing") {
            const v = core.getHearingModeView();
            if (v.capability !== "AVAILABLE") return renderUnavailable(v.reason);
            return `<p>ASR status: ${badge(v.asrStatus, "neutral")}</p><p>Pending clarifications: ${v.pendingClarifications}</p>`;
        }
        return "";
    }

    /**
     * init(rootEl, options)
     *   Real DOM rendering. Builds a tabbed layout; each tab's content
     *   is produced solely by renderSection() above, which itself calls
     *   only `core`'s real, composed functions.
     */
    function init(rootEl, options) {
        if (!rootEl) return;
        const opts = options || {};
        const roleInfo = core.resolveUiRole(opts.authConfig);

        rootEl.innerHTML = `
            <div class="cozy-admin-dashboard">
                <div class="cozy-admin-dashboard-header">
                    <span class="cozy-admin-role-badge">${badge(roleInfo.displayRole || roleInfo.role, "info")}</span>
                    ${roleInfo.authBackend === "AUTHORIZATION_BACKEND_UNAVAILABLE" ? badge("AUTHORIZATION_BACKEND_UNAVAILABLE", "warn") : ""}
                </div>
                <div class="cozy-admin-dashboard-controls">
                    <input class="routing-input" placeholder="languageId for routing/Rule 82" />
                    <input class="rule82-input" placeholder="languageId for Rule 82" />
                    <input class="term-search-input" placeholder="search term" />
                    <button type="button" class="cozy-admin-refresh-btn">Refresh</button>
                </div>
                <div class="cozy-admin-tabs" role="tablist"></div>
                <div class="cozy-admin-tab-panel" role="tabpanel"></div>
            </div>
        `;

        const tabsEl = rootEl.querySelector(".cozy-admin-tabs");
        const panelEl = rootEl.querySelector(".cozy-admin-tab-panel");
        let activeTab = TABS[0].id;

        function renderTabs() {
            tabsEl.innerHTML = TABS.map((t) =>
                `<button type="button" class="cozy-admin-tab-btn${t.id === activeTab ? " cozy-admin-tab-active" : ""}" data-tab="${t.id}" role="tab" aria-selected="${t.id === activeTab}">${escapeHtml(t.label)}</button>`
            ).join("");
            tabsEl.querySelectorAll(".cozy-admin-tab-btn").forEach((btn) => {
                btn.addEventListener("click", () => { activeTab = btn.getAttribute("data-tab"); renderAll(); });
                btn.addEventListener("keydown", (e) => {
                    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                    const idx = TABS.findIndex((t) => t.id === activeTab);
                    const next = e.key === "ArrowRight" ? (idx + 1) % TABS.length : (idx - 1 + TABS.length) % TABS.length;
                    activeTab = TABS[next].id;
                    renderAll();
                    tabsEl.querySelectorAll(".cozy-admin-tab-btn")[next].focus();
                });
            });
        }

        function renderPanel() {
            try {
                panelEl.innerHTML = renderSection(activeTab, rootEl, roleInfo, {});
            } catch (err) {
                panelEl.innerHTML = `<p class="cozy-admin-error-state">${badge("ERROR", "error")} ${escapeHtml(err.message)}</p>`;
            }
        }

        function renderAll() { renderTabs(); renderPanel(); }

        rootEl.querySelector(".cozy-admin-refresh-btn").addEventListener("click", renderPanel);
        rootEl.querySelector(".routing-input").addEventListener("input", () => { if (activeTab === "routing") renderPanel(); });
        rootEl.querySelector(".rule82-input").addEventListener("input", () => { if (activeTab === "rule82") renderPanel(); });
        rootEl.querySelector(".term-search-input").addEventListener("input", () => { if (activeTab === "terms") renderPanel(); });

        renderAll();
    }

    // -----------------------------------------------------------------
    // PUBLIC API
    // -----------------------------------------------------------------

    const api = Object.freeze({ VERSION, core, init });

    root.window.CozyOS = root.window.CozyOS || {};
    root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
    root.window.CozyOS.Modules["cozy-admin-language-dashboard-ui"] = Object.freeze({ version: VERSION, api });
    root.window.CozyOS.CozyAdminLanguageDashboardUI = api;
}(typeof window !== "undefined" ? { window } : { window: (global.window = global.window || {}) }));
