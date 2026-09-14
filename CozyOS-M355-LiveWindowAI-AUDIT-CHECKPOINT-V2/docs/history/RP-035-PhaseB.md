# RP-035 — Phase B: ChurchOS LDCE Attendance & Pastor/Admin Geographic Analytics

Consolidated, append-only Phase B record. Individual checkpoints kept
short, working records at the time (per explicit instruction); this
file is the single traceable history tying them together, written at
Checkpoint 3 and re-verified directly in this environment rather than
copied from prior claims.

## Lineage

```
COS-RP035-PHB1  (Checkpoint 1 — Attendance Foundation)
      SHA-256: 0e0779c20f3fab6d483fd0957979ce93af33b45a3471d909f52422917319cb4f
      full name: CozyOS-main-RP-035-PhaseB-Checkpoint1-AttendanceFoundation.zip
      ↓
COS-RP035-PHB2  (Checkpoint 2 — Geography + Pastor/Admin Authorization)
      SHA-256: 37a920b2396f9177dae673324178424c2a9058cfb26d7c94ad318cb9d1fa007b
      full name: CozyOS-main-RP-035-PhaseB-Checkpoint2-GeoAnalyticsAuth.zip
      ↓
COS-RP035-PHB3  (Checkpoint 3 — Final Integration & Certification)
      baseline consumed: COS-RP035-PHB2 (above)
```

Note on naming: the short `COS-RP035-PHBn` identifier scheme was
adopted at Checkpoint 3 for production artifact filenames going
forward. It is a naming convention only — it does not change, and is
not represented as changing, any file bytes, hash, or prior
certification. The full descriptive names above remain the ones
originally certified at Checkpoints 1 and 2 and are preserved here for
traceability.

A discrepancy is disclosed rather than silently resolved: the
Checkpoint 2 delivery message quoted the Checkpoint 1 baseline hash as
`f0f45048fefe85d7bd46179267e2b69ac710bef76dd22156d3632c0fef6d90a4`,
but LATEST.md's own Checkpoint 1 entry (verified directly, in this
ZIP, in this session) records `0e0779c20f3fab6d483fd0957979ce93af33b45a3471d909f52422917319cb4f`.
The Checkpoint 1 ZIP itself was not re-uploaded to this session, so
neither value could be independently re-verified against the original
artifact here. This is recorded as an open discrepancy, not resolved
in either direction — treat LATEST.md's in-repo value as the
provisional reference until the original Checkpoint 1 ZIP is
re-verified.

## Checkpoint 1 — Attendance Foundation (summary; full detail in LATEST.md)

Added `core/modules/ChurchOS/church-live-attendance.js`, a pure
composition over the real `LDCESessionEngine` roster — no new storage,
no new join/leave logic. `getViewerAttendance()` is the only
viewer-facing surface and returns `{available, attending}` only, never
names, roles, userIds, or geography. Section 16's
`cozy-live-session.js` (bounded 1:1 peer transport) confirmed
untouched. 12 new tests, all driving the real `ldce-session-engine.js`
through its actual API. Disclosed, not touched: `modules/live/cozy-live.js`'s
separate `recordAttendance()`/`listAttendance()` sink;
`church-membership-bridge.js`'s manual check-in attendance.

## Checkpoint 2 — Geography + Pastor/Admin Authorization (summary; full detail in LATEST.md)

Added `core/modules/ChurchOS/church-attendance-geography.js` —
`getPastorAdminAnalytics(sessionId, requesterUserId)`, fail-closed at
every step. Authorization is composed from real, existing engines
only: `IdentityEngine.isPlatformAdmin()`, or a matching real `orgId`
plus a real `OrganizationRole` holding the
`attendance:analytics-view` permission and assigned to the requester —
no `if (role === "admin")` shortcut anywhere. Per-country counts read
live from each participant's real, consented `IdentityEngine.getUser().country`;
missing country is reported honestly as `"Unknown"`, never guessed.
No Organization "home country" field exists anywhere in the
repository (confirmed by direct audit) — "Local area" is anchored to
the *requester's own* real country instead, and returns
`{available:false, reason:"LOCATION_DATA_UNAVAILABLE"}` when the
requester has none on file, rather than inventing one. One additive,
one-line fix to `identity-engine.js`'s `getUser()` to surface
`country`/`orgId` fields it already stored but never returned. 14 new
tests, all driving the real `ldce-session-engine.js`,
`organization-registry.js`, and `organization-role.js`.

## Checkpoint 3 — Final Integration & Certification (this record)

No new features, no new engines, no new files under `core/modules/ChurchOS/`.
This checkpoint's entire job was to verify the full Phase B stack
together, exactly as delivered, and produce one consolidated,
traceable governance record. Everything below was re-run directly in
this session against the Checkpoint 2 ZIP — none of it is copied
forward from prior claims without independent re-verification.

