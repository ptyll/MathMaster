import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseCss, resolveValue } from './cssCascade.js';
import {
  expr,
  factoredExpr,
  multiTermSide,
  needsCombine,
  solveLinearSteps,
  isFactored,
  factorOf,
  formatExpr as formatExprRef,
} from '../js/content/solver.js';
import {
  applyOperation,
  checkStep,
  progressScore,
  isSolved,
  askedParts,
  partValue,
  partQuestion,
  describeOperation,
} from '../js/content/stepCheck.js';
import { createStepSession } from '../js/engine/stepSession.js';
import { parseSide } from '../js/ui/visualParse.js';
import { generateSimpleEquation, generateLinearEquation } from '../js/content/equations.js';
import { generateFractionExercise } from '../js/content/fractionExercises.js';
import { generateFractionEquation } from '../js/content/fractionEquations.js';
import { makeFraction } from '../js/content/fractions.js';

const f = (n, d = 1) => makeFraction(n, d);
const state = (lx, lc, rx, rc) => ({ left: expr(lx, 1, lc, 1), right: expr(rx, 1, rc, 1) });

/* --- solver: strukturovaný stav kroku (UCN-MATH-005) --- */

test('kroky solveru nesou strojově čitelný stav rovnice', () => {
  const steps = solveLinearSteps(expr(3, 1, 4, 1), expr(0, 1, 19, 1));
  for (const step of steps) {
    assert.ok(step.leftExpr && step.rightExpr, 'každý krok má leftExpr i rightExpr');
  }
  const last = steps[steps.length - 1];
  assert.deepEqual(last.leftExpr, { f: { n: 1, d: 1 }, x: { n: 1, d: 1 }, c: { n: 0, d: 1 } });
  assert.deepEqual(last.rightExpr, { f: { n: 1, d: 1 }, x: { n: 0, d: 1 }, c: { n: 5, d: 1 } });
});

test('strukturovaný stav je snímek, ne živý odkaz na průběžné l a r', () => {
  const steps = solveLinearSteps(expr(3, 1, 4, 1), expr(0, 1, 19, 1));
  // Po prvním kroku je vlevo 3x; kdyby šlo o odkaz, přepsal by se na x.
  assert.deepEqual(steps[0].leftExpr.x, { n: 3, d: 1 });
});

test('generátory dodávají výchozí stav rovnice pro krokové řešení', () => {
  for (const ex of [
    generateSimpleEquation(11, 1),
    generateLinearEquation(12, 2),
    generateFractionEquation(13, 1),
  ]) {
    assert.ok(ex.equation, `${ex.form} má equation`);
    assert.ok(ex.equation.left && ex.equation.right);
  }
});

/* --- UCN-STEP-001: validace kroku --- */

test('UCN-STEP-001-T1: korektní krok mimo pořadí solveru je přijat', () => {
  // 3x + 4 = 19; solver by nejdřív odečítal 4, hráč dělí třemi
  const start = state(3, 4, 0, 19);
  const applied = applyOperation(start, { kind: 'div', operand: f(3) });
  assert.equal(applied.status, 'ok');
  assert.deepEqual(applied.next.left.x, { n: 1, d: 1 });
  assert.deepEqual(applied.next.left.c, { n: 4, d: 3 });
  assert.deepEqual(applied.next.right.c, { n: 19, d: 3 });
  assert.equal(checkStep(start, applied.next).status, 'ok');
});

test('UCN-STEP-001-T2: neekvivalentní úprava je odmítnuta', () => {
  // Ručně sestavený vadný krok - obranná pojistka proti chybě v aplikaci operace
  const prev = state(3, 4, 0, 19);
  const broken = state(3, 0, 0, 19); // odečtena 4 jen vlevo
  const verdict = checkStep(prev, broken);
  assert.equal(verdict.status, 'notEquivalent');
  assert.equal(verdict.solved, false);
});

test('UCN-STEP-001-T3: dělení nulou je neplatná operace', () => {
  const applied = applyOperation(state(3, 4, 0, 19), { kind: 'div', operand: f(0) });
  assert.equal(applied.status, 'invalid');
  assert.equal(applied.next, null);
  assert.match(applied.note, /Nulou se nedělí/);
});

test('UCN-STEP-001-T4: krok bez pokroku je rozpoznán', () => {
  const start = state(3, 0, 0, 15);
  const applied = applyOperation(start, { kind: 'add', operand: f(5) });
  assert.equal(applied.status, 'ok');
  const verdict = checkStep(start, applied.next);
  assert.equal(verdict.status, 'noProgress');
});

test('násobení nulou je zablokované', () => {
  assert.equal(applyOperation(state(3, 4, 0, 19), { kind: 'mul', operand: f(0) }).status, 'invalid');
  assert.equal(applyOperation(state(3, 4, 0, 19), { kind: 'add', operand: f(0) }).status, 'invalid');
});

test('operace, po které by x zmizelo z obou stran, je zablokovaná', () => {
  // 3x + 4 = 3x + 9 je sporná rovnice; odečtení 3x by nechalo 4 = 9 bez x
  const applied = applyOperation(state(3, 4, 3, 9), { kind: 'sub', operand: f(3), term: 'x' });
  assert.equal(applied.status, 'invalid');
  assert.match(applied.note, /zmizelo/);
});

test('odečtení x-členu ze strany, kde x není, je platné, ale bez pokroku', () => {
  // 3x = 15 minus 3x dá 0 = -3x + 15: pravda, ale od výsledku to vzdaluje
  const start = state(3, 0, 0, 15);
  const applied = applyOperation(start, { kind: 'sub', operand: f(3), term: 'x' });
  assert.equal(applied.status, 'ok');
  assert.equal(checkStep(start, applied.next).status, 'noProgress');
});

test('přesun x na jednu stranu je pokrok i za cenu nové konstanty', () => {
  // 5x + 10 = 6x -> -x + 10 = 0: skóre musí klesnout, jinak hru zablokujeme
  const start = state(5, 10, 6, 0);
  const applied = applyOperation(start, { kind: 'sub', operand: f(6), term: 'x' });
  assert.equal(applied.status, 'ok');
  assert.equal(checkStep(start, applied.next).status, 'ok');
  assert.ok(progressScore(applied.next) < progressScore(start));
});

test('násobit a dělit x-členem nejde', () => {
  assert.throws(() => applyOperation(state(3, 0, 0, 15), { kind: 'mul', operand: f(2), term: 'x' }));
});

test('progressScore klesá k nule a isSolved pozná hotový tvar', () => {
  const start = state(3, 4, 0, 19);
  assert.ok(progressScore(start) > 0);
  assert.equal(isSolved(start), false);

  const afterSub = applyOperation(start, { kind: 'sub', operand: f(4) }).next;
  assert.ok(progressScore(afterSub) < progressScore(start));

  const afterDiv = applyOperation(afterSub, { kind: 'div', operand: f(3) }).next;
  assert.equal(progressScore(afterDiv), 0);
  assert.equal(isSolved(afterDiv), true);
});

test('isSolved platí i pro obrácenou orientaci (číslo = x)', () => {
  assert.equal(isSolved({ left: expr(0, 1, 5, 1), right: expr(1, 1, 0, 1) }), true);
});

test('x na obou stranách: odečtení x-členu je pokrok', () => {
  const start = state(5, 2, 3, 8); // 5x + 2 = 3x + 8
  const applied = applyOperation(start, { kind: 'sub', operand: f(3), term: 'x' });
  assert.equal(applied.status, 'ok');
  assert.equal(checkStep(start, applied.next).status, 'ok');
  assert.deepEqual(applied.next.left.x, { n: 2, d: 1 });
  assert.deepEqual(applied.next.right.x, { n: 0, d: 1 });
});

test('askedParts vynechá hodnoty, které hráč zvolením operace zná předem', () => {
  const start = state(3, 4, 0, 19);
  const next = applyOperation(start, { kind: 'sub', operand: f(4) }).next;
  // vlevo konstanta padne na 0 (to hráč ví), ptáme se jen na pravou stranu
  assert.deepEqual(askedParts(start, next), ['right.c']);

  const divStart = state(3, 0, 0, 15);
  const divNext = applyOperation(divStart, { kind: 'div', operand: f(3) }).next;
  // vlevo koeficient padne na 1 (to hráč ví), ptáme se jen na pravou stranu
  assert.deepEqual(askedParts(divStart, divNext), ['right.c']);
});

test('describeOperation mluví v metafoře váhy', () => {
  assert.equal(describeOperation({ kind: 'sub', operand: f(4) }), 'Odečti 4 z obou stran');
  assert.equal(describeOperation({ kind: 'add', operand: f(3), term: 'x' }), 'Přičti 3x k oběma stranám');
  assert.equal(describeOperation({ kind: 'mul', operand: f(2) }), 'Vynásob obě strany 2');
  assert.equal(describeOperation({ kind: 'div', operand: f(3) }), 'Vyděl obě strany 3');
});

/* --- UCN-STEP-002: relace --- */

test('UCN-STEP-002-T1: chyby v krocích se agregují do jednoho výsledku', () => {
  const ex = { equation: { left: expr(3, 1, 4, 1), right: expr(0, 1, 19, 1) } };
  const s = createStepSession(ex);
  assert.equal(s.kind, 'equation');

  s.submitOperation({ kind: 'add', operand: f(5) });   // bez pokroku = chyba
  s.submitOperation({ kind: 'add', operand: f(2) });   // bez pokroku = chyba
  assert.equal(s.mistakes, 2);

  s.submitOperation({ kind: 'sub', operand: f(4) });
  s.submitValue({ kind: 'int', value: 15 });
  s.submitOperation({ kind: 'div', operand: f(3) });
  s.submitValue({ kind: 'int', value: 5 });

  assert.equal(s.isDone, true);
  const outcome = s.getOutcome();
  assert.equal(outcome.solved, true);
  assert.equal(outcome.mistakes, 2, 'mise dostane jeden agregovaný výsledek');
});

