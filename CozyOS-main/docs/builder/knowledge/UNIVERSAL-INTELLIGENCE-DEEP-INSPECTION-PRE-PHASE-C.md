# CozyOS Universal Intelligence — Deep Inspection Report (Pre-Phase-C)

No code was written, no schema added, no file modified this round.
Every claim below is traced from actual require/window.CozyOS.X
references and grep-confirmed caller lists — not inferred from
filenames (a real correction this round made to its own prior-round
guess: cozy-advisor-integration.js does not exist as a source file;
only cozy-advisor.js does, with a similarly-named test file).

---

## 1. Existing intelligence architecture map (TRACED)

index.html / dashboard.html / admin-workspace.html all load
CozyAnswerEngine directly (confirmed via grep). CozyAnswerEngine
composes, read-only: CozyIdentityFAQRouter (identity/origin/vision,
public only), CozyAI.getContext() (composes CozyKnowledge + CozyMemory),
and CozyKnowledge directly (re-render already-VERIFIED raw facts for
getters whose shape has no .answer field).

CozyAnswerEngine's output is consumed by CozyAdvisor
(core/modules/intelligence/advisor/cozy-advisor.js), which reshapes it
into advice/encouragement WITHOUT calling CozyAI.getContext()/
CozyKnowledge/CozyMemory/FounderStory directly — no side-channel.
Confirmed by its own header's explicit "ownership check" against the
pre-existing, different core/living/cozy-living-advisor.js
(LivingAdvisor — free-text problem classification, unrelated).

CozyAnswerEngine is also consumed by core/living/cozy-living-assistant.js
(the conversational/voice interface).

Separately: rule-based-conversational-provider.js registers into the
existing window.CozyOS.LivingAI.registerProvider() extension point — a
reply-composer turning CognitiveCoordinator.run()'s structured output
into text. This is a DIFFERENT pipeline from CozyAnswerEngine's
identity/project-knowledge Q&A — general conversational replies, not
CozyOS self-knowledge specifically.

## 2. CozyAI architecture map

CozyAI.getContext() composes CozyKnowledge + CozyMemory — the one place
identity/knowledge/memory ever converge for the answer chain. Confirmed:
nothing in this chain calls the Founder Story Vault.

## 3. CozyBuilder architecture map

core/modules/builder/ contains a real, substantial family
(cozy-builder.js, builder-orchestrator.js, capability-dependency-graph.js,
capability-knowledge-acquisition.js, evidence-engine.js, learning-engine.js,
observation-engine.js). NOT traced in depth this round (budget
prioritized the confirmed CozyAI chain and the two named gaps) —
flagged, not guessed at. No evidence found, in either this or the prior
round's search, of an existing "does this already exist" pre-generation
check wired into this family.

## 4. Application registry map (TRACED)

core/registry/cozy-registry.js — real, in-memory, window.CozyOS
(client-side, no server persistence). Its own header is explicit:
metadata-only catalog — "Not a certification authority" (that's
CozyCertification), "Not a launcher," "Not the identity of a live
coordinator object" (a coordinator still lives at window.CozyOS.<Name>;
this registry only stores descriptive metadata). registerApplication()/
listApplications() let applications announce themselves once rather
than the shell hard-coding names. This is the real, correct, existing
application directory — any future server-side application knowledge
should reference this as its client-side counterpart, not duplicate it.

## 5. KnowledgeRegistry map (already built, prior round — re-confirmed)

Server-side, SQLite/Postgres-backed, organization_id-scoped, real
OrganizationRegistry.isAuthorized() enforcement, status/evidenceState
as two independent fields, secret-shaped-key rejection, versioned
history, evidence-to-test linkage. Confirmed still exactly as
delivered — no code touched this round.

## 6. Identity/privacy map (TRACED, not assumed)

DeveloperIdentity (core/identity/developer-profile.js + project-history.js
+ african-knowledge-initiative.js) is the real, PUBLIC identity source.
Founder Story Vault (core/modules/founder-story/founder-story-engine.js
+ -seed.js + -panel.js) is real, PRIVATE, Vault-encrypted, default
visibility "Only Me." CozyIdentityFAQRouter reads ONLY DeveloperIdentity
— confirmed by direct grep of its actual code, not just its header
comment: zero references to founder-story/FounderStory anywhere in its
executable code. This privacy boundary is real, not merely claimed.

## 7. Memory trust-boundary map

Unchanged from the prior round's finding, re-confirmed, not
re-litigated: CozyMemoryEngine's actorId is self-reported by the
caller, with no independent verification (the file's own header says
so). Since CozyAI.getContext() composes CozyMemory, the entire
CozyAnswerEngine -> CozyAdvisor chain inherits this same limitation one
level removed, whenever an answer draws on memory rather than pure
identity/knowledge facts. Not modified this round.

