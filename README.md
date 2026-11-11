# Vivaldi Real Time

Vivaldi's *Four Seasons* stretched across the whole year. Each concerto is time-stretched with
[Paulstretch](https://hypermammut.sourceforge.net/paulstretch/) so that it lasts exactly as long as
its calendar season. Spring runs 1 March – 31 May, summer 1 June – 31 August, autumn 1 September – 30 November,
and winter 1 December – end of February. The playhead is always at the present moment.
Right now you are hearing one bar of Vivaldi stretched over several hours, and the printed score
shows where you are.

A static PWA served by GitHub Pages from `docs/`. It works on desktop and mobile, can be installed,
and works offline once loaded.

## How it works

| Piece | What it does |
| --- | --- |
| `docs/js/seasons.js` | Maps any instant to a position in the recording using calendar (meteorological) seasons, with boundaries at local midnight. Spring (1 Mar – 31 May) gets Concerto No. 1, summer No. 2, autumn No. 3 and winter No. 4. The stretch factor is about ×12,500, so one second of the recording lasts about 3½ hours. A southern-hemisphere setting shifts everything by six months. |
| `docs/audio/` | The 12 movements as one continuous timeline, in 6-second **lossless FLAC segments** (`seg/00000.flac` …) listed in an HLS-style `playlist.m3u8`, plus `manifest.json` with movement boundaries. |
| `docs/js/engine.js` | Fetches only the segments around the playhead, decodes them with Web Audio and schedules the stretched blocks back to back. |
| `docs/js/stretch-worker.js` | Runs Paulstretch (WebAssembly, one `StreamingStretcher` per channel) in a Web Worker. |
| `docs/score/` | Score pages as 4-level grey PNGs (~40–70 KB each) and `score.json`, which records every system and barline. Barlines were detected automatically and checked against the printed bar numbers. |
| `docs/sw.js` | Service worker. The app shell is cached up front; recently used score pages and audio segments are cached as you go. |

### Data budget

The playhead moves through the recording at about 6.5 seconds per day. A listening session therefore
needs only one or two audio segments (~0.4 MB each) and one or two score pages. The first visit
downloads about 1.5 MB in total, including the ~100 KB WASM module. The full 166 MB of audio is never
downloaded by anyone.

No `SharedArrayBuffer` is used, so no cross-origin-isolation headers are needed. That matters because
GitHub Pages can't send them.

## Deploying

In the repository settings, go to **Pages → Build and deployment → Deploy from a branch** and choose
the default branch with the `/docs` folder.

## Running locally

```bash
npm run serve        # python3 -m http.server -d docs 8000, then open http://localhost:8000
npm test             # node --test: season boundaries, recording mapping, score map
```

## Rebuilding the data

Requires `ffmpeg`, `pdftoppm` (poppler), Python 3 with `numpy` and `Pillow`.

```bash
tools/fetch_audio.sh build/src                       # 12 MP3s from the Internet Archive (md5-checked)
python3 tools/build_audio.py build/src docs/audio    # trim silence, cut into FLAC segments + playlist
# put the four IMSLP PDFs in build/pdf as spring.pdf, summer.pdf, autumn.pdf, winter.pdf
python3 tools/build_score.py build/pdf docs/score docs/audio/manifest.json
python3 tools/make_icons.py docs/icons
```

The audio is decoded once from the original MP3s and stored as 16-bit FLAC, so there is no further
quality loss. Leading and trailing silence around each movement is trimmed, because at this stretch
every 0.1 s of silence would become 20 minutes of it.

### Score sync accuracy

The bar cursor assumes bars of equal length within each movement. Summer II is the exception: its
Adagio and Presto sections alternate, so it uses tempo anchors found from the loudness of the Presto
thunderclaps (`ANCHORS` in `tools/build_score.py`). Other movements with tempo changes could get
anchors the same way.

## Credits & licences

### Recording

> From *The Four Seasons* by Antonio Vivaldi
> Live, unedited performance
> Wiedemann Recital Hall, Wichita State University
> John Harrison – Violin | Robert Turizziani – Conductor
> The Wichita State University Chamber Players
> https://johnharrison.cc ([about this recording](https://johnharrison.cc/the-four-seasons/))

Licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), as stated on the performer's site. It was
originally released under CC BY-SA 3.0 via the Free Music Archive. The files used here were downloaded from the
[Internet Archive](https://archive.org/details/The_Four_Seasons_Vivaldi-10361).

**Changes made:** silence before and after each movement trimmed, movements joined into one timeline, cut into
6-second lossless FLAC segments, and time-stretched with Paulstretch in the browser. The audio in `docs/audio/` is
shared under CC BY-SA 4.0.

### Sheet music

Antonio Vivaldi, *Le quattro stagioni*, Op. 8 Nos. 1–4 (RV 269, 315, 293, 297), edited by Eleanor Selfridge-Field,
from *"The Four Seasons" and Other Violin Concertos in Full Score*, Dover Publications, New York, 1995. Scanned by
archive.org and uploaded to [IMSLP](https://clara.imslp.org/work/126435) by Feduol: files
[#799159](https://imslp.org/wiki/Special:ReverseLookup/799159) (Spring),
[#799160](https://imslp.org/wiki/Special:ReverseLookup/799160) (Summer),
[#799162](https://imslp.org/wiki/Special:ReverseLookup/799162) (Autumn) and
[#799163](https://imslp.org/wiki/Special:ReverseLookup/799163) (Winter). Public domain per IMSLP, which marks
these scans "EU": public domain in the EU, Canada and similar jurisdictions, though possibly not everywhere.

### Software

- Paulstretch algorithm by Nasca Octavian Paul.
- The WebAssembly build in `docs/vendor/paulstretch/` comes from Oli Larkin's
  [paulstretch-for-web](https://github.com/olilarkin/paulstretch-for-web) /
  [libpaulstretch](https://github.com/olilarkin/libpaulstretch). It is GPL-2.0; see `docs/vendor/paulstretch/LICENSE`.
- The rest of this project's code is public domain (see `LICENSE.md`).
