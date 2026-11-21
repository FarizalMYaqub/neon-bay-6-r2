// Seeded random numbers (mulberry32) so screenshot setups are repeatable.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

export function range(rng, min, max) { return min + rng() * (max - min); }

export function intRange(rng, min, max) { return Math.floor(range(rng, min, max + 1)); }

export function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// Parse "?shot=start&seed=7" style query strings.
export function queryParams() {
  const out = {};
  const q = window.location.search.replace(/^\?/, '');
  if (!q) return out;
  for (const part of q.split('&')) {
    const eq = part.indexOf('=');
    if (eq === -1) out[decodeURIComponent(part)] = '';
    else out[decodeURIComponent(part.slice(0, eq))] = decodeURIComponent(part.slice(eq + 1));
  }
  return out;
}
