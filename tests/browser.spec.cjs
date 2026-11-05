const {test, expect} = require('@playwright/test');
const {spawn} = require('node:child_process');
const fs = require('node:fs');
let server, url;
test.beforeAll(async () => {
  server = spawn(process.env.PYTHON || 'python', ['-m', 'bag_bom', 'tests/generated/demo.html', '--no-browser']);
  url = await new Promise((resolve, reject) => {
    let output = '';
    server.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/[^\s]+/); if (match) resolve(match[0]); });
    server.stderr.on('data', chunk => process.stderr.write(chunk));
    server.on('error', reject); server.on('exit', code => reject(new Error('server exited: ' + code)));
  });
});
test.afterAll(() => server?.kill());
test.beforeEach(async ({page}) => {
  await page.goto(url);
  await expect(page.locator('#bag-bom-root').locator('#status')).toContainText('3 part types ready');
});
async function find(page, text) {
  const host = page.locator('#bag-bom-root');
  await host.getByText('Label photo or text', {exact: true}).click();
  await host.locator('#text').fill(text);
  await host.getByRole('button', {name: 'Find part', exact: true}).click();
  return host;
}
test('real upstream viewer highlights exact IDs on both sides within a mixed group', async ({page}) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const host = await find(page, 'RC0603FR-0710KL');
  await host.locator('.candidate').click();
  expect(await page.evaluate(() => highlightedFootprints)).toEqual([0, 1]);
  expect(await page.evaluate(() => settings.canvaslayout)).toBe('FB');
  await expect(host.locator('#selected')).toContainText('R1, R2');
  expect(errors).toEqual([]);
  await page.screenshot({path: 'tests/generated/scanner.png'});
});
test('ambiguous text and near matches do not auto-select', async ({page}) => {
  const host = await find(page, 'C25804 C15401');
  await expect(host.locator('#status')).toContainText('Multiple matching');
  await expect(host.locator('.candidate')).toHaveCount(2);
  expect(await page.evaluate(() => highlightedFootprints)).toEqual([]);
  await host.locator('#text').fill('RC0603FR-O710KL');
  await host.locator('#match').click();
  await expect(host.locator('#status')).toContainText('No exact match');
  expect(await page.evaluate(() => highlightedFootprints)).toEqual([]);
});
test('front-only selection restores a filtered viewer and does not change placed checkboxes', async ({page}) => {
  await page.evaluate(() => { updateFilter('no matches'); changeBomLayout('bom-only'); });
  const host = await find(page, 'C15849');
  await host.locator('.candidate').click();
  expect(await page.evaluate(() => highlightedFootprints)).toEqual([3]);
  expect(await page.evaluate(() => settings.canvaslayout)).toBe('F');
  expect(await page.evaluate(() => settings.bomlayout)).toBe('left-right');
  expect(await page.locator('#bombody input:checked').count()).toBe(0);
});
test('real OCR reads photo using only bundled assets', async ({page, context}) => {
  const external = [];
  context.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(new URL(url).origin)) external.push(request.url()); });
  const host = page.locator('#bag-bom-root');
  await host.getByText('Label photo or text', {exact: true}).click();
  await host.locator('#photo').setInputFiles('tests/generated/label.png');
  await expect(host.locator('#status')).toContainText('Exact match found', {timeout: 45000});
  // OCR may misread the MPN; an independently exact supplier ID must still work.
  await expect(host.locator('#text')).toHaveValue(/C25804/);
  await host.locator('.candidate').click();
  expect(await page.evaluate(() => highlightedFootprints)).toEqual([0, 1]);
  expect(external).toEqual([]);
});
test('fake webcam passes real OCR stability gate and Stop releases tracks', async ({page}) => {
  const host = page.locator('#bag-bom-root');
  await host.locator('#start').click();
  await expect(host.locator('#selected')).toContainText('R1, R2', {timeout: 50000});
  expect(await page.evaluate(() => highlightedFootprints)).toEqual([0, 1]);
  await page.evaluate(() => { window.testTracks = document.getElementById('bag-bom-root').shadowRoot.getElementById('video').srcObject.getTracks(); });
  await page.screenshot({path: 'tests/generated/camera.png'});
  await host.locator('#stop').click();
  expect(await page.evaluate(() => testTracks.every(track => track.readyState === 'ended'))).toBe(true);
  await expect(host.locator('#status')).toContainText('Camera stopped');
});
test('auto-select can be disabled while camera continues finding candidates', async ({page}) => {
  const host = page.locator('#bag-bom-root');
  await host.locator('#auto').uncheck();
  await host.locator('#start').click();
  await expect(host.locator('.candidate')).toHaveCount(1, {timeout: 45000});
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => highlightedFootprints)).toEqual([]);
  await host.locator('#collapse').click();
  await expect(host.locator('#body')).toBeHidden();
  expect(await host.locator('#video').evaluate(video => video.srcObject)).toBeNull();
});
test('camera permission error provides photo/text fallback', async ({page}) => {
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
  const host = page.locator('#bag-bom-root'); await host.locator('#start').click();
  await expect(host.locator('#status')).toContainText('permission was denied');
  await expect(host.locator('#start')).toBeEnabled();
});
test('stop during OCR initialization then restart does not select a stale result or hang', async ({page}) => {
  const host = page.locator('#bag-bom-root');
  let once = true;
  await page.route('**/vendor/worker.min.js', async route => {
    if (once) { once = false; await new Promise(resolve => setTimeout(resolve, 1200)); }
    await route.continue();
  });
  await host.locator('#start').click();
  await expect(host.locator('#status')).toContainText('Loading local OCR');
  await host.locator('#stop').click();
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => highlightedFootprints)).toEqual([]);
  await host.locator('#start').click();
  await expect(host.locator('#selected')).toContainText('R1, R2', {timeout: 45000});
});
test('malformed image reports an error and text matching remains available', async ({page}) => {
  const host = page.locator('#bag-bom-root');
  await host.getByText('Label photo or text', {exact: true}).click();
  await host.locator('#photo').setInputFiles({name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('invalid image')});
  await expect(host.locator('#status')).toContainText('Image could not be read', {timeout: 45000});
  await host.locator('#text').fill('C25804'); await host.locator('#match').click();
  await expect(host.locator('.candidate')).toHaveCount(1);
});
test('mobile panel can be minimized to reveal the full viewer', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  const host = page.locator('#bag-bom-root');
  await host.locator('#collapse').click();
  await expect(host.locator('#body')).toBeHidden();
  await page.screenshot({path: 'tests/generated/mobile.png'});
});
