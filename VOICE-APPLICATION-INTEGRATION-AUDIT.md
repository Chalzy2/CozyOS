# CozyOS Universal Voice — Application Integration Audit

**Status:** Application census complete. No per-application implementation has been made yet — this document is the required first deliverable before any such change, per the governing directive's "Important implementation rule."

**Method:** Every real `window.CozyOS.ServiceRegistry.registerApplication(...)` call site in the repository was located and traced (not inferred from filenames or documentation). `registerCoordinator(...)` calls (internal platform services/engines — Identity, Reasoning, Automation, Policy, DeveloperHub, etc.) were excluded: they are not end-user applications. This matches the repository's own convention, confirmed via `core/platform/application-visibility.js` and `cozy-knowledge-registry.js`.

## 0. The real voice exit point (confirmed by tracing code, not inference)

```
cozy-living-assistant.js #send()
  -> LivingAI.think() (active provider: rule-based-conversational-provider.js)
     -> CognitiveCoordinator.run() (Memory/Policy/Interpretation/Thinking/Reasoning)
     -> composeReply(intent, lang) / template()
  -> in parallel, CozyAnswerEngine.answer() -> CozyAdvisor.advise() tried first;
     falls back to the rule-based provider's reply when non-VERIFIED
  -> whichever text wins becomes replyText
  -> #speak(replyText)                              [cozy-living-assistant.js:1033-1055]
  -> window.CozyOS.VoiceManager.speakProgressive() / .speak()
```

This is the **one** real path any application's user-facing text can reach voice through today. No redaction/sanitization logic exists anywhere on this path (`voice-manager.js`, `living-tts.js` both grepped for redact/sanitize/secret/otp/token — no matches). See §3 for why this matters.

## 1. The real application census — 12 confirmed, distinct `registerApplication()` calls

| # | Application | Registration (file:line) | Voice integration | Offline | Classification |
|---|---|---|---|---|---|
| 1 | **ChurchOS** | `core/plugins/churchOS-core.js:255` | Reaches VoiceManager via shared CozyAI chain — has a dedicated intent (`record-church-member` → "Member added.") plus generic app-launch/FAQ text | Offline (Setup/Membership); Live Worship submodule additionally depends on WebRTC | **A** |
| 2 | **ShopOS** | `core/plugins/shopOS-core.js:191` | Reaches VoiceManager via shared chain — generic app-launch/FAQ text only, no dedicated intent | Offline | **A** (shallow) |
| 3 | **WholesaleOS** | `core/plugins/wholesaleOS-core.js:115` | Reaches VoiceManager via shared chain — generic path only | Offline | **A** (shallow) |
| 4 | **PharmacyOS** | `core/plugins/pharmacyOS-core.js:175` | Reaches VoiceManager via shared chain — generic path only; has its own direct unit test (unique among plugin-core files) | Offline; sensitive actions gated behind `IdentityEngine.checkPermission()` | **A** (shallow) |
| 5 | **InterestOS** | `core/plugins/interestOS-core.js:503` | Reaches VoiceManager via shared chain — generic path; its own description explicitly discloses "no...voice reminders from this view yet" | **Not fully offline** — My Documents makes real `fetch()` calls to `server/webauthn-rp/server.js`; Goals/Reminders/Calculations are offline | **A** (shallow) |
| 6 | **MpesaOS** | `core/plugins/mpesaOS-engine.js:782` | Reaches VoiceManager via shared chain for the real registered app (generic path). A **separate**, orphaned `mpesaExecutionCore()` handler exists via `PluginManager`/`KernelPlugins` (`core/plugins/mpesaOS.js`) returning canned/theatrical text — explicitly self-disclosed as non-conversational, and has **zero callers** outside its own files. Not reachable from Living Assistant today. | Offline (registered app); entitlement sub-plugins make no fetch calls | **A** (registered app); orphaned path flagged separately, see §4 |
| 7 | **QuarryOS** | `core/modules/QuarryOS/quarry-index.js:2247` | Reaches VoiceManager via shared chain — generic path only | Offline | **A** (shallow) |
| 8 | **Authenticator** | `core/modules/Cozy-Authenticator/authenticator.js:368` | **No voice path found** for its own UI — the live TOTP code is rendered to DOM text only (`#tickCodes()`, line 275), never passed to any speak function. The *generic* "phone-verification"/"account-status" intents on the shared voice chain resolve to static, non-account-specific template text only (never a live code) — this is a different surface from the Authenticator app itself. | Fully offline (WebCrypto-based TOTP) | **D** (correctly never speaks the sensitive surface); see §3 for the structural gap this relies on |
| 9 | **Live Session** | `core/shell/live/cozy-live-session.js:374` | **No voice path found** — no VoiceManager/speechSynthesis reference in this file | Local capture offline; multi-peer broadcast requires the signaling server (`server/live-relay/live-distribution-signaling-server.js`); WebRTC negotiation self-disclosed as failing 6/9 in this sandbox | **B** |
| 10 | **Live / Connectivity** | `core/connectivity/ui/cozy-live-connectivity-app.js:171` | **No voice path found** | Local device-discovery offline; Bluetooth GATT `CAPABILITY_UNAVAILABLE`, WiFi-Direct `REQUIRES_NATIVE_COMPANION` | **B** |
| 11 | **Live Camera Capture** | `core/engines/video/ui/cozy-live-camera-capture-app.js:203` | **No voice path found** | Fully offline/local (`getUserMedia`/MediaRecorder only) | **B** |
| 12 | **Media Intelligence** | `core/modules/intelligence/media/cozy-media-intelligence.js:199` | **No voice path found** — `answerMediaQuestion()` is called only from its own standalone dashboard; zero callers from `cozy-living-assistant.js`/`cozy-answer-engine.js`/the rule-based provider (repo-wide grep) | Offline (deterministic local keyword matching) | **B**; also the only app with no `entryPoint` field in its registration — may not be launchable from the main Apps surface at all |

