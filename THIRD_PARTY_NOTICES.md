# Third-party software

Bag BOM source is Copyright 2026 egethropic, licensed under Apache-2.0.

## Bundled in installable releases

- [Tesseract.js](https://github.com/naptha/tesseract.js), version 7.0.0, Apache-2.0.
  License: `web/vendor/TESSERACT-JS-LICENSE.txt`.
- [tesseract.js-core](https://github.com/naptha/tesseract.js-core), resolved and
  pinned by `package-lock.json`, Apache-2.0. License:
  `web/vendor/TESSERACT-CORE-LICENSE.txt`. Its WebAssembly build incorporates
  Tesseract and Leptonica, image codecs, and compiler/runtime libraries. The
  notices copied from `third_party/` accompany these binaries in `web/vendor`;
  `core-dependencies.json` records their source revisions.
- English trained data from [naptha/tessdata](https://github.com/naptha/tessdata),
  distributed as `@tesseract.js-data/eng` 1.0.0, Apache-2.0.
  `web/vendor/LANGUAGE-DATA-NOTICE.txt` contains the package provenance.
- Dependencies bundled into Tesseract.js are listed with their licenses in
  `web/vendor/BUNDLED-DEPENDENCIES.txt`; upstream build license comments are kept.

## Compatible viewer (installed separately)

[InteractiveHtmlBom](https://github.com/openscopeproject/InteractiveHtmlBom) is
Copyright 2018 qu1ck and contributors, MIT. Bag BOM does not bundle the plugin or
change its installed files. It serves the user's existing HTML export with an
additional scanner panel in memory. That HTML retains its own upstream notices.

The optional generated demonstration HTML includes InteractiveHtmlBom's viewer
and its bundled libraries with upstream license headers and MIT license.
It contains only a fictional demonstration board authored for this project.

Development-only tools are not included in installable packages.
