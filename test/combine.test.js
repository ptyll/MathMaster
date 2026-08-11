import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  expr,
  multiTermSide,
  needsCombine,
  combineSide,
  formatTerms,
} from '../js/content/solver.js';
import {
  OPERATION_KINDS,
  applyOperation,
  checkStep,
  progressScore,
  isSolved,
  describeOperation,
} from '../js/content/stepCheck.js';
import { createStepSession } from '../js/engine/stepSession.js';
import { parseEquation, equationsMatch } from '../js/content/equationParse.js';
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

/* --- UCN-STEP-003: operace 'sečíst stejné členy' --- */

test('UCN-STEP-003-T1: combine sečte stranu s více x-členy nebo konstantami', () => {
  // 2x + 3 + x = 15
  const start = { left: multiTermSide([xt(2), ct(3), xt(1)]), right: expr(0, 1, 15, 1) };

  // invariant: x a c nesou součet členů už před sečtením (validační reference)
  assert.deepEqual(start.left.x, { n: 3, d: 1 });
  assert.deepEqual(start.left.c, { n: 3, d: 1 });
  assert.equal(needsCombine(start.left), true);
  assert.equal(needsCombine(start.right), false);

  const applied = applyOperation(start, { kind: 'combine', side: 'left' });
  assert.equal(applied.status, 'ok');
  assert.deepEqual(applied.slots, ['left.x'], 'konstanta je sama - dopočítává se jen koeficient');

  // strana se dvěma konstantami: dopočítává se naopak jen jejich součet
  const consts = { left: multiTermSide([xt(1), ct(3), ct(5)]), right: expr(0, 1, 15, 1) };
  const appliedC = applyOperation(consts, { kind: 'combine', side: 'left' });
  assert.equal(appliedC.status, 'ok');
  assert.deepEqual(appliedC.slots, ['left.c']);
  assert.deepEqual(appliedC.next.left.c, { n: 8, d: 1 });

  // po sečtení standardní tvar ax + b bez seznamu členů
  assert.deepEqual(applied.next.left, combineSide(start.left));
  assert.equal(applied.next.left.terms, undefined);
  assert.deepEqual(applied.next.left.x, { n: 3, d: 1 });
  assert.deepEqual(applied.next.left.c, { n: 3, d: 1 });
  assert.deepEqual(applied.next.right, start.right, 'druhá strana se nemění');

  // krok je přijat a skóre klesne - sečtení je opravdová práce, ne formalita
  assert.equal(checkStep(start, applied.next).status, 'ok');
  assert.ok(progressScore(applied.next) < progressScore(start));

  assert.equal(describeOperation({ kind: 'combine', side: 'left' }), 'Sečti stejné členy na levé straně');
  assert.equal(describeOperation({ kind: 'combine', side: 'right' }), 'Sečti stejné členy na pravé straně');
  assert.ok(OPERATION_KINDS.includes('combine'));
});

test('UCN-STEP-003-T2: dopočet se zlomky projde celou relací (x − x/2 − x/4 = 1/4 x)', () => {
  const s = createStepSession({
    equation: { left: multiTermSide([xt(1), xt(-1, 2), xt(-1, 4)]), right: expr(0, 1, 15, 1) },
  });
  assert.deepEqual(s.combinableSides, ['left']);

  const res = s.submitOperation({ kind: 'combine', side: 'left' });
  assert.equal(res.needsValues, true);
  assert.equal(s.question.prompt, 'Kolik x zůstane na levé straně?');
  assert.equal(s.pendingOperationText, 'Sečti stejné členy na levé straně');

  // špatné znaménko = chyba 'sign', špatný součet = chyba 'arithmetic'
  assert.equal(s.submitValue({ kind: 'fraction', n: -1, d: 4 }).status, 'wrong');
  assert.equal(s.submitValue({ kind: 'fraction', n: 3, d: 4 }).status, 'wrong');

  assert.equal(s.submitValue({ kind: 'fraction', n: 1, d: 4 }).status, 'committed');
  assert.equal(s.equationText, 'x/4 = 15');
  assert.match(s.history[0].operationText, /Sečti stejné členy/);
  assert.deepEqual(s.combinableSides, [], 'po sečtení už není co nabízet');

  const outcome = s.getOutcome();
  assert.equal(outcome.errors.sign, 1);
  assert.equal(outcome.errors.arithmetic, 1);

  // a dál standardní kroky: vynásob čtyřmi
  s.submitOperation({ kind: 'mul', operand: f(4) });
  s.submitValue({ kind: 'int', value: 60 });
  assert.equal(s.isDone, true);
  assert.equal(s.getOutcome().mistakes, 2, 'jen dvě chyby z dopočtu, kroky samotné čisté');
});

