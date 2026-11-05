const {defineConfig} = require('@playwright/test');
const path = require('node:path');
module.exports = defineConfig({
  testDir: './tests', testMatch: '*.spec.cjs', timeout: 60000, workers: 1,
  use: {headless: true, viewport: {width: 1500, height: 1000},
    launchOptions: {args: [
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${path.resolve('tests/generated/label.y4m')}`,
    ]}},
});
