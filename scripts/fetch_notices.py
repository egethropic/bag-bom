"""Maintainer utility: fetch license texts for the pinned OCR binary's dependencies."""
import concurrent.futures
import json
from pathlib import Path
from urllib.request import urlopen

OUT = Path(__file__).resolve().parents[1] / 'third_party'
sources = {
    'GIFLIB-LICENSE.txt': ('mirrorer/giflib', 'fa37672085ce4b3d62c51627ab3c8cf2dda8009a', 'COPYING'),
    'LEPTONICA-LICENSE.txt': ('DanBloomberg/leptonica', '4af068b56a9674da915debea4ed7e1b9885b17e8', 'leptonica-license.txt'),
    'LIBJPEG-README.txt': ('LuaDist/libjpeg', '6c0fcb8ddee365e7abc4d332662b06900612e923', 'README'),
    'LIBPNG-LICENSE.txt': ('glennrp/libpng', 'a37d4836519517bdce6cb9d956092321eca3e73b', 'LICENSE'),
    'LIBWEBP-COPYING.txt': ('webmproject/libwebp', '20ef03ee351d4ff03fc5ff3ec4804a879d1b9d5c', 'COPYING'),
    'LIBWEBP-PATENTS.txt': ('webmproject/libwebp', '20ef03ee351d4ff03fc5ff3ec4804a879d1b9d5c', 'PATENTS'),
    'OPENLIBM-LICENSE.txt': ('JuliaMath/openlibm', 'ae2d91698508701c83cab83714d42a1146dccf85', 'LICENSE.md'),
    'TESSERACT-LICENSE.txt': ('Balearica/tesseract', '2a9c1c49c360462733c386d2a44fcd22c4e21411', 'LICENSE'),
    'ZLIB-README.txt': ('madler/zlib', '21767c654d31d2dccdde4330529775c6c5fd5389', 'README'),
}
urls = {name: f'https://raw.githubusercontent.com/{repo}/{ref}/{file}'
        for name, (repo, ref, file) in sources.items()}
urls['LIBTIFF-COPYRIGHT.txt'] = 'https://gitlab.com/libtiff/libtiff/-/raw/b51bb157123264e26d34c09cc673d213aea61fc7/COPYRIGHT'
urls['TESSDATA-LICENSE.txt'] = 'https://raw.githubusercontent.com/naptha/tessdata/gh-pages/LICENSE'
urls['EMSCRIPTEN-LICENSE.txt'] = 'https://raw.githubusercontent.com/emscripten-core/emscripten/4.0.10/LICENSE'


def fetch(item):
    name, url = item
    with urlopen(url, timeout=30) as response:
        text = response.read().decode('utf-8')
        (OUT / name).write_text('\n'.join(line.rstrip() for line in text.splitlines()).rstrip() + '\n', encoding='utf-8')
    return name


if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for name in pool.map(fetch, urls.items()):
            print(name)
    (OUT / 'core-dependencies.json').write_text(json.dumps(urls, indent=2) + '\n')
