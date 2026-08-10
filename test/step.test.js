import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  expr,
  factoredExpr,
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
  describeOperation,
} from '../js/content/stepCheck.js';
import { createStepSession } from '../js/engine/stepSession.js';
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

test('vyšší strop obtížnosti nerozbije zlomky ani rovnice se zlomky', async () => {
  const { generateForTopic } = await import('../js/engine/mission.js');
  for (let d = 1; d <= 6; d++) {
    const fr = generateForTopic('fractions', 99 * d, d, 0);
    const fe = generateForTopic('fractionEquations', 77 * d, d);
    assert.ok(fr.difficulty <= 3, `zlomky se drží na 3, dostal ${fr.difficulty}`);
    assert.ok(fe.difficulty <= 3, `rovnice se zlomky se drží na 3, dostal ${fe.difficulty}`);
  }
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
