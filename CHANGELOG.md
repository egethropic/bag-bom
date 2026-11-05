# Changelog

## 0.2.1 — 2026-11-04

- Matching QR/Data Matrix tags select immediately on the first successful decode,
  with no selection button or OCR toggle dependency.
- Scan the full camera frame so codes near the edges are not cropped out.
- Keep the detected part number and no-match explanation visible across missed
  frames; preserve higher resolution for saved label images.
- Restore the matching highlight if it was cleared while the same tag is visible.
- Regression tests cover a single decoded frame followed by misses and an edge-positioned code.

## 0.2.0 — 2026-11-04

- QR / Data Matrix scanning is the default, with offline ZXing decoding in a worker.
- DigiKey ECIA and observed LCSC/JLCPCB payloads select exact MPN/SKU matches.
- Barcode photos and Enter-submitted scanner input can auto-select; live video
  uses two consecutive decoded reads. OCR is an explicit fallback.
- Identical barcode identities across value descriptions or footprint aliases
  select together. Conflicting identities and multiple different parts stay manual.
- Added decoder, supplier parser, camera cancellation, and offline browser tests.
- Apache-2.0 retained, with the new decoder's third-party notices bundled.

## 0.1.0 — 2026-11-04 (experimental)

- KiCad action plugin and standalone launcher for existing InteractiveHtmlBom exports.
- Offline webcam OCR, saved label images, and pasted/keyboard-scanner text.
- Exact MPN and supplier-number matching, configurable field selection,
  two-frame automatic selection, and manual ambiguous/near-match candidates.
- Exact footprint highlighting across both board sides, including mixed BOM groups.
- Loopback-only session server, bundled OCR assets, PCM/manual packages,
  and automated matching, server, and real-browser OCR tests.
- Apache-2.0 license with bundled third-party notices.

At the time of 0.1.0, physical-bag validation, barcode-image decoding, native PCB-editor selection,
KiCad IPC migration, and cross-session assembly-state persistence remain future work.
