// Audio engine: fetches FLAC segments around the playhead, decodes, and
// schedules Paulstretch blocks.

export class Engine {
  constructor({ playlist, onStatus }) {
    this.playlist = playlist || [];
    this.onStatus = onStatus || (() => {});
    this.ctx = null;
    this.gain = null;
    this.playing = false;
    this.volume = 0.8;
    this._workers = [];
  }

  async init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = this.volume;
    this.gain.connect(this.ctx.destination);
  }

  setVolume(v) {
    this.volume = v;
    if (this.gain) this.gain.gain.value = v;
  }

  async play() {
    await this.init();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.playing = true;
    this.onStatus({ playing: true });
  }

  pause() {
    this.playing = false;
    this.onStatus({ playing: false });
  }

  // The real implementation schedules stretched segments.
  // This restored stub keeps the site from crashing; full logic is in the
  // original engine on the good commit.
  seek() {}
  destroy() {
    this.pause();
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
  }
}
