# RELEASES.md

Append-only release ledger. Governed by
`docs/builder/rules/05-release-manifest-rule.md` (Rule 60). Past entries are
never rewritten — only appended to (via a `Confirms:` line in a later entry).

Repository SHA-256 values below are computed over every real repository file
**except this file itself** — this is the same pattern real checksum tools
use (a `SHA256SUMS` file never lists a hash of itself). Package SHA-256 for
the *current* release is always the placeholder text below at time of
authoring, because no computed value embedded in a package can ever
correctly describe that same package's final bytes — see Rule 60 for why.
The real package hash is communicated once, externally, in the delivery
message for that release.

---

## M387.5 — Browser Verification & Integration (Partial)

**Repository SHA-256:** `06ea0c37901706077b1b33c475aee73e6166cd59178be3f5dca34cf9fa34bbde`
(computed over all repository files except `RELEASES.md`, 761 files, via
`find . -type f -not -name "RELEASES.md" | sort | xargs sha256sum | sort |
sha256sum`)

**Package SHA-256:** Generated after packaging — see delivery message for
this release.

---

## M387.5 (Round 4/5) — Findings 6, 7, 9 Fixed; MD-004 Deferred; AA-004 Composed

**Confirms M387.5 (initial delivery) package SHA-256:** `5c9dc55952eb2c89cec0bded6ec5555402fda8858bd1a5d0cc4204e69f98242f`

**Repository SHA-256:** `2d4bd002e9e92ef56466e97cc9aa13220a6eef356bcd158ccf7149130bc96ae2`
(computed over all repository files except `RELEASES.md`, 762 files)

**Package SHA-256:** Generated after packaging — see delivery message for
this release.

**What changed:** Findings 6, 7, 9 taken through Plan→Implement→Verify→Close
per Rule 61 (`docs/builder/rules/06-finding-lifecycle-rule.md`) — all now
🟢 Fixed. Finding 8 formalized as `MD-004`, ⚪ Deferred (deliberately not
repaired — feature-scale work, out of scope). One new finding, `AA-004`
(`window.CozyOS.AudioEngine` naming ambiguity), discovered during
re-verification of the above — 🟡 Composed only, real functional risk, no
safe fix identified yet (Rule 52 implementation lock). Full detail:
`docs/history/M387.5.md`.

---

## M387.5 (Round 6) — Rules 61 & 62 Adopted; Repair Queue Established

**Confirms M387.5 (Round 4/5) package SHA-256:** `5d32da973e21bc1aac6b39ab2143eaa6a56364b262c04a9b4768e97df8cc59d7`

**Repository SHA-256:** `86c1f9657a69512bc9f51930626d61f8d5c262a551df656798df9a8c21fa38d2`
(computed over all repository files except `RELEASES.md`)

**Package SHA-256:** Generated after packaging — see delivery message for
this release.

**What changed:** No further findings were fixed this round — this round
formalized governance only. Adopted **Rule 61** (Finding Lifecycle,
`06-finding-lifecycle-rule.md`) and **Rule 62** (Repair Queue,
`07-repair-queue-rule.md`), retroactively applied both to every finding from
this milestone, added the live Repair Queue (`docs/builder/knowledge/repair-queue.md`),
and added a master rules index (`docs/builder/rules/00-INDEX.md`) so future
Builder sessions — and CozyBuilder's own runtime rule library — have one
authoritative entry point to every governance rule, not just this
milestone's findings. `HANDOFF.md` and the milestone handoff now both carry
the required Repair Queue Summary.

**Certification:** unchanged from Round 4/5 — Implementation Verified: NO
(`AA-004` still 🟡 Composed) | Verification Verified: NO (interactive/mobile
verification not yet started). Ready for Next Account: YES, with M387.5b as
the required next phase.

---

## M387.5 (Round 7) — Rule 63 Adopted; Milestone Status Field Added

**Confirms M387.5 (Round 6) package SHA-256:** `0f1a9d1d2047be7e9e56948176b6b19fa5450f8ad8e843ec09f3e2f0e27af0d3`

**Repository SHA-256:** `c8f4695a94698580447f847417a81834c4ff82c4332c884b308ed875c95c4b39`
(computed over all repository files except `RELEASES.md`)

**Package SHA-256:** Generated after packaging — see delivery message for
this release.

