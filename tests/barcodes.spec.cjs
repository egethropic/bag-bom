const {test, expect, chromium} = require('@playwright/test');
const {spawn} = require('node:child_process');
const path = require('node:path');
let server, url;
test.beforeAll(async () => {
  server = spawn(process.env.PYTHON || 'python', ['-m', 'bag_bom', 'tests/generated/demo.html', '--no-browser']);
  url = await new Promise((resolve, reject) => {
    let output = '';
    server.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/[^\s]+/); if (match) resolve(match[0]); });
    server.on('error', reject); server.on('exit', code => reject(Error('server exited: ' + code)));
  });
});
test.afterAll(() => server?.kill());
test.beforeEach(async ({page}) => {
  await page.goto(url);
  await expect(page.locator('#bag-bom-root').locator('#status')).toContainText('3 part types ready');
});
async function photo(page, name) {
  const host = page.locator('#bag-bom-root');
  await host.getByText('Label photo or text', {exact: true}).click();
  await host.locator('#photo').setInputFiles('tests/generated/' + name + '.png');
  return host;
}
test('LCSC QR photo decodes locally and automatically selects all exact footprint IDs', async ({page, context}) => {
  const external = [], requests = [], errors = [];
  context.on('request', req => { requests.push(req.url()); if (/^https?:/.test(req.url()) && new URL(req.url()).origin !== new URL(url).origin) external.push(req.url()); });
  page.on('pageerror', e => errors.push(e.message));
  const host = await photo(page, 'lcsc-qr');
  await expect(host.locator('#status')).toHaveText('Selected from QR / barcode.');
  expect(await page.evaluate(() => highlightedFootprints)).toEqual([0, 1]);
  expect(await page.evaluate(() => settings.canvaslayout)).toBe('FB');
  expect(await page.locator('#bombody input:checked').count()).toBe(0);
  expect(external).toEqual([]); expect(errors).toEqual([]);
  expect(requests.some(url => url.includes('zxing_reader.wasm'))).toBe(true);
  expect(requests.some(url => /tesseract|traineddata/.test(url))).toBe(false);
});
test('DigiKey Data Matrix photo extracts 1P MPN through real decoder', async ({page}) => {
  const host = await photo(page, 'digikey-dm');
  await expect(host.locator('#selected')).toContainText('R1, R2');
  await expect(host.locator('#text')).toHaveValue(/1PRC0603FR-0710KL/);
  expect(await page.evaluate(() => highlightedFootprints)).toEqual([0, 1]);
});
test('two different QR codes in one frame never select a part automatically', async ({page}) => {
  const host = await photo(page, 'multiple-qr');
  await expect(host.locator('#status')).toContainText('Multiple matching');
  await expect(host.locator('.candidate')).toHaveCount(2);
  expect(await page.evaluate(() => highlightedFootprints)).toEqual([]);
});
test('unknown supplier code explains missing BOM identifiers', async ({page}) => {
  const host = await photo(page, 'unknown-qr');
  await expect(host.locator('#status')).toContainText('not in this BOM');
  expect(await page.evaluate(() => highlightedFootprints)).toEqual([]);
  await host.locator('#photo').setInputFiles('tests/generated/label.png');
  await expect(host.locator('#scan-state')).toHaveText('No code found in this image.');
  await expect(host.locator('#status')).toContainText('not in this BOM');
  await expect(host.locator('#detected')).toContainText('UNKNOWN123');
});
test('QR selection is immediate even if the OCR toggle is off, with no selection button', async ({page}) => {
  const host = page.locator('#bag-bom-root');
  await expect(host.locator('#auto-control')).toBeHidden();
  await host.locator('#auto').evaluate(input => { input.checked = false; });
  await photo(page, 'lcsc-qr');
  await expect(host.locator('.candidate')).toHaveCount(1);
  await expect(host.locator('button.candidate')).toHaveCount(0);
  expect(await page.evaluate(() => highlightedFootprints)).toEqual([0, 1]);
});
test('keyboard barcode input auto-selects and ignores customer-reference fields', async ({page}) => {
  const host = page.locator('#bag-bom-root');
  await host.getByText('Label photo or text', {exact: true}).click();
  await host.locator('#text').fill('[)>\x1e06\x1dPC15849\x1d1PRC0603FR-0710KL\x1dQ10\x1e\x04');
  await host.locator('#text').press('Enter');
  await expect(host.locator('#selected')).toContainText('R1, R2');
  expect(await page.evaluate(() => highlightedFootprints)).toEqual([0, 1]);
});
test('no code in an image does not silently switch to OCR', async ({page}) => {
  const host = await photo(page, 'label');
  await expect(host.locator('#status')).toContainText('No QR / barcode detected');
  expect(await page.evaluate(() => highlightedFootprints)).toEqual([]);
});
test('stop during decoder loading cancels selection and restart works', async ({page}) => {
  let once = true;
  await page.route('**/barcode-worker.js', async route => {
    if (once) { once = false; await new Promise(resolve => setTimeout(resolve, 1000)); }
    await route.continue();
  });
  const host = await photo(page, 'lcsc-qr');
  // Changing mode cancels the outstanding image decode and its epoch.
  await host.locator('#mode').selectOption('ocr');
  await expect(host.locator('#photo')).toBeEnabled();
  expect(await page.evaluate(() => highlightedFootprints)).toEqual([]);
  await host.locator('#mode').selectOption('barcode');
  await host.locator('#photo').setInputFiles('tests/generated/lcsc-qr.png');
  await expect(host.locator('#selected')).toContainText('R1, R2');
});
for (const fixture of ['mouser-dm', 'newark-dm', 'arrow-pdf417', 'mouser-qr', 'newark-qr', 'arrow-qr', 'farnell-qr', 'element14-qr']) {
  test(fixture + ' photo decodes and selects without a selection button or network lookup', async ({page, context}) => {
    const external = [];
    context.on('request', req => { if (/^https?:/.test(req.url()) && new URL(req.url()).origin !== new URL(url).origin) external.push(req.url()); });
    const host = await photo(page, fixture);
    await expect(host.locator('#status')).toHaveText('Selected from QR / barcode.');
    expect(await page.evaluate(() => highlightedFootprints)).toEqual([0, 1]);
    await expect(host.locator('button.candidate')).toHaveCount(0);
    expect(external).toEqual([]);
  });
}

