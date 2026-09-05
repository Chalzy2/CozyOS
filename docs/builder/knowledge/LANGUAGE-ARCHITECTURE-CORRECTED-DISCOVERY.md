# CozyOS Language Architecture — Corrected Discovery Report

This corrects an oversimplification in my own prior report. Last round
I described cozy-language-templates.js's 5 languages (en/sw/fr/ar/so)
as if that were the whole language picture. It wasn't — it's one layer
of a real, three-tier architecture that already exists, matching this
round's framing closely, but with different exact numbers than assumed.
Every figure below is traced directly from source code, per the
explicit instruction not to guess the lists.

No code was written or modified this round — discovery only.

---

## The three tiers, precisely, with sources

### Tier 1 — CozyOS Default Language-Pack Identities (17, confirmed exact)

Source: core/modules/intelligence/language-packs/cozy-language-pack-registry.js,
DEFAULT_IDENTITIES array, confirmed by direct read, not assumed:

| # | Code | Name | Native name |
|---|---|---|---|
| 1 | en | English | English |
| 2 | sw | Kiswahili | Kiswahili |
| 3 | fr | French | Francais |
| 4 | ar | Arabic | Arabic script |
| 5 | so | Somali | Soomaali |
| 6 | ru | Russian | Russian script |
| 7 | zh | Chinese/Mandarin | Chinese script |
| 8 | ha | Hausa | Hausa |
| 9 | yo | Yoruba | Yoruba |
| 10 | luo | Luo/Dholuo | Dholuo |
| 11 | ki | Kikuyu | Gikuyu |
| 12 | kam | Kikamba | Kikamba |
| 13 | zu | isiZulu | isiZulu |
| 14 | am | Amharic | Amharic script |
| 15 | ln | Lingala | Lingala |
| 16 | ig | Igbo | Igbo |
| 17 | hi | Hindi | Hindi script |

This is a language-pack identity/container registry — it tracks which
language identities exist as slots in the system (for translation/
speech/OCR pack purposes), not whether CozyAI has verified
conversational response text for each. The registry's own code
distinguishes origin: "DEFAULT" (these 17) from origin: "OPTIONAL" (see
Tier 1.5) specifically so the two are never confused.

### Tier 1.5 — Optional/Extended Language Packs (mechanism confirmed real; no currently-registered members found)

Source: core/modules/intelligence/language-packs/cozy-optional-language-pack-discovery.js.
This is a real, governed mechanism for admitting a new, non-default
language identity into the same single registry as a container —
explicitly never a second registry, and explicitly never auto-
promoted: "no promote/forceAvailable/approvePack/setStatus('AVAILABLE')
exists here or anywhere this file calls into." This round's search did
not find evidence of any currently-registered optional pack beyond the
17 defaults — reported as mechanism exists, membership currently empty
or not found, not guessed at.

### Tier 2 — RP-027 Conversational Response-Template Registry (a different, smaller real system — my prior report's finding, now correctly scoped)

Source: core/modules/intelligence/language/cozy-language-registry.js +
cozy-language-templates.js (inspected last round). This is specifically
about whether CozyAI's identity/FAQ-style conversational answering has
verified response text:

- 5 AVAILABLE (verified templates exist): en, sw, fr, ar, so
- 6 NOT_READY (registered/selectable, zero verified templates):
  luo, ki, kam, zu, lg, ig

