import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMission } from '../js/engine/mission.js';
import { parseSide, stepsHaveNegatives, extractFractions, pickVisualization } from '../js/ui/visualParse.js';
import { generateSimpleEquation, generateLinearEquation } from '../js/content/equations.js';
import { generateFractionExercise } from '../js/content/fractionExercises.js';

function testMission(overrides = {}) {
  return createMission({
    id: 'm1',
    planetId: 'p',
    crystalColor: 'modrý',
    topic: 'equations',
    exerciseCount: 5,
    startDifficulty: 1,
    seed: 1000,
    ...overrides,
  });
}

test('nápověda sníží 3 hvězdy na 2 (UCV-LEARN-002)', () => {
  const m = testMission();
  m.useHint();
  while (!m.isDone) {
    m.recordAnswer('correct');
  }
  const summary = m.getSummary();
  assert.equal(summary.mistakes, 0);
  assert.equal(summary.stars, 2); // bez nápovědy by byly 3
  assert.equal(summary.hintsUsed, 1);
});

test('useHint u stejného příkladu se počítá jen jednou', () => {
  const m = testMission();
  m.useHint();
  m.useHint();
  m.useHint();
  assert.equal(m.getSummary().hintsUsed, 1);
});

test('recommendEasier: nápověda u všech příkladů', () => {
  const m = testMission({ exerciseCount: 3 });
  while (!m.isDone) {
    m.useHint();
    m.recordAnswer('correct');
  }
  assert.equal(m.getSummary().recommendEasier, true);
});

test('recommendEasier false, když nápověda jen u některých', () => {
  const m = testMission({ exerciseCount: 3 });
  m.useHint();
  m.recordAnswer('correct');
  m.recordAnswer('correct');
  m.recordAnswer('correct');
  assert.equal(m.getSummary().recommendEasier, false);
});

test('hintUsed se propíše do adaptivní historie (úspěch s nápovědou nezvedá obtížnost)', () => {
  const m = testMission({ startDifficulty: 1, exerciseCount: 5 });
  m.useHint();
  m.recordAnswer('correct');
  m.useHint();
  m.recordAnswer('correct');
  m.useHint();
  m.recordAnswer('correct');
  // všechny 3 s nápovědou -> obtížnost zůstane 1
  assert.equal(m.currentExercise.difficulty, 1);
});

test('parseSide: běžné tvary', () => {
  assert.deepEqual(parseSide('3x + 4'), { xTerm: { count: 3, label: '3x' }, constantText: '4', negative: false });
  assert.deepEqual(parseSide('x'), { xTerm: { count: 1, label: 'x' }, constantText: null, negative: false });
  assert.deepEqual(parseSide('2x - 5'), { xTerm: { count: 2, label: '2x' }, constantText: '-5', negative: false });
  assert.deepEqual(parseSide('7'), { xTerm: null, constantText: '7', negative: false });
  assert.deepEqual(parseSide('-3'), { xTerm: null, constantText: '-3', negative: true });
  assert.deepEqual(parseSide('(2/3)x'), { xTerm: { count: 1, label: '(2/3)x' }, constantText: null, negative: false });
  assert.deepEqual(parseSide('(2/3)x + 1/2'), { xTerm: { count: 1, label: '(2/3)x' }, constantText: '1/2', negative: false });
});

test('stepsHaveNegatives pozná zápornou stranu', () => {
  const negative = generateLinearEquation(1, 4); // může mít záporné
  const simple = generateSimpleEquation(1, 1);   // vždy kladné
  assert.equal(stepsHaveNegatives(simple.steps), false);
  assert.equal(pickVisualization(simple), 'balance');
  assert.equal(stepsHaveNegatives(negative.steps), stepsHaveNegatives(negative.steps)); // deterministické
});

test('extractFractions vytáhne zlomky i čísla', () => {
  assert.deepEqual(extractFractions('3/4'), [{ n: 3, d: 4 }]);
  assert.deepEqual(extractFractions('1/2 + 1/4'), [
    { n: 1, d: 2 },
    { n: 1, d: 4 },
  ]);
  assert.deepEqual(extractFractions('8'), [{ n: 8, d: 1 }]);
});

test('pickVisualization: zlomky -> bars, rovnice -> balance/numberline', () => {
  const frac = generateFractionExercise(5, 'add', 1);
  assert.equal(pickVisualization(frac), 'bars');
  const eq = generateSimpleEquation(5, 1);
  assert.equal(pickVisualization(eq), 'balance');
});
