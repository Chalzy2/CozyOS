# CozyOS Audio Source Library — Provenance Record

Created during the "Integrate Supplied Real Audio Assets" task to resolve the
8 confirmed-missing Login/Living Sequence sound-pack assets first identified
during the Sequence Path Integrity Pass.

**Do not build the Media Management Engine from this file alone.** This is
raw provenance data for that future engine to consume, not the engine
itself. No media-processing engine/module was created in this task — every
extraction below was done manually, file by file, with real tool output
(ffprobe/ffmpeg/spectrogram inspection) checked before each decision.

## Classification method (so results can be trusted/re-derived)

Filenames were treated as a hint only, never as proof, per instruction.
Every file was actually inspected before being assigned a role:
1. `ffprobe` for real duration/codec.
2. `ffmpeg -lavfi showspectrumpic` to render a real spectrogram, visually
   inspected (tonal/harmonic banding = chime/musical; broadband bursts =
   click/percussive; low-frequency smooth swells = wind; dense broadband
   texture reaching high frequencies = leaf/rustle noise).
3. `ffmpeg -af silencedetect` (and `volumedetect` where a file looked
   suspiciously flat) to find exact sound/silence boundaries for extraction,
   and to catch files that looked plausible by name but were empty.
4. Multi-effect / compilation files were identified by counts of
   evenly-spaced or clearly-distinct transient blocks in the spectrogram,
   and NOT used as direct production sources — a specific single-effect
   dedicated file was preferred whenever one existed, so no segment had to
   be guessed out of a busy compilation.

## Raw uploads preserved

All 34 originally-supplied files are preserved byte-for-byte in
`raw-uploads/` under their original filenames. Nothing here was destroyed
or overwritten — the folder above (`assets/audio/`) receives only the
already-extracted, already-converted final production files.

## 8 production role assignments

| Production path | Source file (in `raw-uploads/`) | Source duration | Extraction range used | Why |
|---|---|---|---|---|
| `wind.mp3` | `Wind_Sound_SOUND_EFFECT_-_No_Copyright_Download_Free__128k_.m4a` | 63.90s | 0.00–58.00s (trimmed trailing fade/silence tail) | Spectrogram: classic low-frequency-dominant smooth gust "whoosh" shape, no other content mixed in. Gentler and more suitable for a background ambience bed than the two alternate wind sources considered (see Rejected below). |
| `birds.mp3` | `Buttercups__Birdsong_and_Blue_Sky_in_May_128k_.m4a` | 120.09s | 84.66–118.36s | `silencedetect` at -45dB found the rest of the 120s file effectively silent by that threshold; this ~34s window was the one genuinely more-active stretch. Honest note: even this window is a quiet/subtle field recording, not a loud bird chorus — consistent with the file's own title ("...Blue Sky in May", a calm pastoral scene). |
| `forest.mp3` | `Wind_blowing_tree_leaves__SOUND_4k_uhd_128k_.m4a` | 16.30s | 0.00–16.30s (whole file; continuously active, no silence found) | Spectrogram shows dense broadband texture reaching into higher frequencies than the pure wind file — consistent with leaf rustle rather than open-air gusting. Chosen over the round-1 candidate `690_Trees_swaying_as_the_wind_blows_128k_.m4a` (7.06s, also preserved, plausible but shorter/bursty rather than continuous). |
| `typing-click.mp3` | `Keyboard-Button-Click-Sound_Effect_128k_.mp3` | 1.70s | 0.60–0.95s | File is a clean, isolated two-click recording; `silencedetect` places the first clean click at ~0.66–0.89s. Extracted with small padding. |
| `button-hover.mp3` | `Click_Sound_Effect_128k_.mp3` | 1.54s | 0.68–0.93s | Deliberately sourced from a **different** recording than typing-click.mp3 so the two UI cues aren't identical. `silencedetect` places the click at ~0.75–0.86s; extracted with padding. |
| `logo-chime.mp3` | `_128k__4_.mp3` (generic upload filename — no descriptive name given) | 1.70s | 0.00–1.70s (whole file) | Spectrogram shows genuine sustained harmonic/tonal banding (a real chime tone with natural decay), confirmed via `silencedetect` at -50dB (sound present almost the entire clip, not just a brief transient). |
| `login-success.mp3` | `Success_sound_effect_128k_.mp3` | 2.14s | 0.00–2.14s (whole file) | Spectrogram shows a clear two-phrase rising melodic pattern — a purpose-built, dedicated "success" jingle. Preferred over the round-1 candidate `_128k__6_.mp3` (2.77s rising arpeggio, also preserved, plausible but generically-named and unconfirmed by a matching filename). |
| `notification.mp3` | `Notification_Sound_Effect_128k_.mp3` | 7.08s | 5.45–6.80s | `silencedetect` found the file is ~5.5s of silence followed by one triple-note chime burst ending ~6.72s; extracted just the active burst with padding. Its near-duplicate `Notification_Sound_Effect_1080p_MUX_128k_.mp3` (7.16s) has an almost identical waveform/spectrogram and was treated as a redundant copy, not used separately. |

## Rejected / not used for a role (still preserved, still useful later)

