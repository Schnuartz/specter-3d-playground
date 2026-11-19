export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a || 1);
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutBack = t => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const now = () => performance.now();
export const uid = () => Math.random().toString(36).slice(2, 10);

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function downloadBytes(bytes, name) {
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name.split('/').pop();
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function pickFiles(multiple = true) {
  return new Promise(resolve => {
    const input = document.getElementById('file-input');
    input.value = '';
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files || []));
    input.click();
  });
}

export function rafLoop(fn) {
  let last = performance.now();
  let alive = true;
  const tick = t => {
    if (!alive) return;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    fn(dt, t);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => { alive = false; };
}

export function waitFor(predicate, timeout = 30000, interval = 100) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const tick = () => {
      try {
        if (predicate()) return resolve(true);
      } catch {}
      if (performance.now() - started > timeout) return reject(new Error('timeout'));
      setTimeout(tick, interval);
    };
    tick();
  });
}

export function truncate(str, n = 64) {
  str = String(str || '');
  return str.length > n ? `${str.slice(0, n)}…` : str;
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function seededRandom(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
