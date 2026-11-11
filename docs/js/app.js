import { positionAt, SEASONS } from './seasons.js';

const $ = (id) => document.getElementById(id);
const NAMES = {
  spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter'
};
const ROMAN = ['I', 'II', 'III'];

const state = { offset: 0, hemisphere: 'north' };
const vnow = () => Date.now() + state.offset;

const clockFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

function update() {
  const t = vnow();
  const pos = positionAt(t, state.hemisphere);
  $('time').textContent = clockFmt.format(t);
  $('date').textContent = dateFmt.format(t).toUpperCase();
  $('where').textContent = `${NAMES[pos.season]} — ${ROMAN[pos.movement - 1]}.`;
  $('meta').textContent = `Bar ~${Math.max(1, Math.floor(pos.fraction * 160))} · next in several hours`;
  $('season-label').textContent = `${NAMES[pos.season].toUpperCase()} / ${ROMAN[pos.movement - 1]}`;
  document.body.dataset.season = pos.season;
}

function openSheet(id) {
  document.querySelectorAll('.sheet').forEach(s => s.hidden = true);
  const el = $(id);
  if (el) el.hidden = false;
}
function closeSheets() {
  document.querySelectorAll('.sheet').forEach(s => s.hidden = true);
}

$('travel').addEventListener('click', () => openSheet('sheet-travel'));
$('score-btn').addEventListener('click', () => openSheet('sheet-score'));
$('about').addEventListener('click', () => openSheet('sheet-about'));
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeSheets));

$('go').addEventListener('click', () => {
  const v = $('when').value;
  if (!v) return;
  state.offset = new Date(v).getTime() - Date.now();
  update();
  closeSheets();
});
$('now').addEventListener('click', () => {
  state.offset = 0;
  $('when').value = '';
  update();
  closeSheets();
});
$('hemisphere').addEventListener('change', (e) => {
  state.hemisphere = e.target.value;
  update();
});

$('play').addEventListener('click', () => {
  const btn = $('play');
  const on = btn.getAttribute('aria-pressed') === 'true';
  btn.setAttribute('aria-pressed', String(!on));
  btn.textContent = on ? 'Listen' : 'Pause';
});

setInterval(update, 1000);
update();
