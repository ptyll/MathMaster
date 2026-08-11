/**
 * Regrese krokového režimu nad NESČTENÝMI členy (UCN-STEP-003, DEC-013):
 * nabídka operace 'sečti stejné členy', dopočet a náhled po členech,
 * váha u nesčtené strany a odmítnutí zápisu, který je rovnou výsledek.
 *
 * DOM vrstvu (js/ui/stepInput.js) node --test nespouští - projekt nemá jsdom.
 * Testy tady drží kontrakt, ze kterého UI čerpá: combinableSides (podle něj
 * se kreslí tlačítka), question/pendingPreview (text otázky a náhledu) a
 * needsCombine (podle něj se váha schovává).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  expr,
  multiTermSide,
  combineSide,
  needsCombine,
  formatExpr,
} from '../js/content/solver.js';
import { createStepSession } from '../js/engine/stepSession.js';
import { parseEquation } from '../js/content/equationParse.js';
import { generateWordProblem } from '../js/content/wordProblems.js';
import { parseSide } from '../js/ui/visualParse.js';
import { makeFraction } from '../js/content/fractions.js';

const f = (n, d = 1) => makeFraction(n, d);
/** x-člen (koeficient × x) pro sestavení nesčtené strany. */
const xt = (n, d = 1) => ({ x: f(n, d), c: f(0) });
/** Konstantní člen pro sestavení nesčtené strany. */
const ct = (n, d = 1) => ({ x: f(0), c: f(n, d) });

const T = {
  x: Object.freeze({ kind: 'x' }),
  eq: Object.freeze({ kind: 'eq' }),
  num: (n, d) => ({ kind: 'num', n, d }),
  op: (op) => ({ kind: 'op', op }),
};

/** První slovní úloha zadaného tvaru - generátor je deterministický. */
function wordProblemOfForm(form, difficulty) {
  for (let seed = 1; seed <= 500; seed++) {
    const exercise = generateWordProblem(seed, difficulty);
    if (exercise.form === form) {
      return exercise;
    }
  }
  throw new Error(`Úloha tvaru ${form} se nevygenerovala`);
}

/* --- Operace 'sečti stejné členy' musí být dosažitelná ------------------- */

test('UCN-STEP-003-T10: slovní úloha s nesčtenými členy je průchodná až do konce', () => {
  // 'Od celého čísla odečtu jeho polovinu a ještě jeho třetinu...' - hráč
  // napíše přesně to, k čemu ho vede writeHint: x - x/2 - x/3 = b.
  const exercise = wordProblemOfForm('thinkTwoParts', 5);
  const [, n, k] = exercise.writeHint.match(/x\/(\d+)[^0-9]+x\/(\d+)/).map(Number);
  const b = exercise.equation.right.c.n;
  const tokens = [
    T.x, T.op('-'), T.x, T.op('/'), T.num(n), T.op('-'), T.x, T.op('/'), T.num(k),
    T.eq, T.num(b),
  ];

  const session = createStepSession(exercise);
  const parsed = parseEquation(tokens, exercise.equation);
  assert.equal(parsed.status, 'match');
  assert.equal(session.recordEquationResult(parsed).advanced, true);

  const inner = session.equationSession;
  assert.equal(inner.equationText, `x - x/2 - x/${k} = ${b}`);
  // Podle tohohle getteru kreslí stepInput tlačítka - bez nabídnuté operace
  // 'combine' je příklad nedokončitelný (terms odstraní jedině ona).
  assert.deepEqual(inner.combinableSides, ['left'], 'UI má co nabídnout');

  inner.submitOperation({ kind: 'combine', side: 'left' });
  // 1 - 1/2 - 1/3 = 1/6
  assert.equal(inner.submitValue({ kind: 'fraction', n: 1, d: 6 }).status, 'committed');
  assert.equal(inner.equationText, `x/6 = ${b}`);
  assert.deepEqual(inner.combinableSides, []);

  inner.submitOperation({ kind: 'mul', operand: f(6) });
  assert.equal(inner.submitValue({ kind: 'int', value: b * 6 }).status, 'solved');
  assert.equal(session.isDone, true, 'příklad jde dořešit až do konce');
  assert.equal(inner.equationText, `x = ${b * 6}`);
  assert.deepEqual(session.getOutcome(), { solved: true, mistakes: 0, errors: {} });
});

