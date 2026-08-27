# M376 — Improvement Report

## What Improved

- Builder can now answer, live and truthfully, the exact question the
  M376 brief opened with: *"Do we now have enough verified evidence to
  learn a repeatable engineering pattern?"* Before this milestone, that
  question could only be answered by a human manually reading 8
  markdown files. Now `window.CozyOS.BuilderEvidence.getPatternReadiness()`
  answers it in one call, against real, freshly-fetched data, every time.
- The 8 knowledge registries went from "documentation Builder cannot
  read at runtime" (M375's explicit, disclosed limitation) to
  "documentation Builder can count entries and statuses from, live."
  This is a genuine capability increase, not a re-statement of one.
- The handoff chain gained a first, narrow, real reader
  (`getMilestoneHistory()`) — previously `available: false` pointer-only
  under M375, now resolves the actual `LATEST.md` → handoff chain and
  reports real file availability.

## What Became Measurable

- Repair evidence: 2 records (was previously only known via a static
  number written into the M375 compose report; now re-derived live
  every call, so it will never silently go stale the way that written
  number already has).
- Regression evidence: 0 records — previously not queryable from the
  runtime at all.
- Registry health across all 8 categories, with open/closed status
  breakdown where the registry supports it (SF: 4 closed; PF: 1 open;
  MD: 2 open/1 closed; AA: 2 open/1 closed; DI: 3 open).
- A fixed, disclosed evidence-level vocabulary now exists
  (NONE→VERIFIED) that any future milestone can reuse without
  reinventing a scoring scale.

## What Remains Impossible (Honestly Disclosed, Not Solved Here)

- **Pattern detection itself.** Two repair records and zero regression
  records is genuinely not enough signal — this isn't a technical
  limitation of this milestone's code, it's a real data limitation of
  the repository as it stands today. `getPatternReadiness()` says so
  truthfully rather than lowering the bar to manufacture a "Ready."
- **Full milestone history.** No browser `fetch()` API can enumerate a
  directory. `getMilestoneHistory()` reads the real `LATEST.md` chain
  and the static version-history document, and says explicitly that a
  full handoff-directory count isn't obtainable this way — it does not
  guess a count from file-naming conventions.
- **"Repeated findings" / "repeated architectures" as first-class
  measurable categories.** The brief asks about these; no registry
  currently tracks them as their own category (see compose report §5).
  Reported as `notTracked` in the compose analysis rather than mapped
  onto an adjacent registry that measures something related but
  different (e.g. DC tracks duplicate *code*, not duplicated *fixes*).
- **Growth over time.** `getLearningProgress()` reports today's totals
  honestly but cannot show a trend, because no prior snapshot exists
  and this engine deliberately persists none of its own (no new
  persistence, matching M375's and this milestone's own compose
  decision). A future milestone would need to explicitly decide to add
  snapshot storage before growth becomes measurable — not decided here.
- **Browser runtime verification.** Same open item M375 left; still
  open (see verification report §9).

## What Should Become M377

Per the brief's own M377 Preview: **do not build the Pattern Engine
yet.** This session's own live evidence run shows Insufficient
Evidence (2 repair, 0 regression records, both below the SUFFICIENT
threshold of 6). Building a Pattern Engine now would repeat the exact
mistake M374/M375/M376 have each independently declined to make.

The honest next step is **not** M377-as-originally-previewed. It is
either:

1. Continue normal engineering work until the repair/regression
   registries accumulate more real entries, then re-run
   `getPatternReadiness()` to check again — no calendar-based or
   guessed trigger; or
2. If growth-over-time tracking is wanted before that happens, a
   narrowly-scoped milestone to decide and build an evidence-snapshot
   persistence mechanism (explicitly not decided or built this
   milestone) — separate from, and a prerequisite to, any real Pattern
   Engine work.

Either way, **M377 should not begin building pattern/recommendation/
confidence logic until a future `getPatternReadiness()` call reports
`patternDetectionJustified: true`** — that field exists specifically
so this decision is never made from a guess again.