test('Newark SKU with conflicting manufacturer part never auto-selects', async ({page}) => {
  const host = await photo(page, 'vendor-conflict-dm');
  await expect(host.locator('#status')).toContainText('Multiple matching');
  expect(await page.evaluate(() => highlightedFootprints)).toEqual([]);
});

for (const fixture of ['lcsc-qr', 'digikey-dm', 'lcsc-qr-edge', 'mouser-dm', 'newark-dm', 'arrow-pdf417']) {
    test(fixture + ' webcam: one decoded frame auto-selects and survives later missed frames', async () => {
      const browser = await chromium.launch({headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
        `--use-file-for-fake-video-capture=${path.resolve('tests/generated/' + fixture + '.y4m')}`]});
      try {
      const page = await browser.newPage({viewport: {width: 1500, height: 1000}});
      // Let the real decoder return just one successful frame. Subsequent
      // misses reproduce a hand-held label briefly moving out of focus.
      await page.route('**/barcode-worker.js', async route => {
        const response = await route.fetch();
        await route.fulfill({response, body: await response.text() + `
const sendResult = self.postMessage.bind(self); let delivered = false;
self.postMessage = data => {
  if (data.results?.length) {
    if (delivered) data.results = []; else delivered = true;
  }
  sendResult(data);
};`});
      });
      await page.goto(url);
      const host = page.locator('#bag-bom-root');
      await expect(host.locator('#status')).toContainText('3 part types ready');
      await host.locator('#start').click();
      await expect(host.locator('#selected')).toContainText('R1, R2', {timeout: 20000});
      expect(await page.evaluate(() => highlightedFootprints)).toEqual([0, 1]);
      await expect(host.locator('#scan-state')).toContainText('Last detected tag stays visible');
      const detected = {'mouser-dm': '603-DEMO100', 'newark-dm': '12AB3456', 'arrow-pdf417': 'ARROW-DEMO100'};
      await expect(host.locator('#detected')).toContainText(detected[fixture] || 'RC0603FR-0710KL');
      await expect(host.locator('#status')).toHaveText('Selected from QR / barcode.');
      await expect(host.locator('button.candidate')).toHaveCount(0);
      await page.evaluate(() => { window.testTracks = document.getElementById('bag-bom-root').shadowRoot.getElementById('video').srcObject.getTracks(); });
      await page.screenshot({path: `tests/generated/${fixture}-scanner.png`});
      await host.locator('#stop').click();
      expect(await page.evaluate(() => testTracks.every(track => track.readyState === 'ended'))).toBe(true);
      expect(await host.locator('#video').evaluate(video => video.srcObject)).toBeNull();
      } finally { await browser.close(); }
    });
}