test('UCN-STEP-003-T11: sečitatelné strany se nabízejí obě a po sečtení mizí', () => {
  // 2x + 3 + x = 20 - 5: sečíst jde vlevo i vpravo, hráč si vybírá stranu
  const s = createStepSession({
    equation: { left: multiTermSide([xt(2), ct(3), xt(1)]), right: multiTermSide([ct(20), ct(-5)]) },
  });
  assert.deepEqual(s.combinableSides, ['left', 'right'], 'obě strany = dvě tlačítka');

  s.submitOperation({ kind: 'combine', side: 'right' });
  assert.equal(s.question.prompt, 'Jaké číslo zůstane na pravé straně?');
  s.submitValue({ kind: 'int', value: 15 });
  assert.deepEqual(s.combinableSides, ['left'], 'sečtená strana z nabídky zmizí');
  assert.equal(s.equationText, '2x + 3 + x = 15');

  s.submitOperation({ kind: 'combine', side: 'left' });
  s.submitValue({ kind: 'int', value: 3 });   // 2x + x
  s.submitValue({ kind: 'int', value: 3 });   // konstanta zůstává
  assert.equal(s.equationText, '3x + 3 = 15');
  assert.deepEqual(s.combinableSides, []);
});

/* --- Dopočet a náhled po členech, ne přes jejich součet ------------------ */

test('UCN-STEP-003-T12: dopočet nad nesčtenou stranou se ptá po členech', () => {
  // x - x/2 - x/4 = 15, hráč vynásobí dvanácti -> 12x - 6x - 3x = 180.
  // Otázka na součet (3) by hráče nutila spočítat číslo, které v rovnici
  // po kroku vůbec nestojí.
  const s = createStepSession({
    equation: { left: multiTermSide([xt(1), xt(-1, 2), xt(-1, 4)]), right: expr(0, 1, 15, 1) },
  });
  s.submitOperation({ kind: 'mul', operand: f(12) });

  assert.equal(s.question.prompt, 'Kolik x vyjde z členu x?');
  assert.deepEqual(s.pendingPreview, { left: '?x + ?x + ?x', right: '?' });
  s.submitValue({ kind: 'int', value: 12 });

  assert.equal(s.question.prompt, 'Kolik x vyjde z členu -x/2?');
  assert.deepEqual(s.pendingPreview, { left: '12x + ?x + ?x', right: '?' });
  // Znaménko je součást odpovědi - kladná šestka je chyba druhu 'sign'.
  assert.equal(s.submitValue({ kind: 'int', value: 6 }).status, 'wrong');
  s.submitValue({ kind: 'int', value: -6 });

  assert.equal(s.question.prompt, 'Kolik x vyjde z členu -x/4?');
  assert.deepEqual(s.pendingPreview, { left: '12x - 6x + ?x', right: '?' });
  s.submitValue({ kind: 'int', value: -3 });

  assert.equal(s.question.prompt, 'Jaké číslo zůstane na pravé straně?');
  assert.deepEqual(s.pendingPreview, { left: '12x - 6x - 3x', right: '?' });
  s.submitValue({ kind: 'int', value: 180 });

  // Rovnice po kroku obsahuje přesně ta čísla, na která se hra ptala.
  assert.equal(s.equationText, '12x - 6x - 3x = 180');
  assert.equal(s.getOutcome().errors.sign, 1);

  // Teprve sečtení se ptá na součet - a strana se sečtená i vykreslí.
  s.submitOperation({ kind: 'combine', side: 'left' });
  assert.equal(s.question.prompt, 'Kolik x zůstane na levé straně?');
  s.submitValue({ kind: 'int', value: 3 });
  assert.equal(s.equationText, '3x = 180');
});

