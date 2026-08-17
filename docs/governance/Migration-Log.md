# CozyOS Migration Log

Chronological record of **completed, certified** milestones only.

Rules (per `Engineering-Governance-v1.0.md`):
- Forward-only — never backfilled
- No plans, no intentions — see `OCR-Roadmap.md` for those
- Only milestones that reached Certification are entered here
- First entry begins with **Milestone 175** — Milestone 174 predates this
  locked process and is recorded instead in `Milestone-174-Continuation.md`

---

## Milestone 175A — Platform Ownership Reconciliation

**Status:** Certified
**Continuation document:** `docs/milestones/Milestone-175A-Continuation.md`

Resolved three unresolved `window.CozyOS.*` ownership conflicts (Discovery/
PlatformDiscovery, Background, Theme) discovered during Gate 1 review of
the `CozyOS-main-v1_3_1-M174.zip` baseline. Archived four superseded files
to `_archive/platform-ownership/` with governance headers. Corrected seven
broken `<script src>` paths in `dashboard.html` (two case-mismatches, five
wrong-directory references) found across two Gate 1 passes. Re-ran Gate 1
to a clean result: 0 ownership conflicts, 0 broken script paths.

**Verification:** Repository Verified, Static Verified. Runtime Verified
marked Not Required (no logic changes — archival and path corrections
only). Browser Runtime Verified marked Not Performed (no browser
available in this environment).

---

## Milestone 175B — Administration Workspace

**Status:** Certified
**Continuation document:** `docs/milestones/Milestone-175B-Continuation.md`

Re-verified Gate 1 conclusions against the `CozyOS-main-v1_3_1-M175A.zip`
baseline (identity, auth, authorization, and audit ownership; Developer
Access and PolicyDecisionEngine/PolicyEngine out of scope and unloaded;
no role or permission enumeration exists; `core/modules/admin/` free) —
all confirmed unchanged. Implemented `core/modules/admin/cozy-admin-workspace.js`,
registering `window.CozyOS.AdminWorkspace` as a read-only orchestration
facade over the four verified canonical owners (`IdentityEngine`,
`CozyOS.Auth`, `AuthorizationCoordinator`, `PlatformAudit`). Added one
`<script src>` tag to `dashboard.html`, loaded after all four
dependencies. Introduces no new roles, permissions, authentication,
authorization, or audit ownership.

**Verification:** Repository Verified (Gate 1 re-check; 152/152 script
paths resolve), Static Verified (`node --check`), Runtime Verified (Node
harness against mocked dependencies, including absent-dependency and
version-conflict-guard paths). Browser Runtime Verified marked Not
Performed (no browser available in this environment).

---

## Milestone 176A — Session Runtime Reconciliation

**Status:** Certified
**Continuation document:** `docs/milestones/Milestone-176A-Continuation.md`

Gate 1 (`docs/milestones/Milestone-176-Gate1.md`) found a real,
confirmed conflict: `core/security/session-manager.js` was never loaded
by `dashboard.html`, and a `bindCompatAliases()` block in
`core/modules/identity/auth-coordinator.js` was wrongly aliasing
`window.CozyOS.SessionManager` to `window.CozyOS.Session` and
`window.CozyOS.TrustedDeviceManager` to the explicitly-declared
`AdminRecoveryPolicy` stub — which then caused the real
`trusted-device-manager.js` to throw `VERSION_CONFLICT` on load and
never register. Fixed by removing the obsolete alias block and adding
the missing `<script src="core/security/session-manager.js">` tag. No
new security features implemented — no roles, permissions,
authentication, authorization, identity, or Administration Workspace
logic touched.

**Verification:** Repository Verified (Gate 1 conflict trace; 153/153
script paths resolve), Static Verified (`node --check`), Runtime
Verified (Node harness loading the actual, unmocked repository files in
`dashboard.html`'s exact new order — confirmed both `SessionManager` and
`TrustedDeviceManager` resolve to their real implementations, confirmed
a real end-to-end login through `AuthorizationCoordinator` reaches real
device registration and session tracking, and confirmed graceful
degradation when both dependencies are genuinely absent). Browser
Runtime Verified marked Not Performed (no browser available in this
environment).

---

## Milestone 176B — Session Workspace

**Status:** Certified
**Continuation document:** `docs/milestones/Milestone-176B-Continuation.md`