**Classification key** (as specified in the governing directive): A = fully integrated; B = text integrated but voice missing; C = separate voice path requiring architectural review; D = no voice-relevant user response; E = not actually launchable/active.

## 2. Live Session vs Live/Connectivity vs Media Intelligence vs Live Camera Capture — confirmed genuinely separate

All four are real, distinct `registerApplication()` calls with distinct `APP_ID`s, source files, and composed-engine sets — not the same mechanism described differently, and not sub-features of one pipeline. `cozy-knowledge-registry.js:427` itself discloses this explicitly: *"No single 'LiveOS' application exists — this entry honestly discloses that rather than fabricating one."*

Separately confirmed: `core/engines/media/` contains a large secondary media pipeline (~20 files: `media-pipeline-manager.js`, `video-interpreter-coordinator.js`, `synchronization-engine.js`, translation/streaming/subtitle/enhancement/filter/image/decode/encode/diarization engines). Only **one** file from that directory (`live-capture-engine.js`) is loaded on any real page. The rest has zero `<script src>` references anywhere — real code, but not reachable today, architecturally separate from both "Media Intelligence" and "Live Camera Capture" above (which are themselves real and loaded).

## 3. Authenticator / OTP security finding (structural gap, not a live incident)

No path exists today from a real OTP code, recovery code, or secret to `speak()` — confirmed by direct tracing (see row 8 above and the agent's full citations). However: **the shared voice chain that already speaks other conversational text has zero content-based filtering.** If any future intent handler or knowledge-registry fact-getter were ever wired to read a live OTP code or recovery code, that text would flow straight to voice with no guardrail. **This is a required fix before Universal Voice can honestly claim "never reads OTP/secrets aloud"** — see the Application Integration Matrix for the specific remediation (an explicit content filter/redaction layer at the `VoiceManager.speak()`/`#speak()` boundary).

## 4. Other findings requiring disclosure

1. **HospitalOS and SchoolOS are not real applications.** They appear only as honestly-disclosed mock/placeholder entries in `cozy-knowledge-registry.js` (lines 1085-1140) backed by legacy `core/plugins/hospitalOS.js`/`core/ai/schoolHandler.js`, which return canned text and are explicitly self-labeled as mock. Excluded from the census above; not in scope for voice integration.
2. **A family of dead/orphaned "Handler" files exists at `core/ai/`** (`agritechHandler.js`, `businessHandler.js`, `churchHandler.js`, `hospitalHandler.js`, `hotelHandler.js`, `mpesaHandler.js`, `saccoHandler.js`, `schoolHandler.js`), exporting functions literally named e.g. `processChurchVoiceIntent()` despite never being wired to any real voice output. Zero real callers outside their own files; `schoolHandler.js` even imports a module (`../../modules/wellbeing.js`) that does not exist in the repo. Flagged as a latent risk (misleading naming) should anyone wire these up without realizing they're mock — no action required unless that happens.
3. **MpesaOS's second, orphaned registration path** (`core/plugins/mpesaOS.js`) is loaded on real pages alongside the real `mpesaOS-engine.js`, but its query-handler has no live caller and is explicitly self-disclaimed as non-conversational by `core/pluginManager.js:194`. Not a live risk today; flagged as the exact pattern to watch for if it is ever wired to the Living Assistant (would become a genuine "separate voice/response path," Classification C).
4. **Testing gap**: no direct unit test files exist for `churchOS-core.js`, `shopOS-core.js`, `wholesaleOS-core.js`, `quarry-index.js`, or `authenticator.js` themselves (their submodules are well-tested; these top-level registration/entry files are not).

## 5. What this audit does NOT yet cover

Per-application implementation (wiring B-classified apps' status/notification text into the shared voice chain, and building the OTP content-filter guardrail) has **not** been started. That work is scoped in `VOICE-APPLICATION-INTEGRATION-MATRIX.md`.
