"""Deterministic PCM and manual install ZIPs; never includes user boards."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def build():
    metadata = json.loads((ROOT / 'metadata.json').read_text())
    version = metadata['versions'][0]['version']
    package_version = json.loads((ROOT / 'package.json').read_text())['version']
    if version != package_version:
        raise SystemExit('metadata.json and package.json versions must agree')
    plugin = ROOT / 'bag_bom'
    if not all((plugin / ('web/vendor/' + name)).is_file() for name in
               ('eng.traineddata.gz', 'zxing-reader.js', 'zxing_reader.wasm')):
        raise SystemExit('Run npm ci and npm run vendor first')
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    files = [(path.relative_to(plugin).as_posix(), path.read_bytes())
             for path in sorted(plugin.rglob('*')) if path.is_file()
             and '__pycache__' not in path.parts and path.suffix != '.pyc']
    for name in ('LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'README.md'):
        files.append((name, (ROOT / name).read_bytes()))

    def write_zip(path, entries):
        with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name, data in sorted(entries):
                info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.create_system = 3
                info.external_attr = 0o644 << 16
                archive.writestr(info, data)

    pcm = dist / f'bag-bom-{version}-pcm.zip'
    write_zip(pcm, [('plugins/' + name, data) for name, data in files] + [
        ('metadata.json', json.dumps(metadata, indent=2).encode()),
        ('resources/icon.png', (ROOT / 'resources/icon.png').read_bytes()),
    ])
    manual = dist / f'bag-bom-{version}-manual.zip'
    write_zip(manual, [('bag_bom/' + name, data) for name, data in files])
    release_meta = json.loads(json.dumps(metadata))
    release_meta['versions'][0].update({
        'download_url': f'https://github.com/egethropic/bag-bom/releases/download/v{version}/{pcm.name}',
        'download_sha256': hashlib.sha256(pcm.read_bytes()).hexdigest(),
        'download_size': pcm.stat().st_size,
        'install_size': sum(len(data) for _, data in files) + (ROOT / 'resources/icon.png').stat().st_size,
    })
    (dist / 'metadata.json').write_text(json.dumps(release_meta, indent=2) + '\n')
    (dist / 'SHA256SUMS.txt').write_text(''.join(
        f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in (pcm, manual)))
    print(f'Built {pcm.name} and {manual.name}')


if __name__ == '__main__':
    build()
