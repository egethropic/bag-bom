/* SPDX-License-Identifier: Apache-2.0. Copyright 2026 egethropic. */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./matcher.js') : root.BagBomMatcher);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BagBomBarcodes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  const key = text => String(text).toLowerCase().replace(/[^a-z0-9]/g, '');
  function namespace(field) {
    const k = key(field);
    if (k.startsWith('lcsc')) return 'lcsc';
    if (k.startsWith('digikey')) return 'digikey';
    if (['mpn', 'manufacturerpartnumber', 'manufacturerpart', 'mfrpartnumber', 'mfrpart',
      'manfnum', 'manfpart', 'manfpartnumber', 'mfgpart', 'mfgpartnumber', 'partnumber'].includes(k)) return 'mpn';
    return k;
  }
  const valid = value => value.length >= 4 && value.length <= 100 && /\d/.test(value) && /^[A-Z0-9][A-Z0-9._/+()#-]*$/.test(value);
  function parse(payload) {
    if (typeof payload !== 'string' || payload.length > 10000) return [];
    // Preserve boundaries. Never mine order/lot/quantity fields for part-like text.
    const text = payload.trim().replace(/^\][A-Za-z][0-9]/, '')
      .replace(/␝|<GS>|\{GS\}/gi, '\x1d').replace(/␞|<RS>|\{RS\}/gi, '\x1e')
      .replace(/␄|<EOT>|\{EOT\}/gi, '\x04');
    const ids = [];
    const add = (type, value) => {
      value = M.normalize(value);
      if (valid(value)) ids.push({type, value});
    };
    if (text.startsWith('[)>') || /[\x1d\x1e]/.test(text)) {
      const records = text.split(/[\x1d\x1e\x04\r\n]/).map(record => record.trim());
      const hasSupplierField = records.some(record => record.startsWith('30P'));
      for (const record of records) {
        const field = record.trim();
        if (field.startsWith('1P')) add('mpn', field.slice(2));
        else if (field.startsWith('30P')) add('digikey', field.slice(3));
        // P is customer reference, not a reliable product identity. Older labels
        // use a DigiKey SKU here; accept only its recognizable complete -ND form.
        else if (!hasSupplierField && /^P[A-Z0-9][A-Z0-9.+/_-]*-ND$/i.test(field)) add('digikey', field.slice(1));
      }
    } else if (text.startsWith('{')) {
      // LCSC/JLCPCB use both JSON and unquoted {pc:C123,pm:MPN,...} records.
      let entries;
      try { entries = Object.entries(JSON.parse(text)); }
      catch (_) {
        if (!text.endsWith('}')) return [];
        entries = [...text.matchAll(/(?:\{|,)\s*([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*([^,{}]*)/g)].map(m => [m[1], m[2].trim()]);
      }
      for (const [field, value] of entries) {
        if (typeof value !== 'string') continue;
        if (key(field) === 'pc' && /^C\d+$/i.test(value.trim())) add('lcsc', value);
        if (key(field) === 'pm') add('mpn', value);
      }
    } else if (/^https?:\/\//i.test(text)) {
      // Only product codes in known LCSC product URLs. Never visit scanned URLs.
      try {
        const url = new URL(text);
        if (url.hostname === 'lcsc.com' || url.hostname.endsWith('.lcsc.com')) {
          const code = url.pathname.match(/(?:\/|_)(C\d+)(?:\.html)?\/?$/i);
          if (code) add('lcsc', code[1]);
        }
      } catch (_) { /* malformed URL */ }
    } else {
      // A raw 1D/2D product identifier must match the entire decoded string.
      add('any', text);
    }
    return ids.filter((id, i) => ids.findIndex(other => other.type === id.type && other.value === id.value) === i);
  }
  function match(payloads, index) {
    const labels = payloads.map(parse);
    const ids = labels.flat();
    let conflict = false;
    const groups = new Map();
    const supports = (code, id) => code.value === id.value && (code.type === 'any' || code.type === namespace(id.field));
    for (const label of labels) {
      if (label.some(code => code.type !== 'any') && !label.some(code => index.some(group => group.ids.some(id => supports(code, id))))) conflict = true;
    }
    for (const group of index) {
      const evidence = group.ids.filter(id => ids.some(code => supports(code, id)));
      if (!evidence.length) continue;
      for (const label of labels) {
        if (!label.some(code => group.ids.some(id => supports(code, id)))) continue;
        // A known SKU cannot override a contradicting MPN (or vice versa), even
        // if the contradictory number is absent from the board entirely.
        if (label.some(code => code.type !== 'any' && group.ids.some(id => namespace(id.field) === code.type) &&
          !group.ids.some(id => supports(code, id)))) conflict = true;
      }
      // Exact identical identifiers represent the same purchased part even when
      // values say RESET/BOOT, or footprints have different courtyard aliases.
      // Different MPN/SKU sets remain ambiguous; a barcode never overrides them.
      const identity = JSON.stringify(group.ids.map(id => [namespace(id.field), id.value]).sort());
      if (!groups.has(identity)) groups.set(identity, {group: {...group, key: 'barcode:' + identity, refs: []}, evidence: []});
      const entry = groups.get(identity);
      entry.group.refs.push(...group.refs);
      for (const id of evidence) if (!entry.evidence.some(e => e.field === id.field && e.value === id.value)) entry.evidence.push(id);
    }
    const exact = [...groups.values()];
    for (const {group} of exact) group.refs.sort((a, b) => a[0].localeCompare(b[0], undefined, {numeric: true}));
    return {status: exact.length === 1 && !conflict ? 'unique' : exact.length ? 'ambiguous' : 'none', exact, suggestions: [], identifiers: ids};
  }
  return {parse, match};
});