test('UCN-STEP-002-T2: undo vrátí stav bez postihu', () => {
  const ex = { equation: { left: expr(3, 1, 4, 1), right: expr(0, 1, 19, 1) } };
  const s = createStepSession(ex);

  s.submitOperation({ kind: 'sub', operand: f(4) });
  s.submitValue({ kind: 'int', value: 15 });
  assert.equal(s.equationText, '3x = 15');
  assert.equal(s.history.length, 1);

  s.undo();
  assert.equal(s.equationText, '3x + 4 = 19');
  assert.equal(s.history.length, 0);
  assert.equal(s.mistakes, 0, 'undo se netrestá');
  assert.equal(s.canUndo, false);
});

test('UCN-STEP-002-T3: jednokrokové úlohy krokový režim přeskočí', () => {
  for (const kind of ['simplify', 'expand', 'equivalent', 'compare']) {
    const ex = generateFractionExercise(42, kind, 2);
    const s = createStepSession(ex);
    assert.equal(s.isActive, false, `${kind} nemá krokový režim`);
    assert.equal(s.kind, 'none');
  }
});

test('UCN-STEP-002-T4: předčasné dosažení tvaru x = číslo ukončí příklad', () => {
  // x/3 = 5 vyřeší jediné vynásobení třemi
  const ex = generateFractionEquation(21, 1);
  const s = createStepSession(ex);
  const denominator = ex.equation.left.x.d;
  const res = s.submitOperation({ kind: 'mul', operand: f(denominator) });
  if (res.needsValues) {
    const expected = ex.answer.kind === 'int'
      ? { kind: 'int', value: ex.answer.value }
      : { kind: 'fraction', n: ex.answer.n, d: ex.answer.d };
    s.submitValue(expected);
  }
  assert.equal(s.isDone, true);
});

test('rozpracovanou operaci lze zrušit bez postihu', () => {
  const ex = { equation: { left: expr(3, 1, 4, 1), right: expr(0, 1, 19, 1) } };
  const s = createStepSession(ex);
  s.submitOperation({ kind: 'sub', operand: f(4) });
  assert.equal(s.phase, 'values');
  s.cancelOperation();
  assert.equal(s.phase, 'operation');
  assert.equal(s.mistakes, 0);
  assert.equal(s.equationText, '3x + 4 = 19');
});

test('špatně dopočítaná hodnota je chyba, rovnice se neposune', () => {
  const ex = { equation: { left: expr(3, 1, 4, 1), right: expr(0, 1, 19, 1) } };
  const s = createStepSession(ex);
  s.submitOperation({ kind: 'sub', operand: f(4) });
  const res = s.submitValue({ kind: 'int', value: 14 });
  assert.equal(res.status, 'wrong');
  assert.equal(s.mistakes, 1);
  assert.equal(s.equationText, '3x + 4 = 19');
  // správná hodnota krok dokončí
  s.submitValue({ kind: 'int', value: 15 });
  assert.equal(s.equationText, '3x = 15');
});

test('náhled rozpracovaného kroku maskuje jen dosud nedoplněné hodnoty', () => {
  const ex = { equation: { left: expr(3, 1, 4, 1), right: expr(0, 1, 19, 1) } };
  const s = createStepSession(ex);
  s.submitOperation({ kind: 'sub', operand: f(4) });
  const preview = s.pendingPreview;
  assert.equal(preview.left, '3x');
  assert.equal(preview.right, '?');
  assert.equal(s.pendingOperationText, 'Odečti 4 z obou stran');
});

test('nevykrácený zlomek se u mezikroku uznává', () => {
  // 3x + 4 = 19, dělíme 3 -> vpravo 19/3; hráč napíše 38/6
  const ex = { equation: { left: expr(3, 1, 4, 1), right: expr(0, 1, 19, 1) } };
  const s = createStepSession(ex);
  s.submitOperation({ kind: 'div', operand: f(3) });
  const slots = [];
  while (s.phase === 'values') {
    const before = s.question.prompt;
    slots.push(before);
    // levá konstanta 4/3 a pravá 19/3 - obě se ptají
    const res = before.includes('levé')
      ? s.submitValue({ kind: 'fraction', n: 8, d: 6 })
      : s.submitValue({ kind: 'fraction', n: 38, d: 6 });
    assert.notEqual(res.status, 'wrong', `${before} má uznat nevykrácený tvar`);
  }
  assert.equal(s.equationText, 'x + 4/3 = 19/3');
});

/* --- UCV-STEP-002: zlomkové relace --- */

test('zlomková relace vede od společného jmenovatele ke zkrácení', () => {
  const ex = generateFractionExercise(7, 'add', 3);
  const s = createStepSession(ex);
  assert.equal(s.kind, 'fraction');
  const [a, b] = ex.operands;

  if (a.d !== b.d) {
    assert.match(s.question.prompt, /společný jmenovatel/);
    const common = (a.d / gcdLocal(a.d, b.d)) * b.d;
    assert.equal(s.submitValue({ kind: 'int', value: common }).status, 'partial');
    assert.equal(s.submitValue({ kind: 'int', value: a.n * (common / a.d) }).status, 'partial');
    assert.equal(s.submitValue({ kind: 'int', value: b.n * (common / b.d) }).status, 'partial');
  }
  // combine
  assert.ok(s.question.prompt.includes('čitatel'));
  const common2 = a.d === b.d ? a.d : (a.d / gcdLocal(a.d, b.d)) * b.d;
  const sum = a.n * (common2 / a.d) + b.n * (common2 / b.d);
  const res = s.submitValue({ kind: 'int', value: sum });
  if (res.status === 'partial') {
    // ještě krácení
    assert.match(s.question.prompt, /Zkrať/);
    assert.equal(s.submitValue({ kind: 'fraction', n: ex.answer.n, d: ex.answer.d }).status, 'solved');
  }
  assert.equal(s.isDone, true);
  assert.equal(s.getOutcome().mistakes, 0);
});

test('zlomková relace uzná i větší společný jmenovatel než nejmenší', () => {
  const ex = generateFractionExercise(7, 'add', 3);
  const [a, b] = ex.operands;
  if (a.d === b.d) {
    return; // tenhle seed nemá co rozšiřovat
  }
  const s = createStepSession(ex);
  const bigger = a.d * b.d * 2;
  const res = s.submitValue({ kind: 'int', value: bigger });
  assert.equal(res.status, 'partial');
  assert.match(res.note, /Jde to i s menším/);
  assert.equal(s.getOutcome().mistakes, 0);
});

test('zlomková relace odmítne jmenovatele, který nejde vydělit', () => {
  const ex = generateFractionExercise(7, 'add', 3);
  const [a, b] = ex.operands;
  if (a.d === b.d) {
    return;
  }
  const s = createStepSession(ex);
  const res = s.submitValue({ kind: 'int', value: a.d * b.d + 1 });
  assert.equal(res.status, 'wrong');
  assert.equal(s.getOutcome().mistakes, 1);
});

