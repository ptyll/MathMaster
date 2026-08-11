/**
 * Zlomková aritmetika (UCN-MATH-003).
 * Zlomek je vždy { n, d } (čitatel, jmenovatel). makeFraction udržuje
 * základní tvar a kladného jmenovatele - všechny operace jdou přes ni.
 */

/** Největší společný dělitel (Eukleidův algoritmus). */
export function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/**
 * Vytvoří zlomek v základním tvaru s kladným jmenovatelem.
 * @param {number} n čitatel
 * @param {number} [d] jmenovatel (výchozí 1)
 */
export function makeFraction(n, d = 1) {
  if (!Number.isInteger(n) || !Number.isInteger(d)) {
    throw new Error(`Zlomek musí mít celočíselné složky, dostal jsem ${n}/${d}`);
  }
  if (d === 0) {
    throw new Error('Jmenovatel nesmí být 0');
  }
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1;
  const reduced = n / g;
  // -0 není platný čitatel: deepStrictEqual ho rozlišuje od 0 a '-0' by
  // se mohlo objevit i ve formátovaném výstupu.
  return { n: reduced === 0 ? 0 : reduced, d: d / g };
}

export function addFractions(a, b) {
  return makeFraction(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function subtractFractions(a, b) {
  return makeFraction(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function multiplyFractions(a, b) {
  return makeFraction(a.n * b.n, a.d * b.d);
}

export function divideFractions(a, b) {
  if (b.n === 0) {
    throw new Error('Dělení nulovým zlomkem');
  }
  return makeFraction(a.n * b.d, a.d * b.n);
}

/**
 * Porovná dva zlomky: -1 (a < b), 0 (a = b), 1 (a > b).
 * Přes křížové násobení - funguje i pro nevykrácené vstupy.
 */
export function compareFractions(a, b) {
  const diff = a.n * b.d - b.n * a.d;
  return diff === 0 ? 0 : diff > 0 ? 1 : -1;
}

/** Hodnotová rovnost - akceptuje i nevykrácený zlomek ('správně, ale zkus zkrátit'). */
export function fractionsEqual(a, b) {
  return compareFractions(a, b) === 0;
}

/** Je zlomek v základním tvaru? */
export function isSimplified({ n, d }) {
  return gcd(n, d) === 1;
}

/** Celé číslo jako zlomek? */
export function isWhole({ d }) {
  return d === 1;
}

/** Formátuje číslo/zlomek pro zobrazení: 7 nebo 3/4. */
export function formatNumber(value) {
  if (typeof value === 'number') {
    return String(value);
  }
  return value.d === 1 ? String(value.n) : `${value.n}/${value.d}`;
}

/** Nejmenší společný násobek. */
export function lcm(a, b) {
  return (a / gcd(a, b)) * b;
}
