// Live listener count via CORVAX topics (https://corvax.sloev.workers.dev/),
// following CORVAX's own presence example: one key per tab, a presence-only
// peer, everyone on one topic watching who else is there.
//
// Here presence means *listening*: a tab publishes its lease while the music
// plays and withdraws it when paused or closed. The count is the other
// listeners currently present plus this tab if it is playing.

const CORVAX = 'https://cdn.jsdelivr.net/npm/@sloev/corvax@0.1/dist/corvax.min.js';
const SEED_KEY = 'corvax-seed';
const LEASE = 120e3; // 2 minutes, renewed automatically while published

export class Presence {
  constructor({ onChange }) {
    this.onChange = onChange;
    this.status = 'off'; // off | connecting | live | unavailable
    this.count = null;
    this.playing = false;
    this.joined = false;
    this.others = new Set();
    addEventListener('pagehide', () => { if (this.joined) this.room?.unpublish().catch(() => {}); });
  }

  _emit() {
    this.onChange?.({ status: this.status, count: this.count });
  }

  _show() {
    this.count = this.status === 'live' ? this.others.size + (this.playing ? 1 : 0) : null;
    this._emit();
  }

  async start() {
    if (this.me || this.starting) return;
    this.starting = true;
    this.status = 'connecting';
    this._emit();
    try {
      const { Peer } = await import(CORVAX);
      // one key per tab, so a reload stays the same listener;
      // presence only: no inbox, no storage, no relaying
      let seed = null;
      try { seed = sessionStorage.getItem(SEED_KEY); } catch {}
      this.me = await Peer.create({
        seed, listen: false, storage: false, relayFor: false,
        topicLimits: { lease: LEASE, renew: LEASE / 2 },
      });
      try { sessionStorage.setItem(SEED_KEY, this.me.seed); } catch {}

      // everyone joins the same topic and watches who else is there
      this.room = await this.me.topic(location.host + location.pathname);
      this.room.subscribe({
        presence: (e) => {
          if (e.presence === 'recent') this.others.add(e.address);
          else this.others.delete(e.address);
          this._show();
        },
      });
      this.status = 'live';
      await this._sync();
      this._show();
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
    this.me?.close().catch(() => {});
    this.me = null;
    this.room = null;
    this.joined = false;
    this.others.clear();
    this.status = 'off';
    this.count = null;
    this._emit();
  }

  setPlaying(on) {
    on = !!on;
    if (on === this.playing) return;
    this.playing = on;
    this._sync();
    this._show();
  }

  // a 2-minute lease while playing, withdrawn when paused
  async _sync() {
    if (!this.room || this.playing === this.joined) return;
    this.joined = this.playing;
    try {
      if (this.playing) await this.room.publish({ beacon: false, lease: LEASE });
      else await this.room.unpublish();
    } catch (e) {
      console.warn('presence publish', e);
      if (this.playing) this.joined = false; // retried on the next change
    }
  }
}
