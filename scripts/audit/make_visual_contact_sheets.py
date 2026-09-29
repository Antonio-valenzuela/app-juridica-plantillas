"""Build five-page contact sheets from already rendered local legal PDF samples."""

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path('audit/generator-final-certification/visual')
LABELS = ('inicio', 'p25', 'p50', 'p75', 'final')

for case in ('01', '02', '03', '04', '05', '06'):
    for mode in ('EXTENSIVE_40', 'PROFESSIONAL_20'):
        images = []
        for label in LABELS:
            matches = list(ROOT.glob(f'caso-{case}-{mode}-{label}-p*.png'))
            if len(matches) != 1:
                raise RuntimeError(f'Expected one {case}/{mode}/{label} image, found {len(matches)}')
            images.append((label, Image.open(matches[0]).convert('RGB')))
        width = max(image.width for _, image in images)
        height = max(image.height for _, image in images)
        sheet = Image.new('RGB', (width * 2 + 36, height * 3 + 78), 'white')
        draw = ImageDraw.Draw(sheet)
        for index, (label, image) in enumerate(images):
            x = (index % 2) * (width + 18)
            y = (index // 2) * (height + 26)
            draw.text((x + 8, y + 4), label, fill='black')
            sheet.paste(image, (x, y + 22))
        sheet.save(ROOT / f'contact-caso-{case}-{mode}.png')
        print(f'contact-caso-{case}-{mode}.png')
