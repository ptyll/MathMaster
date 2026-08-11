/**
 * Generátor slovních úloh vedoucích na lineární rovnice (UCN-MATH-007).
 * Čistá funkce (seed, difficulty) -> úloha, deterministická (DEC-003).
 *
 * Generuje zezadu: nejdřív se vylosují čísla tak, aby řešení x bylo pěkné,
 * a z nich se složí české zadání i kanonický tvar rovnice. Čeština se nikdy
 * neparsuje - struktura (equation) je jediný zdroj pravdy pro validaci
 * hráčovy rovnice (UCN-STEP-004) i pro krokový režim, který je u slovních
 * úloh vždy zapnutý.
 *
 * Obtížnost:
 *   2: x ± a = b            (myslím si číslo)
 *   3: ax + b = c           (myslím si číslo / stroj násobí a přičte)
 *   4: a(x + b) = c         (stroj přičte a pak násobí)
 *      x − x/n = b          (odečtu n-tinu neznámé, ne konstanty)
 *   5: x − x/n − x/m = b    (odečtu dvě části neznámé)
 *   6: x/n + a = b, (p/q)x + c = out  (zlomkové rovnice, x může být zlomek)
 */

import { createPrng } from './prng.js';
import { expr, factoredExpr, solveLinearSteps, solvedValue, cloneExpr, effectiveX, effectiveC } from './solver.js';
import { makeFraction, addFractions, multiplyFractions, isWhole, formatNumber, gcd } from './fractions.js';

// Předem napsané názvy n-tin - žádné dynamické skloňování.
const NTH_PART = Object.freeze({
  2: 'polovinu',
  3: 'třetinu',
  4: 'čtvrtinu',
  5: 'pětinu',
  6: 'šestinu',
});

// Zlomkové koeficienty pro stroj v obtížnosti 6 - vždy v základním tvaru.
const FRACTION_COEFFICIENTS = Object.freeze([
  [1, 2],
  [1, 3],
  [2, 3],
  [1, 4],
  [3, 4],
  [2, 5],
  [3, 5],
  [4, 5],
  [1, 6],
  [5, 6],
]);

/**
 * Distraktory pro celočíselnou odpověď - stejná logika jako u rovnic:
 * hodnota±1 a typická chyba o koeficient/konstantu. Bez duplicit,
 * bez správné odpovědi, bez nuly a záporných čísel.
 * Vždy vrací právě 3 hodnoty, aby šla postavit nabídka ze 4 možností.
 */
function intDistractors(answer, delta) {
  const seen = new Set([answer]);
  const result = [];
  const take = (c) => {
    if (c > 0 && !seen.has(c)) {
      seen.add(c);
      result.push(c);
    }
    return result.length === 3;
  };
  for (const c of [answer + 1, answer - 1, answer + delta, answer - delta, answer + 2]) {
    if (take(c)) {
      return result;
    }
  }
  // U malých odpovědí (typicky answer = 1) spadne většina typických chyb pod
  // nulu nebo se zdvojí - dorovnáme čísly nad odpovědí, aby distraktory byly
  // vždy tři. Nahoru se dá jít vždy, dolů u jedničky ne.
  for (let c = answer + 3; result.length < 3; c++) {
    take(c);
  }
  return result;
}

function build({ kind, form, left, right, text, hint, writeHint, seed, difficulty }) {
  const steps = solveLinearSteps(left, right);
  const value = solvedValue(left, right);
  const lx = effectiveX(left);
  const lc = effectiveC(left);
  const delta =
    Math.abs(lx.n) > 1 && lx.d === 1
      ? Math.abs(lx.n)
      : Math.abs(lc.n) > 0 && lc.d === 1
        ? Math.abs(lc.n)
        : 2;
  return {
    topic: 'wordProblems',
    kind,
    form,
    text,
    answer: isWhole(value)
      ? { kind: 'int', value: value.n }
      : { kind: 'fraction', n: value.n, d: value.d },
    // Krokové řešení má každá slovní úloha - krokový režim se nikdy nevypíná.
    steps,
    // Kanonický tvar rovnice: jediný zdroj pravdy pro validaci (UCN-STEP-004)
    // i výchozí stav krokového režimu (UCN-STEP-002).
    equation: { left: cloneExpr(left), right: cloneExpr(right) },
    hint,
    // Nápověda k překladu fráze zadání do rovnice (UCV-MISSION-003, vrstva 2
    // ve fázi 'napiš rovnici'). Krátká, per-form, NIKDY ne celá rovnice.
    writeHint,
    distractors: isWhole(value) ? intDistractors(value.n, delta) : [],
    seed,
    difficulty,
  };
}