test('UCN-STEP-003-T13: dělení se ptá na každý změněný člen včetně konstanty', () => {
  // 2x + 3 + x = 15, vyděleno třemi -> (2/3)x + 1 + x/3 = 5
  const s = createStepSession({
    equation: { left: multiTermSide([xt(2), ct(3), xt(1)]), right: expr(0, 1, 15, 1) },
  });
  s.submitOperation({ kind: 'div', operand: f(3) });

  assert.equal(s.question.prompt, 'Kolik x vyjde z členu 2x?');
  s.submitValue({ kind: 'fraction', n: 2, d: 3 });
  assert.equal(s.question.prompt, 'Jaké číslo vyjde z členu 3?');
  s.submitValue({ kind: 'int', value: 1 });
  assert.equal(s.question.prompt, 'Kolik x vyjde z členu x?');
  s.submitValue({ kind: 'fraction', n: 1, d: 3 });
  assert.equal(s.question.prompt, 'Jaké číslo zůstane na pravé straně?');
  s.submitValue({ kind: 'int', value: 5 });

  assert.equal(s.equationText, '(2/3)x + 1 + x/3 = 5');
});

test('UCN-STEP-003-T14: člen přidaný operací se nedopočítává - hodnotu hráč zadal sám', () => {
  // 2x + 3 + x = 4x, hráč odečte 4x: vlevo přibude člen -4x (ten zná),
  // vpravo se x vynuluje - ptát se není na co.
  const s = createStepSession({
    equation: { left: multiTermSide([xt(2), ct(3), xt(1)]), right: expr(4, 1, 0, 1) },
  });
  const res = s.submitOperation({ kind: 'sub', operand: f(4), term: 'x' });
  assert.equal(res.status, 'committed', 'krok nemá co dopočítávat, projde rovnou');
  assert.equal(s.question, null);
  assert.equal(s.equationText, '2x + 3 + x - 4x = 0');

  // Součet -1 se počítá až u sečtení členů, kde ho hráč taky uvidí napsaný.
  s.submitOperation({ kind: 'combine', side: 'left' });
  assert.equal(s.question.prompt, 'Kolik x zůstane na levé straně?');
  s.submitValue({ kind: 'int', value: -1 });
  s.submitValue({ kind: 'int', value: 3 });
  // Záporný x-člen s kladnou konstantou se píše jako '3 - x' (tak zní i zadání).
  assert.equal(s.equationText, '3 - x = 0');
});

/* --- Váha u nesčtené strany ---------------------------------------------- */

test('UCN-STEP-003-T15: nesčtenou stranu váha nekreslí - přečetla by ji špatně', () => {
  // Váha parsuje TEXT strany (parseSide). U nesčtených členů z něj vyjde
  // nesmysl, proto stepInput váhu podle needsCombine schová a napíše proč.
  const parts = multiTermSide([xt(1), xt(-1, 2), xt(-1, 4)]);
  assert.equal(needsCombine(parts), true, 'podle tohohle příznaku se váha schovává');
  const readBack = parseSide(formatExpr(parts));
  assert.equal(readBack.constantText, '-x/2 - x/4', 'x-členy by skončily nad miskou jako konstanta');
  assert.ok(
    Number.isNaN(parseInt(readBack.constantText.split('/')[0], 10)),
    'a kostky by z toho nevyšly vůbec'
  );

  // '2x + 3 + x': třetí člen by se nakreslil jako jednotkové kostky
  const mixed = multiTermSide([xt(2), ct(3), xt(1)]);
  assert.equal(needsCombine(mixed), true);
  assert.equal(parseSide(formatExpr(mixed)).constantText, '3 + x');

  // Po sečtení je text zase čitelný a váha se kreslí normálně.
  const combined = combineSide(mixed);
  assert.equal(needsCombine(combined), false);
  assert.deepEqual(parseSide(formatExpr(combined)), {
    xTerm: { count: 3, label: '3x' },
    constantText: '3',
    negative: false,
  });
});

