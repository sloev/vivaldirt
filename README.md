# Vivaldi Real Time

Vivaldi's *Four Seasons* stretched across the whole year. Each concerto is time-stretched with
[Paulstretch](https://hypermammut.sourceforge.net/paulstretch/) so that it lasts exactly as long as
its calendar season. Spring runs 1 March – 31 May, summer 1 June – 31 August, autumn 1 September – 30 November,
and winter 1 December – end of February. The playhead is always at the present moment.
Right now you are hearing one bar of Vivaldi stretched over several hours.

The page is a single, slowly mutating artwork: dithered brutalist architecture with the actual engraved
score built into its planes. The staff lines continue as perspective lines, notes invert where they pass
into shadow, and a hairline playhead is cut through the bar being played. The interface is a few lines of
type laid into the composition. A live counter shows how many people are listening right now.

It is a static PWA served by GitHub Pages from `docs/`. It works on desktop and mobile, can be installed,
and works offline once loaded.

## How it works

| Piece | What it does |
| --- | --- |
| `docs/js/seasons.js` | Maps any instant to a position in the recording using calendar (meteorological) seasons, with boundaries at local midnight. Spring (1 Mar – 31 May) gets Concerto No. 1, summer No. 2, autumn No. 3 and winter No. 4. The stretch factor is about ×12,500, so one second of the recording lasts about 3½ hours. A southern-hemisphere setting shifts everything by six months. |
| `docs/audio/` | The 12 movements as one continuous timeline, in 6-second **lossless FLAC segments** (`seg/00000.flac` …) listed in an HLS-style `playlist.m3u8`, plus `manifest.json` with movement boundaries. |
| `docs/js/engine.js` | Fetches only the segments around the playhead, decodes them with Web Audio and schedules the stretched blocks back to back. |
| `docs/js/stretch-worker.js` | Runs Paulstretch (WebAssembly, one `StreamingStretcher` per channel) in a Web Worker. |
| `docs/score/` | Score pages as 4-level grey PNGs (~40–70 KB each) and `score.json`, which records every system and barline. Barlines were detected automatically and checked against the printed bar numbers. |
| `docs/js/composition.js` | The architecture as a **pure function of time and music**. Four extruded boxes and two score planes are seeded per movement and recomposed separately for portrait and landscape. Each movement hands over to the next layout during its last 3 %. Quiet passages open the space up and loud ones close it in (`docs/audio/dynamics.json`, built by `tools/build_dynamics.py`). The light follows the local time of day, and each season has its own tonal character. Slow drifts of 4–28 minutes make the piece visibly different after a minute but almost still at a glance. Everyone sees the same image at the same moment, and time travel moves the architecture too. |
| `docs/js/art.js` | WebGL1 fragment shader drawn at one canvas pixel per dither dot (2 CSS px, or 1.5 on phones), scaled up with nearest-neighbour sampling. It draws concrete faces, fbm texture, pores and a skylight beam. The score page is mapped onto the planes with homographies, and the staff lines extend as perspective lines. Everything is ordered-dithered (8×8 Bayer) into the four-tone palette. Runs at 15 fps; with `prefers-reduced-motion` the drift is frozen and it redraws every 20 s. Falls back to Canvas 2D without WebGL. |
| `docs/js/presence.js` | The live listener count (see below). |
| `docs/sw.js` | Service worker. The app shell is cached up front; recently used score pages and audio segments are cached as you go. |

### Data budget

The playhead moves through the recording at about 6.5 seconds per day. A listening session therefore
needs only one or two audio segments (~0.4 MB each) and one or two score pages. The first visit
downloads about 1.5 MB in total, including the ~100 KB WASM module. The full 166 MB of audio is never
downloaded by anyone.

No `SharedArrayBuffer` is used, so no cross-origin-isolation headers are needed. That matters because
GitHub Pages can't send them.

## Listener count (Trystero + Nostr)

The "● N LISTENING" counter is real and needs **no backend and no configuration**. Pages join one
[Trystero](https://github.com/dmotz/trystero) room. Signalling goes over public Nostr relays, and the peers
then talk over WebRTC data channels.

- Each user publishes a signed per-user state `{on, ts}`, where `on` is true only while audio is actually
  playing (the AudioContext is running). Paused visitors are not counted.
- Users count once. Tabs in the same browser share a Trystero user id, and they agree over a
  `BroadcastChannel` that the person is listening if any tab is playing.
- Stale sessions are dropped. Users leave on disconnect or when the tab closes (`pagehide`), heartbeats are
  sent every 20 s, and anyone silent for 65 s is no longer counted.
- If no relay can be reached within 20 s, the counter says **COUNT UNAVAILABLE** instead of showing a number.
- Visitors can opt out in IV — About; then nothing connects. As with any WebRTC connection, peers can
  see each other's IP addresses, and the About sheet says so.
- The app id and room name are constants at the top of `docs/js/presence.js`. The library is vendored as a
  single ES module in `docs/vendor/trystero/`, rebuilt with
  `npx esbuild` from `trystero` 0.27 (`export { joinRoom, getRelaySockets } from 'trystero'`).

Full-mesh WebRTC works well up to a few dozen simultaneous listeners. Trystero's `scale` plugin is the
next step if it ever gets busier than that.

## Deploying

In the repository settings, go to **Pages → Build and deployment → Deploy from a branch** and choose
the default branch with the `/docs` folder.

## Running locally

```bash
npm run serve        # python3 -m http.server -d docs 8000, then open http://localhost:8000
npm test             # node --test: season boundaries, recording mapping, score map, composition
```

## Rebuilding the data

Requires `ffmpeg`, `pdftoppm` (poppler), Python 3 with `numpy` and `Pillow`.

```bash
tools/fetch_audio.sh build/src                       # 12 MP3s from the Internet Archive (md5-checked)
python3 tools/build_audio.py build/src docs/audio    # trim silence, cut into FLAC segments + playlist
# put the four IMSLP PDFs in build/pdf as spring.pdf, summer.pdf, autumn.pdf, winter.pdf
python3 tools/build_score.py build/pdf docs/score docs/audio/manifest.json
python3 tools/build_dynamics.py docs/audio          # loudness envelope that drives the artwork
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
- [Trystero](https://github.com/dmotz/trystero) (MIT) and [@noble/secp256k1](https://github.com/paulmillr/noble-secp256k1) (MIT),
  bundled in `docs/vendor/trystero/` with their licences.
- Type: [Bodoni Moda](https://github.com/indestructible-type/Bodoni) and [IBM Plex](https://github.com/IBM/plex),
  self-hosted in `docs/fonts/` under the SIL Open Font License.
- The rest of this project's code is public domain (see `LICENSE.md`).
