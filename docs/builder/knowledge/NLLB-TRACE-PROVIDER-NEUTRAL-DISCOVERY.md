# CozyOS Language Intelligence — NLLB Trace + Provider-Neutral Discovery

Discovery only. No code, schema, registry, or merge changes made.

---

## 1. Exact COZY_TO_NLLB location

Defined in exactly one file:
language-packs/shared/NLLB-200-600M-INT8/nllb_http_bridge.py, line 112.
Referenced nowhere else in the repository except my own prior report
(which quoted its comment). It is genuinely used within that same file
(lines 178-179, 241, 243) — not a dead/unused declaration.

## 2. Exact mapping contents

COZY_TO_NLLB = {
    "sw": "swh_Latn",  "en": "eng_Latn",  "fr": "fra_Latn",  "ar": "arb_Arab",
    "so": "som_Latn",  "ru": "rus_Cyrl",  "zh": "zho_Hans",  "ha": "hau_Latn",
    "yo": "yor_Latn",  "luo": "luo_Latn", "ki": "kik_Latn",  "kam": "kam_Latn",
    "zu": "zul_Latn",  "am": "amh_Ethi",  "ln": "lin_Latn",  "ig": "ibo_Latn",
    "hi": "hin_Deva",
}

Correction to my own prior report's implied uncertainty: this is a
complete, one-to-one mapping — all 17 canonical language identities
are present, not a partial subset. The JS-side adapter
(core/modules/speech/adapters/speech-translation-provider-nllb.js,
line 52-54) independently declares its own SUPPORTED_LANGUAGES array
with the exact same 17 codes, character-for-character — the two sides
of the bridge agree.

Mapping shape: one-to-one (each CozyOS code maps to exactly one NLLB
code). Error handling: both source_lang and target_lang are validated
against COZY_TO_NLLB membership before any translation attempt; an
unsupported code returns a structured 400 failure with the literal
unsupported value echoed back — never a silent fallback, never a
guessed translation. Same-language requests are explicitly rejected.

## 3. Runtime path (traced, not assumed)

canonical language code (e.g. "sw")
  -> JS adapter's SUPPORTED_LANGUAGES check (speech-translation-provider-nllb.js)
  -> HTTP POST to local bridge (nllb_http_bridge.py, default port 8177)
  -> COZY_TO_NLLB lookup -> NLLB code (e.g. "swh_Latn")
  -> real NLLB-200-600M-INT8 model (if loaded)
  -> translated text returned over HTTP
  -> JS adapter returns {isReal, translatedText, providerName}

## 4. Classification per connection — real evidence, not assumption

DECLARED (all 17): every canonical code has a COZY_TO_NLLB entry and a
matching SUPPORTED_LANGUAGES entry on the JS side.

RUNTIME_VERIFIED: none, in this repository's own evidence. Traced
precisely:
- speech-translation-provider-nllb.integration.test.js performs one
  real, live test — sw -> en only — but it is explicitly gated behind
  skip: !RUN_INTEGRATION (COZY_RUN_NLLB_INTEGRATION=1), disabled by
  default.
