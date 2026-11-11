import { positionAt } from './seasons.js';

const $ = (id) => document.getElementById(id);
const NAMES = {
  spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter'
};
const ROMAN = ['I', 'II', 'III'];

const state = { offset: 0, hemisphere: localStorage.getItem('hemisphere') || 'north' };
const vnow = () => Date.now() + state.offset;

const clockFmt = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});
const dateFmt = new Intl.DateTimeFormat(undefined, {
  day: 'numeric', month: 'long', year: 'numeric'
});

function update() {
  try {
    const t = vnow();
    const pos = positionAt(t, state.hemisphere);
    const timeEl = $('time');
    const dateEl = $('date');
    const whereEl = $('where');
    const metaEl = $('meta');
    const seasonEl = $('season-label');
    if (timeEl) timeEl.textContent = clockFmt.format(t);
    if (dateEl) dateEl.textContent = dateFmt.format(t).toUpperCase();
    if (whereEl) whereEl.textContent = `${NAMES[pos.season]} — ${ROMAN[pos.movement - 1]}.`;
    if (metaEl) metaEl.textContent = `Bar ~${Math.max(1, Math.floor(pos.fraction * 160))} · stretch ~×12500`;
    if (seasonEl) seasonEl.textContent = `${NAMES[pos.season].toUpperCase()} / ${ROMAN[pos.movement - 1]}`;
    document.body.dataset.season = pos.season;
  } catch (err) {
    console.error('update', err);
  }
}

function openSheet(id) {
  document.querySelectorAll('.sheet').forEach(s => { s.hidden = true; });
  const el = $(id);
  if (el) el.hidden = false;
}
function closeSheets() {
  document.querySelectorAll('.sheet').forEach(s => { s.hidden = true; });
}

function bind() {
  const travel = $('travel');
  const scoreBtn = $('score-btn');
  const about = $('about');
  const play = $('play');
  if (travel) travel.addEventListener('click', () => openSheet('sheet-travel'));
  if (scoreBtn) scoreBtn.addEventListener('click', () => openSheet('sheet-score'));
  if (about) about.addEventListener('click', () => openSheet('sheet-about'));
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeSheets));

  const go = $('go');
  const nowBtn = $('now');
  const when = $('when');
  const hemisphere = $('hemisphere');
  if (go) go.addEventListener('click', () => {
    if (!when || !when.value) return;
    state.offset = new Date(when.value).getTime() - Date.now();
    update();
    closeSheets();
  });
  if (nowBtn) nowBtn.addEventListener('click', () => {
    state.offset = 0;
    if (when) when.value = '';
    update();
    closeSheets();
  });
  if (hemisphere) {
    hemisphere.value = state.hemisphere;
    hemisphere.addEventListener('change', (e) => {
      state.hemisphere = e.target.value;
      try { localStorage.setItem('hemisphere', state.hemisphere); } catch {}
      update();
    });
  }
  if (play) play.addEventListener('click', () => {
    const on = play.getAttribute('aria-pressed') === 'true';
    play.setAttribute('aria-pressed', String(!on));
    play.textContent = on ? 'Listen' : 'Pause';
  });
}

// Register SW with new version so old caches are dropped
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

bind();
setInterval(update, 1000);
update();
