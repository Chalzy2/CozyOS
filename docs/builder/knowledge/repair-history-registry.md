# Cozy Builder — Repair History Registry (RP)

First entry filed under M374 (Layer 4 — Learning Engine, first pass).
Distinct in scope from `regression-registry.md` (RG): RG tracks a
previously-working capability that broke; RP tracks a confirmed defect
that Builder repaired, with enough detail that a future Builder session
— on a different account, or a different underlying model — can verify
the repair without repeating the investigation.

An entry closes only when `node --check` (or the equivalent for
non-JS files) and a runtime smoke test were actually run in that
session and their real output is recorded below — never asserted from
memory or from a prior session's summary.

---

## RP-035 Phase 1 — Living Media Intelligence & Integration Completion (DELIVERED — RP-034-PHASE8-ANALYSIS-FIELD-GAP CLOSED)

**Defect:** Phase 2's real `record.analysis` field was never updated
by Phase 4's separate analysis-job store — confirmed by reading both
files' real source: `runJob()` (Phase 4) writes only to its own
in-memory `jobs` Map; nothing in Phase 2 or Phase 4 ever calls
`updateRecord(indexId, { analysis: ... })`. First honestly surfaced by
RP-034 Phase 8's own certification (`getIntegrationStatus()`), not
hidden.

**Repair:** new additive coordinator
`core/modules/intelligence/media/cozy-media-analysis-link.js`.
`linkAnalysisToRecord(jobId)` reads the real Phase 4 job, validates
the referenced Phase 2 record still exists, rechecks Phase 6 privacy
via `record.ownerAuthorization.state`, then writes a reference
(`jobId`, `jobType`, `lastUpdated`, `resultReference`) into
`record.analysis` via Phase 2's own real `updateRecord()`. Neither
Phase 2 nor Phase 4's source file was modified.

**Verification (real, executed this session):** `node
core/modules/intelligence/media/tests/cozy-media-analysis-link.test.js`
— 80/80 passing, including a direct assertion that `record.analysis`
stays `NOT_ANALYZED` before linking (reproducing the original defect)
and `COMPLETED` immediately after `linkAnalysisToRecord()` (proving
the repair). Full 61-file pre-existing suite re-run same session: 1484
passing, same pre-existing-unrelated-failure pattern, zero new
failures. Byte-identity diff against an independent fresh extraction
of the baseline confirmed only the two new files exist.

**A future Builder session can verify this repair without repeating
the investigation by:** running the test file above directly, or by
creating a Phase 2 record + Phase 4 `TERM_EXTRACTION` job, calling
`runJob()`, reading `idx.getRecord(indexId).analysis.status` (expect
`NOT_ANALYZED`), calling `link.linkAnalysisToRecord(jobId)`, then
re-reading the same field (expect `COMPLETED`).

---

## RP-034 Phase 8 — Final Integration, End-to-End Certification & Release (DELIVERED — FINAL PHASE, RP-034 FINAL CERTIFIED)

