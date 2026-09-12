# CP8 Checkpoint: Markdown Governance + Owner Voice Onboarding + Login Gate Timing/Sync + Single-Voice Startup

**Checkpoint name:** CozyOS-CP8-Living-Login-Gate-And-Governance-Checkpoint
**Created:** 2026-08-28
**Built from:** `CozyOS-CP7-Admin-User-Dashboard-Routing-Checkpoint.zip` (the last packaged checkpoint)

## Scope — four distinct bodies of work, all completed and verified since CP7

This checkpoint packages everything done since CP7 in one coherent save
point, per instruction not to leave verified work uncheckpointed. Each
piece is independently described below with its own verification.

---

## 1. Markdown Governance — active-documentation 10-slot rule

**Removed** (verified empty, zero references beyond one stale/tolerant
scan-snapshot manifest): `core/docs/API_REFERENCE.md`, `CHANGELOG.md`,
`DATABASE_SCHEMA.md`, `MODULE_STRUCTURE.md`, `ROADMAP.md`,
`SECURITY_MODEL.md`.

**Edited:** `docs/governance/Engineering-Governance-v1.0.md` — appended
the permanent 10-active-slot rule as a new section, in place. No new
Markdown file created. All 44 protected Builder Rules/Knowledge files,
all historical/checkpoint/milestone/audit records, all 4 module
READMEs, and 7 flagged ambiguous real-content docs were confirmed
byte-identical/untouched at the time.

## 2. Owner Voice — first-user onboarding

**`core/modules/identity/identity-engine.js`** — `register()` now
computes and returns `isFirstUser` (the same `this.#users.size === 0`
check already used for the admin-bootstrap decision, hoisted rather
than duplicated).

**`core/modules/identity/onboarding-voice-core.js`** (new) — pure
`decideOnboardingVoice({isFirstUser, soundEnabled, ownerVoiceAvailable})`,
strict-boolean, fails safe to no forced voice on anything malformed.

**`core/modules/speech/voice-manager.js`** — added `"onboarding"` to the
existing `CONTEXTS` whitelist (additive).

