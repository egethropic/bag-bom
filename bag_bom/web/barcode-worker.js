/* SPDX-License-Identifier: Apache-2.0. Copyright 2026 egethropic. */
// CPU-intensive decoding stays off the UI thread. All assets are local.
importScripts('vendor/zxing-reader.js');
ZXingWASM.prepareZXingModule({overrides: {
  locateFile: name => new URL('vendor/' + name, self.location.href).href,
}});
self.onmessage = async ({data: {id, pixels, width, height}}) => {
  try {
    const results = await ZXingWASM.readBarcodes(new ImageData(new Uint8ClampedArray(pixels), width, height), {
      formats: ['QRCode', 'DataMatrix', 'Code128', 'Code39', 'PDF417'],
      tryHarder: true, tryRotate: true, tryInvert: true, tryDenoise: true, textMode: 'Plain',
      maxNumberOfSymbols: 32,
    });
    self.postMessage({id, results: results.filter(result => result.isValid && result.sequenceSize <= 1)
      .map(result => ({text: result.text, format: result.format}))});
  } catch (error) { self.postMessage({id, error: error.message || String(error)}); }
};