function gcdLocal(a, b) {
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/* --- křížová kontrola proti generátorům --- */

test('každou vygenerovanou rovnici lze projít krokovou relací podle solveru', () => {
  const cases = [];
  for (let seed = 1; seed <= 40; seed++) {
    cases.push(generateSimpleEquation(seed * 13, (seed % 3) + 1));
    cases.push(generateLinearEquation(seed * 17, (seed % 4) + 1));
    cases.push(generateFractionEquation(seed * 19, (seed % 3) + 1));
  }
  for (const ex of cases) {
    const s = createStepSession(ex);
    assert.equal(s.isActive, true, `${ex.text} má mít krokový režim`);
    let guard = 0;
    while (!s.isDone && guard++ < 12) {
      const before = s.equationState;
      const op = suggestOperation(before);
      assert.ok(op, `${ex.text}: nenašel jsem další operaci ve stavu ${s.equationText}`);

      // Očekávané hodnoty si test dopočítá sám ze stejných čistých funkcí -
      // relace kvůli testům nevystavuje nic navíc.
      const next = applyOperation(before, op).next;
      assert.ok(next, `${ex.text}: operace měla projít`);
      const slots = askedParts(before, next);

      const res = s.submitOperation(op);
      assert.notEqual(res.status, 'invalid', `${ex.text}: ${res.note}`);
      assert.notEqual(res.status, 'noProgress', `${ex.text}: ${s.equationText} + ${JSON.stringify(op)}`);

      for (const slot of slots) {
        assert.equal(s.phase, 'values');
        s.submitValue(toInputValue(partValue(next, slot)));
      }
      assert.notEqual(s.phase, 'values', `${ex.text}: všechny sloty doplněny`);
    }
    assert.equal(s.isDone, true, `${ex.text} se má dořešit`);
    assert.equal(s.getOutcome().mistakes, 0, `${ex.text} bez chyb`);
  }
});

/**
 * Referenční strategie: zbav se závorky, přesuň x doleva, konstanty doprava,
 * nakonec vyděl koeficientem.
 */
function suggestOperation(st) {
  // Přes závorku nejde přičítat - nejdřív dělení činitelem.
  if (isFactored(st.left)) {
    return { kind: 'div', operand: factorOf(st.left) };
  }
  if (isFactored(st.right)) {
    return { kind: 'expand' };
  }
  if (st.right.x.n !== 0) {
    return st.right.x.n > 0
      ? { kind: 'sub', operand: st.right.x, term: 'x' }
      : { kind: 'add', operand: { n: -st.right.x.n, d: st.right.x.d }, term: 'x' };
  }
  if (st.left.c.n !== 0) {
    return st.left.c.n > 0
      ? { kind: 'sub', operand: st.left.c }
      : { kind: 'add', operand: { n: -st.left.c.n, d: st.left.c.d } };
  }
  if (!(st.left.x.n === 1 && st.left.x.d === 1)) {
    return { kind: 'div', operand: st.left.x };
  }
  return null;
}

/** Zlomek do tvaru, který vrací inputModel.getValue(). */
function toInputValue(fraction) {
  return fraction.d === 1
    ? { kind: 'int', value: fraction.n }
    : { kind: 'fraction', n: fraction.n, d: fraction.d };
}

/* --- hraniční případy z code review --- */

test('operand zadaný jako zlomek projde celou relací', () => {
  // (2/3)x = 4 -> vyděl obě strany 2/3 -> x = 6
  const ex = { equation: { left: expr(2, 3, 0, 1), right: expr(0, 1, 4, 1) } };
  const s = createStepSession(ex);
  const res = s.submitOperation({ kind: 'div', operand: makeFraction(2, 3) });
  assert.notEqual(res.status, 'invalid');
  while (s.phase === 'values') {
    s.submitValue({ kind: 'int', value: 6 });
  }
  assert.equal(s.isDone, true);
  assert.equal(s.getOutcome().mistakes, 0);
});

test('undo po dvou krocích vrací vždy o jeden zpět', () => {
  const ex = { equation: { left: expr(2, 1, 6, 1), right: expr(0, 1, 20, 1) } };
  const s = createStepSession(ex);
  s.submitOperation({ kind: 'sub', operand: f(6) });
  s.submitValue({ kind: 'int', value: 14 });
  s.submitOperation({ kind: 'div', operand: f(2) });
  s.submitValue({ kind: 'int', value: 7 });
  assert.equal(s.isDone, true);
  // po dořešení už undo nejde - příklad je uzavřený
  assert.equal(s.canUndo, false);

  const s2 = createStepSession(ex);
  s2.submitOperation({ kind: 'sub', operand: f(6) });
  s2.submitValue({ kind: 'int', value: 14 });
  assert.equal(s2.equationText, '2x = 14');
  s2.undo();
  assert.equal(s2.equationText, '2x + 6 = 20');
  assert.equal(s2.canUndo, false);
});

test('relace ignoruje vstup po dořešení', () => {
  const ex = { equation: { left: expr(3, 1, 0, 1), right: expr(0, 1, 12, 1) } };
  const s = createStepSession(ex);
  s.submitOperation({ kind: 'div', operand: f(3) });
  while (s.phase === 'values') {
    s.submitValue({ kind: 'int', value: 4 });
  }
  assert.equal(s.isDone, true);
  assert.equal(s.submitOperation({ kind: 'add', operand: f(1) }).status, 'ignored');
  assert.equal(s.submitValue({ kind: 'int', value: 1 }).status, 'ignored');
  assert.equal(s.getOutcome().mistakes, 0);
});

test('prázdná hodnota se počítá jako chyba, ne jako pád', () => {
  const ex = { equation: { left: expr(3, 1, 4, 1), right: expr(0, 1, 19, 1) } };
  const s = createStepSession(ex);
  s.submitOperation({ kind: 'sub', operand: f(4) });
  const res = s.submitValue(null);
  assert.equal(res.status, 'wrong');
  assert.equal(s.mistakes, 1);
});

test('agregace do mise: chyby v krocích jsou jedna chyba pro hvězdy', async () => {
  const { createMission } = await import('../js/engine/mission.js');
  const m = createMission({
    id: 'test', planetId: 'p', crystalColor: 'modrý', topic: 'equations',
    exerciseCount: 3, startDifficulty: 1, seed: 99, stepMode: true,
  });
  m.recordStepResult({ mistakes: 0 });
  m.recordStepResult({ mistakes: 5 });   // pět chyb v krocích = jedna chyba příkladu
  m.recordStepResult({ mistakes: 0 });
  const summary = m.getSummary();
  assert.equal(summary.mistakes, 1);
  assert.equal(summary.solved, 3);
  assert.equal(summary.stars, 2, 'jedna chyba nesmí srazit na jednu hvězdu');
});

test('agregace do mise: bezchybný krokový průchod dává tři hvězdy', async () => {
  const { createMission } = await import('../js/engine/mission.js');
  const m = createMission({
    id: 'test', planetId: 'p', crystalColor: 'modrý', topic: 'equations',
    exerciseCount: 3, startDifficulty: 1, seed: 99, stepMode: true,
  });
  for (let i = 0; i < 3; i++) {
    m.recordStepResult({ mistakes: 0 });
  }
  assert.equal(m.getSummary().stars, 3);
});

test('boss: chyby v krocích stojí nejvýš jeden štít za příklad', async () => {
  const { createBossMission } = await import('../js/engine/mission.js');
  const b = createBossMission({
    id: 'boss', planetId: 'p', crystalColor: 'modrý', topic: 'equations',
    startDifficulty: 1, seed: 7, stepMode: true,
  });
  const before = b.shields;
  b.recordStepResult({ mistakes: 4 });
  assert.equal(b.shields, before - 1, 'čtyři chyby v krocích = jeden štít');
  assert.equal(b.hp, b.maxHp - 1, 'vyřešený příklad ubere bossovi HP i po chybách');
});

test('mise umí vygenerovat všechny tvary rovnic včetně závorek a x na obou stranách', async () => {
  const { generateForTopic } = await import('../js/engine/mission.js');
  const { MAX_DIFFICULTY } = await import('../js/content/adaptive.js');

  const forms = new Set();
  for (let d = 1; d <= MAX_DIFFICULTY; d++) {
    for (let s = 1; s <= 200; s++) {
      forms.add(generateForTopic('equations', s * 13, d, 0).form);
    }
  }
  // Bez těchhle dvou se hráč nikdy nedostane k závorkám ani k přesouvání
  // x mezi stranami - a přepínač 'Pracuju s x' by neměl k čemu sloužit.
  assert.ok(forms.has('a(x+b)=c'), 'závorky musí jít vygenerovat');
  assert.ok(forms.has('ax+b=cx+d'), 'x na obou stranách musí jít vygenerovat');
});

test('generátor drží závorku v součinovém tvaru, ne roznásobenou', () => {
  const ex = generateLinearEquation(1234, 3);
  assert.equal(ex.form, 'a(x+b)=c');
  assert.equal(isFactored(ex.equation.left), true, 'krokový režim musí závorku zobrazit');
  assert.match(ex.text, /^\d+\(x \+ \d+\) = \d+$/);
});

test('závorku lze vyřešit dělením činitelem', () => {
  // 2(x + 10) = 36  ->  x + 10 = 18  ->  x = 8
  const st = { left: factoredExpr(2, 1, 1, 1, 10, 1), right: expr(0, 1, 36, 1) };
  const s = createStepSession({ equation: st });
  assert.equal(s.hasBracket, true);

  s.submitOperation({ kind: 'div', operand: f(2) });
  s.submitValue({ kind: 'int', value: 18 });
  assert.equal(s.equationText, 'x + 10 = 18');
  assert.equal(s.hasBracket, false);

  s.submitOperation({ kind: 'sub', operand: f(10) });
  s.submitValue({ kind: 'int', value: 8 });
  assert.equal(s.isDone, true);
  assert.equal(s.getOutcome().mistakes, 0);
});

test('závorku lze vyřešit i roznásobením', () => {
  const st = { left: factoredExpr(2, 1, 1, 1, 10, 1), right: expr(0, 1, 36, 1) };
  const s = createStepSession({ equation: st });

  const res = s.submitOperation({ kind: 'expand' });
  assert.notEqual(res.status, 'invalid');
  s.submitValue({ kind: 'int', value: 2 });   // 2 * x
  s.submitValue({ kind: 'int', value: 20 });  // 2 * 10
  assert.equal(s.equationText, '2x + 20 = 36');

  s.submitOperation({ kind: 'sub', operand: f(20) });
  s.submitValue({ kind: 'int', value: 16 });
  s.submitOperation({ kind: 'div', operand: f(2) });
  s.submitValue({ kind: 'int', value: 8 });
  assert.equal(s.isDone, true);
  assert.equal(s.getOutcome().mistakes, 0);
});

test('přes závorku nejde přičítat a hra to vysvětlí', () => {
  const st = { left: factoredExpr(2, 1, 1, 1, 10, 1), right: expr(0, 1, 36, 1) };
  const s = createStepSession({ equation: st });
  const res = s.submitOperation({ kind: 'sub', operand: f(10) });
  assert.equal(res.status, 'invalid');
  assert.match(res.note, /roznásob|vyděl/i);
  assert.equal(s.getOutcome().mistakes, 0, 'neproveditelná operace není chyba v počítání');
});

test('roznásobení mimo závorku hra odmítne', () => {
  const s = createStepSession({ equation: { left: expr(3, 1, 4, 1), right: expr(0, 1, 19, 1) } });
  assert.equal(s.hasBracket, false);
  const res = s.submitOperation({ kind: 'expand' });
  assert.equal(res.status, 'invalid');
});

test('mise Zamrzlé závorky skutečně zadává závorky', async () => {
  const { PLANETS } = await import('../js/content/planets.js');
  const { generateForTopic } = await import('../js/engine/mission.js');
  const mission = PLANETS.find((p) => p.id === 'hoth').missions.find((m) => m.id === 'hoth-2');
  let h = 1000;
  for (const ch of mission.id) {
    h = (h * 31 + ch.codePointAt(0)) % 1000000;
  }
  const ex = generateForTopic('equations', h + 7919, mission.startDifficulty, 0);
  assert.equal(ex.form, 'a(x+b)=c', 'mise o závorkách musí zadat závorku');
  assert.equal(isFactored(ex.equation.left), true);
});

test('rovnice s x na obou stranách se dá vyřešit odečtením x-členu', () => {
  const ex = generateLinearEquation(4242, 4);
  assert.equal(ex.form, 'ax+b=cx+d');
  const s = createStepSession(ex);
  const before = s.equationState;
  const operation = { kind: 'sub', operand: before.right.x, term: 'x' };

  // Krok se potvrdí až doplněním hodnot - equationState do té doby drží
  // poslední potvrzený stav.
  const next = applyOperation(before, operation).next;
  const res = s.submitOperation(operation);
  assert.notEqual(res.status, 'invalid');
  assert.notEqual(res.status, 'noProgress');
  for (const slot of askedParts(before, next)) {
    const value = partValue(next, slot);
    s.submitValue(value.d === 1 ? { kind: 'int', value: value.n } : { kind: 'fraction', n: value.n, d: value.d });
  }
  assert.equal(s.equationState.right.x.n, 0, 'x zmizelo z pravé strany');
});

test('zlomková témata umí celou stupnici 1-6 a stupně se nepřekrývají', async () => {
  const { generateForTopic } = await import('../js/engine/mission.js');
  // Dřív se obě zlomková témata ořezávala na 3, takže deklarované 4-6 na
  // endgame planetách nemělo žádný efekt (DEC-019). Teď musí stupeň dojít
  // až do zadání - a každý stupeň dát JINÝ příklad, jinak je to zas kosmetika.
  const fractionTexts = new Set();
  const equationTexts = new Set();
  for (let d = 1; d <= 6; d++) {
    const fr = generateForTopic('fractions', 99, d, 0);
    const fe = generateForTopic('fractionEquations', 77, d);
    assert.equal(fr.difficulty, d, `zlomky neunesly stupeň ${d}`);
    assert.equal(fe.difficulty, d, `rovnice se zlomky neunesly stupeň ${d}`);
    assert.ok(fr.steps.length >= 1 && fe.steps.length >= 1, `stupeň ${d} bez kroků řešení`);
    fractionTexts.add(fr.text);
    equationTexts.add(fe.text);
  }
  assert.equal(fractionTexts.size, 6, `zlomky opakují zadání napříč stupni: ${[...fractionTexts]}`);
  assert.equal(equationTexts.size, 6, `rovnice opakují zadání napříč stupni: ${[...equationTexts]}`);
});

/* --- záporné x: -x = -11 --- */

test('samotné -x se řeší vynásobením -1, ne oklikou přes přehození stran', () => {
  const steps = solveLinearSteps(expr(-1, 1, 0, 1), expr(0, 1, -11, 1));
  assert.match(steps[0].operation, /vynásob -1/i);
  assert.equal(steps[0].leftSide, 'x');
  assert.equal(steps[0].rightSide, '11');
});

test('a - x = b se dál řeší přehozením stran, tam je to kratší', () => {
  const steps = solveLinearSteps(expr(-1, 1, 49, 1), expr(0, 1, 38, 1));
  assert.match(steps[0].operation, /Přičti x/);
});

test('vynásobení -1 vyřeší -x = -11 jedním krokem', () => {
  const start = { left: expr(-1, 1, 0, 1), right: expr(0, 1, -11, 1) };
  const applied = applyOperation(start, { kind: 'mul', operand: makeFraction(-1) });
  assert.equal(applied.status, 'ok');
  const verdict = checkStep(start, applied.next);
  assert.equal(verdict.status, 'ok');
  assert.equal(verdict.solved, true);
  assert.deepEqual(applied.next.left.x, { n: 1, d: 1 });
  assert.deepEqual(applied.next.right.c, { n: 11, d: 1 });
});

test('relace projde celou rovnici -x + 49 = 38 přes vynásobení -1', () => {
  const s = createStepSession({ equation: { left: expr(-1, 1, 49, 1), right: expr(0, 1, 38, 1) } });

  s.submitOperation({ kind: 'sub', operand: f(49) });
  s.submitValue({ kind: 'int', value: -11 });
  assert.equal(s.equationText, '-x = -11');

  const res = s.submitOperation({ kind: 'mul', operand: makeFraction(-1) });
  assert.notEqual(res.status, 'invalid');
  assert.notEqual(res.status, 'noProgress');
  while (s.phase === 'values') {
    s.submitValue({ kind: 'int', value: 11 });
  }
  assert.equal(s.isDone, true);
  assert.equal(s.getOutcome().mistakes, 0);
});

test('dělení -1 je rovnocenná cesta k témuž', () => {
  const s = createStepSession({ equation: { left: expr(-1, 1, 0, 1), right: expr(0, 1, -11, 1) } });
  const res = s.submitOperation({ kind: 'div', operand: makeFraction(-1) });
  assert.notEqual(res.status, 'invalid');
  assert.notEqual(res.status, 'noProgress');
  while (s.phase === 'values') {
    s.submitValue({ kind: 'int', value: 11 });
  }
  assert.equal(s.isDone, true);
});

/* --- zápis rovnice: zadání a krokový režim se musí shodovat --- */

test('záporný x-člen s kladnou konstantou se píše jako 12 - x', () => {
  assert.equal(formatExprOf(-1, 12), '12 - x');
  assert.equal(formatExprOf(-3, 10), '10 - 3x');
  // obojí záporné: vedení konstantou by dalo '-5 - x', necháváme x vpředu
  assert.equal(formatExprOf(-1, -5), '-x - 5');
  // kladné x zůstává beze změny
  assert.equal(formatExprOf(1, 7), 'x + 7');
  assert.equal(formatExprOf(3, -4), '3x - 4');
  assert.equal(formatExprOf(-1, 0), '-x');
});

test('zadání příkladu a stav v krokovém režimu jsou stejný zápis', () => {
  // Platí pro všechny generátory rovnic. Dvojí zápis téže rovnice je
  // pro dítě zbytečná zátěž - zadání i krokový stav se skládají ze
  // stejné struktury, takže se nemůžou rozejít.
  const forms = new Set();
  for (let seed = 1; seed <= 120; seed++) {
    const cases = [
      generateSimpleEquation(seed * 7, (seed % 2) + 1),
      generateLinearEquation(seed * 11, (seed % 4) + 1),
      generateFractionEquation(seed * 13, (seed % 3) + 1),
    ];
    for (const ex of cases) {
      const shown = `${formatExprRef(ex.equation.left)} = ${formatExprRef(ex.equation.right)}`;
      assert.equal(shown, ex.text, `${ex.form}: zadání a krokový zápis se liší`);
      forms.add(ex.form);
    }
  }
  // Pojistka, že test pokryl i tvary, kde zápis nebyl samozřejmý.
  for (const form of ['a-x=b', 'a(x+b)=c', 'x/a=b']) {
    assert.ok(forms.has(form), `test musí zahrnout tvar ${form}`);
  }
});

function formatExprOf(xn, cn) {
  return formatExprRef(expr(xn, 1, cn, 1));
}

/* --- záporný koeficient: -3x = 21 --- */

test('vydělení kladným číslem je pokrok i když zůstane záporné x', () => {
  // -3x = 21  ->  -x = 7. Zbývá otočit znaménko, takže to POKROK je;
  // dřív mělo -3x stejné skóre jako -x a hra tenhle krok odmítala.
  const start = { left: expr(-3, 1, 0, 1), right: expr(0, 1, 21, 1) };
  const applied = applyOperation(start, { kind: 'div', operand: f(3) });
  assert.equal(applied.status, 'ok');
  assert.equal(checkStep(start, applied.next).status, 'ok');
  assert.ok(progressScore(applied.next) < progressScore(start));
  assert.deepEqual(applied.next.left.x, { n: -1, d: 1 });
  assert.deepEqual(applied.next.right.c, { n: 7, d: 1 });
});

test('-3x = 21 jde dořešit obojí cestou i přes otočení znaménka první', () => {
  const start = { left: expr(-3, 1, 0, 1), right: expr(0, 1, 21, 1) };

  // a) vyděl 3, pak vynásob -1
  const a1 = applyOperation(start, { kind: 'div', operand: f(3) }).next;
  const a2 = applyOperation(a1, { kind: 'mul', operand: makeFraction(-1) }).next;
  assert.equal(isSolved(a2), true);
  assert.deepEqual(a2.right.c, { n: -7, d: 1 });

  // b) vynásob -1, pak vyděl 3
  const b1 = applyOperation(start, { kind: 'mul', operand: makeFraction(-1) }).next;
  assert.equal(checkStep(start, b1).status, 'ok');
  const b2 = applyOperation(b1, { kind: 'div', operand: f(3) }).next;
  assert.equal(isSolved(b2), true);
  assert.deepEqual(b2.right.c, { n: -7, d: 1 });

  // c) rovnou vyděl -3
  const c1 = applyOperation(start, { kind: 'div', operand: makeFraction(-3) }).next;
  assert.equal(isSolved(c1), true);
});

test('celá relace 5x + 8 = 8x + 29 přes dělení 3 a otočení znaménka', () => {
  const s = createStepSession({ equation: { left: expr(5, 1, 8, 1), right: expr(8, 1, 29, 1) } });

  s.submitOperation({ kind: 'sub', operand: f(8) });
  s.submitValue({ kind: 'int', value: 21 });
  assert.equal(s.equationText, '5x = 8x + 21');

  s.submitOperation({ kind: 'sub', operand: f(8), term: 'x' });
  s.submitValue({ kind: 'int', value: -3 });
  assert.equal(s.equationText, '-3x = 21');

  const res = s.submitOperation({ kind: 'div', operand: f(3) });
  assert.notEqual(res.status, 'noProgress', 'dělení třemi musí projít');
  s.submitValue({ kind: 'int', value: -1 });
  s.submitValue({ kind: 'int', value: 7 });
  assert.equal(s.equationText, '-x = 7');

  s.submitOperation({ kind: 'mul', operand: makeFraction(-1) });
  while (s.phase === 'values') {
    s.submitValue({ kind: 'int', value: -7 });
  }
  assert.equal(s.isDone, true);
  assert.equal(s.getOutcome().mistakes, 0, 'žádný z kroků není chyba');
});

test('kroky, které od cíle vzdalují, zůstávají odmítnuté', () => {
  // pojistka, že rozvolněné skóre nepustí i nesmysly
  const solved = { left: expr(1, 1, 0, 1), right: expr(0, 1, 5, 1) };
  const worse = applyOperation(solved, { kind: 'mul', operand: f(3) }).next;
  assert.equal(checkStep(solved, worse).status, 'noProgress');

  const start = { left: expr(3, 1, 0, 1), right: expr(0, 1, 15, 1) };
  const added = applyOperation(start, { kind: 'add', operand: f(5) }).next;
  assert.equal(checkStep(start, added).status, 'noProgress');
});

/* --- zlomkové pásy nesmí prozradit odpověď (UCV-STEP-002) --- */

function fractionExercise(a, b, kind = 'add') {
  return { topic: 'fractions', kind, operands: [a, b], steps: [], answer: { kind: 'fraction', n: 1, d: 1 } };
}

test('pás zlomku, na který se hra ptá, nemá napsané číslo', () => {
  const s = createStepSession(fractionExercise({ n: 1, d: 2 }, { n: 2, d: 3 }));

  // před volbou jmenovatele: oba v původním tvaru
  assert.deepEqual(s.bars.map((x) => x.label), ['1/2', '2/3']);

  s.submitValue({ kind: 'int', value: 6 });
  assert.equal(s.fractionPhase, 'numerator-a');
  // ptáme se na první -> ten je v cílové mřížce bez čísla,
  // druhý zůstává původní, aby neprozradil svou odpověď dopředu
  assert.deepEqual(s.bars.map((x) => x.label), ['?/6', '2/3']);
  assert.equal(s.bars[0].d, 6, 'mřížka už je cílová, jen bez popisku');
  assert.equal(s.bars[0].n, 3, 'dítě si díly spočítá z obrázku');

  s.submitValue({ kind: 'int', value: 3 });
  assert.equal(s.fractionPhase, 'numerator-b');
  assert.deepEqual(s.bars.map((x) => x.label), ['3/6', '?/6']);

  s.submitValue({ kind: 'int', value: 4 });
  assert.equal(s.fractionPhase, 'combine');
  assert.deepEqual(s.bars.map((x) => x.label), ['3/6', '4/6']);
});

test('zlomek, který společného jmenovatele už má, se nepřepisuje', () => {
  // 1/2 + 3/4 -> společný 4; ptát se 'přepiš 3/4 na jmenovatele 4' je prázdná otázka
  const s = createStepSession(fractionExercise({ n: 1, d: 2 }, { n: 3, d: 4 }));
  s.submitValue({ kind: 'int', value: 4 });
  assert.equal(s.fractionPhase, 'numerator-a');
  s.submitValue({ kind: 'int', value: 2 });
  assert.equal(s.fractionPhase, 'combine', 'druhý zlomek se přeskočí');
  assert.match(s.question.prompt, /Sečti čitatele/);
});

test('když mají zlomky stejného jmenovatele, přepisování odpadá celé', () => {
  const s = createStepSession(fractionExercise({ n: 1, d: 5 }, { n: 2, d: 5 }));
  assert.equal(s.fractionPhase, 'combine');
  assert.deepEqual(s.bars.map((x) => x.label), ['1/5', '2/5']);
});

test('větší společný jmenovatel než nejmenší pásy nerozbije', () => {
  const s = createStepSession(fractionExercise({ n: 1, d: 2 }, { n: 2, d: 3 }));
  s.submitValue({ kind: 'int', value: 12 });
  assert.deepEqual(s.bars.map((x) => x.label), ['?/12', '2/3']);
  assert.equal(s.bars[0].n, 6);
});

/* --- zlomkový koeficient: (2/9)x = 4/9 --- */

test('vynásobení jmenovatelem je pokrok u zlomkového koeficientu', () => {
  // Dřív mělo (2/9)x stejné skóre jako 2x, takže hra '× 9' odmítala,
  // přestože zlomek u x je zjevná překážka navíc.
  const start = { left: expr(2, 9, 0, 1), right: expr(0, 1, 4, 9) };
  const applied = applyOperation(start, { kind: 'mul', operand: f(9) });
  assert.equal(applied.status, 'ok');
  assert.equal(checkStep(start, applied.next).status, 'ok');
  assert.ok(progressScore(applied.next) < progressScore(start));
  assert.deepEqual(applied.next.left.x, { n: 2, d: 1 });
  assert.deepEqual(applied.next.right.c, { n: 4, d: 1 });
});

test('(2/9)x = 4/9 jde dořešit oběma cestami', () => {
  const start = { left: expr(2, 9, 0, 1), right: expr(0, 1, 4, 9) };

  // a) vynásob 9, pak vyděl 2
  const a1 = applyOperation(start, { kind: 'mul', operand: f(9) }).next;
  const a2 = applyOperation(a1, { kind: 'div', operand: f(2) }).next;
  assert.equal(isSolved(a2), true);
  assert.deepEqual(a2.right.c, { n: 2, d: 1 });

  // b) rovnou vyděl zlomkem 2/9
  const b1 = applyOperation(start, { kind: 'div', operand: makeFraction(2, 9) }).next;
  assert.equal(isSolved(b1), true);
  assert.deepEqual(b1.right.c, { n: 2, d: 1 });
});

test('násobení, které zlomek u x neodstraní, zůstává bez pokroku', () => {
  // '× 2' udělá z (2/9)x jen (4/9)x - pořád zlomek, pořád ne 1
  const start = { left: expr(2, 9, 0, 1), right: expr(0, 1, 4, 9) };
  const applied = applyOperation(start, { kind: 'mul', operand: f(2) });
  assert.equal(checkStep(start, applied.next).status, 'noProgress');
});

test('celá relace (2/9)x + 3/4 = 43/36 přes vynásobení devíti', () => {
  const s = createStepSession({ equation: { left: expr(2, 9, 3, 4), right: expr(0, 1, 43, 36) } });

  s.submitOperation({ kind: 'sub', operand: makeFraction(3, 4) });
  s.submitValue({ kind: 'fraction', n: 4, d: 9 });
  assert.equal(s.equationText, '(2/9)x = 4/9');

  const res = s.submitOperation({ kind: 'mul', operand: f(9) });
  assert.notEqual(res.status, 'noProgress', 'vynásobení jmenovatelem musí projít');
  while (s.phase === 'values') {
    const prompt = s.question.prompt;
    s.submitValue({ kind: 'int', value: prompt.includes('levé') ? 2 : 4 });
  }
  assert.equal(s.equationText, '2x = 4');

  s.submitOperation({ kind: 'div', operand: f(2) });
  while (s.phase === 'values') {
    s.submitValue({ kind: 'int', value: 2 });
  }
  assert.equal(s.isDone, true);
  assert.equal(s.getOutcome().mistakes, 0);
});

/* --- Zlomková relace: popisky a věta o přesahu celku (UCN-MATH-003) -------- */

test('pás celého operandu se popíše "2", ne "2/1"', () => {
  // Zadání i otázka relace píšou '2' - popisek pásu byl jediné místo,
  // které tvrdilo '2/1'. Celý operand se objeví od obtížnosti 4.
  const session = createStepSession({
    topic: 'fractions',
    kind: 'subtract',
    operands: [makeFraction(2), makeFraction(3, 4)],
  });
  assert.deepEqual(
    session.bars.map((bar) => bar.label),
    ['2', '3/4']
  );
  assert.match(session.question.prompt, /pro 2 a 3\/4/);
});

test('výsledek přesahující celek relace pojmenuje, ne odbude tichem', () => {
  // Nová myšlenka obtížnosti 5 (nepravý operand): u výsledku v základním tvaru
  // relace po sečtení čitatelů rovnou končí, takže bez téhle věty by o přesahu
  // celku nepadlo ani slovo.
  const session = createStepSession({
    topic: 'fractions',
    kind: 'add',
    operands: [makeFraction(7, 4), makeFraction(5, 6)],
  });
  session.submitValue({ kind: 'int', value: 12 });   // společný jmenovatel
  session.submitValue({ kind: 'int', value: 21 });   // 7/4 = 21/12
  session.submitValue({ kind: 'int', value: 10 });   // 5/6 = 10/12
  const solved = session.submitValue({ kind: 'int', value: 31 });

  assert.equal(solved.status, 'solved');
  assert.ok(solved.note, 'chybí věta o přesahu celku');
  assert.ok(solved.note.includes('31/12'), solved.note);
  assert.ok(/víc než celek/.test(solved.note), solved.note);
});

test('výsledek do jednoho celku žádnou větu navíc nedostane', () => {
  const session = createStepSession({
    topic: 'fractions',
    kind: 'add',
    operands: [makeFraction(1, 4), makeFraction(1, 2)],
  });
  session.submitValue({ kind: 'int', value: 4 });
  session.submitValue({ kind: 'int', value: 2 });
  const solved = session.submitValue({ kind: 'int', value: 3 });
  assert.equal(solved.status, 'solved');
  assert.equal(solved.note, null);
});

/* --- Váha nesmí tvrdit nic jiného, než co v rovnici je (UCN-MATH-004) ------ */

/*
 * Invariant vyžádaný v revizi návrhu. Váha se krmí TEXTEM strany a čte ho
 * zpátky visualParse.parseSide, takže mezi solverem a UI platí nepsaný kontrakt.
 * Selhat umí dvěma způsoby a ten tišší je horší:
 *  - NEPŘEČTENÁ strana vydávaná za prázdnou: '3 - x/2' parseSide nepřečte.
 *    Dřív se to psalo do misky jako '0' (UCV-FIX-001), pak se kreslila
 *    prázdná miska, což je totéž tvrzení beze slov (UCV-LEARN-001). Dnes
 *    balanceScale u takové strany váhu vůbec neukáže a napíše dítěti proč -
 *    prázdná miska zbyla jenom SKUTEČNÉ nule, o které je pravda.
 *  - LŽOUCÍ miska: 'x/2 + x/3' přečte jako x-člen 'x/2' a KONSTANTU 'x/3',
 *    tedy druhý x-člen vydávaný za závaží.
 * Test proto neověřuje, že váha 'něco přečte', ale že přečtené SEDÍ se
 * strojovým stavem kroku (leftExpr/rightExpr, UCN-STEP-001).
 *
 * Nové zlomkové rovnice 4-6 se nepřečtené straně dnes vyhýbají tím, že
 * generátor dává větší koeficient VLEVO. To je ale volba generátoru - tenhle
 * test z ní dělá hlídané pravidlo: při opačné orientaci vznikne '3 - x/2' hned
 * v prvním kroku nápovědy a test spadne.
 */
function assertScaleTellsTruth(text, side, label) {
  const parsed = parseSide(text);
  if (isFactored(side)) {
    // Součinový tvar: konstanta je schválně UVNITŘ pytlíku ('2(x + 10)' =
    // dva stejné pytlíky, v každém x a deset), takže se zvlášť nekontroluje.
    assert.ok(
      parsed.xTerm && parsed.xTerm.grouped === true,
      `${label}: závorka '${text}' se na váze nevykreslí jako pytlík`
    );
    return;
  }
  if (side.x.n === 0 && side.c.n === 0) {
    // Poctivá nula: na misce opravdu nic není. Jediné místo, kde '0' smí být.
    assert.equal(parsed.constantText, '0', `${label}: nulová strana '${text}'`);
    return;
  }
  assert.equal(
    parsed.xTerm !== null,
    side.x.n !== 0,
    `${label}: váha čte x-člen ve '${text}' jinak, než co v rovnici je`
  );
  assert.equal(
    parsed.constantText !== null,
    side.c.n !== 0,
    `${label}: váha čte konstantu ve '${text}' jinak, než co v rovnici je`
  );
}

/** Strana s nesčtenými členy se na váhu vůbec nepouští (stepInput ji skryje). */
const drawnOnScale = (side) => !needsCombine(side);

function checkExerciseAgainstScale(exercise, label) {
  const start = exercise.equation;
  if (start) {
    // Výchozí stav = obrazovka, na kterou dítě kouká celou misi. Jediné místo,
    // kde se na váhu dostane závorka (řešič ji vydělí před prvním krokem).
    for (const name of ['left', 'right']) {
      if (drawnOnScale(start[name])) {
        assertScaleTellsTruth(formatExprRef(start[name]), start[name], `${label} / zadání ${name}`);
      }
    }
  }
  for (const [i, step] of exercise.steps.entries()) {
    if (!step.leftExpr || !step.rightExpr) {
      continue; // kroky zlomkové aritmetiky kreslí pásy, ne váhu
    }
    if (drawnOnScale(step.leftExpr)) {
      assertScaleTellsTruth(step.leftSide, step.leftExpr, `${label} / krok ${i + 1} vlevo`);
    }
    if (drawnOnScale(step.rightExpr)) {
      assertScaleTellsTruth(step.rightSide, step.rightExpr, `${label} / krok ${i + 1} vpravo`);
    }
  }
}

test('váha nikde netvrdí nic jiného, než co v rovnici doopravdy je', () => {
  for (let seed = 1; seed <= 200; seed++) {
    for (let difficulty = 1; difficulty <= 6; difficulty++) {
      checkExerciseAgainstScale(
        generateFractionEquation(seed, difficulty),
        `zlomková rovnice d${difficulty} seed ${seed}`
      );
    }
    for (let difficulty = 1; difficulty <= 3; difficulty++) {
      checkExerciseAgainstScale(generateSimpleEquation(seed, difficulty), `jednoduchá d${difficulty} seed ${seed}`);
    }
    for (let difficulty = 1; difficulty <= 4; difficulty++) {
      checkExerciseAgainstScale(generateLinearEquation(seed, difficulty), `lineární d${difficulty} seed ${seed}`);
    }
  }
});

test('lžoucí miska by testem neprošla - proto se nesečtená strana nekreslí', () => {
  // Doklad, že invariant chytá i tu tišší vadu: 'x/2 + x/3' se přečte jako
  // x-člen a KONSTANTA 'x/3'. Právě proto má stepInput guard, který u
  // nesečtené strany váhu skryje - kdyby zmizel, tohle by dítě vidělo.
  const side = multiTermSide([
    { x: { n: 1, d: 2 }, c: { n: 0, d: 1 } },
    { x: { n: 1, d: 3 }, c: { n: 0, d: 1 } },
  ]);
  assert.equal(needsCombine(side), true, 'strana se dvěma x-členy se musí nejdřív sečíst');
  assert.throws(() => assertScaleTellsTruth(formatExprRef(side), side, 'lžoucí miska'));
  // A prázdná miska: záporný zlomkový koeficient za kladnou konstantou.
  const empty = expr(-1, 2, 3, 1);
  assert.equal(formatExprRef(empty), '3 - x/2');
  assert.throws(() => assertScaleTellsTruth(formatExprRef(empty), empty, 'prázdná miska'));
});

/* --- UCN-STEP-001: kontrakt veřejných funkcí selhává hlučně a hned --- */

/** Výjimka musí být SROZUMITELNÁ, ne pád na undefined uvnitř. */
function assertLoudError(fn, expected, label) {
  assert.throws(
    fn,
    (err) => {
      assert.ok(
        !(err instanceof TypeError),
        `${label}: pořád to padá dovnitř na TypeError místo srozumitelné hlášky - ${err.message}`
      );
      assert.match(err.message, expected, `${label}: hláška nepojmenuje, co je špatně`);
      return true;
    },
    label
  );
}

test('UCN-STEP-001: applyOperation odmítne PRÁVĚ TU záměnu, na které vznikl falešný nález', () => {
  // Ověřovací skript posílal { kind, value, term } místo { kind, operand, term }.
  // Každé volání spadlo uvnitř na "Cannot read properties of undefined (reading
  // 'n')", skript výjimky polykal a nulový počet přijatých kroků si vyložil jako
  // "krokový řešič má slepou uličku, dítě uvízne". Stav přitom měl 720 platných
  // operací a nález byl nezávisle "potvrzen" druhým agentem se stejnou chybou.
  // Tenhle test je pojistka přesně proti té škodě, ne proti abstraktní vadě.
  const start = state(3, 4, 0, 19);
  assertLoudError(
    () => applyOperation(start, { kind: 'sub', value: f(4), term: 'const' }),
    /neznámý parametr operace value/,
    'záměna operand → value'
  );
  // Hláška musí říct i to, co se ČEKALO - jinak volající hádá dál.
  assert.throws(
    () => applyOperation(start, { kind: 'sub', value: f(4), term: 'const' }),
    /kind, operand, term, side/
  );
});

test('UCN-STEP-001: chybějící operand a operand ve špatném tvaru se pojmenují', () => {
  const start = state(3, 4, 0, 19);
  for (const kind of ['add', 'sub', 'mul', 'div']) {
    assertLoudError(
      () => applyOperation(start, { kind }),
      new RegExp(`operace '${kind}' potřebuje operand`),
      `${kind} bez operandu`
    );
  }
  // Špatný tvar = tytéž podmínky, jaké si hlídá makeFraction: celočíselné
  // složky a nenulový jmenovatel. Řetězec '4' ani číslo 4 zlomek nejsou.
  for (const operand of [null, 4, '4', { n: 1 }, { n: 1.5, d: 2 }, { n: 1, d: 0 }, [1, 2]]) {
    assertLoudError(
      () => applyOperation(start, { kind: 'sub', operand }),
      /musí být zlomek \{ n, d \}/,
      `operand ${JSON.stringify(operand) ?? String(operand)}`
    );
  }
});

test('UCN-STEP-001: neznámá operace, druh operandu i strana se pojmenují', () => {
  const start = state(3, 4, 0, 19);
  assertLoudError(() => applyOperation(start, null), /operace musí být objekt/, 'operace null');
  assertLoudError(
    () => applyOperation(start, { kind: 'odmocni', operand: f(2) }),
    /neznámá operace/,
    'neznámý kind'
  );
  assertLoudError(
    () => applyOperation(start, { kind: 'add', operand: f(2), term: 'konstanta' }),
    /neznámý druh operandu/,
    'neznámý term'
  );
  for (const side of [undefined, 'middle']) {
    assertLoudError(
      () => applyOperation(start, { kind: 'combine', side }),
      /potřebuje stranu 'left' nebo 'right'/,
      `combine se stranou ${side}`
    );
  }
  // Vadný STAV taky: bez téhle stráže se sáhne na state.left uvnitř.
  assertLoudError(
    () => applyOperation({ left: start.left }, { kind: 'sub', operand: f(4) }),
    /stav rovnice musí být \{ left, right \}/,
    'stav bez pravé strany'
  );
});

test('UCN-STEP-001: vadný stav odmítne checkStep, askedParts i partValue', () => {
  // Zákeřnější polovina vady: safeSolvedValue výjimku SPOLKNE, takže vadné
  // VOLÁNÍ by se tvářilo jako verdikt O ROVNICI ("úprava rovnici změnila").
  // Falešný nález vznikl přesně z takhle spolknuté výjimky.
  const good = state(3, 4, 0, 19);
  const badStates = [
    null,
    undefined,
    {},
    { left: good.left },
    { left: good.left, right: { x: f(1) } }, // strana má x, chybí c
    { left: good.left, right: { c: f(1) } }, // strana má c, chybí x
  ];
  // Obě půlky kontroly strany musí mít zuby: kdyby se hlídalo jen c, prošla by
  // strana bez koeficientu u x - a to je pořád stav, na který se nedá počítat.
  for (const bad of badStates) {
    const label = JSON.stringify(bad) ?? String(bad);
    assertLoudError(() => checkStep(good, bad), /nový stav musí být \{ left, right \}/, `checkStep next ${label}`);
    assertLoudError(() => checkStep(bad, good), /předchozí stav musí být \{ left, right \}/, `checkStep prev ${label}`);
    // askedParts a partValue čtou stav stejně hluboko, takže mají tutéž stráž.
    assertLoudError(() => askedParts(good, bad), /nový stav musí být \{ left, right \}/, `askedParts next ${label}`);
    assertLoudError(() => askedParts(bad, good), /předchozí stav musí být \{ left, right \}/, `askedParts prev ${label}`);
    assertLoudError(() => partValue(bad, 'left.x'), /stav rovnice musí být \{ left, right \}/, `partValue ${label}`);
  }
});

test('UCN-STEP-001: describeOperation a identifikátory slotů mají týž kontrakt', () => {
  const start = state(3, 4, 0, 19);
  // Bez stráže by popisek na tlačítku zněl 'Odečti undefined z obou stran'.
  assertLoudError(
    () => describeOperation({ kind: 'sub', value: f(4) }),
    /neznámý parametr operace value/,
    'describeOperation se záměnou'
  );
  assertLoudError(() => describeOperation({ kind: 'sub' }), /potřebuje operand/, 'popis bez operandu');
  assertLoudError(() => partValue(start, 'links.x'), /neznámá část stavu/, 'překlep ve slotu');
  assertLoudError(() => partQuestion('left.terms.0.x'), /neznámá část stavu/, 'člen není plain slot');
});

test('UCN-STEP-001: správná volání se kontrolou nezměnila', () => {
  // Přejímací podmínka fáze: stráže nesmí posunout ANI JEDNU platnou cestu.
  const plain = state(3, 4, 0, 19);
  for (const operation of [
    { kind: 'sub', operand: f(4) },
    { kind: 'add', operand: f(2), term: 'x' },
    { kind: 'mul', operand: f(2) },
    { kind: 'div', operand: f(3) },
    { kind: 'mul', operand: makeFraction(-1) }, // záporný operand je legitimní
    { kind: 'div', operand: makeFraction(2, 9) }, // zlomkový taky
  ]) {
    assert.equal(applyOperation(plain, operation).status, 'ok', describeOperation(operation));
  }
  // expand a combine operand nemají - a bez něj se volat SMÍ.
  const factored = { left: factoredExpr(2, 1, 1, 1, 3, 1), right: expr(0, 1, 10, 1) };
  assert.equal(applyOperation(factored, { kind: 'expand' }).status, 'ok');
  const multi = {
    left: multiTermSide([
      { x: f(2), c: f(0) },
      { x: f(1), c: f(0) },
    ]),
    right: expr(0, 1, 9, 1),
  };
  assert.equal(applyOperation(multi, { kind: 'combine', side: 'left' }).status, 'ok');

  // A výstupy, které kolem stráží procházejí, zůstaly do znaku stejné.
  assert.equal(describeOperation({ kind: 'sub', operand: f(4) }), 'Odečti 4 z obou stran');
  assert.equal(partQuestion('right.c'), 'Jaké číslo zůstane na pravé straně?');
  assert.deepEqual(partValue(plain, 'left.x'), { n: 3, d: 1 });
  const next = applyOperation(plain, { kind: 'sub', operand: f(4) }).next;
  assert.equal(checkStep(plain, next).status, 'ok');
  assert.deepEqual(askedParts(plain, next), ['right.c']);
});

/* --- UCV-FIX-001: nepřečtená strana se nesmí vykreslit jako '0' --- */

test('UCV-FIX-001: váha nepřečtenou stranu NEVYKRESLÍ jako nulu', async () => {
  // Falešná nula je nepravda, kterou vidí dítě: strana, kterou parseSide
  // nepřečte, se kreslila jako literál '0', tedy "na misce nic není". A byla
  // to nepravda přesně naopak - SKUTEČNÁ nula přijde jako constantText '0' a
  // do té větve se nikdy nedostala.
  const { installDom } = await import('./domStub.js');
  installDom();
  const { createBalanceScale } = await import('../js/ui/balanceScale.js');

  const zeroTexts = (leftText, rightText) => {
    const scale = createBalanceScale();
    scale.show(leftText, rightText);
    return scale.element
      .querySelectorAll('text')
      .map((t) => t.textContent)
      .filter((t) => t === '0');
  };

  // Číslici '0' hlídáme tam, kde na ni pořád může dojít: u SKUTEČNÉ nuly, která
  // se kreslí. Prázdná miska o ní mluví dost - kdyby k ní přibyl ještě popisek
  // '0', vznikne táž nepravda o straně, na které něco je (nula se sečte s x).
  // U nepřečtených tvarů by tenhle způsob měření od UCV-LEARN-001 nemohl spadnout
  // NIKDY: váha se u nich celá schová, takže v ní žádný `text` není z podstaty.
  // Nepřečtené tvary proto měří UCV-LEARN-001 níž jinak - přes misky, které
  // nevzniknou. Kdyby tenhle řádek zůstal na nich, byl by to vakuový test.
  assert.deepEqual(zeroTexts('0', '12'), [], 'miska u skutečné nuly nese navíc číslici 0');
  assert.deepEqual(zeroTexts('x + 0', '12'), [], "strana 'x + 0' nese na misce číslici 0");

  // Kontrola opačným směrem: strany, které parser čte, se kreslit nepřestaly.
  // Počítá se uvnitř MISKY, ne v celém svg: statická kostra váhy (nosník,
  // sloup, podstavec) má 3 `rect` i bez jediného volání show(), takže nad
  // celým svg mělo tvrzení podlahu 3 a nemohlo spadnout ani při úplně
  // prázdné misce. V misce je podlaha 0 (miska sama je `path`), takže se
  // měří opravdu to, co dítě na misce uvidí: 4/4/2/1/7 kostek a pytlíků.
  for (const text of ['12 - x', '10 - 3x', '2(x + 10)', 'x', '7']) {
    const scale = createBalanceScale();
    assert.equal(scale.show(text, '12'), true, `váha odmítla čitelnou stranu '${text}'`);
    // Selektor '.balance-pan rect' stub úmyslně neumí a hlásí to výjimkou;
    // rozšiřovat kvůli jednomu testu měřicí přístroj by bylo horší než
    // najít misku a počítat v ní. První miska je levá - tam jde `text`.
    const leftPan = scale.element.querySelectorAll('.balance-pan')[0];
    assert.ok(leftPan, 'váha nemá misku .balance-pan, test měří jinde než na misce');
    const drawn = leftPan.querySelectorAll('rect').length;
    assert.ok(drawn > 0, `váha přestala kreslit čitelnou stranu '${text}'`);
  }
});

/* --- UCV-LEARN-001: 'nevím' se nesmí kreslit jako 'nic tam není' --- */

test('UCV-LEARN-001: nepřečtená strana vypadá jinak než skutečná nula', async () => {
  // UCV-FIX-001 sundalo z misky falešnou nulu, ale zbylo splynutí: nepřečtená
  // strana i SKUTEČNÁ nula daly bajt po bajtu týž obrázek - prázdnou misku.
  // Hra tím dítěti tvrdila 'na téhle straně nic není' i tam, kde o straně
  // nevěděla vůbec nic. Prázdná miska smí patřit jenom nule.
  const { installDom } = await import('./domStub.js');
  installDom();
  const { createBalanceScale } = await import('../js/ui/balanceScale.js');

  /**
   * Otisk toho, co dítě uvidí. Ne 'nakreslilo se něco', ale CO: misky zvlášť
   * od jejich obsahu, plus text náhrady. Obsah se počítá UVNITŘ misky -
   * kostra váhy (nosník, sloup, podstavec) má 3 `rect` i bez volání show(),
   * takže nad celým svg by měl každý počet podlahu 3.
   */
  const fingerprint = (leftText, rightText = '12') => {
    const scale = createBalanceScale();
    const drawn = scale.show(leftText, rightText);
    const pans = scale.element.querySelectorAll('.balance-pan');
    const obsah = (pan) => (pan ? [pan.querySelectorAll('rect').length, pan.querySelectorAll('text').length] : null);
    return {
      drawn,
      pans: pans.length,
      left: obsah(pans[0]),
      right: obsah(pans[1]),
      note: scale.element.querySelector('.balance-note')?.textContent ?? null,
    };
  };

  // Otisk sám potřebuje obě kontroly: kdyby rozlišoval všechno (třeba náhodou
  // uvnitř), bylo by porovnání níž vakuum; kdyby nerozlišoval nic, spadlo by.
  assert.deepEqual(fingerprint('0'), fingerprint('0'), 'otisk rozlišuje i dvě shodná vykreslení');
  assert.notDeepEqual(fingerprint('7'), fingerprint('0'), 'otisk nerozliší ani sedm od nuly');

  // Skutečná nula: prázdná miska je pravda a kreslit se má dál. Druhá miska
  // ('12') musí něco nést - jinak by 'prázdná vlevo' neměřila nic.
  const nula = fingerprint('0');
  assert.equal(nula.drawn, true, 'váha se schovala i u skutečné nuly');
  assert.equal(nula.pans, 2, 'váha u skutečné nuly nenakreslila obě misky');
  assert.deepEqual(nula.left, [0, 0], 'skutečná nula přestala kreslit prázdnou misku');
  assert.ok(nula.right[0] > 0, 'předpoklad testu neplatí - druhá miska je taky prázdná');
  assert.equal(nula.note, null, 'u skutečné nuly se dítěti omlouváme, místo abychom kreslili');

  // Věta místo váhy se čte z DOM, ne z exportované konstanty: kdyby ji test
  // porovnával s tímtéž řetězcem, který produkce vypisuje, netvrdil by o ní nic.
  const veta = fingerprint('5 - x/3').note;
  assert.ok(veta && veta.trim().length > 20, 'místo váhy nezbyla dítěti věta');
  assert.equal(/(^|\s)0(\s|$)/.test(veta), false, 'věta místo váhy sama mluví o nule');

  // Nepřečtené tvary (záporný zlomkový koeficient, zlomkový činitel před
  // závorkou): žádná miska, tedy ani žádné tvrzení o tom, co na ní leží.
  for (const text of ['(x + 3)/4', '1/4(x + 3)', '5 - (2/3)x', '5 - x/3']) {
    const neznamy = fingerprint(text);
    assert.equal(neznamy.drawn, false, `váha tvrdí, že stranu '${text}' nakreslila`);
    assert.equal(neznamy.pans, 0, `strana '${text}' se kreslí do misky, přestože ji neumíme přečíst`);
    // Prázdná miska zůstala jen skutečné nule (měřeno výš) a nepřečtená strana
    // nemá misku vůbec - v tom je ten rozdíl, který dítě uvidí. Souhrnné
    // 'otisky se liší' se sem NEPÍŠE: po třech tvrzeních výš by nemělo jak
    // spadnout a vypadalo by jako hlavní záruka testu.
    assert.equal(neznamy.note, veta, `u '${text}' chybí dítěti věta, proč váha není`);

    // Táž strana VPRAVO. Podmínka v show() má dvě půlky a každá potřebuje
    // svůj protipříklad: dokud se měřila jen levá miska, šla druhá půlka
    // smazat a sada zůstala zelená.
    const vpravo = fingerprint('12', text);
    assert.equal(vpravo.drawn, false, `váha kreslí, i když je nepřečtená strana '${text}' vpravo`);
    assert.equal(vpravo.pans, 0, `nepřečtená strana '${text}' vpravo se kreslí do misky`);
    assert.equal(vpravo.note, veta, `u '${text}' vpravo chybí dítěti věta, proč váha není`);
  }

  // A zpátky: po čitelné straně se váha vrátí. Táž instance, protože přesně
  // takhle ji používá prohlížeč řešení - jeden objekt přes všechny kroky.
  const scale = createBalanceScale();
  assert.equal(scale.show('5 - x/3', '12'), false, 'příprava testu: nepřečtená strana se nakreslila');
  // Dva nepřečtené kroky za sebou (prohlížeč řešení jimi listuje) nesmí větu
  // nasázet dvakrát pod sebe.
  assert.equal(scale.show('1/4(x + 3)', '12'), false, 'druhý nepřečtený krok se nakreslil');
  assert.equal(scale.element.querySelectorAll('.balance-note').length, 1, 'věta místo váhy se opakuje');
  assert.equal(scale.show('3x + 4', '12'), true, 'váha se po nepřečtené straně už nevrátila');
  assert.equal(scale.show('2x + 1', '12'), true, 'druhý čitelný krok váhu ztratil');
  assert.equal(scale.element.querySelectorAll('.balance-note').length, 0, 'věta zůstala viset i pod vrácenou váhou');
  assert.equal(scale.element.querySelectorAll('.balance-svg').length, 1, 'váha se vrátila jinak než jednou');
  assert.ok(
    scale.element.querySelectorAll('.balance-pan')[0].querySelectorAll('rect').length > 0,
    'vrácená váha má prázdnou misku'
  );
});

test('UCV-LEARN-001: v krokovém režimu zůstane místo váhy vidět věta i rada', async () => {
  // Zlomkový činitel před závorkou ('1/2(x + 6)') je tvar, který parseSide
  // nepřečte a přitom v něm není jediné záporné číslo - nespadne tedy do
  // větve s číselnou osou a doputuje až k váze. Dnes takovou rovnici žádný
  // generátor nevyrábí (oba používají factoredExpr s celým činitelem), tenhle
  // test drží, že ji krokový režim unese, až vznikne.
  const { installDom, createContainer } = await import('./domStub.js');
  installDom();
  const { createStepInput } = await import('../js/ui/stepInput.js');
  const { createStepSession } = await import('../js/engine/stepSession.js');
  const { factoredExpr, expr } = await import('../js/content/solver.js');

  const session = createStepSession({
    equation: { left: factoredExpr(1, 2, 1, 1, 6, 1), right: expr(0, 1, 5, 1) },
  });
  assert.equal(session.kind, 'equation', 'předpoklad testu neplatí - nevznikla rovnicová relace');
  assert.equal(session.equationText, '1/2(x + 6) = 5', 'předpoklad testu neplatí - jiný tvar rovnice');

  const container = createContainer();
  createStepInput(container, { session, onFeedback: () => {}, onSolved: () => {} });
  const viz = container.querySelector('.step-viz');
  const note = container.querySelector('.step-viz-note');

  // Rám ZŮSTÁVÁ vidět, protože je v něm ta věta - kdyby se schoval, dítě by si
  // přečetlo jen popisek pod ním, a ten je schválně drobný a ztlumený (je to
  // popiska k obrázku, ne náhrada za něj).
  assert.equal(viz.hidden, false, 'krokový režim schoval i větu, která místo váhy zbyla');
  const vetaVRamu = viz.querySelector('.balance-note');
  assert.ok(vetaVRamu, 'v rámu není věta, proč váha není');
  assert.ok(vetaVRamu.textContent.trim().length > 20, 'věta místo váhy je prázdná');
  assert.equal(viz.querySelectorAll('.balance-svg').length, 0, 'váha se v krokovém režimu kreslí dál');

  // Popisek pod rámem se nesmí hádat s větou v něm: 'Váha ukazuje stav před
  // tímhle krokem' by tvrdil, že váha je vidět. Místo něj rada, která tady
  // platí - závorka jde roztáhnout a tlačítko na to je hned pod tím.
  assert.equal(session.hasBracket, true, 'předpoklad testu neplatí - rovnice nemá závorku');
  assert.equal(note.hidden, false, 'dítě nedostalo radu, přestože závorku roztáhnout může');
  assert.ok(note.textContent.includes('závorku'), `rada nemluví o závorce: ${JSON.stringify(note.textContent)}`);
  assert.equal(
    note.textContent.includes('Váha ukazuje'),
    false,
    'pod větou o chybějící váze svítí popisek, že váha něco ukazuje'
  );

  // Protějšek: čitelná rovnice váhu ukázat MUSÍ, jinak by tvrzení výš platilo
  // pořád a neměřilo by nic.
  const citelna = createStepSession({ equation: { left: expr(3, 1, 4, 1), right: expr(0, 1, 19, 1) } });
  const druhy = createContainer();
  createStepInput(druhy, { session: citelna, onFeedback: () => {}, onSolved: () => {} });
  assert.equal(druhy.querySelector('.step-viz').hidden, false, 'krokový režim schoval i čitelnou váhu');
  assert.equal(druhy.querySelectorAll('.balance-note').length, 0, 'u čitelné rovnice se dítěti omlouváme');
  assert.equal(druhy.querySelectorAll('.balance-svg').length, 1, 'čitelná rovnice zůstala bez váhy');
});

test('UCV-LEARN-001: věta místo váhy je čitelná a drží po váze místo', () => {
  // Věta není popiska k obrázku, ale NÁHRADA obrázku - tak taky musí vypadat.
  const rules = parseCss(readFileSync(new URL('../css/main.css', import.meta.url), 'utf8'));

  // Text, který má dítě přečíst, se v téhle hře neztlumuje: ztlumená hláška
  // v dílně už jednou spadla na 2,7:1. Odlišuje se rámečkem, ne šedí.
  assert.equal(
    resolveValue(rules, '.balance-note', 'color'),
    'var(--color-text)',
    'věta místo váhy je ztlumená, přestože ji má dítě přečíst'
  );
  assert.ok(resolveValue(rules, '.balance-note', 'border'), 'věta místo váhy se od okolí ničím neodlišuje');

  // Rozměr drží po váze místo v OBOU směrech. Bez toho se sloupec při přechodu
  // na nenakreslitelný krok srazí a tlačítka Zpět/Další krok vyskočí dítěti
  // pod prst - přesně uprostřed klepání.
  assert.equal(
    resolveValue(rules, '.balance-note', 'width'),
    resolveValue(rules, '.balance-svg', 'width'),
    'věta místo váhy nedrží šířku váhy'
  );
  assert.ok(resolveValue(rules, '.balance-note', 'min-height'), 'věta místo váhy nedrží výšku - sloupec poskočí');
});

test('UCV-LEARN-001: v prohlížeči řešení zůstane u nenakreslitelného kroku vidět rovnice', async () => {
  // Bez váhy zbude v kroku jen pokyn ('Odečti 3 z obou stran') a vysvětlení -
  // ale dítě nemá kde vidět, Z ČEHO se odečítá. Osa i zlomkové pásy proto
  // rovnici píšou textem pod obrázek; váha to musí udělat taky, když se schová.
  const { installDom, createContainer } = await import('./domStub.js');
  installDom();
  const { createSolutionViewer } = await import('../js/ui/solutionViewer.js');

  const krok = (leftSide, rightSide) => ({
    operation: 'Odečti 3 z obou stran',
    explanation: 'Obě strany zmenšíme o tři.',
    leftSide,
    rightSide,
  });
  const otevri = (steps) => {
    const container = createContainer();
    createSolutionViewer(container, { exercise: { topic: 'equations', steps }, onClose: () => {} });
    return container.querySelector('.solution-viz');
  };

  const nenakreslitelny = otevri([krok('1/4(x + 3)', '12')]);
  assert.equal(nenakreslitelny.querySelectorAll('.balance-svg').length, 0, 'váha se nakreslila i u tvaru, který nepřečetla');
  assert.ok(nenakreslitelny.querySelector('.balance-note'), 'chybí věta, proč váha není');
  const rovnice = nenakreslitelny.querySelector('.solution-equation');
  assert.ok(rovnice, 'krok bez váhy neukazuje rovnici ani textem');
  assert.equal(rovnice.textContent, '1/4(x + 3) = 12', `rovnice v kroku zní ${JSON.stringify(rovnice.textContent)}`);

  // Protějšek: když se váha nakreslí, rovnice navíc se pod ni NEPÍŠE - je
  // vidět na miskách a text by ji jen zdvojil.
  const citelny = otevri([krok('3x + 4', '19')]);
  assert.equal(citelny.querySelectorAll('.balance-svg').length, 1, 'čitelný krok zůstal bez váhy');
  assert.equal(citelny.querySelector('.solution-equation'), null, 'pod nakreslenou váhou je rovnice ještě jednou textem');
});
