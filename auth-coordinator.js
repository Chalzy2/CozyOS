/**
 * CozyOS Enterprise Design System Integration
 * Module: Developer Hub
 * File Reference: applications/developer/developer-hub.css
 * (Bridges the Developer Hub to the unified CozyOS Core Theme Engine)
 */

/* 1. Pull in the centralized UI Core Framework styles */
@import url("../../core/ui/cozy-tokens.css");
@import url("../../core/ui/cozy-theme.css");
@import url("../../core/ui/cozy-layout.css");
@import url("../../core/ui/cozy-components.css");
@import url("../../core/ui/cozy-animations.css");

/* 2. Map Legacy Dashboard variables directly to CozyOS Core Enterprise Tokens */
:root {
    --cz-bg: var(--cozy-bg-gradient);
    --cz-panel: var(--cozy-glass-bg);
    --cz-panel-alt: rgba(10, 12, 22, 0.3);
    --cz-sidebar: rgba(6, 8, 14, 0.85);
    --cz-sidebar-hover: rgba(255, 255, 255, 0.05);
    --cz-sidebar-active: var(--cozy-brand-primary);
    --cz-border: rgba(255, 255, 255, 0.08);
    --cz-text: #f1f5f9;
    --cz-text-muted: var(--cozy-muted);
    --cz-text-inverse: #ffffff;
    --cz-accent: var(--cozy-brand-primary);
    --cz-accent-soft: var(--cozy-brand-glow);
    
    /* Semantic Status Indicators mapped to dynamic app palette configurations */
    --cz-critical: #ef4444;
    --cz-high: #f97316;
    --cz-medium: var(--cozy-brand-accent);
    --cz-low: #3b82f6;
    --cz-info: #10b981;
    --cz-waived: #a855f7;
    --cz-ready: #10b981;
    --cz-warn: var(--cozy-brand-accent);
    --cz-blocked: #ef4444;
    
    /* Dynamic UI Framework Rules */
    --cz-radius: var(--cozy-radius-md);
    --cz-shadow: var(--cozy-glass-shadow);
    --cz-font: var(--cozy-font-sans);
    --cz-mono: var(--cozy-font-mono);
}

/* 3. Global Styles (Stripped of conflicting layout rules) */
html, body {
    /* No manual height or grid configurations here; handled by cozy-layout.css */
    font-family: var(--cz-font);
    color: var(--cz-text);
    -webkit-font-smoothing: antialiased;
}

/* Apply CozyOS Glass styles to all standard card containers */
.cz-card, .cz-panel, .cz-vault-card {
    background: var(--cozy-glass-bg) !important;
    backdrop-filter: var(--cozy-glass-blur);
    -webkit-backdrop-filter: var(--cozy-glass-blur);
    border: var(--cozy-glass-border) !important;
    box-shadow: var(--cozy-glass-shadow) !important;
    border-radius: var(--cz-radius) !important;
    color: var(--cz-text) !important;
}

/* Apply Unified Forms to input elements */
textarea.cz-input, input.cz-input, select.cz-input {
    background: rgba(255, 255, 255, 0.03) !important;
    border: var(--cozy-glass-border) !important;
    border-radius: 8px !important;
    color: #fff !important;
    transition: border-color var(--cozy-transition-fast) !important;
}
textarea.cz-input:focus, input.cz-input:focus, select.cz-input:focus {
    border-color: var(--cozy-brand-primary) !important;
    outline: none !important;
}

/* Apply Universal Styling to Action Buttons */
.cz-btn {
    border: var(--cozy-glass-border) !important;
    border-radius: 8px !important;
    background: rgba(255, 255, 255, 0.03) !important;
    color: #fff !important;
    font-family: var(--cozy-font-sans) !important;
    transition: all var(--cozy-transition-fast) !important;
}
.cz-btn:hover {
    background: rgba(255, 255, 255, 0.08) !important;
    border-color: var(--cozy-brand-primary) !important;
}
.cz-btn.cz-btn-primary {
    background: var(--cozy-brand-primary) !important;
    border-color: var(--cozy-brand-primary) !important;
    color: #000 !important; /* Keep text high-contrast against Cozy Green */
}
.cz-btn.cz-btn-primary:hover {
    box-shadow: 0 0 15px var(--cozy-brand-glow);
    opacity: 0.9;
}

/* Redesign Sidebar matching OS-level look and feel */
.cz-sidebar {
    background: rgba(6, 8, 14, 0.7) !important;
    backdrop-filter: var(--cozy-glass-blur);
    -webkit-backdrop-filter: var(--cozy-glass-blur);
    border-right: var(--cozy-glass-border);
}
.cz-sidebar-brand {
    color: #fff !important;
}
.cz-sidebar-brand .cz-dot {
    background: var(--cozy-brand-primary) !important;
    animation: cozyPulse 2s infinite;
}

