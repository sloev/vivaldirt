#!/usr/bin/env python3
"""Turn the 12 Four Seasons movements into one continuous timeline cut into
small, independently decodable FLAC segments plus an HLS-style playlist.

    python3 tools/build_audio.py SRC_DIR OUT_DIR

SRC_DIR holds the 12 MP3s downloaded by tools/fetch_audio.sh.
OUT_DIR (docs/audio) receives:
    seg/00000.flac ...   6 s stereo segments, 48 kHz / 16 bit, sample-exact
    playlist.m3u8        HLS-style VOD playlist listing every segment
    manifest.json        sample rate, segment size, movement boundaries

Nothing is re-encoded lossily: the MP3s are decoded once and stored as FLAC,
so each segment decodes to exactly the samples the MP3 decoder produced.
Leading/trailing digital silence around each movement is trimmed, because
at ~12,000x stretch every 0.1 s of silence would become 20 minutes of it.
"""
import glob
import json
import os
import subprocess
import sys

import numpy as np

SR = 48000
SEG_SECONDS = 6
SEG = SR * SEG_SECONDS
PRE_ROLL = 0.10   # seconds kept before the first note of a movement
TAIL = 0.35       # seconds of reverb tail kept after the last note
THRESH_DB = -50.0

MOVEMENTS = [
    # (file number, season, movement number, tempo marking)
    ('01', 'spring', 1, 'Allegro'),
    ('02', 'spring', 2, 'Largo e pianissimo sempre'),
    ('03', 'spring', 3, 'Allegro pastorale'),
    ('04', 'summer', 1, 'Allegro non molto'),
    ('05', 'summer', 2, 'Adagio e piano – Presto e forte'),
    ('06', 'summer', 3, 'Presto'),
    ('07', 'autumn', 1, 'Allegro'),
    ('08', 'autumn', 2, 'Adagio molto'),
    ('09', 'autumn', 3, 'Allegro'),
    ('10', 'winter', 1, 'Allegro non molto'),
    ('11', 'winter', 2, 'Largo'),
    ('12', 'winter', 3, 'Allegro'),
]


def decode(path):
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2',
         '-ar', str(SR), '-'],
        check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2)


def trim(x):
    win = SR // 100
    n = len(x) // win
    rms = np.sqrt((x[:n * win] ** 2).mean(axis=1).reshape(n, win).mean(axis=1) + 1e-20)
    db = 20 * np.log10(rms)
    loud = np.where(db > THRESH_DB)[0]
    a = max(0, loud[0] * win - int(PRE_ROLL * SR))
    b = min(len(x), (loud[-1] + 1) * win + int(TAIL * SR))
    return x[a:b]


def main(src, out):
    os.makedirs(os.path.join(out, 'seg'), exist_ok=True)
    parts, movements, pos = [], [], 0
    for num, season, mvt, title in MOVEMENTS:
        path = glob.glob(os.path.join(src, f'*_-_{num}_-_*.mp3'))[0]
        x = trim(decode(path))
        movements.append({'season': season, 'movement': mvt, 'title': title,
                          'start': pos, 'end': pos + len(x)})
        print(f'{num} {season} {mvt}: {len(x) / SR:7.2f}s', file=sys.stderr)
        parts.append(x)
        pos += len(x)
    pcm = np.concatenate(parts)
    total = len(pcm)
    pcm16 = np.clip(np.round(pcm * 32767.0), -32768, 32767).astype('<i2')

    for f in glob.glob(os.path.join(out, 'seg', '*.flac')):
        os.remove(f)
    lines = ['#EXTM3U', '#EXT-X-VERSION:3',
             f'#EXT-X-TARGETDURATION:{SEG_SECONDS}', '#EXT-X-MEDIA-SEQUENCE:0',
             '#EXT-X-PLAYLIST-TYPE:VOD']
    nseg = (total + SEG - 1) // SEG
    for i in range(nseg):
        chunk = pcm16[i * SEG:(i + 1) * SEG]
        name = f'seg/{i:05d}.flac'
        subprocess.run(
            ['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(SR),
             '-ac', '2', '-i', '-', '-map_metadata', '-1', '-c:a', 'flac',
             '-compression_level', '12', os.path.join(out, name)],
            input=chunk.tobytes(), check=True)
        lines.append(f'#EXTINF:{len(chunk) / SR:.6f},')
        lines.append(name)
    lines.append('#EXT-X-ENDLIST')
    with open(os.path.join(out, 'playlist.m3u8'), 'w') as fh:
        fh.write('\n'.join(lines) + '\n')

    manifest = {
        'sampleRate': SR,
        'channels': 2,
        'segmentFrames': SEG,
        'segments': nseg,
        'totalFrames': total,
        'movements': movements,
    }
    with open(os.path.join(out, 'manifest.json'), 'w') as fh:
        json.dump(manifest, fh, indent=1)
    print(f'{nseg} segments, {total / SR:.1f}s total', file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
