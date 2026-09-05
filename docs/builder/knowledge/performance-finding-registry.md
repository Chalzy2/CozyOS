# Cozy Builder — Performance Finding Registry (PF)

Migrated from the M372 observation pass (`observations/M372/00-observation-report.md`
§10) into a structured record.

---

## PF-001 — `core/shell/launch-sequence.css` shrink transition animates layout-triggering properties

**Status:** Open, pre-existing, previously disclosed in `FINAL_UX_AUDIT_REPORT_M366.2.md` item 11 — not newly introduced.

**Finding:** the shrink transition animates `top`/`width` (layout-triggering) rather than pure transforms (`translate`/`scale`), which are compositor-only and cheaper to animate.

**Risk:** minor, deliberately-deferred per the project's own prior audit — not a functional defect, a perf-quality item.

**Resolution note:** no load-time profiling was possible in the M372 pass's sandbox (no real browser). Real-browser confirmation is the same open item the project's own `VERIFICATION_REPORT_M366.2.md` already flagged — not resolved here.
