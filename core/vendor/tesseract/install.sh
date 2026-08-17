#!/usr/bin/env bash
# CozyOS Vendor Install — Tesseract.js v6 (OCR)
# Run this from the repository root, on a machine with network access.
# See README.md in this directory for what each step does and why.
set -euo pipefail

VENDOR_DIR="core/vendor/tesseract"
LANGS=(eng swa ara fra som)   # CozyOS Core OCR Language Pack v1 — frozen, do not trim

if [ ! -d "core" ]; then
  echo "Run this script from the CozyOS repository root (a 'core/' directory must exist here)." >&2
  exit 1
fi

echo "==> Fetching tesseract.js@6 from npm ..."
TMP_DIR="$(mktemp -d)"
npm pack tesseract.js@6 --pack-destination "$TMP_DIR"
TARBALL="$(ls "$TMP_DIR"/tesseract.js-6.*.tgz | head -n1)"

if [ -z "$TARBALL" ]; then
  echo "Could not find a downloaded tesseract.js-6.*.tgz — npm pack may have failed." >&2
  exit 1
fi

echo "==> Unpacking $TARBALL ..."
tar -xzf "$TARBALL" -C "$TMP_DIR"

echo "==> Installing browser bundle files into $VENDOR_DIR ..."
cp "$TMP_DIR/package/dist/tesseract.min.js"       "$VENDOR_DIR/tesseract.min.js"
cp "$TMP_DIR/package/dist/worker.min.js"          "$VENDOR_DIR/worker.min.js"
cp "$TMP_DIR/package/dist/tesseract-core.wasm.js" "$VENDOR_DIR/tesseract-core.wasm.js"

echo "==> Fetching trained-data files for: ${LANGS[*]} ..."
for LANG in "${LANGS[@]}"; do
  echo "    - ${LANG}.traineddata"
  curl -fL "https://github.com/tesseract-ocr/tessdata_fast/raw/main/${LANG}.traineddata" \
       -o "$VENDOR_DIR/${LANG}.traineddata"
done

echo "==> Cleaning up temp files ..."
rm -rf "$TMP_DIR"

echo "==> Done. Verifying file sizes:"
ls -lh "$VENDOR_DIR"/*.js "$VENDOR_DIR"/*.traineddata

echo ""
echo "Next: open a page that loads vendor-loader.js + cozy-ocr.js and run"
echo "  await window.CozyOS.OCR.ensureProviderLoaded()"
echo "in the console to confirm vendorSource === \"local\"."
