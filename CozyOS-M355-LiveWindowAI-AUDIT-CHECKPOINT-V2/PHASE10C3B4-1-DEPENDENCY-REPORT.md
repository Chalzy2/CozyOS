# PHASE 10C-3B4-1 — Dependency Report

## Missing / unavailable dependencies for real (non-test-double) execution

1. **Real Chrome/Chromium build exposing `LanguageModel`/`window.ai`.**
   Confirmed absent on Chrome for Testing 131.0.6778.204 (this session)
   and previously on Chromium 141 (Phase 10C-3B2, prior session), even
   with the relevant `--enable-features` flags passed at launch. See
   `PHASE10C3B4-1-RUNTIME-EVIDENCE.md`.

2. **Outbound network access.** Blocked in this sandbox (HTTP 403 on a
   plain HTTPS request). Even a correct Chrome build would not be able
   to download the on-device Gemini Nano model component here.

3. **No other missing dependency was found for the audit itself.**
   Node.js, the existing test files, and all production source files
   needed for Parts 1–3 (Living Engine location, singleton audit,
   provider-selection audit) were fully present and did not require any
   additional tooling.

## Not a dependency gap, but a naming/documentation gap

`core/living/cozy-living-ai.js` registers a provider slot literally
named `"on-device"` that is an **honest unconfigured stub** — it is not
wired to the real, separately-implemented
`core/modules/intelligence/providers/on-device-conversational-provider.js`
/ `on-device-cognitive-adapter.js` pair. The real on-device path is
already reachable from Living Engine today, but only via
`LivingAI.think(text, { thinkingProviderId: 'on-device-conversational' })`
on the default `reasoning-pipeline` provider — not via
`LivingAI.setActiveProvider('on-device')`. This is documented as a
finding, not fixed in this phase (see project rule: "Do not implement a
general options pass-through merely because it is convenient" / "do not
redesign Living Engine").
