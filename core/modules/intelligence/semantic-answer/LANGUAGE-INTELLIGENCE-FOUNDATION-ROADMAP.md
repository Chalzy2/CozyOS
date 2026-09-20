# Language Intelligence Foundation (LIF) — Future Phase Roadmap

Status: **documentation only** — no LIF phase is implemented yet. This file exists so
future accounts/agents do not re-derive or redesign this architecture from scratch,
and do not accidentally start building LIF-2 through LIF-14 before LIF-1 exists.

## Relationship to the Semantic Answer (SA-*) phases

SA-1 through SA-9 build the pipeline that turns one user turn into one validated,
language-realized response:

```
USER INPUT -> SEMANTIC UNDERSTANDING -> SEMANTIC ANSWER PLAN -> VERIFIED EVIDENCE
  -> LANGUAGE REALIZATION -> RESPONSE VALIDATION -> FINAL RESPONSE -> TTS
```

LIF is a **separate, later program** that makes CozyAI's own language capability
introspectable and improvable over time — i.e. it lets the cognitive layer ask
"what do I not know yet, in this language, for this concept?" and represent the
answer as structured, governed data instead of silently guessing or silently
translating. LIF phases are consumed BY the SA pipeline (a LANGUAGE_GAP is one
possible cognitive-decision status a SemanticAnswerPlan can carry — see SA-3's
`cognitive-decision-contract.js`) — LIF does not replace or duplicate the SA
pipeline, and the SA pipeline does not need any LIF phase beyond LIF-1's
vocabulary to exist and function today.

One CozyAI. One Live Window. LIF is a capability of that same intelligence, not a
second AI, and every LIF phase inherits the existing authorization, provenance,
and CozyLearn governance boundaries — none of that is re-invented here.

## Stages

- **LIF-1 — Language Capability Model.** The vocabulary this roadmap and SA-3's
  `cognitive-decision-contract.js` establish now: `LANGUAGE_GAP_TYPE` (LEXICAL_GAP,
  GRAMMAR_GAP, ENTITY_NAME_GAP, ... — see that contract for the full frozen list),
  a multi-dimensional coverage shape per language (vocabulary/entities/grammar/
  pronunciation/TTS/STT/domain-terminology, each independently
  verified/partial/insufficient — never one collapsed percentage), and the
  `LANGUAGE_EVIDENCE_SOURCE` taxonomy (APPLICATION, CODEBASE, DOCUMENT, AUDIO,
  VIDEO, AUDIOBOOK, USER_TAUGHT, NLLB_CANDIDATE, ORGANIZATION, PUBLIC — see that
  contract). No ingestion. No storage engine. Just the shared nouns every later
  phase and every future account must reuse rather than reinvent.

- **LIF-2 — Language Gap Detection.** Given a SemanticAnswerPlan attempt that
  cannot proceed to DIRECT_ANSWER because evidence in the requested language is
  missing or insufficient, produce a `LanguageGap` record (gapType, language,
  domain/concept, and what evidence class would close it) instead of silently
  answering in the wrong language or fabricating content. Consumes LIF-1's
  vocabulary; produces no new storage.

- **LIF-3 — Language Evidence Discovery.** Given a LanguageGap, search existing
  AUTHORIZED evidence sources already registered with SA-2's
  `VerifiedEvidenceAdapter` (application knowledge, organization knowledge,
  public knowledge, memory) for anything that could close the gap, before ever
  reaching for translation or external sources. Read-only; no new adapters.

- **LIF-4 — Vocabulary Construction.** Adapters that turn authorized DOCUMENT/
  CODEBASE/APPLICATION sources into candidate lexical evidence (concept ->
  per-language lemma), always tagged CANDIDATE, never VERIFIED, until LIF-9.

- **LIF-5 — Grammar/Structure Evidence.** Candidate grammar patterns
  (subject-verb-object ordering, agreement rules, question-formation patterns)
  per language, sourced the same way, same CANDIDATE discipline.

