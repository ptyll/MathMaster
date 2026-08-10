import { test } from 'node:test';
import assert from 'node:assert/strict';

import { expr, formatExpr, evaluateExpr, solveLinearSteps, solvedValue } from '../js/content/solver.js';
import { makeFraction, fractionsEqual } from '../js/content/fractions.js';

test('TDD-MATH-005-A: krokové řešení 3x + 4 = 10', () => {
  const steps = solveLinearSteps(expr(3, 1, 4, 1), expr(0, 1, 10, 1));

  assert.equal(steps.length, 3);
  assert.equal(steps[0].operation, 'Odečti 4 z obou stran');
  assert.equal(steps[0].leftSide, '3x');
  assert.equal(steps[0].rightSide, '6');
  assert.equal(steps[1].operation, 'Vyděl obě strany 3');
  assert.equal(steps[2].operation, 'Výsledek');
  assert.equal(steps[2].rightSide, '2');
});

test('řešení s x na obou stranách: 5x + 2 = 2x + 8', () => {
  const value = solvedValue(expr(5, 1, 2, 1), expr(2, 1, 8, 1));
  assert.deepEqual(value, { n: 2, d: 1 });

  const steps = solveLinearSteps(expr(5, 1, 2, 1), expr(2, 1, 8, 1));
  assert.equal(steps[0].operation, 'Odečti 2x z obou stran');
});

test('řešení x/a = b použije násobení jmenovatelem', () => {
  const steps = solveLinearSteps(expr(1, 3, 0, 1), expr(0, 1, 7, 1));
  assert.ok(steps.some((s) => s.operation === 'Vynásob obě strany 3'));
  assert.deepEqual(solvedValue(expr(1, 3, 0, 1), expr(0, 1, 7, 1)), { n: 21, d: 1 });
});

test('řešení a - x = b jde přes "přičti x k oběma stranám" (bez záporných mezikroků)', () => {
  const steps = solveLinearSteps(expr(-1, 1, 8, 1), expr(0, 1, 5, 1));
  assert.equal(steps[0].operation, 'Přičti x k oběma stranám');
  assert.equal(steps[0].leftSide, 'x + 5');
  assert.equal(steps[0].rightSide, '8');
  assert.ok(!steps.some((s) => s.operation.includes('-1')));
  assert.deepEqual(solvedValue(expr(-1, 1, 8, 1), expr(0, 1, 5, 1)), { n: 3, d: 1 });
  // žádný mezikrok nesmí obsahovat záporné číslo -> váha, ne osa
  assert.ok(!steps.some((s) => /(^|\s)-\d/.test(s.leftSide) || /(^|\s)-\d/.test(s.rightSide)));
});

test('zlomkový koeficient (2/3)x = 4 se řeší násobením jmenovatelem, ne dělením zlomkem', () => {
  // Dvě elementární operace ('× 3' a '÷ 2') jsou pro dítě schůdnější
  // než jediné dělení zlomkem 2/3, i když je jich o jednu víc.
  const steps = solveLinearSteps(expr(2, 3, 0, 1), expr(0, 1, 4, 1));
  assert.match(steps[0].operation, /Vynásob obě strany 3/);
  assert.equal(steps[0].leftSide, '2x');
  assert.match(steps[1].operation, /Vyděl obě strany 2/);
  assert.equal(steps[1].rightSide, '6');
  assert.ok(!steps.some((s) => s.operation.includes('převrácen')), 'převrácená hodnota se dítěti nenabízí');
  assert.deepEqual(solvedValue(expr(2, 3, 0, 1), expr(0, 1, 4, 1)), { n: 6, d: 1 });
});

test('koeficient 1/d zůstává na jednom kroku', () => {
  const steps = solveLinearSteps(expr(1, 9, 0, 1), expr(0, 1, 11, 1));
  assert.match(steps[0].operation, /Vynásob obě strany 9/);
  assert.equal(steps[0].leftSide, 'x');
  assert.equal(steps[0].rightSide, '99');
});

test('solvedValue ověřeno dosazením (zkouška)', () => {
  const cases = [
    [expr(3, 1, 4, 1), expr(0, 1, 10, 1)],
    [expr(5, 1, 2, 1), expr(2, 1, 8, 1)],
    [expr(1, 2, 1, 2), expr(0, 1, 5, 6)],
    [expr(-2, 1, 7, 1), expr(0, 1, 1, 1)],
  ];
  for (const [left, right] of cases) {
    const x = solvedValue(left, right);
    assert.ok(
      fractionsEqual(evaluateExpr(left, x), evaluateExpr(right, x)),
      `dosazení nesedí pro ${formatExpr(left)} = ${formatExpr(right)}`
    );
  }
});

test('formatExpr formátuje výrazy česky a čitelně', () => {
  assert.equal(formatExpr(expr(1, 1, 0, 1)), 'x');
  assert.equal(formatExpr(expr(3, 1, 4, 1)), '3x + 4');
  assert.equal(formatExpr(expr(2, 1, -5, 1)), '2x - 5');
  assert.equal(formatExpr(expr(2, 3, 0, 1)), '(2/3)x');
  assert.equal(formatExpr(expr(0, 1, 7, 1)), '7');
  assert.equal(formatExpr(expr(0, 1, 0, 1)), '0');
});

test('evaluateExpr dosazuje i zlomky', () => {
  const value = evaluateExpr(expr(1, 1, 0, 1), makeFraction(1, 2));
  assert.deepEqual(value, { n: 1, d: 2 });
  const withConst = evaluateExpr(expr(2, 1, 1, 1), makeFraction(3, 4));
  assert.deepEqual(withConst, { n: 5, d: 2 });
});
