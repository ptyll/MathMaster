/**
 * Generátor úloh se zlomky (UCN-MATH-003).
 * Druhy: compare | add | subtract | simplify | expand | equivalent.
 * Jmenovatele do 12, výsledky vždy v základním tvaru.
 * Kroky řešení jsou datová struktura (stejný tvar jako u rovnic).
 */

import { createPrng } from './prng.js';
import {
  makeFraction,
  addFractions,
  subtractFractions,
  compareFractions,
  gcd,
  lcm,
  formatNumber,
} from './fractions.js';

/** Náhodný zlomek v základním tvaru, jmenovatel 2..maxD, hodnota < 1 (nebo i >= 1). */
function randomFraction(prng, maxD = 12, allowImproper = false) {
  for (let tries = 0; tries < 50; tries++) {
    const d = prng.int(2, maxD);
    const n = prng.int(1, allowImproper ? 2 * d : d - 1);
    const f = makeFraction(n, d);
    if (f.d >= 2) {
      return f;
    }
  }
  return makeFraction(1, 2);
}

/** Kroky pro sčítání/odčítání zlomků včetně společného jmenovatele. */
function addSubSteps(a, b, operation) {
  const steps = [];
  const common = lcm(a.d, b.d);
  const aN = a.n * (common / a.d);
  const bN = b.n * (common / b.d);

  if (a.d !== b.d) {
    steps.push({
      operation: `Najdi společného jmenovatele: ${common}`,
      leftSide: `${formatNumber(a)} ${operation} ${formatNumber(b)}`,
      rightSide: `${aN}/${common} ${operation} ${bN}/${common}`,
      explanation: `Zlomky rozšíříme tak, aby měly stejného jmenovatele (${common}). Rozšířit zlomek znamená vynásobit čitatele i jmenovatele stejným číslem - hodnota se nezmění.`,
    });
  }

  const resultN = operation === '+' ? aN + bN : aN - bN;
  steps.push({
    operation: `${operation === '+' ? 'Sečti' : 'Odečti'} čitatele`,
    leftSide: `${aN}/${common} ${operation} ${bN}/${common}`,
    rightSide: `${resultN}/${common}`,
    explanation: 'Jmenovatel zůstane stejný, pracujeme jen s čitateli.',
  });

  if (resultN === 0) {
    steps.push({
      operation: 'Výsledek je nula',
      leftSide: `0/${common}`,
      rightSide: '0',
      explanation: 'Nula děleno čímkoliv je nula - nula se nekrátí.',
    });
    return steps;
  }

  const simplified = makeFraction(resultN, common);
  if (simplified.n !== resultN || simplified.d !== common) {
    const divisor = gcd(resultN, common);
    steps.push({
      operation: `Zrať číslem ${divisor}`,
      leftSide: `${resultN}/${common}`,
      rightSide: formatNumber(simplified),
      explanation: 'Výsledek vždy uvádíme v základním tvaru - čitatele i jmenovatele dělíme jejich největším společným dělitelem.',
    });
  }

  return steps;
}

/**
 * @param {number} seed
 * @param {'compare'|'add'|'subtract'|'simplify'|'expand'|'equivalent'} kind
 * @param {number} difficulty 1-3 (1: stejní jmenovatelé, 2: jeden násobek druhého, 3: obecní)
 */
