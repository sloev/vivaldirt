# Vivaldi Real Time

Vivaldi's *Four Seasons* stretched across the whole year. Each concerto is time-stretched with
[Paulstretch](https://hypermammut.sourceforge.net/paulstretch/) so that it lasts exactly as long as
its astronomical season, from equinox to solstice. The playhead is always at the present moment.
Right now you are hearing one bar of Vivaldi stretched over several hours, and the printed score
shows where you are.

A static PWA served by GitHub Pages from `docs/`. It works on desktop and mobile, can be installed,
and works offline once loaded.

## How it works

| Piece | What it does |
| --- | --- |
| `docs/js/seasons.js` | Computes equinoxes and solstices (Meeus, accurate to about a minute) and maps any instant to a position in the recording. Spring (March equinox to June solstice) gets Concerto No. 1, and so on. The stretch factor is about ×12,000, so one second of the recording lasts about 3½ hours. A southern-hemisphere setting shifts everything by half a year. |
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
npm test             # node --test: equinoxes, season mapping, score map
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

- **Recording**: *The Four Seasons* by John Harrison with the Wichita State University Chamber Players,
  [Internet Archive / Free Music Archive](https://archive.org/details/The_Four_Seasons_Vivaldi-10361),
  licensed [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). The segments in
  `docs/audio/` are an adaptation (silence trimmed, re-encoded losslessly, segmented) and are shared
  under the same licence.
- **Score**: Vivaldi, *Le quattro stagioni*, Op. 8 Nos. 1–4 (Dover edition), public domain, from
  [IMSLP](https://clara.imslp.org/work/126435).
- **Paulstretch** algorithm by Nasca Octavian Paul. The WebAssembly build in
  `docs/vendor/paulstretch/` comes from Oli Larkin's
  [paulstretch-for-web](https://github.com/olilarkin/paulstretch-for-web) /
  [libpaulstretch](https://github.com/olilarkin/libpaulstretch) and is licensed **GPL-2.0**. Because of
  that, this project's code is also distributed under GPL-2.0 (see `LICENSE`).
