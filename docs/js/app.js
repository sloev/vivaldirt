import { positionAt, scoreAt, fractionForBar, seasonEvent, SEASONS } from './seasons.js';
import { Engine } from './engine.js';

const $ = (id) => document.getElementById(id);
const BASE = new URL('../', import.meta.url);

const NAMES = {
  spring: { title: 'Spring', concerto: 'Concerto No. 1 in E major, RV 269 – “La primavera”', short: 'La primavera' },
  summer: { title: 'Summer', concerto: 'Concerto No. 2 in G minor, RV 315 – “L’estate”', short: 'L’estate' },
  autumn: { title: 'Autumn', concerto: 'Concerto No. 3 in F major, RV 293 – “L’autunno”', short: 'L’autunno' },
  winter: { title: 'Winter', concerto: 'Concerto No. 4 in F minor, RV 297 – “L’inverno”', short: 'L’inverno' },
};
const ROMAN = ['I', 'II', 'III'];
const SOUTHERN_TZ = /^(Australia|Antarctica)\/|^Pacific\/(Auckland|Chatham|Fiji|Tongatapu|Apia|Noumea|Efate)|^America\/(Argentina|Santiago|Sao_Paulo|Montevideo|Asuncion|La_Paz|Lima|Punta_Arenas)|^Africa\/(Johannesburg|Maputo|Harare|Lusaka|Windhoek|Gaborone|Maseru|Mbabane|Blantyre|Lubumbashi)|^Indian\/(Mauritius|Reunion|Antananarivo)/;

const state = {
  offset: 0, // ms added to the real clock (time travel)
  hemisphere: 'north',
  follow: true,
  viewPage: null, // {season, page} while browsing manually
  shown: null,
  lastSys: null,
};

