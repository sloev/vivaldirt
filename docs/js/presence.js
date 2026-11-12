// Live listener count via CORVAX topics (https://corvax.sloev.workers.dev/).
//
// Everyone who is listening publishes a signed, leased presence record on
// one topic; the count is this browser (if listening) plus the other
// addresses with a current lease. A browser keeps one CORVAX identity (its
// seed is stored locally), so several tabs count as one listener; tabs agree
// over a BroadcastChannel so a paused tab never withdraws a playing one.

const CORVAX = 'https://cdn.jsdelivr.net/npm/@sloev/corvax@0.1/dist/corvax.min.js';
const TOPIC = 'vivaldirt.stream listeners';
const SEED_KEY = 'vivaldirt.corvax.seed';
// short leases so a closed tab drops out within a few minutes even if it
// could not withdraw (CORVAX renews them automatically while published)
const LIMITS = { lease: 180e3, renew: 75e3 };
const SEARCH_MS = 30_000;
const TAB_STALE_MS = 15_000;

export class Presence {
  constructor({ onChange }) {
    this.onChange = onChange;
    this.status = 'off'; // off | connecting | live | unavailable
    this.count = null;
    this.localPlaying = false;
    this.others = 0;
    this.published = false;
    this.tabId = Math.random().toString(36).slice(2);
    this.tabs = new Map(); // other tabs of this browser: id -> { playing, at }
    try {
      this.bc = new BroadcastChannel('vivaldirt-presence');
      this.bc.onmessage = (e) => {
        const d = e.data;
        if (!d || typeof d.tab !== 'string') return;
        if (d.gone) this.tabs.delete(d.tab);
        else this.tabs.set(d.tab, { playing: !!d.playing, at: Date.now() });
        this._sync();
      };
    } catch { this.bc = null; }
    addEventListener('pagehide', () => {
      this.bc?.postMessage({ tab: this.tabId, gone: true });
      // withdraw our lease unless another tab of this browser keeps playing
      this.localPlaying = false;
      if (!this._anyPlaying() && this.published) this.topic?.unpublish().catch(() => {});
    });
  }

  _emit() {
    this.onChange?.({ status: this.status, count: this.count });
  }

  async start() {
    if (this.peer || this.starting) return;
    this.starting = true;
    this.status = 'connecting';
    this._emit();
    try {
      const { Peer } = await import(CORVAX);
      let seed = null;
      try { seed = localStorage.getItem(SEED_KEY); } catch {}
      this.peer = await Peer.create({ ...(seed ? { seed } : {}), topicLimits: LIMITS });
      try { localStorage.setItem(SEED_KEY, this.peer.seed); } catch {}
      this.topic = await this.peer.topic(TOPIC);
      this.topic.subscribe({ presence: () => this._search() });
      await this._search(true);
      this.timer = setInterval(() => {
        this.bc?.postMessage({ tab: this.tabId, playing: this.localPlaying });
        this._search();
      }, SEARCH_MS);
      this._sync();
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
    clearInterval(this.timer);
    this.peer?.close().catch(() => {});
    this.peer = null;
    this.topic = null;
    this.published = false;
    this.status = 'off';
    this.count = null;
    this._emit();
  }

  setPlaying(on) {
    on = !!on;
    if (on === this.localPlaying) return;
    this.localPlaying = on;
    this.bc?.postMessage({ tab: this.tabId, playing: on });
    this._sync();
  }

  _anyPlaying() {
    const now = Date.now();
    let on = this.localPlaying;
    for (const [id, t] of this.tabs) {
      if (now - t.at > TAB_STALE_MS) this.tabs.delete(id);
      else if (t.playing) on = true;
    }
    return on;
  }

  // publish while any tab of this browser is playing, withdraw otherwise
  async _sync() {
    const want = this._anyPlaying();
    if (this.topic && want !== this.published) {
      this.published = want;
      try {
        if (want) await this.topic.publish({ beacon: false });
        else await this.topic.unpublish();
      } catch (e) {
        console.warn('presence publish', e);
        if (want) this.published = false; // try again on the next sync
      }
    }
    this._recount();
  }

  async _search(first = false) {
    if (!this.topic) return;
    if (this._searching) return;
    this._searching = true;
    try {
      const found = await this.topic.search(); // other addresses with a current lease
      this.others = found.length;
      this.status = 'live';
    } catch (e) {
      if (first) throw e;
      console.warn('presence search', e);
    } finally {
      this._searching = false;
    }
    if (!first) this._recount();
  }

  _recount() {
    this.count = this.status === 'live' ? (this._anyPlaying() ? 1 : 0) + this.others : null;
    this._emit();
  }
}