/** difficulty 2: x + a = b nebo x - a = b ("myslím si číslo"). */
function generateThinkNumberSimple(prng, seed, difficulty) {
  if (prng.next() < 0.5) {
    // x + a = b
    const x = prng.int(3, 60);
    const a = prng.int(2, 30);
    const b = x + a;
    return build({
      kind: 'thinkNumber',
      form: 'thinkPlus',
      left: expr(1, 1, a, 1),
      right: expr(0, 1, b, 1),
      text: `Myslím si číslo. Když k němu přičtu ${a}, dostanu ${b}. Které číslo si myslím?`,
      hint: 'Číslo, které hledáš, si označ x. Co se s ním stalo? Přičtení zrušíš odečtením - na obou stranách rovnice.',
      writeHint: `Hledané číslo je x. 'K němu přičtu ${a}' znamená x + ${a}.`,
      seed,
      difficulty,
    });
  }
  // x - a = b
  const x = prng.int(5, 60);
  const a = prng.int(2, x - 2);
  const b = x - a;
  return build({
    kind: 'thinkNumber',
    form: 'thinkMinus',
    left: expr(1, 1, -a, 1),
    right: expr(0, 1, b, 1),
    text: `Myslím si číslo. Když od něj odečtu ${a}, dostanu ${b}. Které číslo si myslím?`,
    hint: 'Číslo, které hledáš, si označ x. Odečtení zrušíš přičtením - na obou stranách rovnice.',
    writeHint: `Hledané číslo je x. 'Od něj odečtu ${a}' znamená x - ${a}.`,
    seed,
    difficulty,
  });
}

/** difficulty 3: ax + b = c ("myslím si číslo" nebo stroj "vynásob a přičti"). */
function generateTimesPlus(prng, seed, difficulty) {
  const a = prng.int(2, 9);
  const x = prng.int(2, 15);
  const b = prng.int(1, 20);
  const c = a * x + b;
  const left = expr(a, 1, b, 1);
  const right = expr(0, 1, c, 1);
  const hint = 'Nejdřív se zbav čísla bez x (odečti ho z obou stran), teprve pak děl koeficientem u x.';
  if (prng.next() < 0.5) {
    return build({
      kind: 'thinkNumber',
      form: 'thinkTimesPlus',
      left,
      right,
      text: `Myslím si číslo. Když ho vynásobím ${a} a přičtu ${b}, dostanu ${c}. Které číslo si myslím?`,
      hint,
      writeHint: `Hledané číslo je x. 'Vynásobím ${a}' znamená ${a}x a 'přičtu ${b}' znamená + ${b}.`,
      seed,
      difficulty,
    });
  }
  return build({
    kind: 'machine',
    form: 'machineTimesPlus',
    left,
    right,
    text: `Početní stroj vstup vynásobí ${a} a pak přičte ${b}. Který vstup dá výstup ${c}?`,
    hint,
    writeHint: `Vstup je x. Stroj ho 'vynásobí ${a}', takže ${a}x, a pak 'přičte ${b}', takže + ${b}.`,
    seed,
    difficulty,
  });
}

/** difficulty 4: a(x + b) = c (stroj "přičte a pak násobí"). */
function generatePlusTimes(prng, seed, difficulty) {
  const a = prng.int(2, 5);
  const x = prng.int(2, 15);
  const b = prng.int(1, 15);
  const c = a * (x + b);
  return build({
    kind: 'machine',
    form: 'machinePlusTimes',
    left: factoredExpr(a, 1, 1, 1, b, 1),
    right: expr(0, 1, c, 1),
    text: `Početní stroj ke vstupu přičte ${b} a výsledek vynásobí ${a}. Který vstup dá výstup ${c}?`,
    // Řešitelská nápověda pro krokovou fázi - rovnici neprozrazuje (tu má
    // ukázat až vrstva 3 ve fázi 'napiš rovnici').
    hint: `Stroj napřed přičetl ${b} a pak násobil ${a} - závorku odstraníš dělením ${a} na obou stranách.`,
    // Vrstva 2 učí PRAVIDLO o pořadí operací a závorce, hotový výraz
    // a(x + b) neskládá - to je právě ta obtížnost, kterou má hráč zvládnout
    // sám (rovnici ukáže až vrstva 3).
    writeHint: `Vstup je x. Stroj nejdřív 'přičte ${b}' a teprve výsledek 'vynásobí ${a}' - co stroj udělal dřív, patří do závorky a činitel se píše před ni.`,
    seed,
    difficulty,
  });
}

