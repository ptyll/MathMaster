/**
 * Generátor rovnic se zlomky (UCN-MATH-004).
 * Obtížnost 1: x/a = b | 2: x/a + b = c, (a/b)x = c | 3: (a/b)x + p/q = r/s.
 * Odpověď může být celé číslo nebo zlomek v základním tvaru.
 * Kroky vždy ukazují klíčový krok: násobení obou stran jmenovatelem.
 */

import { createPrng } from './prng.js';
import { expr, solveLinearSteps, solvedValue, formatExpr, cloneExpr } from './solver.js';
import { makeFraction, addFractions, multiplyFractions, isWhole, formatNumber } from './fractions.js';

function build({ form, left, right, text, hint, seed, difficulty }) {
  const value = solvedValue(left, right);
  return {
    topic: 'fractionEquations',
    kind: 'fractionEquation',
    form,
    text,
    answer: isWhole(value)
      ? { kind: 'int', value: value.n }
      : { kind: 'fraction', n: value.n, d: value.d },
    steps: solveLinearSteps(left, right),
    // Výchozí stav rovnice pro krokové řešení (UCN-STEP-002).
    equation: { left: cloneExpr(left), right: cloneExpr(right) },
    hint,
    distractors: [],
    seed,
    difficulty,
  };
}

export function generateFractionEquation(seed, difficulty = 1) {
  const prng = createPrng(seed);

  if (difficulty <= 1) {
    // x/a = b  ->  x = a*b (max 9*11 = 99, držíme strop 100)
    const a = prng.int(2, 9);
    const b = prng.int(2, 11);
    return build({
      form: 'x/a=b',
      left: expr(1, a, 0, 1),
      right: expr(0, 1, b, 1),
      text: `x/${a} = ${b}`,
      hint: `x/${a} znamená x děleno ${a}. Čím musíš vynásobit obě strany, aby zůstalo samo x?`,
      seed,
      difficulty,
    });
  }

  if (difficulty === 2) {
    if (prng.next() < 0.5) {
      // x/a + b = c  ->  x = a*(c-b)
      const a = prng.int(2, 9);
      const x = prng.int(1, 10);
      const b = prng.int(1, 10);
      const c = x / a + b;
      if (!Number.isInteger(c)) {
        // x musí být dělitelné a, aby c vyšlo celé
        const xx = a * prng.int(1, 10);
        const cc = xx / a + b;
        return build({
          form: 'x/a+b=c',
          left: expr(1, a, b, 1),
          right: expr(0, 1, cc, 1),
          text: `x/${a} + ${b} = ${cc}`,
          hint: `Nejdřív odečti ${b} z obou stran, pak obě strany vynásob ${a}.`,
          seed,
          difficulty,
        });
      }
      return build({
        form: 'x/a+b=c',
        left: expr(1, a, b, 1),
        right: expr(0, 1, c, 1),
        text: `x/${a} + ${b} = ${c}`,
        hint: `Nejdřív odečti ${b} z obou stran, pak obě strany vynásob ${a}.`,
        seed,
        difficulty,
      });
    }
    // (a/b)x = c, c je násobek a -> x celé; koeficient vždy v základním tvaru
    const coef = makeFraction(prng.int(2, 6), prng.int(3, 9));
    if (coef.d === 1) {
      // po zkrácení vyšlo celé číslo - tohle není zlomková rovnice, zkus jiný seed
      return generateFractionEquation(seed + 7919, difficulty);
    }
    const k = prng.int(1, 6);
    const c = coef.n * k;
    return build({
      form: '(a/b)x=c',
      left: expr(coef.n, coef.d, 0, 1),
      right: expr(0, 1, c, 1),
      text: `(${coef.n}/${coef.d})x = ${c}`,
      hint: `Vydělit zlomkem ${coef.n}/${coef.d} je stejné jako vynásobit ${coef.d}/${coef.n}. Zkus to na obou stranách.`,
      seed,
      difficulty,
    });
  }

  // difficulty 3: (a/b)x + p/q = r/s - x může být zlomek
  const a = prng.int(1, 5);
  const b = prng.int(Math.max(2, a + 1), 9);
  const coef = makeFraction(a, b);
  const x = prng.next() < 0.5 ? makeFraction(prng.int(1, 9)) : makeFraction(prng.int(1, 8), prng.pick([2, 3, 4]));
  const pc = makeFraction(prng.int(1, 5), prng.pick([2, 3, 4, 6]));
  const rhs = addFractions(multiplyFractions(coef, x), pc);

  return build({
    form: '(a/b)x+p/q=r/s',
    left: expr(coef.n, coef.d, pc.n, pc.d),
    right: expr(0, 1, rhs.n, rhs.d),
    text: `${formatExpr(expr(coef.n, coef.d, pc.n, pc.d))} = ${formatNumber(rhs)}`,
    hint: 'Postup je stejný jako u obyčejné rovnice: nejdřív odečti číslo bez x z obou stran, pak se zbav zlomku u x.',
    seed,
    difficulty,
  });
}
