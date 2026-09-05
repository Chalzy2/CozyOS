# CozyOS Universal Intelligence Foundation — Phase A/B Discovery Report

Per this master prompt's own explicit instruction (section 50: "Do NOT
implement all phases blindly in one destructive change... At every
phase: inspect, design, implement, test, report, continue only if
dependencies are sound"), this round delivers Phase A (repository
discovery) and Phase B (architecture mapping) only. No code was
written, no schema was added, no file was modified. This mirrors the
exact discipline already used for the prior discovery-only rounds in
this engagement.

---

## Headline finding

Last round's Knowledge Foundation report found CozyMemoryEngine and a
narrow cozy-knowledge-registry.js. This round's deeper search surfaced
a substantially larger, already-thoughtful, already-honestly-disclosed
CozyAI-facing intelligence system that directly anticipates much of
what this master prompt asks for. Before proposing any new component,
every relevant piece was located and its header/ownership declaration
inspected.

## Newly discovered this round

| Component | Path | Real scope (from its own header) |
|---|---|---|
| Answer Engine | core/modules/intelligence/answer/cozy-answer-engine.js | Composes existing authorities (identity FAQ router, CozyAI.getContext()) into one structured answer. Explicitly discloses: "There is no repository-wide 'CozyQuestionUnderstanding' NLU engine." Its "understanding" is real but honestly limited — substring/word-overlap scoring against a fixed trigger table, not true intent/purpose/confidence modeling. |
| Identity FAQ Router | core/modules/knowledge/cozyos-identity-faq-router.js | Maps many phrasings (EN + Kiswahili) of identity questions onto canonical intents, answered from DeveloperIdentity — already real semantic-equivalence handling for the identity domain, already bilingual. |
| Developer/Project Identity | core/identity/developer-profile.js, project-history.js, african-knowledge-initiative.js -> DeveloperIdentity | The real, PUBLIC identity source. |
| Founder Story Vault | core/modules/founder-story/founder-story-engine.js + -seed.js + -panel.js | The SEPARATE, PRIVATE, Vault-encrypted personal autobiography, default visibility "Only Me". The identity FAQ router's own header states explicitly: "This router reads ONLY the public profile. It never imports, requires, or reaches into the Founder Story Vault, and must not be extended to do so." This is precisely the creator/owner/founder distinction section 3 demands — already built, already correctly boundaried. |
| Advisor | core/modules/intelligence/advisor/cozy-advisor-integration.js (+ tests) | Business/decision-support-shaped integration — relevant to section 22. Not yet inspected in depth. |
| Conversational Provider | core/modules/intelligence/providers/rule-based-conversational-provider.js | Has dedicated tests for project-knowledge and registration flows — directly relevant to section 7. Not yet inspected in depth. |
| Public Knowledge Source | core/modules/intelligence/knowledge/cozy-public-knowledge-source.js | Name strongly suggests an existing PUBLIC/visibility distinction — not yet inspected in depth. |
| Language Templates | core/modules/intelligence/language/cozy-language-templates.js | Has a dedicated rp-028-luo-availability.test.js — confirms real, tested multilingual infrastructure already exists for English/Kiswahili/Luo. |
| Application Registry | core/registry/cozy-registry.js | Real registerApplication()/listApplications() — the actual existing "application directory" infrastructure. |
| CozyAI FAQ demo | applications/CozyAIFAQ/cozyai-faq-demo.js | A concrete existing consumer of this stack. |

## Existing systems NOT found — genuine gaps, confirmed by search

- No CozyBuilder-facing "does this already exist / duplicate detection"
  system was found. Everything above is CozyAI-facing (conversational
  answers). core/modules/builder/ has capability-knowledge-acquisition.js
  and capability-dependency-graph.js (found in a prior round) which may
  partially cover this, but neither was confirmed to implement a direct
  "search knowledge registry before generating code" step matching
  section 26's pipeline. This is the most likely genuine gap.
- No shared, server-side authoritative bridge between this rich
  client-side CozyAI ecosystem and the server-side KnowledgeRegistry
  built in the prior round. Every file above is window.CozyOS
  (browser-side). None can see the real, server-authoritative provider/
  quote/payment knowledge now sitting in knowledge_records.

