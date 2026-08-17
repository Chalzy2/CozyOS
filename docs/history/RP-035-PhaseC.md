# RP-035 — Phase C: ChurchOS Live Moderation Controls

Consolidated, append-only Phase C record, written at Checkpoint 3
(PHC3 — Final Consolidation & Governance Certification) and verified
directly against the actual PHC2 source and test files in this
environment, not copied from prior claims.

## Lineage

```
COS-RP035-PHB     (baseline — Phase B final: SHA-256
                    4ec33dc1ee934f3bd89618ba7bea1823710b200be6231ebb4e6137bf86fbfcb2)
      ↓
COS-RP035-PHC1    (Checkpoint 1 — ChurchOS Live Moderation Foundation)
      ↓
COS-RP035-PHC2    (Checkpoint 2 — Moderation Controls: unmute/slow
                    mode/messages/trusted members/history)
      SHA-256: 826e28898134278e991ba4689b783fba921af85c6db1cfba1acdf59102001eaa
      (this Phase C3 session's baseline — verified twice, matched)
      ↓
COS-RP035-PHC3    (Checkpoint 3 — Final Consolidation & Governance
                    Certification, this record)
```

## Governance gap disclosed (found, not assumed)

Per this checkpoint's own instruction not to trust prior PHC1/PHC2
claims without re-checking the source: **PHC2 has no governance trail
anywhere in this repository.** `LATEST.md`, `HANDOFF.md`, and
`RELEASES.md` contain a Checkpoint 1 (PHC1) entry each, but none
contain any PHC2 / Checkpoint 2 entry, and no
`docs/history/RP-035-PhaseC.md` existed before this session. The
production file `core/modules/ChurchOS/church-live-moderation-controls.js`
and its test suite `church-live-moderation-controls.test.js` do exist
in this baseline and do pass 31/31 when run directly — so PHC2's
*engineering* work is real and present — but its *governance record*
was never written. This checkpoint supplies that record for the first
time rather than treating a prior (nonexistent) PHC2 report as
authoritative.

## Checkpoint 1 — ChurchOS Live Moderation Foundation (summary; full detail in LATEST.md)

New composition `core/modules/ChurchOS/church-live-moderation.js` —
`postComment`/`listComments` (viewer-safe), `hideComment`/
`removeComment` (moderator-gated), `getModerationView`/
`getModerationLog` (moderator-only). Authorization is fail-closed:
session host, real LDCE-role moderator, `IdentityEngine.isPlatformAdmin()`,
or an OrganizationRole holding `moderation:comment-manage` — no
role-string shortcut. Every moderation event's `propagationState` is
always `"QUEUED"`, never `"SENT"` (no repository transport can confirm
delivery to an N-member roster). 20/20 tests — re-run directly in this
session: **20/20 PASS.**

## Checkpoint 2 — Moderation Controls (re-verified directly in this session, not restated)

New file `core/modules/ChurchOS/church-live-moderation-controls.js`
(582 lines), additive to Checkpoint 1. Verified directly against
source:

- **Mute** — a thin wrapper composing the real, unmodified
  `LDCESessionEngine.forceMuteParticipant(sessionId, actorId, targetUserId)`.
  No internal mute-authorization logic is duplicated; the real
  function's own rank gate is relied on as-is.
- **Moderator unmute (Option B)** — a genuinely new, separately
  authorized capability layered on top of `forceMuteParticipant()`,
  which itself remains exactly as Checkpoint 1 / LDCE left it —
  one-way, mute-only. Unmute-by-moderator is new surface area, not a
  silent change to the original primitive.
- **Kick** — composes the real, unmodified
  `LDCESessionEngine.leaveSession(sessionId, targetUserId, { actorId })`,
  which remains actor-checked. No parallel kick mechanism was added.
- **Slow mode, moderator messages, trusted members, moderation
  history** — session-scoped, real authorization (host / LDCE
  moderator / platform admin / org-role holder), verified by
  dedicated tests below.
- **Propagation honesty** — every event's `propagationState` is
  `"QUEUED"`, matching Checkpoint 1's own disclosed limitation;
  `"SENT"` never appears.

