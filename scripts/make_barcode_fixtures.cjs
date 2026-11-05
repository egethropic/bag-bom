// Synthetic labels only. Writer is a development tool, not shipped in releases.
const fs = require('node:fs');
const path = require('node:path');
const Z = require('zxing-wasm/writer');
const out = path.resolve(__dirname, '../tests/generated');
Z.prepareZXingModule({overrides: {wasmBinary: fs.readFileSync(require.resolve('zxing-wasm/writer/zxing_writer.wasm'))}});
(async () => {
  fs.mkdirSync(out, {recursive: true});
  const fixtures = [
    ['lcsc-qr', 'QRCode', '{pbn:PICK123,on:ORDER456,pc:C25804,pm:RC0603FR-0710KL,qty:20}'],
    ['second-qr', 'QRCode', '{pc:C15849,pm:GRM188R71C105KA12D,qty:5}'],
    ['digikey-dm', 'DataMatrix', '[)>\x1e06\x1dPCUSTOMREF\x1d1PRC0603FR-0710KL\x1d30PTEST123-ND\x1dQ20\x1d1TLOT123\x1e\x04'],
    ['unknown-qr', 'QRCode', '{pc:C999888777,pm:UNKNOWN123,qty:1}'],
    ['mouser-dm', 'DataMatrix', '>[)>06\x1dKORDER100\x1d14KSHIP100\x1d1P603-DEMO100\x1dPCUSTOM100\x1dQ20\x04'],
    ['newark-dm', 'DataMatrix', '[)>\x1e06\x1d3P12AB3456\x1dPCUSTOM100\x1dQ20\x1e\x04'],
    ['arrow-pdf417', 'PDF417', '[)>\x1e06\x1d17V98897\x1d1PARROW-DEMO100\x1dSSERIAL100\x1e\x04'],
    ['mouser-qr', 'QRCode', 'https://www.mouser.com/ProductDetail/Yageo/RC0603FR-0710KL'],
    ['newark-qr', 'QRCode', 'https://www.newark.com/demo/resistor/dp/12AB3456'],
    ['arrow-qr', 'QRCode', 'https://www.arrow.com/en/products/rc0603fr-0710kl/yageo'],
    ['farnell-qr', 'QRCode', 'https://uk.farnell.com/demo/resistor/dp/1234567'],
    ['element14-qr', 'QRCode', 'https://au.element14.com/demo/resistor/dp/7654321'],
    ['vendor-conflict-dm', 'DataMatrix', '[)>\x1e06\x1d3P12AB3456\x1d1PUNKNOWN100\x1e\x04'],
  ];
  for (const [name, format, text] of fixtures) {
    const result = await Z.writeBarcode(text, {format, scale: 6, options: 'forceSquare', addQuietZones: true});
    if (result.error || !result.image) throw Error(result.error || 'no image');
    fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(await result.image.arrayBuffer()));
  }
  console.log('Generated synthetic QR, Data Matrix and PDF417 images.');
})().catch(error => { console.error(error); process.exitCode = 1; });
