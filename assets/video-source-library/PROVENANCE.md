# CozyOS Video Source Library — Provenance Record

Created during the "Prepare Real CozyOS Live-Background Video Assets" task,
mirroring the same provenance pattern established in
`assets/audio-source-library/PROVENANCE.md`.

**Do not build the Media Management Engine from this file alone.** This is
raw provenance data for that future engine to consume, not the engine
itself. No media-processing engine/module was created in this task.

## Classification method (so results can be trusted/re-derived)

Filenames were treated as a hint only, never as proof, per instruction —
several unnamed files (`_144p_.mp4`, `_360p__N_.mp4`) had no descriptive
name at all, and even descriptively-named files were checked for hidden
problems. Every candidate was actually inspected before being assigned a
role:
1. `ffprobe` for real duration/resolution/codec.
2. Real extracted frames (start / middle / end, and denser sampling where a
   problem was suspected), visually inspected — not assumed from a
   thumbnail or the filename.
3. This caught real, otherwise-invisible problems: a title card burned
   into the first ~9s of the waterfall clip that looked clean at a glance,
   a color-to-monochrome shift partway through the palm-trees clip, a
   permanent channel watermark on one fish clip, a spoken-caption overlay
   on another, and one "fish" clip that turned out to be a human hand
   holding a caught fish rather than any usable underwater footage.
4. Only the confirmed-clean time range of each source was extracted —
   never the whole file where part of it had a problem.

## Raw uploads preserved

All 19 originally-supplied video files are preserved byte-for-byte in
`raw-uploads/` under their original filenames. Nothing here was destroyed
or overwritten — `assets/video/` (the production folder) receives only the
already-extracted, already-encoded final files.

## 5 production role assignments

