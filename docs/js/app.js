import { positionAt, scoreAt, fractionForBar, seasonStarts, SEASONS } from './seasons.js';
import { Engine } from './engine.js';

const $ = (id) => document.getElementById(id);
const BASE = new URL('.', import.meta.url);

const NAMES = {
  spring: { title: 'Spring', short: 'La primavera' },
  summer: { title: 'Summer', short: "L'estate" },
  autumn: { title: 'Autumn', short: "L'autunno" },
  winter: { title: 'Winter', short: "L'inverno" },
};
const ROMAN = ['I', 'II', 'III'];

const state = {
  offset: 0,
  hemisphere: 'north',
  follow: true,
  viewPage: null,
};

function store(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}
function recall(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

const vnow = () => Date.now() + state.offset;

async function loadJSON(path) {
  const r = await fetch(new URL(path, BASE));
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

async function loadPlaylist(path) {
  const r = await fetch(new URL(path, BASE));
  const text = await r.text();
  const base = new URL(path, BASE);
  return text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(u => new URL(u, base).href);
}

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

function toLocalInput(t) {
  const d = new Date(t);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function main() {
  const [manifest, scoreMap, playlist] = await Promise.all([
    loadJSON('../audio/manifest.json'),
    loadJSON('../score/score.json'),
    loadPlaylist('../audio/playlist.m3u8'),
  ]);

  const engine = new Engine({ playlist, onStatus: (s) => {
    const el = $('status');
    if (s.error) { el.textContent = s.error; el.classList.add('error'); }
    else { el.textContent = s.message || ''; el.classList.remove('error'); }
  }});

  // Hemisphere from localStorage or guess
  state.hemisphere = recall('hemisphere') || 'north';
  $('hemisphere').value = state.hemisphere;

  const volume = recall('volume');
  if (volume != null) {
    $('volume').value = volume;
    engine.setVolume(+volume);
  }

  function update() {
    const t = vnow();
    const pos = positionAt(t, state.hemisphere);
    const name = NAMES[pos.season];
    document.body.dataset.season = pos.season;

    $('concerto').textContent = `${name.title} — ${name.short}`;
    $('movement').textContent = `${ROMAN[pos.movement-1]}. ` + (manifest.movements?.find(m => m.season === pos.season && m.movement === pos.movement)?.title || '');
    $('clock-now').textContent = clockFmt.format(t);
    $('bar').textContent = `Bar ${Math.floor(pos.fraction * 100) || 1}`;
    $('next-bar').textContent = `next in ~${fmtDuration((1 - (pos.movementFrac||0)) * ((pos.seasonEnd - pos.seasonStart)/3))}`;
    $('stretch').textContent = `×${Math.round( (pos.seasonEnd - pos.seasonStart) / 1000 / 60 / 3 ) || 12500} stretch`;

    // dial
    const dial = $('dial');
    // simplified dial update
    $('dial-season').textContent = name.title;
    $('dial-date').textContent = dateFmt.format(t);
    $('dial-time').textContent = clockFmt.format(t);

    const badge = $('mode-badge');
    if (state.offset) {
      badge.textContent = 'Travel';
      badge.className = 'badge travel';
    } else {
      badge.textContent = 'Live';
      badge.className = 'badge live';
    }
  }

  $('play').addEventListener('click', async () => {
    if (engine.playing) {
      engine.pause();
      $('play-label').textContent = 'Listen now';
    } else {
      await engine.play();
      $('play-label').textContent = 'Pause';
    }
  });

  $('volume').addEventListener('input', (e) => {
    engine.setVolume(+e.target.value);
    store('volume', e.target.value);
  });

  $('hemisphere').addEventListener('change', (e) => {
    state.hemisphere = e.target.value;
    store('hemisphere', state.hemisphere);
    update();
  });

  $('go').addEventListener('click', () => {
    const v = $('when').value;
    if (!v) return;
    state.offset = new Date(v).getTime() - Date.now();
    update();
  });

  $('now').addEventListener('click', () => {
    state.offset = 0;
    $('when').value = '';
    update();
  });

  setInterval(update, 1000);
  update();
}

main().catch(err => {
  console.error(err);
  const el = $('status');
  el.textContent = `Failed to start: ${err.message}`;
  el.classList.add('error');
});
