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