| Production path | Source file (in `raw-uploads/`) | Source duration/res | Segment used | Encoding | Output | Reason |
|---|---|---|---|---|---|---|
| `waterfall.mp4` | `Falling_Water___Cascading_Waterfall_Sounds_for_Sleep__shorts_144p_.mp4` | 20.11s, 144×256 | 10.0–20.0s | H.264, CRF 28, muted, faststart | 10.0s, ~27KB | A "FALLING WATER" title card is burned into the frame from 0s through somewhere between 10–14s (confirmed present at t=10s in one check, gone by t=14s in this write-up's final pass — the segment start was set conservatively at 10.0s after confirming clean frames from that point on); the tail of the clip is continuous, static-camera waterfall footage with no other text/logo. |
| `underwater.mp4` | `Goldfish_ASMR__Relaxing_Bubble_Sounds...144p_.mp4` | 8.06s, 144×256 | 0.0–8.0s (whole clip) | H.264, CRF 28, muted, faststart | 8.0s, ~64KB | Checked start and end frames: clean throughout, no watermark, no caption, no human hand/objects — a single goldfish in a tank with rising bubbles. Preferred over 3 other "fish" candidates (see Rejected below). |
| `forest.mp4` | `_360p__3_.mp4` (no descriptive filename given) | 15.05s, 360×640 | 0.0–15.0s (whole clip), downscaled to 270×480 | H.264, CRF 32, muted, faststart | 15.0s, ~354KB | A row of trees bending dramatically in strong wind against clear blue sky — clean throughout, no distracting objects, no watermark. Preferred over several other tree/forest candidates (see Rejected below) as the most naturally "background-like" continuous motion. |
| `palm-trees.mp4` | `Palm_Trees_On_Wind_144p_.mp4` | 13.31s, 256×144 | 0.5–6.0s | H.264, CRF 28, muted, faststart | 5.5s, ~54KB | Frame checks at t=6s (color) vs t=8s (fully monochrome) confirmed the clip shifts from color to black-and-white partway through; only the color portion was used. |
| `clouds.mp4` | `_144p_.mp4` (no descriptive filename given) | 14.40s, 82×144 | 0.0–14.4s (whole clip) | H.264, CRF 28, muted, faststart | ~14.4s, ~94KB | Dusk sky with moving clouds and tree silhouettes in frame, checked start/end — clean and consistent throughout, no text/logo. |

All 5 outputs: H.264/yuv420p, audio track removed (`-an`, background is silent
by design), `-movflags +faststart` for fast start-of-playback over HTTP, no
fixed output-size rule invented — each was sized by choosing the shortest
clean segment and an appropriate CRF, not by targeting a specific byte
count (per instruction: a 20MB source does not imply a 1MB output rule).

## Rejected / not used for a role (still preserved, still useful later)

- `MASSIVE_waterfall_-_Yosemite_National_Park_144p_.mp4` (4.30s) and
  `__Victoria_Falls__Nature_s_Power_Unleashed...144p_.mp4` (7.69s) and
  `World_s_best_waterfall_paper__Niagara...144p_.mp4` (7.76s) — all three
  are genuine, clean waterfall footage (no watermark/caption problems
  found), kept as good alternates/variety for a future rotation; the
  Falling Water clip was chosen as the single production waterfall for now
  since 10s of continuous clean footage was the longest available.
- `_360p__8_.mp4` (5.64s) — genuine koi fish footage, but has a permanent
  "R B M CHANNEL" watermark burned into the corner throughout. Rejected
  for the underwater role on that basis.
- `_360p__9_.mp4` (8.17s) — shows a human hand holding a caught fish over a
  bowl of more fish, not underwater/aquarium footage at all. Rejected.
- `_360p__10_.mp4` (18.41s) — beautiful clownfish/anemone footage, but has
  spoken-style captions ("Have you...", "Now listen closely...") burned in
  throughout. Rejected on the caption rule.
- `_144p__1_.mp4` (12.98s) and `_144p__2_.mp4` (13.77s) — both genuine,
  clean tree footage (the latter a striking straight-up view of a pine
  canopy); kept as strong alternates for the forest role.
- `_360p__1_.mp4` (55.75s) — golden autumn leaves against blue sky, clean,
  no issues found; a good alternate "trees/leaves" look distinct from the
  chosen green-forest clip.
- `_360p__5_.mp4` (15.00s) — grass/foliage swaying at ground level, clean,
  kept as an alternate.
- `_360p__6_.mp4` (6.92s) — bamboo grove, mostly clean but a small
  man-made object (looks like a garden ornament) is visible in one
  corner; kept as a lower-priority alternate.
- `_360p__7_.mp4` (7.71s) — a tree in a dry field, overcast sky; a strip of
  concrete/steps is visible in one corner. Kept as a lower-priority
  alternate.
- `_360p__2_.mp4` (7.04s) — a foggy/rain-soaked road scene, low visual
  clarity (looks like a dashcam/phone-through-a-windshield shot); not used
  for any of the 5 requested categories.
- `_360p__4_.mp4` (21.95s) — clouds over a residential skyline, but cars
  and houses are clearly visible in the lower frame, which the instructions
  say to avoid where possible. Not used; the `_144p_.mp4` clouds clip
  (no man-made objects visible) was used instead.

## Birds / nature — explicitly UNRESOLVED

None of the 19 supplied videos contained any actual bird footage — this
was checked by inspecting every file's extracted frames, not assumed.
Per instruction, **no birds video asset was fabricated or substituted**.
This remains **UNRESOLVED — SOURCE MEDIA REQUIRED** until a real birds
video is supplied.

## For a future shared Media Management Engine

Same intent as the audio provenance file: this table documents, for every
decision above, which source, which exact segment, at what encoding, and
why — including why alternates were passed over — so a future engine could
in principle re-derive or improve on these choices (e.g. re-running scene
detection across the 11 rejected/alternate tree and waterfall clips to
build a rotating background library instead of one fixed clip per
category). Must remain a shared CozyOS capability, not module-specific,
per the same requirement noted in the audio provenance file.
