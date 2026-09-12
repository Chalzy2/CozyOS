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

**CORRECTED (Real Artifact Integration milestone):** `tesseract.js@6.0.1`
does **not** contain `tesseract-core.wasm.js`. That file — and its
paired `.wasm` binary — ship only in the separate `tesseract.js-core@6.0.0`
package. Two packages must be fetched, not one.

## Required files in this directory

```
core/vendor/tesseract/
├── tesseract.min.js       ← from tesseract.js@6.0.1's dist/
├── worker.min.js          ← from tesseract.js@6.0.1's dist/
├── tesseract-core.wasm.js ← from the SEPARATE tesseract.js-core@6.0.0 package
├── tesseract-core.wasm    ← paired binary, same package
├── eng.traineddata        ← English   (installed)
├── swa.traineddata        ← Kiswahili (installed)
├── fra.traineddata        ← French    (installed)
├── ara.traineddata        ← Arabic    (installed)
├── rus.traineddata        ← Russian   (installed)
├── chi_sim.traineddata    ← Chinese, Simplified (installed)
├── yor.traineddata        ← Yoruba    (installed)
├── amh.traineddata        ← Amharic   (installed)
├── hin.traineddata        ← Hindi     (installed)
└── manifest.json          ← source of truth for what's actually on disk; do not hand-edit
```

`tesseract-plugin.js`'s `SUPPORTED_LANGUAGES` map (the "CozyOS Core OCR
Language Pack v1" code registry) still lists `som` (Somali) as a
protected *code* — that is a registry declaration, not a claim that the
file exists. **`som.traineddata` has not been installed**: no real
artifact for it has been independently obtained yet. Do not add a
`som.traineddata` file under any circumstance other than a genuinely
acquired artifact. The same applies to `hau`, `zul`, `lin`, `ibo` —
named in this driver's header as future candidates, none actually
installed. See `manifest.json`'s `notAcquired` field for the current
list.

**MODEL-MISSING (not a network/acquisition problem — no trained model
exists at all):** Luo/Dholuo, Kikuyu/Gikuyu, Kikamba/Kamba. See
`core/modules/ocr/tests/tesseract-vendor-dependency-smoke.test.js`'s
`LANGUAGE_MAP` for the disclosed-confidence mapping this repo maintains
for all 17 default identity languages, not just the ones with real
Tesseract models.

Additional languages beyond the ones above can still be added later as
extra `.traineddata` files without touching any code —
`tesseract-plugin.js`'s `registerLanguage()` handles that — but only
once their real artifacts are independently obtained.

## Install steps (run on a network-enabled machine)

```bash
# 1. Fetch BOTH packages — they are separate on npm.
npm pack tesseract.js@6.0.1
npm pack tesseract.js-core@6.0.0

# 2. Unpack and copy the browser-ready files into place.
tar -xzf tesseract.js-6.0.1.tgz
tar -xzf tesseract.js-core-6.0.0.tgz --one-top-level=tesseract-js-core
cp package/dist/tesseract.min.js                    core/vendor/tesseract/tesseract.min.js
cp package/dist/worker.min.js                       core/vendor/tesseract/worker.min.js
cp tesseract-js-core/package/tesseract-core.wasm.js core/vendor/tesseract/tesseract-core.wasm.js
cp tesseract-js-core/package/tesseract-core.wasm    core/vendor/tesseract/tesseract-core.wasm

# 3. Fetch each language's real trained-data package and use its
#    canonical 4.0.0/ path (not 4.0.0_best_int/), then decompress —
#    CozyOS's driver expects an already-gunzipped .traineddata file.
for LANG in eng swa fra ara rus chi_sim yor amh hin; do
  npm pack "@tesseract.js-data/${LANG}"
  tar -xzf "${LANG}"-*.tgz -C "data-${LANG}-tmp" 2>/dev/null || { mkdir -p "data-${LANG}-tmp"; tar -xzf "${LANG}"-*.tgz -C "data-${LANG}-tmp"; }
  gunzip -c "data-${LANG}-tmp/package/4.0.0/${LANG}.traineddata.gz" > "core/vendor/tesseract/${LANG}.traineddata"
done

# 4. Verify sizes and hashes (each traineddata file should be roughly
#    1-45 MB depending on language/script complexity — a 0-byte or
#    HTML-error file means the download failed).
ls -lh core/vendor/tesseract/*.traineddata
sha256sum core/vendor/tesseract/*
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
  ISO 639-2 code CozyOS already uses.
- Do not claim `som`, `hau`, `zul`, `lin`, or `ibo` are installed until
  their real artifacts have been independently obtained — a name
  appearing in `tesseract-plugin.js`'s code registry is not evidence a
  file exists.
- Do not enable `window.CozyOS.config.allowVendorDevFallback = true` in
  a production build. It exists for local development only.
