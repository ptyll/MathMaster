/**
 * Deterministický PRNG (mulberry32) se seedem (DEC-003).
 * Stejný seed = stejná posloupnost -> testovatelné generátory
 * a funkce "hrát misi znovu" se stejnými příklady.
 */

/**
 * @param {number} seed celé číslo
 */
export function createPrng(seed) {
  let state = seed >>> 0;

  /** Náhodné číslo z [0, 1). */
  function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    /** Náhodné celé číslo z [min, max] včetně. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** Náhodný prvek pole. */
    pick(array) {
      return array[Math.floor(next() * array.length)];
    },
  };
}
