/**
 * Krokový řešič s metaforou rovnoramenné váhy (UCN-MATH-005, DEC-005).
 * Kroky jsou datová struktura - UI je renderuje/animuje na váze,
 * nápověda je vypisuje textem, testy je ověřují.
 *
 * Lineární rovnice je reprezentovaná dvěma výrazy:
 *   { x: {n,d}, c: {n,d} }  ...  (koeficient u x) * x + (konstanta)
 * tedy např. 3x + 4 = expr(3, 4).
 */

import {
  makeFraction,
  addFractions,
  subtractFractions,
  divideFractions,
  multiplyFractions,
  formatNumber,
  isWhole,
} from './fractions.js';

const ONE = Object.freeze({ n: 1, d: 1 });

/**
 * Zkratka pro sestavení výrazu z celých čísel nebo zlomků.
 * Výraz je { f, x, c } a znamená f * (x*X + c). Bez závorky je f = 1,
 * takže x a c rovnou nesou koeficient a konstantu.
 */
export function expr(xN, xD, cN, cD) {
  return { f: { ...ONE }, x: makeFraction(xN, xD), c: makeFraction(cN, cD) };
}

/** Součinový tvar k(x + b) - závorka, kterou lze roznásobit nebo vydělit. */
export function factoredExpr(kN, kD, xN, xD, cN, cD) {
  return { f: makeFraction(kN, kD), x: makeFraction(xN, xD), c: makeFraction(cN, cD) };
}

/** Činitel před závorkou (1, když závorka není). */
export function factorOf(e) {
  return e.f ?? ONE;
}

export function isFactored(e) {
  const f = factorOf(e);
  return !(f.n === 1 && f.d === 1);
}

/** Skutečný koeficient u x po roznásobení. */
export function effectiveX(e) {
  return multiplyFractions(factorOf(e), e.x);
}

/** Skutečná konstanta po roznásobení. */
export function effectiveC(e) {
  return multiplyFractions(factorOf(e), e.c);
}

/** Roznásobí závorku: k(x + b) -> kx + kb. */
export function expandExpr(e) {
  return { f: { ...ONE }, x: effectiveX(e), c: effectiveC(e) };
}

/** Hluboká kopie výrazu - kroky nesou snímky stavu, ne živé odkazy. */
export function cloneExpr(e) {
  return { f: { ...factorOf(e) }, x: { ...e.x }, c: { ...e.c } };
}

/** Formátuje výraz: '3x + 4', 'x', '-x', '(2/3)x - 1/2', '5', '2(x + 10)'. */
export function formatExpr(e) {
  if (isFactored(e)) {
    return `${formatNumber(factorOf(e))}(${formatPlain(e)})`;
  }
  return formatPlain(e);
}

function formatPlain(e) {
  const hasX = e.x.n !== 0;
  const hasC = e.c.n !== 0;
  const xTerm = !hasX
    ? ''
    : e.x.n === 1 && e.x.d === 1
      ? 'x'
      : e.x.n === -1 && e.x.d === 1
        ? '-x'
        : isWhole(e.x)
          ? `${e.x.n}x`
          : `(${formatNumber(e.x)})x`;
  if (!hasC) {
    return hasX ? xTerm : '0';
  }
  const cText = formatNumber({ n: Math.abs(e.c.n), d: e.c.d });
  if (!hasX) {
    return formatNumber(e.c);
  }
  return e.c.n > 0 ? `${xTerm} + ${cText}` : `${xTerm} - ${cText}`;
}

/** Dosadí hodnotu za x a vrátí hodnotu výrazu jako zlomek. */
export function evaluateExpr(e, xValue) {
  const x = typeof xValue === 'number' ? makeFraction(xValue) : xValue;
  return addFractions(multiplyFractions(effectiveX(e), x), effectiveC(e));
}

/**
 * Vyřeší lineární rovnici left = right a vrátí kroky v metafoře váhy.
 * @returns {{operation: string, leftSide: string, rightSide: string, explanation: string}[]}
 */
