# M376 — Continuation Report

Companion to `docs/builder/handoffs/M376.md`. Where the handoff is the
permanent record, this document is the practical "start here" for
whoever (human or Builder session) picks this up next.

## Read Order

1. `docs/builder/handoffs/LATEST.md` (now points to `M376.md`)
2. `docs/builder/handoffs/M376.md`
3. `docs/builder/compose/M376-compose-report.md`
4. `docs/builder/reports/m376-evidence-engine-verification.md`
5. This file

## State of the Repository Right Now

- Baseline: `CozyOS-M375-output.zip`, plus this milestone's additive
  changes only.
- One new file: `core/modules/builder/evidence-engine.js`.
- One modified file: `dashboard.html` (single script tag).
- Six new/updated documentation files under `docs/builder/`:
  the M376 compose report, verification report, implementation report,
  improvement report, this continuation report, the M376 handoff, and
  the `LATEST.md` pointer update.
- No production code outside `core/modules/builder/` and `dashboard.html`
  was touched. No registry content was modified — all 8 knowledge
  registries were read, never written to.

## The One Thing to Check Before Doing Anything Else

Call `window.CozyOS.BuilderEvidence.getPatternReadiness()` live,
against whatever the repository's *current* state is when you read
this — not the numbers recorded in this session's reports, which are
already a point-in-time snapshot. If `patternDetectionJustified` is
still `false`, do not build a Pattern/Recommendation/Confidence engine
yet, regardless of what the original M377 preview described. If it is
`true`, that's real signal a Pattern Engine compose review can now
legitimately begin from.

## Fastest Path to Verifying This Session's Work Yourself

```bash
node --check core/modules/builder/evidence-engine.js
grep -n "evidence-engine.js" dashboard.html
grep -c "^## RP-" docs/builder/knowledge/repair-history-registry.md
grep -c "^## RG-" docs/builder/knowledge/regression-registry.md
```

The last two commands should show `2` and `0` respectively, matching
this session's `getRepairEvidence()`/`getRegressionEvidence()` output
exactly — if they don't, the repository has changed since this report
was filed, and `getPatternReadiness()`'s live numbers (not this
document) are the ones to trust.

## Open Items Carried Forward (unchanged from what M375 already flagged, still true)

1. Browser Runtime verification — still not done, now two milestones
   overdue. Node `vm` smoke tests are not a substitute.
2. Whether `core/modules/leaning/learning-engine.js` should be wired
   into an HTML entry point — still orphaned, not this milestone's job.
3. Whether the Layer 1-3 version-guard defect (found and fixed only in
   the M375 file) is worth its own correction milestone — still open.

## New Open Item From This Milestone

4. Whether an evidence-snapshot persistence mechanism is worth
   building, if growth-over-time tracking becomes a real priority
   before natural repair/regression accumulation crosses the
   SUFFICIENT threshold on its own. Not decided here — flagged only.
