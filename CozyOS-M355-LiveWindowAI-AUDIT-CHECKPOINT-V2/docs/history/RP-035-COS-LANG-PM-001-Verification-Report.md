# RP-035 COS-LANG-PM-001 — Verification Report

## Procedure

1. Delta ZIP built containing only files added/modified this milestone
   (11 new files + 1 modified `HANDOFF.md` — see Implementation Report for
   the full list).
2. SHA-256 computed twice on the resulting ZIP; both runs required to match.
3. `unzip -t` run against the ZIP.
4. Fresh, isolated extraction into a clean temp directory.
5. File count and directory count of the extraction verified against the
   expected 12 files.
6. The four new test suites re-run **from the fresh extraction** (not the
   original working tree) to confirm the packaged files are complete and
   self-contained, not dependent on anything left behind in the build
   environment.
7. Working tree diffed against the pristine merged baseline (P8-CERTIFIED +
   Phase 2 Part 1) to confirm zero unexpected modifications.

## Results

See the delivery message accompanying `COS-LANG-PM-001-IMPLEMENTED.zip` for
the exact SHA-256 (computed twice, matched) of the final packaged ZIP — a
hash cannot meaningfully be embedded inside the artifact it describes
without invalidating itself, so it is reported alongside delivery rather
than in this file.

| Check | Result |
|---|---|
| SHA-256 run 1 == run 2 | MATCH |
| `unzip -t` | CLEAN |
| Fresh extraction file count | 12 files (as expected) |
| Fresh extraction directory count | matches expected structure |
| Test suites re-run from fresh extraction | 42/42 passed |
| Working-tree diff vs. pristine merged baseline | 12 files added/modified (11 new + `HANDOFF.md`), **0 unexpected changes**, 0 files removed |

## Reconstruction path for the next Builder

```
P8-CERTIFIED + Phase 1 delta + Phase 2 Part 1 delta + COS-LANG-PM-001-IMPLEMENTED delta
```

Extract P8-CERTIFIED → layer Phase 1 → layer Phase 2 Part 1 → layer this
ZIP, in that order, to reproduce the exact working tree this milestone was
built and tested against.

## Explicitly NOT covered by this verification pass

- Physical SD-card test on the Realme device (Termux) — `NOT_TESTED_ON_DEVICE`.
- ChurchOS / WholesaleOS regression — `NOT TESTED` this session.
- Formal repository certification gate — not run; this report only
  supports promotion to `COS-LANG-PM-001-TESTED`, not `CERTIFIED`.

Lifecycle after this report: **COS-LANG-PM-001-TESTED** (pending the two
items above before `CERTIFIED` can be claimed).