/* --- Zápis, který je rovnou výsledek -------------------------------------- */

test('UCV-MISSION-003: hotový výsledek místo rovnice se odmítne bez chyby do statistik', () => {
  // Zadání 'Myslím si číslo. Když k němu přičtu b, dostanu c.' - hráč napíše
  // rovnou 'x = c - b'. Parser to matematicky uzná, ale krokovou relaci by
  // uzavřelo jedině vynásobení jedničkou a každý rozumný pokus by se počítal
  // jako chyba strategie.
  const exercise = wordProblemOfForm('thinkPlus', 2);
  const answer = exercise.equation.right.c.n - exercise.equation.left.c.n;

  const session = createStepSession(exercise);
  const solved = parseEquation([T.x, T.eq, T.num(answer)], exercise.equation);
  assert.equal(solved.status, 'match', 'matematicky je to pravda - parser ji uzná');

  const recorded = session.recordEquationResult(solved);
  assert.equal(recorded.advanced, false, 'do krokové fáze nepouštíme');
  assert.match(recorded.note, /výsledek/);
  assert.doesNotMatch(recorded.note, /\d/, 'hláška neprozradí ani číslo, ani rovnici');
  assert.equal(session.phase, 'writeEquation', 'hráč zůstává u psaní rovnice');
  assert.deepEqual(session.getOutcome(), { solved: false, mistakes: 0, errors: {} });

  // Totéž obráceně (18 = x) i se špatným číslem - jinak by hláška prozradila,
  // jestli hráč výsledek uhodl.
  const swapped = session.recordEquationResult(
    parseEquation([T.num(answer), T.eq, T.x], exercise.equation)
  );
  assert.equal(swapped.advanced, false);
  const wrongNumber = session.recordEquationResult(
    parseEquation([T.x, T.eq, T.num(answer + 1)], exercise.equation)
  );
  assert.equal(wrongNumber.advanced, false);
  assert.equal(wrongNumber.note, swapped.note, 'stejná hláška, ať hráč uhodl nebo ne');
  assert.deepEqual(session.getOutcome().errors, {}, 'přeskočený krok není chyba equationSetup');

  // Správně sestavená rovnice pořád projde.
  const proper = parseEquation(
    [T.x, T.op('+'), T.num(exercise.equation.left.c.n), T.eq, T.num(exercise.equation.right.c.n)],
    exercise.equation
  );
  assert.equal(session.recordEquationResult(proper).advanced, true);
  assert.ok(session.equationSession);
});

test('UCV-MISSION-003: nesečtený zápis výsledku (x = 25 - 7) je pořád platná cesta', () => {
  // Tady hráč krok nepřeskočil: nesečtená pravá strana se sčítá operací
  // combine, kterou si musí zvolit sám (DEC-010).
  const exercise = wordProblemOfForm('thinkPlus', 2);
  const b = exercise.equation.left.c.n;
  const c = exercise.equation.right.c.n;

  const session = createStepSession(exercise);
  const result = parseEquation([T.x, T.eq, T.num(c), T.op('-'), T.num(b)], exercise.equation);
  assert.equal(result.status, 'match');
  assert.equal(session.recordEquationResult(result).advanced, true);

  const inner = session.equationSession;
  assert.equal(inner.equationText, `x = ${c} - ${b}`);
  assert.deepEqual(inner.combinableSides, ['right']);
  inner.submitOperation({ kind: 'combine', side: 'right' });
  assert.equal(inner.submitValue({ kind: 'int', value: c - b }).status, 'solved');
  assert.equal(session.isDone, true);
});
