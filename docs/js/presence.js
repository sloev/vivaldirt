// Live listener count via Trystero (WebRTC) + Nostr signalling.
// Count = self (if playing) + peers who recently said they are playing.

const APP_ID = 'vivaldirt-stream-v2';
const ROOM = 'listeners-v2';
const HEARTBEAT_MS = 8_000;
const STALE_MS = 40_000;

export class Presence {
  constructor({ onChange }) {
    this.onChange = onChange;
    this.status = 'off';
    this.count = null;
    this.localPlaying = false;
    this.peers = new Map();
  }

  _emit() {
    this.onChange?.({ status: this.status, count: this.count });
  }

  async start() {
    if (this.room || this.starting) return;
    this.starting = true;
    this.status = 'connecting';
    this._emit();

    const urls = [
      'https://cdn.jsdelivr.net/npm/trystero@0.20.0/nostr/+esm',
      'https://unpkg.com/trystero@0.20.0/nostr.js',
    ];

    let joinRoom;
    let lastErr;
    for (const url of urls) {
      try {
        const mod = await import(url);
        joinRoom = mod.joinRoom;
        if (joinRoom) break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!joinRoom) {
      console.warn('presence: trystero import failed', lastErr);
      this.status = 'unavailable';
      this.count = null;
      this._emit();
      this.starting = false;
      return;
    }

    try {
      const room = joinRoom(
        {
          appId: APP_ID,
          relayUrls: [
            'wss://relay.damus.io',
            'wss://nos.lol',
            'wss://relay.snort.social',
            'wss://nostr.wine',
          ],
        },
        ROOM
      );
      this.room = room;
      const [send, onAction] = room.makeAction('listen');
      this._send = send;

      onAction((data, peerId) => {
        if (!data || typeof data !== 'object') return;
        this.peers.set(String(peerId), {
          on: !!data.on,
          ts: typeof data.ts === 'number' ? data.ts : Date.now(),
        });
        this._recount();
      });

      room.onPeerJoin((id) => {
        // Introduce ourselves when someone joins
        this._publish(true);
        this._recount();
      });
      room.onPeerLeave((id) => {
        this.peers.delete(String(id));
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
    if (!force && this._lastSend && now - this._lastSend < 1500) return;
    this._lastSend = now;
    try {
      this._send({ on: this.localPlaying, ts: now });
    } catch (e) {
      console.warn('presence send', e);
    }
  }

  _recount() {
    const now = Date.now();
    let n = this.localPlaying ? 1 : 0;
    for (const [id, p] of [...this.peers]) {
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
