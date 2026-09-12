#!/usr/bin/env bash
# CozyOS Vendor Install — Tesseract.js v6 (OCR)
# Run this from the repository root, on a machine with network access.
# See README.md in this directory for what each step does and why.
#
# CORRECTED in the "Tesseract Installation — Real Artifact Integration"
# milestone: the previous version of this script assumed `npm pack
# tesseract.js@6` alone would produce tesseract-core.wasm.js. It does
# not. tesseract.js@6.0.1's own dist/ only contains tesseract.min.js
# and worker.min.js — the WASM runtime (tesseract-core.wasm.js +
# tesseract-core.wasm) ships in the SEPARATE tesseract.js-core@6.0.0
# package. Both packages must be fetched.
#
# Also corrected: the language list below now reflects only languages
# whose real .traineddata artifacts have actually been obtained and
# verified (SHA-256-checked) in this repository. 'som' (Somali) was
# previously listed but its artifact has never actually been acquired
# — it has been removed from this script rather than silently kept as
# an unfulfillable promise. See manifest.json's "notAcquired" field for
# the current list of still-missing languages.
set -euo pipefail

VENDOR_DIR="core/vendor/tesseract"
# Real, independently-acquired language packs only. Each of these has a
# corresponding .traineddata file already verified (size + SHA-256) in
# this repository — see manifest.json. Do NOT add a language here until
# its real artifact has been independently obtained; do NOT remove one
# that is already genuinely installed.
LANGS=(eng swa fra ara rus chi_sim yor amh hin)

if [ ! -d "core" ]; then
  echo "Run this script from the CozyOS repository root (a 'core/' directory must exist here)." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "==> Fetching tesseract.js@6.0.1 from npm (browser bundle: tesseract.min.js, worker.min.js) ..."
npm pack tesseract.js@6.0.1 --pack-destination "$TMP_DIR"
JS_TARBALL="$(ls "$TMP_DIR"/tesseract.js-6.*.tgz | head -n1)"
[ -n "$JS_TARBALL" ] || { echo "Could not find downloaded tesseract.js-6.*.tgz — npm pack may have failed." >&2; exit 1; }
tar -xzf "$JS_TARBALL" -C "$TMP_DIR" --one-top-level=tesseract-js

echo "==> Fetching tesseract.js-core@6.0.0 from npm (WASM runtime: tesseract-core.wasm.js + tesseract-core.wasm) ..."
npm pack tesseract.js-core@6.0.0 --pack-destination "$TMP_DIR"
CORE_TARBALL="$(ls "$TMP_DIR"/tesseract.js-core-6.*.tgz | head -n1)"
[ -n "$CORE_TARBALL" ] || { echo "Could not find downloaded tesseract.js-core-6.*.tgz — npm pack may have failed." >&2; exit 1; }
tar -xzf "$CORE_TARBALL" -C "$TMP_DIR" --one-top-level=tesseract-js-core

echo "==> Installing browser bundle + WASM runtime into $VENDOR_DIR ..."
cp "$TMP_DIR/tesseract-js/package/dist/tesseract.min.js"        "$VENDOR_DIR/tesseract.min.js"
cp "$TMP_DIR/tesseract-js/package/dist/worker.min.js"           "$VENDOR_DIR/worker.min.js"
# Plain (non-SIMD, non-LSTM-only) core — broadest compatibility, matches
# the single filename this repo's manifest.json/README.md/smoke test
# all expect. tesseract.js-core also ships -simd/-lstm/-simd-lstm
# variants for callers who want smaller/faster builds; not used here.
cp "$TMP_DIR/tesseract-js-core/package/tesseract-core.wasm.js"  "$VENDOR_DIR/tesseract-core.wasm.js"
cp "$TMP_DIR/tesseract-js-core/package/tesseract-core.wasm"     "$VENDOR_DIR/tesseract-core.wasm"

echo "==> Fetching trained-data language packages for: ${LANGS[*]} ..."
for LANG in "${LANGS[@]}"; do
  echo "    - @tesseract.js-data/${LANG}"
  npm pack "@tesseract.js-data/${LANG}" --pack-destination "$TMP_DIR"
  DATA_TARBALL="$(ls "$TMP_DIR/${LANG}"-*.tgz 2>/dev/null | head -n1)"
  if [ -z "$DATA_TARBALL" ]; then
    DATA_TARBALL="$(ls "$TMP_DIR"/*"${LANG}"*.tgz | head -n1)"
  fi
  [ -n "$DATA_TARBALL" ] || { echo "Could not find downloaded package for '${LANG}' — npm pack may have failed." >&2; exit 1; }
  DATA_DIR="$TMP_DIR/data-${LANG}"
  mkdir -p "$DATA_DIR"
  tar -xzf "$DATA_TARBALL" -C "$DATA_DIR"
  # Canonical path per this milestone's instructions: the package's
  # 4.0.0/ directory (standard trained data), NOT 4.0.0_best_int/.
  gunzip -c "$DATA_DIR/package/4.0.0/${LANG}.traineddata.gz" > "$VENDOR_DIR/${LANG}.traineddata"
done

echo "==> Done. Verifying file sizes and hashes:"
ls -lh "$VENDOR_DIR"/*.js "$VENDOR_DIR"/*.wasm "$VENDOR_DIR"/*.traineddata
sha256sum "$VENDOR_DIR"/*.js "$VENDOR_DIR"/*.wasm "$VENDOR_DIR"/*.traineddata

echo ""
echo "Next: open a page that loads vendor-loader.js + cozy-ocr.js and run"
echo "  await window.CozyOS.OCR.ensureProviderLoaded()"
echo "in the console to confirm vendorSource === \"local\"."
echo ""
echo "Still MISSING (not installed by this script — real artifacts not yet"
echo "obtained): som, hau, zul, lin, ibo. Do not add these to LANGS above"
echo "until their real .traineddata files have been independently acquired."
echo ""
echo "MODEL-MISSING regardless of network access (no Tesseract-trained"
echo "model exists at all): Luo/Dholuo, Kikuyu/Gikuyu, Kikamba/Kamba."
