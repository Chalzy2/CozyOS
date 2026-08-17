# CozyOS Window Manager — Developer Guide
`window.CozyOS.WindowManager` | `core/shell/window-manager.js` | v1.0.0

## What it is
The single, core platform service for every draggable/resizable/minimizable window in CozyOS. Applications never implement their own drag, resize, minimize, or z-index logic — they register their already-built content element with this API and get all of that for free.

## API Reference

### `create(options) → handle`
```js
const handle = WindowManager.create({
  id: "shopos",              // required, unique. Calling create() again with
                              // the same id is idempotent - it focuses the
                              // existing window rather than creating a second one.
  title: "ShopOS",            // shown in the title bar
  element: appElement,        // required - a real DOM element you already built
  icon: "🛍️",                  // optional, shown beside the title
  draggable: true,            // default true
  resizable: true,            // default true
  minimizable: true,          // default true
  maximizable: true,          // default true
  closable: true,             // default true
  pinnable: false,            // default false - shows a 📌 control if true
  onClose: () => { /* ... */ } // optional, called when the window is closed
});
```
Returns a real handle: `{ focus(), minimize(), restore(), maximize(), toggleFullscreen(), close(), setTitle(text) }`.

### Other real methods
- `minimize(id)` / `restore(id)` / `maximize(id)` / `toggleFullscreen(id)` / `close(id)` / `focus(id)` / `setTitle(id, text)` — same effect as the handle's methods, callable by id from anywhere.
- `isOpen(id)` → boolean
- `listWindows()` → array of open window ids
- `tileAll()` — arranges every open, non-minimized window in a basic grid
- `cascadeAll()` — resets every open window to a cascading arrangement
- `getDiagnosticsReport()` → `{ moduleVersion, openWindows, ids }`

## Window Lifecycle
```
create(options)
   │
   ├─ id already open? ──► focus() existing window, return its handle (no duplicate)
   │
   ▼
mount element inside real window chrome (title bar + controls + resize handles)
   │
   ▼
apply saved state (position/size/minimized/maximized) if this id was seen before,
otherwise a cascaded default position
   │
   ▼
wire real Pointer Events for drag (titlebar) and resize (8 handles) if enabled
   │
   ▼
bring to front (real z-index arbitration)
   │
   ▼
◄── user interacts: drag / resize / minimize / restore / maximize / fullscreen / pin ──►
   │        (each interaction re-persists position/size/state to localStorage)
   ▼
close(id) ──► element removed from DOM, onClose() fired if provided,
              window entry deleted (no orphan)
```

## Registration Guide for a New CozyOS Application
1. Build your application's content as a normal DOM element (or reuse whatever `ApplicationLauncher` already mounted for you — see below).
2. Call `WindowManager.create({ id: "your-app-id", title: "Your App", element: yourElement })` once, typically the first time your app is opened.
3. Keep the returned handle if you need to programmatically minimize/close/retitle later.
4. Do not implement your own drag, resize, minimize, maximize, fullscreen, or z-index logic — the Window Manager owns all of it.

### Opening through `ApplicationLauncher` as a managed window
`ApplicationLauncher.open(appId, { mode: "window" })` — mounts your application's existing content (JS-module `getDashboard()`/`init()` convention, or a manifest-driven HTML fragment/iframe) inside a real `WindowManager` window instead of the plain workspace root. `mode: "fullscreen"` does the same, then immediately maximizes it. `mode` is optional and additive — omitting it (or any existing call site that doesn't pass it) behaves exactly as before, workspace-mounted, unchanged.

## Theme Integration
Window chrome uses the real, existing Living Theme tokens (`--cozy-text`, `--cozy-border`, `--living-glass`, `--living-gold`) — never hardcoded colors. A window automatically re-colors whenever the active theme/mode changes, with no per-window styling code required.

## ChurchOS Readiness (verified architecturally, nothing new built)
`create()` takes any real DOM element and an id — it has no concept of what the content *is*. This means every future ChurchOS window (Camera Monitor, PTZ Controller, Lyrics, Scripture, Timeline, Translation, AI Director, Chat, Notes, Prayer Requests, Streaming Dashboard) can become a real managed window today, with zero changes to `window-manager.js`, simply by building its content and calling `create()` — exactly as the Living Worship Player already does. **No architectural limitation was found.** The one thing genuinely not yet built is a *coordinator* that opens/arranges several of these windows together as a "production console" — that's real, separate future work, not a Window Manager limitation.

## Cozy Share Readiness (verified architecturally, not implemented)
A remote window is, from `create()`'s point of view, still just "some `element` with an `id`." Nothing in the Window Manager assumes the content originates locally. Publishing a real remote window through Cozy Share would mean building a real transport that receives a remote device's content/updates and creates a local element to hand to `create()` — genuinely new work, but nothing here would need to change to support it. **Not implemented this pass, per explicit instruction — confirmed only that the architecture doesn't block it.**

## Mobile Status — Explicit, Honest Breakdown
| Behavior | Status |
|---|---|
| Touch drag | **Simulated** — real Pointer Events code path (same code handles mouse/touch/pen identically), exercised only via synthetic pointer events in Node, never a physical touchscreen |
| Touch resize | **Simulated** — same as above |
| Double-tap maximize | **Simulated** — timing logic (350ms window) is real code, not verified against real human tap timing/jitter on a device |
| Edge snap | **Simulated** — real geometry code, verified with synthetic coordinates only |
| Orientation changes | **Simulated** — a real, debounced `resize`/`orientationchange` listener now re-clamps every open, non-maximized window's position into the new viewport bounds. Exercised only via a direct method call in Node; the actual browser-fired `orientationchange` event and its timing/jank on a real device have not been observed |
| Small-screen usability | **Partially verified** — resize handles are hidden below 640px width (a real, deliberate choice); overall touch-target sizing/layout at small widths has not been visually reviewed |

No physical device testing has occurred in any pass of this project — this is stated plainly, not implied otherwise.