export function solveLinearSteps(left, right) {
  // Didakticky lepší cesta u 'a - x = b': místo práce se záporným -x
  // přesuneme x doprava ('Přičti x k oběma stranám') a řešíme prohozené strany.
  if (effectiveX(left).n < 0 && effectiveX(right).n === 0) {
    return solveLinearSteps(right, left);
  }

  const steps = [];
  let l = cloneExpr(left);
  let r = cloneExpr(right);

  const push = (operation, explanation) => {
    steps.push({
      operation,
      leftSide: formatExpr(l),
      rightSide: formatExpr(r),
      explanation,
      // Strojově čitelný stav po tomto kroku (UCN-STEP-001). Snímek, ne odkaz -
      // l a r se dál přepisují. Formátované strany zůstávají pro zobrazení a váhu.
      leftExpr: cloneExpr(l),
      rightExpr: cloneExpr(r),
    });
  };

  // 0. Závorka. Dělení činitelem je kratší cesta než roznásobení:
  //    2(x + 10) = 36  ->  x + 10 = 18. Roznásobení je stejně platné,
  //    krokový režim ho hráči nabízí jako druhou možnost.
  if (isFactored(r)) {
    r = expandExpr(r);
  }
  if (isFactored(l)) {
    const k = factorOf(l);
    l = { f: { ...ONE }, x: { ...l.x }, c: { ...l.c } };
    r = { f: { ...ONE }, x: divideFractions(r.x, k), c: divideFractions(r.c, k) };
    push(
      `Vyděl obě strany ${formatNumber(k)}`,
      'Před závorkou stojí činitel - dělením se ho zbavíme celého najednou a závorka zmizí.'
    );
  }

  // 1. Přesunout x-člen z pravé strany doleva.
  if (r.x.n !== 0) {
    const amount = { n: Math.abs(r.x.n), d: r.x.d };
    const amountText = amount.n === 1 && amount.d === 1 ? 'x' : `${formatNumber(amount)}x`;
    const operation =
      r.x.n > 0
        ? `Odečti ${amountText} z obou stran`
        : `Přičti ${amountText} k oběma stranám`;
    const explanation =
      r.x.n > 0
        ? 'Stejnou hodnotu odebereme na obou stranách - rovnost zůstane platná.'
        : 'Stejnou hodnotu přidáme na obou stranách - rovnost zůstane platná.';
    l.x = subtractFractions(l.x, r.x);
    r = expr(0, 1, r.c.n, r.c.d);
    push(operation, explanation);
  }

  // 2. Přesunout konstantu z levé strany doprava.
  if (l.c.n !== 0) {
    const amount = { n: Math.abs(l.c.n), d: l.c.d };
    const operation =
      l.c.n > 0
        ? `Odečti ${formatNumber(amount)} z obou stran`
        : `Přičti ${formatNumber(amount)} k oběma stranám`;
    const explanation =
      l.c.n > 0
        ? 'Stejný počet jednotek odebereme na obou stranách.'
        : 'Stejný počet jednotek přidáme na obou stranách.';
    r.c = subtractFractions(r.c, l.c);
    l = expr(l.x.n, l.x.d, 0, 1);
    push(operation, explanation);
  }

  // 3. Zbavit se koeficientu u x.
  if (!(l.x.n === 1 && l.x.d === 1)) {
    let operation;
    let explanation;
    if (l.x.n === -1 && l.x.d === 1) {
      operation = 'Vyměň znaménka na obou stranách (vynásob -1)';
      explanation = 'Když obě strany vynásobíme -1, rovnice platí dál.';
      r.c = multiplyFractions(r.c, makeFraction(-1));
    } else if (l.x.n === 1 && l.x.d > 1) {
      operation = `Vynásob obě strany ${l.x.d}`;
      explanation = 'Násobení obou stran stejným číslem rovnost nenaruší.';
      r.c = multiplyFractions(r.c, makeFraction(l.x.d));
    } else if (isWhole(l.x)) {
      operation = `Vyděl obě strany ${formatNumber(l.x)}`;
      explanation = 'Obě strany rozdělíme na stejný počet stejných dílů.';
      r.c = divideFractions(r.c, l.x);
    } else {
      const reciprocal = makeFraction(l.x.d, l.x.n);
      operation = `Vyděl obě strany ${formatNumber(l.x)} (to je stejné jako vynásobit ${formatNumber(reciprocal)})`;
      explanation = 'Dělení zlomkem je násobení jeho převrácenou hodnotou.';
      r.c = divideFractions(r.c, l.x);
    }
    l = expr(1, 1, 0, 1);
    push(operation, explanation);
  }

  // 4. Výsledek.
  steps.push({
    operation: 'Výsledek',
    leftSide: 'x',
    rightSide: formatExpr(r),
    explanation: `Neznámá x = ${formatExpr(r)}. Zkoušku uděláš dosazením do původní rovnice.`,
    leftExpr: expr(1, 1, 0, 1),
    rightExpr: cloneExpr(r),
  });

  return steps;
}

/** Vrátí řešení rovnice left = right jako zlomek. Počítá z roznásobených hodnot. */
export function solvedValue(left, right) {
  const numerator = subtractFractions(effectiveC(right), effectiveC(left));
  const denominator = subtractFractions(effectiveX(left), effectiveX(right));
  return divideFractions(numerator, denominator);
}
