# CHANGELOG.md

Root-level summary log. One entry per milestone, appended only — never rewritten. For full detail, see `docs/history/MNNN.md`. For the Builder-internal (Compose/Layer 1-5) history, see `docs/builder/CHANGELOG.md`, which this file does not replace.

## RP-035 / R040 Phase 3E — Targeted Translated-Segment Delivery
Rule 29 audit of both uploaded Phase 2/Phase 3 baselines found the language-grouping/passthrough/cache logic (A–D, N of the Phase 3E–3H brief) already real and tested. The one genuine gap: `LiveLanguageFanoutRouter` computed one translation per target language but only emitted it locally — nothing carried that result to a remote viewer. Added: server `publish-translated` message type (host/moderator-only, targeted delivery, never a broadcast); `RemoteRelayTransportProvider.publishTranslatedSegment()`; `CozyLiveDistributionTransport.deliverTranslatedSegment()` (feature-detected, never fabricated for local-relay); fan-out router now calls it once per distinct target language at the real production call site. 7 new tests (3 real-socket server-level, 3 real-socket transport-integration, 2 fanout-router call-pattern) + full 132/132 ChurchOS + 40/40 server/live-relay regression, all green from a fresh extraction. Protected files (`founder-story/*`, `cozy-login-gate.js`) verified byte-identical. Implementation Verified: LOCAL-ONLY (real sockets, real production files; cross-machine/public-internet reachability not verified — see server/live-relay/README.md).

## M385 — Living AI Context Engine
Registered as `window.CozyOS.LivingAIContextEngine` (not `LivingAI` — that global already existed, collision avoided). Composes CozyAI for memory, no separate storage. 6/6 Node tests pass. Implementation Verified: NO (browser pending).

## M384 — Living Behavior Engine
Login-timing pattern learning from real IdentityEngine sessions. Window Manager/navigation events confirmed to have zero real signal — disclosed, not built. 5/5 Node tests pass. Implementation Verified: NO (browser pending).

## M383 — Living Trust Engine
Persisted, learning trust score. Real overlap with LSE.evaluateTrust() found and resolved (composed as one-time seed, not duplicated). 7/7 Node tests pass. Implementation Verified: NO (browser pending).

## M382 — Living Risk Engine
Category-separated risk scoring. Device/Identity/Recovery categories re-group LSE's own already-computed numbers rather than recalculating. Session/Environment genuinely new. Event-driven, 0 polling. 9/9 Node tests pass. Implementation Verified: NO (browser pending).

## M381 — Living Security Coordinator
Trust/risk scoring + adaptive authentication decision, composing 6 existing engines. 6/6 Node tests pass. Implementation Verified: NO (browser pending) — corrected after initial over-certification, per the mandatory rule that Implementation Verified requires both code and complete verification.

## M380 — Regression Evidence Collection
No detection engine built (none warranted). Structured RG-NNN template added. Registry honestly remains empty — no regression exists.

## M379 — Engineering Evidence Growth
Repaired stale header in `core/identity/developer-profile.js` (RP-006). RP reached SUFFICIENT (6/6). RG still 0/6.

## M377/M378 — Pattern Engine Compose (deferred twice)
Live evidence checked both times: insufficient. No code written. Correct evidence-gated outcome per Rule established since M374.

## M376 — Compose Integration
Merged CozyBuilder lineage's genuine improvements (3 real syntax-error reconstructions, Layer 3-5 Builder engines) into the security-hardened baseline, without reverting any M373-M374 security work.
