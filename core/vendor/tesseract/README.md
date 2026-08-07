# CozyOS Vendor Package — Tesseract.js (OCR)

Owned by: `CozyOCR` (`core/modules/ocr/cozy-ocr.js`, `core/modules/ocr/plugins/tesseract-plugin.js`)
Required per: Rule 46 (Local Vendor Resolution), Rule 40 (Offline Platform Dependencies)

## Why this file exists

CozyOS is not permitted to fetch this library from a CDN in production
(Rule 46). This directory is where the *real* files must live. This
build environment has no network access, so these binaries could not be
fetched automatically — this README is the exact, complete set of steps
to do it on a machine that does have network access.

`core/modules/ocr/plugins/tesseract-plugin.js` requires the **v6.x**
API specifically (`createWorker(lang, oem, options)` — v6 removed the
old `worker.loadLanguage()` / `worker.initialize()` calls used by
Tesseract.js v2–v5). Do not install an older version; it will load but
silently fail to work with the existing CozyOS driver.

## Required files in this directory

```
core/vendor/tesseract/
├── tesseract.min.js       ← main Tesseract.js v6.x bundle
├── worker.min.js          ← Tesseract.js v6 worker script
├── tesseract-core.wasm.js ← WASM loader (bundled by tesseract.js v6)
├── eng.traineddata        ← English (CozyOS Core OCR Language Pack v1 — required)
├── swa.traineddata        ← Kiswahili (CozyOS Core OCR Language Pack v1 — required)
├── ara.traineddata        ← Arabic   (CozyOS Core OCR Language Pack v1 — required)
├── fra.traineddata        ← French   (CozyOS Core OCR Language Pack v1 — required)
├── som.traineddata        ← Somali   (CozyOS Core OCR Language Pack v1 — required)
└── manifest.json          ← already present in this repo; do not hand-edit versions
```

The five `.traineddata` languages above are the **frozen, protected**
"CozyOS Core OCR Language Pack v1" per `tesseract-plugin.js`. Additional
languages (Amharic, Portuguese, Spanish, German, Italian, Chinese,
Japanese, Hindi, Yoruba, Zulu, Luganda, Kinyarwanda, Lingala, etc.) can
be added later as extra `.traineddata` files without touching any code —
`tesseract-plugin.js`'s `registerLanguage()` handles that.

## Install steps (run on a network-enabled machine)

```bash
# 1. Fetch the npm package (this pulls tesseract.min.js, worker.min.js,
#    and the WASM loader — NOT trained-data, which ships separately).
npm pack tesseract.js@6

# 2. Unpack it and copy the browser-ready files into place.
tar -xzf tesseract.js-6.*.tgz
cp package/dist/tesseract.min.js       core/vendor/tesseract/tesseract.min.js
cp package/dist/worker.min.js          core/vendor/tesseract/worker.min.js
cp package/dist/tesseract-core.wasm.js core/vendor/tesseract/tesseract-core.wasm.js

# 3. Fetch the five required trained-data files (official tessdata_fast,
#    the same source Tesseract.js's own docs point to).
for LANG in eng swa ara fra som; do
  curl -L "https://github.com/tesseract-ocr/tessdata_fast/raw/main/${LANG}.traineddata" \
       -o "core/vendor/tesseract/${LANG}.traineddata"
done

# 4. Verify sizes look sane (each traineddata file should be roughly
#    1-15 MB depending on language/script complexity — a 0-byte or
#    HTML-error file means the download failed).
ls -lh core/vendor/tesseract/*.traineddata
```

`install.sh` in this directory runs steps 1–4 for you.

## Verifying the install

Open `core/modules/developer/developer-hub.html` (or any page that loads
`vendor-loader.js` + `cozy-ocr.js`) and run in the console:

```js
await window.CozyOS.OCR.ensureProviderLoaded();
window.CozyOS.OCR.getProviderStatus();
// expect: { available: true, engine: "Tesseract.js", vendorSource: "local", ... }
```

If `vendorSource` is not `"local"`, one of the files above is missing or
misnamed — re-check step 2–3 above rather than enabling the dev fallback.

## Do not

- Do not point `tesseract.min.js` at a CDN URL "temporarily" — that
  recreates the exact v4.1.1/v6 mismatch this install fixes.
- Do not commit `.traineddata` files under any name other than the
  ISO 639-2 code CozyOS already uses (`eng`, `swa`, `ara`, `fra`, `som`).
- Do not enable `window.CozyOS.config.allowVendorDevFallback = true` in
  a production build. It exists for local development only.