### Full regression (real, re-run in this session)

Ran all 79 `*.test.js` files in the repository via `node --test`.
Result: **147 tests, 92 pass, 55 fail.** This matches the number
LATEST.md's own Checkpoint 2 entry claimed — re-verified independently
here, not assumed. The 55 failures are the same disclosed,
pre-existing set: document-understanding coordinator/comparison/
classification tests and bridge/audio/camera/media-pipeline/playback/
scene engine tests. None touch `ChurchOS`, `ldce-session-engine.js`,
`identity-engine.js`, `organization-registry.js`,
`organization-role.js`, or Section 16's live-session code.

### Phase B tests in isolation (real, re-run in this session)

- `core/modules/ChurchOS/test/church-live-attendance.test.js` (Checkpoint 1): **12/12 PASS.**
- `core/modules/ChurchOS/test/church-attendance-geography.test.js` (Checkpoint 2): **14/14 PASS**, including the subtest confirming Checkpoint 1's `church-live-attendance.js` still loads and behaves identically alongside Checkpoint 2.

### Verified architectural guarantees (checked directly against source in this session)

- Viewer-facing attendance (`getViewerAttendance()`) returns only `{available, attending}` — confirmed by direct read of `church-live-attendance.js`, unchanged since Checkpoint 1.
- Pastor/Admin analytics (`getPastorAdminAnalytics()`) is authorization-gated at every branch, composed from real `IdentityEngine`/`OrganizationRole` facts, fail-closed on any missing engine, unknown session, or unauthorized requester.
- Country data is sourced only from each user's own real, consented `IdentityEngine.getUser().country` (confirmed at identity-engine.js:1023) — never derived from IP, GPS, phone number, language, or calling code.
- Missing country is reported as `"Unknown"`, never fabricated — confirmed in `church-attendance-geography.js`.
- "Local area" is anchored to the authorized requester's own real country, or honestly reports `LOCATION_DATA_UNAVAILABLE` — no Organization "home country" field exists anywhere in the repository, confirmed by direct grep/read audit.
- No invented `orgId` relationship — `orgId` is only ever the real, existing field already stored on each `IdentityEngine` user record.
- `modules/live/cozy-live.js` (4,341 lines) present and unmodified by Phase B; its separate `recordAttendance()`/`listAttendance()` sink remains disclosed-but-untouched, as at Checkpoints 1 and 2.
- `core/shell/live/cozy-live-session.js` (Section 16, 425 lines) present and unmodified by Phase B.
- No duplicate attendance engine: `church-live-attendance.js` and `church-attendance-geography.js` both compose the single real `LDCESessionEngine` roster; neither introduces independent storage.

### Not independently re-verified this session (disclosed limitation)

The byte-identity audits described in Checkpoint 1 and Checkpoint 2's
own LATEST.md entries (diffing against a fresh extraction of the
*prior* certified ZIP) were performed in those sessions, against
artifacts not present in this one. This session re-verified the
*current* state of the Checkpoint 2 ZIP directly (tests, source
reads, regression) but did not re-diff Checkpoint 2 against a fresh
Checkpoint 1 extraction, because the Checkpoint 1 ZIP was not
re-uploaded here. This is disclosed rather than silently assumed.

### Checkpoint 3 certification

- Integrity: Checkpoint 2 ZIP SHA-256 re-computed in this session and matched the value on record (`37a920b2...9d1fa007b`) — PASS
- Fresh extraction: clean — PASS
- Phase B tests: 12/12 (Checkpoint 1) + 14/14 (Checkpoint 2) — PASS
- Full regression: 92/147 pass, 55/147 fail, identical pre-existing failure set, none in Phase B scope — PASS
- Architectural guarantees: re-verified directly against source in this session — PASS
- Governance: this consolidated record + LATEST.md + HANDOFF.md + RELEASES.md updated — PASS
- Byte-identity vs. Checkpoint 1: not re-verified this session (no Checkpoint 1 ZIP available here) — DISCLOSED, not silently assumed

## Known inherited issues (carried forward, unchanged, out of Phase B scope)

- The same 55 pre-existing test failures present since before Phase B began (document-understanding and bridge/audio/camera/media/playback/scene modules).
- `modules/live/ourcozy-live.test.js` requires a file that does not exist anywhere in this repository (`core/modules/live/ourcozy-live.js`) — broken path, pre-existing, unrelated to Phase B.
- `modules/live/cozy-live.js`'s separate attendance sink remains unreconciled with LDCE-derived attendance — left as an open, disclosed question, not resolved by Phase B.
- `church-membership-bridge.js`'s manual check-in attendance remains a separate, already-flagged org-model duplication (since ChurchOS C001) — not touched by Phase B.