/* Integrate Dynamic Topbar */
.cz-topbar {
    background: rgba(10, 12, 22, 0.4) !important;
    backdrop-filter: var(--cozy-glass-blur);
    -webkit-backdrop-filter: var(--cozy-glass-blur);
    border-bottom: var(--cozy-glass-border) !important;
}

/* Progressive Table Row Hover Tweaks */
table.cz-table tr:hover td {
    background: rgba(255, 255, 255, 0.03) !important;
}

/* GPU performance transitions for loading overlays */
.cz-progress-overlay {
    background: rgba(6, 8, 14, 0.8) !important;
    backdrop-filter: var(--cozy-glass-blur);
    -webkit-backdrop-filter: var(--cozy-glass-blur);
}
.cz-progress-box {
    background: var(--cozy-glass-bg) !important;
    border: var(--cozy-glass-border) !important;
    box-shadow: var(--cozy-glass-shadow) !important;
}

/* =====================================================================
 * Developer Hub — Application-Specific Widget Styles
 * (Developer cards, Builder/Certification/OCR/Dashboard/Module Explorer/
 * BugFixer widgets — everything that renders inside
 * #cozy-developer-hub-root only. No body/html/sidebar/topbar/statusbar/
 * global theme rules below — those are owned by core/ui, per the
 * CozyOS Phase 3 UI Architecture rule.)
 * ===================================================================== */

#cozy-developer-hub-root h1 { font-size: 20px; margin: 0 0 4px; }
#cozy-developer-hub-root h2 { font-size: 15px; margin: 24px 0 10px; color: var(--cz-text); }
#cozy-developer-hub-root h3 { font-size: 13px; margin: 16px 0 8px; color: var(--cz-text-muted); text-transform: uppercase; letter-spacing: .04em; }
.cz-subtitle { color: var(--cz-text-muted); font-size: 13px; margin: 0 0 20px; }

.cz-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; margin-bottom: 8px; }
.cz-card {
    background: var(--cz-panel); border: 1px solid var(--cz-border); border-radius: var(--cz-radius);
    padding: 16px; box-shadow: var(--cz-shadow);
}
.cz-card-label { font-size: 11px; color: var(--cz-text-muted); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; }
.cz-card-value { font-size: 22px; font-weight: 700; }
.cz-card-sub { font-size: 12px; color: var(--cz-text-muted); margin-top: 4px; }

.cz-panel {
    background: var(--cz-panel); border: 1px solid var(--cz-border); border-radius: var(--cz-radius);
    padding: 18px 20px; margin-bottom: 18px; box-shadow: var(--cz-shadow);
}