**What changed:** No further findings were fixed this round — governance
only, again. Adopted **Rule 63** (Milestone Completion Gate,
`08-milestone-completion-gate-rule.md`): a milestone is never "Completed"
just because coding stopped; 10 explicit conditions must all hold. Ran the
gate against M387.5 itself, honestly: 9 of 10 conditions pass; the 10th
("Repair Queue contains no High-priority Composed item created by this
milestone") fails, because `AA-004` — High priority, Composed, discovered by
this milestone's own re-verification — is still open. Added the **Milestone
Status** field (enum: Planning / Compose / Implementing / Partial
Verification / Verification Complete / Completed / Archived) to `LATEST.md`,
`HANDOFF.md`, and the milestone handoff, set to **Partial Verification** for
M387.5, with the full gate checklist shown inline in all three so the exact
blocking condition is visible without cross-referencing another file.

**Certification:** unchanged — Implementation Verified: NO | Verification
Verified: NO. Ready for Next Account: YES, with M387.5b as the required next
phase (close `AA-004` first, per Rule 62's priority ordering, then complete
interactive/mobile verification) before this milestone can move to Completed.

---

## M387.5 (Round 8) — Rule 64 Adopted (No Milestone Jumping)

**Confirms M387.5 (Round 7) package SHA-256:** `7a9db9cb1985b7725ec85a34521d712f10a850159c6259d513e6d753540d7fa0`

**Repository SHA-256:** `59dbfe0b856a6504bc8fd0b5173326f21a066b5716c69b7efd90f5b661f8be58`
(computed over all repository files except `RELEASES.md`)

**Package SHA-256:** Generated after packaging — see delivery message for
this release.

**What changed:** No further findings were fixed this round — governance
only, again. Adopted **Rule 64** (No Milestone Jumping,
`09-no-milestone-jumping-rule.md`): a Builder must not start M388 (or any
later milestone) while any High-priority Repair Queue item created by the
current milestone is open, or the current milestone's Rule 63 Milestone
Status isn't Completed. Added the explicit allowed/not-allowed progression
diagrams to `LATEST.md` and `HANDOFF.md`, directly beside the Rule 63 gate
checklist, so the block on starting M388 is stated as a hard rule in the
same files a Builder reads first — not just implied by an unmet checklist
item.

**Applied to M387.5 itself:** both Rule 64 conditions currently block M388 —
`AA-004` remains High-priority and Composed, and Milestone Status remains
Partial Verification, not Completed.

**Certification:** unchanged — Implementation Verified: NO | Verification
Verified: NO. Ready for Next Account: YES, with M387.5b (not M388) as the
required next phase.

---

## M387.5b — AA-004 Closed; RP-013 Logged; MD-005 Opened

**Confirms M387.5 (Round 8) package SHA-256:** `5d94770af788f368977f0c2e54c7d74d8a102bfcdcf5110060a2a3ec40037488`

**Repository SHA-256:** `67ed04d1f58b6d6183d6cdf1c1e3e71605620ee64c4021860739cb18d44b64d7`
(computed over all repository files except `RELEASES.md`, 767 files)

**Package SHA-256:** Generated after packaging — see delivery message for
this release.

**What changed:** `AA-004` (`window.CozyOS.AudioEngine` naming collision)
taken through the full Rule 61 lifecycle and closed. Root cause confirmed
by direct evidence — read every real method call `cozy-hearing.js` and
`live-capture-engine.js` make against both candidate engines' actual
implementations, not guessed from comments or load order.
`cozy-hearing.js` needs `registerInputAdapter()`/`startListening()`/
`stopListening()`, implemented only by `cozy-audio-engine.js`;
`live-capture-engine.js` and the bridge's own `wireBrowserAudioProvider()`
need `registerProvider()`, implemented only by `audio-manager.js`. Renamed
the ES-module bridge's target from `AudioEngine` to `AudioManager`
(matching that file's own self-declared identity) in
`core/bridge/engine-bridge-bootstrap.js`; updated `live-capture-engine.js`'s
1 real call site; corrected `cozy-hearing.js`'s outdated header comment;
kept `core/bridge/test/engine-bridge.test.js` in sync; left
`cozy-audio-engine.js` completely untouched. `node --check` PASS on all 4
touched files. Real-Chromium re-verification: 0 "already occupied"
warnings; both engines coexist (279 globals); Living Engine chain
unchanged, no duplicates. Logged as `RP-013`.

Fixing `AA-004` correctly let `wireBrowserAudioProvider()` execute for the
first time ever, revealing a separate, genuine missing dependency —
`core/engines/audio/provider-browser.js`, confirmed absent repository-wide
(Camera has the identical gap). Logged as `MD-005`, ⚪ Deferred (Medium
priority, same treatment as `MD-004`) — not built.

Repair Queue updated: `AA-004` → Closed, `MD-005` added. **No High-priority
Repair Queue items remain.** Full repository-wide duplicate-engine scan
(233 distinct `window.CozyOS.*` instantiation-style globals checked)
confirms `AudioEngine` was the only such collision anywhere in the codebase
— now resolved, none remain.

**Rule 63 re-evaluation:** 9 of 10 gate conditions now met. The only
remaining unmet condition is "Browser/device verification passes" —
interactive auth-flow and mobile/Android verification still haven't
started. Milestone Status stays **Partial Verification**, not Completed.

**Rule 64 re-evaluation:** the High-priority Repair Queue condition that
used to block M388 (`AA-004`) is now resolved. M388 is still blocked, but
now for exactly one reason: Milestone Status isn't Completed yet. Once
interactive/mobile verification passes and Rule 63's gate is fully
satisfied, M388 may begin.

**Certification:** Implementation Verified: NO | Verification Verified: NO
— for the single remaining reason (interactive/mobile verification not yet
performed), not because of any unresolved engineering finding. Ready for
Next Account: YES — next required phase is interactive auth-flow
verification, then mobile/Android verification, then a final Rule 63
re-evaluation.

---

## M387.5c (checkpoint) — Interactive Verification Begins; `RP-014` Composed, Paused Pending Repair

**Confirms M387.5b package SHA-256:** `09e26ada41ebb23828b5a90aefd1122bafc7d85fd9237bc2904d6546694a8706`

**Repository SHA-256:** `b9319c42aad2930affd967315ec51a3c643e252f94be682e90af4b8601c4eb3b`
(computed over all repository files except `RELEASES.md`)

**Package SHA-256:** Generated after packaging — see delivery message for
this release.

**What changed:** No code changed yet. Registration flow verified working
end-to-end via real Playwright interaction (not just page-load checks).
Session restore / Remember Me testing found a real, reproducible failure,
root-cause-confirmed via a live runtime tracer installed on `window.CozyOS`
itself — `auth-coordinator.js`'s own auto-trigger calls `restoreSession()`
before `IdentityEngine.restorePersistedUsers()` finishes, wiping a
genuinely valid pointer. Logged as `RP-014` (High priority, 🟡 Composed) in
`knowledge/repair-history-registry.md` with a full Symptoms/Evidence/
Investigation/Root-Cause/Impact/Dependencies/Repair-Plan/Verification-Plan
record. Added to the Repair Queue.

**Explicit decision:** the remaining interactive test matrix (OTP on a
restored session, trusted-device-after-reload, device recognition after
reload) is paused — those tests would fail for this same root cause, not
their own — until `RP-014` is closed.

**Rule 63/64 re-evaluation:** the Repair Queue condition, briefly satisfied
after `AA-004`'s closure, is unmet again — `RP-014` is a new High-priority
Composed item found during this milestone's own interactive verification.
Rule 64 blocks M388 for two independent reasons now: `RP-014` open, and
Milestone Status not Completed.

**Certification:** unchanged — Implementation Verified: NO | Verification
Verified: NO. Ready for Next Account: YES — next required phase is
`RP-014`'s Plan→Implement→Verify→Close, per explicit instruction, before
resuming the interactive test matrix.

---

## M387.5c — RP-014 Fixed & Verified

**Confirms M387.5c checkpoint package SHA-256:** Generated after packaging (prior checkpoint, no code changed then)

**Repository SHA-256:** `b4d0acb1d9c24b1f5c93cf3b1b4936132e104d546a7d2454068c2dd56e9794b5`

**Package SHA-256:** Generated after packaging — see delivery message.

**What changed:** `auth-coordinator.js` fixed — auto-trigger now awaits
`identity.ready` before `restoreSession()`. Verified via exact tracer
re-run, functional reload test (2 runs), full regression pass. `RP-014` →
🟢 Fixed. Repair Queue: no High-priority items remain.

**Rule 63/64:** Repair Queue condition satisfied. Only remaining blocker:
interactive/mobile verification.

**Certification:** unchanged — NO/NO. Ready for Next Account: YES — resume
interactive matrix (logout, remember-me-off, OTP, recovery codes, trusted
device, session restore after OTP), then mobile verification.

---

## M387.5 — COMPLETED

**Confirms prior checkpoint package SHA-256:** `46af1ff32a175f14a8176f586ec3b0c49f630fb8e3757ebf606df281a97a146c`

**Repository SHA-256:** `5698e75944f6c1a687c46988845459d4732a54f432e3953267fe23264153abab`
(computed over all repository files except `RELEASES.md`)

**Package SHA-256:** Generated after packaging — see delivery message for
this release.

**What changed:** Resumed and completed the interactive verification
matrix — logout, Remember-Me-OFF (found + fixed **`RP-015`**), OTP (real
RFC 6238 TOTP), recovery codes (single-use enforced), session-restore-
after-OTP, trusted-device (confirmed admin-only by design). Mobile
verification via Chromium Pixel 7 emulation (disclosed: not real Android
hardware) — touch, orientation, reload persistence, IndexedDB, all pass.
Final full-repository regression: identical to baseline, 0 new errors.

**Rule 63:** 10 of 10 gate conditions met. **Milestone Status: Completed.**

**Rule 64:** both blocking conditions resolved. **M388 unblocked.**

**Certification:**
- Implementation Verified: **YES**
- Verification Verified: **YES**
- Ready for Next Account: **YES** — begin **M388 Compose**.

**11 findings closed this milestone** (`RP-007`–`RP-015`, `AA-004`), full
Compose→Plan→Implement→Verify→Close chains each. 2 deliberately Deferred
(`MD-004`, `MD-005`), Medium priority, non-blocking.

**Next account must:** upload this ZIP as baseline, read `LATEST.md` →
`HANDOFF.md` → `RELEASES.md` (this file) → the Repair Queue, verify the
repository SHA-256 above, confirm M387.5 = Completed across all three
files, then begin M388 Compose.

---

## M388 — Living Media Interpreter (Compose Only)

**Confirms M387.5 package SHA-256:** `01c7161ec875c8636e01cca245f849beb5820d586615171263835485e106d1d0`

**Repository SHA-256:** `a8679be587d5a56687b13a10a96375fd3fb8197fb2ba06d75d663c10c2cd163a`
(computed over all repository files except `RELEASES.md`)

**Package SHA-256:** Generated after packaging — see delivery message for
this release.

**What changed:** Compose report only (`docs/history/M388.md`). **No
application code was modified** — per Rule 50 and explicit instruction.
Confirmed by re-running the full browser regression harness: identical
output to M387.5's final state (0 errors on `index.html`/`login.html`, 1
environment-limited error + 5 documented missing-dependency requests on
`dashboard.html`).

Real repository investigation (direct source inspection, not assumption)
found substantial existing infrastructure: speech-to-text
(`speech-recognition-adapter.js`), translation orchestration
(`cozy-translate.js`), real working live-meeting captions/translation
(`ldce-caption-engine.js`), generic TTS, and room/channel/stream
coordination scaffolding (`cozy-live.js`). Confirmed real gaps (none are
defects): bundled machine translation, voice cloning/neural TTS,
video/audio codec decode/encode, background-audio separation, speaker
diarization, language auto-detection, streaming/low-latency pipeline,
subtitle export, lip-sync. One architecture ambiguity: "Living Meaning
Engine" has no defined scope.

**Per Rule 62:** 9 new `MD` entries (`MD-007`–`MD-015`) + 1 new `AA` entry
(`AA-005`) logged to the Repair Queue the moment they were composed, not
deferred. Full evidence, ownership map, duplicate-engine scan, and
architecture reconciliation: `docs/history/M388.md`.

**Rule 63:** Milestone Status = **Compose**. Implementation: NO.
Verification: NO — by design, this is a Compose-only milestone.

**Certification (M388):** Compose Verified: YES. Implementation Verified:
NO. Verification Verified: NO. Ready for Next Account: YES — begin **M388
Plan**, starting with `AA-005`'s resolution.

---

## M388 (Round 2) — Rule 65 Adopted; Builder Lifecycle Status Recorded

**Confirms M388 (Compose) package SHA-256:** `83a177ff81d2ad4965231e6438533c17268bf06105ca9192bbe99eb361143b6e`

**Repository SHA-256:** `6a45a9f395f1f2e45976302f66e95debb395ae4345d73368efd62aca02cff848`
(computed over all repository files except `RELEASES.md`)

**Package SHA-256:** Generated after packaging — see delivery message.

**What changed:** No application code changed (re-confirmed via full
regression re-run — identical to prior state). Adopted **Rule 65** (Builder
Lifecycle, `docs/builder/rules/10-builder-lifecycle-rule.md`): names the
Phase 0–9 sequence every milestone moves through, authoritatively, so any
future account can state exactly where a milestone stopped without prior
chat history. Added the **Builder Lifecycle Status** block to
`docs/history/M388.md` — the permanent historical checkpoint for this
milestone, independent of whatever `LATEST.md`/`HANDOFF.md` describe once
later milestones begin.

**M388 status:** Phase 0 ✅ · Phase 1 (Compose) ✅ · Phase 2
(Review/Approval) ⏳ Pending · Phases 3–4 ⏸ Locked · Phases 5–8 ✅ · Phase 9
⏸ Awaiting implementation. Blocking item: `AA-005`.

**Certification:** unchanged — Compose Verified: YES, Implementation
Verified: NO, Verification Verified: NO. Ready for Next Account: YES —
begin Phase 2: resolve `AA-005`, approve or revise the Compose report.

---

## M388 (Round 3) — Phase 2 Complete: Approved (Revised); AA-005 Closed

**Confirms M388 (Round 2) package SHA-256:** `4514c0b82dda28d583d83ab2afd0f2a269881cc9e24f756d38aba4de862b8719`

**Repository SHA-256:** `8d5401edc5751788a0173d47c2c07e627b1f61a719f8de20bdb29d40c9f3636e`
(computed over all repository files except `RELEASES.md`)

**Package SHA-256:** Generated after packaging — see delivery message.

**What changed:** No application code changed (re-confirmed via full
regression re-run — identical to prior state). Phase 2 Review performed
against the Compose Report: architecture, `AA-005`, ownership map,
duplicate-engine risk, performance targets, security/privacy,
`MD-007`–`MD-015`, Repair Queue, and implementation contract, all
re-checked. Found a real completeness gap — the originally-proposed
8-engine order had no step to extract audio from a video file. **Verdict:
Approved (Revised)** — architecture direction and ownership findings were
sound; the implementation order is revised to 11 engines (added Media
Decode, Speaker Diarization, Background Audio Separation, Media Encode;
repositioned others).

**`AA-005` closed** — documented decision: "Living Meaning Engine" merged
into "Living Translation Engine," no separate engine, reasoning grounded
in `cozy-translate.js`'s own boundary and the ~0.5s latency target.

**Scope correction:** `MD-007`/`MD-008` structurally excluded from M388
entirely (not just deferred) — the original task's Out of Scope list
already says so; the approved contract makes no promise on either.

**M388 status:** Phase 0 ✅ · Phase 1 ✅ · Phase 2 ✅ Approved (Revised) ·
Phase 3 🔓 Unlocked, not started · Phase 4 ⏸ Locked · Phases 5–8 ✅ ·
Phase 9 ⏸ Awaiting all 11 engines.

**Certification:** Compose Verified: YES. Review/Approval: YES (Approved,
Revised). Implementation Verified: NO. Verification Verified: NO. Ready
for Next Account: YES — begin Engine 1 (Media Decode Engine)'s own
Phase 0/Compose.

---



## M388 (Round 4) — Rule 66 Adopted; Engine 1 (Media Decode) Phase 0/1 Complete

**Confirms M388 (Round 3) package SHA-256:** `4514c0b82dda28d583d83ab2afd0f2a269881cc9e24f756d38aba4de862b8719`

**Repository SHA-256:** `3b6c44887de0a75e44eb3fea692c27b895b442936204425bf48c61eff2dac18a`
(computed this session as: `find . -type f ! -name "RELEASES.md" ! -path
"./_archive/*" | sort | xargs sha256sum | sha256sum`. Disclosed explicitly:
this session could not reproduce Round 3's hash bit-exact from a fresh
checkout with this same method — the prior rounds' precise hashing script
is not itself committed to the repository. Flagged here rather than
silently asserted as verified; a future account should commit the actual
hashing script alongside `RELEASES.md` so this stops being re-derived
differently each session.)

**Package SHA-256:** Generated after packaging — see delivery message.

**What changed (documentation only, no application code):**
1. **Rule 66 — Repository Completeness** adopted
   (`docs/builder/rules/11-repository-completeness-rule.md`): every
   finding must be written into its repository registry, never left only
   in chat; the repository is the single source of truth; the only
   permitted exception is packaging metadata that would create a
   self-reference loop (ZIP filename/size, repository size, Package
   SHA-256, download info); undocumented (chat-only) information may not
   be relied upon. Extends Rule 63's Milestone Completion Gate.
   `docs/builder/rules/00-INDEX.md` updated in the same pass.
2. **Engine 1 (Media Decode Engine) Phase 0 (Repository Verification) and
   Phase 1 (Compose) completed**
   (`docs/history/M388-E1-MediaDecode-Compose.md`). Phase 0 found, via a
   real executed dynamic import (not just `find`), that
   `media-pipeline-manager.js` currently cannot load — confirms `MD-004`/
   `MD-009` with stronger evidence. Phase 1 Compose covers all 12 required
   topics (capabilities, ownership, composition, containers/codecs, audio
   extraction path, interfaces, dependencies, performance, failure
   handling, security, Repair Queue impacts, implementation contract).
3. **`AA-006` opened and closed within the same pass**: `MD-009`'s
   registry text had conflated Engine 1/9's intended media-file demux/mux
   scope with the already-reserved, narrower `codec-decoding-engine.js`/
   `codec-encoding-engine.js` still-image-codec file paths. Resolved:
   Engine 1 gets its own new file path (recommended
   `core/engines/media/decode/media-decode-engine.js`); the still-image
   codec gap remains tracked separately under `MD-004`. Logged to
   `repair-queue.md` and `architecture-ambiguity-registry.md`.
   `missing-dependency-registry.md`'s `MD-009` row corrected accordingly.
4. `LATEST.md`/`HANDOFF.md` updated to carry Engine 1's real Phase 0/1
   status and a current M388 Repair Queue Summary (Rule 62/66) — this
   round exists specifically so a future account does not need this
   session's chat history to know any of the above.

**M388 status:** Phase 0 ✅ · Phase 1 ✅ · Phase 2 ✅ Approved (Revised) ·
Phase 3 🔓 Unlocked — **Engine 1 sub-lifecycle: Phase 0 ✅ · Phase 1 ✅ ·
Phase 2 ⏳ Pending (current blocking step)**.

**Certification:** Compose Verified: YES. Review/Approval (milestone-level):
YES (Approved, Revised). Engine 1 Review/Approval: **NO — pending**.
Implementation Verified: NO. Verification Verified: NO. Ready for Next
Account: YES — perform Engine 1's Phase 2 Review; do not begin
implementation first.

---

## M388 (Round 5) — Rule 67 Adopted (Delivery Metadata)

**Confirms M388 (Round 4) package SHA-256:** Generated after packaging — see delivery message for that release (no ZIP was produced for Round 4; carried forward honestly rather than fabricated).

**What changed (documentation only, no application code):** **Rule 67 —
Delivery Metadata** adopted (`docs/builder/rules/12-delivery-metadata-rule.md`),
extending Rule 60 and Rule 66. Fixes the exact contents and format of the
packaging metadata Rule 66 already excluded from the repository: ZIP
filename, ZIP size, repository size, and Package SHA-256 belong only in a
fixed `Delivery` block in the delivery message, with size deltas tracked
against the previous delivery. Repository SHA-256 is the one exception —
it remains in this file per Rule 60, only restated in the delivery block
for convenience. `docs/builder/rules/00-INDEX.md` updated in the same
pass, per Rule 66's own requirement that a new rule be indexed immediately.

**No package was produced this round** — this entry documents a
governance-rule addition only. The next actual delivery (a real ZIP) is
the first one required to carry the full Rule 67 `Delivery` block,
including a real ZIP-size and repository-size delta against whatever
figures that delivery's *own* prior round last recorded.

**M388 status:** unchanged from Round 4 — Engine 1 sub-lifecycle still
Phase 0 ✅ · Phase 1 ✅ · Phase 2 ⏳ Pending.

---

## M388 (Round 6) — Engine 1 Compose Package (first Rule 67 delivery)

**Confirms M388 (Round 5) package SHA-256:** none — Round 5 produced no package (documentation-only round, disclosed as such at the time).

**Repository SHA-256:** `0a9c5c3970e8932b33bfc30a29b1b4e6df2af825973662ed14165ff76d851adf`
(computed over every repository file except `RELEASES.md`, excluding
`_archive/` — same scope used throughout, per Rule 60 §2)

**Repository Size:** 15,224,018 bytes (~14.52 MB), same scope as above.

**Package SHA-256:** Generated after packaging — see delivery message for
this release (Rule 60 §2 — never a computed value at time of authoring).

**What's in this package:** everything through Round 5 — Rule 66
(Repository Completeness), Rule 67 (Delivery Metadata), Engine 1 (Media
Decode Engine) Phase 0/1 Compose (`docs/history/M388-E1-MediaDecode-Compose.md`),
`AA-006` opened/closed, `MD-009` correction, and `LATEST.md`/`HANDOFF.md`
brought current. No application code changed. This is the **first
delivery under Rule 67** — full `Delivery` block, including ZIP/repository
size, is in the chat delivery message, not in this file (per Rule 67 §2/§3).

**M388 status:** unchanged — Engine 1 sub-lifecycle Phase 0 ✅ · Phase 1 ✅
· Phase 2 ⏳ Pending. No other engine should start first.

---

## M388 (Round 7) — Engine 1 Phase 2 Review (Approved)

**Confirms M388 (Round 6) package SHA-256:** not confirmed this round —
the ZIP delivered for Round 6 was not independently re-hashed by this
session (only the extracted repository was re-verified; see below).

**Repository SHA-256:** `e56932fe827ea050ebfe65321b579b9ae980d3fc7aea2cf2fb7b6e90d581ec00`
(computed over every repository file except `RELEASES.md`, excluding
`_archive/` — same scope and method used throughout, per Rule 60 §2)

**Repository Size:** 15,238,071 bytes (~14.53 MB), same scope as above.

**Package SHA-256:** Generated after packaging — see delivery message for
this release (Rule 60 §2 — never a computed value at time of authoring).

**Independent verification performed this round (Phase 0, re-confirmed):**
this session independently recomputed the Round 6 repository SHA-256 from
the delivered ZIP before making any change, using the same method
described above, and it matched `0a9c5c3970e8932b33bfc30a29b1b4e6df2af825973662ed14165ff76d851adf`
(Round 6's recorded value) exactly — confirming the Round 6 package was
delivered intact and the hashing method is reproducible across sessions.

**What's in this package:** Engine 1's **Phase 2 Review/Approval**,
appended to `docs/history/M388-E1-MediaDecode-Compose.md`. Every technical
claim in the Compose Report (Phase 0/1) was independently re-executed
against the actual source this round (missing-import check, still-image
codec test-suite scope, `decodeMedia` name-collision search, repository-
wide `WebCodecs` non-use check, `SpeechRecognitionAdapter`'s live-only
input model) — no discrepancy found. **Verdict: Approved** (not Revised).
**New finding: `MD-016`** (Composed, Medium — no engine in the Approved
11-engine order yet owns the audio-buffer→`SpeechRecognitionAdapter`
bridge; does not block Engine 1's own Phase 3), logged to
`repair-queue.md` and `missing-dependency-registry.md`. `LATEST.md`/
`HANDOFF.md` updated to reflect Phase 3 (Implementation) now unlocked for
Engine 1. No application code changed.

**M388 status:** Engine 1 sub-lifecycle Phase 0 ✅ · Phase 1 ✅ · Phase 2 ✅
Approved · **Phase 3 🔓 Unlocked — next action is Implementation.** No
other engine should start first.

---

## M388 (Round 8) — Rule 68 Adopted (Per-Engine Lifecycle Gate)

**Confirms M388 (Round 7) package SHA-256:** not independently re-confirmed
this round (Round 7's ZIP was produced and delivered this same overall
session; no separate re-verification pass was run against it before this
round's edits).

**Repository SHA-256:** `46d592b3507939c4eb073274facf64b63945317aced6e1117588d091837e4c37`
(computed over every repository file except `RELEASES.md`, excluding
`_archive/` — same scope and method used throughout, per Rule 60 §2)

**Repository Size:** 15,245,163 bytes (~14.54 MB), same scope as above.

**Package SHA-256:** Generated after packaging — see delivery message for
this release (Rule 60 §2 — never a computed value at time of authoring).

**What's in this package:** **Rule 68 — Per-Engine Lifecycle Gate**
adopted (`docs/builder/rules/13-per-engine-lifecycle-rule.md`), extending
Rule 65: makes "next engine blocked until current engine reaches Phase 9"
a binding rule rather than narrative text, mirroring Rule 64's
relationship to Rule 63 at milestone scope; also names the VERIFIED/
PARTIAL/NOT VERIFIED/ASSUMED evidence taxonomy for use within an engine's
own Phase 4. `docs/builder/rules/00-INDEX.md` updated same pass per Rule
66. `LATEST.md`/`HANDOFF.md` updated to record the adoption. Documentation
only — no application code changed, Engine 1's own lifecycle status
unchanged (Phase 2 ✅ Approved → Phase 3 unlocked, not started).

**M388 status:** unchanged by this round — Engine 1 sub-lifecycle Phase 0
✅ · Phase 1 ✅ · Phase 2 ✅ Approved · Phase 3 🔓 Unlocked, not yet started.
Per Rule 68 (this round), no other engine may begin its own Phase 0 until
Engine 1 reaches Phase 9.

---

## M388 (Round 9) — Rule 69 Adopted; Engine 1 Implementation (Phases 3–9)

**Confirms M388 (Round 8) package SHA-256:** not independently re-confirmed
this round (no separate ZIP was re-hashed before this round's edits began;
this round continued from the extracted repository state directly).

**Repository SHA-256:** `66e4eb14a2cba8a5c0ef4124dd97ead58a24181a4213c4f3d45c305a57fb3eba`
(computed over every repository file except `RELEASES.md`, excluding
`_archive/`. **Method disclosed** (per Phase 0's own recurring finding
that no canonical hashing method is specified anywhere in this
repository): sorted list of relative file paths → `sha256sum` of each
file → `sha256sum` of that sorted manifest, i.e.
`find . -type f ! -path './_archive/*' ! -name 'RELEASES.md' -print0 | sort -z | xargs -0 sha256sum | sha256sum`.
A future Builder using a different method should expect a different value
and should not treat that alone as a repository-integrity failure.)

**Repository Size:** 15,311,714 bytes (~14.60 MB), same scope as above.

**Package SHA-256:** Generated after packaging — see delivery message for
this release (Rule 60 §2 — never a computed value at time of authoring).

**File count (excl. `_archive/`):** 773 (was 768 at last recorded
checkpoint, `LATEST.md`) · **JS files:** 497 (was 494). Delta is +5
total/+3 JS — 4 new files were added this round (3 JS, 1 Markdown); the
remaining +1 total-file delta is consistent with the file-count
methodology ambiguity already disclosed in Engine 1's Phase 0 (no
canonical inclusion rule — e.g. `RELEASES.md` itself — is specified
anywhere in this repository), not a new discrepancy requiring escalation.

**Rule 69 — Repository Authority, adopted this round**
(`docs/builder/rules/14-repository-authority-rule.md`), extending Rule
66: if chat history, screenshots, or prior Builder claims conflict with
the repository's own contents, the repository is authoritative by
default (record the discrepancy, explain it, continue from the
repository's recorded phase); a Newer-ZIP Exception requires the Builder
to stop and request the newer ZIP if repository is proven the stale
artifact. First triggered in practice this session: an external summary
claimed Engine 1 Implementation/Verification and a nonexistent `MD-017`
were already complete; the repository's own `LATEST.md`/`HANDOFF.md`
showed Phase 2 Approved → Phase 3 not started, with no `MD-017` entry —
the repository's account was followed. `docs/builder/rules/00-INDEX.md`
updated same round per Rule 66.

**Engine 1 (Media Decode Engine) — Phase 3 (Implementation) through Phase
9 (Close), this round.** Full detail:
`docs/history/M388-E1-MediaDecode-Compose.md` (Phase 3/4 sections
appended this round).

- **New files:** `core/engines/media/decode/media-decode-engine.js`,
  `core/engines/media/decode/provider-inmemory.js`,
  `core/engines/media/decode/tests/media-decode-engine.test.js`.
- **Modified file:** `core/bridge/engine-bridge-bootstrap.js` — one
  `REGISTRATIONS` entry added (`media-decode`). No other line changed;
  `media-pipeline-manager.js`/`cozy-media.js` untouched (Implementation
  Contract §12 item 4).
- **Honesty (§3/§4/§9 of the Compose report):** real, executed
  magic-number container detection (mp4/webm/wav/ogg/flac/mp3) against
  actual bytes; honest `isReal:false` structural envelope for
  audio/video tracks (no fabricated decode); `getCapabilities()` reports
  `realDecode:false` and an empty `codecs` list — no unearned claims.
- **Phase 4 Verification:** 23/23 new, real, executed tests pass
  (`node core/engines/media/decode/tests/media-decode-engine.test.js`).
  Regression check against the existing
  `core/engines/media/tests/media-pipeline-manager.test.js` fails at the
  same pre-existing line as Phase 0's finding (`background-engine.js`
  missing — `MD-004`/`MD-009`) — identical signature before and after,
  confirming no new regression from this engine.
- **`MD-009` updated** (Repair Queue): 🟡 Composed → 🔵 Implementing —
  decode half (Engine 1) now real and verified; encode half (Engine 9)
  still open. `MD-016` (audio-buffer→`SpeechRecognitionAdapter` bridge)
  deliberately **not** touched this round, per Phase 2 Review's explicit
  addendum to §12 — remains open.
- **Engine 1 closed (Phase 9).** Per Rule 68, Engine 2 (Language
  Detection) may now begin its own Phase 0. No Engine 2 work started this
  round.

**M388 status:** Engine 1 sub-lifecycle **Complete** (Phase 0–9, all ✅).
`MD-009` partially resolved (decode half). 10 `MD` items remain open
(`MD-016` among them, unaffected this round). Per Rule 68, Engine 2 is
now unlocked to begin its own Phase 0 — not started this round.

---

## M388 (Round 10) — Engine 1 Packaging (Rule 68 Phase 8 Complete)

**Confirms M388 (Round 9) Repository SHA-256:** re-verified this round
before packaging, post-documentation-update:
`eac91229c510552a967aff0ca952add66116becfd2617e9d49f1838301232b2f`
(differs from Round 9's mid-pass value — Round 9's value was computed
before that round's own doc updates finished; this is the correct final
value for the repository state actually packaged).

**Repository SHA-256 (final, packaged):** `eac91229c510552a967aff0ca952add66116becfd2617e9d49f1838301232b2f`
(same method as prior rounds — sorted file list, per-file `sha256sum`,
`sha256sum` of that manifest, excluding `_archive/` and `RELEASES.md`)

**Repository Size:** 15,318,630 bytes (~14.61 MB) (was 15,311,714 bytes
at Round 9's mid-pass checkpoint; +6,916 bytes from that round's own
remaining documentation updates — LATEST.md/HANDOFF.md/registry edits
made after that checkpoint was taken)

**ZIP filename:** `CozyOS-main-v2_25_19-M388-E1-COMPLETE.zip`
**ZIP size:** pending final packaging pass — see delivery message for
this release (Rule 60 §2 pattern applied to ZIP size/filename as well,
since both are packaging metadata Rule 66 excludes from the repository).
**Package SHA-256:** Generated after packaging — see delivery message for
this release (Rule 60 §2 — never a computed value at time of authoring;
embedding a real hash here before the final package is built would
invalidate it the moment it's included in that same package).
**ZIP integrity:** to be verified against the final packaged ZIP — see
delivery message.

**What's in this package:** No application code changed this round.
Final regression re-run before packaging: Engine 1's own suite 23/23
passed; the existing `media-pipeline-manager.test.js` failed at the same
pre-existing line as every prior round (`background-engine.js` missing,
`MD-004`/`MD-009`'s encode-half gap) — confirmed no new regression
introduced by packaging. This round is Rule 68's Phase 8 (Package) for
Engine 1, closing out the Phase 0–9 cycle recorded in Round 9.

**M388 status:** Engine 1 **Phase 0–9 fully complete, packaged, and
delivered.** Per Rule 68, Engine 2 (Language Detection) is unlocked to
begin its own Phase 0 in the next session. No Engine 2 work performed
this round.

---

## M388 (Round 11) — Engine 2 (Language Detection) Phase 0 + Phase 1 (Compose)

**Scope this round, explicit:** Repository verification + Compose Report
only, per instruction. No application code, no implementation, no new
engine files. Full report:
`docs/history/M388-E2-LanguageDetection-Compose.md`.

**Repository SHA-256 discrepancy — open verification finding, not
corrected this round.** Recomputed the documented method (sorted file
list excluding `_archive/`/`RELEASES.md`, per-file `sha256sum`,
`sha256sum` of that manifest) against this round's own checkout of the
M388 Round 10 package (773 files, matching the file count recorded for
that round) and got
`928c6a96d2c2006bda92ff8b740786250ee54b3b020c3d403dcb1e1fe0c2fd9c`, not
Round 10's recorded
`eac91229c510552a967aff0ca952add66116becfd2617e9d49f1838301232b2f`. File
*counts* matched exactly — no evidence of missing/altered content. Per
explicit instruction, this is logged as an open finding rather than
"fixed" by silently overwriting either value; the canonical procedure
needs independent confirmation (e.g. re-deriving the exact `sha256sum`/
sort/locale invocation used historically) before either hash is treated
as ground truth going forward.

**What's in this package (application-code diff from Round 10): none.**
Only documentation/registry files changed:
- **New:** `docs/history/M388-E2-LanguageDetection-Compose.md`.
- **Modified:** `LATEST.md`, `HANDOFF.md`, this file,
  `docs/builder/knowledge/repair-queue.md`,
  `docs/builder/knowledge/missing-dependency-registry.md`,
  `docs/builder/knowledge/documentation-integrity-registry.md`.

**Findings this round:**
- `MD-012` reinforced with two independent repository confirmations
  (`speech-translation-adapter.js` header;
  `church-worship-session.js` honest-gaps disclosure). Status unchanged
  (🟡 Composed); owner updated to reflect Engine 2's active Compose.
- `MD-016` re-checked against Engine 2's own input dependency; confirmed
  adjacent, still non-blocking for Engine 2's Compose.
- **New — `DI-004`** (Documentation Integrity Registry, Open, Low):
  `core/language.js:32` references `window.CozyLanguage?.LANGUAGES`, a
  global never assigned anywhere in the repository (confirmed via
  repository-wide search) — masked by optional chaining and a hardcoded
  fallback, not an active defect. Pre-existing, unrelated to M388, not
  fixed this round (out of this session's explicit no-fixes scope).

**Duplicate-ownership scan:** three other `CozyLanguage*`-named modules
(`CozyLanguageEngine` — real UI-string translation;
`CozyLanguageImporter` — bundled locale dictionaries;
`CozyLanguageVerification` — an unrelated `Living*` coordinator) checked
individually; none compete with Engine 2's proposed audio
language-detection scope. No duplicate found.

**Composition point confirmed:** `cozy-live.js` already reserves a named,
already-tested optional subsystem slot (`CozyLanguage` in
`KNOWN_SUBSYSTEMS`; `relaySpeechSegment()`'s `hasSubsystem('CozyLanguage')`
→ `detectLanguage(sourceAudioRef)` hook, already exercised by
`ourcozy-live.test.js:773-784`'s mock) — Engine 2's Implementation
Contract (draft, pending Phase 2 Review) proposes attaching to it via
`registerSubsystem()` only, without modifying `cozy-live.js` itself.

**M388 status:** Engine 1 sub-lifecycle remains Complete/Closed
(unchanged this round). Engine 2 sub-lifecycle: **Phase 0 + Phase 1
(Compose) Complete this round — Phase 2 Review is the next required
step, not Implementation.** Per Rule 68, Engine 3 remains blocked behind
Engine 2's own Phase 9.

**Repository SHA-256 (this round, own checkout, same documented method):**
`dd205a882000bdf18e1a92ffca0f4185c23632b5d3add25096fbdc79ab4e7d60`
(774 total files / 497 JS files, excluding `_archive/` and this file —
see the open discrepancy note above regarding Round 10's own recorded
value; this round's figure is computed fresh from this round's own
checkout, not reconciled against Round 10's disputed hash)

**Repository Size:** 15,348,206 bytes (~14.64 MB) (was 15,318,630 bytes
at Round 10 per that round's own record; +29,576 bytes, all
documentation/registry text — no application code)

**ZIP filename:** pending final packaging pass — see delivery message for
this release (Rule 60 §2 pattern).
**ZIP size:** pending final packaging pass — see delivery message.
**Package SHA-256:** Generated after packaging — see delivery message for
this release (Rule 60 §2 — never a computed value at time of authoring).
**ZIP integrity:** to be verified against the final packaged ZIP — see
delivery message.

---

## M388 (Round 12) — Engine 2 (Language Detection) Phase 2 Review/Approval

**Confirms M388 (Round 11) Repository SHA-256:** not independently
re-confirmed this round — this round continued directly from the
extracted Round 11 checkout rather than re-hashing a separately
delivered ZIP first. The open Round 10/11 discrepancy documented below
remains unresolved by this round (out of this round's own scope, which
is a Phase 2 Review, not a hashing-procedure audit).

**Repository SHA-256 discrepancy — still open, unresolved, carried
forward unchanged from Round 11.** Round 11 recorded a mismatch between
its own recomputation of the documented method
(`928c6a96d2c2006bda92ff8b740786250ee54b3b020c3d403dcb1e1fe0c2fd9c`) and
Round 10's recorded value
(`eac91229c510552a967aff0ca952add66116becfd2617e9d49f1838301232b2f`) for
what was represented as the same package, with matching file counts
(773 excl. `RELEASES.md`). This round did not attempt to re-resolve that
question — it is logged again here, unchanged, per Rule 69 (repository
is authoritative; a proven discrepancy is recorded, not silently
resolved in either direction, until the canonical hashing procedure is
independently confirmed).

**Repository SHA-256 (this round, own checkout, documented method):**
`58213b8b46069450bc661ab7220c7e402fe61339d63bd7ae33e859abb15579cf`
(computed as: `find . -type f ! -path './_archive/*' ! -name
'RELEASES.md' | sort | xargs sha256sum | sha256sum` — same method used
throughout, applied fresh to this round's own checkout after this
round's edits; not reconciled against Round 11's disputed figure, for
the same reason Round 11 did not reconcile against Round 10's).

**Repository Size:** 15,363,815 bytes (~14.65 MB) (all files, this
round's own checkout, same `du -sb .` convention as prior rounds).

**File count (excl. `RELEASES.md`):** 773 total / 497 JS — unchanged
from Round 11. No new files, no application code touched this round —
this round only appended a Phase 2 Review section to
`docs/history/M388-E2-LanguageDetection-Compose.md` and updated
`LATEST.md`, `HANDOFF.md`, `docs/builder/knowledge/repair-queue.md`, and
`docs/builder/knowledge/missing-dependency-registry.md`.

**ZIP filename:** pending final packaging pass — see delivery message
for this release (Rule 60 §2 / Rule 67 pattern).
**ZIP size:** pending final packaging pass — see delivery message.
**Package SHA-256:** Generated after packaging — see delivery message
for this release (Rule 60 §2 — never a computed value at time of
authoring).
**ZIP integrity:** to be verified against the final packaged ZIP — see
delivery message.

**What's in this package (application-code diff from Round 11): none.**
This round is **Engine 2's Phase 2 (Review/Approval)** — no Compose
work, no Implementation. Every load-bearing claim in the Round 11
Compose Report was independently re-executed against the actual source
this round (Rule 69): the `cozy-live.js` composition point
(`KNOWN_SUBSYSTEMS`, `relaySpeechSegment()`'s `hasSubsystem`/`subsystems.get`
calls), the existing test coverage
(`ourcozy-live.test.js:773-784`'s `CozyLanguage` mock), the
`cozy-translate.js` negative boundary header, the three unrelated
`CozyLanguage*`-named modules, the `DI-004` dead-reference finding, and
the candidate implementation file path — all confirmed exact, no
discrepancy found. One check went beyond Round 11's own scope: a
repository-wide search for `registerSubsystem(` calls confirmed **zero
production registrants for `'CozyLanguage'`** anywhere in the repository
(only test-file mocks) — closing an implicit gap Round 11 left
unverified, strengthening rather than changing its conclusion.

**Verdict: Approved (not Revised).** No completeness gap, no
architecture defect. The 6-item Implementation Contract from Round 11
stands unrevised. No new finding raised by this Review. `MD-012`'s
Repair Queue owner updated to reflect Phase 2 Approval; status
unchanged (🟡 Composed — changes only at real Implementation, per
`MD-009`/Engine 1's own precedent). `MD-016` and `DI-004` unchanged.

**M388 status:** Engine 1 sub-lifecycle remains Complete/Closed
(unchanged this round). Engine 2 sub-lifecycle: **Phase 0 ✅ · Phase 1
✅ · Phase 2 ✅ Approved this round · Phase 3 🔓 Unlocked, not started.**
Per Rule 68, Engine 3 remains blocked behind Engine 2's own Phase 9.

**Certification:** Repository Verified: YES (this round's own
independent re-execution of every claim, Rule 69). Compose Verified: YES
(carried forward). Review/Approval: **YES — Approved.** Implementation
Verified: NO. Verification Verified: NO. Ready for Next Account: YES —
begin Engine 2 Phase 3 (Implementation) per the unrevised Implementation
Contract in `docs/history/M388-E2-LanguageDetection-Compose.md`. Do not
start Engine 3 first.

---

## M388 (Round 13) — Engine 2 (Language Detection) Phase 3–9 — Implementation, Verification, Close

**`DI-005` opened and Resolved this round — root cause of the Round
10/11/12 Repository SHA-256 discrepancy.** The documented hashing method
(`find . -type f ! -path './_archive/*' ! -name 'RELEASES.md' | sort |
xargs sha256sum | sha256sum`) silently mis-splits three filenames in
this repository that contain spaces (`modules/quarry/ quarry.html\``,
`core/bridge/test/media integration test.js`, `core/docs/CERTIFICATION
REPORT md`) when piped through plain `xargs`, making the resulting hash
depend on incidental argv/buffer-splitting rather than being a
reproducible function of the repository's actual contents. Re-running
the identical logical method with NUL-delimited output
(`find ... -print0 | sort -z | xargs -0 sha256sum | sha256sum`) against
Round 12's own content reproduced Round 12's recorded hash exactly —
confirming Round 12 was correct all along; only the measurement was
broken. **Canonical method adopted this round** (adds `-print0`/`-z`/
`-0`; no other change to the documented procedure). Full detail:
`docs/builder/knowledge/documentation-integrity-registry.md` (`DI-005`).

**Repository SHA-256 (this round, own checkout, corrected canonical
method — final, after all Engine 2 Phase 3–7 file and documentation
changes are complete):**
`4118afe0c76d1a3119d9904cfe61d1d94d6cf520a52847c91d144d29c09befac`
(computed as: `find . -type f ! -path './_archive/*' ! -name
'RELEASES.md' -print0 | sort -z | xargs -0 sha256sum | sha256sum`. This
value is stable because it excludes `RELEASES.md` itself — the same
reason the documented method has always excluded this file: `LATEST.md`
and `HANDOFF.md` are included in the hash, so their content had to be
finalized before this value could be computed, which it now has been.)

**Repository Size:** 15,425,807 bytes (~14.71 MB) (`du -sb .`, all
files, final measurement after all Engine 2 Phase 3–7 changes; was
15,363,815 bytes at Round 12; **+61,992 bytes** — the three new Engine 2
files under `core/engines/media/language/`, one modified line-set in
`core/bridge/engine-bridge-bootstrap.js`, and registry/handoff/report
documentation updates across `LATEST.md`, `HANDOFF.md`,
`docs/builder/knowledge/repair-queue.md`,
`docs/builder/knowledge/documentation-integrity-registry.md`,
`docs/history/M388-E2-LanguageDetection-Compose.md`, and this file. No
file outside that set was touched.)

**File count (excl. `RELEASES.md`):** 776 total / 500 JS (was 773/497 at
Round 12; **+3 files, all new** — `language-detection-engine.js`,
`provider-lexical.js`, `tests/language-detection-engine.test.js`. Zero
files removed, zero files renamed.)

**ZIP filename:** pending final packaging pass — see delivery message
for this release (Rule 60 §2 / Rule 67 pattern).
**ZIP size:** pending final packaging pass — see delivery message.
**Package SHA-256:** Generated after packaging — see delivery message
for this release (Rule 60 §2 — never a computed value at time of
authoring, since the package's own hash depends on this file's final
content).
**ZIP integrity:** to be verified against the final packaged ZIP — see
delivery message.

**What's in this package (application-code diff from Round 12):**
`core/engines/media/language/language-detection-engine.js` (new),
`core/engines/media/language/provider-lexical.js` (new),
`core/engines/media/language/tests/language-detection-engine.test.js`
(new), `core/bridge/engine-bridge-bootstrap.js` (modified — one
`REGISTRATIONS` entry added, no other line changed). No other
application file touched — confirmed by a full-repository `diff -rq`
against the pre-Implementation checkout; `cozy-live.js`,
`cozy-speech.js`, `cozy-translate.js`, and
`core/modules/language/language-engine.js` are all byte-identical to
Round 12.

**Phase 3 (Implementation) summary:** followed the unrevised
Implementation Contract item-by-item (full detail:
`docs/history/M388-E2-LanguageDetection-Compose.md`, Phase 3 section).
Real, deterministic Unicode-script classification (Ethiopic block →
`am`/Amharic) and a real, deliberately-partial curated lexical-overlap
heuristic (`en`/`fr`/`sw`/`so`/`ha`/`yo`/`zu`/`lg` only — every other
candidate code is left honestly uncovered) run only when text is
actually available for a segment (explicit `hintText` option, or a
duck-typed `hintText`/`text`/`transcript`/`captionText` property already
present on the opaque `audioRef` — never required, never assumed).
Confidence capped (0.65 heuristic / 0.9 script match). When no text is
available — the ordinary case, since `sourceAudioRef` is opaque raw
audio per `cozy-live.js`'s own contract — an honest `{ languageCode:
null, confidence: 0, isReal: false, method: 'no-analyzable-signal' }`
envelope is returned; no acoustic (audio-feature) model exists in this
environment, and none is fabricated. Attaches to `cozy-live.js` only via
its existing `registerSubsystem('CozyLanguage', adapter)` API —
`cozy-live.js` itself is never opened for editing.

**Phase 4 (Verification) summary:** `node --check` clean on all
new/modified files. **31/31 real, executed tests pass**
(`core/engines/media/language/tests/language-detection-engine.test.js`).
Regression: Engine 1's own 23/23-test suite re-run unchanged and still
passing; the pre-existing `core/engines/media/tests/media-pipeline-manager.test.js`
failure reproduces at the identical line as before this round (missing
`background-engine.js`, `MD-004`/`MD-009`) — confirmed no new
regression.

**Phase 5 (Registry Updates):** `MD-012` status updated 🟡 Composed →
🔵 Implementing (`docs/builder/knowledge/repair-queue.md`), matching
`MD-009`/Engine 1's own precedent. `MD-016`/`DI-004` unchanged, still
correctly non-blocking/out of scope. `DI-005` opened and Resolved this
round (above).

**M388 status:** Engine 1 sub-lifecycle remains Complete/Closed
(unchanged this round). **Engine 2 sub-lifecycle: Phase 0 ✅ · Phase 1
✅ · Phase 2 ✅ Approved · Phase 3 ✅ Implemented · Phase 4 ✅ Verified ·
Phase 5–9 ✅ Registries/Reports/Handoff/Package/Close — Engine 2 is
Closed this round.** Per Rule 68, Engine 3 (Translation Pipeline,
absorbs "Living Meaning Engine" per `AA-005`) is now unlocked. **Not
started this round** — its own Phase 0 is a future session's work.

**Certification:** Repository Verified: YES (full-repository `diff -rq`
against the pre-Implementation checkout, this round). Compose Verified:
YES (carried forward). Review/Approval: YES — Approved (carried
forward). Implementation Verified: **YES** — 31/31 real tests, unrevised
Contract followed item-by-item. Verification Verified: **YES** — no
regression to Engine 1 or the pre-existing tracked failure. Handoff
Verified: YES — `LATEST.md`/`HANDOFF.md` updated same round. Artifact
SHA-256 Verified: YES — corrected method (`DI-005`), ZIP integrity
confirmed via `unzip -t`. Ready for Next Account: **YES** — Engine 2
Closed (Phase 9). Begin Engine 3's own Phase 0 in a future session; do
not start it as a continuation of this round.

---

## M388 (Round 14) — Governance-only: Rule 70 (Hash Recording Rule) adopted

**No engine work this round**, per explicit instruction: Engine 2 was
not restarted, Engine 3 was not started. This round adopts one new
governance rule, `docs/builder/rules/15-hash-recording-rule.md` (Rule
70), extending Rule 60/67, in direct response to a real bug in Round 13:
a computed Repository SHA-256 value was written into `LATEST.md`/
`HANDOFF.md` before those files' own content was final — since both are
themselves inputs to the repository hash, the embedded value went stale
the instant the file was saved. `docs/builder/rules/00-INDEX.md` updated
same round per Rule 66 (two entries added: the rule-file table row, and
a bullet in the "How this applies" section).

**Rule 70, summarized:** Repository SHA-256 belongs only in
`RELEASES.md` (already excluded from the hash, Rule 60) and the Rule 67
Delivery block. Package SHA-256 belongs only in the Delivery block,
never in any repository file (the ZIP contains `RELEASES.md` itself, so
writing the package's own hash into any packaged file is circular by
construction). Every other hashed file must be finalized *before* the
hash is computed, not after. A hash found written into a file before
that sequencing was followed must be treated as invalid and recomputed.

**This round's own delivery follows Rule 70's sequencing exactly:**
`LATEST.md`, `HANDOFF.md`, the new rule file, and the updated
`00-INDEX.md` were all finalized first; the Repository SHA-256 below was
computed only after that; it is written here, in `RELEASES.md`, and
nowhere else in the repository; the ZIP is built from this now-final
`RELEASES.md`; and the Package SHA-256 will be computed after that and
reported only in the delivery message — never written back into the
repository.

**Repository SHA-256 (this round, own checkout, final):**
`fbdbdf7192cfe65d052ff4f7b858ea40d27222b0257ae105ad79d1fdbdc8dd00`
(computed as: `find . -type f ! -path './_archive/*' ! -name
'RELEASES.md' -print0 | sort -z | xargs -0 sha256sum | sha256sum`,
against this round's own checkout with `LATEST.md`/`HANDOFF.md`/the new
rule file/`00-INDEX.md` all already finalized, per Rule 70's required
sequencing.)

**Repository Size:** 15,433,240 bytes (~14.72 MB) (`du -sb .`, all
files, measured after the Repository SHA-256 above but before this
paragraph and the ZIP-metadata placeholders below were added — so, like
every prior round, a close approximation of the truly final size rather
than a perfectly self-consistent one; this inherent approximation is the
same one every prior round's "Repository Size" figure has carried, since
`RELEASES.md`'s own growing content is counted by `du` even though it is
excluded from the SHA-256. Was 15,425,807 bytes at Round 13;
**+7,433 bytes** — one new file, `docs/builder/rules/15-hash-recording-rule.md`,
plus the `00-INDEX.md` additions and this round's `LATEST.md`/
`HANDOFF.md` edits.)

**File count (excl. `RELEASES.md`):** 777 total / 500 JS (was 776/500 at
Round 13; **+1 file, `docs/builder/rules/15-hash-recording-rule.md`**;
zero JS files added, zero files removed or renamed.)

**ZIP filename:** pending final packaging pass — see delivery message
for this release (Rule 60 §2 / Rule 67 / Rule 70 pattern).
**ZIP size:** pending final packaging pass — see delivery message.
**Package SHA-256:** Generated after packaging — see delivery message
for this release only (Rule 70 — never written into any repository
file, including this one, since the ZIP contains `RELEASES.md` itself).
**ZIP integrity:** to be verified against the final packaged ZIP — see
delivery message.

**Certification:** Repository Verified: YES. Compose/Review/Approval:
N/A — no engine work this round. Implementation/Verification: N/A —
no engine work this round. Handoff Verified: YES — `LATEST.md`/
`HANDOFF.md` updated same round, Rule 70 sequencing followed. Artifact
SHA-256 Verified: YES. Ready for Next Account: **YES** — Rule 70 adopted
and indexed; Engine 1 and Engine 2 both remain Closed, unchanged; Engine
3 remains unlocked per Rule 68, not started.

---

## M388 (Round 15) — Engine 3 (Living Translation Engine / Translation Pipeline) Phase 0–1 — Repository Verification, Compose

**No application code, no implementation this round** — Phase 0
(Repository Verification) and Phase 1 (Compose) only, per explicit
instruction. Engine 2 was not restarted; Engine 4 was not started;
Engine 3's own Phase 2 (Review/Approval) was not started.

**Scope confirmed from `docs/history/M388.md`'s Approved Implementation
Order (item 3):** "Translation Pipeline (composes existing
`cozy-translate.js` + `speech-translation-adapter.js`/`-provider.js`;
absorbs what would have been 'Living Meaning Engine,' per `AA-005`'s
closure — no separate engine)." Confirmed a real, substantial,
already-built translation chain exists to compose with — this is not a
from-scratch build. Full report:
`docs/history/M388-E3-Translation-Compose.md`.

**Two new, real findings this Compose (Rule 62, logged the moment
discovered):**
- **`MD-017` (High)** — `cozy-live.js`'s `relaySpeechSegment()` requires
  both `'CozyTranslate'` and `'CozySpeech'` subsystems via
  `getSubsystemOrThrow()` (mandatory, unlike Engine 2's optional
  `'CozyLanguage'` hook). A repository-wide `registerSubsystem(` search
  found zero production registrants for either — only test-file mocks.
  The live pipeline cannot complete a single call today, in production,
  independent of Engine 3's own translation capability existing
  elsewhere. Engine 3's own future Implementation is expected to resolve
  the `'CozyTranslate'` half; the `'CozySpeech'` half remains
  unassigned, same open status as `MD-016`.
- **`MD-018` (Medium)** — `relaySpeechSegment` computes `detectedLanguage`
  (via Engine 2's optional hook) but never forwards it into the
  `'CozyTranslate'` adapter's `translate()` call — a real gap inside
  `cozy-live.js`'s own already-shipped pipeline logic. Whether resolving
  this requires touching `cozy-live.js` itself (which Engine 3's draft
  Implementation Contract otherwise forbids) is left as an explicit open
  question for Engine 3's own Phase 2 Review — not decided at Compose
  stage.

**Draft Implementation Contract (8 items, full text in the Compose
Report):** new file only, under `core/engines/media/translation/`;
`cozy-live.js`/`cozy-translate.js`/`speech-translation-adapter.js`/
`speech-translation-provider.js` all remain untouched (with `MD-018`'s
resolution explicitly flagged as needing Phase 2 Review's confirmation,
not assumed permitted); attaches only via `registerSubsystem('CozyTranslate',
adapter)`; adapter must return `{ text: string }`, matching
`relaySpeechSegment()`'s exact existing read and
`ourcozy-live.test.js`'s existing mocks; must preserve the existing
chain's "NEVER FABRICATE" fail-closed convention; does not resolve
`MD-007` (structurally Out of Scope this milestone), `MD-016`, or the
`'CozySpeech'` half of `MD-017`.

**Decision table (6 items, full text in the Compose Report):** compose
the existing chain rather than build a new orchestrator (would duplicate
`cozy-translate.js`); `AA-005`'s merge decision is not reopened; `MD-007`
stays structurally Out of Scope; `MD-018`'s fix path is deferred to
Phase 2 Review rather than pre-decided; the `'CozySpeech'` half of
`MD-017` stays unassigned (out of Engine 3's named scope).

**M388 status:** Engine 1 and Engine 2 sub-lifecycles remain
Complete/Closed (unchanged this round). **Engine 3 sub-lifecycle: Phase
0 ✅ · Phase 1 ✅ Compose this round · Phase 2 (Review/Approval) is the
next required step, not started.** Per Rule 68, Engine 4 remains blocked
behind Engine 3's own Phase 9.

**Repository SHA-256 (this round, own checkout, final — computed after
`LATEST.md`, `HANDOFF.md`, the Repair Queue, and
`docs/history/M388-E3-Translation-Compose.md` were all finalized, per
Rule 70's required sequencing):**
`a360785943817207d754cdc5fac152a60861e6d82b636dcb0c73533c9b6f320d`
(computed as: `find . -type f ! -path './_archive/*' ! -name
'RELEASES.md' -print0 | sort -z | xargs -0 sha256sum | sha256sum`.)

**Repository Size:** measured after the Repository SHA-256 above but
before this paragraph and the ZIP-metadata placeholders below were
added (the same inherent approximation every prior round's figure has
carried, since `RELEASES.md`'s own growing content is counted by `du`
even though it is excluded from the SHA-256) — see the delivery message
for this round's final, precise value alongside the ZIP size.

**File count (excl. `RELEASES.md`):** 778 total / 500 JS (was 777/500 at
Round 14; **+1 file, `docs/history/M388-E3-Translation-Compose.md`**;
zero JS files added — Compose-stage documentation only, no application
code touched.)

**ZIP filename:** pending final packaging pass — see delivery message
for this release (Rule 60 §2 / Rule 67 / Rule 70 pattern).
**ZIP size:** pending final packaging pass — see delivery message.
**Package SHA-256:** Generated after packaging — see delivery message
for this release only (Rule 70 — never written into any repository
file, including this one).
**ZIP integrity:** to be verified against the final packaged ZIP — see
delivery message.

**Certification:** Repository Verified: YES — live searches and direct
reads of `cozy-translate.js`, `speech-translation-adapter.js`,
`speech-translation-provider.js`, and `cozy-live.js` executed against
actual source this round. Compose Verified: YES — this round's own
report. Review/Approval: **NO — pending, the correct next step.**
Implementation Verified: NO — not started, explicitly out of this
round's scope. Verification Verified: NO — nothing implemented yet.
Handoff Verified: YES — `LATEST.md`/`HANDOFF.md`/Repair Queue all
updated same round, Rule 70 sequencing followed. Artifact SHA-256
Verified: YES. Ready for Next Account: **YES** — begin Engine 3 Phase 2
(Review/Approval) per the draft Implementation Contract in
`docs/history/M388-E3-Translation-Compose.md`. Do not start Engine 4
first — it remains blocked behind Engine 3's own Phase 9 per Rule 68.

---

## M388 (Round 16) — Engine 3 (Living Translation Engine / Translation Pipeline) Phase 2 — Review/Approval; Rules 71 & 72 Adopted

**Rule 71 (Mandatory Phase Packaging) adopted this round** —
`docs/builder/rules/16-mandatory-phase-packaging-rule.md`, extending
Rule 67/68. A completed phase and an undelivered ZIP must never coexist
as a stopping point: finishing docs, verifying integrity, computing both
hashes, building the ZIP, verifying it, and printing the Rule 67
Delivery block are mandatory, automatic continuations of finishing any
phase, never a separately-approved next step.

**Rule 72 (Project Roadmap Header) adopted this round** —
`docs/builder/rules/17-roadmap-header-rule.md`, extending Rule 65/66.
`LATEST.md`/`HANDOFF.md` must each begin with a Project Roadmap Header
(current milestone, current stable ZIP, verification status, every real
engine's name/status from the milestone's own Approved Implementation
Order, next-unlock condition, completion count), sourced only from the
repository's own records — never an externally supplied roster (Rule
69 governs conflicts; one was found and corrected this round, see
below). `docs/builder/rules/00-INDEX.md` updated same round for both
rules per Rule 66.

**Rule 69 applied this round:** an externally supplied 12-engine roster
(with names not present anywhere in this repository, e.g. "Builder
Intelligence Engine," "Living Observation Engine," "Camera Vision
Engine") was proposed as the Roadmap Header's content. The repository's
own real Approved Implementation Order (`docs/history/M388.md`, Phase 2
Review) — 11 engines, different names — is authoritative and was used
instead; the discrepancy is recorded here rather than silently adopting
either the wrong count or the wrong names.

**No application code, no implementation this round** — Phase 2
(Review/Approval) only, per explicit instruction. Engine 4 was not
started; Engine 3's own Phase 3 (Implementation) was not started.

**Independent re-verification performed against actual repository
source this round (Rule 69):** every load-bearing claim in the Phase 0/1
Compose Report was re-checked directly against `cozy-translate.js`
(1,054 lines, `2.2.0-ENTERPRISE-FROZEN`), `speech-translation-adapter.js`
(339 lines, `1.1.0-ENTERPRISE`), `speech-translation-provider.js` (159
lines, verbatim "NEVER FABRICATE" header), and `modules/live/cozy-live.js`'s
`relaySpeechSegment()` — all confirmed accurate, including a fresh
repository-wide `registerSubsystem(` search (zero production registrants
for `'CozyTranslate'`/`'CozySpeech'`) and an exact count of 8
`registerSubsystem('CozyTranslate', ...)` test-mock call sites in
`ourcozy-live.test.js`. One new check this round, not performed at
Compose stage: confirmed `core/shell/cozy-live.js` (a small, unrelated
`CozyLive` UI class) is not a second copy of the translation-pipeline
composition point — no undisclosed duplicate.

**Verdict: Approved (Revised).** Architecture, ownership, and 7 of 8
draft Implementation Contract items stand unrevised. The one open
question the Compose Report itself deferred to this Review — `MD-018`'s
resolution path — is decided this round: `relaySpeechSegment()`
hardcodes `session.primaryLanguage` as the argument passed into
`translate()`, unreachable by an externally registered adapter; fixing
`MD-018` requires editing `relaySpeechSegment()` itself, which Contract
item 2 forbids. **No exception granted** — `MD-018` remains open,
unassigned, carried forward with the same treatment already given
`MD-016`. `MD-017` re-confirmed current and unresolved. No new finding
opened this round. Full report (Phase 2 section appended this round):
`docs/history/M388-E3-Translation-Compose.md`.

**Final Implementation Contract (8 items):** new file only at
`core/engines/media/translation/translation-pipeline-engine.js` (path
confirmed free); `cozy-live.js`/`cozy-translate.js`/`speech-translation-
adapter.js`/`speech-translation-provider.js` all remain untouched, no
exception granted; attaches only via `registerSubsystem('CozyTranslate',
adapter)`; adapter's `translate()` must return `{ text: string }`;
preserves the existing chain's "NEVER FABRICATE" convention; does not
resolve `MD-007`, `MD-016`, the `'CozySpeech'` half of `MD-017`, or
`MD-018` (decided this round, not left open).

**Repair Queue impact:** `MD-017` unchanged (🟡 Composed), re-confirmed
current. `MD-018` unchanged (🟡 Composed), resolution path now decided
(not resolvable by Engine 3; owner changed from "M388 Engine 3 Plan/
Review" to "Future Builder, unassigned"). `MD-007`/`MD-016` unchanged.
No new Repair Queue entry this round.

**M388 status:** Engine 1 and Engine 2 sub-lifecycles remain
Complete/Closed (unchanged this round). **Engine 3 sub-lifecycle: Phase
0 ✅ · Phase 1 ✅ · Phase 2 ✅ this round — Approved (Revised). Phase 3
(Implementation) is the next required step, not started.** Per Rule 68,
Engine 4 remains blocked behind Engine 3's own Phase 9.

**Repository SHA-256 (this round, own checkout, final — computed after
`LATEST.md`, `HANDOFF.md`, the Repair Queue, and
`docs/history/M388-E3-Translation-Compose.md` were all finalized, per
Rule 70's required sequencing):**
`03c96cf92ed429c1b52f0b6c9477bbbfa600f2cd71bc6f71c07ebba1f07b6a11`
(computed as: `find . -type f ! -path './_archive/*' ! -name
'RELEASES.md' -print0 | sort -z | xargs -0 sha256sum | sha256sum`.)

**File count (excl. `RELEASES.md`):** 780 total / 500 JS (778→779→780
this round: **+2 new files**,
`docs/builder/rules/16-mandatory-phase-packaging-rule.md` (Rule 71) and
`docs/builder/rules/17-roadmap-header-rule.md` (Rule 72) — governance
documentation only, no application code touched).

**ZIP filename:** pending final packaging pass — see delivery message
for this release.
**ZIP size:** pending final packaging pass — see delivery message.
**Package SHA-256:** Generated after packaging — see delivery message
for this release only (Rule 70 — never written into any repository
file, including this one).
**ZIP integrity:** to be verified against the final packaged ZIP — see
delivery message.

**Certification:** Repository Verified: YES — live searches and direct
reads executed against actual source this round. Compose Verified: YES
(unchanged, prior round). Review/Approval: **YES — Approved (Revised)**,
this round. Implementation Verified: NO — not started, explicitly out of
this round's scope. Verification Verified: NO — nothing implemented yet.
Handoff Verified: YES — `LATEST.md`/`HANDOFF.md`/Repair Queue all
updated same round, Rule 70 sequencing followed. Artifact SHA-256
Verified: YES. Ready for Next Account: **YES** — begin Engine 3 Phase 3
(Implementation) per the Final Implementation Contract in
`docs/history/M388-E3-Translation-Compose.md`. Do not start Engine 4
first — it remains blocked behind Engine 3's own Phase 9 per Rule 68.

---

## M388 (Round 17) — Governance-only: Rules 73 & 74 Adopted (Automatic Session Closure; Milestone Pause & Resume)

**No application code, no implementation, no engine work this round** —
governance rules and required roadmap content only. Engine 3 remains at
Phase 2 Complete (Approved, Revised); Phase 3 (Implementation) not
started this round either.

**Rule 73 (Automatic Session Closure) adopted** —
`docs/builder/rules/18-automatic-session-closure-rule.md`, extending/
restating Rule 71 as a hard behavioral requirement: on completing a
phase, the Builder must automatically update docs, build/verify the
full ZIP, print the Rule 67 Delivery block, and end the session — never
asking whether to package, continue, or finish.

**Rule 74 (Milestone Pause & Resume) adopted** —
`docs/builder/rules/19-milestone-pause-resume-rule.md`, extending Rule
65/68/72. A milestone may be paused only immediately after a Rule 71
verified-ZIP checkpoint, recording exactly which engine/phase it stopped
at in a required Milestone Roadmap. Resuming continues from that exact
point — no restarted milestone, engine, or phase. The Milestone Roadmap
is now required content at the top of `LATEST.md`/`HANDOFF.md` (above
the Rule 72 per-milestone Roadmap Header), listing every real milestone
this repository has ever tracked and its status.

**Milestone Roadmap recorded this round (real, from repository history):**
M381–M387 Completed; M387.5 Completed; **M388 ACTIVE** — Engine 1 & 2
Closed, Engine 3 at Phase 2 Complete (Approved, Revised)/Phase 3 not
started, Engines 4–11 Locked. No milestone is currently PAUSED or
WAITING — Rule 74's pause mechanism is not invoked this round, only
established.

`docs/builder/rules/00-INDEX.md` updated same round for both rules per
Rule 66.

**File count (excl. `RELEASES.md`):** 782 total / 500 JS (780→782 this
round: **+2 new files**,
`docs/builder/rules/18-automatic-session-closure-rule.md` (Rule 73) and
`docs/builder/rules/19-milestone-pause-resume-rule.md` (Rule 74) —
governance documentation only, no application code touched).

**Repository SHA-256 (this round, own checkout, final — computed after
`LATEST.md`, `HANDOFF.md`, and the Repair Queue were all finalized, per
Rule 70's required sequencing):**
`75e7b8f1fdc84a034be54ba2e70453d6c73050aa0b40a301c4898cd3a4b2d943`
(computed as: `find . -type f ! -path './_archive/*' ! -name
'RELEASES.md' -print0 | sort -z | xargs -0 sha256sum | sha256sum`.)

**ZIP filename:** pending final packaging pass — see delivery message
for this release.
**ZIP size:** pending final packaging pass — see delivery message.
**Package SHA-256:** Generated after packaging — see delivery message
for this release only (Rule 70 — never written into any repository
file, including this one).
**ZIP integrity:** to be verified against the final packaged ZIP — see
delivery message.

**Certification:** Repository Verified: YES. Compose/Review/
Implementation/Verification: unchanged from Round 16 (Engine 3 Phase 2
Complete, Phase 3 not started). Handoff Verified: YES — `LATEST.md`/
`HANDOFF.md`/`RELEASES.md`/Repair Queue all updated same round, Rule 70
sequencing followed, Rule 73's automatic-closure requirement followed
(no pause to ask before packaging). Artifact SHA-256 Verified: YES.
Ready for Next Account: **YES** — begin Engine 3 Phase 3
(Implementation) per the Final Implementation Contract in
`docs/history/M388-E3-Translation-Compose.md`. Do not start Engine 4
first — it remains blocked behind Engine 3's own Phase 9 per Rule 68.

---

## M388 Round 18 — Rule 75 (Milestone Waiting Queue) + Rule 76 (No Partial Phase Completion) Adopted; Engine 3 Closed

**Scope this round:** Adopted Rule 75 (new
`docs/builder/rules/20-milestone-waiting-queue-rule.md`, new permanent
`docs/builder/knowledge/milestone-waiting-queue.md`). Completed Engine 3
(Living Translation Engine / Translation Pipeline) Phase 3 through
Phase 9 — new file `core/engines/media/translation/translation-pipeline-engine.js`
composes the existing `cozy-translate.js`/`speech-translation-adapter.js`/
`-provider.js` chain into `cozy-live.js`'s `'CozyTranslate'` subsystem
slot, per the Final Implementation Contract (items 1–7 exact, item 8/
`MD-018` correctly not resolved). One new test file (12/12 real,
executed tests pass); one new `REGISTRATIONS` entry in
`core/bridge/engine-bridge-bootstrap.js`. `MD-017`'s `'CozyTranslate'`
half moved Composed → Fixed in the Repair Queue. Adopted Rule 76 (new
`docs/builder/rules/21-no-partial-phase-completion-rule.md`) mid-session,
in direct response to which this round stops here rather than starting
Engine 4 — packaging this checkpoint now instead of leaving Engine 3's
own completed work undelivered.

**Repository SHA-256 (this round, own checkout, final — computed after
`LATEST.md`, `HANDOFF.md`, and the Repair Queue were all finalized, per
Rule 70's required sequencing):**
`57428318ee8cbf0ca19ce2b26a4939806a54162d2817d00787598cc839eef438`
(computed as: `find . -type f ! -name 'RELEASES.md' -print0 | sort -z |
xargs -0 sha256sum | sha256sum` — no `_archive/` directory exists in
this checkout). Recomputed after correcting Rule 76's number
(originally misnamed Rule 77 in-session; corrected before packaging —
no repository file had the wrong number embedded permanently, per Rule
70's own hash-invalidation clause).

**ZIP filename:** `CozyOS-main-v3_02_04-M388-Rule75-Rule76-E3-Close.zip`
**ZIP size / Package SHA-256 / ZIP integrity:** see this session's Rule
67 Delivery block (Rule 70 — never written into any repository file,
including this one).

**Certification:** Repository Verified: YES. Compose/Review/
Implementation/Verification: Engine 3 — all YES, Closed this round
(Verification Verified: Node-level complete; browser-level end-to-end
honestly disclosed as not yet run, non-blocking). Handoff Verified: YES —
`LATEST.md`/`HANDOFF.md`/`RELEASES.md`/Repair Queue/Waiting Queue all
updated same round. Artifact SHA-256 Verified: YES. Ready for Next
Account: **YES** — begin Engine 4 (Speaker Diarization Engine) Phase 0.
Do not reopen Engine 3.

---

## M388 Round 19 — Engine 4 (Speaker Diarization) Phase 0–1 Complete

**Scope this round:** Engine 4 Phase 0 (Repository Verification) and
Phase 1 (Compose) — no implementation. New file
`docs/history/M388-E4-Diarization-Compose.md`: ownership audit (no
existing diarization owner found anywhere in the repository — `MD-011`
re-confirmed), dependency graph (Engine 1 upstream, Engines 5/7/8
downstream; Engine 1's own `isReal:false` audio-track envelope flagged as
a load-bearing constraint), duplicate-engine scan (clean), integration-
point analysis (new finding `MD-019` — `relaySpeechSegment()` has no
optional-hook pattern for diarization, resolution deferred to Phase 2
Review), and a draft, not-yet-approved 6-item Implementation Contract.
Two documentation-integrity findings from Phase 0 fixed same round:
`DI-006` (milestone-name mismatch in `milestone-waiting-queue.md`) and
`DI-007` (stale `HANDOFF.md` Rule 72 header block). Updated:
`docs/builder/knowledge/repair-queue.md` (MD-019/DI-006/DI-007 added),
`docs/builder/knowledge/milestone-waiting-queue.md`, `LATEST.md`,
`HANDOFF.md`, this file.

**Repository SHA-256 (this round, own checkout, final — computed after
`LATEST.md`, `HANDOFF.md`, the Repair Queue, and the Waiting Queue were
all finalized, per Rule 70's required sequencing):**
`27bb248edcb5455be601d0ee4ef9f8df2378f8dae10200333abcecf4e2321c9d`
(computed as: `find . -type f ! -name 'RELEASES.md' -print0 | sort -z |
xargs -0 sha256sum | sha256sum` — no `_archive/` directory exists in
this checkout).

**ZIP filename:** `CozyOS-main-v3_02_05-M388-E4-Compose.zip`
**ZIP size / Package SHA-256 / ZIP integrity:** see this session's Rule
67 Delivery block (Rule 70 — never written into any repository file,
including this one).

**Certification:** Repository Verified: YES. Compose Verified: YES
(`docs/history/M388-E4-Diarization-Compose.md`). Review/Approval: NO —
Phase 2 is next. Implementation Verified: NO — not started this round.
Handoff Verified: YES — `LATEST.md`/`HANDOFF.md`/`RELEASES.md`/Repair
Queue/Waiting Queue all updated same round. Artifact SHA-256 Verified:
YES. Ready for Next Account: **YES** — begin Engine 4 Phase 2
(Review/Approval) of `docs/history/M388-E4-Diarization-Compose.md`. Do
not start Engine 5. Do not reopen Engines 1–3.

---

## M388 Round 20 — Engine 4 (Speaker Diarization) Phase 2 Complete, Approved (Revised)

**Scope this round:** Engine 4 Phase 2 (Review/Approval) — no
implementation. Independent re-verification of every Phase 1 Compose
claim against fresh repository reads (ownership audit, dependency
graph, duplicate-engine scan all reproduced unrevised). `MD-019`
decided: no exception granted to add a new hook to `cozy-live.js` —
Engine 4's Implementation Contract revised to fully external (writes
only into `cozy-speech.js`'s existing `_speakers` registry via its
already-public API). Verdict: **Approved (Revised)**. Updated:
`docs/history/M388-E4-Diarization-Compose.md` (Phase 2 section),
`docs/builder/knowledge/repair-queue.md` (`MD-019` decision recorded),
`docs/builder/knowledge/milestone-waiting-queue.md`, `LATEST.md`,
`HANDOFF.md`, this file.

**Repository SHA-256 (this round, own checkout, final — computed after
`LATEST.md`, `HANDOFF.md`, the Repair Queue, and the Waiting Queue were
all finalized, per Rule 70's required sequencing):**
`8810f00b4c441cc8875e84e637107a09ff83c5ca3f1fd1521699160ed9f603ff`
(computed as: `find . -type f ! -name 'RELEASES.md' -print0 | sort -z |
xargs -0 sha256sum | sha256sum` — no `_archive/` directory exists in
this checkout).

**ZIP filename:** `CozyOS-main-v3_02_06-M388-E4-Review.zip`
**ZIP size / Package SHA-256 / ZIP integrity:** see this session's Rule
67 Delivery block (Rule 70 — never written into any repository file,
including this one).

**Certification:** Repository Verified: YES — fresh, independent
re-verification of every Phase 1 claim this round. Compose Verified:
YES. Review/Approval: **YES — Approved (Revised)**. Implementation
Verified: NO — not started this round. Handoff Verified: YES —
`LATEST.md`/`HANDOFF.md`/`RELEASES.md`/Repair Queue/Waiting Queue all
updated same round. Artifact SHA-256 Verified: YES. Ready for Next
Account: **YES** — begin Engine 4 Phase 3 (Implementation) of the Final
Implementation Contract in `docs/history/M388-E4-Diarization-Compose.md`.
Do not start Engine 5. Do not reopen Engines 1–3 or Engine 4 Phase 0–2.

---

## M388 Round 21 — Engine 4 (Speaker Diarization) Phase 3–9 Complete, CLOSED

**Scope this round:** Engine 4 Phase 3 (Implementation) through Phase 9
(Close). New files only:
`core/engines/media/diarization/speaker-diarization-engine.js`,
`core/engines/media/diarization/provider-speaker-hint.js`,
`core/engines/media/diarization/tests/speaker-diarization-engine.test.js`.
Modified: `core/bridge/engine-bridge-bootstrap.js` (one new
`REGISTRATIONS` entry, `speaker-diarization`) — confirmed via direct
`diff -rq` against this session's own pristine baseline extraction that
no other existing file changed, and specifically that `cozy-live.js`,
`cozy-speech.js`, `cozy-media.js`, and `media-pipeline-manager.js` are
byte-identical to baseline (Final Implementation Contract item 2, no
exception). Writes only into `cozy-speech.js`'s existing `_speakers`
registry via its already-public `registerSpeaker()`/`addActiveSpeaker()`
methods. 23/23 real, executed tests pass; Engine 1 (23/23), Engine 2
(31/31), Engine 3 (12/12) regression re-run clean; the one pre-existing
`media-pipeline-manager.test.js` failure (missing `background-engine.js`,
`MD-004`/`MD-009`) reproduced identically — no new regression. `MD-011`:
🟡 Composed → 🔵 Implementing. `MD-019` unchanged (unresolved,
unassigned — this Implementation never touches `cozy-live.js`).
Documentation updated: `docs/history/M388-E4-Diarization-Compose.md`
(Phase 3–9 sections appended), `docs/builder/knowledge/repair-queue.md`,
`docs/builder/knowledge/milestone-waiting-queue.md`, `LATEST.md`,
`HANDOFF.md`, this file.

**Honest verification-scope disclosure (Rule 116/117):** no browser/DOM
runtime is available in this environment — all verification this round
is real Node execution (`node --check`, executed test runs), not a
browser session. Disclosed as a non-blocking, Reasoned Confidence 🔍
gap on in-browser behavior specifically, same category already carried
by Engine 3's own Phase 4.

**Repository SHA-256 (this round, own checkout, final — computed after
`LATEST.md`, `HANDOFF.md`, the Repair Queue, and the Waiting Queue were
all finalized, per Rule 70's required sequencing):**
`5edd5cb928660aeaa863a41743be9b5c718bd60a76d39f7b59cbb373b6ac85b8`
(computed as: `find . -type f ! -name 'RELEASES.md' -print0 | sort -z |
xargs -0 sha256sum | sha256sum` — no `_archive/` directory exists in
this checkout).

**ZIP filename:** `CozyOS-main-v3_02_07-M388-E4-Closed.zip`
**ZIP size / Package SHA-256 / ZIP integrity:** see this session's Rule
67 Delivery block (Rule 70 — never written into any repository file,
including this one).

**Certification:** Repository Verified: YES. Compose Verified: YES.
Review/Approval: YES — Approved (Revised), unchanged from Round 20.
Implementation Verified: **YES** — 23/23 real tests, all 6 contract
items fulfilled exactly, confirmed via `diff -rq` against baseline.
Verification Verified: **YES (Node-level, complete)** — browser-level
exercise not run this round (no browser/DOM available), honestly
disclosed as open/non-blocking. Handoff Verified: YES —
`LATEST.md`/`HANDOFF.md`/`RELEASES.md`/Repair Queue/Waiting Queue all
updated same round. Artifact SHA-256 Verified: YES. Ready for Next
Account: **YES — Engine 4 CLOSED. Begin Engine 5 (Background Audio
Separation Engine) Phase 0 next. Do not start Engine 6. Do not reopen
Engines 1–4.**

---

## M388 Round 22 — Engine 5 (Background Audio Separation) Phase 0–9 Complete, CLOSED

**Scope:** Engine 5 full lifecycle. New files:
`core/engines/media/audio-separation/background-audio-separation-engine.js`,
`core/engines/media/audio-separation/provider-turn-coverage.js`,
`core/engines/media/audio-separation/tests/background-audio-separation-engine.test.js`.
Modified: `core/bridge/engine-bridge-bootstrap.js` (one new
`REGISTRATIONS` entry), `docs/builder/rules/00-INDEX.md` (Rules 77/78
adoption). Confirmed via `diff -rq` against the Engine-4-closed baseline
that no locked file (`cozy-live.js`/`cozy-speech.js`/`cozy-media.js`/
`media-pipeline-manager.js`/`audio-manager.js`/`cozy-hearing.js`)
changed. Also added: `docs/builder/rules/22-phase-focus-rule.md`,
`23-large-engine-implementation-rule.md`,
`docs/history/M388-E5-BackgroundAudioSeparation-Compose.md`.

**Findings:** `AA-007` (naming-collision risk between Engine 5 and the
unrelated, unbuilt visual `background-engine.js`) opened and Fixed by
construction this round. `MD-010`: 🟡 Composed → 🔵 Implementing.

**Tests:** 18/18 real, executed, new, all passing on first run.
Regression: Engine 1 (23/23), Engine 2 (31/31), Engine 3 (12/12),
Engine 4 (23/23) — all clean. Pre-existing `media-pipeline-manager.test.js`
failure reproduced identically (unrelated, `MD-004`/`MD-009`).

**Honest verification-scope disclosure (Rule 116/117):** no browser/DOM
runtime available; verification is real Node execution only.

**Repository SHA-256 (this round, own checkout, final):**
`4e0f3d6217f6c35acba10a815060bf051b5e27aa0d48d63b91815975f21f345d`

**ZIP filename:** `CozyOS-main-v3_02_08-M388-E5-Closed.zip`
**ZIP size / Package SHA-256:** see this session's Rule 67 Delivery
block (never written into any repository file, per Rule 70).

**Certification:** Repository Verified: YES. Compose Verified: YES.
Review/Approval: YES — Approved (not Revised). Implementation Verified:
YES. Verification Verified: YES (Node-level). Handoff Verified: YES.
Artifact SHA-256 Verified: YES. Ready for Next Account: **YES — Engine 5
CLOSED. Begin Engine 6 (Subtitle Timeline Engine) Phase 0 next.**

---

## M388 Round 23 — Engine 6 (Subtitle Timeline) Phase 0–9 Complete, CLOSED

**Scope:** Engine 6 full lifecycle. New files:
`core/engines/media/subtitles/subtitle-timeline-engine.js`,
`core/engines/media/subtitles/provider-srt-formatter.js`,
`core/engines/media/subtitles/tests/subtitle-timeline-engine.test.js`.
Modified: `core/bridge/engine-bridge-bootstrap.js` (one new
`REGISTRATIONS` entry). Confirmed via `diff -rq` against the
Engine-5-closed baseline that no locked file (`cozy-live.js`/
`cozy-speech.js`/`cozy-media.js`/`media-pipeline-manager.js`/
`audio-manager.js`/`cozy-hearing.js`/`ldce-caption-engine.js`) changed.
Also added: `docs/history/M388-E6-SubtitleTimeline-Compose.md`.

**Findings:** `MD-014`: 🟡 Composed → 🔵 Implementing. No new
naming-collision or duplicate-scope finding this round (unlike Engine
5's `AA-007`).

**Tests:** 22/22 real, executed, new — after one real test-file bug
(sorting a frozen array in place) caught and fixed during Phase 4's
verify-fix-reverify loop, not an engine defect. Regression: Engine 1
(23/23), Engine 2 (31/31), Engine 3 (12/12), Engine 4 (23/23), Engine 5
(18/18) — all clean. Pre-existing `media-pipeline-manager.test.js`
failure reproduced identically (unrelated, `MD-004`/`MD-009`).

**Honest verification-scope disclosure (Rule 116/117):** no browser/DOM
runtime available; verification is real Node execution only.

**Repository SHA-256 (this round, own checkout, final):**
`2fe08f2d3e41a984f516478985b0eef23f9ff52954affbd89b4124a00d7311c1`

**ZIP filename:** `CozyOS-main-v3_02_09-M388-E6-Closed.zip`
**ZIP size / Package SHA-256:** see this session's Rule 67 Delivery
block (never written into any repository file, per Rule 70).

**Certification:** Repository Verified: YES. Compose Verified: YES.
Review/Approval: YES — Approved (not Revised). Implementation Verified:
YES. Verification Verified: YES (Node-level). Handoff Verified: YES.
Artifact SHA-256 Verified: YES. Ready for Next Account: **YES — Engine 6
CLOSED. Begin Engine 7 (Voice Generation Engine) Phase 0 next.**

---

## M388 (Engine 7 — Phase 0 + Phase 1 Compose)

**Repository SHA-256 (this round, own checkout, final):**
`b551e8f68cbdb8cb9b48d19a3459874a051b83944b7145a1a65f08f962814b81`

**Repository Size:** 15,683,249 bytes (~14.96 MB)

**ZIP filename:** `CozyOS-main-v3_02_10-M388-E7-Compose.zip`
**ZIP size / Package SHA-256:** see this session's Rule 67 Delivery
block (never written into any repository file, per Rule 70).

**What's in this package:** Engine 7 (Voice Generation Engine) Phase 0
(re-)verified (repository SHA-256 matched the delivered ZIP's own recorded
value exactly) and Phase 1 (Compose) completed —
`docs/history/M388-E7-VoiceGeneration-Compose.md`. **Central finding:**
every existing TTS capability in this repository
(`cozy-tts-browser-adapter.js`, `voice-manager.js`, both read directly)
is playback-only — the Web Speech API provides no standard way to capture
synthesized speech as a capturable audio buffer/track. Engine 7's
recommended scope (Option A of the Compose's §9 decision) composes the
real, existing playback path only; capturing a real audio buffer for
Engine 9 (Media Encode) to mux remains unsolved — logged as **new finding
`MD-020`**, High priority, in `repair-queue.md`. `LATEST.md`/`HANDOFF.md`/
`milestone-waiting-queue.md` all updated to Engine 7 Phase 0 ✅ / Phase 1 ✅
→ Phase 2 next. No application code changed this pass (Compose is
documentation-only, per Rule 65/77).

**M388 status:** Engine 7 IN PROGRESS (not Closed) — Phase 2 (Review/
Approval) is the correct next step, not Engine 8. Per Rule 68, Engine 8
remains locked until Engine 7 reaches Phase 9.

---

## M388 (Rule 79 Adoption) — Mandatory Phase Checkpoint

**Repository SHA-256 (this round, own checkout, final):**
`64357640735eb3d4c673c598686d404eee0bae0b8cfbe0231d592613b0f3fedb`

**Repository Size:** 15,685,672 bytes (~14.96 MB)

**ZIP filename:** `CozyOS-main-v3_02_11-M388-Rule79.zip`
**ZIP size / Package SHA-256:** see this session's Rule 67 Delivery
block (never written into any repository file, per Rule 70).

**What's in this package:** Rule 79 — Mandatory Phase Checkpoint adopted
verbatim (`docs/builder/rules/24-mandatory-phase-checkpoint-rule.md`).
Generalizes Rule 78's per-phase packaging discipline to every phase
(0–9): no completed phase exists without a delivered ZIP; the latest
delivered ZIP is always the official recovery point. `00-INDEX.md`
updated with the new entry. `LATEST.md`/`HANDOFF.md` updated to record
the adoption. Documentation only — no application code changed, Engine 7
unchanged (Phase 0 ✅ / Phase 1 ✅ → Phase 2 next).

**M388 status:** unchanged by this round — Engine 7 IN PROGRESS, Phase 2
(Review) is the correct next step, not Engine 8.

---

## M388 (Engine 7 — Phase 2 Review)

**Repository SHA-256 (this round, own checkout, final):**
`b566781d886cd70b35766650364815ad989d52578ba1833781b6abfda119ce4b`

**Repository Size:** 15,689,673 bytes (~14.96 MB)

**ZIP filename:** `CozyOS-main-v3_02_12-M388-E7-Review.zip`
**ZIP size / Package SHA-256:** see this session's Rule 67 Delivery
block (never written into any repository file, per Rule 70).

**What's in this package:** Engine 7's Phase 2 (Review/Approval) —
appended to `docs/history/M388-E7-VoiceGeneration-Compose.md`. Every
technical claim in the Compose report (real `speakPreview()` export,
`VoiceManager`'s genuine composition rather than reimplementation,
`getLastSpokenProviderId()`, the audio-capture-gap finding, zero name
collisions) was independently re-executed against the actual source this
round — no discrepancy found. **Verdict: Approved** (not Revised).
`MD-020` re-confirmed unchanged, not newly discovered this round.
`LATEST.md`/`HANDOFF.md`/`milestone-waiting-queue.md` updated to Phase 2
✅ → Phase 3 next. No application code changed (Review is
documentation-only, per Rule 65/77).

**M388 status:** Engine 7 IN PROGRESS (not Closed) — **Phase 3
(Implementation) is unlocked and is the correct next step**, not Engine
8. Per Rule 79, this session stops here: ZIP delivered, Phase 3 begins in
a future pass.

---

## M388 (Engine 7 — Phase 3 Implementation)

**Repository SHA-256 (this round, own checkout, final):**
`2543557b859096af71ec33bc3de96548dce8e07879cd89291503af379d0143bc`

**Repository Size:** 15,710,040 bytes (~14.98 MB)

**ZIP filename:** `CozyOS-main-v3_02_13-M388-E7-Phase3.zip`
**ZIP size / Package SHA-256:** see this session's Rule 67 Delivery
block (never written into any repository file, per Rule 70).

**What's in this package:** Engine 7's Phase 3 (Implementation), per its
own Implementation Contract (§12 of the Compose Report). New files:
`core/modules/speech/generation/voice-generation-engine.js` (orchestration
only — composes `window.CozyOS.VoiceManager.speak()`, falling back to
`window.CozyOS.CozyTTSBrowserAdapter.speakPreview()` only if
`VoiceManager` is unavailable) and
`core/modules/speech/generation/tests/voice-generation-engine.test.js`
(13/13 real tests pass). One additive line in
`core/bridge/engine-bridge-bootstrap.js`. **Zero ownership violation**:
`cozy-speech.js`/`voice-manager.js`/`cozy-tts-browser-adapter.js`
confirmed byte-identical to the pre-Phase-3 checkpoint. **Zero
regression**: all 6 prior engines' own test suites re-run unmodified,
129/129 pass, unchanged from their own last-recorded counts. `MD-020`
remains open and unresolved by this Implementation — deliberately not
attempted this pass, exactly as disclosed at Compose/Review time.
`LATEST.md`/`HANDOFF.md`/`milestone-waiting-queue.md`/`repair-queue.md`
updated to Phase 3 ✅ → Phase 4 next. Per this session's explicit
instruction, **Phase 4 (Verification) itself is intentionally not
started** — the implementation was self-checked by direct execution
(tests run, regression confirmed, ownership hash-compared) as ordinary
development due diligence, but that is not being recorded as a completed
governance Phase 4.

**M388 status:** Engine 7 IN PROGRESS (not Closed) — **Phase 4
(Verification) is the correct next step**, not Engine 8. Per Rule 68,
Engine 8 remains locked until Engine 7 reaches Phase 9. Per this
session's instruction, session stops here.

---

## M388 (Engine 7 — Phase 4–9, CLOSED)

**Repository SHA-256 (this round, own checkout, final):**
`d13cd7e15516844e82698b08c266fcbdfbde45445567ee25a90e970fa6ce98b0`

**Repository Size:** 15,723,646 bytes (~15.00 MB)

**ZIP filename:** `CozyOS-main-v3_02_14-M388-E7-Closed.zip`
**ZIP size / Package SHA-256:** see this session's Rule 67 Delivery
block (never written into any repository file, per Rule 70).

**What's in this package:** Engine 7's Phase 4 (Verification) through
Phase 9 (Close), per Rule 65. `node --check` clean across every file
under `core/engines/` and `core/modules/speech/`. **13/13 real,
executed tests pass**
(`core/modules/speech/generation/tests/voice-generation-engine.test.js`).
All 6 prior engines' own suites re-run unmodified: 23/23, 31/31, 12/12,
23/23, 18/18, 22/22 — **129/129, byte-identical to their own
last-recorded counts. 142/142 total this pass, zero regressions.**
Ownership re-confirmed: `cozy-speech.js`, `voice-manager.js`,
`cozy-tts-browser-adapter.js` all unchanged; `engine-bridge-bootstrap.js`
carries exactly one additive `voice-generation` entry. No genuine
implementation defect found — Phase 3 was not reopened. `MD-020` updated
in the Repair Queue: Engine 7's own orchestration-only scope is
complete/Closed; the underlying buffer-capture question remains
correctly open/High, still blocking Engine 9.
`LATEST.md`/`HANDOFF.md`/`milestone-waiting-queue.md`/`repair-queue.md`
all updated to Engine 7 Closed → Engine 8 unlocked, Phase 0 not started.

**M388 status:** Engine 7 CLOSED. **Engine 8 (Synchronization Engine)
Phase 0 (Repository Verification) is the correct next step**, per Rule
68. Per this session's instruction, session stops here.

---

## M388 (Engine 8 — Phase 0 + Phase 1 Compose)

**Repository SHA-256 (this round, own checkout, final):**
`f28f23d0e512214820c4bcced26b29327799e4d6fc662f87425c8a06dc27ff60`

**Repository Size:** 15,742,003 bytes (~15.01 MB)

**ZIP filename:** `CozyOS-main-v3_02_15-M388-E8-Compose.zip`
**ZIP size / Package SHA-256:** see this session's Rule 67 Delivery
block (never written into any repository file, per Rule 70).

**What's in this package:** Engine 8's Phase 0 (Repository Verification)
and Phase 1 (Compose), per Rule 65. New file:
`docs/history/M388-E8-Synchronization-Compose.md`. New Repair Queue
findings: `MD-021` (High — no engine in the Approved 11-engine order
produces a real audio duration or buffer, so no component can compute a
real numeric timing offset/drift; environment-level constraint, not an
Engine 6/7 defect) and `AA-008` (naming-collision scan against 4
unrelated `*sync*` modules — closed, no collision). Engine 8's honestly
composed scope: a real, deterministic timing-vs-playback cross-check/
classification joining Engine 6's cue timeline against Engine 7's
playback results by `segmentId` — never a fabricated drift value. Draft
6-item Implementation Contract recorded, pending Phase 2 Review. **No
application code changed this pass** — Engines 1–7's own files confirmed
unchanged (checksum-verified).
`LATEST.md`/`HANDOFF.md`/`milestone-waiting-queue.md`/`repair-queue.md`
all updated to Phase 1 ✅ → Phase 2 next.

**M388 status:** Engine 8 IN PROGRESS (not Closed) — **Phase 2
(Review/Approval) is the correct next step**, not Phase 3, and not
Engine 9. Per Rule 68, Engine 9 remains locked until Engine 8 reaches
Phase 9. Session stops here.

---

## M388 (Engine 8 — Phase 2 Review/Approval — APPROVED)

**Repository SHA-256 (this round, own checkout, canonical method):**
`a8f07275dc076a14ca6d2ffac885860daa0087124295d54e99364432e1b0791d`

**Repository Size:** 15,858,925 bytes (~15.13 MB), 807 files / 513 JS
files, excluding `_archive/` (was 15,742,003 bytes at the prior round
"Engine 8 Phase 0+1 Compose" — that round's own entry did not record a
file count, so only the byte-size delta is compared here: +116,922
bytes, consistent with the documentation/registry-only edits this pass)

**ZIP filename:** see this session's Rule 67 Delivery block.
**ZIP size / Package SHA-256:** see this session's Rule 67 Delivery
block (never written into any repository file, per Rule 70).

**What's in this package:** Engine 8's Phase 2 (Review/Approval), per
Rule 65. `docs/history/M388-E8-Synchronization-Compose.md` extended with
its Phase 2 section. **Independent re-verification** of every Phase 0/1
claim against live source (Engine 6/7 output shapes, Engine 1's
`isReal:false`, `MD-021`'s constraint, target-path collision check,
`engine-bridge-bootstrap.js` registration pattern) — all confirmed
accurate. **Real gap found and corrected in place:** `AA-008`'s naming-
collision scan, re-run from scratch against its own stated search
pattern, found two additional real hits it had missed —
`modules/live/cozy-live.js`'s `syncTimestamp()`/`EVENT_SYNC` and
`core/network/cozy-network-orchestrator.js`'s `#stampMediaSync()`. Both
confirmed **not duplicates** of Engine 8's proposed per-`segmentId`
cue-vs-playback classification (different data model/purpose; neither
reads Engine 6's or Engine 7's output). `AA-008` revised in the Repair
Queue to include both with the same "checked, no collision" disposition.
New, informational finding **`MD-022`** logged (an unbuilt "Scene
Manager" referenced by an unrelated, adjacent file — tangential to
Engine 8, not blocking). **Verdict: Approved**, with the `AA-008`
revision applied; the Draft Implementation Contract's substance is
unchanged and is now Final. **No application code changed this
pass** — Engines 1–7's own files confirmed unchanged.
`LATEST.md`/`HANDOFF.md`/`milestone-waiting-queue.md`/`repair-queue.md`
all updated to Phase 2 ✅ Approved → Phase 3 next.

**M388 status:** Engine 8 IN PROGRESS (not Closed) — **Phase 3
(Implementation) is the correct next step**, per Rule 68/71/79. Per this
session's explicit instruction, Phase 3 was not started this pass. Do
not start Engine 9. Session stops here pending the next explicit
instruction.

---

---

## M388 (Governance — Rule 80 Adopted, Builder Stop Gate)

**Not an engine round.** Per the person's explicit direction, this round
adds a new governance rule rather than progressing Engine 8.

**What changed:**
- **New:** `docs/builder/rules/25-builder-stop-gate-rule.md` — **Rule
  80, Builder Stop Gate**, the repository's new final safety rule.
  Extends Rules 67/71/73/76/79 (which already state the packaging
  procedure) with a minimal, one-question gate: "Has a verified ZIP been
  produced for the work completed this session?" — if no, the session
  may not end, no deferral language may be written, and no new work may
  begin until a verified ZIP and Rule 67 Delivery Block exist.
- **`docs/builder/rules/00-INDEX.md`** — new row for Rule 80, in required
  reading order.
- **`HANDOFF.md`** — new `⚠ BUILDER STOP CHECK (Rule 80)` checklist block
  inserted at the very top of the file, before the Project Roadmap
  Header.
- **`LATEST.md`** — new one-sentence reminder ("SESSION CANNOT END
  WITHOUT A VERIFIED ZIP") inserted at the very top of the file.
- The fourth layer described by the person (a final-reminder block in
  the Builder Prompt itself) is not a repository artifact — it lives in
  the prompt the person sends, not in this codebase — so nothing was
  added here for it; noted for completeness only.

**Why a new rule rather than editing Rule 79:** Rule 79 is a procedure
(what to do at a phase boundary). Rule 80 is a gate condition (a single
check applied regardless of which phase or sub-step the Builder is in),
deliberately the shortest rule in the repository so it survives even if
a Builder has started to lose track of the fuller procedure above it.
Per Rule 15 (Cumulative, Never Replaced), Rule 80 does not alter or
override Rules 1–79 — it is strictly additive.

**M388 status:** unchanged by this round — Engine 8 remains at Phase 2
Approved, Phase 3 (Implementation) still the correct next engine-work
step. This round is a standalone governance change, packaged and
delivered on its own per the very rule it introduces.

**Repository SHA-256 (this round, own checkout, canonical method):**
`3bcd4fb4977a3e61dd32a30a3fe6b2dbe7c20ed1f46e42b763589f3d58f64dfa`

**Repository Size:** 15,868,210 bytes (~15.13 MB), 808 files / 513 JS
files, excluding `_archive/` (was 15,858,925 bytes / 807 files at the
prior round — +9,285 bytes / +1 file: `25-builder-stop-gate-rule.md`
new; `00-INDEX.md`/`HANDOFF.md`/`LATEST.md` edited, no application code
touched)

**ZIP filename / size / Package SHA-256:** see this session's Rule 67
Delivery block (never written into any repository file, per Rule 70).

---

## M388 (Round — Engine 8 Closed) — Synchronization Engine, Phase 3–9 (Implementation through Close)

**Confirms prior round's Repository SHA-256:** `3bcd4fb4977a3e61dd32a30a3fe6b2dbe7c20ed1f46e42b763589f3d58f64dfa`
— independently reverified against this round's own checkout before any
work began; no discrepancy found.

**What changed:** Engine 8 (Synchronization Engine) implemented and
Closed. New files: `core/engines/media/synchronization/synchronization-engine.js`,
`.../tests/synchronization-engine.test.js`,
`.../tests/synchronization-engine.integration.test.js`. One additive
`REGISTRATIONS` entry in `core/bridge/engine-bridge-bootstrap.js`
(`synchronization`) — confirmed the only line changed there via diff.
`subtitle-timeline-engine.js`/`voice-generation-engine.js` confirmed
byte-identical to a pristine, freshly re-extracted checkout.

Core method `crossCheckTiming(timeline, playbackResults, options)` —
real, deterministic, `segmentId`-keyed join of Engine 6's cue timeline
against Engine 7's playback results into `aligned`/
`timing-without-playback`/`playback-without-timing`/`unresolved`. Never
computes or returns a drift/offset value —
`getCapabilities().realDriftMeasurement` is honestly `false` in every
case, per `MD-021` (no engine in this pipeline produces a real audio
duration/buffer to measure drift against).

**Verification:** 21/21 new unit tests pass; 3/3 new real end-to-end
integration tests pass (fed the actual live output of
`SubtitleTimelineEngine.buildTimeline()` and
`VoiceGenerationEngine.generateSpeechForSegments()`, not fixtures); all
7 prior engines' suites re-run unmodified, 142/142 pass. **166/166
total this round, zero regressions.** The one pre-existing failure
(`core/engines/media/tests/media-pipeline-manager.test.js`, `MD-004`/
`MD-009`, missing `background-engine.js`) confirmed byte-identical to
the pristine checkout — not a regression.

`MD-021` updated: 🟡 Composed → 🔵 Implementing. `MD-022`/`MD-020`/
`MD-015` unaffected, correctly out of scope. `LATEST.md`/`HANDOFF.md`/
`docs/builder/knowledge/milestone-waiting-queue.md`/
`docs/builder/knowledge/repair-queue.md`/
`docs/history/M388-E8-Synchronization-Compose.md` all updated this
round.

**M388 status:** Engine 8 CLOSED (Phase 9). Per Rule 68, Engine 9
(Media Encode Engine) is now unlocked — **not started this round**, per
this session's explicit scope (Engine 8 only, per Rule 79). Do not skip
Engine 9's own Phase 0/Compose/Review before Implementation.

**Repository SHA-256 (this round, own checkout, canonical method):**
`8bb5b91936df1d55198165e2cb658edea1e85aa0626bb54a1eaeba36acac9305`

**Repository Size:** 15,915,564 bytes (~15.18 MB), 811 files / 516 JS
files, excluding `_archive/` (was 15,868,210 bytes / 808 files at the
prior round — +47,354 bytes / +3 files: the two new test files + the
new engine file; `engine-bridge-bootstrap.js`,
`docs/history/M388-E8-Synchronization-Compose.md`, `LATEST.md`,
`HANDOFF.md`, `docs/builder/knowledge/repair-queue.md`,
`docs/builder/knowledge/milestone-waiting-queue.md` edited)

**ZIP filename / size / Package SHA-256:** see this session's Rule 67
Delivery block (never written into any repository file, per Rule 70).

---

## M388 Round 24 — Engine 9 (Media Encode Engine) Phase 0 + Phase 1 (Compose); Rule 69 Conflict Resolved

**No application code, no implementation this round** — Phase 0
(Repository Verification) + Phase 1 (Compose) only, per this session's
explicit stop point. Phase 2 not started; Engine 10 not started.

**Rule 69 conflict found and resolved this round.** The session prompt
that opened this pass described Engine 9 as a "Living AI Learning
Engine — the permanent learning brain used by Cozy Builder, CozyOS,
Future Living Engines." No such engine exists anywhere in this
repository. The real, twice-Reviewed Approved Implementation Order
(`docs/history/M388.md`), the Milestone Waiting Queue (verbatim: "Next
Engine action: Engine 9 (Media Encode Engine) may now begin its own
Phase 0"), and both `MD-009`'s and `MD-020`'s own Repair Queue text
("blocks Engine 9 (Media Encode)'s actual output") all independently
confirm Engine 9 is the **Media Encode Engine**. Per Rule 69, the
repository is authoritative — this round composed against the real
Engine 9. Full conflict record, at the top of
`docs/history/M388-E9-MediaEncode-Compose.md`.

**Phase 0 (Repository Verification) — complete.** ZIP integrity clean
against `CozyOS-main-v3_02_18-M388-E8-Closed.zip`. Repository SHA-256
recomputed and matched `RELEASES.md`'s recorded value exactly
(`8bb5b91936df1d55198165e2cb658edea1e85aa0626bb54a1eaeba36acac9305`).
811 files (excl. `RELEASES.md`) / 516 JS confirmed. `LATEST.md`,
`HANDOFF.md`, `RELEASES.md`, `docs/builder/rules/00-INDEX.md` (Rules
65–80 all confirmed present on disk), the Repair Queue, the Milestone
Waiting Queue, and `docs/history/M388.md`'s Approved Implementation
Order all read in full.

**Phase 1 (Compose) — complete.** Searched the repository for existing
AI/learning/memory/reasoning/observation/knowledge/imagination/sensing/
repair systems (per the prompt's own framing) and, separately, for
Engine 9's real mission (media container mux/encode):
- Engine 1's `videoTrackRef` (`realDecode: false`) and Engine 7's speech
  generation (`realAudioBuffer: false`, unconditional — `MD-020`) are
  Engine 9's two real upstream inputs, and **neither carries real data
  today** — Engine 9 can therefore only honestly compose a structural
  envelope this milestone, the same pattern Engine 1 already established
  for decode.
- `core/engines/media/record-export-session-manager.js` (pre-existing,
  Milestone 140) read in full — confirmed **not** a duplicate: different
  data shape (`videoFrames[]` + one buffer, frame-by-frame, for an
  already-captured session) and different scope (packaging/export of an
  in-memory capture vs. re-mux of a downloaded video file); its own
  docstring already disclaims the overlap.
- `codec-encoding-engine.js`/`codec-decoding-engine.js` reserved-path
  boundary (`AA-006`) reconfirmed — still absent (`MD-004`), still a
  narrower still-image contract, still not Engine 9's scope.
- Repository-wide search for `mux`/`remux`/`demux` and any media-encode
  function found no existing or duplicate Media Encode Engine anywhere.
  `core/engines/media/encode/` confirmed free — consistent with the
  one-subdirectory-per-engine pattern Engines 1, 3–8 all used.
- No new Repair Queue entry required — `MD-009`, `MD-020`, `MD-004` all
  re-confirmed current and unchanged.

**Draft 7-item Implementation Contract:** new file only at
`core/engines/media/encode/media-encode-engine.js`; one additive
`REGISTRATIONS` entry (`media-encode` / `MediaEncodeEngine`); attaches
only via `cozy-media.js`'s existing `Adapters`/`Pipelines` registries,
same pattern as Engine 1; honest structural envelope only —
`getCapabilities().realEncode` must stay `false`, no fabricated byte
output; consumes Engine 1/7/8's real outputs as-is, does not
re-implement them; does not resolve `MD-004`; does not implement Engine
10/11. Full report: `docs/history/M388-E9-MediaEncode-Compose.md`.

**Repair Queue impact:** `MD-009` — owner text updated (Engine 9 Compose
complete, Implementation not started). `MD-020` — re-confirmed unchanged,
note added that it directly blocks Engine 9's own Draft Contract from
claiming real output. `MD-004` unchanged. No new entries.

**Milestone Waiting Queue impact:** Engine 9 updated to Phase 0 ✅ ·
Phase 1 ✅ Compose, Phase 2 next. Naming correction recorded (Rule 69
conflict). Current Stable ZIP pointer updated to this round's own
delivery.

**File count (excl. `RELEASES.md`):** 811 total / 516 JS (810→811 this
round: **+1 new file**, `docs/history/M388-E9-MediaEncode-Compose.md` —
Compose documentation only, no application code touched. `LATEST.md`,
`HANDOFF.md`, the Repair Queue, and the Milestone Waiting Queue were
also edited this round, not newly created.)

**Repository SHA-256 (this round, own checkout, final — computed after
`LATEST.md`, `HANDOFF.md`, the Repair Queue, the Milestone Waiting
Queue, and the new Compose report were all finalized, per Rule 70's
required sequencing):**
`d5b94a8561994c2dc67d2316fd825563c478e6438ec93d853baa7c710da70716`
(computed as: `find . -type f ! -path './_archive/*' ! -name
'RELEASES.md' -print0 | sort -z | xargs -0 sha256sum | sha256sum`.)

**ZIP filename / size / Package SHA-256:** see this session's Rule 67
Delivery block (never written into any repository file, per Rule 70).

**Certification:** Repository Verified: YES. Compose Verified: YES —
this round. Review/Approval: NO — not started, out of this round's
explicit scope. Implementation Verified: NO. Verification Verified: NO.
Handoff Verified: YES — `LATEST.md`/`HANDOFF.md`/`RELEASES.md`/Repair
Queue/Milestone Waiting Queue all updated same round, Rule 70 sequencing
followed, Rule 71/73 automatic-packaging requirement followed (no pause
to ask). Ready for Next Account: **YES** — begin Engine 9 Phase 2
(Review/Approval) per the Draft Implementation Contract in
`docs/history/M388-E9-MediaEncode-Compose.md`. Do not start Engine 10 —
it remains blocked behind Engine 9's own Phase 9 per Rule 68.

---

## M388 Round 25 — Engine 9 (Media Encode Engine) Phase 2 — Review/Approval

**No application code, no implementation this round** — Phase 2
(Review/Approval) only, per Rule 77 (Phase Focus). Phase 3 not started;
Engine 10 not started.

**Independent re-verification performed against actual repository
source this round (Rule 69):** every load-bearing Phase 1 claim
re-checked directly, not restated —
- Engine 1's `videoTrackRef` followed into `provider-inmemory.js`'s
  `_envelope()`: `isReal: false` hardcoded on every call;
  `getCapabilities().realDecode` hardcoded `false`.
- Engine 7's `realAudioBuffer: false` confirmed hardcoded, unconditional,
  in both `generateSpeechForSegment()` and `generateSpeechForSegments()`.
- Duplicate/mux/remux/demux scan re-run — clear, unchanged from Phase 1.
- `record-export-session-manager.js` re-read in full — confirmed still
  a different data model (`videoFrames[]` + one buffer vs. Engine 9's
  track/container pair) — not a duplicate.
- `core/engines/media/encode/` re-confirmed free.
- `engine-bridge-bootstrap.js`'s `REGISTRATIONS` array re-confirmed no
  `'media-encode'` entry exists.
- `cozy-media.js`'s `Adapters`/`Pipelines` registries re-confirmed real
  and available.

**Verdict: Approved, no revision required.** All 7 Draft Implementation
Contract items confirmed sound as written under independent
re-verification — no open question left by Compose, unlike Engine 3's
or Engine 8's own Phase 2 Reviews. **Phase 3 (Implementation) is
unlocked.** Full Phase 2 section appended to
`docs/history/M388-E9-MediaEncode-Compose.md`.

**Final 7-item Implementation Contract (unrevised):** new file only at
`core/engines/media/encode/media-encode-engine.js`; one additive
`REGISTRATIONS` entry (`media-encode` / `MediaEncodeEngine`); attaches
only via `cozy-media.js`'s `Adapters`/`Pipelines` registries; honest
structural envelope only — `realEncode` must stay `false`; does not
resolve `MD-009`/`MD-020`/`MD-004`; does not implement Engine 10/11.

**Repair Queue impact:** `MD-009` owner text updated (Phase 2 Approved,
Phase 3 unlocked). `MD-020`/`MD-004` unchanged, correctly still
open/out of scope. No new finding.

**Milestone Waiting Queue impact:** Engine 9 updated to Phase 0–2 all
✅, Phase 3 next. Current Stable ZIP pointer updated to this round's own
delivery.

**File count (excl. `RELEASES.md`):** 811 total / 516 JS — unchanged
this round (no new file; `LATEST.md`, `HANDOFF.md`, the Repair Queue,
the Milestone Waiting Queue, and
`docs/history/M388-E9-MediaEncode-Compose.md` all edited, none newly
created).

**Repository SHA-256 (this round, own checkout, final — computed after
`LATEST.md`, `HANDOFF.md`, the Repair Queue, the Milestone Waiting
Queue, and the Compose report's Phase 2 section were all finalized, per
Rule 70's required sequencing):**
`71af032b5e0bb21670f674d55d5196f8905f95c5c4d1f91aa3b9f826e92f1fdf`
(computed as: `find . -type f ! -path './_archive/*' ! -name
'RELEASES.md' -print0 | sort -z | xargs -0 sha256sum | sha256sum`.)

**ZIP filename / size / Package SHA-256:** see this session's Rule 67
Delivery block (never written into any repository file, per Rule 70).

**Certification:** Repository Verified: YES. Compose Verified: YES
(unchanged, prior round). Review/Approval: **YES — Approved, no
revision**, this round. Implementation Verified: NO — not started, out
of this round's scope. Verification Verified: NO. Handoff Verified:
YES — `LATEST.md`/`HANDOFF.md`/`RELEASES.md`/Repair Queue/Milestone
Waiting Queue all updated same round, Rule 70 sequencing followed,
Rule 71/73/79 automatic-packaging requirement followed (no pause to
ask, ZIP produced at this phase checkpoint before Phase 3 begins).
Ready for Next Account: **YES** — begin Engine 9 Phase 3
(Implementation) per the Final Implementation Contract in
`docs/history/M388-E9-MediaEncode-Compose.md`. Do not start Engine 10 —
it remains blocked behind Engine 9's own Phase 9 per Rule 68.

---

## M388 Round — Engine 9 (Media Encode Engine) Phase 3–9 Complete, CLOSED

**Scope this round:** Implemented Engine 9 (Media Encode Engine) per its
approved 7-item Final Implementation Contract — new file
`core/engines/media/encode/media-encode-engine.js`, real deterministic
`buildEncodePlan()` composing Engine 1/7/8's real outputs into a
structural mux plan (`realEncode: false`, honest); one additive
`REGISTRATIONS` entry; `attachToCoordinator()` via `cozy-media.js`'s
existing registries only. 12/12 real tests pass; Engines 1–8's 166
regression tests re-run unmodified (178/178 total this round). `MD-009`
encode-half owner text updated; `MD-020`/`MD-004` unaffected. Engine 9
Closed (Phase 9); Engine 10 (Streaming/Playback Pipeline Engine)
unlocked, not started, per Rule 68/77.

**Repository SHA-256 (this round, own checkout, final — computed after
`LATEST.md`, `HANDOFF.md`, and the Repair Queue/Waiting Queue were all
finalized, per Rule 70's required sequencing):**
`ada967e18c3e1c6456870d3cc6c9357995e9926c0e1cbf306f30489f6268cecb`
(computed as: `find . -type f ! -name 'RELEASES.md' -print0 | sort -z |
xargs -0 sha256sum | sha256sum` — no `_archive/` directory exists in
this checkout).

**ZIP filename / size / Package SHA-256:** see this session's Rule 67
Delivery block (never written into any repository file, per Rule 70).

**Certification:** Repository Verified: YES. Compose/Review: YES
(unchanged, prior rounds). Implementation Verified: **YES** — 12/12 real
tests, all 7 contract items exact. Verification Verified: **YES**
(Node-level, complete; browser-level end-to-end honestly disclosed as
not yet run, non-blocking). Handoff Verified: YES —
`LATEST.md`/`HANDOFF.md`/`RELEASES.md`/Repair Queue/Milestone Waiting
Queue all updated same round, Rule 76/77/78 followed throughout (no
partial phase left unpackaged; Phase Focus maintained — Engine 10 not
started). Ready for Next Account: **YES** — begin Engine 10 (Streaming/
Playback Pipeline Engine) Phase 0. Do not reopen Engine 9.

---

## M388 Round — Engine 10 (Streaming/Playback Pipeline Engine) Phase 0–2 (Compose + Review), Approved

**Scope this round:** Repository SHA-256 reverified against this file
before work began; a stale checkpoint hash supplied by the session
prompt (Engine 9's pre-implementation Phase 2 checkpoint) was correctly
not followed, per Rule 69. Naming conflict resolved: Engine 10 is the
real Streaming/Playback Pipeline Engine (not "Media Export/Delivery
Engine"); Engine 11 remains the real Video Interpreter Coordinator (not
"Living AI Learning Engine") — full record in
`docs/history/M388-E10-StreamingPipeline-Compose.md`. Phase 0 (Repository
Verification), Phase 1 (Compose), and Phase 2 (Review/Approval) all
complete this round — Approved, no revision required. `core/engines/playback/playback-engine.js`
independently disambiguated as a different, pre-existing engine, not a
duplicate. Final 7-item Implementation Contract approved: new file
`core/engines/media/streaming/streaming-pipeline-engine.js`, real
per-stream segment-latency instrumentation over `cozy-live.js`'s
existing Stream/TranslationStream state, honestly `realLowLatencyTransport: false`
(`MD-013`'s core transport gap not resolved by this engine). Per Rule 77
(Phase Focus), this round stops at the Phase 2 checkpoint — Phase 3
(Implementation) unlocked, not started.

**Repository SHA-256 (this round, own checkout, final — computed after
`LATEST.md`, `HANDOFF.md`, and the Repair Queue/Waiting Queue were all
finalized, per Rule 70's required sequencing):**
`9d5dfa87c4a5fce1065448918a4c91cb06fa1e5eb5aaed0604a4401fa3b7a829`
(computed as: `find . -type f ! -name 'RELEASES.md' -print0 | sort -z |
xargs -0 sha256sum | sha256sum` — no `_archive/` directory exists in
this checkout).

**ZIP filename / size / Package SHA-256:** see this session's Rule 67
Delivery block (never written into any repository file, per Rule 70).

**Certification:** Repository Verified: YES. Compose Verified: YES.
Review/Approval: **YES — Approved, no revision**, this round.
Implementation Verified: NO — not started, out of this round's scope
per Rule 77. Verification Verified: NO. Handoff Verified: YES —
`LATEST.md`/`HANDOFF.md`/`RELEASES.md`/Repair Queue/Milestone Waiting
Queue all updated same round, Rule 71/73/76/78/79 automatic-packaging
requirement followed (ZIP produced at this phase checkpoint before
Phase 3 begins, no partial phase left unpackaged). Ready for Next
Account: **YES** — begin Engine 10 Phase 3 (Implementation) per the
Final Implementation Contract in
`docs/history/M388-E10-StreamingPipeline-Compose.md`. Do not start
Engine 11 — it remains blocked behind Engine 10's own Phase 9 per Rule
68.

---

## M388 Round — Engine 10 (Streaming/Playback Pipeline Engine) Phase 3 (Implementation) Complete

**Scope this round:** Implemented Engine 10 (Streaming/Playback Pipeline
Engine) per its approved 7-item Final Implementation Contract — new
file `core/engines/media/streaming/streaming-pipeline-engine.js`, real
per-stream segment latency/throughput instrumentation
(`beginStreamTracking`/`recordSegmentRelay`/`getStreamMetrics`/
`endStreamTracking`) composed over `modules/live/cozy-live.js`'s
existing Stream/TranslationStream state, honestly `realLowLatencyTransport: false`
(`MD-013`'s core transport gap not resolved by this engine, never
fabricated). One additive `REGISTRATIONS` entry in
`engine-bridge-bootstrap.js`. `modules/live/cozy-live.js` and
`core/engines/playback/playback-engine.js` confirmed byte-identical to
the pristine baseline checkout (ownership diff). 21/21 real tests pass;
Engines 1–9's 178 regression tests re-run unmodified (199/199 total
this round, zero regressions). `MD-013` updated to 🔵 Implementing.
Also this round: a stale top-summary block in `LATEST.md` (still
reading pre-Engine-9-close / Engine-10-locked state, inconsistent with
this file's own two prior rounds) was found and corrected — logged as
`DI-008` in the Repair Queue. Per Rule 77 (Phase Focus), this round
stops at the Phase 3/4 (Implementation/Verification) checkpoint —
Phase 5–9 (Close) not started; Engine 11 remains Locked.

**Repository SHA-256 (this round, own checkout, final — computed after
`LATEST.md`, `HANDOFF.md`, and the Repair Queue/Waiting Queue were all
finalized, per Rule 70's required sequencing):**
`1c9467750816deb4fe33b2573f63a78e80cfcb9e0995b213c160673fd44f1dba`
(computed as: `find . -type f ! -name 'RELEASES.md' -print0 | sort -z |
xargs -0 sha256sum | sha256sum` — no `_archive/` directory exists in
this checkout).

**ZIP filename / size / Package SHA-256:** see this session's Rule 67
Delivery block (never written into any repository file, per Rule 70).

**Certification:** Repository Verified: YES. Compose/Review: YES
(unchanged, prior rounds). Implementation Verified: **YES** — 21/21
real tests, all 7 contract items exact, ownership diff clean.
Verification Verified: **YES** (Node-level, complete; browser-level
end-to-end honestly disclosed as not yet run, non-blocking, same
pattern as Engine 9). Handoff Verified: YES —
`LATEST.md`/`HANDOFF.md`/`RELEASES.md`/Repair Queue/Milestone Waiting
Queue all updated same round, Rule 76/77/78 followed throughout (no
partial phase left unpackaged; Phase Focus maintained — Engine 11 not
started). Ready for Next Account: **YES** — begin Engine 10 Phase 5–9
(Close). Do not start Engine 11 — it remains blocked behind Engine 10's
own Phase 9 per Rule 68.

---

## M388 Round — Engine 10 (Streaming/Playback Pipeline Engine) Phase 5–9 Complete, CLOSED

**Scope this round:** Engine 10 Phase 5 (Registry Updates) through
Phase 9 (Close) — Engine 10's implementation and tests (Phase 3/4, prior
round) were kept frozen; no code changes made to
`core/engines/media/streaming/streaming-pipeline-engine.js` or its test
file this round.

**Phase 0 (Repository Verification) — real discrepancy found and
resolved this round:** the ZIP delivered at the start of this round
claimed Repository SHA-256
`1c9467750816deb4fe33b2573f63a78e80cfcb9e0995b213c160673fd44f1dba`.
Independent re-verification — extracting the actual delivered ZIP and
recomputing via this repository's own canonical method (`find . -type f
! -name 'RELEASES.md' -print0 | sort -z | xargs -0 sha256sum |
sha256sum`), reproduced under explicit `LC_ALL=C` to rule out a locale/
sort-order artifact — produced a different value,
`92adfd8ef288f18c2218d311f47ce014b9cfce558b2ad6e81f781451e038b2b2`,
reproducibly. ZIP integrity (`unzip -t`) and Package SHA-256 both
matched their claimed values exactly; only the Repository SHA-256 was
wrong. Per Rule 69 ("repository is authoritative"), the independently
verified hash was adopted as this round's real starting state. Logged
as `DI-009` in the Repair Queue — root cause not determined this round.
Also backfilled this round: `DI-008` (a real finding from the Phase 3
round — `LATEST.md`'s stale top summary, corrected that round — but
referenced by id in `LATEST.md`/`HANDOFF.md`/this file without ever
being given its own Repair Queue row, a Rule 62 process gap).

**Phase 4 (Verification) reconfirmed this round:** all 10 real test
suites re-run directly against the now-authoritative repository state —
media-decode (23), language-detection (31), translation-pipeline (12),
speaker-diarization (23), background-audio-separation (18), subtitle-
timeline (22), voice-generation (13), synchronization (21 unit + 3
integration), media-encode (12), streaming-pipeline (21) — **199/199
pass**, matching the Phase 3/4 round's own recorded result exactly. The
one pre-existing `media-pipeline-manager.test.js` failure
(`MD-004`/`MD-009` — missing `background-engine.js`) reproduced
identically, confirmed not a new regression. `streaming-pipeline`
registration entry in `core/bridge/engine-bridge-bootstrap.js`
reconfirmed present; `modules/live/cozy-live.js` and
`core/engines/playback/playback-engine.js` reconfirmed byte-identical to
the pristine checkout (unchanged from the Phase 3/4 round's own
ownership diff).

**Phase 5 (Registry Updates):** `docs/builder/knowledge/repair-queue.md`
— `MD-013` updated to reflect Engine 10 Closed; `DI-008`/`DI-009` rows
added, both 🟢 Fixed. `docs/builder/knowledge/milestone-waiting-queue.md`
— Engine 10 marked Closed, Engine 11 now current/unlocked, Phase 0 not
started.

**Phase 6 (Reports):** `docs/history/M388-E10-StreamingPipeline-Compose.md`
appended with this round's Phase 0 finding, Phase 4 reconfirmation,
Phase 5 summary, and full Close certification.

**Phase 7 (Handoff):** `LATEST.md`, `HANDOFF.md`, and this file all
updated this round.

**Repository SHA-256 (this round, own checkout, final — computed after
`LATEST.md`, `HANDOFF.md`, the Repair Queue, and the Waiting Queue were
all finalized, per Rule 70's required sequencing):**
`d10fa341627fd00d55904b8335be97005f9f81b21d81f254c467f2b7eeaf01bc`
(computed as: `find . -type f ! -name 'RELEASES.md' -print0 | sort -z |
xargs -0 sha256sum | sha256sum` — no `_archive/` directory exists in
this checkout).

**ZIP filename:** `CozyOS-main-v3_02_24-M388-E10-Closed.zip`
**ZIP size / Package SHA-256 / ZIP integrity:** see this session's Rule
67 Delivery block (Rule 70 — never written into any repository file,
including this one).

**Certification:** Repository Verified: **YES** — Phase 0
re-verification this round found and corrected a real hash discrepancy
(`DI-009`), confirmed reproducible under `LC_ALL=C`. Compose Verified:
YES. Review/Approval: YES — Approved, no revision required. Implementation
Verified: **YES** — 21/21 real tests, all 7 contract items exact,
ownership diff clean (unchanged from the Phase 3/4 round). Verification
Verified: **YES** — 199/199 reconfirmed this round, zero regressions.
Handoff Verified: YES — `LATEST.md`/`HANDOFF.md`/`RELEASES.md`/Repair
Queue/Milestone Waiting Queue all updated same round. Artifact SHA-256
Verified: YES. Ready for Next Account: **YES — Engine 10 is CLOSED.
Begin Engine 11 (Video Interpreter Coordinator) Phase 0 per Rule 65/68.
Do not reopen Engine 10. Do not start, plan, or estimate Engine 11's own
Implementation.**

---

## Round 15 — Engine 11 (Video Interpreter Coordinator) Phase 0–1 (Compose)

Per Rule 69/80, this round resumed strictly from the repository's own
recorded state — ZIP integrity clean, prior round's Repository SHA-256
(`d10fa341627fd00d55904b8335be97005f9f81b21d81f254c467f2b7eeaf01bc`)
independently reverified against this file before any work began;
confirmed exact, no discrepancy this round.

**Phase 0 (Repository Verification) — complete this round.** All
governance files read in full (`LATEST.md`, `HANDOFF.md`, this file,
`docs/builder/rules/00-INDEX.md`, the Repair Queue, the Milestone
Waiting Queue, `docs/history/M388.md`'s Approved Implementation Order).
Engines 1–10 reconfirmed Closed directly from
`core/bridge/engine-bridge-bootstrap.js`'s own 14-entry `REGISTRATIONS`
array. Engine 11 unlock confirmed per Rule 68. Engine 11's real,
repository-authoritative name ("Video Interpreter Coordinator")
confirmed against `docs/history/M388.md`'s own Approved Implementation
Order — no Rule 69 naming conflict this round.

**Phase 1 (Compose) — complete this round.** Full report:
`docs/history/M388-E11-VideoInterpreterCoordinator-Compose.md`. A
five-angle anti-duplication scan (interpreter/coordinator name search,
orchestrator/coordinator repository-wide search with every plausible hit
read directly, `core/engines/media/` directory inventory, full
`REGISTRATIONS` array read, exact-name file search) found **no existing
video-interpreter/coordinator/orchestration capability anywhere.**
`core/engines/media/media-pipeline-manager.js` (a real, pre-existing
coordinator for a different, non-overlapping engine set) and
`core/modules/interpretation/cozy-interpretation.js` (a real,
pre-existing, name-adjacent text/evidence interpretation engine with no
dependency on Engines 1–10) were both read in full and confirmed **not**
duplicates. `core/engines/media/coordinator/` confirmed free. Real
exported call surfaces of all ten upstream engines read directly from
source — every one already honestly reports its own "real" capability
claim as `false`; Engine 11's own aggregate `getCapabilities()` must
inherit that same honesty, never rounding up. Draft 7-item
Implementation Contract recorded, not yet approved. One new finding,
`DI-010` (Low, Fixed this round) — corrects `MD-022`'s literal phrasing
(a "Scene Manager" module does exist at `core/engines/scene/
scene-manager.js`; its real, verified scope just does not include the
frame-sync-for-export capability `MD-022`'s underlying conclusion
already correctly identified as absent).

**No application code written this round** — this round touched only
documentation/registry files: `docs/history/M388-E11-
VideoInterpreterCoordinator-Compose.md` (new),
`docs/builder/knowledge/repair-queue.md`,
`docs/builder/knowledge/milestone-waiting-queue.md`, `LATEST.md`,
`HANDOFF.md`, and this file.

**Phase 5 (Registry Updates):** `docs/builder/knowledge/repair-queue.md`
— new `DI-010` row added, Fixed; `MD-022`'s "Currently Open" summary
text amended in place to note the phrasing correction.
`docs/builder/knowledge/milestone-waiting-queue.md` — Engine 11 marked
Phase 0–1 Complete, Phase 2 next.

**Phase 6 (Reports):** `docs/history/M388-E11-VideoInterpreterCoordinator-Compose.md`
created this round with the full Phase 0/1 record.

**Phase 7 (Handoff):** `LATEST.md`, `HANDOFF.md`, and this file all
updated this round.

**Repository SHA-256 (this round, own checkout, final — computed after
`LATEST.md`, `HANDOFF.md`, the Repair Queue, the Waiting Queue, and the
new Compose document were all finalized, per Rule 70's required
sequencing):**
`0d77f204a33475f8daaf3b3cd78a224d8d32c0dfb0d51b5ccc607c7ad45b6ccf`
(computed as: `find . -type f ! -name 'RELEASES.md' -print0 | sort -z |
xargs -0 sha256sum | sha256sum` — no `_archive/` directory exists in
this checkout).

**ZIP filename:** `CozyOS-main-v3_02_25-M388-E11-Phase1-Compose.zip`
**ZIP size / Package SHA-256 / ZIP integrity:** see this session's Rule
67 Delivery block (Rule 70 — never written into any repository file,
including this one).

**Certification:** Repository Verified: **YES** — no discrepancy this
round. Compose Verified: **YES**. Review/Approval: **NO** — pending,
next required step. Implementation Verified: **NO** — not started,
explicitly out of this round's scope. Verification Verified: **NO** —
nothing implemented yet. Handoff Verified: YES — `LATEST.md`/`HANDOFF.md`/
this file/Repair Queue/Milestone Waiting Queue all updated same round.
Artifact SHA-256 Verified: YES. Ready for Next Account: **YES — Engine 11
Phase 0–1 (Repository Verification + Compose) is complete. Begin Engine
11 Phase 2 (Review/Approval) per Rule 65/68/77. Do not begin Phase 3
before Phase 2 completes. Do not reopen Engines 1–10. Do not invent an
Engine 12 — none exists; Engine 11's own Phase 9 Close completes M388.**

## Round 16 — Engine 11 (Video Interpreter Coordinator) Phase 2 (Review/Approval) + Phase 3 (Implementation)

**Phase 2:** Independently re-verified every load-bearing Draft Contract
claim from Round 15 against actual source (Rule 69). All eight stage
calls confirmed real. New finding this round: `MD-023` — `translateSegment()`
requires a live `speechTranslationAdapter`, fails closed without one;
folded into the approved contract. Registration-mechanism question
resolved: EngineBridge only. **Draft Implementation Contract approved as
amended.**

**Phase 3:** Implemented per the approved contract. New files only:
`core/engines/media/coordinator/video-interpreter-coordinator.js`,
`core/engines/media/coordinator/tests/video-interpreter-coordinator.test.js`.
One additive `REGISTRATIONS` entry in `core/bridge/engine-bridge-bootstrap.js`
— no other line of that file changed, no locked file touched (confirmed
via file-list diff against the Round 15 ZIP).

New finding this round: `MD-024` — Engine 9's `buildEncodePlan()` cannot
honestly run when Engine 8 (Synchronization) was skipped (hard-requires a
real `syncResult`, throws on `null`); coordinator corrected to cascade
the skip. **10/10 real Engine 11 tests pass**
(`core/engines/media/coordinator/tests/video-interpreter-coordinator.test.js`),
run against the actual live Engine 1–10 exports. **196/196 Engine 1–10
regression tests pass.** One pre-existing, unrelated failure in
`core/engines/media/tests/media-pipeline-manager.test.js`
(`ERR_MODULE_NOT_FOUND` for a missing `background-engine.js`, predates
this session, not Engine 11's file to fix) documented, not fixed —
explicitly out of Engine 11's scope.

**Engine 11 is NOT marked Closed this round** — Phase 3 (Implementation)
is complete; Phase 4 (Verification) is next.

**Phase 5 (Registry Updates):** `docs/builder/knowledge/repair-queue.md`
— `MD-023` and `MD-024` rows added, both Resolved (folded into the
implementation, not left open). `docs/builder/knowledge/milestone-waiting-queue.md`
— Engine 11 marked Phase 0-3 Complete, Phase 4 next.

**Phase 6 (Reports):** `docs/history/M388-E11-VideoInterpreterCoordinator-Compose.md`
updated this round with the full Phase 2/3 record.

**Phase 7 (Handoff):** `LATEST.md`, `HANDOFF.md`, and this file all
updated this round.

**Repository SHA-256 (this round, own checkout, final — computed after
`LATEST.md`, `HANDOFF.md`, the Repair Queue, the Waiting Queue, and the
Compose document were all finalized, per Rule 70's required sequencing):**
`19fee9bd593723e465b0b0106208d419e07c75dfc12acfa74c7c11f13a4ee78f`
(computed as: `find . -type f ! -name 'RELEASES.md' -print0 | sort -z |
xargs -0 sha256sum | sha256sum`).

**ZIP filename:** `CozyOS-main-v3_02_26-M388-E11-Phase3-Implementation.zip`
**ZIP size / Package SHA-256 / ZIP integrity:** see this session's Rule
67 Delivery block below (Rule 70 — never written into any repository
file, including this one, beyond this pointer).

**Certification:** Repository Verified: **YES**. Compose Verified:
**YES** (Round 15). Review/Approval: **YES** (this round). Implementation
Verified: **YES** (this round) — 10/10 Engine 11 tests + 196/196
regression tests pass, real output, not claimed. Ready for Next Account:
**YES — Engine 11 Phase 0-3 (Repository Verification through
Implementation) is complete. Begin Engine 11 Phase 4 (Verification) per
Rule 65/68/77. Do not reopen Engines 1–10. Do not invent an Engine 12 —
none exists; Engine 11's own Phase 9 Close completes M388.**

## Round 17 — Engine 11 (Video Interpreter Coordinator) Phase 4 (Verification)

Independent re-verification of Round 16's implementation — none of this
round's checks reused Round 16's own reported results:

- ZIP integrity, Package SHA-256, and Repository SHA-256 all recomputed
  fresh and matched Round 16's recorded values exactly.
- Engine 11's 10 tests and all 196 Engine 1–10 regression tests re-run
  fresh — same pass counts, one pre-existing unrelated failure
  reconfirmed.
- Locked-file diff re-run against the *original* delivered ZIP (not
  Round 16's own ZIP) — confirmed only the 2 new coordinator files plus
  the 1 additive registration line.
- Duplicate-engine scan re-run — no new duplicate.

**New finding this round: `DI-011`** — `LATEST.md`/`HANDOFF.md` each
carried a stale second status block ("Phase 0–1 of 9") missed during
Round 16's edits. Fixed this round.

**Engine 11 is NOT marked Closed this round** — Phase 4 (Verification)
is complete; Phase 5-9 remain for a future round.

**Phase 5 (Registry Updates):** `docs/builder/knowledge/repair-queue.md`
— `DI-011` row added, Resolved. `docs/builder/knowledge/milestone-waiting-queue.md`
— Engine 11 marked Phase 0-4 Complete, Phase 5-9 next.

**Phase 6 (Reports):** `docs/history/M388-E11-VideoInterpreterCoordinator-Compose.md`
updated this round with the full Phase 4 record.

**Phase 7 (Handoff):** `LATEST.md`, `HANDOFF.md`, and this file all
updated this round.

**Repository SHA-256 (this round, own checkout, final — computed after
all Phase 4 documentation was finalized, per Rule 70's required
sequencing):**
`a862063b009ef41d5cf71ef7fc2f33bc2e0fe17e49a63ff012e50f38647019a1`
(computed as: `find . -type f ! -name 'RELEASES.md' -print0 | sort -z |
xargs -0 sha256sum | sha256sum`).

**ZIP filename:** `CozyOS-main-v3_02_27-M388-E11-Phase4-Verification.zip`
**ZIP size / Package SHA-256 / ZIP integrity:** see this session's Rule
67 Delivery block (Rule 70 — never written into any repository file,
including this one, beyond this pointer).

**Certification:** Repository Verified: **YES**. Compose Verified:
**YES**. Review/Approval: **YES**. Implementation Verified: **YES**.
Verification Verified: **YES** (this round) — real, fresh re-run, not a
repeat of prior claims; one real defect found and fixed. Ready for Next
Account: **YES — Engine 11 Phase 0-4 is complete. Begin Engine 11 Phase
5 (Registry Updates) through Phase 9 (Close) in a future session. Do not
reopen Engines 1–10. Do not invent an Engine 12 — none exists; Engine
11's own Phase 9 Close completes M388.**

---

## M388 Round 17 — Engine 11 (Video Interpreter Coordinator) Phase 5–9 Complete, CLOSED. M388 COMPLETE.

**Scope:** Engine 11 Phase 5 (Registry Updates) through Phase 9 (Close),
after independently re-verifying the delivered Phase 4 checkpoint fresh
— ZIP integrity, Package SHA-256, Repository SHA-256, 10/10 Engine 11
tests, 196/196 Engine 1–10 regression, and the ownership/locked-file
diff all reconfirmed matching exactly, not reused from the checkpoint's
own claims.

**Registry:** Repair Queue re-read — Phase 4 established nothing new
beyond `DI-011` (already fixed inline the same pass found); `MD-023`/
`MD-024` (Engine 11's own Phase 2/3 findings) already fully resolved
within scope, no open row needed. Missing Dependency Registry checked —
no update needed (only tracks MD-001–016 in detail, by existing
convention). Milestone Waiting Queue fully updated: M388 `Status`
`ACTIVE` → `CLOSED`; Engine 11 added to Completed with full detail;
"Quick answers" rewritten to reflect actual completion (was still
describing Engine 11 as in-progress).

**Documentation housekeeping this round (found during re-verification,
not part of Engine 11's own Phase 4 findings but corrected for
consistency):** `repair-queue.md`'s `MD-010`/`MD-012`/`MD-014` entries
still read "not yet Verified/Closed" for engines (5, 2, 6) that were
already Closed in this repository's own history — corrected to match
the `MD-011`/`MD-013`/`MD-020`/`MD-021` entries' own precedent phrasing.
`LATEST.md`/`HANDOFF.md` both carried a second, deeper "Project
Completion" status block still reading "11 (Phase 0-3 of 9 complete)" —
missed by `DI-011`'s own fix (which only caught the top-of-file blocks)
— corrected in both files this round.

**Tests:** 10/10 Engine 11, 196/196 Engine 1–10 regression, both
independently re-run fresh this round. Zero regressions. One
pre-existing, unrelated `media-pipeline-manager.test.js` failure
reconfirmed, not fixed (`MD-004`/`MD-009`).

**Repository SHA-256 (this round, own checkout, final):**
`0d6a1d91868648f8a0c58ab9e99a91a8d993376a657ec2c53a39cb73ea9cfa67`

**ZIP filename:** `CozyOS-main-v3_02_28-M388-E11-Closed.zip`
**ZIP size / Package SHA-256:** see this session's Rule 67 Delivery
block (never written into any repository file, per Rule 70).

**Certification:** Repository Verified: YES. Compose Verified: YES.
Review/Approval: YES. Implementation Verified: YES. Verification
Verified: YES (independently re-run fresh). Handoff Verified: YES.
Artifact SHA-256 Verified: YES. Delivery Verified: YES (Rule 80 —
confirmed via `present_files` in the same turn, not merely built).
Ready for Next Account: **YES — M388 — Living Media Interpreter is
COMPLETE. All 11 engines Closed. No Engine 12 exists. Begin the Living
AI Learning milestone's own Phase 0 next.**
