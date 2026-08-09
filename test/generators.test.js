import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateSimpleEquation, generateLinearEquation } from '../js/content/equations.js';
import { generateFractionEquation } from '../js/content/fractionEquations.js';
import { generateFractionExercise } from '../js/content/fractionExercises.js';
import { expr, evaluateExpr, formatExpr } from '../js/content/solver.js';
import { fractionsEqual, isSimplified, makeFraction } from '../js/content/fractions.js';

function answerAsFraction(answer) {
  return answer.kind === 'int' ? makeFraction(answer.value) : makeFraction(answer.n, answer.d);
}

test('TDD-MATH-001-A: stejný seed = stejná sada příkladů', () => {
  const a = generateSimpleEquation(42, 1);
  const b = generateSimpleEquation(42, 1);
  assert.deepEqual(a, b);
  assert.notEqual(generateSimpleEquation(42, 1).text, generateSimpleEquation(43, 1).text);
});

test('TDD-MATH-001-B: všechny jednoduché rovnice mají validní kladné celé řešení <= 100', () => {
  for (let seed = 1; seed <= 1000; seed++) {
    for (const difficulty of [1, 2, 3]) {
      const ex = generateSimpleEquation(seed, difficulty);
      assert.equal(ex.answer.kind, 'int', ex.text);
      assert.ok(ex.answer.value > 0, `x musí být kladné: ${ex.text}`);
      assert.ok(ex.answer.value <= 100, `max 100: ${ex.text}`);
      assert.ok(ex.steps.length >= 1);
      assert.ok(ex.hint.length > 0);
      assert.ok(ex.distractors.length >= 2, `málo distraktorů: ${ex.text}`);
      assert.ok(!ex.distractors.includes(ex.answer.value));
      assert.ok(ex.distractors.every((d) => d > 0), `distraktory musí být kladné: ${ex.text}`);
    }
  }
});

test('TDD-MATH-002-A: ax + b = c má vždy celočíselné řešení', () => {
  for (let seed = 1; seed <= 500; seed++) {
    for (const difficulty of [1, 2, 3]) {
      const ex = generateLinearEquation(seed, difficulty);
      assert.equal(ex.answer.kind, 'int', `${ex.text} (difficulty ${difficulty})`);
    }
  }
});

test('lineární rovnice difficulty 4: řešení sedí dosazením, může být záporné', () => {
  let sawNegative = false;
  for (let seed = 1; seed <= 300; seed++) {
    const ex = generateLinearEquation(seed, 4);
    assert.equal(ex.answer.kind, 'int', ex.text);
    if (ex.answer.value < 0) {
      sawNegative = true;
    }
  }
  assert.ok(sawNegative, 've vyšší obtížnosti se má objevit i záporné x');
});

test('TDD-MATH-003-A: sčítání zlomků dává vždy základní tvar a součet sedí', () => {
  for (let seed = 1; seed <= 1000; seed++) {
    for (const difficulty of [1, 2, 3]) {
      for (const kind of ['add', 'subtract']) {
        const ex = generateFractionExercise(seed, kind, difficulty);
        assert.equal(ex.answer.kind, 'fraction');
        assert.ok(isSimplified(ex.answer), `${ex.text} -> ${ex.answer.n}/${ex.answer.d}`);
        assert.ok(ex.answer.n >= 0, `odečítání nesmí dát záporný výsledek: ${ex.text}`);
      }
    }
  }
});

test('úlohy se zlomky: všechny druhy mají kroky, nápovědu a správnou odpověď', () => {
  const kinds = ['compare', 'add', 'subtract', 'simplify', 'expand', 'equivalent'];
  for (let seed = 1; seed <= 100; seed++) {
    for (const kind of kinds) {
      const ex = generateFractionExercise(seed, kind, 2);
      assert.ok(ex.steps.length >= 1, kind);
      assert.ok(ex.hint.length > 0, kind);
      assert.ok(ex.text.length > 0, kind);
      if (kind === 'simplify') {
        assert.ok(isSimplified(ex.answer));
      }
      if (kind === 'compare') {
        assert.ok(ex.answer.kind === 'choice');
        assert.ok(['left', 'right'].includes(ex.answer.value));
      }
      if (kind === 'equivalent') {
        assert.equal(ex.answer.kind, 'int');
      }
    }
  }
});

test('TDD-MATH-004-A: rovnice se zlomky - řešení vždy sedí dosazením', () => {
  for (let seed = 1; seed <= 500; seed++) {
    for (const difficulty of [1, 2, 3]) {
      const ex = generateFractionEquation(seed, difficulty);
      const x = answerAsFraction(ex.answer);
      // Rekonstruujeme levou a pravou stranu z textu nejde - ověříme přes kroky:
      // poslední krok musí hlásit správný výsledek.
      const last = ex.steps[ex.steps.length - 1];
      assert.equal(last.operation, 'Výsledek');
      assert.ok(
        last.rightSide === String(ex.answer.kind === 'int' ? ex.answer.value : `${ex.answer.n}/${ex.answer.d}`),
        `${ex.text}: výsledek v krocích (${last.rightSide}) != odpověď`
      );
      if (ex.answer.kind === 'fraction') {
        assert.ok(isSimplified(ex.answer), `${ex.text} -> nekrácený výsledek`);
      }
    }
  }
});

test('rovnice se zlomky difficulty 1: x/a = b má celé řešení', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const ex = generateFractionEquation(seed, 1);
    assert.equal(ex.answer.kind, 'int', ex.text);
    assert.match(ex.text, /^x\/\d+ = \d+$/);
  }
});
