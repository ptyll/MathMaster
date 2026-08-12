/**
 * Generátor rovnic se zlomky (UCN-MATH-004).
 * Obtížnost 1: x/a = b | 2: x/a + b = c, (a/b)x = c | 3: (a/b)x + p/q = r/s
 * | 4: x/a + x/b = c (dva x-členy) | 5: x/a + p/q = x/b + r/s (x na obou
 * stranách) | 6: (a/b)x + p/q = (c/d)x + r/s (obojí naráz, x smí být zlomek).
 * Odpověď může být celé číslo nebo zlomek v základním tvaru.
 * Kroky vždy ukazují klíčový krok: násobení obou stran jmenovatelem.
 */

import { createPrng } from './prng.js';
import { expr, multiTermSide, solveLinearSteps, solvedValue, formatExpr, cloneExpr } from './solver.js';
import {
  makeFraction,
  addFractions,
  subtractFractions,
  multiplyFractions,
  isWhole,
  formatNumber,
} from './fractions.js';

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
      text: `${formatExpr(expr(1, a, 0, 1))} = ${b}`,
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
          text: `${formatExpr(expr(1, a, b, 1))} = ${cc}`,
          hint: `Nejdřív odečti ${b} z obou stran, pak obě strany vynásob ${a}.`,
          seed,
          difficulty,
        });
      }
      return build({
        form: 'x/a+b=c',
        left: expr(1, a, b, 1),
        right: expr(0, 1, c, 1),
        text: `${formatExpr(expr(1, a, b, 1))} = ${c}`,
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
      text: `${formatExpr(expr(coef.n, coef.d, 0, 1))} = ${c}`,
      hint: `Vydělit zlomkem ${coef.n}/${coef.d} je stejné jako vynásobit ${coef.d}/${coef.n}. Zkus to na obou stranách.`,
      seed,
      difficulty,
    });
  }

  if (difficulty >= 4) {
    return generateHarderFractionEquation(prng, seed, difficulty);
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

/**
 * Dvojice jmenovatelů, u kterých zůstane rozdíl koeficientů 1/a - 1/b (i jejich
 * součet) na rozumném jmenovateli - x pak vyjde jako malé celé číslo.
 */
const DENOMINATOR_PAIRS = Object.freeze([
  [2, 3], [2, 4], [2, 5], [2, 6], [2, 8], [2, 10],
  [3, 4], [3, 5], [3, 6], [4, 6], [4, 8], [5, 10],
]);

/**
 * Koeficienty pro stupeň 6. Vlevo VÝHRADNĚ nejednotkový zlomek - jednotkový
 * (x/2) je tvar stupňů 4 a 5 a šestka by pak vypadala jako pětka; celé číslo
 * by ze zlomkové rovnice udělalo obyčejnou.
 */
const LEFT_COEFFICIENTS = Object.freeze([
  [2, 3], [3, 4], [5, 6], [5, 4], [4, 3], [3, 2], [5, 3], [7, 6],
]);
const RIGHT_COEFFICIENTS = Object.freeze([[1, 2], [1, 3], [1, 4], [1, 6], [2, 3], [3, 4]]);

/**
 * Zlomková konstanta p/q se jmenovatelem z malé řady - VŽDY skutečný zlomek.
 * Kdyby vyšla celá (2/2), zmizela by ze stupně 5 zlomková konstanta a zbyl by
 * tvar lehčí než dnešní trojka.
 */
function smallFraction(prng) {
  const q = prng.pick([2, 3, 4, 6]);
  const p = prng.int(1, 5);
  const f = makeFraction(p, q);
  return f.d === 1 ? makeFraction(1, q) : f;
}

/**
 * Stupně 4-6 (UCN-MATH-003, fáze 'zlomkové generátory umí těžší formy').
 * Každý stupeň přidává JEDNU novou strukturu, ne větší čísla:
 *  4: dva x-členy na jedné straně -> poprvé je nutné sečíst stejné členy
 *  5: neznámá na OBOU stranách (a aspoň jedna zlomková konstanta)
 *  6: obě strany zlomkové včetně konstant, x smí vyjít zlomek
 * Větší koeficient patří VŽDY doleva: se zápornějším koeficientem vlevo by
 * řešiči přibyl krok 'vyměň znaménka' a dítě by se prokousávalo záporným
 * koeficientem navíc (solveLinearSteps prohazuje strany jen tehdy, když
 * vpravo žádné x není).
 */
function generateHarderFractionEquation(prng, seed, difficulty) {
  if (difficulty === 4) {
    // x/a + x/b = c. Stranu skládáme VÝHRADNĚ z nesečtených členů: předsečtený
    // tvar (5/6)x by vypadal stejně jako stupeň 2 a novou dovednost by zrušil.
    const [a, b] = prng.pick(DENOMINATOR_PAIRS);
    const coefficient = addFractions(makeFraction(1, a), makeFraction(1, b));
    const x = coefficient.d * prng.int(1, 4);
    const c = coefficient.n * (x / coefficient.d);
    const left = multiTermSide([
      { x: makeFraction(1, a), c: makeFraction(0) },
      { x: makeFraction(1, b), c: makeFraction(0) },
    ]);
    return build({
      form: 'x/a+x/b=c',
      left,
      right: expr(0, 1, c, 1),
      text: `${formatExpr(left)} = ${c}`,
      hint: `x/${a} a x/${b} jsou stejný druh členu - nejdřív je sečti dohromady, teprve pak se zbav zlomku u x.`,
      seed,
      difficulty,
    });
  }

  if (difficulty === 5) {
    // x/a + p/q = x/b + r/s, a < b (větší koeficient vlevo), x celé a kladné.
    const [a, b] = prng.pick(DENOMINATOR_PAIRS);
    const difference = subtractFractions(makeFraction(1, a), makeFraction(1, b));
    const x = difference.d * prng.int(1, 4);
    const leftConstant = smallFraction(prng);
    const rightConstant = addFractions(
      makeFraction(difference.n * (x / difference.d)),
      leftConstant
    );
    const left = expr(1, a, leftConstant.n, leftConstant.d);
    const right = expr(1, b, rightConstant.n, rightConstant.d);
    return build({
      form: 'x/a+p/q=x/b+r/s',
      left,
      right,
      text: `${formatExpr(left)} = ${formatExpr(right)}`,
      hint: `Neznámá je na obou stranách. Nejdřív odečti menší x-člen (x/${b}) z obou stran, pak pokračuj jako vždycky.`,
      seed,
      difficulty,
    });
  }

  // difficulty 6: (a/b)x + p/q = (c/d)x + r/s, x smí vyjít zlomek
  let leftCoefficient = makeFraction(...LEFT_COEFFICIENTS[0]);
  let rightCoefficient = makeFraction(...RIGHT_COEFFICIENTS[0]);
  for (let tries = 0; tries < 20; tries++) {
    leftCoefficient = makeFraction(...prng.pick(LEFT_COEFFICIENTS));
    rightCoefficient = makeFraction(...prng.pick(RIGHT_COEFFICIENTS));
    // Vlevo musí zůstat větší koeficient, jinak přibude krok 'vyměň znaménka';
    // stejné koeficienty by x z rovnice vyškrtly úplně.
    if (leftCoefficient.n * rightCoefficient.d > rightCoefficient.n * leftCoefficient.d) {
      break;
    }
  }
  const x = prng.next() < 0.5 ? makeFraction(prng.int(1, 6)) : makeFraction(prng.int(1, 7), prng.pick([2, 3]));
  const leftConstant = smallFraction(prng);
  const rightConstant = addFractions(
    multiplyFractions(subtractFractions(leftCoefficient, rightCoefficient), x),
    leftConstant
  );
  const left = expr(leftCoefficient.n, leftCoefficient.d, leftConstant.n, leftConstant.d);
  const right = expr(rightCoefficient.n, rightCoefficient.d, rightConstant.n, rightConstant.d);
  return build({
    form: '(a/b)x+p/q=(c/d)x+r/s',
    left,
    right,
    text: `${formatExpr(left)} = ${formatExpr(right)}`,
    hint: 'Zlomky jsou na obou stranách. Postup se nemění: nejdřív x na jednu stranu, čísla na druhou, a teprve pak se zbav zlomku u x.',
    seed,
    difficulty,
  });
}
