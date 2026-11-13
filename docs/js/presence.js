// Live count via CORVAX's presence() helper (https://corvax.sloev.workers.dev/):
// everyone with this page open and visible, this tab included. One key per
// tab, a 2-minute lease, and hidden or closed tabs leave at once.

const CORVAX = 'https://cdn.jsdelivr.net/npm/@sloev/corvax@0.1/dist/corvax.min.js';

export class Presence {
  constructor({ onChange }) {
    this.onChange = onChange;
    this.status = 'off'; // off | connecting | live | unavailable
    this.count = null;
  }

  _emit() {
    this.onChange?.({ status: this.status, count: this.count });
  }

  async start() {
    if (this.info || this.starting) return;
    this.starting = true;
    this.status = 'connecting';
    this._emit();
    try {
      const { presence } = await import(CORVAX);
      this.info = await presence((n) => {
        this.status = 'live';
        this.count = n;
        this._emit();
      });
    } catch (err) {
      console.warn('presence unavailable:', err);
      this.status = 'unavailable';
      this.count = null;
      this._emit();
    } finally {
      this.starting = false;
    }
  }

  stop() {
    this.info?.leave().catch(() => {});
    this.info = null;
    this.status = 'off';
    this.count = null;
    this._emit();
  }

  // the count no longer depends on playback
  setPlaying() {}
}