**Authorization truth table (from source + tests, not assumed):**
mute and kick are gated *entirely* by LDCE's native rank system — an
org-role holder who is not an LDCE-promoted moderator cannot mute or
kick, confirmed by a dedicated test (`an org-role holder ... CANNOT
mute or kick — those two gates are entirely LDCE-native and do not
recognize org-role`). The five PHC2-native capabilities (unmute, slow
mode, messages, trusted members, history) recognize a broader set:
host, LDCE moderator, platform admin, or an org-role holder of
`moderation:comment-manage` in the *same* organization as the host —
org-role authorization is explicitly refused across organizations
(dedicated test). Platform Admin and Organization-Role holders are
therefore **not** equivalent to "LDCE moderator" for mute/kick, but
**are** each independently sufficient for the five PHC2-native
capabilities.

**Tests — re-run directly in this session, not quoted from a prior
report: 31/31 PASS.**

## Checkpoint 3 — Final Consolidation & Governance Certification (this record)

No new engines, no production-code changes. Scope limited to:
governance files (`LATEST.md`, `HANDOFF.md`, `RELEASES.md`), this
history record, and repair-registry entries where evidence supports
them. Full detail, byte-identity audit, and regression results are in
`LATEST.md`'s Checkpoint 3 entry and this session's certification
report.

## Known limitations carried forward (pre-existing, not introduced by Phase C)

Same 55 pre-existing test failures documented since Phase B:
`document-understanding` (22), `duplicate-detection` (24), and one
each in `modules/live/ourcozy-live.test.js`, `core/engines/scene`,
`core/engines/audio`, `core/engines/media` (pipeline-manager),
`core/engines/playback`, `core/engines/camera` (both copies), and
`core/bridge` (both files) — none touch ChurchOS or Phase C code.
Additionally, 14 browser/Playwright-driven dashboard tests across the
repository did not complete within this session's per-file timeout
(no headless-browser environment available here); this is a testing-
environment limitation, not a recorded pass or fail, and is disclosed
rather than counted either way.

## Checkpoint 4 — Prayer Interaction (this record)

Baseline: `COS-RP035-PHC3.zip`, SHA-256
`18728c333dcca5668e648987c4dba4f9848fd4de3145602f716ff7adb2a5b4ab`,
verified twice in this session, matched.

**Rule 29 audit (performed before writing any code):** grepped the
full repository for prayer/prayer-request/prayerRequest/amen/
testimony/offering/altar and related terms, and inspected every
ChurchOS module, LDCE, IdentityEngine, OrganizationRole,
ChurchLiveModeration, CozyConversation, CozyMemory, and ServiceRegistry.
Confirmed no prayer-request or Amen engine exists anywhere —
`living-worship-player.js` (C004) had already disclosed this itself
("no notes engine, no prayer-request engine"). PRAYER INTERACTION is
genuinely MISSING / NEW CAPABILITY, not a duplicate.

**New file:** `core/modules/ChurchOS/church-prayer-interaction.js`.
Composes the real `ldce-session-engine.js` roster, `identity-engine.js`
(`getUser`/`isPlatformAdmin`), `organization-role.js` (`listRoles`),
and reuses `church-live-moderation.js`'s exported
`MODERATION_MANAGE_PERMISSION` constant as-is — no second permission
engine. Authorization is the identical evidence-based, fail-closed
mechanism established at Checkpoints 1/2/B2 (host, real LDCE
moderator, platform admin, or a same-organization OrganizationRole
holder of the reused permission).

**Prayer requests:** `submitPrayerRequest`/`listVisiblePrayerRequests`/
`getModerationQueue`/`markPrayedFor`/`archiveRequest`/`removeRequest`/
`getModerationLog`. Mandatory fields: requestId, sessionId,
authorUserId, createdAt, status, visibility, propagationState. States:
QUEUED/VISIBLE/IN_REVIEW/PRAYED_FOR/ARCHIVED/REMOVED. Visibility:
PRIVATE/MODERATOR_ONLY/SESSION/PUBLIC, defaulting to the privacy-safe
PRIVATE. `propagationState` is always `"QUEUED"`, matching Checkpoints
1/2's own disclosed limitation — no real N-member delivery-confirmation
transport exists in this repository (`CAPABILITY_UNAVAILABLE`,
repository-wide, deferred to Phase F).

**Amen:** `pressAmen`/`getAmenCounts`. A real, per-(requestId, userId)
deduplicated `localAmen` count; `confirmedAmen` is always honestly 0 —
no cross-client synchronization transport exists to justify any other
value.

