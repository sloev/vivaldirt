// Live listener count, peer-to-peer: Trystero (WebRTC) with Nostr relays
// for signalling. No server of our own and no keys.
//
// Every open page joins one room and publishes a signed per-user state
// {on, ts}: on = audio is actually playing. The count is the number of
// distinct users whose state is "on", who are connected right now, and who
// have sent a heartbeat recently. Tabs in the same browser share a Trystero
// user id, and coordinate over a BroadcastChannel so that one playing tab
// is enough to count the person once.
const APP_ID = 'sloev.github.io/vivaldirt';
const ROOM = 'listeners-v1';
const HEARTBEAT_MS = 20_000;
const STALE_MS = 65_000;
const TAB_STALE_MS = 15_000;

export class Presence {
  constructor({ onChange }) {
    this.onChange = onChange;
    this.status = 'off'; // off | connecting | live | unavailable
    this.count = null;
    this.localPlaying = false;
    this.published = null;
    this.seen = new Map(); // userId -> last time we heard from them
    this.tabs = new Map(); // other tabs of this browser: id -> {playing, at}
    this.tabId = Math.random().toString(36).slice(2);
    try {
      this.bc = new BroadcastChannel('vivaldirt-presence');
      this.bc.onmessage = (e) => {
        const d = e.data;
        if (!d || typeof d.tab !== 'string') return;
        if (d.gone) this.tabs.delete(d.tab);
        else this.tabs.set(d.tab, { playing: !!d.playing, at: Date.now() });
        this._publish();
      };
    } catch { this.bc = null; }
    addEventListener('pagehide', () => {
      this.bc?.postMessage({ tab: this.tabId, gone: true });
      this.room?.leave();
    });
  }

  _emit() {
    this.onChange({ status: this.status, count: this.count });
  }

  async start() {
    if (this.room || this.starting) return;
    this.starting = true;
    this.status = 'connecting';
    this._emit();
    try {
      const { joinRoom, getRelaySockets } = await import('../vendor/trystero/trystero-nostr.min.js');
      this.getRelaySockets = getRelaySockets;
      const room = joinRoom({ appId: APP_ID }, ROOM);
      this.room = room;
      this.state = room.makeUserState('listening', { on: false, ts: 0 }, {
        maxBytes: 96,
        validate: (v) => v && typeof v === 'object' && typeof v.on === 'boolean' && typeof v.ts === 'number',
      });
      this.state.onChange((v, ctx) => {
        if (!ctx.self) this.seen.set(ctx.userId, Date.now());
        if (ctx.removed) this.seen.delete(ctx.userId);
        this._recount();
      });
      room.onUserJoin(({ userId }) => { this.seen.set(userId, Date.now()); this._recount(); });
      room.onUserLeave(({ userId }) => { this.seen.delete(userId); this._recount(); });
      room.onError?.(() => this._recount());
      room.getSelf().then((s) => { this.selfId = s.userId; this._recount(); }).catch(() => {});
      this.published = null;
      this._publish(true);
      this.timer = setInterval(() => this._tick(), 5000);
      this._tick();
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
    this.room?.leave();
    this.room = null;
    this.state = null;
    this.seen.clear();
    this.status = 'off';
    this.count = null;
    this._emit();
  }

  setPlaying(on) {
    this.localPlaying = on;
    this.bc?.postMessage({ tab: this.tabId, playing: on });
    this._publish();
  }

  _aggregate() {
    const now = Date.now();
    let on = this.localPlaying;
    for (const [id, t] of this.tabs) {
      if (now - t.at > TAB_STALE_MS) this.tabs.delete(id);
      else if (t.playing) on = true;
    }
    return on;
  }

  _publish(force = false) {
    if (!this.state) return;
    const on = this._aggregate();
    const due = !this.published || Date.now() - this.published.ts > HEARTBEAT_MS;
    if (force || due || on !== this.published.on) {
      this.published = { on, ts: Date.now() };
      this.state.set(this.published).catch(() => {});
    }
    this._recount();
  }

  _tick() {
    // keep other tabs informed, refresh our heartbeat, check relay health
    this.bc?.postMessage({ tab: this.tabId, playing: this.localPlaying });
    this._publish();
    let open = 0;
    try {
      for (const ws of Object.values(this.getRelaySockets?.() || {})) if (ws.readyState === 1) open++;
    } catch { /* ignore */ }
    const age = Date.now() - (this.startedAt ||= Date.now());
    const status = open > 0 ? 'live' : age > 20_000 ? 'unavailable' : 'connecting';
    if (status !== this.status) {
      this.status = status;
      this._recount();
    }
  }

  _recount() {
    if (!this.state) return;
    const now = Date.now();
    const online = new Set(Object.keys(this.room.getUsers?.() || {}));
    let count = 0;
    for (const [id, v] of Object.entries(this.state.getAll())) {
      if (!v || !v.on) continue;
      const self = id === this.selfId;
      if (self) { count++; continue; }
      const seen = this.seen.get(id) || 0;
      if (online.has(id) && now - seen < STALE_MS) count++;
    }
    if (!this.selfId && this._aggregate()) count = Math.max(count, 1);
    for (const [id, t] of this.seen) if (now - t > STALE_MS * 3) this.seen.delete(id);
    this.count = this.status === 'unavailable' ? null : count;
    this._emit();
  }
}
