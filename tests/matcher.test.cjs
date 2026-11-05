const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../bag_bom/web/matcher.js');
const fields = ['Value', 'Footprint', 'MPN', 'LCSC', 'Digi-Key Part Number'];
function board(rows, skipped = []) {
  return {bom: {both: [rows.map((_, i) => ['R' + (i + 1), i])], skipped,
    fields: Object.fromEntries(rows.map((row, i) => [i, row]))}};
}
const base = [
  ['10k', '0603', 'RC0603FR-0710KL', 'C25804', '311-10.0KHRCT-ND'],
  ['10k', '0603', 'RC0603FR-0710KL', 'C25804', '311-10.0KHRCT-ND'],
  ['10k', '0402', 'RC0402FR-0710KL', 'C25744', ''],
  ['1uF', '0603', 'GRM188R71C105KA12D', 'C15849', ''],
];
const index = M.buildIndex(board(base), fields);
test('exact MPN selects all identical components even in a mixed BOM group', () => {
  const r = M.match('MFR P/N: RC0603FR-0710KL\nQTY 20', index);
  assert.equal(r.status, 'unique'); assert.deepEqual(r.exact[0].group.refs, [['R1', 0], ['R2', 1]]);
});
test('supplier fields and case-insensitive Unicode hyphens work', () => {
  assert.equal(M.match('lcsc: c25804', index).status, 'unique');
  assert.equal(M.match('311–10.0KHRCT–ND', index).status, 'unique');
});
test('never matches ID substrings, prefixes, or packaging suffixes', () => {
  for (const label of ['XC25804', 'C258040', 'RC0603FR-0710KLX', '311-10.0KHRCT'])
    assert.equal(M.match(label, index).status, 'none', label);
});
test('generic values, references and package numbers never auto match', () => {
  assert.equal(M.match('10k 0603 R1 QTY 20', index).status, 'none');
});
test('two exact identifiers of different parts are ambiguous', () => {
  assert.equal(M.match('C25804 RC0603FR-0710KL C25744', index).status, 'ambiguous');
});
test('two exact identifiers of the same part reinforce one identity', () => {
  assert.equal(M.match('C25804 RC0603FR-0710KL', index).status, 'unique');
});
test('same MPN with different footprints remains ambiguous', () => {
  const mixed = M.buildIndex(board([base[0], [...base[0].slice(0, 1), '0402', ...base[0].slice(2)]]), fields);
  assert.equal(M.match('C25804', mixed).status, 'ambiguous');
});
test('OCR O/0 confusion is manual suggestion only', () => {
  const r = M.match('RC0603FR-O710KL', index);
  assert.equal(r.status, 'none'); assert.equal(r.suggestions.length, 1);
});
test('DNP/excluded IDs cannot be selected', () => {
  const excluded = M.buildIndex(board(base, [0, 1]), fields);
  assert.equal(M.match('C25804', excluded).status, 'none');
});
test('empty or missing fields produce helpful empty index, not generic fallbacks', () => {
  assert.deepEqual(M.buildIndex(board([['10k', '0603']]), fields), []);
});
test('custom column requires explicit opt-in', () => {
  const b = board([['10k', '0603', 'VENDOR123']]);
  assert.equal(M.buildIndex(b, ['Value', 'Footprint', 'Stock ID']).length, 0);
  assert.equal(M.buildIndex(b, ['Value', 'Footprint', 'Stock ID'], ['Stock ID']).length, 1);
});
test('two consistent confident frames are required, ambiguity resets', () => {
  const gate = new M.StabilityGate(); const yes = M.match('C25804', index);
  assert.equal(gate.observe(yes, 95), null);
  assert.ok(gate.observe(yes, 95));
  assert.equal(gate.observe(M.match('C25804 C25744', index), 99), null);
  assert.equal(gate.observe(yes, 95), null);
  assert.ok(gate.observe(yes, 95));
});
test('low confidence and a changed identity reset the stability streak', () => {
  const gate = new M.StabilityGate(); const a = M.match('C25804', index), b = M.match('C25744', index);
  assert.equal(gate.observe(a, 95), null); assert.equal(gate.observe(a, 74), null);
  assert.equal(gate.observe(a, 95), null); assert.equal(gate.observe(b, 95), null);
  assert.ok(gate.observe(b, 95));
});