- real_sw_to_16.js is an honestly-labeled MANUAL script ("NOT part of
  the automated node --test suite... run it manually on the target
  machine"), with no captured output evidence committed anywhere in
  the repository — it is a capability to run the test, not a record
  that it was run.
- Directly attempted in this environment: python3 -c "import torch"
  fails (ModuleNotFoundError: No module named 'torch'), and no model
  weight files (.bin/.safetensors) exist under
  language-packs/shared/NLLB-200-600M-INT8/. The real model cannot
  even load here, let alone translate.

Correct classification for all 17: DOCUMENTED_ONLY / BLOCKED — mapping
and code paths are real and complete; live execution is honestly
ungated-but-never-exercised in this repository's own evidence, and
directly confirmed impossible in this sandbox specifically (missing
dependency, missing weights).

## 5. Evidence matrix

| Language | Canonical 17 | Conversational (Tier 2) | NLLB Mapping (declared) | NLLB Runtime | Evidence |
|---|---|---|---|---|---|
| en | yes | AVAILABLE | yes eng_Latn | NOT_RUN | repository_file + attempted-and-blocked runtime check |
| sw | yes | AVAILABLE | yes swh_Latn | NOT_RUN | same |
| fr | yes | AVAILABLE | yes fra_Latn | NOT_RUN | same |
| ar | yes | AVAILABLE | yes arb_Arab | NOT_RUN | same |
| so | yes | AVAILABLE | yes som_Latn | NOT_RUN | same |
| ru | yes | ABSENT (Tier 2) | yes rus_Cyrl | NOT_RUN | same |
| zh | yes | ABSENT | yes zho_Hans | NOT_RUN | same |
| ha | yes | ABSENT | yes hau_Latn | NOT_RUN | same |
| yo | yes | ABSENT | yes yor_Latn | NOT_RUN | same |
| luo | yes | NOT_READY | yes luo_Latn | NOT_RUN | same |
| ki | yes | NOT_READY | yes kik_Latn | NOT_RUN | same |
| kam | yes | NOT_READY | yes kam_Latn | NOT_RUN | same |
| zu | yes | NOT_READY | yes zul_Latn | NOT_RUN | same |
| am | yes | ABSENT | yes amh_Ethi | NOT_RUN | same |
| ln | yes | ABSENT | yes lin_Latn | NOT_RUN | same |
| ig | yes | NOT_READY | yes ibo_Latn | NOT_RUN | same |
| hi | yes | ABSENT | yes hin_Deva | NOT_RUN | same |
| lg | NO (not in canonical 17) | NOT_READY | NO no entry | N/A | see section 7 |

## 6. Seven-language gap — re-verified against actual files

Confirmed again, directly: ru, zh, ha, yo, am, ln, hi each have a
Tier-1 canonical identity and a Tier-3 NLLB mapping, but zero entry of
any kind in Tier 2's cozy-language-registry.js (DEFAULT_LANGUAGES nor
EXTENDED_LANGUAGES — re-checked, neither array mentions any of these
seven). NLLB coverage does NOT close this gap. NLLB is a translation-
model capability; Tier 2 is specifically about CozyAI's identity/FAQ
conversational response templates, a categorically different
capability (fixed sentence frames answering "who founded CozyOS," not
open translation). Declaring an NLLB mapping for "ha" does not give
CozyAI a verified Hausa answer to "who founded CozyOS" — that requires
a Tier-2 template, which does not exist for any of these seven.

## 7. Luganda (lg) — reported as a discrepancy, not resolved

Origin: lg appears only in cozy-language-registry.js's
EXTENDED_LANGUAGES array (state: "NOT_READY") — Tier 2. Not in Tier 1:
cozy-language-pack-registry.js's 17 canonical identities have no lg
entry at all (re-confirmed this round). No language pack exists for it
(no Tier-1 container). NLLB does not support it via this bridge: no lg
key in COZY_TO_NLLB (re-confirmed this round). No application
reference found to lg beyond the one cozy-language-registry.js array
entry (searched this round; no other hit). No historical documentation
found explaining its presence distinct from the other five extended
languages it sits alongside (luo/ki/kam/zu/ig, all five of which ARE
canonical-17 members).

Reported as: LANGUAGE REGISTRY DISCREPANCY. No authoritative evidence
resolves why lg was added to Tier 2's extended list without a
corresponding Tier-1 canonical identity. Not adjudicated this round.

## 8. Historical "15-vs-17 language gap" — traced, not rewritten

