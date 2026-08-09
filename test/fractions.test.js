import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  gcd,
  lcm,
  makeFraction,
  addFractions,
  subtractFractions,
  multiplyFractions,
  divideFractions,
  compareFractions,
  fractionsEqual,
  isSimplified,
  formatNumber,
} from '../js/content/fractions.js';

test('gcd a lcm', () => {
  assert.equal(gcd(12, 8), 4);
  assert.equal(gcd(7, 3), 1);
  assert.equal(gcd(0, 5), 5);
  assert.equal(lcm(4, 6), 12);
  assert.equal(lcm(3, 7), 21);
});

test('makeFraction udržuje základní tvar a kladného jmenovatele', () => {
  assert.deepEqual(makeFraction(4, 8), { n: 1, d: 2 });
  assert.deepEqual(makeFraction(6, -9), { n: -2, d: 3 });
  assert.deepEqual(makeFraction(-6, -9), { n: 2, d: 3 });
  assert.deepEqual(makeFraction(5), { n: 5, d: 1 });
  assert.throws(() => makeFraction(1, 0), /nesmí být 0/);
});

test('TDD-MATH-003-B: krácení 4/8 -> 1/2', () => {
  assert.deepEqual(makeFraction(4, 8), { n: 1, d: 2 });
});

test('sčítání a odčítání zlomků dává základní tvar', () => {
  assert.deepEqual(addFractions(makeFraction(1, 2), makeFraction(1, 4)), { n: 3, d: 4 });
  assert.deepEqual(addFractions(makeFraction(1, 3), makeFraction(1, 6)), { n: 1, d: 2 });
  assert.deepEqual(subtractFractions(makeFraction(3, 4), makeFraction(1, 2)), { n: 1, d: 4 });
  assert.deepEqual(subtractFractions(makeFraction(1, 4), makeFraction(1, 2)), { n: -1, d: 4 });
});

test('násobení a dělení zlomků', () => {
  assert.deepEqual(multiplyFractions(makeFraction(2, 3), makeFraction(3, 4)), { n: 1, d: 2 });
  assert.deepEqual(divideFractions(makeFraction(1, 2), makeFraction(1, 4)), { n: 2, d: 1 });
  assert.throws(() => divideFractions(makeFraction(1, 2), makeFraction(0)), /nulovým/);
});

test('porovnávání a hodnotová rovnost i pro nevykrácené zlomky', () => {
  assert.equal(compareFractions(makeFraction(3, 4), makeFraction(2, 3)), 1);
  assert.equal(compareFractions(makeFraction(1, 2), makeFraction(1, 2)), 0);
  assert.equal(compareFractions(makeFraction(1, 3), makeFraction(1, 2)), -1);
  // Nevykrácený vstup se počítá jako správná hodnota.
  assert.ok(fractionsEqual({ n: 4, d: 8 }, { n: 1, d: 2 }));
  assert.ok(isSimplified({ n: 1, d: 2 }));
  assert.ok(!isSimplified({ n: 4, d: 8 }));
});

test('formatNumber: celé číslo vs zlomek', () => {
  assert.equal(formatNumber(makeFraction(7)), '7');
  assert.equal(formatNumber(makeFraction(3, 4)), '3/4');
  assert.equal(formatNumber(-5), '-5');
});