Gate 1 (repeated against the same 176A-baselined repository) confirmed
`window.CozyOS.SessionWorkspace` and `core/modules/session/` were
unclaimed by any existing aggregator, and verified the exact live public
methods of all five canonical owners (`SessionManager`,
`TrustedDeviceManager`, `IdentityEngine`, `AuthorizationCoordinator`,
`PlatformAudit`) before any code was written. Implemented
`core/modules/session/cozy-session-workspace.js`, registering
`window.CozyOS.SessionWorkspace` as a read-only orchestration facade
that owns no session state, no trusted-device state, and no
authentication or authorization logic. Added one
`<script src="core/modules/session/cozy-session-workspace.js">` tag to
`dashboard.html`, placed after all five dependencies (last: PlatformAudit
at line 501). No existing file was modified beyond this one insertion.

**Owning branch (RL-015):** This conversation's own Milestone 176B work,
built directly on the 176A-certified baseline. No reconciliation was
required — no competing branch or file existed for this capability.

**Verification:** Repository Verified (Gate 1; confirmed 154/154 script
paths resolve after the one new tag — see discrepancy note below),
Static Verified (`node --check`), Runtime Verified (Node harness loading
the actual, unmocked repository files in `dashboard.html`'s order —
confirmed all five dependencies and `SessionWorkspace` itself resolve;
confirmed `getWorkspaceHealth()`, `getSessionSummary()`,
`getActivityOverview()`, `getDeviceExpirationReport()`, and
`getDiagnosticsReport()` all return real, correctly-shaped data pulled
from the live dependencies; confirmed graceful degradation — no crash,
honest `available: false` reporting — when all five dependencies are
absent). Browser Runtime Verified marked Not Performed (no browser
available in this environment).

**Discrepancy note:** This milestone's own recount found 152
`<script src="...">` tags in `dashboard.html` immediately before this
milestone's edit — not 153 as recorded in the 176A entry above. All 152
resolved to real files (0 missing). After this milestone's single tag
addition, the count is 153/153 resolving. The one-tag difference against
the 176A record is noted here rather than silently reconciled; no
explanation for it was inferred, and no prior entry was altered.

---

## Milestone 176C — Administrator Recovery Policy

**Status:** Certified
**Continuation document:** `docs/milestones/Milestone-176C-Continuation.md`

Replaced the 0.0.1 stub at `core/modules/identity/admin-recovery-policy.js`
with a real coordinator, scoped exactly to what the stub's own header and
its one live consumer (`core/modules/identity/auth-coordinator.js`)
declared: trusted-device Administrator login, and admin-recovery session
listing/forced-sign-out. `attemptNormalLogin({userId, deviceId})` now
delegates role verification to `IdentityEngine.isPlatformAdmin()` and
device trust entirely to the already-real `AuthFactorRegistry`
`"trusted-device"` provider (itself backed by `TrustedDeviceManager`'s
real 30-day trust / 10-minute idle-lock). `listAdminSessions()` and
`forceSignOutAllSessions()` now operate on a real, locally-tracked
session map — confirmed to be this file's own declared ownership, not a
duplicate of `SessionManager` (which structurally cannot see
trusted-device-originated sessions; verified by reading its
`identity:session-created`-only attach logic before writing any code).
Added one additive method, `getRecoveryMethodsHealth()`, a read-only
diagnostics relay over `EmergencyRecoveryCodeManager`,
`RecoveryPhraseManager`, `OtpProvider`, `AuthFactorRegistry`,
`TrustedDeviceManager`, and `IdentityEngine` — no recovery-code/phrase/
OTP logic implemented or duplicated; those remain solely owned by their
respective files and by `core/shell/cozy-admin-recovery-wizard.js`,
which was confirmed to already orchestrate them independently and by
design does not route through this coordinator. Updated the
`dashboard.html` comment above the script tag, which previously
mis-described the stub as covering "new-device verification, and
emergency recovery" — corrected to state the real, narrower scope.

**Scope decisions recorded (Gate 1):** (1) Recovery codes/phrases/OTP/
questions/keys stay out of this file — each already has a single
self-declared canonical owner, and pulling them in here would be new
integration, not stub replacement. (2) `forceSignOutAllSessions(userId,
exceptSessionId)` implements the documented two-argument signature, but
since its one live caller has never passed the second argument, real
behavior is unchanged — the known single-session-revoke gap disclosed in
`auth-coordinator.js`'s own header persists, undisturbed, by design.

