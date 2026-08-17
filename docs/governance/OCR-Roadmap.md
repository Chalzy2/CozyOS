# CozyOS OCR Roadmap

This document holds planned, not-yet-shipped OCR work. It is intentionally
kept separate from the Milestone 174 record — per the Constitution's Migration
Log Rules, the milestone log records only completed, tested, certified work;
plans and intentions are never logged there.

Nothing in this document has been implemented or verified. Scope and
sequencing may change before each milestone is actually taken up.

## Milestone 175 — Rich OCR Provider Output

Expand the provider contract beyond `{rawText, confidence}` to include:
- Words, lines, paragraphs, blocks
- Tables, forms
- Bounding boxes
- Orientation
- Metadata

This would let `extractTables()`/`extractForm()` route through a registered
provider instead of requiring the direct `window.Tesseract` path.

## Milestone 176 — Vendor Installation

- Install `tesseract.min.js`, `worker.min.js`, `tesseract-core.wasm.js`
- Install the language data (`eng`, `swa`, `ara`, `fra`, `som` at minimum)
- Verify OCR end-to-end once real binaries are present
- Update `core/vendor/tesseract/manifest.json` to reflect real installed state

Requires network access, which the current build environment does not have.

## Milestone 177 — AI + OCR Integration

- Feed OCR output into the Language Engine
- Feed into the Memory Engine
- Feed into the Interpretation Engine
- Feed into Thinking and Reasoning Engines
- Enable conversational understanding of scanned documents