.cz-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.cz-btn {
    font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
    border: 1px solid var(--cz-border); background: var(--cz-panel); color: var(--cz-text);
    border-radius: 8px; padding: 8px 14px; transition: background .12s ease, border-color .12s ease;
}
.cz-btn:hover { background: var(--cz-panel-alt); }
.cz-btn.cz-btn-primary { background: var(--cz-accent); border-color: var(--cz-accent); color: #fff; }
.cz-btn.cz-btn-primary:hover { background: #1d4ed8; }
.cz-btn.cz-btn-danger { background: #fff; border-color: var(--cz-critical); color: var(--cz-critical); }
.cz-btn:disabled { opacity: .5; cursor: not-allowed; }

textarea.cz-input, input.cz-input, select.cz-input {
    font: 13px var(--cz-mono); width: 100%; border: 1px solid var(--cz-border); border-radius: 8px;
    padding: 10px 12px; background: var(--cz-panel-alt); color: var(--cz-text);
}
input.cz-input, select.cz-input { font-family: var(--cz-font); }
textarea.cz-input { min-height: 220px; resize: vertical; }

.cz-field { margin-bottom: 12px; }
.cz-field label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 5px; color: var(--cz-text-muted); }

.cz-badge { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; }
.cz-badge-critical { background: #fee2e2; color: var(--cz-critical); }
.cz-badge-high { background: #ffedd5; color: var(--cz-high); }
.cz-badge-medium { background: #fef9c3; color: var(--cz-medium); }
.cz-badge-low { background: #dbeafe; color: var(--cz-low); }
.cz-badge-info { background: #dcfce7; color: var(--cz-info); }
.cz-badge-waived { background: #f3e8ff; color: var(--cz-waived); }
.cz-badge-ready { background: #dcfce7; color: #166534; }
.cz-badge-warn { background: #fef9c3; color: #854d0e; }
.cz-badge-blocked { background: #fee2e2; color: #991b1b; }
.cz-badge-neutral { background: #eef0f5; color: var(--cz-text-muted); }

table.cz-table { width: 100%; border-collapse: collapse; font-size: 13px; }
table.cz-table th, table.cz-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--cz-border); }
table.cz-table th { color: var(--cz-text-muted); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; }
table.cz-table tr.cz-row-clickable { cursor: pointer; }

.cz-defect { border-left: 4px solid var(--cz-border); background: var(--cz-panel-alt); border-radius: 0 8px 8px 0; padding: 10px 14px; margin-bottom: 10px; }
.cz-defect.sev-critical { border-color: var(--cz-critical); }
.cz-defect.sev-high { border-color: var(--cz-high); }
.cz-defect.sev-medium { border-color: var(--cz-medium); }
.cz-defect.sev-low { border-color: var(--cz-low); }
.cz-defect.sev-info { border-color: var(--cz-info); }
.cz-defect.waived { border-color: var(--cz-waived); opacity: .8; }
.cz-defect pre { background: #0f172a; color: #e2e8f0; padding: 8px 10px; border-radius: 6px; overflow-x: auto; font-size: 12px; margin: 6px 0 0; }

.cz-empty { color: var(--cz-text-muted); font-size: 13px; padding: 18px 0; }

.cz-progress-overlay {
    position: fixed; inset: 0; background: rgba(11, 15, 25, .55);
    display: flex; align-items: center; justify-content: center; z-index: 100;
}
.cz-progress-box {
    background: #fff; border-radius: 12px; padding: 26px 30px; min-width: 300px; text-align: center;
    box-shadow: 0 10px 40px rgba(0,0,0,.25);
}
.cz-spinner {
    width: 34px; height: 34px; border-radius: 50%;
    border: 3px solid var(--cz-border); border-top-color: var(--cz-accent);
    animation: cz-spin .8s linear infinite; margin: 0 auto 14px;
}
@keyframes cz-spin { to { transform: rotate(360deg); } }
.cz-progress-label { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
.cz-progress-sub { font-size: 12px; color: var(--cz-text-muted); margin-bottom: 14px; }
.cz-progress-bar-track { background: var(--cz-border); border-radius: 999px; height: 6px; overflow: hidden; margin-bottom: 14px; }
.cz-progress-bar-fill { background: var(--cz-accent); height: 100%; transition: width .15s ease; }

.cz-drop-zone {
    border: 2px dashed var(--cz-border); border-radius: 10px; padding: 22px; text-align: center;
    color: var(--cz-text-muted); font-size: 13px; margin-bottom: 14px; background: var(--cz-panel-alt);
}
.cz-file-list { font-size: 12px; color: var(--cz-text-muted); margin-top: 6px; }
.cz-file-list span { display: inline-block; background: var(--cz-accent-soft); color: var(--cz-accent); border-radius: 6px; padding: 2px 8px; margin: 2px 4px 0 0; }

.cz-checklist label { display: block; font-size: 13px; padding: 4px 0; }

.cz-not-connected {
    border: 1px dashed var(--cz-border); border-radius: var(--cz-radius); padding: 16px;
    color: var(--cz-text-muted); font-size: 13px; background: var(--cz-panel-alt);
}

.cz-tag-source { font-size: 11px; color: var(--cz-text-muted); }

/* Timeline, health map, dependency tree, progress tracker */
.cz-muted { color: var(--cz-text-muted); font-size: 12px; }
.cz-timeline-step { padding: 4px 0; }
.cz-timeline-arrow { color: var(--cz-text-muted); padding-left: 8px; }
.cz-health-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; margin-bottom: 8px; }
.cz-health-tile { border-radius: 8px; padding: 10px 12px; font-size: 12px; font-weight: 600; color: #fff; }
.cz-health-tile.health-green { background: #16a34a; }
.cz-health-tile.health-yellow { background: #ca8a04; }
.cz-health-tile.health-orange { background: #ea580c; }
.cz-health-tile.health-red { background: #dc2626; }
.cz-health-tile.health-gray { background: #9ca3af; }
.cz-dep-tree-node { padding: 3px 0 3px 18px; border-left: 2px solid var(--cz-border); margin-left: 6px; }
.cz-progress-tracker-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--cz-border); font-size: 13px; }
.cz-scan-meta { font-size: 12px; color: var(--cz-text-muted); margin-bottom: 12px; }

/* Repair Roadmap / Vault */
.cz-roadmap-phase { padding: 8px 0; }
.cz-roadmap-phase-header { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 2px; }
.cz-roadmap-phase-time { font-size: 12px; color: var(--cz-text-muted); margin-top: 2px; }
.cz-roadmap-divider { border-top: 1px dashed var(--cz-border); margin: 8px 0; }
.cz-roadmap-total { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--cz-border); font-size: 13px; }
.cz-vault-card { border: 1px solid var(--cz-border); border-radius: var(--cz-radius); padding: 14px 16px; margin-bottom: 12px; background: var(--cz-panel); }
.cz-vault-card h3 { margin-top: 0; }

/* Developer Workflow Integration */
.cz-dropzone { border: 2px dashed var(--cz-border); border-radius: var(--cz-radius); padding: 20px; text-align: center; margin-bottom: 10px; transition: border-color 0.15s, background 0.15s; }
.cz-dropzone-active { border-color: var(--cz-accent, #2563eb); background: rgba(37, 99, 235, 0.06); }
.cz-dropzone input[type="file"] { margin-top: 10px; }
.cz-dev-actions .cz-row { flex-wrap: wrap; gap: 6px; }
.cz-dev-actions button { font-size: 12px; }

.cz-dev-action-output-panel { display: none; border: 2px solid var(--cz-accent, #2563eb); background: rgba(37, 99, 235, 0.04); margin: 10px 0; }

/* =====================================================================
 * Developer Hub — Sidebar Accordion + Search (Workspace Container
 * Refactor, Phase 1). Scoped to dh- prefixed classes ADDED by
 * developer-hub.html around the existing shell .cozy-nav-item markup.
 * Does not redefine .cozy-nav-item/.cozy-side-navigation/.cozy-nav-menu
 * themselves — those remain shell-owned (core/ui). This only styles the
 * new grouping wrapper and search box that live inside Developer Hub's
 * own #cozy-hub-nav-menu markup.
 * ===================================================================== */

.dh-nav-search-wrap { padding: 10px 12px 4px; }
.dh-nav-search {
    width: 100%; box-sizing: border-box; padding: 8px 10px; font-size: 13px;
    background: rgba(255, 255, 255, 0.04); border: 1px solid var(--cz-border, rgba(255,255,255,0.1));
    border-radius: var(--cz-radius-sm, 6px); color: inherit;
}
.dh-nav-search:focus { outline: none; border-color: var(--cozy-brand-primary, #16a34a); }

.dh-nav-group { display: flex; flex-direction: column; }
.dh-nav-group-header {
    display: flex; align-items: center; justify-content: space-between; width: 100%;
    background: none; border: none; cursor: pointer; font: inherit; color: inherit;
    padding: 8px 14px; text-align: left;
}
.dh-nav-group-title { display: flex; align-items: center; gap: 8px; }
.dh-nav-group-caret { font-size: 11px; opacity: 0.6; transition: transform 0.15s; }
.dh-nav-group.expanded .dh-nav-group-caret { transform: rotate(180deg); }

.dh-nav-group-items { display: none; flex-direction: column; }
.dh-nav-group.expanded .dh-nav-group-items { display: flex; }
.dh-nav-group-items .cozy-nav-item { padding-left: 30px; }

.dh-search-match { outline: 1px solid var(--cozy-brand-primary, #16a34a); outline-offset: -1px; border-radius: var(--cz-radius-sm, 6px); }

/* =====================================================================
 * Developer Hub — Dashboard (Workspace #1: executive control center).
 * Scoped dh- classes only; reuses existing .cz-panel/.cz-badge/.cz-row
 * tokens for everything else.
 * ===================================================================== */

.dh-dash-system-status {
    display: flex; align-items: center; gap: 10px; padding: 12px 16px; font-size: 13px;
}
.dh-status-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.dh-status-healthy .dh-status-dot { background: #16a34a; box-shadow: 0 0 8px rgba(22,163,74,0.6); }
.dh-status-degraded .dh-status-dot { background: #d97706; box-shadow: 0 0 8px rgba(217,119,6,0.5); }

.dh-dash-health-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; margin-top: 10px; }
.dh-health-chip {
    display: flex; flex-direction: column; gap: 2px; padding: 10px 12px;
    border: 1px solid var(--cz-border); border-radius: var(--cz-radius-sm, 6px); background: var(--cz-panel-alt, rgba(255,255,255,0.02));
}
.dh-health-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
.dh-health-ok .dh-health-dot { background: #16a34a; }
.dh-health-down .dh-health-dot { background: #6b7280; }
.dh-health-label { font-size: 12px; font-weight: 700; }
.dh-health-status { font-size: 11px; color: var(--cz-text-muted); }

.dh-dash-quickactions { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-top: 10px; }
.dh-quickaction-card {
    display: flex; flex-direction: column; align-items: flex-start; gap: 4px; text-align: left;
    padding: 14px; border: 1px solid var(--cz-border); border-radius: var(--cz-radius, 8px);
    background: var(--cz-panel); cursor: pointer; font: inherit; color: inherit; transition: border-color 0.15s, transform 0.1s;
}
.dh-quickaction-card:hover { border-color: var(--cozy-brand-primary, #16a34a); transform: translateY(-1px); }
.dh-quickaction-icon { font-size: 20px; }
.dh-quickaction-title { font-weight: 700; font-size: 13px; }
.dh-quickaction-desc { font-size: 11px; color: var(--cz-text-muted); }

.dh-dash-shortcuts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
