import { positionAt, SEASONS } from './seasons.js';
import { Engine } from './engine.js';
import { Art2D } from './art2d.js';
import { Presence } from './presence.js';

const $ = (id) => document.getElementById(id);
const BASE = new URL('.', import.meta.url);
const NAMES = {
  spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter'
};
const ROMAN = ['I', 'II', 'III'];

function guessHemisphere() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (/Australia|Pacific\/Auckland|Pacific\/Fiji|Africa\/Johannesburg|America\/Sao_Paulo|America\/Argentina|America\/Santiago|Antarctica|Indian\/Mauritius/.test(tz)) {
      return 'south';
    }
    const loc = (navigator.language || '').toLowerCase();
    if (loc.endsWith('-au') || loc.endsWith('-nz') || loc.endsWith('-za') || loc.endsWith('-ar') || loc.endsWith('-cl') || loc.endsWith('-br')) {
      return 'south';
    }
  } catch {}
  return 'north';
}

const state = {
  offset: 0,
  hemisphere: localStorage.getItem('hemisphere') || guessHemisphere(),
  manifest: null,
  openSheet: null,
};

const vnow = () => Date.now() + state.offset;

// ----- install (shown in About only when not installed) -----
let installPrompt = null;
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function updateInstall() {
  const box = $('install');
  if (!box) return;
  const canPrompt = !!installPrompt && !isInstalled();
  const iosHint = isIOS && !isInstalled();
  $('install-btn').hidden = !canPrompt;
  $('install-ios').hidden = !(iosHint && !canPrompt);
  box.hidden = !(canPrompt || iosHint);
}
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // keep it for the button instead of the browser's own banner
  installPrompt = e;
  updateInstall();
});
addEventListener('appinstalled', () => { installPrompt = null; updateInstall(); });
function initInstall() {
  updateInstall();
  $('install-btn')?.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    installPrompt = null;
    updateInstall();
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initInstall);
else initInstall();
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
  return Math.floor(mv.start + (pos.movementFrac || 0) * (mv.end - mv.start));
}

function stretchFactor(t) {
  const pos = positionAt(t, state.hemisphere);
  const seasonMs = pos.seasonEnd - pos.seasonStart;
  const m = state.manifest;
  if (!m || !m.movements) return 12500;
  const frames = m.movements.filter((x) => x.season === pos.season).reduce((s, x) => s + (x.end - x.start), 0);
  const sr = m.sampleRate || 48000;
  return Math.max(100, seasonMs / ((frames / sr) * 1000));
}

let engine;
let art;
let presence;

function renderPresence({ status, count }) {
  const el = $('presence');
  const text = $('presence-text');
  if (!text) return;
  el?.classList.toggle('live', status === 'live');
  if (status === 'connecting') text.textContent = '…';
  else if (status === 'unavailable') text.textContent = '—';
  else if (count == null) text.textContent = '—';
  else text.textContent = count === 1 ? '1 listening' : `${count} listening`;
}

function update() {
  try {
    const t = vnow();
    const pos = positionAt(t, state.hemisphere);
    if ($('time')) $('time').textContent = clockFmt.format(t);
    if ($('date')) $('date').textContent = dateFmt.format(t).toUpperCase();
    if ($('where')) $('where').textContent = `${NAMES[pos.season]} — ${ROMAN[pos.movement - 1]}.`;
    const aboutStretch = $('about-stretch');
    if (aboutStretch) {
      aboutStretch.textContent = `Right now the stretch factor is about ×${Math.round(stretchFactor(t))}.`;
    }
    document.body.dataset.season = pos.season;
    art?.setMusic({
      fraction: pos.fraction,
      seasonIndex: SEASONS.indexOf(pos.season),
      seasonName: pos.season,
      now: t,
    });
  } catch (err) {
    console.error(err);
  }
}

function openSheet(id) {
  document.querySelectorAll('.sheet').forEach(s => { s.hidden = true; });
  const el = $(id);
  if (!el) return;
  el.hidden = false;
  state.openSheet = id;
  if (!history.state || history.state.sheet !== id) history.pushState({ sheet: id }, '');
}

function closeSheets(fromPop) {
  document.querySelectorAll('.sheet').forEach(s => { s.hidden = true; });
  const had = state.openSheet;
  state.openSheet = null;
  if (had && !fromPop && history.state?.sheet) history.back();
}

function resyncAudio() {
  if (!engine?.playing) return;
  const t = vnow();
  engine.seek(frameAt(t), stretchFactor(t));
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    // Auto-update: check periodically and activate waiting workers
    const ping = () => reg.update().catch(() => {});
    setInterval(ping, 60_000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') ping();
    });
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          nw.postMessage('SKIP_WAITING');
        }
      });
    });
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  }).catch(() => {});
}

async function main() {
  const canvas = $('art');
  if (canvas) art = new Art2D(canvas);

  presence = new Presence({ onChange: renderPresence });
  presence.start();

  let playlist = [];
  try {
    const [manifest, pl] = await Promise.all([
      loadJSON('../audio/manifest.json'),
      loadPlaylist('../audio/playlist.m3u8'),
    ]);
    state.manifest = manifest;
    playlist = pl;
  } catch (err) {
    console.warn('data load', err);
  }

  engine = new Engine({
    manifest: state.manifest || { sampleRate: 48000, segmentFrames: 288000, totalFrames: 1e8 },
    playlist,
    base: new URL('../audio/', BASE),
    onState: (s) => {
      if (s.error) console.warn(s.error);
    },
  });

  $('travel')?.addEventListener('click', () => openSheet('sheet-travel'));
  $('about')?.addEventListener('click', () => openSheet('sheet-about'));
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeSheets(false)));
  addEventListener('popstate', () => { if (state.openSheet) closeSheets(true); });

  $('go')?.addEventListener('click', () => {
    const v = $('when')?.value;
    if (!v) return;
    state.offset = new Date(v).getTime() - Date.now();
    update(); resyncAudio(); closeSheets(false);
  });
  $('now')?.addEventListener('click', () => {
    state.offset = 0;
    if ($('when')) $('when').value = '';
    update(); resyncAudio(); closeSheets(false);
  });
  $('hemisphere')?.addEventListener('change', (e) => {
    state.hemisphere = e.target.value;
    try { localStorage.setItem('hemisphere', state.hemisphere); } catch {}
    update(); resyncAudio();
  });
  if ($('hemisphere')) $('hemisphere').value = state.hemisphere;

  $('play')?.addEventListener('click', async () => {
    const btn = $('play');
    if (engine.playing) {
      await engine.pause();
      btn.setAttribute('aria-pressed', 'false');
      btn.textContent = 'Listen';
      presence?.setPlaying(false);
    } else {
      try {
        const t = vnow();
        await engine.start(frameAt(t), stretchFactor(t));
        btn.setAttribute('aria-pressed', 'true');
        btn.textContent = 'Pause';
        presence?.setPlaying(true);
      } catch (err) {
        console.error(err);
      }
    }
  });

  registerSW();

  setInterval(update, 1000);
  update();
  // Re-measure fade after first paint (fonts/layout)
  requestAnimationFrame(() => art?._measureFade?.());
}

main().catch((err) => console.error(err));
