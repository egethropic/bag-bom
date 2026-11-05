const {test} = require('node:test');
const assert = require('node:assert/strict');
const B = require('../bag_bom/web/barcodes.js');
const M = require('../bag_bom/web/matcher.js');
const fields = ['Value', 'Footprint', 'MPN', 'LCSC', 'Digi-Key Part Number'];
function index(rows) {
  return M.buildIndex({bom: {both: [rows.map((_, i) => ['R' + (i + 1), i])], fields: rows}}, fields);
}
const rows = [
  ['RESET', 'SW', 'KXT 321 LHS', 'C12345', 'TEST123-ND'],
  ['BOOT', 'SW-other-courtyard', 'KXT 321 LHS', 'C12345', 'TEST123-ND'],
  ['10k', '0603', 'RC0603FR-0710KL', 'C25804', '311-10.0KHRCT-ND'],
];
const bom = index(rows);
const dk = (...fields) => '[)>\x1e06\x1d' + fields.join('\x1d') + '\x1e\x04';

test('DigiKey 1P MPN and 30P SKU, including internal spaces, select identical parts together', () => {
  const result = B.match([dk('PC1,C3', '1PKXT 321 LHS', '30PTEST123-ND', 'Q2')], bom);
  assert.equal(result.status, 'unique');
  assert.deepEqual(result.exact[0].group.refs, [['R1', 0], ['R2', 1]]);
});
test('LCSC unquoted and JSON pc/pm fields work independently of field order', () => {
  for (const code of ['{pbn:PICK123,on:ORDER123,pc:C25804,pm:RC0603FR-0710KL,qty:10}',
    '{"qty":10,"pm":"RC0603FR-0710KL","pc":"C25804"}']) {
    assert.equal(B.match([code], bom).status, 'unique');
  }
});
test('LCSC MPN matches an MPN-only BOM, without supplier lookup', () => {
  assert.equal(B.match(['{pc:C25804,pm:RC0603FR-0710KL}'], index([rows[2].slice(0, 3)])).status, 'unique');
});
test('supplier and MPN namespaces cannot collide', () => {
  const collision = index([['x','x','C25804','',''], ['y','y','TEST999','C25804','']]);
  assert.deepEqual(B.match(['{pc:C25804}'], collision).exact[0].group.refs, [['R2', 1]]);
});
test('order, quantity, lot, and customer reference cannot select components', () => {
  for (const payload of [dk('PC25804', 'KRC0603FR-0710KL', '1TC25804', 'Q12345'),
    '{pbn:C25804,on:RC0603FR-0710KL,qty:12345}', dk('PTEST123-ND', '30PUNKNOWN-ND', '1PUNKNOWN123')]) {
    assert.equal(B.match([payload], bom).status, 'none');
  }
});
test('legacy DigiKey P field accepts only complete -ND SKUs', () => {
  assert.equal(B.match([dk('PTEST123-ND')], bom).status, 'unique');
  assert.equal(B.match([dk('PKXT321LHS')], bom).status, 'none');
});
test('visible separators and scanner symbology prefix decode', () => {
  for (const payload of [']d2' + dk('1PRC0603FR-0710KL'), '[)><RS>06<GS>1PRC0603FR-0710KL<RS><EOT>',
    '[)>␞06␝1PRC0603FR-0710KL␞␄']) assert.equal(B.match([payload], bom).status, 'unique');
});
test('plain IDs and known LCSC product URLs work; arbitrary URLs never do', () => {
  for (const code of ['C25804', 'https://www.lcsc.com/product-detail/C25804.html']) assert.equal(B.match([code], bom).status, 'unique');
  for (const code of ['https://evil.example/C25804', 'https://lcsc.com.evil.example/C25804.html',
    'https://www.lcsc.com/?order=C25804', 'order C25804', 'C258040', 'RC0603FR-O710KL']) assert.equal(B.match([code], bom).status, 'none');
});
test('multiple codes, or contradictory identifiers within one code, stay ambiguous', () => {
  assert.equal(B.match(['C25804', '{pc:C12345}'], bom).status, 'ambiguous');
  assert.equal(B.match(['{pc:C12345,pm:RC0603FR-0710KL}'], bom).status, 'ambiguous');
  assert.equal(B.match(['C25804', 'C25804'], bom).status, 'unique');
});
test('same SKU assigned to different MPNs never merges identities', () => {
  const conflicting = index([rows[0], ['BOOT','SW','DIFFERENT123','C12345','TEST123-ND']]);
  assert.equal(B.match(['C12345'], conflicting).status, 'ambiguous');
});
test('a known SKU cannot override an unknown conflicting MPN', () => {
  assert.equal(B.match(['{pc:C25804,pm:UNKNOWN123}'], bom).status, 'ambiguous');
  assert.equal(B.match(['C25804', '{pc:C999999,pm:UNKNOWN123}'], bom).status, 'ambiguous');
});
test('empty, unsupported, malformed and excessive payloads do not produce matches', () => {
  for (const code of ['', '{pc:C25804', '{"pc":12345}', 'x'.repeat(10001), null, undefined, dk('1P', '30P', 'P')])
    assert.deepEqual(B.parse(code), []);
});

