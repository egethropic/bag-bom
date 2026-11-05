"""Render the source-defined Bag BOM icon at toolbar and PCM sizes."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
image = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((8, 8, 248, 248), 44, fill='#17242b')
draw.rounded_rectangle((64, 58, 192, 202), 12, outline='#8de2c9', width=10)
draw.line((70, 86, 186, 86), fill='#8de2c9', width=8)
draw.rectangle((95, 116, 161, 160), fill='#8de2c9')
for x in (105, 128, 151):
    draw.line((x, 104, x, 172), fill='#8de2c9', width=7)
for x, y, dx, dy in ((37, 37, 23, 23), (219, 37, -23, 23),
                      (37, 219, 23, -23), (219, 219, -23, -23)):
    draw.line((x + dx, y, x, y, x, y + dy), fill='#eaf7f3', width=8)
for size, dest in ((24, ROOT / 'bag_bom/icon.png'), (64, ROOT / 'resources/icon.png')):
    dest.parent.mkdir(parents=True, exist_ok=True)
    image.resize((size, size), Image.Resampling.LANCZOS).save(dest)
