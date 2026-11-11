// Paulstretch worker stub – full WASM path loads when vendor/paulstretch is present.
// Keeps the engine import path valid.

self.onmessage = (e) => {
  const { type, generation } = e.data || {};
  if (type === 'stretch') {
    // Without the full WASM module we cannot stretch; acknowledge only.
    self.postMessage({ generation, status: 'noop' });
  }
};