export function generateFractionExercise(seed, kind, difficulty = 1) {
  const prng = createPrng(seed);
  const base = { topic: 'fractions', kind, seed, difficulty };

  if (kind === 'compare') {
    let a = randomFraction(prng);
    let b = randomFraction(prng);
    if (compareFractions(a, b) === 0) {
      b = makeFraction(b.n + 1, b.d);
    }
    const common = lcm(a.d, b.d);
    const answer = compareFractions(a, b) > 0 ? 'left' : 'right';
    const steps = [];
    if (a.d !== b.d) {
      steps.push({
        operation: `Převeď na společného jmenovatele ${common}`,
        leftSide: formatNumber(a),
        rightSide: formatNumber(b),
        explanation: `${formatNumber(a)} = ${a.n * (common / a.d)}/${common} a ${formatNumber(b)} = ${b.n * (common / b.d)}/${common}. Větší je ten s větším čitatelem.`,
      });
    }
    steps.push({
      operation: 'Výsledek',
      leftSide: a.d !== b.d ? `${a.n * (common / a.d)}/${common}` : formatNumber(a),
      rightSide: a.d !== b.d ? `${b.n * (common / b.d)}/${common}` : formatNumber(b),
      explanation:
        a.d !== b.d
          ? `Větší je ${answer === 'left' ? formatNumber(a) : formatNumber(b)}.`
          : `Jmenovatele jsou stejné, stačí porovnat čitatele. Větší je ${answer === 'left' ? formatNumber(a) : formatNumber(b)}.`,
    });
    return {
      ...base,
      text: `Který zlomek je větší: ${formatNumber(a)} nebo ${formatNumber(b)}?`,
      answer: { kind: 'choice', value: answer, options: [formatNumber(a), formatNumber(b)] },
      steps,
      hint: 'Zlomky s rozdílnými jmenovateli nejdřív převeď na společného jmenovatele - pak stačí porovnat čitatele.',
    };
  }

  if (kind === 'add' || kind === 'subtract') {
    let a;
    let b;
    if (difficulty <= 1) {
      const d = prng.int(2, 12);
      a = makeFraction(prng.int(1, d - 1), d);
      b = makeFraction(prng.int(1, d - 1), d);
    } else if (difficulty === 2) {
      const d = prng.pick([2, 3, 4, 6]);
      const d2 = d * prng.int(2, Math.floor(12 / d));
      a = makeFraction(prng.int(1, d - 1), d);
      b = makeFraction(prng.int(1, d2 - 1), d2);
    } else {
      // obecní jmenovatelé, ale společný jmenovatel držíme rozumně malý
      let tries = 0;
      do {
        a = randomFraction(prng);
        b = randomFraction(prng);
        tries++;
      } while (lcm(a.d, b.d) > 60 && tries < 50);
      if (lcm(a.d, b.d) > 60) {
        a = makeFraction(1, 3);
        b = makeFraction(1, 4);
      }
    }
    if (kind === 'subtract' && compareFractions(a, b) < 0) {
      [a, b] = [b, a];
    }
    const operation = kind === 'add' ? '+' : '-';
    const result = kind === 'add' ? addFractions(a, b) : subtractFractions(a, b);
    return {
      ...base,
      text: `Vypočítej: ${formatNumber(a)} ${operation} ${formatNumber(b)}`,
      answer: { kind: 'fraction', n: result.n, d: result.d },
      steps: addSubSteps(a, b, operation),
      hint:
        a.d === b.d
          ? 'Jmenovatele jsou stejné - stačí pracovat s čitateli.'
          : 'Nejdřív najdi společného jmenovatele (nejmenší společný násobek obou jmenovatelů).',
    };
  }

  if (kind === 'simplify') {
    const f = randomFraction(prng);
    const k = prng.int(2, 6);
    const given = { n: f.n * k, d: f.d * k };
    return {
      ...base,
      text: `Zrať do základního tvaru: ${given.n}/${given.d}`,
      answer: { kind: 'fraction', n: f.n, d: f.d },
      steps: [
        {
          operation: `Najdi největšího společného dělitele: ${k}`,
          leftSide: `${given.n}/${given.d}`,
          rightSide: formatNumber(f),
          explanation: `Číslem ${k} vydělíme čitatele i jmenovatele: ${given.n} : ${k} = ${f.n}, ${given.d} : ${k} = ${f.d}.`,
        },
      ],
      hint: 'Hledej číslo, kterým jde vydělit čitatele i jmenovatele beze zbytku. Zkus 2, 3, 5...',
    };
  }

  if (kind === 'expand') {
    const f = randomFraction(prng);
    const k = prng.int(2, Math.max(2, Math.floor(12 / f.d) * 2));
    const target = { n: f.n * k, d: f.d * k };
    return {
      ...base,
      text: `Rozšiř zlomek ${formatNumber(f)} na jmenovatele ${target.d}`,
      answer: { kind: 'fraction', n: target.n, d: target.d },
      steps: [
        {
          operation: `Vynásob čitatele i jmenovatele ${k}`,
          leftSide: formatNumber(f),
          rightSide: `${target.n}/${target.d}`,
          explanation: `${target.d} : ${f.d} = ${k}, takže násobíme ${k}. Rozšíření zlomku nemění jeho hodnotu.`,
        },
      ],
      hint: `Spočítej, kolikrát se ${f.d} vejde do ${target.d} - tím číslem pak vynásob čitatele.`,
    };
  }

  // equivalent: 1/2 = ?/8 nebo ?/6 = 2/3
  const f = randomFraction(prng);
  const k = prng.int(2, 6);
  const target = { n: f.n * k, d: f.d * k };
  const missingLeft = prng.next() < 0.5;
  return {
    ...base,
    text: missingLeft
      ? `Doplň chybějící číslo: ?/${target.d} = ${formatNumber(f)}`
      : `Doplň chybějící číslo: ${formatNumber(f)} = ?/${target.d}`,
    answer: { kind: 'int', value: target.n },
    steps: [
      {
        operation: `Rozšiř ${formatNumber(f)} číslem ${k}`,
        leftSide: formatNumber(f),
        rightSide: `${target.n}/${target.d}`,
        explanation: `${target.d} : ${f.d} = ${k}. Čitatele vynásobíme stejným číslem: ${f.n} × ${k} = ${target.n}.`,
      },
    ],
    hint: `Podívej se na jmenovatele: ${target.d} : ${f.d} = ?  Stejným číslem pak vynásob čitatele.`,
  };
}
