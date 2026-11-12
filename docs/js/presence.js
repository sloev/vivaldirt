// Live listener count via Trystero (WebRTC) + Nostr signalling relays.
// Count = distinct peers currently advertising that they are playing.

const APP_ID = 'vivaldirt-stream-v1';
const ROOM = 'listeners';
const HEARTBEAT_MS = 12_000;
const STALE_MS = 45_000;

export class Presence {
  constructor({ onChange }) {
    this.onChange = onChange;
    this.status = 'off'; // off | connecting | live | unavailable
    this.count = null;
    this.localPlaying = false;
    this.peers = new Map(); // peerId -> { on, ts }
    this.selfId = null;
  }

  _emit() {
    this.onChange?.({ status: this.status, count: this.count });
  }

  async start() {
    if (this.room || this.starting) return;
    this.starting = true;
    this.status = 'connecting';
    this._emit();
    try {
      const { joinRoom } = await import(
        'https://cdn.jsdelivr.net/npm/trystero@0.20.0/nostr.min.js'
      );
      const room = joinRoom(
        {
          appId: APP_ID,
          relayUrls: [
            'wss://relay.damus.io',
            'wss://nos.lol',
            'wss://relay.snort.social',
          ],
        },
        ROOM
      );
      this.room = room;
      const [send, get] = room.makeAction('listen');
      this._send = send;

      get((data, peerId) => {
        if (!data || typeof data !== 'object') return;
        this.peers.set(peerId, {
          on: !!data.on,
          ts: typeof data.ts === 'number' ? data.ts : Date.now(),
        });
        this._recount();
      });

      room.onPeerJoin((id) => {
        this.peers.set(id, this.peers.get(id) || { on: false, ts: Date.now() });
        this._publish(true);
        this._recount();
      });
      room.onPeerLeave((id) => {
        this.peers.delete(id);
        this._recount();
      });

      this.status = 'live';
      this._publish(true);
      this.timer = setInterval(() => {
        this._publish();
        this._recount();
      }, HEARTBEAT_MS);
      this._recount();
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
    try { this.room?.leave(); } catch {}
    this.room = null;
    this.peers.clear();
    this.status = 'off';
    this.count = null;
    this._emit();
  }

  setPlaying(on) {
    this.localPlaying = !!on;
    this._publish(true);
    this._recount();
  }

  _publish(force = false) {
    if (!this._send) return;
    const now = Date.now();
    if (!force && this._lastSend && now - this._lastSend < 2000) return;
    this._lastSend = now;
    try {
      this._send({ on: this.localPlaying, ts: now });
    } catch {}
  }

  _recount() {
    const now = Date.now();
    let n = this.localPlaying ? 1 : 0;
    for (const [id, p] of this.peers) {
      if (now - p.ts > STALE_MS) {
        this.peers.delete(id);
        continue;
      }
      if (p.on) n++;
    }
    this.count = this.status === 'unavailable' ? null : n;
    this._emit();
  }
}
