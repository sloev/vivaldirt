# Vivaldi Real Time

Vivaldi's *Four Seasons* stretched across the whole year. Each concerto is time-stretched with
[Paulstretch](https://hypermammut.sourceforge.net/paulstretch/) so that it lasts exactly as long as
its calendar season. Spring runs 1 March – 31 May, summer 1 June – 31 August, autumn 1 September – 30 November,
and winter 1 December – end of February. The playhead is always at the present moment.
Right now you are hearing one bar of Vivaldi stretched over several hours.

The page is a single, slowly changing artwork: a monumental brutalist massing under a pale sky, lit by the
sun of the present moment. The score is part of the building. The system being played is engraved on its main
face, the next one wraps around the corner, and the staff lines run on around every volume as board-marked
formwork lines. An incision in the facade marks the playhead. A few lines of type are inscribed in the sky and
on the plaza, and a live counter shows how many people are listening right now.

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
| `docs/js/scene.js` | The building as a **pure function of time and music**. Three families of massing — stacked cantilevers; terraces with a drum and fly tower (after the National Theatre); a monolith with a perforated screen — are assigned per movement and rotated by season. All have the same number of volumes, so one transforms into the next during a movement's last 3 %, and the cantilevers reach further as a movement unfolds. The sun is computed for latitude 48° at the season of the piece and the local hour; at night a low moon takes over. Slow drifts of light, cantilevers and perforations (5–23 min periods) make the scene visibly different after a minute. Loudness (`docs/audio/dynamics.json`) softens and widens the shadow edges and densifies the perforations. Shift-lens framing keeps the whole massing inside the area the typography leaves free. |
| `docs/js/art.js` | WebGL2 fragment shader that **ray-traces the scene analytically** (8 boxes and a drum) with exact cast shadows. Surfaces are clean continuous tone; ordered dither (8×8 Bayer, 2 CSS px dots) appears only in penumbrae, in perforation patterns, where played bars dissolve and where staff lines fade. Score pages are sampled with mipmaps, so the engraving stays crisp. Renders at up to 1.5× device pixels and 5 fps. If the audio ever falls behind, it renders fewer pixels and frames. With `prefers-reduced-motion` the drifts freeze and it redraws every 30 s. Falls back to flat-shaded Canvas 2D without WebGL2. Text colour adapts to the ground beneath it. |
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
npm test             # node --test: season boundaries, recording mapping, score map, scene
```

## Rebuilding the data

Requires `ffmpeg`, `pdftoppm` (poppler), Python 3 with `numpy` and `Pillow`.

```bash
tools/fetch_audio.sh build/src                       # 12 MP3s from the Internet Archive (md5-checked)
python3 tools/build_audio.py build/src docs/audio    # trim silence, cut into FLAC segments + playlist
# put the four IMSLP PDFs in build/pdf as spring.pdf, summer.pdf, autumn.pdf, winter.pdf
python3 tools/build_score.py build/pdf docs/score docs/audio/manifest.json
python3 tools/build_dynamics.py docs/audio          # loudness envelope that drives the artwork
python3 tools/build_display_font.py LibreBodoni[wght].ttf docs/fonts/vivaldirt-bodoni-condensed.woff2
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

### Typography

The *Ghost in the Shell* (1995) title, by Teruhisa Tajima, is set in **Bodoni Bold Condensed**: Bitstream's
cut of ATF Bodoni Bold Condensed by Morris Fuller Benton. Tajima
[says he used Bodoni](https://naisthename.com/blogs/journal/teruhisatajima), and the specific cut is identified
[here](https://ms-06-zaku2.tumblr.com/post/6867244668/ghost-in-the-shell-%E6%94%BB%E6%AE%BB%E6%A9%9F%E5%8B%95%E9%9A%8A%E3%81%AE%E3%83%95%E3%82%A9%E3%83%B3%E3%83%88).
That font is commercial, so it cannot be shipped in this repository. Instead,
`tools/build_display_font.py` derives **Vivaldirt Bodoni Condensed** from
[Libre Bodoni](https://github.com/googlefonts/Libre-Bodoni) Bold, an OFL revival of Benton's ATF Bodoni. It
narrows the outlines to 62 % and thickens only the vertical stems, using a horizontal Minkowski sum of
2 × 26 units, so hairlines and serifs stay thin as in a real bold condensed.

Measured against the reference logo, every letter of GHOST SHELL matches its width / cap-height within 0.02
(G .67, H .72, O .68, S .49, T .64, E .60, L .60), and so do the stems (L .20, T .20, O .23). It is used for
the title and the time inscription only; the logo itself is not used. Information is set in IBM Plex Sans, and
small metadata in IBM Plex Mono.

### Software

- Paulstretch algorithm by Nasca Octavian Paul.
- The WebAssembly build in `docs/vendor/paulstretch/` comes from Oli Larkin's
  [paulstretch-for-web](https://github.com/olilarkin/paulstretch-for-web) /
  [libpaulstretch](https://github.com/olilarkin/libpaulstretch). It is GPL-2.0; see `docs/vendor/paulstretch/LICENSE`.
- [Trystero](https://github.com/dmotz/trystero) (MIT) and [@noble/secp256k1](https://github.com/paulmillr/noble-secp256k1) (MIT),
  bundled in `docs/vendor/trystero/` with their licences.
- Type: Vivaldirt Bodoni Condensed (modified [Libre Bodoni](https://github.com/googlefonts/Libre-Bodoni)) and
  [IBM Plex](https://github.com/IBM/plex), self-hosted in `docs/fonts/` under the SIL Open Font License.
- The rest of this project's code is public domain (see `LICENSE.md`).
