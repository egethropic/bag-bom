# License sources

These notices accompany unmodified binary dependencies. The application source
is Apache-2.0; third-party licenses remain as supplied by their authors.

- Buffer 6.0.3: https://github.com/feross/buffer/blob/v6.0.3/LICENSE
- IEEE754 1.2.1: https://github.com/feross/ieee754/blob/v1.2.1/LICENSE
- base64-js 1.5.1: https://github.com/beatgammit/base64-js/blob/v1.5.1/LICENSE
- Tesseract.js-core 7.0.0 submodule revisions:
  https://github.com/naptha/tesseract.js-core/tree/v7.0.0/third_party
- English traineddata: https://github.com/naptha/tessdata/blob/gh-pages/LICENSE
  (`@tesseract.js-data/eng` metadata labels its packaging MIT; only its traineddata
  file is redistributed here, with the upstream Apache-2.0 data license.)

The specific C/C++ dependency revisions are recorded in `core-dependencies.json`.
Tesseract.js bundle license comments and installed dependency licenses are also
copied into `web/vendor` at build time.
