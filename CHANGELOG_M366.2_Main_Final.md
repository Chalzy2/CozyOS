# CozyOS — Main Final Build (M366.2) Changelog

Final visual/branding/transition polish pass before packaging. **No authentication,
session, routing, security, or launch-sequence *logic* was touched** — only the
timing constants, glow styling, and branding assets described below.

## Files changed (19)

**Branding assets — replaced with the supplied CozyOS logo**
(house + emerald "C" + Africa map + gold "S", padded onto a square canvas at
its own background color so the source artwork is never cropped or
stretched; existing CSS already sizes these with `width` + `height:auto` or
`object-fit:contain`, so the true aspect ratio is preserved wherever they render)
- `assets/branding/cozyoslogo.png` — master, also used as `og:image`
- `assets/branding/cozyoslogo-emblem.png` — the actual launch-screen/login-screen mark
- `assets/branding/favicon-16.png`
- `assets/branding/favicon-32.png`
- `assets/branding/apple-touch-icon.png`
- `assets/branding/icon-192.png`
- `assets/branding/icon-512.png`
- `icons/icon-72x72.png`, `icons/icon-96x96.png`, `icons/icon-128x128.png`,
  `icons/icon-144x144.png`, `icons/icon-152x152.png`, `icons/icon-192x192.png`,
  `icons/icon-384x384.png`, `icons/icon-512x512.png`

**Timing — stretched the existing 6-stage launch sequence to ~18-20s total**
(same stage order/logic as before — Stage1 pure-green → Stage2 logo/live-background
reveal → Stage3 wordmark typing → Stage4 hold → Stage5 voice → Stage6 motto +
settle + final hold — only the durations changed):
- `core/shell/startup-orchestrator.js` — `preRevealDelayMs` 500ms → 2000ms (Stage 1)
- `core/shell/launch-sequence.js`:
  - Stage 2 (logo + live background reveal) 2500ms → 8000ms
  - Wordmark per-letter typing 100ms → 250ms, hold 100ms → 400ms
  - Motto typing window ~950ms → ~3500ms
  - Added a new ~2000ms "Almost ready…" hold after the motto settles and
    before the existing `cozy:launch-sequence-complete` event fires (the
    real event both `index.html` and `dashboard.html` already gate the
    login-card reveal on — no change needed in either of those files)

**Visual — dual-tone glow (tight emerald + soft outer gold), matching the new mark**
- `core/shell/launch-sequence.css` — `#cozy-launch-logo` glow (used by both
  `index.html` and `dashboard.html` via the shared stylesheet)
- `login.html` — `#cozy-login-emblem` glow (same treatment, login page's own
  independent styles)

## Explicitly unchanged
Authentication logic, session handling, the login submit flow, admin
routing, dashboard routing, security modules, and the ordering/structure of
the launch sequence itself (`AuthCoordinator`, `IdentityEngine`, `router.js`,
`Firebase/*`, `core/security/*`, `core/modules/identity/*` — none touched).

## Known limitation carried over (not introduced by this pass)
Per the pre-existing, disclosed gap in `launch-sequence.js`/`login.html`,
the spoken "Welcome to CozyOS. Built for Africa. Ready for the World."
narration plays from a recorded Living Voice Pack phrase if one is
registered, otherwise falls back to browser TTS, otherwise honestly no-ops —
it does not fabricate audio if neither exists. The stretched timing above
does not depend on the voice actually being present.
