#!/usr/bin/env python3
"""Loudness envelope of the whole timeline, for the artwork.

    python3 tools/build_dynamics.py docs/audio

Decodes the FLAC segments listed in playlist.m3u8 (exactly the timeline the
player uses) and writes dynamics.json: one value 0..255 per second of the
recording, the RMS level in a 2 s window mapped from the 3rd..99th
percentile of the movement-level dB range. At the year-long stretch one
second of recording is ~3.5 hours, so this is a slow, reliable signal.
"""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np


def main(audio_dir):
    with open(os.path.join(audio_dir, 'manifest.json')) as fh:
        manifest = json.load(fh)
    sr = manifest['sampleRate']
    segs = [l.strip() for l in open(os.path.join(audio_dir, 'playlist.m3u8'))
            if l.strip() and not l.startswith('#')]
    with tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False) as lst:
        for s in segs:
            lst.write(f"file '{os.path.abspath(os.path.join(audio_dir, s))}'\n")
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'concat', '-safe', '0',
                          '-i', lst.name, '-ac', '1', '-f', 'f32le', '-'],
                         check=True, capture_output=True).stdout
    os.unlink(lst.name)
    x = np.frombuffer(raw, dtype=np.float32)
    hop = sr
    n = int(np.ceil(len(x) / hop))
    pad = np.concatenate([np.zeros(hop // 2, np.float32), x, np.zeros(hop * 2, np.float32)])
    rms = np.array([np.sqrt(np.mean(pad[i * hop:i * hop + 2 * hop] ** 2) + 1e-12) for i in range(n)])
    db = 20 * np.log10(rms)
    lo, hi = np.percentile(db, 3), np.percentile(db, 99)
    v = np.clip((db - lo) / (hi - lo), 0, 1)
    out = {'hopSeconds': 1, 'floorDb': round(float(lo), 1), 'ceilDb': round(float(hi), 1),
           'values': [int(round(a * 255)) for a in v]}
    with open(os.path.join(audio_dir, 'dynamics.json'), 'w') as fh:
        json.dump(out, fh, separators=(',', ':'))
    print(f'{n} values, {lo:.1f}..{hi:.1f} dB', file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1])
