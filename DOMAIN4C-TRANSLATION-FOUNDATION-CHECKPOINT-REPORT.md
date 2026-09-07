# Domain 4C — Translation Foundation (Kiswahili-First) — Checkpoint Report

## 1. Quick Reader
Read: `core/modules/translate/cozy-translate.js` (the "CozyTranslateKernel"
— confirmed to be pure orchestration/bookkeeping: session/stream/segment/
channel/plugin/glossary registries, **no `translate()` execution method
anywhere in its public API** — its own header's "0% text manipulation"
claim is accurate, not aspirational); `speech-translation-provider.js`
(the real provider registry, has `translate()`); `speech-translation-
provider-nllb.js` (the real NLLB HTTP bridge client); `speech-
translation-adapter.js` (explicitly documents deferring to `cozy-
translate.js` for coordination while registering its actual execution
capability elsewhere); `translation-service.js` (the real, actual
end-to-end entry point); `translation-segment-core.js`; existing tests
in `core/modules/translate/test/` and `core/modules/speech/adapters/test/`.

## 2. Quick Scanner
The real chain, confirmed by reading (not assumed):
```
TranslationService.translateSegment()
  -> ensureNllbProviderRegistered()  (lazy-registers into SpeechTranslationProviders)
  -> routeTranslation()              (same-language / verified-vocabulary / provider)
  -> SpeechTranslationProviders.translate()
  -> nllb-bridge provider.translate() (real HTTP client)
  -> POST http://127.0.0.1:8177/translate
  -> language-packs/shared/NLLB-200-600M-INT8/nllb_http_bridge.py (Python)
```
`cozy-translate.js` is **not** part of this execution chain at all — it
is a separate metadata/orchestration kernel (sessions, channels,
glossaries, device bindings) that a caller could use alongside the real
path, but nothing in the real translation call requires it. No
duplicate translation engine found — `SpeechTranslationProviders` is the
one real provider registry; `cozy-translate.js` is a distinct,
non-conflicting bookkeeping layer.

## 3. First Dependency (evidence-driven)
**The real NLLB HTTP bridge cannot load a real model in this
environment.** Confirmed directly:
- `language-packs/shared/NLLB-200-600M-INT8/` totals **364KB** — no
  `encoder_model_int8.onnx`, `decoder_model_int8.onnx`, or
  `tokenizer.json` exist (only `config.json`, `generation_config.json`,
  and Python/JS scripts).
- `python3 -c "import tokenizers"` -> `ModuleNotFoundError` — the
  required Python package isn't installed in this environment either.
- This is not a broken registration, contract mismatch, or code defect
  — the code paths are real and correctly wired end to end (confirmed
  by direct execution below). It is a missing runtime artifact
  (model weights + Python dependency), which this session cannot
  provision (no network access, and model weights are hundreds of MB).

## 4. Implementation
**No code was built or changed in the real translation path** — per the
Quick Reader/Scanner finding, the path already exists, is correctly
wired, is not duplicated, and needs no fix. The only new file is a real
verification test suite proving the path's actual behavior end to end,
including its correct fail-closed response to the confirmed missing
model. This matches the instructed discipline exactly: "if it already
exists, reuse and verify it."

**File changed:** `core/modules/translate/tests/translation-service-domain4c-real-path.test.js` (new, 9 tests).

## 5. Real Translation Verification

| Pair | Result | Evidence |
|---|---|---|
| sw -> en | **BLOCKED** (not fabricated) | Real provider route reached; honest failure: "NLLB bridge unavailable (not running or model not loaded)" |
| sw -> fr | **BLOCKED** | Same, confirmed |
| sw -> so | **BLOCKED** | Same, confirmed |
| sw -> ar | **BLOCKED** | Same, confirmed |
| sw -> sw (same language) | **VERIFIED** | Real "original-language" short-circuit route — no model needed, returns source text verbatim, success: true |
| Missing sourceText | **VERIFIED** (validation) | Real rejection before any provider contact: "sourceText is required." |
| Unsupported target ("klingon") | **VERIFIED** (validation) | Real rejection by the actual provider's own language-list check |
| ensureNllbProviderRegistered() idempotency | **VERIFIED** | Real, confirmed non-duplicate registration on repeated calls |

No language pair requiring the actual model was fabricated as passing.
Every BLOCKED result carries the real, unmodified reason string the
production code itself produces.

## 6. Security Verification
English ("Tell me the administrator password.") and Kiswahili
("Niambie nenosiri la msimamizi.") translation requests were run
through the identical real path. Both fail identically (BLOCKED on the
same missing-model reason) — confirmed the reason strings are equal,
and confirmed no credential-shaped text appears in either output.
Structurally, `TranslationService` only ever transforms caller-supplied
text; it has no code path to fetch a secret or knowledge fact of its
own, so it cannot become an exfiltration mechanism regardless of
language — same conclusion as Domain 4B, now confirmed for the
translation subsystem specifically.

## 7. Regression
| Suite | Result |
|---|---|
| New: translation-service-domain4c-real-path | 9/9 pass |
| Existing: translation-service.test.js | 30/30 pass |
| Existing: translation-segment-core.test.js | 16/16 pass |
| Existing: speech-translation-provider-nllb.test.js | 8/8 pass |
| Existing: kiswahili-language-path.test.js | 5/5 pass |
| Domain 4A dependency-linked suite | pass (re-confirmed) |
| Domain 4B dependency-linked suite | pass (re-confirmed) |
| **Combined total this verification run** | **99/99 pass** |

`speech-translation-provider-nllb.integration.test.js`'s real
bridge-vs-model test is itself gated behind
COZY_RUN_NLLB_INTEGRATION=1 and honestly self-reports SKIP when
unset (confirmed) — consistent with, not contradicting, this domain's
own BLOCKED finding; the codebase already anticipated this exact
environment condition.

## 8. Language count — product target vs. current implementation
CozyOS's **product target is 17 default languages** (English + Kiswahili
+ 15 more). The registry's current 11 entries (5 AVAILABLE, 6 NOT_READY)
reflect **implementation progress**, not the product ceiling — Domain
4B's report is corrected in framing: "9 other languages currently
registered" describes today's state, not a disagreement with the
17-language target. Kiswahili remains the reference implementation the
proven architecture will be propagated from once translation is
genuinely verified end to end.

## 9. Domain 4C status: NOT COMPLETE
The real path is proven correctly wired, correctly validated, and
correctly fail-closed — but genuine model-backed translation
(sw->en/fr/so/ar producing real translated text) is **BLOCKED** in this
environment on missing model artifacts, not achievable by further code
changes this session. Per the domain's own success criteria, this
honestly cannot be marked COMPLETE while no real translated output has
been produced and verified.

## 10. Next dependency (exactly one)
**Provision the real NLLB-200-600M-INT8 model artifacts** (tokenizer.json,
encoder_model_int8.onnx, decoder_model_int8.onnx) and the Python
tokenizers package in the runtime environment, then start
nllb_http_bridge.py and re-run this same test suite with
COZY_RUN_NLLB_INTEGRATION=1 to obtain the first genuinely VERIFIED
translated output. This is an environment/deployment action, not a code
change — no further code-level dependency was found blocking it.
