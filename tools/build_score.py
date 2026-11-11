#!/usr/bin/env python3
"""Render the IMSLP score PDFs to small page images and build a measure map.

    python3 tools/build_score.py PDF_DIR OUT_DIR AUDIO_MANIFEST

PDF_DIR must contain spring.pdf, summer.pdf, autumn.pdf, winter.pdf
(IMSLP #126435 – Dover edition of Op. 8 nos. 1–4, public domain).
OUT_DIR (docs/score) receives <season>-NN.png (4-level grey, ~40 KB each)
and score.json with, per movement, the systems it spans and the x position
of every barline, so the player can put a cursor on the current bar.
"""
import glob
import json
import os
import subprocess
import sys
import tempfile

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from detect_systems import analyze  # noqa: E402

DPI = 150
# Where each movement starts: (page, system index on that page), 1-based pages.
STARTS = {
    'spring': [(1, 0), (9, 0), (11, 2)],
    'summer': [(1, 0), (9, 0), (11, 0)],
    'autumn': [(1, 0), (11, 0), (12, 0)],
    'winter': [(1, 0), (8, 0), (11, 0)],
}

# Bar counts verified against the printed bar numbers; these systems are
# where barline detection is off: (season, page, system on page) -> bars.
FIX = {
    ('spring', 9, 0): 3,
    ('spring', 16, 2): 4,
    ('spring', 18, 0): 3,
}
# Tempo anchors for movements whose tempo changes a lot, as
# (seconds into the trimmed recording, bars elapsed). Elsewhere bars are taken
# to be of equal length. Summer II alternates Adagio with Presto thunder; the
# Presto entries were found from jumps in loudness in the recording.
ANCHORS = {
    ('summer', 2): [(14.2, 2.5), (16.0, 4), (38.0, 7.5), (39.9, 9),
                    (76.1, 15), (78.1, 16), (94.9, 19), (96.8, 20)],
}
# Printed number of the first bar of each movement (Spring I opens with a
# pickup bar, numbered 0 here so the display matches the score).
FIRST_NUMBER = {('spring', 1): 0}


def fix_bars(bars, want):
    bars = list(bars)
    while len(bars) - 1 > want:   # drop the barline bounding the narrowest bar
        widths = [b - a for a, b in zip(bars, bars[1:])]
        i = widths.index(min(widths))
        del bars[i + 1 if i + 1 < len(bars) - 1 else i]
    while len(bars) - 1 < want:   # split the widest bar
        widths = [b - a for a, b in zip(bars, bars[1:])]
        i = widths.index(max(widths))
        bars.insert(i + 1, round((bars[i] + bars[i + 1]) / 2, 4))
    return bars


def main(pdf_dir, out, manifest_path):
    manifest = json.load(open(manifest_path))
    os.makedirs(out, exist_ok=True)
    score = {'pageAspect': None, 'seasons': {}, 'movements': []}
    for season, starts in STARTS.items():
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(['pdftoppm', '-r', str(DPI), '-gray', '-png',
                            os.path.join(pdf_dir, f'{season}.pdf'),
                            os.path.join(tmp, 'p')], check=True)
            files = sorted(glob.glob(os.path.join(tmp, 'p-*.png')))
            systems = []  # flat list of (page, system)
            for i, f in enumerate(files, 1):
                for k, s in enumerate(analyze(f)):
                    s['fix'] = FIX.get((season, i, k))
                    systems.append((i, s))
                im = Image.open(f).convert('L')
                score['pageAspect'] = round(im.height / im.width, 5)
                im.quantize(4).save(os.path.join(out, f'{season}-{i:02d}.png'),
                                    optimize=True)
        score['seasons'][season] = {'pages': len(files)}
        # split the flat system list into movements
        idx = []
        for page, sysno in starts:
            k = [j for j, (p, _) in enumerate(systems) if p == page][sysno]
            idx.append(k)
        idx.append(len(systems))
        for m in range(3):
            mvsys = []
            measures = 0
            for page, s in systems[idx[m]:idx[m + 1]]:
                bars = [round((a + b) / 2, 4) for a, b in s['bars']]
                if s['fix']:
                    bars = fix_bars(bars, s['fix'])
                if len(bars) < 2:
                    continue
                mvsys.append({'page': page, 'top': s['top'],
                              'bottom': s['bottom'], 'bars': bars})
                measures += len(bars) - 1
            anchors = None
            if (season, m + 1) in ANCHORS:
                mm = next(x for x in manifest['movements']
                          if x['season'] == season and x['movement'] == m + 1)
                dur = (mm['end'] - mm['start']) / manifest['sampleRate']
                anchors = [[0, 0]] + [
                    [round(t / dur, 5), round(b / measures, 5)]
                    for t, b in ANCHORS[(season, m + 1)]] + [[1, 1]]
            score['movements'].append({
                                       'anchors': anchors,'season': season, 'movement': m + 1,
                                       'measures': measures,
                                       'firstNumber': FIRST_NUMBER.get(
                                           (season, m + 1), 1),
                                       'systems': mvsys})
            print(f'{season} {m + 1}: {measures} measures, '
                  f'{len(mvsys)} systems', file=sys.stderr)
    with open(os.path.join(out, 'score.json'), 'w') as fh:
        json.dump(score, fh, separators=(',', ':'))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3])