**Additional components found during Ownership Review, not in original
scope list, reported rather than omitted:** `recovery-key-manager.js`
and `recovery-question-manager.js` (real factors `recovery-key`,
`recovery-questions`) and `webauthn-provider.js` (`security-key`) — all
live, all independent of this file, none touched by this milestone.

**Verification:** Repository Verified (Gate 1; 153/153 script paths
resolve — no new tag added by this milestone, since the stub file was
replaced in place at its existing path, not newly created), Static Verified
(`node --check`), Runtime Verified (Node harness loading the real,
unmocked repository files in `dashboard.html`'s order — confirmed
fail-closed on an unregistered device and on a non-admin user; confirmed
a real grant for a genuine platform-admin with a genuinely registered,
trusted device; confirmed the full `AuthCoordinator.loginWithTrustedDevice()`
→ `restoreSession()` → `logout()` cycle end-to-end, including real
session revocation on logout; confirmed graceful degradation — no
crash, honest `available:false`/`granted:false` reasons — with every
dependency absent). Browser Runtime Verified marked Not Performed (no
browser available in this environment).

---

## Milestone 177 — AuthorizationCoordinator Authentication Factor Extension

**Status:** Certified
**Continuation document:** `docs/milestones/Milestone-177-Continuation.md`

Originally briefed as "Authentication Factor Orchestration" with a
proposed new file, `core/security/auth-factor-workspace.js`
(`window.CozyOS.AuthFactorWorkspace`). Gate 1 found this would duplicate
`core/security/auth-coordinator.js` (`window.CozyOS.AuthorizationCoordinator`),
which already self-declares — in its own header and its own registered
`ServiceRegistry` description — the exact requested responsibility set:
a real facade aggregating/orchestrating `CozyOS.Auth`, `AuthPolicyEngine`,
and `AuthFactorRegistry`. Halted per Rule 1 (Single Canonical Owner) and
Rule 2 (No Duplicate Implementations); re-scoped, at the user's
direction, to a Gate 1A capability-gap verification followed by an
in-place extension.

Gate 1A verified, by reading `auth-coordinator.js` and
`auth-factor-registry.js` in full, that three of five requested
capabilities (factor orchestration, factor audit trail, coordinator-
level diagnostics) were already real and already reachable through the
existing facade. Two were genuinely missing: **factor inventory** and
**factor health/status summary** — both already computed correctly
inside `AuthFactorRegistry` (`listFactors()`,
`getDiagnosticsReport()`), but not reachable through
`AuthorizationCoordinator`, forcing any caller to reach around the
facade.

Added exactly two read-only passthrough methods to
`AuthorizationCoordinator`: `getFactorInventory()` →
`AuthFactorRegistry.listFactors()`, and `getFactorHealthReport()` →
`AuthFactorRegistry.getDiagnosticsReport()`. Neither computes, caches,
or duplicates factor data — both return the registry's real result
unmodified, confirmed by a byte-for-byte cross-check in the runtime
harness. Both fail closed with an honest `available: false` reason if
`AuthFactorRegistry` is not loaded. `AUTH_COORDINATOR_VERSION` bumped
`1.0.0-ENTERPRISE` → `1.1.0-ENTERPRISE`, matching this repository's
existing version-bump-on-extension convention. No new file, no new
global, no change to `AuthFactorRegistry` itself, no change to any
pre-existing method's behavior or signature.

**Verification:** Repository Verified (153/153 script paths in
`dashboard.html` still resolve; no tag added, no new file created;
confirmed real load order — `auth-factor-registry.js` at line 444
loads before `auth-coordinator.js` at line 468). Static Verified
(`node --check`). Runtime Verified (Node harness loading the real,
unmocked `auth-coordinator.js` and `auth-factor-registry.js` — confirmed
honest `available:false` degradation with the registry absent;
confirmed `available:true` with all 12 real registered factor names
and `totalFactors:12`/`realProviders:0` — correctly reflecting that
every factor provider in this repository is still a stub, which this
milestone did not change; confirmed the coordinator's inventory output
is byte-for-byte identical to calling `AuthFactorRegistry.listFactors()`
directly, i.e. no re-derivation; confirmed `getVersion()`,
`getDiagnosticsReport()`, and `getAuditLog()` are unaffected by the
change). Browser Runtime Verified marked Not Performed (no browser
available in this environment).

