/**
 * Krokový řešič s metaforou rovnoramenné váhy (UCN-MATH-005, DEC-005).
 * Kroky jsou datová struktura - UI je renderuje/animuje na váze,
 * nápověda je vypisuje textem, testy je ověřují.
 *
 * Lineární rovnice je reprezentovaná dvěma výrazy:
 *   { x: {n,d}, c: {n,d} }  ...  (koeficient u x) * x + (konstanta)
 * tedy např. 3x + 4 = expr(3, 4).
 *
 * Strana může nést i NESČTENOU podobu (UCN-STEP-003): volitelný seznam
 * `terms` - top-level členy { x, c }, např. x − x/2 − x/4. Invariant:
 * x a c jsou vždy součet členů (kanonický tvar slouží jako validační
 * reference i jako stav po operaci combine, DEC-012); terms je jen
 * didaktický pohled před sečtením. Sečíst členy musí hráč zvolit sám -
 * žádná tichá kanonizace (DEC-010).
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

/* --- Nesčtená (multi-term) reprezentace strany (UCN-STEP-003) --------------- */

/** Hluboká kopie jednoho členu { x, c }. */
export const cloneTerm = (t) => ({ x: { ...t.x }, c: { ...t.c } });

/**
 * JEDINÁ továrna na stranu se seznamem členů: terms = seznam top-level
 * členů { x, c }. x a c se dopočítou jako součet členů - invariant 'x a c
 * jsou vždy součet terms' (DEC-013) tak nejde rozbít omylem: kdo mění členy,
 * musí jít tudy a dostane dopočtený kanonický tvar zdarma.
 * `factor` je činitel před závorkou; členy pak popisují OBSAH závorky,
 * takže i u k(x + x + 3) sedí x a c s tím, co je uvnitř.
 */
export function sideFromTerms(terms, factor = ONE) {
  const x = terms.reduce((sum, t) => addFractions(sum, t.x), makeFraction(0));
  const c = terms.reduce((sum, t) => addFractions(sum, t.c), makeFraction(0));
  return { f: { ...factor }, x, c, terms: terms.map(cloneTerm) };
}

/** Nesčtená strana bez závorky - obvyklý vstup z parseru. */
export const multiTermSide = (terms) => sideFromTerms(terms);

/**
 * Dává na straně smysl operace 'sečíst stejné členy'?
 * Jen když má dva a víc x-členů nebo dvě a víc konstant - jinak by
 * byla prázdnou volbou (strana už je ve standardním tvaru ax + b).
 */
export function needsCombine(e) {
  if (!e || !Array.isArray(e.terms)) {
    return false;
  }
  const xTerms = e.terms.filter((t) => t.x.n !== 0).length;
  const constTerms = e.terms.filter((t) => t.c.n !== 0).length;
  return xTerms >= 2 || constTerms >= 2;
}

/**
 * Strana bez seznamu členů - standardní tvar ax + b (u závorky f(ax + b)).
 * Součty x a c už hodnotu členů nesou (invariant), takže stačí seznam
 * zahodit. Činitel zůstává: kanonizace se týká jen nesčtených členů,
 * závorku odstraňuje až roznásobení nebo dělení.
 */
export function canonicalSide(e) {
  return { f: { ...factorOf(e) }, x: { ...e.x }, c: { ...e.c } };
}

/** Sečtená podoba strany po hráčově operaci combine (UCN-STEP-003). */
export const combineSide = canonicalSide;

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

/**
 * Roznásobí závorku: k(x + b) -> kx + kb.
 * Nesčtené členy roznásobení přežijí - činitel se rozdělí mezi ně,
 * 2(x + x + 3) -> 2x + 2x + 6. Zahodit je a vrátit rovnou součet by byla
 * tichá kanonizace: roznásobit závorku a sečíst členy jsou dvě různá
 * rozhodnutí a to druhé musí zůstat na hráči (DEC-010).
 */
export function expandExpr(e) {
  const k = factorOf(e);
  if (Array.isArray(e.terms)) {
    return sideFromTerms(
      e.terms.map((t) => ({ x: multiplyFractions(k, t.x), c: multiplyFractions(k, t.c) }))
    );
  }
  return { f: { ...ONE }, x: effectiveX(e), c: effectiveC(e) };
}

/** Hluboká kopie výrazu - kroky nesou snímky stavu, ne živé odkazy. */
export function cloneExpr(e) {
  const clone = { f: { ...factorOf(e) }, x: { ...e.x }, c: { ...e.c } };
  if (Array.isArray(e.terms)) {
    clone.terms = e.terms.map(cloneTerm);
  }
  return clone;
}