function store(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}
function recall(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

const vnow = () => Date.now() + state.offset;

// ---------- data ----------
async function loadJSON(path) {
  const r = await fetch(new URL(path, BASE));
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}
async function loadPlaylist(path) {
  const r = await fetch(new URL(path, BASE));
  const text = await r.text();
  const base = new URL(path, BASE);
  return text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((u) => new URL(u, base).href);
}

// ---------- formatting ----------
function fmtDuration(ms) {
  const s = Math.max(0, ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min`;
  return `${Math.round(s)} s`;
}
const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

function toLocalInput(t) {
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------- year dial ----------
function cycleAt(t, hemisphere) {
  // the four season boundaries of the cycle (starting at "spring") containing t
  const y = new Date(t).getUTCFullYear();
  const shift = hemisphere === 'south' ? 2 : 0;
  const ev = [];
  for (let yy = y - 2; yy <= y + 1; yy++) {
    for (let k = 0; k < 4; k++) ev.push({ season: (k + shift) % 4, t: seasonEvent(yy, k) });
  }
  let i = ev.length - 1;
  while (i >= 0 && !(ev[i].season === 0 && ev[i].t <= t)) i--;
  return ev.slice(i, i + 5).map((e) => e.t);
}

function polar(r, f) {
  const a = f * 2 * Math.PI - Math.PI / 2;
  return [r * Math.cos(a), r * Math.sin(a)];
}
function arcPath(r, f0, f1) {
  const [x0, y0] = polar(r, f0);
  const [x1, y1] = polar(r, f1);
  const large = f1 - f0 > 0.5 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

let dialKey = '';
function drawDial(p, manifest) {
  const b = cycleAt(vnow(), state.hemisphere);
  const span = b[4] - b[0];
  const key = `${b[0]}|${state.hemisphere}`;
  if (key !== dialKey) {
    dialKey = key;
    const gap = 0.004;
    let arcs = '';
    let mvts = '';
    for (let i = 0; i < 4; i++) {
      const f0 = (b[i] - b[0]) / span;
      const f1 = (b[i + 1] - b[0]) / span;
      const season = SEASONS[i];
      arcs += `<path class="arc" data-season="${season}" d="${arcPath(92, f0 + gap, f1 - gap)}" stroke="var(--${season})"/>`;
      const [lx, ly] = polar(104, (f0 + f1) / 2);
      arcs += `<text class="label" x="${lx.toFixed(1)}" y="${(ly + 2.5).toFixed(1)}" text-anchor="middle">${NAMES[season].title}</text>`;
      const [tx0, ty0] = polar(85, f0);
      const [tx1, ty1] = polar(99, f0);
      arcs += `<line class="tick" x1="${tx0}" y1="${ty0}" x2="${tx1}" y2="${ty1}"/>`;
      const mv = manifest.movements.filter((m) => m.season === season);
      const s0 = mv[0].start;
      const s1 = mv.at(-1).end;
      for (const m of mv) {
        const g0 = f0 + ((m.start - s0) / (s1 - s0)) * (f1 - f0);
        const g1 = f0 + ((m.end - s0) / (s1 - s0)) * (f1 - f0);
        mvts += `<path class="mvt" data-key="${season}${m.movement}" d="${arcPath(80, g0 + gap, g1 - gap)}"/>`;
      }
    }
    $('dial-arcs').innerHTML = arcs;
    $('dial-mvts').innerHTML = mvts;
  }
  for (const el of document.querySelectorAll('#dial .arc')) el.classList.toggle('current', el.dataset.season === p.season);
  for (const el of document.querySelectorAll('#dial .mvt')) el.classList.toggle('current', el.dataset.key === `${p.season}${p.movement.movement}`);
  const f = (vnow() - b[0]) / span;
  $('needle').setAttribute('transform', `rotate(${(f * 360).toFixed(3)})`);
}

// ---------- score ----------
function scoreMovement(score, p) {
  return score.movements.find((m) => m.season === p.season && m.movement === p.movement.movement);
}

function showPage(season, page, pages) {
  const key = `${season}-${page}`;
  if (state.shown === key) return;
  state.shown = key;
  const pp = String(page).padStart(2, '0');
  const img = $('page-img');
  img.src = new URL(`score/${season}-${pp}.png`, BASE).href;
  img.alt = `${NAMES[season].title}, score page ${page} of ${pages}`;
  // warm the cache for the following page
  if (page < pages) {
    const next = new Image();
    next.src = new URL(`score/${season}-${String(page + 1).padStart(2, '0')}.png`, BASE).href;
  }
}

function drawScore(p, score) {
  const mv = scoreMovement(score, p);
  const at = scoreAt(mv, p.movementFraction);
  const pages = score.seasons[p.season].pages;
  $('score-title').textContent = `${NAMES[p.season].short} · ${ROMAN[p.movement.movement - 1]}`;

  let season = p.season;
  let page = at.page;
  if (!state.follow && state.viewPage) ({ season, page } = state.viewPage);
  showPage(season, page, score.seasons[season].pages);
  $('score-page').textContent = `page ${page} / ${score.seasons[season].pages}`;

  const onPage = season === p.season && page === at.page;
  const pageEl = $('page');
  pageEl.classList.toggle('show', onPage);
  if (onPage) {
    const s = at.system;
    const pad = 0.012;
    const top = (s.top - pad) * 100;
    const height = (s.bottom - s.top + 2 * pad) * 100;
    Object.assign($('sys-mark').style, { top: `${top}%`, height: `${height}%` });
    Object.assign($('bar-mark').style, {
      top: `${top}%`, height: `${height}%`,
      left: `${s.bars[at.barIndex] * 100}%`, width: `${(s.bars[at.barIndex + 1] - s.bars[at.barIndex]) * 100}%`,
    });
    Object.assign($('cursor').style, { top: `${top}%`, height: `${height}%`, left: `${at.x * 100}%` });
    const sysKey = `${season}-${page}-${s.top}`;
    if (state.follow && state.lastSys !== sysKey) {
      state.lastSys = sysKey;
      requestAnimationFrame(() => {
        const box = $('score-scroll');
        const h = pageEl.offsetHeight;
        const y = pageEl.offsetTop + ((s.top + s.bottom) / 2) * h - box.clientHeight / 2;
        box.scrollTo({ top: Math.max(0, y) });
      });
    }
  }
  return { mv, at };
}

// ---------- main ----------
async function main() {
  const [manifest, playlist, score] = await Promise.all([
    loadJSON('audio/manifest.json'),
    loadPlaylist('audio/playlist.m3u8'),
    loadJSON('score/score.json'),
  ]);

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  state.hemisphere = recall('hemisphere') || (SOUTHERN_TZ.test(tz) ? 'south' : 'north');
  $('hemisphere').value = state.hemisphere;
  const vol = parseFloat(recall('volume'));
  if (!Number.isNaN(vol)) $('volume').value = vol;

  const status = (text, isError = false) => {
    $('status').textContent = text;
    $('status').classList.toggle('error', isError);
  };

  let playing = false;
  const engine = new Engine({
    manifest,
    playlist,
    base: BASE,
    onState: (s) => {
      if (s.error) status(s.error, true);
      else if (s.loading) status('Fetching a few seconds of Vivaldi…');
      else if (s.bytes !== undefined && playing) status(`Playing · ${(s.bytes / 1e6).toFixed(1)} MB of audio loaded this session`);
    },
  });
  engine.setVolume(parseFloat($('volume').value));
  window.vivaldirt = { engine, manifest, score }; // handy for debugging from the console

  let lastSeason = null;
  function update() {
    const t = vnow();
    const p = positionAt(t, manifest, state.hemisphere);
    if (p.season !== lastSeason) {
      document.body.dataset.season = p.season;
      lastSeason = p.season;
    }
    const d = new Date(t);
    $('dial-season').textContent = NAMES[p.season].title;
    $('dial-date').textContent = dateFmt.format(d);
    $('dial-time').textContent = timeFmt.format(d);
    $('clock-now').textContent = state.offset ? `${dateFmt.format(d)} ${timeFmt.format(d)}` : `${Math.round(p.fraction * 1000) / 10}% through ${NAMES[p.season].title.toLowerCase()}`;
    $('mode-badge').textContent = state.offset ? 'Time travel' : 'Live';
    $('mode-badge').className = `badge ${state.offset ? 'travel' : 'live'}`;
    drawDial(p, manifest);

    const { mv, at } = drawScore(p, score);
    $('concerto').textContent = NAMES[p.season].concerto;
    $('movement').textContent = `${ROMAN[p.movement.movement - 1]}. ${p.movement.title}`;
    const barNo = Math.floor(at.bar) + mv.firstNumber;
    const lastNo = mv.measures - 1 + mv.firstNumber;
    $('bar').textContent = `Bar ${barNo} of ${lastNo}`;
    $('meter-fill').style.width = `${(p.movementFraction * 100).toFixed(3)}%`;

    // time until the next bar / movement
    const mvFrames = p.movement.end - p.movement.start;
    const msPerFrame = (1000 * p.stretch) / manifest.sampleRate;
    const curBar = Math.floor(at.bar);
    const fNext = fractionForBar(mv, curBar + 1);
    const barMs = (fNext - fractionForBar(mv, curBar)) * mvFrames * msPerFrame;
    const toNextBar = (fNext - p.movementFraction) * mvFrames * msPerFrame;
    const toNextMv = (p.movement.end - p.frame) * msPerFrame;
    const nextIsMovement = toNextMv <= toNextBar + 1000;
    $('next-bar').textContent = nextIsMovement
      ? `Next movement in ${fmtDuration(toNextMv)} (${shortDate.format(new Date(t + toNextMv))})`
      : `Next bar in ${fmtDuration(toNextBar)} · each bar lasts about ${fmtDuration(barMs)}`;
    $('stretch').textContent = `Stretched ×${Math.round(p.stretch).toLocaleString()}: one second of the recording lasts ${fmtDuration(p.stretch * 1000)}. ${NAMES[p.season].title} ends ${shortDate.format(new Date(p.end))}.`;

    if (playing) engine.setStretch(p.stretch);
    if ('mediaSession' in navigator && playing) {
      const key = `${p.season}${p.movement.movement}`;
      if (navigator.mediaSession.metadata?.album !== key) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: `${NAMES[p.season].title} – ${ROMAN[p.movement.movement - 1]}. ${p.movement.title}`,
          artist: 'Vivaldi · John Harrison & Wichita State University Chamber Players',
          album: key,
          artwork: [{ src: new URL('icons/icon-512.png', BASE).href, sizes: '512x512', type: 'image/png' }],
        });
      }
    }
    return p;
  }

  async function play() {
    playing = true;
    setPlayUI(true);
    status('Starting…');
    const p = update();
    try {
      await engine.start(p.frame, p.stretch);
    } catch (err) {
      playing = false;
      setPlayUI(false);
      status(`Audio could not start: ${err.message}`, true);
    }
  }
  function pause() {
    playing = false;
    engine.pause();
    setPlayUI(false);
    status('');
  }
  function setPlayUI(on) {
    $('play-icon').setAttribute('d', on ? 'M6 5h4v14H6zm8 0h4v14h-4z' : 'M8 5v14l11-7z');
    $('play-label').textContent = on ? 'Pause' : 'Listen now';
    $('play').setAttribute('aria-label', on ? 'Pause' : 'Play');
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = on ? 'playing' : 'paused';
  }
  function resync() {
    const p = update();
    if (playing) engine.seek(p.frame, p.stretch);
  }

  $('play').addEventListener('click', () => (playing ? pause() : play()));
  $('volume').addEventListener('input', (e) => {
    engine.setVolume(parseFloat(e.target.value));
    store('volume', e.target.value);
  });
  $('when').value = toLocalInput(vnow());
  $('go').addEventListener('click', () => {
    const t = new Date($('when').value).getTime();
    if (Number.isNaN(t)) return;
    state.offset = t - Date.now();
    state.follow = true;
    setFollow(true);
    resync();
  });
  $('now').addEventListener('click', () => {
    state.offset = 0;
    $('when').value = toLocalInput(Date.now());
    setFollow(true);
    resync();
  });
  $('hemisphere').addEventListener('change', (e) => {
    state.hemisphere = e.target.value;
    store('hemisphere', state.hemisphere);
    resync();
  });

  function setFollow(on) {
    state.follow = on;
    if (on) {
      state.viewPage = null;
      state.lastSys = null;
    }
    $('follow').classList.toggle('on', on);
    $('follow').setAttribute('aria-pressed', String(on));
  }
  function browse(delta) {
    const p = positionAt(vnow(), manifest, state.hemisphere);
    const cur = state.viewPage || { season: p.season, page: scoreAt(scoreMovement(score, p), p.movementFraction).page };
    let { season, page } = cur;
    page += delta;
    let si = SEASONS.indexOf(season);
    if (page < 1) { si = (si + 3) % 4; season = SEASONS[si]; page = score.seasons[season].pages; }
    if (page > score.seasons[season].pages) { si = (si + 1) % 4; season = SEASONS[si]; page = 1; }
    state.viewPage = { season, page };
    setFollow(false);
    state.viewPage = { season, page };
    update();
    $('score-scroll').scrollTo({ top: 0 });
  }
  $('prev').addEventListener('click', () => browse(-1));
  $('next').addEventListener('click', () => browse(1));
  $('follow').addEventListener('click', () => { setFollow(true); update(); });

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', play);
    navigator.mediaSession.setActionHandler('pause', pause);
  }
  // If the OS suspended audio (phone locked, call, …) the audio clock stopped
  // while the real one kept going: jump back to the present on return.
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && playing && engine.ctx && engine.ctx.state !== 'running') {
      await engine.ctx.resume().catch(() => {});
      resync();
    }
  });

  update();
  setInterval(update, 1000);

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register(new URL('sw.js', BASE)).catch(() => {});
  }
}

main().catch((err) => {
  const el = document.getElementById('status');
  el.textContent = `Failed to start: ${err.message}`;
  el.classList.add('error');
});