- `strong_wind_sound_effect_128k_.m4a` (134.72s) — genuine wind, but broadband/intense; more aggressive than needed for a calm login ambience bed. Kept for a possible future "storm" scene.
- `Sound_Effects_-_Storm_Winds_Hurricane_128k_.m4a` (295.15s) — genuine hurricane-intensity wind; far too intense for this role. Kept for a possible future weather/storm scene.
- `690_Trees_swaying_as_the_wind_blows_128k_.m4a` (7.06s) — plausible forest alternate, shorter and burstier than the chosen file.
- `Swaying_trees_128k_.m4a` (39.75s) — **CONFIRMED UNUSABLE**: `ffmpeg volumedetect` measured mean/max volume at a flat -91.0dB (effectively digital silence) despite the promising filename. Preserved as-is; flagged so nobody re-attempts using it without noticing.
- `Rain_Sounds_For_Sleeping_-_99%...128k_.m4a` (3665.13s / ~61 min) — real rain/thunder ambience, not relevant to any of the 8 current roles. Kept for potential future ambience packs.
- `Keyboard_Typing_Sound_Effects_128k_.mp3` (4.68s), `Keyboard_Typing_Sound_Effect___No_Copyright__soundeffects__creatorfactory_128k_.mp3` (8.05s), `Keyboard__typing_sound_effect_128k_.mp3` (6.87s) — genuine continuous keyboard-clatter loops (verified via spectrogram), good raw material, but a *single* clean click (`Keyboard-Button-Click-Sound_Effect_128k_.mp3`) was a better fit for the "one click per typed letter" role than extracting one instance out of a rapid multi-click loop.
- `Click_Sound_Effect___Click_SFX___Mouse_Click_Sound_128k_.mp3` (5.04s, ~5 clean clicks) and `Click_Sound_Effects__Copyright_Free__128k_.mp3` (15.02s, ~10 clean click variants) — good click libraries, not needed once dedicated single-click files covered both roles.
- `Notification_Sound_Effects__Copyright_Free__128k_.mp3` (50.34s, ~13-effect compilation) and `Notification_Sound_Effects___Copyright_Free_128k_.mp3` (11.73s, ~6-effect compilation) — genuine compilations of many distinct notification-style stings, confirmed via spectrogram (evenly-spaced distinct transient blocks). Good future-variety source; a specific single-effect dedicated file was used instead of guessing a segment out of these.
- `Best_Sound_Effects_Like__decodingyt...128k_.mp3` (127.14s) — confirmed via spectrogram to be a dense back-to-back compilation of many distinct, unlabeled effects with no reliable way to identify which segment is which without actual audio playback. Left unresolved rather than guessing a bad match, per instruction.
- `_128k_.m4a` (46.90s), `_128k__1_.m4a` (10.73s), `_128k__2_.m4a` (15.05s), `_128k__3_.m4a` (5.06s), `_128k__4_.m4a` (45.81s) — generic uploads (no descriptive filename). Spectrogram inspection: the two ~46s files show long even-spaced click trains (more keyboard/typing material); `_128k__1_.m4a`/`_128k__2_.m4a` show continuous noisy/gust-like texture with embedded transients; `_128k__3_.m4a` shows dense continuous broadband noise consistent with wind. None was uniquely necessary once the descriptively-named round-2 uploads arrived, so none was force-assigned to a role.
- `_128k__1_.mp3` (5.12s, real sound only ~0.14–0.28s), `_128k__5_.mp3` (5.07s, ~0.52–1.73s clean tone), `_128k__7_.mp3` (3.03s, ~0.95–2.15s clean tone) — three more clean, chime-like tones confirmed via spectrogram + `silencedetect`, surplus to the one role (`logo-chime.mp3`) they were candidates for. Good reserve options if the chosen chime is ever revisited.

## For a future shared Media Management Engine

This table is written so a future engine could, in principle, re-derive
every decision above programmatically:
- **Analyze long sources**: `Rain_Sounds_For_Sleeping...` (61 min),
  `Sound_Effects_-_Storm_Winds_Hurricane...` (295s), `strong_wind_sound_effect...`
  (135s), `Buttercups...` (120s), `Best_Sound_Effects_Like...` (127s) are the
  longest unprocessed sources here — good first targets for automatic
  segment/scene detection.
- **Classify sounds**: the spectrogram-shape heuristics used by hand above
  (harmonic banding = tonal/chime; broadband transient = click/percussive;
  low-frequency smooth swell = wind; broadband continuous reaching high
  frequency = rustle/leaves) are a reasonable starting ruleset.
- **Extract only the required portion**: every extraction range in the main
  table above was found via `silencedetect` boundary detection — the same
  technique a future engine could run automatically.
- **Select the best asset for a requested capability**: the "Rejected /
  not used" section above documents *why* each alternate wasn't chosen,
  which is exactly the kind of ranking signal a future selection engine
  would need.

This must remain a **shared** CozyOS capability when built, not something
specific to any one module (e.g. not an "InterestOS-only" tool) — noting
that requirement here since this file may be the first thing a future
session reads before starting that engine.