/**
 * Formátuje výraz: '3x + 4', 'x', '-x', '(2/3)x - 1/2', '5', '2(x + 10)'.
 * Strana s nesčtenými členy (terms, UCN-STEP-003) se vykreslí ČLEN PO ČLENU
 * (DEC-013): krokový režim smí ukazovat jen to, co hráč skutečně napsal -
 * render ze součtů x/c by byl tichá kanonizace v didaktické ploše.
 */
export function formatExpr(e) {
  if (Array.isArray(e.terms)) {
    return formatTerms(e.terms);
  }
  if (isFactored(e)) {
    return `${formatNumber(factorOf(e))}(${formatPlain(e)})`;
  }
  return formatPlain(e);
}

/**
 * JEDINÝ zdroj pravdy pro zápis 'koeficient krát x' bez znaménka:
 * 'x' | 'x/9' | '3x' | '(2/3)x'. Tenhle tvar zní v zadání příkladu, takže
 * ho musí používat i pokyny kroků, tlačítka a náhledy - jinak hra píše týž
 * člen několika způsoby a dítě čte v pokynu '1/5x' a o řádek výš 'x/5'.
 *
 * POZOR: výsledek musí zůstat uvnitř gramatiky visualParse.parseSide, která
 * ho čte zpátky pro váhu. Kdo sem sáhne, ať doplní round-trip test v
 * test/solver.test.js.
 * @param {{n: number, d: number}} magnitude koeficient v absolutní hodnotě
 */
export function formatXMagnitude(magnitude) {
  if (magnitude.n === 1 && magnitude.d === 1) {
    return 'x';
  }
  // Koeficient 1/d píšeme jako 'x/9', ne '(1/9)x' - tak zní i zadání
  // a pro dítě je to čitelnější zápis dělení.
  if (magnitude.n === 1) {
    return `x/${magnitude.d}`;
  }
  return isWhole(magnitude) ? `${magnitude.n}x` : `(${formatNumber(magnitude)})x`;
}

/** Zápis x-členu VČETNĚ znaménka: 'x', '-x', 'x/5', '-(2/3)x'. */
export function formatXTerm(x) {
  const body = formatXMagnitude({ n: Math.abs(x.n), d: x.d });
  return x.n < 0 ? `-${body}` : body;
}

function formatPlain(e) {
  const hasX = e.x.n !== 0;
  const hasC = e.c.n !== 0;
  if (!hasX) {
    return hasC ? formatNumber(e.c) : '0';
  }

  const magnitude = { n: Math.abs(e.x.n), d: e.x.d };
  const xBody = formatXMagnitude(magnitude);
  const xNegative = e.x.n < 0;
  const signedX = xNegative ? `-${xBody}` : xBody;

  if (!hasC) {
    return signedX;
  }

  // Záporný x-člen s kladnou konstantou píšeme jako '12 - x', ne '-x + 12'.
  // Přesně tak zní i zadání příkladu - dítě jinak vidí dva zápisy téhož
  // a musí si domýšlet, že jde o tutéž rovnici.
  if (xNegative && e.c.n > 0) {
    return `${formatNumber(e.c)} - ${xBody}`;
  }

  const cText = formatNumber({ n: Math.abs(e.c.n), d: e.c.d });
  return e.c.n > 0 ? `${signedX} + ${cText}` : `${signedX} - ${cText}`;
}

/**
 * Formátuje nesčtenou stranu z jejích členů: 'x - x/2 - x/4', '2x + 3 + x'.
 * Člen, který nese x-člen i konstantu (např. roznásobená závorka ze vstupu),
 * se pro čitelnost uzavorkuje.
 */
