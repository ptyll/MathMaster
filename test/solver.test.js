import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  expr,
  formatExpr,
  evaluateExpr,
  solveLinearSteps,
  solvedValue,
  formatXMagnitude,
  formatXTerm,
} from '../js/content/solver.js';
import { describeOperation } from '../js/content/stepCheck.js';
import { parseSide } from '../js/ui/visualParse.js';
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

/* ------------------------------------------------------------------------ */
/* Jednotný zápis x-členu (UCN-MATH-003/004)                                 */
/* ------------------------------------------------------------------------ */

test('formatXMagnitude je jediný zdroj pravdy pro zápis koeficientu u x', () => {
  assert.equal(formatXMagnitude({ n: 1, d: 1 }), 'x');
  assert.equal(formatXMagnitude({ n: 1, d: 5 }), 'x/5');
  assert.equal(formatXMagnitude({ n: 3, d: 1 }), '3x');
  assert.equal(formatXMagnitude({ n: 2, d: 3 }), '(2/3)x');
  assert.equal(formatXTerm({ n: -1, d: 1 }), '-x');
  assert.equal(formatXTerm({ n: -2, d: 3 }), '-(2/3)x');
});

test('pokyn kroku, tlačítko i zadání píšou týž x-člen stejně', () => {
  // Zlomkový koeficient na PRAVÉ straně je tvar, který zlomkové rovnice
  // s x na obou stranách probouzí poprvé. Dřív hra o témž členu psala
  // 'x/5' v zadání, '1/5x' v pokynu a '(1/5)x' v náhledu.
  for (const coefficient of [{ n: 1, d: 5 }, { n: 2, d: 3 }, { n: 3, d: 1 }, { n: 1, d: 1 }]) {
    const inTask = formatExpr(expr(coefficient.n, coefficient.d, 0, 1));
    const inButton = describeOperation({ kind: 'sub', term: 'x', operand: coefficient });
    const inStep = solveLinearSteps(expr(5, 1, 0, 1), expr(coefficient.n, coefficient.d, 12, 1))[0]
      .operation;
    assert.ok(
      inButton.includes(inTask),
      `tlačítko '${inButton}' nepíše x-člen jako zadání '${inTask}'`
    );
    assert.ok(
      inStep.includes(inTask),
      `pokyn kroku '${inStep}' nepíše x-člen jako zadání '${inTask}'`
    );
  }
});

test('co formatPlain napíše, to parseSide pro váhu přečte (round-trip)', () => {
  // Váha stojí na nepsaném kontraktu mezi solverem (píše) a visualParse
  // (čte zpátky). Bez tohohle testu se můžou rozejít potichu.
  //
  // ZNÁMÁ DÍRA V PARSERU (carry-forward, nikoli regrese): stranu se ZÁPORNÝM
  // ZLOMKOVÝM koeficientem parseSide nepřečte - ř. 44 i ř. 54 chtějí '(\d*)x'.
  // Konkrétně '4 - x/3', '4 - (2/3)x', '-(3/2)x' i '-(3/2)x - 4'. Jediná
  // výjimka, která projde, je záporný JEDNOTKOVÝ zlomek bez kladné konstanty
  // ('-x/3'), na ten gramatika pamatuje. Žádný generátor takový tvar nevyrábí
  // a zlomkové stupně 4-6 se mu vyhýbají. Tenhle test tu díru drží vyjmenovanou
  // a hlídá, že se nerozšíří.
  //
  // CO SE ZMĚNILO (UCV-FIX-001, pak UCV-LEARN-001): DŮSLEDEK té díry se
  // zmenšil dvakrát. Nejdřív zmizela falešná nula - nepřečtená strana se
  // kreslila jako literál '0', tedy jako tvrzení, že na misce nic není. Pak
  // zmizela i prázdná miska, která tvrdila totéž beze slov a byla přitom
  // k nerozeznání od SKUTEČNÉ nuly: balanceScale.js dnes u nepřečtené strany
  // váhu vůbec neukáže a napíše dítěti proč. Díra v parseru zůstává
  // (gramatika se nezměnila), ale hra o ní dítěti nelže. Testy na obojí jsou
  // v test/step.test.js.
  const isKnownHole = (coefficient, constant) =>
    coefficient.n < 0 && coefficient.d > 1 && (constant > 0 || coefficient.n !== -1);

  let holes = 0;
  for (let d = 1; d <= 12; d++) {
    for (let n = 1; n <= 12; n++) {
      for (const sign of [1, -1]) {
        for (const constant of [0, 4, -4]) {
          const coefficient = makeFraction(sign * n, d);
          const text = formatExpr(expr(coefficient.n, coefficient.d, constant, 1));
          const readable = parseSide(text).xTerm !== null;
          if (isKnownHole(coefficient, constant)) {
            holes++;
            assert.ok(!readable, `'${text}' se čte - známá díra zmizela, aktualizuj carry-forward`);
          } else {
            assert.ok(readable, `váha nepřečte '${text}', který solver vyrábí`);
          }
        }
      }
    }
  }
  assert.ok(holes > 0, 'test nezkusil ani jeden případ známé díry');
});
