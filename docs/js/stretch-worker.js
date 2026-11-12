// Paulstretch worker: pulls PCM from the segment cache (the main thread
// decodes segments, since decodeAudioData is not available in workers),
// runs one StreamingStretcher per channel and hands back output blocks.
import PaulstretchModule from '../vendor/paulstretch/paulstretch.js';

const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
]);

const st = {
  M: null,
  sr: 48000,
  fft: 32768,
  segFrames: 0,
  totalFrames: 0,
  stretch: 10000,
  stretchers: [],
  cursor: 0,
  segs: new Map(),
  wanted: new Set(),
  pending: 0,
  generation: 0,
  busy: false,
};

function post(msg, transfer = []) {
  self.postMessage(msg, transfer);
}

async function init(msg) {
  const base = new URL('../vendor/paulstretch/', import.meta.url);
  const wasm = WebAssembly.validate(SIMD_PROBE) ? 'paulstretch.wasm' : 'paulstretch.nosimd.wasm';
  st.M = await PaulstretchModule({ locateFile: (p) => (p.endsWith('.wasm') ? new URL(wasm, base).href : p) });
  st.sr = msg.sampleRate;
  st.fft = msg.fftSize;
  st.segFrames = msg.segmentFrames;
  st.totalFrames = msg.totalFrames;
  post({ type: 'ready', simd: st.M.fftSimdArch() });
}

function build(stretch) {
  for (const s of st.stretchers) s.delete();
  st.stretchers = [0, 1].map(() => new st.M.StreamingStretcher(stretch, st.fft, st.sr, st.M.Window.Hann, 0));
  st.stretch = stretch;
}

function mod(a, n) {
  return ((a % n) + n) % n;
}

function seek(msg) {
  st.generation = msg.generation;
  st.pending = 0;
  build(msg.stretch);
  const bs = st.stretchers[0].bufsize();
  st.cursor = mod(Math.round(msg.frame) - bs, st.totalFrames);
  for (const k of st.segs.keys()) {
    const seg0 = Math.floor(st.cursor / st.segFrames);
    if (Math.abs(k - seg0) > 2) st.segs.delete(k);
  }
  pump();
}

function have(from, n) {
  const needed = [];
  let pos = mod(from, st.totalFrames);
  let left = n;
  while (left > 0) {
    const k = Math.floor(pos / st.segFrames);
    needed.push(k);
    const off = pos - k * st.segFrames;
    const take = Math.min(left, st.segFrames - off);
    left -= take;
    pos = mod(pos + take, st.totalFrames);
  }
  const prefetch = Math.floor(mod(from + n, st.totalFrames) / st.segFrames);
  let ok = true;
  for (const idx of [...new Set([...needed, prefetch])]) {
    if (!st.segs.has(idx)) {
      if (idx !== prefetch || needed.includes(idx)) ok = false;
      if (!st.wanted.has(idx)) {
        st.wanted.add(idx);
        post({ type: 'need', index: idx });
      }
    }
  }
  return ok;
}

function read(ch, from, n) {
  const out = new Float32Array(n);
  let pos = mod(from, st.totalFrames);
  let i = 0;
  while (i < n) {
    const k = Math.floor(pos / st.segFrames);
    const seg = st.segs.get(k)[ch];
    const off = pos - k * st.segFrames;
    const take = Math.min(n - i, seg.length - off);
    if (take <= 0) { pos = 0; continue; }
    out.set(seg.subarray(off, off + take), i);
    i += take;
    pos = mod(pos + take, st.totalFrames);
  }
  return out;
}

function pump() {
  if (st.busy || !st.stretchers.length) return;
  st.busy = true;
  try {
    while (st.pending > 0) {
      const want = st.stretchers[0].nextInputSize();
      if (want > 0 && !have(st.cursor, want)) break;
      const outs = st.stretchers.map((s, ch) => s.step(want > 0 ? read(ch, st.cursor, want) : null, 0).output);
      st.cursor = mod(st.cursor + want + st.stretchers[0].skipAfterStep(), st.totalFrames);
      const cur = Math.floor(st.cursor / st.segFrames);
      for (const k of st.segs.keys()) if (k < cur - 1 && cur - k < 50) st.segs.delete(k);
      st.pending--;
      const L = new Float32Array(outs[0]);
      const R = new Float32Array(outs[1]);
      post({ type: 'block', generation: st.generation, L, R, cursor: st.cursor }, [L.buffer, R.buffer]);
    }
  } finally {
    st.busy = false;
  }
}

self.onmessage = async (e) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      try { await init(msg); }
      catch (err) { post({ type: 'error', message: String(err && err.message || err) }); }
      break;
    case 'seek':
      seek(msg);
      break;
    case 'stretch':
      if (st.stretchers.length && Math.abs(msg.stretch - st.stretch) > 1e-6) {
        for (const s of st.stretchers) s.setStretchFactor(msg.stretch);
        st.stretch = msg.stretch;
      }
      break;
    case 'segment':
      st.wanted.delete(msg.index);
      st.segs.set(msg.index, [msg.L, msg.R]);
      pump();
      break;
    case 'pull':
    case 'request':
      if (msg.generation === st.generation) {
        st.pending += msg.count || 1;
        pump();
      }
      break;
  }
};
