/* SPDX-License-Identifier: Apache-2.0. Copyright 2026 egethropic. */
(() => {
  'use strict';
  const host = document.getElementById('bag-bom-root');
  const base = new URL(host.dataset.assets, location.href).href;
  const M = window.BagBomMatcher;
  const B = window.BagBomBarcodes;
  const root = host.attachShadow({mode: 'open'});
  root.innerHTML = `
    <link rel="stylesheet" href="${base}scanner.css">
    <aside aria-label="Bag BOM scanner">
      <header><div><small>EGETHROPIC / ASSEMBLY</small><h1>Bag BOM<span>0.3.0</span></h1></div>
        <button id="collapse" class="icon" aria-label="Minimize scanner" title="Minimize scanner">−</button></header>
      <div id="body">
        <p class="intro">From the bag to the board.</p>
        <div class="viewfinder"><video id="video" muted playsinline aria-label="Camera preview"></video>
          <div id="guide"><span>Place one label in the frame</span></div>
          <div id="camera-off"><b>Ready at your workbench</b><span>Show the QR code. Find its place.</span></div>
          <span class="local" id="scan-badge">LOCAL QR / BARCODE</span>
        </div>
        <label class="field-label" for="mode">Read</label>
        <select id="mode"><option value="barcode">QR / Data Matrix / barcode</option><option value="ocr">Printed text (OCR fallback)</option></select>
        <label class="field-label" for="camera">Camera</label>
        <select id="camera"><option value="">Default camera</option></select>
        <div class="actions"><button id="start" class="primary">Start camera</button><button id="stop" disabled>Stop</button></div>
        <label class="toggle" id="auto-control" hidden><input type="checkbox" id="auto" checked> Auto-select stable OCR matches</label>
        <p class="hint" id="mode-hint">Show the square product code. A matching tag selects its parts immediately—no selection button.</p>
        <div id="detected" hidden></div>
        <div id="scan-state" class="hint"></div>
        <div id="status" role="status" aria-live="polite">Loading the BOM…</div>
        <div id="selected" hidden></div>
        <div id="results" aria-label="Matching components"></div>
        <details><summary>Label photo or text</summary>
          <label class="field-label" for="photo">Read a saved label image</label>
          <input id="photo" type="file" accept="image/png,image/jpeg,image/webp">
          <label class="field-label" for="text">Decoded code / recognized text</label>
          <textarea id="text" rows="4" placeholder="Decoded label data appears here"></textarea>
          <button id="match">Find part</button>
        </details>
        <details><summary>Matching fields <span id="field-count"></span></summary>
          <p class="hint">Choose columns containing exact part numbers. Include these columns when exporting with InteractiveHtmlBom.</p>
          <div id="fields"></div>
        </details>
        <footer>Camera frames stay in this browser.<br>No accounts. No uploads. No cloud OCR.</footer>
      </div>
    </aside>`;
  const $ = id => root.getElementById(id);
  // Keep iBOM's global keyboard shortcuts out of scanner inputs.
  root.addEventListener('keydown', event => event.stopPropagation());
  const layout = document.createElement('style');
  layout.textContent = `body.bag-bom-open #topmostdiv {width:calc(100% - 364px)!important}
    #bag-bom-root {position:fixed;right:0;top:0;width:364px;height:100dvh;z-index:10000}
    #bag-bom-root.bag-bom-mini {height:auto;width:180px}
    @media(max-width:800px){body.bag-bom-open #topmostdiv {width:100%!important}
      #bag-bom-root {width:min(364px,100vw);box-shadow:-8px 0 30px #0005}}
    @media print {#bag-bom-root{display:none}body.bag-bom-open #topmostdiv{width:100%!important}}`;
  document.head.append(layout);
  document.body.classList.add('bag-bom-open');

  let index = [], ready = false, stream = null, workerPromise = null;
  let epoch = 0, timer = null, busy = false, lastAuto = null;
  let lastCodeStatus = null;
  let ocrQueue = Promise.resolve();
  let decoder = null, decodeId = 0;
  const decodeJobs = new Map();
  const gate = new M.StabilityGate(2);
  const errorMessage = error => error?.message || String(error);
  const setStatus = (text, kind = '') => { $('status').textContent = text; $('status').dataset.kind = kind; };
  function rebuildIndex() {
    index = M.buildIndex(pcbdata, config.fields,
      [...$('fields').querySelectorAll('input:checked')].map(input => input.value));
    gate.reset(); lastAuto = null;
    lastCodeStatus = null; $('detected').hidden = true;
    $('results').replaceChildren();
    $('field-count').textContent = `(${index.length} part types)`;
    setStatus(index.length ? `${index.length} part types ready. Start the camera or paste a label.` :
      'No part numbers found. Export MPN or supplier fields with InteractiveHtmlBom, then open that HTML.', index.length ? '' : 'warning');
  }
  function init() {
    const required = ['createRowHighlightHandler', 'clearHighlightedFootprints', 'drawHighlights',
      'changeCanvasLayout', 'changeBomLayout', 'changeBomMode', 'updateFilter', 'updateRefLookup'];
    if (typeof pcbdata === 'undefined' || typeof config === 'undefined' || !Array.isArray(config.fields)
      || !pcbdata.bom?.both || required.some(name => typeof window[name] !== 'function')) {
      setStatus('Unsupported InteractiveHtmlBom export. Regenerate it with InteractiveHtmlBom 2.10 or later.', 'error');
      $('start').disabled = true; $('match').disabled = true; $('photo').disabled = true;
      return;
    }
    for (const field of config.fields) {
      if (['Value', 'Footprint'].includes(field)) continue;
      const label = document.createElement('label'); label.className = 'toggle';
      const input = document.createElement('input'); input.type = 'checkbox'; input.value = field;
      input.checked = M.defaultFields([field]).length > 0;
      input.addEventListener('change', rebuildIndex);
      label.append(input, document.createTextNode(field)); $('fields').append(label);
    }
    ready = true; rebuildIndex(); window.dispatchEvent(new Event('resize'));
  }
  function select(group, automatic = false) {
    try {
      const layers = new Set(group.refs.map(([, id]) => pcbdata.footprints[id].layer));
      if (settings.bomlayout === 'bom-only') changeBomLayout('left-right');
      // Reset filters before finding rows. Never use a text search as selection.
      $('results').querySelectorAll('button').forEach(button => button.classList.remove('chosen'));
      document.getElementById('filter').value = '';
      document.getElementById('reflookup').value = '';
      updateFilter(''); updateRefLookup('');
      changeBomMode('grouped');
      changeCanvasLayout(layers.size > 1 ? 'FB' : [...layers][0]);
      const handler = footprintIndexToHandler[group.refs[0][1]];
      if (!handler) throw new Error('The matching footprint is not available in the BOM table.');
      handler();
      const rowid = currentHighlightedRowId;
      clearHighlightedFootprints();
      createRowHighlightHandler(rowid, group.refs, null)();
      document.getElementById(rowid)?.scrollIntoView({block: 'nearest'});
      $('selected').hidden = false;
      $('selected').textContent = `Selected ${group.refs.map(r => r[0]).join(', ')} · ${group.ids[0].value}`;
      setStatus(typeof automatic === 'string' ? automatic : automatic ? 'Selected from two consistent label reads.' : 'Selected on the board.', 'success');
      lastAuto = group.key;
    } catch (error) { setStatus(`Could not highlight: ${error.message}`, 'error'); }
  }
  function showResult(text, {confidence = 100, live = false, barcode = false, payloads = [text]} = {}) {
    const result = barcode ? B.match(payloads, index) : M.match(text, index);
    if (barcode) {
      const typed = result.identifiers.filter(id => id.type !== 'any');
      const ids = [...new Set((typed.length ? typed : result.identifiers).map(id => id.value))];
      $('detected').hidden = false;
      $('detected').textContent = `Tag detected: ${ids.length ? ids.join(' · ') : 'unrecognized product data'}`;
    }
    $('results').replaceChildren();
    const matches = result.exact.length ? result.exact : result.suggestions;
    for (const {group, evidence} of matches.slice(0, 12)) {
      const automatic = barcode && result.status === 'unique';
      const button = document.createElement(automatic ? 'div' : 'button'); button.className = 'candidate';
      const title = document.createElement('b'); title.textContent = evidence[0]?.value || group.ids[0].value;
      const refs = document.createElement('span'); refs.textContent = group.refs.map(r => r[0]).join(', ');
      const detail = document.createElement('small'); detail.textContent = `${group.value} · ${group.footprint}`;
      const reason = document.createElement('small'); reason.textContent = evidence.length ?
        `Exact ${evidence.map(item => item.field).join(' + ')}` : 'Similar text only — check label before selecting';
      button.append(title, refs, detail, reason);
      if (!automatic) button.addEventListener('click', () => { select(group); button.classList.add('chosen'); });
      $('results').append(button);
    }
    if (result.status === 'ambiguous') setStatus('Multiple matching part types. Choose the correct one below.', 'warning');
    else if (result.status === 'none' && barcode) setStatus(result.identifiers.length ?
      'Code read, but its MPN or supplier number is not in this BOM. Include that identifier when exporting.' :
      'Code read, but no supported part identifier found. Aim at the product’s square code, or try printed-text mode.');
    else if (result.status === 'none') setStatus(result.suggestions.length ?
      'No exact match. Similar numbers below require your confirmation.' :
      'No exact part number found. Hold the label closer or check the matching fields.');
    else setStatus(live ? 'Exact match found. Hold steady for a second read.' : 'Exact match found. Select it below.');
    if (barcode && result.status === 'unique') {
      // Barcode checksums already validate a decoded tag. Select on its FIRST
      // frame, independent of the optional OCR stability gate and toggle.
      const group = result.exact[0].group;
      const actual = new Set(window.highlightedFootprints || []);
      if (lastAuto !== group.key || actual.size !== group.refs.length || group.refs.some(([, id]) => !actual.has(id))) {
        select(group, 'Selected from QR / barcode.');
      } else setStatus('Selected from QR / barcode.', 'success');
    } else if (live && !barcode) {
      const stable = gate.observe(result, confidence);
      if (stable && $('auto').checked) {
        if (stable.key !== lastAuto) select(stable, barcode ? 'Selected from QR / barcode.' : true);
        else setStatus('Label matches the last selected part.', 'success');
      } else if (result.status === 'unique' && confidence < 75) {
        setStatus('Exact text, but OCR confidence is low. Hold steady or select manually.', 'warning');
      }
    }
    if (barcode) lastCodeStatus = {text: $('status').textContent, kind: $('status').dataset.kind};
    return result;
  }
  function releaseDecoder() {
    decoder?.terminate(); decoder = null;
    for (const job of decodeJobs.values()) { clearTimeout(job.timeout); job.reject(new Error('Barcode scan stopped.')); }
    decodeJobs.clear();
  }
  function decode(canvas) {
    if (!decoder) {
      decoder = new Worker(base + 'barcode-worker.js');
      decoder.onmessage = ({data}) => {
        const job = decodeJobs.get(data.id); if (!job) return;
        clearTimeout(job.timeout); decodeJobs.delete(data.id);
        if (data.error) job.reject(new Error(data.error)); else job.resolve(data.results);
      };
      decoder.onerror = () => {
        for (const job of decodeJobs.values()) { clearTimeout(job.timeout); job.reject(new Error('Barcode assets could not load. Reinstall the release ZIP.')); }
        decodeJobs.clear(); decoder?.terminate(); decoder = null;
      };
    }
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.buffer;
    return new Promise((resolve, reject) => {
      const id = ++decodeId;
      const timeout = setTimeout(() => { releaseDecoder(); }, 20000);
      decodeJobs.set(id, {resolve, reject, timeout});
      decoder.postMessage({id, pixels, width: canvas.width, height: canvas.height}, [pixels]);
    });
  }
  function showCodes(codes, live = false) {
    if (!codes.length) {
      gate.reset();
      $('scan-state').textContent = live ? 'Scanning… Last detected tag stays visible below.' : 'No code found in this image.';
      // A missed frame must not immediately erase a successful read or the
      // explanation of why a decoded tag could not match the current board.
      if (lastCodeStatus) setStatus(lastCodeStatus.text, lastCodeStatus.kind);
      else setStatus('No QR / barcode detected yet. Keep the complete square code in focus in the camera view.');
      return;
    }
    $('scan-state').textContent = live ? 'Scanning…' : 'Label image decoded.';
    const payloads = [...new Set(codes.map(code => code.text))];
    $('text').value = payloads.join('\n');
    showResult('', {barcode: true, payloads, live});
  }
  async function imageCanvas(file) {
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas;
    } finally { bitmap.close(); }
  }
  async function loadWorker() {
    if (!workerPromise) {
      workerPromise = (async () => {
        if (!window.Tesseract) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script'); script.src = base + 'vendor/tesseract.min.js';
            script.onload = resolve; script.onerror = () => { script.remove(); reject(new Error('OCR assets missing. Install the release ZIP, or run npm run vendor.')); };
            document.head.append(script);
          });
        }
        const worker = await Tesseract.createWorker('eng', 1, {
          workerPath: base + 'vendor/worker.min.js',
          corePath: base + 'vendor', langPath: base + 'vendor',
          workerBlobURL: false, gzip: true,
          errorHandler: () => {}, // Promise rejections are displayed in the status panel.
        });
        await worker.setParameters({tessedit_pageseg_mode: '11'});
        return worker;
      })();
      const pending = workerPromise;
      pending.catch(() => { if (workerPromise === pending) workerPromise = null; });
    }
    return workerPromise;
  }
  async function releaseWorker() {
    const previous = workerPromise; workerPromise = null;
    const pendingJob = ocrQueue;
    if (previous) {
      try {
        // Tesseract terminate does not reject outstanding jobs; let them settle first.
        await pendingJob.catch(() => {});
        await (await previous).terminate();
      } catch (_) { /* failed initialization */ }
    }
  }
  function recognize(source, turn) {
    // Photo changes and camera restarts must not run simultaneous jobs on one worker.
    const job = ocrQueue.catch(() => {}).then(async () => {
      if (turn !== epoch) return null;
      const worker = await loadWorker();
      if (turn !== epoch) return null;
      return worker.recognize(source);
    });
    ocrQueue = job;
    return job;
  }
  function stopCamera(message = 'Camera stopped. You can still match a photo or pasted text.') {
    epoch++; clearTimeout(timer); timer = null; gate.reset(); lastAuto = null;
    releaseDecoder();
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null; $('video').srcObject = null;
    $('camera-off').hidden = false; $('start').disabled = !ready; $('stop').disabled = true;
    if (message) setStatus(message);
  }
  function capture() {
    const video = $('video');
    if (!video.videoWidth) throw new Error('Camera has not produced a frame yet.');
    const canvas = document.createElement('canvas');
    // QR/Data Matrix require the complete symbol and border. Do not discard the
    // outer camera area: large labels often put the square code near an edge.
    const barcode = $('mode').value === 'barcode';
    const sx = barcode ? 0 : video.videoWidth * 0.05, sy = barcode ? 0 : video.videoHeight * 0.2;
    const sw = barcode ? video.videoWidth : video.videoWidth * 0.9, sh = barcode ? video.videoHeight : video.videoHeight * 0.6;
    const scale = Math.min(barcode ? 1 : 2, (barcode ? 4096 : 1920) / sw);
    canvas.width = Math.round(sw * scale); canvas.height = Math.round(sh * scale);
    const ctx = canvas.getContext('2d');
    if ($('mode').value === 'ocr') ctx.filter = 'grayscale(1) contrast(1.25)';
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  async function scan(turn) {
    if (turn !== epoch || !stream) return;
    if (busy) { timer = setTimeout(() => scan(turn), 250); return; }
    busy = true;
    try {
      if ($('mode').value === 'barcode') {
        const codes = await decode(capture());
        if (turn === epoch) showCodes(codes, true);
      } else {
        const result = await recognize(capture(), turn);
        if (turn !== epoch || !result) return;
        const {data} = result;
        $('text').value = data.text;
        showResult(data.text, {confidence: data.confidence, live: true});
      }
    } catch (error) {
      if (turn === epoch) { stopCamera(`Scan failed: ${errorMessage(error)}`); releaseWorker(); }
    } finally {
      busy = false;
      if (turn === epoch && stream) timer = setTimeout(() => scan(turn), $('mode').value === 'barcode' ? 180 : 650);
    }
  }
  async function enumerateCameras() {
    const chosen = $('camera').value;
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput');
    $('camera').replaceChildren(new Option('Default camera', ''));
    for (const device of devices) $('camera').append(new Option(device.label || `Camera ${$('camera').options.length}`, device.deviceId));
    $('camera').value = chosen;
  }
  async function startCamera() {
    stopCamera('Requesting camera permission…');
    const turn = epoch;
    $('start').disabled = true; $('stop').disabled = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable. Open this page through the Bag BOM launcher on localhost.');
      const deviceId = $('camera').value;
      const media = await navigator.mediaDevices.getUserMedia({audio: false, video: {
        width: {ideal: 1920}, height: {ideal: 1080},
        ...(deviceId ? {deviceId: {exact: deviceId}} : {facingMode: {ideal: 'environment'}}),
      }});
      if (turn !== epoch) { media.getTracks().forEach(track => track.stop()); return; }
      stream = media; $('video').srcObject = media; await $('video').play();
      if (turn !== epoch) return;
      root.querySelector('.viewfinder').style.aspectRatio = `${$('video').videoWidth} / ${$('video').videoHeight}`;
      $('camera-off').hidden = true;
      media.getVideoTracks()[0].addEventListener('ended', () => { if (turn === epoch) stopCamera('Camera disconnected. Reconnect it and start again.'); });
      await enumerateCameras();
      setStatus($('mode').value === 'barcode' ? 'Reading QR / Data Matrix codes locally…' : 'Loading local OCR. First start may take a few seconds…');
      scan(turn);
    } catch (error) {
      if (turn === epoch) stopCamera(error.name === 'NotAllowedError' ?
        'Camera permission was denied. Allow it in your browser, or use a label photo or text.' : `Camera unavailable: ${error.message}`);
    }
  }
  $('start').addEventListener('click', startCamera);
  $('stop').addEventListener('click', () => { stopCamera(); releaseWorker(); });
  $('camera').addEventListener('change', () => { if (stream) startCamera(); });
  $('mode').addEventListener('change', () => {
    const restart = !!stream;
    stopCamera(null); releaseWorker();
    $('scan-badge').textContent = $('mode').value === 'barcode' ? 'LOCAL QR / BARCODE' : 'LOCAL OCR';
    $('auto-control').hidden = $('mode').value === 'barcode';
    $('mode-hint').textContent = $('mode').value === 'barcode' ?
      'Show the square product code. A matching tag selects its parts immediately—no selection button.' :
      'Printed text needs two consistent, confident reads. Ambiguous matches stay manual.';
    $('detected').hidden = true; $('scan-state').textContent = ''; lastCodeStatus = null;
    $('results').replaceChildren(); $('text').value = '';
    if (restart) startCamera();
    else setStatus('Ready. Start the camera or choose a label image.');
  });
  $('auto').addEventListener('change', () => { gate.reset(); lastAuto = null; });
  $('match').addEventListener('click', () => {
    stopCamera(null); gate.reset(); showResult($('text').value, {barcode: $('mode').value === 'barcode'});
  });
  $('text').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('match').click(); }
  });
  $('photo').addEventListener('change', async () => {
    const file = $('photo').files[0]; if (!file) return;
    stopCamera(null); const turn = epoch;
    if (file.size > 20 * 1024 * 1024) { setStatus('Choose an image smaller than 20 MiB.', 'error'); return; }
    setStatus('Reading label image locally…');
    $('photo').disabled = true;
    try {
      if ($('mode').value === 'barcode') {
        const canvas = await imageCanvas(file);
        if (turn !== epoch) return;
        const codes = await decode(canvas);
        if (turn === epoch) showCodes(codes);
      } else {
        const result = await recognize(file, turn);
        if (turn === epoch && result) { $('text').value = result.data.text; showResult(result.data.text); }
      }
    } catch (error) { if (turn === epoch) setStatus(`Image could not be read: ${errorMessage(error)}`, 'error'); }
    finally { $('photo').disabled = false; $('photo').value = ''; }
  });
  $('collapse').addEventListener('click', () => {
    const minimized = !$('body').hidden;
    $('body').hidden = minimized;
    host.classList.toggle('bag-bom-mini', minimized);
    document.body.classList.toggle('bag-bom-open', !minimized);
    $('collapse').textContent = minimized ? '+' : '−';
    $('collapse').setAttribute('aria-label', minimized ? 'Expand scanner' : 'Minimize scanner');
    if (minimized) { stopCamera(); releaseWorker(); }
    window.dispatchEvent(new Event('resize'));
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stopCamera(); releaseWorker(); } });
  window.addEventListener('pagehide', () => { stopCamera(null); releaseWorker(); });
  setInterval(() => fetch(new URL('../ping', base)).catch(() => {
    stopCamera('Local session ended. Reopen Bag BOM from KiCad or the command line.');
  }), 30000);
  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init, {once: true});
})();
