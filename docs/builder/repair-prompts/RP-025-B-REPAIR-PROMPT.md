COZYOS REPRepair — FREE ACCOUNT SINGLE-PATH REPAIR PROMPT

You are continuing an existing CozyOS engineering repair.

IMPORTANT:
This is a FREE-ACCOUNT session with limited execution time/context.
Do NOT spend the session writing a design document when the repair scope is already known.
Do NOT create multiple solution paths.
Do NOT ask me to choose between alternatives unless the repair is genuinely ambiguous.
Do NOT modify unrelated files.

Your entire workflow is:

FIND → FIX → TEST → RECORD → ZIP

==================================================
1. BASELINE FIRST
==================================================

Use the latest verified CozyOS ZIP that I provide as the ONLY repair baseline
(the RP-025-A-repaired ZIP, not the original CozyOS-mainR2.zip).

Before changing anything:

- inspect the ZIP;
- read LATEST.md;
- read HANDOFF.md (its CONTINUATION POINT names this exact repair);
- read docs/builder/knowledge/repair-queue.md and repair-history-registry.md
  (RP-025-A's full record — read it, do not re-derive it);
- read core/modules/intelligence/providers/on-device-conversational-provider.js
  in full before changing anything in it;
- verify repository integrity (SHA-256, per the repository's own canonical method).

Do not assume RP-025-A's design decisions were wrong. They were not — the
registration/health/activation layer is confirmed correct and stays as-is.

==================================================
2. FIND
==================================================

Confirmed starting evidence (do not re-investigate this part — it is
already established):

- RP-025-A's on-device provider is installed, registered into LivingAI's
  "on-device" slot, and visible in ProviderManager. Its health check
  honestly reports NOT_READY on the deployed browser because no
  LanguageModel / window.ai.languageModel API is exposed there.
- The Assistant still shows RP-024's honest fallback message
  ("I heard you, but CozyOS's real conversational response engine
  isn't connected or available yet...") because no provider has ever
  become READY, so nothing has been explicitly activated.
- This is NOT a resolveConversationalReply() defect and NOT an RP-024
  defect. Do not touch core/living/cozy-living-assistant.js's
  resolveConversationalReply() function again.

Your job is to find and confirm:

- whether this deployment (browser/device) can realistically load ANY
  real local model/runtime at all (check real constraints: available
  memory, WASM/WebGPU support, storage quota, CDN reachability from
  this environment);
- the smallest legitimate real runtime that can satisfy the existing
  think(text, options) -> {success, result: {text}} contract without
  requiring API credentials or a server-side call;
- exactly where in on-device-conversational-provider.js the new runtime
  should plug in (it already has a clean seam: detectLanguageModelAPI()
  today only checks the browser's native Prompt API — a second,
  fallback detection/load path belongs alongside it, not replacing it).

Use actual evidence. Do not fabricate a working runtime, a model file
that isn't actually retrievable, or a capability this environment
can't actually exercise. If a real local runtime genuinely cannot be
loaded in this environment (e.g. no network egress, no CDN reachable),
record that as NOT_READY / BLOCKED honestly — do not fake a fix.

==================================================
3. FIX — SINGLE PATH ONLY
==================================================

Implement ONLY the identified repair.

Sequence:

IDENTIFIED GAP (no real runtime when native Prompt API absent)
        ↓
MINIMAL REAL FALLBACK RUNTIME
        ↓
EXPLICIT ACTIVATION (unchanged path)
        ↓
TARGETED TEST
        ↓
FULL SANITY CHECK

**CRITICAL ACCEPTANCE CONDITION — read this before writing any code:**

ONLINE is earned ONLY after a real local model successfully generates
a real conversational response. Everything else — a runtime library
loaded, a model file downloaded, a session object created — is still
infrastructure, not ONLINE, until a real prompt has produced a real
generated reply.

You must finish this session with EXACTLY ONE of these three honest
outcomes (this is what STATUS: in the RECORD block must be):

- **COMPLETE** — a real on-device model loaded, a generated response
  was actually verified, the provider was activated explicitly, tests
  pass, and the ZIP + updated HANDOFF.md were delivered.
- **BLOCKED** — a real runtime/model is required but cannot be obtained
  or tested in this session (e.g. no network/CDN egress, no browser
  available to load/run it). All infrastructure actually implemented
  this session is still packaged and delivered; the blocker is recorded
  honestly, not papered over.
- **NOT_READY** — the device/browser this was verified against
  genuinely cannot support the selected runtime/model (confirmed by
  real evidence, not assumption).

**The following are forbidden, without exception, for this repair:**

- Fake ONLINE (reporting READY/ONLINE without a real, observed,
  successful generated response).
- Hardcoded conversational replies presented as if generated by a
  model.
- Modifying resolveConversationalReply() (core/living/cozy-living-
  assistant.js) — RP-024 already solved that; out of scope here.
- Enabling unrelated providers just to make a dashboard/status page
  look more complete.
- Claiming a model exists when only the provider wrapper/integration
  code exists.
- Stopping the session without delivering the ZIP + updated HANDOFF.md
  if any files were changed.

Rules:

- One repair path only. If more than one real runtime option exists
  (e.g. a WASM/WebGPU in-browser LLM runtime vs. some other real local
  option), pick the smallest one that can genuinely satisfy the
  contract and say so — do not present alternatives for me to choose
  between unless truly blocked.
- Preserve everything RP-025-A already built: the provider's
  registration into LivingAI ("on-device" slot, via registerProvider()),
  its ProviderManager descriptor, its NOT_READY / MODEL_NOT_INSTALLED /
  READY state machine and vocabulary, its think()/describe() contract
  shape, and its complete absence of auto-activation.
- No API credentials of any kind. Local/on-device only — no calls to a
  paid or authenticated cloud endpoint, ever, under any provider name.
- Do not modify CognitiveCoordinator, cozy-intelligence-provider.js, or
  core/config.js.
- Do not silently activate the new provider. LivingAI.setActiveProvider()
  remains the one explicit choke point — this repair may call it only
  as a deliberate, disclosed, separate step (e.g. from an explicit
  admin action or a clearly-labeled one-time setup routine), never as a
  side effect of registration or of the provider becoming READY.
- Do not change unrelated UI behavior.

==================================================
4. TEST
==================================================

After the repair:

- syntax-check every changed/new JavaScript file;
- run the existing 8 RP-025-A tests
  (core/modules/intelligence/providers/tests/on-device-conversational-provider.test.js)
  — extend them, do not replace their existing assertions, for the new
  fallback-runtime code paths (real-runtime-unavailable ->
  MODEL_NOT_INSTALLED/NOT_READY, real-runtime-available-but-load-fails
  -> honest non-READY, real-runtime-available-and-model-loads ->
  READY with a genuine generated .text);
- re-run the RP-024 regression suite
  (core/living/tests/cozy-living-assistant-reply.test.js) — must stay
  10/10, unchanged;
- if a browser/device is actually available to you this session: after
  explicit activation, send "Hello" through the real Assistant UI and
  confirm the reply text is genuinely produced by the loaded model and
  reaches the user via resolveConversationalReply()'s existing
  .text field — do not fabricate this confirmation if no real browser
  is available to you; record NOT_TESTED_LIVE honestly instead;
- confirm the yellow NOT_READY state still appears, honestly, on any
  simulated/tested environment where the runtime/model genuinely cannot
  load;
- verify no unrelated files were modified (diff against the RP-025-A
  baseline ZIP, not the original CozyOS-mainR2.zip).

If a test fails: FIND the failure → FIX that failure → TEST again. Do
not branch into a second repair project.

==================================================
5. RECORD
==================================================

Before the session ends, add a new dated entry to
docs/builder/knowledge/repair-history-registry.md (do not overwrite
RP-025-A's entry) containing:

REPAIR:
RP-025-B

FIND:
<exact gap confirmed>

OWNER:
<exact file/module>

ROOT CAUSE:
<actual cause - e.g. "no fallback runtime existed when the native
Prompt API is absent">

FIX:
<what was changed, and which real runtime/library was used and why it
was the smallest legitimate option>

FILES CHANGED:
<exact list>

TESTS:
<tests executed and results, including whether live-browser "Hello"
verification was actually performed or honestly marked NOT_TESTED_LIVE>

INTEGRITY:
<repository verification result, diff-against-RP-025-A-baseline result>

DEPENDENCIES:
<what is present/missing - e.g. CDN reachability, WASM/WebGPU support,
storage quota>

STATUS:
COMPLETE / BLOCKED / NOT_READY (choose exactly one — see Section 3's
Critical Acceptance Condition; do not report COMPLETE unless a real
generated response was actually verified)

REMAINING WORK:
<only if genuinely necessary>

CONTINUATION POINT:
<exact next step for another Builder>

Also update docs/builder/knowledge/repair-queue.md (move the "RP-025-B"
row from Open to Resolved or leave it accurately Open/Blocked) and
update LATEST.md / HANDOFF.md's top session summary and CONTINUATION
POINT to match, exactly as RP-025-A's session did.

DO NOT claim COMPLETE if a genuine local model/runtime could not
actually be loaded and verified in this environment.

==================================================
6. PACKAGE
==================================================

If files were changed:

- preserve the repaired repository;
- create the completed ZIP;
- verify the ZIP contents (confirm every file listed under FILES
  CHANGED is actually inside);
- provide the ZIP;
- update HANDOFF.md's Rule 80 Builder Stop Check block.

The next Builder (or the user directly) must be able to continue from
the ZIP without asking for anything to be reconstructed.

**SESSION CANNOT END WITHOUT A VERIFIED, DELIVERED ZIP** (Rule 80) —
"delivered" means the person has actually received the file via
present_files, not merely that it was built on disk.

==================================================
7. NO FABRICATION RULE
==================================================

Never claim:

- a real local model/runtime loaded when it did not;
- a "Hello" response was generated by a real model when no live browser
  test was actually run this session;
- a test passed when it was not executed;
- a ZIP was created/delivered when it was not;
- READY/ONLINE state for the on-device provider on the basis of
  anything other than a real, observed, successful model response.

Evidence always wins over expectation. NOT_READY is an acceptable,
honest final state for this repair if a real local runtime genuinely
cannot be loaded/verified in this environment — do not manufacture a
success to close the ticket.

==================================================
8. CURRENT REPAIR
==================================================

The current repair target is:

RP-025-B — On-Device Conversational Provider: Real Local Model/Runtime

Baseline: the RP-025-A-repaired ZIP (this repair's own predecessor —
read its record before starting, do not redesign it).

Do not create another design phase. Do not branch. Do not stop at a
report. Start NOW with:

FIND → FIX → TEST → RECORD → ZIP
