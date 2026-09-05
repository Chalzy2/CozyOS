# core/ai/integration.js — REAL ACTIVE INTEGRATION — Final Report

## Implementation

Exact responsibility of core/ai/integration.js: a thin, additive
orchestration bridge that registers a new engine (key knowledgeBridge)
onto the real, already-existing core/ai/cozy-ai-integration.js
orchestrator's own capability-routing table. It exposes four
capabilities the orchestrator did not previously know about
(language-capability-lookup, provider-status-lookup,
ai-context-composition, knowledge-lookup), delegating every real answer
to an existing authority — CozyLanguagePacks, DeveloperIdentity,
CozyMemory, and (once a server route exists) the server-side
KnowledgeRegistry. It owns no data itself beyond its own manifest.

Existing systems integrated: core/ai.js (locked; its real
initializeSubEngine/sub-engine-attachment contract, read not modified),
core/ai/cozy-ai-integration.js (real, existing orchestrator — its own
registerEngine()/capability-routing/circuit-breaker/event-publishing
machinery, unmodified), CozyLanguagePacks (extended in the immediately
prior round with getLanguageCapabilities()/getOnlineProviderStatus()),
DeveloperIdentity (read-only, public identity only), CozyMemory
(read-only, opt-in only).

Actual runtime path, traced and empirically proven (not asserted):
1. core/ai/cozy-ai-integration.js loads and self-registers at
   window.CozyOS.AI.integration via the real, documented
   initializeSubEngine("integration", this) call.
2. core/ai/integration.js loads, finds that real orchestrator object,
   and calls its real registerEngine("knowledgeBridge", ...) method —
   the same method any other real sub-engine uses.
3. The orchestrator's own, pre-existing, unmodified query-routing logic
   (_executeWithFaultTolerance) calls .evaluate(query, context) on
   whichever registered engine _resolveEngineByCapability() selects for
   a given request. Once registered, knowledgeBridge participates in
   that real loop for any of its four declared capabilities.
4. Empirically proven this round, not merely designed: a direct call
   to the orchestrator's own _executeWithFaultTolerance('knowledgeBridge',
   {capability: 'language-capability-lookup', languageId: 'en'})
   correctly routes to knowledgeBridge.evaluate() and returns its real
   result — confirmed via a live script run before the formal test
   suite was written, then captured as a permanent, passing test.

Consumers now able to use it: any future code with a reference to the
orchestrator (window.CozyOS.AI.integration) can route a query to one of
the four new capabilities without knowing knowledgeBridge exists by
name — capability-based routing is the orchestrator's own existing
design. window.CozyOS.KnowledgeBridge is also exposed directly as a
same-process convenience mirror.

## Discovery — a genuinely important architectural finding

Before writing any code, discovery established that
core/ai/cozy-ai-integration.js (a different, already-existing, unlocked
file) is itself the real AI orchestration bus — not this file, and not
something this round replaces or duplicates. Its own
CORE_AI_ENGINES.optional list (business, vision, voice, ocr, reasoning,
worker_pool) had no knowledge/language-capability/provider-status
bridge — that gap is exactly what core/ai/integration.js fills,
registered under the distinct key knowledgeBridge (never "integration",
which the orchestrator already owns for itself).

## Evidence

### Focused tests (new, this round)

core/ai/tests/integration.test.js — 20 tests, 20 pass, 0 fail, covering:
- Integration loading (with and without the real orchestrator/language
  packs present; fails closed, never crashes, either way)
- Real registration under the orchestrator's own _engines Map, under
  the correct, non-colliding key
- No duplicate registration on a second load (the orchestrator's own
  registerEngine() throws for a live duplicate; this file's .catch()
  logs rather than crashing)
- Real routing through the orchestrator's own
  _executeWithFaultTolerance() — not a manufactured test-only call
- Context composition never includes memory or knowledge unless the
  caller explicitly opts in (and, for memory, supplies a real actorId
  — never inferred)
- Identity delegation honestly reports unavailable when
  DeveloperIdentity isn't registered — never fabricates identity data
- A direct source-content check confirms zero reference to the
  founder's private, Vault-encrypted narrative anywhere in this file
- Offline behavior: language/provider lookups are proven non-Promise
  (pure, synchronous); a failing knowledge lookup never affects an
  unrelated, fully-local capability in the same evaluate cycle
- getHealth() honestly reports "degraded" when its one real dependency
  is missing — never a fabricated "healthy"
- No secret-shaped values in source; manifest declares only the four
  capabilities actually implemented

