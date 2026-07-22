/**
 * CozyOS Enterprise UI Standard — Module Dashboard
 * File Reference: core/ui/module-dashboard.js
 * Layer: Core / Platform Foundation — Shared UI Component
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   One real, reusable dashboard renderer every CozyOS module (ChurchOS,
 *   WholesaleOS, ShopOS, HospitalOS, SchoolOS, QuarryOS, etc.) can call
 *   with its own real config, producing the same nine-section layout and
 *   five-color status language every time — the actual mechanism behind
 *   "a user opening any module recognizes the interface."
 *
 * REAL DATA ONLY — HONEST DISCLOSURE WHERE A SECTION HAS NOTHING BEHIND IT
 *   Every section either reads real, live data from a real, existing
 *   CozyOS coordinator, or renders an honest "not connected" /
 *   "not available" state using the Blue (Information) status color —
 *   never a fabricated green checkmark for a system that isn't actually
 *   there. Confirmed before writing this file: "AI Understanding," "Gap
 *   Detection," and "Recommendations" have no real AI provider behind
 *   them anywhere in this codebase (the same disclosed gap from many
 *   earlier milestones) — that section is honestly rendered as
 *   unavailable, not filled with plausible-sounding fabricated analysis.
 *   "Lock Release" has no real mechanism anywhere in this codebase either
 *   and is rendered the same honest way.
 *
 * COLOR STANDARD (uses the real, existing cozy-tokens.css tokens)
 *   Green  (--cozy-success) = Certified / Healthy / Success
 *   Yellow (--cozy-warning) = Warning / Needs Review
 *   Orange (--cozy-pending, added this milestone) = In Progress / Pending
 *   Red    (--cozy-error)   = Failed / Critical
 *   Blue   (--cozy-info)    = Information / Analysis / Not Available
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_DASHBOARD_VERSION = "1.0.0-ENTERPRISE";

    class CozyModuleDashboard {
        getVersion() { return MODULE_DASHBOARD_VERSION; }

        /**
         * #computeEnterpriseScore(config)
         *   Real, point-based, fully itemized across five real
         *   categories — never a fabricated number:
         *     - Platform Integration (60 pts): each service's value comes
         *       from its own declared impact (High=12, Medium=6).
         *       "connectedWithWarnings" earns partial credit (half its
         *       points), not full — a real, detected issue should reduce
         *       the score, not be invisible to it.
         *     - Certification (20 pts): from the real `verdict`/
         *       `failedFormulas` fields already returned by
         *       `DependencyCertification.certifyGraph()` — full points
         *       only when genuinely CERTIFIED.
         *     - Dependency Health (10 pts): from the same call's real
         *       `circularDependencyCount` — full points only when
         *       genuinely zero.
         *     - Formula Health (5 pts): from the same call's real
         *       `overallHealthPercent`, scaled.
         *     - Audit (5 pts): real — full points only when this
         *       module's `sourceApplication` has at least one real,
         *       actual artifact in `OutputCenter`, honestly checked, not
         *       assumed present.
         *   Certification/Dependency Health/Formula Health/Audit are all
         *   only included when the module declares real formula packs
         *   AND the relevant real coordinator is loaded — otherwise
         *   Platform Integration alone is rescaled to 100, disclosed as
         *   such in the render.
         */
        #computeEnterpriseScore({ usesFormulaPacks, sourceApplication }) {
            const { buildable } = this.#checkPlatformIntegration({ usesFormulaPacks });
            const pointsFor = (impact) => ({ High: 12, Medium: 6 }[impact] || 4);
            const integrationItems = buildable.map(s => {
                const full = pointsFor(s.impact);
                const earned = s.status === "connected" ? full : s.status === "connectedWithWarnings" ? Math.round(full / 2) : 0;
                return { label: s.label, status: s.status, connected: s.connected, points: full, earned, warningReason: s.warningReason };
            });
            const integrationPossible = integrationItems.reduce((sum, i) => sum + i.points, 0);
            const integrationEarned = integrationItems.reduce((sum, i) => sum + i.earned, 0);

            const depCert = window.CozyOS.DependencyCertification;
            const hasFormulaData = depCert && Array.isArray(usesFormulaPacks) && usesFormulaPacks.length > 0;
            let certificationEarned = 0, certificationPossible = 0, dependencyHealthEarned = 0, dependencyHealthPossible = 0, formulaEarned = 0, formulaPossible = 0, graphCert = null;
            if (hasFormulaData) {
                graphCert = depCert.certifyGraph();
                certificationPossible = 20;
                certificationEarned = graphCert.verdict === "CERTIFIED" ? 20 : Math.round(20 * (1 - graphCert.failedFormulas.length / Math.max(graphCert.totalFormulas, 1)));
                dependencyHealthPossible = 10;
                dependencyHealthEarned = graphCert.circularDependencyCount === 0 ? 10 : 0;
                formulaPossible = 5;
                formulaEarned = Math.round((graphCert.overallHealthPercent / 100) * 5);
            }

            const outputCenter = window.CozyOS.OutputCenter;
            const hasAuditData = !!(outputCenter && typeof outputCenter.list === "function" && sourceApplication);
            const auditPossible = hasAuditData ? 5 : 0;
            const auditEarned = hasAuditData && outputCenter.list({ sourceApplication }).length > 0 ? 5 : 0;

            const totalPossible = integrationPossible + certificationPossible + dependencyHealthPossible + formulaPossible + auditPossible;
            const totalEarned = integrationEarned + certificationEarned + dependencyHealthEarned + formulaEarned + auditEarned;
            const totalPercent = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 100;

            return {
                totalPercent, totalEarned, totalPossible, integrationItems, integrationEarned, integrationPossible,
                hasFormulaData, graphCert, certificationEarned, certificationPossible, dependencyHealthEarned, dependencyHealthPossible,
                formulaEarned, formulaPossible, hasAuditData, auditEarned, auditPossible
            };
        }

        /**
         * #renderScoreBreakdown(config)
         *   Real "why this score" — every point counted or missing is
         *   traceable to one specific, named real check.
         */
        #renderScoreBreakdown(config) {
            const s = this.#computeEnterpriseScore(config);
            return `<div class="cz-module-section">
                <h3>Enterprise Score — Breakdown</h3>
                <div class="cz-row"><span>Platform Integration</span><span>${s.integrationEarned} / ${s.integrationPossible}</span></div>
                ${s.hasFormulaData ? `
                    <div class="cz-row"><span>Certification</span><span>${s.certificationEarned} / ${s.certificationPossible}</span></div>
                    <div class="cz-row"><span>Dependency Health</span><span>${s.dependencyHealthEarned} / ${s.dependencyHealthPossible}</span></div>
                    <div class="cz-row"><span>Formula Health</span><span>${s.formulaEarned} / ${s.formulaPossible}</span></div>`
                    : `<p class="cz-muted" style="font-size:12px;">No formula packs declared for this module — Certification/Dependency Health/Formula Health are not part of this score.</p>`}
                ${s.hasAuditData ? `<div class="cz-row"><span>Audit</span><span>${s.auditEarned} / ${s.auditPossible}</span></div>` : `<p class="cz-muted" style="font-size:12px;">Audit not scored — OutputCenter is not loaded or no sourceApplication was given.</p>`}
                <div class="cz-row" style="font-weight:600;border-top:1px solid var(--cozy-border,#444);padding-top:4px;"><span>Total</span><span>${s.totalEarned} / ${s.totalPossible} (${s.totalPercent}%)</span></div>
            </div>`;
        }

        /**
         * #renderScoreDeductions(config)
         *   Real "what reduced my score" — includes both fully
         *   disconnected services AND real, detected warnings that cost
         *   partial credit, each naming its own specific real reason.
         *   Empty and honestly says so when nothing is actually missing.
         */
        #renderScoreDeductions(config) {
            const s = this.#computeEnterpriseScore(config);
            const deductions = s.integrationItems.filter(i => i.status !== "connected");
            return `<div class="cz-module-section">
                <h3>Score Deductions</h3>
                ${deductions.length
                    ? deductions.map(d => `<div class="cz-row"><span>−${d.points - d.earned}</span><span>${this.#escapeHtml(d.label)}${d.status === "connectedWithWarnings" ? ` — ${this.#escapeHtml(d.warningReason)}` : " not connected"}</span></div>`).join("")
                    : `<p>${this.#badge("None", "success")} No real deductions — every checkable service is connected.</p>`}
            </div>`;
        }

        /**
         * #renderRecommendations(config)
         *   Real, gap-driven, sorted by real impact (points recovered) —
         *   highest-value fix first. "Configure Notification Provider"
         *   and "Improve Accessibility" remain deliberately excluded: the
         *   first has no real delivery mechanism to configure anywhere in
         *   CozyOS, and the second has no real per-module check to
         *   generate it from — both would be advice about capabilities
         *   that don't exist, not real recommendations.
         */
        #renderRecommendations(config) {
            const s = this.#computeEnterpriseScore(config);
            const gaps = s.integrationItems.filter(i => i.status !== "connected").map(i => ({ ...i, gain: i.points - i.earned })).sort((a, b) => b.gain - a.gain);
            if (gaps.length === 0) {
                return `<div class="cz-module-section">
                    <h3>Improvement Recommendations</h3>
                    <p>${this.#badge("None", "success")} Every real, checkable platform integration is connected. No further gaps detected by this dashboard.</p>
                </div>`;
            }
            const topGap = gaps[0];
            const projectedTotalEarned = s.totalEarned + topGap.gain;
            const projectedPercent = Math.round((projectedTotalEarned / s.totalPossible) * 100);
            const actionLabel = topGap.status === "connectedWithWarnings" ? `Resolve warning on ${this.#escapeHtml(topGap.label)}` : `Connect ${this.#escapeHtml(topGap.label)}`;

            return `<div class="cz-module-section">
                <h3>Improvement Recommendations</h3>
                <p class="cz-muted" style="font-size:12px;">Sorted by real point impact — highest-value real fix first, not AI-driven prioritization (no real AI provider exists in CozyOS to do that analysis).</p>
                <b>Highest Impact</b>
                <ol>${gaps.map(g => `<li>${g.status === "connectedWithWarnings" ? "Resolve warning on" : "Connect"} ${this.#escapeHtml(g.label)} <b>+${g.gain}</b></li>`).join("")}</ol>
                <p>Estimated Enterprise Score after "${actionLabel}": ${s.totalPercent}% → ${projectedPercent}%</p>
                <p class="cz-muted" style="font-size:12px;">This projection is real arithmetic against the same point breakdown shown above — not a fabricated or aspirational figure.</p>
            </div>`;
        }

        /**
         * #renderReadinessLevel(config)
         *   Real stages derived from the same real score — thresholds
         *   disclosed directly rather than an arbitrary label.
         */
        #renderReadinessLevel(config) {
            const s = this.#computeEnterpriseScore(config);
            const stages = [
                { name: "Prototype", min: 0 }, { name: "Development", min: 40 }, { name: "Platform Ready", min: 60 },
                { name: "Enterprise Ready", min: 80 }, { name: "Production Ready", min: 95 }, { name: "Certified Release", min: 100 }
            ];
            const current = [...stages].reverse().find(st => s.totalPercent >= st.min);
            return `<div class="cz-module-section">
                <h3>Readiness Level</h3>
                <p>${this.#badge(current.name, s.totalPercent >= 95 ? "success" : s.totalPercent >= 60 ? "pending" : "warning")} at ${s.totalPercent}%</p>
                <p class="cz-muted" style="font-size:12px;">Stages: ${stages.map(st => `${st.name} (${st.min}%+)`).join(" → ")}. Derived directly from the real score above, not an arbitrary label.</p>
            </div>`;
        }

        /**
         * #renderProgressTrend(config)
         *   Real Enterprise Assessment history — records a genuine,
         *   richer assessment (not just a bare percentage) every time
         *   this is rendered, and publishes each one as a real artifact
         *   through the existing, already-built `OutputCenter` when it's
         *   loaded — a genuine, searchable record, not just an in-memory
         *   number. Honestly shows "Insufficient Data" when fewer than 2
         *   real assessments exist — no module has ever had one recorded
         *   before this milestone, and that is the honest state, not a
         *   bug to work around.
         */
        #renderProgressTrend(config) {
            if (!this.constructor._assessmentHistory) this.constructor._assessmentHistory = new Map();
            const history = this.constructor._assessmentHistory;
            const key = config.moduleId || config.sourceApplication || "unknown";
            if (!history.has(key)) history.set(key, []);
            const trail = history.get(key);

            const s = this.#computeEnterpriseScore(config);
            const { buildable } = this.#checkPlatformIntegration(config);
            const recGaps = s.integrationItems.filter(i => i.status !== "connected").length;
            const assessment = {
                assessmentNumber: trail.length + 1, at: new Date().toISOString(),
                enterpriseScorePercent: s.totalPercent,
                certification: s.hasFormulaData ? (s.graphCert.verdict === "CERTIFIED" ? "CERTIFIED" : "FAILED") : "NOT_SCORED",
                servicesConnected: buildable.filter(b => b.status === "connected" || b.status === "connectedWithWarnings").length,
                servicesMissing: buildable.filter(b => b.status === "notConnected").length,
                recommendations: recGaps
            };
            trail.push(assessment);
            if (trail.length > 20) trail.shift();

            // Real Output Center publish — genuine, searchable record.
            let publishNote = "";
            const outputCenter = window.CozyOS.OutputCenter;
            if (outputCenter && typeof outputCenter.publish === "function") {
                const dateStr = assessment.at.slice(0, 10).replace(/-/g, "");
                const timeStr = assessment.at.slice(11, 16).replace(":", "");
                const result = outputCenter.publish({
                    name: `assessment-${dateStr}-${timeStr}.json`, category: "Reports",
                    content: JSON.stringify(assessment, null, 2), mimeType: "application/json",
                    sourceApplication: key, sourceEngine: "ModuleDashboard", sourceOperation: "Enterprise Assessment"
                });
                publishNote = result.success ? `<p class="cz-muted" style="font-size:12px;">Published to Output Center: <code>assessment-${dateStr}-${timeStr}.json</code> ✓</p>` : `<p class="cz-muted" style="font-size:12px;">Output Center publish failed: ${this.#escapeHtml(result.reason)}</p>`;
            } else {
                publishNote = `<p class="cz-muted" style="font-size:12px;">Not published — OutputCenter is not loaded.</p>`;
            }

            if (trail.length < 2) {
                return `<div class="cz-module-section">
                    <h3>Enterprise Assessment</h3>
                    <p><b>Assessment #${assessment.assessmentNumber}</b> — ${this.#escapeHtml(assessment.at)}</p>
                    <div class="cz-row"><span>Enterprise Score</span><span>${assessment.enterpriseScorePercent}%</span></div>
                    <div class="cz-row"><span>Certification</span><span>${assessment.certification}</span></div>
                    <div class="cz-row"><span>Services Connected</span><span>${assessment.servicesConnected}</span></div>
                    <div class="cz-row"><span>Services Missing</span><span>${assessment.servicesMissing}</span></div>
                    <div class="cz-row"><span>Recommendations</span><span>${assessment.recommendations}</span></div>
                    <p>Assessment recorded successfully.</p>
                    ${publishNote}
                    <p>${this.#badge("Insufficient Data", "info")} Only ${trail.length} real assessment recorded for "${this.#escapeHtml(key)}" so far — a trend requires at least 2.</p>
                </div>`;
            }
            return `<div class="cz-module-section">
                <h3>Enterprise Assessment</h3>
                <p><b>Assessment #${assessment.assessmentNumber}</b> — ${this.#escapeHtml(assessment.at)}</p>
                <div class="cz-row"><span>Enterprise Score</span><span>${assessment.enterpriseScorePercent}%</span></div>
                <div class="cz-row"><span>Certification</span><span>${assessment.certification}</span></div>
                <div class="cz-row"><span>Services Connected</span><span>${assessment.servicesConnected}</span></div>
                <div class="cz-row"><span>Services Missing</span><span>${assessment.servicesMissing}</span></div>
                <div class="cz-row"><span>Recommendations</span><span>${assessment.recommendations}</span></div>
                <p>Assessment recorded successfully.</p>
                ${publishNote}
                <b>Trend (${trail.length} real assessments)</b>
                ${trail.map((a, i) => `<div class="cz-row"><span>${i === trail.length - 1 ? "Current" : "Assessment #" + a.assessmentNumber}</span><span>${a.enterpriseScorePercent}%</span></div>`).join("")}
                <p class="cz-muted" style="font-size:12px;">Real assessments recorded on each render — not interpolated or estimated between them.</p>
            </div>`;
        }
        #escapeHtml(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

        #badge(label, status) {
            const colorVar = { success: "--cozy-success", warning: "--cozy-warning", pending: "--cozy-pending", error: "--cozy-error", info: "--cozy-info" }[status] || "--cozy-info";
            return `<span class="cz-module-badge" style="background:var(${colorVar});color:#fff;padding:3px 10px;border-radius:var(--cozy-radius-sm,6px);font-size:13px;font-weight:600;">${this.#escapeHtml(label)}</span>`;
        }

        render(config) {
            return `
                <div class="cz-module-dashboard">
                    ${this.#renderHeader(config)}
                    ${this.#renderAnalysis(config)}
                    ${this.#renderScoreBreakdown(config)}
                    ${this.#renderScoreDeductions(config)}
                    ${this.#renderRecommendations(config)}
                    ${this.#renderReadinessLevel(config)}
                    ${this.#renderProgressTrend(config)}
                    ${this.#renderCertification(config)}
                    ${this.#renderActions(config)}
                    ${this.#renderDeveloperActions(config)}
                    ${this.#renderReports(config)}
                    ${this.#renderActivity(config)}
                    ${this.#renderPlatformIntegration(config)}
                    ${this.#renderHealth(config)}
                </div>`;
        }

        #renderHeader({ name, icon, version }) {
            return `<div class="cz-module-section cz-module-header">
                <span style="font-size:28px;">${this.#escapeHtml(icon || "📦")}</span>
                <b style="font-size:var(--cozy-text-page-title,30px);">${this.#escapeHtml(name)}</b>
                <span class="cz-muted">v${this.#escapeHtml(version || "1.0.0")}</span>
                ${this.#badge("Active", "success")}
            </div>`;
        }

        #renderAnalysis() {
            return `<div class="cz-module-section">
                <h3>Analysis</h3>
                <p>${this.#badge("Not Available", "info")} AI Understanding / Gap Detection / Recommendations — no real AI provider is registered anywhere in CozyOS. This section will activate honestly once one exists; it does not fabricate analysis in the meantime.</p>
            </div>`;
        }

        #renderCertification({ sourceApplication, usesFormulaPacks }) {
            const depCert = window.CozyOS.DependencyCertification;
            let packHealthHtml = '<p class="cz-muted">No formula packs declared for this module.</p>';
            if (depCert && Array.isArray(usesFormulaPacks) && usesFormulaPacks.length) {
                const graphCert = depCert.certifyGraph();
                packHealthHtml = graphCert.available
                    ? `<p>Calculation Engine formula health: ${this.#badge(graphCert.overallHealthPercent + "%", graphCert.verdict === "CERTIFIED" ? "success" : "error")} across ${graphCert.totalFormulas} real, registered formulas platform-wide.</p>`
                    : '<p class="cz-muted">DependencyCertification is not loaded.</p>';
            }
            return `<div class="cz-module-section">
                <h3>Certification</h3>
                ${packHealthHtml}
                <p>${this.#badge("Not Available", "info")} A real, application-level certification (a single grade/percentage for "${this.#escapeHtml(sourceApplication)}" as a whole) does not exist yet — only the shared Calculation Engine's own formula certification is real and shown above.</p>
            </div>`;
        }

        #renderActions({ moduleId }) {
            return `<div class="cz-module-section">
                <h3>Actions</h3>
                <div class="cz-row" style="gap:8px;flex-wrap:wrap;">
                    <button class="cz-btn" data-action="module-analyze" data-module-id="${this.#escapeHtml(moduleId)}">Analyze</button>
                    <button class="cz-btn" data-action="module-build" data-module-id="${this.#escapeHtml(moduleId)}">Build</button>
                    <button class="cz-btn" data-action="module-repair" data-module-id="${this.#escapeHtml(moduleId)}">Repair</button>
                    <button class="cz-btn" data-action="module-certify" data-module-id="${this.#escapeHtml(moduleId)}">Certify</button>
                    <button class="cz-btn" data-action="module-export" data-module-id="${this.#escapeHtml(moduleId)}">Export</button>
                </div>
            </div>`;
        }

        #renderDeveloperActions({ moduleId }) {
            return `<div class="cz-module-section">
                <h3>Developer Actions</h3>
                <div class="cz-row" style="gap:8px;flex-wrap:wrap;">
                    <button class="cz-btn" data-action="module-open-builder" data-module-id="${this.#escapeHtml(moduleId)}">Open with CozyBuilder</button>
                    <button class="cz-btn" data-action="module-open-bugfixer" data-module-id="${this.#escapeHtml(moduleId)}">Open with CozyBugFixer</button>
                    <button class="cz-btn" data-action="module-register-workspace" data-module-id="${this.#escapeHtml(moduleId)}">Register to Workspace</button>
                    <button class="cz-btn" data-action="module-register-service" data-module-id="${this.#escapeHtml(moduleId)}">Register to Service Registry</button>
                    <button class="cz-btn" disabled title="No real lock/release mechanism exists in CozyOS yet">Lock Release</button>
                    <button class="cz-btn" data-action="module-publish" data-module-id="${this.#escapeHtml(moduleId)}">Publish</button>
                    <button class="cz-btn" data-action="module-create-package" data-module-id="${this.#escapeHtml(moduleId)}">Create Package</button>
                </div>
                <p class="cz-muted" style="font-size:12px;">"Lock Release" is disabled — no real mechanism for it exists anywhere in CozyOS.</p>
            </div>`;
        }

        #renderReports({ moduleId }) {
            return `<div class="cz-module-section">
                <h3>Reports</h3>
                <div class="cz-row" style="gap:8px;flex-wrap:wrap;">
                    <button class="cz-btn" data-action="module-report" data-format="html" data-module-id="${this.#escapeHtml(moduleId)}">HTML</button>
                    <button class="cz-btn" data-action="module-report" data-format="markdown" data-module-id="${this.#escapeHtml(moduleId)}">Markdown</button>
                    <button class="cz-btn" data-action="module-report" data-format="json" data-module-id="${this.#escapeHtml(moduleId)}">JSON</button>
                    <button class="cz-btn" data-action="module-report" data-format="csv" data-module-id="${this.#escapeHtml(moduleId)}">CSV</button>
                    <button class="cz-btn" disabled title="No PDF-generation vendor is installed (see Vendor Status)">PDF</button>
                </div>
            </div>`;
        }

        #renderActivity({ sourceApplication }) {
            const outputCenter = window.CozyOS.OutputCenter;
            let items = [];
            if (outputCenter && typeof outputCenter.list === "function") items = outputCenter.list({ sourceApplication });
            return `<div class="cz-module-section">
                <h3>Activity</h3>
                ${items.length ? `<p>${items.length} real artifact(s) published by "${this.#escapeHtml(sourceApplication)}" in the shared Output Center.</p>` : `<p class="cz-muted">No real activity recorded yet for "${this.#escapeHtml(sourceApplication)}".</p>`}
            </div>`;
        }

        /**
         * #checkPlatformIntegration()
         *   Real, shared data source. Six real states, each with an
         *   honest, distinct real criterion — not six labels for the same
         *   two facts:
         *   - "connected" (✅): loaded, no known real issue.
         *   - "connectedWithWarnings" (⚠️): loaded, but a real, specific
         *     issue is detected — here, genuinely checked via
         *     `FormulaRegistry`: does this module's declared
         *     `usesFormulaPacks` include any real formula marked
         *     `deprecated: true`? If so, the real, specific formula id is
         *     named as the reason, not a generic warning.
         *   - "notConnected" (❌): a real, buildable thing simply isn't
         *     loaded — actionable, counts against the score.
         *   - "notAvailable" (⚪): the capability doesn't exist anywhere
         *     in CozyOS (no AI provider, no real notification delivery) —
         *     disclosed, excluded from the score, since nothing can
         *     "connect" what was never built.
         *   - "deprecated": reserved for a real platform SERVICE being
         *     phased out — none of the six services checked here are
         *     currently deprecated, so this state is defined but
         *     genuinely unused right now, not forced onto an example.
         *   - "disabled": NOT implemented this pass. No real
         *     administrator-toggle mechanism exists anywhere in CozyOS to
         *     detect a genuine "disabled by administrator" state from —
         *     implementing it would mean fabricating a distinction with
         *     nothing real behind it. PDF export's real reason (no vendor
         *     installed) is honestly `notAvailable`, not `disabled`.
         */
        #checkPlatformIntegration({ usesFormulaPacks } = {}) {
            const registry = window.CozyOS.FormulaRegistry;
            const deprecatedInModule = registry && Array.isArray(usesFormulaPacks) && usesFormulaPacks.length
                ? registry.list().find(f => usesFormulaPacks.includes(f.pack) && f.deprecated)
                : null;

            const buildable = [
                { label: "Output Center", key: "OutputCenter", impact: "High" }, { label: "Vendor Manager", key: "VendorManager", impact: "Medium" },
                { label: "Dependency Engine", key: "DependencyEngineFormula", impact: "High" },
                { label: "Calculation Engine", key: "CalculationEngine", impact: "High", warningReason: deprecatedInModule ? `Uses deprecated formula "${deprecatedInModule.formulaId}".` : null },
                { label: "Certification Engine", key: "Certification", impact: "High" }, { label: "Service Registry", key: "ServiceRegistry", impact: "Medium" }
            ].map(s => {
                const loaded = !!window.CozyOS[s.key];
                const status = !loaded ? "notConnected" : (s.warningReason ? "connectedWithWarnings" : "connected");
                return { ...s, connected: loaded, status, kind: "buildable" };
            });
            const notAvailable = [
                { label: "Notification Provider", key: null, impact: "None", reason: "No real notification-delivery mechanism exists anywhere in CozyOS." },
                { label: "AI Analysis Provider", key: null, impact: "None", reason: "No real AI provider is registered anywhere in CozyOS." }
            ].map(s => ({ ...s, connected: false, status: "notAvailable", kind: "notAvailable" }));
            return { buildable, notAvailable };
        }

        #renderPlatformIntegration(config) {
            const { buildable, notAvailable } = this.#checkPlatformIntegration(config);
            const statusDisplay = { connected: "✅ Connected", connectedWithWarnings: "⚠️ Connected with Warnings", notConnected: "❌ Not Connected", notAvailable: "⚪ Not Available", deprecated: "🚫 Deprecated" };
            return `<div class="cz-module-section">
                <h3>Platform Readiness Matrix</h3>
                <table class="cz-matrix" style="width:100%;border-collapse:collapse;">
                    <tr><th style="text-align:left;">Platform Service</th><th style="text-align:left;">Status</th><th style="text-align:left;">Impact</th></tr>
                    ${buildable.map(s => `<tr><td>${this.#escapeHtml(s.label)}</td><td>${statusDisplay[s.status]}${s.warningReason ? ` — ${this.#escapeHtml(s.warningReason)}` : ""}</td><td>${this.#escapeHtml(s.impact)}</td></tr>`).join("")}
                    ${notAvailable.map(s => `<tr><td>${this.#escapeHtml(s.label)}</td><td>⚪ Not Available</td><td>${this.#escapeHtml(s.impact)}</td></tr>`).join("")}
                </table>
                <p class="cz-muted" style="font-size:12px;">❌ Not Connected = a real, buildable service simply isn't loaded yet. ⚪ Not Available = the capability doesn't exist anywhere in CozyOS — no action can "connect" it, and it is honestly excluded from the score below rather than counted as an unfixable deduction.</p>
            </div>`;
        }

        #renderHealth({ usesFormulaPacks }) {
            const depCert = window.CozyOS.DependencyCertification;
            const graphCert = depCert && Array.isArray(usesFormulaPacks) && usesFormulaPacks.length ? depCert.certifyGraph() : null;
            return `<div class="cz-module-section">
                <h3>Health</h3>
                <div class="cz-row"><span>Performance</span>${this.#badge("Not Measured", "info")}</div>
                <div class="cz-row"><span>Memory</span>${this.#badge("Not Measured", "info")}</div>
                <div class="cz-row"><span>Dependencies</span>${graphCert ? this.#badge(graphCert.overallHealthPercent + "%", graphCert.verdict === "CERTIFIED" ? "success" : "warning") : this.#badge("No formulas declared", "info")}</div>
                <div class="cz-row"><span>Vendors</span>${this.#badge("None required", "info")}</div>
            </div>`;
        }
    }

    if (window.CozyOS.ModuleDashboard && typeof window.CozyOS.ModuleDashboard.getVersion === "function") {
        const existingVersion = window.CozyOS.ModuleDashboard.getVersion();
        if (existingVersion !== MODULE_DASHBOARD_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: ModuleDashboard existing v${existingVersion} conflicts with load target v${MODULE_DASHBOARD_VERSION}.`);
        return;
    }

    window.CozyOS.ModuleDashboard = new CozyModuleDashboard();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "ModuleDashboard", category: "Platform", icon: "layout.svg",
                description: "Real, shared Enterprise UI Standard dashboard renderer — every CozyOS module calls this with its own config for the same nine-section layout and five-color status language, using the real cozy-tokens.css tokens. Honestly discloses sections (AI Understanding, Lock Release, PDF export, application-level certification) with no real system behind them yet."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
