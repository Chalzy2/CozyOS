# RP-035 Phase 1 — ADR: Canonical Language-Pack Identity Source

**Status:** Decided for Phase 1 scope. Not a deletion mandate — see below.

**Baseline:** COS-RP035-WOS2-P8-CERTIFIED.zip
SHA-256 `2316526cc612fd2bca874d7611b822906b22bbe144a62cabf3047a44176a5505`
(hashed twice, matched; not compared against a prior declared checkpoint
value because none was supplied to this session).

## Problem

Phase 0 found five language-related systems in the repository that do
not agree with each other:

| File | What it actually is | 13-identity match? |
|---|---|---|
| `core/language.js` | Active-locale getter/setter, 41 lines | No — uses its own ad hoc fallback list (`kik`, `kal`) |
| `core/languageImporter.js` | 6-string UI-chrome dictionary for 5 locales | No — not vocabulary, app-label localization only |
| `core/modules/language/language-engine.js` | Mature 885-line shared translation system, self-reports 16 languages (7 strong / 5 moderate / 8 metadata-only) | No — a different, larger identity set |
| `core/modules/intelligence/language/cozy-language-registry.js` (RP-027) | Response-template selector: 5 AVAILABLE + 6 NOT_READY (`luo, ki, kam, zu, lg, ig`) | No — missing `ru, zh, ha, yo`; includes `lg, ig` which are not canonical |
| `core/modules/intelligence/language-packs/cozy-language-pack-registry.js` (RP-035) | 595-line pack registry with `DEFAULT_IDENTITIES` | **Yes — exact match to the 13** |

## Decision

`core/modules/intelligence/language-packs/cozy-language-pack-registry.js`
is the **canonical source of truth for the 13 default language-pack
identities** (`en, sw, fr, ar, so, ru, zh, ha, yo, luo, ki, kam, zu`).

No other file may independently define, rename, or extend this set.
`registerOptionalPack()` already blocks any optional registration that
collides with a default identity (`COLLIDES_WITH_DEFAULT_IDENTITY`),
which structurally enforces this decision going forward.

## Disposition of the other four systems (none deleted in Phase 1)

1. **`core/language.js`** — retained. Its actual job (which UI locale is
   currently active) is legitimately different from "which language
   packs exist for teaching/learning." Recommend a future, small repair
   to source its fallback list from the canonical registry instead of
   its own hardcoded array, so `kik`/`kal` don't silently diverge
   further. Not done in Phase 1 — out of scope, and it is a currently-
   working file this repair must not destabilize without its own
   verification pass.

2. **`core/languageImporter.js`** — retained, re-scoped in documentation
   only (this ADR) as **UI-string localization**, not language-pack
   vocabulary. It solves a genuinely different problem (translating
   dashboard button labels) than RP-035's language-pack knowledge
   system. No code change needed for Phase 1; flag for a future decision
   on whether UI-string localization should eventually read from the
   same identity registry for consistency.

3. **`core/modules/language/language-engine.js`** — retained, undecided.
   This is the largest overlap risk: it is a real, substantial
   translation system with its own 16-language list, its own
   export/import, and its own versioning — functionally adjacent to what
   RP-035 Phase 1 is now building. It was **not modified or removed in
   this phase** because reconciling two mature systems safely requires
   its own dedicated repair (reading its full 885 lines, its consumers,
   and its test coverage) rather than a Phase-1-scope decision. Flagged
   as the top priority for a Phase 1.5/2 reconciliation ADR.

4. **`core/modules/intelligence/language/cozy-language-registry.js`
   (RP-027)** — retained under its own documented, narrower scope:
   selecting which language a *conversational response template* should
   render in. This is a real, different responsibility from "does a
   language pack exist for community teaching." Its identity list
   (5 AVAILABLE + 6 NOT_READY, including `lg`/`ig`) must **not** be read
   as the canonical 13 and must not gain new entries outside RP-027's
   own governance. No code change made in Phase 1.

## What Phase 1 actually built on top of the canonical registry

- `cozy-language-pack-persistence.js` — wires the canonical registry's
  existing `createStorageAdapter(backend)` hook to the real
  `core/storage.js` IndexedDB gateway via `window.CozyStorage` (the same
  consumption pattern already used by `core/ai.js`,
  `core/languageImporter.js`, `core/pluginManager.js`). No new IndexedDB
  store created — reuses `language_packs`, `dictionary`,
  `translation_memory`, and `learning_progress`, all already present in
  `core/storage.js`'s `BLUEPRINT_OBJECT_STORES` and already granted to
  the `ulie` module context.
- `cozy-language-knowledge-model.js` — adds the `TranslationRelationship`,
  `CorrectionRecord`, and `ConflictRecord` schemas the Phase 0 audit
  found missing, composing (not duplicating) the existing
  `cozy-knowledge-community.js` review pipeline for teaching submissions.

Both files are new and additive. No existing file was modified.

## Consequences

- A future contributor adding a 14th language, or trying to "fix" a
  language list, must change `DEFAULT_IDENTITIES` in
  `cozy-language-pack-registry.js` and nowhere else, and must go through
  whatever governance process RP-035 already requires for that (Rule 82
  applies to *promotion*, not identity registration — identity changes
  need their own future governance decision, not addressed here).
- `language-engine.js`'s 16-language overlap is an accepted, disclosed
  risk carried forward — not resolved by this ADR.
