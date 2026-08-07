# Cozy Builder — Lessons Learned & Best Practices

First entry filed under Builder Rule 55 (Continuous Improvement & Version Evolution). This file accumulates across milestones — new entries are appended, existing entries are never deleted (only superseded in place with a note, matching the discipline already used for Rule 54's mid-session revision).

---

## Engineering Patterns

- **Tiered capability structure (Tier A / Tier B / Tier C).** When building any Builder engine that analyzes or extends prior layers' output: Tier A = compose only, zero new parsing, built entirely from already-verified signals. Tier B = minimal, narrowly-scoped, deterministic new extraction, explicitly authorized per item, never AI inference. Tier C = honestly unimplemented where no signal exists, tracked in a registry (`AA-NNN`), never fabricated. First used: M373 Layer 3 Analysis Engine.
- **Reuse a composer's own derived data, never its inputs.** `analysis-engine.js`'s circular-dependency finding reuses `Layer2GraphComposer`'s own `#detectCycles()` output verbatim rather than re-running cycle detection — avoids two implementations of the same algorithm silently drifting apart.

## Repair Patterns

- **First entries filed M374**, repairing the 4 syntax errors SF-001–004 identified in M372/M373. Full records: `knowledge/repair-history-registry.md` (RP-001, RP-002).
- **Check for self-duplication before assuming a syntax error is a typo.** RP-001's root cause was the file containing its own `Actions`/`QuarryConstants` block twice, with an orphaned fragment dangling between the copies — `grep -n "^const "` for repeated top-level declarations catches this fast.
- **A file "found in an earlier milestone" is not confirmation of a complete source until you check the hash.** RP-002 initially looked recoverable via `Layer2` and 12 historical milestone packages (M173–M373); every one was byte-identical to the broken version. Twelve independent-looking sources sharing one MD5 is not twelve pieces of evidence — it's one piece of evidence that the breakage predates all of them.
- **When a file is genuinely incomplete (not just malformed) and no authoritative source exists anywhere, reconstruct structure only — never invented values.** RP-002's reconstructed files use empty objects/placeholder values (`Categories = {}`, `_immutableHeaderKeys = []`) rather than plausible-looking guesses, specifically so a fabricated value can't be mistaken for a recovered one. Confidence is reported per-file, not as one blanket "fixed" status — `bandwidth.js`'s empty `_immutableHeaderKeys` is a real functional gap (nothing is protected from CRITICAL_LOW shedding), not a cosmetic placeholder, and is flagged for human review rather than silently shipped.
- **Cross-reference symbols before inferring their values.** Before guessing at `codecIdentifier`, `ESTIMATED_SAVINGS_RATIO`, etc., search the whole repo (not just the broken file) for every call site — `sync.js`'s `import { BinaryCompressor } from "./compression.js"` recovered the real class name and constructor shape for RP-002 without any guessing.

## Architecture Patterns

- **Self-registration IIFE + `registerCoordinator` retry loop** is this codebase's universal module-wiring idiom — every new Builder engine should follow it exactly (see `analysis-engine.js`'s tail block) rather than inventing a variant.
- **`window.CozyOS.<Name>` is the real dependency signal**, not `require()`/`import` — confirmed repo-wide (zero internal matches) as of M372, reconfirmed unchanged as of M373's full-repository harness run.

## Security Patterns

- Deterministic regex heuristics (`eval(`, `Function(`, unsafe `innerHTML`, inline handlers, insecure storage) are a legitimate first-pass signal but must always carry `confidence: "verified-pattern-match"` rather than a stronger claim — a regex match is not proof of an exploitable defect, and every M373 Tier B finding says so explicitly in its own `recommendedRepair` field.

## Performance Patterns

- No profiling capability exists in this sandbox (no real browser/device) as of M373 — any future performance finding must either come from real-device instrumentation or be honestly logged as unmeasurable, never estimated.

## Regression Patterns

- **`vm.createContext` Node-level harnesses need explicit stubs** for `setInterval`/`clearInterval`/`document`/`crypto.randomUUID`/`registerCoordinator` before any standard Builder engine will load — first hit and resolved in M373's harness construction; recorded here so it isn't re-discovered from scratch in a future session.
- **Order matters when stubbing `window.CozyOS`:** `registerCoordinator` must be attached to `window.CozyOS` *before* any engine's self-registration IIFE runs, not after — an ordering bug hit once during M373 harness construction, fixed by moving the stub above the `load()` calls.

## Evidence-Gating Patterns

- **A live re-check costs almost nothing compared to a wrong build.** M377 spent one Node script (a real `fetch()` shim reading actual registry files, not a mocked value) to independently re-confirm what M374/M375/M376 had each already found — that pattern-detection evidence remains insufficient. That single live call is what prevented a fourth-generation Builder layer from being built on 2 repair records and an empty regression registry. When a prior milestone's handoff says "check this live before proceeding," doing so literally, with real data, is cheap insurance against fabricating structure that isn't there.
- **"Insufficient Evidence" is a valid, complete milestone outcome**, not a failure to be padded out with speculative implementation anyway. The Compose Report structure itself (ownership/dependency/composition/signal/gap analysis) is useful and complete even when Phase 7 never runs.

## Best Practices

- Run the Node-level runtime harness at two scales before certifying a new Builder engine: (1) a small synthetic repository with deliberately injected, known defects — to prove detection actually works, not just that the code runs; (2) the full real repository — to prove it survives real scale and real irregular data without crashing. Established in M373; recommended as standing practice for every future Builder engine (see IMP-002 in `docs/builder/improvements/M373-improvement-report.md` for making this reusable rather than hand-authored per session).
