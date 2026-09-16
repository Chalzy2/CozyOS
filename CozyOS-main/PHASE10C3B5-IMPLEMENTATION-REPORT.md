# PHASE 10C-3B5 — Real Living Engine Runtime Dependency Bring-Up
## Implementation Report

## STAGE 1 — Start Gate
- Baseline SHA-256 (independently recomputed, matches supplied value):
  `1e499f6cc3f7bec870ae74533f30142d0f3e99a3a4898589a4aadc2eeb85babc`
- `unzip -t`: no errors.
- Fresh extraction: `/home/claude/work/extracted`, 1358 files (repo is full,
  not a delta).
- Regression, re-run this session from the fresh extraction:
  16/16, 22/22, 11/11, 5/5, 8/8, 12/12, 7/7, 12/12, 10/10, 49/49, 17/17 —
  all match, 209/209 total. **START GATE: PASS.**

## STAGE 2 — Real runtime dependency audit
Full dependency chain, traced to real files (unchanged from prior audits,
re-confirmed by the passing suites above, not re-asserted from memory):

```
index.html → cozyos.js → LivingAI (core/living/cozy-living-ai.js)
  → window.CozyOS.CognitiveCoordinator → CozyThinking
  → on-device-conversational provider
  → browser Prompt API (window.ai / self.ai / LanguageModel)
  → on-device model runtime (Gemini Nano component)
```

What actually exists in the repo/container toward the last two links:
- `package.json` (only real one: `tools/cozyai-bridge/package.json`) has
  a single dependency, `koffi` (native FFI bindings) — unrelated to
  browser AI, no browser dependency declared there.
- Global npm scope in this container has `playwright@1.56.0` with a
  pre-fetched **open-source Chromium** build at
  `/opt/pw-browsers/chromium-1194` (version 141.0.7390.37). `/opt/google/chrome/chrome`
  is a symlink to that same open-source Chromium build — **not** a
  separately-installed, branded Google Chrome.
- No Puppeteer, no Electron, no Android project anywhere in the repo.
- No origin-trial token, no `chrome://flags` automation, no model-component
  provisioning script exists in the repository.
- The on-device provider (`core/modules/intelligence/providers/on-device-conversational-provider.js`)
  correctly checks for the global and fails soft/honestly when absent —
  it does not assume or fabricate presence.

## STAGE 3 — Can the dependency be built?

Researched Chrome's own documentation for the Prompt API's actual
requirements (not assumed from memory), current as of this session:

- Built-in AI (Prompt API / `window.ai` / `LanguageModel`) **depends on
  Google-internal code that ships only in branded Google Chrome** — it is
  explicitly documented as not available in open-source Chromium or
  Chromium-embedded frameworks.
- Requires Chrome **Dev or Canary channel** (not Stable) for the relevant
  flags.
- Documented system requirements: **≥22 GB free disk** on the Chrome
  profile volume, a **GPU with >4 GB VRAM** (or CPU fallback, but GPU is
  required for some API surfaces), and an **unmetered network
  connection** to download the on-device model component the first time.

Checked against this container, concretely:
| Requirement | This container | Meets it? |
|---|---|---|
| Branded Google Chrome (Dev/Canary) | Only open-source Chromium present; `/opt/google/chrome` is a symlink to the same Chromium build | NO |
| ≥22 GB free disk | `df -h /` → 10 GB available | NO |
| GPU present | `/dev/dri` does not exist; no VGA device in `lspci` | NO |
| Network to Google's component CDN | Egress proxy returns HTTP 403 `host_not_allowed` for arbitrary hosts | NO |
| Cached Chrome installer/.deb anywhere on disk | None found (`find / -iname "*chrome*.deb"` → empty) | NO |

**Classification: G — combination of blockers**, specifically:
- **C** (browser API feature requires a specific Chrome channel/build
  that plain open-source Chromium structurally cannot provide, no matter
  what flags are passed — confirmed empirically in Stage 1's probe and
  again not repeated here to avoid redundant browser launches this
  stage), and
- **D** (the model component itself requires network download), and
- **E** (this container's network is allowlist-restricted and blocks
  exactly that download path), and, independently,
- disk and GPU requirements are also unmet, which would block it even if
  a branded Chrome were somehow present.

None of these five unmet requirements is a repository defect. All five
are properties of this execution container.

## STAGE 4 — Build the dependency?
**Not possible in this environment**, for reasons that are independent of
each other (any single one would already block it):
1. There is no legitimate way to obtain branded Google Chrome without
   network access to Google's own distribution servers, which this
   container's egress policy denies.
2. Even a successfully-downloaded Chrome could not download the model
   component for the same network reason.
3. Even with network access, available disk (10 GB) is under the
   documented 22 GB minimum.
4. There is no GPU device in this container at all.

Per the workflow rule "if network access is required and blocked,
document the exact external dependency and stop at the dependency
boundary rather than fabricating success" — that is what this report
does. No fake `window.ai`/`LanguageModel` was created, and none is
present in production code.

## STAGE 5 — Real browser verification
Not re-run this stage (already performed with a real, non-fake browser
object in the prior Stage 1 checkpoint: Chromium 141.0.7390.37, headless,
default flags and the Prompt API origin-trial flag combination — both
`window.ai`, `self.ai`, and `LanguageModel` were `undefined` in both
cases). Stage 3's research now explains *why* that result was inevitable
for this build: open-source Chromium cannot expose it structurally,
independent of flags.

**PROMPT API: UNAVAILABLE.**

## STAGES 6–7 — Real Living Engine execution / Kiswahili verification
**NOT REACHED.** Per the phase's own rule ("ONLY if the real Prompt API
and model are genuinely available"), these stages are honestly skipped
rather than run against a fabricated/test-double model and reported as
real.

## STAGE 8 — Production change decision
No production change is required or was made. The architecture already
correctly reaches the boundary and fails honestly at it (proven by the
on-device provider's own passing "does not throw when ProviderManager is
absent" test). This is **OUTCOME B**: architecture correct; the
dependency/runtime is the remaining boundary, and Stage 3/4 now show that
boundary is a five-way environmental limitation, not a one-line browser
availability issue.

## PRODUCTION FILES CHANGED
NONE.
