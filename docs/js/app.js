import { positionAt, scoreAt, fractionForBar, seasonStarts, SEASONS } from './seasons.js';
import { Engine } from './engine.js';
import { Artwork } from './art.js';
import { Presence } from './presence.js';

const $ = (id) => document.getElementById(id);
const BASE = new URL('../', import.meta.url);

const NAMES = {
  spring: { title: 'Spring', short: 'La primavera' },
  summer: { title: 'Summer', short: 'L’estate' },
  autumn: { title: 'Autumn', short: 'L’autunno' },
  winter: { title: 'Winter', short: 'L’inverno' },
};
const ROMAN = ['I', 'II', 'III'];
const SOUTHERN_TZ = /^(Australia|Antarctica)\/|^Pacific\/(Auckland|Chatham|Fiji|Tongatapu|Apia|Noumea|Efate)|^America\/(Argentina|Santiago|Sao_Paulo|Montevideo|Asuncion|La_Paz|Lima|Punta_Arenas)|^Africa\/(Johannesburg|Maputo|Harare|Lusaka|Windhoek|Gaborone|Maseru|Mbabane|Blantyre|Lubumbashi)|^Indian\/(Mauritius|Reunion|Antananarivo)/;

const state = {
  offset: 0, // ms added to the real clock (time travel)
  hemisphere: 'north',
  follow: true,
  viewPage: null, // {season, page} while browsing the score manually
  shown: null,
  lastSys: null,
  sheet: null,
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
const clockFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const longMoment = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function toLocalInput(t) {
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The four season boundaries of the cycle (starting at spring) containing t. */
function cycleAt(t, hemisphere) {
  const ev = seasonStarts(t, hemisphere);
  let i = ev.length - 1;
  while (i >= 0 && !(ev[i].index === 0 && ev[i].t <= t)) i--;
  return ev.slice(i, i + 5).map((e) => e.t);
}

// ---------- score sheet ----------
function scoreMovement(score, p) {
  return score.movements.find((m) => m.season === p.season && m.movement === p.movement.movement);
}
const pageUrl = (season, page) => new URL(`score/${season}-${String(page).padStart(2, '0')}.png`, BASE).href;

function showPage(season, page, pages) {
  const key = `${season}-${page}`;
  if (state.shown === key) return;
  state.shown = key;
  const img = $('page-img');
  img.src = pageUrl(season, page);
  img.alt = `${NAMES[season].title}, score page ${page} of ${pages}`;
}

function drawScoreSheet(p, score, mv, at) {
  $('score-title').textContent = ` · ${NAMES[p.season].short} · ${ROMAN[p.movement.movement - 1]}`;
  let season = p.season;
  let page = at.page;
  if (!state.follow && state.viewPage) ({ season, page } = state.viewPage);
  showPage(season, page, score.seasons[season].pages);
  $('score-page').textContent = `${page} / ${score.seasons[season].pages}`;
  const onPage = season === p.season && page === at.page;
  const pageEl = $('page');
  pageEl.classList.toggle('show', onPage);
  if (!onPage) return;
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

// ---------- main ----------
async function main() {
  const [manifest, playlist, score, dynamics] = await Promise.all([
    loadJSON('audio/manifest.json'),
    loadPlaylist('audio/playlist.m3u8'),
    loadJSON('score/score.json'),
    loadJSON('audio/dynamics.json').catch(() => null),
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

  // ----- the artwork -----
  const art = new Artwork($('art'), { base: BASE });
  const zones = () => {
    const r = (el) => el.getBoundingClientRect();
    const title = r($('zone-title').querySelector('.title'));
    const kick = r($('zone-title').querySelector('.kicker'));
    const nav = r($('zone-nav'));
    document.documentElement.style.setProperty('--nav-h', `${Math.round(innerHeight - nav.top)}px`);
    const union = (a, b) => ({ left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) });
    const pad = (a, x) => ({ left: a.left - x, top: a.top - x, right: a.right + x, bottom: a.bottom + x });
    art.setZones([
      union(title, kick),
      pad(r($('zone-clock').querySelector('.date-line')), 4),
      pad(r($('zone-where')), 6),
      pad(r(document.querySelector('.ident')), 6), pad(r($('presence')), 6),
      pad(nav, 0),
    ]);
    return nav.top / innerHeight;
  };
  let groundY = zones();
  addEventListener('resize', () => { groundY = zones(); });
  document.fonts?.ready.then(() => { groundY = zones(); });

  // the music's dynamics around the playhead (±3 s of recording ≈ ±10 hours)
  const intensityAt = (frame) => {
    if (!dynamics) return 0.5;
    const v = dynamics.values;
    const i = Math.floor(frame / manifest.sampleRate / dynamics.hopSeconds);
    let sum = 0;
    let n = 0;
    for (let k = i - 3; k <= i + 3; k++) { sum += v[((k % v.length) + v.length) % v.length]; n++; }
    return sum / n / 255;
  };

  // ----- presence -----
  const presence = new Presence({
    onChange: ({ status: st, count }) => {
      const el = $('presence');
      el.className = `presence mono ${st}`;
      $('presence-text').textContent = st === 'live' ? `${count ?? 0} listening`
        : st === 'connecting' ? 'Connecting'
          : st === 'off' ? 'Count off' : 'Count unavailable';
    },
  });
  const presenceOn = recall('presence') !== 'off';
  $('presence-on').checked = presenceOn;
  if (presenceOn) presence.start();
  else presence.stop();
  $('presence-on').addEventListener('change', (e) => {
    store('presence', e.target.checked ? 'on' : 'off');
    if (e.target.checked) presence.start(); else presence.stop();
  });

  // ----- audio -----
  let playing = false;
  const engine = new Engine({
    manifest,
    playlist,
    base: BASE,
    onState: (s) => {
      if (s.error) status(s.error, true);
      else if (s.loading) status('Fetching a few seconds of Vivaldi…');
      else if (s.bytes !== undefined && playing) status(`${(s.bytes / 1e6).toFixed(1)} MB of audio this session`);
    },
  });
  engine.setVolume(parseFloat($('volume').value));
  window.vivaldirt = { engine, manifest, score, art, presence }; // handy from the console

  function update() {
    const t = vnow();
    const p = positionAt(t, manifest, state.hemisphere);
    const mv = scoreMovement(score, p);
    const at = scoreAt(mv, p.movementFraction);
    const d = new Date(t);

    $('time').textContent = clockFmt.format(d);
    $('date').textContent = dateFmt.format(d);
    $('mode').hidden = !state.offset;
    $('where-main').textContent = `${NAMES[p.season].title} / ${ROMAN[p.movement.movement - 1]}`;
    $('where-title').textContent = p.movement.title;
    const barNo = Math.floor(at.bar) + mv.firstNumber;
    $('where-bar').textContent = `Bar ${barNo} of ${mv.measures - 1 + mv.firstNumber}`;

    const mvFrames = p.movement.end - p.movement.start;
    const msPerFrame = (1000 * p.stretch) / manifest.sampleRate;
    const curBar = Math.floor(at.bar);
    const fNext = fractionForBar(mv, curBar + 1);
    const toNextBar = (fNext - p.movementFraction) * mvFrames * msPerFrame;
    const toNextMv = (p.movement.end - p.frame) * msPerFrame;
    $('where-next').textContent = toNextMv <= toNextBar + 1000
      ? `Next movement in ${fmtDuration(toNextMv)}`
      : `Next bar in ${fmtDuration(toNextBar)}`;
    $('stretch').textContent = `Stretched ×${Math.round(p.stretch).toLocaleString()} — one second of the recording lasts ${fmtDuration(p.stretch * 1000)}. ${NAMES[p.season].title} runs ${shortDate.format(new Date(p.start))} – ${shortDate.format(new Date(p.end - 1))}.`;

    // feed the artwork
    const mi = manifest.movements.indexOf(p.movement);
    const nm = manifest.movements[(mi + 1) % manifest.movements.length];
    const sysIdx = mv.systems.indexOf(at.system);
    const other = mv.systems[sysIdx + 1] || mv.systems[sysIdx - 1];
    art.setMusic({
      t,
      key: `${p.season}${p.movement.movement}`,
      nextKey: `${nm.season}${nm.movement}`,
      mvFraction: p.movementFraction,
      season: p.season,
      nextSeason: SEASONS[(SEASONS.indexOf(p.season) + 1) % 4],
      seasonFraction: p.fraction,
      intensity: intensityAt(p.frame),
      hour: d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600,
      systems: [
        { url: pageUrl(p.season, at.page), system: at.system },
        other ? { url: pageUrl(p.season, other.page), system: other } : null,
      ],
      cursorX: at.x,
      barIndex: at.barIndex,
      pageAspect: score.pageAspect,
      groundY,
    });

    if (state.sheet === 'sheet-score') drawScoreSheet(p, score, mv, at);
    if (state.sheet === 'sheet-travel' && document.activeElement !== $('scrub')) syncScrub(t);

    const listening = playing && engine.ctx?.state === 'running';
    presence.setPlaying(listening);
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
      update();
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
    update();
  }
  function setPlayUI(on) {
    $('listen-label').textContent = on ? 'Pause' : 'Listen';
    $('nav-listen').setAttribute('aria-pressed', String(on));
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = on ? 'playing' : 'paused';
  }
  function resync() {
    const p = update();
    if (playing) engine.seek(p.frame, p.stretch);
  }
  function travelTo(t) {
    if (Number.isNaN(t)) return;
    state.offset = t - Date.now();
    setFollow(true);
    resync();
  }
  function backToNow() {
    state.offset = 0;
    $('when').value = toLocalInput(Date.now());
    setFollow(true);
    resync();
  }

  // ----- sheets -----
  const navFor = { 'sheet-travel': 'nav-travel', 'sheet-score': 'nav-score', 'sheet-about': 'nav-about' };
  function openSheet(id) {
    if (state.sheet === id) return closeSheet();
    if (state.sheet) closeSheet(false);
    state.sheet = id;
    $(id).hidden = false;
    $(navFor[id]).setAttribute('aria-expanded', 'true');
    if (id === 'sheet-score') { state.lastSys = null; state.shown = null; }
    if (id === 'sheet-travel') { $('when').value = toLocalInput(vnow()); syncScrub(vnow()); }
    update();
    $(id).querySelector('[data-close]').focus({ preventScroll: true });
  }
  function closeSheet(focusBack = true) {
    if (!state.sheet) return;
    const id = state.sheet;
    $(id).hidden = true;
    $(navFor[id]).setAttribute('aria-expanded', 'false');
    state.sheet = null;
    if (focusBack) $(navFor[id]).focus({ preventScroll: true });
  }
  $('nav-travel').addEventListener('click', () => openSheet('sheet-travel'));
  $('nav-score').addEventListener('click', () => openSheet('sheet-score'));
  $('nav-about').addEventListener('click', () => openSheet('sheet-about'));
  for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => closeSheet());
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheet();
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName) && document.activeElement.type !== 'range';
    if (e.key === ' ' && !typing && document.activeElement?.tagName !== 'BUTTON') {
      e.preventDefault();
      if (playing) pause(); else play();
    }
  });

  // ----- time travel -----
  function syncScrub(t) {
    const b = cycleAt(t, state.hemisphere);
    $('scrub').value = String((t - b[0]) / (b[4] - b[0]));
    $('scrub-out').textContent = longMoment.format(new Date(t));
  }
  const scrubTime = () => {
    const b = cycleAt(vnow(), state.hemisphere);
    return b[0] + parseFloat($('scrub').value) * (b[4] - b[0]);
  };
  $('scrub').addEventListener('input', () => {
    const t = scrubTime();
    $('scrub-out').textContent = longMoment.format(new Date(t));
    $('when').value = toLocalInput(t);
  });
  $('scrub').addEventListener('change', () => travelTo(scrubTime()));
  $('go').addEventListener('click', () => travelTo(new Date($('when').value).getTime()));
  $('now').addEventListener('click', backToNow);
  $('mode').addEventListener('click', backToNow);

  // ----- settings -----
  $('nav-listen').addEventListener('click', () => (playing ? pause() : play()));
  $('volume').addEventListener('input', (e) => {
    engine.setVolume(parseFloat(e.target.value));
    store('volume', e.target.value);
  });
  $('hemisphere').addEventListener('change', (e) => {
    state.hemisphere = e.target.value;
    store('hemisphere', state.hemisphere);
    resync();
  });

  // ----- score browsing -----
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