/**
 * difficulty 4: x - x/n = b ("odečtu n-tinu neznámé" - nikoli konstanty).
 * Kanonicky (n-1)/n * x = b; x je násobek n, takže řešení je pěkné celé.
 */
function generateNthPart(prng, seed, difficulty) {
  const n = prng.pick([2, 3, 4]);
  const k = prng.int(1, 12);
  const x = n * k;
  const b = (n - 1) * k;
  return build({
    kind: 'thinkNumber',
    form: 'thinkNthPart',
    left: expr(n - 1, n, 0, 1),
    right: expr(0, 1, b, 1),
    text: `Od celého čísla odečtu jeho ${NTH_PART[n]} a zůstane mi ${b}. Které číslo to je?`,
    hint: `${NTH_PART[n]} čísla x je x/${n}. Když ji od x odečteš, zůstane ${n - 1}/${n} z x - a to je ${b}.`,
    writeHint: `'${NTH_PART[n]} čísla' je x/${n}. Odečítáš ji od celého čísla, tedy od x.`,
    seed,
    difficulty,
  });
}

/**
 * difficulty 5: x - x/n - x/m = b ("odečtu dvě části neznámé").
 * Kanonicky ((nm - m - n)/(nm)) * x = b; x je násobek zkráceného jmenovatele.
 */
function generateTwoParts(prng, seed, difficulty) {
  const [n, m] = prng.pick([
    [2, 4],
    [2, 3],
    [3, 4],
  ]);
  const numerator = n * m - m - n; // vždy kladné pro nabízené dvojice
  const denominator = n * m;
  const g = gcd(numerator, denominator);
  const k = prng.int(1, 8);
  const x = (denominator / g) * k;
  const b = (numerator / g) * k;
  return build({
    kind: 'thinkNumber',
    form: 'thinkTwoParts',
    left: expr(numerator, denominator, 0, 1),
    right: expr(0, 1, b, 1),
    text: `Od celého čísla odečtu jeho ${NTH_PART[n]} a ještě jeho ${NTH_PART[m]}. Zůstane mi ${b}. Které číslo to je?`,
    hint: 'Označ si číslo x a sečti, kolik z něj celkem odečítáš. Zbytek po obou odečteních je právě pravá strana rovnice.',
    writeHint: `'${NTH_PART[n]} čísla' je x/${n} a '${NTH_PART[m]} čísla' je x/${m} - obě části odečítáš od x.`,
    seed,
    difficulty,
  });
}

/** difficulty 6: x/n + a = b ("n-tina čísla zvětšená o a"), řešení celé. */
function generateFractionPlus(prng, seed, difficulty) {
  const n = prng.pick([2, 3, 4, 5, 6]);
  const x = n * prng.int(1, 10);
  const a = prng.int(1, 15);
  const b = x / n + a;
  return build({
    kind: 'thinkNumber',
    form: 'thinkFractionPlus',
    left: expr(1, n, a, 1),
    right: expr(0, 1, b, 1),
    text: `Myslím si číslo. Když jeho ${NTH_PART[n]} zvětším o ${a}, dostanu ${b}. Které číslo si myslím?`,
    hint: `${NTH_PART[n]} čísla x je x/${n}. Nejdřív odečti ${a} z obou stran, pak obě strany vynásob ${n}.`,
    writeHint: `'${NTH_PART[n]} čísla' je x/${n} a 'zvětším o ${a}' znamená + ${a}.`,
    seed,
    difficulty,
  });
}

/**
 * difficulty 6: (p/q)x + c = out (stroj násobí zlomkem a přičte).
 * Řešení může být zlomek v základním tvaru.
 */