**Tests — run directly in this session: 38/38 PASS**, covering
creation, required-field validation, session ownership, participant/
moderator authorization (host, LDCE-moderator, platform-admin, org-role,
cross-org refusal, unknown-requester refusal), all four visibility
levels, all three state transitions, offline/QUEUED-only propagation,
Amen creation/duplication/local-vs-confirmed, moderation-log
integration, and malformed/empty-input handling.

**Regression — run directly in this session:**
- PHC1 (`church-live-moderation.test.js`): 20/20 PASS.
- PHC2 (`church-live-moderation-controls.test.js`): 31/31 PASS.
- PHB1 (`church-live-attendance.test.js`): 12/12 PASS.
- PHB2 (`church-attendance-geography.test.js`): 14/14 PASS.
- Full repository (`node --test`, all 82 `*.test.js` files, individual
  per-file run): 236 subtests, 167 pass, 55 fail, 14 cancelled
  (browser/Playwright dashboard tests — no headless-browser
  environment available in this session). The 55 failures are the same
  pre-existing set disclosed since Phase B (document-understanding,
  duplicate-detection, `modules/live/ourcozy-live.test.js`'s broken
  require path, scene/audio/media-pipeline/playback/camera(×2)/
  bridge(×2)). **New regressions: 0.**

**Byte-identity audit, PHC3 → PHC4:** current tree diffed against a
fresh extraction of `COS-RP035-PHC3.zip` in this session. Exactly 2
files added: `core/modules/ChurchOS/church-prayer-interaction.js`,
`core/modules/ChurchOS/test/church-prayer-interaction.test.js`. 0
files modified, 0 files removed. PHB/PHC1/PHC2/PHC3 production files
are byte-identical.

**Governance:** this checkpoint's implementation is kept small per
instruction — short additions to `LATEST.md`, `HANDOFF.md`,
`RELEASES.md`, and this history file only. Full Phase-C consolidation
is deferred to the final PHC checkpoint, per the PHB3 precedent.

**Known limitations, disclosed:** no offering/giving interaction (PHC5
scope, requiring its own Rule 29 audit); prayer request `text` is
stored as user-provided content only, no translation performed or
claimed; `confirmedAmen` can never be anything but 0 until a real
cross-client sync transport exists; 14 browser/Playwright tests
untested this session (pre-existing environment limitation, not new).

## Checkpoint 5 — Offering Interaction (this record)

Baseline: `COS-RP035-PHC4.zip`, SHA-256
`f9c4e2800e16df33fb6c438d7d47036da8e27ef4fbf952c8724b9deb326a9c27`,
verified twice in this session, matched.

**Rule 29 audit (performed before writing any code):** grepped the
full repository for offering/donation/giving/payment/M-Pesa/Airtel/
transaction/QR/offline-queue and related terms, and inspected every
ChurchOS module, LDCE, IdentityEngine, OrganizationRole,
ChurchLiveModeration, church-prayer-interaction.js, and
`modules/mpesaAgent.js`/`modules/billingEngine.js`. Confirmed no
offering/donation *interaction* engine exists anywhere —
`church-worship-session.js`/`worship-mode-coordinator.js` only use
"offering" as a service-phase label string, and PHC4 had already
explicitly deferred offering/giving to this checkpoint.
`modules/mpesaAgent.js`/`modules/billingEngine.js` are real files but
are confirmed-unrelated legacy dashboard/subscription modules — no
real M-Pesa network call, no real per-transaction payment processing
in either. OFFERING INTERACTION is genuinely MISSING / NEW CAPABILITY,
not a duplicate, and because no real payment provider exists, this
checkpoint is an intent/queue/status layer only — never a payment
gateway.

**New file:** `core/modules/ChurchOS/church-offering-interaction.js`.
Composes the real `ldce-session-engine.js` roster, `identity-engine.js`
(`getUser`/`isPlatformAdmin`), `organization-role.js` (`listRoles`),
and reuses `church-live-moderation.js`'s exported
`MODERATION_MANAGE_PERMISSION` constant as-is — no second permission
engine. Authorization is the identical evidence-based, fail-closed
mechanism established at Checkpoints 1/2/4/B2 (host, real LDCE
moderator, platform admin, or a same-organization OrganizationRole
holder of the reused permission).