## 8. Multilingual architecture map (TRACED — correcting an overclaim risk)

cozy-language-templates.js: real, deterministic — TEMPLATES[key][langCode]
resolves to a fixed sentence FRAME that only interpolates committed
repository data, never generates new language at runtime. Only 5
languages have real content today: English, Kiswahili, French, Arabic,
Somali — and even among those, French/Arabic/Somali honestly fall back
to English for several intents where no verified translation exists
yet (the file's own comment discloses this).

CORRECTION to a risk in the prior report: the existence of
rp-028-luo-availability.test.js does NOT mean Luo is supported. Traced
directly: the test confirms the opposite — isAvailable("luo") is false,
the registry entry is NOT_READY, "zero template keys carry a genuine
luo entry," and any resolution request for Luo "honestly falls back to
an AVAILABLE language" with a disclosed reason. Luo, Kikuyu, Kamba,
Kalenjin are NOT currently supported — this must not be misstated in
any future report or CozyAI answer.

## 9. Advisor architecture map (corrected)

Two distinct, real, non-duplicate advisor systems exist: CozyAdvisor
(downstream of CozyAnswerEngine only; advice/encouragement grounded in
already-verified CozyOS-self-knowledge answers) and LivingAdvisor
(core/living/cozy-living-advisor.js — classifies free-text problems via
CognitiveCoordinator.run(), no relationship to CozyAnswerEngine).
CozyAdvisor's own header documents having read LivingAdvisor in full
before being written, specifically to confirm no duplication.

## 10. Provider intelligence map

Unchanged: PaymentRegistry/CryptoPaymentRegistry/QuoteEngine remain the
sole owners of payment/crypto/rate provider truth. KnowledgeRegistry
already correctly represents providers as knowledge_records with
domain='payment_provider', not a separate table.

## 11. Existing repository-discovery map

No dedicated "repository/capability discovery for code generation" tool
was found this round either. capability-knowledge-acquisition.js and
capability-dependency-graph.js remain the most likely existing
candidates but were not traced this round.

## 12/13. GAP 1 and GAP 2 dependency analysis

GAP 1 (client CozyAI ecosystem <-> server KnowledgeRegistry): confirmed
still fully open. Every file traced this round is window.CozyOS
(browser). The server side already has everything GAP 1 needs on its
own end: rp.js's real session resolution (currentSession()),
OrganizationRegistry.isAuthorized(), and the exact same authenticated-
route pattern every server.js route has used since Phase 2. No new
server boundary primitive needs inventing — the existing pattern just
needs one more read-only route pointed at KnowledgeRegistry.

GAP 2 (CozyBuilder "does this exist" check): still confirmed open. Per
this round's own instruction not to name a "DuplicateDetectionEngine"
merely because the gap has that shape — the right composition, once
built, is likely: repository grep/search + KnowledgeRegistry.listKnowledge()
(already built) + whatever capability-dependency-graph.js already
provides (not yet traced). Not designed further this round.

## 14. Reusable components (confirmed, not to be duplicated)

CozyAnswerEngine, CozyIdentityFAQRouter, DeveloperIdentity, CozyAdvisor,
LivingAdvisor, cozy-registry.js, cozy-language-templates.js,
rule-based-conversational-provider.js, KnowledgeRegistry,
OrganizationRegistry, rp.js session resolution.

## 15. Components requiring extension

The server's existing authenticated-route pattern (server.js) — extend
with one new read-only route for KnowledgeRegistry retrieval. Nothing
else identified this round as needing extension yet.

## 16. Components that must remain untouched

core/ai.js, core/ai/cozy-ai-language.js, core/ai/cozy-ai-memory.js
(locked; core/ai/integration.js confirmed still ABSENT / NOT PRESENT).
Founder Story Vault. CozyMemoryEngine (documented limitation, not
silently patched). Every file in item 14.

## 17. Components that would be duplication if built

A new identity/FAQ/answer/advisor/application-registry/language engine
— all already exist and were traced as real and reusable this round.

## 18. Security boundaries (traced, not merely stated)

CozyIdentityFAQRouter -> Founder Story Vault: zero code path, confirmed
by grep of executable code, not just header comment. CozyAdvisor ->
CozyMemory/CozyKnowledge/FounderStory directly: zero code path — only
reads CozyAnswerEngine's already-produced output fields. Server
KnowledgeRegistry -> SECRET visibility: structurally unretrievable
through its own read path (built and tested last round). The one not
yet closed boundary: nothing today prevents a future, carelessly-built
client<->server bridge from letting the client itself decide
visibility — exactly why any future route must enforce visibility
entirely server-side, mirroring KnowledgeRegistry._checkVisibility().

## 19. Authority matrix

| Concept | Authoritative source | Read path | Write path | Authorization | Visibility | Evidence |
|---|---|---|---|---|---|---|
| CozyOS public identity | DeveloperIdentity | CozyIdentityFAQRouter | static, repository-committed | none needed (public) | PUBLIC | repository_file |
| Founder's private story | Founder Story Vault | Vault-gated only | Vault-gated only | IdentityEngine permission methods | PRIVATE ("Only Me") | admin-configuration-equivalent |
| Applications (client view) | cozy-registry.js | listApplications() | registerApplication() | none (metadata-only) | PUBLIC (client-side) | repository_file |
| Payment providers | PaymentRegistry + KnowledgeRegistry | server routes / listKnowledge() | registerKnowledge() (admin-gated) | isPlatformAdmin/isAuthorized() | PUBLIC/ADMIN per record | test_result/repository_file |
| Crypto/rate/quote facts | CryptoPaymentRegistry/QuoteEngine + KnowledgeRegistry | same | same | same | same | same |
| Financial balances | BillingRegistry | getWalletBalance() etc. | recordLedgerEntry() only | isAuthorized() | ORGANIZATION | database_schema/runtime_observation |
| User memory | CozyMemoryEngine | readMemory() (actorId self-reported) | saveMemory() | none real | per-entry, client-enforced only | N/A |
| Organization memory | same | same | same | same | same | N/A |
| Repository architecture facts | KnowledgeRegistry (domain=architecture) | listKnowledge()/getKnowledgeById() | registerKnowledge() | isPlatformAdmin | configurable | repository_file |
| Evidence | knowledge_evidence_links | getEvidenceLinks() | linkEvidence() | inherits parent record | inherits | test/source_file/documentation/runtime_observation |

## 20. Proposed dependency graph (design only, nothing built)

Existing rp.js session resolution + OrganizationRegistry.isAuthorized()
(already real since Phase 2) -> ONE new read-only authenticated server
route (POST /knowledge/list and/or /knowledge/get, thin wrapper around
KnowledgeRegistry.listKnowledge()/getKnowledgeById(), reusing the class's
own authorization, adding nothing new) -> [FUTURE, NOT THIS STEP] a
thin client adapter for CozyAnswerEngine -> [FUTURE, NOT THIS STEP]
CozyBuilder's "does this exist" check, composed from repository search
+ this same route + capability-dependency-graph.js (once traced).

## 21. Recommended Phase C starting dependency — ONE concrete step

Add exactly one new, read-only, authenticated server route
(POST /knowledge/list or equivalent) that thinly wraps the already-built
KnowledgeRegistry.listKnowledge()/getKnowledgeById(), reusing the exact
existing currentSession()/OrganizationRegistry.isAuthorized() pattern
every other route in server.js already uses.

This is the lowest-level dependency both gaps actually need: GAP 1
needs a real way for anything outside the server process to reach
KnowledgeRegistry — this route is that, and nothing more. GAP 2 needs
the same primitive — a real way to ask "what does the server
authoritatively know about X" — before any duplicate-detection logic
can be built on top of it. Nothing else should be built before this.

---

## FINAL STATUS

PHASE A/B: COMPLETE

GAP 1: CONFIRMED (client CozyAI ecosystem has no path to the server-side
KnowledgeRegistry; the server-side auth/authorization primitives it
needs already exist and require no new invention)

GAP 2: CONFIRMED (no CozyBuilder-facing "does this exist" capability
found; capability-dependency-graph.js/capability-knowledge-acquisition.js
remain untraced candidates for composing one)

EXISTING SYSTEMS TO EXTEND:
- server.js's authenticated-route pattern (one new read-only route)

SYSTEMS TO PRESERVE:
- CozyAnswerEngine, CozyIdentityFAQRouter, DeveloperIdentity, CozyAdvisor,
  LivingAdvisor, cozy-registry.js, cozy-language-templates.js,
  rule-based-conversational-provider.js, Founder Story Vault,
  CozyMemoryEngine, KnowledgeRegistry, OrganizationRegistry, all four
  locked AI files (three present, one confirmed absent)

DUPLICATE SYSTEMS FORBIDDEN:
- any new identity/FAQ/answer/advisor/application-registry/language/
  knowledge engine — all already exist and are reusable, confirmed by
  tracing this round, not assumed

SECURITY LIMITATIONS:
- CozyMemoryEngine's self-reported actorId (documented, not fixed —
  out of this round's scope)
- Luo/Kikuyu/Kamba/Kalenjin are NOT currently supported languages —
  correcting the risk of overclaiming this from a test's name alone
- No client-side component may ever be trusted to enforce visibility —
  this must remain a server-side-only guarantee in any future bridge

NEXT SAFE IMPLEMENTATION STEP:
Add one new, read-only, authenticated POST /knowledge/list (and/or
/knowledge/get) route in server.js, thinly wrapping the existing
KnowledgeRegistry — reusing, not reimplementing, its authorization.

Not proceeding beyond this identification without a new instruction.
