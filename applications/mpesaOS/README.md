# MpesaOS

**CozyOS BusinessOS Enterprise Core — Deployable Application Shell**

MpesaOS is an autonomous, AI-assisted agent business engine for M-Pesa style
transaction workflows (deposits, withdrawals, customer intake, commission
accrual, receipts, and offline-first sync) built on the CozyOS BusinessOS
Enterprise Core plugin (`mpesaOS.js`). This repository wraps that engine in a
complete, deployable application shell.

`mpesaOS.js` is the unmodified business engine and is treated as the single
source of truth for all business logic. Everything else in this repository
— markup, styles, PWA manifest, and dev tooling — exists only to load,
present, and operate that engine. No transaction, tariff, or ledger logic
was added, moved, or altered outside of `mpesaOS.js`.

## Folder Structure

```
MpesaOS/
├── index.html                 Application entry point (UI wiring only)
├── mpesaOS.js                 Business engine — untouched, v2.1.0-ENTERPRISE
├── mpesaOS.css                Stylesheet — responsive, light/dark, print-safe
├── manifest.json              PWA manifest
├── README.md                  This file
├── icons/
│   └── PLACEHOLDER.md         Honest notice: icon image files not yet supplied
└── assets/
    ├── dev-storage-shim.js    Dev-only in-memory CozyStorage fallback
    ├── logos/
    ├── sounds/
    ├── templates/
    └── exports/
```

`images/` and `fonts/` folders are reserved for future use and currently
contain no assets.

## Installation

1. Copy the `MpesaOS/` folder to any static file host or local web server.
2. Serve the folder over HTTP(S) — opening `index.html` via `file://` will
   work for basic viewing, but PWA install and service-worker features
   (future) require a real origin.
3. No build step, bundler, or package manager is required. This is a plain
   HTML/CSS/JS static application.

### Local development

```bash
cd MpesaOS
python3 -m http.server 8080
# then open http://localhost:8080
```

## Dependencies

| Dependency | Required | Notes |
|---|---|---|
| `window.CozyStorage` | **Yes** | Real CozyOS persistence layer. If absent, `assets/dev-storage-shim.js` installs a non-persistent in-memory stand-in for local development/demo only — replace with the platform's real module before production use. |
| `window.CozyOS.PluginManager` | No | Optional. Falls back to `window.CozyOS.KernelPlugins` map if absent — handled entirely inside `mpesaOS.js`, unchanged. |

## Integration

MpesaOS registers itself as a CozyOS plugin with id `"mpesa"` at load time,
via `window.CozyOS.PluginManager.register(...)` when a PluginManager is
present, or `window.CozyOS.KernelPlugins` otherwise. The application shell
in `index.html` talks to the engine exclusively through its existing public
surface:

- `window.CozyEnterpriseBusinessEngine.getVersion()`
- `window.CozyEnterpriseBusinessEngine.getDiagnosticsReport()`
- `window.CozyEnterpriseBusinessEngine.getTimeline()`
- `window.CozyEnterpriseBusinessEngine.listActiveWorkflows()`
- `window.CozyEnterpriseBusinessEngine.on()/off()/once()/emit()`
- `window.CozyEnterpriseBusinessEngine.exportSnapshot()/importSnapshot()`
- The registered plugin handler (`mpesaExecutionCore`), invoked via
  `PluginManager.invoke("mpesa", query, kernelContext)` or the
  `KernelPlugins` map entry's `handler(query, kernelContext)`.

No engine internals, private fields, or closured functions are accessed
from the shell.

## Deployment Targets

| Target | Status |
|---|---|
| Browser (static hosting) | Ready now |
| Progressive Web App | Manifest in place; requires real icon assets (see `icons/PLACEHOLDER.md`) and a service worker before install prompts will function |
| Android wrapper (e.g. TWA/Capacitor) | Prepared — standard static asset layout, no code changes anticipated |
| Desktop wrapper (e.g. Electron/Tauri) | Prepared — standard static asset layout, no code changes anticipated |

## Certification Status

| Pass | Status |
|---|---|
| Quick Certification | Pending — run through CozyCertification against `mpesaOS.js` + shell files |
| Full Certification | Pending |
| Enterprise Audit | Pending |

`mpesaOS.js` itself documents a prior certification pass (SEC-003, COORD-001/002,
IE-001/002, EVENT-001..005, VER-001/ARCH-005, ARCH-008/009/010, SEC-009,
PERF-001) already applied additively inside the engine. The shell files in
this repository (`index.html`, `mpesaOS.css`, `manifest.json`,
`assets/dev-storage-shim.js`) have not yet been run through
CozyCertification and should be submitted for Quick → Full → Enterprise
Audit passes before production release, with a goal of zero regressions
against the engine's existing behavior.

## Version

- **Application Shell:** 1.0.0-SHELL
- **Business Engine (`mpesaOS.js`):** 2.1.0-ENTERPRISE (unmodified)