test('UCN-STEP-003-T3: sečtení vyrušujících x je platné a strana pokračuje bez x-členu', () => {
  // x − x + 5 = x  ->  5 = x
  const start = { left: multiTermSide([xt(1), xt(-1), ct(5)]), right: expr(1, 1, 0, 1) };
  const applied = applyOperation(start, { kind: 'combine', side: 'left' });
  assert.equal(applied.status, 'ok');
  assert.deepEqual(applied.slots, ['left.x'], 'dopočítává se jen koeficient, konstanta je sama');
  assert.deepEqual(applied.next.left.x, { n: 0, d: 1 }, 'x-člen zmizel');
  assert.deepEqual(applied.next.left.c, { n: 5, d: 1 });
  assert.equal(checkStep(start, applied.next).status, 'ok');
});

test('UCN-STEP-003-T4: operace se nenabízí, když nemá co sčítat', () => {
  // běžná strana vůbec nemá seznam členů
  const plain = { left: expr(3, 1, 4, 1), right: expr(0, 1, 19, 1) };
  const res = applyOperation(plain, { kind: 'combine', side: 'left' });
  assert.equal(res.status, 'invalid');
  assert.match(res.note, /není co sčítat/);

  // strana s členy, ale každý druh jen jednou (x + 5) - prázdná volba
  const single = { left: multiTermSide([xt(1), ct(5)]), right: expr(0, 1, 15, 1) };
  assert.equal(needsCombine(single.left), false);
  assert.equal(applyOperation(single, { kind: 'combine', side: 'left' }).status, 'invalid');

  // relace nad obyčejnou rovnicí combine vůbec nenabízí
  const s = createStepSession({ equation: plain });
  assert.deepEqual(s.combinableSides, []);

  // neznámá strana je programátorská chyba
  assert.throws(() => applyOperation(plain, { kind: 'combine', side: 'middle' }));
});

test('UCN-STEP-003-T5: combine, po kterém by x zmizelo z obou stran, je zablokované', () => {
  const start = { left: multiTermSide([xt(1), xt(-1)]), right: expr(0, 1, 5, 1) };
  const applied = applyOperation(start, { kind: 'combine', side: 'left' });
  assert.equal(applied.status, 'invalid');
  assert.match(applied.note, /zmizelo/);
});

test('UCN-STEP-003-T6: záporný koeficient se dopočítává včetně znaménka', () => {
  // -x − 2x = -15  ->  -3x = -15  ->  x = 5
  const s = createStepSession({
    equation: { left: multiTermSide([xt(-1), xt(-2)]), right: expr(0, 1, -15, 1) },
  });
  s.submitOperation({ kind: 'combine', side: 'left' });
  assert.equal(s.submitValue({ kind: 'int', value: 3 }).status, 'wrong', 'opačné znaménko');
  assert.equal(s.getOutcome().errors.sign, 1);
  s.submitValue({ kind: 'int', value: -3 });
  assert.equal(s.equationText, '-3x = -15');

  s.submitOperation({ kind: 'div', operand: f(-3) });
  s.submitValue({ kind: 'int', value: 5 });
  assert.equal(s.isDone, true);
});

