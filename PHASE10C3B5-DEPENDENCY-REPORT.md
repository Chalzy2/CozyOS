# PHASE 10C-3B5 — Dependency Report

## Exact dependency chain to real execution
1. **Branded Google Chrome, Dev or Canary channel.** Required because,
   per Chrome's own documentation, Built-in AI depends on Google-internal
   code not shipped in open-source Chromium. Not present in this
   container (only open-source Chromium 141.0.7390.37 via Playwright).
   Cannot be installed here: no network egress to Google's distribution
   servers (allowlist-only proxy, confirmed HTTP 403
   `host_not_allowed`), and no cached installer exists on disk.
2. **On-device model component ("Optimization Guide On Device Model" /
   Gemini Nano).** Downloaded by Chrome's component updater on first use,
   over an unmetered connection. Blocked here for the same network reason
   as (1) — and would still need >10 GB more free disk than this
   container currently has (10 GB available vs. ≥22 GB documented
   minimum).
3. **GPU with >4 GB VRAM** (documented requirement for some Prompt API
   surfaces; CPU fallback exists for others but is not guaranteed for all
   calls). This container has no GPU device at all (`/dev/dri` absent,
   no VGA controller in `lspci`).
4. **Network egress to Google's endpoints**, currently denied by this
   container's egress allowlist.

None of these four are npm packages, repository files, or anything that
`git`, `npm install`, or a local build step could produce. They are
properties of the host/container and of Google's distribution model for
Chrome's built-in AI feature.

## Already present / not a gap
- `koffi` (native FFI) — present, used by `tools/cozyai-bridge`, unrelated
  to this dependency chain.
- `playwright` + open-source Chromium — present, sufficient to prove the
  *absence* of the API (real, non-fake `window`), but not sufficient to
  provide the API itself.
- The on-device provider's honest-failure code path — present, tested,
  passing (8/8), requires no change.

## Whether real model execution can ultimately be achieved
Yes, in principle, but not inside this container: on a real developer
machine with (a) Chrome Dev/Canary actually installed via normal means,
(b) unmetered internet access, (c) ≥22 GB free disk, and (d) a supported
GPU or CPU-fallback-eligible call, this repository's existing,
unmodified architecture (`LivingAI` → `CognitiveCoordinator` →
`CozyThinking` → on-device provider) should reach a real
`LanguageModel` session with zero production code changes — Phase
10C-3B4-1's audit already proved `thinkingProviderId` routing works
end-to-end structurally. That claim is NOT VERIFIED here because this
container cannot represent that environment; it is a prediction based on
the traced code path, not a report of an executed result.

## NOT VERIFIED / BLOCKED
- Real model execution: BLOCKED (four independent environmental reasons
  above).
- Kiswahili live-model verification: NOT REACHED, contingent on the above.
- Whether a real desktop Chrome Canary elsewhere would pass all four
  requirements: NOT VERIFIED here (would need to be tested outside this
  sandbox, e.g. on a developer's own machine or CI runner configured for
  it).
