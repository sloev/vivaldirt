"""App icons: a crop of a concrete plate, printed like the site (grain,
paper-white highlights, deep ink) with "IV" (the four concertos) set in
the site's condensed Bodoni.

    python3 tools/make_icons.py PLATE.jpg FONT.otf docs/icons
"""
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

PAPER = (234, 233, 227)
INK = (14, 14, 12)


def base(plate, size):
    im = Image.open(plate).convert('L')
    w, h = im.size
    im = im.crop(((w - h) // 2, 0, (w + h) // 2, h)).resize((size, size), Image.LANCZOS)
    im = ImageOps.autocontrast(im, cutoff=1)
    a = np.asarray(im, np.float32) / 255
    a = a ** 1.25 * 0.82  # deeper, quieter: the lettering carries the icon
    rng = np.random.default_rng(7)
    a *= 1 - 0.18 * (rng.random(a.shape) < 0.05)  # dark specks (grain)
    a = np.clip(a, 0, 1)
    # tint between ink and paper
    rgb = np.stack([INK[i] / 255 + a * (PAPER[i] - INK[i]) / 255 for i in range(3)], -1)
    return Image.fromarray((rgb * 255).astype(np.uint8), 'RGB')


def letter(img, font, scale):
    size = img.size[0]
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(font, int(size * scale))
    text = 'IV'
    l, t, r, b = d.textbbox((0, 0), text, font=f)
    x = (size - (r - l)) / 2 - l
    y = (size - (b - t)) / 2 - t
    d.text((x, y), text, font=f, fill=PAPER)
    return img


def main(plate, font, out):
    for n in (180, 192, 512):
        letter(base(plate, n), font, 0.62).save(f'{out}/icon-{n}.png', optimize=True)
    # maskable: lettering inside the 80 % safe circle
    letter(base(plate, 512), font, 0.44).save(f'{out}/icon-maskable-512.png', optimize=True)
    letter(base(plate, 64), font, 0.66).save(f'{out}/favicon-64.png', optimize=True)


if __name__ == '__main__':
    main(*sys.argv[1:4])
