# Cozy Builder — Regression Registry (RG)

Standing, empty as of this pass. No regression has been found in any
Builder pass to date. The M372 workspace's own change (adding a missing
script tag + real retry logic to `AuthCoordinator`, per Rule 4 — fix
regressions before adding features) was itself a regression *fix*, not
a new regression — see `observations/M372/00-observation-report.md` §6.

An entry is opened here (RG-NNN) only when Builder confirms a previously
working capability now fails, with before/after evidence — never from
a design concern or a stylistic disagreement, which belong in an
Architecture Ambiguity (AA) record instead.

## Required Entry Template (M380)

No automated regression-detection engine exists in this repository —
confirmed by repository-wide search this milestone. Filing an RG entry
is, and remains, a human/Builder judgment call made during real
verification work, the same way RP entries are. This template exists
so that when a real regression is found, it is logged completely and
consistently on the first pass, matching the discipline already
established for RP entries:

```
## RG-NNN — <file/capability> — <one-line description>

**Previously working:** <what capability existed and worked, with the
milestone/commit where it was last confirmed working>
**Now failing:** <what fails now, with the exact error/behavior>
**Evidence (before):** <how "working" was confirmed at the time>
**Evidence (after):** <how "failing" was confirmed now — real output,
not description>
**Root cause:** <what change introduced the regression, if known>
**Regression window:** <milestone range it was introduced in, if
determinable>
**Repair status:** <open / repaired as RP-NNN>
**Confidence:** <High / Medium / Low, with reasoning>
```

**M380 verification (this pass):** a full regression sweep was run
against every previously-established security/session property (M373,
M373.1, M374 work — unenrolled login flow, MFA challenge-token gate,
password-bypass closure, Living Recovery Vault owner/admin boundary).
All four passed with no change in behavior. **Registry remains
honestly empty — no regression exists to log.**