**Offering intents:** `createOfferingIntent`/`listMyOfferingIntents`/
`cancelOfferingIntent`/`getOfferingQueue`/`getAggregateOfferingView`/
`getAuditLog`. Mandatory fields: offeringId, sessionId, giverUserId,
createdAt, status, propagationState. Declared lifecycle: INTENT_CREATED/
LOCAL_QUEUED/QUEUED/SUBMITTED/CONFIRMED/FAILED/CANCELLED — only
LOCAL_QUEUED (creation) and CANCELLED (explicit, audited) are ever
actually reachable. QUEUED/SUBMITTED/CONFIRMED/FAILED are
`CAPABILITY_UNAVAILABLE`: no real payment provider or submission
transport exists in this repository, so this file never fabricates a
payment confirmation from a button press, local record, or the
existing (unrelated) mpesaAgent/billingEngine modules. `propagationState`
is always `"QUEUED"`, matching Checkpoints 1/2/4's own disclosed
limitation.

**Privacy:** an individual offering record (giver identity, amount,
currency, category, note) is visible only to its own giver and to an
authorized moderator/admin — never to any other ordinary participant,
at any status. `getAggregateOfferingView()` is the only cross-giver
surface: moderator/admin-gated, returns only `totalIntents`,
`sumByCurrency`, and `countByCategory` — zero giver-identifying
fields, zero individual amounts, zero offeringIds. Cancelled records
are excluded from the aggregate.

**Duplicate-submission protection:** a caller may supply an idempotent
`clientRequestId`; a repeated `createOfferingIntent()` call from the
same giver, same session, same `clientRequestId` returns the original
record (`status: "DUPLICATE"`) rather than creating a second one — a
real, verifiable per-(sessionId, giverUserId, clientRequestId) dedup.

**Tests — run directly in this session: 39/39 PASS**, covering
creation, required-field validation, malformed input (zero/negative/
non-numeric/non-finite amount), duplicate-submission protection
(same and different giver), privacy (owner-only read, aggregate never
leaking identity), unauthorized access (ordinary participant, unknown
requester, cross-org role holder), authorized access (host, platform
admin, same-org role holder), cancellation (owner, moderator-on-
behalf-of, refusal for non-owners, already-cancelled rejection,
unknown-id NOT_FOUND, auditable event log), no-fabricated-confirmation
assertions, repeated-submission-without-corruption, and coexistence
with the real PHC4 prayer-interaction stack on the same session.