Source: core/modules/speech/adapters/speech-translation-adapter.js,
comment: "R040 Phase 1 fix (15-vs-17 language gap)." This round located
the comment but did not trace the full R040 milestone's own change
report/handoff record (out of budget) to determine precisely what the
15-count source was, which registry was declared authoritative, or
which files changed at that time. Flagged as not fully traced, not
guessed at. What IS confirmed: this establishes that a real, previously
-encountered instance of exactly this class of discrepancy (two
different counts of "how many CozyOS languages") was taken seriously
enough to receive a dedicated fix milestone.

---

## PROVIDER-NEUTRALITY CORRECTION — Gemini, Cozy Language Context, and Learning Infrastructure

Per the explicit architectural correction: NLLB is not being treated as
central. The following were inspected this round specifically to avoid
that error.

### Gemini (real, substantial, and — like NLLB — honestly blocked in this specific sandbox)

Real infrastructure exists: server/ai/gemini-backend-endpoint.js,
server/ai/gemini-runtime-harness-server.js,
core/living/providers/gemini-cloud-provider.js (+ bootstrap),
tools/termux/gemini-real-execution-probe.js, and two dedicated phase
reports. The real-execution report is explicit and honest about its
own boundary: real execution requires a real GEMINI_API_KEY AND
network egress on a networked host — and documents that "a real (not
simulated) execution attempt was made from within [a] sandbox" and was
stopped at the egress layer. This sandbox's own network configuration
(Enabled: false) confirms the same boundary applies here. Gemini
availability here is BLOCKED for the identical structural reason as
every external provider throughout this whole engagement (payment
providers, exchange rates, NLLB) — not a special exception, the same
rule.

### "Cozy Language Context" — not found under that exact name

No file or export named CozyLanguageContext/cozy-language-context was
found. The closest, genuinely real match is LivingLanguageVerification
(referenced in the CP16B checkpoint), which tracks a language field on
observations for confidence/deduplication purposes — a different
concept from a semantic "language context" router. Flagged as not
found under the assumed name; the actual closest real component is
named differently and serves a narrower purpose (observation
provenance, not translation routing). Not designed around further this
round.

### Learning infrastructure — real, and a genuine filesystem inconsistency found

