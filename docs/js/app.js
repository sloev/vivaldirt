import { positionAt } from './seasons.js';
import { Engine } from './engine.js';

const $ = (id) => document.getElementById(id);
const BASE = new URL('.', import.meta.url);
const NAMES = {
  spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter'
};
const ROMAN = ['I', 'II', 'III'];

const state = {
  offset: 0,
  hemisphere: localStorage.getItem('hemisphere') || 'north',
  scoreMap: null,
  manifest: null,
  page: 1,
};

const vnow = () => Date.now() + state.offset;
const clockFmt = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});
const dateFmt = new Intl.DateTimeFormat(undefined, {
  day: 'numeric', month: 'long', year: 'numeric'
});

async function loadJSON(path) {
  const r = await fetch(new URL(path, BASE));
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.json();
}

async function loadPlaylist(path) {
  const r = await fetch(new URL(path, BASE));
  const text = await r.text();
  const base = new URL(path, BASE);
  return text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(u => new URL(u, base).href);
}

function frameAt(t) {
  const m = state.manifest;
  if (!m || !m.movements) return 0;
  const pos = positionAt(t, state.hemisphere);
  const mv = m.movements.find(
    (x) => x.season === pos.season && x.movement === pos.movement
  ) || m.movements.find((x) => x.season === pos.season);
  if (!mv) return 0;
  const len = mv.end - mv.start;
  return Math.floor(mv.start + (pos.movementFrac || 0) * len);
}

function stretchFactor(t) {
  const pos = positionAt(t, state.hemisphere);
  const seasonMs = pos.seasonEnd - pos.seasonStart;
  const m = state.manifest;
  if (!m || !m.movements) return 12500;
  const moves = m.movements.filter((x) => x.season === pos.season);
  const frames = moves.reduce((s, x) => s + (x.end - x.start), 0);
  const sr = m.sampleRate || 48000;
  const recMs = (frames / sr) * 1000;
  return Math.max(100, seasonMs / recMs);
}

let engine;
let lastSeason = '';

function updateWash(season) {
  const el = $('score-wash');
  if (!el || season === lastSeason) return;
  lastSeason = season;
  el.style.backgroundImage = `url(${new URL(`../score/${season}-01.png`, BASE).href})`;
}

function update() {
  try {
    const t = vnow();
    const pos = positionAt(t, state.hemisphere);
    if ($('time')) $('time').textContent = clockFmt.format(t);
    if ($('date')) $('date').textContent = dateFmt.format(t).toUpperCase();
    if ($('where')) $('where').textContent = `${NAMES[pos.season]} — ${ROMAN[pos.movement - 1]}.`;
    if ($('meta')) {
      const st = engine?.playing ? 'LIVE' : '';
      $('meta').textContent = `Bar ~${Math.max(1, Math.floor(pos.fraction * 160))} · ×${Math.round(stretchFactor(t))} ${st}`;
    }
    if ($('season-label')) $('season-label').textContent = `${NAMES[pos.season].toUpperCase()} / ${ROMAN[pos.movement - 1]}`;
    document.body.dataset.season = pos.season;
    updateWash(pos.season);
  } catch (err) {
    console.error(err);
  }
}

function openSheet(id) {
  document.querySelectorAll('.sheet').forEach(s => { s.hidden = true; });
  const el = $(id);
  if (el) el.hidden = false;
  if (id === 'sheet-score') showScorePage();
}
function closeSheets() {
  document.querySelectorAll('.sheet').forEach(s => { s.hidden = true; });
}

function showScorePage() {
  const pos = positionAt(vnow(), state.hemisphere);
  const season = pos.season;
  const page = state.page || 1;
  const img = $('page-img');
  if ($('score-title')) $('score-title').textContent = `· ${NAMES[season]}`;
  if ($('score-page')) $('score-page').textContent = String(page);
  if (img) {
    img.src = new URL(`../score/${season}-${String(page).padStart(2, '0')}.png`, BASE).href;
    img.onload = () => $('page')?.classList.add('show');
  }
}

function resyncAudio() {
  if (!engine?.playing) return;
  const t = vnow();
  engine.seek(frameAt(t), stretchFactor(t));
}

async function main() {
  let playlist = [];
  try {
    const [manifest, scoreMap, pl] = await Promise.all([
      loadJSON('../audio/manifest.json'),
      loadJSON('../score/score.json').catch(() => null),
      loadPlaylist('../audio/playlist.m3u8'),
    ]);
    state.manifest = manifest;
    state.scoreMap = scoreMap;
    playlist = pl;
  } catch (err) {
    console.warn('data load', err);
    if ($('meta')) $('meta').textContent = 'Data load failed';
  }

  engine = new Engine({
    manifest: state.manifest || { sampleRate: 48000, segmentFrames: 288000, totalFrames: 1e8 },
    playlist,
    base: new URL('../audio/', BASE),
    onState: (s) => {
      if (s.error && $('meta')) $('meta').textContent = s.error;
      else if (s.loading && $('meta')) $('meta').textContent = 'Loading audio…';
    },
  });

  const vol = localStorage.getItem('volume');
  if (vol != null && $('volume')) {
    $('volume').value = vol;
    engine.setVolume(+vol);
  }

  $('travel')?.addEventListener('click', () => openSheet('sheet-travel'));
  $('score-btn')?.addEventListener('click', () => openSheet('sheet-score'));
  $('about')?.addEventListener('click', () => openSheet('sheet-about'));
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeSheets));

  $('go')?.addEventListener('click', () => {
    const v = $('when')?.value;
    if (!v) return;
    state.offset = new Date(v).getTime() - Date.now();
    update();
    resyncAudio();
    closeSheets();
  });
  $('now')?.addEventListener('click', () => {
    state.offset = 0;
    if ($('when')) $('when').value = '';
    update();
    resyncAudio();
    closeSheets();
  });
  $('hemisphere')?.addEventListener('change', (e) => {
    state.hemisphere = e.target.value;
    try { localStorage.setItem('hemisphere', state.hemisphere); } catch {}
    update();
    resyncAudio();
  });
  if ($('hemisphere')) $('hemisphere').value = state.hemisphere;

  $('volume')?.addEventListener('input', (e) => {
    engine.setVolume(e.target.value);
    try { localStorage.setItem('volume', e.target.value); } catch {}
  });

  $('play')?.addEventListener('click', async () => {
    const btn = $('play');
    if (engine.playing) {
      await engine.pause();
      btn.setAttribute('aria-pressed', 'false');
      btn.textContent = 'Listen';
    } else {
      try {
        const t = vnow();
        await engine.start(frameAt(t), stretchFactor(t));
        btn.setAttribute('aria-pressed', 'true');
        btn.textContent = 'Pause';
      } catch (err) {
        console.error(err);
        if ($('meta')) $('meta').textContent = 'Audio failed: ' + (err.message || err);
      }
    }
  });

  $('prev')?.addEventListener('click', () => {
    state.page = Math.max(1, (state.page || 1) - 1);
    showScorePage();
  });
  $('next')?.addEventListener('click', () => {
    state.page = (state.page || 1) + 1;
    showScorePage();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  setInterval(update, 1000);
  update();
}

main().catch((err) => {
  console.error(err);
  if ($('meta')) $('meta').textContent = 'Failed: ' + err.message;
});
