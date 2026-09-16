# COS-STEP4D-DEPENDENCY-A — MERGE & INTEGRATION REPORT

**Status: MERGE VERIFIED AND FUNCTIONING for everything the prior interim
patch claimed. Browser dependency remains NOT CERTIFIED — a new, genuine
defect was found during this session's harness run and is NOT fixed.**

## 0. WHAT WAS MERGED

Two inputs, both hash-verified before use:
- `COS-STEP4D-DEPENDENCY-A-CHECKPOINT.zip` — full baseline tree.
  SHA-256 `989ac32abbf1ec5beb1a644b54488cb9182db7799796c0c870fdc967725de282`
  (matches the reference hash cited in the interim patch's own report —
  confirms the patch was built against this exact baseline, not a
  different one).
- `COS-STEP4D-DEPENDENCY-A-PATCH-INTERIM.zip` — differential patch
  (Rule 86 mid-milestone patch): `production-fixes.diff`,
  `governance-index.diff`, one new governance rule file, and a
  non-production `harness/` scaffold.

## 1. MERGE PROCEDURE (reproducible)

1. Fresh, isolated extraction of the checkpoint ZIP.
2. `patch -p1` dry-run then real apply of `production-fixes.diff` — all 5
   hunks applied cleanly, no fuzz, no rejects.
3. `patch -p1` dry-run then real apply of `governance-index.diff` — clean.
4. Added `docs/builder/rules/31-interruption-safety-mid-milestone-patch-rule.md`
   (Rule 86). SHA-256 of the added file:
   `dcfaf8cff5346dcc6013166b80b2753864f0bfd2a6ef6c65fdbd462d94fe0656` —
   **matches exactly** the hash claimed in the patch's own report.
5. Copied non-production `harness/` scaffold into the merged tree.

## 2. AUDITS (all reproducible, not narrated)

- **Protected-file audit:** `core/modules/founder-story/*` and
  `core/shell/cozy-login-gate.js` — `diff` against fresh baseline: no
  output, byte-identical. Confirmed.
- **Whole-tree byte-identity audit:** `diff -rq` of fresh baseline vs.
  merged tree shows **exactly 6 files differ** — the 5 production
  browser-assignment fixes plus `docs/builder/rules/00-INDEX.md` — and
  nothing else in the tree changed. Matches the patch's own claim
  exactly.
- **Harness library copies:** all 6 files under `harness/lib/` are
  byte-identical to their corresponding post-fix production files.
  Confirmed by `diff`, not assumed.

## 3. NODE REGRESSION — RE-RUN, NOT TRUSTED FROM NARRATIVE

- Scoped test set (`core/modules/media`, `server/live-relay`,
  `core/modules/communication`): confirmed exactly 20 test files present,
  matching the claimed count. Ran all 20: **181/181 PASS, 0 FAIL.**
- `core/shell/live/tests/cozy-live-session.test.js`: **52/52 PASS, 0
  FAIL.**
- Both counts match the interim patch's claims exactly — the merge did
  not regress anything, and the 5-file UMD fix is confirmed safe for the
  Node path.

## 4. BROWSER HARNESS — RUN THIS SESSION, NEW FINDINGS

The prior session left the harness un-run to completion. This session
ran it for real (Playwright + Chromium, `--use-fake-device-for-media-stream`):

**Confirmed fixed (from the prior session's patch):**
- No `TypeError: ... is not a constructor` anywhere in this run. All 5
  classes construct correctly from `window.CozyOS.X` in a real browser
  page. The UMD defect is genuinely resolved.
- Token issuance, fail-closed rejection of unrecognized users, device
  enumeration, mic permission grant, and the hard SPEAKING_ALLOWED gate
  for unauthorized users all **PASS** for real, in a real browser.

**New genuine defect found (production code, not the harness):**
`RemoteRelayTransportProvider` (`core/shell/live/providers/cozy-live-remote-relay-transport-provider.js`)
only opens a WebSocket connection lazily, inside `publishSource()`,
`publishTranslatedSegment()`, and `joinViewer()`. Every other action
method (`requestSpeak`, `grantSpeak`, `revokeSpeak`, `selfMute`, etc.)
requires a connection to already exist and fails closed with
`"No active connection for session."` if not. There is no method that
lets a **host/publisher** participant open a connection before
requesting permission to speak — `joinViewer()` is viewer-only. This is
a real chicken-and-egg gap: a host cannot request-to-speak without a
connection, and the only host-role path to a connection
(`publishSource`) itself requires already being authorized to speak.
This caused every downstream check in the harness run (grant/revoke,
chunk publish/receive, fan-out, mute/unmute, language-change) to fail
or short-circuit — not because those subsystems are broken, but because
the host connection was never established in the first place.

**Harness driver bug (not production):** `run-harness.js` itself
crashed later in the run with `ReferenceError: HOST_ID is not defined`
inside a `page.evaluate()` closure — a scoping bug in the driver script,
separate from the connection-gap finding above.

Neither of these was fixed in this session. Per the project's own
honesty-over-completeness principle, both are reported as found, not
patched speculatively — a fix to `RemoteRelayTransportProvider`'s
connection lifecycle is production logic and warrants the full
implement → test → audit cycle, not a same-session guess.

## 5. NOT VERIFIED (unchanged in kind from the prior patch, narrower in scope)

- Full fake-device flow end-to-end — still not passing, now for a
  **known, specific, named reason** (§4) instead of an unknown one.
- One-upstream/many-viewers fan-out, mute/unmute round trip, mid-session
  language change, disconnect/reconnect isolation — all blocked on the
  same host-connection gap.
- Physical hardware, real Internet, real TURN/SFU — unchanged, still out
  of scope for a fake-device Chromium harness.

## 6. DELIVERABLE

`COS-STEP4D-DEPENDENCY-A-MERGED.zip` — full merged working tree.
- SHA-256 (computed twice, matching):
  `fe53feabd691aaed21acf1620c844c8d8e5311d07bd5b0ffcead87e392496c87`
- `unzip -t`: no errors.
- Fresh extraction vs. source tree: byte-identical (`diff -rq`, no
  output).

This ZIP is a **verified merge**, not a certification of the browser
dependency — Dependency A remains incomplete per §4/§5.

## 7. NEXT BUILD MUST START WITH

Fix `RemoteRelayTransportProvider` so a host/publisher participant has a
real way to establish a connection before `requestSpeak()` — either a
new explicit `connectAsHost(sessionId, sub)` method mirroring
`joinViewer()`, or relaxing `requestSpeak()`/etc. to lazily open via
`_connectionFor()` the same way `publishSource()` does. Then fix the
`HOST_ID` scoping bug in `harness/run-harness.js`, re-run the harness to
a clean `results.json`, and only then resume certification.
