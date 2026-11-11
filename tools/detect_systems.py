"""Detect systems and barlines on rendered score pages.

A system is found from the vertical line that joins all of its staves at the
left margin; barlines are columns that are (almost) fully dark from the top of
the system to its bottom.

Usage: python3 detect_systems.py PAGE.png [...]  -> JSON on stdout
Each page -> list of systems: {top, bottom, bars:[[x0,x1],...]}
Coordinates are fractions of page width/height.
"""
import json
import sys

import numpy as np
from PIL import Image


def runs(mask, min_len):
    """Return [start, end) runs of True values at least min_len long."""
    out = []
    m = np.concatenate([[False], mask, [False]]).astype(np.int8)
    d = np.diff(m)
    starts = np.where(d == 1)[0]
    ends = np.where(d == -1)[0]
    for a, b in zip(starts, ends):
        if b - a >= min_len:
            out.append((a, b))
    return out


def dilate_x(dark, k=2):
    d = dark.copy()
    for i in range(1, k + 1):
        d[:, i:] |= dark[:, :-i]
        d[:, :-i] |= dark[:, i:]
    return d


def find_systems(dark):
    """Vertical runs taller than 12% of the page within the left 40% of the
    page are system brackets/left lines (indented first systems included).
    Overlapping runs are merged; each cluster keeps its longest run."""
    h, w = dark.shape
    dd = dilate_x(dark, 1)
    cands = []
    for x in range(int(w * 0.03), int(w * 0.40)):
        for a, b in runs(dd[:, x], int(h * 0.12)):
            cands.append((a, b, x))
    cands.sort(key=lambda r: r[1] - r[0], reverse=True)
    systems = []
    for a, b, x in cands:
        if any(a < sb and b > sa for sa, sb, _ in systems):
            continue
        systems.append((a, b, x))
    systems.sort()
    return systems


def find_bars(dark, top, bottom):
    h, w = dark.shape
    seg = dilate_x(dark[top:bottom, :], 2)
    cover = seg.mean(axis=0)
    xs = np.where(cover > 0.9)[0]
    groups = []
    for x in xs:
        if groups and x - groups[-1][-1] <= 14:  # double barlines / repeats
            groups[-1].append(x)
        else:
            groups.append([x])
    return [(g[0], g[-1]) for g in groups]


def analyze(path):
    im = np.asarray(Image.open(path).convert('L'), dtype=np.float32) / 255.0
    dark = im < 0.55
    h, w = dark.shape
    out = []
    for top, bottom, left in find_systems(dark):
        bars = [b for b in find_bars(dark, top, bottom) if b[1] >= left - 3]
        out.append({
            'top': round(top / h, 5),
            'bottom': round(bottom / h, 5),
            'bars': [[round(a / w, 5), round(b / w, 5)] for a, b in bars],
        })
    return out


if __name__ == '__main__':
    res = {p: analyze(p) for p in sys.argv[1:]}
    json.dump(res, sys.stdout, indent=1)