- **LIF-6 — Entity/Place/Domain Terminology.** Specializes LIF-4 for proper
  nouns, place names, and domain-specific terminology (agriculture, church,
  commerce, etc.) — the categories most likely to have no dictionary coverage.

- **LIF-7 — Pronunciation/STT/TTS Evidence.** Candidate pronunciation and
  speech-recognition/synthesis evidence, always carrying transcription
  confidence and never silently promoted from raw STT/TTS output to verified
  language fact (see LIF-1's provenance rule for AUDIO/VIDEO sources).

- **LIF-8 — Cross-language Semantic Alignment.** Links per-language evidence
  back to one canonical, language-neutral concept id (the "CONCEPT_HELP -> en:
  help, sw: saidia, luo: [pending]" shape) so each language is evidence *about*
  a shared concept, never a separate knowledge universe (no SwahiliDatabase,
  no LuoDatabase — one canonical foundation, many language-tagged evidence
  records).

- **LIF-9 — Verification & Human Review.** The ONLY phase allowed to move
  evidence from CANDIDATE to VERIFIED/CURATED status, via the existing
  CozyLearn governance boundary — never automatically, never by a confidence
  threshold alone.

- **LIF-10 — CozyLearn Integration.** Wires LIF's LEARNING_CANDIDATE
  cognitive-decision status (already defined in LIF-1's vocabulary) to
  CozyLearn's existing promotion/governance path. Does not modify CozyLearn's
  own implementation — consumes its existing API.

- **LIF-11 — Continuous Gap Analysis.** Background, authorized, rate-limited
  re-evaluation of known gaps as new evidence becomes available (e.g. a user
  teaches a term, a new document is authorized) — proposes re-verification,
  never auto-promotes.

- **LIF-12 — Fluency Evaluation.** Reports the multi-dimensional coverage model
  from LIF-1 per language/domain, for CozyAI's own introspection and for
  authorized human review — never a single "N% fluent" number.

- **LIF-13 — Live Window Integration.** The only phase permitted to let the
  Live Window's live request path actually ask a LANGUAGE_GAP-triggered
  clarifying question to an authorized user in production. Everything before
  this phase stays isolated from `#send()`, exactly like SA-3 through SA-6.

- **LIF-14 — Full Regression & Certification.** Same discipline as SA-9: full
  regression across SA-1 through SA-9 and LIF-1 through LIF-13 together, package
  artifacts, certify no duplicate AI/cognitive system was introduced anywhere
  in the combined effort.

## Non-negotiables that apply to every LIF phase (restated, not new)

- One CozyAI, one Live Window. No LanguageAI/LearningAI/TranslationAI.
- NLLB output is CANDIDATE_TRANSLATION, never automatically VERIFIED_LANGUAGE_KNOWLEDGE.
- STT/TTS/video/audio extraction is evidence, never automatic truth.
- Code-derived terminology keeps `source: CODEBASE` provenance; it is not
  automatically natural-language-verified.
- User-taught knowledge is USER_TAUGHT by default; dialect/regional variation
  is preserved, never silently overwritten by a "global" version.
- The 17-language Language Pack registry stays the identity/configuration
  authority (`motherLanguages`/`languagesKnown`/`languagePreference`); the
  Language Foundation this roadmap describes is knowledge, not identity, and
  the two are never merged into one registry.
- Builder-context evidence never leaks into ordinary user context, and vice
  versa — same authorization boundary SA-2/SA-3 already established.

## What is explicitly NOT part of any current phase

PDF ingestion engine, audiobook ingestion engine, video ingestion engine,
universal code crawler, automatic internet learning, automatic language
promotion, a complete Language Foundation database, a complete NLLB learning
pipeline, automatic TTS/STT evaluation, autonomous self-modification. Each of
these is future LIF-3 through LIF-12 work, gated the same way SA-4 through
SA-9 are gated: phase-by-phase, tested, isolated, never committed/pushed/
deployed without explicit approval.
