<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>CozyOS Certification Center</title>
<link rel="stylesheet" href="certification-dashboard.css" />

<!--
  This is the ONLY place PDF generation capability is added, and it's purely
  additive: jsPDF is a layout library (turns text/shapes into a real PDF
  binary) — it does not execute anything, and the dashboard never feeds it
  anything except already-generated report text. If this CDN is unreachable
  (offline install), PDF export degrades to "use your browser's Print ->
  Save as PDF on the HTML report" instead of failing silently — see
  certification-dashboard.js's exportAs("pdf") path.
-->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" defer></script>

<!--
  Adjust the src="..." values below to wherever these files actually live
  in your deployment — this assumes they're siblings of this HTML file
  under the same paths used throughout CozyOS: core/modules/certification/,
  core/registry/, core/shell/, core/modules/builder/, core/modules/bugfixer/.

  Startup ORDER does not matter for correctness: every coordinator below
  registers itself with Service Registry using a retry mechanism, and this
  dashboard resolves WorkspaceShell/ServiceRegistry/BugFixer/Builder live on
  every use rather than capturing them once — so a script loading "late"
  still ends up connected once it does load. What does NOT self-heal is a
  script being MISSING from this file entirely: if cozy-bugfixer.js is never
  included below, "Repair with CozyBugFixer" will correctly and permanently
  say "not connected", because there is genuinely nothing to connect to.
-->

<!-- Required: the certification engine itself. -->
<script src="cozy-certification.js" defer></script>

<!-- Service Registry — the single coordinator catalog. -->
<script src="../../registry/cozy-registry.js" defer></script>

<!-- Workspace Shell — file registry, Developer Actions data layer, the
     one real write-gate for repaired files. -->
<script src="../../shell/cozy-workspace.js" defer></script>

<!-- CozyBuilder's dependency chain, in order: rules -> templates -> AI
     planner -> the orchestrator itself. -->
<script src="../builder/builder-rules.js" defer></script>
<script src="../builder/builder-templates.js" defer></script>
<script src="../builder/builder-ai.js" defer></script>
<script src="../builder/cozy-builder.js" defer></script>

<!-- CozyBugFixer — the repair engine "Repair with CozyBugFixer" and
     "Open with CozyBugFixer" call into. -->
<script src="../bugfixer/cozy-bugfixer.js" defer></script>

<!-- Optional: CozyAIMode, if you want the AI-assisted repair path. Safe to
     omit entirely — everything above works fully offline without it. -->
<!-- <script src="../aimode/cozy-ai-mode.js" defer></script> -->

<!-- This dashboard itself. -->
<script src="certification-dashboard.js" defer></script>
</head>
<body>
    <div id="cozy-cert-dashboard-root">
        <noscript>The CozyOS Certification Center requires JavaScript.</noscript>
    </div>
</body>
</html>
