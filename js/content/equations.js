/**
 * Generátory lineárních rovnic (UCN-MATH-001, UCN-MATH-002).
 * Čisté funkce (seed, difficulty) -> příklad, deterministické (DEC-003).
 * Kroky řešení pochází výhradně ze solveru (jediný zdroj pravdy).
 */

import { createPrng } from './prng.js';
import { expr, formatExpr, solveLinearSteps, solvedValue } from './solver.js';
import { isWhole } from './fractions.js';

/**
 * Distraktory pro celočíselnou odpověď: hodnota±1 a typická chyba
 * (záměna o skutečný koeficient/konstantu příkladu). Bez duplicit,
 * bez správné odpovědi, bez nuly a záporných čísel.
 */
function intDistractors(answer, delta) {
  const candidates = [answer + 1, answer - 1, answer + delta, answer - delta, answer + 2];
  const seen = new Set([answer]);
  const result = [];
  for (const c of candidates) {
    if (c > 0 && !seen.has(c)) {
      seen.add(c);
      result.push(c);
    }
    if (result.length === 3) {
      break;
    }
  }
  return result;
}

function buildExercise({ topic, kind, form, left, right, text, hint, seed, difficulty, answer }) {
  const steps = solveLinearSteps(left, right);
  const value = answer ?? solvedValue(left, right);
  // Typická chyba: u ax+b=c záměna o koeficient, u x+a=b o konstantu.
  const delta =
    Math.abs(left.x.n) > 1 && left.x.d === 1
      ? Math.abs(left.x.n)
      : Math.abs(left.c.n) > 0 && left.c.d === 1
        ? Math.abs(left.c.n)
        : 2;
  return {
    topic,
    kind,
    form,
    text,
    answer: isWhole(value)
      ? { kind: 'int', value: value.n }
      : { kind: 'fraction', n: value.n, d: value.d },
    steps,
    hint,
    distractors: isWhole(value) ? intDistractors(value.n, delta) : [],
    seed,
    difficulty,
  };
}

/**
 * UCN-MATH-001: jednoduché rovnice x + a = b, x - a = b, a - x = b.
 * Výsledky vždy celá kladná čísla, rozsah dle obtížnosti (1: do 20, 2: do 50, 3: do 100).
 */
export function generateSimpleEquation(seed, difficulty = 1) {
  const prng = createPrng(seed);
  const max = [20, 50, 100][difficulty - 1] ?? 20;
  const form = prng.pick(['x+a=b', 'a+x=b', 'x-a=b', 'a-x=b']);

  let left;
  let right;
  let text;
  let x;

  if (form === 'x+a=b' || form === 'a+x=b') {
    x = prng.int(1, max - 2);
    const a = prng.int(1, max - x);
    const b = x + a;
    left = expr(1, 1, a, 1);
    right = expr(0, 1, b, 1);
    text = form === 'x+a=b' ? `x + ${a} = ${b}` : `${a} + x = ${b}`;
  } else if (form === 'x-a=b') {
    x = prng.int(2, max);
    const a = prng.int(1, x - 1);
    const b = x - a;
    left = expr(1, 1, -a, 1);
    right = expr(0, 1, b, 1);
    text = `x - ${a} = ${b}`;
  } else {
    // a - x = b  (x = a - b)
    const a = prng.int(2, max);
    x = prng.int(1, a - 1);
    const b = a - x;
    left = expr(-1, 1, a, 1);
    right = expr(0, 1, b, 1);
    text = `${a} - x = ${b}`;
  }

  return buildExercise({
    topic: 'equations',
    kind: 'simple',
    form,
    left,
    right,
    text,
    hint: 'Co musíš udělat, aby x zůstalo na jedné straně samo? Udělej to na OBOU stranách rovnice.',
    seed,
    difficulty,
  });
}

/**
 * UCN-MATH-002: rovnice s násobením.
 * Obtížnost: 1: ax = b | 2: ax + b = c | 3: a(x + b) = c | 4: ax + b = cx + d.
 * Vždy celočíselné řešení; v obtížnosti 4 může být x záporné.
 */
export function generateLinearEquation(seed, difficulty = 1) {
  const prng = createPrng(seed);

  if (difficulty <= 1) {
    const a = prng.int(2, 9);
    const x = prng.int(2, 12);
    const b = a * x;
    return buildExercise({
      topic: 'equations',
      kind: 'linear',
      form: 'ax=b',
      left: expr(a, 1, 0, 1),
      right: expr(0, 1, b, 1),
      text: `${a}x = ${b}`,
      hint: `${a}x znamená ${a} krát x. Čím musíš vydělit obě strany, aby zůstalo samo x?`,
      seed,
      difficulty,
    });
  }

  if (difficulty === 2) {
    const a = prng.int(2, 9);
    const x = prng.int(1, 12);
    const minus = prng.next() < 0.3; // občas ax - b = c
    // u minus-varianty držíme pravou stranu kladnou (záporná čísla až difficulty 4)
    const b = minus ? prng.int(1, a * x - 1) : prng.int(1, 20);
    const c = minus ? a * x - b : a * x + b;
    return buildExercise({
      topic: 'equations',
      kind: 'linear',
      form: 'ax+b=c',
      left: expr(a, 1, minus ? -b : b, 1),
      right: expr(0, 1, c, 1),
      text: `${a}x ${minus ? '-' : '+'} ${b} = ${c}`,
      hint: 'Nejdřív se zbav čísla bez x (odečti nebo přičti na obou stranách), teprve pak děl.',
      seed,
      difficulty,
    });
  }

  if (difficulty === 3) {
    const a = prng.int(2, 6);
    const x = prng.int(1, 10);
    const b = prng.int(1, 10);
    const c = a * (x + b);
    return buildExercise({
      topic: 'equations',
      kind: 'linear',
      form: 'a(x+b)=c',
      left: expr(a, 1, a * b, 1),
      right: expr(0, 1, c, 1),
      text: `${a}(x + ${b}) = ${c}`,
      hint: `Závorku rozbalíš tak, že ${a} vynásobíš x i ${a} vynásobíš ${b}. Nebo nejdřív obě strany vydělíš ${a}.`,
      seed,
      difficulty,
    });
  }

  // difficulty 4: ax + b = cx + d, x může být záporné
  const x = prng.int(-9, 12) || 1;
  let a = prng.int(2, 9);
  let c = prng.int(2, 9);
  if (a === c) {
    c = a === 9 ? a - 1 : a + 1;
  }
  const b = prng.int(-10, 15);
  const d = (a - c) * x + b;
  return buildExercise({
    topic: 'equations',
    kind: 'linear',
    form: 'ax+b=cx+d',
    left: expr(a, 1, b, 1),
    right: expr(c, 1, d, 1),
    text: `${formatExpr(expr(a, 1, b, 1))} = ${formatExpr(expr(c, 1, d, 1))}`,
    hint: 'Nejdřív přesuň všechna x na jednu stranu a všechna čísla na druhou. Pozor na znaménka!',
    seed,
    difficulty,
  });
}