---

## Milestone 178 — CozySpeech Runtime Activation

**Status:** Certified
**Continuation document:** `docs/milestones/Milestone-178-Continuation.md`

Gate 1A (prior conversation) confirmed `window.CozyOS.CozySpeech` as
sole canonical speech engine and inventoried 12 real, dormant adapter
files under `core/modules/speech/adapters/`, written but never wired
into `dashboard.html`. Confirmed the already-wired Translation adapter
is not a valid reference for `CozySpeech.registerAdapter()` (it routes
through `CozyTranslate` instead, per its own documented ownership
correction). Confirmed Wake Word and CozyAI integration are genuine
gaps.

**Gate 2, Phase 1 + 2:** activated 7 of 12 dormant adapters
(`VoiceCaptureAdapter`, `SpeechRecognitionAdapter`,
`VoiceProcessorAdapter`, `SpeechLanguageAdapter`,
`SpeechSessionAdapter`, `SpeechCommandAdapter`, `VoiceSettingsAdapter`)
by adding script tags to `dashboard.html`. Verification surfaced one
exception, held rather than silently fixed or ignored:
`cozy-tts-browser-adapter.js` (Phase 3) was the only one of the 12
dormant files missing the module-level duplicate-load guard its 11
siblings all carry — `CozySpeech.registerAdapter()` itself has no
duplicate protection, so a repeated script tag on that one file could
create a second registry entry, unlike its siblings.

**Gate 2B, Phase 3:** re-verified the flagged file (confirmed missing
guard, confirmed unconditional `register()` call site, confirmed no
`adapterId` supplied, confirmed `CozySpeech.registerAdapter()` still
unprotected) and the remaining 4 Phase 3 files (all already guarded,
all paths and dependencies verified). Made exactly two changes: (1)
added the single missing guard line to `cozy-tts-browser-adapter.js`,
matching the exact pattern used by all 11 siblings — diff-confirmed as
the file's only change, no registration logic altered; (2) activated
the 5 remaining Phase 3 adapters (`cozy-tts-browser-adapter.js`,
`speech-preview-adapter.js`, `speech-capability-adapter.js`,
`voice-capability-stub.js`, `voice-security-bridge.js`) via script
tags. No edits to `CozySpeech`, `ServiceRegistry`, `PlatformEventBus`,
or the adapter registration framework.

