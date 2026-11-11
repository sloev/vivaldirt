"""Draw the app icons (a year dial: four season arcs and a hand)."""
import math
import sys

from PIL import Image, ImageDraw

COLORS = ['#8cc072', '#e8b64a', '#d2694a', '#86b2d8']
BG = '#14161a'


def draw(size, maskable=False):
    S = size * 4
    im = Image.new('RGB', (S, S), BG)
    d = ImageDraw.Draw(im)
    scale = 0.62 if maskable else 0.8
    r = S * scale / 2
    c = S / 2
    w = int(S * 0.075)
    for i, col in enumerate(COLORS):
        a0 = -90 + i * 90 + 4
        a1 = -90 + (i + 1) * 90 - 4
        d.arc([c - r, c - r, c + r, c + r], a0, a1, fill=col, width=w)
    ang = math.radians(-90 + 0.62 * 360)
    L = r * 0.78
    d.line([c, c, c + L * math.cos(ang), c + L * math.sin(ang)], fill='#e9e6df', width=int(S * 0.035))
    rr = S * 0.045
    d.ellipse([c - rr, c - rr, c + rr, c + rr], fill='#e9e6df')
    return im.resize((size, size), Image.LANCZOS)


out = sys.argv[1]
for n in (180, 192, 512):
    draw(n).save(f'{out}/icon-{n}.png', optimize=True)
draw(512, maskable=True).save(f'{out}/icon-maskable-512.png', optimize=True)