const vendorFields = ['Value', 'Footprint', 'MPN', 'Mouser Part No', 'Newark Stock No', 'Arrow Part Number', 'Farnell Order Code', 'element14 SKU'];
function vendorIndex(rows) {
  return M.buildIndex({bom: {both: [rows.map((_, i) => ['R' + (i + 1), i])], fields: rows}}, vendorFields);
}
const vendorBom = vendorIndex([['10k', '0603', 'RC0603FR-0710KL', '603-DEMO100', '12AB3456', 'ARROW-DEMO100', '1234567', '7654321']]);

test('supplier aliases are enabled by default and typed JSON stays in its vendor namespace', () => {
  assert.deepEqual(M.defaultFields(vendorFields), vendorFields.slice(2));
  for (const [field, value] of vendorFields.slice(3).map((field, i) => [field, vendorBom[0].ids[i + 1].value])) {
    assert.equal(B.match([JSON.stringify({[field]: value})], vendorBom).status, 'unique', field);
  }
  assert.equal(B.match(['{"Mouser Part No":"12AB3456"}'], vendorBom).status, 'none');
});

test('Mouser legacy header and standard ECIA supplier part select an exact Mouser SKU', () => {
  for (const payload of ['>[)>06\x1dKORDER100\x1d14KSHIP100\x1d1P603-DEMO100\x1dPCUSTOM100\x1dQ20\x04',
    dk('1P603-DEMO100', 'PCUSTOM100'), '[)>[RS]06[GS]1P603-DEMO100[RS][EOT]']) {
    assert.equal(B.match([payload], vendorBom).status, 'unique');
  }
  // A Mouser code containing only its SKU needs that SKU in the BOM.
  assert.equal(B.match(['>[)>06\x1d1P603-DEMO100'], bom).status, 'none');
  assert.equal(B.match([dk('P603-DEMO100', 'K603-DEMO100', '14K603-DEMO100')], vendorBom).status, 'none');
});

test('Newark 3P supplier SKU and Arrow 1P manufacturer/supplier identifiers select', () => {
  for (const payload of [dk('3P12AB3456'), dk('1PRC0603FR-0710KL', '3P12AB3456'),
    dk('17V98897', '1PARROW-DEMO100', 'SSERIAL100'), dk('1PRC0603FR-0710KL', 'Q20')]) {
    assert.equal(B.match([payload], vendorBom).status, 'unique');
  }
  assert.equal(B.match([dk('3PUNKNOWN100', '1PRC0603FR-0710KL')], vendorBom).status, 'ambiguous');
  assert.equal(B.match([dk('3P12AB3456', '1PUNKNOWN100')], vendorBom).status, 'ambiguous');
});

test('generic ECIA identifiers never silently resolve namespace collisions or strip vendor prefixes', () => {
  const collision = vendorIndex([
    ['x','x','603-DEMO100','','12AB3456'], ['y','y','OTHER100','603-DEMO100','12AB3456'],
  ]);
  assert.equal(B.match([dk('1P603-DEMO100')], collision).status, 'ambiguous');
  assert.equal(B.match([dk('3P12AB3456')], collision).status, 'ambiguous');
  assert.equal(B.match([dk('3PRC0603FR-0710KL')], vendorBom).status, 'none');
  assert.equal(B.match([dk('1P603-RC0603FR-0710KL')], vendorBom).status, 'none');
  assert.equal(B.match([dk('30P12AB3456')], vendorBom).status, 'none');
});

test('known vendor product URLs match exact identifiers locally', () => {
  for (const url of ['https://www.mouser.com/ProductDetail/Yageo/RC0603FR-0710KL?qs=tracking',
    'https://www.mouser.de/ProductDetail/Yageo/RC0603FR-0710KL',
    'https://www.arrow.com/en/products/rc0603fr-0710kl/yageo',
    'https://www.newark.com/yageo/test/dp/12AB3456?CMP=tracking',
    'https://uk.farnell.com/yageo/test/dp/1234567', 'https://au.element14.com/yageo/test/dp/7654321']) {
    assert.equal(B.match([url], vendorBom).status, 'unique', url);
  }
  for (const url of ['https://mouser.com.evil.test/ProductDetail/Yageo/RC0603FR-0710KL',
    'https://evilnewark.com/test/dp/12AB3456', 'https://arrow.com/orders/RC0603FR-0710KL',
    'https://newark.com/?order=12AB3456', 'https://newark.com/test/dp/1234567',
    'https://mouser.com/ProductDetail/Yageo/%E0%A4%A', 'https://arrow.com/en/products/rc0603fr-0710k/yageo']) {
    assert.equal(B.match([url], vendorBom).status, 'none', url);
  }
});