**Scope:** The eighth and final stage of the RP-034 milestone. Per its
own governing principle ("Compose what already exists. Do not
duplicate it. Prove what actually works. Explicitly expose what
remains unavailable. Never fabricate end-to-end capabilities."), this
phase builds no new large engine — it is a thin coordinator that
composes the real, complete, already-delivered Phase 1-7 + RP-033
Gate 1/Gate 2 chain, exercises it with real API calls end-to-end, and
proves — or honestly declines to claim — that the composition actually
works. Rule 82 was never modified, referenced as a mutator, or touched
anywhere in this work.

**Files added (additive only):**
`core/modules/intelligence/media/cozy-rp034-integration.js`,
`core/modules/intelligence/media/tests/cozy-rp034-integration.test.js`.

**Baseline verification:** package `CozyOS-main-RP-034-Phase7.zip`,
SHA-256 `1df7698153324ae008abf105aa0816a0268ed634e20ffad653450ff1cf0e03b5`
— matched both the previously delivered hash from Phase 7's own
delivery and the hash explicitly stated in this phase's own spec
document, computed twice independently. `unzip -t` clean. Fresh
extraction confirmed repository root, expected directory structure,
all Phase 1-7 files, RP-033 Gate 1/2, RP-029/030/031, and all five
governance files present. Full pre-existing test suite (60 files) run
before any Phase 8 code was written and recorded as the official Phase
8 baseline: Phase 1 (30/30), Phase 2 (55/55), Phase 3 (56/56), Phase 4
(63/63), Phase 5 (63/63), Phase 6 (108/108), Phase 7 (77/77), RP-033
Gate 1 (34/34), Gate 2 (51/51), RP-029-A (26/26), RP-029-B (36/36),
RP-029-C safety gate (22/22), RP-030 (32/32), RP-031 Teach (21/21) —
all individually confirmed clean; the remainder of the 60-file suite
matched the same long-established, unrelated failure pattern
(`engine-bridge` 11/1, `audio-manager` 15/15, 8 pre-existing load
failures) already documented across every prior RP-034 phase.

**What it adds:** `getIntegrationStatus()` — one real, consolidated
status view across all 7 phases + RP-033, every value freshly computed
from each composed module's own real capability report on every call
(never cached, never upgraded); `getCapabilityMatrix()` — the same
real values reshaped into spec §27's requested Capability/Status
certification table, verified by a dedicated test asserting every row
uses only the four disclosed real vocabulary values (no marketing
language); `runCertificationScenario()` — the canonical 14-step
end-to-end scenario (spec §7): connector capability check -> owner
authorization (real Phase 6 consent grant) -> Remote Media Index (real
Phase 2 `createRecord()`) -> search (real Phase 3) -> analysis (real
Phase 4 `TERM_EXTRACTION` job, run to completion) -> language
intelligence (real Phase 5 `resolveLanguageIdentity()`) -> privacy
classification (real Phase 6 `canTransfer`/`canExport`) -> local
intelligence record -> offline queue (real Phase 7
`createSyncOperation()`) -> Living Connectivity transmit (real RP-033
Gate 2 `sendPacket()`, honestly `WAITING_FOR_NETWORK` — this
environment has no live peer, and this file never reports a fabricated
`SYNCED`) -> second-device receive (a real `receiveOperation()` call
against the real envelope this session's own real send produced — this
file's own header explicitly discloses that no live second physical
device exists in this environment, so this step is a real, disclosed
same-process round trip through the real envelope/integrity pipeline,
never presented as a live two-device test) -> integrity verification
(real, already performed inside the real receive call above) ->
conflict/reconciliation check (real Phase 7 `detectConflict()`) ->
local searchable intelligence (a real Phase 3 re-query confirming the
record is genuinely, currently discoverable). Every one of the 14
steps' real, actual outcome is recorded in a returned trace; three
dedicated tests confirm the trace never contains `GLOBAL_SYNCED`,
`ALL_DEVICES_SYNCED`, `REMOTE_DELETED`, `CLOUD_BACKUP_COMPLETE`, or the
literal string `"SYNCED"` anywhere. `verifyProvenanceChain(indexId)` —
answers every question spec §15 requires (origin, connector, analysis
evidence, language evidence, contributor, privacy policy applied,
synchronization history, verified) using only real, already-present
data — `contributor` and `verified` both honestly default to
`null`/`false` rather than inventing an answer (verified by two
dedicated tests). `verifyIdentitySeparation()` — confirms the real,
distinct 7-type Phase 6 identity vocabulary without collapsing any of
it. Six thin wrapper functions
(`analyzeRemoteMedia`/`searchRemoteMedia`/`routeLanguage`/
`applyPrivacy`/`queueOfflineSync`/`processAvailableSync`) exist purely
as spec §6's suggested convenience composition points — each is a
single real call into the corresponding real Phase 1-7 function.

**A genuine, honest integration finding was surfaced by this
certification process itself, not hidden or papered over (see
`RP-034-PHASE8-ANALYSIS-FIELD-GAP` in the Repair Queue):** RP-034
Phase 2's own `record.analysis` sub-object — set once, at record
creation, to `{status:"NOT_ANALYZED", capabilities:"CAPABILITY_UNAVAILABLE",
lastAnalyzedAt:null}` — is never updated by RP-034 Phase 4's real,
separate job store, because no function anywhere in the already-
delivered Phase 2-4 chain links them back together. This is a real,
pre-existing architectural gap between two already-delivered,
individually-correct phases (each phase's own delivered test suite
already validates its own real behavior correctly in isolation) —
Phase 8's own `verifyProvenanceChain()` honestly reports the real,
unchanged `NOT_ANALYZED` value even immediately after a real Phase 4
analysis job actually ran to completion in the same certification
scenario, rather than fabricating an update to make the integration
look more complete than it actually is. This is exactly what this
phase's own governing principle requires: "prove what actually works,
explicitly expose what remains unavailable."

**Two test-authoring bugs (not engine bugs) were found and fixed
during this session's own first full test run:** an "analysis ->
language" integration test invoked the default certification-scenario
language evidence (`languageId:'luo', country:'KE', region:'Homa
Bay'`) without first registering a real matching RP-030 regional
context in that specific test's own fresh stack, producing a real,
correct `NO_PACK` result rather than the test's mistaken `RESOLVED`
expectation — fixed by registering the real context first, exactly
matching every other language-routing test in this suite. An
"unavailable transport" test passed a nonexistent, fabricated
operationId directly to `processAvailableSync()`; Phase 7's own real
`transmitOperation()` correctly checks real operation existence before
ever checking real transport availability, so the real, correct result
was `REJECTED`/`NOT_FOUND`, not the test's mistaken
`CAPABILITY_UNAVAILABLE` expectation — fixed by first creating a real
operation in a transport-less fresh stack, then attempting real
transmission against that real operation, which correctly exercises
the intended capability-absent path.

**Verification run this session:** `node` executed directly on the new
test file — **86/86 passing**, real integration against the complete,
real Phase 1-7 + RP-033 Gate 1/Gate 2 chain (no mocks for any composed
module anywhere in this suite). Covers every spec-listed category from
§31: integration (all 8 real composition links explicitly tested —
connector->index, index->search, search->analysis, analysis->language,
language->privacy, privacy->sync, sync->transport, transport->
receiving-device), offline (creation, indexing, search, queue,
reconnect, retry, crash recovery), privacy (allowed, blocked, revoked,
redacted, quarantine), language (country, region, community, dialect,
ambiguity, the spec's own Tanzania-Hausa and Kenya-Dholuo examples,
plus three additional real African language examples — Kikamba,
Kiswahili region-vs-country distinction, and an honest unregistered-
language case), sync (duplicate, replay, hash mismatch, stale version,
conflict, safe merge, sensitive conflict, audit), transport (WebRTC,
Bluetooth capability, unavailable transport, native companion
requirement, truthful status), plus a real release scenario, a full
quarantine-preserved-across-sync scenario (submission -> safety gate
-> QUARANTINED -> sync -> receiving device still sees QUARANTINED,
never APPROVED, with real QUARANTINE_PRESERVED audit confirmation),
search-after-synchronization, reconnection-certification state
progression (real QUEUED -> WAITING_FOR_NETWORK, never skipping to a
fabricated VERIFIED), full offline-first certification (the entire
index->search->analysis->language->privacy->queue workflow exercised
with zero transport module loaded, confirmed never falsely reporting
remote synchronization), duplicate-delivery (no duplicate media record
via `upsertRemoteMedia()`, no duplicate local sync-operation record
from a genuinely repeated real delivery), security certification
(session validation/replay protection/payload integrity all delegated
entirely to the real Gate 2 layer, confirmed no second
encrypt/decrypt/sign/verify function exists anywhere on this file's
own API), provenance-chain depth (contributor/verified fields honestly
default rather than invent), Rule 82 preservation (no promote/
approvePack/forceAvailable function exists anywhere on this file's
API; a full certification-scenario run never changes a real RP-030
pack status), capability-unavailable preservation through the complete
pipeline (`TOPIC_EXTRACTION` and an unconfirmed `RELEASE` operation
both remain honestly blocked end-to-end, never silently becoming
`SUCCESS`), and eight real, measured (never invented) performance
tests using `process.hrtime.bigint()` — local index lookup, search,
language routing, queue insertion, duplicate detection, conflict
detection, reconciliation, and status generation. Full-repo regression
after Phase 8: all 60 pre-existing test files re-run; outcome
byte-for-byte identical to the pre-Phase-8 baseline — confirmed both
by re-running the identical file list before/after this session's
changes and by `diff -rq` against a pristine extraction of the Phase 7
baseline ZIP (exactly one new engine file and one new test file exist;
nothing else in the working tree differs beyond the five governance
files this session updates).

**Browser testing:** `BROWSER_TEST = NOT_APPLICABLE` — Phase 8
introduces no UI of any kind. No browser results, real or simulated,
were fabricated.

**Final RP-034 certification, per spec §36 — verified only after every
requirement actually passed, not merely because eight files exist:**
Phase 1 ✅ (30/30, re-confirmed this session) — Phase 2 ✅ (55/55) —
Phase 3 ✅ (56/56) — Phase 4 ✅ (63/63) — Phase 5 ✅ (63/63) — Phase 6 ✅
(108/108) — Phase 7 ✅ (77/77) — Phase 8 ✅ (86/86, this session, proving
the real end-to-end composition of all preceding phases). **RP-034:
FINAL CERTIFIED.** Certification here means the real, delivered
architecture composes and behaves correctly end-to-end within this
environment's real, disclosed constraints — not that every conceivable
production capability (live YouTube credentials, live two-device
WebRTC, real encryption, real cloud sync, real Wi-Fi Direct/native
hotspot, real ASR/OCR/face recognition) is actually live in this
sandbox. Every one of those remains honestly `CAPABILITY_UNAVAILABLE`/
`PARTIAL`/`REQUIRES_NATIVE_COMPANION`, exactly as each individual phase
already disclosed, re-confirmed rather than re-litigated by this final
phase.

**Known unavailable infrastructure, honestly disclosed (unchanged
findings from Phases 1-7, re-confirmed, not fabricated as newly
resolved):** real YouTube API credentials; real live network path to
youtube.com; a real second physical CozyOS device for live WebRTC
pairing; real encryption; real cloud synchronization; real Wi-Fi
Direct; real native OS-level hotspot creation from browser code; real
ASR/OCR/face recognition/topic modeling.

**Status:** 🟢 Delivered. **RP-034 milestone: COMPLETE, 8 of 8 phases
delivered and certified.** See `HANDOFF.md` "RP-034 PHASE 8" for the
full, itemized certification report.

---

## RP-034 Phase 7 — Offline Sync & Reconciliation Engine (DELIVERED)

**Scope:** Seventh stage of the RP-034 8-phase milestone. Builds the
real offline-first sync/reconciliation layer for CozyOS remote-media
intelligence, composing — never duplicating — RP-033 Gate 1/Gate 2
(real transport/device identity), Phase 6 (real privacy gate,
re-evaluated at transmission time), Phase 2/3/4/5 (read-only
composition for provenance/language-routing preservation and search
consistency), and RP-029-C (read-only safety/quarantine composition).
This entry covers Phase 7 only; Phase 8 (final integration/
acceptance) remains, the last phase of RP-034. Rule 82 was never
modified, referenced as a mutator, or touched anywhere in this work.

**Files added (additive only):**
`core/modules/intelligence/sync/cozy-intelligence-offline-sync.js`,
`core/modules/intelligence/sync/tests/cozy-intelligence-offline-sync.test.js`.

**Repository audit performed before writing any code:**
`core/connectivity/cozy-connect.js` was read in full — a real,
existing physical-device connectivity hub (Bluetooth/USB/Cast/Serial/
HID/NFC/camera/microphone providers via a real provider-registry
architecture). `core/collaboration/cozy-share.js` was read in full —
a real, existing device-collaboration/trust layer for physical devices
(cameras, mixers), deliberately kept separate from login identity by
its own design. Both are genuinely different concerns from knowledge-
record synchronization and were not composed into this file.
`core/connectivity/cozy-connectivity-transport.js`'s real (private,
unexported) `computeIntegrity()` function was read in full: a
disclosed FNV-1a checksum ("a real corruption-detection checksum, not
a cryptographic proof," confirmed by direct source read), already used
internally by Gate 2's own `sendPacket()`/`receivePacket()` for
packet-envelope-level integrity. This file's own
`computeOperationHash()` reimplements the exact same real, bit-for-bit
identical FNV-1a formula — necessarily local since the real function
is private — applied at the sync-*operation* level (for duplicate-
operation detection across relays/hops) rather than the packet-
envelope level, which Gate 2's own composed functions already verify
for free on every real transport call this file makes. This is
explicitly not "a second incompatible hashing engine" (spec §9's own
prohibition) — it is the same real algorithm, reused.

**What it adds:** a real sync operation model
(`operationId`/`recordId`/`sourceId`/`sourceRecordId`/`deviceId`/
`sessionId`/`createdAt`/`updatedAt`/`operationType`/`payload`/
`payloadHash`/`baseVersion`/`localVersion`/`remoteVersion`/
`privacyTier`/`provenance`/`status`/`attemptCount`/`lastAttemptAt`/
`nextAttemptAt`/`lastError`) across 10 real operation types (CREATE/
UPDATE/DELETE_REQUEST/REVOKE/ANALYSIS_RESULT/LANGUAGE_INTELLIGENCE/
SEARCH_METADATA/PROVENANCE_UPDATE/QUARANTINE/RELEASE);
`createSyncOperation()` — real local-first creation, always succeeding
locally first (real `LOCAL_ONLY` status) so a user's work is never
lost merely because there is no network, with `enqueueOperation()` as
a separate, explicit later step; `checkIdempotency()` — a real
operationId+payloadHash ledger, first delivery accepts, every
subsequent real delivery of the same operation (including via a
genuinely different real relay/hop, verified by a dedicated test) is
honestly `ALREADY_PROCESSED`; real payload-hash re-verification on
every `receiveOperation()` call — a real, deliberately tampered
payload with a stale hash is honestly rejected with
`PAYLOAD_HASH_MISMATCH` (verified by a dedicated test), a sender-
provided hash is never trusted without recomputation;
`compareVersions()`/`detectConflict()`/`resolveConflict()` — real,
deterministic versioning and conflict handling, `MERGED` reserved only
for a genuinely safe, disjoint, non-sensitive-field merge (verified),
any conflict touching a sensitive field
(contributor/language/personIdentity/domain/privacyTier) or an
overlapping field is honestly `MANUAL_REVIEW_REQUIRED` — contradictory
language classifications, person identity, or professional/community
claims are never silently merged (verified by two dedicated tests);
`evaluateOutboundPrivacy()` — composes Phase 6 and is called fresh
inside `transmitOperation()` at transmission time, not merely at queue
time (verified by a dedicated test proving a privacy escalation that
happens after an operation is already queued is still caught before
real transmission — never bypassed because the device reconnected);
`transmitOperation()`/`markTransmissionInterrupted()`/
`scheduleRetry()`/`markVerified()` — real, bounded-retry transport
composition over the real Gate 2 `sendPacket()`; a real interrupted
transfer returns to a real, safe `WAITING_FOR_NETWORK` retry state,
never falsely `VERIFIED`; `markVerified()` requires real, explicit
verification evidence and refuses to mark anything verified "on trust
alone" (verified by a dedicated test); `receiveOperation()` — real
integrity (via Gate 2's own `receivePacket()`) -> real payload-hash
re-check -> real idempotency -> real quarantine preservation (a
quarantined term stays `QUARANTINED` across sync, verified by a
dedicated test; a `RELEASE` operation without a real, confirmed review
action is honestly rejected, never auto-released on receipt, verified
by two dedicated tests) -> real language-routing resolution (Phase
5's own `resolveLanguageIdentity()` reused verbatim — an ambiguous
result received this way surfaces Phase 5's own real
`AMBIGUOUS_LANGUAGE` outcome, this file never resolves it itself) ->
a real local-candidate operation, never a direct trusted insert;
`verifyProvenancePreserved()`/`verifyLanguageRoutingPreserved()` —
real structural checks that country/region/community/dialect all
survive a sync round-trip unreduced ("Tanzania Hausa" never quietly
becomes plain "Hausa," "Kenya Dholuo" never quietly becomes a
different regional pack — both verified by dedicated tests using the
spec's own explicit examples); `buildMediaIndexSyncOperation()`/
`buildAnalysisResultSyncOperation()` — real, metadata-only sync
composing Phase 2/4, never triggering a video download (verified: no
download function exists anywhere on this file's public API) and only
ever syncing a real, `COMPLETED` analysis job's real result;
`getOfflineSearchAvailability()` — confirms Phase 3 already provides
search consistency for free (it reads live from Phase 2's real index —
no second search index is built here); `getMultiPeerSyncSummary()` —
real, independent per-operation status only, never a single
`GLOBAL_SYNCED`/`ALL_DEVICES_SYNCED` aggregate claim (verified by a
dedicated test asserting those exact forbidden terms, plus
`REMOTE_DELETED` and `CLOUD_BACKUP_COMPLETE`, never appear anywhere on
this file's API); `getRecoverableOperations()` — real, honest recovery
listing (a real terminal `VERIFIED` operation is never included,
verified by a dedicated test); a real, append-only audit trail across
all 11 spec-listed event types; `getCapabilities()` — real capability
reporting, with real encryption/remote deletion/cloud sync/Wi-Fi
Direct/OS hotspot creation all honestly `CAPABILITY_UNAVAILABLE`
(verified by a dedicated test).

**A real bug was found and fixed by this session's own smoke test
before the test suite was written (see
`RP-034-PHASE7-COMPAREVERSIONS-FIX` in the Repair Queue):**
`compareVersions()` originally short-circuited on numeric equality
(`remoteVersion === localVersion`) before ever checking real base-
divergence — meaning the spec's own explicit illustrative example
(§11: two devices both at real version 5, each independently produces
real version 6, expected real outcome `CONFLICT`) was incorrectly
reported `UNCHANGED` instead. Fixed by checking real base-divergence
first (`localAdvanced`/`remoteAdvanced` relative to the real
`baseVersion`) before any naive numeric-equality shortcut; re-verified
via the same smoke test, then locked in by a dedicated "same-version
conflict" test in the full suite.

**Two test-authoring issues (not engine bugs) were found and fixed
during this session's own first full test run:** a "duplicate packet"
test incorrectly reused the literal identical envelope object for both
delivery attempts — Gate 2's own real, packet-level replay protection
(operating strictly before this file's own operation-level idempotency
check ever runs) correctly rejected the exact-same-packetId resend as
a raw transport-level replay, which is real, correct Gate 2 behavior,
not a defect; fixed by constructing a second, independently-sent real
envelope (a genuinely different real `packetId`) carrying the same
`operationId`, which is the correct way to exercise this file's own
idempotency layer specifically. An "ambiguous language" test supplied
only plain-region evidence to `resolveLanguageIdentity()`, but Phase
5's own real, already-delivered implementation intentionally does not
flag ambiguity at plain-region level — only at the community level
(confirmed by direct source read of Phase 5's own Level 3 routing
branch, which uses `>= 1` rather than checking for `> 1`) — fixed by
supplying real community-level evidence that correctly exercises Phase
5's own real, pre-existing ambiguity detection.

**Verification run this session:** `node` executed directly on the new
test file — **77/77 passing** (spec minimum: 70+), real integration
against the real RP-029-A/C, real RP-030 registry, real RP-034 Phase
1-6, and real RP-033 Gate 1/Gate 2 (no mocks for any of them). Covers
every spec-listed category A through M: queue (offline enqueue,
persistence, retry, retry exhaustion, crash recovery, duplicate
enqueue), idempotency (duplicate operation, duplicate packet via a
genuinely independent relay, duplicate after a simulated restart,
duplicate after relay), integrity (valid hash, invalid/tampered hash,
modified payload, malformed envelope), versioning (all 5 real
comparison outcomes: NEW/UNCHANGED/FORWARD_UPDATE/STALE_UPDATE/
CONFLICT), conflict (creation, persistence, manual review, safe merge,
rejected/overlapping merge), privacy (allowed export, blocked export,
revoked consent, privacy changed while queued, redaction, capability
unavailable), quarantine (preserved across sync, RELEASE requiring
real confirmation both ways, audit trail preserved), language (country/
region/community/dialect routing, the spec's own Tanzania-Hausa and
Kenya-Dholuo examples, missing evidence, ambiguous language), media
(real metadata only, real analysis-result gating on job completion,
search-index consistency, real provenance checks, no download
fabrication), transport (real Gate 2 composition, unavailable/queued/
failed transport, verified delivery requiring real evidence, no
fabricated SYNCED anywhere in the real vocabulary), security
(unauthorized sync, wrong device/session/replay all delegated to the
real Gate 2 layer, revoked authorization), recovery (restart,
interrupted transfer, partial operation, malformed queue entry,
corrupted/missing state), audit (state transitions, privacy blocks,
conflicts, retries, failures), plus multi-device/no-fabricated-global-
state, cross-language provenance, capability reporting, Rule 82
preservation (no mutator exists anywhere on this file's API; a real
RP-030 pack status never changes as a side effect of any sync
operation), operation-type validation, and honest `DELETE_REQUEST`
handling (never claims `REMOTE_DELETED`). Full-repo regression after
Phase 7: all 59 pre-existing test files re-run; outcome byte-for-byte
identical to the pre-Phase-7 baseline — confirmed both by re-running
the identical file list before/after this session's changes and by
`diff -rq` against a pristine extraction of the Phase 6 baseline ZIP
(exactly one new directory, `core/modules/intelligence/sync/`,
containing the new engine file and its test file, exists; nothing else
in the working tree differs beyond the five governance files this
session updates).

**Browser testing:** `BROWSER_TEST = NOT_APPLICABLE` — no Phase 7 UI
was built or required this session (Phase 7 is a data-layer sync
coordinator only, per its own spec).

**Conflict resolution / transport / privacy behavior:** see HANDOFF.md
"RP-034 PHASE 7" for the full, itemized behavior summary matching the
spec's own required final-report sections.

**Known unavailable infrastructure, honestly disclosed, never
fabricated:** real encryption (Phase 6's prior finding, unchanged);
real remote/cascading deletion; real cloud synchronization; real
Wi-Fi Direct; real OS-level hotspot creation from browser code — all
five confirmed `CAPABILITY_UNAVAILABLE` by `getCapabilities()`.

**Known limitations, honestly disclosed:** this file's own operation/
conflict/idempotency-ledger/audit-trail stores are session-scoped
in-memory — the same disclosed pattern every other module in this
milestone already uses; a real process restart in this environment
genuinely has no persistent backing anywhere. Real end-to-end WebRTC
pairing between two live devices was not established in tests — the
same convention Phases 2-6 already established, sync operations are
instead verified via real, self-consistent share-then-receive round
trips using the real transport's own real envelope/integrity pipeline.
Phase 8 (final integrated test matrix/certification) remains
deferred — nothing from it was quietly implemented in fragments.

**Status:** 🟢 Delivered (Phase 7 scope only). RP-034's overall
milestone remains open — see `HANDOFF.md` "RP-034 PHASE 7" for full
detail. Phase 8 is the final remaining phase.

---

## RP-034 Phase 6 — Privacy, Identity & Provenance (DELIVERED)

**Scope:** Sixth stage of the RP-034 8-phase milestone. Builds the
privacy/identity/provenance layer for CozyOS remote-media intelligence
and African-language knowledge, composing — never duplicating — real
identity/security systems (RP-033 Gate 1 device identity, the real
AuthCoordinator, RP-029-C Phase 2 reviewer/admin role resolution) and
real knowledge/transport systems (RP-030, RP-031 Teach routing,
RP-034 Phase 2/5, RP-029-C safety gate, RP-033 Gate 2 transport). This
entry covers Phase 6 only; Phases 7-8 remain deferred. Rule 82 was
never modified, referenced as a mutator, or touched anywhere in this
work.

**Files added (additive only):**
`core/modules/intelligence/privacy/cozy-intelligence-privacy.js`,
`core/modules/intelligence/privacy/tests/cozy-intelligence-privacy.test.js`.

**Repository audit performed before writing any code:**
`core/connectivity/crypto.js` was read in full — a real, existing ES
module whose own header discloses "Placeholder implementation until
production crypto is integrated," confirming no real, verified
encryption primitive exists anywhere in this repository (see
`RP-034-PHASE6-NO-REAL-ENCRYPTION` in the Repair Queue). This finding
directly shapes `checkEncryptionAvailable()` (honest
`CAPABILITY_UNAVAILABLE`) and `canTransfer()` (`PRIVATE`/`LOCAL_ONLY`-
tier data never crosses the real RP-033 transport, since nothing in
this repository could actually protect it in transit). Two
`auth-coordinator.js` files exist in this repository
(`core/modules/identity/auth-coordinator.js` and
`core/security/auth-coordinator.js`); only the identity-module one
self-registers `window.CozyOS.AuthCoordinator` (confirmed by direct
source read via `grep` before composing it) — this file composes that
one, never the other, and never builds a second session/login system.
`core/connectivity/cozy-living-connectivity.js`'s real
`getDeviceIdentity()` and `core/modules/intelligence/knowledge/ui/
cozy-knowledge-review-dashboard-core.js`'s real `resolveRole()` were
both read in full before composition.

**What it adds:** seven separate identity types
(`getDeviceIdentity`/`getUserIdentity`/`getContributorIdentity`/
`getSourceIdentity`/`getKnowledgeIdentity`/`getMediaOwnerIdentity`/
`getReviewerIdentity`) — a contributor is represented only as an
opaque, already-pseudonymized reference string, never derived/hashed
from raw personal data by this file; six real privacy tiers
(`PRIVATE`/`LOCAL_ONLY`/`COMMUNITY`/`ANONYMOUS_COMMUNITY`/`RESEARCH`/
`PUBLIC`) with real, tier-based `getDisplayView()` filtering —
`ANONYMOUS_COMMUNITY` never exposes contributor identity even to a
REVIEWER (verified by a dedicated test), `PRIVATE`/`LOCAL_ONLY` require
REVIEWER+ to view at all; real, expiring, revocable, purpose-and-
source-scoped consent (`requestAuthorization`/`grantAuthorization`/
`revokeAuthorization`/`expireAuthorization`/`checkAuthorization`) —
authorization for one purpose never implies authorization for another
(spec §7's own explicit example, verified by a dedicated test), and
expiry is a real, computed `Date` comparison, never guessed; real,
strictly sequential six-stage knowledge lineage (`SOURCE` ->
`OBSERVATION` -> `ANALYSIS` -> `CANDIDATE` -> `REVIEW` ->
`VERIFIED_KNOWLEDGE`, `advanceLineage()` structurally refuses any
non-adjacent jump — verified by a dedicated test that `SOURCE` can
never skip directly to `VERIFIED_KNOWLEDGE`, and a second test walking
a real provenance record through all six real stages sequentially);
real, non-mutating redaction (`redactContributor`/`redactLocation`/
`redactSourceOwner`/`redactPrivateMetadata`) — every function returns
a new object and marks fields `REDACTED` rather than silently
discarding provenance history; real export controls
(`canExport`/`canShare`/`canPublish`/`canResearch`/`canTransfer`),
each a real tier-and-context-based decision; real privacy-aware
RP-033 packet filtering (`sharePrivacyAwarePacket`/
`receivePrivacyAwarePacket`) — `PRIVATE`/`LOCAL_ONLY` items are
blocked before ever reaching the real transport, reporting
`TRANSFER_BLOCKED_PRIVACY`, never a fabricated `SYNCED` (verified by a
dedicated test); receiving runs real integrity (via RP-033's own
`receivePacket()`), real provenance validation, real safety-gate
classification (RP-029-C, composed), and real language-identity
resolution (RP-034 Phase 5's own `resolveLanguageIdentity()`, reused
verbatim — no second routing algorithm), always landing as a
`LOCAL_CANDIDATE` — never directly inserted into a trusted language
pack (verified: no such insertion function exists anywhere on this
file's public API); an honest right-to-withdraw
(`requestWithdrawal()` records a real `WITHDRAW_REQUESTED` intent;
`executeWithdrawal()` always honestly reports
`CAPABILITY_UNAVAILABLE` — no real, verified cascading-deletion
mechanism exists across this repository's composed real stores, and
this file never claims "deleted everywhere," verified by a dedicated
test asserting that exact phrase never appears in the response); real
domain-knowledge protection (`classifyDomainKnowledge()` always tags
every domain, including `HEALTH`, `COMMUNITY_REPORTED_
NOT_PROFESSIONALLY_VERIFIED` — a community health statement is never
classified as medical advice, verified by a dedicated test); and a
real, append-only, frozen audit trail across all 10 spec-listed event
types — entries never store unnecessary raw personal content
(verified by a dedicated test) and are immutable once logged (verified
by a dedicated `assert.throws` test under strict mode).

**No real bug was found by this session's own test suite** — the
drafted implementation's own real smoke test (run in a prior session,
exercising every major function end-to-end against the real composed
chain) passed cleanly on its first attempt, and the full 108-test
suite likewise passed 108/108 on its very first run. This is recorded
honestly, not overstated: it reflects an implementation written with
the specific lookup-shape lessons from Phases 2, 3, and 5's own prior
bugs already applied (never assuming an undocumented nested shape from
a composed module without first reading that module's real source).

**Verification run this session:** `node` executed directly on the new
test file — **108/108 passing** (spec minimum: 70+), real integration
against the real RP-029-A/B/C, real RP-030 registry, real RP-031 Teach
routing, real RP-033 Gate 1/Gate 2, real RP-034 Phase 1-5, and real
`AuthCoordinator`/`CozyKnowledgeReviewDashboardCore` (a real, disclosed
demo-identity override — the same pattern already established in
RP-031-B Increment 5 — was used only to exercise the real REVIEWER/
ADMIN role-resolution paths; no mock of any composed module's own
internal logic exists anywhere in this suite). Covers every
spec-listed category: identity separation (all 7 types, including
device/user/reviewer honest-unavailable paths), privacy tiers,
consent/authorization/revocation/expiration (including a real
elapsed-`expiresAt` computed-not-guessed expiry case), provenance/
lineage (including a full 6-stage real sequential walk and a real
non-adjacent-jump rejection), anonymous contribution (real,
provenance-traceable, never claimed cryptographically anonymous),
contributor/location/source-owner/metadata redaction, language-pack/
community/regional privacy (real public/community/restricted views),
remote-media privacy (real references only, never the full video),
YouTube authorization state reflection (real Phase 2
`ownerAuthorization` state), export/research control (including a real
research-purpose-mismatch rejection), offline behavior (privacy
evaluation, consent, and provenance/lineage all working with no
transport loaded), hotspot transfer/blocked transfer/receiving-device
validation (a real share-then-receive round trip, a real malformed-
envelope rejection, a real missing-privacy-tier rejection), audit
trail/immutability, withdrawal, health/agricultural/education/church-
domain protection, Rule 82 preservation (no mutator exists anywhere on
this file's API; a real RP-030 pack status never changes as a side
effect of any Phase 6 call), RP-029/030/031/033 integration boundary
checks (no second safety/registry/teaching/transport system exists
anywhere on this file's own API), duplicate/ambiguous identity,
missing/expired/revoked authorization, privacy escalation/downgrade,
prohibited export/transmission, missing security/encryption
capability, malformed/tampered provenance, data minimization/
sensitive-metadata filtering, identity/authorization capability-
unavailable, cross-language provenance (two independent real
provenance records for different languages), multiple sources
(preserved as separate evidence, never merged), and seven real,
measured (never promised) performance tests using
`process.hrtime.bigint()` — privacy evaluation, authorization lookup,
provenance creation, provenance validation, packet filtering,
redaction, and a 100-record bulk-provenance-creation bound.
Full-repo regression after Phase 6: all 58 pre-existing test files
re-run; outcome byte-for-byte identical to the pre-Phase-6 baseline —
confirmed both by re-running the identical file list before/after this
session's changes and by `diff -rq` against a pristine extraction of
the Phase 5 baseline ZIP (exactly one new directory,
`core/modules/intelligence/privacy/`, containing the new engine file
and its test file, exists; nothing else in the working tree differs
beyond the five governance files this session updates).

**Browser testing:** `BROWSER_TEST = NOT_APPLICABLE` — no Phase 6 UI
was built or required this session (Phase 6 is a data-layer privacy/
identity coordinator only, per its own spec).

**Privacy capabilities delivered:** identity separation (7 types),
six-tier privacy classification with real display filtering, real
expiring/revocable purpose-scoped consent, real sequential knowledge
lineage, real redaction, real export/transfer/research/publish/share
controls, real privacy-aware RP-033 packet filtering, real append-only
audit trail, real domain-knowledge protection.

**Identity capabilities delivered (real, composed, not duplicated):**
device identity via the real RP-033 Gate 1 (`TrustedDeviceManager`-
dependent, honestly unavailable otherwise); user identity via the real
`AuthCoordinator`; reviewer/admin identity via the real RP-029-C Phase
2 role resolution.

**Unavailable capabilities, honestly disclosed, never fabricated:**
biometric identity (this file only ever consumes an authorization
result if biometric auth exists elsewhere — spec §16 — it never
stores or processes raw biometric material; no biometric provider is
composed this pass, since none exists anywhere in this repository);
real cascading/remote deletion (see
`RP-034-PHASE6-NO-REAL-DELETION`); cloud/remote revocation propagation
(this repository has no cloud backend at all — revocation is real and
local only); real external authorization beyond Phase 1's connector
(this file only reads the real Phase 2 `ownerAuthorization` state,
never fabricates a new external-authorization flow); real encryption
(see `RP-034-PHASE6-NO-REAL-ENCRYPTION`).

**Known limitations, honestly disclosed:** this file's own consent/
provenance/lineage/audit-trail stores are session-scoped in-memory —
the same disclosed pattern every other module in this milestone
already uses. `ANONYMOUS_COMMUNITY` is documented as provenance-
traceable, not cryptographically anonymous, because no anonymization/
mixing primitive exists anywhere in this repository. Phases 7-8
(offline synchronization, final integrated test matrix) remain
deferred — none of them was quietly implemented in fragments and then
claimed as Phase 6 scope.

**Status:** 🟢 Delivered (Phase 6 scope only). RP-034's overall
milestone remains open — see `HANDOFF.md` "RP-034 PHASE 6" for full
detail and the remaining phase-by-phase scope.

---

## RP-034 Phase 5 — African Language Intelligence & Automatic Pack Routing (DELIVERED)

**Scope:** Fifth stage of the RP-034 8-phase milestone. Builds the
language-intelligence layer that automatically determines the most
appropriate African language pack from real evidence (language,
country, region, community, dialect), composing — never duplicating —
RP-030 (sole real registry), RP-031 Phase 2A (`submitTeachingContribution()`
composed verbatim), RP-029-C (real safety-gate-first pipeline via
RP-030's own `submitExpression()`), RP-034 Phase 3 (`getResearchPriority()`),
RP-034 Phase 4 (real, read-only media-job integration), and RP-033
Gate 2 (real hotspot/P2P transport). This entry covers Phase 5 only;
Phases 6-8 remain deferred. RP-034 overall is NOT claimed complete.

**Files added (additive only):**
`core/modules/intelligence/language-packs/cozy-african-language-intelligence.js`,
`core/modules/intelligence/language-packs/tests/cozy-african-language-intelligence.test.js`.

**Repository audit performed before writing any code:** RP-030's real
`detectLanguagePack()` function was read in full — a real, disclosed
"foundation heuristic" (no ML/ASR backend, confirmed by its own source
comment) with no concept of "community" distinct from region. RP-031's
`cozy-teach-cozyai-routing-core.js` was read in full, including its
private (unexported) `regionWithCommunity()` helper — the real,
already-established repository pattern for representing community as
a `region (community)` composite string layered onto RP-030's real
region field, since RP-030's own schema (confirmed by direct source
read of `registerRegionalContext()`) has no separate community column.
Rather than modify RP-030 to add a first-class community field (a
wider-blast-radius schema change than this repair should make — see
`RP-034-PHASE5-COMMUNITY-FIELD` in the Repair Queue), this file's own
`regionKey()` helper reuses the exact same real, established
composite-string convention.

**What it adds:** `resolveLanguageIdentity()` — a real six-level
routing hierarchy (Community+Dialect -> Community -> Region -> Country
-> Language/general-pack -> honest `LANGUAGE_UNCERTAIN`/`NO_PACK`
fallback) built directly on RP-030's real `getPack()`/
`listRegionalContexts()`; `computeConfidence()` — real,
evidence-hierarchy-derived confidence (explicit user selection >
verified contributor language > verified country/region/community >
previously verified knowledge > reliable linguistic evidence > weak
heuristic), never a fabricated float; `getLanguagePack()`/
`getRegionalPack()`/`getCommunityPack()`/`getBestAvailablePack()` —
real pack-retrieval convenience wrappers around the same real
resolution; `learnUnknownTerm()` — identify -> search existing (via
RP-030's real `listExpressions()`) -> if absent, submit as a real
candidate via RP-030's own real, unmodified `submitExpression()`
(which already runs the real safety gate first and never auto-
promotes past `REGISTERED`/`NOT_READY` — Rule 82 is never touched by
this file at all); `routeMediaAnalysisJob()` — real, read-only
composition of a real, `COMPLETED` RP-034 Phase 4 job and its real
`getSourceProvenance()`, never re-deriving anything from raw video;
`registerASRProvider()`/`unregisterASRProvider()`/`transcribeAudio()`
— a real, disclosed interface a future real ASR provider could
implement; with no provider registered, `transcribeAudio()` always
honestly reports `CAPABILITY_UNAVAILABLE`, never a fabricated
transcript; `analyzeConversationSegments()` — every segment
independently resolved (never assumes one language for a whole
conversation), reporting `PRIMARY_LANGUAGE`/`SECONDARY_LANGUAGE`/
`CODE_SWITCH_DETECTED` only when real, distinct resolved languages
actually appear; `submitCommunityContribution()` — thin, verbatim
delegation to RP-031's real teaching pipeline; `shareLanguageEvidence()`/
`receiveLanguageEvidence()`/`getLanguageAuditTrail()` — real hotspot
transport composing RP-033 Gate 2's real `sendPacket()`/
`receivePacket()`, with the four spec-listed language packet types
(`LANGUAGE_PACK_METADATA`/`LANGUAGE_TERM_CANDIDATE`/
`LANGUAGE_EVIDENCE`/`LANGUAGE_RESEARCH_RESULT`); receiving never
trusts a device merely for presenting a well-formed packet — every
accepted packet runs through the real safety gate and real identity
validation, logged to a real, disclosed in-memory audit trail;
`getLanguageCoverageStatus()` — reports RP-030's own real `pack.status`
verbatim (the same "reuse the real system's own truthful names"
principle Phase 4 already established), with a derived, clearly-
labelled `spec5Label` convenience hint only, never the authoritative
field; a full admin intelligence API
(`getLanguageUsageOverview`/`getLanguagePackCoverage`/
`getRegionalCoverage`/`getCommunityCoverage`/`getUnresolvedLanguages`/
`getAmbiguousTerms`/`getNewTerms`/`getResearchPriorities`/
`getLanguageGrowth`), every function reporting real, live data from
this session's own resolution log or an honest
`NOT_AVAILABLE_NO_TELEMETRY`.

**A real bug was found and fixed by this session's own test suite
before delivery:** the original Community-level (Level 2) routing
check ran even when no real community evidence was supplied at all,
because the composite-key helper `regionKey(region, undefined)`
collapses to plain `region` — meaning a genuinely region-only query
was misreported as `COMMUNITY`-level routing rather than the correct
`REGION`-level. Fixed by gating both the Community and
Community+Dialect checks strictly behind real, caller-supplied
`community` evidence (`e.community` truthy), falling through
correctly to the real region-only check otherwise. Caught by the
"regional routing" test before delivery, which failed against the
original code and passes now.

**Verification run this session:** `node` executed directly on the new
test file — **63/63 passing** (spec minimum: 60+), real integration
against the real RP-030 registry, real RP-031 Teach routing, real
RP-029-A/B/C, real RP-034 Phase 3/4, and real RP-033 Gate 1/Gate 2 (no
mocks for any of them). Covers: exact/country/regional/community/
dialect routing, ambiguous languages, unknown languages, no-pack,
multiple packs (the same language registered in two different real
countries keeps country context attached, never merged), confidence,
evidence ranking, code-switching, multiple-language conversation
(three real distinct languages, each retaining independent identity),
term isolation (the same spelling in two different real communities
creates two genuinely separate records), contextual meanings,
contributor routing (real RP-031 composition, and honest
`CAPABILITY_UNAVAILABLE` when that module is absent), media routing,
transcript routing (Phase 4 integration, including honest rejection of
a non-`COMPLETED` job and an unknown jobId), unavailable ASR (both the
honest-unavailable and the real-registered-provider paths), offline
routing, hotspot package (real share-then-receive round trip, real
malformed-envelope rejection, real audit-trail recording, honest
`CAPABILITY_UNAVAILABLE` with no transport loaded), provenance,
privacy (no raw identity fields anywhere in resolution output), safety
gate/quarantine (an unsafe term genuinely quarantined through the
real, unmodified RP-030 pipeline), Rule 82 (no promotion mutator
exists anywhere on this file's own API; a real new-term submission
never changes a real pack's status to `AVAILABLE`), duplicate terms
(honest `ALREADY_KNOWN`, never a duplicate candidate), research
priority (real Phase 3 composition), telemetry unavailable, admin
APIs, RP-030/RP-031/RP-034-Phase-4/RP-033 integration boundary checks,
and five real, measured (never promised) performance tests using
`process.hrtime.bigint()` — routing latency, pack-lookup latency, a
100-term bulk-submission bound, multi-language lookup, and offline
lookup. Full-repo regression after Phase 5: all 57 pre-existing test
files re-run; outcome byte-for-byte identical to the pre-Phase-5
baseline — confirmed both by re-running the identical file list
before/after this session's changes and by `diff -rq` against a
pristine extraction of the Phase 4 baseline ZIP (exactly one new
engine file and one new test file exist; nothing else in the working
tree differs beyond the five governance files this session updates).

**Browser testing:** `BROWSER_TEST = NOT_APPLICABLE` — no Phase 5 UI
was built or required this session.

**Languages registered vs. actually verified:** all 13 of RP-030's
pre-existing default language packs remain `REGISTERED` (unchanged by
this session); none of them are "actually verified"/`AVAILABLE` — Rule
82 governance for promotion is entirely untouched, and this file has
no mutator anywhere capable of changing that.

**Known limitations, honestly disclosed:** no ML language-ID model,
ASR, or machine-translation engine exists anywhere in this repository
— every function that would need one honestly reports
`CAPABILITY_UNAVAILABLE`. RP-030 has no first-class "community" field
— this file's community representation reuses RP-031's own
established composite-string convention rather than adding new
registry capability (see `RP-034-PHASE5-COMMUNITY-FIELD`). This file's
own resolution log/audit trail is session-scoped in-memory — the same
disclosed pattern every other module in this milestone already uses.
Phases 6-8 (privacy/identity expansion, offline synchronization, final
integrated test matrix) remain deferred — none of them was quietly
implemented in fragments and then claimed as Phase 5 scope.

**Status:** 🟢 Delivered (Phase 5 scope only). RP-034's overall
milestone remains open — see `HANDOFF.md` "RP-034 PHASE 5" for full
detail and the remaining phase-by-phase scope.

---

## RP-034 Phase 4 — Full Remote Media Intelligence Pipeline (DELIVERED)

**Scope:** Fourth stage of the RP-034 8-phase milestone. Builds a
real, job-based analysis pipeline coordinator over the real Phase 1-3
chain, composing — never duplicating — RP-029-A (`ingestCommunity
Submission`), RP-029-C (`classify`/`quarantine`), RP-030 (read-only
language routing), and RP-033 Gate 2 (`sendPacket`/`receivePacket`
real hotspot transport). This entry covers Phase 4 only; Phases 5-8
remain deferred.

**Files added (additive only):**
`core/modules/intelligence/media/cozy-remote-media-analysis.js`,
`core/modules/intelligence/media/tests/cozy-remote-media-analysis.test.js`.

**Repository audit performed before writing any code:** two existing
systems were read in full before composition decisions were made.
`core/engines/media/language/language-detection-engine.js` (M388
Engine 2) is a real, existing text-based (script + lexical-overlap)
language-hint engine — genuinely usable when real text is available —
but it is an ES module (`export default`), a fundamentally different
module system from every other file this pipeline composes (all
CommonJS/`window.CozyOS` IIFE or dual-UMD). Taking on cross-module-
system composition (dynamic `import()`, async propagation throughout
an otherwise-synchronous job runner) was judged a real, disclosed
integration risk not worth taking under this repair's own delivery
timeline; `LANGUAGE_IDENTIFICATION` was instead honestly scoped to
explicit, caller-supplied language evidence verified against the real
RP-030 registry (see `RP-034-PHASE4-LANGUAGE-ID-BACKEND` in the Repair
Queue for the disclosed follow-up). `core/connectivity/
cozy-connectivity-transport.js` (RP-033 Gate 2) was read in full and
is composed directly for hotspot transport — its real, truthful
state vocabulary (QUEUED/WAITING_FOR_TRANSPORT/TRANSPORT_AVAILABLE/
TRANSFERRING/RECEIVED/VERIFIED/FAILED/CANCELLED/EXPIRED, confirmed by
direct source read) is reused verbatim rather than translated into a
new invented vocabulary; that real vocabulary has no `SYNCED` state,
by the composed system's own explicit design, and this file never
reports one either.

**What it adds:** a real job lifecycle (`createJob`/`getJob`/
`listJobs`/`runJob`, QUEUED -> RUNNING -> COMPLETED/
CAPABILITY_UNAVAILABLE/FAILED) across 9 job types
(TRANSCRIPT_ANALYSIS/LANGUAGE_IDENTIFICATION/TERM_EXTRACTION/
PHRASE_EXTRACTION/TOPIC_EXTRACTION/TIMESTAMP_INDEXING/
DOMAIN_CLASSIFICATION/COMMUNITY_KNOWLEDGE_CANDIDATE/
RESEARCH_CANDIDATE), each with an honest, individually disclosed real/
unavailable boundary (see file header for the full per-job
justification — no job type ever reports a fabricated result);
`routeLanguageEvidence()` implementing the full real priority chain
(exact community/dialect -> regional language pack -> country language
pack -> general language pack -> honest `LANGUAGE_UNCERTAIN`/
`AMBIGUOUS_LANGUAGE`, composing RP-030's real `getPack`/
`listRegionalContexts` — never a silent substitution of one language's
knowledge for another); real duplicate-fingerprint handling
(`fingerprintFor()`/`recordFingerprint()` — sourceId+timestamp+
language+normalizedTerm+analysisType — flags real duplicates while
preserving every real evidence record, never merging or discarding
them); `submitExtractedTermSafely()` (every extracted term/phrase
goes through the real RP-029-C `classify()`/`quarantine()` gate before
ever becoming a stored community-knowledge candidate — no bypass, no
second safety system, verified by a dedicated test that unsafe terms
never reach the real ingestion store); real knowledge-domain
separation across all 7 spec-listed domains, always caller-asserted
via `DOMAIN_CLASSIFICATION`, always tagged `COMMUNITY_REPORTED`, never
auto-upgraded to a verified/professional label; real hotspot
integration (`shareAnalysisPackage()`/`receiveAnalysisPackage()`,
composing RP-033 Gate 2's real `sendPacket()`/`receivePacket()` — the
receiving side never trusts a device merely for presenting a
well-formed CozyOS packet: every accepted packet is run through the
real safety gate, a real duplicate-fingerprint check, and logged to a
real, disclosed in-memory audit trail); `feedResearchEngine()`
(composes Phase 3's real `getResearchPriority()`/`aggregateResearch()`
— never a second research/ranking system); and a full admin/research
visibility surface (`getAnalysisOverview`/`getLanguageAnalysis`/
`getDomainAnalysis`/`getTopTerms` — real `SOURCE_FREQUENCY`, always
explicitly distinct from `NOT_AVAILABLE_NO_TELEMETRY` user-usage
data — /`getResearchCandidates`/`getAnalysisFailures`/
`getQuarantinedResults`/`getCapabilityStatus`/`getSourceProvenance`).

**No bugs were found by this session's own test suite** — all 63
tests passed on the very first run, unlike Phases 2 and 3 (each of
which found and fixed one real bug before delivery). This is recorded
honestly, not claimed as a stronger guarantee than it is: it reflects
a smoke-tested implementation written after Phases 2-3's own lookup-
shape lessons were already applied (e.g. this file never assumes an
undocumented nested shape from a composed module without first
reading that module's real source, the exact category of bug that
affected both prior phases).

**Verification run this session:** `node` executed directly on the new
test file — **63/63 passing** (spec minimum: 50+), real integration
against the real Phase 1-3 chain, real RP-029-A/B/C, real RP-030
registry, and real RP-033 Gate 1/Gate 2 connectivity transport (no
mocks for any of them). Covers: pipeline creation, job lifecycle
(creation validation, state transitions, re-run rejection, filtering),
connector/index/search composition (reads the real current Phase 2
record, composes real RP-030/RP-029/Phase-3 functions directly),
authorization (analysis works on already-indexed local data
regardless of remote authorization state — only remote refresh, a
Phase 2 concern, requires it), metadata (real description fallback),
transcript capability (both the honest-unavailable and the real-
supplied-text paths), unavailable capability (topic extraction,
phrase/timestamp/domain jobs with no real evidence), language routing
(all four real priority levels plus ambiguous and uncertain),
duplicate handling (same real fingerprint vs. genuinely distinct
sources), timestamp handling, provenance (`getSourceProvenance`
answering "where did CozyOS learn this" from real indexed data),
safety gate/quarantine (unsafe terms quarantined and never reaching
ingestion, safe terms real-submitted), all 7 knowledge domains
(community/professional/agricultural/educational/health/religious,
plus a real cross-domain count-separation check), hotspot transport
(real `WAITING_FOR_TRANSPORT` with no live connection, refusal to
share a non-completed job, a real end-to-end share-then-receive round
trip, malformed-envelope rejection, real safety-gate execution on
receive, real audit-trail recording), offline queue/sync-state
vocabulary (real states only, `SYNCED` confirmed absent from the real
vocabulary), failed analysis, retry (duplicate resubmission tracked as
new real evidence, not silently dropped), malformed source (a record
with no analyzable text at all), unavailable network (hotspot
capability honestly unavailable with the transport module absent),
and three dedicated composition-boundary tests (no download/frame-
extraction function, no second safety system, no second language-pack
registry anywhere on this file's own public API). Full-repo regression
after Phase 4: all 56 pre-existing test files re-run; outcome
byte-for-byte identical to the pre-Phase-4 baseline — confirmed both
by re-running the identical file list before/after this session's
changes and by `diff -rq` against a pristine extraction of the Phase 3
baseline ZIP (exactly one new engine file and one new test file exist;
nothing else in the working tree differs beyond the five governance
files this session updates).

**Browser testing:** `BROWSER_TEST = NOT_APPLICABLE` — no Phase 4 UI
was built or required this session (Phase 4 is a data-layer pipeline
coordinator only, per its own spec).

**Known limitations, honestly disclosed:** no real transcript-fetch,
topic-modeling, or automatic (audio- or text-based) language-
identification backend exists anywhere in this repository — every job
type that would need one honestly reports `CAPABILITY_UNAVAILABLE`
rather than fabricating a result (see
`RP-034-PHASE4-LANGUAGE-ID-BACKEND` for the disclosed automatic-
detection follow-up). Phase 4's own job/fingerprint/audit-trail store
is session-scoped in-memory — the same disclosed pattern every other
stateful module in this repository already uses; Phase 4's real
*outputs*, once turned into a real timestamp or a real community-
knowledge candidate, do land in Phase 2's/RP-029's own real persistent
stores, but the job bookkeeping itself does not survive a session
reset. Real end-to-end WebRTC pairing between two live devices was not
established in tests — the same convention Phases 2-3 already
established, `shareAnalysisPackage()`/`receiveAnalysisPackage()` are
instead verified via a real, self-consistent share-then-receive round
trip using the real transport's own real envelope/integrity pipeline,
not a simulation of it. Phases 5-8 (expanded African-language
intelligence, privacy/identity expansion, offline synchronization,
final integrated test matrix) remain deferred — none of them was
quietly implemented in fragments and then claimed as Phase 4 scope.

**Status:** 🟢 Delivered (Phase 4 scope only). RP-034's overall
milestone remains open — see `HANDOFF.md` "RP-034 PHASE 4" for full
detail and the remaining phase-by-phase scope.

---

## RP-034 Phase 3 — Remote Media Search & Research Engine (DELIVERED)

**Scope:** Third stage of the RP-034 8-phase milestone. Builds a real,
deterministic search/ranking/research layer on top of the real Phase
2 persistent index, composing — never duplicating — Phase 2's own
`listRecords`/`getRecord`/`refreshMetadata`, RP-030 (read-only
language routing for query evidence), and RP-029-C (read-only
quarantine visibility). This entry covers Phase 3 only; Phases 4-8
remain deferred.

**Files added (additive only):**
`core/modules/intelligence/media/cozy-remote-media-search.js`,
`core/modules/intelligence/media/tests/cozy-remote-media-search.test.js`.

**What it adds:** real, deterministic matching
(`classifyRecordMatch()`) producing a real `matchType` from a fixed
priority order (EXACT_TERM > EXACT_PHRASE > LANGUAGE > DIALECT >
REGION > METADATA > PARTIAL) and a real `matchedFields` list per
result — deliberately no numeric relevance/confidence score anywhere,
since the spec's own example explicitly warns against fabricating one
and sorting by real matchType rank order is itself the transparent
ranking system; the full core query API
(`search`/`searchByTerm`/`searchByLanguage`/`searchByRegion`/
`searchByDialect`/`searchByChannel`/`searchBySource`/
`searchByTimestamp`); `findOccurrences()` (real, structured
sourceId/canonicalUrl/timestampSeconds/formattedTimestamp/matchedTerm/
language/region/dialect/provenance per real indexed timestamp entry —
never an interpolated or guessed timestamp); `findRelatedMedia()`
(real shared-language/region/dialect overlap only); `routeQueryLanguage()`
(composes RP-030 read-only, applying the identical resolved/uncertain/
ambiguous logic Phase 2's own `routeLanguage()` already uses, now to a
query's language evidence rather than a record's — no second routing
algorithm); `getResearchContext()`/`aggregateResearch()` (assembled
entirely from already-indexed data, explicitly never drawing a
medical/agricultural/professional conclusion of its own);
`compareRegions()`/`compareLanguages()`/`compareDialects()` (honest
`NO_INDEXED_EVIDENCE` when nothing exists, never invented statistics);
`detectConflicts()` (a real, disclosed heuristic — two or more real
matching records with a real, differing non-empty `description` for
the same query are reported `KNOWLEDGE_CONFLICT`, listing every
source's real provenance/contributor/confidence/validationStatus for
CozyAI or a human to interpret — this file never arbitrates or
silently picks a winner); `getIndexedTermFrequency()` (real
`SOURCE_FREQUENCY`, with `userUsageFrequency` always honestly
`NOT_AVAILABLE_NO_TELEMETRY`, since no usage telemetry exists anywhere
in this repository — the two are explicitly, permanently distinct
fields, never conflated); `getResearchPriority()` (real,
evidence-based LOW/NORMAL/HIGH/CONFLICT_REQUIRES_RESEARCH/
INSUFFICIENT_DATA derived from real source/region/language counts and
real conflict/provenance/validation signals — never popularity-based,
since no popularity telemetry exists); `requestRefresh()` (delegates
every real network attempt to Phase 2's real `refreshMetadata()`,
which itself delegates to the real Phase 1 connector — this file
builds no second YouTube API call anywhere); `getCapabilities()`
(every forbidden capability — video download, frame analysis, OCR,
ASR, face recognition, semantic embedding search — always honestly
`CAPABILITY_UNAVAILABLE`, `remoteFetch` honestly
`DELEGATED_TO_CONNECTOR`).

**Privacy, by construction:** this file stores no search history of
any kind anywhere — no `CozyMemory` namespace, no in-memory log of
past queries. Verified by a dedicated test asserting the real
`CozyMemory` key count for the index namespace is unchanged after
multiple real search calls — the simplest, safest way to keep
`USER_SEARCH_HISTORY` genuinely separate from `COMMUNITY_KNOWLEDGE`
and `REMOTE_MEDIA_INDEX` is to not create a search-history subsystem
at all this phase.

**A real bug was found and fixed by this session's own test suite
before delivery:** `quarantineLabel()` initially checked
`entry.sourceRecordId` directly against a real quarantine entry, but
the real safety gate's `quarantine()` function actually nests every
custom field (including `sourceRecordId`) under
`entry.fields.sourceRecordId` — confirmed by direct inspection of a
real quarantined entry's actual runtime shape. This meant every
quarantined search result was silently, incorrectly labeled
`RELEASED` instead of `QUARANTINED`. Fixed by reading
`entry.fields.sourceRecordId`; caught by the dedicated
quarantine-visibility test before delivery, which failed against the
original code and passes now.

**Verification run this session:** `node` executed directly on the new
test file — **56/56 passing** (spec minimum: 40+), real integration
against the real Phase 1 connector (via Phase 1's own established
`fetchImpl`-injection test pattern), real Phase 2 index, real RP-030
registry, and real RP-029-C safety gate (no mocks for any of them).
Covers: search (exact word, exact phrase, sentence-length query, partial
match, case normalization, empty query, malformed/whitespace-only
query, no-results, never-invents-a-result-count-mismatch check),
metadata (title/description/channel/sourceId), language (Kiswahili,
Dholuo, Kikuyu, Kikamba, Hausa, Tanzania regional routing, Kenya
regional routing, uncertain, ambiguous), timestamp (exact, multiple
occurrences, duplicate occurrences, invalid input, real chronological
ordering), research (aggregation, regional comparison, language
comparison, domain/provenance-label filtering, provenance retention,
confidence handling, a real two-source conflict case, a real
no-conflict case), privacy (search-history non-persistence, identity-
reference-only leakage boundary, no-credential-leakage), offline
(search fully offline, honest `NETWORK_UNAVAILABLE` on refresh rather
than fake success, real capability independence from network state,
honest not-found-vs-nothing-exists distinction), connector (real
refresh delegation with a real title update, real authorization-
failure surfacing, real network-failure surfacing via a real thrown
fetch error, capability-unavailable when the index itself is absent),
safety (quarantine vs released distinguishability, no second
safety/quarantine system exists on this file's own API, unsafe content
still surfaced and labeled rather than hidden or crashing, meaning/
context — language/region/dialect — preserved verbatim through
search), plus dedicated related-media and ranking-order checks.
Full-repo regression after Phase 3: all 55 pre-existing test files
re-run; outcome byte-for-byte identical to the pre-Phase-3 baseline —
confirmed both by re-running the identical file list before/after this
session's changes and by `diff -rq` against a pristine extraction of
the Phase 2 baseline ZIP (exactly one new engine file and one new test
file exist; nothing else in the working tree differs beyond the five
governance files this session updates).

**Browser testing:** `BROWSER_TEST = NOT_APPLICABLE` — no Phase 3 UI
was built or required this session (Phase 3 is a search/research
engine only, per its own spec).

**Known limitations, honestly disclosed:** no semantic/AI similarity
search exists — `semanticEmbeddingSearch` is permanently
`CAPABILITY_UNAVAILABLE` until a real embedding engine is actually
composed, never claimed otherwise. `detectConflicts()` is a real but
simple heuristic (differing non-empty `description` text for the same
query) — it surfaces disagreement for interpretation, it does not
understand meaning or resolve the conflict itself. Every research/
comparison function is bounded entirely by what Phase 2 has actually
indexed — `NO_INDEXED_EVIDENCE`/`INSUFFICIENT_DATA` are expected,
correct outcomes for sparse data, not defects to "fix" by inventing
data. Phases 4-8 (full media analysis pipeline, expanded
African-language routing, privacy/identity expansion, offline sync,
final integrated test matrix) remain deferred — none of them was
quietly implemented in fragments and then claimed as Phase 3 scope.

**Status:** 🟢 Delivered (Phase 3 scope only). RP-034's overall
milestone remains open — see `HANDOFF.md` "RP-034 PHASE 3" for full
detail and the remaining phase-by-phase scope.

---

## RP-034 Phase 2 — Persistent Remote Media Intelligence Index (DELIVERED)

**Scope:** Second stage of the RP-034 8-phase milestone. Builds a
real, in-memory persistent index on top of the real Phase 1 connector,
composing — never duplicating — `CozyMemory` (real CRUD +
versioning), RP-030 (real language routing, read-only), and RP-029-C
(real safety-pipeline integration). This entry covers Phase 2 only;
Phases 3-8 remain deferred.

**Files added (additive only):**
`core/modules/intelligence/media/cozy-remote-media-index.js`,
`core/modules/intelligence/media/tests/cozy-remote-media-index.test.js`.

**What it adds:** the canonical remote-media record shape exactly per
spec (indexId/sourceType/sourceId/canonicalUrl/title/description/
publishedAt/durationSeconds/channel/ownerAuthorization/sourceMetadata/
analysis/language/searchableTerms/timestamps/provenance/privacy/sync,
plus a per-field `fieldProvenance` map for spec §7's "preserve enough
provenance for every field" requirement); real CRUD
(`createRecord`/`getRecord`/`updateRecord`/`deleteRecord`/
`listRecords`/`countRecords`/`clearIndex`) via composed `CozyMemory`,
whose own real, automatic version history (`versionNumber`/`versions`)
is reused directly rather than building a second versioning
mechanism; real duplicate prevention via a `sourceType:sourceId`
lookup table (`upsertRemoteMedia()` is the real, dedup-safe primary
entry point); real field-aware `search()` tracking real `matchedFields`
per result, never inventing a timestamp/confidence not actually
indexed; real `addTimestamp()`; real `routeLanguage()` composing
RP-030 read-only (real packId resolution for a real registered
pack + matching regional context; honest `LANGUAGE_UNCERTAIN` for an
unregistered language or missing evidence; honest
`AMBIGUOUS_REGIONAL_CONTEXT` for a genuinely ambiguous match — never a
silent guess); a real `sanitizeAgainstSecrets()` privacy guard
rejecting any credential/token/secret-shaped input field before
storage; an honestly `SYNC_CAPABILITY_UNAVAILABLE`-only sync contract
(no real remote sync transport composed this phase); real
`refreshMetadata()` composing the real Phase 1 YouTube connector
(`getVideoMetadata()`), updating only fields the real API response
actually returned, preserving prior provenance/data otherwise; real
`getCapabilities()` (video download/frame access/transcript/OCR/
speech/face/scene always honestly `CAPABILITY_UNAVAILABLE` — no such
function exists anywhere on this file's public API, verified by a
dedicated test); real admin/research summary functions
(`getIndexSummary`/`getLanguageSummary`/`getRegionSummary`/
`getSourceSummary`/`getAnalysisStatus`/`getCapabilitySummary`).

**A real bug was found and fixed by this session's own smoke test
before the test suite was written (see `RP-034-PHASE2-INDEX`'s own
Repair Queue entry):** `listRecords()` initially misread
`CozyMemory.listKeys()`'s real return shape — the actual stored record
is nested under each entry's `.value` property, not spread flat onto
the entry object itself (confirmed by direct inspection of
`listKeys()`'s real implementation: `{key, ...this.#deepClone(entry.
current)}`, where `entry.current` is `{value, owner, tags, ...}`).
This silently broke `search()` (zero results even for genuine title/
description matches, confirmed reproduced before the fix) and every
`listRecords()` filter path. Fixed by reading `entry.value` correctly;
re-verified via the same smoke test, then locked in by dedicated
search tests.

**Verification run this session:** `node` executed directly on the new
test file — **55/55 passing** (spec minimum: 30+), real integration
against the real Phase 1 connector (via Phase 1's own established
`fetchImpl`-injection test pattern — a real, structured
Response-shaped object, never a fake implementation of the connector's
own parsing/capability logic), real `CozyMemory`, real RP-030
registry, and real RP-029-C safety gate (no mocks for any of them).
Covers: index CRUD (create/read/update/delete/list/count), duplicate
prevention, persistence save/reload, versioning (increment + real
history preservation via `listVersions()`), corrupted/missing-record
handling, search (title/description/channel/searchableTerms/language/
region/dialect/timestamp, plus a never-invents-data case), provenance
(source/retrieval-time/contributor-reference/confidence/validation-
state/per-field), language routing (Kenya/Dholuo, Tanzania/Kiswahili,
Kenya/Kikuyu, uncertain, ambiguous, unregistered), privacy (top-level
and nested secret-key rejection, reference-only acceptance, no raw
credential ever serialized), offline behavior (search continues
working offline, honest `NETWORK_UNAVAILABLE` rather than fake
success, correct capability state), real connector composition (two
dedicated tests: full real-field update, and partial-field-only
update that never fabricates a missing field), safety-pipeline
integration (unsafe text quarantined via the real gate, safe text
never quarantined), capability reporting, admin/research summaries,
sync contract (never fabricated `SYNCED`), and `clearIndex()`'s
authorization requirement.

**Regression run this session:** two full-repo regression passes.
The first showed one transient failure in RP-033 Gate 2's own test
(`core/connectivity/test/cozy-connectivity-transport.test.js`, 50/1
instead of the baseline 51/0). Investigated immediately per this
repair's own "no unrelated failure may be reclassified without
evidence" instruction: re-ran that file standalone 3 times (51/0
every time, failure never reproduced) and re-ran the entire 54-file
suite a second time in full (byte-for-byte identical to the
pre-Phase-2 baseline, including Gate 2 back at 51/0). Recorded here as
a pre-existing, unrelated, non-reproducible flake in Gate 2's own
test — not caused by this session's work: each test file runs in its
own isolated Node process, and Gate 2's test never imports Phase 2's
new file at all. Confirmed via `diff -rq` against a pristine
extraction of the Phase 1 baseline ZIP: exactly one new file and one
new test directory exist; nothing else in the working tree differs
beyond the five governance files this session updates.

**Browser testing:** `BROWSER_TEST = NOT_APPLICABLE` — no Phase 2 UI
was built or required this session (Phase 2 is a data-layer-only pass
per its own spec).

**Known limitations, honestly disclosed:** `CozyMemory`, the real
persistence primitive this file composes, is real but in-memory/
session-scoped only — there is no disk/IndexedDB-backed storage engine
anywhere in this repository (see `RP-034-INDEX-DISK-PERSISTENCE` in
the Repair Queue). Phases 3-8 (advanced local search/research, full
media analysis pipeline, expanded African-language routing, privacy/
identity expansion, offline sync, final integrated test matrix) remain
deferred — the record shape reserves slots for their future data
(`analysis`, extended `language`, `privacy`) but no real implementation
exists behind any of them yet; none of these was quietly implemented
in fragments and then claimed as Phase 2 scope.

**Status:** 🟢 Delivered (Phase 2 scope only). RP-034's overall
milestone remains open — see `HANDOFF.md` "RP-034 PHASE 2" for full
detail and the remaining phase-by-phase scope.

---

## RP-034 Phase 1 — CozyOS Remote Media Intelligence Connector, Connector Foundation (DELIVERED)

**Scope:** Phase 1 of the 8-phase RP-034 milestone (overall milestone
remains IN PROGRESS — persistent index, search, full pipeline,
African-language routing, privacy/identity, and RP-033 offline-sync
composition are Phases 2-8). New file `core/modules/intelligence/
media/cozy-media-connector.js`: generic `MediaConnectorRegistry` +
real `YouTubeConnector` (authorization-state tracking with no
fabricated OAuth; capability detection reusing RP-033's honest
vocabulary; real URL/ISO-8601-duration parsing; real YouTube Data API
v3 metadata retrieval parsing only fields the API actually returned).
`videoDownload`/`frameAccess`/`transcriptFetch`/`ocrSceneIntelligence`
are permanently `CAPABILITY_UNAVAILABLE` by design — no such method
exists on the connector's public surface.

**Verification actually run this session:** `node --check
core/modules/intelligence/media/cozy-media-connector.js` clean;
`node core/modules/intelligence/media/test/
cozy-media-connector.test.js` — 30/30 passing; full regression re-run
unmodified — RP-033 Gate 2 (51/51), RP-033 Gate 1 (34/34), RP-029
`cozy-knowledge-ingestion` (26/26), `cozy-knowledge-community` (36/36),
`cozy-knowledge-registry` (11/11), `cozy-knowledge-review` (30/30),
`cozy-knowledge-safety-gate` (22/22), RP-030/031
`cozy-language-pack-registry` (32/32), `cozy-language-acquisition-
pipeline` (30/30), `cozy-language-registry` (15/15), admin language
dashboard quarantine-hotspot spot-check (31/31) — 202 regression tests,
0 failures. A real live call against the YouTube Data API v3 endpoint
was attempted from this sandbox and returned a real HTTP 403 (no
outbound network access in this environment), surfaced honestly by the
connector's error path rather than converted into a fabricated success.

**Packaged:** `CozyOS-main-RP-034-Phase1.zip`. **STATUS: Phase 1
DELIVERED.**

---

## RP-033 Gate 2 — Cozy Living Connectivity, Real Pairing + Transport (DELIVERED)

**Scope:** Gate 2 of the RP-033 milestone (overall milestone remains IN
PROGRESS — BLE GATT transport, full trust evaluation, and multi-hop
relay remain later gates). New file `core/connectivity/
cozy-connectivity-transport.js` composes `cozy-connect.js`,
`cozy-living-connectivity.js`, `live-hotspot-engine.js`, and
`cozy-share.js` (all four confirmed unchanged from Gate 1 baseline
before this file was written) into a real COZYPAIR invitation flow, a
real `LiveHotspotEngine.createHost()/joinHost()/completeHostPairing()`
invocation path, a real `RTCDataChannel` send/receive adapter, the
packet-integrity pipeline (envelope→session→sender→expiration→replay→
integrity→ACCEPT), an offline store-and-forward queue, and security
composition (identity→session→challenge→trust decision→transport
authorization).

**Verification actually run this session:** `node --check
core/connectivity/cozy-connectivity-transport.js` clean;
`node core/connectivity/test/cozy-connectivity-transport.test.js` —
51/51 passing; `node core/connectivity/test/
cozy-living-connectivity.test.js` (Gate 1 regression, re-run unmodified)
— 34/34 passing; `node core/connectivity/test/
browser-e2e-gate2.js` (genuine Chromium/Playwright, no mocks) — real
`RTCPeerConnection` confirmed, real host ICE candidate confirmed
gathered, full ICE-gathering-complete does not fire in this sandboxed
container's no-outbound-network environment, so 2/8 real-browser
sub-checks completed (`user-rejected invitation never negotiates`,
`malformed offer code → real NEGOTIATION_FAILED`) and the
negotiated-channel sub-checks are honestly unresolved in this
environment rather than fabricated as passing.

**Packaged:** `CozyOS-main-RP-033-Gate2.zip`. **STATUS: Gate 2
DELIVERED.**

---

## RP-033 Gate 1 — Cozy Living Offline Connectivity (Connectivity Core + Capability Detection) (DELIVERED)

**Scope:** Gate 1 of the RP-033 milestone (overall milestone remains
IN PROGRESS — real pairing/transport/store-and-forward relay belong
to later gates). A new, additive connectivity coordinator that
detects and honestly reports capability; it does not itself perform
any new physical transport.

**Repository audit performed before writing any code:** two existing,
relevant files found and read in full — `core/connectivity/
cozy-connect.js` (the existing owner of physical-transport capability
detection: Bluetooth/USB/Presentation/Wifi-status/Camera/Microphone/
Screen/Serial/HID/NFC/Cast, provider-registry architecture, 370
lines) and `core/engines/collaboration/live-hotspot-engine.js`
(M286/M362 — the existing owner of *real* WebRTC via
`RTCPeerConnection` with manual SDP-exchange pairing, i.e. real
QR/manual pairing transport). `core/network/
cozy-network-orchestrator.js` (real routing/orchestrator, written in
an ES-module-flavored dialect) and `core/collaboration/
cozy-share.js` (real collaboration layer built on `CozyConnect`) were
both confirmed present and deliberately not modified or duplicated —
their composition is deferred to a later gate. No second
connectivity registry, no second WebRTC engine, and no second
Bluetooth/USB implementation were created.

**Files added (additive only):**
`core/connectivity/cozy-living-connectivity.js`,
`core/connectivity/test/cozy-living-connectivity.test.js`.

**What it adds:** capability detection composed from `CozyConnect`
and `LiveHotspotEngine`, normalized into
`AVAILABLE`/`PARTIAL`/`UNAVAILABLE`/`CAPABILITY_UNAVAILABLE`/
`REQUIRES_USER_ACTION`/`REQUIRES_NATIVE_COMPANION` — native Wi-Fi
Direct and native OS-level hotspot creation always honestly
`REQUIRES_NATIVE_COMPANION`, matching the same non-fabrication
pattern already established in `LiveHotspotEngine.
createWifiHotspot()`/`connectWifiDirect()`; the offline-first
connectivity state machine (`DISCOVERING` → `PAIRING_REQUIRED` →
`PAIRING` → `PAIRED` → `READY` → `TRANSFERRING`/`QUEUED`/
`WAITING_FOR_NETWORK`/`SYNCING` → `VERIFIED`, plus `FAILED`/
`CAPABILITY_UNAVAILABLE`) with an explicit transition table that
rejects invalid jumps and contains no fabricated `CONNECTED`/`SYNCED`
state; the store-and-forward Cozy packet contract (destination,
payloadType, payloadId, createdAt, TTL, priority, encryptionState,
transportState, retryCount, provenance chain) with TTL-expiry, retry,
and transport-state-update helpers — actual multi-hop relay is
explicitly out of scope; identity/session/invitation/replay-
protection contracts, with device identity composed from
`TrustedDeviceManager.generateFingerprint()` when loaded (honestly
unavailable, never fabricated, when not loaded), session identity
kept deliberately separate from device identity, QR/manual invitation
codes containing only a session reference + expiry (never keys or the
raw fingerprint), and a real, working single-use nonce registry for
replay protection — no cryptographic primitives were invented;
signing/verification of session tokens is explicitly deferred to a
later gate composing real Cozy security infrastructure.

**Verification actually run this session:** `node -c core/connectivity/
cozy-living-connectivity.js` — syntax OK. `node core/connectivity/
test/cozy-living-connectivity.test.js` — 34/34 passing, covering
capability detection in both a plain-Node environment (no
`navigator`, no `RTCPeerConnection` — everything honestly
`UNAVAILABLE`) and a browser-like stubbed environment (real
`AVAILABLE`/`PARTIAL` results), state-machine valid/invalid
transitions, packet TTL/retry/metadata, identity/invitation/replay
protection, and regression assertions against the real, unmodified
`cozy-connect.js`, `live-hotspot-engine.js`, and `cozy-share.js` (all
three still load and behave exactly as before). A pre-existing,
unrelated suite (`cozy-admin-language-dashboard-quarantine-
hotspot.test.js`) was spot-checked after this session's work and
remains 31/31 passing, unaffected.

**Deferred to later RP-033 gates (documented, not hidden):** real
QR/manual pairing + real WebRTC/Bluetooth transport actually invoked
end-to-end (Gate 1 only detects and reports the capability — it does
not call `LiveHotspotEngine.createHost()`/`joinHost()`); real
multi-hop packet relay; wiring the packet contract into
`cozy-network-orchestrator.js`; crypto settlement/payment messages;
full trust evaluation via `living-security-coordinator.js`/
`living-trust-engine.js`; `cozy-share.js` integration.

**Packaged:** `CozyOS-main-RP-033-Gate1.zip`. **STATUS: Gate 1
DELIVERED.**

---

## RP-032 — CozyOS Living Compressor (DELIVERED)

**Scope:** A new, independent milestone — the first pass of the Living
Compressor: real, offline-first compression planning/orchestration,
composing existing engines rather than duplicating them.

**Repository audit performed before writing any code:** two existing,
relevant files found and read in full —
`core/modules/knowledge/living-compressor.js` (M333) — a real,
existing `window.CozyOS.LivingCompressor` phrase-dictionary TEXT
compressor (compressText/decompressText/checksum), whose own header
already discloses no client-side binary-compression library exists in
this repository. `core/connectivity/compression.js` — a real, honestly
disclosed network-payload delta optimizer whose own header discloses
`ESTIMATED_SAVINGS_RATIO = 0`, independently confirming no real binary
compression backend exists anywhere in this repository. RP-032's new
engine composes M333's real text compressor verbatim — never
duplicates it, and does not claim `window.CozyOS.LivingCompressor` for
itself (registers under a new, non-colliding name).

**Files added (additive only):**
`core/living/cozy-living-compressor.js`,
`core/living/tests/cozy-living-compressor.test.js`.

**What it adds:** real extension-based file classification (honest
GENERAL_FILE fallback for unrecognized extensions); real duplicate
detection (EXACT_DUPLICATE via content-hash match, LIKELY_DUPLICATE
via same type/size/basename-ignoring-copy-suffix, NEAR_DUPLICATE via
same type + size within 5%, UNRELATED otherwise — `analyzeFile()`
never auto-deletes); compression planning that only ever offers
`COMPRESS` for DOCUMENT-type files with real text content and the real
composed text-compressor backend present — every other type honestly
`CAPABILITY_UNAVAILABLE`; `estimateCompression()` returns a real
percentage only from an actual composed-compressor run, otherwise
`ESTIMATE_UNAVAILABLE`, never invented; mandatory `requestUserApproval()`
gating (`confirmed: true` required) for COMPRESS/DELETE — nothing
automatic; `executeCompression()`/`verifyCompression()`/`restoreFile()`
— a real round-trip through the composed text compressor with real
checksum comparison, `COMPRESSION_FAILED` (original retained) on any
real mismatch; `deleteOriginal()` refuses on a compressed-but-not-yet-
`VERIFIED` file without an explicit override;
`getLanguagePackPreservationPlan()` composes real RP-030 pack/
expression records — region/dialect/license/provenance/confidence/
validation are always listed as preserved, never offered to
compression; the African Language Preservation rule is enforced in
`requestUserApproval()` itself — a DELETE on a LANGUAGE_PACK file with
only a bare `LOW_USAGE` reason (or no reason) is rejected, a real
distinct reason is required; `checkDistributionSafety()`/
`shareCompressedPackage()` compose the real `CozyKnowledgeSafetyGate`
— quarantined content is always `BLOCKED` from sharing;
`shareCompressedPackage()`/`receiveCompressedPackage()` compose the
real `LiveHotspotEngine` directly (same pattern as the existing
RP-029-C Phase 2 bridge) — real states only, `SYNCED` never emitted
(the real transport has no such concept, same finding already
disclosed in RP-031-B Increment 4); `getStorageCondition()` gives a
real, advisory-only (`neverAutomatic: true`) low-storage recommendation
computed from real registered-file data; `getStorageAnalyticsSnapshot()`
reports real, live, in-session aggregates, with
`mostCompressedFileTypeHistorically` honestly
`NOT_AVAILABLE_NO_TELEMETRY`.

**A real bug was found and fixed by this session's own test suite
before delivery (see `RP-032` and its own row in the Repair Queue):**
`planCompression()` initially checked only file type + text-content
presence, not whether the real, composed text-compressor module was
actually loaded — meaning it could claim `AVAILABLE` compression
capability even with the real backend absent. Fixed with an explicit
`textCompressor()` presence check and a distinct
`CAPABILITY_UNAVAILABLE_TEXT_COMPRESSOR_ABSENT` reason; caught by the
"unavailable backend handling" test before delivery, which failed
against the original code and passes now.

**Verification run this session:** `node` executed directly on the new
test file — **49/49 passing**, real integration against the real M333
text compressor, real RP-030 registry, real RP-029-C safety gate, and
real `LiveHotspotEngine` (no mocks for any of them). Covers every
spec-listed test category: file classification, size calculation,
duplicate detection (all four classes), compression planning,
compression profiles, user approval, destructive-action protection,
original preservation, verification, checksum recording, restore
state, language-pack metadata preservation, provenance preservation,
African Language Preservation (three real cases), privacy, quarantine
protection, offline operation, hotspot integration (including a real
round-trip share+receive and a SYNCED-never-emitted check),
unavailable-backend handling, low-storage recommendations,
already-compressed files, corrupted input, compression failure, and
missing-evidence/insufficient-data handling. Full-repo regression
after this session: all 50 pre-existing test files re-run; outcome
byte-for-byte identical to the pre-session baseline — confirmed both
by re-running the identical file list before/after this session's
changes and by `diff -rq` against a pristine extraction of the
RP-031-B Increment 5 baseline ZIP (exactly two new files exist — the
engine and its test file — plus the five governance files this
session updates; nothing else in the working tree differs).

**Known limitations, honestly disclosed:** no real image/video/audio/
binary compression backend exists anywhere in this repository or
environment (see `RP-032-BINARY-COMPRESSION-BACKEND` in the Repair
Queue) — this engine classifies, deduplicates, and plans for those
types, but never actually byte-compresses them. No real filesystem/
device-storage scan exists in this environment — `registerFile()`
operates on caller-supplied descriptors, not a real disk scan.
CozyMemory persistence for the compression ledger was evaluated but
not wired this pass (see `RP-032-MEMORY-PERSISTENCE`) — the engine is
honestly session-scoped in-memory, the same disclosed pattern M333's
own file already uses when CozyMemory is absent. No browser UI was
built this session — none was required (spec: "Browser tests only if
a real browser UI is built").

**Status:** 🟢 Delivered. Package
`CozyOS-main-RP-032-Living-Compressor.zip`, `unzip -t` clean, 1095
entries, package SHA-256 computed twice independently (identical) —
value communicated externally in the delivery message, not embedded
here. Scope as delivered only — see `HANDOFF.md` "RP-032, LIVING
COMPRESSOR" for full detail. Remaining disclosed gaps
(`RP-032-BINARY-COMPRESSION-BACKEND`, `RP-032-MEMORY-PERSISTENCE`)
stay open in the Repair Queue for a future Builder, not fabricated as
closed.

---

## RP-031-B — Admin Language Dashboard + Usage/Research Analytics (Increment 5, IN PROGRESS)

**Scope:** Fifth stage after Increments 1–4. Builds the Admin Language
Dashboard UI + production-safe authorization, composing — never
duplicating — Increments 1–4's own APIs, RP-029-C Phase 2's real
authorization (`resolveRole`), RP-029-B's real independent-confirmation
function, and RP-031 Phase 1's real Hearing Mode acquisition pipeline.
This entry covers Increment 5 only; the milestone is still not
complete.

**Files added (additive only):**
`core/modules/intelligence/language-packs/admin-dashboard/cozy-admin-language-dashboard-ui.js`,
`core/modules/intelligence/language-packs/admin-dashboard/admin-language-dashboard.html`,
`core/modules/intelligence/language-packs/admin-dashboard/admin-language-dashboard.css`,
`core/modules/intelligence/language-packs/admin-dashboard/tests/cozy-admin-language-dashboard-ui.test.js`,
`core/modules/intelligence/language-packs/admin-dashboard/tests/cozy-admin-language-dashboard-ui-browser.test.js`.

**What it adds:** a `core` (DOM-free, Node-testable) logic layer
covering all 10 spec dashboard sections (Language Overview, Language
Routing, Term Explorer, Research, Community Analytics, Domain
Analytics, Quarantine, Hotspot, Rule 82, Most Used) plus Hearing Mode,
each backed by a real Increment 1–4/RP-031-Phase-1 function call —
never a second implementation. `resolveUiRole()` reuses RP-029-C Phase
2's real `resolveRole()` verbatim; a requested `OWNER`-tier view is
honestly mapped to the real backend's actual highest tier (`ADMIN`)
with a disclosed note, since no `OWNER` role exists anywhere in this
repository's real authorization code — never a fabricated fifth
privilege level. `confirmContribution()` composes RP-029-B's real
`addIndependentConfirmation()` at `COMMUNITY`+ rank, deliberately not
gated behind reviewer authorization — this spec explicitly warned
against repeating the disclosed Phase 2 bug where confirmation was
once accidentally hidden behind reviewer auth, and a dedicated test
verifies a `COMMUNITY`-tier user can confirm without `REVIEWER` rank.
`getTermSearchView()` adds an honest ambiguity classification on top
of Increment 2's real search results: two real records for the same
query with genuinely different `meaning` text are both preserved and
flagged `CONFLICTING_MEANING`, never merged or overwritten. A real DOM
`init()` renders a tabbed layout driven solely by `core`'s output, with
keyboard tab navigation and no external dependency beyond what this
repository already uses (`core/ui/cozy-tokens.css`/`cozy-components.css`,
existing `cozy-badge-*` classes reused as-is).

**Two real bugs were found by this session's own test suites before
delivery, not discovered later (see `DI-013` in the Repair Queue for
the first):**
1. A lookup-shape mismatch: `cozy-knowledge-review-dashboard-core.js`
   exposes its real API at
   `window.CozyOS.CozyKnowledgeReviewDashboardCore` directly, not via
   `Modules["cozy-knowledge-review-dashboard-core"].api` like every
   other composed module in this repository — a genuine inconsistency
   in the repository's own registration conventions, not a defect in
   the existing file. Increment 5's own lookup was corrected to match
   the real export shape; the existing file itself was not touched.
   Caught by the Node `core` test suite's very first authorization
   test.
2. A real mobile-layout overflow: at a 375px viewport,
   `.cozy-admin-table` forced horizontal page overflow. Fixed with
   `overflow-x: auto` on `.cozy-admin-tab-panel`. Caught by, and
   re-verified passing after the fix via, the real Playwright
   narrow-viewport browser test.

**Verification run this session:** `node` executed directly on the new
Node test file — 22/22 passing, real integration against the real
RP-029-A/B/C chain, real RP-030 registry, real RP-031 Phase 1
acquisition pipeline, and real Increments 1–4 (no mocks for any of
them). **A real browser test** (Playwright + actual headless Chromium,
driving the real `admin-language-dashboard.html` page, not a DOM
simulation) — **13/13 passing, `BROWSER_TEST = PASS`** — covering all
12 spec-listed minimum browser scenarios: dashboard load, language
overview render, routing, term explorer, honest ambiguity display,
restricted quarantine visibility for an unauthorized visitor, blocked
unauthorized actions, available authorized-reviewer detail, real
(never fabricated) hotspot state, Rule 82 remaining locked, honest
telemetry-unavailable state, a real 375px responsive check, keyboard
tab navigation, and zero uncaught page errors. Full-repo regression
after Increment 5: all 48 pre-existing test files re-run; outcome
byte-for-byte identical to the pre-Increment-5 baseline — confirmed
both by re-running the identical file list before/after this session's
changes and by `diff -rq` against a pristine extraction of the
Increment 4 baseline ZIP (exactly the expected new files exist;
nothing else in the working tree differs beyond the five governance
files this session updates).

**Status:** 🔵 Implementing. Not closed — see `HANDOFF.md` "RP-031-B,
INCREMENT 5" for full detail and the remaining scope.

---

## RP-031-B — Admin Language Dashboard + Usage/Research Analytics (Increment 4, superseded by Increment 5 above, kept for history)

**Scope:** Fourth stage after Increments 1–3. Builds Quarantine + Cozy
Offline Hotspot Dashboard Views, composing — never duplicating —
RP-030's language-pack registry, RP-029-C's safety gate/quarantine-
admin/review/hotspot-bridge, and Increment 3's own community/domain
analytics. This entry covers Increment 4 only; the milestone is still
not complete (no browser UI, dashboard-local authorization layer of
its own, or browser tests yet).

**Files added (additive only):**
`core/modules/intelligence/language-packs/admin-dashboard/cozy-admin-language-dashboard-quarantine-hotspot.js`,
`core/modules/intelligence/language-packs/admin-dashboard/tests/cozy-admin-language-dashboard-quarantine-hotspot.test.js`.

**What it adds:** `getQuarantineOverview(roleInfo)` (real
authorization-guarded current/under-review/high-risk counts and
language/region/contribution-type breakdowns; historical released/
rejected/escalated honestly `NOT_AVAILABLE_NO_HISTORICAL_AGGREGATE`,
same finding as Increment 3, since the real gate deletes terminal
entries from its store and no historical aggregate counter exists
anywhere); `getRule82Visibility(languageId)` (reshapes the real,
existing `CozyKnowledgeReview.evaluateRule82Gate()` output into
`BLOCKED`/`NOT_READY`/`LOCKED`/`READY_FOR_REVIEW`, no mutator, no
second gate, discloses the real scope mismatch between RP-030's
13-language registry and the narrower RP-027 registry the real gate
evaluates against); `shareViaHotspot()`/`receiveHotspotPayload()`/
`getHotspotOverview()` (thin, logged wrappers over the real hotspot
bridge; real transport status strings only —
`SYNCING`/`SYNCED`/`CONFLICT` are honestly `NOT_SUPPORTED_BY_TRANSPORT`
since the real transport, confirmed by direct source read of both the
bridge and `LiveHotspotEngine`, has no such states at all; the
dashboard's own activity ledger discloses it only observes traffic
through its own wrapper calls, not the bridge's production
`wireReceiver()` listener); `describeHotspotRouting()` (composes
Increment 1's real routing only); `getLanguageSafetySummary()` (a
language is never itself labelled unsafe); `getCommunityView()`/
`getDomainSafetyView()` (verbatim Increment 3 reuse);
`resolveAuthorization()` (thin wrapper over the real quarantine-admin
`resolveRole()`); `getDashboardViewModel()` (combined view assembled
from the real functions above only).

**No new bug found in existing code this session** — Increment 4's own
redaction boundary (`redactQuarantineItem()`) mirrors Increment 3's
prior fix (raw `fields`/`evidence` stripped before leaving this file)
and was verified clean by dedicated privacy-redaction and
raw-evidence-cannot-leak tests before delivery.

**Verification run this session:** `node` executed directly on the new
test file — 31/31 passing, real integration against the real
RP-029-A/B/C chain, real RP-030 registry, real `LiveHotspotEngine`,
and real Increments 1–3 (no mocks for any of them). Covers: quarantine
overview (empty/multiple-states/high-risk), historical totals,
language/region/contribution-type aggregation, privacy redaction,
raw-evidence non-leakage, Rule 82 LOCKED/no-promotion, hotspot
transport states (including SYNCED-never-fabricated and
CONFLICT-unsupported), unavailable-capability handling, language
routing (resolved/ambiguous/uncertain), community aggregation, domain
separation, safety status, authorization/unauthorized access, missing
telemetry, malformed hotspot/quarantine records, and end-to-end
composition through the real submitExpression() → safety gate →
quarantine → dashboard chain. Full-repo regression after Increment 4:
all 47 pre-existing test files re-run; outcome byte-for-byte identical
to the pre-Increment-4 baseline — confirmed both by re-running the
identical file list before/after this session's changes and by `diff
-rq` against a pristine extraction of the Increment 3 baseline ZIP
(exactly the expected new files exist; nothing else in the working
tree differs beyond the five governance files this session updates).

**Status:** 🔵 Implementing. Not closed — see `HANDOFF.md` "RP-031-B,
INCREMENT 4" for full detail and the remaining scope.

---

## RP-031-B — Admin Language Dashboard + Usage/Research Analytics (Increment 3, superseded by Increment 4 above, kept for history)

**Scope:** Third stage after Increments 1–2. Builds Domain & Community
Analytics on top of Increments 1–2's own APIs, composing — never
duplicating — RP-030's language-pack registry, RP-029-B's
`CozyKnowledgeCommunity`, and RP-029-C's `CozyKnowledgeSafetyGate`/
`CozyKnowledgeQuarantineAdmin`. This entry covers Increment 3 only; the
milestone is still not complete (no browser UI, dashboard-local
authorization layer of its own, hotspot dashboard views, or browser
tests yet).

**Files added (additive only):**
`core/modules/intelligence/language-packs/admin-dashboard/cozy-admin-language-dashboard-domain-community.js`,
`core/modules/intelligence/language-packs/admin-dashboard/tests/cozy-admin-language-dashboard-domain-community.test.js`.

**What it adds:** `getLanguageActivity()`/`listLanguageActivity()`
(real per-region/dialect word/phrase/confidence/confirmation/
disagreement counts, reusing Increment 2's `getResearchPriority()`
verbatim); `getDomainAnalytics()` (all 9 spec domains honestly
`DOMAIN_NOT_TRACKED_BY_REGISTRY`, real 0 counts — RP-030's schema has
no domain field); `getCommunityContributionAnalytics()` (pseudonymous-
only contributor counts; real submitted/confirmed/disputed/
clarification/currently-quarantined counts; `released`/post-
quarantine-`rejected` totals honestly `NOT_AVAILABLE_NO_HISTORICAL_
AGGREGATE`, since the real safety gate deletes a quarantine entry from
its store on release/reject/escalate — confirmed by direct source
read of `releaseFromQuarantine()` — and no historical aggregate
counter exists anywhere in this repository); `getQuarantineIntegration()`
(composes RP-029-C Phase 5's real authorization-guarded layer, same
UNAUTHORIZED/AUTHORIZATION_BACKEND_UNAVAILABLE behavior, no second
auth system); `getRegionalKnowledgeMap()` (real country -> region ->
language/dialect/vocabulary tree, built only from actual
`registerRegionalContext()` calls); `getMostUsedSummary()` (verbatim
Increment 1 passthrough); `getResearchDashboard()` (aggregates
Increment 2's own per-language scoring, never recomputes it);
`detectCrossLanguageGap()` (real per-term comparison by the actual
`meaning` field, distinguishing `LANGUAGE_NOT_SUPPORTED` from
`LANGUAGE_REGISTERED_NO_DATA` from a genuine per-term
`GAPS_FOUND`/`NO_GAPS_FOUND_IN_SAMPLE`).

**A real bug was found and fixed by this session's own test suite
before delivery (see `DI-012` in the Repair Queue):** RP-029-C Phase
5's own `listQuarantine()` spreads its underlying quarantine-store
entry verbatim, exposing raw `evidence[].contributorId` and raw
submitted `fields` to any REVIEWER+-authorized caller — a leak
Increment 2's own `getQuarantineSummary()` had already avoided.
Increment 3's own `getQuarantineIntegration()` redacts `fields`/
`evidence` (`redactQuarantineItem()`) before returning them, without
modifying the locked Phase 5 file itself. A dedicated test
(`privacy protection: quarantine integration never leaks raw
evidence/contributorId even when authorized`) failed against the
unredacted code and passes now — confirming the fix, not just
asserting it.

**Verification run this session:** `node` executed directly on the new
test file — 28/28 passing, real integration against the real RP-030/
RP-029-A/B/C chain and real Increments 1–2 (no mocks for any of them).
Full-repo regression after Increment 3: all 46 pre-existing test files
re-run; outcome byte-for-byte identical to the pre-Increment-3
baseline (36 clean, `engine-bridge` 11/1, `audio-manager` 15/15, 8
files with pre-existing load failures unrelated to this scope,
unchanged) — confirmed both by re-running the identical file list
before/after this session's changes and by `diff -rq` against a
pristine extraction of the Increment 2 baseline ZIP (exactly two new
files exist; nothing else in the working tree differs).

**Status:** 🔵 Implementing. Not closed — see `HANDOFF.md` "RP-031-B,
INCREMENT 3" for full detail and the remaining scope.

---

## RP-031-B — Admin Language Dashboard + Usage/Research Analytics (Increments 1–2, superseded by Increment 3 above, kept for history)

**Scope:** Second stage after RP-031 Phase 2A. Builds the admin-facing
data layer for understanding CozyAI's language knowledge, composing —
never duplicating — RP-030's language-pack registry and RP-029-C's
safety gate. This entry covers Increments 1–2 only; the milestone is
not complete (no browser UI, authorization, domain/community
analytics, hotspot views, or browser tests yet).

**Files added (additive only):**
`core/modules/intelligence/language-packs/admin-dashboard/cozy-admin-language-dashboard-core.js`,
`core/modules/intelligence/language-packs/admin-dashboard/tests/cozy-admin-language-dashboard-core.test.js`,
`core/modules/intelligence/language-packs/admin-dashboard/cozy-admin-language-dashboard-term-explorer.js`,
`core/modules/intelligence/language-packs/admin-dashboard/tests/cozy-admin-language-dashboard-term-explorer.test.js`.

**Verification run this session:** `node` executed directly on both
new test files. Increment 1: 14/14 passing. Increment 2: 23/23
passing. Full-repo regression after both increments: 659 passed, 0
failed across 30 test files that execute; 4 pre-existing files
(`scene-manager`, `media-pipeline-manager`, `playback-engine`,
`camera-manager`) fail to load both before and after this session's
changes, unchanged — confirmed by running the identical file list
before writing any RP-031-B code and again after Increment 2.

**Status:** 🔵 Implementing (superseded — see Increment 3 entry above
for the current state).

---

## RP-031-PHASE2A — Teach CozyAI full knowledge vocabulary + language-pack routing

**Scope:** First of six staged RP-031 Phase 2 passes. Extended the
contributor-facing knowledge vocabulary beyond RP-029-C Phase 3's
narrower `CONTRIBUTION_TYPES`, and — for the first time — wired a
Teach CozyAI submission to reach RP-030's real language-pack registry
in addition to the RP-029-B review pipeline, so contributions actually
become fast, locally-retrievable pack records (spec section K depends
on this).

**Files added (additive only):**
`core/modules/intelligence/knowledge/teach/cozy-teach-cozyai-routing-core.js`,
`core/modules/intelligence/knowledge/teach/tests/cozy-teach-cozyai-routing-core.test.js`,
`core/modules/intelligence/knowledge/teach/ui/cozy-teach-cozyai-ui.js`,
`core/modules/intelligence/knowledge/teach/ui/teach-cozyai-form.html`,
`core/modules/intelligence/knowledge/teach/ui/tests/cozy-teach-cozyai-browser.test.js`.

**Verification:** `node core/modules/intelligence/knowledge/teach/tests/cozy-teach-cozyai-routing-core.test.js`
→ 21 passed, 0 failed. `node core/modules/intelligence/knowledge/teach/ui/tests/cozy-teach-cozyai-browser.test.js`
→ 6 passed, 0 failed, `BROWSER_TEST = PASS` (real Playwright/headless
Chromium run in this environment, not skipped). Full pre-existing
42-file suite re-run before and after: identical pass/fail pattern
(11 pre-existing unrelated failing files, unchanged; every RP-029/
RP-030/RP-031-Phase-1/RP-027 suite still 0 failed).

**Disclosed limitations:** "Community" is tracked by this new file's
own side-table, not RP-030's schema (RP-030 not modified). Domain
knowledge is always `COMMUNITY_REPORTED_NOT_PROFESSIONALLY_VERIFIED`
— no professional-review engine exists. No ASR/OCR/automatic language
ID/translation-ML anywhere in this pass.

---

## RP-001 — `modules/quarry/quarry-contants.js` — duplicate content / dangling object literal

**Problem:** `node --check` failed at line 341 (`Unexpected token ':'`).

**Root cause:** the file contained the entire `Actions`/`QuarryConstants`
block duplicated in full, plus an orphaned fragment of route properties
left dangling outside any object literal after a `window.*` assignment
statement — not a typo, a merge/paste artifact.

**Repair:** removed the duplicate block and the orphaned fragment;
kept the original, more complete first definition (the duplicate was
also missing one field, `Collections.DASHBOARD_METRICS`, confirming
the first copy was authoritative).

**Confidence:** High — root cause fully explained by evidence in the
file itself; no inference required.

**Regression result:** `node --check` → PASS. Runtime smoke test (Node,
simulated `window` global) → `Routes`, `Actions`, `Collections` all
resolve correctly; `window.CozyOS.Quarry.Constants === window.QuarryConstants`
→ `true`. No regression.

**Compatibility:** Full — public shape (`Routes`, `Actions`, `Roles`,
`Events`, `Collections`, `Languages`, `StoneTypes`, `Business`,
`Shifts`, `Version`) unchanged from the (now-deduplicated) original.

**Affected modules:** Quarry ERP screens referencing `QuarryConstants`.

**Milestone introduced:** Unknown — confirmed present in every
snapshot searched, M173 through M373 (see RP-002 search note; same
exhaustive search covered this file).

**Milestone repaired:** M373 (session work), recorded M374.

**Reusable pattern:** *Before assuming a syntax error is a typo, check
whether the file contains its own content twice* — `grep -n "^const "`
or similar for repeated top-level declarations is a fast tell.

---

## RP-002 — `core/ai/cozy-ai-memory.js`, `core/connectivity/compression.js`, `core/connectivity/bandwidth.js` — incomplete source (missing header/class/constructor)

**Problem:** All 3 files fail `node --check` at their first
surviving line — each opens mid-method-body with no enclosing class.

**Root cause:** Not a syntax typo. Exhaustive search (see below)
confirms these files have been missing their header, class
declaration, and constructor in **every available snapshot**,
including the earliest one supplied (M173). This is the file's
earliest known state, not a regression from a prior complete version.

**Search performed (exhaustive, per Rule 56/57 precondition):**
- `_archive/` (Layer3 workspace) — not found
- Byte-for-byte duplicate-path search across the whole tree — not found
- `CozyOS-main-M372-Layer2.zip` — **byte-identical MD5** to Layer3 (not an earlier complete version, a repackaging of the same state)
- 12 historical milestone packages, M173 → M373 — **byte-identical MD5 across all of them** for all 3 files
- Cross-reference search for symbols referenced inside the files (`codecIdentifier`, `ESTIMATED_SAVINGS_RATIO`, `_immutableHeaderKeys`, `Categories`, `Importance`, `Profiles`) — none defined anywhere else in the repo

**Repair:** Reconstructed only the missing structural scaffolding
(header comment, class declaration, constructor, minimal state
required for the surviving methods to run) per the 7-phase
reconstruction protocol. Every surviving line of original logic was
preserved unchanged and unmoved. Class names recovered where possible
from actual call sites (`BinaryCompressor` from `sync.js`'s
`import`/`new`); inferred from internal log tags where no call site
exists (`BandwidthShaper`, from `cozy-ai-memory.js`'s own tail
(`CozyAIBusinessMemory`) is a direct recovery, not an inference).

**Confidence:** Partial, by file:
- `cozy-ai-memory.js`: Medium-High — class name and constructor arg directly recovered; only enum *values* (Categories/Importance) are inferred (empty).
- `compression.js`: Medium — class name, export style, and constructor call shape directly recovered from `sync.js`; the Branch-1 guard condition and `codecIdentifier`/`ESTIMATED_SAVINGS_RATIO` values are inferred.
- `bandwidth.js`: **Lowest** — no external call site exists anywhere in the repo; class name is inferred from an internal log string, not confirmed usage. `_immutableHeaderKeys` is inferred **empty**, which is a real functional gap (see Engineering Review flag below), not just a placeholder.

**Regression result:** `node --check` → PASS on all 3. Runtime smoke
tests → each class instantiates and every public method was called
with minimal safe input and produced no uncaught exception (full
output recorded in session; not reproduced here to avoid duplicating
the transcript — see M374 handoff for the verification log location
if this file is split out later).

Full-repo sweep after all 4 repairs: `find . -name "*.js" | xargs node --check` → **zero failures**.

**Compatibility:** Structural only — public method signatures
preserved as written in the surviving code. **Not** verified compatible
with any caller's assumptions about `Profiles` string values,
`_immutableHeaderKeys` contents, `Categories`/`Importance` taxonomies,
or `codecIdentifier`, because those were never recoverable. Treat as
open until a human with access to the original source (if it exists
outside this repository) confirms or replaces the inferred values.

**Engineering Review Required — flagged, not resolved:**
`bandwidth.js`'s `_immutableHeaderKeys = []` means **no fields are
currently protected from CRITICAL_LOW shedding**. This was a
deliberate honest default (empty, not a guessed list) rather than
fabricating plausible-sounding key names, but it is a real behavioral
gap if this module reaches production on a constrained connection
before a human supplies the real list.

**Milestone introduced:** Unknown — pre-dates M173, the earliest
snapshot available.

**Milestone repaired:** M373 (session work), recorded M374.

**Reusable pattern:** *When 12 independent-looking milestone packages
share an identical MD5 for the same file, they are not independent
evidence* — check hashes before treating "found in an earlier
milestone" as confirmation of a complete source.

---

## RP-003 — `core/modules/identity/identity-engine.js` — password-bypass via unauthenticated OTP completion

**Problem:** `completeLoginWithOtp(pendingUserId, code)` accepted a raw userId, no password re-check.
**Repair:** Signed, random, single-use challenge token minted only after real password verification.
**Verification:** Node, isolated process. Bypass with raw userId → rejected. Legit flow → session created. Token reuse → rejected.
**Milestone repaired:** M373.1

---

## RP-004 — `login.html`, `index.html` — `identity-storage.js`/`otp-provider.js` never loaded

**Problem:** MFA gate and Remember Me silently inert on real entry pages; Node tests masked this by manually loading deps.
**Repair:** Added missing script tags, correct load order (`identity-storage.js` before `identity-engine.js`).
**Verification:** Re-ran MFA test using scripts extracted from real HTML in real order. Gate activates.
**Milestone repaired:** M374

---

## RP-005 — `core/security/otp-provider.js` — secrets unencrypted at rest, no rate limit, no replay protection

**Problem:** Plaintext secrets in IndexedDB; unlimited OTP attempts; codes reusable within window.
**Repair:** AES-256-GCM device-bound encryption; 5/30s, 10/5min lockout; last-used-counter replay check; constant-time comparison.
**Verification:** Node, 11-case suite. Encryption confirmed absent from persisted record. Lockout fires at attempt 5. Replay rejected.
**Milestone repaired:** M373.1

---

## RP-006 — `core/identity/developer-profile.js` — stale header, wrong subsystem named

**Problem:** Header comment named `core/modules/identity/` as `(CozyIdentity)`. Per DC-002, `cozy-identity.js` is archived/superseded, not live.
**Root cause:** Documentation drift — comment never updated after DC-002's archive decision.
**Repair:** Corrected to name the real, live subsystem (IdentityEngine, AuthCoordinator, IdentityStorage). Comment-only change.
**Evidence:** `diff` confirms comment-only change. SHA-256 (post-repair): `38a12afb6969e1614c258529165448ac66d54a23c2e84b749e14d66c90f89eaa`
**Verification:** `node --check` PASS. Runtime smoke test: `window.CozyOS._DeveloperIdentityParts.profile` resolves identically before/after.
**Confidence:** High — root cause and correct target both directly confirmed in DC-002.
**Regression risk:** None — comment-only, no code path touched.
**Milestone repaired:** M379
**Related:** `knowledge/missing-dependency-registry.md` MD-003 (closed by this repair), `knowledge/duplicate-consolidation-registry.md` DC-002

---

## RP-007 — `core/modules/developer/developer-hub.css` — doubled `core/core/` `@import` paths

**Problem:** all 5 `@import` lines resolved to `core/core/ui/...` / `core/core/shell/...` (2 `../` from `core/modules/developer/` reaches `core/`, then the lines redundantly prepended `core/` again) — 404s, cascading into every theme being rejected on `dashboard.html`.
**Root cause:** path written as if the file lived one directory shallower than it does.
**Repair:** corrected all 5 `@import url(...)` paths to `../../ui/...` / `../../shell/...`.
**Verification:** real-Chromium (Playwright) re-run, 3 rounds — 0 requests to any `core/core/...` path, 0 "Theme ... rejected" warnings on `dashboard.html`.
**Confidence:** High — path arithmetic directly confirmed from the file's own location plus a CDP request-initiator trace.
**Regression risk:** None — CSS-only, no logic touched.
**Milestone repaired:** M387.5 (Finding 1)

---

## RP-008 — `core/modules/speech/cozy-speech.js`, `core/modules/vision/cozy-vision.js` — colliding global `SESSION_STATE`

**Problem:** both files declare an identical bare top-level `const SESSION_STATE`, loaded as 2 classic `<script>` tags on the same page — `SyntaxError: Identifier 'SESSION_STATE' has already been declared`, aborting whichever file loaded second.
**Root cause:** neither file was IIFE-wrapped, unlike the documented near-universal convention ("IIFE modules register onto a single `window.CozyOS` global namespace" — `02-architecture-rules.md`).
**Repair:** wrapped each file's entire body in `(function () { ... })();`.
**Verification:** real-Chromium re-run, 3 rounds — 0 "already been declared" errors; confirmed both engines still register their public globals afterward.
**Confidence:** High — collision directly reproduced and both declarations confirmed identical by source inspection.
**Regression risk:** Low — no public API changed, only where internal declarations live; confirmed via `window.CozyOS` enumeration before/after.
**Milestone repaired:** M387.5 (Finding 2)

---

## RP-009 — `core/pluginManager.js` — `SEMVER_RE` rejects real semver pre-release versions

**Problem:** `SEMVER_RE = /^\d+\.\d+\.\d+$/` rejected the `X.Y.Z-ENTERPRISE` pre-release convention used by 17 plugin files, throwing `[PluginManager] Invalid manifest.version` for all of them.
**Root cause:** regex was stricter than real semver (which allows an optional `-prerelease` suffix).
**Repair:** widened `SEMVER_RE` to `/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/`; updated `_compareVersions()` to strip everything from `-` onward before splitting/`Number()`-ing parts, so the fix doesn't reintroduce the exact `NaN`-comparison bug `SEMVER_RE`'s strictness (`[R-2]`) existed to prevent.
**Verification:** real-Chromium re-run — 0 "Invalid manifest.version" errors.
**Confidence:** High — regex and comparison-function interaction directly traced and both fixed together.
**Regression risk:** Low — comparison behavior for bare `X.Y.Z` versions (no suffix) is byte-identical to before, since `split("-")[0]` is a no-op when there's no `-`.
**Milestone repaired:** M387.5 (Finding 3). **Follow-on discovery, not a regression:** fixing this let execution reach `register()`'s next validation step for the same 17 plugins, surfacing RP-010/MD-related Finding 6 below.

---

## RP-010 — `core/pluginManager.js` + 15 `core/plugins/*.js` files — `register()` handler-type mismatch

**Problem:** `register(manifest, executionHandler)` requires a callable `(query, kernelContext)` intent handler (confirmed from its real use inside `execute()`), but 15 plugin files (ShopOS ×10, MpesaOS ×4, ShopOS-search) passed their real engine class instance directly — `[PluginManager] executionHandler must be a function, got 'object'.` ×16 occurrences (some files register more than one manifest). Masked entirely by RP-009's predecessor bug until that was fixed.
**Root cause:** these 15 files conflated the plugin's real engine instance (correctly stored separately, e.g. `window.CozyOS.ShopCore`) with the distinct, simpler "intent handler" function `register()` actually requires — a pattern 4 other files in the same directory (`pharmacyOS.js`, `hospitalOS.js`, both `mpesaOS*.js` "engine" files) already implement correctly via a small named `xxxExecutionCore(query, kernelContext)` function.
**Repair:** added one shared `PluginManager.createMinimalIntentHandler(engineInstance, pluginLabel)` helper (Rule 6 — compose once, not 15 copies) that wraps any engine instance in a valid, honest, minimal intent handler — it discloses plainly that it's minimal (no fabricated business-logic routing) and surfaces the engine's own real, already-existing `getDiagnosticsReport()`. Updated all 15 call sites to pass `PluginManager.createMinimalIntentHandler(engineInstance, "<manifest name>")` instead of `engineInstance` directly.
**Verification:** `node --check` clean on all 16 touched files; real-Chromium re-run — 0 "executionHandler must be a function" errors; confirmed all 15 plugins now mount (`[PluginManager] Mounted: ... `) and their real engine instances (`window.CozyOS.ShopCore`, etc.) are unchanged and still directly callable exactly as before.
**Confidence:** High — root cause confirmed against `register()`'s own source and one concrete call site; fix pattern matches the 4 already-working files in the same directory.
**Regression risk:** Low — no engine class was modified; only the second argument passed to `register()` changed, and the engine instance itself is still registered under `window.CozyOS` exactly as before.
**Milestone repaired:** M387.5 (Finding 6)

---

## RP-011 — `index.html` — never linked the theme-token stylesheet

**Problem:** `index.html` linked only `cozy-animations.css`, `launch-sequence.css`, and `cozy-living.css` — never any file defining the `--cozy-*` tokens `CozyTheme` validates — so every theme was rejected on this page (a distinct root cause from RP-007/Finding 1, which was `dashboard.html`-only).
**Root cause:** the `<link>` tag was simply never added when this page was built, unlike `dashboard.html` (which gets tokens indirectly via `developer-hub.css`'s `@import` chain) and `core/shell/cozy-shell.html` (which links `core/ui/cozy-tokens.css` directly).
**Repair:** confirmed authoritative token source per Rule 51 before touching anything — grepped `core/ui/cozy-tokens.css` (defines all 8 `REQUIRED_TOKENS` for all 10 themes), `core/shell/cozy-tokens.css` (same 8 tokens but only 9 themes — a stale duplicate), and `core/shell/cozy-theme.css` (defines none of these tokens at all). Added `<link rel="stylesheet" href="core/ui/cozy-tokens.css">` to `index.html`.
**Verification:** real-Chromium re-run — 0 "Theme ... rejected" warnings on `index.html`.
**Confidence:** High — token presence directly grepped per candidate file before choosing.
**Regression risk:** None — additive `<link>` only, no existing tag removed or changed.
**Milestone repaired:** M387.5 (Finding 7)

---

## RP-012 — `core/bridge/engine-bridge-bootstrap.js` — Node-only `playback-engine.js` wired into browser bridge

**Problem:** `core/engines/playback/playback-engine.js` imports `fs` and reads recorded session frames off real disk (`fs.existsSync`/`readFileSync`/`readdirSync`/`statSync`) — a genuine Node.js-only module — but was registered in this browser-only dashboard bootstrap alongside 4 real browser engines (camera, audio, scene, media), producing `Failed to resolve module specifier "fs"` on every dashboard load.
**Root cause:** apparent copy-paste of the registration pattern for a file that was never browser-portable to begin with.
**Repair:** removed the `'playback'` entry from `REGISTRATIONS` in `engine-bridge-bootstrap.js` (did not touch `playback-engine.js` itself — porting it to a browser storage API would be new-feature-scale work, out of scope for a verification pass). Confirmed via grep that the only other reference to `PlaybackEngine` (`live-video-capture-engine.js`) already lists it in an honest `NOT_CONNECTED_ENGINES` disclosure array, so nothing else expected this global to exist.
**Verification:** real-Chromium re-run — 0 `"fs"` resolution errors; `[EngineBridge] boot finished with N engine(s) unavailable` no longer lists `playback`.
**Confidence:** High — Node-only nature of the file confirmed directly (imports `fs`, reads real disk paths), and the only other consumer already treats it as not-connected.
**Regression risk:** None — the file itself is untouched; only removed a registration that could never have succeeded in a browser.
**Milestone repaired:** M387.5 (Finding 9)

---

## RP-013 — `core/bridge/engine-bridge-bootstrap.js`, `core/engines/media/live-capture-engine.js`, `core/modules/hearing/cozy-hearing.js` — `AA-004` closed: `window.CozyOS.AudioEngine` naming collision

**Problem:** `core/engines/audio/cozy-audio-engine.js` and the ES-module bridge's `audio-manager.js` both claimed `window.CozyOS.AudioEngine` — `[EngineBridge] "audio" unavailable: ... already occupied by a different object`, present in every browser round since M387.5 Round 2.
**Root cause:** confirmed by reading every real call site against both engines' actual APIs — `cozy-hearing.js` (4 call sites) needs `registerInputAdapter`/`startListening`/`stopListening`, which only `cozy-audio-engine.js` implements; `live-capture-engine.js` (1 call site) plus the bridge's own `wireBrowserAudioProvider()` need `registerProvider`, which only `audio-manager.js` implements. Two genuinely different, both-real, both-needed engines wanted the same name — `cozy-audio-engine.js`'s own pre-existing header already correctly documented this distinction; the bridge's later naming choice was the actual defect.
**Repair:** renamed the bridge's `audio-manager.js` target from `AudioEngine` to `AudioManager` (matching the file's own self-declared identity) in `core/bridge/engine-bridge-bootstrap.js` (registration entry, `wireBrowserAudioProvider()`, and header comments); updated `live-capture-engine.js`'s 1 real call site and its loose comment references; corrected `cozy-hearing.js`'s outdated header comment (previously misattributed its dependency to `audio-manager.js`); left `cozy-audio-engine.js` completely untouched (already correct); kept the Node-side unit test (`engine-bridge.test.js`) in sync.
**Verification:** `node --check` (plus `--input-type=module` for the ES-module bridge file) PASS on all 4 touched files. Real-Chromium re-run: 0 "already occupied" warnings; `window.CozyOS.AudioEngine` and `window.CozyOS.AudioManager` both present simultaneously (confirmed via global enumeration, 279 globals, up from 277). Regression: Living Engine chain (`LivingSecurityCoordinator` → `LivingDecisionEngine`) confirmed unchanged, no duplicates, no missing dependency.
**Follow-on discovery, not a regression:** fixing this let `wireBrowserAudioProvider()` execute for the first time (previously never reached, since the naming conflict made `"audio"`'s registration fail before reaching it) — which surfaced a separate, genuine missing dependency, `core/engines/audio/provider-browser.js`, confirmed absent repository-wide. Logged as `MD-005` rather than built (real feature-scale work, out of scope for this repair).
**Confidence:** High — root cause confirmed by direct method-call comparison against both engines' real, implemented APIs, not by preference or load order.
**Regression risk:** Low — `cozy-audio-engine.js` (the file `cozy-hearing.js` actually depends on) was not modified at all; only the bridge's own registration name and its 1 real consumer changed.
**Milestone repaired:** M387.5b (`AA-004`)

---

## RP-014 — `core/modules/identity/auth-coordinator.js` — premature auto-triggered `restoreSession()` wipes a valid "Remember Me" pointer on every real reload

**Status:** 🟢 Fixed (M387.5c)

**Discovered In:**
- Milestone: M387.5c (Verification Completion — Interactive Authentication Verification)
- Date: 2026-08-06
- Builder: current session

**Location:**
- File(s): `core/modules/identity/auth-coordinator.js` (defect); `index.html` (the correct, unaffected caller); `core/modules/identity/identity-engine.js` (the engine whose async completion is not waited for)
- Function(s): `AuthCoordinator`'s bottom-of-file auto-trigger (`tryRestore()`, calling `restoreSession()`); `IdentityEngine.restorePersistedUsers()`; `AuthCoordinator.restoreSession()`; `AuthCoordinator.restoreSessionForTrustedPointer()` fallback path (via `IdentityEngine`)
- Engine(s): Identity Engine, Auth Coordinator, Session

**Symptoms:**
A real, registered, logged-in user with "Remember Me" checked is signed out on the very next real browser reload of `index.html` — `AuthCoordinator.isAuthenticated()` returns `false` after reload, even though registration/login succeeded moments earlier with 0 console errors.

**Evidence:**
- Registration → auto-login → redirect to `index.html` confirmed working: `isAuthenticated() === true` immediately after.
- `localStorage['cozyos.authCoordinator.session']` confirmed present and correct immediately post-login (real `{source, sessionId, userId, since}` pointer).
- User confirmed genuinely persisted in IndexedDB (`cozyos-identity`, `users` store) before reload — read back directly via `indexedDB.open(...).transaction('users').getAll()`.
- Control test performed first, to rule out a test-harness artifact: plain `localStorage.setItem`/reload in this exact environment persists correctly (`before: "hello", after: "hello"`).
- After a real `page.reload()`: `localStorage` is empty; direct call to `AuthCoordinator.restoreSession()` returns `{"restored":false,"reason":"No persisted session pointer."}` — the pointer is gone, not merely rejected.
- **Definitive timeline, captured via a `Proxy` installed on `window.CozyOS` (before any page script ran) that logged every `window.CozyOS.*` assignment and wrapped `IdentityEngine.restorePersistedUsers`/`validateSession`/`restoreSessionForTrustedPointer` and `AuthCoordinator.restoreSession`:**
  ```
  +30ms  restorePersistedUsers() CALLED           (module-load auto-call, IdentityEngine.ready)
  +40ms  AuthCoordinator.restoreSession() CALLED   (auth-coordinator.js's own auto-trigger — NOT index.html's bootstrap)
  +40ms  validateSession(session_...) -> {"valid":false,"reason":"Session not found."}
  +40ms  restoreSessionForTrustedPointer(user_...) -> {"available":false,"reason":"No real user found with id \"user_...\" — pointer is stale."}
  +42ms  AuthCoordinator.restoreSession() RESOLVED {"restored":false,"reason":"Session not found."}   <- POINTER WIPED HERE
  +62ms  restorePersistedUsers() RESOLVED {"restored":1}    <- user genuinely available only NOW, 20ms too late
  +64ms  AuthCoordinator.restoreSession() CALLED   (index.html's own correctly-sequenced bootstrap call)
  +64ms  AuthCoordinator.restoreSession() RESOLVED {"restored":false,"reason":"No persisted session pointer."}   <- moot, already wiped
  ```
- Hashes/tests: no code changed yet for this finding, so no new SHA-256s; reproduction script preserved at `/home/claude/verify/interactive5.js` (session-local, not part of the repository).

**Investigation:**
- Checked: `#persistPointer`/`#readPointer` storage mechanism (plain `localStorage`/`sessionStorage`, `STORAGE_KEY`-based) — confirmed correctly implemented in isolation.
- Checked: `restoreSession()`'s own logic — confirmed internally correct *given its inputs*; the fallback-to-wipe branch (`if (!validation.valid) { this.#persistPointer(null); ... }`) is a reasonable design for a genuinely stale pointer, but has no way to distinguish "genuinely stale" from "user data hasn't finished loading yet."
- Checked: whether this was a Playwright/test-harness artifact — ruled out via the plain-`localStorage` control test above.
- Checked: `index.html`'s own `resolveAuthState()` — confirmed it *does* correctly `await identity.restorePersistedUsers()` before calling `auth.restoreSession()`; this caller is not the defect.
- Found: a second, separate, unguarded caller — `auth-coordinator.js`'s own bottom-of-file `tryRestore()` — which polls only for `window.CozyOS.IdentityEngine`/`window.CozyOS.Session` to *exist* (both are assigned synchronously, near-instantly on script load) and then calls `restoreSession()` immediately, with no gate on `IdentityEngine.restorePersistedUsers()` (or its `.ready` promise) having actually finished.
- Remaining unknown: whether this defect also affects `login.html` (which the trace didn't directly re-test) or only pages where `auth-coordinator.js` loads standalone; whether other real callers of `restoreSession()` (`login-experience-orchestrator.js`, `cozy-login-gate.js`) have their own timing assumptions that would also need re-checking after a fix; whether the 15-attempt/200ms polling loop was ever intended to also wait on `IdentityEngine.ready` and simply omitted it, or never considered this case at all.

**Root Cause:**
**Confirmed.** `core/modules/identity/auth-coordinator.js`'s auto-trigger calls `restoreSession()` as soon as `window.CozyOS.IdentityEngine` and `window.CozyOS.Session` *exist* as objects — not once `IdentityEngine.restorePersistedUsers()` has actually finished repopulating `#users` from IndexedDB. On a real reload, `#users` is empty in that early window, so the trusted-pointer fallback reports the user "not found," and `restoreSession()`'s existing (otherwise reasonable) stale-pointer cleanup logic deletes a pointer that was genuinely valid — just checked too early. `index.html`'s own, separately-written, correctly-sequenced call to `restoreSession()` never gets a chance to succeed, because the pointer is already gone by the time it runs.

**Impact:**
- "Remember Me" and session restore across a real reload do not work for any user, on any page that loads `auth-coordinator.js`, today. This is a core-functionality break for the M381–M387 Living Security chain's very premise (device/session/trust continuity), even though every individual engine's own logic is otherwise correctly implemented.
- Blocks the remaining M387.5c interactive-verification items that assume a restored session: OTP login on a restored session, trusted-device recognition after reload, and "device recognition after reload" specifically — all would fail the same way, for this same reason, not their own separate defects.
- Blocks M387.5's Rule 63 "Browser/device verification passes" condition until repaired and re-verified.

**Dependencies:**
- `core/modules/identity/auth-coordinator.js` (the fix)
- `core/modules/identity/identity-engine.js` (`.ready` promise / `restorePersistedUsers()` — the async completion signal to actually wait for)
- `index.html`, `login.html`, `dashboard.html` (all load `auth-coordinator.js`; all are affected consumers, none are the defect)
- `core/modules/session/cozy-session-service.js` (`Session` — one of the two objects the auto-trigger currently gates on)

**Repair Plan (drafted at Compose/Plan stage — see "as implemented" below for what actually happened):**
1. Change the auto-trigger's gate from "does `IdentityEngine`/`Session` exist" to "has `IdentityEngine.ready` (or an equivalent explicit promise) resolved" — e.g. `if (identity && identity.ready) { await identity.ready; }` before calling `restoreSession()`, in addition to (not instead of) the existing existence check, since `Session` still needs to exist too.
2. Keep the existing 200ms/15-attempt polling as the fallback for the "objects don't exist yet at all" case — only add the `.ready` await once they do exist.
3. Re-check the same fix doesn't reintroduce a hang if `.ready` is ever missing/undefined on `IdentityEngine` (defensive `typeof identity.ready?.then === "function"` guard, matching this codebase's established honest-fallback style).
4. Do not touch `index.html`'s own `resolveAuthState()` — it's already correct and should be left alone (Rule 5).
5. Re-check `login-experience-orchestrator.js` and `cozy-login-gate.js`'s own `restoreSession()` calls against the same timing assumption before closing this finding, since Investigation flagged them as unconfirmed.

**Verification Plan (drafted at Compose/Plan stage — see "as executed" below for real results):**
1. Syntax: `node --check` on `auth-coordinator.js`.
2. Browser: re-run the exact `Proxy`-based tracer reproduction above; confirm the corrected timeline shows `restorePersistedUsers() RESOLVED` before any `restoreSession() CALLED`, and that the pointer survives.
3. Functional: repeat the full register → reload flow; confirm `isAuthenticated()` is `true` after reload, not just that the pointer string is unchanged.
4. Regression: re-run the existing full Playwright harness (`index.html`/`login.html`/`dashboard.html`) to confirm 0 new console errors; confirm `login-experience-orchestrator.js`/`cozy-login-gate.js`'s own `restoreSession()` calls still behave correctly once the gate changes.
5. Integration: confirm engine startup order and duplicate-registration scan are unaffected (this fix doesn't touch registration, only call timing).

**Regression Risk (assessed at Compose/Plan stage — see confirmed outcome below):**

**Repair Plan (as implemented):**
1. Changed the auto-trigger's gate: once `IdentityEngine`/`Session` exist (unchanged 200ms/15-attempt polling for that), also `await identity.ready` — the exact same promise `IdentityEngine` itself already exposes at module load (`IdentityEngine.ready = IdentityEngine.restorePersistedUsers()`) — before calling `restoreSession()`. No new signal invented; reused the real, already-existing one.
2. Kept the existing polling as the fallback for "objects don't exist yet at all."
3. Guarded with `identity.ready && typeof identity.ready.then === "function"` so a future `IdentityEngine` without a `.ready` promise still falls through safely (fails closed, doesn't hang).
4. Did not touch `index.html`'s own `resolveAuthState()` — confirmed still correct, left alone.
5. Re-checked `login-experience-orchestrator.js`'s and `cozy-login-gate.js`'s own `restoreSession()` calls — both already `await` their own dependencies before calling it (confirmed by re-reading), so neither depended on the old race; unaffected by this fix.

**Verification Plan (as executed):**
1. **Syntax:** `node --check core/modules/identity/auth-coordinator.js` — PASS.
2. **Browser (exact reproduction re-run):** re-ran the identical `Proxy`-based tracer from the Compose stage. New timeline: `restorePersistedUsers() RESOLVED {"restored":1}` at +36ms, `AuthCoordinator.restoreSession() CALLED` at +50ms (now correctly *after*), `restoreSessionForTrustedPointer(...)` → `{"available":true,...}`, `validateSession(...)` → `{"valid":true}`, `restoreSession() RESOLVED {"restored":true,"source":"identity","userId":"..."}`.
3. **Functional:** repeated the full register → reload flow independently (2 separate runs, 2 separate usernames): `isAuthenticated()` is `true` immediately after login AND after a real reload, in both runs.
4. **Regression:** full 3-page Playwright harness re-run — `index.html`/`login.html` 0 errors/0 failed requests; `dashboard.html` unchanged (1 environment-limited error, 5 documented failed requests — `MD-004`/`MD-005`/Firebase, none new). Engine chain intact (279 globals, no duplicates). Fresh unauthenticated `login.html` load re-checked separately: 0 errors, `isAuthenticated()` correctly `false` (no false positive introduced).
5. **Integration:** confirmed `login-experience-orchestrator.js`/`cozy-login-gate.js` unaffected (per Repair Plan step 5).

**Regression Risk:** Realized risk was low, as predicted — the two other real `restoreSession()` callers already awaited their own dependencies and needed no change.

**Outcome:** 🟢 **Fixed.** All four Verify checks (syntax, browser, functional, regression) passed. Confidence: High — root cause was confirmed by direct runtime evidence before the fix, and the fix's effect was confirmed by re-running the exact same tracer, not merely inferred from the absence of the original symptom.

**History:** `RELEASES.md` (M387.5c entries), `docs/builder/knowledge/repair-queue.md` (`RP-014` → Fixed), `docs/history/M387.5.md` (Round 7). SHA-256 of fixed file: `1b3d8ff455fdd36a004187251516d9d7a0e7ec4b24bf657ad2e7f05b653aa465`.

---

## RP-015 — `restoreSession()`'s trusted-pointer fallback always re-persists with `rememberMe=true`, silently upgrading "Remember Me: off" sessions

**Status:** 🟢 Fixed (M387.5c)

**Discovered In:** Milestone M387.5c, Remember-Me-OFF interactive test.

**Symptoms:** logging in with "Remember Me" unchecked still leaves a persistent `localStorage` pointer after navigating to `index.html` — session survives even after the browser context is effectively restarted, contrary to the unchecked box.

**Evidence:** login with box unchecked confirmed (`checked === false` at submit) → pointer correctly written to `sessionStorage` only at that moment → but after the post-login navigation to `index.html`, `localStorage['cozyos.authCoordinator.session']` is populated anyway.

**Root Cause (confirmed):** `restoreSession()`'s trusted-pointer fallback branch (fires on every fresh page load/navigation, since `IdentityEngine`'s in-memory `#sessions` never survives one) calls `this.#persistPointer({...})` with no second argument — defaulting to `rememberMe = true` — regardless of which storage the original pointer actually came from.

**Repair:** `#readPointer()` now also returns which storage matched (`_rememberMe: true` for `localStorage`, `false` for `sessionStorage`); `restoreSession()`'s fallback re-persist now passes that through instead of the implicit default.

**Verification:** `node --check` PASS. Real-browser re-run: Remember-Me-OFF login → pointer in `sessionStorage` only after landing on `index.html`, `localStorage` empty. Remember-Me-ON path re-confirmed unaffected. Full regression: 0 new errors.

**Regression Risk:** Low — only changes which storage a re-persist targets, not whether restoration succeeds.

**History:** `docs/history/M387.5.md` Round 8; `docs/builder/knowledge/repair-queue.md`.

---

## RP-025-A — On-Device Conversational Provider + Explicit Provider Activation

**Status:** 🟢 Fixed / MODEL_NOT_INSTALLED-or-NOT_READY by design (honest, environment-dependent — see Outcome)

**Discovered In:** Post-M388 free-account repair session (single-path repair prompt).

**Symptoms:** `core/living/cozy-living-ai.js`'s `"on-device"` provider slot was registered as a permanent, honest stub (`makeUnconfiguredProvider("on-device model")`) that always reports "not configured yet" — no real on-device backend existed for it to ever report anything else, matching the live UI's `NO_CONVERSATIONAL_ENGINE_FALLBACK` message when a user talks to CozyOS Assistant before any real provider is active.

**Owner:** New file — `core/modules/intelligence/providers/on-device-conversational-provider.js`. No existing file's ownership changed.

**Root Cause:** Not a defect — a genuinely unbuilt capability. `AIProviderRegistry`'s `"on-device"` slot was deliberately left as an honest placeholder (per `cozy-living-ai.js`'s own header comment) until a real on-device backend was implemented.

**Repair:** Implemented a real provider composing the browser's own on-device Prompt API (`LanguageModel` global, or the earlier `window.ai.languageModel` origin-trial shape) when present, satisfying `AIProviderRegistry`'s `think(text, options) -> {success, result|reason}` contract and `resolveConversationalReply()`'s `.text` field. Live-checked, honestly classified state: `NOT_READY` (no API in this browser, or availability check fails), `MODEL_NOT_INSTALLED` (API present, model not yet downloaded), `READY`/`ONLINE` (API present, model available, real session created). Registered via `LivingAI.registerProvider("on-device", ...)` — the existing public extension point, `cozy-living-ai.js` itself not modified — and, when present, into `ProviderManager.register()` for visibility/health. Never calls `setActiveProvider()`; that remains the sole explicit activation choke point, unchanged. `CognitiveCoordinator`, `cozy-intelligence-provider.js`, and `core/config.js` confirmed byte-identical to the pristine baseline after this repair (independent hash check).

**Files Changed:**
- `core/modules/intelligence/providers/on-device-conversational-provider.js` (new)
- `core/modules/intelligence/providers/tests/on-device-conversational-provider.test.js` (new)
- `index.html` (one additive `<script>` tag after `cozy-living-ai.js`)
- `dashboard.html` (one additive `<script>` tag after `provider-manager.js`)

**Verification:** `node --check` PASS on the new file. 8/8 new targeted tests pass (NOT_READY/MODEL_NOT_INSTALLED/READY classification, no-fabrication-on-empty-response, no-auto-activation, ProviderManager-present and ProviderManager-absent paths both handled without throwing). RP-024 regression suite (`core/living/tests/cozy-living-assistant-reply.test.js`) re-run: 10/10 pass, zero regressions. `diff -rq` against the pristine baseline confirms only the four files above changed — no other file touched.

**Regression Risk:** Low — purely additive registration into an already-designed extension point; no existing provider, registry method, or UI behavior changed. In any browser without the Prompt API (the large majority as of this session), the provider honestly reports `NOT_READY` and behavior is unchanged from before this repair (same fallback message).

**Dependencies:** Real on-device model availability is entirely browser-dependent and cannot be verified from this repository/session (no browser runtime available in this environment to observe `LanguageModel.availability()`'s real return value). Honestly recorded as `NOT_READY`/`MODEL_NOT_INSTALLED` by design until run in a browser that actually exposes the API — this is not a gap in the repair, it is the repair's own honesty contract.

**History:** `docs/builder/knowledge/repair-queue.md` (RP-025-A entry, this pass).

---

## RP-026 — Rule-Based Reply Composer (real conversational answer for the Living Assistant)

**Status:** 🟢 Fixed — active

**Discovered In:** Same live-deployment symptom as RP-025-A (`chalzy2.github.io` screenshots) — greeting the CozyOS Assistant ("Good morning") returned `NO_CONVERSATIONAL_ENGINE_FALLBACK` ("I heard you, but CozyOS's real conversational response engine isn't connected or available yet...").

**Sequencing note (Rule 69 — Repository Authority, disclosed):** `docs/builder/knowledge/repair-history-registry.md`'s own prior "NEXT UNLOCK" pointed at "RP-025-A Live Verification" (an on-device-browser check) as the next authorized repair, ahead of RP-025-B. This repair (RP-026) was explicitly directed instead by the repository owner, as an independent second path — it does not perform RP-025-A Live Verification, does not touch RP-025-B's own scope (a WASM/local-runtime fallback for the on-device provider), and does not modify `on-device-conversational-provider.js`. Both remain open, unchanged, for a future session.

**Owner:** New file — `core/modules/intelligence/providers/rule-based-conversational-provider.js`. No existing file's ownership changed.

**Root Cause:** Confirmed by direct source read (not assumed): `CognitiveCoordinator.run()`'s real return shape (`{interpretation, thinking, reasoning, intelligence, recalledMemories, policyResult, diagnostics}`) has no `.text`/`.reply`/`.answer` field anywhere on it — the same gap RP-024 correctly stopped papering over. RP-025-A's real fix only applies where a browser exposes an on-device language-model API (confirmed: none do in this deployment). No second, independent real-answer path existed until this repair.

**Repair:** Single path, rule-based, no LLM/API/backend, per the repository owner's explicit spec. New provider registers into `LivingAI`'s existing `registerProvider()` extension point under the name `"rule-based-conversational"` (a new, additive slot name — `AIProviderRegistry.register()` confirmed by direct read to accept any name, not restricted to the four previously-reserved future slots). `think(text, options)` first calls `CognitiveCoordinator.run()` itself — the same real entry point `reasoningPipelineProvider` already uses — so Memory recall/save and Policy evaluation still genuinely execute (their real diagnostics are carried on the result, unread by the reply logic); a missing or throwing coordinator never blocks the reply. A pure, deterministic `classifyIntent()` then matches the raw input text against a small, disclosed intent set (`greeting-morning`/`greeting-afternoon`/`greeting-evening`/`greeting-generic`, `thanks`, `identity`, `help`) and `composeReply()` returns one fixed, honest sentence per intent — including an equally honest `"unsupported"` reply for anything else, never the pipeline's evidence/insights/diagnostics/isReal flags. Registered, when present, with `ProviderManager` (always-`ONLINE` health — no external runtime to fail). Then, as one separate, disclosed step — never a side effect of `registerProvider()` — this file calls the existing `LivingAI.setActiveProvider("rule-based-conversational")` choke point, making it the Assistant's active provider. `resolveConversationalReply()`, `CognitiveCoordinator`, `cozy-intelligence-provider.js`, `core/config.js`, and `on-device-conversational-provider.js` all confirmed byte-identical to the RP-025-A baseline after this repair (independent `diff -rq`).

**Files Changed:**
- `core/modules/intelligence/providers/rule-based-conversational-provider.js` (new)
- `core/modules/intelligence/providers/tests/rule-based-conversational-provider.test.js` (new)
- `index.html` (one additive `<script>` tag, immediately after the RP-025-A on-device provider's own tag)
- `dashboard.html` (one additive `<script>` tag, same placement)

**Verification:** `node --check` PASS on both new files (and clean across all 529 JS files in the repository, full sweep). 14/14 new targeted tests pass: supported intents (`Hello`, `Good morning`, `Can you help?`) produce genuine, defined `.text`; reply text never contains pipeline evidence/diagnostic strings; unsupported input produces its own honest "not supported yet" text (never the generic `NO_CONVERSATIONAL_ENGINE_FALLBACK`); `resolveConversationalReply()` (the real, unmodified RP-024 selector) correctly renders this provider's `.text`; registration and activation confirmed as two distinct, ordered calls (register strictly before activate) via call-order assertions on a fake `LivingAI`; activation confirmed never attempted when registration itself fails; `CognitiveCoordinator.run()` confirmed genuinely invoked (Memory/Policy still execute); a missing or throwing coordinator confirmed to never block the honest reply; `describe()` confirmed to never claim LLM/neural/machine-learning capability; `ProviderManager` integration confirmed optional (present and absent, both handled without throwing). RP-024 regression suite re-run: 10/10 pass, unchanged. RP-025-A regression suite re-run: 8/8 pass, unchanged. **32/32 total, zero regressions.** `diff -rq` against the RP-025-A baseline ZIP confirms only the four files above changed — no locked file touched.

**Regression Risk:** Low-medium — this is the first repair to change the Living Assistant's *active* provider away from `"reasoning-pipeline"` (previously the only real provider and, per `AIProviderRegistry`'s auto-activate-first-registered rule, the default). Confirmed by repository-wide grep before this repair: `core/living/cozy-living-assistant.js`'s `#send()`/`#sendImage()` are `CognitiveCoordinator`'s only two real callers anywhere in this repository — so no other subsystem depends on `LivingAI.think()` routing to `"reasoning-pipeline"` specifically, and this provider still calls `CognitiveCoordinator.run()` itself, so no real capability (Memory/Policy execution) is lost by the switch — only the (previously nonexistent) reply text changes.

**Dependencies:** None — pure local logic, no browser API, no network call, no credentials.

**History:** `docs/builder/knowledge/repair-queue.md` (RP-026 entry, this pass).

---

## RP-027 — CozyOS Conversational Knowledge + Multilingual Response Expansion

**Status:** 🟢 Implemented, tested, verified, packaged.

**Discovered In:** Owner-directed continuation of RP-026 — the rule-based provider's real intent coverage was limited to 7 conversational intents and one language (English), while the owner's actual usage/expectation spans CozyOS-identity questions, applications, registration, authentication, account status, and provider status, in 5 default languages plus 6 extended languages.

**Sequencing note (Rule 69 — Repository Authority, disclosed):** This repair ran across two Builder sessions: an implementation session (code + all new tests written and passing) followed by this finalization session (locked-file verification, documentation, repository/package integrity hashing, and packaging). Both sessions were the same single owner-directed path — no redesign occurred at the finalization boundary, per the owner's explicit "continue, do not redesign" instruction.

**Owner:** New files — `core/modules/intelligence/language/cozy-language-registry.js`, `core/modules/intelligence/language/cozy-language-templates.js`, `core/modules/intelligence/knowledge/cozy-knowledge-registry.js`. Extended (not replaced) file — `core/modules/intelligence/providers/rule-based-conversational-provider.js` (RP-026's own file; its `INTENT_RULES`/`composeReply()`/`think()`/`describe()` grew additively, its registration/activation architecture unchanged in logic).

**Root Cause:** Not a defect — a scope gap. RP-026 shipped a real, working, but narrow (7-intent, English-only) rule-based composer by design, with its own documented continuation point naming exactly this expansion as the next owner-directed step.

**Repair:** Three new, additive, standalone files, read defensively (`typeof`-checked, at call time not load time) by the existing provider file, so a page that hasn't loaded them still gets RP-026's original English-only 7-intent behavior, never a throw:
- `cozy-language-registry.js` — 5 default languages (en/sw/fr/ar/so, `AVAILABLE`) + 6 extended languages (luo/ki/kam/zu/lg/ig, `NOT_READY` — no verified templates exist for them yet, honestly disclosed rather than silently upgraded). `resolveLanguage({manual, requested, country})` implements manual > requested > country-suggestion > English precedence, always returns an `AVAILABLE` code, and reports `fallback:true`/`reason` whenever the resolved code differs from what was actually requested.
- `cozy-language-templates.js` — verified, committed response templates (never a live/uncontrolled translation call) for RP-026's original 7 intents plus RP-027's 13 new intents, across all 5 default languages. Evidence-backed intents use a fixed per-language sentence frame that only interpolates live data.
- `cozy-knowledge-registry.js` — `getFounderFact()` (via `DeveloperIdentity.answerWhoCreatedYou()`), `listApplicationsFact()` (via `ServiceRegistry.listApplications()`), `listProvidersFact()` (via `ProviderManager.healthReport()`), `activeProviderFact()` (via `LivingAI.getActiveProvider()`), and `accountStateVocabulary()` (a static, `PARTIALLY_VERIFIED` enumeration grounded in a repository-wide grep confirming `ACTIVE`/`PENDING` as real literal state strings). Every method returns an explicit evidence field (`VERIFIED`/`PARTIALLY_VERIFIED`/`NOT_FOUND`); a missing or throwing dependency always degrades to `NOT_FOUND`, never a fabricated fact.
- `rule-based-conversational-provider.js` — `INTENT_RULES` grew from 7 to 20 entries, most-specific-pattern-first (e.g. `what-is-cozyos-enterprise` and `founder` ordered ahead of the shorter, more generic `what-is-cozyos`/`identity` patterns they would otherwise be shadowed by). `composeReply(intent, lang)` resolves the language first, then either looks up a fixed template or (for `founder`/`list-apps`/`list-providers`) calls the matching `CozyKnowledge` fact-getter and selects the `:verified` or the honest `:not_found`/`:unavailable` template variant. `think()` now also returns `.language`, `.requestedLanguage`, and `.languageFallback` alongside `.text`/`.intent`.

**Files Changed:**
- `core/modules/intelligence/language/cozy-language-registry.js` (new)
- `core/modules/intelligence/language/cozy-language-templates.js` (new)
- `core/modules/intelligence/knowledge/cozy-knowledge-registry.js` (new)
- `core/modules/intelligence/providers/rule-based-conversational-provider.js` (extended)
- `core/modules/intelligence/language/tests/cozy-language-registry.test.js` (new)
- `core/modules/intelligence/knowledge/tests/cozy-knowledge-registry.test.js` (new)
- `core/modules/intelligence/providers/tests/rule-based-conversational-provider-rp027.test.js` (new — kept separate from RP-026's own 14-test file, which stays byte-for-byte the historical RP-026 artifact)
- `index.html` (three additive `<script>` tags, before the existing provider tag)
- `dashboard.html` (three additive `<script>` tags, same placement)

**Verification:** `node --check` clean on every new/modified JS file. Language registry: 15/15 (all 5 default languages `AVAILABLE`, all 6 extended `NOT_READY`; manual/requested/country precedence; honest fallback with disclosed reason for both a `NOT_READY` and an unrecognized code). Knowledge registry: 11/11 (VERIFIED when live evidence is genuinely present; honest `NOT_FOUND` when absent, empty, or throwing — never fabricated). RP-027 provider matrix: 66/66 (9 representative intents × 5 default languages = 45 correct-intent/correct-language/non-empty-text checks; RP-026/RP-024 regressions re-confirmed inside the full RP-027 stack; Fact Safety VERIFIED-vs-honest-fallback checks for `founder`/`list-apps`/`list-providers`; an unknown, out-of-scope question confirmed to produce the honest `unsupported` reply, never a fabricated answer; `account-status` with no live account context confirmed to produce the honest "can't see enough verified account information" reply; language selection — manual, country-suggested, and default-English — all confirmed; all 6 extended languages individually confirmed to report `languageFallback:true`, resolve to one of the 5 `AVAILABLE` defaults, and include an in-text fallback disclosure; a dedicated test confirms RP-027's additions never cause a second/extra `setActiveProvider()` call). RP-024 regression: 10/10, unchanged. RP-025-A regression: 8/8, unchanged. RP-026 regression: 14/14, unchanged (re-run standalone, as its own historical artifact, not just inside the RP-027 stack). **124/124 total, zero regressions.**

**Locked-file verification (this finalization pass):** No `diff -rq` baseline copy was available in this session's environment, so verification is: (a) `core/living/cozy-living-assistant.js`, `core/modules/cognitive/cognitive-coordinator.js`, `core/modules/intelligence/cozy-intelligence-provider.js`, and `core/config.js` were never targeted by any file-write tool call across either the implementation or finalization session, and (b) their SHA-256 was captured this pass as the record of that state going forward (see `HANDOFF.md`'s matching entry for the four values). **Path discrepancy, disclosed:** the finalize prompt named `core/living/cognitive-coordinator.js`; no file exists at that exact path — the real, only file matching "cognitive-coordinator" repository-wide is `core/modules/cognitive/cognitive-coordinator.js` (RP-024/RP-025-A/RP-026's own locked file of the same name), and that is the file whose hash was recorded. No unrelated files were modified this pass.

**Regression Risk:** Low — every new file is additive and defensively `typeof`-checked; the modified provider file's own RP-026 registration/activation mechanics are unchanged in logic (only `INTENT_RULES`/`composeReply()`/`think()`/`describe()` grew). The one behavior change with any regression surface — `think()`'s return object gaining `.language`/`.requestedLanguage`/`.languageFallback` fields — is additive to the existing `.text`/`.intent`/`.pipeline` fields, not a replacement of any of them.

**Dependencies:** `getFounderFact()`/`listApplicationsFact()`/`listProvidersFact()` depend on `DeveloperIdentity`/`ServiceRegistry`/`ProviderManager` being loaded on the given page — confirmed present on `dashboard.html`, confirmed absent on `index.html` (verified by direct grep, not assumed); on `index.html`, these three intents honestly return their `NOT_FOUND`/`unavailable` template variant, matching the disclosed, by-design behavior, not a bug. Live-browser confirmation of multilingual rendering (including Arabic RTL layout) was not performed this session — no browser/DOM runtime available in this environment, same disclosed limitation every prior pass has carried.

**Repository integrity hash (canonical method, per DI-005):** `cf6fb2e3b3688706bc7839bfe321ee21c556ddf135e51d42d4ed656eabe82358`

**Package:** `CozyOS-main-RP-027.zip` — SHA-256: `f9be60a712bcedb196652ce5c2da9045dfc7de184cbb71b0f5d6626fd5445937`

**History:** `docs/builder/knowledge/repair-queue.md` (RP-027 entry, this pass); `HANDOFF.md`'s matching entry (full detail, including the CONTINUATION POINT for extended-language template work).

---

## RP-028 — Luo Language Availability

**Status:** 🟡 Verified NOT_READY (correctly, honestly, deliberately left unchanged) — session complete, no fabrication.

**Discovered In:** Owner-directed single repair path, explicitly scoped to determine whether Luo (Dholuo) — one of RP-027's 6 extended languages — can be promoted to `AVAILABLE` under Rule 82, and to promote it only if it genuinely can.

**FIND:** Direct inspection of the shipped RP-027 registry/templates confirmed Luo is registered `NOT_READY` (`nativeName: "Dholuo"`) and that **zero** of the 23 template keys in `cozy-language-templates.js` carry a `luo` entry — no partial prior work exists to build on; this is a clean-slate verification question, not a completion of something started.

**VERIFY:** Real, findable dictionary/phrasebook sourcing exists for basic Dholuo greeting and thanks vocabulary (e.g. "Oyawore" = morning greeting, "Erokamano"/"Ero kamano" = thank you), but cross-checking multiple independent sources found genuine, unresolved disagreement even at this basic level — for example, whether "Misawa" functions as a general/all-purpose greeting or specifically an afternoon greeting, sources conflict. Critically, **zero authoritative sourcing exists anywhere found for CozyOS's technical intents** — provider status, `NOT_READY`/`ONLINE` state explanations, account states, registration/authentication flow, "what is CozyOS Enterprise," etc. Every real Dholuo-language resource located (university grammar guides, phrasebooks, dictionary sites) covers everyday/conversational vocabulary only; commercial Dholuo translation agencies exist but require paid human translators, not something verifiable from this repository/session. Producing CozyOS's ~20 technical sentences in Dholuo without a native speaker or authoritative technical-vocabulary source would mean inventing phrasing with no way to check it — exactly the fabrication Rule 82 exists to prevent. No browser/DOM runtime is available in this environment either, so even if templates existed, live runtime rendering could only be recorded as `NOT_TESTED_LIVE`, not observed.

**Conclusion — Rule 82 gate check, all 5 conditions:**
1. Real language resources — ⚠️ partial (basic vocabulary only, with source disagreement even there)
2. Templates committed for every intent — ❌ not possible this session without fabrication
3. No uncontrolled machine translation — N/A, no templates were written
4. Passing intent×language tests for the language's own content — ❌ N/A, no content exists to test
5. Observed runtime behavior — ❌ not possible (no browser/DOM runtime in this environment)

**Per the Critical Rule stated in this repair's own prompt: Luo cannot satisfy Rule 82 in this session. Luo remains `NOT_READY`. No Luo response template was added.**

**FIX:** None applied to `cozy-language-registry.js` or `cozy-language-templates.js` — both are byte-identical to the RP-027 baseline (confirmed by SHA-256 comparison this pass). The five default languages (en/sw/fr/ar/so) were not touched. No other extended language was promoted. The language-resolution architecture (`resolveLanguage()`, `composeReply()`, `think()`) required no change — RP-027 already built the correct honest-fallback behavior for exactly this situation; RP-028's job was to verify that behavior holds specifically for Luo, not to alter it.

**TEST:** New file `core/modules/intelligence/language/tests/rp-028-luo-availability.test.js` — 15 real, executed tests, all behavioral (none assert any Luo response text, since none exists): registry state re-confirmed `NOT_READY`/zero templates/`isAvailable('luo')===false`; `resolveLanguage({requested:'luo'})` and `resolveLanguage({manual:'luo'})` both honestly fall back with `fallback:true` and a disclosed reason (manual selection does not bypass `NOT_READY`); no country in the suggestion table maps to `luo`, including a direct check that Kenya/Tanzania/Uganda/South Sudan (real Luo-speaking regions) still resolve to an `AVAILABLE` language, never a fallback; six representative intents (`greeting-generic`, `identity`, `founder`, `list-apps`, `account-status`, `help`) each requested with `language:'luo'` produce a correct intent, non-empty text, `languageFallback:true`, and a resolved `AVAILABLE` language; an unknown/unsupported question requested in Luo never throws and correctly classifies as `unsupported`. **15/15 pass.** Full regression re-run: RP-024 (10/10), RP-025-A (8/8), RP-026 (14/14), RP-027 language registry (15/15), RP-027 knowledge registry (11/11), RP-027 provider matrix (66/66) — **139/139 total, zero regressions.**

**Files Changed:**
- `core/modules/intelligence/language/tests/rp-028-luo-availability.test.js` (new — the only code file this repair added)
- `HANDOFF.md`, `LATEST.md`, `docs/builder/knowledge/repair-queue.md`, this file (documentation)

**Locked-file / RP-027-baseline verification:** `core/living/cozy-living-assistant.js`, `core/modules/cognitive/cognitive-coordinator.js`, `core/modules/intelligence/cozy-intelligence-provider.js`, `core/config.js` confirmed byte-identical (unchanged hashes, matching RP-027's own recorded values). `cozy-language-registry.js`, `cozy-language-templates.js`, and `rule-based-conversational-provider.js` also confirmed byte-identical to their RP-027-shipped state — RP-028 added a test file only, touched zero existing source files.

**Regression Risk:** None — this repair added one new, additive test file and made no source-code change whatsoever.

**Dependencies:** A genuine future promotion of Luo to `AVAILABLE` needs a fluent Dholuo speaker or an authoritative bilingual technical-vocabulary source to review and supply the ~20 CozyOS-specific intent templates, plus (per Rule 82 condition 5) a browser/DOM runtime to confirm live rendering — neither is available in this repository/session.

**History:** `docs/builder/knowledge/repair-queue.md` (RP-028 entry, this pass); Rule 82 (`docs/builder/rules/27-language-availability-verification-rule.md`), applied as the gate this repair was tested against.

---

## RP-029-A — Document/Website/Community-Submission Knowledge Ingestion Pipeline

**Status:** 🟢 Fixed — closed for the scope actually delivered (text/document/website/community-submission ingestion only; no audio/video/speech/lip-reading capability implemented or claimed).

**Discovered In:** Owner-directed repair path, first phase of the broader "Community Language & Living Knowledge Engine" objective, explicitly scoped down to text/document knowledge ingestion after an ambiguity check on which sub-piece to build first.

**FIND:** Repository-wide search for "ingestion"/"DocumentLearning"/"WebsiteLearning" found no existing source → knowledge-candidate pipeline. `core/modules/intelligence/knowledge/cozy-knowledge-registry.js` (RP-027) answers questions about CozyOS itself from live module state — confirmed a different domain, not duplicated. `core/modules/research/cozy-research-engine.js` ingests code/engineering documents for Builder tooling — also confirmed a different domain. No PDF-text-extraction backend is registered anywhere on `window.CozyOS.CozyOCR` (grepped; absent).

**FIX:** Added `core/modules/intelligence/knowledge/cozy-knowledge-ingestion.js` (new, additive) implementing SOURCE → EXTRACTION → LANGUAGE ID → SEGMENTATION → PROVENANCE → CANDIDATE for TEXT/HTML/OCR_TEXT/DOCUMENT/COMMUNITY_SUBMISSION/EDUCATIONAL_MATERIAL/CHURCH_MATERIAL/BIBLE_OR_SCRIPTURAL_MATERIAL sources, `ingestWebsite()` (no network fetch performed by this module — caller supplies HTML), and `ingestCommunitySubmission()` + `confirmCandidate()` (independent-contributor confirmation counting; a repeated confirmation from the same contributor is rejected as `ALREADY_COUNTED`, never double-counted; 5 distinct confirmations move a candidate to `PARTIALLY_VERIFIED`, never straight to `VERIFIED`). Every candidate defaults to `visibility: "PRIVATE"`; only explicit `contributeToCommunity()`/`contributeToPublic()` calls raise it, and `PUBLIC` is unreachable without first passing through `COMMUNITY`. Language detection is a small, disclosed keyword-marker heuristic (en/sw/fr/ar/so) that degrades to `LANGUAGE_UNCERTAIN` below a 2-marker threshold rather than guessing, and cross-checks any declared/detected code against the real `CozyLanguageRegistry` (RP-027) when present — surfacing its real state (e.g. `NOT_READY` for Luo) rather than overriding it. `cozy-language-registry.js` itself was not touched (confirmed byte-identical before/after this pass).

**TEST:** New file `core/modules/intelligence/knowledge/tests/cozy-knowledge-ingestion.test.js` — 26 real, executed tests, all passing: source handling (TEXT/HTML/PDF-without-backend/PDF-with-registered-backend/malformed-empty/duplicate-detection), language identification (uncertain case, Kiswahili-marker detection, declared-vs-detected, registry cross-check), website ingestion (missing content, missing URL, real content), community submission + confirmation counting (zero-start, same-contributor rejection, 5-confirmation threshold), privacy/visibility gating (private-by-default, explicit community promotion, public-requires-community-first), query (filter, search), provenance (source identity/hash/timestamps/trust state), offline-safety, and module-registration hygiene. Full existing suite re-run this pass: RP-027/028 provider/knowledge/language-registry suites and every M388 Living Media Interpreter engine suite pass unchanged — confirmed by `grep` that no other file references `cozy-knowledge-ingestion`, so these results are not incidentally coupled to the new file. Three **pre-existing** failure groups were newly discovered during this full-suite run (not caused by this pass, not previously logged): `audio-manager.test.js` (15/15 failing), `engine-bridge.test.js` (1 failing), and six browser-DOM-dependent suites that crash outright under plain `node` — filed as `MD-025`/`MD-026`/`MD-027` in the Repair Queue this pass rather than silently left unrecorded.

**Files Changed:**
- `core/modules/intelligence/knowledge/cozy-knowledge-ingestion.js` (new)
- `core/modules/intelligence/knowledge/tests/cozy-knowledge-ingestion.test.js` (new)
- `HANDOFF.md`, `LATEST.md`, `docs/builder/knowledge/repair-queue.md`, `docs/builder/knowledge/module-inventory.csv`, `docs/builder/knowledge/module-inventory.json`, `RELEASES.md`, this file (documentation)

**Locked-file / prior-baseline verification:** `cozy-language-registry.js`, `cozy-language-templates.js`, `rule-based-conversational-provider.js`, `cozy-knowledge-registry.js` confirmed unmodified by this pass (this repair added new files only; it did not edit any existing source file).

**Regression Risk:** Low — two new, additive files; zero existing source files edited; full suite re-run confirms no regression attributable to this change.

**Dependencies / Continuation:** RP-029-B (Community Contribution + Validation UI/lifecycle), RP-029-C (Hearing Mode privacy/consent scaffolding), RP-029-D (audio/video/lip-analysis runtime integration — genuinely blocked pending a real signal-processing backend, not attempted), RP-029-E (African language-pack expansion, still gated by Rule 82) all remain open, exactly as scoped going in. `MD-025`/`MD-026`/`MD-027` (pre-existing, unrelated failures discovered incidentally) also remain open, assigned to a Future Builder.

**History:** `docs/builder/knowledge/repair-queue.md` (RP-029-A/MD-025/MD-026/MD-027 entries, this pass); `HANDOFF.md`'s matching entry.

## RP-029-B — Community Contribution + Knowledge Validation

**Status:** 🟢 Fixed — closed for the scope actually delivered (community review workflow, source-aware independent-confirmation checking, labeled confidence reporting, privacy/pseudonymization, Rule 82 read-only reporter, offline-sync data model only). No audio/video/speech/ML capability implemented or claimed. No language promoted.

**Discovered In:** Direct continuation of RP-029-A, per the RP-029-B repair prompt (`docs/builder/repair-prompts/RP-029-B-REPAIR-PROMPT.md` referenced by the owner). Baseline verified before any code was written: `71e7b2387069cb5f372775eec6c0b1b0d2f211f4a1a632c51aab787e65329370` (matches the delivered RP-029-A package hash exactly), `cozy-knowledge-ingestion.js` present with real `ingestCommunitySubmission()`/`confirmCandidate()`, RP-029-A's own 26/26 suite re-run and passing before any RP-029-B code was written, Rule 82/83/84 docs present (`docs/builder/rules/27-29-*.md`).

**FIND:** Confirmed RP-029-A already implements private-by-default candidates, contributor-only-dedup independent-confirmation counting (5→`PARTIALLY_VERIFIED`), and explicit `PRIVATE`→`COMMUNITY`→`PUBLIC` visibility promotion. Confirmed its own `VERIFICATION_STATES` enum already defines `DISPUTED`/`REJECTED` as legal values but no code path ever sets them — the actual gap this repair closes. Confirmed `CozyLanguageRegistry` (RP-027) exposes no state-mutating function at all (`getLanguage`/`listLanguages`/`isAvailable`/`suggestFromCountry`/`resolveLanguage` only) — Rule 82 has no API surface this repair could violate even accidentally.

**FIX:** Added `core/modules/intelligence/knowledge/cozy-knowledge-community.js` (new, additive, ~430 lines). Composes RP-029-A's real, frozen `CozyKnowledgeIngestion` API (`ingestCommunitySubmission`, `confirmCandidate`, `contributeToCommunity`, `contributeToPublic`, `getCandidate`, `listCandidates`) — `cozy-knowledge-ingestion.js` is byte-identical before/after this pass (confirmed by diff). Adds: `submitContribution()` (contribution-type validation + pronunciation/orthography/audioReference/documentReference/variant metadata, namespaced under `candidate.communityExtensions` so no RP-029-A field is shadowed); a review workflow (`CANDIDATE`→`UNDER_REVIEW`→`CONFIRMED`/`DISPUTED`/`REJECTED`/`UNRESOLVED`, tracked as this file's own `reviewState` dimension, deliberately separate from RP-029-A's `verificationState` except for `DISPUTED`/`REJECTED`, which reuse RP-029-A's own pre-existing, previously-unreachable enum values); `addIndependentConfirmation()`, which calls RP-029-A's real `confirmCandidate()` first (dedup-by-contributor logic reused, not reimplemented) then applies a stricter, source-aware check — a confirmation sharing a non-null `sourceId` with an already-counted independent confirmation is recorded but flagged `INDEPENDENCE_UNVERIFIED` and does not inflate the count, closing the "same document/source chain" gap RP-029-A's contributor-only dedup could not detect by itself; `describeConfidence()`, reporting `meaning`/`translation`/`dialect`/`pronunciation`/`community`/`source` as separate `HIGH`/`MEDIUM`/`LOW`/`NOT_VERIFIED` labels, never one collapsed score; `promoteVisibility()`, a thin wrapper over RP-029-A's own `contributeToCommunity()`/`contributeToPublic()` that additionally blocks `PUBLIC` promotion while `reviewState === "DISPUTED"`; `getRule82Status()`, a strictly read-only reporter (composes `CozyLanguageRegistry.getLanguage()` when present) — never a mutator, since the registry exposes none; `getSyncStatus()`/`reconcileConflict()`, an honest offline data-model-only placeholder (`SYNC_PENDING` always; conflict reconciliation preserves both versions, never silently overwrites one) since no real network sync engine exists anywhere in this repository. **Privacy fix found by this repair's own test suite before delivery:** an early version of `toRecord()` naively spread RP-029-A's live candidate object, which re-exposed the raw (non-pseudonymized) `contributorId` RP-029-A itself stores in `candidate.provenance.sourceId` and its internal `_contributors` array. Fixed in `toRecord()` only (RP-029-A untouched) — `provenance.sourceId` is pseudonymized for `COMMUNITY_SUBMISSION`-sourced candidates and `_contributors` is stripped from every exposed record; only the real numeric `independentConfirmations`/`independentConfirmationCount` counts are exposed, never raw identity lists.

**TEST:** New file `core/modules/intelligence/knowledge/tests/cozy-knowledge-community.test.js` — 36 real, executed tests, all passing: contribution (accepted/malformed-type/missing-statement/provenance-preserved/dialect-retained), candidate lifecycle (created/under-review/unresolved/disputed-with-preserved-disagreement/rejected/confirmed-requires-a-real-confirmation-first/disputed-blocks-confirm), confirmation (one confirmation ≠ validated truth, independent counting, same-contributor dedup, same-source-different-contributor dedup, provenance preserved, contributor identity pseudonymized and never appears raw in a serialized record), confidence (separate labeled dimensions, honest `NOT_VERIFIED` vs. fabricated `LOW`), privacy (`PRIVATE` default, explicit `COMMUNITY` then `PUBLIC` promotion required, disputed candidates blocked from `PUBLIC`), Rule 82 (200 and 150 independent-confirmation volumes tested — registry state never changes, confirmed both with no registry present and with a real stubbed registry present), tier labels (advisory-only, never auto-applied to `reviewState`), offline/sync (`SYNC_PENDING` honest default, conflict preservation), and a direct assertion that the module's own description never claims speech/audio/video/ML capability. Full regression re-run this pass: RP-029-A 26/26 (byte-identical file, confirmed via diff before running), RP-028 Luo 15/15, RP-027 provider matrix 66/66, Language Registry 15/15. **TOTAL: 158/158** (36 new + 122 regression). `MD-025` (15/15 failing), `MD-026` (1/12 failing), `MD-027` (crashes outright under plain `node`) re-run and confirmed **unchanged, pre-existing** — not investigated or touched, exactly as scoped.

**Files Changed:**
- `core/modules/intelligence/knowledge/cozy-knowledge-community.js` (new)
- `core/modules/intelligence/knowledge/tests/cozy-knowledge-community.test.js` (new)
- `HANDOFF.md`, `LATEST.md`, `docs/builder/knowledge/repair-queue.md`, this file (documentation)
- **Honestly not updated:** `module-inventory.csv`/`module-inventory.json` — neither file exists anywhere in this repository baseline (confirmed by `find`, not assumed); RP-029-A's own "Files Changed" entry above lists them, but they are not actually present. Not fabricated here to match that entry.

**Locked-file / prior-baseline verification:** `cozy-knowledge-ingestion.js`, `cozy-language-registry.js`, `cozy-language-templates.js`, `rule-based-conversational-provider.js` confirmed byte-identical / untouched by this pass (diffed against the verified baseline before packaging).

**Regression Risk:** Low — one new, additive file plus its test file; zero existing source files edited; full suite re-run confirms no regression attributable to this change; the one real bug found (contributor-identity leak) was caught and fixed by this repair's own test suite before delivery, not discovered later.

**Dependencies / Continuation:** RP-029-C (Hearing Mode privacy/consent scaffolding), RP-029-D (audio/video/lip-analysis runtime integration — genuinely blocked pending a real signal-processing backend), RP-029-E (African language-pack expansion, still gated by Rule 82) remain open, exactly as scoped going in. A real admin UI for the review workflow this file exposes (begin review / confirm / dispute / reject / promote visibility) does not yet exist — `cozy-knowledge-community.js` is a real, tested API with no UI wired to it yet; that wiring is a natural next, separately-scoped step, not implied as done here. `MD-025`/`MD-026`/`MD-027` remain open, assigned to a Future Builder, unchanged by this pass.

**History:** `docs/builder/knowledge/repair-queue.md` (RP-029-B entry, this pass); `HANDOFF.md`'s matching entry.


---

## RP-029-C Phase 1 — Community Review & Validation Interface: Data/State Layer

**Baseline:** `CozyOS-main-RP-029-B.zip`, SHA-256
`129a1d16052d5ab83b4154944e0b7d7962720cb344a49ee25d8c13558ead5206`,
verified before writing any code.

**FIND:** RP-029-B's real review workflow (`beginReview`/`confirmReview`/
`disputeContribution`/`rejectContribution`/`markUnresolved`/
`addIndependentConfirmation`/`promoteVisibility`) and registry-only
Rule 82 stub (`getRule82Status`) confirmed present and passing (36/36)
before any new code was written. Confirmed RP-029-B's `REVIEW_STATES`
enum has no legal value for "partially confirmed" — the spec's own
instruction not to invent incompatible states governs the design below.

**FIX:** Added `core/modules/intelligence/knowledge/cozy-knowledge-review.js`
(new, additive, ~330 lines). Full detail in this pass's `HANDOFF.md`
entry (same heading). Summary: `partialConfirm()`/`requestClarification()`
as auditable reviewer actions without a new `reviewState`; audited
wrappers over RP-029-B's real `challenge`/`confirm`/`reject`/`promote`
operations; a derived, read-only `computeDisplayState()`; a full
five-part `evaluateRule82Gate()` (two dimensions mechanically checked
against real template data, two honestly `UNKNOWN` absent human/CI
attestation, one always `NOT_TESTED_LIVE`); its own append-only,
pseudonymized audit trail.

**TEST:** New file
`core/modules/intelligence/knowledge/tests/cozy-knowledge-review.test.js`
— 30/30 passing. Full regression this pass: RP-029-A 26/26, RP-029-B
36/36, Language Registry 11/11, RP-027 provider 66/66, rule-based
provider 14/14, on-device provider 8/8. **TOTAL: 191/191.**

**Files Changed:**
- `core/modules/intelligence/knowledge/cozy-knowledge-review.js` (new)
- `core/modules/intelligence/knowledge/tests/cozy-knowledge-review.test.js` (new)
- `HANDOFF.md`, `LATEST.md`, `RELEASES.md`, `repair-queue.md`, this file (documentation)

**Locked-file / prior-baseline verification:** `cozy-knowledge-ingestion.js`,
`cozy-knowledge-community.js`, `cozy-language-registry.js`,
`cozy-language-templates.js` all confirmed byte-identical to the
RP-029-B baseline (diffed before packaging).

**Regression Risk:** Low — one new, additive file plus its test file;
zero existing source files edited; full dependency-relevant suite
re-run confirms no regression.

**Dependencies / Continuation:** RP-029-C Phase 2 (Review Dashboard
UI) is next, wired to this file's real functions — not a new
validation engine. `MD-025`/`MD-026`/`MD-027` remain open, outside
this pass's dependency graph, unchanged.

**History:** `docs/builder/knowledge/repair-queue.md` (RP-029-C entry,
this pass); `HANDOFF.md`'s matching entry.

---

## RP-029-C Phase 2 — Review Dashboard UI (+ mid-pass Living Engines/Cozy Offline Hotspot reuse requirement)

**Baseline:** `CozyOS-main-RP-029-C-Phase1.zip`, SHA-256
`c9329383dabe2128d8204b156362b5f77c66321f1082b02b72528727bf2feda6`,
verified before writing any code.

**FIND / FIX:** Full detail in this pass's `HANDOFF.md` entry (same
heading). Summary: real browser dashboard (`cozy-knowledge-review-
dashboard-core.js` pure logic + `cozy-knowledge-review-dashboard-ui.js`
DOM layer + `review-dashboard.css`/`.html`) composing RP-029-C Phase
1's real API only; Rule 82 enforced in logic via `dashboardPromote()`,
not merely a hidden button; authorization via the real
`AuthCoordinator.getCurrentIdentity()`, honestly reporting
`AUTHORIZATION_BACKEND_UNAVAILABLE` when absent. Mid-pass architectural
addition (person-directed, binding for future milestones): reuse
existing Living Engines/Cozy Offline Hotspot rather than duplicating
networking/sync — inspected 5 candidate engines, composed the one
genuinely applicable one (`LiveHotspotEngine`, a real WebRTC engine)
via a new `cozy-knowledge-review-hotspot-bridge.js`; every received
payload lands as an ordinary unverified local candidate through the
real ingestion path, never auto-trusted.

**TEST:** 26/26 new Node tests + **12/12 real Playwright/Chromium
browser tests** (`BROWSER_TEST = PASS`) — two real bugs (wrong-module
`describeConfidence()` call; refresh() wiping its own feedback message)
caught and fixed by the browser test before delivery. Full regression:
RP-029-A 26/26, RP-029-B 36/36, Phase 1 30/30, Language Registry 11/11,
RP-027 provider 66/66, rule-based provider 14/14, on-device provider
8/8. **TOTAL: 217/217** (26 dashboard-core + 12 browser + 191 prior).

**Files Changed:** 5 new source files + 2 new test files (listed in
`HANDOFF.md`'s matching entry) + documentation.

**Locked-file / prior-baseline verification:** `cozy-knowledge-
ingestion.js`, `cozy-knowledge-community.js`, `cozy-knowledge-
review.js`, `cozy-language-registry.js`, `cozy-language-templates.js`,
`core/engines/collaboration/live-hotspot-engine.js` — all six confirmed
byte-identical to baseline (diffed before packaging).

**Regression Risk:** Low — five new, additive files plus two new test
files; zero existing source files edited; full dependency-relevant
suite (Node + real browser) re-run confirms no regression.

**Dependencies / Continuation:** RP-029-C Phase 3 (Contribution
Screen) is next. Composing the other four inspected Living Engines
(`cozy-living-sync.js`, `cozy-living-offline.js`, `living-ai-context-
engine.js`, `living-compressor.js`) into this domain remains a
disclosed, real future continuation point — not attempted this pass.
`MD-025`/`MD-026`/`MD-027` remain open, outside this pass's dependency
graph, unchanged.

**History:** `docs/builder/knowledge/repair-queue.md` (RP-029-C Phase 2
entry, this pass); `HANDOFF.md`'s matching entry.

---

## RP-029-C Phase 3 — Community Contribution Interface

**Baseline:** `CozyOS-main-RP-029-C-Phase2.zip`, SHA-256
`88298208ff604341b97404b09891fa67e4fcf961bf25c875366ebe63f32dbb97`,
verified before writing any code.

**FIND/FIX:** Full detail in this pass's `HANDOFF.md` entry (same
heading). Summary: real contribution form (`cozy-knowledge-
contribution-core.js` pure logic + `cozy-knowledge-contribution-ui.js`
DOM layer + `contribution-form.css`/`.html`) composing RP-029-B's real
`submitContribution()`, Phase 1's real `computeDisplayState()`, the
real language registry, and Phase 2's real Cozy Offline Hotspot
bridge. Oral-language-first (never requires spelling); consent is a
hard gate enforced in logic, not just the UI; language list is the
real registry only (honest UNKNOWN "Other" option, no fabricated
codes); DRAFT/READY are honest client-only pre-submission states;
withdrawal is real only pre-submission, honestly `CAPABILITY_
UNAVAILABLE` after; offline sharing composes Phase 2's real bridge
(`QUEUED`/`SHARED`/`FAILED` only — never fabricated `SYNCED`/
`CONFLICT`).

**TEST:** 21/21 new Node tests + 7/7 real Playwright/Chromium browser
tests (`BROWSER_TEST = PASS`, no bugs found this pass). Full
regression: RP-029-A 26/26, RP-029-B 36/36, Phase 1 30/30, Phase 2
dashboard-core 26/26, Language Registry 11/11, RP-027 provider 66/66,
rule-based provider 14/14, on-device provider 8/8. **Node TOTAL:
238/238.** Browser TOTAL: 19/19 (Phase 2's 12/12 + Phase 3's 7/7, both
re-run this pass).

**Files Changed:** 4 new source files + 2 new test files (listed in
`HANDOFF.md`'s matching entry) + documentation.

**Locked-file / prior-baseline verification:** all twelve
RP-029-A/B/Phase-1/Phase-2 files confirmed byte-identical to baseline
(diffed before packaging) — see `HANDOFF.md` entry for the full list.

**Regression Risk:** Low — four new, additive source files plus two
new test files; zero existing source files edited; full
dependency-relevant Node + real-browser suite re-run confirms no
regression.

**Dependencies / Continuation:** Admin-dashboard contribution analytics
(spec §26) and real document/OCR/website-evidence ingestion (if/when a
genuine backend exists) remain disclosed, real future continuation
points — not attempted this pass. `MD-025`/`MD-026`/`MD-027` remain
open, outside this pass's dependency graph, unchanged.

**History:** `docs/builder/knowledge/repair-queue.md` (RP-029-C Phase 3
entry, this pass); `HANDOFF.md`'s matching entry.

---

## RP-029-C Phase 4 — Mandatory Content Safety Gate

**Baseline:** `CozyOS-main-RP-029-C-Phase3.zip`, SHA-256
`a9709e014b879c1f517759a23f343907b20b8b7daa03803cdfcb6368a012129a`,
verified before writing any code.

**FIND/FIX:** Full detail in this pass's `HANDOFF.md` entry (same
heading). Summary: new `cozy-knowledge-safety-gate.js` — real
text-pattern SAFE/UNSAFE/UNCERTAIN classification (credential leaks,
malware patterns, PII patterns, explicit adult phrases, instructional-
harm phrases -> UNSAFE hard-reject; ambiguous single terms and
unanalyzable media references -> UNCERTAIN quarantine for human
review; sexual-content-involving-minors and extremist-recruitment
categories explicitly not keyword-matched, disclosed as requiring real
specialized infrastructure this repository lacks). Composed into both
contribution submission (`cozy-knowledge-contribution-core.js`) and
offline hotspot receipt (`cozy-knowledge-review-hotspot-bridge.js`) —
the only two files modified this pass, both disclosed, both minimal
single-call-site diffs. A real bug (gate not scanning the `statement`
field hotspot payloads actually use) was found and fixed by this
pass's own test suite before delivery.

**TEST:** 22/22 new Node tests. Full regression: RP-029-A 26/26,
RP-029-B 36/36, Phase 1 30/30, Phase 2 dashboard-core 26/26, Phase 3
contribution-core 21/21 (re-run against the modified file), Language
Registry 11/11, RP-027 provider 66/66, rule-based provider 14/14,
on-device provider 8/8. **Node TOTAL: 260/260.** Both real browser
suites re-run, unaffected: 19/19.

**Files Changed:** 2 new source files + 1 new test file, 2 files
modified with disclosed single-purpose diffs, 2 HTML files each
gaining one script tag (listed in `HANDOFF.md`'s matching entry) +
documentation.

**Locked-file / prior-baseline verification:** 13 files confirmed
byte-identical to the Phase 3 baseline (diffed before packaging);
exactly the 4 disclosed files differ, nothing else.

**Regression Risk:** Low-to-moderate — two existing files received a
real, necessary, minimal modification (one gate call each) rather than
zero changes; both files' own full existing test suites were re-run
unmodified and remain green, and the new gate's own suite specifically
exercises both wiring points.

**Dependencies / Continuation:** Wiring `listQuarantined()`/
`releaseFromQuarantine()` into the Phase 2 dashboard as a REVIEWER/
ADMIN-only view is the next real step — not attempted this pass to
keep scope to the gate itself. `MD-025`/`MD-026`/`MD-027` remain open,
outside this pass's dependency graph, unchanged.

**History:** `docs/builder/knowledge/repair-queue.md` (RP-029-C Phase 4
entry, this pass); `HANDOFF.md`'s matching entry.

---

## RP-029-C Phase 5 — Quarantine + Admin Safety Review

**Baseline:** `CozyOS-main-RP-029-C-Phase4.zip`, SHA-256
`bb8e5505a83724b4331643fce4d49e15d46bf52196b52e563ceefc294df30b4b`,
verified before writing any code.

**FIND/FIX:** Full detail in this pass's `HANDOFF.md` entry (same
heading). Summary: new admin review layer (`cozy-knowledge-
quarantine-admin-core.js` + `-ui.js` + `quarantine-admin.html`) with a
real state machine (QUARANTINED->UNDER_REVIEW->RELEASED|REJECTED|
ESCALATED), append-only audit trail, REVIEWER+-gated actions composing
Phase 2's real authorization, and a real release-to-candidate flow
that never bypasses Rule 82. Three files received disclosed, minimal
modifications: `cozy-knowledge-safety-gate.js` (HIGH_RISK tier,
ESCALATE decision, dedup, getter — all additive), `cozy-knowledge-
contribution-core.js` and `cozy-knowledge-review-hotspot-bridge.js`
(HIGH_RISK routing fix — a real bug found and fixed by this pass's own
tests before delivery).

**TEST:** 30/30 new Node tests (all 30 spec-minimum scenarios) + 8/8
real Playwright/Chromium browser tests (`BROWSER_TEST = PASS`). Full
regression: RP-029-A 26/26, RP-029-B 36/36, Phase 1 30/30, Phase 2
dashboard-core 26/26, Phase 3 contribution-core 21/21, Phase 4 safety
gate 22/22, Language Registry 11/11, RP-027 provider 66/66,
rule-based provider 14/14, on-device provider 8/8. **Node TOTAL:
290/290.** Browser TOTAL: 27/27 (all three real suites re-run).

**Files Changed:** 5 new files (3 source + 2 test) + 3 disclosed,
minimal modifications to prior-phase files + documentation.

**Locked-file / prior-baseline verification:** every file not listed
above confirmed byte-identical to the Phase 4 baseline (diffed before
packaging), including both prior HTML pages, untouched this pass.

**Regression Risk:** Low-to-moderate — three existing files each
received a small, real, necessary, disclosed modification (re-tested
in full, still green) rather than zero changes; all new functionality
is additive and covered by dedicated tests including two real bugs
caught before delivery.

**Dependencies / Continuation:** Real historical analytics and a real
specialized-content-review backend for escalated items remain
disclosed, genuine future continuation points. `MD-025`/`MD-026`/
`MD-027` remain open, outside this pass's dependency graph, unchanged.

**History:** `docs/builder/knowledge/repair-queue.md` (RP-029-C Phase 5
entry, this pass); `HANDOFF.md`'s matching entry.

---

## RP-030 — CozyAI Language Pack Foundation

**Problem/Scope:** No canonical architecture existed for CozyAI
language packs (identity, geography, dialects, vocabulary/phrase
records, confidence, provenance, licensing, validation, safety). RP-030
built that foundation for the 13 authoritative target languages.

**Baseline verification:** `CozyOS-main-RP-029-C-Phase5.zip`, SHA-256
`8a56ded2986332eacc253cb27e74141bd36a3d6e4dee6b158c735a0d4d4c23fb`,
matched exactly; ZIP integrity confirmed; full pre-existing Node test
suite run and its results recorded before any new code was written.

**Fix:** New, additive, standalone file
`core/modules/intelligence/language-packs/cozy-language-pack-registry.js`
composing RP-029-A's ingestion API, RP-029-C's safety gate, and
(read-only) `cozy-knowledge-review.js`'s Rule 82 gate. 13 language-pack
identities registered, all `REGISTERED`/`NOT_READY` — none
`AVAILABLE`. No mutator exists that can promote a pack; Rule 82
remains the sole authority, consulted read-only.

**Test:** `core/modules/intelligence/language-packs/tests/
cozy-language-pack-registry.test.js` — 32/32 passing. A separate,
real (non-mocked) integration check against the actual
`cozy-knowledge-ingestion.js` and `cozy-knowledge-safety-gate.js`
files confirmed real SAFE/UNCERTAIN routing (ambiguous single-word
submission correctly quarantined via the real gate, real quarantine
ID returned).

**Regression:** Every pre-existing `*.test.js` in the repository
re-run before and after; sorted multiset of pass/fail counts is
byte-identical (confirmed via `diff`, not inspection).

**Scope boundary (honestly disclosed):** this pass built the
foundation architecture only. All 13 packs remain `resourceState:
NOT_READY` — no vocabulary/phrase/grammar content populated. No ML
language-ID/ASR/OCR/translation backend exists in this repository or
is claimed by this file. No usage-telemetry engine exists; the
dashboard snapshot reports `mostUsed: "NOT_AVAILABLE_NO_TELEMETRY"`
rather than fabricating a ranking. Admin-dashboard visual UI was not
built this pass — only its data API.

**History:** `docs/builder/knowledge/repair-queue.md` (RP-030 entry,
this pass); `HANDOFF.md`'s matching entry; `RELEASES.md`'s RP-030
entry.

---

## RP-031 Phase 1 — Core Language Acquisition Foundation + Dholuo/Kenya Reference Architecture

**Problem/Scope:** RP-030 built the `LanguagePack` container
architecture but not the acquisition pipeline's remaining pieces:
independent-contributor-based validation tiers, fast local retrieval
distinct from verification, a Hearing Mode capture/clarify workflow,
honest multi-source (document/website/OCR/audio/video) capability
gates, Cozy Offline Hotspot transport, knowledge-domain separation,
and a real (not fabricated) Dholuo/Kenya reference implementation.
RP-031 Phase 1 built exactly that additive layer, explicitly stopping
short of the "Teach CozyAI" contribution UI and Admin Dashboard UI
(Phase 2), per the owner's own scoping instruction for this pass.

**Baseline verification:** `CozyOS-main-RP-030.zip`, SHA-256
`e7e0cd9f3eacf07ab1762caa6eff60a39f16f446048d7d6cf6431aa87c102a91`,
computed twice independently and matching; `unzip -t` clean; full
pre-existing Node test suite (624 passed, 16 pre-existing, unrelated
failures) run and recorded before any new code was written.

**Fix:** New, additive, standalone file
`core/modules/intelligence/language-packs/cozy-language-acquisition-pipeline.js`
composing RP-030's `CozyLanguagePacks`, RP-029-C Phase 2's
`CozyKnowledgeReviewHotspotBridge`, and (capability-checked only)
`CozyHearing`/`OCREngine`. No RP-029/RP-030/RP-027 file was modified.

**Test:** `core/modules/intelligence/language-packs/tests/
cozy-language-acquisition-pipeline.test.js` — 30/30 passing, covering:
independent-contributor tier escalation (1/2/4/10 distinct
contributors -> CANDIDATE/EMERGING/STRONG/VALIDATED, and that one
contributor resubmitting cannot inflate the tier); fast local
retrieval with a disclosed retrieval-vs-verification-speed distinction;
regional multi-meaning reporting; Hearing Mode capture requiring text
or audio evidence, discarding raw audio by default and retaining it
only when explicitly authorized, and clarification resolution
producing real (never automatic) candidate evidence; honest
`CAPABILITY_UNAVAILABLE` responses for document/website/OCR sources
without already-extracted text, for OCR even when `OCREngine` is
composed but returns no recognized text, and for video lip-reading
unconditionally; oral-audio evidence accepted with no orthography;
Cozy Offline Hotspot transport reporting `QUEUED` with no bridge
composed, `NO_ACTIVE_HOTSPOT_CONNECTION` honestly when nothing is
connected, and `SHARED` only when a real bridge actually sent data;
knowledge-domain separation never self-elevating a submission to
`PROFESSIONAL_GUIDANCE`; a community-answer formatter that always
discloses its own non-professional status; reference geography
correctly keeping Hausa/Tanzania and Hausa/Nigeria distinct; and a
real, cross-referenced (Wikivoyage Luo phrasebook, a published Dholuo
grammar text, and community word-list sites), non-fabricated Dholuo
greeting ("Misawa") seeded as `LICENSE_UNKNOWN` reference evidence
that never reaches `AVAILABLE`.

**Regression:** every pre-existing `*.test.js` in the repository
re-run before and after (42 files after this pass); results identical
apart from the 30 new, passing tests (654 passed / 16 pre-existing
unrelated failures after vs. 624 passed / 16 failed before).
RP-029-A/B/C, RP-030, and RP-027's own suites individually re-run and
confirmed still fully green.

**Scope boundary (honestly disclosed):** this pass is Phase 1 only.
No "Teach CozyAI" contribution UI or Admin Dashboard visual UI was
built — only their data contracts (`submitEvidence()`,
`resolveClarification()`, `getAcquisitionDashboardSnapshot()`, etc.).
No real ASR/OCR/website-fetch/video-understanding backend exists in
this repository; every corresponding entry point honestly reports
`CAPABILITY_UNAVAILABLE`. The Cozy Offline Hotspot receive path still
lands incoming payloads in `CozyKnowledgeCommunity`'s own store rather
than merging directly into a language-pack record — a genuine,
disclosed Phase 1 limitation (`RP-031-HOTSPOT-RECEIVE-MERGE`), not a
silently-skipped one. Vocabulary/phrase population for all 13
languages remains `NOT_READY`; exactly one real, attributed word was
seeded, to exercise the pipeline, not to claim Dholuo is understood by
CozyAI.

**History:** `docs/builder/knowledge/repair-queue.md` (RP-031-PHASE1
entry and its three follow-on rows, this pass); `LATEST.md`'s and
`HANDOFF.md`'s matching entries; `RELEASES.md`'s RP-031 Phase 1 entry.

---

## RP-035-P4-REGION-EVIDENCE-DROPPED — RP-035 Phase 4

**Symptom:** A Phase 4 evidence-enrichment test using a real Kisumu
region scenario returned `region: NOT_AVAILABLE` even though the test
had genuinely registered a regional context and passed `region` to
the analysis job.

**Investigation (per explicit instruction: do not assume engine bug,
do not fabricate region evidence, do not weaken the test):** traced
the real data path — `createJob(type, params)` stores `params`
verbatim on the job (`cozy-remote-media-analysis.js`); `getJob()`
returns it unmodified; but `cozy-media-analysis-link.js` called
`lang.routeMediaAnalysisJob(jobId)` with **no second argument**, and
`routeMediaAnalysisJob(jobId, opts)` only reads region/dialect/
community from `opts`, never from `job.params` directly. Confirmed
live with a real reproduction script before writing any fix: region
evidence genuinely existed on `job.params.region` and was being
silently dropped, not absent from the architecture.

**Fix:** `cozy-media-analysis-link.js` now forwards the job's own real
`region`/`dialect`/`community`/`country` params as
`routeMediaAnalysisJob(jobId, opts)`'s second argument. No new field
invented; only real, already-present data is now passed through.

**Verification:** `record.language.region` correctly resolves to
`"Kisumu"` for the real scenario; confidence honestly improved from
LOW to MEDIUM (more real evidence, not a fabricated boost). Phase 1's
own 80/80 tests re-run and still pass unchanged. Phase 2 (94/94) and
Phase 3 (46/46) re-run and still pass unchanged. Phase 4's own
previously-failing test now passes for the correct reason (real
region evidence flows through), and a companion negative test
confirms region genuinely stays `NOT_AVAILABLE` when the job supplies
none — the fix does not fabricate region evidence, it stops dropping
real evidence that was already there.

---

## RP-035-PHASE5-TEST-AUTHORING-BUGS — RP-035 Phase 5

**Symptom:** During Phase 5 test-suite development, 5 of the new
`cozy-media-intelligence.test.js` tests failed on first run.

**Investigation and fixes (all in the new Phase 5 test file itself,
not in engine code — verified before assuming otherwise):**

1. **Wrong field name.** Tests assumed `IdentityEngine.createUser()`
   returns `{ id, ... }`. The real method
   (`core/modules/identity/identity-engine.js`) returns
   `{ available, userId, username }`. Confirmed by reading the actual
   source before changing anything. Fixed every test to use
   `user.userId`.
2. **Missing `await` masked a failing assertion.** Several new tests
   used `async () => {...}` bodies but were invoked as plain
   `test(name, fn)` without awaiting the returned promise, so a
   rejected assertion inside them became an unhandled rejection
   instead of a reported failure — including one test that "passed"
   vacuously because its assertion never actually ran against a
   resolved value. Fixed by making `test()` return a promise for both
   sync and async bodies, wrapping the async-test portion of the file
   in an `(async () => { ... })()` IIFE, and adding `await` before
   every `test()` call whose body is `async`.
3. **Wrong language name in a test fixture.** A test asked
   `answerMediaQuestion('Find sermons in swahili')`, but RP-030's real
   `DEFAULT_IDENTITIES` entry for `sw` has `name: "Kiswahili"`, not
   "Swahili" — confirmed by inspecting the real registry data rather
   than assuming the engine's language-term matching was broken.
   Fixed the test fixture to use the real name.

**Verification:** all three fixes are confined to the test file;
`cozy-media-intelligence.js` itself was not changed for any of these.
After fixing, 50/50 Node tests pass, and the same disciplined pattern
(read the real API before assuming a bug) that caught the Phase 1
`languageCode`/`languageId` defect and the Phase 4 region-forwarding
defect was applied here — this time confirming the *test*, not the
engine, was wrong.

---

## RP-035-SECTION13-BROWSER-TEST-PATH-BUGS — RP-035 Section 13

**Symptom:** The new `cozy-live-connectivity-dashboard-browser.test.js`
failed entirely on first run — every DOM selector timed out.

**Investigation (live diagnostics added before assuming an engine
bug, per established discipline):** added a `page.on('console', ...)`
listener and printed the real served base URL. Found real 404s for
static assets. Traced each:

1. **`REPO_ROOT` off-by-one.** The test file lives at
   `core/connectivity/ui/tests/`, four directories below the file
   that owns `cozyos/` — needs 5 `..` segments to reach the true repo
   root, not 4. Confirmed by computing the path directly with
   `path.join()` before and after the fix.
2. **Wrong `identity-engine.js` path in the dashboard HTML.** The
   script tag pointed at `../../identity/identity-engine.js`
   (`core/identity/identity-engine.js`, which does not exist); the
   real file is `core/modules/identity/identity-engine.js`. Confirmed
   by `find . -iname identity-engine.js` before editing.
3. **Wrong relative path for the new engine file itself.** The
   dashboard HTML referenced `../cozy-live-connectivity-app.js`
   (one directory too high); the real, correct sibling path is
   `cozy-live-connectivity-app.js`.

**Fix:** all three paths corrected in the dashboard HTML / test file.
Re-run confirmed pages loaded and 6/8 tests passed immediately,
surfacing two more *real* findings (not bugs):

4. A test asserted on the literal string `"Wi-Fi Direct"`, but the
   dashboard's CSS applies `text-transform: uppercase` to group
   headers, so Playwright's `innerText` correctly returns
   `"WI-FI DIRECT"`. Fixed the test to match case-insensitively rather
   than changing the CSS.
5. A genuine mobile-layout overflow, caused by a long unbroken packet
   ID string in the offline-queue row. Fixed with `word-break:
   break-all` and `box-sizing: border-box` CSS, verified by re-running
   the real narrow-viewport assertion.

**Verification:** 8/8 browser tests pass after all five fixes; 32/32
Node tests pass; full regression 1935/16 (unchanged pre-existing
pattern). No test was weakened to force a pass — every fix either
corrected a real path/CSS defect or corrected a test assumption that
didn't match the real rendered DOM.

---

## RP-035-SECTION14-SOURCE-SCAN-TEST-FALSE-POSITIVES — RP-035 Section 14

**Symptom:** Two new Node tests in
`cozy-live-camera-capture-app.test.js` failed on first run, both
scanning `cozy-live-camera-capture-app.js`'s own source text for
forbidden enhancement/duplicate-engine vocabulary.

**Investigation:** both failures were the tests being over-strict
against the module's own honest disclosure comments, not real
defects:

1. A test asserted the substring "denois" appears at most once in the
   source. It actually appears twice: once in the real
   `denoising: "CAPABILITY_UNAVAILABLE"` registry key, and once in the
   file's own header comment listing exactly what this file does NOT
   implement ("no image processing, enhancement, sharpening,
   denoising, HDR..."). The comment is a *feature* of this codebase's
   documentation discipline, not a violation.
2. A test asserted the substring "live-capture-engine" never appears
   in the source at all. It appears once, inside a header comment
   explicitly explaining why `live-capture-engine.js` was NOT used as
   the foundation (the disclosed `CameraEngine`/`AudioManager`
   mismatch). Flagging that disclosure as "usage" would have punished
   the exact kind of honesty this project requires.

**Fix:** rewrote both tests to check for actual usage — a real
`function denoising(...)`-style definition for the first, and a real
`require(...)`/`<script src=...>` reference for the second — rather
than raw substring counting. Neither the engine file nor the dashboard
HTML was changed; both fixes were confined to the test file.

**Verification:** 37/37 Node tests pass after the fix; a follow-up
direct check confirmed the dashboard HTML also contains zero
references to `live-capture-engine.js` (`grep -c` returns 0),
independently corroborating that Section 14 genuinely never composes
that file, exactly as specified.

---

## RP-035-SECTION14-BROWSER-TEST-TIMING-FLAKE — RP-035 Section 15 (found during mandatory gate check)

**Symptom:** The mandatory Production-ZIP-first baseline regression,
run in a completely fresh, untouched extraction of the certified
Section 14 ZIP, returned 1984 passed / 17 failed instead of the
certified 1985/16 — a new failure in
`cozy-live-camera-capture-dashboard-browser.test.js` (12/13, not
13/13), on code that had not been modified.

**Investigation (per the mandatory gate: diagnose before proceeding,
never assume the code is broken without checking):** three isolated
re-runs of the same test file, back to back, returned 13/13 every
time. A full-repository regression re-run immediately after returned
1985/16 — the exact certified baseline, same failure set. This
confirmed the failure was a one-time timing race in a real Chromium
MediaRecorder pause/resume cycle, triggered specifically when running
under the CPU load of the full ~60-file regression scan, not a
functional defect and not caused by anything in the current session
(the workspace was a fresh, untouched extraction at the time).

**Fix:** widened the tightest wait in that test
(`.camera-pause-record`/`.camera-resume-record` assertions) from
150ms to 300ms, with an inline comment disclosing why. This is a
timing-robustness fix only — no assertion was weakened or removed,
and no functional behavior of Section 14's capture engine changed.

**Verification:** 5 consecutive isolated re-runs after the fix, all
13/13. A subsequent full-repository regression (run as part of Section
15's own final regression pass) also came back with 0 failures in this
file. Documented in `repair-queue.md` as fixed rather than silently
folded into "no changes" — this is a real, disclosed, in-scope
deviation from "Section 14's files were not touched," and both the
byte-identity audit and governance records for Section 15 name it
explicitly rather than letting it appear as an unexplained diff.

---

## RP-035-SECTION15-OWN-BROWSER-TEST-TIMING-FLAKE — RP-035 Section 15

**Symptom:** During Section 15's own full regression pass (run
immediately after implementation), `cozy-camera-clarity-dashboard-
browser.test.js` returned 9/10 once, having passed 10/10 on every
prior isolated run during development.

**Investigation:** the same pattern as the Section 14 finding above —
4 isolated re-runs immediately after returned 10/10 every time,
confirming a real-Chromium timing sensitivity under full-suite CPU
load rather than a logic defect in the new Camera Clarity Engine
itself (the pixel-math and pipeline logic have their own, separate,
fully passing Node test suite that does not depend on browser timing
at all).

**Fix:** widened the four 400ms waits (preview start, photo capture,
and the final honest-empty-state check) to 600ms, applying the same
proportional-headroom adjustment used for Section 14's fix.

**Verification:** 3 consecutive isolated re-runs after the fix, all
10/10. A full-repository regression run afterward (2031 passed / 16
failed) showed zero flakes in this file. Both this file and Section
14's test are now the two browser-test files in the project with an
explicit, disclosed timing-headroom comment — a pattern future
Section 16+ browser tests should default to (500ms+ waits after any
real MediaRecorder state transition) rather than rediscovering this
each time.

---

## COZYAI-FOUNDER-INTENT-ORDERING-BUG — CozyAI Project Knowledge & Public Story Integration

**Symptom:** during the new project-knowledge test suite's first run,
"Why did the founder create CozyOS?" classified as `founder` instead
of the newly-added `project-origin` intent.

**Investigation:** the pre-existing `founder` intent rule's pattern
includes a bare `\bfounder\b` alternative — deliberately broad, to
catch phrasings like "tell me about the founder." The new
`project-origin` rule was inserted after `founder` in `INTENT_RULES`,
so the broader, earlier-listed pattern won on a phrase that legitimately
contains the word "founder." This is a real intent-priority defect,
not a test-authoring mistake — confirmed by reading `classifyIntent()`'s
first-match-wins logic directly.

**Fix:** moved all five new project-knowledge intents (`project-origin`,
`public-story`, `cozyos-vision`, `cozyos-mission`, `project-history`)
ahead of `founder` in `INTENT_RULES`, consistent with this file's own
documented ordering discipline ("most specific patterns first").

**Verification:** the full 13-question permanent regression set,
including both founder-related and project-origin-related phrasings,
passes with the correct intent classification for each. Both
pre-existing conversational-provider test suites re-run unchanged
(14/14, 66/66).

---

## COZYAI-HOW-CAN-I-REGISTER-GAP — CozyAI Project Knowledge & Public Story Integration

**Symptom:** the milestone's required permanent regression set
included "How can I register?" and "How can I create an account?" —
both classified as `unsupported` on first run, not `how-to-register`.

**Investigation:** the existing `how-to-register` pattern was
`/\bhow\s+(?:do\s+i|to)\s+register\b|.../i` — it only recognized "how
do I register" and "how to register," not "how CAN I register." This
is a real, pre-existing gap in an intent that was never modified by
this milestone's own new work — surfaced purely because the required
regression set exercised a phrasing nobody had tested before.

**Fix:** broadened the alternation to `(?:do\s+i|to|can\s+i)`, and
added a parallel `can\s+i` branch to the "create an account" phrasing
already present. Same intent id, same existing `getFounderFact()`-
style evidence handler, same existing `VERIFIED` behavior — only the
trigger-phrase recognition was extended.

**Verification:** all 13 permanent regression-set questions pass with
correct classification; both pre-existing conversational-provider
suites re-run unchanged (14/14, 66/66).

---

## RP-035-SECTION16-TEST-AUTHORIZATION-FIXTURE-GAP — RP-035 Section 16

**Symptom:** on first run, `cozy-live-session.test.js` failed 30 of 52
tests with a mix of `NOT_AUTHORIZED`/`NOT_FOUND` results across
session lifecycle, presentation transitions, comments, and live text.

**Investigation:** `startSession()`'s real authorization gate (calling
`IdentityEngine.canAccessApplication(hostUserId, 'live-session')`)
was working exactly as designed — the majority of tests were passing
arbitrary placeholder strings like `'host-1'` as `hostUserId`, which
correctly failed the real authorization check since no such user
existed. This mirrors the exact discipline already established in
Sections 13-15's own launch-authorization tests; the new tests here
simply hadn't been written to account for it consistently.

**Fix:** added a `startAuthorizedSession()` test helper that creates a
real user via `IdentityEngine.createUser()`, assigns the
`live-session` application, and only then starts a real session.
Replaced all 22 non-authorization-focused test call sites with this
helper via a scripted substitution, leaving the two dedicated
authorization tests (which intentionally exercise the unauthorized
path) untouched.

**Verification:** 52/52 tests pass after the fix. The engine's
`startSession()` function itself was never modified — this was purely
a test-fixture correction.

---

## RP-035-SECTION16-HOSTINVITE-COMPOSITION-PATH-BUG — RP-035 Section 16

**Symptom:** `attemptPeerConnection()` failed with
`CAPABILITY_UNAVAILABLE` even when `CozyConnectivityTransport` was
genuinely loaded.

**Investigation:** the initial implementation called
`transport.hostInvite()` directly, based on an earlier grep hit
showing `hostInvite`/`acceptInvite` inside
`cozy-connectivity-transport.js`. Reading the actual class definitions
before continuing (rather than assuming the grep hit meant a
top-level method) revealed `hostInvite()`/`acceptInvite()` are
instance methods of the `PairingSession` class, returned by
`transport.createPairingSession(opts)` — not methods on the
`CozyConnectivityTransport` singleton itself. Confirmed directly:
`Object.getOwnPropertyNames(Object.getPrototypeOf(transportInstance))`
does not include `hostInvite`.

**Fix:** `attemptPeerConnection()` now calls
`transport.createPairingSession({})` first, then calls `hostInvite()`
on the real object that method returns — composing the actual real
API surface, not an assumed one.

**Verification:** the relevant Node tests
("`attemptPeerConnection()` composes the real
`CozyConnectivityTransport.hostInvite()`...") pass after the fix;
`CozyConnectivityTransport` itself was never modified.

---

## RP-035-SECTION16-FLEXBOX-MIN-HEIGHT-BUG — RP-035 Section 16

**Symptom:** the real browser test's resize-handle drag genuinely
moved the mouse and dispatched real pointer events, but the surface's
measured width never changed (`before=320 after=320`).

**Investigation:** a live diagnostic script (real Playwright,
`boundingBox()` before/after) showed the resize handle's own bounding
box sat 14px below the visible surface's bottom edge — a classic
flexbox bug: `.surface-video-area { flex: 1; }` inside a fixed-height
flex column defaults to `min-height: auto`, which for a flex item
containing an intrinsically-sized `<video>` element prevents it from
shrinking to fit the available space, pushing the absolutely-
positioned resize handle outside the clipped, visible area even though
`overflow: hidden` hid it from view.

**Fix:** added the standard `min-height: 0` to `.surface-video-area`.

**Verification:** re-running the same diagnostic script showed the
handle's bounding box correctly within the surface bounds; the real
browser test's resize assertion passed afterward with a genuine,
measured width change.

---

## RP-035-SECTION16-STOP-STATUS-RENDER-ORDER-BUG — RP-035 Section 16

**Symptom:** the real browser test's Stop/X assertion failed — after
pressing Stop, `#live-status` still showed the just-stopped session's
`sessionId`/state instead of the honest "No live session." text.

**Investigation:** the Stop button's click handler called
`renderStatus()` before setting `currentSessionId = null`, so
`renderStatus()` read the (now-`STOPPED`) session's real data instead
of falling through to the empty-state branch.

**Fix:** reordered the two statements — `currentSessionId = null`
before `renderStatus()`.

**Verification:** the real browser test's Stop/X assertion passes
after the fix; `cozy-live-session.js`'s own `stopSession()` function
was never touched — this was purely a dashboard-script ordering bug.
