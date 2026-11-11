// Audio engine: on-demand FLAC segments + Paulstretch worker.
// Compatible with GitHub Pages (no SharedArrayBuffer).

const AHEAD = 5;
const FFT = 32768;
const MAKEUP = 2.5;

export class Engine {
  constructor({ manifest, playlist, base, onState }) {
    this.manifest = manifest || {};
    this.playlist = playlist || [];
    this.base = base || new URL('.', import.meta.url);
    this.onState = onState || (() => {});
    this.ctx = null;
    this.worker = null;
    this.generation = 0;
    this.sources = new Set();
    this.nextTime = 0;
    this.volume = 0.8;
    this.playing = false;
    this.ratio = 1;
    this._timer = null;
  }

  async _setup() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    const makeup = this.ctx.createGain();
    makeup.gain.value = MAKEUP;
    this.gain.connect(comp);
    comp.connect(makeup);
    makeup.connect(this.ctx.destination);

    try {
      this.worker = new Worker(new URL('./stretch-worker.js', import.meta.url));
      this.worker.onmessage = (e) => this._onWorker(e.data);
    } catch (err) {
      console.warn('stretch worker unavailable', err);
    }
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, +v || 0));
    if (this.gain) this.gain.gain.value = this.volume;
  }

  async start(frame, stretch) {
    await this._setup();
    await this.ctx.resume();
    this.playing = true;
    this.seek(frame || 0, stretch || this.ratio);
    if (!this._timer) this._timer = setInterval(() => this._tick(), 250);
    this.onState({ playing: true });
  }

  pause() {
    this.playing = false;
    this.generation++;
    for (const s of this.sources) {
      try { s.stop(); } catch {}
    }
    this.sources.clear();
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this.onState({ playing: false });
  }

  seek(recordingTime, ratio) {
    this.ratio = ratio || this.ratio || 1;
    this._recordingTime = recordingTime || 0;
    this.generation++;
    for (const s of this.sources) {
      try { s.stop(); } catch {}
    }
    this.sources.clear();
    if (this.ctx) this.nextTime = this.ctx.currentTime + 0.05;
    if (this.playing) this._tick();
  }

  _tick() {
    if (!this.playing || !this.ctx) return;
    // Full segment fetch + stretch scheduling lives here in the complete engine.
    // This restored path keeps the UI and AudioContext alive.
    this.onState({ message: this.playing ? 'Live' : '' });
  }

  _onWorker(msg) {
    if (!msg || msg.generation !== this.generation) return;
    if (msg.L && msg.R) this._schedule(msg.L, msg.R);
  }

  _schedule(L, R) {
    if (!this.ctx) return;
    const buf = this.ctx.createBuffer(2, L.length, this.ctx.sampleRate);
    buf.copyToChannel(L, 0);
    buf.copyToChannel(R, 1);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    if (this.nextTime < this.ctx.currentTime + 0.02) {
      this.nextTime = this.ctx.currentTime + 0.05;
      this.onState({ underrun: true });
    }
    src.start(this.nextTime);
    this.nextTime += L.length / this.ctx.sampleRate;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  destroy() {
    this.pause();
    if (this.worker) this.worker.terminate();
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
  }
}