**Regression — run directly in this session:**
- PHC1 (`church-live-moderation.test.js`): 20/20 PASS.
- PHC2 (`church-live-moderation-controls.test.js`): 31/31 PASS.
- PHC4 (`church-prayer-interaction.test.js`): 38/38 PASS.
- PHB1 (`church-live-attendance.test.js`): 12/12 PASS.
- PHB2 (`church-attendance-geography.test.js`): 14/14 PASS.
- Full repository (`node --test`, all 83 `*.test.js` files, individual
  per-file run): 206 pass, 56 fail, 13 timed out (browser/Playwright
  dashboard tests — no headless-browser environment available in this
  session; this session's harness times these out rather than marking
  them explicitly cancelled, a harness-categorization difference from
  PHC4's session, not a new test category). 55 of the 56 fails are the
  same pre-existing set disclosed since Phase B (document-
  understanding, duplicate-detection, `modules/live/ourcozy-live.test.js`,
  scene/audio/media-pipeline/playback/camera(×2)/bridge(×2)); the
  56th (`cozy-live-connectivity-dashboard-browser.test.js`) is the
  same pre-existing browser-dependent test PHC4's session grouped
  under "cancelled" — here it fails fast instead of hanging. **New
  regressions: 0.**

**Byte-identity audit, PHC4 → PHC5:** current tree diffed against a
fresh extraction of `COS-RP035-PHC4.zip` in this session. Exactly 2
files added: `core/modules/ChurchOS/church-offering-interaction.js`,
`core/modules/ChurchOS/test/church-offering-interaction.test.js`. 0
files modified, 0 files removed. PHB/PHC1/PHC2/PHC3/PHC4 production
files are byte-identical.

**Governance:** this checkpoint's implementation is kept small per
instruction — short additions to `LATEST.md`, `HANDOFF.md`,
`RELEASES.md`, and this history file only. Full Phase-C consolidation
remains deferred to a future final PHC checkpoint.

**Known limitations, disclosed:** no real payment provider integration
of any kind (by design — this checkpoint's entire boundary); offering
`note`/`category` are stored as user-provided content only, no
validation against any fixed enum; `QUEUED`/`SUBMITTED`/`CONFIRMED`/
`FAILED` remain permanently unreachable until a genuine payment
provider is integrated in a future checkpoint; the remaining ChurchOS
interaction surface beyond prayer and offering is not yet scoped; 13
browser/Playwright tests untested this session (pre-existing
environment limitation, not new).

---

## Checkpoint 6 — ChurchOS Live Multi-Language Translation Integration

**File:** `core/modules/ChurchOS/church-live-translation-interaction.js`

**Rule 29 ownership audit.** Grepped the full repository for every
term the checkpoint prompt listed (language registries/packs,
translation engines/providers, live translation, speech translation,
speech-to-text, text-to-speech, captions, subtitles, locale/language
selection/preference, language detection, multilingual live,
translation queue/cache/synchronization) and read every match's actual
source before writing any code.

**Confirmed, real, composed — not duplicated:**
- `core/modules/communication/ldce-session-engine.js` —
  `getSession()`, `getParticipant()`, `setParticipantLanguage()`. This
  IS the real viewer-language mechanism; no second preference store
  was created.
- `core/modules/communication/ldce-caption-engine.js`
  (`LDCECaptionEngine`) — the real, already-wired live pipeline: real
  browser ASR via `SpeechRecognitionAdapter` for the speaker's source
  caption, then real per-target-language translation via
  `SpeechTranslationAdapter` for every other language actually present
  in the live roster (`Array.from(new Set(roster.map(p=>p.language)...))`
  — one `caption-translated` event per distinct roster language,
  confirmed by direct source read).
- `core/modules/speech/adapters/speech-translation-adapter.js`
  (`SpeechTranslationAdapter`) and
  `core/modules/speech/adapters/speech-translation-provider.js`
  (`SpeechTranslationProviders`) — the real translation execution
  chain. `SpeechTranslationProviders` auto-registers a real
  browser-native provider only when the browser genuinely exposes the
  experimental on-device Translator API (`self.Translator`); no cloud
  provider is bundled anywhere in this repository. Every `translate()`
  call is real or explicitly `isReal:false` — never fabricated.
- `core/modules/translate/cozy-translate.js` (`CozyTranslate`) — real
  translation *directory/orchestrator* only (its own header: "0% Text
  manipulation or string translation"). Read only, via
  `getSupportedTargetLanguages()`, to determine whether LDCE's own
  validation will accept a given code today. Never written to by this
  file.
- `core/modules/intelligence/language-packs/cozy-language-pack-registry.js`
  (`CozyLanguagePacks`) — the real RP-030 13-identity container. Read
  only, via the frozen `DEFAULT_IDENTITIES` export, as ChurchOS's
  candidate list of selectable language identities. Its own header
  explicitly disclaims translation capability; this file never treats
  a `DEFAULT_IDENTITIES` entry as proof translation exists for that
  language.

**A genuine, disclosed divergence found by this audit (not smoothed
over):** `SpeechTranslationAdapter` seeds `CozyTranslate`'s real
source/target language sets from its own `SEED_LANGUAGES` (15 codes:
`sw, luo, ki, kam, kln, luy, mas, so, lg, am, yo, ha, zu, en, fr`) — a
different list from `CozyLanguagePacks`' 13 `DEFAULT_IDENTITIES`
(`en, sw, fr, ar, so, ru, zh, ha, yo, luo, ki, kam, zu`). Arabic (`ar`)
and Russian (`ru`) are registered ChurchOS language identities that
are in neither `SEED_LANGUAGES` nor `CozyTranslate`'s 5 built-in
defaults (`en, sw, zh, es, fr`) — once `CozyTranslate` is actually
seeded, LDCE's own real language validation genuinely rejects `ar`/
`ru` as a viewer-selected language. `getLanguageCapabilities()`
queries `CozyTranslate.getSupportedTargetLanguages()` live and reports
`selectable` per language accordingly, rather than assuming all 13
registered identities pass through. Verified directly by test
(`the disclosed CozyLanguagePacks/CozyTranslate seed-list divergence
is honestly surfaced`).

**Not created, on purpose:** no `ChurchTranslationEngine`, no second
language registry, no second translation provider/cache, no second
speech-recognition engine, no second session-identity system, no
second caption engine.

**Public surface:** `getLanguageCapabilities()`,
`selectViewerLanguage(sessionId, actorUserId, languageId)`,
`getMyLanguage(sessionId, actorUserId)`,
`startLiveTranslationSource(sessionId, actorUserId, speakerUserId,
{sourceLanguage})`, `stopLiveTranslationSource(sessionId, actorUserId,
speakerUserId)`, `getTranslationAvailability(sessionId,
requesterUserId)`, `subscribeToLiveCaptions(sessionId,
requesterUserId, handler)`.

**Authorization — evidence-based, fail-closed, no new authorization
system:** viewer language read/select is self-only
(`actorUserId`/`requesterUserId` must be the real session member whose
own record is being read/changed, verified via
`LDCESessionEngine.getParticipant(sessionId, actorId, actorId)`).
Start/stop captioning is self-only (`actorUserId === speakerUserId`) —
captioning is inherently a self-action on one's own microphone, no
moderator/admin escalation was introduced. Availability and caption
subscription require any real session member (host, or a genuinely
"joined" LDCE participant) — a non-member gets `NOT_AUTHORIZED`, never
a partial stream.

**Capability honesty:**
- `registered` (RP-030 fact) / `selectable` (live `CozyTranslate` fact)
  / `translationSupported` (infra-composed fact) /
  `translationAvailableNow` (a real provider is actually registered in
  this runtime) are four separate, never-collapsed facts per language.
- `translatedAudio: "CAPABILITY_UNAVAILABLE"` — fixed constant; speech-
  to-speech synthesis confirmed absent everywhere in this repository
  (`ldce-caption-engine.js`'s own header lists it explicitly out of
  scope).
- `broadcast: "CAPABILITY_UNAVAILABLE"` — fixed constant; the existing
  Section 16 boundary (no SFU/CDN) is unchanged, re-stated not
  re-derived.
- `SOURCE_LANGUAGE_DETECTION_UNAVAILABLE` — `startLiveTranslationSource()`
  requires an explicit, non-empty `sourceLanguage` string; a missing
  one is rejected with this constant, never defaulted. M388 Engine 2's
  real automatic language detector exists but is wired to a different,
  unrelated live system (`cozy-live.js`/Section 16), not to LDCE —
  composing it into LDCE would be a genuinely new integration, not
  assumed here.

**Privacy:** `subscribeToLiveCaptions()`'s relay deliberately drops the
real `speakerUserId` field from LDCECaptionEngine's own
`caption-final`/`caption-translated` events before ever calling a
subscriber's handler — verified directly by test (`speakerUserId never
leaks into the relayed caption/translation events`). No participant
roster, geographic, moderation, prayer, or offering data is read or
exposed by any function in this file.

**Tests — run directly in this session: 28/28 PASS**, covering module
registration, the fixed capability constants, the 13-language
capability matrix (including the Arabic/Russian divergence and the
"no fabricated `translationAvailableNow` without a real provider"
case), viewer language selection (self-only, unregistered-language
rejection, CozyTranslate-rejected-language forwarding, cross-
participant isolation, non-member rejection, unknown-session
rejection), source language (explicit-required, self-only-start,
missing-source rejection), captions (real caption-final acceptance,
session-scoping, non-member rejection), translation (real registered-
provider dispatch with distinct source/target, honest unavailable
state with no fabricated output), availability (honest forwarded
state, non-member rejection), duplicate-event determinism,
unsubscribe, privacy (no `speakerUserId`/`participantId`/`userId`
leakage), broadcast honesty (no unlimited-viewer claims), and
coexistence with the real, unmodified PHB1/PHB2/PHC1/PHC2/PHC4/PHC5
production stack on the same session.

**Harness disclosure:** `IdentityEngine` and `CozyConversation` stubbed
identically to prior checkpoints' own disclosed stubs.
`SpeechRecognitionAdapter` stubbed at its documented public contract
only (`on`/`start`/`stop`/`isActive`/`isReal`) — a genuine browser-API
wrapper with no Node equivalent; `LDCECaptionEngine`, the real
production logic under test, is never stubbed. No browser Translator
API exists in Node and no cloud provider is bundled in this
repository; the real-provider test path registers a disclosed,
explicit test provider through `SpeechTranslationProviders`' own real,
public `register()` API — the same extension point a genuine provider
would use — so `SpeechTranslationProviders`, `SpeechTranslationAdapter`,
`CozyTranslate`, and `LDCECaptionEngine` all run their real logic
against a real registered provider.

**Regression — run directly in this session:**
- PHB1 (`church-live-attendance.test.js`): 12/12 PASS.
- PHB2 (`church-attendance-geography.test.js`): 14/14 PASS.
- PHC1 (`church-live-moderation.test.js`): 20/20 PASS.
- PHC2 (`church-live-moderation-controls.test.js`): 31/31 PASS.
- PHC4 (`church-prayer-interaction.test.js`): 38/38 PASS.
- PHC5 (`church-offering-interaction.test.js`): 39/39 PASS.
- PHC6 (`church-live-translation-interaction.test.js`): 28/28 PASS.
- Full repository (`node --test`, all 84 `*.test.js` files, individual
  per-file run, 84 = the PHC5 baseline's 83 plus this checkpoint's own
  test file): 59 files fully passing; 11 files with real failures (55
  individual failing test cases — the same pre-existing set disclosed
  since Phase B: `document-understanding.test.js` (22),
  `duplicate-detection.test.js` (24), `modules/live/ourcozy-live.test.js`
  (1), and the scene/audio/media-pipeline/playback/camera(×2)/bridge(×2)
  files (1 each)); 14 files timed out (browser/Playwright dashboard
  tests, no headless-browser environment available this session — one
  more than PHC5's disclosed 13, because
  `cozy-live-connectivity-dashboard-browser.test.js` timed out here
  rather than failing fast as it did in PHC5's session; PHC5's own
  record already disclosed this exact file's fail-vs-timeout
  classification as a harness-categorization difference across
  sessions, not a new failure category). **New regressions: 0.**

**Byte-identity audit, PHC5 → PHC6:** current tree diffed against a
fresh extraction of `COS-RP035-PHC5.zip` in this session. Exactly 2
files added:
`core/modules/ChurchOS/church-live-translation-interaction.js`,
`core/modules/ChurchOS/test/church-live-translation-interaction.test.js`.
0 files modified, 0 files removed. PHB/PHC1/PHC2/PHC3/PHC4/PHC5
production files are byte-identical.

**Mid-checkpoint recoverable ZIPs, this session:**
`COS-RP035-PHC6-MID.zip` (created immediately after PHC6 tests first
reached 28/28, before any long-running work), SHA-256
`b92b42cac6c8ce0453fe81be34e41ce1a93c58cdb5dddb013db5a3b681e7f2a3`
(verified twice, matched); `COS-RP035-PHC6-VERIFIED.zip` (created
after the PHC5→PHC6 byte-identity audit passed, before governance
edits), SHA-256
`3bc26ce6b2efc56193398570d6491fdd4f19d5808b3e9ee1d6592a5ee17e70fe`
(verified twice, matched).

**Governance:** this checkpoint's implementation is kept small per
instruction — short additions to `LATEST.md`, `HANDOFF.md`,
`RELEASES.md`, and this history file only.

**Known limitations, disclosed:** no translated-audio (speech-to-
speech synthesis) capability anywhere in this repository — future
scope only, once a real synthesis provider exists. No SFU/CDN
broadcast transport — translation operates strictly across LDCE's
real, roster-bounded session model. Automatic source-language
detection is not integrated into LDCE (it exists, real, in M388 Engine
2, but wired to the unrelated `cozy-live.js`/Section 16 system) — a
speaker must always supply their source language explicitly. Arabic
and Russian are registered ChurchOS language identities that are
genuinely not selectable once `CozyTranslate` is seeded by
`SpeechTranslationAdapter` — this is a real, disclosed repository
constraint, not something this checkpoint introduces or can silently
fix without either registering those codes with `CozyTranslate` (a
future, separately-scoped change) or accepting the gap. No real
browser Translator API was available in this session's Node test
environment — the real-provider translation path was verified end-to-
end using a disclosed, explicitly-registered test provider through
`SpeechTranslationProviders`' own real public API, not a stub of the
production translation logic itself. 14 browser/Playwright tests
untested this session (pre-existing environment limitation).
