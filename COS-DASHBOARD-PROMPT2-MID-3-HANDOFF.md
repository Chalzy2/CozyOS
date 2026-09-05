# CozyOS Dashboard — Prompt 2 — MID-3 Handoff

## SCOPE OF THIS SESSION
Only §1–§6 of the prompt (Apps surface truthfulness) were built. §7–§28
(Community picker, AI awareness, Settings, admin app extension/removal,
full test matrix, full regression, final checkpoint) are **not started**.
Do not report Prompt 2 as complete.

## WHAT WAS FOUND (real, pre-existing state)
- `core/modules/module-registry.js` already honestly lists only
  `developer-hub`, `shopos`, `mpesaos` — no fabrication there, untouched.
- `core/platform/application-visibility.js` already separates real
  registered applications (`kind: "application"`, from ServiceRegistry)
  from self-declared platform tools (`kind: "platform-tool"`, from a
  `visibility` property coordinators set on themselves).
- A **real gap**: `ChurchOS`, `WholesaleOS`, and `QuarryOS`'s module-level
  declaration already self-declare `visibility.audience === "all"` —
  i.e. their own code already states they're genuine built-in
  capabilities for ordinary users — but `listVisibleApplications()`'s
  end-user branch dropped *all* platform-tools unconditionally,
  including these. So a real declared capability (ChurchOS) was
  invisible to end users. This was the concrete truthfulness bug fixed.
- Confirmed `getRealLaunchPath()` has no real entry for ChurchOS (no
  ChurchOS HTML page exists anywhere in the tree) — so it is honestly
  "Not yet launchable," not wired to a fake path.

## WHAT WAS CHANGED
1. **`core/platform/application-visibility.js`**
   `listVisibleApplications()` now also returns a `capabilities` array
   (separate from `applications`) = real platform-tools with
   `audience === "all"`. Admin/developer/user branches all get it.
   `applications` semantics are unchanged — no existing consumer breaks.
2. **`core/shell/user-dashboard.js`** `#renderAppsSurface()`
   Now renders two labeled sections: "Installed Apps" (real registered
   apps) and "CozyOS Capabilities" (real built-in capabilities, e.g.
   ChurchOS). Each has its own honest empty state. Launch buttons only
   enable when `getRealLaunchPath()` returns a real path; otherwise the
   button reads "Not yet launchable" and is disabled — no fake onclick.
3. **`core/platform/tests/application-visibility.test.js`** (new)
   7 real, executed tests: capabilities separate from applications,
   ChurchOS surfaced correctly, no fabrication without ChurchOS loaded,
   admin sees capabilities too, admin/developer-only tools never leak
   into end-user capabilities, module-registry still has no ChurchOS
   entry, and `getRealLaunchPath("churchOS")` honestly returns `null`.

## TEST RESULTS (this session)
```
core/platform/tests/application-visibility.test.js   7 passed, 0 failed  (new)
core/shell/tests/dashboard-navigation-core.test.js   29 passed, 0 failed (regression)
core/shell/tests/dashboard-community-summary-core.test.js  8 passed, 0 failed (regression)
core/shell/tests/dashboard-settings-admin-boundary-core.test.js  9 passed, 0 failed (regression)
core/shell/tests/launch-sequence-above-only.test.js  0 failed (regression)
```
Not run this session: the full repository-wide test suite (hundreds of
files) — only tests directly touching the changed files/data path were
run. A full regression pass belongs to the next checkpoint before any
"Prompt 2 complete" claim.

## KNOWN LIMITATION
Real browser/device E2E: **NOT VERIFIED** (no browser environment in
this session). Only Node-executed unit tests above were run.

## EXACT NEXT BUILD START
§7 — Community contribution-type picker: inspect the real accepted
schema in `CozyKnowledgeCommunity`/`CozyKnowledgeIngestion` before
building any UI category list.

## CHANGED-FILE HASHES
See `CHANGED-FILE-HASHES-PROMPT2-MID-3.txt`.

## WHOLE-TREE MANIFEST
See `MANIFEST-HASHES-PROMPT2-MID-3.txt` (1,183 files hashed, sha256).

## BYTE DIFF
See `BYTE-DIFF-SINCE-PROMPT2-MID-2.diff`. Confirmed via `diff -rq` against
the trusted baseline that exactly three files differ: the two modified
files plus the one new test file — no other file in the tree drifted.

## TEST RESULTS
See `TEST-RESULTS-PROMPT2-MID-3.txt` — full captured console output.
Summary: 7 new + 46 regression = 53 passed, 0 failed.
