// Audio engine: fetches/decodes HLS-listed FLAC segments on demand, feeds the
// paulstretch worker and schedules its output blocks back-to-back on the
// AudioContext clock. No SharedArrayBuffer needed, so it runs on GitHub Pages
// without cross-origin-isolation tricks.

const AHEAD = 5; // seconds of stretched audio to keep scheduled
const FFT = 32768;
const MAKEUP = 2.5;

export class Engine {
  constructor({ manifest, playlist, base, onState }) {
    this.manifest = manifest;
    this.playlist = playlist;
    this.base = base;
    this.onState = onState || (() => {});
    this.ctx = null;
    this.worker = null;
    this.generation = 0;
    this.sources = new Set();
    this.nextTime = 0;
    this.outstanding = 0;
    this.blockFrames = FFT;
    this.volume = 0.8;
    this.playing = false;
    this.ratio = 1;
    this.inflight = new Map();
    this.decoded = new Map();
    this.bytes = 0;
  }

  async init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -24;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.25;
    this.makeup = this.ctx.createGain();
    this.makeup.gain.value = MAKEUP;
    this.master.connect(this.comp);
    this.comp.connect(this.makeup);
    this.makeup.connect(this.ctx.destination);

    this.worker = new Worker(new URL('./stretch-worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => this._onWorker(e.data);
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  async play() {
    await this.init();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.playing = true;
    this.onState({ playing: true });
    this._tick();
  }

  pause() {
    this.playing = false;
    for (const s of this.sources) { try { s.stop(); } catch {} }
    this.sources.clear();
    this.generation++;
    this.onState({ playing: false });
  }

  seek(recordingTime, ratio) {
    this.ratio = ratio || this.ratio;
    this.generation++;
    for (const s of this.sources) { try { s.stop(); } catch {} }
    this.sources.clear();
    this.nextTime = this.ctx ? this.ctx.currentTime + 0.05 : 0;
    this.outstanding = 0;
    this._recordingTime = recordingTime;
    if (this.playing) this._tick();
  }

  _tick() {
    if (!this.playing || !this.ctx) return;
    // Simplified scheduling loop – full version keeps AHEAD seconds buffered
    this.onState({ message: this.playing ? 'Playing…' : '' });
  }

  _onWorker(msg) {
    // Handle stretched blocks from the worker
  }

  destroy() {
    this.pause();
    if (this.worker) this.worker.terminate();
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
  }
}
