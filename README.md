# Bag BOM

**Show the bag. Find the part.** Offline webcam label scanning for
[InteractiveHtmlBom](https://github.com/openscopeproject/InteractiveHtmlBom).

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

Bag BOM is a KiCad companion plugin from **egethropic**. Hold the **QR or Data
Matrix code on a supported supplier bag** in front of your webcam. DigiKey, LCSC,
Mouser, Newark and Arrow payloads are supported as detailed below. The first successful
decode selects matching components immediately and highlights their placements
in your InteractiveHtmlBom viewer, including parts on both sides of the board.
Printed-text OCR remains available as an explicit fallback.

![Bag BOM scanning a synthetic QR label](docs/scanner.png)

**Experimental v0.3.0.** Tested with real barcode decoding of synthetic QR/Data
Matrix/PDF417 images and simulated cameras, plus two published DigiKey label photos.
A third published photo failed decoding. Physical webcams, glare, crumpled bags,
small codes, and your actual parts still need bench validation. The new vendor
formats have synthetic regression coverage, not physical-bag validation. Check the highlighted part
before soldering. Bag BOM selects parts; it never marks them as placed.

## Install

1. Install [InteractiveHtmlBom](https://github.com/openscopeproject/InteractiveHtmlBom/wiki/Installation)
   separately in KiCad.
2. Download `bag-bom-0.3.0-pcm.zip` from
   [Releases](https://github.com/egethropic/bag-bom/releases).
3. In KiCad's **Plugin and Content Manager → Install from File**, select that ZIP.
4. Restart the PCB Editor or refresh its action plugins.
5. Choose **Tools → External Plugins → Bag BOM — scan component labels**.

No Node.js, pip packages, OCR installation, cloud account, or API key is needed
to use a release. Barcode decoding, OCR assets and English recognition data are bundled.
This initial package uses KiCad's SWIG action-plugin runtime (KiCad 9–10).
KiCad 10.0.8 on Windows is the locally checked Python runtime. Linux/macOS and
KiCad 9 are intended targets, not yet manually verified. KiCad 11+ IPC support
is not included. This project is not yet in KiCad's official plugin catalog.

Manual alternative: extract `bag-bom-0.3.0-manual.zip` so the `bag_bom` folder
sits inside your KiCad user scripting plugins directory. Avoid installing both
the manual and PCM copies.

## Prepare and scan

1. In your schematic, add an exact **MPN** and/or supplier field such as **LCSC**,
   **Digi-Key Part Number**, **Mouser Part Number**, **Newark Part Number**,
   **Arrow Part Number**, **Farnell Order Code**, or **element14 SKU**; update the board from the
   schematic as appropriate.
2. Generate an InteractiveHtmlBom export with those fields included in its
   visible/exported fields. Grouping by MPN is recommended. Bag BOM can still
   distinguish different MPNs inside a single value/footprint group.
3. Launch Bag BOM and choose that `ibom.html`. It opens in your default browser.
4. Select your webcam, click **Start camera**, and allow the browser's camera
   permission. Leave **QR / Data Matrix / barcode** selected. Keep the complete
   square product code, including its white border, in focus in the camera view.
5. A unique exact match selects its footprints immediately on the first decoded
   frame. No selection button or auto-select toggle is needed in barcode mode.
   The full camera frame is scanned, including codes near its edges.

**Tag detected** keeps the last decoded part number visible. When that identifier
is absent from the current BOM, an explicit no-match message stays visible even
if subsequent frames miss the code. Detection cannot select a part that is not
present in the loaded board.

The scanner highlights matching **footprint IDs**, never substring search
results. It switches the viewer to the relevant side(s) and clears BOM filters
so the selected part can be seen. With different identities in one upstream BOM
row, the row still displays its original references, but only the matching
footprints are highlighted. All selected references are listed in the scanner.

QR/Data Matrix matching uses exact product identifiers, including MPNs with
spaces. Identical identifier sets across different value descriptions or
footprint aliases select together (for example, RESET and BOOT switches).
Different or contradictory identities remain manual. Neither lot/order numbers
nor quantity fields are treated as component identities.

Unknown supplier SKUs and partial part numbers are not auto-identified. An MPN
encoded in the label can match an MPN-only BOM; otherwise the supplier SKU must
already be in your export. There is no online part database lookup. You can enable other identifier columns under
**Matching fields**. Very short IDs (under 4 characters) and identifiers without
digits are excluded from automatic matching in this version.

**Label photo or text** accepts a code image or a USB barcode scanner acting as a
keyboard. In barcode mode, a decoded image or Enter-submitted exact identifier
auto-selects immediately. Multiple codes are evaluated together;
different matching parts are never selected automatically.

Choose **Printed text (OCR fallback)** for labels without a readable code.
Live OCR requires two reads at confidence ≥75 and its Auto-select option enabled; OCR image/text results require a
click. Similar OCR strings are suggestions only; `O`/`0` substitutions and missing
suffixes never trigger automatic selection. A failed barcode read does not
silently fall back to OCR.
Stop, minimize, or switch away from the tab to release the camera. A failed
match leaves the previous highlight in place; check the status and selected
reference list before proceeding.

### Supported codes and supplier payloads

- QR Code, Data Matrix, Code 128, Code 39 and PDF417 decode offline in a worker.
- ECIA Format 06 records: `1P` matches an exact manufacturer or supplier part
  number. This covers manufacturer labels used by Arrow and other distributors
  as well as supplier-SKU labels. If the same number identifies different BOM
  parts, selection stays manual. ASCII control characters and visible
  `<GS>`, `{GS}`, `[GS]` (also RS/EOT) separators are supported.
- DigiKey ECIA records: `30P` is matched as DigiKey SKU only with its complete
  `-ND` suffix. Legacy `P`
  is accepted only as a complete `-ND` SKU when `30P` is absent; customer references
  are otherwise ignored. Other vendors can use `30P` for non-part data, so it
  is not treated as a universal SKU field.
- Mouser: standard ECIA `1P` supplier IDs and the observed `>[)>06` header variant
  are supported. The variant's `1P` matches a Mouser field. **Include the exact
  Mouser SKU in the export when the code contains no manufacturer MPN.** Customer
  `P`, purchase-order `K`, and sales-order `14K` fields are ignored; a Mouser SKU
  is never converted to an MPN by removing its prefix.
- Newark: the observed `3P` SKU field matches exported supplier identifiers;
  `1P` manufacturer/supplier IDs also work. `3P` alone does not establish the
  vendor, so collisions across supplier columns remain ambiguous.
- Product URL QR codes: Mouser `/ProductDetail/manufacturer/MPN` and Arrow
  `/en/products/MPN/manufacturer` paths match MPN; Newark, Farnell and element14
  `/dp/SKU` paths match that vendor's column. Known supplier domains only;
  tracking/order query parameters do not supply identifiers.
- LCSC/JLCPCB `{pc:C12345,pm:MPN,...}` and JSON equivalents: `pc` matches LCSC,
  `pm` matches MPN. Whole raw identifiers and LCSC product-code URLs also work.
  URLs are parsed locally and never opened. Whole raw identifiers and explicit
  JSON fields such as `{"Mouser Part Number":"603-DEMO100"}` also work.
  Unsupported label variants report that no supported identifier was found.

Supplier column aliases include `Part Number`, `Part No`, `PN`, `SKU`, `Stock No`
and `Order Code`. Avnet, RS/RS Components and TME columns are also recognized for
raw identifiers and generic ECIA records; their proprietary payload variants
are not covered. No vendor API, account, or internet lookup is needed.

Format references: [DigiKey's own decoding guide](https://forum.digikey.com/t/digikey-product-labels-decoding-digikey-barcodes/41097)
and [the scan2place author's LCSC/JLCPCB payload example](https://github.com/theautomatist/scan2place#qr-code-format),
[Arrow's supplier labeling specification, sections 4–5](https://static4.arrow.com/-/media/five-years-out/company/1-19-21-supplier-quality/gsq-017-supplier-deliveries-labeling-and-packaging_revb-2.pdf),
[a label survey documenting Mouser's header and Newark's 3P field](https://github.com/inventree/InvenTree/issues/853),
[a Mouser scan author's observations](https://hackaday.io/page/12832-lookup-digikey-and-mouser-parts-by-qr-code-using-a-telegram-bot),
and [TME's specification showing the non-SKU use of 30P](https://www.tme.eu/gb/help/78084/release-label/).
Observed formats are not supplier-wide guarantees. Arrow's document specifies
incoming supplier labels, not every outgoing Arrow bag. Regional, legacy and
custom labels can differ. These references inform our own parser; no external
barcode-parser source code is incorporated.

## Privacy and session behavior

The plugin serves the chosen HTML and bundled barcode/OCR assets on `127.0.0.1` using a
random port and unguessable session path. It never serves a project directory.
The source HTML, schematic, and PCB are not modified. Camera frames stay in the
browser; Bag BOM has no upload endpoint, analytics, cloud OCR, or runtime CDN
dependency. Open only HTML exports you trust: they contain executable JavaScript.

Keep KiCad running while the viewer is open. The local server exits after three
minutes without a browser heartbeat. Each launch uses a fresh browser origin:
**export/import InteractiveHtmlBom settings to preserve assembly checkbox progress
across Bag BOM sessions**. Existing progress in a separately opened `file://` BOM
does not automatically transfer. Within one open session, normal iBOM checkboxes
and selection remain available. Bag BOM itself never checks a placement box.

Chrome/Edge are the tested browser family. Firefox/Safari camera and WebAssembly
behavior has not been validated. If the camera cannot start, check browser
permissions, close other apps using it, or use image/text input. For blurry labels,
use even lighting, reduce reflections, and move the label within the camera's
focus range.

## Run without KiCad

Extract the manual ZIP, then from its parent directory:

```sh
python -m bag_bom /path/to/ibom.html
```

Requires Python 3.9+ and a modern browser. A generated demonstration HTML and
synthetic label image are provided as release assets. They contain no user board
data. Camera auto-selection can be tried by displaying or printing the label.

## Develop and test

```sh
npm ci
npm run vendor
python -m pip install -r requirements-dev.txt
python scripts/make_fixture.py
npm test
python -m unittest discover -s tests -p "test_*.py"
npx playwright install chromium
npm run test:browser
npm run build
python scripts/smoke_package.py
```

The fixture script downloads the unmodified InteractiveHtmlBom viewer at commit
`d1eb5b79a52a2ddc1ce270b63920346463c19b05` (2.12.0 development line). Pass a local
upstream checkout as its optional argument to avoid the download. The tests use
a fictional board, an intentionally mixed BOM group, front/back placements, and
a synthetic label. Browser tests exercise real QR/Data Matrix/PDF417 decoding and OCR
for images and fake webcams, multi-code ambiguity, exact selection, camera denial,
stop/restart/minimize, and layout. Barcode parsing tests cover supplier namespaces,
conflicting identifiers, spaces, excluded order/lot fields, and exact-match boundaries.
The Python tests check the loopback server's file boundary, host/origin checks,
and source preservation. There is no KiCad or hardware dependency for these tests.

`scripts/package.py` creates deterministic PCM and manual ZIPs plus checksums.
The source checkout omits generated barcode/OCR binaries; `npm run vendor` copies them
from packages pinned in `package-lock.json`. Keep Apache-2.0 and third-party
notices in every distribution. Upstream's internal highlighting functions are
checked at startup, but future iBOM versions may require adapter updates.

## License and credits

Copyright 2026 egethropic. **[Apache License 2.0](LICENSE)**.

Thanks to [InteractiveHtmlBom](https://github.com/openscopeproject/InteractiveHtmlBom)
(MIT), [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) (MIT),
[ZXing-C++](https://github.com/zxing-cpp/zxing-cpp) (Apache-2.0),
[Tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0), and
Tesseract/Leptonica. See [NOTICE](NOTICE) and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
This is an independent project, not an official KiCad or InteractiveHtmlBom release.
