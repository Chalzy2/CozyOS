# M375 — Improvement Report

Opportunities discovered during this milestone, intentionally not
actioned — recorded so a future session doesn't have to rediscover
them.

1. **Version-guard defect in Layer 1-3 files.** `observation-engine.js`
   (and likely other Builder engines following the same copied
   pattern — not individually re-checked this session) has a redundant
   early-return guard that makes its version-conflict throw
   unreachable. Real, verified in `learning-engine.js`'s own smoke
   tests before the fix was applied there. Fixing the Layer 1-3 files
   themselves is a correction milestone of its own (Rule 24 — extend,
   don't reopen, without a dedicated pass), not something to fold into
   M375's scope.

2. **`leaning/learning-engine.js` directory typo.** The existing
   `LearningEngine` lives at `core/modules/leaning/learning-engine.js`
   — the file's own header comment says its reference path should be
   `core/modules/learning/learning-engine.js`. Not renamed here (out
   of scope, not approved, and renaming a loaded file's path without
   updating every reference would itself be a regression risk).

3. **`leaning/learning-engine.js` is not loaded by any HTML entry
   point.** Confirmed via repo-wide grep. It's real, registers
   correctly if loaded, but nothing currently loads it, so
   `BuilderLearning`'s composition of it will report `available: false`
   in the actual running app until that's fixed. Also out of scope for
   M375.

4. **Registries/metrics/handoffs are not runtime-loadable.** No
   existing engine fetches `docs/builder/**` at runtime. Building that
   capability (a real, safe markdown/JSON loader, not a "parser" in the
   speculative sense) would let `BuilderLearning` report real registry
   counts instead of pointers-only. Explicitly out of scope this
   milestone (Do Not Implement: Registry parser/writer) — flagged as a
   real candidate for M376 or later, once justified by an actual need
   for that data at runtime.

5. **Repair-record signal is still thin (2 records).** Unchanged from
   M374's own conclusion. `getPatternReadiness()` reports this
   honestly rather than guessing. No action needed until the count
   grows.