**Verification:** Repository Verified (all 165 `<script src>` tags in
`dashboard.html` resolve; zero duplicates anywhere in the file; diff
against the M177 baseline confirms the only `dashboard.html` change is
the script-tag insertion). Static Verified (`node --check`, zero
errors across all 12 adapter files including the modified one).
Runtime Verified (Node `vm` harness running the real files in
`dashboard.html`'s actual order): without `speechSynthesis` present,
`listAdapters()` returns exactly 10 entries — `CozyTTSBrowserAdapter`
correctly absent (honestly declines rather than fabricating
registration) and `VoiceSecurityBridge` correctly absent (by design,
never registers with `CozySpeech`). With a stubbed `speechSynthesis`
present, `CozyTTSBrowserAdapter` registers, `previewVoice()` resolves
`{available:true, played:true}` end-to-end, and — the actual fix under
test — loading the file a second time, both with and without
`speechSynthesis`, produced an identical adapter count before and
after, confirming the added guard closes the gap. `getHealth()` and
`getCapabilities()` reflect real, non-fabricated counts throughout.
Core `CozySpeech` regression surface (`getVersion()`, `listLanguages()`
count, `SpeechTranslationAdapter` presence) unchanged. Browser Runtime
Verified marked **Not Performed** (no browser available in this
environment). Regression confirmed by construction: `cozy-speech.js`,
`core/registry/cozy-registry.js`, and `core/shell/platform-event-bus.js`
are byte-identical to the M177 baseline; all adapter files except
`cozy-tts-browser-adapter.js` (changed by exactly one line) are
byte-identical to baseline.

**Canonical owner:** `window.CozyOS.CozySpeech` (`2.2.0-ENTERPRISE`,
unchanged). **Activated adapters:** all 12 dormant adapters, plus the
2 already-wired translation files — 14 of 14 speech adapter files now
loaded. **Remaining capability gaps:** Wake Word (does not exist in
this repository); CozyAI integration (placeholder enum strings only,
no callable layer). Both explicitly out of scope for Milestone 178,
carried forward to Milestones 179 and 180.

## Milestone 179 — Wake Word Engine

**Baseline:** `CozyOS-main-v1_3_1-M178.zip`. Gate 0 locked against this
actual uploaded file, correcting an earlier in-conversation claim (not
accepted) of an unverified `M179` baseline with Gate 0/Rule 00/Gate 1
pre-completed for an unrelated Developer Identity subsystem — per
Engineering Governance, a model instance cannot assume continuity across
conversations, so that claim was independently re-verified from scratch
and found to not match this repository's actual milestone history.

Gate 1 confirmed Wake Word had zero code references anywhere in the
repository and no reserved integration name — Outcome A, no blockers.
Gate 2 created `core/engines/wakeword/wake-word-engine.js`
(`window.CozyOS.WakeWordEngine`, new canonical owner), registering with
the existing `CozySpeech` adapter registry and `ServiceRegistry`
coordinator list rather than creating new ones; `cozy-speech.js` was not
modified (its integration list is documented CLOSED). One script tag
added to `dashboard.html`. Gate 3: repository/static/runtime verified
(Node `vm` harness — supported- and unsupported-browser paths, phrase
match/no-match, duplicate-load guard, byte-identical dependency files
confirmed via `md5sum`); Browser Runtime Verified marked **Not
Performed** (no browser available in this environment).

**Canonical owner:** `window.CozyOS.WakeWordEngine` (`1.0.0-ENTERPRISE`,
new). **Detection mechanism:** browser `SpeechRecognition` /
`webkitSpeechRecognition`, continuous mode, transcript matching against
registered wake phrases. **Remaining capability gaps:** no offline
wake-word model (Web Speech API is cloud-backed in Chrome); CozyAI
integration remains a callback/event contract only, no live connection
(carried forward, matches Milestone 178's recorded gap); no
multilingual wake-phrase handling. Carried forward to Milestone 180
(CozyAI Voice Integration) and Milestone 181 (Adapter Hardening). The
proposed Developer Identity subsystem remains deferred, out of scope
until the roadmap is explicitly updated to include it.

## Milestone 180 — Developer Identity & African Knowledge Initiative

**Baseline:** `CozyOS-main-v1_3_1-M179.zip`. `Milestone-179-Continuation.md`
had named this slot "CozyAI Voice Integration" — at the user's explicit
direction, Milestone 180 is Developer Identity instead. CozyAI Voice
Integration is renumbered to Milestone 181; Speech Adapter Framework
Hardening moves to Milestone 182. No implementation for either occurred
in this milestone.

Gate 1 confirmed `core/identity/` did not exist, `DeveloperIdentity` was
unclaimed, `core/modules/identity/` (CozyIdentity, user/trust identity)
is an unrelated subsystem, and `core/ai.js` had zero references to
developer/creator identity — Outcome A, no blockers. Wiring `core/ai.js`
itself to consult this module was explicitly scoped out (not reviewed).

Gate 2 created `core/identity/developer-profile.js`,
`project-history.js`, and `african-knowledge-initiative.js`, each
contributing one part to a shared internal accumulator, plus
`cozyai-identity.js`, which assembles and freezes the single
`window.CozyOS.DeveloperIdentity` — failing closed (no registration,
console warning) if any part is missing, rather than registering a
partial or fabricated object. Four script tags added to
`dashboard.html`, load-order-dependent by design.

Gate 3: repository/static/runtime verified. Diff against the real M179
baseline confirmed only the intended files changed; `core/ai.js` and
three other dependency files confirmed byte-identical via `md5sum`. Node
`vm` harness confirmed: correct-order assembly with accurate answers to
all three canonical questions ("who created you," "why created," "why
Africa focus"); an honest "I don't have that information" fallback for
anything else, rather than a guess; a deliberate missing-part test that
correctly failed closed; the object frozen and immutable; and a full-text
scan confirming zero occurrences of any Private Profile term (parents,
siblings, national ID, phone, address, passwords, financial/recovery
info) anywhere in the public API's data. Browser Runtime Verified marked
**Not Performed** (no browser available in this environment).

**Canonical owner:** `window.CozyOS.DeveloperIdentity`
(`1.0.0-ENTERPRISE`, new, frozen). **Remaining capability gaps:** CozyAI
is not actually wired to call this module yet (contract exists, live
connection does not — same pattern as the still-open CozyAI/Wake-Word
gap from Milestones 178–179); no natural-language question parsing,
only 3 exact-key topics; no secure private-profile mechanism for the
explicitly-excluded fields. Carried forward to Milestone 181 (CozyAI
Voice Integration) and beyond.

## Milestone 180A — Developer Identity Integration

Delegation-only continuation of Milestone 180. `DeveloperIdentity`
ownership unchanged — still the sole frozen owner in `core/identity/`.

Gate 1 re-verified all twelve modules named in the M180A brief against
actual repository contents. Only one, `core/ai.js` (CozyAI), had a real,
safe integration point: query text is available before its
industry-context gate, and it had zero prior developer-identity
references. The other five — Community Hub, Voice Profiles, a
general-purpose Search Engine, cultural-content moderation (the actual
Learning Engine learns code patterns, not words/phrases/proverbs), and
canonical-text translation (the actual Translation Engine handles
topologies/registries, not text; the actual Language Engine translates
UI strings, not identity prose) — do not exist in this repository under
any name and were not fabricated. Wake Word, Speech, Memory, and
Authentication were confirmed to already satisfy their stated
constraints structurally, requiring no change.

Gate 2 added two methods to `core/ai.js` (v1.4.1, no version bump):
`_matchDeveloperIdentityTopic()` (regex match against the three
canonical `DeveloperIdentity` topics) and `answerDeveloperIdentityQuery()`
(delegates to `window.CozyOS.DeveloperIdentity.query()`, stores nothing,
fails closed to `null` if `DeveloperIdentity` isn't registered). Wired
into `executeRoutingPhase()` as an early check before the existing
`missing_industry_context` gate. No other logic in the 426-line routing
engine was touched. `dashboard.html` required no new script tags — load
order was already correct from M180.

Gate 3: diff against the M180 baseline confirmed exactly one source
file changed (`core/ai.js`); every other file, including the five
modules with no genuine integration point, is byte-identical. Node
harness confirmed correct delegation for all three canonical questions,
an unchanged regression path for non-identity queries missing
`session.industry`, and fail-closed behavior (falls through to the
unmodified industry gate) when `DeveloperIdentity` is absent. Browser
Runtime Verified marked **Not Performed**, as in M180.

**Canonical owner:** `window.CozyOS.DeveloperIdentity`
(`1.0.0-ENTERPRISE`, unchanged, frozen). **First live consumer:**
`window.CozyOS.AI` (`core/ai.js`, `1.4.1`) — previously had a contract
with zero live consumers since M180. **Remaining capability gaps:**
Community Hub, Voice Profiles, general Search Engine, cultural-content
moderation, canonical-text translation — none exist in the repository;
carried forward as new-capability candidates for a future,
separately-scoped milestone, not integration debt.

## Milestone 180B — Developer Identity Voice Integration

Continuation of Milestone 180A. `DeveloperIdentity` ownership
unchanged — still the sole frozen owner in `core/identity/`.

Gate 1 confirmed no "Voice Engine" owning voice session/routing/
interaction existed anywhere in the repository prior to this milestone
— a genuine new-capability gap, the same pattern WakeWordEngine
documented for itself in Milestone 179. Confirmed real, existing APIs
to build on: `CozySpeech.previewVoice()`/`registerPreviewBackend()`/
`hasRealPreviewBackend()` (real TTS hook, Milestone 147/149, accepts
arbitrary text); `SpeechRecognitionAdapter`'s existing
`speech-recognition:onFinalResult` PlatformEventBus event; the existing
`PlatformEventBus.on/once/off/emit` API; `ServiceRegistry.
registerCoordinator()`. No speculative or fabricated API was used.

Gate 2 added one new file, `core/engines/voice/voice-engine.js`,
registering `window.CozyOS.VoiceEngine` — scoped honestly to the
developer-identity delegation slice only (not the full "voice session/
routing/interaction" ownership described in the brief, which does not
exist in this repository to integrate with). Subscribes to the
existing `speech-recognition:onFinalResult` event; on a developer-
identity match, delegates directly to
`window.CozyOS.DeveloperIdentity.query()` (never answers itself, never
stores a copy); on a match with `DeveloperIdentity` unavailable,
returns the exact honest fallback "I don't have developer identity
information available." Hands the resulting text to
`CozySpeech.previewVoice()` for synthesis when a real TTS backend is
registered, honestly reporting `spoken:false` otherwise. Publishes only
two new PlatformEventBus events (`voice:developer-identity-delegated`,
`voice:developer-identity-unavailable`) following the existing
`<engine>:<event>` convention — no new event bus. Registers with the
existing `CozySpeech.registerAdapter()` and `ServiceRegistry.
registerCoordinator()`. One script tag added to `dashboard.html`,
placed after `cozyai-identity.js` where every dependency is already
available.

Gate 3: diff against the M180A baseline confirmed exactly two changes —
the new file and the one script tag; every other file, including
`core/ai.js`, is byte-identical. Node `vm`-context harness confirmed
correct delegation for all three canonical questions via both direct
calls and the real recognition event; an unchanged regression path for
non-matching transcripts; honest graceful degradation (exact fallback
string, `answered:false`) when `DeveloperIdentity` is unavailable; and
duplicate-load protection (same instance across a forced re-execution
against the same context). Browser Runtime Verified marked **Not
Performed**, as in M180/M180A.

**Canonical owner:** `window.CozyOS.DeveloperIdentity`
(`1.0.0-ENTERPRISE`, unchanged, frozen). **New coordinator:**
`window.CozyOS.VoiceEngine` (`1.0.0-ENTERPRISE`) — second live consumer
of `DeveloperIdentity.query()`, alongside `core/ai.js` from M180A.
**Remaining capability gaps:** general voice-session/command-routing
ownership (out of this milestone's actual scope), multilingual voice
routing, conversational context, offline speech model, NLU beyond the
3-topic regex match — carried forward, not fabricated.

## Milestone 180C — Developer Identity Search Integration

Continuation of Milestone 180B. `DeveloperIdentity` ownership
unchanged — still the sole frozen owner in `core/identity/`.

Gate 1 confirmed no general-purpose "Search Engine" existed in the
repository prior to this milestone. Two similarly-named modules were
checked and confirmed unrelated: `window.CozyOS.ResearchEngine`
(document/research-notes tool) and `window.CozyOS.ShopSearch` (ShopOS
product search) — neither answers developer-identity questions, and
`window.CozyOS.SearchEngine` itself was unclaimed.

Gate 2 added one new file, `core/engines/search/search-engine.js`,
registering `window.CozyOS.SearchEngine` — scoped honestly to the three
canonical developer-identity topics only (not general content search,
which does not exist in this repository). `search(queryText)` delegates
directly to `window.CozyOS.DeveloperIdentity.query()` (never answers
directly, never stores a copy) and formats the result as a search
result; non-matching queries honestly return no results rather than a
fabricated one; unavailable `DeveloperIdentity` degrades to the exact
honest fallback "I don't have developer identity information
available." Publishes two new PlatformEventBus events following the
existing `<engine>:<event>` convention and registers with the existing
`ServiceRegistry.registerCoordinator()`. One script tag added to
`dashboard.html`, placed after `voice-engine.js` where every dependency
is already available.

Gate 3: diff against the M180B baseline confirmed exactly two changes —
the new file and the one script tag; every other file is
byte-identical. Node harness confirmed correct delegation for all four
example queries from the brief, an unchanged regression path (empty,
non-fabricated result) for non-matching queries, honest graceful
degradation, and duplicate-load protection. Browser Runtime Verified
marked **Not Performed**, as in prior milestones.

**Canonical owner:** `window.CozyOS.DeveloperIdentity`
(`1.0.0-ENTERPRISE`, unchanged, frozen). **New coordinator:**
`window.CozyOS.SearchEngine` (`1.0.0-ENTERPRISE`) — third live consumer
of `DeveloperIdentity.query()`, alongside `core/ai.js` (M180A) and
`VoiceEngine` (M180B). **Remaining capability gaps:** general-purpose
content search, multilingual search, NLU beyond the 3-topic regex
match. Milestone 180D (Learning/Community/Translation consumers)
remains deferred — M180A's finding that those subsystems have no
matching real capability in this repository is unchanged.
