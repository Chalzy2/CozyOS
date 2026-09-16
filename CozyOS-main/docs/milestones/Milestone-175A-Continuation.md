# Milestone 175A — Platform Ownership Reconciliation

**Project:** CozyOS Enterprise
**Milestone ID:** 175A
**Status:** Certified

> **Gate 0:** Baseline for this milestone — `CozyOS-main-v1_3_1-M174.zip`,
> `CozyOS-main` repository, locked at the start of this conversation. All
> findings, ownership decisions, implementation, and certification below
> apply only to that baseline.

---

## Origin

Discovered during Gate 1 (Repository Verification) while assessing the
repository as a candidate baseline for a proposed Admin Access milestone.
Gate 1 returned Outcome B (conflicts found) and halted per governance —
per the Constitution, that is a successful Gate 1 outcome, not a failed
one. Milestone 175A was scoped specifically to resolve those conflicts
before any Admin Access implementation begins.

---

## Repository State

**Verification status:** Certified — repository, static, and re-run Gate 1
checks all passed (see Verification below). Runtime and Browser Runtime
verification were not performed — see Verification for why.

**Files modified:**
- `dashboard.html` — seven `<script src>` path corrections (see Path
  Corrections below). No script reordering; no tags added or removed.

**Files created:**
- `_archive/platform-ownership/cozy-discovery.js.archived-2026-07-26`
- `_archive/platform-ownership/platform-discovery.js.archived-2026-07-26`
- `_archive/platform-ownership/cozy-background.js.archived-2026-07-26`
- `_archive/platform-ownership/cozy-theme.js.archived-2026-07-26`
- `docs/milestones/Milestone-175A-Continuation.md` (this document)

**Files archived (removed from original path):**
- `core/platform/cozy-discovery.js`
- `core/platform/platform-discovery.js`
- `core/shell/cozy-background.js`
- `core/shell/cozy-theme.js`

**Public API changes:** None. Each canonical file's exported surface
(`window.CozyOS.Discovery`, `.PlatformDiscovery`, `.Background`, `.Theme`)
is byte-identical to its pre-175A content — only the losing duplicate was
removed, not the winning implementation.

---

## Ownership Changes

**Resolved**

- **Discovery**
  Canonical: `core/shell/platform-discovery.js`
  Archived: `core/platform/platform-discovery.js`, `core/platform/cozy-discovery.js`

- **Background**
  Canonical: `core/ui/cozy-background.js`
  Archived: `core/shell/cozy-background.js`

- **Theme**
  Canonical: `core/ui/cozy-theme.js`
  Archived: `core/shell/cozy-theme.js`

**Basis for each decision:** the canonical file in every case was (a) the
one actually loaded by `dashboard.html`, and (b) confirmed by direct diff
to be a strict superset of the archived file's functionality — no
functionality required merging in any of the three cases.

**Third-claimant note (Discovery only):** `core/platform/cozy-discovery.js`
(`CozyDiscoveryEngine`) was never loaded by `dashboard.html` and had zero
live references anywhere in the repository — confirmed via exhaustive
search (imports, dynamic `window.CozyOS.*` lookups, manifest entries,
documentation) before archiving, per your explicit instruction to verify
this case specifically before touching it.

---

## Path Corrections

Two categories of broken `<script src>` reference were found and fixed in
`dashboard.html`, both discovered via Gate 1 review (the second batch only
surfaced once the re-run was made exhaustive across all script tags,
rather than the two paths investigated first):

**Case mismatch** (file exists, but not at the referenced case):
| Before | After |
|---|---|
| `core/modules/mpesaos/mpesaos.js` | `core/modules/MpesaOS/mpesaos.js` |
| `core/modules/shopos/shopos.js` | `core/modules/ShopOS/shopos.js` |

**Wrong directory** (file exists only in a different directory than referenced):
| Before | After |
|---|---|
| `core/ui/cozy-toast.js` | `core/shell/cozy-toast.js` |
| `core/ui/cozy-live.js` | `core/shell/cozy-live.js` |
| `core/vendor-registry.js` | `core/platform/vendor-registry.js` |
| `core/vendor-loader.js` | `core/platform/vendor-loader.js` |
| `core/vendor-diagnostics.js` | `core/platform/vendor-diagnostics.js` |

All seven were confirmed broken on a case-sensitive filesystem check
before correction, and confirmed resolved after.

---

## Verification

**Repository verification:** Confirmed via direct file reads which files
`dashboard.html` actually loads, cross-referenced against every file in
the repository claiming the same `window.CozyOS.*` property, before any
change was made.

**Static verification:** `node --check` passed on every file touched or
newly referenced by this milestone: `core/shell/platform-discovery.js`,
`core/ui/cozy-background.js`, `core/ui/cozy-theme.js`,
`core/modules/MpesaOS/mpesaos.js`, `core/modules/ShopOS/shopos.js`,
`core/shell/cozy-toast.js`, `core/shell/cozy-live.js`,
`core/platform/vendor-registry.js`, `core/platform/vendor-loader.js`,
`core/platform/vendor-diagnostics.js`.

**Path verification:** Exhaustive check of every `<script src>` in
`dashboard.html` against the filesystem, both before and after each
correction, on a case-sensitive filesystem.

**Runtime verification:** Not required for this milestone. 175A's changes
are limited to file archival (no logic altered in any canonical file) and
`<script src>` path string corrections (no reordering, no new load-time
behavior). There is no new or modified runtime logic for a Node harness to
exercise beyond what static/path verification already confirms.

**Browser Runtime verification:** Not performed. This environment has no
browser execution available. Per governance, this is recorded honestly as
not performed rather than assumed from the Node-based checks above.

**Gate 1 re-run (final):**
- Ownership conflicts: 0
- Broken script paths: 0
- Result: **PASSED**

---

## Known Limitations

- **Browser Runtime Verified was not performed** — all verification above
  is Repository/Static/Path-level. The actual browser load order and
  behavior of `dashboard.html` with these corrected paths has not been
  exercised in a real browser in this environment.
- **`discovery-manifest.json` still contains the stale lowercase path**
  (`core/modules/mpesaos/mpesaos.js`, recorded at a different byte size
  than the real file) — this is a generated inventory file, out of scope
  for 175A, and was not regenerated or edited.
- **Scope was limited to the conflicts and broken paths found during Gate
  1's two passes.** No general audit of the remaining ~140 script tags in
  `dashboard.html` beyond path-resolution was performed (e.g., no review
  of load-order correctness or undeclared inter-file dependencies).

---

## Continuation

**Repository state after Milestone 175A:** Single canonical owner for
Discovery, Background, and Theme; all `dashboard.html` script references
resolve on a case-sensitive filesystem; four superseded files archived
with governance headers explaining the conflict and resolution.

**Known blockers:** None identified for the scope of this milestone.

**Baseline status:** This repository state is the certified baseline for
**Milestone 175B — Admin Access**, per Gate 5.

No future plans are recorded here beyond the above, per the Constitution's
rule that the milestone record contains only completed, verified work.
