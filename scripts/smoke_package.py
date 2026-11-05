"""Smoke-test the manual ZIP as an isolated installation with any Python runtime."""
import argparse
import json
from pathlib import Path
import queue
import subprocess
import sys
import tempfile
import threading
from urllib.request import urlopen
import zipfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--python', default=sys.executable)
args = parser.parse_args()
version = json.loads((ROOT / 'package.json').read_text())['version']
with tempfile.TemporaryDirectory() as directory:
    with zipfile.ZipFile(ROOT / f'dist/bag-bom-{version}-manual.zip') as archive:
        archive.extractall(directory)
    process = subprocess.Popen([
        args.python, '-m', 'bag_bom', str(ROOT / 'tests/generated/demo.html'), '--no-browser',
    ], cwd=directory, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    lines = queue.Queue()
    threading.Thread(target=lambda: lines.put(process.stdout.readline()), daemon=True).start()
    try:
        url = lines.get(timeout=20).strip()
        if not url.startswith('http://127.0.0.1:'):
            raise RuntimeError('Packaged launcher did not return a loopback URL: ' + url)
        with urlopen(url, timeout=10) as response:
            assert b'bag-bom-root' in response.read()
        for asset in ('scanner.js', 'barcodes.js', 'barcode-worker.js', 'vendor/zxing-reader.js',
                      'vendor/zxing_reader.wasm', 'vendor/tesseract.min.js', 'vendor/eng.traineddata.gz'):
            with urlopen(url + 'assets/' + asset, timeout=10) as response:
                assert response.status == 200
        print('Isolated manual package: launch, HTML, JavaScript, barcode WASM, and OCR data passed.')
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