Two learning-engine.js files exist: core/modules/builder/learning-engine.js
(Builder Layer 4 aggregator, inspected in a prior round) and
core/modules/leaning/learning-engine.js (note: directory literally
spelled "leaning," missing the "r"). The second file's own internal
header states "File Reference: core/modules/learning/learning-engine.js"
— i.e., the file documents itself as living at a correctly-spelled path
that does not match its actual, misspelled directory location. This is
a real, observed filesystem/path inconsistency — not a deliberate
second engine (the described responsibility, "A thin, real coordinator
— NOT a new storage system... owns no pattern data itself," matches the
Builder aggregator's own description closely). Not resolved or renamed
this round, per instruction not to reconcile yet — reported as found.

core/modules/builder/capability-knowledge-acquisition.js,
docs/builder/reports/m375-learning-engine-verification.md, and the
CP16B checkpoint's "Continuous Learning Metadata" work are all real,
existing pieces of a genuine learning/observation pipeline
(universal-learning-pipeline.js, knowledge-provenance-engine.js) — not
traced to full depth this round, flagged for a future pass.

### Provider-neutral principle — confirmed, not merely asserted

Given the evidence above, the corrected principle holds up under
inspection, not just as a stated instruction: NLLB and Gemini are
architecturally parallel, independent capabilities, both real, both
currently blocked in this specific sandbox for the same underlying
reason (no live model/no network egress), neither more "central" than
the other. Nothing found this round justifies elevating either over the
other, or over a possible future third/fourth provider.

---

## 10. Authority matrix (per capability, not one registry owning everything)

| Capability | Owner (traced) | Evidence type |
|---|---|---|
| Canonical language identity (Tier 1, the 17) | cozy-language-pack-registry.js | repository_file |
| Optional/extended pack admission | cozy-optional-language-pack-discovery.js (governance mechanism only, composes Tier 1's own registry) | repository_file |
| Conversational availability (Tier 2) | cozy-language-registry.js + cozy-language-templates.js | repository_file + template content |
| NLLB model coverage declaration | nllb_http_bridge.py's COZY_TO_NLLB (Python) + speech-translation-provider-nllb.js's SUPPORTED_LANGUAGES (JS) — two independent declarations, currently in agreement, not a single shared source | repository_file |
| NLLB live runtime | the actual running bridge process + loaded model (not present in this environment) | runtime_observation (currently: none) |
| Gemini live runtime | gemini-cloud-provider.js + a real GEMINI_API_KEY + network egress (not present here) | runtime_observation (currently: none) |
| STT | not traced this round | UNKNOWN |
| TTS | core/living/living-tts.js (found, prior round; not traced in depth) | UNKNOWN (located, scope not verified) |
| OCR | not searched this round | UNKNOWN |
| Application/UI language availability | not traced this round — no single component confirmed as owner | UNKNOWN |
| Observation/provenance language tagging | LivingLanguageVerification (core/living/) | test_result (16-test suite, per CP16B) |

No single registry owns every capability. This matches the
instruction's own expectation — confirmed by evidence, not assumed.

## 11. Existing reusable components (confirmed this round)

cozy-language-pack-registry.js, cozy-optional-language-pack-discovery.js,
cozy-language-registry.js, cozy-language-templates.js,
nllb_http_bridge.py + speech-translation-provider-nllb.js,
gemini-cloud-provider.js + gemini-backend-endpoint.js,
LivingLanguageVerification, the Builder learning-engine.js aggregator
(at whichever of its two paths is eventually confirmed canonical).

## 12. Missing dependency

A genuine, real "language capability status" layer that can honestly
answer, per language and per capability (translation-via-NLLB,
translation-via-Gemini, conversational-template, STT, TTS, OCR,
UI/application support) — independently — does not exist yet. This is
the concrete shape of the "Universal Language Intelligence" concept
from the master prompt, but nothing should be built toward it before
STT/TTS/OCR/UI ownership (currently UNKNOWN above) are actually traced.

## 13. Security/authorization considerations

The NLLB bridge's own input validation (rejecting unsupported codes,
rejecting same-source/target) is real and already sound — no gap found
there. Neither NLLB nor Gemini credentials/secrets were found hard-
coded anywhere searched this round (consistent with every prior
phase's findings). Open question, not yet answered: if a future
universal language-routing layer is built, it must decide per-request
which provider (NLLB/Gemini/future) to use — this routing decision
itself needs the same "never let the client decide" server-authority
principle already enforced everywhere else in this engagement
(payments, quotes, knowledge visibility). Not designed this round.

## 14. Recommended NEXT SINGLE DEPENDENCY-FIRST STEP

Trace STT, TTS, OCR, and application/UI language-availability ownership
(currently all UNKNOWN in the authority matrix, section 10) before any
further design of a routing/capability-status layer. Without knowing
who owns these, a "Universal Language Intelligence" design would be
built on three unverified assumptions rather than evidence — exactly
the mistake this round's corrections (the 17-vs-11 count, the Luganda
discrepancy, the "leaning" typo) demonstrate is easy to make and costly
to leave unchecked.

---

## FINAL STATUS

NLLB TRACE: COMPLETE. Mapping is real and complete (17/17 declared);
runtime evidence is NOT_RUN in this repository and directly confirmed
impossible in this sandbox (missing torch, missing model weights).

PROVIDER-NEUTRALITY CORRECTION: APPLIED. Gemini traced as a real,
parallel, independently-blocked capability — not subordinate to or
inspected only in NLLB's shadow. "Cozy Language Context" not found
under its assumed name; closest real match identified and
distinguished. A genuine filesystem path inconsistency found in the
learning infrastructure (leaning/ vs learning/), reported, not fixed.

NO CODE CHANGED. NO SCHEMA ADDED. NO REGISTRY MERGED. NO LANGUAGE
STATUS ALTERED.

Stopping after this report, per instruction.
