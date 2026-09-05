# CP5 Improvement Report

**Milestone:** CP5 — CozyOS Android Runtime Foundation
**Date:** 2026-08-28

## IMP-CP5-001: Verify environment assumptions from the code, not the filename

**Observation:** The task assumed a "runtime/bootstrap" concept could
plausibly already exist somewhere in the repo under that name. Before
writing anything, `core/bootstrap/bootstrap.js` was opened and read in
full rather than assumed-relevant-by-name. It turned out to be entirely
browser-scoped (`window`, `document`, `navigator`, `location`) — usable
by `chalzydashboard.html`, unusable under plain Node.js/Termux. This
determined the whole shape of the work: `runtime/` had to be a new,
additive directory, not an extension of `core/bootstrap/`.

**Why this is reusable:** The repository evidence rule ("do not
assume — use repository evidence") already applies broadly, but this is
a specific, recurring failure mode worth naming: a file's name or its
place in the directory tree is not proof of what environment it assumes.
Two files named similarly ("bootstrap") in the same repo can target
completely different runtimes. Recommended standing practice: before
extending anything described as an entry point/bootstrap/runtime, read
it far enough to confirm which environment (browser, Node, both) it
actually assumes, before deciding whether to extend it or build
alongside it.

**Where this is recorded for reuse:** `docs/builder/knowledge/lessons-learned.md`
→ "Runtime/Platform Patterns".

## Scope note

This report intentionally contains one finding, not a padded list. The
rest of CP5's work (reusing `createBoundaryServer` as-is, gating
`require.resolve` health checks, the writable-directory fallback chain)
is recorded as implementation detail in `runtime/README.md` and the CP5
checkpoint doc rather than inflated into separate "improvements" —
none of it exposed a process-level lesson beyond the one above.
