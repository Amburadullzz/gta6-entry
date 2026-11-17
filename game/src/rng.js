// One seeded random stream for the whole city and every spawn, so a seed always builds the same
// Marisol: the same blocks, the same traffic, the same faces. mulberry32, then the few draws the
// generator and the spawners ask for.

export function createRandom(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    /** A float in [min, max). */
    range: (min, max) => min + next() * (max - min),
    /** A whole number in [min, max], both ends included. */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    /** True with probability p. */
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length) % list.length],
    /** A jittered copy of a colour's brightness, for walls that never repeat exactly. */
    shade: (amount) => 1 + (next() * 2 - 1) * amount,
    angle: () => next() * Math.PI * 2,
  };
}

/** A string's own seed, so a name always builds the same world. */
export function hashSeed(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