function generateFractionMachine(prng, seed, difficulty) {
  const [p, q] = prng.pick(FRACTION_COEFFICIENTS);
  const coef = makeFraction(p, q);
  // Polovina úloh má celé řešení, polovina zlomkové - obojí v základním tvaru.
  const x = prng.next() < 0.5 ? makeFraction(prng.int(2, 15)) : makeFraction(prng.int(3, 19), prng.pick([2, 3, 4, 5]));
  const c = prng.int(1, 10);
  const out = addFractions(multiplyFractions(coef, x), makeFraction(c));
  return build({
    kind: 'machine',
    form: 'machineFractionTimesPlus',
    left: expr(coef.n, coef.d, c, 1),
    right: expr(0, 1, out.n, out.d),
    text: `Početní stroj vstup vynásobí ${formatNumber(coef)} a pak přičte ${c}. Který vstup dá výstup ${formatNumber(out)}?`,
    hint: `Nejdřív odečti ${c} z obou stran. Pak se zbav zlomku u x: vynásob obě strany ${coef.d} a vyděl ${coef.n}.`,
    writeHint: `Vstup je x. 'Vynásobí ${formatNumber(coef)}' znamená ${formatNumber(coef)}x a 'přičte ${c}' znamená + ${c}.`,
    seed,
    difficulty,
  });
}

/**
 * Vstup rovnice podle obtížnosti (DEC-010): do obtížnosti 3 hráč skládá
 * rovnici z dlaždic, od 4 ji píše volně na rozšířené klávesnici.
 * Misní integrace (UCV-MISSION-003) podle toho vybírá builder.
 */
export function equationInputKind(difficulty) {
  return difficulty <= 3 ? 'tiles' : 'free';
}

/**
 * Operace početního stroje pro diagram šipek v zadání (UCV-MISSION-003):
 * vstup -> operace -> výstup. Odvozuje se ze struktury úlohy (form +
 * koeficienty rovnice), nikdy z českého textu. U úloh, které strojem
 * nejsou (myslím si číslo), vrací null - diagram se nekreslí.
 * @returns {{symbol: string, value: string}[]|null}
 */
export function machineOperations(problem) {
  const left = problem.equation?.left;
  if (!left) {
    return null;
  }
  switch (problem.form) {
    case 'machineTimesPlus':
    case 'machineFractionTimesPlus':
      // ax + b = c, případně (p/q)x + b = c: násobí a pak přičte.
      return [
        { symbol: '×', value: formatNumber(left.x) },
        { symbol: '+', value: formatNumber(left.c) },
      ];
    case 'machinePlusTimes':
      // a(x + b) = c: přičte a pak násobí činitelem před závorkou.
      return [
        { symbol: '+', value: formatNumber(left.c) },
        { symbol: '×', value: formatNumber(left.f) },
      ];
    default:
      return null;
  }
}

/**
 * Vygeneruje slovní úlohu. Stejný seed + difficulty = stejná úloha.
 * @param {number} seed celé číslo
 * @param {number} difficulty 2-6 (mimo rozsah se přiřadí k nejbližšímu kraji,
 *   nečíselná hodnota k nejlehčí obtížnosti 2)
 */
export function generateWordProblem(seed, difficulty = 2) {
  const prng = createPrng(seed);
  // Nečíselná obtížnost (NaN, 'abc', rozbitý uložený stav) nemá nejbližší kraj,
  // takže by proklouzla do větve default a šířila se dál jako difficulty: NaN.
  // Padáme na 2 - dítě dostane raději nejlehčí úlohu než nejtěžší.
  const requested = Math.trunc(Number(difficulty));
  const d = Number.isNaN(requested) ? 2 : Math.min(6, Math.max(2, requested));

  switch (d) {
    case 2:
      return generateThinkNumberSimple(prng, seed, d);
    case 3:
      return generateTimesPlus(prng, seed, d);
    case 4:
      return prng.next() < 0.5
        ? generatePlusTimes(prng, seed, d)
        : generateNthPart(prng, seed, d);
    case 5:
      return generateTwoParts(prng, seed, d);
    default:
      return prng.next() < 0.5
        ? generateFractionPlus(prng, seed, d)
        : generateFractionMachine(prng, seed, d);
  }
}
