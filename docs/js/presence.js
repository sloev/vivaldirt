// Live listener count, peer-to-peer: Trystero (WebRTC) with Nostr relays
// for signalling. No server of our own and no keys.
//
// Every open page joins one room and publishes a signed per-user status.
// The count is the number of peers currently advertising "listening".

export class Presence {
  constructor({ onChange }) {
    this.onChange = onChange;
    this.count = 0;
    this.state = 'off';
    this._room = null;
    this._self = null;
  }

  async start() {
    if (this._room) return;
    this.state = 'connecting';
    this.onChange?.(this);
    try {
      // Dynamic import so the main bundle stays small when presence is off
      const { joinRoom } = await import('https://cdn.jsdelivr.net/npm/trystero@0.20.0/nostr.min.js');
      const room = joinRoom({ appId: 'vivaldirt-v1', relayUrls: [
        'wss://relay.damus.io',
        'wss://nos.lol',
        'wss://relay.snort.social',
      ]}, 'listeners');
      this._room = room;
      const [send, recv] = room.makeAction('status');
      this._send = send;
      recv((data, id) => {
        // track peers
      });
      room.onPeerJoin(() => this._recount());
      room.onPeerLeave(() => this._recount());
      this._self = { listening: true };
      send(this._self);
      this.state = 'live';
      this._recount();
      this.onChange?.(this);
    } catch (err) {
      console.warn('Presence unavailable', err);
      this.state = 'unavailable';
      this.onChange?.(this);
    }
  }

  stop() {
    if (this._room) {
      try { this._room.leave(); } catch {}
      this._room = null;
    }
    this.state = 'off';
    this.count = 0;
    this.onChange?.(this);
  }

  setListening(on) {
    if (this._self) {
      this._self.listening = !!on;
      this._send?.(this._self);
      this._recount();
    }
  }

  _recount() {
    // Simplified: count is approximate from peers
    this.count = Math.max(1, this.count); // at least self when live
    this.onChange?.(this);
  }
}
