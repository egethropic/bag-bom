/* SPDX-License-Identifier: Apache-2.0. Copyright 2026 egethropic. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BagBomMatcher = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const fieldKey = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  const knownFields = new Set([
    'mpn', 'manufacturerpartnumber', 'manufacturerpart', 'mfrpartnumber', 'mfrpart',
    'manfnum', 'manfpart', 'manfpartnumber', 'mfgpart', 'mfgpartnumber', 'partnumber',
    'lcsc', 'lcscpart', 'lcscpartnumber', 'lcscnumber', 'lcscpn', 'lcscpartid',
    'digikey', 'digikeypart', 'digikeypartnumber', 'digikeypn',
    'mouser', 'mouserpart', 'mouserpartnumber', 'mouserpn', 'sku', 'supplierpartnumber',
  ]);
  const normalize = value => String(value ?? '').normalize('NFKC').toUpperCase()
    .replace(/[‐‑‒–—−]/g, '-').replace(/\s+/g, '').trim();
  function isIdentifier(value) {
    return value.length >= 4 && value.length <= 100 && /[0-9]/.test(value)
      && /^[A-Z0-9][A-Z0-9._/+()#-]*$/.test(value);
  }
  function defaultFields(fields) {
    return fields.filter(field => knownFields.has(fieldKey(field)));
  }
  function buildIndex(data, fields, enabledFields = defaultFields(fields)) {
    const enabled = new Set(enabledFields);
    const identifiers = fields.map((field, i) => enabled.has(field) ? i : -1).filter(i => i >= 0);
    const skipped = new Set(data.bom.skipped || []);
    const groups = new Map();
    const seen = new Set();
    for (const row of data.bom.both) {
      for (const [reference, id] of row) {
        if (seen.has(id) || skipped.has(id)) continue;
        seen.add(id);
        const values = data.bom.fields[id] || [];
        const ids = identifiers.map(i => ({field: fields[i], value: normalize(values[i])}))
          .filter(entry => isIdentifier(entry.value));
        if (!ids.length) continue;
        const value = String(values[fields.indexOf('Value')] || '');
        const footprint = String(values[fields.indexOf('Footprint')] || '');
        const key = JSON.stringify([ids, value, footprint]);
        if (!groups.has(key)) groups.set(key, {key, ids, value, footprint, refs: []});
        groups.get(key).refs.push([reference, id]);
      }
    }
    return [...groups.values()];
  }
  function tokens(text) {
    // Preserve suffixes, punctuation and O/0. Never match a substring of an ID.
    const upper = String(text).normalize('NFKC').toUpperCase().replace(/[‐‑‒–—−]/g, '-');
    return new Set((upper.match(/[A-Z0-9][A-Z0-9._/+()#-]*/g) || [])
      .map(s => s.replace(/[.,)]+$/, '')));
  }
  function oneEdit(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length >= b.length) i++;
      if (b.length >= a.length) j++;
    }
    return edits + (i < a.length || j < b.length ? 1 : 0) === 1;
  }
  function match(text, index) {
    const words = tokens(String(text).slice(0, 10000));
    const exact = [];
    const suggestions = [];
    for (const group of index) {
      const evidence = group.ids.filter(id => words.has(id.value));
      if (evidence.length) exact.push({group, evidence});
      else if (group.ids.some(id => id.value.length >= 6 &&
        [...words].some(word => word.length >= 6 && oneEdit(id.value, word)))) {
        suggestions.push({group, evidence: []});
      }
    }
    // Multiple identities in a label are ambiguous, even if one has more evidence.
    return {status: exact.length === 1 ? 'unique' : exact.length > 1 ? 'ambiguous' : 'none',
      exact, suggestions: suggestions.slice(0, 8)};
  }
  class StabilityGate {
    constructor(required = 2) { this.required = required; this.reset(); }
    reset() { this.key = null; this.count = 0; }
    observe(result, confidence) {
      if (result.status !== 'unique' || !Number.isFinite(confidence) || confidence < 75) { this.reset(); return null; }
      const group = result.exact[0].group;
      if (group.key === this.key) this.count++;
      else { this.key = group.key; this.count = 1; }
      return this.count >= this.required ? group : null;
    }
  }
  return {normalize, defaultFields, buildIndex, match, StabilityGate};
});