## Trust-model note, carried forward

Per this master prompt's own explicit correction (document and address
the memory engine's caller-identity trust limitation at the correct
boundary rather than silently treating it as secure): CozyMemoryEngine's
limitation was already documented in the prior round's report and is
not re-litigated or silently resolved here. The newly-found answer-
engine composition chain reads from CozyAI.getContext(), which itself
composes CozyKnowledge and CozyMemory — meaning this entire answer-
generation chain inherits CozyMemoryEngine's same unverified-actorId
limitation wherever it touches memory, one level removed. Stated
explicitly rather than left implicit.

## Not yet inspected in depth (disclosed, not hidden)

- core/modules/intelligence/advisor/cozy-advisor-integration.js
- core/modules/intelligence/providers/rule-based-conversational-provider.js
- core/modules/intelligence/knowledge/cozy-public-knowledge-source.js
- core/modules/intelligence/language/cozy-language-templates.js
- applications/CozyAIFAQ/cozyai-faq-demo.js
- core/modules/identity/identity-engine.js, platform-identity-bridge.js, cozy-identity.js
- core/modules/builder/capability-knowledge-acquisition.js, capability-dependency-graph.js

## B. Architecture mapping (INFERRED from headers, not yet fully traced)

```
CozyOS Client-Side World (window.CozyOS, all browser-side)
  DeveloperIdentity (PUBLIC identity — project-history, developer-profile)
       -> read-only
  CozyIdentityFAQRouter (phrase -> canonical intent, EN/SW)
       ->
  CozyAI.getContext() (composes CozyKnowledge + CozyMemory)
       ->
  CozyAnswerEngine (structured answer composition)

  Founder Story Vault (PRIVATE, encrypted) — deliberately NOT reachable
  from the above chain, by explicit design.

  cozy-registry.js (application directory: registerApplication/listApplications)
       -> read by cozy-knowledge-registry.js's getters (found prior round)

  cozy-public-knowledge-source.js — visibility distinction, not yet inspected

Server-Side World (Phase 2-5.3 of this engagement, real, org-isolated)
  OrganizationRegistry / BillingRegistry / PaymentRegistry /
  CryptoPaymentRegistry / QuoteEngine / KnowledgeRegistry (prior round)

NO BRIDGE CURRENTLY EXISTS between these two worlds.
```

## Evidence classification

- OBSERVED: every file/header cited above — directly read this round.
- INFERRED: the architecture diagram above, built from header
  declarations, not yet confirmed by tracing actual runtime call chains
  end to end.
- NOT-RUN: no tests were executed this round — discovery only, no code
  changed.
- UNKNOWN: whether rule-based-conversational-provider.js's registration
  tests already satisfy section 7's requirement fully or only partially
  — requires the deeper inspection listed above.

## Locked-file verification (re-confirmed, not assumed)

core/ai.js, core/ai/cozy-ai-language.js, core/ai/cozy-ai-memory.js
present and unchanged this round (no code was modified at all).
core/ai/integration.js: ABSENT / NOT PRESENT, re-confirmed.

## Recommended next dependency

Given the depth of what already exists, the responsible next phase is
NOT "build a new identity/application/intent model from scratch" — most
of that already has a real, honestly-disclosed, working implementation.
The genuine next dependency is:

1. Finish inspecting the "not yet inspected" list above — specifically
   whether cozy-public-knowledge-source.js already implements the
   PUBLIC/USER/ORGANIZATION/ADMIN/SYSTEM/SECRET visibility distinction,
   which would mean that distinction should be reused client-side while
   the server-side KnowledgeRegistry remains authoritative for anything
   crossing the client/server boundary.
2. Design (not build) the missing bridge between the existing client-
   side CozyAI answer chain and the server-authoritative KnowledgeRegistry
   for facts that must be server-verified (provider status, financial
   rules, evidence states).
3. Design (not build) the genuinely-missing CozyBuilder-side consumer —
   a real "search the knowledge registry + repository before generating
   code" step, since no existing component was found to do this today.

None of this was implemented in this round, per the master prompt's own
phased-implementation instruction. Stopping here for review before any
Phase C (knowledge schema) design work begins.
