# Phase 10C-3B2 — Runtime Evidence

Raw, reproducible evidence backing the Outcome B determination. Probe
scripts live in `evidence/phase10c3b2-runtime-probe/` and can be re-run
verbatim (`node evidence/phase10c3b2-runtime-probe/<file>.js`).

## 1. Node.js sandbox — no browser globals

```
node version: v22.22.2
typeof window: undefined
typeof self: undefined
typeof globalThis.LanguageModel: undefined
```

Confirms this Node process itself can never host `LanguageModel` /
`window.ai` — expected, since those are browser (Chrome-specific) globals,
not Node globals.

## 2. Real headless Chromium — launched, inspected, no Prompt API

Unlike Phase 10C-3B1 (which found no Chromium binary reachable at all),
this pass found and successfully launched a **real** browser:

- Binary: `/opt/pw-browsers/chromium_headless_shell-1194` (Playwright's
  bundled Chromium, version confirmed at runtime: **141.0.7390.37**)
- Launch: succeeded, `about:blank` loaded, page-context JS executed for real
  inside that real browser process (this is not a simulation — Playwright's
  `page.evaluate()` sends the script to the actual browser and returns its
  actual result).

**Probe 1** (`probe-1-headless-shell-default-flags.js`), default launch args:
```json
{ "hasWindow": true, "hasLanguageModel": false, "hasAi": false }
Browser version: 141.0.7390.37
```

**Probe 2** (`probe-2-headless-shell-correct-flags.js`), launched with the
correct Chromium feature-flag names for the Prompt API
(`--enable-features=PromptAPIForGeminiNano,OptimizationGuideOnDeviceModel`
plus `--optimization-guide-on-device-model-execution`):
```json
{ "hasLanguageModel": false, "hasWindowAi": false, "hasAiText": false }
```
Flags made no difference — `self.LanguageModel` and `self.ai` are still
`undefined`.

**Probe 3** (`probe-3-full-chromium-binary.js`), same flags against the
*non*-headless_shell full Chromium build also present in this sandbox
(`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, same version
141.0.7390.37): identical result, `hasLanguageModel: false, hasAi: false`.

**Why, structurally, not just "it didn't work":** the Prompt API
(`LanguageModel` / `window.ai.languageModel`) and its underlying
"Optimization Guide On-Device Model" component are shipped and gated
through Google's branded, closed-source Google Chrome build and Google's
component-update infrastructure — not through the open-source Chromium
binaries Playwright bundles. Launch flags alone cannot conjure an API
surface whose implementation isn't compiled into the binary. This is a
genuine, structural environment gap, not a flag/config mistake.

## 3. Network — outbound access blocked

```
example.com                      -> HTTP 403
componentupdater.googleapis.com  -> HTTP 403
```

Even if a branded Google Chrome binary were available, the on-device model
component is fetched from Google's component-update service at first use;
that endpoint is unreachable from this sandbox (HTTP 403, consistent with
the sandbox's documented network policy). This independently blocks the
"download and try a genuinely branded Chrome" path even in principle.

## 4. Repository-defined real runtime launcher — none found

```
grep -rli "runtime launcher\|browser-launcher\|launchBrowser\|real-runtime\|RuntimeLauncher" \
  --include="*.js" modules
```
No matches. The repository does not define, anywhere, its own real
browser/runtime launcher that could be used as an alternative path.

## 5. Conclusion feeding into Part 5 (Outcome)

Three independent things were checked and all three block real execution
simultaneously:
1. No browser globals in the Node host itself (expected).
2. A **real, launched** Chromium 141 (both headless_shell and full builds)
   has no `LanguageModel`/`window.ai` implementation compiled in.
3. Outbound network needed for on-device model component delivery is
   blocked (HTTP 403).

None of these three was assumed — each was independently executed and its
raw output is reproduced above. See `PHASE10C3B2-DEPENDENCY-REPORT.md` for
what a future environment would need to resolve this.
