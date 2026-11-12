// Audio engine: fetches/decodes HLS-listed FLAC segments on demand, feeds the
// paulstretch worker and schedules its output blocks back-to-back on the
// AudioContext clock. No SharedArrayBuffer needed, so it runs on GitHub Pages
// without cross-origin-isolation tricks.

const AHEAD = 5;
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

  async start(frame, stretch) {
    if (!this.ctx) await this._setup();
    await this.ctx.resume();
    this.playing = true;
    this.seek(frame, stretch);
    this._timer ||= setInterval(() => this._tick(), 250);
    this.onState({ playing: true });
  }

  async _setup() {
    const AC = window.AudioContext || window.webkitAudioContext;
    try {
      this.ctx = new AC({ sampleRate: this.manifest.sampleRate, latencyHint: 'playback' });
    } catch {
      this.ctx = new AC();
    }
    this.ratio = this.ctx.sampleRate / this.manifest.sampleRate;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}

    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    this.gain.connect(comp).connect(this.ctx.destination);

    this.worker = new Worker(new URL('./stretch-worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => this._onWorker(e.data);
    this.worker.onerror = (e) => this.onState({ error: `Audio worker failed: ${e.message || 'unknown error'}` });
    await new Promise((resolve, reject) => {
      this._ready = resolve;
      this._fail = reject;
      this.worker.postMessage({
        type: 'init',
        sampleRate: this.ctx.sampleRate,
        fftSize: Math.round(FFT * this.ratio),
        segmentFrames: Math.round(this.manifest.segmentFrames * this.ratio),
        totalFrames: Math.round(this.manifest.totalFrames * this.ratio),
      });
    });
  }

  _onWorker(msg) {
    switch (msg.type) {
      case 'ready':
        this._ready();
        break;
      case 'error':
        this.onState({ error: msg.message });
        this._fail?.(new Error(msg.message));
        break;
      case 'need':
        this._loadSegment(msg.index);
        break;
      case 'block':
        if (msg.generation !== this.generation) return;
        this.outstanding--;
        this._schedule(msg.L, msg.R);
        break;
    }
  }

  async _loadSegment(index, attempt = 0) {
    if (this.decoded.has(index)) {
      const [L, R] = this.decoded.get(index);
      this.worker.postMessage({ type: 'segment', index, L: L.slice(), R: R.slice() });
      return;
    }
    try {
      this.onState({ loading: true });
      const res = await fetch(new URL(this.playlist[index], this.base));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      this.bytes += buf.byteLength;
      const audio = await this.ctx.decodeAudioData(buf);
      const L = audio.getChannelData(0);
      const R = audio.numberOfChannels > 1 ? audio.getChannelData(1) : L;
      this.decoded.set(index, [L, R]);
      if (this.decoded.size > 4) this.decoded.delete(this.decoded.keys().next().value);
      this.worker.postMessage({ type: 'segment', index, L: L.slice(), R: R.slice() });
      this.onState({ loading: false, bytes: this.bytes });
    } catch (err) {
      if (attempt < 5) {
        setTimeout(() => this._loadSegment(index, attempt + 1), 1000 * 2 ** attempt);
      } else {
        this.onState({ error: `Could not load audio segment ${index}: ${err.message}` });
      }
    }
  }

  seek(frame, stretch) {
    if (!this.worker) return;
    this.generation++;
    this.outstanding = 0;
    const now = this.ctx.currentTime;
    const g = this.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + 0.08);
    for (const s of this.sources) {
      try { s.stop(now + 0.1); } catch {}
    }
    this.sources.clear();
    this.nextTime = now + 0.15;
    g.setValueAtTime(0, this.nextTime);
    g.linearRampToValueAtTime(this.playing ? this.volume * MAKEUP : 0, this.nextTime + 1.5);
    this.worker.postMessage({ type: 'seek', generation: this.generation, frame: frame * this.ratio, stretch });
    this._tick();
  }

  _schedule(L, R) {
    const ctx = this.ctx;
    this.blockFrames = L.length;
    const buf = ctx.createBuffer(2, L.length, ctx.sampleRate);
    buf.copyToChannel(L, 0);
    buf.copyToChannel(R, 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    if (this.nextTime < ctx.currentTime + 0.02) {
      this.nextTime = ctx.currentTime + 0.05;
      this.onState({ underrun: true });
    }
    src.start(this.nextTime);
    this.nextTime += L.length / ctx.sampleRate;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
    this._tick();
  }

  _tick() {
    if (!this.playing || !this.worker) return;
    while (this.outstanding < 3 && this.nextTime < this.ctx.currentTime + AHEAD) {
      this.outstanding++;
      this.worker.postMessage({ type: 'request', generation: this.generation });
    }
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, +v || 0));
    if (this.ctx && this.playing) {
      const g = this.gain.gain;
      const now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(this.volume * MAKEUP, now + 0.05);
    }
  }

  async pause() {
    this.playing = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this.ctx && this.gain) {
      const g = this.gain.gain;
      const now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + 0.3);
      setTimeout(() => { if (!this.playing) this.ctx.suspend(); }, 500);
    }
    this.onState({ playing: false });
  }

  destroy() {
    this.pause();
    if (this.worker) this.worker.terminate();
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
  }
}
