import {mkdir, copyFile, readdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dest = path.join(root, 'bag_bom/web/vendor');
await mkdir(dest, {recursive: true});
const copy = (src, name) => copyFile(path.join(root, 'node_modules', src), path.join(dest, name));
await copy('zxing-wasm/dist/iife/reader/index.js', 'zxing-reader.js');
await copy('zxing-wasm/dist/reader/zxing_reader.wasm', 'zxing_reader.wasm');
await copy('zxing-wasm/LICENSE', 'ZXING-WASM-LICENSE.txt');
await copy('tesseract.js/dist/tesseract.min.js', 'tesseract.min.js');
await copy('tesseract.js/dist/worker.min.js', 'worker.min.js');
for (const file of await readdir(path.join(root, 'node_modules/tesseract.js-core'))) {
  if (/^tesseract-core.*\.wasm(\.js)?$/.test(file)) await copy(`tesseract.js-core/${file}`, file);
}
await copy('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz');
await copy('tesseract.js/LICENSE.md', 'TESSERACT-JS-LICENSE.txt');
await copy('tesseract.js-core/LICENSE', 'TESSERACT-CORE-LICENSE.txt');
for (const file of ['tesseract.min.js.LICENSE.txt', 'worker.min.js.LICENSE.txt']) {
  await copy('tesseract.js/dist/' + file, file);
}
for (const file of await readdir(path.join(root, 'third_party'))) {
  await copyFile(path.join(root, 'third_party', file), path.join(dest, file));
}
let notices = 'Runtime dependency licenses, including bundled JS dependencies.\n';
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
for (const [directory, entry] of Object.entries(lock.packages)) {
  if (!directory || entry.dev) continue;
  const dir = path.join(root, directory);
  notices += `\n--- ${directory} ${entry.version} (${entry.license || 'see license'}) ---\n`;
  for (const file of await readdir(dir)) {
    if (/^(licen[cs]e|copying|notice)([.-]|$)/i.test(file)) {
      notices += await readFile(path.join(dir, file), 'utf8') + '\n';
    }
  }
}
await writeFile(path.join(dest, 'BUNDLED-DEPENDENCIES.txt'), notices);
const dataLicense = await readFile(path.join(root, 'node_modules/@tesseract.js-data/eng/package.json'), 'utf8');
await writeFile(path.join(dest, 'LANGUAGE-DATA-NOTICE.txt'),
  'English Tesseract language data, from @tesseract.js-data/eng 1.0.0.\n' +
  'Source: https://github.com/naptha/tessdata\nLicense: Apache-2.0 (see TESSERACT-CORE-LICENSE.txt).\n' +
  'Package metadata:\n' + dataLicense);
console.log('Bundled offline barcode and OCR assets.');