Cross-referenced against Tier 1, precisely:
- All 5 AVAILABLE languages are among the 17 default identities.
- 5 of the 6 NOT_READY languages (luo, ki, kam, zu, ig) are also among
  the 17 default identities. One — lg (Luganda) — appears in the RP-027
  registry's NOT_READY list but is NOT one of the 17 default identities
  in the pack registry (Tier 1's list has no lg entry at all). This is
  a real, traced discrepancy between the two registries, not resolved
  by this report — flagged for whoever owns either file to reconcile,
  not silently assumed to be a typo.
- 7 languages have a Tier-1 pack identity but zero presence in Tier 2 at
  all — not even a NOT_READY placeholder: ru, zh, ha, yo, am, ln, hi.
  CozyAI's identity/FAQ conversational layer does not currently know
  these exist as an answerable-language option, even though the
  language-pack layer does.

### Tier 3 — NLLB Model Coverage (202 languages, confirmed grounded in real source, not assumed)

Source: language-packs/shared/NLLB-200-600M-INT8/ (a real model
directory with an actual Python HTTP bridge, nllb_http_bridge.py) +
core/modules/speech/adapters/speech-translation-provider-nllb.js (the
real JS client).

The 202 figure is not an outside assumption — it is stated directly in
the bridge's own comment: "NLLB's 202 languages are not added to [the
canonical 17-language registry] — only this file's COZY_TO_NLLB map
exists to bridge the two." This confirms, from the repository's own
documentation, exactly the boundary this round's instructions describe:
NLLB coverage and CozyOS product-language support are explicitly and
deliberately kept separate, with only a partial, named bridge map
connecting specific CozyOS language IDs to specific NLLB codes — not an
assumption that all 202 are usable.

Not traced this round (disclosed, not guessed): the exact contents of
COZY_TO_NLLB — i.e., precisely which of the 17 (or fewer) CozyOS
language identities currently have a live NLLB bridge mapping.

Availability is honestly, dynamically computed, confirmed by reading
the adapter's actual logic: isAvailable()/translate() always re-check
the real local bridge's /health endpoint before claiming isReal: true.
If the bridge process isn't running or the model isn't loaded, the
provider fails closed — isAvailable() resolves false, translate()
rejects into an honest {isReal: false, reason}, never a fabricated
translation. This matches, independently, the exact "do not claim NLLB
support unless actually verified live" principle this round's
instructions describe — the engineers who built this already
implemented that discipline before being asked to.

## A genuinely interesting related finding: a documented historical bug

core/modules/speech/adapters/speech-translation-adapter.js contains a
comment referencing "R040 Phase 1 fix (15-vs-17 language gap)" — a
real, previously-discovered and previously-fixed discrepancy between
two counts of "how many languages," of the same species as the
discrepancies this report documents above. Not re-investigated in depth
this round (out of budget), but noted as evidence that this exact
category of cross-registry inconsistency has happened before in this
codebase and was taken seriously enough to get its own fix milestone.

## Corrected summary table

| Question | Answer, precisely |
|---|---|
| How many CozyOS default language-pack identities exist? | 17, exact list above, confirmed from cozy-language-pack-registry.js |
| How many have verified CozyAI conversational response templates? | 5 (en, sw, fr, ar, so) |
| How many are registered for conversational use but not yet verified? | 6 (luo, ki, kam, zu, lg, ig) — note: lg is not one of the 17 default pack identities, a real cross-registry discrepancy |
| How many of the 17 have zero conversational-template presence at all? | 7 (ru, zh, ha, yo, am, ln, hi) |
| Does an extended/optional tier exist beyond the 17? | Mechanism exists (cozy-optional-language-pack-discovery.js), no currently-registered members found this round |
| How many languages does the underlying NLLB model cover? | 202, confirmed from the model bridge's own source comment |
| Does NLLB coverage mean CozyOS supports that language? | No — explicitly, deliberately kept separate; only a partial COZY_TO_NLLB bridge map connects the two |

## Never collapse these numbers

Per this round's own final principle, restated with the now-precise
figures: "17 default language-pack identities" (Tier 1), "5 verified /
6 unverified conversational languages, a subset of the 17, plus one
cross-registry discrepancy" (Tier 2), and "202 NLLB model languages, of
which an unspecified subset is actually bridged" (Tier 3) are three
different numbers describing three different real systems. None should
ever be quoted as if it were another.

## No duplication created or proposed

Per the explicit instruction, no new language registry, translation
registry, NLLB registry, or language capability engine was created or
designed this round. Every fact above was extracted from an existing,
already-real file. The one concrete, disclosed follow-up (tracing
COZY_TO_NLLB's exact contents, and resolving the lg cross-registry
discrepancy) is flagged for a future round, not acted on now.

## FINAL STATUS

DISCOVERY: COMPLETE for the three-tier structure and exact Tier 1/Tier 2
membership.

NOT YET TRACED: COZY_TO_NLLB's exact language-code mapping; whether any
optional/extended pack is currently registered beyond the 17 defaults;
the historical "15-vs-17" bug's exact resolution.

CORRECTION ISSUED: my own prior report's implicit "5 languages total"
framing is superseded by this report's 17/11/202 three-tier picture.

No code changed this round.
