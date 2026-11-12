#!/usr/bin/env python3
"""Derive "Vivaldirt Bodoni Condensed" from Libre Bodoni Bold (SIL OFL 1.1).

The Ghost in the Shell (1995) title is set in Bodoni Bold Condensed
(Bitstream's cut of ATF Bodoni Bold Condensed, M. F. Benton). That font is
commercial. Libre Bodoni is an open revival of Benton's ATF Bodoni, so we
condense it the way a bold condensed is drawn: the outlines are narrowed and
only the vertical stems are thickened (a horizontal Minkowski sum), so
hairlines and serifs stay thin. Proportions are fitted to the reference
logo (letter width / cap height, stem / cap height).

    python3 tools/build_display_font.py LibreBodoni[wght].ttf OUT.woff2 [SX=0.62] [D=26]

With 0.62 / 26 every letter of GHOST SHELL matches the reference logo within
±0.02 of cap height in width, and the stems (L .20, T .20, O .23) match too.
"""
import sys

import pathops
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

CHARS = ("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
         " .,:;!?'’‘\"“”-–—/·()&@+%#*")


def build(src, out, sx=0.62, d=26):
    vf = TTFont(src)
    font = instantiateVariableFont(vf, {"wght": 700}) if "fvar" in vf else vf
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    names = [".notdef", "space"]
    cmap_out = {}
    for ch in CHARS:
        g = cmap.get(ord(ch))
        if g is None:
            continue
        cmap_out[ord(ch)] = g
        if g not in names:
            names.append(g)
    charstrings, metrics = {}, {}
    for name in names:
        if name not in gs:
            continue
        g = gs[name]
        rec = DecomposingRecordingPen(gs)
        g.draw(rec)
        # narrow, then sweep the outline horizontally over [0, 2d]
        result = None
        steps = 7
        for i in range(steps):
            dx = d + (2 * d) * (i / (steps - 1)) - 2 * d  # -d .. +d, then +d below
            p = pathops.Path()
            pen = TransformPen(p.getPen(), (sx, 0, 0, 1, dx + d, 0))
            rec.replay(pen)
            result = p if result is None else pathops.op(result, p, pathops.PathOp.UNION)
        result.simplify()
        t2 = T2CharStringPen(round(g.width * sx + 2 * d), gs)
        result.draw(t2)
        charstrings[name] = t2.getCharString()
        metrics[name] = (round(g.width * sx + 2 * d), 0)
    fb = FontBuilder(upm, isTTF=False)
    fb.setupGlyphOrder([n for n in names if n in charstrings])
    fb.setupCharacterMap({u: g for u, g in cmap_out.items() if g in charstrings})
    fb.setupCFF("VivaldirtBodoniCondensed-Bold", {"FullName": "Vivaldirt Bodoni Condensed Bold"}, charstrings, {})
    lsb = {n: charstrings[n].calcBounds(None)[0] if charstrings[n].calcBounds(None) else 0 for n in charstrings}
    fb.setupHorizontalMetrics({n: (metrics[n][0], round(lsb[n])) for n in charstrings})
    hh = font["hhea"]
    fb.setupHorizontalHeader(ascent=hh.ascent, descent=hh.descent)
    fb.setupNameTable({
        "familyName": "Vivaldirt Bodoni Condensed",
        "styleName": "Bold",
        "copyright": "Copyright 2012 The Libre Bodoni Project Authors (https://github.com/googlefonts/Libre-Bodoni/). "
                     "Modified (condensed) for Vivaldi Real Time.",
        "licenseDescription": "This Font Software is licensed under the SIL Open Font License, Version 1.1.",
        "licenseInfoURL": "https://openfontlicense.org",
    })
    os2 = font["OS/2"]
    fb.setupOS2(sTypoAscender=os2.sTypoAscender, sTypoDescender=os2.sTypoDescender, usWinAscent=os2.usWinAscent,
                usWinDescent=os2.usWinDescent, sCapHeight=getattr(os2, "sCapHeight", 0), usWeightClass=700)
    fb.setupPost()
    fb.font.flavor = "woff2" if out.endswith(".woff2") else None
    fb.save(out)


if __name__ == "__main__":
    a = sys.argv
    build(a[1], a[2], float(a[3]) if len(a) > 3 else 0.62, float(a[4]) if len(a) > 4 else 26)