**`login.html`** — on first-user registration, persists Charles as the
`"onboarding"`-context voice via the real `VoiceManager.setContextVoice()`.
Deliberately does **not** speak a new confirmation line — doing so would
have played "Welcome to CozyOS" twice in a row (once here, once on the
very next page's Login Gate), which the spec explicitly prohibits.

## 3. Login Gate — retiming, real audio/visual sync, Living continuity

**`core/shell/startup-orchestrator.js`** — `preRevealDelayMs` default
500ms → 1500ms (Stage 1, Living Green Opening, now authoritatively
0.0–1.5s).

**`core/shell/launch-sequence.js`**:
- Retimed `LOGO_STAGE_MS`/`GLOW_FADE_MS` (3000/1000 → 1000/500, Stage 2
  now 1.5–3.0s) and `LETTER_STAGE_MS` (3000 → 800, Stage 3 now
  3.0–3.8s); `TITLE_HOLD_MS` 400 → 0 so ABOVE ONLY begins exactly at
  the 3.8s mark. `TOTAL_DURATION_MS` (30000) and the dynamic
  "remaining time" hold formula were left untouched — they already
  self-adjust to any stage retiming.
- `computeAboveOnlyPlan()` now accepts the real, measured audio
  duration (from `LivingSounds.play()`'s new `durationMs`) and drives
  the fade/disappear timers off it directly — eliminating the ~1.0–1.3s
  audio-bleed-past-visual gap the CP6.x-era investigation identified.
  Falls back to the original fixed 9000/10000ms plan whenever no real
  duration is available (missing asset, autoplay blocked, muted), and
  guards against an implausible/corrupt duration reading stalling the
  whole sequence.
- Living Background reveal (`revealLiveBackground()`/`activateLighting()`)
  moved from *after* voice+motto to *Stage 2* — confirmed via source
  inspection to be a pure CSS opacity flip on a canvas that has been
  rendering continuously since sequence start, so this makes the
  Living environment visible throughout the whole intro without any
  restart/recreate/reload.
- Per-letter and ABOVE ONLY particle response wired via the existing
  `LivingParticles.setGlow()` API (composing, not replacing, the only
  per-moment intensity control that engine exposes). **Found and fixed
  a real bug during testing**: a pending per-letter glow-revert timer
  could fire just after ABOVE ONLY begins and stomp its own elevated
  glow — fixed by cancelling it when the stage starts.

**`core/shell/launch-sequence.css`** — ABOVE ONLY's existing
scale-in-place transition now also carries a `translateY(-25vh)` rise,
composed into the same single transform transition (not a second,
competing animation) — grows and rises as one movement, per spec,
while remaining the same gold "ABOVE ONLY" text/concept (never renamed
or replaced).

**`core/living/cozy-living-sounds.js`** — `play()`'s return value gains
`durationMs` (real `HTMLMediaElement.duration`, null if unavailable);
new `onEnded(eventName, callback)` method. Both additive,
backward-compatible.

**Known, disclosed, unfixable limitation:** the registered
`logo-chime.mp3` and `typing-click.mp3` assets do not exist anywhere in
this repository (confirmed by a full-repo audio-file search). Per
explicit instruction not to invent missing audio assets, these remain
honest no-ops — the typing/logo sound *calls* are correctly wired, but
no sound plays until a real asset is provided.

## 4. Single-Voice Startup Integration

`launch-sequence.js`'s three voice functions (`playStartupVoice`,
`playMottoVoice`, `playAboveOnlyVoice`) previously resolved
`currentLaunchVoiceProviderId()` independently per call. Now resolved
**once** (`ACTIVE_VOICE_PROVIDER_ID`) for the whole sequence.
`IS_OWNER_VOICE` gates whether the real, pre-recorded
`welcome`/`above-only` `.m4a` clips (Owner Voice recordings, not
re-synthesizable in another voice) are used at all: when a different
(AI) voice is selected for the `"startup"` context, those recordings
are skipped entirely and all three phrases route through
`CozySpeech`/`VoiceManager` with that same one provider — never mixing
Owner Voice and an AI voice within one run. No new voice engine,
registry, or timing system was created; this composes
`VoiceManager.setContextVoice()`/`getContextVoice()` and
`CozySpeech.previewVoice()`, unchanged.

---

## Files changed (exact scope, diffed by hash against CP7)

```
EDITED:
  core/shell/startup-orchestrator.js
  core/shell/launch-sequence.js
  core/shell/launch-sequence.css
  core/living/cozy-living-sounds.js
  core/modules/speech/voice-manager.js
  core/modules/identity/identity-engine.js
  core/shell/tests/launch-sequence-above-only.test.js
  login.html
  docs/governance/Engineering-Governance-v1.0.md

NEW:
  core/modules/identity/onboarding-voice-core.js
  core/modules/identity/test/onboarding-voice-core.test.js

REMOVED:
  core/docs/API_REFERENCE.md
  core/docs/CHANGELOG.md
  core/docs/DATABASE_SCHEMA.md
  core/docs/MODULE_STRUCTURE.md
  core/docs/ROADMAP.md
  core/docs/SECURITY_MODEL.md
```

```
$ md5sum core/shell/startup-orchestrator.js
203ea9bb0fc20282ba216bc70835fcea
$ md5sum core/shell/launch-sequence.js
281bca9588ed2ae26fd31146582e1fe7
$ md5sum login.html
bccaedd460d50633dc500a5f211f431f
$ md5sum core/living/cozy-living-sounds.js
5210b4e4afe726ba739e8ecf3f12f05a
$ md5sum core/shell/tests/launch-sequence-above-only.test.js
125a6f3ad4acbbdfd363fa3dbbf0cf3a
$ md5sum core/modules/speech/voice-manager.js
f523b717682705de710f9cc0f5dd6554
$ md5sum core/modules/identity/onboarding-voice-core.js
0920352b3c341afe8c49ac26c1de0fba
$ md5sum core/shell/launch-sequence.css
ab980e97b3f9c3002b1fe85fa1257c9d
$ md5sum core/modules/identity/identity-engine.js
bf625e1e31cefc8b6cd0c1d392f3c501
$ md5sum docs/governance/Engineering-Governance-v1.0.md
7a0b91f5603909a77360fb60068e6cdc
$ md5sum core/modules/identity/test/onboarding-voice-core.test.js
27582d429cbe080e6ba065bde40bd131
```

## Security-critical files confirmed byte-identical to CP7 (hash-verified)

`auth-coordinator.js` (both copies), `admin-gate-core.js`,
`static-boundary-server.js`, `admin-recovery-policy.js`,
`login-decision-engine.js`, `server/webauthn-rp/server.js` — none were
touched by any of the four bodies of work above.

## Test results (all run this session)

| Suite | Result |
|---|---|
| `core/shell/tests/launch-sequence-above-only.test.js` (Login Gate + Single-Voice, extensively updated/extended) | **29/30** — 1 pre-existing failure (a CSS width assertion that never matched the real markup; present on the untouched CP7 baseline too, confirmed before any edit) |
| `core/modules/identity/test/onboarding-voice-core.test.js` | **11/11** |
| `core/security/test/identity-engine.test.js` | **14/14** |
| `core/modules/identity/test/auth-coordinator.test.js` | **26/26** |
| `core/security/test/login-decision-engine.test.js` | **19/19** |
| `core/shell/tests/admin-gate-core.test.js` | **33/33** |
| `server/test/chalzydashboard-gate-integration.test.js` | **6/6** |
| `test/deployment/verify-production-routing-offline.test.js` | **21/21** |
| `core/shell/tests/post-login-routing-core.test.js` | **12/12** |
| `core/shell/tests/index-html-post-login-routing-wiring.test.js` | **6/6** |
| `core/modules/identity/test/login-html-server-passkey-wiring.test.js` | **14/14** |

**Total: 191/192 across all suites run this session**, the one failure
being the same pre-existing, disclosed, unrelated CSS assertion.

**Known pre-existing failure, not caused by this work, not fixed here
(out of scope):** `core/modules/identity/test/login-html-phone-wiring.test.js`
reports 3/13 — confirmed present on the pristine CP7 baseline before
any change in this checkpoint.

## Confirmations

- **30-second sequence:** `TOTAL_DURATION_MS` remains 30000; the
  dynamic "remaining time" hold formula automatically absorbed the
  Stage 1–3 retiming with no separate change needed. Tested directly.
- **Audio/visual synchronization:** ABOVE ONLY's disappearance is now
  driven by the real measured audio duration when available (tested
  with the documented ~10.28s real clip length), eliminating the
  previously-identified bleed. Per-letter and ABOVE ONLY particle
  response tested and confirmed correctly sequenced (including the
  glow-stomp bug found and fixed mid-implementation).
- **Offline-first:** zero new network calls anywhere in any of the four
  bodies of work — confirmed by inspection; all audio/voice/particle
  logic operates on local assets and in-memory state only.
- **Administrator/User routing:** untouched by this checkpoint; CP7's
  implementation and all its tests remain exactly as they were,
  re-confirmed passing above.
- **Existing authentication:** untouched; all identity/auth/session
  regression suites re-run and passing.

## No Android/Termux verification claimed

Nothing in this checkpoint touches or depends on the Chromium/CDP/
Termux investigation. All testing here is Node-based (`node:test` +
`node:vm`), consistent with the instruction not to reopen that
investigation.