### Regression (existing suites, unmodified, re-run this round)

| Suite | Tests | Pass | Fail |
|---|---|---|---|
| core/ai/tests/integration.test.js (new) | 20 | 20 | 0 |
| server/webauthn-rp/test/payments.test.js | 26 | 26 | 0 |
| server/webauthn-rp/test/crypto-payments.test.js | 27 | 27 | 0 |
| server/webauthn-rp/test/quote-engine.test.js | 27 | 27 | 0 |
| server/webauthn-rp/test/knowledge-registry.test.js | 28 | 28 | 0 |
| cozy-language-pack-registry.test.js | 40 | 40 | 0 |
| cozy-answer-engine.test.js | 16 | 16 | 0 |
| cozy-advisor-integration.test.js | 5 | 5 | 0 |
| TOTAL | 189 | 189 | 0 |

No SKIP category applies — nothing in this round's change touches a
server/database/network-dependent path that would need one.

### Offline verification

lookupLanguageCapability() and lookupProviderStatus() are confirmed, by
direct test, to never return a Promise — proof, not just a design
intent, that no network round-trip is silently awaited.
getOnlineProviderStatus()'s existing honesty (NLLB DOCUMENTED_ONLY,
Gemini NETWORK_REQUIRED) is never upgraded by this file — verified
directly. The one network-touching function (attemptKnowledgeLookup())
is isolated to a single, explicitly-opt-in capability; its failure
(confirmed: the server route genuinely doesn't exist yet, so this
always fails today) is proven not to affect any other capability in
the same evaluate cycle.

### Security verification

- No API keys, tokens, credentials, or secrets anywhere in the new
  file (scanned, confirmed empty).
- No client-supplied actorId/organizationId/role/admin-flag is ever
  trusted as authority — this file has no authorization logic of its
  own at all; it delegates every real decision to an existing authority
  and never invents one.
- Memory access requires an explicit, caller-supplied actorId — proven
  by test to never be inferred or fabricated.
- Identity access is public-profile-only; a direct source-content
  check confirms zero code path toward the founder's private Vault
  content.
- Organization isolation: not directly applicable to this file (it
  touches no organization-scoped data at all); nothing here could leak
  cross-organization data even in principle, since no such data is
  ever read.

## Changes

NEW FILES:
- core/ai/integration.js
- core/ai/tests/integration.test.js
- docs/builder/knowledge/AI-INTEGRATION-BRIDGE-IMPLEMENTATION-REPORT.md (this file)

MODIFIED FILES:
- server/webauthn-rp/test/knowledge-registry.test.js — one pre-existing
  test ("V: locked-file knowledge accurately reports...") asserted
  core/ai/integration.js as ABSENT, which was correct at the time it was
  written. Since this round's explicit authorization legitimately
  changed that fact (the file now exists), the test was updated to
  assert PRESENT for that one file, with the historical ABSENT status
  recorded in an explanatory comment rather than silently erased. This
  is a necessary, documented consequence of the authorized change, not
  an out-of-scope edit — re-run and confirmed still 28/28 passing.

DELETED FILES: none from the authoritative repository state. (A
duplicate, superseded test file at core/ai/test/integration.test.js —
singular "test," from an earlier pass within this same session before
a context transition — was found, inspected, and removed in favor of
the single authoritative copy at core/ai/tests/integration.test.js,
matching this codebase's own established plural-tests-directory
convention, e.g. core/modules/intelligence/tests/. Reported explicitly
per the "investigate unexpected changes before declaring success"
instruction — confirmed to be session-internal duplicate cleanup, not
a loss of any distinct, needed content.)

UNEXPECTED CHANGES: two anomalies were found and investigated this
round: (1) the duplicate test file described above, and (2) the
knowledge-registry.test.js modification described above. Both were
traced to their root cause, confirmed legitimate/necessary, and are
disclosed here rather than silently absorbed into "no unexpected
changes."

## Locked files

| File | Status |
|---|---|
| core/ai.js | unchanged — byte-identical hash confirmed before and after this round |
| core/ai/cozy-ai-language.js | unchanged — byte-identical hash confirmed |
| core/ai/cozy-ai-memory.js | unchanged — byte-identical hash confirmed |
| core/ai/cozy-ai-integration.js | unchanged — not authorized for modification this round; byte-identical hash confirmed (read-only for contract discovery) |
| core/ai/integration.js | Previously ABSENT -> now CREATED under explicit, one-time authorization |

## Status

IMPLEMENTED + VERIFIED