test('UCN-STEP-003-T7: pořadí kroků se nevynucuje - hráč může nejdřív jinou operací', () => {
  // 2x + 3 + x = 15; hráč nejdřív odečte 3, teprve pak sčítá
  const s = createStepSession({
    equation: { left: multiTermSide([xt(2), ct(3), xt(1)]), right: expr(0, 1, 15, 1) },
  });

  const res = s.submitOperation({ kind: 'sub', operand: f(3) });
  assert.notEqual(res.status, 'invalid');
  assert.notEqual(res.status, 'noProgress', 'odečtení konstanty před sečtením je korektní cesta');
  s.submitValue({ kind: 'int', value: 12 });
  // DEC-013: didaktická plocha vykresluje nesčtené členy, ne jejich součet -
  // odečtená 3 se připsala jako další člen a hráč vidí přesně svůj zápis.
  assert.equal(s.equationText, '2x + 3 + x - 3 = 12');
  assert.deepEqual(s.combinableSides, ['left'], 'členy zůstávají nesčtené, dokud si hráč nezvolí combine');

  // odečtená konstanta se připsala jako další člen - combine sečte vše najednou
  assert.equal(s.equationState.left.terms.length, 4);
  const combine = s.submitOperation({ kind: 'combine', side: 'left' });
  assert.equal(combine.needsValues, true);
  s.submitValue({ kind: 'int', value: 3 });  // 2x + x
  s.submitValue({ kind: 'int', value: 0 });  // 3 − 3
  assert.equal(s.equationText, '3x = 12');

  s.submitOperation({ kind: 'div', operand: f(3) });
  s.submitValue({ kind: 'int', value: 4 });
  assert.equal(s.isDone, true);
  assert.equal(s.getOutcome().mistakes, 0, 'žádný z kroků není chyba');
});

test('UCN-STEP-003-T8: násobení před sečtením škáluje členy, nekanonizuje je', () => {
  // x − x/2 − x/4 = 15; hráč nejdřív vynásobí čtyřmi -> 4x − 2x − x = 60
  const start = { left: multiTermSide([xt(1), xt(-1, 2), xt(-1, 4)]), right: expr(0, 1, 15, 1) };
  const applied = applyOperation(start, { kind: 'mul', operand: f(4) });
  assert.equal(applied.status, 'ok');
  assert.equal(checkStep(start, applied.next).status, 'ok');

  assert.deepEqual(applied.next.left.x, { n: 1, d: 1 }, 'součet drží invariant');
  assert.ok(Array.isArray(applied.next.left.terms), 'členy zůstaly nesčtené');
  assert.deepEqual(applied.next.left.terms, [xt(4), xt(-2), xt(-1)]);
  assert.equal(needsCombine(applied.next.left), true);
  assert.equal(formatTerms(applied.next.left.terms), '4x - 2x - x');
});

test('UCN-STEP-003-T9: isSolved čeká na dobrovolné sečtení členů', () => {
  // x + x/2 − x/2 = 5: součet už je x, ale sečíst musí hráč sám (DEC-010)
  const start = { left: multiTermSide([xt(1), xt(1, 2), xt(-1, 2)]), right: expr(0, 1, 5, 1) };
  assert.deepEqual(start.left.x, { n: 1, d: 1 });
  assert.equal(isSolved(start), false, 'bez sečtení není hotovo, i když součet sedí');

  const s = createStepSession({ equation: start });
  s.submitOperation({ kind: 'combine', side: 'left' });
  const res = s.submitValue({ kind: 'int', value: 1 });
  assert.equal(res.status, 'solved');
  assert.equal(s.isDone, true);
});

test('nesčtená strana se formátuje člen po členu', () => {
  assert.equal(formatTerms([xt(1), xt(-1, 2), xt(-1, 4)]), 'x - x/2 - x/4');
  assert.equal(formatTerms([xt(2), ct(3), xt(1)]), '2x + 3 + x');
  assert.equal(formatTerms([xt(-1, 2), xt(1, 4)]), '-x/2 + x/4');
  assert.equal(formatTerms([ct(-5), xt(2)]), '-5 + 2x');
});

/* --- DEC-012: parser vystaví multi-term reprezentaci --- */

