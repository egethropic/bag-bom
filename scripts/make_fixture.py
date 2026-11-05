"""Build a fictional example using a pinned, unmodified upstream viewer.

Optional positional argument: local InteractiveHtmlBom repository checkout.
Otherwise downloads the pinned source files from GitHub (development only).
"""
import json
from pathlib import Path
import sys
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = 'd1eb5b79a52a2ddc1ce270b63920346463c19b05'
OUT = ROOT / 'tests' / 'generated'
OUT.mkdir(parents=True, exist_ok=True)


def upstream(file):
    if len(sys.argv) > 1:
        return (Path(sys.argv[1]) / file).read_text(encoding='utf-8')
    url = f'https://raw.githubusercontent.com/openscopeproject/InteractiveHtmlBom/{UPSTREAM}/{file}'
    with urlopen(url, timeout=30) as response:
        return response.read().decode('utf-8')


def footprint(ref, x, y, layer):
    return {'ref': ref, 'layer': layer, 'center': [x, y],
            'bbox': {'pos': [x, y], 'relpos': [-2, -1], 'size': [4, 2], 'angle': 0},
            'drawings': [], 'pads': [
                {'layers': [layer], 'pos': [x + dx, y], 'size': [1.2, 1.4], 'angle': 0,
                 'shape': 'rect', 'type': 'smd', 'pin1': int(dx < 0)} for dx in [-1.5, 1.5]]}


data = {
    'ibom_version': 'v2.12.0', 'edges_bbox': {'minx': 0, 'miny': 0, 'maxx': 45, 'maxy': 30},
    'edges': [{'type': 'segment', 'start': a, 'end': b, 'width': .15} for a, b in
              [([0, 0], [45, 0]), ([45, 0], [45, 30]), ([45, 30], [0, 30]), ([0, 30], [0, 0])]],
    'drawings': {'silkscreen': {'F': [], 'B': []}, 'fabrication': {'F': [], 'B': []}},
    'metadata': {'title': 'Bag BOM demo', 'revision': '1', 'company': 'Fictional example', 'date': '2026-11-04'},
    'font_data': {},
    'footprints': [footprint('R1', 10, 10, 'F'), footprint('R2', 25, 10, 'B'),
                   footprint('R3', 10, 20, 'F'), footprint('C1', 30, 20, 'F'),
                   footprint('R4', 25, 20, 'F')],
    'bom': {'both': [[['R1', 0], ['R2', 1], ['R3', 2]], [['C1', 3]]],
            'F': [[['R1', 0], ['R3', 2]], [['C1', 3]]], 'B': [[['R2', 1]]], 'skipped': [4],
            'fields': {
                0: ['10k', 'R_0603', 'RC0603FR-0710KL', 'C25804'],
                1: ['10k', 'R_0603', 'RC0603FR-0710KL', 'C25804'],
                2: ['10k', 'R_0603', 'ERJ-3EKF1002V', 'C15401'],
                3: ['1uF', 'C_0603', 'GRM188R71C105KA12D', 'C15849'],
                4: ['DNP', 'R_0603', 'DO-NOT-SELECT123', 'C999999'],
            }}
}
config = {'fields': ['Value', 'Footprint', 'MPN', 'LCSC'], 'dark_mode': True,
          'show_pads': True, 'show_fabrication': False, 'show_silkscreen': True,
          'highlight_pin1': 'selected', 'redraw_on_drag': True, 'board_rotation': 0,
          'checkboxes': 'Sourced,Placed', 'bom_view': 'left-right', 'layer_view': 'FB',
          'offset_back_rotation': False, 'kicad_text_formatting': True, 'mark_when_checked': ''}
html = upstream('InteractiveHtmlBom/web/ibom.html')
files = {'CSS': 'ibom.css', 'SPLITJS': 'split.js', 'LZ-STRING': 'lz-string.js',
         'POINTER_EVENTS_POLYFILL': 'pep.js', 'UTILJS': 'util.js', 'RENDERJS': 'render.js',
         'TABLEUTILJS': 'table-util.js', 'IBOMJS': 'ibom.js'}
for marker, filename in files.items():
    html = html.replace(f'///{marker}///', upstream('InteractiveHtmlBom/web/' + filename))
for marker in ('USERCSS', 'USERJS', 'USERHEADER'):
    html = html.replace(f'///{marker}///', '')
html = html.replace('///USERFOOTER///', '<!-- InteractiveHtmlBom license:\n' + upstream('LICENSE') + '\n-->')
html = html.replace('///CONFIG///', 'var config = ' + json.dumps(config) + ';')
html = html.replace('///PCBDATA///', 'var pcbdata = ' + json.dumps(data) + ';')
(OUT / 'demo.html').write_text(html, encoding='utf-8')

# Plain synthetic text labels for real OCR tests; not product photographs.
from PIL import Image, ImageDraw, ImageFont
font_options = ['C:/Windows/Fonts/arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
font_path = next((p for p in font_options if Path(p).exists()), None)
font = ImageFont.truetype(font_path, 46) if font_path else ImageFont.load_default(size=46)
small = ImageFont.truetype(font_path, 28) if font_path else ImageFont.load_default(size=28)
label = Image.new('RGB', (1280, 720), '#eeeeee')
draw = ImageDraw.Draw(label)
draw.rounded_rectangle((90, 180, 1190, 540), 12, fill='white', outline='#222222', width=3)
draw.text((145, 225), 'COMPONENT LABEL / DEMO', font=small, fill='black')
draw.text((145, 290), 'RC0603FR-0710KL', font=font, fill='black')
draw.text((145, 365), 'LCSC: C25804', font=font, fill='black')
draw.text((145, 440), 'QTY 20    10k    0603', font=small, fill='black')
label.save(OUT / 'label.png')
# YUV4MPEG2 fake webcam, neutral chroma and BT.601 limited-range luma.
gray = label.convert('L').point(lambda n: round(16 + n * 219 / 255)).tobytes()
with (OUT / 'label.y4m').open('wb') as output:
    output.write(b'YUV4MPEG2 W1280 H720 F5:1 Ip A1:1 C420jpeg\n')
    frame = gray + bytes([128]) * (1280 * 720 // 2)
    for _ in range(5):
        output.write(b'FRAME\n' + frame)
print(f'Generated fixture and OCR labels in {OUT}')

# Real machine-readable codes with fictional payloads for the barcode decoder.
import subprocess
subprocess.run(['node', str(ROOT / 'scripts/make_barcode_fixtures.cjs')], check=True)
for name in ('lcsc-qr', 'digikey-dm'):
    frame_image = Image.new('RGB', (1280, 720), 'white')
    code = Image.open(OUT / (name + '.png')).convert('RGB')
    code.thumbnail((340, 340), Image.Resampling.NEAREST)
    frame_image.paste(code, ((1280 - code.width) // 2, (720 - code.height) // 2))
    frame_image.save(OUT / (name + '-frame.png'))
    gray = frame_image.convert('L').point(lambda n: round(16 + n * 219 / 255)).tobytes()
    with (OUT / (name + '.y4m')).open('wb') as output:
        output.write(b'YUV4MPEG2 W1280 H720 F5:1 Ip A1:1 C420jpeg\n')
        for _ in range(5):
            output.write(b'FRAME\n' + gray + bytes([128]) * (1280 * 720 // 2))
multi = Image.new('RGB', (900, 500), 'white')
for name, x in [('lcsc-qr', 30), ('second-qr', 480)]:
    code = Image.open(OUT / (name + '.png')).convert('RGB')
    multi.paste(code, (x, 70))
multi.save(OUT / 'multiple-qr.png')