export function formatTerms(terms) {
  let text = '';
  for (const t of terms) {
    const negative = t.x.n !== 0 ? t.x.n < 0 : t.c.n < 0;
    const magnitude = {
      x: makeFraction(Math.abs(t.x.n), t.x.d),
      c: makeFraction(Math.abs(t.c.n), t.c.d),
    };
    const body =
      t.x.n !== 0 && t.c.n !== 0 ? `(${formatPlain(magnitude)})` : formatPlain(magnitude);
    if (!text) {
      text = negative ? `-${body}` : body;
    } else {
      text += negative ? ` - ${body}` : ` + ${body}`;
    }
  }
  return text || '0';
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
  //
  // Když ale vlevo stojí samotné '-x' (bez konstanty), je prohození oklika:
  // '-x = -11' se řeší jedním vynásobením -1, kdežto prohozením by vznikla
  // rada 'přičti x' a teprve pak 'přičti 11', což ze současného stavu
  // vypadá jako nesmysl. Proto podmínka na nenulovou konstantu vlevo.
  const swap =
    effectiveX(left).n < 0 && effectiveX(right).n === 0 && effectiveC(left).n !== 0;
  const from = swap ? { l: right, r: left } : { l: left, r: right };

  const steps = [];
  // Odvození je algebraický výpočet, ne hráčův krok - nesčtené členy sem
  // nepatří a tichá kanonizace je tu naopak SPRÁVNĚ (DEC-013). Kroky níž
  // přepisují x a c, kdežto formatExpr kreslí přednostně terms: se
  // zastaralým seznamem by nápověda ukázala 'x = 3 + 5' místo 'x = 14'.
  // canonicalSide zároveň kopíruje - vstup je živý stav relace, nesmí se mutovat.
  let l = canonicalSide(from.l);
  let r = canonicalSide(from.r);

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

  // 0a. Sečtení členů řekneme nahlas. Jinak by dítě vidělo, jak se
  //     'x + x + 8 = 20 + x' beze slova změnilo na 'x + 8 = 20', a nevědělo,
  //     kde se to stalo. Stav po kroku už je kanonický (viz výše).
  if (needsCombine(from.l) || needsCombine(from.r)) {
    const uncombined = [from.l, from.r].filter((side) => needsCombine(side));
    const where =
      uncombined.length === 2
        ? 'obou stranách'
        : `${needsCombine(from.l) ? 'levé' : 'pravé'} straně`;
    // Vysvětlení jmenuje KONKRÉTNÍ členy a jejich součet. Bez toho by krok
    // pojmenovával pohyb, který nikde neukáže: strany kroku už nesou stav PO
    // sečtení, takže tvar 'x/2 + x/3' by dítě v nápovědě nespatřilo nikde.
    // Členy bereme z from.* (ještě nesečtené) a kreslíme je formatTerms, aby
    // nepřibyl další zápis x-členu vedle společného formátovače.
    const named = uncombined
      .map((side) => `${formatTerms(side.terms)} je totéž co ${formatExpr(canonicalSide(side))}`)
      .join(', ');
    push(
      `Sečti stejné členy na ${where}`,
      `${named}. Stejné druhy členů sečteme dohromady - hodnota strany se tím nemění, jen se zpřehlední.`
    );
  }

  // 0b. Závorka. Dělení činitelem je kratší cesta než roznásobení:
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
    // Zápis přes společný formátovač: pokyn tak zní stejně jako zadání
    // ('Odečti x/5', ne 'Odečti 1/5x'). U zlomkových rovnic s x na obou
    // stranách je tohle první místo, kde se ten rozdíl projeví.
    const amountText = formatXMagnitude(amount);
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

  // 3a. Zlomkový koeficient nejdřív vyčistíme vynásobením jmenovatelem.
  //     '(2/9)x = 4/9' tak vede na '× 9' a pak '÷ 2' místo jediného
  //     dělení zlomkem 2/9 - dvě elementární operace jsou pro dítě
  //     schůdnější než dělení zlomkem, i když je jich o jednu víc.
  if (l.x.d > 1) {
    const denominator = makeFraction(l.x.d);
    l = expr(multiplyFractions(l.x, denominator).n, 1, 0, 1);
    r.c = multiplyFractions(r.c, denominator);
    push(
      `Vynásob obě strany ${formatNumber(denominator)}`,
      'Násobením jmenovatelem se u x zbavíme zlomku.'
    );
  }

  // 3b. Zbavit se celočíselného koeficientu u x.
  if (l.x.n === -1) {
    r.c = multiplyFractions(r.c, makeFraction(-1));
    l = expr(1, 1, 0, 1);
    push(
      'Vyměň znaménka na obou stranách (vynásob -1)',
      'Když obě strany vynásobíme -1, rovnice platí dál.'
    );
  } else if (l.x.n !== 1) {
    const divisor = { ...l.x };
    r.c = divideFractions(r.c, divisor);
    l = expr(1, 1, 0, 1);
    push(
      `Vyděl obě strany ${formatNumber(divisor)}`,
      'Obě strany rozdělíme na stejný počet stejných dílů.'
    );
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