test('DEC-012: parseEquation vystaví multi-term strany, canonical zůstává validační referencí', () => {
  // x − x/2 − x/4 = 15
  const tokens = [
    T.x, T.op('-'), T.x, T.op('/'), T.num(2), T.op('-'), T.x, T.op('/'), T.num(4),
    T.eq, T.num(15),
  ];
  const res = parseEquation(tokens);
  assert.equal(res.status, 'ok');

  // canonical = sečtený tvar bez seznamu členů
  assert.deepEqual(res.canonical.left.x, { n: 1, d: 4 });
  assert.deepEqual(res.canonical.left.c, { n: 0, d: 1 });
  assert.equal(res.canonical.left.terms, undefined);

  // multiTerm = nesčtená podoba pro start krokového režimu
  assert.ok(res.multiTerm, 'strana s 2+ x-členy se vystaví nesčtená');
  assert.equal(res.multiTerm.left.terms.length, 3);
  assert.deepEqual(res.multiTerm.left.terms[0], xt(1));
  assert.deepEqual(res.multiTerm.left.terms[1], xt(-1, 2));
  assert.deepEqual(res.multiTerm.left.terms[2], xt(-1, 4));
  assert.deepEqual(res.multiTerm.left.x, res.canonical.left.x, 'x/c = součet členů = stav po combine');
  assert.equal(res.multiTerm.right.terms, undefined, 'pravá strana nemá co sčítat');
  assert.equal(formatTerms(res.multiTerm.left.terms), 'x - x/2 - x/4');
});

test('DEC-012: multi-term výstup se drží i u validace proti očekávané rovnici', () => {
  const tokens = [
    T.x, T.op('-'), T.x, T.op('/'), T.num(2), T.op('-'), T.x, T.op('/'), T.num(4),
    T.eq, T.num(15),
  ];
  // x − x/2 − x/4 = 15 je ekvivalent x = 60
  const expected = { left: expr(1, 1, 0, 1), right: expr(0, 1, 60, 1) };
  const res = parseEquation(tokens, expected);
  assert.equal(res.status, 'match');
  assert.equal(res.note, null, 'jednodušší tvar, ne je reference - žádná poznámka');
  assert.ok(res.multiTerm, 'krokový režim startuje z hráčovy nesčtené rovnice');
  assert.equal(equationsMatch(res.canonical, expected).status, 'match', 'canonical dál slouží validaci');
});

test('DEC-012: více x-členů i s konstantou a implicitním násobením', () => {
  // 2x + 3 + x = 15
  const tokens = [T.num(2), T.x, T.op('+'), T.num(3), T.op('+'), T.x, T.eq, T.num(15)];
  const res = parseEquation(tokens);
  assert.equal(res.status, 'ok');
  assert.deepEqual(res.canonical.left.x, { n: 3, d: 1 });
  assert.deepEqual(res.canonical.left.c, { n: 3, d: 1 });
  assert.equal(res.multiTerm.left.terms.length, 3);
  assert.equal(formatTerms(res.multiTerm.left.terms), '2x + 3 + x');
});

test('DEC-012: strana bez čeho sčítat nedostane multi-term', () => {
  // x + 3 = 15 - standardní tvar, combine by byl prázdná volba
  const tokens = [T.x, T.op('+'), T.num(3), T.eq, T.num(15)];
  const res = parseEquation(tokens);
  assert.equal(res.status, 'ok');
  assert.equal(res.multiTerm, null, 'krokový režim startuje rovnou z canonical');

  // dvě konstanty na straně se sčítat smí: 3 + 5 + x = 15
  const consts = [T.num(3), T.op('+'), T.num(5), T.op('+'), T.x, T.eq, T.num(15)];
  const res2 = parseEquation(consts);
  assert.equal(res2.multiTerm.left.terms.length, 3);
  assert.equal(needsCombine(res2.multiTerm.left), true);
});

test('DEC-012: relace umí startovat přímo z multiTerm výstupu parseru', () => {
  const tokens = [
    T.x, T.op('-'), T.x, T.op('/'), T.num(2), T.op('-'), T.x, T.op('/'), T.num(4),
    T.eq, T.num(15),
  ];
  const res = parseEquation(tokens);
  const s = createStepSession({ equation: res.multiTerm });
  assert.deepEqual(s.combinableSides, ['left']);

  s.submitOperation({ kind: 'combine', side: 'left' });
  s.submitValue({ kind: 'fraction', n: 1, d: 4 });
  assert.equal(s.equationText, 'x/4 = 15');

  s.submitOperation({ kind: 'mul', operand: f(4) });
  s.submitValue({ kind: 'int', value: 60 });
  assert.equal(s.isDone, true);
  assert.equal(s.getOutcome().mistakes, 0);
});
